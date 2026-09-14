/* Pico Hack PWA. One file, no framework. State in S, views render into #view. */
'use strict';

const S = {
  token: localStorage.getItem('token') || '',
  inv: { devices: {}, buttons: {}, scenes: {}, areas: {}, bridge: null },
  states: {},
  config: null,
  agent: { online: false, info: null },
  view: (location.hash || '#home').slice(1).split('/')[0],
  pico: null,          // selected pico device_id
  button: null,        // selected button_number
  live: {},            // "device/button" -> {event, gesture, at}
  log: [],
  dirty: false,
  ws: null,
  ready: false,
};

// Pico button labels by LEAP button number (what the bridge reports). Cosmetic only.
const LAYOUTS = {
  Pico2Button: { 0: 'On', 2: 'Off' },
  PaddleSwitchPico: { 0: 'On', 2: 'Off' },
  Pico2ButtonRaiseLower: { 0: 'On', 2: 'Off', 3: 'Raise', 4: 'Lower' },
  Pico3Button: { 0: 'On', 1: 'Favorite', 2: 'Off' },
  Pico3ButtonRaiseLower: { 0: 'On', 1: 'Favorite', 2: 'Off', 3: 'Raise', 4: 'Lower' },
  Pico4Button: { 1: '1', 2: '2', 3: '3', 4: '4' },
  Pico4ButtonScene: { 0: '1', 1: '2', 2: '3', 3: '4' },
  Pico4ButtonZone: { 0: '1', 1: '2', 2: '3', 3: '4' },
  Pico4Button2Group: { 0: 'A On', 1: 'A Off', 2: 'B On', 3: 'B Off' },
  Pico1Button: { 0: 'Button' },
};
const GESTURES = [
  ['single', 'Single click', 'Fires on release. If a double click is also bound, waits the double window first.'],
  ['double', 'Double click', 'Two clicks inside the double window.'],
  ['hold', 'Hold', 'Fires when you let go after holding.'],
  ['hold_start', 'Hold begins', 'Fires the moment the hold threshold passes. Pair with Hold ends for raise / lower.'],
  ['hold_end', 'Hold ends', 'Fires when you release after a hold begins. Use it to send Stop.'],
];
const ACTIONS = {
  level: 'Set level', step: 'Step brightness', cycle: 'Cycle levels', raise: 'Raise (ramp up)', lower: 'Lower (ramp down)', stop: 'Stop ramp',
  fan: 'Fan speed', scene: 'Lutron scene', preset: 'App scene', delay: 'Wait',
};
const FANS = ['Off', 'Low', 'Medium', 'MediumHigh', 'High'];

// ---------- utils ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
let toastTimer;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, err ? 4000 : 2200);
}
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${S.token}`, ...(opts.headers || {}) } });
  if (res.status === 401) { S.token = ''; localStorage.removeItem('token'); render(); throw new Error('signed out'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status}`);
  return body;
}
async function command(action, quiet) {
  try { await api('/api/command', { method: 'POST', body: JSON.stringify(action) }); if (!quiet) toast('Sent'); }
  catch (e) { toast(e.message, true); }
}
async function saveConfig() {
  try {
    const r = await api('/api/config', { method: 'PUT', body: JSON.stringify(S.config) });
    S.config = r.config; S.dirty = false; toast('Saved'); render();
  } catch (e) { toast(e.message, true); }
}
function markDirty() { S.dirty = true; renderSavebar(); }

const devList = () => Object.values(S.inv.devices || {});
const dev = id => (S.inv.devices || {})[id];
const areaName = id => ((S.inv.areas || {})[id] || {}).name || '';
const devName = id => { const d = dev(id); return d ? d.name : `device ${id}`; };
const controllable = () => devList().filter(d => ['light', 'switch', 'fan', 'cover'].includes(d.domain)).sort(byArea);
const picos = () => devList().filter(d => d.domain === 'pico').sort(byArea);
function byArea(a, b) { return (areaName(a.area) + a.name).localeCompare(areaName(b.area) + b.name); }
const level = id => { const s = S.states[id]; return s && s.level != null ? s.level : null; };
const targetName = t => t.startsWith('g:') ? `Group: ${(S.config.groups.find(g => g.id === t.slice(2)) || {}).name || '?'}` : devName(t.slice(2));
const buttonsOf = pid => Object.values(S.inv.buttons || {}).filter(b => b.device_id === pid).sort((a, b) => a.button_number - b.button_number);
const buttonLabel = (pid, n) => { const d = dev(pid); const l = d && LAYOUTS[d.type]; return (l && l[n]) || `Button ${n}`; };
const bindingsFor = (pid, n) => S.config.bindings.filter(b => b.device_id === pid && b.button_number === n);

// ---------- websocket ----------
function connectWS() {
  if (S.ws) { try { S.ws.close(); } catch (_) { /* ignore */ } }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/app?token=${encodeURIComponent(S.token)}`);
  S.ws = ws;
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case 'snapshot':
        S.inv = m.inventory; S.states = m.states; S.agent = m.agent; if (!S.dirty) S.config = m.config; S.ready = true; render(); break;
      case 'inventory': S.inv = m.inventory; render(); break;
      case 'state': Object.assign(S.states, m.states); refreshLevels(); break;
      case 'config': if (!S.dirty) { S.config = m.config; render(); } break;
      case 'agent': S.agent = { online: m.online, info: m.info || null }; renderTop(); if (S.view === 'home' || S.view === 'settings') render(); break;
      case 'button': case 'gesture': onLive(m); break;
      case 'toast': toast(m.msg, m.level === 'error'); break;
    }
  };
  ws.onclose = () => { setTimeout(() => { if (S.token) connectWS(); }, 2000); };
}
function onLive(m) {
  const key = `${m.device_id}/${m.button_number}`;
  const cur = S.live[key] || {};
  if (m.type === 'button') { cur.event = m.event; cur.at = Date.now(); if (m.event === 'Press') cur.gesture = null; }
  else { cur.gesture = m.gesture; cur.at = Date.now(); }
  S.live[key] = cur;
  const label = `${devName(m.device_id)} · ${buttonLabel(m.device_id, m.button_number)} · ${m.type === 'button' ? m.event : m.gesture.replace('_', ' ')}`;
  S.log.unshift(`${new Date().toLocaleTimeString()}  ${label}`); S.log.length = Math.min(S.log.length, 30);
  if (S.view === 'picos') {
    if (!S.pico) { S.pico = m.device_id; S.button = m.button_number; render(); return; }
    if (S.pico === m.device_id && m.type === 'gesture' && S.button !== m.button_number) { S.button = m.button_number; render(); return; }
    paintLive();
  }
}
function paintLive() {
  document.querySelectorAll('[data-live]').forEach(el => {
    const l = S.live[el.dataset.live];
    const hot = l && Date.now() - l.at < 1500;
    el.classList.toggle('live', !!(hot && l.event === 'Press'));
    if (el.dataset.gesture) el.classList.toggle('live', !!(hot && l.gesture === el.dataset.gesture));
  });
  const lg = $('#livelog'); if (lg) lg.innerHTML = S.log.map(esc).join('<br>');
  setTimeout(() => document.querySelectorAll('.live').forEach(el => { const l = S.live[el.dataset.live]; if (!l || Date.now() - l.at >= 1500) el.classList.remove('live'); }), 1600);
}
function refreshLevels() {
  document.querySelectorAll('[data-lvl]').forEach(el => {
    const id = el.dataset.lvl; const v = level(id);
    if (el.type === 'range') { if (document.activeElement !== el) el.value = v == null ? 0 : v; }
    else if (el.classList.contains('toggle')) el.classList.toggle('on', v > 0);
    else if (el.dataset.speed) el.classList.toggle('on', (S.states[id] || {}).fan_speed === el.dataset.speed);
    else el.textContent = v == null ? '?' : v === 0 ? 'Off' : `${v}%`;
  });
  document.querySelectorAll('[data-glvl]').forEach(el => {
    const g = S.config.groups.find(x => x.id === el.dataset.glvl); if (!g) return;
    const on = g.device_ids.some(id => level(id) > 0);
    el.classList.toggle('on', on);
  });
}

// ---------- rendering ----------
function render() {
  renderTop();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === S.view));
  const v = $('#view');
  if (!S.token) { v.innerHTML = loginHTML(); $('#nav').style.display = 'none'; return; }
  $('#nav').style.display = '';
  if (!S.ready || !S.config) { v.innerHTML = '<div class="empty">Connecting…</div>'; return; }
  v.innerHTML = ({ home: homeHTML, picos: picosHTML, groups: groupsHTML, presets: presetsHTML, settings: settingsHTML }[S.view] || homeHTML)();
  refreshLevels(); paintLive(); renderSavebar();
}
function renderTop() {
  $('#agentDot').className = 'dot' + (S.agent.online ? ' on' : '');
  $('#agentDot').title = S.agent.online ? 'Agent online' : 'Agent offline';
  $('#topright').innerHTML = S.token && S.view !== 'home' ? '' : '';
}
function renderSavebar() {
  let bar = $('.savebar');
  if (!S.dirty) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.className = 'savebar'; document.body.appendChild(bar); }
  bar.innerHTML = '<button class="btn primary" onclick="saveConfig()">Save changes</button>';
}
function agentBanner() {
  if (S.agent.online) return '';
  const hasInv = devList().length > 0;
  return `<div class="banner err"><b>Agent offline.</b> ${hasInv ? 'Showing the last known devices; controls will fail until the agent in your house reconnects.' : 'Run the agent on a computer at home (see Setup) and it will fill this in.'}</div>`;
}

function loginHTML() {
  return `<div class="login"><div class="mark">💡</div><h1>Pico Hack</h1><p class="muted">Enter the app password.</p>
  <form onsubmit="login(event)"><input type="password" id="pw" placeholder="Password" autofocus><br><br><button class="btn primary block">Sign in</button></form></div>`;
}
async function login(e) {
  e.preventDefault();
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || 'login failed');
    S.token = b.token; localStorage.setItem('token', b.token); connectWS(); render();
  } catch (err) { toast(err.message, true); }
}

// ----- Home -----
function homeHTML() {
  const groups = S.config.groups;
  const areas = {};
  for (const d of controllable()) (areas[d.area || 'x'] = areas[d.area || 'x'] || []).push(d);
  let h = agentBanner();
  if (!devList().length) h += '<div class="empty">No devices yet.</div>';
  if (groups.length) {
    h += '<h2>Groups</h2>' + groups.map(g => `<div class="card"><div class="row between"><div class="grow"><div class="name">${esc(g.name)}</div><div class="sub">${g.device_ids.length} devices</div></div>
      <button class="btn sm" onclick="command({type:'level',target:'g:${g.id}',level:'off'},1)">Off</button>
      <button class="btn sm" onclick="command({type:'level',target:'g:${g.id}',level:'on'},1)">On</button>
      <button class="toggle" data-glvl="${g.id}" onclick="command({type:'level',target:'g:${g.id}',level:'toggle'},1)"></button></div>
      <input type="range" min="0" max="100" onchange="command({type:'level',target:'g:${g.id}',level:+this.value},1)"></div>`).join('');
  }
  if (S.config.presets.length || Object.keys(S.inv.scenes || {}).length) {
    h += '<h2>Scenes</h2><div class="chips">' +
      S.config.presets.map(p => `<button class="chip accent" onclick="command({type:'preset',preset_id:'${p.id}'})">${esc(p.name)}</button>`).join('') +
      Object.values(S.inv.scenes || {}).map(s => `<button class="chip" onclick="command({type:'scene',scene_id:'${s.scene_id}'})" title="Lutron scene">${esc(s.name)}</button>`).join('') + '</div>';
  }
  for (const [aid, ds] of Object.entries(areas).sort((a, b) => areaName(a[0]).localeCompare(areaName(b[0])))) {
    h += `<h2>${esc(areaName(aid) || 'Unassigned')}</h2>` + ds.map(deviceCard).join('');
  }
  return h;
}
function deviceCard(d) {
  const id = d.device_id;
  if (d.domain === 'fan') {
    return `<div class="card"><div class="row between"><div class="name grow">${esc(d.name)}</div></div><div class="fan" style="margin-top:8px">${FANS.map(s => `<button class="chip" data-lvl="${id}" data-speed="${s}" onclick="command({type:'fan',target:'d:${id}',speed:'${s}'},1)">${s === 'MediumHigh' ? 'Med-Hi' : s}</button>`).join('')}</div></div>`;
  }
  if (d.domain === 'cover') {
    return `<div class="card"><div class="row between"><div class="name grow">${esc(d.name)}</div><span class="sub" data-lvl="${id}"></span>
      <button class="btn sm" onclick="command({type:'raise',target:'d:${id}'},1)">Open</button><button class="btn sm" onclick="command({type:'stop',target:'d:${id}'},1)">Stop</button><button class="btn sm" onclick="command({type:'lower',target:'d:${id}'},1)">Close</button></div>
      <input type="range" min="0" max="100" data-lvl="${id}" onchange="command({type:'level',target:'d:${id}',level:+this.value},1)"></div>`;
  }
  if (d.domain === 'switch') {
    return `<div class="card"><div class="row between"><div class="name grow">${esc(d.name)}</div><button class="toggle" data-lvl="${id}" onclick="command({type:'level',target:'d:${id}',level:'toggle'},1)"></button></div></div>`;
  }
  return `<div class="card"><div class="row between"><div class="name grow">${esc(d.name)}</div><span class="sub" data-lvl="${id}"></span><button class="toggle" data-lvl="${id}" onclick="command({type:'level',target:'d:${id}',level:'toggle'},1)"></button></div>
    <input type="range" min="0" max="100" data-lvl="${id}" onchange="command({type:'level',target:'d:${id}',level:+this.value},1)"></div>`;
}

// ----- Picos -----
function picosHTML() {
  let h = agentBanner();
  const list = picos();
  if (!S.pico || !dev(S.pico)) {
    h += '<h1>Pico remotes</h1><p class="muted small">Tap a remote, or just press a button on one and it opens here.</p>';
    if (!list.length) h += '<div class="empty">No Picos found on the bridge.</div>';
    h += list.map(p => {
      const n = S.config.bindings.filter(b => b.device_id === p.device_id).length;
      return `<div class="card tap" onclick="selectPico('${p.device_id}')"><div class="row between"><div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${esc(areaName(p.area))} · ${esc(p.type)}</div></div><span class="chip sm ${n ? 'accent' : ''}">${n ? n + ' bound' : 'unbound'}</span></div></div>`;
    }).join('');
    h += `<h2>Live</h2><div class="card live-log" id="livelog">${S.log.map(esc).join('<br>') || 'Press any Pico button…'}</div>`;
    return h;
  }
  const p = dev(S.pico);
  const btns = buttonsOf(S.pico);
  if (S.button == null && btns.length) S.button = btns[0].button_number;
  h += `<div class="row between"><button class="btn ghost sm" onclick="selectPico(null)">‹ All Picos</button><span class="sub">${esc(p.type)}</span></div>
    <h1 style="margin-top:8px">${esc(p.name)}</h1><div class="sub" style="margin-top:-8px">${esc(areaName(p.area))}</div>`;
  h += '<div class="pico">' + btns.map(b => {
    const n = b.button_number; const bound = bindingsFor(S.pico, n).length > 0;
    const lbl = buttonLabel(S.pico, n);
    const round = /Favorite/.test(lbl);
    return `<button class="pb ${round ? 'round' : ''} ${bound ? 'bound' : ''} ${S.button === n ? 'sel' : ''}" data-live="${S.pico}/${n}" onclick="selectButton(${n})">${esc(lbl === 'Favorite' ? '●' : lbl)}</button>`;
  }).join('') + '</div>';
  h += `<div class="banner small">This Pico keeps doing whatever the Lutron app programmed it to do, in addition to what you bind here. For full control, open the Lutron app and remove the devices it controls (leave it paired). Then only your bindings run.</div>`;
  if (S.button != null) {
    const n = S.button;
    h += `<h2>${esc(buttonLabel(S.pico, n))} button</h2>`;
    const existing = bindingsFor(S.pico, n);
    h += '<div class="gest">' + GESTURES.map(([g, lbl]) => `<span class="chip sm ${existing.some(b => b.gesture === g) ? 'accent' : ''}" data-live="${S.pico}/${n}" data-gesture="${g}">${lbl}</span>`).join('') + '</div>';
    h += existing.map(bindingHTML).join('');
    const free = GESTURES.filter(([g]) => !existing.some(b => b.gesture === g));
    if (free.length) h += `<div class="row" style="margin-top:10px"><select id="newg" class="grow">${free.map(([g, lbl, tip]) => `<option value="${g}" title="${esc(tip)}">${lbl}</option>`).join('')}</select><button class="btn primary" onclick="addBinding()">Add gesture</button></div>`;
  }
  h += `<h2>Live</h2><div class="card live-log" id="livelog">${S.log.map(esc).join('<br>') || 'Press a button on this Pico…'}</div>`;
  return h;
}
function selectPico(id) { S.pico = id; S.button = null; render(); }
function selectButton(n) { S.button = n; render(); }
function addBinding() {
  const gesture = $('#newg').value;
  S.config.bindings.push({ id: uid(), device_id: S.pico, button_number: S.button, gesture, actions: [defaultAction()] });
  markDirty(); render();
}
function defaultAction() {
  const first = controllable()[0];
  return { type: 'level', target: first ? `d:${first.device_id}` : 'd:0', level: 'toggle' };
}
function bindingHTML(b) {
  const g = GESTURES.find(x => x[0] === b.gesture) || [b.gesture, b.gesture, ''];
  return `<div class="card bind"><div class="row between"><div class="grow"><div class="name">${esc(g[1])}</div><div class="sub">${esc(g[2])}</div></div><button class="btn sm danger" onclick="removeBinding('${b.id}')">Remove</button></div>
    ${b.actions.map((a, i) => actionHTML(b.id, i, a)).join('')}
    <div class="row" style="margin-top:8px"><button class="btn sm" onclick="addAction('${b.id}')">+ Add action</button><button class="btn sm ghost" onclick="testBinding('${b.id}')">▶ Test</button></div></div>`;
}
function removeBinding(id) { S.config.bindings = S.config.bindings.filter(b => b.id !== id); markDirty(); render(); }
function addAction(bid) { const b = S.config.bindings.find(x => x.id === bid); b.actions.push(defaultAction()); markDirty(); render(); }
function removeAction(bid, i) { const b = S.config.bindings.find(x => x.id === bid); b.actions.splice(i, 1); markDirty(); render(); }
async function testBinding(bid) {
  const b = S.config.bindings.find(x => x.id === bid);
  if (S.dirty) { toast('Save first, then test'); return; }
  for (const a of b.actions) await command(a, true);
  toast('Ran ' + b.actions.length + ' action(s)');
}
function targetOptions(sel, onlyFans) {
  const groups = S.config.groups.map(g => `<option value="g:${g.id}" ${sel === 'g:' + g.id ? 'selected' : ''}>Group: ${esc(g.name)}</option>`).join('');
  const devs = controllable().filter(d => !onlyFans || d.domain === 'fan').map(d => `<option value="d:${d.device_id}" ${sel === 'd:' + d.device_id ? 'selected' : ''}>${esc(areaName(d.area))} ${esc(d.name)}</option>`).join('');
  return (onlyFans ? '' : groups) + devs;
}
function actionHTML(bid, i, a) {
  const set = (k, v) => `onchange="setAction('${bid}',${i},'${k}',this.value)"`;
  let body = `<select ${set('type')}>${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  switch (a.type) {
    case 'level': {
      const preset = ['toggle', 'on', 'off'].includes(a.level) ? a.level : 'custom';
      body += `<select ${set('target')}>${targetOptions(a.target)}</select>
        <select ${set('level')}><option value="toggle" ${preset === 'toggle' ? 'selected' : ''}>Toggle</option><option value="on" ${preset === 'on' ? 'selected' : ''}>On</option><option value="off" ${preset === 'off' ? 'selected' : ''}>Off</option><option value="custom" ${preset === 'custom' ? 'selected' : ''}>Level…</option></select>`;
      if (preset === 'custom') body += `<input type="number" min="0" max="100" value="${a.level}" ${set('level_n')} placeholder="%">`;
      body += `<input type="number" min="0" step="0.5" value="${a.fade == null ? '' : a.fade}" ${set('fade')} placeholder="fade s">`;
      break;
    }
    case 'step': body += `<select ${set('target')}>${targetOptions(a.target)}</select><input type="number" min="-100" max="100" value="${a.delta || 10}" ${set('delta')} placeholder="±%">`; break;
    case 'cycle': body += `<select ${set('target')}>${targetOptions(a.target)}</select><input type="text" value="${(a.levels || [100, 50, 20, 0]).join(', ')}" ${set('levels')} placeholder="100, 50, 20, 0">`; break;
    case 'raise': case 'lower': case 'stop': body += `<select ${set('target')}>${targetOptions(a.target)}</select>`; break;
    case 'fan': body += `<select ${set('target')}>${targetOptions(a.target, true)}</select><select ${set('speed')}>${FANS.map(s => `<option ${a.speed === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`; break;
    case 'scene': body += `<select ${set('scene_id')}>${Object.values(S.inv.scenes || {}).map(s => `<option value="${s.scene_id}" ${a.scene_id === s.scene_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('') || '<option value="">No Lutron scenes on bridge</option>'}</select>`; break;
    case 'preset': body += `<select ${set('preset_id')}>${S.config.presets.map(p => `<option value="${p.id}" ${a.preset_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('') || '<option value="">Create an app scene first</option>'}</select>`; break;
    case 'delay': body += `<input type="number" min="0" max="60000" step="50" value="${a.ms || 500}" ${set('ms')} placeholder="ms">`; break;
  }
  return `<div class="action"><div class="row">${body}<button class="btn sm ghost danger" onclick="removeAction('${bid}',${i})">✕</button></div></div>`;
}
function setAction(bid, i, k, v) {
  const b = S.config.bindings.find(x => x.id === bid); const a = b.actions[i];
  if (k === 'type') {
    const t = a.target || defaultAction().target;
    const fresh = { level: { type: 'level', target: t, level: 'toggle' }, step: { type: 'step', target: t, delta: 10 }, cycle: { type: 'cycle', target: t, levels: [100, 50, 20, 0] },
      raise: { type: 'raise', target: t }, lower: { type: 'lower', target: t }, stop: { type: 'stop', target: t }, fan: { type: 'fan', target: `d:${(controllable().find(d => d.domain === 'fan') || {}).device_id || 0}`, speed: 'High' },
      scene: { type: 'scene', scene_id: (Object.values(S.inv.scenes || {})[0] || {}).scene_id || '' }, preset: { type: 'preset', preset_id: (S.config.presets[0] || {}).id || '' }, delay: { type: 'delay', ms: 500 } }[v];
    b.actions[i] = fresh; markDirty(); render(); return;
  }
  if (k === 'level') { if (v === 'custom') a.level = 50; else a.level = v; markDirty(); render(); return; }
  if (k === 'level_n') a.level = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  else if (k === 'fade') a.fade = v === '' ? null : Math.max(0, parseFloat(v) || 0);
  else if (k === 'delta') a.delta = Math.max(-100, Math.min(100, parseInt(v, 10) || 10)) || 10;
  else if (k === 'ms') a.ms = Math.max(0, parseInt(v, 10) || 0);
  else if (k === 'levels') a.levels = v.split(/[,\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= 0 && x <= 100);
  else a[k] = v;
  if (a.fade === null) delete a.fade;
  markDirty();
}

// ----- Groups -----
function groupsHTML() {
  let h = '<h1>Groups</h1><p class="muted small">A group is a set of lights a Pico button or a scene can drive together.</p>';
  h += S.config.groups.map(g => `<div class="card"><label class="f"><span>Name</span><input type="text" value="${esc(g.name)}" onchange="editGroup('${g.id}','name',this.value)"></label>
    <label class="f"><span>"On" level for this group (%)</span><input type="number" min="1" max="100" value="${g.on_level == null ? '' : g.on_level}" placeholder="${S.config.settings.group_on_level}" onchange="editGroup('${g.id}','on_level',this.value)"></label>
    <div class="checklist">${controllable().filter(d => d.domain !== 'cover' || true).map(d => `<label><input type="checkbox" ${g.device_ids.includes(d.device_id) ? 'checked' : ''} onchange="toggleGroupDev('${g.id}','${d.device_id}',this.checked)"><span class="grow">${esc(d.name)}</span><span class="sub">${esc(areaName(d.area))}</span></label>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm danger" onclick="removeGroup('${g.id}')">Delete group</button></div></div>`).join('');
  h += '<button class="btn block" onclick="addGroup()">+ New group</button>';
  return h;
}
function addGroup() { S.config.groups.push({ id: uid(), name: 'New group', device_ids: [], on_level: null }); markDirty(); render(); }
function editGroup(id, k, v) { const g = S.config.groups.find(x => x.id === id); if (k === 'on_level') g.on_level = v === '' ? null : Math.max(1, Math.min(100, parseInt(v, 10) || 100)); else g[k] = v; markDirty(); }
function toggleGroupDev(id, did, on) { const g = S.config.groups.find(x => x.id === id); g.device_ids = on ? [...new Set([...g.device_ids, did])] : g.device_ids.filter(x => x !== did); markDirty(); }
function removeGroup(id) {
  S.config.groups = S.config.groups.filter(x => x.id !== id);
  for (const b of S.config.bindings) b.actions = b.actions.filter(a => a.target !== `g:${id}`);
  markDirty(); render();
}

// ----- Presets (app scenes) -----
function presetsHTML() {
  let h = '<h1>Scenes</h1><p class="muted small">App scenes set exact levels on any mix of devices, with a fade. They live here, not in the Lutron app, so a Pico can call them.</p>';
  h += S.config.presets.map(p => `<div class="card"><div class="row"><label class="f grow"><span>Name</span><input type="text" value="${esc(p.name)}" onchange="editPreset('${p.id}','name',this.value)"></label>
    <label class="f" style="width:90px"><span>Fade (s)</span><input type="number" min="0" step="0.5" value="${p.fade == null ? '' : p.fade}" placeholder="${S.config.settings.default_fade}" onchange="editPreset('${p.id}','fade',this.value)"></label></div>
    <div class="row" style="margin:4px 0 8px"><button class="btn sm" onclick="capturePreset('${p.id}')">⤓ Capture current levels</button><button class="btn sm" onclick="command({type:'preset',preset_id:'${p.id}'})" ${S.dirty ? 'disabled title="save first"' : ''}>▶ Run</button></div>
    <div class="checklist">${controllable().map(d => {
      const inc = d.device_id in p.levels; const v = p.levels[d.device_id];
      const ctl = d.domain === 'fan'
        ? `<select style="width:110px" ${inc ? '' : 'disabled'} onchange="setPresetLevel('${p.id}','${d.device_id}',this.value)">${FANS.map(s => `<option ${v === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`
        : d.domain === 'switch'
          ? `<select style="width:90px" ${inc ? '' : 'disabled'} onchange="setPresetLevel('${p.id}','${d.device_id}',+this.value)"><option value="100" ${v > 0 ? 'selected' : ''}>On</option><option value="0" ${v === 0 ? 'selected' : ''}>Off</option></select>`
          : `<input type="number" min="0" max="100" style="width:80px" ${inc ? '' : 'disabled'} value="${inc ? v : ''}" onchange="setPresetLevel('${p.id}','${d.device_id}',+this.value)">`;
      return `<label><input type="checkbox" ${inc ? 'checked' : ''} onchange="togglePresetDev('${p.id}','${d.device_id}',this.checked)"><span class="grow">${esc(d.name)}<div class="sub">${esc(areaName(d.area))}</div></span>${ctl}</label>`;
    }).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm danger" onclick="removePreset('${p.id}')">Delete scene</button></div></div>`).join('');
  h += '<button class="btn block" onclick="addPreset()">+ New scene</button>';
  return h;
}
function addPreset() { S.config.presets.push({ id: uid(), name: 'New scene', levels: {}, fade: null }); markDirty(); render(); }
function editPreset(id, k, v) { const p = S.config.presets.find(x => x.id === id); if (k === 'fade') p.fade = v === '' ? null : Math.max(0, parseFloat(v) || 0); else p[k] = v; markDirty(); }
function togglePresetDev(id, did, on) {
  const p = S.config.presets.find(x => x.id === id); const d = dev(did);
  if (on) p.levels[did] = d.domain === 'fan' ? ((S.states[did] || {}).fan_speed || 'Off') : (level(did) ?? 100); else delete p.levels[did];
  markDirty(); render();
}
function setPresetLevel(id, did, v) { const p = S.config.presets.find(x => x.id === id); p.levels[did] = typeof v === 'number' ? Math.max(0, Math.min(100, v)) : v; markDirty(); }
function capturePreset(id) {
  const p = S.config.presets.find(x => x.id === id);
  for (const d of controllable()) { if (d.domain === 'fan') p.levels[d.device_id] = (S.states[d.device_id] || {}).fan_speed || 'Off'; else if (level(d.device_id) != null) p.levels[d.device_id] = level(d.device_id); }
  markDirty(); render(); toast('Captured current levels');
}
function removePreset(id) {
  S.config.presets = S.config.presets.filter(x => x.id !== id);
  for (const b of S.config.bindings) b.actions = b.actions.filter(a => !(a.type === 'preset' && a.preset_id === id));
  markDirty(); render();
}

// ----- Settings -----
function settingsHTML() {
  const s = S.config.settings; const info = S.agent.info || {};
  const nd = devList().length; const np = picos().length;
  return `<h1>Setup</h1>
  <div class="card"><div class="row between"><div class="grow"><div class="name">In-home agent</div><div class="sub">${S.agent.online ? `online · bridge ${esc((info.bridge || {}).host || '')} · since ${esc(new Date(info.since).toLocaleTimeString())}` : 'offline'}</div></div><span class="dot ${S.agent.online ? 'on' : ''}"></span></div>
    <div class="sub" style="margin-top:8px">${nd} devices · ${np} Picos · ${Object.keys(S.inv.scenes || {}).length} Lutron scenes${S.inv.updated ? ' · inventory ' + esc(new Date(S.inv.updated).toLocaleString()) : ''}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm" onclick="refreshInv()" ${S.agent.online ? '' : 'disabled'}>Re-read bridge</button></div>
    <p class="small muted">Added or renamed something in the Lutron app? Re-read the bridge to pick it up.</p></div>
  <h2>Timing</h2>
  <div class="card">
    <label class="f"><span>Double-click window: <b id="dv">${s.double_ms}</b> ms</span><input type="range" min="150" max="1000" step="10" value="${s.double_ms}" oninput="$('#dv').textContent=this.value" onchange="setSetting('double_ms',+this.value)"></label>
    <label class="f"><span>Hold threshold: <b id="hv">${s.hold_ms}</b> ms</span><input type="range" min="250" max="2000" step="10" value="${s.hold_ms}" oninput="$('#hv').textContent=this.value" onchange="setSetting('hold_ms',+this.value)"></label>
    <div class="two"><label class="f"><span>Default "on" level (%)</span><input type="number" min="1" max="100" value="${s.group_on_level}" onchange="setSetting('group_on_level',+this.value)"></label>
    <label class="f"><span>Default fade (s)</span><input type="number" min="0" step="0.5" value="${s.default_fade}" onchange="setSetting('default_fade',+this.value)"></label></div>
    <p class="small muted">A single click on a button that also has a double-click binding waits the double window before firing. Buttons with no double binding fire instantly.</p>
  </div>
  <h2>Install on Android</h2>
  <div class="card small">
    <p>Quickest: open this URL in Chrome and choose <b>Add to Home screen</b>. It runs full-screen like an app.</p>
    <p>For a real APK: go to <a href="https://www.pwabuilder.com" target="_blank" rel="noopener">pwabuilder.com</a>, paste <code>${esc(location.origin)}</code>, and package for Android. Then set <code>ANDROID_PACKAGE_NAME</code> and <code>ANDROID_CERT_SHA256</code> on the Railway service so <code>/.well-known/assetlinks.json</code> verifies the app and the address bar disappears.</p>
  </div>
  <h2>Config</h2>
  <div class="card"><div class="row"><button class="btn sm" onclick="exportConfig()">Copy JSON</button><button class="btn sm" onclick="importConfig()">Paste JSON…</button></div></div>
  <div class="card"><button class="btn block danger" onclick="logout()">Sign out</button></div>`;
}
function setSetting(k, v) { S.config.settings[k] = v; markDirty(); }
async function refreshInv() { try { await api('/api/refresh', { method: 'POST' }); toast('Bridge re-read'); } catch (e) { toast(e.message, true); } }
function exportConfig() { navigator.clipboard.writeText(JSON.stringify(S.config, null, 2)).then(() => toast('Config copied')).catch(() => toast('Clipboard blocked', true)); }
function importConfig() { const t = prompt('Paste config JSON'); if (!t) return; try { S.config = JSON.parse(t); markDirty(); render(); } catch (_) { toast('Not valid JSON', true); } }
function logout() { S.token = ''; localStorage.removeItem('token'); if (S.ws) S.ws.close(); render(); }

// ---------- boot ----------
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view; location.hash = S.view; render(); window.scrollTo(0, 0); }));
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== S.view) { S.view = v; render(); } });
window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (S.token) connectWS();
render();
