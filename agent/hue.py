"""Philips Hue bridge, spoken to directly on the home network (CLIP API v2).

One pairing: the person presses the round button on the Hue bridge and the bridge hands out an
application key, kept in DATA_DIR/hue.json. From then on the connector loads the bridge's lights,
rooms and scenes, listens to its event stream for live state, and sets levels with a fade.

Everything Hue is namespaced with "hue_" so it sits beside the Caseta devices in the same
dictionaries the action runner already reads: a light is "hue_<uuid>" (type HueLight or
HueSwitch, area "hue_<room uuid>", zone set so it counts as controllable, current_state 0..100),
a room is an area "hue_<uuid>", a scene is "hue_<uuid>". Colour is left for later; this pass is
on, off, brightness, rooms, scenes and live state.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import aiohttp

LOG = logging.getLogger("hue")
DISCOVERY_URL = "https://discovery.meethue.com/"
PAIR_SECONDS = 45


def hid(uuid: str) -> str:
    return f"hue_{uuid}"


class Hue:
    def __init__(self, data_dir: Path, on_state: Optional[Callable[[str], None]] = None, on_loaded: Optional[Callable[[], None]] = None, scheme: str = "https") -> None:
        self.file = data_dir / "hue.json"
        self.host: Optional[str] = None
        self.key: Optional[str] = None
        self.scheme = scheme
        self.devices: Dict[str, dict] = {}     # hue_<light> -> pylutron-shaped device dict
        self.areas: Dict[str, dict] = {}       # hue_<room> -> {name, parent_id}
        self.scenes: Dict[str, dict] = {}      # hue_<scene> -> {name}
        self._on_state = on_state
        self._on_loaded = on_loaded
        self._session: Optional[aiohttp.ClientSession] = None
        self._events: Optional[asyncio.Task] = None
        self.error: Optional[str] = None
        self.loaded_at: float = 0.0
        try:
            saved = json.loads(self.file.read_text())
            self.host, self.key = saved.get("host"), saved.get("key")
        except Exception:  # noqa: BLE001
            pass

    # ----- state for the app -----
    @property
    def paired(self) -> bool:
        return bool(self.host and self.key)

    def info(self) -> dict:
        return {"paired": self.paired, "host": self.host, "lights": len(self.devices), "rooms": len(self.areas), "scenes": len(self.scenes), "error": self.error, "live": bool(self._events and not self._events.done())}

    # ----- http -----
    def _base(self) -> str:
        return f"{self.scheme}://{self.host}"

    def _sess(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False), timeout=aiohttp.ClientTimeout(total=10))
        return self._session

    async def _get(self, path: str) -> Any:
        async with self._sess().get(self._base() + path, headers={"hue-application-key": self.key or ""}) as r:
            r.raise_for_status()
            return await r.json(content_type=None)

    async def _put(self, path: str, body: dict) -> Any:
        async with self._sess().put(self._base() + path, headers={"hue-application-key": self.key or ""}, json=body) as r:
            if r.status >= 400:
                raise RuntimeError(f"Hue bridge said {r.status}: {(await r.text())[:200]}")
            return await r.json(content_type=None)

    # ----- discovery and pairing -----
    async def discover(self) -> List[dict]:
        """Bridges on the network: mDNS first, then Philips' discovery service."""
        found: Dict[str, dict] = {}
        try:
            from zeroconf import ServiceBrowser, Zeroconf  # noqa: WPS433

            zc = Zeroconf()
            loop = asyncio.get_running_loop()

            class L:  # noqa: N801
                def add_service(self, z, t, name):  # noqa: ANN001
                    info = z.get_service_info(t, name, 2000)
                    if info and info.parsed_addresses():
                        found[info.parsed_addresses()[0]] = {"host": info.parsed_addresses()[0], "id": (info.properties or {}).get(b"bridgeid", b"").decode() or None, "name": name.split(".")[0]}

                def update_service(self, *a):  # noqa: ANN001
                    pass

                def remove_service(self, *a):  # noqa: ANN001
                    pass

            ServiceBrowser(zc, "_hue._tcp.local.", L())
            await asyncio.sleep(3)
            await loop.run_in_executor(None, zc.close)
        except Exception as exc:  # noqa: BLE001
            LOG.warning("hue mdns discovery failed: %s", exc)
        if not found:
            try:
                async with self._sess().get(DISCOVERY_URL) as r:
                    for b in await r.json(content_type=None):
                        ip = b.get("internalipaddress")
                        if ip:
                            found[ip] = {"host": ip, "id": b.get("id"), "name": "Hue bridge"}
            except Exception as exc:  # noqa: BLE001
                LOG.warning("hue cloud discovery failed: %s", exc)
        return list(found.values())

    async def pair(self, host: str, seconds: int = PAIR_SECONDS) -> dict:
        """Ask the bridge for a key until the button is pressed or time runs out."""
        self.host = host
        deadline = time.monotonic() + seconds
        last = "link button not pressed"
        while time.monotonic() < deadline:
            try:
                async with self._sess().post(self._base() + "/api", json={"devicetype": "picohack#connector", "generateclientkey": True}) as r:
                    data = await r.json(content_type=None)
                item = data[0] if isinstance(data, list) and data else {}
                if "success" in item:
                    self.key = item["success"]["username"]
                    self.file.parent.mkdir(parents=True, exist_ok=True)
                    self.file.write_text(json.dumps({"host": self.host, "key": self.key}))
                    self.error = None
                    await self.start()
                    return self.info()
                last = (item.get("error") or {}).get("description", last)
            except Exception as exc:  # noqa: BLE001
                last = str(exc)
            await asyncio.sleep(2)
        self.host = None
        raise RuntimeError(f"the Hue bridge did not hand out a key: {last}")

    async def forget(self) -> dict:
        await self.stop()
        self.host = self.key = None
        self.devices, self.areas, self.scenes = {}, {}, {}
        try:
            self.file.unlink()
        except OSError:
            pass
        return self.info()

    # ----- loading -----
    async def start(self) -> None:
        if not self.paired:
            return
        try:
            await self.load()
            self.error = None
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)
            LOG.warning("hue load failed: %s", exc)
        if self._events is None or self._events.done():
            self._events = asyncio.get_running_loop().create_task(self._event_loop())

    async def stop(self) -> None:
        if self._events:
            self._events.cancel()
            self._events = None
        if self._session and not self._session.closed:
            await self._session.close()

    async def load(self) -> None:
        lights = (await self._get("/clip/v2/resource/light")).get("data", [])
        rooms = (await self._get("/clip/v2/resource/room")).get("data", [])
        scenes = (await self._get("/clip/v2/resource/scene")).get("data", [])
        # a room lists its devices; a light belongs to a device; so light -> device -> room
        device_room: Dict[str, str] = {}
        areas: Dict[str, dict] = {}
        for room in rooms:
            areas[hid(room["id"])] = {"name": (room.get("metadata") or {}).get("name") or "Room", "parent_id": None}
            for child in room.get("children", []):
                if child.get("rtype") == "device":
                    device_room[child["rid"]] = hid(room["id"])
        devices: Dict[str, dict] = {}
        for lt in lights:
            owner = (lt.get("owner") or {}).get("rid")
            did = hid(lt["id"])
            dimmable = "dimming" in lt
            on = bool((lt.get("on") or {}).get("on"))
            bri = float((lt.get("dimming") or {}).get("brightness", 100 if on else 0))
            devices[did] = {
                "device_id": did, "name": (lt.get("metadata") or {}).get("name") or "Hue light", "device_name": (lt.get("metadata") or {}).get("name") or "Hue light",
                "type": "HueLight" if dimmable else "HueSwitch", "model": "Hue", "serial": lt["id"],
                "zone": lt["id"], "area": device_room.get(owner), "current_state": int(round(bri)) if on else 0, "fan_speed": None,
                "hue_owner": owner, "color": bool(lt.get("color")), "ct": bool(lt.get("color_temperature")),
            }
        sc: Dict[str, dict] = {}
        for s in scenes:
            group = (s.get("group") or {})
            room = hid(group["rid"]) if group.get("rtype") == "room" else None
            sc[hid(s["id"])] = {"name": (s.get("metadata") or {}).get("name") or "Scene", "area": room}
        self.devices, self.areas, self.scenes = devices, areas, sc
        self.loaded_at = time.time()
        LOG.info("hue: %d lights, %d rooms, %d scenes", len(devices), len(areas), len(sc))
        if self._on_loaded:
            self._on_loaded()

    # ----- control -----
    async def set_level(self, device_id: str, level: int, fade_s: Optional[float] = None) -> None:
        d = self.devices.get(device_id)
        if not d:
            raise RuntimeError(f"unknown Hue light {device_id}")
        body: Dict[str, Any] = {"on": {"on": level > 0}}
        if level > 0 and d.get("type") == "HueLight":
            body["dimming"] = {"brightness": max(1, min(100, int(level)))}
        if fade_s:
            body["dynamics"] = {"duration": int(float(fade_s) * 1000)}
        await self._put(f"/clip/v2/resource/light/{d['zone']}", body)
        d["current_state"] = int(level)
        if self._on_state:
            self._on_state(device_id)

    async def recall_scene(self, scene_id: str) -> None:
        if scene_id not in self.scenes:
            raise RuntimeError(f"unknown Hue scene {scene_id}")
        await self._put(f"/clip/v2/resource/scene/{scene_id[4:]}", {"recall": {"action": "active"}})

    # ----- live state -----
    async def _event_loop(self) -> None:
        backoff = 2
        while self.paired:
            try:
                async with self._sess().get(self._base() + "/eventstream/clip/v2", headers={"hue-application-key": self.key or "", "Accept": "text/event-stream"}, timeout=aiohttp.ClientTimeout(total=None, sock_read=None)) as r:
                    r.raise_for_status()
                    backoff = 2
                    async for raw in r.content:
                        line = raw.decode("utf-8", "replace").strip()
                        if line.startswith("data:"):
                            self._on_event(line[5:].strip())
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                LOG.warning("hue event stream: %s (retry in %ss)", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)

    def _on_event(self, payload: str) -> None:
        try:
            events = json.loads(payload)
        except ValueError:
            return
        for ev in events if isinstance(events, list) else []:
            for item in ev.get("data", []):
                if item.get("type") != "light":
                    continue
                did = hid(item.get("id", ""))
                d = self.devices.get(did)
                if not d:
                    continue
                if "on" in item:
                    d["_on"] = bool(item["on"].get("on"))
                if "dimming" in item:
                    d["_bri"] = float(item["dimming"].get("brightness", d.get("_bri", 100)))
                on = d.get("_on", d["current_state"] > 0)
                bri = d.get("_bri", d["current_state"] or 100)
                d["current_state"] = int(round(bri)) if on else 0
                if self._on_state:
                    self._on_state(did)
