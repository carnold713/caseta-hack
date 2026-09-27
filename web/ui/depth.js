// Light in depth: the page's side of the three.js light (depthworker.js draws it). Two things are drawn this way, where
// the phone can:
//
//   the one light   glow.js lightHTML: the soft light at the top of Home, Rooms, a room and Settings, and a light's own
//                   page. Drawn as a real light over the page, its reach draws in toward its core as it dims, the way
//                   a lamp's does, instead of the whole gradient fading as one; at full it lies where the stylesheet's
//                   does. Goodnight putting Home to sleep room by room is this light going down, so it goes the same.
//   a room's light  the room page's illustration (roomscene.js): its lamps light the wall and the floor as lights in a
//                   shallow box, falling off with distance, landing at an angle, aimed as each fixture aims.
//
// Nothing here decides how a light looks or when it moves. The stylesheet, motion.js and the screens still draw and
// animate the elements they always did: this reads them each frame (an element's opacity, its colour, the crossfade
// copies over it, a lamp's marker in the drawing) and sends what it reads to the worker, so the light in depth keeps
// every clock the page keeps (the dimmer, a scene's ring reaching each lamp, a room opening from its card, Goodnight).
// What the worker sends back is laid into a canvas inside the light's own element. The page's own drawing of the light
// stays under it, put away only once the canvas has its first picture, and comes back if the GPU is lost: no WebGL,
// reduced motion, a software GPU, a low battery or a hidden page all simply leave the page as it was.
//
// One worker, one WebGL context, for every light on every page. It is started the first time a page has a light and
// let go a few seconds after the last page with one is left, or after the app has been in the background a while.
import { reduced, T } from '/ui/motion.js';

const SITES = '.onelight, .room-photo-card > .room-scene';
const M = 8;                          // the canvas reaches this far past a light's own box (components.css)
// Pixels per CSS pixel at most. Light this soft has no detail finer than a few pixels, so the canvas is scaled up to
// the screen by the compositor: the one light at one pixel per CSS pixel, a room's light at three for every four (its
// grain lies over it). A phone's own 2.6 would be ten times the work for nothing anyone could see.
const CAP = { light: 1, room: 0.75 };
const FADE = T.standard;              // the page's light and the canvas hand over on the standard 0.24 s
const HANDBACK = 300;                 // a room's canvas leaving with its page gives the light back to the drawing
const IDLE_MS = 3000, HIDDEN_MS = 10000;
const WORKER = '/ui/depthworker.js';

// The two lights of lightHTML, as the stylesheet draws them: the peak of each (components.css), the share of the page's
// width its radius is, and how high over the page a real light would hang for its falloff to lie on the drawn one (a
// cos^3 lobe, fitted to the soften-glows curve: within one step of 8-bit colour of it at full strength).
const LIGHTS = { top: { peak: 0.14, share: 0.7, h: 0.94, y: () => -12 }, lamp: { peak: 0.22, share: 0.6, h: 0.865, y: g => g.lampY } };
const BGS = 0x12 / 255;
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const strengthAt = peak => lin(BGS + peak * (1 - BGS)) - lin(BGS);
const FLOOR = 204, DEPTH = 5.5;       // roomscene.js F and DEPTH

let scr = null, worker = null, mode = 'off';   // off, starting, on, lost, failed
let raf = 0, inflight = false, frameN = 0, idleTimer = 0, hiddenTimer = 0, battery = null, nextId = 1;
const sites = new Map(), byId = new Map();
// what it has done and what it cost: the page's own time reading the lights each frame, and the worker's drawing them
const stats = { workers: 0, live: 0, frames: 0, pictures: 0, reveals: 0, lost: 0, restored: 0, fails: 0, why: '', ticks: 0, tickMs: 0, tickMax: 0, layMax: 0, drawMs: 0, drawMax: 0 };

// ---------- may it ----------
const pref = () => { try { return localStorage.getItem('depth'); } catch (_) { return null; } };
function allowed() {
  const p = pref();
  if (p === 'off' || mode === 'failed') return false;
  if (reduced()) return false;
  if (typeof WebGL2RenderingContext !== 'function' || typeof OffscreenCanvas !== 'function' || typeof Worker !== 'function' || !('transferToImageBitmap' in OffscreenCanvas.prototype)) return false;
  if (p === 'on') return true;
  // a battery nearly out and not charging, or a phone with very little memory, keeps the page's own light
  if (battery && !battery.charging && battery.level <= 0.2) return false;
  if (navigator.deviceMemory && navigator.deviceMemory < 2) return false;
  return true;
}

// ---------- the worker ----------
// Started once the app has drawn and gone quiet, so three.js and its context never compete with the app's own first
// seconds (the page's own light shows meanwhile, and the light in depth fades in over it when it is ready).
let booked = 0;
function startWorker() {
  if (worker || booked || !allowed() || document.hidden) return;
  const go = () => { booked = 0; if (!worker && allowed() && !document.hidden && [...sites.values()].some(s => s.el.isConnected)) spawn(); };
  booked = typeof requestIdleCallback === 'function' ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 600);
}
function spawn() {
  try { worker = new Worker(WORKER, { type: 'module' }); } catch (_) { mode = 'failed'; return; }
  mode = 'starting';
  stats.workers++; stats.live++;
  worker.onmessage = onMessage;
  worker.onerror = () => fail('the worker failed to load');
  worker.postMessage({ type: 'init', force: pref() === 'on' });
}
function fail(why) {
  stats.fails++; stats.why = why || '';
  stop();
  mode = 'failed';
}
// Let go of the worker and its context. Every light goes back to the page's own drawing at once (this happens with
// the app in the background, or with no light on the page, or motion turned down: nothing to fade for).
function stop() {
  if (worker) {
    const w = worker; worker = null; stats.live--;
    try { w.postMessage({ type: 'dispose' }); } catch (_) { /* gone */ }
    setTimeout(() => w.terminate(), 500);
  }
  if (raf) cancelAnimationFrame(raf);
  raf = 0; inflight = false;
  if (mode !== 'failed') mode = 'off';
  for (const s of sites.values()) unreveal(s, false);
}
function onMessage(e) {
  // (a worker already let go still says goodbye: its context going with it is not this page losing the GPU)
  if (e.target !== worker) return;
  const m = e.data || {};
  if (m.type === 'ready') {
    mode = 'on';
    for (const s of sites.values()) if (!s.canvas && s.el.isConnected) attach(s);
    wake();
  } else if (m.type === 'fail') fail(m.why);
  else if (m.type === 'frame') {
    inflight = false;
    stats.drawMs += m.ms || 0; stats.drawMax = Math.max(stats.drawMax, m.ms || 0);
    const t0 = performance.now();
    for (const o of m.out) {
      const s = byId.get(o.id);
      if (!s || !s.bctx || mode !== 'on') { o.bmp.close(); continue; }
      if (s.canvas.width !== o.bmp.width) s.canvas.width = o.bmp.width;
      if (s.canvas.height !== o.bmp.height) s.canvas.height = o.bmp.height;
      s.bctx.transferFromImageBitmap(o.bmp);
      s.sig = o.sig; stats.pictures++;
      if (!s.shown) reveal(s);
    }
    stats.layMax = Math.max(stats.layMax, performance.now() - t0);
    wake();
  } else if (m.type === 'lost') {
    // the GPU took the context away: the page's own light, until it is back
    mode = 'lost'; stats.lost++;
    inflight = false;
    for (const s of sites.values()) unreveal(s, true);
  } else if (m.type === 'restored') {
    stats.restored++;
    mode = 'on';
    for (const s of sites.values()) { s.sig = ''; if (!s.canvas && s.el.isConnected) attach(s); }
    wake();
  }
}

// ---------- the lights on the page ----------
function kindOf(el) { return el.classList.contains('room-scene') ? 'room' : el.classList.contains('onelight-lamp') ? 'lamp' : 'top'; }
function found(el) {
  if (sites.has(el)) return;
  const s = { id: nextId++, el, kind: kindOf(el), canvas: null, bctx: null, shown: false, sig: '', geo: null, vis: true, handed: false, obs: null };
  sites.set(el, s); byId.set(s.id, s);
  clearTimeout(idleTimer);
  if (mode === 'on') attach(s);
  else if (mode === 'off') startWorker();
}
function forget(s) {
  if (s.obs) for (const o of s.obs) o.disconnect();
  s.obs = null;
  sites.delete(s.el); byId.delete(s.id);
}
// A light drawn again (the page redrawn) takes over the canvas of the one it replaces, picture and all, so nothing
// is ever seen without it; a light on a page just opened gets a canvas of its own, and the page's own light shows
// until the first picture is in it.
// A room's goes into its drawing, in the place the drawing keeps for it behind the furniture (roomscene.js rs-spill),
// in a foreignObject laid over the part of the scene the page shows.
const home = s => (s.kind === 'room' ? s.el.querySelector('.rs-spill') : s.el);
function attach(s) {
  const at = home(s);
  if (!at) return;
  let from = null;
  for (const o of sites.values()) if (o !== s && o.kind === s.kind && o.canvas && !o.el.isConnected) { from = o; break; }
  if (from) {
    Object.assign(s, { holder: from.holder, canvas: from.canvas, bctx: from.bctx, shown: from.shown });
    forget(from);
    at.appendChild(s.holder);
    if (s.shown) s.el.dataset.d3 = 'on';
  } else {
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.style.opacity = '0';
    let holder = c;
    if (s.kind === 'room') {
      holder = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      holder.appendChild(c);
    }
    holder.classList.add('d3');
    at.appendChild(holder);
    Object.assign(s, { holder, canvas: c, bctx: c.getContext('bitmaprenderer') });
  }
  // the header's light drifts on the document's clock, as motion.js settle keeps every loop: a canvas put back in the
  // page starts its drift again from nothing, which would move the light in one frame
  if (s.kind === 'top') for (const a of s.canvas.getAnimations()) if (a.effect && a.effect.getTiming().iterations === Infinity) a.startTime = 0;
  const ro = new ResizeObserver(() => { s.geo = null; s.sig = ''; wake(); });
  ro.observe(s.el);
  const io = new IntersectionObserver(es => { s.vis = es.some(x => x.isIntersecting); if (s.vis) wake(); });
  io.observe(s.el);
  const mo = new MutationObserver(recs => { if (recs.some(r => !s.holder.contains(r.target))) wake(); });
  mo.observe(s.el, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  s.obs = [ro, io, mo];
  s.geo = null; s.sig = '';
  wake();
}

// The canvas in, the page's own light out, both on the standard 0.24 s. What fades the page's light is an animation on
// its elements, which motion.js carries across a redraw like any other, so a redraw in the middle goes on with it.
function parts(s) { return s.kind === 'room' ? s.el.querySelectorAll('.rs-pools') : s.el.querySelectorAll('.ol-c i'); }
function reveal(s) {
  s.shown = true; stats.reveals++;
  s.el.dataset.d3 = 'on';
  s.canvas.style.opacity = '1';
  if (reduced()) return;
  s.canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, easing: T.ease });
  for (const p of parts(s)) p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, easing: T.ease });
}
function unreveal(s, fade) {
  if (!s.shown) return;
  s.shown = false; s.sig = '';
  delete s.el.dataset.d3;
  if (!s.canvas) return;
  s.canvas.style.opacity = '0';
  if (!fade || reduced()) return;
  s.canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, easing: T.ease });
  for (const p of parts(s)) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, easing: T.ease });
}
// A room's page leaving (a push, or closing back into its card on Rooms) takes its canvas with it, as it is. The card
// it may close into draws its light as the drawing does, so the leaving page hands its light back to the drawing on
// the way, and lands as the card.
function away(s) {
  if (s.kind !== 'room' || !s.shown || s.handed || reduced()) return;
  s.handed = true;
  const o = { duration: HANDBACK, easing: 'ease-in-out', fill: 'forwards' };
  s.canvas.animate([{ opacity: 1 }, { opacity: 0 }], o);
  for (const p of parts(s)) p.animate([{ opacity: 0 }, { opacity: 1 }], o);
}

// ---------- reading a light ----------
const rgbOf = v => { const m = String(v || '').match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/); return m ? [+m[1], +m[2], +m[3]] : [255, 199, 138]; };
const linRGB = v => rgbOf(v).map(c => lin(c / 255));
const r4 = v => Math.round(v * 1e4) / 1e4;
function running(el) {
  for (const a of el.getAnimations({ subtree: true })) {
    if (a.playState !== 'running' && !a.pending) continue;
    const t = a.effect && a.effect.getTiming();
    if (t && t.iterations !== Infinity) return true;
  }
  return false;
}
function scaleFor(kind) { return CAP[kind === 'room' ? 'room' : 'light']; }

function readLight(s) {
  const el = s.el;
  if (!s.geo) {
    const w = el.clientWidth, h = el.clientHeight;
    const lampY = parseFloat(getComputedStyle(el).getPropertyValue('--lamp-y')) || 112;
    const L = LIGHTS[s.kind], r = L.share * w;
    const cw = w + 2 * M, ch = s.kind === 'lamp' ? Math.min(h + 2 * M, lampY + r + 2 * M) : h + 2 * M;
    const sc = scaleFor(s.kind), pw = Math.max(1, Math.round(cw * sc)), ph = Math.max(1, Math.round(ch * sc));
    s.geo = { w, h, lampY, r, cw, ch, pw, ph, sc: pw / cw, k: strengthAt(L.peak), hh: L.h, cx: M + w / 2, cy: M + L.y({ lampY }) };
    if (s.kind === 'lamp') s.canvas.style.height = `${ch}px`;
  }
  const g = s.geo;
  if (!g.w) return null;
  const S = Number(getComputedStyle(el).opacity) || 0;
  const ol = el.querySelector(':scope > .ol-c');
  if (!ol) return null;
  const gain = Number(getComputedStyle(ol).opacity) || 0;
  // the colour, and any crossfade's copies of the colour it was, mixed in linear light by how much of each still shows
  let col = linRGB(ol.style.getPropertyValue('--l-c'));
  for (const k of ol.children) {
    if (!k.classList.contains('xf-old')) continue;
    const o = Number(getComputedStyle(k).opacity) || 0, c = linRGB(k.style.getPropertyValue('--l-c'));
    col = col.map((v, i) => v + (c[i] - v) * o);
  }
  const u = { cx: g.cx, cy: g.cy, r: g.r, h: g.hh, k: g.k, s: r4(S), gain: r4(gain), col: col.map(r4) };
  return { id: s.id, kind: 'light', pw: g.pw, ph: g.ph, scale: g.sc, u, sig: `${u.s}|${u.gain}|${u.col}|${g.pw}x${g.ph}` };
}

function readRoom(s) {
  const el = s.el;
  if (!s.geo) {
    const svg = el.querySelector('svg');
    if (!svg || !svg.viewBox || !svg.viewBox.baseVal) return null;
    const vb = svg.viewBox.baseVal, w = el.clientWidth, h = el.clientHeight;
    if (!w || !h || !vb.width) return null;
    // the drawing's own fit (preserveAspectRatio slice, centred), so the picture covers only the part of the scene the
    // page shows; and whether it is drawn mirrored, which its group does to the picture as to everything in it
    const k = Math.max(w / vb.width, h / vb.height);
    const ox = (w - vb.width * k) / 2 - vb.x * k, oy = (h - vb.height * k) / 2 - vb.y * k;
    const g = svg.querySelector(':scope > g[transform]');
    const flip = g && /matrix\(\s*-1/.test(g.getAttribute('transform') || '');
    const x0 = Math.max(vb.x, -ox / k), x1 = Math.min(vb.x + vb.width, (w - ox) / k);
    const y0 = Math.max(vb.y, -oy / k), y1 = Math.min(vb.y + vb.height, (h - oy) / k);
    const lx = flip ? 372 - x1 : x0, uw = x1 - x0, uh = y1 - y0;
    const sc = scaleFor('room'), pw = Math.max(1, Math.round(uw * k * sc)), ph = Math.max(1, Math.round(uh * k * sc));
    for (const [a, v] of [['x', lx], ['y', y0], ['width', uw], ['height', uh]]) s.holder.setAttribute(a, String(Math.round(v * 100) / 100));
    s.geo = {
      w, h, pw, ph, sc: 1, unit: pw / uw, ox: lx, oy: y0,
      marks: [...svg.querySelectorAll('.rs-lamp')].map(m => ({ m, pts: String(m.dataset.e || '').split(';').map(p => p.split(' ').map(Number)).filter(p => p.length === 5 && p.every(Number.isFinite)) })),
    };
  }
  const g = s.geo;
  const pos = [], col = [], at = [];
  for (const { m, pts } of g.marks) {
    const cs = getComputedStyle(m);
    const I = r4(Number(cs.opacity) || 0), c = linRGB(cs.color).map(r4);
    if (I < 0.002) continue;   // a lamp that is out adds nothing, and costs the worker a pass over every pixel
    for (const p of pts) { pos.push(p[0], p[1], p[2], p[3]); at.push(p[4]); col.push(...c, I); }
  }
  const u = { unit: g.unit, ox: g.ox, oy: g.oy, floor: FLOOR, depth: DEPTH, pos, col, at };
  return { id: s.id, kind: 'room', pw: g.pw, ph: g.ph, scale: g.sc, u, sig: `${col.join(',')}|${g.pw}x${g.ph}|${g.unit}` };
}

// ---------- each frame ----------
// Each frame the page draws, the lights are read just after it: in the frame itself, reading an element's style
// worked the page's style out ahead of its own time and again after it, where after the frame it is already known.
// (A picture is a frame or two behind the page either way, which on light this soft is never seen.)
const after = new MessageChannel();
after.port1.onmessage = () => tick();
function wake() { if (!raf && mode === 'on' && !document.hidden) raf = requestAnimationFrame(() => after.port2.postMessage(0)); }
function tick() {
  raf = 0;
  if (mode !== 'on' || document.hidden || !worker) return;
  const t0 = performance.now();
  let busy = false;
  const jobs = [];
  for (const s of [...sites.values()]) {
    // gone from the page with nothing to take its place (the redraw that dropped it has already given its canvas away)
    if (!s.el.isConnected) { forget(s); continue; }
    // taken into a page that is leaving: it keeps its last picture and goes with it
    if (!scr.contains(s.el)) { away(s); continue; }
    if (!s.canvas || !s.vis) continue;
    if (running(s.el)) busy = true;
    const job = s.kind === 'room' ? readRoom(s) : readLight(s);
    if (job && (job.sig !== s.sig || !s.shown)) jobs.push(job);
  }
  if (jobs.length) {
    if (!inflight) {
      inflight = true; frameN++; stats.frames++;
      worker.postMessage({ type: 'frame', n: frameN, jobs });
    } else busy = true;
  }
  if (busy) wake();
  idle();
  const ms = performance.now() - t0;
  stats.ticks++; stats.tickMs += ms; stats.tickMax = Math.max(stats.tickMax, ms);
}
// No light left on the page: the context goes a few seconds later (a quick trip to Remotes and back keeps it).
function idle() {
  clearTimeout(idleTimer);
  const any = [...sites.values()].some(s => s.el.isConnected);
  if (!any && worker) idleTimer = setTimeout(() => { if (![...sites.values()].some(s => s.el.isConnected)) stop(); }, IDLE_MS);
}

// ---------- the page telling us ----------
function added(recs) {
  for (const r of recs) for (const n of r.addedNodes) {
    if (n.nodeType !== 1 || n.classList.contains('d3')) continue;
    if (n.matches(SITES)) found(n);
    for (const el of n.querySelectorAll(SITES)) found(el);
  }
  idle();
}
function review() {
  if (allowed()) { if (!worker && [...sites.values()].some(s => s.el.isConnected)) startWorker(); }
  else if (worker) stop();
}

export function start(screen) {
  if (scr || !screen) return;
  scr = screen;
  new MutationObserver(added).observe(scr, { childList: true, subtree: true });
  for (const el of scr.querySelectorAll(SITES)) found(el);
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', review);
  document.addEventListener('visibilitychange', () => {
    clearTimeout(hiddenTimer);
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; hiddenTimer = setTimeout(() => { if (document.hidden) stop(); }, HIDDEN_MS); return; }
    if (worker) { for (const s of sites.values()) s.sig = ''; wake(); } else review();
  });
  if (navigator.getBattery) navigator.getBattery().then(b => { battery = b; b.addEventListener('levelchange', review); b.addEventListener('chargingchange', review); review(); }).catch(() => {});
}

// For the tests: what is running, and the GPU's context lost and given back the way a real loss is.
if (typeof window !== 'undefined') {
  window.__depth = {
    get mode() { return mode; },
    stats,
    sites: () => [...sites.values()].map(s => ({ kind: s.kind, shown: s.shown, onPage: !!(scr && scr.contains(s.el)), canvas: !!s.canvas })),
    lose: () => worker && worker.postMessage({ type: 'lose' }),
    restore: () => worker && worker.postMessage({ type: 'restore' }),
  };
}
