// M11 · A light opens from its tile (Figma 12916:3881): on a room, a tile tapped opens into its light's page as one
// object, and Back closes the page into the tile again. A fan, a shade and a switch open the same way into their own
// pages; only a lit light brings copper. opening.js decides when it plays; flight.js holds what it shares with the
// other pages that open this way.
//
// OPEN, from the moment the address changes (T), read off the frame's keyframes:
//   the surface  the tile's surface grows from its box to the whole screen, 0.55 s on (0.2, 0, 0, 1), its corners 28
//                to 0. It is the page's own dark with the tile's face (copper, a lamp's colour, or grey when off) laid
//                over it, stretched with it. The face gives way from 0.08 s, EASE_OUT, and is gone as the surface
//                lands, so the page arrives already mostly dark and copper never fills the screen. The tile's glow
//                grows with it toward the page's halo and fades from 0.25 s; the page's own halo fades in from 0.12 s
//                (EASE_IN_AND_OUT) and is the warmth that stays.
//   the words    the tile's name flies to the page's title, its level ("75", "%") to the big readout and its drawing
//                to the page's lamp, each matched on width, crossing only in the first 0.15 s at the tile's end.
//                Anything else on the tile (its "· Warm", a fan's dots) fades in 0.12 s EASE_IN.
//   the power    the tile's power circle does not travel: it fades where it is in the first 0.1 s EASE_IN, and the
//                page's On and Off grows in its own place from 0.35 s, out of a circle where its power sits.
//   the room     steps aside around the tile, nearest first 0.03 s apart: above up 40, below down 120, beside
//                sideways 40, fading (0.25 s EASE_IN) and settling to 0.96 (0.32 s EASE_IN_AND_OUT); the tab bar
//                goes down with it.
//   the page     arrives in reading order on (0.2, 0.8, 0.2, 1): the star (0.4 s), the room's name (0.5 s), On and Off,
//                the dial (its track, then its arc drawing on, its label and buttons), then the tiles and rows below,
//                0.05 s apart, rising 24 from 0.96.
// BACK runs it the other way in 0.45 s on (0.4, 0, 0.2, 1): the page's controls go first (0.13 s EASE_IN), the surface
// shrinks into the tile and its face comes back only in the last 0.2 s, the halo is drawn back into the tile's glow,
// the words fly back and cross in the last 0.15 s, and the room returns around it, nearest first.
import { T } from '/ui/motion.js';
import { OPEN, CLOSE, last, textBox, centre, px, opacityOf, part, words, chars, span, copyText, copyButton, copyNode, topLayer, el, windowGeo, pair, aside, stepAside, rise, going, scrim } from '/ui/flight.js';

const FACE_GO = 80;     // the face starts giving way this far into the open (a third of the surface's growth)
// and gives way quickly at first, so that by the time the surface is most of the screen little copper is left on it
// (a plain EASE_OUT still left the screen half copper at 0.25 s, which reads as the flash the owner turned down)
const GIVE = 'cubic-bezier(0.1, 0.6, 0.3, 1)';
const FACE_BACK = 200;  // and comes back over the last 0.2 s of the close
const GLOW_GO = 250;    // the tile's glow holds this long before it fades into the halo
const HALO_IN = 120;    // the page's halo starts arriving here
const OUT = 120;        // what is not carried across goes in this much

// ---------- the kind, for opening.js ----------
export const name = 'light';
// A tile on a room's grid; its power circle has its own tap (a toggle), so only the body gets here.
export const source = e => e.matches('.room-grid > .tile[data-go^="light/"]');
export const opens = ({ from, r, to }) => /^room\//.test(from) && r.name === 'light' && !r.sub && to === `light/${r.id}`;
export const minShown = 0.25;
export const find = (screen, entry) => screen.querySelector(`.room-grid > .tile[data-go="${CSS.escape(entry.to)}"]`);

// ---------- measuring ----------
// Everything about the tile, read while it is still where it was drawn, part way through its press.
export function read(tile) {
  const box = tile.getBoundingClientRect();
  const k = box.width / (tile.offsetWidth || box.width) || 1;
  const cs = getComputedStyle(tile);
  const q = s => tile.querySelector(s);
  const vl = q('.vl'), glow = q('.glow');
  const tabs = document.getElementById('tabs'), fade = document.querySelector('#app .scroll-fade');
  const visible = n => n && !n.hidden && getComputedStyle(n).display !== 'none';
  return {
    tile, box, k,
    radius: parseFloat(cs.borderTopLeftRadius) || 28,
    bg: { image: cs.backgroundImage, color: cs.backgroundColor },
    shadow: cs.boxShadow,
    nm: words(q('.nm'), k),
    vl: chars(vl, k),
    pwr: part(q('.pwr'), k),
    art: part(q('.art'), k),
    extras: [...tile.querySelectorAll('.speed, .shade-bar, .tile-timer')].map(n => part(n, k)),
    glow: glow && { el: glow, r: glow.getBoundingClientRect() },
    // the room's tab bar and its fade, which the page has none of: they go down with the room
    chrome: [visible(tabs) && tabs, visible(fade) && fade].filter(Boolean).map(n => ({ el: n, r: n.getBoundingClientRect() })),
  };
}

// Where the tile's words go on the page. The value line is read left to right against the page's readout (the dial's
// number and its %, a fan's speed, a shade's "40%" and "open"): what matches flies, what does not (the "· Warm", an
// "Off" that the dial shows as the level it comes back to) fades where it is.
function readouts(O, page) {
  const out = [], rest = [];
  if (!O.vl) return { out, rest };
  const text = O.vl.text;
  let at = 0;
  for (const s of ['.dial .num b', '.dial .num span', '.speeds .big', '.readout b', '.readout > span:last-child']) {
    const d = page.querySelector(s); if (!d) continue;
    const want = d.textContent.trim(); if (!want) continue;
    const i = text.indexOf(want, at); if (i < 0) continue;
    const p = span(O.vl, i, i + want.length); if (!p) continue;
    // whatever lies between two matches (a space) is not words to fly
    if (text.slice(at, i).trim()) rest.push([at, i]);
    out.push({ p, dest: d, Dt: textBox(d), Db: d.getBoundingClientRect() });
    at = i + want.length;
  }
  if (text.slice(at).trim()) rest.push([at, text.length]);
  return { out, rest: rest.map(([a, b]) => { const lead = text.slice(a, b).search(/\S/); return span(O.vl, a + Math.max(0, lead), b); }).filter(Boolean) };
}
// The page as it rests: every place something lands, read before anything is written.
function readPage(page, O) {
  const h1 = page.querySelector('.t-hero');
  const art = page.querySelector('.hero-art');
  const halo = page.querySelector('.halo');
  const hg = halo && (halo.querySelector('.glow .g-body') || halo);
  return {
    page, h1, Ht: textBox(h1), Hb: h1.getBoundingClientRect(),
    art, artR: art && art.getBoundingClientRect(), artO: opacityOf(art),
    halo, haloO: opacityOf(halo), haloR: hg && hg.getBoundingClientRect(), haloBox: halo && halo.getBoundingClientRect(),
    ...readouts(O, page),
  };
}
// The light's page, read before it is taken off screen, so it closes from where it is.
export function readClose(screen) {
  const page = screen.querySelector('.dev');
  if (!page || !page.querySelector('.t-hero')) return null;
  return { page };
}

// ---------- building ----------
// The surface: the page's own dark, the size of the screen, moved and clipped onto the tile; the tile's face over it,
// stretched with it; the tile's glow in it where it was. (The tile's faint 1 px line is left out: drawn at the tile's
// size inside a surface that is already growing, it showed as a hard edge within it.) Under the new page (it is the
// page's ground) and over the old one.
function surface(O, G) {
  const bgc = getComputedStyle(document.body).backgroundColor;
  const S = el('m11-surface', { position: 'fixed', left: '0px', top: '0px', width: px(G.W), height: px(G.H), backgroundColor: bgc, overflow: 'hidden', ...G.open });
  const face = el('m11-face', { position: 'absolute', inset: '0', backgroundImage: O.bg.image, backgroundColor: O.bg.color });
  S.appendChild(face);
  let glow = null;
  if (O.glow) {
    const g = O.glow.el.cloneNode(true);
    const q = G.loc(O.glow.r.left, O.glow.r.top);
    Object.assign(g.style, { position: 'absolute', left: px(q.x), top: px(q.y), right: 'auto', width: px(O.glow.r.width / G.k), height: px(O.glow.r.height / G.k), transformOrigin: '50% 50%', transition: 'none' });
    S.appendChild(g);
    glow = { el: g, c: { x: q.x + O.glow.r.width / G.k / 2, y: q.y + O.glow.r.height / G.k / 2 }, w: O.glow.r.width / G.k };
  }
  // the tile's shadow falls outside it, on the room, under the surface
  const shadow = el('m11-shadow', { position: 'fixed', left: px(O.box.left), top: px(O.box.top), width: px(O.box.width), height: px(O.box.height), borderRadius: px(O.radius * G.k), boxShadow: outsetOnly(O.shadow) });
  return { S, face, glow, shadow, stretch: `scale(${G.cardW / G.W}, ${G.cardH / G.H})` };
}
const shadows = s => (s && s !== 'none' ? s.split(/,(?![^(]*\))/).map(x => x.trim()) : []);
const outsetOnly = s => shadows(s).filter(x => !/inset/.test(x)).join(', ') || 'none';
// The glow's flight into the page's halo: from where it is on the tile to the halo's middle, growing to its size
// (at most five times, as the frame has it).
function glowFlight(sf, D) {
  if (!sf.glow || !D.haloR) return null;
  const hc = centre(D.haloR);
  const s = Math.min(5, Math.max(1, D.haloR.width / (sf.glow.w || 1)));
  return `translate(${px(hc.x - sf.glow.c.x)}, ${px(hc.y - sf.glow.c.y)}) scale(${s})`;
}
// The room around the tile: what steps aside for it (only what is on screen). Its header's circles step aside one by
// one and its scrim fades where it is (flight.js, scrim): the header row itself is never faded.
function roomParts(root, tile, head) {
  const on = n => { const b = n.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.width > 0; };
  return [...root.querySelectorAll(`${head ? '.room > .hdr > *, ' : ''}.room-title, .room-photo-card, .room-sec, .room-chips, .room-grid > .tile, .room-empty`)]
    .filter(n => n !== tile && on(n));
}
// The room's header and the page's sit in the same place, back button over back button, unless the room was scrolled.
function sameHead(a, b) {
  const x = a && a.querySelector('.hdr .back'), y = b && b.querySelector('.hdr .back');
  return !!x && !!y && Math.abs(x.getBoundingClientRect().top - y.getBoundingClientRect().top) < 2;
}
// The page's controls in the order they read, each with when it arrives (ms into the open) and how. The header's back
// and its "about" sit where the room's do, so they stay; the rest comes in on the standard curve.
function arrivals(page, flown) {
  const q = s => page.querySelector(s);
  const all = s => [...page.querySelectorAll(s)];
  const list = [];
  const add = (n, at, how = {}) => { if (n && !flown.has(n)) list.push({ n, at, ...how }); };
  add(q('.hdr .a2'), 400, { dy: 0, scale: 0.8, dur: 240 });
  add(q('.where'), 500, { dy: 12, dur: 320 });
  // the dial: its track, its arc drawn on, its label and number, its buttons one by one, the knob last
  const dial = q('.dial');
  if (dial) {
    add(dial.querySelector('.trk'), 560, { dy: 0, dur: 300, svg: true });
    add(dial.querySelector('.lbl'), 640, { dy: 12, dur: 320 });
    if (![...dial.querySelectorAll('.num > *')].some(n => flown.has(n))) add(dial.querySelector('.num'), 640, { dy: 12, dur: 320 });
    add(dial.querySelector('.nudge.minus'), 680, { dy: 12, dur: 320 });
    add(dial.querySelector('.lo'), 720, { dy: 12, dur: 320 });
    add(dial.querySelector('.hi'), 760, { dy: 12, dur: 320 });
    add(dial.querySelector('.nudge.plus'), 800, { dy: 12, dur: 320 });
  }
  // a fan's speeds: the label and the speed, then each step, slowest first
  const sp = q('.speeds');
  if (sp) {
    add(sp.querySelector('.lbl'), 560, { dy: 12, dur: 320 });
    add(sp.querySelector('.big'), 580, { dy: 12, dur: 320 });
    all('.speeds .step').forEach((s, i) => { add(s, 600 + i * 40, { dy: 24, scale: 0.96 }); add(all('.speeds .steplbl')[i], 600 + i * 40, { dy: 12, dur: 320 }); });
    for (const n of all('.speeds .nudge, .speeds .fa')) add(n, 800, { dy: 12, dur: 320 });
  }
  // a shade's window and its readout, then its buttons
  add(q('.window'), 400, { scale: 0.96 });
  add(q('.readout'), 520, { dy: 12, dur: 320 });
  // then the tiles and rows below, 0.05 s apart
  let at = dial || sp ? 720 : 620;
  for (const n of all('.looks > *, .feats > *, .shade-btns > *, .shade-gn')) { add(n, at, { scale: 0.96 }); at += 50; }
  // anything else the page draws comes in after them
  const known = new Set(['hdr', 'where', 't-hero', 'onoff', 'dial', 'speeds', 'window', 'readout', 'looks', 'feats', 'shade-btns', 'shade-gn', 'halo', 'hero-art', 'lamp-filament']);
  for (const n of page.children) if (![...n.classList].some(c => known.has(c))) add(n, at, { scale: 0.96 });
  return list;
}

// ---------- open ----------
export function open({ O, ghost }, screen, F) {
  const page = screen.querySelector('.dev');
  if (!page || !page.querySelector('.t-hero') || !O.nm) return false;
  // read everything first
  const D = readPage(page, O);
  const G = windowGeo(O, { left: 0, top: 0, width: document.documentElement.clientWidth, height: innerHeight }, O.radius / O.k, 0);
  const shared = sameHead(ghost, page);
  const steps = aside(roomParts(ghost, O.tile, !shared), O.box);
  const onoff = page.querySelector('.onoff');
  const onR = onoff && onoff.getBoundingClientRect();
  const pwrIc = onoff && (onoff.querySelector('button[aria-pressed="true"] .ic') || onoff.querySelector('.ic'));
  const pwrR = pwrIc && pwrIc.getBoundingClientRect();
  const fil = page.querySelector('.dial .fil');
  const flown = new Set([D.h1, ...D.out.map(o => o.dest), ...(D.art && O.art ? [D.art] : [])]);
  const arrive = arrivals(page, flown);
  const knob = [page.querySelector('.dial .kn'), page.querySelector('.dial .kglow')];

  // then write
  const top = topLayer(screen, 'm11-top');
  const sf = surface(O, G);
  screen.before(sf.shadow, sf.S);
  F.undo(() => top.remove(), () => sf.S.remove(), () => sf.shadow.remove());

  // the surface grows to the whole screen, and its face gives way to the page's dark while it grows
  F.core(sf.S, [G.shut, G.open], { duration: OPEN.dur, easing: OPEN.ease });
  F.core(sf.face, [{ transform: sf.stretch }, { transform: 'scale(1, 1)' }], { duration: OPEN.dur, easing: OPEN.ease, fill: 'forwards' });
  F.core(sf.face, [{ opacity: 1 }, { opacity: 1, offset: FACE_GO / OPEN.dur, easing: GIVE }, { opacity: 0 }], { duration: OPEN.dur, easing: 'linear', fill: 'forwards' });
  F.core(sf.shadow, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: T.easeIn, fill: 'forwards' });
  const gf = glowFlight(sf, D);
  if (gf) {
    F.core(sf.glow.el, [{ transform: 'translate(0px, 0px) scale(1)' }, { transform: gf }], { duration: OPEN.dur, easing: OPEN.ease, fill: 'forwards' });
    F.core(sf.glow.el, [{ opacity: 1 }, { opacity: 1, offset: GLOW_GO / OPEN.dur, easing: 'ease-in-out' }, { opacity: 0 }], { duration: OPEN.dur, easing: 'linear', fill: 'forwards' });
  } else if (sf.glow) F.core(sf.glow.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: T.easeIn, fill: 'forwards' });
  // the page's own light: its halo, then the filament and the pool under the lamp
  if (D.halo && D.haloO > 0.01) F.extra(D.halo, [{ opacity: 0 }, { opacity: D.haloO }], { duration: OPEN.dur - HALO_IN, delay: HALO_IN, easing: 'ease-in-out', fill: 'backwards' });
  for (const [s, at, dur] of [['.lamp-filament', 500, 300], ['.lamp-pool', 600, 350]]) {
    const n = page.querySelector(s);
    if (n && opacityOf(n) > 0.001) F.extra(n, [{ opacity: 0 }, { opacity: opacityOf(n) }], { duration: dur, delay: at, easing: 'ease-in-out', fill: 'backwards' });
  }

  // the words and the drawing fly; the rest of the tile goes where it is
  const cross = { crossEase: 'ease-in-out' };
  pair(F, 'open', { dest: D.h1, Dt: D.Ht, Db: D.Hb, p: O.nm, k: O.k, top, ...cross });
  for (const o of D.out) pair(F, 'open', { dest: o.dest, Dt: o.Dt, Db: o.Db, p: o.p, k: O.k, top, raise: false, ...cross });
  if (D.art && O.art) pair(F, 'open', { dest: D.art, Dt: D.artR, Db: D.artR, p: O.art, k: O.k, top, copy: copyNode(O.art, O.k), to: D.artO, from: opacityOf(O.art.el), raise: false, ...cross });
  else if (D.art) F.extra(D.art, [{ opacity: 0 }, { opacity: D.artO }], { duration: OPEN.dur - HALO_IN, delay: HALO_IN, easing: 'ease-in-out', fill: 'backwards' });
  const out = { duration: OUT, easing: T.easeIn, fill: 'forwards' };
  for (const r of D.rest) { const c = copyText(r, O.k); top.appendChild(c); F.core(c, [{ opacity: 1 }, { opacity: 0 }], out); }
  for (const x of O.extras) { const c = copyNode(x, O.k); top.appendChild(c); F.core(c, [{ opacity: opacityOf(x.el) }, { opacity: 0 }], out); }
  // the power circle does not travel: it fades where it is
  if (O.pwr) { const b = copyButton(O.pwr, O.k); top.appendChild(b); F.core(b, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: T.easeIn, fill: 'forwards' }); }

  // the room steps aside around the tile; its tab bar and the fade over it go down with it
  stepAside(F, 'open', steps);
  if (!shared) scrim(F, ghost.querySelector('.room > .hdr'), 1, 0, { duration: 250, easing: T.easeIn, fill: 'forwards' });
  for (const c of O.chrome) {
    const n = c.el.cloneNode(true);
    n.removeAttribute('id'); n.hidden = false; n.setAttribute('aria-hidden', 'true'); n.inert = true;
    n.querySelectorAll('[data-go], [data-act]').forEach(b => { b.removeAttribute('data-go'); b.removeAttribute('data-act'); });
    n.style.pointerEvents = 'none';
    top.appendChild(n);
    F.core(n, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, delay: 90, easing: T.easeIn, fill: 'forwards' });
    if (n.matches('.tabbar')) F.core(n, [{ translate: '0px 0px', scale: '1' }, { translate: '0px 120px', scale: '0.96' }], { duration: 320, delay: 90, easing: 'ease-in-out', fill: 'forwards' });
  }

  // the header's back button is the room's own, where it was; the page's "about" is drawn a little lighter than the
  // room's, so it crosses over it in 0.15 s. A room scrolled away from its header gets the page's header arriving.
  if (shared) F.extra(page.querySelector('.hdr .a1'), [{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-in-out', fill: 'backwards' });
  else {
    rise(F, page.querySelector('.hdr .back'), 200, { dx: -12, dy: 0, dur: T.standard });
    rise(F, page.querySelector('.hdr .a1'), 120, { dy: 0, dur: T.standard });
  }
  // On and Off grows in its own place, out of a circle where its power sits
  if (onoff && onR && pwrR) {
    const c = centre(pwrR), r = 22;
    const ins = [c.y - r - onR.top, onR.right - c.x - r, onR.bottom - c.y - r, c.x - r - onR.left].map(v => px(Math.max(0, v)));
    F.extra(onoff, [{ clipPath: `inset(${ins.join(' ')} round ${r}px)` }, { clipPath: `inset(0px 0px 0px 0px round ${px(onR.height / 2)})` }], { duration: 300, delay: 350, easing: T.ease, fill: 'backwards' });
    F.extra(onoff, [{ opacity: 0 }, { opacity: 1 }], { duration: 150, delay: 350, easing: 'ease-in-out', fill: 'backwards' });
    for (const b of onoff.querySelectorAll('button')) F.extra(b, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 450, easing: 'ease-in-out', fill: 'backwards' });
  }
  // the dial's arc draws on from its low end
  if (fil) {
    fil.setAttribute('pathLength', '1');
    fil.style.strokeDasharray = '1 1';
    const a = F.extra(fil, [{ strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], { duration: 520, delay: 580, easing: 'ease-in-out', fill: 'backwards' });
    const clean = () => { fil.removeAttribute('pathLength'); fil.style.strokeDasharray = ''; };
    a.finished.then(clean, clean);
  }
  for (const n of knob) {
    if (!n) continue;
    if (n instanceof SVGElement) { n.style.transformBox = 'fill-box'; n.style.transformOrigin = 'center'; }
    F.extra(n, [{ opacity: 0, scale: '0.6' }, { opacity: opacityOf(n), scale: '1' }], { duration: 280, delay: 1040, easing: T.ease, fill: 'backwards' });
  }
  for (const a of arrive) {
    if (a.svg) F.extra(a.n, [{ opacity: 0 }, { opacity: opacityOf(a.n) }], { duration: a.dur, delay: a.at, easing: T.ease, fill: 'backwards' });
    else rise(F, a.n, a.at, a);
  }
  // socket redraws wait until the page has arrived
  F.hold = 1400;
  return true;
}

// ---------- back ----------
export function close(p, screen, F, { ghost, O, el: tile }) {
  const page = p.page;
  // read everything first
  const D = readPage(page, O);
  const G = windowGeo(O, { left: 0, top: 0, width: document.documentElement.clientWidth, height: innerHeight }, O.radius / O.k, 0);
  const shared = sameHead(screen, page);
  const steps = aside(roomParts(screen, tile, !shared), O.box);
  const keep = new Set([D.h1, ...D.out.map(o => o.dest), D.art, D.halo, page.querySelector('.hdr')].filter(Boolean));
  const leaving = controls(page, keep);
  const hdr = page.querySelector('.hdr');
  const glowTo = D.haloR && O.glow ? { c: centre(O.glow.r), s: O.glow.r.width / (D.haloR.width || 1) } : null;
  const tabs = document.getElementById('tabs'), fade = document.querySelector('#app .scroll-fade');
  const showTabs = tabs && !tabs.hidden;

  // then write
  const top = topLayer(ghost, 'm11-top');
  const sf = surface(O, G);
  screen.after(sf.shadow, sf.S);
  F.undo(() => top.remove(), () => sf.S.remove(), () => sf.shadow.remove());

  // the page's controls go first, together
  for (const n of leaving) going(F, n, { dur: n.matches('.onoff') ? 60 : 130 });
  going(F, page.querySelector('.lamp-pool'));
  if (hdr && !shared) going(F, hdr);
  else if (hdr) {
    for (const b of hdr.querySelectorAll('.a2')) going(F, b);
    // the "about" crosses back to the room's as the surface uncovers it; the back button is the room's own
    for (const b of hdr.querySelectorAll('.a1')) F.core(b, [{ opacity: 1 }, { opacity: 0 }], last(150, { easing: 'ease-in-out' }));
  }

  // the surface shrinks into the tile, and the tile's face comes back only at the end. After a back swipe (M13) it
  // starts from the page as the finger left it, shrunk and rounded.
  F.core(sf.S, [p.pose ? swiped(p.pose) : G.open, G.shut], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  F.core(sf.face, [{ transform: 'scale(1, 1)' }, { transform: sf.stretch }], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  F.core(sf.face, [{ opacity: 0 }, { opacity: 1 }], last(FACE_BACK, { easing: 'ease-in-out' }));
  F.core(sf.shadow, [{ opacity: 0 }, { opacity: 1 }], last(150, { easing: T.ease }));
  // the halo is drawn back into the tile's glow, and the glow comes back as it arrives
  if (D.halo && glowTo) {
    const hc = centre(D.haloR);
    D.halo.style.transformOrigin = `${px(hc.x - D.haloBox.left)} ${px(hc.y - D.haloBox.top)}`;
    F.core(D.halo, [{ transform: getComputedStyle(D.halo).transform === 'none' ? 'translate(0px, 0px) scale(1)' : getComputedStyle(D.halo).transform }, { transform: `translate(${px(glowTo.c.x - hc.x)}, ${px(glowTo.c.y - hc.y)}) scale(${glowTo.s})` }], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  }
  if (D.halo) F.core(D.halo, [{ opacity: D.haloO }, { opacity: 0 }], { duration: 350, easing: T.easeIn, fill: 'forwards' });
  const gf = glowFlight(sf, D);
  if (sf.glow) {
    if (gf) F.core(sf.glow.el, [{ transform: gf }, { transform: 'translate(0px, 0px) scale(1)' }], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
    F.core(sf.glow.el, [{ opacity: 0 }, { opacity: 0, offset: 150 / CLOSE.dur, easing: 'ease-in-out' }, { opacity: 1, offset: 400 / CLOSE.dur }, { opacity: 1 }], { duration: CLOSE.dur, easing: 'linear', fill: 'forwards' });
  }

  // the words and the drawing fly back, crossing in the last 0.15 s
  const cross = { crossEase: 'ease-in-out' };
  pair(F, 'close', { dest: D.h1, Dt: D.Ht, Db: D.Hb, p: O.nm, k: 1, top, ...cross });
  for (const o of D.out) pair(F, 'close', { dest: o.dest, Dt: o.Dt, Db: o.Db, p: o.p, k: 1, top, raise: false, ...cross });
  if (D.art && O.art) pair(F, 'close', { dest: D.art, Dt: D.artR, Db: D.artR, p: O.art, k: 1, top, copy: copyNode(O.art, 1), to: D.artO, from: opacityOf(O.art.el), raise: false, ...cross });
  else if (D.art) going(F, D.art);
  const back = last(130, { easing: 'ease-in-out' });
  for (const r of D.rest) { const c = copyText(r, 1); top.appendChild(c); F.core(c, [{ opacity: 0 }, { opacity: 1 }], back); }
  for (const x of O.extras) { const c = copyNode(x, 1); top.appendChild(c); F.core(c, [{ opacity: 0 }, { opacity: opacityOf(x.el) }], back); }
  if (O.pwr) { const b = copyButton(O.pwr, 1); top.appendChild(b); F.core(b, [{ opacity: 0 }, { opacity: 1 }], last(150, { easing: 'ease-in-out' })); }

  // the room returns around the tile, nearest first, and its tab bar comes back up (after a back swipe the room is
  // already there, under the page, and comes up with it)
  if (p.pose) return true;
  stepAside(F, 'close', steps, { at: 70, back: 400, backFade: 300 });
  if (!shared) scrim(F, screen.querySelector('.room > .hdr'), 0, 1, { duration: 300, delay: 70, easing: T.ease, fill: 'backwards' }, 'extra');
  if (showTabs) F.extra(tabs, [{ opacity: 0, translate: '0px 120px', scale: '0.96' }, { opacity: 1, translate: '0px 0px', scale: '1' }], { duration: 400, delay: 70, easing: T.ease, fill: 'backwards' });
  if (showTabs && fade) F.extra(fade, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 70, easing: T.ease, fill: 'backwards' });
  return true;
}
// The surface as a back swipe left the page: shrunk about the middle of the screen, as the page was, and rounded.
function swiped(pose) {
  const r = (/round ([\d.]+px)/.exec(pose.clip) || [null, '0px'])[1];
  return { transform: pose.transform, clipPath: `inset(0px 0px 0px 0px round ${r})` };
}
// What goes first as the page closes: every control, one level into anything that holds something that flies.
function controls(page, keep) {
  const out = [];
  const walk = n => {
    for (const k of n.children) {
      if (keep.has(k)) continue;
      if ([...keep].some(x => k.contains(x))) walk(k); else out.push(k);
    }
  };
  walk(page);
  return out;
}
