// Home's Pinned section: the lights and rooms a person pinned (the pin on a light's page or a room's page), right under
// the whole-house card, in a two column grid in the order they were pinned. A pinned light is its ordinary tile (the
// power circle switches it, the rest opens it); a pinned room is a card the same size with its picture, its name, how
// much is on and a power circle for the room (parts.js pinRoomCard). Pinned scenes stay a row of chips under it
// (home.js). With nothing pinned, one small card with the pin's glyph stands in its place.
//
// Edit, on the heading, puts the grid in edit mode until Done: each item gets a small x that unpins it, and a finger
// held on an item for 0.3 s picks it up to drag it somewhere else in the grid. The others make room on the standard
// 0.24 s curve, and letting go drops it into its place and saves the new order in favorites, where the pins live
// (home.js in the data layer: pinned, setPinOrder). While an item is held nothing redraws, the page does not scroll and
// nothing opens.
import { tile, pinRoomCard } from '/ui/screens/parts.js';
import { actions as roomsActions } from '/ui/screens/rooms.js';
import { reduced, T } from '/ui/motion.js';

const HOLD = 300;       // ms a finger rests on an item before it lifts
const SLOP = 8;         // px it may wander while it rests; more is a scroll
const STD = 240;        // the standard curve's time, which the others make room on and the dropped item lands on
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

// ---------- drawing ----------
export function pinnedHTML(c) {
  const { esc, icon } = c;
  const items = c.H.pinned();
  if (!items.length) {
    // one line: the glyph is the pin a light's or a room's page carries, which is all the how it needs
    return `<div class="pin-hint"><span class="ic-c">${icon('pin', 20, 1.7)}</span><p class="t-row">Pin lights and rooms here</p></div>`;
  }
  const editing = !!c.ui.pinEdit;
  const item = p => {
    const name = p.kind === 'light' ? p.d.name : p.a.name;
    const body = p.kind === 'light' ? tile(c, p.d) : pinRoomCard(c, p.a);
    const x = editing ? `<button class="pin-x${c.ui.pinEnter ? ' in' : ''}" data-act="unpin" data-key="${esc(p.key)}" aria-label="Unpin ${esc(name)}">${icon('x', 16, 2)}</button>` : '';
    return `<div class="pin-item ${p.kind}" data-key="${esc(p.key)}">${body}${x}</div>`;
  };
  return `<div class="pin-sec"><span class="t-over">Pinned</span><button class="link" data-act="pins-edit" aria-pressed="${editing}">${editing ? 'Done' : 'Edit'}</button></div>
    <div class="tile-grid pin-grid ${editing ? 'editing' : ''}">${items.map(item).join('')}</div>`;
}

// ---------- after each redraw ----------
// Items that moved because one was unpinned glide to their new places, and in edit mode a finger can pick one up.
export function wirePins(c, root) {
  const grid = root.querySelector('.pin-grid');
  const was = c.ui.pinFlip; c.ui.pinFlip = null;
  const leaving = c.ui.pinLeaving; c.ui.pinLeaving = null;
  c.ui.pinEnter = false;
  if (grid && leaving && !reduced()) leaveAll(grid, leaving);
  if (grid && was && !reduced()) {
    for (const it of grid.querySelectorAll(':scope > .pin-item')) {
      const r0 = was.get(it.dataset.key); if (!r0) continue;
      const r = it.getBoundingClientRect();
      const dx = r0.left - r.left, dy = r0.top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      it.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], { duration: STD, easing: EASE });
    }
  }
  if (grid && grid.classList.contains('editing')) dragging(c, grid);
}
// Where each item is now, by its key, for the redraw that follows to glide them from.
function remember(c, root) {
  const m = new Map();
  for (const it of (root || document).querySelectorAll('.pin-grid > .pin-item')) m.set(it.dataset.key, it.getBoundingClientRect());
  c.ui.pinFlip = m;
}
// What goes when the grid is drawn again (an item unpinned, the x's as Done is tapped), taken while it is still there:
// a copy of each, and where it stood, to fade out in its place in the new grid (leaveAll) on the exit's 0.2 s EASE_IN,
// rather than vanishing in a frame. The copies are the house's fading kind (xf-old), which a redraw carries along.
function leaves(c, els) {
  const grid = document.querySelector('.pin-grid'); if (!grid || reduced()) return;
  const g = grid.getBoundingClientRect();
  c.ui.pinLeaving = els.map(el => {
    const node = el.cloneNode(true), x = el.classList.contains('pin-x');
    // A copy answers to no one's selector for what is on the grid (an item, an x): it wears its look inline instead.
    if (x) { const cs = getComputedStyle(el); for (const k of ['display', 'place-items', 'border-radius', 'background-color', 'color', 'box-shadow', 'border']) node.style.setProperty(k, cs.getPropertyValue(k)); }
    node.classList.remove('pin-item', 'pin-x', 'in');
    node.classList.add('pin-gone');
    return { node, r: el.getBoundingClientRect(), g, x };
  });
}
function leaveAll(grid, leaving) {
  const g = grid.getBoundingClientRect();
  if (getComputedStyle(grid).position === 'static') grid.style.position = 'relative';
  for (const { node, r, x } of leaving) {
    node.classList.add('xf-old');
    node.removeAttribute('data-act'); node.removeAttribute('data-key'); node.setAttribute('aria-hidden', 'true'); node.inert = true;
    node.querySelectorAll('[data-act],[data-go],[id]').forEach(n => { n.removeAttribute('data-act'); n.removeAttribute('data-go'); n.removeAttribute('id'); });
    Object.assign(node.style, { position: 'absolute', left: `${r.left - g.left}px`, top: `${r.top - g.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', pointerEvents: 'none', zIndex: x ? '3' : '0' });
    grid.appendChild(node);
    // an x goes the way it came (pin-x-in, backwards and faster); an item fades and settles back a little
    node.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: x ? 0.6 : 0.96 }], { duration: T.exit, easing: T.easeIn, fill: 'forwards' })
      .finished.catch(() => {}).then(() => node.remove());
  }
}

// ---------- picking one up ----------
function dragging(c, grid) {
  let g = null;
  const items = () => [...grid.querySelectorAll(':scope > .pin-item')];
  const release = () => { if (c.ui.dragging) c.endDrag(); };

  // An item lifts: it grows a little with a shadow under it and follows the finger; the grid's places are read now,
  // once, since nothing on the page moves but the items while it is held.
  const lift = () => {
    if (!g) return;
    g.live = true;
    g.items = items();
    g.slots = g.items.map(n => n.getBoundingClientRect());
    g.from = g.to = g.items.indexOf(g.it);
    grid.classList.add('dragging');
    g.it.classList.add('lifted');
    if (navigator.vibrate) navigator.vibrate(20);
  };
  // The order as it would be if the item were let go now: it taken out and put back in at `to`.
  const order = h => { const o = h.items.filter(n => n !== h.it); o.splice(h.to, 0, h.it); return o; };
  // Every other item goes to the place it would have in that order, on the standard curve (the stylesheet's transition).
  const layout = () => {
    const o = order(g);
    g.items.forEach((n, i) => {
      if (n === g.it) return;
      const j = o.indexOf(n), a = g.slots[i], b = g.slots[j];
      n.style.translate = j === i ? '' : `${b.left - a.left}px ${b.top - a.top}px`;
    });
  };
  const move = e => {
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    g.it.style.translate = `${dx}px ${dy}px`;
    // the place whose middle is nearest the middle of the item as it is held
    const r = g.slots[g.from], cx = r.left + r.width / 2 + dx, cy = r.top + r.height / 2 + dy;
    let best = g.to, bd = Infinity;
    g.slots.forEach((s, i) => { const d = Math.hypot(s.left + s.width / 2 - cx, s.top + s.height / 2 - cy); if (d < bd) { bd = d; best = i; } });
    if (best !== g.to) { g.to = best; layout(); }
  };
  // Let go: the item settles into its place on the same curve, and once it is there the order is kept and saved.
  const drop = cancelled => {
    const was = g; g = null;
    if (cancelled) { was.to = was.from; for (const n of was.items) if (n !== was.it) n.style.translate = ''; }
    const o = order(was);
    const s = was.slots[was.to], f = was.slots[was.from];
    was.it.classList.remove('lifted');
    was.it.classList.add('dropping');
    was.it.style.translate = `${s.left - f.left}px ${s.top - f.top}px`;
    // The new order is drawn once everything has settled where it goes, on the settling's own clock: a timer of the
    // same length ran out first on a busy phone and drew the grid over items still on their way.
    let done = false;
    const settled = () => {
      if (done) return; done = true;
      const keys = o.map(n => n.dataset.key);
      const changed = keys.some((k, i) => k !== was.items[i].dataset.key);
      if (changed) c.H.setPinOrder(keys);
      c.ui.dragging = false;
      c.render();
      if (changed) c.save('', { quiet: true });
    };
    if (reduced()) { settled(); return; }
    // (only what ends: a pinned room's fan turns for as long as it is on)
    Promise.all(grid.getAnimations({ subtree: true }).filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).map(a => a.finished)).then(settled, settled);
    setTimeout(settled, STD + 600);
  };

  grid.addEventListener('pointerdown', e => {
    if (e.button > 0 || g || e.target.closest('.pin-x')) return;
    const it = e.target.closest('.pin-item'); if (!it || it.parentElement !== grid) return;
    g = { id: e.pointerId, it, x: e.clientX, y: e.clientY, live: false };
    g.timer = setTimeout(lift, HOLD);
    // nothing redraws under the finger while it decides, or while it holds an item
    c.ui.dragging = true;
    try { grid.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
  });
  grid.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    if (g.live) { e.preventDefault(); move(e); return; }
    // moving before it lifts is a scroll: this finger is not ours
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > SLOP) { clearTimeout(g.timer); g = null; release(); }
  });
  const end = (e, cancelled) => {
    if (!g || e.pointerId !== g.id) return;
    clearTimeout(g.timer);
    if (g.live) { drop(cancelled); return; }
    g = null; release();
  };
  grid.addEventListener('pointerup', e => end(e, false));
  grid.addEventListener('pointercancel', e => end(e, true));
  grid.addEventListener('lostpointercapture', e => { if (g && e.pointerId === g.id) end(e, !g.live); });
  // once an item is held the page does not scroll under it (a touch that has not moved yet can still be stopped)
  grid.addEventListener('touchmove', e => { if (g && g.live && e.cancelable) e.preventDefault(); }, { passive: false });
  // and a long press is not the phone's own menu
  grid.addEventListener('contextmenu', e => e.preventDefault());
}

// ---------- taps ----------
export const pinActions = {
  // Edit and Done on the heading
  'pins-edit'(c) {
    c.ui.pinEdit = !c.ui.pinEdit; c.ui.pinEnter = c.ui.pinEdit;
    if (!c.ui.pinEdit) leaves(c, [...document.querySelectorAll('.pin-grid .pin-x')]);
    c.render();
  },
  // the x on an item in edit mode: unpinned at once, the others close up. Leaving the last one ends edit mode.
  unpin(c, el) {
    const key = el.dataset.key; if (!key) return;
    remember(c);
    const item = el.closest('.pin-item');
    c.H.unpin(key);
    if (!c.H.pinned().length) c.ui.pinEdit = false;
    // the item fades where it was as the others close up; the last one's x's go with it
    leaves(c, [...(item ? [item] : []), ...(c.ui.pinEdit ? [] : [...document.querySelectorAll('.pin-grid .pin-x')].filter(x => !item || !item.contains(x)))]);
    c.render();
    c.save('', { quiet: true });
  },
  // a pinned room's power circle: the Rooms card's own (rooms.js), which only ever switches that room
  'room-toggle'(c, el) { roomsActions['room-toggle'](c, el); },
};

// Leaving Home ends edit mode, so the grid is itself again next time.
export function pinsLeave(c) { if (c && c.ui) c.ui.pinEdit = false; }
