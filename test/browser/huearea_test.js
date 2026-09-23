// A Lutron device cannot live in a Philips Hue room: those rooms are not offered, and the connector says why.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/classic/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  // a Hue room, as the owner's Office is
  await page.evaluate(() => { S.inv.areas['hue_d55293e9'] = { id: 'hue_d55293e9', name: 'Office', parent_id: null }; });
  console.log('rooms the app knows:', await page.evaluate(() => Object.values(S.inv.areas).map(a => a.name)));
  console.log('rooms offered for a new Lutron device:', await page.evaluate(() => adRooms().map(a => a.name)));
  console.log('the Hue room is kept out:', await page.evaluate(() => !adRooms().some(a => String(a.id).startsWith('hue_'))));
  await page.evaluate(() => { AD.pick = '69709128'; S.add = { heard: [{ serial: '69709128', device_type: 'Pico3ButtonRaiseLower', model: 'PJ2-3BRL' }] }; });
  console.log('the page explains it:', await page.evaluate(() => /Philips Hue bridge are not listed/.test(adNameHTML())));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
