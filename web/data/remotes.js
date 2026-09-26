/* Caseta data layer, part five: remotes. What a Pico looks like and which key is which, what each press is set to do
   and how to say it, the ready-made ways a press can go ("recipes"), and every change the remote pages make to the
   button settings. Nothing here draws or saves: each change edits the config and returns what the caller needs to
   say about it.

   Moved from web/js/pico.js and web/js/remotes.js for Copper Night. The old UI keeps its own copy until it is
   retired to /classic/; the rules are the same in both.

   Same shape as the others: a plain <script> gets window.CasetaRemotes, a test `require`s it. */
(function (root) {
  'use strict';

  // Physical layouts, top to bottom. Each slot: kind, the LEAP button number that sits there, and what is printed
  // on it. The numbers are the ones the bridge reports for that model.
  const PICO_MODELS = {
    'PJ2-3BRL': { name: '3-button with arrows', long: 'On, raise and lower around a round button, off', types: ['Pico3ButtonRaiseLower'],
      slots: [['big', 0, 'on'], ['diag-up', 3, 'up'], ['diag-down', 4, 'down'], ['round-mid', 1, 'fav'], ['big', 2, 'off']],
      // explicit geometry in the 100 x 212 box, measured from Lutron's product photo
      geom: { on: [15, 12, 70, 50], mid: [15, 67, 70, 78], off: [15, 150, 70, 50], fav: [50, 106, 16.5] } },
    'PJ2-3BRL-classic': { name: '3-button with arrows, older', long: 'On, raise bar, round button, lower bar, off', types: [], slots: [['big', 0, 'on'], ['half', 3, 'up'], ['round', 1, 'fav'], ['half', 4, 'down'], ['big', 2, 'off']] },
    'PJ2-2BRL': { name: '2-button with arrows', long: 'On, raise, lower, off', types: ['Pico2ButtonRaiseLower'], slots: [['big', 0, 'on'], ['half', 3, 'up'], ['half', 4, 'down'], ['big', 2, 'off']] },
    'PJ2-3B': { name: '3-button', long: 'On, round button, off', types: ['Pico3Button'], slots: [['big', 0, 'on'], ['round', 1, 'fav'], ['big', 2, 'off']] },
    'PJ2-2B': { name: '2-button', long: 'On, off', types: ['Pico2Button'], slots: [['big', 0, 'on'], ['big', 2, 'off']] },
    'PJ2-4B': { name: '4-button', long: 'Four scene buttons', types: ['Pico4Button', 'Pico4ButtonScene', 'Pico4ButtonZone', 'Pico4Button2Group'], slots: [['quarter', 0, '1'], ['quarter', 1, '2'], ['quarter', 2, '3'], ['quarter', 3, '4']] },
    'PJ2-P': { name: 'Paddle', long: 'A rocker: top and bottom', types: ['PaddleSwitchPico'], slots: [['rocker-top', 0, 'on'], ['rocker-bottom', 2, 'off']] },
    'PJ2-1B': { name: '1-button', long: 'One button', types: ['Pico1Button'], slots: [['big', 0, 'on']] },
  };
  const PICO_FINISHES = {
    white: { name: 'White', body: '#f3f3f1', bodyHi: '#fbfbfa', bodyLo: '#e3e3e0', edge: '#cfcfcb', btn: '#fdfdfc', btnHi: '#ffffff', btnLo: '#efefec', btnEdge: '#d2d2ce', ink: '#6e6e6c' },
    black: { name: 'Black', body: '#2b2b2d', bodyHi: '#3a3a3d', bodyLo: '#1c1c1e', edge: '#131315', btn: '#353538', btnHi: '#434347', btnLo: '#262629', btnEdge: '#1e1e21', ink: '#d6d6d4' },
    ivory: { name: 'Ivory', body: '#efe9d8', bodyHi: '#f8f4e8', bodyLo: '#dfd7c2', edge: '#cfc7b0', btn: '#f9f5e8', btnHi: '#fffdf4', btnLo: '#ece5d2', btnEdge: '#d4ccb6', ink: '#6b6455' },
    gray: { name: 'Grey', body: '#b9bcc0', bodyHi: '#c9ccd0', bodyLo: '#a3a6ab', edge: '#8f9297', btn: '#cfd2d6', btnHi: '#dcdfe3', btnLo: '#bdc0c5', btnEdge: '#a2a5aa', ink: '#3f4246' },
  };
  // What a key is called, by what is printed on it. The file names keys by where they sit ("Top button").
  const KEY_NAMES = { on: 'Top button', off: 'Bottom button', up: 'Up arrow', down: 'Down arrow', fav: 'Middle button' };
  const GESTURES = ['single', 'double', 'hold'];
  const GESTURE_WORD = { single: 'Press', double: 'Press twice', hold: 'Hold' };
  // The verb for Activity: "bottom button pressed", "pressed twice", "held".
  const GESTURE_PAST = { single: 'pressed', double: 'pressed twice', hold: 'held', hold_start: 'held', hold_end: 'let go', press: 'pressed', release: 'let go' };

  // The steps a fine-tuned press can take, in the words the step editor shows.
  const ACTION_LABELS = { level: 'Set brightness', step: 'Brighter or dimmer by', cycle: 'Step through levels', raise: 'Brighten while holding', lower: 'Dim while holding', stop: 'Stop brightening or dimming', fan: 'Set fan speed', scene: 'Run a scene', timer: 'Turn off after a while', cancel_timer: 'Cancel a timer', delay: 'Then wait' };

  function create(D, H, opts = {}) {
    const S = D.S;
    const uid = opts.uid || (() => Math.random().toString(36).slice(2, 10));
    const tlist = t => (Array.isArray(t) ? t : t ? [t] : []);
    const packTarget = list => (list.length === 1 ? list[0] : list.slice());
    const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const cfg = () => S.config;
    const settings = () => S.config.settings;
    const bindings = () => (S.config && S.config.bindings) || [];
    const binding = (pid, n, g) => bindings().find(b => b.device_id === pid && b.button_number === n && b.gesture === g);
    const hasFans = () => D.controllable().some(d => d.domain === 'fan');
    const hasShades = () => D.controllable().some(d => d.domain === 'cover');

    // ---------- what the remote is ----------
    const look = d => ((S.config && S.config.settings.remote_looks) || {})[d.device_id] || {};
    function modelFor(d) {
      const l = look(d);
      if (l.model && PICO_MODELS[l.model]) return l.model;
      for (const [k, m] of Object.entries(PICO_MODELS)) if (m.types.includes(d.type)) return k;
      return 'PJ2-3BRL';
    }
    const finishFor = d => (PICO_FINISHES[look(d).finish] ? look(d).finish : 'white');
    const seen = d => (Array.isArray(look(d).seen) ? look(d).seen : []);
    function knownNumbers(d) { const r = D.buttonsOf(d.device_id).map(b => b.button_number); return r.length ? r : seen(d); }
    // The model's keys with the numbers this remote really uses. A remote the bridge lists no buttons for yet shows
    // the usual keys, so its page is worth opening while the bridge catches up; one that numbers its keys from 1
    // where the model starts at 0 is shifted to match.
    function slots(d, modelKey) {
      const model = PICO_MODELS[modelKey || modelFor(d)];
      const known = knownNumbers(d);
      let list = model.slots;
      if (!known.length) return list.map(([kind, n, glyph]) => ({ kind, n, glyph, real: true }));
      const nums = list.map(s => s[1]);
      if (!nums.every(n => known.includes(n))) {
        const shift = Math.min(...known) - Math.min(...nums);
        if (shift && nums.every(n => known.includes(n + shift))) list = list.map(([k, n, g]) => [k, n + shift, g]);
      }
      return list.map(([kind, n, glyph]) => ({ kind, n, glyph, real: known.includes(n) }));
    }
    // Numbers the picture has no key for still get a row, so every remote can be set up.
    function extraButtons(d) {
      const have = new Set(slots(d).map(s => s.n));
      return knownNumbers(d).filter(n => !have.has(n)).sort((a, b) => a - b);
    }
    // Every key a person can set, top to bottom.
    const buttonNumbers = d => slots(d).filter(s => s.real).map(s => s.n).concat(extraButtons(d));
    // "Top button", "Up arrow", "Button 3".
    function buttonName(pid, n) {
      const d = D.dev(pid);
      if (d) {
        const s = slots(d).find(x => x.n === n);
        const model = PICO_MODELS[modelFor(d)];
        if (s && model.slots.length === 1) return 'The button';
        if (s && KEY_NAMES[s.glyph]) return model.slots.length === 2 && s.glyph === 'on' ? 'Top button' : KEY_NAMES[s.glyph];
        if (s) return `Button ${s.glyph}`;
      }
      const l = D.buttonLabel(pid, n);
      return /^\d$/.test(l) ? `Button ${l}` : /button/i.test(l) ? l : `${l} button`;
    }
    // "Kitchen · White · 3-button with arrows"
    const modelLine = d => [D.devAreaName(d), PICO_FINISHES[finishFor(d)].name, PICO_MODELS[modelFor(d)].name].join(' · ');
    // A press from a remote the bridge lists no buttons for: remembered, so the picture and the rows line up with the
    // real keys, and anything already set moves with the key it was set on. True when something changed (save it).
    function rememberPress(id, n) {
      const d = D.dev(id); if (!d || d.domain !== 'pico' || !S.config) return false;
      if (D.buttonsOf(id).length) return false;
      const s = settings(); s.remote_looks = s.remote_looks || {};
      const l = s.remote_looks[id] || (s.remote_looks[id] = { model: null, finish: null });
      const list = l.seen || (l.seen = []);
      if (list.includes(n)) return false;
      const before = slots(d).map(x => x.n);
      list.push(n); list.sort((a, b) => a - b);
      const after = slots(d).map(x => x.n);
      const moved = {};
      before.forEach((b, i) => { if (after[i] !== b) moved[b] = after[i]; });
      for (const b of bindings()) if (b.device_id === id && moved[b.button_number] != null) b.button_number = moved[b.button_number];
      return true;
    }
    // The picture: which model, which finish.
    function setLook(pid, k, v) {
      const s = settings(); s.remote_looks = s.remote_looks || {};
      const cur = s.remote_looks[pid] || {}; cur[k] = v; s.remote_looks[pid] = cur;
      return cur;
    }
    // The two arrow keys, when this remote has a pair, as {up, down}.
    function arrowPair(pid) {
      const d = D.dev(pid); if (!d) return null;
      const ss = slots(d).filter(s => s.real);
      const up = ss.find(s => s.glyph === 'up'), down = ss.find(s => s.glyph === 'down');
      return up && down ? { up: up.n, down: down.n } : null;
    }

    // ---------- what a press does ----------
    // The actions a gesture runs, a hold being either one "hold" setting or a hold_start / hold_end pair.
    function gestureActions(pid, n, g, night = false) {
      if (g !== 'hold') { const b = binding(pid, n, g); return b ? (night ? ((b.night && b.night.actions) || []) : b.actions) : []; }
      const b = binding(pid, n, 'hold_start') || binding(pid, n, 'hold'); if (!b) return [];
      return night ? ((b.night && b.night.actions) || []) : b.actions;
    }
    const holdMain = (pid, n) => binding(pid, n, 'hold_start') || binding(pid, n, 'hold');
    const mainBinding = (pid, n, g) => (g === 'hold' ? holdMain(pid, n) : binding(pid, n, g));
    // A setting that points at something gone: a removed light, room, set or scene.
    function actionBroken(a) {
      const ex = D.targetExists;
      return (a.target && !ex(a.target)) || (a.type === 'scene' && !ex('s:' + a.scene_id)) || (a.type === 'preset' && !ex('p:' + a.preset_id))
        || (a.type === 'cycle_presets' && (a.preset_ids || []).some(id => !ex('p:' + id)));
    }
    function bindingBroken(b) { return [...(b.actions || []), ...((b.night && b.night.actions) || [])].some(actionBroken); }
    const buttonBroken = (pid, n) => bindings().some(b => b.device_id === pid && b.button_number === n && bindingBroken(b));
    const buttonSet = (pid, n) => bindings().some(b => b.device_id === pid && b.button_number === n && b.enabled !== false);
    // "5 of 5 set", "Nothing set up yet", or what is wrong: the remote card's status line.
    function remoteStatus(d) {
      const ns = buttonNumbers(d);
      const broken = ns.filter(n => buttonBroken(d.device_id, n)).length;
      if (broken) return { error: true, text: `${plural(broken, 'button')} ${broken === 1 ? 'points' : 'point'} at a removed light` };
      const set = ns.filter(n => buttonSet(d.device_id, n)).length;
      if (!set) return { none: true, text: 'Nothing set up yet' };
      return { text: `${D.devAreaName(d)} · ${set} of ${ns.length} set` };
    }
    // A hold nobody has set on a key whose press nudges the brightness: the connector ramps while it is held
    // (agent.py _hold_from_step). Nothing is stored for it, so the app works out the same answer rather than saying
    // the key does nothing while it is dimming the room.
    function inheritedHold(pid, n) {
      if (gestureActions(pid, n, 'hold').length) return null;
      const acts = gestureActions(pid, n, 'single');
      if (acts.length !== 1 || acts[0].type !== 'step') return null;
      const ds = D.targetDevices(acts[0].target).map(D.dev).filter(Boolean);
      if (!ds.length || ds.every(d => d.domain === 'fan')) return null;
      return { dir: acts[0].delta > 0 ? 'up' : 'down', target: acts[0].target };
    }

    // ---------- the ready-made ways ----------
    // Everything off, one light kept (dim, or on) for two minutes, fans and shades when the house has them.
    function shutdownActions(keep, mode) {
      const acts = [{ type: 'level', target: 'h:all', level: 'off', fade: 2 }];
      if (keep) acts.push({ type: 'level', target: keep, level: mode === 'dim' ? 10 : 'on', fade: 1 }, { type: 'timer', target: keep, minutes: 2, level: 0, fade: 10 });
      if (hasFans()) acts.push({ type: 'fan', target: 'h:fans', speed: 'Off' });
      if (hasShades()) acts.push({ type: 'lower', target: 'h:shades' });
      return acts;
    }
    // t: the title. d: the line under it. hold: only for a hold. fan: only for fans. any: any lights. pick: asks one
    // more thing before it is set (a scene, scenes in order, the light by the door, the room's five).
    const RECIPES = [
      { id: 'on', t: 'Turn on', mk: T => [{ type: 'level', target: T, level: 'on' }] },
      { id: 'toggle', t: 'Turn on or off', mk: T => [{ type: 'level', target: T, level: 'toggle' }] },
      // The connector keeps how each light was the moment it went dark, its colour included.
      { id: 'back', t: 'Bring back how it was', mk: T => [{ type: 'restore', target: T }] },
      { id: 'off', t: 'Turn off', mk: T => [{ type: 'level', target: T, level: 'off' }] },
      { id: 'full', t: 'Full brightness', mk: T => [{ type: 'level', target: T, level: 100 }] },
      { id: 'half', t: 'Half brightness', mk: T => [{ type: 'level', target: T, level: 50 }] },
      { id: 'night', t: 'Nightlight level', d: '10%', mk: T => [{ type: 'level', target: T, level: 10, fade: 1 }] },
      { id: 'movie', t: 'Movie mode', d: 'To 20% over 8 s', mk: T => [{ type: 'level', target: T, level: 20, fade: 8 }] },
      { id: 'cycle', t: 'Step through brightness', d: '100, 50, 20, off', mk: T => [{ type: 'cycle', target: T, levels: [100, 50, 20, 0] }] },
      { id: 'up', t: 'A little brighter', mk: T => [{ type: 'step', target: T, delta: 10 }] },
      { id: 'down', t: 'A little dimmer', mk: T => [{ type: 'step', target: T, delta: -10 }] },
      { id: 'hold_up', t: 'Brighten while held', hold: true, pair: T => ({ start: [{ type: 'raise', target: T }], end: [{ type: 'stop', target: T }] }) },
      // Hold to dim stops at a glow (floor 1); off is only ever a tap.
      { id: 'hold_down', t: 'Dim while held', d: 'Never goes off', hold: true, pair: T => ({ start: [{ type: 'lower', target: T, floor: 1 }], end: [{ type: 'stop', target: T }] }) },
      { id: 'sleep', t: 'Sleep timer', d: 'Off in 20 min', mk: T => [{ type: 'timer', target: T, minutes: 20, fade: 5 }] },
      { id: 'lightway', t: 'Light the way', d: '10% for 15 min, then off', mk: T => [{ type: 'level', target: T, level: 10, fade: 1 }, { type: 'timer', target: T, minutes: 15, level: 0, fade: 5 }] },
      { id: 'goodnight', t: 'Goodnight', d: 'Everything off but a dim path', any: true, mk: T => shutdownActions(T, 'dim') },
      { id: 'leaving', t: 'Leaving', d: 'Everything off but the door light', any: true, pick: 'door' },
      { id: 'alloff', t: 'Turn everything off', any: true, mk: () => [{ type: 'level', target: 'h:all', level: 'off' }] },
      { id: 'scene', t: 'Run a scene…', any: true, pick: 'scene' },
      // Walks through scenes you choose. On a remote with arrows it sets both: up goes forwards, down goes back.
      { id: 'scenecycle', t: 'Step through scenes…', any: true, scenes: true, pick: 'cycle' },
      { id: 'moodsfirst', t: 'Suggest scenes', d: x => `Makes five for ${x.room}`, any: true, moods: 'none', pick: 'moods' },
      { id: 'fan_up', t: 'Fan: faster', fan: true, mk: T => [{ type: 'step', target: T, delta: 1 }] },
      { id: 'fan_down', t: 'Fan: slower', fan: true, mk: T => [{ type: 'step', target: T, delta: -1 }] },
    ];
    const recipeById = id => RECIPES.find(r => r.id === id) || null;
    function recipeOf(actions) {
      if (!actions || !actions.length) return 'nothing';
      const a = actions[0];
      if (actions.length >= 2 && a.type === 'level' && a.target === 'h:all' && a.level === 'off' && actions[1].type === 'level') return actions[1].level === 'on' ? 'leaving' : 'goodnight';
      if (actions.length === 2 && a.type === 'level' && a.level === 10 && actions[1].type === 'timer') return 'lightway';
      // a Goodnight that keeps no light on: everything off, then only the fans and shades after it
      if (actions.length >= 2 && a.type === 'level' && a.target === 'h:all' && a.level === 'off' && actions.slice(1).every(x => (x.type === 'fan' && x.target === 'h:fans') || (x.type === 'lower' && x.target === 'h:shades'))) return 'goodnight';
      if (actions.length === 1) {
        if (a.type === 'level' && a.target === 'h:all' && a.level === 'off') return 'alloff';
        if (a.type === 'level') {
          if (a.level === 'toggle') return 'toggle'; if (a.level === 'on') return 'on'; if (a.level === 'off') return 'off';
          if (a.level === 100 && !a.fade) return 'full'; if (a.level === 50 && !a.fade) return 'half'; if (a.level === 10) return 'night'; if (a.level === 20 && a.fade === 8) return 'movie';
        }
        if (a.type === 'cycle') return 'cycle';
        if (a.type === 'step') { const f = D.dev(String(a.target || '').slice(2)); if (f && f.domain === 'fan') return a.delta > 0 ? 'fan_up' : 'fan_down'; return a.delta > 0 ? 'up' : 'down'; }
        if (a.type === 'restore') return 'back';
        if (a.type === 'raise') return 'hold_up'; if (a.type === 'lower') return 'hold_down';
        if (a.type === 'timer') return 'sleep';
        if (a.type === 'preset' || a.type === 'scene') return 'scene';
        if (a.type === 'cycle_presets') return 'scenecycle';
      }
      return 'custom';
    }
    // What a press does, in a few words: "Turn on · Kitchen", "Goodnight", "Relax". The sentence when it is no
    // ready-made way.
    function shortDescribe(actions) {
      if (!actions || !actions.length) return '';
      const rid = recipeOf(actions); const r = recipeById(rid);
      const a = actions[0];
      if (rid === 'scene') return cap(D.targetName(a.type === 'preset' ? 'p:' + a.preset_id : 's:' + a.scene_id));
      if (r && !r.pick && !r.any && a.target) return `${r.short || r.t} · ${cap(D.targetName(a.target))}`;
      if (r && (!r.pick || r.id === 'leaving')) return r.short || r.t;
      return D.describe(actions);
    }
    // The room a remote sits in and what it has, for the ways that start from where the remote is.
    function recipeCtx(pid) {
      const d = D.dev(pid); const aid = d ? D.devArea(d) : 'none';
      const mp = H.roomScenes(aid);
      return { aid, room: D.areaName(aid), moodIds: mp.map(p => p.id), moods: mp.length, dimmers: H.roomDimmers(aid).length, arrows: arrowPair(pid), scenes: D.presets().length };
    }
    function defaultTarget(pid) {
      const d = D.dev(pid); const aid = d ? D.devArea(d) : 'none';
      if (aid !== 'none' && D.targetDevices(`a:${aid}`).length) return `a:${aid}`;
      const first = D.controllable()[0];
      return first ? `a:${D.devArea(first)}` : 'h:all';
    }
    // Does a way fit this press and these lights.
    function applies(r, g, T, x) {
      const ds = D.targetDevices(T).map(D.dev).filter(Boolean);
      const isFan = ds.length > 0 && ds.every(d => d.domain === 'fan');
      const moodsOk = !r.moods || (r.moods === 'none' ? (x.moods === 0 && x.dimmers > 0) : x.moods >= 1);
      return (!r.hold || g === 'hold') && (!r.fan || isFan) && (r.fan || !isFan || r.any) && moodsOk && (!r.scenes || x.scenes >= 2);
    }
    // The five usual ways for a press (08's "Suggested"), the current one kept in view when it is not among them.
    const USUAL = { single: ['on', 'toggle', 'back', 'scene', 'goodnight'], double: ['full', 'night', 'alloff', 'scene', 'room'], hold: ['hold_up', 'hold_down', 'sleep', 'goodnight', 'alloff'], fan: ['fan_up', 'fan_down'] };
    function suggested(pid, n, g, T, night = false) {
      const x = recipeCtx(pid);
      const ds = D.targetDevices(T).map(D.dev).filter(Boolean);
      const isFan = ds.length > 0 && ds.every(d => d.domain === 'fan');
      const room = x.moods >= 2 ? 'scenecycle' : (x.moods === 0 && x.dimmers > 0 ? 'moodsfirst' : null);
      let ids = (isFan ? USUAL.fan : USUAL[g] || USUAL.single).map(id => (id === 'room' ? room : id)).filter(Boolean);
      // An arrow is the key pressed again and again: a nudge and a walk through scenes lead there.
      if (!isFan && x.arrows && (n === x.arrows.up || n === x.arrows.down)) {
        const up = n === x.arrows.up;
        if (g === 'single') ids = [up ? 'up' : 'down', 'scenecycle', up ? 'on' : 'off', 'scene', 'toggle'];
        if (g === 'hold') ids = [up ? 'hold_up' : 'hold_down', up ? 'hold_down' : 'hold_up', 'sleep', 'alloff'];
      }
      const list = ids.map(recipeById).filter(r => r && applies(r, g, T, x));
      const cur = recipeById(recipeOf(gestureActions(pid, n, g, night)));
      if (cur && applies(cur, g, T, x) && !list.includes(cur)) list.push(cur);
      return list;
    }
    // Every way, grouped, for "More choices".
    const GROUPS = [['Brightness', ['on', 'toggle', 'back', 'off', 'full', 'half', 'night', 'movie', 'cycle', 'up', 'down', 'hold_up', 'hold_down']], ['Scenes', ['scene', 'scenecycle', 'moodsfirst']], ['Timers and going out', ['sleep', 'lightway', 'goodnight', 'leaving', 'alloff']], ['Fans', ['fan_up', 'fan_down']]];
    function allWays(pid, n, g, T) {
      const x = recipeCtx(pid);
      const hasFan = D.targetDevices(T).some(id => (D.dev(id) || {}).domain === 'fan');
      return GROUPS.map(([name, ids]) => [name, ids.map(recipeById).filter(r => r && applies(r, g, T, x) && (name !== 'Fans' || hasFan))]).filter(([, rs]) => rs.length);
    }
    const recipeLine = (r, pid) => (typeof r.d === 'function' ? r.d(recipeCtx(pid)) : r.d || '');

    // ---------- which lights ----------
    // The lights a press points at now, or the remote's own room.
    function targetsOf(pid, n, g, night = false) {
      const cur = gestureActions(pid, n, g, night).find(a => a.target && a.target !== 'h:all' && a.target !== 'h:fans' && a.target !== 'h:shades');
      const list = cur ? tlist(cur.target).filter(D.targetExists) : [];
      return list.length ? list : [defaultTarget(pid)];
    }
    // A sensible picked list: a room replaces its own lights, a light replaces its room, "everything" stands alone,
    // shades sit beside the lights.
    function normalizeTargets(list, added) {
      const shade = t => t === 'h:shades' || (t.startsWith('d:') && (D.dev(t.slice(2)) || {}).domain === 'cover');
      const shades = [...new Set(list.filter(shade))];
      let out = [...new Set(list.filter(t => !shade(t)))];
      if (!added) return [...out, ...shades];
      if (shade(added)) return [...out, ...(added === 'h:shades' ? ['h:shades'] : shades.filter(t => t !== 'h:shades'))];
      if (added === 'h:all') return ['h:all', ...shades];
      out = out.filter(t => t !== 'h:all');
      if (added.startsWith('a:')) out = out.filter(t => !(t.startsWith('d:') && D.devArea(D.dev(t.slice(2))) === added.slice(2) && t !== added));
      if (added.startsWith('d:')) { const area = D.devArea(D.dev(added.slice(2))); out = out.filter(t => t !== `a:${area}`); }
      return [...out, ...shades];
    }
    // "4 lights in 2 rooms"
    function targetSummary(T) {
      const ids = D.targetDevices(T);
      const rooms = new Set(ids.map(id => D.devArea(D.dev(id))));
      return `${plural(ids.length, ids.every(id => (D.dev(id) || {}).domain === 'cover') && ids.length ? 'shade' : 'light')}${rooms.size > 1 ? ` in ${rooms.size} rooms` : ''}`;
    }
    // Move what a press already does onto new lights. True when something moved.
    function retarget(pid, n, g, night, T) {
      const bs = g === 'hold' ? [binding(pid, n, 'hold_start'), binding(pid, n, 'hold_end'), binding(pid, n, 'hold')].filter(Boolean) : [binding(pid, n, g)].filter(Boolean);
      let changed = false;
      for (const b of bs) {
        const list = night ? ((b.night && b.night.actions) || []) : b.actions;
        for (const a of list) {
          if (!a.target || a.target === 'h:all' || a.target === 'h:fans' || a.target === 'h:shades') continue;
          if (JSON.stringify(a.target) !== JSON.stringify(T)) { a.target = Array.isArray(T) ? [...T] : T; changed = true; }
        }
      }
      return changed;
    }

    // ---------- setting a press ----------
    const dropGesture = (pid, n, gs) => { cfg().bindings = bindings().filter(b => !(b.device_id === pid && b.button_number === n && gs.includes(b.gesture))); };
    // Put a list of actions on a press, or on its night version. A night version sits on an ordinary press, so there
    // has to be one: false when there is not.
    function setActions(pid, n, g, night, actions) {
      if (night) {
        const b = mainBinding(pid, n, g); if (!b) return false;
        b.night = actions && actions.length ? { actions } : null;
        if (b.gesture === 'hold_start') { const e = binding(pid, n, 'hold_end'); if (e) e.night = actions && actions.length ? { actions: [] } : null; }
        return true;
      }
      const prev = mainBinding(pid, n, g);
      const keepNight = prev && prev.night ? prev.night : null;
      dropGesture(pid, n, g === 'hold' ? ['hold', 'hold_start', 'hold_end'] : [g]);
      if (actions && actions.length) cfg().bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: g, actions, night: keepNight, enabled: true });
      return true;
    }
    // A ready-made way on a press. Returns { actions } when it is set, or { pick } when it needs one more answer
    // (scene, cycle, door, moods) first, or { needsNormal } for a night version with nothing to sit on.
    function applyRecipe(pid, n, g, night, rid, T) {
      const r = recipeById(rid);
      if (rid !== 'nothing' && !r) return null;
      if (r && r.pick) return { pick: r.pick };
      if (night && !mainBinding(pid, n, g)) return { needsNormal: true };
      if (rid === 'nothing') { if (night) setActions(pid, n, g, true, null); else dropGesture(pid, n, g === 'hold' ? ['hold', 'hold_start', 'hold_end'] : [g]); return { actions: [] }; }
      if (rid === 'lightway') { const path = D.groups().find(x => /night path/i.test(x.name)); if (path) T = `g:${path.id}`; }
      if (r.pair) {
        const p = r.pair(T);
        if (night) {
          const b = mainBinding(pid, n, g); b.night = { actions: p.start };
          const e = binding(pid, n, 'hold_end'); if (e) e.night = { actions: p.end };
          return { actions: p.start };
        }
        const prev = holdMain(pid, n); const keepNight = prev && prev.night ? prev.night : null;
        dropGesture(pid, n, ['hold', 'hold_start', 'hold_end']);
        cfg().bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: 'hold_start', actions: p.start, night: keepNight, enabled: true },
          { id: uid(), device_id: pid, button_number: n, gesture: 'hold_end', actions: p.end, night: null, enabled: true });
        return { actions: p.start };
      }
      const actions = r.mk(T, recipeCtx(pid));
      setActions(pid, n, g, night, actions);
      return { actions };
    }
    // "Leaving": everything off, the light by the door on for two minutes.
    function saveLeaving(pid, n, g, door) {
      const actions = shutdownActions(door, 'on');
      if (g === 'hold') holdReplace(pid, n, actions); else setActions(pid, n, g, false, actions);
      return actions;
    }
    // A hold that runs a list once, in place of whatever the key's hold did.
    function holdReplace(pid, n, actions) {
      dropGesture(pid, n, ['hold', 'hold_start', 'hold_end']);
      cfg().bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: 'hold', actions, night: null, enabled: true });
    }
    // "Step through scenes…": on a remote with arrows both arrows are written, forwards on up and back on down,
    // because a walk on one arrow alone is half a control. Returns how many keys were written.
    function saveCycle(pid, n, g, night, ids) {
      if (!ids || ids.length < 2) return 0;
      const x = recipeCtx(pid);
      const pair = x.arrows && (n === x.arrows.up || n === x.arrows.down) ? x.arrows : null;
      const write = (num, dir) => setActions(pid, num, g, night, [dir < 0 ? { type: 'cycle_presets', preset_ids: ids.slice(), dir: -1 } : { type: 'cycle_presets', preset_ids: ids.slice() }]);
      return pair ? [write(pair.up, 1), write(pair.down, -1)].filter(Boolean).length : (write(n, 1) ? 1 : 0);
    }
    function cycleIdsOf(pid, n, g, night) {
      const cur = gestureActions(pid, n, g, night).find(a => a.type === 'cycle_presets');
      return cur ? (cur.preset_ids || []).filter(id => D.presets().some(p => p.id === id)) : recipeCtx(pid).moodIds;
    }
    // "Suggest scenes": the room's five, then a press walks through them. The number of scenes it walks.
    function suggestAndCycle(pid, n, g, night) {
      const x = recipeCtx(pid); if (x.aid === 'none') return 0;
      H.suggestScenes(x.aid);
      const ids = H.roomSuggested(x.aid).map(p => p.id);
      return saveCycle(pid, n, g, night, ids) ? ids.length : 0;
    }
    // The light a Leaving press keeps on, or a good guess at the one by the door.
    function doorOf(pid, n, g) {
      const cur = (gestureActions(pid, n, g).find(a => a.type === 'level' && a.target !== 'h:all') || {}).target;
      if (cur) return cur;
      const lights = D.controllable().filter(d => d.domain === 'light' || d.domain === 'switch');
      const d = lights.find(x => /hall|entry|foyer|mud/i.test(D.devAreaName(x))) || lights[0];
      return d ? `d:${d.device_id}` : null;
    }

    // ---------- the usual layout ----------
    // Top turns the room on, bottom turns it off, holding either brightens or dims, the round key a scene.
    function usualLayoutTargets(d) {
      const real = slots(d).filter(s => s.real);
      const top = real.find(s => s.glyph === 'on'), bottom = real.find(s => s.glyph === 'off'), round = real.find(s => s.glyph === 'fav');
      if (D.devArea(d) === 'none' || !top || !bottom) return null;
      return { top: top.n, bottom: bottom.n, round: round ? round.n : null };
    }
    function applyUsualLayout(pid) {
      const d = D.dev(pid); const u = d && usualLayoutTargets(d); if (!u) return null;
      const aid = D.devArea(d); const T = `a:${aid}`;
      const mk = (n, gesture, actions) => ({ id: uid(), device_id: pid, button_number: n, gesture, actions, night: null, enabled: true });
      const list = [
        mk(u.top, 'single', [{ type: 'level', target: T, level: 'on' }]), mk(u.top, 'double', [{ type: 'level', target: T, level: 100 }]),
        mk(u.top, 'hold_start', [{ type: 'raise', target: T }]), mk(u.top, 'hold_end', [{ type: 'stop', target: T }]),
        mk(u.bottom, 'single', [{ type: 'level', target: T, level: 'off', fade: 1 }]), mk(u.bottom, 'double', [{ type: 'level', target: 'h:all', level: 'off' }]),
        mk(u.bottom, 'hold_start', [{ type: 'lower', target: T, floor: 1 }]), mk(u.bottom, 'hold_end', [{ type: 'stop', target: T }]),
      ];
      if (u.round != null) {
        const mp = H.roomSuggested(aid);
        const relax = mp.find(p => p.mood === 'relax');
        if (relax) { list.push(mk(u.round, 'single', [{ type: 'preset', preset_id: relax.id }])); if (mp.length >= 2) list.push(mk(u.round, 'double', [{ type: 'cycle_presets', preset_ids: mp.map(p => p.id) }])); }
        else list.push(mk(u.round, 'single', [{ type: 'level', target: T, level: 50 }]), mk(u.round, 'double', [{ type: 'level', target: T, level: 10, fade: 1 }]));
      }
      // arrows, when there are any: a nudge each way, and holding ramps (the connector's own hold from a step)
      const ar = arrowPair(pid);
      if (ar) list.push(mk(ar.up, 'single', [{ type: 'step', target: T, delta: 10 }]), mk(ar.down, 'single', [{ type: 'step', target: T, delta: -10 }]));
      cfg().bindings = bindings().filter(b => b.device_id !== pid).concat(list);
      return list;
    }
    // Everything this remote does, gone. Returns how many settings went.
    function clearRemote(pid) { const before = bindings().length; cfg().bindings = bindings().filter(b => b.device_id !== pid); return before - bindings().length; }

    // ---------- building a press step by step ----------
    // The list the step editor edits: a press's, its night version's (made on first use), created when missing.
    function stepsFor(pid, n, g, night) {
      let b = mainBinding(pid, n, g);
      if (!b) { if (night) return null; b = { id: uid(), device_id: pid, button_number: n, gesture: g, actions: [], night: null, enabled: true }; cfg().bindings.push(b); }
      if (night) { if (!b.night) b.night = { actions: [] }; return b.night.actions; }
      return b.actions;
    }
    // A fresh step of a kind, pointed at `T`.
    function freshAction(type, T) {
      const ps = D.presets(), ls = D.lutronScenes();
      const fan = (D.targetOptions({ fansOnly: true })[0] || {}).id;
      return ({
        level: { type: 'level', target: T, level: 'toggle' }, step: { type: 'step', target: T, delta: 10 }, cycle: { type: 'cycle', target: T, levels: [100, 50, 20, 0] },
        raise: { type: 'raise', target: T }, lower: { type: 'lower', target: T }, stop: { type: 'stop', target: T },
        fan: { type: 'fan', target: fan || T, speed: 'High' },
        scene: ps[0] ? { type: 'preset', preset_id: ps[0].id } : { type: 'scene', scene_id: (ls[0] || {}).scene_id || '' },
        timer: { type: 'timer', target: T, minutes: 20, level: 0, fade: 5 }, cancel_timer: { type: 'cancel_timer', target: T }, delay: { type: 'delay', ms: 1000 },
      })[type] || null;
    }
    // One field of one step changed: the value as a form gives it.
    function editAction(list, i, k, v) {
      const a = list[i]; if (!a) return;
      if (k === 'type') { const f = freshAction(v, a.target || 'h:all'); if (f) list[i] = f; return; }
      if (k === 'scene_ref') { list[i] = v.startsWith('p:') ? { type: 'preset', preset_id: v.slice(2) } : { type: 'scene', scene_id: v.slice(2) }; return; }
      if (k === 'fade') { if (v === '' || v == null) delete a.fade; else a.fade = Number(v); return; }
      if (k === 'level') { a.level = ['toggle', 'on', 'off'].includes(v) ? v : Number(v); return; }
      if (['delta', 'minutes', 'ms'].includes(k)) { a[k] = Number(v); return; }
      if (k === 'levels') { a.levels = String(v).split(/[,\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= 0 && x <= 100); return; }
      a[k] = v;
    }

    return {
      PICO_MODELS, PICO_FINISHES, RECIPES, ACTION_LABELS, GESTURES, GESTURE_WORD, GESTURE_PAST,
      modelFor, finishFor, seen, knownNumbers, slots, extraButtons, buttonNumbers, buttonName, modelLine, rememberPress, setLook, arrowPair,
      gestureActions, mainBinding, actionBroken, bindingBroken, buttonBroken, buttonSet, remoteStatus, inheritedHold,
      shutdownActions, recipeById, recipeOf, shortDescribe, recipeCtx, defaultTarget, suggested, allWays, recipeLine,
      targetsOf, normalizeTargets, targetSummary, retarget, packTarget,
      setActions, applyRecipe, saveLeaving, holdReplace, saveCycle, cycleIdsOf, suggestAndCycle, doorOf,
      usualLayoutTargets, applyUsualLayout, clearRemote, stepsFor, freshAction, editAction,
    };
  }

  const CasetaRemotes = { create, PICO_MODELS, PICO_FINISHES, KEY_NAMES, ACTION_LABELS, GESTURE_WORD, GESTURE_PAST };
  if (typeof module !== 'undefined' && module.exports) module.exports = CasetaRemotes;
  if (root) root.CasetaRemotes = CasetaRemotes;
})(typeof window !== 'undefined' ? window : null);
