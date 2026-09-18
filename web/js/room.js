/* The room sheet and the room setup page (docs/ia-v5.md 3, stage 2, revised: rooms open in the bottom sheet).
   Home is a list of rooms; tapping one opens the room's moods, its lights and the "Room setup" row as a sheet
   over Home, the same shape automations.js uses for an automation's editor. Room setup itself stays a pushed
   page (docs/ux-progressive.md 2.21, docs/ia-v5.md "dead end"): a page's own nav-bar back arrow can never be
   missing, and a sheet's row-by-row back arrows can be forgotten, which is exactly what happened here once.
   Loaded after home.js and light.js (it uses moodRowHTML, lightRow, roomLights, lightKind). */
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
  showSheet('room', esc(areaName(aid)), roomSheetBodyHTML(aid), { detent: 'large', sub: esc(roomSummary(aid)), top: true });
  // Closing the sheet (the X, or anything that calls sheet.close() without going through goRoom/'room-setup'
  // first) is what sends the hash back to #home; a route change that already moved the hash elsewhere (the
  // hashchange listener, a tab switch) leaves it alone, so the browser's own back button is never fought.
  sheet.onClose = () => {
    const cur = location.hash.replace(/^#/, '');
    S.room = null;
    if (cur.split('/')[0] === 'room' && cur.split('/')[2] !== 'setup') location.hash = 'home';
  };
}

// The room sheet's body: the whole of what roomPageHTML used to render as a page, plus the whole-room on/off
// toggle that the page's own header used to carry next to its name (nestedTop's `.tools`; a sheet's header has
// no equivalent slot, so it becomes the first row instead. Nothing here is new, only moved).
function roomSheetBodyHTML(aid) {
  const ds = roomOrder(controllable().filter(d => devArea(d) === aid));
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  const t = `a:${aid}`;
  const hasToggle = controllable().some(d => devArea(d) === aid && d.domain !== 'cover');
  let h = '';
  if (hasToggle) h += `<div class="card pad0 list" style="margin-bottom:8px"><div class="item"><div class="grow"><div class="t">Turn the room on or off</div></div><button class="sw" data-tgt="${t}" data-act="toggle" data-t="${t}" aria-label="${esc(areaName(aid))} on or off"></button></div></div>`;
  // the moods, or one row that offers to make them
  if (roomDimmers(aid).length) {
    h += ps.length
      ? `<div class="gh">Moods</div><div class="room" data-tgt="${t}" data-room="${aid}">${moodRowHTML(aid)}</div>`
      : `<div class="card pad0 list" style="margin-top:8px"><button class="item" data-act="roles-open" data-area="${aid}"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Give this room moods</div><div class="d">Bright, Relax, Dinner, Movie and Night</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  }
  h += `<div class="gh">Lights</div><div class="card pad0 list lights">${ds.map(lightRow).join('')}</div>`;
  h += `<div class="card pad0 list" style="margin-top:24px"><button class="item" data-act="room-setup" data-area="${aid}"><div class="grow"><div class="t">Room setup</div><div class="d">What each light is for, moods, kinds</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  return h;
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
  h += `<div class="gh">This room</div><div class="card pad0 list"><button class="item" data-act="rooms-open" data-id="${esc(aid)}"><div class="grow"><div class="t">Name and what is in it</div><div class="d">Rename it, move lights and remotes in or out, delete it</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
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
