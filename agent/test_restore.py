"""Back the way it was: python test_restore.py

A button that puts the lights back exactly as they were when they went off, whichever scene was running
and whatever each lamp was showing. The memory used to hold levels alone and only wrote itself when the
whole house went dark, so a room turned off on its own remembered nothing and a lamp came back the right
brightness in the wrong colour.
"""
import asyncio
import os
import tempfile
import time
from pathlib import Path

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="restore-"))

from color import color_state  # noqa: E402
from engine import ActionRunner  # noqa: E402

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f'\n      wanted {want!r}'))
    if not ok:
        FAILS.append(name)


class FakeBridge:
    """A Caseta dimmer, a Hue lamp showing a colour and a Hue lamp on a white, in one room."""

    def __init__(self):
        self.devices = {
            "5": {"device_id": "5", "type": "WallDimmer", "zone": "2", "area": "20", "current_state": 0},
            "hue_a": {"device_id": "hue_a", "type": "HueLight", "zone": "a", "area": "20", "current_state": 0,
                      "color_mode": "xy", "color": {"gamut": None, "xy": [0.15, 0.06]},
                      "ct": {"min": 153, "max": 500, "mirek": None}},
            "hue_b": {"device_id": "hue_b", "type": "HueLight", "zone": "b", "area": "21", "current_state": 0,
                      "color_mode": "ct", "color": None, "ct": {"min": 153, "max": 500, "mirek": 250}},
            "nanoleaf_A": {"device_id": "nanoleaf_A", "type": "NanoleafLight", "zone": "AAAA", "area": "20",
                           "current_state": 0, "color_mode": "hs", "color": {"gamut": None, "xy": [0.4, 0.5]},
                           "ct": {"min": 153, "max": 833, "mirek": None}},
        }
        self.calls = []

    async def set_value(self, device_id, level, fade_time=None):
        self.calls.append(("value", device_id, int(level)))


def make():
    bridge = FakeBridge()
    cfg = {"settings": {"default_fade": 0, "rooms": []}, "presets": []}
    r = ActionRunner(lambda: bridge, lambda: cfg)
    sent = []
    async def hue_set(device_id, level, fade_s):
        sent.append(("level", device_id, level))
    async def hue_color(device_id, kelvin=None, hex=None, fade_s=None, level=None):  # noqa: A002
        sent.append(("color", device_id, kelvin, hex, level))
    r.hue_set, r.hue_color = hue_set, hue_color
    return bridge, r, sent


def light(bridge, r, did, level):
    bridge.devices[did]["current_state"] = level
    r.zone_changed(did, level)


async def main():
    # 0. A panel is a light. Its type is not one of the Lutron model names the house used to be counted
    #    from, so it was not in "everything", it was never remembered, and a restore skipped it.
    bridge, r, sent = make()
    check("a panel is part of the house", "nanoleaf_A" in r._resolve("h:all"), True)
    check("and part of its room", "nanoleaf_A" in r._resolve("a:20"), True)
    light(bridge, r, "nanoleaf_A", 65)
    was_n = color_state(bridge.devices["nanoleaf_A"])["hex"]
    light(bridge, r, "nanoleaf_A", 0)
    check("a panel remembers how it was", (r._last_lit.get("nanoleaf_A") or {}).get("level"), 65)
    await r.run_one({"type": "restore", "target": "a:20", "fade": 0})
    check("and comes back on its colour", sent, [("color", "nanoleaf_A", None, was_n, 65)])

    # 1. a room on a colour, turned off, then put back: the colour comes with the level
    bridge, r, sent = make()
    light(bridge, r, "5", 40)
    light(bridge, r, "hue_a", 70)          # showing a blue
    was = color_state(bridge.devices["hue_a"])["hex"]
    light(bridge, r, "5", 0); light(bridge, r, "hue_a", 0)
    await r.run_one({"type": "restore", "target": "a:20", "fade": 0})
    check("the dimmer comes back at its level", bridge.calls, [("value", "5", 40)])
    check("and the lamp comes back on the colour it was showing", sent, [("color", "hue_a", None, was, 70)])
    check("which is the blue it was on", was[1:3] < "80" and was[5:7] > "c0", True)

    # 2. a lamp on a white comes back on that white, not on a colour
    bridge, r, sent = make()
    light(bridge, r, "hue_b", 55)
    light(bridge, r, "hue_b", 0)
    await r.run_one({"type": "restore", "target": "d:hue_b", "fade": 0})
    check("a white is put back as a white", sent, [("color", "hue_b", 4000.0, None, 55)])

    # 3. one room turned off on its own remembers itself. This is the whole of what was missing: the
    #    memory only ever wrote itself when every light in the house was dark.
    bridge, r, sent = make()
    light(bridge, r, "5", 30)
    light(bridge, r, "hue_b", 80)          # a light in another room, still on
    light(bridge, r, "5", 0)
    await r.run_one({"type": "restore", "target": "a:20", "fade": 0})
    check("a room turned off alone still remembers", bridge.calls, [("value", "5", 30)])

    # 4. a light already on is left where it is: this puts back what is off, it does not restage a room
    bridge, r, sent = make()
    light(bridge, r, "5", 30); light(bridge, r, "hue_b", 80)
    light(bridge, r, "5", 0)
    bridge.calls.clear(); sent.clear()
    await r.run_one({"type": "restore", "target": "h:all", "fade": 0})
    check("only the lights that are off come back", (bridge.calls, sent), ([("value", "5", 30)], []))

    # 5. the sweep: what went dark together comes back together
    bridge, r, sent = make()
    light(bridge, r, "5", 30); light(bridge, r, "hue_b", 80)
    light(bridge, r, "5", 0); light(bridge, r, "hue_b", 0)
    r._last_lit["hue_b"]["off_at"] -= 4000        # turned off long before tonight
    await r.run_one({"type": "restore", "target": "h:all", "fade": 0})
    check("a light nobody has wanted since Tuesday stays off", (bridge.calls, sent), ([("value", "5", 30)], []))

    # 6. nothing remembered at all: everything comes on the ordinary way, which is what it did before
    bridge, r, sent = make()
    await r.run_one({"type": "restore", "target": "d:5", "fade": 0})
    check("with nothing to go back to it is a plain on", bridge.calls, [("value", "5", 100)])

    # 7. it survives a restart
    bridge, r, sent = make()
    f = Path(os.environ["DATA_DIR"]) / "last_on.json"
    r.memory_file = f
    light(bridge, r, "hue_a", 70)
    light(bridge, r, "hue_a", 0)
    bridge2, r2, sent2 = make()
    r2.memory_file = f
    r2.load_memory()
    await r2.run_one({"type": "restore", "target": "d:hue_a", "fade": 0})
    check("a connector that restarted still knows", sent2, [("color", "hue_a", None, was, 70)])

    # 8. the file the old connector wrote is levels alone, and still reads
    bridge3, r3, sent3 = make()
    f.write_text('{"5": 45}')
    r3.memory_file = f
    r3.load_memory()
    await r3.run_one({"type": "restore", "target": "d:5", "fade": 0})
    check("a memory written before colours still works", bridge3.calls, [("value", "5", 45)])


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
