// A sheet opens over the page where the page is. The owner found Settings jumping to the top every time a row
// opened its sheet: a sheet has its own address (#settings/connection), and the app took any new address for a new
// page, scrolled it to the top and slid it in. Scroll down, open a sheet, close it: the page should not have moved.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  const root = `http://127.0.0.1:${PORT}/`;
  await page.goto(root + '#settings');
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(1200);

  // Settings, scrolled well down, then a row that opens a sheet
  const y0 = await page.evaluate(() => { window.scrollTo(0, Math.min(600, document.documentElement.scrollHeight - innerHeight)); return scrollY; });
  check(y0 > 100, 'Settings scrolls far enough to tell', y0);
  const link = await page.evaluate(() => { const b = [...document.querySelectorAll('#screen [data-go^="settings/"]')].find(x => { const r = x.getBoundingClientRect(); return r.top > 60 && r.bottom < innerHeight - 120; }); return b ? b.dataset.go : null; });
  check(!!link, 'a row on screen that opens a sheet', link);
  if (link) {
    await page.evaluate(g => document.querySelector(`#screen [data-go="${g}"]`).click(), link);
    await page.waitForSelector('#sheet-root .sheet', { timeout: 5000 }).catch(() => {});
    await wait(700);
    const open = await page.evaluate(() => ({ y: scrollY, sheet: !!document.querySelector('#sheet-root .sheet'), hash: location.hash }));
    check(open.sheet, 'the sheet is up', open.hash);
    check(Math.abs(open.y - y0) < 2, 'the page under it stayed where it was', { before: y0, after: open.y });
    // and back again: the back button takes the address back to the page, which still does not move
    await page.goBack(); await wait(700);
    const back = await page.evaluate(() => ({ y: scrollY, hash: location.hash, sheet: !!document.querySelector('#sheet-root .sheet') }));
    check(!back.sheet && Math.abs(back.y - y0) < 2, 'closing it by Back leaves the page where it was', { before: y0, after: back.y, hash: back.hash });
  }

  // a real page change still starts at the top
  await page.evaluate(() => { location.hash = '#activity'; }); await wait(900);
  check(await page.evaluate(() => scrollY) === 0, 'a new page still starts at the top');

  check(!errors.length, 'no errors on the page', errors);
  await browser.close();
  if (fails.length) { console.log(`FAILED ${fails.length}`); process.exit(1); }
})().catch(e => { console.log('FAILED', e.message); process.exit(1); });
