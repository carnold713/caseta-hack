"""Screen sync: a room's Hue colour lights and Nanoleaf panels follow the colours on a PC's screen.

The PC program (pc/screensync.py) looks at its screen about thirty times a second, shrinks it to a small grid of
colours and sends the grid here over the home network (UDP, port PC_PORT). The connector works out each light's
colour from the part of the screen nearest where that light stands, smooths it, and streams it to the Hue bridge in
its streaming mode (huestream.py) fifty times a second, and to each Nanoleaf controller in its own (nanostream.py),
a colour per panel. Nothing goes through the hub: a round trip to the cloud would put the lights visibly behind the
screen.

  * Which room follows is the app's setting, config.settings.screen_sync.room. Its Hue colour lights and Nanoleaf
    controllers can follow; Lutron lights cannot be streamed to.
  * Where each one stands is the app's too: settings.screen_sync.lights, {device id: {x, y, on}}, set by dragging
    it on the positions page. x and y are measured from the screen: -1 to 1 is its left to right edge and its top to
    bottom edge, and a light can stand outside it (up to 3 either way), where it takes the colour of the nearest
    edge. "on" false leaves a light out. A light with no position gets one: Hue lights spread across the screen in
    name order ("left" and "right" in a name honoured), a Nanoleaf beside it on the right.
  * A Nanoleaf's panels each take their own colour, from where they sit in the set's layout around its position.
  * So do a gradient Hue light's sections (a Play gradient tube or lightstrip: one light, several colours along it).
    They are laid out as the light's channels are in Hue's entertainment area when that area says where each one is
    (one made in the Hue app knows a strip goes up, across and down a monitor), and otherwise in a straight line in
    their own order. Either way the whole is stretched to the light's "span" (screen units, default the screen's
    width; the positions page's handle) and can be turned round ("flip").
  * Hue streams to an entertainment area: a set of lights. One that already holds exactly the following Hue lights
    is used (one made for Hue Sync, say); otherwise one is made, named for the room. The colours come from the
    positions above, not from the area's own.
  * It starts when the PC's frames arrive and stops a few seconds after they stop (the PC asleep, locked, or the
    program closed). Stopping puts each light back as it was before.
  * While a stream runs the bridge ignores ordinary commands to its lights, so a person's command wins: anything
    from the app, a remote or a routine that touches one of them stops the stream first, and the sync stays paused
    (lights as that command left them) until it is resumed from the app or the PC, or the PC's frames stop and start
    again. Follow the day is automatic, not a person, and simply leaves those lights alone while they follow.
  * On and off is a second thing, kept by the connector across restarts (DATA_DIR/screensync.json): the app's
    switch and a remote's "PC screen on or off" set it. Off stops the stream and puts the lights back, and stays off
    until something turns it on again; the PC coming back does not. The room setting says where, this says whether.
  * The PC finds the connector by broadcasting a query on PC_PORT; every answer, and an answer to every frame now
    and then, carries the sync's state, which the PC shows in its tray. A query carries the computer's name and
    system. A computer that keeps asking and never sends a frame is not hearing the answers (a firewall, or a Mac's
    Local Network permission): the app is told so, with this Pi's address to type into the computer's settings.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import socket
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import huestream
import nanostream

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
SPREAD_V = 0.3           # and up and down, as a share of its height: a bar behind a monitor sees most of it
NANO_SIZE = 0.8          # how much of the screen a Nanoleaf set spans, in screen units (2 is the screen's width)
GRADIENT_SPAN = 2.0      # and a gradient light's sections, the screen's width unless the positions page says
NANO_EVERY = 2           # a Nanoleaf takes every second beat, 25 a second: it glides between them by itself
REACH = 3.0              # how far outside the screen a light may stand, in screen units
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


def weights(w: int, h: int, x: float, y: float) -> List[float]:
    """How much each cell of a w x h grid counts towards a light at (x, y), in screen units: x from -1 (the screen's
    left edge) to 1 (its right), y from -1 (top) to 1 (bottom). A light outside the screen looks at the nearest edge.
    The part of the screen nearest the light counts most."""
    cu = (max(-1.0, min(1.0, x)) + 1) / 2
    cv = (max(-1.0, min(1.0, y)) + 1) / 2
    out = []
    for j in range(h):
        v = (j + 0.5) / h
        for i in range(w):
            u = (i + 0.5) / w
            out.append(math.exp(-((u - cu) ** 2) / (2 * SPREAD ** 2)) * math.exp(-((v - cv) ** 2) / (2 * SPREAD_V ** 2)))
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
    """Positions (x, y) for Hue lights with these names and no position of their own: "left" and "right" in a name
    put it on that side, the rest are spread left to right in the order given."""
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
                 port: int = PC_PORT, stream_port: int = huestream.PORT, data_dir: Optional[Path] = None,
                 nanoleaf: Any = None, nano_port: Optional[int] = None, app_url: Optional[str] = None) -> None:
        self.hue = hue
        self.nanoleaf = nanoleaf
        self.room_lights = room_lights
        self.config = config
        self.send = send
        self.room_name = room_name
        self.port = port
        self.stream_port = stream_port
        self.nano_port = nano_port
        self.app_url = app_url                   # the app's own address, for the computer's "Light positions"
        self._asking: Dict[str, dict] = {}       # computer address -> {"name", "os", "since", "n"}: queries, no frames
        self.paused = False                      # a light changed by hand: until resumed, or the PC comes back
        self._file = (data_dir / "screensync.json") if data_dir else None
        self.off = self._load_off()              # switched off, from the app or a remote: until switched on
        self.streaming = False
        self.why: Optional[str] = None          # what is in the way, in words, for the app and the PC
        self.lights: List[str] = []              # the ids following the screen while streaming, Hue and Nanoleaf
        self.area: Optional[dict] = None         # the Hue entertainment area: {"id", "name", "channels": [...]}
        self._chan_light: Dict[int, str] = {}    # Hue channel -> the light it belongs to
        self._nanos: Dict[str, nanostream.NanoStream] = {}
        self._points: Dict[tuple, Tuple[float, float]] = {}  # ("h", channel) or ("n", device, panel) -> (x, y)
        self._members: Optional[str] = None      # what is following and where, to notice a change on the page
        self._room_streaming: Optional[str] = None
        self._started = False                    # something was switched into streaming (to put back if a start fails)
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
        self._wts: Dict[tuple, List[float]] = {}
        self._wts_for: Optional[Tuple[int, int]] = None
        self._target: Dict[tuple, Tuple[float, float, float]] = {}
        self._shown: Dict[tuple, Tuple[float, float, float]] = {}
        self._seq = 0
        self._beat = 0
        self._fps = 0.0
        self._last_status: Optional[str] = None
        self._port: Optional[_PcPort] = None
        self._task: Optional[asyncio.Task] = None

    # ----- settings -----
    def _settings(self) -> dict:
        return ((self.config() or {}).get("settings") or {}).get("screen_sync") or {}

    def room(self) -> Optional[str]:
        r = self._settings().get("room")
        return str(r) if r else None

    def placed(self, room: Optional[str]) -> List[Dict[str, Any]]:
        """The room's lights that can follow, each with where it stands and whether it is left out: the app's
        positions, or the defaults (the module's note)."""
        if not room:
            return []
        hue_devs = getattr(self.hue, "devices", {}) or {}
        nl_devs = getattr(self.nanoleaf, "devices", {}) or {}
        cands = []
        for d in self.room_lights(room):
            d = str(d)
            if d.startswith("hue_") and (hue_devs.get(d) or {}).get("color"):
                cands.append((d, "hue", str(hue_devs[d].get("name") or "Hue light")))
            elif d.startswith("nanoleaf_") and d in nl_devs:
                cands.append((d, "nanoleaf", str(nl_devs[d].get("name") or "Nanoleaf")))
        hues = sorted([c for c in cands if c[1] == "hue"], key=lambda c: c[2])
        nanos = sorted([c for c in cands if c[1] == "nanoleaf"], key=lambda c: c[2])
        default = dict(zip([c[0] for c in hues], place([c[2] for c in hues])))
        for k, c in enumerate(nanos):
            default[c[0]] = (1.6, 0.0 if len(nanos) == 1 else -0.8 + 1.6 * k / (len(nanos) - 1))
        mine = self._settings().get("lights") or {}
        out = []
        for d, kind, name in hues + nanos:
            p = mine.get(d) if isinstance(mine.get(d), dict) else {}
            x, y = default[d]
            if isinstance(p.get("x"), (int, float)) and isinstance(p.get("y"), (int, float)):
                x = max(-REACH, min(REACH, float(p["x"])))
                y = max(-REACH, min(REACH, float(p["y"])))
            one = {"id": d, "kind": kind, "name": name, "x": round(x, 3), "y": round(y, 3), "on": p.get("on") is not False}
            segs = int((hue_devs.get(d) or {}).get("segments") or 1) if kind == "hue" else 1
            if segs > 1 or kind == "nanoleaf":
                default_span = NANO_SIZE if kind == "nanoleaf" else GRADIENT_SPAN
                span = p.get("span")
                one["span"] = round(float(span), 3) if isinstance(span, (int, float)) and 0.2 <= span <= 6 else default_span
                one["flip"] = p.get("flip") is True
            if segs > 1:
                one["segments"] = segs
            out.append(one)
        return out

    def _load_off(self) -> bool:
        try:
            return bool(json.loads(self._file.read_text()).get("off")) if self._file else False
        except (OSError, ValueError):
            return False

    def set_on(self, on: bool) -> None:
        """Switch the PC screen on or off (the app's switch, a remote). On also ends a pause by hand."""
        self.off = not on
        if on:
            self.paused = False
            self.why = None
            self._retry_at = 0.0
        if self._file:
            try:
                self._file.parent.mkdir(parents=True, exist_ok=True)
                self._file.write_text(json.dumps({"off": self.off}))
            except OSError as exc:
                LOG.warning("screen sync: could not keep on or off: %s", exc)
        LOG.info("screen sync switched %s", "on" if on else "off")

    def is_on(self) -> bool:
        """What a switch shows: a room set, not switched off, and not paused by a hand on a light."""
        return bool(self.room()) and not self.off and not self.paused

    async def remote(self, op: str) -> None:
        """A remote's press: "on", "off" or "toggle"."""
        if not self.room():
            LOG.info("screen sync: a remote asked for %s, but no room follows the PC yet", op)
            return
        self.set_on(op == "on" or (op == "toggle" and not self.is_on()))
        self._announce()

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
            # a PC looking for the connector has been seen, even before its first frame: a PC whose firewall
            # keeps the answer out never sends one, and the app should still show it is there
            info = {}
            try:
                info = json.loads(data[4:].decode() or "{}") if len(data) > 4 else {}
            except ValueError:
                pass
            ask = self._asking.setdefault(addr[0], {"since": now, "n": 0})
            ask.update({k: str(info[k])[:40] for k in ("name", "os") if info.get(k)})
            ask["n"] += 1
            if self._pc is None or now - self._frame_at >= IDLE_S:
                self._pc, self._pc_seen = (addr[0], addr[1]), time.time()
            self._reply(addr)
            self._announce()
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
        self._asking.pop(addr[0], None)  # it hears us: frames only come after an answer, or from an address typed in
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
        if not room or self.off:
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
            "pc": self._pc_info(),
            "app_url": self.app_url,
            "fps": round(self._fps, 1), "stream_key": bool(getattr(self.hue, "clientkey", None)), "on": self.is_on(),
            "placed": self.placed(room),
        }

    def _pc_info(self) -> Optional[Dict[str, Any]]:
        if not self._pc:
            return None
        ask = self._asking.get(self._pc[0]) or {}
        # three queries over ten seconds and not one frame: our answers are not reaching it
        deaf = ask.get("n", 0) >= 3 and time.monotonic() - ask.get("since", 0) >= 10
        out: Dict[str, Any] = {"address": self._pc[0], "seen_at": self._pc_seen, "name": ask.get("name"),
                               "os": ask.get("os"), "hears": not deaf}
        if deaf:
            out["pi_address"] = lan_address(self._pc[0])
        return out

    def _announce(self) -> None:
        st = self.status()
        # the PC's arrival counts as news (it is what puts the switch on the room's page); its address and the
        # rate do not, or every frame would be a message
        pc = st["pc"] or {}
        key = json.dumps({**{k: v for k, v in st.items() if k not in ("pc", "fps")}, "pc": bool(st["pc"]),
                          "hears": pc.get("hears")}, sort_keys=True)
        if key != self._last_status:
            self._last_status = key
            self.send({"type": "screen_sync", "screen_sync": st})

    # ----- the rest of the connector asks -----
    def owns(self, device_id: str) -> bool:
        """Whether this light is following the screen right now (so automatic changes leave it alone)."""
        return self.streaming and device_id in self.lights

    async def yield_for(self, device_id: str) -> None:
        """A person's command for a light that is following the screen: stop the stream first, so the light hears
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
        self.set_on(True)

    # ----- the loop: start, stream, stop -----
    def _members_key(self, room: Optional[str]) -> str:
        return json.dumps([(p["id"], p["on"]) for p in self.placed(room)])

    async def _run(self) -> None:
        period = 1 / STREAM_HZ
        count_from, counted = time.monotonic(), 0
        beat = time.monotonic()
        looked = 0.0  # when the room's lights and the app were last looked at: five times a second is plenty
        while True:
            try:
                # on a beat, so the time each pass takes does not slow the stream down
                beat = max(beat + (period if self.streaming else 0.1), time.monotonic() - period)
                await asyncio.sleep(max(0.0, beat - time.monotonic()))
                now = time.monotonic()
                room = self.room()
                fresh = now - self._frame_at < IDLE_S
                want = bool(room and fresh and not self.paused and not self.off)
                if not room and self.why:
                    self.why = None
                async with self._lock:
                    # a light let in or left out on the positions page: start again with the new set
                    if self.streaming and now - looked >= 0.2 and self._members != self._members_key(room):
                        await self._end(restore=True)
                        self._retry_at = 0.0
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
                    look = now - looked >= 0.2
                    if self.streaming:
                        if look:
                            self._place_points(room)  # a light dragged on the positions page moves at once
                        self._step(period)
                        counted += 1
                if now - count_from >= 2:
                    self._fps, count_from, counted = counted / (now - count_from), now, 0
                if look:
                    looked = now
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
        placed = [p for p in self.placed(room) if p["on"]]
        if not placed:
            raise RuntimeError("nothing in this room can follow the screen")
        hues = [p["id"] for p in placed if p["kind"] == "hue"]
        nanos = [p["id"] for p in placed if p["kind"] == "nanoleaf"]
        self._room_streaming, self._members = room, self._members_key(room)
        self.lights = []
        if hues:
            await self._begin_hue(room, hues)
        for d in nanos:
            ns = nanostream.NanoStream(self.nanoleaf, d, port=self.nano_port)
            self._nanos[d] = ns
            self._started = True
            await ns.start()
            self.lights.append(d)
        self._wts_for = None
        self._place_points(room, force=True)
        self._shown, self._target = {}, {}
        if self._frame:
            self._aim(*self._frame)
            self._shown = dict(self._target)
        self.streaming = True
        LOG.info("screen sync: %s following the PC screen%s", ", ".join(self.lights),
                 f" (Hue through {self.area['name']})" if self.area else "")

    async def _begin_hue(self, room: str, lights: List[str]) -> None:
        hue = self.hue
        if not getattr(hue, "paired", True):
            raise RuntimeError("the Hue bridge is not connected")
        if not getattr(hue, "clientkey", None):
            raise RuntimeError("the Hue bridge needs its button pressed once more for screen sync")
        area = await self._area_for(room, lights)
        self._snapshot = {}
        for d in lights:
            try:
                self._snapshot[d] = (await hue._get(f"/clip/v2/resource/light/{hue.devices[d]['zone']}"))["data"][0]  # noqa: SLF001
            except Exception as exc:  # noqa: BLE001
                LOG.warning("screen sync: could not read %s before starting (%s)", d, exc)
        # which light each channel belongs to: channel -> entertainment service -> device -> light
        ents = (await hue._get("/clip/v2/resource/entertainment")).get("data", [])  # noqa: SLF001
        owner_of = {e["id"]: (e.get("owner") or {}).get("rid") for e in ents}
        light_of_owner = {hue.devices[d].get("hue_owner"): d for d in lights}
        self._chan_light = {}
        for ch, rid in area["members"]:
            d = light_of_owner.get(owner_of.get(rid))
            if d:
                self._chan_light[ch] = d
        self.area = area
        self._started = True
        await hue._put(f"/clip/v2/resource/entertainment_configuration/{area['id']}", {"action": "start"})  # noqa: SLF001
        self.lights.extend(lights)
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

    def _place_points(self, room: Optional[str], force: bool = False) -> None:
        """Where every channel and panel stands, from the positions page; the weights follow when one moves."""
        placed = {p["id"]: p for p in self.placed(room)}
        pts: Dict[tuple, Tuple[float, float]] = {}
        if self.area:
            by_light: Dict[str, list] = {}
            for ch, hx, hz in self.area["channels"]:
                d = self._chan_light.get(ch)
                if d in placed:
                    by_light.setdefault(d, []).append((ch, hx, hz, self.area["index"].get(ch, ch)))
            for d, chans in by_light.items():
                p = placed[d]
                for ch, (dx, dy) in sections(chans, p.get("span", GRADIENT_SPAN), p.get("flip", False)).items():
                    pts[("h", ch)] = (p["x"] + dx, p["y"] + dy)
        for d, ns in self._nanos.items():
            if d not in placed:
                continue
            p = placed[d]
            size, flip = p.get("span", NANO_SIZE), p.get("flip", False)
            for pid, dx, dy in ns.panels:
                pts[("n", d, pid)] = (p["x"] + (-dx if flip else dx) * size, p["y"] + dy * size)
        if force or pts != self._points:
            self._points = pts
            self._wts_for = None
            if self._frame and self.streaming:
                self._aim(*self._frame)

    async def _end(self, restore: bool) -> None:
        was = self.streaming or self._started
        self.streaming = self._started = False
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
        for ns in list(self._nanos.values()):
            await ns.stop(restore=restore and was)
        if was:
            LOG.info("screen sync stopped%s", ", lights put back" if restore else "")
        self.area, self.lights, self._snapshot, self._nanos, self._chan_light = None, [], {}, {}, {}
        self._points, self._members = {}, None
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
        where = {p["id"]: (p["x"], p["y"]) for p in self.placed(room)}
        locations = []
        for d in sorted(lights, key=lambda d: str(hue.devices[d].get("name") or "")):
            ent = by_owner.get(hue.devices[d].get("hue_owner"))
            if not ent:
                raise RuntimeError(f"{hue.devices[d].get('name') or d} cannot take part in Hue's streaming")
            x, y = where.get(d, (0.0, 0.0))
            # Hue's own room coordinates, for the Hue app's picture of the area: x across, z up, y towards the screen.
            # A gradient light is given its start, middle and end, so its sections lie along it there too.
            hx, hz = max(-1.0, min(1.0, x / 2)), max(-1.0, min(1.0, -y / 2))
            if int(hue.devices[d].get("segments") or 1) > 1:
                half = GRADIENT_SPAN / 4
                pos = [{"x": max(-1.0, min(1.0, hx + k * half)), "y": 0.8, "z": hz} for k in (-1, 0, 1)]
            else:
                pos = [{"x": hx, "y": 0.8, "z": hz}]
            locations.append({"service": {"rid": ent, "rtype": "entertainment"}, "positions": pos})
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
        if not self._points:
            return
        if self._wts_for != (w, h):
            self._wts = {k: weights(w, h, x, y) for k, (x, y) in self._points.items()}
            self._wts_for = (w, h)
        self._target = {k: colour_of(rgb, wt) for k, wt in self._wts.items()}

    def _step(self, dt: float) -> None:
        if not self._target:
            return
        a = 1 - math.exp(-dt / SMOOTH_S)
        for k, t in self._target.items():
            s = self._shown.get(k, t)
            self._shown[k] = tuple(s[i] + (t[i] - s[i]) * a for i in range(3))
        self._beat += 1
        if self._dtls is not None and self.area is not None:
            out = [(k[1], _enc(c[0]), _enc(c[1]), _enc(c[2])) for k, c in self._shown.items() if k[0] == "h"]
            self._seq = (self._seq + 1) & 0xFF
            self._dtls.send(huestream.message(self.area["id"], self._seq, out))
        if self._nanos and self._beat % NANO_EVERY == 0:
            for d, ns in self._nanos.items():
                ns.send([(k[2], _enc(c[0]), _enc(c[1]), _enc(c[2])) for k, c in self._shown.items() if k[0] == "n" and k[1] == d])


def lan_address(towards: str) -> Optional[str]:
    """This Pi's address on the network that reaches `towards` (nothing is sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((towards, 9))
            return s.getsockname()[0]
    except OSError:
        return None


def _area(cfg: dict) -> dict:
    chans, members, index = [], [], {}
    for ch in cfg.get("channels") or []:
        pos = ch.get("position") or {}
        cid = int(ch.get("channel_id", 0))
        chans.append((cid, float(pos.get("x", 0.0)), float(pos.get("z", 0.0))))
        for m in ch.get("members") or []:
            rid = ((m.get("service") or {}).get("rid"))
            if rid:
                members.append((cid, rid))
                index[cid] = int(m.get("index", 0) or 0)
    return {"id": cfg["id"], "name": (cfg.get("metadata") or {}).get("name") or "Entertainment area", "channels": chans,
            "members": members, "index": index}


def sections(chans: List[tuple], span: float, flip: bool) -> Dict[int, Tuple[float, float]]:
    """Where each channel of one light stands, as an offset from the light's own position: [(channel, hue x, hue z,
    segment index)] in, {channel: (dx, dy)} out, spanning `span` screen units. A single channel stands on the light.
    Several keep the shape Hue's area gives them when it gives one (scaled so the widest side is the span), and
    otherwise lie in a line, left to right in segment order. Flipped, left and right change places."""
    if len(chans) == 1:
        return {chans[0][0]: (0.0, 0.0)}
    xs, zs = [c[1] for c in chans], [c[2] for c in chans]
    spread = max(max(xs) - min(xs), max(zs) - min(zs))
    out: Dict[int, Tuple[float, float]] = {}
    if spread > 0.05:
        cx, cz = (max(xs) + min(xs)) / 2, (max(zs) + min(zs)) / 2
        for ch, hx, hz, _i in chans:
            dx, dy = (hx - cx) / spread * span, -(hz - cz) / spread * span
            out[ch] = (-dx if flip else dx, dy)
        return out
    ordered = sorted(chans, key=lambda c: (c[3], c[0]))
    n = len(ordered)
    for k, c in enumerate(ordered):
        t = k / (n - 1) - 0.5
        out[c[0]] = ((-t if flip else t) * span, 0.0)
    return out


__all__ = ["ScreenSync", "PC_PORT", "parse_frame", "weights", "colour_of", "place"]
