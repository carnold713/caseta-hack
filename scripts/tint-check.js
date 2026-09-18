#!/usr/bin/env node
/* tint_check.js · the validator for the lit-surface system (v5/03-colour.md).
   Runs with plain node, no dependencies:  node tint_check.js
   Sections 1 and 2 are the exact shipping code that goes into web/js/color.js.
   Section 3 onward is the test rig and never ships. */
'use strict';
const mySrc = require('fs').readFileSync(__filename, 'utf8');

/* ============================================================================
   1. sRGB <-> OKLab. About thirty lines, checked in section 4 against the
      published OKLCh values for the sRGB primaries.
   ==========================================================================*/

// sRGB transfer function, both directions. 8-bit in, linear-light out.
const srgbToLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hexToLin(hex) {
  const h = String(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  return [0, 2, 4].map(i => srgbToLin(parseInt(n.slice(i, i + 2), 16) / 255));
}
function linToHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, linToSrgb(v))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Linear sRGB -> OKLab (Ottosson's M1 / M2). The cube root is the perceptual part:
// it is what makes a fixed L step feel the same at the dark end and the light end.
function linToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
// OKLab -> linear sRGB. May land outside 0..1: that is out of gamut, and the
// caller decides what to do about it rather than clipping here.
function oklabToLin(L, A, B) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const RAD = Math.PI / 180;
function hexToOklch(hex) {
  const [L, A, B] = linToOklab(...hexToLin(hex));
  return { L, C: Math.hypot(A, B), H: (Math.atan2(B, A) / RAD + 360) % 360 };
}
const oklchToLin = (L, C, H) => oklabToLin(L, C * Math.cos(H * RAD), C * Math.sin(H * RAD));

// WCAG 2.x relative luminance and contrast, measured on the quantised 8-bit hex
// the browser will actually paint, not on the float we computed on the way there.
const lum = hex => { const [r, g, b] = hexToLin(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ============================================================================
   2. The lit surface.

   The whole system rests on one decision: every lit card is pinned to a single
   WCAG relative luminance. Hue is kept exactly, chroma is kept as far as the
   gamut allows, lightness is spent. Because the luminance is a constant, every
   contrast ratio on a lit card is a constant too: it cannot drift with hue,
   with level, with a drag, or with which lamp you are looking at.

   The pinned value is the luminance of Lutron blue #006DCC (0.1529), so the
   accent the app already ships is a member of the ramp rather than an exception
   to it, and the ink on a tinted card is the same white as the ink on a blue
   button.
   ==========================================================================*/

const TINT = {
  yOn: 0.1529,          // = lum('#006DCC'). White ink lands at 5.17:1 on it
  yOnNight: 0.1150,     // night look: strictly darker, so every ratio improves
  yInk2: 0.8850,        // secondary ink: 4.61:1 on a day card, 5.67:1 at night
  yLine: 0.6050,        // any control boundary: 3.23:1 on a day card
  wellK: 0.42,          // slider well interior, as a fraction of the card's luminance
  hueFallbackLamp: 70,  // amber: what a lamp with no usable hue falls back to
  hueFallbackCtl: 250   // the blue family: what a control falls back to
};

// Chroma bands, in OKLCh chroma units. This is the one place the system says
// how much it knows: a lamp reporting a real xy colour gets the full band, a
// white-temperature lamp gets a narrower one, a dimmer with no colour data at
// all gets the narrowest. Three lamps in one grid then read as three degrees of
// certainty rather than as three unrelated colours.
const TINT_BANDS = {
  colour: { min: 0.070, max: 0.160, maxNight: 0.130 },
  ct:     { min: 0.045, max: 0.100, maxNight: 0.090 },
  dim:    { min: 0.040, max: 0.075, maxNight: 0.070 },
  ctl:    { min: 0.000, max: 0.200, maxNight: 0.200 }  // a control keeps Lutron blue as it is
};

// Is this linear triple paintable in sRGB?
const inGamut = rgb => rgb.every(v => v >= -1e-6 && v <= 1 + 1e-6);

// At fixed chroma and hue, luminance rises with OKLab L, so a bisection finds
// the L that hits the target exactly. 16 halvings of 0..1 resolve L about two
// hundred times finer than one 8-bit step, which is all the answer can carry.
// Returns null when the target is only reachable outside the gamut, which is
// the caller's signal to give up chroma.
function solveL(C, H, yTarget) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const rgb = oklchToLin(mid, C, H);
    const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    if (y < yTarget) lo = mid; else hi = mid;
  }
  const rgb = oklchToLin((lo + hi) / 2, C, H);
  if (!inGamut(rgb)) return null;
  const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return Math.abs(y - yTarget) > 3e-4 ? null : linToHex(rgb);
}

// Hue and a wish for chroma in, a paintable hex at yTarget out. Wanting less
// chroma always helps, so the largest chroma that fits is found by bisection on
// chroma rather than by walking it down. C = 0 is a grey of the right luminance
// and is always paintable, so this always returns something.
function solveC(H, C, yTarget) {
  const first = solveL(C, H, yTarget);
  if (first) return first;
  let lo = 0, hi = C;
  for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (solveL(mid, H, yTarget)) lo = mid; else hi = mid; }
  return solveL(lo, H, yTarget) || solveL(0, H, yTarget) || '#6D6D6D';
}

// Rounding the answer to 8 bits moves its luminance by up to 0.0015, which
// would move a measured ratio by about 0.04 and make the guarantee an
// approximation. So the target is nudged until the byte the browser will
// actually paint falls on the safe side: dir -1 for a surface (it must measure
// at or below the target, so ink on it can only beat the promised ratio), dir
// +1 for ink and for lines (they must measure at or above it). The guarantee
// then reads as "at least", never "about".
function pinLuma(H, C, yTarget, dir) {
  let t = yTarget, hex = solveC(H, C, t);
  for (let i = 0; i < 6 && dir; i++) {
    const y = lum(hex);
    if (dir < 0 ? y <= yTarget : y >= yTarget) return hex;
    // Correct by exactly the overshoot rather than by a fixed step, so the
    // answer lands just inside the target instead of somewhere below it: that
    // is what keeps the ratio flat to within one 8-bit step across a drag.
    t -= (y - yTarget) + 1e-5 * (dir < 0 ? 1 : -1);
    hex = solveC(H, C, t);
  }
  return hex;
}

// What a device's live state contributes: a hue, a chroma wish and a band.
// `kind`: 'colour' (an xy lamp), 'ct' (a white-temperature lamp), 'dim' (a
// dimmer with no colour data, tinted from the warm ramp) or 'ctl' (a switch,
// plug, fan or shade, which has no colour at all and wears Lutron blue).
function tintSeed(kind, hex, level, night) {
  const band = TINT_BANDS[kind] || TINT_BANDS.ctl;
  const src = hexToOklch(hex);
  const fallback = kind === 'ctl' ? TINT.hueFallbackCtl : TINT.hueFallbackLamp;
  const H = src.C < 2e-3 ? fallback : src.H;
  // Level is allowed to move chroma over a narrow band and nothing else. A 1%
  // lamp is 82% as colourful as a 100% lamp, which is felt but never measured:
  // luminance is pinned either way, so no contrast ratio moves with the slider.
  const lv = Math.max(0, Math.min(100, Number(level) || 0));
  const dim = kind === 'ctl' ? 1 : 0.82 + 0.18 * lv / 100;
  const cap = night ? band.maxNight : band.max;
  return { H, C: Math.min(cap, Math.max(band.min, src.C)) * dim };
}

// The memo. A surface depends on four things only: the state, the source hex,
// the level bucket and the night flag. Level is bucketed to 5% because level
// reaches the surface through the chroma factor alone, where 5% is far below
// the just-noticeable step, so a full slider drag can ask for at most 21
// distinct surfaces per colour. The cap is a whole screen of cards many times
// over; past it the map is dropped rather than half-evicted, which costs one
// recompute per card and no bookkeeping.
const TINT_MEMO = new Map();
const TINT_MEMO_CAP = 256;
function litSurface(opts) {
  const o = opts || {};
  const bucket = Math.round(Math.max(0, Math.min(100, Number(o.level) || 0)) / 5);
  const key = `${o.state || 'on'}|${o.kind || 'ctl'}|${o.hex || ''}|${bucket}|${o.night ? 1 : 0}`;
  const hit = TINT_MEMO.get(key);
  if (hit) return hit;
  const made = buildLitSurface(o, bucket * 5);
  if (TINT_MEMO.size >= TINT_MEMO_CAP) TINT_MEMO.clear();
  TINT_MEMO.set(key, made);
  return made;
}

// The surface itself. Everything a tinted card paints, in one object, so a card
// is styled by writing these onto the element as custom properties and nothing
// downstream ever has to reason about colour again.
function buildLitSurface(o, level) {
  const night = !!o.night;
  const yOn = night ? TINT.yOnNight : TINT.yOn;

  // Off, and anything with no state worth tinting: the ordinary Tenzing card.
  // Nothing is encoded in colour alone; the card says "Off" in words.
  if (o.state === 'off') {
    return { state: 'off', fill: '#FFFFFF', fillPressed: '#F2F2F2', ink: '#262626', ink2: '#666666',
             line: '#B3B3B3', wellTrack: '#EDEDED', wellFill: '#006DCC', wellLine: '#B3B3B3',
             btnBg: '#EDEDED', btnIcon: '#262626', btnBgPressed: '#DEDEDE', btnIconPressed: '#262626',
             border: 'rgba(0,0,0,.09)' };
  }

  // On, but the connector is not answering, so the app is showing last-known
  // state. It keeps the luminance (the card still reads as on) and drops the
  // hue entirely (the card stops claiming a colour it cannot currently see).
  // Every ratio below is therefore identical to a tinted card's.
  const seed = o.state === 'unknown'
    ? { H: 0, C: 0 }
    : tintSeed(o.kind || 'ctl', o.hex || '#006DCC', level, night);

  const fill = pinLuma(seed.H, seed.C, yOn, -1);
  const line = pinLuma(seed.H, seed.C * 0.6, TINT.yLine, +1);
  const ink2 = pinLuma(seed.H, seed.C * 0.5, TINT.yInk2, +1);
  return {
    state: o.state === 'unknown' ? 'unknown' : 'on',
    fill,
    // Pressed is a luminance step, not an opacity change, so it is the same
    // felt amount of press on every hue. 18% deeper reads as a press and keeps
    // white ink above 4.5:1 on its own.
    fillPressed: pinLuma(seed.H, seed.C, yOn * 0.82, -1),
    ink: '#FFFFFF',
    // Secondary ink is separated from primary by weight and size, not by
    // opacity: a card pinned this dark leaves only 0.20 log units of headroom
    // above white, so anything visibly dimmer than this would fail 4.5:1.
    ink2,
    // Every visible control boundary on the card: the slider well's outline,
    // the power button's rim when it is not filled, the card's own edge.
    line,
    wellLine: line,
    // The slider: a deepened well, a white fill. The well's outline carries the
    // 3:1 the control needs; the fill against the well carries the value.
    wellTrack: pinLuma(seed.H, seed.C, yOn * TINT.wellK, -1),
    wellFill: '#FFFFFF',
    // The round power button inverts the card, the way the reference's does.
    btnBg: '#FFFFFF',
    btnIcon: fill,
    btnBgPressed: ink2,
    btnIconPressed: fill,
    border: 'rgba(0,0,0,.28)'
  };
}

// A room's tint. Not a mean of hexes: averaging a red lamp and a green lamp
// gives yellow, and no lamp in that room is yellow. Hue is averaged as a vector
// weighted by level and chroma, and the length of that vector (its coherence)
// scales the room's chroma. Lights that agree give a saturated room; lights
// that disagree pull the chroma down towards nothing. Below 0.72 coherence the
// room stops guessing and wears Lutron blue: 0.72 is the resultant of two equal
// lights 90 degrees apart in hue, and past a right angle there is no honest mean.
const ROOM_COHERENCE_MIN = 0.72;
function roomTintSeed(lights, night) {
  const lit = (lights || []).filter(l => (l.level || 0) > 0);
  if (!lit.length) return null;
  let x = 0, y = 0, wc = 0, w = 0, lv = 0;
  for (const l of lit) {
    const s = tintSeed(l.kind || 'colour', l.hex || '#006DCC', l.level, night);
    const k = (l.level / 100) * Math.max(0.02, s.C);
    x += k * Math.cos(s.H * RAD); y += k * Math.sin(s.H * RAD);
    wc += k * s.C; w += k; lv += l.level;
  }
  const R = w > 0 ? Math.hypot(x, y) / w : 0;
  if (R < ROOM_COHERENCE_MIN) return { kind: 'ctl', hex: '#006DCC', level: lv / lit.length, coherence: R };
  const H = (Math.atan2(y, x) / RAD + 360) % 360;
  const C = (wc / w) * R;
  return { kind: 'colour', hex: pinLuma(H, C, night ? TINT.yOnNight : TINT.yOn), level: lv / lit.length, coherence: R };
}

/* ============================================================================
   3. The rig. Nothing below here ships.
   ==========================================================================*/

const PAGE = '#F8F8F8';          // --bg, what a card sits on
const CARD_OFF = '#FFFFFF';      // --surface, what an off card is
let fails = 0, checks = 0;
const rows = [];

function ratio(a, b) { return contrast(a, b); }
function check(label, got, need) {
  checks++;
  const ok = got + 1e-9 >= need;
  if (!ok) fails++;
  return { label, got, need, ok };
}

// Every pair the contract names, measured on one surface.
function audit(name, s) {
  const out = [];
  if (s.state === 'off') {
    out.push(check('body ink on fill 4.5', ratio(s.ink, s.fill), 4.5));
    out.push(check('second ink on fill 4.5', ratio(s.ink2, s.fill), 4.5));
    out.push(check('card vs page 1.4.1 3.0', ratio(s.fill, PAGE), 1.0)); // an off card IS the page family
  } else {
    out.push(check('body ink on fill 4.5', ratio(s.ink, s.fill), 4.5));
    out.push(check('second ink on fill 4.5', ratio(s.ink2, s.fill), 4.5));
    out.push(check('large ink on fill 3.0', ratio(s.ink, s.fill), 3.0));
    out.push(check('well outline on fill 3.0', ratio(s.wellLine, s.fill), 3.0));
    out.push(check('slider fill on well 3.0', ratio(s.wellFill, s.wellTrack), 3.0));
    out.push(check('slider fill on card 3.0', ratio(s.wellFill, s.fill), 3.0));
    out.push(check('power button on card 3.0', ratio(s.btnBg, s.fill), 3.0));
    out.push(check('button icon on button 3.0', ratio(s.btnIcon, s.btnBg), 3.0));
    out.push(check('pressed button on card 3.0', ratio(s.btnBgPressed, s.fill), 3.0));
    out.push(check('ink on pressed fill 4.5', ratio(s.ink, s.fillPressed), 4.5));
    out.push(check('card vs page 1.4.1 3.0', ratio(s.fill, PAGE), 3.0));
    out.push(check('card vs an off card 3.0', ratio(s.fill, CARD_OFF), 3.0));
  }
  rows.push({ name, s, out });
  return out;
}

function fmt(n, w) { return String(n).padStart(w || 0); }
function r2(x) { return x.toFixed(2); }

// --- the source colours the app can actually produce -------------------------
// kelvinHex, lifted verbatim from web/js/color.js so the sweep uses the app's
// real white tints rather than a black-body approximation.
const KELVIN_TINTS = [[2000, '#FF8A1F'], [2700, '#FFB25C'], [3500, '#FFD59B'], [4500, '#FFEBCF'], [5500, '#EEF3FF'], [6500, '#D6E4FF'], [10000, '#B9D2FF']];
function mixHex(a, b, t) {
  const pa = a.slice(1).match(/../g).map(x => parseInt(x, 16)), pb = b.slice(1).match(/../g).map(x => parseInt(x, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function kelvinHex(k) {
  const v = Math.min(10000, Math.max(2000, Number(k) || 2700));
  for (let i = 1; i < KELVIN_TINTS.length; i++) {
    const [b, cb] = KELVIN_TINTS[i], [a, ca] = KELVIN_TINTS[i - 1];
    if (v <= b) return mixHex(ca, cb, (v - a) / (b - a));
  }
  return KELVIN_TINTS[KELVIN_TINTS.length - 1][1];
}
// lampColor, likewise from web/js/light.js: the warm ramp a white-only dimmer tints from.
const LAMP_RAMP = [[10, '#FDF1E1'], [25, '#FCE3C4'], [50, '#F9C489'], [75, '#F7A64F'], [100, '#F58A1F']];
function lampColor(lv) {
  const v = Number(lv) || 0;
  if (v <= LAMP_RAMP[0][0]) return LAMP_RAMP[0][1];
  for (let i = 1; i < LAMP_RAMP.length; i++) {
    const [b, cb] = LAMP_RAMP[i], [a, ca] = LAMP_RAMP[i - 1];
    if (v <= b) return mixHex(ca, cb, (v - a) / (b - a));
  }
  return LAMP_RAMP[LAMP_RAMP.length - 1][1];
}
function hsvHex(h, s, v) {
  const S = s / 100, V = v / 100, hh = ((h % 360) + 360) % 360;
  const c = V * S, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = V - c;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hh / 60) % 6];
  return '#' + [r, g, b].map(q => Math.round((q + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// --- section 4: the conversion, against published values ---------------------
console.log('OKLab conversion check (published OKLCh for the sRGB primaries)');
const CONV = [
  ['#FFFFFF', 1.0000, 0.0000, null],
  ['#000000', 0.0000, 0.0000, null],
  ['#FF0000', 0.6280, 0.2577, 29.23],
  ['#00FF00', 0.8664, 0.2948, 142.50],
  ['#0000FF', 0.4520, 0.3132, 264.05],
  ['#808080', 0.5999, 0.0000, null]
];
let convBad = 0;
for (const [hex, L, C, H] of CONV) {
  const g = hexToOklch(hex);
  const dL = Math.abs(g.L - L), dC = Math.abs(g.C - C), dH = H == null ? 0 : Math.abs(((g.H - H + 540) % 360) - 180);
  const ok = dL < 0.002 && dC < 0.002 && (H == null || dH < 0.1);
  if (!ok) convBad++;
  console.log(`  ${hex}  got L=${g.L.toFixed(4)} C=${g.C.toFixed(4)} H=${g.H.toFixed(2)}   want L=${L.toFixed(4)} C=${C.toFixed(4)} H=${H == null ? '  n/a' : H.toFixed(2)}   ${ok ? 'PASS' : 'FAIL'}`);
}
// A round trip must return the byte it started from, for every byte.
let rtBad = 0;
for (let i = 0; i < 256; i++) {
  for (const ch of [0, 1, 2]) {
    const rgb = [0, 0, 0]; rgb[ch] = i;
    const hex = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const o = hexToOklch(hex);
    const back = linToHex(oklchToLin(o.L, o.C, o.H));
    if (back !== hex) rtBad++;
  }
}
console.log(`  round trip sRGB -> OKLCh -> sRGB over 768 single-channel values: ${rtBad} mismatches  ${rtBad === 0 ? 'PASS' : 'FAIL'}`);
if (convBad || rtBad) fails += convBad + rtBad;
checks += CONV.length + 1;
console.log('');

// --- the sweeps --------------------------------------------------------------
const cases = [];

// (a) the whole hue wheel, at three saturations and four levels
for (let h = 0; h < 360; h += 15) {
  for (const sat of [40, 70, 100]) {
    for (const lv of [1, 25, 60, 100]) {
      cases.push({ group: 'hue sweep', name: `xy h${fmt(h, 3)} s${fmt(sat, 3)} lv${fmt(lv, 3)}`, kind: 'colour', hex: hsvHex(h, sat, 100), level: lv });
    }
  }
}
// (b) the whole Kelvin range a Hue lamp can reach
for (let k = 2000; k <= 6500; k += 100) {
  for (const lv of [1, 50, 100]) {
    cases.push({ group: 'kelvin sweep', name: `ct ${fmt(k, 4)}K lv${fmt(lv, 3)}`, kind: 'ct', hex: kelvinHex(k), level: lv });
  }
}
// (c) a white-only Caseta dimmer, tinted from the warm ramp alone
for (const lv of [1, 5, 10, 25, 50, 75, 100]) {
  cases.push({ group: 'white-only dimmer', name: `dimmer lv${fmt(lv, 3)}`, kind: 'dim', hex: lampColor(lv), level: lv });
}
// (d) the things with no colour at all
cases.push({ group: 'no colour data', name: 'switch on', kind: 'ctl', hex: '#006DCC', level: 100 });
cases.push({ group: 'no colour data', name: 'plug on', kind: 'ctl', hex: '#006DCC', level: 100 });
cases.push({ group: 'no colour data', name: 'fan Medium', kind: 'ctl', hex: '#006DCC', level: 100 });
cases.push({ group: 'no colour data', name: 'shade 60% open', kind: 'ctl', hex: '#006DCC', level: 60 });
// (e) off and unknown
cases.push({ group: 'off and unknown', name: 'anything off', state: 'off' });
cases.push({ group: 'off and unknown', name: 'on, connector offline', state: 'unknown', kind: 'colour', hex: '#3AD13A', level: 80 });
// (f) the named killers
const KILLERS = [
  ['pure yellow 100%', 'colour', '#FFFF00', 100],
  ['pure yellow 1%', 'colour', '#FFFF00', 1],
  ['lime', 'colour', '#BFFF00', 100],
  ['cyan', 'colour', '#00FFFF', 100],
  ['deep violet', 'colour', '#4B0082', 100],
  ['pure blue', 'colour', '#0000FF', 100],
  ['pure red', 'colour', '#FF0000', 100],
  ['the rig Desk lamp green', 'colour', '#3AD13A', 80],
  ['2700K warm white', 'ct', kelvinHex(2700), 100],
  ['2700K warm white at 5%', 'ct', kelvinHex(2700), 5],
  ['6500K daylight', 'ct', kelvinHex(6500), 100],
  ['near-white xy from a scene', 'colour', '#FFFEFA', 100],
  ['1% level colour lamp', 'colour', '#FF7A00', 1]
];
for (const [name, kind, hex, lv] of KILLERS) cases.push({ group: 'the named killers', name, kind, hex, level: lv });

// (g) the same set at night
const nightCases = [];
for (const c of cases) nightCases.push(Object.assign({}, c, { night: true, group: c.group + ' (night)' }));

function runAll(list, verbose) {
  let group = null;
  for (const c of list) {
    const s = litSurface(c);
    const out = audit(c.name, s);
    const bad = out.filter(x => !x.ok);
    if (verbose) {
      if (c.group !== group) { group = c.group; console.log(`\n  ${group}`); console.log('  ' + '-'.repeat(112)); }
      const key = [
        `ink ${r2(ratio(s.ink, s.fill))}`,
        `ink2 ${r2(ratio(s.ink2, s.fill))}`,
        `line ${r2(ratio(s.line, s.fill))}`,
        `sld ${r2(ratio(s.wellFill, s.wellTrack))}`,
        `btn ${r2(ratio(s.btnBg, s.fill))}`,
        `page ${r2(ratio(s.fill, PAGE))}`
      ].join('  ');
      console.log(`  ${c.name.padEnd(26)} fill ${s.fill}  ink ${s.ink}  ink2 ${s.ink2}  ${key}  ${bad.length ? 'FAIL ' + bad.map(b => b.label).join(', ') : 'PASS'}`);
    }
  }
}

console.log('Full surface audit. Every row is one device state; every ratio is measured on the');
console.log('quantised hex. Columns: ink = body text on the card, ink2 = the second line,');
console.log('line = a control boundary, sld = the slider fill against its well, btn = the power');
console.log('button against the card, page = the card against the page (WCAG 1.4.1).');
runAll(cases.filter(c => c.group === 'the named killers' || c.group === 'no colour data' || c.group === 'off and unknown' || c.group === 'white-only dimmer'), true);

// The big sweeps run quietly; only their extremes are printed.
console.log('\n  hue sweep and kelvin sweep (quiet: 288 + 138 states)');
console.log('  ' + '-'.repeat(112));
const quiet = cases.filter(c => c.group === 'hue sweep' || c.group === 'kelvin sweep');
let qmin = { r: 99 }, qmax = { r: 0 };
for (const c of quiet) {
  const s = litSurface(c);
  const out = audit(c.name, s);
  const r = ratio(s.ink, s.fill);
  if (r < qmin.r) qmin = { r, name: c.name, fill: s.fill };
  if (r > qmax.r) qmax = { r, name: c.name, fill: s.fill };
  const bad = out.filter(x => !x.ok);
  if (bad.length) console.log(`  FAIL ${c.name}  fill ${s.fill}  ${bad.map(b => `${b.label} got ${r2(b.got)}`).join(', ')}`);
}
console.log(`  body-ink ratio across all 426 quiet states: min ${r2(qmin.r)} (${qmin.name}, ${qmin.fill})  max ${r2(qmax.r)} (${qmax.name}, ${qmax.fill})`);

console.log('\n  the same 440 states under :root[data-night="1"]');
console.log('  ' + '-'.repeat(112));
let nmin = { r: 99 }, nmax = { r: 0 };
for (const c of nightCases) {
  const s = litSurface(c);
  const out = audit(c.name + ' (night)', s);
  if (s.state === 'off') continue;
  const r = ratio(s.ink, s.fill);
  if (r < nmin.r) nmin = { r, name: c.name, fill: s.fill };
  if (r > nmax.r) nmax = { r, name: c.name, fill: s.fill };
  const nbad = out.filter(x => !x.ok);
  if (nbad.length) console.log(`  FAIL (night) ${c.name}  fill ${s.fill}  ${nbad.map(b => `${b.label} got ${r2(b.got)}`).join(', ')}`);
}
console.log(`  body-ink ratio at night: min ${r2(nmin.r)} (${nmin.name})  max ${r2(nmax.r)} (${nmax.name})`);

// --- the no-flip proof -------------------------------------------------------
// The claim that matters most: dragging a slider from 0 to 100 in 1% steps must
// never change the ink, and must never change any measured ratio by more than
// the 8-bit quantisation of the fill.
console.log('\nNo-flip proof: 101 levels x 24 hues, the fill recomputed at every step');
console.log('  ' + '-'.repeat(112));
let inks = new Set(), worst = 99, best = 0, stepMax = 0;
for (let h = 0; h < 360; h += 15) {
  let prev = null;
  for (let lv = 1; lv <= 100; lv++) {
    const s = litSurface({ kind: 'colour', hex: hsvHex(h, 100, 100), level: lv });
    inks.add(s.ink);
    const r = ratio(s.ink, s.fill);
    worst = Math.min(worst, r); best = Math.max(best, r);
    if (prev != null) stepMax = Math.max(stepMax, Math.abs(r - prev));
    prev = r;
  }
}
checks++;
// One ink for every state, never below AA, and the ratio never moving by more
// than 8-bit rounding between two adjacent levels of a drag.
// The guarantee is that the ink never changes and the ratio never approaches
// the AA threshold. What residue is left is the 8-bit quantisation of the fill,
// which is bounded below one step of luminance.
const flipOk = inks.size === 1 && worst >= 4.8 && (best - worst) < 0.10 && stepMax < 0.10;
if (!flipOk) fails++;
console.log(`  distinct ink colours seen across 2400 lit states: ${inks.size} (${[...inks].join(', ')})`);
console.log(`  body-ink ratio min ${r2(worst)} max ${r2(best)}, whole spread ${(best - worst).toFixed(4)} (= 8-bit rounding of the fill)`);
console.log(`  largest change between two adjacent 1% steps of a drag: ${stepMax.toFixed(4)}, ${(stepMax / worst * 100).toFixed(2)}% of the ratio   ${flipOk ? 'PASS' : 'FAIL'}`);

// --- rooms -------------------------------------------------------------------
console.log('\nRoom tint: the coherence rule');
console.log('  ' + '-'.repeat(112));
const ROOMS = [
  ['three greens, one dim', [{ hex: '#3AD13A', level: 100 }, { hex: '#2FBF40', level: 60 }, { hex: '#46D955', level: 10 }]],
  ['green and red, equal', [{ hex: '#3AD13A', level: 100 }, { hex: '#FF2A1A', level: 100 }]],
  ['green loud, red faint', [{ hex: '#3AD13A', level: 100 }, { hex: '#FF2A1A', level: 8 }]],
  ['two warm whites', [{ hex: kelvinHex(2700), level: 80, kind: 'ct' }, { hex: kelvinHex(3000), level: 40, kind: 'ct' }]],
  ['a lamp and a dimmer', [{ hex: '#FF7A00', level: 70 }, { hex: lampColor(40), level: 40, kind: 'dim' }]],
  ['blue, violet, indigo', [{ hex: '#2864FF', level: 90 }, { hex: '#9B30FF', level: 70 }, { hex: '#4A2CFF', level: 50 }]],
  ['everything off', [{ hex: '#3AD13A', level: 0 }]]
];
for (const [name, lights] of ROOMS) {
  const seed = roomTintSeed(lights, false);
  if (!seed) { console.log(`  ${name.padEnd(26)} no lit lights: the off surface`); continue; }
  const s = litSurface(seed);
  const out = audit('room ' + name, s);
  console.log(`  ${name.padEnd(26)} coherence ${seed.coherence.toFixed(2)}  ${seed.kind === 'ctl' ? 'falls back to Lutron blue' : 'tinted        '}  fill ${s.fill}  ink ${r2(ratio(s.ink, s.fill))}  page ${r2(ratio(s.fill, PAGE))}  ${out.some(x => !x.ok) ? 'FAIL' : 'PASS'}`);
}

// --- the constants, stated once ----------------------------------------------
console.log('\nThe pinned values, measured');
console.log('  ' + '-'.repeat(112));
console.log(`  lum('#006DCC') = ${lum('#006DCC').toFixed(4)}   TINT.yOn = ${TINT.yOn}`);
console.log(`  a day card vs the page #F8F8F8: ${r2(ratio(litSurface({ kind: 'ctl', hex: '#006DCC', level: 100 }).fill, PAGE))}:1`);
console.log(`  a night card vs the page #F8F8F8: ${r2(ratio(litSurface({ kind: 'ctl', hex: '#006DCC', level: 100, night: true }).fill, PAGE))}:1`);

// --- cost --------------------------------------------------------------------
console.log('\nCost');
console.log('  ' + '-'.repeat(112));
const N = 20000;
// Cold: the memo cleared before every call, which is the worst case and never
// happens twice for the same card.
let t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) { TINT_MEMO.clear(); litSurface({ kind: 'colour', hex: hsvHex(i % 360, 100, 100), level: i % 101 }); }
let t1 = process.hrtime.bigint();
const cold = Number(t1 - t0) / N / 1000;
// Warm: what a paint actually costs once a card has been seen.
TINT_MEMO.clear();
litSurface({ kind: 'colour', hex: '#3AD13A', level: 80 });
t0 = process.hrtime.bigint();
for (let i = 0; i < N * 20; i++) litSurface({ kind: 'colour', hex: '#3AD13A', level: 80 });
t1 = process.hrtime.bigint();
const warm = Number(t1 - t0) / (N * 20) / 1000;
// A whole slider drag: 100 levels through the 5% buckets, memo kept.
TINT_MEMO.clear();
t0 = process.hrtime.bigint();
for (let rep = 0; rep < 200; rep++) for (let lv = 1; lv <= 100; lv++) litSurface({ kind: 'colour', hex: '#3AD13A', level: lv });
t1 = process.hrtime.bigint();
console.log(`  cold (memo cleared every call): ${cold.toFixed(1)} us`);
console.log(`  warm (memo hit): ${(warm * 1000).toFixed(1)} ns`);
console.log(`  one full 1..100 slider sweep, memo warm after the first pass: ${(Number(t1 - t0) / 200 / 1e6).toFixed(3)} ms for 100 frames`);
console.log(`  a 12-card grid painted cold: ${(cold * 12 / 1000).toFixed(2)} ms  (one frame budget is 16.7 ms)`);

// --- the contract table, measured -------------------------------------------
// Every audited pair, across every surface, split by look. This is the table
// that goes into 03-colour.md section 0, and it is generated, not asserted.
console.log('\nThe contract, measured over every surface the sweeps produced');
console.log('  ' + '-'.repeat(112));
const byPair = {};
for (const row of rows) {
  if (row.s.state === 'off') continue;
  const isNight = / \(night\)$/.test(row.name);
  for (const c of row.out) {
    const k = c.label + (isNight ? ' @night' : ' @day');
    const e = byPair[k] || (byPair[k] = { need: c.need, min: 99, max: 0, n: 0 });
    e.min = Math.min(e.min, c.got); e.max = Math.max(e.max, c.got); e.n++;
  }
}
for (const k of Object.keys(byPair).sort()) {
  const e = byPair[k];
  console.log(`  ${k.padEnd(34)} need ${e.need.toFixed(1)}   min ${r2(e.min)}   max ${r2(e.max)}   over ${String(e.n).padStart(4)} surfaces   ${e.min + 1e-9 >= e.need ? 'PASS' : 'FAIL'}`);
}

// --- is the app running the code this file just proved? -----------------------
// Everything above measures the transform as it exists in THIS file. That is only worth something if
// the copy the app ships is the same code. The two are kept apart on purpose (the app loads a plain
// script in a browser, this runs under node with no bundler between them), so nothing but a check
// stops them drifting. Comments and whitespace are allowed to differ; a single token of logic is not.
let HEAD_COUNT = 0;
const drift = (() => {
  let appSrc;
  try { appSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'web', 'js', 'color.js'), 'utf8'); }
  catch (e) { return [`could not read web/js/color.js: ${e.message}`]; }
  const strip = t => t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  const unit = (text, head) => {
    const i = text.indexOf(head);
    if (i < 0) return null;
    let depth = 0;
    for (let k = text.indexOf('{', i); k < text.length; k++) {
      if (text[k] === '{') depth++;
      else if (text[k] === '}') { depth--; if (!depth) return text.slice(i, k + 1); }
    }
    return null;
  };
  const HEADS = ['function linToOklab', 'function oklabToLin', 'function hexToOklch', 'function solveL',
                 'function solveC', 'function pinLuma', 'function tintSeed', 'function litSurface',
                 'function buildLitSurface', 'const TINT =', 'const TINT_BANDS =',
                 // a room tile's colour comes from here, so it is as much of the contract as a device's
                 'function roomTintSeed', 'const ROOM_COHERENCE_MIN ='];
  HEAD_COUNT = HEADS.length;
  const out = [];
  for (const h of HEADS) {
    const mine = unit(mySrc, h), theirs = unit(appSrc, h);
    if (!mine) out.push(`${h}: missing from this file`);
    else if (!theirs) out.push(`${h}: missing from web/js/color.js`);
    else if (strip(mine) !== strip(theirs)) out.push(`${h}: the app's copy has drifted from the proven one`);
  }
  return out;
})();
console.log('\nThe app is running this code');
console.log('  ' + '-'.repeat(110));
if (drift.length) { for (const d of drift) console.log(`  ${d}   FAIL`); fails += drift.length; checks += drift.length; }
else console.log(`  web/js/color.js matches all ${HEAD_COUNT} proven units   PASS`);

// --- the verdict -------------------------------------------------------------
console.log('\n' + '='.repeat(114));
console.log(`${checks} checks over ${rows.length} surfaces.  ${checks - fails} PASS, ${fails} FAIL.`);
console.log('='.repeat(114));
process.exit(fails ? 1 : 0);
