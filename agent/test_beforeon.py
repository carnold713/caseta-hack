"""A lamp comes on already the colour it is going to be: python test_beforeon.py (needs aiohttp)

The owner's case: a lamp left on blue, everything switched off, then everything switched on. It used to
arrive blue and travel to white while they watched, because the white was sent as a correction after the
bridge reported the lamp lit. A colour change to a lamp that is off cannot be seen, so that is when to
send it. What this checks is the order and the content of the requests that reach the bridge.
"""
import asyncio
import json
import os
import tempfile
from pathlib import Path

from aiohttp import web

import daylight
from daylight import Day
from engine import ActionRunner
from hue import Hue

LIGHT = "3f1c0a2e-1111-4a4a-8a8a-000000000001"
FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f'\n      wanted {want!r}'))
    if not ok:
        FAILS.append(name)


def make_app(state):
    async def resource(request):
        kind = request.match_info["kind"]
        if kind == "light":
            return web.json_response({"data": list(state["lights"].values())})
        return web.json_response({"data": []})

    async def put_light(request):
        state["puts"].append((request.match_info["lid"], await request.json()))
        return web.json_response({"data": []})

    app = web.Application()
    app.router.add_get("/clip/v2/resource/{kind}", resource)
    app.router.add_put("/clip/v2/resource/light/{lid}", put_light)
    app.router.add_get("/eventstream/clip/v2", lambda r: web.Response(text="", content_type="text/event-stream"))
    return app


async def main():
    state = {"puts": [], "lights": {LIGHT: {
        "id": LIGHT, "type": "light", "metadata": {"name": "Desk lamp"},
        "owner": {"rid": "dev-1", "rtype": "device"},
        "on": {"on": False}, "dimming": {"brightness": 0.0},
        "color_temperature": {"mirek": 366, "mirek_schema": {"mirek_minimum": 153, "mirek_maximum": 500}},
        "color": {"gamut": None, "xy": {"x": 0.15, "y": 0.06}},
    }}}
    runner_ = web.AppRunner(make_app(state)); await runner_.setup()
    site = web.TCPSite(runner_, "127.0.0.1", 0); await site.start()
    port = site._server.sockets[0].getsockname()[1]

    tmp = Path(tempfile.mkdtemp(prefix="beforeon-"))
    (tmp / "hue.json").write_text(json.dumps({"host": f"127.0.0.1:{port}", "key": "KEY123"}))
    hue = Hue(tmp, scheme="http")
    await hue.start()
    await asyncio.sleep(0.4)
    did = next(iter(hue.devices))

    class FakeBridge:
        devices = hue.devices
    bridge = FakeBridge()
    cfg = {"settings": {"default_fade": 1.0}, "presets": []}
    r = ActionRunner(lambda: bridge, lambda: cfg)
    r.hue_set = hue.set_level
    r.hue_color = hue.set_color
    following = {did}
    # what agent.py's _before_on does, with the connector's own wiring left out
    async def before_on(device_id):
        if device_id not in following:
            return
        ct = (hue.devices.get(device_id) or {}).get("ct")
        day = lambda d: Day(sunrise=daylight.datetime(d.year, d.month, d.day, 5, 30),
                            noon=daylight.datetime(d.year, d.month, d.day, 13, 15),
                            sunset=daylight.datetime(d.year, d.month, d.day, 21, 0))
        mirek = daylight.lamp_mirek(daylight.datetime(2026, 6, 21, 14, 0), day, ct.get("min"), ct.get("max"))
        await hue.set_warmth(device_id, daylight.mirek_to_kelvin(mirek), fade_s=None, while_off=True)
    r.before_on = before_on

    # 1. off, sitting on blue, and switched on
    check("the lamp starts off", int(hue.devices[did]["current_state"]), 0)
    state["puts"].clear()
    await r.run_one({"type": "level", "target": f"d:{did}", "level": 80})
    kinds = [set(b) for _, b in state["puts"]]
    check("two requests, in this order", kinds, [{"color_temperature"}, {"on", "dimming", "dynamics"}])
    first = state["puts"][0][1]
    check("the colour goes first, and alone", "on" not in first and "dimming" not in first, True)
    check("with no fade of its own, because nothing can see it", "dynamics" not in first, True)
    check("the lamp is dark when it arrives", first["color_temperature"]["mirek"] > 0, True)
    second = state["puts"][1][1]
    check("then the light comes on", second["on"], {"on": True})
    check("at the level asked for", second["dimming"], {"brightness": 80})
    check("over the fade, which is the part worth watching", second["dynamics"], {"duration": 1000})
    check("and nothing follows it to change the colour", len(state["puts"]), 2)

    # 2. a lamp that is already on is not touched first: it is lit, so a colour change there is visible
    #    and belongs to whatever asked for it
    state["puts"].clear()
    await r.run_one({"type": "level", "target": f"d:{did}", "level": 40})
    check("an already lit lamp just takes the level", [set(b) for _, b in state["puts"]], [{"on", "dimming", "dynamics"}])

    # 3. a lamp that does not follow the day keeps the colour it was left on
    state["puts"].clear()
    following.clear()
    await hue.set_level(did, 0)
    state["puts"].clear()
    await r.run_one({"type": "level", "target": f"d:{did}", "level": 80})
    check("a lamp that is not following is left as it was", [set(b) for _, b in state["puts"]], [{"on", "dimming", "dynamics"}])

    await hue.stop()
    await runner_.cleanup()


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
