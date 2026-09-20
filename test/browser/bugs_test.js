// The two things the owner hit: a removed remote that the bridge keeps listing, and a newly added
// remote whose buttons come back numbered from 1 and so could not be edited.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // reuse a saved token where there is one: the hub allows 20 logins per 15 minutes
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.housecard, .tip', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  const names = () => page.evaluate(() => remotes().map(r => r.name));
  // 1. remove a remote from a bridge that keeps listing it
  await page.click('#nav button[data-view=remotes]'); await page.waitForSelector('[data-act="remote-open"]'); await page.waitForTimeout(400);
  console.log('remotes before:', await names());
  // whichever remote this home still has, so the run repeats against one connector
  // the remote is a sheet now: open it the way a tap would, not by poking S.remote and calling render()
  const victim = await page.evaluate(() => { const d = remotes()[0]; if (!d) return null; openRemoteSheet(d.device_id); return { id: d.device_id, name: d.name }; });
  await page.waitForTimeout(700);
  await page.click('[data-act="remote-more"]'); await page.waitForTimeout(500);
  await page.click('[data-act="dev-remove"]'); await page.waitForTimeout(500);
  await page.click('[data-act="dev-remove-go"]'); await page.waitForTimeout(2500);
  console.log(`after removing ${victim ? victim.name : 'nothing'}:`, await names());
  console.log('hidden list:', await page.evaluate(() => S.config.settings.hidden_devices));
  console.log('still on the bridge:', await page.evaluate(id => !!(S.inv.devices[id]), victim && victim.id));
  await page.waitForTimeout(1200);
  console.log('saved on the hub:', await page.evaluate(async () => (await api('/api/snapshot')).config.settings.hidden_devices));
  // 2. add a remote whose buttons are numbered from 1
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400); await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); await page.waitForSelector('[data-act="ad-open"]'); await page.click('[data-act="ad-open"]');
  await page.waitForSelector('#sheet-root.in'); await page.waitForTimeout(500);
  await page.click('[data-act="ad-kind"][data-k="pico"]'); await page.waitForSelector('[data-act="ad-pick"]', { timeout: 10000 });
  await page.click('[data-act="ad-pick"]'); await page.waitForTimeout(500);
  await page.fill('#ad-name', 'Study remote');
  await page.click('[data-ad-rooms] .chip'); await page.waitForTimeout(200);
  await page.click('[data-act="ad-create"]'); await page.waitForTimeout(2500);
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(600);
  await page.click('#nav button[data-view=remotes]'); await page.waitForTimeout(600);
  console.log('remotes after adding:', await names());
  await page.evaluate(() => { const d = remotes().find(r => r.name === 'Study remote'); openRemoteSheet(d.device_id); });
  await page.waitForTimeout(800);
  const rows = await page.$$eval('.card [data-act="button-open"]', els => els.map(e => e.dataset.n));
  const keys = await page.$$eval('.remote-hero .pico-svg .pk', els => ({ real: els.filter(e => e.classList.contains('real')).length, ghost: els.filter(e => e.classList.contains('ghost')).length }));
  console.log('button rows on the new remote:', rows, '| keys on the picture:', JSON.stringify(keys));
  await page.screenshot({ path: 's18-new-remote.png' });
  if (rows.length) {
    await page.click(`.card [data-act="button-open"][data-n="${rows[0]}"]`); await page.waitForTimeout(600);
    console.log('button sheet opens:', await page.evaluate(() => sheet.isOpen()), '| title:', await page.textContent('#sheet-root .sh h2'));
    await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(400);
  }
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
