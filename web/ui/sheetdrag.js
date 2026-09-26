// Swipe a sheet down to put it away. The sheet follows the finger and the scrim thins with it; let go past a
// quarter of the sheet (or with a flick) and it drops the rest of the way, EASE_IN, as a sheet leaving does;
// let go short of that and it springs back up on the GENTLE spring it came in on.
//
// Where a finger can start it: the grab bar and the header, always; the body, when it is scrolled to the top and
// the finger is moving down, and not on a control that uses the drag itself (the colour wheel, a white track, a
// slider). Touch uses touch events, because only a touchmove can stop the page from scrolling instead; a mouse
// uses the grab bar and the header.
const SLOP = 8;
const GENTLE = 'linear(0, 0.0188, 0.0679, 0.1374, 0.2195, 0.308, 0.3978, 0.4856, 0.5686, 0.6452, 0.7142, 0.7753, 0.8283, 0.8735, 0.9113, 0.9423, 0.9671, 0.9866, 1.0014, 1.0123, 1.0198, 1.0247, 1.0274, 1.0283, 1.0281, 1.0268, 1.025, 1.0227, 1.0202, 1.0177, 1.0152, 1.0128, 1.0106, 1.0085, 1.0068, 1.0052, 1.0039, 1.0028, 1.0018, 1.0011, 1.0005, 1, 0.9997, 0.9995, 0.9993, 0.9992, 0.9992, 0.9992, 0.9992, 0.9993, 0.9993)';
const OWN_DRAG = '[data-drag], .wheel, .ws-track, input, textarea, select, [contenteditable]';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// root: #sheet-root. dismiss(): close it for good, without a second drop animation. handoff(dy), when given, may
// take a sheet let go past the point of closing and close it its own way from where the finger left it (a scene's
// editor goes back into its chip, chipopen.js); it says true when it has.
export function wireSheetDrag(root, dismiss, { handoff = null } = {}) {
  let d = null;   // {sheet, scrim, y0, x0, t0, dy, live, head, lastY, lastT, v}
  const sheetOf = t => t && t.closest && t.closest('#sheet-root .sheet');
  const onHead = t => !!(t.closest('.grab') || (t.closest('.sheet-head') && !t.closest('button, a, input')));

  const start = (t, x, y) => {
    const sheet = sheetOf(t); if (!sheet || t.closest(OWN_DRAG)) { d = null; return; }
    d = { sheet, scrim: root.querySelector('.scrim'), x0: x, y0: y, t0: performance.now(), dy: 0, live: false, head: onHead(t), lastY: y, lastT: performance.now(), v: 0 };
  };
  // true when this move now belongs to the sheet
  const move = (x, y) => {
    if (!d) return false;
    const dy = y - d.y0, dx = x - d.x0;
    const now = performance.now();
    // speed over at least one frame, so two events landing in the same millisecond are not a flick
    d.v = (y - d.lastY) / Math.max(16, now - d.lastT); d.lastY = y; d.lastT = now;
    if (!d.live) {
      if (Math.hypot(dx, dy) < SLOP) return false;
      // down, clearly more down than sideways, and from the header or a body already at its top
      if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * 1.2 || (!d.head && d.sheet.scrollTop > 0)) { d = null; return false; }
      d.live = true; d.y0 = y;
      // a sheet still rising is taken where it is, and follows the finger from there (let go of its rise without
      // that, it jumped up to where it rests under the finger), and a scrim still fading in thins from where it is
      const at = d.sheet.getBoundingClientRect().top;
      d.o = d.scrim ? Number(getComputedStyle(d.scrim).opacity) : 1;
      for (const n of [d.sheet, d.scrim]) if (n) n.getAnimations().forEach(a => a.cancel());
      d.base = Math.max(0, at - d.sheet.getBoundingClientRect().top);
    }
    d.dy = Math.max(0, d.base + y - d.y0);
    d.sheet.style.transform = `translateY(${d.dy}px)`;
    if (d.scrim) d.scrim.style.opacity = String(Math.max(0, d.o * (1 - (d.dy - d.base) / (d.sheet.offsetHeight || 1))));
    return true;
  };
  const end = () => {
    if (!d) return;
    const g = d; d = null;
    if (!g.live) return;
    const h = g.sheet.offsetHeight || 1;
    // past a quarter of the sheet (160 at most), or flicked: fast, and a real distance, not a twitch
    // (by how far the finger took it: a sheet caught low on its way up and barely pulled goes on up)
    const pulled = g.dy - (g.base || 0);
    const away = pulled > Math.min(160, h * 0.25) || (g.v > 0.8 && pulled > 40);
    const clear = () => { g.sheet.style.transform = ''; if (g.scrim) g.scrim.style.opacity = ''; };
    if (reduced()) { if (away) dismiss(); else clear(); return; }
    if (away && handoff && handoff(g.dy)) return;
    if (away) {
      // the rest of the way down, as fast as a sheet leaves (0.28 s for the whole height)
      const ms = Math.max(120, 280 * (1 - g.dy / h));
      const opts = { duration: ms, easing: 'ease-in', fill: 'forwards' };
      const runs = [g.sheet.animate([{ transform: `translateY(${g.dy}px)` }, { transform: 'translateY(100%)' }], opts).finished];
      if (g.scrim) runs.push(g.scrim.animate([{ opacity: g.scrim.style.opacity || 1 }, { opacity: 0 }], opts).finished);
      Promise.all(runs).catch(() => {}).then(() => dismiss());
    } else {
      g.sheet.animate([{ transform: `translateY(${g.dy}px)` }, { transform: 'translateY(0)' }], { duration: 420, easing: GENTLE });
      if (g.scrim) g.scrim.animate([{ opacity: g.scrim.style.opacity || 1 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      clear();
    }
  };

  // touch: a touchmove that belongs to the sheet stops the page (or the sheet's own body) from scrolling
  root.addEventListener('touchstart', e => { if (e.touches.length === 1) start(e.target, e.touches[0].clientX, e.touches[0].clientY); else d = null; }, { passive: true });
  root.addEventListener('touchmove', e => { if (d && e.touches.length === 1 && move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault(); }, { passive: false });
  root.addEventListener('touchend', end);
  root.addEventListener('touchcancel', end);
  // mouse: the grab bar and the header
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button > 0) return;
    start(e.target, e.clientX, e.clientY);
    if (d && !d.head) d = null;
  });
  document.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' && d) move(e.clientX, e.clientY); });
  document.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') end(); });
}
