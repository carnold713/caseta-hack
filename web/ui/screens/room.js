// 03 · A room. Its photograph with All on and All off laid on it, its scenes, and every device in it as a tile.
// Read from the Figma frame (12733:20).
//
// v7 · 6, a scene arriving (12814:48798): a tapped chip lights first, then a ring of light leaves it and walks out
// across the page at the wave token (60 ms per 100 px). Each tile, and the photograph's light, crossfades when the
// ring reaches it or when its light's state arrives, whichever is later, so a slow bridge shows as a tile catching up
// and never as a lie. The count and the badge settle last, and the toast offers Put back.
import { tile, roomPicture } from '/ui/screens/parts.js';
import { roomTone, roomPower } from '/ui/screens/rooms.js';
import { sheets as setupSheets, actions as setupActions } from '/ui/screens/setup.js';
import { sceneSheet, actions as sceneActions, LIST_ACTS } from '/ui/screens/scenes.js';
import { glowHTML, whiteStops, isNight } from '/ui/glow.js';
import { reduced } from '/ui/motion.js';

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
// the count and the badge settle over the standard 0.24 s once the last thing reached has arrived.
const T = { tap: 120, perPx: 0.6, scene: 1000, standard: 240, ring: 360 };
let wave = null;   // { kind: 'run'|'same', id, aid, t0, x, y, fade, countWas, litWas, tone, tSet }
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
const countText = (n, onN) => `${n === 1 ? '1 device' : `${n} devices`}${onN ? ` · ${onN} on` : ''}`;

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

// The room's own light on its photograph: a pool in the warmest white that is on, as big and strong as the room is
// bright, and a grey veil when everything is off (the lighting system's rule for a room photo).
function roomLight(c, aid, lights) {
  const lit = lights.filter(d => (c.data.level(d.device_id) || 0) > 0);
  if (!lit.length) return `<span class="rp-light dark" data-xf aria-hidden="true"></span>`;
  const mean = Math.round(lit.reduce((a, d) => a + (c.data.level(d.device_id) || 0), 0) / lit.length);
  let k = null;
  for (const d of lit) { const col = (c.S.states[d.device_id] || {}).color; if (col && col.mode === 'ct' && col.kelvin && (k == null || col.kelvin < k)) k = col.kelvin; }
  return `<span class="rp-light" data-xf style="--rl:${mean}" aria-hidden="true">${glowHTML({ level: mean, kelvin: k || 2700, ctx: 'card', x: '70%', y: '34%' })}</span>`;
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
  const litN = lights.filter(d => (data.level(d.device_id) || 0) > 0).length;
  const onN = ds.filter(d => data.isOn(d.device_id) && d.domain !== 'cover').length;
  const photo = !!H.roomPhotoURL(aid);
  const canToggle = ds.some(d => d.domain !== 'cover');
  const w = liveWave(aid);

  // the room's scenes: the one the lights are showing now is copper, and "Save this look" keeps what they are showing.
  // A chip just tapped is copper at once, before its lights have said they have arrived: the press landed.
  // Edit (over the chips) turns every chip into a way into its scene, with a pencil, until Done; holding a chip
  // does the same at any time. New scene, last, starts one from the room as it is and opens it.
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
  const saveLook = litN && !cur && !w && !editing ? `<button class="chip lead" data-act="save-look" data-id="${esc(aid)}">${icon('plus', 16, 1.8)}Save this look</button>` : '';
  const suggest = !editing && !scenes.length && H.roomDimmers(aid).length ? `<button class="chip lead" data-act="suggest-five" data-id="${esc(aid)}">${icon('sparkle', 16, 1.8)}Suggest five scenes</button>` : '';

  // While a wave is out, the count and the badge hold what they said before the tap and settle to what is true now
  // at their own time; the stylesheet's keyframes do it, timed from the tap in after().
  const count = countText(ds.length, onN);
  const countHTML = w && w.kind === 'run'
    ? `<span class="count wv-two" data-wvp="settle"><span class="wv-was">${esc(w.countWas)}</span><span class="wv-now">${esc(count)}</span></span>`
    : `<span class="count" data-xf>${esc(count)}</span>`;
  const badgeHTML = w && w.kind === 'run' && (litN || w.litWas)
    ? `<span class="badge wv-two" aria-label="${litN} on"><svg class="wv-ring" data-wvp="ring" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="27" pathLength="1"/></svg><span class="wv-was" data-wvp="settle">${w.litWas || ''}</span><span class="wv-now" data-wvp="settle">${litN || ''}</span></span>`
    : litN ? `<span class="badge" data-xf aria-label="${litN} on">${litN}</span>` : '';
  const layer = w ? waveLayer(w) : '';

  return `<div class="room">
    <header class="hdr bar">
      <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
      <button class="hdr-btn a1" data-go="room/${esc(aid)}/setup" aria-label="Room setup">${icon('dots', 22, 2.4)}</button>
    </header>
    <div class="room-title bar-pin">
      <h1 class="t-h1 bar-t">${esc(a.name)}</h1>
      ${countHTML}
    </div>
    <div class="room-photo-card ${photo ? '' : roomTone(aid)}">
      ${roomPicture(c, aid, a.name, false)}
      ${roomLight(c, aid, lights)}
      ${badgeHTML}
      ${photo ? '' : `<button class="add-photo" data-go="room/${esc(aid)}/setup">${icon('camera', 16, 1.8)}Add a photo</button>`}
      ${canToggle ? `<div class="room-acts">
        <button class="glass" data-act="room-on" data-id="${esc(aid)}">${icon('sun', 22, 2)}All on</button>
        <button class="glass" data-act="room-off" data-id="${esc(aid)}">${icon('power', 22, 2)}All off</button>
      </div>` : ''}
    </div>
    ${scenesHead}
    ${scenes.length || saveLook || suggest || newScene ? `<div class="chip-row room-chips ${scenesHead ? 'headed' : ''}" data-keep="room-scenes">${scenes.join('')}${saveLook}${suggest}${newScene}</div>` : ''}
    ${ds.length
      ? `<div class="tile-grid room-grid">${ds.map(d => tile(c, d)).join('')}</div>`
      : `<div class="group room-empty"><button class="row sub has-ic" data-go="room/${esc(aid)}/setup"><span class="row-ic">${icon('plus', 20, 1.7)}</span><span class="row-txt"><span class="t">Nothing in this room yet</span><span class="d">Move a light or a remote in here.</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button></div>`}
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
  const w = wave;
  if (!w || w.aid !== r.id || reduced() || since(w) > lifeOf(w) + 50) return;
  const room = scr.querySelector('.room'); if (!room) return;
  const box = room.getBoundingClientRect();
  const arrival = el => {
    const b = el.getBoundingClientRect();
    return T.tap + Math.hypot(b.left + b.width / 2 - box.left - w.x, b.top + b.height / 2 - box.top - w.y) * T.perPx;
  };
  const targets = [...room.querySelectorAll('.room-grid .tile, .rp-light')];
  const badge = room.querySelector('.room-photo-card .badge');
  // the count settles once the last thing on screen the ring reaches has had its second to arrive
  if (w.tSet == null) {
    const seen = targets.filter(el => el.getBoundingClientRect().top < innerHeight);
    w.tSet = Math.max(badge ? arrival(badge) : 0, ...seen.map(arrival), T.tap) + T.scene;
    w.ringAt = badge ? arrival(badge) : T.tap;
  }
  const el0 = since(w);
  const delay = (el, t) => { el.style.animationDelay = `${Math.round(t - el0)}ms`; };
  for (const el of room.querySelectorAll('[data-wvp]')) {
    const k = el.dataset.wvp;
    if (k === 'spark' || k === 'soft' || k === 'prog') delay(el, 0);
    else if (k === 'wave') delay(el, T.tap);
    else if (k === 'ring') delay(el, w.ringAt);
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
    c.run({ type: 'preset', preset_id: p.id });
    return;
  }
  const lights = c.H.roomLights(aid);
  const ds = c.data.controllable().filter(d => c.data.devArea(d) === aid);
  const onN = ds.filter(d => c.data.isOn(d.device_id) && d.domain !== 'cover').length;
  const fade = p.fade == null ? 1 : Number(p.fade) || 0;
  const me = wave = { kind: 'run', id: p.id, aid, t0, x, y, fade, tone: sceneTone(c, p), countWas: countText(ds.length, onN), litWas: lights.filter(d => (c.data.level(d.device_id) || 0) > 0).length };
  const before = snapshot(c, p);
  c.render();
  // the house is asked now; each tile changes when its light says it has
  const ok = await c.run({ type: 'preset', preset_id: p.id });
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
    <h1 class="t-h1 page-h1">That room is gone</h1><p class="t-body muted soon">It is no longer in your home.</p></div>`;
}

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
  'room-scenes-edit'(c, el) { const aid = el.dataset.id; c.ui.roomScenesEdit = c.ui.roomScenesEdit === aid ? null : aid; c.render(); },
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
