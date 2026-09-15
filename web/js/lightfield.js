/* Pico Hack: the light field.
   A band of warm light at the top of Home, one soft pool per room, drawn with three.js
   (a single full-width quad and one fragment shader) and eased with GSAP. The canvas is
   transparent; the white page shows through and the light reads as warmth on paper.

   ES module. Exports initLightField(container, getRooms) and updateLightField(), plus a
   few extras (washLightField, drainLightField, previewLightField, destroyLightField).
   The same functions are exposed on window.LightField for the app's classic scripts.

   getRooms(overrides?) must return [{ id, color: '#hex', level: 0..100, x?: 0..1 }].
   `overrides` is { device_id: level } while a slider is being dragged; an app that applies
   it when averaging a room's lights gets a light field that follows the finger. Ignoring
   the argument is fine.

   three.js is imported lazily on first init, relative to this file (../vendor/three.module.js),
   so a device without WebGL 2 never downloads it and gets the CSS fallback instead. */

const WARM_LIGHT = [1.0, 0.851, 0.627];  // #FFD9A0
const WARM_DEEP = [1.0, 0.710, 0.278];   // #FFB547
const MAX_POOLS = 16;
const DPR_CAP = 2;
const BLOOM_UP = 0.6;      // seconds, a light turning on
const FADE_DOWN = 0.9;     // seconds, a light turning off
const IDLE_FPS = 30;       // drift only: half rate is enough for a soft gradient
const THREE_URL = new URL('../vendor/three.module.js', import.meta.url).href;

const F = {
  container: null, getRooms: null, host: null,
  mode: null,               // 'gl' | 'css' | 'loading'
  three: null, renderer: null, scene: null, camera: null, mat: null, canvas: null,
  pools: new Map(), order: [],
  w: 0, h: 0, dpr: 1,
  raf: 0, running: false, visible: !document.hidden, onScreen: false, dirty: true, lastFrame: 0,
  reduced: false, mql: null, ro: null, io: null,
  gain: 1, overrides: {}, previewTimer: 0, seed: 0,
  fb: null,                 // CSS fallback state
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const G = () => (typeof window !== 'undefined' && window.gsap) || null;

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = hex.trim().replace('#', '');
  const s = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}
// Warm white, tinted a little by the room: the room colour is first lifted toward white
// (its "soft" variant) so a cool blue or a deep green never muddies the warmth.
function poolColor(hex) {
  const c = hexToRgb(hex);
  if (!c) return WARM_LIGHT.slice();
  const soft = c.map(v => lerp(v, 1, 0.55));
  return WARM_LIGHT.map((v, i) => lerp(v, soft[i], 0.35));
}
const rgba = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
function hasWebGL2() {
  try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }); if (!gl) return false; const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); return true; }
  catch (_) { return false; }
}

// ---------- shaders ----------
const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */`
precision highp float;
#define N ${MAX_POOLS}
uniform vec2 uRes;
uniform vec2 uPos[N];
uniform vec2 uSig[N];
uniform float uI[N];
uniform vec3 uCol[N];
uniform int uCount;
uniform float uTime;
uniform float uGain;
uniform vec3 uLight;
uniform vec3 uDeep;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 px = vUv * uRes;
  float E = 0.0; vec3 C = vec3(0.0); float W = 0.0;
  for (int k = 0; k < N; k++) {
    if (k >= uCount) break;
    vec2 d = (px - uPos[k]) / uSig[k];
    float g = exp(-0.5 * dot(d, d)) * uI[k];
    E += g; C += uCol[k] * g; W += g;
  }
  C = W > 1e-4 ? C / W : uLight;
  E *= uGain;
  // The band fades out toward its bottom edge (and a little at the top) so the canvas never shows a hard cut.
  float mask = smoothstep(0.0, 0.4, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
  float t = (1.0 - exp(-2.1 * E)) * mask;
  // Where light piles up the colour deepens toward amber, the way a lamp's core is warmer than its spill.
  vec3 col = mix(C, mix(uDeep, C, 0.35), smoothstep(0.55, 2.4, E));
  // A whisper of dither on the premultiplied output (alpha included) so 8-bit gradients never band on white.
  float n = (hash(px + fract(uTime) * 7.0) + hash(px * 1.7 + 3.1) - 1.0) * (1.0 / 255.0);
  gl_FragColor = vec4(col * t, t) + n;
}`;

// ---------- pools ----------
function mkPool(id, idx) {
  const seed = (F.seed += 1) * 1.618 + idx;
  return {
    id, i: 0, target: 0, col: WARM_LIGHT.slice(), hint: null,
    bx: 0, by: 0, bsx: 80, bsy: 50,     // laid-out base position and sigma (CSS px)
    x: 0, y: 0, sx: 80, sy: 50,         // eased toward the base when the layout changes
    dy: 0, placed: false, gone: false,
    seed, fx: 0.09 + (seed % 1) * 0.05, fy: 0.07 + ((seed * 1.3) % 1) * 0.05, fs: 0.11 + ((seed * 0.7) % 1) * 0.04,
  };
}

// Place pools across the band. Even spacing unless a room gave an x hint; centres stagger a
// touch vertically so the row never looks machined.
function layout(animate) {
  const n = F.order.length; if (!n || !F.w) return;
  const W = F.w, H = F.h;
  const spacing = W / n;
  const sx = clamp(spacing * 0.72, 54, Math.min(170, W * 0.4));
  const sy = clamp(sx * 0.7, 40, H * 0.5);
  F.order.forEach((id, k) => {
    const p = F.pools.get(id); if (!p) return;
    const hx = typeof p.hint === 'number' && p.hint >= 0 && p.hint <= 1 ? p.hint : (k + 0.5) / n;
    p.bx = hx * W;
    // High in the band: the light spills up behind the status line and the chips float on it.
    p.by = H * (n === 1 ? 0.36 : (k % 2 ? 0.42 : 0.3));
    p.bsx = n === 1 ? Math.min(W * 0.4, 190) : sx;
    p.bsy = n === 1 ? Math.min(H * 0.5, 90) : sy;
    const g = G();
    if (!p.placed || !animate || !g || F.reduced) { p.x = p.bx; p.y = p.by; p.sx = p.bsx; p.sy = p.bsy; p.placed = true; }
    else g.to(p, { x: p.bx, y: p.by, sx: p.bsx, sy: p.bsy, duration: 0.7, ease: 'power2.inOut', overwrite: 'auto' });
  });
  F.dirty = true;
}

function readRooms() {
  let rooms = [];
  try { rooms = F.getRooms ? F.getRooms(F.overrides) : []; } catch (e) { console.warn('LightField: getRooms threw', e); }
  return Array.isArray(rooms) ? rooms.slice(0, MAX_POOLS) : [];
}

// Re-read the rooms and ease every pool toward its level. opts: { duration, stagger, immediate }.
function update(opts = {}) {
  if (!F.mode) return;
  const rooms = readRooms();
  const seen = new Set();
  const g = G();
  let orderChanged = rooms.length !== F.order.length;
  rooms.forEach((r, idx) => {
    const id = String(r && r.id != null ? r.id : idx);
    seen.add(id);
    if (F.order[idx] !== id) orderChanged = true;
    let p = F.pools.get(id);
    if (!p) { p = mkPool(id, idx); F.pools.set(id, p); orderChanged = true; }
    p.gone = false;
    p.col = poolColor(r && r.color);
    p.hint = r && typeof r.x === 'number' ? r.x : null;
    p.target = clamp((r && Number(r.level)) || 0, 0, 100) / 100;
  });
  for (const [id, p] of F.pools) if (!seen.has(id) && !p.gone) { p.gone = true; p.target = 0; orderChanged = true; }
  if (orderChanged) { F.order = rooms.map((r, idx) => String(r && r.id != null ? r.id : idx)); layout(true); }

  let k = 0;
  for (const p of F.pools.values()) {
    const up = p.target > p.i;
    const dur = opts.immediate ? 0 : (opts.duration != null ? opts.duration : (up ? BLOOM_UP : FADE_DOWN));
    const done = () => { if (p.gone && p.i <= 0.001) { F.pools.delete(p.id); F.dirty = true; } };
    if (F.reduced || !g || dur === 0) { p.i = p.target; p.dy = 0; done(); }
    else {
      const delay = opts.stagger ? Math.min(0.6, k * 0.08) : 0;
      g.to(p, { i: p.target, dy: 0, duration: dur, delay, ease: up ? 'power2.out' : 'power2.inOut', overwrite: 'auto', onComplete: done });
    }
    k++;
  }
  F.dirty = true;
  if (F.mode === 'css') fbPaint();
  wake();
}

// A wash of light: each pool flares briefly, left to right, then settles back to its level.
function wash(ids) {
  if (!F.mode || F.reduced) return;
  const g = G(); if (!g) return;
  const want = ids && ids.length ? new Set(ids.map(String)) : null;
  const pools = [...F.pools.values()].filter(p => !want || want.has(p.id)).sort((a, b) => a.x - b.x);
  pools.forEach((p, k) => {
    const peak = Math.min(1.3, Math.max(p.target, p.i) + 0.55);
    g.timeline({ delay: k * 0.09 })
      .to(p, { i: peak, duration: 0.26, ease: 'power2.out', overwrite: 'auto' })
      .to(p, { i: p.target, duration: 0.85, ease: 'power2.inOut' });
  });
  if (F.mode === 'css') fbFlash(pools);
  wake();
}

// Everything off: the light drains out of the band, sinking as it goes.
function drain() {
  if (!F.mode) return;
  const g = G();
  for (const p of F.pools.values()) {
    p.target = 0;
    if (F.reduced || !g) { p.i = 0; continue; }
    g.to(p, { i: 0, dy: 34, duration: 0.75, ease: 'power2.in', overwrite: 'auto' });
  }
  F.dirty = true;
  if (F.mode === 'css') fbPaint();
  wake();
}

// Slider preview: the app's getRooms may honour overrides[device_id] while a finger is down.
function preview(deviceId, level) {
  if (!F.mode) return;
  if (level == null) delete F.overrides[deviceId]; else F.overrides[deviceId] = Number(level);
  clearTimeout(F.previewTimer);
  F.previewTimer = setTimeout(() => { F.overrides = {}; update(); }, 1100);
  update({ duration: 0.18 });
}

// ---------- frame loop ----------
function wake() {
  if (!F.mode || F.running) return;
  if (!F.visible || !F.onScreen) { if (F.mode === 'gl' && F.dirty && F.reduced) renderOnce(); return; }
  F.running = true; F.lastFrame = 0;
  F.raf = requestAnimationFrame(frame);
}
function sleep() { F.running = false; if (F.raf) cancelAnimationFrame(F.raf); F.raf = 0; }

function frame(t) {
  F.raf = 0; F.running = false;
  if (!F.mode || !F.visible || !F.onScreen || !F.host || !F.host.isConnected) return;
  const g = G();
  const tweening = g ? [...F.pools.values()].some(p => g.isTweening(p)) : easeManually(t);
  const idle = !tweening;
  const minGap = idle ? 1000 / IDLE_FPS : 0;
  if (t - F.lastFrame >= minGap) {
    F.lastFrame = t;
    if (F.mode === 'gl') renderGL(t / 1000);
    F.dirty = false;
  }
  // Keep going while something moves: a tween, or the drift (which never stops unless motion is reduced).
  if (!F.reduced || tweening || F.dirty) { F.running = true; F.raf = requestAnimationFrame(frame); }
}
// Without GSAP: an exponential approach, which is what a lamp does anyway.
function easeManually(t) {
  const dt = Math.min(0.05, F._lastT ? (t - F._lastT) / 1000 : 0.016); F._lastT = t;
  let moving = false;
  for (const p of [...F.pools.values()]) {
    const tau = p.target > p.i ? 0.17 : 0.28;
    const d = p.target - p.i;
    if (Math.abs(d) > 0.002) { p.i += d * (1 - Math.exp(-dt / tau)); moving = true; }
    else { p.i = p.target; if (p.gone) F.pools.delete(p.id); }
    if (Math.abs(p.dy) > 0.1) { p.dy *= Math.exp(-dt / 0.3); moving = true; } else p.dy = 0;
  }
  return moving;
}

function renderOnce() { if (F.mode === 'gl' && F.renderer) renderGL(performance.now() / 1000); F.dirty = false; }

function renderGL(time) {
  const u = F.mat.uniforms;
  const pos = u.uPos.value, sig = u.uSig.value, ints = u.uI.value, col = u.uCol.value;
  let k = 0;
  const drift = F.reduced ? 0 : 1;
  for (const p of F.pools.values()) {
    if (k >= MAX_POOLS) break;
    const ph = p.seed;
    const dx = drift * Math.sin(time * p.fx * 6.283 + ph) * F.w * 0.035;
    const dyv = drift * Math.sin(time * p.fy * 6.283 + ph * 1.7) * 7;
    const br = 1 + drift * Math.sin(time * p.fs * 6.283 + ph * 0.6) * 0.06;
    const life = 1 + drift * Math.sin(time * 0.31 * 6.283 + ph * 2.1) * 0.025;   // a slow wander of intensity, barely there
    pos[k * 2] = p.x + dx; pos[k * 2 + 1] = F.h - (p.y + dyv + p.dy);     // GL y runs upward
    sig[k * 2] = p.sx * br; sig[k * 2 + 1] = p.sy * (2 - br);
    ints[k] = Math.max(0, p.i) * life;
    col[k * 3] = p.col[0]; col[k * 3 + 1] = p.col[1]; col[k * 3 + 2] = p.col[2];
    k++;
  }
  u.uCount.value = k;
  u.uTime.value = time;
  u.uGain.value = F.gain;
  F.renderer.render(F.scene, F.camera);
}

// ---------- three.js ----------
async function glInit() {
  const THREE = await import(THREE_URL);
  F.three = THREE;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power', depth: false, stencil: false });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.className = 'm-lf-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uPos: { value: new Float32Array(MAX_POOLS * 2) },
    uSig: { value: new Float32Array(MAX_POOLS * 2).fill(1) },
    uI: { value: new Float32Array(MAX_POOLS) },
    uCol: { value: new Float32Array(MAX_POOLS * 3) },
    uCount: { value: 0 }, uTime: { value: 0 }, uGain: { value: 1 },
    uLight: { value: new THREE.Vector3(...WARM_LIGHT) },
    uDeep: { value: new THREE.Vector3(...WARM_DEEP) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); sleep(); }, false);
  canvas.addEventListener('webglcontextrestored', () => { F.dirty = true; wake(); }, false);
  Object.assign(F, { renderer, scene, camera, mat, canvas });
  F.host.appendChild(canvas);
  F.mode = 'gl';
  resize();
}

function resize() {
  if (!F.host) return;
  const w = F.host.clientWidth, h = F.host.clientHeight;
  if (!w || !h) return;
  const changed = w !== F.w || h !== F.h;
  F.w = w; F.h = h;
  if (F.mode === 'gl') {
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    F.dpr = dpr;
    F.renderer.setPixelRatio(dpr);
    F.renderer.setSize(w, h, false);
    F.mat.uniforms.uRes.value.set(w, h);
  }
  if (changed) { layout(false); if (F.mode === 'css') fbPaint(); F.dirty = true; wake(); }
}

// ---------- CSS fallback (no WebGL 2, or three.js failed to load) ----------
function cssInit() {
  const el = document.createElement('div');
  el.className = 'm-lf-fallback';
  el.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;' +
    '-webkit-mask-image:linear-gradient(to bottom,rgba(0,0,0,.6),#000 22%,#000 55%,transparent 100%);mask-image:linear-gradient(to bottom,rgba(0,0,0,.6),#000 22%,#000 55%,transparent 100%);';
  F.host.appendChild(el);
  F.fb = { el, nodes: new Map() };
  if (!document.getElementById('m-lf-style')) {
    const st = document.createElement('style'); st.id = 'm-lf-style';
    st.textContent = '@keyframes m-lf-drift{0%{transform:translate(-3%,-4%) scale(1)}50%{transform:translate(3%,3%) scale(1.06)}100%{transform:translate(-2%,4%) scale(.97)}}' +
      '.m-lf-pool{position:absolute;border-radius:50%;will-change:opacity,transform;mix-blend-mode:multiply}' +
      '@media (prefers-reduced-motion:reduce){.m-lf-pool{animation:none!important;transition:none!important}}';
    document.head.appendChild(st);
  }
  F.mode = 'css';
  resize();
}
function fbPaint() {
  if (!F.fb) return;
  const seen = new Set();
  for (const p of F.pools.values()) {
    seen.add(p.id);
    let n = F.fb.nodes.get(p.id);
    if (!n) {
      n = document.createElement('div'); n.className = 'm-lf-pool';
      n.style.opacity = '0';
      n.style.animation = F.reduced ? 'none' : `m-lf-drift ${9 + (p.seed % 1) * 6}s ease-in-out ${-(p.seed % 1) * 9}s infinite alternate`;
      F.fb.el.appendChild(n); F.fb.nodes.set(p.id, n);
    }
    const w = p.bsx * 5.2, h = p.bsy * 5.2;
    n.style.left = `${p.bx - w / 2}px`; n.style.top = `${p.by - h / 2}px`;
    n.style.width = `${w}px`; n.style.height = `${h}px`;
    const deep = p.col.map((v, i) => lerp(v, WARM_DEEP[i], 0.45));
    n.style.background = `radial-gradient(closest-side, ${rgba(deep, 0.92)} 0%, ${rgba(p.col, 0.75)} 28%, ${rgba(p.col, 0.28)} 62%, ${rgba(p.col, 0)} 100%)`;
    const up = p.target > Number(n.style.opacity || 0);
    n.style.transition = F.reduced ? 'none' : `opacity ${up ? BLOOM_UP : FADE_DOWN}s cubic-bezier(.2,.8,.2,1)`;
    requestAnimationFrame(() => { n.style.opacity = String(p.target * 0.95); });
  }
  for (const [id, n] of F.fb.nodes) if (!seen.has(id)) { n.style.opacity = '0'; setTimeout(() => { n.remove(); }, FADE_DOWN * 1000); F.fb.nodes.delete(id); }
}
function fbFlash(pools) {
  if (!F.fb) return;
  pools.forEach((p, k) => {
    const n = F.fb.nodes.get(p.id); if (!n) return;
    setTimeout(() => { n.style.transition = 'opacity .26s cubic-bezier(.2,.8,.2,1)'; n.style.opacity = '1'; setTimeout(() => { n.style.transition = 'opacity .85s cubic-bezier(.2,.8,.2,1)'; n.style.opacity = String(p.target * 0.95); }, 280); }, k * 90);
  });
}

// ---------- observers ----------
function watch(container) {
  if (F.ro) F.ro.disconnect();
  if (F.io) F.io.disconnect();
  F.ro = new ResizeObserver(() => resize());
  F.ro.observe(container);
  F.io = new IntersectionObserver(entries => {
    F.onScreen = entries.some(e => e.isIntersecting);
    if (F.onScreen) { F.dirty = true; wake(); } else sleep();
  }, { threshold: 0 });
  F.io.observe(container);
}
function onVisibility() {
  F.visible = !document.hidden;
  if (F.visible) { F.dirty = true; wake(); } else sleep();
}
function onReduced(e) { F.reduced = e.matches; if (F.reduced) { for (const p of F.pools.values()) { p.i = p.target; p.dy = 0; } } F.dirty = true; wake(); }

// ---------- public ----------
export async function initLightField(container, getRooms) {
  if (!container || typeof getRooms !== 'function') return null;
  F.getRooms = getRooms;
  if (F.mode && F.host) {
    // Home re-rendered: adopt the fresh container, keep the context and the pools' current light.
    if (F.host.parentNode !== container) container.appendChild(F.host);
    F.container = container;
    watch(container);
    resize();
    update();
    return F.mode;
  }
  if (F.mode === 'loading') { F.container = container; return F.mode; }

  F.container = container;
  F.reduced = reducedMotion();
  if (window.matchMedia && !F.mql) { F.mql = window.matchMedia('(prefers-reduced-motion: reduce)'); if (F.mql.addEventListener) F.mql.addEventListener('change', onReduced); }
  document.addEventListener('visibilitychange', onVisibility);
  const host = document.createElement('div');
  host.className = 'm-lf-host';
  host.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
  F.host = host;
  container.appendChild(host);
  watch(container);
  F.mode = 'loading';
  if (hasWebGL2()) {
    try { await glInit(); }
    catch (e) { console.warn('LightField: WebGL unavailable, using the CSS fallback', e); if (F.canvas) F.canvas.remove(); F.mode = null; cssInit(); }
  } else cssInit();
  if (F.container !== container && F.container) { F.container.appendChild(host); watch(F.container); resize(); }
  // App launch: every pool blooms up from nothing, left to right.
  update({ stagger: true, duration: 0.9 });
  return F.mode;
}

export function updateLightField(opts) { update(opts || {}); }
export function washLightField(roomIds) { wash(roomIds); }
export function drainLightField() { drain(); }
export function previewLightField(deviceId, level) { preview(deviceId, level); }
export function destroyLightField() {
  sleep();
  if (F.ro) F.ro.disconnect(); if (F.io) F.io.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
  if (F.mql && F.mql.removeEventListener) F.mql.removeEventListener('change', onReduced);
  if (F.renderer) { try { F.renderer.dispose(); } catch (_) { /* ignore */ } }
  if (F.host) F.host.remove();
  Object.assign(F, { container: null, host: null, mode: null, renderer: null, scene: null, camera: null, mat: null, canvas: null, fb: null, pools: new Map(), order: [], ro: null, io: null, mql: null, w: 0, h: 0 });
}
export const lightFieldState = () => ({ mode: F.mode, pools: F.pools.size, running: F.running });

if (typeof window !== 'undefined') {
  window.LightField = { init: initLightField, update: updateLightField, wash: washLightField, drain: drainLightField, preview: previewLightField, destroy: destroyLightField, state: lightFieldState };
}
