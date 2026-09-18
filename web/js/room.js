/* The room sheet and the room setup page (docs/ia-v5.md 3, stage 2, revised: rooms open in the bottom sheet).
   Home is a list of rooms; tapping one opens the room's moods, its lights and the "Room setup" row as a sheet
   over Home, the same shape automations.js uses for an automation's editor. Room setup itself stays a pushed
   page (docs/ux-progressive.md 2.21, docs/ia-v5.md "dead end"): a page's own nav-bar back arrow can never be
   missing, and a sheet's row-by-row back arrows can be forgotten, which is exactly what happened here once.
   Loaded after home.js and light.js (it uses moodRowHTML, deviceTileHTML, roomLights, lightKind). */
'use strict';

// #room/<area>          the room sheet, over Home
// #room/<area>/setup    the room setup page (unchanged: a page, never a sheet)
function roomHash() { return `room/${encodeURIComponent(S.room || '')}${S.roomPage === 'setup' ? '/setup' : ''}`; }

// The single entry point every caller uses: `page` picks setup (a page) or the room itself (a sheet).
function goRoom(aid, page = null) {
  if (page === 'setup') {
    sheet.onClose = null; if (sheet.isOpen()) sheet.close();
    S.room = aid; S.roomPage = 'setup'; S.view = 'room';
    location.hash = `room/${encodeURIComponent(aid || '')}/setup`;
    render(); window.scrollTo(0, 0);
    return;
  }
  openRoomSheet(aid);
}

// Opens (or, from a hash echo, re-shows) the room sheet over Home. `S.room` is the sheet's own state, kept
// alongside the page underneath, which is always Home while this sheet is up.
function openRoomSheet(aid) {
  if (!aid || !areas().some(a => a.id === aid)) return;
  S.room = aid; S.roomPage = null;
  if (S.view !== 'home') { S.view = 'home'; render(); window.scrollTo(0, 0); }
  const h = `room/${encodeURIComponent(aid)}`;
  if (location.hash.replace(/^#/, '') !== h) location.hash = h;
  renderRoomSheet();
}
// Redraws the sheet in place for whichever room `S.room` names right now: the initial open, a reopen from a
// light's back arrow, and the return trip from "Give this room moods".
function renderRoomSheet() {
  const aid = S.room;
  if (!aid || !areas().some(a => a.id === aid)) { S.room = null; if (sheet.isOpen() && SHEET_KEY === 'room') sheet.close(); return; }
  // the sub line carries data-roomsum so paintState's existing sweep keeps it honest: turning a light on
  // from inside the sheet used to leave its own header still reading "all off"
  showSheet('room', esc(areaName(aid)), roomSheetBodyHTML(aid), { detent: 'large', sub: `<span data-roomsum="${esc(aid)}">${esc(roomSummary(aid))}</span>`, top: true });
  // Closing the sheet (the X, or anything that calls sheet.close() without going through goRoom/'room-setup'
  // first) is what sends the hash back to #home; a route change that already moved the hash elsewhere (the
  // hashchange listener, a tab switch) leaves it alone, so the browser's own back button is never fought.
  sheet.onClose = () => {
    const cur = location.hash.replace(/^#/, '');
    S.room = null;
    if (cur.split('/')[0] === 'room' && cur.split('/')[2] !== 'setup') location.hash = 'home';
  };
}

// ---------- the room hero (docs/design-spec-v5.md 4.8) ----------
// The default is not a placeholder waiting for a photograph, it is the room as it is lit right now:
// one soft radial per light, in that light's own colour, at the size of its level. A photograph is a
// dead picture of a kitchen; this one changes when you turn the desk lamp green, and it is the thing
// this app can draw that a photo library cannot. A photograph is offered, never asked for.
//
// It is plain CSS radial gradients, not js/lightfield.js: that module is a singleton bound to Home's
// hero with one WebGL context, and a second init would steal its host. This costs no context and no
// frame, and it is paintable from data attributes like everything else here.

// Stable placement: the same light lands in the same place on every render, so a pool never jumps.
function rhPlace(id) {
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { x: 12 + (h % 77), y: 26 + ((h >>> 7) % 44) };   // per cent, inside the box
}
const rhSize = lv => Math.round(96 + 148 * (lv / 100));
// A room's lights, brightest first, at most eight: past that the box is mush and the eight that carry
// the most light are the ones worth drawing.
function rhLights(aid) {
  return controllable()
    .filter(d => devArea(d) === aid && (d.domain === 'light' || d.domain === 'switch'))
    .sort((a, b) => (level(b.device_id) || 0) - (level(a.device_id) || 0))
    .slice(0, 8);
}
function roomPhotoSrc(aid) {
  const r = typeof appRoom === 'function' ? appRoom(aid) : null;
  if (!r || !r.photo) return null;
  return `/api/roomphoto/${encodeURIComponent(aid)}?token=${encodeURIComponent(S.token)}&v=${encodeURIComponent(r.photo)}`;
}
function roomHeroHTML(aid) {
  const src = roomPhotoSrc(aid);
  // no text and no control ever sits on the photograph: the room's name is in the sheet header above it
  if (src) return `<div class="rhero photo" data-rhero="${aid}"><img class="rh-img" data-roomphoto="${aid}" src="${esc(src)}" alt="" decoding="async"></div>`;
  const ds = rhLights(aid);
  if (!ds.length) return `<div class="rhero empty" data-rhero="${aid}">${ICON(roomIcon(areaName(aid)), 'xl')}</div>`;
  // the pools are emitted once with their place and size; paintRoomHero only ever writes colour and
  // opacity, so the shape of the DOM never changes while the room is open and a colour can cross-fade
  const pool = d => { const p = rhPlace(d.device_id); return `<span class="rh-pool" data-rh="${d.device_id}" style="--x:${p.x}%;--y:${p.y}%;--s:${rhSize(level(d.device_id) || 0)}px"></span>`; };
  // A room with its lights off has no pools to draw, and 180px of empty grey at the top of the sheet
  // reads as something failing to load rather than as a dark room. The glyph sits under the pools and
  // fades out as light arrives, so the box always says something: this room, dark, or this room, lit.
  return `<div class="rhero" data-rhero="${aid}"><span class="rh-dark">${ICON(roomIcon(areaName(aid)), 'xl')}</span>${ds.map(pool).join('')}</div>`;
}
function paintRoomHero() {
  document.querySelectorAll('.rh-pool[data-rh]').forEach(el => {
    const id = el.dataset.rh; const lv = level(id) || 0;
    el.style.setProperty('--c', lightFill(id, lv));
    el.style.setProperty('--s', `${rhSize(lv)}px`);
    el.style.opacity = lv > 0 ? String(0.18 + 0.62 * lv / 100) : '0';
  });
  document.querySelectorAll('.rhero[data-rhero]').forEach(el => {
    if (el.classList.contains('photo') || el.classList.contains('empty')) return;
    const lit = [...el.querySelectorAll('.rh-pool[data-rh]')].some(q => (level(q.dataset.rh) || 0) > 0);
    el.classList.toggle('dark', !lit);
  });
}

// The room sheet's body: the whole of what roomPageHTML used to render as a page, plus the whole-room on/off
// toggle that the page's own header used to carry next to its name (nestedTop's `.tools`; a sheet's header has
// no equivalent slot, so it becomes the first row instead. Nothing here is new, only moved).
function roomSheetBodyHTML(aid) {
  const ds = roomOrder(controllable().filter(d => devArea(d) === aid));
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  const t = `a:${aid}`;
  const hasToggle = controllable().some(d => devArea(d) === aid && d.domain !== 'cover');
  let h = roomHeroHTML(aid);
  if (hasToggle) h += `<div class="card pad0 list" style="margin-bottom:8px"><div class="item"><div class="grow"><div class="t">Turn the room on or off</div></div><button class="sw" data-tgt="${t}" data-act="toggle" data-t="${t}" aria-label="${esc(areaName(aid))} on or off"></button></div></div>`;
  // the moods, or one row that offers to make them
  if (roomDimmers(aid).length) {
    h += ps.length
      ? `<div class="gh">Moods</div><div class="room" data-tgt="${t}" data-room="${aid}">${moodRowHTML(aid)}</div>`
      : `<div class="card pad0 list" style="margin-top:8px"><button class="item" data-act="roles-open" data-area="${aid}"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Give this room moods</div><div class="d">Bright, Relax, Dinner, Movie and Night</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  }
  h += deviceGridHTML(aid, ds);
  h += `<div class="card pad0 list" style="margin-top:24px"><button class="item" data-act="room-setup" data-area="${aid}"><div class="grow"><div class="t">Room setup</div><div class="d">What each light is for, moods, kinds</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  return h;
}

// The devices in a room, as a two-column grid of tiles (docs/design-spec-v5.md 4.2). Fans and shades are last
// because their tiles span both columns, and a spanning tile in the middle of a grid leaves a hole beside it.
// The grid is never re-sorted by state: a tile that jumped to the front when its light came on would move
// under the thumb that just turned it on.
const DOMAIN_LAST = { light: 0, switch: 0, fan: 1, cover: 2 };
function deviceGridHTML(aid, ds) {
  if (!ds.length) return `<div class="card pad0 list"><button class="item" data-act="rooms-add" data-id="${esc(aid)}"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Nothing in this room yet</div><div class="d">Move a light or a remote in here.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  const order = ds.slice().sort((a, b) => (DOMAIN_LAST[a.domain] || 0) - (DOMAIN_LAST[b.domain] || 0));
  // a grid headed Lights with a fan in it is a small lie, and the room sheet is the one screen that holds mixed devices
  const head = order.every(d => d.domain === 'light' || d.domain === 'switch') ? 'Lights' : 'In this room';
  // only a grid of exactly one stretches: stretching a widow breaks the column rhythm for every row above it
  return `<div class="gh">${head}</div><div class="dgrid ${order.length === 1 ? 'one' : ''}" id="dgrid">${order.map(deviceTileHTML).join('')}</div>`;
}

// Room setup: a grouped list, one value per row. It was a sheet with two rows that dead ended; as a page, back is
// the nav bar and there is nowhere to get stuck. Left exactly as it was: this page never became part of the
// sheet stack above.
function roomSetupHTML(aid) {
  const ds = roomLights(aid);
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  const roles = ds.map(d => { const r = lightRole(d.device_id); return `<button class="item" data-act="roles-open" data-area="${aid}"><div class="grow"><div class="t">${esc(d.name)}</div></div><span class="val">${r ? esc(ROLE_LABEL[r]) : 'Not set'}</span><span class="chev">${ICON('chev', 'sm')}</span></button>`; }).join('');
  const kinds = ds.map(d => { const k = lightKind(d.device_id); return `<button class="item" data-act="room-kind" data-id="${d.device_id}" data-area="${aid}">${lampHTML(level(d.device_id) || 0, 28, ICON(lightIcon(d), 'sm'))}<div class="grow"><div class="t">${esc(d.name)}</div></div><span class="val">${k ? esc(kindLabel(k)) : 'Not set'}</span><span class="chev">${ICON('chev', 'sm')}</span></button>`; }).join('');
  let h = `<div class="gh">What each light is for</div><div class="card pad0 list">${roles || `<div class="item"><div class="grow"><div class="d">No lights in this room yet.</div></div></div>`}</div>`;
  if (roomDimmers(aid).length) {
    h += `<div class="gh">Moods</div><div class="card pad0 list">`;
    h += ps.length
      ? `<button class="item" data-act="rm-open" data-area="${aid}"><div class="grow"><div class="t">The five moods</div><div class="d">Bright, Relax, Dinner, Movie and Night</div></div><span class="val">${plural(ps.length, 'mood')}</span><span class="chev">${ICON('chev', 'sm')}</span></button>`
      : '';
    h += `<button class="item" data-act="roles-open" data-area="${aid}"><div class="grow"><div class="t">${ps.length ? 'Make them again from what they are' : 'Make the moods'}</div><div class="d">From what each light is for</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  }
  // Follow the day, for the lamps in this room that can change their warmth (js/daylight.js). A room of Caseta
  // dimmers has no row at all: there is nothing here it could apply to.
  if (typeof followRoomRowHTML === 'function') h += followRoomRowHTML(aid);
  if (kinds) h += `<div class="gh">Kind of light</div><div class="card pad0 list">${kinds}</div>`;
  // The room itself: its name, what is in it, and whether it should exist at all. One page for every room.
  // the photograph is the room's own identity, so it is the first row of the card that identity lives in
  h += `<div class="gh">This room</div><div class="card pad0 list">${roomPhotoRowHTML(aid)}<button class="item" data-act="rooms-open" data-id="${esc(aid)}"><div class="grow"><div class="t">Name and what is in it</div><div class="d">Rename it, move lights and remotes in or out, delete it</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  // one hidden picker per setup page. <input type="file"> is the only picker a PWA has, and on iOS it
  // already offers Photo Library, Take Photo and Choose File by itself, so the app puts no sheet of its
  // own in front of it: the row is one tap and the system asks the rest.
  h += `<input type="file" accept="image/*" id="photopick" data-area="${esc(aid)}" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none">`;
  return h;
}

VIEWS.room = {
  tab: 'home',                                  // reached from Home, so Home stays lit in the tab bar
  nested() { return !!(S.room && S.roomPage === 'setup' && areas().some(a => a.id === S.room)); },
  top() {
    const aid = S.room; if (!aid) return '';
    return nestedTop('room-setup-back', `${esc(areaName(aid))} setup`);
  },
  body() {
    const aid = S.room;
    if (!aid || !areas().some(a => a.id === aid)) return `<div class="tip"><div class="grow"><div class="t">That room is gone</div><div class="d">It is no longer in your home.</div></div></div>`;
    return roomSetupHTML(aid);
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'room-open': openRoomSheet(d.id); break;
    case 'room-setup': goRoom(d.area, 'setup'); break;
    // Room setup's own back arrow: friendliest is landing back in the room's own sheet, reopened at the room it
    // came from, rather than dropping to Home with no context.
    case 'room-setup-back': goRoom(S.room); break;
  }
});

/* ---------- a room's photograph (docs/design-spec-v5.md 6) ----------
   Optional, never asked for. No copy anywhere suggests the app would look better with a picture in
   it: the generated hero is the default and it is the better of the two. The bytes live on the hub's
   volume (hub/server.js), and the config carries only a stamp saying which picture it is. */

const PHOTO_MAX_PICK = 25 * 1024 * 1024;   // what a phone camera produces, before we shrink it
const PHOTO_MAX_SEND = 400 * 1024;         // the hub's own cap, so a refusal never travels
let PHOTO_RETRY = null;                    // the last blob, so "Try again" needs no second pick

function roomPhotoRowHTML(aid) {
  const src = roomPhotoSrc(aid);
  if (!src) {
    return `<button class="item" data-act="photo-open" data-area="${esc(aid)}"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Add a photo</div><div class="d">It shows at the top of the room.</div></div></button>`;
  }
  return `<button class="item" data-act="photo-open" data-area="${esc(aid)}"><img class="ph-thumb" data-phthumb="${esc(aid)}" src="${esc(src)}" alt="" decoding="async"><div class="grow"><div class="t">Photo</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`;
}

// With a photo already set there are two things to do, so the row opens a sheet; with none there is
// one, so the row is the picker itself.
function openPhotoSheet(aid) {
  if (!roomPhotoSrc(aid)) { pickPhoto(aid); return; }
  showSheet('photo', 'Photo', `<div class="card pad0 list">
    <button class="item" data-act="photo-pick" data-area="${esc(aid)}"><div class="grow"><div class="t">Choose a different photo</div></div></button>
    <button class="item" data-act="photo-remove" data-area="${esc(aid)}"><div class="grow"><div class="t" style="color:var(--red-text)">Remove the photo</div><div class="d">The room goes back to showing its own light.</div></div></button>
  </div>`, { detent: 'compact', sub: esc(areaName(aid)) });
}
function pickPhoto(aid) {
  const inp = document.getElementById('photopick'); if (!inp) return;
  inp.dataset.area = aid;
  inp.value = '';          // picking the same file twice in a row still fires change
  inp.click();
}

// Decode, shrink, then send. The shrink is what makes the hub's 400kb cap generous rather than tight:
// a room photo lands at 30 to 60kb, and a refusal the phone could have predicted never travels.
async function photoBlob(file) {
  if (file.size > PHOTO_MAX_PICK) throw Object.assign(new Error('That photo is too big. Try one under 25 MB.'), { stop: true });
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = url; });
    // 1024 on the long edge covers a 3x phone at the hero's 350 CSS px and the 640px layout
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.72, 0.6, 0.5]) {
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', q));
      if (blob && blob.size <= PHOTO_MAX_SEND) return blob;
    }
    throw Object.assign(new Error('That photo is too big. Try one under 25 MB.'), { stop: true });
  } catch (e) {
    if (e && e.stop) throw e;
    // a HEIC Safari did not convert, a PDF picked through Choose File, a corrupt file
    throw Object.assign(new Error('That file is not a photo. Pick an image.'), { stop: true });
  } finally {
    URL.revokeObjectURL(url);
  }
}
const blobDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('read')); r.readAsDataURL(blob); });

async function sendPhoto(aid, blob) {
  // "not connected" means the connector, not the network: the hub is this same origin and is still
  // answering, so a photo saves perfectly well while the home is unreachable and no copy says otherwise.
  if (navigator.onLine === false) throw new Error('No connection. The photo was not added.');
  const data = await blobDataURL(blob);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    return await api(`/api/roomphoto/${encodeURIComponent(aid)}`, { method: 'PUT', body: JSON.stringify({ data }), signal: ctl.signal });
  } catch (e) {
    // a request that never left the phone rejects before there is a body to read a message out of
    if (e && (e.name === 'AbortError' || /fetch|network|load failed/i.test(e.message || ''))) throw new Error('No connection. The photo was not added.');
    throw new Error(e && e.message ? e.message : 'The photo did not save.');
  } finally { clearTimeout(timer); }
}

async function applyPhoto(aid, blob) {
  const room = appRoom(aid); if (!room) return;
  const had = room.photo || null;
  PHOTO_RETRY = { aid, blob };
  // optimistic, the same way a light is: the hero and the row show it before the network does anything
  const local = URL.createObjectURL(blob);
  showPhotoPreview(aid, local);
  try {
    const out = await sendPhoto(aid, blob);
    room.photo = String(out.stamp);
    await save({ quiet: true, render: false });
    PHOTO_RETRY = null;
    if (S.view === 'room') render(); else if (SHEET_KEY === 'room') renderRoomSheet();
    toast(had ? 'Photo changed' : 'Photo added', { undo: () => undoPhoto(aid, had) });
  } catch (e) {
    showPhotoPreview(aid, had ? roomPhotoSrc(aid) : null);   // back in one frame, nothing half applied
    toast(e.message || 'The photo did not save.', { err: true, action: 'Try again', onAction: () => { const r = PHOTO_RETRY; if (r) applyPhoto(r.aid, r.blob); } });
  } finally {
    URL.revokeObjectURL(local);
  }
}
// The hero and the row, moved to a given src without waiting for a render.
function showPhotoPreview(aid, src) {
  document.querySelectorAll(`[data-rhero="${CSS.escape(aid)}"]`).forEach(el => {
    if (!src) { el.classList.remove('photo'); const im = el.querySelector('.rh-img'); if (im) im.remove(); return; }
    el.classList.add('photo');
    let im = el.querySelector('.rh-img');
    if (!im) { im = document.createElement('img'); im.className = 'rh-img'; im.alt = ''; im.decoding = 'async'; el.innerHTML = ''; el.appendChild(im); }
    im.src = src;
  });
  document.querySelectorAll(`[data-phthumb="${CSS.escape(aid)}"]`).forEach(el => { if (src) el.src = src; });
}
// Removing clears the stamp and does not call DELETE: there is one file per room, a replacement
// overwrites it, and deleting the room deletes it. That is what makes Undo real, because the picture
// is still there to come back to. The copy does not claim the bytes are gone.
async function removePhoto(aid) {
  const room = appRoom(aid); if (!room || !room.photo) return;
  const had = room.photo;
  room.photo = null;
  await save({ quiet: true, render: false });
  if (S.view === 'room') render(); else if (SHEET_KEY === 'room') renderRoomSheet();
  toast('Photo removed', { undo: () => undoPhoto(aid, had) });
}
async function undoPhoto(aid, stamp) {
  const room = appRoom(aid); if (!room) return;
  room.photo = stamp || null;
  await save({ quiet: true, render: false });
  if (S.view === 'room') render(); else if (SHEET_KEY === 'room') renderRoomSheet();
}

document.addEventListener('change', async e => {
  const inp = e.target; if (!inp || inp.id !== 'photopick') return;
  const file = inp.files && inp.files[0]; if (!file) return;
  const aid = inp.dataset.area;
  try { await applyPhoto(aid, await photoBlob(file)); }
  catch (err) { toast(err.message || 'That file is not a photo. Pick an image.', { err: true }); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  if (d.act === 'photo-open') openPhotoSheet(d.area);
  else if (d.act === 'photo-pick') { closeSheet(); pickPhoto(d.area); }
  else if (d.act === 'photo-remove') { closeSheet(); removePhoto(d.area); }
});
