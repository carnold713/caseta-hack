// Home, Rooms, a room, and a light, fan or shade with their sheets, laid out with the names people really give things:
// every page and sheet at 360 and 412 wide, checked for words that do not fit their box, words over other words,
// anything off the side of the screen, and a page whose end stays under the tab bar. Then every transition there (a
// room opening from its card, M10; a light from its tile, M11; the back swipe, M13; the crossfades of a state
// change), held and stepped frame by frame: a piece of words must look as it does at rest, line for line, at every
// frame, never re-wrapping or gaining or losing an ellipsis on the way. And the room's On and Off: the pill under
// whichever half is true, On saying how much is on in the count line's numbers.
//
// It renames and moves rooms, makes two and gives two a photograph, pins lights and rooms to Home, through the app's
// own config, and puts all of it back on the way out. Device names, a shade and a running timer are only this page's (nothing saves them).
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (ok || got === undefined ? '' : ` | ${JSON.stringify(got).slice(0, 1500)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- in the page ----------
// Every visible piece of words (the page, the one leaving, the copies in flight), with how many lines it is laid out
// on and whether it ends in an ellipsis.
function textStates() {
  const out = [];
  const holders = [...document.body.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim()) && !el.closest('svg, #toast-root, script, style'));
  for (const el of holders) {
    let op = 1, vis = true;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') { vis = false; break; }
      op *= Number(cs.opacity);
    }
    if (!vis || op < 0.02) continue;
    let block = el;
    while (block && getComputedStyle(block).display === 'inline') block = block.parentElement;
    const bcs = getComputedStyle(block);
    const clips = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(e.getBoundingClientRect());
    }
    const tops = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.data.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
        for (const c of clips) { top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); left = Math.max(left, c.left); right = Math.min(right, c.right); }
        if (bottom - top < r.height * 0.5 || right - left < 0.5) continue;
        if (!tops.some(t => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
      }
    }
    if (!tops.length) continue;
    const clamp = bcs.webkitLineClamp && bcs.webkitLineClamp !== 'none';
    const ell = !!((bcs.textOverflow === 'ellipsis' && bcs.overflowX !== 'visible' && block.scrollWidth > block.clientWidth + 1) || (clamp && block.scrollHeight > block.clientHeight + 1));
    const where = el.closest('.page-ghost') ? 'leaving' : el.closest('#screen') ? 'page' : el.closest('#sheet-root') ? 'sheet' : 'copy';
    out.push({ key: el.textContent.trim().replace(/\s+/g, ' '), lines: tops.length, ell, where, cls: typeof el.className === 'string' ? el.className : '' });
  }
  return out;
}
// Hold every animation running now and step them together through the moments given, reading the words at each.
function sampleFlight(ts) {
  const A = document.getAnimations();
  for (const a of A) { try { a.pause(); } catch (_) { /* gone */ } }
  const frames = [];
  for (const t of ts) {
    for (const a of A) { try { a.currentTime = t; } catch (_) { /* gone */ } }
    frames.push({ t, words: window.__lr.textStates() });
  }
  for (const a of A) { try { a.play(); } catch (_) { /* gone */ } }
  return frames;
}
// What is wrong with the layout on screen now (the open sheet, or the page).
function layoutProblems() {
  const out = [];
  const W = document.documentElement.clientWidth;
  const sheet = document.querySelector('#sheet-root:not([hidden]) .sheet');
  const scope = sheet || document.getElementById('screen');
  const name = el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
  const shown = el => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const clipsOf = el => {
    const r = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none') r.push(e.getBoundingClientRect());
    }
    return r;
  };
  const cut = (r, cs) => {
    let { left, top, right, bottom } = r;
    for (const c of cs) { left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom); }
    return { left, top, right, bottom };
  };
  const ellipsized = cs => (cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible') || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
  const holders = [...scope.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim()) && !el.closest('svg, [aria-hidden="true"], .xf-old'));
  const boxes = [];
  for (const el of holders) {
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    let block = el;
    while (block && getComputedStyle(block).display === 'inline') block = block.parentElement;
    const bcs = getComputedStyle(block);
    // words that do not fit their box, unless the box ends them in an ellipsis on purpose
    if (!ellipsized(bcs) && !ellipsized(cs) && bcs.overflowX !== 'auto' && bcs.overflowX !== 'scroll') {
      if (block.clientWidth > 0 && block.scrollWidth > block.clientWidth + 1) out.push(`words overflow their box (${block.scrollWidth} > ${block.clientWidth}): ${name(block)}`);
      if (block.clientHeight > 0 && bcs.overflowY !== 'visible' && block.scrollHeight > block.clientHeight + 1) out.push(`words overflow their box downward: ${name(block)}`);
    }
    // the lines of its words, as its line boxes give them and cut to whatever clips them
    const cl = clipsOf(el);
    const lh = parseFloat(cs.lineHeight);
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.data.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const trim = lh && r.height > lh ? (r.height - lh) / 2 : 0;
        const c = cut({ left: r.left, right: r.right, top: r.top + trim, bottom: r.bottom - trim }, cl);
        if (c.right - c.left > 1 && c.bottom - c.top > 1) boxes.push({ el, ...c });
      }
    }
  }
  const seen = new Set();
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (x > 2 && y > 2) { const k = `words over words: ${name(a.el)} | ${name(b.el)}`; if (!seen.has(k)) { seen.add(k); out.push(k); } }
  }
  if (document.documentElement.scrollWidth > W + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
  for (const el of scope.querySelectorAll('button, a, input, [data-go], [data-act], .tile, .row, .chip, .pill')) {
    if (!shown(el) || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    const c = cut(r, clipsOf(el.parentElement || el));
    if (c.right - c.left < 1 || c.bottom - c.top < 1) continue;
    if (c.left < -1 || c.right > W + 1) out.push(`off the side of the screen (${Math.round(c.left)}..${Math.round(c.right)}): ${name(el)}`);
  }
  return out;
}
// Scrolled to its end, is the last of the page clear of the tab bar?
function underTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs || tabs.hidden || getComputedStyle(tabs).display === 'none') return null;
  window.scrollTo(0, document.documentElement.scrollHeight);
  const t = tabs.getBoundingClientRect().top;
  let last = null;
  for (const el of document.querySelectorAll('#screen button, #screen [data-go], #screen .tile, #screen .row, #screen .chip, #screen p, #screen h1')) {
    const r = el.getBoundingClientRect(); if (!r.height || getComputedStyle(el).visibility === 'hidden') continue;
    if (!last || r.bottom > last.b) last = { b: r.bottom, el };
  }
  window.scrollTo(0, 0);
  return last && last.b > t + 1 ? `at the end of the page its last content (${last.el.className}) is under the tab bar (${Math.round(last.b)} > ${Math.round(t)})` : null;
}
// Anything a transition left behind.
function leftovers() {
  const junk = [...document.querySelectorAll('.page-ghost, .op-top, .m10-spill, .m11-surface, .m11-shadow, .pb-behind, .pb-chev, .pb-leaving, .pb-dark, .xf-old')].map(e => e.className);
  const page = document.querySelector('#screen > *');
  const odd = page && Number(getComputedStyle(page).opacity) < 0.99 ? ['the page is faded'] : [];
  const style = document.getElementById('screen').getAttribute('style') || '';
  return junk.length || odd.length || /transform|opacity/.test(style) ? { junk, odd, style } : null;
}

// Words at a moment that are not as they rest: each piece must be on as many lines, with or without an ellipsis, as
// the same words are at rest at one end or the other; words never at rest (part of a line flying on its own) must be
// one line with no ellipsis.
function badFrames(before, after, frames) {
  const rest = new Map();
  for (const s of [...before, ...after]) { if (!rest.has(s.key)) rest.set(s.key, new Set()); rest.get(s.key).add(`${s.lines}${s.ell ? '…' : ''}`); }
  const out = new Set();
  for (const f of frames) for (const s of f.words) {
    const st = `${s.lines}${s.ell ? '…' : ''}`;
    if (!(rest.has(s.key) ? rest.get(s.key).has(st) : st === '1')) out.add(`t=${f.t}: "${s.key.slice(0, 40)}" (${s.where} ${s.cls}) is ${st}, at rest ${rest.has(s.key) ? [...rest.get(s.key)].join(' or ') : '1'}`);
  }
  return [...out];
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const root = `http://127.0.0.1:${PORT}/ui/`;
  const open = async (width, height) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
    await ctx.addInitScript(src => { window.__lr = new Function(`${src}; return { textStates, sampleFlight };`)(); }, `${textStates}\n${sampleFlight}`);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${width}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|woff2|404|Failed to load resource/.test(m.text())) errors.push(`${width} console: ${m.text()}`); });
    return { ctx, page };
  };
  let { ctx, page } = await open(412, 915);
  const C = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready && window.__caseta && window.__caseta.back, null, { timeout: 15000 });
  if (!process.env.APP_TOKEN) { await page.goto(root); await page.fill('#pw', 'secret'); await page.click('button[type=submit]'); }
  await page.goto(root + '#home'); await ready(); await wait(1000);

  // ---- the house as people have it: long names, a busy room, a room of one, an empty room, photographs
  const plan = await C(async () => {
    const c = window.__copper;
    const before = JSON.stringify(c.S.config);
    c.H.ensureRooms();
    const ds = c.data.controllable();
    const colour = ds.find(d => d.color && d.domain === 'light');
    const white = ds.find(d => d.ct && !d.color && d.domain === 'light');
    const dimmers = ds.filter(d => d.domain === 'light' && !d.color && !d.ct);
    const sw = ds.find(d => d.domain === 'switch');
    const fan = ds.find(d => d.domain === 'fan');
    const long = dimmers[0], single = dimmers[1] || white;
    const busy = c.EDIT.createRoom("Collin's Office and Reading Nook");
    const one = c.EDIT.createRoom('Nook');
    const empty = c.EDIT.createRoom('Upstairs Guest Bedroom Suite');
    for (const d of ds) if (d !== single && d.domain !== 'cover') c.EDIT.moveDevice(d.device_id, busy.id);
    if (single) c.EDIT.moveDevice(single.device_id, one.id);
    const photo = async (aid, g) => {
      const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 750;
      const x = cv.getContext('2d');
      const grd = x.createLinearGradient(0, 0, 1000, 750); grd.addColorStop(0, g[0]); grd.addColorStop(0.5, g[1]); grd.addColorStop(1, g[2]);
      x.fillStyle = grd; x.fillRect(0, 0, 1000, 750);
      x.fillStyle = '#f7f1e6'; x.fillRect(560, 120, 300, 420);   // a bright window, the worst case for words over it
      const out = await c.data.api(`/api/roomphoto/${encodeURIComponent(aid)}`, { method: 'PUT', body: JSON.stringify({ data: cv.toDataURL('image/jpeg', 0.8) }) });
      c.data.appRoom(aid).photo = String(out.stamp);
    };
    await photo(busy.id, ['#d9c8b0', '#f2e6d6', '#b8a58c']);
    // Home's Pinned grid: lights and rooms with long names, lit and off, a photograph and a drawing, a fan and a shade
    // (lr_colour and lr_shade are this page's own, put on it by dress below)
    c.S.config.favorites = [long && `d:${long.device_id}`, `a:${busy.id}`, `d:${colour ? colour.device_id : 'lr_colour'}`, `a:${one.id}`, fan && `d:${fan.device_id}`, 'd:lr_shade', `a:${empty.id}`, sw && `d:${sw.device_id}`].filter(Boolean);
    await c.save('', { quiet: true });
    // the levels: dimmed, a colour, a white, a switch on, a fan going, one off
    if (long) await c.run({ type: 'level', target: `d:${long.device_id}`, level: 60 });
    if (colour) { await c.run({ type: 'level', target: `d:${colour.device_id}`, level: 80 }); await c.run({ type: 'color', target: `d:${colour.device_id}`, hex: '#4C8DFF' }); }
    if (white) await c.run({ type: 'level', target: `d:${white.device_id}`, level: 100 });
    if (sw) await c.run({ type: 'level', target: `d:${sw.device_id}`, level: 'on' });
    if (fan) await c.run({ type: 'fan', target: `d:${fan.device_id}`, speed: 'Medium' });
    if (single) await c.run({ type: 'level', target: `d:${single.device_id}`, level: 'off' });
    const id = d => (d ? d.device_id : null);
    // with no colour lamp paired (the suite's own rooms test starts the bridges over), this page gets one of its own
    return { before, busy: busy.id, one: one.id, empty: empty.id, long: id(long), colour: id(colour) || 'lr_colour', ownColour: !colour, white: id(white), sw: id(sw), fan: id(fan), single: id(single), timer: id(dimmers[2] || white || long) };
  });
  check('the rig has dimmers, a switch and a fan to lay out', !!(plan.long && plan.single && plan.sw && plan.fan), { ...plan, before: undefined });
  // what only a page sees, put on it after every load: long device names, a shade, a running timer
  const dress = () => C(p => {
    const c = window.__copper, S = c.S;
    const names = { [p.long]: 'Pendant over the kitchen island', [p.colour]: 'Reading lamp by the big armchair', [p.fan]: 'Ceiling fan over the reading chair', [p.sw]: 'Plug for the little Christmas tree' };
    for (const [id, n] of Object.entries(names)) if (S.inv.devices[id]) S.inv.devices[id].name = n;
    S.inv.devices.lr_shade = { device_id: 'lr_shade', name: 'Big window shade by the reading chair', type: 'SerenaRollerShade', domain: 'cover', area: null, zone: 'lr' };
    S.states.lr_shade = { ...(S.states.lr_shade || {}), level: 40 };
    if (p.ownColour) {
      S.inv.devices.lr_colour = { device_id: 'lr_colour', name: 'Reading lamp by the big armchair', type: 'HueLight', domain: 'light', area: null, zone: 'lrc', color: true, ct: true, ct_range: [2000, 6500] };
      S.states.lr_colour = { ...(S.states.lr_colour || {}), level: 80, color: { mode: 'xy', hex: '#4C8DFF' } };
      if (c.data.devArea(S.inv.devices.lr_colour) !== p.busy) c.EDIT.moveDevice('lr_colour', p.busy);
    }
    if (c.data.devArea(S.inv.devices.lr_shade) !== p.busy) c.EDIT.moveDevice('lr_shade', p.busy);
    if (p.timer) S.timers = { ...(S.timers || {}), [`d:${p.timer}`]: { ends_at: Math.round(Date.now() / 1000) + 25 * 60 } };
    c.render();
  }, plan);
  const to = async hash => { await C(h => { location.hash = h; }, hash); await wait(700); };

  // ---- the room's On and Off
  await to(`room/${plan.busy}`); await dress(); await wait(400);
  const toggle = () => C(() => {
    const o = document.querySelector('#screen .room-onoff'); if (!o) return null;
    const on = o.querySelector('[data-act="room-on"]'), off = o.querySelector('[data-act="room-off"]'), pill = o.querySelector('.onoff-pill');
    const pr = pill.getBoundingClientRect(), a = on.getBoundingClientRect(), b = off.getBoundingClientRect();
    return { word: on.textContent.trim(), offWord: off.textContent.trim(), onPressed: on.getAttribute('aria-pressed'), under: Math.abs(pr.left - a.left) < 2 ? 'on' : Math.abs(pr.left - b.left) < 2 ? 'off' : 'between',
      count: document.querySelector('#screen .room-title .count').textContent.trim(), old: !!document.querySelector('.room-acts, .room-photo-card .glass'), moving: pill.getAnimations().length };
  });
  let t0 = await toggle();
  check('the room page has On and Off in place of All on and All off', !!t0 && !t0.old && t0.offWord === 'Off', t0);
  await C(() => document.querySelector('#screen [data-act="room-on"]').click()); await wait(1600);
  let t1 = await toggle();
  const cm = /^(\d+) devices? · (\d+) on$/.exec(t1.count);
  check('with anything on, the pill is under On, and On says how much in the count line\'s numbers', t1.under === 'on' && t1.onPressed === 'true' && !!cm && t1.word === `On · ${cm[2]} of ${cm[1]}`, t1);
  await C(() => document.querySelector('#screen [data-act="room-off"]').click());
  const moving = await C(() => new Promise(r => requestAnimationFrame(() => r(document.querySelector('#screen .room-onoff .onoff-pill').getAnimations().length))));
  await wait(1600);
  const t2 = await toggle();
  check('Off turns it all off: the pill slides under Off and On says just On', moving > 0 && t2.under === 'off' && t2.onPressed === 'false' && t2.word === 'On' && /^\d+ devices?$/.test(t2.count), { moving, t2 });
  await C(() => document.querySelector('#screen [data-act="room-on"]').click()); await wait(1600);
  // back to the levels the rest of this test lays out
  await C(async p => { const c = window.__copper; if (p.long) await c.run({ type: 'level', target: `d:${p.long}`, level: 60 }); if (!p.ownColour) await c.run({ type: 'color', target: `d:${p.colour}`, hex: '#4C8DFF' }); }, plan); await wait(800);
  await dress();

  // ---- every page and sheet, at both widths
  const routes = [
    'home', 'rooms', `room/${plan.busy}`, `room/${plan.one}`, `room/${plan.empty}`, `room/${plan.busy}/setup`, `room/${plan.busy}/timer`, `room/${plan.empty}/setup`,
    `light/${plan.long}`, `light/${plan.colour}`, `light/${plan.sw}`, `light/${plan.fan}`, 'light/lr_shade', `light/${plan.single}`, `light/${plan.timer}`,
    `light/${plan.colour}/white`, `light/${plan.colour}/colour`, `light/${plan.colour}/timer`, `light/${plan.colour}/about`, `light/${plan.colour}/follow`, `light/${plan.colour}/follow/also`,
    `light/${plan.fan}/timer`, `light/${plan.fan}/about`, 'light/lr_shade/about', `light/${plan.timer}/timer`,
  ].filter(r => !/null/.test(r));
  // and what opens over room setup and a light's About
  const pickers = [[`room/${plan.busy}/setup`, 'setup-name'], [`room/${plan.busy}/setup`, 'setup-lights'], [`room/${plan.busy}/setup`, 'setup-bring'], [`room/${plan.busy}/setup`, 'setup-delete'], [`light/${plan.colour}/about`, 'about-move']];
  for (const [w, h] of [[360, 780], [412, 915]]) {
    if (w !== 412) { await ctx.close(); ({ ctx, page } = await open(w, h)); await page.goto(root + '#home'); await ready(); await wait(900); }
    await dress();
    const found = [];
    for (const r of routes) {
      await to(r); await dress(); await wait(300);
      const p = await C(layoutProblems);
      const u = await C(underTabs); if (u) p.push(u);
      for (const x of p) found.push(`${r}: ${x}`);
    }
    // Home's Pinned grid in edit mode, each item with its x
    await to('home'); await dress(); await C(() => { const c = window.__copper; c.closeSheet(); c.ui.pinEdit = true; c.render(); }); await wait(400);
    for (const x of await C(layoutProblems)) found.push(`home editing the pins: ${x}`);
    await C(() => { const c = window.__copper; c.ui.pinEdit = false; c.render(); });
    for (const [r, act] of pickers) {
      await to(r); await dress(); await wait(300);
      await C(a => { const b = document.querySelector(`#sheet-root [data-act="${a}"]`); if (b) b.click(); }, act); await wait(700);
      for (const x of await C(layoutProblems)) found.push(`${r} ${act}: ${x}`);
      await C(() => window.__copper.closePicker()); await wait(300);
    }
    check(`${w} wide: every page and sheet fits, with no words over words and nothing under the tab bar`, !found.length, found);
  }

  // ---- the transitions, frame by frame, at both widths
  const TS = [0, 30, 60, 100, 150, 200, 260, 330, 400, 480, 560];
  const flight = async (label, act, ts = TS) => {
    const before = await C(() => window.__lr.textStates());
    await act();
    const frames = await C(async t => {
      await new Promise(r => { const t0 = performance.now(); const f = () => (document.querySelector('.page-ghost, .op-top, .m11-surface, .pb-leaving, .xf-old') || performance.now() - t0 > 800) ? r() : requestAnimationFrame(f); f(); });
      await new Promise(r => requestAnimationFrame(r));
      return window.__lr.sampleFlight(t);
    }, ts);
    await wait(1500);
    const after = await C(() => window.__lr.textStates());
    const b = badFrames(before, after, frames);
    const left = await C(leftovers);
    return b.concat(left ? [`${label} left behind ${JSON.stringify(left)}`] : []).map(x => `${label}: ${x}`);
  };
  const into = sel => C(s => { const el = document.querySelector(s); window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 280); }, sel);
  for (const [w, h] of [[412, 915], [360, 780]]) {
    await ctx.close(); ({ ctx, page } = await open(w, h)); await page.goto(root + '#rooms'); await ready(); await wait(900);
    await dress(); await wait(300);
    const found = [];
    // M10: a room opens from its card and closes back into it
    for (const aid of [plan.busy, plan.one]) {
      const card = `#screen .room-big[data-go="room/${aid}"]`;
      await into(card); await wait(300);
      found.push(...await flight(`M10 open ${aid}`, () => page.click(card)));
      found.push(...await flight(`M10 back ${aid}`, () => page.click('#screen .hdr-btn.back')));
    }
    // M11: each kind of tile opens into its page and closes back
    await to(`room/${plan.busy}`); await wait(600);
    for (const id of [plan.long, plan.colour, plan.sw, plan.fan, 'lr_shade', plan.timer]) {
      const tile = `#screen .room-grid .tile[data-go="light/${id}"]`;
      if (!(await page.$(tile))) { found.push(`no tile for ${id}`); continue; }
      await into(tile); await wait(300);
      found.push(...await flight(`M11 open ${id}`, () => page.click(`${tile} .nm`)));
      found.push(...await flight(`M11 back ${id}`, () => page.click('#screen .hdr-btn.back')));
    }
    // and from Home's Pinned grid: a room from its pinned card (a photograph, a drawing), a light from its pinned tile
    // (on a fresh home, Home greets it once with a sheet: that is not what is being looked at here)
    await to('home'); await C(() => window.__copper.closeSheet()); await dress(); await wait(600);
    for (const aid of [plan.busy, plan.one]) {
      const card = `#screen .pin-grid .pin-room[data-go="room/${aid}"]`;
      if (!(await page.$(card))) { found.push(`no pinned card for ${aid}`); continue; }
      await into(card); await wait(300);
      found.push(...await flight(`M10 from Home open ${aid}`, () => page.click(`${card} .nm`)));
      found.push(...await flight(`M10 from Home back ${aid}`, () => page.click('#screen .hdr-btn.back')));
    }
    for (const id of [plan.long, plan.colour]) {
      const tile = `#screen .pin-grid .tile[data-go="light/${id}"]`;
      if (!(await page.$(tile))) { found.push(`no pinned tile for ${id}`); continue; }
      await into(tile); await wait(300);
      found.push(...await flight(`M11 from Home open ${id}`, () => page.click(`${tile} .nm`)));
      found.push(...await flight(`M11 from Home back ${id}`, () => page.click('#screen .hdr-btn.back')));
    }
    await to(`room/${plan.busy}`); await wait(600);
    // M13: the back swipe held part way (a pose per step), then let go
    const tile = `#screen .room-grid .tile[data-go="light/${plan.long}"]`;
    await into(tile); await wait(300);
    await page.click(`${tile} .nm`); await wait(1600);
    const B = (m, ...a) => C(([m, a]) => window.__caseta.back[m](...a), [m, a]);
    const before = await C(() => window.__lr.textStates());
    await B('start', 'left', 4, 400);
    const drag = [];
    for (const p of [0.1, 0.25, 0.4]) { await B('progress', p, 4 + p * 300, 400); drag.push({ t: `drag ${p}`, words: await C(() => window.__lr.textStates()) }); }
    const commit = await flight('M13 commit', () => B('commit'));
    found.push(...badFrames(before, await C(() => window.__lr.textStates()), drag).map(x => `M13 drag: ${x}`), ...commit);
    // crossfades: a state changing in place, its old words fading over the new
    const tap = sel => () => C(s => document.querySelector(s).click(), sel);
    const fades = [0, 40, 80, 120, 180, 260, 340];
    await to('rooms'); await wait(600);
    for (const aid of [plan.one, plan.busy, plan.one]) {
      const pwr = `#screen .room-big[data-go="room/${aid}"] .pwr`;
      await into(pwr); await wait(200);
      found.push(...await flight(`Rooms power ${aid}`, tap(pwr), fades));
    }
    await to(`room/${plan.one}`); await wait(600);
    found.push(...await flight('room On', tap('#screen [data-act="room-on"]'), fades));
    found.push(...await flight('room Off', tap('#screen [data-act="room-off"]'), fades));
    await to(`light/${plan.long}`); await wait(600);
    found.push(...await flight('light Off', tap('#screen [data-act="dev-off"]'), fades));
    found.push(...await flight('light On', tap('#screen [data-act="dev-on"]'), fades));
    check(`${w} wide: through every transition each piece of words keeps its lines and its ellipsis as at rest, and nothing is left behind`, !found.length, found);
  }

  // ---- put it all back
  await C(async p => {
    const c = window.__copper;
    for (const a of [p.busy, p.one]) await c.data.api(`/api/roomphoto/${encodeURIComponent(a)}`, { method: 'DELETE' }).catch(() => {});
    c.data.restoreConfig(p.before);
    await c.data.saveConfig();
  }, plan);
  await wait(500);
  check('the rooms are put back as they were', await C(b => JSON.stringify(window.__copper.S.config.settings.rooms) === JSON.stringify(JSON.parse(b).settings.rooms), plan.before));
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(bad ? `\n${bad} FAILED` : '\nall passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
