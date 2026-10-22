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

  // the positions page: drag a light to where it stands, leave one out, start over
  await go(rooms.with);
  check('the room that follows has a way to its light positions', !!(await page.$('#screen [data-go$="/screen"]')), null);
  await page.click('#screen [data-go$="/screen"]'); await wait(1200);
  const dot = await C(() => { const d = document.querySelector('.ss-stage .ss-dot'); if (!d) return null; const b = d.querySelector('.ss-disc').getBoundingClientRect();
    const s = document.querySelector('.ss-stage').getBoundingClientRect(); return { id: d.dataset.ssid, x: b.left + b.width / 2, y: b.top + b.height / 2, stage: { l: s.left, t: s.top, w: s.width, h: s.height } }; });
  check('the page shows the screen and a dot for the colour light', !!dot && !!(await page.$('.ss-stage .ss-screen')), dot);
  if (dot) {
    // to two screen-widths' worth right of centre and a little up: x 2, y -0.5 in screen units (the page spans 2.5)
    const to = { x: dot.stage.l + dot.stage.w * (2 + 2.5) / 5, y: dot.stage.t + dot.stage.h * (-0.5 + 2.5) / 5 };
    await page.mouse.move(dot.x, dot.y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(dot.x + (to.x - dot.x) * i / 10, dot.y + (to.y - dot.y) * i / 10); await wait(16); }
    await page.mouse.up(); await wait(1200);
    const at = await C(id => ((window.__copper.S.config.settings.screen_sync || {}).lights || {})[id], dot.id);
    check('dragged, it is kept where it was let go', !!at && Math.abs(at.x - 2) < 0.15 && Math.abs(at.y + 0.5) < 0.15, at);
    check('the sheet stayed open through the drag', !!(await page.$('.ss-stage')), null);
    await page.click(`[data-act="ss-light"][data-id="${dot.id}"]`); await wait(900);
    const out = await C(id => ({ cfg: ((window.__copper.S.config.settings.screen_sync || {}).lights || {})[id], cls: document.querySelector(`.ss-dot[data-ssid="${id}"]`).className }), dot.id);
    check('switched off below, it is left out and drawn dim', out.cfg && out.cfg.on === false && /\bout\b/.test(out.cls), out);
    // the same light as a gradient one: a bar, stretched by its handle, and turned round by Flip
    fake({ dev: { [dot.id]: { segments: 7 } } }); await wait(900);
    await C(() => { window.__copper.render(); }); await wait(500);
    const len = await C(id => { const h = document.querySelector(`.ss-len[data-sslen="${id}"]`); if (!h) return null; const b = h.getBoundingClientRect();
      const s = document.querySelector('.ss-stage').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, stage: { l: s.left, w: s.width } }; }, dot.id);
    check('a gradient light is drawn as a bar with a handle', !!len, len);
    if (len) {
      const cfgNow = await C(id => ((window.__copper.S.config.settings.screen_sync || {}).lights || {})[id] || {}, dot.id);
      // its middle is where it was dragged (x 2): pull the handle to x 3.2 for a length of 2.4
      const toX = len.stage.l + len.stage.w * (Math.min(2.5, (cfgNow.x || 0) + 1.2) + 2.5) / 5;
      await page.mouse.move(len.x, len.y); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(len.x + (toX - len.x) * i / 8, len.y); await wait(16); }
      await page.mouse.up(); await wait(1000);
      const after = await C(id => ((window.__copper.S.config.settings.screen_sync || {}).lights || {})[id], dot.id);
      check('its handle sets how much of the screen it takes', !!after && typeof after.span === 'number' && after.span > 0.4 && after.span < 2.6, after);
      await page.click(`[data-act="ss-flip"][data-id="${dot.id}"]`); await wait(900);
      const flipped = await C(id => ((window.__copper.S.config.settings.screen_sync || {}).lights || {})[id], dot.id);
      check('Flip turns it round', !!flipped && flipped.flip === true, flipped);
    }
    await page.click('[data-act="ss-reset"]'); await wait(900);
    const reset = await C(() => (window.__copper.S.config.settings.screen_sync || {}).lights);
    check('Start over forgets every position', reset && Object.keys(reset).length === 0, reset);
  }
  await C(() => { window.__copper.closeSheet && window.__copper.closeSheet(); }); await wait(500);
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
