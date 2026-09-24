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

test('pinned to Home: lights and rooms in the order pinned, scenes and what is gone left out of the grid', () => {
  const { d, h } = setup({}, {}, { favorites: ['d:5', 'p:x', 'a:a1', 's:9', 'd:gone', 'd:4', 'a:nowhere'] });
  assert.deepEqual(h.pinned().map(p => [p.key, p.kind]), [['d:5', 'light'], ['a:a1', 'room'], ['d:4', 'light']], 'a fan pins as a light does');
  assert.equal(h.isPinned('a:a1'), true);
  assert.equal(h.isPinned('a:a2'), false);
  // a hidden light drops out of the grid; its key stays, so showing it again brings its pin back
  d.S.config.settings.hidden_devices = ['5'];
  assert.deepEqual(h.pinned().map(p => p.key), ['a:a1', 'd:4']);
  d.S.config.settings.hidden_devices = [];
  // pinning adds to the end, pinning again takes it off
  assert.equal(h.togglePin('a:a2'), true);
  assert.deepEqual(h.pinned().map(p => p.key), ['d:5', 'a:a1', 'd:4', 'a:a2']);
  assert.equal(h.togglePin('d:5'), false);
  assert.deepEqual(h.pinned().map(p => p.key), ['a:a1', 'd:4', 'a:a2']);
  assert.equal(h.unpin('d:4'), true);
  assert.equal(h.unpin('d:4'), false);
});

test('reordering the pins keeps the scenes and the keys not drawn where they were', () => {
  const { d, h } = setup({}, {}, { favorites: ['d:5', 'p:x', 'a:a1', 'd:gone', 'd:1', 's:9'] });
  h.setPinOrder(['d:1', 'd:5', 'a:a1']);
  assert.deepEqual(d.S.config.favorites, ['d:1', 'p:x', 'd:5', 'd:gone', 'a:a1', 's:9']);
  assert.deepEqual(h.pinned().map(p => p.key), ['d:1', 'd:5', 'a:a1']);
  // an order that leaves one out, or names one that is not pinned, still keeps every pin exactly once
  h.setPinOrder(['a:a1', 'd:nope']);
  assert.deepEqual(h.pinned().map(p => p.key), ['a:a1', 'd:1', 'd:5']);
  assert.equal(d.S.config.favorites.length, 6);
});

test('what is lit, the house level, and the pinned row in room order', () => {
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

test('the house: what a tap does, what the slider moves, and the long hold', () => {
  const { d, h } = setup({}, { 1: { level: 60 } }, { schedules: [
    { id: 's1', enabled: true, actions: [{ type: 'level', target: 'd:1', level: 80 }] },
    { id: 's2', enabled: false, actions: [{ type: 'level', target: 'd:2', level: 80 }] },
    { id: 's3', enabled: true, actions: [{ type: 'level', target: 'd:5', level: 'off' }] },
  ] });
  assert.deepEqual(h.autoOnLights(['1', '2', '5']), ['1'], 'only an enabled automation that turns a light on counts');
  assert.equal(h.powerLabel(), 'All off');
  assert.deepEqual(h.houseLevelTargets(), ['1'], 'with something on, the slider moves what is on');
  assert.equal(h.houseOnLabel(), 'All on', 'with something on, the house card offers every light');
  assert.deepEqual(h.houseOnAction(), { type: 'level', target: 'h:all', level: 'on' });
  d.S.states[1].level = 0;
  assert.equal(h.powerLabel(), 'Lights back on');
  assert.equal(h.houseOnLabel(), 'Lights back on');
  assert.deepEqual(h.houseOnAction(), { type: 'restore', target: 'h:all' });
  assert.deepEqual(h.powerOnAction(), { type: 'restore', target: 'h:all' });
  assert.deepEqual(h.houseLevelTargets().sort(), ['1', '2', '3', '5', 'hue_l1'], 'with nothing on, every light');
  d.S.config.settings.power_on = 'all';
  assert.equal(h.powerLabel(), 'All on');
  assert.deepEqual(h.powerOnAction(), { type: 'level', target: 'h:all', level: 'on' });
  assert.deepEqual(h.goodnightActions(), [{ type: 'level', target: 'h:all', level: 'off' }, { type: 'fan', target: 'd:4', speed: 'Off' }]);
});

test('Save this look: the room as lit, every light in it, a name that is not taken', () => {
  const { d, h } = setup({}, { 1: { level: 60 } });
  const aid = d.devArea(d.dev('1'));
  const p = h.saveRoomLook(aid);
  assert.ok(p && p.area === aid && p.edited === true);
  assert.equal(p.levels['1'], 60);
  for (const x of h.roomLights(aid)) assert.ok(x.device_id in p.levels, `${x.device_id} is in it`);
  assert.equal(p.name, `${d.areaName(aid)} · My look`);
  assert.equal(h.saveRoomLook(aid).name, `${d.areaName(aid)} · My look 2`);
});

test("a room's photograph, only when it has one", () => {
  const { d, h } = setup({ rooms: [{ id: 'r1', name: 'A', photo: 'v2' }, { id: 'r2', name: 'B' }] });
  d.S.token = 't k';
  assert.equal(h.roomPhotoURL('r1'), '/api/roomphoto/r1?token=t%20k&v=v2');
  assert.equal(h.roomPhotoURL('r2'), null);
});

// The owner ran Relax, then Default, and Relax stayed marked and said "already showing": Relax only names the lamp,
// Default leaves the lamp where it was and lights the ceiling, so both fit and Relax came first.
test('the scene a room is showing: the one run last wins, and one that leaves out a lit light loses', () => {
  const presets = [
    { id: 'relax', name: 'Living room · Relax', area: 'a1', levels: { 2: 40 } },
    { id: 'default', name: 'Living room · Default', area: 'a1', levels: { 1: 100, 2: 40 } },
  ];
  const { h } = setup({}, { 1: { level: 100 }, 2: { level: 40 } }, { presets });
  assert.equal(h.sceneMatch('a1'), 'default', 'Relax says nothing of the lit ceiling, so it is not what the room is showing');
  h.noteSceneRun('relax');
  assert.equal(h.sceneMatch('a1'), 'relax', 'run last, and still fitting, it wins');
  h.noteSceneRun('default');
  assert.equal(h.sceneMatch('a1'), 'default', 'Default run after it takes over');
});
