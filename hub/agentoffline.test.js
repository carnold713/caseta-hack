'use strict';
/* When the house computer went offline: /api/snapshot says since when (agent.offline_since), a hello clears it, a
   close stamps it, and a hub restart keeps it, so the phone's one notification per outage is not sent twice.
   Starts the real hub on a free port with a throwaway data directory and plays a connector over its socket.
   Run: npm test */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const SERVER = path.join(__dirname, 'server.js');
const VERSION = (fs.readFileSync(path.join(__dirname, '..', 'agent', 'agent.py'), 'utf8').match(/^VERSION = "([^"]+)"/m) || [])[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function startHub(dir, port) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, APP_PASSWORD: '', AGENT_TOKEN: 'agent-test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 100 && !/listening on/.test(out); i++) await sleep(50);
  assert.match(out, /listening on/, `the hub started: ${out}`);
  return child;
}
async function stopHub(child) {
  if (child.exitCode != null) return;
  const gone = new Promise(r => child.once('exit', r));
  child.kill('SIGTERM');
  await gone;
}
async function snap(port) {
  const r = await fetch(`http://127.0.0.1:${port}/api/snapshot`);
  assert.strictEqual(r.status, 200);
  return (await r.json()).agent;
}
function connector(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/agent?token=agent-test`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', version: VERSION, inventory: { devices: {}, buttons: {}, areas: {}, scenes: {} }, states: {}, health: {} }));
      resolve(ws);
    });
    ws.on('error', reject);
  });
}

test('offline_since: stamped on a close, cleared by a hello, kept through a hub restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-offline-'));
  const port = await freePort();
  const t0 = Date.now();
  let hub = await startHub(dir, port);
  try {
    // no connector yet and nothing on file: counted from the hub's own start
    let a = await snap(port);
    assert.strictEqual(a.online, false);
    assert.ok(Date.parse(a.offline_since) >= t0 - 1000, `from the hub's start: ${a.offline_since}`);

    const ws = await connector(port);
    await sleep(300);
    a = await snap(port);
    assert.strictEqual(a.online, true);
    assert.strictEqual(a.offline_since, null, 'connected: no outage');

    const before = Date.now();
    ws.close();
    await sleep(300);
    a = await snap(port);
    assert.strictEqual(a.online, false);
    const since = a.offline_since;
    assert.ok(Date.parse(since) >= before - 50 && Date.parse(since) <= Date.now(), `stamped as it went: ${since}`);

    // a hub restart is not a new outage
    await stopHub(hub);
    await sleep(200);
    hub = await startHub(dir, port);
    a = await snap(port);
    assert.strictEqual(a.offline_since, since, 'the same outage after a restart');

    // and it is back: cleared on file too, so the next restart counts from its own start again
    const ws2 = await connector(port);
    await sleep(300);
    a = await snap(port);
    assert.strictEqual(a.offline_since, null);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'agent.json'), 'utf8')), { offline_since: null });
    ws2.close();
  } finally {
    await stopHub(hub);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
