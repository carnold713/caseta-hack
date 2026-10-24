'use strict';
/* hub/alerts.js: what a call or a text from the phone turns into on the lights.
   Run: npm test   (node --test hub/) */
const { test } = require('node:test');
const assert = require('node:assert');

const { normalizeAlerts, decideAlert, DEFAULTS } = require('./alerts.js');
const { validateConfig } = require('./validate.js');

const ON = normalizeAlerts({ on: true, lights: ['hue_a', 'hue_b'], people: [{ name: 'Sam', color: '#FF0000' }] });

test('settings: off with no lights until chosen, defaults for the rest, bad values dropped', () => {
  const a = normalizeAlerts(undefined);
  assert.deepStrictEqual(a, { on: false, lights: [], call: DEFAULTS.call, text: DEFAULTS.text, people: [], dnd: true, only_on: false, apps: 'sms' });
  const b = normalizeAlerts({ on: true, lights: ['hue_a', 'hue_a', 'bad id!', 7], call: { pattern: 'strobe', color: '#ABCDEF', color2: 'red' },
    people: [{ name: '  Sam   Lee ', color: '#00FF00' }, { name: '', color: '#000000' }, { name: 'Jo', color: 'blue' }], dnd: false, only_on: true, apps: 'all' });
  assert.deepStrictEqual(b.lights, ['hue_a']);
  assert.deepStrictEqual(b.call, { pattern: 'flash', color: '#abcdef', color2: DEFAULTS.call.color2 });
  assert.deepStrictEqual(b.people, [{ name: 'Sam Lee', color: '#00ff00' }]);
  assert.strictEqual(b.dnd, false); assert.strictEqual(b.only_on, true); assert.strictEqual(b.apps, 'all');
  // and it is part of the config
  assert.deepStrictEqual(validateConfig({ settings: { alerts: { on: true, lights: ['hue_a'] } } }).settings.alerts.lights, ['hue_a']);
});

test('a call rings until it stops', () => {
  const d = decideAlert(ON, { kind: 'call', state: 'start', key: 'k1', from: 'Mum' });
  assert.deepStrictEqual(d.action, { type: 'alert', op: 'start', id: 'call:k1', lights: ['hue_a', 'hue_b'], pattern: 'flash', colors: [DEFAULTS.call.color], seconds: 60, only_on: false });
  assert.deepStrictEqual(decideAlert(ON, { kind: 'call', state: 'stop', key: 'k1' }).action, { type: 'alert', op: 'stop', id: 'call:k1' });
  // stopping goes through even when it has been switched off since
  assert.ok(decideAlert({ ...ON, on: false }, { kind: 'call', state: 'stop', key: 'k1' }).action);
});

test('a text plays for a few seconds, in a person\'s own colour when they have one', () => {
  const memo = {};
  const d = decideAlert(ON, { kind: 'text', state: 'start', key: 'x', from: 'Sam Lee', sms: true }, 1000, memo);
  assert.strictEqual(d.action.pattern, 'breathe');
  assert.deepStrictEqual(d.action.colors, ['#ff0000']);
  assert.strictEqual(d.action.seconds, 3.5);
  // a burst of messages shows once
  assert.strictEqual(decideAlert(ON, { kind: 'text', state: 'start', key: 'x', sms: true }, 2000, memo).skip, 'burst');
  assert.ok(decideAlert(ON, { kind: 'text', state: 'start', key: 'x', sms: true }, 5000, memo).action);
});

test('two colours take the second from the settings', () => {
  const a = normalizeAlerts({ ...ON, call: { pattern: 'alternate', color: '#111111', color2: '#222222' } });
  assert.deepStrictEqual(decideAlert(a, { kind: 'call', state: 'start', key: 'k', from: 'Sam' }).action.colors, ['#ff0000', '#222222']);
  assert.deepStrictEqual(decideAlert(a, { kind: 'call', state: 'start', key: 'k', from: 'Alex' }).action.colors, ['#111111', '#222222']);
});

test('what keeps the lights dark', () => {
  const ev = { kind: 'text', state: 'start', key: 'x', sms: true };
  assert.strictEqual(decideAlert({ ...ON, on: false }, ev).skip, 'off');
  assert.strictEqual(decideAlert({ ...ON, lights: [] }, ev).skip, 'no lights');
  assert.strictEqual(decideAlert(ON, { ...ev, dnd: true }).skip, 'do not disturb');
  assert.ok(decideAlert({ ...ON, dnd: false }, { ...ev, dnd: true }, 0, {}).action);
  assert.strictEqual(decideAlert(ON, { ...ev, sms: false }).skip, 'app');
  assert.ok(decideAlert({ ...ON, apps: 'all' }, { ...ev, sms: false }, 0, {}).action);
  assert.strictEqual(decideAlert(ON, { kind: 'email' }).skip, 'kind');
  // a key the hub cannot use as an id still makes one
  assert.strictEqual(decideAlert(ON, { kind: 'call', state: 'start', key: 'a b|c' }).action.id, 'call:one');
});
