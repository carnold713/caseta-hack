"""The Nanoleaf client against a couple of small fake controllers: pairing two of them, loading their state,
setting a level, a colour and white temperature, set_warmth's three promises, forgetting one, the
Kelvin<->mirek boundary, and that "on" is sent unconditionally (even against a cache-drifted light that
this module still believes is on) rather than gated on the module's own cached state. Run:
python test_nanoleaf.py  (needs aiohttp)"""
import asyncio
import json
import tempfile
from pathlib import Path

from aiohttp import web

from color import in_gamut, GAMUT_C
from nanoleaf import Nanoleaf, nid


def make_app(state, serial, name, model, ct_lo=1200, ct_hi=6500):
    """One fake Nanoleaf controller: /api/v1/new hands out a key once the "button" has been "held"
    (state["armed"]), and /api/v1/<token>/ + PUT .../state behave like a real panel's local API."""

    async def new(request):
        if not state["armed"]:
            return web.Response(status=401)
        state["pair_calls"] += 1
        return web.json_response({"auth_token": state["token"]})

    async def info(request):
        if request.match_info["token"] != state["token"]:
            return web.Response(status=401)
        return web.json_response({
            "name": name, "serialNo": serial, "model": model, "firmwareVersion": "1.0.0",
            "state": {
                "on": {"value": state["on"]},
                "brightness": {"value": state["bri"], "min": 0, "max": 100},
                "hue": {"value": state["hue"], "min": 0, "max": 360},
                "sat": {"value": state["sat"], "min": 0, "max": 100},
                "ct": {"value": state["ct"], "min": ct_lo, "max": ct_hi},
                "colorMode": state["mode"],
            },
            "effects": {"select": "*Solid*", "effectsList": ["Rainbow Flow"]},
        })

    async def put_state(request):
        if request.match_info["token"] != state["token"]:
            return web.Response(status=401)
        body = await request.json()
        state["puts"].append(body)
        if "on" in body:
            state["on"] = bool(body["on"]["value"])
        if "brightness" in body:
            state["bri"] = int(body["brightness"]["value"])
        if "ct" in body:
            state["ct"] = int(body["ct"]["value"])
            state["mode"] = "ct"
        if "hue" in body:
            state["hue"] = int(body["hue"]["value"])
            state["mode"] = "hs"
        if "sat" in body:
            state["sat"] = int(body["sat"]["value"])
            state["mode"] = "hs"
        return web.Response(status=204)

    app = web.Application()
    app.router.add_post("/api/v1/new", new)
    app.router.add_get("/api/v1/{token}/", info)
    app.router.add_put("/api/v1/{token}/state", put_state)
    return app


async def start(state, serial, name, model, **kw):
    runner = web.AppRunner(make_app(state, serial, name, model, **kw))
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]  # noqa: SLF001
    return runner, f"127.0.0.1:{port}"


async def main():
    a_state = {"armed": False, "pair_calls": 0, "token": "TOKA", "on": True, "bri": 60, "hue": 0, "sat": 0,
               "ct": 2700, "mode": "ct", "puts": []}
    b_state = {"armed": True, "pair_calls": 0, "token": "TOKB", "on": False, "bri": 0, "hue": 300, "sat": 80,
               "ct": 4000, "mode": "hs", "puts": []}
    runner_a, host_a = await start(a_state, "SN-AAA", "Living room panels", "NL29")
    runner_b, host_b = await start(b_state, "SN-BBB", "Bedroom panels", "NL42", ct_lo=1200, ct_hi=6500)

    changed = []
    loaded = []
    with tempfile.TemporaryDirectory() as tmp:
        nl = Nanoleaf(Path(tmp), on_state=changed.append, on_loaded=lambda: loaded.append(1))
        assert not nl.paired and nl.info()["count"] == 0

        # pairing device A: the button was not held yet, so the controller refuses until it is
        try:
            await nl.pair(host_a, seconds=3)
            raise AssertionError("expected a RuntimeError")
        except RuntimeError as exc:
            assert "did not hand out a key" in str(exc), exc
        a_state["armed"] = True
        info = await nl.pair(host_a, seconds=8)
        assert nl.paired and info["count"] == 1 and loaded, info
        assert json.loads((Path(tmp) / "nanoleaf.json").read_text())[0]["serial"] == "SN-AAA"
        d = nl.devices[nid("SN-AAA")]
        assert d["type"] == "NanoleafLight" and d["name"] == "Living room panels" and d["area"] is None, d
        assert d["current_state"] == 60 and d["color_mode"] == "ct" and d["zone"] == "SN-AAA", d
        # ct is Kelvin on the wire; the generic shape wants mirek, with the ends swapped (coolest = smallest mirek)
        assert d["ct"] == {"min": round(1_000_000 / 6500), "max": round(1_000_000 / 1200), "mirek": round(1_000_000 / 2700)}, d["ct"]
        # the panel always reports a hue/sat too (its last colour point), so color is not None even while
        # color_mode says the lamp is currently showing white; color_mode is what the app goes by
        assert d["color"] is not None and d["color_mode"] == "ct", d

        # pairing device B alongside it: a second, independent panel, with its own host and token
        info = await nl.pair(host_b, seconds=5)
        assert info["count"] == 2, info
        b = nl.devices[nid("SN-BBB")]
        assert b["current_state"] == 0 and b["color_mode"] == "xy" and b["color"] is not None, b
        # hue 300, sat 80 is a magenta-ish colour; xy lands inside the fallback gamut every Hue-shaped lamp uses
        assert in_gamut(tuple(b["color"]["xy"]), GAMUT_C), b["color"]

        # setting a level while already on: "on" still goes out first (unconditionally, every time a call
        # means to turn the light on, not just when the cache says it was off; see nanoleaf.py's note on
        # turning on), brightness follows as a second put, and no duration is ever sent (the unit is not
        # confirmed, see nanoleaf.py)
        n_puts_before = len(a_state["puts"])
        await nl.set_level(nid("SN-AAA"), 40)
        assert len(a_state["puts"]) == n_puts_before + 2, "on is resent even though the cache already said on"
        assert a_state["puts"][-2] == {"on": {"value": True}}, a_state["puts"][-2]
        assert a_state["puts"][-1] == {"brightness": {"value": 40}}, a_state["puts"][-1]
        assert "duration" not in json.dumps(a_state["puts"][-1])
        await nl.set_level(nid("SN-AAA"), 0)
        assert a_state["puts"][-1] == {"on": {"value": False}} and nl.devices[nid("SN-AAA")]["current_state"] == 0

        # turning on from off: "on" goes out on its own first, then the rest as a second put, never bundled
        # (see nanoleaf.py's note on turning on: a real controller has been seen to drop "on" when it is not alone)
        n_puts_before = len(a_state["puts"])
        await nl.set_color(nid("SN-AAA"), kelvin=4000)
        assert len(a_state["puts"]) == n_puts_before + 2, "off to on is two puts, not one"
        assert a_state["puts"][-2] == {"on": {"value": True}}, a_state["puts"][-2]
        assert a_state["puts"][-1] == {"ct": {"value": 4000}}, a_state["puts"][-1]

        # cache-drift scenario: the module's own cached belief says this light is already on (it was just
        # turned on above), but the real controller has since gone dark behind its back (someone flipped it
        # at the wall, or a previous optimistic write never actually took). The old _was_off-gated logic
        # would have looked at the stale cache, concluded "already on" and skipped the standalone "on" PUT,
        # leaving a brightness-only body sent to a genuinely off panel. Confirm "on" still goes out.
        assert nl.devices[nid("SN-AAA")]["current_state"] > 0, "cache believes the light is on"
        a_state["on"] = False   # the controller's own truth has drifted away from the cache
        n_puts_before = len(a_state["puts"])
        await nl.set_level(nid("SN-AAA"), 55)
        assert len(a_state["puts"]) == n_puts_before + 2, "on must be sent even though the cache said on"
        assert a_state["puts"][-2] == {"on": {"value": True}}, a_state["puts"][-2]
        assert a_state["puts"][-1] == {"brightness": {"value": 55}}, a_state["puts"][-1]
        assert a_state["on"] is True and a_state["bri"] == 55, "the fake controller actually turned on this time"

        # same drift, via set_color: the cache again believes the light is on, the controller has drifted off
        assert nl.devices[nid("SN-AAA")]["current_state"] > 0, "cache believes the light is on"
        a_state["on"] = False
        n_puts_before = len(a_state["puts"])
        await nl.set_color(nid("SN-AAA"), kelvin=3500)
        assert len(a_state["puts"]) == n_puts_before + 2, "on must be sent even though the cache said on"
        assert a_state["puts"][-2] == {"on": {"value": True}}, a_state["puts"][-2]
        assert a_state["on"] is True, "the fake controller actually turned on this time"
        await nl.set_color(nid("SN-AAA"), kelvin=500)     # below the range: the warmest it does
        assert a_state["puts"][-1]["ct"]["value"] == 1200, a_state["puts"][-1]
        await nl.set_color(nid("SN-AAA"), kelvin=20000, level=30)   # above it: the coolest, with a brightness
        # kelvin -> mirek -> kelvin is not perfectly lossless at this end of the range (6500 K round-trips to
        # 6494 K), the same rounding every kelvin/mirek boundary in this app accepts
        assert a_state["puts"][-1]["ct"]["value"] == 6494 and a_state["puts"][-1]["brightness"] == {"value": 30}, a_state["puts"][-1]
        assert nl.devices[nid("SN-AAA")]["color_mode"] == "ct" and nl.devices[nid("SN-AAA")]["current_state"] == 30

        # a colour: hex becomes hue/sat, and the disc-facing xy is derived the same way loading it back would be
        await nl.set_color(nid("SN-BBB"), hex="#2864ff")
        put = b_state["puts"][-1]
        assert "hue" in put and "sat" in put and "ct" not in put, put
        assert nl.devices[nid("SN-BBB")]["color_mode"] == "xy"
        # a colour with level 0 is just off; a colour the lamp cannot do is refused (neither fake panel lacks
        # colour or ct, so borrow set_warmth's "unknown id" guard instead)
        await nl.set_color(nid("SN-BBB"), hex="#ff0000", level=0)
        assert b_state["puts"][-1] == {"on": {"value": False}}, b_state["puts"][-1]
        try:
            await nl.set_color("nanoleaf_nope", kelvin=3000)
            raise AssertionError("expected an error")
        except RuntimeError:
            pass

        # set_warmth: never turns a lamp on, only touches one that already is, and reports what it did
        assert nl.devices[nid("SN-BBB")]["current_state"] == 0
        ok = await nl.set_warmth(nid("SN-BBB"), 3000)
        assert ok is False and b_state["puts"][-1] == {"on": {"value": False}}, "a lamp that is off was left alone"
        # set_level off to on is the same split as set_color's, checked above: "on" alone, then brightness alone
        n_puts_before = len(b_state["puts"])
        await nl.set_level(nid("SN-BBB"), 50)
        assert len(b_state["puts"]) == n_puts_before + 2
        assert b_state["puts"][-2] == {"on": {"value": True}} and b_state["puts"][-1] == {"brightness": {"value": 50}}
        ok = await nl.set_warmth(nid("SN-BBB"), 3000)
        assert ok is True and "on" not in b_state["puts"][-1], "set_warmth never sends on"
        assert b_state["puts"][-1]["ct"]["value"] == 3003 and nl.devices[nid("SN-BBB")]["color_mode"] == "ct"
        ok = await nl.set_warmth("nanoleaf_nope", 3000)
        assert ok is False, "an unknown id is refused quietly, not raised"

        # forgetting one leaves the other alone
        await nl.forget("SN-AAA")
        assert nid("SN-AAA") not in nl.devices and nl.info()["count"] == 1
        assert nid("SN-BBB") in nl.devices
        saved = json.loads((Path(tmp) / "nanoleaf.json").read_text())
        assert len(saved) == 1 and saved[0]["serial"] == "SN-BBB", saved

        await nl.forget("SN-BBB")
        assert not nl.paired and not nl.devices and nl.info()["count"] == 0

        # a fresh instance reads the saved pairing back
        (Path(tmp) / "nanoleaf.json").write_text(json.dumps([{"host": host_b, "token": "TOKB", "serial": "SN-BBB", "name": "x", "model": "y"}]))
        assert Nanoleaf(Path(tmp)).paired
        await nl.stop()

    await runner_a.cleanup()
    await runner_b.cleanup()
    print("nanoleaf: ok")


asyncio.run(main())
