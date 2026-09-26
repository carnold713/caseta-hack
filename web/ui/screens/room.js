// 03 · A room. Its photograph with the room's On and Off laid on it, its scenes, and every device in it as a tile.
// Read from the Figma frame (12733:20).
//
// v7 · 6, a scene arriving (12814:48798): a tapped chip lights first, then a ring of light leaves it and walks out
// across the page at the wave token (60 ms per 100 px). Each tile, and the photograph's light, crossfades when the
// ring reaches it or when its light's state arrives, whichever is later, so a slow bridge shows as a tile catching up
// and never as a lie. The count settles last, and the toast offers Put back.
import { tile, roomPicture, pinButton } from '/ui/screens/parts.js';
import { roomPower } from '/ui/screens/rooms.js';
import { sheets as setupSheets, actions as setupActions } from '/ui/screens/setup.js';
import { sceneSheet, actions as sceneActions, LIST_ACTS } from '/ui/screens/scenes.js';
import { glowHTML, whiteStops, isNight } from '/ui/glow.js';
import { roomTop } from '/ui/screens/home.js';
import { reduced } from '/ui/motion.js';
import { track } from '/ui/gesture.js';

// Room setup and the room's sleep timer are sheets over it (setup.js), and so is a scene's editor
// (#room/<id>/scene/<scene id>, the same sheet All scenes opens), so changing a scene never leaves the room.
export const sheets = setupSheets;
export function sheetFor(c, r) {
  if (!r.sub) return null;
  const m = /^scene\/(.+)$/.exec(r.sub);
  if (m) {
    const p = c.data.presets().find(x => x.id === m[1]);
    return p ? { spec: sceneSheet(c, p), parent: `room/${r.id}` } : null;
  }
  const make = setupSheets[r.sub];
  return make ? { spec: make(c, r), parent: `room/${r.id}` } : null;
}
// The scene sheet's own taps, told which scene from the room's address
const sceneRoute = r => ({ name: 'scenes', id: (/^scene\/(.+)$/.exec(r.sub || '') || [])[1] || null, parent: `room/${r.id}` });
const sheetActs = Object.fromEntries(Object.entries(sceneActions).filter(([k]) => !LIST_ACTS.includes(k))
  .map(([k, fn]) => [k, (c, el, r, v) => fn(c, el, sceneRoute(r), v)]));

// Fans and shades after the lights: a grid is never re-sorted by state, so a tile never moves under the thumb that
// just turned it on.
const DOMAIN_LAST = { light: 0, switch: 0, fan: 1, cover: 2 };
// The glyphs the file puts on a scene chip: Bright's sun and Night's moon. The others carry none.
const MOOD_GLYPH = { bright: 'sun', night: 'moon' };

// ---------- the wave ----------
// Times from the tap, read off the frame's keyframes: the press lands (tap, 0.12 s) and only then does the ring
// leave; it reaches a thing 0.6 ms per px away (the wave token); what it reaches crossfades over the scene's 1.0 s;
// the count settles over the standard 0.24 s once the last thing reached has arrived.
const T = { tap: 120, perPx: 0.6, scene: 1000, standard: 240, ring: 360 };
let wave = null;   // { kind: 'run'|'same', id, aid, t0, x, y, fade, countWas, tone, tSet }
const since = w => performance.now() - w.t0;
// How long a wave's markup stays drawn: the ring, the settle, and a long fade's progress line under the chip.
const lifeOf = w => (w.kind === 'same' ? 700 : Math.max(w.tSet || 1700, 1700));
function liveWave(aid) {
  const w = wave;
  if (!w || w.aid !== aid || reduced()) return null;
  return since(w) < lifeOf(w) ? w : null;
}
// A long fade keeps its chip lit, with a thin line under it, for as long as the scene takes to arrive.
const fading = (w, id) => !!(w && w.kind === 'run' && w.id === id && w.fade > 1 && since(w) < w.fade * 1000);

const levelOf = v => (typeof v === 'object' && v ? Number(v.level) || 0 : typeof v === 'number' ? v : v && v !== 'Off' ? 100 : 0);
// A long name steps down a size, then another, before it has to end in an ellipsis. On the owner's 412 the line, clear
// of the count, holds twelve or thirteen letters of Figtree at 40, thirteen or fourteen at 32 (a line cut 20 shorter for
// the pin) and fourteen to sixteen at 28: "Master bedroom" was cut at 40 and at 32, and is whole at 28. A small phone
// has less line and still cuts sooner.
const titleFit = name => (name.length > 13 ? 'fit2' : name.length > 12 ? 'fit1' : '');

// The warmest light a scene brings, which is the colour its ring of light carries: a scene with a colour lamp in it
// uses that lamp's colour, softer.
function sceneTone(c, p) {
  let k = null, hex = null;
  for (const [id, v] of Object.entries(p.levels || {})) {
    if (!levelOf(v) || !c.data.dev(id)) continue;
    if (v && typeof v === 'object') {
      if (v.hex && !hex) hex = v.hex;
      const kk = v.kelvin || (v.follow ? c.DAY.followKelvinFor(id) : null);
      if (kk && (k == null || kk < k)) k = kk;
    }
  }
  return hex ? { hex, soft: true } : { kelvin: k || 2200 };
}
const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
function toneCSS(t) { return t.hex ? rgba(t.hex, 0.10) : rgba(whiteStops(t.kelvin).body, 0.14); }

// The room's own light on its photograph: a faint warmth from its top as bright as the room, and a grey veil when
// everything is off (the lighting system's rule for a room photo). The page's one light is at the top of the screen
// (roomTop), so the photograph carries no glow of its own.
function roomLight(c, aid, lights) {
  const lit = lights.filter(d => (c.data.level(d.device_id) || 0) > 0);
  if (!lit.length) return `<span class="rp-light dark" data-xf aria-hidden="true"></span>`;
  const mean = Math.round(lit.reduce((a, d) => a + (c.data.level(d.device_id) || 0), 0) / lit.length);
  return `<span class="rp-light" data-xf style="--rl:${mean}" aria-hidden="true"></span>`;
}

// The room's brightness: Home's house bar (components.css .hbar), for this room, the full width of the page as Home's
// is. It moves the room's dimmable lights that are on, all to the one level, and with none on it brings them all up
// to where the finger is: a drag, never a tap, turns a room on. Its level is the mean of the lit ones, said once, in
// the count beside the title; with the room off the bar rests empty. A room with nothing to dim (only switches, a fan,
// a shade) has none.
const dimmable = (c, aid) => c.H.roomLights(aid).filter(d => d.domain === 'light');
function brightTargets(c, aid) {
  const ls = dimmable(c, aid).map(d => d.device_id);
  const lit = ls.filter(id => (c.data.level(id) || 0) > 0);
  return lit.length ? lit : ls;
}
function brightLevel(c, aid) {
  const lit = dimmable(c, aid).map(d => c.data.level(d.device_id) || 0).filter(v => v > 0);
  return lit.length ? Math.round(lit.reduce((a, v) => a + v, 0) / lit.length) : 0;
}
// Beside the title, how much is on and how bright, as the room's card on Rooms says it ("2 on · 70%"), and nothing
// once it is all off: the Off pill says that, and a word beside the title would only repeat it. The level is the bar's,
// so the number the finger moves is the one it reads. A room with nothing on to dim says only how many are on.
function countText(c, aid) {
  const onN = c.data.controllable().filter(d => c.data.devArea(d) === aid && d.domain !== 'cover' && c.data.isOn(d.device_id)).length;
  if (!onN) return '';
  const lv = brightLevel(c, aid);
  return lv ? `${onN} on · ${lv}%` : `${onN} on`;
}
function brightHTML(c, aid) {
  if (!dimmable(c, aid).length) return '';
  const lv = brightLevel(c, aid);
  return `<div class="room-bright ${lv ? '' : 'off'}">
      <div class="hbar ${lv >= 30 ? '' : 'low'}" data-drag="room-bright" data-id="${c.esc(aid)}" style="--pct:${lv}%" role="slider" aria-label="Brightness" aria-valuemin="1" aria-valuemax="100" aria-valuenow="${lv || 0}">
        <span class="fill"></span>
        <span class="lo">${c.icon('sun', 22, 1.8)}</span>
        <span class="hi">${c.icon('sun', 26, 1.6)}</span>
        <span class="knob"></span>
      </div>
    </div>`;
}
function wireBright(c, root) {
  const bar = root.querySelector('[data-drag="room-bright"]'); if (!bar) return;
  const aid = bar.dataset.id;
  let ids = null;
  const set = x => {
    const b = bar.getBoundingClientRect();
    // as the house bar: the knob sits inside the end of the fill, so the fill ends 28 past the finger
    const v = Math.max(1, Math.min(100, Math.round((x - b.left + 28) / b.width * 100)));
    bar.style.setProperty('--pct', v + '%');
    bar.classList.toggle('low', v / 100 * b.width < 100);
    bar.setAttribute('aria-valuenow', v);
    bar.parentElement.classList.remove('off');
    if (!ids) ids = brightTargets(c, aid);
    if (!ids.length) return;
    c.assume(ids, v, { held: true });
    c.gate.sendLevel(ids.map(id => `d:${id}`), v);
    // the count beside the title follows the finger, with the lights the drag has brought on counted in it
    const out = root.querySelector('.room-title .count:not(.wv-two)');
    if (out) out.textContent = countText(c, aid);
  };
  // a sideways drag only: a finger on its way up or down the page scrolls it (gesture.js). The lights it moves are
  // the ones on when the finger lands, so bringing a dark room up does not start moving other lights part way.
  track(bar, { c, axis: 'x', start: () => { ids = null; bar.classList.add('held'); }, move: e => set(e.clientX), end: () => { ids = null; } });
}

// The room's On and Off: the light page's switch, so the room's state is plain at a glance. The copper pill sits under
// On while anything in the room is on and under Off once it is all off, and slides on the standard curve when that
// changes. How much is on, and how bright, is the count beside the title, once. It comes before the photo button on the card, which
// comes and goes, so a redraw pairs it with itself and the pill slides rather than jumps (motion.js pairs elements by
// their place).
function powerHTML(c, aid, onN) {
  const { icon, esc } = c;
  const on = onN > 0;
  return `<div class="onoff room-onoff">
        <button data-act="room-on" data-id="${esc(aid)}" aria-pressed="${on}">${icon('power', 22, 2)}<span>On</span></button>
        <button data-act="room-off" data-id="${esc(aid)}" aria-pressed="${!on}">${icon('power', 22, 2)}<span>Off</span></button>
        <span class="onoff-pill ${on ? '' : 'off'}" aria-hidden="true"></span>
      </div>`;
}

export function view(c, r) {
  const { data, H, esc, icon } = c;
  const aid = r.id;
  const a = data.areas().find(x => x.id === aid);
  if (!a) return gone(c);
  const ds = data.controllable().filter(d => data.devArea(d) === aid)
    .sort((x, y) => (DOMAIN_LAST[x.domain] || 0) - (DOMAIN_LAST[y.domain] || 0) || x.name.localeCompare(y.name));
  const lights = H.roomLights(aid);
  // with no scene open, the next one opens with "Show it on the room" off again (as All scenes does)
  if (!/^scene\//.test(r.sub || '')) { c.ui.stageFor = null; c.ui.sceneShow = false; }
  const onN = ds.filter(d => data.isOn(d.device_id) && d.domain !== 'cover').length;
  const photo = !!H.roomPhotoURL(aid);
  const canToggle = ds.some(d => d.domain !== 'cover');
  const w = liveWave(aid);

  // the room's scenes: the one the lights are showing now is copper. A chip just tapped is copper at once, before its
  // lights have said they have arrived: the press landed. Edit (over the chips) turns every chip into a way into its
  // scene, with a pencil, until Done; holding a chip does the same at any time. New scene, last, is the one way to make
  // a scene here: it keeps the room as it is now and opens it, so what the lights are showing can be named and kept.
  const editing = c.ui.roomScenesEdit === aid;
  const cur = H.sceneMatch(aid);
  const scenes = H.roomScenes(aid).map(p => {
    const arriving = w && w.kind === 'run' && w.id === p.id;
    const long = fading(wave && wave.aid === aid ? wave : null, p.id);
    const now = p.id === cur || arriving || long;
    const g = now ? 'check' : MOOD_GLYPH[p.mood];
    const sub = long ? `<span class="ch-sub">Arriving · ${esc(c.EDIT.fadeText(wave.fade))}</span><i class="wv-prog" data-wvp="prog" style="animation-duration:${wave.fade}s"></i>` : '';
    if (editing) return `<button class="chip lead editing" data-act="scene-edit" data-id="${esc(p.id)}" aria-label="Change ${esc(H.sceneShortName(p))}">${icon('pencil', 16, 1.8)}${esc(H.sceneShortName(p))}</button>`;
    return `<button class="chip ${g ? 'lead' : ''} ${now ? 'current' : ''} ${long ? 'long' : ''}" data-act="scene" data-t="p:${esc(p.id)}" data-hold="scene-edit" data-ms="500" data-id="${esc(p.id)}">${g ? icon(g, 16, 1.8) : ''}${esc(H.sceneShortName(p))}${sub}</button>`;
  });
  const newScene = canToggle ? `<button class="chip lead" data-act="room-scene-new" data-id="${esc(aid)}">${icon('plus', 16, 1.8)}New scene</button>` : '';
  const scenesHead = scenes.length ? `<div class="room-sec"><span class="t-over">Scenes</span><button class="link" data-act="room-scenes-edit" data-id="${esc(aid)}" aria-pressed="${editing}">${editing ? 'Done' : 'Edit'}</button></div>` : '';
  const suggest = !editing && !scenes.length && H.roomDimmers(aid).length ? `<button class="chip lead" data-act="suggest-five" data-id="${esc(aid)}">${icon('sparkle', 16, 1.8)}Suggest scenes</button>` : '';

  // While a wave is out, the count holds what it said before the tap and settles to what is true now at its own
  // time; the stylesheet's keyframes do it, timed from the tap in after().
  const count = countText(c, aid);
  const countHTML = w && w.kind === 'run'
    ? `<span class="count wv-two" data-wvp="settle"><span class="wv-was">${esc(w.countWas)}</span><span class="wv-now">${esc(count)}</span></span>`
    : `<span class="count" data-xf>${esc(count)}</span>`;
  const layer = w ? waveLayer(w) : '';

  return `<div class="room">
    ${roomTop(c, aid)}
    <header class="hdr bar">
      <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
      ${pinButton(c, `a:${aid}`, a.name)}
      <button class="hdr-btn a1" data-go="room/${esc(aid)}/setup" aria-label="Room setup">${icon('dots', 22, 2.4)}</button>
    </header>
    <div class="room-title bar-pin">
      <h1 class="t-h1 bar-t ${titleFit(a.name)}">${esc(a.name)}</h1>
      ${countHTML}
    </div>
    <div class="room-photo-card ${photo ? '' : 'scene'}">
      ${roomPicture(c, aid, a.name, 'page')}
      ${photo ? roomLight(c, aid, lights) : ''}
      ${canToggle ? powerHTML(c, aid, onN) : ''}
      ${photo ? '' : `<button class="add-photo" data-go="room/${esc(aid)}/setup" aria-label="Add a photo">${icon('camera', 20, 1.7)}</button>`}
    </div>
    ${brightHTML(c, aid)}
    ${scenesHead}
    ${scenes.length || suggest || newScene ? `<div class="chip-row room-chips ${scenesHead ? 'headed' : ''}" data-keep="room-scenes">${scenes.join('')}${suggest}${newScene}</div>` : ''}
    ${ds.length
      ? `<div class="tile-grid room-grid">${ds.map(d => tile(c, d)).join('')}</div>`
      : `<div class="group room-empty"><button class="row sub has-ic" data-go="room/${esc(aid)}/setup"><span class="row-ic">${icon('plus', 20, 1.7)}</span><span class="row-txt"><span class="t">Move something in here</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button></div>`}
    ${layer}
  </div>`;
}

// The spark under the chip and the ring of light, drawn over the page (blended, so it only adds light) and clipped
// to it. A scene already showing gets one soft ring from the chip and nothing else moves.
function waveLayer(w) {
  const at = `left:${Math.round(w.x)}px;top:${Math.round(w.y)}px`;
  if (w.kind === 'same') return `<div class="wv-layer" aria-hidden="true"><span class="wv-soft" data-wvp="soft" style="${at}"></span></div>`;
  if (since(w) > T.tap + T.ring + 400) return '';
  return `<div class="wv-layer" aria-hidden="true">
    <span class="wv-spark" data-wvp="spark" style="${at}">${glowHTML(w.tone.hex ? { level: 100, hex: w.tone.hex, ctx: 'orb' } : { level: 100, kelvin: w.tone.kelvin, ctx: 'orb' })}</span>
    <span class="wv-wave" data-wvp="wave" style="${at};--wv-tone:${toneCSS(w.tone)}"></span></div>`;
}

// After each redraw while a wave is out: time every part of it from the tap, so a redraw in the middle of it (a
// light's state arriving) picks each part up exactly where it was.
export function after(c, r, scr) {
  wireBright(c, scr);
  const w = wave;
  if (!w || w.aid !== r.id || reduced() || since(w) > lifeOf(w) + 50) return;
  const room = scr.querySelector('.room'); if (!room) return;
  const box = room.getBoundingClientRect();
  const arrival = el => {
    const b = el.getBoundingClientRect();
    return T.tap + Math.hypot(b.left + b.width / 2 - box.left - w.x, b.top + b.height / 2 - box.top - w.y) * T.perPx;
  };
  const targets = [...room.querySelectorAll('.room-grid .tile, .rp-light')];
  // the count settles once the last thing on screen the ring reaches has had its second to arrive
  if (w.tSet == null) {
    const seen = targets.filter(el => el.getBoundingClientRect().top < innerHeight);
    w.tSet = Math.max(...seen.map(arrival), T.tap) + T.scene;
  }
  const el0 = since(w);
  const delay = (el, t) => { el.style.animationDelay = `${Math.round(t - el0)}ms`; };
  for (const el of room.querySelectorAll('[data-wvp]')) {
    const k = el.dataset.wvp;
    if (k === 'spark' || k === 'soft' || k === 'prog') delay(el, 0);
    else if (k === 'wave') delay(el, T.tap);
    else if (k === 'settle') for (const s of el.matches('.wv-was, .wv-now') ? [el] : el.children) delay(s, w.tSet);
  }
  // The crossfades motion.js has just started for tiles whose light changed: each one waits for the ring. They are
  // the scene's 1.0 s EASE_IN_AND_OUT as M3 has them; only their start moves.
  queueMicrotask(() => {
    const now = since(w);
    for (const copy of room.querySelectorAll('.xf-old:not([data-wv])')) {
      copy.dataset.wv = '1';
      const host = copy.parentElement;
      if (!host || !host.matches('.tile, .rp-light')) continue;
      const wait = Math.max(0, arrival(host) - now);
      if (wait < 16) continue;
      for (const a of copy.getAnimations()) a.effect.updateTiming({ delay: wait });
    }
    // an illustrated room's lamps (roomscene.js) each light as the ring reaches them: their fades wait too
    for (const lamp of room.querySelectorAll('.room-scene [data-fx][data-i]')) {
      const wait = Math.max(0, arrival(lamp) - now);
      if (wait < 16) continue;
      for (const part of room.querySelectorAll(`.room-scene [data-l="${lamp.dataset.i}"], .room-scene [data-l="${lamp.dataset.i}"] stop`)) {
        for (const a of part.getAnimations()) if (!(typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation)) a.effect.updateTiming({ delay: wait });
      }
    }
  });
}

// What Put back needs to restore every light a scene touched: its level, a fan's speed, and a lamp's colour, or that
// it was following the day.
function snapshot(c, p) {
  const out = {};
  for (const id of Object.keys(p.levels || {})) {
    const d = c.data.dev(id); if (!d) continue;
    const st = c.S.states[id] || {};
    out[id] = { level: c.data.level(id) || 0, fan: st.fan_speed || 'Off', color: st.color ? { ...st.color } : null, follow: c.DAY.isFollowing(id) && !c.DAY.followPaused(id), domain: d.domain };
  }
  return out;
}
export function putBack(c, before, p) {
  const byLevel = {};
  for (const [id, b] of Object.entries(before)) {
    if (b.domain === 'fan') { c.run({ type: 'fan', target: `d:${id}`, speed: b.fan }); continue; }
    // a lamp the scene coloured gets its colour back while it is still at the scene's level, then its level
    const v = (p.levels || {})[id];
    if (b.level > 0 && v && typeof v === 'object' && (v.hex || v.kelvin || v.follow)) {
      if (b.follow) c.run({ type: 'color', target: `d:${id}`, follow: true });
      else if (b.color && b.color.mode === 'ct' && b.color.kelvin) c.run({ type: 'color', target: `d:${id}`, kelvin: b.color.kelvin });
      else if (b.color && b.color.mode === 'xy' && b.color.hex) c.run({ type: 'color', target: `d:${id}`, hex: b.color.hex });
    }
    (byLevel[b.level] = byLevel[b.level] || []).push(`d:${id}`);
  }
  for (const [lv, ts] of Object.entries(byLevel)) c.run({ type: 'level', target: ts.length === 1 ? ts[0] : ts, level: Number(lv), fade: 1 });
}
const nightNow = c => { const s = c.S.config.settings || {}; return isNight(c.DAY.homeNow(), s.night_start || '22:00', s.night_end || '06:00'); };

// A light the scene asked for that has not got there once the scene should have arrived: named, with Try again.
function missed(c, p) {
  const out = [];
  for (const [id, v] of Object.entries(p.levels || {})) {
    const d = c.data.dev(id); if (!d || d.domain === 'fan' || d.domain === 'cover') continue;
    const cur = c.data.level(id) || 0, want = levelOf(v);
    if (d.domain === 'switch' ? (cur > 0) !== (want > 0) : Math.abs(cur - want) > 2) out.push(d);
  }
  return out;
}

async function runWave(c, el, r, p) {
  const aid = r.id, name = c.H.sceneShortName(p);
  if (c.conn() === 'off') { c.toast(`Can't reach your house just now, so ${name} didn't run`, { err: true }); return; }
  const room = el.closest('.room');
  const rb = room ? room.getBoundingClientRect() : { left: 0, top: 0 }, cb = el.getBoundingClientRect();
  const x = cb.left + cb.width / 2 - rb.left, y = cb.top + cb.height / 2 - rb.top;
  const t0 = performance.now();
  // already there: one soft ring from the chip, and nothing else moves. It is still sent, quietly: the lights may
  // not be what this phone last heard, and a tap on a scene should always put the room in it. No toast.
  if (c.H.sceneMatch(aid) === p.id && !fading(wave, p.id)) {
    wave = { kind: 'same', id: p.id, aid, t0, x, y };
    c.render();
    c.turn({ type: 'preset', preset_id: p.id });
    return;
  }
  const fade = p.fade == null ? 1 : Number(p.fade) || 0;
  const me = wave = { kind: 'run', id: p.id, aid, t0, x, y, fade, tone: sceneTone(c, p), countWas: countText(c, aid) };
  const before = snapshot(c, p);
  // the house is asked now, and each tile is shown where the scene puts it from the tap, crossfading over the scene's
  // 1.0 s rather than stepping through every level the bridge reports on the way (app.js turn)
  const going = c.turn({ type: 'preset', preset_id: p.id });
  c.render();
  const ok = await going;
  if (!ok) { if (wave === me) { wave = null; c.render(); } return; }
  // the toast comes in as the count settles; at night it stays longer, so Put back is easy to reach
  const settle = reduced() ? 0 : Math.max(0, (me.tSet || 1300) - since(me));
  setTimeout(() => {
    if (wave !== me) return;
    c.toast(name, { undo: () => putBack(c, before, p), undoLabel: 'Put back', ms: nightNow(c) ? 8000 : 5000 });
  }, settle);
  // redraw once the wave is over, so the page is plain again; and once more when a long fade has arrived
  setTimeout(() => { if (wave === me) c.soon(); }, lifeOf(me) + 60);
  if (fade > 1) setTimeout(() => { if (wave === me) c.soon(); }, fade * 1000 + 60);
  // a light that did not get there is named, with Try again; its tile has simply stayed as it was
  setTimeout(() => {
    if (wave !== me || c.conn() === 'off') return;
    const m = missed(c, p); if (!m.length) return;
    // a failure, not an Undo: an error always shows, and keeps its Try again
    c.toast(m.length === 1 ? `${m[0].name} didn't change` : `${m.length} lights didn't change`, { err: true, undo: () => c.run({ type: 'preset', preset_id: p.id }), undoLabel: 'Try again', ms: 8000 });
  }, Math.max(1, fade) * 1000 + 2500);
}

function gone(c) {
  return `<div class="room"><header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${c.icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">That room is gone</h1></div>`;
}

// Edit stays on while the room's scenes are changed over it (their editors are the room's own addresses) and is off
// again once the room is left, so a chip tapped on a later visit runs its scene rather than opening it.
let editUi = null;
addEventListener('hashchange', () => {
  const aid = editUi && editUi.roomScenesEdit; if (!aid) return;
  let h = location.hash.replace(/^#/, ''); try { h = decodeURIComponent(h); } catch (_) { /* as it is */ }
  if (h !== `room/${aid}` && !h.startsWith(`room/${aid}/`)) editUi.roomScenesEdit = null;
});

export const actions = {
  ...setupActions,
  ...sheetActs,
  'room-on'(c, el) { roomPower(c, el.dataset.id, true); },
  'room-off'(c, el) { roomPower(c, el.dataset.id, false); },
  // a scene chip: one tap runs it, with Put back; hold it to change it, as a scene tile does on All scenes
  scene(c, el, r) {
    const t = el.dataset.t || '';
    if (t.startsWith('s:')) { c.run({ type: 'scene', scene_id: t.slice(2) }); return; }
    const p = c.data.presets().find(x => x.id === t.slice(2)); if (!p) return;
    runWave(c, el, r, p);
  },
  // a scene's editor opens over the room, and closing it is the room again
  'scene-edit'(c, el, r) { if (el.dataset.id) c.go(`room/${r.id}/scene/${el.dataset.id}`); },
  'room-scenes-edit'(c, el) { const aid = el.dataset.id; c.ui.roomScenesEdit = c.ui.roomScenesEdit === aid ? null : aid; editUi = c.ui; c.render(); },
  // a new scene is the room as it is now (every light in it, so the ones that are off stay off), opened to change
  'room-scene-new'(c, el) {
    const aid = el.dataset.id;
    const p = c.EDIT.newScene(aid);
    for (const d of c.data.controllable()) {
      if (d.domain === 'cover' || c.data.devArea(d) !== aid || d.device_id in p.levels) continue;
      p.levels[d.device_id] = c.H.sceneEntryNow(d, 0);
    }
    c.ui.roomScenesEdit = null;
    c.save('', { quiet: true });
    c.go(`room/${aid}/scene/${p.id}`);
  },
  'suggest-five'(c, el) {
    const aid = el.dataset.id;
    c.H.suggestScenes(aid);
    c.save(`Five scenes for ${c.data.areaName(aid)}`);
  },
};
