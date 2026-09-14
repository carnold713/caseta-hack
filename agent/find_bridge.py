#!/usr/bin/env python3
"""Find the Caseta Smart Bridge on the local network.

    python find_bridge.py

Listens for the bridge's mDNS announcement (_lutron._tcp) for a few seconds
and prints its IP. Then pair with:  python pair.py <that-ip>
"""
import asyncio
import socket
import sys

try:
    from zeroconf import ServiceListener
    from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf
except ImportError:
    print("pip install zeroconf   (then run this again)")
    sys.exit(2)


class Listener(ServiceListener):
    def __init__(self) -> None:
        self.names: list = []

    def add_service(self, zc, type_, name) -> None:
        self.names.append(name)

    def update_service(self, zc, type_, name) -> None:
        pass

    def remove_service(self, zc, type_, name) -> None:
        pass


async def main() -> int:
    azc = AsyncZeroconf()
    listener = Listener()
    browser = AsyncServiceBrowser(azc.zeroconf, "_lutron._tcp.local.", listener)
    print("Listening for the Smart Bridge (10 s)...")
    await asyncio.sleep(10)
    found = 0
    for name in listener.names:
        info = AsyncServiceInfo("_lutron._tcp.local.", name)
        await info.async_request(azc.zeroconf, 3000)
        addrs = [socket.inet_ntoa(a) for a in info.addresses] if info.addresses else []
        props = {k.decode(): v.decode() if isinstance(v, bytes) else v for k, v in (info.properties or {}).items()}
        for ip in addrs:
            found += 1
            print(f"\nBridge: {ip}")
            print(f"  name:   {name}")
            if props:
                print("  props:  " + ", ".join(f"{k}={v}" for k, v in props.items()))
            print(f"  next:   python pair.py {ip}")
    await browser.async_cancel()
    await azc.async_close()
    if not found:
        print("\nNothing answered. Check that this computer is on the same Wi-Fi as the bridge")
        print("(not a guest network), then look in the Lutron app: Settings > Advanced > Integration,")
        print("or in your router's device list for a host named 'Lutron'.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
