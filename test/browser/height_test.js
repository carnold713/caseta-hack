// Sheets keep one height while their content changes: a medium sheet across its sub-sheets (ia-v5 detents), the
// add-device flow across steps. The Now card this used to walk is gone; the detent rule replaced it.
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
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); render(); }); await page.waitForTimeout(600);
  const h = () => page.$eval('#sheet-root .sheet', el => Math.round(el.getBoundingClientRect().height));
  // the house menu and its sleep timer: one compact sheet, one medium one, each at its own detent and steady inside it
  await page.click('[data-act="house-more"]'); await page.waitForTimeout(600);
  const a = await h();
  await page.click('[data-act="house-timer"]'); await page.waitForTimeout(500); const b = await h();
  await page.click('[data-act="sheet-back"]'); await page.waitForTimeout(500); const c = await h();
  const menuCompact = await page.evaluate(() => 0);
  void menuCompact;
  console.log('house menu heights: menu', a, 'timer', b, 'back to the menu', c, '| the menu stays compact:', a <= Math.round(820 * 0.4) && c <= Math.round(820 * 0.4), '| the timer is medium:', b === Math.round(820 * 0.56));
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(600);
  // a medium sheet keeps its height while a step swaps inside it: the light page to its More and back
  await page.evaluate(() => { const d = controllable().find(x => x.domain === 'light'); goRoom(d.area || 'none'); }); await page.waitForTimeout(600);
  await page.click('.light [data-act="light-open"]'); await page.waitForTimeout(700); const m0 = await h();
  await page.click('[data-act="ld-more"]'); await page.waitForTimeout(600); const m1 = await h();
  await page.click('[data-act="sheet-back"]'); await page.waitForTimeout(600); const m2 = await h();
  console.log('light page heights: page', m0, 'More', m1, 'back', m2, '| the page is medium both times:', m0 === m2 && m0 === Math.round(820 * 0.56), '| More is compact:', m1 < m0);
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(600);
  // add-device flow: listen step, then name step
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400); await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); await page.waitForSelector('[data-act="ad-open"]'); await page.click('[data-act="ad-open"]');
  await page.waitForSelector('#sheet-root.in'); await page.waitForTimeout(600); const d0 = await h();
  await page.click('[data-act="ad-kind"][data-k="pico"]'); await page.waitForTimeout(600); const d = await h();
  await page.waitForSelector('[data-act="ad-pick"]', { timeout: 8000 }); await page.click('[data-act="ad-pick"]'); await page.waitForTimeout(600); const e = await h();
  console.log('Add a device heights: kind', d0, 'listen', d, 'name', e, '| same:', d0 === d && d === e);
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(700);
  // a fresh sheet sizes to its own content again (no stale lock)
  await page.click('#nav button[data-view=home]'); await page.waitForSelector('.room'); await page.waitForTimeout(300);
  await page.evaluate(() => sheet.open('Small', '<p>one line</p>')); await page.waitForTimeout(500);
  console.log('fresh small sheet height:', await h(), '(should be far below', d, ')');
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
