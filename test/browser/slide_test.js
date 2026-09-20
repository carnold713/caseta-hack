// Gesture gate: a vertical swipe over a slider scrolls and never changes it; a sideways drag or a tap does.
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
  await page.goto(`http://127.0.0.1:${PORT}/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500);
  // ia-v5 stage 2: the room's inline sliders are gone. The horizontal slider in a scrolling page is now the
  // house dimmer on Home's house card, and it is what the gesture layer has to get right.
  await page.evaluate(() => { window.__inputs = 0; window.__cmds = []; document.addEventListener('input', e => { if (e.target.classList.contains('slider')) window.__inputs++; }); const orig = window.command; window.command = a => { window.__cmds.push(a); return orig(a); }; });
  const sl = await page.$('.housecard input.slider[data-house]');
  await sl.evaluate(el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const box = await sl.boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const val = async () => page.evaluate(() => document.querySelector('.housecard input.slider[data-house]').value);
  const scrollY = async () => page.evaluate(() => window.scrollY);
  const before = await val(); const y0 = await scrollY();
  // 1. a vertical swipe starting on the slider: scroll, no change
  const x = box.x + box.width * 0.2, y = box.y + box.height / 2;
  await touch('touchStart', x, y);
  for (let i = 1; i <= 8; i++) await touch('touchMove', x, y - i * 12);
  await touch('touchEnd');
  await page.waitForTimeout(400);
  const afterSwipe = await val(); const y1 = await scrollY();
  console.log('vertical swipe: value', before, '->', afterSwipe, '| scrolled', y0, '->', y1, '| inputs', await page.evaluate(() => window.__inputs));
  // 2. a sideways drag: the value follows
  await sl.evaluate(el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const b2 = await sl.boundingBox();
  const x2 = b2.x + b2.width * 0.2, y2 = b2.y + b2.height / 2;
  await touch('touchStart', x2, y2);
  for (let i = 1; i <= 10; i++) await touch('touchMove', x2 + i * 14, y2 + (i % 2));
  await touch('touchEnd');
  await page.waitForTimeout(400);
  console.log('sideways drag: value', afterSwipe, '->', await val(), '| inputs', await page.evaluate(() => window.__inputs), '| commands', await page.evaluate(() => JSON.stringify(window.__cmds.slice(-1))));
  // 3. a tap sets the value where the finger is
  const b3 = await sl.boundingBox();
  await touch('touchStart', b3.x + b3.width * 0.5, b3.y + b3.height / 2); await touch('touchEnd');
  await page.waitForTimeout(400);
  console.log('tap: value', await val(), '| inputs', await page.evaluate(() => window.__inputs));
  // 4. the light page's vertical well: a drag surface the gate leaves entirely alone
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  const hs = await page.$('#nowbar input.slider[data-house]');
  if (hs) {
    const hb = await hs.boundingBox(); const hv = await hs.evaluate(el => el.value);
    await touch('touchStart', hb.x + hb.width * 0.5, hb.y + hb.height / 2);
    for (let i = 1; i <= 6; i++) await touch('touchMove', hb.x + hb.width * 0.5, hb.y + hb.height / 2 - i * 10);
    await touch('touchEnd'); await page.waitForTimeout(300);
    console.log('bar vertical swipe: value', hv, '->', await hs.evaluate(el => el.value));
    await touch('touchStart', hb.x + hb.width * 0.5, hb.y + hb.height / 2);
    for (let i = 1; i <= 6; i++) await touch('touchMove', hb.x + hb.width * 0.5 - i * 12, hb.y + hb.height / 2);
    await touch('touchEnd'); await page.waitForTimeout(300);
    console.log('bar sideways drag: value ->', await hs.evaluate(el => el.value), '| last command', await page.evaluate(() => JSON.stringify(window.__cmds.slice(-1))));
  }
  await page.evaluate(() => { const d = controllable().find(x => x.domain === 'light'); goRoom(d.area || 'none'); }); await page.waitForTimeout(600);
  await page.click('.light [data-act="light-open"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(600);
  {
    // the well is horizontal now (design-spec-v5 4.9), so it is slide.js's gate that owns it: a vertical drag
    // scrolls the sheet and leaves the level alone, a sideways one sets it
    const well = await page.$('#ld .ld-well .slider'); const wb = well && await well.boundingBox();
    if (wb) {
      const v0 = await page.evaluate(() => LD.lv);
      await touch('touchStart', wb.x + wb.width * 0.2, wb.y + wb.height / 2);
      for (let i = 1; i <= 6; i++) await touch('touchMove', wb.x + wb.width * (0.2 + i * 0.1), wb.y + wb.height / 2);
      await touch('touchEnd'); await page.waitForTimeout(400);
      console.log('light page well, sideways drag: level', v0, '->', await page.evaluate(() => LD.lv), '| the page never scrolled:', await page.evaluate(() => document.querySelector('#sheet-root .sb').scrollTop) === 0);
    }
  }
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500);
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(600);
  // 5. mouse users: a click on the track sets it; keyboard still works
  const sl5 = await page.$('.housecard input.slider[data-house]');
  await sl5.evaluate(el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const b5 = await sl5.boundingBox();
  await page.mouse.click(b5.x + b5.width * 0.8, b5.y + b5.height / 2); await page.waitForTimeout(300);
  console.log('mouse click: value', await val());
  await page.evaluate(() => document.querySelector('.housecard input.slider[data-house]').focus());
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
  console.log('keyboard: value', await val());
  // 6. the viewport is locked
  console.log('viewport:', await page.evaluate(() => document.querySelector('meta[name=viewport]').content));
  await page.screenshot({ path: 'slide-after.png' });
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
