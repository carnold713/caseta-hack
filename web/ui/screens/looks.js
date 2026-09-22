// The sheets over a light's page: 05b White (12732:49220), 05 Colour (12732:48591) and 06b Sleep timer
// (12733:49235). Each is a sub route of the light (#light/<id>/white) so Back and a shared link land on it, and each
// is laid out from the file's numbers in the sheet's own coordinates (screens.css, "sheets over a light").
import { K_MIN, K_MAX, KELVIN_GRADIENT, kelvinAt, posOfKelvin, kelvinHex, WHITES, LAMP_COLOURS, hexHsv, hsvHex, colourName, sameHex } from '/ui/colour.js';
import { CasetaDaylight } from '/data/index.js';
import { endsMs } from '/ui/screens/parts.js';

const TRACK = 372;
const lampRange = d => (d.ct_range && d.ct_range.length === 2 ? d.ct_range : [2000, 6500]).map(Number);
const colOf = (c, id) => (c.S.states[id] || {}).color || {};

// White and Colour on one sheet, for a lamp that can do both: the segmented control swaps between them.
function segmented(c, d, which) {
  if (!(d.ct && d.color)) return '';
  const id = c.esc(d.device_id);
  return `<div class="seg2" role="tablist">
    <span class="pill-bg" style="left:${which === 'white' ? 4 : 188}px"></span>
    <button role="tab" aria-selected="${which === 'white'}" data-act="look-swap" data-to="light/${id}/white">White</button>
    <button role="tab" aria-selected="${which === 'colour'}" data-act="look-swap" data-to="light/${id}/colour">Colour</button>
  </div>`;
}

function followRow(c, d) {
  if (!c.DAY.canFollow(d)) return '';
  const id = d.device_id;
  const on = c.DAY.isFollowing(id);
  const sub = on ? (c.DAY.followPaused(id) ? 'Paused until the lamp is next turned on' : c.DAY.followNowText(id)) : 'Cool and bright at midday, warm in the evening';
  return `<div class="group ws-follow"><div class="row sub has-ic">
    <span class="row-ic sunrise">${c.icon('sunrise', 20, 1.7)}</span>
    <button class="row-txt linkish" data-go="light/${c.esc(id)}/follow"><span class="t">Follow the day</span><span class="d">${c.esc(sub)}</span></button>
    <button class="toggle" role="switch" aria-checked="${on}" data-act="follow-toggle" aria-label="Follow the day"></button>
  </div></div>`;
}

// ---------- 05b White ----------
function white(c, r) {
  const d = c.data.dev(r.id); if (!d || !d.ct) return null;
  const [kmin, kmax] = lampRange(d);
  const col = colOf(c, d.device_id);
  const k = Math.round(col.mode === 'ct' && col.kelvin ? col.kelvin : 2700);
  const lim = kmax < K_MAX ? posOfKelvin(kmax) : null;
  const low = kmin > K_MIN ? posOfKelvin(kmin) : null;
  const showing = (c.data.level(d.device_id) || 0) > 0 && col.mode === 'ct';
  const chips = WHITES.map(([n, wk]) => {
    const out = wk > kmax || wk < kmin;
    const cur = showing && Math.abs(k - Math.max(kmin, Math.min(kmax, wk))) <= 60;
    return `<button class="chip ${cur ? 'current' : ''} ${out ? 'out' : ''}" data-act="white-pick" data-k="${wk}">${n}</button>`;
  }).join('');
  const clamp = WHITES.some(([, wk]) => wk > kmax) ? `<p class="ws-note">Asking for cooler than ${kmax}K sets it to ${kmax}K.</p>` : '';
  return {
    over: 'Light colour', title: d.name,
    body: `<div class="sheet-abs ws">
      ${segmented(c, d, 'white')}
      <div class="ws-val"><b data-k>${k}K</b><i class="dot" style="background:${kelvinHex(k)}"></i><span data-kname>${c.esc(CasetaDaylight.warmthName(k))}</span></div>
      ${lim != null ? `<span class="ws-limit" style="right:${Math.round((1 - lim) * TRACK) + 20 - 1}px">Beyond this lamp · max ${kmax}K</span><span class="ws-conn" style="left:${20 + Math.round(lim * TRACK) + 20}px"></span>` : ''}
      <div class="ws-track" data-drag="kelvin" role="slider" aria-label="Warmth" aria-valuemin="${kmin}" aria-valuemax="${kmax}" aria-valuenow="${k}" style="background:${KELVIN_GRADIENT}">
        ${low != null ? `<span class="beyond lo" style="width:${(low * 100).toFixed(2)}%"></span>` : ''}
        ${lim != null ? `<span class="beyond" style="left:${(lim * 100).toFixed(2)}%"></span><span class="tick" style="left:calc(${(lim * 100).toFixed(2)}% - 1px)"></span>` : ''}
      </div>
      <span class="ws-thumb" style="left:${(20 + posOfKelvin(k) * TRACK - 24).toFixed(1)}px;--ring:${kelvinHex(k)}"></span>
      <div class="ws-ends"><span><b>Candle</b> ${K_MIN}K</span><span><b>Daylight</b> ${K_MAX}K</span></div>
      <div class="ws-chips">${chips}</div>
      ${clamp}
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
  // a white turns the lamp on (the connector sends on with it); show it lit until the bridge says otherwise
  if (!(c.data.level(id) > 0)) c.S.states[id].level = 100;
  c.gate.sendColor(`d:${id}`, { kelvin: k });
  if (root) paintKelvin(root, k);
  return k;
}
function paintKelvin(root, k) {
  const t = root.querySelector('.ws-thumb'); if (!t) return;
  t.style.left = `${(20 + posOfKelvin(k) * TRACK - 24).toFixed(1)}px`;
  t.style.setProperty('--ring', kelvinHex(k));
  root.querySelector('[data-k]').textContent = `${k}K`;
  root.querySelector('[data-kname]').textContent = CasetaDaylight.warmthName(k);
  root.querySelector('.ws-val .dot').style.background = kelvinHex(k);
  root.querySelector('.ws-track').setAttribute('aria-valuenow', k);
}
function wireKelvin(c, d, root) {
  const tr = root.querySelector('[data-drag="kelvin"]'); if (!tr) return;
  const at = e => { const b = tr.getBoundingClientRect(); return kelvinAt((e.clientX - b.left) / b.width); };
  const zone = root.querySelector('.ws');
  const down = e => {
    const b = tr.getBoundingClientRect();
    if (e.clientY < b.top - 12 || e.clientY > b.bottom + 12) return;
    e.preventDefault(); c.ui.dragging = true; zone.setPointerCapture(e.pointerId); setWhite(c, d, at(e), root);
  };
  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', e => { if (c.ui.dragging && zone.hasPointerCapture(e.pointerId)) setWhite(c, d, at(e), root); });
  const end = () => { if (c.ui.dragging) c.endDrag(); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
}

// ---------- 05 Colour ----------
const WHEEL = 236;   // the disc; the wheel's box is 260 with 12 round it for the handle to sit over the edge
function colour(c, r) {
  const d = c.data.dev(r.id); if (!d || !d.color) return null;
  const id = d.device_id;
  const col = colOf(c, id);
  const hex = (col.mode === 'xy' && col.hex ? col.hex : '#4C8DFF').toUpperCase();
  const { h, s } = hexHsv(hex);
  const [hx, hy] = wheelPoint(h, s);
  const showing = (c.data.level(id) || 0) > 0 && col.mode === 'xy';
  const follows = c.DAY.canFollow(d) && c.DAY.isFollowing(id);
  return {
    over: 'Light colour', title: d.name,
    body: `<div class="sheet-abs cs">
      ${segmented(c, d, 'colour')}
      <div class="wheel" data-drag="wheel" role="slider" aria-label="Colour">
        <span class="disc"></span>
        <span class="handle" style="left:${hx.toFixed(1)}px;top:${hy.toFixed(1)}px;background:${hex}"></span>
      </div>
      <div class="cs-val" data-cval>
        <i class="dot" style="background:${hex}"></i><b>${c.esc(colourName(hex))}</b><span>· ${hex}</span>
        <button class="link" data-act="colour-exact">Enter exact</button>
      </div>
      <div class="cs-sw" data-keep="swatches">${LAMP_COLOURS.map(([n, x]) => `<button class="sw ${showing && sameHex(x, hex) ? 'sel' : ''}" data-act="colour-pick" data-hex="${x}" style="background:${x}" aria-label="${n}"></button>`).join('')}</div>
      ${follows ? `<p class="cs-note">${c.icon('sunrise', 20, 1.7)}<span>Picking a colour pauses Follow the day until the lamp is next turned on.</span></p>` : ''}
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
  if (!(c.data.level(id) > 0)) c.S.states[id].level = 100;
  c.gate.sendColor(`d:${id}`, { hex });
  if (root) paintColour(root, hex);
}
function paintColour(root, hex) {
  const { h, s } = hexHsv(hex); const [x, y] = wheelPoint(h, s);
  const hd = root.querySelector('.wheel .handle'); if (!hd) return;
  hd.style.left = `${x.toFixed(1)}px`; hd.style.top = `${y.toFixed(1)}px`; hd.style.background = hex;
  const v = root.querySelector('[data-cval]');
  v.querySelector('.dot').style.background = hex; v.querySelector('b').textContent = colourName(hex); v.querySelector('span').textContent = `· ${hex}`;
  root.querySelectorAll('.cs-sw .sw').forEach(b => b.classList.toggle('sel', sameHex(b.dataset.hex, hex)));
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
  w.addEventListener('pointerdown', e => { e.preventDefault(); c.ui.dragging = true; w.setPointerCapture(e.pointerId); setColour(c, d, at(e), root); });
  w.addEventListener('pointermove', e => { if (c.ui.dragging && w.hasPointerCapture(e.pointerId)) setColour(c, d, at(e), root); });
  const end = () => { if (c.ui.dragging) c.endDrag(); };
  w.addEventListener('pointerup', end); w.addEventListener('pointercancel', end);
}

// ---------- 06b Sleep timer ----------
const DURATIONS = [5, 15, 30, 60];
const MORE = [10, 20, 45, 90, 120];
// The timer running over any of these devices, if there is one.
function timerFor(c, ids) {
  for (const [t, v] of Object.entries(c.S.timers || {})) {
    if (!v || !v.ends_at) continue;
    const target = t.includes('|') ? t.split('|') : t;
    if (c.data.targetDevices(target).some(x => ids.includes(x))) return { key: t, target, ends: endsMs(v.ends_at) };
  }
  return null;
}
function reaches(c, d) {
  const aid = c.data.devArea(d);
  const lit = c.H.litLights().map(x => `d:${x.device_id}`);
  const out = [['lamp', d.domain === 'fan' ? 'This fan' : 'This lamp', `d:${d.device_id}`]];
  if (aid) out.push(['room', c.data.areaName(aid), `a:${aid}`]);
  if (lit.length > 1) out.push(['all', 'Everything that’s on', lit]);
  return out;
}
const fmtLeft = ms => { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
function timer(c, r) {
  const d = c.data.dev(r.id); if (!d) return null;
  return timerSheet(c, { over: d.name, opts: reaches(c, d), covers: [d.device_id] });
}
// The same sheet for a room (Room setup's "Sleep timer for this room").
export function roomTimer(c, aid) {
  return timerSheet(c, { over: c.data.areaName(aid), opts: [['room', 'This room', `a:${aid}`]], covers: c.H.roomLights(aid).map(x => x.device_id) });
}
// `opts` are the reaches offered ([key, label, target]); `covers` the devices whose running timer it shows.
function timerSheet(c, { over, opts, covers }) {
  const t = timerFor(c, covers);
  const ui = c.ui.timer = c.ui.timer || { reach: 'lamp', more: false };
  c.ui.timerReaches = opts;
  if (!opts.some(o => o[0] === ui.reach)) ui.reach = opts[0][0];
  const cur = opts.find(o => o[0] === ui.reach);
  const total = t && c.ui.timerTotal && c.ui.timerTotal[t.key];
  const left = t ? t.ends - Date.now() : 0;
  const mins = t ? Math.round(left / 60000) : null;
  const sel = total || (t ? [...DURATIONS, ...MORE].reduce((a, b) => (Math.abs(b - mins) < Math.abs(a - mins) ? b : a)) : null);
  const chip = m => `<button class="dur ${sel === m ? 'sel' : ''}" data-act="timer-set" data-m="${m}"><b>${m}</b><span>min</span></button>`;
  const frac = t ? Math.max(0, Math.min(1, left / ((total || Math.max(mins, 1)) * 60000))) : 0;
  const offAt = t ? new Date(t.ends).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase() : '';
  const C = 2 * Math.PI * 54;
  return {
    over, title: 'Sleep timer',
    body: `<div class="sheet-abs ts">
      <div class="durs">${DURATIONS.map(chip).join('')}<button class="dur more ${ui.more ? 'open' : ''}" data-act="timer-more">${c.icon('plus', 18, 1.8)}<span>Custom</span></button></div>
      ${ui.more ? `<div class="chip-row durs-more">${MORE.map(m => `<button class="chip ${sel === m ? 'current' : ''}" data-act="timer-set" data-m="${m}">${m} min</button>`).join('')}</div>` : ''}
      ${t ? `<div class="ts-run">
        <div class="ring"><span class="glow"></span><svg width="116" height="116" viewBox="0 0 116 116"><defs><linearGradient id="tsg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#E6A06A"/><stop offset="1" stop-color="#B86C35"/></linearGradient></defs>
          <circle cx="58" cy="58" r="54" class="trk"/><circle cx="58" cy="58" r="54" class="arc" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}" transform="rotate(-90 58 58)"/></svg>
          <span class="moon">${c.icon('moon', 30, 1.6)}</span></div>
        <div class="ts-txt"><div class="left"><b data-left data-ends="${t.ends}">${fmtLeft(left)}</b><span>left</span></div>
          <p>Fades out, it won’t snap</p><p class="q">Off at ${c.esc(offAt)}</p>
          <button class="pill ghost sm" data-act="timer-cancel" data-t="${c.esc(t.key)}">${c.icon('x', 16, 1.8)}Cancel timer</button></div>
      </div>` : `<p class="ts-idle">Pick how long. The light fades out at the end, it won’t snap off.</p>`}
      <div class="ts-applies"><span class="t">Applies to</span><span class="v">${c.esc(cur[1])}</span></div>
      <div class="chip-row ts-reach">${opts.map(([k, n]) => `<button class="chip ${ui.reach === k ? '' : ''}" aria-pressed="${ui.reach === k}" data-act="timer-reach" data-k="${k}">${c.esc(n)}</button>`).join('')}</div>
    </div>`,
    after: (c2, r2, root) => tick(root),
  };
}
// The countdown ticks by itself while the sheet is up; it stops the moment the sheet is gone.
function tick(root) {
  const el = root.querySelector('[data-left]'); if (!el) return;
  clearInterval(root._tick);
  root._tick = setInterval(() => { if (!el.isConnected) { clearInterval(root._tick); return; } el.textContent = fmtLeft(Number(el.dataset.ends) - Date.now()); }, 1000);
}

export const sheets = { white, colour, timer };

export const actions = {
  'look-swap'(c, el) { c.swap(el.dataset.to); },
  'white-pick'(c, el, r) { const d = c.data.dev(r.id); if (!d) return; setWhite(c, d, Number(el.dataset.k)); c.soon(); },
  'colour-pick'(c, el, r) { const d = c.data.dev(r.id); if (!d) return; setColour(c, d, el.dataset.hex); c.soon(); },
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
    c.ui.timerTotal = { ...(c.ui.timerTotal || {}), [key]: m };
    const ok = await c.run({ type: 'timer', target, minutes: m, fade: 5 });
    if (ok) c.toast(`Timer set · ${m} min`, { undo: () => c.run({ type: 'cancel_timer', target }) });
  },
  async 'timer-cancel'(c, el) {
    const t = el.dataset.t; const target = t.includes('|') ? t.split('|') : t;
    const ok = await c.run({ type: 'cancel_timer', target });
    if (ok) c.toast('Timer cancelled');
  },
};
