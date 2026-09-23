'use strict';
// caseta-hack hub. Runs on Railway. Three jobs:
//   1. serve the PWA (web/)
//   2. hold the config (groups, presets, Pico bindings) and the last inventory
//   3. relay between phone clients (/ws/app) and the in-home agent (/ws/agent)
// It never talks to the Smart Bridge itself: LEAP is LAN-only, the agent does that.

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const store = require('./store');
const { validateConfig, validateAction } = require('./validate');
const lightHistory = require('./history');

const PORT = Number(process.env.PORT) || 4400;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update(`caseta-hack|${APP_PASSWORD}|${AGENT_TOKEN}`).digest('hex');

const log = (...a) => console.log('[hub]', ...a);
if (!APP_PASSWORD) console.warn('[hub] APP_PASSWORD is not set: the app is open to anyone who finds the URL');
if (!AGENT_TOKEN) console.warn('[hub] AGENT_TOKEN is not set: any agent can connect');

// The connector code ships in this same repo, so the hub knows the current connector version.
const LATEST_AGENT_VERSION = (() => {
  try { return (require('fs').readFileSync(path.join(__dirname, '..', 'agent', 'agent.py'), 'utf8').match(/^VERSION = "([^"]+)"/m) || [])[1] || null; }
  catch (_) { return null; }
})();
function versionLess(a, b) {
  if (!a || !b) return false;
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) < (pb[i] || 0)) return true; if ((pa[i] || 0) > (pb[i] || 0)) return false; }
  return false;
}

// ---------- state ----------
let config = validateConfig(store.read('config', store.DEFAULT_CONFIG));
let inventory = store.read('inventory', () => ({ devices: {}, buttons: {}, scenes: {}, areas: {}, bridge: null, updated: null }));
let states = {}; // device_id -> {level, fan_speed}
let timers = {}; // target -> {ends_at, level}
let sun = null;  // {sunrise, sunset, now} from the connector, in the home's zone
let nextRuns = {}; // schedule id -> next ISO time
// Follow the day, as the connector sees it: which lamps are following, which were set by hand (so they have
// stopped until they are next switched on), and the white each is showing. The app reads it, never writes it.
let follow = null;
let addSession = { active: false, until: 0, heard: [], log: [] }; // the app's "Add a device" session, mirrored from the connector
let activity = store.read('activity', () => []); // newest first, capped
// Seven days of each light's level and colour, written from the state updates below (hub/history.js)
const history = lightHistory.create(store.read('history', null));
let agent = null;   // the single connected agent socket
let updating = false;
let agentInfo = null;
const appClients = new Set();
const pending = new Map(); // command id -> {resolve, reject, timer}

// ---------- auth ----------
const appToken = crypto.createHmac('sha256', SESSION_SECRET).update('app-token').digest('hex');
function tokenOk(t) {
  if (!APP_PASSWORD) return true;
  return typeof t === 'string' && t.length === appToken.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(appToken));
}
function requireAuth(req, res, next) {
  const h = req.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (tokenOk(t)) return next();
  res.status(401).json({ error: 'unauthorized' });
}
const loginAttempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { n: 0, t: now };
  if (now - rec.t > 15 * 60 * 1000) { rec.n = 0; rec.t = now; }
  rec.n += 1;
  loginAttempts.set(ip, rec);
  return rec.n > 20;
}

// ---------- http ----------
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));

app.get('/healthz', (req, res) => res.json({ ok: true, agent: !!agent }));

app.post('/api/login', (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'too many attempts, wait 15 minutes' });
  const pw = String((req.body && req.body.password) || '');
  if (!APP_PASSWORD || (pw.length === APP_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(APP_PASSWORD)))) {
    return res.json({ token: appToken });
  }
  res.status(401).json({ error: 'wrong password' });
});

app.get('/api/snapshot', requireAuth, (req, res) => res.json(snapshot()));
app.get('/api/activity', requireAuth, (req, res) => res.json({ activity }));
// The light history between two instants (epoch ms), a day at a time: the last 24 hours when none are given.
app.get('/api/history', requireAuth, (req, res) => {
  const now = Date.now();
  const to = Math.min(Number(req.query.to) || now, now);
  const from = Math.max(Number(req.query.from) || to - 86400000, now - lightHistory.DAYS * 86400000);
  if (!(from < to)) return res.status(400).json({ error: 'from must be before to' });
  res.json({ from, to, since: history.since(), lights: history.slice(from, to) });
});

app.put('/api/config', requireAuth, (req, res) => {
  try {
    const next = validateConfig(req.body);
    config = next;
    store.write('config', config);
    sendToAgent({ type: 'config', config });
    broadcast({ type: 'config', config });
    res.json({ ok: true, config });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// A command is one action in the same schema the Pico bindings use, executed by the agent now.
app.post('/api/command', requireAuth, async (req, res) => {
  try {
    const action = validateAction(req.body, 'command');
    if (action.type === 'preset' && !config.presets.some(p => p.id === action.preset_id)) throw Object.assign(new Error('unknown preset'), { status: 400 });
    const result = await sendCommand(action);
    record({ kind: 'app', action });
    res.json(result);
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

// Tell the connector to pull the latest code and restart itself. The reply comes before it restarts.
app.post('/api/update-connector', requireAuth, async (req, res) => {
  try { res.json(await sendCommand({ type: 'update' }, 15 * 60 * 1000)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

// Ask the agent to re-read the bridge (after adding a device in the Lutron app).
app.post('/api/refresh', requireAuth, async (req, res) => {
  try { res.json(await sendCommand({ type: 'refresh' })); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});
// Philips Hue: find, pair with (button press) or forget a Hue bridge; the connector does the talking.
app.post('/api/hue', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!['discover', 'pair', 'forget'].includes(b.op)) return res.status(400).json({ error: 'op must be discover, pair or forget' });
  const action = { type: `hue_${b.op}` };
  if (b.op === 'pair') { const host = String(b.host || '').trim(); if (!/^[A-Za-z0-9.\-:]{1,64}$/.test(host)) return res.status(400).json({ error: 'a bridge address is required' }); action.host = host; }
  try { res.json(await sendCommand(action, b.op === 'pair' ? 70000 : 25000)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});
// Nanoleaf: unlike Hue there is no bridge, so this covers a list of directly-paired controllers, each with
// its own address and its own held-button pairing. "forget" names which one by its serial.
app.post('/api/nanoleaf', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!['discover', 'pair', 'forget'].includes(b.op)) return res.status(400).json({ error: 'op must be discover, pair or forget' });
  const action = { type: `nanoleaf_${b.op}` };
  if (b.op === 'pair') { const host = String(b.host || '').trim(); if (!/^[A-Za-z0-9.\-:]{1,64}$/.test(host)) return res.status(400).json({ error: "the controller's address is required" }); action.host = host; }
  if (b.op === 'forget') { const serial = String(b.serial || '').trim(); if (!/^[A-Za-z0-9_-]{1,64}$/.test(serial)) return res.status(400).json({ error: 'which controller is required' }); action.serial = serial; }
  try { res.json(await sendCommand(action, b.op === 'pair' ? 50000 : 25000)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});
// Rooms on the bridges. The app owns its own rooms (config.settings.rooms); these are the best-effort attempts to
// keep each bridge in step with them. Hue documents all of this; Lutron documents none of it and may say no, which
// is not an error the app has to hide: the room still exists in the app either way.
const ROOM_OPS = {
  area_create: ['name'],            // CreateRequest /area, undocumented, may be refused
  area_rename: ['area', 'name'],    // UpdateRequest /area/{id}
  device_move: ['id', 'area'],      // UpdateRequest /device/{id} with AssociatedArea
  hue_create: ['name'],             // POST /clip/v2/resource/room
  hue_rename: ['room', 'name'],     // PUT  /clip/v2/resource/room/{id}
  hue_delete: ['room'],             // DELETE
  hue_move: ['device', 'room'],     // the room's children carry the lamp's device rid
};
app.post('/api/rooms', requireAuth, async (req, res) => {
  const b = req.body || {};
  const need = ROOM_OPS[b.op];
  if (!need) return res.status(400).json({ error: `op must be one of ${Object.keys(ROOM_OPS).join(', ')}` });
  const action = { type: `room_${b.op}` };
  for (const k of need) {
    const v = String(b[k] == null ? '' : b[k]).trim();
    if (k === 'name') { if (!v) return res.status(400).json({ error: 'a name is required' }); action.name = v.slice(0, 40); continue; }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(v)) return res.status(400).json({ error: `${k} is required` });
    action[k] = v;
  }
  try { res.json(await sendCommand(action, 30000)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});
// Remove a device from the bridge (experimental, like adding).
app.post('/api/removedevice', requireAuth, async (req, res) => {
  const id = String((req.body || {}).id || '').trim();
  if (!/^[0-9]{1,12}$/.test(id)) return res.status(400).json({ error: 'a device id is required' });
  try { res.json(await sendCommand({ type: 'remove_device', id }, 40000)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});
// Add a device to the bridge from the app (experimental; the LEAP steps live in agent/adddevice.py).
app.post('/api/adddevice', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!['start', 'stop', 'create'].includes(b.op)) return res.status(400).json({ error: 'op must be start, stop or create' });
  const action = { type: `add_${b.op}` };
  if (b.op === 'create') {
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
    const serial = String(b.serial || '').trim(); const area = String(b.area || '').trim();
    if (!name || !/^[0-9A-Za-z-]{1,32}$/.test(serial) || !/^[A-Za-z0-9_-]{1,64}$/.test(area)) return res.status(400).json({ error: 'name, serial and room are required' });
    Object.assign(action, { name, serial, area });
  }
  try { res.json(await sendCommand(action, 30000)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

// A room's photograph. The picture the phone sends has already been shrunk through a canvas by the app,
// so the bytes arriving here are tens of kilobytes, not the several megabytes a phone camera produces.
// The image is served back from this same origin so it is never a cross-origin load: `?token=` is what
// lets a plain <img src> authenticate, the same trick /install.sh uses.
// Base64 costs a third, so a 400kb photo arrives as a 533kb body: this one route gets its own, larger
// parser rather than raising the limit on the config and every command with it.
const PHOTO_MAX = 400 * 1024;
const photoBody = express.json({ limit: '1mb' });
const roomKey = req => (/^[A-Za-z0-9_-]{1,64}$/.test(String(req.params.room || '')) ? String(req.params.room) : null);
app.get('/api/roomphoto/:room', requireAuth, (req, res) => {
  const key = roomKey(req); if (!key) return res.status(400).json({ error: 'bad room' });
  const found = store.readPhoto(key);
  if (!found) return res.status(404).json({ error: 'no photo' });
  // the URL carries a stamp that changes whenever the photo does, so this can be cached hard
  res.type(found.type).set('Cache-Control', req.query.v ? 'private, max-age=31536000, immutable' : 'private, no-cache').send(found.buf);
});
app.put('/api/roomphoto/:room', requireAuth, photoBody, (req, res) => {
  const key = roomKey(req); if (!key) return res.status(400).json({ error: 'bad room' });
  const url = String((req.body || {}).data || '');
  const m = url.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return res.status(400).json({ error: "that file isn't a photo we can read" });
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) return res.status(400).json({ error: "that file isn't a photo we can read" });
  if (buf.length > PHOTO_MAX) return res.status(413).json({ error: 'that photo is too big' });
  try {
    store.writePhoto(key, buf, m[1] === 'jpg' ? 'jpg' : m[1] === 'jpeg' ? 'jpg' : m[1]);
    res.json({ ok: true, stamp: String(Date.now()) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
app.delete('/api/roomphoto/:room', requireAuth, (req, res) => {
  const key = roomKey(req); if (!key) return res.status(400).json({ error: 'bad room' });
  store.removePhoto(key);
  res.json({ ok: true });
});

// One-line installer for the home connector, with this hub's URL and token baked in.
// Requires the app token (as ?token=) so only a signed-in user can fetch it.
const fs = require('fs');
const INSTALL_TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'install.sh'), 'utf8');
app.get('/install.sh', requireAuth, (req, res) => {
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = (req.get('x-forwarded-proto') || req.protocol) === 'https' ? 'wss' : 'ws';
  const body = INSTALL_TEMPLATE
    .replace('__HUB_URL__', `${proto}://${host}/ws/agent`)
    .replace('__AGENT_TOKEN__', AGENT_TOKEN)
    .replace('__REPO__', process.env.REPO_URL || 'https://github.com/carnold713/caseta-hack')
    .replace('__BRANCH__', process.env.REPO_BRANCH || 'claude/loving-fermi-ius0ui');
  res.type('text/x-shellscript').send(body);
});

// Digital Asset Links for the PWABuilder Android package (Trusted Web Activity). Set on the host (ASSETLINKS_JSON,
// or ANDROID_PACKAGE_NAME with ANDROID_CERT_SHA256) it wins; otherwise the one kept in hub/assetlinks.json.
const ASSETLINKS_FILE = path.join(__dirname, 'assetlinks.json');
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.type('application/json');
  if (process.env.ASSETLINKS_JSON) return res.send(process.env.ASSETLINKS_JSON);
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const sha = process.env.ANDROID_CERT_SHA256;
  if (!pkg || !sha) {
    try { return res.send(JSON.stringify(JSON.parse(fs.readFileSync(ASSETLINKS_FILE, 'utf8')))); } catch (_) { return res.send('[]'); }
  }
  res.send(JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: sha.split(',').map(s => s.trim()) }
  }]));
});

const WEB = path.join(__dirname, '..', 'web');
app.use(express.static(WEB, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(WEB, 'index.html'));
});

// A body the JSON parser refused (too big, or not JSON) used to answer with Express's HTML stack trace,
// which the app then tried to parse as JSON and reported as an unreadable error. Answer in the shape
// every other failure here uses, so the app can show the person what actually went wrong.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && (err.type === 'entity.too.large' || err.status === 413)) return res.status(413).json({ error: 'that is too big to send' });
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) return res.status(400).json({ error: 'the hub could not read that' });
  log('unhandled:', (err && err.message) || err);
  res.status(500).json({ error: 'something went wrong at the hub' });
});

// ---------- websockets ----------
const server = http.createServer(app);
const wssApp = new WebSocketServer({ noServer: true });
const wssAgent = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/ws/app') {
    if (!tokenOk(url.searchParams.get('token'))) return reject(socket, 401);
    wssApp.handleUpgrade(req, socket, head, ws => wssApp.emit('connection', ws, req));
  } else if (url.pathname === '/ws/agent') {
    const t = url.searchParams.get('token') || '';
    if (AGENT_TOKEN && !(t.length === AGENT_TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(AGENT_TOKEN)))) return reject(socket, 401);
    wssAgent.handleUpgrade(req, socket, head, ws => wssAgent.emit('connection', ws, req));
  } else {
    reject(socket, 404);
  }
});
function reject(socket, code) {
  socket.write(`HTTP/1.1 ${code} ${code === 401 ? 'Unauthorized' : 'Not Found'}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

wssApp.on('connection', ws => {
  appClients.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.send(JSON.stringify({ type: 'snapshot', ...snapshot() }));
  ws.on('close', () => appClients.delete(ws));
  ws.on('error', () => appClients.delete(ws));
});

wssAgent.on('connection', (ws, req) => {
  if (agent && agent.readyState === WebSocket.OPEN) {
    console.log('[hub] replacing previous agent connection');
    try { agent.close(4000, 'replaced'); } catch (_) { /* ignore */ }
  }
  agent = ws;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  console.log(`[hub] agent connected from ${req.socket.remoteAddress}`);
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    handleAgentMessage(ws, msg);
  });
  ws.on('close', () => {
    if (agent === ws) {
      agent = null; agentInfo = null; timers = {}; follow = null; addSession = { ...addSession, active: false };
      broadcast({ type: 'agent', online: false });
      broadcast({ type: 'timers', timers });
      record({ kind: 'agent', online: false });
      console.log('[hub] agent disconnected');
    }
  });
  ws.on('error', e => console.warn('[hub] agent socket error', e.message));
  ws.send(JSON.stringify({ type: 'config', config }));
});

function handleAgentMessage(ws, msg) {
  switch (msg.type) {
    case 'hello':
      agentInfo = { version: msg.version || null, commit: msg.commit || null, latest: LATEST_AGENT_VERSION, update_available: versionLess(msg.version, LATEST_AGENT_VERSION), bridge: msg.bridge || null, hue: msg.hue || null, nanoleaf: msg.nanoleaf || null, health: msg.health || null, since: new Date().toISOString() };
      if (agentInfo.update_available && config.settings.auto_update !== false && !updating) {
        console.log(`[hub] connector ${msg.version} is behind ${LATEST_AGENT_VERSION}, updating it`);
        setTimeout(() => sendCommand({ type: 'update' }, 15 * 60 * 1000).then(r => { updating = false; console.log('[hub] connector updated', JSON.stringify(r.detail)); }).catch(e => { updating = false; console.warn('[hub] connector update failed:', e.message); broadcast({ type: 'toast', level: 'error', msg: `Connector update failed: ${e.message}` }); }), 3000);
        updating = true;
      }
      if (msg.inventory) setInventory(msg.inventory);
      if (msg.states) mergeStates(msg.states);
      // a connector coming back lists its timers again without saying how long each was set for; keep what we knew
      timers = keepMinutes(msg.timers || {}, timers);
      sun = msg.sun || null; nextRuns = msg.next_runs || {};
      follow = msg.follow || null;
      broadcast({ type: 'sun', sun, next_runs: nextRuns });
      if (follow) broadcast({ type: 'follow', follow });
      broadcast({ type: 'agent', online: true, info: agentInfo });
      broadcast({ type: 'state', states });
      broadcast({ type: 'timers', timers });
      record({ kind: 'agent', online: true });
      break;
    case 'schedule':
      record({ kind: 'schedule', id: msg.id, name: msg.name, ok: msg.ok !== false, error: msg.error || null });
      break;
    case 'sun':
      sun = msg.sun || null; nextRuns = msg.next_runs || {};
      broadcast({ type: 'sun', sun, next_runs: nextRuns });
      break;
    case 'follow':
      follow = msg.follow || null;
      broadcast({ type: 'follow', follow });
      break;
    case 'timer':
      // `minutes` is how long it was set for, noted as it starts (the connector says so the moment it does), so the
      // sleep timer's candle knows its full height whoever started it: this app, a remote or a routine
      if (msg.ends_at) timers[msg.target] = { ends_at: msg.ends_at, level: msg.level || 0, minutes: sameTimer(timers[msg.target], msg) ? timers[msg.target].minutes : Math.max(1, Math.round((msg.ends_at * 1000 - Date.now()) / 60000)) };
      else delete timers[msg.target];
      broadcast({ type: 'timers', timers });
      break;
    case 'inventory':
      setInventory(msg.inventory);
      break;
    case 'state':
      mergeStates(msg.states);
      broadcast({ type: 'state', states: msg.states });
      break;
    case 'button':   // raw press/release, for the "listen" screen
      // Logged so a remote that does nothing can be told apart from a remote that never reaches us at all.
      if (msg.event === 'Press') log(`press ${msg.device_id}/${msg.button_number}`);
      broadcast(msg);
      break;
    case 'gesture':  // resolved single/double/hold
      log(`gesture ${msg.gesture} on ${msg.device_id}/${msg.button_number} (${msg.bound ? 'bound' : 'nothing set for it'})`);
      broadcast(msg);
      record({ kind: 'pico', device_id: msg.device_id, button_number: msg.button_number, gesture: msg.gesture, bound: !!msg.bound });
      break;
    case 'result': {
      const p = pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(msg.id);
        if (msg.ok) p.resolve({ ok: true, detail: msg.detail || null });
        else p.reject(Object.assign(new Error(msg.error || 'agent reported failure'), { status: 502 }));
      }
      break;
    }
    case 'hue':
      if (agentInfo) { agentInfo.hue = msg.hue || null; broadcast({ type: 'agent', online: true, info: agentInfo }); }
      break;
    case 'nanoleaf':
      if (agentInfo) { agentInfo.nanoleaf = msg.nanoleaf || null; broadcast({ type: 'agent', online: true, info: agentInfo }); }
      break;
    // Every request the connector sends a Nanoleaf controller, for "Show technical details" on its own sheet
    // (the same idea as add_log for adding a device): a real controller's exact response, or the exact error
    // reaching it, turns "it still does not work" into something fixable from here.
    case 'nanoleaf_log':
      if (msg.entry) broadcast({ type: 'nanoleaf_log', entry: msg.entry });
      break;
    // What the connector has: the bridge, its buttons, how many button settings it holds and the last press
    // it saw. The app shows it in Settings so a dead button can be told apart from a dead link.
    case 'health': {
      const h = msg.health || {};
      log(`connector holds ${h.bindings} button settings, bridge ${h.bridge_ok ? 'answering' : 'not answering'} with ${h.buttons} buttons, ${h.presses} presses seen`
        + ((h.quiet_remotes || []).length ? `, no buttons listed for ${h.quiet_remotes.join(', ')}` : ''));
      if (agentInfo) { agentInfo.health = msg.health || null; broadcast({ type: 'agent', online: true, info: agentInfo }); }
      break;
    }
    case 'add_heard':
      if (Array.isArray(msg.heard)) addSession.heard = msg.heard;
      broadcast({ type: 'add_heard', device: msg.device || null, heard: addSession.heard });
      break;
    case 'add_log':
      if (msg.entry) { addSession.log.push(msg.entry); if (addSession.log.length > 60) addSession.log.splice(0, addSession.log.length - 60); broadcast({ type: 'add_log', entry: msg.entry }); }
      break;
    case 'add_state':
      addSession = { ...addSession, ...(msg.state || {}) };
      broadcast({ type: 'add_state', state: addSession, reason: msg.reason || null });
      break;
    case 'log':
      console.log(`[agent] ${msg.level || 'info'}: ${msg.msg}`);
      if (msg.level === 'error' || msg.level === 'warn') broadcast({ type: 'toast', level: msg.level, msg: msg.msg });
      break;
    default:
      break;
  }
}

function setInventory(inv) {
  inventory = {
    devices: inv.devices || {},
    buttons: inv.buttons || {},
    scenes: inv.scenes || {},
    areas: inv.areas || {},
    bridge: inv.bridge || null,
    updated: new Date().toISOString()
  };
  store.write('inventory', inventory);
  broadcast({ type: 'inventory', inventory });
}
function mergeStates(s) {
  for (const [k, v] of Object.entries(s || {})) states[k] = { ...(states[k] || {}), ...v };
  // each light as it now stands, so a partial update is still written down whole
  const merged = {};
  for (const k of Object.keys(s || {})) merged[k] = states[k];
  history.record(merged, id => ((inventory.devices || {})[id] || {}).domain);
}
const sameTimer = (was, now) => !!(was && was.minutes && Math.abs(was.ends_at - now.ends_at) < 2);
function keepMinutes(next, was) {
  for (const [k, v] of Object.entries(next)) if (v && sameTimer(was[k], v)) v.minutes = was[k].minutes;
  return next;
}
function snapshot() {
  return { inventory, states, config, timers, sun, follow, next_runs: nextRuns, activity: activity.slice(0, 50), agent: { online: !!agent, info: agentInfo }, add: addSession };
}
let activityDirty = false;
function record(entry) {
  const e = { ...entry, at: new Date().toISOString() };
  activity.unshift(e);
  if (activity.length > 300) activity.length = 300;
  activityDirty = true;
  broadcast({ type: 'activity', entry: e });
}
setInterval(() => { if (activityDirty) { activityDirty = false; store.write('activity', activity); } }, 5000).unref();
// The light history is written down less often: losing half a minute of it to a crash costs nothing anyone sees.
const saveHistory = () => { history.prune(); if (history.takeDirty()) store.write('history', history.toJSON()); };
setInterval(() => { try { saveHistory(); } catch (e) { log('history not saved:', e.message); } }, 30000).unref();
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of appClients) if (c.readyState === WebSocket.OPEN) c.send(data);
}
function sendToAgent(msg) {
  if (agent && agent.readyState === WebSocket.OPEN) { agent.send(JSON.stringify(msg)); return true; }
  return false;
}
function sendCommand(action, timeoutMs = 10000) {
  return new Promise((resolve, rejectP) => {
    const id = crypto.randomBytes(8).toString('hex');
    if (!sendToAgent({ type: 'command', id, action })) {
      return rejectP(Object.assign(new Error('the in-home agent is offline'), { status: 503 }));
    }
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectP(Object.assign(new Error('agent did not answer in time'), { status: 504 }));
    }, timeoutMs);
    pending.set(id, { resolve, reject: rejectP, timer });
  });
}

// Keepalive: Railway's proxy drops idle sockets, so ping both sides.
setInterval(() => {
  for (const c of [...appClients, agent].filter(Boolean)) {
    if (c.isAlive === false) { try { c.terminate(); } catch (_) { /* ignore */ } continue; }
    c.isAlive = false;
    try { c.ping(); } catch (_) { /* ignore */ }
  }
}, 25000).unref();

server.listen(PORT, () => console.log(`[hub] listening on ${PORT}, data in ${store.DATA_DIR}, connector version ${LATEST_AGENT_VERSION}`));

// Railway swaps containers with SIGTERM; exit cleanly so the old deploy is not labelled crashed.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[hub] ${sig}, shutting down`);
    if (activityDirty) { try { store.write('activity', activity); } catch (_) { /* ignore */ } }
    try { saveHistory(); } catch (_) { /* ignore */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
