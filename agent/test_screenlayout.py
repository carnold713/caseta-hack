"""Screen sync with lights placed by hand, and a Nanoleaf beside the Hue light bars (screensync.py, nanostream.py).

The Hue side runs against OpenSSL's own DTLS server as in test_screensync.py; the Nanoleaf side against a pretend
controller (its API calls recorded, its UDP stream caught on a local port). A pretend PC shows a screen red on the
left and blue on the right. It checks:
  * a Nanoleaf placed to the right of the screen shows blue, and dragged to the left it turns red, while streaming;
  * its panels take their own colours: placed at the middle, its left panel is redder than its right;
  * a Hue light left out stops following and the rest carry on, through an area holding just them;
  * the Nanoleaf asks for the streaming effect at full brightness, and is put back to its own effect afterwards;
  * the positions the app is told match the settings, with defaults for lights that have none.
Run: python test_screenlayout.py
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

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="layout-"))

import screensync as S  # noqa: E402

FAILS = []
PSK = "00112233445566778899aabbccddeeff"


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


def free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_screensync.py")).read()
ns = {"PSK": PSK}
exec(src[src.index("class FakeHue"):src.index("def frames_from")], ns)
exec(src[src.index("def frames_from"):src.index("async def main")], ns)
FakeHue, frames_from = ns["FakeHue"], ns["frames_from"]


class FakeNanoleaf:
    def __init__(self):
        self.devices = {"nanoleaf_N1": {"name": "Shapes", "zone": "N1"}}
        self.puts = []

    def _entry(self, device_id):
        return {"host": "127.0.0.1", "token": "tok", "serial": "N1", "model": "NL42"}

    async def _get_info(self, host, token):
        return {"state": {"on": {"value": True}, "brightness": {"value": 35}, "colorMode": "effect",
                          "hue": {"value": 10}, "sat": {"value": 50}, "ct": {"value": 3000}},
                "effects": {"select": "Northern Lights"},
                "panelLayout": {"layout": {"positionData": [
                    {"panelId": 11, "x": 0, "y": 0}, {"panelId": 22, "x": 100, "y": 0}, {"panelId": 33, "x": 200, "y": 0}]}}}

    async def _put_state(self, host, token, body):
        self.puts.append(("state", body))

    async def _put_effects(self, host, token, body):
        self.puts.append(("effects", body))
        return None


def nano_frames(sock):
    """Every panel colour datagram caught so far, as {panel: (r, g, b)} 0..1."""
    out = []
    while True:
        try:
            data = sock.recv(4096)
        except BlockingIOError:
            return out
        n = struct.unpack(">H", data[:2])[0]
        d = {}
        for k in range(n):
            pid, r, g, b, _w, _t = struct.unpack(">HBBBBH", data[2 + 8 * k:10 + 8 * k])
            d[pid] = (r / 255, g / 255, b / 255)
        out.append(d)


async def main():
    try:
        import OpenSSL  # noqa: F401
    except ImportError:
        print("pyOpenSSL is not installed here: skipping (pip install pyOpenSSL)")
        return
    if not shutil.which("openssl"):
        print("no openssl command here: skipping")
        return
    S.IDLE_S = 1.0
    S.RETRY_S = 0.5
    sport, pcport = free_port(), free_port()
    nano_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    nano_sock.bind(("127.0.0.1", 0))
    nano_sock.setblocking(False)
    out = open(os.path.join(os.environ["DATA_DIR"], "dtls.out"), "wb")
    srv = subprocess.Popen(["openssl", "s_server", "-dtls1_2", "-nocert", "-psk", PSK, "-psk_identity", "appid-123",
                            "-cipher", "PSK-AES128-GCM-SHA256", "-accept", str(sport), "-quiet"],
                           stdin=subprocess.PIPE, stdout=out, stderr=subprocess.DEVNULL)
    await asyncio.sleep(0.6)
    hue, nl = FakeHue(), FakeNanoleaf()
    cfg = {"settings": {"screen_sync": {"room": "office", "lights": {"nanoleaf_N1": {"x": 1.6, "y": 0}}}}}
    told = []
    sync = S.ScreenSync(hue, room_lights=lambda r: ["hue_a", "hue_b", "hue_w", "nanoleaf_N1"], config=lambda: cfg,
                        send=told.append, room_name=lambda r: "Office", port=pcport, stream_port=sport,
                        nanoleaf=nl, nano_port=nano_sock.getsockname()[1])
    pc = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    row = bytes([255, 0, 0]) * 8 + bytes([0, 0, 255]) * 8
    frame = S.FRAME + bytes([0, 16, 9]) + row * 9

    async def pc_for(seconds):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            pc.sendto(frame, ("127.0.0.1", pcport))
            await asyncio.sleep(1 / 30)

    try:
        placed = {p["id"]: p for p in sync.placed("office")}
        check("the app is told where each light stands, with defaults for those with none",
              {k: (v["kind"], v["x"], v["y"], v["on"]) for k, v in placed.items()},
              {"hue_a": ("hue", -0.6, 0.0, True), "hue_b": ("hue", 0.6, 0.0, True), "nanoleaf_N1": ("nanoleaf", 1.6, 0.0, True)})
        await sync.start()
        await pc_for(1.5)
        check("syncing with the Hue bars and the Nanoleaf", (sync.state(), sorted(sync.lights)), ("syncing", ["hue_a", "hue_b", "nanoleaf_N1"]))
        check("the Nanoleaf was switched on at full brightness and asked for the streaming effect", nl.puts[:3], [
            ("state", {"on": {"value": True}}), ("state", {"brightness": {"value": 100}}),
            ("effects", {"write": {"command": "display", "animType": "extControl", "extControlVersion": "v2"}})])
        got = nano_frames(nano_sock)
        last = got[-1] if got else {}
        check("its stream arrives, a colour for each panel", sorted(last), [11, 22, 33])
        check("placed right of the screen, it is blue", all(c[2] > 0.7 and c[0] < 0.3 for c in last.values()), True)

        # dragged to the left of the screen on the positions page
        cfg["settings"]["screen_sync"]["lights"]["nanoleaf_N1"] = {"x": -1.6, "y": 0}
        await pc_for(1.0)
        last = (nano_frames(nano_sock) or [{}])[-1]
        check("dragged to the left, it turns red while streaming", all(c[0] > 0.7 and c[2] < 0.3 for c in last.values()), True)

        # in the middle, each panel its own colour
        cfg["settings"]["screen_sync"]["lights"]["nanoleaf_N1"] = {"x": 0, "y": 0}
        await pc_for(1.0)
        last = (nano_frames(nano_sock) or [{}])[-1]
        check("at the middle its left panel is red and its right one blue", (last[11][0] > 0.7, last[33][2] > 0.7), (True, True))

        # the right bar left out
        before = len(hue.posts)
        cfg["settings"]["screen_sync"]["lights"]["hue_b"] = {"x": 0.6, "y": 0, "on": False}
        await pc_for(2.0)
        check("left out, it stops following and the rest carry on", (sync.state(), sorted(sync.lights)), ("syncing", ["hue_a", "nanoleaf_N1"]))
        made = hue.posts[before:]
        rids = [loc["service"]["rid"] for loc in made[0][1]["locations"]["service_locations"]] if made else []
        check("through an area holding just the lights that follow", rids, ["ent-a"])

        # the PC goes quiet: everything put back, the Nanoleaf to its own effect and brightness
        n = len(nl.puts)
        await asyncio.sleep(1.8)
        check("quiet PC: stopped", sync.state(), "waiting")
        check("the Nanoleaf is put back to its effect, its brightness, and on", nl.puts[n:], [
            ("effects", {"select": "Northern Lights"}), ("state", {"brightness": {"value": 35}}), ("state", {"on": {"value": True}})])
        check("the app was told the positions", any(m["screen_sync"].get("placed") for m in told), True)
    finally:
        await sync.stop()
        srv.kill()

    # a start that fails partway puts back what had started
    hue2, nl2 = FakeHue(), FakeNanoleaf()

    async def refuse(host, token, body):
        if "write" in body:
            raise RuntimeError("the Nanoleaf controller said 500")
        nl2.puts.append(("effects", body))
    nl2._put_effects = refuse
    cfg2 = {"settings": {"screen_sync": {"room": "office", "lights": {"hue_a": {"on": False}, "hue_b": {"on": False}}}}}
    s2 = S.ScreenSync(hue2, room_lights=lambda r: ["nanoleaf_N1"], config=lambda: cfg2, send=lambda m: None, port=free_port(), nanoleaf=nl2)
    try:
        await s2._begin("office")
    except RuntimeError:
        pass
    await s2._end(restore=True)
    check("a Nanoleaf that refuses the stream is put back all the same", nl2.puts[-3:], [
        ("effects", {"select": "Northern Lights"}), ("state", {"brightness": {"value": 35}}), ("state", {"on": {"value": True}})])

    # one gradient light (a Play gradient tube, seven sections): red on the left of the screen, blue on the right
    class GradientHue(FakeHue):
        def __init__(self):
            super().__init__()
            self.devices = {"hue_g": {"name": "Gradient tube", "zone": "light-g", "hue_owner": "dev-g", "color": {"xy": None}, "segments": 7}}

        async def _get(self, path):
            if path == "/clip/v2/resource/entertainment":
                return {"data": [{"id": "ent-g", "owner": {"rid": "dev-g"}, "renderer": True}]}
            if path.startswith("/clip/v2/resource/light/"):
                return {"data": [{"id": "light-g", "on": {"on": True}, "dimming": {"brightness": 50.0}}]}
            return await super()._get(path)

        async def _post(self, path, body):
            self.posts.append((path, body))
            # the bridge gives a gradient light one channel per section; ours made in one place, so all at one point
            chans = [{"channel_id": n, "position": {"x": 0, "y": 0.8, "z": 0}, "members": [{"service": {"rid": "ent-g"}, "index": n}]} for n in range(7)]
            self.configs.append({"id": "12345678-0000-4000-8000-000000000002", "metadata": body["metadata"], "status": "inactive",
                                 "channels": chans, "light_services": [{"rid": "light-g", "rtype": "light"}]})
            return {"data": [{"rid": "12345678-0000-4000-8000-000000000002"}]}

    out2 = open(os.path.join(os.environ["DATA_DIR"], "dtls2.out"), "wb")
    sport2, pcport2 = free_port(), free_port()
    srv2 = subprocess.Popen(["openssl", "s_server", "-dtls1_2", "-nocert", "-psk", PSK, "-psk_identity", "appid-123",
                             "-cipher", "PSK-AES128-GCM-SHA256", "-accept", str(sport2), "-quiet"],
                            stdin=subprocess.PIPE, stdout=out2, stderr=subprocess.DEVNULL)
    await asyncio.sleep(0.6)
    gh = GradientHue()
    cfg3 = {"settings": {"screen_sync": {"room": "office", "lights": {}}}}
    said = []
    g = S.ScreenSync(gh, room_lights=lambda r: ["hue_g"], config=lambda: cfg3, send=said.append, room_name=lambda r: "Office",
                     port=pcport2, stream_port=sport2)
    try:
        check("a gradient light says it has sections, and spans the screen", {k: v for k, v in g.placed("office")[0].items() if k in ("segments", "span", "flip")},
              {"segments": 7, "span": 2.0, "flip": False})
        # a gradient Signe in the same place stands up: shorter, and up the screen
        gh.devices["hue_g"]["product"] = {"name": "Hue Gradient Signe floor lamp (black)", "form": "signe-floor"}
        check("a standing gradient lamp says so, and spans most of the screen's height",
              {k: v for k, v in g.placed("office")[0].items() if k in ("upright", "span")}, {"upright": True, "span": 1.2})
        del gh.devices["hue_g"]["product"]
        await g.start()
        end = time.monotonic() + 1.5
        while time.monotonic() < end:
            pc.sendto(frame, ("127.0.0.1", pcport2))
            await asyncio.sleep(1 / 30)
        made = gh.posts[0][1]["locations"]["service_locations"][0]["positions"] if gh.posts else []
        check("the area it makes gives the light its start and its end, all a bridge takes", len(made), 2)
        # what the positions page is shown while it watches: the screen's grid, and each light's sections' colours
        live = g._live()
        check("the positions page is shown the screen and every section's colour",
              (live["grid"]["w"], live["grid"]["h"], len(live["grid"]["rgb"]), len(live["lights"].get("hue_g", [])), live["state"]),
              (16, 9, 864, 7, "syncing"))
        first = live["lights"]["hue_g"][0]
        # a light turned down on the page is sent darker
        cfg3["settings"]["screen_sync"]["lights"] = {"hue_g": {"gain": 0.25}}
        g._place_points("office")
        dim = g._live()["lights"]["hue_g"][0]
        check("a light at a quarter brightness is sent darker", int(dim[0:2], 16) < int(first[0:2], 16), True)
        cfg3["settings"]["screen_sync"]["lights"] = {}
        g._place_points("office")
        g._tell(30.0)
        beat = next((m["beat"] for m in said if m.get("type") == "screen_sync_beat"), {})
        check("a running sync says how it is going: every channel found its light, and what the light is sent",
              (beat.get("pc_fps"), beat.get("channels"), beat.get("matched"), list(beat.get("lights", {})), str(beat.get("screen", ""))[:1]),
              (30.0, 7, 7, ["Gradient tube"], "#"))
        out2.flush()
        last = (frames_from(open(out2.name, "rb").read()) or [{}])[-1]
        check("its first section is red and its last blue", (last.get(0, (0, 0, 0))[0] > 0.7, last.get(6, (0, 0, 0))[2] > 0.7), (True, True))
        cfg3["settings"]["screen_sync"]["lights"]["hue_g"] = {"flip": True}
        end = time.monotonic() + 1.0
        while time.monotonic() < end:
            pc.sendto(frame, ("127.0.0.1", pcport2))
            await asyncio.sleep(1 / 30)
        out2.flush()
        last = (frames_from(open(out2.name, "rb").read()) or [{}])[-1]
        check("flipped, the other way round", (last.get(0, (0, 0, 0))[2] > 0.7, last.get(6, (0, 0, 0))[0] > 0.7), (True, True))
    finally:
        await g.stop()
        srv2.kill()
    check("a strip the Hue app laid up, across and down keeps that shape",
          S.sections([(0, -0.5, 0.0, 0), (1, -0.5, 0.5, 1), (2, 0.5, 0.5, 2), (3, 0.5, 0.0, 3)], 2.0, False),
          {0: (-1.0, 0.5), 1: (-1.0, -0.5), 2: (1.0, -0.5), 3: (1.0, 0.5)})
    # a gradient Signe stands up: its sections run up the screen from its foot (lower on the page is larger y),
    # whatever shape the area gives them, and flipped its top is its foot
    up = S.sections([(4, -0.5, 0.0, 0), (5, 0.0, 0.0, 1), (6, 0.5, 0.0, 2)], 1.2, False, True)
    check("a standing lamp's sections run from its foot up", {k: (round(x, 3), round(y, 3)) for k, (x, y) in up.items()},
          {4: (0.0, 0.6), 5: (0.0, 0.0), 6: (0.0, -0.6)})
    down = S.sections([(4, -0.5, 0.0, 0), (5, 0.0, 0.0, 1), (6, 0.5, 0.0, 2)], 1.2, True, True)
    check("flipped, its top is its foot", (round(down[4][1], 3), round(down[6][1], 3)), (-0.6, 0.6))

    # the pieces
    # a zone of the screen: each cell it covers counts as much as it is covered, and nothing outside it counts
    zw = S.zone_weights(16, 9, (-1.0, -1.0, 0.0, 1.0))
    check("a zone over the left half looks only at the left half",
          (round(sum(zw[j * 16 + i] for j in range(9) for i in range(8)), 6), max(zw[j * 16 + i] for j in range(9) for i in range(8, 16))), (1.0, 0.0))
    half_cell = S.zone_weights(16, 9, (-1.0, -1.0, -1.0 + 1 / 16, 1.0))
    check("a zone half a cell wide still looks at that cell", round(sum(half_cell[j * 16] for j in range(9)), 6), 1.0)
    check("a zone cut for three sections, left to right", S.split_zone((-1.0, -0.5, 0.5, 0.5), 3, False, False),
          [(-1.0, -0.5, -0.5, 0.5), (-0.5, -0.5, 0.0, 0.5), (0.0, -0.5, 0.5, 0.5)])
    check("and for a lamp standing up, from its foot", S.split_zone((0.5, -1.0, 1.0, 1.0), 2, True, False),
          [(0.5, 0.0, 1.0, 1.0), (0.5, -1.0, 1.0, 0.0)])
    check("flipped, the other way", S.split_zone((-1.0, -0.5, 0.5, 0.5), 3, False, True)[0], (0.0, -0.5, 0.5, 0.5))
    check("a zone from the page is kept to the screen", S.zone_of({"x0": 0.5, "y0": -2, "x1": -0.25, "y1": 0.3}), (-0.25, -1.0, 0.5, 0.3))
    check("and one too small to look at is none", S.zone_of({"x0": 0.1, "y0": 0.1, "x1": 0.11, "y1": 0.5}), None)
    check("a light outside the screen looks at its nearest edge", S.weights(16, 9, 2.5, 0) == S.weights(16, 9, 1.0, 0), True)
    import nanostream as N
    offs = N.layout_offsets({"panelLayout": {"layout": {"positionData": [{"panelId": 1, "x": 0, "y": 0}, {"panelId": 2, "x": 0, "y": 100}]}}})
    check("a panel higher up in Nanoleaf's layout is higher on the page", offs, [(1, 0.0, 0.5), (2, 0.0, -0.5)])
    check("a v1 datagram for the first Light Panels", N.packet_v1([(5, 1.0, 0.0, 0.5)]), bytes([1, 5, 1, 255, 0, 128, 0, 1]))


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
