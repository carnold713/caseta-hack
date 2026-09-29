"""systemd's watchdog, from the connector's side.

caseta-agent.service is Type=notify with WatchdogSec=60, so the connector has to say READY=1 and then WATCHDOG=1
at least once a minute, from its event loop, or systemd restarts it. These checks cover the helper that says it
(a real datagram to a real socket, the way systemd listens), the interval read from WATCHDOG_USEC, that nothing
happens without systemd, that a blocked loop really does stop the pings, and when a logged out bridge is allowed
to stop them on purpose. Run: python test_watchdog.py
"""
import asyncio
import os
import socket
import tempfile
import time

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="watchdog-"))
os.environ.setdefault("HUB_URL", "wss://example.invalid/ws/agent")
for k in ("NOTIFY_SOCKET", "WATCHDOG_USEC", "WATCHDOG_PID"):
    os.environ.pop(k, None)

import agent as A  # noqa: E402

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


def listener(path):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    s.bind(path)
    s.settimeout(0)
    return s


def heard(s):
    out = []
    while True:
        try:
            out.append(s.recv(4096).decode())
        except (BlockingIOError, socket.timeout):
            return out


class Bridge:
    def __init__(self, logged_in):
        self.logged_in = logged_in
        self.devices, self.buttons = {}, {}


async def main():
    tmp = tempfile.mkdtemp(prefix="notify-")

    # 1. without systemd nothing is sent, and nothing raises
    check("no NOTIFY_SOCKET: nothing sent", A.sd_notify("READY=1"), False)
    check("no WATCHDOG_USEC: no interval", A.watchdog_every(), None)

    # 2. a real datagram on a real socket, the way systemd listens
    path = os.path.join(tmp, "notify")
    s = listener(path)
    os.environ["NOTIFY_SOCKET"] = path
    check("READY=1 is sent", A.sd_notify("READY=1"), True)
    check("and arrives as one datagram", heard(s), ["READY=1"])
    A.sd_notify("READY=1\nSTATUS=Connecting to the bridge")
    check("several fields go in one datagram", heard(s), ["READY=1\nSTATUS=Connecting to the bridge"])

    # 3. an abstract socket ("@name") is reached through a leading NUL
    abstract = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    name = f"caseta-test-{os.getpid()}"
    abstract.bind("\0" + name)
    abstract.settimeout(0)
    os.environ["NOTIFY_SOCKET"] = "@" + name
    check("an abstract socket is reached", A.sd_notify("WATCHDOG=1"), True)
    check("and hears the ping", heard(abstract), ["WATCHDOG=1"])
    abstract.close()

    # 4. a socket that has gone away is reported, never raised
    os.environ["NOTIFY_SOCKET"] = os.path.join(tmp, "gone")
    check("a missing socket is False, not a crash", A.sd_notify("WATCHDOG=1"), False)
    os.environ["NOTIFY_SOCKET"] = path

    # 5. the interval: a third of WatchdogSec, and only for this process
    os.environ["WATCHDOG_USEC"] = "60000000"
    check("WatchdogSec=60 pings every 20 s", A.watchdog_every(), 20.0)
    os.environ["WATCHDOG_PID"] = str(os.getpid())
    check("WATCHDOG_PID naming this process still counts", A.watchdog_every(), 20.0)
    os.environ["WATCHDOG_PID"] = str(os.getpid() + 1)
    check("WATCHDOG_PID naming another process does not", A.watchdog_every(), None)
    del os.environ["WATCHDOG_PID"]
    os.environ["WATCHDOG_USEC"] = "nonsense"
    check("a garbled WATCHDOG_USEC is ignored", A.watchdog_every(), None)

    # 6. the heartbeat pings from the loop, and a blocked loop stops the pings
    os.environ["WATCHDOG_USEC"] = "150000"  # 0.15 s, so a ping every 0.05 s
    a = A.Agent()
    a.bridge = Bridge(True)
    heard(s)
    beat = asyncio.create_task(a.heartbeat())
    await asyncio.sleep(0.32)
    n = len([m for m in heard(s) if m == "WATCHDOG=1"])
    check("pings arrive about every 50 ms", 4 <= n <= 8, True)
    time.sleep(0.3)  # the whole loop blocked, the way a hang would block it
    check("a blocked loop sends nothing", heard(s), [])
    await asyncio.sleep(0.12)
    check("and it pings again once the loop runs", "WATCHDOG=1" in heard(s), True)
    os.environ["WATCHDOG_USEC"] = "60000000"
    check("health says WatchdogSec, so the app can tell the unit is live", a.health()["watchdog_s"], 60)
    os.environ["WATCHDOG_USEC"] = "150000"

    # 7. a bridge that is logged out: pings go on until the give-up time, then stop only if it still answers
    give_up, port_answers = A.BRIDGE_GIVE_UP_S, A.port_answers
    try:
        A.BRIDGE_GIVE_UP_S = 0.2
        answers = {"yes": False}

        async def fake_port(host, port=8081, timeout=5.0):
            return answers["yes"]
        A.port_answers = fake_port
        a.bridge = Bridge(False)
        heard(s)
        await asyncio.sleep(0.4)
        check("a bridge that is unplugged never stops the pings", heard(s).count("WATCHDOG=1") >= 6, True)
        answers["yes"] = True
        await asyncio.sleep(0.1)
        heard(s)
        await asyncio.sleep(0.2)
        got = heard(s)
        check("logged out past the give-up time while it answers: the pings stop", "WATCHDOG=1" in got, False)
        a.bridge = Bridge(True)
        await asyncio.sleep(0.12)
        got = heard(s)
        check("logged in again: they start again", "WATCHDOG=1" in got, True)
        check("and a new logout starts its own count", a._bridge_down_since, None)
    finally:
        A.BRIDGE_GIVE_UP_S, A.port_answers = give_up, port_answers
    beat.cancel()

    # 8. a real port check, against something listening and something not
    srv = await asyncio.start_server(lambda r, w: w.close(), "127.0.0.1", 0)
    port = srv.sockets[0].getsockname()[1]
    check("a listening port answers", await A.port_answers("127.0.0.1", port), True)
    srv.close()
    await srv.wait_closed()
    check("a closed port does not", await A.port_answers("127.0.0.1", port, timeout=1.0), False)
    check("no host does not", await A.port_answers(""), False)

    # 9. with nothing watching, the heartbeat returns at once and sends nothing
    del os.environ["WATCHDOG_USEC"]
    heard(s)
    await asyncio.wait_for(a.heartbeat(), 1)
    check("no watchdog: the heartbeat does nothing", heard(s), [])
    check("and health says nothing is watching", a.health()["watchdog_s"], None)
    s.close()


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
