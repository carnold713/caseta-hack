// "Back to how it was": a press that puts the lights back the way they were when they went off, the
// brightness and the colour both. What this checks is the app side, that the row is offered, saves the
// right action and reads back as itself; the connector's own memory is agent/test_restore.py.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The hub allows 20 logins in 15 minutes from one address and this suite is 30 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 }); await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    S.config.bindings = bindings().filter(b => b.device_id !== '9');
    await save({ quiet: true });
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);

  // the Kitchen Pico's top key, which is the "on" key the owner asked to put this on
  await page.click('#nav button[data-view=remotes]'); await page.waitForTimeout(700);
  await page.click('.remote-card[data-id="9"]'); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('.stage .pk[data-n="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(700);
  await page.click('[data-act="gesture-open"][data-g="single"]'); await page.waitForTimeout(800);

  check(!!(await page.$('[data-act="recipe"][data-r="back"]')), 'the row is one of the usual ways on a press');
  const d = await page.textContent('[data-act="recipe"][data-r="back"] .d');
  check(/brightness and colour/.test(d), `and says what it puts back (${d.trim()})`);
  await page.click('[data-act="recipe"][data-r="back"]'); await page.waitForTimeout(900);

  const saved = await page.evaluate(() => (bindings().find(b => b.device_id === '9' && b.button_number === 0 && b.gesture === 'single') || {}).actions);
  check(saved && saved.length === 1 && saved[0].type === 'restore', `it saves one restore (${JSON.stringify(saved)})`);
  check(saved && saved[0].target === 'a:20', `aimed at the remote's own room (${saved && saved[0].target})`);
  const said = await page.evaluate(() => describe(gestureActions('9', 0, 'single')));
  check(/^Puts .* back the way it was$/.test(said), `and reads plainly ("${said}")`);
  check((await page.evaluate(() => recipeOf(gestureActions('9', 0, 'single')))) === 'back', 'the press sheet finds the row again');
  check(!!(await page.$('[data-act="recipe"][data-r="back"].sel')), 'and ticks it');
  await page.screenshot({ path: __dirname + '/back-recipe.png' });

  // the hub has to accept it: a bad action type is a 400 and the save would be thrown away
  const kept = await page.evaluate(() => api('/api/snapshot').then(r => (r.config.bindings.find(b => b.device_id === '9' && b.button_number === 0) || {}).actions));
  check(kept && kept[0] && kept[0].type === 'restore', `the hub stored it (${JSON.stringify(kept)})`);

  console.log('errors: ' + (errors.length ? errors.join(' | ') : 'none'));
  if (errors.length) fails.push('page errors');
  await browser.close();
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
