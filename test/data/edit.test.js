// Changing the home (web/data/edit.js): rooms, scenes, kinds and roles, hiding and removing. On a real CasetaData
// instance, its CasetaHome and the real kinds table, with no browser and no hub.
const test = require('node:test');
const assert = require('node:assert');
const CD = require('../../web/data/caseta-data.js');
const CH = require('../../web/data/home.js');
const CE = require('../../web/data/edit.js');
const KIND_DEF = require('../../web/js/kinds.js');

function inventory() {
  return {
    devices: {
      1: { device_id: '1', name: 'Ceiling', domain: 'light', area: 'a1' },
      2: { device_id: '2', name: 'Floor lamp', domain: 'light', area: 'a1', ct: true, color: true },
      4: { device_id: '4', name: 'Fan', domain: 'fan', area: 'a1' },
      5: { device_id: '5', name: 'Island', domain: 'light', area: 'a2' },
      6: { device_id: '6', name: 'Shade', domain: 'cover', area: 'a2' },
    },
    buttons: {}, scenes: {},
    areas: { a1: { id: 'a1', name: 'Living room' }, a2: { id: 'a2', name: 'Kitchen' } },
  };
}
function setup(states = {}, extra = {}) {
  const d = CD.create();
  d.apply({ type: 'snapshot', inventory: inventory(), states, agent: { online: true }, activity: [],
    config: { version: 3, bindings: [], presets: [], groups: [], schedules: [], favorites: [], settings: {}, ...extra } });
  let n = 0;
  const uid = () => 'id' + (++n);
  const h = CH.create(d, { kinds: KIND_DEF, uid });
  const e = CE.create(d, h, { kinds: KIND_DEF, uid });
  return { d, h, e };
}

test('rooms: made with a free name, renamed, a device moved in, deleted', () => {
  const { d, e } = setup();
  const a = e.createRoom('');
  assert.equal(a.name, 'New room');
  assert.equal(e.createRoom('').name, 'New room 2');
  assert.equal(e.createRoom('kitchen').name, 'kitchen 2', 'a name already taken gets a number');
  e.renameRoom(a.id, '  Den  ');
  assert.equal(d.areaName(a.id), 'Den');
  e.renameRoom(a.id, '   ');
  assert.equal(d.areaName(a.id), 'Den', 'an empty name keeps the old one');
  assert.equal(e.moveDevice('5', a.id).id, a.id);
  assert.equal(d.devArea(d.dev('5')), a.id);
  assert.ok(!d.appRoom('a2').device_ids.includes('5'));
  e.deleteRoom(a.id);
  assert.equal(d.devArea(d.dev('5')), 'a2', 'deleting the room puts it back where its bridge has it');
});

test("what a room holds, in a few words", () => {
  const { e } = setup();
  assert.equal(e.roomContents('a1'), '2 · 1 fan');
  assert.equal(e.roomContents('a2'), '1 · 1 shade');
});

test('a scene: made from what is on, edited, filed under a room, and deleted with its buttons', () => {
  const { d, e } = setup({ 1: { level: 40 }, 2: { level: 80, color: { mode: 'ct', kelvin: 2700 } }, 5: { level: 0 } },
    { bindings: [{ device_id: 'p1', button: 1, actions: [{ type: 'preset', preset_id: 'id1' }, { type: 'level', target: 'd:1', level: 'on' }] }], favorites: [] });
  const p = e.newScene();
  assert.deepEqual(p.levels, { 1: 40, 2: { level: 80, kelvin: 2700 } }, 'the lights that are on, the lamp with its white');
  d.S.config.favorites.push('p:' + p.id);
  e.sceneSetLevel(p, '2', 30);
  assert.deepEqual(p.levels['2'], { level: 30, kelvin: 2700 }, 'a new level keeps the colour');
  e.sceneSetColour(p, '2', { hex: '#4C8DFF' });
  assert.deepEqual(p.levels['2'], { level: 30, hex: '#4c8dff' });
  e.sceneSetColour(p, '2', { follow: true });
  assert.deepEqual(p.levels['2'], { level: 30, follow: true });
  e.sceneSetColour(p, '2', null);
  assert.equal(p.levels['2'], 30);
  e.sceneInclude(p, '5', true);
  assert.equal(p.levels['5'], 0);
  e.sceneInclude(p, '5', false);
  assert.ok(!('5' in p.levels));
  e.sceneSetRoom(p, 'a1');
  assert.equal(p.name, 'Living room · New scene');
  e.renameScene(p, 'Reading');
  assert.equal(p.name, 'Living room · Reading', 'a scene in a room keeps the room in its name');
  assert.deepEqual(e.sceneDevices(p).map(x => x.device_id), ['1', '2']);
  e.sceneSetFade(p, 60);
  assert.equal(CE.fadeText(p.fade), '1 min');
  assert.ok(CE.FADES.every(f => f <= 60), 'nothing the hub would drop');
  assert.equal(CE.fadeText(null), '1 s');
  e.deleteScene(p.id);
  assert.equal(d.presets().length, 0);
  assert.deepEqual(d.bindings()[0].actions, [{ type: 'level', target: 'd:1', level: 'on' }], 'the button that ran it forgets it');
  assert.ok(!d.S.config.favorites.includes('p:' + p.id), 'and its star goes');
});

test('one of the five: changing it makes it yours, and it can go back to the suggestion', () => {
  const { d, h, e } = setup({ 1: { level: 100 } });
  h.suggestScenes('a1');
  const p = d.presets().find(x => x.mood === 'relax');
  e.sceneSetLevel(p, '1', 90);
  assert.equal(p.edited, true);
  assert.equal(e.sceneSuggest(p), true);
  assert.equal(p.edited, false);
  assert.deepEqual(p.levels, h.moodLevels('a1', CH.moodById('relax')));
});

test("a light's kind sets its role, and picking it again clears both", () => {
  const { d, h, e } = setup();
  assert.equal(e.setKind('2', 'floor-lamp'), 'floor-lamp');
  assert.equal(h.lightKind('2'), 'floor-lamp');
  assert.equal(d.S.config.settings.roles['2'], KIND_DEF.ROLES['floor-lamp']);
  e.setRole('2', 'task');
  assert.equal(h.lightRole('2'), 'task', 'what it is for can be set on its own');
  assert.equal(e.setKind('2', 'floor-lamp'), null);
  assert.equal(h.lightKind('2'), null);
  assert.equal(e.setKind('2', 'not-a-kind'), null);
});

test('hiding, and forgetting a removed device everywhere it was named', () => {
  const { d, e } = setup({}, {
    bindings: [{ device_id: 'p1', button: 1, actions: [{ type: 'level', target: ['d:1', 'd:5'], level: 'on' }] }, { device_id: 'p1', button: 2, actions: [{ type: 'level', target: 'd:1', level: 'off' }] }],
    schedules: [{ id: 's1', enabled: true, actions: [{ type: 'level', target: 'd:1', level: 50 }] }],
    presets: [{ id: 'x', name: 'X', levels: { 1: 50, 5: 20 } }], favorites: ['d:1'],
  });
  e.hideDevice('1'); e.hideDevice('1');
  assert.deepEqual(e.hidden(), ['1']);
  assert.ok(!d.devices().some(x => x.device_id === '1'));
  e.unhideDevice('1');
  assert.deepEqual(e.hidden(), []);
  e.forgetDevice('1');
  assert.deepEqual(d.bindings().map(b => b.actions), [[{ type: 'level', target: 'd:5', level: 'on' }]], 'a two-light button keeps the other, a one-light button goes');
  assert.equal(d.S.config.schedules.length, 0);
  assert.deepEqual(d.presets()[0].levels, { 5: 20 });
  assert.deepEqual(d.S.config.favorites, []);
  assert.equal(e.canRemove('1'), true);
  assert.equal(e.canRemove('hue_l1'), false);
});

test('adding a Lutron device: its name, the rooms offered, the bridge area it is made in, and filing it', () => {
  const { d, e } = setup();
  assert.equal(e.addTypeName('Pico3ButtonRaiseLower'), 'Pico 3-button remote with dimming');
  assert.equal(e.addTypeName('PlugInDimmer'), 'Plug-in dimmer');
  assert.equal(e.addDefaultName('PlugInDimmer'), 'New plug-in dimmer');
  assert.equal(e.addDefaultName('Pico2Button'), 'New remote');
  const rooms = e.addRooms();
  assert.deepEqual(rooms.map(r => r.name), ['Kitchen', 'Living room'], "the app's rooms, seeded from the bridge");
  const kitchen = rooms.find(r => r.name === 'Kitchen');
  assert.deepEqual(e.lutronHomeFor(kitchen.id), { id: 'a2', name: 'Kitchen', own: true });
  const den = e.createRoom('Den');
  assert.equal(e.lutronHomeFor(den.id).own, false, 'a room of the app only borrows one of the bridge areas');
  d.S.inv.devices[9] = { device_id: '9', name: 'New dimmer', domain: 'light', area: 'a1', serial: 'S9' };
  d.S.config.settings.hidden_devices = ['9'];
  assert.equal(e.fileNewDevice('9', 'S9', den.id), true);
  assert.equal(d.devArea(d.dev('9')), den.id, 'it lives where it was put, whatever area the bridge used');
  assert.deepEqual(e.hidden(), [], 'and a device removed once comes back');
});
