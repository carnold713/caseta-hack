"""The PC half of screen sync (pc/screensync.py): what it makes of a screen, and finding the connector.
Run: python pc/test_screensync.py"""
import json
import os
import pathlib
import tempfile
import urllib.request
import socket
import sys
import threading
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import screensync as P  # noqa: E402

FAILS = []


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


def cells(b):
    return np.frombuffer(b, dtype=np.uint8).reshape(P.GRID_H, P.GRID_W, 3)


# left half red, right half blue, at 1080p
f = np.zeros((1080, 1920, 3), dtype=np.uint8)
f[:, :960] = (255, 0, 0)
f[:, 960:] = (0, 0, 255)
g = cells(P.grid(f))
check("the grid is 16 x 9", g.shape, (9, 16, 3))
check("its left half is red", bool((g[:, :8] == (255, 0, 0)).all()), True)
check("its right half is blue", bool((g[:, 8:] == (0, 0, 255)).all()), True)

# a film with black bars above and below: the bars are left out
f = np.zeros((2160, 3840, 3), dtype=np.uint8)
f[280:-280] = (200, 120, 40)
g = cells(P.grid(f))
check("black bars above and below are left out (4K)", bool((np.abs(g.astype(int) - (200, 120, 40)) <= 1).all()), True)

# and beside it
f = np.zeros((1080, 1920, 3), dtype=np.uint8)
f[:, 240:-240] = (30, 200, 90)
g = cells(P.grid(f))
check("black bars beside it are left out", bool((np.abs(g.astype(int) - (30, 200, 90)) <= 1).all()), True)

f = np.zeros((1080, 1920, 3), dtype=np.uint8)
check("a black screen is black", bool((cells(P.grid(f)) == 0).all()), True)

# an odd size, and BGRA-shaped input already turned to RGB by the grabber
f = np.full((1017, 1333, 3), 77, dtype=np.uint8)
check("an odd size still makes a full grid", len(P.grid(f)), 16 * 9 * 3)

# a Mac's screen arrives as BGRA rows padded past the picture's width; only the pixels grid() looks at are kept,
# and the grid made from them is the one made from the whole screen
rng = np.random.default_rng(7)
rgb = rng.integers(0, 256, (982, 1512, 3), dtype=np.uint8)
rgb[:120] = 0
bpr = 1536 * 4
bgra = np.zeros((982, bpr), dtype=np.uint8)
bgra[:, : 1512 * 4].reshape(982, 1512, 4)[:, :, :3] = rgb[:, :, ::-1]
small = P.sample_bgra(bytearray(bgra.tobytes()), 1512, 982, bpr)
check("a Mac screen keeps only a small sample", small.shape[0] < 200 and small.shape[1] < 400, True)
check("the sample makes the same grid as the whole screen", P.grid(small) == P.grid(rgb), True)

# macOS crash reports, summed up in one line for the log
hdr = json.dumps({"app_name": "CasetaScreenSync", "bug_type": "309"})
body = json.dumps({"procName": "CasetaScreenSync", "exception": {"type": "EXC_CRASH", "signal": "SIGABRT"},
                   "asi": {"AppKit": ["NSWindow drag regions should only be invalidated on the Main Thread!"]},
                   "faultingThread": 3, "usedImages": [{"name": "libsystem_kernel.dylib"}, {"name": "AppKit"}],
                   "threads": [{}, {}, {}, {"frames": [{"imageIndex": 0, "symbol": "__pthread_kill"},
                                                       {"imageIndex": 1, "symbol": "-[NSWindow setTitle:]"}]}]})
line = P.crash_summary(hdr + "\n" + body) or ""
check("a crash report says how it ended", line.startswith("EXC_CRASH SIGABRT"), True)
check("and what the system said", "Main Thread" in line, True)
check("and where", "thread 3: libsystem_kernel.dylib:__pthread_kill < AppKit:-[NSWindow setTitle:]" in line, True)
jet = json.dumps({"bug_type": "298"}) + "\n" + json.dumps({"processes": [
    {"name": "Safari", "rpages": 1000}, {"name": "CasetaScreenSync", "reason": "per-process-limit", "rpages": 65536}]})
check("a memory stop names the app", P.crash_summary(jet), "macOS stopped it for memory (per-process-limit, 1024 MB)")
other = json.dumps({"bug_type": "298"}) + "\n" + json.dumps({"processes": [{"name": "Safari", "reason": "highwater"}]})
check("one about other apps is left out", P.crash_summary(other), None)
check("another app's crash is left out", P.crash_summary(json.dumps({"app_name": "Mail"}) + "\n{}"), None)

fr = P.frame_bytes(bytes(16 * 9 * 3), resume=True)
check("a frame says what it is", (fr[:4], fr[4], fr[5], fr[6], len(fr)), (b"CSY1", 1, 16, 9, 7 + 432))

# finding the connector: it answers the query with its state
srv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
srv.bind(("127.0.0.1", P.PORT))
got = []


done = threading.Event()


def connector():
    # Windows reports a closed socket, or an earlier send that found no one, as an error on the next read: any of
    # them ends the pretend connector quietly
    srv.settimeout(0.2)
    while not done.is_set():
        try:
            data, addr = srv.recvfrom(65536)
        except socket.timeout:
            continue
        except OSError:
            if done.is_set():
                break
            continue
        got.append(data[:4])
        try:
            srv.sendto(P.STATE + json.dumps({"state": "syncing", "room_name": "Office"}).encode(), addr)
        except OSError:
            pass


th = threading.Thread(target=connector, daemon=True)
th.start()
link = P.Link("127.0.0.1")
for _ in range(20):
    link.tick()
    if link.found:
        break
    time.sleep(0.05)
check("the connector is found", (link.found, link.addr), (True, ("127.0.0.1", P.PORT)))
link.send(P.frame_bytes(bytes(432)))
time.sleep(0.2)
link.tick()
check("it heard the query and then a frame", got[:2], [b"CSQ1", b"CSY1"])


class FakeScreen:
    """Two displays, the main one first, as Screen.displays() gives them."""
    def __init__(self):
        self.display, self.used = None, []

    def displays(self):
        return [{"id": "1", "name": "Built-in display · 1512 x 982", "main": True},
                {"id": "2", "name": "Display 1 · 2560 x 1440", "main": False}]

    def use(self, d):
        self.used.append(d)
        self.display = d


class FakeSync(P.Sync):
    def __init__(self, link, settings=None):  # no screen needed
        self.link, self.paused, self.gaming, self.fps = link, False, False, 20.0
        self.settings = settings or P.Settings(pathlib.Path(tempfile.mkdtemp()) / "s.json")
        self.screen = FakeScreen()


P._allowed = True  # (on a Mac build machine, Screen Recording is not this test's business)
s = FakeSync(link)
check("the tray says what the room is doing", s.status_line(), "Office · following")
s.paused = True
check("paused here says so", s.status_line(), "Paused")
done.set()
th.join(2)
srv.close()
link.sock.close()

# the query says who is asking
got.clear()
srv2 = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
srv2.bind(("127.0.0.1", 0))
srv2.settimeout(2)
port2 = srv2.getsockname()[1]
P.PORT, old_port = port2, P.PORT
quiet = P.Link(None, last="127.0.0.1")
check("a remembered address is used before any answer", quiet.addr, ("127.0.0.1", port2))
quiet.tick()
data, _ = srv2.recvfrom(65536)
info = json.loads(data[4:].decode())
check("the query says who is asking", (data[:4], sorted(info)), (b"CSQ1", ["name", "os", "v"]))
quiet.about = lambda: {"displays": FakeScreen().displays(), "display": None}
quiet._asked_at = 0.0
quiet.tick()
data, _ = srv2.recvfrom(65536)
check("and which displays it has", [d["id"] for d in json.loads(data[4:].decode())["displays"]], ["1", "2"])
# no answer ever comes back (a firewall): frames still go to the address it has
quiet.send(P.frame_bytes(bytes(432)))
data, _ = srv2.recvfrom(65536)
check("with no answer, frames still go to the address it has", data[:4], b"CSY1")
fs = FakeSync(quiet)
check("and the menu says it is sending without an answer", fs.status_line(), "Sending to 127.0.0.1, no answer yet")
P.PORT = old_port
srv2.close()

# settings are kept between runs
sp = pathlib.Path(tempfile.mkdtemp()) / "settings.json"
st = P.Settings(sp)
check("settings start from their defaults", (st["fps"], st["game"], st["pi"]), (20, "gentle", None))
st.update(fps=12, pi="192.168.1.20")
check("and are kept", (P.Settings(sp)["fps"], P.Settings(sp)["pi"]), (12, "192.168.1.20"))

# the Settings window's page: its state, a change, and nothing without the token
fs = FakeSync(P.Link("127.0.0.1"), P.Settings(pathlib.Path(tempfile.mkdtemp()) / "s.json"))
fs.link.state = {"state": "syncing", "room_name": "Office", "room": "r1", "app_url": "https://hub.example/"}
fs.link.heard_at = time.monotonic()
page = P.SettingsPage(fs)
url = page.start()
st = json.loads(urllib.request.urlopen(url + "state").read())
check("the page says what the room is doing", st["status"], "Office · following")
check("and offers Light positions", (st["positions"], fs.positions_url()), (True, "https://hub.example/#room/r1/screen"))
req = urllib.request.Request(url + "set", data=json.dumps({"fps": 12, "game": "pause", "pi": "10.0.0.5"}).encode(), method="POST")
st = json.loads(urllib.request.urlopen(req).read())
check("a change from the page is kept and used", (st["fps"], st["game"], st["pi"], fs.link.addr), (12, "pause", "10.0.0.5", ("10.0.0.5", P.PORT)))
check("the page offers the displays, following the main one", ([d["id"] for d in st["displays"]], st["display"]), (["1", "2"], ""))
req = urllib.request.Request(url + "set", data=json.dumps({"display": "2"}).encode(), method="POST")
st = json.loads(urllib.request.urlopen(req).read())
check("a display picked on the page is followed and kept", (st["display"], fs.settings["display"]), ("2", "2"))
req = urllib.request.Request(url + "set", data=json.dumps({"display": "9"}).encode(), method="POST")
check("one that is not there is not", json.loads(urllib.request.urlopen(req).read())["display"], "2")
# the display picked in the app: followed when it is newer than the last one picked here, and only by its computer
fs.link.state = {"want_display": {"id": "1", "at": 1, "pc": P.who_am_i()["name"]}}
fs._from_app()
check("an older choice from the app does not undo a newer one made here", fs.screen.display, "2")
fs.link.state = {"want_display": {"id": "1", "at": fs.settings["display_at"] + 1000, "pc": "another-computer"}}
fs._from_app()
check("nor does one made for another computer", fs.screen.display, "2")
fs.link.state = {"want_display": {"id": "1", "at": fs.settings["display_at"] + 1000, "pc": P.who_am_i()["name"]}}
fs._from_app()
check("a newer one for this computer is followed", (fs.screen.display, fs.settings["display"]), ("1", "1"))
html = urllib.request.urlopen(url).read().decode()
check("the page is there", "Light positions" in html and "\u2014" not in html and "\u2013" not in html, True)
try:
    urllib.request.urlopen(url.replace(page.token, "guess") + "state")
    blocked = False
except Exception:  # noqa: BLE001
    blocked = True
check("without the run's token, nothing", blocked, True)

print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
