"""Add a Caseta device to the bridge from the app, the way the Lutron app does it over LEAP.

The bridge goes into association mode, the person holds the new device's button, the bridge
reports what it heard on /device/status/deviceheard, and the device is created with a name and
a room. LEAP is not documented. The request shapes come from a community script that adds
devices with pylutron-caseta (tannercollin, 2021) and from lutron-leap-js's DeviceHeard type:

    UpdateRequest  /system/status   {"SystemStatus": {"InAssociationMode": true}}
    Subscribe      /device/status/deviceheard
                   -> {"DeviceStatus": {"DeviceHeard": {"SerialNumber", "DeviceType", "ModelNumber",
                                                        "DiscoveryMechanism"}}}
    CreateRequest  /device          {"Device": {"Name", "SerialNumber", "AssociatedArea": {"href": "/area/N"}}}
    UpdateRequest  /system/status   {"SystemStatus": {"InAssociationMode": false}}

Every exchange is logged and sent to the app, where "Show technical details" reveals it, so a
bridge that answers differently can be understood from the phone. The feature is experimental.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Dict, List, Optional

LOG = logging.getLogger("adddevice")
HEARD_URL = "/device/status/deviceheard"
STATUS_URL = "/system/status"
SESSION_SECONDS = 180


def _resp(resp: Any) -> dict:
    """A plain dict of a pylutron_caseta Response, for the log."""
    h = getattr(resp, "Header", None)
    return {
        "type": getattr(resp, "CommuniqueType", None),
        "status": str(getattr(h, "StatusCode", "") or ""),
        "url": getattr(h, "Url", None),
        "body": getattr(resp, "Body", None),
    }


class AddSession:
    """One 'listening' session: at most one at a time, three minutes long."""

    def __init__(self, bridge: Callable[[], Any], send: Callable[[dict], None]) -> None:
        self._bridge = bridge  # the Smartbridge is replaced on every refresh, so it is fetched each time
        self._send = send
        self.active = False
        self.until = 0.0
        self.heard: List[dict] = []
        self.log: List[dict] = []
        self._leap = None  # the LeapProtocol the deviceheard subscription belongs to
        self._timeout: Optional[asyncio.Task] = None

    # ----- state for the app -----
    def state(self) -> dict:
        return {"active": self.active, "until": self.until, "heard": self.heard, "log": self.log[-40:]}

    def _note(self, kind: str, url: Optional[str] = None, request: Any = None, response: Any = None, error: Optional[str] = None) -> None:
        entry: Dict[str, Any] = {"at": time.time(), "kind": kind, "url": url}
        if request is not None:
            entry["request"] = request
        if response is not None:
            entry["response"] = response
        if error:
            entry["error"] = error
        self.log.append(entry)
        del self.log[:-60]
        LOG.info("add-device %s %s %s", kind, url or "", error or "")
        self._send({"type": "add_log", "entry": entry})

    # ----- LEAP plumbing (pylutron-caseta has no public API for arbitrary requests) -----
    def _need_bridge(self) -> Any:
        bridge = self._bridge()
        if bridge is None or getattr(bridge, "_leap", None) is None:
            raise RuntimeError("not connected to the bridge")
        return bridge

    async def _request(self, comm: str, url: str, body: Optional[dict] = None) -> Any:
        bridge = self._need_bridge()
        try:
            resp = await bridge._request(comm, url, body)  # noqa: SLF001
        except Exception as exc:  # noqa: BLE001
            self._note("error", url, request={"type": comm, "body": body}, error=str(exc))
            raise
        self._note("response", url, request={"type": comm, "body": body}, response=_resp(resp))
        return resp

    async def _ensure_subscribed(self) -> None:
        bridge = self._need_bridge()
        leap = bridge._leap  # noqa: SLF001
        if self._leap is leap:
            return
        resp, _tag = await bridge._subscribe(HEARD_URL, self._on_heard)  # noqa: SLF001
        # some bridges send the heard device untagged; listen for that too
        leap.subscribe_unsolicited(self._on_unsolicited)
        self._leap = leap
        self._note("subscribed", HEARD_URL, response=_resp(resp))

    def _on_unsolicited(self, resp: Any) -> None:
        try:
            url = getattr(getattr(resp, "Header", None), "Url", None)
            if url == HEARD_URL:
                self._on_heard(resp)
            elif self.active:
                self._note("unsolicited", url, response=_resp(resp))
        except Exception:  # noqa: BLE001
            LOG.exception("add-device: bad unsolicited message")

    def _on_heard(self, resp: Any) -> None:
        body = getattr(resp, "Body", None) or {}
        dh = (body.get("DeviceStatus") or {}).get("DeviceHeard") or body.get("DeviceHeard") or {}
        if not dh:
            self._note("heard?", HEARD_URL, response=_resp(resp))
            return
        rec = {
            "serial": str(dh.get("SerialNumber", "")),
            "model": dh.get("ModelNumber"),
            "device_type": dh.get("DeviceType"),
            "mechanism": dh.get("DiscoveryMechanism"),
            "at": time.time(),
        }
        self.heard = [h for h in self.heard if h["serial"] != rec["serial"]]
        self.heard.insert(0, rec)
        self._note("heard", HEARD_URL, response=rec)
        self._send({"type": "add_heard", "device": rec, "heard": self.heard})

    # ----- the steps the app drives -----
    async def start(self) -> dict:
        await self._ensure_subscribed()
        self.heard = []
        self.log = []
        await self._request("UpdateRequest", STATUS_URL, {"SystemStatus": {"InAssociationMode": True}})
        self.active = True
        self.until = time.time() + SESSION_SECONDS
        if self._timeout:
            self._timeout.cancel()
        self._timeout = asyncio.get_running_loop().create_task(self._expire())
        self._send({"type": "add_state", "state": self.state(), "reason": "started"})
        return self.state()

    async def _expire(self) -> None:
        try:
            await asyncio.sleep(SESSION_SECONDS)
        except asyncio.CancelledError:
            return
        await self.stop("timeout")

    async def stop(self, reason: str = "stopped") -> dict:
        if self._timeout:
            self._timeout.cancel()
            self._timeout = None
        if self.active:
            self.active = False
            self.until = 0.0
            try:
                await self._request("UpdateRequest", STATUS_URL, {"SystemStatus": {"InAssociationMode": False}})
            except Exception:  # noqa: BLE001
                pass  # already logged; the bridge leaves association mode by itself after a while
        self._send({"type": "add_state", "state": self.state(), "reason": reason})
        return self.state()

    async def create(self, serial: Any, name: Any, area_id: Any) -> dict:
        serial_s = str(serial or "").strip()
        name_s = str(name or "").strip()[:60]
        area_s = str(area_id or "").strip()
        if not serial_s or not name_s or not area_s:
            raise ValueError("serial, name and room are required")
        # the bridge reports the serial as a number; send it back the same way
        serial_v: Any = int(serial_s) if serial_s.isdigit() else serial_s
        body = {"Device": {"Name": name_s, "SerialNumber": serial_v, "AssociatedArea": {"href": f"/area/{area_s}"}}}
        resp = await self._request("CreateRequest", "/device", body)
        self.heard = [h for h in self.heard if h["serial"] != serial_s]
        await self.stop("created")
        return {"created": _resp(resp), "name": name_s, "area": area_s}
