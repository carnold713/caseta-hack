"""Gesture detection and action execution.

Gesture engine: turns raw Press/Release events from a Pico button into
    single, double, hold_start, hold_end, hold
Timing lives in config.settings (double_ms, hold_ms).

Actions are the same JSON shape the hub validates (see hub/validate.js):
    level, step, raise, lower, stop, fan, scene, preset, delay, cycle, color
Targets are "d:<device_id>", "g:<group_id>", "a:<room>" or "h:all" / "h:shades" / "h:fans".
"a:<room>" names one of the app's own rooms when the config carries them (settings.rooms), and the
bridge's own area when it does not.
color: {target, kelvin | hex, level?, fade?} reaches only the Hue lights in the target that can do it.
A preset level may be {level, kelvin?, hex?} for such a lamp; anything else is a number or a fan speed.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional

LOG = logging.getLogger("agent.engine")

GESTURES = ("single", "double", "hold_start", "hold_end", "hold")


class ButtonState:
    __slots__ = ("pressed_at", "held", "double_armed", "hold_task", "single_task")

    def __init__(self) -> None:
        self.pressed_at: float = 0.0
        self.held = False
        self.double_armed = False  # a second press arrived inside the double window
        self.hold_task: Optional[asyncio.Task] = None
        self.single_task: Optional[asyncio.Task] = None


class GestureEngine:
    """Per-button state machine.

    emit(button_key, gesture) is called for every resolved gesture.
    has_double(button_key) tells the engine whether to wait for a possible
    second click; when nothing is bound to "double" a single fires instantly.
    """

    def __init__(
        self,
        emit: Callable[[str, str], None],
        has_double: Callable[[str], bool],
        double_ms: int = 350,
        hold_ms: int = 500,
    ) -> None:
        self.emit = emit
        self.has_double = has_double
        self.double_ms = double_ms
        self.hold_ms = hold_ms
        self._states: Dict[str, ButtonState] = {}

    def configure(self, double_ms: int, hold_ms: int) -> None:
        self.double_ms = double_ms
        self.hold_ms = hold_ms

    def _st(self, key: str) -> ButtonState:
        st = self._states.get(key)
        if st is None:
            st = self._states[key] = ButtonState()
        return st

    def press(self, key: str) -> None:
        st = self._st(key)
        st.pressed_at = time.monotonic()
        st.held = False
        if st.single_task and not st.single_task.done():
            # A click was waiting to see if a second one came. It did.
            st.single_task.cancel()
            st.single_task = None
            st.double_armed = True
        else:
            st.double_armed = False
        if st.hold_task and not st.hold_task.done():
            st.hold_task.cancel()
        st.hold_task = asyncio.create_task(self._hold_timer(key))

    def release(self, key: str) -> None:
        st = self._st(key)
        if st.hold_task and not st.hold_task.done():
            st.hold_task.cancel()
        st.hold_task = None
        if st.held:
            st.held = False
            self.emit(key, "hold_end")
            self.emit(key, "hold")
            return
        if st.double_armed:
            st.double_armed = False
            self.emit(key, "double")
            return
        if self.has_double(key):
            st.single_task = asyncio.create_task(self._single_timer(key))
        else:
            self.emit(key, "single")

    async def _hold_timer(self, key: str) -> None:
        try:
            await asyncio.sleep(self.hold_ms / 1000)
        except asyncio.CancelledError:
            return
        st = self._st(key)
        st.held = True
        st.double_armed = False
        self.emit(key, "hold_start")

    async def _single_timer(self, key: str) -> None:
        try:
            await asyncio.sleep(self.double_ms / 1000)
        except asyncio.CancelledError:
            return
        self.emit(key, "single")


FAN_ORDER = ["Off", "Low", "Medium", "MediumHigh", "High"]


class ActionRunner:
    """Executes action lists against a pylutron-caseta Smartbridge."""

    def __init__(
        self,
        bridge_getter: Callable[[], Any],
        config_getter: Callable[[], dict],
        on_timer: Optional[Callable[[str, Optional[float], int], None]] = None,
    ) -> None:
        self._bridge = bridge_getter
        self._config = config_getter
        self._cycle_pos: Dict[str, int] = {}
        self._timers: Dict[str, asyncio.Task] = {}   # target -> pending sleep timer
        self._on_timer = on_timer                     # (target, ends_at epoch or None, level)
        self.local_time: Optional[Callable[[], Any]] = None  # set by the agent: returns an aware datetime in the home's zone
        self.sunset_hm: Optional[Callable[[], Optional[str]]] = None  # set by the agent: today's sunset as HH:MM, or None
        self._floors: Dict[str, dict] = {}  # device_id -> {"floor": n} while a hold-to-dim ramp is running
        # Hue lights live in the same device dict under "hue_" ids; the agent sets these to route them
        self.hue_set: Optional[Callable[[str, int, Optional[float]], Awaitable[None]]] = None
        self.hue_color: Optional[Callable[..., Awaitable[None]]] = None  # (device_id, kelvin=, hex=, fade_s=, level=)
        self.hue_scene: Optional[Callable[[str], Awaitable[None]]] = None
        # Follow the day (daylight.py). `color_watch` is told the device id whenever a colour or a warmth is set
        # from anywhere but the follow loop itself, which is how a lamp set by hand stops following. `follow_start`
        # is awaited for a scene entry that says "follow the day": it turns following on and sets the white for now.
        self.color_watch: Optional[Callable[[str], None]] = None
        self.follow_start: Optional[Callable[[str], Awaitable[None]]] = None
        # What the house looked like just before it went dark: every light lit within the two minutes
        # before the last one went off, at its level then. The power button brings it back.
        self._last_lit: Dict[str, tuple] = {}   # device_id -> (level, when)
        self.last_on: Dict[str, int] = {}
        self.memory_file: Optional[Any] = None  # a Path the agent sets so last_on survives a restart

    @property
    def timers(self) -> Dict[str, dict]:
        out = {}
        for target, task in self._timers.items():
            if not task.done():
                out[target] = getattr(task, "timer_info", {})
        return out

    # ----- helpers -----
    # The rooms the app owns (config.settings.rooms). While the list is empty the connector reads the bridges'
    # own areas, exactly as it always has. Once there is a list, `a:<id>` names one of these rooms: the devices
    # filed in it by hand, plus whatever still sits in the bridge room it stands for and no other room has taken.
    # Hue lamps are "hue_" ids in the same device dictionary, so a room of Hue lamps resolves like any other.
    def _app_rooms(self) -> List[dict]:
        rooms = (self._config().get("settings") or {}).get("rooms") or []
        return [r for r in rooms if isinstance(r, dict) and r.get("id")]

    def _room_devices(self, room: dict, rooms: List[dict]) -> List[str]:
        bridge = self._bridge()
        if not bridge:
            return []
        claimed = {}
        for r in rooms:
            for did in r.get("device_ids") or []:
                claimed.setdefault(str(did), str(r.get("id")))
        rid = str(room.get("id"))
        areas = {str(a) for a in (room.get("bridge_area"), room.get("hue_room")) if a}
        out: List[str] = []
        for did, d in bridge.devices.items():
            did = str(did)
            if not d.get("zone") or d.get("type") in _COVER_TYPES:
                continue
            owner = claimed.get(did)
            if owner == rid or (owner is None and str(d.get("area")) in areas):
                out.append(did)
        return out

    def _resolve(self, target) -> List[str]:
        if isinstance(target, list):
            seen: List[str] = []
            for t in target:
                for d in self._resolve(t):
                    if d not in seen:
                        seen.append(d)
            return seen
        kind, _, ident = target.partition(":")
        bridge = self._bridge()
        if kind == "d":
            return [ident]
        if kind == "g":
            for g in self._config().get("groups", []):
                if g.get("id") == ident:
                    return list(g.get("device_ids", []))
            LOG.warning("unknown group %s", ident)
            return []
        if kind == "a" and bridge:   # every controllable device in a room
            rooms = self._app_rooms()
            if rooms:
                room = next((r for r in rooms if str(r.get("id")) == ident), None)
                if room is not None:
                    return self._room_devices(room, rooms)
            # no app list, or a room the app does not own: the bridge's own area, exactly as before
            return [d["device_id"] for d in bridge.devices.values()
                    if d.get("zone") and d.get("area") == ident and d.get("type") not in _COVER_TYPES]
        if kind == "h" and ident == "all" and bridge:   # every light and switch in the house
            return [d["device_id"] for d in bridge.devices.values()
                    if d.get("zone") and d.get("type") in _LIGHT_TYPES | _SWITCH_TYPES]
        if kind == "h" and ident == "shades" and bridge:
            return [d["device_id"] for d in bridge.devices.values() if d.get("zone") and d.get("type") in _COVER_TYPES]
        if kind == "h" and ident == "fans" and bridge:
            return [d["device_id"] for d in bridge.devices.values() if d.get("zone") and d.get("type") in _FAN_TYPES]
        return []

    def _group_on_level(self, target) -> int:
        settings = self._config().get("settings", {})
        if not isinstance(target, list):
            kind, _, ident = target.partition(":")
            if kind == "g":
                for g in self._config().get("groups", []):
                    if g.get("id") == ident and g.get("on_level"):
                        return int(g["on_level"])
        return self.curve_level() if self.curve_level() is not None else int(settings.get("group_on_level", 100))

    def curve_level(self) -> Optional[int]:
        """What "on" means right now under the adaptive curve, or None when it is off."""
        settings = self._config().get("settings", {})
        adaptive = settings.get("adaptive") or {}
        if not adaptive.get("enabled") or not self.local_time:
            return None
        now = self.local_time()
        now_hm = now.strftime("%H:%M")
        if adaptive.get("mode") == "points":
            return adaptive_level(adaptive.get("points", []), now_hm)
        wd = adaptive.get("winddown") or {}
        start_hm = wd.get("earliest", "18:00")
        if self.sunset_hm:
            sh = self.sunset_hm()
            if sh:
                mins = int(sh[:2]) * 60 + int(sh[3:]) + int(wd.get("sunset_offset_min", 30))
                lo = int(wd.get("earliest", "18:00")[:2]) * 60 + int(wd.get("earliest", "18:00")[3:])
                hi = int(wd.get("latest", "20:00")[:2]) * 60 + int(wd.get("latest", "20:00")[3:])
                mins = max(lo, min(hi, mins))
                start_hm = f"{mins // 60:02d}:{mins % 60:02d}"
        return winddown_level(now_hm, start_hm, settings.get("night_start", "22:00"), settings.get("night_end", "06:30"),
                              int(wd.get("from_level", 100)), int(wd.get("to_level", 50)), int(settings.get("night_level", 30)),
                              int(wd.get("morning_level", 100)), wd.get("morning_until", "07:30"))

    def on_level_for(self, device_id: str, target) -> int:
        """Per-light "on" level: task lights are exempt from the evening curve."""
        roles = self._config().get("settings", {}).get("roles") or {}
        if roles.get(device_id) == "task":
            return int(self._config().get("settings", {}).get("group_on_level", 100))
        return self._group_on_level(target)

    def _level_of(self, device_id: str) -> int:
        bridge = self._bridge()
        dev = bridge.devices.get(device_id) if bridge else None
        if not dev:
            return 0
        lvl = dev.get("current_state", -1)
        return int(lvl) if isinstance(lvl, (int, float)) and lvl >= 0 else 0

    def _hue_can(self, device_id: str, what: str) -> bool:
        """Does this Hue lamp do white temperature ("ct") or colour ("color")? Caseta devices never do."""
        if not device_id.startswith("hue_"):
            return False
        bridge = self._bridge()
        dev = bridge.devices.get(device_id) if bridge else None
        return bool(dev and dev.get(what))

    async def _set_color(self, device_id: str, kelvin: Optional[float], hex_str: Optional[str], level: Optional[int], fade: Optional[float]) -> None:
        if self.hue_color is None:
            raise RuntimeError("Hue bridge not connected")
        fs = fade if fade is not None else self._config().get("settings", {}).get("default_fade")
        # Every colour that comes through here was asked for by a person, a button or a scene, never by the follow
        # loop (which talks to the Hue client itself), so it is what pauses a lamp that was following the day.
        if self.color_watch:
            self.color_watch(device_id)
        await self.hue_color(device_id, kelvin=kelvin, hex=hex_str, fade_s=float(fs) if fs is not None else None, level=level)

    async def _follow_entry(self, device_id: str, level: int, fade: Optional[float]) -> None:
        """A scene entry that says "follow the day": the brightness the scene asks for, then the white for right now."""
        if level is not None:
            await self._set_level(device_id, int(level), fade)
        if self.follow_start:
            await self.follow_start(device_id)

    def _is_fan(self, device_id: str) -> bool:
        bridge = self._bridge()
        dev = bridge.devices.get(device_id) if bridge else None
        return bool(dev and dev.get("type") in ("CasetaFanSpeedController", "MaestroFanSpeedController", "FanSpeed"))

    def _fade(self, seconds: Optional[float]) -> Optional[timedelta]:
        if seconds is None:
            seconds = self._config().get("settings", {}).get("default_fade")
        if seconds is None:
            return None
        return timedelta(seconds=float(seconds))

    async def _set_level(self, device_id: str, level: int, fade: Optional[float]) -> None:
        bridge = self._bridge()
        if bridge is None:
            raise RuntimeError("bridge not connected")
        if device_id not in bridge.devices:
            raise RuntimeError(f"unknown device {device_id}")
        if device_id.startswith("hue_"):
            if self.hue_set is None:
                raise RuntimeError("Hue bridge not connected")
            fs = fade if fade is not None else self._config().get("settings", {}).get("default_fade")
            await self.hue_set(device_id, int(level), float(fs) if fs is not None else None)
            return
        if self._is_fan(device_id):
            speed = "Off" if level <= 0 else "Low" if level <= 25 else "Medium" if level <= 50 else "MediumHigh" if level <= 75 else "High"
            await bridge.set_fan(device_id, speed)
            return
        dev = bridge.devices[device_id]
        fade_td = self._fade(fade)
        # GoToDimmedLevel is only valid for dimmers; switches and shades take a plain level.
        if dev.get("type") in _LIGHT_TYPES:
            await bridge.set_value(device_id, int(level), fade_time=fade_td)
        else:
            await bridge.set_value(device_id, int(level))

    # ----- hold-to-dim floor -----
    def _clear_floors(self, device_ids: List[str]) -> None:
        for d in device_ids:
            self._floors.pop(d, None)

    # ----- what was on before the house went dark -----
    def load_memory(self) -> None:
        try:
            if self.memory_file and self.memory_file.exists():
                data = json.loads(self.memory_file.read_text())
                self.last_on = {str(k): int(v) for k, v in data.items() if isinstance(v, (int, float)) and v > 0}
        except Exception:  # noqa: BLE001
            self.last_on = {}

    def _remember(self, device_id: str, level: Optional[int]) -> None:
        bridge = self._bridge()
        dev = bridge.devices.get(device_id) if bridge else None
        if not dev or dev.get("type") not in _LIGHT_TYPES | _SWITCH_TYPES or level is None:
            return
        now = time.time()
        if level > 0:
            self._last_lit[device_id] = (int(level), now)
            return
        any_lit = any(
            d.get("type") in _LIGHT_TYPES | _SWITCH_TYPES and self._level_of(did) > 0
            for did, d in bridge.devices.items() if did != device_id
        )
        if any_lit:
            return
        recent = {d: lv for d, (lv, t) in self._last_lit.items() if now - t <= 120}
        if not recent:
            return
        self.last_on = recent
        self._last_lit = {}
        if self.memory_file:
            try:
                self.memory_file.write_text(json.dumps(self.last_on))
            except Exception:  # noqa: BLE001
                pass

    def zone_changed(self, device_id: str, level: Optional[int]) -> Optional[Any]:
        """Called by the agent on every zone update; stops a ramp at its floor or ceiling. Returns a coroutine to await or None."""
        self._remember(device_id, level)
        f = self._floors.get(device_id)
        if not f or level is None:
            return None
        if (f["dir"] == "down" and level <= f["floor"]) or (f["dir"] == "up" and level >= f["floor"]):
            self._floors.pop(device_id, None)
            bridge = self._bridge()

            async def settle() -> None:
                await bridge.stop_cover(device_id)
                await self._set_level(device_id, f["floor"], 0)
            return settle()
        return None

    # ----- timers -----
    @staticmethod
    def _tkey(target) -> str:
        return "|".join(target) if isinstance(target, list) else target

    def cancel_timer(self, target) -> None:
        target = self._tkey(target)
        t = self._timers.pop(target, None)
        if t and not t.done():
            t.cancel()
            if self._on_timer:
                self._on_timer(target, None, 0)

    def _cancel_timers_touching(self, device_ids: List[str]) -> None:
        touched = set(device_ids)
        for key in list(self._timers):
            if touched & set(self._resolve(key.split("|") if "|" in key else key)):
                self.cancel_timer(key)

    def start_timer(self, target, minutes: int, level: int, fade: Optional[float]) -> None:
        raw = target
        target = self._tkey(target)
        self.cancel_timer(target)
        ends_at = time.time() + minutes * 60

        async def fire() -> None:
            try:
                await asyncio.sleep(minutes * 60)
            except asyncio.CancelledError:
                return
            self._timers.pop(target, None)
            if self._on_timer:
                self._on_timer(target, None, level)
            try:
                await self.run_one({"type": "level", "target": raw, "level": level, "fade": fade if fade is not None else 3})
            except Exception as exc:  # noqa: BLE001
                LOG.error("timer on %s failed: %s", target, exc)

        task = asyncio.create_task(fire())
        task.timer_info = {"ends_at": ends_at, "level": level}  # type: ignore[attr-defined]
        self._timers[target] = task
        if self._on_timer:
            self._on_timer(target, ends_at, level)

    # ----- public -----
    async def run(self, actions: List[dict]) -> None:
        for action in actions:
            try:
                await self.run_one(action)
            except Exception as exc:  # noqa: BLE001
                LOG.error("action %s failed: %s", action, exc)
                raise

    async def run_one(self, a: dict) -> Any:
        t = a.get("type")
        bridge = self._bridge()
        if t == "delay":
            await asyncio.sleep(int(a.get("ms", 0)) / 1000)
            return None
        if bridge is None:
            raise RuntimeError("bridge not connected")

        if t == "scene":
            if str(a["scene_id"]).startswith("hue_"):
                if self.hue_scene is None:
                    raise RuntimeError("Hue bridge not connected")
                await self.hue_scene(str(a["scene_id"]))
                return None
            await bridge.activate_scene(str(a["scene_id"]))
            return None

        if t == "preset":
            preset = next((p for p in self._config().get("presets", []) if p.get("id") == a["preset_id"]), None)
            if preset is None:
                raise RuntimeError(f"unknown preset {a['preset_id']}")
            fade = preset.get("fade")
            self._cancel_timers_touching(list(preset.get("levels", {}).keys()))
            coros = []
            for device_id, level in preset.get("levels", {}).items():
                if device_id not in bridge.devices:
                    LOG.warning("preset %s: device %s not on bridge, skipping", preset["id"], device_id)
                    continue
                if isinstance(level, str):
                    coros.append(bridge.set_fan(device_id, level))
                elif isinstance(level, dict):
                    # {level, kelvin?, hex?}: a Hue lamp's colour and brightness in one request; a lamp that cannot
                    # do the colour asked for (or a colour on a lamp that lost it) just takes the level.
                    # {level, follow: true}: the lamp follows the day from now on, starting at today's white.
                    lv = int(level.get("level", 0) or 0)
                    if level.get("follow"):
                        if self._hue_can(device_id, "ct"):
                            coros.append(self._follow_entry(device_id, lv, fade))
                        else:
                            coros.append(self._set_level(device_id, lv, fade))
                        continue
                    kelvin = level.get("kelvin") if self._hue_can(device_id, "ct") else None
                    hex_str = level.get("hex") if kelvin is None and self._hue_can(device_id, "color") else None
                    if kelvin is not None or hex_str is not None:
                        coros.append(self._set_color(device_id, kelvin, hex_str, lv, fade))
                    else:
                        coros.append(self._set_level(device_id, lv, fade))
                else:
                    coros.append(self._set_level(device_id, int(level), fade))
            await asyncio.gather(*coros)
            return None

        if t == "cancel_timer":
            self.cancel_timer(a["target"])
            return None
        if t == "timer":
            self.start_timer(a["target"], int(a["minutes"]), int(a.get("level", 0) or 0), a.get("fade"))
            return None

        if t == "cycle_presets":
            ids = [p for p in a.get("preset_ids", [])]
            presets = {p["id"]: p for p in self._config().get("presets", []) if p.get("id") in ids}
            # which one are we in now? the preset whose levels are closest to the current state
            def distance(p: dict) -> float:
                lv = p.get("levels", {})
                if not lv:
                    return 1e9
                return sum(abs(self._level_of(d) - _preset_level(v)) for d, v in lv.items() if d in bridge.devices) / len(lv)
            ranked = sorted((distance(presets[i]), n) for n, i in enumerate(ids) if i in presets)
            current = ranked[0][1] if ranked and ranked[0][0] < 8 else -1
            nxt = ids[(current + 1) % len(ids)]
            await self.run_one({"type": "preset", "preset_id": nxt})
            return None

        targets = self._resolve(a.get("target", ""))
        if not targets:
            raise RuntimeError(f"target {a.get('target')} resolves to nothing")

        if t == "level":
            self._cancel_timers_touching(targets)
            self._clear_floors(targets)
            level = a.get("level")
            fade = a.get("fade")
            if level == "toggle":
                any_on = any(self._level_of(d) > 0 for d in targets)
                if any_on:
                    await asyncio.gather(*(self._set_level(d, 0, fade) for d in targets))
                else:
                    await asyncio.gather(*(self._set_level(d, self.on_level_for(d, a["target"]), fade) for d in targets))
                return None
            if level == "on":
                await asyncio.gather(*(self._set_level(d, self.on_level_for(d, a["target"]), fade) for d in targets))
                return None
            if level == "off":
                level = 0
            await asyncio.gather(*(self._set_level(d, int(level), fade) for d in targets))
            return None

        if t == "restore":
            # the power button with nothing on: the lights that were on before the house went dark, at
            # their levels then; with nothing remembered, everything comes on at its usual level
            targets = [d for d in self._resolve(a["target"]) if bridge.devices.get(d, {}).get("type") in _LIGHT_TYPES | _SWITCH_TYPES]
            fade = a.get("fade")
            picks = {d: self.last_on[d] for d in targets if d in self.last_on}
            if picks:
                await asyncio.gather(*(self._set_level(d, lv, fade) for d, lv in picks.items()))
            else:
                await asyncio.gather(*(self._set_level(d, self.on_level_for(d, a["target"]), fade) for d in targets))
            return {"restored": sorted(picks)} if picks else {"restored": []}

        if t == "color":
            # white temperature or a colour, only for the Hue lamps in the target that can do it; the rest are left alone
            kelvin, hex_str = a.get("kelvin"), a.get("hex")
            want = "ct" if kelvin is not None else "color"
            lamps = [d for d in targets if self._hue_can(d, want)]
            if not lamps:
                raise RuntimeError(f"none of {a.get('target')} can change {'warmth' if want == 'ct' else 'colour'}")
            self._cancel_timers_touching(lamps)
            self._clear_floors(lamps)
            level = a.get("level")
            await asyncio.gather(*(self._set_color(d, kelvin, hex_str, int(level) if level is not None else None, a.get("fade")) for d in lamps))
            return None

        if t == "cap":
            # only lights that are brighter than `level` come down to it
            lvl = int(a["level"])
            above = [d for d in targets if self._level_of(d) > lvl]
            await asyncio.gather(*(self._set_level(d, lvl, a.get("fade")) for d in above))
            return None

        if t == "step":
            delta = int(a.get("delta", 10))
            coros = []
            for d in targets:
                if self._is_fan(d):
                    cur = (bridge.devices[d].get("fan_speed") or "Off")
                    idx = FAN_ORDER.index(cur) if cur in FAN_ORDER else 0
                    idx = max(0, min(len(FAN_ORDER) - 1, idx + (1 if delta > 0 else -1)))
                    coros.append(bridge.set_fan(d, FAN_ORDER[idx]))
                else:
                    coros.append(self._set_level(d, max(0, min(100, self._level_of(d) + delta)), a.get("fade", 0)))
            await asyncio.gather(*coros)
            return None

        if t == "cycle":
            levels = [int(x) for x in a.get("levels", [])]
            key = f"{a['target']}|{','.join(map(str, levels))}"
            # Start from the level the device is actually at, so the cycle feels continuous
            # even if something else changed the light in between.
            cur = self._level_of(targets[0])
            if cur in levels:
                pos = (levels.index(cur) + 1) % len(levels)
            else:
                pos = self._cycle_pos.get(key, 0) % len(levels)
            self._cycle_pos[key] = pos + 1
            await asyncio.gather(*(self._set_level(d, levels[pos], a.get("fade")) for d in targets))
            return None

        if t in ("raise", "lower", "stop"):
            targets = [d for d in targets if not d.startswith("hue_")]  # Hue has no raise/lower ramp
            fn = {"raise": bridge.raise_cover, "lower": bridge.lower_cover, "stop": bridge.stop_cover}[t]
            # raise_cover/lower_cover/stop_cover send the generic Raise/Lower/Stop zone commands,
            # which dimmers honour too (that is how a Pico's own raise/lower works).
            if t == "stop":
                self._clear_floors(targets)
            elif t == "lower" and a.get("floor"):
                for d in targets:
                    self._floors[d] = {"floor": int(a["floor"]), "dir": "down"}
            elif t == "raise" and a.get("ceiling") is not None:
                for d in targets:
                    self._floors[d] = {"floor": int(a["ceiling"]), "dir": "up"}
            await asyncio.gather(*(fn(d) for d in targets))
            return None


        if t == "fan":
            await asyncio.gather(*(bridge.set_fan(d, a["speed"]) for d in targets if self._is_fan(d)))
            return None

        raise RuntimeError(f"unknown action type {t}")


def _preset_level(v: Any) -> int:
    """A preset entry as a brightness for the cycle distance: a number, {level, kelvin?, hex?}, or a fan speed (counted as 0, as before)."""
    if isinstance(v, dict):
        return int(v.get("level", 0) or 0)
    if isinstance(v, str):
        return 0
    return int(v)


_LIGHT_TYPES = {
    "WallDimmer", "PlugInDimmer", "InLineDimmer", "SunnataDimmer", "TempInWallPaddleDimmer",
    "WallDimmerWithPreset", "Dimmed", "DivaSmartDimmer", "PowPak0-10V", "HueLight",
}
_SWITCH_TYPES = {
    "WallSwitch", "OutdoorPlugInSwitch", "PlugInSwitch", "InLineSwitch", "PowPakSwitch",
    "HueSwitch",
    "SunnataSwitch", "TempInWallPaddleSwitch", "Switched", "DivaSmartSwitch",
}
_FAN_TYPES = {"CasetaFanSpeedController", "MaestroFanSpeedController", "FanSpeed"}
_COVER_TYPES = {
    "SerenaHoneycombShade", "SerenaRollerShade", "TriathlonHoneycombShade", "TriathlonEssentialsRollerShade",
    "TriathlonRollerShade", "TriathlonTiltOnlyWoodBlind", "QsWirelessShade", "QsWirelessHorizontalSheerBlind",
    "QsWirelessWoodBlind", "RightDrawDrape", "Shade", "Tilt", "SerenaTiltOnlyWoodBlind", "PalladiomWireFreeShade",
    "SerenaEssentialsRollerShade",
}


def adaptive_level(points: list, now_hm: str) -> Optional[int]:
    """Interpolate the "on" level for a clock time from sorted {time, level} points; wraps around midnight."""
    pts = sorted(((int(p["time"][:2]) * 60 + int(p["time"][3:]), int(p["level"])) for p in points if p.get("time")), key=lambda x: x[0])
    if len(pts) < 2:
        return None
    now = int(now_hm[:2]) * 60 + int(now_hm[3:])
    # Before the first point or after the last one, hold the last (night) level: no ramp back up overnight.
    if now < pts[0][0] or now >= pts[-1][0]:
        return pts[-1][1]
    prev = pts[0]
    for t, lvl in pts[1:]:
        if now < t:
            span = t - prev[0]
            frac = (now - prev[0]) / span if span else 0
            return int(round(prev[1] + (lvl - prev[1]) * frac))
        prev = (t, lvl)
    return pts[-1][1]


def _mins(hm: str) -> int:
    return int(hm[:2]) * 60 + int(hm[3:])


def winddown_level(now_hm: str, start_hm: str, night_start: str, night_end: str, from_level: int, to_level: int, night_level: int,
                   morning_level: int = 100, morning_until: str = "07:30") -> int:
    """Night level inside the night hours, a soft morning until morning_until, full until start,
    then a straight line down to to_level at night_start."""
    if in_night_window(now_hm, night_start, night_end):
        return night_level
    if _mins(night_end) <= _mins(now_hm) < _mins(morning_until):
        return morning_level
    now, start, ns = _mins(now_hm), _mins(start_hm), _mins(night_start)
    if ns <= start:
        return from_level if now < start else to_level
    if now < start:
        return from_level
    if now >= ns:
        return to_level
    frac = (now - start) / (ns - start)
    return int(round(from_level + (to_level - from_level) * frac))


def in_night_window(now_hm: str, start: str, end: str) -> bool:
    """True when the clock time (HH:MM) falls in [start, end); the window may wrap midnight."""
    if start == end:
        return False
    if start < end:
        return start <= now_hm < end
    return now_hm >= start or now_hm < end
