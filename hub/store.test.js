'use strict';
/* hub/store.js — the little JSON store on the volume, and the room photographs beside it.
   DATA_DIR is read once at require time, so it is set here before the module is loaded.
   Run: npm test */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-store-'));
process.env.DATA_DIR = DIR;
const store = require('./store.js');

test('DATA_DIR is where the environment said', () => {
  assert.strictEqual(store.DATA_DIR, DIR);
});

test('a document written comes back, and a missing one falls back', () => {
  assert.strictEqual(store.read('nothing-here', null), null);
  assert.deepStrictEqual(store.read('nothing-here', { a: 1 }), { a: 1 });
  // a function fallback is called, so a fresh default is built per read rather than shared
  const one = store.read('nothing-here', () => ({ list: [] }));
  const two = store.read('nothing-here', () => ({ list: [] }));
  one.list.push('x');
  assert.deepStrictEqual(two.list, [], 'each fallback is its own object');

  store.write('config', { version: 3, groups: [] });
  assert.deepStrictEqual(store.read('config', null), { version: 3, groups: [] });
});

test('the data directory is made on demand', () => {
  // DATA_DIR is read once at require time, so proving this needs a fresh process pointed at a path that
  // does not exist yet — which is exactly the first boot on a new Railway volume.
  const fresh = path.join(os.tmpdir(), `hub-store-fresh-${process.pid}-${Date.now()}`);
  assert.ok(!fs.existsSync(fresh), 'the directory does not exist before the child runs');
  const code = "const s=require(process.argv[1]); s.write('config',{made:true}); console.log(s.read('config',null).made);";
  const out = require('node:child_process').execFileSync(
    process.execPath, ['-e', code, path.resolve(__dirname, 'store.js')],
    { env: { ...process.env, DATA_DIR: fresh }, encoding: 'utf8' });
  assert.strictEqual(out.trim(), 'true');
  assert.ok(fs.existsSync(path.join(fresh, 'config.json')), 'the directory and the document were created');
  assert.deepStrictEqual(fs.readdirSync(fresh).filter(f => f.endsWith('.tmp')), [], 'the tmp file is renamed, not left');
  fs.rmSync(fresh, { recursive: true, force: true });
});

test('a corrupt document falls back instead of taking the hub down', () => {
  fs.writeFileSync(path.join(DIR, 'broken.json'), '{ this is not json');
  assert.deepStrictEqual(store.read('broken', { safe: true }), { safe: true });
});

test('a document is written whole, so a reader never sees half of one', () => {
  // the point of tmp + rename: the name only ever points at a complete document
  store.write('big', { rows: Array.from({ length: 2000 }, (_, i) => ({ i, pad: 'x'.repeat(40) })) });
  const back = store.read('big', null);
  assert.strictEqual(back.rows.length, 2000);
  assert.strictEqual(back.rows[1999].i, 1999);
});

// ───────────────────────── photographs ─────────────────────────

test('a photo round-trips with the type its extension says', () => {
  assert.strictEqual(store.readPhoto('r1'), null, 'no photo yet');
  store.writePhoto('r1', Buffer.from('jpeg-bytes'), 'jpg');
  const got = store.readPhoto('r1');
  assert.strictEqual(got.type, 'image/jpeg');
  assert.strictEqual(got.buf.toString(), 'jpeg-bytes');
});

test('one photo per room: a new format replaces the old one', () => {
  store.writePhoto('r2', Buffer.from('a-jpeg'), 'jpg');
  store.writePhoto('r2', Buffer.from('a-png'), 'png');
  const got = store.readPhoto('r2');
  assert.strictEqual(got.type, 'image/png');
  assert.strictEqual(got.buf.toString(), 'a-png');
  const left = fs.readdirSync(path.join(DIR, 'photos')).filter(f => f.startsWith('r2.'));
  assert.deepStrictEqual(left, ['r2.png'], 'the room keeps exactly one file');
});

test('only the three image types, and only a safe name', () => {
  assert.throws(() => store.writePhoto('r3', Buffer.from('x'), 'gif'), e => e.status === 400);
  assert.throws(() => store.writePhoto('r3', Buffer.from('x'), 'svg'), e => e.status === 400);
  // a room id is the file name, so anything that could climb out of the folder is refused
  for (const nasty of ['../escape', 'a/b', '', 'x'.repeat(65), 'has space']) {
    assert.throws(() => store.writePhoto(nasty, Buffer.from('x'), 'png'), e => e.status === 400, `name ${JSON.stringify(nasty)}`);
  }
  assert.deepStrictEqual(fs.readdirSync(DIR).filter(f => f.startsWith('escape')), [], 'nothing was written outside the photo folder');
});

test('removePhoto clears the room, and says whether there was anything to clear', () => {
  store.writePhoto('r4', Buffer.from('x'), 'webp');
  assert.strictEqual(store.readPhoto('r4').type, 'image/webp');
  assert.strictEqual(store.removePhoto('r4'), true);
  assert.strictEqual(store.readPhoto('r4'), null);
  assert.strictEqual(store.removePhoto('r4'), false, 'nothing left to remove');
});

test('the default config is a fresh object each time', () => {
  const a = store.DEFAULT_CONFIG(), b = store.DEFAULT_CONFIG();
  assert.notStrictEqual(a, b);
  a.groups.push({ id: 'g' });
  assert.deepStrictEqual(b.groups, [], 'one home\'s default is not another\'s');
  assert.strictEqual(a.settings.group_on_level, 100);
});

process.on('exit', () => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* best effort */ } });
