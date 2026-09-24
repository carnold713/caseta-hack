// M12 · A scene opens from its chip: the Figma frame the owner approved (12916:3206) for a room's scene chip,
// held, opening where it is into the scene's editor sheet, and the sheet closing back into the chip. The same run
// plays from a scene's tile or row on All scenes. Every other sheet rises and drops as motion.js has it.
//
// THE HOLD   the chip fills with copper from the left over the 0.5 s hold, LINEAR, and empties in 0.2 s EASE_IN
//            if the finger lets go early (the stylesheet, v7/scenes.css; nothing here).
// OPEN, from the moment the sheet is drawn:
//   the surface  the sheet itself, clipped to the chip's box (its pill radius) and let go to its own box (full
//                width, its top, the top corners at the sheet's radius, the bottom corners off the screen) on
//                (0.2, 0, 0, 1) over 0.5 s, while the house scrim comes up behind it (its own 0.24 s fade).
//                The chip's copper covers the surface at first and dissolves into it well inside the first 0.18 s,
//                so no big copper panel ever shows; the chip's outline and glyph go in 0.08 s.
//   the word     the sheet's title flies out of the chip's word, width matched, on the surface's curve; the two
//                crossfade only in the first 0.15 s, where they are the chip's size. Only when the two read alike,
//                whole and on one line each: a word that would change its lines or its ellipsis on the way (a long
//                name whose title takes two lines, a tile's name cut short) goes with the chip's face instead, and
//                the title comes in with the header.
//   the content  the header bits fade and rise 12 at 0.3 s (the "N lights · Room" line at 0.34 s), the stage at
//                0.3 s; then the orbs rise from where the chip was, left to right 0.05 s apart from 0.4 s, each
//                scaling 0.4 to 1 and fading in over 0.45 s on the opening curve, its glow blooming as it lands (a
//                soft radial in its colour, screen, opacity 0 to 1 to 0 over 0.9 s, scale 0.5 to 1.2); its wire,
//                pool, name and number follow it in. Then the rows below from 0.95 s, 0.04 s apart, fade and
//                rise 12 over 0.32 s on (0.2, 0.8, 0.2, 1).
// CLOSE (the close button, a swipe down, the scrim, Back): the orbs gather back toward the chip first (right to
//   left, 0.02 s apart, 0.28 s EASE_IN) while the rows and the header fade (0.2 s EASE_IN); at 0.25 s the sheet
//   goes back into the chip on (0.4, 0, 0.2, 1) over 0.45 s, the scrim clearing (0.28 s EASE_IN), and the title
//   and the chip's word cross only in the last 0.15 s, where the surface lets the chip itself show through. A
//   sheet already being swiped down goes into the chip from wherever the finger left it, at once.
//
// A chip that is not on screen, a sheet reached any other way (a link, a reload), or a phone asking for reduced
// motion gets the plain rise and drop. Transforms, opacity and clip-path only (and the chip's outline, one small
// box); everything is measured before anything is written.
//
// The close can be driven from outside (a back gesture's progress): closer(root) builds it paused and returns
// { total, seek(p), play(), cancel() }, or null when the plain drop applies. seek(p) puts every part at p (0 to 1)
// of the way through, play() runs on from there and resolves when it has landed, cancel() puts the sheet back as
// it was. After play(), closing the sheet as usual (closeSheet) does not drop it a second time.
import { T, reduced, holdFor } from '/ui/motion.js';

const OPEN = { dur: 500, ease: 'cubic-bezier(0.2, 0, 0, 1)' };
const SHUT = { dur: 450, ease: 'cubic-bezier(0.4, 0, 0.2, 1)', at: 250 };
// The chip's copper dissolves into the sheet's surface as the surface grows, and faster than it grows: it is half
// gone by the time the surface is half again the chip's size and all gone well inside the first 0.18 s, so the
// copper never covers more than about one chip's worth of the screen (the owner's rule: no copper flashes).
const FILL = [{ opacity: 1, offset: 0 }, { opacity: 0.45, offset: 0.1 }, { opacity: 0.12, offset: 0.2 }, { opacity: 0.04, offset: 0.3 }, { opacity: 0, offset: 0.5 }, { opacity: 0, offset: 1 }];
const FILL_DUR = 180;
const FACE = 80;        // the chip's outline and glyph go in this much, at once (ease-out), before the surface is big
const CROSS = 150;      // the word and the title cross only in this much, at the chip's end
// and barely overlap in it: the chip's word is gone by 0.07 s and the title comes up from 0.04 s, so the two
// weights are never both plainly there (a straight crossfade showed a doubled word)
const CROSS_OUT = 70, CROSS_IN = 40;
const HEAD = 300, CAP = 340, STAGE = 300, ORBS = 400, ORB_STEP = 50, ORB_DUR = 450, BLOOM = 900;
const ROWS = 950, ROW_STEP = 40, ROW_DUR = 320;
const GATHER = 280, GATHER_STEP = 20, FADE = 200, SCRIM_OUT = 280;

let armed = null;    // a source just held or tapped: { key, parent, sel, O, until }, until its sheet is drawn
let source = null;   // the sheet a source opened: { key, parent, sel, pid }
let flight = null;   // the open playing: { root, until, anims, undo }
let outside = null;  // a close built paused (from outside) for the sheet on show: { sheet, ctl }

const dec = s => { try { return decodeURIComponent(s); } catch (_) { return s; } };
const here = () => dec(location.hash.replace(/^#/, ''));
const px = n => `${Math.round(n * 100) / 100}px`;
const centre = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// ---------- the app's side ----------
// A hold that has just completed on an element, before its action runs (app.js endHold). Only a scene's hold
// ("scene-edit") opens this way.
export function held(el) {
  if (el && el.dataset.hold === 'scene-edit') arm(el);
}
// A tap, before its action runs: a chip in the room's Edit mode (its pencil) or a scene row's chevron.
export function tap(el) {
  if (!el || !el.closest('#screen')) return;
  if (el.dataset.act === 'scene-edit') arm(el);
  else if (el.matches('.scene-row .row-chev[data-go]')) arm(el.closest('.scene-row'));
}
// While the surface is growing, a second tap does nothing (it would land on a sheet still taking shape).
export const busy = () => !!(flight && performance.now() < flight.until);

function arm(el) {
  armed = null;
  const src = sourceOf(el);
  if (!src || reduced()) return;
  const page = here().split('/');
  const pid = el.dataset.id;
  const key = page[0] === 'room' ? `room/${page[1]}/scene/${pid}` : page[0] === 'scenes' ? `scenes/${pid}` : null;
  if (!key || shown(el) < 0.5) return;
  armed = { key, parent: page[0] === 'room' ? `room/${page[1]}` : 'scenes', sel: src.sel, pid, O: measure(src), until: performance.now() + 800 };
}

// The kinds of thing a scene opens from, each with its word: a room's chip, a tile or a row on All scenes.
function sourceOf(el) {
  const id = el.dataset.id; if (!id) return null;
  const q = CSS.escape(id);
  if (el.matches('.room-chips .chip')) return { el, sel: `.room-chips .chip[data-id="${q}"]`, word: el };
  if (el.matches('.scene-tile')) return { el, sel: `.scene-tile[data-id="${q}"]`, word: el.querySelector('.nm') };
  if (el.matches('.scene-row')) return { el, sel: `.scene-row[data-id="${q}"]`, word: el.querySelector('.row-txt .t') };
  return null;
}
// How much of an element is on screen, 0 to 1, the less of its width and its height.
function shown(el) {
  const b = el.getBoundingClientRect();
  if (!b.width || !b.height) return 0;
  const w = Math.max(0, Math.min(b.right, innerWidth) - Math.max(b.left, 0)) / b.width;
  const h = Math.max(0, Math.min(b.bottom, innerHeight) - Math.max(b.top, 0)) / b.height;
  return Math.min(w, h);
}
// The words of an element as they sit (a chip's are its own text, beside its glyph): their box and their look.
function words(el) {
  if (!el) return null;
  const rg = document.createRange();
  const text = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
  if (el.matches('.chip')) { if (!text) return null; rg.selectNode(text); } else rg.selectNodeContents(el);
  const r = rg.getBoundingClientRect();
  if (!r.width) return null;
  const b = el.getBoundingClientRect();
  // a block wider than its words (a title) flies by its words; a line cut short by its ellipsis by its box
  const w = Math.min(r.width, b.width);
  return { r: { left: r.left, top: r.top, width: w, height: r.height }, text: (text ? text.textContent : el.textContent).trim(), el };
}
// The first colour an element or what it sits in actually paints (a row is drawn on its group).
function paint(el) {
  for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return { image: cs.backgroundImage };
    if (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) return { color: cs.backgroundColor };
  }
  return null;
}
// Everything about the source the open needs, read while it is where it was drawn (and still pressed, if it is).
function measure({ el, word }) {
  const box = el.getBoundingClientRect();
  const k = box.width / (el.offsetWidth || box.width) || 1;
  const cs = getComputedStyle(el);
  // a completed hold is copper all over; anything else opens from its own colour
  const copper = el.dataset.holding === '1' ? getComputedStyle(el, '::before').backgroundColor : null;
  const bw = parseFloat(cs.borderTopWidth) || 0;
  return {
    el, box, k, radius: (parseFloat(cs.borderTopLeftRadius) || 0) * k,
    fill: copper ? { color: copper } : paint(el),
    edge: bw ? { w: bw, color: cs.borderTopColor } : null,
    // its look, copied now: a computed style is live, and the chip is about to be drawn again
    word: words(word), wordCss: word && look(getComputedStyle(word)), wordLay: word && lay(word),
    face: faceCopy(el),
  };
}

// ---------- open ----------
// Called once the routed sheet for `key` is drawn (and wired). Plays the open if a source asked for this sheet.
export function opened(root, key) {
  const a = armed;
  key = dec(key);
  if (!a || a.key !== key) { if (source && source.key !== key.split('#')[0]) source = null; return; }
  armed = null;
  source = null;
  if (performance.now() > a.until || reduced()) return;
  const sheet = root.querySelector('.sheet'), h2 = root.querySelector('.sheet-head h2');
  if (!sheet || !h2 || !a.O.word || sheet.classList.contains('still')) return;
  // only a sheet that opened from its chip closes into it
  if (open(root, sheet, h2, a.O)) source = { key: a.key, parent: a.parent, sel: a.sel, pid: a.pid };
}

function open(root, sheet, h2, O) {
  // the sheet does not rise: it grows out of the chip
  sheet.classList.add('still');
  // read everything first
  const S = sheet.getBoundingClientRect();
  const R = parseFloat(getComputedStyle(sheet).borderTopLeftRadius) || 28;
  const Hb = h2.getBoundingClientRect(), Ht = words(h2);
  const head = sheet.querySelector('.sheet-head');
  const B = O.box, W = O.word;
  if (!Ht) { sheet.classList.remove('still'); return false; }
  const body = sheet.querySelector('.scene-sheet') || sheet.querySelector('.sheet-body');
  const stage = sheet.querySelector('.sc-stage');
  const vis = el => { const b = el.getBoundingClientRect(); return b.height > 0 && b.top < innerHeight && b.bottom > 0; };
  const lanes = [...sheet.querySelectorAll('.sc-lane')].map(l => ({ l, orb: l.querySelector('.sc-orb'), r: l.querySelector('.sc-orb').getBoundingClientRect() }))
    .filter(x => x.r.left < innerWidth && x.r.right > 0);
  const kids = body ? [...body.children] : [];
  const after = stage ? kids.slice(kids.indexOf(stage) + 1) : kids.filter(k => !k.matches('.sc-cap'));
  const rows = after.filter(vis).slice(0, 10);
  const cap = sheet.querySelector('.sc-cap');
  const bits = [sheet.querySelector('.grab'), ...(head ? head.querySelectorAll('.t-over, .head-btn, .sheet-close, .sheet-back') : [])].filter(Boolean);
  const lvl = el => Number(getComputedStyle(el).opacity);
  const blooms = lanes.map(({ orb }) => bloomColour(orb));

  const f = flight = { root, until: performance.now() + OPEN.dur, anims: [], undo: [] };
  const core = (node, kf, o) => { const an = node.animate(kf, o); f.anims.push(an); return an; };
  const play = (node, kf, o) => (node ? node.animate(kf, { fill: 'backwards', ...o }) : null);
  const at = { l: B.left - S.left, t: B.top - S.top };
  const layer = (cls, style) => {
    const d = document.createElement('div');
    d.className = `xf-old ${cls}`; d.setAttribute('aria-hidden', 'true');
    Object.assign(d.style, { position: 'absolute', pointerEvents: 'none', margin: '0', ...style });
    sheet.appendChild(d); f.undo.push(() => d.remove());
    return d;
  };

  // the surface: the sheet clipped to the chip, let go to its own box
  const shut = `inset(${px(B.top - S.top)} ${px(S.right - B.right)} ${px(S.bottom - B.bottom)} ${px(B.left - S.left)} round ${px(O.radius)})`;
  const full = `inset(0px 0px ${px(-R)} 0px round ${px(R)})`;
  core(sheet, [{ clipPath: shut }, { clipPath: full }], { duration: OPEN.dur, easing: OPEN.ease });
  // what the chip was: its colour over the whole surface, stretched with it, gone in the first 0.18 s
  if (O.fill) {
    const fl = layer('m12-fill', { left: px(at.l), top: px(at.t), width: px(B.width), height: px(B.height), transformOrigin: '0 0', zIndex: '1', background: O.fill.image || O.fill.color });
    const cover = `translate(${px(-at.l)}, ${px(-at.t)}) scale(${S.width / B.width}, ${(S.height + R) / B.height})`;
    core(fl, [{ transform: 'none' }, { transform: cover }], { duration: OPEN.dur, easing: OPEN.ease, fill: 'forwards' });
    core(fl, FILL, { duration: FILL_DUR, easing: 'linear', fill: 'forwards' });
  }
  // its outline grows with the surface as it goes, and its glyph (or a tile's dots and star) stays and goes
  if (O.edge) {
    const e = layer('m12-edge', { left: '0', top: '0', boxSizing: 'border-box', border: `${O.edge.w * O.k}px solid ${O.edge.color}`, zIndex: '1' });
    core(e, [
      { left: px(at.l), top: px(at.t), width: px(B.width), height: px(B.height), borderRadius: px(O.radius) },
      { left: '0px', top: '0px', width: px(S.width), height: px(S.height + R), borderRadius: px(R) },
    ], { duration: OPEN.dur, easing: OPEN.ease, fill: 'forwards' });
    core(e, [{ opacity: 1 }, { opacity: 0 }], { duration: FACE, easing: 'ease-out', fill: 'forwards' });
  }
  const face = O.face;
  if (face) {
    Object.assign(face.style, { left: px(at.l + (B.width - face._w) / 2), top: px(at.t + (B.height - face._h) / 2) });
    sheet.appendChild(face); f.undo.push(() => face.remove());
    core(face, [{ opacity: 1 }, { opacity: 0 }], { duration: FACE, easing: 'ease-out', fill: 'forwards' });
  }

  // the word: the title flies out of it, and the two cross only while they are the chip's size
  const rise = (n, delay, dur = T.enter, dy = 12) => play(n, [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'translateY(0px)' }], { duration: dur, easing: T.ease, delay });
  if (head) { head.style.zIndex = '2'; f.undo.push(() => { head.style.zIndex = ''; }); }
  if (flies(O.wordLay, lay(h2))) {
    if (face) bare(face);
    const tc = centre(Ht.r), wc = centre(W.r);
    h2.style.transformOrigin = `${px(tc.x - Hb.left)} ${px(tc.y - Hb.top)}`;
    f.undo.push(() => { h2.style.transformOrigin = ''; });
    core(h2, [{ transform: `translate(${px(wc.x - tc.x)}, ${px(wc.y - tc.y)}) scale(${W.r.width / Ht.r.width})` }, { transform: 'translate(0px, 0px) scale(1)' }], { duration: OPEN.dur, easing: OPEN.ease });
    core(h2, [{ opacity: 0 }, { opacity: 1 }], { duration: CROSS - CROSS_IN, delay: CROSS_IN, easing: 'linear', fill: 'backwards' });
    const word = wordCopy(W, O, S);
    sheet.appendChild(word); f.undo.push(() => word.remove());
    core(word, [{ transform: `scale(${O.k})` }, { transform: `translate(${px(tc.x - wc.x)}, ${px(tc.y - wc.y)}) scale(${Ht.r.width / (W.r.width / O.k)})` }], { duration: OPEN.dur, easing: OPEN.ease, fill: 'forwards' });
    core(word, [{ opacity: 1 }, { opacity: 0 }], { duration: CROSS_OUT, easing: 'linear', fill: 'forwards' });
  } else {
    // a word that would change on the way (a one line chip into a title of two, a name cut short by its ellipsis,
    // a row's name on three lines) does not fly: it goes where it is with the chip's face, and the title comes in
    // with the header, each looking as it does at rest
    rise(h2, HEAD, T.enter);
  }

  // then the content, in the order it reads
  for (const b of bits) rise(b, HEAD, T.enter);
  rise(cap, CAP);
  rise(stage, STAGE);
  lanes.forEach(({ l, orb, r }, i) => {
    const d = ORBS + i * ORB_STEP;
    const oc = centre(r);
    // from where the chip was, small, into its place
    play(orb, [{ opacity: 0, transform: `translate(${px(centre(B).x - oc.x)}, ${px(centre(B).y - oc.y)}) scale(0.4)` }, { opacity: 1, transform: 'translate(0px, 0px) scale(1)' }], { duration: ORB_DUR, easing: OPEN.ease, delay: d });
    const glow = orb.querySelector('.glow');
    if (glow) play(glow, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 500, easing: 'ease-out', delay: d + 250 });
    for (const [s, lag, dur] of [['.sc-stem', 300, 300], ['.sc-pool', 300, 400]]) { const n = l.querySelector(s); if (n) play(n, [{ opacity: 0 }, { opacity: lvl(n) }], { duration: dur, easing: 'ease-out', delay: d + lag }); }
    const nm = l.querySelector('.sc-nm'); if (nm) rise(nm, d + 350);
    const lv = l.querySelector('.sc-lv'); if (lv) play(lv, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: T.standard, easing: T.ease, delay: d + 450 });
    // the light blooms as the orb lands
    if (blooms[i]) {
      const b = document.createElement('span');
      b.className = 'm12-bloom'; b.setAttribute('aria-hidden', 'true');
      const c = blooms[i];
      Object.assign(b.style, {
        position: 'absolute', left: '50%', top: 'var(--y)', width: '160px', height: '160px', margin: '-80px 0 0 -80px', borderRadius: '50%', pointerEvents: 'none',
        mixBlendMode: 'screen', opacity: '0', background: `radial-gradient(closest-side, rgba(${c}, .5) 0%, rgba(${c}, .3) 35%, rgba(${c}, .1) 70%, rgba(${c}, 0) 100%)`,
      });
      orb.before(b);
      play(b, [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, offset: 0.33 }, { opacity: 0, transform: 'scale(1.2)' }], { duration: BLOOM, easing: 'ease-out', delay: d + 250, fill: 'both' })
        .finished.catch(() => {}).then(() => b.remove());
    }
  });
  rows.forEach((n, i) => rise(n, (stage ? ROWS : HEAD + 40) + i * ROW_STEP, ROW_DUR));

  holdFor(OPEN.dur + 50);
  Promise.all(f.anims.map(x => x.finished)).then(() => land(f), () => {});
  return true;
}
function land(f) {
  if (flight !== f) return;
  flight = null;
  for (const u of f.undo.splice(0)) { try { u(); } catch (_) { /* already gone */ } }
}
// Jump an open still playing to its end (a close asked for while it grows).
function finishOpen() {
  const f = flight; if (!f) return;
  for (const a of f.anims) { try { a.finish(); } catch (_) { /* already gone */ } }
  land(f);
}

// The colour of an orb's light, as "r, g, b", from its glow's core; none for a fan or a light off in the scene.
function bloomColour(orb) {
  const g = orb.querySelector('.glow:not(.off)'); if (!g) return null;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(g.style.getPropertyValue('--g-core') || g.style.getPropertyValue('--g-body') || '');
  return m ? `${m[1]}, ${m[2]}, ${m[3]}` : null;
}
const look = cs => Object.fromEntries(['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'color'].map(p => [p, cs[p]]));
// The chip's word, standing where it stood (at the chip's press scale), in the chip's look.
function wordCopy(W, O, S) {
  const cs = O.wordCss;
  const s = document.createElement('span');
  s.className = 'xf-old m12-word'; s.setAttribute('aria-hidden', 'true');
  s.textContent = W.text;
  Object.assign(s.style, cs);
  const w = W.r.width / O.k, h = W.r.height / O.k, c = centre(W.r);
  // its line is exactly its words' height, so its words sit centred where they sat on the chip
  Object.assign(s.style, {
    position: 'absolute', left: px(c.x - S.left - w / 2), top: px(c.y - S.top - h / 2), width: px(w + 0.5), height: px(h), lineHeight: px(h),
    whiteSpace: 'nowrap', margin: '0', zIndex: '3', transformOrigin: '50% 50%', transform: `scale(${O.k})`, pointerEvents: 'none',
  });
  return s;
}
// How a piece of words lies at rest: how many lines it takes, and whether an ellipsis has cut it short.
function lay(el) {
  const rg = document.createRange(); rg.selectNodeContents(el);
  const rows = [];
  for (const r of rg.getClientRects()) { if (r.width < 1 || r.height < 1) continue; const m = r.top + r.height / 2; if (!rows.some(y => Math.abs(y - m) < r.height / 2)) rows.push(m); }
  return { lines: rows.length, cut: getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 };
}
// A word flies into the title only when the two read alike at both ends: whole, and on one line each. Anything
// else would change its lines or its ellipsis on the way, which reads as the words jumping.
const flies = (w, t) => !!(w && t && w.lines === 1 && !w.cut && t.lines === 1 && !t.cut);
// The chip's face without its words, for when its word flies on its own.
function bare(c) {
  for (const n of [...c.childNodes]) if (n.nodeType === 3) n.remove();
  c.querySelectorAll('.nm, .row-txt').forEach(n => { n.style.visibility = 'hidden'; });
}
// The chip's glyph (a tile's dots and star, a row's dots and count) and its words, without its colour, made while the
// chip is still on the page (the redraw that follows replaces it), to be laid where it was. Its words go when the
// word flies on its own (bare); otherwise they stay and go with it, laid out exactly as they were.
function faceCopy(el) {
  const c = el.cloneNode(true);
  c._w = el.offsetWidth; c._h = el.offsetHeight;
  c.querySelectorAll('.ch-sub, .wv-prog, .row-chev').forEach(n => { n.style.visibility = 'hidden'; });
  for (const a of [...c.attributes]) if (a.name !== 'class') c.removeAttribute(a.name);
  c.classList.add('xf-old', 'm12-face');
  c.setAttribute('aria-hidden', 'true');
  const k = el.getBoundingClientRect().width / (c._w || 1) || 1;
  Object.assign(c.style, {
    position: 'absolute', width: px(c._w), height: px(c._h), margin: '0', boxSizing: 'border-box', transform: `scale(${k})`, transformOrigin: '50% 50%',
    background: 'none', borderColor: 'transparent', boxShadow: 'none', transition: 'none', animation: 'none', pointerEvents: 'none', zIndex: '1',
  });
  return c;
}

// ---------- close ----------
// Called in place of the sheet's drop (app.js closeSheet). True when it plays here.
export function close(root, opts = {}) {
  // one built from outside for this very sheet: it runs on (and a second drop never plays)
  if (outside && outside.sheet === root.querySelector('.sheet')) { const c = outside.ctl; outside = null; c.play(); return true; }
  outside = null;
  const c = closer(root, opts);
  if (!c) return false;
  outside = null;
  c.play();
  return true;
}

// The close, built paused. `dy` is how far a finger has already pulled the sheet down.
export function closer(root, { dy = 0 } = {}) {
  const o = source;
  if (!o || !root || root.hidden || reduced()) return null;
  const key = dec(root.dataset.key || '').split('#')[0];
  if (key !== o.key) return null;
  // closing to the page it was opened over (the X, the scrim, a swipe, Back), not on to another page
  const now = here();
  if (now !== o.key && now !== o.parent) return null;
  const live = root.querySelector('.sheet');
  const src = document.querySelector(`#screen ${o.sel}`);
  source = null;
  if (!live || !src || shown(src) < 0.5) return null;
  finishOpen();
  if (outside) { outside.ctl.cancel(); outside = null; }

  // a copy of the sheet as it stands, over it (the live one is about to be cleared)
  const g = document.createElement('div');
  g.className = 'sheet-ghost m12-ghost'; g.setAttribute('aria-hidden', 'true'); g.inert = true;
  Object.assign(g.style, { position: 'fixed', inset: '0', zIndex: '20', pointerEvents: 'none' });
  const keeps = [...live.querySelectorAll('[data-keep]')].map(n => n.scrollLeft);
  const top = live.scrollTop;
  for (const k of root.children) g.appendChild(k.cloneNode(true));
  g.querySelectorAll('.xf-old, .m12-bloom').forEach(n => n.remove());
  g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  const sheet = g.querySelector('.sheet'), scrim = g.querySelector('.scrim');
  if (!sheet) return null;
  sheet.classList.add('still'); if (scrim) scrim.classList.add('still');
  document.body.appendChild(g);
  sheet.scrollTop = top;
  sheet.querySelectorAll('[data-keep]').forEach((n, i) => { n.scrollLeft = keeps[i] || 0; });
  const hidden = [...root.children];
  hidden.forEach(n => { n.style.visibility = 'hidden'; });

  // read everything
  const Sr = sheet.getBoundingClientRect();
  const S = { left: Sr.left, right: Sr.right, top: Sr.top - dy, bottom: Sr.bottom - dy, width: Sr.width, height: Sr.height };
  const R = parseFloat(getComputedStyle(sheet).borderTopLeftRadius) || 28;
  const B = src.getBoundingClientRect();
  const radius = parseFloat(getComputedStyle(src).borderTopLeftRadius) || 0;
  const s = sourceOf(src);
  const W = s && words(s.word);
  const h2 = sheet.querySelector('.sheet-head h2');
  const Hb = h2 && h2.getBoundingClientRect(), Ht = h2 && words(h2);
  const head = sheet.querySelector('.sheet-head');
  const body = sheet.querySelector('.scene-sheet') || sheet.querySelector('.sheet-body');
  const stage = sheet.querySelector('.sc-stage');
  const lanes = [...sheet.querySelectorAll('.sc-lane')].map(l => ({ l, orb: l.querySelector('.sc-orb'), r: l.querySelector('.sc-orb').getBoundingClientRect() }));
  const going = [
    sheet.querySelector('.grab'), ...(head ? head.querySelectorAll('.t-over, .head-btn, .sheet-close, .sheet-back') : []),
    ...(body ? [...body.children].filter(n => n !== stage) : []),
  ].filter(Boolean);
  const scrimO = scrim ? Number(getComputedStyle(scrim).opacity) : 0;

  // write
  const dragged = dy > 0;
  const at = dragged ? 0 : SHUT.at;
  const total = at + SHUT.dur;
  const anims = [];
  const run = (node, kf, o) => { if (!node) return; const a = node.animate(kf, { fill: 'both', ...o }); a.pause(); anims.push(a); };
  const bc = centre(B);
  const fade = dragged ? 150 : FADE;
  for (const n of going) run(n, [{ opacity: Number(getComputedStyle(n).opacity) }, { opacity: 0 }], { duration: fade, easing: T.easeIn });
  if (stage) run(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: fade, delay: dragged ? 0 : 100, easing: T.easeIn });
  // the orbs gather back toward the chip, the last first
  lanes.slice().reverse().forEach(({ l, orb, r }, j) => {
    const oc = centre(r);
    run(orb, [{ opacity: 1, transform: 'translate(0px, 0px) scale(1)' }, { opacity: 0, transform: `translate(${px(bc.x - oc.x)}, ${px(bc.y - dy - oc.y)}) scale(0.4)` }], { duration: GATHER, delay: j * GATHER_STEP, easing: T.easeIn });
    for (const q of ['.sc-stem', '.sc-pool', '.sc-lv', '.sc-nm']) { const n = l.querySelector(q); if (n) run(n, [{ opacity: Number(getComputedStyle(n).opacity) }, { opacity: 0 }], { duration: fade, easing: T.easeIn }); }
  });
  // the surface goes back into the chip, from wherever it is (a finger may have pulled it down)
  const shut = `inset(${px(B.top - S.top)} ${px(S.right - B.right)} ${px(S.bottom - B.bottom)} ${px(B.left - S.left)} round ${px(radius)})`;
  const full = `inset(0px 0px ${px(-R)} 0px round ${px(R)})`;
  run(sheet, [{ clipPath: full, transform: `translateY(${px(dy)})` }, { clipPath: shut, transform: 'translateY(0px)' }], { duration: SHUT.dur, delay: at, easing: SHUT.ease });
  // and lets the chip itself show through over the last 0.15 s, where the title has become its word: the title
  // goes first and the surface after it, so the two words are never both plainly there
  run(sheet, [{ opacity: 1 }, { opacity: 0 }], { duration: CROSS - CROSS_IN, delay: total - CROSS + CROSS_IN, easing: T.easeIn });
  if (scrim) run(scrim, [{ opacity: scrimO }, { opacity: 0 }], { duration: SCRIM_OUT, delay: at, easing: T.easeIn });
  if (h2 && Ht && W && !flies(s.word && lay(s.word), lay(h2))) {
    run(h2, [{ opacity: 1 }, { opacity: 0 }], { duration: fade, easing: T.easeIn });
  } else if (h2 && Ht && W) {
    const tc = centre(Ht.r), wc = centre(W.r);
    const tcy = tc.y - dy;
    h2.style.transformOrigin = `${px(tc.x - Hb.left)} ${px(tcy - (Hb.top - dy))}`;
    run(h2, [{ transform: 'translate(0px, 0px) scale(1)' }, { transform: `translate(${px(wc.x - tc.x)}, ${px(wc.y - tcy)}) scale(${W.r.width / Ht.r.width})` }], { duration: SHUT.dur, delay: at, easing: SHUT.ease });
    run(h2, [{ opacity: 1 }, { opacity: 0 }], { duration: CROSS_OUT, delay: total - CROSS, easing: 'linear' });
  }

  let done = null;
  const ctl = {
    total,
    seek(p) { const t = Math.max(0, Math.min(1, p)) * total; for (const a of anims) { a.pause(); a.currentTime = t; } },
    play() {
      if (done) return done;
      for (const a of anims) a.play();
      done = Promise.all(anims.map(a => a.finished)).catch(() => {}).then(() => { g.remove(); });
      return done;
    },
    cancel() {
      if (done) return;
      for (const a of anims) { try { a.cancel(); } catch (_) { /* gone */ } }
      g.remove();
      hidden.forEach(n => { n.style.visibility = ''; });
      source = o;
      if (outside && outside.ctl === ctl) outside = null;
      done = Promise.resolve();
    },
  };
  outside = { sheet: live, ctl };
  return ctl;
}
