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
        if kind == "room":
            return web.json_response({"data": [
                {"id": rid, "type": "room", "metadata": {"name": r["name"]},
                 "children": [{"rid": c, "rtype": "device"} for c in r["children"]]}
                for rid, r in state["rooms"].items()]})
        if kind == "light":
            # served from state, like the rooms below: a bridge that does not remember what it accepted
            # cannot be re-read, and re-reading is the whole point of the resync test
            state["light_reads"] += 1
            return web.json_response({"data": list(state["lights"].values())})
        if kind == "scene":
            return web.json_response({"data": [{"id": SCENE, "type": "scene", "metadata": {"name": "Focus"}, "group": {"rid": ROOM, "rtype": "room"}}]})
        return web.json_response({"data": []})

    def apply_light(lid, body):
        """What a real bridge does with an accepted PUT: it remembers it. Without this the fake serves a
        fixed payload for ever, so any correct re-read looks like it reverts whatever the test just did."""
        L = state["lights"].get(lid)
        if L is None:
            return
        if "on" in body:
            L["on"] = {"on": bool((body["on"] or {}).get("on"))}
        if "dimming" in body and "dimming" in L:
            L["dimming"] = {"brightness": body["dimming"]["brightness"]}
        if "color_temperature" in body and "color_temperature" in L:
            cte = body["color_temperature"] or {}      # an event may carry mirek_valid alone, with no mirek
            ct = {**L["color_temperature"]}
            if cte.get("mirek") is not None:
                ct["mirek"], ct["mirek_valid"] = cte["mirek"], True
            if "mirek_valid" in cte:
                ct["mirek_valid"] = bool(cte["mirek_valid"])
            L["color_temperature"] = ct
        if "color" in body and L.get("color"):
            L["color"] = {**L["color"], "xy": body["color"]["xy"]}
            if "color_temperature" in L:   # a colour takes the lamp out of white mode, as on a real bridge
                L["color_temperature"] = {**L["color_temperature"], "mirek_valid": False}

    async def put_light(request):
        lid, body = request.match_info["id"], await request.json()
        state["puts"].append((lid, body))
        apply_light(lid, body)
        return web.json_response({"data": [{"rid": lid, "rtype": "light"}]})

    def claim(kids, mine):
        """A real bridge keeps a device in one room only: naming it here takes it out of wherever it was."""
        for rid, room in state["rooms"].items():
            if rid != mine:
                room["children"] = [c for c in room["children"] if c not in kids]

    async def post_room(request):
        body = await request.json()
        state["posts"].append(body)
        rid = f"room-{len(state['rooms']) + 1}"
        kids = [c["rid"] for c in body.get("children") or []]
        state["rooms"][rid] = {"name": (body.get("metadata") or {}).get("name") or "Room", "children": kids}
        claim(kids, rid)
        return web.json_response({"data": [{"rid": rid, "rtype": "room"}]})

    async def put_room(request):
        rid = request.match_info["id"]
        body = await request.json()
        state["room_puts"].append((rid, body))
        room = state["rooms"].get(rid)
        if room is None:
            return web.json_response({"errors": [{"description": "no such room"}]}, status=404)
        if "metadata" in body:
            room["name"] = body["metadata"].get("name", room["name"])
        if "children" in body:
            room["children"] = [c["rid"] for c in body["children"]]
            claim(room["children"], rid)
        return web.json_response({"data": [{"rid": rid, "rtype": "room"}]})

    async def delete_room(request):
        rid = request.match_info["id"]
        if rid not in state["rooms"]:
            return web.json_response({"errors": [{"description": "no such room"}]}, status=404)
        del state["rooms"][rid]
        state["deleted"].append(rid)
        return web.json_response({"data": [{"rid": rid, "rtype": "room"}]})

    async def put_scene(request):
        state["scenes"].append((request.match_info["id"], await request.json()))
        return web.json_response({"data": []})

    async def events(request):
        """The stream stays open until the test asks for a drop, so a reconnect happens exactly where the
        test wants one and never in the middle of an unrelated assertion. The scripted events are sent on
        the first connection only: a real stream replays no backlog, which is the gap being tested."""
        state["stream_opens"] += 1
        first = state["stream_opens"] == 1
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await resp.prepare(request)
        await resp.write(b": hi\n\n")

        async def emit(n, ev):
            # the bridge sees what the stream reports, so a later re-read agrees with it
            for item in ev[0]["data"]:
                apply_light(item["id"], item)
            await resp.write(f"id: {n}\ndata: {json.dumps(ev)}\n\n".encode())

        if first:
            # Wait for the test to ask. The events must land after the PUTs above them, and the old fake got
            # that ordering only by accident: it wrote the events at connect time and they reached the client
            # in one lump when the stream closed. Holding the stream open (which is what a real one does)
            # delivers them immediately instead, so the order is stated here rather than inferred.
            for _ in range(1500):
                if state["send_events"]:
                    break
                await asyncio.sleep(0.02)
            await emit(1, [{"type": "update", "data": [{"id": LIGHT, "type": "light", "on": {"on": True}, "dimming": {"brightness": 80}}]}])
            await emit(2, [{"type": "update", "data": [{"id": LIGHT, "type": "light", "on": {"on": False}}]}])
            # the Hue app paints the lamp blue: colour arrives with mirek_valid false, then a warm white comes back
            await emit(3, [{"type": "update", "data": [{"id": COLOR, "type": "light", "color": {"xy": {"x": 0.1532, "y": 0.0475}}, "color_temperature": {"mirek_valid": False}}]}])
            await emit(4, [{"type": "update", "data": [{"id": COLOR, "type": "light", "color_temperature": {"mirek": 250, "mirek_valid": True}}]}])
        # bounded, and it also lets go when the client disconnects, so cleanup can never hang on this handler
        for _ in range(3000):
            if state["drop"] or request.transport is None or request.transport.is_closing():
                break
            await asyncio.sleep(0.02)
        state["drop"] = False        # one drop per request; the next connection stays up
        return resp

    app = web.Application()
    app.router.add_post("/api", api)
    app.router.add_get("/clip/v2/resource/{kind}", resource)
    app.router.add_put("/clip/v2/resource/light/{id}", put_light)
    app.router.add_post("/clip/v2/resource/room", post_room)
    app.router.add_put("/clip/v2/resource/room/{id}", put_room)
    app.router.add_delete("/clip/v2/resource/room/{id}", delete_room)
    app.router.add_put("/clip/v2/resource/scene/{id}", put_scene)
    app.router.add_get("/eventstream/clip/v2", events)
    return app


async def main():
    state = {"pair_calls": 0, "puts": [], "scenes": [], "posts": [], "room_puts": [], "deleted": [],
             "rooms": {ROOM: {"name": "Office", "children": [DEV1, DEV2, DEV3]}},
             "light_reads": 0, "stream_opens": 0, "drop": False, "send_events": False,
             "lights": {
                 LIGHT: {"id": LIGHT, "type": "light", "owner": {"rid": DEV1, "rtype": "device"}, "metadata": {"name": "Desk lamp"},
                         "on": {"on": True}, "dimming": {"brightness": 42.5}, "color": {}},
                 SWITCH: {"id": SWITCH, "type": "light", "owner": {"rid": DEV2, "rtype": "device"}, "metadata": {"name": "Plug"},
                          "on": {"on": False}},
                 COLOR: {"id": COLOR, "type": "light", "owner": {"rid": DEV3, "rtype": "device"}, "metadata": {"name": "Hue go"},
                         "on": {"on": True}, "dimming": {"brightness": 70},
                         "color_temperature": {"mirek": 370, "mirek_valid": True, "mirek_schema": {"mirek_minimum": 153, "mirek_maximum": 500}},
                         "color": {"xy": {"x": 0.4573, "y": 0.41}, "gamut": GAMUT, "gamut_type": "C"}},
             }}
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
        state["send_events"] = True
        for _ in range(100):
            await asyncio.sleep(0.02)
            if changed.count(hid(COLOR)) >= 6:
                break
        assert hid(LIGHT) in changed and changed.count(hid(LIGHT)) >= 4, changed
        assert hue.devices[hid(LIGHT)]["current_state"] == 0
        # ...and the colour lamp went blue (xy mode) then back to a 4000 K white (ct mode)
        c = hue.devices[hid(COLOR)]
        assert c["color"]["xy"] == [0.1532, 0.0475] and c["ct"]["mirek"] == 250 and c["color_mode"] == "ct", c
        assert color_state(c)["kelvin"] == 4000 and changed.count(hid(COLOR)) >= 6, changed
        # ----- a change made while the stream was down is picked up on reconnect -----
        # Hue's stream replays no backlog, and nothing else re-reads, so without a resync a lamp switched at
        # the wall or in Hue's own app during a drop stays wrong here until it happens to change again.
        # 33 is a brightness no event or PUT in this test ever sends, so only a genuine re-read produces it.
        reads_before, opens_before = state["light_reads"], state["stream_opens"]
        state["lights"][LIGHT]["on"] = {"on": True}
        state["lights"][LIGHT]["dimming"] = {"brightness": 33}
        state["drop"] = True                                  # the stream ends, as a real one can
        for _ in range(400):
            await asyncio.sleep(0.02)
            if hue.devices[hid(LIGHT)]["current_state"] == 33:
                break
        assert state["stream_opens"] > opens_before, "the client must reconnect after the stream ends"
        assert state["light_reads"] > reads_before, "and re-read the lights on the way back"
        assert hue.devices[hid(LIGHT)]["current_state"] == 33, (
            f"the change made during the drop must be picked up, got {hue.devices[hid(LIGHT)]['current_state']}")
        # the reconnect re-announces to the agent, which is how the app is told
        assert len(loaded) >= 2, loaded
        # and the stream is live again afterwards, not left dead
        assert hue.info()["live"] is True, hue.info()

        # ----- rooms: make one, move a lamp into it, rename it, empty it, delete it -----
        made = await hue.create_room("Studio", [hid(LIGHT)])
        assert made == hid("room-2") and state["posts"][0]["metadata"] == {"name": "Studio", "archetype": "other"}, state["posts"]
        assert state["posts"][0]["children"] == [{"rid": DEV1, "rtype": "device"}], state["posts"]
        assert hue.areas[made]["name"] == "Studio" and hue.areas[made]["children"] == [DEV1], hue.areas
        assert hue.devices[hid(LIGHT)]["area"] == made, hue.devices[hid(LIGHT)]["area"]
        # moving a lamp is a rewrite of the two rooms' children: out of one, into the other
        state["room_puts"].clear()
        await hue.move_light(hid(COLOR), made)
        assert state["room_puts"] == [
            (ROOM, {"children": [{"rid": DEV2, "rtype": "device"}]}),
            ("room-2", {"children": [{"rid": DEV1, "rtype": "device"}, {"rid": DEV3, "rtype": "device"}]}),
        ], state["room_puts"]
        assert hue.devices[hid(COLOR)]["area"] == made and hue.areas[hid(ROOM)]["children"] == [DEV2], hue.areas
        # moving it where it already is asks the bridge for nothing
        state["room_puts"].clear()
        await hue.move_light(hid(COLOR), made)
        assert state["room_puts"] == [], state["room_puts"]
        # renaming says so on the bridge and here
        await hue.rename_room(made, "Studio upstairs")
        assert state["rooms"]["room-2"]["name"] == "Studio upstairs" and hue.areas[made]["name"] == "Studio upstairs"
        # a lamp can be taken out of every room
        await hue.move_light(hid(LIGHT), None)
        assert hue.devices[hid(LIGHT)]["area"] is None and hue.areas[made]["children"] == [DEV3], hue.areas
        # deleting a room leaves its lamps on the bridge, in no room
        await hue.delete_room(made)
        assert made not in hue.areas and "room-2" in state["deleted"], (hue.areas, state["deleted"])
        assert hue.devices[hid(COLOR)]["area"] is None and hid(COLOR) in hue.devices, hue.devices[hid(COLOR)]
        # an unknown room is refused rather than guessed at
        for bad_call in (hue.rename_room(made, "x"), hue.delete_room(made), hue.move_light(hid(COLOR), made)):
            try:
                await bad_call; raise AssertionError("expected an error")
            except RuntimeError:
                pass
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
