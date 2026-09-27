// Titles through the page transitions: no title, and no copy of words a transition flies, is ever shown cut short by
// its ellipsis or broken onto other lines than it rests on at either end.
//
// Read frame by frame (requestAnimationFrame, in the page), with long names, through a room opening from its card and
// closing back into it (M10) by the back circle, the browser's Back and Android's back swipe (M13), a light from its
// tile (M11), a remote from its card (M14), a scene's editor out of its chip (M12), a plain push and back, a back
// swipe that slides a page off, and the tabs; scrolled to the top and with the header collapsed. Every title-like
// element on screen (page titles, sheet titles, names on cards and tiles, row titles) and every copy a transition lays
// over the page (the flight's words, a crossfade's old words, the chip's face) is compared, each frame, with the same
// words at rest before and after: whether an ellipsis cuts them, how wide the box that cuts them is, and how many
// lines they take.
//
// Three passes: 412 x 915 as it is, through all of it; then, through the flights and a push, 412 x 915 with the CPU at
// a quarter speed and the phone's font size at 115%, and a Fold unfolded, 884 x 1104, at 115%. Android's font size reaches the page as a text zoom (the app's WebView takes
// it from the phone, as Chrome's text scaling does), and getComputedStyle reads each font-size back that much larger
// than the stylesheet set it. A copy given the size it read was enlarged a second time: a room's name closing back
// into its card ended in an ellipsis for the last of the flight ("Living r…") and stood whole only as it landed. The
// browser here has no text zoom of its own, so the pass gives it one where it matters: getComputedStyle reads every
// font-size back 1.15 times what is drawn, as the phone's does, and what is drawn stays as it is.
//
// Everything it names is renamed in the page's memory only; nothing is saved.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (what, ok, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got).slice(0, 900)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- in the page: every title and every copy of words, each frame ----------
function sampler() {
  const SEL = 'h1, h2, .t-h1, .bar-t, .page-h1, .t-hero, .t-sheet, .top-h1, .g-q, .t-over, .nm, .rc-nm, .row-txt .t, .xf-old, .m12-word, .m12-face, .op-top > *';
  const where = el => (el.closest('.page-ghost') ? 'the page leaving' : el.closest('.pb-leaving') ? 'the page swiped off' : el.closest('.pb-behind') ? 'the page behind a swipe'
    : el.closest('.op-top') ? 'a flight copy' : el.closest('.xf-old') ? 'a crossfade copy' : el.closest('.sheet-ghost') ? 'a sheet dropping' : el.closest('#sheet-root') ? 'the sheet' : 'the page');
  const seen = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (e === el && cs.visibility === 'hidden') return 0; o *= Number(cs.opacity); if (o < 0.03) return 0; } return o; };
  function state(el, all) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    if (!all && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) return null;
    if (!seen(el)) return null;
    const txt = el.textContent.replace(/\s+/g, ' ').trim(); if (!txt) return null;
    const cs = getComputedStyle(el);
    const rg = document.createRange(); rg.selectNodeContents(el);
    const tops = [];
    for (const q of rg.getClientRects()) if (q.width > 0.5 && q.height > 0.5 && !tops.some(t => Math.abs(t - q.top) < q.height * 0.5)) tops.push(q.top);
    const inline = cs.display === 'inline';
    return { txt, tag: el.tagName, where: where(el), lines: tops.length, cut: !inline && cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1, cw: inline ? 0 : el.clientWidth };
  }
  const snap = all => {
    const out = [];
    for (const el of document.querySelectorAll(SEL)) {
      if (el.closest('#tabs')) continue;
      // words inside a title are its own (a span in a heading); a flight's copies are each their own
      if (el.parentElement && el.parentElement.closest(SEL) && !el.parentElement.matches('.op-top') && !el.matches('.nm, .rc-nm, .t, .xf-old')) continue;
      const s = state(el, all); if (s) out.push(s);
    }
    return out;
  };
  window.__tt = {
    rest: () => snap(true),
    rec: ms => new Promise(res => {
      const frames = [], t0 = performance.now();
      const tick = () => { const t = performance.now() - t0; frames.push({ t: Math.round(t), e: snap(false) }); if (t < ms) requestAnimationFrame(tick); else res(frames); };
      requestAnimationFrame(tick);
    }),
  };
}
// Android's font size, as the phone's WebView applies it: every font-size is read back Z times what is drawn.
function textSize(Z) {
  const real = window.getComputedStyle;
  const up = v => (/px$/.test(v) ? `${parseFloat(v) * Z}px` : v);
  window.getComputedStyle = function (el, ps) {
    const cs = real.call(window, el, ps);
    return new Proxy(cs, {
      get(t, k) {
        if (k === 'fontSize') return up(t.fontSize);
        if (k === 'getPropertyValue') return p => (p === 'font-size' ? up(t.getPropertyValue(p)) : t.getPropertyValue(p));
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  };
}

// Every frame's words against the same words at rest: cut where they were whole (or cut at another width), or on
// other lines. Words with nothing like them at rest (a copy of a number) are held to not being cut at all.
function judge(rest, frames) {
  const at = new Map();
  for (const s of rest) { const k = `${s.tag}|${s.txt}`; if (!at.has(k)) at.set(k, []); at.get(k).push(s); }
  const same = (s, r) => s.cut === r.cut && (!s.cut || Math.abs(s.cw - r.cw) <= 1.5) && s.lines === r.lines;
  const bad = new Map();
  for (const f of frames) for (const s of f.e) {
    const l = at.get(`${s.tag}|${s.txt}`) || at.get([...at.keys()].find(k => k.endsWith(`|${s.txt}`)));
    const ok = l ? l.some(r => same(s, r)) : !s.cut;
    if (ok) continue;
    const k = `${s.where}: "${s.txt.slice(0, 40)}"`;
    if (!bad.has(k)) bad.set(k, { at: f.t, frames: 0, now: { cut: s.cut, lines: s.lines, box: s.cw }, rest: l ? l.map(r => ({ cut: r.cut, lines: r.lines, box: r.cw })) : 'none' });
    bad.get(k).frames++;
  }
  return [...bad].map(([k, v]) => `${k} for ${v.frames} frames from ${v.at} ms, ${JSON.stringify(v.now)} where at rest ${JSON.stringify(v.rest)}`);
}

async function pass({ browser, W, H, rate, zoom, label, all = true }) {
  console.log(`\n---- ${label}`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
  await ctx.addInitScript(sampler);
  if (zoom) await ctx.addInitScript(textSize, zoom);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const C = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`http://127.0.0.1:${PORT}/ui/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready && window.__caseta && window.__caseta.back, null, { timeout: 15000 });
  await wait(1200);
  // the pretend house presses a real remote once, a few seconds after it starts, which would jump Remotes to it
  await wait(2500);
  // Long names, in the page's memory: a room whose name only just fits beside its count, one long enough to step down
  // a size, the light in the first, a remote and a routine. The page is made tall enough to collapse its header.
  const ids = await C(() => {
    const c = window.__copper;
    c.closeSheet();
    c.S.config.settings.greeted = true;
    c.H.ensureRooms();
    const rooms = c.S.config.settings.rooms;
    const lit = rooms.filter(a => c.H.roomLights(a.id).length);
    const a = lit[0], b = rooms.find(x => x !== a);
    a.name = 'Living room'; if (b) b.name = 'Kids bathroom upstairs';
    const light = c.H.roomLights(a.id)[0];
    const d = light && c.data.dev(light.device_id); if (d) d.name = 'Living room lamp';
    const rem = c.data.remotes()[0]; if (rem) rem.name = 'Bedside remote';
    let rt = c.S.config.schedules.find(s => s.id === 'titles-test');
    if (!rt) { rt = c.RT.newRoutine(); rt.id = 'titles-test'; }
    rt.name = 'Primary bedroom closet evening lights';
    const st = document.createElement('style'); st.textContent = '#screen { min-height: calc(100vh + 600px); }'; document.head.appendChild(st);
    c.render();
    return { room: a.id, room2: b && b.id, light: light && light.device_id, remote: rem && rem.device_id };
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const slow = Math.max(1, rate / 2);
  const click = sel => C(s => { const e = document.querySelector(s); if (!e) throw new Error(`nothing at ${s}`); e.click(); }, sel);
  const has = sel => C(s => !!document.querySelector(s), sel);
  const settle = () => wait(1300 * slow);
  const tab = async t => { await C(x => window.__copper.goTab(x), t); await settle(); };
  const scroll = async y => { await C(v => window.scrollTo(0, v), y); await wait(250); };
  const reveal = async sel => { await C(s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); if (b.top < 130 || b.bottom > innerHeight - 110) window.scrollBy(0, b.top - innerHeight / 2); }, sel); await wait(300); };
  const swipe = () => C(async () => { const b = window.__caseta.back; b.start('left', 4, 460); for (const q of [0.05, 0.1, 0.2, 0.3, 0.4, 0.5]) { b.progress(q, 20 + q * 200, 460); await new Promise(r => requestAnimationFrame(r)); } b.commit(); });
  const backBy = how => (how === 'the back circle' ? click('#screen .hdr-btn.back') : how === "the browser's Back" ? C(() => history.back()) : swipe());
  // one transition: the words at rest before it and after it, and every frame of it
  const run = async (what, act, ms = 1400) => {
    const before = await C(() => window.__tt.rest());
    const rec = C(m => window.__tt.rec(m), ms * slow);
    await wait(20);
    await act();
    const frames = await rec;
    await settle();
    const after = await C(() => window.__tt.rest());
    const bad = judge([...before, ...after], frames);
    check(`${label}: ${what}: every title keeps its words, lines and ellipsis on every frame (${frames.length} frames)`, !bad.length, bad.slice(0, 6));
  };

  // ---- M10: a room from its card on Rooms, and back into it three ways, at the top and collapsed
  const card = `#screen .room-big[data-go="room/${ids.room}"]`;
  // (every way back on the first pass; the slower ones take the two that differ most, a back swipe and a collapsed header)
  const ways = all ? [['the back circle', 0], ["the browser's Back", 120], ['a back swipe', 0], ['the back circle', 120]] : [["the browser's Back", 120], ['a back swipe', 0]];
  for (const [how, y] of ways) {
    await tab('rooms'); await scroll(0); await reveal(card);
    await run(`Rooms to "Living room" from its card`, () => click(card));
    await scroll(y);
    await run(`"Living room" back into its card by ${how}${y ? ', its header collapsed' : ''}`, () => backBy(how));
  }
  if (ids.room2 && all) {
    const card2 = `#screen .room-big[data-go="room/${ids.room2}"]`;
    await tab('rooms'); await reveal(card2);
    await run('Rooms to "Kids bathroom upstairs", a title a size down', () => click(card2));
    await run('"Kids bathroom upstairs" back into its card', () => backBy("the browser's Back"));
  }

  // ---- M11: a light from its tile, and back into it
  if (ids.light) {
    const tile = `#screen .room-grid > .tile[data-go="light/${ids.light}"]`;
    for (const how of all ? ['the back circle', 'a back swipe'] : ['a back swipe']) {
      await tab('rooms'); await reveal(card); await click(card); await settle();
      await reveal(tile);
      await run('"Living room" to "Living room lamp" from its tile', () => click(tile));
      await run(`"Living room lamp" back into its tile by ${how}`, () => backBy(how));
    }
  }

  // ---- M14: a remote from its card, and back into it
  if (ids.remote) {
    const rc = `#screen .rgrid > .rcard[data-go="remote/${ids.remote}"]`;
    await tab('remotes'); await reveal(rc);
    await run('Remotes to "Bedside remote" from its card', () => click(rc));
    await run('"Bedside remote" back into its card', () => backBy("the browser's Back"));
  }

  // ---- M12: a scene's editor out of its chip, and back into it
  await tab('rooms'); await reveal(card); await click(card); await settle();
  const chip = '#screen .room-chips .chip[data-id]';
  if (await has(chip)) {
    await reveal(chip);
    const b = await C(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, chip);
    await run("a scene's editor out of its chip", async () => { await page.mouse.move(b.x, b.y); await page.mouse.down(); await wait(650 * slow); await page.mouse.up(); }, 1900);
    if (await has('#sheet-root .sheet-close')) await run("the scene's editor back into its chip", () => click('#sheet-root .sheet-close'));
  }

  // ---- a plain push and back, a page swiped off, and the tabs
  await tab('settings'); await reveal('#screen [data-go="activity"]');
  await run('Settings to Activity', () => click('#screen [data-go="activity"]'));
  await scroll(120);
  await run('Activity back to Settings, its header collapsed', () => backBy('the back circle'));
  if (all) {
    await tab('routines'); await reveal('#screen [data-go="routine/titles-test"]');
    await run('Routines to a routine with a long name', () => click('#screen [data-go="routine/titles-test"]'));
    await run('the routine swiped off back to Routines', () => backBy('a back swipe'));
    await tab('home');
    await run('Home to Rooms by its tab', () => click('#tabs [data-go="rooms"]'));
    await run('Rooms to Settings by its tab', () => click('#tabs [data-go="settings"]'));
    await run('Settings back to Home', () => C(() => history.back()));
  }

  check(`${label}: no page errors`, !errors.length, errors.slice(0, 3));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  try {
    await pass({ browser, W: 412, H: 915, rate: 1, zoom: 0, label: '412 x 915' });
    await pass({ browser, W: 412, H: 915, rate: 4, zoom: 1.15, label: '412 x 915, CPU at 4x, font size 115%', all: false });
    await pass({ browser, W: 884, H: 1104, rate: 1, zoom: 1.15, label: '884 x 1104, font size 115%', all: false });
  } catch (e) { check(`ran to the end: ${e.message.split('\n')[0]}`, false); }
  await browser.close();
  console.log(`\n${fails.length ? `FAIL ${fails.length}` : 'all passed'}`);
  process.exit(fails.length ? 1 : 0);
})();
