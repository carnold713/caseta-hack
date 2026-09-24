// A scene arrives in about a second. The five a room is offered used to fade over 1, 3, 3, 8 and 2
// seconds, and a scene keeps the fade it was made with, so the table and the scenes already in a home
// both have to move. What somebody chose for themselves does not.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The hub allows 20 logins in 15 minutes from one address and this suite is 29 tests, so they
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

  // 1. a room offered its five gets five one-second scenes
  await page.evaluate(async () => {
    const usesScene = b => (b.actions || []).some(a => a.preset_id || a.preset_ids);
    S.config.bindings = bindings().filter(b => !usesScene(b));
    S.config.presets = [];
    suggestScenes('20');
    await save({ quiet: true });
  });
  await page.waitForTimeout(700);
  const fades = await page.evaluate(() => roomSuggested('20').map(p => [p.mood, p.fade]));
  check(fades.length === 5, `the room has its five (${fades.length})`);
  check(fades.every(([, f]) => f === 1), `every one of them fades over a second (${fades.map(f => f.join(':')).join(', ')})`);

  // 2. a home made before this still holds the old numbers, and one pass brings them forward
  await page.evaluate(async () => {
    const old = { bright: 1, relax: 3, dinner: 3, movie: 8, night: 2 };
    for (const p of presets()) if (p.mood) p.fade = old[p.mood];
    // one the person went into and left at three: theirs, whatever the app would have chosen
    const relax = presets().find(p => p.mood === 'relax'); relax.edited = true;
    // and one they gave a long fade on purpose
    const dinner = presets().find(p => p.mood === 'dinner'); dinner.edited = true; dinner.fade = 30;
    await save({ quiet: true });
  });
  await page.waitForTimeout(600);
  const moved = await page.evaluate(() => shortenSuggestedFades());
  check(moved === 2, `only the untouched ones move (${moved} of 5)`);
  const after = await page.evaluate(() => Object.fromEntries(roomSuggested('20').map(p => [p.mood, p.fade])));
  check(after.bright === 1 && after.movie === 1 && after.night === 1, `the eight-second Movie is a second now (${JSON.stringify(after)})`);
  check(after.relax === 3, 'a scene they went into keeps what it had');
  check(after.dinner === 30, 'and a long fade they chose on purpose is left alone');

  // 3. running it again does nothing, which is what makes it safe at every boot
  check((await page.evaluate(() => shortenSuggestedFades())) === 0, 'a second pass changes nothing');

  // 4. the scene the app sends is the one it holds
  await page.evaluate(async () => { const p = presets().find(x => x.mood === 'movie'); p.edited = false; await save({ quiet: true }); });
  await page.waitForTimeout(600);
  const sent = await page.evaluate(() => (presets().find(p => p.mood === 'movie') || {}).fade);
  check(sent === 1, `what a tap on Movie asks the bridge for (${sent}s)`);
  // and the editor still offers the long ones for anyone who wants them
  await page.evaluate(() => { S.view = 'scenes'; location.hash = 'scenes'; render(); }); await page.waitForTimeout(800);
  await page.click('[data-act="scenes-edit"]'); await page.waitForTimeout(400);
  await page.click('.tile.editing'); await page.waitForTimeout(700);
  await page.click('[data-act="scene-more"]'); await page.waitForTimeout(600);
  const opts = await page.$$eval('#scene-fade option', e => e.map(x => x.textContent));
  check(opts.includes('8 seconds') && opts.includes('30 seconds'), `a slow fade is still a choice (${opts.join(', ')})`);

  // 5. a tile stops repeating what every scene does, and still says what is unusual
  await page.evaluate(() => sheet.close()); await page.waitForTimeout(500);
  await page.evaluate(async () => { const p = presets().find(x => x.mood === 'night'); p.edited = true; p.fade = 0; await save({ quiet: true }); });
  await page.waitForTimeout(700);
  const subs = await page.evaluate(() => Object.fromEntries(roomSuggested('20').map(p => [p.mood, sceneSub(p)])));
  check(!/fades over/.test(subs.movie), `a one-second scene does not announce it (${subs.movie})`);
  check(/fades over 30 seconds/.test(subs.dinner), `a long one still does (${subs.dinner})`);
  check(/at once/.test(subs.night), `and so does one set to skip the fade (${subs.night})`);

  console.log('errors: ' + (errors.length ? errors.join(' | ') : 'none'));
  if (errors.length) fails.push('page errors');
  await browser.close();
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
