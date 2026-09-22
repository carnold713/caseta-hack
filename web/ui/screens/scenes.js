// 14 · All scenes (12744:111043) and 15 · the scene sheet (12744:111378). Tap a scene to run it; press and hold, or
// its chevron, to change it. #scenes is the list; #scenes/<id> is the list with that scene's sheet over it, and
// #scenes/lutron-<id> a Lutron scene's (which is run and starred here, and changed in the Lutron app).
import { roomPicker, confirmSheet, nameSheet } from '/ui/screens/pickers.js';
import { kelvinHex, WHITES, LAMP_COLOURS, sameHex } from '/ui/colour.js';

const HIDE_KEY = 'scenesNotNow';
const notNow = () => { try { return JSON.parse(localStorage.getItem(HIDE_KEY) || '[]'); } catch (_) { return []; } };

// ---------- the colours a scene shows ----------
// Each light's dot: the colour or white the scene gives it, else copper by how bright, and dark grey for off.
function dotColour(c, id, v) {
  const lv = typeof v === 'object' && v ? Number(v.level) || 0 : typeof v === 'number' ? v : v && v !== 'Off' ? 100 : 0;
  if (!lv) return '#3A3A3A';
  if (v && typeof v === 'object') {
    if (v.hex) return v.hex;
    if (v.kelvin) return kelvinHex(v.kelvin);
    if (v.follow) { const k = c.DAY.followKelvinFor(id); if (k) return kelvinHex(k); }
  }
  return lv >= 90 ? '#F6E3CF' : lv >= 60 ? '#F2C28F' : lv >= 25 ? '#E9A04C' : '#8A6A4E';
}
function dots(c, p, size, ring) {
  const ids = c.EDIT.sceneDevices(p).slice(0, 4).map(d => d.device_id);
  return `<span class="sdots s${size}" style="--ring:${ring}">${ids.map(id => `<i style="background:${dotColour(c, id, p.levels[id])}"></i>`).join('')}</span>`;
}
const lutronDots = size => `<span class="sdots s${size}" style="--ring:var(--surface-2)"><i style="background:#F2C28F"></i><i style="background:#E9A04C"></i><i style="background:#F6E3CF"></i></span>`;

// Is the house showing this scene right now: every light in it at the scene's level.
const showing = (c, p) => Object.keys(p.levels || {}).length > 0 && c.H.levelsMatch(p.levels);

// ---------- 14 · the list ----------
export function view(c) {
  const { data, H, esc, icon, EDIT } = c;
  const all = data.presets(), theirs = data.lutronScenes();
  const favs = (c.S.config.favorites || []);
  const starred = favs.map(t => (t.startsWith('p:') ? all.find(p => p.id === t.slice(2)) : null)).filter(Boolean);
  const tile = p => {
    const cur = showing(c, p);
    const n = Object.keys(p.levels).length;
    return `<div class="scene-tile ${cur ? 'current' : ''}" data-act="scene-run" data-hold="scene-edit" data-ms="500" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Run ${esc(H.sceneShortName(p))}">
      ${cur ? '<span class="glow"></span>' : ''}${dots(c, p, 16, cur ? '#D98A4E' : 'var(--surface-1)')}
      <span class="st">${icon('star', 20, 1.8)}</span>
      <span class="nm">${esc(H.sceneShortName(p))}</span>
      <span class="vl">${esc([p.area ? data.areaName(p.area) : null, EDIT.lightsText(n)].filter(Boolean).join(' · '))}</span>
      <span class="ar">Arrives in ${EDIT.fadeText(p.fade)}</span></div>`;
  };
  const row = p => `<div class="row scene-row" data-act="scene-run" data-hold="scene-edit" data-ms="500" data-id="${esc(p.id)}" role="button" tabindex="0">
      ${dots(c, p, 14, 'var(--surface-2)')}<span class="row-txt"><span class="t">${esc(H.sceneShortName(p))}</span></span>
      <span class="row-val">${EDIT.lightsText(Object.keys(p.levels).length)}</span>
      <button class="row-chev as-btn" data-go="scenes/${esc(p.id)}" aria-label="Change ${esc(H.sceneShortName(p))}">${icon('chev', 16, 1.8)}</button></div>`;
  const rooms = data.areas();
  const groups = rooms.map(a => {
    const ps = H.roomScenes(a.id);
    if (ps.length) return `<div class="t-over sec">${esc(a.name)}</div><div class="group">${ps.map(row).join('')}</div>`;
    // a room with dimmers and no scenes yet is offered the five, once, until it says not now
    if (H.roomDimmers(a.id).length && !notNow().includes(a.id)) return `<div class="t-over sec">${esc(a.name)}</div>
      <div class="suggest-card"><span class="ic-c">${icon('sparkle', 20, 1.7)}</span><div class="t">No scenes yet</div>
        <p>Add Bright, Relax, Dinner, Movie and Night, made from what each light is for.</p>
        <div class="btns"><button class="pill blue" data-act="scenes-five" data-area="${esc(a.id)}">Add all five</button><button class="pill ghost" data-act="scenes-notnow" data-area="${esc(a.id)}">Not now</button></div></div>`;
    return '';
  }).join('');
  const loose = all.filter(p => !p.area || !rooms.some(a => a.id === p.area));
  const lutron = theirs.map(sc => `<div class="row scene-row" data-act="scene-run-lutron" data-hold="scene-lutron" data-ms="500" data-sid="${esc(sc.scene_id)}" role="button" tabindex="0">
      ${lutronDots(14)}<span class="row-txt"><span class="t">${esc(sc.name)}<span class="chip tag">Lutron</span></span></span><span class="row-val">Run</span></div>`).join('');
  return `<div class="scenes-page">
    <header class="hdr">
      <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
      <button class="hdr-btn a1" data-act="scene-new" aria-label="New scene">${icon('plus', 22, 1.7)}</button>
    </header>
    <h1 class="t-h1 page-h1">Scenes</h1>
    <p class="t-cap muted fd-sub">Tap to run · press and hold to edit</p>
    ${starred.length ? `<div class="t-over sec first">Starred</div><div class="tile-grid scene-grid">${starred.map(tile).join('')}</div>` : ''}
    ${groups}
    ${loose.length ? `<div class="t-over sec">Not in a room</div><div class="group">${loose.map(row).join('')}</div>` : ''}
    ${lutron ? `<div class="t-over sec">From Lutron app</div><div class="group">${lutron}</div><p class="t-cap muted foot">Edit these in the Lutron app</p>` : ''}
    ${!all.length && !theirs.length ? `<p class="t-body muted soon">Set your lights the way you like them, then tap + to save that look. A remote button can run it later.</p>` : ''}
  </div>`;
}

// ---------- 15 · the scene sheet ----------
function levelWord(c, d, v) {
  if (d.domain === 'fan') return ({ Off: 'Off', Low: 'Low', Medium: 'Medium', MediumHigh: 'Medium high', High: 'High' })[v] || 'Off';
  const lv = typeof v === 'object' && v ? Number(v.level) || 0 : Number(v) || 0;
  if (d.domain === 'switch') return lv > 0 ? 'On' : 'Off';
  return lv > 0 ? `${lv}%` : 'Off';
}
function colourChip(c, d, v) {
  if (!v || typeof v !== 'object') return '';
  if (v.follow) return `<span class="chip sm lead">${c.icon('sunrise', 16, 1.8)}Follow the day</span>`;
  if (v.hex) { const n = (LAMP_COLOURS.find(([, x]) => sameHex(x, v.hex)) || [])[0]; return `<span class="chip sm lead"><i class="cdot" style="background:${v.hex}"></i>${n || v.hex.toUpperCase()}</span>`; }
  if (v.kelvin) return `<span class="chip sm lead"><i class="cdot" style="background:${kelvinHex(v.kelvin)}"></i>${Math.round(v.kelvin)}K</span>`;
  return '';
}
// Under an opened light: how bright (or which speed), and for a lamp with colour, what colour.
function lightEditor(c, p, d) {
  const id = d.device_id, v = p.levels[id], { esc } = c;
  let h = '';
  if (d.domain === 'fan') h += `<div class="chip-wrap">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<button class="chip sm" aria-pressed="${v === s}" data-act="sl-level" data-id="${esc(id)}" data-v="${s}">${levelWord(c, d, s)}</button>`).join('')}</div>`;
  else if (d.domain === 'switch') h += `<div class="chip-wrap">${[['On', 100], ['Off', 0]].map(([n, x]) => `<button class="chip sm" aria-pressed="${(Number(typeof v === 'object' ? v.level : v) > 0) === (x > 0)}" data-act="sl-level" data-id="${esc(id)}" data-v="${x}">${n}</button>`).join('')}</div>`;
  else {
    const lv = typeof v === 'object' && v ? Number(v.level) || 0 : Number(v) || 0;
    h += `<input class="range" type="range" min="0" max="100" step="1" value="${lv}" data-range="sl-level" data-id="${esc(id)}" style="--p:${lv}%" aria-label="${esc(d.name)} in this scene">`;
  }
  if (d.ct || d.color) {
    const cur = v && typeof v === 'object' ? v : {};
    const whites = d.ct ? WHITES.map(([n, k]) => `<button class="chip sm lead" aria-pressed="${cur.kelvin === k}" data-act="sl-colour" data-id="${esc(id)}" data-k="${k}"><i class="cdot" style="background:${kelvinHex(k)}"></i>${n}</button>`).join('') : '';
    const cols = d.color ? LAMP_COLOURS.map(([n, x]) => `<button class="sw ${sameHex(cur.hex, x) ? 'sel' : ''}" data-act="sl-colour" data-id="${esc(id)}" data-hex="${x}" style="background:${x}" aria-label="${n}"></button>`).join('') : '';
    h += `<div class="chip-wrap">
      <button class="chip sm" aria-pressed="${!cur.hex && !cur.kelvin && !cur.follow}" data-act="sl-colour" data-id="${esc(id)}" data-none="1">As it is</button>
      ${c.DAY.canFollow(d) ? `<button class="chip sm lead" aria-pressed="${!!cur.follow}" data-act="sl-colour" data-id="${esc(id)}" data-follow="1">${c.icon('sunrise', 16, 1.8)}Follow the day</button>` : ''}${whites}</div>
      ${cols ? `<div class="cs-sw inline">${cols}</div>` : ''}`;
  }
  return `<div class="sl-edit">${h}</div>`;
}
function sceneSheet(c, p) {
  const { esc, icon, H, EDIT, data } = c;
  const ds = EDIT.sceneDevices(p);
  const open = c.ui.sceneOpen;
  const starred = (c.S.config.favorites || []).includes('p:' + p.id);
  const lights = ds.map(d => {
    const v = p.levels[d.device_id];
    const off = !(typeof v === 'object' && v ? Number(v.level) : typeof v === 'number' ? v : v && v !== 'Off');
    return `<div class="row sl-row ${off ? 'off' : ''}" data-act="sl-open" data-id="${esc(d.device_id)}" role="button" aria-expanded="${open === d.device_id}">
        <img class="sl-art" src="${c.artSrc(c.deviceArt(c, d))}" alt="">
        <span class="row-txt"><span class="t">${esc(d.name)}</span><span class="d">${levelWord(c, d, v)}</span></span>
        ${colourChip(c, d, v)}
        <button class="sl-x" data-act="sl-remove" data-id="${esc(d.device_id)}" aria-label="Take ${esc(d.name)} out of this scene">${icon('x', 20, 1.8)}</button></div>
      ${open === d.device_id ? lightEditor(c, p, d) : ''}`;
  }).join('');
  const fade = p.fade == null ? 1 : p.fade;
  const note = p.mood
    ? (p.edited
      ? `<p class="scene-note">${icon('sparkle', 18, 1.7)}<span>Changed by you, so refreshing the suggestions leaves it alone. <button class="link blue" data-act="scene-suggest">Back to the suggestion</button></span></p>`
      : `<p class="scene-note">${icon('sparkle', 18, 1.7)}<span>Changing a suggested scene makes it yours: refreshes won’t touch it.</span></p>`)
    : '';
  return {
    over: p.area ? `Scene · ${data.areaName(p.area)}` : 'Scene',
    title: H.sceneShortName(p),
    head: `<button class="head-btn" data-act="scene-star" aria-pressed="${starred}" aria-label="${starred ? 'Starred' : 'Star'}">${icon('star', 18, 1.7)}</button>`,
    body: `<div class="scene-sheet">
      <div class="group">
        <button class="row" data-act="scene-name"><span class="row-txt"><span class="t">Name</span></span><span class="row-val">${esc(H.sceneShortName(p))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
        <button class="row" data-act="scene-room"><span class="row-txt"><span class="t">Room</span></span><span class="row-val">${esc(p.area ? data.areaName(p.area) : 'Any room')}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      </div>
      <div class="t-over sec">Lights · ${ds.length}</div>
      <div class="group">${lights}
        <button class="row add-row" data-act="scene-add"><span class="add-ic">${icon('plus', 24, 1.8)}</span><span class="row-txt"><span class="t">Add a light</span></span></button></div>
      <div class="group arrive"><div class="arr-head"><span class="t">Arrives in</span><span class="v">${EDIT.fadeText(p.fade)}</span></div>
        <div class="chip-wrap">${EDIT.FADES.map(s => `<button class="chip" aria-pressed="${s === fade}" data-act="scene-fade" data-s="${s}">${EDIT.fadeText(s)}</button>`).join('')}</div></div>
      ${note}
      <div class="group">
        <button class="row" data-act="scene-try"><span class="row-txt"><span class="t">Try it</span></span></button>
        <button class="row" data-act="scene-capture"><span class="row-txt"><span class="t">Use the lights as they are now</span></span></button>
      </div>
      <div class="group"><button class="row" data-act="scene-delete"><span class="row-txt"><span class="t">Delete scene</span></span></button></div>
    </div>`,
    after: (c2, r, root) => wireRanges(c2, p, root),
  };
}
// The brightness sliders in an opened light: the scene changes as the finger moves, and saves once it stops.
function wireRanges(c, p, root) {
  root.querySelectorAll('input[data-range="sl-level"]').forEach(inp => {
    inp.addEventListener('pointerdown', () => { c.ui.dragging = true; });
    inp.addEventListener('input', () => {
      const v = Number(inp.value); inp.style.setProperty('--p', `${v}%`);
      c.EDIT.sceneSetLevel(p, inp.dataset.id, v);
      const row = inp.closest('.sl-edit').previousElementSibling; const w = row && row.querySelector('.row-txt .d'); if (w) w.textContent = v > 0 ? `${v}%` : 'Off';
      c.saveSoon();
    });
    const end = () => { if (c.ui.dragging) c.endDrag(); };
    inp.addEventListener('pointerup', end); inp.addEventListener('pointercancel', end); inp.addEventListener('change', end);
  });
}
function lutronSheet(c, sc) {
  const t = 's:' + sc.scene_id;
  const starred = (c.S.config.favorites || []).includes(t);
  return {
    over: 'From the Lutron app', title: sc.name,
    head: `<button class="head-btn" data-act="lutron-star" aria-pressed="${starred}" aria-label="${starred ? 'Starred' : 'Star'}">${c.icon('star', 18, 1.7)}</button>`,
    body: `<p class="t-body muted sheet-p">This look was made in the Lutron app. Change it there and it changes here too.</p>
      <div class="sheet-btns"><button class="pill solid" data-act="scene-run-lutron" data-sid="${c.esc(sc.scene_id)}">Try it</button></div>`,
  };
}

// The list with a sheet over it: a scene of yours, or one from the Lutron app.
export function sheetFor(c, r) {
  if (!r.id) return null;
  if (r.id.startsWith('lutron-')) { const sc = c.data.lutronScenes().find(s => String(s.scene_id) === r.id.slice(7)); return sc ? { spec: lutronSheet(c, sc), parent: 'scenes' } : null; }
  const p = c.data.presets().find(x => x.id === r.id);
  return p ? { spec: sceneSheet(c, p), parent: 'scenes' } : null;
}
const cur = (c, r) => c.data.presets().find(x => x.id === r.id);

// Running a scene says so, and Undo puts every light it touched back where it was.
async function runScene(c, p) {
  const before = {};
  for (const id of Object.keys(p.levels || {})) if (c.data.dev(id)) before[id] = c.data.level(id) || 0;
  for (const [id, v] of Object.entries(p.levels || {})) if (c.data.dev(id)) c.S.states[id] = { ...(c.S.states[id] || {}), level: typeof v === 'object' && v ? Number(v.level) || 0 : typeof v === 'number' ? v : v && v !== 'Off' ? 100 : 0 };
  c.soon();
  const ok = await c.run({ type: 'preset', preset_id: p.id });
  if (!ok) return;
  c.toast(`${c.H.sceneShortName(p)} is on`, { undo: async () => {
    const byLevel = {};
    for (const [id, lv] of Object.entries(before)) (byLevel[lv] = byLevel[lv] || []).push(`d:${id}`);
    for (const [lv, ts] of Object.entries(byLevel)) c.run({ type: 'level', target: ts.length === 1 ? ts[0] : ts, level: Number(lv), fade: 1 });
  } });
}

export const actions = {
  'scene-run'(c, el) { const p = c.data.presets().find(x => x.id === el.dataset.id); if (p) runScene(c, p); },
  'scene-edit'(c, el) { c.go(`scenes/${el.dataset.id}`); },
  async 'scene-run-lutron'(c, el) { const sc = c.data.lutronScenes().find(s => String(s.scene_id) === el.dataset.sid); if (!sc) return; if (await c.run({ type: 'scene', scene_id: sc.scene_id })) c.toast(`${sc.name} is on`); },
  'scene-lutron'(c, el) { c.go(`scenes/lutron-${el.dataset.sid}`); },
  'scene-new'(c) {
    const p = c.EDIT.newScene();
    c.save('', { quiet: true });
    c.go(`scenes/${p.id}`);
  },
  'scenes-five'(c, el) { const aid = el.dataset.area; c.H.suggestScenes(aid); c.save(`${c.data.areaName(aid)} has five scenes`); },
  'scenes-notnow'(c, el) { try { localStorage.setItem(HIDE_KEY, JSON.stringify([...notNow(), el.dataset.area])); } catch (_) { /* shows again next time */ } c.render(); },
  // ---- the sheet
  'scene-star'(c, el, r) { const t = 'p:' + r.id; const f = c.S.config.favorites; const i = f.indexOf(t); if (i >= 0) f.splice(i, 1); else f.push(t); c.save(i >= 0 ? 'Taken off Home' : 'Starred on Home'); },
  'lutron-star'(c, el, r) { const t = 's:' + r.id.slice(7); const f = c.S.config.favorites; const i = f.indexOf(t); if (i >= 0) f.splice(i, 1); else f.push(t); c.save(i >= 0 ? 'Taken off Home' : 'Starred on Home'); },
  'scene-name'(c, el, r) { const p = cur(c, r); if (p) c.openPicker('name', c2 => nameSheet(c2, { over: 'Scene', title: 'Name', value: c2.H.sceneShortName(p), act: 'scene-name-set', max: 40 })); },
  'scene-name-set'(c, el, r, value) { const p = cur(c, r); if (!p) return; c.EDIT.renameScene(p, value); c.saveSoon(); },
  'scene-room'(c, el, r) {
    const p = cur(c, r); if (!p) return;
    c.openPicker('room', c2 => roomPicker(c2, { over: c2.H.sceneShortName(p), title: 'Which room?', current: p.area || '', act: 'scene-room-to', none: { label: 'Any room', sub: 'Listed on its own, not on a room page' }, newRoom: false }));
  },
  'scene-room-to'(c, el, r) { const p = cur(c, r); if (!p) return; c.EDIT.sceneSetRoom(p, el.dataset.room || null); c.closePicker(); c.save(p.area ? `${c.H.sceneShortName(p)} is a ${c.data.areaName(p.area)} scene` : `${c.H.sceneShortName(p)} is not in a room`); },
  'sl-open'(c, el) { const id = el.dataset.id; c.ui.sceneOpen = c.ui.sceneOpen === id ? null : id; c.render(); },
  'sl-remove'(c, el, r) { const p = cur(c, r); if (!p) return; const d = c.data.dev(el.dataset.id); c.EDIT.sceneInclude(p, el.dataset.id, false); c.save(`${d ? d.name : 'It'} is out of this scene`); },
  'sl-level'(c, el, r) { const p = cur(c, r); if (!p) return; const v = el.dataset.v; c.EDIT.sceneSetLevel(p, el.dataset.id, /^\d+$/.test(v) ? Number(v) : v); c.saveSoon(); c.render(); },
  'sl-colour'(c, el, r) {
    const p = cur(c, r); if (!p) return; const x = el.dataset;
    c.EDIT.sceneSetColour(p, x.id, x.none ? null : x.follow ? { follow: true } : x.k ? { kelvin: Number(x.k) } : { hex: x.hex });
    c.saveSoon(); c.render();
  },
  'scene-add'(c, el, r) {
    const p = cur(c, r); if (!p) return;
    c.openPicker('add', c2 => {
      const out = c2.data.controllable().filter(d => d.domain !== 'cover' && !(d.device_id in p.levels));
      const groups = c2.data.areas().map(a => { const ds = out.filter(d => c2.data.devArea(d) === a.id); return ds.length ? `<div class="t-over sec">${c2.esc(a.name)}</div><div class="group">${ds.map(d => `<button class="row" data-act="scene-add-go" data-id="${c2.esc(d.device_id)}"><span class="row-txt"><span class="t">${c2.esc(d.name)}</span></span><span class="row-val">${levelWord(c2, d, d.domain === 'fan' ? ((c2.S.states[d.device_id] || {}).fan_speed || 'Off') : c2.data.level(d.device_id) || 0)}</span></button>`).join('')}</div>` : ''; }).join('');
      return { over: c2.H.sceneShortName(p), title: 'Add a light', body: `<p class="t-body muted sheet-p">It joins at the level it is at now.</p>${groups || '<p class="t-body muted sheet-p">Every light is already in it.</p>'}` };
    });
  },
  'scene-add-go'(c, el, r) { const p = cur(c, r); if (!p) return; c.EDIT.sceneInclude(p, el.dataset.id, true); c.closePicker(); c.save('', { quiet: true }); },
  'scene-fade'(c, el, r) { const p = cur(c, r); if (!p) return; c.EDIT.sceneSetFade(p, Number(el.dataset.s)); c.save('', { quiet: true }); },
  'scene-suggest'(c, el, r) { const p = cur(c, r); if (p && c.EDIT.sceneSuggest(p)) c.save('Back to the suggestion'); },
  'scene-try'(c, el, r) { const p = cur(c, r); if (p) runScene(c, p); },
  'scene-capture'(c, el, r) { const p = cur(c, r); if (!p) return; c.EDIT.sceneCapture(p); c.save('The scene is the lights as they are now'); },
  'scene-delete'(c, el, r) {
    const p = cur(c, r); if (!p) return;
    c.openPicker('delete', c2 => confirmSheet(c2, { over: 'Scene', title: `Delete ${c2.H.sceneShortName(p)}?`, act: 'scene-delete-go', yes: 'Delete scene',
      text: 'Any remote button that runs it stops running it. The lights stay as they are.' }));
  },
  async 'scene-delete-go'(c, el, r) {
    const prev = JSON.stringify(c.S.config);
    const p = c.EDIT.deleteScene(r.id); if (!p) return;
    c.closePicker(); c.closeSheet();
    await c.save('', { quiet: true });
    history.replaceState(null, '', '#scenes'); c.render();
    c.toast(`${c.H.sceneShortName(p)} deleted`, { undo: async () => { c.data.restoreConfig(prev); await c.save('Put back'); } });
  },
};
