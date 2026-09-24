// 16 · Room setup (12744:111648): a sheet over the room. Its name and photo, Follow the day for its lamps, a sleep
// timer for the room, what is in it, its remotes, where the bridges keep it, and deleting it.
import { roomPicker, confirmSheet, nameSheet, undoMove } from '/ui/screens/pickers.js';
import { roomTimer, actions as lookActions } from '/ui/screens/looks.js';
import { photoBlob, sendPhoto, pickFile } from '/ui/photo.js';

const seenKey = aid => `roomInfoSeen:${aid}`;
const seen = aid => { try { return localStorage.getItem(seenKey(aid)) === '1'; } catch (_) { return false; } };

// Where the bridges keep this room, in one plain sentence. Never a promise a bridge did not keep.
function whereLine(c, aid) {
  const r = c.data.appRoom(aid);
  const mine = c.H.fileable().filter(d => c.data.devArea(d) === aid);
  const hasLutron = mine.some(d => !/^(hue_|nanoleaf_)/.test(String(d.device_id)));
  const name = c.data.areaName(aid);
  if (!r) return null;
  if (r.bridge_area) return `Your Lutron bridge has a room of its own for ${name}, so a new Lutron device can go straight into it.`;
  if (hasLutron) return `The Lutron bridge has no ‘${name}’ of its own, so other Lutron apps still show these lights where they were. This app is what decides where they live.`;
  return `${name} is this app’s own room. Add a Lutron device to it and the bridge is asked for a room to match.`;
}

export function setup(c, r) {
  const aid = r.id;
  const a = c.data.areas().find(x => x.id === aid); if (!a) return null;
  const { esc, icon } = c;
  const photo = c.H.roomPhotoURL(aid);
  const lamps = c.DAY.roomFollowLamps(aid);
  const allFollow = lamps.length && lamps.every(d => c.DAY.isFollowing(d.device_id));
  const tLeft = (() => {
    for (const [t, v] of Object.entries(c.S.timers || {})) {
      if (!v || !v.ends_at) continue;
      if (t === `a:${aid}`) { const ms = (v.ends_at < 1e12 ? v.ends_at * 1000 : +new Date(v.ends_at)) - Date.now(); return `${Math.max(1, Math.round(ms / 60000))} min left`; }
    }
    return null;
  })();
  const remotes = c.data.remotes().filter(d => c.data.devArea(d) === aid);
  const where = whereLine(c, aid);
  const body = `<div class="setup">
    <div class="group">
      <button class="row" data-act="setup-name"><span class="row-txt"><span class="t">Name</span></span><span class="row-val nm-cut">${esc(a.name)}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <div class="row photo-row"><span class="row-txt"><span class="t">Photo</span></span>
        ${photo ? `<button class="link blue" data-act="setup-photo-remove">Remove</button><button class="link blue" data-act="setup-photo">Change</button><img class="ph-thumb" src="${esc(photo)}" alt="">`
          : `<button class="link blue" data-act="setup-photo">Add a photo</button>`}</div>
    </div>
    <div class="group">
      ${lamps.length ? `<div class="row"><span class="row-txt"><span class="t">Follow the day for ${lamps.length === 1 ? esc(lamps[0].name) : `all ${lamps.length} lamps`}</span></span><button class="toggle" role="switch" aria-checked="${!!allFollow}" data-act="setup-follow" aria-label="Follow the day in this room"></button></div>` : ''}
      <button class="row" data-act="setup-timer"><span class="row-txt"><span class="t">Sleep timer for this room</span></span><span class="row-val">${tLeft || 'Off'}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    </div>
    <div class="group">
      <button class="row" data-act="setup-lights"><span class="row-txt"><span class="t">Lights in this room</span></span><span class="row-val">${esc(c.EDIT.roomContents(aid))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <button class="row" data-go="remotes"><span class="row-txt"><span class="t">Remotes</span></span><span class="row-val nm-cut">${esc(remotes.length ? remotes.map(x => x.name).join(', ') : 'None')}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    </div>
    ${where && !seen(aid) ? `<div class="info-card"><span class="ic-c">${icon('home', 18, 1.7)}</span><p>${esc(where)}</p><button class="link blue" data-act="setup-seen">Got it</button></div>` : ''}
    <div class="group"><button class="row" data-act="setup-delete"><span class="row-txt"><span class="t">Delete room</span></span></button></div>
  </div>`;
  // a room just made opens with its name ready to type
  const after = c2 => { if (c2.ui.nameNew === aid) { c2.ui.nameNew = null; setTimeout(() => actions['setup-name'](c2, null, r), 0); } };
  return { over: 'Room setup', title: a.name, body, after };
}

// What is in the room, each one a row that moves it elsewhere, and a way to bring something in.
function lightsSheet(c, aid) {
  const { esc, icon } = c;
  const mine = c.H.fileable().filter(d => c.data.devArea(d) === aid && d.domain !== 'pico');
  const kind = d => (d.domain === 'cover' ? 'Shade' : d.domain === 'fan' ? 'Fan' : d.domain === 'switch' ? 'Switch' : 'Light');
  return {
    over: c.data.areaName(aid), title: 'In this room',
    body: `<div class="group">${mine.map(d => `<button class="row sub" data-act="setup-move" data-id="${esc(d.device_id)}"><span class="row-txt"><span class="t">${esc(d.name)}</span><span class="d">${kind(d)}${esc(c.H.bridgeTag(d.device_id))}</span></span><span class="row-val">Move</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`).join('') || '<div class="row"><span class="row-txt"><span class="d">Nothing in this room yet.</span></span></div>'}</div>
      <div class="group"><button class="row has-ic" data-act="setup-bring"><span class="row-ic">${icon('plus', 20, 1.7)}</span><span class="row-txt"><span class="t">Move something in here</span></span></button></div>`,
  };
}
// Everything in other rooms, grouped by where it is now.
function bringSheet(c, aid) {
  const { esc } = c;
  const others = c.H.fileable().filter(d => c.data.devArea(d) !== aid && d.domain !== 'pico');
  const byRoom = [...new Set(others.map(d => c.data.devArea(d)))].map(id => ({ id, name: id === 'none' ? 'Elsewhere' : c.data.areaName(id) })).sort((x, y) => x.name.localeCompare(y.name));
  return {
    over: c.data.areaName(aid), title: 'Move something in here',
    body: byRoom.map(g => `<div class="t-over sec">${esc(g.name)}</div><div class="group">${others.filter(d => c.data.devArea(d) === g.id).map(d => `<button class="row" data-act="setup-bring-go" data-id="${esc(d.device_id)}"><span class="row-txt"><span class="t">${esc(d.name)}</span></span></button>`).join('')}</div>`).join('') || '<p class="t-body muted sheet-p">Everything is already in this room.</p>',
  };
}

async function moveTo(c, did, rid) {
  const d = c.data.dev(did); if (!d) return;
  const prev = JSON.stringify(c.S.config);
  const from = c.data.devArea(d);
  if (rid === '__new') rid = c.EDIT.createRoom().id;
  const target = c.EDIT.moveDevice(did, rid);
  await c.save('', { quiet: true });
  c.toast(`${d.name} moved to ${target ? target.name : 'no room'}`, { undo: () => undoMove(c, did, from, prev) });
  if (target) c.EDIT.bridgeMoveDevice(did, target.id).then(ch => { if (ch) c.save('', { quiet: true }); }).catch(e => c.toast(`Moved here. The bridge kept it where it was: ${e.message}`));
}

export const sheets = { setup, timer: (c, r) => roomTimer(c, r.id) };

// The room's timer sheet is looks.js's, so its buttons are too: without these a tap on one did nothing.
const timerActions = Object.fromEntries(Object.entries(lookActions).filter(([k]) => k.startsWith('timer-')));

export const actions = {
  ...timerActions,
  'setup-name'(c, el, r) {
    c.openPicker('name', c2 => nameSheet(c2, { over: 'Room setup', title: 'Name', value: c2.data.areaName(r.id), act: 'setup-name-set' }));
  },
  'setup-name-set'(c, el, r, value) {
    c.EDIT.renameRoom(r.id, value);
    c.saveSoon();
    clearTimeout(c.ui.renameTimer);
    c.ui.renameTimer = setTimeout(() => c.EDIT.bridgeRenameRoom(r.id).catch(e => c.toast(`Renamed here. The Lutron bridge kept its own name: ${e.message}`)), 1500);
  },
  async 'setup-photo'(c, el, r) {
    const file = await pickFile(); if (!file) return;
    const room = c.data.appRoom(r.id); if (!room) return;
    const had = room.photo || null;
    try {
      const stamp = await sendPhoto(c.data, r.id, await photoBlob(file));
      room.photo = stamp;
      await c.save('', { quiet: true });
      c.toast(had ? 'Photo changed' : 'Photo added', { undo: async () => { room.photo = had; await c.save('Photo put back'); } });
    } catch (e) { c.toast(e.message, { err: true }); }
  },
  async 'setup-photo-remove'(c, el, r) {
    const room = c.data.appRoom(r.id); if (!room || !room.photo) return;
    // the file stays on the hub, so Undo has something to come back to; a new photo or deleting the room replaces it
    const had = room.photo; room.photo = null;
    await c.save('', { quiet: true });
    c.toast('Photo removed', { keepUndo: true, undo: async () => { room.photo = had; await c.save('Photo put back'); } });
  },
  'setup-follow'(c, el, r) {
    const lamps = c.DAY.roomFollowLamps(r.id).map(d => d.device_id);
    const on = el.getAttribute('aria-checked') !== 'true';
    c.DAY.setFollowIds(lamps, on);
    c.save(on ? 'Following the day' : 'Stopped following the day');
  },
  'setup-timer'(c, el, r) { c.swap(`room/${r.id}/timer`); },
  'setup-lights'(c, el, r) { c.openPicker('lights', c2 => lightsSheet(c2, r.id)); },
  'setup-move'(c, el, r) {
    const did = el.dataset.id; const d = c.data.dev(did); if (!d) return;
    c.openPicker('move', c2 => roomPicker(c2, { over: d.name, title: 'Which room is it in?', current: r.id, act: 'setup-move-to', data: `data-id="${c.esc(did)}"` }));
  },
  async 'setup-move-to'(c, el, r) { c.openPicker('lights', c2 => lightsSheet(c2, r.id)); await moveTo(c, el.dataset.id, el.dataset.room); },
  'setup-bring'(c, el, r) { c.openPicker('bring', c2 => bringSheet(c2, r.id)); },
  async 'setup-bring-go'(c, el, r) { c.openPicker('lights', c2 => lightsSheet(c2, r.id)); await moveTo(c, el.dataset.id, r.id); },
  'setup-seen'(c, el, r) { try { localStorage.setItem(seenKey(r.id), '1'); } catch (_) { /* then it shows again next time */ } c.render(); },
  'setup-delete'(c, el, r) {
    const name = c.data.areaName(r.id);
    c.openPicker('delete', c2 => confirmSheet(c2, { over: 'Room setup', title: `Delete ${name}?`, act: 'setup-delete-go', yes: 'Delete room',
      text: 'Nothing is removed from your home: everything in it goes back to the room its bridge puts it in.' }));
  },
  async 'setup-delete-go'(c, el, r) {
    const aid = r.id;
    const prev = JSON.stringify(c.S.config);
    const room = c.EDIT.deleteRoom(aid); if (!room) return;
    c.closePicker(); c.closeSheet();
    await c.save('', { quiet: true });
    c.go('rooms');
    // the photograph's bytes go only once Undo has lapsed, so Undo has a picture to come back to
    const drop = room.photo ? setTimeout(() => { c.data.api(`/api/roomphoto/${encodeURIComponent(aid)}`, { method: 'DELETE' }).catch(() => {}); }, 8000) : null;
    c.toast(`${room.name} deleted`, { keepUndo: true, undo: async () => { clearTimeout(drop); c.data.restoreConfig(prev); await c.save('Put back'); } });
  },
};
