// M10 · Opening a room: a room card on Rooms opens into its room page as one piece (web/ui/roomopen.js), and Back
// closes it into the card again. Read off the running app frame by frame: where the photograph's window is, where
// the title is, what the old list is doing, and that nothing is left behind. Screenshots are taken with every
// animation paused at a moment, so they show exactly that moment.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
// screenshots go into the test's own directory, and into SHOTS as well when it is set
const SHOTS = process.env.SHOTS || '';

// In the page: a clock that can be stopped (every animation paused, and the clock with it), and a sample of the
// transition's parts on every frame it runs.
function instrument() {
  const M = window.__m10 = { t0: 0, off: 0, pausedAt: 0, frames: [], stops: [], stopped: null, on: false };
  M.now = () => (M.pausedAt || performance.now()) - M.t0 - M.off;
  // only what is playing is paused, and only that is played again (play() on a finished animation starts it over)
  M.stop = () => { M.pausedAt = performance.now(); M.held = document.getAnimations().filter(a => a.playState === 'running'); for (const a of M.held) a.pause(); };
  M.go = () => { M.off += performance.now() - M.pausedAt; M.pausedAt = 0; M.stopped = null; for (const a of M.held || []) if (a.playState === 'paused') a.play(); M.held = []; };
  const rect = r => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) });
  // the photograph's window: its box, transformed, less its clip (inset() in its own pixels)
  const win = el => {
    const b = el.getBoundingClientRect(); const s = b.width / el.offsetWidth;
    const cp = getComputedStyle(el).clipPath;
    const n = (/inset\(([^)]*?)(?: round|\))/.exec(cp) || [null, '0px'])[1].trim().split(/\s+/).map(parseFloat);
    const [t, r, bo, l] = [n[0], n[1] ?? n[0], n[2] ?? n[0], n[3] ?? n[1] ?? n[0]];
    return rect({ left: b.left + l * s, top: b.top + t * s, right: b.right - r * s, bottom: b.bottom - bo * s, width: b.width - (l + r) * s, height: b.height - (t + bo) * s });
  };
  const words = el => { const g = document.createRange(); g.selectNodeContents(el); return rect(g.getBoundingClientRect()); };
  const tick = () => {
    if (M.on && !M.pausedAt) {
      const t = M.now();
      const hero = document.querySelector('.page-ghost .room-photo-card') || document.querySelector('#screen .room-photo-card');
      const h1 = document.querySelector('.page-ghost .room-title h1') || document.querySelector('#screen .room-title h1');
      const img = hero && hero.querySelector('.room-photo');
      const shade = document.querySelector('.m10-shade');
      const copy = document.querySelector('.m10-top span');
      const list = [...document.querySelectorAll('.page-ghost .rooms-list > *, #screen .rooms-list > *')].filter(k => k.style.visibility !== 'hidden');
      // the window's own clock: how far into the transition this frame is, or null once it has landed
      const wa = hero && hero.getAnimations().find(a => a.effect.getKeyframes().some(k => k.clipPath));
      M.frames.push({
        t: Math.round(t), at: wa && wa.playState !== 'finished' && wa.currentTime != null ? Math.round(wa.currentTime) : null, win: hero ? win(hero) : null, img: img ? rect(img.getBoundingClientRect()) : null,
        shade: shade ? rect(shade.getBoundingClientRect()) : null, shadeo: shade ? Number(getComputedStyle(shade).opacity) : null, h1: h1 ? words(h1) : null, h1o: h1 ? Number(getComputedStyle(h1).opacity) : null,
        copyo: copy ? Number(getComputedStyle(copy).opacity) : null, ghost: !!document.querySelector('.page-ghost'),
        list: list.map(k => Number(getComputedStyle(k).opacity)).filter(o => o > 0 && o < 1).length,
      });
      // the moments to stop at are counted on the transition's own clock: set from its window's animation on every
      // frame that it runs, so a stop for a screenshot never shifts the next one
      const f = M.frames[M.frames.length - 1];
      if (f.at) M.T = t - f.at;
      if (M.stops.length && M.T != null && t - M.T >= M.stops[0]) { M.stopped = M.stops.shift(); M.stop(); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener('click', () => { if (M.armed) { M.armed = false; M.t0 = performance.now(); M.off = 0; M.frames = []; M.on = true; } }, true);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, deviceScaleFactor: 1, ...opts });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
    await ctx.addInitScript(instrument);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|woff2|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    return { ctx, page };
  };
  const root = `http://127.0.0.1:${PORT}/ui/`;
  const { ctx, page } = await open();
  const C = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  const shot = async name => {
    await page.screenshot({ path: `${name}.png` });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.copyFileSync(`${name}.png`, path.join(SHOTS, `${name}.png`)); }
  };
  // run a tap (or a Back) with the clock armed, stopping at each moment for a screenshot, then let it finish
  const play = async (act, stops, prefix) => {
    await C(s => { const M = window.__m10; M.stops = s.slice(); M.armed = true; M.on = false; M.T = null; }, stops);
    await act();
    for (const s of stops) {
      await page.waitForFunction(x => window.__m10.stopped === x, s, { timeout: 5000 });
      await shot(`${prefix}-${String(s).padStart(4, '0')}`);
      await C(() => window.__m10.go());
    }
    await wait(1500);
    return C(() => { const M = window.__m10; M.on = false; return M.frames; });
  };
  const near = (a, b, tol) => !!a && !!b && ['l', 't', 'r', 'b'].every(k => Math.abs(a[k] - b[k]) <= tol);
  const mid = r => ({ x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 });
  const dist = (a, b) => Math.round(Math.hypot(mid(a).x - mid(b).x, mid(a).y - mid(b).y));

  await page.goto(root + '#home'); await ready(); await wait(1200);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });

  // the room this opens: a lit one in the middle of the list, given a photograph (a drawn one, with a grid on it so
  // a rescale or a jump would show)
  await C(() => { location.hash = 'rooms'; }); await wait(900);
  const rooms = await C(() => [...document.querySelectorAll('#screen .room-big')].map(el => el.dataset.go.slice(5)));
  check('Rooms lists enough rooms to have some above and below', rooms.length >= 3, rooms);
  const aid = rooms[Math.floor(rooms.length / 2)];
  const plainAid = rooms.find(x => x !== aid);
  await C(async a => {
    const c = window.__copper;
    await c.run({ type: 'level', target: `a:${a}`, level: 70 });
    const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 750;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 1000, 750); grd.addColorStop(0, '#6b4a33'); grd.addColorStop(0.5, '#c89b6d'); grd.addColorStop(1, '#2d3b4f');
    g.fillStyle = grd; g.fillRect(0, 0, 1000, 750);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3;
    for (let x = 0; x <= 1000; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 750); g.stroke(); }
    for (let y = 0; y <= 750; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(1000, y); g.stroke(); }
    g.fillStyle = '#f4e3c8'; g.beginPath(); g.arc(700, 260, 90, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1b1b'; g.fillRect(120, 420, 380, 200);
    const url = cv.toDataURL('image/jpeg', 0.8);
    const out = await c.data.api(`/api/roomphoto/${encodeURIComponent(a)}`, { method: 'PUT', body: JSON.stringify({ data: url }) });
    c.data.appRoom(a).photo = String(out.stamp);
    await c.save('', { quiet: true });
  }, aid);
  await wait(1500);
  const card = `#screen .room-big[data-go="room/${aid}"]`;
  // scroll so the card sits in the middle of the screen, with Rooms scrolled
  await C(s => { const el = document.querySelector(s); window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 330); }, card);
  await wait(500);
  const y0 = await C(() => window.scrollY);
  const n0 = await C(() => history.state && history.state.n);
  const before = await C(s => {
    const el = document.querySelector(s); const b = el.getBoundingClientRect(); const nm = el.querySelector('.nm').getBoundingClientRect();
    const r = x => ({ l: Math.round(x.left), t: Math.round(x.top), r: Math.round(x.right), b: Math.round(x.bottom) });
    return { card: r(b), label: r(nm), photo: !!el.querySelector('.room-photo') };
  }, card);
  check('the card shows the room\'s photograph and Rooms is scrolled', before.photo && y0 > 50, { y0, photo: before.photo });

  await shot('m10-rooms-before');
  // ---- the press: 0.97 while the finger is down
  const cb = await page.locator(card).boundingBox();
  const px = cb.x + cb.width * 0.35, py = cb.y + cb.height * 0.3;
  await page.mouse.move(px, py); await page.mouse.down(); await wait(250);
  const pressed = await C(s => new DOMMatrix(getComputedStyle(document.querySelector(s)).transform).a, card);
  check('the card presses to 0.97 while the finger is down', Math.abs(pressed - 0.97) < 0.006, pressed);

  // ---- open
  const frames = await play(async () => { await page.mouse.up(); }, [0, 60, 150, 250, 400, 540, 600, 800, 1200], 'm10-open');
  const hero = await C(() => { const h = document.querySelector('#screen .room-photo-card').getBoundingClientRect(); return { l: Math.round(h.left), t: Math.round(h.top), r: Math.round(h.right), b: Math.round(h.bottom) }; });
  // times below are the window's own (the transition's T), read off its animation on every frame
  const flightF = frames.filter(f => f.at != null && f.win);
  const f0 = flightF[0], fEnd = flightF[flightF.length - 1];
  const rest = frames.find(f => f.at == null && f.win && fEnd && f.t > fEnd.t);
  check('the room opened', (await C(() => location.hash)) === `#room/${aid}`, await C(() => location.hash));
  check('one step in the history for one tap', (await C(() => history.state.n)) === n0 + 1, await C(() => history.state.n));
  check('the window starts on the card', f0 && f0.at <= 40 && near(f0.win, before.card, 6), { first: f0 && f0.win, at: f0 && f0.at, card: before.card });
  check('and ends on the room\'s photograph', fEnd && fEnd.at >= 500 && near(fEnd.win, hero, 4) && near(rest && rest.win, hero, 1), { end: fEnd && fEnd.win, at: fEnd && fEnd.at, rest: rest && rest.win, hero });
  const midWin = flightF.filter(f => f.at > 40 && f.at < 500);
  check('in between it grows from one to the other', midWin.length > 3 && midWin.every(f => f.win.h >= before.card.b - before.card.t - 8 && f.win.h <= hero.b - hero.t + 2) && midWin.every((f, i) => !i || f.win.h >= midWin[i - 1].win.h - 1), midWin.map(f => f.win.h));
  const imgs = frames.filter(f => f.img && (f.at != null || f === rest));
  const imgW = imgs.map(f => f.img.w), imgH = imgs.map(f => f.img.h);
  check('the photograph inside never rescales (beyond letting go of the 0.97 press)', imgs.length > 5 && Math.min(...imgW) >= Math.max(...imgW) * 0.965 && Math.min(...imgH) >= Math.max(...imgH) * 0.965, { w: [Math.min(...imgW), Math.max(...imgW)] });
  const steps = imgs.slice(1).map((f, i) => Math.abs(mid(f.img).y - mid(imgs[i].img).y));
  check('and never jumps, landing included (no frame moves it more than 40 px, the last under 3)', Math.max(...steps) < 40 && steps[steps.length - 1] < 3, { most: Math.max(...steps), last: steps[steps.length - 1] });
  const shaded = frames.filter(f => f.shade && f.win && f.at != null && f.at < 300);
  check('the card\'s shade stays on the window\'s bottom edge', shaded.length > 2 && shaded.every(f => Math.abs(f.shade.b - f.win.b) <= 2), shaded.slice(0, 4).map(f => [f.shade.b, f.win.b]));
  check('and has faded by 0.3 s', frames.filter(f => f.at != null && f.at > 305).every(f => !f.shade || f.shadeo < 0.01), frames.filter(f => f.shade && f.at > 280).map(f => [f.at, f.shadeo]).slice(0, 4));
  const h0 = f0;
  check('the title starts at the card\'s label, width matched', h0 && h0.h1 && dist(h0.h1, before.label) <= 6 && Math.abs(h0.h1.w - (before.label.r - before.label.l)) <= 8, { h1: h0 && h0.h1, label: before.label });
  const h1Rest = await C(() => { const g = document.createRange(); g.selectNodeContents(document.querySelector('#screen .room-title h1')); const r = g.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; });
  check('and ends where it rests', fEnd && near(fEnd.h1, h1Rest, 4), { end: fEnd && fEnd.h1, rest: h1Rest });
  const ghosted = frames.filter(f => f.at != null && f.at > 160 && (f.copyo > 0.02 || f.h1o < 0.98));
  check('the label and the title cross only in the first 0.15 s', ghosted.length === 0, ghosted.slice(0, 3).map(f => [f.at, f.copyo, f.h1o]));
  const away = frames.filter(f => f.at != null && f.at > 30 && f.at < 300);
  check('the old list is animating away under the room', away.some(f => f.ghost && f.list >= 2), away.map(f => [f.at, f.ghost, f.list]).slice(0, 6));
  check('and is gone when done, with nothing of the transition left', !(await page.$('.page-ghost, .m10-top, .m10-spill, .m10-shade, .m10-glows, .m10-veil')), await C(() => [...document.querySelectorAll('.page-ghost, [class^="m10"]')].map(e => e.className)));
  check('the room starts at the top', (await C(() => window.scrollY)) === 0, await C(() => window.scrollY));

  // ---- fully usable after: nothing over it, its buttons answer, and a sheet over it is a sheet, not this
  const clear = await C(() => ['.room-acts [data-act="room-off"]', '.hdr-btn.back', '.room-grid .tile'].map(s => { const e = document.querySelector('#screen ' + s); if (!e) return s + ' missing'; const b = e.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e.contains(hit) ? 'ok' : `${s} covered by ${hit && hit.className}`; }));
  check('everything on the room is where a finger finds it', clear.every(x => x === 'ok'), clear);
  await page.click('#screen .room-acts [data-act="room-off"]'); await wait(1200);
  check('All off answers', (await C(() => document.querySelectorAll('#screen .room-grid .tile.on').length)) === 0, await C(() => document.querySelectorAll('#screen .room-grid .tile.on').length));
  await page.click('#screen .room-acts [data-act="room-on"]'); await wait(1200);
  check('All on answers', (await C(() => document.querySelectorAll('#screen .room-grid .tile.on').length)) > 0);
  await page.click('#screen .hdr-btn.a1'); await wait(700);
  check('room setup opens as a sheet over the room, not a page', (await C(() => location.hash)) === `#room/${aid}/setup` && !!(await page.$('#sheet-root .sheet')) && !(await page.$('.page-ghost, .m10-top')), await C(() => location.hash));
  await C(() => history.back()); await wait(700);
  check('and closes back to the room', (await C(() => location.hash)) === `#room/${aid}` && !(await page.$('#sheet-root .sheet')));

  // ---- back: the reverse
  // the room scrolled a little first, so the window closes from where the photograph is on screen
  await C(() => window.scrollTo(0, 60)); await wait(300);
  const heroNow = await C(() => { const h = document.querySelector('#screen .room-photo-card').getBoundingClientRect(); return { l: Math.round(h.left), t: Math.round(h.top), r: Math.round(h.right), b: Math.round(h.bottom) }; });
  const bframes = await play(() => C(() => document.querySelector('#screen .hdr-btn.back').click()), [0, 60, 150, 300, 400, 440, 470], 'm10-back');
  const cardNow = await C(s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }, card);
  const backF = bframes.filter(f => f.at != null && f.win && f.ghost);
  const b0 = backF[0], bEnd = backF[backF.length - 1];
  await shot('m10-back-after');
  check('Back returns to Rooms', (await C(() => location.hash)) === '#rooms', await C(() => location.hash));
  check('Rooms is back where it was scrolled', Math.abs((await C(() => window.scrollY)) - y0) <= 2, { now: await C(() => window.scrollY), was: y0 });
  check('the window starts on the photograph, where the room was scrolled', b0 && b0.at <= 40 && near(b0.win, heroNow, 4), { first: b0 && b0.win, at: b0 && b0.at, hero: heroNow });
  check('and closes into the card', bEnd && bEnd.at >= 410 && near(bEnd.win, cardNow, 4), { end: bEnd && bEnd.win, at: bEnd && bEnd.at, card: cardNow });
  check('the title shrinks back into the label', bEnd && dist(bEnd.h1, before.label) <= 6, { h1: bEnd && bEnd.h1, label: before.label });
  check('the list returns', bframes.some(f => f.at != null && f.at > 30 && f.at < 400 && f.list >= 2), bframes.map(f => [f.at, f.list]).slice(0, 8));
  const bghost = backF.filter(f => f.at < 290 && f.h1 && (f.copyo > 0.02 || f.h1o < 0.98));
  check('the label and the title cross only in the last 0.15 s', bghost.length === 0, bghost.slice(0, 3).map(f => [f.at, f.copyo, f.h1o]));
  check('nothing of it is left, and the card is itself again', !(await page.$('.page-ghost, .m10-top, .m10-spill')) && (await C(s => getComputedStyle(document.querySelector(s)).visibility, card)) === 'visible');

  // ---- a double tap opens once
  const n1 = await C(() => history.state.n);
  await C(s => { const el = document.querySelector(s); el.click(); el.click(); }, card);
  await wait(120);
  await C(() => { const el = document.querySelector('#screen .room-photo-card, #screen .room-big'); if (el) el.click(); });
  await wait(1200);
  check('a second tap in flight does not navigate again', (await C(() => history.state.n)) === n1 + 1 && (await C(() => location.hash)) === `#room/${aid}`, { n: await C(() => history.state.n), n1, hash: await C(() => location.hash) });
  // the browser's own Back (Android's too) closes it the same way
  await C(() => history.back()); await wait(80);
  check('the browser\'s Back closes it into the card too', !!(await page.$('.page-ghost .room-photo-card')) && !!(await page.$('.m10-top')));
  await wait(1000);
  check('and lands on Rooms, scrolled where it was', (await C(() => location.hash)) === '#rooms' && Math.abs((await C(() => window.scrollY)) - y0) <= 2);
  // and so does the tab bar's Rooms, which steps back to Rooms rather than stacking another
  await C(s => document.querySelector(s).click(), card); await wait(1200);
  const n2 = await C(() => history.state.n);
  await C(() => document.querySelector('#tabs [data-go="rooms"]').click()); await wait(120);
  check('the Rooms tab closes it into the card too', !!(await page.$('.page-ghost .room-photo-card')) && !!(await page.$('.m10-top')));
  await wait(1000);
  check('and lands on Rooms, one step down, scrolled where it was', (await C(() => location.hash)) === '#rooms' && (await C(() => history.state.n)) === n2 - 1 && Math.abs((await C(() => window.scrollY)) - y0) <= 2, { hash: await C(() => location.hash), n: await C(() => history.state.n), n2, y: await C(() => window.scrollY), y0 });

  // ---- a room with no photograph opens the same way, its drawn room carried across
  const pcard = `#screen .room-big[data-go="room/${plainAid}"]`;
  await C(s => document.querySelector(s).scrollIntoView({ block: 'center' }), pcard); await wait(400);
  const pbefore = await C(s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }, pcard);
  const pframes = await play(async () => { await page.click(pcard); }, [40, 180, 540, 1000], 'm10-plain');
  const pf0 = pframes.find(f => f.at != null && f.win && f.ghost);
  check('a room with no photograph opens from its card', near(pf0 && pf0.win, pbefore, 6) && (await C(() => location.hash)) === `#room/${plainAid}`, { first: pf0 && pf0.win, card: pbefore });
  await page.click('#screen .hdr-btn.back'); await wait(1200);

  // ---- reached another way it is the plain push
  await C(a => { location.hash = `room/${a}`; }, aid); await wait(60);
  const plain = await C(() => ({ m10: !!document.querySelector('.m10-top'), push: document.getAnimations().some(a => { const k = a.effect.getKeyframes(); return /translateX\(24px\)/.test((k[0] && k[0].transform) || ''); }) }));
  check('a room reached by its address comes in with the plain push', !plain.m10 && plain.push, plain);
  await wait(800);
  await C(() => history.back()); await wait(900);
  check('and goes back with the plain back (it was not opened from its card)', (await C(() => location.hash)) === '#rooms');

  // put the room back as it was: no photograph
  await C(async a => { const c = window.__copper; await c.data.api(`/api/roomphoto/${encodeURIComponent(a)}`, { method: 'DELETE' }); c.data.appRoom(a).photo = null; await c.save('', { quiet: true }); }, aid);
  check('no errors on the page', !errors.length, errors);
  await ctx.close();

  // ---- reduced motion: the room simply arrives
  const rm = await open({ reducedMotion: 'reduce' });
  const P = rm.page;
  await P.goto(root + '#rooms'); await P.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  await P.click(`#screen .room-big[data-go="room/${aid}"]`); await wait(40);
  const r1 = await P.evaluate(() => ({ hash: location.hash, ghost: !!document.querySelector('.page-ghost'), m10: !!document.querySelector('.m10-top, .m10-spill'), anims: document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations !== Infinity && !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).length }));
  check('reduced motion: the room arrives with no shared transition and nothing moving', r1.hash === `#room/${aid}` && !r1.ghost && !r1.m10 && r1.anims === 0, r1);
  await P.click('#screen .hdr-btn.back'); await wait(60);
  const r2 = await P.evaluate(() => ({ hash: location.hash, ghost: !!document.querySelector('.page-ghost'), m10: !!document.querySelector('.m10-top, .m10-spill') }));
  check('reduced motion: and Back is the plain back', r2.hash === '#rooms' && !r2.ghost && !r2.m10, r2);
  check('no errors on the page (reduced motion)', !errors.length, errors);
  await rm.ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
