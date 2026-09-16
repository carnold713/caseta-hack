/* Scenes: named looks. Yours are editable; Lutron's run as-is. */
'use strict';

VIEWS.scenes = {
  top() { return `<div class="t1">Scenes</div><div class="tools"><button class="iconbtn on" data-act="scene-new" title="New scene">${ICON('plus')}</button>${statusCircle()}</div>`; },
  body() {
    const mine = presets().filter(p => !(p.mood && p.area)); const theirs = lutronScenes();
    const moods = typeof roomMoodsSectionHTML === 'function' ? roomMoodsSectionHTML() : '';
    if (!mine.length && !theirs.length && !moods) return `<button class="tip" data-act="scene-new" style="margin-top:8px"><div class="grow"><span class="cap">Scenes</span><div class="t">Set the lights the way you like them, then save that look</div><div class="d">A remote button can run it later.</div></div><span class="go">${ICON('plus')}</span></button>`;
    let h = '';
    const row = (t, name, sub, extra) => `<div class="item"><button class="ic" data-act="run-scene" data-t="${t}" title="Run">${ICON('play', 'sm')}</button><div class="grow"><div class="t">${esc(name)}</div><div class="d">${esc(sub)}</div></div><button class="iconbtn plain ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="fav" data-t="${t}">${ICON('star', 'sm')}</button>${extra || ''}</div>`;
    if (mine.length) h += `<div class="h2">Your scenes</div><div class="card pad0 list">${mine.map(p => row('p:' + p.id, p.name, `${Object.keys(p.levels).length} lights${p.fade ? ` · fades over ${fmtDur(p.fade)}` : ''}`, `<button class="iconbtn plain" data-act="scene-edit" data-id="${p.id}">${ICON('edit', 'sm')}</button>`)).join('')}</div>`;
    if (theirs.length) h += `<div class="h2">From the Lutron app</div><div class="card pad0 list">${theirs.map(s => row('s:' + s.scene_id, s.name, 'Edit it in the Lutron app')).join('')}</div>`;
    h += moods;
    h += `<div class="spacer"></div><div class="card pad0 list"><button class="item" data-act="scene-new"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">New scene</div></div></button></div>`;
    return h;
  },
};

function newScene() {
  const p = { id: uid(), name: 'New scene', levels: {}, fade: null };
  for (const d of controllable()) { if (d.domain === 'cover') continue; if (isOn(d.device_id)) p.levels[d.device_id] = d.domain === 'fan' ? ((S.states[d.device_id] || {}).fan_speed || 'Off') : (level(d.device_id) ?? 100); }
  S.config.presets.push(p);
  save({ quiet: true, render: true });
  openSceneEditor(p.id, true);
}
function openSceneEditor(id, fresh = false) {
  const p = presets().find(x => x.id === id); if (!p) return;
  S.sceneEdit = id;
  const rows = areas().map(a => {
    const ds = controllable().filter(d => (d.area || 'none') === a.id && d.domain !== 'cover');
    if (!ds.length) return '';
    return `<div class="h2">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => {
      const inc = d.device_id in p.levels; const v = p.levels[d.device_id];
      let ctl = '';
      if (inc) {
        if (d.domain === 'fan') ctl = `<select class="input" style="width:130px;min-height:40px;padding:6px 32px 6px 12px" data-scene-lvl="${d.device_id}">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<option value="${s}" ${v === s ? 'selected' : ''}>${cap(fanName(s))}</option>`).join('')}</select>`;
        else if (d.domain === 'switch') ctl = `<button class="sw ${v > 0 ? 'on' : ''}" data-act="scene-sw" data-id="${d.device_id}"></button>`;
        else ctl = `<div class="sliderwrap" style="width:140px"><input class="slider" type="range" min="0" max="100" value="${v}" style="--p:${v}%" data-scene-lvl="${d.device_id}"><div class="stip"></div></div>`;
      }
      return `<div class="item"><input type="checkbox" class="cb" ${inc ? 'checked' : ''} data-act="scene-inc" data-id="${d.device_id}"><div class="grow"><div class="t">${esc(d.name)}</div>${inc ? `<div class="d">${d.domain === 'fan' ? cap(fanName(v)) : v > 0 ? v + '%' : 'Off'}</div>` : '<div class="d none">Left alone</div>'}</div>${ctl}</div>`;
    }).join('')}</div>`;
  }).join('');
  // A room mood: a suggested scene until the person changes it; then it is theirs and Update moods leaves it alone.
  const mood = p.mood && p.area ? `<div class="tip" style="margin-top:8px"><div class="grow"><span class="cap">Room mood</span><div class="t">${p.edited ? 'Changed by you.' : 'A suggested mood.'} Change anything you like; from then on it's yours and won't be replaced.</div>${p.edited ? `<button class="btn ghost" data-act="scene-suggest" data-id="${p.id}">Back to the suggestion</button>` : ''}</div></div>` : '';
  const body = `${mood}<label class="field"><span>Name</span><input class="input" id="scene-name" value="${esc(p.name)}" ${fresh ? 'autofocus' : ''}></label>
    <label class="field"><span>Change gradually over</span><select class="input" id="scene-fade">${[['', 'Default'], [0, 'Instantly'], [1, '1 second'], [3, '3 seconds'], [8, '8 seconds'], [30, '30 seconds'], [300, '5 minutes'], [900, '15 minutes'], [1800, '30 minutes']].map(([v, l]) => `<option value="${v}" ${String(p.fade == null ? '' : p.fade) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="btnpair"><button class="btn" data-act="scene-capture">${ICON('copy', 'sm')} Use the lights as they are</button><button class="btn" data-act="run-scene" data-t="p:${p.id}">${ICON('play', 'sm')} Try it</button></div>
    ${rows}<div class="spacer"></div><button class="btn danger block" data-act="scene-delete" data-id="${p.id}">Delete this scene</button>
    <div class="sfoot"><button class="btn primary lg block" data-act="sheet-close">Done</button></div>`;
  sheet.open(fresh ? 'What should your lights do?' : (p.mood && p.area ? esc(p.name) : 'Edit scene'), body, { sub: 'Turn lights on, off or set them to a level.' });
}
// Any change to a room mood marks it as the person's own.
function markEdited(p) { if (p && p.mood && p.area && !p.edited) { p.edited = true; const t = $('#sheet-root .tip .t'); if (t && /suggested mood/i.test(t.textContent)) openSceneEditor(p.id); } }
function sceneEdit(k, v) {
  const p = presets().find(x => x.id === S.sceneEdit); if (!p) return;
  if (k === 'name') p.name = v.trim() || 'Untitled';
  if (k === 'fade') p.fade = v === '' ? null : Number(v);
  markEdited(p); saveSoon();
}
function sceneInclude(did, on) {
  const p = presets().find(x => x.id === S.sceneEdit); const d = dev(did);
  if (on) p.levels[did] = d.domain === 'fan' ? ((S.states[did] || {}).fan_speed || 'Off') : (level(did) ?? 100); else delete p.levels[did];
  markEdited(p); saveSoon(); openSceneEditor(p.id);
}
function sceneLevel(did, v) { const p = presets().find(x => x.id === S.sceneEdit); p.levels[did] = typeof v === 'number' ? clamp(v, 0, 100) : v; markEdited(p); saveSoon(); }
function sceneCapture() {
  const p = presets().find(x => x.id === S.sceneEdit);
  for (const did of Object.keys(p.levels)) { const d = dev(did); if (!d) continue; p.levels[did] = d.domain === 'fan' ? ((S.states[did] || {}).fan_speed || 'Off') : (level(did) ?? 0); }
  markEdited(p); saveSoon(); openSceneEditor(p.id); toast('Captured');
}
// "Back to the suggestion": the mood's computed levels again, and Update moods may refresh it from now on.
function sceneSuggest(id) {
  const p = presets().find(x => x.id === id); if (!p || !p.mood || !p.area) return;
  const m = moodById(p.mood); p.levels = moodLevels(p.area, m); p.fade = m.fade; p.name = `${areaName(p.area)} · ${m.name}`.slice(0, 60); p.edited = false;
  save({ msg: 'Back to the suggestion', render: S.view === 'scenes' }); openSceneEditor(id);
}
function sceneDelete(id) {
  S.config.presets = presets().filter(x => x.id !== id);
  for (const b of bindings()) { b.actions = b.actions.filter(a => !(a.type === 'preset' && a.preset_id === id)); if (b.night) b.night.actions = b.night.actions.filter(a => !(a.type === 'preset' && a.preset_id === id)); }
  S.config.favorites = S.config.favorites.filter(f => f !== 'p:' + id);
  sheet.close(); save({ msg: 'Scene deleted' });
}
