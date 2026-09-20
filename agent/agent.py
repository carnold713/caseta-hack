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

import daylight
from engine import ActionRunner, GestureEngine, in_night_window
from adddevice import AddSession
from hue import Hue, color_state
from nanoleaf import Nanoleaf
from sun import solar_noon, sun_times

VERSION = "0.15.0"
# How long to wait before each fresh ask when the bridge refuses to report button presses. A test
# shortens these; nothing else should.
RESUB_WAITS = (2, 4, 6)
LOG = logging.getLogger("agent")


class BridgeWatch(logging.Handler):
    """Keeps what pylutron-caseta complains about, so the app can say it out loud.

    The library subscribes to the buttons one at a time and, on the first refusal, logs an error and
    stops: the rest never get subscribed and login still reports success. From the outside that is
    silent. The bridge lists every button, the connector looks healthy, and no press ever arrives
    again. Reading the library's own warnings back is the only way to tell that apart from a remote
    with a flat battery.
    """

    KEEP = 8

    # Lines the library logs loudly that are a known consequence of something this connector asked for.
    # The bridge answers an UpdateRequest twice: once straight away, and again with the same ClientTag
    # once the change has really happened. By then the library has dropped the request it was waiting on
    # and has nothing to match the second message to, so it logs an error for a bridge doing its job.
    # "Add a device" makes exactly two of those, entering association mode and leaving it.
    EXPECTED = (("was not expecting message with tag", "/system/status"),)

    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.notes: List[dict] = []
        self.sub_failed_at: Optional[float] = None

    @classmethod
    def expected(cls, text: str) -> bool:
        low = text.lower()
        return any(all(part in low for part in parts) for parts in cls.EXPECTED)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            text = record.getMessage()
        except Exception:  # noqa: BLE001  a broken log line must never take the connector down
            return
        if "status subscription" in text:
            self.sub_failed_at = record.created
        # kept either way: the panel exists to be read when something is wrong, and a line it decided
        # not to show is a line nobody can check. It is marked, not dropped.
        self.notes.append({"at": record.created, "level": record.levelname.lower(),
                           "ok": self.expected(text), "text": text[:300]})
        del self.notes[:-self.KEEP]


WATCH = BridgeWatch()
logging.getLogger("pylutron_caseta").addHandler(WATCH)


def lib_version() -> Optional[str]:
    """Which pylutron-caseta the Pi ended up with. requirements.txt holds it to one minor now, but the
    Pi is the only thing that knows what actually installed, so it is still worth saying out loud beside
    the connector's own version."""
    try:
        from importlib.metadata import version
        return version("pylutron-caseta")
    except Exception:  # noqa: BLE001
        return None

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
        self.nanoleaf = Nanoleaf(DATA_DIR, on_state=self._on_nanoleaf_state, on_loaded=self._merge_nanoleaf, send=self.send)
        # One callback slot per kind of action on ActionRunner (unchanged from when only Hue existed); what agent.py
        # hands it is a small dispatcher that looks at the device id's prefix and calls the matching backend, keyed
        # by this table, so a third backend is one more entry here rather than a new call site in engine.py.
        self._backends: Dict[str, Any] = {"hue_": self.hue, "nanoleaf_": self.nanoleaf}
        self.runner.hue_set = self._level_set_bridge
        self.runner.hue_color = self._color_set
        self.runner.hue_scene = self._scene_recall
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
        # Follow the day (daylight.py): the lamps whose white follows the sun, and what has happened to them.
        #   _follow_paused   set by hand since it was last switched on, so it has stopped following until it is
        #                    turned off and on again
        #   _follow_scene    switched on by a scene that said "follow the day", which cannot write the config
        #   _follow_cfg      what the config listed last time, so a lamp taken off the list stops following
        #   _follow_sent     device id -> the mireds last sent, so an invisible change is never sent
        #   _follow_lit      device id -> was it on when we last looked (an off to on is what applies it at once)
        self.runner.color_watch = self._color_by_hand
        self.runner.follow_start = self._follow_start
        self._follow_paused: set = set()
        self._follow_scene: set = set()
        self._follow_cfg: set = set()
        self._follow_sent: Dict[str, float] = {}
        self._follow_lit: Dict[str, bool] = {}
        self._fired: Dict[str, str] = self._load_fired()  # schedule id -> local date it last fired
        # What the connector has seen, reported to the app so a dead button can be told apart from a dead link
        self._last_press_at: Optional[float] = None
        self._last_press: Optional[str] = None
        self._press_count = 0
        self._started_at = time.time()
        # button_id/event -> when we last saw it. A retried subscription can leave one button subscribed
        # twice, and the bridge then reports its press twice; the second copy would read as a double tap.
        self._button_seen: Dict[str, float] = {}
        self._resubscribing = False
        self._resub_next = 0.0

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
        self._follow_config_changed()
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
        await self._ensure_buttons_subscribed()

    def _on_bridge_connect(self) -> None:
        # pylutron-caseta reconnects on its own; re-announce the inventory when it does.
        LOG.info("bridge (re)connected")
        if self.bridge and self.bridge.devices:
            self._wire_subscriptions()
            self._merge_hue(send=False)
            self._merge_nanoleaf(send=False)
            self.send({"type": "inventory", "inventory": self.inventory()})
            self.send({"type": "state", "states": self.all_states()})

    # ---------- dispatch: which backend a device id belongs to ----------
    def _backend_for(self, device_id: str) -> Optional[Any]:
        did = str(device_id)
        for prefix, backend in self._backends.items():
            if did.startswith(prefix):
                return backend
        return None

    async def _level_set_bridge(self, device_id: str, level: int, fade_s: Optional[float]) -> None:
        backend = self._backend_for(device_id)
        if backend is None:
            raise RuntimeError(f"no light backend for {device_id}")
        await backend.set_level(device_id, level, fade_s)

    async def _color_set(self, device_id: str, kelvin: Optional[float] = None, hex: Optional[str] = None, fade_s: Optional[float] = None, level: Optional[int] = None) -> None:  # noqa: A002
        backend = self._backend_for(device_id)
        if backend is None:
            raise RuntimeError(f"no light backend for {device_id}")
        await backend.set_color(device_id, kelvin=kelvin, hex=hex, fade_s=fade_s, level=level)

    async def _scene_recall(self, scene_id: str) -> None:
        backend = self._backend_for(scene_id)
        if backend is None or not hasattr(backend, "recall_scene"):
            raise RuntimeError(f"no backend can recall scene {scene_id}")
        await backend.recall_scene(scene_id)

    async def _warmth_set(self, device_id: str, kelvin: float, fade_s: Optional[float] = None, level: Optional[int] = None) -> bool:
        """Follow the day's own path to a lamp (agent.py's _follow_apply), one backend removed: same three
        promises as Hue.set_warmth and Nanoleaf.set_warmth, for whichever backend this id belongs to."""
        backend = self._backend_for(device_id)
        if backend is None:
            return False
        return await backend.set_warmth(device_id, kelvin, fade_s=fade_s, level=level)

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
        self._on_light_state(self.hue.devices, device_id)

    # ---------- Nanoleaf: a list of directly-paired controllers, each its own light in the same dictionaries ----------
    def _merge_nanoleaf(self, send: bool = True) -> None:
        if not self.bridge:
            return
        for k in [k for k in self.bridge.devices if str(k).startswith("nanoleaf_")]:
            if k not in self.nanoleaf.devices:
                del self.bridge.devices[k]
        for k, v in self.nanoleaf.devices.items():
            self.bridge.devices[k] = v
        if send:
            self.send({"type": "inventory", "inventory": self.inventory()})
            self.send({"type": "state", "states": self.all_states()})
            self.send({"type": "nanoleaf", "nanoleaf": self.nanoleaf.info()})

    def _on_nanoleaf_state(self, device_id: str) -> None:
        self._on_light_state(self.nanoleaf.devices, device_id)

    def _on_light_state(self, devices: Dict[str, dict], device_id: str) -> None:
        """Shared by every backend's on_state callback: update what the app is told, and let follow-the-day
        and a hold-to-dim ramp react the same way regardless of whose light this is."""
        d = devices.get(device_id)
        if not d:
            return
        st = _state_of(d)
        self._dirty_states[device_id] = st
        self._follow_zone(device_id, st.get("level"))
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

    async def _ensure_buttons_subscribed(self) -> None:
        """Ask the bridge again for the button events it refused.

        pylutron-caseta walks the button list and abandons the whole walk at the first refusal, so one
        bad answer costs every press on every remote until something restarts. Nothing above it is told.
        We only get here when BridgeWatch saw that refusal, because a second pass over buttons that did
        subscribe has the bridge report their presses twice (_on_button drops the repeat, but not asking
        twice is better than catching it late).
        """
        if not self.bridge or WATCH.sub_failed_at is None or self._resubscribing:
            return
        if time.time() < self._resub_next:
            return  # a round of asking just failed; a bridge that means it will still mean it in ten minutes
        self._resubscribing = True
        try:
            await self._resubscribe_buttons()
        finally:
            self._resubscribing = False
            self._resub_next = time.time() + 600

    async def _resubscribe_buttons(self) -> None:
        assert self.bridge
        for attempt, wait in enumerate(RESUB_WAITS, 1):
            await asyncio.sleep(wait)
            LOG.warning("the bridge refused a button subscription, asking again (%d of %d)", attempt, len(RESUB_WAITS))
            WATCH.sub_failed_at = None
            try:
                await self.bridge._subscribe_to_button_status()  # noqa: SLF001
            except Exception as exc:  # noqa: BLE001
                LOG.warning("button subscription retry failed: %s", exc)
                WATCH.sub_failed_at = time.time()
                continue
            if WATCH.sub_failed_at is None:
                LOG.info("button presses are being reported again")
                self.send({"type": "health", "health": self.health()})
                return
        LOG.error("the bridge is still refusing to report button presses; remotes will do nothing")
        self.send({"type": "health", "health": self.health()})

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
            if d.get("color") or d.get("ct"):
                # what the lamp can do, in the app's units: the mirek range becomes kelvin, widest first.
                # Only Hue and Nanoleaf devices ever set "color"/"ct" on their dict at all, so the dict's own
                # shape is what gates this, not which backend the id happens to belong to.
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
                "bridge": {"host": BRIDGE_HOST}, "hue": self.hue.info(), "nanoleaf": self.nanoleaf.info()}

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
            # False once the bridge has refused to report presses and would not take it back. This is the
            # difference between "your remote is broken" and "your bridge stopped talking about buttons".
            "buttons_ok": WATCH.sub_failed_at is None,
            "uptime_s": round(time.time() - self._started_at),
            "lib": lib_version(),
            "notes": WATCH.notes[-4:],
            # nothing in what the bridge has said needs anybody to do anything
            "quiet": all(n.get("ok") for n in WATCH.notes),
            "quiet_remotes": [did for did, d in (self.bridge.devices if self.bridge else {}).items()
                              if _domain(d.get("type")) == "pico"
                              and not any(b.get("parent_device") == did for b in self.bridge.buttons.values())],
        }

    def _on_button(self, button_id: str, event: str) -> None:
        now = time.time()
        seen = f"{button_id}/{event}"
        if now - self._button_seen.get(seen, 0.0) < 0.06:
            return  # the same press reported twice, from a button that ended up subscribed twice
        self._button_seen[seen] = now
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
        self._follow_zone(device_id, st.get("level"))
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
        out: dict = {"now": now.isoformat(), "sunrise": None, "sunset": None, "noon": None, "curve_level": None}
        if loc:
            rise, sset = sun_times(now.date(), float(loc["lat"]), float(loc["lng"]), now.tzinfo)
            out["sunrise"] = rise.isoformat() if rise else None
            out["sunset"] = sset.isoformat() if sset else None
            # solar noon exists even where the sun does not rise, and "Follow the day" hangs its curve on it
            out["noon"] = solar_noon(now.date(), float(loc["lng"]), now.tzinfo).isoformat()
        try:
            out["curve_level"] = self.runner.curve_level()
        except Exception:  # noqa: BLE001
            pass
        return out

    # ---------- follow the day ----------
    # A lamp set to follow the day keeps its white matched to the time of day, on its own, for as long as it is on.
    # The curve is agent/daylight.py, anchored to this home's sun. Three rules hold everywhere in here:
    #   it never turns a lamp on, it never touches a lamp that is off, and it never changes brightness unless the
    #   owner asked for that (and then only downwards, so it can never fight the evening wind-down).
    # Talking to the lamp goes through hue.set_warmth, which is the only path that does not send "on".
    def _follow_settings(self) -> Dict[str, Any]:
        fd = (self.config.get("settings") or {}).get("follow_day") or {}
        return {"ids": [str(i) for i in (fd.get("device_ids") or [])], "brightness": bool(fd.get("brightness"))}

    def following(self) -> List[str]:
        """Every lamp following the day right now: the ones the app lists, plus any a scene switched on, less the
        ones somebody has since set by hand."""
        s = self._follow_settings()
        ids = list(dict.fromkeys(list(s["ids"]) + sorted(self._follow_scene)))
        return [d for d in ids if d not in self._follow_paused]

    def _follow_config_changed(self) -> None:
        cfg = set(self._follow_settings()["ids"])
        for did in self._follow_cfg - cfg:      # taken off the list in the app: it stops following, scene or not
            self._follow_scene.discard(did)
            self._follow_paused.discard(did)
            self._follow_sent.pop(did, None)
        for did in cfg - self._follow_cfg:      # switched on in the app: a lamp paused earlier starts again
            self._follow_paused.discard(did)
        self._follow_cfg = cfg
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return
        asyncio.create_task(self._follow_apply())
        self._send_follow()

    def _day_of(self):
        """This home's sun as a date -> Day, or None when the app has not been told where the home is."""
        loc = (self.config.get("settings") or {}).get("location")
        if not loc:
            return None
        return daylight.day_of_home(float(loc["lat"]), float(loc["lng"]), self.local_time().tzinfo)

    def follow_state(self) -> Dict[str, Any]:
        """For the app: who is following, who was set by hand, and the white each one is showing."""
        return {
            "ids": self.following(),
            "paused": sorted(self._follow_paused),
            "kelvin": {d: daylight.mirek_to_kelvin(m) for d, m in self._follow_sent.items()},
            "brightness": self._follow_settings()["brightness"],
            "ready": self._day_of() is not None,
        }

    def _send_follow(self) -> None:
        self.send({"type": "follow", "follow": self.follow_state()})

    def _color_by_hand(self, device_id: str) -> None:
        """A colour or a warmth set by a person, a button or a scene: that lamp stops following until it is next
        turned off and on again. The follow loop itself never comes through here."""
        if device_id not in self.following():
            return
        LOG.info("%s was set by hand, so it stops following the day until it is next switched on", device_id)
        self._follow_paused.add(device_id)
        self._follow_sent.pop(device_id, None)
        self._send_follow()

    async def _follow_start(self, device_id: str) -> None:
        """A scene entry that says "follow the day": from now on it follows, starting at the white for right now."""
        self._follow_scene.add(device_id)
        self._follow_paused.discard(device_id)
        self._follow_sent.pop(device_id, None)
        await self._follow_apply([device_id], fade=2.0)
        self._send_follow()

    def _follow_zone(self, device_id: str, level: Optional[int]) -> None:
        """Every state change passes here: an off-to-on sets the white at once, and going off lets a lamp that was
        set by hand start following again the next time it comes on."""
        lit = bool(level and level > 0)
        was = self._follow_lit.get(device_id)
        self._follow_lit[device_id] = lit
        if was == lit:
            return
        if not lit:
            self._follow_sent.pop(device_id, None)
            if device_id in self._follow_paused:
                self._follow_paused.discard(device_id)
                self._send_follow()
            return
        if device_id in self.following():
            asyncio.create_task(self._follow_apply([device_id]))

    async def _follow_apply(self, only: Optional[List[str]] = None, fade: float = daylight.FADE_SECONDS) -> int:
        day_of = self._day_of()
        if day_of is None or not self.bridge:
            return 0
        want = set(self.following())
        ids = [d for d in (only if only is not None else sorted(want)) if d in want]
        if not ids:
            return 0
        now = self.local_time()
        settings = self._follow_settings()
        curve = self.runner.curve_level() if settings["brightness"] else None
        sent = 0
        for did in ids:
            dev = self.bridge.devices.get(did)
            ct = (dev or {}).get("ct")
            if not dev or not ct:
                continue
            here = self.runner._level_of(did)
            if here <= 0:            # off: leave it alone, and never turn it on
                continue
            mirek = daylight.lamp_mirek(now, day_of, ct.get("min"), ct.get("max"))
            shown = ct.get("mirek")
            # A lamp showing a colour is never "already right", whatever its white reads. ct.mirek is the
            # last white this lamp was told to show, and it survives the lamp being put on a colour: a
            # purple lamp whose stale white happens to match today's would be skipped for as long as the
            # two agreed, which is the whole afternoon. Only a lamp we can positively see is showing
            # white gets to be close enough to leave alone. No mode at all means a built-in effect or a
            # mode the app does not model, which is not white either: assert our own rather than assume.
            # That costs at most one redundant send, because sending sets the mode to "ct".
            on_white = dev.get("color_mode") == "ct"
            if on_white and not daylight.worth_sending(self._follow_sent.get(did), mirek) and (shown is None or abs(float(shown) - mirek) < daylight.MIN_STEP_MIREK):
                continue
            # brightness is the owner's choice and the evening wind-down's number, never a second curve of our own,
            # and it only ever comes down: a lamp already dimmer than the curve is left where it is
            level = int(curve) if curve is not None and here > curve else None
            try:
                ok = await self._warmth_set(did, daylight.mirek_to_kelvin(mirek), fade_s=fade, level=level)
            except Exception as exc:  # noqa: BLE001
                LOG.warning("follow the day: %s did not take it (%s)", did, exc)
                continue
            if ok:
                self._follow_sent[did] = mirek
                sent += 1
        if sent:
            self._send_follow()
        return sent

    async def follow_loop(self) -> None:
        """Every five minutes, the white every following lamp that is on should be showing."""
        while True:
            try:
                await self._follow_apply()
            except Exception as exc:  # noqa: BLE001
                LOG.exception("follow the day: %s", exc)
            await asyncio.sleep(daylight.EVERY_SECONDS)

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
                        "nanoleaf": self.nanoleaf.info(),
                        "follow": self.follow_state(),
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
            self._send_follow()
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
                elif kind and kind.startswith("room_"):
                    detail = await self._room_command(kind[5:], action)
                elif kind == "hue_discover":
                    detail = {"bridges": await self.hue.discover()}
                elif kind == "hue_pair":
                    detail = await self.hue.pair(str(action.get("host") or ""))
                    self.send({"type": "hue", "hue": self.hue.info()})
                elif kind == "hue_forget":
                    detail = await self.hue.forget()
                    self._merge_hue()
                elif kind == "nanoleaf_discover":
                    detail = {"devices": await self.nanoleaf.discover()}
                elif kind == "nanoleaf_pair":
                    detail = await self.nanoleaf.pair(str(action.get("host") or ""))
                    self._merge_nanoleaf()
                    self.send({"type": "nanoleaf", "nanoleaf": self.nanoleaf.info()})
                elif kind == "nanoleaf_forget":
                    detail = await self.nanoleaf.forget(str(action.get("serial") or ""))
                    self._merge_nanoleaf()
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

    # ---------- rooms on the bridges ----------
    # The app owns its rooms; these keep each bridge in step where it lets us. Hue documents rooms and obeys.
    # Lutron documents nothing here, so create_area and move_device try a couple of shapes and log every
    # exchange through the same AddSession log the add sheet already shows. A refusal comes back as an error and
    # the app keeps the room regardless: nothing the person did is lost.
    async def _room_command(self, op: str, action: dict) -> dict:
        if op == "area_create":
            return await self.adder.create_area(action.get("name"))
        if op == "area_rename":
            return await self.adder.rename_area(action.get("area"), action.get("name"))
        if op == "device_move":
            out = await self.adder.move_device(action.get("id"), action.get("area"))
            await self._refresh()
            return out
        if op == "hue_create":
            room = await self.hue.create_room(action.get("name"))
            self._merge_hue()
            return {"room": room, "name": action.get("name")}
        if op == "hue_rename":
            out = await self.hue.rename_room(str(action.get("room")), str(action.get("name")))
            self._merge_hue()
            return out
        if op == "hue_delete":
            out = await self.hue.delete_room(str(action.get("room")))
            self._merge_hue()
            return out
        if op == "hue_move":
            out = await self.hue.move_light(str(action.get("device")), str(action.get("room")))
            self._merge_hue()
            return out
        raise ValueError(f"unknown room command {op}")

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
        """Two ways a remote goes quiet, watched on the same loop.

        A remote the bridge lists without its buttons can never be pressed: nothing is subscribed to it.
        The bridge does list them eventually, so look again every few minutes until it does, and say so.
        The other way is the bridge refusing to report presses at all, which takes every remote out at
        once and is worth catching sooner, so that check runs on the shorter beat."""
        every = 30
        since_sweep = 0
        while True:
            await asyncio.sleep(every)
            since_sweep += every
            try:
                if not self.bridge:
                    continue
                await self._ensure_buttons_subscribed()
                if since_sweep < 300:
                    continue
                since_sweep = 0
                # Every sweep, whether or not anything is wrong: the app reads the connector's health out
                # of the last one of these, and a stale reading is what sends someone hunting the wrong fault.
                self.send({"type": "health", "health": self.health()})
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
        await self._ensure_buttons_subscribed()
        # connect() rebuilds the bridge's own dictionaries, so the Hue and Nanoleaf lights have to be put back
        # beside them or they would disappear from the app until the next load of each.
        self._merge_hue(send=False)
        self._merge_nanoleaf(send=False)
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
    if t == "NanoleafLight":
        return "light"
    return "other"


def _state_of(d: dict) -> dict:
    lvl = d.get("current_state", -1)
    st = {"level": int(lvl) if isinstance(lvl, (int, float)) and lvl >= 0 else None, "fan_speed": d.get("fan_speed")}
    if d.get("color") is not None or d.get("ct") is not None:
        # Any backend's lamp that says it can do colour or white temperature, not just Hue's: color_state
        # only reads the dict shape, so it already works for a Nanoleaf light unchanged.
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
    await agent.nanoleaf.start()  # no-op until a Nanoleaf controller is paired from the app
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
    follow = asyncio.create_task(agent.follow_loop())
    await stop.wait()
    hub.cancel()
    sched.cancel()
    watch.cancel()
    follow.cancel()
    await agent.hue.stop()
    await agent.nanoleaf.stop()
    if agent.bridge:
        await agent.bridge.close()


if __name__ == "__main__":
    asyncio.run(main())
