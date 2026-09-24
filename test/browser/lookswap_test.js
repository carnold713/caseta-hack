// M16 · Colour to White and back, "Gather" (Figma 12979:5513): the two tabs on a colour lamp's sheet.
//
//   the lamp follows the tab: White takes a lit colour lamp to the nearest white it can make (blue to the cool end,
//     as far as the lamp goes), Colour straight after gives it back the colour White took; an off lamp stays off
//   the lamp's colour travels: a dot leaves the wheel's handle, lands on the sun (and back), and the new sheet's own
//     dot shows only once it has landed; the old sheet leaves as a copy that is gone by the end, and nothing of the
//     swap is left behind (no copies, no dot)
//   the pill slides and the parts of the new sheet come in after it (held back by delayed animations)
//   with reduced motion asked for, the tabs swap at once and nothing flies
//
// Runs after hue_test and hue_color_test, which pair the fake Hue bridge: that is where the colour lamp comes from.
// It puts the lamp back the way it found it.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  const goto = async (h, ms = 900) => { await C(x => { location.hash = x; }, h); await wait(ms); };
  await page.goto(`http://127.0.0.1:${PORT}/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.solid'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(900);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });

  const lamp = await C(() => (window.__copper.data.controllable().find(d => d.color && d.ct) || {}).device_id);
  check('a colour lamp to test with (hue_color_test pairs one)', !!lamp, lamp);
  if (!lamp) { await browser.close(); process.exit(1); }
  const col0 = await C(id => JSON.stringify(window.__copper.S.states[id] || {}), lamp);
  const kmax = await C(id => { const d = window.__copper.data.dev(id); return d.ct_range && d.ct_range.length === 2 ? Number(d.ct_range[1]) : 6500; }, lamp);
  const col = () => C(id => { const s = window.__copper.S.states[id] || {}; const k = s.color || {}; return { level: s.level || 0, mode: k.mode, kelvin: k.kelvin, hex: String(k.hex || '').toUpperCase() }; }, lamp);
  const left = () => C(() => ({ dot: document.querySelectorAll('.m16-dot').length, copies: document.querySelectorAll('.m16-copy').length }));
  const tab = to => page.click(`#sheet-root .seg2 [data-act="look-swap"][data-to$="/${to}"]`);
  // every frame from the tap: where the travelling dot is and where the sheet's own dot is, once it shows (the sun is
  // drawn 28 across with its 2 px ring outside it, 32 as seen, as the dot lands)
  const sample = () => C(() => {
    window.__hand = []; const t0 = performance.now();
    const tick = () => {
      const f = document.querySelector('.m16-dot .m16-disc');
      const own = document.querySelector('#sheet-root .sheet-body .ws-thumb .disc') || document.querySelector('#sheet-root .sheet-body .wheel .handle');
      let o = 1; for (let e = own; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      const R = (el, pad) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width + pad]; };
      window.__hand.push({ fly: f && Number(getComputedStyle(document.querySelector('.m16-dot')).opacity) > 0 ? R(f, 0) : null, own: own && o > 0.99 ? R(own, own.classList.contains('disc') ? 4 : 0) : null });
      if (performance.now() - t0 < 1800) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const handover = () => C(() => {
    const h = window.__hand; const i = h.findIndex((x, j) => j && h[j - 1].fly && !x.fly);
    if (i < 1) return { ok: false, why: 'no handover' };
    const a = h[i - 1].fly, b = h[i].own, gaps = h.slice(i).filter(x => !x.own && !x.fly).length;
    return { ok: !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1 && Math.abs(a[2] - b[2]) < 1 && !gaps, last: a, first: b, gaps };
  });

  // on, in blue, on the Colour sheet
  await goto(`light/${lamp}/colour`, 1200);
  await page.click('.cs-sw .sw[data-hex="#4C8DFF"]'); await wait(1400);
  let st = await col();
  check('the lamp is on and blue to start', st.level > 0 && st.mode === 'xy' && st.hex === '#4C8DFF', st);

  // ---- Colour to White
  // where the handle is in the sheet (the sheet's top edge may slide to the new sheet's height, carrying the dot)
  const handle = await C(() => { const r = document.querySelector('.wheel .handle').getBoundingClientRect(), s = document.querySelector('#sheet-root .sheet').getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top }; });
  await sample();
  await tab('white');
  await wait(60);
  const early = await C(() => {
    const dot = document.querySelector('.m16-dot'), r = dot && dot.getBoundingClientRect(), sh = document.querySelector('#sheet-root .sheet').getBoundingClientRect();
    const own = document.querySelector('#sheet-root .ws-thumb');
    return {
      hash: location.hash, dot: !!dot, at: r ? { x: r.left + r.width / 2 - sh.left, y: r.top + r.height / 2 - sh.top } : null,
      copy: !!document.querySelector('.m16-copy .wheel'), own: own ? Number(getComputedStyle(own).opacity) : null,
      sky: Number(getComputedStyle(document.querySelector('#sheet-root .ws-sky')).opacity),
      chip: Number(getComputedStyle(document.querySelector('#sheet-root .ws-chips .chip')).opacity),
    };
  });
  check('White: the sheet is White at once (#light/<id>/white)', early.hash.endsWith(`/light/${lamp}/white`) || early.hash === `#light/${lamp}/white`, early.hash);
  check('White: the old wheel leaves as a copy over it, and a dot starts from the wheel\'s handle', early.copy && early.dot && early.at && Math.hypot(early.at.x - handle.x, early.at.y - handle.y) < 3, { early, handle });
  check('White: the sun, the sky and the named whites are held back until their moment', early.own === 0 && early.sky < 0.2 && early.chip < 0.2, early);
  st = await col();
  check(`White: the lamp goes to the nearest white it can make, blue to the cool end (${Math.min(kmax, 6500)}K)`, st.mode === 'ct' && st.kelvin === Math.min(kmax, 6500), st);
  await wait(420);
  const mid = await C(() => { const d = document.querySelector('.m16-dot'); const r = d && d.getBoundingClientRect(), sh = document.querySelector('#sheet-root .sheet').getBoundingClientRect(); return r ? { x: r.left + r.width / 2 - sh.left, y: r.top + r.height / 2 - sh.top } : null; });
  check('White: halfway, the dot is on its way', mid && Math.hypot(mid.x - handle.x, mid.y - handle.y) > 20, { mid, handle });
  await wait(520);
  const landed = await C(() => {
    const own = document.querySelector('#sheet-root .ws-thumb'), disc = own.querySelector('.disc').getBoundingClientRect();
    return { own: Number(getComputedStyle(own).opacity), dot: document.querySelectorAll('.m16-dot').length, sun: { x: disc.left + disc.width / 2, y: disc.top + disc.height / 2 } };
  });
  check('White: once the dot lands, the sun is the lamp\'s own again and the dot is gone', landed.own === 1 && landed.dot === 0, landed);
  await wait(700);
  const done = await C(() => ({ chips: [...document.querySelectorAll('#sheet-root .ws-chips .chip:not(.out)')].map(c => Number(getComputedStyle(c).opacity)), follow: document.querySelector('#sheet-root .ws-follow') ? Number(getComputedStyle(document.querySelector('#sheet-root .ws-follow')).opacity) : 1 }));
  check('White: by 1.5 s everything has arrived', done.chips.every(o => o === 1) && done.follow === 1, done);
  const hw = await handover();
  check('White: the dot hands over to the sun where it landed, same place and size, no frame without one (no jump)', hw.ok, hw);
  check('White: nothing of the swap is left behind', JSON.stringify(await left()) === '{"dot":0,"copies":0}', await left());
  await page.screenshot({ path: 'm16-white.png' });

  // ---- White to Colour: the colour White took comes back
  await sample();
  await tab('colour');
  await wait(60);
  const back = await C(() => {
    const dot = document.querySelector('.m16-dot'), hd = document.querySelector('#sheet-root .wheel .handle');
    return { dot: !!dot, copy: !!document.querySelector('.m16-copy .ws-sky'), hd: hd ? Number(getComputedStyle(hd).opacity) : null, wheel: Number(getComputedStyle(document.querySelector('#sheet-root .wheel')).opacity) };
  });
  check('Colour: the White sheet leaves as a copy, the dot starts from the sun, the wheel and its handle wait', back.dot && back.copy && back.hd === 0 && back.wheel < 0.2, back);
  st = await col();
  check('Colour: the lamp gets back the colour White took (blue)', st.mode === 'xy' && st.hex === '#4C8DFF', st);
  await wait(1400);
  const home = await C(() => ({ hd: Number(getComputedStyle(document.querySelector('#sheet-root .wheel .handle')).opacity), wheel: Number(getComputedStyle(document.querySelector('#sheet-root .wheel')).opacity), val: Number(getComputedStyle(document.querySelector('#sheet-root .cs-val')).opacity) }));
  check('Colour: the wheel has opened out of the handle and the rest has risen in', home.hd === 1 && home.wheel === 1 && home.val === 1, home);
  const hc = await handover();
  check('Colour: the dot hands over to the handle once the wheel is whole, same place and size (no jump)', hc.ok, hc);
  check('Colour: nothing of the swap is left behind', JSON.stringify(await left()) === '{"dot":0,"copies":0}', await left());

  // ---- a tab never makes up a colour: from a white the lamp was given, Colour leaves it white
  await tab('white'); await wait(1400);
  await page.click('#sheet-root .ws-chips .chip[data-n="Warm"]'); await wait(900);
  await tab('colour'); await wait(1400);
  st = await col();
  check('a white picked since White keeps: Colour does not put the old colour back', st.mode === 'ct' && Math.abs(st.kelvin - 2700) <= 50, st);

  // ---- an off lamp stays off whichever tab
  await C(id => { const c = window.__copper; c.assume([id], 0); c.soon(); return c.run({ type: 'color', target: `d:${id}`, hex: '#4C8DFF' }).then(() => c.run({ type: 'level', target: `d:${id}`, level: 'off' })); }, lamp);
  await wait(1500);
  await C(() => { const c = window.__copper; window.__col = []; const k = c.gate.sendColor; c.gate.sendColor = (...a) => { window.__col.push(a); return k(...a); }; });
  await tab('white'); await wait(1400);
  st = await col();
  const sent = await C(() => window.__col.length);
  check('an off lamp: White sends nothing and it stays off', sent === 0 && !(st.level > 0), { sent, st });
  check('and the swap still plays and tidies up', JSON.stringify(await left()) === '{"dot":0,"copies":0}', await left());

  // ---- reduced motion: the swap is at once
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await tab('colour'); await wait(60);
  const calm = await C(() => ({ dot: document.querySelectorAll('.m16-dot').length, copies: document.querySelectorAll('.m16-copy').length, wheel: !!document.querySelector('#sheet-root .wheel') }));
  check('reduced motion: Colour is there at once, and nothing flies', calm.wheel && calm.dot === 0 && calm.copies === 0, calm);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // closing the sheet mid-swap leaves nothing floating over the page
  await tab('white'); await wait(200);
  const falling = await C(() => { document.querySelector('#sheet-root .sheet [data-act="sheet-close"]').click(); const g = document.querySelector('.sheet-ghost'); return g ? g.querySelectorAll('.m16-copy, .m16-dot').length : 0; });
  check('closing the sheet mid-swap: the sheet falls without the swap\'s copies frozen on it', falling === 0, falling);
  await wait(450);
  check('closing the sheet mid-swap leaves nothing behind', JSON.stringify(await left()) === '{"dot":0,"copies":0}', await left());

  // put the lamp back as it was
  await C(([id, s]) => { const st = JSON.parse(s); const c = window.__copper; const k = st.color || {}; if (k.mode === 'ct' && k.kelvin) return c.run({ type: 'color', target: `d:${id}`, kelvin: k.kelvin, level: st.level || undefined }); if (k.mode === 'xy' && k.hex) return c.run({ type: 'color', target: `d:${id}`, hex: k.hex, level: st.level || undefined }); }, [lamp, col0]);
  await wait(800);
  if (!JSON.parse(col0).level) await C(id => window.__copper.run({ type: 'level', target: `d:${id}`, level: 'off' }), lamp);
  await wait(600);

  check('no errors on the page', !errors.length, errors);
  await ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
