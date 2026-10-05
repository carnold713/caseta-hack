// On and Off dragged like a switch (onoffdrag.js): the room's, a light's and a fan's.
//
//   a finger pulls the pill from one half to the other and it follows the finger; the labels change as it crosses the
//   middle; let go there, it is that half's tap
//   let go short of the middle, it slides home and nothing changes; a quick flick goes the way it was flicked
//   an up or down swipe that starts on it scrolls the page and switches nothing; a tap on a half is still that half's
//   a mouse dragging it across switches once, not once for the drag and again for the click that ends it
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
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

  // every command the app sends, counted
  await C(() => { const c = window.__copper; window.__sent = []; const run = c.run; c.run = (...a) => { window.__sent.push(a[0]); return run(...a); }; const t = c.turn; c.turn = (...a) => { window.__sent.push(a[0]); return t(...a); }; });
  const sentSince = n => C(n => window.__sent.length - n, n);
  const sentNow = () => C(() => window.__sent.length);

  // the switch on show: where each half is, where the pill is, and what the halves say
  const sw = () => C(() => {
    const box = document.querySelector('#screen .onoff'); if (!box) return null;
    const [on, off] = box.querySelectorAll(':scope > button'); const p = box.querySelector('.onoff-pill');
    const r = e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left }; };
    return { on: r(on), off: r(off), pill: r(p), pillOff: p.classList.contains('off'), onPressed: on.getAttribute('aria-pressed'), offPressed: off.getAttribute('aria-pressed') };
  });
  // a finger from one point to another in `n` steps `ms` apart, lifted after `hold` ms still
  const drag = async (x0, y0, x1, y1, { n = 12, ms = 16, hold = 120, mid } = {}) => {
    await touch('touchStart', x0, y0);
    let seen = null;
    for (let i = 1; i <= n; i++) {
      await touch('touchMove', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await wait(ms);
      if (mid && i === Math.round(n * mid)) seen = await sw();
    }
    await wait(hold);
    await touch('touchEnd');
    return seen;
  };

  // ---- a room: the first with a dimmable light, dark to start
  const aid = await C(() => { const c = window.__copper; const a = c.data.areas().find(x => c.H.roomLights(x.id).some(d => d.domain === 'light')); return a && a.id; });
  check('a room with a light', !!aid, aid);
  // on, as the switch counts it: anything in the room on, its fan too
  const roomOn = () => C(id => { const c = window.__copper; return c.data.controllable().some(d => c.data.devArea(d) === id && c.data.isOn(d.device_id)); }, aid);
  await C(id => window.__copper.turn({ type: 'level', target: `a:${id}`, level: 'off' }), aid);
  await wait(1000);
  await C(id => { location.hash = `room/${id}`; }, aid); await wait(1500);
  let s = await sw();
  check('the room page has its On and Off, the pill under Off', s && s.pillOff, s);

  // Off to On, pulled by the pill
  let n0 = await sentNow();
  let mid = await drag(s.off.x, s.off.y, s.on.x, s.on.y, { mid: 0.75 });
  check('while held past the middle the pill is where the finger is and the halves already say On', mid && Math.abs(mid.pill.x - (s.off.x - (s.off.x - s.on.x) * 0.75)) < 12 && mid.onPressed === 'true' && !mid.pillOff, { mid, s });
  await wait(1200);
  s = await sw();
  check('let go over On, the room comes on and the pill stays under On', (await roomOn()) && !s.pillOff && s.onPressed === 'true', { s, on: await roomOn() });
  check('one command was sent for it', await sentSince(n0) >= 1, await sentSince(n0));

  // short of the middle, slowly: home again, nothing sent
  n0 = await sentNow();
  const quarter = s.on.x + (s.off.x - s.on.x) * 0.3;
  mid = await drag(s.on.x, s.on.y, quarter, s.on.y, { n: 10, ms: 30, hold: 200, mid: 1 });
  check('held short of the middle, the pill follows the finger and the halves still say On', mid && mid.pill.x > s.on.x + 20 && mid.onPressed === 'true', { mid, s });
  await wait(800);
  s = await sw();
  check('let go short of the middle it slides home under On, nothing sent, the room still on', !s.pillOff && Math.abs(s.pill.x - s.on.x) < 2 && await sentSince(n0) === 0 && await roomOn(), { s, sent: await sentSince(n0) });

  // a quick flick toward Off, let go well short of the middle
  n0 = await sentNow();
  // (two steps of 30 px: each step through the test's touch driver takes about 30 ms, so this is a flick of about
  // 1 px a millisecond, a thumb's; the pill is let go at 60 of the 171 to cross)
  await drag(s.on.x, s.on.y, s.on.x + 60, s.on.y, { n: 2, ms: 0, hold: 0 });
  await wait(1200);
  s = await sw();
  check('a quick flick toward Off turns the room off, though let go short of the middle', !(await roomOn()) && s.pillOff, { s, on: await roomOn() });

  // up the page from the switch: a scroll, not a switch
  // (a short room can fit the screen; the page is given room to scroll so the swipe has somewhere to go)
  await C(() => { document.querySelector('#screen').style.paddingBottom = '900px'; });
  n0 = await sentNow();
  const y0 = await C(() => (document.scrollingElement || document.documentElement).scrollTop);
  await drag(s.off.x, s.off.y, s.off.x - 6, s.off.y - 220, { n: 10, ms: 16, hold: 0 });
  await wait(900);
  const y1 = await C(() => (document.scrollingElement || document.documentElement).scrollTop);
  s = await sw();
  check('a swipe up that starts on the switch scrolls the page and switches nothing', y1 > y0 && await sentSince(n0) === 0 && s.pillOff, { y0, y1, sent: await sentSince(n0), s });
  await C(() => { (document.scrollingElement || document.documentElement).scrollTop = 0; document.querySelector('#screen').style.paddingBottom = ''; }); await wait(400);
  s = await sw();

  // a tap is still a tap
  await touch('touchStart', s.on.x, s.on.y); await wait(60); await touch('touchEnd'); await wait(1200);
  s = await sw();
  check('a tap on On still turns the room on', (await roomOn()) && !s.pillOff, { s, on: await roomOn() });

  // a mouse dragging it across: once
  n0 = await sentNow();
  await page.mouse.move(s.on.x, s.on.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(s.on.x + (s.off.x - s.on.x) * i / 12, s.on.y); await wait(16); }
  await wait(120); await page.mouse.up(); await wait(1400);
  s = await sw();
  const cmds = await C(n => window.__sent.slice(n), n0);
  check('a mouse dragging it to Off turns the room off, and the click that ends the drag does not turn it back', !(await roomOn()) && s.pillOff && cmds.length >= 1 && cmds.every(x => x.level === 'off' || x.speed === 'Off'), { s, on: await roomOn(), cmds });

  // ---- a light's own page
  const lid = await C(id => window.__copper.H.roomLights(id).find(d => d.domain === 'light').device_id, aid);
  await C(id => { location.hash = `light/${id}`; }, lid); await wait(1600);
  s = await sw();
  check('the light page has its On and Off, the pill under Off', s && s.pillOff, s);
  await drag(s.off.x, s.off.y, s.on.x, s.on.y);
  await wait(1200);
  check('pulled to On on the light page, the light comes on', await C(id => window.__copper.data.isOn(id), lid), null);
  s = await sw();
  await drag(s.on.x, s.on.y, s.off.x, s.off.y);
  await wait(1200);
  check('and pulled back to Off, it goes off', !(await C(id => window.__copper.data.isOn(id), lid)) && (await sw()).pillOff, await sw());

  // ---- a fan's, the blue switch
  const fid = await C(() => { const f = window.__copper.data.controllable().find(d => d.domain === 'fan'); return f && f.device_id; });
  if (fid) {
    await C(id => window.__copper.run({ type: 'fan', target: `d:${id}`, speed: 'Off' }), fid).catch(() => {});
    await wait(800);
    await C(id => { location.hash = `light/${id}`; }, fid); await wait(1600);
    s = await sw();
    if (s && s.pillOff) {
      await drag(s.off.x, s.off.y, s.on.x, s.on.y);
      await wait(1400);
      check('pulled to On on a fan\'s page, the fan starts', await C(id => window.__copper.data.isOn(id), fid), await sw());
      s = await sw();
      await drag(s.on.x, s.on.y, s.off.x, s.off.y);
      await wait(1400);
      check('and pulled back to Off, it stops', !(await C(id => window.__copper.data.isOn(id), fid)), await sw());
    } else check('the fan page has its On and Off, the pill under Off', false, s);
  }

  check('no errors', errors.length === 0, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
