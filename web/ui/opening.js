// Pages that open out of what was tapped to reach them, and close back into it: the owner's frames M10 (a room card
// on Rooms into its room, roomopen.js), M11 (a tile on a room into its light, fan or shade, lightopen.js) and M14 (a
// remote's card on Remotes into its page, remoteopen.js). This module decides which one plays and keeps the list of
// what is open; the pieces they share are flight.js. Every other page change is motion.js's push or back, and so is
// any of these when the page is reached another way, when the thing it closes into is not on screen, or when the
// phone asks for reduced motion.
//
// THE APP'S SIDE (app.js):
//   tap(el)                    a tap on something with data-go, before the address changes
//   busy()                     true while one plays (a second tap then does nothing, so nothing navigates twice)
//   prepare({ from, to, r, depth, screen, pose })
//                              on every page change, before the new page is drawn: returns a word for the redraw
//                              ('shared-open', 'shared-close' or 'still') when one of these plays, else null. `pose`
//                              is where Android's back swipe left the page (predictiveback.js, M13): the close then
//                              starts from it, the page shrunk as the finger had it
//   plays(how) / arrive(how, screen)
//                              once the new page is drawn: arrive() plays it in place of motion.arrive()
//   flying() / whenLanded(fn)  a redraw while one plays waits for it to land
//   takeScroll()               where the page closed back into was scrolled, once, for the redraw to put back
//   openedFrom(kind)           the last page of a kind opened this way and still open, { kind, from, to, aid, y }, or
//                              null: Android's back swipe draws the page it closes into as the close starts from
//
// FOLLOWING A FINGER. Android's back swipe (M13, predictiveback.js) shrinks the page with the finger and hands the
// close its pose on the commit (above). The close can also be driven by a progress itself, scrubbed like a video:
//   const back = followBack();
//     null when a Back from the page on show is not one of these closes (use your own follower then). Otherwise it
//     steps the history back itself, and the close that runs is held at its start for the finger:
//   back.progress(p)   p from 0 (the page as it is) to 1 (closed into what opened it); follows the finger exactly
//   back.commit()      the finger let go to go back: the close plays on from where it is, on its own curve
//   back.cancel()      the finger let go to stay: the close runs back to 0 and the page is put back as it was, at
//                      the same place in the history (one step forward again), with nothing redrawn in between
//   All three can be called before the page has changed (the history steps back a moment later); they are applied
//   as soon as the close exists. If the close falls back to the plain back (what it closes into is not on screen),
//   progress does nothing, commit does nothing and cancel steps forward again with the plain push.
//   canFollow() says whether followBack() would give one, without doing anything.
import { reduced, capture, takeGhost, arrive as plainArrive, stagger } from '/ui/motion.js';
import * as F from '/ui/flight.js';
import * as room from '/ui/roomopen.js';
import * as light from '/ui/lightopen.js';
import * as remote from '/ui/remoteopen.js';

const KINDS = { room, light, remote };

let tapped = null;      // a source just tapped: { kind, hash, el, y, until }, until its address changes
let open = [];          // what is open, deepest last: { kind, from, to, depth, y }
let pending = null;     // what prepare() measured, for arrive() once the new page is drawn
let scrollBack = null;  // where the page closed back into goes back to, for the next redraw
let armed = null;       // a finger waiting to hold the next close (followBack)
let returning = null;   // a close the finger took back: the page to put back as it was

// ---------- the app's side ----------
export function tap(el) {
  if (!el || !el.closest('#screen')) return;
  for (const K of Object.values(KINDS)) {
    if (K.source(el)) { tapped = { kind: K.name, hash: el.dataset.go, el, y: window.scrollY, until: performance.now() + 800 }; return; }
  }
}
export function busy() {
  const now = performance.now();
  return !!((tapped && now < tapped.until) || now < F.busyUntil());
}
export const flying = F.flying;
export const whenLanded = F.whenLanded;
export function takeScroll() { const y = scrollBack; scrollBack = null; return y; }
export function openedFrom(kind) {
  for (let i = open.length - 1; i >= 0; i--) if (open[i].kind === kind) return { ...open[i], aid: open[i].to.split('/')[1] };
  return null;
}
export const plays = how => how === 'shared-open' || how === 'shared-close' || how === 'still';

// Called when the page changes, before the new one is drawn.
export function prepare({ from, to, r, depth, screen, pose = null }) {
  F.finish();
  const t = tapped; tapped = null; pending = null;
  const fl = armed; armed = null;
  // the finger took a close back: the page it was closing is put back as it was, with nothing moving
  if (returning && to === returning.entry.to) {
    const back = returning; returning = null;
    open.push(back.entry);
    scrollBack = back.y;
    return 'still';
  }
  returning = null;
  // an open: the thing tapped is on screen and its address is the page now coming
  const K = t && KINDS[t.kind];
  if (K && t.hash === to && K.opens({ from, to, r })) {
    open.push({ kind: K.name, from, to, depth, y: t.y });
    if (reduced() || !t.el.isConnected || F.shown(t.el) < K.minShown) return plain(fl);
    const O = K.read(t.el);
    const g = capture(screen, { live: true }); takeGhost();
    if (!g) return plain(fl);
    // the old page stays under the new one while it steps aside
    g.style.zIndex = '';
    screen.before(g);
    t.el.style.visibility = 'hidden';
    pending = { kind: K.name, dir: 'open', O, ghost: g };
    return plain(fl, 'shared-open');
  }
  // a close: the page on show is the last one opened, and the address is the page it opened from
  const top = open[open.length - 1];
  if (top && from === top.to && to === top.from) {
    open.pop();
    scrollBack = top.y;
    if (reduced()) return plain(fl);
    const p = KINDS[top.kind].readClose(screen);
    if (!p) return plain(fl);
    // the page's own elements, so nothing on it is decoded again; the plain back plays them if what it closes into
    // is not on screen when the page under it is drawn
    capture(screen, { live: true });
    pending = { ...p, kind: top.kind, dir: 'close', entry: top, fl, pose, y: window.scrollY };
    return 'shared-close';
  }
  // anything else forgets what it has left: a page shallower than it, the bottom of a tab, or another page of the
  // same kind (another room). Deeper keeps it, so coming back still closes into what opened it.
  const name = to.split('/')[0];
  while (open.length) {
    const e = open[open.length - 1];
    if (e.depth > depth || depth === 0 || (e.to.split('/')[0] === name && e.to !== to)) open.pop(); else break;
  }
  return plain(fl);
}
// Not one of these: a finger that was waiting gets the plain back.
function plain(fl, word = null) { if (fl) fl.plain(); return word; }

// Called by the redraw once the new page is drawn (and scrolled back), in place of motion.arrive().
export function arrive(how, screen) {
  const p = pending; pending = null;
  if (how === 'still') return;
  if (how === 'shared-open' && p && p.dir === 'open') {
    const run = F.begin(F.OPEN.dur);
    run.undo(() => p.ghost.remove());
    if (KINDS[p.kind].open(p, screen, run) === false) { F.finish(); stagger(screen); return; }
    F.go(run, run.hold || F.OPEN.dur + 50);
    return;
  }
  if (how === 'shared-close' && p && p.dir === 'close') {
    const K = KINDS[p.kind];
    const src = K.find(screen, p.entry);
    if (src && F.shown(src) >= 0.5) {
      const g = takeGhost();
      if (g) {
        // the page closing stays over the one under it until it has gone into what opened it
        g.style.zIndex = '';
        screen.after(g);
        const O = K.read(src);
        src.style.visibility = 'hidden';
        if (p.fl) F.followNext(p.fl);
        const run = F.begin(F.CLOSE.dur);
        run.undo(() => g.remove(), () => { src.style.visibility = ''; });
        if (K.close(p, screen, run, { ghost: g, O, el: src }) !== false) {
          if (p.fl) p.fl.closing(p);
          // a page let go by a back swipe starts shrunk where the finger left it and comes back to full size as it
          // closes, and the page under it comes up with it
          if (p.pose) {
            run.core(g, p.pose.from(g), { duration: F.CLOSE.dur, easing: F.CLOSE.ease, fill: 'forwards' });
            p.pose.handed(screen, g, { dur: F.CLOSE.dur, ease: F.CLOSE.ease });
            // the dark the page underneath comes up from lies on that page alone: straight over it, under all that
            // closes (at z-index 1 it lay over the closing page too, which darkened as the finger let go)
            for (const n of p.pose.parts) { n.style.zIndex = ''; screen.after(n); }
          }
          F.go(run, run.hold || F.CLOSE.dur + 50);
          return;
        }
        F.dropFollower();
        F.finish();
        if (p.fl) p.fl.plain();
        return;
      }
    }
    if (p.fl) p.fl.plain();
    // what it closes into is not on screen: a page a back swipe let go slides off as the swipe does elsewhere
    if (p.pose) { p.pose.plain(screen, takeGhost()); return; }
  }
  plainArrive(how === 'shared-close' ? 'back' : 'push', screen);
}

// ---------- following a finger ----------
export function canFollow() {
  const top = open[open.length - 1];
  return !!top && !reduced() && !F.flying() && location.hash.replace(/^#/, '') === top.to;
}
export function followBack() {
  if (!canFollow()) return null;
  let run = null, at = 0, state = 'held', page = null, tween = 0;
  const ctl = {
    // flight.js hands over the close once it is built, held at its start
    take(f) {
      run = f; F.hold(f);
      if (state === 'commit') { F.seek(f, at); F.resume(f, at); } else if (state === 'cancel') back(); else F.seek(f, at);
    },
    closing(p) { page = p; },
    plain() {
      run = null; page = null;
      if (state === 'cancel') history.forward();
      state = 'plain';
    },
    progress(p) {
      if (state !== 'held') return;
      at = Math.max(0, Math.min(1, Number(p) || 0)) * F.CLOSE.dur;
      if (run) F.seek(run, at);
    },
    commit() {
      if (state !== 'held') return;
      state = 'commit';
      if (run) F.resume(run, at);
    },
    cancel() {
      if (state !== 'held') return;
      state = 'cancel';
      if (run) back();
    },
  };
  // The close runs back to its start over the time it took to get there (at most 0.25 s), then the page is put back
  // at its place in the history. The held close stays on screen until the page is drawn again in the same moment.
  function back() {
    const f = run, from = at, t0 = performance.now(), dur = Math.min(250, Math.max(60, from * 0.6));
    const step = now => {
      if (F.current() !== f) return;
      const k = Math.min(1, (now - t0) / dur);
      at = from * (1 - (1 - Math.pow(1 - k, 3)));
      F.seek(f, at);
      if (k < 1) { tween = requestAnimationFrame(step); return; }
      returning = { entry: page.entry, y: page.y };
      history.forward();
    };
    cancelAnimationFrame(tween);
    tween = requestAnimationFrame(step);
  }
  armed = ctl;
  history.back();
  return ctl;
}
