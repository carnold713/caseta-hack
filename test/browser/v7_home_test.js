// v7 · home: the house, lit (1: one soft light from the top of the screen, calm and flat), rooms lit by their own
// lamps (2), Goodnight putting the page to sleep (10) and the welcome light's countdown ring (12). Read off the running
// app: where the light is and how strong, what each animation's duration and curve is (document.getAnimations()), and
// what a person reads.
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
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|404/.test(m.text())) errors.push('console: ' + m.text()); });
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

  // ---- 1 · all off: no light at all, "All off", no slider
  await go('home');
  // the page's one light (glow.js, lightHTML): lit or not, where it is, its colour and strength
  const light = () => C(() => {
    const home = document.querySelector('.home'), g = home.querySelector('.house-light');
    if (!g) return null;
    const i = g.querySelector('i'), ir = i.getBoundingClientRect(), hr = home.getBoundingClientRect();
    return {
      off: g.classList.contains('off'), op: Number(getComputedStyle(g).opacity), lights: home.querySelectorAll('.onelight').length,
      pools: home.querySelectorAll('.hl-pool, .house-light .glow').length, cx: Math.round(ir.left + ir.width / 2 - hr.left - hr.width / 2),
      cy: Math.round(ir.top + ir.height / 2 - hr.top), r: ir.width / 2 / hr.width, colour: g.querySelector('.ol-c').style.getPropertyValue('--l-c').replace(/\s/g, ''),
      blend: getComputedStyle(i).mixBlendMode, level: window.__copper.H.houseLevel(),
    };
  });
  // what the lit lamps add up to, by glow.js's own mixing, to hold the page's light to
  const blend = () => C(async () => {
    const c = window.__copper, m = await import('/ui/glow.js');
    const lamps = c.H.litLights().map(d => { const col = (c.S.states[d.device_id] || {}).color, lv = c.data.level(d.device_id); return d.color && col && col.mode === 'xy' && col.hex ? { level: lv, hex: col.hex } : { level: lv, kelvin: col && col.mode === 'ct' && col.kelvin ? col.kelvin : d.ct || d.color ? 2700 : 2200 }; });
    const b = m.blendLight(lamps); if (!b) return null;
    const h = b.hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
  });
  const strength = lv => 0.35 + 0.65 * lv / 100;
  const l0 = await light();
  check('all off: the page\'s light is out (drawn, at no strength)', l0 && l0.off && l0.op === 0, l0);
  check('all off: the headline reads "All off"', (await page.textContent('.house-head')).trim() === 'All off', await page.textContent('.house-head'));
  check('all off: no slider, just the held "Lights back on" or "All on"', !(await page.$('.hbar')) && !!(await page.$('.house-pills.one [data-hold="house-on"]')));
  await page.screenshot({ path: 'v7-home-off.png' });

  // ---- 1 · one room lit: one light from the top centre of the screen, in the colour of what is on, as strong as the
  // house is bright; it comes up on the dimmer (opacity, and 0.85 to 1)
  await cmd({ type: 'level', target: 'a:20', level: 60 }); await wait(60);
  const rise = (await anims('.house-light')).filter(a => a.css !== 'CSSAnimation');
  check('the light comes up on the dimmer, 0.4 s EASE_IN_AND_OUT', rise.some(a => a.props.includes('opacity') && a.dur === 400 && a.ease === 'ease-in-out'), rise.map(a => [a.cls, a.props.join('+'), a.dur, a.ease]));
  check('and grows from 0.85', rise.some(a => a.props.includes('transform') && /0\.85/.test(JSON.stringify(a.from))), rise.filter(a => a.props.includes('transform')).map(a => a.from));
  await wait(1400);
  const l1 = await light();
  check('one room lit: one light on the page and nothing else (no pools)', l1 && !l1.off && l1.lights === 1 && l1.pools === 0 && l1.blend === 'screen', l1);
  check('it is at the top centre, just above the top edge, its radius 70% of the screen\'s width', l1 && Math.abs(l1.cx) <= 1 && l1.cy === -12 && Math.abs(l1.r - 0.7) < 0.01, l1);
  check(`its strength is the house's level on the house's curve (${l1 && l1.level}%)`, l1 && Math.abs(l1.op - strength(l1.level)) < 0.01, l1);
  const want1 = await blend();
  check('its colour is the warm white of what is on', l1 && want1 && l1.colour === want1, { got: l1 && l1.colour, want: want1 });
  const drift = (await anims('.house-light')).filter(a => a.css === 'CSSAnimation');
  check('it drifts on the ambient 8 s, ease in and out, for as long as it is lit', drift.some(a => a.name === 'light-drift' && a.dur === 8000 && a.iter === Infinity), drift.map(a => [a.name, a.dur, a.iter]));
  const ease = await C(() => getComputedStyle(document.querySelector('.house-light i')).animationTimingFunction);
  check('the drift eases in and out each way', ease === 'ease-in-out', ease);
  // the frosted card: 88% with a background blur, and no glow of its own
  const card = await C(() => { const el = document.querySelector('.card.house'); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter, before: getComputedStyle(el, '::before').content, lit: el.classList.contains('lit') }; });
  check('the house card is frosted glass: #262626 at 88%, blurred', card.bg === 'rgba(38, 38, 38, 0.88)' && /blur\(10px\)/.test(card.blur), card);
  check('and its old copper glow is gone', card.lit && (card.before === 'none' || card.before === 'normal'), card.before);
  check('the headline reads "1 on · N%" or "2 on · N%"', /^\d+ on · \d+%$/.test((await page.textContent('.house-head')).replace(/\s+/g, ' ').trim()), await page.textContent('.house-head'));
  // the house bar's fill is flat copper
  const fill = await C(() => { const f = document.querySelector('.hbar .fill'); return f && { img: getComputedStyle(f).backgroundImage, col: getComputedStyle(f).backgroundColor }; });
  check('the house bar\'s fill is a flat copper, no gradient', fill && fill.img === 'none' && fill.col === 'rgb(217, 138, 78)', fill);
  // the light never takes a touch
  check('the light takes no touch', (await C(() => getComputedStyle(document.querySelector('.house-light')).pointerEvents)) === 'none');

  // ---- 1 · a second room arriving from elsewhere: still one light, whose strength moves to the house's level on the
  // dimmer (0.4 s)
  await cmd({ type: 'level', target: 'a:23', level: 40 }); await wait(60);
  const grow = (await anims('.house-light')).filter(a => a.css !== 'CSSAnimation');
  check('a room coming on: the light moves to the house\'s new level on the dimmer, 0.4 s EASE_IN_AND_OUT', grow.some(a => a.props.includes('opacity') && a.dur === 400 && a.ease === 'ease-in-out'), grow.map(a => [a.cls, a.props.join('+'), a.dur, a.ease]));
  await wait(1200);
  const l2 = await light();
  check('two rooms lit: still one light, at the house\'s level', l2 && l2.lights === 1 && !l2.off && Math.abs(l2.op - strength(l2.level)) < 0.01, l2);
  await page.screenshot({ path: 'v7-home-lit.png' });
  // the header copy keeps its contrast: the greeting and the name stay on top of the light
  const z = await C(() => [getComputedStyle(document.querySelector('.home-head')).zIndex, getComputedStyle(document.querySelector('.house-light')).zIndex]);
  check('the words sit above the light', Number(z[0]) > Number(z[1]), z);

  // ---- 2 · Rooms: a room with no photograph shows its illustration, whose lamps are the room's lights
  // (roomscene.js): a lit room's lamps glow, a room that is off is asleep (dim, cool, no light drawn), and turning a
  // room on lights its lamps on the dimmer. The page's one light is the house's, at the top; a card draws no glow.
  await go('rooms');
  // the page's one light is the house's, from the top; the cards draw none of their own
  const rl = await C(() => { const p = document.querySelector('.rooms'), g = p.querySelector(':scope > .rooms-light'); return { lights: p.querySelectorAll('.onelight').length, cardGlows: p.querySelectorAll('.room-big .glow').length, lit: g && !g.classList.contains('off'), op: g && Number(g.style.opacity), level: window.__copper.H.houseLevel() }; });
  check('Rooms: one light from the top at the house\'s level, no glow on any card', rl.lights === 1 && !rl.cardGlows && rl.lit && Math.abs(rl.op - strength(rl.level)) < 0.01, rl);
  // and a room's page has its own: its lights that are on, at their mean
  await go('room/20');
  const rp = await C(() => { const p = document.querySelector('.room'), g = p.querySelector(':scope > .room-light'); const c = window.__copper; const ls = c.H.roomLights('20').map(d => c.data.level(d.device_id) || 0).filter(v => v > 0); return { lights: p.querySelectorAll('.onelight').length, lit: g && !g.classList.contains('off'), op: g && Number(g.style.opacity), mean: ls.reduce((a, v) => a + v, 0) / ls.length }; });
  check('a room: one light from the top at its lights\' mean', rp.lights === 1 && rp.lit && Math.abs(rp.op - strength(rp.mean)) < 0.01, rp);
  await go('rooms');
  // a card's lamps: the strongest glow drawn, and the veil a dark room sleeps under
  const cardLight = sel => C(s => { const el = document.querySelector(s); const rl = [...el.querySelectorAll('.rs-svg [data-l]')].filter(p => p.classList.contains('rl')); const veil = el.querySelector('.rs-svg .rs-veil'); return { scene: el.classList.contains('scene'), lit: el.classList.contains('lit'), glow: Math.max(0, ...rl.map(p => Number(p.style.opacity) || 0)), veil: veil ? Number(veil.style.opacity) : null }; }, sel);
  const kname = await C(() => { const el = [...document.querySelectorAll('.room-big')].find(x => x.querySelector('.nm').textContent === 'Kitchen'); return el && el.dataset.go; });
  const kitchen = kname && await cardLight(`.room-big[data-go="${kname}"]`);
  check('a lit room\'s card is its illustration, its lamps lit and no veil', kitchen && kitchen.scene && kitchen.lit && kitchen.glow > 0 && kitchen.veil === 0, kitchen);
  const offSel = await C(() => { const el = [...document.querySelectorAll('.room-big.scene')].find(x => !x.classList.contains('lit') && x.querySelector('.rs-svg [data-fx]:not([data-empty])')); return el && `.room-big[data-go="${el.dataset.go}"]`; });
  const offRoom = offSel && await cardLight(offSel);
  check('an off room is asleep under its veil, with no light drawn', offRoom && offRoom.glow === 0 && offRoom.veil > 0.2, offRoom);
  const kmax = await C(() => { const c = window.__copper; const a = c.data.areas().find(x => x.name === 'Kitchen'); return Math.max(...c.H.roomLights(a.id).map(d => c.data.level(d.device_id) || 0)); });
  // the house's level curve: strength 0.35 + 0.65 x level
  check('the lamps\' strength is the room\'s level on the house\'s curve', Math.abs(kitchen.glow - (0.35 + 0.65 * kmax / 100)) < 0.02, { glow: kitchen.glow, level: kmax });
  // the Bedroom (22) off: turn it on with its power circle
  await cmd({ type: 'level', target: 'a:22', level: 'off' }); await wait(900);
  const bsel = '.room-big[data-go="room/22"]';
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  await tap(`${bsel} .pwr`); await wait(50);
  const bloom = await anims(bsel);
  const g = bloom.filter(a => a.props.includes('opacity') && /\brl\b/.test(a.cls));
  check('on: its lamps light on the dimmer, 0.4 s EASE_IN_AND_OUT', g.some(a => a.dur === 400 && a.ease === 'ease-in-out' && Number(a.to.opacity) > 0), g.slice(0, 4).map(a => [a.dur, a.ease, a.to.opacity]));
  check('and the veil lifts with them', g.some(a => Number(a.from.opacity) > 0.2 && Number(a.to.opacity) === 0), g.map(a => [a.from.opacity, a.to.opacity]).slice(0, 6));
  check('the status line crossfades, 0.24 s standard', bloom.some(a => /xf-old/.test(a.cls) && a.dur === 240), bloom.filter(a => /xf/.test(a.cls)).map(a => [a.cls, a.dur]));
  await wait(900);
  // the card lighting is the answer: no toast and no Undo (2ca8d0a)
  const bOn = await C(s => ({ lit: document.querySelector(s).classList.contains('lit'), on: window.__copper.H.roomLights('22').some(d => window.__copper.data.level(d.device_id) > 0), toast: document.querySelector('#toast-root').textContent }), bsel);
  check('the Bedroom is on, its card lit, and no toast or Undo', bOn.lit && bOn.on && bOn.toast === '', bOn);
  await page.screenshot({ path: 'v7-rooms.png' });
  await cmd({ type: 'level', target: 'a:22', level: 'off' }); await wait(1200);
  check('set back off directly', (await C(() => window.__copper.H.roomLights('22').every(d => !window.__copper.data.level(d.device_id)))));
  // off: the lamps go out on the dimmer, at once
  await cmd({ type: 'level', target: 'a:22', level: 60 }); await wait(1200);
  await tap(`${bsel} .pwr`); await wait(50);
  const back = (await anims(bsel)).filter(a => a.props.includes('opacity') && /\brl\b/.test(a.cls) && Number(a.to.opacity) === 0 && Number(a.from.opacity) > 0.3);
  check('off: its lamps go out on the dimmer, with no delay', back.some(a => a.dur === 400 && a.delay === 0), back.map(a => [a.dur, a.delay]).slice(0, 4));
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

  // ---- 10 · Goodnight: the page goes dark room by room, then "Sleep well" on a moon; no toast, no Put back
  await cmd({ type: 'level', target: 'a:20', level: 60 }); await cmd({ type: 'level', target: 'a:23', level: 40 }); await wait(1400);
  await go('home');
  const litBefore = await C(() => window.__copper.H.litLights().map(d => [d.device_id, window.__copper.data.level(d.device_id)]));
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  const before = await light();
  const gb = await page.locator('[data-hold="goodnight"]').boundingBox();
  await page.mouse.move(gb.x + 22, gb.y + 22); await page.mouse.down(); await wait(1150); await page.mouse.up();
  await wait(120);
  const t1 = await C(() => ({ night: !!document.querySelector('.gn-night'), op: Number(document.querySelector('.house-light').style.opacity), off: document.querySelector('.house-light').classList.contains('off'), houseLit: window.__copper.H.litLights().length }));
  check('held a second: everything goes off at once', t1.houseLit === 0, t1);
  check('but the page goes dark room by room: 0.12 s in, the light is down to the room still lit', t1.night && before && !before.off && !t1.off && t1.op > 0 && t1.op < before.op, { before, ...t1 });
  await wait(400);
  check('0.24 s later the next room is out too, and the light with it', (await C(() => document.querySelector('.house-light').classList.contains('off'))));
  const veilA = await anims('.gn-night');
  check('then the night veil closes on the night fade, 1.6 s EASE_IN_AND_OUT, to 0.97', veilA.some(a => /gn-veil/.test(a.cls) && a.dur === 1600 && a.ease === 'ease-in-out' && Math.abs(Number(a.to.opacity) - 0.97) < 0.001), veilA.map(a => [a.cls, a.dur, a.to.opacity]));
  await wait(2300);
  const moon = await C(() => { const el = document.querySelector('.gn-night'); return el && { moon: Number(getComputedStyle(el.querySelector('.gn-moon')).opacity), sleep: el.querySelector('.gn-sleep').textContent, sleepOp: Number(getComputedStyle(el.querySelector('.gn-sleep')).opacity), extras: (el.querySelector('.gn-extras') || {}).textContent || '' }; });
  check('"Sleep well" on a faint moon', moon && moon.sleep === 'Sleep well' && moon.sleepOp > 0.9 && moon.moon > 0.5, moon);
  check('the fans and shades said as they finish', moon && /Fans stopped|Shades closed|^$/.test(moon.extras), moon && moon.extras);
  const toastTxt = await page.textContent('#toast-root');
  check('no toast and no Put back: the dark page is the answer', toastTxt === '', toastTxt);
  await page.screenshot({ path: 'v7-goodnight.png' });
  await wait(3300);
  const after = await C(() => ({ gone: !document.querySelector('.gn-night'), hash: location.hash }));
  check('3 s on, the page settles: into Nightstand at night, else back to Home', after.gone && /^#(home|nightstand)$/.test(after.hash), after);
  check('and still no Put back', !(await page.$('#toast-root [data-act="toast-undo"]')));
  // put back what was on, directly
  await C(async l => { for (const [id, lv] of l) await window.__copper.run({ type: 'level', target: `d:${id}`, level: lv }); }, litBefore); await wait(1500);
  const litAgain = await C(() => window.__copper.H.litLights().map(d => d.device_id).sort());
  check('set back directly, what was on is on again', litBefore.length > 0 && JSON.stringify(litAgain) === JSON.stringify(litBefore.map(x => x[0]).sort()), { litAgain, litBefore });
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

  // ---- 10 · offline: the hold still fills and nothing darkens; it used to say the house did not hear, in a toast,
  // and toasts are off (the owner's call), so for now it says nothing
  await C(() => { const c = window.__copper; c.__conn = c.conn; c.conn = () => 'off'; });
  await cmd({ type: 'level', target: 'a:20', level: 60 }); await wait(1200);
  await hold('[data-hold="goodnight"]', 1150); await wait(300);
  const off = await C(() => ({ night: !!document.querySelector('.gn-night'), lit: window.__copper.H.litLights().length, toast: document.querySelector('#toast-root').innerHTML }));
  check('offline: no darkening, the lights left as they were, and no toast', !off.night && off.lit > 0 && off.toast === '', off);
  await C(() => { const c = window.__copper; c.conn = c.__conn; delete c.__conn; c.render(); });
  await cmd({ type: 'level', target: 'h:all', level: 'off' }); await wait(1000);

  // ---- reduced motion: the light is still drawn and still shows; nothing drifts
  const rm = await open({ reducedMotion: 'reduce' });
  await rm.page.goto(root + '#home'); await rm.page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  await rm.page.evaluate(() => window.__copper.run({ type: 'level', target: 'a:20', level: 60 })); await wait(1400);
  const rmv = await rm.page.evaluate(() => ({ pools: document.querySelectorAll('.house-light:not(.off)').length, long: document.getAnimations().filter(a => { const t = a.effect.getTiming(); return Number(t.duration) > 300 || t.iterations === Infinity && Number(t.duration) > 1; }).length }));
  check('reduced motion: the room\'s light is still drawn, and nothing drifts', rmv.pools === 1 && rmv.long === 0, rmv);
  await rm.page.evaluate(() => window.__copper.run({ type: 'level', target: 'h:all', level: 'off' })); await wait(800);
  await rm.ctx.close();

  // no em or en dash anywhere this group put on screen
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
