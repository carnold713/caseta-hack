// Toasts are off (the owner's call: they got in the way). Everything that used to answer in one, a save, a scene
// run, a Lutron scene, a deletion, a failed save, a line from the server and a toast asked for directly, now leaves
// #toast-root empty the whole way through: a watcher on it records anything ever drawn there, however briefly.
// Puts the config back as it found it.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.removeItem('scenesNotNow'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  // the hash is changed in place, never with page.goto, so the watcher below lives through the whole test
  const hash = async h => { await C(x => { location.hash = x; }, h); await wait(900); };

  await page.goto(`http://127.0.0.1:${PORT}/ui/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(800);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const before = await C(() => JSON.stringify(window.__copper.S.config));

  // anything ever put in #toast-root, and every command sent, from here on
  await C(() => {
    const c = window.__copper;
    window.__drawn = []; window.__sent = [];
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) window.__drawn.push(n.textContent || n.nodeName); }).observe(document.querySelector('#toast-root'), { childList: true, subtree: true });
    c.__run0 = c.run; c.run = a => { window.__sent.push(a); return c.__run0(a); };
  });
  const drawn = () => C(() => window.__drawn.slice());

  // a scene made from what is on (a save), then run from the list (it used to say "... is on" with Put back)
  await C(() => window.__copper.run({ type: 'level', target: 'd:5', level: 60 })); await wait(1200);
  await hash('scenes');
  await page.click('[data-act="scene-new"]'); await wait(1500);
  const pid = await C(() => location.hash.split('/')[1]);
  check('+ makes a scene and opens it', !!pid && !!(await C(id => window.__copper.data.presets().find(p => p.id === id), pid)), pid);
  await page.click('.sheet-close'); await wait(700);
  await page.evaluate(id => document.querySelector(`.scene-row[data-id="${id}"]`).scrollIntoView({ block: 'center' }), pid); await wait(300);
  await page.click(`.scene-row[data-id="${pid}"]`); await wait(1400);
  check('tapping the scene runs it', (await C(id => window.__sent.filter(a => a.type === 'preset' && a.preset_id === id).length, pid)) === 1);

  // a Lutron scene (it used to say "... is on")
  const lut = await page.$('[data-act="scene-run-lutron"]');
  check('there is a Lutron scene to run', !!lut);
  if (lut) {
    const sid = await lut.getAttribute('data-sid');
    await lut.click(); await wait(1200);
    check('tapping it runs it', (await C(id => window.__sent.filter(a => a.type === 'scene' && String(a.scene_id) === id).length, sid)) === 1);
  }

  // a deletion, which used to be the one place a toast kept Undo
  await hash(`scenes/${pid}`);
  await page.click('[data-act="scene-delete"]'); await wait(400);
  await page.click('[data-act="scene-delete-go"]'); await wait(1400);
  check('the scene is deleted', !(await C(id => window.__copper.data.presets().find(p => p.id === id), pid)));

  // a save that fails, which used to say "Couldn't save." in a red toast
  const failed = await C(async () => {
    const c = window.__copper; const real = c.data.saveConfig; let asked = 0;
    c.data.saveConfig = () => { asked += 1; return Promise.reject(new Error('the hub said no')); };
    try { await c.save('Saved', { keepUndo: true }); } finally { c.data.saveConfig = real; }
    return asked;
  });
  check('a failing save was tried', failed === 1, failed);

  // a line from the server, and a toast asked for straight out, an error and one with Undo among them
  await C(() => {
    const c = window.__copper;
    c.S.ws.onmessage({ data: JSON.stringify({ type: 'toast', msg: 'From the server', level: 'error' }) });
    c.toast('Plain'); c.toast('Wrong', { err: true }); c.toast('Deleted', { keepUndo: true, undo: () => {} });
  });
  await wait(600);

  const got = await drawn();
  check('nothing was ever drawn into #toast-root', !got.length, got);
  check('and it is empty now', (await C(() => document.querySelector('#toast-root').innerHTML)) === '');

  await C(async b => { const c = window.__copper; c.run = c.__run0; delete c.__run0; await c.run({ type: 'level', target: 'd:5', level: 'off' }); c.data.restoreConfig(b); await c.data.saveConfig(); }, before);
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
