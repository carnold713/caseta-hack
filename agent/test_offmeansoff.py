"""Off means off:  python test_offmeansoff.py

The owner: "when I click All off, or Off, the lights REALLY do turn off. I can spam click buttons and get it to act
up, or sometimes it just doesn't turn random lights off." Three ways that happened, each pinned here:

- taps faster than the bridge answers ran at once, so an older On could reach a light after a newer Off;
- a bridge busy with a burst can drop a command, and nothing looked again;
- "all" was a list of Lutron model names, and a model missing from it was never part of All off.

And then, with Hue: "sometimes when I click off on the Pico remote, some of the lights (the Philips Hue for example)
don't turn off. If I click off again, it'll turn off, but the first time it doesn't." A Hue bridge answers 200 when it
has accepted a command, not when the lamp has acted, and hue.py wrote the lamp's state as off the moment it did. A
command lost on the way to the lamp left the lamp on, the event stream silent, and the check reading that same "off".
The second half of this file runs the real Hue and Nanoleaf clients against fake bridges that accept a command and
then lose it, and needs aiohttp.
"""
import asyncio
import tempfile
import time
from pathlib import Path

from aiohttp import web

import engine
from engine import ActionRunner
from hue import Hue, hid
from nanoleaf import Nanoleaf, nid

engine.asyncio  # the module's own loop helpers are what the runner uses


class SlowBridge:
    """A Smartbridge that answers slowly, can be told to drop commands, and reports what reached each light."""

    def __init__(self):
        self.devices = {
            "5": {"device_id": "5", "type": "WallDimmer", "zone": "2", "current_state": 0},
            "6": {"device_id": "6", "type": "WallSwitch", "zone": "3", "current_state": 100},
            # a Lutron model the old list never named
            "7": {"device_id": "7", "type": "SomeNewDimmer2027", "zone": "4", "current_state": 60},
            "8": {"device_id": "8", "type": "CasetaFanSpeedController", "zone": "5", "current_state": 0},
            "9": {"device_id": "9", "type": "Pico3ButtonRaiseLower", "current_state": -1},   # a remote: no zone
        }
        self.calls = []
        self.drop = set()      # device ids whose next command is lost
        self.delay = {}        # device id -> seconds a command takes

    async def set_value(self, device_id, level, fade_time=None):
        await asyncio.sleep(self.delay.get(device_id, 0))
        self.calls.append((device_id, level))
        if device_id in self.drop:
            self.drop.discard(device_id)
            return
        self.devices[device_id]["current_state"] = level

    async def set_fan(self, device_id, speed):
        self.calls.append((device_id, speed))


async def main():
    bad = 0

    def check(name, ok, got=""):
        nonlocal bad
        bad += not ok
        print(("PASS" if ok else "FAIL"), name, "" if ok else got)

    bridge = SlowBridge()
    cfg = {"settings": {"default_fade": 0}}
    r = ActionRunner(lambda: bridge, lambda: cfg)

    # "all" is every light-like output: the unlisted model is in, the fan and the remote are not
    got = r._resolve("h:all")
    check("All reaches a Lutron model the list never named", "7" in got, got)
    check("All leaves out the fan and the remote", "8" not in got and "9" not in got, got)

    # spam: On, Off, On, Off on the same light, faster than the bridge answers. The last tap wins, and the
    # commands in between that were overtaken while they waited are not sent at all.
    bridge.delay["5"] = 0.15
    bridge.calls.clear()
    taps = [asyncio.create_task(r.run_one({"type": "level", "target": "d:5", "level": lv})) for lv in (100, "off", 100, "off")]
    await asyncio.gather(*taps)
    sent = [lv for d, lv in bridge.calls if d == "5"]
    check("four taps in a row end where the last one said", bridge.devices["5"]["current_state"] == 0, sent)
    check("the taps overtaken while they waited stand down", len(sent) <= 2 and sent[-1] == 0, sent)
    bridge.delay.clear()

    # All off with the bridge dropping one light's command: it is looked at again and sent again
    for d in ("5", "6", "7"):
        bridge.devices[d]["current_state"] = 80
    bridge.drop = {"6"}
    bridge.calls.clear()
    await r.run_one({"type": "level", "target": "h:all", "level": "off"})
    check("the dropped light is still on right after", bridge.devices["6"]["current_state"] == 80)
    await asyncio.sleep(1.8)
    check("a moment later it is off: the off was sent again", bridge.devices["6"]["current_state"] == 0, bridge.calls)
    check("every light is off", all(bridge.devices[d]["current_state"] == 0 for d in ("5", "6", "7")),
          {d: bridge.devices[d]["current_state"] for d in ("5", "6", "7")})

    # a light turned back on on purpose after the off is left alone by the check
    bridge.devices["5"]["current_state"] = 80
    bridge.drop = {"5"}
    await r.run_one({"type": "level", "target": "d:5", "level": "off"})
    await r.run_one({"type": "level", "target": "d:5", "level": 50})
    await asyncio.sleep(1.8)
    check("the check never undoes a newer On", bridge.devices["5"]["current_state"] == 50, bridge.calls[-3:])

    # one light that does not answer does not stop the others going off, and says so
    for d in ("5", "6", "7"):
        bridge.devices[d]["current_state"] = 80
    orig = bridge.set_value

    async def broken(device_id, level, fade_time=None):
        if device_id == "7":
            raise RuntimeError("timed out")
        await orig(device_id, level, fade_time)
    bridge.set_value = broken
    try:
        await r.run_one({"type": "level", "target": "h:all", "level": "off"})
        check("a light that did not answer is reported", False, "no error")
    except RuntimeError as exc:
        check("a light that did not answer is reported", "didn't answer" in str(exc), str(exc))
    check("and the rest still went off", bridge.devices["5"]["current_state"] == 0 and bridge.devices["6"]["current_state"] == 0)
    bridge.set_value = orig
    await asyncio.sleep(1.8)
    check("the one that did not answer is tried again", bridge.devices["7"]["current_state"] == 0, bridge.devices["7"])

    bad += await lamps_on_other_bridges()
    print("ALL OK" if not bad else f"{bad} FAILED")
    return bad


def hue_app(state):
    """A Hue bridge that answers 200 to every light command and can be told to lose some of them on the way."""

    async def resource(request):
        if request.match_info["kind"] == "light":
            return web.json_response({"data": list(state["lights"].values())})
        return web.json_response({"data": []})

    async def get_light(request):
        return web.json_response({"data": [state["lights"][request.match_info["id"]]]})

    async def put_light(request):
        lid, body = request.match_info["id"], await request.json()
        state["puts"].append((lid, body, time.monotonic()))
        if state["lose"].get(lid):
            state["lose"][lid] -= 1
            return web.json_response({"data": [{"rid": lid, "rtype": "light"}]})
        L = state["lights"][lid]
        if "on" in body:
            L["on"] = {"on": body["on"]["on"]}
        if "dimming" in body:
            L["dimming"] = {"brightness": body["dimming"]["brightness"]}
        return web.json_response({"data": [{"rid": lid, "rtype": "light"}]})

    app = web.Application()
    app.router.add_get("/clip/v2/resource/{kind}", resource)
    app.router.add_get("/clip/v2/resource/light/{id}", get_light)
    app.router.add_put("/clip/v2/resource/light/{id}", put_light)
    return app


def nanoleaf_app(state):
    """A Nanoleaf controller that accepts a PUT and can be told to lose it."""

    async def info(request):
        return web.json_response({"name": "Panels", "serialNo": "NL1", "model": "NL22",
                                  "state": {"on": {"value": state["on"]}, "brightness": {"value": state["bri"]}}})

    async def put_state(request):
        body = await request.json()
        state["puts"].append(body)
        if state["lose"]:
            state["lose"] -= 1
            return web.Response(status=204)
        if "on" in body:
            state["on"] = bool(body["on"]["value"])
        if "brightness" in body:
            state["bri"] = int(body["brightness"]["value"])
        return web.Response(status=204)

    app = web.Application()
    app.router.add_get("/api/v1/{token}/", info)
    app.router.add_put("/api/v1/{token}/state", put_state)
    return app


async def serve(app):
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    return runner, f"127.0.0.1:{site._server.sockets[0].getsockname()[1]}"  # noqa: SLF001


async def lamps_on_other_bridges():
    bad = 0

    def check(name, ok, got=""):
        nonlocal bad
        bad += not ok
        print(("PASS" if ok else "FAIL"), name, "" if ok else got)

    def light(n, ct=False):
        L = {"id": f"L{n}", "type": "light", "owner": {"rid": f"dev-{n}", "rtype": "device"}, "metadata": {"name": f"Lamp {n}"},
             "on": {"on": True}, "dimming": {"brightness": 80}}
        if ct:
            L["color_temperature"] = {"mirek": 300, "mirek_valid": True, "mirek_schema": {"mirek_minimum": 153, "mirek_maximum": 500}}
        return L

    hstate = {"lights": {f"L{n}": light(n, ct=(n == 4)) for n in range(1, 6)}, "puts": [], "lose": {}}
    nstate = {"on": True, "bri": 70, "puts": [], "lose": 0}
    hrun, hhost = await serve(hue_app(hstate))
    nrun, nhost = await serve(nanoleaf_app(nstate))
    told = []
    with tempfile.TemporaryDirectory() as tmp:
        hue = Hue(Path(tmp), on_state=told.append, scheme="http")
        hue.host, hue.key = hhost, "K"
        await hue.load()
        nl = Nanoleaf(Path(tmp), on_state=told.append)
        nl.entries = [{"host": nhost, "token": "T", "serial": "NL1", "name": "Panels", "model": "NL22"}]
        await nl._refresh_all()  # noqa: SLF001

        bridge = SlowBridge()
        bridge.devices.update(hue.devices)       # the same dicts, as the agent's merge does
        bridge.devices.update(nl.devices)
        cfg = {"settings": {"default_fade": 0}, "presets": []}
        r = ActionRunner(lambda: bridge, lambda: cfg)

        def backend(d):
            return hue if d.startswith("hue_") else nl
        r.hue_set = lambda d, lv, fs: backend(d).set_level(d, lv, fs)
        r.hue_color = lambda d, **kw: backend(d).set_color(d, **kw)
        r.hue_verify = lambda d, adopt=False: backend(d).verify(d, adopt)
        A, B, C, D, E = (hid(f"L{n}") for n in range(1, 6))
        N = nid("NL1")

        def sent_to(lid):
            return [b for i, b, _ in hstate["puts"] if i == lid]

        async def until(cond, limit):
            t0 = time.monotonic()
            while not cond() and time.monotonic() - t0 < limit:
                await asyncio.sleep(0.02)
            return time.monotonic() - t0

        def reset(*lids):
            for lid in lids:
                hstate["lights"][lid]["on"] = {"on": True}
                hstate["lights"][lid]["dimming"] = {"brightness": 80}
                hue.devices[hid(lid)]["current_state"] = 80
                hue.devices[hid(lid)]["_on"], hue.devices[hid(lid)]["_bri"] = True, 80.0
            hstate["puts"].clear()

        # ----- the owner's press: Off on a Pico over three Hue lamps, and the bridge loses one -----
        reset("L1", "L2", "L3")
        hstate["lose"] = {"L2": 1}
        t0 = time.monotonic()
        await r.run_one({"type": "level", "target": [f"d:{A}", f"d:{B}", f"d:{C}"], "level": "off"})
        check("the lost lamp reads off at first: the bridge accepted it", hue.devices[B]["current_state"] == 0)
        check("but it is on at the bridge", hstate["lights"]["L2"]["on"]["on"] is True)
        await until(lambda: not hstate["lights"]["L2"]["on"]["on"], 3)
        took = time.monotonic() - t0
        check("it is seen and sent again within about a second of the press", took < 1.4, round(took, 2))
        check("and ends off", hstate["lights"]["L2"]["on"]["on"] is False and hue.devices[B]["current_state"] == 0)
        await asyncio.sleep(1.8)
        check("the lamp that was lost was sent off twice, no more", len(sent_to("L2")) == 2, sent_to("L2"))
        check("the lamps that did go off were not sent again", len(sent_to("L1")) == 1 and len(sent_to("L3")) == 1,
              (sent_to("L1"), sent_to("L3")))
        times = [t for _, _, t in hstate["puts"]][:3]
        check("the three offs went out paced, not at once", all(b - a >= 0.085 for a, b in zip(times, times[1:])),
              [round(b - a, 3) for a, b in zip(times, times[1:])])

        # ----- a lamp that will not go off at all: after the resends, the app is shown the truth -----
        reset("L1")
        hstate["lose"] = {"L1": 99}
        told.clear()
        await r.run_one({"type": "level", "target": f"d:{A}", "level": "off"})
        check("it reads off at first", hue.devices[A]["current_state"] == 0)
        await until(lambda: hue.devices[A]["current_state"] > 0, 7)
        check("once the resends are spent it shows as on, the way it is", hue.devices[A]["current_state"] == 80, hue.devices[A]["current_state"])
        check("the app was told", A in told)
        check("it was sent off three times in all", len(sent_to("L1")) == 3, sent_to("L1"))
        hstate["lose"] = {}

        # ----- a newer On after a lost Off is left alone -----
        reset("L1")
        hstate["lose"] = {"L1": 1}
        await r.run_one({"type": "level", "target": f"d:{A}", "level": "off"})
        await r.run_one({"type": "level", "target": f"d:{A}", "level": 50})
        await asyncio.sleep(1.4)
        check("the check never undoes a newer On", hstate["lights"]["L1"]["on"]["on"] is True and hue.devices[A]["current_state"] == 50
              and len(sent_to("L1")) == 2, sent_to("L1"))

        # ----- a scene with lights at 0, one of them with a colour, beside a Lutron light at 0 -----
        reset("L1", "L4")
        hstate["lose"] = {"L1": 1, "L4": 1}
        bridge.devices["5"]["current_state"] = 80
        bridge.drop = {"5"}
        cfg["presets"] = [{"id": "night", "levels": {A: 0, D: {"level": 0, "kelvin": 2700}, "5": 0}}]
        await r.run_one({"type": "preset", "preset_id": "night"})
        await until(lambda: not hstate["lights"]["L1"]["on"]["on"] and not hstate["lights"]["L4"]["on"]["on"], 3)
        check("a scene's lamp at 0 is checked and sent again", hstate["lights"]["L1"]["on"]["on"] is False, sent_to("L1"))
        check("so is one at 0 with a colour", hstate["lights"]["L4"]["on"]["on"] is False, sent_to("L4"))
        await asyncio.sleep(1.2)
        check("and the Lutron light at 0 in the same scene", bridge.devices["5"]["current_state"] == 0, bridge.calls[-3:])

        # ----- a Pico toggle that turns things off -----
        reset("L2", "L3")
        hstate["lose"] = {"L3": 1}
        await r.run_one({"type": "level", "target": [f"d:{B}", f"d:{C}"], "level": "toggle"})
        await until(lambda: not hstate["lights"]["L3"]["on"]["on"], 3)
        check("a toggle that turns lamps off gets the check", hstate["lights"]["L3"]["on"]["on"] is False and len(sent_to("L3")) == 2,
              sent_to("L3"))

        # ----- a timer running out is a level 0 through the same path -----
        reset("L5")
        hstate["lose"] = {"L5": 1}
        r.start_timer(f"d:{E}", 0, 0, 0)
        await until(lambda: not hstate["lights"]["L5"]["on"]["on"], 3)
        check("a timer's off gets the check", hstate["lights"]["L5"]["on"]["on"] is False and len(sent_to("L5")) == 2, sent_to("L5"))

        # ----- Nanoleaf: the same trust in an accepted PUT, the same look back -----
        nstate.update({"on": True, "bri": 70, "lose": 1})
        nstate["puts"].clear()
        bridge.devices[N]["current_state"] = 70
        await r.run_one({"type": "level", "target": f"d:{N}", "level": "off"})
        check("a Nanoleaf off that was lost reads off at first", bridge.devices[N]["current_state"] == 0 and nstate["on"] is True)
        took = await until(lambda: not nstate["on"], 3)
        check("it is seen and sent again", nstate["on"] is False and took < 1.4, (nstate, round(took, 2)))
        nstate["puts"].clear()
        nstate.update({"on": True, "lose": 0})
        bridge.devices[N]["current_state"] = 70
        await r.run_one({"type": "level", "target": f"d:{N}", "level": "off"})
        await asyncio.sleep(1.5)
        check("a Nanoleaf that did go off is not sent again", nstate["puts"] == [{"on": {"value": False}}], nstate["puts"])

        await hue.stop()
        await nl.stop()
    await hrun.cleanup()
    await nrun.cleanup()
    return bad


if __name__ == "__main__":
    raise SystemExit(1 if asyncio.run(main()) else 0)
