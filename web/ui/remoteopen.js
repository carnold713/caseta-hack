// M14 · A remote opens from its card (Figma 12916:3670): on Remotes, a remote's card tapped opens into the remote's
// page, and Back closes the page into the card again. opening.js decides when it plays; flight.js holds what it shares
// with the other pages that open this way.
//
// OPEN, from the moment the address changes (T), read off the frame's keyframes:
//   the stage    the card's surface opens where it is into the page's stage, 0.55 s on (0.2, 0, 0, 1): the stage is
//                the window, moved and clipped to the card's box and let go. The card's spotlight (the round light
//                its remote stands in) fades over the first 0.25 s.
//   the remote   the drawing on the card is the big remote on the page: it grows and moves into place on the same
//                curve, never drawn twice.
//   the name     the card's name flies to the page's title, matched on width, crossing only in the first 0.15 s; it
//                may pass behind the growing remote. The card's second line fades in 0.12 s EASE_IN. A name cut short
//                by its ellipsis on the card or on the page does not fly (the two would read differently): it fades
//                where it is, and the title comes in with the model line.
//   the list     the other cards step aside, nearest first 0.03 s apart: beside sideways 60, below down 120, fading
//                (0.25 s EASE_IN) and settling to 0.96; "Remotes" lifts away and its banner goes up.
//   the page     arrives in reading order on (0.2, 0.8, 0.2, 1): the header's "more" (0.12 s) and its back button,
//                sliding in from -12 (0.2 s), the model line and the banner; then each key, top first 0.04 s apart:
//                its dot, its leader drawing on in Lutron blue and settling to white, its label; then what each key
//                controls; then the lights it moves and the key's rows below.
// BACK runs it the other way in 0.45 s on (0.4, 0, 0.2, 1): the page's content goes first (0.15 s EASE_IN), the stage
// closes into the card with its spotlight coming back, the remote and the name fly back, and the cards return.
import { T } from '/ui/motion.js';
import { OPEN, CLOSE, last, textBox, px, opacityOf, part, words, copyNode, topLayer, el, windowGeo, pair, aside, stepAside, rise, going, scrim } from '/ui/flight.js';

const SPOT = 250;       // the card's spotlight fades over the first 0.25 s (and comes back over the close's last 0.3 s)
const KEY = 40;         // the keys arrive this far apart, top first

// ---------- the kind, for opening.js ----------
export const name = 'remote';
export const source = e => e.matches('.rgrid > .rcard[data-go^="remote/"]');
export const opens = ({ from, r, to }) => from === 'remotes/null' && r.name === 'remote' && !r.sub && to === `remote/${r.id}`;
export const minShown = 0.25;
export function find(screen, entry) {
  const card = screen.querySelector(`.rgrid > .rcard[data-go="${CSS.escape(entry.to)}"]`);
  return card && card.querySelector('.rc-nm') ? card : null;
}

// ---------- measuring ----------
// Everything about the card, read while it is still where it was drawn, part way through its press.
export function read(card) {
  const box = card.getBoundingClientRect();
  const k = box.width / (card.offsetWidth || box.width) || 1;
  const q = s => card.querySelector(s);
  const stage = q('.rc-stage');
  const art = stage && stage.querySelector('.pico-photo, .pico-svg');
  const scs = stage && getComputedStyle(stage);
  return {
    card, box, k,
    radius: parseFloat(getComputedStyle(card).borderTopLeftRadius) || 28,
    stage: stage && { r: stage.getBoundingClientRect(), bg: scs.backgroundImage, radius: parseFloat(scs.borderTopLeftRadius) || 20 },
    art: part(art, k),
    nm: words(q('.rc-nm'), k), nmPart: part(q('.rc-nm'), k), nmCut: cutShort(q('.rc-nm')),
    lines: [...card.querySelectorAll('.rc-st, .rc-err, .rc-usual, .rc-cap')].map(n => part(n, k)),
  };
}
// The remote's page, read before it is taken off screen, so it closes from where it is.
export function readClose(screen) {
  const page = screen.querySelector('.remote-page');
  const stage = page && page.querySelector('.rstage');
  if (!stage || !page.querySelector('.page-h1') || stage.getBoundingClientRect().bottom <= 0) return null;
  return { page };
}
// The page as it rests: where the stage, the remote and the title are.
function readPage(page) {
  const stage = page.querySelector('.rstage'), h1 = page.querySelector('.page-h1'), rart = stage.querySelector('.rart');
  return {
    page, stage, h1, rart,
    Hr: stage.getBoundingClientRect(), radius: parseFloat(getComputedStyle(stage).borderTopLeftRadius) || 28,
    Ht: textBox(h1), Hb: h1.getBoundingClientRect(), h1Cut: cutShort(h1),
    artR: rart && rart.getBoundingClientRect(),
  };
}

// A line of words cut short by its ellipsis. The card and the title cut a long name at different places, and the two
// crossing would change the words mid flight; a name cut short on either does not fly (see open and close).
const cutShort = n => !!n && n.scrollWidth > n.clientWidth + 1;

// ---------- building ----------
// The card's spotlight, laid in the stage where it was on the card.
function spotlight(O, D, G) {
  if (!O.stage) return null;
  const p = G.loc(O.stage.r.left, O.stage.r.top);
  const s = el('m14-spot', { position: 'absolute', left: px(p.x), top: px(p.y), width: px(O.stage.r.width / G.k), height: px(O.stage.r.height / G.k), borderRadius: px(O.stage.radius), backgroundImage: O.stage.bg });
  D.stage.prepend(s);
  return s;
}
// The remote's flight, inside the stage (which moves with the window): from where the card drew it to where the page
// does, on the window's curve. Returns [shut, open].
function remoteFlip(O, D, G) {
  if (!O.art || !D.rart || !D.artR) return null;
  const p = G.loc(O.art.r.left, O.art.r.top);
  const rest = { x: D.artR.left - D.Hr.left, y: D.artR.top - D.Hr.top };
  const s = (O.art.r.width / G.k) / (D.artR.width || 1);
  D.rart.style.transformOrigin = '0 0';
  return [{ transform: `translate(${px(p.x - rest.x)}, ${px(p.y - rest.y)}) scale(${s})` }, { transform: 'translate(0px, 0px) scale(1)' }];
}
// Remotes around the card: what steps aside for it. "Remotes" itself lifts away on its own.
function listParts(root, card) {
  const on = n => { const b = n.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.width > 0; };
  return [...root.querySelectorAll('.remotes-page > .listen, .rgrid > .rcard, .remotes-page > .info-row, .remotes-page > .rempty')].filter(n => n !== card && on(n));
}
// The keys on the stage, top first: each one's dot, leader, end and words.
function keys(stage) {
  const svg = stage.querySelector('svg.leaders');
  const paths = svg ? [...svg.querySelectorAll(':scope > path:not(.lead-lit)')] : [];
  const ends = svg ? [...svg.querySelectorAll(':scope > circle.le')] : [];
  const dots = [...stage.querySelectorAll(':scope > .sd')], labels = [...stage.querySelectorAll(':scope > .ld')];
  return labels.map((ld, i) => ({ dot: dots[i], path: paths[i], end: ends[i], lt: ld.querySelector('.lt'), ls: ld.querySelector('.ls') }));
}

// ---------- open ----------
export function open({ O, ghost }, screen, F) {
  const page = screen.querySelector('.remote-page');
  if (!page || !page.querySelector('.rstage') || !page.querySelector('.page-h1') || !O.nm) return false;
  // read everything first
  const D = readPage(page);
  const G = windowGeo(O, D.Hr, O.radius / O.k, D.radius);
  const steps = aside(listParts(ghost, O.card), O.box, { side: 60 });
  const head = ghost.querySelector('.top-h1');
  const K = keys(D.stage);
  const q = s => page.querySelector(s);
  const onScreen = n => { const b = n.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; };
  // what the page draws under the stage, and the notes it may draw over it
  const after = n => !!(D.stage.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
  const below = [...page.children].filter(after);
  const before = [...page.children].filter(n => n.matches('.note, .offer') && !after(n));

  // then write
  const top = topLayer(screen, 'm14-top');
  F.undo(() => top.remove());
  // the card's surface opens into the stage, and the spotlight the remote stood in goes as it opens
  F.core(D.stage, [G.shut, G.open], { duration: OPEN.dur, easing: OPEN.ease });
  const spot = spotlight(O, D, G);
  if (spot) { F.undo(() => spot.remove()); F.core(spot, [{ opacity: 1 }, { opacity: 0 }], { duration: SPOT, easing: 'ease-in-out', fill: 'forwards' }); }
  // the remote grows and moves into place
  const flip = remoteFlip(O, D, G);
  if (flip) { F.core(D.rart, flip, { duration: OPEN.dur, easing: OPEN.ease }); F.undo(() => { D.rart.style.transformOrigin = ''; }); }
  // the name flies to the title; the rest of the card goes where it is. A name cut short on the card or on the page
  // goes where it is too, and the title comes in with the model line under it, each as it rests.
  const flies = !O.nmCut && !D.h1Cut;
  if (flies) pair(F, 'open', { dest: D.h1, Dt: D.Ht, Db: D.Hb, p: O.nm, k: O.k, top, crossEase: 'ease-in-out' });
  else if (O.nmPart) { const c = copyNode(O.nmPart, O.k); top.appendChild(c); F.core(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: T.easeIn, fill: 'forwards' }); }
  for (const l of O.lines) { const c = copyNode(l, O.k); top.appendChild(c); F.core(c, [{ opacity: opacityOf(l.el) }, { opacity: 0 }], { duration: 120, easing: T.easeIn, fill: 'forwards' }); }

  // the other cards step aside, and "Remotes" lifts away
  stepAside(F, 'open', steps);
  if (head) F.core(head, [{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 200, easing: T.easeIn, fill: 'forwards' });
  // the scrim behind it, when Remotes was scrolled, goes with it
  if (head) scrim(F, head.closest('.bar'), 1, 0, { duration: 200, easing: T.easeIn, fill: 'forwards' });

  // the page arrives in reading order
  rise(F, q('.hdr .a1'), 120, { dy: 0, dur: 220 });
  rise(F, q('.hdr .back'), 200, { dx: -12, dy: 0, dur: T.standard });
  if (!flies) rise(F, D.h1, 300, { dx: 8, dy: 0, dur: T.standard });
  rise(F, q('.rm-sub'), 350, { dx: 8, dy: 0, dur: T.standard });
  rise(F, page.querySelector(':scope > .listen'), 400, { dy: 12, dur: 320 });
  before.forEach((n, i) => rise(F, n, 450 + i * 50, { dy: 12, dur: 320 }));
  // the key picked is ringed as its keys arrive
  for (const r of D.stage.querySelectorAll('.pk.sel .pk-ring')) F.extra(r, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 500, easing: T.ease, fill: 'backwards' });
  // each key, top first: its dot, its leader drawn on in Lutron blue and settling to white, its end, its label, and
  // then what it controls
  K.forEach((k, i) => {
    const at = 500 + i * KEY;
    if (k.dot) F.extra(k.dot, [{ opacity: 0, scale: '0.5' }, { opacity: opacityOf(k.dot), scale: '1' }], { duration: 200, delay: at, easing: T.ease, fill: 'backwards' });
    if (k.path) drawOn(F, k.path, at);
    if (k.end) { k.end.style.transformBox = 'fill-box'; k.end.style.transformOrigin = 'center'; F.extra(k.end, [{ opacity: 0, scale: '0.5' }, { opacity: 1, scale: '1' }], { duration: 200, delay: at + 220, easing: T.ease, fill: 'backwards' }); }
    rise(F, k.lt, at + 100, { dx: -8, dy: 0, dur: 320 });
    rise(F, k.ls, at + 280, { dy: 6, dur: 320 });
  });
  // then the lights it moves and the key's rows
  let at = 940;
  for (const n of below.filter(onScreen)) { rise(F, n, at, n.matches('.rm-key') ? { dy: 12, dur: 320 } : { scale: 0.96 }); at += 60; }
  F.hold = 1500;
  return true;
}
// A leader drawing on: a copy of it in Lutron blue traces it from the key to the words (0.28 s), holds, and gives way
// to the white line under it over 0.4 s.
function drawOn(F, path, at) {
  const blue = path.cloneNode(false);
  blue.removeAttribute('class');
  blue.setAttribute('pathLength', '1');
  Object.assign(blue.style, { fill: 'none', stroke: 'var(--blue)', strokeWidth: '1.5', strokeDasharray: '1 1', strokeOpacity: '1' });
  path.after(blue);
  const drawn = F.extra(blue, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 280, delay: at, easing: T.ease, fill: 'both' });
  const gone = F.extra(blue, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: at + 500, easing: 'ease-in-out', fill: 'both' });
  F.extra(path, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: at + 500, easing: 'ease-in-out', fill: 'backwards' });
  const drop = () => blue.remove();
  gone.finished.then(drop, drop);
  drawn.finished.catch(drop);
}

// ---------- back ----------
export function close(p, screen, F, { ghost, O, el: card }) {
  const D = readPage(p.page);
  const G = windowGeo(O, D.Hr, O.radius / O.k, D.radius);
  const steps = aside(listParts(screen, card), O.box, { side: 60 });
  // the banner comes back once the page's own header has gone from over it (0.18 s, as the frame has it)
  for (const s of steps) if (s.el.matches('.listen')) s.delay += 180;
  const head = screen.querySelector('.top-h1');
  const leaving = [...p.page.children].filter(n => n !== D.stage && n !== D.h1 && !n.matches('.hdr'));
  const inStage = [...D.stage.children].filter(n => n !== D.rart);
  const hdr = p.page.querySelector('.hdr');

  const top = topLayer(ghost, 'm14-top');
  F.undo(() => top.remove());
  // the page's content goes first, together; the back button a moment later
  for (const n of [...leaving, ...inStage]) going(F, n, { dur: 150 });
  for (const r of D.stage.querySelectorAll('.pk.sel .pk-ring')) going(F, r, { dur: 150 });
  if (hdr) { going(F, hdr.querySelector('.a1'), { dur: 150 }); going(F, hdr.querySelector('.back'), { dur: 150, at: 100 }); }

  // the stage closes into the card, the spotlight coming back into it, and the remote shrinks back onto it
  F.core(D.stage, [G.open, G.shut], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  const spot = spotlight(O, D, G);
  if (spot) F.core(spot, [{ opacity: 0 }, { opacity: 1 }], last(300, { easing: 'ease-in-out' }));
  const flip = remoteFlip(O, D, G);
  if (flip) F.core(D.rart, [flip[1], flip[0]], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  // the title flies back into the name, crossing in the last 0.15 s; the card's second line comes back in the last 0.2 s.
  // A name cut short on either goes with the page and comes back on the card with its second line.
  if (!O.nmCut && !D.h1Cut) pair(F, 'close', { dest: D.h1, Dt: D.Ht, Db: D.Hb, p: O.nm, k: 1, top, crossEase: 'ease-in-out' });
  else {
    going(F, D.h1, { dur: 150 });
    if (O.nmPart) { const c = copyNode(O.nmPart, 1); top.appendChild(c); F.core(c, [{ opacity: 0 }, { opacity: 1 }], last(200, { easing: T.ease })); }
  }
  for (const l of O.lines) { const c = copyNode(l, 1); top.appendChild(c); F.core(c, [{ opacity: 0 }, { opacity: opacityOf(l.el) }], last(200, { easing: T.ease })); }

  // the cards return, nearest first, and "Remotes" comes down into place (after a back swipe they are already there,
  // under the page, and come up with it)
  if (p.pose) return true;
  stepAside(F, 'close', steps, { back: 400, backFade: 300 });
  F.extra(head, [{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 280, delay: 120, easing: T.ease, fill: 'backwards' });
  if (head) scrim(F, head.closest('.bar'), 0, 1, { duration: 280, delay: 120, easing: T.ease, fill: 'backwards' }, 'extra');
  return true;
}
