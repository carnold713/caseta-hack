// v7 · night: the app's night mode (design-v7-ui.md, "A lighting system · 7"), Nightstand (19) and the wake-up
// light's sunrise preview (11), read off the running app.
//
// Night mode: the chrome warms and dims and the crossing drifts over 30 s; the old brown veil is gone, so the lamps'
// own colours are untouched; `c.night` is there for glows. Nightstand: dark, nothing white or blue; a tap turns
// nothing on, a brush turns nothing on, a quarter second of a resting thumb brings the night light to 10% on the
// night fade with a 15 minute timer; off is a tap; the page does not scroll; the light is a Settings choice. The
// sunrise: scrubbing moves the sun, the clock, the level and the screen's light, and sends nothing; Try it is a hold
// that runs the real lamp for 30 s and offers Put back.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${typeof got === 'string' ? got : JSON.stringify(got)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const rgb = s => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(t => { try { if (t) localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN || '');
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  const goto = async h => { await C(x => { location.hash = x; }, h); await wait(700); };
  await page.goto(`http://127.0.0.1:${PORT}/ui/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button[type=submit]'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready && window.__copper.S.config, null, { timeout: 15000 });
  await wait(800);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  // every command a screen sends goes through c.run: write them down
  await C(() => { const c = window.__copper; window.__acts = []; const r0 = c.run; c.run = a => { window.__acts.push(a); return r0(a); }; });
  const acts = () => C(() => window.__acts.slice());
  const clearActs = () => C(() => { window.__acts.length = 0; });
  // a finger on an element: down at (dx, dy) inside it, through each step, then up after `hold` ms
  const finger = (sel, steps, hold = 0) => C(async ([s, st, ms]) => {
    const el = document.querySelector(s); const b = el.getBoundingClientRect();
    const at = ([dx, dy]) => ({ clientX: b.left + dx, clientY: b.top + dy });
    const tgt = document.elementFromPoint(at(st[0]).clientX, at(st[0]).clientY) || el;
    const fire = (type, p, t) => (t || tgt).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true, ...at(p) }));
    fire('pointerdown', st[0]);
    for (const p of st.slice(1)) { await new Promise(r => setTimeout(r, 16)); fire('pointermove', p); }
    if (ms) await new Promise(r => setTimeout(r, ms));
    fire('pointerup', st[st.length - 1]);
    tgt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...at(st[st.length - 1]) }));
  }, [sel, steps, hold]);

  // ================= night mode =================
  const look = () => C(() => { const r = document.documentElement; const cs = getComputedStyle(r);
    return { night: r.classList.contains('night'), ctx: window.__copper.night, veil: getComputedStyle(document.body, '::after').content,
      t1: cs.getPropertyValue('--text-1').trim(), t2: cs.getPropertyValue('--text-2').trim(), fill: cs.getPropertyValue('--solid-fill').trim(), blue: cs.getPropertyValue('--blue').trim(),
      body: getComputedStyle(document.querySelector('.t-h1, h1') || document.body).color, drift: cs.transitionDuration, nightlook: document.body.classList.contains('nightlook') }; });
  const force = v => C(x => { if (x == null) localStorage.removeItem('v7night'); else localStorage.setItem('v7night', x); window.__copper.render(); }, v);
  await C(() => document.documentElement.classList.remove('drift'));
  await force('0'); await wait(200);
  let n = await look();
  check(!n.night && n.ctx === false && !n.nightlook, 'day: no night class, c.night is false', n);
  check(/255,\s*255,\s*255|#fff/i.test(n.t1) || n.t1.toLowerCase() === '#ffffff' || n.t1 === 'rgb(255, 255, 255)', 'day: text is white', n.t1);
  await force('1'); await wait(200);
  n = await look();
  check(n.night && n.ctx === true && n.nightlook, 'night: the class is on the root and c.night is true', n);
  check(rgb(n.t1).join() === '241,231,220', 'night: text 1 is #F1E7DC', n.t1);
  check(rgb(n.t2).join() === '194,184,173', 'night: text 2 is #C2B8AD', n.t2);
  check(rgb(n.fill).join() === '237,227,216', 'night: white fills are #EDE3D8', n.fill);
  check(rgb(n.blue).join() === '11,92,163', 'night: controls blue is #0B5CA3', n.blue);
  check(n.veil === 'none', 'the v6 veil over the lamps is gone', n.veil);
  // the crossing drifts: with the drift armed, a second in, the text is part way between day and night
  await force('0'); await wait(150);
  await C(() => document.documentElement.classList.add('drift'));
  n = await look();
  check(/30s/.test(n.drift), 'the drift is 30 s', n.drift);
  await force('1'); await wait(1000);
  n = await look();
  const [r1, g1, b1] = rgb(n.t1);
  check(b1 < 255 && b1 > 240 && g1 < 255, 'a second into the crossing the text has only begun to warm', n.t1);
  await C(() => document.documentElement.classList.remove('drift'));
  // Settings' Night look still rules when nothing forces it
  await force(null);
  await C(() => { const c = window.__copper; c.S.config.settings.night_look = 'never'; c.render(); }); await wait(100);
  check(!(await look()).night, 'Night look never: no night');
  await C(() => { const c = window.__copper; c.S.config.settings.night_look = 'always'; c.render(); }); await wait(100);
  check((await look()).night, 'Night look always: night');
  await C(() => { const c = window.__copper; c.S.config.settings.night_look = 'auto'; c.render(); });
  // glows can take it: glowHTML with night is dimmer by 0.7
  const g = await C(async () => { const m = await import('/ui/glow.js'); const a = m.glowSpec({ level: 60, kelvin: 2700, ctx: 'card' }), b = m.glowSpec({ level: 60, kelvin: 2700, ctx: 'card', night: true }); return [a.c, b.c, m.lightStrength(60), m.lightStrength(60, true)]; });
  check(g[0] !== g[1] && Math.abs(g[3] - 0.7 * g[2]) < 1e-9, 'a light handed night is quieter (0.7 of its day strength)', g);
  await force('0');

  // ================= nightstand =================
  await C(async () => { const c = window.__copper; c.S.config.settings.night_light = null; await c.data.saveConfig(); await c.run({ type: 'level', target: 'd:10', level: 'off' }); });
  await wait(900);
  await goto('nightstand'); await wait(400);
  const ns = await C(() => ({ page: !!document.querySelector('.ns-page'), tabs: document.getElementById('tabs').hidden, bg: getComputedStyle(document.body).backgroundColor,
    title: document.querySelector('.ns-title') && document.querySelector('.ns-title').textContent, sub: document.querySelector('.ns-sub') && document.querySelector('.ns-sub').textContent,
    time: document.querySelector('.ns-time').textContent, home: !!document.querySelector('.ns-home[data-go="home"]') }));
  check(ns.page && ns.tabs, 'Nightstand opens directly at #nightstand, no tab bar', ns);
  check(rgb(ns.bg).join() === '10,9,8', 'its background is #0A0908', ns.bg);
  check(ns.title === 'Night light' && ns.sub === '', 'it says Night light, and nothing under it until a wrong tap', ns);
  check(/^\d{1,2}:\d\d$/.test(ns.time) && ns.home, 'the time, small, and Home to leave', ns.time);
  // nothing white, nothing blue
  const inks = await C(() => [...document.querySelectorAll('.ns-page, .ns-page *')].filter(e => e.getClientRects().length).flatMap(e => { const cs = getComputedStyle(e); return [cs.color, cs.backgroundColor, cs.borderTopColor]; }));
  const white = inks.filter(s => { const [r, gg, b] = rgb(s); const a = (String(s).match(/[\d.]+/g) || [])[3]; return (a === undefined || Number(a) > 0.2) && r > 225 && gg > 225 && b > 225; });
  const blue = inks.filter(s => { const [r, gg, b] = rgb(s); return b > r + 30 && b > gg + 10; });
  check(!white.length && !blue.length, 'nothing on it is white or blue', { white: white.slice(0, 3), blue: blue.slice(0, 3) });
  const lamp = await C(() => { const c = window.__copper; const h = c.S.config.settings; return c.data.dev('10') && c.data.dev('10').name; });
  // a tap turns nothing on; it says Hold, briefly
  await clearActs();
  await finger('.ns-area', [[180, 200]]);
  await wait(250);
  check(!(await acts()).length && (await C(() => document.querySelector('.ns-sub').textContent)) === 'Hold', 'a tap turns nothing on and says Hold', await acts());
  // a brush (the thumb moving) turns nothing on either
  await finger('.ns-area', [[100, 200], [100, 214], [100, 240]], 350);
  await wait(200);
  check(!(await acts()).length, 'a brush across it turns nothing on', await acts());
  await wait(2000);
  await page.screenshot({ path: 'v7-night-nightstand-off.png' });
  // a resting thumb: a quarter of a second and the lamp comes up, 10%, on the night fade, with its 15 min timer
  await finger('.ns-area', [[186, 200]], 320);
  await wait(60);
  const anim = await C(() => (document.querySelector('.ns-glow > i') || document.body).getAnimations().map(a => Math.round(a.effect.getTiming().duration)));
  await wait(400);
  let a = await acts();
  const up = a.find(x => (x.type === 'level' || x.type === 'color') && x.target === 'd:10');
  check(up && up.level === 10 && up.fade === 1.6, 'held a quarter second: the night light comes up to 10% on the night fade', a);
  const timer = a.find(x => x.type === 'timer');
  check(timer && timer.minutes === 15 && timer.level === 0 && timer.target === 'd:10', 'and goes out by itself after 15 minutes (a timer)', timer);
  check(!a.some(x => (x.level > 10) || x.level === 'on'), 'nothing comes on above 10%', a);
  check(anim.includes(1600), 'the glow rises over the night fade, 1.6 s', anim);
  await wait(1800);
  const on = await C(() => ({ on: document.querySelector('.ns-area').classList.contains('on'), glowOff: document.querySelector('.ns-glow').classList.contains('off'),
    title: document.querySelector('.ns-title').textContent, sub: document.querySelector('.ns-sub').textContent, level: window.__copper.data.level('10'),
    glowOp: getComputedStyle(document.querySelector('.ns-glow > i')).opacity,
    lights: document.querySelectorAll('.ns-page .glow:not(.off), .ns-page .onelight:not(.off), .ns-inner, .ns-candle').length }));
  check(on.on && !on.glowOff && on.glowOp === '1' && on.level === 10, 'the lamp is on at 10% and its glow is lit', on);
  check(on.lights === 1, 'and it is the page\'s one soft light (no second glow in the area or the ring)', on.lights);
  check(on.title === 'Off' && new RegExp(`^${lamp} · off at \\d{1,2}:\\d\\d (am|pm)$`).test(on.sub), 'the area now says Off, and when it goes out', on.sub);
  await page.screenshot({ path: 'v7-night-nightstand-on.png' });
  // the page never scrolls
  const sc = await C(() => ({ h: document.scrollingElement.scrollHeight, v: innerHeight, ta: getComputedStyle(document.querySelector('.ns-page')).touchAction }));
  check(sc.h <= sc.v + 1 && sc.ta === 'none', 'the page does not scroll', sc);
  // off is a tap, on the dimmer
  await clearActs();
  await finger('.ns-area', [[186, 200]]);
  await wait(120);
  const offAnim = await C(() => (document.querySelector('.ns-glow > i') || document.body).getAnimations().map(x => Math.round(x.effect.getTiming().duration)));
  await wait(600);
  a = await acts();
  check(a.some(x => x.type === 'level' && x.target === 'd:10' && x.level === 'off'), 'a tap on Off turns it off', a);
  check(offAnim.includes(400), 'and the glow goes on the dimmer, 0.4 s', offAnim);
  check(await C(() => !document.querySelector('.ns-area').classList.contains('on') && document.querySelector('.ns-glow').classList.contains('off')), 'the area is back to Night light');
  // offline: calm, one line, nothing to hold
  // which light: Settings, with a bedroom lamp by default
  await goto('settings'); await wait(300);
  const row = await C(() => { const r = [...document.querySelectorAll('.row')].find(x => /Night light/.test(x.textContent)); return r ? r.textContent.replace(/\s+/g, ' ').trim() : ''; });
  check(new RegExp(`Night light\\s*${lamp}`).test(row), 'Settings has Night light, a bedroom lamp by default', row);
  check(await C(() => !!document.querySelector('.settings-page [data-go="nightstand"]')), 'and a way to Nightstand');
  await goto('settings/nightlight'); await wait(500);
  await page.click('#sheet-root [data-act="set-nightlight"][data-v="11"]'); await wait(900);
  const chosen = await C(() => window.__copper.S.config.settings.night_light);
  check(chosen === '11', 'picking Hall makes it the night light', chosen);
  const saved = await C(async () => (await (await fetch('/api/snapshot', { headers: { authorization: 'Bearer ' + localStorage.getItem('token') } })).json()));
  check(((saved.config || saved).settings || {}).night_light === '11', 'and the hub keeps it', ((saved.config || saved).settings || {}).night_light);
  await goto('nightstand'); await wait(300);
  await clearActs();
  await finger('.ns-area', [[186, 200]], 320); await wait(500);
  a = await acts();
  check(a.some(x => x.target === 'd:11' && x.level === 10), 'Nightstand now lights Hall', a);
  await C(async () => { const c = window.__copper; await c.run({ type: 'level', target: 'd:11', level: 'off' }); c.S.config.settings.night_light = null; await c.data.saveConfig(); });
  await wait(500);

  // ================= the sunrise preview =================
  const rid = await C(async () => { const c = window.__copper; const out = c.RT.saveWakeup({ lamp: '10', alarm: '06:30', days: [1, 2, 3, 4, 5], shade: false, minutes: 25, end: 50 }); await c.data.saveConfig(); return out[0].id; });
  await goto(`routine/${rid}`); await wait(500);
  const sr = await C(() => ({ has: !!document.querySelector('.sunrise'), cap: !!document.querySelector('.sr-cap'), clock: document.querySelector('.sr-clock').textContent, lv: document.querySelector('.sr-level').textContent,
    ends: [...document.querySelectorAll('.sr-ends span')].map(x => x.textContent), tryIt: document.querySelector('.sr-try').textContent.trim(), tryNow: !!document.querySelector('[data-act="try"]') }));
  check(sr.has && !sr.cap, 'a wake-up routine shows its sunrise, with no caption repeating the sentence under it', sr.cap);
  check(sr.clock.replace(/\s+/g, ' ') === '6:05 am' && sr.lv === '1%', 'it starts dark: 6:05, 1%', sr);
  check(sr.ends.join() === '6:05 am,6:30 am', 'the strip runs from the start of the rise to the alarm', sr.ends);
  check(sr.tryIt === `Try it on ${lamp}` && !sr.tryNow, 'Try it is a hold, and the tap version is gone', sr.tryIt);
  await page.screenshot({ path: 'v7-night-sunrise-0.png' });
  // scrub: the knob is a grip; drag it three quarters along
  await clearActs();
  const tw = await C(() => document.querySelector('.sr-track').getBoundingClientRect().width);
  const x75 = 28 + (tw - 56) * 0.76;
  const mid = await C(async ([x]) => {
    const tr = document.querySelector('.sr-track'); const b = tr.getBoundingClientRect(); const k = document.querySelector('.sr-knob').getBoundingClientRect();
    const fire = (t, cx, el) => (el || tr).dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: b.top + 28 }));
    fire('pointerdown', k.left + 20, document.querySelector('.sr-knob'));
    for (let i = 1; i <= 8; i++) { await new Promise(r => setTimeout(r, 16)); fire('pointermove', k.left + 20 + (b.left + x - k.left - 20) * i / 8); }
    await new Promise(r => setTimeout(r, 50));
    const root = document.querySelector('.sunrise'); const cs = getComputedStyle(root);
    const o = { f: Number(cs.getPropertyValue('--f')), scrubbing: root.classList.contains('scrubbing'), label: getComputedStyle(document.querySelector('.sr-label')).opacity, labelText: document.querySelector('.sr-label').textContent,
      clock: document.querySelector('.sr-clock').textContent, lv: document.querySelector('.sr-level').textContent, sunY: getComputedStyle(document.querySelector('.sr-sun')).transform,
      d1: getComputedStyle(document.querySelector('.dawn .d1')).opacity, d2: getComputedStyle(document.querySelector('.dawn .d2')).opacity, d3: getComputedStyle(document.querySelector('.dawn .d3')).opacity, stars: getComputedStyle(document.querySelector('.sr-stars')).opacity, sun: cs.getPropertyValue('--sun').trim() };
    fire('pointerup', b.left + x);
    return o;
  }, [x75]);
  check(Math.abs(mid.f - 0.76) < 0.02, 'the sun follows the finger', mid.f);
  check(mid.clock.replace(/\s+/g, ' ') === '6:24 am' && mid.lv === '38%', 'the clock and the level step with it: 6:24, 38%', mid);
  check(mid.scrubbing && mid.labelText === '6:24 am · 38%', 'the label over the knob says the minute and the level', mid.labelText);
  check(/matrix\(1, 0, 0, 1, 0, -8[45]/.test(mid.sunY), 'the sun has climbed', mid.sunY);
  check(mid.d1 === '1' && Number(mid.d2) > 0.9 && Number(mid.d3) > 0.2 && Number(mid.d3) < 0.5 && mid.stars === '0', 'the screen brightens and warms: first light, sunrise, the morning coming', mid);
  check(!(await acts()).length, 'scrubbing never touches the lamp', await acts());
  await wait(300);
  check(await C(() => !document.querySelector('.sunrise').classList.contains('scrubbing')), 'the label goes when the finger lifts');
  await page.screenshot({ path: 'v7-night-sunrise-76.png' });
  await C(() => window.__copper.render()); await wait(200);
  check(Math.abs((await C(() => Number(getComputedStyle(document.querySelector('.sunrise')).getPropertyValue('--f')))) - 0.76) < 0.02, 'a redraw keeps the sun where it was left');
  // Try it: a tap says hold it, a hold runs the real lamp for 30 s and offers Put back
  await finger('.sr-try', [[100, 20]]); await wait(250);
  check(!(await acts()).length && (await C(() => document.querySelector('.sr-try').textContent.trim())) === 'Hold', 'a tap on Try it turns nothing on and says Hold', await acts());
  await finger('.sr-try', [[100, 20]], 700); await wait(1500);
  a = await acts();
  check(a.some(x => x.type === 'level' && x.target === 'd:10' && x.level === 50 && x.fade === 30), 'held: the real lamp rises to its end level over 30 s', a);
  const trying = await C(() => ({ put: !!document.querySelector('[data-act="wake-put-back"]'), f: Number(getComputedStyle(document.querySelector('.sunrise')).getPropertyValue('--f')) }));
  check(trying.put && trying.f > 0.02 && trying.f < 0.2, 'Put back is offered, and the screen rises with the lamp', trying);
  await clearActs();
  await page.click('[data-act="wake-put-back"]'); await wait(500);
  a = await acts();
  check(a.some(x => x.type === 'level' && x.target === 'd:10' && x.level === 'off'), 'Put back: the lamp goes back to off', a);
  // the guided setup shows it on its last questions
  await C(() => { const c = window.__copper; c.ui.gs = null; });
  await goto('setup/wakeup'); await wait(300);
  await C(() => { const c = window.__copper; c.ui.gs.step = 2; c.render(); }); await wait(300);
  check(await C(() => !!document.querySelector('.guided .sunrise') && document.querySelector('.guided .sr-ends').textContent.includes('6:05 am') && document.querySelector('.guided .sr-ends').textContent.includes('6:30 am')), 'the guided setup rehearses it too');
  await page.screenshot({ path: 'v7-night-sunrise-setup.png', fullPage: true });
  // clean up the routine this made
  await C(async ([id]) => { const c = window.__copper; c.RT.remove(id); c.ui.gs = null; await c.data.saveConfig(); }, [rid]);
  await force(null);
  await goto('home');

  check(!errors.length, 'no page errors', errors);
  await browser.close();
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
