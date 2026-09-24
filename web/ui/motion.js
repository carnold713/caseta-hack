// Motion, as the Figma file animates it: the "M · Motion principles" board (12761:76) and the seven worked
// interactions beside it, M1 to M7, read with get_motion_context. The durations and curves are the file's; the
// tokens in tokens.css carry them to the CSS, and this module does what CSS cannot do alone in an app that draws
// each screen whole from its state:
//
//   carry     a redraw replaces the elements, so a CSS transition never sees a "before". Each redraw is paired
//             with the one before it element by element, and what an element's own `transition` names is played
//             from the old value to the new. Every transition in the stylesheets works through this.
//   crossfade what cannot be interpolated (a copper gradient, a line of words) fades from a copy of the old over
//             the new: the dimmer 0.4 s for one light, the scene 1.0 s while a scene arrives (M2, M3).
//   push      a new page comes in from +24 px with a fade while the old one drifts -24 px and fades, 0.3 s; going
//             back runs it the other way (M4).
//   stagger   a screen's blocks arriving on load: fade from 0 and rise 12 px, 0.32 s, 0.04 s apart (M4).
//   sheetOut  a sheet drops in 0.28 s EASE_IN while the scrim fades (M1).
//   leave     anything leaving goes in 0.2 s EASE_IN, faster than it came (the toast, the offline card).
//
// "User actions land now. Things the app decides happen slowly. Nothing ever slides colour." Nothing here runs when
// the phone asks for reduced motion.
import { freeze } from '/ui/header.js';

export const T = {
  tap: 120, standard: 240, enter: 320, exit: 200, stagger: 40, sheetIn: 420, sheetOut: 280, push: 300, dimmer: 400,
  scene: 1000, breathe: 1600,
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',   // CUSTOM_CUBIC_BEZIER {0.2, 0.8, 0.2, 1}, "standard"
  easeIn: 'ease-in',                          // EASE_IN, every exit
  easeBoth: 'ease-in-out',                    // EASE_IN_AND_OUT: the dimmer, the scene, the breathing dot
};

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reduced = () => !!(mq && mq.matches);
const canAnimate = el => el && typeof el.animate === 'function';

// ---------- busy: a redraw from the socket waits while something is arriving ----------
// A tap redraws at once (and may cut an entrance short); a state message from the bridge waits for the entrance
// to finish, so the stagger is not redrawn out from under itself.
let busyUntil = 0;
export const busyFor = () => Math.max(0, busyUntil - performance.now());
const hold = ms => { busyUntil = Math.max(busyUntil, performance.now() + ms); };
// the same, for a transition that plays itself (a room opening, roomopen.js)
export const holdFor = hold;

// ---------- carry ----------
// The path of an element is its chain of child indexes from the root, with its tag. Two redraws of the same state
// give the same paths, so an element is paired with the one that stood in its place.
const TRACKED = ['opacity', 'transform', 'left', 'top', 'width', 'height', 'background-color', 'color', 'border-color', 'box-shadow', 'stroke-dashoffset'];
const hasTransition = new Map();   // tag + class + pressed state -> whether it declares any transition at all
function walk(root, fn) {
  const go = (el, path) => {
    if (el.classList.contains('xf-old')) return;   // a fading copy is carried by its element, not paired itself
    fn(el, path);
    let i = 0;
    for (const k of el.children) go(k, `${path}/${i++}${k.tagName}`);
  };
  let i = 0;
  for (const k of root.children) go(k, `${i++}${k.tagName}`);
}
function sig(el) { return `${el.tagName}.${el.getAttribute('class') || ''}.${el.getAttribute('aria-pressed') || ''}.${el.getAttribute('aria-selected') || ''}`; }
function timings(cs) {
  const props = cs.transitionProperty.split(',').map(s => s.trim());
  const durs = cs.transitionDuration.split(',').map(s => parseFloat(s) * (s.includes('ms') ? 1 : 1000));
  const eases = splitTop(cs.transitionTimingFunction);
  const delays = cs.transitionDelay.split(',').map(s => parseFloat(s) * (s.includes('ms') ? 1 : 1000));
  const out = {};
  props.forEach((p, i) => {
    const d = durs[i % durs.length]; if (!d) return;
    const list = p === 'all' ? TRACKED : TRACKED.includes(p) ? [p] : p === 'background' ? ['background-color'] : [];
    for (const q of list) out[q] = { d, e: eases[i % eases.length] || 'ease', delay: delays[i % delays.length] || 0 };
  });
  return out;
}
// split "linear(0, .3 8%), ease" on the commas that are not inside brackets
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const camel = p => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Before a redraw: what every transitioning element (and ::before / ::after, where a toggle's knob lives) looks
// like now, and the element itself where it crossfades.
const PSEUDO = ['', '::before', '::after'];
// animations this module started (not the stylesheet's own loops) that are still playing, by element
function playing(root) {
  const m = new Map();
  if (typeof document.getAnimations !== 'function') return m;
  const css = a => (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) || (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition);
  for (const a of document.getAnimations()) {
    if (css(a) || a.playState === 'finished' || a.playState === 'idle') continue;
    const t = a.effect && a.effect.target;
    if (!t || !root.contains(t) || t.closest('.xf-old')) continue;
    if (!m.has(t)) m.set(t, []);
    m.get(t).push(a);
  }
  return m;
}
export function snap(root) {
  if (!root || reduced()) return null;
  const s = new Map();
  const run = playing(root);
  walk(root, (el, path) => {
    const key = sig(el);
    const xf = el.hasAttribute('data-xf');
    const rec = { tag: el.tagName, act: el.getAttribute('data-act') || el.getAttribute('data-go') || '' };
    let any = false;
    if (run.has(el)) { rec.run = run.get(el); any = true; }
    const copies = [...el.children].filter(k => k.classList.contains('xf-old'));
    if (copies.length) { rec.copies = copies; any = true; }
    for (const ps of PSEUDO) {
      const k = key + ps;
      let known = hasTransition.get(k);
      if (known === false) continue;
      const cs = getComputedStyle(el, ps || null);
      if (known === undefined) { known = cs.transitionDuration.split(',').some(d => parseFloat(d) > 0); hasTransition.set(k, known); if (!known) continue; }
      const t = timings(cs); const v = {};
      for (const p in t) v[p] = cs.getPropertyValue(p);
      (rec.v || (rec.v = {}))[ps] = v; any = true;
    }
    if (xf) { rec.xf = el.getAttribute('data-xf') || ''; rec.look = look(el); rec.copy = frozen(el); rec.size = sizeOf(el); any = true; }
    if (el.hasAttribute('data-enter')) { rec.enter = el.getAttribute('data-enter') || 'rise'; rec.node = el; rec.rect = el.getBoundingClientRect(); any = true; }
    if (any) s.set(path, rec);
  });
  return s;
}
// An element's own laid out size (not as a press or a flight has it scaled) and where its edges were on screen, so a
// copy of it can keep its words laid out exactly as they were. An inline element has no size of its own: its box on
// screen stands in, and if its words made one line, its copy (taken out of the line) must not wrap where it never did.
function sizeOf(el) {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const w = parseFloat(cs.width), h = parseFloat(cs.height);
  const inline = cs.display === 'inline';
  return { w: Number.isFinite(w) && !inline ? w : r.width, h: Number.isFinite(h) && !inline ? h : r.height, left: r.left, right: r.right, oneLine: inline && el.getClientRects().length === 1 };
}
// A copy of an element to fade out, taken while it is still on the page, with the type and ink of every part of it
// written onto the copy. The copy fades inside the new element, where a rule that set its words through an ancestor
// no longer reaches it: the Nightstand's line under its title is 14 while the lamp is on (.ns-area.on), and laid in
// the new, unlit area at 16 it went to two lines as it faded.
const FROZEN = ['font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing', 'color', 'white-space', 'text-align', 'text-transform'];
function frozen(el) {
  const c = el.cloneNode(true);
  const from = [el, ...el.querySelectorAll('*')], to = [c, ...c.querySelectorAll('*')];
  from.forEach((f, i) => {
    if (f.classList.contains('xf-old') || f.closest('.xf-old') || !to[i] || !to[i].style) return;
    const cs = getComputedStyle(f);
    for (const p of FROZEN) to[i].style.setProperty(p, cs.getPropertyValue(p));
  });
  return c;
}
// the parts of an element that make it look different: its classes, inline style and words
// (a copy still fading inside it is not part of its look)
function look(el) {
  let t = el;
  if (el.querySelector('.xf-old')) { t = el.cloneNode(true); t.querySelectorAll('.xf-old').forEach(n => n.remove()); }
  return `${el.getAttribute('class')}|${el.getAttribute('style') || ''}|${t.textContent.replace(/\s+/g, ' ')}`;
}

// After it: play each element's own transitions from where it was, and crossfade what changed look.
export function carry(s, root) {
  if (!s || reduced()) return;
  const fades = [], seen = new Set(), made = new Map();
  walk(root, (el, path) => {
    made.set(path, el);
    const rec = s.get(path);
    const entering = el.hasAttribute('data-enter');
    if (!rec || rec.tag !== el.tagName) { if (entering) enter(el); return; }
    const act = el.getAttribute('data-act') || el.getAttribute('data-go') || '';
    if (rec.act !== act) { if (entering) enter(el); return; }
    if (entering) { if (rec.enter) seen.add(path); else enter(el); }
    // what was still moving on the old element goes on moving on the new one, from where it had got to
    const moving = new Set();
    if (rec.run && canAnimate(el)) {
      for (const a of rec.run) {
        const e = a.effect; const opts = { ...e.getTiming(), composite: e.composite };
        if (e.pseudoElement) opts.pseudoElement = e.pseudoElement;
        const kf = e.getKeyframes();
        try { const n = el.animate(kf, opts); n.currentTime = a.currentTime; } catch (_) { continue; }
        for (const k of kf) for (const p in k) moving.add((e.pseudoElement || '') + p.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
      }
    }
    if (rec.copies) { if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; for (const k of rec.copies) el.appendChild(k); }
    if (rec.v && canAnimate(el)) {
      for (const ps in rec.v) {
        const cs = getComputedStyle(el, ps || null);
        const t = timings(cs), was = rec.v[ps];
        for (const p in t) {
          if (!(p in was) || moving.has(ps + p)) continue;
          const now = cs.getPropertyValue(p);
          if (now === was[p] || !was[p]) continue;
          const opts = { duration: t[p].d, easing: t[p].e, delay: t[p].delay };
          if (ps) opts.pseudoElement = ps;
          try { el.animate([{ [camel(p)]: was[p] }, { [camel(p)]: now }], opts); } catch (_) { /* a browser without pseudo-element animation */ }
        }
      }
    }
    if (rec.copy && rec.look !== look(el)) fades.push([rec, el]);
  });
  for (const [rec, el] of fades) crossfade(rec.copy, el, rec.xf, rec.size);
  // what came in with data-enter and is gone now leaves the way it came
  for (const [path, rec] of s) if (rec.enter && !seen.has(path)) gone(rec, path, made);
}

// ---------- coming and going ----------
// data-enter on an element says how it arrives when a redraw first draws it (and not on every redraw after):
//   rise   fade from 0 and rise 12 px, 0.32 s standard (the default). data-enter-i staggers it 0.04 s a step.
//   drop   the offline card: it opens its own room (the content below moves down 0.24 s standard) and comes
//          down 12 px as it fades in, 0.32 s (M5)
//   sheet  a card that slides up like a sheet: 360 px on the GENTLE spring, fading in 0.24 s (M7's result card)
//   ping   one ring going out from what was just heard: scale 1 to 1.7 and gone, 0.4 s ease-out (M7)
const GENTLE = 'linear(0, 0.0188, 0.0679, 0.1374, 0.2195, 0.308, 0.3978, 0.4856, 0.5686, 0.6452, 0.7142, 0.7753, 0.8283, 0.8735, 0.9113, 0.9423, 0.9671, 0.9866, 1.0014, 1.0123, 1.0198, 1.0247, 1.0274, 1.0283, 1.0281, 1.0268, 1.025, 1.0227, 1.0202, 1.0177, 1.0152, 1.0128, 1.0106, 1.0085, 1.0068, 1.0052, 1.0039, 1.0028, 1.0018, 1.0011, 1.0005, 1, 0.9997, 0.9995, 0.9993, 0.9992, 0.9992, 0.9992, 0.9992, 0.9993, 0.9993)';
export function enter(el) {
  if (reduced() || !canAnimate(el)) return;
  const kind = el.getAttribute('data-enter') || 'rise';
  const delay = (Number(el.getAttribute('data-enter-at')) || 0) + (Number(el.getAttribute('data-enter-i')) || 0) * T.stagger;
  if (kind === 'ping') {
    el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.7)' }], { duration: 400, easing: 'ease-out', delay });
    return;
  }
  if (kind === 'sheet') {
    el.animate([{ transform: 'translateY(360px)' }, { transform: 'translateY(0)' }], { duration: T.sheetIn, easing: GENTLE, delay, composite: 'add' });
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.standard, easing: T.ease, delay, fill: 'backwards' });
    return;
  }
  if (kind === 'drop') {
    const cs = getComputedStyle(el);
    const mt = parseFloat(cs.marginTop) || 0, mb = parseFloat(cs.marginBottom) || 0;
    el.animate([{ marginBottom: `${-(mt + el.offsetHeight)}px` }, { marginBottom: `${mb}px` }], { duration: T.standard, easing: T.ease, delay });
    el.animate([{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: T.enter, easing: T.ease, delay: delay + 100, fill: 'backwards' });
    return;
  }
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.enter, easing: T.ease, delay, fill: 'backwards' });
  el.animate([{ transform: 'translateY(12px)' }, { transform: 'translateY(0)' }], { duration: T.enter, easing: T.ease, delay, fill: 'backwards', composite: 'add' });
}
// Leaving, 0.2 s EASE_IN: a copy where it stood fades back the way it came. A dropped card also gives its room
// back: what now stands where it stood rises into place.
function gone(rec, path, made) {
  const r = rec.rect; if (!r || !r.width) return;
  const g = rec.node.cloneNode(true);
  g.removeAttribute('data-enter'); g.setAttribute('aria-hidden', 'true'); g.inert = true;
  g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  Object.assign(g.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', pointerEvents: 'none', zIndex: '2' });
  document.body.appendChild(g);
  const dy = rec.enter === 'drop' ? -12 : 12;
  g.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: `translateY(${dy}px)` }], { duration: T.exit, easing: T.easeIn, fill: 'forwards' })
    .finished.catch(() => {}).then(() => g.remove());
  if (rec.enter !== 'drop') return;
  const cut = path.lastIndexOf('/');
  const parent = cut < 0 ? null : made.get(path.slice(0, cut));
  const at = Number((cut < 0 ? path : path.slice(cut + 1)).match(/^\d+/)[0]);
  const cs = getComputedStyle(rec.node.isConnected ? rec.node : g);
  const room = r.height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  const kids = parent ? [...parent.children].slice(at) : [];
  for (const k of kids) if (canAnimate(k)) k.animate([{ transform: `translateY(${room}px)` }, { transform: 'translateY(0)' }], { duration: T.exit, easing: T.easeIn, composite: 'add' });
}

// ---------- loops ----------
// A breathing dot or a sonar ring is drawn again with each redraw, which would start its loop over. Every loop is
// kept on the document's clock instead, so a redraw leaves it exactly where it was.
export function settle(root) {
  if (!root || typeof root.getAnimations !== 'function') return;
  for (const a of root.getAnimations({ subtree: true })) {
    const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
    if (t && t.iterations === Infinity && a.startTime !== 0) { try { a.startTime = 0; } catch (_) { /* fine */ } }
  }
}

// The old element laid over the new one and faded out: an old tile dissolving into the new, the way the file's
// "after" tiles fade in over the "before" ones. It sits inside the new element, so it scrolls and clips with it.
function crossfade(old, el, kind, was) {
  if (!canAnimate(el)) return;
  const dur = kind === 'standard' ? T.standard : document.body.classList.contains('scene-arriving') ? T.scene : T.dimmer;
  const ease = kind === 'standard' ? T.ease : T.easeBoth;
  const copy = old.cloneNode(true);
  copy.querySelectorAll('.xf-old').forEach(n => n.remove());
  copy.removeAttribute('data-xf'); copy.removeAttribute('data-go'); copy.removeAttribute('data-act'); copy.removeAttribute('role');
  copy.querySelectorAll('[data-act],[data-go],[id]').forEach(n => { n.removeAttribute('data-act'); n.removeAttribute('data-go'); if (!n.closest('.rs-svg')) n.removeAttribute('id'); });
  copy.setAttribute('aria-hidden', 'true'); copy.inert = true;
  copy.classList.add('xf-old');
  const fade = () => copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: ease, fill: 'forwards' }).finished
    .catch(() => {}).then(() => copy.remove());
  // an image holds nothing inside it: its old self goes beside it, placed by the same rules
  if (/^(IMG|INPUT|SVG)$/i.test(el.tagName)) { copy.style.pointerEvents = 'none'; el.after(copy); fade(); return; }
  const box = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const now = sizeOf(el);
  was = was || now;
  // The copy keeps its own look and its own size, so its words stay on the lines they were on: a longer status laid
  // into the new, shorter one's box would wrap onto a second line as it faded. It sits on the new element's box,
  // from the left, or from the right for words set against the right (a count that changes length there).
  let left = -parseFloat(cs.borderLeftWidth) || 0;
  if (Math.abs(was.right - box.right) < 1 && Math.abs(was.left - box.left) >= 1) left += now.w - was.w;
  Object.assign(copy.style, {
    position: 'absolute', left: `${left}px`, top: `${-parseFloat(cs.borderTopWidth) || 0}px`,
    width: `${was.w}px`, height: `${was.h}px`, margin: '0', pointerEvents: 'none', zIndex: '3',
    transform: 'none', animation: 'none',
  });
  if (was.oneLine) copy.style.whiteSpace = 'nowrap';
  if (cs.position === 'static') el.style.position = 'relative';
  el.appendChild(copy);
  fade();
}

// ---------- push, back and load ----------
// Before the page changes: a copy of it where it stood, to drift away while the new one comes in.
// `live` moves the page's own elements into the ghost instead of copying them, for a transition that animates
// the old page's parts one by one (a room opening): a photograph already on screen is never decoded again, so it
// cannot blink. The page is about to be drawn over anyway, so nothing is lost by taking them. What is taken no
// longer answers taps or selectors: its ids and its data-go and data-act are dropped.
let ghost = null;
export function capture(screen, { live = false } = {}) {
  dropGhost();
  if (reduced() || !screen || !screen.firstElementChild) return null;
  const box = screen.getBoundingClientRect();
  const g = document.createElement('div');
  g.className = 'page-ghost'; g.setAttribute('aria-hidden', 'true'); g.inert = true;
  // its header stays where the page's was stuck, as collapsed as it was (header.js)
  freeze(g);
  // the page's own layout width, not its box on screen: a page caught mid-slide or mid-press measures the same, and
  // its words wrap in the copy exactly as they did on the page
  const w = parseFloat(getComputedStyle(screen).width) || box.width;
  Object.assign(g.style, { position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${w}px`, pointerEvents: 'none', zIndex: '1' });
  for (const k of [...screen.children]) g.appendChild(live ? k : k.cloneNode(true));
  // an illustration's gradient ids stay (they are made fresh on every draw, so they never collide): without them its
  // shapes would lose their fills while it animates
  g.querySelectorAll('[id]').forEach(n => { if (!n.closest('.rs-svg')) n.removeAttribute('id'); });
  if (live) g.querySelectorAll('[data-go], [data-act]').forEach(n => { n.removeAttribute('data-go'); n.removeAttribute('data-act'); });
  ghost = g;
  return g;
}
function dropGhost() { if (ghost) { ghost.remove(); ghost = null; } }
// A transition that plays the ghost itself takes it, so the next arrival does not play it too.
export function takeGhost() { const g = ghost; ghost = null; return g; }

// 'push' (deeper), 'back' (out again) or 'load' (a tab, or the app opening).
export function arrive(kind, screen) {
  const g = ghost; ghost = null;
  if (reduced() || !screen) { if (g) g.remove(); return; }
  if (kind === 'load') { if (g) g.remove(); stagger(screen); return; }
  const dir = kind === 'back' ? -1 : 1;
  if (g) {
    document.body.appendChild(g);
    g.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-24 * dir}px)` }],
      { duration: T.push, easing: T.ease, fill: 'forwards' }).finished.catch(() => {}).then(() => g.remove());
  }
  if (canAnimate(screen)) screen.animate([{ opacity: 0, transform: `translateX(${24 * dir}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: T.push, easing: T.ease });
  hold(T.push);
}

// A screen's blocks in the order they read, each a step 0.04 s after the last: the header as one (M4's title and
// its + button arrive together), then each block, one level into a list or a grid. Only what is on screen, and
// at most ten steps: past that the rest arrive with the tenth.
const LISTS = '.tile-strip, .tile-grid, .group, .chip-row, .chip-wrap, .rooms-list, .rm-list, .rt-list, .cards';
export function stagger(screen) {
  if (reduced() || !screen) return;
  const page = screen.firstElementChild; if (!page) return;
  const steps = [];
  const vh = innerHeight;
  const shown = el => {
    if (!canAnimate(el)) return false;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.display === 'none') return false;
    const b = el.getBoundingClientRect();
    return b.height > 0 && b.top <= vh;
  };
  for (const el of page.children) {
    if (el.matches('header, .hdr, .home-head')) { const g = [...el.children].filter(shown); if (g.length) steps.push(g); continue; }
    if (el.matches(LISTS)) { for (const k of el.children) if (shown(k)) steps.push([k]); continue; }
    if (shown(el)) steps.push([el]);
  }
  const n = Math.min(steps.length, 10);
  steps.forEach((g, i) => {
    const delay = Math.min(i, n - 1) * T.stagger;
    for (const el of g) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.enter, easing: T.ease, delay, fill: 'backwards' });
      // added to whatever transform the element already has (a centred toast, a scaled tile)
      el.animate([{ transform: 'translateY(12px)' }, { transform: 'translateY(0)' }], { duration: T.enter, easing: T.ease, delay, fill: 'backwards', composite: 'add' });
    }
  });
  hold(T.enter + (n - 1) * T.stagger);
}

// ---------- sheets and things leaving ----------
// A sheet drops (0.28 s EASE_IN) and its scrim fades. The copy falls; the real sheet is already gone, so nothing
// can be tapped on it on the way down.
export function sheetOut(root) {
  if (reduced() || !root || root.hidden || !root.firstElementChild) return;
  const g = document.createElement('div');
  g.className = 'sheet-ghost'; g.setAttribute('aria-hidden', 'true'); g.inert = true;
  for (const k of root.children) g.appendChild(k.cloneNode(true));
  g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  document.body.appendChild(g);
  const sheet = g.querySelector('.sheet'), scrim = g.querySelector('.scrim');
  // a sheet scrolled down falls as it was, not jumped back to its top
  const was = root.querySelector('.sheet');
  if (sheet && was) sheet.scrollTop = was.scrollTop;
  const opts = { duration: T.sheetOut, easing: T.easeIn, fill: 'forwards' };
  const runs = [];
  if (sheet) runs.push(sheet.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], opts).finished);
  if (scrim) runs.push(scrim.animate([{ opacity: 1 }, { opacity: 0 }], opts).finished);
  Promise.all(runs).catch(() => {}).then(() => g.remove());
}

// Anything leaving: fade and drop back the way it came, 0.2 s EASE_IN, then gone.
export function leave(el, dy = 12) {
  if (reduced() || !canAnimate(el) || !el.isConnected) { if (el) el.remove(); return; }
  const g = el.cloneNode(true);
  g.removeAttribute('id'); g.setAttribute('aria-hidden', 'true'); g.inert = true;
  el.replaceWith(g);
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.exit, easing: T.easeIn, fill: 'forwards' });
  g.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${dy}px)` }], { duration: T.exit, easing: T.easeIn, fill: 'forwards', composite: 'add' })
    .finished.catch(() => {}).then(() => g.remove());
}

// ---------- a scene arriving ----------
// For as long as the bridge takes to report every light of a scene, a tile's crossfade is the scene's 1.0 s, not
// one light's 0.4 s (M3): "every affected light crossfades together".
let sceneTimer = 0;
export function sceneArriving(ms = 2500) {
  document.body.classList.add('scene-arriving');
  clearTimeout(sceneTimer);
  sceneTimer = setTimeout(() => document.body.classList.remove('scene-arriving'), ms);
}
