// A fast brightness swipe sends few commands, the last value lands, and the bridge echo never drags the slider back.
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
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500);
  // ia-v5 stage 2: the house dimmer on Home's house card is the horizontal slider this exercises now
  await page.evaluate(() => { window.__cmds = []; const orig = window.command; window.command = a => { window.__cmds.push({ ...a, at: Date.now() }); return orig(a); }; });
  const sl = await page.$('.housecard input.slider[data-house]'); await sl.evaluate(el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const b = await sl.boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const val = () => page.evaluate(() => Number(document.querySelector('.housecard input.slider[data-house]').value));
  // 1. a frantic swipe: right, left, right across the whole track, 60 moves in well under a second
  const y = b.y + b.height / 2;
  await touch('touchStart', b.x + 20, y);
  for (let i = 1; i <= 60; i++) { const f = 0.5 + 0.45 * Math.sin(i / 4); await touch('touchMove', b.x + b.width * f, y + (i % 2)); }
  const endX = b.x + b.width * 0.5 + b.width * 0.45 * Math.sin(60 / 4);
  await touch('touchMove', endX, y); await touch('touchEnd');
  const shown = await val();
  await page.waitForTimeout(1200);
  const cmds = await page.evaluate(() => window.__cmds.filter(c => c.type === 'level'));
  const last = cmds[cmds.length - 1];
  console.log('house dimmer swipe: commands sent', cmds.length, '(60 moves) | last level', last && last.level, '| slider showed', shown, '| match:', !!last && last.level === shown);
  await page.waitForTimeout(2500);
  console.log('after echoes: slider', await val(), '| house level', await page.evaluate(() => houseLevel()), '| stayed put:', (await val()) === shown);
  // 2. the light sheet's well, now horizontal (design-spec-v5 4.9): same frantic motion
  await page.click('.room[data-room="20"] [data-act="room-open"]'); await page.waitForTimeout(600);
  await page.click('[data-act="light-open"][data-id="5"]');
  await page.waitForSelector('#ld'); await page.waitForTimeout(600);
  await page.evaluate(() => { window.__cmds = []; });
  const well = await page.$('#ld .ld-well .slider'); const wb = well && await well.boundingBox();
  if (wb) {
    await touch('touchStart', wb.x + wb.width * 0.5, wb.y + wb.height / 2);
    for (let i = 1; i <= 60; i++) { const f = 0.5 + 0.45 * Math.sin(i / 4); await touch('touchMove', wb.x + wb.width * f, wb.y + wb.height / 2); }
    await touch('touchEnd');
    const lvShown = await page.evaluate(() => LD.lv);
    await page.waitForTimeout(1200);
    const c2 = await page.evaluate(() => window.__cmds.filter(c => c.type === 'level'));
    console.log('well swipe: commands sent', c2.length, '| last level', c2.length && c2[c2.length - 1].level, '| shown', lvShown, '| match:', c2.length > 0 && c2[c2.length - 1].level === lvShown);
    await page.waitForTimeout(2500);
    console.log('after echoes: LD.lv', await page.evaluate(() => LD.lv), '| stayed put:', (await page.evaluate(() => LD.lv)) === lvShown);
  } else console.log('well not found');
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
