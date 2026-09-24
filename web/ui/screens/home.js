// 02 · Home. The whole house, what is pinned (lights, rooms, scenes), the rooms. Read from the Figma frame (12732:48971).
// Under the rooms: what is coming up within the hour, and the one suggestion or problem (next.js). The dot beside
// the greeting, and the offline card, open the connection sheet (conn.js).
//
// v7 (design-v7-ui.md 1 and 10, frames 12814:126, 12817:96, 12817:49280): behind the header lies the house's own
// light, one pool per lit room, and holding Goodnight puts the page to sleep room by room with the house.
import { track } from '/ui/gesture.js';
import { glowHTML } from '/ui/glow.js';
import { reduced } from '/ui/motion.js';
import { sceneChip, roomStatus, roomPicture, offlineCard } from '/ui/screens/parts.js';
import { pinnedHTML, wirePins, pinActions, pinsLeave } from '/ui/pins.js';
import { homeCards, greetingSheet, shouldGreet, nextActions } from '/ui/screens/next.js';
import { connActions } from '/ui/screens/conn.js';

// ---------- the light a room gives off ----------
// A white lamp by its kelvin, a colour lamp by its colour, a Caseta dimmer (which has no colour) as copper: 2200K is
// the ramp's copper stop. A white lamp with no colour reported yet is its bulb's usual 2700K.
const COPPER_K = 2200;
const kelvinOf = (d, col) => (col && col.mode === 'ct' && col.kelvin ? col.kelvin : d.ct || d.color ? 2700 : COPPER_K);
// What a room's lights add up to: its mean level over what is lit, its whites mixed in mireds (weighted by level, the
// way two lamps on one wall mix), and its brightest colour lamp, which the lighting system draws as its own smaller
// pool beside the white one. Null when nothing in it is on.
export function roomLight(c, aid) {
  const lit = c.H.roomLights(aid).filter(d => (c.data.level(d.device_id) || 0) > 0);
  if (!lit.length) return null;
  let w = 0, mired = 0, colour = null, sum = 0;
  for (const d of lit) {
    const lv = c.data.level(d.device_id) || 0; sum += lv;
    const col = (c.S.states[d.device_id] || {}).color;
    if (d.color && col && col.mode === 'xy' && col.hex) { if (!colour || lv > colour.level) colour = { hex: col.hex, level: lv }; continue; }
    w += lv; mired += lv * 1e6 / kelvinOf(d, col);
  }
  return { level: Math.round(sum / lit.length), kelvin: w ? Math.round(1e6 / (mired / w)) : null, colour };
}
// Night hours, the same test the app's night look uses: the field caps itself so the phone is never the brightest
// thing in a dark room.
export function nightNow(c) {
  const s = c.S.config.settings || {};
  const hm = c.RT.nowHm(), ns = s.night_start, ne = s.night_end;
  if (!ns || !ne) return false;
  return ns < ne ? hm >= ns && hm < ne : hm >= ns || hm < ne;
}

// ---------- the field ----------
// The constellation: where each room's pool sits, in the 412 frame, by its place in the Rooms tab, so a person
// learns "the left glow is the kitchen" without being told. A seventh room reuses the slots at 0.8 of the size.
const SLOTS = [[104, 64], [330, 40], [230, 180], [40, 220], [380, 240], [150, 300]];
// Each pool wanders its own few pixels on the ambient 8 s (the file's 6,-4 · -5,3 · 4,-3), half of them a half
// beat behind, so the field drifts rather than pulsing together. It never breathes: breathing means waiting.
const DRIFT = [[6, -4], [-5, 3], [4, -3], [-4, -3], [5, 4], [-6, 2]];
// The last light each room gave off, so a room going out fades and shrinks from what it was, not from nothing.
const lastLight = new Map();

function pool(c, key, i, L, { accent = false, night = false } = {}) {
  const [sx, sy] = SLOTS[i % 6], [dx, dy] = DRIFT[i % 6];
  const k = (i >= 6 ? 0.8 : 1) * (accent ? 0.6 : 1);
  // a colour lamp's pool sits below and to the right of its room's white one (the file's accent at 176, 140)
  const x = `calc(${(sx / 412 * 100).toFixed(2)}% + ${accent ? 72 : 0}px)`, y = sy + (accent ? 76 : 0);
  const on = !!L;
  const was = lastLight.get(key);
  if (on) lastLight.set(key, L);
  const spec = L || was || { level: 1, kelvin: COPPER_K };
  // the night look caps the field at half: glowSpec's night is 0.7 already, the gain takes it the rest of the way
  const g = glowHTML({ level: spec.level, kelvin: spec.kelvin, hex: spec.hex, ctx: 'pool', x: 0, y: 0, night, gain: night ? 0.72 : 1, cls: on ? '' : 'off' });
  return `<span class="hl-pool${accent ? ' acc' : ''}" style="left:${x};top:${y}px;--k:${k};--dx:${dx}px;--dy:${dy}px;--ph:${i % 2 ? -4 : 0}s">${g}</span>`;
}
// One pool per room in the Rooms tab's order, lit or not, so a pool keeps its place from one redraw to the next and
// what changes is only its light (0.85 to 1 and 0 to 1 on the dimmer, as every light does). Above five lit rooms
// the five brightest keep their pools and the rest fold into a faint copper haze: the header never turns into a
// rainbow. With nothing on, nothing is drawn at all: the darkness is the information.
function houseLight(c, rooms) {
  const night = nightNow(c);
  const gn = c.ui.gn && c.ui.gn.active ? c.ui.gn : null;
  const lights = rooms.map(a => {
    // While Goodnight is putting the page to sleep, a room keeps the light it had until its turn to go out.
    if (gn) { const g = gn.rooms.find(r => r.aid === a.id); if (g && performance.now() < gn.t0 + g.at) return g.L; }
    return roomLight(c, a.id);
  });
  const ranked = lights.map((L, i) => [L ? L.level : -1, i]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]);
  const shown = new Set(ranked.slice(0, 5).map(x => x[1]));
  const haze = ranked.length > 5;
  if (!ranked.length && !rooms.some(a => lastLight.has(a.id))) return '';
  const out = rooms.map((a, i) => {
    const L = shown.has(i) ? lights[i] : null;
    const white = L && L.kelvin ? { level: L.level, kelvin: L.kelvin } : null;
    const col = L && L.colour ? { level: L.colour.level, hex: L.colour.hex } : null;
    return pool(c, a.id, i, white, { night }) + pool(c, a.id + '#c', i, col, { accent: true, night });
  }).join('');
  return `<div class="house-light" aria-hidden="true">${out}<span class="hl-haze${haze ? ' on' : ''}"></span></div>`;
}

// Where the lights that are on are: "Office", "Office and Kitchen", "3 rooms".
function litWhere(c, lit) {
  const names = [...new Set(lit.map(d => c.data.devAreaName(d)).filter(Boolean))];
  if (!names.length) return '';
  return names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} rooms`;
}
// What "All on" will do to brightness right now: the evening's level while the wind-down holds lights down.
function allOnLevel(c) {
  const base = Number(c.S.config.settings.group_on_level) || 100;
  const cl = c.RT.curveLevelNow();
  return cl != null && cl < base ? cl : null;
}

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

  const favScenes = (S.config.favorites || []).filter(t => t.startsWith('p:') || t.startsWith('s:')).map(t => {
    if (t.startsWith('p:')) { const p = data.presets().find(x => x.id === t.slice(2)); return p ? sceneChip(c, t, H.sceneShortName(p) === p.name ? p.name : p.name, p.levels) : ''; }
    const s = (S.inv.scenes || {})[t.slice(2)]; return s ? sceneChip(c, t, s.name, null) : '';
  }).filter(Boolean);
  const rooms = data.areas().filter(a => H.roomLights(a.id).length || data.controllable().some(d => data.devArea(d) === a.id));

  return `<div class="home">
    ${empty ? '' : houseLight(c, rooms.filter(a => H.roomLights(a.id).length))}
    <header class="home-head bar">
      <button class="greet ${st === 'off' ? 'off' : ''}" data-act="conn-open" aria-label="Connection" data-xf="standard">${greet}</button>
      <h1 class="t-h1 bar-t">${esc(name)}</h1>
      <button class="hdr-btn a1" data-go="activity" aria-label="Recent activity">${icon('clock', 20, 1.7)}</button>
    </header>
    ${st === 'off' ? offlineCard(c) : ''}
    ${empty ? `<div class="connect-card"><span class="ic-c">${icon('wifi', 22, 1.6)}</span><p class="t-row">Let's connect your home</p><p class="t-cap muted">A small helper program on a computer in your house links this app to your Lutron bridge. About ten minutes, once.</p><button class="pill blue" data-go="settings/how">Show me how</button></div>` : ''}

    <section class="card house ${lit.length ? 'lit' : ''}">
      <div class="t-over">Whole house</div>
      <div class="house-head"><span class="hh-w" data-xf="standard">${lit.length ? `${lit.length} on ·` : 'All off'}</span>${lit.length ? ` <span data-hlv>${lv}</span>%` : ''}</div>
      ${lit.length ? `<div class="hbar ${lv >= 30 ? '' : 'low'}" data-drag="house" style="--pct:${lv}%" role="slider" aria-label="Brightness of the lights that are on" aria-valuemin="1" aria-valuemax="100" aria-valuenow="${lv}">
        <span class="fill"></span>
        <span class="lo">${icon('sun', 22, 1.8)}</span>
        <span class="hi">${icon('sun', 26, 1.6)}</span>
        <span class="knob"></span>
      </div>` : ''}
      ${houseCaption(c, lit)}
      ${housePills(c, lit)}
      <div class="goodnight">
        <button class="hold" data-hold="goodnight" data-ms="1000" aria-label="Goodnight house, hold to turn everything off">
          <svg class="ring" width="44" height="44" viewBox="0 0 44 44"><circle class="trk" cx="22" cy="22" r="20.5"/><circle class="arc" cx="22" cy="22" r="20.5"/></svg>
          ${icon('moon', 20, 1.7)}
        </button>
        <div><div class="t-row">Goodnight house</div><div class="t-cap muted">Hold to turn everything off</div></div>
      </div>
    </section>

    ${empty ? '' : pinnedHTML(c)}
    ${favScenes.length ? `<div class="chip-row" data-keep="scenes">${favScenes.join('')}<button class="chip more" data-go="scenes">All scenes</button></div>` : ''}

    ${rooms.length ? `<div class="t-over sec">Rooms</div><div class="tile-strip rooms" data-keep="rooms">${rooms.map(a => `
      <button class="room-card" data-go="room/${esc(a.id)}" data-xf>
        ${roomPicture(c, a.id, a.name, 'home')}
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
  wirePins(c, root);
  const bar = root.querySelector('[data-drag="house"]');
  countTo(c, root.querySelector('[data-hlv]'));
  if (!bar) return;
  const set = x => {
    const b = bar.getBoundingClientRect();
    // The knob sits inside the end of the fill (its centre 28 short of it), so the finger is kept on the knob:
    // the fill ends 28 past the finger. Left of where the knob stops, the level keeps going down to 1.
    const v = Math.max(1, Math.min(100, Math.round((x - b.left + 28) / b.width * 100)));
    bar.style.setProperty('--pct', v + '%');
    // the sun at the dim end steps aside when the knob comes over it
    bar.classList.toggle('low', v / 100 * b.width < 100);
    bar.setAttribute('aria-valuenow', v);
    // the number above counts with the finger
    cancelAnimationFrame(counting);
    const n = document.querySelector('[data-hlv]'); if (n) n.textContent = v;
    shownHouse = v;
    const ids = c.H.houseLevelTargets(); if (!ids.length) return;
    c.assume(ids, v, { held: true });
    c.gate.sendLevel(ids.map(id => `d:${id}`), v);
  };
  // a sideways drag only: a finger passing over it on the way up or down the page scrolls the page (gesture.js)
  track(bar, { c, axis: 'x', start: () => bar.classList.add('held'), move: e => set(e.clientX) });
}

// The house level counts to where it is, never fades from one number to the next: with the finger as it drags
// (set() writes it), and when the house changes by itself (a scene, the bridge settling a light) it counts there
// over the dimmer's 0.4 s, or the scene's 1.0 s while a scene arrives.
let shownHouse = null, counting = 0;
const easeInOut = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function countTo(c, el) {
  cancelAnimationFrame(counting);
  if (!el) { shownHouse = null; return; }
  const to = Number(el.textContent) || 0;
  const from = shownHouse;
  shownHouse = to;
  if (from == null || from === to || c.ui.dragging || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const ms = document.body.classList.contains('scene-arriving') ? 1000 : 400;
  const t0 = performance.now();
  el.textContent = from; shownHouse = from;
  const step = now => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - t0) / ms);
    const v = Math.round(from + (to - from) * easeInOut(t));
    el.textContent = v; shownHouse = v;
    if (t < 1) counting = requestAnimationFrame(step);
  };
  counting = requestAnimationFrame(step);
}

// Leaving Home forgets the number shown, so coming back does not count from an old one, and ends editing the pins.
export function leave(c) { cancelAnimationFrame(counting); shownHouse = null; pinsLeave(c); }

// Under the bar: which lights it moves, by name. A tap on the held button borrows this line to say to hold it.
function houseCaption(c, lit) {
  const hint = c.ui.houseHint && Date.now() - c.ui.houseHint < 2500;
  if (hint) return `<p class="house-cap hint">${lit.length ? 'Hold All on to light the whole house' : 'Hold to bring the lights back on'}</p>`;
  if (!lit.length) return '<p class="house-cap">Nothing is on right now</p>';
  const where = litWhere(c, lit);
  return `<p class="house-cap">Adjusts the ${lit.length === 1 ? 'light' : `${lit.length} lights`} on${where ? ` in ${c.esc(where)}` : ''}</p>`;
}
// Turning lights off is a tap. Turning the whole house on is a hold (0.6 s, the pill filling with copper as it is
// held), so a thumb brushing it at night does nothing; a tap only says to hold it. Neither pill is lit to show a
// state: the headline says what is on.
function housePills(c, lit) {
  const { icon, H } = c;
  const lvl = allOnLevel(c);
  const onLabel = `${H.houseOnLabel()}${lvl != null && lit.length ? ` · ${lvl}%` : ''}`;
  const on = `<button class="pill ghost hold-pill" data-hold="house-on" data-ms="600" data-act="house-on-hint" aria-label="${c.esc(onLabel)}, hold to turn on">${icon('power', 20, 1.9)}<span>${c.esc(onLabel)}</span></button>`;
  if (!lit.length) return `<div class="house-pills one">${on}</div>`;
  return `<div class="house-pills">
    <button class="pill solid" data-act="house-off">${icon('power', 20, 1.9)}All off</button>
    ${on}
  </div>`;
}

export const actions = {
  ...nextActions,
  ...connActions,
  ...pinActions,
  // The house on, held: every light when something is already on; from dark, what was on before (the connector
  // remembers) or every light, as Settings says.
  'house-on'(c) { c.ui.houseHint = 0; c.run(c.H.houseOnAction()); },
  // a tap on the held button: nothing turns on, the line under the bar says to hold it
  'house-on-hint'(c) { c.ui.houseHint = Date.now(); c.render(); setTimeout(() => c.render(), 2600); },
  // The house off. If an automation is holding some of what is on, ask first rather than fight it every time.
  // All off turns everything off, at once, every time. It is always sent, whatever this phone believes is lit (a
  // light the app last heard as off may be on), and it no longer stops to ask about lights a routine turned on: the
  // owner's rule is that off really means off. The connector makes sure of it (engine.py, "off means off").
  'house-off'(c) {
    const lit = c.H.litLights().map(d => d.device_id);
    c.assume(lit, 0); c.soon();
    c.run({ type: 'level', target: 'h:all', level: 'off' });
  },
  // Goodnight house, held for a second: every light off, the shades closed, the fans stopped. Then the page goes to
  // sleep with the house (goodnightDark). Offline, nothing went dark, so nothing on the page does either.
  async goodnight(c) {
    if (c.conn() === 'off') { c.toast("The house didn't hear that. Your remotes still work.", { err: true }); return; }
    const acts = c.H.goodnightActions();
    const rooms = c.data.areas().map(a => ({ aid: a.id, L: roomLight(c, a.id) })).filter(r => r.L);
    c.assume(c.H.litLights().map(d => d.device_id), 0);
    goodnightDark(c, rooms, acts);
    c.soon();
    await c.run(acts[0]);
    for (const a of acts.slice(1)) c.run(a);
  },
  // A light that stayed on through Goodnight: a tap turns it off.
  'gn-off'(c, el) {
    const ids = (el.dataset.ids || '').split(',').filter(Boolean); if (!ids.length) return;
    c.assume(ids, 0); c.soon();
    c.run({ type: 'level', target: ids.map(id => `d:${id}`), level: 'off' });
    el.closest('.gn-stay')?.remove();
  },
  'what-now'(c) { connActions['conn-open'](c); },
};

// ---------- Goodnight: the page goes to sleep with the house ----------
// The file's timeline (12817:49280), from the moment the hold completes:
//   each lit room's pool goes out on the dimmer, in the Rooms tab's order, 0.24 s apart, the first 0.1 s in
//   0.22 s after the last is out, the night veil closes over everything on the night fade (1.6 s) to 0.97
//   a light kept on for the way to bed glows alone on it, its two minutes counting round a thin ring
//   then a faint moon on the night fade; "Sleep well" rises 12 over 0.32 s standard 0.4 s into it, what the fans
//   and shades did 0.5 s after that, and "Goodnight · Put back" stays 8 s
//   3 s after "Sleep well" the page settles into Nightstand in the night hours, or lifts back to Home (0.4 s EASE_IN)
// A tap anywhere skips to the end. Nothing cancels Goodnight: it has happened by the time the page dims.
const GAP = 240, FIRST = 100, DIMMER = 400, FADE = 1600, SETTLE = 3000;
const STD = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
let gn = null;
const later = (fn, ms) => { if (gn) gn.timers.push(setTimeout(fn, ms)); };
const fade = (el, to, ms, easing = 'ease-in-out', delay = 0) => {
  if (!el) return;
  const from = getComputedStyle(el).opacity;
  el.animate([{ opacity: from }, { opacity: to }], { duration: reduced() ? Math.min(ms, 240) : ms, easing, delay, fill: 'forwards' });
};
const rise = el => {
  if (!el) return;
  if (reduced()) { fade(el, 1, 240, STD); return; }
  el.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 320, easing: STD, fill: 'forwards' });
};
const names = ds => { const n = ds.map(d => d.name); return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`; };

function goodnightDark(c, rooms, acts) {
  gnEnd(c, { quick: true });
  rooms.forEach((r, i) => { r.at = FIRST + i * GAP; });
  const t0 = performance.now();
  c.ui.gn = { active: true, t0, rooms };
  const el = document.createElement('div');
  el.className = 'gn-night';
  el.setAttribute('role', 'status');
  const extras = [acts.some(a => a.type === 'fan') ? 'Fans stopped' : '', acts.some(a => a.type === 'lower') ? 'Shades closed' : ''].filter(Boolean).join(' · ');
  el.innerHTML = `<span class="gn-veil"></span>
    <div class="gn-route"></div>
    <div class="gn-moon">${glowHTML({ level: 100, kelvin: 6500, ctx: 'tile', gain: 0.19, cls: 'gn-moon-glow' })}${c.icon('moon', 24, 1.6)}</div>
    <p class="gn-sleep">Sleep well</p>
    ${extras ? `<p class="gn-extras">${extras}</p>` : ''}
    <div class="gn-stay"></div>`;
  document.body.appendChild(el);
  gn = { el, c, timers: [], ended: false, toasted: false };
  // a tap during it only skips to the end; a button inside it (Turn off) is its own
  el.addEventListener('click', e => { if (!e.target.closest('[data-act]')) gnSkip(); });
  // each room's turn: the Home view draws its pool from the light it had until then, and redraws as each goes out
  rooms.forEach(r => later(() => c.render(), r.at + 10));
  const out = rooms.length ? FIRST + (rooms.length - 1) * GAP + DIMMER : 0;
  const veilAt = out + (rooms.length ? 220 : 0);
  later(() => gnVeil(), veilAt);
}
// The veil closes; a light that stays for the way to bed glows alone on it, its timer running down round the ring.
function gnVeil() {
  if (!gn) return;
  const { el, c } = gn;
  fade(el.querySelector('.gn-veil'), 0.97, FADE);
  const kept = c.H.litLights().filter(d => c.H.timerOn(d.device_id));
  let moonAt = FADE;
  if (kept.length) {
    const d = kept[0];
    const col = (c.S.states[d.device_id] || {}).color;
    const lv = c.data.level(d.device_id) || 10;
    const route = el.querySelector('.gn-route');
    const left = timerLeft(c, d.device_id);
    route.innerHTML = `${glowHTML({ level: lv, kelvin: kelvinOf(d, col), hex: d.color && col && col.mode === 'xy' ? col.hex : undefined, ctx: 'widget', cls: 'gn-route-glow' })}
      <i class="gn-bead"></i>
      <svg class="gn-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" pathLength="1" style="animation-duration:${Math.max(1, left)}ms"></circle></svg>
      <p class="gn-kept">${c.esc(names(kept))} ${kept.length === 1 ? 'stays' : 'stay'} dim for two minutes</p>`;
    fade(route, 1, FADE);
    // the file lets it glow alone a little under two seconds past the veil, then gives way to the moon
    later(() => fade(route, 0, 800), FADE + 1800);
    moonAt = FADE + 2000;
  }
  later(() => gnMoon(), moonAt);
}
function timerLeft(c, id) {
  for (const [t, v] of Object.entries(c.S.timers || {})) {
    if (!v || !v.ends_at) continue;
    const target = typeof t === 'string' && t.includes('|') ? t.split('|') : t;
    if (!c.data.targetDevices(target).includes(id)) continue;
    const ms = typeof v.ends_at === 'number' && v.ends_at < 1e12 ? v.ends_at * 1000 : new Date(v.ends_at).getTime();
    return Math.max(0, ms - Date.now());
  }
  return 120000;
}
// The moon, "Sleep well", and what else happened; a light that did not answer stays lit on the page, truthfully.
function gnMoon() {
  if (!gn || gn.moon) return;
  gn.moon = true;
  const { el, c } = gn;
  fade(el.querySelector('.gn-moon'), 1, FADE);
  later(() => gnSleep(), reduced() ? 0 : 400);
}
function gnSleep() {
  if (!gn || gn.sleep) return;
  gn.sleep = true;
  const { el, c } = gn;
  rise(el.querySelector('.gn-sleep'));
  const ex = el.querySelector('.gn-extras'); if (ex) later(() => fade(ex, 1, 320, STD), 500);
  const stayed = c.H.litLights().filter(d => !c.H.timerOn(d.device_id));
  if (stayed.length) {
    const s = el.querySelector('.gn-stay');
    s.innerHTML = `<span>${c.esc(names(stayed))} stayed on</span><button class="link" data-act="gn-off" data-ids="${c.esc(stayed.map(d => d.device_id).join(','))}">Turn off</button>`;
    later(() => fade(s, 1, 320, STD), 500);
  }
  gnToast(c);
  later(() => gnEnd(c), SETTLE);
}
function gnToast(c) {
  if (!gn || gn.toasted) return;
  gn.toasted = true;
  c.toast('Goodnight', { undo: () => putBack(c), undoLabel: 'Put back', ms: 8000 });
}
// Put back: what was on comes back as it was (the connector keeps how each light was when it went dark).
async function putBack(c) { gnEnd(c, { quick: true }); await c.run({ type: 'restore', target: 'h:all' }); }
// A tap during the dark-out: straight to the end state.
function gnSkip() {
  if (!gn) return;
  const { el, c } = gn;
  if (gn.sleep) { gnEnd(c); return; }
  for (const t of gn.timers) clearTimeout(t);
  gn.timers = [];
  if (c.ui.gn) c.ui.gn.rooms.forEach(r => { r.at = -1; });
  c.render();
  fade(el.querySelector('.gn-veil'), 0.97, 240, STD);
  fade(el.querySelector('.gn-route'), 0, 240, STD);
  fade(el.querySelector('.gn-moon'), 1, 240, STD);
  gn.moon = true;
  gnSleep();
}
// Settle: into Nightstand in the night hours when it is built, else back to Home; the veil lifts in 0.4 s EASE_IN.
function gnEnd(c, { quick = false } = {}) {
  const g = gn; gn = null;
  if (c.ui.gn) c.ui.gn = null;
  if (!g) return;
  for (const t of g.timers) clearTimeout(t);
  if (!quick && nightNow(c) && c.has && c.has('nightstand')) c.go('nightstand');
  else c.render();
  const el = g.el;
  if (!el.isConnected) return;
  el.style.pointerEvents = 'none';
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: quick || reduced() ? 240 : 400, easing: 'ease-in', fill: 'forwards' })
    .finished.catch(() => {}).then(() => el.remove());
}

