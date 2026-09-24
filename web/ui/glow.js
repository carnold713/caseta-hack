// Light, drawn. The owner's rule (calm and flat): one light source, subtle. A page with a lit header has one light
// from the top centre of the screen; a light's page has one light from the lamp itself; small things (an orb, a lamp
// in a strip) cast one soft glow each. Never stacked layers, never a halo on a halo. The house's light maths stays:
// the colour is the lamp's white on the ramp or its colour, the strength is 0.35 + 0.65 x its level, capped at night,
// and off draws nothing at all (off is the absence of light, never a grey glow).
//
//   lightHTML({ kind, level, kelvin | hex, night, name, cls })  -> the one big light of a page ('top' or 'lamp')
//   setLight(el, o)                                             -> the same light, repainted in place
//   glowHTML({ level, kelvin | hex, ctx, x, y, cls, name, night })  -> '<span class="glow"><i></i></span>'
//   setGlow(el, o)                                              -> a small glow, repainted in place
//
// A light is one radial gradient eased from its centre to nothing (the soften-glows curve, with enough stops that a
// large one never bands on the dark), blended `screen` so two lights that overlap add up the way real ones do.
import { lampTint } from '/ui/tint.js';

// Diameters of the small glows by context, Dmin and Dmax (the table in "Size and strength by level").
export const SIZES = {
  hero: [260, 560], pool: [160, 360], card: [140, 320], widget: [80, 200],
  orb: [56, 140], tile: [48, 96], dot: [20, 40],
};

// The white ramp: core, body, wash per stop. Between stops the colours are mixed in mireds. A light is drawn in its
// body tone; the core and wash stay for the few things that shade by them (a candle's flame, a room illustration).
const RAMP = [
  [1900, '#FFB46B', '#FF8A1F', '#B86C35'],
  [2200, '#FFC78A', '#FFB46B', '#B86C35'],
  [2700, '#FFD9A8', '#FFC78A', '#D98A4E'],
  [3000, '#FAE5C9', '#FFD9A8', '#D98A4E'],
  [4000, '#F4F1EA', '#FAE5C9', '#E6A06A'],
  [5000, '#F4F1EA', '#F4F1EA', '#E6A06A'],
];
const rgb = hex => { const h = String(hex).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const hex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
export function whiteStops(kelvin = 2700) {
  const k = Math.max(1900, Math.min(6500, +kelvin || 2700));
  if (k >= 5000) return { core: RAMP[5][1], body: RAMP[5][2], wash: RAMP[5][3], washA: 0.5 };
  let i = 0; while (i < RAMP.length - 2 && k > RAMP[i + 1][0]) i++;
  const [k0, c0, b0, w0] = RAMP[i], [k1, c1, b1, w1] = RAMP[i + 1];
  const t = (1e6 / k0 - 1e6 / k) / (1e6 / k0 - 1e6 / k1);
  return { core: mix(c0, c1, t), body: mix(b0, b1, t), wash: mix(w0, w1, t), washA: 1 };
}
export function colourStops(h) {
  const css = lampTint(h);
  const get = n => (css.match(new RegExp(`--lamp-${n}:([^;]+)`)) || [])[1];
  const glow = get('glow'), lo = get('lo');
  // --lamp-glow is an rgba; take its rgb back out as a hex so alphas can be applied below
  const m = String(glow).match(/rgba\((\d+),(\d+),(\d+)/);
  return { core: m ? hex([+m[1], +m[2], +m[3]]) : '#CFE0FF', body: h, wash: lo || '#2A3F82', washA: 1, colour: true };
}

// ---------- the light's own numbers ----------
// Its colour: a colour lamp's is its colour, a white lamp's is its kelvin's body tone on the ramp.
export const lightColour = ({ kelvin, hex: h } = {}) => (h ? String(h) : whiteStops(kelvin).body);
// Its strength at a level, 0 to 100: the house's curve, capped to 0.7 at night; 0 when off. A level is always a
// percentage: guessing that anything up to 1 was a fraction drew a lamp at 1% as if it were at full.
const frac = level => Math.max(0, Math.min(100, +level || 0)) / 100;
export function lightStrength(level, night = false) {
  const L = frac(level);
  if (L <= 0) return 0;
  return (0.35 + 0.65 * Math.min(1, L)) * (night ? 0.7 : 1);
}
// Lamps lit together, as one light: whites mixed in mireds and colours in linear light, each by its level. `lamps` is
// [{ level, kelvin | hex }]; null when none is lit.
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const unlin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
export function blendLight(lamps) {
  const lit = (lamps || []).filter(l => (+l.level || 0) > 0);
  if (!lit.length) return null;
  let w = 0, mired = 0, sum = 0; const acc = [0, 0, 0];
  for (const l of lit) {
    const lv = +l.level; sum += lv;
    if (!l.hex) { w += lv; mired += lv * 1e6 / (+l.kelvin || 2700); }
  }
  // the whites first, as one white, then every lamp's colour in linear light by level
  const white = w ? whiteStops(1e6 / (mired / w)).body : null;
  for (const l of lit) rgb(l.hex || white).forEach((v, i) => { acc[i] += lin(v) * l.level; });
  return { level: sum / lit.length, hex: hex(acc.map(v => unlin(v / sum))), kelvin: w && lit.every(l => !l.hex) ? Math.round(1e6 / (mired / w)) : null };
}

// The two big lights. 'top': the header's, from just above the top centre of the screen, radius 70% of its width,
// 0.14 at its strongest. 'lamp': a light's page, centred on the lamp, radius 60% of the width, 0.22 at its strongest.
// The peak is in the stylesheet (components.css, .onelight); the element's opacity is the strength, so a level changing
// is an opacity changing, which the dimmer's 0.4 s carries (motion.js), and a colour changing crossfades (data-xf on
// the colour's own layer, so a copy of the old colour fades over the new one).
const lightVars = o => { const s = lightStrength(o.level, o.night); return { s, c: rgb(lightColour(o)).join(',') }; };
export function lightHTML(o = {}) {
  const { s, c } = lightVars(o);
  return `<span class="onelight onelight-${o.kind || 'top'}${s ? '' : ' off'}${o.cls ? ' ' + o.cls : ''}"${o.name ? ` data-light="${o.name}"` : ''} style="opacity:${s.toFixed(3)}" aria-hidden="true"><span class="ol-c" data-xf="" style="--l-c:${c}"><i></i></span></span>`;
}
export function setLight(el, o) {
  if (!el) return;
  const { s, c } = lightVars(o);
  el.style.opacity = s.toFixed(3);
  el.classList.toggle('off', !s);
  const k = el.querySelector('.ol-c'); if (k) k.style.setProperty('--l-c', c);
}

// ---------- the small glows ----------
const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${Math.max(0, Math.min(0.55, a)).toFixed(3)})`; };
// The numbers for one glow: its diameter and its colour at its strength. One layer: what used to be the body, a
// little wider and softer, so it holds the light the three layers held between them.
// `peak` sets its strength at full in place of the house's usual one (a scene's orb keeps its glow at about 0.25).
export function glowSpec({ level, kelvin, hex: h, ctx = 'card', night = false, gain = 1, peak = null } = {}) {
  const L = frac(level);
  if (L <= 0) return null;
  const [dmin, dmax] = SIZES[ctx] || SIZES.card;
  const D = (dmin + (dmax - dmin) * Math.sqrt(L)) * (night ? 0.9 : 1);
  const m = lightStrength(L, night);
  return { D: Math.round(D), c: rgba(h || whiteStops(kelvin).body, (peak ?? (h ? 0.3 : 0.36)) * gain * m) };
}

// CSS custom properties that .glow reads (components.css). Changing these on a live element animates the light
// (the glow transitions opacity and scale on the dimmer), so a redraw that keeps the element keeps the fade.
export function glowVars(o) {
  const s = glowSpec(o);
  if (!s) return '--g-d:0px;--g-on:0';
  return `--g-d:${s.D}px;--g-c:${s.c};--g-on:1`;
}

// The disc carries a class of its own: motion.js pairs an element across a redraw by its tag and class, and knows by
// those whether it transitions at all, so a bare <i> would be taken for any other and its fade never carried.
export function glowHTML(o = {}) {
  const pos = `${o.x != null ? `--g-x:${typeof o.x === 'number' ? o.x + 'px' : o.x};` : ''}${o.y != null ? `--g-y:${typeof o.y === 'number' ? o.y + 'px' : o.y};` : ''}`;
  const on = glowSpec(o) ? '' : ' off';
  return `<span class="glow${on}${o.cls ? ' ' + o.cls : ''}"${o.name ? ` data-glow="${o.name}"` : ''} style="${glowVars(o)};${pos}" aria-hidden="true"><i class="g-l"></i></span>`;
}

// Update a glow in place (so it transitions), e.g. under a finger on a stage.
export function setGlow(el, o) {
  if (!el) return;
  el.setAttribute('style', `${glowVars(o)};${(el.getAttribute('style') || '').split(';').filter(p => /--g-[xy]:/.test(p)).join(';')}`);
  el.classList.toggle('off', !glowSpec(o));
}

// Night: from the wind-down's start (or 10 pm) to 6 am. The app shifts its own chrome; lamps keep their real colour.
export function isNight(now = new Date(), start = '22:00', end = '06:00') {
  const m = now.getHours() * 60 + now.getMinutes();
  const hm = s => { const [h, mm] = String(s).split(':').map(Number); return h * 60 + (mm || 0); };
  const a = hm(start), b = hm(end);
  return a > b ? (m >= a || m < b) : (m >= a && m < b);
}
