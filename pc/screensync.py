"""Caseta screen sync, the PC half: shows the colours on this PC's screen to the connector on the Raspberry Pi.

About thirty times a second it looks at the main screen, shrinks it to a 16 x 9 grid of colours (black bars above
and below a film, or beside it, are left out), and sends the grid to the connector over the home network. The
connector works out each light's colour and streams it to the Hue bridge (agent/screensync.py). Which room follows
is chosen in the app, on the room's page.

It finds the connector by itself (a broadcast on UDP 47700, which the connector answers), or takes its address
with --pi. While it runs it sits in the tray: the icon is the colour of the screen, its menu says what the room is
doing, and can pause, resume, start with Windows, or quit. Closing it, locking the PC or letting it sleep stops the
frames, and a few seconds later the connector stops the sync and puts the lights back as they were.

    screensync.exe                 run in the tray
    screensync.exe --pi 192.168.1.20
    screensync.exe --selftest      look at the screen once, print what it saw, and exit

Built into one .exe by .github/workflows/screensync.yml.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

PORT = 47700
FRAME = b"CSY1"
QUERY = b"CSQ1"
STATE = b"CSS1"
FLAG_RESUME = 0x01
GRID_W, GRID_H = 16, 9
LOST_S = 10.0           # no answer from the connector for this long: look for it again
APP = "CasetaScreenSync"

LOG = logging.getLogger("screensync")


# ---------- the screen ----------
class Screen:
    """The main screen, through Windows' Desktop Duplication (dxcam) when it can, otherwise a plain grab (mss)."""

    def __init__(self) -> None:
        self.kind = None
        self._cam = None
        self._mss = None
        self._last: Optional[np.ndarray] = None
        try:
            import dxcam  # noqa: WPS433  (Windows only)

            self._cam = dxcam.create(output_color="RGB")
            self.kind = "dxcam"
        except Exception as exc:  # noqa: BLE001
            LOG.info("Desktop Duplication unavailable (%s), using a plain grab", exc)
            import mss  # noqa: WPS433

            self._mss = mss.mss()
            self.kind = "mss"

    def grab(self) -> Optional[np.ndarray]:
        """The screen as an H x W x 3 RGB array. dxcam returns nothing when the screen has not changed since the
        last look, so the last picture stands in for it."""
        if self._cam is not None:
            try:
                f = self._cam.grab()
            except Exception as exc:  # noqa: BLE001  a driver that will not duplicate: the plain grab instead
                LOG.info("Desktop Duplication failed (%s), using a plain grab", exc)
                import mss  # noqa: WPS433

                self._cam, self._mss, self.kind = None, mss.mss(), "mss"
                return self.grab()
            if f is not None:
                self._last = f
            return self._last
        mon = self._mss.monitors[1]
        shot = np.asarray(self._mss.grab(mon))  # BGRA
        self._last = shot[:, :, 2::-1]
        return self._last


def grid(frame: np.ndarray, w: int = GRID_W, h: int = GRID_H) -> bytes:
    """The screen shrunk to w x h colours, RGB bytes row by row, with black bars left out."""
    H, W = frame.shape[:2]
    # look at about 10 x 10 pixels for every cell: plenty for an average, and quick at 4K
    sy, sx = max(1, H // (h * 10)), max(1, W // (w * 10))
    small = frame[::sy, ::sx, :3].astype(np.float32)
    small = _trim_bars(small)
    rows, cols = small.shape[0] // h * h, small.shape[1] // w * w
    if rows < h or cols < w:
        return bytes(w * h * 3)
    small = small[:rows, :cols]
    cells = small.reshape(h, rows // h, w, cols // w, 3).mean(axis=(1, 3))
    return np.clip(cells, 0, 255).astype(np.uint8).tobytes()


def _trim_bars(img: np.ndarray, dark: float = 10.0, most: float = 0.25) -> np.ndarray:
    """Leave out black bars: rows (then columns) at the edges whose brightest pixel is near black, up to a quarter of
    the picture from each side. A screen that is black all over is kept whole, so it reads as black."""
    lum = img.max(axis=2)
    r = lum.max(axis=1) > dark
    cl = lum.max(axis=0) > dark
    if not r.any() or not cl.any():
        return img
    H, W = lum.shape
    top = min(int(np.argmax(r)), int(H * most))
    bot = min(int(np.argmax(r[::-1])), int(H * most))
    lef = min(int(np.argmax(cl)), int(W * most))
    rig = min(int(np.argmax(cl[::-1])), int(W * most))
    return img[top:H - bot, lef:W - rig]


def frame_bytes(cells: bytes, resume: bool = False, w: int = GRID_W, h: int = GRID_H) -> bytes:
    return FRAME + bytes([FLAG_RESUME if resume else 0, w, h]) + cells


# ---------- the connector ----------
class Link:
    """The UDP conversation with the connector: find it, send frames, read what it says back."""

    def __init__(self, pi: Optional[str] = None) -> None:
        self.fixed = pi
        self.addr: Optional[Tuple[str, int]] = (pi, PORT) if pi else None
        self.state: dict = {}
        self.heard_at = 0.0
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self.sock.settimeout(0.0)
        self.sock.bind(("0.0.0.0", 0))
        self._asked_at = 0.0

    def tick(self) -> None:
        """Read answers; look for the connector when it has not been heard from for a while."""
        while True:
            try:
                data, addr = self.sock.recvfrom(65536)
            except (BlockingIOError, InterruptedError, socket.timeout):
                break
            except OSError:
                break  # Windows reports an unreachable port on the next read; the connector may be restarting
            if data[:4] == STATE:
                try:
                    self.state = json.loads(data[4:].decode())
                except ValueError:
                    continue
                if self.addr is None or self.addr[0] != addr[0]:
                    LOG.info("found the connector at %s", addr[0])
                self.addr, self.heard_at = (addr[0], PORT), time.monotonic()
        now = time.monotonic()
        if now - self.heard_at > LOST_S and now - self._asked_at > 2:
            self._asked_at = now
            if not self.fixed:
                self.addr = None
            self._send(QUERY, ("255.255.255.255", PORT))
            if self.fixed:
                self._send(QUERY, (self.fixed, PORT))

    def send(self, data: bytes) -> None:
        if self.addr:
            self._send(data, self.addr)

    def _send(self, data: bytes, addr) -> None:  # noqa: ANN001
        try:
            self.sock.sendto(data, addr)
        except OSError as exc:
            LOG.debug("send to %s: %s", addr, exc)

    @property
    def found(self) -> bool:
        return self.addr is not None and time.monotonic() - self.heard_at < LOST_S


# ---------- the loop ----------
class Sync:
    def __init__(self, pi: Optional[str], fps: float) -> None:
        self.link = Link(pi)
        self.screen = Screen()
        self.fps = fps
        self.paused = False            # paused here, from the tray: no frames, so the connector stops
        self.resume_until = 0.0        # asking the connector to resume its own pause, for a moment
        self.colour = (40, 40, 40)
        self.stop = threading.Event()

    def run(self) -> None:
        period = 1 / self.fps
        nxt = time.monotonic()
        while not self.stop.is_set():
            self.link.tick()
            if not self.paused:
                try:
                    f = self.screen.grab()
                except Exception as exc:  # noqa: BLE001  the secure desktop (locked, UAC) cannot be looked at
                    LOG.debug("grab: %s", exc)
                    f = None
                if f is not None:
                    cells = grid(f)
                    a = np.frombuffer(cells, dtype=np.uint8).reshape(-1, 3).mean(axis=0)
                    self.colour = tuple(int(v) for v in a)
                    self.link.send(frame_bytes(cells, resume=time.monotonic() < self.resume_until))
            nxt += period
            time.sleep(max(0.0, nxt - time.monotonic()))
            if time.monotonic() - nxt > 1:
                nxt = time.monotonic()  # the PC slept: start the beat again rather than catch up

    def resume_room(self) -> None:
        self.paused = False
        self.resume_until = time.monotonic() + 1.0

    def status_line(self) -> str:
        if self.paused:
            return "Paused"
        if not self.link.found:
            return "Looking for the connector"
        s = self.link.state or {}
        room = s.get("room_name") or "No room"
        state = s.get("state")
        if state == "off":
            return "Choose a room in the app"
        if state == "syncing":
            return f"{room} · following"
        if state == "paused":
            return f"{room} · paused"
        if state == "problem":
            return f"{room} · {s.get('why') or 'not following'}"
        return f"{room} · starting"


# ---------- start with Windows ----------
def _run_key():
    import winreg  # noqa: WPS433

    return winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0,
                          winreg.KEY_READ | winreg.KEY_SET_VALUE)


def starts_with_windows() -> bool:
    try:
        import winreg  # noqa: WPS433

        with _run_key() as k:
            winreg.QueryValueEx(k, APP)
        return True
    except OSError:
        return False
    except ImportError:
        return False


def set_start_with_windows(on: bool) -> None:
    import winreg  # noqa: WPS433

    with _run_key() as k:
        if on:
            winreg.SetValueEx(k, APP, 0, winreg.REG_SZ, f'"{sys.executable}"')
        else:
            try:
                winreg.DeleteValue(k, APP)
            except OSError:
                pass


# ---------- the tray ----------
def tray(sync: Sync) -> None:
    import pystray  # noqa: WPS433
    from PIL import Image, ImageDraw  # noqa: WPS433

    def picture(rgb) -> "Image.Image":
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((4, 12, 60, 46), radius=6, fill=tuple(rgb) + (255,), outline=(238, 242, 239, 255), width=3)
        d.rectangle((26, 46, 38, 54), fill=(238, 242, 239, 255))
        d.rectangle((18, 54, 46, 58), fill=(238, 242, 239, 255))
        return img

    def toggle_pause(icon, item):  # noqa: ANN001, ARG001
        if sync.paused or (sync.link.state or {}).get("state") == "paused":
            sync.resume_room()
        else:
            sync.paused = True

    def toggle_start(icon, item):  # noqa: ANN001, ARG001
        set_start_with_windows(not starts_with_windows())

    def quit_(icon, item):  # noqa: ANN001, ARG001
        sync.stop.set()
        icon.stop()

    paused = lambda item: sync.paused or (sync.link.state or {}).get("state") == "paused"  # noqa: E731
    menu = pystray.Menu(
        pystray.MenuItem(lambda item: sync.status_line(), None, enabled=False),
        pystray.MenuItem(lambda item: "Resume" if paused(item) else "Pause", toggle_pause, default=True),
        pystray.MenuItem("Start with Windows", toggle_start, checked=lambda item: starts_with_windows(),
                         visible=sys.platform == "win32"),
        pystray.MenuItem("Quit", quit_),
    )
    icon = pystray.Icon(APP, picture(sync.colour), "Caseta screen sync", menu)

    def refresh() -> None:
        last = None
        while not sync.stop.is_set():
            if sync.colour != last:
                last = sync.colour
                icon.icon = picture(sync.colour)
            icon.title = f"Caseta screen sync · {sync.status_line()}"
            icon.update_menu()
            time.sleep(0.5)

    threading.Thread(target=sync.run, daemon=True).start()
    threading.Thread(target=refresh, daemon=True).start()
    icon.run()


def selftest() -> int:
    s = Screen()
    t0 = time.perf_counter()
    f = None
    for _ in range(20):  # dxcam's first grab can come back empty while Windows sets the duplication up
        f = s.grab()
        if f is not None:
            break
        time.sleep(0.05)
    if f is None:
        print(json.dumps({"capture": s.kind, "frame": None}))
        return 0
    cells = grid(f)
    t = (time.perf_counter() - t0) * 1000
    a = np.frombuffer(cells, dtype=np.uint8).reshape(-1, 3).mean(axis=0)
    print(json.dumps({"capture": s.kind, "screen": list(f.shape), "grid": [GRID_W, GRID_H],
                      "average": [int(v) for v in a], "ms": round(t, 1)}))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(prog="screensync", description="Shows this PC's screen colours to the Caseta connector.")
    ap.add_argument("--pi", help="the connector's address, when it cannot be found by itself")
    ap.add_argument("--fps", type=float, default=30.0, help="how many times a second to look at the screen (default 30)")
    ap.add_argument("--no-tray", action="store_true", help="run without the tray icon (stop with Ctrl+C)")
    ap.add_argument("--selftest", action="store_true", help="look at the screen once, print what it saw, and exit")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    logdir = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / APP
    logdir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.FileHandler(logdir / "log.txt", encoding="utf-8")]
                        + ([logging.StreamHandler()] if args.no_tray else []))
    # one copy at a time: a second one exits quietly
    lock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        lock.bind(("127.0.0.1", PORT + 1))
    except OSError:
        LOG.info("already running")
        return 0
    sync = Sync(args.pi, max(5.0, min(60.0, args.fps)))
    LOG.info("screen sync started (%s, %.0f a second)", sync.screen.kind, sync.fps)
    if args.no_tray:
        try:
            sync.run()
        except KeyboardInterrupt:
            pass
        return 0
    tray(sync)
    return 0


if __name__ == "__main__":
    sys.exit(main())
