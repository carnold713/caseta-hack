"""Screen sync, end to end on this machine (agent/screensync.py, agent/huestream.py).

A pretend PC sends frames whose left half is red and right half blue, a pretend Hue bridge answers the CLIP calls,
and OpenSSL's own DTLS server stands in for the bridge's streaming port, with the bridge's cipher and a pre-shared
key, so the stream is checked against an implementation that is not ours. It checks:
  * an entertainment area is made for the room's two light bars, "left" on the left, and started;
  * the stream arrives, and the left bar is red and the right one blue;
  * a light changed by hand stops the stream before the command, pauses it, and does not put the lights back;
  * the PC asking to resume starts it again;
  * the PC going quiet stops it and puts both lights back as they were.
Needs pyOpenSSL and the openssl command; says so and passes without them. Run: python test_screensync.py
"""
import asyncio
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="sync-"))

import screensync as S  # noqa: E402

FAILS = []
PSK = "00112233445566778899aabbccddeeff"


def check(name, got, want):
    ok = got == want
    print(f"{'ok  ' if ok else 'FAIL'} {name}: {got!r}" + ('' if ok else f' (wanted {want!r})'))
    if not ok:
        FAILS.append(name)


def free_port(kind=socket.SOCK_DGRAM):
    s = socket.socket(socket.AF_INET, kind)
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class FakeHue:
    host = "127.0.0.1"
    key = "the-key"
    clientkey = PSK
    paired = True

    def __init__(self):
        self.devices = {
            "hue_b": {"name": "Light bar right", "zone": "light-b", "hue_owner": "dev-b", "color": {"xy": None}},
            "hue_a": {"name": "Light bar left", "zone": "light-a", "hue_owner": "dev-a", "color": {"xy": None}},
            "hue_w": {"name": "Ceiling", "zone": "light-w", "hue_owner": "dev-w", "color": None},
        }
        self.configs = []
        self.puts = []
        self.posts = []

    async def app_id(self):
        return "appid-123"

    async def _get(self, path):
        if path == "/clip/v2/resource/entertainment_configuration":
            return {"data": self.configs}
        if path.startswith("/clip/v2/resource/entertainment_configuration/"):
            return {"data": [c for c in self.configs if c["id"] == path.rsplit("/", 1)[1]]}
        if path == "/clip/v2/resource/entertainment":
            return {"data": [{"id": f"ent-{x}", "owner": {"rid": f"dev-{x}"}, "renderer": True} for x in "abw"]}
        if path.startswith("/clip/v2/resource/light/"):
            lid = path.rsplit("/", 1)[1]
            before = {"light-a": {"on": {"on": True}, "dimming": {"brightness": 40.0},
                                  "color_temperature": {"mirek": 370, "mirek_valid": True}},
                      "light-b": {"on": {"on": False}, "dimming": {"brightness": 80.0},
                                  "color": {"xy": {"x": 0.3, "y": 0.3}}, "color_temperature": {"mirek": None, "mirek_valid": False}}}
            return {"data": [dict(before[lid], id=lid)]}
        raise AssertionError(path)

    async def _post(self, path, body):
        self.posts.append((path, body))
        locs = body["locations"]["service_locations"]
        chans = [{"channel_id": n, "position": loc["positions"][0],
                  "members": [{"service": loc["service"], "index": 0}]} for n, loc in enumerate(locs)]
        rid = {"ent-a": "light-a", "ent-b": "light-b"}
        self.configs.append({"id": "12345678-0000-4000-8000-000000000001", "metadata": body["metadata"], "status": "inactive",
                             "channels": chans, "light_services": [{"rid": rid[loc["service"]["rid"]], "rtype": "light"} for loc in locs]})
        return {"data": [{"rid": "12345678-0000-4000-8000-000000000001"}]}

    async def _put(self, path, body):
        self.puts.append((path, body))
        return {"data": []}


def frames_from(raw: bytes):
    """Every HueStream message in what the DTLS server printed, as {channel: (r, g, b)}."""
    out = []
    i = raw.find(b"HueStream")
    while i >= 0:
        j = raw.find(b"HueStream", i + 9)
        msg = raw[i:j if j >= 0 else len(raw)]
        body = msg[16 + 36:]
        chans = {}
        for k in range(0, len(body) - 6, 7):
            ch = body[k]
            r, g, b = (int.from_bytes(body[k + 1 + 2 * n:k + 3 + 2 * n], "big") / 65535 for n in range(3))
            chans[ch] = (r, g, b)
        out.append(chans)
        i = j
    return out


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
    S.RETRY_S = 1.0
    sport, pcport = free_port(), free_port()
    out = open(os.path.join(os.environ["DATA_DIR"], "dtls.out"), "wb")
    srv = subprocess.Popen(["openssl", "s_server", "-dtls1_2", "-nocert", "-psk", PSK, "-psk_identity", "appid-123",
                            "-cipher", "PSK-AES128-GCM-SHA256", "-accept", str(sport), "-quiet"],
                           stdin=subprocess.PIPE, stdout=out, stderr=subprocess.DEVNULL)
    await asyncio.sleep(0.6)
    hue = FakeHue()
    cfg = {"settings": {"screen_sync": {"room": "office"}, "rooms": [{"id": "office", "name": "Office"}]}}
    sent = []
    sync = S.ScreenSync(hue, room_lights=lambda r: ["hue_a", "hue_b", "hue_w"], config=lambda: cfg, send=sent.append,
                        room_name=lambda r: "Office", port=pcport, stream_port=sport)
    try:
        await sync.start()
        pc = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        pc.setblocking(False)
        row = bytes([255, 0, 0]) * 8 + bytes([0, 0, 255]) * 8
        frame = S.FRAME + bytes([0, 16, 9]) + row * 9

        async def pc_for(seconds, resume=False):
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                f = frame if not resume else S.FRAME + bytes([S.FLAG_RESUME, 16, 9]) + row * 9
                pc.sendto(f, ("127.0.0.1", pcport))
                await asyncio.sleep(1 / 30)

        await pc_for(1.5)
        check("syncing once the PC's frames arrive", sync.state(), "syncing")
        check("only the colour lights follow", sorted(sync.lights), ["hue_a", "hue_b"])
        made = hue.posts[0][1] if hue.posts else {}
        check("an area was made, named for the room", (made.get("metadata") or {}).get("name"), "Office screen")
        xs = {loc["service"]["rid"]: loc["positions"][0]["x"] for loc in (made.get("locations") or {}).get("service_locations", [])}
        check("the bar called left is on the left", (xs.get("ent-a", 0) < 0, xs.get("ent-b", 0) > 0), (True, True))
        check("and it was started", ("/clip/v2/resource/entertainment_configuration/12345678-0000-4000-8000-000000000001", {"action": "start"}) in hue.puts, True)
        check("the app was told", any(m["screen_sync"]["state"] == "syncing" for m in sent), True)
        answers = []
        while True:
            try:
                answers.append(pc.recvfrom(65536)[0])
            except BlockingIOError:
                break
        check("the PC is answered with the state", bool(answers) and answers[-1][:4] == S.STATE and b'"syncing"' in answers[-1], True)

        out.flush()
        msgs = frames_from(open(out.name, "rb").read())
        check("the stream arrived at the DTLS server", len(msgs) > 20, True)
        last = msgs[-1] if msgs else {}
        left, right = last.get(0, (0, 0, 0)), last.get(1, (0, 0, 0))
        check("the left bar is red", left[0] > 0.7 and left[2] < 0.3, True)
        check("the right bar is blue", right[2] > 0.7 and right[0] < 0.3, True)

        # a person changes a light by hand
        n_puts = len(hue.puts)
        await sync.yield_for("hue_a")
        check("a hand on a light pauses it", sync.state(), "paused")
        after = hue.puts[n_puts:]
        check("the stream was stopped first", after[:1], [("/clip/v2/resource/entertainment_configuration/12345678-0000-4000-8000-000000000001", {"action": "stop"})])
        check("and the lights were not put back over the command", [p for p, _ in after if "/light/" in p], [])
        check("the day leaves following lights alone, and paused ones not", sync.owns("hue_a"), False)
        await pc_for(0.5)
        check("frames alone do not undo the pause", sync.state(), "paused")

        # the PC's tray says resume
        await pc_for(1.5, resume=True)
        check("the PC resumes it", sync.state(), "syncing")
        check("a following light is the screen's, not the day's", sync.owns("hue_a"), True)

        # the PC goes quiet (asleep, locked, closed)
        n_puts = len(hue.puts)
        await asyncio.sleep(1.8)
        check("quiet PC: it stops", sync.state(), "waiting")
        back = {p.rsplit("/", 1)[1]: b for p, b in hue.puts[n_puts:] if "/light/" in p}
        check("the left bar is put back to its warm white at 40",
              back.get("light-a"), {"on": {"on": True}, "dimming": {"brightness": 40.0}, "color_temperature": {"mirek": 370}})
        check("the right bar is put back off, with its colour", back.get("light-b"),
              {"on": {"on": False}, "dimming": {"brightness": 80.0}, "color": {"xy": {"x": 0.3, "y": 0.3}}})

        # nothing follows when no room is set
        cfg["settings"]["screen_sync"] = {"room": None}
        await pc_for(0.6)
        check("no room set: nothing follows", sync.state(), "off")

        # a pairing without the streaming key says what to do
        cfg["settings"]["screen_sync"] = {"room": "office"}
        hue.clientkey = None
        await pc_for(0.6)
        check("without the bridge's streaming key it says so", (sync.state(), "button" in (sync.why or "")), ("problem", True))
    finally:
        await sync.stop()
        srv.kill()

    # a connector that has not installed pyOpenSSL yet says so, and keeps running
    real = sys.modules.get("OpenSSL")
    sys.modules["OpenSSL"] = None
    try:
        hue2 = FakeHue()
        hue2.configs = list(hue.configs)
        s2 = S.ScreenSync(hue2, room_lights=lambda r: ["hue_a", "hue_b"], config=lambda: cfg, send=lambda m: None, port=free_port(), stream_port=sport)
        err = None
        try:
            await s2._begin("office")
        except RuntimeError as exc:
            err = str(exc)
        check("without pyOpenSSL it says what is missing", "pyOpenSSL" in (err or ""), True)
        await s2._end(restore=True)
    finally:
        sys.modules["OpenSSL"] = real

    # no room set yet, and a PC turns up: the app is told, since that is what puts the switch on the room's page
    told = []
    cfg3 = {"settings": {}}
    s3 = S.ScreenSync(FakeHue(), room_lights=lambda r: [], config=lambda: cfg3, send=told.append, port=free_port(), stream_port=sport)
    s3._announce()
    first = len(told)
    s3.on_datagram(S.QUERY, ("192.168.1.30", 50000))
    check("a PC looking for the connector is news even with no room set",
          [bool(m["screen_sync"]["pc"]) for m in told[first:]], [True])
    s3.on_datagram(S.FRAME + bytes([0, 16, 9]) + bytes(432), ("192.168.1.30", 50000))
    s3._announce()
    check("and its frames after that are not", len(told), first + 1)

    # on and off: a remote's press toggles it, it outlives a restart, and with no room set a press does nothing
    import pathlib
    d = pathlib.Path(tempfile.mkdtemp(prefix="syncoff-"))
    cfg4 = {"settings": {"screen_sync": {"room": "office"}}}
    s4 = S.ScreenSync(FakeHue(), room_lights=lambda r: [], config=lambda: cfg4, send=lambda m: None, port=free_port(), data_dir=d)
    check("on to start with", s4.is_on(), True)
    await s4.remote("toggle")
    check("a remote's press switches it off", (s4.is_on(), s4.state()), (False, "off"))
    s5 = S.ScreenSync(FakeHue(), room_lights=lambda r: [], config=lambda: cfg4, send=lambda m: None, port=free_port(), data_dir=d)
    check("off outlives a restart", s5.is_on(), False)
    s5.on_datagram(S.FRAME + bytes([0, 16, 9]) + bytes(432), ("192.168.1.30", 50000))
    check("and the PC coming back does not undo it", s5.state(), "off")
    await s5.remote("toggle")
    check("pressed again, on", s5.is_on(), True)
    s5.pause()
    await s5.remote("toggle")
    check("a press ends a pause by hand too", (s5.is_on(), s5.paused), (True, False))
    await s5.remote("off")
    cfg4["settings"]["screen_sync"] = {"room": None}
    await s5.remote("toggle")
    check("with no room set a press changes nothing", s5.off, True)

    # the pieces on their own
    check("a frame of the wrong size is not a frame", S.parse_frame(S.FRAME + bytes([0, 16, 9]) + b"x" * 10), None)
    w = S.weights(16, 9, -0.6, 0.0)
    check("weights add up to one", round(sum(w), 6), 1.0)
    check("a light on the left listens to the left", sum(w[i] for i in range(len(w)) if i % 16 < 8) > 0.8, True)
    check("names place lights", S.place(["Bar right", "Bar left", "Lamp"]), [(0.6, 0.0), (-0.6, 0.0), (0.0, 0.0)])
    check("unnamed lights spread out", S.place(["A", "B", "C"]), [(-0.6, 0.0), (0.0, 0.0), (0.6, 0.0)])
    grey = S.colour_of(bytes([128, 128, 128]) * 144, S.weights(16, 9, 0, 0))
    check("a grey screen stays grey", max(grey) - min(grey) < 1e-6, True)


asyncio.run(main())
print("FAILED: " + ", ".join(FAILS) if FAILS else "ALL OK")
raise SystemExit(1 if FAILS else 0)
