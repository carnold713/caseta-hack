/* Add a device to the bridge without the Lutron app (experimental).
   Settings › Your home › "Add a device" opens a sheet: the bridge listens, the person holds the
   new device's button, whatever the bridge hears is listed, then a name and a room create it.
   The connector logs every exchange with the bridge; "Show technical details" shows that log so
   it can be sent along if a bridge answers differently than expected. State arrives over the
   WebSocket as add_state, add_heard and add_log (core.js hands them to AddDevice.onMessage). */
'use strict';

const AD_KINDS = [
  ['dimmer', 'Dimmer or switch', 'Press and hold the Off button (the bottom one) on the dimmer or switch for about 10 seconds, until its light flashes.'],
  ['plug', 'Plug-in module', 'Press and hold the Off button on the plug-in module for about 10 seconds, until its light flashes.'],
  ['pico', 'Pico remote', 'Press and hold the Off button on the remote for about 10 seconds, until the light at its top flashes.'],
  ['shade', 'Shade', 'Press and hold the button on the shade for about 6 seconds, until it moves a little.'],
  ['fan', 'Fan control', 'Press and hold the Off button on the fan control for about 10 seconds, until its light flashes.'],
];
const AD_SECONDS = 180;
const AD = { open: false, kind: 'dimmer', step: 'listen', pick: null, name: '', area: null, error: null, showLog: false, startedAt: 0, busy: false, created: null, tick: null };

const adHeard = () => (S.add && S.add.heard) || [];
const adActive = () => !!(S.add && S.add.active);
function adTypeName(t) {
  if (!t) return 'Device';
  if (MODEL_NAMES[t]) return `Pico ${MODEL_NAMES[t]}`;
  if (/Shade|Blind|Drape|Tilt/.test(t)) return 'Shade';
  if (/Fan/.test(t)) return 'Fan control';
  if (/PlugIn.*Dimmer/.test(t)) return 'Plug-in dimmer';
  if (/PlugIn.*Switch/.test(t)) return 'Plug-in switch';
  if (/Dimmer|Dimmed|Tune/.test(t)) return 'Dimmer';
  if (/Switch/.test(t)) return 'Switch';
  return t;
}
function adGlyph(t) {
  if (!t) return 'bulb';
  if (MODEL_NAMES[t]) return 'remote';
  if (/Shade|Blind|Drape|Tilt/.test(t)) return 'shade';
  if (/Fan/.test(t)) return 'fan';
  if (/Switch/.test(t)) return 'plug';
  return 'bulb';
}
function adDefaultName(t) { const n = adTypeName(t); return /^Pico/.test(n) ? 'New remote' : `New ${n.toLowerCase()}`; }
// Which room the new device goes in: every room the app has, once the app owns its rooms (js/rooms.js). A room
// with no Lutron area of its own is still offered: the bridge needs one of its own areas to create a device in,
// so a sensible one is used and the device is filed in the room the person actually chose (adLutronNote below).
function adRooms() {
  if (typeof ensureRooms === 'function') ensureRooms();
  if (typeof appRooms === 'function' && appRooms().length) return [...appRooms()].map(r => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
  return Object.values(S.inv.areas || {}).filter(a => a && a.id && a.name && !String(a.id).startsWith('hue_')).sort((a, b) => a.name.localeCompare(b.name));
}
// The Lutron area the bridge will be asked for, and whether it is this room's own.
function adLutronHome() { return typeof lutronHomeFor === 'function' ? lutronHomeFor(AD.area) : (AD.area ? { id: AD.area, name: areaName(AD.area), own: true } : null); }
// One line, only when the bridge cannot file it where the person asked.
function adLutronNote() {
  const home = adLutronHome();
  if (!AD.area || !home || home.own) return '';
  return `<p class="small faint" style="margin:12px 0 0">Your Lutron bridge has no room called ${esc(areaName(AD.area))}, so the device is created in its ${esc(home.name)} and filed in ${esc(areaName(AD.area))} here. That is where it lives in this app, and where every button, scene and automation will find it.</p>`;
}
function adPicked() { return adHeard().find(h => h.serial === AD.pick) || { serial: AD.pick }; }
function adLeft() { return Math.max(0, AD_SECONDS - Math.round((Date.now() - AD.startedAt) / 1000)); }
const adClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ----- the walk (docs/ux-progressive.md 2.19): what are you adding, hold its button, name it, added -----
const AD_STEPS = ['kind', 'listen', 'name', 'done'];
const AD_GLYPH = { dimmer: 'bulb', plug: 'plug', pico: 'remote', shade: 'shade', fan: 'fan' };
function openAddDevice() {
  Object.assign(AD, { open: true, step: 'kind', pick: null, name: '', area: null, error: null, showLog: false, created: null, startedAt: 0, nudged: false });
  walk({ key: 'add', title: 'Add a device', sub: 'Without the Lutron app. This part of the bridge is undocumented, so if it says no, the Lutron app still works as before.', state: AD,
    onClose: () => { AD.open = false; clearInterval(AD.tick); AD.tick = null; if (adActive()) adStop(); },
    steps: [
      { id: 'kind', kind: 'pick', title: 'What are you adding?', body: () => { adAt('kind'); return `<div class="card pad0 list">${AD_KINDS.map(k => `<button class="item pick" data-act="ad-kind" data-k="${k[0]}">${ICON(AD_GLYPH[k[0]])}<div class="grow"><div class="t">${k[1]}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}</div>`; } },
      { id: 'listen', kind: 'custom', noNext: true, title: 'Hold its button', body: () => { adAt('listen'); return adListenHTML(); } },
      { id: 'name', kind: 'custom', title: 'Name it', sub: 'Give it a name and a room.', body: () => { adAt('name'); return adNameHTML(); }, foot: () => `<div class="sfoot"><button class="btn primary lg block" data-act="ad-create" ${AD.area && !AD.busy ? '' : 'disabled'}>${AD.busy ? 'Adding...' : 'Add to my home'}</button></div>` },
      { id: 'done', kind: 'custom', title: 'Added', body: () => { adAt('done'); return adDoneHTML(); }, foot: () => `<div class="sfoot"><button class="btn primary lg block" data-act="ad-again">Add another</button><button class="btn ghost block" data-act="sheet-close">Done</button></div>` },
    ] });
  AD.open = true;
}
// The step being drawn: the listening clock runs only on the listen step.
function adAt(step) {
  AD.step = step;
  if (step === 'listen' && !AD.tick) AD.tick = setInterval(adTick, 1000);
  if (step !== 'listen' && AD.tick) { clearInterval(AD.tick); AD.tick = null; }
}
function adGo(step) { AD.step = step; const w = WALK.cur; if (walkIs('add')) { w.i = AD_STEPS.indexOf(step); walkRender(w); } }
// Redraw the current step in place (the bridge said something, the clock ran out).
function adShow() { if (AD.open && walkIs('add')) walkRender(WALK.cur); }
function adTick() {
  const el = document.querySelector('[data-ad-left]'); if (el) el.textContent = adActive() ? `· ${adClock(adLeft())} left` : '';
  // after 45 seconds with nothing heard, the "Nothing found?" advice appears
  if (!AD.nudged && AD.startedAt && Date.now() - AD.startedAt >= 45000 && !adHeard().length) { AD.nudged = true; adShow(); }
}
function adListenHTML() {
  const kind = AD_KINDS.find(k => k[0] === AD.kind) || AD_KINDS[0];
  const active = adActive();
  const status = AD.busy ? 'Getting the bridge ready...' : active ? `Listening <span data-ad-left>· ${adClock(adLeft())} left</span>` : AD.error ? '' : 'Stopped listening';
  const heard = adHeard();
  const found = heard.length ? `<div class="h2">Found</div><div class="card pad0 list">${heard.map(h => `<button class="item" data-act="ad-pick" data-serial="${esc(h.serial)}">${ICON(adGlyph(h.device_type))}<div class="grow"><div class="t">${esc(adTypeName(h.device_type))}</div><div class="d">${h.model ? esc(h.model) + ' · ' : ''}serial ${esc(h.serial)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}</div>` : '';
  const err = AD.error ? `<div class="tip" style="margin-top:8px"><div class="grow"><span class="cap">Something went wrong</span><div class="t">${esc(AD.error)}</div><div class="d">Is the connector online and the bridge reachable?</div></div><button class="btn sm" data-act="ad-start">Try again</button></div>` : '';
  const waited = AD.startedAt && Date.now() - AD.startedAt >= 45000;
  const nothing = !heard.length && !AD.busy && !AD.error && (waited || !active) ? `<p class="d" style="margin:16px 0 0">Nothing found? Let go, wait a moment, and hold again. The bridge only hears a device that is not already part of a home; one that came from another home needs a factory reset first.</p>${active ? '' : `<button class="btn block" data-act="ad-start" style="margin-top:12px">Listen again</button>`}` : '';
  return `<div class="tip"><div class="grow"><span class="cap">${active ? 'The bridge is listening' : kind[1]}</span><div class="t">${esc(kind[2])}</div><div class="d ad-status">${status}</div></div>${active || AD.busy ? '<div class="dots ad-dots"><i></i><i></i><i></i><i></i></div>' : ''}</div>
    ${err}${found}${nothing}${AD.error ? adLogHTML() : ''}`;
}
function adNameHTML() {
  const h = adPicked(); const rooms = adRooms();
  return `<div class="card"><div class="row">${ICON(adGlyph(h.device_type), 'lg')}<div class="grow"><div class="t">${esc(adTypeName(h.device_type))}</div><div class="d">${h.model ? esc(h.model) + ' · ' : ''}serial ${esc(h.serial)}</div></div></div></div>
    <label class="field"><span>Name</span><input class="input" id="ad-name" value="${esc(AD.name)}" placeholder="${esc(adDefaultName(h.device_type))}" maxlength="60" autocomplete="off"></label>
    <div class="h2">Which room?</div><div class="chips" data-ad-rooms>${rooms.map(a => `<button class="chip ${AD.area === a.id ? 'sel' : ''}" data-act="ad-area" data-id="${esc(a.id)}">${esc(a.name)}</button>`).join('') || '<p class="muted">No rooms yet. Make one under Settings, Rooms.</p>'}</div>
    ${adLutronNote()}
    <p class="small faint" style="margin:12px 0 0">Need a new room? Make one under Settings, Rooms, and it appears here. Rooms belong to this app now, Philips Hue rooms included.</p>
    ${AD.error ? `<div class="tip" style="margin-top:16px"><div class="grow"><span class="cap">The bridge said no</span><div class="t">${esc(AD.error)}</div><div class="d">Try once more. If it keeps failing, the technical details below are what to send along.</div></div></div>${adLogHTML()}` : ''}`;
}
function adDoneHTML() {
  const c = AD.created || {};
  return `<div class="ad-done">${ICON('check', 'xl tick')}<div class="t2">Added ${esc(c.name)}</div><p class="muted">It is in ${esc(c.room)} and shows up there in a moment.${c.where ? ` Your Lutron bridge has it under ${esc(c.where)}; this app has it in ${esc(c.room)}, which is the one that counts here.` : ''} A dimmer or switch works right away; a remote is ready to set up on the Remotes tab.</p></div>`;
}
function adLogHTML() {
  const log = (S.add && S.add.log) || [];
  const lines = log.slice(-40).map(e => JSON.stringify(e)).join('\n');
  return `<button class="btn ghost block" data-act="ad-log" style="margin-top:12px">${AD.showLog ? 'Hide' : 'Show'} technical details</button>${AD.showLog ? `<div class="card" style="margin-top:8px"><pre class="ad-log">${esc(lines || 'Nothing yet.')}</pre><button class="btn sm" data-act="copy" data-text="${esc(lines)}">${ICON('copy', 'sm')} Copy</button></div>` : ''}`;
}

// ----- talking to the hub -----
function adTakeState(r) { const st = (r && r.detail) || r; if (st && typeof st.active === 'boolean') S.add = { ...(S.add || {}), ...st }; }
async function adStart() {
  if (AD.busy) return;
  AD.busy = true; AD.error = null; AD.startedAt = Date.now(); AD.nudged = false; adShow();
  try { adTakeState(await api('/api/adddevice', { method: 'POST', body: JSON.stringify({ op: 'start' }) })); }
  catch (e) { AD.error = e.message; }
  AD.busy = false; if (AD.open) adShow();
}
async function adStop() { try { adTakeState(await api('/api/adddevice', { method: 'POST', body: JSON.stringify({ op: 'stop' }) })); } catch (_) { /* the session times out on its own */ } }
async function adCreate() {
  if (AD.busy || !AD.area || !AD.pick) return;
  const input = document.getElementById('ad-name'); const h = adPicked();
  const name = ((input && input.value) || '').trim() || adDefaultName(h.device_type);
  const room = (adRooms().find(a => a.id === AD.area) || {}).name || 'its room';
  // The bridge can only create a device in one of its own areas. The app room the person picked is what the app
  // remembers; the bridge area is only where the bridge files it.
  const home = adLutronHome();
  if (!home) { AD.error = 'Your Lutron bridge is not listing any rooms yet, so it has nowhere to put a new device. Tap "Look for new lights" and try again.'; adShow(); return; }
  AD.busy = true; AD.error = null; adShow();
  try {
    const r = await api('/api/adddevice', { method: 'POST', body: JSON.stringify({ op: 'create', serial: AD.pick, name, area: home.id }) });
    // Added again after being removed: it must not stay hidden. The connector names the device it made when
    // it can; otherwise anything on the bridge with this serial is welcomed back.
    const made = r && r.detail && r.detail.device_id;
    const welcomeBack = () => {
      const before = (S.config.settings.hidden_devices || []).length;
      if (made) unhideDevice(made);
      for (const dv of Object.values(S.inv.devices || {})) if (String(dv.serial || '') === String(AD.pick)) unhideDevice(dv.device_id);
      if ((S.config.settings.hidden_devices || []).length !== before) save({ quiet: true, render: true });
    };
    welcomeBack(); setTimeout(welcomeBack, 3000); setTimeout(welcomeBack, 9000);
    // File it in the app room the person chose, whatever area the bridge used.
    const fileIt = async () => {
      if (typeof appRooms !== 'function' || !appRooms().length) return;
      const target = appRooms().find(x => x.id === AD.area); if (!target) return;
      const id = made || Object.values(S.inv.devices || {}).find(dv => String(dv.serial || '') === String(AD.pick));
      const did = typeof id === 'string' ? id : id && id.device_id;
      if (!did || (target.device_ids || []).includes(did)) return;
      for (const x of appRooms()) x.device_ids = (x.device_ids || []).filter(y => y !== did);
      target.device_ids = [...(target.device_ids || []), did];
      await save({ quiet: true, render: true });
    };
    fileIt(); setTimeout(fileIt, 3000); setTimeout(fileIt, 9000);
    AD.created = { name, room, where: home.own ? null : home.name }; AD.busy = false; adGo('done');
  } catch (e) { AD.error = e.message; AD.busy = false; adShow(); }
}

// ----- removing a device (the same experimental path, one request) -----
function openRemoveDevice(id) {
  const d = dev(id); if (!d) return;
  const isPico = d.domain === 'pico';
  const uses = bindings().filter(b => isPico ? b.device_id === id : [...b.actions, ...((b.night && b.night.actions) || [])].some(a => tlist(a.target).includes('d:' + id))).length;
  sheet.open(`Remove ${esc(d.name)}?`, `<div class="tip"><div class="grow"><span class="cap">${esc(devAreaName(d))}</span><div class="t">It leaves your Lutron bridge</div><div class="d">It stops working until it is added again${isPico ? ', and its button settings here are cleared' : uses ? `, and the ${plural(uses, 'button')} that used it forget it` : ''}. The Lutron app will not list it any more either.</div></div></div>
    ${AD.showLog ? `<p class="d" style="margin:12px 0 0">This part of the bridge is not documented either; if it keeps saying no, the Lutron app can still remove it.</p>${adLogHTML()}` : ''}
    <div class="sfoot"><button class="btn danger lg block" data-act="dev-remove-go" data-id="${esc(id)}">Remove</button><button class="btn ghost block" data-act="sheet-close">Keep it</button></div>`, { detent: 'compact', sub: `${esc(devAreaName(d))} · ${isPico ? 'remote' : d.domain}` });
}
function forgetDevice(id) {
  const t = 'd:' + id; const cfg = S.config;
  cfg.bindings = bindings().filter(b => b.device_id !== id);
  for (const b of cfg.bindings) { const strip = list => list.map(a => { if (!a.target) return a; const rest = tlist(a.target).filter(x => x !== t); return rest.length === tlist(a.target).length ? a : (rest.length ? { ...a, target: packTarget(rest) } : null); }).filter(Boolean); b.actions = strip(b.actions); if (b.night) b.night.actions = strip(b.night.actions); }
  cfg.bindings = cfg.bindings.filter(b => b.actions.length || (b.night && b.night.actions.length));
  for (const sc of cfg.schedules || []) sc.actions = sc.actions.map(a => { if (!a.target) return a; const rest = tlist(a.target).filter(x => x !== t); return rest.length ? { ...a, target: packTarget(rest) } : null; }).filter(Boolean);
  cfg.schedules = (cfg.schedules || []).filter(sc => sc.actions.length);
  for (const p of cfg.presets) delete p.levels[id];
  for (const g of cfg.groups) g.device_ids = g.device_ids.filter(x => x !== id);
  cfg.favorites = cfg.favorites.filter(f => f !== t);
  if (cfg.settings.light_kinds) delete cfg.settings.light_kinds[id];
  if (cfg.settings.roles) delete cfg.settings.roles[id];
  if (cfg.settings.remote_looks) delete cfg.settings.remote_looks[id];
  for (const r of cfg.settings.rooms || []) r.device_ids = (r.device_ids || []).filter(x => x !== id);
}
// Some bridges keep a deleted device in their own list, and the next refresh would put it back on the
// Remotes page. So a device that reappears shortly after a removal is hidden here for good.
function hideDevice(id) {
  const s = S.config.settings; const list = s.hidden_devices || (s.hidden_devices = []);
  if (!list.includes(id)) list.push(id);
}
function unhideDevice(id) {
  const s = S.config.settings; if (!s.hidden_devices) return;
  s.hidden_devices = s.hidden_devices.filter(x => x !== id);
}
async function removeDevice(id, btn) {
  const d = dev(id); if (!d) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Removing...'; }
  try {
    const r = await api('/api/removedevice', { method: 'POST', body: JSON.stringify({ id }) });
    // Everything this device was part of, kept so Undo can put it back and so adding the same one again
    // brings its buttons back with it. Removing a remote used to throw its settings away for good.
    const before = JSON.stringify(S.config);
    forgetDevice(id);
    delete S.inv.devices[id];
    if (S.remote === id) S.remote = null;
    sheet.close();
    const stillThere = !!(r && r.detail && r.detail.still_listed);
    if (stillThere) hideDevice(id);
    await save({ msg: `${d.name} removed`, quiet: true, render: true });
    toast(`${d.name} removed from your home`, { undo: async () => { S.config = JSON.parse(before); unhideDevice(id); await save({ msg: 'Put back' }); render(); } });
    // Older connectors do not say whether the bridge let go of it: watch for it coming back.
    if (!stillThere) setTimeout(() => { if (dev(id)) { hideDevice(id); save({ quiet: true, render: true }); } }, 4000);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Remove'; }
    toast(`The bridge said no: ${e.message}`, { err: true });
    AD.showLog = true; openRemoveDevice(id);  // the same sheet again, with the technical details open
  }
}

window.AddDevice = {
  onMessage(m) {
    S.add = S.add || { active: false, heard: [], log: [] };
    if (m.type === 'add_state') { S.add = { ...S.add, ...(m.state || {}) }; if (m.reason === 'timeout' && AD.open && AD.step === 'listen') { adShow(); toast('The bridge stopped listening. Tap Listen again when the device is ready.'); } else if (AD.open && AD.step === 'listen' && !AD.busy) adShow(); }
    else if (m.type === 'add_heard') { S.add.heard = m.heard || S.add.heard; if (AD.open && AD.step === 'listen' && !AD.busy) { adShow(); if (navigator.vibrate) navigator.vibrate(20); } }
    else if (m.type === 'add_log') { S.add.log = [...(S.add.log || []), m.entry].slice(-60); if (AD.open && AD.showLog) adShow(); }
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'ad-open': openAddDevice(); break;
    case 'ad-kind': AD.kind = d.k; adGo('listen'); adStart(); break;   // listening starts once it knows what to listen for
    case 'ad-start': adStart(); break;
    case 'ad-pick': { AD.pick = d.serial; AD.name = ''; AD.error = null; const rooms = adRooms(); AD.area = rooms.length === 1 ? rooms[0].id : AD.area; adGo('name'); break; }
    // the room decides whether the "which Lutron room will be used" line is needed, so the step is drawn again
    case 'ad-area': AD.area = d.id; adShow(); break;
    case 'ad-create': adCreate(); break;
    case 'ad-again': Object.assign(AD, { pick: null, name: '', error: null, created: null }); adGo('listen'); adStart(); break;
    case 'ad-log': AD.showLog = !AD.showLog; if (AD.open) adShow(); else { const cur = el.closest('.sb'); if (cur && cur.querySelector('[data-act="dev-remove-go"]')) openRemoveDevice(cur.querySelector('[data-act="dev-remove-go"]').dataset.id); } break;
    case 'dev-remove': AD.showLog = false; openRemoveDevice(d.id); break;
    case 'dev-remove-go': removeDevice(d.id, el); break;
  }
});
document.addEventListener('input', e => { if (e.target.id === 'ad-name') AD.name = e.target.value; });
