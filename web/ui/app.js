// Copper Night: the app. One module that owns the data layer instance, the route, the redraw, the toast and the
// socket; each screen is a module in web/ui/screens/ that turns the state into HTML and says what its taps do.
//
// Nothing here decides anything about the home: that is web/data/. This file only asks it and draws the answer.
// It is served at /ui/ beside the old app until cutover (docs/design-spec-v6.md, the handoff's phase 5).
import '/js/kinds.js';
import '/js/cities.js';
import { create, CasetaHome, CasetaDaylight, CasetaEdit, CasetaRemotes, CasetaRoutines, RECONNECT_GRACE, esc, levelOf } from '/data/index.js';
import { icon } from '/ui/icons.js';
import { deviceArt, roomArt, artSrc, kindArt } from '/ui/art.js';
import { lampTint } from '/ui/tint.js';
import * as motion from '/ui/motion.js';
import * as opening from '/ui/opening.js';
import * as swipeBack from '/ui/predictiveback.js';
import * as chipOpen from '/ui/chipopen.js';
import * as header from '/ui/header.js';
import { wireSheetDrag } from '/ui/sheetdrag.js';
import * as homeScreen from '/ui/screens/home.js';
import * as roomsScreen from '/ui/screens/rooms.js';
import * as roomScreen from '/ui/screens/room.js';
import * as deviceScreen from '/ui/screens/device.js';
import * as soonScreen from '/ui/screens/soon.js';
import * as scenesScreen from '/ui/screens/scenes.js';
import * as remotesScreen from '/ui/screens/remotes.js';
import * as remoteScreen from '/ui/screens/remote.js';
import * as timingScreen from '/ui/screens/timing.js';
import * as routinesScreen from '/ui/screens/routines.js';
import * as routineScreen from '/ui/screens/routine.js';
import * as guidedScreen from '/ui/screens/guided.js';
import * as activityScreen from '/ui/screens/activity.js';
import * as settingsScreen from '/ui/screens/settings.js';
import * as addScreen from '/ui/screens/add.js';
import * as onboard from '/ui/screens/onboard.js';
import { OFFLINE_TAP } from '/ui/screens/conn.js';
import * as beyond from '/ui/beyond.js';
import * as native from '/ui/native.js';
import * as nightstandScreen from '/ui/screens/nightstand.js';
import * as widgetsScreen from '/ui/screens/widgets.js';
import * as widgetData from '/ui/widgetdata.js';

const data = create({ storage: localStorage });
const H = CasetaHome.create(data);
const DAY = CasetaDaylight.create(data);
const EDIT = CasetaEdit.create(data, H);
const REM = CasetaRemotes.create(data, H);
const RT = CasetaRoutines.create(data, H, REM);
const S = data.S;
const $ = s => document.querySelector(s);

// ---------- commands and saving ----------
// Run one action now. A failure is said in a toast and never thrown at the screen.
async function run(action) {
  // 18 · Offline, calmly: past the quiet ten seconds a tap is answered at once and nothing is queued to replay later
  if (data.connState() === 'off') { toast(OFFLINE_TAP, { icon: 'wifi' }); return false; }
  // a scene arriving crossfades every light it touches over the scene's 1.0 s, not one light's 0.4 s
  if (action && (action.type === 'preset' || action.type === 'scene')) motion.sceneArriving();
  // the scene run last in a room is the one it is showing, when more than one would fit (home.js sceneMatch)
  if (action && action.type === 'preset') H.noteSceneRun(action.preset_id);
  try { await data.run(action); return true; }
  catch (e) { toast(e.message, { err: true }); return false; }
}
// A finger on a slider: one command in flight per light, the newest value next (the layer's gate).
const gate = data.gate(run);
// Every change applies at once; there is no save button anywhere, and only a deletion offers Undo.
async function save(msg, opts = {}) {
  try {
    const { prev } = await data.saveConfig();
    // a change shows where it was made; only a deletion says so, with Undo (see toast)
    if (!opts.quiet && opts.keepUndo) toast(msg || 'Saved', { keepUndo: true, undo: prev ? async () => { data.restoreConfig(prev); await save('', { quiet: true }); } : null });
  } catch (e) {
    toast(`Couldn't save. ${e.message}`, { err: true });
  }
  render();
}
// Many small edits in a row (a slider in a scene, typing a name) save once, quietly, after they stop.
let saveTimer = null;
function saveSoon(ms = 700) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save('', { quiet: true }), ms); }
// Show a light's new level before the bridge confirms it, so a tap feels like it landed.
// What "on" will mean for a light right now, decided the way the connector decides it (engine.on_level_for), so a
// light switched on shows the level it is about to be and does not jump when the bridge answers: a task light comes
// on at the home's level, a light set with its own level at that, anything else at the evening curve's level while
// the wind-down is on (30% late at night, say), and otherwise at the home's level.
function onLevel(id, target) {
  const s = S.config.settings || {};
  const base = Number(s.group_on_level) || 100;
  if ((s.roles || {})[id] === 'task') return base;
  if (typeof target === 'string' && target.startsWith('g:')) {
    const g = (S.config.groups || []).find(x => x.id === target.slice(2));
    if (g && g.on_level) return Number(g.on_level);
  }
  const cl = RT.curveLevelNow();
  return cl != null ? cl : base;
}
// A slider held by a finger also holds that level against the bridge's echoes of the values it passed through.
function assume(ids, level, { held = false } = {}) { if (data.connState() === 'off') return; for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level }; if (held) data.hold(ids); }

// ---------- switching lights ----------
// Every place a light is switched goes through turn(): a tile's power circle, a room's (on Rooms, pinned on Home, the
// room page's On and Off), a light's page, All off and All on, Goodnight, a scene chip. It shows each light at once
// where the connector is about to put it, holds it there while the bridge reports its way there (the data layer's
// expect), and lets the bridge have the last word once the fade is over. One place, so no screen can show a light
// on, then off, then on again while the bridge catches up, and a room or the house lands all at once rather than a
// light at a time.
//
// Where each light lands, decided the way the connector decides it (engine.py run_one): "on" is each light's own on
// level for this target, "toggle" is off when anything in it is on, a scene is its own levels. A restore or a Lutron
// scene lands where only the connector knows, so those are not shown ahead: their lights change as the bridge says.
// Fans and shades are left to the bridge too. Null when nothing can be said ahead of the bridge.
function landFor(action) {
  const s = S.config.settings || {};
  const lamp = id => { const d = data.dev(id); return !!d && (d.domain === 'light' || d.domain === 'switch'); };
  const levels = {};
  if (action.type === 'level' || (action.type === 'color' && action.level != null)) {
    const ids = data.targetDevices(action.target).filter(lamp);
    const anyOn = ids.some(data.isOn);
    for (const id of ids) {
      const l = action.level;
      const v = l === 'on' ? onLevel(id, action.target) : l === 'off' ? 0 : l === 'toggle' ? (anyOn ? 0 : onLevel(id, action.target)) : Number(l);
      if (Number.isFinite(v)) levels[id] = data.landing(id, v);
    }
  } else if (action.type === 'preset') {
    const p = data.presets().find(x => x.id === action.preset_id); if (!p) return null;
    for (const [id, v] of Object.entries(p.levels || {})) if (lamp(id)) levels[id] = data.landing(id, levelOf(v));
    return { levels, fade: p.fade != null ? p.fade : s.default_fade };
  } else return null;
  return { levels, fade: action.fade != null ? action.fade : s.default_fade };
}
async function turn(action) {
  const land = data.connState() === 'off' ? null : landFor(action);
  const n = land && Object.keys(land.levels).length ? data.expect(land.levels, land.fade) : null;
  if (n) soon();
  // through the context's run, the one every screen sends with, so anything that watches what is sent sees this too
  const ok = await ctx.run(action);
  // not sent: the lights are shown as the bridge has them again, at once
  if (n && data.sent(n, ok)) soon();
  return ok;
}
// a hold the data layer lets go of by itself (the fade is over) shows what the bridge said meanwhile
data.hooks.changed = () => soon();

// ---------- the toast ----------
// The owner turned toasts off for now because they got in the way; set this back to true to bring every one back.
const TOASTS = false;
let toastTimer = null;
// A toast is for what the house cannot show. A light turning on, dimming or changing colour is its own answer, and
// the owner found a toast sitting over the page after every tap, offering Undo, more in the way than useful. So a
// toast whose only job is Undo is not shown at all; Undo stays where something was deleted (a room, a scene, a
// routine), which nothing on the page can bring back (opts.keepUndo). Errors and plain notes still show.
function toast(msg, opts = {}) {
  if (!TOASTS) return;
  if (opts.undo && !opts.keepUndo && !opts.err) return;
  const root = $('#toast-root');
  // "Undo" for a change; "Put back" for a scene, Goodnight or Try it (opts.undoLabel), which may stay longer (opts.ms)
  const undo = opts.undo ? `<button class="act" data-act="toast-undo">${esc(opts.undoLabel || 'Undo')}</button>` : '';
  root.innerHTML = `<div class="toast ${opts.err ? 'err' : ''}" role="status"${opts.ms ? ` style="--toast-ms:${opts.ms}ms"` : ''}>${icon(opts.err ? 'x' : opts.icon || 'check', 20, 1.8)}<span class="msg">${esc(msg)}</span>${undo}</div>`;
  root._undo = opts.undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root._undo = null; const t = root.firstElementChild; if (t) motion.leave(t); }, opts.ms || 5000);
}

// ---------- the sheet ----------
// One-choice interactions are a sheet over the page. A screen hands in the overline, title and body.
// Opening the sheet that is already open (the same key) only redraws its body, so a state change never replays
// its rise. `onClose` runs when it is dismissed (the scrim, the X); a sheet that is a page's sub route uses it to
// step the address back to the page.
function openSheet({ over = '', title, body, key = '', onClose = null, back = false, head = '' }) {
  const root = $('#sheet-root');
  const headHTML = `<div class="sheet-head ${back ? 'has-back' : ''}">${back ? `<button class="sheet-back" data-act="picker-back" aria-label="Back">${icon('back', 18, 1.8)}</button>` : ''}${over ? `<div class="t-over">${esc(over)}</div>` : ''}<h2 class="t-sheet">${esc(title)}</h2>
        ${head}<button class="sheet-close" data-act="sheet-close" aria-label="Close">${icon('x', 18, 1.8)}</button></div>`;
  if (key && root.dataset.key === key && !root.hidden) {
    root._onClose = onClose;
    // someone typing in the sheet (a name) is never redrawn out from under
    const a = document.activeElement;
    if (a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return root;
    const snap = motion.snap(root.querySelector('.sheet'));
    const h = root.querySelector('.sheet-head'); if (h) h.outerHTML = headHTML;
    const b = root.querySelector('.sheet-body'); if (b) b.innerHTML = body;
    motion.carry(snap, root.querySelector('.sheet'));
    return root;
  }
  // one sheet replacing another (White to Colour) swaps in place rather than rising again
  const still = !root.hidden && !!root.dataset.key;
  root.dataset.key = key;
  root._onClose = onClose;
  root.innerHTML = `<button class="scrim ${still ? 'still' : ''}" data-act="sheet-close" aria-label="Close"></button>
    <div class="sheet ${still ? 'still' : ''}" role="dialog" aria-label="${esc(title)}"><div class="grab"></div>
      ${headHTML}
      <div class="sheet-body">${body}</div></div>`;
  root.hidden = false;
  return root;
}
// It drops rather than vanishing (0.28 s EASE_IN, the scrim fading with it); what falls is a copy, and the sheet
// itself is gone at once, so nothing on it can be tapped on the way down.
// (A sheet swiped down has already fallen: `dropped` closes it without a second drop.)
// A scene's editor opened from its chip goes back into the chip instead (chipopen.js, M12).
function closeSheet({ dropped = false } = {}) { const root = $('#sheet-root'); if (!dropped && !chipOpen.close(root)) motion.sheetOut(root); root.innerHTML = ''; root.hidden = true; root.dataset.key = ''; root._onClose = null; }
function dismissSheet(o) { const root = $('#sheet-root'); const f = root._onClose; closeSheet(o); if (f) f(); }
// Swiping a sheet down puts it away, as the close button does (sheetdrag.js).
// A scene's editor opened from its chip, let go past the point of closing, goes into the chip from where it is.
wireSheetDrag($('#sheet-root'), () => dismissSheet({ dropped: true }), {
  handoff: dy => { if (!chipOpen.close($('#sheet-root'), { dy })) return false; dismissSheet({ dropped: true }); return true; },
});

// ---------- the route ----------
// #home, #rooms, #room/<id>, #light/<id>, #remotes, #remote/<id>, #routines, #settings, #activity, #scenes. The old
// app's #automations still lands on Routines, so an installed shortcut keeps working.
const ALIAS = { automations: 'routines', '': 'home' };
function route() { return parseRoute(location.hash); }
function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  let parts;
  try { parts = decodeURIComponent(raw).split('/'); } catch (_) { parts = ['home']; }
  const name = ALIAS[parts[0]] ?? parts[0];
  // #light/<id>/white: the id, then the page under it
  return { name, id: parts[1] || null, sub: parts.slice(2).join('/') || null };
}
const SCREENS = {
  home: homeScreen, rooms: roomsScreen, room: roomScreen, light: deviceScreen, scenes: scenesScreen,
  remotes: remotesScreen, remote: remoteScreen, timing: timingScreen,
  routines: routinesScreen, routine: routineScreen, setup: guidedScreen, activity: activityScreen,
  settings: settingsScreen, add: addScreen, nightstand: nightstandScreen, widgets: widgetsScreen,
};
const TAB_OF = { home: 'home', rooms: 'rooms', room: 'rooms', light: 'rooms', scenes: 'rooms', remotes: 'remotes', remote: 'remotes', timing: 'remotes', routines: 'routines', routine: 'routines', setup: 'routines', settings: 'settings', add: 'settings', widgets: 'settings', activity: 'home' };
const TABS = [['home', 'home', 'Home'], ['rooms', 'grid', 'Rooms'], ['remotes', 'remote', 'Remotes'], ['routines', 'clock', 'Routines'], ['settings', 'gear', 'Settings']];
// A screen draws the pages under it that it declares (screen.subs); any other sub page is not built yet.
function screenFor(r) {
  const screen = SCREENS[r.name];
  if (!screen) return soonScreen;
  if (r.sub && !screen.sheetFor && !(screen.subs || []).includes(r.sub) && !(screen.sheets && screen.sheets[r.sub])) return soonScreen;
  return screen;
}
function go(hash) { if (location.hash === '#' + hash) render(); else { markStep(); location.hash = hash; } }
// ---------- the back button ----------
// Every entry this app makes carries its place in the app's own history, { n }: 0 is the entry it opened on, and each
// page (or sheet) opened on top adds one. Two rules keep Back to one press per step:
//   a tab never stacks up: the history under a tab's own page is Home and nothing else, so Back from any tab is
//     Home and Back from Home leaves the app. Switching tabs steps back to the bottom first and goes from there.
//   a sheet opened from its page is a step of its own, so closing it (the X, a swipe down, a choice) steps back
//     rather than writing the page over the sheet's entry, which left two of the page and a Back that did nothing.
const place = () => (history.state && typeof history.state.n === 'number' ? history.state.n : 0);
const stamp = extra => history.replaceState({ ...(history.state || {}), n: place(), ...extra }, '', location.href);
// A step through the history is in flight from the moment it is asked until the address changes. A redraw asked for
// meanwhile (a save landing, the socket) would draw the entry being left again: a sheet just closed rose again and
// dropped a second time, a deleted routine's page showed "deleted" for a frame. It waits for the step instead.
let stepping = 0, skipped = false;
// and should the address never change (a step with nowhere to go), the held redraw is drawn after all
function markStep() {
  const at = stepping = performance.now();
  setTimeout(() => { if (stepping !== at) return; stepping = 0; if (skipped) { skipped = false; render(); } }, 650);
}
function stepHistory(n) { markStep(); stepTo = place() + n; history.go(n); }
// Where a step back through the history is going, and whether the entry just arrived at was reached by one: an entry
// with no number reached by going back is an old one (a page the app opened on before it numbered anything), not a
// new step above the last, and is given the number the step was going to. Numbered as a new step it made the count
// one too many, and a tab's button, stepping back that many, stepped out of the app.
let stepTo = null, navType = null;
// (the browser says which: a hash set by a tap is a push, Back and history.go are a traverse; without its Navigation
// API every new entry counts as a step up, as before)
if (window.navigation && typeof window.navigation.addEventListener === 'function') window.navigation.addEventListener('navigate', e => { navType = e.navigationType; });
// One step back: the entry under this one, or Home from a tab at the bottom. False on Home at the bottom, where Back
// leaves the app (Android's back swipe asks this too, predictiveback.js).
function stepBack() {
  if (place() > 0) { stepHistory(-1); return true; }
  if (route().name !== 'home') { replaceTo('home'); return true; }
  return false;
}
// location.replace puts a new entry in this one's place, and a new entry arrives unnumbered; it is this step, not
// one above it. Numbered as a new step, Home (or a tab) on the bottom entry became step 1, and Back from it left the
// app instead of going Home, or stepped out of Home instead of leaving.
let replacing = null;
function replaceTo(hash) { if (location.hash === '#' + hash) return; replacing = place(); location.replace('#' + hash); }
let pendingTab = null;
function goTab(tab) {
  const n = place();
  if (n > 0) { pendingTab = tab; stepHistory(-n); return; }
  if (!landTab(tab)) render();
}
// On the bottom entry: Home is the floor; another tab sits one above it. True when the address changes (its own
// hashchange then draws it), false when the bottom entry already is that tab.
function landTab(tab) {
  const here = location.hash.replace(/^#/, '') || 'home';
  if (here === tab) return false;
  markStep();
  if (tab === 'home' || route().name !== 'home') replaceTo(tab);
  else location.hash = tab;
  return true;
}

// Put another page in this entry's place: a finished walk hands over to what it made, and Back then goes where it
// would have gone from the walk rather than back into it. The entry keeps its step and its tab.
function replacePage(hash) {
  const oldURL = location.href;
  history.replaceState({ n: place(), tab: history.state && history.state.tab }, '', '#' + hash);
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: location.href }));
}
// The thing a page shows is gone (a routine deleted from its own sheet): close the sheet and leave the page the way
// Back would, rather than writing the list over the sheet's entry and leaving the page and its sheet under it.
// Opened by its address with its sheet a step above it, the page that is gone is the bottom entry: the step goes down
// to it and `fallback` takes its place there (as a tab does), so no step of the gone page is left under it.
function leavePage(fallback) {
  const steps = (history.state && history.state.sheet ? 1 : 0) + 1;
  closeSheet(); ctx.ui.picker = null;
  if (place() >= steps) { stepHistory(-steps); return; }
  if (place() > 0) { pendingTab = fallback; stepHistory(-place()); return; }
  history.replaceState({ ...history.state, sheet: false }, '', '#' + fallback); render();
}

// ---------- what every screen is handed ----------
const ctx = {
  data, H, DAY, EDIT, REM, RT, S, esc, icon, deviceArt, roomArt, artSrc, kindArt, lampTint,
  openPicker: (n, spec) => openPicker(n, spec), closePicker: () => closePicker(),
  run, turn, gate, save, saveSoon, assume, onLevel, toast, go, openSheet, closeSheet, render: () => render(),
  // the history's own steps, for a page that finishes something: dismiss closes a sheet as its X does (a step back
  // when it was opened as one), back is the back circle, goTab is a tab's button, replace and leave are above,
  dismiss: () => dismissSheet(), back: () => stepBack(), goTab: t => goTab(t), replace: h => replacePage(h), leave: f => leavePage(f),
  // a walk that is done goes back the way it came in (to Routines, where it was started), or, when the app opened on
  // it with nothing under it, puts `hash` in its place
  finish: h => { if (place() > 0) stepBack(); else replacePage(h); },
  // whether toasts are on at all, so copy that points at one (Undo from the toast) can leave that out while they are off
  toasts: TOASTS,
  // swap the page's sub route in place (White to Colour on the same sheet): no new step for the back button
  swap: hash => { history.replaceState(history.state, '', '#' + hash); render(); },
  conn: () => data.connState(),
  // whether a route is built here (Goodnight hands off to #nightstand only when it is)
  has: name => !!SCREENS[name],
  ui: { dragging: false },
};

// ---------- the redraw ----------
// A screen is drawn whole from the state. What must survive a redraw is kept by hand: the page's scroll, and the
// sideways scroll of each strip. While a finger is on a control nothing is redrawn at all, so the control is never
// pulled out from under it; the redraw it missed happens when the finger lifts.
let pending = false;
// How the next redraw arrives: 'push', 'back' or 'load' when the page has changed (motion.js), else nothing and
// each element's own transitions carry it from the last redraw.
let arriving = null, wasScreen = false, shownTab = null;
// Where each step of the history was scrolled when it was left, by its number: Back returns to a list where it was
// left (the tenth routine, the foot of Settings) rather than at its top. A page opened forward starts at the top.
const scrolledAt = {};
let restoreY = null;
function render() {
  if (ctx.ui.dragging) { pending = true; return; }
  if (stepping && performance.now() - stepping < 600) { skipped = true; return; }
  stepping = 0;
  // drawn now, a redraw already booked for the next frame would draw the same again (a tap that switches lights books
  // one and its screen draws at once too); a second draw restarts whatever the first one started
  if (frame) { (frameLater ? clearTimeout : cancelAnimationFrame)(frame); frame = 0; }
  pending = false;
  const app = $('#app'), scr = $('#screen'), tabs = $('#tabs');
  native.credentials(S.token);
  if (!S.token) { wasScreen = false; app.className = onboard.onboarded() ? 'plain' : 'plain onboarding'; tabs.hidden = true; onboard.draw(scr); return; }
  if (!S.ready || !S.config) { wasScreen = false; app.className = 'plain'; tabs.hidden = true; scr.innerHTML = onboard.loadingHTML(); return; }
  // the Android app's widget shows the house as Home says it
  native.house(H.litLights().length, Math.round(H.houseLevel()));
  // and its ten widgets the home as this page sees it, a moment after the redraws stop (only in the Android app)
  widgetData.soon(ctx);
  const r = route();
  // the page the app opened on, known once the home has loaded (hashchange compares against it)
  if (lastPage === null) lastPage = pageOf(r);
  // a redraw while a page is still opening out of what was tapped (or closing back into it) waits for it to land,
  // so nothing is drawn out from under it
  if (!arriving && wasScreen && opening.flying()) { opening.whenLanded(render); return; }
  const screen = screenFor(r);
  const keep = {};
  scr.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.keep] = el.scrollLeft; });
  // the app opening on a screen is a load, like a tab
  const how = arriving || (wasScreen ? null : 'load');
  arriving = null; wasScreen = true;
  const snap = how ? null : motion.snap(scr);
  applyNight();
  scr.innerHTML = screen.view(ctx, r);
  scr.querySelectorAll('[data-keep]').forEach(el => { if (keep[el.dataset.keep] != null) el.scrollLeft = keep[el.dataset.keep]; });
  const st = data.connState();
  // a pushed detail page (a light, a fan, a shade) has no tab bar in the file; everything else does
  app.className = [st === 'off' ? 'offline' : '', screen.noTabs ? 'notabs' : ''].filter(Boolean).join(' ');
  tabs.hidden = !!screen.noTabs;
  // A tab's own page lights its tab. A page opened from it keeps the tab it was opened from (Activity from Settings
  // is still under Settings, a room opened from Home still under Home), as each tab is its own stack and Back
  // returns there; a page the app opened on, with nothing under it, falls back to the tab it belongs to.
  const tab = shownTab = (depthOf(r) > 0 && history.state && history.state.tab) || TAB_OF[r.name] || 'home';
  tabs.innerHTML = TABS.map(([t, ic, label]) => `<button data-go="${t}" aria-label="${label}" ${t === tab ? 'aria-current="page"' : ''}>${icon(ic, 24, 1.7)}</button>`).join('');
  if (screen.after) screen.after(ctx, r, scr);
  // a page comes back where it was scrolled when something on it opened the page being left
  const y = opening.takeScroll();
  if (y != null) window.scrollTo(0, y);
  else if (restoreY != null) window.scrollTo(0, restoreY);
  restoreY = null;
  // the header follows the scroll the page now has, before anything measures it or moves (header.js): a redraw
  // mid-scroll keeps it where it was, and a page put back where it was scrolled has it collapsed from the start
  header.sync();
  if (opening.plays(how)) opening.arrive(how, scr);
  else if (how === 'swipe-back') swipeBack.arrive(scr);
  else if (how) motion.arrive(how, scr); else motion.carry(snap, scr);
  motion.settle(scr);
  routedSheet(screen, r);
  // an icon shortcut landing (Goodnight's hold in view), and the one question about the lock screen
  beyond.after(ctx);
}
// ---------- night ----------
// design-v7-ui.md, "A lighting system · 7": from the evening wind-down's start (10 pm without one) until the wake-up
// light starts (6 am without one) the app's own chrome warms and dims (web/ui/v7/night.css); the lamps' colours never
// change. Settings' Night look can make it always or never. `ctx.night` lets a screen hand `night` to glowHTML.
// A test forces it with ?night=1 or 0, or localStorage v7night.
function nightNow() {
  const s = S.config.settings;
  let force = null;
  try { force = new URLSearchParams(location.search).get('night') ?? localStorage.getItem('v7night'); } catch (_) { /* fine */ }
  if (force === '1' || force === '0') return force === '1';
  const look = s.night_look || 'auto';
  if (look !== 'auto') return look === 'always';
  const m = RT.hmMin(RT.nowHm());
  const start = RT.hmMin(RT.windDownOn() ? RT.curveStart() : '22:00');
  // the wake-up light of the morning ahead, if one runs that day
  const day = RT.weekdayOf(m >= 720 ? RT.addDays(RT.today(), 1) : RT.today());
  const wakes = (S.config.schedules || []).filter(x => x.kind === 'wakeup' && x.enabled !== false && x.at && x.at.type === 'time' && (x.days || RT.ALL_DAYS).includes(day)).map(x => RT.hmMin(x.at.time)).filter(t => t < 720);
  const end = wakes.length ? Math.min(...wakes) : 360;
  return start > end ? m >= start || m < end : m >= start && m < end;
}
function applyNight() {
  const root = document.documentElement, first = ctx.night === undefined;
  ctx.night = nightNow();
  root.classList.toggle('night', ctx.night);
  document.body.classList.toggle('nightlook', ctx.night);
  // opening the app at night is not a crossing: the 30 s drift is armed only after the first look is drawn
  if (first) setTimeout(() => root.classList.add('drift'), 120);
}

// A sheet that is a page's sub route (#light/<id>/white): drawn over the page, redrawn with it, and dismissing it
// puts the address back to the page without adding a step to the back button.
// A screen can instead decide its own sheet from the route (screen.sheetFor), for a sheet that is not a sub page:
// #scenes/<id> is the scene list with that scene's editor over it.
//
// A picker (which room, which light to add) opens inside whatever sheet is up, with a back arrow to it: it is
// state, not an address, and closing either returns to the page.
function sheetOf(screen, r) {
  if (screen.sheetFor) return screen.sheetFor(ctx, r);
  const make = r.sub && screen.sheets && screen.sheets[r.sub];
  return make ? { spec: make(ctx, r), parent: `${r.name}/${r.id}` } : null;
}
function routedSheet(screen, r) {
  const got = sheetOf(screen, r);
  ctx.ui.routed = !!(got && got.spec);
  if (!got || !got.spec) { ctx.ui.picker = null; return; }
  const key = location.hash.replace(/^#/, '');
  const close = () => {
    ctx.ui.picker = null;
    if (history.state && history.state.sheet && place() > 0) { stepHistory(-1); return; }
    history.replaceState(history.state, '', '#' + got.parent); render();
  };
  const pk = ctx.ui.picker && ctx.ui.picker.key === key ? ctx.ui.picker : null;
  const spec = pk ? { ...pk.spec(ctx, r), back: true } : got.spec;
  const root = openSheet({ ...spec, key: pk ? `${key}#${pk.name}` : key, onClose: close });
  if (spec.after) spec.after(ctx, r, root);
  // a scene's editor held open from its chip grows out of the chip (M12)
  chipOpen.opened(root, key);
}
// Open a picker inside the current sheet. `spec(ctx, r)` draws it; its taps are the screen's actions as usual.
function openPicker(name, spec) { ctx.ui.picker = { key: location.hash.replace(/^#/, ''), name, spec }; render(); }
function closePicker() { ctx.ui.picker = null; render(); }
let frame = 0, frameLater = false;
// A redraw asked for by the socket waits while a page is still arriving; a tap redraws at once.
function soon() {
  if (frame) return;
  const wait = motion.busyFor();
  frameLater = !!wait;
  frame = wait ? setTimeout(() => { frame = 0; render(); }, wait) : requestAnimationFrame(() => { frame = 0; render(); });
}
ctx.soon = soon;
ctx.endDrag = () => { ctx.ui.dragging = false; if (pending) render(); };

// ---------- signing in and loading ----------
// 16 · Onboarding (v7, 12814:49907) and the password: the pages over the drawn house are onboard.js, which draws
// them in place so the house's windows are never lit twice.
async function signIn(pw) {
  const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(res.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : "That's not it. Try again.");
  localStorage.setItem('token', body.token);
  S.token = body.token;
  ctx.ui.justSignedIn = true;
  connect();
  render();
}

// ---------- the socket ----------
// The layer applies each message to the state and says whether anything on screen changed; this redraws when it
// did. The quiet window before the app admits it is offline is the layer's; this books the one redraw that shows it.
let graceTimer = null;
function onConn(conn) {
  if (conn === 'started') { clearTimeout(graceTimer); graceTimer = setTimeout(render, RECONNECT_GRACE + 50); }
  // back from a real outage (not a blip inside the grace), said once
  if (conn === 'cleared') { clearTimeout(graceTimer); ctx.ui.hadBlip = true; if ($('#app').classList.contains('offline')) toast('Back in touch'); }
}
function connect() {
  data.connectWS({
    message: (m, r) => {
      if (m.type === 'snapshot') {
        // once, quietly, as the old app does: bring the five's old slow fades forward
        if (H.shortenSuggestedFades()) save('', { quiet: true });
      }
      if (m.type === 'toast') toast(m.msg, { err: m.level === 'error' });
      if (m.type === 'button' || m.type === 'gesture') onLive(m);
      if (m.type === 'add_state' || m.type === 'add_heard' || m.type === 'add_log') onAdd(m);
      if (r.conn) onConn(r.conn);
      // 20 · Beyond the app: a shortcut runs once the home is loaded; the lock screen hears about every timer
      if (m.type === 'snapshot' || m.type === 'timers') beyond.onTimers(ctx);
      if (m.type === 'snapshot') { beyond.onReady(ctx); if (ctx.ui.justSignedIn) { ctx.ui.justSignedIn = false; toast(onboard.foundLine(ctx)); } }
      if (r.changed || m.type === 'snapshot') soon();
    },
    close: conn => { onConn(conn); if (S.ready) soon(); },
  });
}
data.hooks.signedOut = () => { beyond.signedOut(); render(); };

// ---------- taps ----------
document.addEventListener('click', e => {
  // the tap that ends a press and hold is not a tap as well
  if (Date.now() - heldAt < 700) { e.preventDefault(); return; }
  // while a page is opening out of what was tapped (or closing back into it), or a scene's chip into its editor, a
  // second tap does nothing
  if (opening.busy() || chipOpen.busy()) { e.preventDefault(); return; }
  // the innermost target wins: a tile navigates, the power circle inside it toggles
  const el = e.target.closest('[data-act], [data-go]'); if (!el) return;
  chipOpen.tap(el);
  // a link to a tab's own page (Settings' Rooms row, the Nightstand's Home) is that tab's button: tabs never stack
  if (!el.dataset.act) { e.preventDefault(); closeSheet(); if (el.closest('#tabs') || TABS.some(t => t[0] === el.dataset.go)) goTab(el.dataset.go); else { opening.tap(el); go(el.dataset.go); } return; }
  const act = el.dataset.act;
  if (act === 'sheet-close') { dismissSheet(); return; }
  if (act === 'picker-back') { closePicker(); return; }
  if (act === 'toast-undo') { const root = $('#toast-root'); const u = root._undo; root.innerHTML = ''; root._undo = null; if (u) u(); return; }
  if (act === 'back') { stepBack(); return; }
  if (onboard.act(act)) { render(); return; }
  const r = route();
  const screen = screenFor(r);
  const fn = (screen.actions && screen.actions[act]) || SHARED[act];
  if (fn) fn(ctx, el, r);
});
// A name field in a sheet (a room's, a scene's) saves as it is typed; Done or Enter closes it.
document.addEventListener('input', e => {
  // a field that answers as it is typed (the city search): data-input names the screen's action
  const inp = e.target.closest && e.target.closest('[data-input]');
  if (inp) { const r = route(); const screen = screenFor(r); const fn = screen.actions && screen.actions[inp.dataset.input]; if (fn) fn(ctx, inp, r, inp.value); return; }
  const form = e.target.closest && e.target.closest('form[data-form="name"]'); if (!form) return;
  const r = route(); const screen = screenFor(r);
  const fn = screen.actions && screen.actions[form.dataset.act];
  if (fn) fn(ctx, form, r, e.target.value);
});
// A select, a time field or a checkbox that changes something: data-change names the screen's action, which gets the
// element and its value.
document.addEventListener('change', e => {
  const el = e.target.closest && e.target.closest('[data-change]'); if (!el) return;
  const r = route(); const screen = screenFor(r);
  const fn = screen.actions && screen.actions[el.dataset.change];
  if (fn) fn(ctx, el, r, el.type === 'checkbox' ? el.checked : el.value);
});
document.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'name') return;
  e.preventDefault();
  closePicker();
}, true);
document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'login') return;
  e.preventDefault();
  const err = $('#login-err');
  try { err.hidden = true; await signIn($('#pw').value); }
  catch (x) { err.textContent = x.message; err.hidden = false; onboard.wrong($('#screen')); }
});
// A new address closes whatever sheet was up; one that only swaps the sheet over the same page (White to Colour)
// keeps the page's scroll.
let lastPage = null, lastName = route().name;
// How deep each page sits: a tab is 0, what a tab opens is 1, a page opened from those is 2. Deeper is a push,
// shallower is back, and one tab to another is a load with its stagger (M4).
const DEPTH = { home: 0, rooms: 0, remotes: 0, routines: 0, room: 1, scenes: 1, remote: 1, routine: 1, setup: 1, activity: 1, settings: 0, nightstand: 1, light: 2, timing: 2, add: 2 };
// The evening wind-down is a page of its own under the Routines tab (#routines/winddown, its sheets
// #routines/winddown-*), so it sits one deeper than the tab even though it shares the tab's route name.
// A widget's own page sits under the list of them (#widgets, then #widgets/<id>).
const depthOf = r => (r.name === 'routines' && /^winddown/.test(r.id || '') ? 1 : r.name === 'widgets' && r.id ? 2 : DEPTH[r.name] ?? 1);
let lastDepth = depthOf(route());
// The page an address shows, under any sheet on it. #settings/name is Settings with the Name sheet up, and
// #routines/winddown-curve is a sheet over a sheet over the wind-down page: opening one is not a new page, so the
// page under it neither scrolls to the top nor slides.
function pageOf(r) {
  for (let i = 0; i < 4 && S.ready && S.config; i++) {
    let got = null;
    try { got = sheetOf(screenFor(r), r); } catch (_) { break; }
    if (!got || !got.spec || !got.parent) break;
    const [n, id, ...rest] = got.parent.split('/');
    r = { name: ALIAS[n] ?? n, id: id || null, sub: rest.join('/') || null };
  }
  return `${r.name}/${r.id}`;
}
// Stepping back to the bottom entry fires hashchange only when its address differs; when it does not, popstate is
// all there is, and the tab switch finishes from here.
window.addEventListener('popstate', () => {
  // the step has landed; a redraw it held back is drawn now unless the address changed, whose hashchange draws it
  if (stepping) { stepping = 0; setTimeout(() => { if (skipped) { skipped = false; render(); } }, 0); }
  if (pendingTab && place() === 0) setTimeout(() => { if (pendingTab) { const t = pendingTab; pendingTab = null; if (!landTab(t)) render(); } }, 0);
});
window.addEventListener('hashchange', e => {
  stepping = 0; skipped = false;
  let leftN = 0; try { leftN = Number(sessionStorage.getItem('navN')) || 0; } catch (_) { /* fine */ }
  if (lastPage) scrolledAt[leftN] = { page: lastPage, y: window.scrollY };
  closeSheet();
  // an entry this app has not numbered yet is a new step: one above the page it was opened from, and a sheet if it
  // is a sheet over that same page
  if ((!history.state || typeof history.state.n !== 'number') && replacing != null) history.replaceState({ n: replacing }, '', location.href);
  replacing = null;
  if ((!history.state || typeof history.state.n !== 'number') && navType === 'traverse') history.replaceState({ n: stepTo != null ? Math.max(0, stepTo) : Math.max(0, leftN - 1) }, '', location.href);
  navType = null; stepTo = null;
  if (!history.state || typeof history.state.n !== 'number') {
    let from = 0; try { from = (JSON.parse(sessionStorage.getItem('navN') || '0')) || 0; } catch (_) { /* fine */ }
    const oldPage = pageOf(parseRoute(new URL(e.oldURL).hash));
    const r0 = route();
    history.replaceState({ n: from + 1, sheet: pageOf(r0) === oldPage && `${r0.name}/${r0.id}${r0.sub ? '/' + r0.sub : ''}` !== oldPage, tab: shownTab }, '', location.href);
  }
  try { sessionStorage.setItem('navN', String(place())); } catch (_) { /* fine */ }
  // a tab switch that stepped back to the bottom entry now goes to its tab
  if (pendingTab && place() === 0) { const t = pendingTab; pendingTab = null; if (landTab(t)) return; }
  const r = route(); const page = pageOf(r);
  // a page that holds something open while it is shown (the bridge listening) lets go of it when it is left
  if (r.name !== lastName && SCREENS[lastName] && SCREENS[lastName].leave) SCREENS[lastName].leave(ctx);
  if (page !== lastPage && S.ready && S.config) {
    const was = lastDepth, now = depthOf(r);
    // one tab to another slides the way the tab bar reads: a tab to the right comes in from the right
    const order = TABS.map(t => t[0]);
    arriving = !was && !now ? (order.indexOf(r.name) < order.indexOf(lastName) ? 'back' : 'push') : now < was ? 'back' : 'push';
    // a room card opens into its room (M10), a tile into its light (M11), a remote's card into its page (M14), and
    // leaving the page for the one it opened from closes it back into what was tapped; a back swipe let go (M13)
    // hands its page over from where the finger left it, to that close or to its own slide off
    const screen = $('#screen'), pose = swipeBack.letGo();
    const shared = opening.prepare({ from: lastPage, to: page, r, depth: now, screen, pose }) || swipeBack.prepare(screen, pose);
    if (shared) arriving = shared; else motion.capture(screen);
  }
  lastName = r.name; lastDepth = depthOf(r);
  if (page !== lastPage) {
    const was = scrolledAt[place()];
    restoreY = place() < leftN && was && was.page === page ? was.y : null;
    window.scrollTo(0, 0);
  }
  lastPage = page;
  render();
});

// Taps that mean the same on every screen.
const SHARED = {
  // Allow and Not now on the lock screen question, over whichever page it was asked on
  ...beyond.actions,
  // a light's power circle: on to off, off to on, shown at once and confirmed by the bridge
  toggle(c, el) {
    const id = el.dataset.id; const d = data.dev(id); if (!d) return;
    if (d.domain === 'fan') { const on = data.isOn(id); run({ type: 'fan', target: `d:${id}`, speed: on ? 'Off' : 'Medium' }); return; }
    turn({ type: 'level', target: `d:${id}`, level: data.isOn(id) ? 'off' : 'on' });
  },
  // the pin on a light's or a room's page (and a scene's sheet): pinned to Home or not, saved to the hub at once so
  // it is the same on every phone. The pin filling in is the answer; nothing else says so.
  pin(c, el) {
    const key = el.dataset.key; if (!key) return;
    H.togglePin(key);
    render();
    save('', { quiet: true });
  },
  // a scene chip: Lutron scenes and the app's own run the same way
  scene(c, el) {
    const t = el.dataset.t;
    if (data.connState() === 'off') { toast(OFFLINE_TAP, { icon: 'wifi' }); return; }
    if (t.startsWith('p:')) {
      const p = data.presets().find(x => x.id === t.slice(2)); if (!p) return;
      turn({ type: 'preset', preset_id: p.id });
    } else if (t.startsWith('s:')) run({ type: 'scene', scene_id: t.slice(2) });
  },
};

// ---------- press and hold ----------
let heldAt = 0;
// An element with data-hold runs its screen's hold action after that many milliseconds held, and the press is
// forgotten if the finger lifts, slides more than a few pixels, or leaves the element first. The ring on it closes
// over the same time (CSS, data-holding). Nothing is redrawn while a press is held, so a state update arriving
// meanwhile cannot pull the element out from under the finger; the redraw it missed happens when the press ends.
let hold = null;
function endHold(fire) {
  const h = hold; if (!h) return;
  hold = null;
  clearTimeout(h.timer);
  // a scene's chip held to the end opens into its editor from where it is, copper and all (M12)
  if (fire) chipOpen.held(h.el);
  h.el.dataset.holding = '0';
  ctx.endDrag();
  if (fire) {
    heldAt = Date.now();
    if (navigator.vibrate) navigator.vibrate(30);
    const r = route(); const screen = screenFor(r);
    const fn = screen.actions && screen.actions[h.el.dataset.hold];
    if (fn) fn(ctx, h.el, r);
  }
}
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-hold]'); if (!el) return;
  // a press on something inside it that is its own button (a chevron) is that button's
  const inner = e.target.closest('[data-act], [data-go]');
  if (inner && inner !== el && el.contains(inner)) return;
  endHold(false);
  el.dataset.holding = '1';
  ctx.ui.dragging = true;
  hold = { el, x: e.clientX, y: e.clientY, timer: setTimeout(() => endHold(true), Number(el.dataset.ms) || 1000) };
});
document.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) endHold(false); }, true);
for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => endHold(false), true);
document.addEventListener('pointerleave', e => { if (hold && e.target === hold.el) endHold(false); }, true);

// ---------- a real remote pressed ----------
// The data layer has written the press down (S.live). A remote the bridge lists without its buttons learns its own
// numbering from the keys; then the screen on show decides what a press means to it (the Remotes list jumps to the
// remote, a remote's page picks the key, Press timing says what it heard). Anything showing a key lit redraws, and
// once more when the light goes out.
let liveTimer = null;
function onLive(m) {
  if (REM.rememberPress(m.device_id, m.button_number)) save('', { quiet: true });
  const r = route(); const screen = screenFor(r);
  if (screen.live) screen.live(ctx, m, r);
  soon();
  clearTimeout(liveTimer); liveTimer = setTimeout(soon, 1300);
}
ctx.live = onLive;

// Adding a device: what the bridge says while it listens, kept where the Add page reads it.
function onAdd(m) {
  S.add = S.add || { active: false, heard: [], log: [] };
  if (m.type === 'add_state') { S.add = { ...S.add, ...(m.state || {}) }; if (m.reason === 'timeout' && route().name === 'add') toast('The bridge stopped listening. Tap Listen when the device is ready.'); }
  if (m.type === 'add_heard') { S.add.heard = m.heard || S.add.heard; if (navigator.vibrate) navigator.vibrate(20); }
  if (m.type === 'add_log') S.add.log = [...(S.add.log || []), m.entry].slice(-60);
  soon();
}

// ---------- start ----------
// The Home greeting and the whole house rely on the home's own time zone; nothing else needs doing before the first
// draw. With a token, dial straight away; without one, the sign-in is the first thing drawn.
if (S.token) connect();
// The app places the scroll itself (a new page starts at the top, Rooms comes back where it was). Left to the
// browser, Back would first jump the page it is leaving to the scroll of the entry it is going to, so the page
// that closes (a room into its card) would not close from where it was on screen.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
// the entry the app opened on is the bottom of its history
if (!history.state || typeof history.state.n !== 'number') stamp({ n: 0 });
try { sessionStorage.setItem('navN', String(place())); } catch (_) { /* fine */ }
render();
// the header that stays at the top as a page scrolls (M15)
header.wire();
// Android's back swipe, followed by the page (M13): what it needs of the app
swipeBack.wire({
  ctx, route, parseRoute, pageOf, depthOf, place, stepBack,
  draw: r => screenFor(r).view(ctx, r), hasTabs: r => !screenFor(r).noTabs, dismissSheet: o => dismissSheet(o),
  // where the page under this one was left scrolled, so the page waiting behind a swipe is drawn where Back puts it
  scrollOf: prev => { const was = scrolledAt[place() - 1]; return prev && was && was.page === prev.page ? was.y : 0; },
});
// a slow minute tick keeps anything that says a time (the greeting, "since 9:41 pm") honest
setInterval(() => { if (!ctx.ui.dragging && !document.hidden) soon(); }, 60000);

// the offline shell (web/sw.js), the same worker the classic app registers
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

// for the browser tests and for poking at from the console
window.__copper = ctx;
