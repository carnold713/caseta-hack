"""Nanoleaf Light Panels (Aurora), Canvas and Shapes controllers, spoken to directly on the home network.

Unlike Hue there is no bridge: every physical controller has its own local HTTP API on port 16021, its
own pairing and its own auth token, and a home may have more than one (a set in the office, another in
a bedroom). This module holds a *list* of paired controllers, one entry per device, saved to
DATA_DIR/nanoleaf.json as [{host, token, serial, name, model}, ...].

Pairing: hold the power button on the physical controller for 5-7 seconds until its panels flash, then
within about 30 seconds POST /api/v1/new (no body); the controller hands back {"auth_token": "..."}.
Too early or too late gives a 401 and the panels drop out of pairing mode, which is why `pair()` keeps
retrying for a while rather than trying once: the person presses the button, then taps Connect, and the
two do not land in the same instant.

State comes back as {name, serialNo, model, firmwareVersion, state: {on, brightness, hue, sat, ct,
colorMode}, effects: {...}}. brightness is already 0-100, hue is 0-360, sat is 0-100, and ct is Kelvin
directly (not mireds); its min/max are read from the live response every time, never hardcoded, because
they differ by model. Effects (built-in animations) are a natural next step but are not modelled here.

Everything Nanoleaf is namespaced "nanoleaf_<serial>" so it sits beside the Caseta and Hue devices in
the same dictionaries the action runner already reads: a light is "nanoleaf_<serial>" (type
NanoleafLight), with no bridge-native room (a Nanoleaf panel's "area" is always None; it joins one of
the app's own rooms exactly like a plain Caseta device, by being filed into one by hand).

A light that can do colour or white temperature says so in its device dict exactly the way a Hue light
does: "color" is {"gamut": None, "xy": [x, y] or None} (Nanoleaf publishes no gamut of its own, so this
reuses the same GAMUT_C fallback the app already applies to a Hue light with none), "ct" is {"min":
mirek, "max": mirek, "mirek": current or None}, and "color_mode" is "ct", "xy" or None. hue.py's
color_state(d) is what turns this into what the app shows; it is already backend-agnostic and is reused
unchanged.

A note on "duration": Nanoleaf's brightness field accepts an optional duration sub-value, but the
official OpenAPI documentation (forum.nanoleaf.me / the Confluence-hosted spec it redirects to) was not
reachable from here to confirm its time unit with confidence, and third-party wrappers that expose it do
not document the unit either. Rather than risk a fade that runs for the wrong length of time on real
hardware, every state change this module sends is instant: no duration field is ever included.

A note on turning on: real controllers have been reported to drop "on" when it arrives bundled with
brightness or colour in the same PUT while the panel was off, which is consistent with an owner seeing a
brightness drag turn a dark panel on (many PUTs go out as the slider moves, so a later one gets through)
while a single toggle tap does not (it sends exactly one). So "on" always goes out as its own PUT first,
then brightness or colour follows as a second one, every time a call means to turn the light on. This
used to be conditional on this module's own cached belief that the light was off (`_was_off`), but that
cache is only ever refreshed by a poll (every POLL_SECONDS) or set optimistically by this module's own
prior command, never by anything the panel itself pushes: there is no event stream here (unlike Hue's
CLIP v2). A brightness-only PUT sent to a panel that is genuinely off can be silently accepted by real
firmware with no error, so the cache would then read "on" at the new level until the next poll corrects
it back, which looks exactly like a toggle turning a light on and then reverting a few seconds later.
Sending "on" unconditionally, every time, costs one small extra request against an already-on panel
(harmless and idempotent) and closes that gap for good.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import aiohttp

from color import GAMUT_C, hex_to_rgb, hsv_to_rgb, kelvin_to_mirek, mirek_to_kelvin, rgb_to_hsv, rgb_to_xy

LOG = logging.getLogger("nanoleaf")
PORT = 16021
PAIR_SECONDS = 40         # the panels stay in pairing mode for about 30s after the button is held; a little slack
POLL_SECONDS = 5          # no event stream here (unlike Hue's CLIP v2) and no LEAP subscription either, so this
                          # poll is the ONLY way a panel someone turned on by hand, or from Nanoleaf's own app,
                          # is ever noticed. Every other backend reports a change the moment it happens, so at 20s
                          # these lights were the one place the app could sit visibly wrong for a third of a
                          # minute. One small LAN GET per panel at 5s is cheap and keeps them in step.
VERIFY_TIMEOUT = 2.0      # how long a look at one panel may take when checking an off (see verify)


def nid(serial: str) -> str:
    return f"nanoleaf_{serial}"


def _serial_of(device_id: str) -> str:
    s = str(device_id)
    return s[len("nanoleaf_"):] if s.startswith("nanoleaf_") else s


class Nanoleaf:
    def __init__(self, data_dir: Path, on_state: Optional[Callable[[str], None]] = None, on_loaded: Optional[Callable[[], None]] = None,
                 send: Optional[Callable[[dict], None]] = None) -> None:
        self.file = data_dir / "nanoleaf.json"
        self.entries: List[dict] = []          # [{host, token, serial, name, model}, ...], saved to disk
        self.devices: Dict[str, dict] = {}     # nanoleaf_<serial> -> pylutron-shaped device dict
        self.errors: Dict[str, str] = {}       # serial -> the last error reaching it, so one dead panel does not hide the rest
        self.log: List[dict] = []              # every state-changing request, for "Show technical details" (see _note)
        self._on_state = on_state
        self._on_loaded = on_loaded
        self._send = send
        self._session: Optional[aiohttp.ClientSession] = None
        self._poll: Optional[asyncio.Task] = None
        try:
            saved = json.loads(self.file.read_text())
            if isinstance(saved, list):
                self.entries = [e for e in saved if isinstance(e, dict) and e.get("host") and e.get("token") and e.get("serial")]
        except Exception:  # noqa: BLE001
            pass

    # ----- state for the app -----
    @property
    def paired(self) -> bool:
        return bool(self.entries)

    def info(self) -> dict:
        return {
            "devices": [{"serial": e["serial"], "name": e.get("name") or "Nanoleaf", "model": e.get("model"),
                         "host": e["host"], "error": self.errors.get(e["serial"])} for e in self.entries],
            "count": len(self.entries),
            "live": bool(self._poll and not self._poll.done()),
            "log": self.log[-40:],
        }

    # ----- http -----
    def _sess(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
        return self._session

    @staticmethod
    def _url(host: str, token: str = "", path: str = "") -> str:
        # A bare address gets the controller's fixed port appended; one that already names its own port
        # (as a test's fake controller does) is used exactly as given.
        h = str(host)
        base = f"http://{h}/api/v1" if ":" in h else f"http://{h}:{PORT}/api/v1"
        if not token:
            return f"{base}/{path}" if path else base
        return f"{base}/{token}/{path}" if path else f"{base}/{token}/"

    def _serial_for(self, host: str) -> Optional[str]:
        e = next((x for x in self.entries if x["host"] == host), None)
        return e["serial"] if e else None

    # Every state-changing request is logged and sent to the app, where "Show technical details" reveals it
    # (agent/adddevice.py's _note does the same thing for adding a device). A real controller's exact response,
    # or the exact error reaching it, is what turns "it still does not work" into something fixable from here.
    def _note(self, host: str, body: dict, ok: bool, detail: str) -> None:
        entry: Dict[str, Any] = {"at": time.time(), "host": host, "serial": self._serial_for(host), "body": body, "ok": ok, "detail": detail}
        self.log.append(entry)
        del self.log[:-60]
        LOG.info("nanoleaf put %s %s -> %s %s", host, json.dumps(body), "ok" if ok else "failed", detail)
        if self._send:
            self._send({"type": "nanoleaf_log", "entry": entry})

    async def _get_info(self, host: str, token: str) -> dict:
        async with self._sess().get(self._url(host, token)) as r:
            r.raise_for_status()
            return await r.json(content_type=None)

    async def _put_state(self, host: str, token: str, body: dict) -> None:
        try:
            async with self._sess().put(self._url(host, token, "state"), json=body) as r:
                text = None
                if r.status >= 400:
                    text = (await r.text())[:200]
                    self._note(host, body, False, f"{r.status}: {text}")
                    raise RuntimeError(f"the Nanoleaf controller said {r.status}: {text}")
                self._note(host, body, True, f"{r.status}")
        except aiohttp.ClientError as exc:
            self._note(host, body, False, f"could not reach it: {exc}")
            raise RuntimeError(f"could not reach the Nanoleaf controller: {exc}") from exc

    def _store(self, key: str, after: dict) -> dict:
        """Write a freshly-read device into self.devices WITHOUT rebinding the dict.

        agent.py's _merge_nanoleaf copies these dicts into bridge.devices by reference, and it only runs
        on load, pair and forget. Rebinding self.devices[key] to a new object on every poll therefore left
        bridge.devices pointing at the dict as it was at merge time, permanently stale, and with it
        engine.py's _level_of(), which reads bridge.devices[id]["current_state"]. A "toggle" resolves its direction
        from that reading, so a panel the stale copy believed was on was sent level 0 and stayed dark,
        while the light's own page (which sends an explicit level, never a toggle) worked. Hue never had
        this because it mutates its device dicts in place.

        Updating in place keeps every holder of the reference correct, which is the invariant the merge
        assumes."""
        cur = self.devices.get(key)
        if cur is None:
            self.devices[key] = after
            return after
        cur.clear()
        cur.update(after)
        return cur

    def _entry(self, device_id: str) -> dict:
        serial = _serial_of(device_id)
        e = next((x for x in self.entries if x["serial"] == serial), None)
        if not e:
            raise RuntimeError(f"unknown Nanoleaf light {device_id}")
        return e

    def _save(self) -> None:
        self.file.parent.mkdir(parents=True, exist_ok=True)
        self.file.write_text(json.dumps(self.entries))

    # ----- discovery and pairing -----
    async def discover(self) -> List[dict]:
        """Controllers on the network by mDNS. There is no cloud discovery fallback for Nanoleaf, so a
        person who is not found here types the address instead; that path is exercised the same as this one."""
        found: Dict[str, dict] = {}
        try:
            from zeroconf import ServiceBrowser, Zeroconf  # noqa: WPS433

            zc = Zeroconf()
            loop = asyncio.get_running_loop()

            class L:  # noqa: N801
                def add_service(self, z, t, name):  # noqa: ANN001
                    info = z.get_service_info(t, name, 2000)
                    if info and info.parsed_addresses():
                        host = info.parsed_addresses()[0]
                        found[host] = {"host": host, "name": name.split(".")[0]}

                def update_service(self, *a):  # noqa: ANN001
                    pass

                def remove_service(self, *a):  # noqa: ANN001
                    pass

            ServiceBrowser(zc, "_nanoleafapi._tcp.local.", L())
            await asyncio.sleep(3)
            await loop.run_in_executor(None, zc.close)
        except Exception as exc:  # noqa: BLE001
            LOG.warning("nanoleaf mdns discovery failed: %s", exc)
        return list(found.values())

    async def pair(self, host: str, seconds: int = PAIR_SECONDS) -> dict:
        """Ask a controller for a key until its button was pressed recently enough, or time runs out."""
        host = str(host).strip()
        if not host:
            raise RuntimeError("a controller address is required")
        deadline = time.monotonic() + seconds
        last = "the panels did not flash: hold the power button for 5-7 seconds, then try Connect right after"
        while time.monotonic() < deadline:
            try:
                async with self._sess().post(self._url(host, "", "new")) as r:
                    if r.status == 200:
                        data = await r.json(content_type=None)
                        token = (data or {}).get("auth_token")
                        if token:
                            info = await self._get_info(host, token)
                            serial = str(info.get("serialNo") or host)
                            entry = {"host": host, "token": token, "serial": serial,
                                      "name": info.get("name") or "Nanoleaf", "model": info.get("model") or "Light Panels"}
                            self.entries = [e for e in self.entries if e["serial"] != serial] + [entry]
                            self._save()
                            self.errors.pop(serial, None)
                            self.devices[nid(serial)] = _device_from_info(entry, info)
                            self._ensure_poll()
                            if self._on_loaded:
                                self._on_loaded()
                            return self.info()
                    else:
                        last = f"the controller said {r.status}"
            except Exception as exc:  # noqa: BLE001
                last = str(exc)
            await asyncio.sleep(2)
        raise RuntimeError(f"the Nanoleaf controller did not hand out a key: {last}")

    async def forget(self, serial: str) -> dict:
        serial = str(serial)
        self.entries = [e for e in self.entries if e["serial"] != serial]
        self.devices.pop(nid(serial), None)
        self.errors.pop(serial, None)
        self._save()
        if not self.entries and self._poll:
            self._poll.cancel()
            self._poll = None
        return self.info()

    # ----- loading and polling (no event stream, unlike Hue's CLIP v2, so a light poll notices an outside change) -----
    async def start(self) -> None:
        if not self.entries:
            return
        await self._refresh_all()
        self._ensure_poll()

    def _ensure_poll(self) -> None:
        if self.entries and (self._poll is None or self._poll.done()):
            self._poll = asyncio.get_running_loop().create_task(self._poll_loop())

    async def stop(self) -> None:
        if self._poll:
            self._poll.cancel()
            self._poll = None
        if self._session and not self._session.closed:
            await self._session.close()

    async def _refresh_all(self) -> None:
        for e in list(self.entries):
            try:
                info = await self._get_info(e["host"], e["token"])
                self._store(nid(e["serial"]), _device_from_info(e, info))
                self.errors.pop(e["serial"], None)
            except Exception as exc:  # noqa: BLE001
                self.errors[e["serial"]] = str(exc)
                LOG.warning("nanoleaf %s (%s) not reachable: %s", e.get("name"), e["host"], exc)
        if self._on_loaded:
            self._on_loaded()

    async def _poll_loop(self) -> None:
        while self.entries:
            try:
                await asyncio.sleep(POLL_SECONDS)
            except asyncio.CancelledError:
                return
            for e in list(self.entries):
                try:
                    info = await self._get_info(e["host"], e["token"])
                    key = nid(e["serial"])
                    cur = self.devices.get(key)
                    before = dict(cur) if cur is not None else None
                    after = _device_from_info(e, info)
                    self._store(key, after)
                    self.errors.pop(e["serial"], None)
                    if before != after and self._on_state:
                        self._on_state(key)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    self.errors[e["serial"]] = str(exc)

    # ----- checking an off against the panel -----
    async def verify(self, device_id: str, adopt: bool = False) -> Optional[int]:
        """The level the panel is really at, 0 when it is off, asked of the controller itself.

        set_level writes current_state as soon as the controller accepts a PUT, the same way Hue's does, and there
        is no event stream here to say otherwise: until the next poll, an off that was accepted and not acted on
        reads as off. `adopt` also makes the answer what the app is shown, for a panel that will not go off.
        None when the controller cannot be reached; the caller then has only current_state to go on."""
        d = self.devices.get(device_id)
        if d is None:
            return None
        try:
            e = self._entry(device_id)
            info = await asyncio.wait_for(self._get_info(e["host"], e["token"]), VERIFY_TIMEOUT)
        except Exception as exc:  # noqa: BLE001
            LOG.info("nanoleaf: could not read %s back: %s", d.get("name"), exc)
            return None
        state = info.get("state") or {}
        on = bool((state.get("on") or {}).get("value"))
        bri = (state.get("brightness") or {}).get("value")
        level = max(1, int(bri if bri is not None else 100)) if on else 0
        if adopt and d.get("current_state") != level:
            d["current_state"] = level
            if self._on_state:
                self._on_state(device_id)
        return level

    # ----- control -----
    async def _send_on(self, host: str, token: str) -> None:
        """See the module docstring's note on turning on: "on" always goes out as its own PUT, before
        anything it might otherwise be bundled with, whenever a call means to turn the light on. This is
        unconditional on purpose, not gated on this module's cached belief about the light's state: that
        cache can drift (stale poll, or an earlier optimistic write that assumed a PUT took effect), and
        an already-on panel accepting a redundant "on" is harmless."""
        await self._put_state(host, token, {"on": {"value": True}})

    async def set_level(self, device_id: str, level: int, fade_s: Optional[float] = None) -> None:  # noqa: ARG002 (fade_s: see module docstring)
        e = self._entry(device_id)
        if level > 0:
            await self._send_on(e["host"], e["token"])
            await self._put_state(e["host"], e["token"], {"brightness": {"value": max(1, min(100, int(level)))}})
        else:
            await self._put_state(e["host"], e["token"], {"on": {"value": False}})
        d = self.devices.get(device_id)
        if d is not None:
            d["current_state"] = int(level)
        if self._on_state:
            self._on_state(device_id)

    async def set_color(self, device_id: str, kelvin: Optional[float] = None, hex: Optional[str] = None, fade_s: Optional[float] = None, level: Optional[int] = None) -> None:  # noqa: A002
        """White temperature (kelvin, clamped to the panel's range) or a colour (hex, via hue/sat), same
        contract as Hue.set_color: turns the lamp on, follows the same brightness rule, level 0 is just off."""
        d = self.devices.get(device_id)
        if not d:
            raise RuntimeError(f"unknown Nanoleaf light {device_id}")
        if level is not None and int(level) <= 0:
            await self.set_level(device_id, 0, fade_s)
            return
        e = self._entry(device_id)
        body: Dict[str, Any] = {}
        if level is not None:
            body["brightness"] = {"value": max(1, min(100, int(level)))}
        ct, color = d.get("ct"), d.get("color")
        mirek: Optional[int] = None
        xy: Optional[List[float]] = None
        if kelvin is not None and ct:
            mirek = max(int(ct["min"]), min(int(ct["max"]), kelvin_to_mirek(kelvin)))
            body["ct"] = {"value": mirek_to_kelvin(mirek)}
        elif hex is not None and color:
            r, g, b = hex_to_rgb(hex)
            h, s, _v = rgb_to_hsv(r, g, b)
            body["hue"] = {"value": int(round(h))}
            body["sat"] = {"value": int(round(s))}
            xy = list(rgb_to_xy(r, g, b, GAMUT_C))
        else:
            raise RuntimeError(f"{d.get('name')} cannot do that colour")
        # the body is validated and ready before anything is sent, so a colour the panel cannot do never
        # turns it on first and then fails: either both PUTs happen, or neither does
        await self._send_on(e["host"], e["token"])
        await self._put_state(e["host"], e["token"], body)
        if level is not None:
            d["current_state"] = int(level)
        elif int(d.get("current_state") or 0) <= 0:
            d["current_state"] = 100   # Nanoleaf reports no "last brightness while off"; a colour turns it on at full
        if mirek is not None:
            ct["mirek"] = mirek
            d["color_mode"] = "ct"
        if xy is not None:
            color["xy"] = xy
            d["color_mode"] = "xy"
        if self._on_state:
            self._on_state(device_id)

    async def set_warmth(self, device_id: str, kelvin: float, fade_s: Optional[float] = None, level: Optional[int] = None, while_off: bool = False) -> bool:  # noqa: ARG002
        """Same three promises as Hue.set_warmth: never sends on, only touches a lamp already on, and
        returns False (sending nothing) when it cannot or should not act."""
        d = self.devices.get(device_id)
        ct = (d or {}).get("ct")
        if not d or not ct:
            return False
        # while_off is the one caller that means it: a lamp about to be turned on, given its white now,
        # while it is dark and the change cannot be seen. The promise above still holds, because what goes
        # out is a colour and nothing else: a colour cannot light a lamp that is off.
        if not while_off and int(d.get("current_state") or 0) <= 0:
            return False
        e = self._entry(device_id)
        mirek = max(int(ct["min"]), min(int(ct["max"]), kelvin_to_mirek(kelvin)))
        body: Dict[str, Any] = {"ct": {"value": mirek_to_kelvin(mirek)}}
        if level is not None and not while_off:
            body["brightness"] = {"value": max(1, min(100, int(level)))}
        await self._put_state(e["host"], e["token"], body)
        ct["mirek"] = mirek
        d["color_mode"] = "ct"
        if level is not None and not while_off:
            d["current_state"] = int(level)
        if self._on_state:
            self._on_state(device_id)
        return True


# ----- the raw controller response, into the same device shape hue.py uses -----
def _device_from_info(entry: dict, info: dict) -> dict:
    state = info.get("state") or {}
    on = bool((state.get("on") or {}).get("value"))
    bri = (state.get("brightness") or {}).get("value")
    level = int(bri) if on and bri is not None else 0

    ct = state.get("ct") or {}
    ct_lo_k, ct_hi_k, ct_val = ct.get("min"), ct.get("max"), ct.get("value")
    ct_dict: Optional[dict] = None
    if ct_lo_k and ct_hi_k:
        # Nanoleaf's own min/max are Kelvin (coolest = highest Kelvin); the app's shape wants mirek, where the
        # coolest value is the smallest number, so the two ends swap on the way across.
        ct_dict = {"min": kelvin_to_mirek(ct_hi_k), "max": kelvin_to_mirek(ct_lo_k),
                   "mirek": kelvin_to_mirek(ct_val) if ct_val else None}

    hue_v, sat_v = (state.get("hue") or {}).get("value"), (state.get("sat") or {}).get("value")
    color: Optional[dict] = None
    xy: Optional[List[float]] = None
    if hue_v is not None and sat_v is not None:
        r, g, b = hsv_to_rgb(hue_v, sat_v, 100)
        xy = list(rgb_to_xy(r, g, b, GAMUT_C))
        color = {"gamut": None, "xy": xy}

    mode = state.get("colorMode")
    color_mode: Optional[str]
    if mode == "ct" and ct_dict and ct_dict.get("mirek") is not None:
        color_mode = "ct"
    elif mode == "hs" and color:
        color_mode = "xy"
    else:
        color_mode = None   # an active built-in effect, or a mode the app does not model; shown as plain white

    name = entry.get("name") or info.get("name") or "Nanoleaf"
    model = entry.get("model") or info.get("model") or "Light Panels"
    return {
        "device_id": nid(entry["serial"]), "name": name, "device_name": name,
        "type": "NanoleafLight", "model": model, "serial": entry["serial"],
        "zone": entry["serial"], "area": None, "current_state": level, "fan_speed": None,
        "color": color, "ct": ct_dict, "color_mode": color_mode,
        "nanoleaf_host": entry["host"],
    }
