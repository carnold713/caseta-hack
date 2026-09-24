// Scenes and remotes, laid out under stress: every route, sheet and picker of All scenes, a scene's editor (its stage
// of orbs, its lights, its pickers), a room's scene chips, Remotes, a remote's page and its sheets, and Press timing,
// at 360 and 412 wide, with long scene, light, room and remote names, a scene of one light and of ten, every remote
// layout, a remote with nothing set and one with a long action. It fails on words that run out of their box with no
// ellipsis to say so, two pieces of words over each other (the orbs' numbers above all: "10%" and "100%" once ran
// together as "10100%"), sideways scroll on the page, the end of a page hidden under the tab bar, a sheet reaching
// nearer than 80 to the top, and page errors.
//
// Then the transitions (M12, a scene opening from its chip, row or tile and closing back into it; M14, a remote's
// card opening into its page and back), sampled frame by frame with every animation paused: each piece of words
// must keep its lines and its ellipsis from rest to rest, and a word that flies into another must read like it at
// both ends. Puts the config back as it found it; the long names are this phone's only and go with a reload.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- in the page ----------
// The stress data: scenes long and short, of one light and of every light, a room with many, starred ones; remotes
// with nothing set; long names for some lights and a remote (on this phone only).
async function stress() {
  const c = window.__copper, D = c.data, cfg = c.S.config;
  cfg.presets = cfg.presets.filter(p => !/^lay-/.test(p.id));
  const add = (id, name, area, levels) => { cfg.presets.push({ id, name: area ? `${D.areaName(area)} · ${name}` : name, area: area || null, levels, fade: null }); };
  const kitchen = (D.areas().find(a => a.name === 'Kitchen') || D.areas()[0]).id;
  const hall = (D.areas().find(a => a.name === 'Hall') || D.areas()[1] || D.areas()[0]).id;
  if (!c.H.roomScenes(kitchen).some(p => p.mood)) c.H.suggestScenes(kitchen);
  const all = D.controllable().filter(d => d.domain !== 'cover');
  const vals = [10, 100, 10, 100, 0, 55, 100, 1, 100, 42];
  const lv = {}; all.forEach((d, i) => { lv[d.device_id] = d.domain === 'fan' ? 'MediumHigh' : d.domain === 'switch' ? (i % 2 ? 100 : 0) : vals[i % vals.length]; });
  add('lay-all', 'Every light in the house for the late evening', kitchen, lv);
  const two = all.filter(d => d.domain === 'light').slice(0, 2).map(d => d.device_id);
  add('lay-long', 'Late evening reading with every light low and warm', kitchen, { [two[0]]: 10, [two[1]]: 100 });
  add('lay-one', 'Night light', hall, { [all.find(d => d.domain === 'light').device_id]: 5 });
  add('lay-loose', 'A scene that is not in any room with a long name', null, { [two[0]]: 100 });
  add('lay-k3', 'Breakfast', kitchen, { [two[0]]: 80 });
  // one scene for each number of lights, 1 to all of them, for the stage
  for (let n = 1; n <= all.length; n++) add(`lay-n${n}`, `Lanes ${n}`, null, Object.fromEntries(all.slice(0, n).map((d, i) => [d.device_id, d.domain === 'fan' ? 'MediumHigh' : i % 2 ? 100 : 10])));
  cfg.favorites = cfg.favorites.filter(f => !/^p:lay-/.test(f)).concat(['p:lay-long', 'p:lay-one', 'p:lay-all']);
  const pids = D.remotes().map(d => d.device_id);
  cfg.bindings = (cfg.bindings || []).filter(b => !pids.includes(b.device_id));
  await D.saveConfig();
  const lamp = all.find(d => d.domain === 'light' && D.devArea(d) === kitchen) || all[0];
  lamp.name = 'Island Pendants over the long counter';
  if (all[5]) all[5].name = 'Living room panels by the window';
  if (pids[0]) D.dev(pids[pids.length - 1]).name = 'Kitchen Pico by the back door to the garden';
  c.render();
  return { kitchen, pids, n: all.length };
}

// What is wrong with what is on screen now: words out of their box, words over words, sideways scroll. `scope` is
// where to look (a sheet when one is up, else the page, or the parts of it named).
function probe(scope) {
  const out = [];
  const root = document.querySelector('#sheet-root');
  const sheet = root && !root.hidden ? root.querySelector('.sheet') : null;
  const where = sheet ? [sheet] : scope ? [...document.querySelectorAll(scope)] : [document.querySelector('#screen')];
  const vis = el => { for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false; } return true; };
  const name = el => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')} "${(el.textContent || '').trim().slice(0, 30)}"`;
  const cutter = el => { for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) { const cs = getComputedStyle(n); if (cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible') return n; } return null; };
  const texts = [];
  for (const r of where) {
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (!t.textContent.trim()) continue;
      const el = t.parentElement; if (!el || el.closest('svg') || !vis(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      const rects = [...rg.getClientRects()].filter(q => q.width > 0.5 && q.height > 0.5);
      // what of them can be seen: inside every box that clips them, and short of an ellipsis
      let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      const cut = cutter(el);
      let scrollsX = false, scrollsY = false, clipped = null;
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const b = n.getBoundingClientRect();
        if (cs.overflowX !== 'visible') clip = { ...clip, left: Math.max(clip.left, b.left), right: Math.min(clip.right, b.right) };
        if (cs.overflowY !== 'visible') clip = { ...clip, top: Math.max(clip.top, b.top), bottom: Math.min(clip.bottom, b.bottom) };
        if (!cut && !clipped && !n.matches('.sheet')) for (const q of rects) {
          const x = !scrollsX && !/auto|scroll/.test(cs.overflowX) && (q.right > b.right + 1 || q.left < b.left - 1);
          const y = !scrollsY && !/auto|scroll/.test(cs.overflowY) && (q.bottom > b.bottom + 2 || q.top < b.top - 2);
          if (x || y) { clipped = name(n); break; }
        }
        if (/auto|scroll/.test(cs.overflowX)) scrollsX = true;
        if (/auto|scroll/.test(cs.overflowY)) scrollsY = true;
      }
      if (clipped) out.push({ kind: 'clipped', el: name(el), by: clipped });
      if (cut) { const cb = cut.getBoundingClientRect(); clip = { ...clip, left: Math.max(clip.left, cb.left), right: Math.min(clip.right, cb.right) }; }
      const shown = rects.map(q => ({ left: Math.max(q.left, clip.left), right: Math.min(q.right, clip.right), top: Math.max(q.top, clip.top), bottom: Math.min(q.bottom, clip.bottom) })).filter(q => q.right - q.left > 1 && q.bottom - q.top > 1);
      if (!shown.length) continue;
      if (!texts.some(x => x.el === el)) texts.push({ el, shown });
      else texts.find(x => x.el === el).shown.push(...shown);
      const cs = getComputedStyle(el);
      if (cs.display !== 'inline' && el.scrollWidth > el.clientWidth + 1 && !cut && !/auto|scroll/.test(cs.overflowX)) out.push({ kind: 'overflow', el: name(el), sw: el.scrollWidth, cw: el.clientWidth });
    }
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    let hit = null;
    for (const p of a.shown) for (const q of b.shown) {
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (w > 1 && h > 2) hit = { w: Math.round(w), h: Math.round(h) };
    }
    if (hit) out.push({ kind: 'overlap', a: name(a.el), b: name(b.el), ...hit });
  }
  const se = document.scrollingElement;
  if (se.scrollWidth > innerWidth + 1) out.push({ kind: 'sideways scroll', width: se.scrollWidth });
  // the end of what scrolls, at its end: clear of the tab bar (a page) or inside the sheet (a sheet); a sheet 80 or
  // more from the top
  if (sheet) {
    sheet.scrollTop = 1e6;
    const sb = sheet.getBoundingClientRect();
    const last = Math.max(...[...sheet.querySelectorAll('.sheet-body *')].map(n => n.getBoundingClientRect()).filter(b => b.height > 0).map(b => b.bottom));
    if (last > sb.bottom + 1) out.push({ kind: 'hidden at the sheet\'s foot', last: Math.round(last), bottom: Math.round(sb.bottom) });
    if (sb.top < 79) out.push({ kind: 'sheet too tall', top: Math.round(sb.top) });
    sheet.scrollTop = 0;
  } else {
    const y = scrollY; window.scrollTo(0, 1e6);
    const tabs = document.querySelector('#tabs');
    const tb = tabs && !tabs.hidden ? tabs.getBoundingClientRect() : null;
    const last = Math.max(...[...document.querySelectorAll('#screen *')].filter(n => getComputedStyle(n).position !== 'fixed').map(n => n.getBoundingClientRect()).filter(b => b.height > 0).map(b => b.bottom));
    if (tb && last > tb.top - 2) out.push({ kind: 'under the tab bar', last: Math.round(last), bar: Math.round(tb.top) });
    window.scrollTo(0, y);
  }
  return { problems: out, texts: texts.length };
}

// The words of a transition, frame by frame (installed as window.__frames).
function frames() {
  const alpha = el => { let a = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; a *= Number(cs.opacity); } return a; };
  const state = el => {
    const rg = document.createRange(); rg.selectNodeContents(el);
    const rows = [];
    for (const r of rg.getClientRects()) { if (r.width < 0.5 || r.height < 0.5) continue; const m = r.top + r.height / 2; if (!rows.some(t => Math.abs(t.m - m) < t.h / 2)) rows.push({ m, h: r.height }); }
    let cut = false;
    for (let n = el, i = 0; n && i < 3; n = n.parentElement, i++) { const cs = getComputedStyle(n); if (cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' && n.scrollWidth > n.clientWidth + 1) { cut = true; break; } }
    return { lines: rows.length, cut };
  };
  const texts = () => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (!t.textContent.trim()) continue;
      const el = t.parentElement; if (!el || el.closest('svg, script, style, #tabs, #toast-root') || out.includes(el)) continue;
      const b = el.getBoundingClientRect(); if (!b.width || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
      out.push(el);
    }
    return out;
  };
  const key = el => `${el.tagName}.${String(el.className).trim().split(/\s+/).filter(c => !/^(xf-old|on|sel|pressed|current)$/.test(c)).sort().join('.')}|${el.textContent.trim()}`;
  const label = el => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')} "${el.textContent.trim().slice(0, 36)}"`;
  const copy = el => !!el.closest('.xf-old, .op-top, .sheet-ghost');
  const words = el => { const rg = document.createRange(); rg.selectNodeContents(el); const r = rg.getBoundingClientRect(), b = el.getBoundingClientRect(); return { left: Math.max(r.left, b.left), top: r.top, width: Math.min(r.right, b.right) - Math.max(r.left, b.left), height: r.height }; };
  const centre = b => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
  const prev = window.__frames;
  const F = window.__frames = {
    // the words as they rest before it starts, and the source's (a close keeps the one read before its open)
    rest(src) {
      F.m0 = new Map(); F.k0 = {};
      for (const el of texts()) { const s = state(el); F.m0.set(el, s); F.k0[key(el)] = F.k0[key(el)] || s; }
      const S = src && document.querySelector(src);
      F.src = S ? { s: state(S), b: words(S), text: S.textContent.trim() } : (prev && prev.src) || null;
      F.frozen = false; F.anims = [];
      return F.src;
    },
    // the next page change is frozen as it is drawn (the app's own listener draws it first)
    arm() { addEventListener('hashchange', () => { if (!F.frozen) F.freeze(); }, { once: true }); },
    freeze() { F.frozen = true; F.anims = document.getAnimations(); for (const a of F.anims) { try { a.pause(); } catch (_) { /* gone */ } } },
    async sample(times, dst) {
      const t0 = performance.now();
      while (!F.frozen && performance.now() - t0 < 500) await new Promise(r => setTimeout(r, 4));
      if (!F.frozen) F.freeze();
      const span = Math.max(0, ...F.anims.map(a => { try { return a.effect.getComputedTiming().endTime; } catch (_) { return 0; } }).filter(isFinite));
      F.frames = [];
      for (const t of times) {
        if (t > span + 40) break;
        for (const a of F.anims) { try { a.currentTime = t; } catch (_) { /* gone */ } }
        const list = texts().filter(el => alpha(el) > 0.04).map(el => ({ el, s: state(el), a: alpha(el), copy: copy(el), key: key(el) }));
        const D = dst ? [...document.querySelectorAll(dst)].find(n => n.getBoundingClientRect().width > 0) : null;
        F.frames.push({ t, list, D: D && { el: D, s: state(D), b: words(D) } });
      }
      for (const a of F.anims) { try { a.finish(); } catch (_) { /* gone */ } }
      return { span: Math.round(span), frames: F.frames.length, anims: F.anims.length };
    },
    check() {
      const after = new Map(), k1 = {};
      for (const el of texts()) { const s = state(el); after.set(el, s); k1[key(el)] = k1[key(el)] || s; }
      const bad = [];
      let flew = false;
      for (const { t, list, D } of F.frames) {
        for (const f of list) {
          const want = f.copy ? (F.k0[f.key] || k1[f.key]) : (after.get(f.el) || F.m0.get(f.el));
          if (want && (want.lines !== f.s.lines || want.cut !== f.s.cut)) bad.push({ t, el: label(f.el), got: f.s, rest: want });
          if (F.src && f.el.closest('.xf-old, .op-top') && !f.el.closest('.sheet-ghost') && f.el.textContent.trim() === F.src.text && f.a > 0.1 && (f.s.lines !== F.src.s.lines || f.s.cut !== F.src.s.cut)) bad.push({ t, copy: label(f.el), got: f.s, source: F.src.s });
        }
        // the destination drawn over the source, flown out of it or into it: whole and one line at both ends
        if (F.src && D && !flew) {
          const a = centre(F.src.b), b = centre(D.b);
          if (Math.abs(a.x - b.x) < 24 && Math.abs(a.y - b.y) < 24 && D.b.width < F.src.b.width * 1.6) {
            flew = true;
            if (D.s.lines !== F.src.s.lines || D.s.cut || F.src.s.cut) bad.push({ t, flies: label(D.el), dest: D.s, source: F.src.s });
          }
        }
      }
      return { bad: bad.slice(0, 6), n: bad.length, flew };
    },
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  let before = null;
  for (const [W, H] of [[360, 780], [412, 915]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|404|Failed to load resource/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
    const C = (fn, arg) => page.evaluate(fn, arg);
    await page.goto(`http://127.0.0.1:${PORT}/ui/#home`);
    if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
    await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
    await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
    if (!before) before = await C(() => JSON.stringify(window.__copper.S.config));
    const S = await C(`(${stress})()`);
    const go = async (h, ms = 900) => { await C(x => { location.hash = x; }, h); await wait(ms); };
    const click = async sel => { await C(s => { const e = document.querySelector(s); if (!e) throw new Error(`no ${s}`); e.click(); }, sel); await wait(600); };
    const look = async (what, scope = null) => {
      const got = await C(([fn, sc]) => (0, eval)(`(${fn})`)(sc), [probe.toString(), scope]);
      check(`${W}: ${what}: words fit, none over another, no sideways scroll, nothing hidden at the end (${got.texts} pieces of words)`, !got.problems.length, got.problems.slice(0, 4));
    };
    const reset = () => C(() => { const c = window.__copper; c.ui.picker = null; c.ui.sceneOpen = null; c.closeSheet(); });

    // ---- All scenes, a scene's editor and its pickers
    await go('scenes', 1200); await look('All scenes');
    for (const id of ['lay-all', 'lay-one', 'lay-long']) { await go('scenes', 300); await go(`scenes/${id}`, 1200); await look(`the scene sheet (${id})`); }
    const mood = await C(k => (window.__copper.H.roomScenes(k).find(p => p.mood) || {}).id, S.kitchen);
    await go('scenes', 300); await go(`scenes/${mood}`, 1200); await look('a suggested scene\'s sheet');
    const lut = await C(() => (window.__copper.data.lutronScenes()[0] || {}).scene_id);
    if (lut) { await go('scenes', 300); await go(`scenes/lutron-${lut}`, 1200); await look('a Lutron scene\'s sheet'); }
    for (const [act, what] of [['scene-name', 'the Name picker'], ['scene-room', 'the Room picker'], ['scene-add', 'Add a light'], ['scene-delete', 'Delete']]) {
      await reset(); await go('scenes', 300); await go('scenes/lay-long', 1200); await click(`#sheet-root [data-act="${act}"]`); await look(what);
    }
    await reset(); await go('scenes', 300); await go('scenes/lay-all', 1200);
    await C(() => { const c = window.__copper; const lamp = c.data.controllable().find(d => d.color) || c.data.controllable()[0]; c.ui.sceneOpen = lamp.device_id; c.ui.sceneOpenAt = 'stage'; c.render(); }); await wait(600);
    await look('an orb\'s choices under the stage');
    await C(() => { const c = window.__copper; const fan = c.data.controllable().find(d => d.domain === 'fan'); c.ui.sceneOpen = fan && fan.device_id; c.ui.sceneOpenAt = 'list'; c.render(); }); await wait(600);
    await look('a light opened in the list');
    await reset();

    // ---- the stage: every number of lanes, and the numbers while a finger drags an orb through its range
    const lanes = [];
    for (let n = 1; n <= S.n; n++) {
      await go('scenes', 200); await go(`scenes/lay-n${n}`, 900);
      const got = await C(([fn]) => (0, eval)(`(${fn})`)('.sc-stage'), [probe.toString()]);
      const lv = await C(() => [...document.querySelectorAll('#sheet-root .sc-lv')].map(e => { const b = e.getBoundingClientRect(), l = e.closest('.sc-lane').getBoundingClientRect(); return b.left >= l.left - 0.5 && b.right <= l.right + 0.5; }));
      lanes.push({ n, problems: got.problems.length, inLane: lv.every(Boolean) });
      if (got.problems.length || !lv.every(Boolean)) console.log(`   ${n} lights`, JSON.stringify(got.problems.slice(0, 3)));
    }
    check(`${W}: the stage with 1 to ${S.n} lights: every number in its own lane, none touching another`, lanes.every(l => !l.problems && l.inLane), lanes.filter(l => l.problems || !l.inLane));
    await go('scenes', 200); await go('scenes/lay-all', 1200);
    const snap = await C(() => JSON.stringify(window.__copper.S.config));
    const drag = [];
    for (let i = 0; i < 3; i++) {
      const orb = `#sheet-root .sc-lane:nth-child(${i + 1}) .sc-orb`;
      for (const dy of [-200, -120, -60, 30, 80, 120, 170]) {
        await C(([s, d]) => {
          const el = document.querySelector(s); const b = el.getBoundingClientRect();
          const fire = (type, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch', isPrimary: true, clientX: b.left + 22, clientY: y }));
          fire('pointerdown', b.top + 22); fire('pointermove', b.top + 30); fire('pointermove', b.top + 22 + d);
        }, [orb, dy]);
        await wait(60);
        const got = await C(([fn]) => (0, eval)(`(${fn})`)('.sc-stage'), [probe.toString()]);
        const lab = await C(s => document.querySelector(s).parentElement.querySelector('.sc-lv').textContent, orb);
        drag.push({ i, dy, lab, n: got.problems.length });
        if (got.problems.length) console.log('   dragging', i, dy, lab, JSON.stringify(got.problems.slice(0, 2)));
        // let go where it started: the scene is put back below
        await C(s => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 21, pointerType: 'touch', clientX: b.left + 22, clientY: b.top + 22 })); }, orb);
        await wait(150);
        await C(async x => { const c = window.__copper; if (JSON.stringify(c.S.config) !== x) { c.data.restoreConfig(x); await c.data.saveConfig(); c.render(); } }, snap); await wait(250);
      }
    }
    check(`${W}: an orb dragged through its range (${drag.map(d => d.lab).filter((v, i, a) => a.indexOf(v) === i).join(', ')}): its number never touches another`, drag.every(d => !d.n), drag.filter(d => d.n));
    await reset();

    // ---- a room's chips: many, their end, Edit, a room with none
    await go('scenes', 200); await go(`room/${S.kitchen}`, 1400);
    await look('a room\'s scene chips', '.room-sec, .room-chips');
    await C(() => { document.querySelector('.room-chips').scrollLeft = 1e6; }); await wait(300);
    await look('a room\'s scene chips scrolled to their end', '.room-sec, .room-chips');
    const endGap = await C(() => { const r = document.querySelector('.room-chips'); const last = r.lastElementChild.getBoundingClientRect(); return Math.round(innerWidth - last.right); });
    check(`${W}: the last chip ends a gutter from the edge`, endGap >= 16, endGap);
    await click('[data-act="room-scenes-edit"]'); await look('the chips in Edit', '.room-sec, .room-chips');
    await click('[data-act="room-scenes-edit"]');
    const bare = await C(() => { const c = window.__copper; const a = c.data.areas().find(x => !c.H.roomScenes(x.id).length); return a && a.id; });
    if (bare) { await go(`room/${bare}`, 1200); await look('a room with no scenes', '.room-sec, .room-chips'); }

    // ---- Remotes, every layout, nothing set and a long action; a remote's sheets; Press timing
    await go('remotes', 1200); await look('Remotes, nothing set');
    const pid = S.pids[S.pids.length - 1], other = S.pids[0];
    const models = await C(() => Object.keys(window.__copper.REM.PICO_MODELS));
    for (const m of models) { await C(([p, k]) => { const c = window.__copper; c.REM.setLook(p, 'model', k); c.render(); }, [other, m]); await go(`remote/${other}`, 900); await look(`a remote drawn as ${m}`); await go('remotes', 200); }
    await C(([p, q]) => { const c = window.__copper; const l = (c.S.config.settings.remote_looks || {})[q]; if (l) delete l.model; c.REM.applyUsualLayout(q);
      const ids = c.data.controllable().filter(d => d.domain === 'light').slice(0, 5).map(d => `d:${d.device_id}`);
      c.REM.setActions(p, 0, 'single', false, [{ type: 'level', target: ids, level: 60, fade: 2 }]);
      c.REM.setActions(p, 0, 'double', false, [{ type: 'preset', preset_id: 'lay-all' }]);
      c.REM.setActions(p, 0, 'single', true, [{ type: 'preset', preset_id: 'lay-long' }]);
      return c.data.saveConfig(); }, [pid, other]);
    await go('remotes', 1200); await look('Remotes, set up');
    await go(`remote/${pid}`, 1200); await look('a remote with a long name and a long action');
    await go(`remote/${other}`, 1200); await look('a remote set up the usual way');
    for (const [sub, what, then] of [['k0-single', 'what a press does'], ['k0-hold', 'what a hold does'], ['k0-single', 'what it controls', '[data-act="controls"]'], ['k0-single', 'what it controls, several', '[data-act="controls"]|[data-act="ctl-mode"][data-m="several"]'], ['k0-single', 'what it controls, a room', '[data-act="controls"]|[data-act="ctl-mode"][data-m="room"]'], ['k0-single', 'what it controls, saved sets', '[data-act="controls"]|[data-act="ctl-mode"][data-m="sets"]'], ['k0-single', 'More choices', '[data-act="ways"]'], ['k0-single', 'At night', '[data-act="night-ways"]'], ['k0-single', 'Step by step', '.press-steps[data-act="steps"]'], ['more', 'More', null], ['more', 'Which remote is this', '[data-act="rm-look"]'], ['more', 'its room', '[data-act="rm-room"]'], ['more', 'Remove', '[data-act="rm-remove"]']]) {
      await reset(); await go(`remote/${pid}`, 500); await go(`remote/${pid}/${sub}`, 1100);
      for (const s of (then || '').split('|').filter(Boolean)) await click(`#sheet-root ${s}`);
      await look(what);
    }
    await reset(); await go('timing', 1200); await look('Press timing');
    await C(n => { const c = window.__copper; c.ui.heard = { who: `${c.data.dev(n).name} · Top button`, at: Date.now(), device: n, taps: [1, 2], gap: 280, gesture: 'double' }; c.render(); }, pid); await wait(500);
    await look('Press timing, having heard a press twice');

    // ---- the transitions: words keep their lines and their ellipsis all the way
    const TIMES = [0, 16, 40, 60, 80, 110, 150, 200, 260, 330, 420, 520, 650, 800, 1000, 1300];
    const H2 = '.sheet-ghost h2.t-sheet, #sheet-root h2.t-sheet';
    await C(`(${frames})()`);
    const flight = async (what, trigger, src, dst, sync = false) => {
      await C(`(${frames})()`);
      await C(s => window.__frames.rest(s), src);
      if (!sync) await C(() => window.__frames.arm());
      await trigger();
      const info = await C(([t, d]) => window.__frames.sample(t, d), [TIMES, dst]);
      await wait(700);
      const got = await C(() => window.__frames.check());
      check(`${W}: ${what}: every piece of words keeps its lines and its ellipsis (${info.frames} frames of ${info.span} ms, ${info.anims} animations${got.flew ? ', the word flies' : ''})`, info.anims > 3 && !got.n, got.bad);
    };
    const hold = async sel => { await C(s => document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }), sel); await wait(400); const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await wait(650); await page.mouse.up(); };
    const closeX = () => C(() => { document.querySelector('#sheet-root .sheet-close').click(); window.__frames.freeze(); });
    await go(`room/${S.kitchen}`, 1400);
    for (const id of ['lay-k3', 'lay-all']) {
      const chip = `.room-chips .chip[data-id="${id}"]`;
      await C(s => document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }), chip); await wait(400);
      await flight(`M12, a chip held open (${id})`, () => hold(chip), chip, H2); await wait(700);
      await flight(`M12, closed into its chip (${id})`, closeX, chip, H2, true); await wait(900);
    }
    await go('scenes', 1200);
    const row = '.scene-row[data-id="lay-long"]';
    await C(s => document.querySelector(s).scrollIntoView({ block: 'center' }), row); await wait(400);
    await flight('M12, a row opened by its chevron', () => C(s => document.querySelector(`${s} .row-chev`).click(), row), `${row} .row-txt .t`, H2); await wait(700);
    await flight('M12, closed into its row', closeX, `${row} .row-txt .t`, H2, true); await wait(900);
    await C(() => window.scrollTo(0, 0)); await wait(300);
    const tile = '.scene-tile[data-id="lay-long"]';
    await flight('M12, a tile held open', () => hold(tile), `${tile} .nm`, H2); await wait(700);
    await flight('M12, closed into its tile', closeX, `${tile} .nm`, H2, true); await wait(900);
    for (const id of [pid, other]) {
      await go('remotes', 1200);
      const card = `.rcard[data-go="remote/${id}"]`;
      await flight(`M14, a remote's card opened (${await C(s => document.querySelector(s).textContent.trim(), `${card} .rc-nm`)})`, () => page.tap(card), `${card} .rc-nm`, '.remote-page .page-h1'); await wait(1500);
      await flight('M14, Back into its card', () => C(() => history.back()), `${card} .rc-nm`, '.remote-page .page-h1'); await wait(1200);
    }

    check(`${W}: no page errors`, !errors.length, errors.slice(0, 4));
    await C(async x => { const c = window.__copper; c.data.restoreConfig(x); await c.data.saveConfig(); }, before);
    await ctx.close();
  }
  // put back as it was found, and read back from the hub to be sure
  const back = await fetch(`http://127.0.0.1:${PORT}/api/snapshot`, { headers: { authorization: `Bearer ${process.env.APP_TOKEN || ''}` } }).then(r => r.json()).then(j => j.config).catch(() => null);
  if (process.env.APP_TOKEN && back) {
    const was = JSON.parse(before);
    const same = k => JSON.stringify(back[k]) === JSON.stringify(was[k]);
    check('the config is put back as it was found (scenes, stars, remotes, settings)', ['presets', 'favorites', 'bindings', 'settings'].every(same), ['presets', 'favorites', 'bindings', 'settings'].filter(k => !same(k)));
  }
  await browser.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed');
  process.exit(bad ? 1 : 0);
})();
