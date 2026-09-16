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

    async def _peek(self, rec: dict, area_s: str) -> None:
        """Every create shape failed: read back how this bridge describes a device like it, and the room,
        so the log shows the shape a create should mirror."""
        try:
            bridge = self._need_bridge()
            want = str(rec.get("device_type") or "")
            like = None
            for d in bridge.devices.values():
                t = str(d.get("type") or "")
                if t == "SmartBridge":
                    continue
                if t == want or (like is None and (t.startswith("Pico") == want.startswith("Pico"))):
                    like = d
                    if t == want:
                        break
            if like and like.get("device_id"):
                await self._request("ReadRequest", f"/device/{like['device_id']}")
            await self._request("ReadRequest", f"/area/{area_s}")
        except Exception:  # noqa: BLE001
            pass  # already logged by _request; this is diagnosis, not the feature

    async def _appeared(self, serial_s: str) -> bool:
        """After a failed create: did the bridge add the device anyway?"""
        try:
            bridge = self._need_bridge()
            await bridge._load_devices()  # noqa: SLF001
            for d in bridge.devices.values():
                if str(d.get("serial") or "") == serial_s:
                    return True
        except Exception as exc:  # noqa: BLE001
            self._note("error", "/device", error=f"could not re-read devices: {exc}")
        return False

    async def create(self, serial: Any, name: Any, area_id: Any) -> dict:
        serial_s = str(serial or "").strip()
        name_s = str(name or "").strip()[:60]
        area_s = str(area_id or "").strip()
        if not serial_s or not name_s or not area_s:
            raise ValueError("serial, name and room are required")
        # the bridge reports the serial as a number; send it back the same way
        serial_v: Any = int(serial_s) if serial_s.isdigit() else serial_s
        rec = next((h for h in self.heard if h["serial"] == serial_s), None) or {}
        base = {"Name": name_s, "SerialNumber": serial_v, "AssociatedArea": {"href": f"/area/{area_s}"}}
        # LEAP is undocumented. A real bridge refused the plain shape the community script used and took the
        # one that carries the DeviceType and ModelNumber it reported, so that goes first; the others stay as fallbacks.
        variants: List[tuple] = []
        if rec.get("device_type") or rec.get("model"):
            full = dict(base)
            if rec.get("device_type"):
                full["DeviceType"] = rec["device_type"]
            if rec.get("model"):
                full["ModelNumber"] = rec["model"]
            variants.append(("with DeviceType and ModelNumber", full))
        variants.append(("plain", dict(base)))
        variants.append(("serial as text", {**base, "SerialNumber": serial_s}))
        last_exc: Optional[Exception] = None
        created: Optional[dict] = None
        for label, dev in variants:
            try:
                resp = await self._request("CreateRequest", "/device", {"Device": dev})
                created = _resp(resp)
                break
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                self._note("variant failed", "/device", request={"variant": label}, error=str(exc))
                if await self._appeared(serial_s):
                    self._note("appeared", "/device", response={"serial": serial_s, "note": "the bridge added it despite the error"})
                    created = {"status": "appeared after error"}
                    break
        if created is None:
            await self._peek(rec, area_s)
            assert last_exc is not None
            raise last_exc
        self.heard = [h for h in self.heard if h["serial"] != serial_s]
        await self.stop("created")
        return {"created": created, "name": name_s, "area": area_s}

    async def remove(self, device_id: Any) -> dict:
        """Take a device out of the bridge: DeleteRequest /device/{id}. Undocumented like the rest; logged."""
        did = str(device_id or "").strip()
        if not did.isdigit():
            raise ValueError("a device id is required")
        resp = await self._request("DeleteRequest", f"/device/{did}")
        return {"removed": _resp(resp), "id": did}
