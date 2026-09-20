"""Stepping through scenes, forwards and backwards: python test_cycle.py

One button goes forwards through a list of scenes and another goes back through the same list, so the
two have to agree on where the loop is. Closeness to the current lights cannot promise that on its own:
two scenes a few per cent apart both match, so a press forwards and a press back can land somewhere
else entirely. These checks are about that agreement as much as about the walk.
"""
import asyncio

from engine import ActionRunner

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


class FakeBridge:
    """Three dimmers that answer with whatever was last set on them, the way a bridge does."""

    def __init__(self):
        self.devices = {d: {"device_id": d, "type": "WallDimmer", "zone": d, "current_state": 0} for d in ("1", "2", "3")}

    async def set_value(self, device_id, level, fade_time=None):
        self.devices[device_id]["current_state"] = int(level)


def scene(pid, a, b, c):
    return {"id": pid, "name": pid, "fade": 0, "levels": {"1": a, "2": b, "3": c}}


async def main():
    bridge = FakeBridge()
    cfg = {"settings": {}, "presets": [
        scene("bright", 100, 100, 100),
        scene("relax", 60, 40, 30),
        scene("dinner", 55, 38, 28),     # deliberately within a few per cent of relax
        scene("night", 5, 0, 0),
    ]}
    r = ActionRunner(lambda: bridge, lambda: cfg)
    IDS = ["bright", "relax", "dinner", "night"]
    fwd = {"type": "cycle_presets", "preset_ids": IDS}
    back = {"type": "cycle_presets", "preset_ids": IDS, "dir": -1}
    lit = lambda: tuple(bridge.devices[d]["current_state"] for d in ("1", "2", "3"))
    at = lambda: r._cycle_at["|".join(IDS)]

    # 1. from lights that are nothing like any of them, forwards starts at the first and back at the last
    await r.run_one(fwd)
    check("from nowhere, forwards runs the first", at(), "bright")
    r._cycle_at.clear()
    for d in bridge.devices.values():
        d["current_state"] = 72          # matches none of the four
    await r.run_one(back)
    check("from nowhere, backwards runs the last", at(), "night")

    # 2. the walk itself, all the way round in both directions
    r._cycle_at.clear()
    for d in bridge.devices.values():
        d["current_state"] = 72
    walked = []
    for _ in range(5):
        await r.run_one(fwd)
        walked.append(at())
    check("forwards walks the list and wraps", walked, ["bright", "relax", "dinner", "night", "bright"])
    walked = []
    for _ in range(5):
        await r.run_one(back)
        walked.append(at())
    check("backwards walks it the other way and wraps", walked, ["night", "dinner", "relax", "bright", "night"])

    # 3. the point of the pair: forwards then back lands where it started, even between two scenes that
    #    are close enough that closeness alone would confuse them
    r._cycle_at.clear()
    await r.run_one({"type": "preset", "preset_id": "relax"})
    r._cycle_at["|".join(IDS)] = "relax"
    await r.run_one(fwd)
    check("forwards from relax reaches dinner", at(), "dinner")
    await r.run_one(back)
    check("and back from dinner returns to relax", at(), "relax")
    check("the lights are the ones relax asks for", lit(), (60, 40, 30))

    # 4. something else moved the lights, so the loop stops trusting what it last ran
    r._cycle_at["|".join(IDS)] = "night"
    for d in bridge.devices.values():
        d["current_state"] = 100         # somebody ran bright from the app
    await r.run_one(fwd)
    check("a loop whose scene no longer fits the lights re-reads them", at(), "relax")

    # 5. a scene deleted out from under the loop is stepped over, not crashed on
    r._cycle_at.clear()
    cfg["presets"] = [p for p in cfg["presets"] if p["id"] != "dinner"]
    for d in bridge.devices.values():
        d["current_state"] = 72
    walked = []
    for _ in range(4):
        await r.run_one(fwd)
        walked.append(r._cycle_at["|".join(["bright", "relax", "night"])])
    check("a deleted scene drops out of the loop", walked, ["bright", "relax", "night", "bright"])
    cfg["presets"] = []
    try:
        await r.run_one(fwd)
        check("every scene gone says so", "no error", "an error")
    except RuntimeError as exc:
        check("every scene gone says so", str(exc), "none of those scenes exist any more")


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
