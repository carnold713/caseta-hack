// Follow the day (web/data/daylight.js). The app's curve has to be the connector's curve: the light's page says
// what white a lamp is on, and the connector is what actually sets it. Two tests hold them together. One reads
// agent/daylight.py and compares the anchor tables. The other runs the connector's own Python at a spread of
// moments through a day and requires the same kelvin from both, which is the check that matters: two equal
// tables interpolated two different ways would pass the first and fail this one.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const CD = require('../../web/data/caseta-data.js');
const DL = require('../../web/data/daylight.js');

const AGENT = path.join(__dirname, '..', '..', 'agent');

// A September day in a UTC home, so both sides read the same wall clock.
const SUN = { sunrise: '2026-09-22T06:05:00Z', sunset: '2026-09-22T18:15:00Z', noon: '2026-09-22T12:10:00Z' };
function setup(opts = {}) {
  const d = CD.create();
  d.apply({ type: 'snapshot', inventory: { devices: {
    hue_a: { device_id: 'hue_a', name: 'Lamp', domain: 'light', area: 'a', ct: true, ct_range: [2200, 6500] },
    dim: { device_id: 'dim', name: 'Dimmer', domain: 'light', area: 'a' },
  } }, states: opts.states || {}, agent: { online: true }, config: { settings: opts.settings || {} } });
  d.apply({ type: 'sun', sun: SUN });
  return { d, day: DL.create(d, { now: opts.now || (() => Date.parse('2026-09-22T15:00:00Z')) }) };
}

test("the anchor table is the connector's, entry for entry", () => {
  const py = fs.readFileSync(path.join(AGENT, 'daylight.py'), 'utf8');
  // from the assignment to the line that closes the list (the type annotation has brackets of its own)
  const at = py.indexOf('ANCHORS: List');
  const block = py.slice(py.indexOf('= [', at), py.indexOf('\n]', at));
  const theirs = [...block.matchAll(/\("(\w+)",\s*(-?\d+),\s*(\d+)\)/g)].map(m => [m[1], Number(m[2]), Number(m[3])]);
  assert.ok(theirs.length >= 6, 'read the table out of agent/daylight.py');
  assert.deepEqual(DL.FOLLOW_ANCHORS, theirs, 'change one and change the other');
});

test('the same kelvin as the connector at every moment through a day', t => {
  const moments = [];
  for (let m = 0; m < 24 * 60; m += 37) moments.push(new Date(Date.parse('2026-09-22T00:00:00Z') + m * 60000).toISOString());
  const script = `
import sys, json
from datetime import datetime
sys.path.insert(0, ${JSON.stringify(AGENT)})
import daylight as dl
p = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
day = dl.Day(sunrise=p(${JSON.stringify(SUN.sunrise)}), sunset=p(${JSON.stringify(SUN.sunset)}), noon=p(${JSON.stringify(SUN.noon)}))
of = dl._fixed_day_of(day)
print(json.dumps([dl.kelvin_at(p(m), of) for m in json.loads(sys.argv[1])]))`;
  let py;
  try { py = JSON.parse(execFileSync('python3', ['-c', script, JSON.stringify(moments)], { encoding: 'utf8' })); }
  catch (e) { t.skip(`python3 could not run the connector's curve here (${String(e.message).split('\n')[0]})`); return; }
  const { day } = setup();
  const js = moments.map(m => day.followKelvin(new Date(m)));
  const off = moments.map((m, i) => [m.slice(11, 16), js[i], py[i]]).filter(([, a, b]) => Math.abs(a - b) > 1);
  assert.deepEqual(off, [], 'time, app, connector');
});

test('the curve at a few moments a person would check', () => {
  const { day } = setup();
  assert.equal(day.followKelvin(new Date(SUN.noon)), 5200, 'noon is the top of the day');
  assert.equal(day.followKelvin(new Date(SUN.sunset)), 2900, 'sunset');
  assert.equal(day.followKelvin(new Date('2026-09-22T00:10:00Z')), 2000, 'solar midnight is the deepest');
  assert.equal(day.followWhen(new Date('2026-09-22T15:00:00Z')), 'because it is mid-afternoon');
  assert.equal(day.followWhen(new Date('2026-09-22T18:40:00Z')), 'because the sun is going down');
});

test("a lamp is only ever asked for a white it can show", () => {
  const { day } = setup();
  assert.equal(day.followKelvinFor('hue_a', new Date('2026-09-22T00:10:00Z')), 2200, 'clamped to the lamp\'s own warm end');
});

test('with no location there is no curve, and the page says nothing rather than something wrong', () => {
  const d = CD.create();
  const day = DL.create(d);
  assert.equal(day.followReady(), false);
  assert.equal(day.followKelvin(), null);
  assert.equal(day.followWhen(), '');
});

test('who follows: the setting, the connector\'s own word, and paused', () => {
  const { d, day } = setup({ settings: { follow_day: { device_ids: ['hue_a'], brightness: false } } });
  assert.equal(day.isFollowing('hue_a'), true);
  assert.equal(day.canFollow(d.dev('dim')), false, 'a dimmer with no white is never offered it');
  d.apply({ type: 'follow', follow: { ids: ['hue_a'], paused: ['hue_a'] } });
  assert.equal(day.followPaused('hue_a'), true, 'set by hand, it stops following until it is turned off');
  day.setFollowIds(['hue_a', 'x'], false); day.setFollowIds('y', true);
  assert.deepEqual(d.S.config.settings.follow_day.device_ids, ['y']);
  day.setFollowBrightness(true);
  assert.equal(day.followBright(), true);
});

test('the words for what a lamp is doing', () => {
  const { day } = setup({ states: { hue_a: { level: 60, color: { mode: 'ct', kelvin: 3450 } } }, settings: { follow_day: { device_ids: ['hue_a'] } } });
  assert.equal(day.followNowText('hue_a'), 'Soft white, 3450 K, because it is mid-afternoon', 'what it is really showing');
  const off = setup().day;
  assert.match(off.followNowText('hue_a'), /^Off just now\. When you turn it on: /);
  assert.equal(DL.warmthName(2700), 'Warm');
  assert.equal(DL.warmthName(6500), 'Daylight');
});
