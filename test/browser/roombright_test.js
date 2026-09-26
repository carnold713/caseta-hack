// A room's brightness, on its own page: Home's house bar under the room's picture (room.js brightHTML).
//
//   it moves the room's dimmable lights that are on, all to the one level, and the level beside it follows the finger
//   with the room dark, a drag brings its lights up to where the finger is (a drag, never a tap, turns a room on)
//   off, it rests empty and says Off; a room with nothing to dim has no bar
//   it arrives with the room when the room opens from its card
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`http://127.0.0.1:${PORT}/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.solid'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(900);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });

  // a room with two or more dimmable lights, and what they were
  const aid = await C(() => { const c = window.__copper; const a = c.data.areas().filter(x => c.H.roomLights(x.id).filter(d => d.domain === 'light').length >= 2)[0]; return a && a.id; });
  check('a room with dimmable lights', !!aid, aid);
  const ids = await C(id => window.__copper.H.roomLights(id).filter(d => d.domain === 'light').map(d => d.device_id), aid);
  const was = await C(ids => ids.map(id => window.__copper.data.level(id) || 0), ids);
  const levels = () => C(ids => ids.map(id => window.__copper.data.level(id) || 0), ids);
  const setAll = lvs => C(([ids, lvs]) => Promise.all(ids.map((id, i) => window.__copper.run({ type: 'level', target: `d:${id}`, level: lvs[i] || 'off' }))), [ids, lvs]);
  await C(() => { const c = window.__copper; window.__lv = []; const l = c.gate.sendLevel; c.gate.sendLevel = (...a) => { window.__lv.push(a); return l(...a); }; });
  // a finger along the bar, from one share of it to another
  const drag = async (from, to) => {
    const b = await C(() => { const r = document.querySelector('.room-bright .hbar').getBoundingClientRect(); return [r.left, r.top + r.height / 2, r.width]; });
    const fire = (t, x) => C(([t, x, y]) => document.querySelector('.room-bright .hbar').dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 })), [t, x, b[1]]);
    const x0 = b[0] + b[2] * from - 28, x1 = b[0] + b[2] * to - 28;
    await fire('pointerdown', x0);
    for (let i = 1; i <= 10; i++) { await fire('pointermove', x0 + (x1 - x0) * i / 10); await wait(20); }
    const during = await C(() => document.querySelector('[data-rblv]').textContent);
    await fire('pointerup', x1); await wait(1200);
    return during;
  };

  // ---- lit: one light at 70, the other off
  await setAll([70, 0]); await wait(1200);
  await C(id => { location.hash = `room/${id}`; }, aid); await wait(1200);
  const lit = await C(() => { const b = document.querySelector('.room-bright'); const p = document.querySelector('.room-photo-card').getBoundingClientRect(); const r = b && b.getBoundingClientRect(); return b ? { off: b.classList.contains('off'), lv: b.querySelector('[data-rblv]').textContent, gap: Math.round(r.top - p.bottom), w: Math.round(r.width), bar: Math.round(b.querySelector('.hbar').getBoundingClientRect().height) } : null; });
  check('the room has a brightness bar 16 under its picture, the width of the page, Home\'s 56 tall bar', lit && !lit.off && lit.gap === 16 && lit.w === 372 && lit.bar === 56, lit);
  check('beside it, the room\'s level: the mean of the lights that are on (70%)', lit && lit.lv === '70%', lit);
  const during = await drag(0.7, 0.3);
  check('the level beside the bar follows the finger', during === '30%', during);
  const sent = await C(() => window.__lv.slice(-1)[0]);
  let lv = await levels();
  check('the drag moves the lights that are on, to where the finger is; the one that was off stays off', sent && sent[1] === 30 && sent[0].length === 1 && lv[0] === 30 && lv[1] === 0, { sent, lv });

  // ---- off: the bar rests empty and says nothing (the Off pill has), and a drag brings the room up
  // (after the 1.5 s this phone holds its own level against the bridge's echoes, data.hold)
  await wait(800);
  await setAll([0, 0]); await wait(1400);
  const off = await C(() => { const b = document.querySelector('.room-bright'); return { off: b.classList.contains('off'), lv: b.querySelector('[data-rblv]').textContent, now: b.querySelector('.hbar').getAttribute('aria-valuenow') }; });
  check('with the room off the bar rests empty, with no words beside it', off.off && off.lv === '' && off.now === '0', off);
  await C(() => { window.__lv = []; });
  await drag(0.1, 0.5);
  lv = await levels();
  check('a drag on a dark room brings all its dimmable lights up to where the finger is', lv.every(v => v === 50), lv);

  // ---- a tap does not turn it on
  await wait(800);
  await setAll([0, 0]); await wait(1400);
  await C(() => { window.__lv = []; });
  await C(() => { const el = document.querySelector('.room-bright .hbar'); const r = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, pointerId: 10, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width * 0.6, clientY: r.top + 28, button: 0 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); el.click(); });
  await wait(800);
  check('a tap on the bar of a dark room turns nothing on', !(await C(() => window.__lv.length)) && (await levels()).every(v => v === 0), await C(() => window.__lv));

  // ---- it arrives with the room when the room opens from its card
  await setAll([60, 60]); await wait(1200);
  await C(() => { location.hash = 'rooms'; }); await wait(1200);
  await C(id => { const el = document.querySelector(`.room-big[data-go="room/${id}"]`); el.scrollIntoView({ block: 'center' }); }, aid); await wait(400);
  await page.click(`.room-big[data-go="room/${aid}"] .nm`);
  await wait(120);
  const arrive = await C(() => { const b = document.querySelector('#screen .room > .room-bright'); return b ? b.getAnimations().map(a => Math.round(a.effect.getTiming().delay)) : null; });
  check('opening the room, the bar rises in with the room\'s parts (M10)', arrive && arrive.some(d => d > 0), arrive);
  await wait(1500);

  // put the lights back
  await setAll(was); await wait(800);
  check('no errors on the page', !errors.length, errors);
  await ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
