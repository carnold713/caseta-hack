/* Pico Hack: shared state, transport, helpers, sheet and toast. */
'use strict';

const S = {
  token: localStorage.getItem('token') || '',
  inv: { devices: {}, buttons: {}, scenes: {}, areas: {}, bridge: null, updated: null },
  states: {}, timers: {}, activity: [],
  config: null,
  agent: { online: false, info: null },
  view: (location.hash || '#home').slice(1).split('/')[0] || 'home',
  ready: false, ws: null,
  remote: null, openRooms: new Set(JSON.parse(localStorage.getItem('openRooms') || '[]')),
  live: {}, lastSaved: null,
};

const ICON = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- transport ----------
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${S.token}`, ...(opts.headers || {}) } });
  if (res.status === 401) { S.token = ''; localStorage.removeItem('token'); render(); throw new Error('Signed out'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError(body.error || `${res.status}`));
  return body;
}
function friendlyError(msg) {
  if (/agent is offline/i.test(msg)) return "Can't reach your home right now. Is the home connector running?";
  if (/did not answer/i.test(msg)) return 'Your home did not respond. Try again in a moment.';
  if (/unknown (preset|group)/i.test(msg)) return 'That points at something that no longer exists. Pick it again.';
  return msg;
}
async function command(action) {
  try { await api('/api/command', { method: 'POST', body: JSON.stringify(action) }); return true; }
  catch (e) { toast(e.message, { err: true }); return false; }
}
// Autosave. Every edit calls save(); the previous config is kept for a one-tap Undo.
let saveTimer = null;
async function save(opts = {}) {
  clearTimeout(saveTimer);
  const prev = S.lastSaved;
  try {
    const r = await api('/api/config', { method: 'PUT', body: JSON.stringify(S.config) });
    S.config = r.config; S.lastSaved = JSON.stringify(r.config);
    if (!opts.quiet) toast(opts.msg || 'Saved', { undo: prev ? async () => { S.config = JSON.parse(prev); await save({ msg: 'Undone', quiet: false }); render(); } : null });
  } catch (e) {
    toast(`Couldn't save. ${e.message}`, { err: true, action: 'Retry', onAction: () => save(opts) });
  }
  if (opts.render !== false) render();
}
function saveSoon(ms = 600) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save({ quiet: true }), ms); }

function connectWS() {
  if (S.ws) { try { S.ws.onclose = null; S.ws.close(); } catch (_) { /* ignore */ } }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/app?token=${encodeURIComponent(S.token)}`);
  S.ws = ws;
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case 'snapshot':
        S.inv = m.inventory; S.states = m.states; S.agent = m.agent; S.timers = m.timers || {}; S.activity = m.activity || [];
        S.config = m.config; S.lastSaved = JSON.stringify(m.config); S.ready = true; render(); break;
      case 'inventory': S.inv = m.inventory; render(); break;
      case 'state': Object.assign(S.states, m.states); paintState(); break;
      case 'timers': S.timers = m.timers || {}; if (S.view === 'home') render(); break;
      case 'config': if (JSON.stringify(m.config) !== S.lastSaved) { S.config = m.config; S.lastSaved = JSON.stringify(m.config); render(); } break;
      case 'agent': S.agent = { online: m.online, info: m.info || null }; render(); break;
      case 'activity': S.activity.unshift(m.entry); S.activity.length = Math.min(S.activity.length, 100); if (S.view === 'settings') paintActivity(); break;
      case 'button': case 'gesture': onLive(m); break;
      case 'toast': toast(m.msg, { err: m.level === 'error' }); break;
    }
  };
  ws.onclose = () => { setTimeout(() => { if (S.token) connectWS(); }, 2000); };
}

// ---------- inventory helpers ----------
const devices = () => Object.values(S.inv.devices || {});
const dev = id => (S.inv.devices || {})[id];
const areaName = id => ((S.inv.areas || {})[id] || {}).name || 'Elsewhere';
const areas = () => { const ids = [...new Set(controllable().map(d => d.area || 'none'))]; return ids.map(id => ({ id, name: id === 'none' ? 'Elsewhere' : areaName(id) })).sort((a, b) => a.name.localeCompare(b.name)); };
const controllable = () => devices().filter(d => ['light', 'switch', 'fan', 'cover'].includes(d.domain)).sort(byName);
const remotes = () => devices().filter(d => d.domain === 'pico').sort(byName);
function byName(a, b) { return (areaName(a.area) + a.name).localeCompare(areaName(b.area) + b.name); }
const level = id => { const s = S.states[id]; return s && s.level != null ? s.level : null; };
const isOn = id => (level(id) || 0) > 0 || !!((S.states[id] || {}).fan_speed && S.states[id].fan_speed !== 'Off');
const buttonsOf = pid => Object.values(S.inv.buttons || {}).filter(b => b.device_id === pid).sort((a, b) => a.button_number - b.button_number);
const groups = () => (S.config && S.config.groups) || [];
const presets = () => (S.config && S.config.presets) || [];
const lutronScenes = () => Object.values(S.inv.scenes || {});

// Targets: d:<device> a:<area> g:<group> h:all, or a list of those; favorites also allow p:<preset> s:<lutron scene>
const tlist = t => (Array.isArray(t) ? t : t ? [t] : []);
function targetDevices(t) {
  if (Array.isArray(t)) return [...new Set(t.flatMap(targetDevices))];
  if (!t) return [];
  const [k, id] = [t.slice(0, 1), t.slice(2)];
  if (k === 'd') return dev(id) ? [id] : [];
  if (k === 'a') return controllable().filter(d => (d.area || 'none') === id && d.domain !== 'cover').map(d => d.device_id);
  if (k === 'g') { const g = groups().find(x => x.id === id); return g ? g.device_ids.filter(dev) : []; }
  if (t === 'h:all') return controllable().filter(d => d.domain === 'light' || d.domain === 'switch').map(d => d.device_id);
  return [];
}
function targetName(t) {
  if (Array.isArray(t)) { const names = t.map(targetName); return names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', '); }
  if (!t) return 'nothing';
  if (t === 'h:all') return 'everything';
  const [k, id] = [t.slice(0, 1), t.slice(2)];
  if (k === 'd') return dev(id) ? dev(id).name : 'a light that is gone';
  if (k === 'a') return id === 'none' ? 'Elsewhere' : areaName(id);
  if (k === 'g') { const g = groups().find(x => x.id === id); return g ? g.name : 'a set of lights that is gone'; }
  if (k === 'p') { const p = presets().find(x => x.id === id); return p ? p.name : 'a scene that is gone'; }
  if (k === 's') { const s = (S.inv.scenes || {})[id]; return s ? s.name : 'a scene that is gone'; }
  return t;
}
function targetOn(t) { return targetDevices(t).some(isOn); }
function targetExists(t) {
  if (Array.isArray(t)) return t.length > 0 && t.every(targetExists);
  if (t === 'h:all') return true;
  const [k, id] = [t.slice(0, 1), t.slice(2)];
  if (k === 'd') return !!dev(id);
  if (k === 'a') return areas().some(a => a.id === id);
  if (k === 'g') return groups().some(g => g.id === id);
  if (k === 'p') return presets().some(p => p.id === id);
  if (k === 's') return !!(S.inv.scenes || {})[id];
  return false;
}
// All pickable targets, rooms first, then individual lights inside each room.
function targetOptions(opts = {}) {
  const out = [];
  if (!opts.noAll) out.push({ id: 'h:all', name: 'Everything', sub: 'every light in the house', kind: 'all' });
  for (const a of areas()) {
    const ds = controllable().filter(d => (d.area || 'none') === a.id);
    if (opts.fansOnly && !ds.some(d => d.domain === 'fan')) continue;
    if (!opts.fansOnly && !opts.noRooms && ds.some(d => d.domain !== 'cover')) out.push({ id: `a:${a.id}`, name: a.name, sub: `${ds.filter(d => d.domain !== 'cover').length} lights`, kind: 'room' });
    for (const d of ds) if (!opts.fansOnly || d.domain === 'fan') out.push({ id: `d:${d.device_id}`, name: d.name, sub: a.name, kind: d.domain });
  }
  for (const g of groups()) out.push({ id: `g:${g.id}`, name: g.name, sub: `${g.device_ids.length} lights`, kind: 'group' });
  return out;
}

// Room colours (docs/design-spec.md): flat fills, a soft variant, black text on all. Keys stored per room in settings.room_colors.
const ROOM_PALETTE = { mustard: { bg: '#E3A82B', soft: '#F7E6BE', ink: '#111111' }, steel: { bg: '#5C8CA8', soft: '#D3E1EA', ink: '#111111' }, sky: { bg: '#8FBDD6', soft: '#DCEBF3', ink: '#111111' }, meadow: { bg: '#4B9B5E', soft: '#C9E3CF', ink: '#111111' }, lemon: { bg: '#FFD400', soft: '#FFF2A8', ink: '#111111' }, blush: { bg: '#F2B8BC', soft: '#FADFE1', ink: '#111111' }, clay: { bg: '#C99B6C', soft: '#EAD8C3', ink: '#111111' }, sand: { bg: '#D9CDB5', soft: '#EFE9DD', ink: '#111111' } };
// A recognisable icon per room, by name. Falls back to the house.
function roomIcon(name) {
  const n = (name || '').toLowerCase();
  if (/bed|nursery|guest/.test(n)) return 'bed';
  if (/kitchen|dining|pantry|breakfast/.test(n)) return 'kitchen';
  if (/living|family|den|lounge|great|media|tv/.test(n)) return 'sofa';
  if (/outside|outdoor|patio|garden|porch|deck|yard|exterior|pool/.test(n)) return 'tree';
  if (/bath|powder|shower|laundry|utility/.test(n)) return 'bath';
  if (/office|study|desk|library|work/.test(n)) return 'desk';
  if (/hall|entry|foyer|closet|mud|stairs|landing/.test(n)) return 'hanger';
  if (/garage|shop|basement|workshop/.test(n)) return 'car';
  return 'house';
}
function roomColor(areaId) {
  const keys = Object.keys(ROOM_PALETTE);
  const chosen = (S.config && S.config.settings.room_colors || {})[areaId || 'none'];
  if (chosen && ROOM_PALETTE[chosen]) return ROOM_PALETTE[chosen];
  const idx = areas().findIndex(a => a.id === (areaId || 'none'));
  return ROOM_PALETTE[keys[(idx < 0 ? 0 : idx) % keys.length]];
}
// Pico button labels by LEAP button number (what the bridge reports). Cosmetic only.
const MODEL_NAMES = { Pico1Button: '1-button remote', Pico2Button: '2-button remote', Pico2ButtonRaiseLower: '2-button remote with dimming', Pico3Button: '3-button remote', Pico3ButtonRaiseLower: '3-button remote with dimming', Pico4Button: '4-button remote', Pico4ButtonScene: '4-button scene remote', Pico4ButtonZone: '4-button remote', Pico4Button2Group: '4-button remote', PaddleSwitchPico: 'Paddle remote' };
const LAYOUTS = {
  Pico2Button: { 0: 'On', 2: 'Off' }, PaddleSwitchPico: { 0: 'On', 2: 'Off' },
  Pico2ButtonRaiseLower: { 0: 'On', 2: 'Off', 3: 'Raise', 4: 'Lower' },
  Pico3Button: { 0: 'On', 1: 'Round', 2: 'Off' }, Pico3ButtonRaiseLower: { 0: 'On', 1: 'Round', 2: 'Off', 3: 'Raise', 4: 'Lower' },
  Pico4Button: { 1: '1', 2: '2', 3: '3', 4: '4' }, Pico4ButtonScene: { 0: '1', 1: '2', 2: '3', 3: '4' }, Pico4ButtonZone: { 0: '1', 1: '2', 2: '3', 3: '4' },
  Pico4Button2Group: { 0: 'A on', 1: 'A off', 2: 'B on', 3: 'B off' }, Pico1Button: { 0: 'Button' },
};
const modelName = d => MODEL_NAMES[d.type] || 'Remote';
const buttonLabel = (pid, n) => { const d = dev(pid); const l = d && LAYOUTS[d.type]; return (l && l[n]) || `Button ${n + 1}`; };
const buttonTitle = (pid, n) => { const l = buttonLabel(pid, n); return /^\d$/.test(l) ? `button ${l}` : `${l} button`; };

// ---------- bindings ----------
const bindings = () => (S.config && S.config.bindings) || [];
const bindingsFor = (pid, n) => bindings().filter(b => b.device_id === pid && b.button_number === n);
const binding = (pid, n, g) => bindingsFor(pid, n).find(b => b.gesture === g);
const GESTURE_LABEL = { single: 'Press', double: 'Press twice', hold: 'Hold' };
// The user sees three gestures. "Hold" may be stored as hold (on release) or as hold_start + hold_end (while holding).
function userGestureOf(b) { return b.gesture === 'hold_start' || b.gesture === 'hold_end' ? 'hold' : b.gesture; }
function holdBindings(pid, n) { return bindingsFor(pid, n).filter(b => userGestureOf(b) === 'hold'); }

// Plain-language summary of an action list.
function describe(actions) {
  if (!actions || !actions.length) return '';
  const parts = actions.map(a => {
    const t = a.target ? targetName(a.target) : '';
    switch (a.type) {
      case 'level': {
        if (a.type === 'level' && a.level === 'toggle') return `Turns ${t} on or off`;
        if (a.level === 'on') return `Turns ${t} on`;
        if (a.level === 'off' || a.level === 0) return a.fade >= 5 ? `Fades ${t} off over ${fmtDur(a.fade)}` : `Turns ${t} off`;
        return a.fade >= 5 ? `Fades ${t} to ${a.level}% over ${fmtDur(a.fade)}` : `Sets ${t} to ${a.level}%`;
      }
      case 'step': return a.delta > 0 ? `Makes ${t} a little brighter` : `Makes ${t} a little dimmer`;
      case 'cycle': return `Steps ${t} through ${a.levels.map(l => l === 0 ? 'off' : l + '%').join(', ')}`;
      case 'raise': return `Brightens ${t} while holding`;
      case 'lower': return `Dims ${t} while holding`;
      case 'stop': return `Stops ${t}`;
      case 'fan': return `Sets ${t} fan to ${fanName(a.speed)}`;
      case 'scene': return `Runs the ${targetName('s:' + a.scene_id)} scene`;
      case 'preset': return `Runs the ${targetName('p:' + a.preset_id)} scene`;
      case 'timer': return `Turns ${t} ${a.level ? 'to ' + a.level + '%' : 'off'} after ${a.minutes} min`;
      case 'cancel_timer': return `Cancels the timer on ${t}`;
      case 'delay': return `waits ${a.ms >= 1000 ? (a.ms / 1000) + ' s' : a.ms + ' ms'}`;
      default: return a.type;
    }
  });
  return cap(parts.filter((x, i) => i === 0 || x !== parts[i - 1]).join(', then '));
}
function fmtDur(s) { return s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`; }
function fanName(s) { return { Off: 'off', Low: 'low', Medium: 'medium', MediumHigh: 'medium-high', High: 'high' }[s] || s; }
function fmtTime(hm) { const [h, m] = hm.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${ap}`; }

// ---------- live pico events ----------
function onLive(m) {
  const key = `${m.device_id}/${m.button_number}`;
  const cur = S.live[key] || {};
  if (m.type === 'button') { cur.event = m.event; cur.at = Date.now(); }
  else { cur.gesture = m.gesture; cur.at = Date.now(); cur.bound = m.bound; }
  S.live[key] = cur;
  if (S.view === 'remotes') {
    if (!S.remote && m.type === 'gesture') { S.remote = m.device_id; render(); toast(`That's the ${dev(m.device_id) ? dev(m.device_id).name : 'remote'}. Tap a button to change it.`); return; }
    if (m.type === 'gesture' && S.remote === m.device_id) pulseGesture(m.button_number, m.gesture);
  }
  if (S.view === 'settings' && m.type === 'gesture') { const el = $('#tester'); if (el) { el.textContent = `Detected: ${GESTURE_LABEL[userGestureOf({ gesture: m.gesture })] || m.gesture} on ${dev(m.device_id) ? dev(m.device_id).name : 'a remote'}`; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } }
  paintLive();
}
function paintLive() {
  document.querySelectorAll('[data-live]').forEach(el => {
    const l = S.live[el.dataset.live];
    el.classList.toggle('live', !!(l && l.event === 'Press' && Date.now() - l.at < 1200));
  });
  setTimeout(() => document.querySelectorAll('.pb.live').forEach(el => { const l = S.live[el.dataset.live]; if (!l || Date.now() - l.at >= 1200 || l.event !== 'Press') el.classList.remove('live'); }), 1300);
}
function pulseGesture(n, g) {
  const ug = userGestureOf({ gesture: g });
  document.querySelectorAll(`[data-grow="${n}/${ug}"]`).forEach(el => { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); });
}

// ---------- state painting (no full re-render) ----------
function paintState() {
  document.querySelectorAll('[data-lvl]').forEach(el => {
    const id = el.dataset.lvl; const v = level(id);
    if (el.classList.contains('slider')) { if (document.activeElement !== el && !el.dataset.drag) { el.value = v == null ? 0 : v; el.style.setProperty('--p', `${v || 0}%`); } }
    else if (el.classList.contains('sw')) el.classList.toggle('on', isOn(id));
    else if (el.dataset.speed) el.classList.toggle('on', (S.states[id] || {}).fan_speed === el.dataset.speed);
    else el.textContent = v == null ? '' : v === 0 ? 'Off' : `${v}%`;
  });
  document.querySelectorAll('[data-tgt]').forEach(el => {
    const t = el.dataset.tgt; const on = targetOn(t);
    if (el.classList.contains('sw')) el.classList.toggle('on', on);
    else if (el.classList.contains('room')) { el.classList.toggle('on', on); const s = el.querySelector('.head .s'); if (s) s.textContent = roomSummary(t.slice(2)); }
    else if (el.classList.contains('tile')) { el.classList.toggle('on', on); const s = el.querySelector('.s'); if (s) s.textContent = tileSub(t); }
  });
  const st = $('#statusline'); if (st) st.innerHTML = statusLine();
  document.querySelectorAll('[data-onchip]').forEach(el => el.classList.toggle('hidden', !targetOn(el.dataset.onchip)));
  document.querySelectorAll('[data-act-lvl]').forEach(el => el.classList.toggle('on', isOn(el.dataset.actLvl)));
  if (typeof paintLight === 'function') paintLight(); // light.js: lamp discs, moods, rings, night look
}
function roomSummary(aid) {
  const ds = controllable().filter(d => (d.area || 'none') === aid);
  const on = ds.filter(d => isOn(d.device_id)).length;
  return on ? `${on} of ${ds.length} on` : `${ds.length} ${ds.length === 1 ? 'light' : 'lights'} · all off`;
}
function tileSub(t) {
  const ds = targetDevices(t);
  if (t.startsWith('d:')) { const d = dev(t.slice(2)); if (!d) return ''; if (d.domain === 'fan') return fanName((S.states[d.device_id] || {}).fan_speed || 'Off'); const v = level(d.device_id); return v == null ? '' : v === 0 ? 'Off' : `${v}%`; }
  const on = ds.filter(isOn).length; return on ? `${on} on` : 'Off';
}
function statusLine() {
  if (!S.agent.online) return `<span class="faint">Last known state</span>`;
  const on = controllable().filter(d => d.domain !== 'cover' && isOn(d.device_id));
  if (!on.length) return 'Everything is off';
  const rooms = [...new Set(on.map(d => areaName(d.area)))].slice(0, 3);
  return `<b>${on.length} ${on.length === 1 ? 'light' : 'lights'} on</b> · ${esc(rooms.join(', '))}${on.length > 3 && rooms.length === 3 ? '…' : ''}`;
}

// ---------- sheet ----------
const sheet = {
  el: null,
  open(title, body, opts = {}) {
    const root = $('#sheet-root');
    const sh = root.querySelector('.sh');
    sh.className = 'sh' + (opts.question ? ' q' : '');
    sh.innerHTML = `${opts.back ? `<button class="iconbtn plain" data-act="sheet-back">${ICON('back')}</button>` : ''}<div class="grow"><h2>${title}</h2>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div><button class="iconbtn plain" data-act="sheet-close">${ICON('x')}</button>`;
    root.querySelector('.sb').innerHTML = body;
    root.querySelector('.sb').scrollTop = 0;
    root.classList.add('open'); requestAnimationFrame(() => root.classList.add('in'));
    sheet.onBack = opts.onBack || null;
    sheet.stackTitle = title;
    document.body.style.overflow = 'hidden';
  },
  close() {
    const root = $('#sheet-root'); root.classList.remove('in');
    setTimeout(() => { root.classList.remove('open'); root.querySelector('.sb').innerHTML = ''; }, 320);
    document.body.style.overflow = '';
    if (sheet.onClose) { const f = sheet.onClose; sheet.onClose = null; f(); }
  },
  update(body) { const sb = $('#sheet-root .sb'); if (sb) sb.innerHTML = body; },
  isOpen() { return $('#sheet-root').classList.contains('open'); },
};

// ---------- toast ----------
let toastTimer;
function toast(msg, opts = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button data-act="toast-undo">Undo</button>' : ''}${opts.action ? `<button data-act="toast-action">${esc(opts.action)}</button>` : ''}`;
  t.className = 'show' + (opts.err ? ' err' : '');
  t._undo = opts.undo; t._action = opts.onAction;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, opts.undo || opts.err ? 6000 : 2200);
}

// ---------- render dispatcher ----------
const VIEWS = {};
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  const v = $('#view'); const top = $('#top');
  if (!S.token) { top.innerHTML = ''; v.innerHTML = loginHTML(); $('#nav').style.display = 'none'; return; }
  $('#nav').style.display = '';
  if (!S.ready || !S.config) { top.innerHTML = ''; v.innerHTML = '<p class="muted" style="padding:24px 0">Loading…</p>'; return; }
  const view = VIEWS[S.view] || VIEWS.home;
  top.innerHTML = view.top ? view.top() : '';
  v.innerHTML = view.body();
  paintState(); paintLive();
  if (view.after) view.after();
}
function connPill() {
  return `<button class="pill ${S.agent.online ? 'on' : 'off'}" data-act="conn"><span class="dot"></span>${S.agent.online ? 'Connected' : 'Not connected'}</button>`;
}
function loginHTML() {
  return `<div class="login"><div class="mark">${ICON('bulb', 'lg')}</div><h1>Welcome home</h1><p>Enter your home's password to get started.</p>
  <form data-form="login"><input class="input" type="password" id="pw" placeholder="Password" autofocus autocomplete="current-password" style="height:56px;font-size:16px"><div class="spacer"></div><button class="btn primary lg block">Sign in</button></form></div>`;
}
