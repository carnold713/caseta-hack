// Glass (glass.css): the lens and the moving light.
//
// The lens is an SVG filter in a backdrop (glass.css draws it in a layer of its own). It bends what is behind the
// glass near the surface's edges and leaves the middle as it is, as a thick pane with rounded edges does. Only
// Chromium draws an SVG filter in a backdrop (a phone's Chrome and the Android WebView, which is where this app runs),
// so the lens is switched on by a class on <html> only there, and everywhere else the glass is its blur and saturation
// alone.
//
// The map that says where to push is drawn once, here, on a canvas: 0.5 (no push) over the middle, and toward the
// middle within a band along each edge, most at the edge itself and easing to nothing across the band. It is
// stretched to the surface's box. A filter could work the same map out from the box on every frame (flood, erode,
// blur, the slope), but on a mid-range phone that cost more than half the frames of a page's transition; a drawn map
// costs nothing but the push itself.
//
// The light: the tab bar's sheen comes up a little as the page moves under it, as far as it is moving, and settles
// back when it stops (--glass-lift; glass.css eases its opacity, which the compositor runs). One passive scroll
// listener, at most one write a frame and only when the step changes, onto the tab bar alone, never onto anything that
// would restyle the page. Reduced motion keeps it still.

const LENSES = {
  // the size the map is drawn for (the surface's own, as near as it is known), the band along its edges, and how far
  // at most the edge pulls from (px)
  bar: { w: 328, h: 72, band: 16, px: 14 },       // the tab bar
  control: { w: 348, h: 64, band: 14, px: 10 },   // a room's On and Off
};
// Most of a push is 0.35 of the map's range either side of 0.5, so the filter's scale is px / 0.35.
const REACH = 0.35;

function map({ w, h, band }) {
  const S = 2, W = w * S, H = h * S, B = band * S;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data;
  // toward the middle from the near edge, away from the far one, easing out across the band
  const push = (p, n) => { const a = Math.max(0, 1 - p / B), z = Math.max(0, 1 - (n - 1 - p) / B); return 0.5 + REACH * (a * a - z * z); };
  const xs = Array.from({ length: W }, (_, x) => Math.round(255 * push(x, W)));
  const ys = Array.from({ length: H }, (_, y) => Math.round(255 * push(y, H)));
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { d[i] = xs[x]; d[i + 1] = ys[y]; d[i + 2] = 128; d[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}

const lens = (id, spec, href) => `<filter id="glass-lens-${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feImage href="${href}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>
  <feDisplacementMap in="SourceGraphic" in2="map" scale="${Math.round(spec.px / REACH)}" xChannelSelector="R" yChannelSelector="G"/>
</filter>`;

// Chromium (a phone's Chrome, the Android WebView, which says Chrome too), and not Chrome on iOS, which is Safari.
export function lensable(ua = navigator.userAgent) {
  const m = /\b(?:Chrome|Chromium|HeadlessChrome)\/(\d+)/.exec(ua);
  if (!m || Number(m[1]) < 76 || /\b(?:CriOS|FxiOS|EdgiOS)\//.test(ua)) return false;
  try { return CSS.supports('backdrop-filter', 'url(#glass-lens-bar)'); } catch (_) { return false; }
}

export async function install() {
  if (!lensable() || document.getElementById('glass-defs')) return;
  const maps = Object.fromEntries(Object.entries(LENSES).map(([k, v]) => [k, map(v)]));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.id = 'glass-defs';
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  // not display: none, which would switch its filters off with it
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  svg.innerHTML = `<defs>${Object.entries(LENSES).map(([k, v]) => lens(k, v, maps[k])).join('')}</defs>`;
  document.body.appendChild(svg);
  // The lens comes on once its maps are decoded: a filter drawn before then would push by half its scale everywhere.
  try { await Promise.all(Object.values(maps).map(u => { const i = new Image(); i.src = u; return i.decode(); })); } catch (_) { return; }
  document.documentElement.classList.add('glass-lens');
}

// ---------- the light moves ----------
const still = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function wire() {
  let lastY = window.scrollY, queued = false, rest = 0, was = '0';
  const write = v => { if (v === was) return; was = v; const t = document.getElementById('tabs'); if (t) t.style.setProperty('--glass-lift', v); };
  window.addEventListener('scroll', () => {
    if (queued || still()) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const y = window.scrollY, dy = y - lastY; lastY = y;
      // a finger's worth of movement a frame is the whole lift, in quarters so a steady scroll writes nothing new
      write(String(Math.round(Math.min(1, Math.abs(dy) / 24) * 4) / 4));
      clearTimeout(rest);
      rest = setTimeout(() => write('0'), 140);
    });
  }, { passive: true });
}
