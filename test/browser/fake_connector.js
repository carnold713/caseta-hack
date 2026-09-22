// Pretends to be the in-home connector so the hub and the app can be exercised without a bridge.
// v2: also reports sun times, the wind-down curve level and next run times for schedules,
// so the Automations tab can be exercised locally.
const WebSocket = require('ws');
const fsx = require('fs');
// The hub updates a connector that is behind, and a fake one dies trying. Report whatever the repo declares.
function repoVersion() {
  try { return (fsx.readFileSync(require('path').join(__dirname, '..', '..', 'agent', 'agent.py'), 'utf8').match(/VERSION = "([^"]+)"/) || [])[1] || '9.9.9'; }
  catch (_) { return '9.9.9'; }
}
const ws = new WebSocket(`ws://127.0.0.1:${process.env.HUB_PORT || 4400}/ws/agent?token=devtoken`);
const inventory = {
  devices: {
    '1': { device_id: '1', name: 'Smart Bridge', type: 'SmartBridge', domain: 'bridge', area: null, zone: null },
    '5': { device_id: '5', name: 'Kitchen Cans', type: 'WallDimmer', domain: 'light', area: '20', zone: '2' },
    '6': { device_id: '6', name: 'Island Pendants', type: 'WallDimmer', domain: 'light', area: '20', zone: '3' },
    '7': { device_id: '7', name: 'Porch', type: 'WallSwitch', domain: 'switch', area: '21', zone: '4' },
    '8': { device_id: '8', name: 'Fan', type: 'CasetaFanSpeedController', domain: 'fan', area: '22', zone: '5' },
    '10': { device_id: '10', name: 'Bedside Lamp', type: 'PlugInDimmer', domain: 'light', area: '22', zone: '6' },
    '11': { device_id: '11', name: 'Hall', type: 'WallDimmer', domain: 'light', area: '23', zone: '7' },
    '9': { device_id: '9', name: 'Kitchen Pico', type: 'Pico3ButtonRaiseLower', domain: 'pico', area: '20', zone: null },
    '12': { device_id: '12', name: 'Bedroom Pico', type: 'Pico3ButtonRaiseLower', domain: 'pico', area: '22', zone: null },
  },
  buttons: {
    '101': { button_id: '101', device_id: '9', button_number: 0 }, '102': { button_id: '102', device_id: '9', button_number: 1 }, '103': { button_id: '103', device_id: '9', button_number: 2 }, '104': { button_id: '104', device_id: '9', button_number: 3 }, '105': { button_id: '105', device_id: '9', button_number: 4 },
    '121': { button_id: '121', device_id: '12', button_number: 0 }, '122': { button_id: '122', device_id: '12', button_number: 1 }, '123': { button_id: '123', device_id: '12', button_number: 2 }, '124': { button_id: '124', device_id: '12', button_number: 3 }, '125': { button_id: '125', device_id: '12', button_number: 4 },
  },
  areas: { '20': { id: '20', name: 'Kitchen' }, '21': { id: '21', name: 'Outside' }, '22': { id: '22', name: 'Bedroom' }, '23': { id: '23', name: 'Hall' } },
  scenes: { '3': { scene_id: '3', name: 'Movie night' } },
  bridge: { host: '192.168.1.91' },
};
const states = { '5': { level: 40 }, '6': { level: 0 }, '7': { level: 100 }, '8': { level: 0, fan_speed: 'Off' }, '10': { level: 0 }, '11': { level: 0 } };
let config = null;

const pad = n => String(n).padStart(2, '0');
// FAKE_NOW drives the whole rig at a chosen time of day: "15:30" (today), "-3h" / "+90m" (from now), or an ISO
// time. Everything below reads now() rather than the real clock, so the app, the sun and "Follow the day" all
// agree about what time it is in this pretend home.
const SKEW = (() => {
  const v = String(process.env.FAKE_NOW || '').trim(); if (!v) return 0;
  const rel = v.match(/^([+-]\d+(?:\.\d+)?)\s*([hm])$/i);
  if (rel) return Number(rel[1]) * (rel[2].toLowerCase() === 'h' ? 3600000 : 60000);
  const hm = v.match(/^(\d{1,2}):(\d{2})$/);
  const now = new Date();
  if (hm) { const t = new Date(now); t.setHours(Number(hm[1]), Number(hm[2]), 0, 0); return t - now; }
  const abs = new Date(v); return isNaN(abs) ? 0 : abs - now;
})();
const now = () => new Date(Date.now() + SKEW);
if (SKEW) console.log('fake clock:', iso(now()));
function iso(d) { const o = -d.getTimezoneOffset(); const s = o >= 0 ? '+' : '-'; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${s}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`; }
function at(d, h, m) { const x = new Date(d); x.setHours(h, m, 0, 0); return x; }
function sunToday(day) { return { rise: at(day, 6, 41), set: at(day, 19, 12) }; }
function curveLevel() {
  const ad = (config && config.settings && config.settings.adaptive) || {};
  const n = now(); const h = n.getHours() + n.getMinutes() / 60;
  const lv = h < 7.5 ? 60 : h < 19.5 ? 100 : h < 22 ? Math.round(100 - (h - 19.5) / 2.5 * 50) : 15;
  return ad.enabled ? lv : null;
}
function sun() {
  const n = now(); const s = sunToday(n);
  const loc = config && config.settings && config.settings.location;
  const noon = new Date((s.rise.getTime() + s.set.getTime()) / 2);
  const h = n.getHours() + n.getMinutes() / 60;
  const curve = h < 7.5 ? 60 : h < 19.5 ? 100 : h < 22 ? Math.round(100 - (h - 19.5) / 2.5 * 50) : 15;
  return { now: iso(n), sunrise: loc ? iso(s.rise) : null, sunset: loc ? iso(s.set) : null, noon: loc ? iso(noon) : null, curve_level: curve };
}
function fireTime(sc, day) {
  if (sc.at.type === 'time') { const [h, m] = sc.at.time.split(':').map(Number); return at(day, h, m); }
  const s = sunToday(day); const base = sc.at.type === 'sunrise' ? s.rise : s.set;
  return new Date(base.getTime() + (sc.at.offset_min || 0) * 60000);
}
function nextRuns() {
  const out = {}; const now = new Date(Date.now() + SKEW);
  for (const sc of (config && config.schedules) || []) {
    out[sc.id] = null;
    if (sc.enabled === false) continue;
    for (let d = 0; d < 8; d++) {
      const day = new Date(now); day.setDate(day.getDate() + d);
      if (!(sc.days || [0, 1, 2, 3, 4, 5, 6]).includes(day.getDay())) continue;
      if (sc.skip_until && `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}` <= sc.skip_until) continue;
      const when = fireTime(sc, day);
      if (when > now) { out[sc.id] = iso(when); break; }
    }
  }
  return out;
}
const send = m => ws.send(JSON.stringify(m));

// ----- Follow the day: the fake connector keeps a following lamp's white matched to the time of day -----
// The same anchor table as agent/daylight.py and web/js/daylight.js: (moment, minutes from it, kelvin).
const FOLLOW_ANCHORS = [['midnight', 0, 2000], ['sunrise', -60, 2200], ['sunrise', 0, 2700], ['sunrise', 90, 4000], ['noon', 0, 5200], ['sunset', -120, 4000], ['sunset', 0, 2900], ['sunset', 60, 2400]];
const FOLLOW = { paused: new Set(), scene: new Set(), cfg: new Set(), sent: {}, lit: {} };
const mirekOf = k => 1e6 / k;
function followPoints(when) {
  const out = [];
  for (const delta of [-1, 0, 1]) {
    const day = new Date(when); day.setDate(day.getDate() + delta);
    const s = sunToday(day); const noon = new Date((s.rise.getTime() + s.set.getTime()) / 2);
    const base = { sunrise: s.rise, sunset: s.set, noon, midnight: new Date(+noon - 12 * 3600000) };
    for (const [m, off, k] of FOLLOW_ANCHORS) out.push([new Date(+base[m] + off * 60000), mirekOf(k)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
function followMirek(when) {
  const pts = followPoints(when); const t = +when;
  if (t <= +pts[0][0]) return pts[0][1];
  if (t >= +pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) if (t <= +pts[i][0]) { const [t0, m0] = pts[i - 1], [t1, m1] = pts[i]; return m0 + (m1 - m0) * ((t - t0) / Math.max(1, t1 - t0)); }
  return pts[pts.length - 1][1];
}
const followKelvin = when => Math.round(1e6 / followMirek(when || now()));
function followSettings() { const fd = (config && config.settings && config.settings.follow_day) || {}; return { ids: fd.device_ids || [], brightness: !!fd.brightness }; }
function followingIds() { const s = followSettings(); return [...new Set([...s.ids, ...FOLLOW.scene])].filter(d => !FOLLOW.paused.has(d)); }
function followState() { return { ids: followingIds(), paused: [...FOLLOW.paused].sort(), kelvin: { ...FOLLOW.sent }, brightness: followSettings().brightness, ready: !!(config && config.settings && config.settings.location) }; }
const sendFollow = () => send({ type: 'follow', follow: followState() });
function followApply(only) {
  if (!(config && config.settings && config.settings.location)) return 0;
  const want = followingIds();
  const ids = (only || want).filter(d => want.includes(d));
  const s = followSettings(); const curve = s.brightness ? curveLevel() : null;
  const upd = {}; const when = now();
  for (const id of ids) {
    const d = inventory.devices[id]; if (!d || !d.ct) continue;
    const lv = (states[id] || {}).level || 0; if (lv <= 0) continue;   // never turn one on, never touch one that is off
    const [lo, hi] = d.ct_range || [2000, 6500];
    const k = Math.max(lo, Math.min(hi, followKelvin(when)));
    const prev = FOLLOW.sent[id];
    if (prev && Math.abs(mirekOf(prev) - mirekOf(k)) < 2) continue;
    FOLLOW.sent[id] = k;
    states[id] = { ...(states[id] || {}), color: { mode: 'ct', kelvin: k, xy: null, hex: kelvinHex(k) } };
    if (curve != null && lv > curve) states[id].level = curve;   // brightness stays the wind-down's number
    upd[id] = states[id];
  }
  if (Object.keys(upd).length) { send({ type: 'state', states: upd }); sendFollow(); }
  return Object.keys(upd).length;
}
// A colour or a warmth set by hand pauses that lamp until it is next turned off and on again.
function followByHand(ids) {
  let hit = false;
  for (const id of ids) if (followingIds().includes(id)) { FOLLOW.paused.add(id); delete FOLLOW.sent[id]; hit = true; }
  if (hit) sendFollow();
}
function followZone(id, lv) {
  const lit = (lv || 0) > 0; const was = FOLLOW.lit[id]; FOLLOW.lit[id] = lit;
  if (was === lit) return;
  if (!lit) { delete FOLLOW.sent[id]; if (FOLLOW.paused.delete(id)) sendFollow(); return; }
  if (followingIds().includes(id)) setTimeout(() => followApply([id]), 20);
}
function followConfig() {
  const cfg = new Set(followSettings().ids);
  for (const id of FOLLOW.cfg) if (!cfg.has(id)) { FOLLOW.scene.delete(id); FOLLOW.paused.delete(id); delete FOLLOW.sent[id]; }
  for (const id of cfg) if (!FOLLOW.cfg.has(id)) FOLLOW.paused.delete(id);
  FOLLOW.cfg = cfg;
  followApply(); sendFollow();
}
setInterval(() => { if (ws.readyState === 1) followApply(); }, 5000);
ws.on('open', () => {
  // The hub updates a connector that is behind, and a fake one dies trying. Report whatever the repo
  // declares, so the rig is never told to update itself mid-suite.
  send({ type: 'hello', version: repoVersion(), commit: 'fake', inventory, states, sun: sun(), next_runs: nextRuns(), hue: hue, nanoleaf: nanoleaf, follow: followState(),
    health: { bridge_ok: true, buttons: Object.keys(inventory.buttons).length, bindings: 0, last_press_at: null, presses: 0, quiet_remotes: [] } });
  console.log('fake agent connected');
});
ws.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.type === 'config') { config = m.config;
    setTimeout(() => send({ type: 'health', health: { bridge_ok: true, buttons: Object.keys(inventory.buttons).length, bindings: (config.bindings || []).length, last_press_at: Math.floor(Date.now() / 1000) - 120, last_press: '9/0', presses: 3 } }), 50); console.log('got config with', config.bindings.length, 'bindings,', (config.schedules || []).length, 'schedules'); send({ type: 'sun', sun: sun(), next_runs: nextRuns() }); followConfig(); }
  if (m.type === 'command') {
    console.log('command', JSON.stringify(m.action));
    if (m.action.type && m.action.type.startsWith('add_')) { addCommand(m); return; }
    if (m.action.type && m.action.type.startsWith('hue_')) { hueCommand(m); return; }
    if (m.action.type && m.action.type.startsWith('nanoleaf_')) { nanoleafCommand(m); return; }
    if (m.action.type && m.action.type.startsWith('room_')) { roomCommand(m); return; }
    if (m.action.type === 'remove_device') { const id = m.action.id; if (!inventory.devices[id]) { send({ type: 'result', id: m.id, ok: false, error: 'Bridge returned 404 NotFound' }); return; }
      // STUBBORN_REMOVE: the bridge says yes and goes on listing the device, as the owner's did
      if (process.env.STUBBORN_REMOVE) { send({ type: 'result', id: m.id, ok: true, detail: { removed: { status: '204 NoContent' }, id, still_listed: true } }); send({ type: 'inventory', inventory }); return; }
      delete inventory.devices[id]; for (const b of Object.keys(inventory.buttons)) if (inventory.buttons[b].device_id === id) delete inventory.buttons[b]; send({ type: 'result', id: m.id, ok: true, detail: { removed: { status: '204 NoContent' }, id } }); send({ type: 'inventory', inventory }); return; }
    const a = m.action;
    // LAG_MS simulates a slow bridge round trip: the result and the echo come back late, like the real thing
    const lag = a.type === 'level' || a.type === 'color' ? Number(process.env.LAG_MS || 0) : 0;
    setTimeout(() => send({ type: 'result', id: m.id, ok: m.action.type !== 'fan', error: m.action.type === 'fan' ? 'simulated failure' : undefined }), lag);
    if (a.type === 'restore') {
      const ids = resolve(a.target); const upd = {}; const picks = ids.filter(id => lastOn[id]);
      for (const id of (picks.length ? picks : ids)) { states[id] = { ...(states[id] || {}), level: picks.length ? lastOn[id] : 100 }; upd[id] = states[id]; }
      setTimeout(() => send({ type: 'state', states: upd }), lag);
    }
    if (a.type === 'level') {
      const ids = resolve(a.target);
      const upd = {};
      // remember what was lit before the house goes dark, like the connector does
      if (a.level === 'off' || a.level === 0 || a.level === 'toggle') { const lit = {}; for (const [id, st] of Object.entries(states)) if ((st.level || 0) > 0) lit[id] = st.level; if (Object.keys(lit).length) lastOn = lit; }
      for (const id of ids) { const cur = (states[id] || {}).level || 0; const v = a.level === 'toggle' ? (ids.some(x => ((states[x] || {}).level || 0) > 0) ? 0 : 100) : a.level === 'on' ? 100 : a.level === 'off' ? 0 : Number(a.level); states[id] = { ...(states[id] || {}), level: v }; upd[id] = states[id]; if (cur === v) continue; }
      if (Object.keys(upd).length) setTimeout(() => { send({ type: 'state', states: upd }); for (const id of Object.keys(upd)) followZone(id, upd[id].level); }, lag);
    }
    if (a.type === 'color') {
      // only the Hue lamps that can do what is asked; the echo carries the new colour like the real connector's state does
      const want = a.kelvin != null ? 'ct' : 'color';
      const ids = resolve(a.target).filter(id => inventory.devices[id] && inventory.devices[id][want]);
      const upd = {};
      for (const id of ids) { states[id] = { ...(states[id] || {}), level: a.level != null ? a.level : ((states[id] || {}).level || 100), color: colorFor(id, a) }; upd[id] = states[id]; }
      followByHand(ids);
      if (Object.keys(upd).length) setTimeout(() => send({ type: 'state', states: upd }), lag);
    }
    if (a.type === 'preset' && config) { const p = (config.presets || []).find(x => x.id === a.preset_id); if (p) { const upd = {}; const follows = [];
      for (const [id, v] of Object.entries(p.levels)) { const obj = v && typeof v === 'object'; states[id] = { ...(states[id] || {}), level: obj ? (v.level || 0) : typeof v === 'number' ? v : 0 }; if (obj && (v.kelvin != null || v.hex) && inventory.devices[id]) states[id].color = colorFor(id, v); if (obj && v.follow && inventory.devices[id] && inventory.devices[id].ct) { FOLLOW.scene.add(id); FOLLOW.paused.delete(id); delete FOLLOW.sent[id]; follows.push(id); } upd[id] = states[id]; }
      send({ type: 'state', states: upd });
      for (const id of Object.keys(upd)) FOLLOW.lit[id] = (upd[id].level || 0) > 0;
      if (follows.length) { followApply(follows); sendFollow(); } } }
    // what the real connector sends (agent/agent.py _on_timer): one "timer" per target, ends_at null when it is gone
    const tkey = t => (Array.isArray(t) ? t.join('|') : t);
    if (a.type === 'timer') send({ type: 'timer', target: tkey(a.target), ends_at: Math.floor(Date.now() / 1000) + a.minutes * 60, level: a.level || 0 });
    if (a.type === 'cancel_timer') send({ type: 'timer', target: tkey(a.target), ends_at: null, level: 0 });
  }
});
// a rough black-body tint for a white tone, the same fit the connector paints
function kelvinHex(k) {
  const t = Math.max(1000, Math.min(40000, k)) / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  return '#' + [r, g, b].map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}
function colorFor(id, v) {
  const d = inventory.devices[id] || {}; const prev = (states[id] || {}).color || {};
  if (v.kelvin != null && d.ct) { const [lo, hi] = d.ct_range || [2000, 6500]; const k = Math.max(lo, Math.min(hi, v.kelvin)); return { mode: 'ct', kelvin: k, xy: prev.xy || null, hex: kelvinHex(k) }; }
  if (v.hex && d.color) return { mode: 'xy', kelvin: prev.kelvin || null, xy: [0.3, 0.3], hex: v.hex.toLowerCase() };
  return prev;
}
let lastOn = {};
function resolve(t) {
  if (Array.isArray(t)) return [...new Set(t.flatMap(resolve))];
  if (!t) return [];
  const all = Object.values(inventory.devices).filter(d => ['light', 'switch'].includes(d.domain)).map(d => d.device_id);
  if (t === 'h:all') return all;
  const [k, id] = [t[0], t.slice(2)];
  if (k === 'd') return inventory.devices[id] ? [id] : [];
  if (k === 'a') return Object.values(inventory.devices).filter(d => d.area === id && ['light', 'switch'].includes(d.domain)).map(d => d.device_id);
  if (k === 'g' && config) { const g = (config.groups || []).find(x => x.id === id); return g ? g.device_ids : []; }
  return [];
}
// simulate a double click on button 0 after 3s, and a sun refresh every minute
setTimeout(() => {
  for (const ev of ['Press', 'Release']) send({ type: 'button', device_id: '9', button_number: 0, event: ev });
  send({ type: 'gesture', device_id: '9', button_number: 0, gesture: 'double' });
}, 3000);
setInterval(() => { if (ws.readyState === 1) send({ type: 'sun', sun: sun(), next_runs: nextRuns() }); followConfig(); }, 60000);

// ----- "Add a device": pretend the bridge hears a Pico 2.5 s after listening starts -----
let addState = { active: false, until: 0, heard: [], log: [] };
const addNote = (kind, url, extra) => { const entry = { at: Date.now() / 1000, kind, url, ...extra }; addState.log.push(entry); send({ type: 'add_log', entry }); };
function addCommand(m) {
  const a = m.action;
  if (a.type === 'add_start') {
    addState = { active: true, until: Date.now() / 1000 + 180, heard: [], log: [] };
    addNote('subscribed', '/device/status/deviceheard', { response: { status: '200 OK' } });
    addNote('response', '/system/status', { request: { type: 'UpdateRequest', body: { SystemStatus: { InAssociationMode: true } } }, response: { status: '204 NoContent' } });
    send({ type: 'add_state', state: addState, reason: 'started' });
    send({ type: 'result', id: m.id, ok: true, detail: addState });
    setTimeout(() => {
      if (!addState.active) return;
      const dev = { serial: '69709128', model: 'PJ2-3BRL-GXX-X01', device_type: 'Pico3ButtonRaiseLower', mechanism: 'UserInteraction', at: Date.now() / 1000 };
      addState.heard = [dev];
      addNote('heard', '/device/status/deviceheard', { response: dev });
      send({ type: 'add_heard', device: dev, heard: addState.heard });
    }, 2500);
  } else if (a.type === 'add_stop') {
    if (addState.active) { addState.active = false; addNote('response', '/system/status', { request: { type: 'UpdateRequest', body: { SystemStatus: { InAssociationMode: false } } }, response: { status: '204 NoContent' } }); }
    send({ type: 'add_state', state: addState, reason: 'stopped' });
    send({ type: 'result', id: m.id, ok: true, detail: addState });
  } else if (a.type === 'add_create') {
    if (a.name === 'fail') { addNote('error', '/device', { request: { type: 'CreateRequest', body: { Device: { Name: a.name } } }, error: 'Bridge returned 400 BadRequest' }); send({ type: 'result', id: m.id, ok: false, error: 'Bridge returned 400 BadRequest' }); return; }
    addNote('response', '/device', { request: { type: 'CreateRequest', body: { Device: { Name: a.name, SerialNumber: Number(a.serial), AssociatedArea: { href: '/area/' + a.area } } } }, response: { status: '201 Created', body: { Device: { href: '/device/13' } } } });
    const h = addState.heard.find(x => x.serial === a.serial) || {};
    inventory.devices['13'] = { device_id: '13', name: a.name, type: h.device_type || 'Pico3ButtonRaiseLower', domain: 'pico', area: a.area, zone: null, serial: h.serial };
    // ODD_BUTTONS: a remote paired this way can report its buttons numbered from 1 instead of 0
    const base = process.env.ODD_BUTTONS ? 1 : 0;
    for (let i = 0; i < 5; i++) inventory.buttons['13' + i] = { button_id: '13' + i, device_id: '13', button_number: base + i };
    addState.heard = addState.heard.filter(x => x.serial !== a.serial); addState.active = false;
    send({ type: 'add_state', state: addState, reason: 'created' });
    send({ type: 'result', id: m.id, ok: true, detail: { created: { status: '201 Created' }, name: a.name, area: a.area, device_id: '13', buttons: 5, devices: Object.keys(inventory.devices).length } });
    send({ type: 'inventory', inventory });
  }
}

// ----- rooms on the two bridges -----
// The Lutron bridge does not document rooms. REFUSE_AREA=1 plays the owner's own bridge, which answers
// 400 BadRequest to CreateRequest /area; without it the bridge takes it and hands back a new area.
// The Hue bridge plays it by the book: a room is made, renamed, emptied and deleted as asked.
let nextArea = 30, nextHueRoom = 2;
function roomCommand(m) {
  const a = m.action; const op = a.type.slice(5);
  const ok = detail => send({ type: 'result', id: m.id, ok: true, detail });
  const no = error => send({ type: 'result', id: m.id, ok: false, error });
  if (op === 'area_create') {
    if (process.env.REFUSE_AREA) {
      addNote('area variant failed', '/area', { request: { type: 'CreateRequest', body: { Area: { Name: a.name, Parent: { href: '/area/1' } } } }, error: 'Bridge returned 400 BadRequest' });
      addNote('area variant failed', '/area', { request: { type: 'CreateRequest', body: { Area: { Name: a.name } } }, error: 'Bridge returned 400 BadRequest' });
      return no('Bridge returned 400 BadRequest');
    }
    const id = String(nextArea++);
    inventory.areas[id] = { id, name: a.name };
    addNote('area made', '/area', { request: { type: 'CreateRequest', body: { Area: { Name: a.name, Parent: { href: '/area/1' } } } }, response: { status: '201 Created', body: { Area: { href: '/area/' + id } } } });
    ok({ area_id: id, name: a.name });
    send({ type: 'inventory', inventory });
    return;
  }
  if (op === 'area_rename') {
    const ar = inventory.areas[a.area]; if (!ar) return no('Bridge returned 404 NotFound');
    if (process.env.REFUSE_AREA) return no('Bridge returned 400 BadRequest');
    ar.name = a.name; ok({ area_id: a.area, name: a.name }); send({ type: 'inventory', inventory });
    return;
  }
  if (op === 'device_move') {
    const d = inventory.devices[a.id]; if (!d) return no('Bridge returned 404 NotFound');
    if (!inventory.areas[a.area]) return no('Bridge returned 404 NotFound');
    d.area = a.area; ok({ id: a.id, area: a.area }); send({ type: 'inventory', inventory });
    return;
  }
  if (op === 'hue_create') {
    if (!hue.paired) return no('no Hue bridge');
    const id = `hue_room${nextHueRoom++}`;
    inventory.areas[id] = { id, name: a.name };
    hue.rooms = Object.keys(inventory.areas).filter(k => k.startsWith('hue_')).length;
    ok({ room: id, name: a.name }); send({ type: 'inventory', inventory }); send({ type: 'hue', hue });
    return;
  }
  if (op === 'hue_rename') {
    const ar = inventory.areas[a.room]; if (!ar) return no('Hue bridge said 404');
    ar.name = a.name; ok({ room: a.room, name: a.name }); send({ type: 'inventory', inventory });
    return;
  }
  if (op === 'hue_delete') {
    if (!inventory.areas[a.room]) return no('Hue bridge said 404');
    delete inventory.areas[a.room];
    for (const d of Object.values(inventory.devices)) if (d.area === a.room) d.area = null;
    hue.rooms = Object.keys(inventory.areas).filter(k => k.startsWith('hue_')).length;
    ok({ room: a.room, deleted: true }); send({ type: 'inventory', inventory }); send({ type: 'hue', hue });
    return;
  }
  if (op === 'hue_move') {
    const d = inventory.devices[a.device]; if (!d) return no('unknown Hue light');
    if (!inventory.areas[a.room]) return no('unknown Hue room');
    d.area = a.room; ok({ device: a.device, room: a.room }); send({ type: 'inventory', inventory });
    return;
  }
  no('unknown room command ' + op);
}

// ----- Philips Hue: a pretend bridge at 192.168.1.20 with three lights in an Office room -----
let hue = { paired: false, host: null, lights: 0, rooms: 0, scenes: 0, error: null, live: false };
function hueCommand(m) {
  const a = m.action;
  if (a.type === 'hue_discover') { setTimeout(() => send({ type: 'result', id: m.id, ok: true, detail: { bridges: [{ host: '192.168.1.20', id: 'ecb5fafffe0a0b0c', name: 'Philips Hue - 0A0B0C' }] } }), 800); return; }
  if (a.type === 'hue_pair') {
    if (a.host === '10.0.0.9') { setTimeout(() => send({ type: 'result', id: m.id, ok: false, error: 'the Hue bridge did not hand out a key: link button not pressed' }), 1200); return; }
    setTimeout(() => {
      hue = { paired: true, host: a.host, lights: 3, rooms: 1, scenes: 0, error: null, live: true };
      inventory.areas['hue_room1'] = { id: 'hue_room1', name: 'Office' };
      inventory.devices['hue_l1'] = { device_id: 'hue_l1', name: 'Desk lamp', type: 'HueLight', domain: 'light', area: 'hue_room1', zone: 'l1', color: true, ct: true, ct_range: [2000, 6500] };
      inventory.devices['hue_l2'] = { device_id: 'hue_l2', name: 'Ceiling', type: 'HueLight', domain: 'light', area: 'hue_room1', zone: 'l2', ct: true, ct_range: [2200, 6500] };
      inventory.devices['hue_l3'] = { device_id: 'hue_l3', name: 'Plug', type: 'HueSwitch', domain: 'switch', area: 'hue_room1', zone: 'l3' };
      states['hue_l1'] = { level: 55, color: { mode: 'ct', kelvin: 2700, xy: null, hex: kelvinHex(2700) } }; states['hue_l2'] = { level: 0, color: { mode: 'ct', kelvin: 4000, xy: null, hex: kelvinHex(4000) } }; states['hue_l3'] = { level: 0 };
      inventory.hue = hue;
      send({ type: 'result', id: m.id, ok: true, detail: hue });
      send({ type: 'inventory', inventory }); send({ type: 'state', states }); send({ type: 'hue', hue });
    }, 1500);
    return;
  }
  if (a.type === 'hue_forget') {
    hue = { paired: false, host: null, lights: 0, rooms: 0, scenes: 0, error: null, live: false };
    for (const k of Object.keys(inventory.devices)) if (k.startsWith('hue_')) delete inventory.devices[k];
    for (const k of Object.keys(inventory.areas)) if (k.startsWith('hue_')) delete inventory.areas[k];
    for (const k of Object.keys(inventory.scenes)) if (k.startsWith('hue_')) delete inventory.scenes[k];
    inventory.hue = hue;
    send({ type: 'result', id: m.id, ok: true, detail: hue }); send({ type: 'inventory', inventory }); send({ type: 'hue', hue });
  }
}

// ----- Nanoleaf: no bridge, so unlike Hue this is a list; each pairing adds one more controller of its own,
// found or typed at its own address, forgettable on its own. Two are seeded as discoverable by mDNS. -----
let nanoleaf = { devices: [], count: 0, live: false };
let nlSerial = 1;
const NL_FOUND = { '192.168.1.44': 'Living room panels', '192.168.1.45': 'Bedroom panels' };
function nanoleafCommand(m) {
  const a = m.action;
  if (a.type === 'nanoleaf_discover') {
    setTimeout(() => send({ type: 'result', id: m.id, ok: true, detail: { devices: Object.entries(NL_FOUND).map(([host, name]) => ({ host, name })) } }), 800);
    return;
  }
  if (a.type === 'nanoleaf_pair') {
    if (a.host === '10.0.0.9') { setTimeout(() => send({ type: 'result', id: m.id, ok: false, error: 'the Nanoleaf controller did not hand out a key: the panels did not flash: hold the power button for 5-7 seconds, then try Connect right after' }), 1200); return; }
    setTimeout(() => {
      const serial = 'NL-' + (nlSerial++);
      const name = NL_FOUND[a.host] || 'Nanoleaf';
      const did = 'nanoleaf_' + serial;
      nanoleaf = { devices: [...nanoleaf.devices, { serial, name, model: 'NL29', host: a.host, error: null }], count: nanoleaf.devices.length + 1, live: true };
      inventory.devices[did] = { device_id: did, name, type: 'NanoleafLight', domain: 'light', area: null, zone: serial, color: true, ct: true, ct_range: [1200, 6500] };
      states[did] = { level: 0, color: { mode: 'ct', kelvin: 4000, xy: null, hex: kelvinHex(4000) } };
      inventory.nanoleaf = nanoleaf;
      send({ type: 'result', id: m.id, ok: true, detail: nanoleaf });
      send({ type: 'inventory', inventory }); send({ type: 'state', states }); send({ type: 'nanoleaf', nanoleaf });
    }, 1500);
    return;
  }
  if (a.type === 'nanoleaf_forget') {
    const serial = a.serial; const did = 'nanoleaf_' + serial;
    nanoleaf = { devices: nanoleaf.devices.filter(d => d.serial !== serial), count: 0, live: nanoleaf.live };
    nanoleaf.count = nanoleaf.devices.length;
    delete inventory.devices[did]; delete states[did];
    inventory.nanoleaf = nanoleaf;
    send({ type: 'result', id: m.id, ok: true, detail: nanoleaf }); send({ type: 'inventory', inventory }); send({ type: 'state', states }); send({ type: 'nanoleaf', nanoleaf });
  }
}
