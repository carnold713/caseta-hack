"""Calls and texts on the lights: the phone (mobile/, CallsListener) tells the hub, the hub picks the lights, the
pattern and the colour from settings.alerts (hub/alerts.js), and sends an "alert" command here.

  * A pattern is one of four: "flash" (on and off), "breathe" (a slow swell), "alternate" (two colours in turn) and
    "glow" (the colour, held). A text plays its pattern for a few seconds; a call keeps it up until the phone says
    the call was answered or is over (or CALL_MAX_S, whichever comes first).
  * Every light shows it at the same moment. One player runs while any alert is up, on one clock, and each kind of
    light is reached the fastest way it has:
      - Hue colour lights are streamed to, all of them in one stream (Hue's entertainment mode, as screen sync does),
        so they change in the same instant. An area holding exactly them is used, or made ("Caseta alerts").
      - A light already following the PC's screen is streamed to through screen sync's own stream (its overlay).
      - A Nanoleaf is streamed to through its own streaming mode (nanostream.py).
      - Everything else (a Lutron dimmer, a Hue white bulb, a Hue colour light the stream could not take) is sent
        each step as a command, a moment early (LEAD_S) so it lands when the streams change, and a swell is sent
        as a fade timed to end on the beat. These show brightness only; "two colours" is bright and dim in turn.
  * A newer alert shows over an older one on the same lights (a text during a call) and the older carries on
    after. When none is left, every light goes back exactly as it was: on or off, brightness, colour or white.
  * A person's command for a light that is showing one (the app, a remote, a routine) ends it first, so the command
    is heard, and that light is not put back (yield_for).
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

import huestream
import nanostream
from color import GAMUT_C, hex_to_xy

LOG = logging.getLogger("alerts")

PATTERNS = ("flash", "breathe", "alternate", "glow")
TEXT_S = 3.5             # how long a text plays its pattern
CALL_MAX_S = 60.0        # a call the phone never says has stopped ringing
LOW = 0.15               # how far a breath falls, as a share of full
DIM = 0.4                # "two colours" on a light without colour: bright, then this
HZ = 50                  # how often the streams are sent a frame
START_S = 0.25           # from the streams being ready to the first beat: the commands go out ahead of it
LEAD_S = {"hue": 0.06, "lutron": 0.15}   # how long a command takes to show, per kind of light
AREA_NAME = "Caseta alerts"

# Each pattern is one period of keyframes: (time, colour 0 or 1, brightness, swell). A swell is reached by a straight
# fade from the keyframe before it; any other keyframe is a step.
KEYS: Dict[str, Tuple[float, List[Tuple[float, int, float, bool]]]] = {
    "flash": (0.7, [(0.0, 0, 1.0, False), (0.35, 0, 0.0, False)]),
    "breathe": (1.6, [(0.0, 0, 1.0, True), (0.8, 0, LOW, True)]),
    "alternate": (1.2, [(0.0, 0, 1.0, False), (0.6, 1, 1.0, False)]),
    "glow": (3600.0, [(0.0, 0, 1.0, False)]),
}

# sRGB -> linear light (screensync.py and the streams work in linear light) and back
_LIN = [((i / 255) / 12.92) if i <= 10 else (((i / 255) + 0.055) / 1.055) ** 2.4 for i in range(256)]


def _enc(v: float) -> float:
    v = max(0.0, min(1.0, v))
    return v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055


def _rgb(hex_str: str) -> Tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def at(pattern: str, colors: List[str], t: float) -> Tuple[str, float]:
    """The colour and brightness (0..1) a pattern shows t seconds in: what the streams are sent."""
    period, keys = KEYS.get(pattern, KEYS["flash"])
    c = [colors[0], colors[1] if len(colors) > 1 else colors[0]]
    t %= period
    n = len(keys)
    k = max(i for i in range(n) if keys[i][0] <= t)
    t0, ci, b0, _sw = keys[k]
    nxt = keys[(k + 1) % n]
    if nxt[3] and n > 1:   # swelling towards the next one
        t1 = nxt[0] if k + 1 < n else nxt[0] + period
        return c[ci], b0 + (nxt[2] - b0) * (t - t0) / (t1 - t0)
    return c[ci], b0


def initial(pattern: str) -> Tuple[int, float]:
    _p, keys = KEYS.get(pattern, KEYS["flash"])
    return keys[0][1], keys[0][2]


def events(pattern: str):
    """The commands a pattern is, for a light reached by commands: forever, (send at t, colour, brightness, fade s).
    A step is sent on its keyframe; a swell is sent on the keyframe before it, fading until its own."""
    period, keys = KEYS.get(pattern, KEYS["flash"])
    n = len(keys)
    one = []
    for i, (t, ci, b, swell) in enumerate(keys):
        if swell and n > 1:
            prev = keys[i - 1][0] if i > 0 else keys[-1][0] - period
            one.append((prev % period, ci, b, t - prev))
        else:
            one.append((t, ci, b, 0.0))
    one.sort()
    cycle = 0
    while True:
        for s, ci, b, fade in one:
            yield cycle * period + s, ci, b, fade
        cycle += 1


def linear(hex_str: str, bri: float) -> Tuple[float, float, float]:
    r, g, b = _rgb(hex_str)
    return _LIN[r] * bri, _LIN[g] * bri, _LIN[b] * bri


class Alerts:
    def __init__(self, hue: Any, sync: Any = None, nanoleaf: Any = None, lutron: Callable[[], Any] = lambda: None,
                 clock: Callable[[], float] = time.monotonic, stream_port: int = huestream.PORT,
                 nano_port: Optional[int] = None) -> None:
        self.hue = hue
        self.sync = sync
        self.nanoleaf = nanoleaf
        self.lutron = lutron
        self.clock = clock
        self.stream_port = stream_port
        self.nano_port = nano_port
        self._alerts: Dict[str, dict] = {}       # alert id -> {pattern, colors, lights, until, t0}; newest last
        self._task: Optional[asyncio.Task] = None
        self._lights: Dict[str, str] = {}        # light -> how it is reached: overlay | stream | nano | hue | lutron
        self._before: Dict[str, dict] = {}       # light -> how it was before
        self._ended: set = set()                 # lights a person took back: not put back
        self._wake = asyncio.Event()
        self._stop = False

    # ----- what the rest of the connector asks -----
    def owns(self, device_id: str) -> bool:
        return device_id in self._lights

    async def yield_for(self, device_id: str) -> None:
        """A person's command for a light showing an alert: the alerts end first (a stream would keep the command
        from being heard), and that light stays as the command leaves it."""
        if device_id not in self._lights or self._task is None:
            return
        LOG.info("alerts: %s was changed by hand, ending", device_id)
        self._ended.add(device_id)
        self._alerts.clear()
        self._stop = True
        self._wake.set()
        try:
            await asyncio.shield(self._task)
        except Exception:  # noqa: BLE001
            pass

    def status(self) -> Dict[str, Any]:
        return {"playing": list(self._alerts), "lights": sorted(self._lights)}

    # ----- start and stop -----
    async def start(self, action: dict) -> Dict[str, Any]:
        aid = str(action.get("id") or "alert")[:64]
        pattern = action.get("pattern") if action.get("pattern") in PATTERNS else "flash"
        colors = [c.lower() for c in (action.get("colors") or []) if isinstance(c, str) and len(c) == 7 and c.startswith("#")][:2] or ["#ffffff"]
        seconds = max(0.5, min(CALL_MAX_S, float(action.get("seconds") or TEXT_S)))
        lights = [d for d in dict.fromkeys(action.get("lights") or []) if self._kind(d)]
        if action.get("only_on"):
            lights = [d for d in lights if d in self._lights or self._is_on(d)]
        if not lights:
            return {"lights": 0}
        self._alerts.pop(aid, None)
        self._alerts[aid] = {"pattern": pattern, "colors": colors, "lights": set(lights), "seconds": seconds, "t0": None}
        LOG.info("alerts: %s on %d light(s), %s in %s", aid, len(lights), pattern, ", ".join(colors))
        if self._task is None or self._task.done():
            self._stop = False
            self._ended = set()
            self._task = asyncio.get_running_loop().create_task(self._run())
        self._wake.set()
        return {"lights": len(lights)}

    async def stop(self, aid: str) -> Dict[str, Any]:
        if self._alerts.pop(str(aid), None) is None:
            return {"stopped": False}
        self._wake.set()
        return {"stopped": True}

    # ----- the player -----
    def _kind(self, d: str) -> Optional[str]:
        if d.startswith("hue_"):
            return "hue" if d in (getattr(self.hue, "devices", {}) or {}) else None
        if d.startswith("nanoleaf_"):
            return "nano" if self.nanoleaf is not None and d in (getattr(self.nanoleaf, "devices", {}) or {}) else None
        bridge = self.lutron()
        dev = (getattr(bridge, "devices", None) or {}).get(d) if bridge is not None else None
        return "lutron" if dev and dev.get("type") in _DIMMERS else None

    def _dev(self, d: str) -> dict:
        k = self._kind(d)
        if k == "hue":
            return self.hue.devices.get(d) or {}
        if k == "nano":
            return self.nanoleaf.devices.get(d) or {}
        bridge = self.lutron()
        return (bridge.devices.get(d) if bridge is not None else None) or {}

    def _is_on(self, d: str) -> bool:
        if self.sync is not None and self.sync.owns(d):
            return True
        dev = self._dev(d)
        return bool(dev.get("_on", (dev.get("current_state") or 0) > 0))

    async def _run(self) -> None:
        stream: Optional[_HueStream] = None
        nanos: Dict[str, nanostream.NanoStream] = {}
        sends: Dict[str, dict] = {}          # light reached by commands -> {"alert", "events", "next", "task"}
        try:
            # every light the alerts hold, sorted by how it is reached; the streams started before the first beat
            want = set().union(*(a["lights"] for a in self._alerts.values())) if self._alerts else set()
            colour_hue = []
            for d in sorted(want):
                kind = self._kind(d)
                if kind is None:
                    continue
                self._before[d] = self._snapshot(d, kind)
                if self.sync is not None and self.sync.owns(d):
                    self._lights[d] = "overlay"
                    self.sync.overlay[d] = lambda now, d=d: self._linear(d, now)
                elif kind == "hue":
                    self._lights[d] = "hue"
                    if (self.hue.devices[d].get("color") and not (self.sync is not None and getattr(self.sync, "streaming", False))):
                        colour_hue.append(d)
                elif kind == "nano":
                    self._lights[d] = "nano"
                else:
                    self._lights[d] = "lutron"
            starts = []
            if colour_hue:
                stream = _HueStream(self.hue, colour_hue, self.stream_port)
                starts.append(stream.start())
            for d in [x for x, k in self._lights.items() if k == "nano"]:
                ns = nanostream.NanoStream(self.nanoleaf, d, port=self.nano_port)
                nanos[d] = ns
                starts.append(ns.start())
            results = await asyncio.gather(*starts, return_exceptions=True)
            if stream is not None:
                if isinstance(results[0], Exception):
                    LOG.warning("alerts: no Hue stream (%s); sending commands instead", results[0])
                    stream = None
                else:
                    for d in stream.lights:
                        self._lights[d] = "stream"
            for (d, ns), r in zip(list(nanos.items()), results[1 if colour_hue else 0:]):
                if isinstance(r, Exception):
                    LOG.warning("alerts: %s would not stream (%s); left out", d, r)
                    nanos.pop(d)
                    self._lights.pop(d, None)
                    self._before.pop(d, None)
            beat0 = self.clock() + START_S
            for a in self._alerts.values():
                a["t0"] = a["t0"] or beat0
            period = 1 / HZ
            frame = 0
            while not self._stop:
                now = self.clock()
                for aid in [k for k, a in self._alerts.items() if a["t0"] is not None and now - a["t0"] >= a["seconds"]]:
                    self._alerts.pop(aid, None)
                if not self._alerts:
                    break
                for a in self._alerts.values():   # one that came in while playing starts on the next beat
                    if a["t0"] is None:
                        a["t0"] = now + START_S
                for d in [x for x in set().union(*(a["lights"] for a in self._alerts.values())) if x not in self._lights]:
                    await self._take_late(d)
                # the streams: every frame
                if stream is not None:
                    stream.send({d: self._encoded(d, now) for d in stream.lights})
                if nanos and frame % 2 == 0:
                    for d, ns in nanos.items():
                        o = self._encoded(d, now)
                        ns.send([(pid, *o) for pid, _x, _y in ns.panels])
                # the lights reached by commands: each step a moment before its beat
                for d, how in self._lights.items():
                    if how in ("hue", "lutron"):
                        self._due(d, how, sends, now)
                frame += 1
                self._wake.clear()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=max(0.0, period - (self.clock() - now)))
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001
            LOG.warning("alerts: %s", exc)
        finally:
            await self._finish(stream, nanos, sends)
            # one that came in while the lights were being put back starts again from them
            if self._alerts and not self._stop:
                self._task = asyncio.get_running_loop().create_task(self._run())

    async def _take_late(self, d: str) -> None:
        """A light an alert brought in while others were playing: reached by commands (the streams are set)."""
        kind = self._kind(d)
        if kind is None or kind == "nano":
            for a in self._alerts.values():
                a["lights"].discard(d)
            return
        self._before[d] = self._snapshot(d, kind)
        self._lights[d] = "lutron" if kind == "lutron" else "hue"

    def _top(self, d: str) -> Optional[dict]:
        for a in reversed(list(self._alerts.values())):
            if d in a["lights"] and a["t0"] is not None:
                return a
        return None

    def _linear(self, d: str, now: float) -> Tuple[float, float, float]:
        """What a streamed light shows now, in linear light (screen sync's overlay takes it so)"""
        a = self._top(d)
        if a is None:
            return (0.0, 0.0, 0.0)
        if now < a["t0"]:   # the first beat is a moment away: hold the first keyframe
            ci, b = initial(a["pattern"])
            return linear(a["colors"][min(ci, len(a["colors"]) - 1)], b)
        return linear(*at(a["pattern"], a["colors"], now - a["t0"]))

    def _encoded(self, d: str, now: float) -> Tuple[float, float, float]:
        o = self._linear(d, now)
        return _enc(o[0]), _enc(o[1]), _enc(o[2])

    def _due(self, d: str, how: str, sends: Dict[str, dict], now: float) -> None:
        a = self._top(d)
        if a is None:
            return
        s = sends.get(d)
        if s is None or s["alert"] is not a:
            s = {"alert": a, "events": events(a["pattern"]), "next": None, "seq": (s or {}).get("seq", 0)}
            s["next"] = next(s["events"])
            sends[d] = s
            # what it should be showing on the first beat, at once, unless the first command is that already
            ci, b = initial(a["pattern"])
            if not (s["next"][0] == 0.0 and s["next"][3] == 0.0):
                self._fire(d, how, s, a["colors"][min(ci, len(a["colors"]) - 1)], b, 0.0)
        lead = LEAD_S.get(how, 0.0)
        fire = None
        while a["t0"] + s["next"][0] - lead <= now:
            fire = s["next"]
            s["next"] = next(s["events"])
        if fire is not None:
            _t, ci, b, fade = fire
            self._fire(d, how, s, a["colors"][min(ci, len(a["colors"]) - 1)], b, fade)

    def _fire(self, d: str, how: str, s: dict, hex_str: str, bri: float, fade: float) -> None:
        s["seq"] += 1
        seq = s["seq"]

        async def go() -> None:
            # one at a time for each light, and only the newest: a slow answer is skipped over, never sent late
            prev = s.get("task")
            if prev is not None and not prev.done():
                try:
                    await prev
                except Exception:  # noqa: BLE001
                    pass
            if s["seq"] != seq or d not in self._lights:
                return
            try:
                if how == "lutron":
                    await self._lutron_show(d, bri, fade, colour_two=hex_str.lower() != s["alert"]["colors"][0])
                else:
                    await self._hue_show(d, hex_str, bri, fade, colour_two=hex_str.lower() != s["alert"]["colors"][0])
            except Exception as exc:  # noqa: BLE001
                LOG.info("alerts: %s missed a step (%s)", d, exc)
        s["task"] = asyncio.get_running_loop().create_task(go())

    async def _finish(self, stream: Optional["_HueStream"], nanos: Dict[str, nanostream.NanoStream], sends: Dict[str, dict]) -> None:
        for s in sends.values():
            t = s.get("task")
            if t is not None and not t.done():
                t.cancel()
        if self.sync is not None:
            for d, how in self._lights.items():
                if how == "overlay":
                    self.sync.overlay.pop(d, None)
        if stream is not None:
            await stream.stop()
        back = {d: (how, self._before.get(d)) for d, how in self._lights.items() if d not in self._ended}
        for d, ns in nanos.items():
            await ns.stop(restore=d not in self._ended)
        self._lights, self._before = {}, {}
        await asyncio.gather(*(self._restore(d, how, snap) for d, (how, snap) in back.items() if how in ("stream", "hue", "lutron")),
                             return_exceptions=True)
        LOG.info("alerts: over, %d light(s) put back", len([1 for how, _s in back.values() if how != "overlay"]))

    # ----- one light -----
    def _snapshot(self, d: str, kind: str) -> dict:
        dev = self._dev(d)
        on = bool(dev.get("_on", (dev.get("current_state") or 0) > 0))
        snap: Dict[str, Any] = {"on": on, "bri": dev.get("_bri") or dev.get("current_state") or 100, "level": dev.get("current_state") or 0}
        if dev.get("color_mode") == "ct" and (dev.get("ct") or {}).get("mirek"):
            snap["mirek"] = int(dev["ct"]["mirek"])
        elif (dev.get("color") or {}).get("xy"):
            snap["xy"] = list(dev["color"]["xy"])
        return snap

    async def _hue_show(self, d: str, hex_str: str, bri: float, fade: float, colour_two: bool = False) -> None:
        dev = self.hue.devices.get(d)
        if not dev:
            return
        body: Dict[str, Any] = {"dynamics": {"duration": int(fade * 1000)}}
        if not dev.get("color") and colour_two:
            bri *= DIM
        if bri <= 0:
            body["on"] = {"on": False}
        else:
            body["on"] = {"on": True}
            if dev.get("type") == "HueLight":
                body["dimming"] = {"brightness": max(1.0, min(100.0, round(bri * 100, 1)))}
            if dev.get("color"):
                x, y = hex_to_xy(hex_str, dev["color"].get("gamut") or GAMUT_C)
                body["color"] = {"xy": {"x": x, "y": y}}
        # straight to the bridge, past the pacing queue: the queue would send the lamps a tenth of a second apart
        await self.hue._put(f"/clip/v2/resource/light/{dev['zone']}", body)  # noqa: SLF001

    async def _lutron_show(self, d: str, bri: float, fade: float, colour_two: bool = False) -> None:
        bridge = self.lutron()
        if bridge is None:
            return
        level = int(round(max(0.0, min(1.0, bri * (DIM if colour_two else 1.0))) * 100))
        await bridge.set_value(d, level, fade_time=timedelta(seconds=fade))

    async def _restore(self, d: str, how: str, snap: Optional[dict]) -> None:
        if not snap:
            return
        try:
            if how == "lutron":
                bridge = self.lutron()
                if bridge is not None:
                    await bridge.set_value(d, int(snap["level"]), fade_time=timedelta(seconds=0.4 if snap["on"] else 0))
                return
            dev = self.hue.devices.get(d)
            if not dev:
                return
            # its colour and brightness first, lit (an off lamp keeps what it was last given, and would come on next
            # time in the alert's colour), then off again if it was off
            body: Dict[str, Any] = {"on": {"on": True}, "dynamics": {"duration": 400 if snap["on"] else 0}}
            if dev.get("type") == "HueLight":
                body["dimming"] = {"brightness": max(1.0, min(100.0, float(snap["bri"])))}
            if snap.get("mirek"):
                body["color_temperature"] = {"mirek": snap["mirek"]}
            elif snap.get("xy"):
                body["color"] = {"xy": {"x": snap["xy"][0], "y": snap["xy"][1]}}
            await self.hue._put_light(d, body)  # noqa: SLF001
            if not snap["on"]:
                await self.hue._put_light(d, {"on": {"on": False}, "dynamics": {"duration": 0}})  # noqa: SLF001
        except Exception as exc:  # noqa: BLE001
            LOG.warning("alerts: putting %s back: %s", d, exc)


class _HueStream:
    """The Hue colour lights of an alert in one entertainment stream: they change together, many times a second."""

    def __init__(self, hue: Any, lights: List[str], port: int) -> None:
        self.hue = hue
        self.want = list(lights)
        self.port = port
        self.lights: List[str] = []
        self.area: Optional[dict] = None
        self.chan_light: Dict[int, str] = {}
        self.dtls: Optional[huestream.DtlsPsk] = None
        self.seq = 0

    async def start(self) -> None:
        import screensync   # the area and channel helpers it shares with screen sync
        hue = self.hue
        if not getattr(hue, "clientkey", None):
            raise RuntimeError("the Hue bridge has no streaming key")
        self.area = await screensync.area_for(hue, self.want, AREA_NAME)
        self.chan_light = await screensync.channel_lights(hue, self.area, self.want)
        await hue._put(f"/clip/v2/resource/entertainment_configuration/{self.area['id']}", {"action": "start"})  # noqa: SLF001
        identity = None
        try:
            identity = await hue.app_id()
        except Exception:  # noqa: BLE001
            pass
        self.dtls = huestream.DtlsPsk(hue.host, identity or hue.key, hue.clientkey, port=self.port)
        try:
            await self.dtls.connect()
        except Exception:
            await self.stop()
            raise
        self.lights = sorted(set(self.chan_light.values()))

    def send(self, colours: Dict[str, Tuple[float, float, float]]) -> None:
        if self.dtls is None or self.area is None:
            return
        out = [(ch, *colours[d]) for ch, d in self.chan_light.items() if d in colours]
        self.seq = (self.seq + 1) & 0xFF
        self.dtls.send(huestream.message(self.area["id"], self.seq, out))

    async def stop(self) -> None:
        if self.dtls is not None:
            self.dtls.close()
            self.dtls = None
        if self.area is not None:
            try:
                await self.hue._put(f"/clip/v2/resource/entertainment_configuration/{self.area['id']}", {"action": "stop"})  # noqa: SLF001
            except Exception as exc:  # noqa: BLE001
                LOG.warning("alerts: stopping the stream: %s", exc)


_DIMMERS = {"WallDimmer", "PlugInDimmer", "InLineDimmer", "SunnataDimmer", "TempInWallPaddleDimmer", "WallDimmerWithPreset",
            "Dimmed", "DivaSmartDimmer", "PowPak0-10V"}
