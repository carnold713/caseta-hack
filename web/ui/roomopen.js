// M10 · Opening a room: the Figma frame the owner approved for a room card on Rooms opening into its page, and the
// same run backwards when the room is left for Rooms again. Every other page change is motion.js's push or back.
//
// OPEN, from the moment the address changes (T):
//   the window  the card's picture opens where it is into the room page's photograph, 0.55 s on (0.2, 0, 0, 1). The
//               page's own photograph card is the window: it starts moved and clipped to the card's box and ends
//               where it is. The picture inside is never rescaled, because the card already shows the middle of
//               the page's photograph at the page's scale (screens.css, .room-big .room-photo).
//   the face    what the card lays over its picture (the grey veil of a room that is off, the warmth, its light,
//               the dark shade under the name) is laid over the window where it was on the card and fades in the
//               first 0.3 s. The shade stays on the window's bottom edge and the rest covers the whole window, so
//               no edge ever crosses the photograph.
//   the name    the page's title flies from the card's label, width matched, on the window's curve; the two
//               crossfade only in the first 0.15 s, where the change of weight cannot be seen.
//   the list    the other cards step aside (up 40 above, down 120 below) and fade, 0.25 s EASE_IN, nearest first
//               0.03 s apart, and "Rooms" lifts away; the card's status and power fade in 0.12 s.
//   the room    fills in in reading order: the header, the count badge, All on and All off, the count, the scenes,
//               the tiles (each lit one blooming with its own light as it lands), and a spill of the card's light
//               over the page as it opens.
// BACK is the same run the other way, faster (0.45 s on (0.4, 0, 0.2, 1)), with the room's content gone first.
//
// A room reached any other way, a card that is not on screen, or a phone asking for reduced motion gets the plain
// push and back. Transforms, opacity and clip-path only; everything is measured before anything is written.
import { T, reduced, capture, takeGhost, holdFor, arrive as plainArrive, stagger } from '/ui/motion.js';

const OPEN = { dur: 550, ease: 'cubic-bezier(0.2, 0, 0, 1)' };
const CLOSE = { dur: 450, ease: 'cubic-bezier(0.4, 0, 0.2, 1)' };
const FACE = 300;       // the card's face fades over the first (open) or last (back) 0.3 s
const CROSS = 150;      // the label and the title crossfade only in this much at the card's end
const RADIUS = 28;      // the card's corners, which the window keeps

let tapped = null;      // a card just tapped: { hash, card, y, until }, until its address changes
let opened = null;      // the room a card opened, and where Rooms was scrolled then: { aid, y }
let pending = null;     // what prepare() measured, for arrive() once the new page is drawn
let flight = null;      // the transition playing: { until, anims, undo }
let scrollBack = null;  // where Rooms goes back to, for the next redraw

// ---------- the app's side ----------
// A tap on a room card, before the address changes. Only a card on Rooms opens this way.
export function tap(el) {
  if (!el || !el.matches('.room-big[data-go]') || !el.closest('#screen')) return;
  tapped = { hash: el.dataset.go, card: el, y: window.scrollY, until: performance.now() + 800 };
}
// From the tap until the window has opened (or closed) a second tap does nothing, so it can never navigate twice.
export function busy() {
  const now = performance.now();
  return !!((tapped && now < tapped.until) || (flight && now < flight.until));
}
// Whether the window is still moving. A redraw then would pull the page out from under it, so the app hands the
// redraw here instead and it runs the moment the window lands (at most half a second later).
export const flying = () => !!flight;
let redraw = null;
export function whenLanded(fn) { redraw = fn; }
function landed(f) {
  if (flight !== f) return;
  flight = null;
  for (const u of f.undo.splice(0)) { try { u(); } catch (_) { /* already gone */ } }
  const r = redraw; redraw = null;
  if (r) r();
}
// Jump whatever is playing to its end, cleanly: the new page as it rests and nothing of the old one. Called when
// the address changes again mid flight, so the redraw that follows is the new page's own.
export function finish() {
  const f = flight; if (!f) return;
  flight = null; redraw = null;
  for (const a of f.anims) { try { a.cancel(); } catch (_) { /* already gone */ } }
  for (const u of f.undo.splice(0)) { try { u(); } catch (_) { /* already gone */ } }
}
// Where Rooms was scrolled when a card opened the room it is coming back from, once.
export function takeScroll() { const y = scrollBack; scrollBack = null; return y; }
// The room a card opened, and where Rooms was scrolled then ({ aid, y }), or null: a back swipe (M13) draws Rooms
// behind the room as this close starts from.
export const openedFrom = () => (opened ? { ...opened } : null);

// Called when the page changes, before the new one is drawn. Says 'room-open' or 'room-close' when this transition
// plays, and otherwise null (the caller captures the page for the plain push or back). `pose` is where a back swipe
// left the room (predictiveback.js): the close then starts from there.
export function prepare({ from, to, r, depth, screen, pose = null }) {
  finish();
  const t = tapped; tapped = null; pending = null;
  if (from === 'rooms/null' && r.name === 'room' && !r.sub && to === `room/${r.id}` && t && t.hash === `room/${r.id}`) {
    opened = { aid: r.id, y: t.y };
    if (reduced() || !t.card.isConnected || shown(t.card) < 0.25) return null;
    const O = readCard(t.card);
    const g = capture(screen, { live: true }); takeGhost();
    if (!g) return null;
    // the old page stays under the new one while it steps aside
    g.style.zIndex = '';
    screen.before(g);
    t.card.style.visibility = 'hidden';
    pending = { kind: 'open', O, ghost: g };
    return 'room-open';
  }
  if (opened && from === `room/${opened.aid}` && to === 'rooms/null') {
    const aid = opened.aid;
    scrollBack = opened.y; opened = null;
    if (reduced()) return null;
    const hero = screen.querySelector('.room-photo-card'), h1 = screen.querySelector('.room-title h1');
    if (!hero || !h1 || shown(hero) <= 0) return null;
    const art = hero.querySelector('.room-art');
    const read = { Hr: hero.getBoundingClientRect(), Ht: textBox(h1), Hb: h1.getBoundingClientRect(), artR: art && art.getBoundingClientRect() };
    // the room's own elements, so its photograph is not decoded again; the plain back plays them if the card is
    // not on screen when Rooms is drawn
    capture(screen, { live: true });
    pending = { kind: 'close', aid, hero, h1, pose, ...read };
    return 'room-close';
  }
  // a room left for anywhere but deeper forgets which card opened it
  if (opened && (depth === 0 || (r.name === 'room' && r.id !== opened.aid))) opened = null;
  return null;
}

// Called by the redraw once the new page is drawn (and Rooms scrolled back), in place of motion.arrive().
export function arrive(how, screen) {
  const p = pending; pending = null;
  if (how === 'room-open' && p && p.kind === 'open') { open(p, screen); return; }
  if (how === 'room-close' && p && p.kind === 'close') { close(p, screen); return; }
  plainArrive(how === 'room-close' ? 'back' : 'push', screen);
}

// ---------- measuring ----------
// How much of an element's height is on screen, 0 to 1.
function shown(el) {
  const b = el.getBoundingClientRect();
  if (!b.height) return 0;
  return Math.max(0, Math.min(b.bottom, innerHeight) - Math.max(b.top, 0)) / b.height;
}
// The words of a title as they sit in it: a block title is wider than its words, and it is the words that fly.
function textBox(el) {
  const b = el.getBoundingClientRect();
  const rg = document.createRange(); rg.selectNodeContents(el);
  const t = rg.getBoundingClientRect();
  const w = Math.min(t.width || b.width, b.width);
  return { left: t.width ? t.left : b.left, top: b.top, width: w, height: b.height };
}
const centre = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const px = n => `${Math.round(n * 100) / 100}px`;

// Everything about the card the transition needs, read while it is still where it was drawn. The card may be
// part way through its press (0.97), so its scale is read too and the window starts exactly where it is.
function readCard(card) {
  const box = card.getBoundingClientRect();
  const k = box.width / (card.offsetWidth || box.width) || 1;
  const q = s => card.querySelector(s);
  const photo = card.classList.contains('photo');
  const vis = el => (el ? Number(getComputedStyle(el).opacity) : 0);
  // a part's own size is its box less the card's press (offsetWidth would round it, and a line of words cut short
  // by a pixel ends in an ellipsis)
  const part = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { el, r, w: r.width / k, h: r.height / k }; };
  const glows = [...card.querySelectorAll('.glow:not(.off)')].map(g => {
    const cs = getComputedStyle(g); const r = g.getBoundingClientRect();
    return { el: g, x: r.left, y: r.top, transform: cs.transform, opacity: cs.opacity };
  });
  const veil = q('.rm-veil'), warm = q('.rm-warm');
  return {
    card, box, k,
    bg: photo ? null : getComputedStyle(card).backgroundImage,
    shade: photo ? getComputedStyle(card, '::after').backgroundImage : null,
    nm: part(q('.nm')), vl: part(q('.vl')), pwr: part(q('.pwr')), pill: part(q('.add-photo')),
    art: q('.room-art') && { r: q('.room-art').getBoundingClientRect(), opacity: vis(q('.room-art')) },
    veil: veil && vis(veil) > 0.01 ? { bg: getComputedStyle(veil).backgroundColor, filter: getComputedStyle(veil).backdropFilter, opacity: vis(veil) } : null,
    warm: warm && vis(warm) > 0.001 ? { bg: getComputedStyle(warm).backgroundColor, blend: getComputedStyle(warm).mixBlendMode, opacity: vis(warm) } : null,
    glows,
  };
}

// ---------- building ----------
const el = (cls, style = {}) => { const d = document.createElement('div'); d.className = cls; d.setAttribute('aria-hidden', 'true'); Object.assign(d.style, { pointerEvents: 'none', ...style }); return d; };
// A copy of a line of words from the card, with its look, standing where it stood (at the card's press scale).
function copyText(part, k) {
  const cs = getComputedStyle(part.el);
  const s = document.createElement('span');
  s.textContent = part.el.textContent;
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'textOverflow', 'overflow']) s.style[p] = cs[p];
  // one line, as it was: a copy is never narrower than the words it carries
  s.style.whiteSpace = 'nowrap';
  const node = pin(s, part, k);
  node.style.width = px(part.w + 0.5);
  return node;
}
function copyButton(part, k) {
  const cs = getComputedStyle(part.el);
  const b = part.el.cloneNode(true);
  b.removeAttribute('data-act'); b.removeAttribute('data-id'); b.removeAttribute('aria-label'); b.removeAttribute('class');
  for (const p of ['display', 'placeItems', 'backgroundColor', 'color', 'borderRadius', 'boxShadow', 'border', 'padding']) b.style[p] = cs[p];
  return pin(b, part, k);
}
function pin(node, part, k) {
  const c = centre(part.r);
  node.setAttribute('aria-hidden', 'true');
  Object.assign(node.style, {
    position: 'absolute', left: px(c.x - part.w / 2), top: px(c.y - part.h / 2), width: px(part.w), height: px(part.h),
    margin: '0', boxSizing: 'border-box', transformOrigin: '50% 50%', transform: `scale(${k})`, pointerEvents: 'none', transition: 'none',
  });
  node._c = c;
  return node;
}
// The layer over the new page for the copies, under the tab bar and its fade.
function topLayer(screen) {
  const L = el('m10-top', { position: 'fixed', inset: '0', overflow: 'hidden' });
  screen.after(L);
  return L;
}
// A glow of the card's, standing alone: the card's rules placed it, so its place, scale and strength are copied.
function glowCopy(g, x, y) {
  const c = g.el.cloneNode(true);
  Object.assign(c.style, { left: px(x), top: px(y), transform: g.transform, opacity: g.opacity, transition: 'none' });
  return c;
}
// The light spilling over the page: the card's own glow, or a soft warm pool when the room is dark.
function spill(O, after) {
  const b = O.box;
  const S = el('m10-spill', { position: 'fixed', left: px(b.left), top: px(b.top), width: px(b.width), height: px(b.height), mixBlendMode: 'screen' });
  const at = O.glows[0] ? { x: O.glows[0].x - b.left, y: O.glows[0].y - b.top } : { x: b.width - 100 * O.k, y: 44 * O.k };
  if (O.glows.length) for (const g of O.glows) S.appendChild(glowCopy(g, g.x - b.left, g.y - b.top));
  else S.appendChild(el('m10-pool', { position: 'absolute', left: px(at.x - 120), top: px(at.y - 120), width: '240px', height: '240px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255, 184, 112, .32), rgba(255, 184, 112, .12) 55%, transparent)' }));
  S.style.transformOrigin = `${px(at.x)} ${px(at.y)}`;
  after.after(S);
  return S;
}

// The window's geometry: the photograph card moved and scaled so its middle sits on the card, and clipped to the
// card's box. `loc` turns a point on screen, as the card was, into the photograph card's own coordinates.
function geometry(O, Hr) {
  const k = O.k, W = Hr.width, H = Hr.height;
  const cardW = O.box.width / k, cardH = O.box.height / k;
  const iX = (W - cardW) / 2, iY = (H - cardH) / 2;
  const hc = centre(Hr), cc = centre(O.box);
  const dx = cc.x - hc.x, dy = cc.y - hc.y;
  const loc = (x, y) => ({ x: W / 2 + (x - cc.x) / k, y: H / 2 + (y - cc.y) / k });
  return {
    k, W, H, iX, iY, cardW, cardH, loc,
    shut: { transform: `translate(${px(dx)}, ${px(dy)}) scale(${k})`, clipPath: `inset(${px(iY)} ${px(iX)} ${px(iY)} ${px(iX)} round ${px(RADIUS / k)})` },
    open: { transform: `translate(0px, 0px) scale(1)`, clipPath: `inset(0px 0px 0px 0px round ${px(RADIUS)})` },
  };
}

// The card's face over the window. Each part is [element, keyframe when shut, keyframe when open]; the caller
// plays them one way or the other. Only the shade is locked to an edge (the bottom, where the name was); the veil
// and the warmth are even all over, so they simply cover the window, and the light stays where it was on the
// picture, which is where the room's light is.
function face(hero, O, G) {
  const parts = [];
  if (O.bg) {
    // a room with no photograph: the card's own gradient, stretched with the window so it never shows an edge
    const bg = el('m10-bg', { position: 'absolute', inset: '0', backgroundImage: O.bg });
    hero.prepend(bg);
    parts.push([bg, { transform: `scale(${G.cardW / G.W}, ${G.cardH / G.H})`, opacity: 1 }, { transform: 'scale(1, 1)', opacity: 0 }]);
  }
  if (O.veil) {
    const v = el('m10-veil', { position: 'absolute', inset: '0', backgroundColor: O.veil.bg, backdropFilter: O.veil.filter, webkitBackdropFilter: O.veil.filter });
    hero.appendChild(v); parts.push([v, { opacity: O.veil.opacity }, { opacity: 0 }]);
  }
  if (O.warm) {
    const w = el('m10-warm', { position: 'absolute', inset: '0', backgroundColor: O.warm.bg, mixBlendMode: O.warm.blend });
    hero.appendChild(w); parts.push([w, { opacity: O.warm.opacity }, { opacity: 0 }]);
  }
  if (O.glows.length) {
    // composited as the card composites them: each glow is its own group there (its scale(1) makes it one), so the
    // light lands on the picture the same way on both
    const box = el('m10-glows', { position: 'absolute', inset: '0' });
    for (const g of O.glows) { const p = G.loc(g.x, g.y); box.appendChild(glowCopy(g, p.x, p.y)); }
    hero.appendChild(box); parts.push([box, { opacity: 1 }, { opacity: 0 }]);
  }
  if (O.shade) {
    const s = el('m10-shade', { position: 'absolute', left: '0', right: '0', bottom: '0', height: px(G.cardH), backgroundImage: O.shade });
    hero.appendChild(s); parts.push([s, { transform: `translateY(${px(-G.iY)})`, opacity: 1 }, { transform: 'translateY(0px)', opacity: 0 }]);
  }
  if (O.pill) {
    const cs = getComputedStyle(O.pill.el);
    const c = O.pill.el.cloneNode(true);
    const p = G.loc(O.pill.r.left, O.pill.r.top);
    for (const q of ['display', 'alignItems', 'gap', 'padding', 'borderRadius', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'lineHeight', 'fontFamily']) c.style[q] = cs[q];
    Object.assign(c.style, { position: 'absolute', left: px(p.x), top: px(p.y), width: px(O.pill.w), height: px(O.pill.h), margin: '0', pointerEvents: 'none' });
    c.setAttribute('aria-hidden', 'true');
    hero.appendChild(c); parts.push([c, { opacity: 1 }, { opacity: 0 }]);
  }
  return parts;
}
// The photograph card's own drawn room (a room with no photograph): it flies between the card's corner and its
// own, since the two pages draw it at different sizes. Returns [element, shut, open] or null.
function artFlip(hero, O, G, restR, Hr) {
  const a = hero.querySelector('.room-art');
  if (!a || !restR) return null;
  const own = Number(getComputedStyle(a).opacity);
  if (!O.art) return [a, { opacity: 0 }, { opacity: own }];
  const p = G.loc(O.art.r.left, O.art.r.top);
  const rest = { x: restR.left - Hr.left, y: restR.top - Hr.top };
  const s = (O.art.r.width / G.k) / (restR.width || 1);
  a.style.transformOrigin = '0 0';
  return [a, { transform: `translate(${px(p.x - rest.x)}, ${px(p.y - rest.y)}) scale(${s})`, opacity: O.art.opacity }, { transform: 'translate(0px, 0px) scale(1)', opacity: own }];
}

// The title's flight: from the label's box to where the title rests, matched on the width of the words and
// centre to centre. Its origin is the centre of its words, not of its block.
function titleFlip(h1, Ht, Hb, label) {
  const lc = centre(label.r), tc = centre(Ht);
  h1.style.transformOrigin = `${px(tc.x - Hb.left)} ${px(tc.y - Hb.top)}`;
  return `translate(${px(lc.x - tc.x)}, ${px(lc.y - tc.y)}) scale(${label.r.width / (Ht.width || 1)})`;
}
// The label copy's flight to the title's words (its origin is its own centre).
function labelFlight(copy, label, Ht) {
  const tc = centre(Ht);
  return `translate(${px(tc.x - copy._c.x)}, ${px(tc.y - copy._c.y)}) scale(${(Ht.width || 1) / (label.w || 1)})`;
}

// Rooms' other cards, and which way each steps: those above up 40, those below down 120, nearest first.
function around(list, card) {
  const kids = [...list.children];
  const at = kids.indexOf(card);
  return kids.map((k, i) => (i === at ? null : { el: k, dy: i < at ? -40 : 120, delay: (Math.abs(i - at) - 1) * 30 })).filter(Boolean);
}

// ---------- open ----------
function open({ O, ghost }, screen) {
  const hero = screen.querySelector('.room-photo-card'), h1 = screen.querySelector('.room-title h1');
  if (!hero || !h1 || !O.nm) { ghost.remove(); stagger(screen); return; }
  // read everything first
  const Hr = hero.getBoundingClientRect(), Hb = h1.getBoundingClientRect(), Ht = textBox(h1);
  const artR = (hero.querySelector('.room-art') || { getBoundingClientRect: () => null }).getBoundingClientRect();
  const G = geometry(O, Hr);
  const q = s => screen.querySelector(s);
  const onScreen = e => { const b = e.getBoundingClientRect(); return b.top < innerHeight && b.left < innerWidth && b.bottom > 0; };
  const chips = [...screen.querySelectorAll('.room-chips > *')].filter(onScreen);
  const tiles = [...screen.querySelectorAll('.room-grid > .tile, .room-empty')].filter(onScreen);
  const list = ghost.querySelector('.rooms-list');
  const steps = list ? around(list, O.card) : [];
  const head = ghost.querySelector('.rooms-head');

  const f = flight = { until: performance.now() + OPEN.dur, anims: [], undo: [] };
  const core = (node, kf, o) => { const a = node.animate(kf, o); f.anims.push(a); return a; };
  const play = (node, kf, o) => (node ? node.animate(kf, { fill: 'backwards', ...o }) : null);
  const top = topLayer(screen);
  f.undo.push(() => top.remove(), () => ghost.remove());

  // the window
  const win = core(hero, [G.shut, G.open], { duration: OPEN.dur, easing: OPEN.ease });
  const parts = face(hero, O, G);
  f.undo.push(() => parts.forEach(([n]) => n.remove()));
  for (const [n, a, b] of parts) {
    const move = 'transform' in a;
    if (move) core(n, [{ transform: a.transform }, { transform: b.transform }], { duration: OPEN.dur, easing: OPEN.ease, fill: 'forwards' });
    core(n, [{ opacity: a.opacity }, { opacity: b.opacity }], { duration: FACE, easing: 'linear', fill: 'forwards' });
  }
  const light = hero.querySelector('.rp-light');
  if (light) core(light, [{ opacity: 0 }, { opacity: 1 }], { duration: FACE, easing: 'linear' });
  const art = artFlip(hero, O, G, artR, Hr);
  if (art) {
    core(art[0], [art[1], art[2]], { duration: OPEN.dur, easing: OPEN.ease });
    f.undo.push(() => { art[0].style.transformOrigin = ''; });
  }

  // the name: the title flies out of the label, and the two cross only while they are the label's size
  Object.assign(h1.style, { position: 'relative', zIndex: '1' });
  core(h1, [{ transform: titleFlip(h1, Ht, Hb, O.nm) }, { transform: 'translate(0px, 0px) scale(1)' }], { duration: OPEN.dur, easing: OPEN.ease });
  core(h1, [{ opacity: 0 }, { opacity: 1 }], { duration: CROSS, easing: 'linear' });
  f.undo.push(() => { h1.style.position = ''; h1.style.zIndex = ''; h1.style.transformOrigin = ''; });
  const label = copyText(O.nm, O.k); top.appendChild(label);
  core(label, [{ transform: `translate(0px, 0px) scale(${O.k})` }, { transform: labelFlight(label, O.nm, Ht) }], { duration: OPEN.dur, easing: OPEN.ease, fill: 'forwards' });
  core(label, [{ opacity: 1 }, { opacity: 0 }], { duration: CROSS, easing: 'linear', fill: 'forwards' });
  // the status line and the power circle go at once
  const out = { duration: T.tap, easing: T.easeIn, fill: 'forwards' };
  if (O.vl) { const v = copyText(O.vl, O.k); top.appendChild(v); core(v, [{ opacity: 1 }, { opacity: 0 }], out); }
  if (O.pwr) { const b = copyButton(O.pwr, O.k); top.appendChild(b); core(b, [{ opacity: 1, transform: `scale(${O.k})` }, { opacity: 0, transform: `scale(${0.6 * O.k})` }], out); }

  // the list steps aside, and "Rooms" lifts away
  for (const s of steps) core(s.el, [{ opacity: 1, transform: 'translateY(0px) scale(1)' }, { opacity: 0, transform: `translateY(${s.dy}px) scale(0.96)` }], { duration: 250, easing: T.easeIn, delay: s.delay, fill: 'forwards' });
  if (head) core(head, [{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 200, easing: T.easeIn, fill: 'forwards' });

  // the light spills over the page as the room opens
  const sp = spill(O, top);
  sp.animate([{ opacity: 0, transform: 'scale(1)' }, { opacity: 0.55, offset: 0.3 }, { opacity: 0, transform: 'scale(1.45)' }], { duration: 1100, delay: 50, easing: 'ease-out', fill: 'both' })
    .finished.catch(() => {}).then(() => sp.remove());

  // the room fills in, in reading order
  const rise = (n, delay, dur = T.enter, dy = 12) => play(n, [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'translateY(0px)' }], { duration: dur, easing: T.ease, delay });
  play(q('.room > .hdr .back'), [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'translateX(0px)' }], { duration: T.standard, easing: T.ease, delay: 200 });
  play(q('.room > .hdr .a1'), [{ opacity: 0 }, { opacity: 1 }], { duration: T.standard, easing: T.ease, delay: 120 });
  play(hero.querySelector('.badge'), [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: T.standard, easing: T.ease, delay: 350 });
  play(hero.querySelector('.add-photo'), [{ opacity: 0 }, { opacity: 1 }], { duration: T.standard, easing: T.ease, delay: 350 });
  rise(hero.querySelector('.room-acts'), 400);
  rise(q('.room-title .count'), 500);
  rise(q('.room-sec'), 400);
  chips.forEach((c, i) => rise(c, 400 + i * T.stagger));
  tiles.forEach((t, i) => {
    const at = 460 + i * 50;
    play(t, [{ opacity: 0, transform: 'translateY(24px) scale(0.96)' }, { opacity: 1, transform: 'translateY(0px) scale(1)' }], { duration: 400, easing: T.ease, delay: at });
    // a lit tile blooms with its own light as it lands (the stylesheet draws the bloom, .tile.on::before)
    if (t.matches('.tile.on')) {
      try {
        t.animate([{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, offset: 0.3 }, { opacity: 0, transform: 'scale(1.2)' }],
          { duration: 900, delay: at + 120, easing: 'ease-out', fill: 'both', pseudoElement: '::before' });
      } catch (_) { /* a browser that cannot animate a pseudo-element goes without */ }
    }
  });

  holdFor(OPEN.dur + 50);
  Promise.all(f.anims.map(a => a.finished)).then(() => landed(f), () => {});
}

// ---------- back ----------
function close(p, screen) {
  const card = screen.querySelector(`.room-big[data-go="room/${CSS.escape(p.aid)}"]`);
  if (!card || shown(card) < 0.5 || !card.querySelector('.nm')) { if (p.pose) p.pose.plain(screen, takeGhost()); else plainArrive('back', screen); return; }
  const g = takeGhost();
  if (!g) return;
  g.style.zIndex = '';
  screen.after(g);
  const pose = p.pose;
  const O = readCard(card);
  const { hero, h1, Hr, Ht, Hb, artR } = p;
  const G = geometry(O, Hr);
  const room = g.querySelector('.room');
  const list = card.parentElement;
  const steps = list ? around(list, card) : [];
  const head = screen.querySelector('.rooms-head');

  const f = flight = { until: performance.now() + CLOSE.dur, anims: [], undo: [] };
  const core = (node, kf, o) => { const a = node.animate(kf, o); f.anims.push(a); return a; };
  const top = topLayer(g);
  card.style.visibility = 'hidden';
  f.undo.push(() => top.remove(), () => g.remove(), () => { card.style.visibility = ''; });
  const last = (dur, extra = {}) => ({ duration: dur, delay: CLOSE.dur - dur, easing: 'linear', fill: 'both', ...extra });

  // the room's content goes first, together
  const fade = { duration: 150, easing: T.easeIn, fill: 'forwards' };
  const going = [
    ...(room ? [...room.children].filter(n => n !== hero && !n.classList.contains('room-title')) : []),
    ...[...h1.parentElement.children].filter(n => n !== h1),
    ...hero.querySelectorAll('.badge, .room-acts, .add-photo'),
  ];
  for (const n of going) core(n, [{ opacity: 1 }, { opacity: 0 }], fade);

  // a room let go by a back swipe starts shrunk where the finger left it and comes back to full size as it closes
  if (pose) core(g, pose.from(g), { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  // the window closes into the card, and the card's face comes back over it
  core(hero, [G.open, G.shut], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  for (const [n, a, b] of face(hero, O, G)) {
    if ('transform' in a) core(n, [{ transform: b.transform }, { transform: a.transform }], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
    core(n, [{ opacity: b.opacity }, { opacity: a.opacity }], last(FACE));
  }
  const light = hero.querySelector('.rp-light');
  if (light) core(light, [{ opacity: 1 }, { opacity: 0 }], last(FACE));
  const art = artFlip(hero, O, G, artR, Hr);
  if (art) core(art[0], [art[2], art[1]], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });

  // the title shrinks back into the label, crossing only at the label's size
  Object.assign(h1.style, { position: 'relative', zIndex: '1' });
  core(h1, [{ transform: 'translate(0px, 0px) scale(1)' }, { transform: titleFlip(h1, Ht, Hb, O.nm) }], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  core(h1, [{ opacity: 1 }, { opacity: 0 }], last(CROSS));
  const label = copyText(O.nm, 1); top.appendChild(label);
  core(label, [{ transform: labelFlight(label, O.nm, Ht) }, { transform: 'translate(0px, 0px) scale(1)' }], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  core(label, [{ opacity: 0 }, { opacity: 1 }], last(CROSS));
  // the status line and the power circle come back over the last 0.2 s
  if (O.vl) { const v = copyText(O.vl, 1); top.appendChild(v); core(v, [{ opacity: 0 }, { opacity: 1 }], last(200, { easing: T.ease })); }
  if (O.pwr) { const b = copyButton(O.pwr, 1); top.appendChild(b); core(b, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], last(200, { easing: T.ease })); }

  // the list returns from where it stepped to, nearest first; "Rooms" comes down into place. After a back swipe
  // it returns from where the swipe showed it, already in view.
  const L = pose && pose.list;
  for (const s of steps) s.el.animate([L ? { opacity: 1, transform: `translateY(${s.dy < 0 ? L.up : L.down}px) scale(1)` } : { opacity: 0, transform: `translateY(${s.dy}px) scale(0.96)` }, { opacity: 1, transform: 'translateY(0px) scale(1)' }], { duration: 400, easing: T.ease, delay: s.delay, fill: 'backwards' });
  if (head) head.animate([L ? { opacity: 1, transform: `translateY(${L.head}px)` } : { opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 400, easing: T.ease, fill: 'backwards' });

  // a softer spill of light is drawn back into the card
  const sp = spill(O, top);
  sp.animate([{ opacity: 0, transform: 'scale(1.45)' }, { opacity: 0.35, offset: 0.4 }, { opacity: 0, transform: 'scale(1)' }], { duration: 700, delay: 100, easing: 'ease-in-out', fill: 'both' })
    .finished.catch(() => {}).then(() => sp.remove());

  // and Rooms, under it, comes up from where the swipe had it
  if (pose) pose.handed(screen, g, { dur: CLOSE.dur, ease: CLOSE.ease });
  holdFor(CLOSE.dur + 50);
  Promise.all(f.anims.map(a => a.finished)).then(() => landed(f), () => {});
}
