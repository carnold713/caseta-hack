/* Remotes: pick a button on the picture, say what it does. */
'use strict';

VIEWS.remotes = {
  nested() { return !!(S.remote && dev(S.remote)); },
  top() {
    if (S.remote && dev(S.remote)) { const d = dev(S.remote); return nestedTop('remote-back', esc(d.name), `${esc(areaName(d.area))} · ${esc(modelName(d))}`); }
    return `<div class="t1">Remotes</div>${statusCircle()}`;
  },
  body() {
    if (S.remote && dev(S.remote)) return remoteDetail(dev(S.remote));
    const list = remotes();
    if (!list.length) return controllable().length ? `<div class="tip" style="margin-top:8px"><div class="grow"><span class="cap">Remotes</span><div class="t">No remotes found</div><div class="d">Pair a Pico in the Lutron app, then look again.</div></div><button class="btn sm" data-act="refresh">Look again</button></div>` : setupEmpty();
    return `<p class="body" style="margin:0 0 16px">Press a button on any remote to open it here.</p><div class="card pad0 list">${list.map(remoteCard).join('')}</div>`;
  },
};

// One row per remote: a 40px pico thumb, the name, "Kitchen · 3 buttons set up", a chevron.
function remoteCard(d) {
  const bs = bindings().filter(b => b.device_id === d.device_id);
  const n = new Set(bs.map(b => b.button_number)).size;
  const broken = bs.some(b => bindingBroken(b));
  const sub = n ? `${n} ${n === 1 ? 'button' : 'buttons'} set up` : 'Not set up yet';
  return `<button class="item remote-card" data-act="remote-open" data-id="${d.device_id}"><div class="remote-thumb">${picoArt(d, { width: 56 })}</div><div class="grow"><div class="n">${esc(d.name)}</div><div class="s">${esc(areaName(d.area))} · ${esc(sub)}</div></div>${broken ? `<span class="tag red">Needs attention</span>` : ''}<span class="chev">${ICON('chev', 'sm')}</span></button>`;
}
function bindingBroken(b) {
  const acts = [...(b.actions || []), ...((b.night && b.night.actions) || [])];
  return acts.some(a => (a.target && !targetExists(a.target)) || (a.type === 'scene' && !targetExists('s:' + a.scene_id)) || (a.type === 'preset' && !targetExists('p:' + a.preset_id)));
}
// The recipe's title when the actions match one ("Turn on", "Goodnight"), the sentence otherwise ("Runs the Dinner scene").
function shortDescribe(actions) {
  if (!actions || !actions.length) return '';
  const rid = recipeOf(actions); const r = RECIPES.find(x => x.id === rid);
  return r && !r.pick ? r.t : describe(actions);
}
const remoteHasSettings = d => bindings().some(b => b.device_id === d.device_id);
// The remote page (2.5): the picture, the hint while nothing is set, the usual-layout offer, two-line button rows, More.
function remoteDetail(d) {
  const has = remoteHasSettings(d);
  const shown = picoSlots(d).filter(s => s.real).map(s => s.n).concat(picoExtraButtons(d));
  const rows = shown.map(n => {
    const g = k => gestureActions(d.device_id, n, k);
    const press = g('single'), twice = g('double'), hold = g('hold');
    const rest = [twice.length ? `Twice: ${esc(shortDescribe(twice))}` : null, hold.length ? `Hold: ${esc(shortDescribe(hold))}` : null].filter(Boolean).join(' · ');
    const lines = press.length ? [esc(shortDescribe(press)), rest].filter(Boolean) : rest ? [rest] : [];
    const lbl = buttonLabel(d.device_id, n);
    const glyph = lbl === 'On' ? ICON('sun', 'sm') : lbl === 'Off' ? ICON('circle', 'sm') : lbl === 'Raise' ? ICON('raise', 'sm') : lbl === 'Lower' ? ICON('lower', 'sm') : lbl === 'Round' ? ICON('round', 'sm') : esc(lbl);
    return `<button class="item" data-act="button-open" data-n="${n}"><div class="ic">${glyph}</div><div class="grow"><div class="t">${esc(buttonTitleCap(d.device_id, n))}</div><div class="d ${lines.length ? '' : 'none'}">${lines.length ? lines.join('<br>') : 'Nothing yet'}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`;
  }).join('');
  const tip = usualLayoutHTML(d);
  // A remote the bridge has listed without its buttons cannot hear a press yet: say so, rather than letting
  // the page look broken when nothing lights up.
  const quiet = !buttonsOf(d.device_id).length ? `<div class="tip" style="margin-bottom:8px"><div class="grow"><span class="cap">Waiting for the bridge</span><div class="t">Your bridge has not listed this remote's buttons yet</div><div class="d">It can take a few minutes after a remote is added. Press a button on it once, then tap Look again. Until it does, what you set here is kept but will not run.</div></div><button class="btn sm" data-act="refresh">Look again</button></div>` : '';
  return `<div class="remote-hero"><div class="stage">${picoArt(d, { width: 136, interactive: true })}</div>${has ? `<p class="hint small">Tap a button to change it · ${ICON('circle', 'sm').replace('class="i sm"', 'class="i sm" style="width:10px;height:10px;fill:var(--blue);stroke:none;vertical-align:0"')} has settings</p>` : tip ? '' : `<p class="hint">Tap a button on the picture, or press it on the real remote.</p>`}</div>
    ${quiet}${tip}
    <div class="h2">Buttons</div>
    <div class="card pad0 list">${rows}</div>
    <div class="spacer"></div>
    ${moreRow('Change the picture, the Lutron app, start over, remove', 'remote-more')}`;
}
// The usual layout (docs/ux-flows.md 8): top on, bottom off, hold to brighten or dim, the round button a mood.
// Offered above the Buttons on a fresh remote with a room; "Start over" lives under More once it has settings.
function usualLayoutTargets(d) {
  const real = picoSlots(d).filter(s => s.real).map(s => s.n); const l = LAYOUTS[d.type] || {};
  if (!d.area || !real.includes(0) || !real.includes(2) || l[0] !== 'On') return null;
  return { top: 0, bottom: 2, round: real.includes(1) && l[1] === 'Round' ? 1 : null };
}
function usualHidden(pid) { try { return !!localStorage.getItem(`usualHidden:${pid}`); } catch (_) { return false; } }
function usualLayoutHTML(d) {
  const u = usualLayoutTargets(d); if (!u || remoteHasSettings(d) || usualHidden(d.device_id)) return '';
  const room = areaName(d.area); const moods = typeof roomHasMoods === 'function' && roomHasMoods(d.area);
  const middle = u.round == null ? '' : ` The middle button is ${moods ? 'Relax' : 'Half brightness'}.`;
  return `<div class="tip top" id="usualtip" style="margin-bottom:8px"><div class="grow"><span class="cap">Set up</span><div class="t">Want the usual layout?</div><div class="d">Top turns ${esc(room)} on, bottom turns it off, hold either to brighten or dim.${esc(middle)} Or tap a button on the picture to pick yourself.</div><button class="btn ghost" data-act="usual-hide" data-id="${d.device_id}">I'll pick myself</button></div><button class="go" data-act="usual-layout" title="Set it up the usual way" aria-label="Set it up the usual way">${ICON('chev')}</button></div>`;
}
// From the tip at the top the page scrolls up to show the rows it filled; from the More sheet the page stays where it was.
function applyUsualLayout(pid, opts = {}) {
  const d = dev(pid); const u = d && usualLayoutTargets(d); if (!u) return;
  if (sheet.isOpen()) sheet.close();
  const T = `a:${d.area}`; const room = areaName(d.area);
  const mk = (n, gesture, actions) => ({ id: uid(), device_id: pid, button_number: n, gesture, actions, night: null });
  const list = [
    mk(u.top, 'single', [{ type: 'level', target: T, level: 'on' }]), mk(u.top, 'double', [{ type: 'level', target: T, level: 100 }]),
    mk(u.top, 'hold_start', [{ type: 'raise', target: T }]), mk(u.top, 'hold_end', [{ type: 'stop', target: T }]),
    mk(u.bottom, 'single', [{ type: 'level', target: T, level: 'off', fade: 1 }]), mk(u.bottom, 'double', [{ type: 'level', target: 'h:all', level: 'off' }]),
    mk(u.bottom, 'hold_start', [{ type: 'lower', target: T, floor: 1 }]), mk(u.bottom, 'hold_end', [{ type: 'stop', target: T }]),
  ];
  if (u.round != null) {
    const mp = typeof roomMoodPresets === 'function' ? roomMoodPresets(d.area) : [];
    const relax = mp.find(p => p.mood === 'relax');
    if (relax) { list.push(mk(u.round, 'single', [{ type: 'preset', preset_id: relax.id }])); if (mp.length >= 2) list.push(mk(u.round, 'double', [{ type: 'cycle_presets', preset_ids: mp.map(p => p.id) }])); }
    else list.push(mk(u.round, 'single', [{ type: 'level', target: T, level: 50 }]), mk(u.round, 'double', [{ type: 'level', target: T, level: 10, fade: 1 }]));
  }
  S.config.bindings = bindings().filter(b => b.device_id !== pid).concat(list);
  save({ msg: `${room} remote set up` });
  if (opts.scroll) window.scrollTo(0, 0);
}
// The remote page's More sheet (2.5): the picture, start over, the Lutron app caveat, remove.
function remoteMoreSheet() {
  const d = dev(S.remote); if (!d) return;
  const has = remoteHasSettings(d);
  const body = `<div class="card pad0 list">
    <button class="item" data-act="remote-look">${ICON('edit')}<div class="grow"><div class="t">Not your remote? Change the picture</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    ${has && usualLayoutTargets(d) ? `<button class="item" data-act="usual-layout">${ICON('refresh')}<div class="grow"><div class="t">Start over with the usual layout</div><div class="d">Top turns ${esc(areaName(d.area))} on, bottom turns it off, hold either to brighten or dim.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>` : ''}
    <button class="item ${S.remoteLutron ? 'open' : ''}" data-act="remote-lutron">${ICON('remote')}<div class="grow"><div class="t">It may still do what the Lutron app set up</div><div class="d">Both things happen. Tap to read how to make it fully yours.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    ${S.remoteLutron ? `<div class="vrow-body"><p class="d">To make a remote fully yours, open the Lutron app, tap this remote, and remove the lights it controls (keep it paired). From then on only your settings run. Leave it as is if you only want to add a double press or a hold on top of what it already does.</p></div>` : ''}
    <button class="item" data-act="dev-remove" data-id="${d.device_id}">${ICON('trash')}<div class="grow"><div class="t">Remove this remote from my home</div><div class="d">It leaves the bridge and stops working until it is added again.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
  </div>
  <p class="d" style="margin:12px 4px 0">What your bridge says about this remote: ${esc(d.type || 'no type')}${d.serial ? `, serial ${esc(d.serial)}` : ''}, ${(() => { const r = buttonsOf(d.device_id).map(b => b.button_number).sort((a, b) => a - b); const seen = picoSeen(d); return r.length ? `buttons ${r.join(', ')}` : seen.length ? `no buttons listed, presses seen from ${seen.join(', ')}` : 'no buttons listed yet'; })()}.</p>`;
  showSheet('remote-more', esc(d.name), body, { detent: 'medium', sub: `${esc(areaName(d.area))} · ${esc(modelName(d))}` });
}
function openLookSheet() {
  const d = dev(S.remote); if (!d) return;
  const cur = picoModelFor(d), fin = picoFinishFor(d);
  const models = Object.entries(PICO_MODELS).map(([k, m]) => `<button class="item" data-act="look-model" data-m="${k}"><div class="look-thumb">${picoSVG(d, { width: 40, model: k, finish: fin })}</div><div class="grow"><div class="t">${esc(m.name)}</div><div class="d">${k}${m.types.includes(d.type) ? ' · what the bridge reports' : ''}</div></div>${cur === k ? ICON('check', 'sm') : ''}</button>`).join('');
  const fins = Object.keys(PICO_FINISHES).map(f => `<button class="chip ${fin === f ? 'sel' : ''}" data-act="look-finish" data-f="${f}">${cap(f)}</button>`).join('');
  showSheet('look', 'Which remote is this?', `<div class="h2">Layout</div><div class="card pad0 list">${models}</div><div class="h2">Colour</div><div class="chips">${fins}</div><p class="faint small" style="margin-top:16px">The bridge already knows the layout. Change it only if the picture does not match what is on your wall.</p>`, { detent: 'large', sub: 'So the picture matches what is on your wall.', back: true, onBack: remoteMoreSheet });
}
function setLook(k, v) {
  const looks = S.config.settings.remote_looks || (S.config.settings.remote_looks = {});
  const cur = looks[S.remote] || {}; cur[k] = v; looks[S.remote] = cur;
  save({ quiet: true, render: true }); openLookSheet();
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
  const pid = S.remote; S.button = n; S.pickOpen = null; S.recipeAll = false;
  const title = `What should the ${buttonTitle(pid, n)} do?`;
  const body = ['single', 'double', 'hold'].map(g => {
    const acts = gestureActions(pid, n, g); const night = gestureActions(pid, n, g, true);
    const b = g === 'hold' ? (binding(pid, n, 'hold_start') || binding(pid, n, 'hold')) : binding(pid, n, g);
    const broken = b && bindingBroken(b);
    return `<button class="item" data-act="gesture-open" data-g="${g}" data-grow="${n}/${g}"><div class="ic ${acts.length ? 'on' : ''}">${ICON(g === 'single' ? 'bolt' : g === 'double' ? 'copy' : 'clock', 'sm')}</div><div class="grow"><div class="t">${GESTURE_LABEL[g]}</div><div class="d ${acts.length ? '' : 'none'}">${acts.length ? esc(shortDescribe(acts)) : 'Nothing yet'}</div>${night.length ? `<div class="d">At night: ${esc(shortDescribe(night))}</div>` : ''}${broken ? `<div class="d"><span class="odot"></span>Points at something that is gone. Pick again.</div>` : ''}</div><span class="chev">${ICON('chev', 'sm')}</span></button>`;
  }).join('');
  showSheet('button', title, `<div class="card pad0 list gestures">${body}</div>`, { detent: 'compact', sub: `${esc((dev(pid) || {}).name || 'Remote')} · pick a kind of press.`, top: true });
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
  // Hold-to-dim stops at a glow (floor 1); off is only ever a tap (docs/ux-flows.md 9).
  { id: 'hold_down', t: 'Dim while holding', d: 'Stops at a glow, never off. Let go to stop.', hold: true, pair: T => ({ start: [{ type: 'lower', target: T, floor: 1 }], end: [{ type: 'stop', target: T }] }) },
  { id: 'sleep', t: 'Sleep timer', d: 'Turns off after 20 minutes', mk: T => [{ type: 'timer', target: T, minutes: 20, fade: 5 }] },
  // docs/ux-flows.md 8: the picked lights are the way to bed (Goodnight) or light the way (Light the way).
  { id: 'lightway', t: 'Light the way', d: 'Very dim for 15 minutes, then off by itself.', mk: T => [{ type: 'level', target: T, level: 10, fade: 1 }, { type: 'timer', target: T, minutes: 15, level: 0, fade: 5 }] },
  { id: 'goodnight', t: 'Goodnight', d: () => `Everything off. The way to bed stays dim for two minutes.${houseExtras()}`, mk: T => shutdownActions(T, 'dim') },
  { id: 'leaving', t: 'Leaving', d: () => `Everything off. The light by the door stays on for two minutes.${houseExtras()}`, any: true, pick: 'door' },
  { id: 'alloff', t: 'Turn everything off', d: 'Every light in the house', any: true, mk: () => [{ type: 'level', target: 'h:all', level: 'off' }] },
  { id: 'scene', t: 'Run a scene…', any: true, pick: true },
  // In a room with moods (docs/ux-flows.md 7): a picker over the room's mood scenes, and a step through them. Without moods, one row that makes them.
  { id: 'mood', t: 'Room mood…', d: ctx => `Bright, Relax, Dinner, Movie or Night for ${ctx.room}`, any: true, moods: true, pick: 'mood' },
  { id: 'nextmood', t: 'Next mood', d: ctx => `Steps through ${ctx.room}'s moods, one per press`, any: true, moods: 'two', mk: (T, ctx) => [{ type: 'cycle_presets', preset_ids: ctx.moodIds }] },
  { id: 'moodsfirst', t: 'Room moods', d: ctx => `Make moods for ${ctx.room} first`, any: true, moods: 'none', pick: 'roles' },
  { id: 'fan_up', t: 'Fan: faster', fan: true, mk: T => [{ type: 'step', target: T, delta: 1 }] },
  { id: 'fan_down', t: 'Fan: slower', fan: true, mk: T => [{ type: 'step', target: T, delta: -1 }] },
];
function houseExtras() { const f = hasFans(), sh = hasShades(); return f && sh ? ' Fans stop and shades close.' : f ? ' Fans stop.' : sh ? ' Shades close.' : ''; }
function recipeOf(actions) {
  if (!actions || !actions.length) return 'nothing';
  const a = actions[0];
  if (actions.length >= 2 && a.type === 'level' && a.target === 'h:all' && a.level === 'off' && actions[1].type === 'level') return actions[1].level === 'on' ? 'leaving' : 'goodnight';
  if (actions.length === 2 && a.type === 'level' && a.level === 10 && actions[1].type === 'timer') return 'lightway';
  if (actions.length === 1) {
    if (a.type === 'level' && a.target === 'h:all' && a.level === 'off') return 'alloff';
    if (a.type === 'level') { if (a.level === 'toggle') return 'toggle'; if (a.level === 'on') return 'on'; if (a.level === 'off') return 'off'; if (a.level === 100 && !a.fade) return 'full'; if (a.level === 50 && !a.fade) return 'half'; if (a.level === 10) return 'night'; if (a.level === 20 && a.fade === 8) return 'movie'; }
    if (a.type === 'cycle') return 'cycle';
    if (a.type === 'step') { const f = dev((a.target || '').slice(2)); if (f && f.domain === 'fan') return a.delta > 0 ? 'fan_up' : 'fan_down'; return a.delta > 0 ? 'up' : 'down'; }
    if (a.type === 'raise') return 'hold_up'; if (a.type === 'lower') return 'hold_down';
    if (a.type === 'timer') return 'sleep';
    if (a.type === 'preset') { const p = presets().find(x => x.id === a.preset_id); return p && p.mood ? 'mood' : 'scene'; }
    if (a.type === 'scene') return 'scene';
    if (a.type === 'cycle_presets') return 'nextmood';
  }
  return 'custom';
}
// The room a remote sits in, and that room's mood scenes, for the mood recipes.
function recipeCtx(pid) { const d = dev(pid); const aid = d && d.area ? d.area : 'none'; const mp = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : []; return { aid, room: areaName(aid), moodIds: mp.map(p => p.id), moods: mp.length, dimmers: typeof roomDimmers === 'function' ? roomDimmers(aid).length : 0 }; }
function defaultTarget(pid) { const d = dev(pid); return d && d.area && targetDevices(`a:${d.area}`).length ? `a:${d.area}` : (controllable()[0] ? `a:${controllable()[0].area || 'none'}` : 'h:all'); }
// The chooser holds a list; one entry is stored as a plain string, several as a list.
const packTarget = list => (list.length === 1 ? list[0] : list.slice());

// The usual ways for each kind of press (2.7); `mood` stands for the room-mood recipe that applies to the room.
const USUAL = { single: ['on', 'off', 'toggle', 'scene', 'mood'], double: ['full', 'night', 'alloff', 'scene', 'mood'], hold: ['hold_up', 'hold_down', 'sleep', 'goodnight', 'alloff'], fan: ['fan_up', 'fan_down', 'toggle', 'off'] };
// Every way, grouped, for "Show all ways".
const RECIPE_GROUPS = [['Brightness', ['on', 'off', 'toggle', 'full', 'half', 'night', 'movie', 'cycle', 'up', 'down', 'hold_up', 'hold_down']], ['Scenes and moods', ['scene', 'mood', 'nextmood', 'moodsfirst']], ['Timers and going out', ['sleep', 'lightway', 'goodnight', 'leaving', 'alloff']], ['Fans', ['fan_up', 'fan_down']]];
function openRecipeSheet(g, night = false) {
  const pid = S.remote, n = S.button; S.gesture = g; S.night = night; S.advCustom = null; S.recipeAll = false;
  const acts = gestureActions(pid, n, g, night);
  const cur = acts.find(a => a.target && a.target !== 'h:all');
  if (!S.pickTargets || !S.pickTargets.length) S.pickTargets = cur ? tlist(cur.target).filter(targetExists) : [defaultTarget(pid)];
  if (!S.pickTargets.length) S.pickTargets = [defaultTarget(pid)];
  // the lights row opens expanded when the pick is not the remote's own room, so a custom pick is seen at once
  S.pickOpen = !(S.pickTargets.length === 1 && S.pickTargets[0] === defaultTarget(pid));
  renderRecipeSheet();
}
function renderRecipeSheet() {
  const pid = S.remote, n = S.button, g = S.gesture, night = S.night;
  const acts = gestureActions(pid, n, g, night);
  const selected = recipeOf(acts);
  const T = packTarget(S.pickTargets);
  const tdevs = targetDevices(T).map(dev).filter(Boolean);
  const isFan = tdevs.length > 0 && tdevs.every(x => x.domain === 'fan');
  const hasFan = tdevs.some(x => x.domain === 'fan');
  // the Normally / At night segment sits at the top only once you are in night mode (it lives under More otherwise)
  const seg = night ? `<div class="seg" style="margin:8px 0 4px"><button class="${night ? '' : 'on'}" data-act="recipe-mode" data-night="0">${ICON('sun', 'sm')} Normally</button><button class="${night ? 'on' : ''}" data-act="recipe-mode" data-night="1">${ICON('moon', 'sm')} At night</button></div>` : '';
  const nightNote = night ? `<div class="tip" style="margin-top:12px"><div class="grow"><span class="cap">At night</span><div class="d" style="margin-top:0;color:var(--text-2)">Between ${fmtTime(S.config.settings.night_start)} and ${fmtTime(S.config.settings.night_end)} this button does this instead. <a data-act="nav" data-view="settings" href="#settings">Change the hours</a></div></div></div>` : '';
  const twiceNote = g === 'double' && !binding(pid, n, 'double') ? `<p class="d" style="margin:4px 0 12px">Once it has a press-twice, a single press waits a moment so the two can be told apart.</p>` : '';
  const sel = S.pickTargets;
  const chipsT = [defaultTarget(pid), ...sel, 'h:all', ...areas().map(a => `a:${a.id}`)].filter((v, i, arr) => arr.indexOf(v) === i && targetExists(v));
  const chips = `<div class="chips scroll">${chipsT.map(t => `<button class="chip ${sel.includes(t) ? 'sel' : ''}" data-act="pick-target" data-t="${esc(t)}">${sel.includes(t) ? ICON('check', 'sm') : ''}${esc(cap(targetName(t)))}</button>`).join('')}<button class="chip" data-act="pick-target-more">${ICON('dots', 'sm')}Specific lights…</button></div>${sel.length > 1 ? `<p class="small muted" style="margin:8px 0 0">Controls ${esc(targetName(T))} · ${plural(targetDevices(T).length, 'light')}</p>` : ''}`;
  const which = `<div class="card pad0 list">${valueRow('Which lights?', esc(cap(targetName(T))), 'pick-open', '', { open: S.pickOpen })}${S.pickOpen ? `<div class="vrow-body">${chips}</div>` : ''}</div>`;
  const chk = `<span class="chk">${ICON('check')}</span>`;
  const ctx = recipeCtx(pid);
  const moodsOk = r => !r.moods || (r.moods === 'none' ? (ctx.moods === 0 && ctx.dimmers > 0) : r.moods === 'two' ? ctx.moods >= 2 : ctx.moods >= 1);
  const applies = r => (!r.hold || g === 'hold') && (!r.fan || isFan) && (r.fan || !isFan || r.any) && moodsOk(r);
  const row = r => { const rd = typeof r.d === 'function' ? r.d(ctx) : r.d; return `<button class="item recipe ${selected === r.id ? 'sel' : ''}" data-act="recipe" data-r="${r.id}"><div class="grow"><div class="t">${r.t}</div>${rd ? `<div class="d">${esc(rd)}</div>` : ''}</div>${selected === r.id ? chk : ''}</button>`; };
  const byId = id => RECIPES.find(r => r.id === id);
  let list;
  if (S.recipeAll) {
    list = RECIPE_GROUPS.map(([capn, ids]) => { const rs = ids.map(byId).filter(r => r && applies(r) && (capn !== 'Fans' || hasFan)); return rs.length ? `<div class="lcap">${capn}</div>${rs.map(row).join('')}` : ''; }).join('');
  } else {
    // the mood row stands in for whichever mood recipe fits the room: the picker, the step-through, or "make moods first"
    const moodId = ctx.moods === 0 ? (ctx.dimmers > 0 ? 'moodsfirst' : null) : (ctx.moods >= 2 && selected !== 'mood' ? 'nextmood' : 'mood');
    const ids = (isFan ? USUAL.fan : USUAL[g] || USUAL.single).map(id => (id === 'mood' ? moodId : id)).filter(Boolean);
    const rs = ids.map(byId).filter(r => r && applies(r));
    const cur = byId(selected); if (cur && applies(cur) && !rs.includes(cur)) rs.push(cur);
    list = rs.map(row).join('') + `<button class="item recipe all" data-act="recipe-all"><div class="grow"><div class="t">Show all ways</div></div><span class="chev">${ICON('dots', 'sm')}</span></button>`;
  }
  if (S.recipeAll) list += `<button class="item recipe all" data-act="recipe-fewer"><div class="grow"><div class="t">Show fewer</div></div><span class="chev">${ICON('dots', 'sm')}</span></button>`;
  const custom = selected === 'custom' ? `<div class="tip" style="margin-top:12px"><div class="grow"><span class="cap">Custom</span><div class="t">${esc(describe(acts))}</div></div></div>` : '';
  const test = acts.length ? `<button class="btn block" data-act="try-actions" style="margin-top:16px">${ICON('play', 'sm')} Try it now</button>` : '';
  const more = night ? '' : `<div style="margin-top:16px">${moreRow('At night, fine-tune, clear', 'recipe-more')}</div>`;
  // the same key on every redraw: a tick appears where you tapped and the list keeps its scroll
  showSheet('recipe', GESTURE_LABEL[g], `${seg}${nightNote}${twiceNote}${which}<div class="h2">What should happen?</div><div class="card pad0 list">${list}</div>${custom}${test}${more}`, { detent: 'large', back: true, sub: buttonTitleCap(pid, n), onBack: () => openButtonSheet(n) });
}
// The recipe sheet's More (2.7): the night version, the fine-tune editor, clearing the press.
function recipeMoreSheet() {
  const pid = S.remote, n = S.button, g = S.gesture;
  const night = gestureActions(pid, n, g, true);
  const hasNormal = gestureActions(pid, n, g).length > 0;
  const body = `<div class="card pad0 list">
    ${valueRow('At night, do something different', night.length ? esc(shortDescribe(night)) : 'Off', 'recipe-night', '', { sub: hasNormal ? '' : 'Pick what it does normally first' })}
    <button class="item" data-act="advanced"><div class="grow"><div class="t">Fine-tune: fade times, several steps, timers…</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    <button class="item" data-act="recipe-clear"><div class="grow"><div class="t">Clear this press</div><div class="d">Does nothing until you pick something again.</div></div><span class="chev">${ICON('x', 'sm')}</span></button>
  </div>`;
  showSheet('recipe-more', `${GESTURE_LABEL[g]} on the ${esc(buttonTitle(pid, n))}`, body, { detent: 'medium', back: true, onBack: renderRecipeSheet, sub: esc((dev(pid) || {}).name || '') });
}
// Keep the picked list sensible: a room replaces its own lights, a light replaces its room, "everything" stands alone.
function normalizeTargets(list, added) {
  const shade = t => t === 'h:shades' || (t.startsWith('d:') && (dev(t.slice(2)) || {}).domain === 'cover');
  const shades = [...new Set(list.filter(shade))];
  let out = [...new Set(list.filter(t => !shade(t)))];
  if (!added) return [...out, ...shades];
  // shades sit beside the lights: "all shades" replaces single shades and the other way round
  if (shade(added)) return [...out, ...(added === 'h:shades' ? ['h:shades'] : shades.filter(t => t !== 'h:shades'))];
  if (added === 'h:all') return ['h:all', ...shades];
  out = out.filter(t => t !== 'h:all');
  if (added.startsWith('a:')) out = out.filter(t => !(t.startsWith('d:') && (dev(t.slice(2)) || {}).area === added.slice(2) && t !== added));
  if (added.startsWith('d:')) { const area = (dev(added.slice(2)) || {}).area; out = out.filter(t => t !== `a:${area || 'none'}`); }
  return [...out, ...shades];
}
function toggleTargetChip(t) {
  const i = S.pickTargets.indexOf(t);
  if (i >= 0) { if (S.pickTargets.length > 1) S.pickTargets.splice(i, 1); } else S.pickTargets = normalizeTargets([...S.pickTargets, t], t);
  retargetCurrent();
  renderRecipeSheet();
}
// When the lights change after a recipe is already chosen, move the saved actions to the new lights.
function retargetCurrent() {
  const pid = S.remote, n = S.button, g = S.gesture, night = S.night;
  const T = packTarget(S.pickTargets);
  const bs = g === 'hold' ? [binding(pid, n, 'hold_start'), binding(pid, n, 'hold_end'), binding(pid, n, 'hold')].filter(Boolean) : [binding(pid, n, g)].filter(Boolean);
  let changed = false;
  for (const b of bs) {
    const list = night ? ((b.night && b.night.actions) || []) : b.actions;
    for (const a of list) { if (a.target && a.target !== 'h:all' && JSON.stringify(a.target) !== JSON.stringify(T)) { a.target = Array.isArray(T) ? [...T] : T; changed = true; } }
  }
  if (changed) { const acts = gestureActions(pid, n, g, night); save({ msg: describe(acts), render: true }); }
}
function applyRecipe(rid) {
  const pid = S.remote, n = S.button, g = S.gesture, night = S.night, T = packTarget(S.pickTargets);
  const r = RECIPES.find(x => x.id === rid);
  if (r && r.pick === true) { openScenePicker(); return; }
  if (r && r.pick === 'mood') { openMoodPicker(); return; }
  if (r && r.pick === 'roles') { const ctx = recipeCtx(pid); openRolesSheet(ctx.aid, { back: renderRecipeSheet, after: renderRecipeSheet }); return; }
  if (r && r.pick === 'door') { openDoorPicker(); return; }
  if (rid === 'lightway') { const path = groups().find(x => /night path/i.test(x.name)); if (path && !S.pickTargets.includes(`g:${path.id}`) && recipeOf(gestureActions(pid, n, g, night)) !== 'lightway') S.pickTargets = [`g:${path.id}`]; }
  const ctx = recipeCtx(pid);
  let actions = [];
  if (rid !== 'nothing') actions = r.pair ? null : r.mk(packTarget(S.pickTargets), ctx);
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
// "Room mood…": the room's mood scenes, saved as a scene action through pickScene.
function openMoodPicker() {
  const ctx = recipeCtx(S.remote);
  const items = roomMoodPresets(ctx.aid).map(p => ({ a: { type: 'preset', preset_id: p.id }, n: p.name, s: p.edited ? 'Changed by you' : 'Suggested' }));
  S.scenePick = items;
  const body = `<div class="card pad0 list">${items.map((it, i) => { const p = presets().find(x => x.id === it.a.preset_id); const m = moodById(p.mood); return `<button class="item" data-act="pick-scene" data-i="${i}">${lampHTML(presetMax(p), 40, ICON(m.icon, 'sm'))}<div class="grow"><div class="t">${esc(m.name)}</div><div class="d">${it.s}</div></div></button>`; }).join('')}</div>`;
  showSheet('mood-pick', `Which mood for ${esc(ctx.room)}?`, body, { detent: 'compact', back: true, onBack: renderRecipeSheet, sub: 'One press runs it.' });
}
// "Leaving": one question, which light is by the door, then it is saved.
function openDoorPicker() {
  const pid = S.remote, n = S.button, g = S.gesture;
  const cur = (gestureActions(pid, n, g).find(a => a.type === 'level' && a.target !== 'h:all') || {}).target;
  const lights = controllable().filter(d => d.domain === 'light' || d.domain === 'switch');
  const pre = cur || `d:${(lights.find(d => /hall|entry|foyer|mud/i.test(areaName(d.area))) || lights[0] || {}).device_id}`;
  const rows = areas().map(a => { const ds = lights.filter(d => (d.area || 'none') === a.id); if (!ds.length) return ''; return `<div class="h3">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => `<button class="item" data-act="leaving-door" data-t="d:${d.device_id}">${lampHTML(level(d.device_id) || 0, 28, '')}<div class="grow"><div class="t">${esc(d.name)}</div></div>${pre === `d:${d.device_id}` ? `<span class="chk">${ICON('check', 'sm')}</span>` : ''}</button>`).join('')}</div>`; }).join('');
  showSheet('door', 'Which light is by the door?', rows, { detent: 'compact', back: true, onBack: renderRecipeSheet, sub: 'It stays on for two minutes after everything else goes off.' });
}
function saveLeaving(door) {
  const pid = S.remote, n = S.button, g = S.gesture;
  const actions = shutdownActions(door, 'on');
  if (g === 'hold') holdReplace(pid, n, actions);
  else { S.config.bindings = S.config.bindings.filter(b => !(b.device_id === pid && b.button_number === n && b.gesture === g)); S.config.bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: g, actions, night: null }); }
  S.pickTargets = [door];
  save({ msg: describe(actions), render: true });
  renderRecipeSheet();
}
function openScenePicker() {
  const items = [...presets().map(p => ({ a: { type: 'preset', preset_id: p.id }, n: p.name, s: 'Your scene' })), ...lutronScenes().map(s => ({ a: { type: 'scene', scene_id: s.scene_id }, n: s.name, s: 'From the Lutron app' }))];
  const body = items.length ? `<div class="card pad0 list">${items.map((it, i) => `<button class="item" data-act="pick-scene" data-i="${i}"><div class="ic">${ICON('scene', 'sm')}</div><div class="grow"><div class="t">${esc(it.n)}</div><div class="d">${it.s}</div></div></button>`).join('')}</div>` : `<div class="tip"><div class="grow"><span class="cap">Scenes</span><div class="t">No scenes yet</div><div class="d">Make one on the Scenes tab first.</div></div></div>`;
  S.scenePick = items;
  showSheet('scene-pick', 'Which scene?', body, { detent: 'medium', back: true, onBack: renderRecipeSheet });
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
// Multi-select picker: rooms, everything, each light, and any hand-made sets. Used by the recipe sheet and the fine-tune editor.
function openTargetPicker(selected, onDone, onBack, opts = {}) {
  S.targetPick = { selected: [...selected], onDone, onBack, shades: !!opts.shades };
  renderTargetPicker();
}
function renderTargetPicker() {
  const p = S.targetPick; const { selected, onBack } = p;
  p.open = p.open || new Set(areas().filter(a => selected.some(t => t.startsWith('d:') && (dev(t.slice(2)) || {}).area === a.id)).map(a => a.id));
  const cb = t => `<input type="checkbox" class="cb" data-act="picker-toggle" data-t="${esc(t)}" ${selected.includes(t) ? 'checked' : ''}>`;
  const lightRow = d => `<label class="item">${lampHTML(level(d.device_id) || 0, 28, '')}<div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${esc(cap(d.domain))}</div></div>${cb('d:' + d.device_id)}</label>`;
  const rooms = areas().map(a => {
    const ds = controllable().filter(d => (d.area || 'none') === a.id && d.domain !== 'cover'); if (!ds.length) return '';
    const open = p.open.has(a.id); const on = targetOn(`a:${a.id}`);
    return `<div class="card pad0 roomcard"><div class="roomrow ${open ? 'open' : ''}">${lampHTML(on ? roomMean(a.id) : 0, 40, ICON(roomIcon(a.name), 'sm'))}<label class="grow row" style="min-height:40px"><div class="grow"><div class="n">${esc(a.name)}</div><div class="s">${plural(ds.length, 'light')}, the whole room</div></div></label><button class="chev" data-act="picker-expand" data-id="${a.id}">${ICON('chev', 'sm')}</button><label style="display:flex">${cb('a:' + a.id)}</label></div><div class="roomlights ${open ? 'open' : ''}" data-roomlights="${a.id}">${ds.map(lightRow).join('')}</div></div>`;
  }).join('');
  const all = `<label class="card pad0 roomcard"><div class="roomrow">${lampHTML(litLights().length ? houseLevel() : 0, 40, ICON('house', 'sm'))}<div class="grow"><div class="n">Everything</div><div class="s">Every light in the house</div></div>${cb('h:all')}</div></label>`;
  const sets = groups().length ? `<div class="h3" style="margin-top:24px">Your sets</div>${groups().map(g => `<label class="card pad0 roomcard"><div class="roomrow">${lampHTML(targetOn('g:' + g.id) ? meanLevel(g.device_ids) : 0, 40, ICON('bulb', 'sm'))}<div class="grow"><div class="n">${esc(g.name)}</div><div class="s">${g.device_ids.length} lights</div></div>${cb('g:' + g.id)}</div></label>`).join('')}` : '';
  // shades join the chooser only when the caller's action can move them (the automation editor)
  const covers = p.shades ? controllable().filter(d => d.domain === 'cover') : [];
  const shades = covers.length ? `<div class="h3" style="margin-top:24px">Shades</div><div class="card pad0 roomcard"><label class="roomrow">${lampHTML(0, 40, ICON('shade', 'sm'))}<div class="grow"><div class="n">All shades</div><div class="s">${plural(covers.length, 'shade')}</div></div>${cb('h:shades')}</label><div class="roomlights open">${covers.map(d => `<label class="item">${lampHTML(0, 28, ICON('shade', 'sm'))}<div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${esc(areaName(d.area))}</div></div>${cb('d:' + d.device_id)}</label>`).join('')}</div></div>` : '';
  const summary = selected.length ? `${cap(targetName(packTarget(selected)))} · ${targetDevices(selected).length} lights` : 'Nothing picked yet';
  showSheet('picker', 'Which lights should this control?', `${all}<div class="stack" style="margin-top:8px">${rooms}</div>${sets}${shades}<div class="sfoot"><div class="small muted" style="margin-bottom:8px" id="picker-summary">${esc(summary)}</div><button class="btn primary lg block" data-act="picker-done" ${selected.length ? '' : 'disabled'}>Done</button></div>`, { detent: 'large', back: !!onBack, onBack, sub: 'Tick a whole room, single lights, or both.' });
}

// ----- advanced editor -----
const ACTION_LABELS = { level: 'Set brightness', step: 'Brighter or dimmer by', cycle: 'Step through levels', raise: 'Brighten while holding', lower: 'Dim while holding', stop: 'Stop brightening or dimming', fan: 'Set fan speed', scene: 'Run a scene', preset: 'Run a scene', timer: 'Turn off after a while', cancel_timer: 'Cancel a timer', delay: 'Then wait' };
function currentBindingForEdit() {
  const pid = S.remote, n = S.button, g = S.gesture;
  return g === 'hold' ? (binding(pid, n, 'hold_start') || binding(pid, n, 'hold')) : binding(pid, n, g);
}
// The list the fine-tune editor edits, resolved fresh each time (a save replaces S.config): the binding's actions,
// its night actions, or, when S.advCustom is set by automations.js, an automation's actions.
function advList() {
  if (S.advCustom) return S.advCustom.list();
  const b = currentBindingForEdit(); if (!b) return null;
  return S.night ? ((b.night && b.night.actions) || null) : b.actions;
}
function advChanged() { if (S.advCustom) S.advCustom.changed(); else saveSoon(); }
function advDefaultTarget() { if (S.advCustom) return S.advCustom.target; return S.pickTargets && S.pickTargets.length ? packTarget(S.pickTargets) : defaultTarget(S.remote); }
function openAdvanced() {
  S.advCustom = null;
  let b = currentBindingForEdit();
  if (!b) { b = { id: uid(), device_id: S.remote, button_number: S.button, gesture: S.gesture, actions: [], night: null }; S.config.bindings.push(b); }
  if (S.night && !b.night) b.night = { actions: [] };
  renderAdvanced();
}
function renderAdvanced() {
  const list = advList(); if (!list) return renderRecipeSheet();
  const b = S.advCustom ? null : currentBindingForEdit();
  const rows = list.map((a, i) => actionEditor(a, i)).join('') || '<p class="muted">No steps yet.</p>';
  const body = `${rows}<div class="row" style="margin-top:12px"><button class="btn" data-act="adv-add">${ICON('plus', 'sm')} Add a step</button><button class="btn" data-act="try-actions">${ICON('play', 'sm')} Try it</button></div>
  ${b && b.gesture === 'hold_start' ? `<p class="faint small" style="margin-top:14px">This runs when the hold begins; "Stop" is sent automatically when you let go.</p>` : ''}
  <div class="sfoot"><button class="btn primary lg block" data-act="adv-done">Done</button></div>`;
  if (S.advCustom) showSheet('finetune', esc(S.advCustom.title), body, { detent: 'large', back: true, sub: S.advCustom.sub, onBack: S.advCustom.onBack });
  else showSheet('advanced', `Fine-tune ${GESTURE_LABEL[S.gesture].toLowerCase()}${S.night ? ' at night' : ''}`, body, { detent: 'large', back: true, sub: buttonTitle(S.remote, S.button), onBack: renderRecipeSheet });
}
function actionEditor(a, i) {
  const sel = (k, opts) => `<select class="input" data-adv="${i}" data-k="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(a[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const tgt = () => `<button class="btn block field-btn" data-act="adv-target" data-i="${i}"><span class="ellip">${esc(cap(targetName(a.target)))}</span>${ICON('chev', 'sm')}</button>`;
  const fade = () => `<label class="field"><span>Change gradually over</span>${sel('fade', [['', 'Default'], [0, 'Instantly'], [1, '1 second'], [3, '3 seconds'], [8, '8 seconds'], [30, '30 seconds'], [120, '2 minutes'], [600, '10 minutes'], [1200, '20 minutes'], [1800, '30 minutes']])}</label>`;
  let body = `<label class="field"><span>Step ${i + 1}</span>${sel('type', Object.entries(ACTION_LABELS).filter(([k]) => k !== 'preset'))}</label>`;
  switch (a.type) {
    case 'level': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label><label class="field"><span>Brightness</span>${sel('level', [['toggle', 'On or off (toggle)'], ['on', 'On'], ['off', 'Off'], ...[100, 90, 75, 60, 50, 40, 30, 20, 10, 5].map(v => [v, v + '%'])])}</label>${fade()}`; break;
    case 'step': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label><label class="field"><span>Amount</span>${sel('delta', [[25, 'Much brighter'], [10, 'A little brighter'], [5, 'Slightly brighter'], [1, 'Fan: one speed faster'], [-1, 'Fan: one speed slower'], [-5, 'Slightly dimmer'], [-10, 'A little dimmer'], [-25, 'Much dimmer']])}</label>`; break;
    case 'cycle': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label><label class="field"><span>Levels, in order</span><input class="input" data-adv="${i}" data-k="levels" value="${esc((a.levels || []).join(', '))}" placeholder="100, 50, 20, 0"></label>`; break;
    case 'raise': case 'lower': case 'stop': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label>`; break;
    case 'fan': body += `<label class="field"><span>Which fan</span>${tgt()}</label><label class="field"><span>Speed</span>${sel('speed', [['Off', 'Off'], ['Low', 'Low'], ['Medium', 'Medium'], ['MediumHigh', 'Medium-high'], ['High', 'High']])}</label>`; break;
    case 'scene': case 'preset': { const items = [...presets().map(p => ['p:' + p.id, p.name]), ...lutronScenes().map(s => ['s:' + s.scene_id, s.name + ' (Lutron)'])]; const cur = a.type === 'preset' ? 'p:' + a.preset_id : 's:' + a.scene_id; body += `<label class="field"><span>Scene</span><select class="input" data-adv="${i}" data-k="scene_ref">${items.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`; break; }
    case 'timer': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label><label class="field"><span>After</span>${sel('minutes', [5, 10, 15, 20, 30, 45, 60, 90, 120].map(m => [m, m + ' minutes']))}</label><label class="field"><span>Then set to</span>${sel('level', [[0, 'Off'], [5, '5%'], [10, '10%'], [30, '30%']])}</label>${fade()}`; break;
    case 'cancel_timer': body += `<label class="field"><span>Which lights</span>${tgt(false)}</label>`; break;
    case 'delay': body += `<label class="field"><span>Wait</span>${sel('ms', [[250, '¼ second'], [500, '½ second'], [1000, '1 second'], [2000, '2 seconds'], [5000, '5 seconds'], [15000, '15 seconds'], [30000, '30 seconds']])}</label>`; break;
  }
  return `<div class="card" style="margin-bottom:12px">${body}<button class="btn ghost" data-act="adv-remove" data-i="${i}">${ICON('trash', 'sm')} Remove step</button></div>`;
}
function advEdit(i, k, v) {
  const list = advList(); if (!list) return; const a = list[i];
  if (k === 'type') {
    const T = a.target || advDefaultTarget();
    const fresh = { level: { type: 'level', target: T, level: 'toggle' }, step: { type: 'step', target: T, delta: 10 }, cycle: { type: 'cycle', target: T, levels: [100, 50, 20, 0] }, raise: { type: 'raise', target: T }, lower: { type: 'lower', target: T }, stop: { type: 'stop', target: T }, fan: { type: 'fan', target: (targetOptions({ fansOnly: true })[0] || {}).id || T, speed: 'High' }, scene: presets()[0] ? { type: 'preset', preset_id: presets()[0].id } : { type: 'scene', scene_id: (lutronScenes()[0] || {}).scene_id || '' }, timer: { type: 'timer', target: T, minutes: 20, level: 0, fade: 5 }, cancel_timer: { type: 'cancel_timer', target: T }, delay: { type: 'delay', ms: 1000 } }[v];
    list[i] = fresh; renderAdvanced(); advChanged(); return;
  }
  if (k === 'scene_ref') { if (v.startsWith('p:')) list[i] = { type: 'preset', preset_id: v.slice(2) }; else list[i] = { type: 'scene', scene_id: v.slice(2) }; advChanged(); return; }
  if (k === 'fade') { if (v === '') delete a.fade; else a.fade = Number(v); }
  else if (k === 'level') a.level = ['toggle', 'on', 'off'].includes(v) ? v : Number(v);
  else if (['delta', 'minutes', 'ms'].includes(k)) a[k] = Number(v);
  else if (k === 'levels') a.levels = v.split(/[,\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= 0 && x <= 100);
  else a[k] = v;
  advChanged();
}
async function tryActions() {
  const list = advList() || [];
  if (!list.length) return;
  if (JSON.stringify(S.config) !== S.lastSaved) await save({ quiet: true, render: false });
  for (const a of list) { if (!(await command(a))) return; }
  toast('Done');
}
