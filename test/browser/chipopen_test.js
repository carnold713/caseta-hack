// M12 · A scene opens from its chip: holding a room's scene chip fills it with copper, and held to the end it opens
// where it is into the scene's editor sheet (web/ui/chipopen.js); closing the sheet puts it back into the chip. Read
// off the running app frame by frame: where the surface is (the sheet's box less its clip), how much copper shows,
// where the title is, how the orbs arrive and leave, and that nothing is left behind. Screenshots are taken with
// every animation paused at a moment, so they show exactly that moment.
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
// transition's parts on every frame it runs. The transition's own clock is its surface's clip animation.
function instrument() {
  const M = window.__m12 = { off: 0, pausedAt: 0, frames: [], stops: [], stopped: null, on: false, T: null, mode: 'open' };
  M.now = () => (M.pausedAt || performance.now()) - M.off;
  M.stop = () => { M.pausedAt = performance.now(); M.held = document.getAnimations().filter(a => a.playState === 'running'); for (const a of M.held) a.pause(); };
  M.go = () => { M.off += performance.now() - M.pausedAt; M.pausedAt = 0; M.stopped = null; for (const a of M.held || []) if (a.playState === 'paused') a.play(); M.held = []; };
  const rect = r => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) });
  // the surface: the sheet's box, less its clip (inset(), which may reach past its bottom)
  const surface = el => {
    const b = el.getBoundingClientRect();
    const cp = getComputedStyle(el).clipPath;
    const m = /inset\(([^)]*?)(?: round|\))/.exec(cp);
    const n = (m ? m[1] : '0px').trim().split(/\s+/).map(parseFloat);
    const [t, r, bo, l] = [n[0], n[1] ?? n[0], n[2] ?? n[0], n[3] ?? n[1] ?? n[0]];
    return rect({ left: b.left + l, top: b.top + t, right: b.right - r, bottom: b.bottom - bo, width: b.width - l - r, height: b.height - t - bo });
  };
  const words = el => { const g = document.createRange(); g.selectNodeContents(el); return rect(g.getBoundingClientRect()); };
  const clip = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const area = r => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
  const tick = () => {
    if (M.on && !M.pausedAt) {
      const t = M.now();
      const sheet = M.mode === 'open' ? document.querySelector('#sheet-root .sheet') : document.querySelector('.m12-ghost .sheet');
      if (sheet) {
        const wa = sheet.getAnimations().find(a => a.effect.getKeyframes().some(k => k.clipPath));
        const h2 = sheet.querySelector('.sheet-head h2');
        const fill = sheet.querySelector('.m12-fill');
        const word = sheet.querySelector('.m12-word');
        const sf = surface(sheet);
        const view = { l: 0, t: 0, r: innerWidth, b: innerHeight };
        let copper = 0, copperArea = 0, copperO = 0;
        if (fill) {
          const fr = fill.getBoundingClientRect();
          copperO = Number(getComputedStyle(fill).opacity);
          copperArea = area(clip(clip(rect(fr), sf), view));
          copper = copperArea * copperO;
        }
        const orbs = [...sheet.querySelectorAll('.sc-lane .sc-orb')].map(o => { const r = o.getBoundingClientRect(); return { o: Math.round(Number(getComputedStyle(o).opacity) * 100) / 100, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
        M.frames.push({
          t: Math.round(t), at: wa && wa.playState !== 'finished' && wa.currentTime != null ? Math.round(wa.currentTime) : null,
          sf, copper, copperArea, copperO, h1: h2 ? words(h2) : null, h1o: h2 ? Number(getComputedStyle(h2).opacity) : null,
          wordo: word ? Number(getComputedStyle(word).opacity) : null, word: word ? words(word) : null, orbs,
          scrim: (() => { const s = sheet.parentElement.querySelector('.scrim'); return s ? Number(getComputedStyle(s).opacity) : null; })(),
          so: Number(getComputedStyle(sheet).opacity),
          blooms: [...sheet.querySelectorAll('.m12-bloom')].filter(b => Number(getComputedStyle(b).opacity) > 0.05).length,
        });
        const f = M.frames[M.frames.length - 1];
        if (f.at != null) M.T = t - f.at;
      }
      if (M.stops.length && M.T != null && t - M.T >= M.stops[0]) { M.stopped = M.stops.shift(); M.stop(); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  // run something with the clock armed, stopping at each moment for a screenshot, then let it finish
  const play = async (mode, act, stops, prefix, after = 1600) => {
    await C(([m, s]) => { const M = window.__m12; M.mode = m; M.stops = s.slice(); M.frames = []; M.T = null; M.on = true; }, [mode, stops]);
    await act();
    for (const s of stops) {
      await page.waitForFunction(x => window.__m12.stopped === x, s, { timeout: 5000 });
      await shot(`${prefix}-${String(s).padStart(4, '0')}`);
      await C(() => window.__m12.go());
    }
    await wait(after);
    return C(() => { const M = window.__m12; M.on = false; return M.frames; });
  };
  const near = (a, b, tol) => !!a && !!b && ['l', 't', 'r', 'b'].every(k => Math.abs(a[k] - b[k]) <= tol);
  const mid = r => ({ x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 });
  const dist = (a, b) => Math.round(Math.hypot(mid(a).x - mid(b).x, mid(a).y - mid(b).y));
  const R = x => ({ l: Math.round(x.left), t: Math.round(x.top), r: Math.round(x.right), b: Math.round(x.bottom), w: Math.round(x.width), h: Math.round(x.height) });

  await page.goto(root + '#home'); await ready(); await wait(1200);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const cfg0 = await C(() => JSON.stringify(window.__copper.S.config));
  // what this phone sends, from here on
  await C(() => { const c = window.__copper; window.__cmds = []; const run = c.run; c.run = a => { window.__cmds.push(a); return run(a); }; });

  // ---- a room with its scenes, the lights off so no chip is the scene showing
  const aid = await C(async () => {
    const c = window.__copper;
    const a = c.data.areas().slice().sort((x, y) => c.H.roomLights(y.id).length - c.H.roomLights(x.id).length)[0];
    if (!c.H.roomScenes(a.id).length) { c.H.suggestScenes(a.id); await c.data.saveConfig(); }
    await c.run({ type: 'level', target: `a:${a.id}`, level: 'off' });
    return a.id;
  });
  await wait(1200);
  await C(a => { location.hash = `room/${a}`; }, aid); await wait(1000);
  // the scene with the most lights lit in it, so the stage has orbs to watch
  const pid = await C(a => {
    const c = window.__copper;
    const lit = p => Object.values(p.levels || {}).filter(v => (typeof v === 'object' && v ? Number(v.level) : Number(v)) > 0).length;
    return c.H.roomScenes(a).slice().sort((x, y) => lit(y) - lit(x))[0].id;
  }, aid);
  const chip = `#screen .room-chips .chip[data-id="${pid}"]`;
  await page.waitForSelector(chip, { timeout: 5000 }).catch(() => {});
  check('the room shows the scene\'s chip', !!(await page.$(chip)), await C(() => ({ hash: location.hash, chips: [...document.querySelectorAll('#screen .room-chips .chip')].map(c => c.dataset.id || c.dataset.act) })));
  await C(s => { document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }); }, chip); await wait(500);
  const hashRoom = await C(() => location.hash);
  const n0 = await C(() => history.state && history.state.n);
  const chipAt = async () => C(s => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); const g = document.createRange(); const t = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()); g.selectNode(t); const w = g.getBoundingClientRect(); const r = x => ({ l: Math.round(x.left), t: Math.round(x.top), r: Math.round(x.right), b: Math.round(x.bottom), w: Math.round(x.width), h: Math.round(x.height) }); return { chip: r(b), word: r(w), text: t.textContent.trim() }; }, chip);
  const at0 = await chipAt();
  const fillOf = () => C(s => { const el = document.querySelector(s); if (!el) return null; const cs = getComputedStyle(el, '::before'); return { x: Math.round(new DOMMatrix(cs.transform).a * 100) / 100, bg: cs.backgroundColor, holding: el.dataset.holding || '' }; }, chip);
  await shot('m12-room-before');

  // ---- the hold made visible: copper fills the chip from the left, linearly, over 0.5 s
  const cb = await page.locator(chip).boundingBox();
  const px0 = cb.x + cb.width / 2, py0 = cb.y + cb.height / 2;
  await page.mouse.move(px0, py0); await page.mouse.down();
  const t0 = Date.now();
  await wait(120); const f1 = await fillOf(); const t1 = Date.now() - t0;
  await shot('m12-hold-0150');
  await wait(Math.max(0, 250 - (Date.now() - t0))); const f2 = await fillOf(); const t2 = Date.now() - t0;
  check('holding a chip fills it with copper from the left', f1 && f2 && f1.bg === 'rgb(217, 138, 78)' && f1.x > 0.05 && f2.x > f1.x, { f1, f2 });
  check('linearly, over the 0.5 s hold', Math.abs(f1.x - t1 / 500) < 0.2 && Math.abs(f2.x - t2 / 500) < 0.2, { f1: f1.x, t1, f2: f2.x, t2 });
  await shot('m12-hold-0300');
  // let go early (the finger slides off): the copper empties in 0.2 s, and nothing opens and nothing runs
  await C(() => { window.__cmds.length = 0; });
  await page.mouse.move(px0, py0 + 60);
  const fr = []; for (let i = 0; i < 5; i++) { fr.push(await fillOf()); await wait(45); }
  await page.mouse.up(); await wait(300);
  const e1 = await fillOf();
  check('let go early, the copper empties over 0.2 s', fr[0].holding === '0' && fr.some(f => f.x > 0.05 && f.x < 0.5) && e1.x === 0, { fr: fr.map(f => f.x), end: e1.x });
  check('and nothing opens and nothing runs', (await C(() => location.hash)) === hashRoom && !(await page.$('#sheet-root .sheet')) && (await C(() => window.__cmds.filter(a => a.type === 'preset').length)) === 0, await C(() => window.__cmds));
  // a tap still runs the scene
  await page.click(chip); await wait(400);
  check('a short tap still runs the scene', (await C(p => window.__cmds.some(a => a.type === 'preset' && a.preset_id === p), pid)) && (await C(() => location.hash)) === hashRoom, await C(() => window.__cmds));
  await wait(2500);
  await C(async a => { await window.__copper.run({ type: 'level', target: `a:${a}`, level: 'off' }); }, aid); await wait(1500);
  await C(s => { document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }); }, chip); await wait(400);
  const A = await chipAt();

  // ---- the open: held to the end, the chip opens where it is into the scene's editor
  const cb2 = await page.locator(chip).boundingBox();
  await page.mouse.move(cb2.x + cb2.width / 2, cb2.y + cb2.height / 2); await page.mouse.down();
  await wait(430);
  const pressed = await chipAt();
  await shot('m12-hold-0450');
  const frames = await play('open', async () => {}, [0, 30, 60, 100, 150, 250, 400, 550, 700, 900, 1300], 'm12-open');
  await page.mouse.up();
  await wait(300);
  const sheetBox = await C(() => { const b = document.querySelector('#sheet-root .sheet').getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; });
  const flightF = frames.filter(f => f.at != null);
  const f0 = flightF[0], fEnd = flightF[flightF.length - 1];
  check('the scene\'s editor opened over the room, one step in the history', /\/scene\//.test(await C(() => location.hash)) && (await C(() => history.state.n)) === n0 + 1, { hash: await C(() => location.hash), n: await C(() => history.state.n), n0 });
  check('the surface starts on the chip (pressed as it was)', f0 && f0.at <= 40 && near(f0.sf, pressed.chip, 6), { first: f0 && f0.sf, at: f0 && f0.at, chip: pressed.chip });
  check('and ends on the sheet\'s box, full width, its bottom off the screen', fEnd && fEnd.at >= 450 && fEnd.sf.l <= 1 && fEnd.sf.r >= 411 && Math.abs(fEnd.sf.t - sheetBox.t) <= 4 && fEnd.sf.b >= 915, { end: fEnd && fEnd.sf, at: fEnd && fEnd.at, sheet: sheetBox });
  const midF = flightF.filter(f => f.at > 40 && f.at < 450);
  check('in between it grows from one to the other, never shrinking', midF.length > 3 && midF.every((f, i) => f.sf.h >= pressed.chip.h - 2 && (!i || (f.sf.h >= midF[i - 1].sf.h - 1 && f.sf.w >= midF[i - 1].sf.w - 1))), midF.map(f => [f.at, f.sf.w, f.sf.h]));
  // the owner's rule: no copper flashes. The copper never paints more than about a chip's worth of the screen, and
  // is never more than a faint trace over anything much bigger than the chip.
  const chipArea = pressed.chip.w * pressed.chip.h;
  const cop = frames.filter(f => f.copperArea > 0).map(f => ({ at: f.at, mass: Math.round(f.copper / chipArea * 100) / 100, size: Math.round(f.copperArea / chipArea * 10) / 10, o: f.copperO }));
  check('the copper starts as the chip', cop.length && cop[0].at <= 20 && cop[0].o > 0.4 && cop[0].size < 1.6, cop.slice(0, 3));
  check('no large copper panel at any moment (copper paints at most 1.5 chips\' worth)', cop.every(c => c.mass <= 1.5), cop.filter(c => c.mass > 1.2));
  check('and nothing over 4 chips in size is more than a 10% trace of copper', cop.every(c => c.size <= 4 || c.o <= 0.1), cop.filter(c => c.size > 4 && c.o > 0.1));
  check('the copper is gone within 0.18 s', frames.filter(f => f.at != null && f.at > 180).every(f => f.copperO < 0.01), cop.filter(c => c.at > 180));
  check('the title starts at the chip\'s word, width matched', f0 && f0.h1 && dist(f0.h1, pressed.word) <= 6 && Math.abs(f0.h1.w - pressed.word.w) <= 8, { h1: f0 && f0.h1, word: pressed.word });
  const h1Rest = await C(() => { const g = document.createRange(); g.selectNodeContents(document.querySelector('#sheet-root .sheet-head h2')); const r = g.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width) }; });
  check('and ends where it rests', fEnd && near(fEnd.h1, h1Rest, 4), { end: fEnd && fEnd.h1, rest: h1Rest });
  const ghosted = frames.filter(f => f.at != null && f.at > 160 && (f.wordo > 0.02 || f.h1o < 0.98));
  check('the word and the title cross only in the first 0.15 s', ghosted.length === 0 && f0.wordo > 0.7 && f0.h1o < 0.3, { ghosted: ghosted.slice(0, 3).map(f => [f.at, f.wordo, f.h1o]), first: [f0.wordo, f0.h1o] });
  const apart = frames.filter(f => f.at != null && f.word && f.wordo > 0.02 && (dist(f.word, f.h1) > 2 || Math.abs(f.word.w - f.h1.w) > 3));
  check('while they cross, the word\'s letters sit on the title\'s (centre and width within 2 to 3 px)', apart.length === 0, apart.map(f => [f.at, f.word, f.h1]));
  const doubled = frames.filter(f => f.at != null && f.wordo > 0.35 && f.h1o > 0.35);
  check('and are never both plainly there (no doubled word)', doubled.length === 0, doubled.map(f => [f.at, f.wordo, f.h1o]));
  // the orbs rise from where the chip was, left to right
  const n = frames[frames.length - 1].orbs.length;
  const T = frames.find(f => f.at != null && f.at > 50); const base = T.t - T.at;
  const firstSeen = [...Array(n).keys()].map(i => { const f = frames.find(x => x.orbs[i] && x.orbs[i].o > 0.3); return f ? f.t - base : null; });
  check('the stage has its orbs', n >= 2, n);
  check('the orbs rise in order, left to right, about 0.05 s apart, after the surface has opened', firstSeen.every(x => x != null && x >= 380) && firstSeen.every((x, i) => !i || x >= firstSeen[i - 1]) && firstSeen[n - 1] - firstSeen[0] >= 30 * (n - 1), firstSeen);
  const rest = frames[frames.length - 1].orbs;
  const cc = mid(pressed.chip);
  const from = [...Array(n).keys()].map(i => { const f = frames.find(x => x.orbs[i] && x.orbs[i].o > 0.02); return f ? f.orbs[i] : null; });
  check('each from where the chip was (starting nearer the chip than its own place)', from.every((o, i) => o && Math.hypot(o.x - cc.x, o.y - cc.y) < Math.hypot(rest[i].x - cc.x, rest[i].y - cc.y)), { from, rest, chip: cc });
  check('the orbs land in their places, fully shown', rest.every(o => o.o === 1), rest);
  const lit = await C(() => document.querySelectorAll('#sheet-root .sc-orb .glow:not(.off)').length);
  const bloomed = frames.filter(f => f.blooms > 0).map(f => f.t - base);
  check('each lit orb\'s light blooms as it lands (from 0.65 s), and is gone after', lit > 0 && bloomed.length > 3 && Math.min(...bloomed) >= 600 && Math.max(...frames.map(f => f.blooms)) <= lit && !(await page.$('.m12-bloom')), { lit, from: Math.min(...bloomed), to: Math.max(...bloomed), most: Math.max(...frames.map(f => f.blooms)) });
  check('nothing of the flight is left on the sheet', !(await page.$('#sheet-root .m12-fill, #sheet-root .m12-word, #sheet-root .m12-face, #sheet-root .m12-edge, .m12-bloom')), await C(() => [...document.querySelectorAll('[class*="m12"]')].map(e => e.className)));
  check('and the sheet is itself: clipped by its own rule, no transform', await C(() => { const s = document.querySelector('#sheet-root .sheet'); const cs = getComputedStyle(s); return cs.transform === 'none' && /inset\(0px round 28px 28px 0px 0px\)|inset\(0px round 28px 28px 0px\)/.test(cs.clipPath) && s.getAnimations().length === 0; }), await C(() => getComputedStyle(document.querySelector('#sheet-root .sheet')).clipPath));
  await shot('m12-open-after');

  // the editor is itself: an orb takes a finger (it opens its choices on a tap), and its choices close again
  await page.click('#sheet-root .sc-lane:first-child .sc-orb'); await wait(500);
  check('the stage works: a tap on an orb opens its choices under the stage', !!(await page.$('#sheet-root .sc-edit')));
  await page.click('#sheet-root [data-act="stage-close"]'); await wait(400);

  // ---- the close (its X): orbs gather, then the sheet goes back into the chip
  await C(() => { window.__m12.mode = 'close'; });
  const cframes = await play('close', () => C(() => document.querySelector('#sheet-root .sheet-close').click()), [0, 100, 200, 300, 450, 560, 640, 690], 'm12-close', 900);
  const chipNow = await chipAt();
  const cF = cframes.filter(f => f.at != null);
  const c0 = cF[0], cEnd = cF[cF.length - 1];
  check('closing is the room, one step back', (await C(() => location.hash)) === hashRoom && (await C(() => history.state.n)) === n0 && !(await page.$('#sheet-root .sheet')), { hash: await C(() => location.hash), n: await C(() => history.state.n) });
  check('the surface starts as the sheet', c0 && c0.at <= 40 && c0.sf.l <= 1 && c0.sf.r >= 411 && Math.abs(c0.sf.t - sheetBox.t) <= 4, { first: c0 && c0.sf, at: c0 && c0.at });
  check('holds while the orbs gather, then closes into the chip', cF.filter(f => f.at < 240).every(f => Math.abs(f.sf.t - sheetBox.t) <= 4) && cEnd && cEnd.at >= 640 && near(cEnd.sf, chipNow.chip, 4), { end: cEnd && cEnd.sf, at: cEnd && cEnd.at, chip: chipNow.chip });
  const gone = [...Array(n).keys()].map(i => { const f = cframes.find(x => x.orbs[i] && x.orbs[i].o < 0.5); return f ? f.t : null; });
  check('the orbs gather first, right to left', gone.every(x => x != null) && gone.every((x, i) => i === n - 1 || x >= gone[i + 1]) && cF.filter(f => f.at > 300).every(f => f.orbs.every(o => o.o < 0.05)), gone);
  check('the title goes back into the chip\'s word', cEnd && dist(cEnd.h1, chipNow.word) <= 6 && Math.abs(cEnd.h1.w - chipNow.word.w) <= 8, { h1: cEnd && cEnd.h1, word: chipNow.word });
  const early = cF.filter(f => f.at < 540 && (f.so < 0.98 || f.h1o < 0.98));
  check('and the title and the word cross only in the last 0.15 s', early.length === 0, early.slice(0, 3).map(f => [f.at, f.so, f.h1o]));
  const twice = cF.filter(f => f.h1o * f.so > 0.35 && 1 - f.so > 0.35);
  check('and are never both plainly there (the chip\'s own word shows as the surface goes)', twice.length === 0, twice.map(f => [f.at, f.h1o, f.so]));
  check('the scrim clears as it closes', cF.filter(f => f.at > 540).every(f => f.scrim < 0.05), cF.filter(f => f.at > 540).map(f => f.scrim));
  check('nothing of it is left, and the chip is itself', !(await page.$('.m12-ghost, .sheet-ghost')) && (await C(s => getComputedStyle(document.querySelector(s)).visibility, chip)) === 'visible');
  await shot('m12-close-after');

  // ---- Back closes it the same way, one Back for one step
  const holdOpen = async () => {
    await C(s => { document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }); }, chip); await wait(300);
    const b = await page.locator(chip).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await wait(650); await page.mouse.up(); await wait(1500);
  };
  await holdOpen();
  check('held again, it opens again', /\/scene\//.test(await C(() => location.hash)) && (await C(() => history.state.n)) === n0 + 1);
  await C(() => history.back()); await wait(120);
  check('Back closes it into the chip too', !!(await page.$('.m12-ghost .sheet')));
  await wait(900);
  check('one Back, and it is the room', (await C(() => location.hash)) === hashRoom && (await C(() => history.state.n)) === n0 && !(await page.$('#sheet-root .sheet, .m12-ghost')));

  // ---- a swipe down hands over: from wherever the finger left it, into the chip
  await holdOpen();
  const sframes = await (async () => {
    await C(() => { const M = window.__m12; M.mode = 'close'; M.stops = []; M.frames = []; M.T = null; M.on = true; });
    const g = await page.locator('#sheet-root .grab').boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + 4); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(g.x + g.width / 2, g.y + 4 + i * 22); await wait(16); }
    await page.mouse.up(); await wait(900);
    return C(() => { const M = window.__m12; M.on = false; return M.frames; });
  })();
  const sF = sframes.filter(f => f.at != null);
  check('a swipe down goes into the chip from where the finger left it', sF.length > 3 && sF[0].sf.t > sheetBox.t + 150 && near(sF[sF.length - 1].sf, (await chipAt()).chip, 5), { first: sF[0] && sF[0].sf, last: sF.length && sF[sF.length - 1].sf });
  check('it goes straight there, and never drops off the bottom', sF.every((f, i) => !i || (f.sf.t >= sF[i - 1].sf.t - 1 && f.sf.b <= sF[i - 1].sf.b + 1)), sF.map(f => [f.sf.t, f.sf.b]));
  check('and it is the room, one step back', (await C(() => location.hash)) === hashRoom && (await C(() => history.state.n)) === n0 && !(await page.$('#sheet-root .sheet, .m12-ghost')));

  // ---- Android's back swipe (M13) drives the sheet down; let go, it goes into the chip from there
  await holdOpen();
  const pb = await C(() => !!(window.__caseta && window.__caseta.back));
  if (pb) {
    await C(() => { const M = window.__m12; M.mode = 'close'; M.stops = []; M.frames = []; M.T = null; M.on = true; });
    await C(() => { const b = window.__caseta.back; b.start('left', 2, 400); for (const p of [0.1, 0.2, 0.3, 0.4]) b.progress(p, 60, 400); });
    await wait(100);
    await C(() => window.__caseta.back.commit());
    await wait(900);
    const bF = (await C(() => { const M = window.__m12; M.on = false; return M.frames; })).filter(f => f.at != null);
    check('Android\'s back swipe, let go, goes into the chip from where it left the sheet', bF.length > 3 && bF[0].sf.t > sheetBox.t + 100 && near(bF[bF.length - 1].sf, (await chipAt()).chip, 5), { first: bF[0] && bF[0].sf, last: bF.length && bF[bF.length - 1].sf });
    check('and it is the room, one step back', (await C(() => location.hash)) === hashRoom && (await C(() => history.state.n)) === n0 && !(await page.$('#sheet-root .sheet, .sheet-ghost')));
  } else check('Android\'s back swipe is wired (window.__caseta.back)', false);

  // ---- the close driven from outside by a progress (a back gesture): paused, sought, cancelled, then played
  await holdOpen();
  const ext = await C(async () => {
    const m = await import('/ui/chipopen.js');
    const root = document.querySelector('#sheet-root');
    const surf = () => { const g = document.querySelector('.m12-ghost .sheet'); if (!g) return null; const b = g.getBoundingClientRect(); const n = /inset\(([^)]*?) round/.exec(getComputedStyle(g).clipPath)[1].split(/\s+/).map(parseFloat); return Math.round(b.height - n[0] - n[2]); };
    const ctl = m.closer(root);
    if (!ctl) return { ctl: false };
    ctl.seek(0.2); const h20 = surf();
    ctl.seek(0.8); const h80 = surf();
    const hidden = getComputedStyle(root.querySelector('.sheet')).visibility;
    ctl.cancel();
    const back = { ghost: !!document.querySelector('.m12-ghost'), vis: getComputedStyle(root.querySelector('.sheet')).visibility };
    const again = m.closer(root); again.seek(0.5);
    again.play();
    root.querySelector('.sheet-close').click();
    const ghosts = document.querySelectorAll('.sheet-ghost').length;
    return { ctl: true, total: ctl.total, h20, h80, hidden, back, ghosts };
  });
  check('the close can be built paused and sought: 0.2 is still the sheet, 0.8 is most of the way into the chip', ext.ctl && ext.total === 700 && ext.h20 > 800 && ext.h80 < 200 && ext.hidden === 'hidden', ext);
  check('cancelled, the sheet is itself again', ext.back && !ext.back.ghost && ext.back.vis === 'visible', ext.back);
  check('played, then closed as usual, it goes into the chip once (no second drop)', ext.ghosts === 1, ext.ghosts);
  await wait(900);
  check('and it is the room, one step back', (await C(() => location.hash)) === hashRoom && (await C(() => history.state.n)) === n0 && !(await page.$('#sheet-root .sheet, .sheet-ghost')));

  // ---- the plain rise and drop where it was not opened from its chip: its address
  await C(([a, p]) => { location.hash = `room/${a}/scene/${p}`; }, [aid, pid]); await wait(60);
  const plain = await C(() => ({ m12: !!document.querySelector('.m12-fill, .m12-word'), rise: document.querySelector('#sheet-root .sheet').getAnimations().some(a => a.animationName === 'sheetrise') }));
  check('reached by its address it rises as a plain sheet', !plain.m12 && plain.rise, plain);
  await wait(700);
  await C(() => document.querySelector('#sheet-root .sheet-close').click()); await wait(60);
  check('and drops as a plain sheet', !(await page.$('.m12-ghost')) && !!(await page.$('.sheet-ghost')));
  await wait(800);
  check('and closing is the room', (await C(() => location.hash)) === hashRoom && !(await page.$('#sheet-root .sheet')));

  // ---- All scenes: a scene's row opens the same way from the row
  await C(() => { location.hash = 'scenes'; }); await wait(1000);
  const row = `#screen .scene-row[data-id="${pid}"]`;
  await C(s => document.querySelector(s).scrollIntoView({ block: 'center' }), row); await wait(400);
  const rowBox = await C(s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }, row);
  const rframes = await play('open', () => C(s => document.querySelector(s + ' .row-chev').click(), row), [60, 250], 'm12-row', 1400);
  const r0 = rframes.find(f => f.at != null);
  check('on All scenes a row\'s chevron opens its scene from the row', r0 && r0.at <= 40 && near(r0.sf, rowBox, 6) && (await C(() => location.hash)) === `#scenes/${pid}`, { first: r0 && r0.sf, row: rowBox });
  await C(() => { window.__m12.mode = 'close'; });
  const rc = await play('close', () => C(() => history.back()), [], 'm12-row-close', 1000);
  const rEnd = rc.filter(f => f.at != null).pop();
  check('and Back closes it into the row', rEnd && near(rEnd.sf, rowBox, 6) && (await C(() => location.hash)) === '#scenes', { end: rEnd && rEnd.sf, row: rowBox });

  // and a starred scene's tile opens from the tile when held
  await C(async p => { const c = window.__copper; c.S.config.favorites = [...(c.S.config.favorites || []).filter(t => t !== 'p:' + p), 'p:' + p]; await c.data.saveConfig(); c.render(); }, pid); await wait(800);
  const tile = `#screen .scene-tile[data-id="${pid}"]`;
  await C(s => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'center' }); }, tile); await wait(400);
  const tb = await page.locator(tile).boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.mouse.down(); await wait(430);
  const tileBox = await C(s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }, tile);
  const tframes = await play('open', async () => {}, [40, 120], 'm12-tile', 1400);
  await page.mouse.up(); await wait(300);
  const t0f = tframes.find(f => f.at != null);
  check('a scene\'s tile on All scenes, held, opens its scene from the tile', t0f && t0f.at <= 40 && near(t0f.sf, tileBox, 6) && (await C(() => location.hash)) === `#scenes/${pid}`, { first: t0f && t0f.sf, tile: tileBox });
  await C(() => { window.__m12.mode = 'close'; });
  const tc = await play('close', () => C(() => document.querySelector('#sheet-root .sheet-close').click()), [], 'm12-tile-close', 1000);
  const tEnd = tc.filter(f => f.at != null).pop();
  check('and closes into the tile', tEnd && near(tEnd.sf, tileBox, 6) && (await C(() => location.hash)) === '#scenes', { end: tEnd && tEnd.sf, tile: tileBox });

  check('no errors on the page', !errors.length, errors);
  await ctx.close();

  // ---- reduced motion: the plain sheet
  const rm = await open({ reducedMotion: 'reduce' });
  const P = rm.page;
  await P.goto(root + `#room/${aid}`); await P.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  await P.waitForSelector(chip, { timeout: 8000 }).catch(() => {});
  await P.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }), chip); await wait(300);
  const rb = await P.locator(chip).boundingBox();
  await P.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await P.mouse.down(); await wait(650); await P.mouse.up(); await wait(60);
  const q1 = await P.evaluate(() => ({ hash: location.hash, sheet: !!document.querySelector('#sheet-root .sheet'), m12: !!document.querySelector('[class*="m12"]'), clip: document.querySelector('#sheet-root .sheet') && document.querySelector('#sheet-root .sheet').getAnimations().some(a => a.effect.getKeyframes().some(k => k.clipPath)) }));
  check('reduced motion: holding opens the plain sheet, no flight', /\/scene\//.test(q1.hash) && q1.sheet && !q1.m12 && !q1.clip, q1);
  await P.evaluate(() => document.querySelector('#sheet-root .sheet-close').click()); await wait(60);
  const q2 = await P.evaluate(() => ({ hash: location.hash, m12: !!document.querySelector('.m12-ghost') }));
  check('reduced motion: and closing is the plain close', !q2.m12, q2);
  await wait(500);
  // put everything back as it was found
  await P.evaluate(async x => { const c = window.__copper; c.data.restoreConfig(x); await c.data.saveConfig(); c.render(); }, cfg0);
  check('no errors on the page (reduced motion)', !errors.length, errors);
  await rm.ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
