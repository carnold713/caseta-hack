/* The room page and the room setup page (docs/ia-v5.md 3, stage 2).
   Home is a list of rooms; a room is a pushed page with its moods, its lights and one row for setup. Everything a
   room's card used to hold inside Home lives here, alone, with the nav bar's back arrow as the way out.
   Loaded after home.js and light.js (it uses moodRowHTML, lightRow, roomLights, lightKind). */
'use strict';

// #room/<area>          the room
// #room/<area>/setup    what each light is for, its moods, and the kind of each light
function roomHash() { return `room/${encodeURIComponent(S.room || '')}${S.roomPage === 'setup' ? '/setup' : ''}`; }
function goRoom(aid, page = null) {
  S.room = aid; S.roomPage = page; S.view = 'room';
  location.hash = roomHash();
  render(); window.scrollTo(0, 0);
}
// Reading the hash back (a shared link, the back button): the page is whatever the URL says.
function roomFromHash(parts) {
  const aid = parts[1] ? decodeURIComponent(parts[1]) : null;
  if (!aid || !areas().some(a => a.id === aid)) return false;
  S.room = aid; S.roomPage = parts[2] === 'setup' ? 'setup' : null;
  return true;
}

VIEWS.room = {
  tab: 'home',                                  // the room is pushed from Home, so Home stays lit in the tab bar
  nested() { return !!(S.room && areas().some(a => a.id === S.room)); },
  top() {
    const aid = S.room; if (!aid) return '';
    if (S.roomPage === 'setup') return nestedTop('room-setup-back', `${esc(areaName(aid))} setup`);
    const t = `a:${aid}`;
    const hasToggle = controllable().some(d => (d.area || 'none') === aid && d.domain !== 'cover');
    return nestedTop('room-back', esc(areaName(aid)), esc(roomSummary(aid)))
      + `<div class="tools">${hasToggle ? `<button class="sw" data-tgt="${t}" data-act="toggle" data-t="${t}" aria-label="${esc(areaName(aid))} on or off"></button>` : ''}</div>`;
  },
  body() {
    const aid = S.room;
    if (!aid || !areas().some(a => a.id === aid)) return `<div class="tip"><div class="grow"><div class="t">That room is gone</div><div class="d">It is no longer in your home.</div></div></div>`;
    return S.roomPage === 'setup' ? roomSetupHTML(aid) : roomPageHTML(aid);
  },
};

function roomPageHTML(aid) {
  const ds = roomOrder(controllable().filter(d => (d.area || 'none') === aid));
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  let h = '';
  // the moods, or one row that offers to make them
  if (roomDimmers(aid).length) {
    h += ps.length
      ? `<div class="gh">Moods</div><div class="room" data-tgt="a:${aid}" data-room="${aid}">${moodRowHTML(aid)}</div>`
      : `<div class="card pad0 list" style="margin-top:8px"><button class="item" data-act="roles-open" data-area="${aid}"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Give this room moods</div><div class="d">Bright, Relax, Dinner, Movie and Night</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  }
  h += `<div class="gh">Lights</div><div class="card pad0 list lights">${ds.map(lightRow).join('')}</div>`;
  h += `<div class="card pad0 list" style="margin-top:24px"><button class="item" data-act="room-setup" data-area="${aid}"><div class="grow"><div class="t">Room setup</div><div class="d">What each light is for, its moods, the kind of each light</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  return h;
}

// Room setup: a grouped list, one value per row. It was a sheet with two rows that dead ended; as a page, back is
// the nav bar and there is nowhere to get stuck.
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
  if (kinds) h += `<div class="gh">Kind of light</div><div class="card pad0 list">${kinds}</div>`;
  return h;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'room-open': goRoom(d.id); break;
    case 'room-setup': goRoom(d.area, 'setup'); break;
    case 'room-setup-back': goRoom(S.room); break;
    case 'room-back': S.room = null; S.roomPage = null; S.view = 'home'; location.hash = 'home'; render(); window.scrollTo(0, 0); break;
  }
});
