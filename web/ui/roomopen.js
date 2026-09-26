// M10 · Opening a room: the Figma frame the owner approved for a room card on Rooms opening into its page, and the
// same run backwards when the room is left for Rooms again. opening.js decides when it plays; flight.js holds what it
// shares with the other pages that open this way.
//
// OPEN, from the moment the address changes (T):
//   the window  the card's picture opens where it is into the room page's photograph, 0.55 s on (0.2, 0, 0, 1). The
//               page's own photograph card is the window: it starts moved and clipped to the card's box and ends
//               where it is. The picture inside is never rescaled, because the card already shows the middle of
//               the page's photograph at the page's scale (screens.css, .room-big .room-photo).
//   the face    what the card lays over its picture (the grey veil of a room that is off, the warmth, the dark
//               shade under the name) is laid over the window where it was on the card and fades in the
//               first 0.3 s. The shade stays on the window's bottom edge and the rest covers the whole window, so
//               no edge ever crosses the photograph.
//   the name    the page's title flies from the card's label, width matched, on the window's curve; the two
//               crossfade only in the first 0.15 s, where the change of weight cannot be seen.
//   the list    the other cards step aside (up 40 above, down 120 below) and fade, 0.25 s EASE_IN, nearest first
//               0.03 s apart, and "Rooms" lifts away; the card's status and power fade in 0.12 s.
//   the room    fills in in reading order: the header, the count badge, the room's On and Off, the count, the scenes,
//               the tiles, and the room's one light at the top of the screen, fading in as it opens.
// BACK is the same run the other way, faster (0.45 s on (0.4, 0, 0.2, 1)), with the room's content gone first. A room
// let go by Android's back swipe (M13) closes from the shrunk pose the finger left (opening.js starts its ghost there).
import { T } from '/ui/motion.js';
import { OPEN, CLOSE, CROSS, last, shown, textBox, px, opacityOf, part, copyText, copyButton, topLayer, el, windowGeo, pair, stepAside, parts as barParts, scrim, aside, homeParts, pictureFrame, pictureGeo } from '/ui/flight.js';

const FACE = 300;       // the card's face fades over the first (open) or last (back) 0.3 s
const RADIUS = 28;      // the card's corners, which the window keeps

// ---------- measuring ----------
// Everything about the card the transition needs, read while it is still where it was drawn. The card may be
// part way through its press (0.97), so its scale is read too and the window starts exactly where it is.
function readCard(card) {
  const box = card.getBoundingClientRect();
  const k = box.width / (card.offsetWidth || box.width) || 1;
  const q = s => card.querySelector(s);
  // an illustrated room (roomscene.js) is a picture like a photograph: the card shows the middle of the page's own
  const photo = card.classList.contains('photo') || card.classList.contains('scene');
  const veil = q('.rm-veil'), warm = q('.rm-warm');
  // a room pinned on Home: a smaller card that shows the whole room, so its picture is matched point for point
  const home = card.classList.contains('pin-room');
  return {
    card, box, k, home, pic: home ? pictureFrame(card) : null,
    bg: photo ? null : getComputedStyle(card).backgroundImage,
    shade: photo ? getComputedStyle(card, '::after').backgroundImage : null,
    nm: part(q('.nm'), k), vl: part(q('.vl'), k), pwr: part(q('.pwr'), k), pill: part(q('.add-photo'), k),
    art: q('.room-art') && { r: q('.room-art').getBoundingClientRect(), opacity: opacityOf(q('.room-art')) },
    veil: veil && opacityOf(veil) > 0.01 ? { bg: getComputedStyle(veil).backgroundColor, filter: getComputedStyle(veil).backdropFilter, opacity: opacityOf(veil) } : null,
    warm: warm && opacityOf(warm) > 0.001 ? { bg: getComputedStyle(warm).backgroundColor, blend: getComputedStyle(warm).mixBlendMode, opacity: opacityOf(warm) } : null,
  };
}

// ---------- building ----------

// The window's geometry: the photograph card moved and scaled so its middle sits on the card, and clipped to the
// card's box. From a pinned card on Home, which shows the whole room smaller, the photograph card is scaled down
// until its picture lies on the card's, the same point of the room on the same point of the screen.
function geometry(O, Hr, hero, hp0 = null) {
  const hp = O.pic && (hp0 || pictureFrame(hero, O.pic.nat));
  if (O.home && hp) return pictureGeo(O, Hr, hp, RADIUS, RADIUS);
  return windowGeo(O, Hr, RADIUS / O.k, RADIUS);
}
// What steps aside around the card, and the header that lifts away: Rooms' list and its "Rooms", or the rest of Home.
function around2(root, card, O) {
  if (card.classList.contains('pin-room')) return { steps: aside(homeParts(root, card, false), O.box), head: root.querySelector('.home > .home-head') };
  const list = root.querySelector('.rooms-list');
  return { steps: list ? around(list, card) : [], head: root.querySelector('.rooms-head') };
}

// The card's face over the window. Each part is [element, keyframe when shut, keyframe when open]; the caller
// plays them one way or the other. Only the shade is locked to an edge (the bottom, where the name was); the veil
// and the warmth are even all over, so they simply cover the window.
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

// The light at the top of the screen (home.js, topLight). Rooms has the house's and a room its own, from the same
// place, so one crosses into the other on one clock: left to go with Rooms' page, the house's stayed whole until that
// page was taken away as the open landed, and went out in a single frame (and came on in one as the room closed).
const topLight = root => root && root.querySelector(':scope > .rooms > .onelight');

// Rooms' other cards, and which way each steps: those above up 40, those below down 120, nearest first.
function around(list, card) {
  const kids = [...list.children];
  const at = kids.indexOf(card);
  return kids.map((k, i) => (i === at ? null : { el: k, dy: i < at ? -40 : 120, delay: (Math.abs(i - at) - 1) * 30 })).filter(Boolean);
}

// ---------- the kind, for opening.js ----------
export const name = 'room';
// A card on Rooms opens this way, and a room's card in Home's Pinned grid.
export const source = e => e.matches('.room-big[data-go], .pin-grid .pin-room[data-go]');
export const opens = ({ from, r, to }) => (from === 'rooms/null' || from === 'home/null') && r.name === 'room' && !r.sub && to === `room/${r.id}`;
export const minShown = 0.25;
export const read = readCard;
// The room page, read before it is taken off screen, so its photograph closes from where it is.
export function readClose(screen) {
  const hero = screen.querySelector('.room-photo-card'), h1 = screen.querySelector('.room-title h1');
  if (!hero || !h1 || shown(hero) <= 0) return null;
  const art = hero.querySelector('.room-art');
  return { hero, h1, Hr: hero.getBoundingClientRect(), Ht: textBox(h1), Hb: h1.getBoundingClientRect(), artR: art && art.getBoundingClientRect(), hp: pictureFrame(hero) };
}
// The card on Rooms (or pinned on Home) that the room closes into.
export function find(screen, entry) {
  const card = screen.querySelector(`${entry.from === 'home/null' ? '.pin-grid .pin-room' : '.room-big'}[data-go="${CSS.escape(entry.to)}"]`);
  return card && card.querySelector('.nm') ? card : null;
}

// ---------- open ----------
export function open({ O, ghost }, screen, F) {
  const hero = screen.querySelector('.room-photo-card'), h1 = screen.querySelector('.room-title h1');
  if (!hero || !h1 || !O.nm) return false;
  // read everything first
  const Hr = hero.getBoundingClientRect(), Hb = h1.getBoundingClientRect(), Ht = textBox(h1);
  const artR = (hero.querySelector('.room-art') || { getBoundingClientRect: () => null }).getBoundingClientRect();
  const G = geometry(O, Hr, hero);
  const q = s => screen.querySelector(s);
  const onScreen = e => { const b = e.getBoundingClientRect(); return b.top < innerHeight && b.left < innerWidth && b.bottom > 0; };
  const chips = [...screen.querySelectorAll('.room-chips > *')].filter(onScreen);
  const tiles = [...screen.querySelectorAll('.room-grid > .tile, .room-empty')].filter(onScreen);
  const { steps, head } = around2(ghost, O.card, O);
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
  // ("Rooms" goes by its parts, and its scrim fades on its own, so the scrim keeps its blur while it goes: flight.js)
  const lift = { duration: 200, easing: T.easeIn, fill: 'forwards' };
  if (head) { for (const n of barParts(head)) F.core(n, [{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(-16px)' }], lift); scrim(F, head, 1, 0, lift); }

  // the room's one light comes up at the top of the screen as it opens, and the house's over Rooms goes out as it comes, on the same clock, so the one never dips while the other has not
  // come (a pinned card's Home steps aside whole). Both are done as the window lands, as the house's must be: it goes
  // with Rooms' page then.
  const tops = { duration: OPEN.dur - 100, delay: 100, easing: 'ease-in-out' };
  const lamp = q('.room > .onelight');
  if (lamp && opacityOf(lamp) > 0.001) play(lamp, [{ opacity: 0 }, { opacity: opacityOf(lamp) }], tops);
  const house = topLight(ghost);
  if (house && opacityOf(house) > 0.001) F.core(house, [{ opacity: opacityOf(house) }, { opacity: 0 }], { ...tops, fill: 'both' });

  // the room fills in, in reading order
  const rise = (n, delay, dur = T.enter, dy = 12) => play(n, [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'translateY(0px)' }], { duration: dur, easing: T.ease, delay });
  play(q('.room > .hdr .back'), [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'translateX(0px)' }], { duration: T.standard, easing: T.ease, delay: 200 });
  play(q('.room > .hdr .a1'), [{ opacity: 0 }, { opacity: 1 }], { duration: T.standard, easing: T.ease, delay: 120 });
  play(q('.room > .hdr .a2'), [{ opacity: 0 }, { opacity: 1 }], { duration: T.standard, easing: T.ease, delay: 160 });
  play(hero.querySelector('.badge'), [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: T.standard, easing: T.ease, delay: 350 });
  play(hero.querySelector('.add-photo'), [{ opacity: 0 }, { opacity: 1 }], { duration: T.standard, easing: T.ease, delay: 350 });
  rise(hero.querySelector('.room-onoff'), 400);
  rise(q('.room-title .count'), 500);
  rise(q('.room > .room-bright'), 420);
  rise(q('.room-sec'), 400);
  chips.forEach((c, i) => rise(c, 400 + i * T.stagger));
  tiles.forEach((t, i) => {
    const at = 460 + i * 50;
    play(t, [{ opacity: 0, transform: 'translateY(24px) scale(0.96)' }, { opacity: 1, transform: 'translateY(0px) scale(1)' }], { duration: 400, easing: T.ease, delay: at });
  });
  return true;
}

// ---------- back ----------
export function close(p, screen, F, { ghost: g, O, el: card }) {
  const { hero, h1, Hr, Ht, Hb, artR, hp } = p;
  const G = geometry(O, Hr, hero, hp);
  const room = g.querySelector('.room');
  const { steps, head } = around2(screen, card, O);
  const top = topLayer(g, 'm10-top');
  F.undo(() => top.remove());

  // the room's content goes first, together
  const fade = { duration: 150, easing: T.easeIn, fill: 'forwards' };
  const lamp = room && room.querySelector(':scope > .onelight');
  const going = [
    ...(room ? [...room.children].filter(n => n !== hero && n !== lamp && !n.classList.contains('room-title')) : []).flatMap(barParts),
    ...[...h1.parentElement.children].filter(n => n !== h1),
    ...hero.querySelectorAll('.badge, .room-onoff, .add-photo'),
  ];
  if (room) for (const n of room.children) scrim(F, n, 1, 0, fade);
  // each from where it is: the count beside the title has already faded if the room was scrolled (header.css)
  const was = going.map(opacityOf);
  going.forEach((n, i) => F.core(n, [{ opacity: was[i] }, { opacity: 0 }], fade));
  // the room's light at the top of the screen crosses into the house's over Rooms on the close's own clock (after a back
  // swipe Rooms is already there with its light, coming up from under the dark, so only the room's goes)
  const light0 = { duration: CLOSE.dur, easing: 'ease-in-out' };
  if (lamp && opacityOf(lamp) > 0.001) F.core(lamp, [{ opacity: opacityOf(lamp) }, { opacity: 0 }], { ...light0, fill: 'forwards' });
  const house = !p.pose && topLight(screen);
  if (house && opacityOf(house) > 0.001) F.extra(house, [{ opacity: 0 }, { opacity: opacityOf(house) }], { ...light0, fill: 'backwards' });

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
  // Home behind a back swipe waits with everything in its place (predictiveback.js), and comes up with the page: none
  // of it steps back in. Stepping in from nothing, all of Home went dark the moment the finger let go.
  if (p.pose && !L) return true;
  if (L) for (const s of steps) F.extra(s.el, [{ opacity: 1, transform: `translateY(${s.dy < 0 ? L.up : L.down}px) scale(1)` }, { opacity: 1, transform: 'translateY(0px) scale(1)' }], { duration: 400, easing: T.ease, delay: s.delay, fill: 'backwards' });
  else stepAside(F, 'close', steps, { back: 400, backFade: 400 });
  const down = { duration: 400, easing: T.ease, fill: 'backwards' };
  for (const n of barParts(head)) F.extra(n, [L ? { opacity: 1, transform: `translateY(${L.head}px)` } : { opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'translateY(0px)' }], down);
  if (!L) scrim(F, head, 0, 1, down, 'extra');

  return true;
}
