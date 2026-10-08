"""The bridge link that looks fine and carries no presses.

Days of "bridge answering, 0 presses seen" came from the library's side of the link: its walk over the
buttons stops at the first one that fails and says nothing when that failure is a timeout, and a login that
fails partway on a fresh session leaves that session open and pinging with nothing subscribed on it. These
checks cover what agent.py does about it: subscribe each button on its own, remember which ones took on
which session, ask again for the rest, and start a fresh session when logging in on one failed, the
connection loop stopped, or the bridge stops answering. Run: python test_link.py
"""
import asyncio
import inspect
import os
import tempfile
import time

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="link-"))
os.environ.setdefault("HUB_URL", "wss://example.invalid/ws/agent")

import agent as A  # noqa: E402
from pylutron_caseta.smartbridge import Smartbridge  # noqa: E402

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


class Leap:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


class LibBridge:
    """Shaped like pylutron_caseta's Smartbridge where the link check looks: a session (_leap), the connection loop
    (_monitor_task), the login on the session (_login_task), and per-button subscribe and ping requests."""

    def __init__(self, buttons=("101", "102", "103")):
        self.devices = {"2": {"type": "Pico3ButtonRaiseLower", "zone": None}}
        self.buttons = {b: {"parent_device": "2", "button_number": i + 2} for i, b in enumerate(buttons)}
        self._leap = Leap()
        self._monitor_task = _Task(done=False)
        self._login_task = _Task(done=True)
        self.slow = set()          # buttons whose subscribe times out
        self.refuse = set()        # buttons whose subscribe is refused
        self.subs = []             # every button subscribe that reached the bridge
        self.ping_fails = 0        # how many of the next pings go unanswered
        self.connects = 0
        self._button_subscribers = {}
        self._subscribers = {}

    async def _subscribe(self, url, callback):
        button = url.split("/")[2]
        self.subs.append(button)
        if button in self.slow:
            raise asyncio.TimeoutError()
        if button in self.refuse:
            raise RuntimeError("400 BadRequest")
        return object(), "tag"

    def _handle_button_status(self, response):
        pass

    async def _request(self, kind, url, body=None):
        if self.ping_fails:
            self.ping_fails -= 1
            raise asyncio.TimeoutError()
        return object()

    def add_button_subscriber(self, button_id, cb):
        self._button_subscribers[button_id] = cb

    def add_subscriber(self, device_id, cb):
        self._subscribers[device_id] = cb

    async def connect(self):
        self.connects += 1
        self._monitor_task = _Task(done=False)


class _Task:
    def __init__(self, done, exc=None):
        self._done, self._exc = done, exc

    def done(self):
        return self._done

    def cancelled(self):
        return False

    def exception(self):
        return self._exc


def fresh_agent(bridge):
    a = A.Agent.__new__(A.Agent)
    a.bridge = bridge
    a.config = {"bindings": []}
    a._button_keys = {}
    a._last_press_at = None
    a._last_press = None
    a._press_count = 0
    a._started_at = time.time() - 60
    a._button_seen = {}
    a._resubscribing = False
    a._resub_next = 0.0
    a._subscribed = set()
    a._sub_session = None
    a._sub_retry_at = 0.0
    a._link_kick_at = -A.LINK_KICK_GAP_S
    a._link_ok_at = None
    a._probe_fails = 0
    a._reconnects = 0
    a._link_problem = None
    a._login_fails = 0
    a._lib_logging_in = False
    a._merge_deferred = []
    a.sent = []
    a.send = a.sent.append
    return a


async def main():
    # 0. the library's login still asks for the buttons by this name, so the connector's version is what runs
    check("the library's login calls _subscribe_to_button_status by name",
          "self._subscribe_to_button_status()" in inspect.getsource(Smartbridge._login), True)

    # 1. one slow button does not cost the rest: each is asked for on its own
    A.WATCH.sub_failed_at = None
    b = LibBridge()
    b.slow = {"101"}
    a = fresh_agent(b)
    await a._subscribe_buttons()
    check("every button was asked for", sorted(b.subs), ["101", "102", "103"])
    check("the ones that took are remembered", sorted(a._subscribed), ["102", "103"])
    check("the slow one is noticed", A.WATCH.sub_failed_at is not None, True)
    h = a.health()
    check("health says not every button is heard", h["buttons_ok"], False)
    check("and how many are", h["subscribed"], 2)

    # 2. the link check asks again for just the missing one, and health comes back well
    b.slow = set()
    b.subs.clear()
    await a._check_link()
    check("only the missing button is asked for again", b.subs, ["101"])
    check("all three are reported now", len(a._subscribed), 3)
    check("health is well again", a.health()["buttons_ok"], True)
    b.subs.clear()
    await a._check_link()
    check("a complete session is left alone", b.subs, [])
    check("the probe answered", a._link_ok_at is not None, True)

    # 3. a new session (the library reconnected) starts from nothing, and is subscribed in full
    b._leap = Leap()
    check("a new session counts as not subscribed", a._subs_complete(), False)
    await a._check_link()
    check("every button asked for on the new session", sorted(b.subs), ["101", "102", "103"])
    check("and the new session is complete", a._subs_complete(), True)

    # 4. a refused button is asked for again, but not every beat
    b = LibBridge()
    b.refuse = {"103"}
    a = fresh_agent(b)
    await a._check_link()
    first = len(b.subs)
    await a._check_link()
    check("a refusal is not re-asked on the very next beat", len(b.subs), first)
    a._sub_retry_at = 0.0
    b.refuse = set()
    await a._check_link()
    check("it is asked for once the wait is up", a._subs_complete(), True)

    # 5. logging in on a fresh session failed partway: that session is dropped so the library starts another
    b = LibBridge()
    a = fresh_agent(b)
    b._login_task = _Task(done=True, exc=asyncio.TimeoutError())
    old = b._leap
    await a._check_link()
    check("the failed session is closed", old.closed, True)
    check("and counted", a._reconnects, 1)
    check("and said", "logging back in" in (a._link_problem or ""), True)
    b._leap = Leap()
    await a._check_link()
    check("not again inside the gap", a._reconnects, 1)

    # 6. the connection loop stopped altogether: it is started again
    b = LibBridge()
    a = fresh_agent(b)
    b._monitor_task = _Task(done=True)
    await a._check_link()
    check("the connection loop is started again", b.connects, 1)

    # 7. two probes in a row unanswered: the session is dropped; one alone is not enough
    b = LibBridge()
    a = fresh_agent(b)
    await a._subscribe_buttons()
    b.ping_fails = 1
    leap = b._leap
    await a._check_link()
    check("one unanswered probe is not enough", leap.closed, False)
    b.ping_fails = 2
    await a._check_link()
    await a._check_link()
    check("two in a row drop the session", leap.closed, True)
    check("and the health carries the reason", "did not answer" in (a.health()["link_problem"] or ""), True)

    # 8. still logging in: nothing is asked for twice
    b = LibBridge()
    a = fresh_agent(b)
    b._login_task = _Task(done=False)
    await a._check_link()
    check("nothing is asked for while the library is logging in", b.subs, [])

    # 9. between sessions (the library is reconnecting): left to it
    b = LibBridge()
    a = fresh_agent(b)
    b._leap = None
    await a._check_link()
    check("between sessions nothing is done", (b.subs, a._reconnects), ([], 0))


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
