// Light in depth (web/ui/depth.js, web/ui/depthworker.js): where the phone can, the page's one light and a room's
// illustration have their light drawn with three.js, as real light falls; everywhere else the page draws them as it
// always has. What must hold:
//
//   it draws, and where the page's own light was: the one light at the top of Home lies on the stylesheet's (the same
//     centre, the same reach, the same strength at its core), and a room's light is laid over the part of the scene the
//     page shows, each lamp's glow on the lamp as drawn, mirrored scenes included
//   it is not there when it should not be: a software GPU (this rig's) keeps the page's own light unless told
//     otherwise, and so do WebGL turned off and reduced motion, before and after the page has drawn in depth
//   it lets go: one context at most across twenty trips between pages, and none a few seconds after the last page
//     with a light on it is left
//   losing the GPU gives the page its own light back, and the light in depth returns with it
//   no transition dips to black because of it (Rooms opening a room and closing it, a tab, a redraw), at normal speed
//     and with the CPU four times slower, and it adds no long task at normal speed
//
// Needs the rig's lights: run it after hue_test, hue_color_test and nanoleaf_test.
const { chromium } = require('playwright-core');
const zlib = require('zlib');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- a PNG read back, for measuring frames (8 bit RGB or RGBA, as Chromium writes them) ----------
function png(buf) {
  let p = 8, w = 0, h = 0, type = 6; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; }
    if (kind === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0, b = y ? out[row - stride + x] : 0, c = x >= bpp && y ? out[row - stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[row + x] = v & 255;
    }
  }
  const lum = (x, y) => { const i = y * stride + x * bpp; return 0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2]; };
  // (the strongest of the three: a coloured light's strength, whatever its colour)
  const top = (x, y) => { const i = y * stride + x * bpp; return Math.max(out[i], out[i + 1], out[i + 2]); };
  const mean = (x0, y0, x1, y1, f = lum) => { let s = 0, n = 0; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { s += f(x, y); n++; } return s / Math.max(1, n); };
  return { w, h, lum, top, mean };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  async function open({ depth = null, reduced = false, b = browser } = {}) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await ctx.addInitScript(([t, d]) => {
      try { if (t) localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); if (d) localStorage.setItem('depth', d); else localStorage.removeItem('depth'); } catch (_) {}
    }, [process.env.APP_TOKEN || '', depth]);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/#home`);
    if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.solid'); }
    await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
    await page.evaluate(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
    await wait(900);
    return { ctx, page, C: (fn, arg) => page.evaluate(fn, arg), goto: async (hsh, ms = 900) => { await page.evaluate(x => { location.hash = x; }, hsh); await wait(ms); } };
  }
  const state = C => C(() => ({ mode: window.__depth.mode, ...window.__depth.stats, sites: window.__depth.sites() }));
  const shown = (C, kind) => C(k => window.__depth.sites().some(s => s.kind === k && s.shown && s.onPage), kind);
  const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await wait(150); } };

  // the rig's rooms: one with lit lights in it, for the room page
  const A = await open({ depth: 'on' });
  const room = await A.C(() => {
    const c = window.__copper;
    const a = c.data.areas().filter(x => !c.H.roomPhotoURL(x.id)).map(x => ({ id: x.id, lit: c.H.roomLights(x.id).filter(d => (c.data.level(d.device_id) || 0) > 0).length })).sort((p, q) => q.lit - p.lit)[0];
    return a && a.lit ? a.id : null;
  });
  check('a drawn room with a light on in it (the rig pairs them)', !!room, room);
  // every light the test switches is put back at the end
  const levels0 = await A.C(() => { const c = window.__copper; return Object.fromEntries(c.data.controllable().filter(d => d.domain === 'light').map(d => [d.device_id, c.data.level(d.device_id) || 0])); });

  // ---------- it draws, where the page's own light was ----------
  check('told to, it draws: one worker, the house light shown in depth', await until(() => shown(A.C, 'top')), await state(A.C));
  const home = await A.C(() => {
    const el = document.querySelector('#screen .home > .onelight');
    const i = el && el.querySelector('.ol-c i'), cv = el && el.querySelector(':scope > canvas.d3');
    return { d3: el && el.dataset.d3, iOpacity: i && Number(getComputedStyle(i).opacity), canvas: !!cv, w: cv && cv.width, h: cv && cv.height };
  });
  check('the house light: a canvas in its own element, and the drawn gradient put away under it', home.canvas && home.d3 === 'on' && home.iOpacity === 0 && home.w > 0, home);

  // the one light, drawn both ways at full strength: the same place, the same reach, the same core. The page is read
  // through a still of the light alone (everything over it hidden), row by row down its middle. (A style of its own
  // on the light tells the light in depth to read it again, as any change to it does.)
  const full = async ({ page, C }) => {
    await C(() => { const s = document.createElement('style'); s.id = 't-only'; s.textContent = '#screen .home > :not(.onelight), #tabs { visibility: hidden !important; } #screen .home > .onelight { opacity: 1 !important; transition: none !important; } #screen .home > .onelight i, #screen .home > .onelight canvas { animation: none !important; translate: none !important; }'; document.head.appendChild(s); const el = document.querySelector('#screen .home > .onelight'); if (el) el.style.setProperty('--probe', '1'); });
    await wait(700);
    const shot = png(await page.screenshot({ clip: { x: 0, y: 0, width: 412, height: 360 } }));
    await C(() => document.getElementById('t-only').remove());
    // read by the strongest channel: the house's light may be a colour lamp's, which physics and the stylesheet's
    // blending weigh differently across the three, but not in the one that carries it
    const bg = shot.mean(0, 340, 412, 360, shot.top);
    const col = []; for (let y = 0; y < 340; y += 4) col.push(shot.mean(196, y, 216, y + 4, shot.top) - bg);
    const row = []; for (let x = 0; x < 412; x += 4) row.push(shot.mean(x, 20, x + 4, 40, shot.top) - bg);
    const reach = a => { let k = a.length - 1; while (k > 0 && a[k] < 1.5) k--; return k * 4; };
    const cx = row.reduce((s, v, k) => s + v * (k * 4 + 2), 0) / row.reduce((s, v) => s + v, 0);
    return { core: Math.round(col[1] * 10) / 10, reach: reach(col), cx: Math.round(cx), half: col.findIndex(v => v < col[1] / 2) * 4 };
  };
  // every light at full, and the colour lamps at a white, so both drawings are of the same white light
  const colours0 = await A.C(() => { const c = window.__copper; return Object.fromEntries(c.data.controllable().filter(d => d.color).map(d => [d.device_id, (c.S.states[d.device_id] || {}).color || null])); });
  await A.C(() => { const c = window.__copper; for (const d of c.data.controllable().filter(x => x.domain === 'light')) { c.run({ type: 'level', target: `d:${d.device_id}`, level: 100 }); if (d.color) c.run({ type: 'color', target: `d:${d.device_id}`, kelvin: 2700 }); } });
  await wait(1500);
  const glLight = await full(A);
  const B = await open({ depth: 'off' });
  const cssLight = await full(B);
  check('the one light in depth sits where the drawn one does: the same centre', Math.abs(glLight.cx - cssLight.cx) <= 3, { gl: glLight, css: cssLight });
  check('the same core, within a step or two of 8-bit colour', Math.abs(glLight.core - cssLight.core) <= 2.5, { gl: glLight.core, css: cssLight.core });
  check('and the same reach down the page (half strength and where it ends, within 16 px)', Math.abs(glLight.half - cssLight.half) <= 16 && Math.abs(glLight.reach - cssLight.reach) <= 16, { gl: glLight, css: cssLight });

  // the room: its light laid over the part of the scene the page shows, each lamp's glow on the lamp as drawn
  await A.goto(`room/${room}`, 1200);
  check('a room page: its illustration lit in depth', await until(() => shown(A.C, 'room')), await state(A.C));
  const lay = await A.C(() => {
    const sc = document.querySelector('#screen .room-photo-card > .room-scene');
    const fo = sc.querySelector('.rs-spill > foreignObject.d3'), cv = fo && fo.querySelector('canvas');
    const b = sc.getBoundingClientRect(), f = fo.getBoundingClientRect();
    // where each lamp's light is brightest on the canvas, against where the lamp is drawn
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    const g = t.getContext('2d'); g.drawImage(cv, 0, 0);
    const px = g.getImageData(0, 0, t.width, t.height).data;
    const lamps = [...sc.querySelectorAll('.rs-lamp')].filter(m => Number(getComputedStyle(m).opacity) > 0.3).map(m => {
      const [x, , , , y] = m.dataset.e.split(';')[0].split(' ').map(Number);
      const pt = new DOMPoint(x, y).matrixTransform(m.getScreenCTM());
      // within 24 px of it on the canvas, the column its light is brightest in (a lamp aimed down is brightest below
      // itself, so across is what says the light is where the lamp is: a scene drawn mirrored, or offset, is not)
      const cx = (pt.x - f.left) / f.width * t.width, cy = (pt.y - f.top) / f.height * t.height, R = 24 * t.width / f.width;
      let best = -1, bx = 0;
      for (let xx = Math.max(0, Math.round(cx - R)); xx < Math.min(t.width, cx + R); xx++) {
        let v = 0;
        for (let yy = Math.max(0, Math.round(cy - R)); yy < Math.min(t.height, cy + R); yy++) { const i = (yy * t.width + xx) * 4; v += px[i] + px[i + 1] + px[i + 2]; }
        if (v > best) { best = v; bx = xx; }
      }
      return { off: Math.round(Math.abs(bx - cx) * f.width / t.width), best: Math.round(best / (2 * R)) };
    });
    return { box: [b.left, b.top, b.width, b.height].map(Math.round), fo: [f.left, f.top, f.width, f.height].map(Math.round), lamps, flip: !!sc.querySelector('svg > g[transform]') };
  });
  check('the room\'s light covers the scene the page shows, edge to edge', lay.fo.every((v, i) => Math.abs(v - lay.box[i]) <= 1), lay);
  check('each lit lamp\'s light is brightest across the scene where the lamp is drawn (within 12 px)', lay.lamps.length > 0 && lay.lamps.every(l => l.off <= 12 && l.best > 30), lay.lamps);
  // the markers carry exactly the lamps the drawing lights, and no pools are left drawn under the light in depth
  const pools = await A.C(() => { const sc = document.querySelector('#screen .room-photo-card > .room-scene'); const p = sc.querySelector('.rs-pools'); return { pools: p && Number(getComputedStyle(p).opacity), marks: sc.querySelectorAll('.rs-lamp').length }; });
  check('the drawn pools it stands in for are put away', pools.pools === 0 && pools.marks > 0, pools);

  // ---------- the page's own light, where it should be ----------
  const D = await open({});
  await until(async () => (await D.C(() => window.__depth.mode)) === 'failed', 20000);
  const soft = await state(D.C);
  const softPage = await D.C(() => ({ canvases: document.querySelectorAll('#screen .d3').length, marked: document.querySelectorAll('#screen [data-d3]').length, i: Number(getComputedStyle(document.querySelector('#screen .onelight .ol-c i')).opacity) }));
  check('on a software GPU (this rig) the page keeps its own light, and the worker is let go', soft.mode === 'failed' && soft.why === 'software' && soft.live === 0 && softPage.canvases === 0 && softPage.marked === 0 && softPage.i === 1, { soft, softPage });
  await D.ctx.close();

  // (no GPU at all: Chromium's own WebGL switches reach only the page's thread, and the light is drawn in a worker)
  const noGL = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'] });
  const E = await open({ depth: 'on', b: noGL });
  await until(async () => (await E.C(() => window.__depth.mode)) === 'failed', 20000);
  await E.goto(`room/${room}`, 1000);
  const off = await E.C(() => ({ mode: window.__depth.mode, live: window.__depth.stats.live, canvases: document.querySelectorAll('#screen .d3').length, pools: Number(getComputedStyle(document.querySelector('#screen .room-photo-card .rs-pools')).opacity), i: Number(getComputedStyle(document.querySelector('#screen .onelight .ol-c i')).opacity) }));
  check('no WebGL: the page\'s own light and the room\'s drawn pools, nothing laid over them', off.mode === 'failed' && off.live === 0 && off.canvases === 0 && off.pools === 1 && off.i === 1, off);
  await E.ctx.close(); await noGL.close();

  const F = await open({ depth: 'on', reduced: true });
  await F.goto(`room/${room}`, 1200);
  const calm = await state(F.C);
  const calmPage = await F.C(() => document.querySelectorAll('#screen .d3').length);
  check('reduced motion: no worker is started, and nothing is laid over the page', calm.mode === 'off' && calm.workers === 0 && calmPage === 0, { calm, calmPage });
  await F.ctx.close();

  // reduced motion asked for while the page draws in depth: the page's own light at once, and the context let go
  await A.page.emulateMedia({ reducedMotion: 'reduce' });
  await wait(400);
  const went = await A.C(() => ({ mode: window.__depth.mode, live: window.__depth.stats.live, d3: document.querySelectorAll('#screen [data-d3]').length, pools: Number(getComputedStyle(document.querySelector('#screen .room-photo-card .rs-pools')).opacity) }));
  check('reduced motion turned on later: back to the page\'s own light, the context let go', went.mode === 'off' && went.live === 0 && went.d3 === 0 && went.pools === 1, went);
  await A.page.emulateMedia({ reducedMotion: 'no-preference' });
  check('and turned off again, the light in depth comes back', await until(() => shown(A.C, 'room')), await state(A.C));

  // ---------- losing the GPU ----------
  await A.C(() => window.__depth.lose());
  const lostOk = await until(async () => (await A.C(() => window.__depth.mode)) === 'lost', 5000);
  await wait(400);
  const lost = await A.C(() => ({ sites: window.__depth.sites(), d3: document.querySelectorAll('#screen [data-d3]').length, i: Number(getComputedStyle(document.querySelector('#screen .onelight .ol-c i')).opacity), pools: Number(getComputedStyle(document.querySelector('#screen .room-photo-card .rs-pools')).opacity) }));
  check('the context lost: every light goes back to the page\'s own drawing', lostOk && lost.d3 === 0 && lost.i === 1 && lost.pools === 1 && lost.sites.every(s => !s.shown), lost);
  await A.C(() => window.__depth.restore());
  const back = await until(async () => { const s = await state(A.C); return s.mode === 'on' && s.restored >= 1 && s.sites.filter(x => x.onPage).every(x => x.shown); }, 8000);
  check('and given back: the light in depth returns on every light on the page', back, await state(A.C));

  // ---------- letting go ----------
  const trail = [];
  const lamp = await A.C(() => { const c = window.__copper; const d = c.H.litLights()[0]; return d && d.device_id; });
  const trip = ['home', `room/${room}`, lamp ? `light/${lamp}` : 'rooms', 'remotes'];
  for (let n = 0; n < 20; n++) { await A.goto(trip[n % trip.length], 450); trail.push(await A.C(() => window.__depth.stats.live)); }
  const after20 = await state(A.C);
  const loose = await A.C(() => { const on = new Set([...document.querySelectorAll('#screen .onelight, #screen .room-photo-card > .room-scene')]); return [...document.querySelectorAll('.d3')].filter(n => !n.closest('.page-ghost') && ![...on].some(s => s.contains(n))).length; });
  check('twenty trips between pages: never more than one context', Math.max(...trail) <= 1 && after20.workers <= 3, { trail, workers: after20.workers });
  check('and no canvas left behind outside a light', loose === 0, loose);
  await A.goto('remotes', 3800);
  const idle = await state(A.C);
  check('a page with no light: the context is let go a few seconds later', idle.live === 0 && idle.mode === 'off', idle);
  await A.goto('home', 300);
  check('and a page with one starts it again', await until(() => shown(A.C, 'top')) && (await A.C(() => window.__depth.stats.live)) === 1, await state(A.C));

  // ---------- no dip to black ----------
  // Two ways. Each frame on the page itself: every light that is lit shows, in full, as the page's own drawing or as
  // the canvas or as the two crossing (their strengths add to about one), whether it is on the page or in a page
  // leaving; a frame with neither is the light gone for a frame. And frames of the whole screen while the page
  // changes, read for the top of the screen and the room's picture: a frame at under half of both frames either side
  // of it is a dip to black. Played the same way with the page's own light, which is the bar.
  async function film({ page, ctx, C }, rate, run) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const frames = [];
    cdp.on('Page.screencastFrame', async f => { frames.push(Buffer.from(f.data, 'base64')); await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await C(() => {
      window.__lt = []; window.__po = new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }); window.__po.observe({ type: 'longtask' });
      // every frame: each lit light, how much of it shows as drawn by the page and as the canvas
      window.__gap = []; window.__on = true; window.__nf = 0;
      const op = el => { let o = 1; for (let a = el; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' && a === el) return 0; } return Number(getComputedStyle(el).opacity); };
      const look = () => {
        if (!window.__on) return;
        window.__nf++;
        for (const el of document.querySelectorAll('.onelight, .room-photo-card > .room-scene')) {
          const room = el.classList.contains('room-scene');
          if (!room && Number(getComputedStyle(el).opacity) < 0.05) continue;
          if (room && ![...el.querySelectorAll('.rs-lamp')].some(m => Number(getComputedStyle(m).opacity) > 0.05)) continue;
          const drawn = room ? el.querySelector('.rs-pools') : el.querySelector('.ol-c i');
          const cv = el.querySelector('canvas');
          const a = drawn ? op(drawn) : 0, b = cv && cv.width > 1 ? Number(getComputedStyle(cv).opacity) : 0;
          if (a + b < 0.85) window.__gap.push({ room, a: Math.round(a * 100) / 100, b: Math.round(b * 100) / 100, f: window.__nf });
        }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await wait(200);
    await run();
    await cdp.send('Page.stopScreencast');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const got = await C(() => { window.__on = false; window.__po.disconnect(); return { long: window.__lt, gaps: window.__gap, n: window.__nf }; });
    const v = frames.map(png).map(f => [f.mean(0, 0, f.w, Math.round(f.h * 0.2)), f.mean(0, Math.round(f.h * 0.2), f.w, Math.round(f.h * 0.55))]);
    let black = 0, worst = 1;
    for (let k = 1; k < v.length - 1; k++) for (const j of [0, 1]) {
      const r = v[k][j] / Math.max(1, Math.min(v[k - 1][j], v[k + 1][j]));
      worst = Math.min(worst, r);
      if (r < 0.5) black++;
    }
    return { frames: frames.length, black, worst: Math.round(worst * 100) / 100, long: got.long, gaps: got.gaps, sampled: got.n };
  }
  const moves = async P => {
    await P.goto('rooms', 1000);
    await P.page.click(`#screen [data-go="room/${room}"]`); await wait(1100);
    // a redraw of the room: one of its lights switched
    await P.C(r => { const c = window.__copper; const d = c.H.roomLights(r).find(x => (c.data.level(x.device_id) || 0) > 0); if (d) c.run({ type: 'level', target: `d:${d.device_id}`, level: 60 }); }, room); await wait(900);
    await P.C(() => history.back()); await wait(1100);
    await P.page.click('#tabs [data-go="home"]'); await wait(1000);
  };
  for (const rate of [1, 4]) {
    const gl = await film(A, rate, () => moves(A));
    const css = await film(B, rate, () => moves(B));
    check(`every lit light shows on every frame, in depth, through the moves (${rate}x CPU: a room opening from Rooms and closing, a redraw, a tab)`, gl.sampled > 60 && gl.gaps.length === 0, { sampled: gl.sampled, gaps: gl.gaps.slice(0, 6) });
    check(`and no frame of the screen dips to black (${rate}x CPU)`, gl.frames > 20 && gl.black <= css.black, { gl: { frames: gl.frames, black: gl.black, worst: gl.worst }, css: { frames: css.frames, black: css.black, worst: css.worst } });
    // The page's thread does two things for it: reading the lights after each frame, and laying each picture in.
    // Neither may come near a long task. (The rig draws WebGL in software, whose CPU the page's own frames share:
    // the long tasks seen either way are listed, as the rig's, not the light's.)
    if (rate === 1) {
      const own = await A.C(() => ({ tick: Math.round(window.__depth.stats.tickMax * 10) / 10, lay: Math.round(window.__depth.stats.layMax * 10) / 10 }));
      check('no new long task at normal speed: what the page\'s thread does for it stays far under 50 ms', own.tick < 16 && own.lay < 16, { own, longGL: gl.long, longCSS: css.long });
    }
  }

  // put the lights back, colours first
  await A.C(cs => { const c = window.__copper; for (const [id, k] of Object.entries(cs)) { if (!k) continue; if (k.mode === 'xy' && k.hex) c.run({ type: 'color', target: `d:${id}`, hex: k.hex }); else if (k.kelvin) c.run({ type: 'color', target: `d:${id}`, kelvin: k.kelvin }); } }, colours0);
  await wait(600);
  await A.C(l => { const c = window.__copper; for (const [id, v] of Object.entries(l)) c.run({ type: 'level', target: `d:${id}`, level: v || 'off' }); }, levels0);
  await wait(1200);
  check('no errors on the page', !errors.length, errors);
  await A.ctx.close(); await B.ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
