// The house card at the top of Home, which replaced the Now view (docs/ia-v5.md stage 1): the headline, the number,
// the dimmer, All off, and the "..." menu that carries Night, the house-wide sleep timer and the shades. Then the
// running timer: its block on Home, its ring, and cancelling it. Scenes are one tap from Home's own scene row.
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
  await page.evaluate(() => command({ type: 'level', target: 'h:all', level: 'on' })); await page.waitForTimeout(1200);

  // the card itself: nothing floats on Home, the four things the Now view led with are all here
  const card = await page.evaluate(() => {
    const c = document.querySelector('.housecard');
    return { head: c.querySelector('.hc-head').textContent.trim(), sub: c.querySelector('.hc-sub').textContent.trim(),
      num: c.querySelector('.hc-num').textContent.trim(), dimmer: !!c.querySelector('input.slider[data-house]'),
      alloff: c.querySelector('.hc-off').getAttribute('aria-label'), more: !!c.querySelector('[data-act="house-more"]'),
      pill: document.getElementById('nowbar').classList.contains('show') };
  });
  console.log('house card:', JSON.stringify(card), '| no pill on Home:', card.pill === false);
  await page.screenshot({ path: 's7-house-card.png' });

  // scenes are one tap from Home, not a panel inside a view
  const scenes = await page.$$eval('.scenerow [data-act="run-scene"]', els => els.length);
  console.log('scene chips on Home:', scenes, '| one tap runs one:', scenes > 0);
  if (scenes) { await page.click('.scenerow [data-act="run-scene"]'); await page.waitForTimeout(700); }

  // the "..." menu: Night, the house-wide sleep timer, the shades
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.click('[data-act="house-more"]'); await page.waitForTimeout(700);
  console.log('menu rows:', await page.$$eval('#sheet-root .item[data-act]', els => els.map(e => e.textContent.trim().split('\n')[0]).join(' | ')));
  await page.screenshot({ path: 's7-house-menu.png' });

  // the dial, from the menu, over everything that is on
  await page.click('[data-act="house-timer"]'); await page.waitForTimeout(600);
  console.log('dial present:', !!(await page.$('#sheet-root #td .td-ring')), '| back arrow:', !!(await page.$('#sheet-root .sh.hasback [data-act="sheet-back"]')));
  await page.screenshot({ path: 's7-house-dial.png' });
  await page.click('#sheet-root .chip[data-m="10"]'); await page.waitForTimeout(300);
  console.log('chip picked: dial reads', await page.textContent('#sheet-root .td-min'), '| still on the dial:', !!(await page.$('#sheet-root #td')));
  const tgt = await page.$eval('#sheet-root .td .btn.primary', el => el.dataset.t);
  await page.click('#sheet-root .td .btn.primary'); await page.waitForTimeout(1400);
  // the connector echoes the running timer; when this rig's fake connector does not, stand one in so the block,
  // the ring and the pill's badge are still exercised
  const echoed = await page.evaluate(() => Object.keys(S.timers || {}).length > 0);
  if (!echoed) await page.evaluate(t => { S.timers[t] = { ends_at: Date.now() / 1000 + 600, level: 0 }; render(); }, tgt);
  await page.waitForTimeout(500);
  console.log('after Start: sheet closed:', !(await page.evaluate(() => sheet.isOpen())), '| the connector echoed the timer:', echoed, '| a timer block on Home:', !!(await page.$('.timerbar')), '| its ring:', !!(await page.$('.timerbar .ring40 .prog')), '| reads:', (await page.textContent('.timerbar .t').catch(() => 'none')).trim());
  await page.screenshot({ path: 's7-house-timing.png' });

  // the pill carries the clock badge where Home is not
  await page.click('#nav button[data-view=remotes]'); await page.waitForTimeout(700);
  console.log('the pill shows off Home:', await page.evaluate(() => document.getElementById('nowbar').classList.contains('show')), '| with the timer badge:', !!(await page.$('#nowbar .pill-thumb .badge')));
  await page.screenshot({ path: 's7-pill-timing.png' });
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(600);

  // cancel it from its block on Home
  await page.click('.timerbar [data-act="cancel-timer"]'); await page.waitForTimeout(1200);
  if (!echoed) await page.evaluate(() => { S.timers = {}; render(); });
  await page.waitForTimeout(400);
  console.log('after cancel, the block is gone:', !(await page.$('.timerbar')));

  // Night in every lit room, from the menu
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.click('[data-act="house-more"]'); await page.waitForTimeout(700);
  await page.click('[data-act="now-night"]'); await page.waitForTimeout(1000);
  console.log('Night ran and the menu closed:', !(await page.evaluate(() => sheet.isOpen())));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
