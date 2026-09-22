// Remotes (web/data/remotes.js): which key is which, what a press is set to do and how that is said, the ready-made
// ways, the usual layout, and learning a remote's numbering from its own presses. On a real CasetaData instance.
const test = require('node:test');
const assert = require('node:assert');
const CD = require('../../web/data/caseta-data.js');
const CH = require('../../web/data/home.js');
const CR = require('../../web/data/remotes.js');
const KIND_DEF = require('../../web/js/kinds.js');

function inventory(buttons = true) {
  const b = {};
  if (buttons) for (const n of [0, 1, 2, 3, 4]) b[`p1-${n}`] = { device_id: 'p1', button_number: n };
  return {
    devices: {
      1: { device_id: '1', name: 'Ceiling', domain: 'light', area: 'a1' },
      2: { device_id: '2', name: 'Floor lamp', domain: 'light', area: 'a1' },
      4: { device_id: '4', name: 'Fan', domain: 'fan', area: 'a1' },
      5: { device_id: '5', name: 'Island', domain: 'light', area: 'a2' },
      6: { device_id: '6', name: 'Hall light', domain: 'light', area: 'a3' },
      p1: { device_id: 'p1', name: 'Kitchen Pico', domain: 'pico', type: 'Pico3ButtonRaiseLower', area: 'a2' },
      p2: { device_id: 'p2', name: 'Bed Pico', domain: 'pico', type: 'Pico2Button', area: 'a1' },
    },
    buttons: b, scenes: { s9: { scene_id: 's9', name: 'Evening' } },
    areas: { a1: { id: 'a1', name: 'Living room' }, a2: { id: 'a2', name: 'Kitchen' }, a3: { id: 'a3', name: 'Hall' } },
  };
}
function setup(extra = {}, buttons = true) {
  const d = CD.create();
  d.apply({ type: 'snapshot', inventory: inventory(buttons), states: { 1: { level: 40 } }, agent: { online: true }, activity: [],
    config: { version: 3, bindings: [], presets: [], groups: [], schedules: [], favorites: [], settings: { night_start: '22:30', night_end: '06:30' }, ...extra } });
  let n = 0;
  const uid = () => 'id' + (++n);
  const h = CH.create(d, { kinds: KIND_DEF, uid });
  const r = CR.create(d, h, { uid });
  return { d, h, r };
}

test('keys by where they sit, and the line under the name', () => {
  const { d, r } = setup();
  const p1 = d.dev('p1');
  assert.equal(r.modelFor(p1), 'PJ2-3BRL');
  assert.deepEqual(r.buttonNumbers(p1), [0, 3, 4, 1, 2]);
  assert.equal(r.buttonName('p1', 0), 'Top button');
  assert.equal(r.buttonName('p1', 3), 'Up arrow');
  assert.equal(r.buttonName('p1', 1), 'Middle button');
  assert.equal(r.buttonName('p1', 2), 'Bottom button');
  assert.equal(r.modelLine(p1), 'Kitchen · White · 3-button with arrows');
  assert.deepEqual(r.arrowPair('p1'), { up: 3, down: 4 });
  r.setLook('p1', 'finish', 'black');
  assert.equal(r.modelLine(p1), 'Kitchen · Black · 3-button with arrows');
});

test('a ready-made way on a press, said in a few words, with a night version on top', () => {
  const { d, r } = setup();
  assert.deepEqual(r.targetsOf('p1', 0, 'single'), ['a:a2'], "the remote's own room to start with");
  const got = r.applyRecipe('p1', 0, 'single', false, 'on', 'a:a2');
  assert.deepEqual(got.actions, [{ type: 'level', target: 'a:a2', level: 'on' }]);
  assert.equal(r.shortDescribe(r.gestureActions('p1', 0, 'single')), 'Turn on · Kitchen');
  assert.equal(r.applyRecipe('p1', 0, 'double', true, 'night', 'a:a2').needsNormal, true, 'no night version without a press under it');
  r.applyRecipe('p1', 0, 'single', true, 'night', 'a:a2');
  assert.equal(r.shortDescribe(r.gestureActions('p1', 0, 'single', true)), 'Nightlight level · Kitchen');
  // changing the normal press keeps the night version
  r.applyRecipe('p1', 0, 'single', false, 'toggle', 'a:a2');
  assert.equal(r.gestureActions('p1', 0, 'single', true)[0].level, 10);
  assert.equal(r.applyRecipe('p1', 0, 'single', false, 'scene', 'a:a2').pick, 'scene');
  assert.equal(r.remoteStatus(d.dev('p1')).text, 'Kitchen · 1 of 5 set');
});

test('a hold is a start and a stop, and a hold that follows the press is worked out', () => {
  const { d, r } = setup();
  r.applyRecipe('p1', 0, 'hold', false, 'hold_up', 'a:a2');
  const bs = d.bindings().filter(b => b.button_number === 0).map(b => b.gesture).sort();
  assert.deepEqual(bs, ['hold_end', 'hold_start']);
  assert.equal(r.shortDescribe(r.gestureActions('p1', 0, 'hold')), 'Brighten while held · Kitchen');
  r.applyRecipe('p1', 3, 'single', false, 'up', 'a:a2');
  assert.deepEqual(r.inheritedHold('p1', 3), { dir: 'up', target: 'a:a2' });
  r.applyRecipe('p1', 0, 'hold', false, 'nothing');
  assert.equal(d.bindings().filter(b => b.button_number === 0).length, 0);
});

test('the suggested five change with the press and the key', () => {
  const { r } = setup();
  assert.deepEqual(r.suggested('p1', 0, 'single', 'a:a2').map(x => x.id), ['on', 'toggle', 'back', 'scene', 'goodnight']);
  assert.equal(r.suggested('p1', 3, 'single', 'a:a2')[0].id, 'up', 'an arrow leads with a nudge');
  assert.deepEqual(r.suggested('p1', 0, 'single', 'd:4').map(x => x.id), ['fan_up', 'fan_down']);
  assert.ok(r.suggested('p1', 0, 'hold', 'a:a2').every(x => x.id !== 'on'));
  const groups = r.allWays('p1', 0, 'single', 'a:a2').map(g => g[0]);
  assert.ok(groups.includes('Brightness') && !groups.includes('Fans'));
});

test('stepping through scenes on arrows writes both, forwards and back', () => {
  const { d, r } = setup({ presets: [{ id: 'x', name: 'A', levels: { 5: 50 } }, { id: 'y', name: 'B', levels: { 5: 10 } }] });
  assert.equal(r.saveCycle('p1', 3, 'single', false, ['x', 'y']), 2);
  assert.deepEqual(r.gestureActions('p1', 4, 'single'), [{ type: 'cycle_presets', preset_ids: ['x', 'y'], dir: -1 }]);
  assert.equal(r.saveCycle('p1', 0, 'single', false, ['x']), 0, 'one scene is no walk');
  d.S.config.presets = d.S.config.presets.filter(p => p.id !== 'y');
  assert.equal(r.buttonBroken('p1', 3), true, 'a walk through a scene that is gone points at nothing');
  assert.equal(r.remoteStatus(d.dev('p1')).error, true);
});

test('the usual layout, and leaving', () => {
  const { d, r } = setup();
  const list = r.applyUsualLayout('p1');
  assert.ok(list.some(b => b.button_number === 0 && b.gesture === 'single' && b.actions[0].level === 'on'));
  assert.ok(list.some(b => b.button_number === 3 && b.actions[0].type === 'step'));
  assert.equal(r.remoteStatus(d.dev('p1')).text, 'Kitchen · 5 of 5 set');
  const acts = r.saveLeaving('p2', 2, 'hold', 'd:6');
  assert.deepEqual(acts.slice(0, 3), [{ type: 'level', target: 'h:all', level: 'off', fade: 2 }, { type: 'level', target: 'd:6', level: 'on', fade: 1 }, { type: 'timer', target: 'd:6', minutes: 2, level: 0, fade: 10 }]);
  assert.ok(acts.some(a => a.type === 'fan'), 'the house has a fan, so it stops too');
  assert.equal(r.recipeOf(acts), 'leaving');
  assert.equal(r.clearRemote('p1'), list.length);
});

test('a remote with no buttons listed learns its keys from its presses, and what was set moves with them', () => {
  const { d, r } = setup({}, false);
  r.applyRecipe('p1', 0, 'single', false, 'on', 'a:a2');
  assert.equal(r.rememberPress('p1', 1), true);
  assert.equal(r.rememberPress('p1', 1), false, 'once is enough');
  for (const n of [2, 3, 4, 5]) r.rememberPress('p1', n);
  // this remote numbers from 1: the top key is 1
  assert.equal(r.slots(d.dev('p1'))[0].n, 1);
  assert.equal(d.bindings()[0].button_number, 1);
});

test('steps edited one field at a time', () => {
  const { r } = setup();
  const list = r.stepsFor('p1', 0, 'single', false);
  list.push(r.freshAction('level', 'a:a2'));
  r.editAction(list, 0, 'level', '40');
  r.editAction(list, 0, 'fade', '3');
  list.push(r.freshAction('delay', 'a:a2'));
  r.editAction(list, 1, 'ms', '2000');
  r.editAction(list, 1, 'type', 'scene');
  assert.deepEqual(list, [{ type: 'level', target: 'a:a2', level: 40, fade: 3 }, { type: 'scene', scene_id: 's9' }]);
  assert.equal(r.stepsFor('p1', 1, 'single', true), null, 'no night steps on a press that is not set');
});
