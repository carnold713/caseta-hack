// Hue colour: pair the fake bridge, open a colour lamp, drag Warmth sideways (a color command with kelvin goes out and
// the disc changes), open More colours and pick a swatch (hex goes out), save a scene (the lamp's entry is an object)
// and open the scene editor's colour row. PORT=4485 node hue_color_test.js
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
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR|502/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav button[data-view=settings]', { timeout: 10000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  // pair the fake bridge unless a previous run left it paired
  const paired = await page.evaluate(() => !!S.inv.devices['hue_l1']);
  if (!paired) {
    await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400); await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); await page.waitForSelector('[data-act="hue-open"]'); await page.click('[data-act="hue-open"]');
    await page.waitForSelector('[data-act="hue-pick"]', { timeout: 8000 }); await page.click('[data-act="hue-pick"]'); await page.waitForTimeout(400);
    await page.click('[data-act="hue-pair"]'); await page.waitForSelector('[data-act="hue-forget"]', { timeout: 10000 }); await page.waitForTimeout(400);
    await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(500);
  }
  console.log('inventory: hue_l1', await page.evaluate(() => JSON.stringify({ color: S.inv.devices.hue_l1.color, ct: S.inv.devices.hue_l1.ct, ct_range: S.inv.devices.hue_l1.ct_range })), '| hue_l2', await page.evaluate(() => JSON.stringify({ color: S.inv.devices.hue_l2.color, ct: S.inv.devices.hue_l2.ct, ct_range: S.inv.devices.hue_l2.ct_range })));
  console.log('state: hue_l1', await page.evaluate(() => JSON.stringify(S.states.hue_l1)));
  await page.click('#nav button[data-view=home]'); await page.waitForSelector('.room[data-room="hue_room1"]', { timeout: 5000 }); await page.waitForTimeout(400);
  if (!(await page.$('.light'))) { await page.click('.room[data-room="hue_room1"] [data-act="room-open"]'); await page.waitForTimeout(500); }
  await page.evaluate(() => { const e = document.querySelector('.light'); if (e) e.scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(300);
  const rowDisc = await page.$eval('[data-ldisc="hue_l1"]', el => getComputedStyle(el).backgroundColor);
  console.log('room row disc (warm white at 55%):', rowDisc);
  await page.screenshot({ path: 's13-hue-room.png' });
  // record every command the app sends
  await page.evaluate(() => { window.__cmds = []; const orig = window.command; window.command = a => { window.__cmds.push(a); return orig(a); }; });
  await page.click('[data-act="light-open"][data-id="hue_l1"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(600);
  const disc0 = await page.$eval('.ld-disc', el => getComputedStyle(el).backgroundColor);
  // the light page: the swatch row is on the light's own screen now (design-spec-v5 4.9), with "More colours" into
  // the pane, and the warmth slider and the hue strip stay behind that pane
  console.log('light page: more chip', (await page.textContent('#ld [data-act="light-colour"]')).trim(), '| warmth on the page', !!(await page.$('#sheet-root [data-cwarm]')), '| swatches on the page', await page.$$eval('#sheet-root .swatch', els => els.length));
  console.log('disc before:', disc0, '| well fill:', await page.$eval('#ld .ld-well .slider', el => getComputedStyle(el).getPropertyValue('--fill').trim()));
  await page.screenshot({ path: 's13-hue-light.png' });
  const h0 = await page.$eval('#sheet-root .sheet', el => Math.round(el.getBoundingClientRect().height));
  // the colour controls, on their own pane
  await page.click('#ld [data-act="light-colour"]'); await page.waitForSelector('#sheet-root [data-cwarm]'); await page.waitForTimeout(700);
  console.log('colour pane: title', (await page.textContent('#sheet-root .sh h2')).trim(), '| back arrow', !!(await page.$('#sheet-root [data-act="sheet-back"]')), '| warmth row', !!(await page.$('#sheet-root [data-cwarm]')), '| swatches', await page.$$eval('#sheet-root .swatch', els => els.length), '| more row', !!(await page.$('#sheet-root [data-act="c-more"]')), '| label', await page.textContent('#sheet-root [data-cname]'), await page.textContent('#sheet-root [data-ck]'));
  // the disc lives on the light page, so read it by stepping back and returning
  const discAfter = async () => {
    const wasMore = !!(await page.$('#sheet-root .cmore'));
    await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForSelector('.ld-disc'); await page.waitForTimeout(600);
    const c = await page.$eval('.ld-disc', el => getComputedStyle(el).backgroundColor); const rv = await page.$$eval('#ld .swatch.sel', els => els.map(e => e.title).join(',') || 'none');
    await page.click('#ld [data-act="light-colour"]'); await page.waitForSelector('#sheet-root [data-cwarm]'); await page.waitForTimeout(600);
    // the pane opens at rest, so put "More colours" back the way it was
    if (wasMore && !(await page.$('#sheet-root .cmore'))) { await page.click('#sheet-root [data-act="c-more"]'); await page.waitForTimeout(500); }
    return { c, rv };
  };
  // 1. drag the warmth slider sideways with touch events (slide.js: a sideways drag sets, a vertical one scrolls)
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const warm = await page.$('#sheet-root [data-cwarm]'); const wb = await warm.boundingBox();
  const x0 = wb.x + wb.width * 0.15, y0 = wb.y + wb.height / 2;
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= 12; i++) await touch('touchMove', x0 + i * 22, y0 + (i % 2));
  await touch('touchEnd'); await page.waitForTimeout(500);
  const kelvinCmds = await page.evaluate(() => window.__cmds.filter(c => c.type === 'color' && c.kelvin != null));
  console.log('warmth drag: slider', await warm.evaluate(el => el.value), '| color commands with kelvin:', kelvinCmds.length, JSON.stringify(kelvinCmds.slice(-1)), '| label', await page.textContent('#sheet-root [data-cname]'), await page.textContent('#sheet-root [data-ck]'));
  const d1 = await discAfter();
  console.log('disc after warmth:', d1.c, '| changed:', d1.c !== disc0, '| the row now reads', d1.rv);
  await page.screenshot({ path: 's13-hue-warmth.png' });
  // a vertical swipe on the warmth slider scrolls and never changes it
  const warm2 = await page.$('#sheet-root [data-cwarm]');   // the pane was redrawn on the way back, so take it again
  const wb2 = await warm2.boundingBox(); const vBefore = await warm2.evaluate(el => el.value); const n0 = await page.evaluate(() => window.__cmds.length);
  await touch('touchStart', wb2.x + wb2.width * 0.5, wb2.y + wb2.height / 2);
  for (let i = 1; i <= 6; i++) await touch('touchMove', wb2.x + wb2.width * 0.5, wb2.y + wb2.height / 2 - i * 12);
  await touch('touchEnd'); await page.waitForTimeout(300);
  console.log('vertical swipe on warmth: value', vBefore, '->', await warm2.evaluate(el => el.value), '| new commands', (await page.evaluate(() => window.__cmds.length)) - n0);
  // after the echo, the state carries the kelvin the fake connector clamped
  await page.waitForTimeout(1800);
  console.log('state after echo:', await page.evaluate(() => JSON.stringify(S.states.hue_l1.color)));
  // 2. the hue strip and the saturation slider: open from the start on the colour's own screen, and a tap on the row
  // closes them again and puts them back
  console.log('hue strip open at rest:', !!(await page.$('#sheet-root .cmore [data-chue]')));
  await page.click('#sheet-root [data-act="c-more"]'); await page.waitForTimeout(500);
  console.log('after tapping the row:', !!(await page.$('#sheet-root .cmore [data-chue]')));
  if (!(await page.$('#sheet-root .cmore [data-chue]'))) { await page.click('#sheet-root [data-act="c-more"]'); await page.waitForTimeout(500); }
  const h1 = await page.$eval('#sheet-root .sheet', el => Math.round(el.getBoundingClientRect().height));
  console.log('more colours open:', !!(await page.$('#sheet-root .cmore [data-chue]')), !!(await page.$('#sheet-root .cmore [data-csat]')), '| sheet height', h0, '->', h1);
  await page.screenshot({ path: 's13-hue-more.png' });
  // 3. a swatch: hex goes out, the disc takes the colour
  await page.click('#sheet-root .swatch[data-hex="#ff2a1a"]'); await page.waitForTimeout(400);
  const hexCmds = await page.evaluate(() => window.__cmds.filter(c => c.type === 'color' && c.hex));
  console.log('swatch: hex commands', hexCmds.length, JSON.stringify(hexCmds.slice(-1)), '| selected', await page.$eval('#sheet-root .swatch.sel', el => el.dataset.hex), '| label', await page.textContent('#sheet-root [data-ccur]'), '| hue slider', await page.$eval('#sheet-root [data-chue]', el => el.value), 'sat', await page.$eval('#sheet-root [data-csat]', el => el.value));
  const d2 = await discAfter();
  console.log('disc after the swatch:', d2.c, '| the row now reads', d2.rv);
  await page.screenshot({ path: 's13-hue-red.png' });
  // 4. the hue strip: a sideways drag sends a new hex and the saturation track follows
  const hs = await page.$('#sheet-root [data-chue]'); await hs.evaluate(el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const hb = await hs.boundingBox(); const hx = hb.x + hb.width * 0.1, hy = hb.y + hb.height / 2;
  await touch('touchStart', hx, hy);
  for (let i = 1; i <= 10; i++) await touch('touchMove', hx + i * 18, hy);
  await touch('touchEnd'); await page.waitForTimeout(500);
  const hexAfter = await page.evaluate(() => window.__cmds.filter(c => c.type === 'color' && c.hex).slice(-1)[0]);
  console.log('hue drag: slider', await hs.evaluate(el => el.value), '| last hex', JSON.stringify(hexAfter), '| label', await page.textContent('#sheet-root [data-ccur]'), '| sat track', await page.$eval('#sheet-root [data-csat]', el => el.style.getPropertyValue('--track-grad').slice(0, 60)));
  await page.screenshot({ path: 's13-hue-strip.png' });
  await page.waitForTimeout(1800);
  console.log('state after hex echo:', await page.evaluate(() => JSON.stringify(S.states.hue_l1.color)));
  // the light was opened from the room, so its back arrow chains all the way back there: colour pane -> the
  // light itself -> the room sheet (the room's own row disc is not in the DOM while the light sits over it,
  // since both now live in the one sheet; back is how you see it again, not sheet-close, which would close past it)
  await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForSelector('.ld-disc'); await page.waitForTimeout(500);
  await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForSelector('[data-ldisc="hue_l1"]'); await page.waitForTimeout(500);
  console.log('room disc:', await page.$eval('[data-ldisc="hue_l1"]', el => getComputedStyle(el).backgroundColor));
  await page.screenshot({ path: 's13-hue-room-red.png' });
  // 5. a ct-only lamp shows Warmth and no swatches; turn it on first so it has a level
  await page.click('[data-act="light-open"][data-id="hue_l2"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(500);
  console.log('ct-only lamp: the chip reads', (await page.textContent('#ld [data-act="light-colour"]')).trim(), '| its whites', await page.$$eval('#ld .swatch', els => els.length), '| the one it is showing', await page.$$eval('#ld .swatch.sel', els => els.map(e => e.title).join(',') || 'none'));
  await page.click('#ld [data-act="light-colour"]'); await page.waitForSelector('#sheet-root [data-cwarm]'); await page.waitForTimeout(600);
  console.log('ct-only lamp: warmth row', !!(await page.$('#sheet-root [data-cwarm]')), '| swatches', await page.$$eval('#sheet-root .swatch', els => els.length), '| more row', !!(await page.$('#sheet-root [data-act="c-more"]')));
  const w2 = await page.$('#sheet-root [data-cwarm]'); const w2b = await w2.boundingBox(); const w2v = Number(await w2.evaluate(el => el.value));
  await touch('touchStart', w2b.x + w2b.width * (w2v < 50 ? 0.8 : 0.3), w2b.y + w2b.height / 2); await touch('touchEnd'); await page.waitForTimeout(400);
  console.log('ct-only tap: slider', w2v, '->', await w2.evaluate(el => el.value), '| last command', await page.evaluate(() => JSON.stringify(window.__cmds.slice(-1)[0])));
  await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForSelector('#ld .display'); await page.waitForTimeout(600);
  console.log('ct-only lamp, back on its page: level shown', await page.textContent('#ld .display'), '| the white it is showing', await page.$$eval('#ld .swatch.sel', els => els.map(e => e.title).join(',') || 'none'));
  await page.screenshot({ path: 's13-hue-ct-only.png' });
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(1800);
  // 6. a scene from what is on: the Hue lamps' entries carry their colour
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(500);
  await page.click('[data-act="scenes-open"]'); await page.waitForTimeout(500);
  await page.click('[data-act="scene-new"]'); await page.waitForSelector('#scene-name'); await page.waitForTimeout(600);
  const levels = await page.evaluate(() => { const p = presets().find(x => x.id === S.sceneEdit); return JSON.stringify(p.levels); });
  console.log('new scene levels:', levels);
  console.log('scene sub:', (await page.textContent('#sheet-root .sh .sub')).trim());
  console.log('scene rows: colour value row', !!(await page.$('[data-act="c-expand"][data-cid="hue_l1"]')), (await page.textContent('[data-scol="hue_l1"]')), '| warmth value row', !!(await page.$('[data-act="c-expand"][data-cid="hue_l2"]')), (await page.textContent('[data-scol="hue_l2"]')));
  await page.screenshot({ path: 's13-scene-rows.png' });
  await page.click('[data-act="c-expand"][data-cid="hue_l1"]'); await page.waitForTimeout(500);
  console.log('scene colour row open:', !!(await page.$('.cbody .swatches')), '| As it is chip', !!(await page.$('.cbody [data-act="c-none"]')));
  await page.evaluate(() => document.querySelector('.cbody').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  await page.screenshot({ path: 's13-scene-colour.png' });
  await page.click('.cbody .swatch[data-hex="#2864ff"]'); await page.waitForTimeout(900);
  console.log('after picking Blue:', await page.evaluate(() => JSON.stringify(presets().find(x => x.id === S.sceneEdit).levels.hue_l1)), '| label', await page.textContent('[data-scol="hue_l1"]'));
  // the row's slider keeps the colour when the level changes
  await page.evaluate(() => { const el = document.querySelector('input[data-scene-lvl="hue_l1"]'); el.value = 30; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(300);
  console.log('after level 30:', await page.evaluate(() => JSON.stringify(presets().find(x => x.id === S.sceneEdit).levels.hue_l1)));
  await page.click('.cbody [data-act="c-none"]'); await page.waitForTimeout(300);
  console.log('after As it is:', await page.evaluate(() => JSON.stringify(presets().find(x => x.id === S.sceneEdit).levels.hue_l1)), '| label', await page.textContent('[data-scol="hue_l1"]'));
  // the white swatches left the Colour row (the Warmth slider above already covers white on a lamp that has both):
  // the same thing is set by dragging that slider, and the entry still becomes {level, kelvin}
  { const w = await page.$('.cbody [data-cwarm]'); const wb = await w.boundingBox();
    await page.mouse.move(wb.x + wb.width * 0.15, wb.y + wb.height / 2); await page.mouse.down();
    await page.mouse.move(wb.x + wb.width * 0.2, wb.y + wb.height / 2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(900); }
  console.log('after Warm:', await page.evaluate(() => JSON.stringify(presets().find(x => x.id === S.sceneEdit).levels.hue_l1)));
  await page.screenshot({ path: 's13-scene-picked.png' });
  // the saved config survived the hub's validation with the object form
  await page.waitForTimeout(1200);
  const saved = await page.evaluate(async () => { const r = await api('/api/snapshot'); const p = r.config.presets.find(x => x.id === S.sceneEdit); return JSON.stringify(p && p.levels.hue_l1); });
  console.log('saved on the hub:', saved);
  // running the scene: the fake connector echoes the colour and the Home tile shows it
  await page.click('#sheet-root [data-act="run-scene"]'); await page.waitForTimeout(800);
  console.log('after Try it: state', await page.evaluate(() => JSON.stringify(S.states.hue_l1)));
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(500);
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(600);
  console.log('home scene chip lamps:', await page.$$eval('.scenerow .chip[data-act="run-scene"] .lamp', els => els.slice(0, 4).map(e => e.style.background)));
  await page.screenshot({ path: 's13-hue-home.png' });
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
