const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // reuse a saved token where there is one: the hub allows 20 logins per 15 minutes
  try { const __t = require('fs').readFileSync(__dirname + '/polish_token.txt', 'utf8').trim(); if (__t) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, __t); } catch (_) { /* no saved token */ }
  const page = await ctx.newPage();
  const errors = [];
  const fav = async (label) => console.log(label, await page.evaluate(() => JSON.stringify(S.config.favorites)));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.screenshot({ path: 'r-login.png' });
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 8000 });
  await page.waitForTimeout(1200);
  // the greeting (once per home) would sit over Home: close it the way "Just look around" does
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500);
  await page.screenshot({ path: 'r-home.png', fullPage: true });
  // ia-v5 stage 2: a room is a page, and the star moved from the row to the light's own page ("Favourite")
  await page.click('.room[data-room="20"] [data-act="room-open"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'r-room.png', fullPage: true });
  await page.click('.light [data-act="light-open"]'); await page.waitForTimeout(700);
  await page.click('[data-act="ld-fav"]'); await page.waitForTimeout(500);
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(500);
  await page.screenshot({ path: 'r-home-open.png', fullPage: true });
  await fav('after star');
  // remotes
  await page.click('#nav button[data-view=remotes]');
  await page.waitForSelector('.remote-card');
  await page.screenshot({ path: 'r-remotes.png' });
  await fav('remotes tab'); await page.click('.remote-card');
  await page.waitForSelector('.stage .pico-svg'); await page.waitForTimeout(500);
  await page.screenshot({ path: 'r-remote.png', fullPage: true });
  // the picture lives under More now. The remote's own screen is a sheet too, so its back arrow (twice: Look to
  // More, More to the remote) is the way back to it; sheet-close would drop past it to the Remotes list.
  await page.click('[data-act="remote-more"]'); await page.waitForTimeout(400); await page.click('[data-act="remote-look"]'); await page.waitForTimeout(400); await page.screenshot({ path: 'r-look.png' }); await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForTimeout(400); await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForTimeout(400);
  await page.click('.stage .pk[data-n="0"]');
  await page.waitForSelector('#sheet-root.in');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'r-sheet-gestures.png' });
  await page.click('[data-act="gesture-open"][data-g="double"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'r-sheet-recipes.png' });
  // the lights row is a value row: open it to reach the chips and "Specific lights…"
  if (!(await page.$('[data-act="pick-target-more"]'))) { await page.click('[data-act="pick-open"]'); await page.waitForTimeout(300); }
  await page.click('[data-act="pick-target-more"]');
  await page.waitForTimeout(400);
  await page.click('[data-act="picker-expand"] >> nth=0');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'r-picker.png' });
  await page.click('[data-act="picker-done"]');
  await page.waitForTimeout(400);
  // Movie mode is not among the usual ways for a press-twice: show all ways first
  if (!(await page.$('[data-act="recipe"][data-r="movie"]'))) { await page.click('[data-act="recipe-all"]'); await page.waitForTimeout(300); }
  await page.evaluate(() => { const r = document.querySelector('.item.recipe[data-r]:not(.sel)') || document.querySelector('.item.recipe[data-r]'); if (r) r.click(); });
  await page.waitForTimeout(800); await fav('after movie');
  await page.screenshot({ path: 'r-sheet-recipes-selected.png' });
  // "All ways" is a pane of its own now: step back to the press sheet before looking for its More row
  if (!(await page.$('[data-act="recipe-more"]')) && await page.$('[data-act="sheet-back"]')) { await page.click('[data-act="sheet-back"]'); await page.waitForTimeout(500); }
  // night variant: under More
  await page.click('[data-act="recipe-more"]'); await page.waitForTimeout(300);
  await page.click('[data-act="recipe-night"]');
  await page.waitForTimeout(300);
  await page.click('[data-act="recipe"][data-r="night"]');
  await page.waitForTimeout(800);
  // hold: brighten while holding
  await page.click('[data-act="sheet-back"]');
  await page.waitForTimeout(300);
  await page.click('[data-act="gesture-open"][data-g="hold"]');
  await page.waitForTimeout(300);
  await page.click('[data-act="recipe"][data-r="hold_up"]');
  await page.waitForTimeout(800);
  await page.click('[data-act="sheet-back"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'r-sheet-gestures-set.png' });
  // advanced editor
  await page.click('[data-act="gesture-open"][data-g="single"]');
  await page.waitForTimeout(300);
  await page.click('[data-act="recipe-more"]'); await page.waitForTimeout(300);
  await page.click('[data-act="advanced"]');
  await page.waitForTimeout(400);
  await page.click('[data-act="adv-add"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'r-advanced.png' });
  await fav('before adv-done'); await page.click('[data-act="adv-done"]');
  await page.waitForTimeout(800); await fav('after adv-done');
  await page.click('[data-act="sheet-close"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'r-remote-after.png', fullPage: true });
  // scenes
  // ia-v5 stage 3: Scenes is a page pushed from Home, not a tab
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(500);
  await page.click('[data-act="scenes-open"]');
  await page.waitForTimeout(300);
  await page.click('[data-act="scene-new"]');
  await page.waitForTimeout(600);
  await fav('before scene'); await page.fill('#scene-name', 'Dinner'); await page.press('#scene-name', 'Tab');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'r-scene-edit.png' });
  await page.click('[data-act="sheet-close"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'r-scenes.png' });
  // settings
  await page.click('#nav button[data-view=settings]');
  await page.waitForTimeout(300);
  // the how-to lives on the "Your home" page now (Settings is one screen, docs/ia-v5.md 3)
  await page.click('[data-act="settings-page"][data-p="home"]'); await page.waitForTimeout(400);
  await page.click('[data-act="settings-how"]');   // the disclosure is a button with an eased fold now, not a <details>
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'r-settings.png', fullPage: true });
  await page.click('[data-act="settings-back"]'); await page.waitForTimeout(400);
  await page.click('[data-act="activity"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'r-activity.png' });
  await page.click('[data-act="sheet-close"]');
  const snap = await page.evaluate(async () => (await fetch('/api/snapshot', { headers: { authorization: 'Bearer ' + localStorage.token } })).json());
  console.log('bindings:', snap.config.bindings.map(b => `${b.gesture}@${b.button_number}: ${b.actions.map(a => a.type + (a.target ? '→' + a.target : '')).join('+')}${b.night ? ' [night ' + b.night.actions.map(a => a.type).join('+') + ']' : ''}`).join(' | '));
  console.log('favorites:', snap.config.favorites, 'presets:', snap.config.presets.map(p => p.name + ':' + Object.keys(p.levels).length));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
