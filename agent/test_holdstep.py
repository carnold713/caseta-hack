"""A hold that follows the press: python test_holdstep.py

An arrow whose press nudges the brightness should ramp while it is held, without anybody setting that
up twice. And a hold has to actually do something on a Hue or a Nanoleaf lamp: raise and lower are
Lutron commands and those lamps used to be dropped from them, so a hold-to-dim did nothing at all on a
house whose lamps are not Lutron's.
"""
import asyncio
import os
import tempfile

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="holdstep-"))
os.environ.setdefault("HUB_URL", "wss://example.invalid/ws/agent")

import agent as A  # noqa: E402
import engine as E  # noqa: E402

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f'\n      wanted {want!r}'))
    if not ok:
        FAILS.append(name)


class FakeBridge:
    def __init__(self):
        self.devices = {
            "5": {"device_id": "5", "type": "WallDimmer", "zone": "2", "area": "20", "current_state": 50},
            "8": {"device_id": "8", "type": "CasetaFanSpeedController", "zone": "5", "area": "20", "current_state": 50},
            "hue_a": {"device_id": "hue_a", "type": "HueLight", "zone": "a", "area": "21", "current_state": 50,
                      "color": None, "ct": None},
        }
        self.calls = []

    async def raise_cover(self, d): self.calls.append(("raise", d))
    async def lower_cover(self, d): self.calls.append(("lower", d))
    async def stop_cover(self, d): self.calls.append(("stop", d))
    async def set_value(self, d, level, fade_time=None): self.calls.append(("value", d, int(level)))
    async def set_fan(self, d, speed): self.calls.append(("fan", d, speed))


def agent_with(bindings):
    a = A.Agent.__new__(A.Agent)
    a.bridge = FakeBridge()
    a.config = {"settings": {"default_fade": 0}, "bindings": bindings, "presets": []}
    a.send = lambda msg: None
    a.runner = E.ActionRunner(lambda: a.bridge, lambda: a.config)
    a.ran = []
    async def run_bound(acts, key, g):
        a.ran.append((g, acts))
    a._run_bound = run_bound
    a._index_bindings()
    return a


def binding(gesture, actions, n=3):
    return {"id": f"b{gesture}{n}", "device_id": "9", "button_number": n, "gesture": gesture, "actions": actions, "night": None}


async def held(a, n=3):
    a._on_gesture(f"9/{n}", "hold_start")
    a._on_gesture(f"9/{n}", "hold_end")
    for _ in range(6):
        await asyncio.sleep(0)
    return a.ran


async def main():
    UP = [{"type": "step", "target": "a:20", "delta": 10}]
    DOWN = [{"type": "step", "target": "a:20", "delta": -10}]

    # 1. the up arrow: a press nudges up, so holding it ramps up and letting go stops
    a = agent_with([binding("single", UP)])
    check("holding the up arrow ramps up", await held(a), [
        ("hold_start", [{"type": "raise", "target": "a:20"}]),
        ("hold_end", [{"type": "stop", "target": "a:20"}])])

    # 2. the down arrow, and it stops at a glow rather than at off
    a = agent_with([binding("single", DOWN)])
    check("holding the down arrow ramps down", await held(a), [
        ("hold_start", [{"type": "lower", "target": "a:20", "floor": 1}]),
        ("hold_end", [{"type": "stop", "target": "a:20"}])])

    # 3. anything set by hand wins, whichever half of the hold it is on
    for g in ("hold", "hold_start", "hold_end"):
        a = agent_with([binding("single", UP), binding(g, [{"type": "level", "target": "a:20", "level": 100}])])
        fell_back = [x for x in await held(a) if x[1] and x[1][0]["type"] in ("raise", "lower")]
        check(f"a hold set by hand wins ({g})", fell_back, [])

    # 4. a press that is not a step gets nothing: this is for arrows, not for every button
    a = agent_with([binding("single", [{"type": "level", "target": "a:20", "level": "toggle"}])])
    check("a press that is not a nudge gets no hold", await held(a), [])
    a = agent_with([binding("single", UP + [{"type": "level", "target": "a:20", "level": 50}])])
    check("a press that does two things gets no hold", await held(a), [])
    a = agent_with([])
    check("a button with nothing on it gets no hold", await held(a), [])

    # 5. a fan's arrows step a speed, and a speed does not ramp
    a = agent_with([binding("single", [{"type": "step", "target": "d:8", "delta": 1}])])
    check("a fan's arrow gets no hold", await held(a), [])

    # 6. the night version counts: if the press is a nudge after dark, so is the hold
    b = binding("single", [{"type": "level", "target": "a:20", "level": 100}])
    b["night"] = {"actions": UP}
    a = agent_with([b])
    a.local_time = lambda: A.datetime(2026, 6, 21, 23, 30)
    a.config["settings"].update({"night_start": "22:00", "night_end": "06:30"})
    check("a nudge only after dark holds only after dark", [g for g, _ in await held(a)], ["hold_start", "hold_end"])

    # 7. the ramp on a lamp the bridge cannot ramp: Hue and Nanoleaf used to be dropped outright
    E.RAMP_MS = 10
    bridge = FakeBridge()
    r = E.ActionRunner(lambda: bridge, lambda: {"settings": {"default_fade": 0}, "presets": []})
    sent = []
    async def hue_set(device_id, level, fade_s):
        sent.append(int(level)); bridge.devices[device_id]["current_state"] = int(level)
    r.hue_set = hue_set
    await r.run_one({"type": "lower", "target": "d:hue_a", "floor": 1})
    await asyncio.sleep(0.09)
    await r.run_one({"type": "stop", "target": "d:hue_a"})
    check("a Hue lamp dims while the button is held", len(sent) >= 3 and sent == sorted(sent, reverse=True), True)
    check("and never past the glow it stops at", min(sent) >= 1, True)
    n = len(sent)
    await asyncio.sleep(0.05)
    check("letting go stops it", len(sent), n)


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
