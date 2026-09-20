// The power button with the house dark, and the row of every light at the top of Home.
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
  await page.waitForSelector('.housecard', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500);
  await page.evaluate(() => { window.__cmds = []; const orig = window.command; window.command = a => { window.__cmds.push(a); return orig(a); }; });
  // ia-v5 stage 2: the row is the starred lights only. Star two so there is a row to look at.
  const ids = await page.evaluate(async () => {
    const ds = controllable().filter(d => d.domain === 'light' || d.domain === 'switch').slice(0, 2);
    S.config.favorites = ds.map(d => 'd:' + d.device_id);
    // seed4 leaves a few automations behind; disable them here so the base power-button assertions below are
    // deterministic regardless of what they target, and a dedicated block further down tests the "some lights
    // are automated" sheet on purpose, with one made fresh for it.
    for (const sc of S.config.schedules || []) sc.enabled = false;
    await save({ quiet: true, render: true });
    return ds.map(d => d.device_id);
  });
  await page.waitForTimeout(600);
  const row = await page.$$eval('#lightnow .ln-lamp', els => els.map(el => ({ id: el.dataset.id, on: el.classList.contains('on'), w: Math.round(el.querySelector('.lamp').getBoundingClientRect().width), name: el.querySelector('.ln-name').textContent })));
  const nLights = await page.evaluate(() => controllable().filter(d => d.domain === 'light' || d.domain === 'switch').length);
  console.log('row lamps:', row.length, 'of', ids.length, 'starred (' + nLights, 'lights in the home) | sizes by state:', row.every(r => r.w === (r.on ? 56 : 44)), '| starred:', row.map(r => r.name).join(', '));
  const L = ids[0];
  await page.screenshot({ path: 's14-row.png' });
  // set some levels so there is something to remember, then tap a lamp in the row to toggle it
  await page.evaluate(id => command({ type: 'level', target: 'd:' + id, level: 30 }), L); await page.waitForTimeout(700);
  const before = await page.evaluate(id => level(id), L);
  await page.click(`#lightnow .ln-lamp[data-id="${L}"]`); await page.waitForTimeout(700);
  console.log('tap a lit lamp: level', before, '->', await page.evaluate(id => level(id), L), '| row shows off:', !(await page.$eval(`#lightnow .ln-lamp[data-id="${L}"]`, el => el.classList.contains('on'))));
  await page.click(`#lightnow .ln-lamp[data-id="${L}"]`); await page.waitForTimeout(700);
  console.log('tap again: level', await page.evaluate(id => level(id), L), '| row shows on:', await page.$eval(`#lightnow .ln-lamp[data-id="${L}"]`, el => el.classList.contains('on')));
  // one rule for every disc: 56px lit, 44px off (the disc breathes between the two on a toggle)
  const sizesAfter = await page.$$eval('#lightnow .ln-lamp', els => els.map(el => ({ on: el.classList.contains('on'), w: Math.round(el.querySelector('.lamp').getBoundingClientRect().width) })));
  console.log('disc sizes follow the rule (56 lit, 44 off):', sizesAfter.every(x => x.w === (x.on ? 56 : 44)), JSON.stringify(sizesAfter));
  // the power button: everything off, then on again brings back what was on
  await page.evaluate(id => command({ type: 'level', target: 'd:' + id, level: 30 }), L); await page.waitForTimeout(600);
  const litBefore = await page.evaluate(() => Object.fromEntries(litLights().map(d => [d.device_id, level(d.device_id)])));
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.click('.housecard .hc-off'); await page.waitForTimeout(900);
  console.log('power with lights on: lit now', await page.evaluate(() => litLights().length), '| button reads', await page.$eval('.housecard .hc-off', el => el.getAttribute('aria-label')), '| dark style:', await page.$eval('.housecard .hc-off', el => el.classList.contains('dark')));
  await page.screenshot({ path: 's14-power-dark.png' });
  await page.evaluate(() => { window.__cmds = []; });
  await page.click('.housecard .hc-off'); await page.waitForTimeout(1200);
  const litAfter = await page.evaluate(() => Object.fromEntries(litLights().map(d => [d.device_id, level(d.device_id)])));
  console.log('power with house dark: sent', await page.evaluate(() => JSON.stringify(window.__cmds)), '| before', JSON.stringify(litBefore), '| after', JSON.stringify(litAfter), '| same:', JSON.stringify(litBefore) === JSON.stringify(litAfter));
  // the house card's own label (the Now view's round button is gone; the card says the same thing in words)
  console.log('house card power label:', (await page.textContent('.housecard .hc-off #hc-pw')).trim());
  // the setting: Everything
  // the power button has its own row on Settings now, not a "Preferences" sheet (docs/ia-v5.md 3, stage 6)
  await page.click('#nav button[data-view=settings]'); await page.waitForSelector('[data-act="power-open"]'); await page.click('[data-act="power-open"]'); await page.waitForSelector('[data-act="power-on"]'); await page.waitForTimeout(400);
  await page.click('[data-act="power-on"][data-v="all"]'); await page.waitForTimeout(900);
  console.log('setting row reads:', await page.$eval('[data-power-on]', el => el.closest('.item').querySelector('.d').textContent));
  await page.screenshot({ path: 's14-power-setting.png' });
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(500);
  await page.click('#nav button[data-view=home]'); await page.waitForSelector('.housecard'); await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.click('.housecard .hc-off'); await page.waitForTimeout(900);
  console.log('after setting, button reads', await page.$eval('.housecard .hc-off', el => el.getAttribute('aria-label')));
  await page.evaluate(() => { window.__cmds = []; });
  await page.click('.housecard .hc-off'); await page.waitForTimeout(1200);
  console.log('everything mode sent', await page.evaluate(() => JSON.stringify(window.__cmds)), '| lit now', await page.evaluate(() => litLights().length), 'of', nLights);
  console.log('saved on hub:', await page.evaluate(async () => (await api('/api/snapshot')).config.settings.power_on));

  // a light on an enabled automation: the power button asks first instead of just turning everything off
  await page.evaluate(id => command({ type: 'level', target: 'd:' + id, level: 40 }), L); await page.waitForTimeout(500);
  const otherLit = await page.evaluate(() => litLights().map(d => d.device_id));
  await page.evaluate(async (args) => {
    const [id, others] = args;
    S.config.schedules = [{ id: 'auto-test', name: 'Evening', enabled: true, at: { type: 'time', time: '19:00' }, days: [0, 1, 2, 3, 4, 5, 6], actions: [{ type: 'level', target: 'd:' + id, level: 60 }] }];
    // everything else that happens to be lit is turned off too, in the same tap, once it is not automated
    for (const oid of others) if (oid !== id) command({ type: 'level', target: 'd:' + oid, level: 0 });
    await save({ quiet: true, render: true });
  }, [L, otherLit]);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.click('.housecard .hc-off'); await page.waitForTimeout(500);
  const sheetText = await page.$eval('#sheet-root', el => el.textContent);
  console.log('automated light: sheet opened', await page.evaluate(() => sheet.isOpen()), '| names it:', sheetText.includes(await page.evaluate(id => dev(id).name, L)), '| still lit (nothing sent yet):', await page.evaluate(id => level(id) > 0, L));
  await page.click('[data-act="poweroff-rest"]'); await page.waitForTimeout(700);
  console.log('leave it on: automated light stays', await page.evaluate(id => level(id), L) > 0, '| sheet closed:', !(await page.evaluate(() => sheet.isOpen())));
  await page.screenshot({ path: 's14-poweroff-sheet.png' });
  // asking again, this time choosing to turn off everything including the automated one
  await page.click('.housecard .hc-off'); await page.waitForTimeout(500);
  await page.click('[data-act="poweroff-all"]'); await page.waitForTimeout(700);
  console.log('turn off everything anyway: automated light is now', await page.evaluate(id => level(id), L), '| lit total', await page.evaluate(() => litLights().length));
  // disabled again: the button goes straight back to turning everything off in one tap, no sheet
  await page.evaluate(id => command({ type: 'level', target: 'd:' + id, level: 40 }), L); await page.waitForTimeout(500);
  await page.evaluate(() => { for (const sc of S.config.schedules || []) sc.enabled = false; return save({ quiet: true, render: true }); }); await page.waitForTimeout(500);
  await page.click('.housecard .hc-off'); await page.waitForTimeout(700);
  console.log('disabled automation: no sheet', !(await page.evaluate(() => sheet.isOpen())), '| lit', await page.evaluate(() => litLights().length));

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
