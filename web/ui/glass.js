// Glass (glass.css): the optics. Every glass surface is a pane of glass with a rounded bezel, and what shows through
// it is worked out the way light goes through such a pane, not painted on.
//
// The pane: flat in the middle, and along its edge a bezel whose height rises from 0 at the edge to the pane's full
// height a bezel's width in, on a squircle, h(t) = (1 - (1 - t)^4)^(1/4) for t from 0 (the edge) to 1. A ray from the
// eye comes straight down, meets the surface at the slope of that profile, and is bent by Snell's law (n1 sin a =
// n2 sin b, glass about 1.5) toward the thick middle; it then crosses the glass to the page under it. Where it lands,
// against where it entered, is the displacement: nothing in the flat middle (the middle is clear), most at the steep
// edge. Blue bends a little more than red and green (dispersion: glass's index is about 1.50 for red and green
// and 1.52 for blue), so the edge splits colour very slightly (on the small surfaces; see below). The surface's
// normal, from the same slope, lights a specular rim: a light from the top left catches the top and left edges
// brightly and the bottom and right faintly.
//
// The refraction is an SVG filter in the surface's backdrop (Chromium draws SVG filters in a backdrop; elsewhere the
// glass is plain frosted glass, glass.css). Its displacement map is drawn in pieces, as a picture frame is: the four
// corners (each the rounded corner with its radius and the bezel through it) and four edges (the bezel's cross
// section, stretched along the side). The pieces depend only on the kind of surface, so they are drawn once; a surface
// of a new size only needs them placed again, a few numbers on a new <filter>. Only the strips along the edges are
// refracted: the flat middle is the page as it is (or as the frost made it), which keeps a sheet or a card cheap.
// The specular light is drawn from the same normals into pieces of its own, laid on the surface as its background
// images over the tint (glass.css), so it stays bright on a dark pane and costs nothing per frame.
//
// A ResizeObserver fits a surface again when its size changes, and a MutationObserver fits a new one in the same task
// that put it in the page, before it is drawn, so a redraw never shows a frame of plain frost.
//
// Each surface has two filters: the whole one, and one with a single displacement for all three colours (the same
// bend without the split at the edge). The dispersion is a second pass over the bezel, and it is what costs a phone
// its frames, so glass.css uses the single one while anything is in flight (a page's transition, a sheet rising or
// falling, the page under an open sheet), where the split could not be seen anyway, and always on the surfaces as
// wide as the screen (the header, a sheet) and the house card, whose bezels are long: there the second pass cost
// more frames than the split is worth.

const NS = 'http://www.w3.org/2000/svg';
const S = 2;                      // the pieces are drawn at twice the CSS size, so the rim stays crisp
const LIGHT = [-0.62, -0.78];     // where the light comes from, on the screen: the top left
const INDEX = { g: 1.50, b: 1.52 };

// ---------- the optics ----------
const height = t => Math.pow(1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4), 1 / 4);
// A ray d px in from the edge, for a bezel B px wide on a pane `depth` px thick, of index n: how far it lands from
// where it entered (px), and the surface's slope there.
function ray(d, B, depth, n) {
  const t = Math.max(d / B, 0.0005);
  if (t >= 1) return { shift: 0, slope: 0 };
  const e = 1e-3, slope = (height(t + e) - height(t - e)) / (2 * e) * depth / B;
  const a = Math.atan(slope), b = Math.asin(Math.sin(a) / n);
  // it crosses the pane's thickness there (half the depth under the bezel, and the bezel's own height over it),
  // leaning a - b from straight down
  return { shift: depth * (0.5 + 0.5 * height(t)) * Math.tan(a - b), slope };
}

// A kind of surface's optics, from its radius R, bezel B and depth: the shift and slope across the bezel, and the
// largest shift (the displacement map's range).
const optics = new Map();
function opticsFor(o) {
  const key = `${o.R}|${o.B}|${o.depth}`;
  if (optics.has(key)) return optics.get(key);
  const N = Math.ceil(o.B * S) + 1, shift = new Float32Array(N), slope = new Float32Array(N);
  let max = 0;
  for (let i = 0; i < N; i++) { const r = ray((i + 0.5) / S, o.B, o.depth, INDEX.g); shift[i] = r.shift; slope[i] = r.slope; max = Math.max(max, r.shift); }
  const v = { key, R: o.R, B: o.B, N, shift, slope, max: Math.max(max, 0.01), c: Math.max(o.R, o.B, 1), disp: null, spec: new Map() };
  optics.set(key, v);
  return v;
}

// The displacement (0.5 is none) and the light, d px inside the edge, the edge facing (ox, oy) outward.
function field(O, d, ox, oy) {
  const k = Math.floor(d * S);
  if (d < 0 || k >= O.N) return { x: 0.5, y: 0.5, light: 0 };
  const s = O.shift[k] / O.max, g = O.slope[k];
  // the normal leans outward by the slope; the light on it is strongest where it is steep and faces the light
  const len = Math.hypot(g, 1), nx = ox * g / len, ny = oy * g / len, nz = 1 / len;
  const facing = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1]) / Math.max(1e-6, Math.hypot(nx, ny));
  const light = Math.min(1, Math.pow(1 - nz, 0.6) * (0.22 + 0.78 * facing));
  // the page under the edge is seen from further in: the shift points inward
  return { x: 0.5 - 0.5 * s * ox, y: 0.5 - 0.5 * s * oy, light };
}

// The eight pieces of one map: corners c x c, edges c deep and 1 long. `px(f, data, i)` writes one pixel.
function pieces(O, px) {
  const c = O.c, n = Math.ceil(c * S), R = O.R;
  const draw = (w, h, at) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'), im = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(at((x + 0.5) / S, (y + 0.5) / S), im.data, (y * w + x) * 4);
    g.putImageData(im, 0, 0);
    return cv.toDataURL('image/png');
  };
  // a corner: sx, sy say which way is out (-1 left or top, +1 right or bottom)
  const corner = (sx, sy) => draw(n, n, (x, y) => {
    const lx = sx < 0 ? x : c - x, ly = sy < 0 ? y : c - y;   // distance from the two outside edges
    const dx = R - lx, dy = R - ly;
    if (R > 0 && dx > 0 && dy > 0) { const L = Math.hypot(dx, dy) || 1; return field(O, R - L, sx * dx / L, sy * dy / L); }
    return lx < ly ? field(O, lx, sx, 0) : field(O, ly, 0, sy);
  });
  return {
    tl: corner(-1, -1), tr: corner(1, -1), bl: corner(-1, 1), br: corner(1, 1),
    t: draw(1, n, (x, y) => field(O, y, 0, -1)), b: draw(1, n, (x, y) => field(O, c - y, 0, 1)),
    l: draw(n, 1, (x, y) => field(O, x, -1, 0)), r: draw(n, 1, (x, y) => field(O, c - x, 1, 0)),
  };
}
const dispPieces = O => O.disp || (O.disp = pieces(O, (f, d, i) => { d[i] = Math.round(255 * f.x); d[i + 1] = Math.round(255 * f.y); d[i + 2] = 0; d[i + 3] = 255; }));
function specPieces(O, strength, L) {
  const key = `${strength}|${L.r},${L.g},${L.b}`;
  if (!O.spec.has(key)) O.spec.set(key, pieces(O, (f, d, i) => { d[i] = L.r; d[i + 1] = L.g; d[i + 2] = L.b; d[i + 3] = Math.round(255 * Math.min(1, f.light * strength)); }));
  return O.spec.get(key);
}

// Where the eight pieces go on a surface W x H: `open` names the sides that are not an edge of the glass (a sheet's
// bottom, the header's top and sides), where the pane just carries on; `edge` ends the pane above the box's foot
// (the header's glass stops above its fade).
function layout(W, H, c, open, edge) {
  const bottom = edge ? Math.min(H, edge) : H;
  const top = !open.has('top'), bot = !open.has('bottom'), lef = !open.has('left'), rig = !open.has('right');
  const x0 = lef ? c : 0, x1 = rig ? W - c : W, y0 = top ? c : 0, y1 = bot ? bottom - c : bottom;
  const at = (k, x, y, w, h) => (w > 0 && h > 0 ? { k, x, y, w, h } : null);
  const strips = [];
  if (top) strips.push({ x: 0, y: 0, w: W, h: c, parts: [lef && at('tl', 0, 0, c, c), at('t', x0, 0, x1 - x0, c), rig && at('tr', W - c, 0, c, c)].filter(Boolean) });
  if (bot) strips.push({ x: 0, y: bottom - c, w: W, h: c, parts: [lef && at('bl', 0, bottom - c, c, c), at('b', x0, bottom - c, x1 - x0, c), rig && at('br', W - c, bottom - c, c, c)].filter(Boolean) });
  if (lef && y1 > y0) strips.push({ x: 0, y: y0, w: c, h: y1 - y0, parts: [at('l', 0, y0, c, y1 - y0)] });
  if (rig && y1 > y0) strips.push({ x: W - c, y: y0, w: c, h: y1 - y0, parts: [at('r', W - c, y0, c, y1 - y0)] });
  return strips;
}

// ---------- the filters ----------
let defs = null, seq = 0;
const filters = new Map();   // key -> id
const colour = (s, fb) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return fb; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };

// The refraction for a surface of W x H: each strip along an edge is displaced twice, red and green by glass's index
// and blue a little further (blue bends most: the split that shows is blue against yellow), inside that strip alone; `middle` keeps the page under the flat middle as the frost made it
// (otherwise the middle is the page as it is).
function filterFor(W, H, O, strips, middle, lite = false) {
  const key = `${W}x${H}|${O.key}|${JSON.stringify(strips.map(s => [s.x, s.y, s.w, s.h]))}|${middle}|${lite}`;
  if (filters.has(key)) return filters.get(key);
  const P = dispPieces(O), span = 2 * O.max;   // the map's 0 to 1 is -max to +max px
  const at = r => `x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"`;
  const scale = k => (span * k).toFixed(2);
  const body = strips.map((r, i) => {
    const a = at(r), m = `m${i}`;
    const map = `${r.parts.map((p, j) => `<feImage href="${P[p.k]}" ${at(p)} preserveAspectRatio="none" result="${m}p${j}"/>`).join('')}
      <feMerge ${a} result="${m}">${r.parts.map((_, j) => `<feMergeNode in="${m}p${j}"/>`).join('')}</feMerge>`;
    // in flight, one displacement for all three colours: the same bend, without the split at the edge
    if (lite) return `${map}<feDisplacementMap ${a} in="SourceGraphic" in2="${m}" scale="${scale(1)}" xChannelSelector="R" yChannelSelector="G" result="${m}seen"/>`;
    return `${map}
      <feDisplacementMap ${a} in="SourceGraphic" in2="${m}" scale="${scale(1)}" xChannelSelector="R" yChannelSelector="G" result="${m}dw"/>
      <feDisplacementMap ${a} in="SourceGraphic" in2="${m}" scale="${scale(INDEX.b / INDEX.g * 1.08)}" xChannelSelector="R" yChannelSelector="G" result="${m}db"/>
      <feColorMatrix ${a} in="${m}dw" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1" result="${m}rg"/>
      <feColorMatrix ${a} in="${m}db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 1" result="${m}cb"/>
      <feComposite ${a} in="${m}rg" in2="${m}cb" operator="arithmetic" k2="1" k3="1" result="${m}seen"/>`;
  }).join('');
  const id = `glass-f${++seq}`;
  const f = document.createElementNS(NS, 'filter');
  f.id = id;
  for (const [k, v] of Object.entries({ x: 0, y: 0, width: W, height: H, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
  f.innerHTML = `${body}<feMerge>${middle ? '<feMergeNode in="SourceGraphic"/>' : ''}${strips.map((_, i) => `<feMergeNode in="m${i}seen"/>`).join('')}</feMerge>`;
  defs.appendChild(f);
  filters.set(key, id);
  // a sheet or a card of many heights leaves filters behind; the oldest go (a surface still using one is given a
  // new one the next time it is measured)
  if (filters.size > 96) { const [k0, id0] = filters.entries().next().value; filters.delete(k0); const n0 = document.getElementById(id0); if (n0) n0.remove(); }
  return id;
}

// The specular light for a surface: its pieces as background images, and where each goes.
function specFor(O, strips, strength, light) {
  if (!(strength > 0)) return { img: 'none', pos: '0 0', size: 'auto' };
  const P = specPieces(O, strength, colour(light, { r: 255, g: 255, b: 255 }));
  const parts = strips.flatMap(s => s.parts);
  return {
    img: parts.map(p => `url("${P[p.k]}")`).join(', '),
    pos: parts.map(p => `${p.x}px ${p.y}px`).join(', '),
    size: parts.map(p => `${p.w}px ${p.h}px`).join(', '),
  };
}

// What a surface's optics are, from its own stylesheet: its corner radius, and the --glass-* numbers glass.css sets
// for its kind.
function opticsOf(el, cs = getComputedStyle(el)) {
  const num = (p, fb) => { const v = parseFloat(cs.getPropertyValue(p)); return Number.isFinite(v) ? v : fb; };
  return {
    R: Math.round(parseFloat(cs.borderTopLeftRadius) || 0),
    B: num('--glass-bezel', 16), depth: num('--glass-depth', 20), spec: num('--glass-spec', 0.8),
    light: cs.getPropertyValue('--glass-light').trim(), open: cs.getPropertyValue('--glass-open').trim(),
    edge: num('--glass-edge', 0), middle: num('--glass-frost', 0) > 0, disperse: num('--glass-disperse', 0) > 0,
  };
}

// Everything a surface of W x H needs: its filter, and its light's images and places.
function fitted(W, H, o, style) {
  const O = opticsFor(o), c = Math.min(O.c, Math.floor(W / 2), Math.floor(H / 2));
  const strips = layout(W, H, c, new Set(o.open.split(' ').filter(Boolean)), o.edge);
  const lite = filterFor(W, H, O, strips, o.middle, true), id = o.disperse ? filterFor(W, H, O, strips, o.middle) : lite;
  const sp = specFor(O, strips, o.spec, o.light);
  const set = (k, v) => { if (style.getPropertyValue(k) !== v) style.setProperty(k, v); };
  return { id, lite, sp, set };
}

// ---------- surfaces ----------
// Chromium (a phone's Chrome, the Android WebView, which says Chrome too), and not Chrome on iOS, which is Safari.
export function lensable(ua = navigator.userAgent) {
  const m = /\b(?:Chrome|Chromium|HeadlessChrome)\/(\d+)/.exec(ua);
  if (!m || Number(m[1]) < 76 || /\b(?:CriOS|FxiOS|EdgiOS)\//.test(ua)) return false;
  try { return CSS.supports('backdrop-filter', 'url(#glass-f1)'); } catch (_) { return false; }
}

const SURFACES = '.glass';
let ro = null;
// Give a surface its optics for its size (its layout size: a transform does not change what the pane is).
function fit(el, W = el.offsetWidth, H = el.offsetHeight) {
  W = Math.round(W); H = Math.round(H);
  if (!W || !H) return;
  const o = opticsOf(el);
  // a surface as wide as the screen (a sheet on a phone) has the screen's edges for its sides, not a bezel
  if (W >= window.innerWidth - 1) o.open = `${o.open} left right`;
  const { id, lite, sp, set } = fitted(W, H, o, el.style);
  set('--glass-lens', `url(#${id})`); set('--glass-lens-lite', `url(#${lite})`);
  set('--glass-spec-img', sp.img); set('--glass-spec-pos', sp.pos); set('--glass-spec-size', sp.size);
  if (!el.classList.contains('lensed')) el.classList.add('lensed');
}
// A sheet shows its dispersion once it has risen (glass.css keeps it to one displacement while it moves).
function settle(el) {
  if (!el.matches('.glass-sheet')) return;
  const moving = el.getAnimations().filter(a => a.playState === 'running');
  if (!moving.length) { el.classList.add('settled'); return; }
  Promise.all(moving.map(a => a.finished.catch(() => {}))).then(() => el.classList.add('settled'));
}
function adopt(el) {
  if (el.__glass) return;
  el.__glass = true;
  settle(el);
  // a copy a transition flies carries its surface's optics already; it is measured when the observer next reports
  if (!(el.classList.contains('lensed') && el.style.getPropertyValue('--glass-lens'))) fit(el);
  ro.observe(el);
}
// The header's scrim is a pseudo element: its pane is the width of the screen, so it is fitted from the viewport,
// and what it needs is set on the root for every header row to inherit.
let hdrKey = '';
function fitHeader() {
  const probe = document.querySelector('#screen .bar');
  if (!probe) return;
  const cs = getComputedStyle(probe, '::before');
  const W = Math.round(window.innerWidth), H = Math.round(parseFloat(cs.height) || 124);
  const o = opticsOf(probe, cs);
  const key = `${W}|${H}|${JSON.stringify(o)}`;
  if (key === hdrKey) return;
  hdrKey = key;
  const root = document.documentElement;
  const { id, lite, sp, set } = fitted(W, H, o, root.style);
  set('--glass-hdr-lens', `url(#${id})`); set('--glass-hdr-lens-lite', `url(#${lite})`);
  set('--glass-hdr-spec-img', sp.img); set('--glass-hdr-spec-pos', sp.pos); set('--glass-hdr-spec-size', sp.size);
  if (!root.classList.contains('glass-hdr')) root.classList.add('glass-hdr');
}

export function install() {
  if (!lensable() || defs) return;
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'glass-defs';
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  // not display: none, which would switch its filters off with it
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  document.documentElement.classList.add('glass-lens');
  ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const b = e.borderBoxSize && e.borderBoxSize[0];
      if (e.target.isConnected) fit(e.target, b ? b.inlineSize : undefined, b ? b.blockSize : undefined);
    }
  });
  const scan = root => {
    if (root.nodeType !== 1) return;
    if (root.matches(SURFACES)) adopt(root);
    root.querySelectorAll(SURFACES).forEach(adopt);
    // the header's pane is the screen's width: fitted once a header is first in the page, then on a resize
    if (!hdrKey && (root.matches('.bar') || root.querySelector('.bar'))) fitHeader();
  };
  // a surface that leaves the page (a redraw, a transition's copy removed) is let go, so none are held on to
  const drop = root => {
    if (root.nodeType !== 1 || root.isConnected) return;
    if (root.__glass) { ro.unobserve(root); root.__glass = false; }
    root.querySelectorAll('.lensed').forEach(n => { if (n.__glass) { ro.unobserve(n); n.__glass = false; } });
  };
  new MutationObserver(list => { for (const m of list) { for (const n of m.removedNodes) drop(n); for (const n of m.addedNodes) scan(n); } })
    .observe(document.body, { childList: true, subtree: true });
  scan(document.body);
  warm();
  window.addEventListener('resize', () => { hdrKey = ''; fitHeader(); });
  // the night look warms the light on the glass: every surface is fitted again with the night's white, now and once
  // the night's colours have drifted all the way (night.css, 30 s)
  let night = document.documentElement.classList.contains('night');
  new MutationObserver(() => {
    const now = document.documentElement.classList.contains('night');
    if (now === night) return;
    night = now;
    const refit = () => { hdrKey = ''; fitHeader(); document.querySelectorAll('.lensed').forEach(el => fit(el)); };
    requestAnimationFrame(refit); setTimeout(refit, 31000);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

// The pieces for each kind of surface, drawn while the phone is idle after the app opens, so the first sheet or the
// first room does not wait for its glass (drawing a kind's pieces is a few tens of ms on a mid-range phone). Each is
// measured off a stand-in with the kind's classes, and none of them is glass, so nothing adopts them.
const KINDS = [
  '<nav class="tabbar glass-bar"></nav>',
  '<div class="room-photo-card"><div class="onoff room-onoff glass-control"></div></div>',
  '<div class="sheet glass-sheet"></div>',
  '<section class="card house glass-panel"></section>',
];
function warm() {
  const idle = window.requestIdleCallback || (f => setTimeout(f, 200));
  const next = i => idle(() => {
    if (i >= KINDS.length) return;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;visibility:hidden;pointer-events:none';
    box.innerHTML = KINDS[i];
    document.body.appendChild(box);
    const el = box.querySelector('.glass-bar, .glass-control, .glass-sheet, .glass-panel');
    const o = opticsOf(el), O = opticsFor(o);
    dispPieces(O);
    if (o.spec > 0) specPieces(O, o.spec, colour(o.light, { r: 255, g: 255, b: 255 }));
    box.remove();
    next(i + 1);
  });
  next(0);
}

// kept for app.js: the light does not move on its own (it is where the surface's normals put it)
export function wire() {}
