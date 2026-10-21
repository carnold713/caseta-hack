"""The PC half of screen sync (pc/screensync.py): what it makes of a screen, and finding the connector.
Run: python pc/test_screensync.py"""
import json
import os
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


class FakeSync(P.Sync):
    def __init__(self, link):  # no screen needed
        self.link, self.paused = link, False


P._allowed = True  # (on a Mac build machine, Screen Recording is not this test's business)
s = FakeSync(link)
check("the tray says what the room is doing", s.status_line(), "Office · following")
s.paused = True
check("paused here says so", s.status_line(), "Paused")
done.set()
th.join(2)
srv.close()
link.sock.close()

print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
