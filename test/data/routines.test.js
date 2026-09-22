// Routines (web/data/routines.js): the sentences, the off pair, when one runs next and skipping it, the guided
// setups and the wind-down numbers. Time is pinned to a known moment in the home's own zone.
const test = require('node:test');
const assert = require('node:assert');
const CD = require('../../web/data/caseta-data.js');
const CH = require('../../web/data/home.js');
const CR = require('../../web/data/remotes.js');
const CT = require('../../web/data/routines.js');
const KIND_DEF = require('../../web/js/kinds.js');

// Wednesday 2026-09-23, 14:00 in Denver (20:00 UTC)
const NOW = Date.parse('2026-09-23T20:00:00Z');
function setup(extra = {}, settings = {}) {
  const d = CD.create();
  d.apply({ type: 'snapshot', agent: { online: true }, activity: [], states: {},
    inventory: {
      devices: {
        1: { device_id: '1', name: 'Porch light', domain: 'light', area: 'a1' },
        2: { device_id: '2', name: 'Bedside lamp', domain: 'light', area: 'a2' },
        3: { device_id: '3', name: 'Bedroom shade', domain: 'cover', area: 'a2' },
        p1: { device_id: 'p1', name: 'Bed Pico', domain: 'pico', type: 'Pico3ButtonRaiseLower', area: 'a2' },
      },
      buttons: {}, scenes: {},
      areas: { a1: { id: 'a1', name: 'Porch' }, a2: { id: 'a2', name: 'Bedroom' } },
    },
    config: { version: 3, bindings: [], presets: [], groups: [], schedules: [], favorites: [],
      settings: { timezone: 'America/Denver', night_start: '22:30', night_end: '06:30', night_level: 25, location: { lat: 39.7, lng: -105, name: 'Denver' }, adaptive: { enabled: true, winddown: { sunset_offset_min: 30, earliest: '18:00', latest: '20:00', from_level: 100, to_level: 50, morning_level: 60, morning_until: '07:30' } }, ...settings }, ...extra } });
  d.S.sun = { sunrise: '2026-09-23T12:52:00Z', sunset: '2026-09-24T01:02:00Z' };   // 6:52 am and 7:02 pm in Denver
  let n = 0;
  const uid = () => 'id' + (++n);
  const h = CH.create(d, { kinds: KIND_DEF, uid });
  const r = CR.create(d, h, { uid });
  const t = CT.create(d, h, r, { uid, now: () => NOW, phoneTZ: () => 'America/Los_Angeles' });
  return { d, t, r };
}

test('time is the home clock, said the way the file says it', () => {
  const { t } = setup();
  assert.equal(t.today(), '2026-09-23');
  assert.equal(t.nowHm(), '14:00');
  assert.equal(CT.fmtTime('23:00'), '11:00 pm');
  assert.equal(CT.fmtTime('06:05'), '6:05 am');
  assert.equal(t.sunAt('sunset', 30), '19:32');
  assert.deepEqual(t.zoneClash(), { home: 'America/Denver', phone: 'America/Los_Angeles', homeName: 'Mountain', phoneName: 'Pacific' });
});

test('a new routine, its sentence, an off time folded in, and a name it keeps once typed', () => {
  const { t, d } = setup();
  const sc = t.newRoutine();
  assert.equal(sc.name, 'Bedroom on', 'the first room, on at sunset');
  t.setTargets(sc, ['a:a1'], []);
  assert.equal(sc.name, 'Porch on');
  assert.equal(t.sentence(sc), 'Porch on at sunset');
  t.setWhen(sc, { type: 'sunset', time: null, offset_min: 30 });
  assert.equal(t.whenValue(sc.at), 'Sunset + 30 min (7:32 pm today)');
  assert.deepEqual(t.whenTokens(sc.at), ['Sunset', '+ 30 min']);
  t.setOff(sc, { type: 'time', time: '23:00', offset_min: 0 });
  assert.equal(sc.name, 'Porch', 'with an off pair the sentence already says on and off');
  assert.equal(t.sentence(sc), 'Porch on 30 min after sunset, off at 11:00 pm');
  assert.equal(t.list().length, 1, 'the pair is one routine');
  t.setOnlyIf(sc, 'all_off');
  assert.ok(t.sentence(sc).endsWith('if everything is off'));
  t.rename(sc, 'Porch at dusk');
  t.setDays(sc, [1, 2, 3, 4, 5]);
  assert.equal(sc.name, 'Porch at dusk', 'a typed name stays');
  assert.deepEqual(t.pairOf(sc).days, [1, 2, 3, 4, 5]);
  assert.equal(t.toggleDay(sc, 3), true);
  assert.equal(t.daysText(sc.days), 'Mon, Tue, Thu, Fri');
  t.setRecipe(sc, 'off', ['a:a1'], []);
  assert.equal(t.pairOf(sc), null, 'turning off needs no off again');
  t.remove(sc.id);
  assert.equal(d.S.config.schedules.length, 0);
});

test('next run, skipping it and the Up next card', () => {
  const { t } = setup();
  const sc = t.newRoutine();
  t.setOff(sc, { type: 'time', time: '23:00', offset_min: 0 });
  const n = t.nextRunOf(sc);
  assert.equal(n.date, '2026-09-23'); assert.equal(n.time, '7:02 pm');
  assert.equal(t.skipLabel(sc), 'Skip tonight');
  const up = t.upNext();
  assert.equal(up.title, sc.name); assert.equal(up.icon, 'sunset'); assert.equal(up.skipLabel, 'Skip tonight');
  assert.match(t.skip(sc), /skip tonight\. Back tomorrow at 7:0\d pm\./);
  assert.equal(t.pairOf(sc).skip_until, '2026-09-23', 'the off half skips with it');
  assert.equal(t.skipLabel(sc), "Don't skip");
  t.unskip(sc);
  assert.equal(t.setEnabled(sc, false), `${sc.name} paused`);
  assert.equal(t.nextLine(sc), 'Paused');
  assert.equal(t.upNext(), null);
});

test('welcome lights: a clock time on weekdays only if dark, off at bedtime', () => {
  const { t, d } = setup();
  const g = t.welcomeStart();
  assert.deepEqual(g.targets, ['a:a1'], 'the outside room first');
  assert.equal(t.welcomeSummary(g), 'Porch comes on at 6:00 pm on weekdays, only if the house is dark, and goes off at bedtime (10:30 pm).');
  const out = t.saveWelcome(g);
  assert.equal(out.length, 2);
  assert.equal(out[0].only_if, 'all_off'); assert.deepEqual(out[0].days, [1, 2, 3, 4, 5]);
  assert.equal(out[1].id, out[0].id + '-off'); assert.equal(out[1].at.time, '22:30');
  assert.equal(t.list().length, 1);
  g.arrive = 'sunset'; g.low = true; g.days = [0, 1, 2, 3, 4, 5, 6];
  t.saveWelcome(g);
  assert.ok(d.S.config.schedules.some(s => s.name === 'Outside lights, overnight'), 'outside lights stay low overnight');
});

test('wake-up light and the Goodnight button', () => {
  const { t, d, r } = setup();
  const g = t.wakeupStart();
  assert.equal(g.lamp, '2');
  g.shade = true;
  assert.equal(t.wakeupSummary(g), 'Bedside lamp starts rising at 6:05 am and reaches 50% by 6:30 am on weekdays. Skipped if it is already on. Bedroom shade opens at 6:30 am.');
  const out = t.saveWakeup(g);
  assert.equal(out[0].actions[0].fade, 1500);
  assert.equal(out[1].actions[0].type, 'raise');
  const b = t.buttonStart('goodnight');
  assert.equal(b.remote, 'p1'); assert.equal(b.button, 2, 'the bottom key');
  assert.match(t.buttonSummary(b), /^Hold the bottom button on Bed Pico: everything goes off/);
  t.saveButton(b);
  assert.equal(r.recipeOf(r.gestureActions('p1', 2, 'hold')), 'goodnight');
  assert.equal(d.bindings().length, 1);
});

test('the wind-down numbers', () => {
  const { t, d } = setup();
  assert.equal(CT.winddownLevel('21:00', '19:32', '22:30', '06:30', 100, 50, 25), 75);
  assert.equal(CT.winddownLevel('23:00', '19:32', '22:30', '06:30', 100, 50, 25), 25);
  assert.equal(t.curveStart(), '19:32');
  assert.equal(t.curveLevelNow(), 100);
  assert.equal(t.windDownLine(), 'On · house goes quiet at 10:30 pm');
  assert.equal(t.windDownToday(), 'Today: soft until 7:30 am, full until 7:32 pm, down to 50% by 10:30 pm, then 25% until 6:30 am.');
  assert.equal(t.setWindDown('to_level', '40'), 'Down to 40%');
  d.S.config.settings.adaptive.points = [{ time: '07:00', level: 100 }, { time: '21:00', level: 40 }, { time: '23:00', level: 15 }];
  assert.equal(t.setNight('night_start', '22:00'), 'Quiet from 10:00 pm');
  assert.deepEqual(d.S.config.settings.adaptive.points.map(p => p.time), ['07:00', '21:00', '22:00']);
});

test('running timers, soonest first', () => {
  const { t, d } = setup();
  d.S.timers = { 'a:a2': { ends_at: NOW / 1000 + 18 * 60, level: 0 }, 'd:1': { ends_at: NOW / 1000 - 5 } };
  assert.deepEqual(t.timers().map(x => x.text), ['Bedroom · off in 18 min']);
});
