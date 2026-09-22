/* Colour and white temperature, for the lamps that have them (Philips Hue today).
   One component, drawn by the light detail sheet and the scene editor: a Warmth slider on a warm-to-cool
   track over the lamp's own kelvin range, a row of swatches (whites from the warmth scale first, then
   colours) and "More colours…", a value row that opens a hue strip and a saturation slider. The host
   registers itself under a namespace (colorHost) and is handed set(id, {kelvin} | {hex} | null) calls;
   nothing here talks to the hub. The sliders are native range inputs on a 0..100 scale, so slide.js's
   gesture gate applies to them like every other slider: a passing finger scrolls, a sideways drag sets.
   Loaded before light.js; the ramp helpers it leans on (lampColor, mixHex, lampOff) are only read when called. */
'use strict';

// ---------- names and tints ----------
// What a white is called: the data layer's (web/data/daylight.js), since every white it names is on that scale.
const WARMTH_NAMES = CasetaDaylight.WARMTH_NAMES;
const warmthName = CasetaDaylight.warmthName;
// The tint a white tone is painted in: the lamp ramp's orange at the warm end, peach in the middle, a pale blue when
// cool. A true black-body white is nearly white on a white sheet, so a cool lamp would look off; this keeps it lit.
const KELVIN_TINTS = [[2000, '#FF8A1F'], [2700, '#FFB25C'], [3500, '#FFD59B'], [4500, '#FFEBCF'], [5500, '#EEF3FF'], [6500, '#D6E4FF'], [10000, '#B9D2FF']];
function kelvinHex(k) {
  const v = clamp(Number(k) || 2700, KELVIN_TINTS[0][0], KELVIN_TINTS[KELVIN_TINTS.length - 1][0]);
  for (let i = 1; i < KELVIN_TINTS.length; i++) { const [b, cb] = KELVIN_TINTS[i], [a, ca] = KELVIN_TINTS[i - 1]; if (v <= b) return mixHex(ca, cb, (v - a) / (b - a)); }
  return KELVIN_TINTS[KELVIN_TINTS.length - 1][1];
}
function hsvHex(h, s, v) {
  const S = clamp(s, 0, 100) / 100, V = clamp(v, 0, 100) / 100, hh = ((h % 360) + 360) % 360;
  const c = V * S, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = V - c;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hh / 60) % 6];
  return '#' + [r, g, b].map(q => Math.round((q + m) * 255).toString(16).padStart(2, '0')).join('');
}
function hexHsv(hex) {
  const [r, g, b] = String(hex || '#ffffff').slice(1).match(/../g).map(x => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
  return { h, s: max ? Math.round(d / max * 100) : 0, v: Math.round(max * 100) };
}
const sameHex = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
// A lamp's disc in its own colour: pale at a low level, the full colour at 100 (the lamp ramp's idea, in any hue).
function lampFill(hex, lv) { const v = clamp(Number(lv) || 0, 0, 100); if (v <= 0) return lampOff(); return mixHex('#FFFFFF', String(hex).toUpperCase(), 0.3 + 0.7 * v / 100); }
// The hex a scene entry paints as: the white it would be showing right now when it follows the day, the tint for
// a fixed white temperature, the colour itself otherwise.
function entryHex(c) {
  if (!c) return null;
  if (c.follow) { const k = typeof followKelvin === 'function' ? followKelvin() : null; return k ? kelvinHex(k) : null; }
  return c.mode === 'ct' ? kelvinHex(c.kelvin) : c.hex || null;
}
// The hex a colour state paints as: the tint for a white temperature, the colour itself otherwise.
function stateHex(c) { if (!c) return null; if (c.mode === 'ct' && c.kelvin) return kelvinHex(c.kelvin); return c.hex || null; }
// The fill for a light's disc: its real colour when its state carries one and it is on, else the lamp ramp.
function lightFill(id, lv) { const h = stateHex((S.states[id] || {}).color); return h && lv > 0 ? lampFill(h, lv) : lampColor(lv); }
const colorState = id => (S.states[id] || {}).color || null;

// ---------- swatches ----------
const SWATCH_WHITES = [2200, 2700, 3200, 4000, 5000, 6500];
const SWATCH_COLOURS = [['Red', '#ff2a1a'], ['Orange', '#ff7a00'], ['Amber', '#ffb000'], ['Yellow', '#ffe600'], ['Green', '#3ad13a'], ['Teal', '#1fc7b8'], ['Blue', '#2864ff'], ['Indigo', '#4a2cff'], ['Purple', '#9b30ff'], ['Pink', '#ff3fa4']];
// The row shows eight; the rest of the wheel lives behind "More colours…", so the light page stays one screen.
const SWATCH_ROW = SWATCH_COLOURS.filter(([n]) => n !== 'Indigo' && n !== 'Pink');
// how far a colour is from a swatch, in plain channel distance (the same measure colourLabel names a colour by)
function hexDist(a, b) { const p = h => h.slice(1).match(/../g).map(x => parseInt(x, 16)); const [r, g, bl] = p(a), [r2, g2, b2] = p(b); return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(bl - b2); }
// The swatch the lamp is nearest to, so a colour that came from a scene or a command still marks one; null when it is its own colour.
function nearestSwatch(hex, list) { if (!hex) return null; const hexes = list || SWATCH_ROW.map(([, hx]) => hx); let best = null, bd = 1e9; for (const hx of hexes) { const d = hexDist(hex, hx); if (d < bd) { bd = d; best = hx; } } return bd <= 48 ? best : null; }
// "Warm · 2700 K", "Red", "Custom", "Follow the day" or "As it is": what a colour value reads as.
function colourLabel(cur) {
  if (cur && cur.follow) return 'Follow the day';
  if (!cur || !cur.mode) return 'As it is';
  if (cur.mode === 'ct' && cur.kelvin) return `${warmthName(cur.kelvin)} · ${Math.round(cur.kelvin)} K`;
  if (!cur.hex) return 'As it is';
  const [r, g, b] = cur.hex.slice(1).match(/../g).map(x => parseInt(x, 16));
  let best = null, bd = 1e9;
  for (const [n, hx] of SWATCH_COLOURS) { const [r2, g2, b2] = hx.slice(1).match(/../g).map(x => parseInt(x, 16)); const d = Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2); if (d < bd) { bd = d; best = n; } }
  return bd <= 48 ? best : 'Custom';
}
// The dot beside a label: the colour itself, the white tone for a warmth, nothing when the lamp is left as it is.
function colourDot(cur) {
  // a value that follows the day has no fixed colour: the dot shows the white it would be showing right now
  const followK = cur && cur.follow && typeof followKelvin === 'function' ? followKelvin() : null;
  const c = followK ? kelvinHex(followK) : !cur || !cur.mode ? null : cur.mode === 'ct' ? kelvinHex(cur.kelvin) : cur.hex;
  return `<span class="cdot ${c ? '' : 'none'}" data-cdot style="background:${c || 'transparent'}"></span>`;
}
const warmthGrad = (kmin, kmax) => `linear-gradient(to right, ${kelvinHex(kmin)}, ${kelvinHex((kmin + kmax) / 2)}, ${kelvinHex(kmax)})`;
const HUE_GRAD = 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';
const satGrad = h => `linear-gradient(to right, #ffffff, ${hsvHex(h, 100, 100)})`;
const kelvinPct = (k, kmin, kmax) => Math.round((clamp(k, kmin, kmax) - kmin) / Math.max(1, kmax - kmin) * 100);
const nearestWhite = (k, whites) => whites.reduce((a, w) => (Math.abs(w - k) < Math.abs(a - k) ? w : a), whites[0]);

// ---------- the component ----------
// d: the device (color, ct, ct_range); cur: {mode: 'ct' | 'xy' | null, kelvin?, hex?}; opts: none (offer "As it is"),
// more (hue strip open), bare (the sheet's own title already says "Warmth", so the row does not repeat it),
// nested (it sits under a row that already names it and shows its value, so the matching label is not repeated).
function colorCtlHTML(ns, id, d, cur, opts = {}) {
  if (!d || (!d.ct && !d.color)) return '';
  cur = cur || {};
  const [kmin, kmax] = d.ct && d.ct_range ? d.ct_range : [2000, 6500];
  const isCt = cur.mode === 'ct' && cur.kelvin != null, isXy = cur.mode === 'xy' && !!cur.hex;
  // `follow`: this host lets the lamp follow the day instead of taking a colour of its own (the scene editor).
  // Only a lamp that can change its white is ever offered it.
  const followChip = opts.follow && d.ct ? `<button class="chip ${cur.follow ? 'sel' : ''}" data-act="c-follow">Follow the day</button>` : '';
  const noneChip = opts.none ? `<button class="chip ${cur.mode || cur.follow ? '' : 'sel'}" data-act="c-none">As it is</button>` : '';
  // a value that follows the day has no fixed warmth: the slider rests where the day is now, so the row says what
  // the lamp would be showing rather than nothing at all
  const followK = cur.follow && d.ct && typeof followKelvinFor === 'function' ? followKelvinFor(id) : null;
  const k = clamp(Math.round(followK || cur.kelvin || 2700), kmin, kmax), kp = kelvinPct(k, kmin, kmax);
  const showK = isCt || followK != null;
  // the row above a nested component is named after what the lamp can do: "Colour" when it has colour, "Warmth"
  // when white is all it has. Whichever of the two it is, the component does not say it a second time.
  const hideWarmth = opts.bare || (opts.nested && !d.color), hideColour = opts.nested && !!d.color;
  let h = `<div class="ccol" data-cns="${ns}" data-cid="${id}" data-kmin="${kmin}" data-kmax="${kmax}">`;
  if (d.ct) {
    h += `<div class="crow"><div class="clab">${hideWarmth ? '' : '<span class="t">Warmth</span>'}<span class="d"><span data-cname>${showK ? warmthName(k) : 'As it is'}</span><span class="k" data-ck>${showK ? ` · ${k} K` : ''}</span></span></div>
      <input class="slider grad" type="range" min="0" max="100" value="${kp}" style="--p:${kp}%;--track-grad:${warmthGrad(kmin, kmax)}" data-cwarm="${id}" aria-label="Warmth"></div>`;
  }
  if (d.color) {
    // the Warmth slider above already covers white, so the swatch row carries colour alone on a lamp that has both.
    // `full`: the colour's own screen has the room for every colour at once, wrapped, with nothing off the edge.
    const whites = d.ct ? [] : SWATCH_WHITES.filter(w => w >= kmin && w <= kmax);
    const selWhite = isCt && whites.length ? nearestWhite(k, whites) : null;
    const COLOURS = opts.full ? SWATCH_COLOURS : SWATCH_ROW;
    h += `<div class="crow">${hideColour ? '' : `<div class="clab"><span class="t">Colour</span><span class="d" data-ccur>${esc(colourLabel(cur))}</span></div>`}
      <div class="chips ${opts.full ? 'swatches wrap' : 'scroll swatches'}">${noneChip}${followChip}${whites.map(w => `<button class="swatch ${selWhite === w && Math.abs(k - w) <= 250 ? 'sel' : ''}" data-act="c-swatch" data-k="${w}" style="background:${kelvinHex(w)}" aria-label="${warmthName(w)}, ${w} K" title="${warmthName(w)}"></button>`).join('')}${(() => { const near = isXy ? nearestSwatch(cur.hex, COLOURS.map(([, hx]) => hx)) : null; return COLOURS.map(([n, hx]) => `<button class="swatch ${isXy && (sameHex(cur.hex, hx) || (near && sameHex(near, hx))) ? 'sel' : ''}" data-act="c-swatch" data-hex="${hx}" style="background:${hx}" aria-label="${n}" title="${n}"></button>`).join(''); })()}</div></div>`;
    // on the colour's own screen the strip is already open, so the row names what it is rather than promising more
    h += valueRow(opts.full ? 'Any colour' : 'More colours…', colourDot(isXy ? cur : null), 'c-more', `data-cid="${id}"`, { open: !!opts.more });
    if (opts.more) h += `<div class="vrow-body cmore">${colorMoreHTML(id, cur)}</div>`;
  } else if (opts.none || followChip) {
    h += `<div class="chips" style="margin-top:4px">${noneChip}${followChip}</div>`;
  }
  return h + '</div>';
}
// Behind "More colours…": the hue strip and the saturation slider (its track runs from white to the picked hue).
function colorMoreHTML(id, cur) {
  const { h, s } = cur && cur.mode === 'xy' && cur.hex ? hexHsv(cur.hex) : { h: 30, s: 0 };
  const hp = Math.round(h / 3.6);
  return `<div class="crow"><div class="clab"><span class="d">Hue</span></div><input class="slider grad" type="range" min="0" max="100" value="${hp}" style="--p:${hp}%;--track-grad:${HUE_GRAD}" data-chue="${id}" aria-label="Hue"></div>
    <div class="crow"><div class="clab"><span class="d">Saturation</span></div><input class="slider grad" type="range" min="0" max="100" value="${s}" style="--p:${s}%;--track-grad:${satGrad(h)}" data-csat="${id}" aria-label="Saturation"></div>`;
}
// Bring a drawn component in line with a value, without rebuilding it (a slider under a finger is left alone).
function colorPaint(root, cur) {
  if (!root) return;
  cur = cur || {};
  const kmin = Number(root.dataset.kmin), kmax = Number(root.dataset.kmax);
  const isCt = cur.mode === 'ct' && cur.kelvin != null, isXy = cur.mode === 'xy' && !!cur.hex;
  const followK = cur.follow && typeof followKelvin === 'function' ? followKelvin() : null;
  const showK = isCt || followK != null;
  const k = clamp(Math.round(followK || cur.kelvin || 2700), kmin, kmax);
  const warm = root.querySelector('[data-cwarm]');
  if (warm && !warm.dataset.drag) { const p = kelvinPct(k, kmin, kmax); warm.value = p; warm.style.setProperty('--p', `${p}%`); }
  const nm = root.querySelector('[data-cname]'); if (nm) nm.textContent = showK ? warmthName(k) : 'As it is';
  const ck = root.querySelector('[data-ck]'); if (ck) ck.textContent = showK ? ` · ${k} K` : '';
  const whites = [...root.querySelectorAll('.swatch[data-k]')].map(b => Number(b.dataset.k));
  const selWhite = isCt && whites.length ? nearestWhite(k, whites) : null;
  const near = isXy ? nearestSwatch(cur.hex, [...root.querySelectorAll('.swatch[data-hex]')].map(b => b.dataset.hex)) : null;
  root.querySelectorAll('.swatch').forEach(b => b.classList.toggle('sel', b.dataset.k ? (selWhite === Number(b.dataset.k) && Math.abs(k - selWhite) <= 250) : (isXy && (sameHex(cur.hex, b.dataset.hex) || (near && sameHex(near, b.dataset.hex))))));
  const none = root.querySelector('[data-act="c-none"]'); if (none) none.classList.toggle('sel', !cur.mode && !cur.follow);
  const fol = root.querySelector('[data-act="c-follow"]'); if (fol) fol.classList.toggle('sel', !!cur.follow);
  const lab = root.querySelector('[data-ccur]'); if (lab) lab.textContent = colourLabel(cur);
  const dot = root.querySelector('[data-cdot]'); if (dot) { dot.style.background = isXy ? cur.hex : 'transparent'; dot.classList.toggle('none', !isXy); }
  const hs = root.querySelector('[data-chue]'), ss = root.querySelector('[data-csat]');
  if (hs && ss && !hs.dataset.drag && !ss.dataset.drag) {
    const { h, s } = isXy ? hexHsv(cur.hex) : { h: 30, s: 0 };
    hs.value = Math.round(h / 3.6); hs.style.setProperty('--p', `${hs.value}%`);
    ss.value = s; ss.style.setProperty('--p', `${s}%`); ss.style.setProperty('--track-grad', satGrad(h));
  }
}

// ---------- hosts: who gets told when a value changes ----------
// host: { cur(id) -> cur, set(id, {kelvin} | {hex} | null), opts(id) -> {none, more}, more(id, open) }
const COLOR_HOSTS = {};
function colorHost(ns, host) { COLOR_HOSTS[ns] = host; }
function colorRootHost(el) { const root = el.closest('.ccol'); const host = root && COLOR_HOSTS[root.dataset.cns]; return host ? { root, host, id: root.dataset.cid } : null; }

document.addEventListener('input', e => {
  const el = e.target; if (el.type !== 'range') return;
  const c = colorRootHost(el); if (!c) return;
  const { root, host, id } = c;
  el.dataset.drag = '1'; clearTimeout(el._cd); el._cd = setTimeout(() => { delete el.dataset.drag; }, 1500);
  let v = null;
  if (el.dataset.cwarm) {
    const kmin = Number(root.dataset.kmin), kmax = Number(root.dataset.kmax);
    v = { kelvin: clamp(Math.round((kmin + Number(el.value) / 100 * (kmax - kmin)) / 10) * 10, kmin, kmax) };
  } else if (el.dataset.chue || el.dataset.csat) {
    const hs = root.querySelector('[data-chue]'), ss = root.querySelector('[data-csat]'); if (!hs || !ss) return;
    const h = Number(hs.value) * 3.6, s = Number(ss.value);
    if (el.dataset.chue) ss.style.setProperty('--track-grad', satGrad(h));
    v = { hex: hsvHex(h, s, 100) };
  } else return;
  host.set(id, v);
  colorPaint(root, host.cur(id));
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || !/^c-/.test(el.dataset.act)) return;
  const act = el.dataset.act;
  if (act === 'c-expand') {
    // a value row in a list (the scene editor) that opens the component under it
    const host = COLOR_HOSTS[el.dataset.cns]; const id = el.dataset.cid; if (!host) return;
    const next = el.nextElementSibling; const wasOpen = !!(next && next.classList.contains('cbody'));
    if (wasOpen) next.remove();
    el.classList.toggle('open', !wasOpen);
    if (!wasOpen) {
      sheet.lockHeight();
      el.insertAdjacentHTML('afterend', `<div class="vrow-body cbody">${colorCtlHTML(el.dataset.cns, id, dev(id), host.cur(id), host.opts ? host.opts(id) : {})}</div>`);
      const b = el.nextElementSibling; if (b && b.scrollIntoView) setTimeout(() => b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
    if (host.expand) host.expand(id, !wasOpen);
    return;
  }
  const c = colorRootHost(el); if (!c) return;
  const { root, host, id } = c;
  if (act === 'c-swatch') { host.set(id, el.dataset.k ? { kelvin: Number(el.dataset.k) } : { hex: el.dataset.hex }); colorPaint(root, host.cur(id)); }
  else if (act === 'c-none') { host.set(id, null); colorPaint(root, host.cur(id)); }
  else if (act === 'c-follow') { if (host.follow) host.follow(id, !(host.cur(id) || {}).follow); colorPaint(root, host.cur(id)); }
  else if (act === 'c-more') {
    const body = root.querySelector('.cmore');
    if (body) { body.remove(); el.classList.remove('open'); }
    else {
      sheet.lockHeight();
      el.classList.add('open');
      el.insertAdjacentHTML('afterend', `<div class="vrow-body cmore">${colorMoreHTML(id, host.cur(id))}</div>`);
      const b = root.querySelector('.cmore'); if (b && b.scrollIntoView) setTimeout(() => b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
    if (host.more) host.more(id, !!root.querySelector('.cmore'));
  }
});

/* ---------- tinted surfaces (docs/design-spec-v5.md 3) ----------
   A card that stands for a light that is on is painted in the colour that light is emitting. The
   whole system rests on one number: every lit card sits at WCAG relative luminance 0.1529, which is
   the measured luminance of Lutron blue itself. Hue is kept exactly, chroma is clamped into a band by
   how much the app actually knows about the device, and lightness is the budget that gets spent
   reaching the target. Because the luminance is a constant, every contrast ratio on a lit card is a
   constant too, the ink is the literal '#FFFFFF' rather than a choice between two inks, and there is
   therefore no threshold for a slider drag to cross and nothing that can flip under a finger.
   scripts/tint-check.js proves the contract over the whole space. */

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

// Linear sRGB to OKLab (Ottosson's M1 / M2). The cube root is the perceptual part: it is what makes a
// fixed L step feel like the same step at the dark end and the light end.
function linToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
// OKLab to linear sRGB. May land outside 0..1: that is out of gamut, and the caller decides what to
// do about it rather than this clipping and lying about the hue it returned.
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

// WCAG relative luminance and contrast, measured on the quantised 8-bit hex the browser will really
// paint, not on the float we computed on the way there.
const lum = hex => { const [r, g, b] = hexToLin(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TINT = {
  yOn: 0.1529,          // = lum('#006DCC'). White ink lands at 5.17:1 on it
  yOnNight: 0.1150,     // accepted here, never passed by a call site until the night page lands
  yInk2: 0.8850,        // the second line of text: 4.61:1 on a card
  yLine: 0.6050,        // any control boundary: 3.23:1 on a card
  wellK: 0.42,          // the slider well's interior, as a fraction of the card's luminance
  hueFallbackLamp: 70,  // amber: where a lamp with no usable hue lands
  hueFallbackCtl: 250   // the blue family: where a control lands
};

// Chroma bands, in OKLCh chroma units. This is the one place the system says how much it knows: a
// colour lamp is allowed to be vivid, a white-temperature lamp less so, a plain dimmer less again.
// Side by side they read as three degrees of certainty about one thing, which is what they are.
const TINT_BANDS = {
  colour: { min: 0.070, max: 0.160, maxNight: 0.130 },
  ct:     { min: 0.045, max: 0.100, maxNight: 0.090 },
  dim:    { min: 0.040, max: 0.075, maxNight: 0.070 },
  ctl:    { min: 0.000, max: 0.200, maxNight: 0.200 }  // a control keeps Lutron blue exactly as it is
};

const inGamut = rgb => rgb.every(v => v >= -1e-6 && v <= 1 + 1e-6);

// At a fixed chroma and hue, luminance rises with OKLab L, so a bisection finds the L that hits the
// target exactly. 16 halvings resolve L about two hundred times finer than one 8-bit step.
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

// A hue and a wish for chroma in, a paintable hex at yTarget out. Chroma 0 is a grey of the right
// luminance and is always paintable, so this always returns something.
function solveC(H, C, yTarget) {
  const first = solveL(C, H, yTarget);
  if (first) return first;
  let lo = 0, hi = C;
  for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (solveL(mid, H, yTarget)) lo = mid; else hi = mid; }
  return solveL(lo, H, yTarget) || solveL(0, H, yTarget) || '#6D6D6D';
}

// Rounding to 8 bits moves luminance by up to 0.0015, which would move a measured ratio by about 0.04
// and make the guarantee an approximation. The target is nudged until the byte the browser paints
// falls on the safe side: dir -1 for a surface, dir +1 for ink and lines. The guarantee then reads as
// "at least", never "about".
function pinLuma(H, C, yTarget, dir) {
  let t = yTarget, hex = solveC(H, C, t);
  for (let i = 0; i < 6 && dir; i++) {
    const y = lum(hex);
    if (dir < 0 ? y <= yTarget : y >= yTarget) return hex;
    t -= (y - yTarget) + 1e-5 * (dir < 0 ? 1 : -1);
    hex = solveC(H, C, t);
  }
  return hex;
}

// What a device's live state contributes: a hue, a chroma wish and a band.
function tintSeed(kind, hex, level, night) {
  const band = TINT_BANDS[kind] || TINT_BANDS.ctl;
  const src = hexToOklch(hex);
  const fallback = kind === 'ctl' ? TINT.hueFallbackCtl : TINT.hueFallbackLamp;
  const H = src.C < 2e-3 ? fallback : src.H;
  // Level moves chroma over a narrow band and nothing else. A 1% lamp is 82% as colourful as a 100%
  // lamp, which is felt but never measured: the luminance is pinned either way, so no ratio moves
  // while a finger is on the slider.
  const lv = Math.max(0, Math.min(100, Number(level) || 0));
  const dim = kind === 'ctl' ? 1 : 0.82 + 0.18 * lv / 100;
  const cap = night ? band.maxNight : band.max;
  return { H, C: Math.min(cap, Math.max(band.min, src.C)) * dim };
}

// The memo. A surface depends on four things only: the state, the source hex, the 5% level bucket and
// the night flag, so a full slider drag can ask for at most 21 distinct surfaces per colour. Past the
// cap the map is dropped rather than half evicted: one recompute per card, and no bookkeeping on
// every hit.
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

function buildLitSurface(o, level) {
  const night = !!o.night;
  const yOn = night ? TINT.yOnNight : TINT.yOn;

  // Off, and anything with no state worth tinting: the ordinary card, unchanged.
  if (o.state === 'off') {
    return { state: 'off', fill: '#FFFFFF', fillPressed: '#F2F2F2', ink: '#262626', ink2: '#666666',
             line: '#B3B3B3', wellTrack: '#EDEDED', wellFill: '#006DCC', wellLine: '#B3B3B3',
             btnBg: '#EDEDED', btnIcon: '#262626', btnBgPressed: '#DEDEDE', btnIconPressed: '#262626',
             border: 'rgba(0,0,0,.09)' };
  }

  // On, but nobody is answering. Keeps the luminance, so the card still reads as on, and drops the
  // hue entirely, so it stops claiming a colour it cannot currently see.
  const seed = o.state === 'unknown'
    ? { H: 0, C: 0 }
    : tintSeed(o.kind || 'ctl', o.hex || '#006DCC', level, night);

  const fill = pinLuma(seed.H, seed.C, yOn, -1);
  const line = pinLuma(seed.H, seed.C * 0.6, TINT.yLine, +1);
  const ink2 = pinLuma(seed.H, seed.C * 0.5, TINT.yInk2, +1);
  return {
    state: o.state === 'unknown' ? 'unknown' : 'on',
    fill,
    // Pressed is a luminance step, not an opacity change, so it is the same felt amount of press on
    // every hue. 18% deeper reads as a press and keeps white ink above 4.5:1 on its own.
    fillPressed: pinLuma(seed.H, seed.C, yOn * 0.82, -1),
    ink: '#FFFFFF',
    ink2,
    line,
    wellLine: line,
    // The slider: a deepened well with a white fill. The well's outline carries the 3:1 the control
    // needs, and the fill against the well carries the value.
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

// Paint a card from a surface. litSurface returns colours, not styles: this writes them onto the
// element as custom properties and the CSS never mentions a colour again. A colour change is thirteen
// property writes on one element and no reflow.
function tintApply(el, opts) {
  if (!el) return;
  const s = litSurface(opts);
  if (el.dataset.tint === s.fill && el.dataset.tintState === s.state) return;   // nothing moved
  el.dataset.tint = s.fill; el.dataset.tintState = s.state;
  const st = el.style;
  st.setProperty('--t-fill', s.fill);
  st.setProperty('--t-fill-pressed', s.fillPressed);
  st.setProperty('--t-ink', s.ink);
  st.setProperty('--t-ink-2', s.ink2);
  st.setProperty('--t-line', s.line);
  st.setProperty('--t-well', s.wellTrack);
  st.setProperty('--t-well-fill', s.wellFill);
  st.setProperty('--t-well-line', s.wellLine);
  st.setProperty('--t-btn-bg', s.btnBg);
  st.setProperty('--t-btn-ink', s.btnIcon);
  st.setProperty('--t-btn-bg-pressed', s.btnBgPressed);
  st.setProperty('--t-btn-ink-pressed', s.btnIconPressed);
  st.setProperty('--t-border', s.border);
  el.classList.toggle('lit', s.state !== 'off');
  el.classList.toggle('unknown', s.state === 'unknown');
}
// The per-frame path while a finger is on a slider. One property, and no colour work at all.
function tintLevel(el, v) { if (el) el.style.setProperty('--p', `${Math.round(v)}%`); }

// Is the app wearing its night look right now (js/light.js applyNightLook sets the attribute)? Every
// lit surface asks, because after dark the same light is painted darker and less saturated: yOnNight
// and the maxNight chroma caps, both measured across all 440 states by scripts/tint-check.js.
function tintNight() { return document.documentElement.dataset.night === '1'; }

// What to hand tintApply for a device, straight from the state the app already keeps. The four kinds
// are the four things the app can honestly know about what a device is emitting.
function tintOptsFor(id) {
  const d = dev(id), st = S.states[id] || {}, lv = level(id) || 0;
  // listed by a bridge but never reported: only a light has a level that can be missing
  if (d && d.domain === 'light' && level(id) == null && devices().length) return { state: 'unknown' };
  if (!targetOn(`d:${id}`)) return { state: 'off' };
  if (connLost()) return { state: 'unknown' };                              // last known, and it says so
  const c = st.color, night = tintNight();
  if (d && d.color && c && c.mode === 'xy' && c.hex) return { kind: 'colour', hex: c.hex, level: lv, night };
  if (d && d.ct && c && c.mode === 'ct' && c.kelvin) return { kind: 'ct', hex: kelvinHex(c.kelvin), level: lv, night };
  if (d && d.domain === 'light') return { kind: 'dim', hex: lampColor(Math.max(1, lv)), level: lv, night };
  return { kind: 'ctl', hex: '#006DCC', level: 100, night };                // a switch, a plug, a fan, a shade
}

// A room's tint. Not a mean of hexes: averaging a red lamp and a green lamp gives yellow, and no lamp
// in that room is yellow. Hue is averaged as a vector weighted by level and chroma, and the length of
// that vector (its coherence) scales the room's chroma. Lights that agree give a saturated room;
// lights that disagree pull the chroma down towards nothing. Below 0.72 the room stops guessing and
// wears Lutron blue: 0.72 is the resultant of two equal lights 90 degrees apart in hue, and past a
// right angle there is no honest mean.
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

// ── A room tile's mesh ───────────────────────────────────────────────────────────────────────────
// roomTintSeed answers "if this room were one colour, which", and below the coherence floor it honestly
// refuses and wears Lutron blue. That is right for one flat fill and wrong as a picture of the room: two
// purple lamps and a red one are not blue, they are two purple blobs and a red one. This builds that
// picture: one soft radial per lit lamp, in that lamp's own colour, over a base of the strongest.
//
// Contrast needs no new proof and none of the thirteen proven units move. Every stop is
// pinLuma(H, C, yOn, -1) fed by tintSeed: the same generator, the same luminance target and the same
// chroma bands that produce buildLitSurface's own `fill`. scripts/tint-check.js already measures white
// ink over every surface that generator can make, so a stop cannot be a colour it has not measured,
// which is why the ink stays #FFFFFF across the whole mesh.
const MESH_ANCHORS = [[[50, 50]], [[22, 26], [78, 74]], [[20, 24], [80, 30], [50, 84]],
                      [[20, 22], [80, 24], [22, 80], [80, 78]]];
// Fixed per index, never random: a repaint must not make the blobs walk around the tile.
function meshAnchor(i, n) {
  if (n <= 4) return MESH_ANCHORS[n - 1][i];
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return [Math.round(50 + 32 * Math.cos(a)), Math.round(50 + 32 * Math.sin(a))];
}
// One stop per lit lamp, in the room's own order, so a room with two purple and one red gets two purple
// blobs and one red one rather than an average of the three.
function roomMeshStops(lights, night) {
  const lit = (lights || []).filter(l => (l.level || 0) > 0);
  if (!lit.length) return null;
  const yOn = night ? TINT.yOnNight : TINT.yOn;
  const stops = lit.map(l => {
    const s = tintSeed(l.kind || 'colour', l.hex || '#006DCC', l.level, night);
    return { hex: pinLuma(s.H, s.C, yOn, -1), w: (l.level / 100) * Math.max(0.02, s.C) };
  });
  // the strongest lamp is what the blobs sit on, so the gaps read as a colour that is actually in the
  // room instead of a fallback that is not
  const base = stops.reduce((a, b) => (b.w > a.w ? b : a), stops[0]);
  const lv = lit.reduce((n, l) => n + l.level, 0) / lit.length;
  return { stops, base: { kind: 'colour', hex: base.hex, level: lv } };
}
// Paint the mesh onto a card. One property write, and the CSS never names a colour.
function meshApply(el, mesh) {
  if (!el) return;
  // one lamp is not a mesh: a single blob over its own colour is just the flat fill with a seam
  const css = mesh && mesh.stops.length > 1
    ? mesh.stops.map((s, i) => { const [x, y] = meshAnchor(i, mesh.stops.length);
        return `radial-gradient(circle at ${x}% ${y}%, ${s.hex} 0%, transparent 62%)`; }).join(', ')
    : '';
  if (el.dataset.mesh === css) return;
  el.dataset.mesh = css;
  el.style.setProperty('--t-mesh', css || 'none');
}

// The tile under a finger. tintOptsFor reads the level the bridge has confirmed; a drag is ahead of
// that, so this asks for the same options at the level the finger is at. A drag to 0 is an off card,
// and a drag up from an off lamp is the warm ramp, not the blue a stateless card would fall back to.
function tintOptsAt(id, v) {
  const lv = Math.max(0, Math.min(100, Number(v) || 0));
  if (!lv) return { state: 'off' };
  const o = tintOptsFor(id), night = tintNight();
  if (o.state) { const d = dev(id); return d && d.domain === 'light' ? { kind: 'dim', hex: lampColor(Math.max(1, lv)), level: lv, night } : { kind: 'ctl', hex: '#006DCC', level: 100, night }; }
  return { kind: o.kind, level: lv, night, hex: o.kind === 'dim' ? lampColor(Math.max(1, lv)) : o.hex };
}
