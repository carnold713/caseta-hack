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
  assert.deepStrictEqual(a, { on: false, lights: [], call: DEFAULTS.call, text: DEFAULTS.text, people: [], dnd: true, only_on: false, apps: 'sms', by_app: [] });
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

test('an app of its own: its notifications show in its look, and its texts and calls take its colour', () => {
  const a = normalizeAlerts({ ...ON, by_app: [
    { pkg: 'com.whatsapp', name: 'WhatsApp', color: '#00FF00', pattern: 'glow' },
    { pkg: 'com.whatsapp', name: 'twice', color: '#000000' },
    { pkg: 'not a package', name: 'x', color: '#000000' },
    { pkg: 'com.ring.app', color: '#ff8800', pattern: 'alternate', color2: '#ffffff' },
  ] });
  assert.deepStrictEqual(a.by_app.map(r => r.pkg), ['com.whatsapp', 'com.ring.app']);
  assert.strictEqual(a.by_app[1].name, 'com.ring.app');
  // anything else it shows
  const d = decideAlert(a, { kind: 'app', state: 'start', key: 'n1', app: 'com.ring.app' }, 0, {});
  assert.strictEqual(d.action.pattern, 'alternate');
  assert.deepStrictEqual(d.action.colors, ['#ff8800', '#ffffff']);
  assert.strictEqual(d.action.seconds, 3.5);
  // an app without a look of its own does not
  assert.strictEqual(decideAlert(a, { kind: 'app', state: 'start', key: 'n2', app: 'com.instagram.android' }, 0, {}).skip, 'app');
  // a text from it shows even with texts from the phone's own app only, in its look, a person's colour first
  const t = decideAlert(a, { kind: 'text', state: 'start', key: 'n3', app: 'com.whatsapp', sms: false, from: 'Alex' }, 0, {});
  assert.deepStrictEqual([t.action.pattern, t.action.colors], ['glow', ['#00ff00']]);
  assert.deepStrictEqual(decideAlert(a, { kind: 'text', state: 'start', key: 'n4', app: 'com.whatsapp', sms: false, from: 'Sam' }, 0, {}).action.colors, ['#ff0000']);
  // a call from it keeps the call's pattern, in its colour
  const c = decideAlert(a, { kind: 'call', state: 'start', key: 'n5', app: 'com.whatsapp', from: 'Alex' });
  assert.deepStrictEqual([c.action.pattern, c.action.colors], ['flash', ['#00ff00']]);
  // each app's bursts are its own
  const memo = {};
  assert.ok(decideAlert(a, { kind: 'app', state: 'start', key: 'x', app: 'com.ring.app' }, 1000, memo).action);
  assert.strictEqual(decideAlert(a, { kind: 'app', state: 'start', key: 'x', app: 'com.ring.app' }, 2000, memo).skip, 'burst');
  assert.ok(decideAlert(a, { kind: 'text', state: 'start', key: 'x', sms: true }, 2000, memo).action);
});
