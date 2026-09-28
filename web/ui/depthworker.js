// The light, drawn with three.js off the page's own thread (depth.js is the page's side of it). One WebGL context for
// the whole app, on an OffscreenCanvas in this worker: the page sends what each of its lights looks like this frame
// (sampled from the elements the stylesheet and motion.js are animating), and each picture is put straight into that
// light's own canvas, which the page handed over to this worker (transferControlToOffscreen). Everything costly (the
// context, compiling the two shaders, drawing, laying the pictures in) happens here, so a phone's main thread never
// waits on the GPU and a slow first compile is never a stall in a transition.
//
// Two pictures:
//   light  the page's one light (glow.js lightHTML, 'top' or 'lamp'): an area light over the page, its falloff the
//          inverse square of a real one, added to the page's dark in linear light and only then encoded, so a light
//          dimming draws its reach in toward its core the way a real one does, rather than fading as a flat stencil.
//          At full strength it lies on the stylesheet's own light to within a step of 8-bit colour.
//   room   a room's illustration (roomscene.js) as a shallow box: the wall, and the floor running back from it. Each
//          lamp is a light standing in that box at its own height and depth, and what it throws on the wall and the
//          floor is worked out as light falls (distance squared, the angle it lands at, the way the fixture aims it).
import { WebGLRenderer, Scene, OrthographicCamera, Mesh, BufferGeometry, BufferAttribute, RawShaderMaterial, GLSL3, NoBlending, Vector2 } from '/vendor/three.module.js';

const MAX_E = 16;   // lights in a room: eight fixtures (roomscene.js MAX_FIXTURES), two points each at most

const VERT = `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Shared by both: sRGB's own curves, the page's dark, and a dither of a little under one step of 8-bit colour so a
// soft light never shows its steps on a dark screen.
const COMMON = `
precision highp float;
uniform vec2 uSize;      // the picture, in its own pixels
uniform float uScale;    // its pixels per CSS pixel
uniform float uSeed;
out vec4 outColor;
float lin(float v) { return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4); }
vec3 enc(vec3 v) { return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), v)); }
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float dither(vec2 p) { return (hash(p + uSeed) + hash(p * 1.37 + 7.1 + uSeed) - 1.0) / 255.0; }
// where this pixel is, in CSS pixels from the picture's top left
vec2 cssAt() { return vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uScale; }
`;

const LIGHT = `${COMMON}
uniform vec2 uCentre;    // the light's centre, CSS px
uniform float uR;        // the stylesheet's radius for it, CSS px
uniform float uH;        // how high over the page it hangs, as a share of that radius
uniform float uK;        // its strength at full, in linear light (the stylesheet's peak, worked back through sRGB)
uniform float uS;        // the element's own opacity: its strength now, which the compositor also applies
uniform float uGain;     // the colour layer's opacity (half, offline)
uniform vec3 uCol;       // its colour, linear
const float BG = 0.0060; // #121212, linear
const float BGS = 0.0706;
void main() {
  float t = length(cssAt() - uCentre) / uR;
  // a downward lobe (cos^3) over the page at height uH: irradiance h^4 / (h^2 + r^2)^3, normalised to 1 under it,
  // windowed to nothing at the stylesheet's radius so it ends where the drawn one does
  float w = clamp(1.0 - t * t, 0.0, 1.0);
  float q = 1.0 + (t / uH) * (t / uH);
  float E = w * w / (q * q * q);
  vec3 L = uCol * (uK * uS * uGain * E);
  // added to the dark the page already is, then encoded: what it adds on screen
  vec3 v = max(max(enc(vec3(BG) + L) - BGS, 0.0) + dither(gl_FragCoord.xy) * step(1e-5, E), 0.0);
  // premultiplied, with alpha enough that the page's dark under it stays as it was (bg (1 - a) + v + bg a); divided by
  // the strength the compositor will multiply it by again, so the light is drawn once, at the strength worked out here
  float a = min(1.0, max(v.r, max(v.g, v.b)) / (1.0 - BGS));
  vec3 c = v + BGS * a;
  float inv = 1.0 / max(uS, 0.02);
  outColor = vec4(min(c * inv, 1.0), min(a * inv, 1.0));
}`;

const ROOM = `${COMMON}
uniform float uUnit;     // the picture's pixels per scene unit
uniform vec2 uOrigin;    // the scene point at the picture's top left (the picture is laid in the drawing's own units)
uniform float uFloor;    // the line where the wall meets the floor, scene units
uniform float uDepth;    // scene units of depth per unit of floor on screen
uniform int uCount;
// how much light a lamp at full puts on a surface, the shoulder near it, and how much of its light the air sends back;
// set so a room drawn this way carries about the light its drawn pools and halos did (within a tenth, on average)
// how much light a lamp at full puts on a surface, the shoulder close to it, and how much of its light the air sends
// back: set so a room drawn this way carries about the light its drawn pools and halos did (within a tenth, on average)
uniform float uGain;
uniform float uKnee;
uniform float uScatter;
uniform vec4 uPos[${MAX_E}];   // x, y, depth (scene units), pattern
uniform vec4 uCol[${MAX_E}];   // colour (linear), strength now
uniform float uAt[${MAX_E}];   // how high the lamp is drawn (a lamp standing forward on the floor is drawn lower than its height)
const float BG = 0.0120;       // the scene's wall and floor, about #1D1A18, linear
const float BGS = 0.1150;
void main() {
  vec2 s = uOrigin + vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uUnit;   // scene units
  float x = s.x;
  // the wall is the plane z = 0 facing the viewer; the floor runs from its foot toward the viewer, flattened on screen
  vec3 P, N;
  if (s.y < uFloor) { P = vec3(x, s.y, 0.0); N = vec3(0.0, 0.0, 1.0); }
  else { P = vec3(x, uFloor, (s.y - uFloor) * uDepth); N = vec3(0.0, -1.0, 0.0); }
  // how much of the light a surface sends back: the floor a little less than the wall
  float albedo = s.y < uFloor ? 1.0 : 0.8;
  vec3 sum = vec3(0.0), glow = vec3(0.0);
  for (int i = 0; i < ${MAX_E}; i++) {
    if (i >= uCount) break;
    vec4 p = uPos[i];
    int kind = int(p.w + 0.5);
    vec3 d = p.xyz - P;
    float d2 = dot(d, d) + 324.0;             // a lamp is not a point: its own size softens it close up
    float dist = sqrt(d2);
    float cosS = max(dot(N, d) / dist, 0.0);  // the angle the light lands at
    float down = -d.y / dist;                 // how far below the lamp this point is (screen y runs down)
    // a lamp fixed to the wall sends nothing into the wall behind it: its mount is in the way, so its light reaches
    // the wall above and below it, as a sconce's does
    float aim = p.z < 20.0 ? 1.0 - smoothstep(0.35, 0.9, d.z / dist) : 1.0;
    if (kind == 1) aim *= pow(max(down, 0.0), 1.5) * 2.2;                 // a shade open below: pendants, a flush light
    else if (kind == 2) aim *= pow(max(-down, 0.0), 1.5) * 2.2;           // open above: an uplight, a torchiere
    else if (kind == 3) aim *= pow(max(down, 0.0), 6.0) * 5.0;            // a downlight's beam, which scallops a wall
    else if (kind == 4) aim *= 0.35 + 0.9 * abs(down);                     // a drum shade: out of its top and bottom
    sum += uCol[i].rgb * (uCol[i].a * aim * cosS / d2) * albedo;
    // and the light the air between the lamp and the eye scatters back: along a line of sight passing a lamp at
    // distance D this grows as 1 / D, which is the soft glow round a lamp at night, stronger where its shade lets
    // the light out
    vec2 o = vec2(x, s.y) - vec2(p.x, uAt[i]);
    float D = length(o);
    vec2 dir = o / max(D, 1e-3);
    float out2 = kind == 1 || kind == 3 ? 0.25 + 0.75 * max(dir.y, 0.0) : kind == 2 ? 0.25 + 0.75 * max(-dir.y, 0.0) : 1.0;
    float fade = 1.0 - smoothstep(30.0, 120.0, D);
    glow += uCol[i].rgb * (uCol[i].a * out2 * fade / (D + 10.0));
  }
  vec3 L = sum * uGain + glow * uScatter;
  // the eye's (and a camera's) shoulder: close to a lamp the light rolls off rather than clipping to a flat white
  L = L / (1.0 + L / uKnee);
  vec3 v = max(max(enc(vec3(BG) + L) - BGS, 0.0) + dither(gl_FragCoord.xy) * step(1e-5, L.r + L.g + L.b), 0.0);
  // laid over the scene with screen (roomscene.css), so the picture is the light alone, on black
  outColor = vec4(clamp(v, 0.0, 1.0), 1.0);
}`;

// the page's canvases, handed over to be drawn in (depth.js): each picture goes straight into its own
const targets = new Map();
let R = null, canvas = null, scene = null, cam = null, mesh = null, mats = null, lost = false, loseExt = null;

function setup(force) {
  canvas = new OffscreenCanvas(4, 4);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; postMessage({ type: 'lost' }); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; postMessage({ type: 'restored' }); });
  // asked for first, quietly: a phone without WebGL is an ordinary answer, not an error for three.js to report
  const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !force };
  const context = canvas.getContext('webgl2', attrs);
  if (!context) return { ok: false, why: 'no webgl' };
  R = new WebGLRenderer({ canvas, context, ...attrs });
  R.setPixelRatio(1);
  R.autoClear = false;
  const gl = R.getContext();
  // A GPU the browser only emulates in software (SwiftShader, llvmpipe) would spend the phone's battery drawing a
  // gradient the stylesheet draws for free: the page keeps its own light there, unless told otherwise.
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  if (!force && /swiftshader|llvmpipe|software|softpipe/i.test(name)) return { ok: false, why: 'software', name };
  loseExt = gl.getExtension('WEBGL_lose_context');
  const geo = new BufferGeometry();
  // one triangle that covers the picture
  geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const common = () => ({ uSize: { value: new Vector2(1, 1) }, uScale: { value: 1 }, uSeed: { value: 0 } });
  const mk = (frag, uniforms) => new RawShaderMaterial({ glslVersion: GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms: { ...common(), ...uniforms }, blending: NoBlending, depthTest: false, depthWrite: false, transparent: false });
  mats = {
    light: mk(LIGHT, { uCentre: { value: new Vector2() }, uR: { value: 1 }, uH: { value: 1 }, uK: { value: 0 }, uS: { value: 1 }, uGain: { value: 1 }, uCol: { value: [1, 1, 1] } }),
    room: mk(ROOM, {
      uUnit: { value: 1 }, uOrigin: { value: new Vector2() }, uFloor: { value: 204 }, uDepth: { value: 5.5 }, uCount: { value: 0 }, uGain: { value: 270 }, uKnee: { value: 0.8 }, uScatter: { value: 3.2 },
      uPos: { value: new Float32Array(MAX_E * 4) }, uCol: { value: new Float32Array(MAX_E * 4) }, uAt: { value: new Float32Array(MAX_E) },
    }),
  };
  mesh = new Mesh(geo, mats.light);
  mesh.frustumCulled = false;
  scene = new Scene();
  scene.add(mesh);
  cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // both compiled now, while nothing waits on them
  for (const m of Object.values(mats)) { mesh.material = m; R.compile(scene, cam); }
  return { ok: true, name };
}

function draw(job) {
  const m = mats[job.kind === 'room' ? 'room' : 'light'];
  const u = m.uniforms, j = job.u;
  R.setSize(job.pw, job.ph, false);
  u.uSize.value.set(job.pw, job.ph); u.uScale.value = job.scale; u.uSeed.value = (job.seed || 0) % 64;
  if (job.kind === 'room') {
    u.uUnit.value = j.unit; u.uOrigin.value.set(j.ox, j.oy); u.uFloor.value = j.floor; u.uDepth.value = j.depth;
    u.uCount.value = Math.min(MAX_E, j.pos.length / 4);
    u.uPos.value.fill(0); u.uPos.value.set(j.pos.slice(0, MAX_E * 4));
    u.uCol.value.fill(0); u.uCol.value.set(j.col.slice(0, MAX_E * 4));
    u.uAt.value.fill(0); u.uAt.value.set(j.at.slice(0, MAX_E));
  } else {
    u.uCentre.value.set(j.cx, j.cy); u.uR.value = j.r; u.uH.value = j.h; u.uK.value = j.k; u.uS.value = j.s; u.uGain.value = j.gain; u.uCol.value = j.col;
  }
  mesh.material = m;
  R.render(scene, cam);
  return canvas.transferToImageBitmap();
}

onmessage = e => {
  const m = e.data || {};
  if (m.type === 'init') {
    let r;
    try { r = setup(!!m.force); } catch (err) { r = { ok: false, why: String(err && err.message || err) }; }
    if (!r.ok) { try { if (R) { R.dispose(); R.forceContextLoss(); } } catch (_) { /* gone */ } R = null; }
    postMessage({ type: r.ok ? 'ready' : 'fail', ...r });
    return;
  }
  if (m.type === 'frame') {
    const out = [], t0 = performance.now();
    if (R && !lost) {
      for (const job of m.jobs) {
        const t = targets.get(job.id);
        if (!t) continue;
        try {
          const bmp = draw(job);
          if (t.canvas.width !== bmp.width) t.canvas.width = bmp.width;
          if (t.canvas.height !== bmp.height) t.canvas.height = bmp.height;
          t.ctx.transferFromImageBitmap(bmp);
          out.push({ id: job.id, sig: job.sig });
        } catch (_) { /* this light keeps its last picture */ }
      }
    }
    // how long the pictures took here (with a real GPU, the time to hand them to it; in software, the drawing itself)
    postMessage({ type: 'frame', n: m.n, out, ms: performance.now() - t0 });
    return;
  }
  if (m.type === 'site') { targets.set(m.id, { canvas: m.canvas, ctx: m.canvas.getContext('bitmaprenderer') }); return; }
  if (m.type === 'drop') { targets.delete(m.id); return; }
  // WEBGL_lose_context, for the tests: the page is told as it would be by a real loss, and gets it back on restore
  if (m.type === 'lose' && loseExt) { loseExt.loseContext(); return; }
  if (m.type === 'restore' && loseExt) { loseExt.restoreContext(); return; }
  if (m.type === 'dispose') {
    try { if (R) { for (const k in mats) mats[k].dispose(); mesh.geometry.dispose(); R.dispose(); R.forceContextLoss(); } } catch (_) { /* gone */ }
    R = null;
    postMessage({ type: 'disposed' });
    close();
  }
};
