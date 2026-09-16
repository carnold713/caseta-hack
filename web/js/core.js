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
  sun: null, nextRuns: {}, // today's sun and the next run of each automation, from the connector (automations.js reads them)
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
// While a finger is moving: one command in flight per target and kind (brightness, colour), the newest value
// always goes next and everything between is dropped. Echoes from the bridge are ignored for a moment after.
const LV = { inflight: {}, latest: {}, quiet: {} };
function sendGated(key, target, action) {
  LV.latest[key] = { target, action };
  if (LV.inflight[key]) return;
  LV.inflight[key] = (async () => {
    while (LV.latest[key]) {
      const p = LV.latest[key]; delete LV.latest[key];
      await command(p.action);
      LV.quiet[JSON.stringify(p.target)] = Date.now() + 1500;
      for (const t of Array.isArray(p.target) ? p.target : [p.target]) LV.quiet[JSON.stringify(t)] = Date.now() + 1500;
    }
    delete LV.inflight[key];
  })();
}
function sendLevel(target, level, extra) { sendGated(JSON.stringify(target), target, { type: 'level', target, level, fade: 0, ...(extra || {}) }); }
// Colour or white temperature for a Hue lamp: payload is {kelvin} or {hex}, with an optional level.
function sendColor(target, payload) { sendGated('color:' + JSON.stringify(target), target, { type: 'color', target, fade: 0, ...payload }); }
// True while a target was set from this phone recently: the bridge's own echo must not pull the slider back.
function levelQuiet(target) { const q = LV.quiet[JSON.stringify(target)]; return !!(q && q > Date.now()); }
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
        S.add = m.add || null;
        S.inv = m.inventory; S.states = m.states; S.agent = m.agent; S.timers = m.timers || {}; S.activity = m.activity || [];
        S.sun = m.sun || null; S.nextRuns = m.next_runs || {};
        S.config = m.config; S.lastSaved = JSON.stringify(m.config); S.ready = true;
        // First snapshot after "Getting your home ready...": show "Connected to your home" with a tick for 900ms, then Home.
        if (!S._everReady) { S._everReady = true; if (S.agent.online && S._loadingShown) { S._holdLoading = true; render(); setTimeout(() => { S._holdLoading = false; render(); if (typeof openGreeting === 'function') openGreeting(); }, 900); break; } }
        render(); break;
      case 'inventory': S.inv = m.inventory; render(); break;
      case 'state': Object.assign(S.states, m.states); paintState(); break;
      case 'timers': S.timers = m.timers || {}; if (S.view === 'home' && !sheet.isOpen()) render(); if (typeof paintNow === 'function') paintNow(); break;
      case 'config': if (JSON.stringify(m.config) !== S.lastSaved) { S.config = m.config; S.lastSaved = JSON.stringify(m.config); render(); } break;
      case 'agent': S.agent = { online: m.online, info: m.info || null }; render(); if (window.Hue) Hue.onAgent(); break;
      case 'activity': S.activity.unshift(m.entry); S.activity.length = Math.min(S.activity.length, 100); if (S.view === 'settings') paintActivity(); if (m.entry && m.entry.kind === 'schedule' && typeof paintSun === 'function') paintSun(); break;
      // after every config change and every ten minutes: the sun, the curve level and the next runs. Painted in place, never a full render.
      case 'sun': S.sun = m.sun || null; S.nextRuns = m.next_runs || {}; if (typeof paintSun === 'function') paintSun(); break;
      case 'add_state': case 'add_heard': case 'add_log': if (window.AddDevice) AddDevice.onMessage(m); break;
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
// A scene's entry for a light is a number, a fan speed, or {level, kelvin?, hex?} for a Hue lamp with its colour.
function levelOf(v) { if (v && typeof v === 'object') return Number(v.level) || 0; if (typeof v === 'number') return v; return v && v !== 'Off' ? 100 : 0; }
function colorOf(v) { if (!v || typeof v !== 'object') return null; if (v.kelvin != null) return { mode: 'ct', kelvin: v.kelvin }; if (v.hex) return { mode: 'xy', hex: v.hex }; return null; }
const isOn = id => (level(id) || 0) > 0 || !!((S.states[id] || {}).fan_speed && S.states[id].fan_speed !== 'Off');
const buttonsOf = pid => Object.values(S.inv.buttons || {}).filter(b => b.device_id === pid).sort((a, b) => a.button_number - b.button_number);
const groups = () => (S.config && S.config.groups) || [];
const presets = () => (S.config && S.config.presets) || [];
const lutronScenes = () => Object.values(S.inv.scenes || {});

// Targets: d:<device> a:<area> g:<group> h:all, or a list of those; favorites also allow p:<preset> s:<lutron scene>
const tlist = t => (Array.isArray(t) ? t : t ? [t] : []);
const tsplit = t => (typeof t === 'string' && t.includes('|') ? t.split('|') : t);
function targetDevices(t) {
  if (Array.isArray(t)) return [...new Set(t.flatMap(targetDevices))];
  if (!t) return [];
  const [k, id] = [t.slice(0, 1), t.slice(2)];
  if (k === 'd') return dev(id) ? [id] : [];
  if (k === 'a') return controllable().filter(d => (d.area || 'none') === id && d.domain !== 'cover').map(d => d.device_id);
  if (k === 'g') { const g = groups().find(x => x.id === id); return g ? g.device_ids.filter(dev) : []; }
  if (t === 'h:all') return controllable().filter(d => d.domain === 'light' || d.domain === 'switch').map(d => d.device_id);
  if (t === 'h:shades') return controllable().filter(d => d.domain === 'cover').map(d => d.device_id);
  if (t === 'h:fans') return controllable().filter(d => d.domain === 'fan').map(d => d.device_id);
  return [];
}
function targetName(t) {
  if (Array.isArray(t)) { const names = t.map(targetName); return names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', '); }
  if (!t) return 'nothing';
  if (t === 'h:all') return 'everything';
  if (t === 'h:shades') return 'the shades';
  if (t === 'h:fans') return 'the fans';
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
  if (t === 'h:all' || t === 'h:shades' || t === 'h:fans') return true;
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
      case 'raise': return isShadeTarget(a.target) ? `Opens ${t}` : `Brightens ${t} while holding`;
      case 'lower': return isShadeTarget(a.target) ? `Closes ${t}` : `Dims ${t} while holding`;
      case 'stop': return `Stops ${t}`;
      case 'cap': return `Lowers ${t} to ${a.level}% where it is brighter`;
      case 'cycle_presets': { const p = presets().find(x => x.id === (a.preset_ids || [])[0]); return p && p.area ? `Steps through ${areaName(p.area)}'s moods` : 'Steps through scenes'; }
      case 'fan': return a.speed === 'Off' ? `Turns ${t}${t === 'the fans' ? '' : ' fan'} off` : `Sets ${t}${t === 'the fans' ? '' : ' fan'} to ${fanName(a.speed)}`;
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
// True when every device a target names is a shade (so raise and lower read as open and close).
function isShadeTarget(t) { if (t === 'h:shades') return true; const ids = targetDevices(t); return ids.length > 0 && ids.every(id => (dev(id) || {}).domain === 'cover'); }
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
    const was = el.classList.contains('live');
    const now = !!(l && l.event === 'Press' && Date.now() - l.at < 1200);
    el.classList.toggle('live', now);
    if (now && !was && window.Motion) Motion.press(el);
  });
  setTimeout(() => document.querySelectorAll('.pb.live').forEach(el => { const l = S.live[el.dataset.live]; if (!l || Date.now() - l.at >= 1200 || l.event !== 'Press') el.classList.remove('live'); }), 1300);
}
function pulseGesture(n, g) {
  const ug = userGestureOf({ gesture: g });
  document.querySelectorAll(`[data-grow="${n}/${ug}"]`).forEach(el => { if (window.Motion) Motion.pulse(el); else { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } });
}

// ---------- state painting (no full re-render) ----------
function paintState() {
  document.querySelectorAll('[data-lvl]').forEach(el => {
    const id = el.dataset.lvl; const v = level(id);
    if (el.classList.contains('slider')) { if (document.activeElement !== el && !el.dataset.drag && !levelQuiet(`d:${id}`)) { el.value = v == null ? 0 : v; el.style.setProperty('--p', `${v || 0}%`); } }
    else if (el.classList.contains('sw')) el.classList.toggle('on', isOn(id));
    else if (el.dataset.speed) el.classList.toggle('on', (S.states[id] || {}).fan_speed === el.dataset.speed);
    else el.textContent = v == null ? '' : v === 0 ? 'Off' : `${v}%`;
  });
  document.querySelectorAll('[data-tgt]').forEach(el => {
    const t = el.dataset.tgt; const on = targetOn(t);
    if (el.classList.contains('sw')) el.classList.toggle('on', on);
    else if (el.classList.contains('room')) { const was = el.classList.contains('on'); el.classList.toggle('on', on); const s = el.querySelector('.head .s'); if (s) s.textContent = roomSummary(t.slice(2)); if (was !== on && window.Motion) Motion.lightChanged(el, roomMeanLevel(t.slice(2)), was); }
    else if (el.classList.contains('tile')) { el.classList.toggle('on', on); const s = el.querySelector('.s'); if (s) s.textContent = tileSub(t); }
  });
  document.querySelectorAll('[data-roomsum]').forEach(el => { el.textContent = roomSummary(el.dataset.roomsum); });
  document.querySelectorAll('[data-act-lvl]').forEach(el => { const was = el.classList.contains('on'); const on = isOn(el.dataset.actLvl); el.classList.toggle('on', on); if (was !== on && window.Motion) Motion.lightChanged(el.closest('.light') || el, level(el.dataset.actLvl) || 0, was); });
  if (typeof paintLight === 'function') paintLight(); // light.js: lamp discs, moods, rings, night look
  paintNowBar();
  if (window.LightField && S.view === 'home') LightField.update();
}
// Rooms for the light field: id = area id (matches the room card's data-room), the colour of its light, mean level of its lights.
function roomMeanLevel(aid, overrides = {}) {
  const ds = controllable().filter(d => (d.area || 'none') === aid && d.domain !== 'cover');
  if (!ds.length) return 0;
  return ds.reduce((a, d) => a + (overrides[d.device_id] ?? level(d.device_id) ?? 0), 0) / ds.length;
}
function roomsForLight(overrides = {}) {
  return areas().map(a => { const lv = roomMeanLevel(a.id, overrides); return { id: a.id, color: typeof lampColor === 'function' ? lampColor(Math.max(1, lv)) : '#F7A64F', level: lv }; });
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
  // opts: sub, cap (a small caption above the title, "1 of 3"), back, onBack, full (100dvh), cls. `dark` and `question` are accepted and ignored: every sheet is white and every header is the dialog kind.
  open(title, body, opts = {}) {
    const root = $('#sheet-root');
    // a sheet re-opened while already open (a step in a flow) keeps its height; a fresh one sizes to its content
    if (root.classList.contains('in')) sheet.lockHeight(); else root.querySelector('.sheet').style.height = '';
    root.querySelector('.sheet').className = 'sheet' + (opts.full ? ' full' : '') + (opts.cls ? ' ' + opts.cls : '');
    sheet.header(title, opts);
    root.querySelector('.sb').innerHTML = body;
    root.classList.add('open'); requestAnimationFrame(() => { root.classList.add('in'); if (window.Motion) Motion.sheetIn(root); });
    // after the root is shown: a hidden element keeps its old scroll offset and ignores writes to scrollTop
    root.querySelector('.sb').scrollTop = 0;
    sheet.onBack = opts.onBack || null;
    sheet.stackTitle = title;
    document.body.style.overflow = 'hidden';
  },
  // The header alone: the close circle, the back circle when there is somewhere to go back to, the caption, the title, the sub line.
  header(title, opts = {}) {
    const sh = $('#sheet-root .sh');
    sh.className = 'sh' + (opts.back ? ' hasback' : '') + (title ? '' : ' notitle');
    sh.innerHTML = `${opts.back ? `<button class="iconbtn sm" data-act="sheet-back">${ICON('back')}</button>` : ''}<button class="iconbtn sm" data-act="sheet-close">${ICON('x')}</button><div class="grow">${opts.cap ? `<div class="stepcap">${opts.cap}</div>` : ''}<h2>${title}</h2>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div>`;
  },
  close() {
    const root = $('#sheet-root'); root.classList.remove('in');
    const done = () => { if (root.classList.contains('in')) return; root.classList.remove('open'); root.querySelector('.sb').innerHTML = ''; root.querySelector('.sheet').style.height = ''; };
    if (window.Motion) Promise.resolve(Motion.sheetOut(root)).then(done); else setTimeout(done, 320);
    document.body.style.overflow = '';
    if (sheet.onClose) { const f = sheet.onClose; sheet.onClose = null; f(); }
  },
  // Once a sheet is open its height stays put while the content inside changes: the content scrolls or
  // leaves room, the card never jumps. Cleared on close.
  lockHeight() { const root = $('#sheet-root'); const el = root.querySelector('.sheet'); if (!root.classList.contains('in') || el.style.height) return; const h = el.getBoundingClientRect().height; if (h > 120) el.style.height = `${Math.round(h)}px`; },
  update(body) { sheet.lockHeight(); const sb = $('#sheet-root .sb'); if (sb) sb.innerHTML = body; },
  isOpen() { return $('#sheet-root').classList.contains('open'); },
};

// ---------- sheets that re-render in place ----------
let SHEET_KEY = null;
// Same key while the sheet is open: swap the body (and the header) and keep the scroll position; otherwise open afresh.
function showSheet(key, title, body, opts = {}) {
  const root = $('#sheet-root');
  if (SHEET_KEY === key && root.classList.contains('open') && root.classList.contains('in')) {
    if (opts.grow) root.querySelector('.sheet').style.height = ''; else sheet.lockHeight();  // a step swap keeps the sheet's height, as a re-open does; `grow` lets a sheet that gains rows size to them
    const sb = root.querySelector('.sb'); const top = sb.scrollTop; sb.innerHTML = body; sb.scrollTop = opts.top ? 0 : top;
    sheet.header(title, opts);
    sheet.onBack = opts.onBack || null; return;
  }
  SHEET_KEY = key; sheet.open(title, body, opts);
}
function closeSheet() { SHEET_KEY = null; sheet.close(); }

// ---------- the walk: one question per step, in one sheet (docs/ux-progressive.md 2.0) ----------
// def: { key, title, sub, state, primary, doneAct, onDone(w), onClose(w), cls, steps: [step] }
// step: { id, kind: pick | multi | time | custom | plan, title, sub, body(w), valid(w), skip(w), onPick(w, v), next, noNext, foot(w) }
// A pick row is `data-act="walk-pick" data-v="..."`: tapping records the answer (or hands it to onPick, which returns
// false when it has handled the step itself) and advances. Nothing is written until the plan's primary.
const WALK = { cur: null };
function walk(def) {
  const w = { def, key: def.key || ('walk-' + uid()), state: def.state || {}, i: 0, ret: null, exp: {} };
  WALK.cur = w;
  sheet.onClose = () => { if (WALK.cur === w) WALK.cur = null; SHEET_KEY = null; if (def.onClose) def.onClose(w); };
  walkRender(w);
  return w;
}
const walkSteps = w => w.def.steps.filter(s => !(s.skip && s.skip(w)));
const walkIs = key => !!(WALK.cur && WALK.cur.def.key === key);
function walkRender(w) {
  if (!w || WALK.cur !== w) return;
  const steps = walkSteps(w);
  let step = w.def.steps[w.i];
  // the current step stopped applying (its answer is now known): move on to the next one that shows
  if (!steps.includes(step)) { step = steps.find(s => w.def.steps.indexOf(s) > w.i) || steps[steps.length - 1]; w.i = w.def.steps.indexOf(step); }
  const idx = steps.indexOf(step), n = steps.length;
  const cap = `${idx === 0 && w.def.title ? esc(w.def.title) + ' · ' : ''}${idx + 1} of ${n}`;
  const title = typeof step.title === 'function' ? step.title(w) : step.title;
  const sub = step.sub != null ? (typeof step.sub === 'function' ? step.sub(w) : step.sub) : (idx === 0 ? (w.def.sub || '') : '');
  const ok = !step.valid || !!step.valid(w);
  let foot = '';
  if (step.foot) foot = step.foot(w);
  else if (step.kind === 'plan') foot = `<div class="sfoot"><button class="btn primary lg block" data-act="${w.def.doneAct || 'walk-done'}" ${ok ? '' : 'disabled'}>${esc(w.def.primary || 'Done')}</button><button class="btn ghost block" data-act="sheet-close">Not now</button></div>`;
  else if (step.kind !== 'pick' && !step.noNext) foot = walkNextFoot(step.next || 'Next', ok);
  showSheet(w.key, title, step.body(w) + foot, { sub, cap, back: idx > 0 || w.ret != null, onBack: () => walkBack(w), top: true, cls: 'walk' + (w.def.cls ? ' ' + w.def.cls : '') });
  if (window.Motion) Motion.pageIn($('#sheet-root .sb'), { force: true });
}
const walkNextFoot = (label, ok) => `<div class="sfoot"><button class="btn primary lg block" data-act="walk-next" ${ok ? '' : 'disabled'}>${esc(label)}</button></div>`;
function walkAdvance(w) {
  if (w.ret != null) { w.i = w.ret; w.ret = null; walkRender(w); return; }
  const steps = walkSteps(w); const idx = steps.indexOf(w.def.steps[w.i]);
  if (idx < steps.length - 1) { w.i = w.def.steps.indexOf(steps[idx + 1]); walkRender(w); }
}
function walkBack(w) {
  if (w.ret != null) { w.i = w.ret; w.ret = null; walkRender(w); return; }
  const steps = walkSteps(w); const idx = steps.indexOf(w.def.steps[w.i]);
  if (idx > 0) { w.i = w.def.steps.indexOf(steps[idx - 1]); walkRender(w); } else sheet.close();
}
// From the plan, a value row reopens its step; coming back lands on the plan again.
function walkGoto(w, id) {
  const i = w.def.steps.findIndex(s => s.id === id); if (i < 0) return;
  const plan = w.def.steps.findIndex(s => s.kind === 'plan');
  if (plan >= 0 && w.i === plan) w.ret = plan;
  w.i = i; walkRender(w);
}
function walkPick(w, v) {
  const step = w.def.steps[w.i];
  if (step.onPick) { if (step.onPick(w, v) === false) return; } else w.state[step.id] = v;
  walkAdvance(w);
}
// A pick row: the title, an optional second line, a check when it is the current answer.
function pickRow(v, title, sub = '', sel = false, glyph = '') {
  return `<button class="item pick ${sel ? 'sel' : ''}" data-act="walk-pick" data-v="${esc(v)}">${glyph}<div class="grow"><div class="t">${title}</div>${sub ? `<div class="d">${sub}</div>` : ''}</div>${sel ? `<span class="chk">${ICON('check')}</span>` : ''}</button>`;
}
// The plan step: the summary in a tip, then value rows for the numbers.
function planHTML(sentence, rows) { return `<div class="tip top plan"><div class="grow"><span class="cap">Here's the plan</span><div class="t">${sentence}</div></div></div>${rows ? `<div class="card pad0 list" style="margin-top:16px">${rows}</div>` : ''}`; }
// A value row: the question as the title, the current answer at the right. `act` decides what a tap does.
function valueRow(title, val, act, data = '', opts = {}) {
  return `<button class="item vrow ${opts.open ? 'open' : ''}" data-act="${act}" ${data}><div class="grow"><div class="t">${title}</div>${opts.sub ? `<div class="d">${opts.sub}</div>` : ''}</div><span class="val">${val}</span><span class="chev">${ICON('chev', 'sm')}</span></button>`;
}
// A value row that expands in place, inside a walk: the chips sit under the row.
function walkValueRow(w, k, title, val, body) {
  const open = !!w.exp[k];
  return valueRow(title, val, 'walk-expand', `data-k="${k}"`, { open }) + (open ? `<div class="vrow-body">${body}</div>` : '');
}
// The More row: always the last card on a screen; the second line names what is behind it.
function moreRow(sub, act, title = 'More') {
  return `<div class="card pad0 list morerow"><button class="item" data-act="${act}"><div class="grow"><div class="t">${title}</div><div class="d">${sub}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const w = WALK.cur; if (!w) return;
  switch (el.dataset.act) {
    case 'walk-next': walkAdvance(w); break;
    case 'walk-pick': walkPick(w, el.dataset.v); break;
    case 'walk-goto': walkGoto(w, el.dataset.id); break;
    case 'walk-expand': w.exp[el.dataset.k] = !w.exp[el.dataset.k]; walkRender(w); break;
    case 'walk-done': if (w.def.onDone) w.def.onDone(w); break;
  }
});

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
  const v = $('#view'); const top = $('#top'); const app = $('#app'); const nb = $('#nowbar');
  const plain = () => { top.innerHTML = ''; v.className = 'plain'; app.classList.remove('nested', 'hasbar', 'baroff'); nb.classList.remove('show'); $('#nav').style.display = 'none'; };
  if (!S.token) { plain(); v.innerHTML = loginHTML(); return; }
  if (!S.ready || !S.config || S._holdLoading) { plain(); v.innerHTML = loadingHTML(!!S._holdLoading); S._loadingShown = true; return; }
  $('#nav').style.display = '';
  const view = VIEWS[S.view] || VIEWS.home;
  const nested = !!(view.nested && view.nested());
  app.classList.toggle('nested', nested);
  v.className = nested ? 'nested' : '';
  top.innerHTML = view.top ? view.top() : '';
  v.innerHTML = view.body();
  // the Light now bar: present on every page once the snapshot is here; never rebuilt while its slider is held
  const held = nb.querySelector('[data-house]') && nb.querySelector('[data-house]').dataset.drag;
  if (!held) nb.innerHTML = nowBarHTML();
  nb.classList.add('show'); app.classList.add('hasbar');
  paintState(); paintLive();
  if (S.view === 'home' && window.LightField) { const lf = document.getElementById('lightfield'); if (lf) LightField.init(lf, roomsForLight); }
  const pageKey = S.view + (nested ? '/' + (S.remote || 'more') : '');
  if (window.Motion) {
    if (!S._launched) { S._launched = true; Motion.pageIn(v, { launch: true }); }
    else if (S._lastPage !== pageKey) Motion.pageIn(v);
    if (!S._barShown) { S._barShown = true; Motion.barIn(nb); }
  }
  if (S._prevOnline !== undefined && S._prevOnline !== S.agent.online) { const dot = top.querySelector('.status .dot'); if (dot) dot.classList.add(S.agent.online ? 'm-dot-hello' : 'm-dot-lost'); }
  S._prevOnline = S.agent.online;
  S._lastView = S.view; S._lastPage = pageKey;
  if (view.after) view.after();
}
// The status circle at the top right: the link glyph with a green or red dot. Tap goes to Settings.
function statusCircle() {
  return `<button class="iconbtn status ${S.agent.online ? 'ok' : 'off'}" data-act="conn" title="${S.agent.online ? 'Connected' : 'Not connected'}">${ICON('link')}<span class="dot"></span></button>`;
}
const connPill = statusCircle;
// The nested header (the Tenzing page header): a Back link on the first line, then the title (with an optional sub line) and the tools.
function nestedTop(backAct, title = '', sub = '') {
  return `<div class="nested-hd"><div class="line"><button class="backlink" data-act="${backAct}" title="Back">${ICON('back')}Back</button></div><div class="line"><div><div class="t2">${title}</div>${sub ? `<div class="d">${sub}</div>` : ''}</div><div class="tools">${statusCircle()}</div></div></div>`;
}
function loginHTML() {
  return `<div class="login"><div class="card dialog"><div class="t2">Welcome</div><p class="body">Enter your home's password to get started.</p>
  <form data-form="login"><label class="field" id="pwfield"><span>Password</span><input class="input" type="password" id="pw" autofocus autocomplete="current-password"></label>
  <div class="foot"><button class="btn primary lg block" type="submit" disabled>Continue</button><button class="btn ghost block" type="button" data-act="pw-help">Where do I find it?</button></div></form></div></div>`;
}
function loadingHTML(connected) {
  return `<div class="loading"><div class="card dialog">${connected ? `<div class="ok">${ICON('check', 'tick')}<div class="t">Connected to your home</div></div>` : `<div class="t">Getting your home ready...</div><div class="dots"><i></i><i></i><i></i><i></i></div>`}</div></div>`;
}

// ---------- the Light now bar (docs/design-spec-v4.md section 7) ----------
function nowBarHTML() {
  const rooms = roomsLit(); const on = litLights(); const lv = houseLevel();
  const name = (S.config && S.config.settings.home_name) || 'Home';
  return `<div class="nb-row"><button class="nb-main" data-act="now-open" aria-label="Open the Now view"><div class="nb-thumb" data-k="${on.length ? lv : 'off'}">${on.length ? lampHTML(lv, 28, '', '', false) : ICON('bulb')}</div><div class="nb-text"><span class="cap">${esc(name)}</span><div class="t" id="nb-head">${lightNowHeadline(rooms)}</div></div></button><button class="nb-off m-hold ${on.length ? '' : 'dark'}" data-act="alloff" title="${powerTitle()}" aria-label="${powerLabel()}">${ICON('power', 'sm')}</button></div>
  <div class="nb-level">${ICON('sun-low', 'sm')}<input class="slider" type="range" min="1" max="100" value="${on.length ? lv : 1}" style="--p:${on.length ? lv : 0}%" data-house="1" aria-label="House brightness"><span class="nb-num">${on.length ? lv : 'Off'}</span></div>`;
}
function paintNowBar() {
  const nb = $('#nowbar'); if (!nb || !nb.classList.contains('show') || !nb.firstChild) return;
  const sl = nb.querySelector('[data-house]'); if (sl && sl.dataset.drag) return;
  const rooms = roomsLit(); const on = litLights(); const lv = houseLevel();
  const head = nb.querySelector('#nb-head'); const h = lightNowHeadline(rooms);
  if (head && head.innerHTML !== h) { if (window.Motion) Motion.textSwap(head, h); else head.innerHTML = h; }
  const thumb = nb.querySelector('.nb-thumb'); const k = on.length ? String(lv) : 'off';
  if (thumb && thumb.dataset.k !== k) { thumb.dataset.k = k; thumb.innerHTML = on.length ? lampHTML(lv, 28, '', '', false) : ICON('bulb'); }
  // the dimmer stays: with nothing on, sliding it is how the house comes on
  $('#app').classList.remove('baroff');
  if (sl) { sl.value = on.length ? lv : 1; sl.style.setProperty('--p', `${on.length ? lv : 0}%`); }
  const num = nb.querySelector('.nb-num'); if (num) num.textContent = on.length ? lv : 'Off';
  const pw = nb.querySelector('.nb-off'); if (pw) { pw.classList.toggle('dark', !on.length); pw.title = powerTitle(); pw.setAttribute('aria-label', powerLabel()); }
}
