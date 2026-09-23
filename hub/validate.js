'use strict';
// Config validation. The agent trusts whatever the hub hands it, so the hub
// is where a malformed document gets rejected.

const GESTURES = new Set(['single', 'double', 'hold_start', 'hold_end', 'hold']);
const ACTION_TYPES = new Set(['restore', 'level', 'step', 'raise', 'lower', 'stop', 'fan', 'scene', 'preset', 'delay', 'cycle', 'timer', 'cancel_timer', 'cap', 'cycle_presets', 'color']);
const FAN_SPEEDS = new Set(['Off', 'Low', 'Medium', 'MediumHigh', 'High']);
// The kinds of light and their roles, the same table the app loads (it works as a script and as a module).
const KIND_DEF = require('../web/js/kinds.js');

function fail(msg) { const e = new Error(msg); e.status = 400; throw e; }

function isId(v) { return typeof v === 'string' && v.length > 0 && v.length <= 64; }
function isLevel(v) { return Number.isInteger(v) && v >= 0 && v <= 100; }
// Colour for a Hue lamp: a white temperature in kelvin, or a colour as #rrggbb. Never both.
function isKelvin(v) { return Number.isInteger(v) && v >= 1000 && v <= 10000; }
function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
function checkColorPair(o, where) {
  const hasK = o.kelvin != null, hasH = o.hex != null;
  if (hasK === hasH) fail(`${where}: give kelvin or hex, one of them`);
  if (hasK && !isKelvin(o.kelvin)) fail(`${where}: kelvin must be 1000-10000`);
  if (hasH && !isHex(o.hex)) fail(`${where}: hex must be #rrggbb`);
  if (hasH) o.hex = o.hex.toLowerCase();
}
// d:<device> a single device, a:<area> a room, g:<group> a custom group, h:all every light and switch.
function isOneTarget(v) { return typeof v === 'string' && (/^(d|a|g):[A-Za-z0-9_-]+$/.test(v) || v === 'h:all' || v === 'h:shades' || v === 'h:fans'); }
// A target is one id or a list of them (several specific lights under one command, no named set needed).
function isTarget(v) { return isOneTarget(v) || (Array.isArray(v) && v.length >= 1 && v.length <= 64 && v.every(isOneTarget)); }
function targetList(v) { return Array.isArray(v) ? v : [v]; }
function isClock(v) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v); }

function validateAction(a, where) {
  if (!a || typeof a !== 'object') fail(`${where}: action must be an object`);
  if (Array.isArray(a.target)) { const u = [...new Set(a.target)]; a.target = u.length === 1 ? u[0] : u; }
  if (!ACTION_TYPES.has(a.type)) fail(`${where}: unknown action type "${a.type}"`);
  switch (a.type) {
    case 'level':
      if (!isTarget(a.target)) fail(`${where}: level needs a target`);
      if (!(isLevel(a.level) || ['toggle', 'on', 'off'].includes(a.level))) fail(`${where}: level must be 0-100, on, off or toggle`);
      if (a.fade != null && !(typeof a.fade === 'number' && a.fade >= 0 && a.fade <= 3600)) fail(`${where}: fade must be seconds`);
      break;
    case 'restore':
      if (!isTarget(a.target)) fail(`${where}: restore needs a target`);
      if (a.fade != null && !(typeof a.fade === 'number' && a.fade >= 0 && a.fade <= 3600)) fail(`${where}: fade must be seconds`);
      break;
    case 'step':
      if (!isTarget(a.target)) fail(`${where}: step needs a target`);
      if (!(Number.isInteger(a.delta) && a.delta >= -100 && a.delta <= 100 && a.delta !== 0)) fail(`${where}: delta must be a non-zero integer`);
      break;
    case 'raise': case 'lower': case 'stop':
      if (!isTarget(a.target)) fail(`${where}: ${a.type} needs a target`);
      // hold-to-dim stops at a glow instead of clicking off; hold-to-brighten can stop short of full
      if (a.floor != null && !(isLevel(a.floor) && a.floor >= 1)) fail(`${where}: floor must be 1-100`);
      if (a.ceiling != null && !isLevel(a.ceiling)) fail(`${where}: ceiling must be 0-100`);
      break;
    case 'color':
      // white temperature or a colour for the Hue lamps in the target that can do it (the connector skips the rest),
      // or {follow: true}: a lamp paused by a colour set by hand follows the day again
      if (!isTarget(a.target)) fail(`${where}: color needs a target`);
      if (a.follow === true) { if (a.kelvin != null || a.hex != null) fail(`${where}: follow the day or a colour, one of them`); break; }
      checkColorPair(a, where);
      if (a.level != null && !isLevel(a.level)) fail(`${where}: color level must be 0-100`);
      if (a.fade != null && !(typeof a.fade === 'number' && a.fade >= 0 && a.fade <= 60)) fail(`${where}: fade must be 0-60 seconds`);
      break;
    case 'cap':
      // lower only the lights that are above `level`; leave dimmer ones alone
      if (!isTarget(a.target)) fail(`${where}: cap needs a target`);
      if (!isLevel(a.level)) fail(`${where}: cap level must be 0-100`);
      if (a.fade != null && !(typeof a.fade === 'number' && a.fade >= 0 && a.fade <= 3600)) fail(`${where}: fade must be seconds`);
      break;
    case 'cycle_presets':
      if (!Array.isArray(a.preset_ids) || a.preset_ids.length < 2 || !a.preset_ids.every(isId)) fail(`${where}: cycle_presets needs at least two scenes`);
      // dir -1 walks the same list the other way, so one button goes forwards and another back. Stored
      // only when it is -1: a plain forward step keeps the shape it had before there was a direction.
      if (a.dir != null) {
        if (a.dir !== 1 && a.dir !== -1) fail(`${where}: cycle_presets dir must be 1 or -1`);
        if (a.dir === 1) delete a.dir;
      }
      break;
    case 'fan':
      if (!isTarget(a.target)) fail(`${where}: fan needs a target`);
      if (!FAN_SPEEDS.has(a.speed)) fail(`${where}: fan speed must be one of ${[...FAN_SPEEDS].join(', ')}`);
      break;
    case 'scene':
      if (!isId(a.scene_id)) fail(`${where}: scene needs scene_id`);
      break;
    case 'preset':
      if (!isId(a.preset_id)) fail(`${where}: preset needs preset_id`);
      break;
    case 'delay':
      if (!(Number.isInteger(a.ms) && a.ms >= 0 && a.ms <= 60000)) fail(`${where}: delay ms must be 0-60000`);
      break;
    case 'cycle':
      if (!isTarget(a.target)) fail(`${where}: cycle needs a target`);
      if (!Array.isArray(a.levels) || a.levels.length < 2 || !a.levels.every(isLevel)) fail(`${where}: cycle needs at least two levels`);
      break;
    case 'timer':
      // After `minutes`, set target to `level` (default off). A new timer on the same target replaces the old one.
      if (!isTarget(a.target)) fail(`${where}: timer needs a target`);
      if (!(Number.isInteger(a.minutes) && a.minutes >= 1 && a.minutes <= 1440)) fail(`${where}: timer minutes must be 1-1440`);
      if (a.level != null && !isLevel(a.level)) fail(`${where}: timer level must be 0-100`);
      if (a.fade != null && !(typeof a.fade === 'number' && a.fade >= 0 && a.fade <= 3600)) fail(`${where}: fade must be seconds`);
      break;
    case 'cancel_timer':
      if (!isTarget(a.target)) fail(`${where}: cancel_timer needs a target`);
      break;
  }
  return a;
}

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') fail('config must be an object');
  const out = { version: 3, settings: {}, groups: [], presets: [], bindings: [], favorites: [], schedules: [] };
  const s = cfg.settings || {};
  out.settings.double_ms = clampInt(s.double_ms, 150, 1500, 350);
  out.settings.hold_ms = clampInt(s.hold_ms, 250, 3000, 500);
  out.settings.group_on_level = clampInt(s.group_on_level, 1, 100, 100);
  out.settings.power_on = ['restore', 'all'].includes(s.power_on) ? s.power_on : 'restore';
  out.settings.default_fade = typeof s.default_fade === 'number' && s.default_fade >= 0 && s.default_fade <= 60 ? s.default_fade : 0.5;
  out.settings.night_start = isClock(s.night_start) ? s.night_start : '22:00';
  out.settings.night_end = isClock(s.night_end) ? s.night_end : '06:30';
  out.settings.night_level = clampInt(s.night_level, 1, 100, 30);
  out.settings.home_name = typeof s.home_name === 'string' ? s.home_name.trim().slice(0, 40) : '';
  out.settings.auto_update = s.auto_update !== false;
  // Devices removed from the app. Some bridges keep a deleted remote in their own list, so the app hides it.
  out.settings.hidden_devices = Array.isArray(s.hidden_devices) ? s.hidden_devices.filter(isId).slice(0, 200) : [];
  // The app greeted this home once (the "Your home is connected" sheet); a second phone does not see it again.
  out.settings.greeted = s.greeted === true;
  // Where and when: timezone comes from the phone (IANA name), location from the phone's GPS, both optional.
  out.settings.timezone = typeof s.timezone === 'string' && /^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/.test(s.timezone) ? s.timezone : null;
  out.settings.location = s.location && typeof s.location.lat === 'number' && typeof s.location.lng === 'number' && Math.abs(s.location.lat) <= 90 && Math.abs(s.location.lng) <= 180
    ? { lat: Math.round(s.location.lat * 10000) / 10000, lng: Math.round(s.location.lng * 10000) / 10000, name: typeof s.location.name === 'string' ? s.location.name.slice(0, 60) : '' } : null;
  // Adaptive "on" brightness: what "on" means at each time of day, interpolated between points.
  const ad = s.adaptive || {};
  const points = Array.isArray(ad.points) ? ad.points.filter(p => p && isClock(p.time) && isLevel(p.level)).map(p => ({ time: p.time, level: p.level })).sort((a, b) => a.time.localeCompare(b.time)) : [];
  // Two modes: 'winddown' (the default) follows the sun: full brightness until a while after sunset, then a straight
  // line down to `to_level` at night_start, then night_level inside the night hours. 'points' is a hand-drawn curve.
  const wd = ad.winddown || {};
  out.settings.adaptive = {
    enabled: ad.enabled === true,
    mode: ad.mode === 'points' && points.length >= 2 ? 'points' : 'winddown',
    points: points.length >= 2 ? points : [{ time: '07:00', level: 100 }, { time: '18:00', level: 80 }, { time: '21:00', level: 40 }, { time: '23:00', level: 15 }],
    winddown: { sunset_offset_min: clampInt(wd.sunset_offset_min, -120, 180, 30), earliest: isClock(wd.earliest) ? wd.earliest : '18:00', latest: isClock(wd.latest) ? wd.latest : '20:00', from_level: clampInt(wd.from_level, 1, 100, 100), to_level: clampInt(wd.to_level, 1, 100, 50), morning_level: clampInt(wd.morning_level, 1, 100, 60), morning_until: isClock(wd.morning_until) ? wd.morning_until : '07:30', nudge: wd.nudge === true },
  };
  // Follow the day: the lamps whose white follows the sun by itself (agent/daylight.py), and whether they dim
  // towards the evening too. Brightness is off by default; when it is on the number comes from the evening
  // wind-down, so the two never disagree. Only ids here: what each lamp can do is read from the bridge.
  {
    const fd = s.follow_day || {};
    const ids = Array.isArray(fd.device_ids) ? [...new Set(fd.device_ids.filter(isId))].slice(0, 200) : [];
    out.settings.follow_day = { device_ids: ids, brightness: fd.brightness === true };
  }
  // What each light is for. Optional; the app uses it to build room moods.
  out.settings.roles = {};
  for (const [k, v] of Object.entries(s.roles || {})) if (/^[A-Za-z0-9_-]{1,64}$/.test(k) && ['ambient', 'task', 'accent', 'decor'].includes(v)) out.settings.roles[k] = v;
  // The kind of lamp: a place and a fixture (`desk-lamp`, `ceiling-track`), from the table the app uses too
  // (web/js/kinds.js). The role comes from it. The nine old one-word ids are accepted and written back as the new id.
  out.settings.light_kinds = {};
  for (const [k, v] of Object.entries(s.light_kinds || {})) { const kid = KIND_DEF.normalize(v); if (/^[A-Za-z0-9_-]{1,64}$/.test(k) && kid) { out.settings.light_kinds[k] = kid; if (!out.settings.roles[k]) out.settings.roles[k] = KIND_DEF.ROLES[kid]; } }
  out.settings.night_look = ['auto', 'always', 'never'].includes(s.night_look) ? s.night_look : 'auto';
  // Per-room colour keys and per-remote appearance overrides (model layout and finish), set from the app.
  out.settings.room_colors = {};
  for (const [k, v] of Object.entries(s.room_colors || {})) if (/^[A-Za-z0-9_-]{1,64}$/.test(k) && typeof v === 'string' && /^[a-z]+$/.test(v)) out.settings.room_colors[k] = v;
  out.settings.remote_looks = {};
  for (const [k, v] of Object.entries(s.remote_looks || {})) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(k) || !v || typeof v !== 'object') continue;
    const model = typeof v.model === 'string' && /^[A-Za-z0-9-]+$/.test(v.model) ? v.model : null;
    const finish = ['white', 'black', 'ivory', 'gray'].includes(v.finish) ? v.finish : null;
    // Button numbers this remote has actually sent. A remote the bridge lists without its buttons is drawn
    // from these instead, so the picture and the rows match what the real keys send.
    const seen = Array.isArray(v.seen)
      ? [...new Set(v.seen.filter(n => Number.isInteger(n) && n >= 0 && n <= 32))].sort((a, b) => a - b).slice(0, 12)
      : [];
    if (model || finish || seen.length) out.settings.remote_looks[k] = { model, finish, ...(seen.length ? { seen } : {}) };
  }
  // The rooms the app owns. Empty means "use the rooms the bridges report", which is how every home starts and
  // how a home that never touches this one goes on working. Once there is a list, it is the truth: every room the
  // app shows comes from here, and `a:<id>` may name one of these ids as well as a bridge area.
  //   id          the app's own id
  //   name        what the person called it, up to 40 characters
  //   device_ids  the devices filed here by hand; a device may be in one room only, so the first room wins
  //   bridge_area the Lutron area this room stands for, when it has one (a device filed here is moved there too)
  //   hue_room    the Philips Hue room this room stands for, when it has one
  // A room with neither is fine: the app still holds it, and the copy says so instead of pretending.
  out.settings.rooms = [];
  {
    const roomIds = new Set(); const claimed = new Set();
    for (const r of arr(s.rooms, 'settings.rooms').slice(0, 64)) {
      if (!r || typeof r !== 'object') fail('settings.rooms: each room must be an object');
      if (!isId(r.id) || !/^[A-Za-z0-9_-]{1,64}$/.test(r.id)) fail('settings.rooms: each room needs an id');
      if (roomIds.has(r.id)) fail(`settings.rooms: duplicate room id ${r.id}`);
      roomIds.add(r.id);
      const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
      if (!name) fail(`settings.rooms: room ${r.id} needs a name`);
      const ids = [];
      for (const id of Array.isArray(r.device_ids) ? r.device_ids : []) {
        if (!isId(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) fail(`settings.rooms: room ${r.id} has a bad device id`);
        if (claimed.has(id) || ids.includes(id)) continue;   // one room per device, quietly
        claimed.add(id); ids.push(id);
      }
      const area = typeof r.bridge_area === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.bridge_area) && !r.bridge_area.startsWith('hue_') ? r.bridge_area : null;
      const hue = typeof r.hue_room === 'string' && /^hue_[A-Za-z0-9_-]{1,60}$/.test(r.hue_room) ? r.hue_room : null;
      // photo: a stamp saying "this room has a picture, and this is which one". The bytes live on the
      // volume beside the documents (hub/store.js); only the stamp travels in the config, and it changes
      // whenever the photo does so a cached <img> knows to fetch again.
      const photo = typeof r.photo === 'string' && /^[0-9]{1,16}$/.test(r.photo) ? r.photo : null;
      out.settings.rooms.push({ id: r.id, name, device_ids: ids.slice(0, 200), bridge_area: area, hue_room: hue, photo });
    }
  }
  // Set once, the first time a bridge room becomes one of the app's own (js/rooms.js ensureRooms): after that,
  // a room here comes only from this app, never a bridge, so it has to survive every save or the app would
  // seed again from whatever the bridges list next.
  out.settings.rooms_seeded = !!s.rooms_seeded;

  const groupIds = new Set();
  for (const g of arr(cfg.groups, 'groups')) {
    if (!isId(g.id)) fail('group needs an id');
    if (groupIds.has(g.id)) fail(`duplicate group id ${g.id}`);
    groupIds.add(g.id);
    if (typeof g.name !== 'string' || !g.name.trim()) fail(`group ${g.id} needs a name`);
    if (!Array.isArray(g.device_ids) || !g.device_ids.every(isId)) fail(`group ${g.id}: device_ids must be a list of ids`);
    out.groups.push({ id: g.id, name: g.name.trim().slice(0, 60), device_ids: [...new Set(g.device_ids)], on_level: isLevel(g.on_level) ? g.on_level : null });
  }
  const presetIds = new Set();
  for (const p of arr(cfg.presets, 'presets')) {
    if (!isId(p.id)) fail('preset needs an id');
    if (presetIds.has(p.id)) fail(`duplicate preset id ${p.id}`);
    presetIds.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim()) fail(`preset ${p.id} needs a name`);
    if (!p.levels || typeof p.levels !== 'object') fail(`preset ${p.id}: levels must be an object`);
    const levels = {};
    for (const [k, v] of Object.entries(p.levels)) {
      if (!isId(k)) fail(`preset ${p.id}: bad device id`);
      if (typeof v === 'string' && FAN_SPEEDS.has(v)) levels[k] = v;
      else if (isLevel(v)) levels[k] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        // a Hue lamp's brightness with its colour: {level, kelvin} or {level, hex}, or {level, follow: true} for a
        // lamp the scene sets to follow the day instead of to a colour of its own
        if (!isLevel(v.level)) fail(`preset ${p.id}: level for ${k} must be 0-100`);
        if (v.follow === true) { if (v.kelvin != null || v.hex != null) fail(`preset ${p.id}, ${k}: follow the day or a colour, one of them`); levels[k] = { level: v.level, follow: true }; }
        else {
          checkColorPair(v, `preset ${p.id}, ${k}`);
          levels[k] = v.kelvin != null ? { level: v.level, kelvin: v.kelvin } : { level: v.level, hex: v.hex };
        }
      }
      else fail(`preset ${p.id}: level for ${k} must be 0-100, a fan speed, a level with a colour, or a level that follows the day`);
    }
    out.presets.push({ id: p.id, name: p.name.trim().slice(0, 60), levels, fade: typeof p.fade === 'number' && p.fade >= 0 && p.fade <= 60 ? p.fade : null,
      area: typeof p.area === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(p.area) ? p.area : null,
      mood: ['bright', 'relax', 'dinner', 'movie', 'night'].includes(p.mood) ? p.mood : null,
      edited: p.edited === true });
  }
  const checkActions = (list, label) => {
    if (!Array.isArray(list)) fail(`${label}: actions must be a list`);
    const acts = list.map((a, i) => validateAction(a, `${label} action ${i + 1}`));
    for (const a of acts) {
      if (a.type === 'preset' && !presetIds.has(a.preset_id)) fail(`${label}: unknown preset ${a.preset_id}`);
      if (a.type === 'cycle_presets') for (const id of a.preset_ids) if (!presetIds.has(id)) fail(`${label}: unknown preset ${id}`);
      for (const t of (a.target ? targetList(a.target) : [])) if (t.startsWith('g:') && !groupIds.has(t.slice(2))) fail(`${label}: unknown group ${t.slice(2)}`);
    }
    return acts;
  };
  const seen = new Set();
  for (const b of arr(cfg.bindings, 'bindings')) {
    if (!isId(b.id)) fail('binding needs an id');
    if (!isId(b.device_id)) fail(`binding ${b.id}: device_id (the Pico) is required`);
    if (!Number.isInteger(b.button_number) || b.button_number < 0 || b.button_number > 31) fail(`binding ${b.id}: bad button_number`);
    if (!GESTURES.has(b.gesture)) fail(`binding ${b.id}: gesture must be one of ${[...GESTURES].join(', ')}`);
    const key = `${b.device_id}/${b.button_number}/${b.gesture}`;
    if (seen.has(key)) fail(`two bindings for ${key}`);
    seen.add(key);
    const actions = checkActions(b.actions, `binding ${b.id}`);
    // Optional night-time alternative: between night_start and night_end run these instead.
    let night = null;
    if (b.night && typeof b.night === 'object') {
      if (!Array.isArray(b.night.actions)) fail(`binding ${b.id}: night.actions must be a list`);
      night = { actions: checkActions(b.night.actions, `binding ${b.id} (night)`) };
    }
    out.bindings.push({ id: b.id, device_id: b.device_id, button_number: b.button_number, gesture: b.gesture, actions, night, enabled: b.enabled !== false, name: typeof b.name === 'string' ? b.name.slice(0, 60) : '' });
  }
  // Schedules: run actions at a clock time or relative to sunrise/sunset, on chosen weekdays (0 = Sunday).
  const schedIds = new Set();
  for (const sc of arr(cfg.schedules, 'schedules')) {
    if (!isId(sc.id)) fail('schedule needs an id');
    if (schedIds.has(sc.id)) fail(`duplicate schedule id ${sc.id}`);
    schedIds.add(sc.id);
    const at = sc.at || {};
    if (!['time', 'sunrise', 'sunset'].includes(at.type)) fail(`schedule ${sc.id}: at.type must be time, sunrise or sunset`);
    if (at.type === 'time' && !isClock(at.time)) fail(`schedule ${sc.id}: at.time must be HH:MM`);
    const offset = Number.isInteger(at.offset_min) ? clampInt(at.offset_min, -180, 180, 0) : 0;
    const days = Array.isArray(sc.days) ? [...new Set(sc.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [0, 1, 2, 3, 4, 5, 6];
    if (!days.length) fail(`schedule ${sc.id}: pick at least one day`);
    const actions = checkActions(sc.actions, `schedule ${sc.id}`);
    if (!actions.length) fail(`schedule ${sc.id}: needs at least one action`);
    const onlyIf = ['any_on', 'all_off'].includes(sc.only_if) ? sc.only_if : null;
    const skipUntil = typeof sc.skip_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sc.skip_until) ? sc.skip_until : null;
    out.schedules.push({ id: sc.id, name: typeof sc.name === 'string' ? sc.name.trim().slice(0, 60) : '', enabled: sc.enabled !== false, at: { type: at.type, time: at.type === 'time' ? at.time : null, offset_min: offset }, days, actions, only_if: onlyIf, skip_until: skipUntil, kind: typeof sc.kind === 'string' && /^[a-z_]{1,24}$/.test(sc.kind) ? sc.kind : null });
  }
  for (const f of arr(cfg.favorites, 'favorites')) {
    if (typeof f === 'string' && (isOneTarget(f) || /^(p|s):[A-Za-z0-9_-]+$/.test(f))) out.favorites.push(f);
  }
  out.favorites = [...new Set(out.favorites)].slice(0, 24);
  return out;
}

function arr(v, what) {
  if (v == null) return [];
  if (!Array.isArray(v)) fail(`${what} must be a list`);
  return v;
}
function clampInt(v, lo, hi, dflt) {
  if (!Number.isInteger(v)) return dflt;
  return Math.min(hi, Math.max(lo, v));
}

module.exports = { validateConfig, validateAction, GESTURES, ACTION_TYPES, FAN_SPEEDS };
