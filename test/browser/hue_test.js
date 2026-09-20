// Connect a Hue bridge from Settings; its room, lights and scene join the app; forget it again.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // reuse a saved token where there is one: the hub allows 20 logins per 15 minutes
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR|502/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav button[data-view=settings]', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400); await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); await page.waitForSelector('[data-act="hue-open"]');
  console.log('settings row:', await page.textContent('[data-act="hue-open"] .t'));
  await page.click('[data-act="hue-open"]'); await page.waitForSelector('#sheet-root.in'); await page.waitForTimeout(400);
  // this rig's connector may still be paired from an earlier run: forget it so the walk starts where it should
  if (await page.$('[data-act="hue-forget"]')) { await page.click('[data-act="hue-forget"]'); await page.waitForTimeout(1500); if (!(await page.$('#sheet-root.in'))) { await page.click('[data-act="hue-open"]'); await page.waitForTimeout(600); } }
  await page.screenshot({ path: 's10-hue-find.png' });
  await page.waitForSelector('[data-act="hue-pick"]', { timeout: 8000 }); await page.waitForTimeout(300);
  console.log('found:', await page.textContent('[data-act="hue-pick"] .t'), '|', await page.textContent('[data-act="hue-pick"] .d'));
  await page.click('[data-act="hue-pick"]'); await page.waitForTimeout(500);
  await page.screenshot({ path: 's10-hue-press.png' });
  await page.click('[data-act="hue-pair"]'); await page.waitForTimeout(300);
  console.log('waiting label:', await page.textContent('[data-act="hue-pair"]'));
  await page.waitForSelector('[data-act="hue-forget"]', { timeout: 10000 }); await page.waitForTimeout(600);
  await page.screenshot({ path: 's10-hue-connected.png' });
  console.log('connected tip:', (await page.textContent('#sheet-root .tip .t')).trim());
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(600);
  console.log('settings row now:', await page.textContent('[data-act="hue-open"] .t'), '|', await page.textContent('[data-act="hue-open"] .d'));
  await page.click('#nav button[data-view=home]'); await page.waitForSelector('.room[data-room="hue_room1"]', { timeout: 5000 }); await page.waitForTimeout(400);
  console.log('Office room:', await page.textContent('.room[data-room="hue_room1"] .n'), '|', await page.textContent('.room[data-room="hue_room1"] .s'));
  if (!(await page.$('.light'))) { await page.click('.room[data-room="hue_room1"] [data-act="room-open"]'); await page.waitForTimeout(400); }
  console.log('lights in it:', await page.$$eval('.light .n', els => els.map(e => e.textContent)));
  await page.click('[data-act="light-open"][data-id="hue_l1"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(400);
  const lvl = await page.textContent('#ld .display');
  await page.click('[data-act="ld-more"]'); await page.waitForTimeout(400);
  console.log('hue light More has no remove row:', !(await page.$('.ld-remove')), '| level shown:', lvl);
  await page.screenshot({ path: 's10-hue-light.png' });
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(500);
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(500);
  await page.click('[data-act="scenes-open"]'); await page.waitForTimeout(500);
  console.log('Hue scene kept out:', !(await page.textContent('#view')).includes('Focus'));
  // a remote can target the Hue room: the target chips include Office
  await page.click('#nav button[data-view=remotes]'); await page.waitForSelector('.remote-card'); await page.click('.remote-card');
  await page.waitForSelector('.stage .pk[data-n="0"]'); await page.click('.stage .pk[data-n="0"]'); await page.waitForSelector('#sheet-root.in');
  await page.click('[data-act="gesture-open"][data-g="single"]'); await page.waitForTimeout(500);
  if (!(await page.$('[data-act="pick-target"]'))) { await page.click('[data-act="pick-open"]'); await page.waitForTimeout(300); }
  console.log('Office pickable on a remote:', (await page.$$eval('[data-act="pick-target"]', els => els.map(e => e.textContent))).some(t => /Office/.test(t)));
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(400);
  // forget
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400); await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); await page.click('[data-act="hue-open"]'); await page.waitForSelector('[data-act="hue-forget"]'); await page.click('[data-act="hue-forget"]'); await page.waitForTimeout(1000);
  console.log('after forget, Office gone:', await page.evaluate(() => !S.inv.areas['hue_room1'] && !S.inv.devices['hue_l1']), '| row:', await page.textContent('[data-act="hue-open"] .t'));
  // a bridge whose button was not pressed
  await page.click('[data-act="hue-open"]'); await page.waitForSelector('[data-act="hue-manual-show"]'); await page.click('[data-act="hue-manual-show"]'); await page.waitForSelector('#hue-host'); await page.fill('#hue-host', '10.0.0.9'); await page.click('[data-act="hue-manual"]'); await page.waitForTimeout(300);
  await page.click('[data-act="hue-pair"]'); await page.waitForSelector('.tip .cap:has-text("Not yet")', { timeout: 8000 });
  console.log('not pressed shows:', (await page.textContent('#sheet-root .tip:has(.cap:has-text("Not yet")) .t')).trim());
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
