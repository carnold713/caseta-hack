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

const PORT = Number(process.env.PORT) || 4400;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update(`caseta-hack|${APP_PASSWORD}|${AGENT_TOKEN}`).digest('hex');

if (!APP_PASSWORD) console.warn('[hub] APP_PASSWORD is not set: the app is open to anyone who finds the URL');
if (!AGENT_TOKEN) console.warn('[hub] AGENT_TOKEN is not set: any agent can connect');

// ---------- state ----------
let config = validateConfig(store.read('config', store.DEFAULT_CONFIG));
let inventory = store.read('inventory', () => ({ devices: {}, buttons: {}, scenes: {}, areas: {}, bridge: null, updated: null }));
let states = {}; // device_id -> {level, fan_speed}
let timers = {}; // target -> {ends_at, level}
let activity = store.read('activity', () => []); // newest first, capped
let agent = null;   // the single connected agent socket
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

// Ask the agent to re-read the bridge (after adding a device in the Lutron app).
app.post('/api/refresh', requireAuth, async (req, res) => {
  try { res.json(await sendCommand({ type: 'refresh' })); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

// Digital Asset Links for the PWABuilder Android package (Trusted Web Activity).
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.type('application/json');
  if (process.env.ASSETLINKS_JSON) return res.send(process.env.ASSETLINKS_JSON);
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const sha = process.env.ANDROID_CERT_SHA256;
  if (!pkg || !sha) return res.send('[]');
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
      agent = null; agentInfo = null; timers = {};
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
      agentInfo = { version: msg.version || null, bridge: msg.bridge || null, since: new Date().toISOString() };
      if (msg.inventory) setInventory(msg.inventory);
      if (msg.states) mergeStates(msg.states);
      timers = msg.timers || {};
      broadcast({ type: 'agent', online: true, info: agentInfo });
      broadcast({ type: 'state', states });
      broadcast({ type: 'timers', timers });
      record({ kind: 'agent', online: true });
      break;
    case 'timer':
      if (msg.ends_at) timers[msg.target] = { ends_at: msg.ends_at, level: msg.level || 0 };
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
      broadcast(msg);
      break;
    case 'gesture':  // resolved single/double/hold
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
}
function snapshot() {
  return { inventory, states, config, timers, activity: activity.slice(0, 50), agent: { online: !!agent, info: agentInfo } };
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
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of appClients) if (c.readyState === WebSocket.OPEN) c.send(data);
}
function sendToAgent(msg) {
  if (agent && agent.readyState === WebSocket.OPEN) { agent.send(JSON.stringify(msg)); return true; }
  return false;
}
function sendCommand(action) {
  return new Promise((resolve, rejectP) => {
    const id = crypto.randomBytes(8).toString('hex');
    if (!sendToAgent({ type: 'command', id, action })) {
      return rejectP(Object.assign(new Error('the in-home agent is offline'), { status: 503 }));
    }
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectP(Object.assign(new Error('agent did not answer in time'), { status: 504 }));
    }, 10000);
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

server.listen(PORT, () => console.log(`[hub] listening on ${PORT}, data in ${store.DATA_DIR}`));
