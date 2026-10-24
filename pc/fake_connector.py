"""A pretend connector for CI: answers a screen sync app on UDP 47700 as agent/screensync.py does, picks one of its
displays as the app on the phone would, and says what it heard. Fails unless the app found it, said who it is and
which displays it has, sent frames of a 16 x 9 grid, and followed the display picked for it.

    python pc/fake_connector.py 25 &   (then run the app with --pi 127.0.0.1)"""
import json
import socket
import sys
import time

seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 25
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.bind(("0.0.0.0", 47700))
s.settimeout(0.5)
end = time.time() + seconds
about, frames, pick, picked_at, followed = {}, 0, None, 0.0, False
while time.time() < end:
    try:
        data, addr = s.recvfrom(65536)
    except socket.timeout:
        continue
    if data[:4] == b"CSQ1":
        about = json.loads(data[4:] or b"{}")
        ds = about.get("displays") or []
        if ds and pick is None:
            pick, picked_at = ds[-1]["id"], time.time() * 1000  # the last one (the only one, on a runner), picked now
        if pick is not None and about.get("display") == pick and frames:
            followed = True
    elif data[:4] == b"CSY1" and len(data) == 7 + 16 * 9 * 3 and data[5:7] == bytes([16, 9]):
        frames += 1
    state = {"state": "syncing", "room": "r1", "room_name": "Office", "app_url": "https://hub.example/"}
    if pick is not None:
        state["want_display"] = {"id": pick, "at": picked_at, "pc": about.get("name")}
    s.sendto(b"CSS1" + json.dumps(state).encode(), addr)
summary = {"name": about.get("name"), "os": about.get("os"), "v": about.get("v"),
           "displays": [d.get("name") for d in about.get("displays") or []], "frames": frames, "picked": pick,
           "followed": followed}
print(json.dumps(summary, ensure_ascii=False))
ok = bool(about.get("name")) and frames > 20 and bool(summary["displays"]) and followed
sys.exit(0 if ok else 1)
