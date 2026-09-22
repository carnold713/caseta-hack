/* Rooms the app owns (docs/ia-v5.md 3, docs/ux-progressive.md 7.5).
   `settings.rooms` is the app's own list of rooms. Everywhere a room appears in the app reads it through
   core.js (`areas`, `areaName`, `devArea`), so this page is the one place a room is made, renamed, emptied or
   thrown away, and the one place a light or a remote moves from one room to another. Lutron and Hue together.

   The list is seeded from the bridges the first time it is needed, keeping each bridge room's own id, so every
   scene, remote button and automation that already names a room keeps working untouched.

   The bridges are kept in step where they let us: the Hue bridge documents rooms and does as it is told; the
   Lutron bridge does not document them and may simply say no. A refusal never loses the person's work: the room
   lives in the app either way, and the copy says which is which. */
'use strict';

// Level two is page state, not a route, the way "More settings" is: #rooms is the page, S.roomsEdit the room.
function goRooms(roomId = null, back = null) {
  ensureRooms();
  S.roomsEdit = roomId || null;
  if (back) S.roomsBack = back;
  else if (S.view !== 'rooms') S.roomsBack = { view: S.view, room: S.room, roomPage: S.roomPage };
  S.view = 'rooms'; S.room = null; S.roomPage = null;
  location.hash = 'rooms';
  render(); window.scrollTo(0, 0);
}
function roomsLeave() {
  const b = S.roomsBack || { view: 'settings' };
  S.roomsBack = null; S.roomsEdit = null;
  S.view = b.view || 'settings'; S.room = b.room || null; S.roomPage = b.roomPage || null;
  location.hash = S.view === 'room' && typeof roomHash === 'function' ? roomHash() : S.view;
  render(); window.scrollTo(0, 0);
}

VIEWS.rooms = {
  tab: 'settings',
  nested() { return true; },
  top() {
    const r = roomById(S.roomsEdit);
    if (r) return nestedTop('rooms-one-back', esc(r.name), esc(roomSummary(r.id)));
    return nestedTop('rooms-back', 'Rooms', `${plural(appRooms().length, 'room')}`);
  },
  body() {
    // a cold load straight onto #rooms: seed after this paint, never during it
    if (!appRooms().length && Object.keys(S.inv.areas || {}).length) setTimeout(() => { if (ensureRooms()) render(); }, 0);
    const r = roomById(S.roomsEdit);
    return r ? roomEditHTML(r) : roomsListHTML();
  },
};

// The rules are the data layer's (web/data/home.js); the names stay here for every caller.
const roomById = HOME.roomById;
// A short "· Hue" / "· Nanoleaf" suffix for a device row, or nothing for a plain Lutron device.
const bridgeTag = HOME.bridgeTag;
// Every device the app can file in a room: the lights, switches, fans, shades and the remotes.
const fileable = () => HOME.fileable();
const pruneRooms = HOME.pruneRooms;

// ----- seeding: the bridges' rooms become the app's, ids and all, once ever per home -----
// The layer changes the config and says so; saving it is this UI's job, quietly, the way it always was.
function ensureRooms() {
  const changed = HOME.ensureRooms();
  if (changed) save({ quiet: true, render: false });
  return changed;
}

// ----- the list -----
function roomsListHTML() {
  const rooms = [...appRooms()].sort((a, b) => a.name.localeCompare(b.name));
  const rows = rooms.map(r => {
    const mine = fileable().filter(d => devArea(d) === r.id);
    const nl = mine.filter(d => d.domain !== 'pico').length, nr = mine.length - nl;
    const what = [nl ? plural(nl, 'light') : '', nr ? plural(nr, 'remote') : ''].filter(Boolean).join(' · ') || 'Nothing in it yet';
    return `<button class="item" data-act="rooms-one" data-id="${esc(r.id)}">${lampHTML(targetOn(`a:${r.id}`) ? roomMean(r.id) : 0, 40, ICON(roomIcon(r.name), 'sm'))}<div class="grow"><div class="t">${esc(r.name)}</div><div class="d">${what}${roomWhereShort(r)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`;
  }).join('');
  const orphans = fileable().filter(d => devArea(d) === 'none');
  return `<p class="d" style="margin:0 0 16px">Your rooms live here, not in the Lutron app. Make one, rename it, and move any light or remote into it, Lutron and Philips Hue together.</p>
    <div class="gh">Rooms</div><div class="card pad0 list">${rows || `<div class="item"><div class="grow"><div class="d">No rooms yet.</div></div></div>`}</div>
    <div class="card pad0 list" style="margin-top:8px"><button class="item" data-act="rooms-new"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">New room</div><div class="d">It appears everywhere at once: Home, your remotes, your scenes</div></div></button></div>
    ${orphans.length ? `<div class="gh">Elsewhere</div><div class="card pad0 list">${orphans.map(d => roomDeviceRow(d, 'none')).join('')}</div><p class="d" style="margin:8px 0 0">These are in no room yet. Tap one to file it.</p>` : ''}
    <p class="small faint" style="margin:24px 0 0">Renaming a room renames it on your Philips Hue bridge when it came from there, and asks your Lutron bridge to do the same when it came from there. The Lutron bridge does not document rooms, so it may say no; the room still works here either way.</p>`;
}
// One short phrase for the list: where else this room exists.
function roomWhereShort(r) {
  const bits = [];
  if (r.bridge_area) bits.push('Lutron');
  if (r.hue_room) bits.push('Hue');
  return bits.length ? ` · also on ${bits.join(' and ')}` : ' · this app only';
}

// ----- one room -----
function roomEditHTML(r) {
  const mine = fileable().filter(d => devArea(d) === r.id);
  const lights = mine.filter(d => d.domain !== 'pico');
  const pics = mine.filter(d => d.domain === 'pico');
  const hue = (S.agent.info || {}).hue || {};
  return `<label class="field" style="margin-top:0"><span>Name</span><input class="input" id="room-name" value="${esc(r.name)}" maxlength="40" autocomplete="off" data-room="${esc(r.id)}"></label>
    ${roomWhereHTML(r, mine)}
    <div class="gh">Lights and shades</div><div class="card pad0 list">${lights.map(d => roomDeviceRow(d, r.id)).join('') || `<div class="item"><div class="grow"><div class="d">Nothing in this room yet.</div></div></div>`}</div>
    ${pics.length ? `<div class="gh">Remotes</div><div class="card pad0 list">${pics.map(d => roomDeviceRow(d, r.id)).join('')}</div>` : ''}
    <div class="card pad0 list" style="margin-top:8px"><button class="item" data-act="rooms-add" data-id="${esc(r.id)}"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Move something in here</div><div class="d">From any other room${hue.paired ? ', Lutron and Hue alike' : ''}</div></div></button></div>
    <div class="spacer"></div>
    <div class="card pad0 list"><button class="item" data-act="rooms-delete" data-id="${esc(r.id)}"><div class="grow"><div class="t" style="color:var(--red-text)">Delete this room</div><div class="d">Nothing is removed from your home: everything in it goes back to the room its bridge puts it in.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
}
// What the bridges know about this room, in plain words. Never a promise the bridge did not keep.
function roomWhereHTML(r, mine) {
  const hasLutron = mine.some(d => !/^(hue_|nanoleaf_)/.test(String(d.device_id)));
  const hasHue = mine.some(d => String(d.device_id).startsWith('hue_'));
  const hasNanoleaf = mine.some(d => String(d.device_id).startsWith('nanoleaf_'));
  const lines = [];
  if (r.bridge_area) lines.push('Your Lutron bridge has a room of its own for this, so a new Lutron device can be filed straight into it.');
  else if (hasLutron) lines.push('Your Lutron bridge has no room of its own for this one. Everything here works anyway: its lights stay in whatever Lutron room they were in, and this app is what decides where they live.');
  else if (ROOM_NOBRIDGE[r.id]) lines.push('Your Lutron bridge would not make a room to match this one, so it lives here only. Nothing is lost by that: a Lutron device added to it is created in a room the bridge does have, and filed here.');
  else lines.push('This room is the app\'s own. If you add a Lutron device to it, the bridge will be asked for a room to match, and told where to put it.');
  if (r.hue_room) lines.push('It is also a room on your Philips Hue bridge, so renaming it here renames it there.');
  else if (hasHue) lines.push('Its Hue lamps keep their own Hue room until you move one from here.');
  if (hasNanoleaf) lines.push('A Nanoleaf controller has no room of its own to match: this app is the only place it is filed.');
  return `<div class="tip" style="margin-top:8px"><div class="grow"><span class="cap">Where it lives</span>${lines.map(l => `<div class="d">${esc(l)}</div>`).join('')}</div></div>`;
}
function roomDeviceRow(d, fromRoom) {
  const isPico = d.domain === 'pico';
  const glyph = isPico ? ICON('remote', 'sm') : ICON(typeof lightIcon === 'function' ? lightIcon(d) : 'bulb', 'sm');
  const lv = isPico ? 0 : (level(d.device_id) || 0);
  return `<button class="item" data-act="rooms-move" data-id="${esc(d.device_id)}" data-from="${esc(fromRoom)}">${lampHTML(lv, 28, glyph)}<div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${esc(isPico ? 'Remote' : cap(d.domain === 'cover' ? 'shade' : d.domain))}${bridgeTag(d.device_id)}</div></div><span class="val">${esc(fromRoom === 'none' ? 'Elsewhere' : areaName(fromRoom))}</span><span class="chev">${ICON('chev', 'sm')}</span></button>`;
}

// ----- making, renaming, deleting -----
// A room, made without navigating anywhere: the shape roomsNew() below builds for the Rooms page, but also the
// one a room picker elsewhere in the app can call in place (the add-device flow's "Which room?", a light's own
// "Move to a different room"), so making a room is reachable from wherever a person would think to make one, not
// only from Settings › Rooms (the owner's own example). Named it when given a name; otherwise "New room[, 2, ...]".
// opts.save: false skips this function's own save when the caller is about to mutate S.config again right away
// and save that instead (roomsMoveNewRoom below): two independent saves fired back to back race on the network,
// and if the first one's (stale) response lands after the second's, it silently undoes the second's change.
function roomsCreateQuiet(name, opts = {}) {
  ensureRooms();
  const names = new Set(appRooms().map(r => r.name.toLowerCase()));
  let n = String(name || '').trim().slice(0, 40);
  if (!n) { n = 'New room'; let i = 2; while (names.has(n.toLowerCase())) n = `New room ${i++}`; }
  else if (names.has(n.toLowerCase())) { let i = 2; while (names.has(`${n} ${i}`.toLowerCase())) i++; n = `${n} ${i}`; }
  const room = { id: uid(), name: n, device_ids: [], bridge_area: null, hue_room: null };
  S.config.settings.rooms = [...appRooms(), room];
  if (opts.save !== false) save({ quiet: true, render: false });
  bridgeMakeRoom(room.id);
  return room;
}
function roomsNew() {
  const room = roomsCreateQuiet();
  S.roomsEdit = room.id; S.view = 'rooms'; render(); window.scrollTo(0, 0);
  setTimeout(() => { const i = document.getElementById('room-name'); if (i) { i.focus(); i.select(); } }, 120);
}
function roomsRename(id, value) {
  const r = roomById(id); if (!r) return;
  r.name = String(value).trim().slice(0, 40) || r.name;
  saveSoon();
  clearTimeout(roomsRename._t);
  roomsRename._t = setTimeout(() => bridgeRenameRoom(id), 900);
}
function roomsDelete(id) {
  const r = roomById(id); if (!r) return;
  const before = JSON.stringify(S.config);
  const hadPhoto = !!r.photo;
  S.config.settings.rooms = appRooms().filter(x => x.id !== id);
  S.roomsEdit = null;
  save({ quiet: true, render: false }).then(() => {
    render();
    // Deleting the room is the one place a photograph's bytes really go. It cannot happen now: this
    // toast offers Undo, and Undo restores the stamp, so throwing the file away first would put the
    // room back pointing at a picture that no longer exists. The file goes once the offer has lapsed,
    // and the pending delete is dropped the moment Undo is taken.
    let drop = null;
    if (hadPhoto) drop = setTimeout(() => { api(`/api/roomphoto/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}); }, 8000);
    toast(`${r.name} deleted`, { undo: async () => { clearTimeout(drop); S.config = JSON.parse(before); await save({ msg: 'Put back', quiet: true }); render(); } });
  });
}

// ----- moving a device between rooms -----
// opts.back / opts.onBack let a caller that is itself a sheet (a light's own page, "no room" anywhere a device
// shows it) push this in place of replacing itself outright; the Rooms page calls it with neither, since there it
// is the page underneath, not a sheet.
function roomsMoveSheet(deviceId, fromRoom, opts = {}) {
  const d = dev(deviceId); if (!d) return;
  const rooms = [...appRooms()].sort((a, b) => a.name.localeCompare(b.name));
  const rows = rooms.map(r => pickRow(r.id, esc(r.name), r.id === fromRoom ? 'Where it is now' : '', r.id === fromRoom, lampHTML(0, 28, ICON(roomIcon(r.name), 'sm')))).join('');
  const newChip = `<button class="item" data-act="rooms-move-new" data-id="${esc(deviceId)}"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">New room</div></div></button>`;
  showSheet('rooms-move', `Which room is ${esc(d.name)} in?`, `<div class="card pad0 list" data-rooms-pick>${rows}${newChip}</div>
    <p class="d" style="margin:16px 0 0">It moves here straight away. ${String(deviceId).startsWith('hue_') ? 'Your Hue bridge is told too, so the Hue app agrees.' : 'Your Lutron bridge is asked to move it too; if it says no, the app still has it right.'}</p>`,
    { detent: 'medium', sub: 'Everything in the app follows at once.', back: !!opts.back, onBack: opts.onBack || null });
  sheet.onPickRoom = deviceId;
}
// "New room", right from the move sheet: the same test as the add-device flow (a room should be makeable
// wherever a person would think to move something into one), without leaving the picker.
function roomsMoveNewRoom(deviceId) {
  // one save, from roomsMoveTo, carries both the new room and the move: see roomsCreateQuiet's opts.save.
  const room = roomsCreateQuiet(null, { save: false });
  roomsMoveTo(deviceId, room.id);
}
async function roomsMoveTo(deviceId, roomId) {
  const d = dev(deviceId); if (!d) return;
  ensureRooms();
  const before = JSON.stringify(S.config);
  const target = roomById(roomId);
  for (const r of appRooms()) r.device_ids = (r.device_ids || []).filter(x => x !== deviceId);
  if (target) target.device_ids = [...(target.device_ids || []), deviceId];
  sheet.close();
  await save({ quiet: true, render: false });
  if (S.roomsEdit && !roomById(S.roomsEdit)) S.roomsEdit = null;
  render();
  toast(`${d.name} moved to ${target ? target.name : 'Elsewhere'}`, { undo: async () => { S.config = JSON.parse(before); await save({ msg: 'Moved back', quiet: true }); render(); } });
  if (target) bridgeMoveDevice(deviceId, target.id);
}
// "Move something in here": every device that is in another room, grouped by the room it is in now.
function roomsAddSheet(roomId) {
  const r = roomById(roomId); if (!r) return;
  const others = fileable().filter(d => devArea(d) !== roomId);
  const groupsByRoom = [...new Set(others.map(devArea))]
    .map(id => ({ id, name: id === 'none' ? 'Elsewhere' : areaName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(a => { const ds = others.filter(d => devArea(d) === a.id); return ds.length ? `<div class="h3">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => `<button class="item" data-act="rooms-move-to" data-id="${esc(d.device_id)}" data-room="${esc(roomId)}">${lampHTML(d.domain === 'pico' ? 0 : (level(d.device_id) || 0), 28, ICON(d.domain === 'pico' ? 'remote' : (typeof lightIcon === 'function' ? lightIcon(d) : 'bulb'), 'sm'))}<div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${esc(d.domain === 'pico' ? 'Remote' : cap(d.domain === 'cover' ? 'shade' : d.domain))}${bridgeTag(d.device_id)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}</div>` : ''; })
    .join('');
  sheet.open(`Move something into ${esc(r.name)}`, groupsByRoom || `<div class="tip"><div class="grow"><div class="t">Everything is already in this room</div></div></div>`, { detent: 'large', sub: 'Tap anything to move it here.' });
}

// ----- keeping the bridges in step -----
// Every one of these is best effort and runs after the app has already saved. A bridge that says no changes
// nothing about the room the person just made: it only changes what the copy on the room's page says.
async function roomsApi(body) { return api('/api/rooms', { method: 'POST', body: JSON.stringify(body) }); }
// Rooms the Lutron bridge would not make, for this run of the app: the room's page says so instead of promising
// a bridge room that is not there. It is not stored, because it is about the bridge's answer, not about the room.
const ROOM_NOBRIDGE = {};
async function bridgeMakeRoom(id) {
  const r = roomById(id); if (!r || r.bridge_area) return;
  if (!connOk()) return;
  try {
    const res = await roomsApi({ op: 'area_create', name: r.name });
    const made = ((res && res.detail) || {}).area_id;
    const room = roomById(id);
    if (made && room) { delete ROOM_NOBRIDGE[id]; room.bridge_area = String(made); await save({ quiet: true, render: false }); if (S.view === 'rooms') render(); }
  } catch (e) {
    // The owner's bridge answers 400 BadRequest here. That is fine and it is said out loud, once.
    ROOM_NOBRIDGE[id] = true;
    if (S.view === 'rooms' && S.roomsEdit === id) { render(); toast(`Your Lutron bridge would not make a room: ${friendlyError(e.message)}. ${r.name} still works here.`); }
  }
}
async function bridgeRenameRoom(id) {
  const r = roomById(id); if (!r || !connOk()) return;
  if (r.hue_room) { try { await roomsApi({ op: 'hue_rename', room: r.hue_room, name: r.name }); } catch (_) { /* said below if the Lutron side fails too */ } }
  if (r.bridge_area) { try { await roomsApi({ op: 'area_rename', area: r.bridge_area, name: r.name }); } catch (e) { toast(`Renamed here. Your Lutron bridge kept its own name: ${friendlyError(e.message)}`); } }
}
async function bridgeMoveDevice(deviceId, roomId) {
  const r = roomById(roomId); if (!r || !connOk()) return;
  const isHue = String(deviceId).startsWith('hue_');
  if (isHue) {
    try {
      let target = r.hue_room;
      if (!target) {
        const made = await roomsApi({ op: 'hue_create', name: r.name });
        target = ((made && made.detail) || {}).room;
        const room = roomById(roomId);
        if (target && room) { room.hue_room = String(target); await save({ quiet: true, render: false }); }
      }
      if (target) await roomsApi({ op: 'hue_move', device: deviceId, room: target });
      if (S.view === 'rooms') render();
    } catch (e) { toast(`Moved here. Your Hue bridge did not follow: ${friendlyError(e.message)}`); }
    return;
  }
  // Nanoleaf has no bridge-native room to keep in step with: the app's own room is the only place this lives.
  if (String(deviceId).startsWith('nanoleaf_')) return;
  if (!r.bridge_area) return;   // nothing to ask of a bridge that has no room for this
  try { await roomsApi({ op: 'device_move', id: deviceId, area: r.bridge_area }); }
  catch (e) { toast(`Moved here. Your Lutron bridge kept it where it was: ${friendlyError(e.message)}`); }
}

// Which Lutron area a new Lutron device goes into when the app room has none of its own: the area its roommates
// already use, else one whose name matches, else the first the bridge lists. The app files it in the app room
// whatever happens, and the sheet says which Lutron room was used.
function lutronHomeFor(roomId) {
  const bridgeAreas = Object.values(S.inv.areas || {}).filter(a => a && a.id && a.name && !String(a.id).startsWith('hue_')).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!bridgeAreas.length) return null;
  const r = roomById(roomId);
  if (r && r.bridge_area) { const own = bridgeAreas.find(a => String(a.id) === r.bridge_area); if (own) return { id: String(own.id), name: own.name, own: true }; }
  if (!r) { const a = bridgeAreas.find(x => String(x.id) === roomId); if (a) return { id: String(a.id), name: a.name, own: true }; }
  const mates = fileable().filter(d => devArea(d) === roomId && !String(d.device_id).startsWith('hue_') && d.area && !String(d.area).startsWith('hue_'));
  if (mates.length) { const a = bridgeAreas.find(x => String(x.id) === String(mates[0].area)); if (a) return { id: String(a.id), name: a.name, own: false }; }
  const want = ((r && r.name) || '').toLowerCase();
  const near = want && bridgeAreas.find(a => String(a.name).toLowerCase() === want);
  if (near) return { id: String(near.id), name: near.name, own: false };
  return { id: String(bridgeAreas[0].id), name: bridgeAreas[0].name, own: false };
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'rooms-open': goRooms(d.id || null); break;
    case 'rooms-back': roomsLeave(); break;
    case 'rooms-one': S.roomsEdit = d.id; render(); window.scrollTo(0, 0); break;
    case 'rooms-one-back': S.roomsEdit = null; render(); window.scrollTo(0, 0); break;
    case 'rooms-new': roomsNew(); break;
    case 'rooms-delete': roomsDelete(d.id); break;
    case 'rooms-move': roomsMoveSheet(d.id, d.from); break;
    case 'rooms-move-new': roomsMoveNewRoom(d.id); break;
    case 'rooms-add': roomsAddSheet(d.id); break;
    case 'rooms-move-to': roomsMoveTo(d.id, d.room); break;
    case 'walk-pick': if (sheet.onPickRoom && document.querySelector('[data-rooms-pick]')) { const id = sheet.onPickRoom; sheet.onPickRoom = null; roomsMoveTo(id, d.v); } break;
  }
});
document.addEventListener('input', e => { if (e.target.id === 'room-name') roomsRename(e.target.dataset.room, e.target.value); });
