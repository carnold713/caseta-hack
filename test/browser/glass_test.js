// Glass (web/ui/glass.css, glass.js): every glass surface is a pane whose optics are worked out (a displacement map
// from its own shape by Snell's law, with dispersion, and a specular rim from the same normals), the fallbacks asked
// for by the phone's settings are solid, and words and icons on the glass keep WCAG AA contrast over the worst thing
// that can be behind them. Both the optics and the contrast are read from the screen itself: the optics by laying a
// fine grid under each pane (its tint and light set aside) and comparing it with the grid as it is, the contrast by
// hiding each word or icon and holding the brightest pixel behind it against the word's own colour.
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
// In the page: what each glass surface is drawn with now, and the filter its backdrop runs through.
function surfaces() {
  const one = (name, el, pseudo) => {
    if (!el) return { name, missing: true };
    const s = getComputedStyle(el, pseudo);
    const id = (s.backdropFilter.match(/url\("?#([\w-]+)/) || [])[1];
    const f = id && document.getElementById(id);
    return {
      name, cls: el.className && String(el.className), glass: !!pseudo || el.classList.contains('glass') || el.classList.contains('glass-veil'),
      bf: s.backdropFilter, bg: s.backgroundColor, shadow: s.boxShadow, specImg: (s.backgroundImage.match(/data:image\/png/g) || []).length,
      filter: f ? { w: Number(f.getAttribute('width')), h: Number(f.getAttribute('height')), maps: f.querySelectorAll('feImage').length,
        scales: [...f.querySelectorAll('feDisplacementMap')].map(n => Number(n.getAttribute('scale'))) } : null,
    };
  };
  return [
    one('tab bar', document.getElementById('tabs')),
    one('header scrim', document.querySelector('#screen .bar'), '::before'),
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

  // A white page behind: inside the page for the header (under its stuck row), and over the fade above the tab bar
  // for the tab bar, so nothing of the app's own dimming helps it.
  const cover = (where, css) => C(({ where, css }) => {
    document.querySelectorAll('.glass-cover').forEach(n => n.remove());
    const d = document.createElement('div'); d.className = 'glass-cover'; d.style.cssText = `position:fixed;inset:0;pointer-events:none;${css}`;
    if (where === 'page') { const r = document.querySelector('#screen > *'); if (!d.style.zIndex) d.style.zIndex = '2'; r.insertBefore(d, r.firstChild); }
    // (out of the page, which may be drawn again under it, and under anything the page positions)
    else if (where === 'under') { if (!d.style.zIndex) d.style.zIndex = '0'; const a = document.getElementById('app'); a.insertBefore(d, a.firstChild); }
    else { if (!d.style.zIndex) d.style.zIndex = '5'; document.getElementById('app').appendChild(d); }
  }, { where, css });
  // ---- 1 · every glass surface is a pane with worked-out optics ----
  // (the room's page, then a sheet over it once it has risen, then Home for its card)
  const pick = (list, names) => list.filter(s => names.includes(s.name));
  await scrollTo(0);
  let S = pick(await C(surfaces), ['tab bar', 'header scrim', 'room switch']);
  await go(`room/${aid}/setup`, 1400);
  const under = await C(surfaces);
  S = S.concat(pick(under, ['sheet', 'sheet scrim']));
  check('under an open sheet the page\'s glass bends with one displacement (no dispersion: it is covered, and it saves the frames)',
    pick(under, ['tab bar', 'room switch', 'header scrim']).every(s => s.filter && s.filter.scales.length >= 1 && new Set(s.filter.scales).size === 1), pick(under, ['tab bar', 'room switch', 'header scrim']).map(s => s.filter && s.filter.scales));
  await C(() => window.__copper.closeSheet()); await wait(600);
  await go('home');
  S = S.concat(pick(await C(surfaces), ['house card']));
  check('Chromium draws the optics: html.glass-lens, and the filters live in the page', await C(() => document.documentElement.classList.contains('glass-lens') && document.querySelectorAll('#glass-defs filter').length > 0));
  const DISPERSE = ['tab bar', 'room switch'];
  const TINT = { 'tab bar': 0.72, 'header scrim': 0.68, sheet: 0.88, 'room switch': 0.68, 'house card': 0.86 };
  for (const s of S) {
    check(`${s.name}: is glass`, !s.missing && s.glass, s.cls);
    if (s.name === 'sheet scrim') { check('sheet scrim: dims and softens the page (a veil, not a pane)', /blur\(4px\)/.test(s.bf) && /saturate/.test(s.bf), s.bf); continue; }
    const f = s.filter;
    check(`${s.name}: its backdrop runs through its own displacement filter`, !!f && f.maps >= 1, { bf: s.bf, f });
    check(`${s.name}: the filter is the surface's size (its map is placed for its shape)`, !!f && (s.name === 'header scrim' || f.w > 40) && f.h > 20, f && [f.w, f.h]);
    // the small floating surfaces split colour at the edge (blue bends further than red and green); the long bezels
    // of the header, a sheet and the card bend all three alike, which is half the cost
    if (DISPERSE.includes(s.name)) check(`${s.name}: blue bends further than red and green (dispersion: a second displacement)`, !!f && f.scales.length % 2 === 0 && f.scales.length >= 2 && f.scales[1] > f.scales[0], f && f.scales);
    else check(`${s.name}: one displacement bends all three colours alike (its long bezel skips the split)`, !!f && f.scales.length >= 1 && new Set(f.scales).size === 1, f && f.scales);
    check(`${s.name}: its tint is laid over the refracted page (${TINT[s.name]})`, alpha(s.bg) === TINT[s.name], s.bg);
    check(`${s.name}: its specular rim is drawn from the same normals (images, not a painted gradient or shadow)`, s.specImg >= 1, s.specImg);
    if (s.name !== 'header scrim') check(`${s.name}: no drop shadow or rim shadow stands in for the optics`, s.shadow === 'none', s.shadow);
  }

  // The optics, read from the pixels: a fine grid under each pane, its tint and light set aside (and its frost, so the
  // middle can be compared as it is). Where the pane is flat the grid must come through as it is; along the bezel it
  // must be bent, and bent differently in red, green and blue.
  // a grid of 3 px lines 7 px apart (21 px apart under a sheet, whose scrim softens what is under it first)
  const grid = (p = 7, t = 3) => `background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.9) 0 ${t}px,transparent ${t}px ${p}px),repeating-linear-gradient(90deg,rgba(0,0,0,.9) 0 ${t}px,transparent ${t}px ${p}px);background-color:#fff`;
  const BARE = '.glass.lensed, .bar::before { background-color: transparent !important; background-image: none !important; --glass-frost: 0px !important; --glass-sat: 1 !important; --glass-bright: 1 !important; }';
  const style = css => C(css => { let t = document.getElementById('glass-test-style'); if (!t) { t = document.createElement('style'); t.id = 'glass-test-style'; document.head.appendChild(t); } t.textContent = css; }, css);
  const grab = async clip => {
    const png = await page.screenshot({ clip });
    return C(async b64 => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return { w: c.width, h: c.height, d: [...g.getImageData(0, 0, c.width, c.height).data] }; }, png.toString('base64'));
  };
  // mean difference from the bare grid, and mean colour split (max - min of r, g, b) over a region in CSS px of the clip
  const compare = (A, B, r, k = 2) => {
    let diff = 0, split = 0, splitB = 0, n = 0;
    for (let y = Math.round(r.y * k); y < Math.round((r.y + r.h) * k); y++) for (let x = Math.round(r.x * k); x < Math.round((r.x + r.w) * k); x++) {
      const i = (y * A.w + x) * 4;
      diff += (Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2])) / 3;
      split += Math.max(A.d[i], A.d[i + 1], A.d[i + 2]) - Math.min(A.d[i], A.d[i + 1], A.d[i + 2]);
      splitB += Math.max(B.d[i], B.d[i + 1], B.d[i + 2]) - Math.min(B.d[i], B.d[i + 1], B.d[i + 2]);
      n++;
    }
    return { diff: Math.round(diff / n * 10) / 10, split: Math.round((split - splitB) / n * 10) / 10 };
  };
  async function optics(name, sel, where) {
    const box = await C(s => { if (s === 'header') { const b = document.querySelector('#screen .bar'); return { x: 0, y: 0, w: innerWidth, h: 124, bez: 20, edge: 112 }; } const e = document.querySelector(s); const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: b.left, y: b.top, w: b.width, h: b.height, bez: parseFloat(cs.getPropertyValue('--glass-bezel')) }; }, sel);
    // (the page may be drawn again under a cover put into it: the two pictures are taken again until the cover was
    // there for both)
    let A, B;
    const clip = { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.w, height: box.h };
    for (let tries = 0; tries < 4; tries++) {
      if (where.photo) await C(async () => {
        const c = document.createElement('canvas'); c.width = 420; c.height = 320; const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 420, 320); g.fillStyle = 'rgba(0,0,0,.9)';
        for (let i = 0; i < 420; i += 7) g.fillRect(i, 0, 3, 320); for (let i = 0; i < 320; i += 7) g.fillRect(0, i, 420, 3);
        const img = document.querySelector('.room-photo'); img.dataset.was = img.src; img.style.objectFit = 'none'; img.src = c.toDataURL(); await img.decode();
      });
      else await cover(where.cover, `${grid(where.period || 7, where.line || 3)};${where.css || ''}`);
      await style(BARE); await wait(200);
      A = await grab(clip);
      if (process.env.SHOTS) await page.screenshot({ clip, path: `${process.env.SHOTS}/optics-${name.replace(/ /g, '-')}-glass.png` });
      await style(`${BARE} .glass.lensed, .bar::before { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }`); await wait(200);
      B = await grab(clip);
      const kept = await C(photo => (photo ? !!document.querySelector('.room-photo[data-was]') : !!document.querySelector('.glass-cover')), !!where.photo);
      if (process.env.SHOTS) await page.screenshot({ clip, path: `${process.env.SHOTS}/optics-${name.replace(/ /g, '-')}-bare.png` });
      await style(''); await C(() => { document.querySelectorAll('.glass-cover').forEach(n => n.remove()); const img = document.querySelector('.room-photo[data-was]'); if (img) { img.src = img.dataset.was; img.style.objectFit = ''; delete img.dataset.was; } });
      if (kept) break;
    }
    const b = box.bez;
    // the flat middle, well clear of every bezel; the bezel along the top (or, for the header, its bottom edge), away
    // from the corners and the anti-aliased border
    const mid = sel === 'header' ? { x: 40, y: 20, w: box.w - 80, h: 50 } : { x: Math.min(b + 8, box.w / 2 - 6), y: Math.min(b + 4, box.h / 2 - 3), w: Math.max(4, box.w - 2 * (b + 8)), h: Math.max(4, box.h - 2 * (b + 4)) };
    const edge = sel === 'header' ? { x: 40, y: box.edge - b * 0.55, w: box.w - 80, h: b * 0.45 }
      : where.top ? { x: 40, y: 2, w: box.w - 80, h: b * 0.45 }
      : { x: 2, y: box.h * 0.3, w: b * 0.45, h: box.h * 0.4 };
    const m = compare(A, B, mid), e = compare(A, B, edge);
    check(`${name}: the flat middle is clear (the grid comes through as it is)`, m.diff < 4, m);
    check(`${name}: the bezel bends the grid`, e.diff > 12 && e.diff > 3 * m.diff, e);
    if (where.disperse) check(`${name}: and splits its colour a little at the edge (dispersion)`, e.split > 0.5 && e.split < 40, e);
    else check(`${name}: and keeps its colour there (no split on a long bezel)`, Math.abs(e.split) < 2, e);
  }
  await go(`room/${aid}`); await scrollTo(0);
  await optics('room switch', '.room-onoff', { photo: true, disperse: true });
  await scrollTo(300);
  await optics('tab bar', '#tabs', { cover: 'app', disperse: true });
  await optics('header', 'header', { cover: 'page' });
  await scrollTo(0);
  await go(`room/${aid}/setup`, 1400);
  await optics('sheet', '#sheet-root .sheet', { cover: 'under', css: 'z-index:4', top: true, period: 32, line: 14 });
  await C(() => window.__copper.closeSheet()); await wait(600);
  await go('home');
  await optics('house card', '.card.house', { cover: 'under' });

  // A surface of a new size is fitted again: its filter follows the room switch as it narrows.
  await go(`room/${aid}`); await scrollTo(0);
  const w0 = await C(() => document.querySelector('.room-onoff').offsetWidth);
  const resized = await C(async () => {
    const e = document.querySelector('.room-onoff'); e.style.right = '60px';
    for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
    const id = (getComputedStyle(e).backdropFilter.match(/#([\w-]+)/) || [])[1];
    const f = document.getElementById(id); const out = { w: e.offsetWidth, fw: f && Number(f.getAttribute('width')) };
    e.style.right = ''; return out;
  });
  check('a surface that changes size gets optics for its new size (ResizeObserver)', resized.w === w0 - 48 && resized.fw === resized.w, { w0, ...resized });

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
      check(`${label}: ${s.name} is solid, with no backdrop, no optics and no light`, s.bf === 'none' && alpha(s.bg) === 1 && !s.specImg, { bf: s.bf, bg: s.bg, spec: s.specImg });
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
