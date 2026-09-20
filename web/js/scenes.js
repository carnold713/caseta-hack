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
    const all = presets(); const theirs = lutronScenes();
    const rooms = areas().filter(a => all.some(p => p.area === a.id));
    const loose = all.filter(p => !p.area);
    if (!all.length && !theirs.length) return `<div class="empty-state"><p class="body">Set your lights the way you like them, then save that look. A remote button can run it later.</p><button class="btn primary lg block" data-act="scene-new">New scene</button></div>`;
    // The tiles are the scenes (a scene is a picture). At rest a tile has one job: run the scene. Edit turns on the
    // pencils; a tap on a tile then opens its editor, and Done turns it off again.
    //
    // One list, grouped by the room a scene is filed under. There is no second kind of scene here any
    // more: the five a room is offered are scenes in that room's group, and a scene you made and gave a
    // room to sits beside them.
    const edit = !!S.scenesEdit;
    const corner = s => s.edit
      ? `<button class="iconbtn sm tile-edit" data-act="scene-edit" data-id="${s.edit}" aria-label="Edit ${esc(s.name)}">${ICON('edit', 'sm')}</button>`
      : `<button class="iconbtn sm tile-edit" data-act="scene-lutron" data-id="${s.lutron}" aria-label="About ${esc(s.name)}">${ICON('dots', 'sm')}</button>`;
    const tile = s => edit
      ? `<div class="tile editing" role="button" tabindex="0" data-act="${s.edit ? 'scene-edit' : 'scene-lutron'}" data-id="${s.edit || s.lutron}"><div class="face">${tileFaceHTML(tileItems(s.id))}${corner(s)}</div><div class="label"><div class="n">${esc(s.name)}</div><div class="s">${esc(s.sub)}</div></div></div>`
      : `<div class="tile" role="button" tabindex="0" data-act="run-scene" data-t="${s.id}"><div class="face">${tileFaceHTML(tileItems(s.id))}</div><div class="label"><div class="n">${esc(s.name)}</div><div class="s">${esc(s.sub)}</div></div></div>`;
    const asTile = p => ({ id: 'p:' + p.id, name: sceneShortName(p), sub: sceneSub(p), edit: p.id });
    let first = true;
    const group = (capn, tiles) => {
      if (!tiles.length) return '';
      const link = first && (all.length || theirs.length) ? `<button class="link" data-act="scenes-edit">${edit ? 'Done' : 'Edit'}</button>` : '';
      first = false;
      return `<div class="gh">${capn}${link}</div><div class="tiles grid">${tiles.map(tile).join('')}</div>`;
    };
    let h = rooms.map(a => group(esc(a.name), roomScenes(a.id).map(asTile))).join('');
    h += group(rooms.length ? 'Any room' : 'Scenes', loose.map(asTile));
    h += group('From the Lutron app', theirs.map(x => ({ id: 's:' + x.scene_id, name: x.name, sub: 'From the Lutron app', lutron: x.scene_id })));
    // a room that has never been offered its five: the one thing the tiles cannot show
    const toOffer = typeof suggestWalkRooms === 'function' ? suggestWalkRooms().filter(aid => !roomHasSuggested(aid)) : [];
    if (toOffer.length) h += `<div class="card pad0 list" style="margin-top:24px"><button class="item" data-act="moods-walk"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Suggest five scenes for a room</div><div class="d">Bright, Relax, Dinner, Movie and Night, from what each light is for</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
    return h;
  },
};
// where the scene editor came from, so its sub-sheets can return to it and it can return where it started
let SCENE_BACK = null;
const reopenEditor = id => openSceneEditor(id, false, { back: SCENE_BACK });
const sceneSub = p => `${plural(Object.keys(p.levels).length, 'light')}${
  p.fade === 0 ? ' · at once' : p.fade > SUGGESTED_FADE ? ` · fades over ${fmtDur(p.fade)}` : ''}`;
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
  const h = entryHex(c); const fill = h && lv > 0 ? lampFill(h, lv) : null;
  let row = `<div class="item">${lampHTML(lv, 28, '', '', false, fill)}<div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${d.domain === 'fan' ? cap(fanName(v)) : lv > 0 ? lv + '%' : 'Off'}</div></div>${ctl}</div>`;
  if (d.ct || d.color) row += valueRow(d.color ? 'Colour' : 'Warmth', `${colourDot(c)}<span data-scol="${d.device_id}">${esc(colourLabel(c))}</span>`, 'c-expand', `data-cns="scene" data-cid="${d.device_id}"`);
  return row;
};
// The scene editor's colour controls (js/color.js): the entry becomes {level, kelvin | hex}, {level, follow: true}
// for a lamp the scene sets to follow the day, or a plain level again.
function paintSceneEntry(id) {
  const p = presets().find(x => x.id === S.sceneEdit); if (!p) return;
  const c = colorOf(p.levels[id]), lv = levelOf(p.levels[id]);
  const lab = document.querySelector(`[data-scol="${id}"]`); if (lab) { lab.textContent = colourLabel(c); const dot = lab.previousElementSibling; if (dot) dot.outerHTML = colourDot(c); }
  const row = lab && lab.closest('.item') && lab.closest('.item').previousElementSibling; const lamp = row && row.querySelector('.lamp');
  const h = entryHex(c);
  if (lamp) lamp.style.background = h && lv > 0 ? lampFill(h, lv) : lampColor(lv);
}
colorHost('scene', {
  cur: id => { const p = presets().find(x => x.id === S.sceneEdit); return p ? colorOf(p.levels[id]) : null; },
  opts: id => ({ none: true, nested: true, follow: typeof canFollow === 'function' && canFollow(dev(id)) }),
  set(id, v) {
    const p = presets().find(x => x.id === S.sceneEdit); if (!p || !(id in p.levels)) return;
    const lv = levelOf(p.levels[id]);
    p.levels[id] = v ? { level: lv, ...v } : lv;
    markEdited(p); saveSoon();
    paintSceneEntry(id);
  },
  // "Follow the day" in place of a fixed colour: running the scene switches following on for that lamp and sets it
  // to the white for the moment it runs (the connector does both, agent/daylight.py).
  follow(id, on) {
    const p = presets().find(x => x.id === S.sceneEdit); if (!p || !(id in p.levels)) return;
    const lv = levelOf(p.levels[id]);
    p.levels[id] = on ? { level: lv, follow: true } : lv;
    markEdited(p); saveSoon();
    paintSceneEntry(id);
  },
});
// Lamps a scene sets to follow the day. Running it switches following on for them, so the app and the connector
// agree about what is following and it survives a restart.
function sceneFollowIds(p) { return Object.entries((p && p.levels) || {}).filter(([, v]) => v && typeof v === 'object' && v.follow === true).map(([id]) => id); }
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
  // One of the five a room was offered: a suggestion until the person changes it, and then it is theirs
  // and a refresh leaves it alone. Nothing else about it differs from any other scene.
  const mood = p.mood ? `<div class="tip"><div class="grow"><span class="cap">Suggested</span><div class="t">${p.edited ? 'Changed by you.' : 'One of the five this room was offered.'} Change anything you like; from then on it's yours and won't be replaced.</div>${p.edited ? `<button class="btn ghost" data-act="scene-suggest" data-id="${p.id}">Back to the suggestion</button>` : ''}</div></div>` : '';
  // The room a scene belongs to. This is the row that makes every scene the same thing: a scene with a
  // room shows on that room's page and in its step-through, and any scene can be given one or have it
  // taken away.
  const roomRow = valueRow('Room', esc(p.area ? areaName(p.area) : 'Any room'), 'scene-room', '', { sub: p.area ? `Shows on the ${esc(areaName(p.area))} page` : 'Shows under Any room' });
  const body = `${mood}<label class="field"><span>Name</span><input class="input" id="scene-name" value="${esc(p.name)}" ${fresh ? 'autofocus' : ''}></label>
    <div class="card pad0 list" style="margin-top:4px">${roomRow}</div>
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
// "Which room?": filing a scene under a room, or under none. A scene that came from the five keeps its
// note of which one it came from either way, so moving it out and back does not lose the suggestion.
function openSceneRoomSheet() {
  const p = presets().find(x => x.id === S.sceneEdit); if (!p) return;
  const row = (aid, name, sub) => `<button class="item" data-act="scene-room-pick" data-a="${esc(aid)}"><div class="ic">${ICON(aid ? roomIcon(name) : 'house', 'sm')}</div><div class="grow"><div class="t">${esc(name)}</div>${sub ? `<div class="d">${esc(sub)}</div>` : ''}</div>${(p.area || '') === aid ? `<span class="chk">${ICON('check', 'sm')}</span>` : ''}</button>`;
  const body = `<div class="card pad0 list">${row('', 'Any room', 'Listed on its own, not on a room page')}${areas().map(a => row(a.id, a.name, `${plural(roomScenes(a.id).filter(x => x.id !== p.id).length, 'scene')} there now`)).join('')}</div>`;
  showSheet('scene-room', 'Which room?', body, { detent: 'medium', back: true, onBack: reopenEditor, sub: 'A scene with a room shows on that page and steps through with the others there.' });
}
function setSceneRoom(aid) {
  const p = presets().find(x => x.id === S.sceneEdit); if (!p) return;
  const was = p.area || '';
  if (was === aid) { reopenEditor(p.id); return; }
  // the name carries the room ("Kitchen · Relax"), so it follows the scene rather than going stale
  const short = sceneShortName(p);
  p.area = aid || null;
  p.name = (aid ? `${areaName(aid)} · ${short}` : short).slice(0, 60);
  markEdited(p);
  save({ msg: aid ? `${cap(short)} is a ${areaName(aid)} scene` : `${cap(short)} is not in a room any more` });
  reopenEditor(p.id);
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
// Any change to one of the five marks it as the person's own, so a refresh leaves it alone.
function markEdited(p) { if (p && p.mood && !p.edited) { p.edited = true; const t = $('#sheet-root .tip .t'); if (t && /this room was offered/i.test(t.textContent)) reopenEditor(p.id); } }
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
// "Back to the suggestion": the computed levels again, and a refresh may replace it from now on.
function sceneSuggest(id) {
  const p = presets().find(x => x.id === id); if (!p || !p.mood || !p.area) return;   // a suggestion needs the room it was computed for
  const m = moodById(p.mood); p.levels = moodLevels(p.area, m); p.fade = m.fade; p.name = `${areaName(p.area)} · ${m.name}`.slice(0, 60); p.edited = false;
  save({ msg: 'Back to the suggestion', render: S.view === 'scenes' }); reopenEditor(id);
}
function sceneDelete(id) {
  S.config.presets = presets().filter(x => x.id !== id);
  for (const b of bindings()) { b.actions = b.actions.filter(a => !(a.type === 'preset' && a.preset_id === id)); if (b.night) b.night.actions = b.night.actions.filter(a => !(a.type === 'preset' && a.preset_id === id)); }
  S.config.favorites = S.config.favorites.filter(f => f !== 'p:' + id);
  closeSheet(); save({ msg: 'Scene deleted' });
}
