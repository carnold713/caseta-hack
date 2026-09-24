// "Step through scenes": choose the scenes, and on a remote with arrows both get set, up going
// forwards and down going back. PORT=4492 node cycle_test.js
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/classic/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);

  // the Kitchen needs moods for the loop to have anything to walk, and the remote needs nothing set:
  // a second run would otherwise open the picker on the loop the first run saved
  await page.evaluate(async () => {
    S.config.bindings = bindings().filter(b => b.device_id !== '9');
    suggestScenes('20');
    await save({ quiet: true });
  });
  await page.waitForTimeout(600);
  const moods = await page.evaluate(() => roomScenes('20').map(p => p.id));
  check(moods.length === 5, `the Kitchen has five moods (${moods.length})`);

  // the Kitchen Pico is a Pico3ButtonRaiseLower: on, up, favourite, down, off
  const bedroom = await page.evaluate(() => roomScenes('22').length);
  check(bedroom === 0, `the Bedroom has none, so a remote there starts the loop empty (${bedroom})`);
  const pair = await page.evaluate(() => arrowPair('9'));
  check(pair && pair.up === 3 && pair.down === 4, `the picture knows which keys are the arrows (${JSON.stringify(pair)})`);

  await page.click('#nav button[data-view=remotes]'); await page.waitForTimeout(700);
  await page.click('.remote-card[data-id="9"]'); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('.stage .pk[data-n="3"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(700);
  await page.click('[data-act="gesture-open"][data-g="single"]'); await page.waitForTimeout(800);
  // an arrow key is the one you press again and again, so the row is offered without going looking
  const armOrder = await page.$$eval('[data-act="recipe"]', e => e.map(x => x.dataset.r));
  check(armOrder.includes('scenecycle'), `the row is one of the usual ways on an arrow key (${armOrder.join(', ')})`);
  await page.click('[data-act="recipe-all"]'); await page.waitForTimeout(700);
  check(!!(await page.$('[data-act="recipe"][data-r="scenecycle"]')), 'and it is under all ways too');
  await page.click('[data-act="sheet-back"]'); await page.waitForTimeout(600);
  await page.click('[data-act="recipe"][data-r="scenecycle"]'); await page.waitForTimeout(700);

  const title = await page.textContent('#sheet-root .sh h2').catch(() => '');
  check(/Which scenes/.test(title), `the picker opens (${title.trim()})`);
  const pre = await page.evaluate(() => (S.cyclePick || []).slice());
  check(pre.length === 5 && pre.join() === moods.join(), `it starts on the remote's own room's moods (${pre.length})`);
  check(/Set both arrows/.test(await page.textContent('[data-act="cycle-save"]')), 'the button says it sets both arrows');

  // start over, then tick three in an order of our own
  await page.click('[data-act="cycle-clear"]'); await page.waitForTimeout(400);
  check((await page.$$('[data-act="cycle-save"][disabled]')).length === 1, 'one scene is not a loop, so it cannot be saved yet');
  for (const id of [moods[3], moods[0], moods[2]]) { await page.click(`[data-act="cycle-scene"][data-p="${id}"]`); await page.waitForTimeout(300); }
  const picked = await page.evaluate(() => (S.cyclePick || []).slice());
  check(picked.join() === [moods[3], moods[0], moods[2]].join(), 'ticking is the ordering');
  await page.screenshot({ path: __dirname + '/cycle-picker.png' });
  await page.click('[data-act="cycle-save"]'); await page.waitForTimeout(900);

  // both arrows, one forwards and one back, over the same three
  const saved = await page.evaluate(() => bindings().filter(b => b.device_id === '9' && b.gesture === 'single' && b.actions[0] && b.actions[0].type === 'cycle_presets')
    .map(b => ({ n: b.button_number, ids: b.actions[0].preset_ids, dir: b.actions[0].dir || 1 })).sort((a, b) => a.n - b.n));
  check(saved.length === 2, `both arrows were set (${saved.length})`);
  check(saved[0] && saved[0].n === 3 && saved[0].dir === 1, 'the up arrow goes forwards');
  check(saved[1] && saved[1].n === 4 && saved[1].dir === -1, 'the down arrow goes back');
  check(saved[0] && saved[1] && saved[0].ids.join() === saved[1].ids.join() && saved[0].ids.join() === picked.join(), 'both walk the same list');

  // what the app says about it, and that reopening the press finds the row again
  const said = await page.evaluate(() => [describe(gestureActions('9', 3, 'single')), describe(gestureActions('9', 4, 'single'))]);
  check(/^Steps through 3 scenes$/.test(said[0]), `forwards reads plainly ("${said[0]}")`);
  check(/^Steps backwards through 3 scenes$/.test(said[1]), `backwards says so ("${said[1]}")`);
  const rec = await page.evaluate(() => [recipeOf(gestureActions('9', 3, 'single')), recipeOf(gestureActions('9', 4, 'single'))]);
  check(rec.join() === 'scenecycle,scenecycle', `the press sheet finds the row again (${rec.join()})`);
  // and the old "Next mood" is still itself
  const nm = await page.evaluate(() => recipeOf([{ type: 'cycle_presets', preset_ids: roomScenes('20').map(p => p.id) }]));
  check(nm === 'scenecycle', `a walk the old "Next mood" row wrote opens on the row that replaced it (${nm})`);

  // reopening the picker shows what was saved, not the default
  await page.click('[data-act="recipe"][data-r="scenecycle"]'); await page.waitForTimeout(700);
  const again = await page.evaluate(() => (S.cyclePick || []).slice());
  check(again.join() === picked.join(), 'reopening it shows the loop that is set');
  await page.screenshot({ path: __dirname + '/cycle-saved.png' });

  // a key that is not an arrow keeps the row where it was, under "all ways"
  await page.evaluate(() => sheet.close()); await page.waitForTimeout(600);
  await page.click('.remote-card[data-id="9"]'); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('.stage .pk[data-n="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(700);
  await page.click('[data-act="gesture-open"][data-g="single"]'); await page.waitForTimeout(800);
  const topOrder = await page.$$eval('[data-act="recipe"]', e => e.map(x => x.dataset.r));
  check(topOrder.includes('scenecycle'), `the row is reachable on a key that is not an arrow too (${topOrder.join(', ')})`);
  check(topOrder.indexOf('scenecycle') > 1, `and on that key it sits in the room slot, not near the top (${topOrder.indexOf('scenecycle')})`);
  check(armOrder.indexOf('scenecycle') === 1, `where an arrow key leads with it (${armOrder.indexOf('scenecycle')})`);

  console.log('errors: ' + (errors.length ? errors.join(' | ') : 'none'));
  if (errors.length) fails.push('page errors');
  await browser.close();
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
