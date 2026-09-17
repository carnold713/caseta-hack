/* Swipe a row sideways for its second most likely action (docs/ia-v5.md 3, stage 2).
   The iOS way to reach one more thing without printing a button on every row: a light row swipes to "Turn off"
   (or "Turn on"), a room row to "All off", an automation row to "Skip tonight" and, in red, "Delete".
   Every one of these has a visible twin somewhere else, so the gesture is a shortcut and never the only way in.

   It cannot fight js/slide.js any more, because rows have no sliders on them: the only slider left inside a row is
   a shade's, and a shade's row carries no swipe. Touch only, one row open at a time, and a tap anywhere else closes
   whatever is open. */
(function () {
  'use strict';
  const SLOP = 10;              // px sideways before the row starts to follow the finger
  const OPEN = 0.45;            // share of the tray the finger has to pass for the row to stay open
  const MAX_OVER = 24;          // rubber band past the tray
  let g = null, openRow = null;

  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const G = () => (window.gsap && !reduced() ? window.gsap : null);

  // What a row offers. Returns [{label, act, data, danger}] or null when the row has no actions.
  function actionsFor(row) {
    if (row.dataset.lswipe) {
      const t = row.dataset.lswipe; const on = typeof targetOn === 'function' && targetOn(t);
      return [{ label: on ? 'Turn off' : 'Turn on', act: 'toggle', data: { t } }];
    }
    if (row.classList.contains('room') && row.dataset.tgt) {
      const t = row.dataset.tgt; if (!row.querySelector('.sw')) return null;
      const on = typeof targetOn === 'function' && targetOn(t);
      return [{ label: on ? 'All off' : 'All on', act: 'toggle', data: { t } }];
    }
    if (row.classList.contains('auto') && row.dataset.auswipe) {
      const id = row.dataset.auswipe; const date = row.dataset.auswipeDate || '';
      const skipping = row.dataset.auswipeSkipping === '1';
      const out = [];
      if (date) out.push({ label: skipping ? "Don't skip" : 'Skip tonight', act: skipping ? 'au-unskip' : 'au-skip', data: { id, date } });
      out.push({ label: 'Delete', act: 'au-swipe-delete', data: { id }, danger: true });
      return out;
    }
    return null;
  }

  function trayHTML(list) {
    return `<div class="rowtray">${list.map(a => `<button class="rowact ${a.danger ? 'danger' : ''}" data-act="${a.act}" ${Object.entries(a.data).map(([k, v]) => `data-${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}>${a.label}</button>`).join('')}</div>`;
  }
  function wrapOf(row) { return row.querySelector(':scope > .lwrap, :scope > .head, :scope > .auto-main') ? row : null; }
  // The row's own children slide; the tray sits behind them, pinned to the right edge.
  function movable(row) { return [...row.children].filter(el => !el.classList.contains('rowtray')); }

  function close(row, instant) {
    if (!row) return;
    const els = movable(row); const gs = G();
    const done = () => { els.forEach(el => { el.style.transform = ''; }); const t = row.querySelector('.rowtray'); if (t) t.remove(); row.classList.remove('swiped'); };
    if (instant || !gs) done();
    else gs.to(els, { x: 0, duration: 0.2, ease: 'power2.out', onComplete: done });
    if (openRow === row) openRow = null;
  }
  function settle(row, x, trayW) {
    const els = movable(row); const gs = G();
    if (gs) gs.to(els, { x, duration: 0.2, ease: 'power2.out' });
    else els.forEach(el => { el.style.transform = `translateX(${x}px)`; });
    if (x < 0) { row.classList.add('swiped'); openRow = row; } else close(row, false);
    void trayW;
  }

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const row = e.target.closest('[data-lswipe], .item.room, .item.auto[data-auswipe]');
    if (openRow && openRow !== row) { if (!e.target.closest('.rowtray')) close(openRow, false); }
    if (!row) { g = null; return; }
    if (e.target.closest('input, .slider, .sliderwrap, .rowtray, .chips')) { g = null; return; }
    const list = actionsFor(row); if (!list || !list.length) { g = null; return; }
    const t = e.touches[0];
    g = { row, list, x0: t.clientX, y0: t.clientY, state: 'pending', trayW: 0 };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!g) return;
    const t = e.touches[0]; const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (g.state === 'pending') {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) { g = null; return; }   // the page is scrolling
      if (dx > -SLOP) return;                                                          // only a left pull opens a tray
      g.state = 'active'; g.x0 = t.clientX - SLOP;
      if (!g.row.querySelector('.rowtray')) g.row.insertAdjacentHTML('beforeend', trayHTML(g.list));
      g.trayW = Math.round(g.row.querySelector('.rowtray').getBoundingClientRect().width) || 96;
      g.row.classList.add('swiping');
    }
    e.preventDefault();
    let d = t.clientX - g.x0;
    if (d < -g.trayW) d = -g.trayW - (-d - g.trayW) / 4;
    if (d > 0) d = 0;
    if (d < -g.trayW - MAX_OVER) d = -g.trayW - MAX_OVER;
    movable(g.row).forEach(el => { el.style.transform = `translateX(${d}px)`; });
    g.d = d;
  }, { passive: false });

  const end = () => {
    if (!g) return; const s = g; g = null;
    s.row.classList.remove('swiping');
    if (s.state !== 'active') return;
    settle(s.row, (-s.d || 0) > s.trayW * OPEN ? -s.trayW : 0, s.trayW);
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });

  // A tray action runs and the row closes: the act itself is handled by the app's own delegated listeners.
  document.addEventListener('click', e => {
    const a = e.target.closest('.rowact');
    if (a) { const row = a.closest('.item'); setTimeout(() => close(row, false), 60); return; }
    if (openRow && !e.target.closest('.rowtray')) close(openRow, false);
  }, true);
  // A render throws the open row away with the rest of the page.
  window.addEventListener('hashchange', () => { openRow = null; });
})();
