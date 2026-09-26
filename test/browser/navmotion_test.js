// Moving between pages, read frame by frame: the checks that keep the jumps found in the motion pass from coming back.
// Each one samples what it is about on every animation frame (requestAnimationFrame, in the page) and says what it
// measured. The pass found, and this holds:
//   the tab bar's white circle crosses to the tab tapped on its own transition, rather than jumping there
//   a page leaving keeps its drawings' gradients (a Pico went to a bare outline as Remotes left)
//   the house's light over Rooms crosses into the room's as a room opens and back as it closes, never out in a frame
//   Back while a room is opening turns the open round, rather than jumping it open to close from there
//   a picker opening inside a sheet moves the sheet's top edge there, rather than jumping it
//   Back part way into a push leaves from as far as the page had come, rather than whole
//   after a back swipe from a room opened on Home, Home stays as the swipe showed it (it went dark and came back)
//   after a back swipe from a light, the tab bar comes up with the room (it stood there whole from the first frame)
//   a sheet still rising is taken by a back swipe from where it is (it jumped to where it rests)
//   Back while a scene's editor grows out of its chip turns it round (it stood fully open for a frame)
//   the header's scroll is written onto the header rows, never onto #app, where it restyled the whole page each frame
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (what, ok, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// In the page: sample fn() on every frame for ms, from the moment it is called.
function sampler() {
  window.__rec = (src, ms) => {
    const fn = eval(src); const out = []; const t0 = performance.now();
    window.__frames = out;
    return new Promise(res => {
      const tick = () => { const t = performance.now() - t0; try { out.push({ t: Math.round(t), v: fn() }); } catch (e) { out.push({ t, v: String(e) }); } if (t < ms) requestAnimationFrame(tick); else res(out); };
      requestAnimationFrame(tick);
    });
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
  await ctx.addInitScript(sampler);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`http://127.0.0.1:${PORT}/ui/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready && window.__caseta && window.__caseta.back, null, { timeout: 15000 });
  await wait(1000);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  // record fn (a function's source, run in the page) over ms while act() runs
  const rec = async (fn, ms, act) => { const p = C(([f, m]) => window.__rec(f, m), [fn, ms]); await wait(30); await act(); return p; };
  const go = async h => { await C(x => { location.hash = x; }, h); await wait(1300); };
  const B = (m, ...a) => C(([m, a]) => window.__caseta.back[m](...a), [m, a]);
  const maxStep = (fr, k = v => v) => { let m = 0; for (let i = 1; i < fr.length; i++) { const a = k(fr[i - 1].v), b = k(fr[i].v); if (a != null && b != null) m = Math.max(m, Math.abs(b - a)); } return Math.round(m * 1000) / 1000; };
  const aid = await C(() => { const c = window.__copper; return c.data.areas().find(x => c.H.roomLights(x.id).length).id; });
  // the room lit, so the lights at the top of the screen are there to cross
  await C(async id => { const c = window.__copper; await c.run({ type: 'level', target: `a:${id}`, level: 'on' }); }, aid);
  await wait(1200);

  // ---- the tab bar's circle crosses on its own transition, on the same buttons
  await go('home');
  const before = await C(() => { window.__tabs0 = [...document.querySelectorAll('#tabs button')]; return window.__tabs0.length; });
  let fr = await rec(`() => getComputedStyle(document.querySelector('#tabs [data-go="rooms"]')).backgroundColor`, 400, () => page.click('#tabs [data-go="rooms"]'));
  const mids = new Set(fr.map(f => f.v).filter(v => v !== fr[0].v && v !== fr[fr.length - 1].v));
  const same = await C(() => [...document.querySelectorAll('#tabs button')].every((b, i) => b === window.__tabs0[i]));
  check('the tab tapped fills on its transition, on the buttons that were there', before === 5 && same && mids.size >= 3, { frames: fr.length, between: mids.size, same });
  await wait(600);

  // ---- a page leaving keeps its drawings' gradients (Remotes' Picos)
  await go('remotes');
  fr = await rec(`() => { const g = document.querySelector('.page-ghost'); if (!g) return null; const svg = g.querySelector('.pico-svg'); return svg ? svg.querySelectorAll('[id]').length : -1; }`, 250, () => page.click('#tabs [data-go="home"]'));
  const withIds = fr.map(f => f.v).filter(v => v != null);
  check('Remotes leaving keeps its Picos\' gradients while it goes', withIds.length > 0 && withIds.every(n => n > 0), withIds.slice(0, 4));
  await wait(600);

  // ---- the house's light over Rooms crosses into the room's, and back
  await go('rooms');
  const light = `() => { const g = document.querySelector('.page-ghost .rooms-light'), s = document.querySelector('#screen .rooms-light'), r = document.querySelector('#screen .room-light, .page-ghost .room-light');
    const o = n => n ? Number(getComputedStyle(n).opacity) : null; return { house: o(g) ?? o(s), room: o(r), ghost: !!g }; }`;
  fr = await rec(light, 900, () => page.click(`#screen .room-big[data-go="room/${aid}"] .nm`));
  const lastGhost = [...fr].reverse().find(f => f.v.ghost);
  check('opening a room, the house\'s light is gone by the time Rooms is (not out in one frame)', !!lastGhost && lastGhost.v.house < 0.05 && maxStep(fr.filter(f => f.v.ghost), v => v.house) < 0.2, { last: lastGhost && lastGhost.v, step: maxStep(fr.filter(f => f.v.ghost), v => v.house) });
  await wait(600);
  const full = await C(() => document.querySelector('#screen .room-photo-card').offsetHeight);
  fr = await rec(light, 800, () => C(() => history.back()));
  const came = fr.find(f => f.v.house != null);
  check('closing it, the house\'s light comes back on the close\'s clock (not on in one frame)', !!came && came.v.house < 0.2 && maxStep(fr, v => v.house) < 0.2 && fr[fr.length - 1].v.house > 0.3, { first: came && came.v.house, step: maxStep(fr, v => v.house), end: fr[fr.length - 1].v.house });
  await wait(700);

  // ---- Back while a room is opening turns it round
  const win = `() => { const h = document.querySelector('.room-photo-card'); if (!h) return null; const cp = getComputedStyle(h).clipPath; const n = (/inset\\(([^)]*?)(?: round|\\))/.exec(cp) || [null, '0px'])[1].trim().split(/\\s+/).map(parseFloat); const b = h.getBoundingClientRect(); const s = b.width / h.offsetWidth; return Math.round(b.height - (n[0] + (n[2] ?? n[0])) * s); }`;
  fr = await rec(win, 900, async () => { await page.click(`#screen .room-big[data-go="room/${aid}"] .nm`); await wait(180); await C(() => history.back()); });
  const widths = fr.map(f => f.v).filter(v => v != null);
  const peak = widths.indexOf(Math.max(...widths));
  const after = widths.slice(peak);
  check('Back while a room opens: the window turns round where it is, never reaching full size, and shrinks back steadily', widths.length > 3 && Math.max(...widths) < full - 4 && after.every((w, i) => i === 0 || w <= after[i - 1] + 0.5), { peak: Math.max(...widths), full });
  await wait(500);
  const clean = await C(a => ({ hash: location.hash, left: document.querySelectorAll('.page-ghost, .op-top').length, card: getComputedStyle(document.querySelector(`#screen .room-big[data-go="room/${a}"]`)).visibility }), aid);
  check('and lands on Rooms as it was, nothing left over', clean.hash === '#rooms' && !clean.left && clean.card === 'visible', clean);

  // ---- a picker inside a sheet moves the sheet's top edge
  const lid = await C(() => window.__copper.data.controllable().find(d => d.domain === 'light').device_id);
  await go(`light/${lid}/about`);
  const edge = `() => { const s = document.querySelector('#sheet-root .sheet'), u = document.querySelector('.sheet-under'); return s ? Math.round(u ? Math.min(u.getBoundingClientRect().top, s.getBoundingClientRect().top) : s.getBoundingClientRect().top) : null; }`;
  fr = await rec(edge, 600, () => C(() => document.querySelector('#sheet-root [data-act="about-move"]').click()));
  const tops = fr.map(f => f.v).filter(v => v != null);
  check('a picker opening in a sheet moves its top edge to the new height, never jumping there', Math.abs(tops[tops.length - 1] - tops[0]) > 60 && maxStep(fr) < 0.5 * Math.abs(tops[tops.length - 1] - tops[0]), { from: tops[0], to: tops[tops.length - 1], step: maxStep(fr) });
  fr = await rec(edge, 600, () => C(() => document.querySelector('#sheet-root [data-act="picker-back"]').click()));
  check('and back again the same way', maxStep(fr) < 140 && !(await page.$('.sheet-under')), { step: maxStep(fr) });
  await C(() => window.__copper.dismiss()); await wait(800);

  // ---- Back part way into a push
  await go('settings');
  const target = await C(() => { const t = [...document.querySelectorAll('#screen [data-go]')].find(n => /^(activity|timing|add)/.test(n.dataset.go)); return t && t.dataset.go; });
  const pushed = `() => { const s = document.querySelector('#screen'), gs = [...document.querySelectorAll('.page-ghost')]; return { s: Number(getComputedStyle(s).opacity), g: gs.map(g => Number(getComputedStyle(g).opacity)), n: gs.length }; }`;
  for (const at of [40, 110]) {
    fr = await rec(pushed, 500, async () => { await page.click(`#screen [data-go="${target}"]`); await wait(at); await C(() => history.back()); });
    // nothing is seen brighter than anything was the frame before (a page caught part way in stood whole as it left)
    const worst = Math.max(...fr.slice(1).map((f, i) => Math.max(0, ...f.v.g) - Math.max(fr[i].v.s, ...fr[i].v.g)));
    check(`Back ${at} ms into a push: the page going leaves from as far as it had come, and none is seen whole`, fr.some(f => f.v.n) && worst < 0.15 && fr.every(f => f.v.s + f.v.g.reduce((a, b) => a + b, 0) < 1.6), { worst: Math.round(worst * 100) / 100, ghosts: Math.max(...fr.map(f => f.v.n)) });
    await wait(700);
    if ((await C(() => location.hash)) !== '#settings') await go('settings');
  }
  await wait(600);

  // ---- a back swipe from a room opened on Home: Home stays as the swipe showed it
  await C(async id => { const c = window.__copper; if (!c.H.isPinned(`a:${id}`)) { c.H.togglePin(`a:${id}`); await c.save('', { quiet: true }); } }, aid);
  await go('home');
  await page.click(`.pin-grid .pin-room[data-go="room/${aid}"]`, { position: { x: 20, y: 20 } }); await wait(1500);
  await B('start', 'left', 4, 460); for (let i = 1; i <= 12; i++) { await B('progress', i * 0.03, 40, 460); await wait(16); }
  fr = await rec(`() => { const h = document.querySelector('#screen .home'); if (!h) return null; return [...h.children].filter(n => n.getBoundingClientRect().height).map(n => Number(getComputedStyle(n).opacity)); }`, 900, () => B('commit'));
  // each part of Home against where it rests once it is all over
  const rest = fr[fr.length - 1].v || [];
  const homeO = fr.map(f => f.v).filter(v => v && v.length === rest.length).map(v => Math.min(...v.map((o, i) => (rest[i] ? o / rest[i] : 1))));
  check('after a back swipe from a room opened on Home, nothing of Home goes out and comes back', homeO.length > 5 && Math.min(...homeO) > 0.95, { min: Math.min(...homeO), frames: homeO.length });
  await wait(700);

  // ---- a back swipe from a light: the tab bar comes up with the room
  await go(`room/${aid}`);
  const tile = await C(() => document.querySelector('.room-grid > .tile[data-go^="light/"]').dataset.go);
  await page.click(`.room-grid > .tile[data-go="${tile}"] .nm`); await wait(1600);
  await B('start', 'left', 4, 460); for (let i = 1; i <= 12; i++) { await B('progress', i * 0.03, 40, 460); await wait(16); }
  fr = await rec(`() => { const t = document.querySelector('#tabs'); return t.hidden ? null : Number(getComputedStyle(t).opacity); }`, 700, () => B('commit'));
  const tabO = fr.map(f => f.v).filter(v => v != null);
  check('after a back swipe from a light, the tab bar comes up with the room, not whole from the first frame', tabO.length > 5 && tabO[0] < 0.3 && tabO[tabO.length - 1] === 1 && maxStep(fr.filter(f => f.v != null)) < 0.35, { first: tabO[0], step: maxStep(fr.filter(f => f.v != null)) });
  await wait(700);

  // ---- a sheet still rising is taken by a back swipe from where it is
  await go(`light/${lid}`);
  const sheetTop = () => C(() => { const s = document.querySelector('#sheet-root .sheet'); return s ? Math.round(s.getBoundingClientRect().top) : null; });
  await page.click('.dev .hdr .a1'); await wait(60);
  const rising = await sheetTop();
  await B('start', 'left', 4, 460);
  const held = await sheetTop();
  check('a back swipe takes a sheet still rising from where it is', rising != null && held != null && held >= rising - 30, { rising, held });
  await B('cancel'); await wait(700);
  await C(() => window.__copper.dismiss()); await wait(800);

  // ---- Back while a scene's editor grows out of its chip turns it round
  // (a room with scenes, as chipopen_test makes one)
  const sid = await C(async () => {
    const c = window.__copper;
    const a = c.data.areas().slice().sort((x, y) => c.H.roomLights(y.id).length - c.H.roomLights(x.id).length)[0];
    if (!c.H.roomScenes(a.id).length) { c.H.suggestScenes(a.id); await c.data.saveConfig(); }
    return a.id;
  });
  await go(`room/${sid}`);
  const chip = '#screen .room-chips .chip[data-hold="scene-edit"]';
  if (await page.$(chip)) {
    await C(s => document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }), chip); await wait(300);
    const b = await page.locator(chip).first().boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await wait(560); await page.mouse.up();
    fr = await rec(`() => { const s = document.querySelector('.m12-ghost .sheet') || document.querySelector('#sheet-root .sheet'); if (!s) return null; const m = /inset\\(([\\d.e-]+)px/.exec(getComputedStyle(s).clipPath); return m ? Math.round(Number(m[1])) : 0; }`, 900, async () => { await wait(120); await C(() => history.back()); });
    const ins = fr.map(f => f.v).filter(v => v != null);
    const low = Math.min(...ins), at = ins.indexOf(low);
    check('Back while a scene\'s editor grows turns it round: it never stands open, and goes back into the chip steadily', ins.length > 5 && low > 20 && ins.slice(at).every((v, i, a) => i === 0 || v >= a[i - 1] - 1), { least: low, frames: ins.length });
    await wait(600);
    check('and nothing of it is left', !(await page.$('.m12-ghost, .sheet-ghost')) && (await C(() => document.querySelector('#sheet-root').hidden)));
  } else check('the room has a scene chip to hold', false);

  // ---- the header's scroll is on its rows
  await go('rooms');
  await page.mouse.wheel(0, 40); await wait(300);
  const hp = await C(() => ({ app: document.getElementById('app').style.getPropertyValue('--hdr-p'), row: getComputedStyle(document.querySelector('#screen .rooms-head')).getPropertyValue('--hdr-p'), y: scrollY }));
  check('the header\'s scroll is written on its rows, not on #app', hp.app === '' && Math.abs(Number(hp.row) - Math.min(1, hp.y / 64)) < 0.02, hp);
  await page.mouse.wheel(0, -200); await wait(300);

  check('no errors on the page', !errors.length, errors);
  await browser.close();
  if (fails.length) { console.log(`FAILED ${fails.length}`); process.exit(1); }
})().catch(e => { console.log('FAILED', e.message); process.exit(1); });
