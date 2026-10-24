"""Calls and texts on the lights: the phone (mobile/, CallsListener) tells the hub, the hub picks the lights, the
pattern and the colour from settings.alerts (hub/alerts.js), and sends an "alert" command here.

  * A pattern is one of four: "flash" (on and off), "breathe" (a slow swell), "alternate" (two colours in turn) and
    "glow" (the colour, held). A text plays its pattern for a few seconds; a call keeps it up until the phone says
    the call was answered or is over (or CALL_MAX_S, whichever comes first).
  * Afterwards every light is put back as it was: on or off, brightness, colour or white. What it was is taken from
    the Hue device dict (kept current by the bridge's event stream) the moment the light is first taken, so a text
    arriving during a call does not take the call's colours for the light's own.
  * A light following the PC's screen (screensync.py) is streamed to: the bridge ignores ordinary commands while a
    stream runs, so its pattern goes into the stream instead (ScreenSync.overlay), and when it ends the screen's
    colours simply come back. Every other Hue light is sent its pattern step by step.
  * A person's command for a light (the app, a remote, a routine) wins: that light leaves the alert at once and is
    not put back afterwards, since the command decides (yield_for).
"""
from __future__ import annotations

import asyncio
import logging
import math
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from color import GAMUT_C, hex_to_xy

LOG = logging.getLogger("alerts")

PATTERNS = ("flash", "breathe", "alternate", "glow")
TEXT_S = 3.5             # how long a text plays its pattern
CALL_MAX_S = 60.0        # a call the phone never says has stopped ringing
LOW = 0.15               # how far a breath falls, as a share of full

# sRGB -> linear light, for the stream (screensync.py works in linear light)
_LIN = [((i / 255) / 12.92) if i <= 10 else (((i / 255) + 0.055) / 1.055) ** 2.4 for i in range(256)]


def _rgb(hex_str: str) -> Tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def at(pattern: str, colors: List[str], t: float) -> Tuple[str, float]:
    """The colour and brightness (0..1) a pattern shows t seconds in: what a streamed light is sent."""
    c1 = colors[0]
    c2 = colors[1] if len(colors) > 1 else colors[0]
    if pattern == "flash":
        return c1, 1.0 if (t % 0.7) < 0.35 else 0.0
    if pattern == "breathe":
        return c1, LOW + (1 - LOW) * (0.5 - 0.5 * math.cos(2 * math.pi * (t / 1.6 + 0.5)))
    if pattern == "alternate":
        return (c1 if (t % 1.2) < 0.6 else c2), 1.0
    return c1, 1.0


def steps(pattern: str, colors: List[str]) -> List[Tuple[str, float, float, float]]:
    """The same pattern as commands for a light that is not streamed: (colour, brightness, fade s, hold s), in turn.
    Hue asks for no more than ten light commands a second, so a step is never shorter than a third of a second."""
    c1 = colors[0]
    c2 = colors[1] if len(colors) > 1 else colors[0]
    if pattern == "flash":
        return [(c1, 1.0, 0.0, 0.35), (c1, 0.0, 0.0, 0.35)]
    if pattern == "breathe":
        return [(c1, 1.0, 0.7, 0.8), (c1, LOW, 0.7, 0.8)]
    if pattern == "alternate":
        return [(c1, 1.0, 0.15, 0.6), (c2, 1.0, 0.15, 0.6)]
    return [(c1, 1.0, 0.3, 3600.0)]


def linear(hex_str: str, bri: float) -> Tuple[float, float, float]:
    r, g, b = _rgb(hex_str)
    return _LIN[r] * bri, _LIN[g] * bri, _LIN[b] * bri


class Alerts:
    def __init__(self, hue: Any, sync: Any = None, clock: Callable[[], float] = time.monotonic) -> None:
        self.hue = hue
        self.sync = sync
        self.clock = clock
        self._runs: Dict[str, dict] = {}          # alert id -> {"task", "lights": set}
        self._owner: Dict[str, List[str]] = {}    # light -> the alerts holding it, the one showing on it last
        self._before: Dict[str, dict] = {}        # light -> how it was before any alert took it

    # ----- what the rest of the connector asks -----
    def owns(self, device_id: str) -> bool:
        return device_id in self._owner

    def yield_for(self, device_id: str) -> None:
        """A person's command for this light: it leaves whatever alert it is in, and is not put back."""
        if device_id in self._owner:
            LOG.info("alerts: %s was changed by hand, leaving it", device_id)
            self._release(device_id)

    def status(self) -> Dict[str, Any]:
        return {"playing": sorted(self._runs), "lights": sorted(self._owner)}

    # ----- start and stop -----
    async def start(self, action: dict) -> Dict[str, Any]:
        aid = str(action.get("id") or "alert")[:64]
        pattern = action.get("pattern") if action.get("pattern") in PATTERNS else "flash"
        colors = [c for c in (action.get("colors") or []) if isinstance(c, str) and len(c) == 7 and c.startswith("#")][:2] or ["#ffffff"]
        seconds = max(0.5, min(CALL_MAX_S, float(action.get("seconds") or TEXT_S)))
        devices = getattr(self.hue, "devices", {}) or {}
        lights = [d for d in dict.fromkeys(action.get("lights") or []) if d in devices]
        if action.get("only_on"):
            lights = [d for d in lights if self._is_on(d)]
        if not lights:
            return {"lights": 0}
        old = self._runs.get(aid)
        if old:
            old["task"].cancel()
        streamed = [d for d in lights if self.sync is not None and self.sync.owns(d)]
        sent = [d for d in lights if d not in streamed]
        for d in lights:
            if d not in self._owner:
                self._before[d] = self._snapshot(devices[d])
            stack = self._owner.setdefault(d, [])
            if aid in stack:
                stack.remove(aid)
            stack.append(aid)
        run = {"lights": set(lights), "pattern": pattern, "colors": colors, "t0": self.clock()}
        self._runs[aid] = run
        for d in streamed:
            self.sync.overlay[d] = lambda now, d=d: self._streamed(d, now)
        run["task"] = asyncio.get_running_loop().create_task(self._play(aid, run, seconds, sent))
        LOG.info("alerts: %s on %d light(s), %s in %s", aid, len(lights), pattern, ", ".join(colors))
        return {"lights": len(lights), "streamed": len(streamed)}

    async def stop(self, aid: str) -> Dict[str, Any]:
        run = self._runs.get(str(aid))
        if not run:
            return {"stopped": False}
        run["task"].cancel()
        try:
            await run["task"]
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
        return {"stopped": True}

    def _top(self, d: str) -> Optional[str]:
        stack = self._owner.get(d)
        return stack[-1] if stack else None

    def _streamed(self, d: str, now: float) -> Tuple[float, float, float]:
        """What a light following the screen is sent: the pattern of the alert showing on it"""
        run = self._runs.get(self._top(d) or "")
        if not run:
            return (0.0, 0.0, 0.0)
        return linear(*at(run["pattern"], run["colors"], now - run["t0"]))

    async def _play(self, aid: str, run: dict, seconds: float, sent: List[str]) -> None:
        t0 = run["t0"]
        try:
            seq = steps(run["pattern"], run["colors"])
            k = 0
            while self.clock() - t0 < seconds:
                mine = [d for d in sent if self._top(d) == aid]
                if not any(aid in self._owner.get(d, ()) for d in run["lights"]):
                    break
                hex_str, bri, fade, hold = seq[k % len(seq)]
                k += 1
                await asyncio.gather(*(self._show(d, hex_str, bri, fade) for d in mine), return_exceptions=True)
                await asyncio.sleep(max(0.0, min(hold, seconds - (self.clock() - t0))))
        except asyncio.CancelledError:
            pass
        finally:
            replaced = self._runs.get(aid) is not run   # started again under the same id: the new one has them
            if not replaced:
                del self._runs[aid]
            back: List[str] = []
            for d in run["lights"]:
                stack = self._owner.get(d)
                if not stack or aid not in stack or (replaced and d in self._runs[aid]["lights"]):
                    continue
                stack.remove(aid)
                if not stack:   # nothing else showing on it: back as it was. Otherwise the alert under it carries on
                    back.append(d)
            snaps = {d: self._before.get(d) for d in back}
            for d in back:
                self._release(d)
            await asyncio.gather(*(self._restore(d, snaps[d]) for d in back if d in sent), return_exceptions=True)

    def _release(self, d: str) -> None:
        self._owner.pop(d, None)
        self._before.pop(d, None)
        if self.sync is not None:
            self.sync.overlay.pop(d, None)

    # ----- one light -----
    def _is_on(self, d: str) -> bool:
        if self.sync is not None and self.sync.owns(d):
            return True
        dev = (getattr(self.hue, "devices", {}) or {}).get(d) or {}
        return bool(dev.get("_on", (dev.get("current_state") or 0) > 0))

    @staticmethod
    def _snapshot(dev: dict) -> dict:
        on = bool(dev.get("_on", (dev.get("current_state") or 0) > 0))
        snap: Dict[str, Any] = {"on": on, "bri": dev.get("_bri") or dev.get("current_state") or 100}
        if dev.get("color_mode") == "ct" and (dev.get("ct") or {}).get("mirek"):
            snap["mirek"] = int(dev["ct"]["mirek"])
        elif (dev.get("color") or {}).get("xy"):
            snap["xy"] = list(dev["color"]["xy"])
        return snap

    async def _show(self, d: str, hex_str: str, bri: float, fade: float) -> None:
        dev = self.hue.devices.get(d)
        if not dev or self._owner.get(d) is None:
            return
        body: Dict[str, Any] = {"dynamics": {"duration": int(fade * 1000)}}
        if bri <= 0:
            body["on"] = {"on": False}
        else:
            body["on"] = {"on": True}
            if dev.get("type") == "HueLight":
                body["dimming"] = {"brightness": max(1.0, min(100.0, round(bri * 100, 1)))}
            if dev.get("color"):
                x, y = hex_to_xy(hex_str, dev["color"].get("gamut") or GAMUT_C)
                body["color"] = {"xy": {"x": x, "y": y}}
        await self.hue._put_light(d, body)  # noqa: SLF001

    async def _restore(self, d: str, snap: Optional[dict]) -> None:
        dev = self.hue.devices.get(d)
        if not snap or not dev:
            return
        # its colour and brightness first, lit (an off lamp keeps what it was last given, and would come on next time
        # in the alert's colour), then off again if it was off
        body: Dict[str, Any] = {"on": {"on": True}, "dynamics": {"duration": 400 if snap["on"] else 0}}
        if dev.get("type") == "HueLight":
            body["dimming"] = {"brightness": max(1.0, min(100.0, float(snap["bri"])))}
        if snap.get("mirek"):
            body["color_temperature"] = {"mirek": snap["mirek"]}
        elif snap.get("xy"):
            body["color"] = {"xy": {"x": snap["xy"][0], "y": snap["xy"][1]}}
        try:
            await self.hue._put_light(d, body)  # noqa: SLF001
            if not snap["on"]:
                await self.hue._put_light(d, {"on": {"on": False}, "dynamics": {"duration": 0}})  # noqa: SLF001
        except Exception as exc:  # noqa: BLE001
            LOG.warning("alerts: putting %s back: %s", d, exc)
