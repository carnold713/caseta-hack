// Swipe to close: a short pull springs back, a flick closes, a pull inside a scrolled body scrolls.
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
  await page.goto(`http://127.0.0.1:${PORT}/classic/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); render(); }); await page.waitForTimeout(600);
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  // the Now view is gone (ia-v5 stage 1): the light page is the sheet this walks now
  const open = async () => {
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    if ((await page.evaluate(() => S.view)) !== 'room') { await page.evaluate(() => { const d = controllable().find(x => x.domain === 'light'); goRoom(d.area || 'none'); }); await page.waitForTimeout(600); }
    await page.click('.light [data-act="light-open"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(700);
  };
  const sheetY = () => page.evaluate(() => { const s = document.querySelector('#sheet-root .sheet'); return Math.round(new DOMMatrix(getComputedStyle(s).transform).m42); });
  const isOpen = () => page.evaluate(() => sheet.isOpen());
  await open();
  const top = await page.$eval('#sheet-root .sheet', el => el.getBoundingClientRect().top);
  // 1. a slow short pull on the header: follows the finger, then springs back
  await touch('touchStart', 200, top + 30);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', 200, top + 30 + i * 12); await page.waitForTimeout(40); }
  const mid = await sheetY();
  await page.screenshot({ path: 's8-swipe-mid.png' });
  await touch('touchEnd'); await page.waitForTimeout(800);
  console.log('short pull: moved', mid, 'px with the finger | settled at', await sheetY(), '| still open:', await isOpen());
  // 2. a flick: closes
  await touch('touchStart', 200, top + 30);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', 200, top + 30 + i * 40); await page.waitForTimeout(12); }
  await touch('touchEnd'); await page.waitForTimeout(700);
  console.log('flick: open after:', await isOpen());
  // 3. a pull inside a scrolled body scrolls instead of dragging (a large sheet: the light page at medium does not scroll)
  await page.evaluate(() => openActivity()); await page.waitForTimeout(700);
  await page.evaluate(() => { document.querySelector('#sheet-root .sb').scrollTop = 200; });
  const sb = await page.$eval('#sheet-root .sb', el => ({ top: el.getBoundingClientRect().top, st: el.scrollTop }));
  await touch('touchStart', 200, sb.top + 200);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', 200, sb.top + 200 + i * 20); await page.waitForTimeout(30); }
  await touch('touchEnd'); await page.waitForTimeout(500);
  console.log('scrolled body pull: sheet y', await sheetY(), '| scrollTop', await page.$eval('#sheet-root .sb', el => el.scrollTop), '(was 200) | open:', await isOpen());
  // 4. a big slow pull past a third: closes even without speed
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(600);
  await open();
  await page.evaluate(() => { document.querySelector('#sheet-root .sb').scrollTop = 0; });
  await touch('touchStart', 200, top + 30);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', 200, top + 30 + i * 25); await page.waitForTimeout(60); }
  await touch('touchEnd'); await page.waitForTimeout(700);
  console.log('long slow pull: open after:', await isOpen());
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
