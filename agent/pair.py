#!/usr/bin/env python3
"""One-time pairing with the Caseta Smart Bridge.

Usage:  python pair.py <bridge-ip>

Generates a client certificate signed by the bridge and writes three PEM files
into the agent data dir (./data by default, or $DATA_DIR):
    caseta.key, caseta.crt, caseta-bridge.crt
When prompted, press the small black button on the back of the Smart Bridge.
Works with both the regular Smart Bridge (L-BDG2) and the Pro (L-BDGPRO2).
"""
import asyncio
import os
import sys
from pathlib import Path

from pylutron_caseta.pairing import async_pair


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    host = sys.argv[1]
    data_dir = Path(os.environ.get("DATA_DIR", Path(__file__).parent / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)

    def ready():
        print("\n>>> Press the button on the back of the Smart Bridge now. <<<\n")

    print(f"Connecting to bridge at {host} ...")
    try:
        result = asyncio.run(async_pair(host, ready))
    except Exception as exc:  # noqa: BLE001
        print(f"Pairing failed: {exc}")
        print("Is the IP right, and is this machine on the same network as the bridge?")
        return 1

    (data_dir / "caseta.key").write_text(result["key"])
    (data_dir / "caseta.crt").write_text(result["cert"])
    (data_dir / "caseta-bridge.crt").write_text(result["ca"])
    os.chmod(data_dir / "caseta.key", 0o600)
    print(f"Paired. Bridge LEAP version {result['version']}. Certificates written to {data_dir}/")
    print(f"Now run:  BRIDGE_HOST={host} python agent.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
