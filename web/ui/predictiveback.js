// M13 · Swiping back: the Figma frame the owner approved for Android's predictive back (12916:2536). While a finger
// swipes in from the edge of the screen, the page it would leave follows it and the page Back would show waits
// underneath; let go past the point of no return and the step back plays out from wherever the finger left it.
//
// The Android side (mobile/android/.../MainActivity.java) hears the gesture from the system and hands each part of it
// to the page, on window.__caseta.back:
//
//   start(edge, x, y)    the swipe began at the 'left' or 'right' edge, x and y in CSS pixels. True when the page shows
//                        it; false when Back has nowhere to go here (Home, at the bottom), and then nothing moves.
//   progress(p, x, y)    how far along it is, 0 to 1, as Android says. The page follows it exactly.
//   cancel()             the finger went back: everything springs back and nothing happens.
//   commit()             let go: the page steps back itself, by the app's own rules (a sheet closes first, else one
//                        step of the history, else a tab goes to Home). True when it did; false when there is
//                        nowhere to go, and Android then puts the app in the background. Without a start (a back
//                        button, or an Android before 14) it is the plain step back.
//   can()                whether Back has anywhere to go here. The page also tells the Android side whenever that
//                        changes (native.backable), so that on Home the system's own back to the home screen plays.
//
// WHILE THE FINGER IS DOWN, with p the progress and k = p / 0.3 (held at 1 past it):
//   the page     scales to 1 - 0.1 k (0.9 from 30% on), moves up to 22 px toward the far side (by 34%), and its
//                corners round to 28 as seen (by 10%). Locked to the finger with no easing, as every drag here.
//   behind       the page Back would show, drawn from the app's own record of the entry before this one, at 0.96,
//                under a dark layer that thins from 1 to 0.45 as k grows (the file's list sitting back at 55%).
//   the chevron  a back circle at the swiped edge: it fades in by 15%, grows 0.5 to 1 with k and moves in 28 px.
// CANCEL: all of it springs back in 0.3 s on (0.2, 0.8, 0.2, 1), and the layer behind goes.
// COMMIT: a page kind that closes its own way takes over from the pose the finger left (a room reached from its card
//   closes back into it, M10, roomopen.js; a light or a remote into its tile or card, M11 and M14). Any other page
//   slides off toward the far side and fades, 0.3 s on (0.4, 0, 0.2, 1), while the page behind comes up to full size
//   and brightness.
// A SHEET that is up is what Back closes first, so with one up the gesture drives the sheet: it drops with the
//   progress, a commit closes it through the app's own close (so the history stays right), a cancel lifts it back.
//
// PAGE KINDS. A page that closes its own way registers a kind (register()); the first one that claims a gesture owns
// it, and anything unclaimed is the plain page above. A kind is an object with any of:
//   claims(info)            true to own this gesture. info is { r, page, prev, sheet }: the route and page now, the
//                           page Back would show ({ hash, r, page }, or null when it is not known), and the open sheet
//   scroll(info)            where the page behind will be scrolled when it is drawn (0 when not said)
//   dress(copy, info)       make the copy of the page behind look the way this kind's close starts from
//   hand(pose, info)        add to the pose its own close starts from (the room says where Rooms' list starts)
//   start(g), drag(g, p), cancel(g), commit(g)
//                           a kind that moves something other than the page (a sheet) does all of it itself; its
//                           commit returns true when it took the step
// The pose handed over at a commit (see poseOf) is what a close of its own starts from: pose.from(el) dresses the
// old page's ghost as the finger left it and returns its keyframes back to full size, pose.handed(screen, ghost,
// timing) brings the page underneath up with it, and pose.plain(screen, ghost) plays the plain slide off instead.
//
// In a browser or the installed web app there is no progress from the system, only the step back, and popstate
// plays the ordinary back (and M10's close for a room). Edge swipes belong to the system; the page never tries to
// catch them itself. Nothing is drawn while the phone asks for reduced motion; the step back still happens.
import { reduced, holdFor } from '/ui/motion.js';
import * as opening from '/ui/opening.js';
import * as chipOpen from '/ui/chipopen.js';
import { icon } from '/ui/icons.js';
import * as native from '/ui/native.js';

const SHRINK = 0.1;      // the page goes down to 0.9
const FULL = 0.3;        // reached at 30% of the gesture
const SHIFT = 22;        // toward the far side, by SHIFT_AT
const SHIFT_AT = 0.34;
const RADIUS = 28;       // its corners as seen, by ROUND_AT
const ROUND_AT = 0.1;
const BEHIND = 0.96;     // the page behind, while it waits
const LIT = 0.55;        // how far it comes up while the finger is down
const CHEV = 28;         // the chevron moves in this far
const DROP = 0.5;        // a sheet drops by this much of its height over the whole gesture
const SPRING = { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
const LEAVE = { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' };

const clamp01 = n => Math.max(0, Math.min(1, n));
const ramp = (p, end) => clamp01(p / end);
const px = n => `${Math.round(n * 100) / 100}px`;
const $ = s => document.querySelector(s);
const el = (cls, style = {}) => { const d = document.createElement('div'); d.className = cls; d.setAttribute('aria-hidden', 'true'); Object.assign(d.style, { pointerEvents: 'none', ...style }); return d; };
// Put an element's own style attribute back exactly as it was.
const restore = (node, was) => { if (!node) return; if (was == null) node.removeAttribute('style'); else node.setAttribute('style', was); };
const stop = anims => { for (const a of anims) { try { a.cancel(); } catch (_) { /* gone */ } } };

// Everything the gesture shows at a progress p.
function look(p) {
  const k = ramp(p, FULL), s = 1 - SHRINK * k;
  return { k, s, tx: SHIFT * ramp(p, SHIFT_AT), r: (RADIUS * ramp(p, ROUND_AT)) / s, dark: 1 - LIT * k, co: ramp(p, 0.15), cs: 0.5 + 0.5 * k, cx: CHEV * ramp(p, SHIFT_AT) };
}

// ---------- the app's side ----------
// app.js hands in what it knows (wire): its context, its routes and history numbering, a way to draw a page's HTML,
// its sheet's own close, and its rule for one step back.
let app = null;
let G = null;           // the gesture under way
let landing = null;     // a commit waiting for its address to change: { g, timer }
let arriving = null;    // a pose whose plain slide off plays once the page behind is drawn
let settling = null;    // what is still playing from the last gesture: { done() } jumps it to its end
const kinds = [];

export function register(kind) {
  kinds.push(kind);
  return () => { const i = kinds.indexOf(kind); if (i >= 0) kinds.splice(i, 1); };
}

// The address of every entry, by the app's own numbering (history.state.n), so the entry under this one is known:
// the history itself never says what is behind the current page. Kept for the tab's life, like the numbering.
let hashes = {};
try { hashes = JSON.parse(sessionStorage.getItem('navHashes') || '{}') || {}; } catch (_) { hashes = {}; }
function note() {
  if (!app) return;
  hashes[app.place()] = location.hash || '#home';
  try { sessionStorage.setItem('navHashes', JSON.stringify(hashes)); } catch (_) { /* fine */ }
}

const ready = () => !!(app && app.ctx.S.token && app.ctx.S.ready && app.ctx.S.config);
const sheetEl = () => { const root = $('#sheet-root'); return root && !root.hidden ? root.querySelector('.sheet') : null; };
// Whether Back has anywhere to go: a sheet to close, an entry under this one, or a tab to go Home from.
export function can() {
  if (!app) return false;
  return !!sheetEl() || app.place() > 0 || app.route().name !== 'home';
}
// A page's address back into the route that draws it (#rooms is 'rooms/null').
const pageRoute = page => { const [name, id] = page.split('/'); return { name, id: id && id !== 'null' ? id : null, sub: null }; };
// The page Back would show: the entry under this one, or Home under a tab at the bottom.
function prevOf() {
  const n = app.place();
  let hash = null;
  if (n > 0) hash = hashes[n - 1] ?? (app.depthOf(app.route()) === 0 ? '#home' : null);
  else if (app.route().name !== 'home') hash = '#home';
  if (hash == null) return null;
  const page = app.pageOf(app.parseRoute(hash));
  return { hash, r: pageRoute(page), page };
}
function infoNow() {
  const r = app.route();
  return { r, page: app.pageOf(r), prev: prevOf(), sheet: sheetEl() };
}

// ---------- the window API ----------
function start(edge, x, y) {
  if (!app) return false;
  if (settling) settling.done();
  if (G) drop(G);
  G = null;
  if (landing || !ready() || !can() || opening.busy()) return false;
  const info = infoNow();
  const kind = kinds.find(k => { try { return !!(k.claims && k.claims(info)); } catch (_) { return false; } }) || null;
  const side = edge === 'right' ? 'right' : 'left';
  const g = { edge: side, dir: side === 'right' ? -1 : 1, y: Number.isFinite(Number(y)) && y != null ? Number(y) : innerHeight / 2, p: 0, kind, info, own: !!(kind && kind.drag) };
  G = g;
  app.ctx.ui.dragging = true;
  if (reduced()) { g.still = true; return true; }
  if (g.own) { if (kind.start) kind.start(g); return true; }
  lift(g);
  paint(g);
  return true;
}
function progress(p) {
  const g = G; if (!g) return false;
  g.p = clamp01(Number(p) || 0);
  if (g.still) return true;
  if (g.own) { g.kind.drag(g, g.p); return true; }
  paint(g);
  return true;
}
function cancel() {
  const g = G; if (!g) return false;
  G = null;
  if (g.still) { app.ctx.endDrag(); return true; }
  if (g.own) { if (g.kind.cancel) g.kind.cancel(g); else app.ctx.endDrag(); return true; }
  springBack(g);
  return true;
}
function commit() {
  if (!app) return false;
  const g = G; G = null;
  if (landing) return true;
  if (!ready()) { if (g) drop(g); return false; }
  if (g && g.own && g.kind.commit) return !!g.kind.commit(g);
  // a sheet up and no gesture showing it (a back button): the app's own close, with its own drop
  if (sheetEl()) { if (g) drop(g); app.ctx.ui.dragging = false; app.dismissSheet(); return true; }
  if (!can()) { if (g) { if (g.still) app.ctx.endDrag(); else springBack(g); } return false; }
  // the redraw the finger held back is the page behind's own, drawn when the address changes
  app.ctx.ui.dragging = false;
  if (g && !g.still) landing = { g, timer: setTimeout(missed, 1500) };
  app.stepBack();
  return true;
}

// ---------- the page following the finger ----------
function lift(g) {
  const scr = $('#screen');
  g.scr = scr; g.style0 = scr.getAttribute('style');
  const b = scr.getBoundingClientRect();
  const W = innerWidth, H = innerHeight;
  // scaled about the middle of the screen, and cut to the screen with round corners (the page is taller than it)
  g.origin = `${px(W / 2 - b.left)} ${px(H / 2 - b.top)}`;
  g.inset = [Math.max(0, -b.top), Math.max(0, b.right - W), Math.max(0, b.bottom - H), Math.max(0, -b.left)].map(px).join(' ');
  g.height = b.height;
  g.bg = getComputedStyle(document.body).backgroundColor;
  Object.assign(scr.style, { zIndex: '1', backgroundColor: g.bg, transformOrigin: g.origin, willChange: 'transform' });
  g.behind = behind(g);
  g.chev = chevron(g);
}
function paint(g) {
  const L = look(g.p);
  g.scr.style.transform = `translateX(${px(g.dir * L.tx)}) scale(${L.s})`;
  g.scr.style.clipPath = `inset(${g.inset} round ${px(L.r)})`;
  g.behind.dark.style.opacity = String(L.dark);
  g.chev.style.opacity = String(L.co);
  g.chev.style.transform = `translateX(${px(g.dir * L.cx)}) scale(${L.cs})`;
}
// The page Back would show, drawn from the state as the app draws it, under the page and dark until it comes up.
function behind(g) {
  const { info } = g;
  const L = el('pb-behind', { position: 'fixed', inset: '0', zIndex: '0', overflow: 'hidden', backgroundColor: g.bg });
  L.inert = true;
  const pg = el('pb-page', { position: 'absolute', inset: '0', transformOrigin: '50% 50%', transform: `scale(${BEHIND})` });
  const dark = el('pb-dark', { position: 'absolute', inset: '0', backgroundColor: '#000', opacity: '1' });
  let sc = null;
  if (info.prev) {
    sc = document.createElement('div');
    sc.className = 'screen';
    try { sc.innerHTML = app.draw(info.prev.r); } catch (_) { sc.innerHTML = ''; }
    sc.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    let y = 0;
    try { y = (g.kind && g.kind.scroll && g.kind.scroll(info)) || 0; } catch (_) { y = 0; }
    if (y) sc.style.transform = `translateY(${px(-y)})`;
    if (g.kind && g.kind.dress) { try { g.kind.dress(sc, info); } catch (_) { /* drawn plain */ } }
    pg.appendChild(sc);
    // a page with the tab bar behind one without it (a light over its room) shows the bar it will come back to
    const tabs = $('#tabs');
    if (tabs && tabs.hidden && app.hasTabs(info.prev.r)) { const t = tabs.cloneNode(true); t.removeAttribute('id'); t.hidden = false; pg.appendChild(t); }
  }
  L.append(pg, dark);
  g.scr.before(L);
  return { L, pg, dark, sc };
}
// The back circle at the swiped edge, where the finger is.
function chevron(g) {
  const top = Math.max(72, Math.min(innerHeight - 128, g.y - 28));
  const c = el('pb-chev', {
    position: 'fixed', top: px(top), [g.edge]: '4px', width: '56px', height: '56px', borderRadius: '28px',
    display: 'grid', placeItems: 'center', backgroundColor: 'var(--surface-1)', color: 'var(--icon-1)',
    boxShadow: 'var(--shadow-lift)', zIndex: '7', opacity: '0', transform: 'scale(0.5)',
  });
  c.innerHTML = icon('back', 22, 1.7);
  if (g.edge === 'right' && c.firstElementChild) c.firstElementChild.style.transform = 'scaleX(-1)';
  document.body.appendChild(c);
  return c;
}
// Everything of a gesture gone at once, the page as it was.
function drop(g) {
  if (g.own) { if (g.kind.cancel) { g.kind.cancel(g, true); } return; }
  if (g.scr) restore(g.scr, g.style0);
  if (g.behind) g.behind.L.remove();
  if (g.chev) g.chev.remove();
  if (app) app.ctx.ui.dragging = false;
}
// Cancel: back to where it all was, 0.3 s on the standard curve, and the layer behind goes.
function springBack(g) {
  const L = look(g.p);
  const o = { ...SPRING, fill: 'forwards' };
  const anims = [
    g.scr.animate([{ transform: g.scr.style.transform, clipPath: g.scr.style.clipPath }, { transform: 'translateX(0px) scale(1)', clipPath: `inset(${g.inset} round 0px)` }], o),
    g.behind.dark.animate([{ opacity: L.dark }, { opacity: 1 }], o),
    g.chev.animate([{ opacity: L.co, transform: g.chev.style.transform }, { opacity: 0, transform: 'translateX(0px) scale(0.5)' }], o),
  ];
  const done = () => {
    if (settling !== s) return;
    settling = null;
    stop(anims);
    drop(g);
    app.ctx.endDrag();
  };
  const s = settling = { done };
  Promise.all(anims.map(a => a.finished)).then(done, () => {});
}
// A commit whose address never changed (an entry with the same address under it): nothing to show, so it springs back.
function missed() {
  const l = landing; if (!l) return;
  landing = null; clearTimeout(l.timer);
  springBack(l.g);
}

// ---------- handing the page over ----------
// Called by the app as the address changes after a commit, before anything is measured or drawn. The page gets its
// own styles back and the pose it was left in is returned, for whoever plays the close: a kind's own close (the
// room's, which takes it through opening.prepare) or this module's slide off (prepare, then arrive).
export function letGo() {
  const l = landing; if (!l) return null;
  landing = null; clearTimeout(l.timer);
  const g = l.g;
  restore(g.scr, g.style0);
  return poseOf(g);
}
function poseOf(g) {
  const L = look(g.p);
  const pose = {
    g, dir: g.dir, s: L.s, dark: L.dark, origin: g.origin, bg: g.bg, height: px(g.height), list: null,
    transform: `translateX(${px(g.dir * L.tx)}) scale(${L.s})`,
    clip: `inset(${g.inset} round ${px(L.r)})`,
    // what is playing it, for done()
    anims: [], parts: [], screen: null, style0: null, ghost: null, taken: false, over: false,
    // the old page's ghost, dressed as the finger left it (as tall as the page was, so its surface still reaches the
    // bottom of the screen), and its keyframes back to full size
    from(node) {
      Object.assign(node.style, { transformOrigin: pose.origin, clipPath: pose.clip, height: pose.height, backgroundColor: pose.bg });
      return [{ transform: pose.transform }, { transform: 'translateX(0px) scale(1)' }];
    },
    // the page underneath is drawn now, where the copy was: it comes up to full size and brightness with the close
    handed(screen, ghost, { dur = LEAVE.duration, ease = LEAVE.easing } = {}) {
      pose.taken = true;
      g.behind.L.remove();
      const o = { duration: dur, easing: ease, fill: 'forwards' };
      const dark = comeUp(screen, ghost, pose);
      // the page's own surface goes once what was on it has (0.18 s, as the file's), so the page coming up shows
      // around what closes without anything of the old page lying see-through over it
      // (the ghost is the close's own, which it removes when it lands)
      if (ghost) ghost.animate([{ backgroundColor: pose.bg }, { backgroundColor: 'rgba(0, 0, 0, 0)' }], { duration: 180, delay: 110, easing: 'ease-in-out', fill: 'forwards' });
      pose.anims.push(
        screen.animate([{ transform: `scale(${BEHIND})` }, { transform: 'scale(1)' }], o),
        dark.animate([{ opacity: L.dark }, { opacity: 0 }], o),
        chevOut(g),
      );
      play(pose, dur);
    },
    // the plain slide off, when the kind's own close cannot play after all (its card is not on screen)
    plain(screen, ghost) { slide(screen, pose, ghost); },
    done() {
      if (pose.over) return;
      pose.over = true;
      if (settling && settling.done === pose.done) settling = null;
      stop(pose.anims);
      if (pose.screen) restore(pose.screen, pose.style0);
      for (const n of pose.parts) n.remove();
      if (pose.ghost) pose.ghost.remove();
      g.behind.L.remove(); g.chev.remove();
    },
  };
  // nothing is left behind if no close ever takes it
  setTimeout(() => { if (!pose.taken) pose.done(); }, 2000);
  if (g.kind && g.kind.hand) { try { g.kind.hand(pose, g.info); } catch (_) { /* the plain pose */ } }
  return pose;
}
// The page drawn under the leaving one, readied to come up: scaled about the middle of the screen, with a dark layer
// between it and the ghost that starts as dark as the finger left it.
function comeUp(screen, ghost, pose) {
  pose.screen = screen; pose.style0 = screen.getAttribute('style');
  const b = screen.getBoundingClientRect();
  screen.style.transformOrigin = `${px(innerWidth / 2 - b.left)} ${px(innerHeight / 2 - b.top)}`;
  const dark = el('pb-dark', { position: 'fixed', inset: '0', zIndex: '1', backgroundColor: '#000', opacity: String(pose.dark) });
  if (ghost) ghost.before(dark); else screen.after(dark);
  pose.parts.push(dark);
  return dark;
}
const chevOut = g => g.chev.animate([{ opacity: Number(g.chev.style.opacity) || 0 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
function play(pose, dur) {
  holdFor(dur + 50);
  settling = { done: pose.done };
  Promise.all(pose.anims.map(a => a.finished)).then(pose.done, () => {});
}

// No kind of its own took it: the old page leaves as a ghost of its own elements, and once the page behind is drawn
// the ghost slides off (arrive). Returns how the app's redraw arrives.
export function prepare(screen, pose) {
  if (!pose) return null;
  const box = screen.getBoundingClientRect();
  const gh = el('pb-leaving', {
    position: 'fixed', left: px(box.left), top: px(box.top), width: px(box.width), height: pose.height, zIndex: '1',
    transformOrigin: pose.origin, transform: pose.transform, clipPath: pose.clip, backgroundColor: pose.bg,
  });
  gh.inert = true;
  for (const k of [...screen.children]) gh.appendChild(k);
  gh.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  gh.querySelectorAll('[data-go], [data-act]').forEach(n => { n.removeAttribute('data-go'); n.removeAttribute('data-act'); });
  screen.after(gh);
  pose.ghost = gh;
  pose.taken = true;
  arriving = pose;
  return 'swipe-back';
}
// Called by the app's redraw once the page behind is drawn, in place of motion.arrive().
export function arrive(screen) {
  const pose = arriving; arriving = null;
  if (pose) slide(screen, pose, pose.ghost);
}
// The shrunk page slides off toward the far side, fading once it is well on its way, while the page behind comes up
// to full size and brightness. The page behind is the real one now, drawn where its copy was, so the copy goes (left
// under it, anything that differs, a card the room's close would have hidden, would show through).
function slide(screen, pose, ghost) {
  const { g } = pose;
  pose.taken = true;
  if (ghost && !ghost.isConnected) screen.after(ghost);
  g.behind.L.remove();
  const o = { ...LEAVE, fill: 'forwards' };
  const dark = comeUp(screen, ghost, pose);
  const up = [{ transform: `scale(${BEHIND})` }, { transform: 'scale(1)' }];
  pose.anims.push(
    screen.animate(up, o),
    dark.animate([{ opacity: pose.dark }, { opacity: 0 }], o),
    chevOut(g),
  );
  if (ghost) {
    // a ghost the app captured (the room's close could not play after all) is dressed as the finger left the page
    Object.assign(ghost.style, { transformOrigin: pose.origin, clipPath: pose.clip, backgroundColor: pose.bg, height: pose.height, zIndex: '1' });
    ghost.classList.add('pb-leaving');
    pose.ghost = ghost;
    // whole until it is well on its way, so it never lies see-through over the page coming up
    pose.anims.push(ghost.animate([{ transform: pose.transform, opacity: 1 }, { opacity: 1, offset: 0.4 }, { transform: `translateX(${px(pose.dir * innerWidth)}) scale(${pose.s})`, opacity: 0 }], o));
  }
  play(pose, LEAVE.duration);
}

// ---------- a sheet ----------
// Back closes a sheet first, so with one up the gesture is the sheet's: it drops with the progress (the scrim
// thinning with it), a commit drops the rest of the way and closes it as the app closes it, and a cancel lifts it.
register({
  name: 'sheet',
  claims: info => !!info.sheet,
  start(g) {
    const root = $('#sheet-root');
    g.sheet = g.info.sheet; g.scrim = root.querySelector('.scrim');
    g.h = g.sheet.offsetHeight || 1;
    g.was = [g.sheet.getAttribute('style'), g.scrim && g.scrim.getAttribute('style')];
    for (const n of [g.sheet, g.scrim]) if (n) n.getAnimations().forEach(a => a.cancel());
  },
  drag(g, p) {
    g.dy = g.h * DROP * p;
    g.sheet.style.transform = `translateY(${px(g.dy)})`;
    if (g.scrim) g.scrim.style.opacity = String(Math.max(0, 1 - g.dy / g.h));
  },
  cancel(g, now) {
    const back = () => { restore(g.sheet, g.was[0]); if (g.scrim) restore(g.scrim, g.was[1]); app.ctx.endDrag(); };
    if (now || !g.dy) { back(); return; }
    const o = { ...SPRING, fill: 'forwards' };
    const anims = [g.sheet.animate([{ transform: g.sheet.style.transform }, { transform: 'translateY(0px)' }], o)];
    if (g.scrim) anims.push(g.scrim.animate([{ opacity: g.scrim.style.opacity || 1 }, { opacity: 1 }], o));
    const done = () => { if (settling !== s) return; settling = null; stop(anims); back(); };
    const s = settling = { done };
    Promise.all(anims.map(a => a.finished)).then(done, () => {});
  },
  commit(g) {
    app.ctx.ui.dragging = false;
    if (!g.dy) { app.dismissSheet(); return true; }
    // a scene's editor opened from its chip goes back into the chip from where the finger left it (M12)
    if (chipOpen.close($('#sheet-root'), { dy: g.dy })) { app.dismissSheet({ dropped: true }); return true; }
    // the rest of the way down, as fast as a sheet leaves (0.28 s for the whole height), then the app's own close
    const ms = Math.max(120, 280 * (1 - g.dy / g.h));
    const o = { duration: ms, easing: 'ease-in', fill: 'forwards' };
    const anims = [g.sheet.animate([{ transform: `translateY(${px(g.dy)})` }, { transform: 'translateY(100%)' }], o)];
    if (g.scrim) anims.push(g.scrim.animate([{ opacity: g.scrim.style.opacity || 1 }, { opacity: 0 }], o));
    const done = () => { if (settling !== s) return; settling = null; if (g.sheet.isConnected) app.dismissSheet({ dropped: true }); };
    const s = settling = { done };
    Promise.all(anims.map(a => a.finished)).then(done, () => {});
    return true;
  },
});

// ---------- a room reached from its card ----------
// Leaving it for Rooms closes it back into its card (M10). Behind it Rooms waits as that close starts from: scrolled
// where it was, the card not there (it is the page in the finger), the cards above it up 16, those below down 64
// and "Rooms" up 12, as the file draws it. The close then brings the list back from there, nearest first.
const ROOMS = { up: -16, down: 64, head: -12 };
register({
  name: 'room',
  claims(info) {
    const o = opening.openedFrom('room');
    return !!(o && info.page === `room/${o.aid}` && info.prev && info.prev.page === 'rooms/null');
  },
  scroll: () => { const o = opening.openedFrom('room'); return o ? o.y : 0; },
  dress(copy) {
    const o = opening.openedFrom('room'); if (!o) return;
    const list = copy.querySelector('.rooms-list');
    const card = list && [...list.children].find(k => k.dataset.go === `room/${o.aid}`);
    if (!card) return;
    card.style.visibility = 'hidden';
    const kids = [...list.children], at = kids.indexOf(card);
    kids.forEach((k, i) => { if (i !== at) k.style.transform = `translateY(${i < at ? ROOMS.up : ROOMS.down}px)`; });
    const head = copy.querySelector('.rooms-head');
    if (head) head.style.transform = `translateY(${ROOMS.head}px)`;
  },
  hand(pose) { pose.list = { ...ROOMS }; },
});

// ---------- a light reached from its tile, a remote from its card ----------
// Leaving it for the page it opened from closes it back into its tile or card (M11 and M14, lightopen.js and
// remoteopen.js). Behind it that page waits as the close starts from: scrolled where it was, everything in its place
// and the tile or card not there (it is the page in the finger). The close starts from the shrunk page.
for (const [name, sel] of [['light', '.room-grid > .tile'], ['remote', '.rgrid > .rcard']]) {
  register({
    name,
    claims(info) {
      const o = opening.openedFrom(name);
      return !!(o && info.page === o.to && info.prev && info.prev.page === o.from);
    },
    scroll: () => { const o = opening.openedFrom(name); return o ? o.y : 0; },
    dress(copy) {
      const o = opening.openedFrom(name);
      const n = o && copy.querySelector(`${sel}[data-go="${CSS.escape(o.to)}"]`);
      if (n) n.style.visibility = 'hidden';
    },
  });
}

// ---------- wiring ----------
// Whether Back has anywhere to go, told to the Android side when it changes (after an address change, and when a
// sheet opens or closes).
let told = null;
function tell() {
  queueMicrotask(() => { const c = can(); if (c !== told) { told = c; native.backable(c); } });
}
export function wire(a) {
  app = a;
  note();
  // after the app's own handler, which numbers a new entry
  window.addEventListener('hashchange', () => {
    note(); tell();
    // a commit whose address changed without the page changing (a sheet's entry): nothing handed it over
    if (landing) setTimeout(() => { if (landing) missed(); }, 0);
  });
  window.addEventListener('popstate', () => { tell(); if (landing) setTimeout(() => { if (landing) missed(); }, 120); });
  const root = $('#sheet-root');
  if (root && typeof MutationObserver === 'function') new MutationObserver(tell).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  tell();
  const api = { start, progress, cancel, commit, can };
  window.__caseta = Object.assign(window.__caseta || {}, { back: api });
}
