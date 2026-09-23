// 20 · Add a Lutron device (12744:112136). The bridge listens while the person holds the button on the new device;
// what it hears slides up in a card with a name and a room, and one tap makes it. Experimental: this part of the
// bridge is undocumented, so every exchange with it is kept and "See what the bridge said" shows it.
//
// #add. Listening starts when the page opens and stops when it is left. The state the bridge reports arrives as
// add_state, add_heard and add_log messages (app.js keeps them in S.add).
export const noTabs = true;
const SECONDS = 180;
const KINDS = [
  ['Dimmer or switch', 'Press and hold the Off button (the bottom one) for about 10 seconds, until its light flashes.'],
  ['Plug-in module', 'Press and hold the Off button on the module for about 10 seconds, until its light flashes.'],
  ['Pico remote', 'Press and hold the Off button for about 10 seconds, until the light at its top flashes.'],
  ['Shade', 'Press and hold the button on the shade for about 6 seconds, until it moves a little.'],
  ['Fan control', 'Press and hold the Off button for about 10 seconds, until its light flashes.'],
];
const art = t => (/Pico/.test(t || '') ? 'lutron-lamps' : /Shade|Blind|Drape/.test(t || '') ? 'lutron-rollershades' : 'lutron-dimmer');
const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const st = c => (c.ui.ad || (c.ui.ad = { startedAt: 0, busy: false, error: null, pick: null, name: '', room: null, created: null, log: false }));
const heard = c => ((c.S.add && c.S.add.heard) || []);
const active = c => !!(c.S.add && c.S.add.active);

export function view(c) {
  const { esc, icon, EDIT } = c;
  const a = st(c);
  const list = heard(c);
  const pick = a.pick ? list.find(h => h.serial === a.pick) || { serial: a.pick } : (list.length === 1 ? list[0] : null);
  const step = a.created ? 3 : pick ? 2 : 1;
  const steps = [['Listening', 1], ['Name it', 2], ['Pick a room', 3]].map(([t, n]) => `<span class="as ${step >= n ? 'on' : ''}"><i>${n}</i>${t}</span>`).join('<i class="as-ln"></i>');
  const left = Math.max(0, SECONDS - Math.round((Date.now() - a.startedAt) / 1000));
  const status = a.busy ? 'Getting the bridge ready…' : active(c) ? 'Listening…' : a.error ? 'The bridge said no' : a.created ? 'Added' : 'Not listening';
  const waited = a.startedAt && Date.now() - a.startedAt > 45000;
  const say = a.error ? esc(a.error)
    : active(c) ? `Press and hold the small button on your new device for 10 seconds.${waited && !list.length ? ' Nothing yet? Let go, wait a moment, and hold again. A device from another home needs a factory reset first.' : ''}`
      : 'Tap Listen, then hold the small button on your new device for 10 seconds.';
  const log = ((c.S.add && c.S.add.log) || []).slice(-40).map(e => JSON.stringify(e)).join('\n');
  // the card that slides up: one device heard, or a choice of several, or the one just made
  let card = '';
  if (a.created) {
    card = `<div class="ad-card done" data-enter="sheet"><span class="grab"></span><span class="ic-c">${icon('check', 24, 2)}</span><p class="t">Added ${esc(a.created.name)}</p>
      <p class="t-cap muted">It is in ${esc(a.created.room)} and shows up there in a moment.${a.created.where ? ` Your Lutron bridge keeps it under ${esc(a.created.where)}; this app has it in ${esc(a.created.room)}, which is the one that counts here.` : ''} A dimmer or switch works right away; a remote is ready to set up on the Remotes tab.</p>
      <div class="sheet-btns"><button class="pill solid" data-act="ad-again">Add another</button><button class="pill ghost" data-go="${a.created.room_id ? `room/${esc(a.created.room_id)}` : 'home'}">Done</button></div></div>`;
  } else if (!pick && list.length > 1) {
    card = `<div class="ad-card" data-enter="sheet"><span class="grab"></span><p class="t">Heard ${list.length} devices</p><div class="group">${list.map(h => `<button class="row" data-act="ad-pick" data-serial="${esc(h.serial)}"><span class="row-txt"><span class="t">${esc(EDIT.addTypeName(h.device_type))}</span><span class="d">${h.model ? esc(h.model) + ' · ' : ''}serial ${esc(h.serial)}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`).join('')}</div></div>`;
  } else if (pick) {
    const rooms = EDIT.addRooms();
    const room = a.room || (rooms.length === 1 ? rooms[0].id : null);
    const home = room ? EDIT.lutronHomeFor(room) : null;
    card = `<div class="ad-card" data-enter="sheet"><span class="grab"></span>
      <span class="illo"><img src="${c.artSrc(art(pick.device_type))}" alt=""></span>
      <p class="t hd">Heard: ${esc(EDIT.addTypeName(pick.device_type))}</p><p class="t-cap muted sub">Caséta · ${pick.model ? esc(pick.model) : 'just now'}</p>
      <label class="ad-field" data-enter data-enter-at="200"><span>Name</span><input data-input="ad-name" value="${esc(a.name)}" placeholder="${esc(EDIT.addDefaultName(pick.device_type))}" maxlength="60" autocomplete="off"></label>
      <div class="chip-row ad-rooms" data-keep="adrooms">${rooms.map((r, i) => `<button class="chip" aria-pressed="${room === r.id}" data-act="ad-room" data-id="${esc(r.id)}" data-enter data-enter-at="280" data-enter-i="${i}">${esc(r.name)}</button>`).join('')}<button class="chip lead" data-act="ad-newroom" data-enter data-enter-at="280" data-enter-i="${rooms.length}">${icon('plus', 16, 1.4)}New room</button></div>
      ${home && !home.own ? `<p class="t-cap muted ad-note">Your Lutron bridge has no ${esc(c.data.areaName(room))} of its own, so it keeps the device under ${esc(home.name)}. This app files it in ${esc(c.data.areaName(room))}, where every button, scene and routine will find it.</p>` : ''}
      <button class="next-btn" data-act="ad-create" ${room && !a.busy ? '' : 'disabled'}>${a.busy ? 'Adding…' : room ? 'Add to my home' : 'Pick a room'}</button></div>`;
  }
  return `<div class="add-page ${card ? 'has-card' : ''}">
    <header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">Add a device</h1>
    <p class="t-cap muted ad-sub">Caséta · experimental</p>
    <div class="ad-steps">${steps}</div>
    <div class="radar ${active(c) && !pick ? 'on' : ''}"><i class="g"></i><i class="r1"></i><i class="r2"></i><i class="p p1"></i><i class="p p2"></i><i class="p p3"></i><i class="r3"></i>${pick && !a.created ? '<i class="ping" data-enter="ping"></i>' : ''}<img data-xf="standard" src="${c.artSrc(pick ? art(pick.device_type) : 'lutron-wireless')}" alt=""></div>
    <p class="ad-status">${esc(status)}${active(c) ? ` <span class="left">${clock(left)}</span>` : ''}</p>
    <p class="ad-say">${say}</p>
    <div class="ad-btns">${active(c) || a.busy ? '<button class="pill ghost" data-act="ad-stop">Stop listening</button>' : `<button class="pill blue" data-act="ad-start">${a.error ? 'Try again' : 'Listen'}</button>`}</div>
    <p class="ad-links"><button class="link" data-act="ad-log">${a.log ? 'Hide' : 'See'} what the bridge said</button> · <button class="link" data-act="ad-which">Which button?</button></p>
    ${a.log ? `<pre class="ad-log">${esc(log || 'Nothing yet.')}</pre>` : ''}
    ${card}
  </div>`;
}

// Listening starts as the page opens, and the clock on it ticks while it listens.
let tick = null;
export function after(c) {
  const a = st(c);
  if (!a.startedAt && !a.busy && !a.error && !a.created && !active(c)) start(c);
  clearInterval(tick);
  tick = setInterval(() => { if (!location.hash.startsWith('#add')) { clearInterval(tick); return; } const el = document.querySelector('.ad-status .left'); if (el && active(c)) el.textContent = clock(Math.max(0, SECONDS - Math.round((Date.now() - a.startedAt) / 1000))); }, 1000);
}
// Leaving the page stops the bridge listening.
export function leave(c) { clearInterval(tick); if (active(c)) stop(c); c.ui.ad = null; }

function take(c, r) { const s = (r && r.detail) || r; if (s && typeof s.active === 'boolean') c.S.add = { ...(c.S.add || { heard: [], log: [] }), ...s }; }
async function start(c) {
  const a = st(c); if (a.busy) return;
  Object.assign(a, { busy: true, error: null, startedAt: Date.now(), pick: null, created: null });
  c.render();
  try { take(c, await c.data.api('/api/adddevice', { method: 'POST', body: JSON.stringify({ op: 'start' }) })); }
  catch (e) { a.error = e.message; }
  a.busy = false; c.render();
}
async function stop(c) { try { take(c, await c.data.api('/api/adddevice', { method: 'POST', body: JSON.stringify({ op: 'stop' }) })); } catch (_) { /* it times out on its own */ } c.render(); }

export const actions = {
  'ad-start'(c) { start(c); },
  'ad-stop'(c) { stop(c); },
  'ad-log'(c) { const a = st(c); a.log = !a.log; c.render(); },
  'ad-which'(c) {
    c.openSheet({ over: 'Add a device', title: 'Which button?', key: 'ad-which', onClose: () => c.render(),
      body: `<div class="group">${KINDS.map(([t, d]) => `<div class="row sub"><span class="row-txt"><span class="t">${t}</span><span class="d">${d}</span></span></div>`).join('')}</div>
        <p class="t-cap muted sheet-p">The bridge only hears a device that is not already part of a home.</p>` });
  },
  'ad-pick'(c, el) { const a = st(c); a.pick = el.dataset.serial; a.name = ''; c.render(); },
  'ad-name'(c, el, r, v) { st(c).name = v; },
  'ad-room'(c, el) { st(c).room = el.dataset.id; c.render(); },
  'ad-newroom'(c) {
    const room = c.EDIT.createRoom('');
    st(c).room = room.id;
    c.save(`${room.name} added. Rename it from its page.`);
  },
  'ad-again'(c) { c.ui.ad = null; c.S.add = { ...(c.S.add || {}), heard: [] }; start(c); },
  async 'ad-create'(c) {
    const a = st(c);
    const list = heard(c);
    const pick = a.pick ? list.find(h => h.serial === a.pick) || { serial: a.pick } : list[0];
    const rooms = c.EDIT.addRooms();
    const room = a.room || (rooms.length === 1 ? rooms[0].id : null);
    if (!pick || !room || a.busy) return;
    const name = (a.name || '').trim() || c.EDIT.addDefaultName(pick.device_type);
    const home = c.EDIT.lutronHomeFor(room);
    if (!home) { a.error = 'Your Lutron bridge is not listing any rooms yet, so it has nowhere to put a new device. Look for new lights in Settings and try again.'; c.render(); return; }
    a.busy = true; a.error = null; c.render();
    try {
      const r = await c.data.api('/api/adddevice', { method: 'POST', body: JSON.stringify({ op: 'create', serial: pick.serial, name, area: home.id }) });
      const made = r && r.detail && r.detail.device_id;
      // file it where it was put, now and again once the bridge has listed it
      const file = () => { if (c.EDIT.fileNewDevice(made, pick.serial, room)) c.save('', { quiet: true }); };
      file(); setTimeout(file, 3000); setTimeout(file, 9000);
      a.created = { name, room: c.data.areaName(room), room_id: room, where: home.own ? null : home.name };
      a.busy = false; c.render();
    } catch (e) { a.busy = false; a.error = e.message; c.render(); }
  },
};
