"""Gesture detection and action execution.

Gesture engine: turns raw Press/Release events from a Pico button into
    single, double, hold_start, hold_end, hold
Timing lives in config.settings (double_ms, hold_ms).

Actions are the same JSON shape the hub validates (see hub/validate.js):
    level, step, raise, lower, stop, fan, scene, preset, delay, cycle
Targets are "d:<device_id>" or "g:<group_id>".
"""
from __future__ import annotations

import asyncio
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

    def __init__(self, bridge_getter: Callable[[], Any], config_getter: Callable[[], dict]) -> None:
        self._bridge = bridge_getter
        self._config = config_getter
        self._cycle_pos: Dict[str, int] = {}

    # ----- helpers -----
    def _resolve(self, target: str) -> List[str]:
        kind, _, ident = target.partition(":")
        if kind == "d":
            return [ident]
        if kind == "g":
            for g in self._config().get("groups", []):
                if g.get("id") == ident:
                    return list(g.get("device_ids", []))
            LOG.warning("unknown group %s", ident)
        return []

    def _group_on_level(self, target: str) -> int:
        kind, _, ident = target.partition(":")
        if kind == "g":
            for g in self._config().get("groups", []):
                if g.get("id") == ident and g.get("on_level"):
                    return int(g["on_level"])
        return int(self._config().get("settings", {}).get("group_on_level", 100))

    def _level_of(self, device_id: str) -> int:
        bridge = self._bridge()
        dev = bridge.devices.get(device_id) if bridge else None
        if not dev:
            return 0
        lvl = dev.get("current_state", -1)
        return int(lvl) if isinstance(lvl, (int, float)) and lvl >= 0 else 0

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
            await bridge.activate_scene(str(a["scene_id"]))
            return None

        if t == "preset":
            preset = next((p for p in self._config().get("presets", []) if p.get("id") == a["preset_id"]), None)
            if preset is None:
                raise RuntimeError(f"unknown preset {a['preset_id']}")
            fade = preset.get("fade")
            coros = []
            for device_id, level in preset.get("levels", {}).items():
                if device_id not in bridge.devices:
                    LOG.warning("preset %s: device %s not on bridge, skipping", preset["id"], device_id)
                    continue
                if isinstance(level, str):
                    coros.append(bridge.set_fan(device_id, level))
                else:
                    coros.append(self._set_level(device_id, int(level), fade))
            await asyncio.gather(*coros)
            return None

        targets = self._resolve(a.get("target", ""))
        if not targets:
            raise RuntimeError(f"target {a.get('target')} resolves to nothing")

        if t == "level":
            level = a.get("level")
            fade = a.get("fade")
            if level == "toggle":
                any_on = any(self._level_of(d) > 0 for d in targets)
                level = 0 if any_on else self._group_on_level(a["target"])
            elif level == "on":
                level = self._group_on_level(a["target"])
            elif level == "off":
                level = 0
            await asyncio.gather(*(self._set_level(d, int(level), fade) for d in targets))
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
            fn = {"raise": bridge.raise_cover, "lower": bridge.lower_cover, "stop": bridge.stop_cover}[t]
            # raise_cover/lower_cover/stop_cover send the generic Raise/Lower/Stop zone commands,
            # which dimmers honour too (that is how a Pico's own raise/lower works).
            await asyncio.gather(*(fn(d) for d in targets))
            return None

        if t == "fan":
            await asyncio.gather(*(bridge.set_fan(d, a["speed"]) for d in targets if self._is_fan(d)))
            return None

        raise RuntimeError(f"unknown action type {t}")


_LIGHT_TYPES = {
    "WallDimmer", "PlugInDimmer", "InLineDimmer", "SunnataDimmer", "TempInWallPaddleDimmer",
    "WallDimmerWithPreset", "Dimmed", "DivaSmartDimmer", "PowPak0-10V",
}
