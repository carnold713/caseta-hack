/* Remotes: pick a button on the picture, say what it does. */
'use strict';

VIEWS.remotes = {
  top() {
    if (S.remote && dev(S.remote)) {
      const d = dev(S.remote);
      return `<div class="row"><button class="iconbtn" data-act="remote-back">${ICON('back')}</button><div><h1 style="font-size:22px">${esc(d.name)}</h1><div class="sub">${esc(areaName(d.area))} · ${esc(modelName(d))}</div></div></div>${connPill()}`;
    }
    return `<div><h1>Remotes</h1><div class="sub">Press a button on any remote to open it here</div></div>${connPill()}`;
  },
  body() {
    if (S.remote && dev(S.remote)) return remoteDetail(dev(S.remote));
    const list = remotes();
    if (!list.length) return controllable().length ? `<div class="empty enter"><div class="ill">${ICON('remote', 'lg')}</div><h3>No remotes found</h3><p>Pair a Pico in the Lutron app, then look again.</p><button class="btn" data-act="refresh">${ICON('refresh', 'sm')}Look again</button></div>` : setupEmpty();
    return list.map(remoteCard).join('');
  },
};

function remoteCard(d) {
  const bs = bindings().filter(b => b.device_id === d.device_id);
  const n = new Set(bs.map(b => b.button_number)).size;
  const broken = bs.some(b => bindingBroken(b));
  const sub = n ? `${n} ${n === 1 ? 'button' : 'buttons'} set up` : 'Not set up yet';
  return `<button class="remote-card enter" data-act="remote-open" data-id="${d.device_id}">${picoHTML(d, 'mini')}<div class="grow"><div class="n">${esc(d.name)}</div><div class="s">${esc(areaName(d.area))} · ${esc(sub)}</div>${broken ? `<div class="badge">Needs attention</div>` : ''}</div>${ICON('chev', 'sm')}</button>`;
}
function bindingBroken(b) {
  const acts = [...(b.actions || []), ...((b.night && b.night.actions) || [])];
  return acts.some(a => (a.target && !targetExists(a.target)) || (a.type === 'scene' && !targetExists('s:' + a.scene_id)) || (a.type === 'preset' && !targetExists('p:' + a.preset_id)));
}
function picoHTML(d, cls = '') {
  const btns = buttonsOf(d.device_id);
  const set = new Set(bindings().filter(b => b.device_id === d.device_id).map(b => b.button_number));
  return `<div class="pico ${cls}">${btns.map(b => {
    const n = b.button_number; const lbl = buttonLabel(d.device_id, n);
    const round = lbl === 'Round'; const half = /Raise|Lower/.test(lbl);
    return `<button class="pb ${round ? 'round' : ''} ${half ? 'half' : ''} ${set.has(n) ? 'set' : ''}" data-live="${d.device_id}/${n}" ${cls ? 'tabindex="-1"' : `data-act="button-open" data-n="${n}"`}>${cls ? '' : esc(round ? '●' : lbl)}</button>`;
  }).join('')}</div>`;
}
function remoteDetail(d) {
  const btns = buttonsOf(d.device_id);
  const rows = btns.map(b => {
    const n = b.button_number;
    const lines = ['single', 'double', 'hold'].map(g => { const acts = gestureActions(d.device_id, n, g); return acts.length ? `<span class="faint">${GESTURE_LABEL[g]}:</span> ${esc(describe(acts))}` : null; }).filter(Boolean);
    return `<button class="item" data-act="button-open" data-n="${n}"><div class="ic">${esc(buttonLabel(d.device_id, n) === 'Round' ? '●' : buttonLabel(d.device_id, n))}</div><div class="grow"><div class="t">${esc(buttonTitleCap(d.device_id, n))}</div><div class="d ${lines.length ? '' : 'none'}">${lines.length ? lines.join('<br>') : 'Nothing yet'}</div></div>${ICON('chev', 'sm')}</button>`;
  }).join('');
  return `<div class="remote-hero enter">${picoHTML(d)}<div class="hint">Tap a button on the picture, or press it on the real remote.</div></div>
    <div class="card pad0 list enter">${rows}</div>
    <details class="more"><summary>${ICON('chev', 'sm')}This remote may still do what the Lutron app set up</summary><div class="muted small">Both things happen: what the Lutron app programmed and what you set here. To make a remote fully yours, open the Lutron app, tap this remote, and remove the lights it controls (keep it paired). Leave it as is if you only want to add a double press or a hold on top.</div></details>`;
}
function buttonTitleCap(pid, n) { const t = buttonTitle(pid, n); return t.charAt(0).toUpperCase() + t.slice(1); }

// Actions the user sees for a gesture, merging the hold_start/hold_end pair into "hold".
function gestureActions(pid, n, g, night = false) {
  if (g !== 'hold') { const b = binding(pid, n, g); return b ? (night ? ((b.night && b.night.actions) || []) : b.actions) : []; }
  const hs = binding(pid, n, 'hold_start'); const h = binding(pid, n, 'hold');
  const b = hs || h; if (!b) return [];
  return night ? ((b.night && b.night.actions) || []) : b.actions;
}

// ----- gesture sheet -----
function openButtonSheet(n) {
  const pid = S.remote; S.button = n;
  const title = buttonTitleCap(pid, n);
  const body = ['single', 'double', 'hold'].map(g => {
    const acts = gestureActions(pid, n, g); const night = gestureActions(pid, n, g, true);
    const b = g === 'hold' ? (binding(pid, n, 'hold_start') || binding(pid, n, 'hold')) : binding(pid, n, g);
    const broken = b && bindingBroken(b);
    return `<button class="item" data-act="gesture-open" data-g="${g}" data-grow="${n}/${g}"><div class="ic ${acts.length ? 'amber' : ''}">${ICON(g === 'single' ? 'bolt' : g === 'double' ? 'copy' : 'clock', 'sm')}</div><div class="grow"><div class="t">${GESTURE_LABEL[g]}</div><div class="d ${acts.length ? '' : 'none'}">${acts.length ? esc(describe(acts)) : 'Nothing yet'}</div>${night.length ? `<div class="d">${ICON('moon', 'sm')} At night: ${esc(describe(night))}</div>` : ''}${broken ? `<div class="d" style="color:var(--amber)">Points at something that is gone. Pick again.</div>` : ''}</div>${ICON('chev', 'sm')}</button>`;
  }).join('');
  sheet.open(title, `<div class="card pad0 list gestures">${body}</div><p class="faint tiny" style="margin:12px 4px 0">A press on a button that also has "press twice" waits a moment to tell them apart.</p>`, { sub: 'What should each kind of press do?' });
}

// ----- recipe sheet -----
const RECIPES = [
  { id: 'toggle', t: 'Turn on or off', d: 'On if any light is off, otherwise off', mk: T => [{ type: 'level', target: T, level: 'toggle' }] },
  { id: 'on', t: 'Turn on', mk: T => [{ type: 'level', target: T, level: 'on' }] },
  { id: 'off', t: 'Turn off', mk: T => [{ type: 'level', target: T, level: 'off' }] },
  { id: 'full', t: 'Full brightness', mk: T => [{ type: 'level', target: T, level: 100 }] },
  { id: 'half', t: 'Half brightness', mk: T => [{ type: 'level', target: T, level: 50 }] },
  { id: 'night', t: 'Nightlight', d: 'Very dim, 10%', mk: T => [{ type: 'level', target: T, level: 10, fade: 1 }] },
  { id: 'movie', t: 'Movie mode', d: 'Slowly dims to 20% over 8 seconds', mk: T => [{ type: 'level', target: T, level: 20, fade: 8 }] },
  { id: 'cycle', t: 'Step through brightness', d: 'Bright, half, low, off. One step per press', mk: T => [{ type: 'cycle', target: T, levels: [100, 50, 20, 0] }] },
  { id: 'up', t: 'A little brighter', mk: T => [{ type: 'step', target: T, delta: 10 }] },
  { id: 'down', t: 'A little dimmer', mk: T => [{ type: 'step', target: T, delta: -10 }] },
  { id: 'hold_up', t: 'Brighten while holding', d: 'Stops when you let go', hold: true, pair: T => ({ start: [{ type: 'raise', target: T }], end: [{ type: 'stop', target: T }] }) },
  { id: 'hold_down', t: 'Dim while holding', d: 'Stops when you let go', hold: true, pair: T => ({ start: [{ type: 'lower', target: T }], end: [{ type: 'stop', target: T }] }) },
  { id: 'sleep', t: 'Sleep timer', d: 'Turns off after 20 minutes', mk: T => [{ type: 'timer', target: T, minutes: 20, fade: 5 }] },
  { id: 'alloff', t: 'Turn everything off', d: 'Every light in the house', any: true, mk: () => [{ type: 'level', target: 'h:all', level: 'off' }] },
  { id: 'scene', t: 'Run a scene…', any: true, pick: true },
  { id: 'fan_up', t: 'Fan: faster', fan: true, mk: T => [{ type: 'step', target: T, delta: 1 }] },
  { id: 'fan_down', t: 'Fan: slower', fan: true, mk: T => [{ type: 'step', target: T, delta: -1 }] },
];
function recipeOf(actions) {
  if (!actions || !actions.length) return 'nothing';
  const a = actions[0];
  if (actions.length === 1) {
    if (a.type === 'level' && a.target === 'h:all' && a.level === 'off') return 'alloff';
    if (a.type === 'level') { if (a.level === 'toggle') return 'toggle'; if (a.level === 'on') return 'on'; if (a.level === 'off') return 'off'; if (a.level === 100 && !a.fade) return 'full'; if (a.level === 50 && !a.fade) return 'half'; if (a.level === 10) return 'night'; if (a.level === 20 && a.fade === 8) return 'movie'; }
    if (a.type === 'cycle') return 'cycle';
    if (a.type === 'step') { const f = dev((a.target || '').slice(2)); if (f && f.domain === 'fan') return a.delta > 0 ? 'fan_up' : 'fan_down'; return a.delta > 0 ? 'up' : 'down'; }
    if (a.type === 'raise') return 'hold_up'; if (a.type === 'lower') return 'hold_down';
    if (a.type === 'timer') return 'sleep';
    if (a.type === 'scene' || a.type === 'preset') return 'scene';
  }
  return 'custom';
}
function defaultTarget(pid) { const d = dev(pid); return d && d.area && targetDevices(`a:${d.area}`).length ? `a:${d.area}` : (controllable()[0] ? `a:${controllable()[0].area || 'none'}` : 'h:all'); }

function openRecipeSheet(g, night = false) {
  const pid = S.remote, n = S.button; S.gesture = g; S.night = night;
  const acts = gestureActions(pid, n, g, night);
  const cur = acts.find(a => a.target && !a.target.startsWith('h:'));
  if (!S.pickTarget) S.pickTarget = (cur && cur.target) || defaultTarget(pid);
  renderRecipeSheet();
}
function renderRecipeSheet() {
  const pid = S.remote, n = S.button, g = S.gesture, night = S.night;
  const acts = gestureActions(pid, n, g, night);
  const selected = recipeOf(acts);
  const T = S.pickTarget;
  const tdev = T.startsWith('d:') ? dev(T.slice(2)) : null;
  const isFan = tdev && tdev.domain === 'fan';
  const hasNormal = gestureActions(pid, n, g).length > 0;
  const seg = hasNormal ? `<div class="seg" style="margin-bottom:14px"><button class="${night ? '' : 'on'}" data-act="recipe-mode" data-night="0">${ICON('sun', 'sm')} Normally</button><button class="${night ? 'on' : ''}" data-act="recipe-mode" data-night="1">${ICON('moon', 'sm')} At night</button></div>` : '';
  const nightNote = night ? `<p class="muted small" style="margin:0 0 12px">Between ${fmtTime(S.config.settings.night_start)} and ${fmtTime(S.config.settings.night_end)} this button does this instead. <a data-act="nav" data-view="settings" href="#settings">Change the hours</a></p>` : '';
  const chipsT = [defaultTarget(pid), 'h:all', ...areas().map(a => `a:${a.id}`)].filter((v, i, arr) => arr.indexOf(v) === i && targetExists(v));
  if (!chipsT.includes(T)) chipsT.splice(1, 0, T);
  const which = `<div class="h2" style="margin-top:0">Which lights?</div><div class="chips scroll">${chipsT.map(t => `<button class="chip ${t === T ? 'sel' : ''}" data-act="pick-target" data-t="${esc(t)}">${esc(cap(targetName(t)))}</button>`).join('')}<button class="chip" data-act="pick-target-more">${ICON('dots', 'sm')}Specific lights</button></div>`;
  const list = RECIPES.filter(r => (!r.hold || g === 'hold') && (!r.fan || isFan) && (r.fan || !isFan || r.any)).map(r => `<button class="recipe ${selected === r.id ? 'sel' : ''}" data-act="recipe" data-r="${r.id}"><div class="grow"><div class="t">${r.t}</div>${r.d ? `<div class="d">${r.d}</div>` : ''}</div>${selected === r.id ? ICON('check', 'sm') : ''}</button>`).join('');
  const nothing = `<button class="recipe ${selected === 'nothing' ? 'sel' : ''}" data-act="recipe" data-r="nothing"><div class="grow"><div class="t">Nothing</div>${night ? '<div class="d">Same as normally</div>' : ''}</div></button>`;
  const custom = selected === 'custom' ? `<div class="banner" style="margin-top:12px">${ICON('bolt')}<div><b>Custom:</b> ${esc(describe(acts))}</div></div>` : '';
  const more = `<details class="more"><summary>${ICON('chev', 'sm')}More options</summary><div><button class="btn block" data-act="advanced">Fine-tune: fade times, several steps, timers…</button></div></details>`;
  const test = acts.length ? `<button class="btn ghost block" data-act="try-actions" style="margin-top:8px">${ICON('play', 'sm')} Try it now</button>` : '';
  sheet.open(GESTURE_LABEL[g], `${seg}${nightNote}${which}<div class="h2">What should happen?</div>${nothing}${list}${custom}${more}${test}`, { back: true, sub: buttonTitleCap(pid, n), onBack: () => openButtonSheet(n) });
}
function applyRecipe(rid) {
  const pid = S.remote, n = S.button, g = S.gesture, night = S.night, T = S.pickTarget;
  const r = RECIPES.find(x => x.id === rid);
  if (r && r.pick) { openScenePicker(); return; }
  let actions = [];
  if (rid !== 'nothing') actions = r.pair ? null : r.mk(T);
  const cfg = S.config;
  const remove = gs => { cfg.bindings = cfg.bindings.filter(b => !(b.device_id === pid && b.button_number === n && gs.includes(b.gesture))); };
  if (night) {
    const b = g === 'hold' ? (binding(pid, n, 'hold_start') || binding(pid, n, 'hold')) : binding(pid, n, g);
    if (!b) return;
    if (rid === 'nothing') b.night = null;
    else if (r.pair) { const p = r.pair(T); const b2 = binding(pid, n, 'hold_end'); b.night = { actions: p.start }; if (b2) b2.night = { actions: p.end }; }
    else b.night = { actions };
    if (b.gesture === 'hold_start' && !r.pair && rid !== 'nothing') { const b2 = binding(pid, n, 'hold_end'); if (b2) b2.night = { actions: [] }; }
  } else if (g === 'hold') {
    const prev = binding(pid, n, 'hold_start') || binding(pid, n, 'hold');
    const keepNight = prev && prev.night;
    remove(['hold', 'hold_start', 'hold_end']);
    if (rid !== 'nothing') {
      if (r.pair) { const p = r.pair(T); cfg.bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: 'hold_start', actions: p.start, night: keepNight || null }, { id: uid(), device_id: pid, button_number: n, gesture: 'hold_end', actions: p.end, night: null }); }
      else cfg.bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: 'hold', actions, night: keepNight || null });
    }
  } else {
    const prev = binding(pid, n, g);
    remove([g]);
    if (rid !== 'nothing') cfg.bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: g, actions, night: (prev && prev.night) || null });
  }
  const acts = rid === 'nothing' ? [] : (r.pair ? r.pair(T).start : actions);
  save({ msg: acts.length ? describe(acts) : 'Cleared', render: true });
  renderRecipeSheet();
}
function openScenePicker() {
  const items = [...presets().map(p => ({ a: { type: 'preset', preset_id: p.id }, n: p.name, s: 'Your scene' })), ...lutronScenes().map(s => ({ a: { type: 'scene', scene_id: s.scene_id }, n: s.name, s: 'From the Lutron app' }))];
  const body = items.length ? `<div class="card pad0 list">${items.map((it, i) => `<button class="item" data-act="pick-scene" data-i="${i}"><div class="ic teal">${ICON('scene', 'sm')}</div><div class="grow"><div class="t">${esc(it.n)}</div><div class="d">${it.s}</div></div></button>`).join('')}</div>` : `<div class="empty"><h3>No scenes yet</h3><p>Make one on the Scenes tab first.</p></div>`;
  S.scenePick = items;
  sheet.open('Which scene?', body, { back: true, onBack: renderRecipeSheet });
}
function pickScene(i) {
  const it = S.scenePick[i];
  const pid = S.remote, n = S.button, g = S.gesture, night = S.night;
  if (night) { const b = g === 'hold' ? (binding(pid, n, 'hold_start') || binding(pid, n, 'hold')) : binding(pid, n, g); if (b) b.night = { actions: [it.a] }; }
  else {
    S.config.bindings = S.config.bindings.filter(b => !(b.device_id === pid && b.button_number === n && (b.gesture === g || (g === 'hold' && ['hold_start', 'hold_end'].includes(b.gesture)))));
    S.config.bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: g, actions: [it.a], night: null });
  }
  save({ msg: `Runs the ${it.n} scene` });
  renderRecipeSheet();
}
function openTargetPicker(onPick) {
  const opts = targetOptions();
  S.targetPick = { opts, onPick };
  const body = `<div class="card pad0 list">${opts.map((o, i) => `<button class="item" data-act="pick-target-item" data-i="${i}"><div class="ic ${o.kind === 'room' || o.kind === 'all' ? 'amber' : ''}">${ICON(o.kind === 'room' ? 'house' : o.kind === 'all' ? 'power' : o.kind === 'group' ? 'copy' : domainIcon(o.kind), 'sm')}</div><div class="grow"><div class="t">${esc(o.name)}</div><div class="d">${esc(o.sub)}</div></div></button>`).join('')}</div>
    <p class="faint small" style="margin:12px 4px 0">Want a few specific lights together? Make a set under Settings › Light sets.</p>`;
  sheet.open('Which lights?', body, { back: true, onBack: renderRecipeSheet });
}

// ----- advanced editor -----
const ACTION_LABELS = { level: 'Set brightness', step: 'Brighter or dimmer by', cycle: 'Step through levels', raise: 'Brighten while holding', lower: 'Dim while holding', stop: 'Stop brightening or dimming', fan: 'Set fan speed', scene: 'Run a scene', preset: 'Run a scene', timer: 'Turn off after a while', cancel_timer: 'Cancel a timer', delay: 'Then wait' };
function currentBindingForEdit() {
  const pid = S.remote, n = S.button, g = S.gesture;
  return g === 'hold' ? (binding(pid, n, 'hold_start') || binding(pid, n, 'hold')) : binding(pid, n, g);
}
function openAdvanced() {
  let b = currentBindingForEdit();
  if (!b) { b = { id: uid(), device_id: S.remote, button_number: S.button, gesture: S.gesture, actions: [], night: null }; S.config.bindings.push(b); }
  if (S.night && !b.night) b.night = { actions: [] };
  renderAdvanced();
}
function renderAdvanced() {
  const b = currentBindingForEdit(); if (!b) return renderRecipeSheet();
  const list = S.night ? b.night.actions : b.actions;
  const rows = list.map((a, i) => actionEditor(a, i)).join('') || '<p class="muted">No steps yet.</p>';
  const body = `${rows}<div class="row" style="margin-top:12px"><button class="btn" data-act="adv-add">${ICON('plus', 'sm')} Add a step</button><button class="btn ghost" data-act="try-actions">${ICON('play', 'sm')} Try it</button></div>
  ${b.gesture === 'hold_start' ? `<p class="faint small" style="margin-top:14px">This runs when the hold begins; "Stop" is sent automatically when you let go.</p>` : ''}
  <div class="spacer"></div><button class="btn primary block" data-act="adv-done">Done</button>`;
  sheet.open(`Fine-tune: ${GESTURE_LABEL[S.gesture]}${S.night ? ' at night' : ''}`, body, { back: true, onBack: renderRecipeSheet });
}
function actionEditor(a, i) {
  const sel = (k, opts) => `<select class="input" data-adv="${i}" data-k="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(a[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const tgt = (fans) => sel('target', targetOptions({ fansOnly: fans }).map(o => [o.id, o.kind === 'room' ? `${o.name} (room)` : o.name]));
  const fade = () => `<label class="field"><span>Change gradually over</span>${sel('fade', [['', 'Default'], [0, 'Instantly'], [1, '1 second'], [3, '3 seconds'], [8, '8 seconds'], [30, '30 seconds'], [120, '2 minutes'], [600, '10 minutes'], [1200, '20 minutes'], [1800, '30 minutes']])}</label>`;
  let body = `<label class="field"><span>Step ${i + 1}</span>${sel('type', Object.entries(ACTION_LABELS).filter(([k]) => k !== 'preset'))}</label>`;
  switch (a.type) {
    case 'level': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label><label class="field"><span>Brightness</span>${sel('level', [['toggle', 'On or off (toggle)'], ['on', 'On'], ['off', 'Off'], ...[100, 90, 75, 60, 50, 40, 30, 20, 10, 5].map(v => [v, v + '%'])])}</label>${fade()}`; break;
    case 'step': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label><label class="field"><span>Amount</span>${sel('delta', [[25, 'Much brighter'], [10, 'A little brighter'], [5, 'Slightly brighter'], [1, 'Fan: one speed faster'], [-1, 'Fan: one speed slower'], [-5, 'Slightly dimmer'], [-10, 'A little dimmer'], [-25, 'Much dimmer']])}</label>`; break;
    case 'cycle': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label><label class="field"><span>Levels, in order</span><input class="input" data-adv="${i}" data-k="levels" value="${esc((a.levels || []).join(', '))}" placeholder="100, 50, 20, 0"></label>`; break;
    case 'raise': case 'lower': case 'stop': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label>`; break;
    case 'fan': body += `<label class="field"><span>Which fan</span>${tgt(true)}</label><label class="field"><span>Speed</span>${sel('speed', [['Off', 'Off'], ['Low', 'Low'], ['Medium', 'Medium'], ['MediumHigh', 'Medium-high'], ['High', 'High']])}</label>`; break;
    case 'scene': case 'preset': { const items = [...presets().map(p => ['p:' + p.id, p.name]), ...lutronScenes().map(s => ['s:' + s.scene_id, s.name + ' (Lutron)'])]; const cur = a.type === 'preset' ? 'p:' + a.preset_id : 's:' + a.scene_id; body += `<label class="field"><span>Scene</span><select class="input" data-adv="${i}" data-k="scene_ref">${items.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`; break; }
    case 'timer': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label><label class="field"><span>After</span>${sel('minutes', [5, 10, 15, 20, 30, 45, 60, 90, 120].map(m => [m, m + ' minutes']))}</label><label class="field"><span>Then set to</span>${sel('level', [[0, 'Off'], [5, '5%'], [10, '10%'], [30, '30%']])}</label>${fade()}`; break;
    case 'cancel_timer': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label>`; break;
    case 'delay': body += `<label class="field"><span>Wait</span>${sel('ms', [[250, '¼ second'], [500, '½ second'], [1000, '1 second'], [2000, '2 seconds'], [5000, '5 seconds'], [15000, '15 seconds'], [30000, '30 seconds']])}</label>`; break;
  }
  return `<div class="card" style="margin-bottom:10px">${body}<button class="btn sm ghost danger" data-act="adv-remove" data-i="${i}">${ICON('trash', 'sm')} Remove step</button></div>`;
}
function advEdit(i, k, v) {
  const b = currentBindingForEdit(); const list = S.night ? b.night.actions : b.actions; const a = list[i];
  if (k === 'type') {
    const T = a.target || defaultTarget(S.remote);
    const fresh = { level: { type: 'level', target: T, level: 'toggle' }, step: { type: 'step', target: T, delta: 10 }, cycle: { type: 'cycle', target: T, levels: [100, 50, 20, 0] }, raise: { type: 'raise', target: T }, lower: { type: 'lower', target: T }, stop: { type: 'stop', target: T }, fan: { type: 'fan', target: (targetOptions({ fansOnly: true })[0] || {}).id || T, speed: 'High' }, scene: presets()[0] ? { type: 'preset', preset_id: presets()[0].id } : { type: 'scene', scene_id: (lutronScenes()[0] || {}).scene_id || '' }, timer: { type: 'timer', target: T, minutes: 20, level: 0, fade: 5 }, cancel_timer: { type: 'cancel_timer', target: T }, delay: { type: 'delay', ms: 1000 } }[v];
    list[i] = fresh; renderAdvanced(); saveSoon(); return;
  }
  if (k === 'scene_ref') { if (v.startsWith('p:')) list[i] = { type: 'preset', preset_id: v.slice(2) }; else list[i] = { type: 'scene', scene_id: v.slice(2) }; saveSoon(); return; }
  if (k === 'fade') { if (v === '') delete a.fade; else a.fade = Number(v); }
  else if (k === 'level') a.level = ['toggle', 'on', 'off'].includes(v) ? v : Number(v);
  else if (['delta', 'minutes', 'ms'].includes(k)) a[k] = Number(v);
  else if (k === 'levels') a.levels = v.split(/[,\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= 0 && x <= 100);
  else a[k] = v;
  saveSoon();
}
async function tryActions() {
  const b = currentBindingForEdit(); if (!b) return;
  const list = S.night ? ((b.night && b.night.actions) || []) : b.actions;
  if (!list.length) return;
  if (JSON.stringify(S.config) !== S.lastSaved) await save({ quiet: true, render: false });
  for (const a of list) { if (!(await command(a))) return; }
  toast('Done');
}
