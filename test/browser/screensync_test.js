// The PC screen row on a room's page (web/ui/screens/screensync.js), against the fake connector's pretend sync.
//
//   no PC seen: no row anywhere; a PC seen: the row is on the page of a room with a Hue colour light, and not on one without
//   switching it on makes this the room that follows; the line under it says what it is doing
//   paused (a light changed by hand) reads as off, and switching it on resumes it in place
//   switching it off stops it following; a pairing without the streaming key offers the Hue bridge's button again
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
  await page.evaluate(() => window.__copper.data.api('/api/screensync', { method: 'POST', body: JSON.stringify({ op: 'pause' }) }));
  await wait(900);
  r = await row();
  check('paused reads as off, and says so', r.on === 'false' && r.line === 'Paused' && (await settingRoom()) === rooms.with, r);
  await page.click('#screen [data-act="sync-toggle"]'); await wait(1200);
  r = await row();
  check('switched on again, it resumes in place', r.on === 'true' && (await syncInfo()).state === 'syncing' && (await settingRoom()) === rooms.with, { r, s: await syncInfo() });

  await page.click('#screen [data-act="sync-toggle"]'); await wait(1200);
  r = await row();
  check('switched off, no room follows', r.on === 'false' && (await settingRoom()) === null, { r, room: await settingRoom() });

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

  const text = await C(() => document.querySelector('#screen').innerText);
  check('no dashes in what it says', !/[\u2013\u2014]/.test(text), null);
  // put the house back for the tests after this one
  await page.click('#screen [data-act="sync-toggle"]'); await wait(800);
  fake({ sync: { pc: false } }); await wait(600);
  check('no errors', errors.length === 0, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
