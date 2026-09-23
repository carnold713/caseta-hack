"""Off means off:  python test_offmeansoff.py

The owner: "when I click All off, or Off, the lights REALLY do turn off. I can spam click buttons and get it to act
up, or sometimes it just doesn't turn random lights off." Three ways that happened, each pinned here:

- taps faster than the bridge answers ran at once, so an older On could reach a light after a newer Off;
- a bridge busy with a burst can drop a command, and nothing looked again;
- "all" was a list of Lutron model names, and a model missing from it was never part of All off.
"""
import asyncio
import engine
from engine import ActionRunner

engine.asyncio  # the module's own loop helpers are what the runner uses


class SlowBridge:
    """A Smartbridge that answers slowly, can be told to drop commands, and reports what reached each light."""

    def __init__(self):
        self.devices = {
            "5": {"device_id": "5", "type": "WallDimmer", "zone": "2", "current_state": 0},
            "6": {"device_id": "6", "type": "WallSwitch", "zone": "3", "current_state": 100},
            # a Lutron model the old list never named
            "7": {"device_id": "7", "type": "SomeNewDimmer2027", "zone": "4", "current_state": 60},
            "8": {"device_id": "8", "type": "CasetaFanSpeedController", "zone": "5", "current_state": 0},
            "9": {"device_id": "9", "type": "Pico3ButtonRaiseLower", "current_state": -1},   # a remote: no zone
        }
        self.calls = []
        self.drop = set()      # device ids whose next command is lost
        self.delay = {}        # device id -> seconds a command takes

    async def set_value(self, device_id, level, fade_time=None):
        await asyncio.sleep(self.delay.get(device_id, 0))
        self.calls.append((device_id, level))
        if device_id in self.drop:
            self.drop.discard(device_id)
            return
        self.devices[device_id]["current_state"] = level

    async def set_fan(self, device_id, speed):
        self.calls.append((device_id, speed))


async def main():
    bad = 0

    def check(name, ok, got=""):
        nonlocal bad
        bad += not ok
        print(("PASS" if ok else "FAIL"), name, "" if ok else got)

    bridge = SlowBridge()
    cfg = {"settings": {"default_fade": 0}}
    r = ActionRunner(lambda: bridge, lambda: cfg)

    # "all" is every light-like output: the unlisted model is in, the fan and the remote are not
    got = r._resolve("h:all")
    check("All reaches a Lutron model the list never named", "7" in got, got)
    check("All leaves out the fan and the remote", "8" not in got and "9" not in got, got)

    # spam: On, Off, On, Off on the same light, faster than the bridge answers. The last tap wins, and the
    # commands in between that were overtaken while they waited are not sent at all.
    bridge.delay["5"] = 0.15
    bridge.calls.clear()
    taps = [asyncio.create_task(r.run_one({"type": "level", "target": "d:5", "level": lv})) for lv in (100, "off", 100, "off")]
    await asyncio.gather(*taps)
    sent = [lv for d, lv in bridge.calls if d == "5"]
    check("four taps in a row end where the last one said", bridge.devices["5"]["current_state"] == 0, sent)
    check("the taps overtaken while they waited stand down", len(sent) <= 2 and sent[-1] == 0, sent)
    bridge.delay.clear()

    # All off with the bridge dropping one light's command: it is looked at again and sent again
    for d in ("5", "6", "7"):
        bridge.devices[d]["current_state"] = 80
    bridge.drop = {"6"}
    bridge.calls.clear()
    await r.run_one({"type": "level", "target": "h:all", "level": "off"})
    check("the dropped light is still on right after", bridge.devices["6"]["current_state"] == 80)
    await asyncio.sleep(1.8)
    check("a moment later it is off: the off was sent again", bridge.devices["6"]["current_state"] == 0, bridge.calls)
    check("every light is off", all(bridge.devices[d]["current_state"] == 0 for d in ("5", "6", "7")),
          {d: bridge.devices[d]["current_state"] for d in ("5", "6", "7")})

    # a light turned back on on purpose after the off is left alone by the check
    bridge.devices["5"]["current_state"] = 80
    bridge.drop = {"5"}
    await r.run_one({"type": "level", "target": "d:5", "level": "off"})
    await r.run_one({"type": "level", "target": "d:5", "level": 50})
    await asyncio.sleep(1.8)
    check("the check never undoes a newer On", bridge.devices["5"]["current_state"] == 50, bridge.calls[-3:])

    # one light that does not answer does not stop the others going off, and says so
    for d in ("5", "6", "7"):
        bridge.devices[d]["current_state"] = 80
    orig = bridge.set_value

    async def broken(device_id, level, fade_time=None):
        if device_id == "7":
            raise RuntimeError("timed out")
        await orig(device_id, level, fade_time)
    bridge.set_value = broken
    try:
        await r.run_one({"type": "level", "target": "h:all", "level": "off"})
        check("a light that did not answer is reported", False, "no error")
    except RuntimeError as exc:
        check("a light that did not answer is reported", "didn't answer" in str(exc), str(exc))
    check("and the rest still went off", bridge.devices["5"]["current_state"] == 0 and bridge.devices["6"]["current_state"] == 0)
    bridge.set_value = orig
    await asyncio.sleep(1.8)
    check("the one that did not answer is tried again", bridge.devices["7"]["current_state"] == 0, bridge.devices["7"])

    print("ALL OK" if not bad else f"{bad} FAILED")
    return bad


if __name__ == "__main__":
    raise SystemExit(1 if asyncio.run(main()) else 0)
