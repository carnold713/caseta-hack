// The PC screen row on a room's page (web/ui/screens/screensync.js), against the fake connector's pretend sync.
//
//   no PC seen: no row anywhere; a PC seen: the row is on the page of a room with a Hue colour light, and not on one without
//   switching it on makes this the room that follows; the line under it says what it is doing
//   paused (a light changed by hand) reads as off, and switching it on resumes it in place
//   switching it off keeps the room, so a remote can switch it back on
//   a remote's button can be set to "PC screen on or off", and a press of it switches the room's row
//   a pairing without the streaming key offers the Hue bridge's button again
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const fake = d => fs.writeFileSync(path.join(process.cwd(), 'fake-do.json'), JSON.stringify(d));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`http://127.0.0.1:${PORT}/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.solid'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(800);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });

  // a room with a Hue colour light, and one without
  const rooms = await C(() => {
    const c = window.__copper;
    const colour = a => c.H.roomLights(a.id).some(d => String(d.device_id).startsWith('hue_') && d.color);
    const as = c.data.areas();
    const a = as.find(colour), b = as.find(x => !colour(x) && c.H.roomLights(x.id).length);
    return { with: a && a.id, without: b && b.id };
  });
  check('a room with a Hue colour light, and one without', rooms.with && rooms.without, rooms);
  const row = () => C(() => { const r = document.querySelector('#screen .sync-rows'); if (!r) return null;
    const t = r.querySelector('[data-act="sync-toggle"]'); const d = r.querySelector('.row-txt .d');
    return { on: t && t.getAttribute('aria-checked'), line: d ? d.textContent : '', pair: !!r.querySelector('[data-act="sync-pair"]'), text: r.innerText }; });
  const go = async id => { await C(id => { location.hash = `room/${id}`; }, id); await wait(1200); };
  const syncInfo = () => C(() => ((window.__copper.S.agent || {}).info || {}).screen_sync || null);
  const settingRoom = () => C(() => ((window.__copper.S.config.settings || {}).screen_sync || {}).room || null);

  await go(rooms.with);
  check('no PC seen yet: no row', !(await row()), await row());

  fake({ sync: { pc: true } }); await wait(900); await go(rooms.with);
  let r = await row();
  check('a PC seen: the row is on the room with a colour light, switched off', r && r.on === 'false' && !r.line, r);
  await go(rooms.without);
  check('and not on a room without one', !(await row()), await row());

  await go(rooms.with);
  await page.click('#screen [data-act="sync-toggle"]'); await wait(1200);
  r = await row();
  check('switched on, this room follows', (await settingRoom()) === rooms.with && r.on === 'true', { room: await settingRoom(), r });
  check('and the line says it is following', r.line === 'Following', r);

  // a light changed by hand pauses it
  fake({ sync: { paused: true } }); await wait(900);
  r = await row();
  check('paused reads as off, and says so', r.on === 'false' && r.line === 'Paused' && (await settingRoom()) === rooms.with, r);
  await page.click('#screen [data-act="sync-toggle"]'); await wait(1200);
  r = await row();
  check('switched on again, it resumes in place', r.on === 'true' && (await syncInfo()).state === 'syncing' && (await settingRoom()) === rooms.with, { r, s: await syncInfo() });

  await page.click('#screen [data-act="sync-toggle"]'); await wait(1200);
  r = await row();
  check('switched off, the room stays but it is off', r.on === 'false' && (await settingRoom()) === rooms.with && (await syncInfo()).state === 'off', { r, room: await settingRoom(), s: await syncInfo() });

  // a remote's button: Press twice on the Kitchen Pico's top button, set to "PC screen on or off"
  await C(() => { location.hash = 'remote/9/k0-double'; }); await wait(1400);
  await page.click('[data-act="ways"]'); await wait(900);
  const offered = await C(() => !!document.querySelector('[data-act="way"][data-r="screensync"]'));
  check('More choices offers PC screen on or off', offered, null);
  if (offered) { await page.click('[data-act="way"][data-r="screensync"]'); await wait(1200); }
  const saved = await C(() => (window.__copper.S.config.bindings || []).find(b => b.device_id === '9' && b.button_number === 0 && b.gesture === 'double'));
  check('the press is set to switch the PC screen', !!saved && JSON.stringify(saved.actions) === JSON.stringify([{ type: 'screen_sync', op: 'toggle' }]), saved);
  const said = await C(() => window.__copper.REM.shortDescribe([{ type: 'screen_sync', op: 'toggle' }]));
  check('and says so in words', said === 'PC screen on or off', said);
  await C(() => { window.__copper.closeSheet && window.__copper.closeSheet(); });
  await go(rooms.with);
  fake({ press: { device_id: '9', button_number: 0, gesture: 'double' } }); await wait(1500);
  r = await row();
  check('a press of it switches the room on', r.on === 'true' && (await syncInfo()).state === 'syncing', { r, s: await syncInfo() });
  fake({ press: { device_id: '9', button_number: 0, gesture: 'double' } }); await wait(1500);
  r = await row();
  check('and again, off', r.on === 'false' && (await syncInfo()).state === 'off', { r, s: await syncInfo() });
  await C(async () => { const c = window.__copper; c.S.config.bindings = c.S.config.bindings.filter(b => !(b.device_id === '9' && b.button_number === 0 && b.gesture === 'double')); await c.data.saveConfig(); });

  // a computer that keeps looking and never hears the Pi: the line says what to type in where
  await page.click('#screen [data-act="sync-toggle"]'); await wait(900);
  fake({ sync: { deaf: true } }); await wait(900);
  r = await row();
  check('a computer that cannot hear the Pi is named, with the address to type in', /Studio Mac can't hear the Pi/.test(r.line) && /192\.168\.1\.20/.test(r.line), r);
  fake({ sync: { deaf: false } }); await wait(600);
  await page.click('#screen [data-act="sync-toggle"]'); await wait(900);

  // a problem is said in the connector's words
  await page.click('#screen [data-act="sync-toggle"]'); await wait(900);
  fake({ sync: { state: 'problem', why: 'this room has no Hue colour lights' } }); await wait(900);
  r = await row();
  check('a problem is said in the line', r.line === 'This room has no Hue colour lights', r);
  fake({ sync: { state: null, why: null } }); await wait(600);

  // a pairing from before screen sync: the bridge's button once more
  fake({ sync: { key: false } }); await wait(900);
  r = await row();
  check('without the streaming key the row offers the Hue bridge again', r.pair && /Connect to the Hue bridge again/.test(r.text), r);
  await page.click('#screen [data-act="sync-pair"]'); await wait(300);
  r = await row();
  check('pressing it says to press the bridge button', /Press the button on the Hue bridge/.test(r.text), r);
  await wait(3500);
  r = await row();
  check('once paired the row is a plain switch again', r && !r.pair && r.on === 'true', r);

  // the positions page: its own page, live, with every light placed, zoned and dimmed by hand
  await go(rooms.with);
  check('the room that follows has a way to its light positions', !!(await page.$('#screen [data-go^="screen/"]')), null);
  await page.click('#screen [data-go^="screen/"]'); await wait(1500);
  check('it opens as a page of its own', /^#screen\//.test(await C(() => location.hash)) && !!(await page.$('.se-page .se-stage .se-screen')), await C(() => location.hash));
  const cfgOf = id => C(id => ((window.__copper.S.config.settings.screen_sync || {}).lights || {})[id] || null, id);
  const dotAt = () => C(() => { const d = document.querySelector('.se-stage .se-dot'); if (!d) return null; const b = d.querySelector('.se-disc').getBoundingClientRect();
    const s = document.querySelector('.se-stage').getBoundingClientRect(); return { id: d.dataset.seid, x: b.left + b.width / 2, y: b.top + b.height / 2, stage: { l: s.left, t: s.top, w: s.width, h: s.height } }; });
  const dot = await dotAt();
  check('the page shows a dot for the colour light', !!dot, dot);
  // live: the page asks to watch, and the screen and the light's colour are painted from what comes back
  await wait(1500);
  const live = await C(() => { const cv = document.querySelector('.se-live'); const px = cv.getContext('2d').getImageData(0, 0, 16, 9).data;
    let lit = 0; for (let i = 0; i < px.length; i += 4) lit += px[i] + px[i + 1] + px[i + 2] > 0 ? 1 : 0;
    const disc = document.querySelector('.se-dot .se-disc').style.background; return { lit, disc, wait: document.querySelector('.se-wait').textContent }; });
  check('the screen is drawn live, and the light in the colour it is sent', live.lit > 100 && !!live.disc && !live.wait, live);
  const mask = await C(() => { const px = document.querySelector('.se-mask').getContext('2d').getImageData(0, 0, 16, 9).data;
    let lo = 255, hi = 0; for (let i = 3; i < px.length; i += 4) { lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); } return { lo, hi }; });
  check('the part of the screen that drives it is lit and the rest dimmed', mask.lo < 20 && mask.hi > 120, mask);
  if (dot) {
    // to two screen-widths' worth right of centre and a little up: snapped, it lands on a cell (1/8 across, 2/9 down)
    const to = { x: dot.stage.l + dot.stage.w * (2.03 + 2.5) / 5, y: dot.stage.t + dot.stage.h * (-0.52 + 2.5) / 5 };
    await page.mouse.move(dot.x, dot.y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(dot.x + (to.x - dot.x) * i / 10, dot.y + (to.y - dot.y) * i / 10); await wait(16); }
    await page.mouse.up(); await wait(1200);
    const at = await cfgOf(dot.id);
    const onCell = v => Math.abs(v - Math.round(v)) < 1e-2;   // kept to three places
    check('dragged, it is kept where it was let go, snapped to the grid', !!at && Math.abs(at.x - 2) < 0.15 && Math.abs(at.y + 0.5) < 0.15 && onCell(at.x * 8) && onCell((at.y + 1) * 4.5), at);
    // snap off: it goes exactly where it is let go
    await page.click('[data-act="se-snap"]'); await wait(500);
    const d2 = await dotAt();
    const to2 = { x: d2.stage.l + d2.stage.w * (1.53 + 2.5) / 5, y: d2.y };
    await page.mouse.move(d2.x, d2.y); await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(d2.x + (to2.x - d2.x) * i / 6, d2.y); await wait(16); }
    await page.mouse.up(); await wait(1200);
    const free = await cfgOf(dot.id);
    check('with Snap off it is not pulled to the grid', !!free && Math.abs(free.x - 1.53) < 0.06 && !onCell(free.x * 8), free);
    await page.click('[data-act="se-snap"]'); await wait(500);
    // brightness
    const range = await C(() => { const r = document.querySelector('input[data-gain]'); if (!r) return null; const b = r.getBoundingClientRect(); return { l: b.left, w: b.width, y: b.top + b.height / 2 }; });
    check('the selected light has a brightness slider', !!range, range);
    if (range) {
      await C(() => { const r = document.querySelector('input[data-gain]'); r.value = '60'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
      await wait(1500);
      const g = await cfgOf(dot.id);
      check('moving it keeps the light at that brightness', !!g && Math.abs(g.gain - 0.6) < 1e-6, g);
      const placed = await C(id => (((window.__copper.S.agent || {}).info || {}).screen_sync.placed || []).find(p => p.id === id), dot.id);
      check('and the connector has it', !!placed && Math.abs(placed.gain - 0.6) < 1e-6, placed);
    }
    // a part of the screen: a preset, then its corner pulled in
    await page.click(`[data-act="se-zone"][data-zone-preset="left"]`); await wait(1200);
    let z = await cfgOf(dot.id);
    check('Left edge gives it the left of the screen', !!z && z.zone && z.zone.x0 === -1 && z.zone.x1 === -0.5 && z.zone.y0 === -1 && z.zone.y1 === 1, z);
    const zone = await C(() => { const e = document.querySelector('.se-zone.sel'); const h = e && e.querySelector('.se-h.se'); if (!h) return null; const b = h.getBoundingClientRect();
      const s = document.querySelector('.se-stage').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, stage: { l: s.left, t: s.top, w: s.width, h: s.height } }; });
    check('its zone is drawn with corners to pull', !!zone, zone);
    if (zone) {
      // the bottom right corner to x -0.25, y 0.33: the nearest cell edges are -0.25 and 1/3
      const tz = { x: zone.stage.l + zone.stage.w * (-0.27 + 2.5) / 5, y: zone.stage.t + zone.stage.h * (0.31 + 2.5) / 5 };
      await page.mouse.move(zone.x, zone.y); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(zone.x + (tz.x - zone.x) * i / 8, zone.y + (tz.y - zone.y) * i / 8); await wait(16); }
      await page.mouse.up(); await wait(1200);
      z = await cfgOf(dot.id);
      check('a corner pulled sizes it, on the grid', !!z && z.zone && Math.abs(z.zone.x1 + 0.25) < 1e-3 && Math.abs(z.zone.y1 - 1 / 3) < 1e-3 && z.zone.x0 === -1 && z.zone.y0 === -1, z);
    }
    const zm = await C(() => { const px = document.querySelector('.se-mask').getContext('2d').getImageData(0, 0, 16, 9).data; return { inside: px[3], outside: px[(8 * 16 + 15) * 4 + 3] }; });
    check('the dimming follows its zone', zm.inside < 20 && zm.outside > 150, zm);
    await page.click(`[data-act="se-zone-auto"]`); await wait(1200);
    z = await cfgOf(dot.id);
    check('Where it stands takes the zone away', !!z && !z.zone && !(await page.$('.se-zone')), z);
    await page.click(`[data-act="se-follow"][data-id="${dot.id}"]`); await wait(900);
    const out = await C(id => ({ cfg: ((window.__copper.S.config.settings.screen_sync || {}).lights || {})[id], cls: document.querySelector(`.se-dot[data-seid="${id}"]`).className }), dot.id);
    check('switched off, it is left out and drawn dim', out.cfg && out.cfg.on === false && /\bout\b/.test(out.cls), out);
    // the same light as a gradient one: a bar in its sections' colours, stretched by its handle, turned round by its switch
    fake({ dev: { [dot.id]: { segments: 7 } } }); await wait(1500);
    await C(() => { window.__copper.render(); }); await wait(500);
    const len = await C(id => { const h = document.querySelector(`.se-len[data-selen="${id}"]`); if (!h) return null; const b = h.getBoundingClientRect();
      const s = document.querySelector('.se-stage').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, stage: { l: s.left, w: s.width } }; }, dot.id);
    check('a gradient light is drawn as a bar with a handle', !!len, len);
    const sws = await C(id => document.querySelectorAll(`[data-sws="${id}"] i`).length, dot.id);
    check('and its seven sections are each shown', sws === 7, sws);
    if (len) {
      const cfgNow = (await cfgOf(dot.id)) || {};
      // pulled in to 0.6 right of its middle: a length of 1.2, snapped to 1.25
      const toX = len.stage.l + len.stage.w * ((cfgNow.x || 0) + 0.6 + 2.5) / 5;
      await page.mouse.move(len.x, len.y); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(len.x + (toX - len.x) * i / 8, len.y); await wait(16); }
      await page.mouse.up(); await wait(1000);
      const after = await cfgOf(dot.id);
      check('its handle sets how much of the screen it takes, in quarters', !!after && typeof after.span === 'number' && after.span === 1.25, after);
      await page.click(`[data-act="se-flip"][data-id="${dot.id}"]`); await wait(900);
      const flipped = await cfgOf(dot.id);
      check('its switch turns it round', !!flipped && flipped.flip === true, flipped);
    }
    fake({ dev: { [dot.id]: { upright: true } } }); await wait(900);
    await C(() => { window.__copper.render(); }); await wait(500);
    const up = await C(id => { const b = document.querySelector(`.se-bar[data-bar="${id}"]`); if (!b) return null; const r = b.getBoundingClientRect(); return { up: b.classList.contains('up'), w: r.width, h: r.height }; }, dot.id);
    check('a standing gradient lamp is an upright bar', !!up && up.up && up.h > up.w * 3, up);
    fake({ dev: { [dot.id]: { upright: false, segments: 1 } } }); await wait(600);
    await page.click(`[data-act="se-light-reset"][data-id="${dot.id}"]`); await wait(900);
    check('Reset this light forgets what was set for it', !(await cfgOf(dot.id)), await cfgOf(dot.id));
    // a computer with two displays: the page offers both, and the one picked goes to it
    fake({ sync: { displays: true } }); await wait(900);
    await C(() => { window.__copper.render(); }); await wait(500);
    const chips = await C(() => [...document.querySelectorAll('[data-act="se-display"]')].map(b => ({ id: b.dataset.id, on: b.getAttribute('aria-pressed') })));
    check('a computer with two displays is offered both, following the main one', chips.length === 2 && chips[0].on === 'true' && chips[1].on === 'false', chips);
    if (chips.length === 2) {
      await page.click('[data-act="se-display"][data-id="2"]'); await wait(1200);
      const picked = await C(() => ({ cfg: (window.__copper.S.config.settings.screen_sync || {}).display, on: document.querySelector('[data-act="se-display"][data-id="2"]').getAttribute('aria-pressed') }));
      check('the display picked is kept for that computer, and shown as followed', !!picked.cfg && picked.cfg.id === '2' && picked.cfg.pc === 'Studio Mac' && picked.on === 'true', picked);
    }
    fake({ sync: { displays: false } }); await wait(600);
    await page.click(`[data-act="se-follow"][data-id="${dot.id}"]`); await wait(900);
    await page.click('[data-act="se-reset"]'); await wait(900);
    const reset = await C(() => (window.__copper.S.config.settings.screen_sync || {}).lights);
    check('Start over forgets every position', reset && Object.keys(reset).length === 0, reset);
    const pageText = await C(() => document.querySelector('.se-page').innerText);
    check('no dashes on the positions page', !/[–—]/.test(pageText), null);
    // wide: the stage and the light's settings side by side
    await page.setViewportSize({ width: 1100, height: 760 }); await C(() => window.scrollTo(0, 0)); await wait(600);
    const side = await C(() => { const a = document.querySelector('.se-left').getBoundingClientRect(), b = document.querySelector('.se-panel').getBoundingClientRect(); return { a: a.right, b: b.left, top: Math.abs(a.top - b.top) }; });
    check('in a wide window the stage and the settings sit side by side', side.b >= side.a - 1 && side.top < 80, side);
    await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'positions-wide.png') });
    await page.setViewportSize({ width: 412, height: 915 }); await wait(400);
    await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'positions-phone.png'), fullPage: true });
  }
  // the address an older computer app opens still lands on the page
  await C(id => { location.hash = `room/${id}/screen`; }, rooms.with); await wait(1500);
  check('the old address goes to the positions page', (await C(() => location.hash)) === `#screen/${rooms.with}` && !!(await page.$('.se-page')), await C(() => location.hash));
  await go(rooms.with);

  const text = await C(() => document.querySelector('#screen').innerText);
  check('no dashes in what it says', !/[\u2013\u2014]/.test(text), null);
  // put the house back for the tests after this one
  await C(async () => { const c = window.__copper; c.S.config.settings.screen_sync = { room: null }; await c.data.saveConfig(); });
  fake({ sync: { pc: false, off: false, paused: false } }); await wait(600);
  check('no errors', errors.length === 0, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
