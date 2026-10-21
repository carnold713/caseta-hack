"""Caseta screen sync, the computer's half: shows the colours on this PC's or Mac's screen to the connector on the
Raspberry Pi.

About thirty times a second it looks at the main screen, shrinks it to a 16 x 9 grid of colours (black bars above
and below a film, or beside it, are left out), and sends the grid to the connector over the home network. The
connector works out each light's colour and streams it to the Hue bridge (agent/screensync.py). Which room follows
is chosen in the app, on the room's page.

It finds the connector by itself (a broadcast on UDP 47700, which the connector answers), or takes its address
with --pi. While it runs it sits in the tray (on a Mac, the menu bar): the icon is the colour of the screen, its menu
says what the room is doing, and can pause, resume, start with Windows (open at login, on a Mac), or quit. Closing
it, locking the computer or letting it sleep stops the frames, and a few seconds later the connector stops the sync
and puts the lights back as they were.

On a Mac it asks for Screen Recording the first time (System Settings, Privacy & Security): without it macOS shows
it the desktop picture and nothing else, so until it is allowed the menu says so instead of following.

    screensync.exe                 run in the tray
    screensync.exe --pi 192.168.1.20
    screensync.exe --selftest      look at the screen once, print what it saw, and exit

Built into one .exe for Windows and a menu-bar .app for macOS by .github/workflows/screensync.yml.
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
def _plain_grab():
    import mss  # noqa: WPS433

    return (getattr(mss, "MSS", None) or mss.mss)()


class Screen:
    """The main screen: through Windows' Desktop Duplication (dxcam), or on a Mac through Quartz at the screen's
    nominal resolution (a Retina screen's pixels are four times as many as a 16 x 9 grid needs), otherwise a plain
    grab (mss)."""

    def __init__(self) -> None:
        self.kind = None
        self._cam = None
        self._mss = None
        self._quartz = None
        self._last: Optional[np.ndarray] = None
        if sys.platform == "darwin":
            try:
                import Quartz  # noqa: WPS433  (pyobjc, macOS only)

                self._quartz = Quartz
                self.kind = "quartz"
                return
            except Exception as exc:  # noqa: BLE001
                LOG.info("Quartz unavailable (%s), using a plain grab", exc)
        else:
            try:
                import dxcam  # noqa: WPS433  (Windows only)

                self._cam = dxcam.create(output_color="RGB")
                self.kind = "dxcam"
                return
            except Exception as exc:  # noqa: BLE001
                LOG.info("Desktop Duplication unavailable (%s), using a plain grab", exc)
        self._mss = _plain_grab()
        self.kind = "mss"

    def _grab_quartz(self) -> Optional[np.ndarray]:
        Q = self._quartz
        img = Q.CGWindowListCreateImage(Q.CGDisplayBounds(Q.CGMainDisplayID()), Q.kCGWindowListOptionOnScreenOnly,
                                        Q.kCGNullWindowID, Q.kCGWindowImageNominalResolution)
        if img is None:
            return None
        w, h, bpr = Q.CGImageGetWidth(img), Q.CGImageGetHeight(img), Q.CGImageGetBytesPerRow(img)
        data = Q.CGDataProviderCopyData(Q.CGImageGetDataProvider(img))
        bgra = np.frombuffer(bytes(data), dtype=np.uint8).reshape(h, bpr // 4, 4)[:, :w]
        return bgra[:, :, 2::-1]

    def grab(self) -> Optional[np.ndarray]:
        """The screen as an H x W x 3 RGB array. dxcam returns nothing when the screen has not changed since the
        last look, so the last picture stands in for it."""
        if self._quartz is not None:
            try:
                f = self._grab_quartz()
            except Exception as exc:  # noqa: BLE001  a macOS that no longer offers it: the plain grab instead
                LOG.info("Quartz grab failed (%s), using a plain grab", exc)
                self._quartz, self._mss, self.kind = None, _plain_grab(), "mss"
                return self.grab()
            if f is not None:
                self._last = f
            return self._last
        if self._cam is not None:
            try:
                f = self._cam.grab()
            except Exception as exc:  # noqa: BLE001  a driver that will not duplicate: the plain grab instead
                LOG.info("Desktop Duplication failed (%s), using a plain grab", exc)
                self._cam, self._mss, self.kind = None, _plain_grab(), "mss"
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
            # (a Mac that has not allowed Screen Recording shows only the desktop picture: nothing is sent from it)
            if not self.paused and screen_allowed():
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
        if not screen_allowed():
            return "Allow Screen Recording in System Settings, then reopen"
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


# ---------- a Mac's Screen Recording permission ----------
_allowed: Optional[bool] = None


def screen_allowed() -> bool:
    """Whether macOS lets this app see other windows (always true elsewhere). Asked once; macOS only tells an app
    it was allowed after it is opened again, so the answer is kept for the run."""
    global _allowed
    if sys.platform != "darwin":
        return True
    if _allowed is None:
        try:
            import Quartz  # noqa: WPS433

            _allowed = bool(Quartz.CGPreflightScreenCaptureAccess())
            if not _allowed:
                Quartz.CGRequestScreenCaptureAccess()  # the system's own prompt, the first time
        except Exception:  # noqa: BLE001  an older macOS without the call asks by itself on the first grab
            _allowed = True
    return _allowed


# ---------- open at login (macOS) ----------
AGENT_PLIST = Path.home() / "Library" / "LaunchAgents" / "app.caseta.screensync.plist"


def _app_bundle() -> Optional[str]:
    exe = Path(sys.executable)
    for p in exe.parents:
        if p.suffix == ".app":
            return str(p)
    return None


def opens_at_login() -> bool:
    return AGENT_PLIST.exists()


def set_open_at_login(on: bool) -> None:
    if not on:
        AGENT_PLIST.unlink(missing_ok=True)
        return
    app = _app_bundle()
    args = ["/usr/bin/open", "-a", app] if app else [sys.executable]
    from xml.sax.saxutils import escape  # noqa: WPS433

    items = "".join(f"<string>{escape(a)}</string>" for a in args)
    AGENT_PLIST.parent.mkdir(parents=True, exist_ok=True)
    AGENT_PLIST.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
        '<plist version="1.0"><dict><key>Label</key><string>app.caseta.screensync</string>'
        f'<key>ProgramArguments</key><array>{items}</array><key>RunAtLoad</key><true/></dict></plist>\n')


def starts_at_login() -> bool:
    return opens_at_login() if sys.platform == "darwin" else starts_with_windows()


def set_starts_at_login(on: bool) -> None:
    (set_open_at_login if sys.platform == "darwin" else set_start_with_windows)(on)


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
def on_main(fn) -> None:  # noqa: ANN001
    """Run `fn` where the tray may be touched. macOS lets only its main thread change the menu bar, and an icon
    changed from any other thread takes the whole app down; Windows does not mind which thread it is."""
    if sys.platform == "darwin":
        try:
            from PyObjCTools import AppHelper  # noqa: WPS433

            AppHelper.callAfter(fn)
            return
        except Exception as exc:  # noqa: BLE001
            LOG.debug("main thread: %s", exc)
            return
    fn()


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
        set_starts_at_login(not starts_at_login())

    def quit_(icon, item):  # noqa: ANN001, ARG001
        sync.stop.set()
        icon.stop()

    paused = lambda item: sync.paused or (sync.link.state or {}).get("state") == "paused"  # noqa: E731
    menu = pystray.Menu(
        pystray.MenuItem(lambda item: sync.status_line(), None, enabled=False),
        pystray.MenuItem(lambda item: "Resume" if paused(item) else "Pause", toggle_pause, default=True),
        pystray.MenuItem("Open at login" if sys.platform == "darwin" else "Start with Windows", toggle_start,
                         checked=lambda item: starts_at_login(), visible=sys.platform in ("win32", "darwin")),
        pystray.MenuItem("Quit", quit_),
    )
    icon = pystray.Icon(APP, picture(sync.colour), "Caseta screen sync", menu)

    def refresh() -> None:
        last = [None]

        def update() -> None:
            if sync.colour != last[0]:
                last[0] = sync.colour
                icon.icon = picture(sync.colour)
            icon.title = f"Caseta screen sync · {sync.status_line()}"
            icon.update_menu()

        while not sync.stop.is_set():
            on_main(update)
            time.sleep(0.5)

    threading.Thread(target=sync.run, daemon=True).start()
    threading.Thread(target=refresh, daemon=True).start()
    icon.run()


def selftest() -> int:
    # a windowed .exe can start with no stdout at all: the answer then goes to selftest.json beside it
    out = sys.stdout if sys.stdout is not None else open("selftest.json", "w", encoding="utf-8")
    s = Screen()
    t0 = time.perf_counter()
    f = None
    for _ in range(20):  # dxcam's first grab can come back empty while Windows sets the duplication up
        f = s.grab()
        if f is not None:
            break
        time.sleep(0.05)
    if f is None:
        print(json.dumps({"capture": s.kind, "frame": None}), file=out, flush=True)
        return 0
    cells = grid(f)
    t = (time.perf_counter() - t0) * 1000
    a = np.frombuffer(cells, dtype=np.uint8).reshape(-1, 3).mean(axis=0)
    print(json.dumps({"capture": s.kind, "screen": list(f.shape), "grid": [GRID_W, GRID_H],
                      "average": [int(v) for v in a], "ms": round(t, 1)}), file=out, flush=True)
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
    logdir = (Path.home() / "Library" / "Logs" / APP if sys.platform == "darwin"
              else Path(os.environ.get("LOCALAPPDATA") or Path.home()) / APP)
    logdir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.FileHandler(logdir / "log.txt", encoding="utf-8")]
                        + ([logging.StreamHandler()] if args.no_tray else []))
    # a crash leaves its trace beside the log: Python's own errors in log.txt, a native crash in crash.txt
    import faulthandler  # noqa: WPS433

    faulthandler.enable(file=open(logdir / "crash.txt", "a", encoding="utf-8"))  # noqa: SIM115  (open for the run)
    sys.excepthook = lambda t, v, tb: LOG.error("stopped by an error", exc_info=(t, v, tb))
    threading.excepthook = lambda a: LOG.error("a thread stopped: %s", a.exc_value, exc_info=(a.exc_type, a.exc_value, a.exc_traceback))
    # one copy at a time: a second one exits quietly
    lock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        lock.bind(("127.0.0.1", PORT + 1))
    except OSError:
        LOG.info("already running")
        return 0
    screen_allowed()  # on a Mac, ask for Screen Recording now, while the app is in front
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
