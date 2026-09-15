"""Checks for the add-device session against a stub bridge. Run: python test_adddevice.py"""
import asyncio
from collections import namedtuple

from adddevice import AddSession, HEARD_URL, STATUS_URL

Header = namedtuple("Header", "StatusCode Url MessageBodyType Paging")
Response = namedtuple("Response", "Header CommuniqueType Body")


class StubLeap:
    def __init__(self):
        self.unsolicited = []

    def subscribe_unsolicited(self, cb):
        self.unsolicited.append(cb)


class StubBridge:
    def __init__(self):
        self._leap = StubLeap()
        self.calls = []
        self.subscriptions = {}

    async def _request(self, comm, url, body=None):
        self.calls.append((comm, url, body))
        if url == "/device" and comm == "CreateRequest":
            return Response(Header("201 Created", url, "OneDeviceDefinition", None), "CreateResponse", {"Device": {"href": "/device/42"}})
        return Response(Header("204 NoContent", url, None, None), "UpdateResponse", None)

    async def _subscribe(self, url, cb):
        self.subscriptions[url] = cb
        return Response(Header("200 OK", url, None, None), "SubscribeResponse", None), "tag1"


async def main():
    sent = []
    bridge = StubBridge()
    s = AddSession(lambda: bridge, sent.append)

    st = await s.start()
    assert st["active"] and st["until"] > 0
    assert bridge.calls[0] == ("UpdateRequest", STATUS_URL, {"SystemStatus": {"InAssociationMode": True}}), bridge.calls
    assert HEARD_URL in bridge.subscriptions and bridge._leap.unsolicited, "subscribed both ways"
    assert any(m["type"] == "add_state" and m["reason"] == "started" for m in sent)

    # the bridge hears a Pico, tagged
    heard = Response(Header("200 OK", HEARD_URL, "OneDeviceStatus", None), "UpdateResponse",
                     {"DeviceStatus": {"DeviceHeard": {"DiscoveryMechanism": "UserInteraction", "ModelNumber": "PJ2-3BRL-GXX-X01", "DeviceType": "Pico3ButtonRaiseLower", "SerialNumber": 69709128}}})
    bridge.subscriptions[HEARD_URL](heard)
    assert s.heard and s.heard[0]["serial"] == "69709128" and s.heard[0]["device_type"] == "Pico3ButtonRaiseLower"
    # the same device again, untagged: still one entry
    bridge._leap.unsolicited[0](heard)
    assert len(s.heard) == 1
    assert [m for m in sent if m["type"] == "add_heard"], "the app was told"

    out = await s.create("69709128", "Hall remote", "23")
    comm, url, body = bridge.calls[1]
    assert (comm, url) == ("CreateRequest", "/device")
    assert body == {"Device": {"Name": "Hall remote", "SerialNumber": 69709128, "AssociatedArea": {"href": "/area/23"}}}, body
    assert bridge.calls[2] == ("UpdateRequest", STATUS_URL, {"SystemStatus": {"InAssociationMode": False}})
    assert out["created"]["status"] == "201 Created" and out["name"] == "Hall remote"
    assert not s.active and not s.heard
    assert s.log and all("at" in e and "kind" in e for e in s.log)

    # stopping twice is harmless and does not talk to the bridge again
    n = len(bridge.calls)
    await s.stop()
    assert len(bridge.calls) == n

    # a session with no bridge fails cleanly
    s2 = AddSession(lambda: None, sent.append)
    try:
        await s2.start()
        raise AssertionError("expected an error")
    except RuntimeError as exc:
        assert "not connected" in str(exc)
    print("adddevice: ok")


asyncio.run(main())
