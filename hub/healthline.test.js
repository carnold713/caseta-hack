'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { healthLine } = require('./healthline');

test('an older connector reads as before', () => {
  assert.strictEqual(healthLine({ bindings: 28, bridge_ok: true, buttons: 15, presses: 0 }, 1000),
    'connector holds 28 button settings, bridge answering with 15 buttons, 0 presses seen');
});

test('a link that carries no presses says so', () => {
  const line = healthLine({
    bindings: 28, bridge_ok: true, buttons: 15, subscribed: 0, presses: 0, uptime_s: 7200, buttons_ok: false,
    reconnects: 1, link_problem: 'logging back in to the bridge failed (TimeoutError: )', link_ok_at: 970,
    notes: [{ ok: true, text: 'expected' }, { ok: false, text: 'ping was not answered. closing connection.' }], lib: '0.29.0',
  }, 1000);
  for (const bit of ['(0 reporting presses)', 'up 2h', 'BUTTON PRESSES NOT REPORTED', '1 fresh bridge connection,',
    'link: logging back in', 'bridge checked 30s ago', 'bridge said: "ping was not answered', 'lib 0.29.0']) {
    assert.ok(line.includes(bit), `${bit} in: ${line}`);
  }
  assert.ok(!line.includes('expected'), 'a note marked ok is not shown');
});

test('the last press is dated', () => {
  const line = healthLine({ bindings: 1, bridge_ok: true, buttons: 5, subscribed: 5, presses: 3, last_press_at: 400, last_press: '12/2', buttons_ok: true }, 1000);
  assert.ok(line.includes('3 presses seen, last 10m ago (12/2)'), line);
  assert.ok(!line.includes('NOT REPORTED'), line);
});

test('a link put right says when and why it was last restarted', () => {
  const line = healthLine({ bindings: 1, bridge_ok: true, buttons: 5, subscribed: 5, presses: 0, buttons_ok: true, reconnects: 2,
    last_reconnect: { at: 400, why: 'logging back in to the bridge failed (TimeoutError: )' } }, 1000);
  assert.ok(line.includes('2 fresh bridge connections'), line);
  assert.ok(line.includes('last fresh connection 10m ago: logging back in'), line);
});
