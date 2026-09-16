"""The Hue client against a small fake bridge: pairing, loading, setting a level, live events.
Run: python test_hue.py  (needs aiohttp)"""
import asyncio
import json
import tempfile
from pathlib import Path

from aiohttp import web

from hue import Hue, hid

LIGHT = "3f1c0a2e-1111-4a4a-8a8a-000000000001"
SWITCH = "3f1c0a2e-1111-4a4a-8a8a-000000000002"
DEV1 = "dev-1"
DEV2 = "dev-2"
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
            ]})
        if kind == "room":
            return web.json_response({"data": [{"id": ROOM, "type": "room", "metadata": {"name": "Office"}, "children": [{"rid": DEV1, "rtype": "device"}, {"rid": DEV2, "rtype": "device"}]}]})
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
        assert hue.paired and info["lights"] == 2 and info["rooms"] == 1 and info["scenes"] == 1, info
        assert json.loads((Path(tmp) / "hue.json").read_text())["key"] == "KEY123"
        assert loaded, "on_loaded fired"
        d = hue.devices[hid(LIGHT)]
        assert d["type"] == "HueLight" and d["area"] == hid(ROOM) and d["current_state"] == 42 and d["zone"] == LIGHT and d["name"] == "Desk lamp", d
        assert hue.devices[hid(SWITCH)]["type"] == "HueSwitch" and hue.devices[hid(SWITCH)]["current_state"] == 0
        assert hue.areas[hid(ROOM)]["name"] == "Office" and hue.scenes[hid(SCENE)]["name"] == "Focus"
        # setting a level: on with brightness and a fade in ms; off is just off
        await hue.set_level(hid(LIGHT), 60, 2.5)
        await hue.set_level(hid(SWITCH), 100, None)
        await hue.set_level(hid(LIGHT), 0, None)
        assert state["puts"][0] == (LIGHT, {"on": {"on": True}, "dimming": {"brightness": 60}, "dynamics": {"duration": 2500}}), state["puts"]
        assert state["puts"][1] == (SWITCH, {"on": {"on": True}}), state["puts"]
        assert state["puts"][2] == (LIGHT, {"on": {"on": False}}), state["puts"]
        assert hue.devices[hid(LIGHT)]["current_state"] == 0
        await hue.recall_scene(hid(SCENE))
        assert state["scenes"] == [(SCENE, {"recall": {"action": "active"}})]
        # the event stream moved the lamp to 80 then off, telling the agent each time
        await asyncio.sleep(0.8)
        assert hid(LIGHT) in changed and changed.count(hid(LIGHT)) >= 4, changed
        assert hue.devices[hid(LIGHT)]["current_state"] == 0
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
