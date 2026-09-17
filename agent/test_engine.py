"""Quick checks for the gesture engine and the action runner's presets and colour:  python test_engine.py"""
import asyncio
from engine import ActionRunner, GestureEngine


class FakeBridge:
    """Just enough of a Smartbridge: a Caseta dimmer, a Hue colour lamp and a Hue white-ambiance lamp."""

    def __init__(self):
        self.devices = {
            "5": {"device_id": "5", "type": "WallDimmer", "zone": "2", "current_state": 40},
            "hue_a": {"device_id": "hue_a", "type": "HueLight", "zone": "a", "current_state": 0, "color": {"gamut": None, "xy": None}, "ct": {"min": 153, "max": 500, "mirek": None}},
            "hue_b": {"device_id": "hue_b", "type": "HueLight", "zone": "b", "current_state": 0, "color": None, "ct": {"min": 153, "max": 454, "mirek": 370}},
        }
        self.calls = []

    async def set_value(self, device_id, level, fade_time=None):
        self.calls.append(("value", device_id, level))

    async def set_fan(self, device_id, speed):
        self.calls.append(("fan", device_id, speed))


async def runner_cases():
    bridge = FakeBridge()
    cfg = {"settings": {"default_fade": 0.5}, "presets": [{"id": "p1", "name": "Evening", "fade": 2, "levels": {
        "5": 60, "hue_a": {"level": 45, "hex": "#ff3fa4"}, "hue_b": {"level": 80, "kelvin": 2700}}}]}
    r = ActionRunner(lambda: bridge, lambda: cfg)
    hue = []
    async def hue_set(device_id, level, fade_s):
        hue.append(("level", device_id, level, fade_s))
    async def hue_color(device_id, kelvin=None, hex=None, fade_s=None, level=None):  # noqa: A002
        hue.append(("color", device_id, kelvin, hex, fade_s, level))
    r.hue_set, r.hue_color = hue_set, hue_color
    bad = 0
    def check(name, ok, got):
        nonlocal bad
        bad += not ok
        print(("PASS" if ok else "FAIL"), name, got if not ok else "")
    # a preset: the dimmer takes a level, each Hue lamp gets its colour and level in one call
    await r.run_one({"type": "preset", "preset_id": "p1"})
    check("preset with object levels", bridge.calls == [("value", "5", 60)] and sorted(hue) == [
        ("color", "hue_a", None, "#ff3fa4", 2.0, 45), ("color", "hue_b", 2700, None, 2.0, 80)], (bridge.calls, hue))
    # a colour a lamp cannot do falls back to its level; level 0 in the object is just off
    cfg["presets"][0]["levels"] = {"hue_b": {"level": 50, "hex": "#ff0000"}, "hue_a": {"level": 0, "kelvin": 3000}}
    hue.clear()
    await r.run_one({"type": "preset", "preset_id": "p1"})
    check("preset: colour on a white lamp is just a level", sorted(hue) == [("color", "hue_a", 3000, None, 2.0, 0), ("level", "hue_b", 50, 2.0)], hue)
    # the color action reaches only the lamps that can do what it asks
    hue.clear()
    await r.run_one({"type": "color", "target": ["d:5", "d:hue_a", "d:hue_b"], "kelvin": 4000, "fade": 0})
    check("color kelvin", sorted(hue) == [("color", "hue_a", 4000, None, 0.0, None), ("color", "hue_b", 4000, None, 0.0, None)], hue)
    hue.clear()
    await r.run_one({"type": "color", "target": ["d:5", "d:hue_a", "d:hue_b"], "hex": "#2864ff", "level": 70})
    check("color hex (only the colour lamp)", hue == [("color", "hue_a", None, "#2864ff", 0.5, 70)], hue)
    try:
        await r.run_one({"type": "color", "target": "d:5", "hex": "#2864ff"}); check("color on a Caseta dimmer is refused", False, "no error")
    except RuntimeError as exc:
        check("color on a Caseta dimmer is refused", "colour" in str(exc), str(exc))
    # the power button: what was lit before the house went dark comes back at the same levels
    bridge.devices["6"] = {"device_id": "6", "type": "WallSwitch", "zone": "3", "current_state": 100}
    bridge.devices["5"]["current_state"] = 40
    bridge.calls.clear(); hue.clear()
    r.zone_changed("5", 40); r.zone_changed("6", 100)
    bridge.devices["6"]["current_state"] = 0; r.zone_changed("6", 0)     # one off, the house is still lit: nothing remembered yet
    check("memory waits for the last light", r.last_on == {}, r.last_on)
    bridge.devices["5"]["current_state"] = 0; r.zone_changed("5", 0)     # the house goes dark
    check("memory holds both lights at their levels", r.last_on == {"5": 40, "6": 100}, r.last_on)
    await r.run_one({"type": "restore", "target": "h:all", "fade": 0})
    check("restore brings them back", sorted(bridge.calls) == [("value", "5", 40), ("value", "6", 100)] and hue == [], (bridge.calls, hue))
    bridge.calls.clear(); r.last_on = {}
    await r.run_one({"type": "restore", "target": ["d:5", "d:6"], "fade": 0})
    check("restore with nothing remembered is plain on", sorted(bridge.calls) == [("value", "5", 100), ("value", "6", 100)], bridge.calls)
    await room_cases(check)    # check() counts into `bad` itself
    return bad


async def room_cases(check):
    """a:<room> against the rooms the app owns (settings.rooms), Lutron and Hue lamps in the same room."""
    bridge = FakeBridge()
    # a bridge with two Lutron areas and a Hue room, the way the connector sees them
    bridge.devices["5"]["area"] = "20"
    bridge.devices["hue_a"]["area"] = "hue_r1"
    bridge.devices["hue_b"]["area"] = "hue_r1"
    bridge.devices["6"] = {"device_id": "6", "type": "WallDimmer", "zone": "3", "current_state": 0, "area": "20"}
    bridge.devices["7"] = {"device_id": "7", "type": "WallSwitch", "zone": "4", "current_state": 0, "area": "21"}
    bridge.devices["9"] = {"device_id": "9", "type": "Pico3ButtonRaiseLower", "zone": None, "area": "20"}
    bridge.devices["8"] = {"device_id": "8", "type": "SerenaHoneycombShade", "zone": "5", "current_state": 0, "area": "20"}
    cfg = {"settings": {}, "groups": []}
    r = ActionRunner(lambda: bridge, lambda: cfg)
    # no list: the bridge's own areas, exactly as before
    check("a:<area> without an app list", sorted(r._resolve("a:20")) == ["5", "6"], r._resolve("a:20"))
    # seeded rooms keep the bridge's ids, so nothing a person already set up changes meaning
    cfg["settings"]["rooms"] = [
        {"id": "20", "name": "Kitchen", "device_ids": [], "bridge_area": "20", "hue_room": None},
        {"id": "21", "name": "Outside", "device_ids": [], "bridge_area": "21", "hue_room": None},
        {"id": "hue_r1", "name": "Office", "device_ids": [], "bridge_area": None, "hue_room": "hue_r1"},
    ]
    check("a seeded room resolves as the area did", sorted(r._resolve("a:20")) == ["5", "6"], r._resolve("a:20"))
    check("a room of Hue lamps resolves to them", sorted(r._resolve("a:hue_r1")) == ["hue_a", "hue_b"], r._resolve("a:hue_r1"))
    check("a room leaves out shades and remotes", "8" not in r._resolve("a:20") and "9" not in r._resolve("a:20"), r._resolve("a:20"))
    # a room the app made: no bridge area at all, just the devices filed in it, Lutron and Hue together
    cfg["settings"]["rooms"].append({"id": "r7x2", "name": "Studio", "device_ids": ["6", "hue_a"], "bridge_area": None, "hue_room": None})
    check("an app room holds what is filed in it", sorted(r._resolve("a:r7x2")) == ["6", "hue_a"], r._resolve("a:r7x2"))
    check("a moved light leaves its old room", sorted(r._resolve("a:20")) == ["5"], r._resolve("a:20"))
    check("a moved lamp leaves its old room", sorted(r._resolve("a:hue_r1")) == ["hue_b"], r._resolve("a:hue_r1"))
    # a device may be in one room only: the first room that names it wins
    # (the hub strips the duplicate on the way in, and the connector reads it the same way: the first room wins)
    cfg["settings"]["rooms"][1]["device_ids"] = ["6"]
    check("one room per device, the first wins", sorted(r._resolve("a:21")) == ["6", "7"] and r._resolve("a:r7x2") == ["hue_a"], (r._resolve("a:21"), r._resolve("a:r7x2")))
    cfg["settings"]["rooms"][1]["device_ids"] = []
    # a room that names a device the bridges no longer report simply has one thing less in it
    cfg["settings"]["rooms"][-1]["device_ids"] = ["6", "hue_a", "gone"]
    check("a device that is gone is skipped", sorted(r._resolve("a:r7x2")) == ["6", "hue_a"], r._resolve("a:r7x2"))
    # a room the app does not own falls back to the bridge area
    check("an unknown room falls back to the bridge", r._resolve("a:99") == [], r._resolve("a:99"))
    bridge.devices["10"] = {"device_id": "10", "type": "WallDimmer", "zone": "6", "current_state": 0, "area": "99"}
    check("a bridge area the app never took still works", r._resolve("a:99") == ["10"], r._resolve("a:99"))
    # a level on a room reaches both bridges
    hue2 = []
    async def hue_set(device_id, level, fade_s):
        hue2.append((device_id, level))
    r.hue_set = hue_set
    bridge.calls.clear()
    await r.run_one({"type": "level", "target": "a:r7x2", "level": 50, "fade": 0})
    check("a level on a mixed room drives both", bridge.calls == [("value", "6", 50)] and hue2 == [("hue_a", 50)], (bridge.calls, hue2))


async def scenario(has_double, script):
    out = []
    eng = GestureEngine(lambda k, g: out.append(g), lambda k: has_double, double_ms=200, hold_ms=300)
    for delay, ev in script:
        await asyncio.sleep(delay)
        (eng.press if ev == "P" else eng.release)("pico/0")
    await asyncio.sleep(0.6)
    return out


async def main():
    cases = [
        ("single, no double bound (instant)", False, [(0, "P"), (0.05, "R")], ["single"]),
        ("single, double bound (waits)", True, [(0, "P"), (0.05, "R")], ["single"]),
        ("double", True, [(0, "P"), (0.05, "R"), (0.1, "P"), (0.05, "R")], ["double"]),
        ("two slow clicks are two singles", True, [(0, "P"), (0.05, "R"), (0.3, "P"), (0.05, "R")], ["single", "single"]),
        ("hold", True, [(0, "P"), (0.5, "R")], ["hold_start", "hold_end", "hold"]),
        ("click then hold", True, [(0, "P"), (0.05, "R"), (0.1, "P"), (0.5, "R")], ["hold_start", "hold_end", "hold"]),
    ]
    bad = 0
    for name, hd, script, expect in cases:
        got = await scenario(hd, script)
        ok = got == expect
        bad += not ok
        print(("PASS" if ok else "FAIL"), name, got if not ok else "")
    bad += await runner_cases()
    raise SystemExit(bad)


asyncio.run(main())
