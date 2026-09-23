// Copper Night: the app. One module that owns the data layer instance, the route, the redraw, the toast and the
// socket; each screen is a module in web/ui/screens/ that turns the state into HTML and says what its taps do.
//
// Nothing here decides anything about the home: that is web/data/. This file only asks it and draws the answer.
// It is served at /ui/ beside the old app until cutover (docs/design-spec-v6.md, the handoff's phase 5).
import '/js/kinds.js';
import '/js/cities.js';
import { create, CasetaHome, CasetaDaylight, CasetaEdit, CasetaRemotes, CasetaRoutines, RECONNECT_GRACE, esc } from '/data/index.js';
import { icon } from '/ui/icons.js';
import { deviceArt, roomArt, artSrc, kindArt } from '/ui/art.js';
import { lampTint } from '/ui/tint.js';
import * as motion from '/ui/motion.js';
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
  // a scene arriving crossfades every light it touches over the scene's 1.0 s, not one light's 0.4 s
  if (action && (action.type === 'preset' || action.type === 'scene')) motion.sceneArriving();
  try { await data.run(action); return true; }
  catch (e) { toast(e.message, { err: true }); return false; }
}
// A finger on a slider: one command in flight per light, the newest value next (the layer's gate).
const gate = data.gate(run);
// Every change applies at once and offers Undo; there is no save button anywhere.
async function save(msg, opts = {}) {
  try {
    const { prev } = await data.saveConfig();
    if (!opts.quiet) toast(msg || 'Saved', { undo: prev ? async () => { data.restoreConfig(prev); await save('Undone'); } : null });
  } catch (e) {
    toast(`Couldn't save. ${e.message}`, { err: true });
  }
  render();
}
// Many small edits in a row (a slider in a scene, typing a name) save once, quietly, after they stop.
let saveTimer = null;
function saveSoon(ms = 700) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save('', { quiet: true }), ms); }
// Show a light's new level before the bridge confirms it, so a tap feels like it landed.
// A slider held by a finger also holds that level against the bridge's echoes of the values it passed through.
function assume(ids, level, { held = false } = {}) { for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level }; if (held) data.hold(ids); }

// ---------- the toast ----------
let toastTimer = null;
function toast(msg, opts = {}) {
  const root = $('#toast-root');
  const undo = opts.undo ? `<button class="act" data-act="toast-undo">Undo</button>` : '';
  root.innerHTML = `<div class="toast ${opts.err ? 'err' : ''}" role="status">${icon(opts.err ? 'x' : 'check', 20, 1.8)}<span class="msg">${esc(msg)}</span>${undo}</div>`;
  root._undo = opts.undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root._undo = null; const t = root.firstElementChild; if (t) motion.leave(t); }, 5000);
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
function closeSheet({ dropped = false } = {}) { const root = $('#sheet-root'); if (!dropped) motion.sheetOut(root); root.innerHTML = ''; root.hidden = true; root.dataset.key = ''; root._onClose = null; }
function dismissSheet(o) { const root = $('#sheet-root'); const f = root._onClose; closeSheet(o); if (f) f(); }
// Swiping a sheet down puts it away, as the close button does (sheetdrag.js).
wireSheetDrag($('#sheet-root'), () => dismissSheet({ dropped: true }));

// ---------- the route ----------
// #home, #rooms, #room/<id>, #light/<id>, #remotes, #remote/<id>, #routines, #settings, #activity, #scenes. The old
// app's #automations still lands on Routines, so an installed shortcut keeps working.
const ALIAS = { automations: 'routines', '': 'home' };
function route() {
  const raw = location.hash.replace(/^#/, '');
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
  settings: settingsScreen, add: addScreen,
};
const TAB_OF = { home: 'home', rooms: 'rooms', room: 'rooms', light: 'rooms', scenes: 'rooms', remotes: 'remotes', remote: 'remotes', timing: 'remotes', routines: 'routines', routine: 'routines', setup: 'routines', settings: 'home', add: 'home', activity: 'home' };
const TABS = [['home', 'home', 'Home'], ['rooms', 'grid', 'Rooms'], ['remotes', 'remote', 'Remotes'], ['routines', 'clock', 'Routines']];
// A screen draws the pages under it that it declares (screen.subs); any other sub page is not built yet.
function screenFor(r) {
  const screen = SCREENS[r.name];
  if (!screen) return soonScreen;
  if (r.sub && !screen.sheetFor && !(screen.subs || []).includes(r.sub) && !(screen.sheets && screen.sheets[r.sub])) return soonScreen;
  return screen;
}
function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }

// ---------- what every screen is handed ----------
const ctx = {
  data, H, DAY, EDIT, REM, RT, S, esc, icon, deviceArt, roomArt, artSrc, kindArt, lampTint,
  openPicker: (n, spec) => openPicker(n, spec), closePicker: () => closePicker(),
  run, gate, save, saveSoon, assume, toast, go, openSheet, closeSheet, render: () => render(),
  // swap the page's sub route in place (White to Colour on the same sheet): no new step for the back button
  swap: hash => { history.replaceState(null, '', '#' + hash); render(); },
  conn: () => data.connState(),
  ui: { dragging: false },
};

// ---------- the redraw ----------
// A screen is drawn whole from the state. What must survive a redraw is kept by hand: the page's scroll, and the
// sideways scroll of each strip. While a finger is on a control nothing is redrawn at all, so the control is never
// pulled out from under it; the redraw it missed happens when the finger lifts.
let pending = false;
// How the next redraw arrives: 'push', 'back' or 'load' when the page has changed (motion.js), else nothing and
// each element's own transitions carry it from the last redraw.
let arriving = null, wasScreen = false;
function render() {
  if (ctx.ui.dragging) { pending = true; return; }
  pending = false;
  const app = $('#app'), scr = $('#screen'), tabs = $('#tabs');
  if (!S.token) { wasScreen = false; app.className = onboarded() ? 'plain' : 'plain onboarding'; tabs.hidden = true; scr.innerHTML = loginHTML(); return; }
  if (!S.ready || !S.config) { wasScreen = false; app.className = 'plain'; tabs.hidden = true; scr.innerHTML = loadingHTML(); return; }
  const r = route();
  const screen = screenFor(r);
  const keep = {};
  scr.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.keep] = el.scrollLeft; });
  // the app opening on a screen is a load, like a tab
  const how = arriving || (wasScreen ? null : 'load');
  arriving = null; wasScreen = true;
  const snap = how ? null : motion.snap(scr);
  scr.innerHTML = screen.view(ctx, r);
  scr.querySelectorAll('[data-keep]').forEach(el => { if (keep[el.dataset.keep] != null) el.scrollLeft = keep[el.dataset.keep]; });
  const st = data.connState();
  // a pushed detail page (a light, a fan, a shade) has no tab bar in the file; everything else does
  app.className = [st === 'off' ? 'offline' : '', screen.noTabs ? 'notabs' : ''].filter(Boolean).join(' ');
  // the night look: the app dims and warms like a room lit by lamps, in the night hours or always, as Settings says
  const look = S.config.settings.night_look || 'auto';
  const hm = RT.nowHm(), ns = S.config.settings.night_start, ne = S.config.settings.night_end;
  const night = ns < ne ? hm >= ns && hm < ne : hm >= ns || hm < ne;
  document.body.classList.toggle('nightlook', look === 'always' || (look === 'auto' && night));
  tabs.hidden = !!screen.noTabs;
  const tab = TAB_OF[r.name] || 'home';
  tabs.innerHTML = TABS.map(([t, ic, label]) => `<button data-go="${t}" aria-label="${label}" ${t === tab ? 'aria-current="page"' : ''}>${icon(ic, 24, 1.7)}</button>`).join('');
  if (screen.after) screen.after(ctx, r, scr);
  if (how) motion.arrive(how, scr); else motion.carry(snap, scr);
  motion.settle(scr);
  routedSheet(screen, r);
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
  const close = () => { ctx.ui.picker = null; history.replaceState(null, '', '#' + got.parent); render(); };
  const pk = ctx.ui.picker && ctx.ui.picker.key === key ? ctx.ui.picker : null;
  const spec = pk ? { ...pk.spec(ctx, r), back: true } : got.spec;
  const root = openSheet({ ...spec, key: pk ? `${key}#${pk.name}` : key, onClose: close });
  if (spec.after) spec.after(ctx, r, root);
}
// Open a picker inside the current sheet. `spec(ctx, r)` draws it; its taps are the screen's actions as usual.
function openPicker(name, spec) { ctx.ui.picker = { key: location.hash.replace(/^#/, ''), name, spec }; render(); }
function closePicker() { ctx.ui.picker = null; render(); }
let frame = 0;
// A redraw asked for by the socket waits while a page is still arriving; a tap redraws at once.
function soon() {
  if (frame) return;
  const wait = motion.busyFor();
  frame = wait ? setTimeout(() => { frame = 0; render(); }, wait) : requestAnimationFrame(() => { frame = 0; render(); });
}
ctx.soon = soon;
ctx.endDrag = () => { ctx.ui.dragging = false; if (pending) render(); };

// ---------- signing in and loading ----------
// 01 · Onboarding (12732:20): three pages before the password, the first as the file draws it. A phone that has
// seen them goes straight to the password next time.
const ONBOARD = [
  { a: 'Control', b: 'every light', pill: 'room', say: 'Caséta, Hue and Nanoleaf together. Nothing to save: everything is undoable.' },
  { a: 'Every', b: 'button, your way', pill: 'pico', say: 'Press, press twice, hold: each can do something different, and something else at night.' },
  { a: 'The house', b: 'on its own', pill: 'moon', say: 'Lights on before you get home, a slow light to wake to, a calmer evening. A minute each to set up.' },
];
let onboardPage = 0;
const onboarded = () => { try { return localStorage.getItem('onboarded') === '1'; } catch (_) { return true; } };
function onboardHTML() {
  const p = ONBOARD[onboardPage];
  const pill = p.pill === 'room' ? '<span class="ob-room"><i class="slats"></i><i class="glow"></i><i class="floor"></i><i class="sofa"></i><i class="seat"></i><i class="cush"></i><i class="chair"></i></span>'
    : p.pill === 'pico' ? `<span class="ob-ic">${icon('remote', 24, 1.6)}</span>` : `<span class="ob-ic">${icon('moon', 24, 1.6)}</span>`;
  return `<div class="onboard p${onboardPage}">
    <span class="ob-logo"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.5L10.65 7.35L16.5 9L10.65 10.65L9 16.5L7.35 10.65L1.5 9L7.35 7.35L9 1.5Z" fill="#D98A4E"/></svg>Caseta</span>
    <span class="ob-dots">${ONBOARD.map((_, i) => `<i class="${i === onboardPage ? 'on' : ''}"></i>`).join('')}</span>
    <h1 class="ob-h"><span>${p.a}</span>${pill}<span>${p.b}</span></h1>
    <p class="ob-say">${p.say}</p>
    <button class="ob-back" data-act="ob-back" aria-label="Back" ${onboardPage ? '' : 'disabled'}>${icon('back', 22, 1.7)}</button>
    <button class="ob-go" data-act="ob-next">${onboardPage < ONBOARD.length - 1 ? 'Next' : 'Get started'}${icon('arrow', 22, 1.8)}</button>
  </div>`;
}
function loginHTML() {
  if (!onboarded()) return onboardHTML();
  return `<div class="login">
    <h1 class="t-h1">Welcome</h1>
    <p class="t-body muted">Enter your home's password to get started.</p>
    <form data-form="login" class="login-form">
      <input class="field" type="password" id="pw" autocomplete="current-password" placeholder="Password" aria-label="Password">
      <button class="pill solid" type="submit">Continue</button>
      <p class="t-cap login-err" id="login-err" hidden></p>
    </form>
    <button class="link blue ob-again" data-act="ob-again">What this app does</button></div>`;
}
function loadingHTML() { return `<div class="login"><h1 class="t-h1">Getting your home ready</h1><p class="t-body muted">One moment.</p></div>`; }
async function signIn(pw) {
  const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(res.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : "That isn't the password.");
  localStorage.setItem('token', body.token);
  S.token = body.token;
  connect();
  render();
}

// ---------- the socket ----------
// The layer applies each message to the state and says whether anything on screen changed; this redraws when it
// did. The quiet window before the app admits it is offline is the layer's; this books the one redraw that shows it.
let graceTimer = null;
function onConn(conn) {
  if (conn === 'started') { clearTimeout(graceTimer); graceTimer = setTimeout(render, RECONNECT_GRACE + 50); }
  if (conn === 'cleared') { clearTimeout(graceTimer); ctx.ui.hadBlip = true; }
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
      if (r.changed || m.type === 'snapshot') soon();
    },
    close: conn => { onConn(conn); if (S.ready) soon(); },
  });
}
data.hooks.signedOut = () => render();

// ---------- taps ----------
document.addEventListener('click', e => {
  // the tap that ends a press and hold is not a tap as well
  if (Date.now() - heldAt < 700) { e.preventDefault(); return; }
  // the innermost target wins: a tile navigates, the power circle inside it toggles
  const el = e.target.closest('[data-act], [data-go]'); if (!el) return;
  if (!el.dataset.act) { e.preventDefault(); closeSheet(); go(el.dataset.go); return; }
  const act = el.dataset.act;
  if (act === 'sheet-close') { dismissSheet(); return; }
  if (act === 'picker-back') { closePicker(); return; }
  if (act === 'toast-undo') { const root = $('#toast-root'); const u = root._undo; root.innerHTML = ''; root._undo = null; if (u) u(); return; }
  if (act === 'back') { if (history.length > 1) history.back(); else go('home'); return; }
  if (act === 'ob-next') { if (onboardPage < ONBOARD.length - 1) onboardPage += 1; else { try { localStorage.setItem('onboarded', '1'); } catch (_) { /* fine */ } } render(); return; }
  if (act === 'ob-back') { if (onboardPage > 0) onboardPage -= 1; render(); return; }
  if (act === 'ob-again') { try { localStorage.removeItem('onboarded'); } catch (_) { /* fine */ } onboardPage = 0; render(); return; }
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
  catch (x) { err.textContent = x.message; err.hidden = false; }
});
// A new address closes whatever sheet was up; one that only swaps the sheet over the same page (White to Colour)
// keeps the page's scroll.
let lastPage = '', lastName = route().name;
// How deep each page sits: a tab is 0, what a tab opens is 1, a page opened from those is 2. Deeper is a push,
// shallower is back, and one tab to another is a load with its stagger (M4).
const DEPTH = { home: 0, rooms: 0, remotes: 0, routines: 0, room: 1, scenes: 1, remote: 1, routine: 1, setup: 1, activity: 1, settings: 1, light: 2, timing: 2, add: 2 };
window.addEventListener('hashchange', () => {
  closeSheet();
  const r = route(); const page = `${r.name}/${r.id}`;
  // a page that holds something open while it is shown (the bridge listening) lets go of it when it is left
  if (r.name !== lastName && SCREENS[lastName] && SCREENS[lastName].leave) SCREENS[lastName].leave(ctx);
  if (page !== lastPage && S.ready && S.config) {
    const was = DEPTH[lastName] ?? 1, now = DEPTH[r.name] ?? 1;
    // one tab to another slides the way the tab bar reads: a tab to the right comes in from the right
    const order = TABS.map(t => t[0]);
    arriving = !was && !now ? (order.indexOf(r.name) < order.indexOf(lastName) ? 'back' : 'push') : now < was ? 'back' : 'push';
    motion.capture($('#screen'));
  }
  lastName = r.name;
  if (page !== lastPage) window.scrollTo(0, 0);
  lastPage = page;
  render();
});

// Taps that mean the same on every screen.
const SHARED = {
  // a light's power circle: on to off, off to on, shown at once and confirmed by the bridge
  toggle(c, el) {
    const id = el.dataset.id; const d = data.dev(id); if (!d) return;
    if (d.domain === 'fan') { const on = data.isOn(id); run({ type: 'fan', target: `d:${id}`, speed: on ? 'Off' : 'Medium' }); return; }
    const on = data.isOn(id);
    assume([id], on ? 0 : 100); soon();
    run({ type: 'level', target: `d:${id}`, level: on ? 'off' : 'on' });
  },
  // a scene chip: Lutron scenes and the app's own run the same way
  scene(c, el) {
    const t = el.dataset.t;
    if (t.startsWith('p:')) {
      const p = data.presets().find(x => x.id === t.slice(2)); if (!p) return;
      for (const [id, v] of Object.entries(p.levels || {})) if (data.dev(id)) S.states[id] = { ...(S.states[id] || {}), level: typeof v === 'object' ? Number(v.level) || 0 : typeof v === 'number' ? v : 0 };
      soon();
      run({ type: 'preset', preset_id: p.id });
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
render();
// a slow minute tick keeps anything that says a time (the greeting, "since 9:41 pm") honest
setInterval(() => { if (!ctx.ui.dragging && !document.hidden) soon(); }, 60000);

// the offline shell (web/sw.js), the same worker the classic app registers
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

// for the browser tests and for poking at from the console
window.__copper = ctx;
