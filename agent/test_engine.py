"""Quick checks for the gesture engine:  python test_engine.py"""
import asyncio
from engine import GestureEngine


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
    raise SystemExit(bad)


asyncio.run(main())
