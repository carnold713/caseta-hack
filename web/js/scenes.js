/* Scenes: named looks. Yours are editable; Lutron's run as-is. */
'use strict';

// Scenes is a page pushed from Home, not a tab (docs/ia-v5.md 3, stage 3). Running a scene is one tap on Home;
// everything else about a scene is here, two taps away. There is one way to make one: the "+" in the nav bar, or the
// empty state's primary button when there are none.
VIEWS.scenes = {
  tab: 'home',
  nested() { return true; },
  top() {
    return nestedTop('scenes-back', 'Scenes')
      + `<div class="tools"><button class="iconbtn plain" data-act="scene-new" title="New scene" aria-label="New scene" style="color:var(--blue)">${ICON('plus')}</button></div>`;
  },
  body() {
    const mine = presets().filter(p => !(p.mood && p.area)); const theirs = lutronScenes();
    const moods = typeof roomMoodsSectionHTML === 'function' ? roomMoodsSectionHTML() : '';
    if (!mine.length && !theirs.length && !moods) return `<div class="empty-state"><p class="body">Set your lights the way you like them, then save that look. A remote button can run it later.</p><button class="btn primary lg block" data-act="scene-new">New scene</button></div>`;
    // The tiles are the scenes (a scene is a picture). At rest a tile has one job: run the scene. Edit turns on the
    // pencils; a tap on a tile then opens its editor, and Done turns it off again.
    const edit = !!S.scenesEdit;
    const tiles = [...mine.map(p => ({ id: 'p:' + p.id, name: p.name, sub: sceneSub(p), edit: p.id })), ...theirs.map(s => ({ id: 's:' + s.scene_id, name: s.name, sub: 'From the Lutron app', lutron: s.scene_id }))];
    const corner = s => s.edit
      ? `<button class="iconbtn sm tile-edit" data-act="scene-edit" data-id="${s.edit}" aria-label="Edit ${esc(s.name)}">${ICON('edit', 'sm')}</button>`
      : `<button class="iconbtn sm tile-edit" data-act="scene-lutron" data-id="${s.lutron}" aria-label="About ${esc(s.name)}">${ICON('dots', 'sm')}</button>`;
    const tile = s => edit
      ? `<div class="tile editing" role="button" tabindex="0" data-act="${s.edit ? 'scene-edit' : 'scene-lutron'}" data-id="${s.edit || s.lutron}"><div class="face">${tileFaceHTML(tileItems(s.id))}${corner(s)}</div><div class="label"><div class="n">${esc(s.name)}</div><div class="s">${esc(s.sub)}</div></div></div>`
      : `<div class="tile" role="button" tabindex="0" data-act="run-scene" data-t="${s.id}"><div class="face">${tileFaceHTML(tileItems(s.id))}</div><div class="label"><div class="n">${esc(s.name)}</div><div class="s">${esc(s.sub)}</div></div></div>`;
    let h = `<div class="gh">Scenes${tiles.length ? `<button class="link" data-act="scenes-edit">${edit ? 'Done' : 'Edit'}</button>` : ''}</div>`;
    h += `<div class="tiles grid">${tiles.map(tile).join('')}</div>`;
    h += moods;
    // a home with no room moods yet: the one thing the tiles cannot show, offered rather than left blank
    if (!moods && typeof moodsWalkRooms === 'function' && moodsWalkRooms().length) h += `<div class="card pad0 list" style="margin-top:24px"><button class="item" data-act="moods-walk"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Give a room five moods</div><div class="d">Bright, Relax, Dinner, Movie and Night, from what each light is for</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
    return h;
  },
};
// where the scene editor came from, so its sub-sheets can return to it and it can return where it started
let SCENE_BACK = null;
const reopenEditor = id => openSceneEditor(id, false, { back: SCENE_BACK });
const sceneSub = p => `${plural(Object.keys(p.levels).length, 'light')}${p.fade ? ` · fades over ${fmtDur(p.fade)}` : ''}`;
// What a light is doing now, as a scene entry: a fan speed, a level, or {level, kelvin | hex} for a Hue lamp showing a colour.
function sceneEntryNow(d, dflt) {
  const id = d.device_id;
  if (d.domain === 'fan') return (S.states[id] || {}).fan_speed || 'Off';
  const lv = level(id) ?? dflt;
  const c = colorState(id);
  if (c && c.mode === 'ct' && c.kelvin && d.ct) return { level: lv, kelvin: Math.round(c.kelvin) };
  if (c && c.mode === 'xy' && c.hex && d.color) return { level: lv, hex: c.hex.toLowerCase() };
  return lv;
}
// A scene entry with a new brightness, keeping its colour when it has one.
function withLevel(v, lv) { return v && typeof v === 'object' ? { ...v, level: lv } : lv; }

function newScene() {
  const p = { id: uid(), name: 'New scene', levels: {}, fade: null };
  for (const d of controllable()) { if (d.domain === 'cover') continue; if (isOn(d.device_id)) p.levels[d.device_id] = sceneEntryNow(d, 100); }
  S.config.presets.push(p);
  save({ quiet: true, render: true });
  openSceneEditor(p.id, true);
}
// "Kitchen Cans 60%, Bedside Lamp 30%, Porch on": what the scene holds, at most six, then "and 2 more".
function sceneLevelsText(p) {
  const parts = Object.entries(p.levels).filter(([id]) => dev(id)).map(([id, v]) => { const d = dev(id); const lv = levelOf(v); return `${d.name} ${d.domain === 'fan' ? fanName(v) : d.domain === 'switch' ? (lv > 0 ? 'on' : 'off') : lv > 0 ? lv + '%' : 'off'}`; });
  if (!parts.length) return 'nothing yet';
  return parts.slice(0, 6).join(', ') + (parts.length > 6 ? ` and ${parts.length - 6} more` : '');
}
const sceneLightRow = (p, d) => {
  const v = p.levels[d.device_id], lv = levelOf(v), c = colorOf(v);
  let ctl = '';
  if (d.domain === 'fan') ctl = `<select class="input" style="width:130px;min-height:40px;padding:6px 32px 6px 12px" data-scene-lvl="${d.device_id}">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<option value="${s}" ${v === s ? 'selected' : ''}>${cap(fanName(s))}</option>`).join('')}</select>`;
  else if (d.domain === 'switch') ctl = `<button class="sw ${lv > 0 ? 'on' : ''}" data-act="scene-sw" data-id="${d.device_id}"></button>`;
  else ctl = `<div class="sliderwrap" style="width:140px"><input class="slider" type="range" min="0" max="100" value="${lv}" style="--p:${lv}%" data-scene-lvl="${d.device_id}" aria-label="${esc(d.name)} in this look"></div>`;
  // a Hue lamp's disc shows the colour the scene gives it; under its row, a value row opens the colour controls
  const fill = c && lv > 0 ? lampFill(c.mode === 'ct' ? kelvinHex(c.kelvin) : c.hex, lv) : null;
  let row = `<div class="item">${lampHTML(lv, 28, '', '', false, fill)}<div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${d.domain === 'fan' ? cap(fanName(v)) : lv > 0 ? lv + '%' : 'Off'}</div></div>${ctl}</div>`;
  if (d.ct || d.color) row += valueRow(d.color ? 'Colour' : 'Warmth', `${colourDot(c)}<span data-scol="${d.device_id}">${esc(colourLabel(c))}</span>`, 'c-expand', `data-cns="scene" data-cid="${d.device_id}"`);
  return row;
};
// The scene editor's colour controls (js/color.js): the entry becomes {level, kelvin | hex}, or a plain level again.
colorHost('scene', {
  cur: id => { const p = presets().find(x => x.id === S.sceneEdit); return p ? colorOf(p.levels[id]) : null; },
  opts: () => ({ none: true }),
  set(id, v) {
    const p = presets().find(x => x.id === S.sceneEdit); if (!p || !(id in p.levels)) return;
    const lv = levelOf(p.levels[id]);
    p.levels[id] = v ? { level: lv, ...v } : lv;
    markEdited(p); saveSoon();
    const c = colorOf(p.levels[id]);
    const lab = document.querySelector(`[data-scol="${id}"]`); if (lab) { lab.textContent = colourLabel(c); const dot = lab.previousElementSibling; if (dot) dot.outerHTML = colourDot(c); }
    const row = lab && lab.closest('.item') && lab.closest('.item').previousElementSibling; const lamp = row && row.querySelector('.lamp');
    if (lamp) lamp.style.background = c && lv > 0 ? lampFill(c.mode === 'ct' ? kelvinHex(c.kelvin) : c.hex, lv) : lampColor(lv);
  },
});
// The scene editor (docs/ux-progressive.md 2.10): the name, only the lights in the look, "Add or remove lights", the pair, More, Done.
function openSceneEditor(id, fresh = false, opts = {}) {
  const p = presets().find(x => x.id === id); if (!p) return;
  S.sceneEdit = id;
  const all = controllable().filter(d => d.domain !== 'cover');
  const inc = all.filter(d => d.device_id in p.levels);
  const rows = areas().map(a => {
    const ds = inc.filter(d => devArea(d) === a.id);
    if (!ds.length) return '';
    return `<div class="h3">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => sceneLightRow(p, d)).join('')}</div>`;
  }).join('');
  // A room mood: a suggested scene until the person changes it; then it is theirs and Update moods leaves it alone.
  const mood = p.mood && p.area ? `<div class="tip" style="margin-top:8px"><div class="grow"><span class="cap">Room mood</span><div class="t">${p.edited ? 'Changed by you.' : 'A suggested mood.'} Change anything you like; from then on it's yours and won't be replaced.</div>${p.edited ? `<button class="btn ghost" data-act="scene-suggest" data-id="${p.id}">Back to the suggestion</button>` : ''}</div></div>` : '';
  const body = `${mood}<label class="field"><span>Name</span><input class="input" id="scene-name" value="${esc(p.name)}" ${fresh ? 'autofocus' : ''}></label>
    <div class="h2">In this look</div>${rows || `<p class="d">No lights yet. Add some below.</p>`}
    <div class="card pad0 list" style="margin-top:16px">${valueRow('Add or remove lights', `${inc.length} of ${all.length}`, 'scene-lights')}</div>
    <div class="btnpair" style="margin-top:16px"><button class="btn" data-act="scene-capture">${ICON('copy', 'sm')} Use current levels</button><button class="btn" data-act="run-scene" data-t="p:${p.id}">${ICON('play', 'sm')} Try it</button></div>
    <div style="margin-top:16px">${moreRow('Fade, delete', 'scene-more')}</div>`;
  const title = fresh ? 'What should we call this look?' : esc(p.name);
  const sub = fresh ? `Saved from the lights as they are: ${esc(sceneLevelsText(p))}.` : esc(sceneSub(p));
  SCENE_BACK = opts.back || null;
  // "Done" in the top right, no footer: it is an editor, and every change has already autosaved (docs/ia-v5.md 5)
  showSheet('scene', title, body, { detent: 'large', done: true, sub, back: !!SCENE_BACK, onBack: SCENE_BACK });
  if (fresh) { const i = $('#scene-name'); if (i) setTimeout(() => { i.focus(); i.select(); }, 350); }
}
// "Which lights are in this look?": every light in the house with a checkbox, back to the editor.
function openSceneLightsSheet() {
  const p = presets().find(x => x.id === S.sceneEdit); if (!p) return;
  const rows = areas().map(a => {
    const ds = controllable().filter(d => devArea(d) === a.id && d.domain !== 'cover');
    if (!ds.length) return '';
    return `<div class="h3">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => `<label class="item"><input type="checkbox" class="cb" ${d.device_id in p.levels ? 'checked' : ''} data-act="scene-inc" data-id="${d.device_id}"><div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${d.device_id in p.levels ? (d.domain === 'fan' ? cap(fanName(p.levels[d.device_id])) : levelOf(p.levels[d.device_id]) > 0 ? levelOf(p.levels[d.device_id]) + '%' : 'Off') : 'Left alone'}</div></div></label>`).join('')}</div>`;
  }).join('');
  showSheet('scene-lights', 'Which lights are in this look?', rows, { detent: 'large', sub: 'A light you tick joins at the level it is at now.', back: true, onBack: () => openSceneEditor(p.id, false, { back: SCENE_BACK }) });
}
// The scene editor's More: the fade, and deleting the scene.
function sceneMoreSheet() {
  const p = presets().find(x => x.id === S.sceneEdit); if (!p) return;
  const t = 'p:' + p.id;
  const body = `<div class="card pad0 list"><div class="item"><div class="grow"><div class="t">Show it first on Home</div><div class="d">A starred scene leads the row on Home</div></div><button class="iconbtn plain fav ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="fav" data-t="${t}" aria-label="Show it first on Home">${ICON('star', 'sm')}</button></div></div>
    <label class="field" style="margin-top:16px"><span>Change gradually over</span><select class="input" id="scene-fade">${[['', 'Default'], [0, 'Instantly'], [1, '1 second'], [3, '3 seconds'], [8, '8 seconds'], [30, '30 seconds'], [300, '5 minutes'], [900, '15 minutes'], [1800, '30 minutes']].map(([v, l]) => `<option value="${v}" ${String(p.fade == null ? '' : p.fade) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="spacer"></div><button class="btn danger block" data-act="scene-delete" data-id="${p.id}">Delete this scene</button>`;
  showSheet('scene-more', 'More', body, { detent: 'medium', sub: esc(p.name), back: true, onBack: () => openSceneEditor(p.id, false, { back: SCENE_BACK }) });
}
// A Lutron scene cannot be edited here; its sheet says so and carries the star the list row used to.
function sceneLutronSheet(sid) {
  const sc = lutronScenes().find(s => String(s.scene_id) === String(sid)); if (!sc) return;
  const t = 's:' + sc.scene_id;
  const body = `<div class="card pad0 list"><div class="item"><div class="grow"><div class="t">Show it first on Home</div><div class="d">A starred scene leads the row on Home</div></div><button class="iconbtn plain fav ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="fav" data-t="${t}" aria-label="Show it first on Home">${ICON('star', 'sm')}</button></div></div>
    <p class="d" style="margin-top:16px">This look was made in the Lutron app. Change it there and it changes here too.</p>
    <div class="spacer"></div><button class="btn block" data-act="run-scene" data-t="${t}">${ICON('play', 'sm')} Try it</button>`;
  showSheet('scene-lutron', esc(sc.name), body, { detent: 'compact', sub: 'From the Lutron app' });
}
// Any change to a room mood marks it as the person's own.
function markEdited(p) { if (p && p.mood && p.area && !p.edited) { p.edited = true; const t = $('#sheet-root .tip .t'); if (t && /suggested mood/i.test(t.textContent)) reopenEditor(p.id); } }
function sceneEdit(k, v) {
  const p = presets().find(x => x.id === S.sceneEdit); if (!p) return;
  if (k === 'name') { p.name = v.trim() || 'Untitled'; const h = $('#sheet-root .sh h2'); if (h && SHEET_KEY === 'scene' && !/call this look/.test(h.textContent)) h.textContent = p.name; }
  if (k === 'fade') p.fade = v === '' ? null : Number(v);
  markEdited(p); saveSoon();
}
function sceneInclude(did, on) {
  const p = presets().find(x => x.id === S.sceneEdit); const d = dev(did);
  if (on) p.levels[did] = sceneEntryNow(d, 100); else delete p.levels[did];
  markEdited(p); saveSoon();
  if (SHEET_KEY === 'scene-lights') openSceneLightsSheet(); else reopenEditor(p.id);
}
function sceneLevel(did, v) { const p = presets().find(x => x.id === S.sceneEdit); p.levels[did] = typeof v === 'number' ? withLevel(p.levels[did], clamp(v, 0, 100)) : v; markEdited(p); saveSoon(); }
function sceneCapture() {
  const p = presets().find(x => x.id === S.sceneEdit);
  for (const did of Object.keys(p.levels)) { const d = dev(did); if (!d) continue; p.levels[did] = sceneEntryNow(d, 0); }
  markEdited(p); saveSoon(); reopenEditor(p.id); toast('Captured');
}
// "Back to the suggestion": the mood's computed levels again, and Update moods may refresh it from now on.
function sceneSuggest(id) {
  const p = presets().find(x => x.id === id); if (!p || !p.mood || !p.area) return;
  const m = moodById(p.mood); p.levels = moodLevels(p.area, m); p.fade = m.fade; p.name = `${areaName(p.area)} · ${m.name}`.slice(0, 60); p.edited = false;
  save({ msg: 'Back to the suggestion', render: S.view === 'scenes' }); reopenEditor(id);
}
function sceneDelete(id) {
  S.config.presets = presets().filter(x => x.id !== id);
  for (const b of bindings()) { b.actions = b.actions.filter(a => !(a.type === 'preset' && a.preset_id === id)); if (b.night) b.night.actions = b.night.actions.filter(a => !(a.type === 'preset' && a.preset_id === id)); }
  S.config.favorites = S.config.favorites.filter(f => f !== 'p:' + id);
  closeSheet(); save({ msg: 'Scene deleted' });
}
