"""Calls and texts on the lights (alerts.py), against a pretend Hue bridge and a pretend screen sync. It checks:
  * a text flashes its lights in its colour, on and off, then puts each back as it was: a lamp that was on in a white
    at its own brightness, a lamp that was off back to its own colour and then off again;
  * "only lights that are on" leaves an off lamp alone;
  * a call keeps going until it is stopped, and a text during it does not take the call's colours for the lamp's own;
  * a person's command takes a lamp out of the alert, and it is not put back afterwards;
  * a lamp following the PC's screen is streamed to (the overlay) and sent no commands; the overlay goes with the end;
  * the patterns themselves: flash is on then off, alternate takes both colours, breathe never quite goes out.
Run: python test_alerts.py
"""
import asyncio
import sys

import alerts as A
from color import hex_to_xy, GAMUT_C

FAILS = []


def check(name, ok, got=None):
    print(f"{'ok  ' if ok else 'FAIL'} {name}" + ('' if ok else f': {got!r}'))
    if not ok:
        FAILS.append(name)


class FakeHue:
    def __init__(self):
        self.devices = {
            "hue_A": {"name": "Bar", "type": "HueLight", "_on": True, "_bri": 40.0, "current_state": 40, "color_mode": "ct",
                      "ct": {"min": 153, "max": 500, "mirek": 300}, "color": {"gamut": None, "xy": [0.4, 0.4]}},
            "hue_B": {"name": "Signe", "type": "HueLight", "_on": False, "_bri": 70.0, "current_state": 0, "color_mode": "xy",
                      "ct": {"min": 153, "max": 500, "mirek": 250}, "color": {"gamut": None, "xy": [0.2, 0.3]}},
        }
        self.sent = []   # (device, body)

    async def _put_light(self, d, body):
        self.sent.append((d, body))
        await asyncio.sleep(0)


class FakeSync:
    def __init__(self, streaming=()):
        self.streaming = set(streaming)
        self.overlay = {}

    def owns(self, d):
        return d in self.streaming


def bodies(hue, d):
    return [b for x, b in hue.sent if x == d]


async def main():
    red = "#ff0000"
    rx, ry = hex_to_xy(red, GAMUT_C)

    # ----- a text: flash, then back as it was -----
    hue = FakeHue()
    al = A.Alerts(hue, FakeSync())
    got = await al.start({"id": "t1", "lights": ["hue_A", "hue_B", "hue_nope"], "pattern": "flash", "colors": [red], "seconds": 1.0})
    check("a text takes the lights that exist", got == {"lights": 2, "streamed": 0}, got)
    check("and owns them while it plays", al.owns("hue_A") and al.owns("hue_B"))
    await asyncio.sleep(1.4)
    a = bodies(hue, "hue_A")
    ons = [b for b in a if (b.get("on") or {}).get("on") and "color" in b and abs(b["color"]["xy"]["x"] - rx) < 1e-6]
    offs = [b for b in a if (b.get("on") or {}).get("on") is False]
    check("it flashes in its colour, on and off", len(ons) >= 2 and len(offs) >= 1, a)
    check("at full brightness, at once", all(b["dimming"]["brightness"] == 100 and b["dynamics"]["duration"] == 0 for b in ons), ons)
    last = a[-1]
    check("a lamp that was on goes back to its white and brightness", last.get("color_temperature") == {"mirek": 300} and last["dimming"]["brightness"] == 40 and last["on"]["on"] is True and "color" not in last, last)
    b = bodies(hue, "hue_B")
    check("a lamp that was off gets its own colour back, then goes off", b[-2].get("color") == {"xy": {"x": 0.2, "y": 0.3}} and b[-2]["dimming"]["brightness"] == 70 and b[-1] == {"on": {"on": False}, "dynamics": {"duration": 0}}, b[-2:])
    check("and nothing is held afterwards", not al.owns("hue_A") and not al.owns("hue_B") and al.status() == {"playing": [], "lights": []}, al.status())

    # ----- only lights that are on -----
    hue = FakeHue()
    al = A.Alerts(hue, FakeSync())
    got = await al.start({"id": "t2", "lights": ["hue_A", "hue_B"], "pattern": "glow", "colors": [red], "seconds": 0.5, "only_on": True})
    await asyncio.sleep(0.8)
    check("only lights that are on: the off lamp is left alone", got["lights"] == 1 and not bodies(hue, "hue_B"), (got, bodies(hue, "hue_B")))

    # ----- a call, a text during it, a person's command -----
    hue = FakeHue()
    al = A.Alerts(hue, FakeSync())
    await al.start({"id": "call:1", "lights": ["hue_A", "hue_B"], "pattern": "alternate", "colors": ["#00ff00", "#0000ff"], "seconds": 60})
    await asyncio.sleep(0.3)
    # the lamps now look like the call's colours, as the bridge's event stream would say
    hue.devices["hue_A"].update({"_on": True, "_bri": 100.0, "color_mode": "xy"})
    hue.devices["hue_A"]["color"]["xy"] = [0.17, 0.7]
    await al.start({"id": "text:1", "lights": ["hue_A"], "pattern": "flash", "colors": [red], "seconds": 0.6})
    await asyncio.sleep(1.4)
    check("a call is still going after the text", al.owns("hue_B") and al.status()["playing"] == ["call:1"], al.status())
    check("the text gave its lamp back to the call, not to the call's colours", al.owns("hue_A"), al.status())
    al.yield_for("hue_B")
    n_b = len(bodies(hue, "hue_B"))
    stopped = await al.stop("call:1")
    await asyncio.sleep(0.1)
    check("stop ends a call", stopped == {"stopped": True} and al.status()["playing"] == [], al.status())
    a = bodies(hue, "hue_A")
    check("the lamp goes back to how it was before the call", a[-1].get("color_temperature") == {"mirek": 300} and a[-1]["dimming"]["brightness"] == 40, a[-1])
    check("a lamp changed by hand is left as the person left it", len(bodies(hue, "hue_B")) == n_b, bodies(hue, "hue_B")[n_b:])
    check("stopping one that is not playing says so", (await al.stop("call:9")) == {"stopped": False})

    # ----- a lamp following the screen -----
    hue = FakeHue()
    sync = FakeSync(streaming=["hue_A"])
    al = A.Alerts(hue, sync)
    got = await al.start({"id": "t3", "lights": ["hue_A", "hue_B"], "pattern": "flash", "colors": [red], "seconds": 0.6, "only_on": True})
    await asyncio.sleep(0.1)
    f = sync.overlay.get("hue_A")
    check("a lamp following the screen is streamed to", got == {"lights": 1, "streamed": 1} and callable(f), got)
    if f:
        import time
        o = f(time.monotonic())
        check("its stream colour is the pattern's", isinstance(o, tuple) and len(o) == 3, o)
    await asyncio.sleep(0.8)
    check("and sent no commands, and the stream gets the screen back", not bodies(hue, "hue_A") and "hue_A" not in sync.overlay, (bodies(hue, "hue_A"), sync.overlay))

    # ----- the patterns -----
    check("flash: on, then off", A.at("flash", [red], 0.1) == (red, 1.0) and A.at("flash", [red], 0.5) == (red, 0.0))
    check("alternate: both colours", A.at("alternate", [red, "#0000ff"], 0.1)[0] == red and A.at("alternate", [red, "#0000ff"], 0.7)[0] == "#0000ff")
    lows = [A.at("breathe", [red], t / 20)[1] for t in range(40)]
    check("breathe swells and falls but never goes out", min(lows) >= A.LOW - 1e-9 and max(lows) > 0.99, (min(lows), max(lows)))
    check("glow holds", A.steps("glow", [red])[0][1] == 1.0)
    check("one colour for alternate is used twice", A.at("alternate", [red], 0.7)[0] == red)

    # ----- the stream itself takes the overlay in place of the screen, at full brightness whatever the gain -----
    import screensync as S
    ss = S.ScreenSync(None, room_lights=lambda r: [], config=lambda: {}, send=lambda m: None)
    ss._chan_light, ss._gains = {3: "hue_A"}, {"hue_A": 0.5}
    check("the screen's colour, at its brightness", ss._sent(("h", 3), (0.0, 0.0, 1.0)) == (0.0, 0.0, S._enc(0.5)))
    ss.overlay["hue_A"] = lambda now: (1.0, 0.0, 0.0)
    o = ss._sent(("h", 3), (0.0, 0.0, 1.0))
    check("an alert's colour in its place", abs(o[0] - 1) < 1e-9 and o[1] == 0 and o[2] == 0, o)


asyncio.run(main())
print("ALL OK" if not FAILS else f"{len(FAILS)} FAILED")
sys.exit(1 if FAILS else 0)
