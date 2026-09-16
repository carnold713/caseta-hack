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
const WARMTH_NAMES = [[2300, 'Candle'], [3000, 'Warm'], [3700, 'Soft white'], [4500, 'Neutral'], [5500, 'Cool']];
function warmthName(k) { for (const [top, n] of WARMTH_NAMES) if (k <= top) return n; return 'Daylight'; }
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
// The hex a colour state paints as: the tint for a white temperature, the colour itself otherwise.
function stateHex(c) { if (!c) return null; if (c.mode === 'ct' && c.kelvin) return kelvinHex(c.kelvin); return c.hex || null; }
// The fill for a light's disc: its real colour when its state carries one and it is on, else the lamp ramp.
function lightFill(id, lv) { const h = stateHex((S.states[id] || {}).color); return h && lv > 0 ? lampFill(h, lv) : lampColor(lv); }
const colorState = id => (S.states[id] || {}).color || null;

// ---------- swatches ----------
const SWATCH_WHITES = [2200, 2700, 3200, 4000, 5000, 6500];
const SWATCH_COLOURS = [['Red', '#ff2a1a'], ['Orange', '#ff7a00'], ['Amber', '#ffb000'], ['Yellow', '#ffe600'], ['Green', '#3ad13a'], ['Teal', '#1fc7b8'], ['Blue', '#2864ff'], ['Indigo', '#4a2cff'], ['Purple', '#9b30ff'], ['Pink', '#ff3fa4']];
// "Warm · 2700 K", "Red", "Custom" or "As it is": what a colour value reads as.
function colourLabel(cur) {
  if (!cur || !cur.mode) return 'As it is';
  if (cur.mode === 'ct' && cur.kelvin) return `${warmthName(cur.kelvin)} · ${Math.round(cur.kelvin)} K`;
  if (!cur.hex) return 'As it is';
  const [r, g, b] = cur.hex.slice(1).match(/../g).map(x => parseInt(x, 16));
  let best = null, bd = 1e9;
  for (const [n, hx] of SWATCH_COLOURS) { const [r2, g2, b2] = hx.slice(1).match(/../g).map(x => parseInt(x, 16)); const d = Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2); if (d < bd) { bd = d; best = n; } }
  return bd <= 48 ? best : 'Custom';
}
// The dot beside a label: the colour itself, the white tone for a warmth, nothing when the lamp is left as it is.
function colourDot(cur) { const c = !cur || !cur.mode ? null : cur.mode === 'ct' ? kelvinHex(cur.kelvin) : cur.hex; return `<span class="cdot ${c ? '' : 'none'}" data-cdot style="background:${c || 'transparent'}"></span>`; }
const warmthGrad = (kmin, kmax) => `linear-gradient(to right, ${kelvinHex(kmin)}, ${kelvinHex((kmin + kmax) / 2)}, ${kelvinHex(kmax)})`;
const HUE_GRAD = 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';
const satGrad = h => `linear-gradient(to right, #ffffff, ${hsvHex(h, 100, 100)})`;
const kelvinPct = (k, kmin, kmax) => Math.round((clamp(k, kmin, kmax) - kmin) / Math.max(1, kmax - kmin) * 100);
const nearestWhite = (k, whites) => whites.reduce((a, w) => (Math.abs(w - k) < Math.abs(a - k) ? w : a), whites[0]);

// ---------- the component ----------
// d: the device (color, ct, ct_range); cur: {mode: 'ct' | 'xy' | null, kelvin?, hex?}; opts: none (offer "As it is"), more (hue strip open).
function colorCtlHTML(ns, id, d, cur, opts = {}) {
  if (!d || (!d.ct && !d.color)) return '';
  cur = cur || {};
  const [kmin, kmax] = d.ct && d.ct_range ? d.ct_range : [2000, 6500];
  const isCt = cur.mode === 'ct' && cur.kelvin != null, isXy = cur.mode === 'xy' && !!cur.hex;
  const k = clamp(Math.round(cur.kelvin || 2700), kmin, kmax), kp = kelvinPct(k, kmin, kmax);
  let h = `<div class="ccol" data-cns="${ns}" data-cid="${id}" data-kmin="${kmin}" data-kmax="${kmax}">`;
  if (d.ct) {
    h += `<div class="crow"><div class="clab"><span class="t">Warmth</span><span class="d"><span data-cname>${isCt ? warmthName(k) : 'As it is'}</span><span class="k" data-ck>${isCt ? ` · ${k} K` : ''}</span></span></div>
      <input class="slider grad" type="range" min="0" max="100" value="${kp}" style="--p:${kp}%;--track-grad:${warmthGrad(kmin, kmax)}" data-cwarm="${id}" aria-label="Warmth"></div>`;
  }
  if (d.color) {
    const whites = d.ct ? SWATCH_WHITES.filter(w => w >= kmin && w <= kmax) : [];
    const selWhite = isCt && whites.length ? nearestWhite(k, whites) : null;
    h += `<div class="crow"><div class="clab"><span class="t">Colour</span><span class="d" data-ccur>${esc(colourLabel(cur))}</span></div>
      <div class="chips scroll swatches">${opts.none ? `<button class="chip ${cur.mode ? '' : 'sel'}" data-act="c-none">As it is</button>` : ''}${whites.map(w => `<button class="swatch ${selWhite === w && Math.abs(k - w) <= 250 ? 'sel' : ''}" data-act="c-swatch" data-k="${w}" style="background:${kelvinHex(w)}" aria-label="${warmthName(w)}, ${w} K" title="${warmthName(w)}"></button>`).join('')}${SWATCH_COLOURS.map(([n, hx]) => `<button class="swatch ${isXy && sameHex(cur.hex, hx) ? 'sel' : ''}" data-act="c-swatch" data-hex="${hx}" style="background:${hx}" aria-label="${n}" title="${n}"></button>`).join('')}</div></div>`;
    h += valueRow('More colours…', colourDot(isXy ? cur : null), 'c-more', `data-cid="${id}"`, { open: !!opts.more });
    if (opts.more) h += `<div class="vrow-body cmore">${colorMoreHTML(id, cur)}</div>`;
  } else if (opts.none) {
    h += `<div class="chips" style="margin-top:4px"><button class="chip ${cur.mode ? '' : 'sel'}" data-act="c-none">As it is</button></div>`;
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
  const k = clamp(Math.round(cur.kelvin || 2700), kmin, kmax);
  const warm = root.querySelector('[data-cwarm]');
  if (warm && !warm.dataset.drag) { const p = kelvinPct(k, kmin, kmax); warm.value = p; warm.style.setProperty('--p', `${p}%`); }
  const nm = root.querySelector('[data-cname]'); if (nm) nm.textContent = isCt ? warmthName(k) : 'As it is';
  const ck = root.querySelector('[data-ck]'); if (ck) ck.textContent = isCt ? ` · ${k} K` : '';
  const whites = [...root.querySelectorAll('.swatch[data-k]')].map(b => Number(b.dataset.k));
  const selWhite = isCt && whites.length ? nearestWhite(k, whites) : null;
  root.querySelectorAll('.swatch').forEach(b => b.classList.toggle('sel', b.dataset.k ? (selWhite === Number(b.dataset.k) && Math.abs(k - selWhite) <= 250) : (isXy && sameHex(cur.hex, b.dataset.hex))));
  const none = root.querySelector('[data-act="c-none"]'); if (none) none.classList.toggle('sel', !cur.mode);
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
