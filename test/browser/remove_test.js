// Remove a device: from the remote page and from a light's sheet; config references are cleared.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // reuse a saved token where there is one: the hub allows 20 logins per 15 minutes
  try { const __t = require('fs').readFileSync(__dirname + '/polish_token.txt', 'utf8').trim(); if (__t) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, __t); } catch (_) { /* no saved token */ }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR|502/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav button[data-view=remotes]', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  // add a remote first so there is something disposable (the fake bridge hears a Pico)
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400); await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); await page.waitForSelector('[data-act="ad-open"]'); await page.click('[data-act="ad-open"]');
  await page.waitForSelector('[data-act="ad-kind"][data-k="pico"]'); await page.click('[data-act="ad-kind"][data-k="pico"]');
  await page.waitForSelector('[data-act="ad-pick"]', { timeout: 8000 }); await page.click('[data-act="ad-pick"]'); await page.waitForTimeout(400);
  await page.fill('#ad-name', 'Spare remote'); await page.click('[data-act="ad-area"][data-id="23"]'); await page.click('[data-act="ad-create"]');
  await page.waitForSelector('[data-act="ad-again"]', { timeout: 8000 }); await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(500);
  await page.click('#nav button[data-view=remotes]'); await page.waitForTimeout(400);
  const before = await page.$$eval('.remote-card .n', els => els.map(e => e.textContent));
  // removing lives under the remote page's More sheet
  await page.click('.remote-card:has-text("Spare remote")'); await page.waitForSelector('[data-act="remote-more"]'); await page.waitForTimeout(400);
  await page.click('[data-act="remote-more"]'); await page.waitForSelector('[data-act="dev-remove"]'); await page.waitForTimeout(400);
  await page.click('[data-act="dev-remove"]'); await page.waitForSelector('[data-act="dev-remove-go"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: 's9-remove-confirm.png' });
  await page.click('[data-act="dev-remove-go"]'); await page.waitForTimeout(1200);
  const after = await page.$$eval('.remote-card .n', els => els.map(e => e.textContent));
  console.log('remotes before:', before, '| after:', after, '| back on list:', !!(await page.$('.remote-card')));
  // a light: remove from its sheet, and a favourite that pointed at it is gone
  await page.click('#nav button[data-view=home]'); await page.waitForSelector('.room', { timeout: 5000 }); await page.waitForTimeout(400);
  // pick whatever removable light the home still has, so this can run more than once against one connector
  // only when the home can spare one: this really does take the light off the bridge, so a small home is left alone
  const pick = await page.evaluate(async () => {
    const removable = controllable().filter(x => x.domain === 'light' && !String(x.device_id).startsWith('hue_'));
    if (removable.length < 3) return null;
    const d = removable[0];
    if (!S.config.favorites.includes('d:' + d.device_id)) S.config.favorites.push('d:' + d.device_id);
    await save({ quiet: true, render: true });
    return { id: d.device_id, name: d.name, area: d.area || 'none' };
  });
  await page.waitForTimeout(500);
  if (!pick) { console.log('fewer than three removable lights left in this home: skipping the light removal'); }
  else {
    // ia-v5 stage 2: a room is a page, and the light's page is reached from it
    await page.click(`.room[data-room="${pick.area}"] [data-act="room-open"]`); await page.waitForTimeout(600);
    await page.click(`[data-act="light-open"][data-id="${pick.id}"]`); await page.waitForSelector('[data-act="ld-more"]'); await page.waitForTimeout(400);
    await page.click('[data-act="ld-more"]'); await page.waitForSelector('.ld-remove'); await page.waitForTimeout(300);
    await page.click('.ld-remove'); await page.waitForSelector('[data-act="dev-remove-go"]'); await page.click('[data-act="dev-remove-go"]'); await page.waitForTimeout(1400);
    console.log(`${pick.name} still in inventory:`, await page.evaluate(id => !!S.inv.devices[id], pick.id), '| favourite cleared:', await page.evaluate(id => !S.config.favorites.includes('d:' + id), pick.id), '| back on a page that exists:', await page.evaluate(() => S.view));
  }
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(500);
  // the bridge refusing: a device that no longer exists
  await page.evaluate(() => { S.inv.devices['99'] = { device_id: '99', name: 'Ghost', type: 'WallDimmer', domain: 'light', area: '20', zone: '9' }; });
  await page.evaluate(() => openRemoveDevice('99')); await page.waitForSelector('[data-act="dev-remove-go"]'); await page.click('[data-act="dev-remove-go"]'); await page.waitForTimeout(1000);
  console.log('refused: sheet still open:', await page.evaluate(() => sheet.isOpen()), '| toast:', await page.textContent('#toast span'));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
