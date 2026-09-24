// The machinery shared by every page that opens out of the thing tapped to reach it (the owner's frames M10, a room
// card into its room; M11, a tile into its light; M14, a remote's card into its page) and closes back into it. Each
// of those is a small module (roomopen.js, lightopen.js, remoteopen.js) that knows its own two pages; opening.js
// decides which one plays. What is the same for all of them is here:
//
//   the run      every animation of one transition, so it lands as one (the busy, landed and redraw guard), can be
//                jumped to its end, and can be held and moved by a finger (Android's predictive back) as well as
//                played. begin() starts one; core() and extra() add to it; go() plays it.
//   the window   an element of the new page moved and scaled onto the thing tapped and clipped to its box with
//                clip-path, then let go: it opens where the thing was into where it rests (windowGeo).
//   the words    a line of words on the thing tapped flies to its place on the new page, matched on the width of
//                the words, and the two cross only at the small end, where the change of weight cannot be seen
//                (pair). A drawing flies the same way.
//   aside        the rest of the old page steps out of the way around the thing tapped, nearest first: what is
//                above goes up, what is below goes down, what is beside goes sideways, fading and settling to 0.96.
//   arrive       the new page's controls rise in, in reading order, on the standard curve.
//
// Transforms, opacity and clip-path only. Everything is measured before anything is written.
import { T, holdFor } from '/ui/motion.js';

export const OPEN = { dur: 550, ease: 'cubic-bezier(0.2, 0, 0, 1)' };
export const CLOSE = { dur: 450, ease: 'cubic-bezier(0.4, 0, 0.2, 1)' };
export const CROSS = 150;   // words cross from one weight to the other only in this much, at the small end

// ---------- the run ----------
let run = null;         // the transition playing: { dur, until, anims, all, undos }
let redraw = null;      // a redraw that came while it played, for when it lands
let follower = null;    // a finger that will hold the next run and move it (opening.followBack)

// Start a run of `dur` ms. The run is what core() and extra() add to; go() plays it once it is built.
export function begin(dur) {
  const f = { dur, until: performance.now() + dur, anims: [], all: [], undos: [], held: false };
  // part of the run: it lands when every one of these has finished
  f.core = (node, kf, o) => { if (!node) return null; const a = node.animate(kf, o); f.anims.push(a); f.all.push(a); return a; };
  // plays with the run and follows a finger with it, but may go on after it has landed (a page's controls arriving)
  f.extra = (node, kf, o) => { if (!node) return null; const a = node.animate(kf, o); f.all.push(a); return a; };
  // what puts things back as they were once it has landed (or been jumped to its end)
  f.undo = (...fns) => f.undos.push(...fns);
  run = f;
  return f;
}
// Play a run that has been built. `hold` keeps socket redraws back for as long as its page is still arriving.
export function go(f, hold = f.dur + 50) {
  holdFor(hold);
  Promise.all(f.anims.map(a => a.finished)).then(() => landed(f), () => {});
  const fl = follower; follower = null;
  if (fl && run === f) fl.take(f);
}
// A run that a finger will move: the next begin()..go() is held at its start and handed to it.
export function followNext(fl) { follower = fl; }
export function dropFollower() { const fl = follower; follower = null; return fl; }
// Where a held run is, in ms of the run, and letting it play on from there.
export function seek(f, t) { for (const a of f.all) { try { a.currentTime = Math.max(0, t); } catch (_) { /* gone */ } } }
export function hold(f) { f.held = true; f.until = Infinity; for (const a of f.all) { try { a.pause(); } catch (_) { /* gone */ } } seek(f, 0); }
export function resume(f, t) {
  f.held = false;
  f.until = performance.now() + Math.max(0, f.dur - t);
  holdFor(Math.max(0, f.dur - t) + 50);
  // one already past its end is finished where it is (play() would start it over)
  for (const a of f.all) {
    try { if (a.currentTime >= a.effect.getComputedTiming().endTime) a.finish(); else a.play(); } catch (_) { /* gone */ }
  }
}

export const current = () => run;
export const flying = () => !!run;
export const busyUntil = () => (run ? run.until : 0);
// A redraw while a run plays would pull the page out from under it, so it waits for the run to land (at most half a
// second later; a run a finger holds lands when the finger lets go).
export function whenLanded(fn) { redraw = fn; }
function landed(f) {
  if (run !== f) return;
  run = null;
  for (const u of f.undos.splice(0)) { try { u(); } catch (_) { /* already gone */ } }
  const r = redraw; redraw = null;
  if (r) r();
}
// Jump whatever is playing to its end, cleanly: the new page as it rests and nothing of the old one. Called when the
// address changes again mid flight, so the redraw that follows is the new page's own.
export function finish() {
  const f = run; if (!f) return;
  run = null; redraw = null;
  for (const a of f.all) { try { a.cancel(); } catch (_) { /* already gone */ } }
  for (const u of f.undos.splice(0)) { try { u(); } catch (_) { /* already gone */ } }
}
// The timing of something at the end of a run that closes: it runs over the last `dur` of it.
export const last = (dur, extra = {}) => ({ duration: dur, delay: CLOSE.dur - dur, easing: 'linear', fill: 'both', ...extra });

// ---------- measuring ----------
// How much of an element's height is on screen, 0 to 1.
export function shown(el) {
  const b = el.getBoundingClientRect();
  if (!b.height) return 0;
  return Math.max(0, Math.min(b.bottom, innerHeight) - Math.max(b.top, 0)) / b.height;
}
// The words of a title as they sit in it: a block title is wider than its words, and it is the words that fly.
export function textBox(el) {
  const b = el.getBoundingClientRect();
  const rg = document.createRange(); rg.selectNodeContents(el);
  const t = rg.getBoundingClientRect();
  const w = Math.min(t.width || b.width, b.width);
  return { left: t.width ? t.left : b.left, top: b.top, width: w, height: b.height };
}
export const centre = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
export const px = n => `${Math.round(n * 100) / 100}px`;
export const opacityOf = el => (el ? Number(getComputedStyle(el).opacity) : 0);
// A part of the thing tapped, by its box less the press it is part way through (offsetWidth would round it, and a
// line of words cut short by a pixel ends in an ellipsis).
export function part(el, k) { if (!el) return null; const r = el.getBoundingClientRect(); return { el, r, w: r.width / k, h: r.height / k }; }
// The words in a line, as a part: where the words are (a block is often wider), cut to the block as its ellipsis is.
// Words that wrap onto a second line are the block itself, so a copy of them can be laid out line for line as they
// rest (copyText).
export function words(el, k) {
  if (!el) return null;
  const rg = document.createRange(); rg.selectNodeContents(el);
  const b = el.getBoundingClientRect(), t = rg.getBoundingClientRect();
  if (!t.width) return null;
  const rs = [...rg.getClientRects()].filter(x => x.width > 0);
  if (rs.some(x => x.top - rs[0].top > x.height / 2)) return { el, r: b, w: b.width / k, h: b.height / k, text: el.textContent, lines: true };
  const left = Math.max(t.left, b.left), right = Math.min(t.right, b.right);
  const r = { left, top: b.top, width: right - left, height: b.height, right, bottom: b.bottom };
  return { el, r, w: r.width / k, h: r.height / k, text: el.textContent };
}
// The boxes of every character of a line, read once (a line read later may have moved, or let go of its press), so
// any run of its words can be made a part afterwards with `span`.
export function chars(el, k) {
  const node = el && [...el.childNodes].find(n => n.nodeType === 3);
  if (!node) return null;
  const rg = document.createRange();
  const box = el.getBoundingClientRect();
  const at = [];
  for (let i = 0; i < node.length; i++) { rg.setStart(node, i); rg.setEnd(node, i + 1); const r = rg.getBoundingClientRect(); at.push({ l: r.left, r: r.right }); }
  return { el, text: node.data, at, box, k };
}
export function span(C, from, to) {
  if (!C || from >= to) return null;
  const left = Math.max(C.at[from].l, C.box.left), right = Math.min(C.at[to - 1].r, C.box.right);
  if (right <= left) return null;
  const r = { left, top: C.box.top, width: right - left, height: C.box.height, right, bottom: C.box.bottom };
  return { el: C.el, r, w: r.width / C.k, h: r.height / C.k, text: C.text.slice(from, to) };
}

// ---------- building ----------
export const el = (cls, style = {}) => { const d = document.createElement('div'); d.className = cls; d.setAttribute('aria-hidden', 'true'); Object.assign(d.style, { pointerEvents: 'none', ...style }); return d; };
// A copy of a line of words from the thing tapped, with its look, standing where it stood (at its press scale).
export function copyText(p, k) {
  const cs = getComputedStyle(p.el);
  const s = document.createElement('span');
  s.textContent = p.text != null ? p.text : p.el.textContent;
  for (const q of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'textOverflow', 'overflow']) s.style[q] = cs[q];
  // words on more than one line keep their block's own width and wrapping, and its ellipsis after the last line, so
  // the copy breaks exactly where they do and never becomes one line in flight
  if (p.lines) {
    for (const q of ['webkitBoxOrient', 'webkitLineClamp', 'whiteSpace', 'overflowWrap', 'wordBreak', 'textAlign']) s.style[q] = cs[q];
    // a clamped block reads back as flow-root, and only a -webkit-box draws the clamp's ellipsis
    s.style.display = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' ? '-webkit-box' : cs.display;
    return pin(s, p, k);
  }
  // one line, as it was: a copy is never narrower than the words it carries
  s.style.whiteSpace = 'nowrap';
  const node = pin(s, p, k);
  node.style.width = px(p.w + 0.5);
  return node;
}
export function copyButton(p, k) {
  const cs = getComputedStyle(p.el);
  const b = p.el.cloneNode(true);
  b.removeAttribute('data-act'); b.removeAttribute('data-id'); b.removeAttribute('aria-label'); b.removeAttribute('class');
  for (const q of ['display', 'placeItems', 'backgroundColor', 'color', 'borderRadius', 'boxShadow', 'border', 'padding']) b.style[q] = cs[q];
  return pin(b, p, k);
}
// Any other copy (a drawing, a fan's dots of speed): the element itself, cloned with the look its stylesheet gives it
// written onto it and every part of it, since the copy stands outside what styled it, and stood where it was.
const LOOK = ['display', 'position', 'left', 'top', 'right', 'bottom', 'width', 'height', 'gap', 'alignItems', 'justifyContent', 'placeItems',
  'padding', 'border', 'borderRadius', 'backgroundColor', 'backgroundImage', 'boxShadow', 'color', 'opacity', 'fontFamily', 'fontSize', 'fontWeight',
  'lineHeight', 'letterSpacing', 'textAlign', 'whiteSpace', 'textOverflow', 'overflow', 'transform'];
export function copyNode(p, k) {
  const c = p.el.cloneNode(true);
  const from = [p.el, ...p.el.querySelectorAll('*')], to = [c, ...c.querySelectorAll('*')];
  from.forEach((n, i) => {
    const cs = getComputedStyle(n), t = to[i];
    if (!t.style) return;
    for (const q of LOOK) t.style[q] = cs[q];
    t.removeAttribute('class'); t.removeAttribute('data-act'); t.removeAttribute('data-go'); t.removeAttribute('id');
  });
  c.style.position = 'absolute';
  return pin(c, p, k);
}
export function pin(node, p, k) {
  const c = centre(p.r);
  node.setAttribute('aria-hidden', 'true');
  Object.assign(node.style, {
    position: 'absolute', left: px(c.x - p.w / 2), top: px(c.y - p.h / 2), width: px(p.w), height: px(p.h),
    margin: '0', boxSizing: 'border-box', transformOrigin: '50% 50%', transform: `scale(${k})`, pointerEvents: 'none', transition: 'none',
  });
  node._c = c;
  return node;
}
// The layer over the new page for the copies, under the tab bar and its fade.
export function topLayer(after, cls) {
  const L = el(`${cls} op-top`, { position: 'fixed', inset: '0', overflow: 'hidden' });
  after.after(L);
  return L;
}

// ---------- the window ----------
// An element of the new page (box Hr, radius r1 at rest) moved and scaled so its middle sits on the thing tapped
// (box, pressed to k) and clipped to that box (radius r0 there). `loc` turns a point on screen, as the thing was, into
// the element's own coordinates.
export function windowGeo({ box, k }, Hr, r0, r1) {
  const W = Hr.width, H = Hr.height;
  const cardW = box.width / k, cardH = box.height / k;
  const iX = (W - cardW) / 2, iY = (H - cardH) / 2;
  const hc = centre(Hr), cc = centre(box);
  const dx = cc.x - hc.x, dy = cc.y - hc.y;
  const loc = (x, y) => ({ x: W / 2 + (x - cc.x) / k, y: H / 2 + (y - cc.y) / k });
  return {
    k, W, H, iX, iY, cardW, cardH, loc,
    shut: { transform: `translate(${px(dx)}, ${px(dy)}) scale(${k})`, clipPath: `inset(${px(iY)} ${px(iX)} ${px(iY)} ${px(iX)} round ${px(r0)})` },
    open: { transform: `translate(0px, 0px) scale(1)`, clipPath: `inset(0px 0px 0px 0px round ${px(r1)})` },
  };
}

// ---------- Home's Pinned grid ----------
// A room opens from its pinned card on Home, and a light from its pinned tile, as they do from Rooms and from a room
// (roomopen.js, lightopen.js). Around the thing tapped, what steps aside is the rest of Home that is on screen: the
// parts of its header (with `head`), the house's own light, each section, and the other pinned items.
export function homeParts(root, el, head = true) {
  const home = root.querySelector('.home'); if (!home) return [];
  const item = el && el.closest('.pin-item');
  const on = n => { const b = n.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.width > 0; };
  const out = [];
  for (const n of home.children) {
    if (n.matches('.home-head')) { if (head) out.push(...n.children); continue; }
    if (n.matches('.pin-grid')) { out.push(...[...n.children].filter(k => k !== item)); continue; }
    out.push(n);
  }
  return out.filter(on);
}
// A picture's own coordinates on screen: where its drawing's (or photograph's) origin is and how many screen px one of
// its units is, so the same point of the room can be found on two pictures of it drawn at different sizes (a pinned
// room's card and the room page's photograph card). An illustration says so itself (its SVG's screen matrix); a
// photograph covering its box is worked out from its own size, which `nat` gives when it has not loaded yet.
export function pictureFrame(box, nat) {
  const svg = box.querySelector('.rs-svg');
  if (svg && svg.getScreenCTM) { const m = svg.getScreenCTM(); if (m) return { a: m.a, x: m.e, y: m.f }; }
  const img = box.querySelector('img.room-photo');
  if (!img) return null;
  const r = img.getBoundingClientRect();
  const nw = img.naturalWidth || (nat && nat.w), nh = img.naturalHeight || (nat && nat.h);
  if (!nw || !nh) return null;
  const a = Math.max(r.width / nw, r.height / nh);
  return { a, x: r.left + (r.width - nw * a) / 2, y: r.top + (r.height - nh * a) / 2, nat: { w: nw, h: nh } };
}
// The window for a picture that shows the room at another scale than the page does (a pinned room's card): the page's
// photograph card scaled and moved so its picture lies exactly on the card's, and clipped to the card's box. The same
// fields as windowGeo's, for the same callers; `iY` is the inset under the card, where its shade sits.
export function pictureGeo({ box, k, pic }, Hr, hp, r0, r1) {
  const W = Hr.width, H = Hr.height;
  const s = pic.a / hp.a;
  const C = centre(Hr);
  const dx = pic.x - C.x + s * (C.x - hp.x), dy = pic.y - C.y + s * (C.y - hp.y);
  // a point on screen, as the card was, in the photograph card's own coordinates
  const loc = (x, y) => ({ x: (x - pic.x) / s + hp.x - Hr.left, y: (y - pic.y) / s + hp.y - Hr.top });
  const tl = loc(box.left, box.top), br = loc(box.right, box.bottom);
  const ins = [tl.y, W - br.x, H - br.y, tl.x];
  return {
    k: s, W, H, iX: ins[3], iY: ins[2], cardW: br.x - tl.x, cardH: br.y - tl.y, loc,
    shut: { transform: `translate(${px(dx)}, ${px(dy)}) scale(${s})`, clipPath: `inset(${ins.map(px).join(' ')} round ${px(r0 * k / s)})` },
    open: { transform: 'translate(0px, 0px) scale(1)', clipPath: `inset(0px 0px 0px 0px round ${px(r1)})` },
  };
}

// ---------- the words ----------
// The place a part flies to, as it rests on its page: its words' box (Dt) and its own box (Db).
// The destination's flight: from the part's box to where it rests, matched on width and centre to centre. Its origin
// is the centre of its words, not of its block.
export function destFlip(dest, Dt, Db, p) {
  const lc = centre(p.r), tc = centre(Dt);
  dest.style.transformOrigin = `${px(tc.x - Db.left)} ${px(tc.y - Db.top)}`;
  return `translate(${px(lc.x - tc.x)}, ${px(lc.y - tc.y)}) scale(${p.r.width / (Dt.width || 1)})`;
}
// A title in a header that has collapsed as its page scrolled (header.js) is drawn moved and shrunk by its own
// translate and scale. Its flight starts from exactly there: those are set aside for the run and the whole of it,
// collapse and flight, is one transform from the corner of its box. Null for a title drawn where it rests.
function collapsed(dest) {
  const now = dest.getBoundingClientRect();
  const keep = [dest.style.translate, dest.style.scale];
  dest.style.translate = 'none'; dest.style.scale = 'none';
  const b0 = dest.getBoundingClientRect();
  if (Math.abs(now.left - b0.left) < 0.01 && Math.abs(now.top - b0.top) < 0.01 && Math.abs(now.width - b0.width) < 0.01) {
    [dest.style.translate, dest.style.scale] = keep;
    return null;
  }
  return { now, b0, s: now.width / (b0.width || 1) };
}
// Where it is drawn now (rest) and on the part (small): the words' centre on the part's, matched on width, as destFlip.
function heldFlip(dest, { now, b0, s }, Dt, p) {
  const lc = centre(p.r), tc = centre(Dt), m = p.r.width / (Dt.width || 1);
  dest.style.transformOrigin = '0px 0px';
  return {
    rest: `translate(${px(now.left - b0.left)}, ${px(now.top - b0.top)}) scale(${s})`,
    small: `translate(${px(lc.x + m * (now.left - tc.x) - b0.left)}, ${px(lc.y + m * (now.top - tc.y) - b0.top)}) scale(${m * s})`,
  };
}
// The copy's flight to the destination's words (its origin is its own centre).
export function copyFlight(copy, p, Dt) {
  const tc = centre(Dt);
  return `translate(${px(tc.x - copy._c.x)}, ${px(tc.y - copy._c.y)}) scale(${(Dt.width || 1) / (p.w || 1)})`;
}
// One part of the thing tapped and its place on the new page, flown as one: the destination flies out of the part (or
// back into it) on the run's curve, and a copy of the part flies with it; the two cross in `cross` ms at the part's
// end only. `dir` is 'open' or 'close'. `copy` is the copy to fly (a line of words by default); `to` and `from` are
// the opacities each rests at (a drawing of a light that is off is faint on both pages).
export function pair(F, dir, { dest, Dt, Db, p, k = 1, top, copy = null, cross = CROSS, crossEase = 'linear', to = 1, from = 1, raise = true }) {
  const R = dir === 'open' ? OPEN : CLOSE;
  // Two lines of words that do not read the same (one cut short by its ellipsis where the other is not, or on two
  // lines where the other is on one) are laid over each other as briefly as can be: each keeps its own lines, and
  // the moment where both show is half as long.
  if (!copy && p.el && (p.lines || cutShort(p.el) || cutShort(dest))) cross = Math.min(cross, CROSS / 2);
  const node = copy || copyText(p, k); top.appendChild(node);
  const was = { position: dest.style.position, zIndex: dest.style.zIndex, origin: dest.style.transformOrigin, translate: dest.style.translate, scale: dest.style.scale };
  // (a title stuck in its page's header keeps its own place in the stacking, over the header's scrim)
  if (raise) { const cs = getComputedStyle(dest); if (cs.position === 'static') dest.style.position = 'relative'; if (cs.zIndex === 'auto') dest.style.zIndex = '1'; }
  const held = collapsed(dest);
  let small = null, rest = 'translate(0px, 0px) scale(1)';
  if (held) ({ small, rest } = heldFlip(dest, held, Dt, p));
  else small = destFlip(dest, Dt, Db, p);
  const fly = copyFlight(node, p, Dt), home = `translate(0px, 0px) scale(${k})`;
  F.undo(() => { Object.assign(dest.style, { position: was.position, zIndex: was.zIndex, transformOrigin: was.origin, translate: was.translate, scale: was.scale }); });
  if (dir === 'open') {
    F.core(dest, [{ transform: small }, { transform: rest }], { duration: R.dur, easing: R.ease });
    F.core(dest, [{ opacity: 0 }, { opacity: to }], { duration: cross, easing: crossEase });
    F.core(node, [{ transform: home }, { transform: fly }], { duration: R.dur, easing: R.ease, fill: 'forwards' });
    F.core(node, [{ opacity: from }, { opacity: 0 }], { duration: cross, easing: crossEase, fill: 'forwards' });
  } else {
    F.core(dest, [{ transform: rest }, { transform: small }], { duration: R.dur, easing: R.ease, fill: 'forwards' });
    F.core(dest, [{ opacity: to }, { opacity: 0 }], last(cross, { easing: crossEase }));
    F.core(node, [{ transform: fly }, { transform: home }], { duration: R.dur, easing: R.ease, fill: 'forwards' });
    F.core(node, [{ opacity: 0 }, { opacity: from }], last(cross, { easing: crossEase }));
  }
  return node;
}

// Words ended early by their ellipsis (one line) or their clamp (a few).
const cutShort = el => !!el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);

// ---------- a header that stays ----------
// A page's header row stays at the top as the page scrolls (header.css, .bar) and carries a blurred scrim. A blur shows
// what is under it only as far as the nearest element being faded, so fading the header row itself would cut the blur
// off for as long as that plays: what the scrim covers would show through it sharp, and blur again as it lands. So a
// header row is moved and faded by its parts, each thing in it (parts), and its scrim is faded on its own (scrim).
export const parts = n => (n && n.matches && n.matches('.bar') ? [...n.children] : [n]);
// The scrim from `a` to `b` of what it shows now (as far as the page is scrolled), on the timing given; nothing when
// the page is at the top and it shows nothing. `how` is the run's 'core' or 'extra'.
export function scrim(F, bar, a, b, o, how = 'core') {
  if (!bar || !bar.matches || !bar.matches('.bar')) return null;
  const at = Number(getComputedStyle(bar, '::before').opacity) || 0;
  if (!at) return null;
  try { return F[how](bar, [{ opacity: a * at }, { opacity: b * at }], { ...o, pseudoElement: '::before' }); } catch (_) { return null; }
}

// ---------- aside ----------
// The rest of the old page around the thing tapped (box), and which way each part steps: above up, below down,
// beside sideways away from it, nearest first (a step of 0.03 s for each 150 px further away, at most three).
export function aside(items, box, { up = -40, down = 120, side = 40 } = {}) {
  const c = centre(box);
  return items.filter(Boolean).map(n => {
    const b = n.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    let dx = 0, dy = 0;
    if (b.bottom <= box.top + 2) dy = up;
    else if (b.top >= box.bottom - 2) dy = down;
    else dx = (b.left + b.width / 2 < c.x ? -1 : 1) * side;
    const gx = Math.max(0, box.left - b.right, b.left - box.right), gy = Math.max(0, box.top - b.bottom, b.top - box.bottom);
    return { el: n, dx, dy, delay: Math.min(3, Math.floor((gx + gy + 60) / 150)) * 30 };
  }).filter(Boolean);
}
// Stepping aside as the page opens, and back into place as it closes (the close's steps come `at` ms into it and may
// outlast it). The open's fade is 0.25 s EASE_IN; its move `move` ms on `moveEase` (the same animation when they
// match, as M10 has it).
export function stepAside(F, dir, steps, { fade = 250, move = 320, moveEase = 'ease-in-out', at = 0, back = 400, backFade = 300 } = {}) {
  const tf = s => (s.dx ? `translate(${s.dx}px, ${s.dy}px) scale(0.96)` : `translateY(${s.dy}px) scale(0.96)`);
  const rest = s => (s.dx ? 'translate(0px, 0px) scale(1)' : 'translateY(0px) scale(1)');
  for (const s of steps) {
    if (dir === 'open') {
      if (move === fade && moveEase === T.easeIn) {
        F.core(s.el, [{ opacity: 1, transform: rest(s) }, { opacity: 0, transform: tf(s) }], { duration: fade, easing: T.easeIn, delay: s.delay, fill: 'forwards' });
      } else {
        F.core(s.el, [{ opacity: 1 }, { opacity: 0 }], { duration: fade, easing: T.easeIn, delay: s.delay, fill: 'forwards' });
        F.core(s.el, [{ transform: rest(s) }, { transform: tf(s) }], { duration: move, easing: moveEase, delay: s.delay, fill: 'forwards' });
      }
    } else if (back === backFade) {
      F.extra(s.el, [{ opacity: 0, transform: tf(s) }, { opacity: 1, transform: rest(s) }], { duration: back, easing: T.ease, delay: at + s.delay, fill: 'backwards' });
    } else {
      F.extra(s.el, [{ opacity: 0 }, { opacity: 1 }], { duration: backFade, easing: T.ease, delay: at + s.delay, fill: 'backwards' });
      F.extra(s.el, [{ transform: tf(s) }, { transform: rest(s) }], { duration: back, easing: T.ease, delay: at + s.delay, fill: 'backwards' });
    }
  }
}

// ---------- arrive ----------
// A control of the new page arriving `at` ms into the open: from `dy` below (or `dx` beside) and `scale`, fading in,
// on the standard curve. Plays with the run (a finger never holds an open, so it only has to play).
export function rise(F, node, at, { dy = 24, dx = 0, scale = 1, dur = 400, ease = T.ease, to = null } = {}) {
  if (!node) return null;
  const o = to == null ? opacityOf(node) : to;
  const from = `translate(${dx}px, ${dy}px)${scale !== 1 ? ` scale(${scale})` : ''}`;
  return F.extra(node, [{ opacity: 0, transform: from }, { opacity: o, transform: 'none' }], { duration: dur, easing: ease, delay: at, fill: 'backwards' });
}
// A control of the old page going as it closes: gone first, together, 0.13 s EASE_IN unless said otherwise.
export function going(F, node, { dur = 130, ease = T.easeIn, at = 0 } = {}) {
  if (!node) return null;
  return F.core(node, [{ opacity: opacityOf(node) }, { opacity: 0 }], { duration: dur, easing: ease, delay: at, fill: 'forwards' });
}
