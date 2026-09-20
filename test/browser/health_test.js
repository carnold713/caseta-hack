// Settings says what the connector actually holds, and removing a device can be undone.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.fill('#pw', 'secret'); await page.click('button.primary');
  await page.waitForSelector('#nav', { timeout: 10000 }); await page.waitForTimeout(1800);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400);
  await page.click('[data-act="settings-page"][data-p="home"]'); await page.waitForTimeout(500);
  console.log('connection tip:', (await page.$eval('.tip', el => el.innerText)).replace(/\n/g, ' · '));
  await page.screenshot({ path: 's18-health.png' });
  // a connector with nothing set up says so
  await page.evaluate(() => { S.agent.info = { ...(S.agent.info || {}), health: { bridge_ok: true, buttons: 10, bindings: 0, last_press_at: null, presses: 0 } }; render(); });
  await page.waitForTimeout(400);
  console.log('with no button settings:', (await page.$eval('.tip', el => el.innerText)).replace(/\n/g, ' · '));
  // undo a removal
  await page.evaluate(() => { S.view = 'remotes'; S.remote = null; render(); });
  await page.waitForTimeout(400);
  const target = await page.evaluate(() => (remotes()[0] || {}).device_id);
  const before = await page.evaluate(id => ({ remotes: remotes().length, bindings: S.config.bindings.filter(b => b.device_id === id).length }), target);
  // whichever remote this rig still has, rather than one an earlier run may have taken
  await page.evaluate(() => { const r = remotes()[0]; if (r) removeDevice(r.device_id); });
  await page.waitForTimeout(2000);
  const after = await page.evaluate(id => ({ remotes: remotes().length, bindings: S.config.bindings.filter(b => b.device_id === id).length }), target);
  console.log('removed:', JSON.stringify(before), '->', JSON.stringify(after), '| undo offered:', await page.evaluate(() => !!document.querySelector('#toast button')));
  await page.click('#toast button'); await page.waitForTimeout(1500);
  const undone = await page.evaluate(id => ({ remotes: remotes().length, bindings: S.config.bindings.filter(b => b.device_id === id).length }), target);
  console.log('after undo:', JSON.stringify(undone), '| settings back:', undone.bindings === before.bindings);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
