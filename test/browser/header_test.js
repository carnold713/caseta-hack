// M15 · The header that stays: as a page scrolls, its title and header circles shrink a little and stay stuck to the
// top, and a blurred scrim fades in behind them (web/ui/header.js, header.css). Everything follows p, the page's
// scroll over its first 64 px, with no easing. Read off the running app at 412 x 915 and 360 x 780: where the title
// and the circles are at each scroll, the scrim, a room's title taking its two steps past the back button, a long
// name cut the same at every step, a redraw mid-scroll, Rooms put back where it was scrolled, a room closing into its
// card from a scrolled page, and a sheet over a scrolled page.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;
const LONG = "Collin's Office and Reading Nook";

// In the page: the header as it is drawn now.
function measure() {
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, cy: b.top + b.height / 2 }; };
  const scr = document.getElementById('screen');
  const bar = scr.querySelector('.bar');
  const t = scr.querySelector('.bar-t');
  const words = t && (() => { const g = document.createRange(); g.selectNodeContents(t); const b = g.getBoundingClientRect(); return { l: b.left, r: b.right }; })();
  const cs = bar ? getComputedStyle(bar, '::before') : null;
  const btn = s => r(scr.querySelector(`.bar .hdr-btn${s}`));
  const count = scr.querySelector('.room-title .count');
  return {
    y: window.scrollY, p: Number(document.getElementById('app').style.getPropertyValue('--hdr-p') || 0),
    bar: r(bar), t: r(t), words, tw: t && t.offsetWidth, th: t && t.offsetHeight, tsw: t && t.scrollWidth, tcw: t && t.clientWidth,
    back: btn('.back'), a1: btn('.a1'),
    scrim: cs && { o: Number(cs.opacity), h: parseFloat(cs.height), w: parseFloat(cs.width), mask: cs.maskImage || cs.webkitMaskImage, blur: cs.backdropFilter || cs.webkitBackdropFilter, bg: cs.backgroundColor },
    count: count && { ...r(count), o: Number(getComputedStyle(count).opacity) },
    hscroll: document.documentElement.scrollWidth - innerWidth,
    maxY: document.documentElement.scrollHeight - innerHeight,
  };
}
// In the page, and only in its memory (nothing is saved, so the next page load has the home as it was): a room with
// every light and switch in it, so its page scrolls well past 64 however the tests before this one left the home, and
// enough rooms that Rooms scrolls past 400. Returns the room's id.
function stage(name) {
  const c = window.__copper;
  c.H.ensureRooms();
  const rooms = () => c.S.config.settings.rooms;
  const r = rooms().find(x => x.name === name) || c.EDIT.createRoom(name);
  for (const d of c.data.controllable()) c.EDIT.moveDevice(d.device_id, r.id);
  for (let i = 1; rooms().length < 8; i++) c.EDIT.createRoom(`Spare room ${i}`);
  c.render();
  return r.id;
}
// Scroll, then let the listener's frame land.
async function scrollTo(page, y) {
  await page.evaluate(async y => {
    window.scrollTo(0, y);
    for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  }, y);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  for (const [W, H] of [[412, 915], [360, 780]]) {
    console.log(`\n---- ${W} x ${H}`);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|woff2|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    const C = (fn, arg) => page.evaluate(fn, arg);
    const M = () => C(measure);
    const shot = async name => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${W}.png`) }); };
    const go = async hash => { await C(h => { location.hash = h; }, hash); await wait(900); };
    await page.goto(`http://127.0.0.1:${PORT}/ui/#rooms`);
    await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
    await wait(1200);
    await C(() => window.__copper.closeSheet());
    const aid = await C(stage, 'Study');
    await go('home'); await go('rooms');

    // ---- Rooms: no back button. The title at x 20 shrinks to 0.6 rising to centre y 72; the + circle 56 to 44 ----
    for (const y of [0, 16, 32, 64, 400]) {
      await scrollTo(page, y);
      const m = await M();
      const p = Math.min(1, m.y / 64);
      await shot(`rooms-${y}`);
      check(`Rooms at ${y}: scrolled there (the page is long enough)`, near(m.y, y, 1), m.y);
      check(`Rooms at ${y}: p is the scroll over 64`, near(m.p, p, 0.002), m.p);
      check(`Rooms at ${y}: the title's left edge stays at 20`, near(m.t.l, 20), m.t.l);
      check(`Rooms at ${y}: the title's scale is 1 - 0.4 p`, near(m.t.h / 44, 1 - 0.4 * p, 0.005), m.t.h / 44);
      check(`Rooms at ${y}: the title is centred on y 80 - 8 p`, near(m.t.cy, 80 - 8 * p), m.t.cy);
      check(`Rooms at ${y}: the + circle is 56 - 12 p`, near(m.a1.w, 56 - 12 * p) && near(m.a1.h, 56 - 12 * p), m.a1.w);
      check(`Rooms at ${y}: the + circle's right edge stays 20 from the screen's and its centre is y 80 - 8 p`, near(m.a1.r, W - 20) && near(m.a1.cy, 80 - 8 * p), { r: m.a1.r, cy: m.a1.cy });
      check(`Rooms at ${y}: the scrim's opacity is p`, near(m.scrim.o, p, 0.002), m.scrim.o);
      check(`Rooms at ${y}: the header row, and the scrim hanging from it, stays at the top of the screen`, near(m.bar.t, 0), m.bar.t);
      check(`Rooms at ${y}: no sideways scroll`, m.hscroll <= 0, m.hscroll);
    }
    const s = (await M()).scrim;
    check('the scrim is 124 tall, full width, #121212 at 72%, blurred 20 and masked from 100 to 124', s.h === 124 && s.w >= W && /blur\(20px\)/.test(s.blur) && /100px/.test(s.mask) && /124px/.test(s.mask) && /rgba\(18, 18, 18, 0\.72\)/.test(s.bg), s);
    check('at 64 the bar spans 44 to 100: the circle is 44 at y 50', await M().then(m => near(m.a1.t, 50) && near(m.a1.b, 94)), null);

    // ---- a redraw mid-scroll leaves the header where it was ----
    await scrollTo(page, 32);
    const was = await M();
    // measured in the same task as the redraw, before any frame could put it right
    await C(fn => { window.__measure = (0, eval)(`(${fn})`); }, measure.toString());
    const now = await C(() => { window.__copper.render(); return window.__measure(); });
    check('a redraw mid-scroll: the title stays where it was, in the same frame', !!now && near(now.t.cy, was.t.cy, 0.3) && near(now.t.h, was.t.h, 0.3), { was: was.t.cy, now: now.t.cy });
    check('a redraw mid-scroll: the circle and the scrim stay as they were', near(now.a1.w, was.a1.w, 0.3) && near(now.scrim.o, was.scrim.o, 0.001), { was: was.a1.w, now: now.a1.w });
    await wait(400);
    const later = await M();
    check('and nothing animates back to rest after it', near(later.t.cy, was.t.cy, 0.3) && near(later.a1.w, was.a1.w, 0.3), { was: was.t.cy, later: later.t.cy });

    // ---- a room page: the title rests under the circles and takes two steps past the back button ----
    await scrollTo(page, 0);
    await go(`room/${aid}`);
    const r0 = await M();
    check('a room page arrives at the top with its header at rest', r0.y === 0 && r0.p === 0, { y: r0.y, p: r0.p });
    check('a room page scrolls far enough to collapse', r0.maxY >= 64, r0.maxY);
    const expect = p => { const a = Math.min(p, 0.5) * 2, b = Math.max(p - 0.5, 0) * 2; return { l: 20 + 56 * a, cy: 150 - 44 * a - 34 * b, s: 1 - 0.28 * a - 0.12 * b }; };
    for (const y of [0, 16, 32, 64, Math.min(400, r0.maxY)]) {
      await scrollTo(page, y);
      const m = await M();
      const p = Math.min(1, m.y / 64), e = expect(p);
      await shot(`room-${y}`);
      check(`room at ${y}: the title's left edge is ${e.l.toFixed(1)}`, near(m.t.l, e.l), m.t.l);
      check(`room at ${y}: its centre is y ${e.cy.toFixed(1)} and its scale ${e.s.toFixed(2)}`, near(m.t.cy, e.cy) && near(m.t.h / 44, e.s, 0.005), { cy: m.t.cy, s: m.t.h / 44 });
      check(`room at ${y}: back and the other circle are ${(56 - 12 * p).toFixed(1)}, 20 in from each side`, near(m.back.w, 56 - 12 * p) && near(m.back.l, 20) && near(m.a1.r, W - 20), { back: m.back, a1: m.a1.w });
      check(`room at ${y}: the count scrolls with the page and is gone by 40`, near(m.count.o, Math.max(0, 1 - m.y / 40), 0.01) && near(m.count.t, r0.count.t - Math.min(m.y, 64), 0.75), { o: m.count.o, t: m.count.t });
    }
    // never over either circle, at every step
    const clear = async label => {
      let worst = { back: Infinity, right: Infinity };
      for (let y = 0; y <= 72; y += 2) {
        await scrollTo(page, y);
        const m = await M();
        // the back circle as a circle: the title's box keeps out of it
        const c = { x: (m.back.l + m.back.r) / 2, y: m.back.cy, rad: m.back.w / 2 };
        const nx = Math.max(m.t.l, Math.min(c.x, m.t.r)), ny = Math.max(m.t.t, Math.min(c.y, m.t.b));
        worst.back = Math.min(worst.back, Math.hypot(nx - c.x, ny - c.y) - c.rad);
        // the right circle: where they share any height, the title's box ends before it
        if (m.t.t < m.a1.b && m.t.b > m.a1.t) worst.right = Math.min(worst.right, m.a1.l - m.t.r);
      }
      check(`${label}: the title never runs under the back circle`, worst.back >= 0, Math.round(worst.back * 10) / 10);
      check(`${label}: nor under the circle on the right`, worst.right >= 0, Math.round(worst.right * 10) / 10);
    };
    await clear('the room');

    // a long name: one line, cut with an ellipsis where it rests, and the same line all the way into the bar
    await scrollTo(page, 0);
    await C(([a, n]) => { const c = window.__copper; c.EDIT.renameRoom(a, n); c.render(); }, [aid, LONG]);
    await wait(300);
    const l0 = await M();
    check('a long room name is one line cut with an ellipsis at rest', l0.th === 44 && l0.tsw > l0.tcw, { h: l0.th, sw: l0.tsw, cw: l0.tcw });
    let same = true;
    for (let y = 0; y <= 72; y += 4) {
      await scrollTo(page, y);
      const m = await M();
      if (m.th !== l0.th || m.tsw !== l0.tsw || m.tcw !== l0.tcw || m.tw !== l0.tw) same = false;
    }
    check('its line never rewraps or cuts differently as it collapses', same);
    await scrollTo(page, 64);
    const lb = await M();
    await shot('room-long-64');
    check('in the bar it ends before the circle on the right', lb.t.r <= lb.a1.l - 8, { title: lb.t.r, circle: lb.a1.l });
    await clear('the long name');
    await C(a => { const c = window.__copper; c.EDIT.renameRoom(a, 'Study'); c.render(); }, aid);
    await scrollTo(page, 0);

    // ---- other pages with the header ----
    for (const [hash, back] of [['scenes', true], ['activity', true], ['remote/12', true], ['settings', false], ['home', false], ['remotes', false], ['routines', false]]) {
      await go(hash);
      const m0 = await M();
      check(`${hash} has the header`, !!m0.bar && !!m0.t, hash);
      if (!m0.bar) continue;
      const y = Math.min(64, m0.maxY);
      await scrollTo(page, y);
      const m = await M();
      const p = Math.min(1, m.y / 64);
      await shot(`${hash.replace('/', '-')}-${y}`);
      // (a title that is its own row is padded 20 all round but the bottom: its words are 42 down its box, at its scale)
      const words = m.words.l;
      check(`${hash} at ${y}: collapsed as far as it scrolls (p ${p.toFixed(2)})`, near(m.p, p, 0.002) && near(m.scrim.o, p, 0.002), { p: m.p, o: m.scrim.o });
      if (p === 1) check(`${hash} at 64: the title's words start at ${back ? 76 : 20}, centred on y 72, at 0.6`, near(words, back ? 76 : 20, 1) && near(m.t.h / m.th, 0.6, 0.005) && near(back ? m.t.t + 42 * (m.t.h / m.th) : m.t.cy, 72, 1), { words, s: m.t.h / m.th, top: m.t.t });
      check(`${hash}: no sideways scroll`, m.hscroll <= 0, m.hscroll);
      if (m0.maxY >= 400) { await scrollTo(page, 400); await shot(`${hash.replace('/', '-')}-400`); }
      await scrollTo(page, 0);
    }

    // ---- Rooms put back where it was scrolled has its header collapsed from its first frame ----
    await go('rooms');
    // Rooms scrolled well past 64, with the room's card in the middle of the screen
    const cardY = await C(a => { const el = document.querySelector(`#screen .room-big[data-go="room/${a}"]`); return el.getBoundingClientRect().top + scrollY; }, aid);
    await scrollTo(page, Math.max(200, cardY - 330));
    const y0 = (await M()).y;
    check('Rooms is scrolled past 64 with the card on screen', y0 >= 200, y0);
    await C(() => {
      window.__first = null;
      new MutationObserver((_, o) => {
        const h = document.querySelector('#screen .rooms-head h1'); if (!h) return;
        o.disconnect();
        // the header row itself is never faded as it comes back (that would cut its scrim's blur off while it plays)
        setTimeout(() => { window.__rowFaded = [...document.querySelectorAll('.bar')].some(b => b.getAnimations().some(a => !a.effect.pseudoElement && a.effect.getKeyframes().some(k => 'opacity' in k))); }, 0);
        window.__first = { y: scrollY, p: Number(document.getElementById('app').style.getPropertyValue('--hdr-p')), scale: getComputedStyle(h).scale, anims: h.getAnimations().filter(a => a.effect.getKeyframes().some(k => 'scale' in k || 'translate' in k)).length };
      }).observe(document.getElementById('screen'), { childList: true });
    });
    const card = `#screen .room-big[data-go="room/${aid}"]`;
    const before = await C(s => { const el = document.querySelector(s); const b = el.querySelector('.nm').getBoundingClientRect(); return { l: b.left, t: b.top }; }, card);
    await C(s => document.querySelector(s).click(), card);
    await wait(1500);
    const opened = await M();
    check('a room opened from its card arrives at the top, its header at rest', opened.y === 0 && opened.p === 0 && near(opened.t.l, 20), { y: opened.y, p: opened.p });
    // scrolled, then Back: the room closes into its card from where its title is, in the bar
    await scrollTo(page, Math.min(60, opened.maxY));
    const h1 = await C(() => { const b = document.querySelector('#screen .room-title h1').getBoundingClientRect(); const c = document.querySelector('#screen .room-title .count'); return { l: b.left, t: b.top, w: b.width, co: Number(getComputedStyle(c).opacity) }; });
    await shot('close-before');
    await C(() => {
      window.__close = [];
      const tick = () => {
        const g = document.querySelector('.page-ghost .room-title h1');
        const c = document.querySelector('.page-ghost .room-title .count');
        const copy = document.querySelector('.m10-top span');
        const b = g && g.getBoundingClientRect();
        window.__close.push(b ? { l: b.left, t: b.top, w: b.width, co: c ? Number(getComputedStyle(c).opacity) : null, copy: copy ? Number(getComputedStyle(copy).opacity) : null } : null);
        if (window.__close.length < 90) requestAnimationFrame(tick);
      };
      history.back();
      requestAnimationFrame(tick);
    });
    await wait(1800);
    const frames = (await C(() => window.__close)).filter(Boolean);
    const first = await C(() => window.__first);
    check('Back to Rooms puts it where it was scrolled, header collapsed in its first frame, the collapse not animated', !!first && near(first.y, y0, 1) && first.p === 1 && /^0\.6/.test(first.scale) && first.anims === 0, first);
    check('the room closed with a flight of its own (its title flew)', frames.length > 10, frames.length);
    check('no header row, the room\'s or Rooms\', was faded whole as it did (its scrim keeps its blur)', (await C(() => window.__rowFaded)) === false);
    if (frames.length) {
      const f0 = frames[0];
      check('the close starts with the title exactly where it was in the bar: no jump', near(f0.l, h1.l, 0.5) && near(f0.t, h1.t, 0.5) && near(f0.w, h1.w, 0.5), { was: h1, first: f0 });
      const steps = frames.slice(1).map((f, i) => Math.hypot(f.l - frames[i].l, f.t - frames[i].t));
      check('and moves smoothly from there (no step bigger than the flight\'s fastest frame)', Math.max(...steps.slice(0, 3)) < 12, steps.slice(0, 5).map(Math.round));
      check('the count, already gone, does not flash back as the room closes', frames.every(f => f.co == null || f.co <= h1.co + 0.01), frames.map(f => f.co).slice(0, 6));
      const fl = frames[frames.length - 1];
      check('the close ends on the card\'s label: no jump at the end', near(fl.l, before.l, 2) && near(fl.t, before.t, 2), { last: fl, label: before });
    }
    const after = await M();
    check('and lands on Rooms as it was scrolled, header collapsed, nothing left over', near(after.y, y0, 1) && after.p === 1 && !(await C(() => document.querySelector('.page-ghost, .op-top'))), { y: after.y, p: after.p });
    await shot('close-after');

    // ---- a sheet over a scrolled page leaves the page and its header where they are ----
    await go('settings');
    await scrollTo(page, 400);
    const st0 = await M();
    const link = await C(() => { const b = [...document.querySelectorAll('#screen [data-go^="settings/"]')].find(x => { const r = x.getBoundingClientRect(); return r.top > 140 && r.bottom < innerHeight - 140; }); return b ? b.dataset.go : null; });
    check('a row on screen that opens a sheet', !!link, link);
    if (link) {
      await C(g => document.querySelector(`#screen [data-go="${g}"]`).click(), link);
      await page.waitForSelector('#sheet-root .sheet', { timeout: 5000 }).catch(() => {});
      await wait(700);
      const st1 = await M();
      await shot('sheet-over');
      check('with the sheet up the page has not moved and its header is still collapsed', near(st1.y, st0.y, 1) && st1.p === st0.p && near(st1.t.cy, st0.t.cy, 0.3), { before: [st0.y, st0.p], after: [st1.y, st1.p] });
      await page.goBack(); await wait(700);
      const st2 = await M();
      check('and closing it leaves both where they were', near(st2.y, st0.y, 1) && st2.p === st0.p && near(st2.t.cy, st0.t.cy, 0.3), { after: [st2.y, st2.p] });
    }

    // ---- the night look: the same header, warmed ----
    if (W === 412) {
      await page.goto(`http://127.0.0.1:${PORT}/ui/?night=1#rooms`);
      await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
      await wait(1200);
      await C(stage, 'Study'); await wait(300);
      await scrollTo(page, 400);
      const n = await M();
      await shot('night-rooms-400');
      check('at night Rooms collapses the same', n.p === 1 && near(n.t.cy, 72) && near(n.scrim.o, 1, 0.002) && (await C(() => document.documentElement.classList.contains('night'))), { p: n.p });
    }
    await ctx.close();
  }
  check('no errors on the page', !errors.length, errors);
  await browser.close();
  if (bad) { console.log(`FAILED ${bad}`); process.exit(1); }
  console.log('all passed');
})().catch(e => { console.log('FAILED', e.message); process.exit(1); });
