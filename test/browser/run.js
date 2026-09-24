#!/usr/bin/env node
// The browser suite. Drives the real app in Chromium against a hub and a fake connector this runner
// starts, on a port it picks, with a data directory it wipes first.
//
// It owns the rig because the suite spent a long time not owning one. The tests lived outside the repo
// and each remembered whichever port its rig happened to be on that week, so running one meant knowing
// which of 4400, 4408, 4409, 4420 or 4485 it wanted; run it against the wrong one and it failed with
// ERR_CONNECTION_REFUSED, which reads exactly like a broken app. Now there is one port, this file
// hands it down, and a test that cannot reach the app is a real failure.
//
//   npm run test:browser                  all of them, in order, on a fresh rig
//   npm run test:browser -- polish night   only the ones whose name contains these
//   KEEP=1 npm run test:browser            leave the rig up afterwards to poke at
//
// Order matters. hue_color and nanoleaf pair the fake bridges, and what they leave behind is what lets
// later tests find a colour lamp; ia_test in particular cannot reach the colour sheet without them.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');
const ORDER = [
  'hue_test', 'hue_color_test', 'nanoleaf_test', 'copper_test', 'copper_edit_test', 'copper_remotes_test', 'copper_setup_test', 'copper_motion_test', 'copper_touch_test', 'daylight_test',
  'polish_test', 'ia_test', 'v7_light_test', 'lookswap_test', 'v7_scenes_test', 'roomscene_test', 'roombright_test', 'roomart_test', 'ui_test2', 'kinds_test', 'height_test', 'hscroll_test', 'swipe_test',
  'slide_test', 'night_test', 'onescene_test', 'cycle_test', 'fade_test', 'back_test', 'hold_test',
  'power_test', 'now_test', 'dimoff_test', 'lag_test', 'add_test', 'bugs_test', 'quiet_test',
  'health_test', 'huearea_test', 'err_test', 'remove_test', 'rooms_test', 'reconnect_test', 'sheetscroll_test', 'nav_test',
  'v7_home_test', 'v7_night_test', 'v7_log_test', 'v7_setup_test', 'toastoff_test', 'roomopen_test', 'predictiveback_test', 'chipopen_test', 'lightopen_test', 'remoteopen_test', 'layout_scenes_test',
  'layout_rooms_test',
  'header_test',
  'layout_shell_test', 'shell_nav_test', 'pins_test',
];

const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const pick = only.length ? ORDER.filter(n => only.some(o => n.includes(o))) : ORDER;
if (!pick.length) { console.error(`nothing matches ${only.join(', ')}`); process.exit(2); }

const freePort = () => new Promise(res => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await wait(250); }
}
const healthy = port => fetch(`http://127.0.0.1:${port}/healthz`).then(r => r.json()).then(j => j.ok && j.agent).catch(() => false);

(async () => {
  const PORT = process.env.PORT || String(await freePort());
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'caseta-suite-'));
  const env = { ...process.env, PORT, APP_PASSWORD: 'secret', AGENT_TOKEN: 'devtoken', DATA_DIR: DATA };
  const kids = [];
  const stop = () => { for (const k of kids) { try { process.kill(-k.pid); } catch (_) { try { k.kill(); } catch (_) {} } } };
  process.on('exit', () => { if (!process.env.KEEP) stop(); });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(130); });

  const log = fs.openSync(path.join(DATA, 'rig.log'), 'a');
  kids.push(spawn('node', [path.join(ROOT, 'hub', 'server.js')], { env, detached: true, stdio: ['ignore', log, log] }));
  if (!await until(() => fetch(`http://127.0.0.1:${PORT}/healthz`).then(r => r.ok).catch(() => false))) {
    console.error(`the hub never came up on ${PORT}. ${path.join(DATA, 'rig.log')}`); process.exit(1);
  }
  kids.push(spawn('node', [path.join(HERE, 'fake_connector.js')], { env: { ...env, HUB_PORT: PORT }, detached: true, stdio: ['ignore', log, log] }));
  if (!await until(() => healthy(PORT))) {
    console.error(`the fake connector never reached the hub. ${path.join(DATA, 'rig.log')}`); process.exit(1);
  }
  // One login for the whole suite. The hub allows 20 from an address in 15 minutes and this is 28
  // tests, so a run that logged in per test used to die two thirds of the way down with every
  // remaining test timing out on #nav: the page was sitting on the password gate and nothing said so.
  const login = await fetch(`http://127.0.0.1:${PORT}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'secret' }),
  }).then(r => r.json()).catch(e => ({ error: e.message }));
  if (!login.token) { console.error(`could not log in to the rig: ${login.error || 'no token'}`); process.exit(1); }
  env.APP_TOKEN = login.token;
  console.log(`rig on ${PORT}, data in ${DATA}\n`);

  const results = [];
  for (const name of pick) {
    const started = Date.now();
    const r = spawnSync('node', [path.join(HERE, `${name}.js`)], {
      env: { ...env, HUB_PORT: PORT, NODE_PATH: path.join(ROOT, 'node_modules') },
      cwd: DATA, encoding: 'utf8', timeout: 7 * 60 * 1000,
    });
    const out = (r.stdout || '') + (r.stderr || '');
    const ok = r.status === 0;
    results.push({ name, ok, out, secs: Math.round((Date.now() - started) / 1000) });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(18)} ${String(results.at(-1).secs).padStart(3)}s`);
    if (!ok) for (const line of out.split('\n').filter(l => /^FAIL|Error|Timeout|waiting for locator/.test(l)).slice(0, 4)) console.log(`       ${line.trim()}`);
  }

  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} of ${results.length} passed`);
  if (bad.length) {
    const where = path.join(DATA, 'failures.txt');
    fs.writeFileSync(where, bad.map(r => `===== ${r.name} =====\n${r.out}`).join('\n'));
    console.log(`failed: ${bad.map(r => r.name).join(', ')}\nfull output in ${where}`);
  }
  if (process.env.KEEP) console.log(`\nrig left running on ${PORT} (KEEP=1). Stop it with: pkill -f "PORT=${PORT}"`);
  process.exit(bad.length ? 1 : 0);
})();
