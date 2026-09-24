// 13 · Rooms. Every room as a 372 x 180 card, with All scenes above them. Read from the Figma frame (12744:38).
//
// v7 (design-v7-ui.md 2, frame 12814:49603): each card's glow is that room's real light, sized by its level and
// coloured by its lamps, and a room turned on blooms from its power button outward. A room that is off is asleep:
// grey under a veil, not merely unhighlighted.
import { roomStatus, roomPicture } from '/ui/screens/parts.js';
import { glowHTML } from '/ui/glow.js';
import { roomLight, nightNow } from '/ui/screens/home.js';

// The last light each card showed, so a room going out draws back into its button from what it was.
const lastLight = new Map();
// The room's light on its card: a white pool where the file puts it (272, 44 on a 372 card, so 100 in from the
// right), and a colour lamp's own pool at 0.6 of the size beside it (210, 60). Both are always drawn, lit or not, so
// a redraw keeps the element and its light moves rather than appearing: on, it opens out from the power circle on
// the dimmer (home.css); off, it draws back into it and goes out.
function cardGlow(c, aid, night) {
  const L = roomLight(c, aid);
  const was = lastLight.get(aid) || { level: 30, kelvin: 2200, colour: null };
  if (L) lastLight.set(aid, L);
  const s = L || was;
  const white = { level: s.level, kelvin: s.kelvin || 2200 };
  const col = s.colour ? { level: s.colour.level, hex: s.colour.hex } : { level: s.level, kelvin: 2200 };
  const g = (o, on, acc) => glowHTML({ ...o, ctx: 'card', night, x: acc ? 'calc(100% - 162px)' : 'calc(100% - 100px)', y: acc ? 60 : 44, cls: `${acc ? 'acc' : ''}${on ? '' : ' off'}`.trim() });
  return g(white, !!(L && L.kelvin), false) + g(col, !!(L && L.colour), true);
}

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
  const night = nightNow(c);
  const card = a => {
    const lit = H.roomLights(a.id).some(d => (data.level(d.device_id) || 0) > 0);
    const photo = !!H.roomPhotoURL(a.id);
    const canToggle = data.controllable().some(d => data.devArea(d) === a.id && d.domain !== 'cover');
    // A room with only a fan or a shade has no light to draw. The warmth over the picture is 10% at full, by level.
    const lights = H.roomLights(a.id).length > 0;
    const L = lit ? roomLight(c, a.id) : null;
    return `<div class="room-big ${photo ? 'photo' : roomTone(a.id)} ${lit ? 'lit' : ''}" data-go="room/${esc(a.id)}" role="link" aria-label="${esc(a.name)}">
      ${roomPicture(c, a.id, a.name, true)}
      <span class="rm-veil" aria-hidden="true"></span>
      ${lights ? `<span class="rm-warm" aria-hidden="true" style="--warm:${L ? (0.1 * L.level / 100).toFixed(3) : 0}"></span>${cardGlow(c, a.id, night)}` : ''}
      <span class="nm nm-cut">${esc(a.name)}</span><span class="vl" data-xf="standard">${esc(roomStatus(c, a.id))}</span>
      ${canToggle ? `<button class="pwr" data-act="room-toggle" data-id="${esc(a.id)}" aria-label="${lit ? 'Turn off' : 'Turn on'} ${esc(a.name)}">${icon('power', 20, 2)}</button>` : ''}
    </div>`;
  };
  return `<div class="rooms">
    <header class="rooms-head bar">
      <h1 class="t-h1 bar-t">Rooms</h1>
      <button class="hdr-btn a1" data-act="room-new" aria-label="Add a room">${icon('plus', 22, 1.7)}</button>
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
  // A tap is enough for one room (the on ladder): it lands at the evening's level at night, and says so with Undo.
  // Offline it says so instead of pretending.
  'room-toggle'(c, el) {
    const aid = el.dataset.id;
    if (c.conn() === 'off') { c.toast("Can't reach the house right now. Your remotes still work.", { err: true }); return; }
    const on = !c.H.roomLights(aid).some(d => (c.data.level(d.device_id) || 0) > 0);
    roomPower(c, aid, on);
    const name = c.data.areaName(aid);
    c.toast(`${name} ${on ? 'on' : 'off'}`, { undo: () => (on ? roomPower(c, aid, false) : c.run({ type: 'restore', target: `a:${aid}` })) });
  },
  // A new room, straight into its setup with its name ready to type. The Lutron bridge is asked for a room to match.
  async 'room-new'(c) {
    const room = c.EDIT.createRoom();
    await c.save('', { quiet: true });
    c.ui.nameNew = room.id;
    c.go(`room/${room.id}/setup`);
    c.EDIT.bridgeMakeRoom(room.id).then(changed => { if (changed) c.save('', { quiet: true }); }).catch(() => { /* the room works here either way */ });
  },
};

// A room's power circle: anything on turns the room off, nothing on brings it up.
export function roomPower(c, aid, want) {
  const ls = c.H.roomLights(aid).map(d => d.device_id);
  const on = want != null ? want : !ls.some(id => (c.data.level(id) || 0) > 0);
  for (const id of ls) c.assume([id], on ? c.onLevel(id, `a:${aid}`) : 0);
  c.soon();
  c.run({ type: 'level', target: `a:${aid}`, level: on ? 'on' : 'off' });
}
