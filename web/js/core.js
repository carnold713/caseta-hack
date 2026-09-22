/* Pico Hack: the old UI's shared glue. The state, the transport and every question asked of the state now live in
   the data layer (web/data/caseta-data.js), which the new Copper Night UI runs on too. This file keeps the global
   names every other script calls, pointed at that layer, plus what is really the UI's: the sheet, the walk, the
   toast, the render dispatcher, painting state in place. */
'use strict';

const DATA = CasetaData.create({ storage: localStorage });
const S = DATA.S;
// What the screen is showing rides on the same object as the data: which page, which remote or room is open.
Object.assign(S, {
  view: (location.hash || '#home').slice(1).split('/')[0] || 'home',
  remote: null, room: null, roomPage: null, settingsPage: null,
});
DATA.hooks.signedOut = () => render();
// A loop of scenes is named for its room only when it holds all of that room's scenes (js/light.js knows which).
DATA.hooks.roomScenes = aid => (typeof roomScenes === 'function' ? roomScenes(aid) : null);

// ---------- the connection ----------
const RECONNECT_GRACE = CasetaData.RECONNECT_GRACE;
const connState = DATA.connState;
const connOk = DATA.connOk;
const connLost = DATA.connLost;
// The layer keeps the quiet window; the screen books the one repaint that turns the dot red when it runs out.
let connTimer = null;
function connBook(ok, conn) {
  if (ok) { clearTimeout(connTimer); connTimer = null; return; }
  if (conn !== 'started') return;
  clearTimeout(connTimer);
  connTimer = setTimeout(() => { connTimer = null; if (!connOk()) render(); }, RECONNECT_GRACE + 50);
}
function connChanged(ok) { connBook(ok, DATA.noteConn(ok)); }

const ICON = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
const $ = s => document.querySelector(s);
const esc = CasetaData.esc;
const uid = CasetaData.uid;
const clamp = CasetaData.clamp;
const cap = CasetaData.cap;
const plural = CasetaData.plural;

// ---------- transport ----------
const api = DATA.api;
const friendlyError = CasetaData.friendlyError;
async function command(action) {
  try { await DATA.run(action); return true; }
  catch (e) { toast(e.message, { err: true }); return false; }
}
// While a finger is moving: one command in flight per light, the newest value next (the layer's gate, sending
// through command() so a failure still shows).
const GATE = DATA.gate(command);
const sendGated = GATE.sendGated;
const sendLevel = GATE.sendLevel;
const sendColor = GATE.sendColor;
const levelQuiet = GATE.levelQuiet;
// Autosave. Every edit calls save(); the previous config is kept for a one-tap Undo.
let saveTimer = null;
async function save(opts = {}) {
  clearTimeout(saveTimer);
  try {
    const { prev } = await DATA.saveConfig();
    if (!opts.quiet) toast(opts.msg || 'Saved', { undo: prev ? async () => { DATA.restoreConfig(prev); await save({ msg: 'Undone', quiet: false }); render(); } : null });
  } catch (e) {
    toast(`Couldn't save. ${e.message}`, { err: true, action: 'Retry', onAction: () => save(opts) });
  }
  if (opts.render !== false) render();
}
function saveSoon(ms = 600) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save({ quiet: true }), ms); }
const noteSunClock = DATA.noteSunClock;

// The socket. The layer applies every message to the state and says what changed; this decides what to redraw.
function connectWS() {
  DATA.connectWS({
    message: onSocket,
    // keep what we know on screen; the dot says "Reconnecting" for ten seconds before it admits anything
    close: conn => { connBook(false, conn); if (S.ready) render(); },
  });
}
function onSocket(m, r) {
  switch (m.type) {
    case 'snapshot': {
      // Once, quietly: the five a room is offered fade over a second now, and a scene made before
      // that still holds the eight it was given (js/light.js shortenSuggestedFades).
      if (typeof shortenSuggestedFades === 'function' && shortenSuggestedFades()) save({ quiet: true, render: false });
      connBook(!!(m.agent && m.agent.online), r.conn);
      // First snapshot after "Getting your home ready...": show "Connected to your home" with a tick for 900ms, then Home.
      if (!S._everReady) { S._everReady = true; if (S.agent.online && S._loadingShown) { S._holdLoading = true; render(); setTimeout(() => { S._holdLoading = false; render(); setTimeout(() => { if (typeof openGreeting === 'function') openGreeting(); }, 450); }, 900); break; } }
      render(); break;
    }
    // an empty list from a hub that is still waiting for its connector is not news (the layer kept the home)
    case 'inventory': if (r.changed) render(); break;
    case 'state': paintState(); break;
    // a timer's block belongs on Home; when the news arrives while a sheet is still sliding shut, render once it has
    case 'timers': if (S.view === 'home') { if (sheet.isOpen()) setTimeout(() => { if (S.view === 'home' && !sheet.isOpen()) render(); }, 420); else render(); } else paintNowBar(); break;
    // the hub's echo of this phone's own save is not news
    case 'config': if (r.changed) render(); break;
    case 'agent': connBook(!!m.online, r.conn); render(); if (window.Hue) Hue.onAgent(); if (window.Nanoleaf) Nanoleaf.onAgent(); break;
    case 'activity': if (S.view === 'settings') paintActivity(); if (m.entry && m.entry.kind === 'schedule' && typeof paintSun === 'function') paintSun(); break;
    // after every config change and every ten minutes: the sun, the curve level and the next runs. Painted in place, never a full render.
    case 'sun': if (typeof paintSun === 'function') paintSun(); if (typeof paintFollow === 'function') paintFollow(); break;
    // which lamps are following the day, and the white each one is showing: painted in place, never a full render
    case 'follow': if (typeof paintFollow === 'function') paintFollow(); if (sheet.isOpen() && (SHEET_KEY === 'follow' || SHEET_KEY === 'follow-room')) { const el = $('#sheet-root [data-act="follow-toggle"]'); if (el && SHEET_KEY === 'follow') openFollowSheet(el.dataset.id); } break;
    case 'add_state': case 'add_heard': case 'add_log': if (window.AddDevice) AddDevice.onMessage(m); break;
    case 'nanoleaf_log': if (window.Nanoleaf) Nanoleaf.onMessage(m); break;
    case 'button': case 'gesture': onLive(m); break;
    case 'toast': toast(m.msg, { err: m.level === 'error' }); break;
  }
}

// ---------- inventory, rooms, targets, remotes: all the layer's ----------
const hiddenDevices = DATA.hiddenDevices;
const devices = DATA.devices;
const dev = DATA.dev;
const appRooms = DATA.appRooms;
const appRoom = DATA.appRoom;
const roomIndex = DATA.roomIndex;
const devArea = DATA.devArea;
const devAreaName = DATA.devAreaName;
const areaName = DATA.areaName;
const areas = DATA.areas;
const controllable = DATA.controllable;
const remotes = DATA.remotes;
const byName = DATA.byName;
const level = DATA.level;
const levelOf = CasetaData.levelOf;
const colorOf = CasetaData.colorOf;
const isOn = DATA.isOn;
const buttonsOf = DATA.buttonsOf;
const groups = DATA.groups;
const presets = DATA.presets;
const lutronScenes = DATA.lutronScenes;
const tlist = CasetaData.tlist;
const tsplit = CasetaData.tsplit;
const targetDevices = DATA.targetDevices;
const targetName = DATA.targetName;
const targetOn = DATA.targetOn;
const targetExists = DATA.targetExists;
const targetOptions = DATA.targetOptions;

// Room colours (docs/design-spec.md): flat fills, a soft variant, black text on all. Keys stored per room in settings.room_colors.
const ROOM_PALETTE = { mustard: { bg: '#E3A82B', soft: '#F7E6BE', ink: '#111111' }, steel: { bg: '#5C8CA8', soft: '#D3E1EA', ink: '#111111' }, sky: { bg: '#8FBDD6', soft: '#DCEBF3', ink: '#111111' }, meadow: { bg: '#4B9B5E', soft: '#C9E3CF', ink: '#111111' }, lemon: { bg: '#FFD400', soft: '#FFF2A8', ink: '#111111' }, blush: { bg: '#F2B8BC', soft: '#FADFE1', ink: '#111111' }, clay: { bg: '#C99B6C', soft: '#EAD8C3', ink: '#111111' }, sand: { bg: '#D9CDB5', soft: '#EFE9DD', ink: '#111111' } };
// A recognisable icon per room, by name. Falls back to the house.
function roomIcon(name) {
  const n = (name || '').toLowerCase();
  if (/bed|nursery|guest/.test(n)) return 'bed';
  if (/kitchen|dining|pantry|breakfast/.test(n)) return 'kitchen';
  if (/living|family|den|lounge|great|media|tv/.test(n)) return 'sofa';
  if (/outside|outdoor|patio|garden|porch|deck|yard|exterior|pool/.test(n)) return 'tree';
  if (/bath|powder|shower|laundry|utility/.test(n)) return 'bath';
  if (/office|study|desk|library|work/.test(n)) return 'desk';
  if (/hall|entry|foyer|closet|mud|stairs|landing/.test(n)) return 'hanger';
  if (/garage|shop|basement|workshop/.test(n)) return 'car';
  return 'house';
}
function roomColor(areaId) {
  const keys = Object.keys(ROOM_PALETTE);
  const chosen = (S.config && S.config.settings.room_colors || {})[areaId || 'none'];
  if (chosen && ROOM_PALETTE[chosen]) return ROOM_PALETTE[chosen];
  const idx = areas().findIndex(a => a.id === (areaId || 'none'));
  return ROOM_PALETTE[keys[(idx < 0 ? 0 : idx) % keys.length]];
}
const MODEL_NAMES = CasetaData.MODEL_NAMES;
const LAYOUTS = CasetaData.LAYOUTS;
const modelName = DATA.modelName;
const buttonLabel = DATA.buttonLabel;
const buttonTitle = DATA.buttonTitle;

// ---------- bindings ----------
const bindings = DATA.bindings;
const bindingsFor = DATA.bindingsFor;
const binding = DATA.binding;
const GESTURE_LABEL = CasetaData.GESTURE_LABEL;
const userGestureOf = CasetaData.userGestureOf;
const holdBindings = DATA.holdBindings;
const describe = DATA.describe;
const isShadeTarget = DATA.isShadeTarget;
const fmtDur = CasetaData.fmtDur;
const fanName = CasetaData.fanName;
const fmtTime = CasetaData.fmtTime;

// ---------- live pico events ----------
// The press itself has already been written down by the data layer (DATA.apply, noteLive); this is what the screen
// does about it.
function onLive(m) {
  // A remote the bridge lists without its buttons learns its own numbering from the keys themselves. The
  // remote's own screen is a sheet now, not part of the page render() reaches, so it is told directly.
  const learned = typeof rememberPress === 'function' && rememberPress(m.device_id, m.button_number);
  if (learned && S.view === 'remotes' && S.remote === m.device_id && typeof renderRemoteSheet === 'function') renderRemoteSheet();
  if (S.view === 'remotes') {
    if (!S.remote && m.type === 'gesture') { if (typeof openRemoteSheet === 'function') openRemoteSheet(m.device_id); else { S.remote = m.device_id; render(); } toast(`That's the ${dev(m.device_id) ? dev(m.device_id).name : 'remote'}. Tap a button to change it.`); return; }
    if (m.type === 'gesture' && S.remote === m.device_id) pulseGesture(m.button_number, m.gesture);
  }
  if (S.view === 'settings' && m.type === 'gesture') { const el = $('#tester'); if (el) { el.textContent = `Detected: ${GESTURE_LABEL[userGestureOf({ gesture: m.gesture })] || m.gesture} on ${dev(m.device_id) ? dev(m.device_id).name : 'a remote'}`; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } }
  paintLive();
}
function paintLive() {
  document.querySelectorAll('[data-live]').forEach(el => {
    const l = S.live[el.dataset.live];
    const was = el.classList.contains('live');
    const now = !!(l && l.event === 'Press' && Date.now() - l.at < 1200);
    el.classList.toggle('live', now);
    if (now && !was && window.Motion) Motion.press(el);
  });
  setTimeout(() => document.querySelectorAll('.pb.live').forEach(el => { const l = S.live[el.dataset.live]; if (!l || Date.now() - l.at >= 1200 || l.event !== 'Press') el.classList.remove('live'); }), 1300);
}
function pulseGesture(n, g) {
  const ug = userGestureOf({ gesture: g });
  document.querySelectorAll(`[data-grow="${n}/${ug}"]`).forEach(el => { if (window.Motion) Motion.pulse(el); else { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } });
}

// ---------- state painting (no full re-render) ----------
function paintState() {
  document.querySelectorAll('[data-lvl]').forEach(el => {
    const id = el.dataset.lvl; const v = level(id);
    if (el.classList.contains('slider')) { if (document.activeElement !== el && !el.dataset.drag && !levelQuiet(`d:${id}`)) { el.value = v == null ? 0 : v; el.style.setProperty('--p', `${v || 0}%`); } }
    else if (el.classList.contains('sw')) el.classList.toggle('on', isOn(id));
    else if (el.dataset.speed) el.classList.toggle('on', (S.states[id] || {}).fan_speed === el.dataset.speed);
    else el.textContent = v == null ? '' : v === 0 ? 'Off' : `${v}%`;
  });
  document.querySelectorAll('[data-tgt]').forEach(el => {
    const t = el.dataset.tgt; const on = targetOn(t);
    if (el.classList.contains('sw')) el.classList.toggle('on', on);
    else if (el.classList.contains('room')) { const was = el.classList.contains('on'); el.classList.toggle('on', on); const s = el.querySelector('.head .s'); if (s) s.textContent = roomSummary(t.slice(2)); if (was !== on && window.Motion) Motion.lightChanged(el, roomMeanLevel(t.slice(2)), was); }
    else if (el.classList.contains('dtile')) { const was = el.classList.contains('on'); el.classList.toggle('on', on); if (was !== on && window.Motion) Motion.lightChanged(el, level(el.dataset.tile) || (on ? 100 : 0), was); }
    else if (el.classList.contains('tile')) { el.classList.toggle('on', on); const s = el.querySelector('.s'); if (s) s.textContent = tileSub(t); }
  });
  document.querySelectorAll('[data-roomsum]').forEach(el => { el.textContent = roomSummary(el.dataset.roomsum); });
  document.querySelectorAll('[data-act-lvl]').forEach(el => { const was = el.classList.contains('on'); const on = isOn(el.dataset.actLvl); el.classList.toggle('on', on); if (was !== on && window.Motion) Motion.lightChanged(el.closest('.light') || el, level(el.dataset.actLvl) || 0, was); });
  if (typeof paintLight === 'function') paintLight(); // light.js: lamp discs, scene rows, rings, night look
  paintNowBar();
  if (window.LightField && S.view === 'home') LightField.update();
}
const roomMeanLevel = DATA.roomMeanLevel;
// Rooms for the light field: id = area id (matches the room card's data-room), the colour of its light, mean level of its lights.
function roomsForLight(overrides = {}) {
  return areas().map(a => { const lv = roomMeanLevel(a.id, overrides); return { id: a.id, color: typeof lampColor === 'function' ? lampColor(Math.max(1, lv)) : '#F7A64F', level: lv }; });
}
const roomSummary = DATA.roomSummary;
const tileSub = DATA.tileSub;
function statusLine() {
  if (connLost()) return `<span class="faint">Last known state</span>`;
  const on = controllable().filter(d => d.domain !== 'cover' && isOn(d.device_id));
  if (!on.length) return 'Everything is off';
  const rooms = [...new Set(on.map(d => devAreaName(d)))].slice(0, 3);
  return `<b>${on.length} ${on.length === 1 ? 'light' : 'lights'} on</b> · ${esc(rooms.join(', '))}${on.length > 3 && rooms.length === 3 ? '…' : ''}`;
}

// ---------- sheet ----------
const sheet = {
  el: null,
  // Bumped by every open() and close(): a close's delayed cleanup (below) checks this before touching the DOM, so
  // a sheet closed and reopened again quickly (Room setup's own back arrow, tapped before the first close's ~255ms
  // animation has finished) never has its fresh content wiped by the earlier close finishing late.
  _gen: 0,
  // opts: sub, cap (a small caption above the title, "1 of 3"), back, onBack, full (100dvh), cls. `dark` and `question` are accepted and ignored: every sheet is white and every header is the dialog kind.
  // A sheet that is already open never replays its slide-up: the content cross-fades in place and the card eases to
  // the new content's own height (sheet.morph). Sub-sheets opened while a walk is running keep the walk's minimum height.
  open(title, body, opts = {}) {
    const root = $('#sheet-root'); const el = root.querySelector('.sheet'); const sb = root.querySelector('.sb');
    sheet._gen++;
    const walking = !!WALK.cur || /\bwalk\b/.test(opts.cls || '');
    // Three detents and nothing between them (docs/ia-v5.md 5). A walk step is medium at every step, so the card
    // never changes height inside one flow.
    const detent = sheet.detentOf(opts, walking);
    const cls = 'sheet' + (detent ? ' dt-' + detent : '') + (opts.full ? ' full' : '') + (opts.cls ? ' ' + opts.cls : '') + (walking && !/\bwalk\b/.test(opts.cls || '') ? ' walk' : '');
    // A switch or a slider in the body string never carries its "on" class or value inline (every one in the
    // app relies on a paint pass right after it lands in the DOM, the same as a fresh render() does for the
    // page). A sheet opened straight from a tap, without a page render in between, used to skip that pass
    // entirely: a room's own light rows could show the right percentage (baked into the string) next to a
    // switch stuck reading "off" (the class paintState() would have added, never applied). Every sheet open
    // or swap gets that same pass now, the same as the page always has.
    const swap = () => { el.className = cls; if (detent === 'medium') el.dataset.grow = '1'; else delete el.dataset.grow; sheet.header(title, opts); sb.innerHTML = body; sb.scrollTop = 0; sheet.scrolled(); if (typeof paintState === 'function') paintState(); };
    if (root.classList.contains('in')) sheet.morph(swap);
    else {
      el.style.height = ''; el.style.transition = '';
      swap();
      root.classList.add('open'); requestAnimationFrame(() => { root.classList.add('in'); if (window.Motion) Motion.sheetIn(root); });
      // after the root is shown: a hidden element keeps its old scroll offset and ignores writes to scrollTop
      sb.scrollTop = 0;
    }
    sheet.onBack = opts.onBack || null;
    sheet.stackTitle = title;
    document.body.style.overflow = 'hidden';
    // nothing sits under the scrim pretending to be tappable (docs/ia-v5.md 4)
    { const nb = $('#nowbar'); if (nb) nb.classList.add('quiet'); }
    sheet.focusIn();
    placeToast(); requestAnimationFrame(placeToast); setTimeout(placeToast, 300);
  },
  // compact | medium | large, or '' for a sheet that has not been given one yet (it sizes to its content, as every
  // sheet used to). A walk step is always medium.
  detentOf(opts = {}, walking = false) {
    if (opts.full) return '';
    if (opts.detent) return opts.detent;
    return walking ? 'medium' : '';
  },
  // The detent an open sheet is at.
  detent() { const el = $('#sheet-root .sheet'); if (!el) return ''; return (el.className.match(/dt-(compact|medium|large)/) || [, ''])[1]; },
  // Move an open sheet between detents. The height eases over 260ms (the CSS transition on .dt-medium/.dt-large).
  setDetent(d) {
    const el = $('#sheet-root .sheet'); if (!el || sheet.detent() === d) return;
    el.style.height = ''; el.style.transition = '';
    el.classList.remove('dt-compact', 'dt-medium', 'dt-large');
    if (d) el.classList.add('dt-' + d);
    if (d === 'medium') el.dataset.grow = '1'; else if (d !== 'large') delete el.dataset.grow;
    sheet.detentChanged(d);
  },
  // Called after a detent change, including one the finger made (js/swipe.js).
  detentChanged() { placeToast(); requestAnimationFrame(placeToast); setTimeout(placeToast, 300); },
  // Change what an open sheet shows. `swap` rewrites the header and body; the old content fades out over a ghost and the
  // new fades in with no travel. keep: the card holds its height (a step inside one flow); otherwise it eases to the
  // new content's natural height, capped by the sheet's max-height, and sizes itself again afterwards.
  morph(swap, o = {}) {
    const root = $('#sheet-root'); const el = root.querySelector('.sheet'); const sh = el.querySelector('.sh'), sb = el.querySelector('.sb');
    const h0 = Math.round(el.getBoundingClientRect().height);
    // A tinted surface arriving in a swap arrives already tinted, never cross-faded from the colour the screen
    // before it was wearing: without this the way back from a green desk lamp to its room turns the room's screen
    // green for a quarter of a second. 40ms is long enough to cover the insert and the first paint, short enough
    // that a real colour change arriving just after it still cross-fades (docs/design-spec-v5.md 7.6).
    const run = () => { const had = root.contains(document.activeElement); root.classList.add('m-morph'); clearTimeout(root._mMorph); root._mMorph = setTimeout(() => root.classList.remove('m-morph'), 40); if (window.Motion) Motion.swap(el, swap, { nodes: [sh, sb], top: sh.offsetTop }); else swap(); if (had && !root.contains(document.activeElement)) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } placeToast(); requestAnimationFrame(placeToast); setTimeout(placeToast, 300); };
    // A step swap inside a sheet at a fixed detent never moves the height: the detent class owns it, and the content
    // crossfades in place behind the ghost (docs/ia-v5.md 5, Motion).
    if (/dt-(medium|large)/.test(el.className)) { clearTimeout(el._ht); el.style.height = ''; el.style.transition = ''; run(); return; }
    if (o.keep) { if (!el.style.height && h0 > 120) el.style.height = `${h0}px`; run(); return; }
    clearTimeout(el._ht); el.style.transition = 'none'; el.style.height = '';
    run();
    const h1 = Math.round(el.getBoundingClientRect().height);
    if (Math.abs(h1 - h0) < 2 || !window.Motion || Motion.reduced()) { el.style.transition = ''; return; }
    el.style.height = `${h0}px`; void el.offsetHeight;
    el.style.transition = 'height .255s var(--ease)'; el.style.height = `${h1}px`;
    el._ht = setTimeout(() => { el.style.transition = ''; el.style.height = ''; }, 280);
  },
  // The header alone: the close circle, the back arrow inline on the title line when there is somewhere to go back to, the caption, the title, the sub line.
  // The header alone. `done: true` puts "Done" where the X is: anything you are editing closes with a word, not a
  // cross (docs/ia-v5.md 5). It closes the sheet, it does not save: every change has already autosaved.
  header(title, opts = {}) {
    const sh = $('#sheet-root .sh');
    sh.className = 'sh' + (opts.back ? ' hasback' : '') + (opts.done ? ' hasdone' : '') + (title ? '' : ' notitle') + (sh.classList.contains('scrolled') ? ' scrolled' : '');
    const closer = opts.done
      ? `<button class="donebtn" data-act="sheet-close">Done</button>`
      : `<button class="iconbtn sm" data-act="sheet-close" aria-label="Close">${ICON('x')}</button>`;
    sh.innerHTML = `${opts.back ? `<button class="iconbtn sm" data-act="sheet-back" aria-label="Back">${ICON('back')}</button>` : ''}${closer}<div class="grow">${opts.cap ? `<div class="stepcap">${opts.cap}</div>` : ''}<h2>${title}</h2>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div>`;
  },
  // A hairline under the header while the body is scrolled.
  scrolled() { const sh = $('#sheet-root .sh'), sb = $('#sheet-root .sb'); if (sh && sb) sh.classList.toggle('scrolled', sb.scrollTop > 0); },
  close() {
    const root = $('#sheet-root'); root.classList.remove('in');
    SHEET_KEY = null;
    sheet._gen++;
    const myGen = sheet._gen;
    { const nb = $('#nowbar'); if (nb) nb.classList.remove('quiet'); }
    sheet.focusOut();
    placeToast();
    // if a new sheet opened while this close was still finishing (sheet._gen moved on), leave it alone: this
    // close's cleanup is stale and would otherwise wipe the fresh one's content out from under it.
    const done = () => { if (sheet._gen !== myGen) return; if (root.classList.contains('in')) return; root.classList.remove('open'); root.querySelector('.sb').innerHTML = ''; const el = root.querySelector('.sheet'); el.style.height = ''; el.style.transition = ''; el.classList.remove('dt-compact', 'dt-medium', 'dt-large'); delete el.dataset.grow; root.querySelectorAll('.m-ghost').forEach(g => g.remove()); };
    if (window.Motion) Promise.resolve(Motion.sheetOut(root)).then(done); else setTimeout(done, 320);
    document.body.style.overflow = '';
    if (sheet.onClose) { const f = sheet.onClose; sheet.onClose = null; f(); }
  },
  // Once a sheet is open its height stays put while the content inside changes: the content scrolls or
  // leaves room, the card never jumps. Cleared on close.
  lockHeight() { const root = $('#sheet-root'); const el = root.querySelector('.sheet'); if (!root.classList.contains('in') || el.style.height) return; if (/dt-(medium|large)/.test(el.className)) return; const h = el.getBoundingClientRect().height; if (h > 120) el.style.height = `${Math.round(h)}px`; },
  update(body) { sheet.lockHeight(); const sb = $('#sheet-root .sb'); if (sb) sb.innerHTML = body; },
  isOpen() { return $('#sheet-root').classList.contains('open'); },
  // Keyboard: a sheet opened with Enter takes focus, Tab stays inside it while the page behind is inert, and the
  // control that opened it gets focus back on close (docs/ux-progressive.md 2.21).
  focusables() { return [...$('#sheet-root').querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length); },
  focusIn() {
    const root = $('#sheet-root'); const el = root.querySelector('.sheet');
    const a = document.activeElement;
    if (a && a !== document.body && !root.contains(a)) sheet._opener = a;
    if (el && !root.contains(document.activeElement)) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
  },
  focusOut() {
    const o = sheet._opener; sheet._opener = null;
    if (o && document.contains(o)) setTimeout(() => { try { o.focus({ preventScroll: true }); } catch (_) { /* gone */ } }, 0);
  },
};
// The trap itself: while a sheet is open Tab never leaves #sheet-root.
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const root = $('#sheet-root'); if (!root || !root.classList.contains('open')) return;
  const list = sheet.focusables(); if (!list.length) { e.preventDefault(); return; }
  const first = list[0], last = list[list.length - 1]; const a = document.activeElement;
  if (!root.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && (a === first || a === root.querySelector('.sheet'))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
}, true);
{ const sb = $('#sheet-root .sb'); if (sb) sb.addEventListener('scroll', () => sheet.scrolled(), { passive: true }); }

// ---------- sheets that re-render in place ----------
let SHEET_KEY = null;
// Same key while the sheet is open: swap the body (and the header) in place, keep the height and the scroll position; otherwise open afresh.
function showSheet(key, title, body, opts = {}) {
  const root = $('#sheet-root');
  if (SHEET_KEY === key && root.classList.contains('open') && root.classList.contains('in')) {
    const sb = root.querySelector('.sb'); const top = sb.scrollTop;
    const want = sheet.detentOf(opts, !!WALK.cur); if (want) sheet.setDetent(want);
    // a step swap keeps the sheet's height, as a re-open does; `grow` lets a sheet that gains rows ease to them
    sheet.morph(() => { sb.innerHTML = body; sheet.header(title, opts); sb.scrollTop = opts.top ? 0 : top; sheet.scrolled(); }, { keep: !opts.grow });
    sheet.onBack = opts.onBack || null; return;
  }
  SHEET_KEY = key; sheet.open(title, body, opts);
}
function closeSheet() { sheet.close(); }

// ---------- the walk: one question per step, in one sheet (docs/ux-progressive.md 2.0) ----------
// def: { key, title, sub, state, primary, doneAct, onDone(w), onClose(w), cls, steps: [step] }
// step: { id, kind: pick | multi | time | custom | plan, title, sub, body(w), valid(w), skip(w), onPick(w, v), next, noNext, foot(w) }
// A pick row is `data-act="walk-pick" data-v="..."`: tapping records the answer (or hands it to onPick, which returns
// false when it has handled the step itself) and advances. Nothing is written until the plan's primary.
const WALK = { cur: null };
function walk(def) {
  const w = { def, key: def.key || ('walk-' + uid()), state: def.state || {}, i: 0, ret: null, exp: {} };
  WALK.cur = w;
  sheet.onClose = () => { if (WALK.cur === w) WALK.cur = null; SHEET_KEY = null; if (def.onClose) def.onClose(w); };
  walkRender(w);
  return w;
}
const walkSteps = w => w.def.steps.filter(s => !(s.skip && s.skip(w)));
const walkIs = key => !!(WALK.cur && WALK.cur.def.key === key);
function walkRender(w) {
  if (!w || WALK.cur !== w) return;
  const steps = walkSteps(w);
  let step = w.def.steps[w.i];
  // the current step stopped applying (its answer is now known): move on to the next one that shows
  if (!steps.includes(step)) { step = steps.find(s => w.def.steps.indexOf(s) > w.i) || steps[steps.length - 1]; w.i = w.def.steps.indexOf(step); }
  const idx = steps.indexOf(step), n = steps.length;
  const cap = `${w.def.title ? esc(w.def.title) + ' · ' : ''}${idx + 1} of ${n}`;
  const title = (typeof step.title === 'function' ? step.title(w) : step.title) || (step.kind === 'plan' ? "Here's the plan" : '');
  const sub = step.sub != null ? (typeof step.sub === 'function' ? step.sub(w) : step.sub) : (idx === 0 ? (w.def.sub || '') : '');
  const ok = !step.valid || !!step.valid(w);
  let foot = '';
  if (step.foot) foot = step.foot(w);
  else if (step.kind === 'plan') foot = `<div class="sfoot"><button class="btn primary lg block" data-act="${w.def.doneAct || 'walk-done'}" ${ok ? '' : 'disabled'}>${esc(w.def.primary || 'Done')}</button><button class="btn ghost block" data-act="sheet-close">Not now</button></div>`;
  else if (step.kind !== 'pick' && !step.noNext) foot = walkNextFoot(step.next || 'Next', ok);
  showSheet(w.key, title, step.body(w) + foot, { sub, cap, back: idx > 0 || w.ret != null, onBack: () => walkBack(w), top: true, cls: 'walk' + (w.def.cls ? ' ' + w.def.cls : '') });
}
const walkNextFoot = (label, ok) => `<div class="sfoot"><button class="btn primary lg block" data-act="walk-next" ${ok ? '' : 'disabled'}>${esc(label)}</button></div>`;
function walkAdvance(w) {
  if (w.ret != null) { w.i = w.ret; w.ret = null; walkRender(w); return; }
  const steps = walkSteps(w); const idx = steps.indexOf(w.def.steps[w.i]);
  if (idx < steps.length - 1) { w.i = w.def.steps.indexOf(steps[idx + 1]); walkRender(w); }
}
function walkBack(w) {
  if (w.ret != null) { w.i = w.ret; w.ret = null; walkRender(w); return; }
  const steps = walkSteps(w); const idx = steps.indexOf(w.def.steps[w.i]);
  if (idx > 0) { w.i = w.def.steps.indexOf(steps[idx - 1]); walkRender(w); } else sheet.close();
}
// From the plan, a value row reopens its step; coming back lands on the plan again.
function walkGoto(w, id) {
  const i = w.def.steps.findIndex(s => s.id === id); if (i < 0) return;
  const plan = w.def.steps.findIndex(s => s.kind === 'plan');
  if (plan >= 0 && w.i === plan) w.ret = plan;
  w.i = i; walkRender(w);
}
function walkPick(w, v) {
  const step = w.def.steps[w.i];
  if (step.onPick) { if (step.onPick(w, v) === false) return; } else w.state[step.id] = v;
  walkAdvance(w);
}
// A pick row: the title, an optional second line, a check when it is the current answer.
function pickRow(v, title, sub = '', sel = false, glyph = '') {
  return `<button class="item pick ${sel ? 'sel' : ''}" data-act="walk-pick" data-v="${esc(v)}">${glyph}<div class="grow"><div class="t">${title}</div>${sub ? `<div class="d">${sub}</div>` : ''}</div>${sel ? `<span class="chk">${ICON('check')}</span>` : ''}</button>`;
}
// The plan step: the summary in a tip, then value rows for the numbers.
function planHTML(sentence, rows) { return `<div class="tip top plan"><div class="grow"><div class="t">${sentence}</div></div></div>${rows ? `<div class="card pad0 list" style="margin-top:16px">${rows}</div>` : ''}`; }
// A value row: the question as the title, the current answer at the right. `act` decides what a tap does.
function valueRow(title, val, act, data = '', opts = {}) {
  return `<button class="item vrow ${opts.open ? 'open' : ''}" data-act="${act}" ${data}><div class="grow"><div class="t">${title}</div>${opts.sub ? `<div class="d">${opts.sub}</div>` : ''}</div><span class="val">${val}</span><span class="chev">${ICON('chev', 'sm')}</span></button>`;
}
// A value row that expands in place, inside a walk: the chips sit under the row.
function walkValueRow(w, k, title, val, body) {
  const open = !!w.exp[k];
  return valueRow(title, val, 'walk-expand', `data-k="${k}"`, { open }) + (open ? `<div class="vrow-body">${body}</div>` : '');
}
// The More row: always the last card on a screen; the second line names what is behind it.
function moreRow(sub, act, title = 'More') {
  return `<div class="card pad0 list morerow"><button class="item" data-act="${act}"><div class="grow"><div class="t">${title}</div><div class="d">${sub}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const w = WALK.cur; if (!w) return;
  switch (el.dataset.act) {
    case 'walk-next': walkAdvance(w); break;
    case 'walk-pick': walkPick(w, el.dataset.v); break;
    case 'walk-goto': walkGoto(w, el.dataset.id); break;
    case 'walk-expand': w.exp[el.dataset.k] = !w.exp[el.dataset.k]; walkRender(w); break;
    case 'walk-done': if (w.def.onDone) w.def.onDone(w); break;
  }
});

// ---------- toast ----------
let toastTimer;
// Where the toast sits. On a page it clears the bar and the tabs (CSS). With a sheet open it lifts over the sheet's
// sticky footer, so it is never on top of Next / Done / Try it now; `bottom` is transitioned, so it eases into place.
function placeToast() {
  const t = $('#toast'); if (!t) return;
  const root = $('#sheet-root');
  const f = root && root.classList.contains('in') ? root.querySelector('.sfoot') : null;
  const lift = f ? Math.max(0, Math.round(window.innerHeight - f.getBoundingClientRect().top)) : 0;
  t.style.setProperty('--toast-lift', lift + 'px');
}
function toast(msg, opts = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button data-act="toast-undo">Undo</button>' : ''}${opts.action ? `<button data-act="toast-action">${esc(opts.action)}</button>` : ''}`;
  placeToast();
  t.className = 'show' + (opts.err ? ' err' : '');
  t._undo = opts.undo; t._action = opts.onAction;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, opts.undo || opts.err ? 6000 : 2200);
}
window.addEventListener('resize', () => placeToast());

// ---------- render dispatcher ----------
const VIEWS = {};
function render() {
  const activeTab = (VIEWS[S.view] && VIEWS[S.view].tab) || S.view;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === activeTab));
  const v = $('#view'); const top = $('#top'); const app = $('#app'); const nb = $('#nowbar');
  const plain = () => { top.innerHTML = ''; v.className = 'plain'; app.classList.remove('nested', 'hasbar', 'haspill'); nb.classList.remove('show'); $('#nav').style.display = 'none'; };
  if (!S.token) { plain(); v.innerHTML = loginHTML(); return; }
  if (!S.ready || !S.config || S._holdLoading) { plain(); v.innerHTML = loadingHTML(!!S._holdLoading); S._loadingShown = true; return; }
  $('#nav').style.display = '';
  const view = VIEWS[S.view] || VIEWS.home;
  const nested = !!(view.nested && view.nested());
  app.classList.toggle('nested', nested);
  v.className = nested ? 'nested' : '';
  top.innerHTML = view.top ? view.top() : '';
  v.innerHTML = view.body();
  // the pill: only where Home is not, and only when something is lit (docs/ia-v5.md 4)
  const showPill = S.view !== 'home' && controllable().length > 0 && litLights().length > 0;
  nb.innerHTML = showPill ? pillHTML() : '';
  nb.classList.toggle('show', showPill); nb.classList.remove('hide');
  app.classList.toggle('haspill', showPill);
  paintState(); paintLive();
  if (S.view === 'home' && window.LightField) { const lf = document.getElementById('lightfield'); if (lf) LightField.init(lf, roomsForLight); }
  const pageKey = S.view + (nested ? '/' + (S.remote || S.room || 'more') + (S.roomPage || '') : '');
  if (window.Motion) {
    if (!S._launched) { S._launched = true; Motion.pageIn(v, { launch: true }); }
    else if (S._lastPage !== pageKey) Motion.pageIn(v);
    if (showPill && !S._barShown) { S._barShown = true; Motion.barIn(nb); }
  }
  // the dot only greets or grieves on a real change of state, never on the quiet ten seconds in between
  const st = connState();
  if (S._prevConn !== undefined && S._prevConn !== st && st !== 'reconnecting') { const dot = top.querySelector('.status .dot'); if (dot) dot.classList.add(st === 'ok' ? 'm-dot-hello' : 'm-dot-lost'); }
  S._prevConn = st;
  S._lastView = S.view; S._lastPage = pageKey;
  if (view.after) view.after();
}
// The status circle at the top right: the link glyph with a green or red dot. Tap goes to Settings.
function statusCircle() {
  const st = connState();
  const title = st === 'ok' ? 'Connected' : st === 'reconnecting' ? 'Reconnecting' : 'Not connected';
  return `<button class="iconbtn status ${st}" data-act="conn" title="${title}" aria-label="${title}">${ICON('link')}<span class="dot"></span></button>`;
}
const connPill = statusCircle;
// The nested header (the Tenzing page header): a Back link on the first line, then the title (with an optional sub line) and the tools.
function nestedTop(backAct, title = '', sub = '') {
  return `<div class="nested-hd"><button class="iconbtn plain backlink" data-act="${backAct}" aria-label="Back" title="Back">${ICON('back')}</button><div class="grow"><div class="t2">${title}</div>${sub ? `<div class="d">${sub}</div>` : ''}</div></div>`;
}
function loginHTML() {
  return `<div class="login"><div class="card dialog"><div class="t2">Welcome</div><p class="body">Enter your home's password to get started.</p>
  <form data-form="login"><label class="field" id="pwfield"><span>Password</span><input class="input" type="password" id="pw" autofocus autocomplete="current-password"></label>
  <div class="foot"><button class="btn primary lg block" type="submit" disabled>Continue</button><button class="btn ghost block" type="button" data-act="pw-help">Where do I find it?</button></div></form></div></div>`;
}
function loadingHTML(connected) {
  return `<div class="loading"><div class="card dialog">${connected ? `<div class="ok">${ICON('check', 'tick')}<div class="t">Connected to your home</div></div>` : `<div class="t">Getting your home ready...</div><div class="dots"><i></i><i></i><i></i><i></i></div>`}</div></div>`;
}

// ---------- the bottom pill (docs/ia-v5.md 4) ----------
// What is on, and the power button. 44px tall, 8px above the tab bar, and only where Home is not: on Home the
// house card at the top of the page carries the same two controls, so nothing floats there.
function nowBarHTML() {
  const rooms = roomsLit(); const on = litLights(); const lv = houseLevel();
  const tm = typeof nowTimer === 'function' ? nowTimer() : null;
  return `<div class="pill"><button class="pill-main" data-act="now-open" aria-label="Go to Home"><span class="pill-thumb" data-k="${on.length ? lv : 'off'}">${on.length ? lampHTML(lv, 28, '', '', false) : ICON('bulb')}${tm ? `<span class="badge">${ICON('clock')}</span>` : ''}</span><span class="pill-text" id="nb-head">${lightNowHeadline(rooms, true)}</span></button><button class="pill-off ${on.length ? '' : 'dark'}" data-act="alloff" title="${powerTitle()}" aria-label="${powerLabel()}">${ICON('power', 'sm')}</button></div>`;
}
const pillHTML = nowBarHTML;
// The house is dark on a tab that is not Home: the pill says what its one button does.
function barCaption(name, lit) { void name; return lit ? '' : powerLabel(); }
function paintNowBar() {
  const nb = $('#nowbar'); if (!nb || !nb.classList.contains('show') || !nb.firstChild) return;
  const rooms = roomsLit(); const on = litLights(); const lv = houseLevel();
  const head = nb.querySelector('#nb-head'); const h = lightNowHeadline(rooms, true);
  if (head && head.innerHTML !== h) { if (window.Motion) Motion.textSwap(head, h); else head.innerHTML = h; }
  const thumb = nb.querySelector('.pill-thumb'); const k = on.length ? String(lv) : 'off';
  const tm = typeof nowTimer === 'function' ? nowTimer() : null;
  if (thumb && (thumb.dataset.k !== k || !!thumb.querySelector('.badge') !== !!tm)) {
    thumb.dataset.k = k;
    thumb.innerHTML = (on.length ? lampHTML(lv, 28, '', '', false) : ICON('bulb')) + (tm ? `<span class="badge">${ICON('clock')}</span>` : '');
  }
  const pw = nb.querySelector('.pill-off'); if (pw) { pw.classList.toggle('dark', !on.length); pw.title = powerTitle(); pw.setAttribute('aria-label', powerLabel()); }
}
// The iOS toolbar rule: the pill goes away on a downward scroll of more than 24px and comes back on the way up
// or when the scroll stops. The tab bar never moves. The large title collapses to a 44px bar at the same moment.
(function () {
  let last = window.scrollY, acc = 0, idle = null;
  const nb = () => document.getElementById('nowbar');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    document.getElementById('app').classList.toggle('collapsed', y > 8);
    const el = nb(); if (!el || !el.classList.contains('show')) { last = y; return; }
    const dy = y - last; last = y;
    if (dy > 0) { acc = Math.max(0, acc) + dy; if (acc > 24) el.classList.add('hide'); }
    else if (dy < 0) { acc = 0; el.classList.remove('hide'); }
    clearTimeout(idle); idle = setTimeout(() => { acc = 0; el.classList.remove('hide'); }, 220);
  }, { passive: true });
})();
