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

    fail_first = 0   # how many create attempts should fail
    fail_areas = 0   # how many /area create attempts should fail
    devices = {}
    areas = {}

    async def _load_devices(self):
        pass

    async def _load_areas(self):
        pass

    async def _request(self, comm, url, body=None):
        self.calls.append((comm, url, body))
        if url == "/area" and comm == "CreateRequest":
            if self.fail_areas > 0:
                self.fail_areas -= 1
                raise RuntimeError("400 BadRequest")
            return Response(Header("201 Created", url, "OneAreaDefinition", None), "CreateResponse", {"Area": {"href": "/area/77"}})
        if url == "/device" and comm == "CreateRequest" and self.fail_first > 0:
            self.fail_first -= 1
            raise RuntimeError("500 InternalServerError")
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
    assert body == {"Device": {"Name": "Hall remote", "SerialNumber": 69709128, "AssociatedArea": {"href": "/area/23"}, "DeviceType": "Pico3ButtonRaiseLower", "ModelNumber": "PJ2-3BRL-GXX-X01"}}, body
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
    # the bridge rejects the plain shape and accepts the one with DeviceType and ModelNumber
    bridge3 = StubBridge(); bridge3.fail_first = 1
    s3 = AddSession(lambda: bridge3, sent.append)
    await s3.start()
    bridge3.subscriptions[HEARD_URL](heard)
    out = await s3.create("69709128", "Hall remote", "23")
    creates = [c for c in bridge3.calls if c[1] == "/device"]
    assert len(creates) == 2 and creates[0][2]["Device"]["DeviceType"] == "Pico3ButtonRaiseLower" and creates[0][2]["Device"]["ModelNumber"] == "PJ2-3BRL-GXX-X01", creates
    assert "DeviceType" not in creates[1][2]["Device"], creates
    assert out["created"]["status"] == "201 Created"
    assert any(e["kind"] == "variant failed" for e in s3.log)

    # every shape fails but the device shows up anyway: counted as added
    bridge4 = StubBridge(); bridge4.fail_first = 9; bridge4.devices = {"9": {"serial": 69709128}}
    s4 = AddSession(lambda: bridge4, sent.append)
    await s4.start()
    bridge4.subscriptions[HEARD_URL](heard)
    out = await s4.create("69709128", "Hall remote", "23")
    assert out["created"]["status"] == "appeared after error" and not s4.active

    # every shape fails and nothing appears: the last error surfaces
    bridge5 = StubBridge(); bridge5.fail_first = 9
    s5 = AddSession(lambda: bridge5, sent.append)
    await s5.start()
    bridge5.subscriptions[HEARD_URL](heard)
    try:
        await s5.create("69709128", "Hall remote", "23")
        raise AssertionError("expected an error")
    except RuntimeError as exc:
        assert "500" in str(exc)
    assert len([c for c in bridge5.calls if c[1] == "/device"]) == 3
    # after the last failure it read the room back for the log (no existing Pico to read in the stub)
    assert ("ReadRequest", "/area/23", None) in bridge5.calls, bridge5.calls
    # removing sends a DeleteRequest for the device and refuses a bad id
    bridge6 = StubBridge(); s6 = AddSession(lambda: bridge6, sent.append)
    out = await s6.remove("42")
    assert bridge6.calls[-1] == ("DeleteRequest", "/device/42", None) and out["id"] == "42"
    try:
        await s6.remove("x"); raise AssertionError("expected an error")
    except ValueError:
        pass
    # ----- rooms on the bridge: undocumented, tried in a couple of shapes, every exchange logged -----
    b7 = StubBridge(); b7.areas = {"1": {"name": "Home", "parent_id": None}, "20": {"name": "Kitchen", "parent_id": "1"}}
    s7 = AddSession(lambda: b7, sent.append)
    out = await s7.create_area("Studio")
    made = [c for c in b7.calls if c[1] == "/area"]
    assert len(made) == 1 and made[0][0] == "CreateRequest", b7.calls
    assert made[0][2] == {"Area": {"Name": "Studio", "Parent": {"href": "/area/1"}}}, made[0][2]
    assert out["area_id"] == "77" and out["name"] == "Studio", out
    assert any(e["kind"] == "area made" for e in s7.log), s7.log
    # the first shape is refused, the plain one is taken
    b8 = StubBridge(); b8.areas = dict(b7.areas); b8.fail_areas = 1
    s8 = AddSession(lambda: b8, sent.append)
    out = await s8.create_area("Studio")
    tries = [c[2] for c in b8.calls if c[1] == "/area" and c[0] == "CreateRequest"]
    assert len(tries) == 2 and tries[1] == {"Area": {"Name": "Studio"}}, tries
    assert out["area_id"] == "77" and any(e["kind"] == "area variant failed" for e in s8.log)
    # the owner's own bridge: every shape says 400, nothing appears, and the error is what comes back
    b9 = StubBridge(); b9.areas = dict(b7.areas); b9.fail_areas = 9
    s9 = AddSession(lambda: b9, sent.append)
    try:
        await s9.create_area("Studio"); raise AssertionError("expected an error")
    except RuntimeError as exc:
        assert "400 BadRequest" in str(exc), str(exc)
    assert len([c for c in b9.calls if c[0] == "CreateRequest" and c[1] == "/area"]) == 3, b9.calls
    assert ("ReadRequest", "/area", None) in b9.calls, b9.calls      # the shape this bridge does like, for the log
    assert len([e for e in s9.log if e["kind"] == "area variant failed"]) == 3
    # a bridge that made the area despite the error is believed over the error
    b10 = StubBridge(); b10.areas = {"1": {"name": "Home", "parent_id": None}, "78": {"name": "Studio", "parent_id": "1"}}; b10.fail_areas = 9
    s10 = AddSession(lambda: b10, sent.append)
    out = await s10.create_area("Studio")
    assert out["area_id"] == "78" and out["created"]["status"] == "appeared after error", out
    # renaming and moving
    out = await s7.rename_area("20", "Kitchen and dining")
    assert b7.calls[-1] == ("UpdateRequest", "/area/20", {"Area": {"Name": "Kitchen and dining"}}), b7.calls[-1]
    assert out["name"] == "Kitchen and dining"
    out = await s7.move_device("5", "77")
    assert b7.calls[-1] == ("UpdateRequest", "/device/5", {"Device": {"AssociatedArea": {"href": "/area/77"}}}), b7.calls[-1]
    assert out == {"id": "5", "area": "77", "updated": out["updated"]}
    for bad_call in (s7.create_area(""), s7.move_device("5", ""), s7.move_device("5", "hue_abc")):
        try:
            await bad_call; raise AssertionError("expected an error")
        except ValueError:
            pass
    print("adddevice: ok")


asyncio.run(main())
