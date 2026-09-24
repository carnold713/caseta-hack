// Copper Night v7 · light: screens 3, 4, 5 and 15 (design-v7-ux.md, design-v7-ui.md; Figma 12815:49080, 12815:50658,
// 12816:94, 12817:49023 and 12818:257).
//
//   3   the lamp's own glow: a three-layer hero halo, a floor pool and a filament drawn from the light's real level
//       and colour, locked to the finger on the dial (no easing under it); the dial bottoms out at 1%, never 0; off
//       greys the dial at the level On brings back; holding minus dims steadily and stops at 1%.
//   4   Colour: the sheet is washed by the lamp's colour and crossfades to a new one (never slides); the swatches are
//       lit glass beads; a pick on a lamp that is off brings it on at the level On gives, not 100%; a pick shows no
//       toast and no Undo (2ca8d0a: the lamp changing is the answer).
//   5   White: the bar is a sky, the lamp's white a sun on a path in mireds; dragging the sun moves the white live.
//   15  the sleep timer's candle: its height is the time left over the time set (the hub records the minutes, so a
//       timer this phone did not set is whole too); Add 15 min grows it back; Stop the timer and Off now each act with
//       no toast and no Undo; at the end the flame gutters and the choices come back.
//
// Runs after hue_test and hue_color_test, which pair the fake Hue bridge: that is where the colour lamp comes from.
// It puts the lamp's colour, the dimmer's level and any timer back the way it found them.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  const goto = async (h, ms = 900) => { await C(x => { location.hash = x; }, h); await wait(ms); };
  await page.goto(`http://127.0.0.1:${PORT}/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.solid'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(900);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  // the sizes and strengths below are the day's: at night (from 10 pm, by the home's clock) every glow is capped, so a
  // run in the evening read a 450 glow as 405. The day look is pinned for this test and put back after it.
  const look0 = await C(async () => { const s = window.__copper.S.config.settings; const was = s.night_look ?? null; s.night_look = 'never'; await window.__copper.save('', { quiet: true }); return was; });
  // every level and colour this phone sends
  await C(() => {
    const c = window.__copper; window.__lv = []; window.__col = [];
    const l = c.gate.sendLevel, k = c.gate.sendColor;
    c.gate.sendLevel = (...a) => { window.__lv.push(a); return l(...a); };
    c.gate.sendColor = (...a) => { window.__col.push(a); return k(...a); };
  });
  const level = id => C(x => window.__copper.data.level(x) || 0, id);
  const glowD = () => C(() => { const g = document.querySelector('.dev [data-glow="lamp"]'); return g ? parseFloat(g.style.getPropertyValue('--g-d')) : null; });
  const heroD = lv => Math.round(260 + 300 * Math.sqrt(lv / 100));
  // a finger on an element: down, through each step (page coordinates), then up; `hold` ms before lifting
  const finger = (steps, { hold = 0 } = {}) => C(async ([st, h]) => {
    const target = document.elementFromPoint(st[0][0], st[0][1]);
    const fire = (type, [x, y], el) => (el || target).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 }));
    fire('pointerdown', st[0]);
    for (const p of st.slice(1)) { fire('pointermove', p); await new Promise(r => setTimeout(r, 16)); }
    if (h) await new Promise(r => setTimeout(r, h));
    fire('pointerup', st[st.length - 1]);
  }, [steps, hold]);

  // ================= 3 · the lamp's own glow, on the Kitchen Cans dimmer =================
  const dim = '5';
  await goto(`light/${dim}`);
  if (!(await level(dim))) { await page.click('[data-act="dev-on"]'); await wait(1400); }
  const lv0 = await level(dim);
  const g0 = await C(() => { const g = document.querySelector('.dev [data-glow="lamp"]'); return g && { off: g.classList.contains('off'), layers: g.querySelectorAll('i').length, blend: getComputedStyle(g.querySelector('.g-body')).mixBlendMode, xf: g.hasAttribute('data-xf') }; });
  check('3: the hero lamp casts a three-layer glow, blended screen', g0 && !g0.off && g0.layers === 3 && g0.blend === 'screen', g0);
  check(`3: its size is the hero row of the size table at ${lv0}% (D ${heroD(lv0)})`, Math.abs((await glowD()) - heroD(lv0)) <= 1, await glowD());
  const pool0 = await C(() => { const p = document.querySelector('.lamp-pool'), f = document.querySelector('.lamp-filament'); return { pw: parseFloat(p.style.getPropertyValue('--pool-w')), fil: Number(getComputedStyle(f).opacity) }; });
  check('3: a floor pool 120 + 180 x level wide, and a filament lighting the bulb', Math.abs(pool0.pw - (120 + 180 * lv0 / 100)) <= 1 && pool0.fil > 0.3, pool0);
  check('3: a colour change crossfades the glow (it carries data-xf), it never slides', g0 && g0.xf, g0);
  await page.screenshot({ path: 'v7-light-on.png' });
  // the dial's "Brightness" a gap (tokens.css) over its number, where the file puts it, on the owner's 412 and a small
  // Android's 360 alike, lit here and off below: the two used to touch, the label's line on the number's
  const dialGap = async () => {
    const at = [];
    for (const [w, h] of [[412, 915], [360, 780]]) {
      await page.setViewportSize({ width: w, height: h }); await wait(300);
      at.push(await C(() => { const d = document.querySelector('#screen .dial'), b = d.getBoundingClientRect(), l = d.querySelector('.lbl').getBoundingClientRect(), n = d.querySelector('.num').getBoundingClientRect(); return { w: innerWidth, lbl: l.top - b.top, gap: n.top - l.bottom, token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) }; }));
    }
    await page.setViewportSize({ width: 412, height: 915 }); await wait(300);
    return at;
  };
  const gapOk = at => at.length === 2 && at.every(g => g.lbl === 78 && g.token > 0 && Math.abs(g.gap - g.token) < 0.5);
  const gapOn = await dialGap();
  check('3: lit, "Brightness" sits a gap over the number, at 412 and 360', gapOk(gapOn), gapOn);

  // the knob takes the finger; under it the light is locked to it (no transition), and it bottoms out at 1%
  const kn = await C(() => { const g = document.querySelector('.dial .kgrab').getBoundingClientRect(); return [g.left + g.width / 2, g.top + g.height / 2]; });
  const arc = await C(() => { const s = document.querySelector('.dial svg').getBoundingClientRect(); const k = s.width / 340; return { cx: s.left + 170 * k, cy: s.top + 170 * k, r: 150 * k }; });
  const pt = p => { const a = Math.PI * (1 - p / 100); return [arc.cx + arc.r * Math.cos(a), arc.cy - arc.r * Math.sin(a)]; };
  await C(() => { window.__lv = []; });
  const mid = await C(async ([k, p]) => {
    const target = document.elementFromPoint(k[0], k[1]);
    const fire = (type, [x, y]) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 }));
    fire('pointerdown', k); fire('pointermove', p);
    await new Promise(r => setTimeout(r, 200));
    const g = document.querySelector('.dev [data-glow="lamp"]');
    const out = { held: !!document.querySelector('.dev.held'), dur: getComputedStyle(g.querySelector('.g-body')).transitionDuration, d: parseFloat(g.style.getPropertyValue('--g-d')), n: document.querySelector('.dial .num b').textContent, touch: Number(getComputedStyle(document.querySelector('.dial .ktouch')).opacity) };
    fire('pointerup', p);
    return out;
  }, [kn, pt(30)]);
  check('3: under a finger the glow follows it with no easing (transition 0s, M6)', mid.held && /^0s/.test(mid.dur), mid);
  check('3: the halo is the finger\'s level while it is still down', Math.abs(mid.d - heroD(Number(mid.n))) <= 1, mid);
  check('3: the finger shows as a 44 disc of white 22% on the knob', Math.abs(mid.touch - 0.22) < 0.03, mid.touch);
  await wait(900);
  // a slip right off the low end of the arc dims to 1%, never off
  const k2 = await C(() => { const g = document.querySelector('.dial .kgrab').getBoundingClientRect(); return [g.left + g.width / 2, g.top + g.height / 2]; });
  await C(() => { window.__lv = []; });
  await finger([k2, pt(15), pt(5), pt(0), [arc.cx - arc.r - 30, arc.cy + 40]]);
  await wait(1500);
  const sentMin = await C(() => Math.min(...window.__lv.map(a => a[1])));
  check('3: the dial bottoms out at 1%: nothing sent below 1, the light stays on', sentMin === 1 && (await level(dim)) === 1, { sentMin, level: await level(dim) });
  check('3: and the page still reads on', await C(() => !!document.querySelector('.dev.on')));
  // holding plus brightens steadily; the lift is not a tap as well
  const plus = await C(() => { const b = document.querySelector('.dial .plus').getBoundingClientRect(); return [b.left + 24, b.top + 24]; });
  await finger([plus], { hold: 1200 });
  await wait(1500);
  const afterPlus = await level(dim);
  check('3: holding plus brightens steadily', afterPlus >= 15, afterPlus);
  const minus = await C(() => { const b = document.querySelector('.dial .minus').getBoundingClientRect(); return [b.left + 24, b.top + 24]; });
  await finger([minus], { hold: 2500 });
  await wait(1500);
  check('3: holding minus dims steadily and stops at 1%, never off', (await level(dim)) === 1, await level(dim));
  // off: no light at all, and the dial greyed where On will bring it back
  await page.click('[data-act="dev-off"]'); await wait(1400);
  const off = await C(id => { const c = window.__copper; const g = document.querySelector('.dev [data-glow="lamp"]'); const d = document.querySelector('.dial'); return { glowOff: g.classList.contains('off'), at: Number(d.getAttribute('aria-valuenow')), want: Math.round(c.onLevel(id, `d:${id}`)), stroke: getComputedStyle(d.querySelector('.fil')).stroke, num: getComputedStyle(d.querySelector('.num b')).color, fil: Number(getComputedStyle(document.querySelector('.lamp-filament')).opacity) }; }, dim);
  check('3: off draws no light (the glow is off, the filament dark)', off.glowOff && off.fil === 0, off);
  check('3: the dial stays, greyed, at the level On will bring back', off.at === off.want && /58, 54, 51/.test(off.stroke) && /158, 158, 158/.test(off.num), off);
  // the number's glow is light too: off, it has none even at a level of 50 or more (where a lit dial's number glows)
  const offGlow = await C(() => { const d = document.querySelector('.dial'); const was = d.classList.contains('bright'); d.classList.add('bright'); const sh = getComputedStyle(d.querySelector('.num b')).textShadow; d.classList.toggle('bright', was); return sh; });
  check('3: off, the number does not glow at any level', offGlow === 'none', offGlow);
  await page.screenshot({ path: 'v7-light-off.png' });
  const gapOff = await dialGap();
  check('3: off, the same gap', gapOk(gapOff), gapOff);
  await page.click('[data-act="dev-on"]'); await wait(1400);
  await C(([id, v]) => window.__copper.run({ type: 'level', target: `d:${id}`, level: v }), [dim, lv0]); await wait(900);

  // ================= 4 · Colour, painting with light =================
  const lamp = await C(() => (window.__copper.data.controllable().find(d => d.color && d.ct) || {}).device_id);
  check('a colour lamp to test with (hue_color_test pairs one)', !!lamp, lamp);
  if (lamp) {
    const name = await C(id => window.__copper.data.dev(id).name, lamp);
    const col0 = await C(id => JSON.stringify(window.__copper.S.states[id] || {}), lamp);
    await goto(`light/${lamp}`);
    if (!(await level(lamp))) { await page.click('[data-act="dev-on"]'); await wait(1400); }
    await goto(`light/${lamp}/colour`, 1200);
    await page.click('.cs-sw .sw[data-hex="#4C8DFF"]'); await wait(1400);
    const head = await C(() => ({ over: document.querySelector('.sheet-head .t-over').textContent, title: document.querySelector('.sheet-head h2').textContent }));
    check('4: the sheet says "Colour", under "{light} · {colour}"', head.title === 'Colour' && head.over === `${name} · Blue`, head);
    const bead = await C(() => { const b = document.querySelector('.cs-sw .sw[data-hex="#FFC24A"]'); const cs = getComputedStyle(b), sp = getComputedStyle(b, '::after'); return { bg: cs.backgroundImage, spec: sp.backgroundColor, sh: cs.boxShadow }; });
    check('4: the colours are beads of lit glass (radial light, a specular spot, a coloured shadow)', /radial-gradient/.test(bead.bg) && /255, 255, 255, 0\.55/.test(bead.spec) && /255, 194, 74/.test(bead.sh), bead);
    const wash0 = await C(() => getComputedStyle(document.querySelector('.lk-wash')).getPropertyValue('--wash'));
    check('4: the sheet is washed with the lamp\'s colour', /76, ?141, ?255/.test(wash0), wash0);
    const hand = await C(() => getComputedStyle(document.querySelector('.wheel .handle')).boxShadow);
    check('4: the wheel\'s handle glows with the colour under it', /76, 141, 255, 0\.35/.test(hand), hand);
    await page.screenshot({ path: 'v7-colour-blue.png' });
    // Amber: the wash crossfades (an old copy fading over the new), the ring and its light slide; no toast
    await C(() => { window.__col = []; document.querySelector('#toast-root').innerHTML = ''; });
    await page.click('.cs-sw .sw[data-hex="#FFC24A"]');
    await wait(150);
    const xf = await C(() => { const w = document.querySelector('.lk-wash'); const old = w.querySelector('.xf-old'); const a = old && old.getAnimations()[0]; return { copy: !!old, dur: a && a.effect.getTiming().duration, ease: a && a.effect.getTiming().easing, now: getComputedStyle(w).getPropertyValue('--wash') }; });
    check('4: the wash crossfades to amber over the dimmer, 0.4 s EASE_IN_AND_OUT (colour never slides)', xf.copy && xf.dur === 400 && xf.ease === 'ease-in-out' && /255, ?194, ?74/.test(xf.now), xf);
    await wait(1300);
    const amber = await C(id => ({ hex: String((window.__copper.S.states[id].color || {}).hex).toUpperCase(), toast: document.querySelector('#toast-root').textContent }), lamp);
    check('4: a pick shows no toast and no Undo; the lamp is amber', amber.hex === '#FFC24A' && amber.toast === '', amber);
    check('4: the sub names the new colour', (await C(() => document.querySelector('.sheet-head .t-over').textContent)) === `${name} · Amber`);
    await page.screenshot({ path: 'v7-colour-amber.png' });
    // put it back to blue directly (there is no Undo now)
    await C(id => window.__copper.run({ type: 'color', target: `d:${id}`, hex: '#4C8DFF' }), lamp); await wait(1400);
    check('4: set back to blue directly', String(await C(id => (window.__copper.S.states[id].color || {}).hex, lamp)).toUpperCase() === '#4C8DFF');
    // a pick on a lamp that is off brings it on at the level On gives it, in the colour from the first moment
    await C(id => { const c = window.__copper; c.assume([id], 0); c.soon(); return c.run({ type: 'level', target: `d:${id}`, level: 'off' }); }, lamp); await wait(1400);
    await C(() => { window.__col = []; document.querySelector('#toast-root').innerHTML = ''; });
    const want = await C(id => Math.round(window.__copper.onLevel(id, `d:${id}`)), lamp);
    await page.click('.cs-sw .sw[data-hex="#FF5A4E"]'); await wait(1400);
    const sentCol = await C(() => window.__col.map(a => a[1]));
    check(`4: an off lamp given a colour comes on at the level On gives (${want}%), not 100%`, sentCol.length && sentCol[0].level === want && (await level(lamp)) === want, { sentCol, level: await level(lamp) });
    check('4: and says nothing about it (no toast, no Undo)', (await C(() => document.querySelector('#toast-root').textContent)) === '', await C(() => document.querySelector('#toast-root').textContent));
    await C(id => window.__copper.run({ type: 'level', target: `d:${id}`, level: 'on' }), lamp); await wait(1200);

    // ================= 5 · White, the time of day =================
    await goto(`light/${lamp}/white`, 1200);
    await page.click('.ws-chips .chip[data-n="Warm"]'); await wait(1400);
    const sky = await C(() => { const s = document.querySelector('.ws-sky').getBoundingClientRect(), sh = document.querySelector('#sheet-root .sheet').getBoundingClientRect(), t = document.querySelector('.ws-thumb').getBoundingClientRect(); return { x: Math.round(s.left), y: Math.round(s.top - sh.top), w: Math.round(s.width), h: Math.round(s.height), sunX: t.left - s.left, sunY: t.top - s.top }; });
    // 2700K is t 0.419 on the mired path: card x 24 + 0.419 x (w - 48), y 168 - 128 sin(t pi/2)
    const t27 = (1e6 / 1900 - 1e6 / 2700) / (1e6 / 1900 - 1e6 / 6500);
    check('5: the sky card sits where the file has it (20, 214, 372 x 200 from the sheet\'s top)', sky.x === 20 && Math.abs(sky.y - 214) <= 1 && sky.w === 372 && sky.h === 200, sky);
    check('5: the lamp\'s white is a sun on the path, 2700K at t 0.419', Math.abs(sky.sunX - (24 + t27 * (sky.w - 48))) <= 1.5 && Math.abs(sky.sunY - (168 - 128 * Math.sin(t27 * Math.PI / 2))) <= 1.5, { sky, want: [24 + t27 * (sky.w - 48), 168 - 128 * Math.sin(t27 * Math.PI / 2)] });
    const wh = await C(() => ({ over: document.querySelector('.sheet-head .t-over').textContent, title: document.querySelector('.sheet-head h2').textContent, ends: document.querySelector('.ws-ends').innerText }));
    check('5: "White", under "{light} · 2700K · Warm", from candle at dusk to daylight at noon', wh.title === 'White' && wh.over === `${name} · 2700K · Warm` && /CANDLE · DUSK/.test(wh.ends) && /DAYLIGHT · NOON/.test(wh.ends), wh);
    await page.screenshot({ path: 'v7-white-2700.png' });
    // drag the sun (a grip: it takes the finger at once) to 4000K; the readout steps, the sky's noon brightens
    const tr = await C(() => { const b = document.querySelector('.ws-track').getBoundingClientRect(); const t = document.querySelector('.ws-thumb').getBoundingClientRect(); return { x: b.left, w: b.width, sx: t.left, sy: t.top }; });
    const xAt = k => tr.x + tr.w * (1e6 / 1900 - 1e6 / k) / (1e6 / 1900 - 1e6 / 6500);
    await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
    const drag = await C(async ([sx, sy, to]) => {
      const target = document.elementFromPoint(sx, sy);
      const fire = (type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 13, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 }));
      fire('pointerdown', sx, sy);
      const seen = [], noon = [];
      for (let i = 1; i <= 8; i++) { fire('pointermove', sx + (to - sx) * i / 8, sy - 3 * i); await new Promise(r => setTimeout(r, 30)); seen.push(document.querySelector('[data-k]').textContent); noon.push(Number(getComputedStyle(document.querySelector('.ws-sky')).getPropertyValue('--noon'))); }
      fire('pointerup', to, sy - 24);
      return { grabbed: target.closest('.ws-thumb') ? true : false, seen, noon };
    }, [tr.sx, tr.sy, xAt(4000)]);
    await wait(1500);
    const k4 = await C(id => (window.__copper.S.states[id].color || {}).kelvin, lamp);
    check('5: the sun is a grip; dragging it sets the white live (the readout steps as it goes)', drag.grabbed && new Set(drag.seen).size >= 4 && k4 >= 3900 && k4 <= 4100, { drag, k4 });
    check('5: noon brightens as the sun climbs', drag.noon[drag.noon.length - 1] > drag.noon[0], drag.noon);
    // the sheet names the white where it was set; no toast and no Undo (2ca8d0a)
    const named = await C(() => ({ over: document.querySelector('.sheet-head .t-over').textContent, toast: document.querySelector('#toast-root').textContent }));
    check('5: the drag ends with no toast; the sheet names the white it set', named.toast === '' && named.over === `${name} · ${k4}K · ${await C(k => CasetaDaylight.warmthName(k), k4)}` && /· (Soft|Neutral)( white)?$/.test(named.over), named);
    const now = await C(() => !!document.querySelector('.ws-now') || !!document.querySelector('.ws-loc'));
    check('5: the day\'s white now is on the sky, or the sky asks where home is', now);
    await page.screenshot({ path: 'v7-white-4000.png' });
    await page.click('.ws-chips .chip[data-n="Warm"]'); await wait(1200);

    // ================= 15 · the sleep timer, a candle burning down =================
    await C(() => window.__copper.closeSheet());
    await goto(`light/${lamp}/timer`, 1000);
    // no timer left over from an earlier run, and the sheet set to this lamp alone
    await C(id => { const c = window.__copper; c.ui.timer = { reach: 'lamp', more: false }; return Promise.all(Object.keys(c.S.timers || {}).filter(k => c.data.targetDevices(k.includes('|') ? k.split('|') : k).includes(id)).map(k => c.run({ type: 'cancel_timer', target: k.includes('|') ? k.split('|') : k }))); }, lamp);
    await wait(800);
    await goto(`light/${lamp}`, 500); await goto(`light/${lamp}/timer`, 1000);
    await page.click('.dur[data-m="15"]'); await wait(1600);
    const key = `d:${lamp}`;
    const cd = await C(k => { const c = window.__copper; const st = document.querySelector('.tc-stage'); const cn = document.querySelector('.tc-candle'); return st && { f: Number(st.style.getPropertyValue('--f')), h: cn.getBoundingClientRect().height, left: document.querySelector('[data-left]').textContent, says: document.querySelector('.tc-says').textContent, btns: [...document.querySelectorAll('.tc-btns .pill')].map(b => b.textContent), hub: (c.S.timers[k] || {}).minutes }; }, key);
    check('15: a running timer is a candle, whole when it has just been set', cd && cd.f > 0.98 && Math.abs(cd.h - 95) <= 1.5, cd);
    check('15: "15 min left", "{light} fades out at {time}", and the three buttons', cd && cd.left === '15 min left' && cd.says.startsWith(`${name} fades out at `) && cd.btns.join('|') === 'Add 15 min|Stop the timer|Off now', cd);
    check('15: the hub records how long it was set for', cd && cd.hub === 15, cd && cd.hub);
    await page.screenshot({ path: 'v7-candle-whole.png' });
    // a timer this phone did not set (a remote's): the hub's minutes still give the candle its full height
    await C(() => { window.__copper.ui.timerTotal = {}; window.__copper.render(); }); await wait(500);
    check('15: a timer set elsewhere is whole too (the hub\'s minutes)', Number(await C(() => document.querySelector('[data-left]').dataset.total)) === 15);
    // half burned: 15 left of 30 is half a candle, 12 + 83 x 0.5 tall, the flame and its pool smaller with it
    const half = await C(k => { const c = window.__copper; const v = c.S.timers[k]; const ends = v.ends_at < 1e12 ? v.ends_at * 1000 : +new Date(v.ends_at); c.ui.timerTotal = { [k]: { m: 30, until: ends } }; c.render(); return new Promise(r => setTimeout(() => { const st = document.querySelector('.tc-stage'); const fl = getComputedStyle(document.querySelector('.tc-flame')).transform; r({ f: Number(st.style.getPropertyValue('--f')), h: document.querySelector('.tc-candle').getBoundingClientRect().height, fl }); }, 1300)); }, key);
    check('15: half the time left is half a candle, and a smaller flame', Math.abs(half.f - 0.5) < 0.02 && Math.abs(half.h - (12 + 83 * half.f)) <= 1.5 && /matrix\(0\.9/.test(half.fl), half);
    await page.screenshot({ path: 'v7-candle-half.png' });
    // Add 15 min: the candle grows back (it now burns for 30 + 15)
    await page.click('[data-act="timer-add"]'); await wait(1600);
    const grown = await C(() => ({ total: Number(document.querySelector('[data-left]').dataset.total), left: document.querySelector('[data-left]').textContent, f: Number(document.querySelector('.tc-stage').style.getPropertyValue('--f')) }));
    check('15: Add 15 min grows the candle back', grown.total === 45 && grown.left === '30 min left' && grown.f > half.f, grown);
    // Stop the timer: the light stays as it is, the candle goes and nothing else is said (no toast, no Undo)
    const lvBefore = await level(lamp);
    await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
    await page.click('[data-act="timer-cancel"]'); await wait(1400);
    const stopped = await C(k => ({ candle: !!document.querySelector('.tc-stage'), hub: !!(window.__copper.S.timers || {})[k], durs: document.querySelectorAll('.durs .dur').length, toast: document.querySelector('#toast-root').textContent }), key);
    check('15: Stop the timer ends it on the hub and leaves the light as it is, with no toast', !stopped.candle && !stopped.hub && (await level(lamp)) === lvBefore && stopped.toast === '', { lv: await level(lamp), lvBefore, ...stopped });
    check('15: and the sheet offers the choices again', stopped.durs >= 1, stopped);
    // a timer again, for Off now
    await page.click('.dur[data-m="30"]'); await wait(1600);
    check('15: a new timer starts from the choices', !!(await page.$('.tc-stage')) && /^(29|30) min left$/.test(await C(() => (document.querySelector('[data-left]') || {}).textContent)), await C(() => (document.querySelector('[data-left]') || {}).textContent));
    // Off now: off at once, the timer ended, no toast and no Undo
    await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
    await page.click('[data-act="timer-offnow"]'); await wait(1500);
    const offNow = await C(k => ({ candle: !!document.querySelector('.tc-stage'), hub: !!(window.__copper.S.timers || {})[k], toast: document.querySelector('#toast-root').textContent }), key);
    check('15: Off now turns it off and ends the timer, with no toast', (await level(lamp)) === 0 && !offNow.candle && !offNow.hub && offNow.toast === '', { lv: await level(lamp), ...offNow });
    // put the light back directly and set a timer again for the end
    await C(([id, v]) => window.__copper.run({ type: 'level', target: `d:${id}`, level: v }), [lamp, lvBefore]); await wait(1400);
    await page.click('.dur[data-m="15"]'); await wait(1600);
    check('15: the light back and a timer running again', (await level(lamp)) === lvBefore && !!(await page.$('.tc-stage')), { lv: await level(lamp), want: lvBefore });
    // the end: the timer runs out and the flame gutters (1.6 s), then the choices come back
    const gut = await C(async k => {
      const c = window.__copper;
      c.ui.candle.ends = Date.now();
      await c.run({ type: 'cancel_timer', target: k });
      await new Promise(r => setTimeout(r, 500));
      const st = document.querySelector('.tc-stage.out');
      const fl = st ? st.querySelector('.tc-flame').getAnimations().map(a => a.effect.getTiming()).find(t => t.duration === 1600) : null;
      return { out: !!st, anim: fl ? `${fl.duration} ${fl.easing}` : null, smoke: st ? st.querySelector('.tc-smoke').getAnimations().length : 0, words: (document.querySelector('.tc-left') || {}).textContent };
    }, key);
    check('15: when it runs out the flame gutters over 1.6 s and a wisp of smoke rises', gut.out && gut.anim === '1600 ease-in-out' && gut.smoke >= 1 && gut.words === 'Out', gut);
    await page.screenshot({ path: 'v7-candle-out.png' });
    await wait(3800);
    check('15: and then the sheet offers the choices again', !!(await page.$('.durs .dur')) && !(await page.$('.tc-stage')));
    await C(() => window.__copper.closeSheet()); await wait(400);

    // put the lamp back as it was
    await C(([id, s]) => { const st = JSON.parse(s); const c = window.__copper; const col = st.color || {}; if (col.mode === 'ct' && col.kelvin) return c.run({ type: 'color', target: `d:${id}`, kelvin: col.kelvin, level: st.level || undefined }); if (col.mode === 'xy' && col.hex) return c.run({ type: 'color', target: `d:${id}`, hex: col.hex, level: st.level || undefined }); }, [lamp, col0]);
    await wait(800);
    if (!JSON.parse(col0).level) await C(id => window.__copper.run({ type: 'level', target: `d:${id}`, level: 'off' }), lamp);
    await wait(600);
  }

  await C(async was => { const s = window.__copper.S.config.settings; if (was == null) delete s.night_look; else s.night_look = was; await window.__copper.save('', { quiet: true }); }, look0);
  check('no errors on the page', !errors.length, errors);
  await ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
