"""A gradient lamp the bridge streams as one colour (screensync.py, ScreenSync._widen), against a pretend bridge that
gives a Hue Play table lamp one channel in a screen area laid out upright, and three in a 3D space area. It checks:
  * the lamp's one channel is noticed when the stream starts, and the area's layouts are tried as trial areas;
  * every trial area is deleted again;
  * the room's own area is made again the way that gave the most channels, and the old one deleted;
  * an area made in the Hue app with the same lights is left alone, and the room's own is preferred from then on;
  * it is tried once, not every time the stream starts;
  * the stream then runs on the new area, the lamp's three channels foot to top.
Run: python test_widen.py
"""
import asyncio
import os
import sys
import tempfile

os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="widen-"))

import screensync as S  # noqa: E402

FAILS = []


def check(name, ok, got=None):
    print(f"{'ok  ' if ok else 'FAIL'} {name}" + ('' if ok else f': {got!r}'))
    if not ok:
        FAILS.append(name)


class Bridge:
    host, key, clientkey, paired = "127.0.0.1", "k", "00112233445566778899aabbccddeeff", True

    def __init__(self, hue_app_area=False):
        self.devices = {
            "hue_s": {"name": "Computer lights", "zone": "light-s", "hue_owner": "dev-s", "color": {"xy": None}, "segments": 5,
                      "product": {"form": "strip"}},
            "hue_l": {"name": "Desk lamp left", "zone": "light-l", "hue_owner": "dev-l", "color": {"xy": None}, "segments": 5,
                      "product": {"form": "signe-table"}},
        }
        self.configs, self.made, self.deleted, self.n = [], [], [], 0
        if hue_app_area:
            self.configs.append(self._cfg("app-area", "Collin Office", "screen", [("ent-s", 2), ("ent-l", 1)]))
        else:
            self.configs.append(self._cfg("old-ours", "Office screen", "screen", [("ent-s", 2), ("ent-l", 1)]))

    def _cfg(self, cid, name, kind, per):
        chans, n = [], 0
        for ent, k in per:
            for i in range(k):
                chans.append({"channel_id": n, "position": {"x": 0, "y": 0, "z": i / 4}, "members": [{"service": {"rid": ent}, "index": i}]})
                n += 1
        return {"id": cid, "metadata": {"name": name}, "configuration_type": kind, "status": "inactive", "channels": chans,
                "light_services": [{"rid": "light-" + ent[-1]} for ent, _k in per]}

    async def _get(self, path):
        if path == "/clip/v2/resource/entertainment_configuration":
            return {"data": self.configs}
        if path.startswith("/clip/v2/resource/entertainment_configuration/"):
            return {"data": [c for c in self.configs if c["id"] == path.rsplit("/", 1)[1]]}
        if path == "/clip/v2/resource/entertainment":
            return {"data": [{"id": f"ent-{x}", "owner": {"rid": f"dev-{x}"}, "renderer": True,
                              "segments": {"configurable": False, "max_segments": 10, "segments": [{}] * 7}} for x in "sl"]}
        if path.startswith("/clip/v2/resource/light/"):
            return {"data": [{"id": path.rsplit("/", 1)[1], "on": {"on": True}, "gradient": {"points_capable": 5}}]}
        raise AssertionError(path)

    async def _post(self, path, body):
        self.n += 1
        kind = body["configuration_type"]
        locs = body["locations"]["service_locations"]
        up = {loc["service"]["rid"]: loc["positions"][0]["z"] != loc["positions"][-1]["z"] for loc in locs}
        # the lamp: one channel in a screen area, three in a 3D space laid upright; the strip two either way
        per = [("ent-s", 2), ("ent-l", 3 if kind == "3dspace" and up.get("ent-l") else 1)]
        cid = f"made-{self.n}"
        self.configs.append(self._cfg(cid, body["metadata"]["name"], kind, per))
        self.made.append((body["metadata"]["name"], kind))
        return {"data": [{"rid": cid}]}

    async def _delete(self, path):
        cid = path.rsplit("/", 1)[1]
        self.deleted.append(cid)
        self.configs = [c for c in self.configs if c["id"] != cid]
        return {"data": []}

    async def _put(self, path, body):
        return {"data": []}

    async def app_id(self):
        return "app"


def sync_for(hue):
    cfg = {"settings": {"screen_sync": {"room": "office"}, "rooms": [{"id": "office", "name": "Office"}]}}
    return S.ScreenSync(hue, room_lights=lambda r: ["hue_s", "hue_l"], config=lambda: cfg, send=lambda m: None,
                        room_name=lambda r: "Office")


async def no_dtls(self):
    return None


async def main():
    S.huestream.DtlsPsk.connect = no_dtls   # the stream itself is test_screensync.py's business

    hue = Bridge()
    sync = sync_for(hue)
    await sync._begin_hue("office", ["hue_s", "hue_l"])
    trials = [m for m in hue.made if m[0] == "Office screen trial"]
    check("the layouts are tried", len(trials) == 9 and {k for _n, k in trials} == {"screen", "3dspace", "monitor"}, hue.made)
    check("every trial is deleted", not [c for c in hue.configs if c["metadata"]["name"].endswith("trial")], [c["metadata"]["name"] for c in hue.configs])
    check("the old area of the room's own is deleted", "old-ours" in hue.deleted, hue.deleted)
    final = [c for c in hue.configs if c["metadata"]["name"] == "Office screen"]
    check("and made again as the 3D space that gave the lamp three channels", len(final) == 1 and final[0]["configuration_type"] == "3dspace", final)
    lamp = sorted(ch for ch, d in sync._chan_light.items() if d == "hue_l")
    check("the stream runs on it with the lamp's three channels", sync.area["id"] == final[0]["id"] and len(lamp) == 3, (sync.area, lamp))
    check("the log says so", sync._detail["Desk lamp left"]["channels"] == 3, sync._detail)
    n = len(hue.made)
    await sync._end(restore=False)
    await sync._begin_hue("office", ["hue_s", "hue_l"])
    check("started again, nothing is tried again and the new area is used", len(hue.made) == n and sync.area["id"] == final[0]["id"], hue.made[n:])
    pts = {k: v for k, v in sync._points.items()}
    sync._place_points("office", force=True)
    ys = sorted(sync._points[("h", ch)][1] for ch in lamp if ("h", ch) in sync._points)
    check("its three sections stand one above the other", len(ys) == 3 and len(set(round(y, 3) for y in ys)) == 3, (pts, ys))

    # an area made in the Hue app is not touched; the room's own is made beside it and preferred from then on
    hue = Bridge(hue_app_area=True)
    sync = sync_for(hue)
    await sync._begin_hue("office", ["hue_s", "hue_l"])
    check("an area made in the Hue app is left alone", any(c["id"] == "app-area" for c in hue.configs) and "app-area" not in hue.deleted, hue.deleted)
    check("the room's own is made beside it, and used", sync.area["name"] == "Office screen" and sync.area["id"] != "app-area", sync.area)
    got = await S.area_for(hue, ["hue_s", "hue_l"], "Office screen")
    check("and preferred when both hold the same lights", got["name"] == "Office screen", got["name"])


asyncio.run(main())
print("ALL OK" if not FAILS else f"{len(FAILS)} FAILED")
sys.exit(1 if FAILS else 0)
