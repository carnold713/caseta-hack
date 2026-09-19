"""The bridge that answers about everything except buttons.

pylutron-caseta subscribes to the buttons one at a time and gives up on the whole list at the first
refusal: it logs an error, returns, and lets login report success. Every remote in the house is dead
from then on and nothing above the library is told. These checks cover what agent.py does about it:
notice the refusal, ask again, say so in health, and drop the duplicate press that asking again can
cause. Run: python test_buttons.py
"""
import asyncio
import logging
import os
import tempfile
import time

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="buttons-"))
os.environ.setdefault("HUB_URL", "wss://example.invalid/ws/agent")

import agent as A  # noqa: E402

FAILS = []
LIB = logging.getLogger("pylutron_caseta.smartbridge")


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


class FakeBridge:
    """Answers about buttons the way the library would: by logging and returning, never by raising."""

    def __init__(self, refusals):
        self.refusals = refusals   # how many of the first asks get refused
        self.asks = 0
        self.devices = {"2": {"type": "Pico3ButtonRaiseLower", "zone": None}}
        self.buttons = {"101": {"parent_device": "2", "button_number": 2}}

    async def _subscribe_to_button_status(self):
        self.asks += 1
        if self.asks <= self.refusals:
            LIB.error("Failed device status subscription: %s", "<Response ... 400>")


def fresh_agent(bridge):
    a = A.Agent.__new__(A.Agent)          # no Hue, no Nanoleaf, no config cache
    a.bridge = bridge
    a.config = {"bindings": []}
    a._button_keys = {"101": "2/2"}
    a._last_press_at = None
    a._last_press = None
    a._press_count = 0
    a._started_at = time.time() - 90
    a._button_seen = {}
    a._resubscribing = False
    a._resub_next = 0.0
    a.send = lambda msg: None
    a.gestures = _Gestures()
    return a


class _Gestures:
    """Only enough of GestureEngine for _on_button to run: the press counting is what is under test."""

    def __init__(self):
        self.seen = []

    def press(self, key):
        self.seen.append(key)

    def release(self, key):
        pass


def reset_watch():
    A.WATCH.sub_failed_at = None
    A.WATCH.notes.clear()


async def main():
    A.RESUB_WAITS = (0, 0, 0)

    # 1. the library's own error is what tells us, and it lands in health as plain English
    reset_watch()
    check("quiet bridge starts healthy", A.WATCH.sub_failed_at, None)
    LIB.error("Failed device status subscription: %s", "<Response ... 400>")
    check("a refusal is noticed", A.WATCH.sub_failed_at is not None, True)
    check("and kept to read back", A.WATCH.notes[-1]["text"].startswith("Failed device status"), True)

    # 2. nothing to do when nothing was refused
    reset_watch()
    b = FakeBridge(refusals=0)
    a = fresh_agent(b)
    await a._ensure_buttons_subscribed()
    check("a bridge that never refused is left alone", b.asks, 0)

    # 3. a bridge that refuses once and then answers: asked again, and reported well
    reset_watch()
    b = FakeBridge(refusals=1)
    a = fresh_agent(b)
    LIB.error("Failed device status subscription: %s", "<Response ... 400>")
    await a._ensure_buttons_subscribed()
    check("asked again until it answered", b.asks, 2)
    check("reported as working", a.health()["buttons_ok"], True)

    # 4. a bridge that keeps refusing: three asks, then said out loud, then left alone for a while
    reset_watch()
    b = FakeBridge(refusals=99)
    a = fresh_agent(b)
    LIB.error("Failed device status subscription: %s", "<Response ... 400>")
    await a._ensure_buttons_subscribed()
    check("asked three times", b.asks, 3)
    check("reported as not working", a.health()["buttons_ok"], False)
    await a._ensure_buttons_subscribed()
    check("not asked again straight away", b.asks, 3)
    a._resub_next = 0.0
    await a._ensure_buttons_subscribed()
    check("asked again once the wait is up", b.asks, 6)

    # 5. asking again can leave a button subscribed twice, and the bridge then reports its press twice
    reset_watch()
    a = fresh_agent(FakeBridge(refusals=0))
    a._on_button("101", "Press")
    a._on_button("101", "Press")
    check("the same press twice counts once", a._press_count, 1)
    check("and only reaches the gestures once", len(a.gestures.seen), 1)
    a._button_seen["101/Press"] = time.time() - 1
    a._on_button("101", "Press")
    check("a second real press still counts", a._press_count, 2)

    # 6. what health says beyond the press itself
    h = a.health()
    check("uptime is reported", h["uptime_s"] >= 90, True)
    check("the library version is reported", "lib" in h, True)
    check("the bridge's own words are carried", isinstance(h["notes"], list), True)


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
