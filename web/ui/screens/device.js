// A device's own page, pushed from a tile: 04 Light (12731:22), 17 Fan (12744:111211), 18 Shade (12744:111298).
// No tab bar on any of them, as the file draws them. The white, colour, sleep timer, Follow the day and "about"
// pages hang off a light as #light/<id>/<page>.
import { track } from '/ui/gesture.js';
import { CasetaDaylight } from '/data/index.js';
import { lightHTML, setLight } from '/ui/glow.js';
import { colourName } from '/ui/colour.js';
import { artInline, loadArt } from '/ui/art.js';
import { endsMs, pinButton } from '/ui/screens/parts.js';
import { sheets as lookSheets, actions as lookActions } from '/ui/screens/looks.js';
import { about, actions as aboutActions } from '/ui/screens/about.js';
import { view as followView, alsoSheet, actions as followActions, after as followAfter } from '/ui/screens/follow.js';

export const noTabs = true;
// White, Colour, the sleep timer and About are sheets over this page (looks.js, about.js); Follow the day is a
// page of its own (follow.js), with "Also for" as a sheet over it.
export const sheets = { ...lookSheets, about };
export const subs = ['follow'];
export function sheetFor(c, r) {
  if (r.sub === 'follow/also') { const d = c.data.dev(r.id); return d ? { spec: alsoSheet(c, d), parent: `light/${r.id}/follow` } : null; }
  const make = r.sub && sheets[r.sub];
  return make ? { spec: make(c, r), parent: `light/${r.id}` } : null;
}

const FAN = [['Off', 'Off'], ['Low', 'Low'], ['Medium', 'Medium'], ['MediumHigh', 'Med-high'], ['High', 'High']];
const FAN_WORD = { Off: 'Off', Low: 'Low', Medium: 'Medium', MediumHigh: 'Medium high', High: 'High' };

// ---------- the arc ----------
// A half circle round (170, 170) of radius 150 inside a 340 x 190 box: 0% at the left end, 100% at the right.
const CX = 170, CY = 170, R = 150;
function arcPoint(p) { const a = Math.PI * (1 - p / 100); return [CX + R * Math.cos(a), CY - R * Math.sin(a)]; }
function arcPath(p) { const [x, y] = arcPoint(p); return `M20 170 A150 150 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`; }

// ---------- the lamp's own light (v7 screen 3) ----------
// What colour a lamp's light is: its white on the ramp, or its colour. A lamp that has never said (a Caseta dimmer)
// is a warm incandescent white.
export function toneOf(c, id) {
  const col = (c.S.states[id] || {}).color || {};
  return col.mode === 'xy' && col.hex ? { hex: col.hex } : { kelvin: col.mode === 'ct' && col.kelvin ? col.kelvin : 2700 };
}
// Night as the app's own look reckons it (app.js): the glows are capped at night, the lamps' colours are not.
export function nightNow(c) {
  const s = (c.S.config && c.S.config.settings) || {};
  const look = s.night_look || 'auto';
  if (look === 'always') return true;
  if (look !== 'auto') return false;
  const hm = c.RT.nowHm(), ns = s.night_start || '22:00', ne = s.night_end || '06:30';
  return ns < ne ? hm >= ns && hm < ne : hm >= ns || hm < ne;
}
// The lamp's own light: one soft light centred on the lamp, in its colour and as strong as its level (glow.js,
// lightHTML), and nothing at all when it is off. No halo rings, no pool on the floor, no filament: the owner asked for
// a single source that radiates out very subtly.
function lampLight(c, lv, tone) {
  return lightHTML({ kind: 'lamp', level: lv, ...tone, name: 'lamp', night: nightNow(c) });
}
// Repaint the light for level v in place, so it rides its own transition (and none at all under a finger, where the
// light is locked to it: light.css).
function paintLight(page, v) {
  if (!page) return;
  const tone = page.dataset.hex ? { hex: page.dataset.hex } : { kelvin: Number(page.dataset.kelvin) || 2700 };
  setLight(page.querySelector('[data-light="lamp"]'), { level: v, ...tone, night: page.dataset.night === '1' });
}

// The drawing at the top of a device's page, sized to what it is: a table lamp, a desk lamp, a sconce or a bulb 72
// tall, a floor lamp 88, a pendant or a chandelier 80 hanging from the top of the screen, a strip a 120 x 16 bar, a
// fan 80, a shade's window 88 (the owner found the old 180 far too big for most lights). [width, height, hangs, and
// where the drawing ends, as a share of its height, when that is well short of its box: a ceiling fan's blades are in
// its top half, so it rests on the name by its blades rather than by the empty half under them]
const HERO = {
  'light-floor-lamp': [88, 88], 'light-torchiere': [88, 88], 'light-arc-lamp': [88, 88], 'light-tree-lamp': [88, 88],
  'light-pendant': [80, 80, true], 'light-chandelier': [80, 80, true],
  'light-ceiling-fan': [80, 80, false, 0.5], 'lutron-rollershades': [88, 88], 'light-tape-light': [120, 16],
};
// Where it sits: resting on the room's name 14 above it, except a hanging one, which hangs between the header's
// circles from just under the status bar. The name, the title and everything under them move up together by what the
// drawing gave back, up to 56 (80 under a hanging one, which is out of their way), keeping the drawing clear of the
// header's circles and leaving no gap in the page. --lamp-y is where the light is centred: the middle of the drawing,
// or a hanging one's shade, low in it.
const LIFT = 56, HANG_LIFT = 80, HANG_TOP = 16;
function heroGeo(art) {
  const [w, h, hangs, ends = 1] = HERO[art] || [72, 72];
  const lift = hangs ? HANG_LIFT : Math.min(LIFT, 180 - h);
  const top = hangs ? HANG_TOP : Math.round(226 - lift - h * ends);
  const y = hangs ? top + h * 0.6 : top + h * ends / 2;
  return { w, h, lift, top, y, style: `--art-w:${w}px;--art-h:${h}px;--art-top:${top}px;--lift:${lift}px;--lamp-y:${Math.round(y)}px` };
}
for (const n of [...Object.keys(HERO), 'light-table-lamp', 'light-desk-lamp', 'light-bedside-lamp', 'light-reading-lamp', 'light-wall-sconce',
  'light-downlight', 'light-track-light', 'light-puck-lights', 'light-porch-lantern', 'lutron-lamps', 'lutron-dimmer']) loadArt(n);
// A strip or a cove is a bar of light, drawn in the house's icon line: its body and the points of light along it.
// Anything else is its own drawing, inline so its line keeps the house's weight at this size (art.js).
function heroArt(c, art) {
  if (art !== 'light-tape-light') {
    const [w, h] = HERO[art] || [72, 72];
    // (the drawings are fetched when this module loads; one not here yet is the plain image this once)
    return artInline(art, w, h) || `<img class="hero-art" src="${c.artSrc(art)}" alt="">`;
  }
  const dots = [24, 42, 60, 78, 96].map(x => `<circle cx="${x}" cy="8" r="1.5" fill="white"/>`).join('');
  return `<svg class="hero-art bar" viewBox="0 0 120 16" width="120" height="16" fill="none" aria-hidden="true"><rect x="1.5" y="1.5" width="117" height="13" rx="6.5" stroke="white" stroke-width="2.75"/>${dots}</svg>`;
}
function dialHTML(c, lv, tone) {
  const { icon } = c;
  const [kx, ky] = arcPoint(lv);
  // The arc is a flat fill of the lamp's own light: copper for a white, a colour lamp's colour for a colour lamp.
  const arc = tone.hex || '#D98A4E';
  // The label is only ever "Brightness": the light's name is the page's title, and a long one under the dial was cut.
  return `<div class="dial shifted ${lv >= 50 ? 'bright' : ''}" data-drag="dial" role="slider" aria-label="Brightness" aria-valuemin="1" aria-valuemax="100" aria-valuenow="${lv}"
    style="--kx:${kx.toFixed(1)}px;--ky:${ky.toFixed(1)}px">
    <svg viewBox="0 0 340 190" width="340" height="190" aria-hidden="true">
      <path class="trk" d="M20 170 A150 150 0 0 1 320 170"/>
      <path class="fil" d="${arcPath(lv)}" stroke="${c.esc(arc)}" ${lv > 0 ? '' : 'visibility="hidden"'}/>
      <circle class="kn" cx="${kx.toFixed(2)}" cy="${ky.toFixed(2)}" r="12"/>
    </svg>
    <span class="ktouch" aria-hidden="true"></span>
    <span class="kgrab" aria-hidden="true"></span>
    <div class="lbl">Brightness</div>
    <div class="num"><b>${lv}</b><span>%</span></div>
    <button class="nudge minus" data-act="nudge" data-by="-5" aria-label="Dimmer">${icon('minus', 20, 1.7)}</button>
    <button class="nudge plus" data-act="nudge" data-by="5" aria-label="Brighter">${icon('plus', 20, 1.7)}</button>
  </div>`;
}

// A long name steps down a size, then another, before it has to end in an ellipsis: on a small phone the line holds
// fourteen to sixteen letters of Figtree at 44, eighteen to twenty at 36 and twenty-two to twenty-five at 30, so
// "Pendant over the kitchen island" no longer says only "Pendant ove...". The steps take the fewest: at 36 a name of
// 21 or 22 letters ("Kitchen island pendant") was still cut, and at 30 it is whole.
const heroFit = name => (name.length > 18 ? 'fit2' : name.length > 14 ? 'fit1' : '');

function header(c, d) {
  const { icon, esc } = c;
  return `<header class="hdr">
    <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
    ${pinButton(c, `d:${d.device_id}`, d.name)}
    <button class="hdr-btn a1" data-go="light/${esc(d.device_id)}/about" aria-label="About this ${d.domain === 'fan' ? 'fan' : d.domain === 'cover' ? 'shade' : 'light'}">${icon('dots', 22, 1.7)}</button>
  </header>`;
}

// The pill's circle says whether it is on; a second line is there only for a live value (the time left, Paused).
function feature(c, { act, go, glyph, title, sub, on, disabled }) {
  return `<button class="feat ${on ? 'on' : ''}" ${act ? `data-act="${act}"` : ''} ${go ? `data-go="${c.esc(go)}"` : ''} ${disabled ? 'disabled' : ''}>
    <span class="c">${c.icon(glyph, 20, 1.7)}</span><span class="t">${c.esc(title)}</span>${sub ? `<span class="d">${c.esc(sub)}</span>` : ''}</button>`;
}

function timerLine(c, id) {
  for (const [t, v] of Object.entries(c.S.timers || {})) {
    if (!v || !v.ends_at) continue;
    if (c.data.targetDevices(t.includes('|') ? t.split('|') : t).includes(id)) {
      const m = Math.max(1, Math.round((endsMs(v.ends_at) - Date.now()) / 60000));
      return `${m} min left`;
    }
  }
  return null;
}

// ---------- the page ----------
export function view(c, r) {
  const d = c.data.dev(r.id);
  if (!d) return `<div class="dev gone"><header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${c.icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">That light is gone</h1></div>`;
  if (r.sub === 'follow' || r.sub === 'follow/also') return followView(c, r, d);
  if (d.domain === 'fan') return fanView(c, d);
  if (d.domain === 'cover') return shadeView(c, d);
  return lightView(c, d);
}

function lightView(c, d) {
  const { data, icon, esc, S } = c;
  const id = d.device_id;
  const lv = data.level(id) || 0;
  const on = lv > 0;
  const dim = d.domain === 'light';
  const col = (S.states[id] || {}).color || null;
  const showingWhite = on && col && col.mode === 'ct' && col.kelvin;
  const showingColour = on && col && col.mode === 'xy' && col.hex;
  const tl = on ? timerLine(c, id) : null;
  const follow = c.DAY.canFollow(d);
  const following = follow && c.DAY.isFollowing(id);
  const tone = toneOf(c, id);
  // Off, the dial still shows where the light will come back to, greyed (the level On gives it: the evening's, at night)
  const dialAt = on ? lv : Math.max(1, Math.min(100, Math.round(c.onLevel(id, `d:${id}`)) || 100));
  const looks = [];
  if (d.ct) {
    const k = showingWhite ? Math.round(col.kelvin / 100) * 100 : null;
    looks.push(`<button class="look ${showingWhite ? 'showing' : ''}" data-go="light/${esc(id)}/white">
      <span class="c">${icon('sun', 20, 1.7)}</span>
      <span class="t">White</span>${k ? `<span class="d">${k}K · ${esc(CasetaDaylight.warmthName(col.kelvin))}</span>` : ''}</button>`);
  }
  if (d.color) {
    looks.push(`<button class="look ${showingColour ? 'showing' : ''}" data-go="light/${esc(id)}/colour">
      <span class="c" ${showingColour ? `style="background:${esc(col.hex)}"` : ''}>${icon('palette', 20, 1.7)}</span>
      <span class="t">Colour</span>${showingColour ? `<span class="d">${esc(colourName(col.hex))}</span>` : ''}</button>`);
  }
  const feats = [];
  if (follow) feats.push(feature(c, { go: `light/${id}/follow`, glyph: 'sunrise', title: 'Follow the day', sub: following && c.DAY.followPaused(id) ? 'Paused' : '', on: following }));
  feats.push(feature(c, { go: `light/${id}/timer`, glyph: 'timer', title: 'Sleep timer', sub: tl, on: !!tl, disabled: !on && !tl }));
  // the page closes up where a lamp has no white or colour: the pills and the dial sit under the switch instead
  const shift = looks.length ? 0 : -144;
  // an on-or-off switch has no level: its light is either whole or none
  const shown = dim ? lv : on ? 100 : 0;
  const art = c.deviceArt(c, d), geo = heroGeo(art);
  return `<div class="dev ${on ? 'on' : ''}" style="--shift:${shift}px;${geo.style}" ${tone.hex ? `data-hex="${esc(tone.hex)}"` : `data-kelvin="${Math.round(tone.kelvin)}"`} data-night="${nightNow(c) ? 1 : 0}">
    ${lampLight(c, shown, tone)}
    ${heroArt(c, art)}
    ${header(c, d)}
    <div class="where">${esc(data.devAreaName(d) || '')}</div>
    <h1 class="t-hero ${heroFit(d.name)}">${esc(d.name)}</h1>
    <div class="onoff">
      <button data-act="dev-on" aria-pressed="${on}">${icon('power', 22, 2)}<span>On</span></button>
      <button data-act="dev-off" aria-pressed="${!on}">${icon('power', 22, 2)}Off</button>
      <span class="onoff-pill ${on ? '' : 'off'}" aria-hidden="true"></span>
    </div>
    ${looks.length ? `<div class="looks">${looks.join('')}</div>` : ''}
    <div class="feats shifted">${feats.join('')}</div>
    ${dim ? dialHTML(c, dialAt, tone) : ''}
  </div>`;
}

function fanView(c, d) {
  const { data, icon, esc, S } = c;
  const id = d.device_id;
  const sp = data.isOn(id) ? ((S.states[id] || {}).fan_speed || 'Medium') : 'Off';
  const idx = Math.max(0, FAN.findIndex(([k]) => k === sp));
  const on = idx > 0;
  const tl = on ? timerLine(c, id) : null;
  const bars = FAN.map(([k, label], i) => `<button class="step ${i <= idx ? 'fill' : ''} ${i === idx ? 'sel' : ''}" data-act="fan-speed" data-speed="${k}" style="left:calc(50% - 146px + ${i * 62}px);top:${250 - i * 32}px;height:${40 + i * 32}px" aria-label="${FAN_WORD[k]}" aria-pressed="${i === idx}"></button>
    <span class="steplbl ${i === idx ? 'sel' : ''}" style="left:calc(50% - 124px + ${i * 62}px)">${label}</span>`).join('');
  return `<div class="dev is-fan ${on ? 'on' : ''}" style="${heroGeo('light-ceiling-fan').style}">
    ${heroArt(c, 'light-ceiling-fan')}
    ${header(c, d)}
    <div class="where">${esc(data.devAreaName(d) || '')}</div>
    <h1 class="t-hero ${heroFit(d.name)}">${esc(d.name)}</h1>
    <div class="onoff blue">
      <button data-act="dev-on" aria-pressed="${on}">${icon('power', 22, 2)}On</button>
      <button data-act="dev-off" aria-pressed="${!on}">${icon('power', 22, 2)}Off</button>
      <span class="onoff-pill ${on ? '' : 'off'}" aria-hidden="true"></span>
    </div>
    <div class="feats">
      ${feature(c, { go: `light/${id}/timer`, glyph: 'timer', title: 'Sleep timer', sub: tl, on: !!tl, disabled: !on && !tl })}
    </div>
    <div class="speeds">
      <div class="lbl">Speed</div>
      <div class="big">${FAN_WORD[sp]}</div>
      ${bars}
      <button class="nudge minus" data-act="fan-step" data-by="-1" aria-label="Slower">${icon('minus', 22, 1.7)}</button>
      <button class="nudge plus" data-act="fan-step" data-by="1" aria-label="Faster">${icon('plus', 22, 1.7)}</button>
    </div>
  </div>`;
}

function shadeView(c, d) {
  const { data, icon, esc } = c;
  const id = d.device_id;
  const open = Math.max(0, Math.min(100, data.level(id) ?? 0));
  const moving = c.ui.moving && c.ui.moving[id] && Date.now() - c.ui.moving[id] < 30000;
  return `<div class="dev is-shade ${open > 0 ? 'on' : ''}" style="--down:${100 - open};${heroGeo('lutron-rollershades').style}">
    ${heroArt(c, 'lutron-rollershades')}
    ${header(c, d)}
    <div class="where">${esc(data.devAreaName(d) || '')}</div>
    <h1 class="t-hero ${heroFit(d.name)}">${esc(d.name)}</h1>
    <div class="window" data-drag="shade" role="slider" aria-label="How far open" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${open}">
      <span class="sun"></span><span class="sill"></span>
      <span class="fabric"><span class="hem"></span></span><span class="roller"></span>
      <span class="handle"><i></i></span><span class="hem-grab" aria-hidden="true"></span>
    </div>
    <div class="readout"><span class="tick"></span><b data-open>${open}%</b><span>open</span></div>
    <div class="shade-btns">
      <button class="sbtn" data-act="shade" data-cmd="raise" aria-label="Open"><span class="c">${icon('chev', 24, 1.8).replace('<g ', '<g transform="rotate(-90 12 12)" ')}</span><span class="l">Open</span></button>
      <button class="sbtn stop ${moving ? 'moving' : ''}" data-act="shade" data-cmd="stop" aria-label="Stop"><span class="c"><i></i></span><span class="l">Stop</span></button>
      <button class="sbtn" data-act="shade" data-cmd="lower" aria-label="Close"><span class="c">${icon('chevD', 24, 1.8)}</span><span class="l">Close</span></button>
    </div>
  </div>`;
}

// ---------- dragging ----------
export function after(c, r, root) {
  const d = c.data.dev(r.id); if (!d) return;
  if (r.sub === 'follow') followAfter(c, r, root);
  const id = d.device_id;
  if (d.domain === 'light') { const el = root.querySelector('[data-drag="dial"]'); const set = wireDial(c, id, el); glide(c, id, el); wireNudges(c, id, el, set); }
  if (d.domain === 'cover') wireShade(c, id, root.querySelector('[data-drag="shade"]'));
}

// The dial never jumps. Whatever it last showed, it moves from there to the level now: a tap on On, the bridge
// answering with the evening's 30% after a light came on, a scene arriving. Things the app decides happen slowly:
// the dimmer's 0.4 s EASE_IN_AND_OUT for one light, the scene's 1.0 s while a scene arrives. Under a finger it is
// the finger's (set() writes `shown` as it paints).
const shown = {};
let tween = 0;
const easeInOut = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function glide(c, id, el) {
  cancelAnimationFrame(tween);
  if (!el) return;
  const to = Number(el.getAttribute('aria-valuenow')) || 0;
  const from = shown[id];
  shown[id] = to;
  // a light turned off does not swing its dial: it greys where it stands and shows where it will come back to
  if (from == null || from === to || c.ui.dragging || reduced() || !el.closest('.dev.on')) return;
  const ms = document.body.classList.contains('scene-arriving') ? 1000 : 400;
  const t0 = performance.now();
  // the light itself fades on the dimmer by its own transitions; only the dial is stepped here
  paintDial(el, from, false); shown[id] = from;
  const step = now => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - t0) / ms);
    const v = Math.round(from + (to - from) * easeInOut(t));
    paintDial(el, v, false); shown[id] = v;
    if (t < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// Leaving a light's page forgets what its dial showed, so coming back does not glide from an old level.
export function leave() { cancelAnimationFrame(tween); for (const k of Object.keys(shown)) delete shown[k]; }

function paintDial(el, v, light = true) {
  const [kx, ky] = arcPoint(v);
  const fil = el.querySelector('.fil'), kn = el.querySelector('.kn');
  fil.setAttribute('d', arcPath(v)); fil.setAttribute('visibility', v > 0 ? 'visible' : 'hidden');
  kn.setAttribute('cx', kx.toFixed(2)); kn.setAttribute('cy', ky.toFixed(2));
  el.style.setProperty('--kx', `${kx.toFixed(1)}px`); el.style.setProperty('--ky', `${ky.toFixed(1)}px`);
  el.classList.toggle('bright', v >= 50);
  // the number steps with the finger (M6: no easing, it is the finger's)
  el.querySelector('.num b').textContent = v;
  el.setAttribute('aria-valuenow', v);
  if (light) paintLight(el.closest('.dev'), v);
}

function wireDial(c, id, el) {
  if (!el) return;
  const svg = el.querySelector('svg');
  const at = e => {
    const b = svg.getBoundingClientRect(); const s = b.width / 340;
    const cx = b.left + CX * s, cy = b.top + CY * s;
    let a = Math.atan2(cy - e.clientY, e.clientX - cx);
    if (a < 0) a = e.clientX < cx ? Math.PI : 0;
    return Math.round((1 - a / Math.PI) * 100);
  };
  const near = e => { const b = svg.getBoundingClientRect(); const s = b.width / 340; const dx = e.clientX - (b.left + CX * s), dy = e.clientY - (b.top + CY * s); const r = Math.hypot(dx, dy) / s; return r > 100 && r < 200 && dy < 20 * s; };
  // The dial bottoms out at 1%: a slip can dim a light but never switch it off mid-drag. Off is the pill's Off
  // half, one deliberate tap (design-v7-ux.md, 3; the dial used to reach 0).
  const set = v => {
    v = Math.max(1, Math.min(100, v));
    cancelAnimationFrame(tween);
    const page = el.closest('.dev');
    page.classList.add('on');
    paintDial(el, v); shown[id] = v;
    c.assume([id], v, { held: true });
    c.gate.sendLevel(`d:${id}`, v);
  };
  // The knob takes a finger straight away, in any direction. Anywhere else on the arc only a sideways drag
  // moves it, so a thumb scrolling the page over the dial scrolls the page. A tap sets nothing: the - and +
  // beside it are for that. While a finger is on it the light is locked to the finger (light.css, .held).
  const hold = on => el.closest('.dev').classList.toggle('held', on);
  track(el, { c, axis: 'x', accept: e => e.target.classList.contains('kgrab') || near(e), grab: e => e.target.classList.contains('kgrab'), start: () => hold(true), end: () => hold(false), move: e => set(at(e)) });
  el.addEventListener('lostpointercapture', () => hold(false));
  return set;
}

// Holding minus dims steadily down to 1%, never to off; holding plus brightens steadily. A tap is still a nudge.
let nudgeHeldAt = 0;
function wireNudges(c, id, el, set) {
  if (!el || !set) return;
  for (const b of el.querySelectorAll('.nudge')) {
    let wait = 0, rep = 0;
    const stop = () => {
      clearTimeout(wait); wait = 0;
      if (!rep) return;
      clearInterval(rep); rep = 0; nudgeHeldAt = Date.now();
      el.closest('.dev').classList.remove('held');
      c.endDrag();
    };
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const by = Number(b.dataset.by) > 0 ? 1 : -1;
      wait = setTimeout(() => {
        // a lamp that is off is not brought on by holding minus
        if (by < 0 && !el.closest('.dev.on')) return;
        c.ui.dragging = true;
        el.closest('.dev').classList.add('held');
        rep = setInterval(() => set((Number(el.getAttribute('aria-valuenow')) || 0) + by * 2), 70);
      }, 450);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, stop);
  }
}

function wireShade(c, id, el) {
  if (!el) return;
  const at = e => { const b = el.getBoundingClientRect(); return Math.round(100 - Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) * 100); };
  const set = v => {
    const page = el.closest('.dev');
    page.style.setProperty('--down', 100 - v);
    page.querySelector('[data-open]').textContent = `${v}%`;
    el.setAttribute('aria-valuenow', v);
    c.assume([id], v, { held: true });
    c.gate.sendLevel(`d:${id}`, v);
  };
  // the shade moves by its hem: a finger on the hem takes it up or down; anywhere else on the window scrolls
  track(el, { c, grab: e => !!e.target.closest('.hem-grab'), start: () => el.classList.add('held'), move: e => set(at(e)) });
}

// ---------- taps ----------
export const actions = {
  ...lookActions,
  ...aboutActions,
  ...followActions,
  'dev-on'(c, el, r) {
    const d = c.data.dev(r.id); if (!d || c.data.isOn(r.id)) return;
    if (d.domain === 'fan') { fanTo(c, r.id, 'Medium'); return; }
    c.turn({ type: 'level', target: `d:${r.id}`, level: 'on' });
  },
  'dev-off'(c, el, r) {
    const d = c.data.dev(r.id); if (!d || !c.data.isOn(r.id)) return;
    if (d.domain === 'fan') { fanTo(c, r.id, 'Off'); return; }
    c.turn({ type: 'level', target: `d:${r.id}`, level: 'off' });
  },
  nudge(c, el, r) {
    if (Date.now() - nudgeHeldAt < 500) return;   // the lift that ends a hold is not a tap as well
    const v = Math.max(1, Math.min(100, (c.data.level(r.id) || 0) + Number(el.dataset.by)));
    // held like the dial's own level, so the bridge's report of the level it left does not pull the number back
    c.assume([r.id], v, { held: true }); c.soon();
    c.gate.sendLevel(`d:${r.id}`, v);
  },
  'fan-speed'(c, el, r) { fanTo(c, r.id, el.dataset.speed); },
  'fan-step'(c, el, r) {
    const sp = c.data.isOn(r.id) ? ((c.S.states[r.id] || {}).fan_speed || 'Medium') : 'Off';
    const i = Math.max(0, Math.min(FAN.length - 1, FAN.findIndex(([k]) => k === sp) + Number(el.dataset.by)));
    fanTo(c, r.id, FAN[i][0]);
  },
  shade(c, el, r) {
    const cmd = el.dataset.cmd;
    c.ui.moving = c.ui.moving || {};
    if (cmd === 'stop') delete c.ui.moving[r.id]; else c.ui.moving[r.id] = Date.now();
    c.run({ type: cmd, target: `d:${r.id}` });
    c.soon();
  },
};

function fanTo(c, id, speed) {
  c.S.states[id] = { ...(c.S.states[id] || {}), fan_speed: speed, level: speed === 'Off' ? 0 : 100 };
  c.soon();
  c.run({ type: 'fan', target: `d:${id}`, speed });
}
