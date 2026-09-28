// Glass (web/ui/glass.css, glass.js): every surface that used to be a background blur is the one glass material, the
// fallbacks asked for by the phone's settings are solid, and words and icons on the glass keep WCAG AA contrast over
// the worst thing that can be behind them. Contrast is read from the screen itself: each word or icon is hidden, the
// pixels behind where it was are captured, and the brightest of them is held against the word's own colour.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// In the page: a room holding every light, with a photograph, and enough rooms for Rooms to scroll.
function stage(name) {
  const c = window.__copper;
  c.H.ensureRooms();
  const rooms = () => c.S.config.settings.rooms;
  const r = rooms().find(x => x.name === name) || c.EDIT.createRoom(name);
  for (const d of c.data.controllable()) c.EDIT.moveDevice(d.device_id, r.id);
  for (let i = 1; rooms().length < 8; i++) c.EDIT.createRoom(`Spare room ${i}`);
  rooms().find(x => x.id === r.id).photo = 'glass';
  c.render();
  return r.id;
}
// In the page: what each former blur surface is drawn with now.
function surfaces() {
  const cs = (el, p) => (el ? getComputedStyle(el, p) : null);
  const one = (name, el, pseudo) => {
    const s = cs(el, pseudo); if (!s) return { name, missing: true };
    const a = el && !pseudo ? getComputedStyle(el, '::after') : null;
    return {
      name, cls: el.className && String(el.className), glass: !!pseudo || el.classList.contains('glass') || el.classList.contains('glass-veil'),
      bf: s.backdropFilter, bg: s.backgroundColor, shadow: s.boxShadow,
      lens: a && a.content !== 'none' ? a.backdropFilter : null, lensBg: a && a.content !== 'none' ? a.backgroundColor : null, lensShadow: a && a.content !== 'none' ? a.boxShadow : null,
    };
  };
  const bar = document.querySelector('#screen .bar');
  return [
    one('tab bar', document.getElementById('tabs')),
    one('header scrim', bar, '::before'),
    one('sheet', document.querySelector('#sheet-root .sheet')),
    one('sheet scrim', document.querySelector('#sheet-root .scrim')),
    one('room switch', document.querySelector('.room-onoff')),
    one('house card', document.querySelector('.card.house')),
  ];
}
const alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(',').map(Number); return p.length > 3 ? p[3] : 1; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  const go = async (h, ms = 900) => { await C(x => { location.hash = x; }, h); await wait(ms); };
  const scrollTo = y => C(async y => { window.scrollTo(0, y); for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r)); }, y);

  await page.goto(`http://127.0.0.1:${PORT}/ui/#home`);
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(1200);
  // The room's photograph, the worst there is: white. Made in the page, served in place of the hub's.
  const white = Buffer.from((await C(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 48); return c.toDataURL('image/png'); })).split(',')[1], 'base64');
  await page.route('**/api/roomphoto/**', r => (r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'image/png', body: white }) : r.continue()));
  await C(() => window.__copper.closeSheet());
  let aid = await C(stage, 'Study');
  await go(`room/${aid}`);
  // the room lit, so its switch's pill is under On and Off is a word on the glass
  if (await C(() => document.querySelector('[data-act="room-on"]').getAttribute('aria-pressed')) !== 'true') { await page.click('[data-act="room-on"]'); await wait(1500); }

  // ---- 1 · every former blur surface is the glass ----
  // (the room's page, then a sheet over it, then Home for its card)
  const pick = (list, names) => list.filter(s => names.includes(s.name));
  await scrollTo(0);
  let S = pick(await C(surfaces), ['tab bar', 'header scrim', 'room switch']);
  await go(`room/${aid}/setup`, 1200);
  const under = await C(surfaces);
  S = S.concat(pick(under, ['sheet', 'sheet scrim']));
  check('under a sheet the lens rests (the scrim covers it), and its layer keeps its tint', pick(under, ['tab bar', 'room switch']).every(s => s.lens === 'none' && alpha(s.lensBg) > 0.5), pick(under, ['tab bar', 'room switch']).map(s => [s.lens, s.lensBg]));
  await C(() => window.__copper.closeSheet()); await wait(600);
  await go('home');
  S = S.concat(pick(await C(surfaces), ['house card']));
  const lensed = await C(() => document.documentElement.classList.contains('glass-lens') && ['bar', 'control'].every(k => document.getElementById(`glass-lens-${k}`)));
  check('Chromium draws the lens: html.glass-lens and the two lens filters are in the page', lensed, lensed);
  for (const s of S) {
    check(`${s.name}: is glass`, !s.missing && s.glass, s.cls);
    // a sheet's frost is its scrim's (the scrim blurs and saturates the page under it; the sheet is tinted glass over that)
    if (s.name === 'sheet') check('sheet: tinted glass with a lit rim over the frost of its scrim', !s.missing && alpha(s.bg) >= 0.85 && alpha(s.bg) < 1 && /inset/.test(s.shadow || ''), { bg: s.bg, bf: s.bf });
    else check(`${s.name}: its backdrop is blurred and saturated`, !s.missing && /blur\(/.test(s.bf) && /saturate\(/.test(s.bf), s.bf);
    if (['tab bar', 'room switch'].includes(s.name)) {
      check(`${s.name}: bends what is behind its edges (a lens layer with the SVG filter), tinted and rimmed there`, /url\("?#glass-lens-/.test(s.lens || '') && alpha(s.lensBg) > 0.5 && /inset/.test(s.lensShadow || ''), { lens: s.lens, bg: s.lensBg });
      check(`${s.name}: its drop shadow is on the surface, not the lens layer (Chromium skips an SVG backdrop with a shadow)`, !/url/.test(s.bf) && !/inset/.test(s.shadow || '') , s.shadow);
    }
  }
  const tab = S.find(s => s.name === 'tab bar');
  check('the tab bar keeps a drop shadow for depth', /rgba\(0, 0, 0/.test(tab.shadow || ''), tab.shadow);

  // ---- 2 · reduced transparency and more contrast are solid ----
  const cdp = await ctx.newCDPSession(page);
  for (const [feature, value, label] of [['prefers-reduced-transparency', 'reduce', 'reduced transparency'], ['prefers-contrast', 'more', 'more contrast']]) {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: feature, value }] });
    await wait(200);
    const on = await C(f => matchMedia(`(${f})`).matches, `${feature}: ${value}`);
    check(`${label}: the page sees the setting`, on, on);
    await go(`room/${aid}`); await scrollTo(200);
    await go(`room/${aid}/setup`, 1200);
    let R = await C(surfaces);
    await C(() => window.__copper.closeSheet()); await wait(600);
    await scrollTo(0); await go('home');
    R = R.filter(s => s.name !== 'house card').concat((await C(surfaces)).filter(s => s.name === 'house card'));
    for (const s of R) {
      if (s.name === 'sheet scrim') { check(`${label}: the sheet's scrim has no blur and dims more`, s.bf === 'none' && alpha(s.bg) >= 0.7, { bf: s.bf, bg: s.bg }); continue; }
      check(`${label}: ${s.name} is solid, with no backdrop and no lens`, s.bf === 'none' && alpha(s.bg) === 1 && !s.lens, { bf: s.bf, bg: s.bg, lens: s.lens });
      if (value === 'more' && s.name !== 'header scrim') check(`${label}: ${s.name} has a strong edge`, /0px 0px 0px 2px inset/.test(s.shadow || ''), s.shadow);
    }
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await wait(200);
  }

  // ---- 3 · contrast over the brightest backgrounds, read from the pixels ----
  // The brightest pixel behind a word or an icon (the thing itself hidden), and the ratio of the thing's own colour to it.
  async function contrast(sel, label, { min, over }) {
    const box = await C(s => {
      const e = document.querySelector(s); if (!e) return null;
      const g = document.createRange(); g.selectNodeContents(e);
      const b = e.querySelector('svg') ? e.querySelector('svg').getBoundingClientRect() : (g.getBoundingClientRect().width ? g.getBoundingClientRect() : e.getBoundingClientRect());
      const col = getComputedStyle(e.querySelector('svg') || e).color;
      e.dataset.glassHide = e.style.visibility || '';
      e.style.visibility = 'hidden';
      return { x: b.left, y: b.top, w: b.width, h: b.height, col };
    }, sel);
    if (!box) { check(`${label}: found`, false, sel); return; }
    await C(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
    await C(s => { const e = document.querySelector(s); e.style.visibility = e.dataset.glassHide; delete e.dataset.glassHide; }, sel);
    const res = await C(async ({ b64, col }) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
      let max = 0, px = null;
      for (let i = 0; i < d.length; i += 4) { const l = L(d[i], d[i + 1], d[i + 2]); if (l > max) { max = l; px = [d[i], d[i + 1], d[i + 2]]; } }
      const f = col.match(/\d+(\.\d+)?/g).map(Number); const lf = L(f[0], f[1], f[2]);
      const ratio = lf > max ? (lf + 0.05) / (max + 0.05) : (max + 0.05) / (lf + 0.05);
      return { ratio: Math.round(ratio * 100) / 100, bg: px, fg: col };
    }, { b64: png.toString('base64'), col: box.col });
    check(`${label} over ${over}: ${res.ratio} to 1, at least ${min}`, res.ratio >= min, res);
    return res;
  }
  // A white page behind: inside the page for the header (under its stuck row), and over the fade above the tab bar
  // for the tab bar, so nothing of the app's own dimming helps it.
  const cover = (where, css) => C(({ where, css }) => {
    document.querySelectorAll('.glass-cover').forEach(n => n.remove());
    const d = document.createElement('div'); d.className = 'glass-cover'; d.style.cssText = `position:fixed;inset:0;pointer-events:none;${css}`;
    if (where === 'page') { const r = document.querySelector('#screen > *'); d.style.zIndex = '2'; r.insertBefore(d, r.firstChild); }
    else { d.style.zIndex = '5'; document.getElementById('app').appendChild(d); }
  }, { where, css });
  const BRIGHT = {
    white: 'background:#fff',
    'a lit copper room': 'background:radial-gradient(60% 40% at 30% 20%, #fffdf6, rgba(255,253,246,0) 70%), linear-gradient(180deg, #fff3e2, #f0b27a)',
  };
  // By day and by night: at night the ink is warmed and dimmed (#F1E7DC, #C2B8AD), which is the harder case.
  for (const night of [0, 1]) {
    const when = night ? 'at night' : 'by day';
    await page.goto(`http://127.0.0.1:${PORT}/ui/?night=${night}#home`);
    await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
    await wait(1200);
    await C(() => window.__copper.closeSheet());
    aid = await C(stage, 'Study');
    check(`${when}: the night look is ${night ? 'on' : 'off'}`, (await C(() => document.documentElement.classList.contains('night'))) === !!night);
    await go(`room/${aid}`); await scrollTo(0);
    await contrast('.room-onoff [data-act="room-off"] span', `${when}, the room switch's Off`, { min: 4.5, over: 'a white photograph' });
    await scrollTo(300);
    for (const [name, css] of Object.entries(BRIGHT)) {
      await cover('page', css); await wait(150);
      await contrast('#screen .bar-t', `${when}, the header title (large, 3 to 1 needed; held to 4.5)`, { min: 4.5, over: name });
      await cover('app', css); await wait(150);
      for (const i of [2, 4]) await contrast(`#tabs button:nth-child(${i + 1})`, `${when}, the tab bar's icon ${i + 1}`, { min: 3, over: name });
    }
    await C(() => document.querySelectorAll('.glass-cover').forEach(n => n.remove()));
    // a sheet over a busy, bright page: its first words
    await scrollTo(0);
    await go(`room/${aid}/setup`, 1200);
    await contrast('#sheet-root .sheet .row .row-val', `${when}, a sheet's value`, { min: 4.5, over: 'the photographed room' });
    await contrast('#sheet-root .sheet .t-over', `${when}, a sheet's overline`, { min: 4.5, over: 'the photographed room' });
    await C(() => window.__copper.closeSheet()); await wait(500);
    // the connection sheet sets its values in the quietest grey there is (#9E9E9E): opened over a white page
    await go('home'); await scrollTo(0);
    await cover('page', BRIGHT.white); await wait(150);
    await C(() => document.querySelector('#screen .greet').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await wait(1200);
    const grey = await C(() => {
      const all = [...document.querySelectorAll('#sheet-root .sheet *')].filter(e => e.childElementCount === 0 && e.textContent.trim() && getComputedStyle(e).color === 'rgb(158, 158, 158)' && e.getBoundingClientRect().height);
      if (!all.length) return null;
      all[0].setAttribute('data-glass-grey', ''); return all[0].textContent.trim();
    });
    check(`${when}: a sheet with grey words to measure`, !!grey, grey);
    if (grey) await contrast('[data-glass-grey]', `${when}, a sheet's grey words ("${grey}")`, { min: 4.5, over: 'a white page' });
    await C(() => window.__copper.closeSheet()); await wait(500);
    await C(() => document.querySelectorAll('.glass-cover').forEach(n => n.remove()));
    // the whole-house card over the house's light, lit
    await go('home'); await scrollTo(0);
    await contrast('.card.house .t-over', `${when}, the house card's overline`, { min: 4.5, over: "the house's light" });
    await contrast('.card.house [data-hlv]', `${when}, the house card's level (large)`, { min: 3, over: "the house's light" });
  }

  check('no errors on the page', !errors.length, errors);
  await browser.close();
  if (bad) { console.log(`FAILED ${bad}`); process.exit(1); }
  console.log('all passed');
})().catch(e => { console.log('FAILED', e.message); process.exit(1); });
