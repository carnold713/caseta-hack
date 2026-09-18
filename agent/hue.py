"""Philips Hue bridge, spoken to directly on the home network (CLIP API v2).

One pairing: the person presses the round button on the Hue bridge and the bridge hands out an
application key, kept in DATA_DIR/hue.json. From then on the connector loads the bridge's lights,
rooms and scenes, listens to its event stream for live state, and sets levels with a fade.

Everything Hue is namespaced with "hue_" so it sits beside the Caseta devices in the same
dictionaries the action runner already reads: a light is "hue_<uuid>" (type HueLight or
HueSwitch, area "hue_<room uuid>", zone set so it counts as controllable, current_state 0..100),
a room is an area "hue_<uuid>". Hue's own scenes are not imported (this app makes its own).

A light that can do colour or white temperature says so in its device dict: "color" is
{"gamut": {"red": [x, y], "green": [x, y], "blue": [x, y]} or None, "xy": [x, y] or None} (None when
the lamp has no colour), "ct" is {"min": mirek, "max": mirek, "mirek": current or None} (None when it
has no tunable white), and "color_mode" is "ct", "xy" or None: which of the two the lamp is showing.
set_color takes kelvin or a hex colour, in the app's units; color.py does the conversions.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import aiohttp

from color import GAMUT_C, gamut_from_hue, hex_to_xy, kelvin_to_hex, kelvin_to_mirek, mirek_to_kelvin, xy_from_hue, xy_to_hex

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

    async def _post(self, path: str, body: dict) -> Any:
        async with self._sess().post(self._base() + path, headers={"hue-application-key": self.key or ""}, json=body) as r:
            if r.status >= 400:
                raise RuntimeError(f"Hue bridge said {r.status}: {(await r.text())[:200]}")
            return await r.json(content_type=None)

    async def _delete(self, path: str) -> Any:
        async with self._sess().delete(self._base() + path, headers={"hue-application-key": self.key or ""}) as r:
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
        # Hue's own scenes are deliberately not imported: scenes in this app are made here, and they
        # can hold Hue lights beside Caseta ones. recall_scene stays for anything that still references one.
        scenes: list = []
        # a room lists its devices; a light belongs to a device; so light -> device -> room
        device_room: Dict[str, str] = {}
        areas: Dict[str, dict] = {}
        for room in rooms:
            kids = [c["rid"] for c in room.get("children", []) or [] if c.get("rtype") == "device" and c.get("rid")]
            # The children are kept: moving a lamp between rooms is a rewrite of two rooms' children lists.
            areas[hid(room["id"])] = {"name": (room.get("metadata") or {}).get("name") or "Room", "parent_id": None, "children": kids}
            for rid in kids:
                device_room[rid] = hid(room["id"])
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
                "hue_owner": owner, "color": _color_of(lt.get("color")), "ct": _ct_of(lt.get("color_temperature")),
            }
            devices[did]["color_mode"] = _mode_of(devices[did], bool((lt.get("color_temperature") or {}).get("mirek_valid")))
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

    async def set_color(self, device_id: str, kelvin: Optional[float] = None, hex: Optional[str] = None, fade_s: Optional[float] = None, level: Optional[int] = None) -> None:  # noqa: A002
        """White temperature (kelvin, clamped to the lamp's range) or a colour (hex, clamped to its gamut), in one
        request. A colour change turns the lamp on, the same rule brightness follows; a level of 0 turns it off instead."""
        d = self.devices.get(device_id)
        if not d:
            raise RuntimeError(f"unknown Hue light {device_id}")
        if level is not None and int(level) <= 0:
            await self.set_level(device_id, 0, fade_s)
            return
        body: Dict[str, Any] = {"on": {"on": True}}
        if level is not None and d.get("type") == "HueLight":
            body["dimming"] = {"brightness": max(1, min(100, int(level)))}
        ct, color = d.get("ct"), d.get("color")
        mirek: Optional[int] = None
        xy: Optional[List[float]] = None
        if kelvin is not None and ct:
            mirek = max(int(ct["min"]), min(int(ct["max"]), kelvin_to_mirek(kelvin)))
            body["color_temperature"] = {"mirek": mirek}
        elif hex is not None and color:
            x, y = hex_to_xy(hex, color.get("gamut") or GAMUT_C)
            xy = [x, y]
            body["color"] = {"xy": {"x": x, "y": y}}
        else:
            raise RuntimeError(f"{d.get('name')} cannot do that colour")
        if fade_s:
            body["dynamics"] = {"duration": int(float(fade_s) * 1000)}
        await self._put(f"/clip/v2/resource/light/{d['zone']}", body)
        if level is not None:
            d["current_state"] = int(level)
        elif d["current_state"] <= 0:
            d["current_state"] = int(d.get("_bri") or 100)
        if mirek is not None:
            ct["mirek"] = mirek
            d["color_mode"] = "ct"
        if xy is not None:
            color["xy"] = xy
            d["color_mode"] = "xy"
        if self._on_state:
            self._on_state(device_id)

    async def set_warmth(self, device_id: str, kelvin: float, fade_s: Optional[float] = None, level: Optional[int] = None) -> bool:
        """The white alone, and only on a lamp that is already on: the way "Follow the day" talks to a lamp.
        It never sends "on", so it can never turn a lamp on, and it leaves brightness alone unless `level` is given.
        Returns False when the lamp is off or cannot do white temperature, so the caller knows nothing was sent."""
        d = self.devices.get(device_id)
        ct = (d or {}).get("ct")
        if not d or not ct:
            return False
        if int(d.get("current_state") or 0) <= 0:
            return False
        mirek = max(int(ct["min"]), min(int(ct["max"]), kelvin_to_mirek(kelvin)))
        body: Dict[str, Any] = {"color_temperature": {"mirek": mirek}}
        if level is not None and d.get("type") == "HueLight":
            body["dimming"] = {"brightness": max(1, min(100, int(level)))}
        if fade_s:
            body["dynamics"] = {"duration": int(float(fade_s) * 1000)}
        await self._put(f"/clip/v2/resource/light/{d['zone']}", body)
        ct["mirek"] = mirek
        d["color_mode"] = "ct"
        if level is not None:
            d["current_state"] = int(level)
        if self._on_state:
            self._on_state(device_id)
        return True

    # ----- rooms (CLIP v2 documents all of this, unlike the Lutron bridge) -----
    # A room holds *devices*, not lights: a lamp's device rid is what moves between rooms. "hue_" ids in, "hue_" ids
    # out, so the connector and the app speak about a Hue room the same way they speak about a Caseta area.
    @staticmethod
    def _uuid(room_id: str) -> str:
        rid = str(room_id or "")
        return rid[4:] if rid.startswith("hue_") else rid

    def _owner_of(self, device_id: str) -> str:
        d = self.devices.get(device_id)
        if not d:
            raise RuntimeError(f"unknown Hue light {device_id}")
        owner = d.get("hue_owner")
        if not owner:
            raise RuntimeError(f"{d.get('name')} does not say which Hue device it belongs to")
        return str(owner)

    async def create_room(self, name: str, device_ids: Optional[List[str]] = None) -> str:
        """POST /clip/v2/resource/room. Returns the new room's "hue_<uuid>" id."""
        children = []
        for did in device_ids or []:
            rid = self._owner_of(did)
            if rid not in children:
                children.append(rid)
        body = {"metadata": {"name": str(name)[:40] or "Room", "archetype": "other"},
                "children": [{"rid": rid, "rtype": "device"} for rid in children]}
        data = await self._post("/clip/v2/resource/room", body)
        rid = ((data or {}).get("data") or [{}])[0].get("rid")
        if not rid:
            raise RuntimeError("the Hue bridge did not say which room it made")
        await self.load()
        LOG.info("hue: made room %s (%s)", name, rid)
        return hid(rid)

    async def rename_room(self, room_id: str, name: str) -> dict:
        """PUT the room's metadata. The Hue app shows the new name at once."""
        if room_id not in self.areas:
            raise RuntimeError(f"unknown Hue room {room_id}")
        new = str(name)[:40] or "Room"
        await self._put(f"/clip/v2/resource/room/{self._uuid(room_id)}", {"metadata": {"name": new}})
        self.areas[room_id]["name"] = new
        return {"room": room_id, "name": new}

    async def delete_room(self, room_id: str) -> dict:
        """DELETE the room. Its lamps stay on the bridge; they simply have no room until one takes them."""
        if room_id not in self.areas:
            raise RuntimeError(f"unknown Hue room {room_id}")
        await self._delete(f"/clip/v2/resource/room/{self._uuid(room_id)}")
        self.areas.pop(room_id, None)
        for d in self.devices.values():
            if d.get("area") == room_id:
                d["area"] = None
        if self._on_loaded:
            self._on_loaded()
        return {"room": room_id, "deleted": True}

    async def move_light(self, device_id: str, room_id: Optional[str]) -> dict:
        """Put a lamp in a room by rewriting which rooms' children hold its device rid. room_id None takes it out
        of every room. Nothing else about the lamp changes."""
        rid = self._owner_of(device_id)
        if room_id is not None and room_id not in self.areas:
            raise RuntimeError(f"unknown Hue room {room_id}")
        for aid, area in self.areas.items():
            kids = list(area.get("children") or [])
            if rid in kids and aid != room_id:
                kids.remove(rid)
                await self._put(f"/clip/v2/resource/room/{self._uuid(aid)}", {"children": [{"rid": k, "rtype": "device"} for k in kids]})
                area["children"] = kids
        if room_id is not None:
            area = self.areas[room_id]
            kids = list(area.get("children") or [])
            if rid not in kids:
                kids.append(rid)
                await self._put(f"/clip/v2/resource/room/{self._uuid(room_id)}", {"children": [{"rid": k, "rtype": "device"} for k in kids]})
                area["children"] = kids
        # every light on that Hue device follows it, which is what the bridge itself does
        for did, d in self.devices.items():
            if d.get("hue_owner") == rid:
                d["area"] = room_id
        if self._on_loaded:
            self._on_loaded()
        return {"device": device_id, "room": room_id}

    async def recall_scene(self, scene_id: str) -> None:
        if scene_id not in self.scenes:
            raise RuntimeError(f"unknown Hue scene {scene_id}")
        await self._put(f"/clip/v2/resource/scene/{scene_id[4:]}", {"recall": {"action": "active"}})

    # ----- live state -----
    async def _event_loop(self) -> None:
        backoff = 2
        # This stream carries only what happens while it is held open: Hue replays no backlog on reconnect.
        # So everything that changed while it was down is still wrong in self.devices, and nothing else here
        # ever re-reads: start() loads once, and the agent's own _refresh only reconnects the Lutron bridge.
        # A lamp switched at the wall or in Hue's app during a drop therefore stayed wrong until it happened
        # to change again. One re-read on the way back closes that; load() fires _on_loaded, which is what
        # re-announces the corrected state to the app.
        stale = False
        while self.paired:
            try:
                async with self._sess().get(self._base() + "/eventstream/clip/v2", headers={"hue-application-key": self.key or "", "Accept": "text/event-stream"}, timeout=aiohttp.ClientTimeout(total=None, sock_read=None)) as r:
                    r.raise_for_status()
                    backoff = 2
                    if stale:
                        stale = False
                        try:
                            await self.load()
                        except Exception as exc:  # noqa: BLE001
                            LOG.warning("hue resync after reconnect failed: %s", exc)
                    async for raw in r.content:
                        line = raw.decode("utf-8", "replace").strip()
                        if line.startswith("data:"):
                            self._on_event(line[5:].strip())
                # ended without raising, which is still a gap. The pause is what stops a bridge that closes
                # immediately from turning this into a hot reconnect loop.
                stale = True
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                stale = True
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
                ct_valid: Optional[bool] = None
                if "color_temperature" in item and d.get("ct"):
                    cte = item["color_temperature"] or {}
                    if cte.get("mirek") is not None:
                        d["ct"]["mirek"] = int(cte["mirek"])
                    if "mirek_valid" in cte:
                        ct_valid = bool(cte["mirek_valid"])
                if "color" in item and d.get("color"):
                    xy = xy_from_hue(item["color"])
                    if xy:
                        d["color"]["xy"] = xy
                        if ct_valid is None:
                            ct_valid = False
                if ct_valid is not None:
                    d["color_mode"] = _mode_of(d, ct_valid)
                on = d.get("_on", d["current_state"] > 0)
                bri = d.get("_bri", d["current_state"] or 100)
                d["current_state"] = int(round(bri)) if on else 0
                if self._on_state:
                    self._on_state(did)


# ----- colour and white temperature, as the device dict carries them -----
def _color_of(color: Optional[dict]) -> Optional[dict]:
    if not color:
        return None
    return {"gamut": gamut_from_hue(color), "xy": xy_from_hue(color)}


def _ct_of(ct: Optional[dict]) -> Optional[dict]:
    if not ct:
        return None
    schema = ct.get("mirek_schema") or {}
    lo = int(schema.get("mirek_minimum") or 153)
    hi = int(schema.get("mirek_maximum") or 500)
    mirek = ct.get("mirek")
    return {"min": lo, "max": hi, "mirek": int(mirek) if mirek is not None else None}


def _mode_of(d: dict, ct_valid: bool) -> Optional[str]:
    if ct_valid and d.get("ct") and d["ct"].get("mirek") is not None:
        return "ct"
    if d.get("color") and d["color"].get("xy"):
        return "xy"
    return None


def color_state(d: dict) -> Optional[dict]:
    """What the app shows for a lamp: {"mode", "kelvin", "xy", "hex"}, or None for a lamp with neither."""
    ct, color = d.get("ct"), d.get("color")
    if not ct and not color:
        return None
    mode = d.get("color_mode")
    kelvin = mirek_to_kelvin(ct["mirek"]) if ct and ct.get("mirek") else None
    xy = list(color["xy"]) if color and color.get("xy") else None
    if mode == "xy" and xy:
        hex_str: Optional[str] = xy_to_hex(xy[0], xy[1], 1.0, color.get("gamut") or GAMUT_C)
    elif kelvin:
        hex_str = kelvin_to_hex(kelvin)
    elif xy:
        hex_str = xy_to_hex(xy[0], xy[1], 1.0, color.get("gamut") or GAMUT_C)
    else:
        hex_str = None
    return {"mode": mode, "kelvin": kelvin, "xy": xy, "hex": hex_str}
