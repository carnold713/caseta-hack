#!/usr/bin/env python3
"""caseta-hack agent: the in-home half.

Connects to the Caseta Smart Bridge over LEAP (TLS, port 8081) using the
certificates from pair.py, listens to every Pico button, resolves gestures
(single / double / hold), and runs the bound actions locally. It also dials
out to the hub on Railway over a WebSocket so the phone app can control
lights and edit bindings from anywhere. If the hub is unreachable the agent
keeps working from the last config it cached on disk.

Environment:
    BRIDGE_HOST   IP of the Smart Bridge (optional: pair.py saves it in DATA_DIR/bridge_host)
    HUB_URL       wss://<your-app>.up.railway.app/ws/agent (optional, local-only without it)
    AGENT_TOKEN   must match the hub's AGENT_TOKEN
    DATA_DIR      where the certs and config cache live (default ./data)
    LOG_LEVEL     debug|info|warning (default info)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import websockets
from pylutron_caseta.smartbridge import Smartbridge

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from engine import ActionRunner, GestureEngine, in_night_window
from adddevice import AddSession
from hue import Hue, color_state
from sun import sun_times

VERSION = "0.8.4"
LOG = logging.getLogger("agent")

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent / "data"))
HUB_URL = os.environ.get("HUB_URL", "").strip()
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")
CONFIG_CACHE = DATA_DIR / "config.cache.json"
REPO_ROOT = Path(__file__).resolve().parent.parent


def _git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(REPO_ROOT), *args], capture_output=True, text=True, timeout=120, check=True).stdout.strip()


def current_commit() -> Optional[str]:
    try:
        return _git("rev-parse", "--short", "HEAD")
    except Exception:  # noqa: BLE001
        return None


def self_update() -> str:
    """Pull the latest code and dependencies. Returns the new commit. Raises on failure."""
    if not (REPO_ROOT / ".git").exists():
        raise RuntimeError("this connector was not installed with git, so it cannot update itself")
    branch = _git("rev-parse", "--abbrev-ref", "HEAD")
    _git("fetch", "--quiet", "origin", branch)
    _git("reset", "--hard", "--quiet", f"origin/{branch}")
    pip = Path(sys.executable).parent / "pip"
    if pip.exists():
        subprocess.run([str(pip), "install", "-q", "-r", str(REPO_ROOT / "agent" / "requirements.txt")], capture_output=True, text=True, timeout=900, check=True)
    return current_commit() or "?"


def _bridge_host() -> str:
    """BRIDGE_HOST env var wins; otherwise the address pair.py saved."""
    env = os.environ.get("BRIDGE_HOST", "").strip()
    if env:
        return env
    try:
        return (DATA_DIR / "bridge_host").read_text().strip()
    except OSError:
        return ""


BRIDGE_HOST = _bridge_host()

DEFAULT_CONFIG: Dict[str, Any] = {
    "version": 1,
    "settings": {"double_ms": 350, "hold_ms": 500, "group_on_level": 100, "default_fade": 0.5},
    "groups": [],
    "presets": [],
    "bindings": [],
}


class Agent:
    def __init__(self) -> None:
        self.bridge: Optional[Smartbridge] = None
        self.config: Dict[str, Any] = self._load_cached_config()
        self.ws = None  # hub socket
        self._send_q: asyncio.Queue = asyncio.Queue()
        self._bindings: Dict[str, Dict[str, list]] = {}  # "device/button" -> gesture -> actions
        self._button_keys: Dict[str, str] = {}  # button_id -> "device/button"
        self.gestures = GestureEngine(self._on_gesture, self._has_double)
        self.runner = ActionRunner(lambda: self.bridge, lambda: self.config, on_timer=self._on_timer)
        self.adder = AddSession(lambda: self.bridge, self.send)  # "Add a device" from the app
        self.hue = Hue(DATA_DIR, on_state=self._on_hue_state, on_loaded=self._merge_hue)
        self.runner.hue_set = self.hue.set_level
        self.runner.hue_color = self.hue.set_color
        self.runner.hue_scene = self.hue.recall_scene
        self.runner.memory_file = DATA_DIR / "last_on.json"
        self.runner.load_memory()
        self._index_bindings()
        self._state_flush: Optional[asyncio.Task] = None
        self._dirty_states: Dict[str, dict] = {}
        # Level and colour commands run in a lane per target and kind, latest wins: a fast swipe sends a stream
        # of levels and only the newest one still matters, so anything waiting behind a bridge round-trip is dropped.
        self._lanes: Dict[str, dict] = {}
        self.runner.local_time = self.local_time
        self.runner.sunset_hm = self.sunset_hm
        self._fired: Dict[str, str] = self._load_fired()  # schedule id -> local date it last fired
        # What the connector has seen, reported to the app so a dead button can be told apart from a dead link
        self._last_press_at: Optional[float] = None
        self._last_press: Optional[str] = None
        self._press_count = 0

    # ---------- config ----------
    def _load_cached_config(self) -> Dict[str, Any]:
        try:
            cfg = json.loads(CONFIG_CACHE.read_text())
            LOG.info("loaded cached config with %d bindings", len(cfg.get("bindings", [])))
            return cfg
        except FileNotFoundError:
            return dict(DEFAULT_CONFIG)
        except Exception as exc:  # noqa: BLE001
            LOG.warning("config cache unreadable (%s), starting empty", exc)
            return dict(DEFAULT_CONFIG)

    def apply_config(self, cfg: Dict[str, Any]) -> None:
        self.config = cfg
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            CONFIG_CACHE.write_text(json.dumps(cfg))
        except OSError as exc:
            LOG.warning("could not cache config: %s", exc)
        self._index_bindings()
        s = cfg.get("settings", {})
        self.gestures.configure(int(s.get("double_ms", 350)), int(s.get("hold_ms", 500)))
        LOG.info("config applied: %d bindings, %d groups, %d presets",
                 len(cfg.get("bindings", [])), len(cfg.get("groups", [])), len(cfg.get("presets", [])))

    def _index_bindings(self) -> None:
        idx: Dict[str, Dict[str, dict]] = {}
        for b in self.config.get("bindings", []):
            if b.get("enabled") is False:
                continue
            key = f"{b['device_id']}/{b['button_number']}"
            idx.setdefault(key, {})[b["gesture"]] = b
        self._bindings = idx

    def local_time(self) -> datetime:
        """Now, in the home's timezone (from the phone) rather than whatever the Pi's clock is set to."""
        tzname = self.config.get("settings", {}).get("timezone")
        if tzname:
            try:
                return datetime.now(ZoneInfo(tzname))
            except Exception:  # noqa: BLE001
                pass
        return datetime.now().astimezone()

    def _actions_for(self, binding: dict) -> list:
        night = binding.get("night")
        if night and night.get("actions"):
            s = self.config.get("settings", {})
            now_hm = self.local_time().strftime("%H:%M")
            if in_night_window(now_hm, s.get("night_start", "22:00"), s.get("night_end", "06:30")):
                return night["actions"]
        return binding.get("actions", [])

    def _has_double(self, key: str) -> bool:
        return "double" in self._bindings.get(key, {})

    # ---------- bridge ----------
    async def connect_bridge(self) -> None:
        key, crt, ca = (DATA_DIR / "caseta.key", DATA_DIR / "caseta.crt", DATA_DIR / "caseta-bridge.crt")
        for p in (key, crt, ca):
            if not p.exists():
                LOG.error("missing %s. Run:  python pair.py %s", p, BRIDGE_HOST or "<bridge-ip>")
                sys.exit(1)
        self.bridge = Smartbridge.create_tls(BRIDGE_HOST, str(key), str(crt), str(ca), on_connect_callback=self._on_bridge_connect)
        LOG.info("connecting to bridge at %s ...", BRIDGE_HOST)
        await self.bridge.connect()
        LOG.info("bridge connected: %d devices, %d buttons, %d scenes",
                 len(self.bridge.devices), len(self.bridge.buttons), len(self.bridge.scenes))
        self._wire_subscriptions()

    def _on_bridge_connect(self) -> None:
        # pylutron-caseta reconnects on its own; re-announce the inventory when it does.
        LOG.info("bridge (re)connected")
        if self.bridge and self.bridge.devices:
            self._wire_subscriptions()
            self._merge_hue(send=False)
            self.send({"type": "inventory", "inventory": self.inventory()})
            self.send({"type": "state", "states": self.all_states()})

    # ---------- Hue: its lights, rooms and scenes sit in the bridge's dictionaries under hue_ ids ----------
    def _merge_hue(self, send: bool = True) -> None:
        if not self.bridge:
            return
        for coll, src in ((self.bridge.devices, self.hue.devices), (self.bridge.areas, self.hue.areas), (self.bridge.scenes, self.hue.scenes)):
            for k in [k for k in coll if str(k).startswith("hue_")]:
                if k not in src:
                    del coll[k]
            for k, v in src.items():
                coll[k] = v
        if send:
            self.send({"type": "inventory", "inventory": self.inventory()})
            self.send({"type": "state", "states": self.all_states()})
            self.send({"type": "hue", "hue": self.hue.info()})

    def _on_hue_state(self, device_id: str) -> None:
        d = self.hue.devices.get(device_id)
        if not d:
            return
        st = _state_of(d)
        self._dirty_states[device_id] = st
        settle = self.runner.zone_changed(device_id, st.get("level"))
        if settle is not None:
            asyncio.create_task(settle)
        if self._state_flush is None or self._state_flush.done():
            self._state_flush = asyncio.create_task(self._flush_states())

    def _wire_subscriptions(self) -> None:
        assert self.bridge
        for button_id, btn in self.bridge.buttons.items():
            key = f"{btn['parent_device']}/{btn['button_number']}"
            self._button_keys[button_id] = key
            self.bridge.add_button_subscriber(button_id, lambda ev, b=button_id: self._on_button(b, ev))
        for device_id, dev in self.bridge.devices.items():
            if dev.get("zone"):
                self.bridge.add_subscriber(device_id, lambda d=device_id: self._on_zone(d))

    def inventory(self) -> Dict[str, Any]:
        assert self.bridge
        b = self.bridge
        devices = {}
        for did, d in b.devices.items():
            devices[did] = {
                "device_id": did,
                "name": d.get("device_name") or d.get("name"),
                "full_name": d.get("name"),
                "type": d.get("type"),
                "model": d.get("model"),
                "serial": d.get("serial"),
                "zone": d.get("zone"),
                "area": d.get("area"),
                "domain": _domain(d.get("type")),
            }
            if str(did).startswith("hue_") and (d.get("color") or d.get("ct")):
                # what the lamp can do, in the app's units: the mirek range becomes kelvin, widest first
                devices[did]["color"] = bool(d.get("color"))
                devices[did]["ct"] = bool(d.get("ct"))
                if d.get("ct"):
                    devices[did]["ct_range"] = [int(round(1_000_000 / d["ct"]["max"])), int(round(1_000_000 / d["ct"]["min"]))]
        buttons = {}
        for bid, bt in b.buttons.items():
            buttons[bid] = {
                "button_id": bid,
                "device_id": bt.get("parent_device"),
                "button_number": bt.get("button_number"),
            }
        areas = {aid: {"id": aid, "name": a.get("name"), "parent_id": a.get("parent_id")} for aid, a in b.areas.items()}
        scenes = {sid: {"scene_id": sid, "name": s.get("name")} for sid, s in b.scenes.items()}
        return {"devices": devices, "buttons": buttons, "areas": areas, "scenes": scenes,
                "bridge": {"host": BRIDGE_HOST}, "hue": self.hue.info()}

    def all_states(self) -> Dict[str, dict]:
        assert self.bridge
        out = {}
        for did, d in self.bridge.devices.items():
            if d.get("zone"):
                out[did] = _state_of(d)
        return out

    # ---------- events ----------
    def health(self) -> Dict[str, Any]:
        """What the connector has right now, so the app can say why a button might not be doing anything."""
        return {
            "bridge_ok": bool(self.bridge and self.bridge.devices),
            "buttons": len(self.bridge.buttons) if self.bridge else 0,
            "bindings": len(self.config.get("bindings", [])),
            "last_press_at": self._last_press_at,
            "last_press": self._last_press,
            "presses": self._press_count,
            "quiet_remotes": [did for did, d in (self.bridge.devices if self.bridge else {}).items()
                              if _domain(d.get("type")) == "pico"
                              and not any(b.get("parent_device") == did for b in self.bridge.buttons.values())],
        }

    def _on_button(self, button_id: str, event: str) -> None:
        key = self._button_keys.get(button_id)
        if event == "Press":
            self._last_press_at = time.time()
            self._last_press = key or f"unknown button {button_id}"
            self._press_count += 1
            self.send({"type": "health", "health": self.health()})
        if key is None:
            LOG.warning("press from button %s, which is not on any device we know", button_id)
            return
        device_id, _, num = key.partition("/")
        self.send({"type": "button", "device_id": device_id, "button_number": int(num), "event": event})
        if event == "Press":
            self.gestures.press(key)
        elif event == "Release":
            self.gestures.release(key)

    def _on_gesture(self, key: str, gesture: str) -> None:
        device_id, _, num = key.partition("/")
        binding = self._bindings.get(key, {}).get(gesture)
        actions = self._actions_for(binding) if binding else []
        LOG.info("gesture %s on pico %s button %s (%s)", gesture, device_id, num, "bound" if actions else "unbound")
        self.send({"type": "gesture", "device_id": device_id, "button_number": int(num), "gesture": gesture,
                   "bound": bool(actions), "binding_id": binding.get("id") if binding else None})
        if actions:
            asyncio.create_task(self._run_bound(actions, key, gesture))

    def _on_timer(self, target: str, ends_at: Optional[float], level: int) -> None:
        self.send({"type": "timer", "target": target, "ends_at": ends_at, "level": level})

    async def _run_bound(self, actions: list, key: str, gesture: str) -> None:
        try:
            await self.runner.run(actions)
        except Exception as exc:  # noqa: BLE001
            self.send({"type": "log", "level": "error", "msg": f"{gesture} on {key}: {exc}"})

    def _on_zone(self, device_id: str) -> None:
        assert self.bridge
        st = _state_of(self.bridge.devices[device_id])
        self._dirty_states[device_id] = st
        settle = self.runner.zone_changed(device_id, st.get("level"))
        if settle is not None:
            asyncio.create_task(settle)
        if self._state_flush is None or self._state_flush.done():
            self._state_flush = asyncio.create_task(self._flush_states())

    async def _flush_states(self) -> None:
        await asyncio.sleep(0.05)  # coalesce bursts (a group fade updates many zones at once)
        batch, self._dirty_states = self._dirty_states, {}
        self.send({"type": "state", "states": batch})

    # ---------- schedules ----------
    FIRED_FILE = DATA_DIR / "schedules.state.json"

    def _load_fired(self) -> Dict[str, str]:
        try:
            return json.loads(self.FIRED_FILE.read_text())
        except Exception:  # noqa: BLE001
            return {}

    def _save_fired(self) -> None:
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            self.FIRED_FILE.write_text(json.dumps(self._fired))
        except OSError as exc:
            LOG.warning("could not save schedule state: %s", exc)

    def _fire_time(self, sc: dict, day: datetime) -> Optional[datetime]:
        """When this schedule fires on the given local date, or None."""
        at = sc.get("at") or {}
        offset = timedelta(minutes=int(at.get("offset_min") or 0))
        if at.get("type") == "time" and at.get("time"):
            hh, mm = int(at["time"][:2]), int(at["time"][3:])
            return day.replace(hour=hh, minute=mm, second=0, microsecond=0) + offset
        loc = self.config.get("settings", {}).get("location")
        if not loc:
            return None
        rise, sset = sun_times(day.date(), float(loc["lat"]), float(loc["lng"]), day.tzinfo)
        base = rise if at.get("type") == "sunrise" else sset
        return (base + offset).replace(second=0, microsecond=0) if base else None

    async def schedule_loop(self) -> None:
        last_sun_push = 0.0
        while True:
            try:
                now = self.local_time()
                if time.time() - last_sun_push > 600:
                    last_sun_push = time.time()
                    self.send({"type": "sun", "sun": self.sun_today(), "next_runs": self.next_fire_times()})
                if now.year < 2025:  # a Pi has no clock battery; do not fire on a bogus date
                    await asyncio.sleep(20)
                    continue
                today = now.strftime("%Y-%m-%d")
                for sc in self.config.get("schedules", []):
                    if not sc.get("enabled", True):
                        continue
                    js_day = (now.weekday() + 1) % 7  # 0 = Sunday, like the app
                    if js_day not in (sc.get("days") or [0, 1, 2, 3, 4, 5, 6]):
                        continue
                    if self._fired.get(sc["id"]) == today:
                        continue
                    if sc.get("skip_until") and today <= sc["skip_until"]:
                        continue
                    when = self._fire_time(sc, now)
                    if when is None:
                        continue
                    # fire in the minute it is due (and catch up if we were down for less than 10 minutes)
                    if when <= now < when + timedelta(minutes=10):
                        self._fired[sc["id"]] = today
                        self._save_fired()
                        if not self._only_if_ok(sc):
                            LOG.info("schedule %s skipped: %s not met", sc.get("name") or sc["id"], sc.get("only_if"))
                            continue
                        LOG.info("schedule %s (%s) firing", sc.get("name") or sc["id"], sc["id"])
                        try:
                            await self.runner.run(sc.get("actions", []))
                            self.send({"type": "schedule", "id": sc["id"], "name": sc.get("name") or "", "ok": True})
                        except Exception as exc:  # noqa: BLE001
                            self.send({"type": "schedule", "id": sc["id"], "name": sc.get("name") or "", "ok": False, "error": str(exc)})
                    elif now >= when + timedelta(minutes=10):
                        self._fired[sc["id"]] = today  # missed it; do not run it hours late
                        self._save_fired()
            except Exception as exc:  # noqa: BLE001
                LOG.exception("schedule loop: %s", exc)
            await asyncio.sleep(20)

    def _only_if_ok(self, sc: dict) -> bool:
        cond = sc.get("only_if")
        if not cond:
            return True
        devs: List[str] = []
        for a in sc.get("actions", []):
            if a.get("target"):
                devs.extend(self.runner._resolve(a["target"]))
        if not devs:
            return True
        any_on = any((self.runner._level_of(d) or 0) > 0 for d in devs)
        return any_on if cond == "any_on" else not any_on

    def next_fire_times(self) -> Dict[str, Optional[str]]:
        """For the app: the next time each schedule will run, ISO, in the home's zone."""
        out: Dict[str, Optional[str]] = {}
        now = self.local_time()
        for sc in self.config.get("schedules", []):
            nxt = None
            for d in range(0, 8):
                day = now + timedelta(days=d)
                js_day = (day.weekday() + 1) % 7
                if js_day not in (sc.get("days") or [0, 1, 2, 3, 4, 5, 6]):
                    continue
                when = self._fire_time(sc, day)
                if when and when > now:
                    nxt = when.isoformat()
                    break
            out[sc["id"]] = nxt
        return out

    def sunset_hm(self) -> Optional[str]:
        loc = self.config.get("settings", {}).get("location")
        if not loc:
            return None
        now = self.local_time()
        _, sset = sun_times(now.date(), float(loc["lat"]), float(loc["lng"]), now.tzinfo)
        return sset.strftime("%H:%M") if sset else None

    def sun_today(self) -> Optional[dict]:
        """Today's sun, the clock in the home's zone, and what "on" means right now under the wind-down curve."""
        loc = self.config.get("settings", {}).get("location")
        now = self.local_time()
        out: dict = {"now": now.isoformat(), "sunrise": None, "sunset": None, "curve_level": None}
        if loc:
            rise, sset = sun_times(now.date(), float(loc["lat"]), float(loc["lng"]), now.tzinfo)
            out["sunrise"] = rise.isoformat() if rise else None
            out["sunset"] = sset.isoformat() if sset else None
        try:
            out["curve_level"] = self.runner.curve_level()
        except Exception:  # noqa: BLE001
            pass
        return out

    # ---------- hub link ----------
    def send(self, msg: dict) -> None:
        if HUB_URL:
            self._send_q.put_nowait(json.dumps(msg))

    async def hub_loop(self) -> None:
        if not HUB_URL:
            LOG.warning("HUB_URL not set: running local-only (bindings still work)")
            return
        url = HUB_URL + ("&" if "?" in HUB_URL else "?") + "token=" + AGENT_TOKEN
        backoff = 1
        while True:
            try:
                LOG.info("connecting to hub %s", HUB_URL)
                async with websockets.connect(url, ping_interval=20, ping_timeout=20, max_size=4 * 1024 * 1024) as ws:
                    self.ws = ws
                    backoff = 1
                    # Drop anything queued while offline; a fresh hello carries the current truth.
                    while not self._send_q.empty():
                        self._send_q.get_nowait()
                    await ws.send(json.dumps({
                        "type": "hello", "version": VERSION, "commit": current_commit(), "bridge": {"host": BRIDGE_HOST},
                        "inventory": self.inventory(), "states": self.all_states(),
                        "timers": self.runner.timers, "sun": self.sun_today(), "next_runs": self.next_fire_times(), "hue": self.hue.info(),
                        "health": self.health(),
                    }))
                    LOG.info("hub connected")
                    sender = asyncio.create_task(self._pump(ws))
                    try:
                        async for raw in ws:
                            await self._on_hub_message(json.loads(raw))
                    finally:
                        sender.cancel()
                        self.ws = None
            except (OSError, websockets.WebSocketException, asyncio.TimeoutError) as exc:
                LOG.warning("hub link down: %s (retry in %ss)", exc, backoff)
            except Exception as exc:  # noqa: BLE001
                LOG.exception("hub loop error: %s", exc)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)

    async def _pump(self, ws) -> None:
        while True:
            msg = await self._send_q.get()
            await ws.send(msg)

    async def _on_hub_message(self, msg: dict) -> None:
        t = msg.get("type")
        if t == "config":
            self.apply_config(msg["config"])
            self.send({"type": "sun", "sun": self.sun_today(), "next_runs": self.next_fire_times()})
            self.send({"type": "health", "health": self.health()})
        elif t == "command":
            cid = msg.get("id")
            action = msg.get("action") or {}
            if action.get("type") == "update":
                await self._update_and_restart(cid)
                return
            if action.get("type") in ("level", "color"):
                self._queue_level(cid, action)
                return
            try:
                kind = action.get("type")
                if kind == "refresh":
                    await self._refresh()
                    detail = {"devices": len(self.bridge.devices) if self.bridge else 0}
                elif kind == "add_start":
                    detail = await self.adder.start()
                elif kind == "add_stop":
                    detail = await self.adder.stop()
                elif kind == "add_create":
                    detail = await self.adder.create(action.get("serial"), action.get("name"), action.get("area"))
                    # the bridge lists a new device a few seconds after creating it: re-read until it shows up
                    serial = str(action.get("serial") or "")
                    made, buttons = None, 0
                    # The bridge lists the device a few seconds after creating it, and its buttons later still.
                    # Without the buttons nothing can be bound and no press ever reaches the app, so wait for
                    # them too, up to about a minute, re-reading a little less often as time goes on.
                    for attempt in range(12):
                        if attempt:
                            await asyncio.sleep(2 if attempt < 6 else 6)
                        await self._refresh()
                        made = next((did for did, d in (self.bridge.devices if self.bridge else {}).items()
                                     if str(d.get("serial") or "") == serial), None)
                        buttons = len([b for b in (self.bridge.buttons if self.bridge else {}).values()
                                       if b.get("parent_device") == made]) if made else 0
                        if made and buttons:
                            break
                    # The app needs the id to bring a device back that it had hidden after an earlier removal,
                    # and the button count to say honestly whether the remote can be set up yet.
                    detail["device_id"] = made
                    detail["buttons"] = buttons
                    detail["devices"] = len(self.bridge.devices) if self.bridge else 0
                    self.adder._note("buttons", f"/button for {made}", response={"buttons": buttons})
                elif kind == "hue_discover":
                    detail = {"bridges": await self.hue.discover()}
                elif kind == "hue_pair":
                    detail = await self.hue.pair(str(action.get("host") or ""))
                    self.send({"type": "hue", "hue": self.hue.info()})
                elif kind == "hue_forget":
                    detail = await self.hue.forget()
                    self._merge_hue()
                elif kind == "remove_device":
                    did = str(action.get("id") or "")
                    detail = await self.adder.remove(did)
                    for attempt in range(6):
                        if attempt:
                            await asyncio.sleep(2)
                        await self._refresh()
                        if not (self.bridge and did in self.bridge.devices):
                            break
                    # Some bridges keep a deleted device in their own list; the app hides it when we say so.
                    detail["still_listed"] = bool(self.bridge and did in self.bridge.devices)
                    detail["devices"] = len(self.bridge.devices) if self.bridge else 0
                else:
                    await self.runner.run_one(action)
                    detail = None
                self.send({"type": "result", "id": cid, "ok": True, "detail": detail})
            except Exception as exc:  # noqa: BLE001
                LOG.error("command %s failed: %s", action, exc)
                self.send({"type": "result", "id": cid, "ok": False, "error": str(exc)})

    def _queue_level(self, cid, action: dict) -> None:
        """Latest wins per target and kind: a level (or colour) waiting behind a bridge round-trip is superseded, not sent."""
        key = f"{action.get('type')}|{json.dumps(action.get('target'), sort_keys=True)}"
        lane = self._lanes.get(key)
        if lane is not None:
            waiting = lane.get("next")
            if waiting is not None:
                self.send({"type": "result", "id": waiting[0], "ok": True, "detail": {"superseded": True}})
            lane["next"] = (cid, action)
            return
        self._lanes[key] = {"next": (cid, action)}
        asyncio.create_task(self._level_lane(key))

    async def _level_lane(self, key: str) -> None:
        lane = self._lanes[key]
        try:
            while lane.get("next") is not None:
                cid, action = lane["next"]
                lane["next"] = None
                try:
                    await self.runner.run_one(action)
                    self.send({"type": "result", "id": cid, "ok": True, "detail": None})
                except Exception as exc:  # noqa: BLE001
                    LOG.error("command %s failed: %s", action, exc)
                    self.send({"type": "result", "id": cid, "ok": False, "error": str(exc)})
        finally:
            self._lanes.pop(key, None)

    async def _update_and_restart(self, cid) -> None:
        LOG.info("update requested by the hub")
        try:
            before = current_commit()
            new = await asyncio.get_running_loop().run_in_executor(None, self_update)
        except subprocess.CalledProcessError as exc:
            err = (exc.stderr or exc.stdout or str(exc)).strip()[-300:]
            LOG.error("update failed: %s", err)
            if self.ws:
                await self.ws.send(json.dumps({"type": "result", "id": cid, "ok": False, "error": f"update failed: {err}"}))
            return
        except Exception as exc:  # noqa: BLE001
            LOG.error("update failed: %s", exc)
            if self.ws:
                await self.ws.send(json.dumps({"type": "result", "id": cid, "ok": False, "error": str(exc)}))
            return
        LOG.info("updated %s -> %s, restarting", before, new)
        if self.ws:
            await self.ws.send(json.dumps({"type": "result", "id": cid, "ok": True, "detail": {"from": before, "to": new}}))
            await asyncio.sleep(0.2)
        if self.bridge:
            try:
                await self.bridge.close()
            except Exception:  # noqa: BLE001
                pass
        # Replace this process with a fresh one on the new code. Works with or without systemd/launchd.
        os.execv(sys.executable, [sys.executable, *sys.argv])

    async def button_watch(self) -> None:
        """A remote the bridge lists without its buttons can never be pressed: nothing is subscribed to it.
        The bridge does list them eventually, so look again every few minutes until it does, and say so."""
        while True:
            await asyncio.sleep(300)
            try:
                if not self.bridge:
                    continue
                quiet = [did for did, d in self.bridge.devices.items()
                         if _domain(d.get("type")) == "pico"
                         and not any(b.get("parent_device") == did for b in self.bridge.buttons.values())]
                if not quiet:
                    continue
                LOG.info("no buttons listed for %s, asking the bridge again", ", ".join(quiet))
                await self._refresh()
                still = [did for did in quiet
                         if not any(b.get("parent_device") == did for b in self.bridge.buttons.values())]
                if len(still) < len(quiet):
                    LOG.info("the bridge listed the buttons for %s", ", ".join(d for d in quiet if d not in still))
                self.send({"type": "health", "health": self.health()})
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                LOG.warning("button watch: %s", exc)

    async def _refresh(self) -> None:
        # Reconnect to re-read /device, /button, /virtualbutton after changes in the Lutron app.
        assert self.bridge
        await self.bridge.connect()
        self._wire_subscriptions()
        # connect() rebuilds the bridge's own dictionaries, so the Hue lights have to be put back beside them
        # or they would disappear from the app until the next Hue load.
        self._merge_hue(send=False)
        self.send({"type": "inventory", "inventory": self.inventory()})
        self.send({"type": "state", "states": self.all_states()})


def _domain(t: Optional[str]) -> str:
    if not t:
        return "other"
    if t.startswith("Pico") or t == "PaddleSwitchPico":
        return "pico"
    if t in ("WallDimmer", "PlugInDimmer", "InLineDimmer", "SunnataDimmer", "TempInWallPaddleDimmer",
             "WallDimmerWithPreset", "Dimmed", "DivaSmartDimmer", "PowPak0-10V", "SpectrumTune", "WhiteTune", "ColorTune"):
        return "light"
    if t in ("WallSwitch", "OutdoorPlugInSwitch", "PlugInSwitch", "InLineSwitch", "PowPakSwitch",
             "SunnataSwitch", "TempInWallPaddleSwitch", "Switched", "DivaSmartSwitch"):
        return "switch"
    if t in ("CasetaFanSpeedController", "MaestroFanSpeedController", "FanSpeed"):
        return "fan"
    if "Shade" in t or "Blind" in t or "Drape" in t or t in ("Shade", "Tilt"):
        return "cover"
    if t == "SmartBridge":
        return "bridge"
    if t == "HueLight":
        return "light"
    if t == "HueSwitch":
        return "switch"
    return "other"


def _state_of(d: dict) -> dict:
    lvl = d.get("current_state", -1)
    st = {"level": int(lvl) if isinstance(lvl, (int, float)) and lvl >= 0 else None, "fan_speed": d.get("fan_speed")}
    if str(d.get("device_id", "")).startswith("hue_"):
        c = color_state(d)  # {"mode": "ct" | "xy" | None, "kelvin", "xy", "hex"} for a lamp that can do either
        if c:
            st["color"] = c
    return st


async def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "info").upper(), format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("pylutron_caseta").setLevel(logging.WARNING)
    if not BRIDGE_HOST:
        LOG.error("no bridge address: run  python pair.py <bridge-ip>  first, or set BRIDGE_HOST")
        sys.exit(2)
    agent = Agent()
    await agent.connect_bridge()
    await agent.hue.start()  # no-op until a Hue bridge is paired from the app
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass
    hub = asyncio.create_task(agent.hub_loop())
    sched = asyncio.create_task(agent.schedule_loop())
    watch = asyncio.create_task(agent.button_watch())
    await stop.wait()
    hub.cancel()
    sched.cancel()
    watch.cancel()
    await agent.hue.stop()
    if agent.bridge:
        await agent.bridge.close()


if __name__ == "__main__":
    asyncio.run(main())
