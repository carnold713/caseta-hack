'use strict';
/* hub/history.js: the seven days of light the Activity page draws. Run: npm test */
const { test } = require('node:test');
const assert = require('node:assert');
const H = require('./history.js');

const clock = (t = Date.UTC(2026, 8, 20, 18, 0)) => { const c = { t, now: () => c.t, at: v => { c.t = v; }, add: ms => { c.t += ms; } }; return c; };
const light = () => 'light';

test('a change is written, the same state again is not', () => {
  const c = clock(); const h = H.create(null, c);
  assert.ok(h.record({ 5: { level: 40 } }, light));
  c.add(60000);
  assert.ok(!h.record({ 5: { level: 40 } }, light), 'nothing changed');
  c.add(60000);
  assert.ok(h.record({ 5: { level: 0 } }, light));
  assert.deepStrictEqual(h.toJSON().lights['5'].map(s => s.split(',')[1]), ['40', '0']);
});

test('shades and fans are not light', () => {
  const c = clock(); const h = H.create(null, c);
  h.record({ 8: { level: 0, fan_speed: 'High' }, 9: { level: 50 } }, id => (id === '8' ? 'fan' : 'cover'));
  assert.deepStrictEqual(h.toJSON().lights, {});
});

test('a burst coalesces into one entry at its start, and on then straight off leaves nothing', () => {
  const c = clock(); const h = H.create(null, c);
  h.record({ 5: { level: 0 } }, light);
  c.add(10 * 60000);
  const start = c.t;
  for (const v of [10, 25, 40, 55, 62]) { h.record({ 5: { level: v } }, light); c.add(700); }
  let list = h.toJSON().lights['5'];
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[1], `${start},62,`);
  c.add(10 * 60000);
  h.record({ 5: { level: 0 } }, light); c.add(2000); h.record({ 5: { level: 30 } }, light); c.add(2000); h.record({ 5: { level: 0 } }, light);
  list = h.toJSON().lights['5'];
  assert.strictEqual(list[list.length - 1].split(',')[1], '0');
  assert.strictEqual(list.length, 3, 'the blip is gone and the off stays');
});

test('the colour is kept with the level: kelvin for a white, hex for a colour, nothing when off', () => {
  const c = clock(); const h = H.create(null, c);
  h.record({ 20: { level: 60, color: { mode: 'ct', kelvin: 2700, hex: '#ffb46b' } } }, light);
  c.add(60000); h.record({ 20: { level: 60, color: { mode: 'xy', hex: '#4C8DFF' } } }, light);
  c.add(60000); h.record({ 20: { level: 0, color: { mode: 'xy', hex: '#4C8DFF' } } }, light);
  const rows = h.slice(c.t - 3600000, c.t)['20'];
  assert.deepStrictEqual(rows.map(r => r.slice(1)), [[60, 2700], [60, '#4c8dff'], [0, null]]);
});

test('a slice leads with what was in force when it opens', () => {
  const c = clock(); const h = H.create(null, c);
  h.record({ 5: { level: 70 }, 6: { level: 0 } }, light);
  c.add(3 * 3600000);
  const from = c.t;
  c.add(3600000); h.record({ 5: { level: 20 } }, light);
  const s = h.slice(from, c.t + 1);
  assert.deepStrictEqual(s['5'].map(r => r.slice(0, 2)), [[from, 70], [c.t, 20]]);
  assert.ok(!s['6'], 'a light off throughout has nothing to draw');
});

test('seven days, then pruned; capped per light; and it survives the store', () => {
  const c = clock(); const h = H.create(null, c);
  for (let i = 0; i < 10; i++) { h.record({ 5: { level: i % 2 ? 50 : 0 } }, light); c.add(86400000); }
  h.prune();
  const list = h.toJSON().lights['5'];
  assert.ok(list.length <= 8, `${list.length} entries`);
  assert.ok(Number(list[0].split(',')[0]) <= c.t - 7 * 86400000, 'the entry in force at the window start stays');
  for (let i = 0; i < H.PER_LIGHT + 50; i++) { c.add(60000); h.record({ 6: { level: i % 2 ? 50 : 0 } }, light); }
  assert.strictEqual(h.toJSON().lights['6'].length, H.PER_LIGHT);
  const again = H.create(JSON.parse(JSON.stringify(h.toJSON())), c);
  assert.deepStrictEqual(again.toJSON(), h.toJSON());
  assert.ok(h.takeDirty() && !h.takeDirty());
});

test('since says when the history began', () => {
  const c = clock(); const h = H.create(null, c);
  assert.strictEqual(h.since(), null);
  const t0 = c.t; h.record({ 5: { level: 10 } }, light); c.add(60000); h.record({ 6: { level: 10 } }, light);
  assert.strictEqual(h.since(), t0);
});
