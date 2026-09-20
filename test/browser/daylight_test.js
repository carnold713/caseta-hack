// Follow the day: the light page's row and its pane, the room control, the scene entry, a manual colour pausing
// it, and a Caseta dimmer never being offered it. Screens at 390x844 as s21-*.png.
// PORT=4485 node daylight_test.js   (the rig's fake connector should run with FAKE_NOW to fix the time of day)
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const SHOT = process.env.SHOT_DIR || __dirname;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try { const t = require('fs').readFileSync(__dirname + '/polish_token.txt', 'utf8').trim(); if (t) await ctx.addInitScript(x => { try { localStorage.setItem('token', x); } catch (_) {} }, t); } catch (_) { /* no saved token */ }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR|502/.test(m.text())) errors.push('console: ' + m.text()); });
  const shot = n => page.screenshot({ path: `${SHOT}/s21-${n}.png` });
  const text = async sel => ((await page.textContent(sel)) || '').replace(/\s+/g, ' ').trim();

  await page.goto(`http://127.0.0.1:${PORT}/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav button[data-view=settings]', { timeout: 10000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(300);

  // the home needs a location before the sun means anything, and a Hue bridge before there is a lamp with warmth
  await page.evaluate(async () => { S.config.settings.location = { lat: 45.52, lng: -122.68, name: 'Portland' }; await save({ quiet: true, render: false }); });
  await page.waitForTimeout(600);
  if (!(await page.evaluate(() => !!S.inv.devices.hue_l1))) {
    await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400);
    await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400);
    await page.waitForSelector('[data-act="hue-open"]'); await page.click('[data-act="hue-open"]');
    await page.waitForSelector('[data-act="hue-pick"]', { timeout: 8000 }); await page.click('[data-act="hue-pick"]'); await page.waitForTimeout(300);
    await page.click('[data-act="hue-pair"]'); await page.waitForSelector('[data-act="hue-forget"]', { timeout: 10000 }); await page.waitForTimeout(400);
    await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(500);
  }
  // a lit lamp, so the screens show a lamp that is actually following something
  await page.evaluate(() => command({ type: 'level', target: 'd:hue_l1', level: 60 })); await page.waitForTimeout(700);
  // start from nothing following
  await page.evaluate(async () => { S.config.settings.follow_day = { device_ids: [], brightness: false }; await save({ quiet: true, render: true }); });
  await page.waitForTimeout(600);
  console.log('the home says it is', await page.evaluate(() => (S.sun && S.sun.now) || '?'), '| sunrise', await page.evaluate(() => S.sun && S.sun.sunrise), '| noon', await page.evaluate(() => S.sun && S.sun.noon));
  console.log('the curve right now:', await page.evaluate(() => followKelvin() + ' K'), '|', await page.evaluate(() => followWhen()));

  // ---------- 1. the light's page: the row under Colour ----------
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(500);
  await page.click('.room[data-room="hue_room1"] [data-act="room-open"]'); await page.waitForTimeout(600);
  await page.click('[data-act="light-open"][data-id="hue_l1"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(600);
  console.log('light page: Colour row', !!(await page.$('#ld [data-act="light-colour"]')), '| Follow the day row', !!(await page.$('#ld [data-act="follow-open"]')), '| its value', await text('#ld [data-act="follow-open"] .val'));
  await shot('light-off');

  // ---------- the pane ----------
  await page.click('#ld [data-act="follow-open"]'); await page.waitForTimeout(600);
  console.log('pane (off): title', await text('#sheet-root .sh h2'), '| sub', await text('#sheet-root .sh .sub'), '| back arrow', !!(await page.$('#sheet-root [data-act="sheet-back"]')));
  console.log('pane (off): the sentence', await text('#sheet-root .card .item .d'), '| sparkline', !!(await page.$('#sheet-root .dayspark')), '| dot at now', !!(await page.$('#sheet-root .dsd')));
  await shot('pane-off');
  await page.click('#sheet-root [data-act="follow-toggle"]'); await page.waitForTimeout(900);
  const following = await page.evaluate(() => ({ cfg: S.config.settings.follow_day, live: S.follow }));
  console.log('switched on: config says', JSON.stringify(following.cfg), '| the connector says', JSON.stringify(following.live));
  console.log('pane (on): right now reads', await text('#sheet-root [data-follownow]'));
  console.log('pane (on): brightness row', await text('#sheet-root .card:last-of-type .item .t'), '| its switch is', await page.$eval('#sheet-root [data-act="follow-bright"]', el => (el.className.includes('on') ? 'on' : 'off')));
  await shot('pane-on');
  // the lamp took the day's white
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => S.states.hue_l1);
  const want = await page.evaluate(() => followKelvinFor('hue_l1'));
  console.log('the lamp now shows', JSON.stringify(st.color), '| the curve wants', want, 'K | same:', Math.abs(st.color.kelvin - want) <= 30);

  // brightness is an option, off by default
  await page.click('#sheet-root [data-act="follow-bright"]'); await page.waitForTimeout(700);
  console.log('brightness switched on: config says', await page.evaluate(() => JSON.stringify(S.config.settings.follow_day)));
  await shot('pane-brightness');
  await page.click('#sheet-root [data-act="follow-bright"]'); await page.waitForTimeout(600);

  // back to the light page. The Colour value row retired into the swatch row (design-spec-v5 4.9), and the
  // "Following the day" tag went with it: the Follow the day row's own value is now the one place that says so.
  await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(600);
  console.log('light page: swatch row', await page.$$eval('#ld .swatch', els => els.length), '| more chip', (await text('#ld [data-act="light-colour"]')), '| Follow row value', await text('#ld [data-act="follow-open"] .val'));
  await shot('light-on');

  // ---------- 2. a manual colour pauses it ----------
  await page.click('#ld [data-act="light-colour"]'); await page.waitForSelector('#sheet-root [data-cwarm]'); await page.waitForTimeout(600);
  await page.click('#sheet-root .swatch[data-hex="#ff2a1a"]'); await page.waitForTimeout(1200);
  const paused = await page.evaluate(() => ({ paused: (S.follow || {}).paused, ids: (S.follow || {}).ids, app: followPaused('hue_l1') }));
  console.log('set by hand: the connector paused', JSON.stringify(paused.paused), '| still following:', JSON.stringify(paused.ids), '| the app knows:', paused.app);
  await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(600);
  console.log('light page while paused: Follow row reads', await text('#ld [data-act="follow-open"] .val'));
  await page.click('#ld [data-act="follow-open"]'); await page.waitForTimeout(700);
  console.log('pane while paused says:', await page.evaluate(() => [...document.querySelectorAll('#sheet-root p.d')].map(p => p.textContent.trim()).join(' / ')));
  await shot('pane-paused');
  // off and on again, and it follows once more
  await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(500);
  await page.evaluate(() => command({ type: 'level', target: 'd:hue_l1', level: 0 })); await page.waitForTimeout(900);
  await page.evaluate(() => command({ type: 'level', target: 'd:hue_l1', level: 60 })); await page.waitForTimeout(1400);
  const back = await page.evaluate(() => ({ paused: (S.follow || {}).paused, colour: S.states.hue_l1.color, want: followKelvinFor('hue_l1') }));
  console.log('off and on again: paused is', JSON.stringify(back.paused), '| the lamp is back on the curve:', back.colour.mode === 'ct' && Math.abs(back.colour.kelvin - back.want) <= 30, JSON.stringify(back.colour));

  // ---------- 3. a Caseta dimmer is never offered it ----------
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500); // the room is a sheet now: closing it is the way back to Home
  await page.click('.room[data-room="20"] [data-act="room-open"]'); await page.waitForTimeout(600);
  await page.click('[data-act="light-open"][data-id="5"]'); await page.waitForSelector('#ld'); await page.waitForTimeout(600);
  console.log('a Caseta dimmer: Colour row', !!(await page.$('#ld [data-act="light-colour"]')), '| Follow the day row', !!(await page.$('#ld [data-act="follow-open"]')));
  await shot('caseta-light');
  // the light was opened from the room, so its back arrow returns there (sheet-close would drop past it to Home)
  await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForTimeout(500);
  await page.click('[data-act="room-setup"]'); await page.waitForTimeout(600);
  console.log('a Caseta room setup: Follow the day row', !!(await page.$('[data-act="follow-room-open"]')));
  await shot('caseta-room-setup');

  // ---------- 4. the room control ----------
  await page.click('[data-act="room-setup-back"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500); // the room is a sheet now: closing it is the way back to Home
  await page.click('.room[data-room="hue_room1"] [data-act="room-open"]'); await page.waitForTimeout(600);
  await page.click('[data-act="room-setup"]'); await page.waitForTimeout(700);
  console.log('room setup: Follow the day row', !!(await page.$('[data-act="follow-room-open"]')), '| it says', await text('[data-act="follow-room-open"] .d'));
  await shot('room-setup');
  await page.click('[data-act="follow-room-open"]'); await page.waitForTimeout(700);
  console.log('room pane: lamps listed', await page.$$eval('#sheet-root .card .item .t', els => els.map(e => e.textContent.trim())), '| left out', await page.evaluate(() => { const p = [...document.querySelectorAll('#sheet-root p.d')].pop(); return p ? p.textContent.trim() : ''; }));
  await shot('room-pane');
  await page.click('#sheet-root [data-act="follow-toggle"][data-id="hue_l2"]'); await page.waitForTimeout(900);
  console.log('switched the second lamp on from the room:', await page.evaluate(() => JSON.stringify(S.config.settings.follow_day.device_ids)));
  await page.click('#sheet-root [data-act="sheet-close"]'); await page.waitForTimeout(700);
  console.log('room setup now says', await text('[data-act="follow-room-open"] .d'), '| the room switch is', await page.$eval('[data-act="follow-room"]', el => (el.className.includes('on') ? 'on' : 'off')));
  await shot('room-setup-on');
  // the room switch turns every lamp in it off again
  await page.click('[data-act="follow-room"]'); await page.waitForTimeout(900);
  console.log('the room switch off:', await page.evaluate(() => JSON.stringify(S.config.settings.follow_day.device_ids)));
  await page.click('[data-act="follow-room"]'); await page.waitForTimeout(900);
  console.log('the room switch on:', await page.evaluate(() => JSON.stringify(S.config.settings.follow_day.device_ids)));

  // ---------- 5. a scene entry that says "follow the day" ----------
  await page.click('[data-act="room-setup-back"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500); // the room is a sheet now: closing it is the way back to Home
  // a scene of its own, made from the lights as they are
  const sid = await page.evaluate(async () => {
    const p = { id: 'dayscene', name: 'Afternoon', levels: { hue_l1: 70, 5: 40 }, fade: null };
    S.config.presets = S.config.presets.filter(x => x.id !== 'dayscene').concat([p]);
    await save({ quiet: true, render: true });
    return p.id;
  });
  await page.waitForTimeout(700);
  await page.click('[data-act="scenes-open"]'); await page.waitForTimeout(600);
  await page.click('[data-act="scenes-edit"]'); await page.waitForTimeout(400);
  await page.click(`.tile [data-act="scene-edit"][data-id="${sid}"]`); await page.waitForTimeout(700);
  console.log('scene editor: the lamp has a Colour row', !!(await page.$('#sheet-root [data-act="c-expand"][data-cid="hue_l1"]')));
  await page.click('#sheet-root [data-act="c-expand"][data-cid="hue_l1"]'); await page.waitForTimeout(600);
  console.log('its colour controls: swatches', await page.$$eval('#sheet-root .cbody .swatch', els => els.length), '| a "Follow the day" chip beside them', !!(await page.$('#sheet-root [data-act="c-follow"]')));
  await shot('scene-colour');
  await page.click('#sheet-root [data-act="c-follow"]'); await page.waitForTimeout(700);
  console.log('picked: the entry is now', await page.evaluate(() => JSON.stringify(presets().find(p => p.id === 'dayscene').levels.hue_l1)), '| the row reads', await text('#sheet-root [data-scol="hue_l1"]'), '| the chip is', await page.$eval('#sheet-root [data-act="c-follow"]', el => (el.className.includes('sel') ? 'picked' : 'not picked')));
  await shot('scene-follow');
  // a Caseta dimmer in the same scene is never offered the chip
  console.log('the Caseta dimmer in the same scene has a Colour row:', !!(await page.$('#sheet-root [data-act="c-expand"][data-cid="5"]')));
  // running it switches following on and sets the white for the moment it runs
  await page.evaluate(async () => { S.config.settings.follow_day = { device_ids: [], brightness: false }; await save({ quiet: true, render: false }); });
  await page.waitForTimeout(700);
  await page.evaluate(() => command({ type: 'level', target: 'd:hue_l1', level: 0 })); await page.waitForTimeout(700);
  await page.click('#sheet-root [data-act="sheet-close"]'); await page.waitForTimeout(600);
  await page.click('[data-act="scenes-edit"]'); await page.waitForTimeout(500);   // out of Edit: a tile's one job is to run the scene
  await page.click(`.tile[data-act="run-scene"][data-t="p:${sid}"]`); await page.waitForTimeout(2200);
  const ran = await page.evaluate(() => ({ cfg: S.config.settings.follow_day.device_ids, live: (S.follow || {}).ids, st: S.states.hue_l1, want: followKelvinFor('hue_l1') }));
  console.log('ran the scene: following now', JSON.stringify(ran.cfg), '| the connector says', JSON.stringify(ran.live), '| the lamp is', ran.st.level + '%', JSON.stringify(ran.st.color), '| on the curve:', ran.st.color && Math.abs(ran.st.color.kelvin - ran.want) <= 30);
  await shot('scenes-page');

  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  await browser.close();
})();
