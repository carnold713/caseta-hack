/* Scenes: named looks. Yours are editable; Lutron's run as-is. */
'use strict';

VIEWS.scenes = {
  top() { return `<div><h1>Scenes</h1><div class="sub">A look for the whole house, one tap</div></div><button class="iconbtn" data-act="scene-new" title="New scene">${ICON('plus')}</button>`; },
  body() {
    const mine = presets(); const theirs = lutronScenes();
    if (!mine.length && !theirs.length) return `<div class="empty enter"><div class="ill">${ICON('scene', 'lg')}</div><h3>No scenes yet</h3><p>Set the lights the way you like them, then save that look as a scene. A remote button can run it later.</p><button class="btn primary" data-act="scene-new">${ICON('plus', 'sm')} New scene</button></div>`;
    let h = '';
    if (mine.length) h += `<div class="h2">Your scenes</div><div class="card pad0 list">${mine.map(p => `<div class="item"><button class="ic teal" data-act="run-scene" data-t="p:${p.id}" title="Run">${ICON('play', 'sm')}</button><button class="grow" data-act="scene-edit" data-id="${p.id}" style="text-align:left;color:inherit"><div class="t">${esc(p.name)}</div><div class="d">${Object.keys(p.levels).length} lights${p.fade ? ` · fades over ${fmtDur(p.fade)}` : ''}</div></button><button class="iconbtn ${S.config.favorites.includes('p:' + p.id) ? 'on' : ''}" data-act="fav" data-t="p:${p.id}">${ICON('star', 'sm')}</button><button class="iconbtn" data-act="scene-edit" data-id="${p.id}">${ICON('edit', 'sm')}</button></div>`).join('')}</div>`;
    if (theirs.length) h += `<div class="h2">From the Lutron app</div><div class="card pad0 list">${theirs.map(s => `<div class="item"><button class="ic" data-act="run-scene" data-t="s:${s.scene_id}" title="Run">${ICON('play', 'sm')}</button><div class="grow"><div class="t">${esc(s.name)}</div><div class="d">Edit it in the Lutron app</div></div><button class="iconbtn ${S.config.favorites.includes('s:' + s.scene_id) ? 'on' : ''}" data-act="fav" data-t="s:${s.scene_id}">${ICON('star', 'sm')}</button></div>`).join('')}</div>`;
    h += `<div class="spacer"></div><button class="btn block" data-act="scene-new">${ICON('plus', 'sm')} New scene</button>`;
    return h;
  },
};

function newScene() {
  const p = { id: uid(), name: 'New scene', levels: {}, fade: null };
  // Start from the lights that are on right now: that is almost always what the person wants to keep.
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
        if (d.domain === 'fan') ctl = `<select class="input" style="width:120px" data-scene-lvl="${d.device_id}">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<option value="${s}" ${v === s ? 'selected' : ''}>${fanName(s)}</option>`).join('')}</select>`;
        else if (d.domain === 'switch') ctl = `<button class="sw ${v > 0 ? 'on' : ''}" data-act="scene-sw" data-id="${d.device_id}"></button>`;
        else ctl = `<div style="width:150px"><input class="slider thin" type="range" min="0" max="100" value="${v}" style="--p:${v}%" data-scene-lvl="${d.device_id}"></div>`;
      }
      return `<div class="item"><input type="checkbox" class="check-in" style="width:22px;height:22px;accent-color:var(--amber)" ${inc ? 'checked' : ''} data-act="scene-inc" data-id="${d.device_id}"><div class="grow"><div class="t">${esc(d.name)}</div>${inc ? '' : '<div class="d">Left alone</div>'}</div>${ctl}</div>`;
    }).join('')}</div>`;
  }).join('');
  const body = `<label class="field"><span>Name</span><input class="input" id="scene-name" value="${esc(p.name)}" ${fresh ? 'autofocus' : ''}></label>
    <label class="field"><span>Change gradually over</span><select class="input" id="scene-fade">${[['', 'Default'], [0, 'Instantly'], [1, '1 second'], [3, '3 seconds'], [8, '8 seconds'], [30, '30 seconds'], [300, '5 minutes'], [900, '15 minutes'], [1800, '30 minutes']].map(([v, l]) => `<option value="${v}" ${String(p.fade == null ? '' : p.fade) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="row wrap"><button class="btn" data-act="scene-capture">${ICON('copy', 'sm')} Use the lights as they are now</button><button class="btn ghost" data-act="run-scene" data-t="p:${p.id}">${ICON('play', 'sm')} Try it</button></div>
    ${rows}<div class="spacer"></div><button class="btn primary block" data-act="sheet-close">Done</button><div class="spacer"></div><button class="btn ghost danger block" data-act="scene-delete" data-id="${p.id}">Delete this scene</button>`;
  sheet.open(fresh ? 'New scene' : 'Edit scene', body);
}
function sceneEdit(k, v) {
  const p = presets().find(x => x.id === S.sceneEdit); if (!p) return;
  if (k === 'name') p.name = v.trim() || 'Untitled';
  if (k === 'fade') p.fade = v === '' ? null : Number(v);
  saveSoon();
}
function sceneInclude(did, on) {
  const p = presets().find(x => x.id === S.sceneEdit); const d = dev(did);
  if (on) p.levels[did] = d.domain === 'fan' ? ((S.states[did] || {}).fan_speed || 'Off') : (level(did) ?? 100); else delete p.levels[did];
  saveSoon(); openSceneEditor(p.id);
}
function sceneLevel(did, v) { const p = presets().find(x => x.id === S.sceneEdit); p.levels[did] = typeof v === 'number' ? clamp(v, 0, 100) : v; saveSoon(); }
function sceneCapture() {
  const p = presets().find(x => x.id === S.sceneEdit);
  for (const did of Object.keys(p.levels)) { const d = dev(did); if (!d) continue; p.levels[did] = d.domain === 'fan' ? ((S.states[did] || {}).fan_speed || 'Off') : (level(did) ?? 0); }
  saveSoon(); openSceneEditor(p.id); toast('Captured');
}
function sceneDelete(id) {
  S.config.presets = presets().filter(x => x.id !== id);
  for (const b of bindings()) { b.actions = b.actions.filter(a => !(a.type === 'preset' && a.preset_id === id)); if (b.night) b.night.actions = b.night.actions.filter(a => !(a.type === 'preset' && a.preset_id === id)); }
  S.config.favorites = S.config.favorites.filter(f => f !== 'p:' + id);
  sheet.close(); save({ msg: 'Scene deleted' });
}
