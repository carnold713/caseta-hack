"""Level and colour commands coalesce per target and kind: latest wins while one is in flight. Run: python test_lanes.py"""
import asyncio
import json
import os

os.environ.setdefault("HUB_URL", "ws://test")
import agent as agent_mod  # noqa: E402


class SlowRunner:
    def __init__(self):
        self.ran = []

    async def run_one(self, action):
        self.ran.append(action)
        await asyncio.sleep(0.05)


async def main():
    a = agent_mod.Agent.__new__(agent_mod.Agent)
    a._send_q = asyncio.Queue()
    a._lanes = {}
    a.runner = SlowRunner()
    for i, lv in enumerate([10, 20, 30, 40, 50]):
        await a._on_hub_message({"type": "command", "id": f"c{i}", "action": {"type": "level", "target": "d:5", "level": lv}})
        await asyncio.sleep(0)  # the socket yields between messages
    await a._on_hub_message({"type": "command", "id": "other", "action": {"type": "level", "target": "d:6", "level": 77}})
    # colour on the same target runs in its own lane beside the levels, and coalesces the same way
    for i, k in enumerate([2700, 3000, 4000]):
        await a._on_hub_message({"type": "command", "id": f"k{i}", "action": {"type": "color", "target": "d:5", "kelvin": k}})
        await asyncio.sleep(0)
    await asyncio.sleep(0.3)
    results = []
    while not a._send_q.empty():
        results.append(json.loads(a._send_q.get_nowait()))
    ran = [(x["target"], x.get("level", x.get("kelvin"))) for x in a.runner.ran]
    assert ran == [("d:5", 10), ("d:6", 77), ("d:5", 2700), ("d:5", 50), ("d:5", 4000)], ran
    ids = sorted(r["id"] for r in results if r["type"] == "result")
    assert ids == ["c0", "c1", "c2", "c3", "c4", "k0", "k1", "k2", "other"], ids
    assert all(r["ok"] for r in results), results
    superseded = [r["id"] for r in results if (r.get("detail") or {}).get("superseded")]
    assert superseded == ["c1", "c2", "c3", "k1"], superseded
    assert not a._lanes
    print("lanes ok: ran", ran, "| superseded", superseded)


asyncio.run(main())
