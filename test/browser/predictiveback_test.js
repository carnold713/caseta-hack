// M13 · Swiping back (web/ui/predictiveback.js): Android's predictive back, driven the way the Android side drives it,
// through window.__caseta.back (start, a run of progress values, then cancel or commit). The page follows the
// progress, the page Back would show waits behind it, a cancel puts everything back exactly, and a commit steps back
// from where the finger left it: a room reached from its card closes into the card (M10), a light from its tile into
// the tile (M11), another page slides off, and with a sheet up only the sheet goes. Screenshots are taken with every
// animation paused at a moment.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, deviceScaleFactor: 1, ...opts });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|woff2|404|Failed to load resource/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
    return { ctx, page };
  };
  const root = `http://127.0.0.1:${PORT}/ui/`;
  const { ctx, page } = await open();
  const C = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready && window.__caseta && window.__caseta.back, null, { timeout: 15000 });
  const shot = async name => {
    await page.screenshot({ path: `${name}.png` });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.copyFileSync(`${name}.png`, path.join(SHOTS, `${name}.png`)); }
  };
  // a screenshot of a moment: every animation paused where it is, then played on
  const still = async (name, ms = 0) => {
    if (ms) await wait(ms);
    await C(() => { window.__held = document.getAnimations().filter(a => a.playState === 'running'); for (const a of window.__held) a.pause(); });
    await shot(name);
    await C(() => { for (const a of window.__held || []) if (a.playState === 'paused') a.play(); window.__held = []; });
  };
  // the Android side's calls, as it makes them
  const B = (m, ...a) => C(([m, a]) => window.__caseta.back[m](...a), [m, a]);
  const drag = async (edge, ps) => { const ok = await B('start', edge, edge === 'left' ? 4 : 408, 460); for (const p of ps) { await B('progress', p, 0, 460); await wait(16); } return ok; };
  const pose = () => C(() => {
    const s = document.querySelector('#screen');
    const m = new DOMMatrix(getComputedStyle(s).transform === 'none' ? '' : getComputedStyle(s).transform);
    const dark = document.querySelector('.pb-behind .pb-dark');
    const chev = document.querySelector('.pb-chev');
    return { s: Math.round(m.a * 1000) / 1000, x: Math.round(m.e * 10) / 10, clip: getComputedStyle(s).clipPath, dark: dark ? Number(getComputedStyle(dark).opacity) : null, chev: chev ? Number(getComputedStyle(chev).opacity) : null };
  });
  const leftovers = () => C(() => ({
    style: document.querySelector('#screen').getAttribute('style'),
    layers: [...document.querySelectorAll('.pb-behind, .pb-chev, .pb-dark, .pb-leaving, .page-ghost, [class^="m10"]')].map(e => e.className),
    dragging: window.__copper.ui.dragging,
  }));
  const clean = l => !l.style && !l.layers.length && !l.dragging;
  const state = () => C(() => ({ hash: location.hash, n: history.state && history.state.n }));

  await page.goto(root + '#home'); await ready(); await wait(1200);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  check('the page answers on window.__caseta.back', await C(() => ['start', 'progress', 'cancel', 'commit', 'can'].every(k => typeof window.__caseta.back[k] === 'function')));

  // ---- Home at the bottom: nowhere to go, so nothing moves and Android puts the app away
  check('on Home at the bottom Back has nowhere to go', (await B('can')) === false && (await B('start', 'left', 4, 460)) === false);
  await B('progress', 0.4);
  check('and nothing follows the finger there', clean(await leftovers()), await leftovers());
  check('a commit there says so (Android leaves the app)', (await B('commit')) === false && (await state()).hash === '#home');

  // ---- Rooms from its tab, then a room from its card (M10)
  await C(() => document.querySelector('#tabs [data-go="rooms"]').click()); await wait(900);
  const rooms = await C(() => [...document.querySelectorAll('#screen .room-big')].map(el => el.dataset.go.slice(5)));
  const aid = rooms[Math.floor(rooms.length / 2)];
  check('Rooms lists rooms above and below the one this opens', rooms.length >= 3, rooms);
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
    const out = await c.data.api(`/api/roomphoto/${encodeURIComponent(a)}`, { method: 'PUT', body: JSON.stringify({ data: cv.toDataURL('image/jpeg', 0.8) }) });
    c.data.appRoom(a).photo = String(out.stamp);
    await c.save('', { quiet: true });
  }, aid);
  await wait(1500);
  const card = `#screen .room-big[data-go="room/${aid}"]`;
  await C(s => { const el = document.querySelector(s); window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 330); }, card);
  await wait(500);
  const y0 = await C(() => window.scrollY);
  const cardBox = await C(s => { const b = document.querySelector(s).getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom) }; }, card);
  await page.click(card); await wait(1300);
  const inRoom = await state();
  check('the room opened from its card', inRoom.hash === `#room/${aid}` && inRoom.n === 2, inRoom);
  check('from a room Back has somewhere to go', (await B('can')) === true);

  // ---- a drag, then a cancel
  check('start is taken', (await drag('left', [])) === true);
  const poses = [];
  for (const p of [0.05, 0.1, 0.2, 0.3]) { await B('progress', p, 30, 460); poses.push({ p, ...(await pose()) }); }
  check('the page follows the progress, shrinking as it grows', poses.every((q, i) => !i || q.s < poses[i - 1].s) && poses.every((q, i) => !i || q.x > poses[i - 1].x), poses);
  const at30 = poses[3];
  check('scale about 0.9 at 30%', Math.abs(at30.s - 0.9) < 0.004, at30);
  check('it has moved toward the far side (right, for a swipe from the left)', at30.x > 15 && at30.x <= 22, at30.x);
  check('its corners are rounded (28 as seen)', /round 31\.1\dpx/.test(at30.clip), at30.clip);
  check('the chevron is in and the page behind sits back, dimmed', at30.chev === 1 && Math.abs(at30.dark - 0.45) < 0.01, at30);
  const behind = await C(a => {
    const L = document.querySelector('.pb-behind');
    const list = L && L.querySelector('.rooms-list');
    const c = list && [...list.children].find(k => k.dataset.go === `room/${a}`);
    const b = L && L.querySelector('.pb-page').getBoundingClientRect();
    const scr = L && L.querySelector('.screen');
    return { rooms: !!list, hidden: c && c.style.visibility === 'hidden', scale: b && Math.round((b.width / innerWidth) * 1000) / 1000, y: scr && scr.style.transform, under: L && L.nextElementSibling && L.nextElementSibling.id, ids: L ? L.querySelectorAll('[id]').length : -1 };
  }, aid);
  check('behind it is Rooms, the page Back shows, at 0.96, scrolled where it was, the card not there', behind.rooms && behind.hidden && behind.scale === 0.96 && behind.y === `translateY(${-y0}px)` && behind.under === 'screen' && behind.ids === 0, { ...behind, y0 });
  await still('m13-drag-30');
  await B('progress', 0.7, 60, 460);
  const at70 = await pose();
  check('past 30% the page holds at 0.9', Math.abs(at70.s - 0.9) < 0.002 && at70.x === 22, at70);
  await still('m13-drag-70');
  await B('cancel');
  await still('m13-cancel-100', 100);
  const mid = await pose();
  check('a cancel springs back (part way at 0.1 s)', mid.s > 0.93 && mid.s < 1, mid);
  await wait(400);
  const afterCancel = await leftovers();
  check('and then nothing is left: the page\'s own style, no layer behind, no chevron', clean(afterCancel), afterCancel);
  check('and nothing happened', JSON.stringify(await state()) === JSON.stringify(inRoom), await state());
  await shot('m13-cancel-after');

  // ---- a drag, then a commit: the room closes into its card (M10) from where the finger left it
  await drag('left', [0.1, 0.25, 0.4, 0.5]);
  await still('m13-room-drag-50');
  check('a commit is taken', (await B('commit')) === true);
  await wait(30);
  const handed = await C(() => {
    const g = document.querySelector('.page-ghost');
    const m = g && new DOMMatrix(getComputedStyle(g).transform);
    return { room: !!(g && g.querySelector('.room-photo-card')), top: !!document.querySelector('.m10-top'), s: m && Math.round(m.a * 1000) / 1000, behind: !!document.querySelector('.pb-behind'), dark: !!document.querySelector('.pb-dark') };
  });
  check('the room\'s own close takes it over, starting shrunk where the finger left it', handed.room && handed.top && handed.s > 0.89 && handed.s < 0.95 && !handed.behind && handed.dark, handed);
  await still('m13-room-commit-080', 50);
  await still('m13-room-commit-200', 120);
  await still('m13-room-commit-330', 130);
  await wait(900);
  const landed = await C(s => {
    const c = document.querySelector(s);
    const list = [...document.querySelectorAll('#screen .rooms-list > *')];
    const moved = list.filter(k => { const cs = getComputedStyle(k); return Number(cs.opacity) < 0.999 || (cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)'); }).length;
    const b = c.getBoundingClientRect();
    return { hash: location.hash, n: history.state.n, y: window.scrollY, card: getComputedStyle(c).visibility, t: Math.round(b.top), moved };
  }, card);
  check('it ends on Rooms, one step down', landed.hash === '#rooms' && landed.n === inRoom.n - 1, landed);
  check('scrolled where it was, the card back where it was and the list in place', Math.abs(landed.y - y0) <= 2 && landed.card === 'visible' && Math.abs(landed.t - cardBox.t) <= 2 && landed.moved === 0, { ...landed, y0, cardBox });
  const afterRoom = await leftovers();
  check('with nothing of either left', clean(afterRoom), afterRoom);
  await shot('m13-room-after');

  // ---- a light opened from its tile on the room closes back into its tile (M11), from where the finger left it
  await page.click(card); await wait(1300);
  const tile = await C(() => { const t = document.querySelector('#screen .room-grid .tile[data-go^="light/"]'); return t && t.dataset.go; });
  await C(s => document.querySelector(`#screen [data-go="${s}"]`).click(), tile); await wait(1600);
  const onLight = await state();
  check('a light opened over the room', onLight.hash === `#${tile}` && onLight.n === inRoom.n + 1, onLight);
  await drag('right', [0.1, 0.2, 0.3]);
  const lp = await pose();
  const lb = await C(t => { const L = document.querySelector('.pb-behind'); const tl = L && L.querySelector(`.room-grid .tile[data-go="${t}"]`); return { room: !!(L && L.querySelector('.room .room-photo-card')), tabs: !!(L && L.querySelector('.tabbar')), tile: tl && tl.style.visibility, chevRight: (() => { const c = document.querySelector('.pb-chev'); return c && c.getBoundingClientRect().right > innerWidth - 100; })() }; }, tile);
  check('a swipe from the right edge moves the page left', lp.x < -15 && Math.abs(lp.s - 0.9) < 0.004, lp);
  check('behind the light is its room with the tab bar it comes back to and its tile not there, and the chevron is on the right', lb.room && lb.tabs && lb.tile === 'hidden' && lb.chevRight, lb);
  await still('m13-light-drag-30');
  check('a commit is taken', (await B('commit')) === true);
  await wait(40);
  const lc = await C(() => ({ surface: !!document.querySelector('.m11-surface'), leaving: !!document.querySelector('.pb-leaving'), ghost: !!document.querySelector('.page-ghost .dev'), hash: location.hash }));
  check('the light closes into its tile from the shrunk page, over the room', lc.surface && !lc.leaving && lc.ghost && lc.hash === `#room/${aid}`, lc);
  await still('m13-light-commit-100', 60);
  await still('m13-light-commit-220', 120);
  await wait(700);
  const afterLight = await leftovers();
  check('it ends on the room, with nothing left and the tile itself again', (await state()).hash === `#room/${aid}` && (await state()).n === inRoom.n && clean(afterLight) && !(await page.$('.m11-surface, .m11-top')) && (await C(t => getComputedStyle(document.querySelector(`#screen [data-go="${t}"]`)).visibility, tile)) === 'visible', { st: await state(), afterLight });
  await shot('m13-light-after');

  // ---- another page: a light reached by its address slides off toward the far side, and the room comes up
  await C(t => { location.hash = t; }, tile); await wait(900);
  await drag('right', [0.1, 0.2, 0.3]);
  check('a commit is taken', (await B('commit')) === true);
  await wait(40);
  check('the light slides off as its own ghost, over the room', !!(await page.$('.pb-leaving')) && !(await page.$('.m11-surface')) && (await C(() => location.hash)) === `#room/${aid}`);
  await still('m13-plain-commit-100', 60);
  await wait(700);
  const afterPlain = await leftovers();
  check('it ends on the room, with nothing left', (await state()).hash === `#room/${aid}` && (await state()).n === inRoom.n && clean(afterPlain), { st: await state(), afterPlain });

  // ---- a sheet up: the gesture drives the sheet, and a commit closes the sheet only
  await C(a => { location.hash = `room/${a}/timer`; }, aid); await wait(900);
  const withSheet = await state();
  check('a sheet is up over the room', !!(await page.$('#sheet-root .sheet')) && withSheet.n === inRoom.n + 1, withSheet);
  await drag('left', [0.1, 0.3]);
  const sd = await C(() => { const s = document.querySelector('#sheet-root .sheet'); return { y: new DOMMatrix(getComputedStyle(s).transform).f, screen: document.querySelector('#screen').getAttribute('style'), behind: !!document.querySelector('.pb-behind') }; });
  check('the sheet drops with the progress and the page stays put', sd.y > 20 && !sd.screen && !sd.behind, sd);
  await B('cancel'); await wait(450);
  const sc = await C(() => { const s = document.querySelector('#sheet-root .sheet'); return { style: s.getAttribute('style'), scrim: document.querySelector('#sheet-root .scrim').getAttribute('style'), y: new DOMMatrix(getComputedStyle(s).transform).f, dragging: window.__copper.ui.dragging }; });
  check('a cancel lifts it back as it was', !sc.style && !sc.scrim && sc.y === 0 && !sc.dragging && (await state()).hash === withSheet.hash, sc);
  await drag('left', [0.2, 0.4, 0.5]);
  await still('m13-sheet-drag-50');
  check('a commit is taken', (await B('commit')) === true);
  await wait(800);
  const afterSheet = await state();
  check('the sheet is closed and the room is still there, one step down', !(await page.$('#sheet-root .sheet')) && afterSheet.hash === `#room/${aid}` && afterSheet.n === inRoom.n, afterSheet);
  check('with nothing left', clean(await leftovers()), await leftovers());

  // ---- no progress at all (a back button, an Android before 14): commit is the plain step back
  check('a commit without a start steps back too (the room into its card)', (await B('commit')) === true);
  await wait(1000);
  check('and lands on Rooms', (await state()).hash === '#rooms' && clean(await leftovers()), { st: await state(), l: await leftovers() });
  // ---- a room from its card whose card is not there when Rooms is drawn: the room's close cannot play, so it
  // slides off plainly instead, from where the finger left it
  await page.click(card); await wait(1300);
  await C(a => { const st = document.createElement('style'); st.id = 'hide-card'; st.textContent = `.room-big[data-go="room/${a}"] { display: none !important; }`; document.head.appendChild(st); }, aid);
  await drag('left', [0.2, 0.4]);
  await B('commit'); await wait(60);
  check('with its card gone the room slides off plainly', !!(await page.$('.pb-leaving')) && !(await page.$('.m10-top')), await C(() => [...document.querySelectorAll('.pb-leaving, .page-ghost, .m10-top')].map(e => e.className)));
  await still('m13-nocard-commit-120', 60);
  await wait(700);
  check('and lands on Rooms with nothing left', (await state()).hash === '#rooms' && clean(await leftovers()), { st: await state(), l: await leftovers() });
  await C(() => document.getElementById('hide-card').remove()); await wait(200);
  check('from a tab Back goes Home', (await B('can')) === true);
  await drag('left', [0.3]);
  check('behind Rooms is Home', !!(await page.$('.pb-behind .screen .home-head')));
  await B('commit'); await wait(700);
  check('and a commit there lands on Home, at the bottom', (await state()).hash === '#home' && (await state()).n === 0 && clean(await leftovers()), { st: await state(), l: await leftovers() });

  // put the room back as it was: no photograph
  await C(async a => { const c = window.__copper; await c.data.api(`/api/roomphoto/${encodeURIComponent(a)}`, { method: 'DELETE' }); c.data.appRoom(a).photo = null; await c.save('', { quiet: true }); }, aid);
  check('no errors on the page', !errors.length, errors);
  await ctx.close();

  // ---- reduced motion: nothing follows the finger, and the step back still happens
  const rm = await open({ reducedMotion: 'reduce' });
  const P = rm.page;
  await P.goto(root + '#home'); await P.waitForFunction(() => window.__copper && window.__copper.S.ready && window.__caseta, null, { timeout: 15000 }); await wait(900);
  await P.evaluate(() => document.querySelector('#tabs [data-go="rooms"]').click()); await wait(500);
  const r1 = await P.evaluate(() => { const b = window.__caseta.back; const ok = b.start('left', 4, 400); b.progress(0.5); return { ok, style: document.querySelector('#screen').getAttribute('style'), layer: !!document.querySelector('.pb-behind, .pb-chev') }; });
  check('reduced motion: the gesture is taken and nothing moves', r1.ok && !r1.style && !r1.layer, r1);
  await P.evaluate(() => window.__caseta.back.commit()); await wait(400);
  check('reduced motion: and the commit steps back', (await P.evaluate(() => location.hash)) === '#home');
  check('no errors on the page (reduced motion)', !errors.length, errors);
  await rm.ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
