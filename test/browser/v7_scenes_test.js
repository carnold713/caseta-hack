// Copper Night v7 · scenes: 6 a scene arriving (the ring of light from the chip, tiles following it, the count
// settling, no toast), 7 the scene editor's stage (orbs as grips, a preview that never touches the house unless
// asked, Try it), 8 Follow the day's sky dial (the paused state as built, resuming, scrubbing without touching the
// lamp) and 9 the evening wind-down's timeline (the moon and the handle as grips, a tap only saying). Puts the config
// back as it found it.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, `| ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  const base = `http://127.0.0.1:${PORT}/ui/`;
  await page.goto(base + '#home');
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const before = await C(() => JSON.stringify(window.__copper.S.config));
  const go = async h => { await C(x => { location.hash = x; }, h); await wait(900); };
  const toastText = () => C(() => { const t = document.querySelector('#toast-root .toast'); return t ? t.textContent.replace(/\s+/g, ' ').trim() : ''; });
  // what this phone sends, from here on
  await C(() => {
    const c = window.__copper; window.__cmds = [];
    const run = c.run; c.run = a => { window.__cmds.push(a); return run(a); };
    const sl = c.gate.sendLevel; c.gate.sendLevel = (...a) => { window.__cmds.push({ type: 'gated', a }); return sl(...a); };
  });
  const cmds = () => C(() => window.__cmds.slice());
  const clearCmds = () => C(() => { window.__cmds.length = 0; });
  // a finger: down on the element at (dx, dy) from its top left, then moves, then up
  // an element's words, a space between each of its parts
  const words = sel => C(s => { const el = document.querySelector(s); if (!el) return null; const w = []; const walk = n => { for (const k of n.childNodes) { if (k.nodeType === 3) { if (k.textContent.trim()) w.push(k.textContent.trim()); } else walk(k); } }; walk(el); return w.join(' '); }, sel);
  const finger = (sel, steps, { up = true } = {}) => C(([s, st, u]) => {
    const el = document.querySelector(s); const b = el.getBoundingClientRect();
    const at = ([dx, dy]) => ({ clientX: b.left + dx, clientY: b.top + dy });
    const fire = (type, p) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', isPrimary: true, ...at(p) }));
    fire('pointerdown', st[0]);
    for (const p of st.slice(1)) fire('pointermove', p);
    if (u) fire('pointerup', st[st.length - 1]);
  }, [sel, steps, up]);

  // ---- a room with its five scenes, everything in it off
  const aid = await C(async () => {
    const c = window.__copper;
    const a = c.data.areas().find(x => c.H.roomLights(x.id).length >= 2) || c.data.areas()[0];
    if (!c.H.roomScenes(a.id).length) { c.H.suggestScenes(a.id); await c.data.saveConfig(); }
    await c.run({ type: 'level', target: `a:${a.id}`, level: 'off' });
    return a.id;
  });
  await wait(1200);
  await go(`room/${aid}`);
  await C(a => { window.__lit0 = window.__copper.H.roomLights(a).map(d => [d.device_id, window.__copper.data.level(d.device_id) || 0]); }, aid);

  // ==== 6 · A scene arriving
  const chip = '.room-chips .chip[data-act="scene"]';
  const sceneId = await C(s => document.querySelector(s).dataset.id, chip);
  const countBefore = await C(() => document.querySelector('.room-title .count').textContent.trim());
  await clearCmds();
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  // the ring starts 0.12 s after the press, counted from the tap itself (room.js restates its delay at every redraw,
  // so the delay on the element depends on when the last redraw ran; where it starts does not). Measured from before
  // the test's tap, which the browser delivers a good 0.1 s later: never before the 0.12 s, and never much after.
  await C(() => { window.__tapAt = performance.now(); });
  await page.tap(chip); await wait(60);
  const early = await C(async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ch = document.querySelector('.room-chips .chip[data-act="scene"]');
    const wave = document.querySelector('.wv-wave');
    const wa = wave ? wave.getAnimations().map(a => ({ n: a.animationName, d: Math.round(a.effect.getTiming().duration), delay: Math.round(a.effect.getTiming().delay), at: a.startTime == null ? null : Math.round(a.startTime + a.effect.getTiming().delay - window.__tapAt) })) : [];
    return { current: ch.classList.contains('current'), wave: !!wave, spark: !!document.querySelector('.wv-spark .glow'), wa, was: (document.querySelector('.count .wv-was') || {}).textContent };
  });
  check('6: the tapped chip is copper at once, before its lights answer', early.current, early);
  check('6: a ring of light leaves the chip, 0.36 s at the wave token, after the press (0.12 s)', early.wave && early.spark && early.wa.some(a => a.n === 'wv-grow' && a.d === 360 && a.delay <= 120 && a.at != null && a.at >= 100 && a.at <= 350), early.wa);
  check('6: the count holds what it said', early.was === countBefore, early.was);
  check('6: the scene is run once, on the house', (await cmds()).filter(a => a.type === 'preset').length === 1, await cmds());
  await wait(260);
  // the tiles' crossfades: the scene's 1.0 s EASE_IN_AND_OUT, each starting when the ring reaches it
  const xf = await C(() => {
    const room = document.querySelector('.room').getBoundingClientRect();
    return [...document.querySelectorAll('.room-grid .tile > .xf-old, .rp-light > .xf-old')].map(x => {
      const a = x.getAnimations()[0]; const b = x.parentElement.getBoundingClientRect();
      return a ? { top: Math.round(b.top - room.top), left: Math.round(b.left - room.left), d: Math.round(a.effect.getTiming().duration), e: a.effect.getTiming().easing, delay: Math.round(a.effect.getTiming().delay) } : null;
    }).filter(Boolean);
  });
  check('6: every light the scene touched crossfades over the scene, 1.0 s EASE_IN_AND_OUT', xf.length >= 2 && xf.every(x => x.d === 1000 && x.e === 'ease-in-out'), xf);
  const tiles = xf.filter(x => x.top > 500).sort((a, b) => a.top - b.top || a.left - b.left);
  check('6: a tile further from the chip starts later (the wave, not all at once)', tiles.length < 2 || tiles[tiles.length - 1].delay > tiles[0].delay, tiles.map(t => [t.top, t.left, t.delay]));
  await page.screenshot({ path: 'v7-scene-arriving.png' });
  await wait(1700);
  const settled = await C(sid => ({ lv: window.__copper.H.sceneMatch(location.hash.split('/')[1]), sid, count: document.querySelector('.room-title .count').textContent.trim(), plain: !document.querySelector('.wv-two') }), sceneId);
  check('6: the lights arrive and the count settles to the truth', settled.lv === sceneId && settled.count !== countBefore, settled);
  // the lights arriving are the answer: no toast and no Put back (2ca8d0a)
  const t1 = await C(() => document.querySelector('#toast-root').textContent);
  check('6: no toast and no Put back once it has arrived', t1 === '', t1);
  // put every light it touched back directly
  const lit0 = await C(() => window.__lit0);
  await C(async l => { for (const [id, lv] of l) await window.__copper.run({ type: 'level', target: `d:${id}`, level: lv || 'off' }); }, lit0); await wait(1500);
  const back = await C(a => window.__copper.H.roomLights(a).map(d => [d.device_id, window.__copper.data.level(d.device_id) || 0]), aid);
  check('6: set back directly, every light it touched is as it was', JSON.stringify(back) === JSON.stringify(lit0), { back, lit0 });
  // already showing: one soft ring and the scene sent again quietly, so the room is surely in it; no notice
  await page.tap(chip); await wait(2600);
  await clearCmds();
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  await page.tap(chip); await wait(300);
  const same = await C(() => ({ soft: !!document.querySelector('.wv-soft'), wave: !!document.querySelector('.wv-wave') }));
  const sent = (await cmds()).filter(a => a.type === 'preset');
  check('6: tapped again when already showing: one soft ring, and the scene is sent again', same.soft && !same.wave && sent.length === 1, { same, cmds: await cmds() });
  check('6: with no "already showing" notice', !/Already showing/.test(await toastText()), await toastText());
  await wait(900);
  // hold the chip: it opens for changing, over the room (roomscene_test has the rest of that)
  const cb = await page.locator(chip).first().boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + 20); await page.mouse.down(); await wait(700); await page.mouse.up(); await wait(900);
  check('6: holding a chip opens the scene to change it, over the room', /#room\/[^/]+\/scene\//.test(page.url()) && page.url().endsWith(`/scene/${sceneId}`), page.url());

  // ==== 7 · The stage
  await wait(600);
  const stage = await C(() => ({ orbs: document.querySelectorAll('#sheet-root .sc-orb').length, show: document.querySelector('[data-act="stage-show"]').getAttribute('aria-checked'), glows: document.querySelectorAll('#sheet-root .sc-orb .glow:not(.off)').length }));
  const inScene = await C(id => Object.keys(window.__copper.data.presets().find(p => p.id === id).levels).filter(x => window.__copper.data.dev(x)).length, sceneId);
  check('7: one orb per light in the scene, lit ones glowing', stage.orbs === inScene && stage.glows >= 1, { stage, inScene });
  // calm and flat: each orb a flat disc of its light's colour, a lit one with one soft glow at about 0.25, no pools on
  // the floor and no wash over the stage
  const flat = await C(() => { const st = document.querySelector('#sheet-root .sc-stage'); return { balls: [...st.querySelectorAll('.sc-ball')].map(b => getComputedStyle(b).backgroundImage), pools: st.querySelectorAll('.sc-pool, .sc-wash').length, glows: [...st.querySelectorAll('.sc-orb')].map(o => o.querySelectorAll('.glow').length), peak: Math.max(...[...st.querySelectorAll('.sc-orb .glow:not(.off)')].map(g => Number((/,([\d.]+)\)$/.exec(g.style.getPropertyValue('--g-c')) || [0, 0])[1]))) }; });
  check('7: the orbs are flat discs with at most one soft glow (about 0.25), no pools, no wash', flat.balls.every(b => b === 'none') && !flat.pools && flat.glows.every(n => n <= 1) && flat.peak > 0.05 && flat.peak <= 0.25 + 1e-6, flat);
  check('7: "Show it on the room" is off when the editor opens', stage.show === 'false', stage.show);
  const P = () => C(id => window.__copper.data.presets().find(p => p.id === id), sceneId);
  const orb = '#sheet-root .sc-lane:first-child .sc-orb';
  const oid = await C(s => document.querySelector(s).dataset.orb, orb);
  const lv0 = await C(([id, o]) => { const v = window.__copper.data.presets().find(p => p.id === id).levels[o]; return typeof v === 'object' && v ? v.level : v; }, [sceneId, oid]);
  // each change below is saved at once with no toast and no Undo (2ca8d0a); the test puts the scene back itself
  const snap = () => C(() => JSON.stringify(window.__copper.S.config));
  const putBack = cfg => C(async x => { const c = window.__copper; c.data.restoreConfig(x); await c.data.saveConfig(); c.render(); }, cfg);
  const noToast = () => C(() => document.querySelector('#toast-root').textContent);
  const lvOf = () => C(([id, o]) => { const v = window.__copper.data.presets().find(p => p.id === id).levels[o]; return typeof v === 'object' && v ? v.level : v; }, [sceneId, oid]);
  let cfg7 = await snap();
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  await clearCmds();
  await finger(orb, [[22, 22], [22, 34], [22, 60], [22, 80]], { up: false });
  const mid = await C(s => ({ now: document.querySelector(s).getAttribute('aria-valuenow'), lab: document.querySelector(s).parentElement.querySelector('.sc-lv').textContent, dragging: document.querySelector('.sc-stage').classList.contains('dragging') }), orb);
  check('7: an orb is a grip: the level follows the finger, the number stepping with it', Number(mid.now) < Number(lv0) && Number(mid.now) > 0 && mid.lab === `${mid.now}%` && mid.dragging, { lv0, mid });
  check('7: and the house is not touched while it is only a preview', !(await cmds()).length, await cmds());
  await C(s => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, pointerType: 'touch', clientX: b.left + 22, clientY: b.top + 22 })); }, orb);
  await wait(1200);
  const lv1 = await lvOf();
  check('7: lifting the finger keeps it in the scene, with no toast and no Undo', lv1 === Number(mid.now) && (await noToast()) === '', { lv1, toast: await noToast() });
  await putBack(cfg7); await wait(900);
  const lv2 = await lvOf();
  check('7: the scene put back directly, the orb is where it was', lv2 === lv0, { lv0, lv2 });
  // shown on the room, the same drag moves the real light too
  await page.tap('[data-act="stage-show"]'); await wait(700);
  const real0 = await C(o => window.__copper.data.level(o) || 0, oid);
  cfg7 = await snap();
  await clearCmds();
  await finger(orb, [[22, 22], [22, 34], [22, 70]]); await wait(1200);
  check('7: with "Show it on the room" on, the real light moves too', (await cmds()).some(a => a.type === 'gated'), await cmds());
  check('7: and still no toast', (await noToast()) === '', await noToast());
  await putBack(cfg7);
  await C(([o, v]) => window.__copper.run({ type: 'level', target: `d:${o}`, level: v || 'off' }), [oid, real0]); await wait(1200);
  // under the floor: off in this scene; past the stage onto the shelf: left out
  await page.tap('[data-act="stage-show"]'); await wait(600);
  cfg7 = await snap();
  await finger(orb, [[22, 22], [22, 40], [22, 280]]); await wait(1200);
  const off = await lvOf();
  check('7: dropped under the floor line it is off in the scene, a hollow ring', off === 0 && !!(await page.$('#sheet-root .sc-lane:first-child .sc-orb.off')), { off, toast: await noToast() });
  await putBack(cfg7); await wait(900);
  const stageH = await C(() => document.querySelector('.sc-stage').getBoundingClientRect().height);
  await finger(orb, [[22, 22], [22, 60], [22, stageH]]); await wait(1200);
  check('7: carried onto the shelf it is left out, with no toast and no Undo', !(oid in (await P()).levels) && (await noToast()) === '', await noToast());
  await page.screenshot({ path: 'v7-scene-stage.png' });
  await putBack(cfg7); await wait(900);
  check('7: the scene put back directly, the light is in it again', oid in (await P()).levels);
  // a tap on an orb opens its choices under the stage
  await finger(orb, [[22, 22], [22, 22]]); await wait(900);
  check('7: a tap on an orb opens its choices under the stage', !!(await page.$('#sheet-root .sc-edit .sl-edit')));
  await clearCmds();
  const tried0 = await C(a => window.__copper.H.roomLights(a).map(d => [d.device_id, window.__copper.data.level(d.device_id) || 0]), aid);
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  await page.tap('#sheet-root .sc-try'); await wait(1500);
  check('7: Try it plays the scene on the room, with no toast and no Put back', (await cmds()).some(a => a.type === 'preset') && (await noToast()) === '', { cmds: await cmds(), toast: await noToast() });
  // put the room back directly
  await C(async l => { for (const [id, lv] of l) await window.__copper.run({ type: 'level', target: `d:${id}`, level: lv || 'off' }); }, tried0); await wait(1200);
  check('7: there is no Save button', !(await C(() => [...document.querySelectorAll('#sheet-root button')].some(b => /^save$/i.test(b.textContent.trim())))));
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; window.__copper.closeSheet(); history.replaceState(null, '', '#scenes'); window.__copper.render(); }); await wait(500);

  // ==== 8 · Follow the day
  const lamp = await C(() => (window.__copper.data.controllable().find(d => d.ct) || {}).device_id);
  if (!lamp) check('8: a lamp that changes its white (run after hue_test hue_color nanoleaf)', false, null);
  else {
    await C(async id => { const c = window.__copper; c.DAY.setFollowIds([id], true); await c.data.saveConfig(); await c.run({ type: 'level', target: `d:${id}`, level: 70 }); await c.run({ type: 'color', target: `d:${id}`, follow: true }); }, lamp);
    await wait(1200);
    await go(`light/${lamp}/follow`);
    const dial = await C(() => ({ svg: !!document.querySelector('.fd-dial .dc-chart'), ring: document.querySelectorAll('.fd-ring path').length, lived: document.querySelectorAll('.fd-curve path').length, sun: !!document.querySelector('.fd-sun .glow'), centre: null, range: (document.querySelector('.dc-range') || {}).textContent }));
    check('8: a 24 hour sky dial, the sun at its place, today\'s curve drawn', dial.svg && dial.ring === 96 && dial.sun, dial);
    dial.centre = await words('.fd-centre');
    // the card carries no header and no range: the dial, its curve and its sunrise and sunset say the day
    check('8: the middle says the white now, and the card says nothing over the dial', /^Now \d{4}K/.test(dial.centre) && dial.range == null, dial);
    // a colour picked by hand pauses it: the paused state as built
    await C(id => window.__copper.run({ type: 'color', target: `d:${id}`, hex: '#4c8dff' }), lamp); await wait(1400);
    const paused = await C(() => ({ cls: document.querySelector('.fd-dial').className, resume: (document.querySelector('[data-act="follow-resume"] .t') || {}).textContent }));
    paused.row = await words('.fd-rows .row .row-txt'); paused.centre = await words('.fd-centre');
    check('8: paused: the switch keeps its name, and one row offers to follow again (no explanation)', /paused/.test(paused.cls) && paused.row === 'Follow the day' && paused.resume === 'Follow the day again', paused);
    check('8: the bead sits in the middle in the picked colour, over one word', paused.centre === 'Paused', paused.centre);
    await page.screenshot({ path: 'v7-follow-paused.png' });
    await clearCmds();
    await page.tap('[data-act="follow-resume"]'); await wait(80);
    const resumed = await C(() => ({ cls: document.querySelector('.fd-dial').className, anims: document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.fd-dial')).map(a => ({ t: a.effect.target.className.baseVal != null ? a.effect.target.className.baseVal : a.effect.target.className, d: Math.round(a.effect.getTiming().duration), e: a.effect.getTiming().easing })) }));
    check('8: resume keeps the built behaviour (follow-resume)', (await cmds()).some(a => a.type === 'color' && a.follow === true), await cmds());
    check('8: the bead goes back to the curve and the sky comes up, 0.4 s EASE_IN_AND_OUT', !/paused/.test(resumed.cls) && resumed.anims.some(a => /fd-bead/.test(a.t) && a.d === 400 && a.e === 'ease-in-out'), resumed);
    await wait(1200);
    // a finger on the ring: a preview only
    await clearCmds();
    const dialBox = await C(() => { const b = document.querySelector('.fd-dial').getBoundingClientRect(); return { w: b.width }; });
    const u = dialBox.w / 340;
    // 9 pm is 135 degrees round from noon
    const a9 = 135 * Math.PI / 180, cx = dialBox.w / 2;
    await finger('.fd-dial', [[cx + 150 * u * Math.sin(a9), cx - 150 * u * Math.cos(a9)], [cx + 150 * u * Math.sin(a9) - 1, cx - 150 * u * Math.cos(a9) + 1]], { up: false });
    const scrub = await words('.fd-centre');
    check('8: scrubbing the ring shows another hour', /^At 9(:00)? pm \d{4}K/.test(scrub), scrub);
    check('8: and never touches the lamp', !(await cmds()).length, await cmds());
    await C(() => { const el = document.querySelector('.fd-dial'); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, pointerType: 'touch' })); });
    await wait(700);
    check('8: letting go springs back to now', /^Now/i.test(await C(() => document.querySelector('.fd-centre').textContent.trim())), await C(() => document.querySelector('.fd-centre').textContent.trim()));
    await page.screenshot({ path: 'v7-follow.png' });
  }

  // ==== 9 · The evening wind-down
  await C(async () => { const c = window.__copper; const s = c.S.config.settings; s.adaptive = s.adaptive || {}; s.adaptive.enabled = true; s.adaptive.mode = 'winddown'; await c.data.saveConfig(); });
  await go('routines');
  await page.tap('[data-go="routines/winddown"]'); await wait(900);
  const wd = await C(() => ({ head: document.querySelector('.wd-head').textContent, steps: document.querySelectorAll('.wd-step').length, moon: !!document.querySelector('.wd-moon'), knob: !!document.querySelector('.wd-knob'), tabs: document.querySelector('#tabs').hidden, sheet: !!document.querySelector('#sheet-root .sheet'), honest: (document.querySelector('.wd-honest') || {}).textContent }));
  check('9: a page of its own, the evening as one timeline with the night as a moon', wd.steps >= 3 && wd.moon && wd.knob && wd.tabs && !wd.sheet, wd);
  check('9: "Tonight at 11 pm the house goes quiet."', /^Tonight at \d{1,2}(:\d\d)? (am|pm) the house goes quiet\.$/.test(wd.head), wd.head);
  check('9: and says it never dims what is already on', wd.honest === 'Lights that are already on stay as they are.', wd.honest);
  const q0 = await C(() => window.__copper.S.config.settings.night_start);
  await clearCmds();
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  const band = await C(() => document.querySelector('.wd-band').getBoundingClientRect().width);
  await finger('.wd-moon', [[28, 20], [40, 20], [28 + band * 0.06, 20]], { up: false });
  const moving = await C(() => document.querySelector('.wd-head').textContent);
  check('9: dragging the moon moves the quiet time under the finger', moving !== wd.head, { was: wd.head, now: moving });
  await C(() => { const el = document.querySelector('.wd-moon'); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, pointerType: 'touch' })); });
  await wait(1200);
  const q1 = await C(() => window.__copper.S.config.settings.night_start);
  // the timeline moving is the answer: no toast and no Undo (2ca8d0a)
  check('9: applied when it lifts, in 15 minute steps, with no toast', q1 !== q0 && Number(q1.slice(3)) % 15 === 0 && (await noToast()) === '', { q0, q1, toast: await noToast() });
  check('9: moving the quiet time never touches a light', !(await cmds()).length, await cmds());
  await C(async q => { const c = window.__copper; c.S.config.settings.night_start = q; await c.data.saveConfig(); c.render(); }, q0); await wait(900);
  check('9: the quiet time put back directly', (await C(() => window.__copper.S.config.settings.night_start)) === q0);
  const wd0 = await C(() => JSON.stringify(window.__copper.S.config.settings.adaptive.winddown || null));
  const d0 = await C(() => (window.__copper.S.config.settings.adaptive.winddown || {}).to_level || 50);
  await finger('.wd-knob', [[22, 22], [22, 30], [22, 60]]); await wait(1200);
  const d1 = await C(() => (window.__copper.S.config.settings.adaptive.winddown || {}).to_level);
  check('9: the handle on the lowest step sets how low the evening goes, with no toast', d1 < d0 && (await noToast()) === '', { d0, d1, toast: await noToast() });
  await C(async w => { const c = window.__copper; const a = c.S.config.settings.adaptive; const v = JSON.parse(w); if (v) a.winddown = v; else delete a.winddown; await c.data.saveConfig(); c.render(); }, wd0); await wait(900);
  await finger('.wd-band', [[40, 100], [40, 100]]); await wait(150);
  const tip = await C(() => { const t = document.querySelector('.wd-tip'); return t && !t.hidden ? t.textContent : null; });
  check('9: a tap on the band only says what on means then', /^At .+: \d+%$/.test(tip || ''), tip);
  await page.screenshot({ path: 'v7-winddown.png' });
  await page.tap('[data-go="routines/winddown-night"]'); await wait(900);
  check('9: the night hours are still a row away', !!(await page.$('#sheet-root [data-k="night_start"]')));
  await C(() => window.__copper.closeSheet()); await go('routines/winddown-levels');
  check('9: and every level the sheets had', (await C(() => document.querySelectorAll('#sheet-root [data-act="wd-set"]').length)) >= 12 && !!(await page.$('#sheet-root [data-go="routines/winddown-curve"]')));
  await C(() => window.__copper.closeSheet()); await go('routines');
  check('9: Routines has its tab bar back', !(await C(() => document.querySelector('#tabs').hidden)));

  // ---- reduced motion: no wave, the count plain
  await go(`room/${aid}`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.tap(chip); await wait(80);
  check('reduced motion: the scene still runs, with no ring and no held count', !(await page.$('.wv-wave')) && !(await page.$('.wv-two')));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await wait(1500);

  // put the config back as it was
  await C(async b => { const c = window.__copper; c.data.restoreConfig(b); await c.data.saveConfig(); }, before);
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
