/* Pico Hack motion hooks. Classic script, no module, no bundler.
   Load /vendor/gsap.min.js before this file. Every hook is a no-op when GSAP is missing,
   when the person prefers reduced motion, or when the element is not there, and none of
   them ever throws into the app. There is no observer here: the app calls these hooks.

   window.Motion = {
     pageIn(viewEl, {launch})      a view has just been rendered: a 150ms cross-fade, no travel (the launch rises 16px)
     swap(hostEl, fn, {nodes, top})  content is about to change in place: the old fades out over a ghost (80ms), fn swaps it, the new fades in (150ms)
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
     barIn(el)                     the bottom pill's first appearance: a 16px rise, 120ms after the page
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

  // ---------- the real curves, for GSAP ----------
  // vendor/gsap.min.js is GSAP core with no CustomEase, so every tween here used to approximate the CSS
  // curve with power2.out. That mismatch shows the moment a CSS transition and a tween run on the same
  // object, which is exactly what a tinted card does. GSAP core takes a plain function as an ease, so
  // give it the real one: a Newton solve for x, then the cubic in y.
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const fx = t => ((ax * t + bx) * t + cx) * t;
    const dx = t => (3 * ax * t + 2 * bx) * t + cx;
    return function (p) {
      if (p <= 0) return 0; if (p >= 1) return 1;
      let t = p;
      for (let i = 0; i < 8; i++) { const e = fx(t) - p, d = dx(t); if (Math.abs(e) < 1e-5) break; if (Math.abs(d) < 1e-6) break; t -= e / d; }
      t = Math.min(1, Math.max(0, t));
      return ((ay * t + by) * t + cy) * t;
    };
  }
  const EASE = bezier(.4, .12, .3, 1);
  const EASE_SLOW = bezier(.3, 0, 0, 1);

  // ---------- which changes were ours ----------
  // levelQuiet is not enough on its own: sendGated stamps its quiet window only after the command
  // resolves, and a plain command() toggle never stamps one. So stamp at the optimistic write instead.
  // Anything that arrives without a stamp (a Pico, the Hue app, an automation, the hub) was not you.
  const MINE = Object.create(null);
  const MINE_MS = 1500;
  function mine(t) {
    const list = typeof targetDevices === 'function' ? targetDevices(t) : [];
    const until = Date.now() + MINE_MS;
    for (const id of (list.length ? list : [String(t).replace(/^d:/, '')])) MINE[id] = until;
  }
  const isMine = id => (MINE[id] || 0) > Date.now() || (typeof levelQuiet === 'function' && levelQuiet(`d:${id}`));

  // A beat drawn on a card nobody can see is a beat spent on nothing.
  function inView(e) {
    const r = e.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight) && r.left < (window.innerWidth || document.documentElement.clientWidth);
  }

  // ---------- a value is arriving at 60fps: the surfaces that follow it drop their transitions ----------
  // A transition and a 60fps value stream are incompatible: every input event restarts a 255ms ease and
  // the card ends up permanently behind the thumb. The finger owns the frame. slide.js's own data-drag
  // is not reused as the switch: it is cleared 1500ms after release, and 1500ms of suppressed
  // transitions would turn the settle after the finger lifts into a snap.
  const TRACK_OFF = 120;   // ms of quiet after the last input event before transitions come back
  function trackLevel(sliderEl, level) {
    const s = el(sliderEl); if (!s) return;
    const v = Math.max(0, Math.min(100, Number(level) || 0));
    const id = s.dataset && (s.dataset.lvl || (s.dataset.slide || '').replace(/^d:/, ''));
    const host = s.closest('.dtile') || s.closest('.light') || s.closest('#ld');
    if (host && !host.dataset.track) host.dataset.track = '1';
    clearTimeout(s._mTrack);
    s._mTrack = setTimeout(() => { if (host) delete host.dataset.track; }, TRACK_OFF);
    // the room's hero follows the same finger, at its own lag: one property write on one pool
    const pool = id && document.querySelector(`.rh-pool[data-rh="${id}"]`);
    if (pool) {
      pool.dataset.track = '1'; clearTimeout(pool._mt);
      pool._mt = setTimeout(() => delete pool.dataset.track, TRACK_OFF);
      if (typeof window.paintRoomHeroPool === 'function') window.paintRoomHeroPool(pool, v);
    }
  }

  // ---------- view change / app launch ----------
  let lastPage = 0;
  function pageIn(viewEl, opts) {
    opts = opts || {};
    const g = G(); const v = el(viewEl) || document.getElementById('view'); if (!g || !v) return;
    const now = performance.now(); if (now - lastPage < 250 && !opts.force) return; lastPage = now;
    const launch = !!opts.launch;
    g.killTweensOf(v);
    // a page change is a cross-fade with no travel (a slide on every tab reads as a jump); only the launch rises
    if (launch) g.fromTo(v, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out', clearProps: 'opacity,transform', overwrite: true });
    else g.fromTo(v, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'power2.out', clearProps: 'opacity', overwrite: true });
    if (launch) {
      const top = document.getElementById('top');
      if (top && top.children.length) g.fromTo(top.children, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform' });
    }
  }

  // ---------- content swapped in place: a sheet step, a Now panel, the kind picker ----------
  // The old nodes are cloned into an absolutely positioned ghost over the host, fn rewrites the real content, the ghost
  // fades out over 80ms while the new content fades in over 150ms. Nothing travels, so nothing reads as a jump.
  function swap(hostEl, fn, opts) {
    opts = opts || {};
    const h = el(hostEl); const g = G();
    if (!h) { if (fn) fn(); return; }
    if (!g) { fn(); return; }
    rel(h);
    const nodes = (opts.nodes ? arr(opts.nodes).map(el) : Array.from(h.children)).filter(n => n && !n.classList.contains('m-ghost'));
    const w = document.createElement('div'); w.className = 'm-ghost';
    if (opts.top != null) w.style.top = opts.top + 'px';
    const scrolls = nodes.map(n => n.scrollTop);
    for (const n of nodes) w.appendChild(n.cloneNode(true));
    w.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    fn();
    h.appendChild(w);
    Array.from(w.children).forEach((c, i) => { if (scrolls[i]) c.scrollTop = scrolls[i]; });
    g.to(w, { opacity: 0, duration: 0.08, ease: 'power1.in', onComplete: () => w.remove() });
    const fresh = (opts.nodes ? nodes : Array.from(h.children)).filter(k => k !== w && !k.classList.contains('m-ghost'));
    if (!fresh.length) return;
    g.killTweensOf(fresh);
    g.fromTo(fresh, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'power2.out', delay: 0.04, clearProps: 'opacity', overwrite: true });
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
    // the device grid moves as one 8px block with its neighbours: twelve tiles, one tween. A stagger
    // shows causality, never arrival, and a screen appearing is arrival.
    const blocks = sb ? Array.from(sb.children).filter(n => !n.classList.contains('dgrid')).slice(0, 3) : [];
    const grid = sb ? sb.querySelector('.dgrid') : null;
    const content = [sh, ...blocks, grid].filter(Boolean);
    const tl = g.timeline({ onComplete: () => { root.classList.remove('m-sheet-gsap'); g.set([sheet, scrim].filter(Boolean), { clearProps: 'transform,opacity' }); } });
    if (scrim) tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'power1.out' }, 0);
    tl.fromTo(sheet, { y: '100%' }, { y: '0%', duration: 0.3, ease: 'power3.out' }, 0);
    if (content.length) tl.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out', stagger: 0.015, clearProps: 'opacity,transform' }, 0.08);
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
  // rowEl is a device tile, a .light row, a room card, or the .act button itself. Pass wasOn when you
  // know it; otherwise the first call on a fresh element only seeds and later calls animate the flips.
  //
  // A change you caused gets no extra motion: the press already answered you and the fill is the
  // confirmation. A change you did not cause gets exactly one extra beat, on the control that carries
  // the boolean, which is where the eye goes to check.
  const PASS_MS = 40;      // paintState fires its sweeps in one burst; this is the width of that burst
  const RING_BUDGET = 2;   // a scene that lights twelve tiles must not fire twelve rings
  let passAt = -1e9, passRings = 0;
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function lightChanged(rowEl, level, wasOn) {
    const e = el(rowEl); if (!e) return;
    const on = Number(level) > 0;
    const now = nowMs();
    // paintState's [data-tgt] sweep and its [data-act-lvl] sweep both find a device tile, and both
    // describe the same flip. The second one is dropped rather than drawn twice.
    if (e._mOn === on && now - (e._mAt || -1e9) < PASS_MS) return;
    const prev = typeof wasOn === 'boolean' ? wasOn : e._mOn;
    e._mOn = on; e._mAt = now;
    if (typeof prev !== 'boolean' || prev === on) return;
    if (now - passAt > PASS_MS) { passAt = now; passRings = 0; }
    // the device tile: the whole card has just inverted, so a button that also jumps on top of that is
    // two answers to one question. The ring is the whole addition, and only when it was not your thumb.
    if (e.classList.contains('dtile')) {
      const id = e.dataset.tile;
      if (!on || isMine(id) || passRings >= RING_BUDGET || !inView(e)) return;
      passRings++;
      if (reduced()) { e.classList.add('m-said'); clearTimeout(e._mSaid); e._mSaid = setTimeout(() => e.classList.remove('m-said'), 1200); return; }
      const pw = e.querySelector('.dpow'); if (pw) ring(pw);
      return;
    }
    const g = G(); if (!g) return;
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

  // ---------- the bottom pill appears: a 16px rise over 300ms, 120ms after the page ----------
  function barIn(target) {
    const e = el(target); const g = G(); if (!g || !e) return;
    g.killTweensOf(e);
    g.fromTo(e, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, delay: 0.12, ease: 'power2.out', clearProps: 'opacity,transform', overwrite: true });
  }

  window.Motion = {
    pageIn: safe(pageIn), swap: function (h, fn, o) { try { swap(h, fn, o); } catch (e) { if (window.console) console.warn('Motion:', e); try { if (fn && !h) fn(); } catch (_) { /* fn ran */ } } }, sheetIn: safe(sheetIn),
    sheetOut: function (root) { try { return sheetOut(root) || Promise.resolve(); } catch (e) { if (window.console) console.warn('Motion:', e); return Promise.resolve(); } },
    press: safe(press), sceneRun: safe(sceneRun), allOff: safe(allOff),
    lightChanged: safe(lightChanged), sliderFeedback: safe(sliderFeedback),
    expand: safe(expand), pulse: safe(pulse), textSwap: safe(textSwap), barIn: safe(barIn), reduced,
    E: { ease: EASE, slow: EASE_SLOW }, mine: safe(mine), isMine, trackLevel: safe(trackLevel), inView,
  };
})();
