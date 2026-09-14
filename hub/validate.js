'use strict';
// Config validation. The agent trusts whatever the hub hands it, so the hub
// is where a malformed document gets rejected.

const GESTURES = new Set(['single', 'double', 'hold_start', 'hold_end', 'hold']);
const ACTION_TYPES = new Set(['level', 'step', 'raise', 'lower', 'stop', 'fan', 'scene', 'preset', 'delay', 'cycle']);
const FAN_SPEEDS = new Set(['Off', 'Low', 'Medium', 'MediumHigh', 'High']);

function fail(msg) { const e = new Error(msg); e.status = 400; throw e; }

function isId(v) { return typeof v === 'string' && v.length > 0 && v.length <= 64; }
function isLevel(v) { return Number.isInteger(v) && v >= 0 && v <= 100; }
function isTarget(v) { return typeof v === 'string' && /^(d|g):[A-Za-z0-9_-]+$/.test(v); }

function validateAction(a, where) {
  if (!a || typeof a !== 'object') fail(`${where}: action must be an object`);
  if (!ACTION_TYPES.has(a.type)) fail(`${where}: unknown action type "${a.type}"`);
  switch (a.type) {
    case 'level':
      if (!isTarget(a.target)) fail(`${where}: level needs a target`);
      if (!(isLevel(a.level) || ['toggle', 'on', 'off'].includes(a.level))) fail(`${where}: level must be 0-100, on, off or toggle`);
      if (a.fade != null && !(typeof a.fade === 'number' && a.fade >= 0 && a.fade <= 3600)) fail(`${where}: fade must be seconds`);
      break;
    case 'step':
      if (!isTarget(a.target)) fail(`${where}: step needs a target`);
      if (!(Number.isInteger(a.delta) && a.delta >= -100 && a.delta <= 100 && a.delta !== 0)) fail(`${where}: delta must be a non-zero integer`);
      break;
    case 'raise': case 'lower': case 'stop':
      if (!isTarget(a.target)) fail(`${where}: ${a.type} needs a target`);
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
  }
  return a;
}

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') fail('config must be an object');
  const out = { version: 1, settings: {}, groups: [], presets: [], bindings: [] };
  const s = cfg.settings || {};
  out.settings.double_ms = clampInt(s.double_ms, 150, 1500, 350);
  out.settings.hold_ms = clampInt(s.hold_ms, 250, 3000, 500);
  out.settings.group_on_level = clampInt(s.group_on_level, 1, 100, 100);
  out.settings.default_fade = typeof s.default_fade === 'number' && s.default_fade >= 0 && s.default_fade <= 60 ? s.default_fade : 0.5;

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
      else fail(`preset ${p.id}: level for ${k} must be 0-100 or a fan speed`);
    }
    out.presets.push({ id: p.id, name: p.name.trim().slice(0, 60), levels, fade: typeof p.fade === 'number' && p.fade >= 0 && p.fade <= 60 ? p.fade : null });
  }
  const seen = new Set();
  for (const b of arr(cfg.bindings, 'bindings')) {
    if (!isId(b.id)) fail('binding needs an id');
    if (!isId(b.device_id)) fail(`binding ${b.id}: device_id (the Pico) is required`);
    if (!Number.isInteger(b.button_number) || b.button_number < 0 || b.button_number > 31) fail(`binding ${b.id}: bad button_number`);
    if (!GESTURES.has(b.gesture)) fail(`binding ${b.id}: gesture must be one of ${[...GESTURES].join(', ')}`);
    const key = `${b.device_id}/${b.button_number}/${b.gesture}`;
    if (seen.has(key)) fail(`two bindings for ${key}`);
    seen.add(key);
    if (!Array.isArray(b.actions)) fail(`binding ${b.id}: actions must be a list`);
    const actions = b.actions.map((a, i) => validateAction(a, `binding ${b.id} action ${i + 1}`));
    for (const a of actions) {
      if (a.type === 'preset' && !presetIds.has(a.preset_id)) fail(`binding ${b.id}: unknown preset ${a.preset_id}`);
      if (a.target && a.target.startsWith('g:') && !groupIds.has(a.target.slice(2))) fail(`binding ${b.id}: unknown group ${a.target.slice(2)}`);
    }
    out.bindings.push({ id: b.id, device_id: b.device_id, button_number: b.button_number, gesture: b.gesture, actions, name: typeof b.name === 'string' ? b.name.slice(0, 60) : '' });
  }
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
