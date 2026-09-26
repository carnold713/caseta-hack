// Widgets (the Android app only). #widgets lists the ones on this phone's home screen and the ten there are, each
// with Add, which asks Android to place it. #widgets/<id> is one widget's page: what it shows and how it looks, with a
// live picture of it at the top. Every choice is saved as it is made and the widget on the home screen redraws at
// once (native.js setWidget); Done goes back, to the home screen when the widget's own setup opened the app.
//
// Its choices live on the phone (the widget is the phone's), never in the house's config. In a browser the page
// says where widgets live and changes nothing.
import * as native from '/ui/native.js';
import { model as homeModel, state as homeState } from '/ui/widgetdata.js';
import { LAMP_COLOURS, WHITES, kelvinHex } from '/ui/colour.js';

export let noTabs = false;

// The ten, in the order the widget picker shows them: [kind, name, what it is, glyph]
export const KINDS = [
  ['room', 'Room', 'On and off, dimmer and brighter', 'grid'],
  ['light', 'Light', 'One light, in its own colour while on', 'bulb'],
  ['scenes', 'Scenes', 'One to six scenes, a tap each', 'sparkle'],
  ['house', 'Whole house', 'How many are on, and All off', 'home'],
  ['levels', 'Brightness', 'A light or a room at set steps', 'sun'],
  ['timer', 'Sleep timer', 'Fade out in 15, 30 or 60 minutes', 'timer'],
  ['nightstand', 'Nightstand', 'The night light, dim, with a timer', 'moon'],
  ['routine', 'Next routine', 'What runs next, with Skip tonight', 'clock'],
  ['pinned', 'Pinned', 'What is pinned on Home', 'pin'],
  ['colour', 'Colours', 'Colours for a colour lamp', 'palette'],
];
const KIND = Object.fromEntries(KINDS.map(k => [k[0], k]));
const MAX_SCENES = 6, MAX_STEPS = 5, MAX_MINUTES = 4, MAX_COLOURS = 8;
const STEP_CHOICES = [0, 10, 25, 50, 75, 100];
const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90];
const NIGHT_LEVELS = [5, 10, 20, 30];
const COLOUR_CHOICES = [...WHITES.map(([n, k]) => [`k${k}`, n, kelvinHex(k)]), ...LAMP_COLOURS.map(([n, h]) => [h, n, h])];

// ---------- loading what the phone has ----------
function ui(c) { return c.ui.wg || (c.ui.wg = { list: null, canAdd: false, loading: false, asked: {} }); }
async function load(c) {
  const w = ui(c);
  if (w.loading) return;
  w.loading = true;
  const r = await native.widgets();
  w.list = (r && r.list) || []; w.canAdd = !!(r && r.canAdd); w.loading = false;
  c.render();
}
// One widget, fetched by itself when it is not in the list yet (just placed, the app opened on its page)
async function loadOne(c, id) {
  const w = ui(c);
  if (w.asked[id]) return;
  w.asked[id] = true;
  const one = await native.widget(id);
  if (one && one.kind) { w.list = [...(w.list || []).filter(x => x.id !== one.id), one]; }
  c.render();
}

// ---------- the pages ----------
export function view(c, r) {
  noTabs = !!(r && r.id);
  const w = ui(c);
  if (native.isNative && !w.list && !w.loading) load(c);
  return r && r.id ? editPage(c, Number(r.id)) : listPage(c);
}

function header(c, title) {
  return `<header class="hdr bar"><button class="hdr-btn back" data-act="back" aria-label="Back">${c.icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1 bar-t bar-pin">${c.esc(title)}</h1>`;
}

function listPage(c) {
  const { esc, icon } = c;
  const w = ui(c);
  if (!native.isNative) {
    return `<div class="wg-page">${header(c, 'Widgets')}
      <p class="t-body muted wg-lede">Widgets live in the Android app. Open it on the phone to add one.</p>
      <div class="group">${KINDS.map(([, name, d, ic]) => `<div class="row has-ic"><span class="row-ic">${icon(ic, 20, 1.4)}</span><span class="row-txt"><span class="t">${esc(name)}</span><span class="d">${esc(d)}</span></span></div>`).join('')}</div>
    </div>`;
  }
  const placed = w.list || [];
  const m = homeModel(c);
  return `<div class="wg-page">${header(c, 'Widgets')}
    <div class="t-over sec">On your home screen</div>
    <div class="group wg-placed">${w.list == null ? '<div class="row"><span class="row-txt"><span class="d">Looking</span></span></div>'
      : placed.length ? placed.map(x => { const k = KIND[x.kind] || KIND.house; return `<button class="row has-ic" data-go="widgets/${x.id}"><span class="row-ic">${icon(k[3], 20, 1.4)}</span><span class="row-txt"><span class="t">${esc(k[1])}</span><span class="d">${esc(shows(c, m, x))}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`; }).join('')
      : '<div class="row"><span class="row-txt"><span class="d">None yet</span></span></div>'}</div>
    <div class="t-over sec">Add one</div>
    <div class="group wg-kinds">${KINDS.map(([kind, name, d, ic]) => `<div class="row has-ic"><span class="row-ic">${icon(ic, 20, 1.4)}</span><span class="row-txt"><span class="t">${esc(name)}</span><span class="d">${esc(d)}</span></span>${w.canAdd ? `<button class="pill ghost sm wg-add" data-act="wg-add" data-kind="${kind}">Add</button>` : ''}</div>`).join('')}</div>
    ${w.canAdd ? '' : '<p class="t-cap muted wg-lede">To add one, press and hold your home screen, then Widgets, then Caseta.</p>'}
  </div>`;
}

// What a placed widget shows, in a few words: "Kitchen", "3 scenes", "Whichever is next"
function shows(c, m, x) {
  const cfg = x.cfg || {};
  const t = String(cfg.target || '');
  const name = t.startsWith('a:') ? (m.rooms.find(r => r.id === t.slice(2)) || {}).name : t.startsWith('d:') ? (m.lights.find(l => l.id === t.slice(2)) || {}).name : '';
  switch (x.kind) {
    case 'scenes': { const n = (cfg.scenes || []).length; return n ? `${n} scene${n === 1 ? '' : 's'}` : 'No scenes chosen'; }
    case 'house': return 'Every light';
    case 'pinned': return 'What is pinned on Home';
    case 'routine': return cfg.routine ? ((m.routines.find(r => r.id === cfg.routine) || {}).name || 'A routine that is gone') : 'Whichever is next';
    default: return name || (t ? 'Gone. Choose again' : 'Not chosen');
  }
}

function editPage(c, id) {
  const { esc } = c;
  const w = ui(c);
  if (!native.isNative) return `<div class="wg-page">${header(c, 'Widget')}<p class="t-body muted wg-lede">Widgets live in the Android app.</p></div>`;
  const x = (w.list || []).find(v => v.id === id);
  if (!x) {
    if (w.list) loadOne(c, id);
    const gone = w.list && w.asked[id] && !w.loading;
    return `<div class="wg-page">${header(c, 'Widget')}<p class="t-body muted wg-lede">${gone ? 'This widget is no longer on the home screen.' : 'Looking'}</p></div>`;
  }
  const k = KIND[x.kind] || KIND.house;
  const cfg = x.cfg;
  const m = homeModel(c), st = homeState(c);
  return `<div class="wg-page wg-edit" data-kind="${esc(x.kind)}">${header(c, k[1])}
    <div class="wg-stage">${preview(c, x.kind, cfg, m, st)}</div>
    ${what(c, x.kind, cfg, m)}
    ${lookHTML(c, x.kind, cfg)}
    <div class="sheet-btns wg-done"><button class="pill solid" data-act="wg-done">Done</button></div>
  </div>`;
}

// ---------- what it shows ----------
const radio = (c, on, act, v, t, d = '') => `<button class="row way ${d ? 'two' : ''} ${on ? 'sel' : ''}" data-act="${act}" data-v="${c.esc(v)}" aria-pressed="${on}"><span class="radio ${on ? 'on' : ''}">${on ? c.icon('check', 14, 2.2) : ''}</span><span class="row-txt"><span class="t">${c.esc(t)}</span>${d ? `<span class="d">${c.esc(d)}</span>` : ''}</span></button>`;
const check = (c, on, act, v, t, d = '') => `<button class="row ck" data-act="${act}" data-v="${c.esc(v)}" aria-pressed="${on}"><span class="row-txt"><span class="t">${c.esc(t)}</span>${d ? `<span class="d">${c.esc(d)}</span>` : ''}</span><span class="box ${on ? 'on' : ''}">${on ? c.icon('check', 14, 2.2) : ''}</span></button>`;
const toggle = (t, on, act, d = '') => `<div class="row"><span class="row-txt"><span class="t">${t}</span>${d ? `<span class="d">${d}</span>` : ''}</span><button class="toggle" role="switch" aria-checked="${!!on}" data-act="${act}" aria-label="${t}"></button></div>`;
const chips = (list, act) => `<div class="chip-wrap">${list.map(([v, t, on]) => `<button class="chip" aria-pressed="${!!on}" data-act="${act}" data-v="${v}">${t}</button>`).join('')}</div>`;
const sec = t => `<div class="t-over sec">${t}</div>`;

function what(c, kind, cfg, m) {
  const t = String(cfg.target || '');
  const rooms = m.rooms.map(r => radio(c, t === `a:${r.id}`, 'wg-target', `a:${r.id}`, r.name, `${r.lights.length} light${r.lights.length === 1 ? '' : 's'}`)).join('');
  const lights = list => list.map(l => radio(c, t === `d:${l.id}`, 'wg-target', `d:${l.id}`, l.name, l.roomName)).join('');
  const none = w => `<div class="row"><span class="row-txt"><span class="d">${w}</span></span></div>`;
  switch (kind) {
    case 'room':
      return `${sec('Room')}<div class="group">${rooms || none('No rooms with lights yet')}</div>
        ${sec('Buttons')}<div class="group">${toggle('Dimmer and brighter', cfg.steps !== false, 'wg-steps')}</div>`;
    case 'light':
      return `${sec('Light')}<div class="group">${lights(m.lights) || none('No lights yet')}</div>
        ${sec('Buttons')}<div class="group">${toggle('Dimmer and brighter', !!cfg.steps, 'wg-steps', 'When it is tall enough')}</div>`;
    case 'scenes': {
      const chosen = cfg.scenes || [];
      return `${sec(`Scenes, up to ${MAX_SCENES}`)}<div class="group">${m.scenes.map(s => check(c, chosen.includes(s.key), 'wg-scene', s.key, s.name, s.roomName)).join('') || none('No scenes yet')}</div>`;
    }
    case 'house':
      return `<p class="t-cap muted wg-lede">Every light, and All off. Nothing here turns the whole house on.</p>`;
    case 'levels': {
      const at = cfg.levelsAt || [];
      return `${sec('Room')}<div class="group">${rooms || none('No rooms with lights yet')}</div>
        ${sec('Or one light')}<div class="group">${lights(m.lights.filter(l => l.dim))}</div>
        ${sec(`Steps, up to ${MAX_STEPS}`)}${chips(STEP_CHOICES.map(v => [v, v ? `${v}%` : 'Off', at.includes(v)]), 'wg-step')}`;
    }
    case 'timer': {
      const mins = cfg.minutes || [];
      return `${sec('Room')}<div class="group">${rooms || none('No rooms with lights yet')}</div>
        ${sec('Or one light')}<div class="group">${lights(m.lights)}</div>
        ${sec(`Minutes, up to ${MAX_MINUTES}`)}${chips(MINUTE_CHOICES.map(v => [v, v % 60 ? `${v} min` : `${v / 60} hr`, mins.includes(v)]), 'wg-minutes')}`;
    }
    case 'nightstand': {
      const mins = cfg.minutes || [];
      return `${sec('Night light')}<div class="group">${lights(m.lights.filter(l => l.dim)) || none('No dimmable lights yet')}</div>
        ${sec('Comes on at')}${chips(NIGHT_LEVELS.map(v => [v, `${v}%`, cfg.nightLevel === v]), 'wg-nightlevel')}
        ${sec('Timers, up to 3')}${chips([15, 30, 45, 60].map(v => [v, v % 60 ? `${v} min` : '1 hr', mins.includes(v)]), 'wg-minutes')}`;
    }
    case 'routine':
      return `${sec('Routine')}<div class="group">${radio(c, !cfg.routine, 'wg-routine', '', 'Whichever is next')}${m.routines.map(r => radio(c, cfg.routine === r.id, 'wg-routine', r.id, r.name, r.enabled ? '' : 'Paused')).join('')}</div>`;
    case 'pinned':
      return `<p class="t-cap muted wg-lede">What is pinned on Home, as many as fit. Pin a light or a room from its page.</p>`;
    case 'colour': {
      const cols = (cfg.colours || []).map(v => String(v).toLowerCase());
      return `${sec('Lamp')}<div class="group">${lights(m.lights.filter(l => l.color)) || none('No colour lamps yet')}</div>
        ${sec(`Colours, up to ${MAX_COLOURS}`)}<div class="chip-wrap wg-swatches">${COLOUR_CHOICES.map(([v, n, hex]) => `<button class="wg-sw" aria-pressed="${cols.includes(v.toLowerCase())}" data-act="wg-colour" data-v="${v}" aria-label="${n}" style="--sw:${hex}"><i></i><span>${n}</span></button>`).join('')}</div>`;
    }
    default: return '';
  }
}

// ---------- how it looks ----------
const LAMP_KINDS = ['light', 'levels', 'colour'];
function lookHTML(c, kind, cfg) {
  const theme = cfg.theme || 'night';
  return `${sec('Look')}${chips([['night', 'Night', theme === 'night'], ['day', 'Day', theme === 'day'], ['clear', 'Clear', theme === 'clear']], 'wg-theme')}
    ${theme === 'clear' ? `${sec('Shade')}${chips([0, 20, 40, 60, 80].map(v => [v, v ? `${v}%` : 'None', Number(cfg.shade) === v]), 'wg-shade')}` : ''}
    ${sec('Corners')}${chips([['system', 'Rounded', cfg.corners !== 'square'], ['square', 'Square', cfg.corners === 'square']], 'wg-corners')}
    ${LAMP_KINDS.includes(kind) ? `${sec('On colour')}${chips([['copper', 'Copper', cfg.accent !== 'lamp'], ['lamp', "The lamp's own", cfg.accent === 'lamp']], 'wg-accent')}` : ''}
    ${sec('Show')}<div class="group">${toggle('Names', cfg.labels !== false, 'wg-labels')}${toggle('Levels', cfg.levels !== false, 'wg-levels')}${toggle('Icons', cfg.icons !== false, 'wg-icons')}</div>
    ${sec('Spacing')}${chips([['roomy', 'Roomy', cfg.density !== 'compact'], ['compact', 'Compact', cfg.density === 'compact']], 'wg-density')}`;
}

// ---------- the picture ----------
// The widget as the home screen will draw it (Widgets.java), in the look chosen, from the home as it is now.
function preview(c, kind, cfg, m, st) {
  const { esc, icon } = c;
  const lv = id => (st.levels[id] || 0);
  const t = String(cfg.target || '');
  const room = t.startsWith('a:') ? m.rooms.find(r => r.id === t.slice(2)) : null;
  const light = t.startsWith('d:') ? m.lights.find(l => l.id === t.slice(2)) : null;
  const hex = light ? st.colors[light.id] : null;
  const accent = cfg.accent === 'lamp' && hex ? hex : '#D98A4E';
  const lit = ids => { const on = ids.filter(id => lv(id) > 0); return { on: on.length, level: on.length ? Math.round(on.reduce((a, id) => a + lv(id), 0) / on.length) : 0 }; };
  const L = { labels: cfg.labels !== false, levels: cfg.levels !== false, icons: cfg.icons !== false };
  const ic = (name, on) => (L.icons ? `<span class="wgp-ic ${on ? 'on' : ''}">${icon(name, 20, 1.7)}</span>` : '');
  const head = (g, on, title, sub, pwr) => `<div class="wgp-head">${ic(g, on)}<div class="wgp-words">${L.labels || !sub ? `<b>${esc(title)}</b>` : ''}${sub ? `<span>${esc(sub)}</span>` : ''}</div>${pwr ? `<i class="wgp-pwr ${pwr}">${icon('power', 20, 1.9)}</i>` : ''}</div>`;
  const btns = list => `<div class="wgp-row">${list.map(([label, on, g]) => `<span class="wgp-btn ${on ? 'on' : ''}">${g && L.icons ? icon(g, 16, 1.9) : ''}${label ? `<em>${esc(label)}</em>` : ''}</span>`).join('')}</div>`;
  const tiles = (list, cols) => `<div class="wgp-grid" style="--cols:${cols}">${list.map(([g, name, sub, on]) => `<span class="wgp-tile ${on ? 'on' : ''}">${L.icons ? icon(g, 18, 1.7) : '<i></i>'}<b>${esc(name)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}</span>`).join('')}</div>`;
  const gone = w => head('x', false, w, 'Tap to choose again');
  let body = '', tall = false, fill = false;
  switch (kind) {
    case 'room': {
      if (!room) { body = gone('Choose a room'); break; }
      const o = lit(room.lights);
      body = head('grid', o.on > 0, room.name, o.on ? `${room.lights.length > 1 ? `${o.on} of ${room.lights.length} on` : 'On'}${L.levels && o.level ? ` · ${o.level}%` : ''}` : 'Off', o.on ? 'on' : 'off')
        + (cfg.steps !== false ? `<div class="wgp-gap"></div>${btns([['Dimmer', false, 'minus'], ['Brighter', false, 'plus']])}` : '');
      break;
    }
    case 'light': {
      if (!light) { body = gone('Choose a light'); break; }
      const on = lv(light.id) > 0; fill = on;
      body = head('bulb', false, light.name, on ? `${L.levels ? `${lv(light.id)}%` : 'On'}${hex ? ` · ${colourName(hex)}` : ''}` : 'Off', on ? 'white' : 'off')
        + (cfg.steps ? `<div class="wgp-gap"></div>${btns([['', false, 'minus'], ['', false, 'plus']])}` : '');
      break;
    }
    case 'scenes': {
      const list = (cfg.scenes || []).map(k => m.scenes.find(s => s.key === k)).filter(Boolean).slice(0, MAX_SCENES);
      if (!list.length) { body = gone('Choose scenes'); break; }
      tall = list.length > 4;
      body = (L.labels ? head('sparkle', false, 'Scenes', '') : '') + tiles(list.map(s => ['sparkle', s.name, '', false]), list.length > 4 ? 3 : 2);
      break;
    }
    case 'house': {
      const on = st.house.on;
      body = `${L.labels ? `<div class="wgp-over">${esc(m.home || 'Whole house')}</div>` : ''}<div class="wgp-big">${on ? `${on} on${L.levels ? ` · ${st.house.level}%` : ''}` : 'All off'}</div><div class="wgp-gap"></div><div class="wgp-row"><span class="wgp-btn solid">${L.icons ? icon('power', 16, 1.9) : ''}<em>All off</em></span></div>`;
      break;
    }
    case 'levels': {
      const name = room ? room.name : light ? light.name : null;
      if (!name) { body = gone('Choose a room or a light'); break; }
      const o = room ? lit(room.lights) : { on: lv(light.id) > 0 ? 1 : 0, level: lv(light.id) };
      body = head(room ? 'grid' : 'bulb', o.on > 0, name, o.on ? (L.levels ? `${o.level}%` : 'On') : 'Off') + '<div class="wgp-gap"></div>'
        + btns((cfg.levelsAt || []).slice(0, MAX_STEPS).map(v => [v ? `${v}%` : 'Off', v ? o.on && Math.abs(o.level - v) <= 4 : !o.on]));
      break;
    }
    case 'timer': {
      const name = room ? room.name : light ? light.name : null;
      if (!name) { body = gone('Choose a room or a light'); break; }
      body = head('timer', false, name, 'Sleep timer') + '<div class="wgp-gap"></div>' + btns((cfg.minutes || []).slice(0, MAX_MINUTES).map(v => [v % 60 ? `${v} min` : `${v / 60} hr`, false]));
      break;
    }
    case 'nightstand': {
      if (!light) { body = gone('Choose a night light'); break; }
      body = head('moon', false, L.labels ? 'Night light' : light.name, L.labels ? light.name : '') + '<div class="wgp-gap"></div>' + btns([[`On at ${cfg.nightLevel || 10}%`, false, 'moon']]);
      break;
    }
    case 'routine': {
      const r = cfg.routine ? m.routines.find(x => x.id === cfg.routine) : m.routines.filter(x => x.enabled && x.t).sort((a, b) => a.t - b.t)[0];
      if (!r) { body = head('clock', false, 'Routines', 'Nothing this week'); break; }
      body = head(r.icon === 'sunset' ? 'sunset' : r.icon === 'sunrise' ? 'sunrise' : 'clock', !r.skipping, r.name, r.skipping ? 'Skipping' : r.t ? whenText(r.t) : 'Paused') + '<div class="wgp-gap"></div>' + btns([[r.skipping ? "Don't skip" : 'Skip', false]]);
      break;
    }
    case 'pinned': {
      const list = m.pins.map(k => (k.startsWith('d:') ? ['bulb', m.lights.find(l => l.id === k.slice(2)), k] : ['grid', m.rooms.find(r => r.id === k.slice(2)), k])).filter(x => x[1]).slice(0, 6);
      tall = true;
      if (!list.length) { body = head('pin', false, 'Pinned', 'Pin lights and rooms on Home'); break; }
      body = (L.labels ? head('pin', false, 'Pinned', '') : '') + tiles(list.map(([g, x, k]) => {
        const o = k.startsWith('d:') ? { on: lv(x.id) > 0 ? 1 : 0, level: lv(x.id) } : lit(x.lights);
        return [g, x.name, o.on ? (L.levels && o.level ? `${o.level}%` : 'On') : 'Off', o.on > 0];
      }), list.length > 4 ? 3 : 2);
      break;
    }
    case 'colour': {
      if (!light) { body = gone('Choose a colour lamp'); break; }
      const on = lv(light.id) > 0;
      body = head('palette', on, light.name, on ? `${hex ? colourName(hex) : 'White'}${L.levels ? ` · ${lv(light.id)}%` : ''}` : 'Off', on ? 'on' : 'off')
        + `<div class="wgp-sws">${(cfg.colours || []).slice(0, MAX_COLOURS).map(v => `<i style="--sw:${String(v).startsWith('k') ? kelvinHex(Number(String(v).slice(1))) : v}" class="${on && hex && String(v).toLowerCase() === String(hex).toLowerCase() ? 'here' : ''}"></i>`).join('')}</div>`;
      break;
    }
    default: body = '';
  }
  const cls = ['wgp', `wgp-${cfg.theme || 'night'}`, cfg.corners === 'square' ? 'sq' : '', cfg.density === 'compact' ? 'compact' : '', tall ? 'tall' : '', fill ? 'fill' : ''].filter(Boolean).join(' ');
  const onInk = light2(accent) ? '#1A1A1A' : '#FFFFFF';
  return `<div class="${cls}" data-kind="${esc(kind)}" style="--wg-accent:${accent};--wg-on-ink:${onInk};--wg-shade:${(Number(cfg.shade ?? 40)) / 100}" aria-label="How the widget looks">${body}</div>`;
}
const light2 = hex => { const n = parseInt(String(hex).slice(1), 16); const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62; };
function colourName(hex) {
  const h = parseInt(String(hex).slice(1), 16), r = (h >> 16) / 255, g = ((h >> 8) & 255) / 255, b = (h & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!mx || d / mx < 0.12) return 'White';
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
  let best = LAMP_COLOURS[0][0], bd = 999;
  for (const [n, c] of LAMP_COLOURS) { const x = parseInt(c.slice(1), 16); const R = (x >> 16) / 255, G = ((x >> 8) & 255) / 255, B = (x & 255) / 255; const M = Math.max(R, G, B), D = M - Math.min(R, G, B); let hh = M === R ? ((G - B) / D) % 6 : M === G ? (B - R) / D + 2 : (R - G) / D + 4; hh = (hh * 60 + 360) % 360; const dh = Math.abs(((hh - hue + 540) % 360) - 180); if (dh < bd) { bd = dh; best = n; } }
  return best;
}
function whenText(t) {
  const d = new Date(t), now = new Date();
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  const h = d.getHours(), mm = d.getMinutes();
  const at = `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
  if (diff === 0) return `${h >= 17 ? 'Tonight' : 'Today'} at ${at}`;
  if (diff === 1) return `Tomorrow at ${at}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} at ${at}`;
}

// ---------- taps ----------
function cur(c, r) { const w = ui(c); return (w.list || []).find(v => v.id === Number(r.id)); }
// Save a change at once: the widget on the home screen redraws, and this page with it.
function change(c, r, fn) {
  const x = cur(c, r); if (!x) return;
  fn(x.cfg);
  native.setWidget(x.id, x.cfg).then(got => { if (got && got.cfg) { x.cfg = got.cfg; c.render(); } });
  c.render();
}
const flip = (list, v, max) => (list.includes(v) ? list.filter(x => x !== v) : list.length >= max ? list : [...list, v]);

export const actions = {
  async 'wg-add'(c, el) {
    const asked = await native.addWidget(el.dataset.kind);
    if (!asked) c.toast('Press and hold your home screen, then Widgets, then Caseta', { err: true });
    // the list catches up when the app comes back to it
    ui(c).list = null;
  },
  async 'wg-done'(c) {
    await native.widgetDone();
    c.back();
  },
  'wg-target'(c, el, r) { change(c, r, cfg => { cfg.target = el.dataset.v; }); },
  'wg-steps'(c, el, r) { const x = cur(c, r); if (!x) return; change(c, r, cfg => { cfg.steps = !(x.kind === 'room' ? cfg.steps !== false : !!cfg.steps); }); },
  'wg-scene'(c, el, r) { change(c, r, cfg => { cfg.scenes = flip(cfg.scenes || [], el.dataset.v, MAX_SCENES); }); },
  'wg-step'(c, el, r) { change(c, r, cfg => { const v = Number(el.dataset.v); const next = flip(cfg.levelsAt || [], v, MAX_STEPS); cfg.levelsAt = next.length ? next.sort((a, b) => a - b) : cfg.levelsAt; }); },
  'wg-minutes'(c, el, r) {
    change(c, r, cfg => {
      const max = cur(c, r).kind === 'nightstand' ? 3 : MAX_MINUTES;
      const next = flip(cfg.minutes || [], Number(el.dataset.v), max);
      cfg.minutes = next.length ? next.sort((a, b) => a - b) : cfg.minutes;
    });
  },
  'wg-nightlevel'(c, el, r) { change(c, r, cfg => { cfg.nightLevel = Number(el.dataset.v); }); },
  'wg-routine'(c, el, r) { change(c, r, cfg => { cfg.routine = el.dataset.v; }); },
  'wg-colour'(c, el, r) { change(c, r, cfg => { const next = flip(cfg.colours || [], el.dataset.v, MAX_COLOURS); cfg.colours = next.length ? next : cfg.colours; }); },
  'wg-theme'(c, el, r) { change(c, r, cfg => { cfg.theme = el.dataset.v; }); },
  'wg-shade'(c, el, r) { change(c, r, cfg => { cfg.shade = Number(el.dataset.v); }); },
  'wg-corners'(c, el, r) { change(c, r, cfg => { cfg.corners = el.dataset.v; }); },
  'wg-accent'(c, el, r) { change(c, r, cfg => { cfg.accent = el.dataset.v; }); },
  'wg-density'(c, el, r) { change(c, r, cfg => { cfg.density = el.dataset.v; }); },
  'wg-labels'(c, el, r) { change(c, r, cfg => { cfg.labels = cfg.labels === false; }); },
  'wg-levels'(c, el, r) { change(c, r, cfg => { cfg.levels = cfg.levels === false; }); },
  'wg-icons'(c, el, r) { change(c, r, cfg => { cfg.icons = cfg.icons === false; }); },
};

// Coming back to the list (after Android placed a widget) reads it again.
export function leave(c) { ui(c).list = null; ui(c).asked = {}; }
