/* Swipe a sheet down to close it, or from large down to medium, with weight.
   A finger pulling down on a sheet drags it: the sheet follows the finger one for one (with a
   rubber band when pushed above its rest), the scrim thins as it goes. On release the sheet either
   flies off the bottom, at the speed the finger gave it, or eases back with no overshoot.
   A pull that starts in the sheet's body only counts once that body is scrolled to its top, so
   scrolling a long sheet still works; a pull on a drag control (a dial, a slider, the lamp disc)
   never counts. Touch only: that is where the gesture lives. */
(function () {
  'use strict';
  const SLOP = 8;
  const FLICK = 0.55;          // px per ms: faster than this and the sheet leaves whatever the distance
  const FAR = 0.3;             // or further than this share of the sheet's height
  const NO = 'input.slider, .sliderwrap, .vslider, .ld-disc, .td-ring, .chips.scroll, .tiles, select, textarea';
  // The detents (docs/ia-v5.md 5). A sheet has two stops at most, never three: compact only closes, medium can be
  // dragged up to large and back, large drops to medium when it has both.
  const detentOf = el => (el.className.match(/dt-(compact|medium|large)/) || [, ''])[1];
  const canGrow = el => /dt-medium/.test(el.className) && !!el.dataset.grow;
  const setDetent = (el, d) => { el.style.height = ''; el.classList.remove('dt-compact', 'dt-medium', 'dt-large'); el.classList.add('dt-' + d); if (window.sheet && sheet.detentChanged) sheet.detentChanged(d); };
  let g = null;

  const root = () => document.getElementById('sheet-root');
  const G = () => (window.gsap && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? window.gsap : null);

  function start(e) {
    const r = root(); if (!r || !r.classList.contains('in') || e.touches.length !== 1) return;
    const sheet = e.target.closest('#sheet-root .sheet'); if (!sheet) return;
    if (e.target.closest(NO)) return;
    const t = e.touches[0];
    g = { sheet, scrim: r.querySelector('.scrim'), sb: sheet.querySelector('.sb'), inBody: !!e.target.closest('.sb'), x0: t.clientX, y0: t.clientY, y: t.clientY, state: 'pending', h: sheet.getBoundingClientRect().height || 1, samples: [[performance.now(), t.clientY]], disp: 0, detent: detentOf(sheet), up: canGrow(sheet) };
  }
  function move(e) {
    if (!g) return;
    const t = e.touches[0]; const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (g.state === 'pending') {
      if (Math.abs(dx) >= SLOP && Math.abs(dx) > Math.abs(dy)) { g = null; return; }
      if (dy <= -SLOP) { const s2 = g.sheet; const grow = g.up; g = null; if (grow) setDetent(s2, 'large'); return; }
      if (dy < SLOP) return;
      if (g.inBody && g.sb && g.sb.scrollTop > 0) { g = null; return; }
      g.state = 'active'; g.y0 = t.clientY - SLOP;
      const gs = G(); if (gs) gs.killTweensOf([g.sheet, g.scrim].filter(Boolean));
      root().classList.add('m-sheet-gsap'); g.sheet.classList.add('swiping');
    }
    e.preventDefault();
    const d = t.clientY - g.y0;
    g.disp = d >= 0 ? d : d / 4;
    g.sheet.style.transform = `translateY(${g.disp}px)`;
    if (g.scrim) g.scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, g.disp) / g.h * 0.9));
    const now = performance.now(); g.samples.push([now, t.clientY]); while (g.samples.length > 2 && now - g.samples[0][0] > 100) g.samples.shift();
  }
  function end() {
    if (!g) return;
    const s = g; g = null;
    if (s.state !== 'active') return;
    const [t0, y0] = s.samples[0], [t1, y1] = s.samples[s.samples.length - 1];
    const v = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0;   // px per ms, positive is down
    const gs = G(); const r = root();
    const finish = () => { s.sheet.classList.remove('swiping'); if (r) r.classList.remove('m-sheet-gsap'); };
    if (v > FLICK || s.disp > s.h * FAR) {
      const left = s.h - Math.max(0, s.disp);
      const dur = Math.min(0.3, Math.max(0.1, left / Math.max(v, 1.4) / 1000));
      const done = () => { finish(); sheet.close(); };
      if (gs) {
        gs.to(s.sheet, { y: s.h, duration: dur, ease: v > FLICK ? 'power1.out' : 'power2.in', onComplete: done });
        if (s.scrim) gs.to(s.scrim, { opacity: 0, duration: dur, ease: 'power1.out' });
      } else { s.sheet.style.transition = `transform ${dur}s ease-out`; s.sheet.style.transform = `translateY(${s.h}px)`; setTimeout(() => { s.sheet.style.transition = ''; done(); }, dur * 1000); }
    } else {
      // spring back: a critically damped return, no overshoot (the design spec says no bounce on layout).
      // From large, a downward flick that does not close snaps to medium when the sheet has both stops.
      const drop = s.detent === 'large' && !!s.sheet.dataset.grow;
      const done = () => { s.sheet.style.transform = ''; if (s.scrim) s.scrim.style.opacity = ''; finish(); if (drop) setDetent(s.sheet, 'medium'); };
      if (gs) {
        gs.to(s.sheet, { y: 0, duration: 0.35, ease: 'expo.out', onComplete: done });
        if (s.scrim) gs.to(s.scrim, { opacity: 1, duration: 0.25, ease: 'power1.out' });
      } else { s.sheet.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1)'; s.sheet.style.transform = 'translateY(0)'; setTimeout(() => { s.sheet.style.transition = ''; done(); }, 340); }
    }
  }
  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { if (g && g.state === 'active') end(); else g = null; }, { passive: true });
})();
