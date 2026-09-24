// M14 · A remote opens from its card: on Remotes, a remote's card opens into the remote's page (web/ui/remoteopen.js),
// the drawing on the card growing into the big remote, and Back closes the page into the card again. Read off the
// running app frame by frame; screenshots are taken with every animation paused at a moment.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';

function instrument() {
  const M = window.__m14 = { t0: 0, off: 0, pausedAt: 0, frames: [], stops: [], stopped: null, on: false };
  M.now = () => (M.pausedAt || performance.now()) - M.t0 - M.off;
  M.stop = () => { M.pausedAt = performance.now(); M.held = document.getAnimations().filter(a => a.playState === 'running'); for (const a of M.held) a.pause(); };
  M.go = () => { M.off += performance.now() - M.pausedAt; M.pausedAt = 0; M.stopped = null; for (const a of M.held || []) if (a.playState === 'paused') a.play(); M.held = []; };
  const rect = r => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) });
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
    const q = s => document.querySelector(`.page-ghost ${s}`) || document.querySelector(`#screen ${s}`);
    const stage = q('.remote-page .rstage'), h1 = q('.remote-page .page-h1'), rart = q('.remote-page .rart');
    const top = document.querySelector('.m14-top');
    const name = h1 ? h1.textContent : '';
    const copies = top ? [...top.children] : [];
    const copy = copies.find(n => n.textContent === name);
    const lines = copies.filter(n => n !== copy);
    const blue = [...document.querySelectorAll('.rstage svg.leaders path[pathlength]')];
    const cards = [...document.querySelectorAll('.page-ghost .rgrid > .rcard, #screen .rgrid > .rcard')].filter(k => k.style.visibility !== 'hidden');
    const sa = stage && stage.getAnimations().find(a => a.effect.getKeyframes().some(k => k.clipPath));
    return {
      t: Math.round(t), at: sa && sa.playState !== 'finished' && sa.currentTime != null ? Math.round(sa.currentTime) : null,
      win: stage ? win(stage) : null, art: rart ? rect(rart.firstElementChild.getBoundingClientRect()) : null,
      h1: h1 ? words(h1) : null, h1o: op(h1), copyo: op(copy), lineo: lines.map(op),
      blue: blue.map(p => +Number(getComputedStyle(p).strokeDashoffset.replace('px', '')).toFixed(2)), blueo: blue.map(op),
      ghost: !!document.querySelector('.page-ghost'),
      cards: cards.map(k => Number(getComputedStyle(k).opacity)).filter(o => o > 0 && o < 1).length,
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
  // a shorter phone, so Remotes scrolls and has to come back where it was
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 560 }, hasTouch: true, deviceScaleFactor: 1, ...opts });
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
  const play = async (act, stops, prefix) => {
    await C(s => { const M = window.__m14; M.stops = s.slice(); M.armed = true; M.on = false; M.T = null; }, stops);
    await act();
    for (const s of stops) {
      await page.waitForFunction(x => window.__m14.stopped === x, s, { timeout: 5000 });
      await shot(`${prefix}-${String(s).padStart(4, '0')}`);
      await C(() => window.__m14.go());
    }
    await wait(1800);
    return C(() => { const M = window.__m14; M.on = false; return M.frames; });
  };
  const near = (a, b, tol) => !!a && !!b && ['l', 't', 'r', 'b'].every(k => Math.abs(a[k] - b[k]) <= tol);
  const mid = r => ({ x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 });
  const dist = (a, b) => Math.round(Math.hypot(mid(a).x - mid(b).x, mid(a).y - mid(b).y));
  const box = s => C(sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }, s);
  const wordsOf = s => C(sel => { const e = document.querySelector(sel); if (!e) return null; const g = document.createRange(); g.selectNodeContents(e); const b = g.getBoundingClientRect(); return { l: Math.round(Math.max(b.left, e.getBoundingClientRect().left)), t: Math.round(b.top), r: Math.round(Math.min(b.right, e.getBoundingClientRect().right)), b: Math.round(b.bottom) }; }, s);
  const left = () => C(() => [...document.querySelectorAll('.page-ghost, .m14-top, .m14-spot, .op-top, .rstage svg.leaders path[pathlength]')].map(e => e.getAttribute('class') || e.tagName));
  const still = () => C(async () => { let last = performance.now(); const o = new MutationObserver(() => { last = performance.now(); }); o.observe(document.querySelector('#screen'), { childList: true }); while (performance.now() - last < 1000) await new Promise(r => setTimeout(r, 100)); o.disconnect(); });

  await page.goto(root + '#home'); await ready(); await wait(1200);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  // the pretend house presses a real remote once, three seconds after it starts, which would jump Remotes to it:
  // let that go by first
  await wait(3500);
  await C(() => { location.hash = 'remotes'; }); await wait(900);
  const ids = await C(() => [...document.querySelectorAll('#screen .rgrid > .rcard')].map(el => el.dataset.go.slice(7)));
  check('Remotes lists a remote with another beside it', ids.length >= 2, ids);
  const pid = ids[0];
  // set up the usual way, as the file draws it: every key says what it does
  await C(async p => { const c = window.__copper; c.REM.applyUsualLayout(p); await c.save('', { quiet: true }); }, pid);
  await wait(600);
  const card = `#screen .rgrid > .rcard[data-go="remote/${pid}"]`;
  await C(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(400);
  await still();
  const y0 = await C(() => window.scrollY);
  const n0 = await C(() => history.state && history.state.n);
  const before = { card: await box(card), name: await wordsOf(`${card} .rc-nm`), art: await box(`${card} .rc-stage .pico-svg, ${card} .rc-stage .pico-photo`) };
  check('the card shows the remote drawn on its stage, and Remotes is scrolled', !!before.art && y0 > 20, { y0, art: before.art });
  await shot('m14-remotes-before');

  // a redraw while the finger is down takes the card from under it and the tap is lost: press again until the card
  // under the finger is the one pressed
  const cb = await page.locator(card).boundingBox();
  let pressed = 0;
  for (let i = 0; i < 4; i++) {
    await C(s => { document.querySelector(s).dataset.pressedHere = '1'; }, card);
    await page.mouse.move(cb.x + cb.width * 0.5, cb.y + cb.height * 0.68); await page.mouse.down(); await wait(250);
    pressed = await C(s => new DOMMatrix(getComputedStyle(document.querySelector(s)).transform).a, card);
    if (await C(s => !!document.querySelector(s).dataset.pressedHere, card)) break;
    await page.mouse.up(); await wait(900);
    if ((await C(() => location.hash)) !== '#remotes') { await C(() => history.back()); await wait(1500); }
  }
  check('the card presses to 0.97 while the finger is down', Math.abs(pressed - 0.97) < 0.006, pressed);

  // ---- open
  const frames = await play(async () => { await page.mouse.up(); }, [0, 60, 150, 300, 540, 700, 900, 1200, 1700], 'm14-open');
  const flightF = frames.filter(f => f.at != null && f.win);
  const f0 = flightF[0], fEnd = flightF[flightF.length - 1];
  const stageRest = await box('#screen .rstage');
  const artRest = await box('#screen .rart > *');
  const titleRest = await wordsOf('#screen .page-h1');
  check('the remote opened', (await C(() => location.hash)) === `#remote/${pid}`, await C(() => location.hash));
  check('one step in the history for one tap', (await C(() => history.state.n)) === n0 + 1);
  check('the card\'s surface starts on the card', f0 && f0.at <= 40 && near(f0.win, before.card, 6), { first: f0 && f0.win, at: f0 && f0.at, card: before.card });
  check('and opens into the page\'s stage', fEnd && fEnd.at >= 500 && near(fEnd.win, stageRest, 3), { end: fEnd && fEnd.win, stage: stageRest });
  check('the drawing on the card is the big remote: it starts on the card\'s drawing', f0 && near(f0.art, before.art, 6), { first: f0 && f0.art, card: before.art });
  check('and grows into place', fEnd && near(fEnd.art, artRest, 4), { end: fEnd && fEnd.art, rest: artRest });
  const grows = flightF.filter(f => f.at > 30 && f.at < 510);
  check('growing all the way', grows.length > 3 && grows.every((f, i) => !i || f.art.h >= grows[i - 1].art.h - 1), grows.map(f => f.art.h));
  check('the title starts at the card\'s name, width matched', f0 && dist(f0.h1, before.name) <= 6 && Math.abs(f0.h1.w - (before.name.r - before.name.l)) <= 8, { h1: f0 && f0.h1, name: before.name });
  check('and ends where it rests', fEnd && near(fEnd.h1, titleRest, 4), { end: fEnd && fEnd.h1, rest: titleRest });
  const ghosted = frames.filter(f => f.at != null && f.at > 160 && (f.copyo > 0.02 || f.h1o < 0.98));
  check('the name and the title cross only in the first 0.15 s', ghosted.length === 0, ghosted.slice(0, 3).map(f => [f.at, f.copyo, f.h1o]));
  const lines = frames.filter(f => f.at != null && f.at > 125 && f.lineo.some(o => o > 0.02));
  check('the card\'s second line fades in 0.12 s', lines.length === 0 && frames.some(f => f.at != null && f.at < 40 && f.lineo.some(o => o > 0.5)), lines.slice(0, 2).map(f => [f.at, f.lineo]));
  check('the other cards step aside', frames.some(f => f.at != null && f.at > 20 && f.at < 330 && f.ghost && f.cards >= 1), frames.map(f => [f.at, f.cards]).slice(0, 8));
  // the leaders draw on in blue, top key first, and give way to the white lines
  const drawing = frames.filter(f => f.blue.length >= 2 && f.blue[0] > 0.02 && f.blue[0] < 0.98);
  check('each key\'s leader draws on in Lutron blue, the top one first', drawing.length > 0 && drawing.every(f => f.blue[0] <= f.blue[1] + 0.001), drawing.slice(0, 3).map(f => [f.t, f.blue]));
  check('and settles to white, the blue gone', !(await left()).length, await left());
  const back = await C(() => { const b = document.querySelector('#screen .hdr .back'); return { o: getComputedStyle(b).opacity, tf: getComputedStyle(b).transform }; });
  check('the header\'s back button is in place', back.o === '1' && (back.tf === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(back.tf)), back);

  // ---- usable after
  const clear = await C(() => ['.hdr-btn.back', '.rstage .ld', '.group .row'].map(s => { const e = document.querySelector('#screen ' + s); if (!e) return s + ' missing'; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 10)); return e.contains(hit) ? 'ok' : `${s} covered by ${hit && hit.className}`; }));
  check('everything on the page is where a finger finds it', clear.every(x => x === 'ok'), clear);
  const k2 = await C(() => { const l = document.querySelectorAll('#screen .rstage .ld'); return l[l.length - 1].getAttribute('aria-label'); });
  await C(() => { const l = document.querySelectorAll('#screen .rstage .ld'); l[l.length - 1].click(); }); await wait(600);
  check('a key picked on the stage answers', (await C(() => document.querySelector('#screen .rm-key').textContent)) === k2, { want: k2, got: await C(() => document.querySelector('#screen .rm-key').textContent) });
  await C(() => document.querySelector('#screen .group .row').click()); await wait(700);
  check('a press opens as a sheet over the page, not a page', /^#remote\/[^/]+\/k\d+-single$/.test(await C(() => location.hash)) && !!(await page.$('#sheet-root .sheet')) && !(await left()).length, await C(() => location.hash));
  await C(() => history.back()); await wait(700);
  check('and closes back to the page', (await C(() => location.hash)) === `#remote/${pid}` && !(await page.$('#sheet-root .sheet')));

  // ---- back, from the page scrolled a little, so the stage closes from where it is on screen
  await C(() => window.scrollTo(0, 40)); await wait(300);
  const stageNow = await box('#screen .rstage');
  const bframes = await play(() => C(() => document.querySelector('#screen .hdr-btn.back').click()), [0, 60, 150, 300, 400, 440], 'm14-back');
  const backF = bframes.filter(f => f.at != null && f.win);
  const b0 = backF[0], bEnd = backF[backF.length - 1];
  await shot('m14-back-after');
  const cardNow = await box(card);
  check('Back returns to Remotes', (await C(() => location.hash)) === '#remotes' && (await C(() => history.state.n)) === n0);
  check('Remotes is back where it was scrolled', Math.abs((await C(() => window.scrollY)) - y0) <= 2, { now: await C(() => window.scrollY), was: y0 });
  check('the stage starts where it is on screen', b0 && b0.at <= 40 && near(b0.win, stageNow, 3) && stageNow.t < stageRest.t, { first: b0 && b0.win, stage: stageNow });
  check('and closes into the card', bEnd && bEnd.at >= 410 && near(bEnd.win, cardNow, 4) && near(cardNow, before.card, 2), { end: bEnd && bEnd.win, card: cardNow });
  check('the remote shrinks back onto the card', bEnd && near(bEnd.art, before.art, 4), { end: bEnd && bEnd.art, card: before.art });
  check('the title flies back into the name', bEnd && dist(bEnd.h1, before.name) <= 6, { h1: bEnd && bEnd.h1, name: before.name });
  const bghost = backF.filter(f => f.at < 290 && (f.copyo > 0.02 || f.h1o < 0.98));
  check('crossing only in the last 0.15 s', bghost.length === 0, bghost.slice(0, 3).map(f => [f.at, f.copyo, f.h1o]));
  check('the cards return', bframes.some(f => f.at != null && f.at > 20 && f.at < 440 && f.cards >= 1));
  check('nothing of it is left, and the card is itself again', !(await left()).length && (await C(s => getComputedStyle(document.querySelector(s)).visibility, card)) === 'visible', await left());

  // ---- the browser's Back, and a finger holding the close
  await C(s => document.querySelector(s).click(), card); await wait(1800);
  await C(() => history.back()); await wait(80);
  check('the browser\'s Back closes it into the card too', !!(await page.$('.page-ghost .rstage')) && !!(await page.$('.m14-top')));
  await wait(1000);
  check('and lands on Remotes, scrolled where it was', (await C(() => location.hash)) === '#remotes' && Math.abs((await C(() => window.scrollY)) - y0) <= 2 && !(await left()).length);
  await C(s => document.querySelector(s).click(), card); await wait(1800);
  await C(async () => { const m = await import('/ui/opening.js'); window.__back = m.followBack(); });
  await wait(250);
  await C(() => window.__back.progress(0.5)); await wait(200);
  const half = await C(() => window.__m14.sample());
  await shot('m14-follow-half');
  check('a finger holds the close half way: the stage between the page and the card', half.win && half.win.w < stageRest.r - stageRest.l - 10 && half.win.w > before.card.r - before.card.l + 10, half.win);
  await C(() => window.__back.commit()); await wait(900);
  check('let go, it lands on Remotes', (await C(() => location.hash)) === '#remotes' && !(await left()).length);

  // ---- reached another way it is the plain push
  await C(p => { location.hash = `remote/${p}`; }, pid); await wait(60);
  const plain = await C(() => ({ m14: !!document.querySelector('.m14-top'), push: document.getAnimations().some(a => { const k = a.effect.getKeyframes(); return /translateX\(24px\)/.test((k[0] && k[0].transform) || ''); }) }));
  check('a remote reached by its address comes in with the plain push', !plain.m14 && plain.push, plain);
  await wait(800);
  await C(() => history.back()); await wait(900);
  check('and goes back with the plain back', (await C(() => location.hash)) === '#remotes' && !(await left()).length);
  check('no errors on the page', !errors.length, errors);
  await ctx.close();

  // ---- reduced motion
  const rm = await open({ reducedMotion: 'reduce' });
  const P = rm.page;
  await P.goto(root + '#remotes'); await P.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  await P.click(`#screen .rgrid > .rcard[data-go="remote/${pid}"] .rc-nm`); await wait(40);
  const r1 = await P.evaluate(() => ({ hash: location.hash, ghost: !!document.querySelector('.page-ghost'), m14: !!document.querySelector('.m14-top'), anims: document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations !== Infinity && !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).length }));
  check('reduced motion: the remote arrives with no shared transition and nothing moving', /^#remote\//.test(r1.hash) && !r1.ghost && !r1.m14 && r1.anims === 0, r1);
  await P.click('#screen .hdr-btn.back'); await wait(60);
  const r2 = await P.evaluate(() => ({ hash: location.hash, ghost: !!document.querySelector('.page-ghost'), m14: !!document.querySelector('.m14-top') }));
  check('reduced motion: and Back is the plain back', r2.hash === '#remotes' && !r2.ghost && !r2.m14, r2);
  check('no errors on the page (reduced motion)', !errors.length, errors);
  await rm.ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
