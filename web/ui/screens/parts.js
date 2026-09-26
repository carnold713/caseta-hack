// Pieces more than one screen draws: a device tile, a scene chip, a room card, the offline card. Each takes the
// context the app hands every screen and returns HTML. Geometry is the file's (docs/design-spec-v6.md).
import { CasetaDaylight } from '/data/index.js';
import { roomScene } from '/ui/roomscene.js';

// A Caseta fan has five steps counting Off, which is why the file's fan tile carries five dots.
const FAN_SPEEDS = ['Off', 'Low', 'Medium', 'MediumHigh', 'High'];

// What a device's second line says. The value, never a label (the handoff's rule): "75% · Warm", "Off", "Medium",
// "40% open".
export function valueLine(c, d) {
  const id = d.device_id, st = c.S.states[id] || {}, lv = c.data.level(id);
  if (d.domain === 'fan') return c.data.isOn(id) ? { Low: 'Low', Medium: 'Medium', MediumHigh: 'Medium high', High: 'High' }[st.fan_speed] || 'On' : 'Off';
  if (d.domain === 'cover') return lv == null ? '' : lv <= 0 ? 'Closed' : lv >= 100 ? 'Open' : `${lv}% open`;
  if (lv == null) return 'Not answering';
  if (!lv) return 'Off';
  if (d.domain === 'switch') return 'On';
  const col = st.color;
  if (col && col.mode === 'ct' && col.kelvin) return `${lv}% · ${CasetaDaylight.warmthName(col.kelvin)}`;
  return `${lv}%`;
}

// A colour lamp showing a colour (not a white) is drawn in that colour; everything else lit is copper.
export function lampHex(c, d) {
  const col = (c.S.states[d.device_id] || {}).color;
  return d.color && col && col.mode === 'xy' && col.hex ? col.hex : null;
}

// The connector says when a timer ends in epoch seconds.
export const endsMs = e => (typeof e === 'number' && e < 1e12 ? e * 1000 : new Date(e).getTime());
function minutesLeft(endsAt) { return Math.max(1, Math.round((endsMs(endsAt) - Date.now()) / 60000)); }
function timerFor(c, id) {
  for (const [t, v] of Object.entries(c.S.timers || {})) {
    if (!v || !v.ends_at) continue;
    const target = typeof t === 'string' && t.includes('|') ? t.split('|') : t;
    if (c.data.targetDevices(target).includes(id)) return v;
  }
  return null;
}

// A device tile: 180 in a room's grid or Home's Pinned grid (the width comes from the grid it is in), 168 in a sideways
// strip.
export function tile(c, d) {
  const { icon, esc } = c;
  const id = d.device_id;
  const on = c.data.isOn(id);
  const lv = c.data.level(id);
  const gone = d.domain === 'light' && lv == null;
  const hex = on ? lampHex(c, d) : null;
  const lit = on && d.domain !== 'fan' && d.domain !== 'cover';
  const cls = ['tile', lit ? 'on' : '', hex ? 'tinted' : '', gone ? 'gone' : '', d.domain, on && d.domain === 'fan' ? 'running' : ''].filter(Boolean).join(' ');
  const style = hex ? ` style="${c.lampTint(hex)}"` : '';
  const art = `<img class="art" src="${c.artSrc(c.deviceArt(c, d))}" alt="">`;
  let lead, extra = '';
  if (d.domain === 'fan') {
    // the power circle becomes a fan: the dots say the speed
    lead = `<button class="pwr ic-circle" data-act="toggle" data-id="${esc(id)}" aria-label="${on ? 'Turn off' : 'Turn on'} ${esc(d.name)}">${icon('fan', 22, 1.7)}</button>`;
    const n = on ? Math.max(2, FAN_SPEEDS.indexOf((c.S.states[id] || {}).fan_speed) + 1) : 1;
    extra = `<span class="speed" aria-hidden="true">${FAN_SPEEDS.map((_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  } else if (d.domain === 'cover') {
    lead = `<span class="pwr ic-circle">${icon('shade', 22, 1.7)}</span>`;
    // the bar hangs from the top: how much of the window the shade covers
    extra = `<span class="shade-bar" aria-hidden="true"><i style="height:${Math.round(100 - (lv || 0))}%"></i></span>`;
  } else {
    lead = `<button class="pwr" data-act="toggle" data-id="${esc(id)}" aria-label="${on ? 'Turn off' : 'Turn on'} ${esc(d.name)}">${icon('power', 22, 2)}</button>`;
  }
  const t = lit ? timerFor(c, id) : null;
  const timer = t ? `<span class="tile-timer">${icon('timer', 14, 1.8)}${minutesLeft(t.ends_at)} min</span>` : '';
  return `<div class="${cls}"${style} data-go="light/${esc(id)}" role="link" aria-label="${esc(d.name)}" data-xf>
    ${lead}${d.domain === 'fan' || d.domain === 'cover' ? '' : art}${extra}${timer}
    <span class="nm">${esc(d.name)}</span><span class="vl">${esc(valueLine(c, d))}</span></div>`;
}

// The three dots on a scene chip: the colours of the scene's brightest three lights. A light the scene gives a
// colour shows that colour; a white shows copper by how bright it is.
const COPPER_BY_LEVEL = lv => (lv >= 70 ? '#E6A06A' : lv >= 35 ? '#C7703D' : '#F3D9C3');
function sceneDots(levels) {
  const entries = Object.values(levels || {}).map(v => (typeof v === 'object' && v ? v : { level: typeof v === 'number' ? v : v && v !== 'Off' ? 100 : 0 }))
    .filter(v => (Number(v.level) || 0) > 0).sort((a, b) => b.level - a.level).slice(0, 3);
  const cols = entries.map(v => v.hex || COPPER_BY_LEVEL(Number(v.level) || 0));
  while (cols.length && cols.length < 3) cols.push(cols[cols.length - 1]);
  return cols.length ? `<span class="chip-dots">${cols.map(h => `<i style="background:${h}"></i>`).join('')}</span>` : '';
}
// A scene chip: a pinned scene on Home. Lutron's own scenes run the same way and carry no colours of their own.
export function sceneChip(c, t, name, levels) {
  return `<button class="chip scene" data-act="scene" data-t="${c.esc(t)}">${sceneDots(levels)}${c.esc(name)}</button>`;
}

// A room's status line, in numbers: "3 on · 62%" (the mean of what is on), "62%" for a room of one light, "Off", or
// "No lights yet".
export function roomStatus(c, aid) {
  const ls = c.H.roomLights(aid);
  if (!ls.length) return 'No lights yet';
  const lit = ls.filter(d => (c.data.level(d.device_id) || 0) > 0);
  if (!lit.length) return 'Off';
  const mean = Math.round(lit.reduce((a, d) => a + (c.data.level(d.device_id) || 0), 0) / lit.length);
  return ls.length === 1 ? `${mean}%` : `${lit.length} on · ${mean}%`;
}

// A room's picture: its photograph, or until it has one, its illustration (roomscene.js), a drawing of a room of its
// kind whose lamps are its own lights, lit as they are. `where` is 'card' (the Rooms tab's 372 x 180 card, which
// shows the middle of the room page's picture), 'page' (the room page's 300 tall hero) or 'home' (Home's 200 x 132
// card, the whole scene scaled down). A photograph still wins, and "Add a photo" stays on the room page and in setup.
export function roomPicture(c, aid, name, where) {
  const src = c.H.roomPhotoURL(aid);
  if (src) return `<img class="room-photo" src="${c.esc(src)}" alt="" decoding="async">`;
  return roomScene(c, aid, where === 'home' ? 'thumb' : 'page');
}

// ---------- pinned to Home ----------
// The pin on a light's page and a room's page: the header circle beside the ⋯. Its glyph is filled while the thing is
// pinned and an outline while it is not, and it says which in words for a screen reader (aria-pressed). A tap pins or
// unpins at once (app.js, the shared 'pin'); the pin itself is the answer, so nothing else says so.
export function pinButton(c, key, name) {
  const on = c.H.isPinned(key);
  return `<button class="hdr-btn a2 pin ${on ? 'pinned' : ''}" data-act="pin" data-key="${c.esc(key)}" aria-pressed="${on}" aria-label="${on ? `${c.esc(name)} is pinned to Home` : `Pin ${c.esc(name)} to Home`}">${c.icon('pin', 24, 1.7)}</button>`;
}

// A pinned room on Home: a card the size of a tile, in the same grid. Its picture (the photograph, or the drawing of
// the room with its own lamps lit as they are), its name and how much is on, and a power circle that switches the
// room on or off (rooms.js roomPower, the Rooms card's own). A tap on the card opens the room.
export function pinRoomCard(c, a) {
  const { esc, icon, H, data } = c;
  const lit = H.roomLights(a.id).some(d => (data.level(d.device_id) || 0) > 0);
  const photo = !!H.roomPhotoURL(a.id);
  const canToggle = data.controllable().some(d => data.devArea(d) === a.id && d.domain !== 'cover');
  return `<div class="pin-room ${photo ? 'photo' : 'scene'} ${lit ? 'lit' : ''}" data-go="room/${esc(a.id)}" role="link" aria-label="${esc(a.name)}" data-xf>
    ${roomPicture(c, a.id, a.name, 'home')}
    ${canToggle ? `<button class="pwr" data-act="room-toggle" data-id="${esc(a.id)}" aria-label="${lit ? 'Turn off' : 'Turn on'} ${esc(a.name)}">${icon('power', 22, 2)}</button>` : ''}
    <span class="nm">${esc(a.name)}</span><span class="vl">${esc(roomStatus(c, a.id))}</span></div>`;
}

// The offline card, after ten quiet seconds. v7: the card says which link is out in one calm sentence (conn.js, 18 · Offline, calmly).
export { offlineCard } from '/ui/screens/conn.js';
