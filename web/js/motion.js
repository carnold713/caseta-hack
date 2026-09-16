/* Pico Hack motion hooks. Classic script, no module, no bundler.
   Load /vendor/gsap.min.js before this file. Every hook is a no-op when GSAP is missing,
   when the person prefers reduced motion, or when the element is not there, and none of
   them ever throws into the app. There is no observer here: the app calls these hooks.

   window.Motion = {
     pageIn(viewEl, {launch})      a view has just been rendered
     sheetIn(rootEl)               #sheet-root got .open and .in this frame
     sheetOut(rootEl) -> Promise   #sheet-root is closing
     press(el, {flash, scale})     a real press on a button; on a Pico SVG button: scale + a flash on the glyph
     sceneRun(roomEls)             a scene ran: a wash of light across the affected room cards (and the light field)
     allOff()                      the All off hold completed: the page's light drains out
     lightChanged(rowEl, level, wasOn)   a light's level changed (call from paintState)
     sliderFeedback(sliderEl, level)     a slider is being dragged: the light follows the finger
     expand(roomEl, open)          a room card opened or closed
     pulse(el)                     a gesture was detected on a remote
     textSwap(el, html)            a headline changed: fade out, swap, fade in
     barIn(el)                     the Light now bar's first appearance: a 16px rise, 120ms after the page
     reduced() -> boolean
   } */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const WARM = '#FFD9A0';
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const G = () => (window.gsap && !reduced() ? window.gsap : null);
  const arr = x => (!x ? [] : Array.isArray(x) ? x : typeof x.length === 'number' && !x.nodeType ? Array.from(x) : [x]);
  const el = x => (typeof x === 'string' ? document.querySelector(x) : x) || null;
  const rel = e => { if (e && getComputedStyle(e).position === 'static') e.style.position = 'relative'; };
  const LF = () => window.LightField || null;
  function safe(fn) { return function () { try { return fn.apply(null, arguments); } catch (e) { if (window.console) console.warn('Motion:', e); } }; }
  function restart(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

  // ---------- view change / app launch ----------
  let lastPage = 0;
  function pageIn(viewEl, opts) {
    opts = opts || {};
    const g = G(); const v = el(viewEl) || document.getElementById('view'); if (!g || !v) return;
    const now = performance.now(); if (now - lastPage < 250 && !opts.force) return; lastPage = now;
    const launch = !!opts.launch;
    g.killTweensOf(v);
    g.fromTo(v, { opacity: 0, y: launch ? 16 : 10 }, { opacity: 1, y: 0, duration: launch ? 0.42 : 0.255, ease: 'power2.out', clearProps: 'opacity,transform', overwrite: true });
    if (launch) {
      const top = document.getElementById('top');
      if (top && top.children.length) g.fromTo(top.children, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform' });
    }
  }

  // ---------- sheet choreography: scrim, then the sheet, then its content ----------
  function sheetParts(rootEl) {
    const root = el(rootEl) || document.getElementById('sheet-root'); if (!root) return null;
    const sheet = root.classList.contains('sheet') ? root : root.querySelector('.sheet');
    const scrim = root.querySelector('.scrim');
    const sh = sheet && sheet.querySelector('.sh'); const sb = sheet && sheet.querySelector('.sb');
    return { root: sheet === root ? root.parentNode : root, sheet, scrim, sh, sb };
  }
  function sheetIn(rootEl) {
    const g = G(); const p = sheetParts(rootEl); if (!g || !p || !p.sheet) return;
    const { root, sheet, scrim, sh, sb } = p;
    g.killTweensOf([sheet, scrim].filter(Boolean));
    root.classList.add('m-sheet-gsap');
    const content = [sh, ...(sb ? Array.from(sb.children).slice(0, 12) : [])].filter(Boolean);
    const tl = g.timeline({ onComplete: () => { root.classList.remove('m-sheet-gsap'); g.set([sheet, scrim].filter(Boolean), { clearProps: 'transform,opacity' }); } });
    if (scrim) tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'power1.out' }, 0);
    tl.fromTo(sheet, { y: '100%' }, { y: '0%', duration: 0.3, ease: 'power3.out' }, 0);
    if (content.length) tl.fromTo(content, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.255, ease: 'power2.out', stagger: 0.025, clearProps: 'opacity,transform' }, 0.08);
  }
  function sheetOut(rootEl) {
    const g = G(); const p = sheetParts(rootEl);
    if (!g || !p || !p.sheet) return Promise.resolve();
    const { root, sheet, scrim } = p;
    g.killTweensOf([sheet, scrim].filter(Boolean));
    root.classList.add('m-sheet-gsap');
    return new Promise(resolve => {
      const tl = g.timeline({ onComplete: () => { root.classList.remove('m-sheet-gsap'); g.set([sheet, scrim].filter(Boolean), { clearProps: 'transform,opacity' }); resolve(); } });
      tl.to(sheet, { y: '100%', duration: 0.255, ease: 'power2.in' }, 0);
      if (scrim) tl.to(scrim, { opacity: 0, duration: 0.24, ease: 'power1.in' }, 0.02);
    });
  }

  // ---------- press ----------
  function press(target, opts) {
    opts = opts || {};
    const e = el(target); if (!e) return;
    if (e.ownerSVGElement) return pressSVG(e, opts);
    const g = G();
    if (!g) { if (!reduced()) restart(e, 'm-press'); return; }
    e.classList.add('m-pressing');
    g.fromTo(e, { scale: opts.scale != null ? opts.scale : 0.94 }, { scale: 1, duration: 0.15, ease: 'power2.out', overwrite: true, clearProps: 'transform', onComplete: () => e.classList.remove('m-pressing') });
    if (opts.flash) ring(e);
  }
  // A Pico button on the illustration: the whole key sinks and a warm flash blooms behind the glyph.
  let flashSeq = 0;
  function pressSVG(key, opts) {
    const g = G();
    const shape = key.querySelector('.pk-shape') || key;
    let bb = null; try { bb = shape.getBBox(); } catch (_) { /* detached */ }
    if (bb && bb.width && !reduced()) {
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2, r = Math.max(bb.width, bb.height) * 0.62;
      const svg = key.ownerSVGElement;
      const gid = 'm-flash-g' + (++flashSeq);
      const grad = document.createElementNS(NS, 'radialGradient'); grad.setAttribute('id', gid);
      [[0, 1], [0.45, 0.85], [1, 0]].forEach(([o, a]) => { const s = document.createElementNS(NS, 'stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', WARM); s.setAttribute('stop-opacity', a); grad.appendChild(s); });
      svg.insertBefore(grad, svg.firstChild);
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'm-flash'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
      c.setAttribute('fill', `url(#${gid})`); c.setAttribute('opacity', '0.95');
      if (shape.nextSibling) key.insertBefore(c, shape.nextSibling); else key.appendChild(c);   // above the key face, below the glyph
      const done = () => { c.remove(); grad.remove(); };
      if (g) g.fromTo(c, { attr: { r: r * 0.35 }, opacity: 1 }, { attr: { r: r * 1.1 }, opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: done });
      else { c.classList.add('m-flash-css'); setTimeout(done, 600); }
    }
    if (g) g.fromTo(key, { scale: opts.scale != null ? opts.scale : 0.93 }, { scale: 1, duration: 0.255, ease: 'power2.out', transformOrigin: '50% 50%', overwrite: true, clearProps: 'transform' });
  }
  // A warm ring that expands out of a round button and fades: a light just came on here.
  function ring(host) {
    const g = G(); if (!g) return;
    rel(host);
    const r = document.createElement('span'); r.className = 'm-ring';
    host.appendChild(r);
    g.fromTo(r, { scale: 0.85, opacity: 0.9 }, { scale: 1.75, opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: () => r.remove() });
  }

  // ---------- scene run: a wash of light across the affected rooms ----------
  function sceneRun(roomEls) {
    const rooms = arr(roomEls).map(el).filter(Boolean);
    const lf = LF(); if (lf && lf.wash) lf.wash(rooms.map(r => r.dataset && r.dataset.room).filter(Boolean));
    const g = G(); if (!g || !rooms.length) return;
    rooms.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    rooms.forEach((room, i) => {
      rel(room);
      if (getComputedStyle(room).isolation !== 'isolate') room.style.isolation = 'isolate';   // keeps z-index -1 inside the card
      const w = document.createElement('div'); w.className = 'm-wash';
      room.appendChild(w);
      const d = i * 0.08;
      g.timeline({ onComplete: () => w.remove() })
        .fromTo(w, { xPercent: -80 }, { xPercent: 80, duration: 0.9, ease: 'power1.inOut' }, d)
        .fromTo(w, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' }, d)
        .to(w, { opacity: 0, duration: 0.35, ease: 'power1.in' }, d + 0.55);
    });
  }

  // ---------- all off: the whole page's light drains out, top to bottom ----------
  let veil = null;
  function allOff() {
    const lf = LF(); if (lf && lf.drain) lf.drain();
    const g = G(); if (!g) return;
    if (veil) { g.killTweensOf(veil); veil.remove(); }
    veil = document.createElement('div'); veil.className = 'm-veil';
    document.body.appendChild(veil);
    // The band sits above the viewport (top: -60vh); it starts a quarter of the way in and travels past the bottom edge.
    g.timeline({ onComplete: () => { if (veil) veil.remove(); veil = null; } })
      .fromTo(veil, { yPercent: 30, opacity: 1 }, { yPercent: 275, duration: 0.8, ease: 'power1.in' }, 0)
      .to(veil, { opacity: 0.7, duration: 0.3, ease: 'power1.in' }, 0.5);
  }

  // ---------- a light changed ----------
  // rowEl is a .light row, a room card, or the .act button itself. Pass wasOn when you know it;
  // otherwise the first call on a fresh element only seeds and later calls animate the flips.
  function lightChanged(rowEl, level, wasOn) {
    const e = el(rowEl); if (!e) return;
    const on = Number(level) > 0;
    const prev = typeof wasOn === 'boolean' ? wasOn : e._mOn;
    e._mOn = on;
    const g = G(); if (!g || typeof prev !== 'boolean' || prev === on) return;
    const isRoom = e.classList.contains('room');
    const act = e.classList.contains('act') ? e : isRoom ? null : e.querySelector('.act');
    const chip = isRoom ? e.querySelector('.onchip') : null;
    if (on) {
      if (act) { ring(act); g.fromTo(act, { scale: 0.88 }, { scale: 1, duration: 0.255, ease: 'power2.out', overwrite: true, clearProps: 'transform' }); }
      if (chip) g.fromTo(chip, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.255, ease: 'power3.out', overwrite: true, clearProps: 'transform,opacity' });
    } else if (act) {
      g.fromTo(act, { scale: 0.96 }, { scale: 1, duration: 0.255, ease: 'power2.out', overwrite: true, clearProps: 'transform' });
    }
  }

  // ---------- slider drag: light responds continuously ----------
  function sliderFeedback(sliderEl, level) {
    const s = el(sliderEl); if (!s) return;
    const v = Math.max(0, Math.min(100, Number(level) || 0));
    const lf = LF(); const id = s.dataset && s.dataset.lvl;
    if (lf && lf.preview && id) lf.preview(id, v);
    const g = G(); if (!g) return;
    const row = s.closest('.light'); const act = row && row.querySelector('.act'); if (!act) return;
    rel(act);
    let halo = act.querySelector('.m-halo');
    if (!halo) { halo = document.createElement('span'); halo.className = 'm-halo'; act.appendChild(halo); }
    g.to(halo, { opacity: (v / 100) * 0.9, duration: 0.14, ease: 'power1.out', overwrite: true });
    clearTimeout(act._mHalo);
    act._mHalo = setTimeout(() => { g.to(halo, { opacity: 0, duration: 0.6, ease: 'power2.out', overwrite: true, onComplete: () => halo.remove() }); }, 800);
  }

  // ---------- room card expand: the height is CSS (grid rows); the rows inside settle in ----------
  function expand(roomEl, open) {
    const g = G(); const r = el(roomEl); if (!g || !r || open === false) return;
    const rows = r.querySelectorAll('.light');
    if (rows.length) g.fromTo(rows, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.255, ease: 'power2.out', stagger: 0.03, delay: 0.06, clearProps: 'opacity,transform' });
  }

  // ---------- gesture detected on a remote ----------
  function pulse(target) {
    const e = el(target); if (!e) return;
    const g = G();
    if (!g) { if (!reduced()) restart(e, 'm-pulse'); return; }
    g.fromTo(e, { backgroundColor: '#FCE3C4' }, { backgroundColor: 'rgba(252,227,196,0)', duration: 0.9, ease: 'power2.out', overwrite: true, clearProps: 'backgroundColor' });
    const ic = e.querySelector('.ic');
    if (ic) g.fromTo(ic, { scale: 1.12 }, { scale: 1, duration: 0.5, ease: 'power2.out', overwrite: true, clearProps: 'transform' });
  }

  // ---------- a headline changed: fade out 150ms, swap, fade in 255ms with a 4px rise ----------
  function textSwap(target, html) {
    const e = el(target); if (!e) return;
    if (e.innerHTML === html) return;
    const g = G(); if (!g) { e.innerHTML = html; return; }
    g.killTweensOf(e);
    g.to(e, { opacity: 0, duration: 0.15, ease: 'power1.in', overwrite: true, onComplete: () => {
      e.innerHTML = html;
      g.fromTo(e, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.255, ease: 'power2.out', clearProps: 'opacity,transform' });
    } });
  }

  // ---------- the Light now bar appears: a 16px rise over 300ms, 120ms after the page ----------
  function barIn(target) {
    const e = el(target); const g = G(); if (!g || !e) return;
    g.killTweensOf(e);
    g.fromTo(e, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, delay: 0.12, ease: 'power2.out', clearProps: 'opacity,transform', overwrite: true });
  }

  window.Motion = {
    pageIn: safe(pageIn), sheetIn: safe(sheetIn),
    sheetOut: function (root) { try { return sheetOut(root) || Promise.resolve(); } catch (e) { if (window.console) console.warn('Motion:', e); return Promise.resolve(); } },
    press: safe(press), sceneRun: safe(sceneRun), allOff: safe(allOff),
    lightChanged: safe(lightChanged), sliderFeedback: safe(sliderFeedback),
    expand: safe(expand), pulse: safe(pulse), textSwap: safe(textSwap), barIn: safe(barIn), reduced,
  };
})();
