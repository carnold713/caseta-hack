// Moods and scenes are one thing. A scene filed under a room shows on that room's page, in its
// step-through and in every picker, whether it came from the five the room was offered or was made by
// hand; and any scene can be given a room or have it taken away. PORT=4492 node onescene_test.js
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
  // a clean start: the Kitchen's five, one hand-made scene with no room, nothing on the remote
  await page.evaluate(async () => {
    S.config.presets = []; S.config.bindings = bindings().filter(b => b.device_id !== '9');
    suggestScenes('20');
    S.config.presets.push({ id: 'ownscene', name: 'Pizza night', levels: { 5: 80, 6: 30 }, fade: 2, area: null, mood: null, edited: false });
    await save({ quiet: true });
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);

  // 1. one helper answers for both: a room's scenes are every scene filed under it
  const before = await page.evaluate(() => roomScenes('20').map(p => p.id));
  check(before.length === 5, `the Kitchen starts with its five (${before.length})`);
  check((await page.evaluate(() => roomScenes('20').map(p => sceneShortName(p)))).join() === 'Bright,Relax,Dinner,Movie,Night', 'in the order they are suggested in');

  // 2. give the hand-made scene a room: it joins them, at the end
  await page.evaluate(async () => { const p = presets().find(x => x.id === 'ownscene'); p.area = '20'; p.name = 'Kitchen · Pizza night'; await save({ quiet: true }); });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => roomScenes('20').map(p => sceneShortName(p)));
  check(after.join() === 'Bright,Relax,Dinner,Movie,Night,Pizza night', `a scene you made joins the room's own (${after.join()})`);

  // 3. the room's page shows it, and running it is keyed on the scene, not on one of five ids
  await page.click('.rtile[data-rtile="20"] [data-act="room-open"]'); await page.waitForTimeout(900);
  const chips = await page.$$eval('[data-scenerow] [data-act="room-scene"]', e => e.map(x => x.textContent.trim()));
  check(chips.join() === 'Bright,Relax,Dinner,Movie,Night,Pizza night', `the room's row lists all six (${chips.join()})`);
  const heads = await page.$$eval('#sheet-root .gh', e => e.map(x => x.textContent.trim()));
  check(heads.includes('Scenes') && !heads.some(t => /mood/i.test(t)), `the room calls them Scenes (${heads.join(' / ')})`);
  await page.screenshot({ path: __dirname + '/one-room.png' });
  const ids = await page.$$eval('[data-scenerow] [data-act="room-scene"]', e => e.map(x => x.dataset.p));
  check(ids.every(Boolean) && ids.includes('ownscene'), 'each chip carries its own scene id, the hand-made one included');
  await page.click('[data-act="room-scene"][data-p="ownscene"]'); await page.waitForTimeout(1200);
  check((await page.evaluate(() => [level('5'), level('6')])).join() === '80,30', 'tapping a hand-made one runs it');

  // 4. the step-through offers the room's scenes as one group, all six
  await page.evaluate(() => sheet.close()); await page.waitForTimeout(500);
  await page.click('#nav button[data-view=remotes]'); await page.waitForTimeout(700);
  await page.click('.remote-card[data-id="9"]'); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('.stage .pk[data-n="3"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(700);
  await page.click('[data-act="gesture-open"][data-g="single"]'); await page.waitForTimeout(800);
  await page.click('[data-act="recipe"][data-r="scenecycle"]'); await page.waitForTimeout(800);
  const roomRow = await page.textContent('[data-act="cycle-room"][data-a="20"] .t');
  check(/All of Kitchen's scenes/.test(roomRow), `the room row says scenes (${roomRow.trim()})`);
  check((await page.evaluate(() => (S.cyclePick || []).length)) === 6, 'and the loop starts on all six');

  // 5. one scene picker, grouped by room, the remote's own room first
  await page.click('[data-act="sheet-back"]'); await page.waitForTimeout(600);
  await page.click('[data-act="recipe"][data-r="scene"]'); await page.waitForTimeout(800);
  const caps = await page.$$eval('#sheet-root .lcap', e => e.map(x => x.textContent.trim()));
  check(/^Kitchen/.test(caps[0] || ''), `the remote's own room leads the picker (${caps.join(' / ')})`);
  const names = await page.$$eval('#sheet-root [data-act="pick-scene"] .t', e => e.map(x => x.textContent));
  check(names.includes('Pizza night') && names.includes('Relax'), `one picker lists both kinds (${names.join(', ')})`);
  check(!(await page.$('[data-act="recipe"][data-r="mood"]')), 'there is no second scene row to go looking for');
  await page.screenshot({ path: __dirname + '/one-picker.png' });

  // 6. the rows that used to be mood-only are gone and nothing they did was lost
  await page.click('[data-act="sheet-back"]'); await page.waitForTimeout(600);
  await page.click('[data-act="recipe-all"]'); await page.waitForTimeout(700);
  const rows = await page.$$eval('[data-act="recipe"]', e => e.map(x => x.dataset.r));
  check(!rows.includes('mood') && !rows.includes('nextmood'), `"Room mood" and "Next mood" have folded in (${rows.filter(r => /mood/.test(r)).join() || 'none left'})`);
  check(rows.includes('scene') && rows.includes('scenecycle'), 'and both general rows are there');
  // a walk written by the old "Next mood" still resolves to a row that can edit it
  const old = await page.evaluate(() => recipeOf([{ type: 'cycle_presets', preset_ids: roomScenes('20').slice(0, 5).map(p => p.id) }]));
  check(old === 'scenecycle', `a walk the old row wrote still opens (${old})`);

  // 7. the Scenes tab is one list, grouped by room
  await page.evaluate(() => sheet.close()); await page.waitForTimeout(500);
  await page.evaluate(() => { S.view = 'scenes'; location.hash = 'scenes'; render(); }); await page.waitForTimeout(900);
  const sc = await page.$$eval('#view .gh', e => e.map(x => x.textContent.replace(/Edit|Done/, '').trim()));
  check(sc.includes('Kitchen') && !sc.some(t => /mood/i.test(t)), `the tab groups by room and says nothing about moods (${sc.join(' / ')})`);
  const tiles = await page.$$eval('#view .tile .n', e => e.map(x => x.textContent));
  check(tiles.includes('Bright') && tiles.includes('Pizza night'), `both kinds are tiles in the same list (${tiles.join(', ')})`);
  await page.screenshot({ path: __dirname + '/one-scenes.png' });

  // 8. taking the room away puts it back under "Any room", and the room's row drops it
  await page.evaluate(async () => { const p = presets().find(x => x.id === 'ownscene'); p.area = null; p.name = 'Pizza night'; await save({ quiet: true }); });
  await page.waitForTimeout(800);
  check((await page.evaluate(() => roomScenes('20').length)) === 5, 'taking the room away drops it from that room');
  check((await page.evaluate(() => presets().some(p => p.id === 'ownscene'))), 'and the scene itself is still there');

  console.log('errors: ' + (errors.length ? errors.join(' | ') : 'none'));
  if (errors.length) fails.push('page errors');
  await browser.close();
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
