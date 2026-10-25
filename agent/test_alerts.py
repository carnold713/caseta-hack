"""Calls and texts on the lights (alerts.py), against a pretend Hue bridge (its streaming port played by OpenSSL's own
DTLS server, as test_screensync.py does), a pretend Nanoleaf (its stream caught on a local port) and a pretend
Lutron bridge. It checks:
  * the patterns: what the streams show and what the commands say agree, keyframe by keyframe;
  * the Hue colour lights of an alert go into one stream, through an area made for them, and every frame gives them
    the same colour: they change together;
  * the Nanoleaf is streamed the same colour on the same beat, and put back to its own effect afterwards;
  * a Lutron dimmer and a Hue white bulb are sent each step a moment before the beat, brightness only, on the same
    clock as the streams;
  * afterwards every light is back as it was: the stream stopped first, then each Hue lamp, the dimmer's level;
  * a text during a call shows over it, and the call carries on after; stop ends the call;
  * "only lights that are on" leaves an off lamp alone;
  * a person's command for a light ends the alert first and leaves that light as the command leaves it;
  * a light following the PC's screen is shown through screen sync's own stream (its overlay), and the overlay goes;
Needs pyOpenSSL and the openssl command for the stream; says so and checks the rest without them.
Run: python test_alerts.py
"""
import asyncio
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="alerts-"))

import alerts as A  # noqa: E402
import screensync as S  # noqa: E402

FAILS = []
PSK = "00112233445566778899aabbccddeeff"


def check(name, ok, got=None):
    print(f"{'ok  ' if ok else 'FAIL'} {name}" + ('' if ok else f': {got!r}'))
    if not ok:
        FAILS.append(name)


def free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "test_screensync.py")).read()
ns = {"PSK": PSK}
exec(src[src.index("class FakeHue"):src.index("def frames_from")], ns)
exec(src[src.index("def frames_from"):src.index("async def main")], ns)
frames_from = ns["frames_from"]
lsrc = open(os.path.join(here, "test_screenlayout.py")).read()
exec(lsrc[lsrc.index("class FakeNanoleaf"):lsrc.index("def nano_frames")], ns)


class FakeHue(ns["FakeHue"]):
    """The screen sync test's bridge, with what an alert asks of it besides: lamp states and the paced queue."""

    def __init__(self):
        super().__init__()
        self.devices["hue_a"].update({"type": "HueLight", "_on": True, "_bri": 40.0, "current_state": 40, "color_mode": "ct",
                                      "ct": {"min": 153, "max": 500, "mirek": 370}, "color": {"gamut": None, "xy": [0.4, 0.4]}})
        self.devices["hue_b"].update({"type": "HueLight", "_on": False, "_bri": 80.0, "current_state": 0, "color_mode": "xy",
                                      "ct": None, "color": {"gamut": None, "xy": [0.3, 0.3]}})
        self.devices["hue_w"].update({"type": "HueLight", "_on": True, "_bri": 60.0, "current_state": 60, "color_mode": "ct",
                                      "ct": {"min": 153, "max": 454, "mirek": 300}})
        self.lamp = []   # (time, light, body): what each lamp was sent, the queue's way or straight

    async def _put(self, path, body):
        if "/light/" in path:
            self.lamp.append((time.monotonic(), path.rsplit("/", 1)[1], body))
        return await super()._put(path, body)

    async def _put_light(self, d, body):
        self.lamp.append((time.monotonic(), self.devices[d]["zone"], body))


class FakeLutron:
    def __init__(self):
        self.devices = {"5": {"name": "Desk", "type": "WallDimmer", "current_state": 30},
                        "6": {"name": "Fan", "type": "FanSpeedController", "current_state": 0},
                        "7": {"name": "Porch", "type": "WallSwitch", "current_state": 0}}
        self.sets = []

    async def set_value(self, d, value, fade_time=None):
        self.sets.append((time.monotonic(), d, value, fade_time.total_seconds() if fade_time is not None else None))


class FakeSync:
    def __init__(self, streaming=()):
        self.lights = set(streaming)
        self.streaming = bool(streaming)
        self.overlay = {}

    def owns(self, d):
        return d in self.lights


def nano_frames(sock):
    out = []
    while True:
        try:
            data = sock.recv(4096)
        except BlockingIOError:
            return out
        n = struct.unpack(">H", data[:2])[0]
        out.append({struct.unpack(">H", data[2 + 8 * k:4 + 8 * k])[0]: tuple(v / 255 for v in data[4 + 8 * k:7 + 8 * k]) for k in range(n)})


async def main():
    red, blue = "#ff0000", "#0000ff"

    # ----- the patterns: the commands land where the streams are -----
    for p in A.PATTERNS:
        ev = A.events(p)
        ok = True
        for _ in range(6):
            t, ci, b, fade = next(ev)
            if t > 100:
                break
            col, bri = A.at(p, [red, blue], t + fade + 1e-6 if fade else t + 1e-6)
            ok = ok and abs(bri - b) < 0.02 and col == [red, blue][ci]
        check(f"{p}: the commands agree with the stream", ok)
    check("flash: on, then off", A.at("flash", [red], 0.1) == (red, 1.0) and A.at("flash", [red], 0.5) == (red, 0.0))
    check("alternate: both colours", A.at("alternate", [red, blue], 0.1)[0] == red and A.at("alternate", [red, blue], 0.7)[0] == blue)
    lows = [A.at("breathe", [red], t / 20)[1] for t in range(40)]
    check("breathe swells and falls but never goes out", min(lows) >= A.LOW - 1e-9 and max(lows) > 0.99, (min(lows), max(lows)))

    have_ssl = True
    try:
        import OpenSSL  # noqa: F401
    except ImportError:
        have_ssl = False
    if not shutil.which("openssl"):
        have_ssl = False

    # ----- a text on everything: Hue colour lamps streamed, a white bulb, a dimmer and a Nanoleaf -----
    hue, lut, nl = FakeHue(), FakeLutron(), ns["FakeNanoleaf"]()
    srv = None
    sport = free_port()
    out = None
    if have_ssl:
        out = open(os.path.join(os.environ["DATA_DIR"], "dtls.out"), "wb")
        srv = subprocess.Popen(["openssl", "s_server", "-dtls1_2", "-nocert", "-psk", PSK, "-psk_identity", "appid-123",
                                "-cipher", "PSK-AES128-GCM-SHA256", "-accept", str(sport), "-quiet"],
                               stdin=subprocess.PIPE, stdout=out, stderr=subprocess.DEVNULL)
        await asyncio.sleep(0.6)
    else:
        print("pyOpenSSL or openssl missing: the Hue stream is not tried, its lamps fall back to commands")
        hue.clientkey = None
    nport = free_port()
    nsock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    nsock.bind(("127.0.0.1", nport))
    nsock.setblocking(False)
    al = A.Alerts(hue, FakeSync(), nanoleaf=nl, lutron=lambda: lut, stream_port=sport, nano_port=nport)
    try:
        got = await al.start({"id": "text:1", "lights": ["hue_a", "hue_b", "hue_w", "5", "6", "7", "nanoleaf_N1", "hue_nope"],
                              "pattern": "flash", "colors": [red], "seconds": 1.6})
        check("an alert takes the lights it can show on: Hue, Nanoleaf, a Lutron dimmer; not a fan or a switch", got == {"lights": 5}, got)
        await asyncio.sleep(0.9)
        how = dict(al._lights)
        if have_ssl:
            check("the Hue colour lamps are streamed, together", how.get("hue_a") == "stream" and how.get("hue_b") == "stream", how)
            check("through an area made for them", any((b.get("metadata") or {}).get("name") == A.AREA_NAME for _p, b in hue.posts), hue.posts)
        check("the white bulb and the dimmer are sent commands, the Nanoleaf streamed", how.get("hue_w") == "hue" and how.get("5") == "lutron" and how.get("nanoleaf_N1") == "nano", how)
        check("the lights it holds are not news meanwhile", al.owns("hue_a") and al.owns("5"))
        await asyncio.sleep(1.4)
        check("and it ends", al.status() == {"playing": [], "lights": []} and not al.owns("5"), al.status())

        if have_ssl:
            out.flush()
            msgs = [m for m in frames_from(open(out.name, "rb").read()) if m]
            check("the stream arrived", len(msgs) > 30, len(msgs))
            same = all(len(set(m.values())) == 1 for m in msgs)
            check("every frame gives the lamps the same colour", same, [m for m in msgs if len(set(m.values())) != 1][:2])
            lit = [m for m in msgs if max(next(iter(m.values()))) > 0.5]
            dark = [m for m in msgs if max(next(iter(m.values()))) < 0.05]
            check("red and dark in turn", lit and dark and all(v[0] > 0.9 and v[2] < 0.05 for m in lit for v in m.values()), (len(lit), len(dark)))
        nf = [f for f in nano_frames(nsock) if f]
        check("the Nanoleaf's panels are streamed the same red and dark", any(all(v[0] > 0.9 for v in f.values()) for f in nf) and any(all(max(v) < 0.05 for v in f.values()) for f in nf), len(nf))
        check("and it goes back to its own effect", ("effects", {"select": "Northern Lights"}) in nl.puts, nl.puts[-4:])

        # the dimmer and the white bulb, on the beat: steps 0.35 apart, each sent its lead early
        sets = [s for s in lut.sets if s[1] == "5"]
        steps = [(t, v) for t, _d, v, _f in sets]
        levels = [v for _t, v in steps[:-1]]
        check("the dimmer flashes full and off", levels[:4] == [100, 0, 100, 0], levels)
        gaps = [b[0] - a[0] for a, b in zip(steps[:4], steps[1:4])]
        check("on the beat, 0.35 s apart", all(abs(g - 0.35) < 0.06 for g in gaps), gaps)
        check("the dimmer goes back to 30", steps[-1][1] == 30 and sets[-1][3] == 0.4, sets[-1])
        w = [(t, b) for t, z, b in hue.lamp if z == "light-w"]
        check("the white bulb flashes without colour", any(b.get("on") == {"on": False} for _t, b in w) and all("color" not in b for _t, b in w), w[:3])
        if steps and w:
            lag = (w[0][0] - steps[0][0])
            check("the bulb's first step and the dimmer's are a lead apart, not a step", abs(lag - (A.LEAD_S["lutron"] - A.LEAD_S["hue"])) < 0.06, lag)
        check("the white bulb is back to its white", w[-1][1].get("color_temperature") == {"mirek": 300} and w[-1][1]["dimming"]["brightness"] == 60, w[-1])
        back = {z: b for _t, z, b in hue.lamp[-6:]}
        if have_ssl:
            stop_i = max(i for i, (p, b) in enumerate(hue.puts) if b == {"action": "stop"})
            check("the stream is stopped before the lamps are put back", stop_i >= 0)
        a_back = [b for _t, z, b in hue.lamp if z == "light-a"][-1:]
        check("a lamp that was on goes back to its white at 40", a_back and a_back[0].get("color_temperature") == {"mirek": 370} and a_back[0]["dimming"]["brightness"] == 40, a_back)
        b_back = [b for _t, z, b in hue.lamp if z == "light-b"][-2:]
        check("a lamp that was off gets its colour back, then goes off", len(b_back) == 2 and b_back[0].get("color") == {"xy": {"x": 0.3, "y": 0.3}} and b_back[1].get("on") == {"on": False}, b_back)
    finally:
        if srv:
            srv.kill()
        nsock.close()

    # ----- a call, a text over it, stop -----
    hue, lut = FakeHue(), FakeLutron()
    hue.clientkey = None   # commands this time: easier to read
    al = A.Alerts(hue, FakeSync(), lutron=lambda: lut)
    await al.start({"id": "call:1", "lights": ["5"], "pattern": "glow", "colors": ["#00ff00"], "seconds": 60})
    await asyncio.sleep(0.5)
    await al.start({"id": "text:2", "lights": ["5"], "pattern": "flash", "colors": [red], "seconds": 0.8})
    await asyncio.sleep(0.4)
    check("a text shows over a call", al.status()["playing"] == ["call:1", "text:2"], al.status())
    await asyncio.sleep(1.0)
    check("and the call carries on after it", al.status()["playing"] == ["call:1"] and al.owns("5"), al.status())
    n = len(lut.sets)
    check("stop ends a call", (await al.stop("call:1")) == {"stopped": True})
    await asyncio.sleep(0.3)
    check("and the dimmer is put back", lut.sets[-1][2] == 30 and not al.owns("5"), lut.sets[n:])
    check("stopping one that is not playing says so", (await al.stop("call:9")) == {"stopped": False})

    # ----- only lights that are on -----
    hue = FakeHue()
    hue.clientkey = None
    al = A.Alerts(hue, FakeSync(), lutron=lambda: FakeLutron())
    got = await al.start({"id": "t", "lights": ["hue_a", "hue_b"], "pattern": "glow", "colors": [red], "seconds": 0.4, "only_on": True})
    await asyncio.sleep(0.8)
    check("only lights that are on: the off lamp is left alone", got["lights"] == 1 and not [1 for _t, z, _b in hue.lamp if z == "light-b"], got)

    # ----- a person's command -----
    hue, lut = FakeHue(), FakeLutron()
    hue.clientkey = None
    al = A.Alerts(hue, FakeSync(), lutron=lambda: lut)
    await al.start({"id": "call:3", "lights": ["5", "hue_w"], "pattern": "flash", "colors": [red], "seconds": 60})
    await asyncio.sleep(0.6)
    await al.yield_for("5")
    n = len(lut.sets)
    await asyncio.sleep(0.4)
    check("a person's command ends it first", not al.owns("5") and al.status()["playing"] == [], al.status())
    check("and that light is left as the command leaves it", len(lut.sets) == n, lut.sets[n:])
    check("the others go back", [b for _t, z, b in hue.lamp if z == "light-w"][-1].get("color_temperature") == {"mirek": 300})

    # ----- a light following the PC's screen -----
    hue = FakeHue()
    sync = FakeSync(streaming=["hue_a"])
    al = A.Alerts(hue, sync)
    await al.start({"id": "t4", "lights": ["hue_a"], "pattern": "flash", "colors": [red], "seconds": 0.8})
    await asyncio.sleep(0.4)
    f = sync.overlay.get("hue_a")
    check("a light following the screen is shown through screen sync's stream", callable(f) and al._lights.get("hue_a") == "overlay")
    if f:
        o = f(time.monotonic())
        check("in the alert's colour", o[0] > 0.9 or max(o) == 0, o)
    await asyncio.sleep(0.8)
    check("sent no commands, and the screen gets it back", not hue.lamp and "hue_a" not in sync.overlay, (hue.lamp, sync.overlay))

    # the stream itself takes the overlay in place of the screen, at full brightness whatever the gain
    ss = S.ScreenSync(None, room_lights=lambda r: [], config=lambda: {}, send=lambda m: None)
    ss._chan_light, ss._gains = {3: "hue_A"}, {"hue_A": 0.5}
    check("the screen's colour, at its brightness", ss._sent(("h", 3), (0.0, 0.0, 1.0)) == (0.0, 0.0, S._enc(0.5)))
    ss.overlay["hue_A"] = lambda now: (1.0, 0.0, 0.0)
    o = ss._sent(("h", 3), (0.0, 0.0, 1.0))
    check("an alert's colour in its place", abs(o[0] - 1) < 1e-9 and o[1] == 0 and o[2] == 0, o)


asyncio.run(main())
print("ALL OK" if not FAILS else f"{len(FAILS)} FAILED")
sys.exit(1 if FAILS else 0)
