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

// ---------- photographs ----------
// A room's photograph is bytes, not a document, so it never goes near the config: the config posts
// through one 512kb JSON limit shared with every scene, automation and button setting, and one photo
// would eat a tenth of that budget. Photos live beside the documents on the same volume, one file per
// room, named by the room's id. The config only ever carries a short stamp saying a photo exists.
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const safeName = k => (/^[A-Za-z0-9_-]{1,64}$/.test(String(k)) ? String(k) : null);
function photoPath(key, ext) { const k = safeName(key); return k ? path.join(PHOTO_DIR, `${k}.${ext}`) : null; }

// Returns {buf, type} or null. The extension is part of the name, so finding the file finds its type.
const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
function readPhoto(key) {
  for (const [ext, type] of Object.entries(PHOTO_TYPES)) {
    const p = photoPath(key, ext);
    if (!p) return null;
    try { return { buf: fs.readFileSync(p), type }; } catch (e) { if (e.code !== 'ENOENT') console.warn(`[store] photo ${key}: ${e.message}`); }
  }
  return null;
}
function writePhoto(key, buf, ext) {
  if (!PHOTO_TYPES[ext]) throw Object.assign(new Error('that image is not a JPEG, PNG or WebP'), { status: 400 });
  const target = photoPath(key, ext);
  if (!target) throw Object.assign(new Error('bad photo name'), { status: 400 });
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, target);
  removePhoto(key, ext);   // one photo per room: drop the other formats this room used to have
  return true;
}
function removePhoto(key, keepExt) {
  let gone = false;
  for (const ext of Object.keys(PHOTO_TYPES)) {
    if (ext === keepExt) continue;
    const p = photoPath(key, ext); if (!p) continue;
    try { fs.unlinkSync(p); gone = true; } catch (e) { if (e.code !== 'ENOENT') console.warn(`[store] photo ${key}: ${e.message}`); }
  }
  return gone;
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

module.exports = { DATA_DIR, read, write, readPhoto, writePhoto, removePhoto, DEFAULT_CONFIG };
