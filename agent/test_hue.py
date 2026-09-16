"""The Hue client against a small fake bridge: pairing, loading, setting a level, colour and white temperature, live events.
Run: python test_hue.py  (needs aiohttp)"""
import asyncio
import json
import tempfile
from pathlib import Path

from aiohttp import web

from color import GAMUT_C, in_gamut
from hue import Hue, color_state, hid

LIGHT = "3f1c0a2e-1111-4a4a-8a8a-000000000001"
SWITCH = "3f1c0a2e-1111-4a4a-8a8a-000000000002"
COLOR = "3f1c0a2e-1111-4a4a-8a8a-000000000003"
DEV1 = "dev-1"
DEV2 = "dev-2"
DEV3 = "dev-3"
GAMUT = {"red": {"x": 0.6915, "y": 0.3083}, "green": {"x": 0.17, "y": 0.7}, "blue": {"x": 0.1532, "y": 0.0475}}
ROOM = "room-1"
SCENE = "scene-1"


def make_app(state):
    async def api(request):
        state["pair_calls"] += 1
        if state["pair_calls"] < 2:
            return web.json_response([{"error": {"type": 101, "description": "link button not pressed"}}])
        return web.json_response([{"success": {"username": "KEY123", "clientkey": "CK"}}])

    async def resource(request):
        kind = request.match_info["kind"]
        assert request.headers.get("hue-application-key") == "KEY123"
        if kind == "light":
            return web.json_response({"data": [
                {"id": LIGHT, "type": "light", "owner": {"rid": DEV1, "rtype": "device"}, "metadata": {"name": "Desk lamp"}, "on": {"on": True}, "dimming": {"brightness": 42.5}, "color": {}},
                {"id": SWITCH, "type": "light", "owner": {"rid": DEV2, "rtype": "device"}, "metadata": {"name": "Plug"}, "on": {"on": False}},
                {"id": COLOR, "type": "light", "owner": {"rid": DEV3, "rtype": "device"}, "metadata": {"name": "Hue go"}, "on": {"on": True}, "dimming": {"brightness": 70},
                 "color_temperature": {"mirek": 370, "mirek_valid": True, "mirek_schema": {"mirek_minimum": 153, "mirek_maximum": 500}},
                 "color": {"xy": {"x": 0.4573, "y": 0.41}, "gamut": GAMUT, "gamut_type": "C"}},
            ]})
        if kind == "room":
            return web.json_response({"data": [{"id": ROOM, "type": "room", "metadata": {"name": "Office"}, "children": [{"rid": DEV1, "rtype": "device"}, {"rid": DEV2, "rtype": "device"}, {"rid": DEV3, "rtype": "device"}]}]})
        if kind == "scene":
            return web.json_response({"data": [{"id": SCENE, "type": "scene", "metadata": {"name": "Focus"}, "group": {"rid": ROOM, "rtype": "room"}}]})
        return web.json_response({"data": []})

    async def put_light(request):
        state["puts"].append((request.match_info["id"], await request.json()))
        return web.json_response({"data": [{"rid": request.match_info["id"], "rtype": "light"}]})

    async def put_scene(request):
        state["scenes"].append((request.match_info["id"], await request.json()))
        return web.json_response({"data": []})

    async def events(request):
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await resp.prepare(request)
        ev = [{"type": "update", "data": [{"id": LIGHT, "type": "light", "on": {"on": True}, "dimming": {"brightness": 80}}]}]
        await resp.write(b": hi\n\n")
        await resp.write(f"id: 1\ndata: {json.dumps(ev)}\n\n".encode())
        ev2 = [{"type": "update", "data": [{"id": LIGHT, "type": "light", "on": {"on": False}}]}]
        await resp.write(f"id: 2\ndata: {json.dumps(ev2)}\n\n".encode())
        # the Hue app paints the lamp blue: colour arrives with mirek_valid false, then a warm white comes back
        ev3 = [{"type": "update", "data": [{"id": COLOR, "type": "light", "color": {"xy": {"x": 0.1532, "y": 0.0475}}, "color_temperature": {"mirek_valid": False}}]}]
        await resp.write(f"id: 3\ndata: {json.dumps(ev3)}\n\n".encode())
        ev4 = [{"type": "update", "data": [{"id": COLOR, "type": "light", "color_temperature": {"mirek": 250, "mirek_valid": True}}]}]
        await resp.write(f"id: 4\ndata: {json.dumps(ev4)}\n\n".encode())
        await asyncio.sleep(0.4)
        return resp

    app = web.Application()
    app.router.add_post("/api", api)
    app.router.add_get("/clip/v2/resource/{kind}", resource)
    app.router.add_put("/clip/v2/resource/light/{id}", put_light)
    app.router.add_put("/clip/v2/resource/scene/{id}", put_scene)
    app.router.add_get("/eventstream/clip/v2", events)
    return app


async def main():
    state = {"pair_calls": 0, "puts": [], "scenes": []}
    runner = web.AppRunner(make_app(state))
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]  # noqa: SLF001

    changed = []
    loaded = []
    with tempfile.TemporaryDirectory() as tmp:
        hue = Hue(Path(tmp), on_state=changed.append, on_loaded=lambda: loaded.append(1), scheme="http")
        assert not hue.paired
        # pairing: first answer is "press the button", the second hands out the key, and the bridge loads
        info = await hue.pair(f"127.0.0.1:{port}", seconds=8)
        assert hue.paired and info["lights"] == 3 and info["rooms"] == 1 and info["scenes"] == 0, info
        assert json.loads((Path(tmp) / "hue.json").read_text())["key"] == "KEY123"
        assert loaded, "on_loaded fired"
        d = hue.devices[hid(LIGHT)]
        assert d["type"] == "HueLight" and d["area"] == hid(ROOM) and d["current_state"] == 42 and d["zone"] == LIGHT and d["name"] == "Desk lamp", d
        assert hue.devices[hid(SWITCH)]["type"] == "HueSwitch" and hue.devices[hid(SWITCH)]["current_state"] == 0
        assert hue.areas[hid(ROOM)]["name"] == "Office" and not hue.scenes, "Hue scenes stay out"
        # a plain dimmer has neither colour nor tunable white; the colour lamp reports its gamut, range and mode
        assert d["color"] is None and d["ct"] is None and d["color_mode"] is None and color_state(d) is None
        c = hue.devices[hid(COLOR)]
        assert c["color"] == {"gamut": {"red": [0.6915, 0.3083], "green": [0.17, 0.7], "blue": [0.1532, 0.0475]}, "xy": [0.4573, 0.41]}, c["color"]
        assert c["ct"] == {"min": 153, "max": 500, "mirek": 370} and c["color_mode"] == "ct", c
        cs = color_state(c)
        assert cs["mode"] == "ct" and cs["kelvin"] == 2703 and cs["xy"] == [0.4573, 0.41] and cs["hex"].startswith("#ff"), cs
        # setting a level: on with brightness and a fade in ms; off is just off
        await hue.set_level(hid(LIGHT), 60, 2.5)
        await hue.set_level(hid(SWITCH), 100, None)
        await hue.set_level(hid(LIGHT), 0, None)
        assert state["puts"][0] == (LIGHT, {"on": {"on": True}, "dimming": {"brightness": 60}, "dynamics": {"duration": 2500}}), state["puts"]
        assert state["puts"][1] == (SWITCH, {"on": {"on": True}}), state["puts"]
        assert state["puts"][2] == (LIGHT, {"on": {"on": False}}), state["puts"]
        assert hue.devices[hid(LIGHT)]["current_state"] == 0
        # white temperature: kelvin becomes mirek, clamped to the lamp's range, and the lamp comes on
        await hue.set_color(hid(COLOR), kelvin=4000)
        await hue.set_color(hid(COLOR), kelvin=1500, fade_s=1)          # below the range: the warmest it does
        await hue.set_color(hid(COLOR), kelvin=9000, level=30)          # above it: the coolest, with a brightness
        assert state["puts"][3] == (COLOR, {"on": {"on": True}, "color_temperature": {"mirek": 250}}), state["puts"][3]
        assert state["puts"][4] == (COLOR, {"on": {"on": True}, "color_temperature": {"mirek": 500}, "dynamics": {"duration": 1000}}), state["puts"][4]
        assert state["puts"][5] == (COLOR, {"on": {"on": True}, "dimming": {"brightness": 30}, "color_temperature": {"mirek": 153}}), state["puts"][5]
        c = hue.devices[hid(COLOR)]
        assert c["ct"]["mirek"] == 153 and c["color_mode"] == "ct" and c["current_state"] == 30 and color_state(c)["kelvin"] == 6536
        # a colour: hex becomes xy inside the gamut; pure green is outside gamut C and lands on its edge
        await hue.set_color(hid(COLOR), hex="#00ff00")
        body = state["puts"][6][1]
        xy = (body["color"]["xy"]["x"], body["color"]["xy"]["y"])
        assert body["on"] == {"on": True} and "color_temperature" not in body and in_gamut(xy, GAMUT_C), body
        assert xy[1] > 0.6 and xy[0] < 0.25, xy
        assert c["color_mode"] == "xy" and c["color"]["xy"] == list(xy) and color_state(c)["mode"] == "xy", c
        assert color_state(c)["hex"][3:5] == "ff", color_state(c)  # the app is told a green
        # a colour with level 0 is just off; a colour the lamp cannot do is refused
        await hue.set_color(hid(COLOR), hex="#ff0000", level=0)
        assert state["puts"][7] == (COLOR, {"on": {"on": False}}), state["puts"][7]
        try:
            await hue.set_color(hid(LIGHT), kelvin=3000); raise AssertionError("expected an error")
        except RuntimeError:
            pass
        assert len(state["puts"]) == 8
        try:
            await hue.recall_scene(hid(SCENE)); raise AssertionError("expected an error")
        except RuntimeError:
            pass
        # the event stream moved the lamp to 80 then off, telling the agent each time
        await asyncio.sleep(0.8)
        assert hid(LIGHT) in changed and changed.count(hid(LIGHT)) >= 4, changed
        assert hue.devices[hid(LIGHT)]["current_state"] == 0
        # ...and the colour lamp went blue (xy mode) then back to a 4000 K white (ct mode)
        c = hue.devices[hid(COLOR)]
        assert c["color"]["xy"] == [0.1532, 0.0475] and c["ct"]["mirek"] == 250 and c["color_mode"] == "ct", c
        assert color_state(c)["kelvin"] == 4000 and changed.count(hid(COLOR)) >= 6, changed
        # forgetting clears everything
        await hue.forget()
        assert not hue.paired and not hue.devices and not (Path(tmp) / "hue.json").exists()
        # a fresh instance reads the saved pairing back
        (Path(tmp) / "hue.json").write_text(json.dumps({"host": "1.2.3.4", "key": "K"}))
        assert Hue(Path(tmp)).paired
        await hue.stop()
    await runner.cleanup()
    print("hue: ok")


asyncio.run(main())
