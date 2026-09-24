// M16 · Colour to White and back, "Gather" (Figma 12979:5513, key poses 12980:5529), read with get_motion_context.
//
// A lamp that does both has White and Colour on one sheet, and the two tabs are two sheets (#light/<id>/white and
// /colour) that swap in place. What changes between them is the lamp's own colour, so the swap is told as that colour
// travelling:
//
//   Colour to White   the pill slides (0.24 s standard) and the title crossfades; the wheel gathers into its handle,
//                     the lamp's colour (scale to 0.12 about the handle, 0.4 s); that dot travels to the lamp's new
//                     white on the sky (0.55 s from 0.28 s, fast along and eased up and down, so it arcs) and turns
//                     from the colour to the white on the dimmer; the sky fades in under it, the line of whites draws
//                     out from the sun both ways (0.5 s ease-out from 0.73 s), the five moments on it come up nearest
//                     first, and the rest of the sheet rises in after, 0.04 s apart, done by about 1.3 s.
//   White to Colour   the same, backwards: the sheet's whites go and the line gathers into the sun, the dot travels
//                     home turning to the colour, and the wheel unfolds out of it (0.55 s from 0.56 s).
//
// The old sheet is a copy laid over the new one (inert, never tapped) for the part of it that leaves; the new sheet
// is drawn at once and its parts are held back by animations with a delay and `fill: backwards`, which motion.carry
// carries over should the house redraw the sheet meanwhile. The travelling dot is its own element over both. It all
// lives inside the sheet, so it scrolls and clips with it, and nothing of it outlives the sheet.
import { T, reduced, holdFor } from '/ui/motion.js';

const STD = T.ease;                                    // standard, cubic-bezier(0.2, 0.8, 0.2, 1)
const GATHER = 'cubic-bezier(0.4, 0, 0.2, 1)';         // the wheel folding into its handle
const EMPH = 'cubic-bezier(0.2, 0, 0, 1)';             // the dot's flight, the wheel opening out
export const LENGTH = 1300;                            // tap to the last chip landed

const kindOf = lk => (lk ? (lk.classList.contains('ws') ? 'white' : lk.classList.contains('cs') ? 'colour' : null) : null);
const lkIn = root => root && root.querySelector('.sheet .lk-sheet');
const dotIn = (lk, kind) => lk && lk.querySelector(kind === 'colour' ? '.wheel .handle' : '.ws-thumb .disc');
// the dot as it is seen: the wheel's handle wears its 3 px ring inside its 36, the sun its 2 px ring outside its 28
const seen = (r, kind) => (kind === 'white' ? { left: r.left - 2, top: r.top - 2, width: r.width + 4, height: r.height + 4 } : r);

// Before the swap: what the old sheet looked like, where its dot was, and a copy of it to lay over the new one.
export function capture(root, to) {
  if (reduced()) return null;
  const lk = lkIn(root), from = kindOf(lk);
  if (!from || from === to) return null;
  const sheet = lk.closest('.sheet'), dot = dotIn(lk, from);
  if (!dot) return null;
  const copy = lk.cloneNode(true);
  copy.querySelector('.seg2')?.remove();
  const head = sheet.querySelector('.sheet-head');
  const pill = sheet.querySelector('.seg2 .pill-bg');
  // every place is kept inside the sheet, from its top: the two sheets can differ in height, and the old one's copy
  // rides with the sheet as its top edge moves to the new height
  const L = local(sheet);
  // a line of the head, laid over the new head: it takes the head's styles with it, as it will not be inside the head
  const copyAt = el => {
    const node = el.cloneNode(true), cs = getComputedStyle(el);
    for (const k of TEXT) node.style.setProperty(k, cs.getPropertyValue(k));
    return { node, rect: L(el.getBoundingClientRect()) };
  };
  return {
    from, to, copy, rect: L(lk.getBoundingClientRect()), top: sheet.getBoundingClientRect().top,
    dot: { rect: L(dot.getBoundingClientRect()), bg: getComputedStyle(dot).backgroundColor },
    title: head && head.querySelector('.t-sheet') ? copyAt(head.querySelector('.t-sheet')) : null,
    over: head && head.querySelector('.t-over') ? copyAt(head.querySelector('.t-over')) : null,
    pill: pill ? L(pill.getBoundingClientRect()).left : null,
    tabs: [...sheet.querySelectorAll('.seg2 button')].map(b => getComputedStyle(b).color),
  };
}
const TEXT = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'color', 'white-space', 'overflow', 'text-overflow', 'padding-right', 'height'];
// a place on screen as a place inside the sheet (which scrolls), from its top left
const local = sheet => { const s = sheet.getBoundingClientRect(), y = sheet.scrollTop; return r => ({ left: r.left - s.left, top: r.top - s.top + y, width: r.width, height: r.height }); };

// After the swap has drawn the new sheet: play the gather.
export function play(cap, root) {
  if (!cap) return;
  const lk = lkIn(root);
  if (kindOf(lk) !== cap.to) return;               // the redraw has not happened (a finger was down): no animation
  const sheet = lk.closest('.sheet'), dot = dotIn(lk, cap.to);
  if (!sheet || !dot) return;
  holdFor(LENGTH + 50);
  const L = local(sheet);
  const made = [];
  const layer = (el, r) => {
    Object.assign(el.style, { position: 'absolute', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: '0', pointerEvents: 'none', zIndex: '3' });
    el.setAttribute('aria-hidden', 'true'); el.inert = true; el.classList.add('m16-copy');
    sheet.appendChild(el); made.push(el);
    return el;
  };

  // ---- the old sheet, leaving
  const old = layer(cap.copy, cap.rect);
  const oldDot = dotIn(old, cap.from); if (oldDot) oldDot.style.visibility = 'hidden';
  if (cap.from === 'colour') leaveColour(old); else leaveWhite(old);

  // ---- the head: the title crossfades with the pill, the sub a little after, once the light has turned
  const head = sheet.querySelector('.sheet-head');
  const subAt = cap.to === 'white' ? 380 : 370;
  for (const [was, sel, delay] of [[cap.title, '.t-sheet', 0], [cap.over, '.t-over', subAt]]) {
    const now = head && head.querySelector(sel);
    if (!was || !now || was.node.textContent === now.textContent) continue;
    const ghost = layer(was.node, was.rect); ghost.style.zIndex = '4';
    fade(ghost, 1, 0, { duration: T.standard, delay, easing: STD, fill: 'forwards' });
    fade(now, 0, 1, { duration: T.standard, delay, easing: STD, fill: 'backwards' });
  }
  // the pill slides from where it was; the two words trade colour with it
  const pill = sheet.querySelector('.seg2 .pill-bg');
  if (pill && cap.pill != null) {
    const dx = cap.pill - L(pill.getBoundingClientRect()).left;
    if (Math.abs(dx) > 1) pill.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: T.standard, easing: STD });
  }
  sheet.querySelectorAll('.seg2 button').forEach((b, i) => {
    const was = cap.tabs[i], now = getComputedStyle(b).color;
    if (was && was !== now) b.animate([{ color: was }, { color: now }], { duration: T.standard, easing: STD });
  });

  // the sheet's top edge moves to the new sheet's height with the pill, rather than jumping
  const lift = cap.top - sheet.getBoundingClientRect().top;
  if (Math.abs(lift) > 1) sheet.animate([{ transform: `translateY(${lift}px)` }, { transform: 'none' }], { duration: T.dimmer, easing: STD });

  // ---- the lamp's colour, travelling
  const lands = cap.to === 'white' ? 830 : 810;
  const r0 = seen(cap.dot.rect, cap.from), r1 = seen(L(dot.getBoundingClientRect()), cap.to);
  const fly = document.createElement('span');
  fly.className = 'm16-dot';
  fly.style.setProperty('--m16-ring', cap.from === 'colour' ? '3px' : '2px');
  fly.innerHTML = `<i class="m16-y"><b class="m16-was"></b><b class="m16-now"></b></i>`;
  layer(fly, r0); fly.style.height = `${r0.height}px`; fly.style.zIndex = '5';
  fly.querySelector('.m16-was').style.background = cap.dot.bg;
  fly.querySelector('.m16-now').style.background = getComputedStyle(dot).backgroundColor;
  const dx = (r1.left + r1.width / 2) - (r0.left + r0.width / 2), dy = (r1.top + r1.height / 2) - (r0.top + r0.height / 2);
  const s = r1.width / r0.width, start = lands - 550;
  // along the sheet fast and settling (EMPH), up and down eased both ways: together an arc, as the file draws it
  fly.animate([{ transform: 'none' }, { transform: `translateX(${dx}px)` }], { duration: 550, delay: start, easing: EMPH, fill: 'both' });
  fly.querySelector('.m16-y').animate([{ transform: 'none' }, { transform: `translateY(${dy}px) scale(${s})` }], { duration: 550, delay: start, easing: T.easeBoth, fill: 'both' });
  fade(fly.querySelector('.m16-now'), 0, 1, { duration: T.dimmer, delay: start, easing: T.easeBoth, fill: 'both' });
  // the new sheet's own dot takes over the moment the travelling one lands
  const own = cap.to === 'white' ? lk.querySelector('.ws-thumb') : dot;
  if (own) own.animate([{ opacity: 0 }, { opacity: 0 }], { duration: lands, fill: 'none' });

  if (cap.to === 'white') arriveWhite(lk); else arriveColour(lk, dot);

  // ---- tidy: every copy goes when it is done, or at once if the sheet closes first
  let done = false;
  const tidy = () => { if (done) return; done = true; obs.disconnect(); made.forEach(el => el.remove()); };
  const obs = new MutationObserver(() => { if (root.hidden || !root.contains(sheet)) tidy(); });
  obs.observe(root, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  setTimeout(() => { fly.remove(); }, lands + 20);
  setTimeout(tidy, LENGTH + 50);
}

// ---------- the parts ----------
const fade = (el, a, b, o) => el && el.animate([{ opacity: a }, { opacity: b }], o);
// in from 12 px lower (or `y`), to the element's own opacity (a named white the lamp cannot reach rests at 0.55)
function rise(el, delay, { y = 12, dur = T.enter } = {}) {
  if (!el) return;
  const o = getComputedStyle(el).opacity;
  el.animate([{ opacity: 0, translate: `0 ${y}px` }, { opacity: o, translate: '0 0' }], { duration: dur, delay, easing: STD, fill: 'backwards' });
}
// out 12 px lower, faster than it came, on EASE_IN
function sink(el, delay, dur = T.exit) {
  if (el) el.animate([{ opacity: getComputedStyle(el).opacity, translate: '0 0' }, { opacity: 0, translate: '0 12px' }], { duration: dur, delay, easing: T.easeIn, fill: 'forwards' });
}
// the line of whites, cut to 16 px round the sun (x in the sky's own coordinates) or shown whole
const cut = (w, x) => `inset(0 ${Math.max(0, w - x - 8).toFixed(1)}px 0 ${Math.max(0, x - 8).toFixed(1)}px)`;
function sunIn(lk) {
  const sky = lk.querySelector('.ws-sky'), disc = lk.querySelector('.ws-thumb .disc');
  if (!sky || !disc) return null;
  const b = sky.getBoundingClientRect(), d = disc.getBoundingClientRect();
  return { sky, w: b.width, x: d.left + d.width / 2 - b.left, left: b.left };
}
// the five named moments, nearest the sun first: when each starts, 0 to 1 by its distance
function moments(lk, sun, fn) {
  lk.querySelectorAll('.ws-moment').forEach(m => {
    const r = m.getBoundingClientRect();
    fn(m, Math.min(1, Math.abs(r.left + r.width / 2 - sun.left - sun.x) / sun.w));
  });
}

function leaveColour(old) {
  const wheel = old.querySelector('.wheel'), hd = old.querySelector('.wheel .handle');
  if (wheel && hd) {
    // folding into the handle: its middle is the point the wheel shrinks to
    wheel.style.transformOrigin = `${hd.offsetLeft + hd.offsetWidth / 2}px ${hd.offsetTop + hd.offsetHeight / 2}px`;
    wheel.animate([{ transform: 'none' }, { transform: 'scale(0.12)' }], { duration: T.dimmer, easing: GATHER, fill: 'forwards' });
    fade(wheel, 1, 0, { duration: 360, easing: T.easeIn, fill: 'forwards' });
  }
  sink(old.querySelector('.cs-val'), 0);
  sink(old.querySelector('.cs-sw'), 30);
  old.querySelectorAll('.cs-note').forEach(n => sink(n, 60));
  fade(old.querySelector('.lk-wash'), 1, 0, { duration: T.dimmer, delay: 280, easing: T.easeBoth, fill: 'forwards' });
}

function arriveWhite(lk) {
  fade(lk.querySelector('.lk-wash'), 0, 1, { duration: T.dimmer, delay: 280, easing: T.easeBoth, fill: 'backwards' });
  const sun = sunIn(lk);
  if (sun) {
    fade(sun.sky, 0, 1, { duration: T.enter, delay: 230, easing: STD, fill: 'backwards' });
    const path = sun.sky.querySelector('.sky-path');
    if (path) path.animate([{ clipPath: cut(sun.w, sun.x) }, { clipPath: 'inset(0 0 0 0)' }], { duration: 500, delay: 730, easing: 'ease-out', fill: 'backwards' });
    moments(lk, sun, (m, d) => m.animate([{ opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1 }], { duration: 160, delay: 730 + 250 * d, easing: 'ease-out', fill: 'backwards' }));
    rise(lk.querySelector('.ws-now, .ws-loc'), 830, { y: 8 });
  }
  rise(lk.querySelector('.ws-val'), 480);
  rise(lk.querySelector('.ws-ends'), 830);
  lk.querySelectorAll('.ws-chips .chip').forEach((ch, i) => rise(ch, 900 + T.stagger * i));
  rise(lk.querySelector('.ws-note'), 1140);
  rise(lk.querySelector('.ws-follow'), 1180);
}

function leaveWhite(old) {
  sink(old.querySelector('.ws-val'), 0);
  sink(old.querySelector('.ws-now, .ws-loc'), 0);
  sink(old.querySelector('.ws-ends'), 30);
  old.querySelectorAll('.ws-chips .chip').forEach(ch => sink(ch, 60));
  sink(old.querySelector('.ws-note'), 90);
  sink(old.querySelector('.ws-follow'), 120);
  const sun = sunIn(old);
  if (sun) {
    // the line gathers into the sun, and its moments go, furthest first
    const path = sun.sky.querySelector('.sky-path');
    if (path) path.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: cut(sun.w, sun.x) }], { duration: 280, easing: T.easeIn, fill: 'forwards' });
    moments(old, sun, (m, d) => m.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.5 }], { duration: 100, delay: 30 + 150 * (1 - d), easing: T.easeIn, fill: 'forwards' }));
    fade(sun.sky, 1, 0, { duration: 280, delay: 260, easing: T.easeIn, fill: 'forwards' });
  }
  fade(old.querySelector('.lk-wash'), 1, 0, { duration: T.dimmer, delay: 260, easing: T.easeBoth, fill: 'forwards' });
}

function arriveColour(lk, hd) {
  fade(lk.querySelector('.lk-wash'), 0, 1, { duration: T.dimmer, delay: 260, easing: T.easeBoth, fill: 'backwards' });
  const wheel = lk.querySelector('.wheel');
  if (wheel && hd) {
    // opening out of the handle, where the dot is landing
    wheel.style.transformOrigin = `${hd.offsetLeft + hd.offsetWidth / 2}px ${hd.offsetTop + hd.offsetHeight / 2}px`;
    wheel.animate([{ transform: 'scale(0.12)' }, { transform: 'none' }], { duration: 550, delay: 560, easing: EMPH, fill: 'backwards' });
    fade(wheel, 0, 1, { duration: 300, delay: 560, easing: 'ease-out', fill: 'backwards' });
  }
  rise(lk.querySelector('.cs-val'), 860);
  rise(lk.querySelector('.cs-sw'), 900);
  lk.querySelectorAll('.cs-note').forEach(n => rise(n, 940));
}
