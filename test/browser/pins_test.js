// Pinned to Home (web/ui/pins.js, parts.js pinButton and pinRoomCard, the data layer's pinned and setPinOrder): the pin
// on a light's page and a room's page, Home's Pinned grid in the order things were pinned, a pinned light's tile and a
// pinned room's card doing what they do elsewhere, edit mode (the x, and a held item dragged to a new place, the order
// saved and kept over a reload), the calm card with nothing pinned, a home's old stars still showing, and what is
// deleted or hidden dropping out. At 412 and 360, with no toast, no sideways scroll and no page errors. It puts the
// config back as it found it.
//
// With SHOTS set, it also saves pictures of Home with 0, 1, 3 and 8 pins (the night look for 8), edit mode, a drag
// mid-flight and the pins on a light's page and a room's page, at rest and with the room's header collapsed.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
const SHOTS = process.env.SHOTS || '';
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (ok || got === undefined ? '' : ` | ${JSON.stringify(got).slice(0, 800)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const root = `http://127.0.0.1:${PORT}/ui/`;
  let before = null;
  for (const [W, H] of [[412, 915], [360, 780]]) {
    console.log(`\n---- ${W} x ${H}`);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: true, hasTouch: true });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${W}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|404|Failed to load resource/.test(m.text())) errors.push(`${W} console: ${m.text()}`); });
    const C = (fn, arg) => page.evaluate(fn, arg);
    const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
    const go = async hash => { await C(h => { location.hash = h; }, hash); await wait(1000); };
    const shot = async name => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${W}.png`) }); };
    const scroll = async y => { await C(async y => { window.scrollTo(0, y); for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r)); }, y); await wait(150); };
    const favs = () => C(() => window.__copper.S.config.favorites.slice());
    const saved = () => C(async () => (await fetch('/api/snapshot', { headers: { authorization: 'Bearer ' + window.__copper.S.token } }).then(r => r.json())).config.favorites);
    const setFavs = async f => { await C(async f => { const c = window.__copper; c.S.config.favorites = f; await c.data.saveConfig(); c.render(); }, f); await wait(500); };
    const grid = () => C(() => [...document.querySelectorAll('#screen .pin-grid > .pin-item')].map(n => n.dataset.key));
    const pinBtn = () => C(() => { const b = document.querySelector('#screen .hdr [data-act="pin"]'); return b && { pressed: b.getAttribute('aria-pressed'), cls: b.className, label: b.getAttribute('aria-label') }; });
    const toast = () => C(() => document.querySelector('#toast-root').textContent.trim());
    const sideways = () => C(() => document.documentElement.scrollWidth - innerWidth);
    const hash = () => C(() => location.hash);

    await page.goto(root + '#home'); await ready(); await wait(1200);
    await C(() => window.__copper.closeSheet());
    if (!before) before = await C(() => JSON.stringify(window.__copper.S.config));
    // what this home has to pin: a dimmer, another light, two rooms with lights in them
    const plan = await C(() => {
      const c = window.__copper;
      c.H.ensureRooms();
      const lights = c.data.controllable().filter(d => d.domain === 'light' && !String(d.device_id).startsWith('nanoleaf'));
      const rooms = c.data.areas().filter(a => c.H.roomLights(a.id).length);
      return { a: lights[0].device_id, aName: lights[0].name, b: lights[1].device_id, r1: rooms[0].id, r1Name: rooms[0].name, r2: rooms[1].id, rooms: rooms.map(r => r.id), lights: lights.map(d => d.device_id) };
    });
    await C(() => { window.__sent = []; const c = window.__copper; if (!c.__run0) { c.__run0 = c.run; c.run = a => { window.__sent.push(a); return c.__run0(a); }; } });

    // ---- nothing pinned: a calm card that says how, and no Edit
    await setFavs([]);
    await go('home');
    const hint = await C(() => { const h = document.querySelector('#screen .pin-hint'); return h && h.textContent.replace(/\s+/g, ' ').trim(); });
    check('with nothing pinned, Home shows one line with the pin\'s glyph, and no heading over it', hint === 'Pin lights and rooms here' && (await C(() => !!document.querySelector('#screen .pin-hint .ic-c svg'))) && !(await C(() => [...document.querySelectorAll('#screen .t-over')].some(e => e.textContent.trim() === 'Pinned'))), hint);
    check('and no Edit and no grid', !(await page.$('#screen [data-act="pins-edit"]')) && !(await page.$('#screen .pin-grid')));
    await scroll(0); await shot('home-0');

    // ---- pinning a light from its page
    await go(`light/${plan.a}`);
    let pb = await pinBtn();
    check("a light's page has the pin beside its ⋯, not pressed", !!pb && pb.pressed === 'false' && /\ba2\b/.test(pb.cls) && pb.label === `Pin ${plan.aName} to Home`, pb);
    await shot('light-pin-rest');
    await page.click('#screen [data-act="pin"]'); await wait(700);
    pb = await pinBtn();
    await shot('light-pin-pinned-first');
    check('a tap pins it: pressed, filled', pb.pressed === 'true' && /pinned/.test(pb.cls) && (await favs()).includes(`d:${plan.a}`), pb);
    check('saved to the hub, so it is the same on every phone', (await saved()).includes(`d:${plan.a}`));
    check('and no toast', !(await toast()), await toast());
    await go('home');
    check("Home's grid has the light's tile", (await grid()).join() === `d:${plan.a}` && !!(await page.$(`#screen .pin-grid .tile[data-go="light/${plan.a}"]`)), await grid());
    check('the heading reads Pinned, with Edit', await C(() => { const s = document.querySelector('#screen .pin-sec'); return !!s && /Pinned/i.test(s.textContent) && s.querySelector('[data-act="pins-edit"]').textContent.trim() === 'Edit'; }));
    await scroll(0); await shot('home-1');

    // ---- pinning a room from its page, and another light: the grid is in the order pinned
    await go(`room/${plan.r1}`);
    pb = await pinBtn();
    check("a room's page has the pin beside its ⋯, not pressed", !!pb && pb.pressed === 'false' && pb.label === `Pin ${plan.r1Name} to Home`, pb);
    await shot('room-pin-rest');
    await page.click('#screen [data-act="pin"]'); await wait(700);
    check('a tap pins the room', (await pinBtn()).pressed === 'true' && (await favs()).includes(`a:${plan.r1}`));
    await shot('room-pin-pinned');
    // with the header collapsed the pin stays in the bar, clear of the title
    await C(() => { const r = document.querySelector('#screen .room'); r.style.paddingBottom = '900px'; });
    await scroll(80);
    const coll = await C(() => { const b = document.querySelector('#screen .hdr .a2').getBoundingClientRect(), t = document.querySelector('#screen .room-title h1').getBoundingClientRect(); return { w: b.width, top: b.top, tr: t.right, bl: b.left }; });
    check('collapsed, the pin is a 44 circle in the bar, the title short of it', Math.abs(coll.w - 44) < 0.8 && Math.abs(coll.top - 50) < 0.8 && coll.tr <= coll.bl, coll);
    await shot('room-pin-collapsed');
    await scroll(0);
    await go(`light/${plan.b}`);
    await page.click('#screen [data-act="pin"]'); await wait(700);
    await shot('light-pin-pinned');
    await go('home');
    check('the grid is in the order pinned: light, room, light', (await grid()).join() === [`d:${plan.a}`, `a:${plan.r1}`, `d:${plan.b}`].join(), await grid());
    check('a pinned room is a card the size of a tile', await C(() => { const a = document.querySelector('#screen .pin-grid .pin-item.light'), b = document.querySelector('#screen .pin-grid .pin-room'); const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return Math.abs(x.width - y.width) < 1 && Math.abs(x.height - y.height) < 1 && x.height === 150; }));
    check('in two columns', await C(() => { const [a, b, c] = [...document.querySelectorAll('#screen .pin-grid > .pin-item')].map(n => n.getBoundingClientRect()); return Math.abs(a.top - b.top) < 1 && b.left > a.right && Math.abs(c.left - a.left) < 1 && c.top > a.bottom; }));
    await scroll(420); await shot('home-3');

    // ---- a pinned light's tile: its power switches it, its body opens it
    const lv = id => C(id => window.__copper.data.level(id) || 0, id);
    const was = await lv(plan.a);
    await page.click(`#screen .pin-grid .tile[data-go="light/${plan.a}"] .pwr`); await wait(1400);
    check("the tile's power switches the light, and Home stays", (await hash()) === '#home' && ((await lv(plan.a)) > 0) !== (was > 0), [await hash(), was, await lv(plan.a)]);
    await page.click(`#screen .pin-grid .tile[data-go="light/${plan.a}"] .nm`); await wait(1200);
    check('the tile opens the light', (await hash()) === `#light/${plan.a}`, await hash());
    check('whose pin reads pressed', (await pinBtn()).pressed === 'true');
    await C(() => history.back()); await wait(1200);

    // ---- a pinned room's card: its power switches the room (never the whole house), the card opens the room
    const roomLit = () => C(a => window.__copper.H.roomLights(a).some(d => (window.__copper.data.level(d.device_id) || 0) > 0), plan.r1);
    const lit0 = await roomLit();
    await C(() => { window.__sent = []; });
    await page.click(`#screen .pin-room[data-go="room/${plan.r1}"] .pwr`); await wait(1500);
    const sent = await C(() => window.__sent);
    check("the card's power switches the room", (await roomLit()) !== lit0 && (await hash()) === '#home', { lit0, now: await roomLit() });
    check('with one command for that room, and nothing for the whole house', sent.length === 1 && sent[0].target === `a:${plan.r1}` && !JSON.stringify(sent).includes('h:all'), sent);
    const lit1 = await roomLit();
    await page.click(`#screen .pin-room[data-go="room/${plan.r1}"] .pwr`); await wait(1500);
    check('and back again', (await roomLit()) !== lit1);
    const status = await C(a => document.querySelector(`#screen .pin-room[data-go="room/${a}"] .vl`).textContent, plan.r1);
    check("the card says how much is on, as Rooms does", /^(Off|\d+%|\d+ on · \d+%)$/.test(status), status);
    await page.click(`#screen .pin-room[data-go="room/${plan.r1}"] .nm`);
    const opened = await C(() => new Promise(r => { const t0 = performance.now(); const f = () => (document.querySelector('.m10-top') ? r(true) : performance.now() - t0 > 600 ? r(false) : requestAnimationFrame(f)); f(); }));
    await wait(1200);
    check('the card opens the room, out of the card (M10)', (await hash()) === `#room/${plan.r1}` && opened, [await hash(), opened]);
    // unpinned from its page, it is gone from Home
    await page.click('#screen [data-act="pin"]'); await wait(700);
    check("unpinned from the room's page: not pressed", (await pinBtn()).pressed === 'false' && !(await favs()).includes(`a:${plan.r1}`));
    await C(() => history.back()); await wait(1200);
    check("and gone from Home's grid", (await grid()).join() === [`d:${plan.a}`, `d:${plan.b}`].join(), await grid());
    check('no toast along the way', !(await toast()), await toast());

    // ---- eight, with long names, lit and off, and the house's old stars still showing
    const scene = await C(async r => {
      const c = window.__copper;
      let p = c.data.presets()[0];
      if (!p) { p = c.H.saveRoomLook(r); await c.data.saveConfig(); }
      const s = c.data.lutronScenes()[0];
      return { p: p.id, s: s ? String(s.scene_id) : null };
    }, plan.r1);
    const eight = [`d:${plan.a}`, `a:${plan.r1}`, `d:${plan.b}`, `a:${plan.r2}`, `p:${scene.p}`, ...plan.lights.slice(2, 4).map(id => `d:${id}`), ...plan.rooms.slice(2, 4).map(id => `a:${id}`), ...(scene.s ? [`s:${scene.s}`] : [])];
    await C(p => { const c = window.__copper; c.S.inv.devices[p.b].name = 'Pendant over the kitchen island by the window'; c.EDIT.renameRoom(p.r2, "Collin's Office and Reading Nook"); }, plan);
    await setFavs(eight);
    await go('home');
    const shown = eight.filter(k => /^[da]:/.test(k));
    check('old keys still show: every light and room in the grid, in order', (await grid()).join() === shown.join(), { grid: await grid(), shown });
    check('and the scenes as chips under it', await C(s => { const row = document.querySelector('#screen .chip-row[data-keep="scenes"]'); return !!row && !!row.querySelector(`[data-t="p:${s.p}"]`) && (!s.s || !!row.querySelector(`[data-t="s:${s.s}"]`)); }, scene));
    const cut = await C(() => [...document.querySelectorAll('#screen .pin-grid .nm')].map(n => { const cs = getComputedStyle(n); const lh = parseFloat(cs.lineHeight); return { t: n.textContent, lines: Math.round(n.getBoundingClientRect().height / lh), over: n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1 }; }));
    const longRoom = cut.find(x => x.t === "Collin's Office and Reading Nook"), longLight = cut.find(x => /^Pendant over/.test(x.t));
    check("a long room name is one line ending in an ellipsis; a long light name two lines, then an ellipsis", !!longRoom && longRoom.lines === 1 && longRoom.over && !!longLight && longLight.lines === 2 && longLight.over, { longRoom, longLight });
    check('no sideways scroll', (await sideways()) <= 0, await sideways());
    const overlap = await C(() => {
      const items = [...document.querySelectorAll('#screen .pin-grid > .pin-item')].map(n => n.getBoundingClientRect());
      const W = innerWidth;
      const out = items.some(r => r.left < 19.5 || r.right > W - 19.5);
      const hit = items.some((a, i) => items.some((b, j) => j > i && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
      return { out, hit };
    });
    check('each item inside the gutters and none over another', !overlap.out && !overlap.hit, overlap);
    await scroll(430); await shot('home-8');
    await C(() => { try { localStorage.setItem('v7night', '1'); } catch (_) {} window.__copper.render(); }); await wait(500);
    await shot('home-8-night');
    await C(() => { try { localStorage.removeItem('v7night'); } catch (_) {} window.__copper.render(); }); await wait(300);

    // ---- what is deleted or hidden drops out
    await C(p => { const c = window.__copper; c.EDIT.hideDevice(p.b); c.render(); }, plan); await wait(300);
    check('a hidden light drops out of the grid', !(await grid()).includes(`d:${plan.b}`));
    await C(p => { const c = window.__copper; c.EDIT.unhideDevice(p.b); c.render(); }, plan); await wait(300);
    const tmp = await C(async () => { const c = window.__copper; const r = c.EDIT.createRoom('Pin test room'); c.H.togglePin('a:' + r.id); await c.data.saveConfig(); c.render(); return r.id; });
    await wait(300);
    check('a pinned room with nothing in it yet still shows, and says so', await C(id => { const n = document.querySelector(`#screen .pin-room[data-go="room/${id}"]`); return !!n && n.querySelector('.vl').textContent === 'No lights yet' && !n.querySelector('.pwr'); }, tmp));
    await C(async id => { const c = window.__copper; c.EDIT.deleteRoom(id); await c.data.saveConfig(); c.render(); }, tmp); await wait(300);
    check('a deleted room drops out, and its key is taken out of favorites', !(await grid()).includes(`a:${tmp}`) && !(await favs()).includes(`a:${tmp}`));

    // ---- edit mode: the x takes one off, a held item is dragged to a new place
    await scroll(0);
    await page.click('#screen [data-act="pins-edit"]'); await wait(400);
    const ed = await C(() => ({ word: document.querySelector('#screen [data-act="pins-edit"]').textContent.trim(), xs: document.querySelectorAll('#screen .pin-grid .pin-x').length, items: document.querySelectorAll('#screen .pin-grid > .pin-item').length }));
    check('Edit becomes Done, and each item has its x', ed.word === 'Done' && ed.xs === ed.items && ed.items > 0, ed);
    await scroll(430); await shot('home-edit');
    // in edit mode a tap neither switches nor opens
    const lvA = await lv(plan.a);
    await page.click(`#screen .pin-grid .pin-item[data-key="d:${plan.a}"] .pwr`, { force: true }); await wait(900);
    await page.click(`#screen .pin-grid .pin-item[data-key="a:${plan.r1}"] .nm`, { force: true }); await wait(900);
    check('while editing, a tap on an item neither switches it nor opens it', (await hash()) === '#home' && (await lv(plan.a)) === lvA, [await hash(), lvA, await lv(plan.a)]);
    // the x
    const gone = `d:${plan.b}`;
    await page.click(`#screen .pin-x[data-key="${gone}"]`); await wait(700);
    check('the x unpins it at once, and saves', !(await grid()).includes(gone) && !(await favs()).includes(gone) && !(await saved()).includes(gone));
    check('with no toast and no Undo', !(await toast()), await toast());
    check('and edit mode stays on', await C(() => !!document.querySelector('#screen .pin-grid.editing')));
    // a quick tap does not pick anything up
    const g0 = await grid();
    const box = async k => C(k => { const r = document.querySelector(`#screen .pin-grid > .pin-item[data-key="${k}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, k);
    let a = await box(g0[0]);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await wait(120);
    const quick = await C(() => !!document.querySelector('#screen .pin-item.lifted'));
    await page.mouse.up(); await wait(300);
    check('a quick press picks nothing up', !quick && (await grid()).join() === g0.join());
    // press and hold, drag the first to the fourth place
    a = await box(g0[0]); const b = await box(g0[3]);
    const y0 = await C(() => window.scrollY);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await wait(420);
    const lifted = await C(() => { const n = document.querySelector('#screen .pin-item.lifted'); return n && { key: n.dataset.key, scale: getComputedStyle(n).scale }; });
    check('held 0.3 s, it lifts: a little larger, over the others', !!lifted && lifted.key === g0[0], lifted);
    for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12); await wait(30); }
    await wait(300);
    const mid = await C(() => { const n = document.querySelector('#screen .pin-item.lifted'); const r = n.getBoundingClientRect(); const moved = [...document.querySelectorAll('#screen .pin-grid > .pin-item:not(.lifted)')].filter(k => k.style.translate).length; return { x: r.left + r.width / 2, y: r.top + r.height / 2, moved, sy: window.scrollY, hash: location.hash }; });
    check('it follows the finger, the others make room, and the page neither scrolls nor leaves', Math.abs(mid.x - b.x) < 14 && Math.abs(mid.y - b.y) < 14 && mid.moved >= 3 && mid.sy === y0 && mid.hash === '#home', { mid, b, y0 });
    await shot('home-drag');
    await page.mouse.up(); await wait(700);
    const want = [g0[1], g0[2], g0[3], g0[0], ...g0.slice(4)];
    check('let go, it drops into its place', (await grid()).join() === want.join(), { got: await grid(), want });
    check('and the order is saved in favorites, scenes where they were', (await saved()).filter(k => /^[da]:/.test(k)).join() === want.join() && (await saved()).includes(`p:${scene.p}`), await saved());
    check('nothing opened', (await hash()) === '#home');
    await page.click('#screen [data-act="pins-edit"]'); await wait(400);
    check('Done leaves edit mode', await C(() => !document.querySelector('#screen .pin-grid.editing') && !document.querySelector('#screen .pin-x')));
    await page.reload(); await ready(); await wait(1500);
    check('the order survives a reload', (await grid()).join() === want.join(), await grid());
    check('no sideways scroll', (await sideways()) <= 0, await sideways());
    // ---- put the pins and names back for the next width
    await C(async b => { const c = window.__copper; const was = JSON.parse(b); c.S.config.favorites = was.favorites; c.S.config.settings = was.settings; c.S.config.presets = was.presets; await c.data.saveConfig(); }, before);
    await ctx.close();
  }

  // ---- put everything back
  const ctx = await browser.newContext();
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  await page.goto(root + '#home');
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await page.evaluate(async b => { const c = window.__copper; c.data.restoreConfig(b); await c.data.saveConfig(); }, before);
  await wait(400);
  const same = await page.evaluate(b => { const c = window.__copper.S.config, w = JSON.parse(b); return ['favorites', 'presets', 'settings'].every(k => JSON.stringify(c[k]) === JSON.stringify(w[k])); }, before);
  check('the config is put back as it was found', same);
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(bad ? `\n${bad} FAILED` : '\nall passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
