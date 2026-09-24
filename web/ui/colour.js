// Whites and colours as the Copper Night sheets draw them (frames 05 and 05b).
//
// The white bar runs 1900K to 6500K and is drawn in mireds, not kelvin: the file puts 2700K at 41.9% of it and a
// 5000K lamp limit at 87.6%, which is exactly where 1,000,000 / K lands and nowhere near a kelvin scale. So equal
// distances on the bar are equal steps as the eye sees them, and the warm end, where lamps differ most, gets room.

export const K_MIN = 1900, K_MAX = 6500;
const mired = k => 1e6 / k;
// The bar's eight stops, as drawn: position along the bar (0 to 1) and colour.
const STOPS = [[0, '#FF8A1F'], [0.19, '#FF9A3C'], [0.42, '#FFAE5E'], [0.52, '#FFBB78'], [0.65, '#FFCB98'], [0.74, '#FFD7B0'], [0.88, '#FFE7D2'], [1, '#FFF6F0']];
export const KELVIN_GRADIENT = `linear-gradient(90deg, ${STOPS.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`;

export const kelvinAt = pos => 1e6 / (mired(K_MIN) - Math.max(0, Math.min(1, pos)) * (mired(K_MIN) - mired(K_MAX)));
export const posOfKelvin = k => (mired(K_MIN) - mired(Math.max(K_MIN, Math.min(K_MAX, k)))) / (mired(K_MIN) - mired(K_MAX));

const hexRgb = h => { const x = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
const rgbHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); };
// The colour of a white, read off the bar itself, so the dot, the thumb's ring and the bar always agree.
export function kelvinHex(k) {
  const p = posOfKelvin(k);
  for (let i = 1; i < STOPS.length; i++) if (p <= STOPS[i][0]) { const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i]; return mix(ca, cb, (p - a) / (b - a)); }
  return STOPS[STOPS.length - 1][1];
}
// The five whites a lamp is offered by name. A lamp that cannot reach one gets the nearest it can, and says so.
export const WHITES = [['Candle', 2200], ['Warm', 2700], ['Neutral', 4000], ['Cool', 5000], ['Daylight', 6500]];

// The twelve lamp colours on board 00, in the order the swatch row shows them. The file names one ("Blue"); the
// rest are named here the same plain way.
export const LAMP_COLOURS = [
  ['Red', '#FF5A4E'], ['Orange', '#FF8A3D'], ['Amber', '#FFC24A'], ['Yellow', '#F5E15B'], ['Lime', '#9EE06A'], ['Green', '#4FD39A'],
  ['Teal', '#3CC6D6'], ['Blue', '#4C8DFF'], ['Indigo', '#6E6BFF'], ['Purple', '#A66BFF'], ['Magenta', '#F06BD2'], ['Pink', '#FF7AA0'],
];

// HSV, for the wheel: the angle is the hue, the distance from the middle the saturation, and a lamp's colour is
// always at full value (how bright is the dial's job).
export function hexHsv(hex) {
  const [r, g, b] = hexRgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}
export function hsvHex(h, s, v = 1) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return rgbHex([f(5), f(3), f(1)].map(x => x * 255));
}
// What a colour is called: the lamp colour nearest in hue, or "White" for one with almost no colour in it.
export function colourName(hex) {
  const { h, s } = hexHsv(hex);
  if (s < 0.12) return 'White';
  let best = LAMP_COLOURS[0][0], bd = 999;
  for (const [n, c] of LAMP_COLOURS) { const dh = Math.abs(((hexHsv(c).h - h + 540) % 360) - 180); if (dh < bd) { bd = dh; best = n; } }
  return best;
}
export const sameHex = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

// The white nearest a colour, for a lamp going from a colour to White (M16): the white on the bar whose balance of
// blue against red is the colour's own, so a blue lands at the cool end, an amber or a red at the warm end. Clamped
// to what the lamp can make and rounded to 50K, as a pick on the sky is. (A formula for the "colour temperature" of
// a colour only holds near the line of whites; a saturated blue is far off it, and this is what the eye expects.)
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const blueShare = hex => { const [r, , b] = hexRgb(hex).map(lin); return r + b ? b / (r + b) : 0.5; };
export function nearestWhite(hex, [kmin, kmax] = [K_MIN, K_MAX]) {
  const want = blueShare(hex);
  let best = kmin, bd = Infinity;
  for (let k = Math.ceil(kmin / 50) * 50; k <= kmax; k += 50) { const dd = Math.abs(blueShare(kelvinHex(k)) - want); if (dd < bd) { bd = dd; best = k; } }
  return best;
}
