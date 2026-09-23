// Light, drawn. Every glow in v7 is the same three layers (design-v7-ui.md, "A lighting system"): a wash that
// spills, a body, and a hot core only above 20%. Each is a radial gradient from its alpha at the centre to nothing,
// blended `screen` so two lights that overlap add up the way real ones do. One function builds all of them, so a
// room's pool, a lamp's halo, an orb and a bead read as one kind of thing.
//
//   glowHTML({ level, kelvin | hex, ctx, x, y, cls, name, night })   -> '<span class="glow">…</span>'
//   glowVars(...)                                                      -> the same, as CSS custom properties
//
// `level` is 0 to 100 (or 0 to 1). Off draws nothing at all: off is the absence of light, never a grey glow.
// `kelvin` picks the white ramp; `hex` a colour lamp, whose stops come from the same OKLCh turn tint.js uses.
// `ctx` is the size table's row. `x`, `y` place the centre (any CSS length; default the middle of the parent).
import { lampTint } from '/ui/tint.js';

// Diameters by context, Dmin and Dmax (the table in "Size and strength by level").
export const SIZES = {
  hero: [260, 560], pool: [160, 360], card: [140, 320], widget: [80, 200],
  orb: [56, 140], tile: [48, 96], dot: [20, 40],
};

// The white ramp: core, body, wash per stop. Between stops the colours are mixed in mireds.
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

const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${Math.max(0, Math.min(0.55, a)).toFixed(3)})`; };

// The numbers for one glow: diameter, the three colours with their alphas, and whether the core is drawn.
export function glowSpec({ level, kelvin, hex: h, ctx = 'card', night = false, gain: o_gain = 1 } = {}) {
  let L = +level || 0; if (L > 1) L /= 100;
  if (L <= 0) return null;
  const [dmin, dmax] = SIZES[ctx] || SIZES.card;
  const D = (dmin + (dmax - dmin) * Math.sqrt(L)) * (night ? 0.9 : 1);
  const m = (0.35 + 0.65 * L) * (night ? 0.7 : 1);
  const st = h ? colourStops(h) : whiteStops(kelvin);
  // The UI doc's alphas (body 0.22, wash 0.10) barely read on a phone; the Figma builders raised them and the
  // frames look right at these, still under the 0.55 ceiling. `gain` lets one place turn a glow up or down.
  const g = o_gain;
  const base = st.colour ? { core: 0.42 * g, body: 0.26 * g, wash: 0.2 * g } : { core: 0.5 * g, body: 0.32 * g, wash: 0.24 * g };
  return {
    D: Math.round(D), core: L > 0.2, blur: night ? 40 : 32,
    coreC: rgba(st.core, base.core * m), bodyC: rgba(st.body, base.body * m),
    washC: rgba(st.wash, base.wash * m * st.washA),
  };
}

// CSS custom properties that .glow reads (components.css). Changing these on a live element animates the light
// (the .glow layers transition opacity and scale on the dimmer), so a redraw that keeps the element keeps the fade.
export function glowVars(o) {
  const s = glowSpec(o);
  if (!s) return '--g-d:0px;--g-on:0';
  return `--g-d:${s.D}px;--g-core:${s.coreC};--g-body:${s.bodyC};--g-wash:${s.washC};--g-blur:${s.blur}px;--g-core-on:${s.core ? 1 : 0};--g-on:1`;
}

export function glowHTML(o = {}) {
  const pos = `${o.x != null ? `--g-x:${typeof o.x === 'number' ? o.x + 'px' : o.x};` : ''}${o.y != null ? `--g-y:${typeof o.y === 'number' ? o.y + 'px' : o.y};` : ''}`;
  const on = glowSpec(o) ? '' : ' off';
  return `<span class="glow${on}${o.cls ? ' ' + o.cls : ''}"${o.name ? ` data-glow="${o.name}"` : ''} style="${glowVars(o)};${pos}" aria-hidden="true"><i class="g-wash"></i><i class="g-body"></i><i class="g-core"></i></span>`;
}

// Update a glow in place (so its layers transition), e.g. under a finger on a dial.
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
