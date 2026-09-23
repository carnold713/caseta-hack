// 02 · Home. The whole house, the starred lights and scenes, the rooms. Read from the Figma frame (12732:48971).
// Under the rooms: what is coming up within the hour, and the one suggestion or problem (next.js). The dot beside
// the greeting, and the offline card, open the connection sheet (conn.js).
import { track } from '/ui/gesture.js';
import { tile, sceneChip, roomStatus, roomPicture, offlineCard } from '/ui/screens/parts.js';
import { homeCards, greetingSheet, shouldGreet, nextActions } from '/ui/screens/next.js';
import { connActions } from '/ui/screens/conn.js';

function greeting(c) {
  const h = c.DAY.homeNow().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function view(c) {
  const { S, H, data, icon, esc } = c;
  const st = c.conn();
  const lit = H.litLights();
  const lv = H.houseLevel();
  const name = (S.config.settings.home_name || 'Home');
  // connected: nothing. The first ten seconds of a drop: a grey breathing dot after the greeting. After that: a red
  // dot and "Offline · showing last known state" in its place, and a card that says what to do.
  const greet = st === 'off'
    ? `<span class="conn-dot lost"></span>Offline · showing last known state`
    : `${esc(greeting(c))}${st === 'reconnecting' ? '<span class="conn-dot" aria-label="Reconnecting"></span>' : ''}`;
  const empty = !data.devices().length;

  const starred = H.rowLights();
  const favScenes = (S.config.favorites || []).filter(t => t.startsWith('p:') || t.startsWith('s:')).map(t => {
    if (t.startsWith('p:')) { const p = data.presets().find(x => x.id === t.slice(2)); return p ? sceneChip(c, t, H.sceneShortName(p) === p.name ? p.name : p.name, p.levels) : ''; }
    const s = (S.inv.scenes || {})[t.slice(2)]; return s ? sceneChip(c, t, s.name, null) : '';
  }).filter(Boolean);
  const rooms = data.areas().filter(a => H.roomLights(a.id).length || data.controllable().some(d => data.devArea(d) === a.id));

  return `<div class="home">
    <header class="home-head">
      <button class="greet ${st === 'off' ? 'off' : ''}" data-act="conn-open" aria-label="Connection" data-xf="standard">${greet}</button>
      <h1 class="t-h1">${esc(name)}</h1>
      <button class="hdr-btn a2" data-go="activity" aria-label="Recent activity">${icon('clock', 20, 1.7)}</button>
      <button class="hdr-btn a1" data-go="settings" aria-label="Settings">${icon('gear', 20, 1.7)}</button>
    </header>
    ${st === 'off' ? offlineCard(c) : ''}
    ${empty ? `<div class="connect-card"><span class="ic-c">${icon('wifi', 22, 1.6)}</span><p class="t-row">Let's connect your home</p><p class="t-cap muted">A small helper program on a computer in your house links this app to your Lutron bridge. About ten minutes, once.</p><button class="pill blue" data-go="settings/how">Show me how</button></div>` : ''}

    <section class="card house ${lit.length ? 'lit' : ''}">
      <div class="t-over">Whole house</div>
      <div class="house-head" data-xf>${lit.length ? `${lit.length} on · ${lv}%` : 'Everything is off'}</div>
      <div class="hbar ${lit.length && lv >= 30 ? '' : 'low'}" data-drag="house" style="--pct:${lit.length ? lv : 0}%" role="slider" aria-label="House brightness" aria-valuemin="1" aria-valuemax="100" aria-valuenow="${lv}">
        <span class="fill"></span>
        <span class="lo">${icon('sun', 22, 1.8)}</span>
        <span class="hi">${icon('sun', 26, 1.6)}</span>
        <span class="knob"></span>
      </div>
      <p class="house-cap">${lit.length ? 'Adjusts lights that are on' : 'Slide to bring the lights up'}</p>
      <div class="house-pills">
        <button class="pill" data-act="house-on">${icon('power', 20, 1.9)}${H.houseOnLabel()}</button>
        <button class="pill ghost" data-act="house-off">${icon('power', 20, 1.9)}All off</button>
      </div>
      <div class="goodnight">
        <button class="hold" data-hold="goodnight" data-ms="1000" aria-label="Goodnight house, hold to turn everything off">
          <svg class="ring" width="44" height="44" viewBox="0 0 44 44"><circle class="trk" cx="22" cy="22" r="20.5"/><circle class="arc" cx="22" cy="22" r="20.5"/></svg>
          ${icon('moon', 20, 1.7)}
        </button>
        <div><div class="t-row">Goodnight house</div><div class="t-cap muted">Hold to turn everything off</div></div>
      </div>
    </section>

    ${starred.length ? `<div class="t-over sec">Starred</div><div class="tile-strip" data-keep="starred">${starred.map(d => tile(c, d)).join('')}</div>` : ''}
    ${favScenes.length ? `<div class="chip-row" data-keep="scenes">${favScenes.join('')}<button class="chip more" data-go="scenes">All scenes</button></div>` : ''}

    ${rooms.length ? `<div class="t-over sec">Rooms</div><div class="tile-strip rooms" data-keep="rooms">${rooms.map(a => `
      <button class="room-card" data-go="room/${esc(a.id)}" data-xf>
        ${roomPicture(c, a.id, a.name, false)}
        <span class="nm">${esc(a.name)}</span><span class="vl">${esc(roomStatus(c, a.id))}</span>
      </button>`).join('')}</div>` : ''}
    ${homeCards(c)}
  </div>`;
}

// The house brightness: a finger anywhere on the bar sets it, moving what is on (or, with nothing on, bringing every
// light up to that level). One command in flight, the newest value winning; nothing redraws until the finger lifts.
export function after(c, r, root) {
  // the first time this home connects, once: where would you like to start
  if (shouldGreet(c) && !c.ui.greeted && !document.querySelector('#sheet-root .sheet')) {
    c.ui.greeted = true;
    c.openSheet({ ...greetingSheet(c), key: 'greet', onClose: () => { c.S.config.settings.greeted = true; c.save('', { quiet: true }); } });
  }
  const bar = root.querySelector('[data-drag="house"]'); if (!bar) return;
  const set = x => {
    const b = bar.getBoundingClientRect();
    // The knob sits inside the end of the fill (its centre 28 short of it), so the finger is kept on the knob:
    // the fill ends 28 past the finger. Left of where the knob stops, the level keeps going down to 1.
    const v = Math.max(1, Math.min(100, Math.round((x - b.left + 28) / b.width * 100)));
    bar.style.setProperty('--pct', v + '%');
    // the sun at the dim end steps aside when the knob comes over it
    bar.classList.toggle('low', v / 100 * b.width < 100);
    bar.setAttribute('aria-valuenow', v);
    const ids = c.H.houseLevelTargets(); if (!ids.length) return;
    c.assume(ids, v, { held: true });
    c.gate.sendLevel(ids.map(id => `d:${id}`), v);
  };
  // a sideways drag only: a finger passing over it on the way up or down the page scrolls the page (gesture.js)
  track(bar, { c, axis: 'x', move: e => set(e.clientX) });
}

export const actions = {
  ...nextActions,
  ...connActions,
  // The house on: every light when something is already on; from dark, what was on before (the connector
  // remembers) or every light, as Settings says.
  'house-on'(c) { c.run(c.H.houseOnAction()); },
  // The house off. If an automation is holding some of what is on, ask first rather than fight it every time.
  'house-off'(c) {
    const lit = c.H.litLights().map(d => d.device_id);
    if (!lit.length) return;
    const auto = c.H.autoOnLights(lit);
    if (auto.length) { askAutomated(c, lit, auto); return; }
    c.assume(lit, 0); c.soon();
    c.run({ type: 'level', target: 'h:all', level: 'off' });
  },
  'poweroff-all'(c) { c.closeSheet(); const lit = c.H.litLights().map(d => d.device_id); c.assume(lit, 0); c.soon(); c.run({ type: 'level', target: 'h:all', level: 'off' }); },
  'poweroff-rest'(c, el) {
    c.closeSheet();
    const rest = (el.dataset.ids || '').split(',').filter(Boolean);
    if (!rest.length) return;
    c.assume(rest, 0); c.soon();
    c.run({ type: 'level', target: rest.map(id => `d:${id}`), level: 'off' });
  },
  // Goodnight house, held for a second: every light off, the shades closed, the fans stopped.
  async goodnight(c) {
    const acts = c.H.goodnightActions();
    c.assume(c.H.litLights().map(d => d.device_id), 0); c.soon();
    await c.run(acts[0]);
    for (const a of acts.slice(1)) c.run(a);
    c.toast(acts.some(a => a.type === 'lower') ? 'Everything off, shades closing' : 'Everything off');
  },
  'what-now'(c) { connActions['conn-open'](c); },
};

function askAutomated(c, lit, auto) {
  const names = auto.map(id => (c.data.dev(id) || {}).name).filter(Boolean);
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const one = names.length === 1;
  const rest = lit.filter(id => !auto.includes(id));
  c.openSheet({ over: 'Whole house', title: 'Some lights are on a routine', body: `
    <p class="t-body muted sheet-p">${c.esc(list)} ${one ? 'is' : 'are'} on a routine right now. Turn ${one ? 'it' : 'them'} off with everything else, or leave ${one ? 'it' : 'them'} on and turn off the rest of the house?</p>
    <div class="group">
      <button class="row" data-act="poweroff-all"><span class="row-txt"><span class="t">Turn off everything</span></span></button>
      <button class="row sub" data-act="poweroff-rest" data-ids="${c.esc(rest.join(','))}"><span class="row-txt"><span class="t">Leave ${one ? 'it' : 'them'} on</span><span class="d">${rest.length ? `${rest.length} other light${rest.length === 1 ? '' : 's'} turn off` : 'Nothing else is on'}</span></span></button>
    </div>` });
}
