// A colour lamp's tile. The file draws exactly one: the blue Accent lamp, #5B7FE0 to #3C5DB8 at 55% to #2A3F82 with a
// #2F4A99 power glyph, a rgba(157,182,255,.45) hairline, a rgba(91,127,224,.35) shadow and a #CFE0FF glow. Every other
// colour is that tile turned round the hue wheel: each stop keeps the lightness and chroma the designer gave it in
// OKLCh and takes the lamp's own hue, and where a hue cannot reach that chroma inside sRGB the chroma comes down until
// it can. So blue comes out exactly as drawn and every other colour has the same weight.
//
// A lamp showing white is not tinted: a white lamp that is on is copper, the same as any other light that is on.

const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const unlin = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function hexRgb(hex) { const h = String(hex).replace('#', ''); const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h; return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255); }
function toOklch(hex) {
  const [r, g, b] = hexRgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, B), H: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}
function fromOklch(L, C, H) {
  const A = C * Math.cos(H * Math.PI / 180), B = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);
const toHex = rgb => '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, unlin(v))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
// Turn one reference stop round the wheel by `dH` degrees, keeping its lightness and chroma where sRGB allows.
function atHue(ref, dH) {
  const { L, C, H: h0 } = toOklch(ref); const H = (h0 + dH + 360) % 360;
  let c = C;
  for (let i = 0; i < 40 && !inGamut(fromOklch(L, c, H)); i++) c *= 0.93;
  return toHex(fromOklch(L, c, H));
}
const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex).map(v => Math.round(v * 255)); return `rgba(${r},${g},${b},${a})`; };

// The blue tile, stop by stop, as the file has it.
const REF = { hi: '#5B7FE0', mid: '#3C5DB8', lo: '#2A3F82', ink: '#2F4A99', line: '#9DB6FF', glow: '#CFE0FF' };
const MEMO = new Map();
// CSS custom properties for .tile.tinted, for a lamp showing `hex`.
export function lampTint(hex) {
  const key = String(hex).toLowerCase();
  if (MEMO.has(key)) return MEMO.get(key);
  const { H, C } = toOklch(hex);
  // a colour so close to grey that it has no hue worth keeping reads as the blue the design drew
  // every stop turns by the same amount, so the small differences in hue between the drawn stops are kept and a lamp
  // showing the drawn blue gets the drawn tile back exactly
  const dH = C < 0.02 ? 0 : H - toOklch(REF.mid).H;
  const t = { hi: atHue(REF.hi, dH), mid: atHue(REF.mid, dH), lo: atHue(REF.lo, dH), ink: atHue(REF.ink, dH), line: atHue(REF.line, dH), glow: atHue(REF.glow, dH) };
  const css = `--lamp-hi:${t.hi};--lamp:${t.mid};--lamp-lo:${t.lo};--lamp-ink:${t.ink};--lamp-line:${rgba(t.line, 0.45)};--lamp-shadow:${rgba(t.hi, 0.35)};--lamp-glow:${rgba(t.glow, 0.55)}`;
  MEMO.set(key, css);
  return css;
}
