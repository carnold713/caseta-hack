/* Sliders take a deliberate gesture.
   A finger that lands on a brightness slider while scrolling the page must scroll the page, not set
   the light. The native range inputs are inert to pointers (styles.css: input.slider has
   pointer-events none), so a touch on one reaches the element around it. This layer watches that
   touch and decides what it meant: a tap sets the value where the finger is; a clear left-right drag
   (SLOP px sideways, more sideways than up-down) drags the value; anything that moves up or down
   first is a scroll and is left to the browser. The input is then driven by dispatching the same
   'input' and 'change' events the app already listens for, so nothing else changes.
   Keyboard use is untouched: the inputs still take focus with Tab and move with the arrow keys. */
(function () {
  'use strict';
  const SLOP = 8;
  let g = null;

  function sliderAt(zone, x, y) {
    if (!zone || !zone.querySelectorAll) return null;
    const list = zone.matches('input.slider') ? [zone] : zone.querySelectorAll('input.slider');
    for (const inp of list) {
      const r = inp.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top - 4 && y <= r.bottom + 4) return inp;
    }
    return null;
  }
  // The knob is 24px wide and rides a track that is the input's width minus the knob, like the native control.
  function valueAt(inp, x) {
    const r = inp.getBoundingClientRect();
    const min = Number(inp.min) || 0, max = inp.max === '' ? 100 : Number(inp.max), step = Number(inp.step) || 1;
    const pad = 12;
    const f = Math.min(1, Math.max(0, (x - r.left - pad) / Math.max(1, r.width - pad * 2)));
    let v = min + f * (max - min);
    v = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, v));
  }
  function apply(inp, x) {
    const v = valueAt(inp, x);
    if (String(v) === inp.value) return false;
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  function finish(changed) {
    const inp = g.inp; g = null;
    if (changed) inp.dispatchEvent(new Event('change', { bubbles: true }));
    if (inp.dataset.slide || inp.dataset.house) setTimeout(() => { delete inp.dataset.drag; if (typeof paintState === 'function') paintState(); }, 1500);
  }

  document.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    const inp = sliderAt(e.target, e.clientX, e.clientY);
    if (!inp || inp.disabled) return;
    g = { inp, id: e.pointerId, x0: e.clientX, y0: e.clientY, state: 'pending', zone: e.target, changed: false };
  });
  document.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    if (g.state === 'pending') {
      const dx = Math.abs(e.clientX - g.x0), dy = Math.abs(e.clientY - g.y0);
      if (dy >= SLOP && dy >= dx) { g.state = 'dead'; return; }
      if (!(dx >= SLOP && dx > dy)) return;
      g.state = 'active';
      try { g.zone.setPointerCapture(g.id); } catch (_) { /* a zone that cannot capture still gets document moves */ }
      if (g.inp.dataset.slide || g.inp.dataset.house) g.inp.dataset.drag = '1';
    }
    if (g.state === 'active' && apply(g.inp, e.clientX)) g.changed = true;
  });
  document.addEventListener('pointerup', e => {
    if (!g || e.pointerId !== g.id) return;
    if (g.state === 'pending') { apply(g.inp, e.clientX); finish(true); }
    else if (g.state === 'active') finish(g.changed);
    else g = null;
  });
  document.addEventListener('pointercancel', e => { if (g && e.pointerId === g.id) g = null; });
})();

/* Horizontal rows on a desktop. Chip rows, scene tiles and a room's scene row scroll sideways under a finger;
   a mouse gets the same: drag the row to scroll it (a real drag, not a click), and a wheel over the
   row scrolls it sideways when the row has somewhere to go. */
(function () {
  'use strict';
  const ROWS = '.chips.scroll, .tiles, .moods, .ln-row, .now .chips.scroll';
  const SLOP = 6;
  let g = null;
  const rowOf = el => (el && el.closest ? el.closest(ROWS) : null);
  const canScroll = row => row.scrollWidth > row.clientWidth + 1;
  document.addEventListener('wheel', e => {
    const row = rowOf(e.target); if (!row || !canScroll(row)) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;             // a sideways wheel already works
    const before = row.scrollLeft;
    row.scrollLeft += e.deltaY;
    if (row.scrollLeft !== before) e.preventDefault();               // at either end, let the page scroll
  }, { passive: false });
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const row = rowOf(e.target); if (!row || !canScroll(row)) return;
    g = { row, x0: e.clientX, left: row.scrollLeft, id: e.pointerId, dragging: false };
  });
  document.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    if (!g.dragging) { if (Math.abs(dx) < SLOP) return; g.dragging = true; g.row.classList.add('dragging'); try { g.row.setPointerCapture(g.id); } catch (_) { /* fine */ } }
    g.row.scrollLeft = g.left - dx;
  });
  const end = e => { if (!g || e.pointerId !== g.id) return; const was = g.dragging; const row = g.row; g = null; if (was) { row.classList.remove('dragging'); row._swallow = true; setTimeout(() => { row._swallow = false; }, 0); } };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  // the click that ends a drag is not a tap on whatever chip the mouse happened to stop on
  document.addEventListener('click', e => { const row = rowOf(e.target); if (row && row._swallow) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
})();
