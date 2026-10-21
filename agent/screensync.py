"""Screen sync: a room's Hue colour lights follow the colours on a PC's screen.

The PC program (pc/screensync.py) looks at its screen about thirty times a second, shrinks it to a small grid of
colours and sends the grid here over the home network (UDP, port PC_PORT). The connector works out each light's
colour from the part of the screen nearest where that light stands, smooths it, and streams it to the Hue bridge in
its streaming mode (huestream.py) fifty times a second. Nothing goes through the hub: a round trip to the cloud
would put the lights visibly behind the screen.

  * Which room follows is the app's setting, config.settings.screen_sync.room. Its Hue colour lights are the ones
    that follow; Lutron lights cannot be streamed to.
  * Hue streams to an entertainment area: a set of lights with a position each. One that already holds exactly the
    room's lights is used (one made for Hue Sync, say); otherwise one is made, named for the room, with the lights
    spread left to right in name order ("left" and "right" in a name are honoured).
  * It starts when the PC's frames arrive and stops a few seconds after they stop (the PC asleep, locked, or the
    program closed). Stopping puts each light back as it was before.
  * While a stream runs the bridge ignores ordinary commands to its lights, so a person's command wins: anything
    from the app, a remote or a routine that touches one of them stops the stream first, and the sync stays paused
    (lights as that command left them) until it is resumed from the app or the PC, or the PC's frames stop and start
    again. Follow the day is automatic, not a person, and simply leaves those lights alone while they follow.
  * The PC finds the connector by broadcasting a query on PC_PORT; every answer, and an answer to every frame now
    and then, carries the sync's state, which the PC shows in its tray.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import huestream

LOG = logging.getLogger("screensync")

PC_PORT = 47700
FRAME = b"CSY1"          # a frame from the PC: FRAME, flags, width, height, then width*height RGB bytes
QUERY = b"CSQ1"          # the PC looking for the connector (broadcast)
STATE = b"CSS1"          # the connector's answer: STATE then the state as JSON
FLAG_RESUME = 0x01       # the PC asks to resume a paused sync
STREAM_HZ = 50
IDLE_S = 3.0             # no frame for this long: the PC has gone away
SMOOTH_S = 0.09          # how quickly a light catches up with the screen
SATURATE = 1.3           # screens average towards grey; a little more colour reads as the screen's own
SPREAD = 0.15            # how far across the screen a light looks, as a share of its width (the bell's width)
RETRY_S = 15.0           # after a start that failed, how long before trying again
REPLY_EVERY_S = 0.5      # how often a frame is answered with the state

# sRGB <-> linear light, so averages are taken the way light adds up
_LIN = [((i / 255) / 12.92) if i <= 10 else (((i / 255) + 0.055) / 1.055) ** 2.4 for i in range(256)]


def _enc(v: float) -> float:
    v = max(0.0, min(1.0, v))
    return v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055


def parse_frame(data: bytes) -> Optional[Tuple[int, int, int, bytes]]:
    """(flags, width, height, rgb) from a frame datagram, or None if it is not one."""
    if len(data) < 7 or data[:4] != FRAME:
        return None
    flags, w, h = data[4], data[5], data[6]
    rgb = data[7:]
    if not (1 <= w <= 64 and 1 <= h <= 64) or len(rgb) != w * h * 3:
        return None
    return flags, w, h, rgb


def weights(w: int, h: int, x: float, z: float) -> List[float]:
    """How much each cell of a w x h grid counts towards a light at (x, z): x from -1 (left) to 1 (right), z from
    -1 (floor) to 1 (ceiling), as Hue places entertainment channels. The side of the screen nearest the light counts
    most; height counts for a little, since a bar behind a monitor sees all of it."""
    cu, cv = (x + 1) / 2, 1 - (z + 1) / 2
    out = []
    for j in range(h):
        v = (j + 0.5) / h
        for i in range(w):
            u = (i + 0.5) / w
            out.append(math.exp(-((u - cu) ** 2) / (2 * SPREAD ** 2)) * math.exp(-((v - cv) ** 2) / (2 * 0.6 ** 2)))
    s = sum(out) or 1.0
    return [k / s for k in out]


def colour_of(rgb: bytes, wts: List[float]) -> Tuple[float, float, float]:
    """A light's colour from the grid, in linear light, 0..1, a little more saturated than the plain average."""
    r = g = b = 0.0
    for n, k in enumerate(wts):
        if k < 1e-4:
            continue
        r += _LIN[rgb[3 * n]] * k
        g += _LIN[rgb[3 * n + 1]] * k
        b += _LIN[rgb[3 * n + 2]] * k
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return tuple(max(0.0, min(1.0, y + (c - y) * SATURATE)) for c in (r, g, b))  # type: ignore[return-value]


def place(names: List[str]) -> List[Tuple[float, float]]:
    """Positions (x, z) for lights with these names when the connector makes the entertainment area: "left" and
    "right" in a name put it on that side, the rest are spread left to right in the order given."""
    out: List[Optional[Tuple[float, float]]] = [None] * len(names)
    rest = []
    for n, name in enumerate(names):
        low = name.lower()
        if "left" in low:
            out[n] = (-0.6, 0.0)
        elif "right" in low:
            out[n] = (0.6, 0.0)
        else:
            rest.append(n)
    for k, n in enumerate(rest):
        x = 0.0 if len(rest) == 1 else -0.6 + 1.2 * k / (len(rest) - 1)
        out[n] = (x, 0.0)
    return [p or (0.0, 0.0) for p in out]


class _PcPort(asyncio.DatagramProtocol):
    def __init__(self, sync: "ScreenSync") -> None:
        self.sync = sync
        self.transport: Optional[asyncio.DatagramTransport] = None

    def connection_made(self, transport) -> None:  # noqa: ANN001
        self.transport = transport

    def datagram_received(self, data: bytes, addr) -> None:  # noqa: ANN001
        try:
            self.sync.on_datagram(data, addr)
        except Exception as exc:  # noqa: BLE001  a bad datagram never stops the port
            LOG.debug("screen sync datagram from %s: %s", addr, exc)


class ScreenSync:
    def __init__(self, hue: Any, room_lights: Callable[[str], List[str]], config: Callable[[], dict],
                 send: Callable[[dict], None], room_name: Callable[[str], Optional[str]] = lambda r: None,
                 port: int = PC_PORT, stream_port: int = huestream.PORT) -> None:
        self.hue = hue
        self.room_lights = room_lights
        self.config = config
        self.send = send
        self.room_name = room_name
        self.port = port
        self.stream_port = stream_port
        self.paused = False
        self.streaming = False
        self.why: Optional[str] = None          # what is in the way, in words, for the app and the PC
        self.lights: List[str] = []              # hue_ ids following the screen while streaming
        self.area: Optional[dict] = None         # {"id", "name", "channels": [(channel_id, x, z)]}
        self._room_streaming: Optional[str] = None
        self._frame: Optional[Tuple[int, int, bytes]] = None
        self._frame_at = 0.0                     # monotonic
        self._session_from = 0.0                 # monotonic; when the PC's current run of frames began
        self._pc: Optional[Tuple[str, int]] = None
        self._pc_seen: Optional[float] = None    # wall clock, for the app
        self._replied_at = 0.0
        self._retry_at = 0.0
        self._lock = asyncio.Lock()
        self._dtls: Optional[huestream.DtlsPsk] = None
        self._snapshot: Dict[str, dict] = {}
        self._wts: Dict[int, List[float]] = {}
        self._wts_for: Optional[Tuple[int, int]] = None
        self._target: Dict[int, Tuple[float, float, float]] = {}
        self._shown: Dict[int, Tuple[float, float, float]] = {}
        self._seq = 0
        self._sent_n = 0
        self._fps = 0.0
        self._last_status: Optional[str] = None
        self._port: Optional[_PcPort] = None
        self._task: Optional[asyncio.Task] = None

    # ----- settings -----
    def room(self) -> Optional[str]:
        ss = ((self.config() or {}).get("settings") or {}).get("screen_sync") or {}
        r = ss.get("room")
        return str(r) if r else None

    # ----- the port the PC talks to -----
    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        try:
            _, self._port = await loop.create_datagram_endpoint(lambda: _PcPort(self), local_addr=("0.0.0.0", self.port),
                                                                allow_broadcast=True)
        except OSError as exc:
            LOG.warning("screen sync: cannot listen on UDP %d: %s", self.port, exc)
            self.why = f"the connector cannot listen for the PC ({exc})"
        self._task = loop.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None
        async with self._lock:
            await self._end(restore=True)
        if self._port and self._port.transport:
            self._port.transport.close()

    def on_datagram(self, data: bytes, addr) -> None:  # noqa: ANN001
        now = time.monotonic()
        if data[:4] == QUERY:
            self._reply(addr)
            return
        fr = parse_frame(data)
        if fr is None:
            return
        flags, w, h, rgb = fr
        if self._pc and addr[0] != self._pc[0] and now - self._frame_at < IDLE_S:
            return  # one PC at a time: another one's frames wait until this one has gone quiet
        if now - self._frame_at >= IDLE_S:
            self._session_from = now  # a fresh run of frames (the PC woke, or the program started)
            if self.paused:
                LOG.info("screen sync: the PC is back, so the pause is over")
            self.paused = False
        if flags & FLAG_RESUME and self.paused:
            self.paused = False
            self._retry_at = 0.0
        self._pc, self._pc_seen = (addr[0], addr[1]), time.time()
        self._frame, self._frame_at = (w, h, rgb), now
        if self.streaming:
            self._aim(w, h, rgb)
        if now - self._replied_at >= REPLY_EVERY_S:
            self._reply(addr)

    def _reply(self, addr) -> None:  # noqa: ANN001
        self._replied_at = time.monotonic()
        if self._port and self._port.transport:
            self._port.transport.sendto(STATE + json.dumps(self.status()).encode(), addr)

    # ----- what the app and the PC are told -----
    def state(self) -> str:
        room = self.room()
        if not room:
            return "off"
        if self.streaming:
            return "syncing"
        if self.paused:
            return "paused"
        if self.why:
            return "problem"
        if time.monotonic() - self._frame_at < IDLE_S:
            return "starting"
        return "waiting"

    def status(self) -> Dict[str, Any]:
        room = self.room()
        return {
            "state": self.state(), "room": room, "room_name": self.room_name(room) if room else None,
            "lights": list(self.lights), "area": (self.area or {}).get("name"), "why": self.why,
            "pc": {"address": self._pc[0], "seen_at": self._pc_seen} if self._pc else None,
            "fps": round(self._fps, 1), "stream_key": bool(getattr(self.hue, "clientkey", None)),
        }

    def _announce(self) -> None:
        st = self.status()
        key = json.dumps({k: v for k, v in st.items() if k not in ("pc", "fps")}, sort_keys=True)
        if key != self._last_status:
            self._last_status = key
            self.send({"type": "screen_sync", "screen_sync": st})

    # ----- the rest of the connector asks -----
    def owns(self, device_id: str) -> bool:
        """Whether this light is following the screen right now (so automatic changes leave it alone)."""
        return self.streaming and device_id in self.lights

    async def yield_for(self, device_id: str) -> None:
        """A person's command for a light that is following the screen: stop the stream first, so the bridge hears
        the command, and pause until somebody resumes it. The lights are not put back: the command decides."""
        if not self.owns(device_id):
            return
        async with self._lock:
            if not self.owns(device_id):
                return
            LOG.info("screen sync: %s was changed by hand, pausing", device_id)
            self.paused = True
            await self._end(restore=False)
        self._announce()

    def pause(self) -> None:
        self.paused = True

    def resume(self) -> None:
        self.paused = False
        self.why = None
        self._retry_at = 0.0

    # ----- the loop: start, stream, stop -----
    async def _run(self) -> None:
        period = 1 / STREAM_HZ
        count_from, counted = time.monotonic(), 0
        beat = time.monotonic()
        while True:
            try:
                # on a beat, so the time each pass takes does not slow the stream down
                beat = max(beat + (period if self.streaming else 0.1), time.monotonic() - period)
                await asyncio.sleep(max(0.0, beat - time.monotonic()))
                now = time.monotonic()
                room = self.room()
                fresh = now - self._frame_at < IDLE_S
                want = bool(room and fresh and not self.paused and getattr(self.hue, "paired", False))
                if not room and self.why:
                    self.why = None
                async with self._lock:
                    if self.streaming and (not want or room != self._room_streaming):
                        await self._end(restore=True)
                    elif want and not self.streaming and now >= self._retry_at:
                        try:
                            await self._begin(room)
                            self.why = None
                        except Exception as exc:  # noqa: BLE001
                            why = str(exc) or type(exc).__name__
                            if why != self.why:  # said once, not every RETRY_S while it stays true
                                LOG.warning("screen sync could not start: %s", why)
                            self.why = why
                            self._retry_at = now + RETRY_S
                            await self._end(restore=True)
                    if self.streaming:
                        self._step(period)
                        counted += 1
                if now - count_from >= 2:
                    self._fps, count_from, counted = counted / (now - count_from), now, 0
                self._announce()
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                LOG.warning("screen sync: %s", exc)
                self.why = str(exc)
                async with self._lock:
                    await self._end(restore=True)
                self._retry_at = time.monotonic() + RETRY_S

    async def _begin(self, room: str) -> None:
        hue = self.hue
        if not getattr(hue, "clientkey", None):
            raise RuntimeError("the Hue bridge needs its button pressed once more for screen sync")
        lights = [d for d in self.room_lights(room)
                  if str(d).startswith("hue_") and (hue.devices.get(d) or {}).get("color")]
        if not lights:
            raise RuntimeError("this room has no Hue colour lights")
        area = await self._area_for(room, lights)
        self._snapshot = {}
        for d in lights:
            try:
                self._snapshot[d] = (await hue._get(f"/clip/v2/resource/light/{hue.devices[d]['zone']}"))["data"][0]  # noqa: SLF001
            except Exception as exc:  # noqa: BLE001
                LOG.warning("screen sync: could not read %s before starting (%s)", d, exc)
        await hue._put(f"/clip/v2/resource/entertainment_configuration/{area['id']}", {"action": "start"})  # noqa: SLF001
        self.area, self.lights, self._room_streaming = area, lights, room
        identity = None
        try:
            identity = await hue.app_id()
        except Exception as exc:  # noqa: BLE001
            LOG.warning("screen sync: no application id from the bridge (%s), using the key", exc)
        self._dtls = huestream.DtlsPsk(hue.host, identity or hue.key, hue.clientkey, port=self.stream_port)
        try:
            await self._dtls.connect()
        except ImportError as exc:
            raise RuntimeError("the connector is missing pyOpenSSL; it installs with the next update") from exc
        self._wts_for = None
        self._shown, self._target = {}, {}
        if self._frame:
            self._aim(*self._frame)
            self._shown = dict(self._target)
        self.streaming = True
        LOG.info("screen sync: %s following the PC screen through %s", ", ".join(lights), area["name"])

    async def _end(self, restore: bool) -> None:
        was = self.streaming
        self.streaming = False
        if self._dtls is not None:
            self._dtls.close()
            self._dtls = None
        if self.area is not None:
            try:
                await self.hue._put(f"/clip/v2/resource/entertainment_configuration/{self.area['id']}", {"action": "stop"})  # noqa: SLF001
            except Exception as exc:  # noqa: BLE001
                LOG.warning("screen sync: stopping the stream: %s", exc)
        if restore and was:
            for d, lt in self._snapshot.items():
                body: Dict[str, Any] = {"on": {"on": bool((lt.get("on") or {}).get("on"))}}
                if lt.get("dimming"):
                    body["dimming"] = {"brightness": lt["dimming"].get("brightness", 100)}
                ct = lt.get("color_temperature") or {}
                if ct.get("mirek_valid") and ct.get("mirek"):
                    body["color_temperature"] = {"mirek": ct["mirek"]}
                elif (lt.get("color") or {}).get("xy"):
                    body["color"] = {"xy": lt["color"]["xy"]}
                try:
                    await self.hue._put(f"/clip/v2/resource/light/{self.hue.devices[d]['zone']}", body)  # noqa: SLF001
                except Exception as exc:  # noqa: BLE001
                    LOG.warning("screen sync: putting %s back: %s", d, exc)
        if was:
            LOG.info("screen sync stopped%s", ", lights put back" if restore else "")
        self.area, self.lights, self._snapshot = None, [], {}
        self._room_streaming = None

    async def _area_for(self, room: str, lights: List[str]) -> dict:
        """The entertainment area holding exactly these lights, made if there is none."""
        hue = self.hue
        want = {hue.devices[d]["zone"] for d in lights}
        configs = (await hue._get("/clip/v2/resource/entertainment_configuration")).get("data", [])  # noqa: SLF001
        for cfg in configs:
            have = {ls.get("rid") for ls in cfg.get("light_services") or []}
            if have == want:
                if cfg.get("status") == "active":
                    LOG.info("screen sync: %s is already streaming; taking it over", (cfg.get("metadata") or {}).get("name"))
                return _area(cfg)
        ents = (await hue._get("/clip/v2/resource/entertainment")).get("data", [])  # noqa: SLF001
        by_owner = {(e.get("owner") or {}).get("rid"): e["id"] for e in ents if e.get("renderer")}
        ordered = sorted(lights, key=lambda d: str(hue.devices[d].get("name") or ""))
        positions = place([str(hue.devices[d].get("name") or "") for d in ordered])
        locations = []
        for d, (x, z) in zip(ordered, positions):
            ent = by_owner.get(hue.devices[d].get("hue_owner"))
            if not ent:
                raise RuntimeError(f"{hue.devices[d].get('name') or d} cannot take part in Hue's streaming")
            locations.append({"service": {"rid": ent, "rtype": "entertainment"}, "positions": [{"x": x, "y": 0.8, "z": z}]})
        name = f"{self.room_name(room) or 'Room'} screen"[:32]
        made = await hue._post("/clip/v2/resource/entertainment_configuration", {  # noqa: SLF001
            "type": "entertainment_configuration", "metadata": {"name": name}, "configuration_type": "screen",
            "locations": {"service_locations": locations}})
        new_id = ((made.get("data") or [{}])[0]).get("rid")
        LOG.info("screen sync: made the entertainment area %s (%s)", name, new_id)
        cfg = (await hue._get(f"/clip/v2/resource/entertainment_configuration/{new_id}")).get("data", [{}])[0]  # noqa: SLF001
        return _area(cfg)

    # ----- colours -----
    def _aim(self, w: int, h: int, rgb: bytes) -> None:
        if not self.area:
            return
        if self._wts_for != (w, h):
            self._wts = {ch: weights(w, h, x, z) for ch, x, z in self.area["channels"]}
            self._wts_for = (w, h)
        self._target = {ch: colour_of(rgb, wt) for ch, wt in self._wts.items()}

    def _step(self, dt: float) -> None:
        if not self._dtls or not self._target:
            return
        a = 1 - math.exp(-dt / SMOOTH_S)
        out = []
        for ch, t in self._target.items():
            s = self._shown.get(ch, t)
            s = tuple(s[k] + (t[k] - s[k]) * a for k in range(3))
            self._shown[ch] = s
            out.append((ch, _enc(s[0]), _enc(s[1]), _enc(s[2])))
        self._seq = (self._seq + 1) & 0xFF
        self._dtls.send(huestream.message(self.area["id"], self._seq, out))
        self._sent_n += 1


def _area(cfg: dict) -> dict:
    chans = []
    for ch in cfg.get("channels") or []:
        pos = ch.get("position") or {}
        chans.append((int(ch.get("channel_id", 0)), float(pos.get("x", 0.0)), float(pos.get("z", 0.0))))
    return {"id": cfg["id"], "name": (cfg.get("metadata") or {}).get("name") or "Entertainment area", "channels": chans}


__all__ = ["ScreenSync", "PC_PORT", "parse_frame", "weights", "colour_of", "place"]
