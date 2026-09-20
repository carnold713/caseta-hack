// A remote the bridge lists without its buttons: the page says so, stays editable, and learns its
// numbering from real presses.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.fill('#pw', 'secret'); await page.click('button.primary');
  await page.waitForSelector('#nav', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  // a pico the bridge lists with no buttons at all
  await page.evaluate(() => {
    S.inv.devices['77'] = { device_id: '77', name: 'Study remote', type: 'Pico3ButtonRaiseLower', domain: 'pico', area: '22', zone: null, serial: '999' };
    S.view = 'remotes'; render();
    openRemoteSheet('77'); // the remote's own screen is a sheet now, opened the way a tap would
  });
  await page.waitForTimeout(600);
  console.log('buttons the bridge lists:', await page.evaluate(() => buttonsOf('77').length));
  console.log('page says it is waiting:', await page.evaluate(() => /has not listed this remote/.test(document.body.innerText)));
  console.log('rows anyway:', await page.$$eval('.card [data-act="button-open"]', els => els.map(e => e.dataset.n)));
  await page.screenshot({ path: 's18-quiet-remote.png' });
  // something set up while the bridge was quiet
  await page.evaluate(() => { S.config.bindings.push({ id: 'x1', device_id: '77', button_number: 0, gesture: 'single', actions: [{ type: 'level', target: 'a:22', level: 'on' }], night: null }); });
  // presses arrive numbered from 1: the app learns and the picture lines up
  for (const n of [1, 2, 3, 4, 5]) await page.evaluate(n => onLive({ type: 'button', device_id: '77', button_number: n, event: 'Press' }), n);
  await page.waitForTimeout(900);
  console.log('learned numbers:', await page.evaluate(() => S.config.settings.remote_looks['77'].seen));
  await page.evaluate(() => renderRemoteSheet()); await page.waitForTimeout(400);
  console.log('rows now:', await page.$$eval('.card [data-act="button-open"]', els => els.map(e => e.dataset.n)));
  console.log('keys on the picture:', await page.$$eval('.remote-hero .pico-svg .pk', els => ({ real: els.filter(e => e.classList.contains('real')).length, ghost: els.filter(e => e.classList.contains('ghost')).length })));
  // a press now lights the key up
  await page.evaluate(() => onLive({ type: 'button', device_id: '77', button_number: 1, event: 'Press' }));
  await page.waitForTimeout(200);
  console.log('pressed key lights up:', await page.$$eval('.remote-hero .pico-svg .pk.live', els => els.length));
  console.log('the setting moved with its key:', await page.evaluate(() => { const b = S.config.bindings.find(x => x.id === 'x1'); return b && b.button_number; }), '(was 0, the top key is now 1)');
  console.log('saved on the hub:', await page.evaluate(async () => (await api('/api/snapshot')).config.settings.remote_looks['77']));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
