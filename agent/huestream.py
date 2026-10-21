"""Hue's streaming mode (the Entertainment API): colours sent to the Hue bridge many times a second.

The ordinary way of setting a Hue light (hue.py, the CLIP API) is good for about ten commands a second per light,
and the bridge starts dropping them past that. Streaming is how Philips' own screen sync does it: an entertainment
area (set up once in the Hue app: which colour lights, and roughly where they stand) is started over CLIP, and
then colours go to the bridge as UDP datagrams on port 2100, inside DTLS 1.2 with a pre-shared key. The bridge
passes them on to the lights at about 25 a second; sending at 50 covers a datagram lost on the Wi-Fi.

  * The key is the clientkey the bridge hands out at pairing (hue.py keeps it in hue.json), and the identity is
    the application id the bridge reports for the application key (GET /auth/v1, header hue-application-id).
  * Python's ssl module has no DTLS and pyOpenSSL has no pre-shared keys, but the OpenSSL that pyOpenSSL is built
    on has both: the handshake runs on pyOpenSSL's memory BIOs, with the key handed over through OpenSSL's own
    PSK callback, and the datagrams go out on an ordinary UDP socket.
  * One message is "HueStream", version 2.0, a sequence number, RGB, the area's id, and then for each channel its
    number and three 16-bit colour values.

pyOpenSSL is imported only when a stream starts, so a connector that has not installed it yet still runs; the
screen sync then says it cannot start, and why.
"""
from __future__ import annotations

import asyncio
import logging
import socket
import struct
from typing import Iterable, Optional, Tuple

LOG = logging.getLogger("huestream")
PORT = 2100
CIPHER = b"PSK-AES128-GCM-SHA256"
DTLS1_2_VERSION = 0xFEFD
HANDSHAKE_S = 6.0


def message(area_id: str, seq: int, channels: Iterable[Tuple[int, float, float, float]]) -> bytes:
    """One HueStream v2 datagram: channels as (channel id, r, g, b), each colour 0..1."""
    body = bytearray(b"HueStream")
    body += bytes([0x02, 0x00, seq & 0xFF, 0x00, 0x00, 0x00, 0x00])  # version 2.0, sequence, reserved, RGB, reserved
    body += area_id.encode("ascii")[:36].ljust(36, b"0")
    for ch, r, g, b in list(channels)[:20]:
        body += struct.pack(">BHHH", ch & 0xFF, _u16(r), _u16(g), _u16(b))
    return bytes(body)


def _u16(v: float) -> int:
    return max(0, min(65535, int(round(v * 65535))))


class DtlsPsk:
    """A DTLS 1.2 client with a pre-shared key, over UDP, for one bridge."""

    def __init__(self, host: str, identity: str, psk_hex: str, port: int = PORT) -> None:
        self.host, self.port = host, port
        self.identity = identity.encode()
        self.psk = bytes.fromhex(psk_hex)
        self.sock: Optional[socket.socket] = None
        self.conn = None
        self._cb = None  # the PSK callback, kept alive for as long as OpenSSL holds it

    async def connect(self, timeout: float = HANDSHAKE_S) -> None:
        from OpenSSL import SSL  # noqa: WPS433  (optional: see the module's note)
        from OpenSSL._util import ffi, lib  # noqa: WPS433

        ctx = SSL.Context(SSL.DTLS_CLIENT_METHOD)
        ctx.set_min_proto_version(DTLS1_2_VERSION)
        ctx.set_max_proto_version(DTLS1_2_VERSION)
        ctx.set_cipher_list(CIPHER)
        identity, psk = self.identity, self.psk

        @ffi.callback("unsigned int(SSL *, const char *, char *, unsigned int, unsigned char *, unsigned int)")
        def give_psk(_ssl, _hint, out_id, max_id, out_psk, max_psk):  # noqa: ANN001
            if len(identity) + 1 > max_id or len(psk) > max_psk:
                return 0
            ffi.memmove(out_id, identity + b"\0", len(identity) + 1)
            ffi.memmove(out_psk, psk, len(psk))
            return len(psk)

        self._cb = give_psk
        lib.SSL_CTX_set_psk_client_callback(ctx._context, give_psk)  # noqa: SLF001
        conn = SSL.Connection(ctx, None)
        conn.set_connect_state()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)
        sock.connect((self.host, self.port))
        self.sock, self.conn = sock, conn
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while True:
            try:
                conn.do_handshake()
                self._flush()
                return
            except SSL.WantReadError:
                self._flush()
            left = deadline - loop.time()
            if left <= 0:
                self.close()
                raise TimeoutError("the Hue bridge did not finish the streaming handshake")
            wait = conn.DTLSv1_get_timeout() or 0.5
            try:
                data = await asyncio.wait_for(loop.sock_recv(sock, 4096), min(wait, left))
                conn.bio_write(data)
            except asyncio.TimeoutError:
                conn.DTLSv1_handle_timeout()
            except OSError as exc:  # ICMP port unreachable comes back as ConnectionRefusedError
                self.close()
                raise ConnectionError(f"the Hue bridge refused the stream: {exc}") from exc
            except SSL.Error as exc:
                self.close()
                raise ConnectionError(f"the Hue bridge would not take the key: {exc}") from exc

    def _flush(self) -> None:
        from OpenSSL import SSL  # noqa: WPS433

        while True:
            try:
                out = self.conn.bio_read(65536)
            except SSL.WantReadError:
                return
            if not out:
                return
            try:
                self.sock.send(out)
            except (BlockingIOError, InterruptedError):
                return  # a full send buffer drops this one; the next message follows a fiftieth of a second later

    def send(self, data: bytes) -> None:
        if self.conn is None:
            raise ConnectionError("not streaming")
        self.conn.send(data)
        self._flush()
        self._drain()

    def _drain(self) -> None:
        """Read whatever the bridge sent back. It only speaks to end the session, which raises here."""
        from OpenSSL import SSL  # noqa: WPS433

        while True:
            try:
                data = self.sock.recv(4096)
            except (BlockingIOError, InterruptedError):
                return
            except OSError as exc:
                raise ConnectionError(f"the Hue bridge stopped taking the stream: {exc}") from exc
            self.conn.bio_write(data)
            try:
                self.conn.recv(4096)
            except SSL.WantReadError:
                pass
            except SSL.ZeroReturnError as exc:
                raise ConnectionError("the Hue bridge ended the stream") from exc
            except SSL.Error as exc:
                raise ConnectionError(f"the stream broke: {exc}") from exc

    def close(self) -> None:
        if self.conn is not None:
            try:
                self.conn.shutdown()
                self._flush()
            except Exception:  # noqa: BLE001
                pass
        if self.sock is not None:
            self.sock.close()
        self.sock = self.conn = None
