// The home's own rules (web/data/home.js): roles, the five suggested scenes, which scene a room is showing, what
// is lit, and the one-time seeding of the app's rooms. Tested on a real CasetaData instance and the real kinds
// table, with no browser.
const test = require('node:test');
const assert = require('node:assert');
const CD = require('../../web/data/caseta-data.js');
const CH = require('../../web/data/home.js');
const KIND_DEF = require('../../web/js/kinds.js');

// Living room: a ceiling light, a lamp, a switch, a fan. Kitchen: one light. A Hue room with one lamp.
function inventory() {
  return {
    devices: {
      1: { device_id: '1', name: 'Ceiling', domain: 'light', area: 'a1' },
      2: { device_id: '2', name: 'Floor lamp', domain: 'light', area: 'a1' },
      3: { device_id: '3', name: 'Outlet', domain: 'switch', area: 'a1' },
      4: { device_id: '4', name: 'Fan', domain: 'fan', area: 'a1' },
      5: { device_id: '5', name: 'Island', domain: 'light', area: 'a2' },
      hue_l1: { device_id: 'hue_l1', name: 'Hue lamp', domain: 'light', area: 'hue_r1' },
    },
    buttons: {}, scenes: {},
    areas: { a1: { id: 'a1', name: 'Living room' }, a2: { id: 'a2', name: 'Kitchen' }, hue_r1: { id: 'hue_r1', name: 'Den' } },
  };
}
function setup(settings = {}, states = {}, extra = {}) {
  const d = CD.create();
  d.apply({ type: 'snapshot', inventory: inventory(), states, agent: { online: true }, activity: [],
    config: { version: 3, bindings: [], presets: [], groups: [], schedules: [], favorites: [], settings, ...extra } });
  let n = 0;
  const h = CH.create(d, { kinds: KIND_DEF, uid: () => 'id' + (++n) });
  return { d, h };
}

test('a first guess at a role from the name', () => {
  assert.equal(CH.guessRole('Kitchen island'), 'task');
  assert.equal(CH.guessRole('Floor lamp'), 'accent');
  assert.equal(CH.guessRole('Display shelf'), 'decor');
  assert.equal(CH.guessRole('Ceiling'), 'ambient');
});

test("a light's role: set by hand first, then from its kind", () => {
  const { h } = setup({ roles: { 1: 'task' }, light_kinds: { 2: 'floor-lamp' } });
  assert.equal(h.lightRole('1'), 'task');
  assert.equal(h.lightRole('2'), KIND_DEF.ROLES['floor-lamp']);
  assert.equal(h.lightRole('5'), null, 'nothing known is nothing, not a guess');
});

test('in a room where no light has a role, every light takes the head level, the switch only in Bright', () => {
  const { h } = setup();
  const relax = h.moodLevels('a1', CH.moodById('relax'));
  assert.deepEqual(relax, { 1: 40, 2: 40, 3: 0 }, 'the fan is left alone and the switch is off');
  assert.equal(h.moodLevels('a1', CH.moodById('bright'))[3], 100, 'the switch is on in Bright');
});

test('with roles, each light takes its role; a look that would leave the room dark keeps a floor', () => {
  const { h } = setup({ roles: { 1: 'ambient', 2: 'accent' } });
  assert.deepEqual(h.moodLevels('a1', CH.moodById('relax')), { 1: 35, 2: 60, 3: 0 });
  const k = setup({ roles: { 5: 'task' } }).h;
  assert.deepEqual(k.moodLevels('a2', CH.moodById('movie')), { 5: 15 }, 'task is 0 in Movie, so the main light keeps 15');
});

test('Night lights one lamp: an accent at 10, else the main light at 5', () => {
  assert.deepEqual(setup({ roles: { 1: 'ambient', 2: 'accent' } }).h.moodLevels('a1', CH.moodById('night')), { 1: 0, 2: 10, 3: 0 });
  assert.deepEqual(setup({ roles: { 1: 'ambient', 2: 'task' } }).h.moodLevels('a1', CH.moodById('night')), { 1: 5, 2: 0, 3: 0 });
  assert.deepEqual(setup().h.moodLevels('a1', CH.moodById('night')), { 1: 5, 2: 5, 3: 0 }, 'untagged, every dimmer at the head level');
});

test('which look the lights are showing: within two per cent, a switch by on or off, never all dark', () => {
  const { h } = setup({}, { 1: { level: 41 }, 2: { level: 38 }, 3: { level: 0 } });
  assert.equal(h.levelsMatch({ 1: 40, 2: 40, 3: 0 }), true);
  assert.equal(h.levelsMatch({ 1: 40, 2: 35 }), false, 'three off is not within two');
  assert.equal(setup({}, { 1: { level: 0 }, 2: { level: 0 } }).h.levelsMatch({ 1: 0, 2: 0 }), false, 'a dark room is not in a scene');
  assert.equal(h.suggestedMatch('a1'), 'relax');
});

test("a room's scenes: the five first in their order, then the rest as they were made", () => {
  const { h } = setup({}, {}, { presets: [
    { id: 'm', name: 'Mine', area: 'a1', levels: {} },
    { id: 'n', name: 'Living room · Night', area: 'a1', mood: 'night', levels: {} },
    { id: 'b', name: 'Living room · Bright', area: 'a1', mood: 'bright', levels: {} },
    { id: 'm2', name: 'Also mine', area: 'a1', levels: {} },
    { id: 'k', name: 'Kitchen thing', area: 'a2', levels: {} },
  ] });
  assert.deepEqual(h.roomScenes('a1').map(p => p.id), ['b', 'n', 'm', 'm2']);
  assert.deepEqual(h.roomSuggested('a1').map(p => p.id), ['b', 'n']);
  assert.equal(h.sceneShortName(h.roomScenes('a1')[0]), 'Bright', "the room's name comes off on the room's own page");
  assert.equal(h.sceneShortName({ name: 'Mine', area: 'a1' }), 'Mine');
});

test('the five are written once, refreshed after, and one the person edited is left alone', () => {
  const { d, h } = setup({ roles: { 1: 'ambient', 2: 'accent' } });
  assert.deepEqual(h.suggestScenes('a1'), { made: 5, kept: 0 });
  assert.equal(d.presets().length, 5);
  const relax = d.presets().find(p => p.mood === 'relax');
  assert.equal(relax.name, 'Living room · Relax');
  assert.deepEqual(relax.levels, { 1: 35, 2: 60, 3: 0 });
  relax.edited = true; relax.levels = { 1: 1 };
  assert.deepEqual(h.suggestScenes('a1'), { made: 4, kept: 1 });
  assert.equal(d.presets().length, 5, 'refreshed in place, nothing added');
  assert.deepEqual(relax.levels, { 1: 1 }, 'an edited one is theirs');
});

test('old eight-second fades are brought forward once, and only where nobody chose them', () => {
  const { d, h } = setup({}, {}, { presets: [
    { id: 'a', mood: 'movie', fade: 8, levels: {} },
    { id: 'b', mood: 'movie', fade: 8, edited: true, levels: {} },
    { id: 'c', mood: 'relax', fade: 5, levels: {} },
    { id: 'e', fade: 8, levels: {} },
  ] });
  assert.equal(h.shortenSuggestedFades(), 1);
  assert.deepEqual(d.presets().map(p => p.fade), [1, 8, 5, 8]);
  assert.equal(h.shortenSuggestedFades(), 0, 'a second pass changes nothing');
});

test("the bridges' rooms seed the app's, once, ids and all", () => {
  const { d, h } = setup();
  assert.equal(h.ensureRooms(), true);
  const s = d.S.config.settings;
  assert.equal(s.rooms_seeded, true);
  assert.deepEqual(s.rooms.map(r => [r.id, r.name, r.bridge_area, r.hue_room]),
    [['hue_r1', 'Den', null, 'hue_r1'], ['a2', 'Kitchen', 'a2', null], ['a1', 'Living room', 'a1', null]]);
  s.rooms.pop();
  assert.equal(h.ensureRooms(), false, 'never again, even with a room gone');
  assert.equal(s.rooms.length, 2);
});

test('a home seeded before the flag existed is marked, not seeded again', () => {
  const { d, h } = setup({ rooms: [{ id: 'r1', name: 'Mine', device_ids: [] }] });
  assert.equal(h.ensureRooms(), true);
  assert.deepEqual(d.S.config.settings.rooms.map(r => r.id), ['r1']);
});

test('a device the bridges stopped reporting leaves its room, but not while the home is not answering', () => {
  const { d, h } = setup({ rooms_seeded: true, rooms: [{ id: 'r1', name: 'Mine', device_ids: ['1', 'gone'] }] });
  assert.equal(h.ensureRooms(), true);
  assert.deepEqual(d.S.config.settings.rooms[0].device_ids, ['1']);
  d.S.config.settings.rooms[0].device_ids.push('gone2');
  d.S.inv = { devices: {}, areas: {} };
  assert.equal(h.pruneRooms(), false, 'an empty inventory is a connector coming back');
  assert.deepEqual(d.S.config.settings.rooms[0].device_ids, ['1', 'gone2']);
});

test('what is lit, the house level, and the starred row in room order', () => {
  const { h } = setup({}, { 1: { level: 80 }, 2: { level: 40 }, 5: { level: 0 }, hue_l1: { level: 30 } }, { favorites: ['d:5', 'd:2', 'd:hue_l1', 'a:a1'] });
  assert.deepEqual(h.litLights().map(x => x.device_id).sort(), ['1', '2', 'hue_l1']);
  assert.equal(h.houseLevel(), 50);
  assert.deepEqual(h.rowLights().map(x => x.device_id), ['hue_l1', '5', '2'], 'Den, Kitchen, Living room');
  assert.equal(h.roomMean('a1'), 40, 'the switch counts as a light at 0');
});

test('a loop of scenes is named for its room only when it is all of them', () => {
  const { d, h } = setup();
  h.suggestScenes('a1');
  const ids = h.roomScenes('a1').map(p => p.id);
  assert.equal(d.describe([{ type: 'cycle_presets', preset_ids: ids }]), "Steps through Living room's scenes");
  assert.equal(d.describe([{ type: 'cycle_presets', preset_ids: ids.slice(0, 3) }]), 'Steps through 3 scenes');
});
