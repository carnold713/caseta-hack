// The data layer, tested without a browser (web/data/caseta-data.js). These are the rules the rebuild's handoff
// calls load-bearing, each with a fake for whatever the browser would have supplied: a clock, fetch, a socket,
// storage. If one of these goes red, the new UI and the old one are both wrong in the same way.
const test = require('node:test');
const assert = require('node:assert');
const CD = require('../../web/data/caseta-data.js');

// A home with three lights in two rooms, a fan and a shade, plus the remote the old tests use.
function home() {
  return {
    devices: {
      1: { device_id: '1', name: 'Floor lamp', domain: 'light', area: 'a1', type: 'WallDimmer' },
      2: { device_id: '2', name: 'Table lamp', domain: 'light', area: 'a1', type: 'PlugInDimmer' },
      3: { device_id: '3', name: 'Island', domain: 'light', area: 'a2', type: 'WallDimmer' },
      4: { device_id: '4', name: 'Ceiling fan', domain: 'fan', area: 'a1', type: 'CasetaFanSpeedController' },
      5: { device_id: '5', name: 'Window', domain: 'cover', area: 'a1', type: 'SerenaRollerShade' },
      9: { device_id: '9', name: 'Kitchen Pico', domain: 'pico', area: 'a2', type: 'Pico3ButtonRaiseLower' },
    },
    buttons: {}, scenes: { s1: { scene_id: 's1', name: 'Movie night' } },
    areas: { a1: { name: 'Living room' }, a2: { name: 'Kitchen' } }, bridge: null, updated: null,
  };
}
const config = (extra = {}) => ({ version: 3, bindings: [], presets: [], groups: [], schedules: [], settings: {}, ...extra });
const snapshot = (over = {}) => ({ type: 'snapshot', inventory: home(), states: { 1: { level: 75 }, 2: { level: 0 } }, timers: {}, agent: { online: true }, activity: [], config: config(), ...over });

function clock(t = 1000000) { const c = () => c.t; c.t = t; return c; }
function storage(init = {}) { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, m }; }

// ---------- a known home is never blanked ----------

test('a snapshot with no devices keeps the home already known', () => {
  const d = CD.create();
  d.apply(snapshot());
  const r = d.apply(snapshot({ inventory: { devices: {}, buttons: {}, scenes: {}, areas: {} }, states: {} }));
  assert.equal(r.keptHome, true);
  assert.equal(Object.keys(d.S.inv.devices).length, 6, 'the six devices are still there');
  assert.equal(d.S.states[1].level, 75, 'and so are their levels');
});

test('a first snapshot with no devices is taken as it is', () => {
  const d = CD.create();
  const r = d.apply(snapshot({ inventory: { devices: {} } }));
  assert.equal(r.keptHome, false);
  assert.deepEqual(d.S.inv.devices, {});
  assert.equal(d.S.ready, true);
});

test('an empty inventory message is not news once a home is known', () => {
  const d = CD.create();
  d.apply(snapshot());
  const r = d.apply({ type: 'inventory', inventory: { devices: {} } });
  assert.equal(r.changed, false);
  assert.equal(Object.keys(d.S.inv.devices).length, 6);
  const r2 = d.apply({ type: 'inventory', inventory: { devices: { 7: { device_id: '7', name: 'New', domain: 'light' } } } });
  assert.equal(r2.changed, true, 'a real inventory still lands');
  assert.deepEqual(Object.keys(d.S.inv.devices), ['7']);
});

// ---------- the hub's echo of our own save ----------

test('a config the hub echoes back unchanged is not news', () => {
  const d = CD.create();
  d.apply(snapshot());
  assert.equal(d.apply({ type: 'config', config: config() }).changed, false);
  const other = config({ groups: [{ id: 'g1', name: 'Downstairs', device_ids: ['1'] }] });
  assert.equal(d.apply({ type: 'config', config: other }).changed, true);
  assert.equal(d.S.config.groups[0].name, 'Downstairs');
  assert.equal(d.S.lastSaved, JSON.stringify(other));
});

test('state merges; activity keeps the newest hundred', () => {
  const d = CD.create();
  d.apply(snapshot());
  d.apply({ type: 'state', states: { 2: { level: 40 } } });
  assert.equal(d.S.states[1].level, 75, 'a state message merges rather than replaces');
  assert.equal(d.S.states[2].level, 40);
  for (let i = 0; i < 130; i++) d.apply({ type: 'activity', entry: { n: i } });
  assert.equal(d.S.activity.length, CD.ACTIVITY_MAX);
  assert.equal(d.S.activity[0].n, 129, 'newest first');
});

// ---------- the connection is quiet for ten seconds ----------

test('connected, then ten quiet seconds, then off', () => {
  const now = clock();
  const d = CD.create({ now });
  d.apply(snapshot());
  assert.equal(d.connState(), 'ok');
  d.S.wsOpen = false; assert.equal(d.noteConn(false), 'started');
  assert.equal(d.connState(), 'reconnecting');
  now.t += CD.RECONNECT_GRACE - 1; assert.equal(d.connState(), 'reconnecting', 'still quiet a moment before ten seconds');
  now.t += 1; assert.equal(d.connState(), 'off');
  assert.equal(d.noteConn(false), null, 'a second report of the same drop does not restart the window');
  d.S.wsOpen = true; assert.equal(d.noteConn(true), 'cleared');
  assert.equal(d.connState(), 'ok');
});

test('the connector going away through the socket starts the same window', () => {
  const now = clock();
  const d = CD.create({ now });
  d.apply(snapshot());
  const r = d.apply({ type: 'agent', online: false });
  assert.equal(r.conn, 'started');
  assert.equal(d.connState(), 'reconnecting');
  now.t += CD.RECONNECT_GRACE; assert.equal(d.connState(), 'off');
});

test("the home's clock is read from the sun message", () => {
  const now = clock(Date.parse('2026-09-22T20:00:30Z'));
  const d = CD.create({ now });
  d.apply({ type: 'sun', sun: { now: '2026-09-22T20:00:00Z' } });
  assert.equal(d.S.sunSkew, 30000);
});

// ---------- a finger on a slider ----------

test('one command in flight per light, the newest value next, everything between dropped', async () => {
  const sent = []; let release;
  const send = a => { sent.push(a.level); return new Promise(r => { release = r; }); };
  const d = CD.create();
  const g = d.gate(send);
  const first = g.sendLevel('d:1', 10);
  g.sendLevel('d:1', 20); g.sendLevel('d:1', 30); g.sendLevel('d:1', 40);
  assert.deepEqual(sent, [10], 'only the first went while it was in flight');
  release(); await new Promise(r => setImmediate(r));
  assert.deepEqual(sent, [10, 40], 'then the newest, and 20 and 30 never went');
  release(); await first;
  assert.deepEqual(sent, [10, 40]);
});

test('two lights are gated separately, and colour apart from brightness', () => {
  const sent = [];
  const d = CD.create();
  const g = d.gate(a => { sent.push(a.type + ':' + a.target); return new Promise(() => {}); });
  g.sendLevel('d:1', 10); g.sendLevel('d:2', 10); g.sendColor('d:1', { hex: '#ff0000' });
  assert.deepEqual(sent, ['level:d:1', 'level:d:2', 'color:d:1']);
});

test("the bridge's echo is ignored for a moment after a slider sends", async () => {
  const now = clock();
  const d = CD.create({ now });
  const g = d.gate(async () => {});
  await g.sendLevel(['d:1', 'd:2'], 50);
  assert.equal(g.levelQuiet('d:1'), true, 'each light in a list goes quiet');
  assert.equal(g.levelQuiet(['d:1', 'd:2']), true, 'and so does the list');
  now.t += CD.ECHO_QUIET - 1; assert.equal(g.levelQuiet('d:1'), true);
  now.t += 1; assert.equal(g.levelQuiet('d:1'), false);
});

// ---------- the wire ----------

function fetcher(reply) {
  const calls = [];
  const f = async (path, opts) => { calls.push({ path, opts }); const r = reply(path, opts); return { status: r.status || 200, ok: (r.status || 200) < 400, json: async () => r.body || {} }; };
  f.calls = calls; return f;
}

test('api sends the token and hands back the body', async () => {
  const f = fetcher(() => ({ body: { ok: 1 } }));
  const d = CD.create({ fetch: f, storage: storage({ token: 'tok' }) });
  assert.deepEqual(await d.api('/api/x'), { ok: 1 });
  assert.equal(f.calls[0].opts.headers.authorization, 'Bearer tok');
});

test('a 401 signs out: the token goes from memory and storage', async () => {
  const st = storage({ token: 'tok' }); let told = 0;
  const d = CD.create({ fetch: fetcher(() => ({ status: 401 })), storage: st });
  d.hooks.signedOut = () => { told++; };
  await assert.rejects(d.api('/api/x'), /Signed out/);
  assert.equal(d.S.token, ''); assert.equal(st.getItem('token'), null); assert.equal(told, 1);
});

test('errors come back in words a person can act on', async () => {
  const d = CD.create({ fetch: fetcher(() => ({ status: 503, body: { error: 'agent is offline' } })) });
  await assert.rejects(d.run({ type: 'level' }), /Can't reach your home right now/);
  assert.match(CD.friendlyError('unknown preset abc'), /no longer exists/);
  assert.equal(CD.friendlyError('something else'), 'something else');
});

test('a save takes the config the hub stored, and hands back the one before for Undo', async () => {
  const stored = config({ groups: [{ id: 'g1', name: 'Stored', device_ids: [] }] });
  const f = fetcher(() => ({ body: { config: stored } }));
  const d = CD.create({ fetch: f });
  d.apply(snapshot());
  const before = d.S.lastSaved;
  d.S.config.groups.push({ id: 'g1', name: 'Typed', device_ids: [] });
  const { prev } = await d.saveConfig();
  assert.equal(prev, before);
  assert.equal(d.S.config.groups[0].name, 'Stored', 'what the hub validated wins');
  assert.equal(JSON.parse(f.calls[0].opts.body).groups[0].name, 'Typed', 'what was sent was the edit');
  d.restoreConfig(prev);
  assert.deepEqual(d.S.config.groups, [], 'Undo puts the old one back, ready to save');
});

test('a dropped socket dials again after two seconds, and only while signed in', () => {
  const made = []; const timers = [];
  class FakeWS { constructor(url) { this.url = url; made.push(this); } close() {} }
  const d = CD.create({ WebSocket: FakeWS, location: { protocol: 'https:', host: 'home.example' }, setTimeout: (f, ms) => timers.push({ f, ms }), storage: storage({ token: 'a b' }) });
  const seen = [];
  d.connectWS({ message: (m, r) => seen.push(r.type) });
  assert.equal(made[0].url, 'wss://home.example/ws/app?token=a%20b');
  made[0].onopen(); assert.equal(d.S.wsOpen, true);
  made[0].onmessage({ data: JSON.stringify(snapshot()) });
  assert.deepEqual(seen, ['snapshot'], 'messages are applied, then handed on');
  made[0].onclose();
  assert.equal(d.S.wsOpen, false);
  assert.equal(timers[0].ms, CD.RECONNECT_AFTER);
  timers[0].f(); assert.equal(made.length, 2, 'it dialled again');
  d.S.token = ''; made[1].onclose(); timers[1].f();
  assert.equal(made.length, 2, 'signed out, it stays down');
});

// ---------- the questions the screens ask ----------

test('what a target means', () => {
  const d = CD.create();
  d.apply(snapshot({ config: config({ groups: [{ id: 'g1', name: 'Lamps', device_ids: ['1', '2', 'gone'] }] }) }));
  assert.deepEqual(d.targetDevices('d:1'), ['1']);
  assert.deepEqual(d.targetDevices('d:gone'), []);
  assert.deepEqual(d.targetDevices('a:a1').sort(), ['1', '2', '4'], 'a room is its lights and fans, never its shades');
  assert.deepEqual(d.targetDevices('g:g1'), ['1', '2'], 'a set drops a light that has gone');
  assert.deepEqual(d.targetDevices('h:all').sort(), ['1', '2', '3'], 'everything is every light');
  assert.deepEqual(d.targetDevices('h:shades'), ['5']);
  assert.deepEqual(d.targetDevices('h:fans'), ['4']);
  assert.deepEqual(d.targetDevices(['d:1', 'a:a1']).sort(), ['1', '2', '4'], 'a list is the union, once each');
  assert.equal(d.targetName('a:a1'), 'Living room');
  assert.equal(d.targetName('d:gone'), 'a light that is gone');
  assert.equal(d.targetName(['d:1', 'd:2', 'd:3', 'a:a1']), 'Floor lamp, Table lamp and 2 more');
  assert.equal(d.targetOn('a:a1'), true);
  assert.equal(d.targetOn('a:a2'), false);
  assert.equal(d.targetExists('g:g1'), true);
  assert.equal(d.targetExists('p:nope'), false);
});

test('a device hidden in the app stays hidden', () => {
  const d = CD.create();
  d.apply(snapshot({ config: config({ settings: { hidden_devices: ['2'] } }) }));
  assert.equal(d.devices().some(x => x.device_id === '2'), false);
  assert.deepEqual(d.targetDevices('a:a1').sort(), ['1', '4']);
});

test("the app's own rooms win over the bridge's, and an empty one still shows", () => {
  const d = CD.create();
  d.apply(snapshot({ config: config({ settings: { rooms: [
    { id: 'r1', name: 'Den', device_ids: ['3'] },
    { id: 'r2', name: 'Lounge', bridge_area: 'a1' },
    { id: 'r3', name: 'Attic' },
  ] } }) }));
  assert.equal(d.devArea(d.dev('3')), 'r1', 'the room that names a device wins');
  assert.equal(d.devArea(d.dev('1')), 'r2', 'then the room standing for its bridge room');
  assert.deepEqual(d.areas().map(a => a.name), ['Attic', 'Den', 'Lounge']);
  assert.equal(d.roomSummary('r3'), 'No lights yet');
  // every device in the room counts, the shade and the fan included: that is what the old summary did
  assert.equal(d.roomSummary('r2'), '1 of 4 on');
});

test('describe says what a press does', () => {
  const d = CD.create();
  d.apply(snapshot({ config: config({ presets: [{ id: 'p1', name: 'Relax', area: 'a1' }, { id: 'p2', name: 'Bright', area: 'a1' }] }) }));
  assert.equal(d.describe([{ type: 'level', target: 'a:a1', level: 'on' }]), 'Turns Living room on');
  assert.equal(d.describe([{ type: 'level', target: 'a:a1', level: 0, fade: 60 }]), 'Fades Living room off over 1 min');
  assert.equal(d.describe([{ type: 'step', target: 'd:1', delta: 10 }]), 'Makes Floor lamp a little brighter');
  assert.equal(d.describe([{ type: 'raise', target: 'd:5' }]), 'Opens Window', 'raise on a shade opens it');
  assert.equal(d.describe([{ type: 'raise', target: 'd:1' }]), 'Brightens Floor lamp while holding');
  assert.equal(d.describe([{ type: 'restore', target: 'h:all' }]), 'Puts everything back the way it was');
  assert.equal(d.describe([{ type: 'fan', target: 'h:fans', speed: 'Off' }]), 'Turns the fans off');
  assert.equal(d.describe([{ type: 'level', target: 'd:1', level: 'on' }, { type: 'level', target: 'd:1', level: 'on' }]), 'Turns Floor lamp on', 'a repeat is said once');
  const loop = [{ type: 'cycle_presets', preset_ids: ['p1', 'p2'] }];
  assert.equal(d.describe(loop), 'Steps through 2 scenes', 'without the room list it counts');
  d.hooks.roomScenes = aid => d.presets().filter(p => p.area === aid);
  assert.equal(d.describe(loop), "Steps through Living room's scenes", "the room's name only when the loop is all of them");
  assert.equal(d.describe([{ type: 'cycle_presets', preset_ids: ['p1'], dir: -1 }]), 'Steps backwards through 1 scene');
});

test('remote words', () => {
  const d = CD.create();
  d.apply(snapshot());
  assert.equal(d.buttonLabel('9', 3), 'Raise');
  assert.equal(d.buttonTitle('9', 3), 'Raise button');
  assert.equal(d.modelName(d.dev('9')), '3-button remote with dimming');
  assert.equal(CD.userGestureOf({ gesture: 'hold_start' }), 'hold');
});

test('a light a finger just set keeps its level and colour against the bridge echoing the values it passed', () => {
  let t = 1000;
  const d = CD.create({ now: () => t });
  d.apply(snapshot());
  d.S.states[1] = { level: 90, color: { mode: 'xy', hex: '#FF0000' } };
  d.hold(['1']);
  d.apply({ type: 'state', states: { 1: { level: 60, color: { mode: 'xy', hex: '#00FF00' }, fan_speed: null } } });
  assert.equal(d.S.states[1].level, 90, 'an echo of a level passed on the way does not pull it back');
  assert.equal(d.S.states[1].color.hex, '#FF0000', 'nor a colour');
  t += 2000;
  d.apply({ type: 'state', states: { 1: { level: 60 } } });
  assert.equal(d.S.states[1].level, 60, 'once the moment has passed, the bridge is the truth again');
});

// ---------- a light this phone switches lands once ----------
// A fake clock and a fake timer list, so a hold running out is a step the test takes.
function rig() {
  const c = { t: 1000, timers: [] };
  const inv = home();
  inv.devices[6] = { device_id: '6', name: 'Porch', domain: 'switch', area: 'a2', type: 'WallSwitch' };
  const d = CD.create({ now: () => c.t, setTimeout: (f, ms) => { c.timers.push({ at: c.t + ms, f }); return c.timers.length; } });
  d.apply(snapshot({ inventory: inv, states: { 1: { level: 0 }, 2: { level: 0 }, 3: { level: 40 }, 6: { level: 0 } } }));
  // move the clock on, running every timer that has come due, in order
  c.step = ms => {
    const end = c.t + ms;
    for (;;) {
      const due = c.timers.filter(x => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      c.timers.splice(c.timers.indexOf(due), 1); c.t = Math.max(c.t, due.at); due.f();
    }
    c.t = end;
  };
  return { d, c };
}
const echo = (d, states) => d.apply({ type: 'state', states });

test('a light switched on is shown on at once and stays on while the bridge reports its fade', () => {
  const { d, c } = rig();
  const n = d.expect({ 1: 100 }, 0.5);
  assert.equal(d.level('1'), 100, 'shown where it is going from the tap');
  c.step(40); d.sent(n, true);
  // a Lutron dimmer reports where it was, then where it is on the way
  assert.equal(echo(d, { 1: { level: 0 } }).changed, false, 'the level it was at is not news');
  assert.equal(d.level('1'), 100);
  c.step(150); assert.equal(echo(d, { 1: { level: 33 } }).changed, false);
  c.step(150); assert.equal(echo(d, { 1: { level: 67 } }).changed, false);
  c.step(200); echo(d, { 1: { level: 100 } });
  assert.equal(d.level('1'), 100, 'and it lands where it was shown');
  assert.equal(d.S.truth['1'].level, 100, 'the bridge is heard the whole time');
});

test('a report of the old brightness just after the new one is not shown as a step back', () => {
  const { d, c } = rig();
  const n = d.expect({ 2: 100 }, 0.5);
  c.step(20); echo(d, { 2: { level: 100 } });      // the connector says the new level as soon as the bridge takes it
  d.sent(n, true);
  c.step(120); echo(d, { 2: { level: 70 } });      // the event stream: "on", at the brightness it had before
  assert.equal(d.level('2'), 100);
  c.step(60); echo(d, { 2: { level: 100 } });      // and then its new brightness
  c.step(CD.REACH_SETTLE);
  assert.equal(d.level('2'), 100);
  assert.deepEqual(Object.keys(d.S.expect), [], 'let go once it has got there');
});

test('a light that does not change is shown as the bridge has it once its fade should be over, and says so', () => {
  const { d, c } = rig();
  let told = 0; d.hooks.changed = () => { told++; };
  const n = d.expect({ 1: 100 }, 0.5);
  c.step(50); d.sent(n, true);
  c.step(500 + CD.ECHO_MARGIN - 100);
  assert.equal(d.level('1'), 100, 'held for the fade and its margin');
  assert.equal(told, 0);
  c.step(200);
  assert.equal(d.level('1'), 0, 'then shown as the bridge last said: it never came on');
  assert.equal(told, 1, 'once');
});

test('a command that was not sent puts its lights back at once', () => {
  const { d } = rig();
  const n = d.expect({ 1: 100, 3: 0 }, 0.5);
  assert.equal(d.level('3'), 0);
  assert.equal(d.sent(n, false), true, 'the screen changed');
  assert.equal(d.level('1'), 0);
  assert.equal(d.level('3'), 40);
});

test('an answer to an older command does not let go of a newer one', () => {
  const { d } = rig();
  const first = d.expect({ 1: 100 }, 0.5);
  d.expect({ 1: 0 }, 0.5);
  d.expect({ 1: 100 }, 0.5);
  d.sent(first, false);
  assert.equal(d.level('1'), 100, 'still where the newest tap put it');
});

test('only the lights this phone changed are held: a change at the wall shows at once', () => {
  const { d, c } = rig();
  const n = d.expect({ 1: 100 }, 0.5);
  d.sent(n, true);
  c.step(100);
  const r = echo(d, { 3: { level: 75 } });
  assert.equal(r.changed, true);
  assert.equal(d.level('3'), 75);
  // and the held one too, once it has landed
  c.step(100); echo(d, { 1: { level: 100 } });
  c.step(CD.REACH_SETTLE + 10);
  echo(d, { 1: { level: 20 } });
  assert.equal(d.level('1'), 20);
});

test('a room lands at once: every light held, and one already there is left alone', () => {
  const { d, c } = rig();
  const n = d.expect({ 1: 0, 2: 0, 3: 0 }, 0.5);
  assert.deepEqual(Object.keys(d.S.expect), ['3'], 'only the light that was on has anything to hold');
  assert.equal(d.roomSummary('a2'), '2 lights · all off');
  d.sent(n, true);
  c.step(30); echo(d, { 3: { level: 40 } });
  assert.equal(d.roomSummary('a2'), '2 lights · all off', 'the level it left is not shown');
});

test('a switch has landed when it is on, whatever level it reports', () => {
  const { d, c } = rig();
  assert.equal(d.landing('6', 30), 100, 'a Lutron switch reports 100 whatever it is sent');
  const n = d.expect({ 6: 100 }, 0.5);
  d.sent(n, true);
  c.step(60); echo(d, { 6: { level: 100 } });
  c.step(CD.REACH_SETTLE + 10);
  assert.deepEqual(Object.keys(d.S.expect), []);
});

test('a slider hold ends quietly: the finger\'s level stays until the bridge says otherwise', () => {
  const { d, c } = rig();
  let told = 0; d.hooks.changed = () => { told++; };
  d.S.states[1] = { level: 55 };
  d.hold(['1']);
  echo(d, { 1: { level: 30 } });
  c.step(CD.ECHO_QUIET + 20);
  assert.equal(d.level('1'), 55, 'not pulled back to an echo of a value it passed');
  assert.equal(told, 0);
});
