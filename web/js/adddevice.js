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
function adRooms() { return Object.values(S.inv.areas || {}).filter(a => a && a.id && a.name).sort((a, b) => a.name.localeCompare(b.name)); }
function adPicked() { return adHeard().find(h => h.serial === AD.pick) || { serial: AD.pick }; }
function adLeft() { return Math.max(0, AD_SECONDS - Math.round((Date.now() - AD.startedAt) / 1000)); }
const adClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ----- the sheet -----
function openAddDevice() {
  Object.assign(AD, { open: true, step: 'listen', pick: null, name: '', area: null, error: null, showLog: false, created: null });
  adShow(true);
  adStart();
}
function adShow(full) {
  const subs = { listen: 'Without the Lutron app. Dimmers, switches, plug-ins, Pico remotes, shades and fan controls.', name: 'Give it a name and a room.', done: '' };
  const body = AD.step === 'listen' ? adListenHTML() : AD.step === 'name' ? adNameHTML() : adDoneHTML();
  const title = AD.step === 'name' ? 'Name it' : AD.step === 'done' ? 'Added' : 'Add a device';
  if (full || !sheet.isOpen() || !AD.open) {
    sheet.open(title, body, { sub: subs[AD.step], back: AD.step === 'name', onBack: () => { AD.step = 'listen'; AD.error = null; adShow(true); } });
    AD.open = true;
    sheet.onClose = () => { AD.open = false; clearInterval(AD.tick); AD.tick = null; if (adActive()) adStop(); };
  } else sheet.update(body);
  if (AD.step === 'listen' && !AD.tick) AD.tick = setInterval(adTick, 1000);
  if (AD.step !== 'listen' && AD.tick) { clearInterval(AD.tick); AD.tick = null; }
}
function adTick() {
  const el = document.querySelector('[data-ad-left]'); if (!el) return;
  el.textContent = adActive() ? `· ${adClock(adLeft())} left` : '';
}
function adListenHTML() {
  const kind = AD_KINDS.find(k => k[0] === AD.kind) || AD_KINDS[0];
  const chips = AD_KINDS.map(k => `<button class="chip ${k[0] === AD.kind ? 'sel' : ''}" data-act="ad-kind" data-k="${k[0]}">${k[1]}</button>`).join('');
  const active = adActive();
  const status = AD.busy ? 'Getting the bridge ready...' : active ? `Listening <span data-ad-left>· ${adClock(adLeft())} left</span>` : AD.error ? '' : 'Stopped listening';
  const heard = adHeard();
  const found = heard.length ? `<div class="h2">Found</div><div class="card pad0 list">${heard.map(h => `<button class="item" data-act="ad-pick" data-serial="${esc(h.serial)}">${ICON(adGlyph(h.device_type))}<div class="grow"><div class="t">${esc(adTypeName(h.device_type))}</div><div class="d">${h.model ? esc(h.model) + ' · ' : ''}serial ${esc(h.serial)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}</div>` : '';
  const err = AD.error ? `<div class="tip"><div class="grow"><span class="cap">Something went wrong</span><div class="t">${esc(AD.error)}</div><div class="d">Is the connector online and the bridge reachable?</div></div><button class="btn sm" data-act="ad-start">Try again</button></div>` : '';
  return `<div class="tip"><div class="grow"><span class="cap">Experimental</span><div class="t">Adding without the Lutron app</div><div class="d">This uses the same bridge connection the Lutron app uses, but that part of it is not documented. If the bridge says no, the Lutron app still works as before.</div></div></div>
    <div class="h2">What are you adding?</div><div class="chips scroll">${chips}</div>
    <div class="h2">Hold its button</div>
    <div class="tip"><div class="grow"><span class="cap">${active ? 'The bridge is listening' : 'Step 1'}</span><div class="t">${esc(kind[2])}</div><div class="d ad-status">${status}</div></div>${active || AD.busy ? '<div class="dots ad-dots"><i></i><i></i><i></i><i></i></div>' : `<button class="btn sm" data-act="ad-start">Listen again</button>`}</div>
    ${err}${found}
    <p class="small faint" style="margin:16px 0 0">Nothing found? Let go, wait a moment, and hold again. The bridge only hears a device that is not already part of a home; one that came from another home needs a factory reset first.</p>
    ${adLogHTML()}`;
}
function adNameHTML() {
  const h = adPicked(); const rooms = adRooms();
  return `<div class="card"><div class="row">${ICON(adGlyph(h.device_type), 'lg')}<div class="grow"><div class="t">${esc(adTypeName(h.device_type))}</div><div class="d">${h.model ? esc(h.model) + ' · ' : ''}serial ${esc(h.serial)}</div></div></div></div>
    <label class="field"><span>Name</span><input class="input" id="ad-name" value="${esc(AD.name)}" placeholder="${esc(adDefaultName(h.device_type))}" maxlength="60" autocomplete="off"></label>
    <div class="h2">Which room?</div><div class="chips" data-ad-rooms>${rooms.map(a => `<button class="chip ${AD.area === a.id ? 'sel' : ''}" data-act="ad-area" data-id="${esc(a.id)}">${esc(a.name)}</button>`).join('') || '<p class="muted">No rooms yet. Make one in the Lutron app first.</p>'}</div>
    <p class="small faint" style="margin:12px 0 0">Need a new room? For now rooms are still made in the Lutron app. Add the device to any room and move it later.</p>
    ${AD.error ? `<div class="tip" style="margin-top:16px"><div class="grow"><span class="cap">The bridge said no</span><div class="t">${esc(AD.error)}</div><div class="d">Try once more. If it keeps failing, the technical details below are what to send along.</div></div></div>` : ''}
    ${adLogHTML()}
    <div class="sfoot"><button class="btn primary lg block" data-act="ad-create" ${AD.area && !AD.busy ? '' : 'disabled'}>${AD.busy ? 'Adding...' : 'Add to my home'}</button></div>`;
}
function adDoneHTML() {
  const c = AD.created || {};
  return `<div class="ad-done">${ICON('check', 'xl tick')}<div class="t2">Added ${esc(c.name)}</div><p class="muted">It is in ${esc(c.room)} and shows up there in a moment. A dimmer or switch works right away; a remote is ready to set up on the Remotes tab.</p></div>
    <div class="sfoot"><button class="btn primary lg block" data-act="ad-again">Add another</button><button class="btn ghost block" data-act="sheet-close">Done</button></div>`;
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
  AD.busy = true; AD.error = null; AD.startedAt = Date.now(); adShow();
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
  AD.busy = true; AD.error = null; adShow();
  try {
    await api('/api/adddevice', { method: 'POST', body: JSON.stringify({ op: 'create', serial: AD.pick, name, area: AD.area }) });
    AD.created = { name, room }; AD.step = 'done'; AD.busy = false; adShow(true);
    toast(`${name} added to ${room}`);
  } catch (e) { AD.error = e.message; AD.busy = false; adShow(); }
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
    case 'ad-kind': AD.kind = d.k; adShow(); break;
    case 'ad-start': adStart(); break;
    case 'ad-pick': { AD.pick = d.serial; AD.name = ''; AD.error = null; const rooms = adRooms(); AD.area = rooms.length === 1 ? rooms[0].id : AD.area; AD.step = 'name'; adShow(true); break; }
    case 'ad-area': AD.area = d.id; document.querySelectorAll('[data-ad-rooms] .chip').forEach(c => c.classList.toggle('sel', c.dataset.id === d.id)); { const b = document.querySelector('[data-act="ad-create"]'); if (b) b.disabled = !AD.area || AD.busy; } break;
    case 'ad-create': adCreate(); break;
    case 'ad-again': Object.assign(AD, { step: 'listen', pick: null, name: '', error: null, created: null }); adShow(true); adStart(); break;
    case 'ad-log': AD.showLog = !AD.showLog; adShow(); break;
  }
});
document.addEventListener('input', e => { if (e.target.id === 'ad-name') AD.name = e.target.value; });
