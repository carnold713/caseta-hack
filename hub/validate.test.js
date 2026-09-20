'use strict';
/* hub/validate.js: the hub is where a malformed document gets rejected, because the agent trusts
   whatever the hub hands it. These are the rules that keep a bad config off the bridge.
   Run: npm test   (node --test hub/) */
const { test } = require('node:test');
const assert = require('node:assert');

const { validateConfig, validateAction, FAN_SPEEDS } = require('./validate.js');

const bad = (fn, why) => {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  assert.ok(threw, `expected a rejection: ${why}`);
  assert.strictEqual(threw.status, 400, `a rejection is a 400, not a crash: ${why}`);
  return threw;
};

// ───────────────────────── actions ─────────────────────────

test('an action must be an object of a known type', () => {
  bad(() => validateAction(null, 'x'), 'null');
  bad(() => validateAction('level', 'x'), 'a string');
  bad(() => validateAction({ type: 'explode', target: 'd:1' }, 'x'), 'unknown type');
});

test('the target forms, and only those', () => {
  for (const t of ['d:1', 'a:kitchen', 'g:desk_lamps', 'h:all', 'h:shades', 'h:fans', 'd:a-B_9']) {
    assert.deepStrictEqual(validateAction({ type: 'level', target: t, level: 50 }, 'x').target, t);
  }
  for (const t of ['x:1', 'h:nope', 'd:', 'd:has space', '', 42, null, 'd:no!']) {
    bad(() => validateAction({ type: 'level', target: t, level: 50 }, 'x'), `target ${JSON.stringify(t)}`);
  }
});

test('a list of targets is deduped, and collapses to a bare id when one is left', () => {
  // several specific lights under one command, without making a named set first
  const two = validateAction({ type: 'level', target: ['d:1', 'd:2', 'd:1'], level: 50 }, 'x');
  assert.deepStrictEqual(two.target, ['d:1', 'd:2']);
  const one = validateAction({ type: 'level', target: ['d:7', 'd:7'], level: 50 }, 'x');
  assert.strictEqual(one.target, 'd:7', 'one distinct target is a string, not a one-item list');
  bad(() => validateAction({ type: 'level', target: [], level: 50 }, 'x'), 'an empty list');
  bad(() => validateAction({ type: 'level', target: ['d:1', 'nope'], level: 50 }, 'x'), 'one bad id in the list');
});

test('level takes 0-100 or on/off/toggle, and a fade in seconds', () => {
  for (const lv of [0, 100, 55, 'toggle', 'on', 'off']) {
    assert.ok(validateAction({ type: 'level', target: 'd:1', level: lv }, 'x'));
  }
  for (const lv of [-1, 101, 50.5, '50', 'ON', null, undefined]) {
    bad(() => validateAction({ type: 'level', target: 'd:1', level: lv }, 'x'), `level ${JSON.stringify(lv)}`);
  }
  assert.ok(validateAction({ type: 'level', target: 'd:1', level: 1, fade: 3600 }, 'x'));
  bad(() => validateAction({ type: 'level', target: 'd:1', level: 1, fade: 3601 }, 'x'), 'fade over an hour');
  bad(() => validateAction({ type: 'level', target: 'd:1', level: 1, fade: -1 }, 'x'), 'a negative fade');
});

test('colour is a white temperature or a colour, never both and never neither', () => {
  assert.ok(validateAction({ type: 'color', target: 'd:1', kelvin: 4000 }, 'x'));
  bad(() => validateAction({ type: 'color', target: 'd:1' }, 'x'), 'neither');
  bad(() => validateAction({ type: 'color', target: 'd:1', kelvin: 4000, hex: '#ff0000' }, 'x'), 'both');
  bad(() => validateAction({ type: 'color', target: 'd:1', kelvin: 999 }, 'x'), 'kelvin below the range');
  bad(() => validateAction({ type: 'color', target: 'd:1', kelvin: 10001 }, 'x'), 'kelvin above the range');
  bad(() => validateAction({ type: 'color', target: 'd:1', hex: 'ff0000' }, 'x'), 'a hex with no hash');
  bad(() => validateAction({ type: 'color', target: 'd:1', hex: '#f00' }, 'x'), 'a short hex');
  // a hex is stored one way, so two spellings of one colour are one colour
  assert.strictEqual(validateAction({ type: 'color', target: 'd:1', hex: '#AABBCC' }, 'x').hex, '#aabbcc');
  // this fade is the colour's own, and it is a much shorter one than a level's
  assert.ok(validateAction({ type: 'color', target: 'd:1', kelvin: 4000, fade: 60 }, 'x'));
  bad(() => validateAction({ type: 'color', target: 'd:1', kelvin: 4000, fade: 61 }, 'x'), 'colour fade over 60s');
});

test('step needs a non-zero delta', () => {
  assert.ok(validateAction({ type: 'step', target: 'd:1', delta: -10 }, 'x'));
  assert.ok(validateAction({ type: 'step', target: 'd:1', delta: 100 }, 'x'));
  for (const d of [0, 101, -101, 1.5, '10', null]) {
    bad(() => validateAction({ type: 'step', target: 'd:1', delta: d }, 'x'), `delta ${JSON.stringify(d)}`);
  }
});

test('hold-to-dim stops at a glow, not at off', () => {
  assert.ok(validateAction({ type: 'raise', target: 'd:1', ceiling: 0 }, 'x'));
  assert.ok(validateAction({ type: 'lower', target: 'd:1', floor: 1 }, 'x'));
  bad(() => validateAction({ type: 'lower', target: 'd:1', floor: 0 }, 'x'), 'a floor of 0 is off, not a glow');
  bad(() => validateAction({ type: 'lower', target: 'd:1', ceiling: 101 }, 'x'), 'a ceiling over 100');
});

test('fan speeds are the bridge\'s five', () => {
  for (const s of FAN_SPEEDS) assert.ok(validateAction({ type: 'fan', target: 'd:1', speed: s }, 'x'));
  for (const s of ['high', 'Max', '', null]) {
    bad(() => validateAction({ type: 'fan', target: 'd:1', speed: s }, 'x'), `speed ${JSON.stringify(s)}`);
  }
});

test('the timing actions have bounds', () => {
  assert.ok(validateAction({ type: 'delay', ms: 0 }, 'x'));
  assert.ok(validateAction({ type: 'delay', ms: 60000 }, 'x'));
  bad(() => validateAction({ type: 'delay', ms: 60001 }, 'x'), 'a delay over a minute');
  assert.ok(validateAction({ type: 'timer', target: 'd:1', minutes: 1440 }, 'x'));
  bad(() => validateAction({ type: 'timer', target: 'd:1', minutes: 0 }, 'x'), 'a timer of no minutes');
  bad(() => validateAction({ type: 'timer', target: 'd:1', minutes: 1441 }, 'x'), 'a timer over a day');
});

test('the actions that cycle need something to cycle through', () => {
  assert.ok(validateAction({ type: 'cycle', target: 'd:1', levels: [10, 50] }, 'x'));
  bad(() => validateAction({ type: 'cycle', target: 'd:1', levels: [10] }, 'x'), 'one level is not a cycle');
  bad(() => validateAction({ type: 'cycle', target: 'd:1', levels: [10, 101] }, 'x'), 'a bad level in the list');
  assert.ok(validateAction({ type: 'cycle_presets', preset_ids: ['a', 'b'] }, 'x'));
  bad(() => validateAction({ type: 'cycle_presets', preset_ids: ['a'] }, 'x'), 'one scene is not a cycle');
  assert.equal(validateAction({ type: 'cycle_presets', preset_ids: ['a', 'b'], dir: -1 }, 'x').dir, -1, 'a backwards walk keeps its direction');
  assert.equal(validateAction({ type: 'cycle_presets', preset_ids: ['a', 'b'], dir: 1 }, 'x').dir, undefined, 'a forwards walk keeps the shape it had before there was a direction');
  bad(() => validateAction({ type: 'cycle_presets', preset_ids: ['a', 'b'], dir: 0 }, 'x'), 'a direction is forwards or backwards, nothing else');
  bad(() => validateAction({ type: 'cycle_presets', preset_ids: ['a', 'b'], dir: 'back' }, 'x'), 'a direction is a number');
});

// ───────────────────────── config ─────────────────────────

test('an empty config comes back as the documented defaults', () => {
  const c = validateConfig({});
  assert.strictEqual(c.version, 3);
  assert.deepStrictEqual(
    { d: c.settings.double_ms, h: c.settings.hold_ms, g: c.settings.group_on_level, f: c.settings.default_fade },
    { d: 350, h: 500, g: 100, f: 0.5 });
  assert.strictEqual(c.settings.power_on, 'restore');
  assert.strictEqual(c.settings.night_start, '22:00');
  assert.strictEqual(c.settings.night_end, '06:30');
  assert.strictEqual(c.settings.night_level, 30);
  assert.strictEqual(c.settings.auto_update, true, 'auto_update is on unless it is explicitly false');
  assert.strictEqual(c.settings.greeted, false);
  assert.strictEqual(c.settings.timezone, null);
  assert.strictEqual(c.settings.location, null);
  for (const k of ['groups', 'presets', 'bindings', 'favorites', 'schedules']) assert.deepStrictEqual(c[k], []);
  bad(() => validateConfig(null), 'a config that is not an object');
});

test('numbers are clamped, and nonsense falls back rather than throwing', () => {
  // a setting the person cannot reach from the app should not be able to break their home
  assert.strictEqual(validateConfig({ settings: { double_ms: 10 } }).settings.double_ms, 150);
  assert.strictEqual(validateConfig({ settings: { double_ms: 99999 } }).settings.double_ms, 1500);
  assert.strictEqual(validateConfig({ settings: { double_ms: 'soon' } }).settings.double_ms, 350);
  assert.strictEqual(validateConfig({ settings: { double_ms: 350.5 } }).settings.double_ms, 350, 'a non-integer is not clamped, it is replaced');
  assert.strictEqual(validateConfig({ settings: { group_on_level: 0 } }).settings.group_on_level, 1, 'a group turns on to something');
});

test('a clock is HH:MM on a 24-hour dial, or the default', () => {
  assert.strictEqual(validateConfig({ settings: { night_start: '23:59' } }).settings.night_start, '23:59');
  assert.strictEqual(validateConfig({ settings: { night_start: '00:00' } }).settings.night_start, '00:00');
  for (const t of ['24:00', '9:00', '22:60', 'evening', '22:00:00']) {
    assert.strictEqual(validateConfig({ settings: { night_start: t } }).settings.night_start, '22:00', `${t} falls back`);
  }
});

test('a location is rounded, and an impossible one is dropped', () => {
  const loc = validateConfig({ settings: { location: { lat: 40.44061234, lng: -79.99590987, name: 'Pittsburgh' } } }).settings.location;
  assert.deepStrictEqual(loc, { lat: 40.4406, lng: -79.9959, name: 'Pittsburgh' }, 'four decimals is about 11 metres');
  assert.strictEqual(validateConfig({ settings: { location: { lat: 91, lng: 0 } } }).settings.location, null);
  assert.strictEqual(validateConfig({ settings: { location: { lat: 0, lng: 181 } } }).settings.location, null);
  assert.strictEqual(validateConfig({ settings: { location: { lat: '40', lng: 0 } } }).settings.location, null);
});

test('a light kind carries its role, and a role already set is left alone', () => {
  const c = validateConfig({ settings: { light_kinds: { 'd1': 'desk-lamp' } } });
  assert.strictEqual(c.settings.light_kinds.d1, 'desk-lamp');
  assert.ok(c.settings.roles.d1, 'the kind fills in the role');
  const kept = validateConfig({ settings: { roles: { d1: 'accent' }, light_kinds: { d1: 'desk-lamp' } } });
  assert.strictEqual(kept.settings.roles.d1, 'accent', 'a role the person set is not overwritten by the kind');
  assert.deepStrictEqual(validateConfig({ settings: { roles: { d1: 'disco' } } }).settings.roles, {}, 'an unknown role is dropped');
  assert.deepStrictEqual(validateConfig({ settings: { light_kinds: { d1: 'not-a-kind' } } }).settings.light_kinds, {});
});

test('a device belongs to one room, and the first room wins', () => {
  const c = validateConfig({ settings: { rooms: [
    { id: 'r1', name: 'Kitchen', device_ids: ['d1', 'd2', 'd1'] },
    { id: 'r2', name: 'Office', device_ids: ['d2', 'd3'] },
  ] } });
  assert.deepStrictEqual(c.settings.rooms[0].device_ids, ['d1', 'd2']);
  assert.deepStrictEqual(c.settings.rooms[1].device_ids, ['d3'], 'd2 was already claimed, and is dropped quietly');
});

test('a room needs an id and a name, and ids cannot repeat', () => {
  bad(() => validateConfig({ settings: { rooms: [{ id: 'r1' }] } }), 'a room with no name');
  bad(() => validateConfig({ settings: { rooms: [{ id: 'r1', name: '   ' }] } }), 'a name that is only spaces');
  bad(() => validateConfig({ settings: { rooms: [{ name: 'Kitchen' }] } }), 'a room with no id');
  bad(() => validateConfig({ settings: { rooms: [{ id: 'a', name: 'X' }, { id: 'a', name: 'Y' }] } }), 'a duplicate room id');
  bad(() => validateConfig({ settings: { rooms: 'kitchen' } }), 'rooms that are not a list');
});

test('a room can stand for a bridge area or a Hue room, or for neither', () => {
  const r = validateConfig({ settings: { rooms: [
    { id: 'r1', name: 'A', bridge_area: 'area-2' },
    { id: 'r2', name: 'B', hue_room: 'hue_abc-1' },
    { id: 'r3', name: 'C' },
    { id: 'r4', name: 'D', bridge_area: 'hue_nope', hue_room: 'abc' },
  ] } }).settings.rooms;
  assert.strictEqual(r[0].bridge_area, 'area-2');
  assert.strictEqual(r[1].hue_room, 'hue_abc-1');
  assert.deepStrictEqual([r[2].bridge_area, r[2].hue_room], [null, null], 'a room with neither is still a room');
  assert.deepStrictEqual([r[3].bridge_area, r[3].hue_room], [null, null], 'a Hue id is not a bridge area, and the reverse');
});

test('groups and scenes are named, unique and deduped', () => {
  const c = validateConfig({ groups: [{ id: 'g1', name: '  Desk  ', device_ids: ['d1', 'd1', 'd2'] }] });
  assert.deepStrictEqual(c.groups[0], { id: 'g1', name: 'Desk', device_ids: ['d1', 'd2'], on_level: null });
  bad(() => validateConfig({ groups: [{ id: 'g1', name: '' , device_ids: [] }] }), 'a group with no name');
  bad(() => validateConfig({ groups: [{ id: 'g', name: 'A', device_ids: [] }, { id: 'g', name: 'B', device_ids: [] }] }), 'a duplicate group id');
  bad(() => validateConfig({ groups: [{ id: 'g1', name: 'A', device_ids: 'd1' }] }), 'device_ids that are not a list');
});

test('a scene holds a level, a fan speed, or a level with a colour', () => {
  const p = validateConfig({ presets: [{ id: 'p1', name: 'Movie', levels: {
    d1: 20, d2: 'Medium', d3: { level: 40, kelvin: 2700 }, d4: { level: 60, hex: '#FF8800' }, d5: { level: 80, follow: true },
  } }] }).presets[0];
  assert.deepStrictEqual(p.levels.d1, 20);
  assert.deepStrictEqual(p.levels.d2, 'Medium');
  assert.deepStrictEqual(p.levels.d3, { level: 40, kelvin: 2700 });
  assert.deepStrictEqual(p.levels.d4, { level: 60, hex: '#ff8800' }, 'the hex is stored one way here too');
  assert.deepStrictEqual(p.levels.d5, { level: 80, follow: true });
  // following the day and holding a colour are two different jobs
  bad(() => validateConfig({ presets: [{ id: 'p', name: 'X', levels: { d1: { level: 5, follow: true, kelvin: 3000 } } }] }), 'follow and a colour together');
  bad(() => validateConfig({ presets: [{ id: 'p', name: 'X', levels: { d1: { level: 101 } } }] }), 'a level over 100');
  bad(() => validateConfig({ presets: [{ id: 'p', name: 'X', levels: { d1: 'Turbo' } }] }), 'a speed that is not a speed');
  bad(() => validateConfig({ presets: [{ id: 'p', name: 'X', levels: 'all of them' }] }), 'levels that are not an object');
  bad(() => validateConfig({ presets: [{ id: 'p', name: 'X', levels: null }] }), 'no levels at all');
  // a list passes the typeof check and simply has no entries, so it lands as a scene that sets nothing
  assert.deepStrictEqual(validateConfig({ presets: [{ id: 'p', name: 'X', levels: [] }] }).presets[0].levels, {});
});

test('a scene belongs to a room whether or not it came from the five', () => {
  // Moods and scenes are one thing in the app now: a scene somebody made can be filed under a room, and
  // the room has to survive the round trip for that to mean anything. `mood` is only a note of which of
  // the five a scene came from, so the two fields stand alone.
  const cfg = validateConfig({ presets: [
    { id: 'a', name: 'Kitchen · Relax', levels: { 5: 40 }, area: '20', mood: 'relax', edited: false },
    { id: 'b', name: 'Kitchen · Pizza night', levels: { 5: 80 }, area: '20' },
    { id: 'c', name: 'Away', levels: { 5: 0 } },
    { id: 'd', name: 'Odd', levels: { 5: 10 }, area: '20', mood: 'pizza' },
  ] });
  const by = id => cfg.presets.find(p => p.id === id);
  assert.equal(by('a').area, '20'); assert.equal(by('a').mood, 'relax');
  assert.equal(by('b').area, '20', 'a scene made by hand keeps the room it was filed under');
  assert.equal(by('b').mood, null, 'and carries no suggestion it never came from');
  assert.equal(by('c').area, null, 'a scene with no room stays that way');
  assert.equal(by('d').mood, null, 'a suggestion id that is not one of the five is dropped');
  assert.equal(by('d').area, '20', 'without taking the room with it');
});

test('validateConfig returns a fresh document and never the one it was handed', () => {
  // the hub writes what comes back, so anything it did not validate must not survive
  const sneaky = { settings: { double_ms: 350, evil: true }, groups: [], extra_top_level: 1 };
  const out = validateConfig(sneaky);
  assert.notStrictEqual(out, sneaky);
  assert.strictEqual(out.extra_top_level, undefined, 'an unknown top-level key is not carried through');
  assert.strictEqual(out.settings.evil, undefined, 'an unknown setting is not carried through');
});
