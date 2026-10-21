"""Nanoleaf's streaming mode ("extControl"): a colour for every panel, many times a second, for screen sync.

A Nanoleaf controller (Light Panels, Canvas, Shapes, Elements, Lines) can be put into an external-control effect
over its local API, after which it takes UDP datagrams that set each panel directly. That is how screen sync drives
one (screensync.py), beside the Hue lights it streams to through the Hue bridge.

  * Start: read the controller (its state and effect, kept to put back afterwards, and its panel layout), switch it
    on at full brightness, and ask for the effect: PUT /effects {"write": {"command": "display", "animType":
    "extControl", "extControlVersion": "v2"}}. Version 2 datagrams go to UDP port 60222 on the controller. The first
    Light Panels (NL22) speak version 1, to the address and port the controller names in its answer.
  * A v2 datagram: the number of panels (2 bytes), then for each panel its id (2), red, green, blue, white (1 each)
    and a transition time in tenths of a second (2). Big-endian. v1: count (1), then id (1), frames (1, always 1),
    red, green, blue, white (1 each), transition (1).
  * Stop: put back what was there: the effect it was showing, or its colour or white, then its brightness, then on
    or off. Any of those leaves the streaming effect on its own.

Panel positions come from the controller's own layout (the arrangement in Nanoleaf's app), centred on the panels'
middle and scaled so the widest side is 1: an offset from wherever the person puts the whole set on the positions
page. Panels that give no light (a Shapes controller) take colours like the rest; the controller ignores them.
"""
from __future__ import annotations

import logging
import socket
import struct
from typing import Any, List, Optional, Tuple

LOG = logging.getLogger("nanostream")
V2_PORT = 60222
TRANSITION = 1  # tenths of a second each colour takes to arrive: one datagram's worth, so the panels glide


def layout_offsets(info: dict) -> List[Tuple[int, float, float]]:
    """(panel id, dx, dy) for each panel: dx to the right, dy downwards, the widest side of the set spanning 1."""
    pos = (((info.get("panelLayout") or {}).get("layout") or {}).get("positionData")) or []
    pts = [(int(p["panelId"]), float(p.get("x", 0)), float(p.get("y", 0))) for p in pos if "panelId" in p]
    if not pts:
        return []
    xs, ys = [p[1] for p in pts], [p[2] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1.0
    # the layout's y grows upwards; on the positions page it grows downwards, as the screen's does
    return [(pid, (x - cx) / span, -(y - cy) / span) for pid, x, y in pts]


def packet_v2(colours: List[Tuple[int, float, float, float]]) -> bytes:
    out = bytearray(struct.pack(">H", len(colours)))
    for pid, r, g, b in colours:
        out += struct.pack(">HBBBBH", pid & 0xFFFF, _b(r), _b(g), _b(b), 0, TRANSITION)
    return bytes(out)


def packet_v1(colours: List[Tuple[int, float, float, float]]) -> bytes:
    out = bytearray([len(colours) & 0xFF])
    for pid, r, g, b in colours:
        out += bytes([pid & 0xFF, 1, _b(r), _b(g), _b(b), 0, TRANSITION])
    return bytes(out)


def _b(v: float) -> int:
    return max(0, min(255, int(round(v * 255))))


class NanoStream:
    """One controller in streaming mode. `nl` is the connector's Nanoleaf backend (nanoleaf.py)."""

    def __init__(self, nl: Any, device_id: str, port: Optional[int] = None) -> None:
        self.nl = nl
        self.device_id = device_id
        e = nl._entry(device_id)  # noqa: SLF001
        self.host, self.token, self.model = e["host"], e["token"], str(e.get("model") or "")
        self.port_override = port
        self.v1 = self.model.upper().startswith("NL22")
        self.sock: Optional[socket.socket] = None
        self.snapshot: Optional[dict] = None
        self.panels: List[Tuple[int, float, float]] = []

    async def start(self) -> List[Tuple[int, float, float]]:
        nl = self.nl
        info = await nl._get_info(self.host, self.token)  # noqa: SLF001
        self.snapshot = info
        self.panels = layout_offsets(info)
        await nl._put_state(self.host, self.token, {"on": {"value": True}})  # noqa: SLF001  (on goes alone: nanoleaf.py)
        await nl._put_state(self.host, self.token, {"brightness": {"value": 100}})  # noqa: SLF001
        answer = await nl._put_effects(self.host, self.token, {"write": {  # noqa: SLF001
            "command": "display", "animType": "extControl", "extControlVersion": "v1" if self.v1 else "v2"}})
        ip = self.host.split(":")[0]
        port = V2_PORT
        if self.v1 and isinstance(answer, dict):
            ip = answer.get("streamControlIpAddr") or ip
            port = int(answer.get("streamControlPort") or port)
        if self.port_override:
            port = self.port_override
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setblocking(False)
        self.sock.connect((ip, port))
        LOG.info("nanoleaf %s streaming (%s, %d panels)", self.device_id, "v1" if self.v1 else "v2", len(self.panels))
        return self.panels

    def send(self, colours: List[Tuple[int, float, float, float]]) -> None:
        if self.sock is None:
            return
        try:
            self.sock.send(packet_v1(colours) if self.v1 else packet_v2(colours))
        except OSError:
            pass  # a datagram the network did not take; the next follows a moment later

    async def stop(self, restore: bool) -> None:
        if self.sock is not None:
            self.sock.close()
            self.sock = None
        if not restore or not self.snapshot:
            return
        nl, st = self.nl, (self.snapshot.get("state") or {})
        mode = st.get("colorMode")
        effect = (self.snapshot.get("effects") or {}).get("select")
        try:
            if mode == "effect" and effect and not str(effect).startswith("*"):
                await nl._put_effects(self.host, self.token, {"select": effect})  # noqa: SLF001
            elif mode == "ct" and (st.get("ct") or {}).get("value"):
                await nl._put_state(self.host, self.token, {"ct": {"value": st["ct"]["value"]}})  # noqa: SLF001
            elif (st.get("hue") or {}).get("value") is not None:
                await nl._put_state(self.host, self.token, {"hue": {"value": st["hue"]["value"]},  # noqa: SLF001
                                                             "sat": {"value": (st.get("sat") or {}).get("value", 100)}})
            bri = (st.get("brightness") or {}).get("value")
            if bri is not None:
                await nl._put_state(self.host, self.token, {"brightness": {"value": bri}})  # noqa: SLF001
            await nl._put_state(self.host, self.token, {"on": {"value": bool((st.get("on") or {}).get("value"))}})  # noqa: SLF001
        except Exception as exc:  # noqa: BLE001
            LOG.warning("nanoleaf %s: putting it back: %s", self.device_id, exc)
