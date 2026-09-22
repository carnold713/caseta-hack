// 13 · Rooms. Every room as a 372 x 180 card, with All scenes above them. Read from the Figma frame (12744:38).
import { roomStatus, roomPicture } from '/ui/screens/parts.js';

// A room with no photograph takes one of the file's four warm gradients, by its id, so it keeps the same one.
export function roomTone(aid) {
  let h = 0; for (const ch of String(aid)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return `rg-${h % 4}`;
}

export function view(c) {
  const { data, H, S, esc, icon } = c;
  const scenes = data.presets().length + data.lutronScenes().length;
  const starred = (S.config.favorites || []).filter(t => t.startsWith('p:') || t.startsWith('s:')).length;
  const rooms = data.areas();
  const card = a => {
    const lit = H.roomLights(a.id).some(d => (data.level(d.device_id) || 0) > 0);
    const photo = !!H.roomPhotoURL(a.id);
    const canToggle = data.controllable().some(d => data.devArea(d) === a.id && d.domain !== 'cover');
    return `<div class="room-big ${photo ? 'photo' : roomTone(a.id)} ${lit ? 'lit' : ''}" data-go="room/${esc(a.id)}" role="link" aria-label="${esc(a.name)}">
      ${!photo && lit ? '<span class="glow"></span>' : ''}
      ${roomPicture(c, a.id, a.name, true)}
      <span class="nm nm-cut">${esc(a.name)}</span><span class="vl">${esc(roomStatus(c, a.id))}</span>
      ${canToggle ? `<button class="pwr" data-act="room-toggle" data-id="${esc(a.id)}" aria-label="${lit ? 'Turn off' : 'Turn on'} ${esc(a.name)}">${icon('power', 20, 2)}</button>` : ''}
    </div>`;
  };
  return `<div class="rooms">
    <header class="rooms-head">
      <h1 class="t-h1">Rooms</h1>
      <button class="hdr-btn a1" data-go="rooms-add" aria-label="Add a room">${icon('plus', 22, 1.7)}</button>
    </header>
    <div class="rooms-list">
      <button class="scenes-card" data-go="scenes">
        <span class="ib"><img src="${c.artSrc('lutron-color')}" alt=""></span>
        <span class="t">All scenes</span>
        <span class="d">${scenes === 1 ? '1 scene' : `${scenes} scenes`}${starred ? ` · ${starred} starred` : ''}</span>
        <span class="ch">${icon('chev', 20, 1.8)}</span>
      </button>
      ${rooms.map(card).join('')}
    </div>
  </div>`;
}

// The app keeps its own list of rooms, seeded from the bridges the first time it is looked at. Quietly.
export function after(c) {
  if (c.H.ensureRooms()) c.save('', { quiet: true });
}

export const actions = {
  'room-toggle'(c, el) { roomPower(c, el.dataset.id); },
};

// A room's power circle: anything on turns the room off, nothing on brings it up.
export function roomPower(c, aid, want) {
  const ls = c.H.roomLights(aid).map(d => d.device_id);
  const on = want != null ? want : !ls.some(id => (c.data.level(id) || 0) > 0);
  c.assume(ls, on ? (c.S.config.settings.group_on_level || 100) : 0); c.soon();
  c.run({ type: 'level', target: `a:${aid}`, level: on ? 'on' : 'off' });
}
