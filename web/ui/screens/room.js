// 03 · A room. Its photograph with All on and All off laid on it, its scenes, and every device in it as a tile.
// Read from the Figma frame (12733:20).
import { tile, roomPicture } from '/ui/screens/parts.js';
import { roomTone, roomPower } from '/ui/screens/rooms.js';
import { sheets as setupSheets, actions as setupActions } from '/ui/screens/setup.js';

// Room setup and the room's sleep timer are sheets over it (setup.js).
export const sheets = setupSheets;

// Fans and shades after the lights: a grid is never re-sorted by state, so a tile never moves under the thumb that
// just turned it on.
const DOMAIN_LAST = { light: 0, switch: 0, fan: 1, cover: 2 };
// The glyphs the file puts on a scene chip: Bright's sun and Night's moon. The others carry none.
const MOOD_GLYPH = { bright: 'sun', night: 'moon' };

export function view(c, r) {
  const { data, H, esc, icon } = c;
  const aid = r.id;
  const a = data.areas().find(x => x.id === aid);
  if (!a) return gone(c);
  const ds = data.controllable().filter(d => data.devArea(d) === aid)
    .sort((x, y) => (DOMAIN_LAST[x.domain] || 0) - (DOMAIN_LAST[y.domain] || 0) || x.name.localeCompare(y.name));
  const lights = H.roomLights(aid);
  const litN = lights.filter(d => (data.level(d.device_id) || 0) > 0).length;
  const onN = ds.filter(d => data.isOn(d.device_id) && d.domain !== 'cover').length;
  const photo = !!H.roomPhotoURL(aid);
  const canToggle = ds.some(d => d.domain !== 'cover');

  // the room's scenes: the one the lights are showing now is copper, and "Save this look" keeps what they are showing
  const cur = H.sceneMatch(aid);
  const scenes = H.roomScenes(aid).map(p => {
    const now = p.id === cur;
    const g = now ? 'check' : MOOD_GLYPH[p.mood];
    return `<button class="chip ${g ? 'lead' : ''} ${now ? 'current' : ''}" data-act="scene" data-t="p:${esc(p.id)}">${g ? icon(g, 16, 1.8) : ''}${esc(H.sceneShortName(p))}</button>`;
  });
  const saveLook = litN && !cur ? `<button class="chip lead" data-act="save-look" data-id="${esc(aid)}">${icon('plus', 16, 1.8)}Save this look</button>` : '';
  const suggest = !scenes.length && H.roomDimmers(aid).length ? `<button class="chip lead" data-act="suggest-five" data-id="${esc(aid)}">${icon('sparkle', 16, 1.8)}Suggest five scenes</button>` : '';

  return `<div class="room">
    <header class="hdr">
      <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
      <button class="hdr-btn a1" data-go="room/${esc(aid)}/setup" aria-label="Room setup">${icon('dots', 22, 2.4)}</button>
    </header>
    <div class="room-title">
      <h1 class="t-h1">${esc(a.name)}</h1>
      <span class="count" data-xf>${ds.length === 1 ? '1 device' : `${ds.length} devices`}${onN ? ` · ${onN} on` : ''}</span>
    </div>
    <div class="room-photo-card ${photo ? '' : roomTone(aid)}">
      ${roomPicture(c, aid, a.name, false)}
      ${litN ? `<span class="badge" data-xf aria-label="${litN} on">${litN}</span>` : ''}
      ${photo ? '' : `<button class="add-photo" data-go="room/${esc(aid)}/setup">${icon('camera', 16, 1.8)}Add a photo</button>`}
      ${canToggle ? `<div class="room-acts">
        <button class="glass" data-act="room-on" data-id="${esc(aid)}">${icon('sun', 22, 2)}All on</button>
        <button class="glass" data-act="room-off" data-id="${esc(aid)}">${icon('power', 22, 2)}All off</button>
      </div>` : ''}
    </div>
    ${scenes.length || saveLook || suggest ? `<div class="chip-row room-chips" data-keep="room-scenes">${scenes.join('')}${saveLook}${suggest}</div>` : ''}
    ${ds.length
      ? `<div class="tile-grid room-grid">${ds.map(d => tile(c, d)).join('')}</div>`
      : `<div class="group room-empty"><button class="row sub has-ic" data-go="room/${esc(aid)}/setup"><span class="row-ic">${icon('plus', 20, 1.7)}</span><span class="row-txt"><span class="t">Nothing in this room yet</span><span class="d">Move a light or a remote in here.</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button></div>`}
  </div>`;
}

function gone(c) {
  return `<div class="room"><header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${c.icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">That room is gone</h1><p class="t-body muted soon">It is no longer in your home.</p></div>`;
}

export const actions = {
  ...setupActions,
  'room-on'(c, el) { roomPower(c, el.dataset.id, true); },
  'room-off'(c, el) { roomPower(c, el.dataset.id, false); },
  'save-look'(c, el) {
    const p = c.H.saveRoomLook(el.dataset.id); if (!p) return;
    c.save(`Saved as ${c.H.sceneShortName(p)}`);
  },
  'suggest-five'(c, el) {
    const aid = el.dataset.id;
    c.H.suggestScenes(aid);
    c.save(`Five scenes for ${c.data.areaName(aid)}`);
  },
};
