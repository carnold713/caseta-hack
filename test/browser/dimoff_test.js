// With everything off, sliding the house dimmer turns the house on at that level.
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
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/classic/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.housecard', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500);
  await page.evaluate(() => { window.__cmds = []; const orig = window.command; window.command = a => { window.__cmds.push(a); return orig(a); }; });
  // everything off
  await page.evaluate(() => command({ type: 'level', target: 'h:all', level: 'off' }));
  await page.waitForTimeout(800);
  const lit = await page.evaluate(() => litLights().length);
  const shown = await page.$eval('.housecard .hc-level', el => getComputedStyle(el).display !== 'none');
  console.log('lit lights:', lit, '| house card dimmer shown:', shown, '| number:', await page.textContent('.housecard .hc-num'));
  const sl = await page.$('.housecard input.slider[data-house]'); const b = await sl.boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', b.x + 10, b.y + b.height / 2);
  for (let i = 1; i <= 8; i++) await touch('touchMove', b.x + 10 + i * 20, b.y + b.height / 2 + (i % 2));
  await touch('touchEnd'); await page.waitForTimeout(600);
  const last = await page.evaluate(() => window.__cmds.filter(c => c.type === 'level').slice(-1)[0]);
  console.log('slide with all off sent:', JSON.stringify(last));
  console.log('targets every light/switch:', await page.evaluate(() => { const c = window.__cmds.filter(x => x.type === 'level').slice(-1)[0]; const all = controllable().filter(d => d.domain === 'light' || d.domain === 'switch').map(d => 'd:' + d.device_id); return Array.isArray(c.target) && all.every(t => c.target.includes(t)); }));
  await page.waitForTimeout(600);
  console.log('lit after:', await page.evaluate(() => litLights().length), '| number now:', await page.textContent('.housecard .hc-num'));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
