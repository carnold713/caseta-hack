// M11 · A light opens from its tile: on a room, a tile opens into its light's page as one object (web/ui/lightopen.js)
// and Back closes it into the tile again. Read off the running app frame by frame: where the surface is and how much
// copper is on it, where the title and the level are, what the room is doing, and that nothing is left behind.
// Screenshots are taken with every animation paused at a moment, so they show exactly that moment. The close is also
// driven by a finger (opening.followBack, Android's predictive back): held part way, let go, and taken back.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';

// In the page: a clock that can be stopped, and a sample of the transition's parts on every frame it runs.
function instrument() {
  const M = window.__m11 = { t0: 0, off: 0, pausedAt: 0, frames: [], stops: [], stopped: null, on: false };
  M.now = () => (M.pausedAt || performance.now()) - M.t0 - M.off;
  M.stop = () => { M.pausedAt = performance.now(); M.held = document.getAnimations().filter(a => a.playState === 'running'); for (const a of M.held) a.pause(); };
  M.go = () => { M.off += performance.now() - M.pausedAt; M.pausedAt = 0; M.stopped = null; for (const a of M.held || []) if (a.playState === 'paused') a.play(); M.held = []; };
  const rect = r => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) });
  // the surface: its box, transformed, less its clip (inset() in its own pixels)
  const win = el => {
    const b = el.getBoundingClientRect(); const s = b.width / el.offsetWidth;
    const cp = getComputedStyle(el).clipPath;
    const n = (/inset\(([^)]*?)(?: round|\))/.exec(cp) || [null, '0px'])[1].trim().split(/\s+/).map(parseFloat);
    const [t, r, bo, l] = [n[0], n[1] ?? n[0], n[2] ?? n[0], n[3] ?? n[1] ?? n[0]];
    return rect({ left: b.left + l * s, top: b.top + t * s, right: b.right - r * s, bottom: b.bottom - bo * s, width: b.width - (l + r) * s, height: b.height - (t + bo) * s });
  };
  const words = el => { const g = document.createRange(); g.selectNodeContents(el); return rect(g.getBoundingClientRect()); };
  const op = el => (el ? Number(getComputedStyle(el).opacity) : null);
  M.sample = () => {
    const t = M.now();
    const S = document.querySelector('.m11-surface'), face = document.querySelector('.m11-face');
    const q = s => document.querySelector(`.page-ghost ${s}`) || document.querySelector(`#screen ${s}`);
    const h1 = q('.dev .t-hero'), num = q('.dev .dial .num b'), halo = q('.dev > .onelight');
    const li = halo && halo.querySelector('i'), lr = li && li.getBoundingClientRect();
    const top = document.querySelector('.m11-top');
    const copies = top ? [...top.children].filter(n => !n.matches('.tabbar, .scroll-fade')) : [];
    const name = h1 ? h1.textContent : '';
    const copy = copies.find(n => n.tagName === 'SPAN' && n.textContent === name);
    const pwr = copies.find(n => n.tagName === 'BUTTON');
    const others = copies.filter(n => n !== copy && op(n) > 0.02);
    const list = [...document.querySelectorAll('.page-ghost .room-grid > .tile, .page-ghost .room-title, .page-ghost .room-photo-card, #screen .room-grid > .tile, #screen .room-title, #screen .room-photo-card')]
      .filter(k => k.style.visibility !== 'hidden');
    const sa = S && S.getAnimations().find(a => a.effect.getKeyframes().some(k => k.clipPath));
    const w = S ? win(S) : null;
    const fo = op(face);
    return {
      t: Math.round(t), at: sa && sa.playState !== 'finished' && sa.currentTime != null ? Math.round(sa.currentTime) : null,
      win: w, faceo: fo, facebg: face ? getComputedStyle(face).backgroundImage + ' ' + getComputedStyle(face).backgroundColor : null, copper: w && fo != null ? +(fo * (w.w * w.h) / (innerWidth * innerHeight)).toFixed(3) : 0, cover: w ? +((w.w * w.h) / (innerWidth * innerHeight)).toFixed(3) : 0,
      h1: h1 ? words(h1) : null, h1o: op(h1), num: num ? words(num) : null, numo: op(num), haloo: op(halo), halot: halo ? Number(halo.style.opacity) : null,
      lc: lr ? { x: Math.round(lr.left + lr.width / 2), y: Math.round(lr.top + lr.height / 2), s: +(lr.width / (halo.offsetWidth * 1.2 || 1)).toFixed(3) } : null,
      copyo: op(copy), pwro: op(pwr), others: others.map(n => [n.tagName, n.textContent.slice(0, 12), +op(n).toFixed(2)]),
      ghost: !!document.querySelector('.page-ghost'),
      list: list.map(k => Number(getComputedStyle(k).opacity)).filter(o => o > 0 && o < 1).length,
    };
  };
  const tick = () => {
    if (M.on && !M.pausedAt) {
      const f = M.sample();
      M.frames.push(f);
      if (f.at) M.T = f.t - f.at;
      if (M.stops.length && M.T != null && f.t - M.T >= M.stops[0]) { M.stopped = M.stops.shift(); M.stop(); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  M.arm = () => { M.t0 = performance.now(); M.off = 0; M.frames = []; M.on = true; };
  document.addEventListener('click', () => { if (M.armed) { M.armed = false; M.arm(); } }, true);
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
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
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
  const play = async (act, stops, prefix, { arm = false } = {}) => {
    await C(s => { const M = window.__m11; M.stops = s.slice(); M.armed = true; M.on = false; M.T = null; }, stops);
    if (arm) await C(() => { window.__m11.armed = false; window.__m11.arm(); });
    await act();
    for (const s of stops) {
      await page.waitForFunction(x => window.__m11.stopped === x, s, { timeout: 5000 });
      await shot(`${prefix}-${String(s).padStart(4, '0')}`);
      await C(() => window.__m11.go());
    }
    await wait(1600);
    return C(() => { const M = window.__m11; M.on = false; return M.frames; });
  };
  const near = (a, b, tol) => !!a && !!b && ['l', 't', 'r', 'b'].every(k => Math.abs(a[k] - b[k]) <= tol);
  const mid = r => ({ x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 });
  const dist = (a, b) => Math.round(Math.hypot(mid(a).x - mid(b).x, mid(a).y - mid(b).y));
  const box = s => C(sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }, s);
  const wordsOf = s => C(sel => { const e = document.querySelector(sel); if (!e) return null; const g = document.createRange(); g.selectNodeContents(e); const b = g.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }, s);
  const left = () => C(() => [...document.querySelectorAll('.page-ghost, .m11-top, .m11-surface, .m11-shadow, .op-top')].map(e => e.className));

  await page.goto(root + '#home'); await ready(); await wait(1200);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });

  // the room: the kitchen, given the hall light, the porch switch and the fan as well, so its grid has rows above and
  // below and it scrolls. Kitchen Cans at 75%, the rest as they are.
  const CANS = '5', FAN = '8';
  const aid = await C(() => { const c = window.__copper; return c.data.devArea(c.data.dev('5')); });
  const moved = await C(async a => {
    const c = window.__copper; const was = {};
    for (const id of ['11', '7', '8']) { was[id] = c.data.devArea(c.data.dev(id)); c.EDIT.moveDevice(id, a); }
    await c.save('', { quiet: true });
    await c.run({ type: 'level', target: 'd:5', level: 75 });
    await c.run({ type: 'level', target: 'd:6', level: 0 });
    return was;
  }, aid);
  await C(a => { location.hash = `room/${a}`; }, aid); await wait(1200);
  const tile = `#screen .room-grid > .tile[data-go="light/${CANS}"]`;
  const tiles = await C(() => [...document.querySelectorAll('#screen .room-grid > .tile')].map(t => t.dataset.go));
  check('the room has tiles above, beside and below to step aside', tiles.length >= 5 && tiles.includes(`light/${CANS}`), tiles);
  // scroll the room a little, so the tile is mid screen and the room has to come back where it was
  await C(s => { const el = document.querySelector(s); window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 420); }, tile);
  await wait(400);
  const y0 = await C(() => window.scrollY);
  const n0 = await C(() => history.state && history.state.n);
  const before = { tile: await box(tile), name: await wordsOf(`${tile} .nm`), art: await box(`${tile} .art`) };
  const vl = await C(s => { const e = document.querySelector(`${s} .vl`); const g = document.createRange(); g.setStart(e.firstChild, 0); g.setEnd(e.firstChild, 2); const b = g.getBoundingClientRect(); return { text: e.textContent, l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }, tile);
  check('the tile is lit at 75% and the room is scrolled', /^75%/.test(vl.text) && y0 > 40 && (await C(s => document.querySelector(s).matches('.on'), tile)), { vl: vl.text, y0 });
  // wait for the room to be still (the level just set is still being echoed back), so a redraw cannot take the tile
  // from under the finger
  await C(async () => { let last = performance.now(); const o = new MutationObserver(() => { last = performance.now(); }); o.observe(document.querySelector('#screen'), { childList: true }); while (performance.now() - last < 1200) await new Promise(r => setTimeout(r, 100)); o.disconnect(); });
  await shot('m11-room-before');

  // ---- the press: 0.97 while the finger is down (on the tile's body, not its power circle)
  // a redraw while the finger is down (the app's minute tick, the house reporting) takes the tile from under it and
  // the tap is lost, as it would be on a phone: press again until the tile under the finger is the one pressed
  const tb = await page.locator(tile).boundingBox();
  const px = tb.x + tb.width * 0.7, py = tb.y + tb.height * 0.45;
  let pressed = 0;
  for (let i = 0; i < 4; i++) {
    await C(s => { document.querySelector(s).dataset.pressedHere = '1'; }, tile);
    await page.mouse.move(px, py); await page.mouse.down(); await wait(250);
    pressed = await C(s => new DOMMatrix(getComputedStyle(document.querySelector(s)).transform).a, tile);
    if (await C(s => !!document.querySelector(s).dataset.pressedHere, tile)) break;
    await page.mouse.up(); await wait(900);
    if ((await C(() => location.hash)) !== `#room/${aid}`) { await C(() => history.back()); await wait(1500); }
  }
  check('the tile presses to 0.97 while the finger is down', Math.abs(pressed - 0.97) < 0.006, pressed);

  // ---- open
  const frames = await play(async () => { await page.mouse.up(); }, [0, 60, 150, 250, 400, 540, 700, 1000, 1500], 'm11-open');
  const W = await C(() => document.documentElement.clientWidth), H = await C(() => innerHeight);
  const full = { l: 0, t: 0, r: W, b: H };
  const flightF = frames.filter(f => f.at != null && f.win);
  const f0 = flightF[0], fEnd = flightF[flightF.length - 1];
  check('the light opened', (await C(() => location.hash)) === `#light/${CANS}`, await C(() => location.hash));
  check('one step in the history for one tap', (await C(() => history.state.n)) === n0 + 1);
  check('the surface starts on the tile', f0 && f0.at <= 40 && near(f0.win, before.tile, 6), { first: f0 && f0.win, at: f0 && f0.at, tile: before.tile });
  check('and ends as the whole screen', fEnd && fEnd.at >= 500 && near(fEnd.win, full, 3), { end: fEnd && fEnd.win, at: fEnd && fEnd.at, full });
  const midWin = flightF.filter(f => f.at > 30 && f.at < 510);
  check('in between it only grows', midWin.length > 3 && midWin.every((f, i) => !i || (f.win.w >= midWin[i - 1].win.w - 1 && f.win.h >= midWin[i - 1].win.h - 1)), midWin.map(f => [f.win.w, f.win.h]));
  // copper never fills the screen: the face gives way as the surface grows past a third of its growth
  const most = Math.max(...flightF.map(f => f.copper));
  const bigCopper = flightF.filter(f => f.cover > 0.5 && f.faceo > 0.5);
  check('the copper never covers the screen: at most a third of it at any moment', most < 0.34 && !bigCopper.length, { most, big: bigCopper.slice(0, 3).map(f => [f.at, f.cover, f.faceo]) });
  check('and is gone by the time the surface lands', fEnd && fEnd.faceo < 0.03, fEnd && fEnd.faceo);
  const early = flightF.filter(f => f.at < 70);
  check('while at the tile\'s size it is the tile\'s own flat copper', early.length && early.every(f => f.faceo > 0.97 && /217, 138, 78/.test(f.facebg) && !/gradient/.test(f.facebg)), early.map(f => [f.at, f.faceo, f.facebg]));
  // the page's one light is what stays warm, arriving over the second half at its own strength
  const haloMid = flightF.filter(f => f.at > 100 && f.at < 200).map(f => f.haloo);
  const rest = frames.filter(f => f.at == null && f.t > (fEnd ? fEnd.t : 0));
  const lastF = rest.length && rest[rest.length - 1];
  check('the page\'s light arrives over the second half, at its own strength', haloMid.every(o => o < 0.2) && lastF && lastF.halot > 0.3 && Math.abs(lastF.haloo - lastF.halot) < 0.02, { mid: haloMid, end: lastF && [lastF.haloo, lastF.halot] });
  // and it rides with the lamp's drawing: from the tile's drawing, small, to the lamp
  const artC = { x: (before.art.l + before.art.r) / 2, y: (before.art.t + before.art.b) / 2 };
  const heroC = await C(() => { const r = document.querySelector('#screen .dev .hero-art').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const lf0 = flightF.find(f => f.lc && f.at <= 40), lfEnd = lastF && lastF.lc;
  check('the light leaves from the tile\'s drawing, small, and lands on the lamp', lf0 && Math.hypot(lf0.lc.x - artC.x, lf0.lc.y - artC.y) <= 16 && lf0.lc.s < 0.8 && lfEnd && Math.hypot(lfEnd.x - heroC.x, lfEnd.y - heroC.y) <= 2 && Math.abs(lfEnd.s - 1) < 0.02, { start: lf0 && lf0.lc, art: artC, end: lfEnd, hero: heroC });
  const titleRest = await wordsOf('#screen .dev .t-hero');
  check('the title starts at the tile\'s name, width matched', f0 && f0.h1 && dist(f0.h1, before.name) <= 6 && Math.abs(f0.h1.w - (before.name.r - before.name.l)) <= 8, { h1: f0 && f0.h1, name: before.name });
  check('and ends where it rests', fEnd && near(fEnd.h1, titleRest, 4), { end: fEnd && fEnd.h1, rest: titleRest });
  const numRest = await wordsOf('#screen .dev .dial .num b');
  check('the level flies from the tile\'s "75" to the dial\'s number', f0 && f0.num && dist(f0.num, vl) <= 6 && fEnd && near(fEnd.num, numRest, 4), { start: f0 && f0.num, vl, end: fEnd && fEnd.num, rest: numRest });
  const ghosted = frames.filter(f => f.at != null && f.at > 160 && (f.copyo > 0.02 || f.h1o < 0.98 || f.numo < 0.98));
  check('the words cross only in the first 0.15 s', ghosted.length === 0, ghosted.slice(0, 3).map(f => [f.at, f.copyo, f.h1o, f.numo]));
  const pw = frames.filter(f => f.at != null && f.at > 105 && f.pwro > 0.02);
  check('the power circle fades where it is in the first 0.1 s', pw.length === 0 && frames.some(f => f.at != null && f.at < 50 && f.pwro > 0.3), pw.slice(0, 3).map(f => [f.at, f.pwro]));
  const others = frames.filter(f => f.at != null && f.at > 160 && f.others.length);
  check('nothing else of the tile is left after the crossing', others.length === 0, others.slice(0, 2).map(f => [f.at, f.others]));
  check('the room steps aside around the tile', frames.some(f => f.at != null && f.at > 30 && f.at < 330 && f.ghost && f.list >= 2), frames.map(f => [f.at, f.list]).slice(0, 8));
  check('nothing of the transition is left', !(await left()).length, await left());
  check('the page starts at the top', (await C(() => window.scrollY)) === 0);

  // ---- usable after: nothing over it, its controls answer, and a sheet over it is a sheet, not this
  const clear = await C(() => ['.onoff [data-act="dev-off"]', '.hdr-btn.back', '.dial .nudge.plus', '.feat'].map(s => { const e = document.querySelector('#screen ' + s); if (!e) return s + ' missing'; const b = e.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e.contains(hit) ? 'ok' : `${s} covered by ${hit && hit.className}`; }));
  check('everything on the page is where a finger finds it', clear.every(x => x === 'ok'), clear);
  await page.click('#screen .onoff [data-act="dev-off"]'); await wait(900);
  check('Off answers', !(await C(() => document.querySelector('#screen .dev').classList.contains('on'))));
  await page.click('#screen .onoff [data-act="dev-on"]'); await wait(900);
  check('On answers', await C(() => document.querySelector('#screen .dev').classList.contains('on')));
  await C(() => window.__copper.run({ type: 'level', target: 'd:5', level: 75 })); await wait(700);
  await page.click('#screen .feat[data-go$="/timer"]'); await wait(700);
  check('the sleep timer opens as a sheet over the page, not a page', (await C(() => location.hash)) === `#light/${CANS}/timer` && !!(await page.$('#sheet-root .sheet')) && !(await left()).length, await C(() => location.hash));
  await C(() => history.back()); await wait(700);
  check('and closes back to the page', (await C(() => location.hash)) === `#light/${CANS}` && !(await page.$('#sheet-root .sheet')) && !(await left()).length);

  // ---- back: the reverse
  const tileNow = before.tile;
  const bframes = await play(() => C(() => document.querySelector('#screen .hdr-btn.back').click()), [0, 60, 150, 250, 300, 400, 440], 'm11-back');
  const backF = bframes.filter(f => f.at != null && f.win);
  const b0 = backF[0], bEnd = backF[backF.length - 1];
  const tileAfter = await box(tile);
  await shot('m11-back-after');
  check('Back returns to the room', (await C(() => location.hash)) === `#room/${aid}`, await C(() => location.hash));
  check('one step back in the history', (await C(() => history.state.n)) === n0);
  check('the room is back where it was scrolled', Math.abs((await C(() => window.scrollY)) - y0) <= 2, { now: await C(() => window.scrollY), was: y0 });
  check('the surface starts as the whole screen', b0 && b0.at <= 40 && near(b0.win, full, 3), { first: b0 && b0.win, at: b0 && b0.at });
  check('and closes into the tile', bEnd && bEnd.at >= 410 && near(bEnd.win, tileAfter, 4) && near(tileAfter, tileNow, 2), { end: bEnd && bEnd.win, at: bEnd && bEnd.at, tile: tileAfter });
  const earlyCopper = backF.filter(f => f.at < 240 && f.faceo > 0.05);
  check('its copper comes back only in the last 0.2 s', earlyCopper.length === 0 && bEnd.faceo > 0.9, { early: earlyCopper.slice(0, 3).map(f => [f.at, f.faceo]), end: bEnd && bEnd.faceo });
  check('the copper never covers the screen on the way back either', Math.max(...backF.map(f => f.copper)) < 0.34, Math.max(...backF.map(f => f.copper)));
  check('the title shrinks back into the tile\'s name', bEnd && dist(bEnd.h1, before.name) <= 6, { h1: bEnd && bEnd.h1, name: before.name });
  check('and the level into its "75"', bEnd && bEnd.num && dist(bEnd.num, vl) <= 6, { num: bEnd && bEnd.num, vl });
  const bghost = backF.filter(f => f.at < 290 && f.h1 && (f.copyo > 0.02 || f.h1o < 0.98));
  check('the words cross only in the last 0.15 s', bghost.length === 0, bghost.slice(0, 3).map(f => [f.at, f.copyo, f.h1o]));
  check('the room returns around it', bframes.some(f => f.at != null && f.at > 60 && f.at < 440 && f.list >= 2), bframes.map(f => [f.at, f.list]).slice(0, 8));
  check('nothing of it is left, and the tile is itself again', !(await left()).length && (await C(s => getComputedStyle(document.querySelector(s)).visibility, tile)) === 'visible', await left());

  // ---- the power circle still toggles, and the tile does not open
  const wasOn = await C(s => document.querySelector(s).matches('.on'), tile);
  await page.click(`${tile} .pwr`); await wait(900);
  check('the tile\'s power circle toggles the light and stays on the room', (await C(() => location.hash)) === `#room/${aid}` && (await C(s => document.querySelector(s).matches('.on'), tile)) !== wasOn && !(await left()).length);
  await page.click(`${tile} .pwr`); await wait(900);

  // ---- a double tap opens once, and the browser's Back (Android's too) closes it the same way
  const n1 = await C(() => history.state.n);
  await C(s => { const el = document.querySelector(s); el.click(); el.click(); }, tile);
  await wait(120);
  await C(() => { const el = document.querySelector('#screen .dev .hdr-btn.back'); if (el) el.click(); });
  await wait(1300);
  check('a second tap in flight does not navigate again', (await C(() => history.state.n)) === n1 + 1 && (await C(() => location.hash)) === `#light/${CANS}`, { n: await C(() => history.state.n), n1 });
  await C(() => history.back()); await wait(80);
  check('the browser\'s Back closes it into the tile too', !!(await page.$('.m11-surface')) && !!(await page.$('.page-ghost .dev')));
  await wait(1000);
  check('and lands on the room, scrolled where it was', (await C(() => location.hash)) === `#room/${aid}` && Math.abs((await C(() => window.scrollY)) - y0) <= 2 && !(await left()).length);

  // ---- a finger holding the close (Android's predictive back): part way, let go to go back
  await C(s => document.querySelector(s).click(), tile); await wait(1600);
  const nL = await C(() => history.state.n);
  await C(async () => { const m = await import('/ui/opening.js'); window.__back = m.followBack(); });
  check('a finger can hold the close of a page opened from its tile', await C(() => !!window.__back));
  await wait(250);
  await C(() => window.__back.progress(0.5)); await wait(200);
  const half = await C(() => window.__m11.sample());
  await wait(250);
  const still = await C(() => window.__m11.sample());
  await shot('m11-follow-half');
  check('held at half way, the surface stands between the screen and the tile', half.win && half.win.w < W - 20 && half.win.w > before.tile.r - before.tile.l + 20 && (await C(() => location.hash)) === `#room/${aid}`, half.win);
  check('and stays there while the finger does', near(half.win, still.win, 1), { half: half.win, still: still.win });
  await C(() => window.__back.progress(0.8)); await wait(120);
  const more = await C(() => window.__m11.sample());
  check('it follows the finger further', more.win && more.win.w < half.win.w - 10, { half: half.win, more: more.win });
  await C(() => window.__back.commit()); await wait(900);
  check('let go, it closes into the tile and lands on the room', (await C(() => location.hash)) === `#room/${aid}` && (await C(() => history.state.n)) === nL - 1 && !(await left()).length && (await C(s => getComputedStyle(document.querySelector(s)).visibility, tile)) === 'visible', await left());
  // ---- and taken back: the page is put back as it was
  await C(s => document.querySelector(s).click(), tile); await wait(1600);
  await C(async () => { const m = await import('/ui/opening.js'); window.__back = m.followBack(); });
  await wait(200);
  await C(() => window.__back.progress(0.4)); await wait(200);
  await shot('m11-follow-cancel-held');
  await C(() => window.__back.cancel()); await wait(900);
  await shot('m11-follow-cancelled');
  check('taken back, the light\'s page is back as it was, at the same step', (await C(() => location.hash)) === `#light/${CANS}` && (await C(() => history.state.n)) === nL && !!(await page.$('#screen .dev')) && !(await left()).length, { hash: await C(() => location.hash), n: await C(() => history.state.n), nL, left: await left() });
  check('and nothing on it is faded or moved', await C(() => { const d = document.querySelector('#screen .dev'); return [...d.querySelectorAll('.t-hero, .onoff, .dial')].every(n => getComputedStyle(n).opacity === '1' && n.getAnimations().length === 0); }));
  await page.click('#screen .hdr-btn.back'); await wait(80);
  check('and its Back still closes it into the tile', !!(await page.$('.m11-surface')));
  await wait(1000);
  check('landing on the room', (await C(() => location.hash)) === `#room/${aid}` && !(await left()).length);

  // ---- a fan opens the same way, with no copper
  const fanTile = `#screen .room-grid > .tile[data-go="light/${FAN}"]`;
  await C(s => document.querySelector(s).scrollIntoView({ block: 'center' }), fanTile); await wait(400);
  const fanBox = await box(fanTile);
  const fframes = await play(async () => { await page.click(fanTile); }, [40, 250, 540], 'm11-fan');
  const ff = fframes.filter(f => f.at != null && f.win);
  check('a fan opens from its tile into its own page', near(ff[0] && ff[0].win, fanBox, 6) && (await C(() => location.hash)) === `#light/${FAN}` && !!(await page.$('#screen .dev.is-fan')), { first: ff[0] && ff[0].win, tile: fanBox });
  check('and brings no copper: its surface is the tile\'s grey', ff.length > 2 && ff.every(f => /^none rgb\(38, 38, 38\)/.test(f.facebg)), ff.slice(0, 2).map(f => f.facebg));
  await page.click('#screen .hdr-btn.back'); await wait(1200);
  check('and closes back into its tile', (await C(() => location.hash)) === `#room/${aid}` && !(await left()).length);

  // ---- reached another way it is the plain push
  await C(() => { location.hash = 'light/5'; }); await wait(60);
  const plain = await C(() => ({ m11: !!document.querySelector('.m11-surface'), push: document.getAnimations().some(a => { const k = a.effect.getKeyframes(); return /translateX\(24px\)/.test((k[0] && k[0].transform) || ''); }) }));
  check('a light reached by its address comes in with the plain push', !plain.m11 && plain.push, plain);
  await wait(800);
  await C(() => history.back()); await wait(900);
  check('and goes back with the plain back', (await C(() => location.hash)) === `#room/${aid}` && !(await left()).length);

  // put the house back as it was
  await C(async was => { const c = window.__copper; for (const [id, a] of Object.entries(was)) c.EDIT.moveDevice(id, a); await c.save('', { quiet: true }); }, moved);
  check('no errors on the page', !errors.length, errors);
  await ctx.close();

  // ---- reduced motion: the page simply arrives
  const rm = await open({ reducedMotion: 'reduce' });
  const P = rm.page;
  await P.goto(root + `#room/${aid}`); await P.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  await P.click(`#screen .room-grid > .tile[data-go="light/${CANS}"] .nm`); await wait(40);
  const r1 = await P.evaluate(() => ({ hash: location.hash, ghost: !!document.querySelector('.page-ghost'), m11: !!document.querySelector('.m11-surface, .m11-top'), anims: document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations !== Infinity && !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).length }));
  check('reduced motion: the light arrives with no shared transition and nothing moving', r1.hash === `#light/${CANS}` && !r1.ghost && !r1.m11 && r1.anims === 0, r1);
  await P.click('#screen .hdr-btn.back'); await wait(60);
  const r2 = await P.evaluate(() => ({ hash: location.hash, ghost: !!document.querySelector('.page-ghost'), m11: !!document.querySelector('.m11-surface, .m11-top') }));
  check('reduced motion: and Back is the plain back', r2.hash === `#room/${aid}` && !r2.ghost && !r2.m11, r2);
  const r3 = await P.evaluate(async () => { const m = await import('/ui/opening.js'); return m.canFollow(); });
  check('reduced motion: no close for a finger to hold', r3 === false);
  check('no errors on the page (reduced motion)', !errors.length, errors);
  await rm.ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
