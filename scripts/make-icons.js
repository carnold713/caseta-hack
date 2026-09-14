// Generates the PWA icons with no dependencies (a tiny PNG encoder on top of zlib).
// Run: npm run icons
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'web', 'icons');
fs.mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Design: dark rounded square, an amber "dimmer ring" with a bright dot at the 1 o'clock position,
// and a small white Pico-shaped pill in the middle.
const BG = [15, 17, 23], AMBER = [245, 185, 66], TEAL = [79, 209, 197], WHITE = [244, 244, 242];
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function sdRoundBox(px, py, half, r) { const qx = Math.abs(px) - half + r, qy = Math.abs(py) - half + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; }
function aa(d) { return Math.max(0, Math.min(1, 0.5 - d)); } // signed distance -> coverage

function draw(maskable) {
  return (x, y, size) => {
    const s = size / 512;
    const px = (x - size / 2) / s, py = (y - size / 2) / s; // work in a 512 space
    let col = BG, alpha = 1;
    if (!maskable) {
      const d = sdRoundBox(px, py, 256, 96) / s;
      alpha = aa(d);
    }
    // ring
    const r = Math.hypot(px, py);
    const ring = Math.abs(r - 150) - 22;
    const gap = Math.atan2(py, px);
    const inGap = gap > -Math.PI * 0.42 && gap < -Math.PI * 0.18; // an opening near 1 o'clock
    let cov = aa(ring / s) * (inGap ? 0.18 : 1);
    col = mix(col, AMBER, cov);
    // bright dot in the gap
    const dot = Math.hypot(px - 150 * Math.cos(-Math.PI * 0.3), py - 150 * Math.sin(-Math.PI * 0.3)) - 28;
    col = mix(col, TEAL, aa(dot / s));
    // pico pill
    const pill = sdRoundBox(px, py, 58, 26);
    const pillY = Math.abs(py) - 96; // pill is 116 x 192
    const pd = Math.max(sdRoundBox(px, 0, 58, 26), pillY);
    col = mix(col, WHITE, aa(pd / s));
    // three "buttons" on the pill
    for (const cy of [-58, 0, 58]) {
      const bd = sdRoundBox(px, py - cy, 34, 8);
      const bdy = Math.max(bd, Math.abs(py - cy) - 18);
      col = mix(col, cy === 0 ? AMBER : [210, 210, 205], aa(bdy / s));
    }
    void pill;
    return [Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), Math.round(alpha * 255)];
  };
}

fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192, draw(false)));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512, draw(false)));
fs.writeFileSync(path.join(OUT, 'maskable-512.png'), png(512, draw(true)));
console.log('icons written to', OUT);
