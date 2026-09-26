// The home as the Android app's widgets draw it (mobile/, Widgets.java), handed over while this app is open. Only
// this page knows which room a light is in once rooms are the app's own, what a scene is called, what is pinned and
// when each routine runs next, so it says so; the widgets read levels and timers from the hub by themselves too,
// every few minutes and after each tap.
//
//   model  rooms (and the lights in each), lights, scenes (with their levels, so a widget can light the one that is
//          showing), pins, the night light, the routines coming up, the home's name
//   state  each light's level and colour, the running timers, how many lights are on
//
// Worked out at most once a second, a moment after the redraws stop, and sent only when it has changed
// (native.js). Nothing here runs in a browser.
import * as native from '/ui/native.js';
import { nightLamp } from '/ui/screens/nightstand.js';
import { kelvinHex } from '/ui/colour.js';

let timer = null;
export function soon(c) {
  if (!native.isNative || timer) return;
  timer = setTimeout(() => { timer = null; try { native.widgetData(model(c), state(c)); } catch (_) { /* next time */ } }, 1000);
}

const lampsOf = c => c.data.controllable().filter(d => d.domain === 'light' || d.domain === 'switch');

export function model(c) {
  const { data, RT, S } = c;
  const lamps = lampsOf(c);
  const rooms = data.areas().map(a => ({ id: a.id, name: a.name, lights: lamps.filter(d => data.devArea(d) === a.id).map(d => d.device_id) })).filter(r => r.lights.length);
  const lights = lamps.map(d => ({ id: d.device_id, name: d.name, room: data.devArea(d), roomName: data.devAreaName(d), dim: d.domain === 'light', color: !!d.color, ct: !!d.ct }));
  const level = v => (v && typeof v === 'object' ? Number(v.level) || 0 : typeof v === 'number' ? v : null);
  const scenes = [
    ...data.presets().map(p => ({ key: `p:${p.id}`, name: p.name, room: p.area || null, roomName: p.area ? data.areaName(p.area) : '', levels: Object.fromEntries(Object.entries(p.levels || {}).map(([id, v]) => [id, level(v)]).filter(([, v]) => v != null)) })),
    ...data.lutronScenes().map(s => ({ key: `s:${s.scene_id}`, name: s.name, room: null, roomName: 'Lutron' })),
  ];
  const pins = ((S.config && S.config.favorites) || []).filter(k => /^(d|a):/.test(k));
  const night = nightLamp(c);
  const routines = [];
  for (const sc of RT.list()) {
    try {
      const n = RT.nextRunOf(sc);
      const sk = RT.skipping(sc);
      const { L, Sh } = RT.splitOf(sc);
      const icon = sc.at && sc.at.type === 'sunset' ? 'sunset' : sc.at && sc.at.type === 'sunrise' ? 'sunrise' : 'clock';
      routines.push({ id: sc.id, name: sc.name || RT.autoName(sc, L, Sh, !!RT.pairOf(sc)), enabled: sc.enabled !== false, t: n ? n.t : 0, date: sk || (n ? n.date : ''), skipping: !!sk, icon });
    } catch (_) { /* a routine that cannot be read is left out */ }
  }
  const sig = JSON.stringify([rooms, lights.map(l => l.name), scenes.map(s => s.name)]).length + ':' + rooms.length + ':' + lights.length + ':' + scenes.length;
  return { home: (S.config.settings && S.config.settings.home_name) || '', rooms, lights, scenes, pins, night: night ? { id: night.device_id, name: night.name } : null, routines, sig };
}

export function state(c) {
  const { data, H, S } = c;
  const levels = {}, colors = {};
  for (const d of lampsOf(c)) {
    levels[d.device_id] = data.level(d.device_id) || 0;
    const col = (S.states[d.device_id] || {}).color;
    if (col && col.mode === 'xy' && col.hex) colors[d.device_id] = String(col.hex);
  }
  const timers = {};
  for (const [k, v] of Object.entries(S.timers || {})) {
    if (!v || !v.ends_at) continue;
    timers[k] = { ends: v.ends_at < 1e12 ? Math.round(v.ends_at * 1000) : +new Date(v.ends_at), level: v.level || 0 };
  }
  return { levels, colors, timers, house: { on: H.litLights().length, level: Math.round(H.houseLevel()) } };
}

// The white a lamp shows, as a colour, for a preview (the Widgets page draws them the way the widget does)
export const whiteHex = k => kelvinHex(k);
