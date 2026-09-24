// "Add a device" sheet: listen, hear a Pico, name it, pick a room, create; then the failure path.
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
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR|502/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/classic/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav button[data-view=settings]', { timeout: 10000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400); await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); await page.waitForSelector('[data-act="ad-open"]');
  await page.click('[data-act="ad-open"]'); await page.waitForSelector('#sheet-root.in'); await page.waitForTimeout(500);
  // the walk asks what you are adding first; listening starts on that answer
  console.log('listening before the kind is picked:', await page.evaluate(() => !!(S.add && S.add.active)));
  await page.click('[data-act="ad-kind"][data-k="pico"]'); await page.waitForTimeout(700);
  await page.screenshot({ path: 's6-add-listen.png' });
  console.log('listening:', await page.evaluate(() => !!(S.add && S.add.active)), '| status:', await page.textContent('.ad-status'));
  await page.waitForSelector('[data-act="ad-pick"]', { timeout: 8000 }); await page.waitForTimeout(300);
  await page.screenshot({ path: 's6-add-found.png' });
  console.log('found:', await page.textContent('[data-act="ad-pick"] .t'), '|', await page.textContent('[data-act="ad-pick"] .d'));
  await page.click('[data-act="ad-pick"]'); await page.waitForTimeout(600);
  await page.screenshot({ path: 's6-add-name.png' });
  console.log('create disabled before room:', await page.$eval('[data-act="ad-create"]', b => b.disabled));
  await page.fill('#ad-name', 'Hall remote');
  await page.click('[data-act="ad-area"][data-id="23"]'); await page.waitForTimeout(200);
  console.log('create disabled after room:', await page.$eval('[data-act="ad-create"]', b => b.disabled));
  await page.click('[data-act="ad-create"]');
  await page.waitForSelector('[data-act="ad-again"]', { timeout: 8000 }); await page.waitForTimeout(600);
  await page.screenshot({ path: 's6-add-done.png' });
  console.log('done text:', await page.textContent('.ad-done .t2'), '| inventory has 13:', await page.evaluate(() => !!(S.inv.devices['13'] && S.inv.devices['13'].name === 'Hall remote' && S.inv.devices['13'].area === '23')));
  // the session ended on the hub side
  console.log('session active after create:', await page.evaluate(() => !!(S.add && S.add.active)));
  // failure path: the bridge says no
  await page.click('[data-act="ad-again"]'); await page.waitForSelector('[data-act="ad-pick"]', { timeout: 8000 }); await page.waitForTimeout(300);
  await page.click('[data-act="ad-pick"]'); await page.waitForTimeout(500);
  await page.fill('#ad-name', 'fail'); await page.click('[data-act="ad-area"][data-id="20"]'); await page.click('[data-act="ad-create"]');
  await page.waitForSelector('.tip .cap:has-text("The bridge said no")', { timeout: 8000 }); await page.waitForTimeout(300);
  await page.click('[data-act="ad-log"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 's6-add-fail.png', fullPage: false });
  console.log('log lines shown:', await page.$eval('.ad-log', el => el.textContent.split('\n').length));
  // closing the sheet stops listening
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(800);
  console.log('session active after close:', await page.evaluate(() => !!(S.add && S.add.active)));
  // the new remote shows on the Remotes tab
  await page.click('#nav button[data-view=remotes]'); await page.waitForTimeout(500);
  console.log('remotes listed:', await page.$$eval('.remote-card .n', els => els.map(e => e.textContent)));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
