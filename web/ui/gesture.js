// Sliders that never get in the way of a scroll. A finger landing on a control does nothing on its own: the page
// might be about to scroll, or the finger might be stopping a scroll that is already moving. The control acts only
// when the finger shows what it means:
//
//   axis 'x'    a sideways drag (the house bar, the white track). The element is `touch-action: pan-y`, so an
//               up-or-down swipe that starts on it scrolls the page, natively and at once.
//   axis 'y'    an up-and-down drag (the shade), on an element that is `touch-action: none`.
//   grab        a handle (the dial's knob, the colour wheel's handle) takes the finger straight away, in any
//               direction: landing on a handle is already a clear intent.
//
// A tap on a slider sets nothing unless the control says a tap means something (`tap`), and nothing at all happens
// for a touch that lands while the page is still moving from a scroll. Mouse and pen behave the same, minus the
// scroll. `c.ui.dragging` is set only once a drag is real, so the app keeps redrawing until then.
const SLOP = 8;              // px a finger must travel before it counts as a drag
const RATIO = 1.2;           // how much more along the axis than across it
const AFTER_SCROLL = 250;    // ms after any scroll during which a touch only stops the scroll

let scrolledAt = 0;
if (typeof document !== 'undefined') document.addEventListener('scroll', () => { scrolledAt = performance.now(); }, { capture: true, passive: true });
export const scrollingNow = () => performance.now() - scrolledAt < AFTER_SCROLL;

// track(el, { c, axis, accept(e) -> bool, grab(e) -> bool, start(e), move(e), end(), tap(e) })
// `accept` says whether a finger landing there is on the control at all (a dial's band, a track's height).
export function track(el, o) {
  if (!el) return;
  let g = null;   // the finger on it: {id, x, y, live}
  const begin = e => {
    g.live = true;
    o.c.ui.dragging = true;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    if (o.start) o.start(e);
    o.move(e);
  };
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || scrollingNow() || (o.accept && !o.accept(e))) { g = null; return; }
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), live: false };
    if (o.grab && o.grab(e)) { e.preventDefault(); begin(e); }
  });
  el.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    if (g.live) { o.move(e); return; }
    const dx = Math.abs(e.clientX - g.x), dy = Math.abs(e.clientY - g.y);
    if (Math.max(dx, dy) < SLOP) return;
    const along = o.axis === 'y' ? dy : dx, across = o.axis === 'y' ? dx : dy;
    if (o.axis && along > across * RATIO) begin(e);
    else g = null;   // it was a scroll (or a swipe the other way): this finger is not ours
  });
  const finish = (e, cancelled) => {
    if (!g || (e && e.pointerId !== g.id)) return;
    const was = g; g = null;
    if (was.live) { if (o.end) o.end(); if (o.c.ui.dragging) o.c.endDrag(); return; }
    if (!cancelled && o.tap && performance.now() - was.t < 500 && Math.hypot(e.clientX - was.x, e.clientY - was.y) < SLOP) o.tap(e);
  };
  el.addEventListener('pointerup', e => finish(e, false));
  el.addEventListener('pointercancel', e => finish(e, true));
  el.addEventListener('lostpointercapture', e => { if (g && g.live && e.pointerId === g.id) finish(e, true); });
}
