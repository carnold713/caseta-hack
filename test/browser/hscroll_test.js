// Desktop: a chip row scrolls sideways with a mouse drag and with the wheel; a plain click still picks a chip.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } });   // a desktop window, mouse only
  try { const __t = require('fs').readFileSync(__dirname + '/polish_token.txt', 'utf8').trim(); if (__t) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, __t); } catch (_) { /* no saved token */ }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav button[data-view=remotes]', { timeout: 10000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  await page.click('#nav button[data-view=remotes]'); await page.waitForSelector('.remote-card'); await page.click('.remote-card');
  await page.waitForSelector('.stage .pk[data-n="0"]'); await page.click('.stage .pk[data-n="0"]'); await page.waitForSelector('#sheet-root.in');
  await page.click('[data-act="gesture-open"][data-g="single"]'); await page.waitForTimeout(500);
  // the chip row sits under the "Which lights?" value row
  if (!(await page.$('#sheet-root .chips.scroll'))) { await page.click('[data-act="pick-open"]'); await page.waitForTimeout(400); }
  const row = await page.$('#sheet-root .chips.scroll');
  const info = async () => row.evaluate(el => ({ left: Math.round(el.scrollLeft), max: el.scrollWidth - el.clientWidth }));
  console.log('row can scroll:', (await info()).max > 0, await info());
  // wheel over the row
  const b = await row.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, 200); await page.waitForTimeout(200);
  console.log('after wheel:', await info());
  await page.mouse.wheel(0, -1000); await page.waitForTimeout(200);
  // drag the row to the left
  const sel0 = await page.$$eval('#sheet-root .chips.scroll .chip.sel', els => els.length);
  await page.mouse.move(b.x + b.width - 40, b.y + b.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(b.x + b.width - 40 - i * 25, b.y + b.height / 2); await page.waitForTimeout(15); }
  await page.mouse.up(); await page.waitForTimeout(200);
  const sel1 = await page.$$eval('#sheet-root .chips.scroll .chip.sel', els => els.length);
  console.log('after drag:', await info(), '| drag did not pick a chip:', sel0 === sel1);
  // a plain click still picks
  const chip = await page.$('#sheet-root .chips.scroll .chip:not(.sel)'); const name = await chip.textContent();
  await chip.click(); await page.waitForTimeout(600);
  console.log('click picked', JSON.stringify(name.trim()), ':', await page.$$eval('#sheet-root .chips.scroll .chip.sel', els => els.map(e => e.textContent.trim())));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
