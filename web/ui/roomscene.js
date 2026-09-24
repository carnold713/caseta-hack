// A room's illustration: the picture a room shows until its owner adds a photograph. A flat, geometric night-time
// interior (half-discs, quarter-discs, arches and rounded blocks on thin legs, soft gradients, fine grain) in which
// every lamp is one of the room's real lights, lit or dark as that light is.
//
//   roomModel(c, aid)            -> the room as the picture needs it: its kind (from its name) and its lights, fans
//                                   and shades with their state
//   sceneSVG(model, { view })    -> the markup: one <svg>. `view` is 'page' (the default: the room page's 300 tall
//                                   hero, and the Rooms card, which shows the middle 180 of it at the same scale) or
//                                   'thumb' (Home's 200 x 132 card, the whole scene scaled down)
//   roomScene(c, aid, view)      -> the svg in its frame, with the grain laid over it
//
// Every scene is drawn in a 372 x 300 frame whose middle band (y 60 to 240) is what the Rooms card shows, so what
// matters sits there. The wall, the floor and the edges run on well past both sides (the viewBox is 592 wide), and
// the frame is sliced to its height, so a phone a little narrower or wider than 372 sees the same room at the same
// scale with more or less wall at the sides. That is also what lets a room open from its card without rescaling.
//
// Light: each lamp's glow is drawn with the house's own light maths (glow.js whiteStops and colourStops, the level
// curve of glowSpec), so a lamp here is the colour it is everywhere else in the app. Everything a light changes is an
// opacity, a transform or a `color` on an element whose place in the markup never depends on the light's state, so
// when the app redraws, motion.js pairs the old element with the new one and plays the change on the dimmer.
// Gradient stops take their colour as `currentColor` from their own `color` for the same reason.
import { whiteStops, colourStops } from '/ui/glow.js';
import { roomArt } from '/ui/art.js';

export const W = 372, H = 300, F = 204;          // the frame, and where the wall meets the floor
const VB = '-110 0 592 300';                      // wall enough for a phone up to 592 wide at scale 1
const THUMB_VB = '4 24 364 240';                  // Home's 200 x 132 card: the room, a little cropped, scaled down

// ---------- palette ----------
// Every surface is a two-stop gradient, lighter where the room's light would reach it first. Low in saturation and
// never pale: on #121212 the brightest thing in a scene is always a lamp.
const PAL = {
  wall: ['#1D1A18', '#252120'], floor: ['#191715', '#121110'], rug: ['#2B2724', '#1D1A18'],
  slate: ['#56647A', '#232A34'], teal: ['#3F6E68', '#15302D'], ink: ['#3C4F79', '#161E31'],
  stone: ['#5F5751', '#282321'], char: ['#34302D', '#141211'], clay: ['#7A5242', '#35211A'],
  olive: ['#76834A', '#2B3317'], wood: ['#65503F', '#2C221B'], plum: ['#5A4658', '#241B25'],
  glass: ['#1F2940', '#0F141E'], shade: ['#4D4640', '#2E2926'],
};
const LINE = '#5B5550';                            // legs, cords and frames: a soft grey, never black
const COMBOS = [
  { A: 'ink', B: 'slate', C: 'char', D: 'teal' }, { A: 'teal', B: 'stone', C: 'char', D: 'ink' },
  { A: 'slate', B: 'teal', C: 'wood', D: 'ink' }, { A: 'stone', B: 'ink', C: 'char', D: 'teal' },
  { A: 'plum', B: 'slate', C: 'wood', D: 'teal' },
];
// gradient directions in the shape's own box: [x1, y1, x2, y2], first stop the lighter
const DIRS = { d: [0, 0, 1, 1], r: [1, 1, 0, 0], v: [0, 0, 0, 1], u: [0, 1, 0, 0], h: [0, 0, 1, 0], l: [1, 0, 0, 0], e: [1, 0, 0, 1] };

// ---------- the room's kind ----------
// art.js already reads a room's kind from its name for the icon; the scene follows the same words.
const KIND_OF_ART = {
  'room-living-room': 'living', 'room-kitchen': 'kitchen', 'room-bedroom': 'bedroom', 'room-office': 'office',
  'room-dining-room': 'dining', 'room-entry': 'hall', 'room-porch': 'porch', 'room-garden': 'porch',
  'room-bathroom': 'bath', 'room-garage': 'garage',
};
export const sceneKind = name => KIND_OF_ART[roomArt(name)] || 'room';

// ---------- the room, from the app ----------
// A Caseta dimmer has no colour of its own and is drawn copper (2200K, the ramp's copper stop); a white lamp that has
// not said its colour yet is its bulb's usual 2700K. The same rule as the house's light on Home (home.js kelvinOf).
const kelvinOf = (d, col) => (col && col.mode === 'ct' && col.kelvin ? col.kelvin : d.ct || d.color ? 2700 : 2200);
export function roomModel(c, aid) {
  const a = c.data.areas().find(x => x.id === aid) || { id: aid, name: '' };
  const byId = (x, y) => String(x.device_id).localeCompare(String(y.device_id), undefined, { numeric: true });
  const lights = c.H.roomLights(aid).slice().sort(byId).map(d => {
    const col = (c.S.states[d.device_id] || {}).color;
    const lv = c.data.level(d.device_id) || 0;
    return {
      id: d.device_id, name: d.name || '', kind: c.H.lightKind(d.device_id), level: d.domain === 'switch' ? (lv > 0 ? 100 : 0) : lv,
      kelvin: kelvinOf(d, col), hex: d.color && col && col.mode === 'xy' && col.hex ? col.hex : null,
    };
  });
  const devs = c.data.controllable().filter(d => c.data.devArea(d) === aid).sort(byId);
  const fans = devs.filter(d => d.domain === 'fan').map(d => ({ id: d.device_id, on: c.data.isOn(d.device_id), speed: (c.S.states[d.device_id] || {}).fan_speed || 'Off' }));
  const shades = devs.filter(d => d.domain === 'cover').map(d => ({ id: d.device_id, level: c.data.level(d.device_id) || 0 }));
  return { id: String(aid), name: a.name, kind: sceneKind(a.name), lights, fans, shades };
}

// ---------- small geometry ----------
const n = v => Math.round(v * 10) / 10;
// a rounded rectangle; r is one radius or [top left, top right, bottom right, bottom left]
function rr(x, y, w, h, r = 0) {
  const [a, b, c, d] = (Array.isArray(r) ? r : [r, r, r, r]).map(v => Math.min(v, w / 2, h));
  const arc = (q, X, Y) => (q ? `A${q} ${q} 0 0 1 ${n(X)} ${n(Y)}` : '');
  return { d: `M${n(x + a)} ${n(y)}H${n(x + w - b)}${arc(b, x + w, y + b)}V${n(y + h - c)}${arc(c, x + w - c, y + h)}H${n(x + d)}${arc(d, x, y + h - d)}V${n(y + a)}${arc(a, x + a, y)}Z`, bb: [x, y, w, h] };
}
// half a disc whose flat side is the line through (cx, cy): 'up' is a dome, 'down' a bowl
function half(cx, cy, r, dir = 'up') {
  if (dir === 'up') return { d: `M${n(cx - r)} ${n(cy)}A${r} ${r} 0 0 1 ${n(cx + r)} ${n(cy)}Z`, bb: [cx - r, cy - r, 2 * r, r] };
  if (dir === 'down') return { d: `M${n(cx - r)} ${n(cy)}A${r} ${r} 0 0 0 ${n(cx + r)} ${n(cy)}Z`, bb: [cx - r, cy, 2 * r, r] };
  if (dir === 'left') return { d: `M${n(cx)} ${n(cy - r)}A${r} ${r} 0 0 0 ${n(cx)} ${n(cy + r)}Z`, bb: [cx - r, cy - r, r, 2 * r] };
  return { d: `M${n(cx)} ${n(cy - r)}A${r} ${r} 0 0 1 ${n(cx)} ${n(cy + r)}Z`, bb: [cx, cy - r, r, 2 * r] };
}
// a quarter disc with its right angle at (cx, cy), filling the named quadrant
function quarter(cx, cy, r, q = 'tl') {
  const P = {
    tl: [`M${cx} ${cy}H${cx - r}A${r} ${r} 0 0 1 ${cx} ${cy - r}Z`, [cx - r, cy - r]], tr: [`M${cx} ${cy}V${cy - r}A${r} ${r} 0 0 1 ${cx + r} ${cy}Z`, [cx, cy - r]],
    br: [`M${cx} ${cy}H${cx + r}A${r} ${r} 0 0 1 ${cx} ${cy + r}Z`, [cx, cy]], bl: [`M${cx} ${cy}V${cy + r}A${r} ${r} 0 0 1 ${cx - r} ${cy}Z`, [cx - r, cy]],
  }[q];
  return { d: P[0], bb: [P[1][0], P[1][1], r, r] };
}
const arch = (x, y, w, h) => rr(x, y, w, h, [w / 2, w / 2, 0, 0]);
const poly = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { d: `M${pts.map(p => `${n(p[0])} ${n(p[1])}`).join('L')}Z`, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] }; };
const ell = (cx, cy, rx, ry) => ({ d: `M${n(cx - rx)} ${n(cy)}a${rx} ${ry} 0 1 0 ${n(2 * rx)} 0a${rx} ${ry} 0 1 0 ${n(-2 * rx)} 0Z`, bb: [cx - rx, cy - ry, 2 * rx, 2 * ry] });

// a number from the room's id, so a room keeps its own variations and rooms of one kind are not all alike
function seedOf(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; }
function rngOf(s) { let x = seedOf(s) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

// ---------- a lamp's light ----------
// The house's level curve (glowSpec): strength 0.35 + 0.65 x level, and nothing at all when off.
const strength = (on, L) => (on ? 0.35 + 0.65 * L : 0);
function lightOf(lamps) {
  const lit = lamps.filter(l => l.level > 0);
  const top = (lit.length ? lit : lamps).slice().sort((a, b) => b.level - a.level)[0] || { level: 0, kelvin: 2200 };
  const st = top.hex ? colourStops(top.hex) : whiteStops(top.kelvin || 2200);
  const L = Math.max(0, ...lamps.map(l => l.level)) / 100;
  return { on: lit.length > 0, L, I: strength(lit.length > 0, L), core: st.core, body: st.body, wash: st.wash };
}

// ---------- what each kind of light becomes ----------
// A kind (kinds.js) is place and fixture; the picture needs only which drawing and where it may go.
const BY_KIND = {
  'ceiling-flush': 'flush', 'ceiling-downlights': 'down', 'ceiling-pendant': 'pendant', 'ceiling-chandelier': 'chand',
  'ceiling-track': 'down', 'ceiling-fan': 'fan', 'ceiling-spots': 'down', 'ceiling-tape': 'cove',
  'wall-sconce': 'sconce', 'wall-picture': 'sconce', 'wall-uplight': 'sconce', 'wall-track': 'down', 'wall-tape': 'cove',
  'wall-mirror': 'sconce', 'wall-panels': 'sconce', 'window-track': 'shelf', 'window-tape': 'shelf', 'window-pendant': 'pendant',
  'window-spots': 'down', 'window-string': 'string', 'floor-lamp': 'floor', 'floor-reading': 'floor', 'floor-uplight': 'torch',
  'floor-torchiere': 'torch', 'bed-lamp': 'table', 'bed-headboard': 'bed', 'bed-reading': 'bed', 'bed-tape': 'underbed',
  'outside-porch': 'lantern', 'outside-path': 'bollard', 'outside-flood': 'lantern', 'outside-string': 'string',
  'outside-landscape': 'bollard', 'outside-step': 'bollard',
};
const BY_PLACE = { desk: 'desk', table: 'table', cabinet: 'cabinet', shelf: 'shelf' };
function drawingOfKind(k) {
  if (!k) return null;
  return BY_KIND[k] || BY_PLACE[String(k).split('-')[0]] || null;
}
// a light nobody has given a kind: its name usually says
const BY_NAME = [
  [/fan/, 'fan'], [/chandelier/, 'chand'], [/pendant|island/, 'pendant'], [/sconce|vanity|mirror|picture/, 'sconce'],
  [/\bcans?\b|recess|downlight|pot ?light|spot|track/, 'down'], [/floor|torch|\barc\b/, 'floor'], [/desk|task/, 'desk'],
  [/under ?cab|cabinet|counter/, 'cabinet'], [/shelf|cove|strip|tape|\bled\b/, 'shelf'], [/headboard|reading/, 'bed'],
  [/porch|lantern|outdoor|exterior|flood/, 'lantern'], [/path|landscape|garden|step/, 'bollard'], [/string|bistro|fairy/, 'string'],
  [/table|bedside|nightstand|lamp/, 'table'], [/ceiling|overhead|flush|main/, 'flush'],
];
const drawingOfName = name => { const s = String(name || '').toLowerCase(); for (const [re, k] of BY_NAME) if (re.test(s)) return k; return null; };

// Where each drawing may go, in order of preference. A scene offers slots of these sorts; a light that finds none of
// its own sort takes the next, and is drawn as what that place holds (a table lamp with no table is a floor lamp).
const CEIL = ['pendant', 'flush', 'chand', 'down', 'fan'];
const PREFER = {
  pendant: ['ceil'], flush: ['ceil'], chand: ['ceil'], down: ['ceil'], fan: ['ceil'],
  sconce: ['wall', 'ceil'], table: ['table', 'floor', 'wall', 'ceil'], floor: ['floor', 'table', 'wall', 'ceil'],
  torch: ['floor', 'table', 'wall', 'ceil'], desk: ['desk', 'table', 'floor', 'wall', 'ceil'],
  cabinet: ['strip:cabinet', 'strip:shelf', 'strip', 'wall', 'ceil'], shelf: ['strip:shelf', 'strip:cabinet', 'strip', 'wall', 'ceil'],
  cove: ['strip:cove', 'strip', 'ceil'], underbed: ['strip:underbed', 'strip', 'table', 'ceil'], bed: ['bed', 'table', 'wall', 'ceil'],
  lantern: ['door', 'wall', 'ceil'], bollard: ['ground', 'floor', 'table', 'wall'], string: ['string', 'ceil'],
};
function drawingAt(sort, want) {
  if (sort === 'ceil') return CEIL.includes(want) ? want : 'pendant';
  if (sort === 'floor') return want === 'torch' ? 'torch' : 'floor';
  if (sort === 'table') return want === 'desk' ? 'desk' : 'table';
  return { wall: 'sconce', desk: 'desk', bed: 'bed', door: 'lantern', ground: 'bollard', string: 'string', strip: 'strip' }[sort] || 'table';
}
export const MAX_FIXTURES = 6;

// Which light goes where. Stable for a room: lights are taken in the order of their ids and the slots in the order
// the scene lists them, so nothing moves between redraws, and only a light's kind or a new light changes the plan.
export function plan(model, scene) {
  const free = {};
  for (const [sort, list] of Object.entries(scene.slots)) free[sort] = list.map((s, i) => ({ ...s, sort, i }));
  const take = (sorts) => {
    for (const s of sorts) {
      const [sort, tag] = s.split(':');
      const list = free[sort] || [];
      const at = list.findIndex(x => !tag || x.tag === tag);
      if (at >= 0) return list.splice(at, 1)[0];
    }
    return null;
  };
  const fx = [];
  // a fan hangs in the middle of the ceiling; a fan light is its light kit
  if (model.fans.length) {
    const slot = take(['ceil']);
    if (slot) fx.push({ draw: 'fan', slot, lamps: [], fan: model.fans[0] });
  }
  const fanFx = fx[0];
  // a light with no kind and no telling name becomes the first thing in the scene's order that is not drawn yet
  const fits = w => (PREFER[w] || []).some(s => { const [sort, tag] = s.split(':'); return (free[sort] || []).some(x => !tag || x.tag === tag); });
  const defaultFor = () => {
    // the order may name a drawing twice (a bedroom's two bedside lamps): each fixture already drawn uses up one
    const drawn = {};
    for (const f of fx) drawn[f.draw] = (drawn[f.draw] || 0) + 1;
    for (const w of scene.order) { if (drawn[w]) { drawn[w]--; continue; } if (fits(w)) return w; }
    return scene.order.find(fits) || 'table';
  };
  const extra = [];
  model.lights.forEach(l => {
    const want = drawingOfKind(l.kind) || drawingOfName(l.name) || defaultFor();
    if (want === 'fan' && fanFx && !fanFx.lamps.length) { fanFx.lamps.push(l); return; }
    const lightFx = fx.filter(f => f.lamps.length).length;
    const slot = lightFx < MAX_FIXTURES ? take(PREFER[want] || ['table', 'floor', 'wall', 'ceil']) : null;
    if (!slot) { extra.push([l, want]); return; }
    fx.push({ draw: drawingAt(slot.sort, want), slot, lamps: [l] });
  });
  // more lights than places: each shares the fixture most like it, else the first one
  for (const [l, want] of extra) {
    const f = fx.find(x => x.draw === want && x.lamps.length) || fx.find(x => x.lamps.length) || fx[0];
    if (f) f.lamps.push(l); else fx.push({ draw: 'pendant', slot: { sort: 'ceil', ...scene.slots.ceil[0] }, lamps: [l] });
  }
  return fx;
}

// ---------- the drawing ----------
let made = 0;   // every svg gets its own id prefix, so two on a page (or an old one fading out) never share one

export function sceneSVG(model, opts = {}) {
  const view = opts.view || 'page';
  const p = `rs${(++made).toString(36)}`;
  const rnd = rngOf(model.id + '|' + model.kind);
  const combo = COMBOS[Math.floor(rnd() * COMBOS.length)];
  const flip = rnd() < 0.5;
  const used = new Set();
  const G = (pal, dir = 'd') => { const k = `${PAL[pal] ? pal : combo[pal]}${dir}`; used.add(k); return `url(#${p}${k})`; };
  const layers = { wall: [], back: [], pool: [], furn: [], wash: [], mood: [], cone: [], fx: [], front: [] };
  const catchers = [];
  const put = (layer, g, fill, extra = '') => { layers[layer].push(`<path d="${g.d}" fill="${fill}"${extra}/>`); return g; };
  // a surface a lamp's light can land on: kept whole (with an id) so each lamp near it can light its edge
  const solid = (g, fill, extra = '') => { const id = `${p}f${catchers.length}`; catchers.push({ id, bb: g.bb }); layers.furn.push(`<path id="${id}" d="${g.d}" fill="${fill}"${extra}/>`); return g; };
  const line = (layer, x1, y1, x2, y2, w = 1.6, col = LINE) => layers[layer].push(`<path d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`);
  const path = (layer, d, w = 1.6, col = LINE) => layers[layer].push(`<path d="${d}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`);
  const legs = (xs, y1, y2, layer = 'furn') => xs.forEach(([x1, x2]) => line(layer, x1, y1, x2 == null ? x1 : x2, y2));
  const hidden = new Set();
  const K = { standalone: !!opts.standalone, rr, half, quarter, arch, poly, ell, G, put, solid, line, path, legs, rnd, combo, hidden, layers, F };

  const scene = SCENES[model.kind] || SCENES.room;
  const S = scene(K);
  const fixtures = plan(model, S);
  for (const f of fixtures) if (f.slot.hide) hidden.add(f.slot.hide);
  S.decor && S.decor(K);   // what sits on a surface no lamp took (a plant, a vase, a stack of books)

  // the room's mood: dim and cool with everything off, warm as it lights
  const all = model.lights;
  const litAll = all.filter(l => l.level > 0);
  const mood = lightOf(all);
  const meanL = litAll.length ? litAll.reduce((a, l) => a + l.level, 0) / litAll.length / 100 : 0;
  layers.mood.push(`<rect class="rl rs-veil" x="-110" y="0" width="592" height="300" fill="#070A10" style="opacity:${litAll.length ? 0 : 0.34}"/>`);
  layers.mood.push(`<rect class="rl" x="-110" y="0" width="592" height="300" fill="currentColor" style="color:${mood.body};opacity:${n((litAll.length ? 0.015 + 0.035 * meanL : 0) * 1000) / 1000}"/>`);

  // the window, with its shade at its real level, and the night outside
  if (S.win) windowOf(K, S.win, model.shades[0], p, litAll.length > 0);

  const dist = (s, bb) => { const dx = Math.max(bb[0] - s.x, 0, s.x - bb[0] - bb[2]), dy = Math.max(bb[1] - s.y, 0, s.y - bb[1] - bb[3]); return Math.hypot(dx, dy); };
  // each fixture: its light (pools behind the furniture, cones and washes in front) and its body
  const defs = [], lampGrads = [];
  fixtures.forEach((f, i) => {
    const Lt = f.lamps.length ? lightOf(f.lamps) : { on: false, L: 0, I: 0, core: '#FFC78A', body: '#FFB46B', wash: '#B86C35' };
    const q = `${p}l${i}`;
    const at = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.length]));
    const src = DRAW[f.draw](K, f.slot, Lt, q, f);
    // every part of this lamp's light says which lamp it is, so a scene's wave can light it when it arrives (room.js)
    for (const k in at) for (let j = at[k]; j < layers[k].length; j++) layers[k][j] = layers[k][j].replace(/class="rl"/g, `class="rl" data-l="${i}"`);
    const ids = f.lamps.map(l => l.id).join(' ');
    // the lamp's gradients: a radial reach for pools and edges, the lit shade, a cone, and a soft ellipse
    const st = (o, col, a) => (opts.standalone ? `<stop offset="${o}" stop-color="${col}" stop-opacity="${a}"/>` : `<stop offset="${o}" stop-opacity="${a}" style="color:${col}"/>`);
    const grads = [];
    if (src) {
      grads.push([`${q}g`, `<radialGradient id="${q}g" gradientUnits="userSpaceOnUse" cx="${n(src.x)}" cy="${n(src.y)}" r="${src.r}">${st(0, Lt.core, 0.8)}${st(0.2, Lt.body, 0.45)}${st(0.55, Lt.wash, 0.12)}${st(1, Lt.wash, 0)}</radialGradient>`]);
      // the furniture near the lamp catches its light: a faint wash over it and a brighter edge
      const near = catchers.filter(cc => dist(src, cc.bb) < src.r * 0.85).slice(0, 7);
      if (near.length) layers.wash.push(`<g class="rl" data-lamp="${ids}" fill="url(#${q}g)" fill-opacity=".1" stroke="url(#${q}g)" stroke-width="1.6" style="opacity:${n(Lt.I * 1000) / 1000}">${near.map(cc => `<use href="#${cc.id}"/>`).join('')}</g>`.replace('class="rl"', `class="rl" data-l="${i}"`));
    }
    grads.push([`${q}s`, `<linearGradient id="${q}s" x2="0" y2="1">${st(0, Lt.body, 1)}${st(1, Lt.core, 1)}</linearGradient>`]);
    grads.push([`${q}k`, `<linearGradient id="${q}k" x2="0" y2="1">${st(0, Lt.core, 0.5)}${st(0.45, Lt.body, 0.18)}${st(1, Lt.body, 0)}</linearGradient>`]);
    grads.push([`${q}f`, `<radialGradient id="${q}f">${st(0, Lt.body, 0.5)}${st(0.5, Lt.wash, 0.18)}${st(1, Lt.wash, 0)}</radialGradient>`]);
    lampGrads.push(...grads.map(g => [...g, i]));
    // the fixture's own group carries which lights it shows, for the tests and for the wave (room.js)
    layers.fx.push(`<g data-fx="${f.draw}" data-i="${i}" data-lamp="${ids}"${f.lamps.length ? '' : ' data-empty="1"'}>${src ? src.body.replace(/class="rl"/g, `class="rl" data-l="${i}"`) : ''}</g>`);
  });

  const pal = [...used].map(k => {
    const dir = k.slice(-1), name = k.slice(0, -1), [a, b] = PAL[name], [x1, y1, x2, y2] = DIRS[dir];
    return `<linearGradient id="${p}${k}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  });
  const body = ['back', 'pool', 'furn', 'wash', 'mood', 'cone', 'fx', 'front'].map(k => layers[k].join('')).join('');
  // only the gradients something uses
  for (const [id, g, i] of lampGrads) if (body.includes(`#${id})`)) defs.push(g.replace(/^<(\w+) /, `<$1 data-l="${i}" `));
  const vb = view === 'thumb' ? THUMB_VB : view === 'frame' ? `0 0 ${W} ${H}` : VB;
  const out = `<svg class="rs-svg" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" data-kind="${model.kind}">`
    + `<defs>${pal.join('')}${defs.join('')}</defs>${layers.wall.join('')}`
    + `<g${flip ? ` transform="matrix(-1 0 0 1 ${W} 0)"` : ''}>${body}</g></svg>`;
  // a copy to stand alone (Figma's importer): colours and strengths written out as plain attributes
  return opts.standalone ? out.replace(/(fill|stroke)="currentColor" style="color:(#[0-9A-Fa-f]{6});/g, '$1="$2" style="').replace(/ style="opacity:([\d.]+)"/g, ' opacity="$1"').replace(/ style=""/g, '') : out;
}

// the frame the page and the cards lay the svg in, with the grain over it (a CSS pseudo-element: roomscene.css)
export function roomScene(c, aid, view = 'page') {
  return `<span class="room-scene ${view}" aria-hidden="true">${sceneSVG(roomModel(c, aid), { view })}</span>`;
}

// ---------- the room's shell: wall, floor, window ----------
function shell(K, { wall = 'wall', floor = 'floor', rug = true, skirting = true } = {}) {
  const { layers, G } = K;
  layers.wall.push(`<rect x="-110" y="0" width="592" height="${F}" fill="${G(wall, 'u')}"/>`);
  layers.wall.push(`<rect x="-110" y="${F}" width="592" height="${H - F}" fill="${G(floor, 'v')}"/>`);
  // the ceiling's shadow at the top of the wall
  layers.wall.push(`<rect x="-110" y="0" width="592" height="56" fill="${G('char', 'v')}" opacity=".35"/>`);
  if (skirting) layers.wall.push(`<rect x="-110" y="${F - 1}" width="592" height="2" fill="#2C2825"/>`);
  if (rug) layers.back.push(`<path d="${ell(186, 226, 158, 19).d}" fill="${G('rug', 'v')}"/>`);
}

function windowOf(K, w, shade, p, lit) {
  const { layers, G } = K;
  const g = w.round ? arch(w.x, w.y, w.w, w.h) : rr(w.x, w.y, w.w, w.h, 4);
  const open = shade ? Math.max(0, Math.min(100, shade.level)) / 100 : 1;
  const clip = `${p}wc`;
  layers.back.push(`<clipPath id="${clip}"><path d="${g.d}"/></clipPath>`);
  layers.back.push(`<path d="${g.d}" fill="${G('glass', 'v')}"/>`);
  // the night: a low moon and two stars, faint
  const mx = w.x + w.w * 0.68, my = w.y + (w.round ? w.w * 0.62 : w.h * 0.3);
  layers.back.push(`<g clip-path="url(#${clip})"><circle cx="${n(mx)}" cy="${n(my)}" r="7" fill="#3A4560"/><circle cx="${n(mx + 3)}" cy="${n(my - 2)}" r="6" fill="#1D2638"/>`
    + `<circle cx="${n(w.x + w.w * 0.25)}" cy="${n(w.y + w.h * 0.22 + 8)}" r=".9" fill="#5D6784"/><circle cx="${n(w.x + w.w * 0.4)}" cy="${n(w.y + w.h * 0.5)}" r=".7" fill="#4C5670"/>`
    // the shade: drawn at its real level, rolled down from the top of the window
    + (shade ? `<rect class="rl rs-shade" data-shade="${shade.id}" x="${w.x - 2}" y="${w.y - 2}" width="${w.w + 4}" height="${w.h + 4}" fill="${G('shade', 'v')}" ${K.standalone ? `transform="translate(0 ${w.y - 2}) scale(1 ${n((1 - open) * 1000) / 1000}) translate(0 ${2 - w.y})"` : `style="transform:scaleY(${n((1 - open) * 1000) / 1000})"`}/>` : '')
    + `</g>`);
  // the frame and a mullion, in the soft line
  layers.back.push(`<path d="${g.d}" fill="none" stroke="${LINE}" stroke-width="1.6"/>`);
  if (!w.round) layers.back.push(`<path d="M${n(w.x + w.w / 2)} ${w.y}V${w.y + w.h}" stroke="${LINE}" stroke-width="1.2"/>`);
  else layers.back.push(`<path d="M${w.x} ${n(w.y + w.w / 2)}H${w.x + w.w}" stroke="${LINE}" stroke-width="1.2"/>`);
  // the shade's hem, which travels with it
  if (shade) layers.back.push(`<rect class="rl rs-hem" x="${w.x - 3}" y="${w.y - 1}" width="${w.w + 6}" height="3" rx="1.5" fill="#5F5751" ${K.standalone ? `transform="translate(0 ${n((1 - open) * w.h)})"` : `style="transform:translateY(${n((1 - open) * w.h)}px)"`}/>`);
  // the sill
  layers.back.push(`<rect x="${w.x - 6}" y="${w.y + w.h}" width="${w.w + 12}" height="4" rx="2" fill="#2F2A27"/>`);
  // moonlight on the floor, only while the room is dark and the shade is up
  const fy = F + 6, sx = w.x + w.w * 0.1, ex = w.x + w.w * 0.9;
  layers.pool.push(`<path class="rl" d="M${n(sx)} ${fy}L${n(ex)} ${fy}L${n(ex - 40)} ${fy + 34}L${n(sx - 60)} ${fy + 34}Z" fill="#6C82B5" style="opacity:${n((lit ? 0.02 : 0.07) * open * 1000) / 1000}"/>`);
}

// ---------- fixtures ----------
// Each draws its body into the fixture layer and its light into the pool and cone layers, and returns where its
// light comes from and how far it reaches, which is what lights the furniture's edges. Anything that changes with
// the light is an opacity (class rl) or a colour, never a change in what is drawn.
const op = v => `style="opacity:${n(v * 1000) / 1000}"`;
const DRAW = {
  pendant(K, s, L, q, f) {
    const { layers, rnd } = K;
    const x = s.x, y = s.y, style = f.style || ['dome', 'dome', 'bell', 'globe'][Math.floor(rnd() * 4)];
    const r = s.big ? 26 : 20;
    let shape, top;
    if (style === 'globe') { shape = ell(x, y - r * 0.8, r * 0.8, r * 0.8); top = y - r * 1.6; }
    else if (style === 'bell') { shape = { d: `M${x - r} ${y}C${x - r} ${y - r * 0.9} ${x - r * 0.45} ${y - r * 1.1} ${x} ${y - r * 1.1}C${x + r * 0.45} ${y - r * 1.1} ${x + r} ${y - r * 0.9} ${x + r} ${y}Z`, bb: [x - r, y - r * 1.1, 2 * r, r * 1.1] }; top = y - r * 1.1; }
    else { shape = half(x, y, r, 'up'); top = y - r; }
    // a cord, sometimes looping as it does in the reference
    const loop = s.loop && rnd() < 0.6;
    const cord = loop ? `M${x + 34} -4C${x + 70} 30 ${x + 40} ${y + 20} ${x + 8} ${y + 12}C${x - 20} ${y + 4} ${x - 10} ${top - 10} ${x} ${top}` : `M${x} -4V${top}`;
    const cone = `M${x - r * 0.75} ${y}L${x + r * 0.75} ${y}L${x + r * 2.8} ${F + 16}L${x - r * 2.8} ${F + 16}Z`;
    layers.pool.push(`<circle class="rl" cx="${x}" cy="${y}" r="92" fill="url(#${q}g)" ${op(L.I * 0.5)}/>`);
    layers.pool.push(`<path class="rl" d="${ell(x, F + 16, 70, 10).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    layers.cone.push(`<path class="rl" d="${cone}" fill="url(#${q}k)" ${op(L.I * 0.8)}/>`);
    return {
      x, y: y + 4, r: 120,
      body: `<path d="${cord}" stroke="${LINE}" stroke-width="1.6" fill="none"/><path d="${shape.d}" fill="${K.G('char', 'v')}"/>`
        + `<path class="rl" d="${shape.d}" fill="url(#${q}s)" ${op(L.I * 0.92)}/>`
        + (style === 'globe' ? '' : `<path class="rl" d="${ell(x, y, r * 0.62, 2.6).d}" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`),
    };
  },
  flush(K, s, L, q) {
    const { layers } = K;
    const x = s.x, y = Math.max(s.y, 86);
    const shape = half(x, y, 24, 'down');
    layers.pool.push(`<circle class="rl" cx="${x}" cy="${y}" r="150" fill="url(#${q}g)" ${op(L.I * 0.5)}/>`);
    layers.pool.push(`<path class="rl" d="${ell(x, F + 18, 110, 13).d}" fill="url(#${q}f)" ${op(L.I * 0.9)}/>`);
    layers.cone.push(`<path class="rl" d="M${x - 22} ${y + 6}L${x + 22} ${y + 6}L${x + 96} ${F + 20}L${x - 96} ${F + 20}Z" fill="url(#${q}k)" ${op(L.I * 0.3)}/>`);
    return {
      x, y: y + 8, r: 150,
      body: `<path d="M${x} -4V${y - 4}" stroke="${LINE}" stroke-width="1.6"/><rect x="${x - 10}" y="${y - 6}" width="20" height="6" rx="2" fill="${K.G('char', 'v')}"/>`
        + `<path d="${shape.d}" fill="${K.G('stone', 'v')}"/><path class="rl" d="${shape.d}" fill="url(#${q}s)" ${op(L.I * 0.95)}/>`,
    };
  },
  down(K, s, L, q) {
    const { layers } = K;
    const xs = [s.x - 46, s.x + 46];
    let body = '';
    for (const x of xs) {
      layers.cone.push(`<path class="rl" d="M${x - 6} 2L${x + 6} 2L${x + 44} ${F + 14}L${x - 44} ${F + 14}Z" fill="url(#${q}k)" ${op(L.I * 0.5)}/>`);
      // the scallop the can throws on the wall
      layers.pool.push(`<path class="rl" d="${ell(x, 120, 34, 90).d}" fill="url(#${q}f)" ${op(L.I * 0.55)}/>`);
      body += `<rect x="${x - 9}" y="-2" width="18" height="6" rx="3" fill="${K.G('stone', 'v')}"/><rect class="rl" x="${x - 6}" y="1" width="12" height="3" rx="1.5" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`;
    }
    layers.pool.push(`<path class="rl" d="${ell(s.x, F + 16, 120, 12).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    return { x: s.x, y: 110, r: 110, body };
  },
  chand(K, s, L, q) {
    const { layers } = K;
    const x = s.x, y = s.y;
    layers.pool.push(`<circle class="rl" cx="${x}" cy="${y - 6}" r="130" fill="url(#${q}g)" ${op(L.I * 0.6)}/>`);
    layers.pool.push(`<path class="rl" d="${ell(x, F + 16, 90, 11).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    const arms = [-34, -17, 0, 17, 34];
    let bulbs = '';
    for (const dx of arms) {
      const by = y - 16 + Math.abs(dx) * 0.25;
      bulbs += `<path d="M${x + dx} ${by + 2}V${y - 4}" stroke="${LINE}" stroke-width="1.4"/><circle cx="${x + dx}" cy="${n(by)}" r="4.2" fill="#3A3431"/>`
        + `<circle class="rl" cx="${x + dx}" cy="${n(by)}" r="4.2" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`;
    }
    return {
      x, y: y - 12, r: 140,
      body: `<path d="M${x} -4V${y - 8}" stroke="${LINE}" stroke-width="1.6"/><path d="M${x - 38} ${y - 6}Q${x} ${y + 14} ${x + 38} ${y - 6}" stroke="${LINE}" stroke-width="1.8" fill="none"/>`
        + `<path d="${half(x, y - 4, 7, 'down').d}" fill="${K.G('stone', 'v')}"/>${bulbs}`,
    };
  },
  fan(K, s, L, q, f) {
    const { layers } = K;
    const x = s.x, y = Math.max(s.y, 84);
    const on = f.fan && f.fan.on;
    const secs = { Low: 7, Medium: 4.5, MediumHigh: 3.2, High: 2.4 }[f.fan && f.fan.speed] || 5;
    const lamp = f.lamps.length > 0;
    // the blades turn in a flattened plane, so they read as a fan seen from a little below
    const blade = a => `<path d="M10 -7L64 -15Q76 0 64 15L10 7Z" transform="rotate(${a})" fill="${K.G('stone', 'h')}"/>`;
    let body = `<path d="M${x} -4V${y - 8}" stroke="${LINE}" stroke-width="2"/>`
      + `<g transform="translate(${x} ${y}) scale(1 .26)"><g class="rs-spin${on ? ' on' : ''}" data-fan="${f.fan ? f.fan.id : ''}" style="animation-duration:${secs}s">${blade(0)}${blade(120)}${blade(240)}</g></g>`
      + `<path d="${half(x, y + 2, 13, 'up').d}" fill="${K.G('char', 'v')}"/><rect x="${x - 13}" y="${y + 1}" width="26" height="4" rx="2" fill="#3A3431"/>`;
    if (lamp) {
      const bowl = half(x, y + 5, 10, 'down');
      layers.pool.push(`<circle class="rl" cx="${x}" cy="${y + 10}" r="130" fill="url(#${q}g)" ${op(L.I * 0.5)}/>`);
      layers.pool.push(`<path class="rl" d="${ell(x, F + 16, 100, 12).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
      layers.cone.push(`<path class="rl" d="M${x - 9} ${y + 12}L${x + 9} ${y + 12}L${x + 80} ${F + 18}L${x - 80} ${F + 18}Z" fill="url(#${q}k)" ${op(L.I * 0.5)}/>`);
      body += `<path d="${bowl.d}" fill="${K.G('stone', 'v')}"/><path class="rl" d="${bowl.d}" fill="url(#${q}s)" ${op(L.I)}/>`;
    }
    return { x, y: y + 12, r: lamp ? 130 : 1, body };
  },
  sconce(K, s, L, q) {
    const { layers } = K;
    const x = s.x, y = s.y;
    const shell = half(x, y, 11, 'down');
    // a shell sconce throws its light up the wall, and a little down
    layers.pool.push(`<path class="rl" d="${ell(x, y - 36, 26, 60).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    layers.pool.push(`<path class="rl" d="${ell(x, y - 14, 14, 26).d}" fill="url(#${q}f)" ${op(L.I * 0.8)}/>`);
    layers.pool.push(`<path class="rl" d="${ell(x, y + 30, 20, 36).d}" fill="url(#${q}f)" ${op(L.I * 0.45)}/>`);
    return {
      x, y: y - 6, r: 90,
      body: `<rect x="${x - 3}" y="${y - 2}" width="6" height="18" rx="3" fill="#35302D"/><path d="${shell.d}" fill="${K.G('stone', 'v')}"/>`
        + `<path class="rl" d="${shell.d}" fill="url(#${q}s)" ${op(L.I * 0.9)}/><path class="rl" d="${ell(x, y, 9, 2).d}" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`,
    };
  },
  table(K, s, L, q, f) {
    const { layers, rnd } = K;
    const x = s.x, y = s.y, style = ['drum', 'dome', 'drum', 'globe'][Math.floor(rnd() * 4)];
    let shade, base, cy;
    if (style === 'dome') { shade = half(x, y - 26, 17, 'up'); cy = y - 34; base = `<path d="M${x} ${y - 3}V${y - 26}" stroke="${LINE}" stroke-width="1.6"/><path d="${half(x, y, 8, 'up').d}" fill="${K.G('clay', 'd')}"/>`; }
    else if (style === 'globe') { shade = ell(x, y - 26, 14, 14); cy = y - 26; base = `<rect x="${x - 7}" y="${y - 12}" width="14" height="12" rx="3" fill="${K.G('clay', 'd')}"/>`; }
    else { shade = poly([[x - 12, y - 50], [x + 12, y - 50], [x + 17, y - 28], [x - 17, y - 28]]); cy = y - 39; base = `<path d="M${x} ${y - 16}V${y - 28}" stroke="${LINE}" stroke-width="1.6"/><path d="${ell(x, y - 9, 8, 9).d}" fill="${K.G('clay', 'd')}"/>`; }
    layers.pool.push(`<circle class="rl" cx="${x}" cy="${cy}" r="80" fill="url(#${q}g)" ${op(L.I * 0.65)}/>`);
    layers.front.push(`<path class="rl" d="${ell(x, y, 30, 3.5).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    return {
      x, y: cy, r: 100,
      body: `${base}<path d="${shade.d}" fill="${K.G('shade', 'v')}"/><path class="rl" d="${shade.d}" fill="url(#${q}s)" ${op(L.I * 0.94)}/>`,
    };
  },
  floor(K, s, L, q, f) {
    const { layers, rnd } = K;
    const x = s.x, y = s.y, arc = s.arc != null ? s.arc : rnd() < 0.4;
    if (arc) {
      // the arc lamp: a weighted base, a long bow of a stem and a dome hanging at its end
      const d = s.arcDir || 1, hx = x + 64 * d, hy = y - 110;
      const shade = half(hx, hy, 17, 'up');
      layers.pool.push(`<circle class="rl" cx="${hx}" cy="${hy}" r="110" fill="url(#${q}g)" ${op(L.I * 0.6)}/>`);
      layers.cone.push(`<path class="rl" d="M${hx - 12} ${hy}L${hx + 12} ${hy}L${hx + 48} ${F + 16}L${hx - 48} ${F + 16}Z" fill="url(#${q}k)" ${op(L.I * 0.55)}/>`);
      layers.pool.push(`<path class="rl" d="${ell(hx, F + 16, 60, 9).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
      return {
        x: hx, y: hy + 2, r: 110,
        body: `<path d="M${x} ${y - 8}C${x} ${y - 150} ${hx} ${y - 170} ${hx} ${hy - 17}" stroke="${LINE}" stroke-width="1.8" fill="none"/><rect x="${x - 10}" y="${y - 10}" width="20" height="10" rx="3" fill="${K.G('char', 'v')}"/>`
          + `<path d="${shade.d}" fill="${K.G('char', 'v')}"/><path class="rl" d="${shade.d}" fill="url(#${q}s)" ${op(L.I * 0.92)}/><path class="rl" d="${ell(hx, hy, 11, 2.2).d}" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`,
      };
    }
    const top = y - 104;
    const shade = poly([[x - 13, top - 26], [x + 13, top - 26], [x + 18, top], [x - 18, top]]);
    layers.pool.push(`<circle class="rl" cx="${x}" cy="${top - 13}" r="84" fill="url(#${q}g)" ${op(L.I * 0.65)}/>`);
    layers.pool.push(`<path class="rl" d="${ell(x, F + 14, 50, 8).d}" fill="url(#${q}f)" ${op(L.I * 0.8)}/>`);
    return {
      x, y: top - 12, r: 110,
      body: `<path d="M${x} ${y - 3}V${top}" stroke="${LINE}" stroke-width="1.8"/><path d="${ell(x, y - 2, 13, 3).d}" fill="#34302D"/>`
        + `<path d="${shade.d}" fill="${K.G('shade', 'v')}"/><path class="rl" d="${shade.d}" fill="url(#${q}s)" ${op(L.I * 0.94)}/>`,
    };
  },
  torch(K, s, L, q) {
    const { layers } = K;
    const x = s.x, y = s.y, top = y - 120;
    const bowl = half(x, top, 16, 'down');
    layers.pool.push(`<path class="rl" d="${ell(x, top - 50, 70, 70).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    layers.cone.push(`<path class="rl" d="M${x - 14} ${top}L${x + 14} ${top}L${x + 60} ${top - 90}L${x - 60} ${top - 90}Z" fill="url(#${q}k)" transform="rotate(180 ${x} ${top - 45})" ${op(L.I * 0.7)}/>`);
    return {
      x, y: top - 6, r: 100,
      body: `<path d="M${x} ${y - 3}V${top + 12}" stroke="${LINE}" stroke-width="1.8"/><path d="${ell(x, y - 2, 13, 3).d}" fill="#34302D"/>`
        + `<path d="${bowl.d}" fill="${K.G('stone', 'v')}"/><path class="rl" d="${ell(x, top, 15, 2.4).d}" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`,
    };
  },
  desk(K, s, L, q) {
    const { layers } = K;
    const x = s.x, y = s.y;
    // an angled arm: base, elbow, and a head pointing down at the desk
    const ex = x - 12, ey = y - 38, hx = x + 20, hy = y - 50;
    const head = poly([[hx - 4, hy - 7], [hx + 8, hy - 3], [hx + 18, hy + 14], [hx - 2, hy + 18]]);
    layers.cone.push(`<path class="rl" d="M${hx + 2} ${hy + 14}L${hx + 16} ${hy + 12}L${hx + 44} ${y}L${hx - 16} ${y}Z" fill="url(#${q}k)" ${op(L.I * 0.8)}/>`);
    layers.pool.push(`<circle class="rl" cx="${hx + 8}" cy="${hy + 12}" r="80" fill="url(#${q}g)" ${op(L.I * 0.5)}/>`);
    layers.front.push(`<path class="rl" d="${ell(hx + 14, y, 34, 3.5).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    return {
      x: hx + 8, y: hy + 14, r: 90,
      body: `<path d="M${x} ${y - 4}L${ex} ${ey}L${hx} ${hy}" stroke="${LINE}" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="${ex}" cy="${ey}" r="2.4" fill="${LINE}"/>`
        + `<path d="${ell(x, y - 2, 11, 3).d}" fill="#34302D"/><path d="${head.d}" fill="${K.G('slate', 'd')}"/><path class="rl" d="M${hx - 2} ${hy + 18}L${hx + 18} ${hy + 14}" stroke="currentColor" stroke-width="2.4" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`,
    };
  },
  strip(K, s, L, q) {
    const { layers } = K;
    const { x1, x2, y } = s, up = s.dir === 'up', w = x2 - x1;
    const wash = up ? `M${x1} ${y}L${x2} ${y}L${x2 + 10} ${y - 46}L${x1 - 10} ${y - 46}Z` : `M${x1} ${y}L${x2} ${y}L${x2 + 10} ${y + 50}L${x1 - 10} ${y + 50}Z`;
    layers.cone.push(`<path class="rl" d="${wash}" fill="url(#${q}k)"${up ? ` transform="rotate(180 ${(x1 + x2) / 2} ${y - 23})"` : ''} ${op(L.I * 0.9)}/>`);
    return {
      x: (x1 + x2) / 2, y: y + (up ? -6 : 6), r: Math.max(80, w * 0.7),
      body: `<rect x="${x1}" y="${y - 1.5}" width="${w}" height="3" rx="1.5" fill="#3A3431"/><rect class="rl" x="${x1}" y="${y - 1.5}" width="${w}" height="3" rx="1.5" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`,
    };
  },
  bed(K, s, L, q) {
    const { layers } = K;
    const x = s.x, y = s.y;
    layers.pool.push(`<path class="rl" d="${ell(x + 4, y + 8, 30, 34).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    layers.cone.push(`<path class="rl" d="M${x + 4} ${y + 3}L${x + 12} ${y + 1}L${x + 34} ${y + 44}L${x - 8} ${y + 44}Z" fill="url(#${q}k)" ${op(L.I * 0.7)}/>`);
    return {
      x: x + 6, y: y + 4, r: 70,
      body: `<path d="M${x - 8} ${y - 8}Q${x - 8} ${y - 18} ${x} ${y - 16}L${x + 6} ${y - 2}" stroke="${LINE}" stroke-width="1.8" fill="none"/>`
        + `<path d="${poly([[x - 2, y - 4], [x + 12, y - 8], [x + 16, y + 2], [x + 2, y + 6]]).d}" fill="${K.G('stone', 'd')}"/><path class="rl" d="M${x + 3} ${y + 4}L${x + 15} ${y + 1}" stroke="currentColor" stroke-width="2.2" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`,
    };
  },
  lantern(K, s, L, q) {
    const { layers } = K;
    const x = s.x, y = s.y;
    const glass = rr(x - 7, y - 10, 14, 22, 2);
    layers.pool.push(`<circle class="rl" cx="${x}" cy="${y}" r="100" fill="url(#${q}g)" ${op(L.I * 0.75)}/>`);
    layers.pool.push(`<path class="rl" d="${ell(x, F + 14, 60, 9).d}" fill="url(#${q}f)" ${op(L.I * 0.8)}/>`);
    return {
      x, y, r: 110,
      body: `<rect x="${x - 2}" y="${y - 22}" width="4" height="8" fill="#35302D"/><path d="${poly([[x - 11, y - 11], [x + 11, y - 11], [x + 6, y - 17], [x - 6, y - 17]]).d}" fill="#34302D"/>`
        + `<path d="${glass.d}" fill="#262220"/><path class="rl" d="${glass.d}" fill="url(#${q}s)" ${op(L.I)}/><rect x="${x - 9}" y="${y + 12}" width="18" height="3" rx="1.5" fill="#34302D"/>`
        + `<path d="M${x} ${y - 10}V${y + 12}" stroke="#34302D" stroke-width="1.4"/>`,
    };
  },
  bollard(K, s, L, q) {
    const { layers } = K;
    const x = s.x, y = s.y;
    layers.pool.push(`<path class="rl" d="${ell(x, y + 2, 44, 9).d}" fill="url(#${q}f)" ${op(L.I)}/>`);
    return {
      x, y: y - 16, r: 60,
      body: `<rect x="${x - 5}" y="${y - 22}" width="10" height="22" rx="2" fill="${K.G('char', 'v')}"/><rect class="rl" x="${x - 5}" y="${y - 18}" width="10" height="4" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`,
    };
  },
  string(K, s, L, q) {
    const { layers } = K;
    const { x1, x2, y, sag = 16 } = s;
    const pt = t => [x1 + (x2 - x1) * t, y + 4 * sag * t * (1 - t)];
    let bulbs = '';
    for (let i = 1; i < 10; i++) {
      const [bx, by] = pt(i / 10);
      bulbs += `<circle cx="${n(bx)}" cy="${n(by + 4)}" r="2.6" fill="#3A3431"/><circle class="rl" cx="${n(bx)}" cy="${n(by + 4)}" r="2.6" fill="currentColor" style="color:${L.core};opacity:${n(L.I * 1000) / 1000}"/>`;
      layers.pool.push(`<circle class="rl" cx="${n(bx)}" cy="${n(by + 4)}" r="26" fill="url(#${q}f)" ${op(L.I * 0.8)}/>`);
    }
    return {
      x: (x1 + x2) / 2, y: y + sag, r: 60,
      body: `<path d="M${x1} ${y}Q${(x1 + x2) / 2} ${y + 2 * sag} ${x2} ${y}" stroke="${LINE}" stroke-width="1.2" fill="none"/>${bulbs}`,
    };
  },
};

// ---------- the scenes ----------
// Each lays out its room in the 372 x 300 frame and says where lights can go: `ceil` (x, and how low a pendant
// hangs), `wall` (a sconce), `table` and `desk` (a surface's middle and top), `floor`, `bed` (by the headboard),
// `strip` (under a cabinet or a shelf, or along the ceiling), `door`, `ground` and `string`. A slot's `hide` names the
// decor a lamp there replaces. `order` is what lights with no kind and no telling name become, first to last.
const plant = (K, x, y, s = 1, pot = 'clay') => {
  const { put, G } = K;
  put('furn', K.rr(x - 8 * s, y - 12 * s, 16 * s, 12 * s, [0, 0, 5 * s, 5 * s]), G(pot, 'd'));
  put('furn', { d: `M${x} ${y - 12 * s}C${x - 16 * s} ${y - 14 * s} ${x - 20 * s} ${y - 30 * s} ${x - 14 * s} ${y - 34 * s}C${x - 6 * s} ${y - 30 * s} ${x - 2 * s} ${y - 20 * s} ${x} ${y - 12 * s}Z`, bb: [] }, G('olive', 'd'));
  put('furn', { d: `M${x} ${y - 12 * s}C${x + 4 * s} ${y - 26 * s} ${x + 14 * s} ${y - 30 * s} ${x + 22 * s} ${y - 26 * s}C${x + 16 * s} ${y - 16 * s} ${x + 8 * s} ${y - 12 * s} ${x} ${y - 12 * s}Z`, bb: [] }, G('olive', 'r'));
};
const vase = (K, x, y, pal = 'clay') => { K.put('furn', K.ell(x, y - 9, 6, 9), K.G(pal, 'd')); K.line('furn', x, y - 17, x - 2, y - 30, 1.2); K.line('furn', x + 1, y - 16, x + 6, y - 27, 1.2); };
const books = (K, x, y) => { [[0, 12, 'ink'], [7, 15, 'clay'], [13, 10, 'teal'], [19, 13, 'stone']].forEach(([dx, h, pal]) => K.put('furn', K.rr(x + dx, y - h, 6, h, 1), K.G(pal, 'v'))); };
// the mid-century art the reference hangs: a long diagonal and a triangle
const art = (K, x, y, s = 1) => { K.line('back', x, y + 46 * s, x + 50 * s, y - 4 * s, 1.6); K.put('back', K.poly([[x + 30 * s, y + 22 * s], [x + 50 * s, y + 22 * s], [x + 50 * s, y + 2 * s]]), K.G('D', 'd')); };
const steps = (K, x, pal = 'D') => { K.solid(K.rr(x, F - 26, 120, 26, 0), K.G(pal, 'h')); K.solid(K.rr(x + 22, F - 50, 100, 24, 0), K.G(pal, 'e')); };

const SCENES = {
  living(K) {
    const { rr, half, quarter, arch, solid, put, G, legs } = K;
    shell(K);
    solid(arch(-40, 72, 76, F - 72), G('D', 'r'));
    art(K, 112, 54);
    // the sofa: a tall arm, a long seat, a quarter-disc and a rounded cushion for its back
    solid(rr(66, 124, 26, 66, [13, 13, 0, 13]), G('A', 'v'));
    solid(quarter(142, 150, 46, 'tl'), G('B', 'r'));
    solid(rr(146, 120, 58, 30, [30, 0, 0, 0]), G('C', 'd'));
    solid(rr(92, 150, 150, 40, [0, 22, 0, 0]), G('A', 'd'));
    legs([[98], [234]], 190, 214);
    // the coffee table: a bowl on legs; the side table the same, smaller
    solid(half(176, 198, 28, 'down'), G('C', 'e'));
    legs([[162, 158], [190, 194]], 212, 232);
    solid(half(296, 172, 21, 'down'), G('B', 'e'));
    legs([[286, 284], [306, 308]], 186, 214);
    steps(K, 340);
    return {
      win: { x: 256, y: 62, w: 62, h: 90, round: true },
      slots: {
        ceil: [{ x: 176, y: 96, loop: true }, { x: 226, y: 76 }, { x: 124, y: 78 }],
        wall: [{ x: 234, y: 104 }, { x: 52, y: 100 }],
        table: [{ x: 296, y: 172, hide: 'side' }, { x: 176, y: 198, hide: 'coffee' }],
        floor: [{ x: 50, y: 214, arc: false }, { x: 336, y: 214, arc: false }],
        strip: [{ x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
      },
      order: ['pendant', 'table', 'floor', 'sconce', 'table', 'floor'],
      decor(K) {
        if (!K.hidden.has('side')) plant(K, 296, 172, 1);
        if (!K.hidden.has('coffee')) { vase(K, 168, 198, 'stone'); K.put('furn', K.rr(182, 190, 10, 8, 2), K.G('clay', 'v')); }
      },
    };
  },
  kitchen(K) {
    const { rr, half, solid, put, G, legs, line } = K;
    shell(K, { rug: false });
    // upper cabinets, the counter run with its backsplash, and an island with two stools
    solid(rr(18, 60, 138, 42, 4), G('B', 'v'));
    line('furn', 64, 64, 64, 98, 1.2); line('furn', 110, 64, 110, 98, 1.2);
    put('back', rr(-110, 118, 592, 32, 0), G('stone', 'u'), ' opacity=".35"');
    solid(rr(14, 150, 344, 6, 2), G('char', 'v'));
    solid(rr(18, 156, 336, 48, 0), G('B', 'd'));
    for (const x of [74, 130, 186, 242, 298]) line('furn', x, 160, x, 200, 1.1);
    solid(rr(84, 170, 204, 8, 2), G('C', 'v'));
    solid(rr(92, 178, 188, 42, [0, 0, 4, 4]), G('A', 'd'));
    solid(half(134, 204, 15, 'down'), G('C', 'e'));
    legs([[126, 122], [142, 146]], 214, 238);
    solid(half(238, 204, 15, 'down'), G('C', 'e'));
    legs([[230, 226], [246, 250]], 214, 238);
    return {
      win: { x: 262, y: 62, w: 70, h: 72 },
      slots: {
        ceil: [{ x: 186, y: 118 }, { x: 132, y: 112 }, { x: 236, y: 112 }],
        strip: [{ x1: 22, x2: 152, y: 104, dir: 'down', tag: 'cabinet' }, { x1: 258, x2: 336, y: 58, dir: 'down', tag: 'shelf' }, { x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
        wall: [{ x: 214, y: 90 }],
        table: [{ x: 50, y: 150, hide: 'plant' }],
        floor: [{ x: 350, y: 214, arc: false }],
      },
      order: ['pendant', 'cabinet', 'pendant', 'down', 'sconce'],
      decor(K) {
        if (!K.hidden.has('plant')) plant(K, 50, 150, 0.9);
        vase(K, 322, 150, 'stone');
      },
    };
  },
  bedroom(K) {
    const { rr, half, quarter, solid, put, G, legs } = K;
    shell(K);
    // a headboard that is half a disc, a low bed with a folded cover, and two different nightstands
    solid(half(178, 170, 84, 'up'), G('D', 'd'));
    solid(rr(84, 158, 196, 32, [10, 10, 6, 6]), G('A', 'd'));
    solid(rr(108, 146, 44, 14, 7), G('stone', 'd'));
    solid(rr(160, 146, 44, 14, 7), G('stone', 'r'));
    solid(rr(186, 152, 100, 38, [22, 0, 6, 0]), G('B', 'v'));
    legs([[92], [272]], 190, 212);
    solid(half(42, 170, 22, 'down'), G('C', 'e'));
    legs([[32, 30], [52, 54]], 184, 212);
    solid(rr(300, 150, 50, 54, 6), G('C', 'd'));
    K.line('furn', 300, 176, 350, 176, 1.2);
    return {
      win: { x: 300, y: 50, w: 50, h: 52, round: true },
      slots: {
        ceil: [{ x: 178, y: 64 }],
        table: [{ x: 42, y: 170, hide: 'l' }, { x: 325, y: 150, hide: 'r' }],
        bed: [{ x: 116, y: 112 }, { x: 232, y: 112 }],
        wall: [{ x: 78, y: 96 }],
        floor: [{ x: 18, y: 214, arc: false }],
        strip: [{ x1: 90, x2: 274, y: 194, dir: 'down', tag: 'underbed' }, { x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
      },
      order: ['flush', 'table', 'table', 'bed', 'floor'],
      decor(K) {
        if (!K.hidden.has('l')) books(K, 30, 170);
        if (!K.hidden.has('r')) plant(K, 325, 150, 0.9);
      },
    };
  },
  office(K) {
    const { rr, quarter, solid, put, G, legs } = K;
    shell(K);
    // a long desk, a shelf of books, a chair drawn from a quarter disc, a tall plant
    solid(rr(186, 92, 130, 6, 2), G('C', 'v'));
    books(K, 196, 92); books(K, 250, 92);
    solid(rr(96, 146, 206, 8, 2), G('C', 'v'));
    solid(rr(248, 154, 50, 30, [0, 0, 6, 6]), G('B', 'd'));
    legs([[104], [294]], 154, 214);
    put('furn', rr(156, 128, 44, 18, [3, 3, 0, 0]), G('slate', 'v'));
    solid(quarter(142, 184, 44, 'tl'), G('A', 'r'));
    solid(rr(96, 176, 64, 10, 5), G('A', 'd'));
    legs([[104, 100], [150, 154]], 186, 232);
    return {
      win: { x: 28, y: 60, w: 58, h: 84 },
      slots: {
        desk: [{ x: 278, y: 146 }],
        ceil: [{ x: 140, y: 76 }, { x: 250, y: 62 }],
        strip: [{ x1: 188, x2: 314, y: 100, dir: 'down', tag: 'shelf' }, { x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
        wall: [{ x: 124, y: 96 }],
        table: [{ x: 120, y: 146, hide: 'mug' }],
        floor: [{ x: 340, y: 214, arc: false }, { x: 60, y: 214, arcDir: 1 }],
      },
      order: ['flush', 'desk', 'floor', 'shelf'],
      decor(K) {
        plant(K, 336, 214, 1.5);
        if (!K.hidden.has('mug')) K.put('furn', K.rr(118, 136, 10, 10, [0, 0, 3, 3]), K.G('clay', 'v'));
      },
    };
  },
  dining(K) {
    const { rr, arch, solid, put, G, legs } = K;
    shell(K);
    // two chairs behind the table, one at each end, and the table on its legs
    solid(arch(126, 124, 34, 40), G('B', 'v'));
    solid(arch(212, 124, 34, 40), G('B', 'v'));
    solid(rr(80, 162, 212, 8, 3), G('C', 'v'));
    legs([[96], [276]], 170, 220);
    solid(arch(46, 118, 34, 70), G('A', 'v'));
    solid(rr(42, 176, 46, 8, 3), G('A', 'd'));
    legs([[48], [82]], 184, 216);
    solid(arch(292, 118, 34, 70), G('A', 'v'));
    solid(rr(288, 176, 46, 8, 3), G('A', 'd'));
    legs([[294], [328]], 184, 216);
    return {
      win: { x: 318, y: 56, w: 48, h: 60, round: true },
      slots: {
        ceil: [{ x: 186, y: 110, big: true }, { x: 132, y: 98 }, { x: 240, y: 98 }],
        wall: [{ x: 34, y: 92 }, { x: 290, y: 90 }],
        table: [{ x: 186, y: 162, hide: 'vase' }],
        floor: [{ x: 16, y: 214, arc: false }],
        strip: [{ x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
      },
      order: ['chand', 'sconce', 'pendant', 'sconce'],
      decor(K) { if (!K.hidden.has('vase')) { vase(K, 186, 162, 'stone'); K.put('furn', K.ell(206, 159, 8, 3), K.G('clay', 'v')); } },
    };
  },
  bath(K) {
    const { rr, half, solid, put, G, legs, line } = K;
    shell(K, { rug: false });
    put('back', rr(-110, 132, 592, 72, 0), G('stone', 'u'), ' opacity=".3"');
    // a round mirror over a vanity with a bowl basin; a tub under the window
    solid({ d: `M44 96a30 30 0 1 0 60 0a30 30 0 1 0 -60 0Z`, bb: [44, 66, 60, 60] }, G('glass', 'd'));
    line('back', 60, 84, 70, 74, 1.2);
    solid(rr(18, 150, 112, 7, 2), G('C', 'v'));
    solid(rr(24, 157, 100, 44, [0, 0, 4, 4]), G('B', 'd'));
    solid(half(74, 150, 16, 'down'), G('stone', 'e'));
    line('furn', 90, 150, 90, 136, 1.6); line('furn', 90, 136, 82, 136, 1.6);
    solid(rr(172, 150, 176, 46, [4, 4, 24, 24]), G('A', 'd'));
    legs([[184, 182], [336, 338]], 194, 210);
    return {
      win: { x: 228, y: 62, w: 70, h: 62 },
      slots: {
        wall: [{ x: 26, y: 96 }, { x: 122, y: 96 }],
        ceil: [{ x: 250, y: 60 }, { x: 170, y: 70 }],
        table: [{ x: 116, y: 150, hide: 'soap' }],
        floor: [{ x: 360, y: 214, arc: false }],
        strip: [{ x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
      },
      order: ['sconce', 'flush', 'sconce', 'down'],
      decor(K) {
        plant(K, 340, 150, 0.8);
        if (!K.hidden.has('soap')) K.put('furn', K.rr(110, 142, 10, 8, 2), K.G('teal', 'v'));
      },
    };
  },
  hall(K) {
    const { rr, arch, solid, put, G, legs, line } = K;
    shell(K);
    // a tall arched door, a console with a round mirror, and the stairs climbing away
    solid(arch(34, 80, 62, 124), G('A', 'v'));
    put('furn', { d: 'M85 146a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z', bb: [] }, '#6A625B');
    solid({ d: 'M150 100a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z', bb: [150, 78, 44, 44] }, G('glass', 'd'));
    solid(rr(126, 150, 92, 7, 2), G('C', 'v'));
    legs([[134], [210]], 157, 214);
    const s0 = 236;
    for (let i = 0; i < 5; i++) solid(rr(s0 + i * 28, F - 20 * (i + 1), 200, 20, 0), G('D', i % 2 ? 'e' : 'h'));
    line('furn', s0 - 6, F - 44, s0 + 150, F - 150, 1.6);
    for (let i = 0; i < 5; i++) line('furn', s0 + 8 + i * 28, F - 20 * (i + 1), s0 + 8 + i * 28, F - 20 * (i + 1) - 36 + i * 0, 1.2);
    return {
      slots: {
        ceil: [{ x: 286, y: 64 }, { x: 64, y: 50 }],
        wall: [{ x: 116, y: 104 }, { x: 16, y: 104 }],
        table: [{ x: 196, y: 150, hide: 'vase' }],
        floor: [{ x: 356, y: 214, arc: false }],
        strip: [{ x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
      },
      order: ['flush', 'sconce', 'table', 'pendant'],
      decor(K) { if (!K.hidden.has('vase')) vase(K, 196, 150, 'clay'); plant(K, 146, 150, 0.8); },
    };
  },
  porch(K) {
    const { rr, arch, solid, put, G, legs, line, layers } = K;
    shell(K, { rug: false, skirting: false });
    // siding on the house, the porch roof's edge, a door with its glass, steps down and two planters
    for (let y = 40; y < F; y += 14) layers.wall.push(`<rect x="-110" y="${y}" width="592" height="1" fill="#2A2522"/>`);
    put('back', rr(-110, 0, 592, 24, 0), G('char', 'v'));
    put('back', rr(-110, 22, 592, 4, 0), G('stone', 'v'));
    solid(rr(150, 84, 72, 120, [6, 6, 0, 0]), G('A', 'v'));
    put('furn', rr(162, 98, 48, 40, 4), G('glass', 'v'));
    put('furn', { d: 'M208 150a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z', bb: [] }, '#6A625B');
    solid(rr(134, 204, 104, 12, 0), G('stone', 'v'));
    solid(rr(120, 216, 132, 12, 0), G('stone', 'v'));
    solid(rr(28, 172, 78, 8, 3), G('C', 'v'));
    legs([[36], [98]], 180, 206);
    solid(rr(284, 176, 36, 28, [0, 0, 8, 8]), G('clay', 'd'));
    return {
      win: { x: 44, y: 76, w: 56, h: 64 },
      slots: {
        door: [{ x: 132, y: 118 }, { x: 240, y: 118 }],
        string: [{ x1: 12, x2: 360, y: 30, sag: 16 }],
        ceil: [{ x: 186, y: 54 }],
        ground: [{ x: 60, y: 226 }, { x: 318, y: 226 }],
        wall: [{ x: 300, y: 100 }],
        table: [{ x: 90, y: 172, hide: 'bench' }],
      },
      order: ['lantern', 'lantern', 'string', 'bollard', 'bollard'],
      decor(K) {
        plant(K, 302, 176, 1.4, 'clay');
        if (!K.hidden.has('bench')) plant(K, 70, 172, 0.8);
      },
    };
  },
  garage(K) {
    const { rr, solid, put, G, legs, line } = K;
    shell(K, { rug: false });
    // the big door in panels, a workbench with a pegboard over it, a shelf of boxes
    solid(rr(162, 66, 196, 138, [6, 6, 0, 0]), G('stone', 'v'));
    for (let y = 92; y < 204; y += 26) line('furn', 166, y, 354, y, 1.2);
    put('back', rr(22, 70, 106, 58, 3), G('char', 'v'));
    for (let x = 34; x < 128; x += 12) for (let y = 80; y < 126; y += 12) put('back', { d: `M${x} ${y}h1.4v1.4h-1.4Z`, bb: [] }, '#3F3935');
    line('back', 46, 84, 46, 108, 2); line('back', 62, 84, 70, 110, 2);
    put('back', { d: 'M96 96a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z', bb: [] }, 'none', ` stroke="${LINE}" stroke-width="1.6"`);
    solid(rr(16, 146, 120, 8, 2), G('wood', 'v'));
    legs([[24], [128]], 154, 214);
    solid(rr(26, 176, 40, 28, 2), G('B', 'd'));
    return {
      slots: {
        ceil: [{ x: 260, y: 40 }, { x: 80, y: 40 }],
        desk: [{ x: 110, y: 146 }],
        strip: [{ x1: 22, x2: 128, y: 66, dir: 'down', tag: 'shelf' }, { x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
        wall: [{ x: 146, y: 96 }],
        floor: [{ x: 362, y: 214, arc: false }],
        table: [{ x: 46, y: 176 }],
      },
      order: ['flush', 'flush', 'desk', 'shelf'],
    };
  },
  room(K) {
    const { rr, half, quarter, arch, solid, put, G, legs } = K;
    shell(K);
    solid(arch(-40, 72, 76, F - 72), G('D', 'r'));
    art(K, 112, 48, 0.9);
    // a lounge chair from a big quarter disc, a bowl table, and the tall plant stand
    solid(quarter(156, 176, 62, 'tl'), G('A', 'r'));
    solid(rr(100, 164, 96, 22, [0, 12, 12, 0]), G('B', 'd'));
    legs([[108, 104], [188, 192]], 186, 216);
    solid(half(236, 172, 20, 'down'), G('C', 'e'));
    legs([[226, 224], [246, 248]], 186, 214);
    solid(half(306, 128, 24, 'down'), G('D', 'e'));
    legs([[292], [320]], 144, 214);
    steps(K, 346);
    return {
      win: { x: 58, y: 58, w: 50, h: 80, round: true },
      slots: {
        ceil: [{ x: 196, y: 92 }, { x: 262, y: 70 }],
        wall: [{ x: 200, y: 118 }],
        table: [{ x: 236, y: 172, hide: 'a' }, { x: 306, y: 128, hide: 'b' }],
        floor: [{ x: 52, y: 214, arcDir: 1 }, { x: 350, y: 214, arc: false }],
        strip: [{ x1: 10, x2: 362, y: 26, dir: 'down', tag: 'cove' }],
      },
      order: ['pendant', 'table', 'floor', 'sconce', 'table'],
      decor(K) {
        if (!K.hidden.has('a')) K.put('furn', K.rr(228, 162, 16, 10, 2), K.G('clay', 'v'));
        if (!K.hidden.has('b')) plant(K, 306, 128, 1.1);
      },
    };
  },
};
export const KINDS = Object.keys(SCENES);

// ---------- grain ----------
// One small tile of film grain, made once when the app loads and laid over every scene by CSS (roomscene.css) at two
// of its pixels to a CSS pixel, so a speck is about one device pixel on a phone, and eight cards cost one image
// and no live filters. Light and dark specks, so it reads on the dark wall and in a pool
// of light alike.
export function grainURL(size = 192) {
  if (typeof document === 'undefined') return '';
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'); const img = g.createImageData(size, size);
    let x = 0x9e3779b9;
    const r = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (r() + r() + r()) / 3;   // near-normal, so most specks are faint
      const light = v > 0.5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
      img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * (light ? 60 : 90));
    }
    g.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  } catch (_) { return ''; }
}
if (typeof document !== 'undefined' && document.documentElement) {
  const url = grainURL();
  if (url) document.documentElement.style.setProperty('--rs-grain', `url(${url})`);
}
