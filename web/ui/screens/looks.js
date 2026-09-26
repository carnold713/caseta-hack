// The sheets over a light's page: 05b White (12732:49220), 05 Colour (12732:48591) and 06b Sleep timer
// (12733:49235), as v7 takes them further: White as the time of day (12816:94), Colour as painting with light
// (12815:50658), and the running timer as a candle burning down (12817:49023, 12818:257). Each is a sub route of the
// light (#light/<id>/white) so Back and a shared link land on it, and each is laid out from the file's numbers in the
// sheet's own coordinates (screens.css, "sheets over a light"; v7/light.css for what v7 adds).
import { track } from '/ui/gesture.js';
import { K_MIN, K_MAX, kelvinAt, posOfKelvin, kelvinHex, WHITES, LAMP_COLOURS, hexHsv, hsvHex, colourName, sameHex, nearestWhite } from '/ui/colour.js';
import * as gather from '/ui/lookswap.js';
import { CasetaDaylight } from '/data/index.js';
import { endsMs } from '/ui/screens/parts.js';
import { glowHTML, whiteStops, colourStops } from '/ui/glow.js';

const lampRange = d => (d.ct_range && d.ct_range.length === 2 ? d.ct_range : [2000, 6500]).map(Number);
const colOf = (c, id) => (c.S.states[id] || {}).color || {};
const rgba = (h, a) => { const x = String(h).replace('#', ''); return `rgba(${[0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)).join(',')},${a})`; };
const isOn = (c, id) => (c.data.level(id) || 0) > 0;
// A lamp that is off and is given a white or a colour comes on in it, at the level On would give it: the evening's
// at night, not 100% (design-v7-ux.md, 4). The connector sets the colour while it is still dark, so it arrives in it.
const comeOnAt = (c, id) => Math.max(1, Math.min(100, Math.round(c.onLevel(id, `d:${id}`)) || 100));

// The wash: the lamp's light falling on the sheet from its top edge, deepest there, so the whole sheet is lit by
// the lamp. A new colour crossfades over the dimmer (data-xf, motion.js): colour never slides.
const washHTML = hexA => `<span class="lk-wash" data-xf="" aria-hidden="true" style="--wash:${hexA}"></span>`;

// White and Colour on one sheet, for a lamp that can do both: the segmented control swaps between them.
function segmented(c, d, which) {
  if (!(d.ct && d.color)) return '';
  const id = c.esc(d.device_id);
  return `<div class="seg2" role="tablist">
    <span class="pill-bg" style="left:${which === 'white' ? '4px' : 'calc(50% + 2px)'}"></span>
    <button role="tab" aria-selected="${which === 'white'}" data-act="look-swap" data-to="light/${id}/white">White</button>
    <button role="tab" aria-selected="${which === 'colour'}" data-act="look-swap" data-to="light/${id}/colour">Colour</button>
  </div>`;
}

function followRow(c, d) {
  if (!c.DAY.canFollow(d)) return '';
  const id = d.device_id;
  const on = c.DAY.isFollowing(id);
  // the switch says on or off and the sheet shows the white; the one thing it cannot show is a pause
  const paused = on && c.DAY.followPaused(id);
  return `<div class="group ws-follow"><div class="row has-ic">
    <span class="row-ic sunrise">${c.icon('sunrise', 20, 1.7)}</span>
    <button class="row-txt linkish" data-go="light/${c.esc(id)}/follow"><span class="t">Follow the day</span>${paused ? '<span class="d">Paused</span>' : ''}</button>
    <button class="toggle" role="switch" aria-checked="${on}" data-act="follow-toggle" aria-label="Follow the day"></button>
  </div></div>`;
}

// What a pick replaced, so its toast can put it back: the colour or white it showed, and whether it was on.
function before(c, id) { const col = colOf(c, id); return { level: c.data.level(id) || 0, kelvin: col.mode === 'ct' ? col.kelvin : null, hex: col.mode === 'xy' ? col.hex : null }; }
function undoTo(c, d, was) {
  return async () => {
    const id = d.device_id, t = `d:${id}`;
    if (!(was.level > 0)) { await c.turn({ type: 'level', target: t, level: 'off' }); return; }
    if (was.kelvin) setWhite(c, d, was.kelvin);
    else if (was.hex) setColour(c, d, was.hex);
    c.soon();
  };
}

// ---------- 05b White · the time of day ----------
// The white bar becomes a sky, candle to daylight laid left to right as dusk to noon, still in mireds so equal steps
// look equal. The lamp's white is a sun on a path over it that the finger drags (a grip); the day's white right now
// rides the same path as "Now outside", so following and picking explain each other.
// The sky card is 372 x 200 in the file; the path runs from card x 24 to 348 (t = 0 at 1900K, 1 at 6500K), rising
// from the horizon at y 168 to y 40: y = 168 - 128 sin(t pi / 2).
const skyY = t => 168 - 128 * Math.sin(t * Math.PI / 2);
const skyX = t => `calc(24px + ${t.toFixed(4)} * (100% - 48px))`;
// noon brightens as the sun climbs: nothing at t 0.3, all of it at daylight
const noonAt = t => Math.max(0, Math.min(1, (t - 0.3) / 0.7)).toFixed(3);
function sunStyle(k) { const t = posOfKelvin(k); return `left:${skyX(t)};top:${skyY(t).toFixed(1)}px;--sun:${whiteStops(k).body}`; }
function white(c, r) {
  const d = c.data.dev(r.id); if (!d || !d.ct) return null;
  const id = d.device_id;
  const [kmin, kmax] = lampRange(d);
  const col = colOf(c, id);
  // to the nearest 50K, as a pick is made: a Hue bridge answers in mireds, so a lamp set to 6500K reports 6494K a
  // moment later, and the sun and its readout must not shift when it does
  const k = Math.round((col.mode === 'ct' && col.kelvin ? col.kelvin : 2700) / 50) * 50;
  const lim = kmax < K_MAX ? posOfKelvin(kmax) : null;
  const low = kmin > K_MIN ? posOfKelvin(kmin) : null;
  const lit = isOn(c, id);
  const showing = lit && col.mode === 'ct';
  const chips = WHITES.map(([n, wk]) => {
    const out = wk > kmax || wk < kmin;
    const cur = showing && Math.abs(k - Math.max(kmin, Math.min(kmax, wk))) <= 60;
    return `<button class="chip ${cur ? 'current' : ''} ${out ? 'out' : ''}" data-act="white-pick" data-k="${wk}" data-n="${n}">${n}</button>`;
  }).join('');
  // the five named whites as moments on the path
  const moments = WHITES.map(([, wk]) => { const t = posOfKelvin(wk); return `<i class="ws-moment" style="left:${skyX(t)};top:${skyY(t).toFixed(1)}px"></i>`; }).join('');
  const path = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return `${(24 + 324 * t).toFixed(1)},${skyY(t).toFixed(1)}`; }).join(' ');
  // where the day is now: the Follow the day white for this minute, clamped to the lamp
  const dayK = c.DAY.followKelvinFor(id);
  const now = dayK != null ? (() => { const t = posOfKelvin(dayK); return `<button class="ws-now" data-act="white-now" data-hold="white-follow" data-ms="600" data-k="${dayK}" style="left:${skyX(t)};top:${skyY(t).toFixed(1)}px" aria-label="Now outside, ${dayK}K"><span class="l">Now outside</span>${c.icon('sun', 22, 1.7)}</button>`; })()
    : `<button class="ws-loc linkish" data-go="light/${c.esc(id)}/follow">Where is home?</button>`;
  return {
    over: d.name, title: 'White',
    body: `<div class="sheet-abs ws lk-sheet">
      ${washHTML(rgba(whiteStops(k).body, lit ? 0.16 : 0.06))}
      ${segmented(c, d, 'white')}
      <div class="ws-val"><b data-k>${k}K</b><i class="dot" style="background:${whiteStops(k).body}"></i><span data-kname>${c.esc(CasetaDaylight.warmthName(k))}</span></div>
      <div class="ws-sky" style="--noon:${noonAt(posOfKelvin(k))}">
        <i class="sky-dusk"></i><i class="sky-noon"></i><i class="sky-night"></i><i class="sky-ground"></i><i class="sky-horizon"></i>
        ${low != null ? `<i class="beyond lo" style="width:${skyX(low)}"></i><i class="sky-tick" style="left:${skyX(low)}"></i>` : ''}
        ${lim != null ? `<i class="beyond" style="left:${skyX(lim)}"></i><i class="sky-tick" style="left:${skyX(lim)}"></i><span class="ws-limit">Max ${kmax}K</span>` : ''}
        <svg class="sky-path" viewBox="0 0 372 200" preserveAspectRatio="none" aria-hidden="true"><polyline points="${path}"/></svg>
        ${moments}
        <div class="ws-track" data-drag="kelvin" role="slider" aria-label="Warmth" aria-valuemin="${kmin}" aria-valuemax="${kmax}" aria-valuenow="${k}"></div>
        ${now}
        <span class="ws-thumb ${lit ? '' : 'unlit'}" style="${sunStyle(k)}"><i class="disc"></i><i class="touch"></i></span>
      </div>
      <div class="ws-chips">${chips}</div>
      ${followRow(c, d)}
    </div>`,
    after: (c2, r2, root) => wireKelvin(c2, d, root),
  };
}

function setWhite(c, d, k, root) {
  const [kmin, kmax] = lampRange(d);
  k = Math.round(Math.max(kmin, Math.min(kmax, k)) / 50) * 50;
  const id = d.device_id;
  c.S.states[id] = { ...(c.S.states[id] || {}), color: { ...colOf(c, id), mode: 'ct', kelvin: k, hex: kelvinHex(k) } };
  const extra = {};
  // a white turns the lamp on in that white, at the level On would give it; shown lit until the bridge says otherwise
  if (!isOn(c, id)) { const lv = comeOnAt(c, id); c.S.states[id].level = lv; extra.level = lv; }
  c.data.hold([id]);   // the bridge's echoes of the colours passed on the way do not pull it back
  c.gate.sendColor(`d:${id}`, { kelvin: k, ...extra });
  if (root) paintKelvin(root, d, k);
  return k;
}
// Under a finger the sun, its light, the sky's noon and the sheet's wash all follow it: the one place a white slides,
// because it is a lamp being dragged live. The readout steps with it.
function paintKelvin(root, d, k) {
  const t = root.querySelector('.ws-thumb'); if (!t) return;
  t.setAttribute('style', sunStyle(k));
  t.classList.remove('unlit');
  const sky = root.querySelector('.ws-sky'); if (sky) sky.style.setProperty('--noon', noonAt(posOfKelvin(k)));
  root.querySelector('[data-k]').textContent = `${k}K`;
  root.querySelector('[data-kname]').textContent = CasetaDaylight.warmthName(k);
  root.querySelector('.ws-val .dot').style.background = whiteStops(k).body;
  root.querySelector('.ws-track').setAttribute('aria-valuenow', k);
  const w = root.querySelector('.lk-wash'); if (w) w.style.setProperty('--wash', rgba(whiteStops(k).body, 0.16));
}
function wireKelvin(c, d, root) {
  const tr = root.querySelector('[data-drag="kelvin"]'); if (!tr) return;
  const sky = root.querySelector('.ws-sky');
  const at = e => { const b = tr.getBoundingClientRect(); return kelvinAt((e.clientX - b.left) / b.width); };
  const zone = root.querySelector('.ws');
  // A sideways drag anywhere on the sky moves the white; an up or down swipe that starts on it scrolls the sheet.
  // The sun is a grip and takes the finger at once. "Now outside" is its own button (tap and hold), not the slider.
  const onSky = e => { const b = sky.getBoundingClientRect(); return e.clientY >= b.top - 12 && e.clientY <= b.bottom + 12 && !e.target.closest('.ws-now, .ws-loc'); };
  let was = null, k = null;
  track(zone, {
    c, axis: 'x', accept: onSky, grab: e => !!e.target.closest('.ws-thumb'),
    start: () => { was = before(c, d.device_id); sky.classList.add('held'); },
    move: e => { k = setWhite(c, d, at(e), root); },
    end: () => {
      sky.classList.remove('held');
      if (was && k) c.toast(`${d.name} · ${whiteName(k)}`, { undo: undoTo(c, d, was) });
      was = null;
    },
  });
}
// M16 · the lamp follows the tab. White takes a lit colour lamp to the nearest white it can make; Colour straight after
// gives it back the colour White took, and only that: a tab never makes up a colour, and a lamp that is off, or one
// given another white since, stays as it is.
function followTab(c, d, to) {
  const id = d.device_id; if (!isOn(c, id)) return;
  const col = colOf(c, id), took = c.ui.tookColour;
  if (to === 'white' && col.mode === 'xy' && col.hex && d.ct) {
    const k = setWhite(c, d, nearestWhite(col.hex, lampRange(d)));
    c.ui.tookColour = { id, hex: col.hex, k };
  } else if (to === 'colour' && col.mode === 'ct' && took && took.id === id && Math.abs((col.kelvin || 0) - took.k) <= 60) {
    setColour(c, d, took.hex);
    c.ui.tookColour = null;
  }
}
const whiteName = k => { const n = CasetaDaylight.warmthName(k); return /white/i.test(n) ? n : `${n} white`; };

// ---------- 05 Colour · painting with light ----------
const WHEEL = 236;   // the disc; the wheel's box is 260 with 12 round it for the handle to sit over the edge
// A bead of lit glass: the tint's glow, the colour, the tint's deep stop, lit from the upper left.
// A swatch: a flat disc of the colour (no light, no specular, no shadow); the chosen one wears the ring.
function bead(n, x, sel) {
  return `<button class="sw ${sel ? 'sel' : ''}" data-act="colour-pick" data-hex="${x}" style="--b:${x}" aria-label="${n}"></button>`;
}
// The wheel's picture. The stylesheet draws it as a conic gradient (screens.css .wheel .disc), and a conic gradient
// has a join where it meets itself, at three o'clock: a phone's GPU can draw that join as a hairline running from the
// middle out to the right edge. So the same picture is drawn once, pixel by pixel, into an image with no join at all
// (the same eight hue stops mixed as CSS mixes them, the same white from the middle), and the disc wears that as soon
// as it exists; until then, or with no canvas, the gradient stands in.
const HUE_STOPS = [5, 45, 90, 135, 180, 225, 270, 315, 365].map((h, i) => [i * 45, hslRgb(h, 1, 0.55)]);
const WHITE = [[0, 1], [6.2, 0.987], [12.5, 0.947], [18.8, 0.884], [25, 0.801], [31.2, 0.703], [37.5, 0.596], [43.8, 0.486], [50, 0.379], [56.2, 0.28], [62.5, 0.193], [68.8, 0.122], [75, 0.068], [81.2, 0.031], [87.5, 0.01], [93.8, 0.001], [100, 0]];
function hslRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
}
const along = (stops, x) => { for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) { const [a, va] = stops[i - 1], [b, vb] = stops[i]; return [va, vb, (x - a) / (b - a)]; } const l = stops[stops.length - 1]; return [l[1], l[1], 0]; };
let wheelURL = null, wheelDrawing = false;
function drawWheel() {
  if (wheelURL || wheelDrawing || typeof document === 'undefined') return;
  wheelDrawing = true;
  try {
    const N = Math.round(WHEEL * Math.min(3, Math.max(1, window.devicePixelRatio || 1))), R = N / 2;
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'); const img = g.createImageData(N, N); const px = img.data;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - R, dy = y + 0.5 - R, dist = Math.hypot(dx, dy);
      const cover = Math.max(0, Math.min(1, R - dist + 0.5)); if (!cover) continue;
      const [c0, c1, t] = along(HUE_STOPS, (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360);
      const [w0, w1, u] = along(WHITE, Math.min(100, dist / R * 100)), w = w0 + (w1 - w0) * u;
      const o = (y * N + x) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round((c0[k] + (c1[k] - c0[k]) * t) * (1 - w) + 255 * w);
      px[o + 3] = Math.round(cover * 255);
    }
    g.putImageData(img, 0, 0);
    cv.toBlob(blob => {
      wheelDrawing = false; if (!blob) return;
      wheelURL = URL.createObjectURL(blob);
      document.querySelectorAll('.wheel .disc').forEach(el => { el.style.background = discBg(); });
    }, 'image/png');
  } catch (_) { wheelDrawing = false; }
}
const discBg = () => `url(${wheelURL}) center / 100% 100% no-repeat`;

function colour(c, r) {
  const d = c.data.dev(r.id); if (!d || !d.color) return null;
  drawWheel();
  const id = d.device_id;
  const col = colOf(c, id);
  const hex = (col.mode === 'xy' && col.hex ? col.hex : '#4C8DFF').toUpperCase();
  const { h, s } = hexHsv(hex);
  const [hx, hy] = wheelPoint(h, s);
  const lit = isOn(c, id);
  const showing = lit && col.mode === 'xy';
  const follows = c.DAY.canFollow(d) && c.DAY.isFollowing(id);
  const paused = follows && c.DAY.followPaused(id);
  return {
    over: d.name, title: 'Colour',
    body: `<div class="sheet-abs cs lk-sheet ${paused ? 'paused' : ''}">
      ${washHTML(rgba(hex, showing ? 0.2 : 0.06))}
      ${segmented(c, d, 'colour')}
      <div class="wheel" data-drag="wheel" role="slider" aria-label="Colour">
        <span class="disc"${wheelURL ? ` style="background:${discBg()}"` : ''}></span>
        <span class="handle" data-xf="standard" style="left:${hx.toFixed(1)}px;top:${hy.toFixed(1)}px;background:${hex}"></span>
      </div>
      <div class="cs-val" data-cval>
        <i class="dot" data-xf="standard" style="background:${hex}"></i><b data-xf="standard">${c.esc(colourName(hex))}</b><span data-xf="standard">· ${hex}</span>
        <button class="link" data-act="colour-exact">Enter exact</button>
      </div>
      <div class="cs-sw" data-keep="swatches">${LAMP_COLOURS.map(([n, x]) => bead(n, x, showing && sameHex(x, hex))).join('')}${ring(showing ? hex : null)}</div>
      ${paused ? `<p class="cs-note cs-paused">${c.icon('sunrise', 20, 1.7)}<button class="link" data-act="follow-resume">Follow the day again</button></p>` : ''}
    </div>`,
    after: (c2, r2, root) => wireWheel(c2, d, root),
  };
}
// Hue runs clockwise from three o'clock, as the file's wedges do; saturation is the distance from the middle.
function wheelPoint(h, s) {
  const a = h * Math.PI / 180, rr = s * WHEEL / 2;
  return [130 + rr * Math.cos(a) - 18, 130 + rr * Math.sin(a) - 18];
}
function setColour(c, d, hex, root) {
  const id = d.device_id;
  hex = hex.toUpperCase();
  c.S.states[id] = { ...(c.S.states[id] || {}), color: { ...colOf(c, id), mode: 'xy', hex } };
  const extra = {};
  // a lamp that is off comes on in this colour from the first moment, at the level On would give it (not 100%)
  if (!isOn(c, id)) { const lv = comeOnAt(c, id); c.S.states[id].level = lv; extra.level = lv; }
  c.data.hold([id]);   // the bridge's echoes of the colours passed on the way do not pull it back
  c.gate.sendColor(`d:${id}`, { hex, ...extra });
  if (root) paintColour(root, d, hex);
}
// The ring round the chosen swatch, a plain 2 px white ring with a small gap, is one element that slides to the next
// choice (M1, 42 px a swatch).
function ringAt(hex) { const i = LAMP_COLOURS.findIndex(([, x]) => sameHex(x, hex)); return i; }
function ring(hex) {
  const i = hex ? ringAt(hex) : -1;
  return `<i class="sw-ring" aria-hidden="true" style="transform:translateX(${Math.max(0, i) * 42}px)" ${i < 0 ? 'hidden' : ''}></i>`;
}
function paintColour(root, d, hex) {
  const { h, s } = hexHsv(hex); const [x, y] = wheelPoint(h, s);
  const hd = root.querySelector('.wheel .handle'); if (!hd) return;
  hd.style.left = `${x.toFixed(1)}px`; hd.style.top = `${y.toFixed(1)}px`; hd.style.background = hex;
  const v = root.querySelector('[data-cval]');
  v.querySelector('.dot').style.background = hex; v.querySelector('b').textContent = colourName(hex); v.querySelector('span').textContent = `· ${hex}`;
  root.querySelectorAll('.cs-sw .sw').forEach(b => b.classList.toggle('sel', sameHex(b.dataset.hex, hex)));
  const rg = root.querySelector('.cs-sw .sw-ring'), i = ringAt(hex);
  if (rg) { rg.hidden = i < 0; if (i >= 0) rg.style.transform = `translateX(${i * 42}px)`; }
  const w = root.querySelector('.lk-wash'); if (w) w.style.setProperty('--wash', rgba(hex, 0.2));
}
function wireWheel(c, d, root) {
  const w = root.querySelector('[data-drag="wheel"]'); if (!w) return;
  const at = e => {
    const b = w.getBoundingClientRect(); const sc = b.width / 260;
    const dx = (e.clientX - b.left) / sc - 130, dy = (e.clientY - b.top) / sc - 130;
    const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / (WHEEL / 2));
    return hsvHex(h, s, 1);
  };
  // the wheel is a colour picker and nothing else: a finger on it is picking (it takes the finger at once)
  let was = null, last = null;
  track(w, {
    c, grab: () => true,
    start: () => { was = before(c, d.device_id); w.classList.add('held'); },
    move: e => { last = at(e); setColour(c, d, last, root); },
    end: () => { if (was && last) c.toast(`${d.name} · ${colourName(last)}`, { undo: undoTo(c, d, was) }); was = null; },
  });
}

// ---------- 15 · the sleep timer, a candle burning down ----------
const DURATIONS = [5, 15, 30, 60];
const MORE = [10, 20, 45, 90, 120];
// The timer running over any of these devices, if there is one.
function timerFor(c, ids) {
  for (const [t, v] of Object.entries(c.S.timers || {})) {
    if (!v || !v.ends_at) continue;
    const target = t.includes('|') ? t.split('|') : t;
    if (c.data.targetDevices(target).some(x => ids.includes(x))) return { key: t, target, ends: endsMs(v.ends_at), level: Number(v.level) || 0, minutes: Number(v.minutes) || 0 };
  }
  return null;
}
// How long a timer was set for, which is the candle's full height. This phone remembers the ones it set (and what
// Add 15 min made of them); the hub notes the rest as they start, whoever started them (a remote, a routine). A timer
// neither knows about draws its candle from the time left the first time it is seen, so it starts whole.
function fullMinutes(c, t) {
  const mine = (c.ui.timerTotal || {})[t.key];
  if (mine && typeof mine === 'object' && Math.abs(mine.until - t.ends) < 90000) return mine.m;
  if (t.minutes) return t.minutes;
  const seen = c.ui.timerSeen = c.ui.timerSeen || {};
  const s = seen[t.key];
  if (s && Math.abs(s.ends - t.ends) < 2000) return s.m;
  const m = Math.max(1, Math.ceil((t.ends - Date.now()) / 60000));
  seen[t.key] = { ends: t.ends, m };
  return m;
}
function remember(c, key, m, until) { c.ui.timerTotal = { ...(c.ui.timerTotal || {}), [key]: { m, until } }; }
function reaches(c, d) {
  const aid = c.data.devArea(d);
  const lit = c.H.litLights().map(x => `d:${x.device_id}`);
  const out = [['lamp', d.domain === 'fan' ? 'This fan' : 'This lamp', `d:${d.device_id}`]];
  if (aid) out.push(['room', c.data.areaName(aid), `a:${aid}`]);
  if (lit.length > 1) out.push(['all', 'Everything that’s on', lit]);
  return out;
}
const minsLeft = ms => Math.max(1, Math.ceil(ms / 60000));
const clockAt = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
function timer(c, r) {
  const d = c.data.dev(r.id); if (!d) return null;
  return timerSheet(c, { over: d.name, name: d.name, opts: reaches(c, d), covers: [d.device_id] });
}
// The same sheet for a room (Room setup's "Sleep timer for this room").
export function roomTimer(c, aid) {
  return timerSheet(c, { over: c.data.areaName(aid), name: c.data.areaName(aid), opts: [['room', 'This room', `a:${aid}`]], covers: c.H.roomLights(aid).map(x => x.device_id) });
}
// The flame is the lamp's own colour: the first light it covers that is lit, or a warm white.
function flameTone(c, covers) {
  const id = covers.find(x => isOn(c, x)) || covers[0];
  const col = id ? colOf(c, id) : {};
  if (col.mode === 'xy' && col.hex) { const st = colourStops(col.hex); return { hex: col.hex, core: st.core, body: col.hex }; }
  const st = whiteStops(col.mode === 'ct' && col.kelvin ? col.kelvin : 2700);
  return { kelvin: col.mode === 'ct' && col.kelvin ? col.kelvin : 2700, core: '#FFF1DC', body: st.body };
}
// The candle on its stage: its height is the time left over the time it was set for (--f, 1 whole to 0 a stub), the
// flame and its warm pool shrink with it, and `out` gutters it (the flame shrinks and goes, a wisp of smoke rises).
function candleHTML(tone, f, { out = false, stays = false } = {}) {
  const pool = glowHTML({ level: 40, ...(tone.hex ? { hex: tone.hex } : { kelvin: tone.kelvin }), ctx: 'card', name: 'candle' });
  return `<div class="tc-stage ${out ? 'out' : ''} ${stays ? 'stays' : ''}" style="--f:${f.toFixed(4)};--flame:${tone.body};--flame-core:${tone.core};--flame-halo:${rgba(tone.body, 0.5)};--table:${rgba(tone.body, 0.22)}" aria-hidden="true">
    <span class="tc-pool">${pool}</span>
    <i class="tc-table"></i><i class="tc-dish"></i><i class="tc-rim"></i>
    <span class="tc-candle"><i class="tc-wax"></i></span>
    <i class="tc-waxpool"></i><i class="tc-wick"></i>
    <span class="tc-flame"><i class="tc-halo"></i><svg class="tc-fl" viewBox="0 0 18 42" width="18" height="42"><defs><radialGradient id="tcfl" cx=".5" cy=".72" r=".6"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="var(--flame-core)"/><stop offset="1" stop-color="var(--flame)"/></radialGradient></defs><path d="M9 0C9 0 1 16 1 28a8 8 0 0 0 16 0C17 16 9 0 9 0Z" fill="url(#tcfl)"/></svg></span>
    <svg class="tc-smoke" viewBox="0 0 6 60" width="6" height="60"><path d="M3 60c-3-8 3-14 0-22s3-14 0-22 2-10 0-16" fill="none" stroke="rgba(209,209,209,.35)" stroke-width="1.2" stroke-linecap="round"/></svg>
  </div>`;
}
// `opts` are the reaches offered ([key, label, target]); `covers` the devices whose running timer it shows.
function timerSheet(c, { over, name, opts, covers }) {
  const t = timerFor(c, covers);
  const ui = c.ui.timer = c.ui.timer || { reach: 'lamp', more: false };
  c.ui.timerReaches = opts;
  if (!opts.some(o => o[0] === ui.reach)) ui.reach = opts[0][0];
  const coverKey = covers.join('|');
  if (t) {
    const total = fullMinutes(c, t);
    const left = t.ends - Date.now();
    const f = Math.max(0, Math.min(1, left / (total * 60000)));
    const tone = flameTone(c, covers);
    // what the candle was, so the moment the timer ends it can gutter rather than vanish
    c.ui.candle = { cover: coverKey, ends: t.ends, level: t.level, tone };
    const says = t.level > 0 ? `Down to ${t.level}% at ${clockAt(t.ends)}` : `Fades out at ${clockAt(t.ends)}`;
    return {
      over, title: 'Sleep timer',
      body: `<div class="sheet-abs tc ts-run">
        ${candleHTML(tone, f, { stays: t.level > 0 })}
        <div class="tc-left" data-left data-ends="${t.ends}" data-total="${total}">${minsLeft(left)} min left</div>
        <p class="tc-says">${c.esc(says)}</p>
        <div class="tc-btns">
          <button class="pill ghost" data-act="timer-add" data-t="${c.esc(t.key)}">Add 15 min</button>
          <button class="pill ghost" data-act="timer-cancel" data-t="${c.esc(t.key)}">Stop timer</button>
          <button class="pill solid" data-act="timer-offnow" data-t="${c.esc(t.key)}">Off now</button>
        </div>
        ${c.conn() === 'off' ? '<p class="tc-off">It still goes out on time.</p>' : ''}
      </div>`,
      after: (c2, r2, root) => burn(c2, root),
    };
  }
  // It has just run out: the candle gutters as the lamp's state arrives (or, set to a level, stays a lit stub), and
  // a moment later the sheet offers the choices again. A timer stopped by hand ends early and simply goes.
  const k = c.ui.candle;
  if (k && k.cover === coverKey && Date.now() >= k.ends - 4000 && Date.now() - k.ends < 6000) {
    if (!k.shown) { k.shown = Date.now(); setTimeout(() => { if (c.ui.candle === k) c.ui.candle = null; c.render(); }, 3400); }
    return {
      over, title: 'Sleep timer',
      body: `<div class="sheet-abs tc ts-run ended">
        ${candleHTML(k.tone, 0, { out: !(k.level > 0), stays: k.level > 0 })}
        <div class="tc-left">${k.level > 0 ? `Down to ${k.level}%` : 'Out'}</div>
      </div>`,
      after: (c2, r2, root) => gutter(root, k.shown),
    };
  }
  const chip = m => `<button class="dur" data-act="timer-set" data-m="${m}"><b>${m}</b><span>min</span></button>`;
  return {
    over, title: 'Sleep timer',
    body: `<div class="sheet-abs ts">
      <div class="durs">${DURATIONS.map(chip).join('')}<button class="dur more ${ui.more ? 'open' : ''}" data-act="timer-more">${c.icon('plus', 18, 1.8)}<span>Custom</span></button></div>
      ${ui.more ? `<div class="chip-row durs-more">${MORE.map(m => `<button class="chip" data-act="timer-set" data-m="${m}">${m} min</button>`).join('')}</div>` : ''}
      ${opts.length > 1 ? `<div class="ts-applies"><span class="t">Applies to</span></div>
      <div class="chip-row ts-reach">${opts.map(([key, n]) => `<button class="chip" aria-pressed="${ui.reach === key}" data-act="timer-reach" data-k="${key}">${c.esc(n)}</button>`).join('')}</div>` : ''}
    </div>`,
  };
}
// The candle burns down by itself while the sheet is up, smoothly (it is the app deciding: slow and quiet), and the
// words step each minute. It stops the moment the sheet is gone.
function burn(c, root) {
  const el = root.querySelector('[data-left]'); if (!el) return;
  const stage = root.querySelector('.tc-stage');
  clearInterval(root._tick);
  const step = () => {
    if (!el.isConnected) { clearInterval(root._tick); return; }
    const left = Number(el.dataset.ends) - Date.now();
    const f = Math.max(0, Math.min(1, left / (Number(el.dataset.total) * 60000)));
    if (stage) stage.style.setProperty('--f', f.toFixed(4));
    el.textContent = `${minsLeft(left)} min left`;
  };
  root._tick = setInterval(step, 1000);
}

// The flame gutters over the night fade's 1.6 s (it shrinks to a quarter and sinks as it goes, EASE_IN_AND_OUT), the
// light it cast goes with it, and a wisp of smoke rises 18 px a second later. Played from `since`, so a redraw halfway
// (the lamp's own state arriving as it fades) carries on from there. Reduced motion: the flame only fades.
function gutter(root, since) {
  const st = root.querySelector('.tc-stage.out'); if (!st || typeof st.animate !== 'function') return;
  const at = Date.now() - since;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play = (sel, kf, o) => { for (const n of st.querySelectorAll(sel)) { const a = n.animate(kf, { fill: 'backwards', ...o }); a.currentTime = at; } };
  play('.tc-flame', still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'scale(.85)' }, { opacity: 0, transform: 'translateY(16px) scale(.25)' }], { duration: 1600, easing: 'ease-in-out' });
  play('.tc-pool > .glow, .tc-table, .tc-rim, .tc-wax, .tc-waxpool', [{ opacity: 1 }, { opacity: 0 }], { duration: 1600, easing: 'ease-in-out' });
  if (!still) play('.tc-smoke', [{ opacity: 0, transform: 'translateY(0)' }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.59, easing: 'ease-in' }, { opacity: 0, transform: 'translateY(-18px)' }], { duration: 1700, delay: 1000, easing: 'ease-out' });
}

export const sheets = { white, colour, timer };

const targetOf = key => (key.includes('|') ? key.split('|') : key);
// Start (or start again) a timer on a target: the connector replaces any running on the same target.
function startTimer(c, key, minutes, level, full) {
  remember(c, key, full || minutes, Date.now() + minutes * 60000);
  return c.run({ type: 'timer', target: targetOf(key), minutes, fade: 5, ...(level ? { level } : {}) });
}
function running(c, key) { const v = (c.S.timers || {})[key]; return v && v.ends_at ? { ends: endsMs(v.ends_at), level: Number(v.level) || 0 } : null; }

export const actions = {
  // M16: the tabs swap the sheet, the lamp follows the tab, and the lamp's colour travels between them (lookswap.js)
  'look-swap'(c, el, r) {
    const to = /\/white$/.test(el.dataset.to) ? 'white' : 'colour';
    const root = document.querySelector('#sheet-root');
    const cap = gather.capture(root, to);
    const d = c.data.dev(r.id); if (d) followTab(c, d, to);
    c.swap(el.dataset.to);
    gather.play(cap, root);
  },
  'white-pick'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const was = before(c, d.device_id);
    setWhite(c, d, Number(el.dataset.k)); c.soon();
    c.toast(`${d.name} · ${whiteName(Number(el.dataset.k))}`, { undo: undoTo(c, d, was) });
  },
  // "Now outside": a tap sets the day's white as a one-off; it does not start following, and the toast says so
  'white-now'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const was = before(c, d.device_id);
    const k = setWhite(c, d, Number(el.dataset.k)); c.soon();
    // the light shows the change; the note stays for what it teaches (a hold on the sun follows the day)
    c.toast(`${d.name} · ${k}K, the day’s white now. Hold the sun to follow it.`);
  },
  // held for 0.6 s, the sun fills with light and the lamp follows the day
  'white-follow'(c, el, r) {
    c.DAY.setFollowIds([r.id], true);
    c.save('Following the day');
  },
  'colour-pick'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const was = before(c, d.device_id);
    setColour(c, d, el.dataset.hex); c.soon();
    c.toast(`${d.name} · ${colourName(el.dataset.hex)}`, { undo: undoTo(c, d, was) });
  },
  'colour-exact'(c, el, r) {
    const row = el.closest('[data-cval]'); if (!row) return;
    const cur = (colOf(c, r.id).hex || '#4C8DFF').toUpperCase();
    row.innerHTML = `<form class="cs-exact" data-form="hex"><input class="field" name="hex" value="${cur}" maxlength="7" autocomplete="off" spellcheck="false" aria-label="Colour as a hex code"><button class="pill sm" type="submit">Set</button></form>`;
    const inp = row.querySelector('input'); inp.focus(); inp.select();
    row.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const v = inp.value.trim().replace(/^#?/, '#');
      if (!/^#[0-9a-f]{6}$/i.test(v)) { c.toast('That isn’t a colour. Use six hex digits, like #4C8DFF.', { err: true }); return; }
      const d = c.data.dev(r.id); if (d) setColour(c, d, v);
      c.render();
    });
  },
  async 'follow-toggle'(c, el, r) {
    const on = el.getAttribute('aria-checked') !== 'true';
    c.DAY.setFollowIds([r.id], on);
    c.save(on ? 'Following the day' : 'Stopped following the day');
  },
  'timer-more'(c) { c.ui.timer = { ...(c.ui.timer || {}), more: !(c.ui.timer && c.ui.timer.more) }; c.render(); },
  'timer-reach'(c, el) { c.ui.timer = { ...(c.ui.timer || {}), reach: el.dataset.k }; c.render(); },
  async 'timer-set'(c, el) {
    const m = Number(el.dataset.m);
    const opts = c.ui.timerReaches || []; if (!opts.length) return;
    const reach = opts.find(o => o[0] === ((c.ui.timer || {}).reach)) || opts[0];
    const target = reach[2];
    const key = Array.isArray(target) ? target.join('|') : target;
    const ok = await startTimer(c, key, m, 0);
    if (ok) c.toast(`Timer set · ${m} min`, { undo: () => c.run({ type: 'cancel_timer', target }) });
  },
  // the candle grows back by a quarter of an hour: it now burns for what it was set for, plus 15
  async 'timer-add'(c, el) {
    const key = el.dataset.t; const t = running(c, key); if (!t) return;
    const was = { ends: t.ends, full: fullMinutes(c, { key, ends: t.ends, minutes: Number(((c.S.timers || {})[key] || {}).minutes) || 0 }) };
    const left = minsLeft(t.ends - Date.now());
    const ok = await startTimer(c, key, left + 15, t.level, was.full + 15);
    if (ok) c.toast(`Timer · ${left + 15} min left`, { undo: () => startTimer(c, key, minsLeft(was.ends - Date.now()), t.level, was.full) });
  },
  // stopping the timer never turns anything on or up: the light stays as it is
  async 'timer-cancel'(c, el) {
    const key = el.dataset.t; const t = running(c, key);
    const full = t ? fullMinutes(c, { key, ends: t.ends, minutes: Number(((c.S.timers || {})[key] || {}).minutes) || 0 }) : 0;
    const ok = await c.run({ type: 'cancel_timer', target: targetOf(key) });
    if (ok) c.toast('Timer stopped', { undo: t ? () => startTimer(c, key, minsLeft(t.ends - Date.now()), t.level, full) : null });
  },
  // off at once; Undo puts the lights back as they were and lets the candle burn on
  async 'timer-offnow'(c, el) {
    const key = el.dataset.t; const t = running(c, key); if (!t) return;
    const full = fullMinutes(c, { key, ends: t.ends, minutes: Number(((c.S.timers || {})[key] || {}).minutes) || 0 });
    const ids = c.data.targetDevices(targetOf(key));
    const lit = ids.filter(id => isOn(c, id)).map(id => [id, c.data.level(id)]);
    // the timer is dropped first; the lights are shown off from the tap (turn), not from its answer
    const cancelled = c.run({ type: 'cancel_timer', target: targetOf(key) });
    const off = c.turn({ type: 'level', target: targetOf(key), level: 'off' });
    await cancelled;
    const ok = await off;
    if (ok) c.toast('Off now', {
      undo: async () => {
        await Promise.all(lit.map(([id, lv]) => c.turn({ type: 'level', target: `d:${id}`, level: lv })));
        await startTimer(c, key, minsLeft(t.ends - Date.now()), t.level, full);
      },
    });
  },
};
