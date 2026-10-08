"""Logging back in to the bridge with Hue and Nanoleaf lights in the house.

The remotes went quiet after a few days with nothing changed: the first login after a start worked, and the first
one after the bridge next dropped the session failed with KeyError 'button_groups', as did every one after it. The
connector keeps the Hue and Nanoleaf lights in the library's own dictionaries, and the library's login reads its own
fields off every entry there. This runs the library's real login, on a pretend session, twice: once as it was (the
failure, so the test knows it is looking at the right thing) and once through the connector's _login_bridge.
Run: python test_relogin.py
"""
import asyncio
import os
import tempfile
import time

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="relogin-"))
os.environ.setdefault("HUB_URL", "wss://example.invalid/ws/agent")

import agent as A  # noqa: E402
from pylutron_caseta.messages import Response, ResponseHeader, ResponseStatus  # noqa: E402
from pylutron_caseta.smartbridge import Smartbridge  # noqa: E402

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


def ok(body):
    return Response(Header=ResponseHeader(StatusCode=ResponseStatus(200, "OK")), Body=body)


def missing():
    return Response(Header=ResponseHeader(StatusCode=ResponseStatus(404, "NotFound")), Body=None)


# A small Caseta house: one dimmer (zone 1) in the living room, one Pico with two buttons.
ANSWERS = {
    "/area": {"Areas": [{"href": "/area/1", "Name": "Home"}, {"href": "/area/2", "Name": "Living Room", "Parent": {"href": "/area/1"}}]},
    "/project": {"Project": {"ProductType": "Lutron Smart Bridge Project"}},
    "/device": {"Devices": [
        {"href": "/device/1", "Name": "Smart Bridge", "FullyQualifiedName": ["Smart Bridge"], "DeviceType": "SmartBridge",
         "ModelNumber": "L-BDG2-WH", "SerialNumber": 1},
        {"href": "/device/2", "Name": "Lamp", "FullyQualifiedName": ["Living Room", "Lamp"], "DeviceType": "PlugInDimmer",
         "ModelNumber": "PD-3PCL", "SerialNumber": 2, "LocalZones": [{"href": "/zone/1"}], "AssociatedArea": {"href": "/area/2"}},
        {"href": "/device/3", "Name": "Pico", "FullyQualifiedName": ["Living Room", "Pico"], "DeviceType": "Pico3ButtonRaiseLower",
         "ModelNumber": "PJ2-3BRL", "SerialNumber": 3, "ButtonGroups": [{"href": "/buttongroup/1"}], "AssociatedArea": {"href": "/area/2"}},
    ]},
    "/button": {"Buttons": [
        {"href": "/button/101", "Parent": {"href": "/buttongroup/1"}, "ButtonNumber": 2},
        {"href": "/button/102", "Parent": {"href": "/buttongroup/1"}, "ButtonNumber": 4},
    ]},
    "/virtualbutton": {"VirtualButtons": []},
    "/occupancygroup": {"OccupancyGroups": []},
    "/zone/1/status": {"ZoneStatus": {"href": "/zone/1/status", "Level": 40, "Zone": {"href": "/zone/1"}}},
}


class Leap:
    """The session, as the library's _request and _subscribe use it."""

    def __init__(self):
        self.asked = []
        self.subscribed = []

    async def request(self, communique_type, url, body=None, paging=None):
        self.asked.append(url)
        if url == "/server/2/id":
            return missing()  # only the PRO bridges have LIP devices
        return ok(ANSWERS[url]) if url in ANSWERS else missing()

    async def subscribe(self, url, callback, communique_type="SubscribeRequest", body=None):
        self.subscribed.append(url)
        if url.startswith("/button/"):
            b = url.split("/")[2]
            return ok({"ButtonStatus": {"Button": {"href": f"/button/{b}"}, "ButtonEvent": {"EventType": "Release"}}}), "tag"
        return ok(None), "tag"

    def close(self):
        pass


# What the connector merges beside the bridge's own entries (hue.py, nanoleaf.py), shapes as they make them.
HUE = {"hue_light_a": {"device_id": "hue_light_a", "name": "Living Room_Floor Lamp", "device_name": "Floor Lamp",
                       "type": "HueLight", "model": None, "serial": None, "zone": "light_a", "area": "hue_room_1",
                       "current_state": 0, "fan_speed": None}}
HUE_AREAS = {"hue_room_1": {"id": "hue_room_1", "name": "Living Room", "parent_id": None}}
NANO = {"nanoleaf_N1": {"device_id": "nanoleaf_N1", "name": "Shapes", "device_name": "Shapes", "type": "NanoleafLight",
                        "model": "NL42", "serial": "N1", "zone": "N1", "area": None, "current_state": 0, "fan_speed": None}}


class Backend:
    def __init__(self, devices, areas=None):
        self.devices, self.areas, self.scenes = dict(devices), dict(areas or {}), {}

    def info(self):
        return {"paired": True}


def logged_in_bridge():
    """A bridge object after its first login, with the other lights merged in as the connector does."""
    br = Smartbridge(lambda: None)
    br._leap = Leap()
    return br


def make_agent(br):
    a = A.Agent.__new__(A.Agent)
    a.bridge = br
    a.config = {"bindings": []}
    a._button_keys = {}
    a._subscribed = set()
    a._sub_session = None
    a._lib_logging_in = False
    a._merge_deferred = []
    a._login_fails = 0
    a._started_at = time.time() - 60
    a.hue = Backend(HUE, HUE_AREAS)
    a.nanoleaf = Backend(NANO)
    a._backends = {"hue_": a.hue, "nanoleaf_": a.nanoleaf}
    a._on_zone = lambda d: None  # a lamp's level changing, and a press, are other tests' business
    a._on_button = lambda b, ev: None
    a.sent = []
    a.send = a.sent.append
    br._subscribe_to_button_status = a._subscribe_buttons
    a._lib_login = br._login
    return a


async def main():
    # 1. as it was: the first login is fine, the next one, with the other lights merged, fails
    br = logged_in_bridge()
    a = make_agent(br)
    await br._login()
    check("the first login lists the Pico's buttons", sorted(br.buttons), ["101", "102"])
    a._merge_hue(send=False)
    a._merge_nanoleaf(send=False)
    br._leap = Leap()
    err = None
    try:
        await br._login()
    except Exception as exc:  # noqa: BLE001
        err = exc
    check("without the fix, logging in again fails as the house saw it", repr(err), "KeyError('button_groups')")

    # 2. through the connector: the login runs clean and every button is reported on the new session
    br = logged_in_bridge()
    a = make_agent(br)
    br._login = a._login_bridge
    await br._login()
    a._merge_hue(send=False)
    a._merge_nanoleaf(send=False)
    leap = br._leap = Leap()
    await br._login()
    check("logging in again with Hue and Nanoleaf lights in the house works", a._login_fails, 0)
    check("every button is reported on the new session",
          sorted(u for u in leap.subscribed if u.startswith("/button/")), ["/button/101/status/event", "/button/102/status/event"])
    check("and the connector knows they took", a._subs_complete(), True)
    check("the bridge is never asked about a Hue or Nanoleaf light", [u for u in leap.asked if "light_a" in u or "N1" in u], [])
    check("the Hue and Nanoleaf lights are back afterwards", ("hue_light_a" in br.devices, "nanoleaf_N1" in br.devices), (True, True))
    check("and the Hue room", "hue_room_1" in br.areas, True)
    check("the Lutron lamp's level was read", br.devices["2"]["current_state"], 40)
    check("the app is sent the inventory with everything in it",
          [m for m in a.sent if m.get("type") == "inventory"][-1:] and
          {"2", "hue_light_a", "nanoleaf_N1"} <= set([m for m in a.sent if m.get("type") == "inventory"][-1]["inventory"]["devices"]),
          True)

    # 3. a Hue load that lands in the middle of a login waits for it, then is told to the app
    br = logged_in_bridge()
    a = make_agent(br)
    br._login = a._login_bridge
    await br._login()
    a._merge_hue(send=False)
    real = br._load_scenes

    async def hue_loads_meanwhile():
        a._merge_hue(send=True)  # Hue's on_loaded, arriving while the bridge is logging in
        check("a merge during the login leaves the library's list alone", "hue_light_a" in br.devices, False)
        await real()

    br._load_scenes = hue_loads_meanwhile
    br._leap = Leap()
    await br._login()
    check("after it, the light is back", "hue_light_a" in br.devices, True)
    check("and the Hue news was passed on", any(m.get("type") == "hue" for m in a.sent), True)

    # 4. a login that fails still puts the lights back, and is counted
    br = logged_in_bridge()
    a = make_agent(br)
    br._login = a._login_bridge
    await br._login()
    a._merge_hue(send=False)

    async def refused():
        raise RuntimeError("bridge said no")

    br._load_devices = refused
    br._leap = Leap()
    try:
        await br._login()
    except RuntimeError:
        pass
    check("a failed login still puts the Hue light back", "hue_light_a" in br.devices, True)
    check("and is counted", a._login_fails, 1)

    # 5. three failed logins in a row: the connector restarts, but never within ten minutes of a start
    restarts = []
    a.restart = lambda why: restarts.append(why)

    class Done:
        def done(self): return True
        def cancelled(self): return False
        def exception(self): return KeyError("button_groups")

    class Running:
        def done(self): return False

    br._monitor_task = Running()
    br._login_task = Done()
    a._link_kick_at = -A.LINK_KICK_GAP_S
    a._reconnects = 0
    a._link_problem = None
    a._login_fails = 2
    await a._check_link()
    check("two failed logins: a fresh session, no restart", (a._reconnects, restarts), (1, []))
    a._login_fails = 3
    await a._check_link()
    check("three: the connector restarts", len(restarts), 1)
    del a.restart
    a._started_at = time.time() - 60
    calls = []
    real_exec = A.os.execv
    A.os.execv = lambda *x: calls.append(x)
    try:
        a.restart("test")
        check("not within ten minutes of a start", calls, [])
        a._started_at = time.time() - A.RESTART_MIN_UP_S - 1
        a.restart("test")
        check("after that it does", len(calls), 1)
    finally:
        A.os.execv = real_exec


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
