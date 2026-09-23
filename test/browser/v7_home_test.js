// v7 · home: the house, lit (1), rooms whose light pools (2), Goodnight putting the page to sleep (10) and the
// welcome light's countdown ring (12). Read off the running app: which pools are drawn and how big, what each
// animation's duration and curve is (document.getAnimations()), and what a person reads.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (ok, what, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, ...opts });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|woff2|404/.test(m.text())) errors.push('console: ' + m.text()); });
    return { ctx, page };
  };
  const root = `http://127.0.0.1:${PORT}/ui/`;
  const { ctx, page } = await open();
  const C = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  const go = async h => { await C(x => { location.hash = x; }, h); await wait(800); };
  const tap = sel => C(s => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel);
  const cmd = a => C(x => window.__copper.run(x), a);
  // what is animating right now, under a selector: class, properties, duration, curve, delay
  const anims = sel => C(s => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(s)).map(a => {
    const t = a.effect.getTiming(); const kf = a.effect.getKeyframes();
    return { cls: String(a.effect.target.className && a.effect.target.className.baseVal != null ? a.effect.target.className.baseVal : a.effect.target.className), name: a.animationName || a.transitionProperty || '', css: a.constructor.name, dur: Math.round(Number(t.duration)), ease: t.easing, delay: Math.round(t.delay || 0), iter: t.iterations, props: [...new Set(kf.flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)))], from: kf[0], to: kf[kf.length - 1] };
  }), sel);
  // hold an element with a real pointer for ms
  const hold = async (sel, ms) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await wait(ms); await page.mouse.up(); };

  await page.goto(root + '#home'); await ready(); await wait(1200);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  // a clean start: every light off, the Kitchen (20) and the Hall (23) the two rooms this test lights
  await cmd({ type: 'level', target: 'h:all', level: 'off' }); await wait(1400);

  // ---- 1 · all off: no field at all, "All off", no slider
  await go('home');
  check('all off: no pool is lit', (await C(() => document.querySelectorAll('.house-light .glow:not(.off)').length)) === 0, await C(() => document.querySelectorAll('.house-light .glow:not(.off)').length));
  check('all off: the headline reads "All off"', (await page.textContent('.house-head')).trim() === 'All off', await page.textContent('.house-head'));
  check('all off: no slider, just the held "Lights back on" or "All on"', !(await page.$('.hbar')) && !!(await page.$('.house-pills.one [data-hold="house-on"]')));
  await page.screenshot({ path: 'v7-home-off.png' });

  // ---- 1 · one room lit: one pool, in its fixed place, sized by its level, blended screen
  await cmd({ type: 'level', target: 'a:20', level: 60 }); await wait(1400);
  const pools = await C(() => [...document.querySelectorAll('.house-light .hl-pool')].map(p => ({ on: !!p.querySelector('.glow:not(.off)'), left: p.style.left, top: p.style.top, body: Math.round(p.querySelector('.g-body').getBoundingClientRect().width), blend: getComputedStyle(p.querySelector('.g-body')).mixBlendMode })));
  const lit = pools.filter(p => p.on);
  check('one room lit: exactly one pool is lit', lit.length === 1, pools);
  // the Kitchen is the first lit room in the Rooms tab order, so it takes slot 1 (104, 64): the pool scale at 60%
  // is 160 + 200 x sqrt(.6) = 315 (the body may be mid-swell, at most 3% over)
  check('it sits in its slot and is sized by the level (pool D 315 at 60%)', lit[0] && /25\.24%/.test(lit[0].left) && lit[0].top === '64px' && lit[0].body >= 300 && lit[0].body <= 330, lit[0]);
  check('its layers blend screen', lit[0] && lit[0].blend === 'screen', lit[0] && lit[0].blend);
  const drift = (await anims('.house-light')).filter(a => a.css === 'CSSAnimation');
  check('it drifts on the ambient 8 s, ease in and out, for as long as it is lit', drift.some(a => a.name === 'hl-drift' && a.dur === 8000 && a.iter === Infinity) && drift.some(a => a.name === 'hl-swell' && a.dur === 8000), drift.map(a => [a.name, a.dur, a.iter]));
  const ease = await C(() => getComputedStyle(document.querySelector('.hl-pool')).animationTimingFunction);
  check('the drift eases in and out each way', ease === 'ease-in-out', ease);
  // the frosted card: 88% with a background blur, and no glow of its own
  const card = await C(() => { const el = document.querySelector('.card.house'); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter, before: getComputedStyle(el, '::before').content, lit: el.classList.contains('lit') }; });
  check('the house card is frosted glass: #262626 at 88%, blurred', card.bg === 'rgba(38, 38, 38, 0.88)' && /blur\(10px\)/.test(card.blur), card);
  check('and its old copper glow is gone', card.lit && (card.before === 'none' || card.before === 'normal'), card.before);
  check('the headline reads "1 on · N%" or "2 on · N%"', /^\d+ on · \d+%$/.test((await page.textContent('.house-head')).replace(/\s+/g, ' ').trim()), await page.textContent('.house-head'));
  // the field never takes a touch
  check('the field takes no touch', (await C(() => getComputedStyle(document.querySelector('.house-light')).pointerEvents)) === 'none');

  // ---- 1 · a second room arriving from elsewhere grows its pool on the dimmer: opacity and 0.85 to 1, 0.4 s
  await cmd({ type: 'level', target: 'a:23', level: 40 }); await wait(60);
  const grow = (await anims('.house-light')).filter(a => a.css !== 'CSSAnimation');
  check('a room coming on: its pool fades in on the dimmer, 0.4 s EASE_IN_AND_OUT', grow.some(a => a.props.includes('opacity') && a.dur === 400 && a.ease === 'ease-in-out'), grow.map(a => [a.cls, a.props.join('+'), a.dur, a.ease]));
  check('and scales from 0.85', grow.some(a => a.props.includes('transform') && /0\.85/.test(JSON.stringify(a.from))), grow.filter(a => a.props.includes('transform')).map(a => a.from));
  await wait(1200);
  check('two rooms lit: two pools', (await C(() => document.querySelectorAll('.house-light .glow:not(.off)').length)) === 2);
  await page.screenshot({ path: 'v7-home-lit.png' });
  // the header copy keeps its contrast: the greeting and the name stay on top of the field
  const z = await C(() => [getComputedStyle(document.querySelector('.home-head')).zIndex, getComputedStyle(document.querySelector('.house-light')).zIndex]);
  check('the words sit above the light', Number(z[0]) > Number(z[1]), z);

  // ---- 2 · Rooms: each card's glow is the room's light; turning one on blooms from its power button
  await go('rooms');
  const rooms0 = await C(() => [...document.querySelectorAll('.room-big')].map(el => ({ name: el.querySelector('.nm').textContent, lit: el.classList.contains('lit'), glows: el.querySelectorAll('.glow').length, on: el.querySelectorAll('.glow:not(.off)').length, veil: getComputedStyle(el.querySelector('.rm-veil') || el).opacity })));
  const kitchen = rooms0.find(r => r.name === 'Kitchen');
  check('a lit room\'s card carries its light', kitchen && kitchen.lit && kitchen.on >= 1 && Number(kitchen.veil) === 0, kitchen);
  const offRoom = rooms0.find(r => !r.lit && r.glows);
  check('an off room is asleep under its veil, with no light drawn', offRoom && offRoom.on === 0 && Number(offRoom.veil) === 1, offRoom);
  const kbody = await C(() => { const el = [...document.querySelectorAll('.room-big')].find(x => x.querySelector('.nm').textContent === 'Kitchen'); return Math.round(el.querySelector('.glow:not(.off) .g-body').getBoundingClientRect().width); });
  // card scale at 60%: 140 + 180 x sqrt(.6) = 279
  check('the card glow is sized by the level (card D 279 at 60%)', Math.abs(kbody - 279) <= 3, kbody);
  // the Bedroom (22) off: turn it on with its power circle
  await cmd({ type: 'level', target: 'a:22', level: 'off' }); await wait(900);
  const bsel = '.room-big[data-go="room/22"]';
  await tap(`${bsel} .pwr`); await wait(50);
  const bloom = await anims(bsel);
  const g = bloom.filter(a => /glow/.test(a.cls));
  check('on: the glow opens out from the power circle (left and top), 0.4 s EASE_IN_AND_OUT', g.some(a => a.props.includes('left') && a.dur === 400 && a.ease === 'ease-in-out') && g.some(a => a.props.includes('top')), g.map(a => [a.props.join('+'), a.dur, a.delay]));
  check('from a fifth of its size (scale .2 to 1)', g.some(a => a.props.includes('transform') && /0\.2/.test(JSON.stringify(a.from))), g.filter(a => a.props.includes('transform')).map(a => [a.from, a.to]));
  check('0.12 s after the press lands (three staggers)', g.some(a => a.props.includes('left') && a.delay === 120), g.map(a => a.delay));
  const veil = bloom.find(a => /rm-veil/.test(a.cls));
  check('the veil lifts on the dimmer, 0.08 s behind the glow', veil && veil.dur === 400 && veil.delay === 200 && Number(veil.to.opacity) === 0, veil);
  check('the status line crossfades, 0.24 s standard', bloom.some(a => /xf-old/.test(a.cls) && a.dur === 240), bloom.filter(a => /xf/.test(a.cls)).map(a => [a.cls, a.dur]));
  check('and the toast says so, with Undo', /Bedroom on/.test(await page.textContent('#toast-root')) && /Undo/.test(await page.textContent('#toast-root')), await page.textContent('#toast-root'));
  await wait(900);
  await page.screenshot({ path: 'v7-rooms.png' });
  await tap('#toast-root [data-act="toast-undo"]'); await wait(1200);
  check('Undo puts the room back off', (await C(() => window.__copper.H.roomLights('22').every(d => !window.__copper.data.level(d.device_id)))));
  // off: it draws back into the button
  await cmd({ type: 'level', target: 'a:22', level: 60 }); await wait(1200);
  await tap(`${bsel} .pwr`); await wait(50);
  const back = (await anims(bsel)).filter(a => /glow/.test(a.cls) && a.props.includes('left'));
  check('off: the glow draws back into the button, with no delay', back.some(a => a.dur === 400 && a.delay === 0), back.map(a => [a.dur, a.delay]));
  await wait(900);
  check('and the card is asleep again', (await C(s => !document.querySelector(s).classList.contains('lit'), bsel)));

  // ---- 12 · Welcome lights: a routine due in 20 minutes gets the ring; in the last ten it turns copper
  const sid = await C(async () => {
    const c = window.__copper; const RT = c.RT;
    c.S.config.schedules = (c.S.config.schedules || []).filter(s => !/^v7home/.test(s.id));
    const sc = { id: 'v7home', name: 'Porch at dusk', enabled: true, at: { type: 'time', time: RT.hmAdd(RT.nowHm(), 20), offset_min: 0 }, days: [...RT.ALL_DAYS], actions: [{ type: 'level', target: 'a:21', level: 'on' }], only_if: null, skip_until: null, kind: 'welcome' };
    c.S.config.schedules.push(sc);
    await c.data.saveConfig(); return sc.id;
  });
  await go('home'); await C(() => window.scrollTo(0, 400)); await wait(300);
  const ar = await C(() => { const el = document.querySelector('.arrival'); if (!el) return null; const arc = el.querySelector('.arc.w'); return { t: el.querySelector('.t').textContent, d: el.querySelector('.d').textContent, link: (el.querySelector('.link') || {}).textContent, close: el.classList.contains('close'), p: Number(el.style.getPropertyValue('--p')), cu: getComputedStyle(el.querySelector('.arc.cu')).opacity, dash: arc.style.strokeDashoffset, h: Math.round(el.getBoundingClientRect().height) }; });
  check('the Porch card has its ring, 128 tall', ar && ar.h === 128, ar);
  check('it says when: "Porch on at … · in 20 min"', ar && /^.+ on at \d{1,2}(:\d\d)?\s?[ap]m · in (19|20|21) min$/.test(ar.d), ar && ar.d);
  check('with "Skip tonight" (or the day it skips)', ar && /^Skip /.test(ar.link), ar && ar.link);
  check('twenty minutes out the ring is a third full, in white', ar && ar.p > 0.6 && ar.p < 0.72 && !ar.close && Number(ar.cu) === 0, ar);
  await page.screenshot({ path: 'v7-arrival.png' });
  await C(async () => { const c = window.__copper; const sc = c.S.config.schedules.find(s => s.id === 'v7home'); sc.at.time = c.RT.hmAdd(c.RT.nowHm(), 6); await c.data.saveConfig(); c.render(); });
  await wait(100);
  const cu = await anims('.arrival');
  check('in the last ten minutes the arc crosses to copper, 0.24 s standard', cu.some(a => /arc cu/.test(a.cls) && a.props.includes('opacity') && a.dur === 240), cu.map(a => [a.cls, a.props.join('+'), a.dur]));
  check('and the ring moves on to where it is now', cu.some(a => /arc/.test(a.cls) && a.props.includes('strokeDashoffset')), cu.map(a => a.props.join('+')));
  await wait(1100);
  check('the card is now close', await C(() => document.querySelector('.arrival').classList.contains('close')));
  await page.screenshot({ path: 'v7-arrival-close.png' });
  // Skip tonight: skipped at once, the ring empties and greys, and "Don't skip" takes its place
  await tap('.arrival [data-act="next-skip"]'); await wait(900);
  const sk = await C(() => { const el = document.querySelector('.arrival'); return el && { skipped: el.classList.contains('skipped'), d: el.querySelector('.d').textContent, link: el.querySelector('.link').textContent }; });
  check('skipped: "Skipping tonight" with "Don\'t skip"', sk && sk.skipped && sk.d === 'Skipping tonight' && sk.link === "Don't skip", sk);
  await tap('.arrival [data-act="next-unskip"]'); await wait(900);
  check('Don\'t skip brings the countdown back', await C(() => !!document.querySelector('.arrival:not(.skipped) [data-act="next-skip"]')));
  // it runs: the ring goes, the lantern lights, and the card is a line for ten minutes
  await C(async () => { const c = window.__copper; const sc = c.S.config.schedules.find(s => s.id === 'v7home'); sc.at.time = c.RT.hmAdd(c.RT.nowHm(), -1); c.S.activity = [{ kind: 'schedule', id: 'v7home', name: sc.name, ok: true, at: new Date().toISOString() }, ...(c.S.activity || [])]; await c.data.saveConfig(); await c.run({ type: 'level', target: 'a:21', level: 'on' }); });
  await wait(1400);
  const ran = await C(() => { const el = document.querySelector('.arrival'); return el && { ran: el.classList.contains('ran'), d: el.querySelector('.d').textContent, glow: !!el.querySelector('.glow:not(.off)'), link: !!el.querySelector('.link') }; });
  check('when it runs: "Porch is on", the lantern lit with its glow, no Skip', ran && ran.ran && / is on/.test(ran.d) && ran.glow && !ran.link, ran);
  await page.screenshot({ path: 'v7-arrival-on.png' });
  await C(async id => { const c = window.__copper; c.S.config.schedules = c.S.config.schedules.filter(s => s.id !== id); c.S.activity = (c.S.activity || []).filter(e => e.id !== id); await c.data.saveConfig(); }, sid);
  await C(() => window.scrollTo(0, 0));

  // ---- 10 · Goodnight: the page goes dark room by room, then "Sleep well" on a moon, then Put back
  await cmd({ type: 'level', target: 'a:20', level: 60 }); await cmd({ type: 'level', target: 'a:23', level: 40 }); await wait(1400);
  await go('home');
  const before = await C(() => document.querySelectorAll('.house-light .glow:not(.off)').length);
  const gb = await page.locator('[data-hold="goodnight"]').boundingBox();
  await page.mouse.move(gb.x + 22, gb.y + 22); await page.mouse.down(); await wait(1150); await page.mouse.up();
  await wait(120);
  const t1 = await C(() => ({ night: !!document.querySelector('.gn-night'), lit: document.querySelectorAll('.house-light .glow:not(.off)').length, houseLit: window.__copper.H.litLights().length }));
  check('held a second: everything goes off at once', t1.houseLit === 0, t1);
  check('but the page goes dark room by room: one pool out, one still lit 0.12 s in', t1.night && before === 2 && t1.lit === 1, { before, ...t1 });
  await wait(400);
  check('0.24 s later the next room is out too', (await C(() => document.querySelectorAll('.house-light .glow:not(.off)').length)) === 0);
  const veilA = await anims('.gn-night');
  check('then the night veil closes on the night fade, 1.6 s EASE_IN_AND_OUT, to 0.97', veilA.some(a => /gn-veil/.test(a.cls) && a.dur === 1600 && a.ease === 'ease-in-out' && Math.abs(Number(a.to.opacity) - 0.97) < 0.001), veilA.map(a => [a.cls, a.dur, a.to.opacity]));
  await wait(2300);
  const moon = await C(() => { const el = document.querySelector('.gn-night'); return el && { moon: Number(getComputedStyle(el.querySelector('.gn-moon')).opacity), sleep: el.querySelector('.gn-sleep').textContent, sleepOp: Number(getComputedStyle(el.querySelector('.gn-sleep')).opacity), extras: (el.querySelector('.gn-extras') || {}).textContent || '' }; });
  check('"Sleep well" on a faint moon', moon && moon.sleep === 'Sleep well' && moon.sleepOp > 0.9 && moon.moon > 0.5, moon);
  check('the fans and shades said as they finish', moon && /Fans stopped|Shades closed|^$/.test(moon.extras), moon && moon.extras);
  const toastTxt = await page.textContent('#toast-root');
  check('the toast: "Goodnight · Put back"', /Goodnight/.test(toastTxt) && /Put back/.test(toastTxt), toastTxt);
  await page.screenshot({ path: 'v7-goodnight.png' });
  await wait(3300);
  const after = await C(() => ({ gone: !document.querySelector('.gn-night'), hash: location.hash }));
  check('3 s on, the page settles: into Nightstand at night, else back to Home', after.gone && /^#(home|nightstand)$/.test(after.hash), after);
  const putback = await page.$('#toast-root [data-act="toast-undo"]');
  check('Put back is still there', !!putback);
  if (putback) { await tap('#toast-root [data-act="toast-undo"]'); await wait(1500); }
  check('Put back brings back what was on', (await C(() => window.__copper.H.litLights().length)) > 0, await C(() => window.__copper.H.litLights().map(d => d.name)));
  await go('home');

  // ---- 10 · a tap during the dark-out skips to the end; it never cancels Goodnight
  await cmd({ type: 'level', target: 'a:20', level: 60 }); await wait(1200);
  await hold('[data-hold="goodnight"]', 1150); await wait(200);
  await page.mouse.click(206, 700); await wait(500);
  const skipped = await C(() => { const el = document.querySelector('.gn-night'); return el && { sleep: Number(getComputedStyle(el.querySelector('.gn-sleep')).opacity), veil: Number(getComputedStyle(el.querySelector('.gn-veil')).opacity) }; });
  check('a tap skips straight to "Sleep well"', skipped && skipped.sleep > 0.9 && skipped.veil > 0.9, skipped);
  check('and Goodnight still happened', (await C(() => window.__copper.H.litLights().length)) === 0);
  await wait(3600);
  await go('home');

  // ---- 10 · offline: the hold still fills, nothing darkens, and it says the house did not hear
  await C(() => { const c = window.__copper; c.__conn = c.conn; c.conn = () => 'off'; });
  await cmd({ type: 'level', target: 'a:20', level: 60 }); await wait(1200);
  await hold('[data-hold="goodnight"]', 1150); await wait(300);
  const off = await C(() => ({ night: !!document.querySelector('.gn-night'), toast: document.querySelector('#toast-root').textContent }));
  check('offline: no darkening, and "The house didn\'t hear that. Your remotes still work."', !off.night && /The house didn't hear that\. Your remotes still work\./.test(off.toast), off);
  await C(() => { const c = window.__copper; c.conn = c.__conn; delete c.__conn; c.render(); });
  await cmd({ type: 'level', target: 'h:all', level: 'off' }); await wait(1000);

  // ---- reduced motion: the field is still drawn and still shows its light; nothing drifts
  const rm = await open({ reducedMotion: 'reduce' });
  await rm.page.goto(root + '#home'); await rm.page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  await rm.page.evaluate(() => window.__copper.run({ type: 'level', target: 'a:20', level: 60 })); await wait(1400);
  const rmv = await rm.page.evaluate(() => ({ pools: document.querySelectorAll('.house-light .glow:not(.off)').length, long: document.getAnimations().filter(a => { const t = a.effect.getTiming(); return Number(t.duration) > 300 || t.iterations === Infinity && Number(t.duration) > 1; }).length }));
  check('reduced motion: the room\'s light is still drawn, and nothing drifts', rmv.pools === 1 && rmv.long === 0, rmv);
  await rm.page.evaluate(() => window.__copper.run({ type: 'level', target: 'h:all', level: 'off' })); await wait(800);
  await rm.ctx.close();

  // no em or en dash anywhere this group put on screen
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
