// M10 · Opening a room: the Figma frame the owner approved for a room card on Rooms opening into its page, and the
// same run backwards when the room is left for Rooms again. opening.js decides when it plays; flight.js holds what it
// shares with the other pages that open this way.
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
// BACK is the same run the other way, faster (0.45 s on (0.4, 0, 0.2, 1)), with the room's content gone first. A room
// let go by Android's back swipe (M13) closes from the shrunk pose the finger left (opening.js starts its ghost there).
import { T } from '/ui/motion.js';
import { OPEN, CLOSE, CROSS, last, shown, textBox, px, opacityOf, part, copyText, copyButton, topLayer, el, windowGeo, pair, stepAside } from '/ui/flight.js';

const FACE = 300;       // the card's face fades over the first (open) or last (back) 0.3 s
const RADIUS = 28;      // the card's corners, which the window keeps

// ---------- measuring ----------
// Everything about the card the transition needs, read while it is still where it was drawn. The card may be
// part way through its press (0.97), so its scale is read too and the window starts exactly where it is.
function readCard(card) {
  const box = card.getBoundingClientRect();
  const k = box.width / (card.offsetWidth || box.width) || 1;
  const q = s => card.querySelector(s);
  const photo = card.classList.contains('photo');
  const glows = [...card.querySelectorAll('.glow:not(.off)')].map(g => {
    const cs = getComputedStyle(g); const r = g.getBoundingClientRect();
    return { el: g, x: r.left, y: r.top, transform: cs.transform, opacity: cs.opacity };
  });
  const veil = q('.rm-veil'), warm = q('.rm-warm');
  return {
    card, box, k,
    bg: photo ? null : getComputedStyle(card).backgroundImage,
    shade: photo ? getComputedStyle(card, '::after').backgroundImage : null,
    nm: part(q('.nm'), k), vl: part(q('.vl'), k), pwr: part(q('.pwr'), k), pill: part(q('.add-photo'), k),
    art: q('.room-art') && { r: q('.room-art').getBoundingClientRect(), opacity: opacityOf(q('.room-art')) },
    veil: veil && opacityOf(veil) > 0.01 ? { bg: getComputedStyle(veil).backgroundColor, filter: getComputedStyle(veil).backdropFilter, opacity: opacityOf(veil) } : null,
    warm: warm && opacityOf(warm) > 0.001 ? { bg: getComputedStyle(warm).backgroundColor, blend: getComputedStyle(warm).mixBlendMode, opacity: opacityOf(warm) } : null,
    glows,
  };
}

// ---------- building ----------
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
// card's box.
const geometry = (O, Hr) => windowGeo(O, Hr, RADIUS / O.k, RADIUS);

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
  const own = opacityOf(a);
  if (!O.art) return [a, { opacity: 0 }, { opacity: own }];
  const p = G.loc(O.art.r.left, O.art.r.top);
  const rest = { x: restR.left - Hr.left, y: restR.top - Hr.top };
  const s = (O.art.r.width / G.k) / (restR.width || 1);
  a.style.transformOrigin = '0 0';
  return [a, { transform: `translate(${px(p.x - rest.x)}, ${px(p.y - rest.y)}) scale(${s})`, opacity: O.art.opacity }, { transform: 'translate(0px, 0px) scale(1)', opacity: own }];
}

// Rooms' other cards, and which way each steps: those above up 40, those below down 120, nearest first.
function around(list, card) {
  const kids = [...list.children];
  const at = kids.indexOf(card);
  return kids.map((k, i) => (i === at ? null : { el: k, dy: i < at ? -40 : 120, delay: (Math.abs(i - at) - 1) * 30 })).filter(Boolean);
}

// ---------- the kind, for opening.js ----------
export const name = 'room';
// Only a card on Rooms opens this way.
export const source = e => e.matches('.room-big[data-go]');
export const opens = ({ from, r, to }) => from === 'rooms/null' && r.name === 'room' && !r.sub && to === `room/${r.id}`;
export const minShown = 0.25;
export const read = readCard;
// The room page, read before it is taken off screen, so its photograph closes from where it is.
export function readClose(screen) {
  const hero = screen.querySelector('.room-photo-card'), h1 = screen.querySelector('.room-title h1');
  if (!hero || !h1 || shown(hero) <= 0) return null;
  const art = hero.querySelector('.room-art');
  return { hero, h1, Hr: hero.getBoundingClientRect(), Ht: textBox(h1), Hb: h1.getBoundingClientRect(), artR: art && art.getBoundingClientRect() };
}
// The card on Rooms that the room closes into.
export function find(screen, entry) {
  const card = screen.querySelector(`.room-big[data-go="${CSS.escape(entry.to)}"]`);
  return card && card.querySelector('.nm') ? card : null;
}

// ---------- open ----------
export function open({ O, ghost }, screen, F) {
  const hero = screen.querySelector('.room-photo-card'), h1 = screen.querySelector('.room-title h1');
  if (!hero || !h1 || !O.nm) return false;
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
  const play = (node, kf, o) => F.extra(node, kf, { fill: 'backwards', ...o });
  const top = topLayer(screen, 'm10-top');
  F.undo(() => top.remove());

  // the window
  F.core(hero, [G.shut, G.open], { duration: OPEN.dur, easing: OPEN.ease });
  const parts = face(hero, O, G);
  F.undo(() => parts.forEach(([n]) => n.remove()));
  for (const [n, a, b] of parts) {
    if ('transform' in a) F.core(n, [{ transform: a.transform }, { transform: b.transform }], { duration: OPEN.dur, easing: OPEN.ease, fill: 'forwards' });
    F.core(n, [{ opacity: a.opacity }, { opacity: b.opacity }], { duration: FACE, easing: 'linear', fill: 'forwards' });
  }
  const light = hero.querySelector('.rp-light');
  if (light) F.core(light, [{ opacity: 0 }, { opacity: 1 }], { duration: FACE, easing: 'linear' });
  const art = artFlip(hero, O, G, artR, Hr);
  if (art) {
    F.core(art[0], [art[1], art[2]], { duration: OPEN.dur, easing: OPEN.ease });
    F.undo(() => { art[0].style.transformOrigin = ''; });
  }

  // the name: the title flies out of the label, and the two cross only while they are the label's size
  pair(F, 'open', { dest: h1, Dt: Ht, Db: Hb, p: O.nm, k: O.k, top });
  // the status line and the power circle go at once
  const out = { duration: T.tap, easing: T.easeIn, fill: 'forwards' };
  if (O.vl) { const v = copyText(O.vl, O.k); top.appendChild(v); F.core(v, [{ opacity: 1 }, { opacity: 0 }], out); }
  if (O.pwr) { const b = copyButton(O.pwr, O.k); top.appendChild(b); F.core(b, [{ opacity: 1, transform: `scale(${O.k})` }, { opacity: 0, transform: `scale(${0.6 * O.k})` }], out); }

  // the list steps aside, and "Rooms" lifts away
  stepAside(F, 'open', steps, { fade: 250, move: 250, moveEase: T.easeIn });
  if (head) F.core(head, [{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 200, easing: T.easeIn, fill: 'forwards' });

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
  return true;
}

// ---------- back ----------
export function close(p, screen, F, { ghost: g, O, el: card }) {
  const { hero, h1, Hr, Ht, Hb, artR } = p;
  const G = geometry(O, Hr);
  const room = g.querySelector('.room');
  const list = card.parentElement;
  const steps = list ? around(list, card) : [];
  const head = screen.querySelector('.rooms-head');
  const top = topLayer(g, 'm10-top');
  F.undo(() => top.remove());

  // the room's content goes first, together
  const fade = { duration: 150, easing: T.easeIn, fill: 'forwards' };
  const going = [
    ...(room ? [...room.children].filter(n => n !== hero && !n.classList.contains('room-title')) : []),
    ...[...h1.parentElement.children].filter(n => n !== h1),
    ...hero.querySelectorAll('.badge, .room-acts, .add-photo'),
  ];
  for (const n of going) F.core(n, [{ opacity: 1 }, { opacity: 0 }], fade);

  // the window closes into the card, and the card's face comes back over it
  F.core(hero, [G.open, G.shut], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
  for (const [n, a, b] of face(hero, O, G)) {
    if ('transform' in a) F.core(n, [{ transform: b.transform }, { transform: a.transform }], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });
    F.core(n, [{ opacity: b.opacity }, { opacity: a.opacity }], last(FACE));
  }
  const light = hero.querySelector('.rp-light');
  if (light) F.core(light, [{ opacity: 1 }, { opacity: 0 }], last(FACE));
  const art = artFlip(hero, O, G, artR, Hr);
  if (art) F.core(art[0], [art[2], art[1]], { duration: CLOSE.dur, easing: CLOSE.ease, fill: 'forwards' });

  // the title shrinks back into the label, crossing only at the label's size
  pair(F, 'close', { dest: h1, Dt: Ht, Db: Hb, p: O.nm, k: 1, top, cross: CROSS });
  // the status line and the power circle come back over the last 0.2 s
  if (O.vl) { const v = copyText(O.vl, 1); top.appendChild(v); F.core(v, [{ opacity: 0 }, { opacity: 1 }], last(200, { easing: T.ease })); }
  if (O.pwr) { const b = copyButton(O.pwr, 1); top.appendChild(b); F.core(b, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], last(200, { easing: T.ease })); }

  // the list returns from where it stepped to, nearest first; "Rooms" comes down into place. After a back swipe
  // (M13) it returns from where the swipe showed it, already in view.
  const L = p.pose && p.pose.list;
  if (L) for (const s of steps) F.extra(s.el, [{ opacity: 1, transform: `translateY(${s.dy < 0 ? L.up : L.down}px) scale(1)` }, { opacity: 1, transform: 'translateY(0px) scale(1)' }], { duration: 400, easing: T.ease, delay: s.delay, fill: 'backwards' });
  else stepAside(F, 'close', steps, { back: 400, backFade: 400 });
  F.extra(head, [L ? { opacity: 1, transform: `translateY(${L.head}px)` } : { opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 400, easing: T.ease, fill: 'backwards' });

  // a softer spill of light is drawn back into the card
  const sp = spill(O, top);
  F.extra(sp, [{ opacity: 0, transform: 'scale(1.45)' }, { opacity: 0.35, offset: 0.4 }, { opacity: 0, transform: 'scale(1)' }], { duration: 700, delay: 100, easing: 'ease-in-out', fill: 'both' })
    .finished.catch(() => {}).then(() => sp.remove());
  return true;
}
