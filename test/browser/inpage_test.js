// Motion inside a page, measured frame by frame: what the in-page motion pass fixed, so it cannot come back.
//
//   a redraw in the middle of a transition carries it on its own clock: the light page's pill neither stands still
//     nor starts its curve again (it stood still for four frames when two redraws came quickly)
//   a light turned off moves its dial to where On brings it back as it greys, never in one frame
//   All off and All on: the house card's bar opens and closes its place, so the card and everything under it move on
//     the standard curve (they jumped 72 in a frame), and the headline crossfades whole, its number too
//   a hold let go empties its fill smoothly (a fill emptied to nothing is a matrix with no scale, which the browser
//     would not interpolate: it stood still, then vanished)
//   Goodnight held with a finger: the lift that ends the hold does not skip the dark-out
//   a scene arriving from its chip: an illustrated room's lamps hold until the ring reaches them, never showing the
//     new light first and going back; the chips beside the tapped one move over as its check comes, never jump
//   a room's level counts; a sheet that grows or shrinks (the sleep timer) moves its top, never jumps it
//   an unpinned item fades where it was; the offline card leaves from the strength it showed
//   a tile switched twice quickly keeps what it shows: the second copy goes under the first
//
// Needs a room with two dimmable lights; hue_color and nanoleaf first, as the rest of the suite does. It puts back
// what it changes (levels, scenes it suggested, pins, the night light).
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
  // (Goodnight stops the fans too, and the fake connector fails every fan command on purpose: the hub answers 502)
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR|status of 502/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  const goto = async (h, ms = 1100) => { await C(x => { location.hash = x; }, h); await wait(ms); };
  await page.goto(`http://127.0.0.1:${PORT}/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.solid'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(900);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const hold = async (sel, ms) => { const b = await page.locator(sel).first().boundingBox(); await touch('touchStart', b.x + b.width / 2, b.y + b.height / 2); await wait(ms); await touch('touchEnd'); };
  // Record something per frame for `ms`: `probe` is the body of a function of no arguments run in the page each frame.
  const record = (probe, ms) => C(({ probe, ms }) => {
    window.__rec = []; const t0 = performance.now(); const f = new Function(probe);
    const tick = () => { window.__rec.push([Math.round(performance.now() - t0), f()]); if (performance.now() - t0 < ms) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, { probe, ms });
  const got = () => C(() => window.__rec);
  const steps = rec => { const v = rec.map(r => r[1]).filter(x => typeof x === 'number'); let m = 0; for (let i = 1; i < v.length; i++) m = Math.max(m, Math.abs(v[i] - v[i - 1])); return m; };
  const turns = (rec, tol) => { const v = rec.map(r => r[1]).filter(x => typeof x === 'number'); let n = 0, dir = 0; for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1]; if (Math.abs(d) <= tol) continue; const s = Math.sign(d); if (dir && s !== dir) n++; dir = s; } return n; };

  const room = await C(() => { const c = window.__copper; const a = c.data.areas().find(x => c.H.roomLights(x.id).filter(d => d.domain === 'light').length >= 2 && !c.H.roomPhotoURL(x.id)); return a && { aid: a.id, ids: c.H.roomLights(a.id).filter(d => d.domain === 'light').map(d => d.device_id) }; });
  check('a room with two dimmable lights and its illustration to test with', !!room, room);
  if (!room) { await browser.close(); process.exit(1); }
  const [dim] = room.ids;
  const before = await C(ids => ids.map(id => [id, window.__copper.data.level(id) || 0]), room.ids);
  const level = (id, v) => C(([id, v]) => window.__copper.turn({ type: 'level', target: `d:${id}`, level: v }), [id, v]);

  // ---- a redraw in the middle of the On and Off pill's slide
  await level(dim, 40); await wait(900);
  await goto(`light/${dim}`);
  await record("const p = document.querySelector('.dev > .onoff .onoff-pill'); return p ? p.getBoundingClientRect().left : null;", 700);
  await C(() => { document.querySelector('.dev > .onoff [data-act="dev-off"]').click(); setTimeout(() => window.__copper.render(), 60); setTimeout(() => window.__copper.render(), 90); });
  await wait(900);
  let rec = await got();
  const xs = rec.map(r => r[1]); const a0 = xs[0], a1 = xs[xs.length - 1];
  const mid = xs.filter(x => Math.abs(x - a0) > 2 && Math.abs(x - a1) > 2);
  const stalls = mid.filter((x, i) => i && x === mid[i - 1]).length;
  check('the pill slides through two redraws without standing still or going back', mid.length >= 3 && !stalls && !turns(rec, 0.1), { mid, stalls });
  // ---- the dial, as the light goes off: on to where On brings it back, gliding
  await level(dim, 40); await wait(1200);
  const want = await C(id => Math.round(window.__copper.onLevel(id, `d:${id}`)), dim);
  await record("const k = document.querySelector('.dial .kn'); return k ? Number(k.getAttribute('cx')) : null;", 900);
  await page.click('.dev > .onoff [data-act="dev-off"]');
  await wait(1000);
  rec = await got();
  check(`off, the dial glides to where On brings it back (${want}%), never leaping`, (want === 40 || steps(rec) < 60) && Number(await C(() => document.querySelector('.dial').getAttribute('aria-valuenow'))) === want, { want, step: steps(rec) });

  // ---- All off and All on, the house card
  await goto('home');
  if (!(await page.$('[data-act="house-off"]:not(.folded)'))) { await level(dim, 60); await wait(1200); }
  await record("const c = document.querySelector('.card.house'); return c ? c.getBoundingClientRect().height : null;", 700);
  await page.click('[data-act="house-off"]');
  await wait(60);
  const whole = await C(() => { const x = document.querySelector('.house-head > .xf-old'); return x ? x.textContent.replace(/\s+/g, ' ').trim() : ''; });
  await wait(800);
  rec = await got();
  const between = r => r.filter(x => x[1] < Math.max(r[0][1], r[r.length - 1][1]) - 2 && x[1] > Math.min(r[0][1], r[r.length - 1][1]) + 2).length;
  check('All off: the house card closes its bar\'s place on the curve, never 72 in a frame', between(rec) >= 3 && rec[0][1] - rec[rec.length - 1][1] > 50, { between: between(rec), step: steps(rec), from: rec[0][1], to: rec[rec.length - 1][1] });
  check('and the headline crossfades whole, its number with its words', /on ·.*%/.test(whole), whole);
  // the held pill let go early: its copper empties, it does not stand still and vanish
  await record("const p = document.querySelector('.hold-pill'); if (!p) return null; const m = /matrix\\(([-\\d.e]+)/.exec(getComputedStyle(p, '::before').transform); return m ? Number(m[1]) : 1;", 1000);
  await hold('.hold-pill', 300);
  await wait(1000);
  rec = await got();
  const fall = rec.filter(r => typeof r[1] === 'number' && r[1] > 0.02 && r[1] < 0.4);
  check('a hold let go early empties its fill smoothly', steps(rec) < 0.3 && fall.length >= 2, { step: steps(rec), fall });
  await record("const c = document.querySelector('.card.house'); return c ? c.getBoundingClientRect().height : null;", 900);
  await hold('.hold-pill', 800);
  await wait(1100);
  rec = await got();
  check('All on: the card opens its bar\'s place on the curve', between(rec) >= 3 && rec[rec.length - 1][1] - rec[0][1] > 50, { between: between(rec), step: steps(rec), from: rec[0][1], to: rec[rec.length - 1][1] });

  // ---- Goodnight, held with a finger: lifting it does not skip the dark-out
  await C(() => { window.__copper.S.config.settings.night_look = window.__copper.S.config.settings.night_look || 'auto'; });
  await C(() => document.querySelector('.goodnight').scrollIntoView({ block: 'center' })); await wait(300);
  await hold('[data-hold="goodnight"]', 1150);
  await wait(350);
  const veil = await C(() => { const v = document.querySelector('.gn-night .gn-veil'); return v ? Number(getComputedStyle(v).opacity) : null; });
  check('Goodnight held with a finger: its lift does not skip the dark-out (the veil still open 0.35 s on)', veil != null && veil < 0.5, veil);
  await wait(6500);
  await C(() => { const g = document.querySelector('.gn-night'); if (g) g.remove(); });
  await goto('home', 600);

  // ---- a scene arriving: the lamps of the illustrated room wait for the ring, and the chips make room for the check
  const made = await C(async aid => { const c = window.__copper; if (c.H.roomScenes(aid).length) return []; const was = new Set(c.data.presets().map(p => p.id)); c.H.suggestScenes(aid); await c.data.saveConfig(); return c.data.presets().filter(p => !was.has(p.id)).map(p => p.id); }, room.aid);
  const scenes = await C(aid => window.__copper.H.roomScenes(aid).map(p => ({ id: p.id, lv: Object.values(p.levels || {}).map(v => (typeof v === 'object' && v ? Number(v.level) : Number(v)) || 0) })), room.aid);
  const pick = scenes.find(s => s.lv.some(x => x > 0 && x < 60)) || scenes[0];
  await level(dim, 100); await C(([id]) => window.__copper.turn({ type: 'level', target: `a:${id}`, level: 100 }), [room.aid]); await wait(1400);
  await goto(`room/${room.aid}`);
  const plain = await C(() => { const ch = [...document.querySelectorAll('.room-chips .chip[data-act="scene"]')]; const i = ch.findIndex((c, k) => k < ch.length - 1 && !c.querySelector('svg') && !c.classList.contains('current')); return i; });
  const target = plain >= 0 && plain < scenes.length - 1 ? scenes[plain] : pick;
  // a long fade, so its chip says "Arriving" and runs its line as well as taking its check
  const fade0 = await C(async id => { const c = window.__copper; const p = c.data.presets().find(x => x.id === id); const was = p.fade; p.fade = 3; await c.data.saveConfig(); return was == null ? null : was; }, target.id);
  await record(`const ls = [...document.querySelectorAll('.room-photo-card .room-scene .rl[data-l]')].slice(0, 12); const ch = [...document.querySelectorAll('.room-chips .chip[data-act="scene"]')]; const i = ch.findIndex(c => c.dataset.id === '${target.id}'); const n = ch[i + 1]; return [ls.map(l => Number(getComputedStyle(l).opacity)), n ? n.getBoundingClientRect().left : null];`, 1700);
  await C(() => window.scrollTo(0, 0));
  await page.click(`.room-chips .chip[data-t="p:${target.id}"]`);
  await wait(1900);
  rec = await got();
  const lamps = (rec[0] && rec[0][1][0].length) || 0;
  const lampTurns = [...Array(lamps).keys()].map(k => turns(rec.map(r => [r[0], r[1][0][k]]), 0.02));
  const moved = [...Array(lamps).keys()].filter(k => Math.abs(rec[0][1][0][k] - rec[rec.length - 1][1][0][k]) > 0.05).length;
  const chipRec = rec.filter(r => r[1][1] != null).map(r => [r[0], r[1][1]]);
  check('a scene arriving: its illustrated lamps wait for the ring and fade one way, never lit first and back', moved > 0 && lampTurns.every(n => !n), { moved, lampTurns });
  await C(async ([id, f]) => { const c = window.__copper; const p = c.data.presets().find(x => x.id === id); if (f == null) delete p.fade; else p.fade = f; await c.data.saveConfig(); }, [target.id, fade0]);
  check('and the chip after the tapped one moves over as its check and its "Arriving" come, never jumps', plain >= 0 && between(chipRec) >= 4 && Math.abs(chipRec[chipRec.length - 1][1] - chipRec[0][1]) > 10, { plain, between: between(chipRec), step: steps(chipRec), n: chipRec.length });
  // a room's level counts to where it is
  await wait(600);
  await record("const n = document.querySelector('[data-rblv]'); return n ? n.textContent : null;", 800);
  await C(ids => window.__copper.turn({ type: 'level', target: ids.map(i => `d:${i}`), level: 20 }), room.ids);
  await wait(900);
  rec = await got();
  const seen = new Set(rec.map(r => r[1]).filter(Boolean));
  check('a room\'s level counts to where it is rather than jumping', seen.size >= 4, [...seen]);
  // a tile switched twice quickly: the newer copy goes under the older, so what it shows goes on showing
  const order = await C(async () => {
    const t = document.querySelector('.room-grid > .tile'); const sel = `.room-grid > .tile[data-go="${t.dataset.go}"]`;
    document.querySelector(`${sel} .pwr`).click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.querySelectorAll(`${sel} > .xf-old`).forEach(x => { x.dataset.first = '1'; });
    document.querySelector(`${sel} .pwr`).click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const k = [...document.querySelectorAll(`${sel} > .xf-old`)];
    return k.map(x => x.dataset.first || '0');
  });
  check('a tile switched twice quickly: its second copy goes under the first', order.length === 2 && order[0] === '0' && order[1] === '1', order);
  await wait(1200);
  if (made.length) await C(async ids => { const c = window.__copper; c.S.config.presets = c.S.config.presets.filter(p => !ids.includes(p.id)); await c.data.saveConfig(); }, made);

  // ---- the sleep timer's sheet grows to its candle and shrinks back, its top moving
  await level(dim, 60); await wait(900);
  await C(async () => { const c = window.__copper; for (const k of Object.keys(c.S.timers || {})) await c.run({ type: 'cancel_timer', target: k.includes('|') ? k.split('|') : k }); });
  await goto(`light/${dim}/timer`, 1300);
  await record("const s = document.querySelector('#sheet-root .sheet'); return s ? s.getBoundingClientRect().top : null;", 800);
  await page.click('.dur[data-m="5"]');
  await wait(1000);
  const grow = await got();
  await record("const s = document.querySelector('#sheet-root .sheet'); return s ? s.getBoundingClientRect().top : null;", 800);
  await page.click('[data-act="timer-cancel"]');
  await wait(1000);
  const shrink = await got();
  const span = r => Math.abs(r[r.length - 1][1] - r[0][1]);
  check('a sheet that grows moves its top there, never in a frame', span(grow) > 60 && steps(grow) < span(grow) * 0.6, { step: steps(grow), span: span(grow) });
  check('and shrinking, the same', span(shrink) > 60 && steps(shrink) < span(shrink) * 0.6, { step: steps(shrink), span: span(shrink) });
  await C(() => window.__copper.closeSheet());
  await goto('home');

  // ---- an unpinned item fades where it was
  const pins0 = await C(() => [...(window.__copper.S.config.favorites || [])]);
  await C(async ids => { const c = window.__copper; for (const id of ids) if (!c.H.isPinned(`d:${id}`)) c.H.togglePin(`d:${id}`); await c.data.saveConfig(); c.render(); }, room.ids);
  await wait(800);
  await page.click('[data-act="pins-edit"]'); await wait(500);
  await page.click(`.pin-grid .pin-x[data-key="d:${room.ids[0]}"]`);
  await wait(60);
  const fading = await C(() => ({ gone: document.querySelectorAll('.pin-grid > .pin-gone').length, items: document.querySelectorAll('.pin-grid > .pin-item').length }));
  check('an unpinned item fades where it was, and is not counted among the items', fading.gone === 1, fading);
  await wait(400);
  check('and is gone after', !(await page.$('.pin-grid > .pin-gone')));
  await C(async favs => { const c = window.__copper; c.ui.pinEdit = false; c.S.config.favorites = favs; await c.data.saveConfig(); c.render(); }, pins0);
  await wait(600);

  // ---- the offline card leaves from the strength it showed
  await C(() => { const c = window.__copper; c.S.agent = { ...c.S.agent, online: false }; c.S.troubleSince = Date.now() - 20000; c.render(); });
  await wait(900);
  const shown = await C(() => { const el = document.querySelector('.offline-card'); let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; });
  const leaving = await C(() => { const c = window.__copper; c.S.agent = { ...c.S.agent, online: true }; c.S.troubleSince = null; c.render(); const g = document.querySelector('body > .offline-card'); const a = g && g.getAnimations()[0]; return a ? Number(a.effect.getKeyframes()[0].opacity) : null; });
  check('the offline card leaves from the strength it showed (the page dims it offline), not a frame brighter', leaving != null && Math.abs(leaving - shown) < 0.02, { shown, leaving });
  await wait(600);

  // put the lights back
  await C(ls => Promise.all(ls.map(([id, v]) => window.__copper.turn({ type: 'level', target: `d:${id}`, level: v || 'off' }))), before);
  await wait(900);
  check('no errors on the page', !errors.length, errors);
  await ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
