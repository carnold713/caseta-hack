"""Caseta screen sync, the computer's half: shows the colours on this PC's or Mac's screen to the connector on the
Raspberry Pi.

About thirty times a second it looks at the main screen, shrinks it to a 16 x 9 grid of colours (black bars above
and below a film, or beside it, are left out), and sends the grid to the connector over the home network. The
connector works out each light's colour and streams it to the Hue bridge (agent/screensync.py). Which room follows
is chosen in the app, on the room's page.

It finds the connector by itself (a broadcast on UDP 47700, which the connector answers), or is given its address
in its settings (or --pi). Once it knows the address it keeps it, and sends there even when no answer comes back:
a firewall that keeps the answers out (a Mac's, often) then costs the status line, not the lights.

While it runs it sits in the tray (on a Mac, the menu bar), still: nothing on it moves, so it costs nothing while a
game is running. Its menu says what the room is doing and opens Settings, a small window of its own (a page served
here on 127.0.0.1, shown in an app window): pause, how smoothly to follow, what to do while a game fills the screen,
the connector's address, starting at login, and Light positions, which opens the app's own positions page for the
room. Closing it, locking the computer or letting it sleep stops the frames, and a few seconds later the connector
stops the sync and puts the lights back as they were.

It stays out of a game's way: it runs below normal priority, looks at the screen 20 times a second by default (the
lights show about 25 changes a second at most, and the connector smooths between frames), and while a game fills the
screen it looks more gently still, or not at all, as Settings says (Windows).

On a Mac it asks for Screen Recording the first time (System Settings, Privacy & Security): without it macOS shows
it the desktop picture and nothing else, so until it is allowed the menu says so instead of following.

    screensync.exe                 run in the tray
    screensync.exe --pi 192.168.1.20
    screensync.exe --selftest      look at the screen once, print what it saw, and exit
    screensync.exe --settings      run, and open Settings at once

Built into one .exe for Windows and a menu-bar .app for macOS by .github/workflows/screensync.yml.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import logging
import os
import secrets
import socket
import sys
import threading
import time
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

PORT = 47700
FRAME = b"CSY1"
QUERY = b"CSQ1"
STATE = b"CSS1"
FLAG_RESUME = 0x01
GRID_W, GRID_H = 16, 9
LOST_S = 10.0           # no answer from the connector for this long: look for it again
TELL_S = 10.0           # and how often, while it answers, this computer says which displays it has
APP = "CasetaScreenSync"
VERSION = "1.5"
# How many times a second to look at the screen: Settings' choices. The lights are sent 50 updates a second and show
# about 25, so past 50 a faster look makes them no smoother; it only lets a change reach them a few milliseconds
# sooner, for many times the work here (a full-screen game still follows its own setting).
RATES = (12, 20, 30, 60, 120, 240)
GAME_RATE = 6           # "gently", while a game fills the screen

LOG = logging.getLogger("screensync")


# ---------- the screen ----------
def _plain_grab():
    import mss  # noqa: WPS433

    return (getattr(mss, "MSS", None) or mss.mss)()


def _steps(H: int, W: int, w: int = GRID_W, h: int = GRID_H) -> Tuple[int, int]:
    # about 10 x 10 pixels for every cell: plenty for an average, and quick at 4K
    return max(1, H // (h * 10)), max(1, W // (w * 10))


def sample_bgra(buf, w: int, h: int, bpr: int) -> np.ndarray:  # noqa: ANN001
    """The pixels grid() looks at, as RGB, out of a BGRA screen `bpr` bytes a row: a copy small enough to keep
    (a few hundred pixels across), so the screen itself can be let go at once."""
    sy, sx = _steps(h, w)
    rows = np.frombuffer(buf, dtype=np.uint8, count=h * bpr).reshape(h, bpr)
    px = rows[::sy, : w * 4].reshape(-1, w, 4)[:, ::sx]
    return np.ascontiguousarray(px[:, :, 2::-1])


class _CoreGraphics:
    """The Mac's screen through CoreGraphics itself, at the screen's nominal resolution (a Retina screen's pixels
    are four times as many as a 16 x 9 grid needs). Called directly rather than through pyobjc, so each screen is
    released the moment its pixels are sampled: nothing waits for an autorelease pool, and memory stays flat
    however long it runs and however fast it looks."""

    LIST_ON_SCREEN = 1
    NULL_WINDOW = 0
    IMAGE_OPTIONS = 1 | 2 | 16  # ignore window framing, opaque, nominal resolution

    def __init__(self) -> None:
        import ctypes.util  # noqa: WPS433

        class CGPoint(ctypes.Structure):
            _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

        class CGSize(ctypes.Structure):
            _fields_ = [("width", ctypes.c_double), ("height", ctypes.c_double)]

        class CGRect(ctypes.Structure):
            _fields_ = [("origin", CGPoint), ("size", CGSize)]

        def lib(name: str):  # noqa: ANN202
            return ctypes.cdll.LoadLibrary(ctypes.util.find_library(name)
                                           or f"/System/Library/Frameworks/{name}.framework/{name}")

        cg, cf = lib("CoreGraphics"), lib("CoreFoundation")
        vp, sz = ctypes.c_void_p, ctypes.c_size_t
        cg.CGMainDisplayID.restype = ctypes.c_uint32
        cg.CGGetActiveDisplayList.argtypes = [ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_uint32)]
        cg.CGGetActiveDisplayList.restype = ctypes.c_int32
        cg.CGDisplayIsBuiltin.argtypes, cg.CGDisplayIsBuiltin.restype = [ctypes.c_uint32], ctypes.c_uint32
        cg.CGDisplayBounds.argtypes, cg.CGDisplayBounds.restype = [ctypes.c_uint32], CGRect
        cg.CGWindowListCreateImage.argtypes = [CGRect, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32]
        cg.CGWindowListCreateImage.restype = vp
        for fn in ("CGImageGetWidth", "CGImageGetHeight", "CGImageGetBytesPerRow", "CGImageGetBitsPerPixel"):
            getattr(cg, fn).argtypes, getattr(cg, fn).restype = [vp], sz
        cg.CGImageGetDataProvider.argtypes, cg.CGImageGetDataProvider.restype = [vp], vp
        cg.CGDataProviderCopyData.argtypes, cg.CGDataProviderCopyData.restype = [vp], vp
        cf.CFDataGetBytePtr.argtypes, cf.CFDataGetBytePtr.restype = [vp], vp
        cf.CFDataGetLength.argtypes, cf.CFDataGetLength.restype = [vp], ctypes.c_long
        cf.CFRelease.argtypes, cf.CFRelease.restype = [vp], None
        self.cg, self.cf = cg, cf
        self.display: Optional[int] = None  # None: the main display, the one with the menu bar

    def displays(self) -> List[dict]:
        """The displays in use: [{id, name, main}], the main one first."""
        cg = self.cg
        ids, n = (ctypes.c_uint32 * 16)(), ctypes.c_uint32(0)
        if cg.CGGetActiveDisplayList(16, ids, ctypes.byref(n)) != 0:
            return []
        main = cg.CGMainDisplayID()
        out, k = [], 0
        for did in sorted(ids[: n.value], key=lambda d: d != main):
            b = cg.CGDisplayBounds(did)
            if cg.CGDisplayIsBuiltin(did):
                label = "Built-in display"
            else:
                k += 1
                label = f"Display {k}"
            out.append({"id": str(did), "name": f"{label} · {int(b.size.width)} x {int(b.size.height)}", "main": did == main})
        return out

    def grab(self) -> Optional[np.ndarray]:
        cg, cf = self.cg, self.cf
        did = self.display if self.display is not None else cg.CGMainDisplayID()
        img = cg.CGWindowListCreateImage(cg.CGDisplayBounds(did), self.LIST_ON_SCREEN, self.NULL_WINDOW, self.IMAGE_OPTIONS)
        if not img:
            return None  # asleep, locked, or no screen to look at
        data = None
        try:
            w, h, bpr = cg.CGImageGetWidth(img), cg.CGImageGetHeight(img), cg.CGImageGetBytesPerRow(img)
            if cg.CGImageGetBitsPerPixel(img) != 32 or not w or not h:
                return None
            data = cg.CGDataProviderCopyData(cg.CGImageGetDataProvider(img))
            if not data or cf.CFDataGetLength(data) < h * bpr:
                return None
            buf = (ctypes.c_uint8 * (h * bpr)).from_address(cf.CFDataGetBytePtr(data))
            return sample_bgra(buf, w, h, bpr)
        finally:
            if data:
                cf.CFRelease(data)
            cf.CFRelease(img)


def _dxcam_outputs() -> List[dict]:
    """Windows' displays as Desktop Duplication numbers them: [{device, output, w, h, main}]."""
    import re  # noqa: WPS433

    import dxcam  # noqa: WPS433

    out = []
    for m in re.finditer(r"Device\[(\d+)\] Output\[(\d+)\]: Res:\((\d+), (\d+)\).*?Primary:(True|False)", dxcam.output_info()):
        out.append({"device": int(m.group(1)), "output": int(m.group(2)), "w": int(m.group(3)), "h": int(m.group(4)),
                    "main": m.group(5) == "True"})
    return out


class Screen:
    """One display: through Windows' Desktop Duplication (dxcam), or on a Mac through CoreGraphics (_CoreGraphics),
    otherwise a plain grab (mss). Which one is `display` (an id from displays(); None is the main display), chosen
    in Settings or in the app; a display that has gone (unplugged) falls back to the main one."""

    def __init__(self, display: Optional[str] = None) -> None:
        self.kind = None
        self._cam = None
        self._mss = None
        self._cgs = None
        self._last: Optional[np.ndarray] = None
        self.display: Optional[str] = None
        self._want: Optional[str] = display
        self._pending = True  # the display asked for is looked up on the first grab
        if sys.platform == "darwin":
            try:
                self._cgs = _CoreGraphics()
                self.kind = "coregraphics"
                return
            except Exception as exc:  # noqa: BLE001
                LOG.info("CoreGraphics unavailable (%s), using a plain grab", exc)
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

    def displays(self) -> List[dict]:
        """[{id, name, main}] for every display, the main one first. Never raises: an empty list says it cannot tell."""
        try:
            if self._cgs is not None:
                return self._cgs.displays()
            if self._cam is not None:
                outs = sorted(_dxcam_outputs(), key=lambda o: not o["main"])
                return [{"id": f"d{o['device']}.{o['output']}", "main": o["main"],
                         "name": f"Display {k + 1} · {o['w']} x {o['h']}"} for k, o in enumerate(outs)]
            mons = self._mss.monitors[1:]
            return [{"id": f"m{k + 1}", "main": k == 0, "name": f"Display {k + 1} · {m['width']} x {m['height']}"}
                    for k, m in enumerate(mons)]
        except Exception as exc:  # noqa: BLE001
            LOG.debug("displays: %s", exc)
            return []

    def use(self, display: Optional[str]) -> None:
        """Look at this display from the next grab on (called from any thread; the capture thread switches)."""
        self._want, self._pending = display or None, True

    def _switch(self) -> None:
        want, self._pending = self._want, False
        ids = {d["id"]: d for d in self.displays()}
        pick = want if want in ids else None
        if want and not pick:
            LOG.info("display %s is not there, following the main one", want)
        self._last = None
        if self._cgs is not None:
            self._cgs.display = int(pick) if pick else None
        elif self._cam is not None and pick != self.display:
            import dxcam  # noqa: WPS433

            dev, out = (int(v) for v in pick[1:].split(".")) if pick else (0, None)
            try:
                self._cam.release()
            except Exception:  # noqa: BLE001
                pass
            self._cam = dxcam.create(device_idx=dev, output_idx=out, output_color="RGB")
        self.display = pick
        LOG.info("following %s", ids[pick]["name"] if pick else "the main display")

    def grab(self) -> Optional[np.ndarray]:
        """The screen as an H x W x 3 RGB array (on a Mac, only the pixels grid() looks at). dxcam returns nothing
        when the screen has not changed since the last look, so the last picture stands in for it."""
        if self._pending:
            try:
                self._switch()
            except Exception as exc:  # noqa: BLE001
                self._pending = False
                LOG.info("could not switch display (%s)", exc)
        if self._cgs is not None:
            try:
                f = self._cgs.grab()
            except Exception as exc:  # noqa: BLE001  a macOS that no longer offers it: the plain grab instead
                LOG.info("CoreGraphics grab failed (%s), using a plain grab", exc)
                self._cgs, self._mss, self.kind = None, _plain_grab(), "mss"
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
        mons = self._mss.monitors
        k = int(self.display[1:]) if self.display and self.display.startswith("m") else 1
        mon = mons[k] if 0 < k < len(mons) else mons[1]
        shot = np.asarray(self._mss.grab(mon))  # BGRA
        self._last = shot[:, :, 2::-1]
        return self._last


def grid(frame: np.ndarray, w: int = GRID_W, h: int = GRID_H) -> bytes:
    """The screen shrunk to w x h colours, RGB bytes row by row, with black bars left out."""
    H, W = frame.shape[:2]
    sy, sx = _steps(H, W, w, h)
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


# ---------- settings, kept between runs ----------
def config_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP
    return Path(os.environ.get("APPDATA") or Path.home()) / APP


class Settings:
    """settings.json: {"pi": address typed in or None, "last_pi": the address last found, "fps": one of RATES,
    "game": "gentle"|"full"|"pause", "display": the display followed (None: the main one), "display_at": when it
    was picked, in ms, here or in the app}."""
    DEFAULTS = {"pi": None, "last_pi": None, "fps": 20, "game": "gentle", "display": None, "display_at": 0}

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or config_dir() / "settings.json"
        self.data = dict(self.DEFAULTS)
        try:
            self.data.update(json.loads(self.path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass

    def __getitem__(self, k: str):  # noqa: ANN204
        return self.data.get(k, self.DEFAULTS.get(k))

    def update(self, **kw) -> None:  # noqa: ANN003
        self.data.update(kw)
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.data), encoding="utf-8")
        except OSError as exc:
            LOG.warning("could not keep the settings: %s", exc)


# ---------- the connector ----------
def who_am_i() -> dict:
    return {"name": socket.gethostname().split(".")[0][:40], "os": "mac" if sys.platform == "darwin" else
            "windows" if sys.platform == "win32" else sys.platform, "v": VERSION}


class Link:
    """The UDP conversation with the connector: find it, send frames, read what it says back.

    The address is the one typed into Settings, else the one last found (kept between runs), else none until an
    answer to a broadcast names it. Frames go to it whether or not answers are coming back."""

    def __init__(self, pi: Optional[str] = None, last: Optional[str] = None,
                 on_found=None, about=None) -> None:  # noqa: ANN001
        self.fixed = pi
        self.on_found = on_found
        self.about = about  # what else the query says of this computer (its displays), asked each time it is sent
        start = pi or last
        self.addr: Optional[Tuple[str, int]] = (start, PORT) if start else None
        self.state: dict = {}
        self.heard_at = 0.0
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self.sock.settimeout(0.0)
        self.sock.bind(("0.0.0.0", 0))
        self._asked_at = 0.0
        self._told_at = time.monotonic()  # the first query says it all; again TELL_S after that

    def _query(self) -> bytes:
        me = who_am_i()
        if self.about:
            try:
                me.update(self.about())
            except Exception as exc:  # noqa: BLE001
                LOG.debug("about: %s", exc)
        return QUERY + json.dumps(me).encode()

    def set_fixed(self, pi: Optional[str]) -> None:
        self.fixed = pi or None
        if self.fixed:
            self.addr = (self.fixed, PORT)
        self.heard_at = 0.0
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
                if self.fixed and addr[0] != self.fixed:
                    continue  # another connector answering a broadcast: the one typed in is the one
                if self.addr is None or self.addr[0] != addr[0]:
                    LOG.info("found the connector at %s", addr[0])
                    if self.on_found:
                        self.on_found(addr[0])
                self.addr, self.heard_at = (addr[0], PORT), time.monotonic()
        now = time.monotonic()
        if now - self.heard_at > LOST_S and now - self._asked_at > 2:
            self._asked_at = now
            q = self._query()
            if not self.fixed:
                self._send(q, ("255.255.255.255", PORT))
            if self.addr:
                self._send(q, self.addr)
        elif self.addr and now - self._told_at > TELL_S:
            # found: every so often it says again who it is and which displays it has, for the app's picker
            self._told_at = now
            self._send(self._query(), self.addr)

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


# ---------- a game filling the screen (Windows) ----------
def game_in_front() -> bool:
    """Whether the window in front covers its whole monitor and is not the desktop: a game, or a film full screen."""
    if sys.platform != "win32":
        return False
    try:
        from ctypes import wintypes  # noqa: WPS433

        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return False
        cls = ctypes.create_unicode_buffer(64)
        user32.GetClassNameW(hwnd, cls, 64)
        if cls.value in ("Progman", "WorkerW", "Shell_TrayWnd", "Windows.UI.Core.CoreWindow"):
            return False

        class MONITORINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT), ("rcWork", wintypes.RECT),
                        ("dwFlags", wintypes.DWORD)]

        r = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(r))
        mi = MONITORINFO()
        mi.cbSize = ctypes.sizeof(MONITORINFO)
        user32.GetMonitorInfoW(user32.MonitorFromWindow(hwnd, 2), ctypes.byref(mi))
        m = mi.rcMonitor
        return r.left <= m.left and r.top <= m.top and r.right >= m.right and r.bottom >= m.bottom
    except Exception:  # noqa: BLE001
        return False


def run_quietly() -> None:
    """Below normal priority, so a game always comes first."""
    try:
        if sys.platform == "win32":
            k = ctypes.windll.kernel32
            k.SetPriorityClass(k.GetCurrentProcess(), 0x00004000)  # BELOW_NORMAL_PRIORITY_CLASS
        else:
            os.nice(10)
    except Exception as exc:  # noqa: BLE001
        LOG.debug("priority: %s", exc)


# ---------- the loop ----------
class Sync:
    def __init__(self, pi: Optional[str], fps: float, settings: Optional[Settings] = None) -> None:
        self.settings = settings or Settings(Path(os.devnull))
        self.screen = Screen(self.settings["display"])
        self.link = Link(pi or self.settings["pi"], self.settings["last_pi"],
                         on_found=lambda a: self.settings.update(last_pi=a),
                         about=lambda: {"displays": self.screen.displays(), "display": self.screen.display})
        self.fps = fps
        self.paused = False            # paused here, from the tray: no frames, so the connector stops
        self.resume_until = 0.0        # asking the connector to resume its own pause, for a moment
        self.colour = (40, 40, 40)
        self.gaming = False            # a game fills the screen (Windows), and Settings says to go gently or stop
        self.stop = threading.Event()
        self.sent = 0

    def set_display(self, display: Optional[str], at: Optional[float] = None) -> None:
        """Follow this display (None: the main one), picked here or in the app at `at` (ms)."""
        self.screen.use(display)
        self.settings.update(display=display or None, display_at=int(at if at is not None else time.time() * 1000))
        self.link._told_at = 0.0  # noqa: SLF001  (the app hears of it on the next pass)

    def _from_app(self) -> None:
        # the display picked for this computer in the app, when that choice is newer than the last one made here
        want = (self.link.state or {}).get("want_display")
        if not isinstance(want, dict) or not isinstance(want.get("at"), (int, float)):
            return
        if want.get("pc") and want["pc"] != who_am_i()["name"]:
            return
        if want["at"] > (self.settings["display_at"] or 0):
            LOG.info("the app picked display %s", want.get("id"))
            self.set_display(str(want.get("id") or "") or None, want["at"])

    def rate(self) -> float:
        g = game_in_front()
        mode = self.settings["game"]
        self.gaming = g and mode in ("gentle", "pause")
        if g and mode == "pause":
            return 0.0
        if g and mode == "gentle":
            return float(GAME_RATE)
        return float(self.fps)

    def run(self) -> None:
        nxt = time.monotonic()
        rate, rate_at = float(self.fps), 0.0
        found, noted_at, noted_sent = False, nxt, 0
        while not self.stop.is_set():
            now = time.monotonic()
            if now - rate_at > 2:  # what is in front is looked at every two seconds, not every frame
                rate, rate_at = self.rate(), now
            self.link.tick()
            self._from_app()
            # the log says when the connector stops answering and when it is back, and every ten minutes how it is
            # going, so a run that ends without a word still shows what it was doing up to then
            if self.link.found != found:
                found = self.link.found
                if found or self.link.addr:
                    LOG.info("the connector %s", "is answering" if found else f"stopped answering ({self.link.addr[0]})")
            if now - noted_at >= 600:
                LOG.info("running: %d frames in %.0f min, %s a second, memory peak %s", self.sent - noted_sent,
                         (now - noted_at) / 60, f"{rate:.0f}", memory_peak())
                noted_at, noted_sent = now, self.sent
            # (a Mac that has not allowed Screen Recording shows only the desktop picture: nothing is sent from it)
            if rate > 0 and not self.paused and screen_allowed():
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
                    self.sent += 1
            nxt += 1 / (rate or 2)
            time.sleep(max(0.0, nxt - time.monotonic()))
            if time.monotonic() - nxt > 1:
                nxt = time.monotonic()  # the PC slept: start the beat again rather than catch up

    def resume_room(self) -> None:
        self.paused = False
        self.resume_until = time.monotonic() + 1.0

    def status_line(self) -> str:
        if not screen_allowed():
            return "Allow Screen Recording in System Settings"
        if self.paused:
            return "Paused"
        if self.gaming and self.settings["game"] == "pause":
            return "Paused while a game is full screen"
        if not self.link.found:
            if self.link.addr:
                return f"Sending to {self.link.addr[0]}, no answer yet"
            return "Looking for the connector"
        s = self.link.state or {}
        room = s.get("room_name") or "No room"
        state = s.get("state")
        if state == "off":
            return "Choose a room in the app"
        if state == "syncing":
            return f"{room} · following" + (" gently" if self.gaming else "")
        if state == "paused":
            return f"{room} · paused"
        if state == "problem":
            return f"{room} · {s.get('why') or 'not following'}"
        return f"{room} · starting"

    def positions_url(self) -> Optional[str]:
        s = self.link.state or {}
        if not s.get("app_url") or not s.get("room"):
            return None
        return f"{s['app_url']}#room/{s['room']}/screen"


# ---------- what the log keeps ----------
def peak_mb() -> Optional[float]:
    """The most memory this run has held, in MB (a Mac or Linux; None on Windows)."""
    try:
        import resource  # noqa: WPS433

        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return peak / (1 << 20 if sys.platform == "darwin" else 1 << 10)
    except Exception:  # noqa: BLE001
        return None


def memory_peak() -> str:
    mb = peak_mb()
    return "unknown" if mb is None else f"{mb:.0f} MB"


def crash_summary(text: str, app: str = APP) -> Optional[str]:
    """One line from a macOS crash report (.ips): how the app ended and where. A JetsamEvent report (macOS
    stopping apps for memory) counts only when it names this app. None when it is not about this app."""
    head, _, body = text.partition("\n")
    try:
        h, b = json.loads(head), json.loads(body)
    except ValueError:
        return None
    if h.get("bug_type") == "298" or "processes" in b:  # a JetsamEvent
        for proc in b.get("processes") or []:
            if proc.get("name") == app and proc.get("reason"):
                return f"macOS stopped it for memory ({proc['reason']}, {proc.get('rpages', 0) * 16 // 1024} MB)"
        return None
    if h.get("app_name") != app and b.get("procName") != app:
        return None
    exc = b.get("exception") or {}
    parts = [" ".join(str(exc[k]) for k in ("type", "signal") if exc.get(k))]
    term = b.get("termination") or {}
    if term.get("indicator"):
        parts.append(str(term["indicator"]))
    for v in (b.get("asi") or {}).values():
        parts.append(" ".join(map(str, v)) if isinstance(v, list) else str(v))
    images = [i.get("name", "?") for i in b.get("usedImages") or []]
    threads = b.get("threads") or []
    n = b.get("faultingThread", 0)
    if 0 <= n < len(threads):
        frames = []
        for fr in (threads[n].get("frames") or [])[:8]:
            i = fr.get("imageIndex", -1)
            frames.append(f"{images[i] if 0 <= i < len(images) else '?'}:{fr.get('symbol', '?')}")
        parts.append("thread %d%s: %s" % (n, f" ({threads[n]['name']})" if threads[n].get("name") else "",
                                          " < ".join(frames)))
    return " · ".join(p for p in parts if p)


def report_earlier_crashes(logdir: Path) -> None:
    """Puts what macOS recorded about this app's earlier crashes into the log, once each, so the log alone says
    how a run ended."""
    seen_file = logdir / "reports_seen.txt"
    try:
        seen = set(seen_file.read_text().split())
    except OSError:
        seen = set()
    new = []
    for d in (Path.home() / "Library" / "Logs" / "DiagnosticReports", Path("/Library/Logs/DiagnosticReports")):
        try:
            files = [f for f in d.iterdir() if f.suffix == ".ips" and f.name.startswith((APP, "JetsamEvent"))
                     and time.time() - f.stat().st_mtime < 7 * 86400 and f.name not in seen]
        except OSError:
            continue
        for f in sorted(files, key=lambda f: f.stat().st_mtime):
            new.append(f.name)
            try:
                line = crash_summary(f.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
            if line:
                LOG.info("an earlier run ended (%s): %s", f.name, line)
    if new:
        try:
            seen_file.write_text("\n".join(sorted(seen | set(new))))
        except OSError:
            pass


# ---------- a Mac's Screen Recording permission ----------
_allowed: Optional[bool] = None
_asked = False
_checked_at = 0.0


def screen_allowed() -> bool:
    """Whether macOS lets this app see other windows (always true elsewhere). The system's prompt is asked for once;
    until it is allowed the answer is looked at again every few seconds, since a newer macOS says so without the
    app being reopened. Once allowed it stays allowed for the run."""
    global _allowed, _asked, _checked_at
    if sys.platform != "darwin" or _allowed:
        return True if sys.platform != "darwin" else bool(_allowed)
    now = time.monotonic()
    if _allowed is not None and now - _checked_at < 5:
        return False
    _checked_at = now
    try:
        import objc  # noqa: WPS433
        import Quartz  # noqa: WPS433

        with objc.autorelease_pool():  # (asked from the capture thread too, which has no pool of its own)
            _allowed = bool(Quartz.CGPreflightScreenCaptureAccess())
            if not _allowed and not _asked:
                _asked = True
                Quartz.CGRequestScreenCaptureAccess()  # the system's own prompt, the first time
        if _allowed:
            LOG.info("Screen Recording is allowed")
    except Exception:  # noqa: BLE001  an older macOS without the call asks by itself on the first grab
        _allowed = True
    return bool(_allowed)


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


# ---------- Settings: a small window, a page served on 127.0.0.1 ----------
# A page rather than a native window: the tray owns the main thread (on a Mac it has to), and two toolkits cannot
# share it. The address carries a random token made for the run, so nothing but this program's own window can change
# a setting.
PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Caseta screen sync</title>
<style>
:root { color-scheme: dark; --bg:#101719; --card:#182225; --inset:#202C2F; --line:#2A3639; --ink:#EEF2EF; --ink2:#93A09D;
  --tide:#2FA59C; --amber:#F4A53C; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font: 15px/1.4 -apple-system, "Segoe UI", system-ui, sans-serif; }
main { padding: 20px 16px 24px; max-width: 460px; margin: 0 auto; }
h1 { font-size: 22px; font-weight: 500; margin: 0 0 4px; }
#state { color: var(--ink2); margin: 0 0 18px; min-height: 21px; }
.card { background: var(--card); border-radius: 18px; margin-bottom: 12px; overflow: hidden; }
.row { display:flex; align-items:center; gap:12px; padding: 14px 16px; border-top: 1px solid var(--line); }
.row:first-child { border-top: 0; }
.row .t { flex:1; }
.row .d { display:block; color: var(--ink2); font-size: 13px; }
button.big { width:100%; border:0; border-radius: 999px; padding: 14px; font: inherit; font-weight: 500;
  background: var(--amber); color: #2B1A0B; cursor: pointer; margin-bottom: 12px; }
button.big:disabled { background: var(--inset); color: var(--ink2); cursor: default; }
button.ghost { background: none; border: 1px solid var(--line); color: var(--ink); border-radius: 999px;
  padding: 8px 14px; font: inherit; cursor: pointer; }
select, input[type=text] { background: var(--inset); color: var(--ink); border: 1px solid var(--line);
  border-radius: 10px; padding: 8px 10px; font: inherit; }
input[type=text] { width: 150px; }
.sw { appearance:none; width:46px; height:28px; border-radius:14px; background:var(--inset); position:relative;
  cursor:pointer; flex:none; margin:0; }
.sw::after { content:""; position:absolute; left:3px; top:3px; width:22px; height:22px; border-radius:50%;
  background: var(--ink2); transition: transform .2s; }
.sw:checked { background: var(--tide); }
.sw:checked::after { transform: translateX(18px); background: #fff; }
.hide { display:none; }
</style></head><body><main>
<h1>Screen sync</h1>
<p id="state"></p>
<button class="big" id="positions" disabled>Light positions</button>
<div class="card">
  <div class="row"><span class="t">Follow the screen</span><input type="checkbox" class="sw" id="follow"></div>
  <div class="row hide" id="displayrow"><span class="t">Display</span><select id="display"></select></div>
  <div class="row"><span class="t">Smoothness</span>
    <select id="fps"><option value="12">12 a second</option><option value="20">20 a second</option><option value="30">30 a second</option><option value="60">60 a second</option><option value="120">120 a second</option><option value="240">240 a second</option></select></div>
  <div class="row win"><span class="t">While a game is full screen</span>
    <select id="game"><option value="gentle">Follow gently</option><option value="full">Keep up</option><option value="pause">Pause</option></select></div>
</div>
<div class="card">
  <div class="row"><span class="t">Pi's address<span class="d" id="found"></span></span>
    <input type="text" id="pi" placeholder="Find it" spellcheck="false" autocomplete="off"></div>
  <div class="row"><span class="t" id="loginlabel">Open at login</span><input type="checkbox" class="sw" id="login"></div>
</div>
<script>
const base = location.pathname.replace(/[^/]*$/, '');
const $ = id => document.getElementById(id);
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json()).then(show);
let editing = false;
function show(s) {
  $('state').textContent = s.status;
  $('positions').disabled = !s.positions;
  $('follow').checked = !s.paused;
  $('fps').value = String(s.fps);
  const ds = s.displays || [];
  $('displayrow').classList.toggle('hide', ds.length < 2);
  const opts = ds.map(d => d.id + '|' + d.name).join(';');
  if ($('display').dataset.opts !== opts) {
    $('display').dataset.opts = opts;
    $('display').replaceChildren(...ds.map(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.name + (d.main ? ' (main)' : ''); return o; }));
  }
  $('display').value = s.display || (ds.find(d => d.main) || ds[0] || {}).id || '';
  $('game').value = s.game;
  if (!editing) $('pi').value = s.pi || '';
  $('found').textContent = s.pi ? '' : (s.found ? 'Found at ' + s.found : 'Leave empty to find it');
  $('login').checked = s.login;
  $('loginlabel').textContent = s.os === 'mac' ? 'Open at login' : 'Start with Windows';
  for (const el of document.querySelectorAll('.win')) el.classList.toggle('hide', s.os !== 'windows');
}
const load = () => fetch(base + 'state').then(r => r.json()).then(show).catch(() => {});
$('positions').onclick = () => post('positions');
$('follow').onchange = e => post('set', { paused: !e.target.checked });
$('fps').onchange = e => post('set', { fps: Number(e.target.value) });
$('game').onchange = e => post('set', { game: e.target.value });
$('display').onchange = e => post('set', { display: e.target.value });
$('login').onchange = e => post('set', { login: e.target.checked });
$('pi').onfocus = () => { editing = true; };
$('pi').onchange = e => { editing = false; post('set', { pi: e.target.value.trim() }); };
load(); setInterval(load, 2000);
</script></main></body></html>"""


class SettingsPage:
    def __init__(self, sync: Sync) -> None:
        self.sync = sync
        self.token = secrets.token_urlsafe(12)
        self.url: Optional[str] = None

    def state(self) -> dict:
        s = self.sync
        return {"status": s.status_line(), "paused": s.paused, "fps": int(s.fps), "game": s.settings["game"],
                "pi": s.settings["pi"], "found": s.link.addr[0] if s.link.addr else None, "login": starts_at_login(),
                "os": who_am_i()["os"], "positions": bool(s.positions_url()),
                "displays": s.screen.displays(), "display": s.screen.display or ""}

    def change(self, body: dict) -> None:
        s = self.sync
        if "paused" in body:
            if body["paused"]:
                s.paused = True
            else:
                s.resume_room()
        if body.get("fps") in RATES:
            s.fps = float(body["fps"])
            s.settings.update(fps=int(body["fps"]))
        if body.get("game") in ("gentle", "full", "pause"):
            s.settings.update(game=body["game"])
        if "display" in body:
            d = str(body["display"] or "")
            if not d or d in {x["id"] for x in s.screen.displays()}:
                s.set_display(d or None)
        if "pi" in body:
            pi = str(body["pi"] or "").strip()
            if pi and not all(c.isalnum() or c in ".-:" for c in pi):
                pi = ""
            s.settings.update(pi=pi or None)
            s.link.set_fixed(pi or None)
        if "login" in body:
            set_starts_at_login(bool(body["login"]))

    def start(self) -> str:
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer  # noqa: WPS433

        page = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a) -> None:  # noqa: ANN002
                pass

            def _send(self, code: int, body: bytes, ctype: str) -> None:
                self.send_response(code)
                self.send_header("content-type", ctype)
                self.send_header("cache-control", "no-store")
                self.end_headers()
                self.wfile.write(body)

            def _path(self) -> Optional[str]:
                pre = f"/{page.token}/"
                return self.path[len(pre):] if self.path.startswith(pre) else None

            def do_GET(self) -> None:  # noqa: N802
                p = self._path()
                if p == "":
                    self._send(200, PAGE.encode(), "text/html; charset=utf-8")
                elif p == "state":
                    self._send(200, json.dumps(page.state()).encode(), "application/json")
                else:
                    self._send(404, b"", "text/plain")

            def do_POST(self) -> None:  # noqa: N802
                p = self._path()
                n = int(self.headers.get("content-length") or 0)
                try:
                    body = json.loads(self.rfile.read(min(n, 4096)) or b"{}")
                except ValueError:
                    body = {}
                if p == "set":
                    page.change(body)
                elif p == "positions":
                    url = page.sync.positions_url()
                    if url:
                        open_window(url, (420, 860))
                else:
                    self._send(404, b"", "text/plain")
                    return
                self._send(200, json.dumps(page.state()).encode(), "application/json")

        srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{srv.server_address[1]}/{self.token}/"
        return self.url


def open_window(url: str, size: Tuple[int, int] = (400, 620)) -> None:
    """A page in a small window of its own where a browser can do that (Edge on Windows, Chrome or Edge on a Mac),
    otherwise in the default browser."""
    import subprocess  # noqa: WPS433
    import webbrowser  # noqa: WPS433

    args = [f"--app={url}", f"--window-size={size[0]},{size[1]}"]
    try:
        if sys.platform == "win32":
            for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
                for exe in (Path(base or "") / "Microsoft" / "Edge" / "Application" / "msedge.exe",
                            Path(base or "") / "Google" / "Chrome" / "Application" / "chrome.exe"):
                    if base and exe.exists():
                        subprocess.Popen([str(exe), *args])  # noqa: S603
                        return
        elif sys.platform == "darwin":
            for app in ("Google Chrome", "Microsoft Edge", "Brave Browser"):
                if Path(f"/Applications/{app}.app").exists():
                    subprocess.Popen(["/usr/bin/open", "-na", app, "--args", *args])  # noqa: S603
                    return
    except Exception as exc:  # noqa: BLE001
        LOG.info("app window: %s", exc)
    webbrowser.open(url)


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


def tray(sync: Sync, page: SettingsPage, open_now: bool = False) -> None:
    import pystray  # noqa: WPS433
    from PIL import Image, ImageDraw  # noqa: WPS433

    # One still picture: a monitor. Nothing on the tray changes but the menu's words, and those only when they do.
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((4, 12, 60, 46), radius=6, outline=(238, 242, 239, 255), width=4)
    d.rectangle((26, 46, 38, 54), fill=(238, 242, 239, 255))
    d.rectangle((18, 54, 46, 58), fill=(238, 242, 239, 255))

    def settings(icon, item):  # noqa: ANN001, ARG001
        open_window(page.url or "")

    def positions(icon, item):  # noqa: ANN001, ARG001
        url = sync.positions_url()
        if url:
            open_window(url, (420, 860))

    def toggle_pause(icon, item):  # noqa: ANN001, ARG001
        if sync.paused or (sync.link.state or {}).get("state") == "paused":
            sync.resume_room()
        else:
            sync.paused = True

    def quit_(icon, item):  # noqa: ANN001, ARG001
        sync.stop.set()
        icon.stop()

    # The displays, looked up every two seconds off the main thread (refresh, below) so the menu never waits on them:
    # with more than one, a Display submenu picks which the lights follow.
    shown: List[dict] = []

    def following() -> Optional[str]:
        ids = [x["id"] for x in shown]
        want = sync.settings["display"]
        return want if want in ids else next((x["id"] for x in shown if x["main"]), ids[0] if ids else None)

    def pick(did: str):  # noqa: ANN202
        def go(icon, item) -> None:  # noqa: ANN001, ARG001
            sync.set_display(did)
            icon.update_menu()
        return go

    def display_items():  # noqa: ANN202
        return [pystray.MenuItem(x["name"], pick(x["id"]), checked=lambda item, i=x["id"]: following() == i, radio=True)
                for x in shown]

    paused = lambda item: sync.paused or (sync.link.state or {}).get("state") == "paused"  # noqa: E731
    menu = pystray.Menu(
        pystray.MenuItem(lambda item: sync.status_line(), None, enabled=False),
        pystray.MenuItem("Settings", settings, default=True),
        pystray.MenuItem("Display", pystray.Menu(display_items), visible=lambda item: len(shown) > 1),
        pystray.MenuItem("Light positions", positions, enabled=lambda item: bool(sync.positions_url())),
        pystray.MenuItem(lambda item: "Resume" if paused(item) else "Pause", toggle_pause),
        pystray.MenuItem("Quit", quit_),
    )
    icon = pystray.Icon(APP, img, "Caseta screen sync", menu)

    def refresh() -> None:
        last = None
        while not sync.stop.is_set():
            ds = sync.screen.displays()
            line = (sync.status_line(), json.dumps(ds), sync.settings["display"])
            if line != last:
                last = line
                shown[:] = ds

                def update(line=line[0]) -> None:  # noqa: ANN001
                    icon.title = f"Caseta screen sync · {line}"
                    icon.update_menu()
                on_main(update)
            time.sleep(2)

    threading.Thread(target=sync.run, daemon=True).start()
    threading.Thread(target=refresh, daemon=True).start()
    if open_now:
        threading.Timer(1.0, lambda: open_window(page.url or "")).start()
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
    # then 300 more looks, as a few seconds of following would: memory has to stay where it was
    before, t1 = peak_mb(), time.perf_counter()
    for _ in range(300):
        grid(s.grab())
    after, each = peak_mb(), (time.perf_counter() - t1) / 300 * 1000
    grew = None if before is None or after is None else round(after - before, 1)
    print(json.dumps({"capture": s.kind, "displays": s.displays(), "sample": list(f.shape), "grid": [GRID_W, GRID_H],
                      "average": [int(v) for v in a], "ms": round(t, 1), "ms_each": round(each, 2),
                      "memory_mb": None if after is None else round(after), "memory_grew_mb": grew}),
          file=out, flush=True)
    return 1 if grew is not None and grew > 100 else 0


def main() -> int:
    ap = argparse.ArgumentParser(prog="screensync", description="Shows this PC's screen colours to the Caseta connector.")
    ap.add_argument("--pi", help="the connector's address, when it cannot be found by itself")
    ap.add_argument("--fps", type=float, help="how many times a second to look at the screen (Settings' choice, else 20)")
    ap.add_argument("--settings", action="store_true", help="open Settings once it is running")
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

    crash = open(logdir / "crash.txt", "a", encoding="utf-8")  # noqa: SIM115  (open for the run)
    crash.write(f"\n{time.strftime('%Y-%m-%d %H:%M:%S')} screen sync {VERSION} started\n")
    crash.flush()
    faulthandler.enable(file=crash)
    if hasattr(faulthandler, "register"):
        import signal  # noqa: WPS433

        faulthandler.register(signal.SIGTERM, file=crash, chain=True)  # told to stop by the system: say where it was
    sys.excepthook = lambda t, v, tb: LOG.error("stopped by an error", exc_info=(t, v, tb))
    threading.excepthook = lambda a: LOG.error("a thread stopped: %s", a.exc_value, exc_info=(a.exc_type, a.exc_value, a.exc_traceback))
    # one copy at a time: a second one exits quietly
    lock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        lock.bind(("127.0.0.1", PORT + 1))
    except OSError:
        LOG.info("already running")
        return 0
    if sys.platform == "darwin":
        report_earlier_crashes(logdir)
    screen_allowed()  # on a Mac, ask for Screen Recording now, while the app is in front
    run_quietly()
    settings = Settings()
    sync = Sync(args.pi, max(5.0, min(240.0, args.fps or float(settings["fps"]))), settings)
    page = SettingsPage(sync)
    page.start()
    LOG.info("screen sync %s started (%s, %.0f a second, connector %s)", VERSION, sync.screen.kind, sync.fps,
             sync.link.addr[0] if sync.link.addr else "to be found")
    if args.no_tray:
        try:
            sync.run()
        except KeyboardInterrupt:
            pass
        return 0
    tray(sync, page, open_now=args.settings)
    LOG.info("quit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
