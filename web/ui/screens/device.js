// A device's own page, pushed from a tile: 04 Light (12731:22), 17 Fan (12744:111211), 18 Shade (12744:111298).
// No tab bar on any of them, as the file draws them. The white, colour, sleep timer, Follow the day and "about"
// pages hang off a light as #light/<id>/<page>.
import { track } from '/ui/gesture.js';
import { CasetaDaylight } from '/data/index.js';
import { glowHTML, setGlow, whiteStops, colourStops } from '/ui/glow.js';
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
// The five swatches on the Colour tile, from the file's twelve lamp colours.
const TILE_SWATCHES = ['#FF5A4E', '#FFC24A', '#4FD39A', '#4C8DFF', '#A66BFF'];

// ---------- the arc ----------
// A half circle round (170, 170) of radius 150 inside a 340 x 190 box: 0% at the left end, 100% at the right.
const CX = 170, CY = 170, R = 150;
function arcPoint(p) { const a = Math.PI * (1 - p / 100); return [CX + R * Math.cos(a), CY - R * Math.sin(a)]; }
function arcPath(p) { const [x, y] = arcPoint(p); return `M20 170 A150 150 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`; }
const rgba = (h, a) => { const x = String(h).replace('#', ''); return `rgba(${[0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)).join(',')},${a})`; };

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
// The strength of a light at level v, over its strength at 75%: the filament and the floor pool follow the halo's
// own curve (A lighting system, 3), so at 20% everything is at the 0.57 the file's dial demo shows.
const strength = v => Math.min(1, (0.35 + 0.65 * Math.max(0, v) / 100) / 0.84);
// The halo (three layers, hero scale), the pool of light on the floor under the lamp, and the filament that lights
// the bulb from inside. All three are drawn from the light's real level and colour; off draws none of them.
function lampLight(c, id, lv, tone) {
  const st = tone.hex ? colourStops(tone.hex) : whiteStops(tone.kelvin);
  const glow = glowHTML({ level: lv, ...tone, ctx: 'hero', y: 112, name: 'lamp', night: nightNow(c) })
    // a new colour crossfades, it never slides (motion.js carries data-xf over the dimmer)
    .replace('<span class="glow', '<span data-xf="" class="glow');
  return `<span class="halo lamp-halo" aria-hidden="true">${glow}<i class="lamp-pool" style="${poolStyle(lv, st)}"></i></span>`;
}
function poolStyle(lv, st) { return `--pool-w:${Math.round(120 + 180 * lv / 100)}px;--pool-c:${rgba(st.body, (0.5 * strength(lv)).toFixed(3))}`; }
function filamentHTML(lv, tone) {
  const core = tone.hex ? colourStops(tone.hex).core : '#FFF1DC';
  return `<i class="lamp-filament" aria-hidden="true" style="--fil-c:${rgba(core, 0.45)};--fil-o:${lv > 0 ? strength(lv).toFixed(3) : 0}"></i>`;
}
// Repaint the light for level v in place, so its layers ride their own transitions (and none at all under a finger,
// where the light is locked to it: light.css).
function paintLight(page, v) {
  if (!page) return;
  const tone = page.dataset.hex ? { hex: page.dataset.hex } : { kelvin: Number(page.dataset.kelvin) || 2700 };
  setGlow(page.querySelector('[data-glow="lamp"]'), { level: v, ...tone, ctx: 'hero', night: page.dataset.night === '1' });
  const st = tone.hex ? colourStops(tone.hex) : whiteStops(tone.kelvin);
  const pool = page.querySelector('.lamp-pool'); if (pool) pool.setAttribute('style', poolStyle(v, st));
  const fil = page.querySelector('.lamp-filament'); if (fil) fil.style.setProperty('--fil-o', v > 0 ? strength(v).toFixed(3) : 0);
}
function dialHTML(c, lv, tone, label) {
  const { icon } = c;
  const [kx, ky] = arcPoint(lv);
  // The arc is the lamp's own light: copper for a white, as built; a colour lamp's arc runs from its tint's glow
  // through the colour to its deep stop, so the dial is lit by the lamp it sets.
  const st = tone.hex ? colourStops(tone.hex) : null;
  const stops = st ? [st.core, tone.hex, st.wash] : ['#F6E3CF', '#E8A774', '#D98A4E'];
  const body = st ? tone.hex : whiteStops(tone.kelvin).body;
  return `<div class="dial shifted ${lv >= 50 ? 'bright' : ''}" data-drag="dial" role="slider" aria-label="Brightness" aria-valuemin="1" aria-valuemax="100" aria-valuenow="${lv}"
    style="--kx:${kx.toFixed(1)}px;--ky:${ky.toFixed(1)}px;--kglow:${rgba(body, 0.3)};--numglow:${rgba(body, 0.25)}">
    <span class="kglow" aria-hidden="true"></span>
    <svg viewBox="0 0 340 190" width="340" height="190" aria-hidden="true">
      <defs><linearGradient id="dialgrad" x1="20" y1="170" x2="150.919" y2="-53.421" gradientUnits="userSpaceOnUse">
        <stop stop-color="${stops[0]}"/><stop offset=".45" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/></linearGradient></defs>
      <path class="trk" d="M20 170 A150 150 0 0 1 320 170"/>
      <path class="fil" d="${arcPath(lv)}" stroke="url(#dialgrad)" ${lv > 0 ? '' : 'visibility="hidden"'}/>
      <circle class="kn" cx="${kx.toFixed(2)}" cy="${ky.toFixed(2)}" r="12"/>
    </svg>
    <span class="ktouch" aria-hidden="true"></span>
    <span class="kgrab" aria-hidden="true"></span>
    <div class="lbl">${c.esc(label || 'Brightness')}</div>
    <div class="num"><b>${lv}</b><span>%</span></div>
    <button class="nudge minus" data-act="nudge" data-by="-5" aria-label="Dimmer">${icon('minus', 20, 1.7)}</button>
    <span class="lo">${icon('moon', 22, 1.7)}</span><span class="hi">${icon('sun', 22, 1.7)}</span>
    <button class="nudge plus" data-act="nudge" data-by="5" aria-label="Brighter">${icon('plus', 20, 1.7)}</button>
  </div>`;
}

// A long name steps down a size, then another, before it has to end in an ellipsis: at 44 the line holds about
// twelve letters on a small phone, so "Pendant over the kitchen island" said only "Pendant ove...".
const heroFit = name => (name.length > 22 ? 'fit2' : name.length > 14 ? 'fit1' : '');

function header(c, d) {
  const { icon, esc } = c;
  return `<header class="hdr">
    <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
    ${pinButton(c, `d:${d.device_id}`, d.name)}
    <button class="hdr-btn a1" data-go="light/${esc(d.device_id)}/about" aria-label="About this ${d.domain === 'fan' ? 'fan' : d.domain === 'cover' ? 'shade' : 'light'}">${icon('dots', 22, 1.7)}</button>
  </header>`;
}

function feature(c, { act, go, glyph, title, sub, on, disabled }) {
  return `<button class="feat ${on ? 'on' : ''}" ${act ? `data-act="${act}"` : ''} ${go ? `data-go="${c.esc(go)}"` : ''} ${disabled ? 'disabled' : ''}>
    <span class="c">${c.icon(glyph, 20, 1.7)}</span><span class="t">${c.esc(title)}</span><span class="d">${c.esc(sub)}</span></button>`;
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
  if (!d) return `<div class="dev"><header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${c.icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">That light is gone</h1><p class="t-body muted soon">It is no longer in your home.</p></div>`;
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
  // following the day, the halo is the curve's white right now, and the line under Brightness says which
  const followLine = on && following && !c.DAY.followPaused(id) && col && col.mode === 'ct' && col.kelvin ? `Following the day · ${Math.round(col.kelvin / 100) * 100}K now` : '';
  const looks = [];
  if (d.ct) {
    const k = showingWhite ? Math.round(col.kelvin / 100) * 100 : null;
    looks.push(`<button class="look ${showingWhite ? 'showing' : ''}" data-go="light/${esc(id)}/white">
      <span class="c">${icon('sun', 20, 1.7)}</span>${showingWhite ? '<span class="tag">Showing</span>' : ''}
      <span class="t">White</span><span class="d ${k ? '' : 'q'}">${k ? `${k}K · ${esc(CasetaDaylight.warmthName(col.kelvin))}` : 'Warm to daylight'}</span></button>`);
  }
  if (d.color) {
    looks.push(`<button class="look ${showingColour ? 'showing' : ''}" data-go="light/${esc(id)}/colour">
      <span class="c" ${showingColour ? `style="background:${esc(col.hex)}"` : ''}>${icon('palette', 20, 1.7)}</span>${showingColour ? '<span class="tag">Showing</span>' : `<span class="sw">${TILE_SWATCHES.map(h => `<i style="background:${h}"></i>`).join('')}</span>`}
      <span class="t">Colour</span><span class="d ${showingColour ? '' : 'q'}">${showingColour ? 'Your colour' : 'Any colour'}</span></button>`);
  }
  const feats = [];
  if (follow) feats.push(feature(c, { go: `light/${id}/follow`, glyph: 'sunrise', title: 'Follow the day', sub: following ? (c.DAY.followPaused(id) ? 'Paused' : 'On') : 'Off', on: following }));
  feats.push(feature(c, { go: `light/${id}/timer`, glyph: 'timer', title: 'Sleep timer', sub: tl || 'Off', on: !!tl, disabled: !on && !tl }));
  // the page closes up where a lamp has no white or colour: the pills and the dial sit under the switch instead
  const shift = looks.length ? 0 : -144;
  // an on-or-off switch has no level: its light is either whole or none
  const shown = dim ? lv : on ? 100 : 0;
  return `<div class="dev ${on ? 'on' : ''}" style="--shift:${shift}px" ${tone.hex ? `data-hex="${esc(tone.hex)}"` : `data-kelvin="${Math.round(tone.kelvin)}"`} data-night="${nightNow(c) ? 1 : 0}">
    ${lampLight(c, id, shown, tone)}
    <img class="hero-art" src="${c.artSrc(c.deviceArt(c, d))}" alt="">
    ${filamentHTML(shown, tone)}
    ${header(c, d)}
    <div class="where">${esc(data.devAreaName(d) || '')}</div>
    <h1 class="t-hero ${heroFit(d.name)}">${esc(d.name)}</h1>
    <div class="onoff">
      <button data-act="dev-on" aria-pressed="${on}">${icon('power', 22, 2)}<span>${on && dim ? `On · <span data-lv>${lv}</span>%` : 'On'}</span></button>
      <button data-act="dev-off" aria-pressed="${!on}">${icon('power', 22, 2)}Off</button>
      <span class="onoff-pill ${on ? '' : 'off'}" aria-hidden="true"></span>
    </div>
    ${looks.length ? `<div class="looks">${looks.join('')}</div>` : ''}
    <div class="feats shifted">${feats.join('')}</div>
    ${dim ? dialHTML(c, dialAt, tone, followLine) : ''}
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
  return `<div class="dev is-fan ${on ? 'on' : ''}">
    <span class="halo"></span>
    <img class="hero-art" src="${c.artSrc('light-ceiling-fan')}" alt="">
    ${header(c, d)}
    <div class="where">${esc(data.devAreaName(d) || '')}</div>
    <h1 class="t-hero ${heroFit(d.name)}">${esc(d.name)}</h1>
    <div class="onoff blue">
      <button data-act="dev-on" aria-pressed="${on}">${icon('power', 22, 2)}${on ? `On · ${FAN_WORD[sp]}` : 'On'}</button>
      <button data-act="dev-off" aria-pressed="${!on}">${icon('power', 22, 2)}Off</button>
      <span class="onoff-pill ${on ? '' : 'off'}" aria-hidden="true"></span>
    </div>
    <div class="feats fan-feats">
      ${feature(c, { go: `light/${id}/timer`, glyph: 'timer', title: 'Sleep timer', sub: tl || 'Off', on: !!tl, disabled: !on && !tl })}
      ${feature(c, { glyph: 'moon', title: 'Goodnight', sub: 'Stops with it', on: false })}
    </div>
    <div class="speeds">
      <div class="lbl">Speed</div>
      <div class="big">${FAN_WORD[sp]}</div>
      ${bars}
      <button class="nudge minus" data-act="fan-step" data-by="-1" aria-label="Slower">${icon('minus', 22, 1.7)}</button>
      <span class="fa lo">${icon('fan', 24, 1.7)}</span><span class="fa hi">${icon('fan', 24, 1.7)}</span>
      <button class="nudge plus" data-act="fan-step" data-by="1" aria-label="Faster">${icon('plus', 22, 1.7)}</button>
    </div>
  </div>`;
}

function shadeView(c, d) {
  const { data, icon, esc } = c;
  const id = d.device_id;
  const open = Math.max(0, Math.min(100, data.level(id) ?? 0));
  const moving = c.ui.moving && c.ui.moving[id] && Date.now() - c.ui.moving[id] < 30000;
  return `<div class="dev is-shade ${open > 0 ? 'on' : ''}" style="--down:${100 - open}">
    <span class="halo"></span>
    <img class="hero-art" src="${c.artSrc('lutron-rollershades')}" alt="">
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
    <div class="group shade-gn"><div class="row has-ic"><span class="row-ic">${icon('moon', 20, 1.7)}</span><span class="row-txt"><span class="t">Closes with Goodnight</span></span><span class="row-val">Always</span></div></div>
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
  const lvl = document.querySelector('.dev [data-lv]'); if (lvl) lvl.textContent = v;
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
    c.assume([r.id], d.domain === 'light' ? c.onLevel(r.id, `d:${r.id}`) : 100); c.soon();
    c.run({ type: 'level', target: `d:${r.id}`, level: 'on' });
  },
  'dev-off'(c, el, r) {
    const d = c.data.dev(r.id); if (!d || !c.data.isOn(r.id)) return;
    if (d.domain === 'fan') { fanTo(c, r.id, 'Off'); return; }
    c.assume([r.id], 0); c.soon();
    c.run({ type: 'level', target: `d:${r.id}`, level: 'off' });
  },
  nudge(c, el, r) {
    if (Date.now() - nudgeHeldAt < 500) return;   // the lift that ends a hold is not a tap as well
    const v = Math.max(1, Math.min(100, (c.data.level(r.id) || 0) + Number(el.dataset.by)));
    c.assume([r.id], v); c.soon();
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
