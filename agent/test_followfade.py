"""How fast the white arrives, and why it is not one answer: python test_followfade.py

Following the day sends the same thing down three paths that want very different speeds. Drifting with
the sun is a change nobody asked for and should go unnoticed, so it is slow. A lamp left on a colour and
then switched on is showing the wrong thing until the white lands, and there the white is the point of
the press. They used to share one number, thirty seconds, and a purple lamp switched on crawled to white
for half a minute.
"""
import asyncio
import os
import tempfile
import time

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="followfade-"))

import daylight  # noqa: E402
from daylight import Day  # noqa: E402
import agent as A  # noqa: E402

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


class FakeBridge:
    def __init__(self):
        self.devices = {"nanoleaf_A": {"device_id": "nanoleaf_A", "type": "Nanoleaf", "zone": "a",
                                       "current_state": 70, "color_mode": "hs",
                                       "ct": {"min": 153, "max": 833, "mirek": None}}}


def fresh_agent():
    """An Agent with only the parts following the day touches."""
    a = A.Agent.__new__(A.Agent)
    a.bridge = FakeBridge()
    a.config = {"settings": {"follow_brightness": False}, "presets": [], "bindings": []}
    a._follow_paused, a._follow_scene, a._follow_cfg = set(), {"nanoleaf_A"}, {"nanoleaf_A"}
    a._follow_sent, a._follow_lit = {}, {}
    a.send = lambda msg: None
    a._send_follow = lambda: None
    a.local_time = lambda: A.datetime(2026, 6, 21, 14, 0)
    a._day_of = lambda: (lambda d: Day(sunrise=A.datetime(d.year, d.month, d.day, 5, 30),
                                       noon=A.datetime(d.year, d.month, d.day, 13, 15),
                                       sunset=A.datetime(d.year, d.month, d.day, 21, 0)))
    a._follow_settings = lambda: {"brightness": False}
    a.following = lambda: {"nanoleaf_A"}
    class Runner:
        curve_level = staticmethod(lambda: None)
        _level_of = staticmethod(lambda did: 70)
    a.runner = Runner()
    a.fades = []
    async def warmth(did, kelvin, fade_s=None, level=None):
        a.fades.append(round(float(fade_s), 3))
        a.bridge.devices[did]["color_mode"] = "ct"
        return True
    a._warmth_set = warmth
    return a


async def main():
    # 1. the three speeds are three numbers, and the slow one is only for the drift
    check("drifting with the sun stays slow", daylight.FADE_SECONDS, 30.0)
    check("a lamp just switched on is quick", daylight.ON_FADE_SECONDS, 0.4)
    check("a scene matches what a scene fades over", daylight.SCENE_FADE_SECONDS, 1.0)
    check("switching on is not the drift", daylight.ON_FADE_SECONDS < 1.0, True)

    # 2. the five minute look keeps the slow one
    a = fresh_agent()
    await a._follow_apply()
    check("the five minute look drifts", a.fades, [30.0])

    # 3. off to on: the white arrives with the light, not half a minute later. This is the one the
    #    owner hit, on a lamp sitting on a colour.
    a = fresh_agent()
    a._follow_lit["nanoleaf_A"] = False
    a._follow_zone("nanoleaf_A", 70)
    for _ in range(20):                      # _follow_zone hands the work to a task
        await asyncio.sleep(0)
        if a.fades:
            break
    check("a lamp switched on gets the white at once", a.fades, [0.4])

    # 4. a scene that says "follow the day" lands with the scene
    a = fresh_agent()
    await a._follow_start("nanoleaf_A")
    check("a scene brings it with the scene", a.fades, [1.0])

    # 5. going off, then on again, is on again: the path has to fire on the change, not on every report
    a = fresh_agent()
    a._follow_lit["nanoleaf_A"] = True
    a._follow_zone("nanoleaf_A", 70)         # still on, nothing changed
    await asyncio.sleep(0)
    check("a lamp that was already on is left alone", a.fades, [])
    a._follow_zone("nanoleaf_A", 0)          # off
    a._follow_zone("nanoleaf_A", 70)         # and on again
    for _ in range(20):
        await asyncio.sleep(0)
        if a.fades:
            break
    check("off and on again asks again, quickly", a.fades, [0.4])


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
