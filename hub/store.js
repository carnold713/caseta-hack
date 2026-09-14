'use strict';
// Tiny JSON document store. Everything lives under DATA_DIR (a Railway volume
// in production, ./data locally). Writes are atomic (tmp + rename) so a crash
// mid-write never leaves a half document behind.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`[store] ${name}: ${e.message}, using fallback`);
    return typeof fallback === 'function' ? fallback() : fallback;
  }
}

function write(name, value) {
  ensureDir();
  const target = fileFor(name);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, target);
}

const DEFAULT_CONFIG = () => ({
  version: 1,
  settings: {
    double_ms: 350,   // window after a click in which a second press means "double"
    hold_ms: 500,     // press longer than this is a hold
    group_on_level: 100,
    default_fade: 0.5
  },
  groups: [],   // {id, name, device_ids: [], on_level}
  presets: [],  // {id, name, fade, levels: {device_id: level}}
  bindings: []  // {id, device_id (pico), button_number, gesture, actions: []}
});

module.exports = { DATA_DIR, read, write, DEFAULT_CONFIG };
