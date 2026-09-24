// A room's illustration (web/ui/roomscene.js): a room with no photograph shows a drawn room whose lamps are its own
// lights. On its Rooms card and its page it draws one fixture per light (up to six) of the light's kind; each lamp's
// glow follows its light (off, on, level, colour) and fades on the dimmer rather than jumping; a fan turns while it
// is on; a photograph still wins; and the room still opens from its card without its picture rescaling.
// Needs a colour lamp: run it after hue_test, hue_color_test and nanoleaf_test (the suite's order does).
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|woff2|404|Failed to load resource/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  const root = `http://127.0.0.1:${PORT}/`;
  await page.goto(root + '#rooms');
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S && window.__copper.S.ready, null, { timeout: 15000 });
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  await wait(900);
  const go = async h => { await C(x => { location.hash = x; }, h); await wait(1000); };
  const level = async (id, lv) => { await C(([i, l]) => window.__copper.run({ type: 'level', target: `d:${i}`, level: l }), [id, lv]); };
  // what the illustration inside `sel` says about each of its fixtures
  const fixtures = sel => C(s => [...document.querySelectorAll(`${s} .rs-svg [data-fx]`)].filter(g => !g.dataset.empty).map(g => ({ fx: g.dataset.fx, lamps: g.dataset.lamp.split(' ') })), sel);
  // one lamp's light: the strength its parts rest at, the fades playing on them, and the colour of its lit shade
  const lamp = (sel, id) => C(([s, i]) => {
    const g = [...document.querySelectorAll(`${s} .rs-svg [data-fx]`)].find(x => x.dataset.lamp.split(' ').includes(i));
    if (!g) return null;
    const parts = [...document.querySelectorAll(`${s} .rs-svg [data-l="${g.dataset.i}"]`)];
    const lit = parts.filter(p => p.classList.contains('rl'));
    const stops = parts.filter(p => /Gradient$/.test(p.tagName)).flatMap(p => [...p.querySelectorAll('stop')]);
    const anims = [...lit, ...stops].flatMap(p => p.getAnimations().filter(a => !(a instanceof CSSAnimation)).map(a => ({ props: Object.keys(a.effect.getKeyframes()[0]).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)), dur: a.effect.getTiming().duration, ease: a.effect.getTiming().easing })));
    return { fx: g.dataset.fx, op: Math.max(...lit.map(p => Number(p.style.opacity) || 0)), colour: stops.length ? getComputedStyle(stops[0]).color : null, anims };
  }, [sel, id]);

  // every light's level and colour as the test found them, so it leaves the house as it was for the tests after it
  const was = await C(() => { const c = window.__copper; return c.data.controllable().filter(d => d.domain === 'light' || d.domain === 'switch').map(d => ({ id: d.device_id, level: c.data.level(d.device_id) || 0, color: (c.S.states[d.device_id] || {}).color || null })); });

  // ---- the rooms, and which have lights
  const rooms = await C(() => { const c = window.__copper; return c.data.areas().map(a => ({ id: a.id, name: a.name, lights: c.H.roomLights(a.id).map(d => d.device_id), photo: !!c.H.roomPhotoURL(a.id) })); });
  const withLights = rooms.filter(r => r.lights.length && !r.photo);
  check(withLights.length >= 2, 'rooms with lights and no photograph to draw', withLights.map(r => r.name));

  // ---- Rooms: every card without a photograph is its illustration, one fixture per light (up to six)
  await go('rooms');
  const cards = await C(() => [...document.querySelectorAll('#screen .room-big')].map(el => ({ id: el.dataset.go.slice(5), scene: el.classList.contains('scene'), svg: !!el.querySelector('.room-scene > svg.rs-svg'), veil: !!el.querySelector('.rm-veil, .glow, .room-art, .add-photo') })));
  const plain = cards.filter(k => !rooms.find(r => r.id === k.id).photo);
  check(plain.length && plain.every(k => k.scene && k.svg && !k.veil), 'every card with no photograph shows its illustration, and none of the old fallback', plain);
  for (const r of withLights) {
    const fx = await fixtures(`#screen .room-big[data-go="room/${r.id}"]`);
    const drawn = new Set(fx.flatMap(f => f.lamps));
    check(fx.length === Math.min(r.lights.length, 6) && r.lights.every(id => drawn.has(id)), `${r.name}: one fixture per light, every light drawn`, { lights: r.lights, fx });
  }
  // the card shows the middle 180 of the page's 300 tall picture, at the page's scale
  const band = await C(() => { const el = document.querySelector('#screen .room-big.scene'); const b = el.getBoundingClientRect(), s = el.querySelector('.room-scene').getBoundingClientRect(); return { top: Math.round(s.top - b.top), h: Math.round(s.height), w: Math.round(s.width), cw: Math.round(b.width) }; });
  check(band.top === -60 && band.h === 300 && band.w === band.cw, 'a card holds the 300 tall scene with its middle on the card', band);

  // ---- kinds: a light's kind picks its fixture; a light with no kind gets one by its name or its place in the room
  const big = withLights.slice().sort((a, b) => b.lights.length - a.lights.length)[0];
  const [k1, k2] = big.lights;
  await C(async ([a, b]) => { const c = window.__copper; const s = c.S.config.settings; s.light_kinds = { ...(s.light_kinds || {}), [a]: 'floor-lamp' }; if (b) s.light_kinds[b] = 'ceiling-pendant'; await c.save('', { quiet: true }); }, [k1, k2]);
  await wait(900);
  const kfx = await fixtures(`#screen .room-big[data-go="room/${big.id}"]`);
  const of = id => (kfx.find(f => f.lamps.includes(id)) || {}).fx;
  check(of(k1) === 'floor' && (!k2 || of(k2) === 'pendant'), 'a floor lamp is drawn standing, a pendant hanging', kfx);
  await C(async ([a, b]) => { const c = window.__copper; const s = c.S.config.settings; s.light_kinds[a] = 'wall-sconce'; if (b) s.light_kinds[b] = 'cabinet-tape'; await c.save('', { quiet: true }); }, [k1, k2]);
  await wait(900);
  const kfx2 = await fixtures(`#screen .room-big[data-go="room/${big.id}"]`);
  const of2 = id => (kfx2.find(f => f.lamps.includes(id)) || {}).fx;
  check(of2(k1) === 'sconce' && (!k2 || of2(k2) === 'strip'), 'a sconce on the wall, an under-cabinet light as a strip', kfx2);
  // many lights share: seven lights in a room draw six fixtures between them
  const shared = await C(() => {
    const L = (id, kind) => ({ id, name: 'L' + id, kind, level: 50, kelvin: 2700, hex: null });
    return import('/ui/roomscene.js').then(m => {
      const svg = m.sceneSVG({ id: 'x', name: 'Living room', kind: 'living', lights: ['ceiling-pendant', 'table-lamp', 'table-lamp', 'floor-lamp', 'wall-sconce', 'table-lamp', 'table-lamp'].map((k, i) => L(String(i + 1), k)), fans: [], shades: [] });
      const d = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const g = [...d.querySelectorAll('[data-fx]')];
      return { n: g.length, ids: g.flatMap(x => x.getAttribute('data-lamp').split(' ')).sort(), bytes: svg.length };
    });
  });
  check(shared.n === 6 && shared.ids.length === 7, 'seven lights share six fixtures, none left out', shared);
  await C(async ([a, b]) => { const c = window.__copper; const s = c.S.config.settings; delete s.light_kinds[a]; if (b) delete s.light_kinds[b]; await c.save('', { quiet: true }); }, [k1, k2]);
  await wait(600);

  // ---- a lamp's glow follows its light, and fades on the dimmer (0.4 s EASE_IN_AND_OUT) rather than jumping
  const r0 = withLights[0], id0 = r0.lights[0];
  await go(`room/${r0.id}`);
  const hero = '#screen .room-photo-card';
  check(await C(h => !!document.querySelector(`${h}.scene .room-scene > svg.rs-svg`) && !document.querySelector(`${h} .rp-light`), hero), 'the room page\'s hero is the illustration');
  check((await fixtures(hero)).length === Math.min(r0.lights.length, 6), 'the page draws the same fixtures', await fixtures(hero));
  await level(id0, 0); await wait(1000);
  const off = await lamp(hero, id0);
  check(off && off.op === 0, 'off: the lamp is dark, no glow at all', off);
  await level(id0, 80); await wait(60);
  const rising = await lamp(hero, id0);
  check(rising.anims.some(a => a.props.includes('opacity') && a.dur === 400 && a.ease === 'ease-in-out'), 'on: its glow fades in on the dimmer, 0.4 s EASE_IN_AND_OUT', rising.anims.slice(0, 4));
  await wait(900);
  const on80 = await lamp(hero, id0);
  await level(id0, 15); await wait(1000);
  const on15 = await lamp(hero, id0);
  check(on80.op > 0.5 && on15.op > 0 && on15.op < on80.op, 'its strength follows the level (80% brighter than 15%)', { at80: on80.op, at15: on15.op });
  await level(id0, 0); await wait(1000);

  // a colour lamp shows its colour, and the colour fades too
  const hue = await C(() => { const c = window.__copper; const d = c.data.controllable().find(x => x.color && x.domain === 'light' && c.data.devArea(x)); return d ? { id: d.device_id, aid: c.data.devArea(d) } : null; });
  check(!!hue, 'a colour lamp in a room (hue_test, hue_color_test and nanoleaf_test run first)', hue);
  if (hue) {
    const hadPhoto = await C(a => !!window.__copper.H.roomPhotoURL(a), hue.aid);
    await go(`room/${hue.aid}`);
    await level(hue.id, 70); await wait(900);
    await C(i => window.__copper.run({ type: 'color', target: `d:${i}`, kelvin: 2700 }), hue.id); await wait(1000);
    const warm = await lamp(hero, hue.id);
    await C(i => window.__copper.run({ type: 'color', target: `d:${i}`, hex: '#4C8DFF' }), hue.id); await wait(60);
    const turning = await lamp(hero, hue.id);
    await wait(900);
    const blue = await lamp(hero, hue.id);
    const rgb = s => (String(s).match(/\d+/g) || []).map(Number);
    check(!hadPhoto && blue && rgb(blue.colour)[2] > rgb(blue.colour)[0] && rgb(warm.colour)[0] > rgb(warm.colour)[2], 'a colour lamp glows its own colour (warm white, then blue)', { warm: warm && warm.colour, blue: blue && blue.colour });
    check(turning && turning.anims.some(a => a.props.includes('color') && a.dur === 400), 'and its colour fades from one to the other on the dimmer', turning && turning.anims.slice(0, 4));
    await level(hue.id, 0); await wait(600);
  }

  // ---- a fan turns while it is on, and stops when it is off
  const fan = await C(() => { const c = window.__copper; const d = c.data.controllable().find(x => x.domain === 'fan' && c.data.devArea(x) && !c.H.roomPhotoURL(c.data.devArea(x))); return d ? { id: d.device_id, aid: c.data.devArea(d) } : null; });
  if (fan) {
    await go(`room/${fan.aid}`);
    const spin = () => C(i => { const el = document.querySelector(`#screen .rs-svg [data-fan="${i}"]`); return el ? { on: el.classList.contains('on'), turning: el.getAnimations().some(a => a.playState === 'running') } : null; }, fan.id);
    // the fake bridge refuses fan commands on purpose, so the fan's state is told to it directly (fake-do.json)
    const fanTo = speed => fs.writeFileSync(path.join(process.cwd(), 'fake-do.json'), JSON.stringify({ states: { [fan.id]: { fan_speed: speed, level: speed === 'Off' ? 0 : 50 } } }));
    fanTo('Medium'); await wait(1200);
    const s1 = await spin();
    fanTo('Off'); await wait(1200);
    const s2 = await spin();
    check(s1 && s1.on && s1.turning && s2 && !s2.on && !s2.turning, 'the fan in the picture turns while it is on and is still when off', { on: s1, off: s2 });
  }

  // ---- Home's room cards and the room's setup show it too
  await go('home');
  check(await C(() => document.querySelectorAll('#screen .room-card .room-scene.thumb svg.rs-svg').length > 0), 'Home\'s room cards show the illustration');
  await go(`room/${r0.id}/setup`);
  check(await C(() => !!document.querySelector('#sheet-root .photo-row .ph-scene svg') && /Add a photo/.test(document.querySelector('#sheet-root .photo-row').textContent)), 'room setup shows it beside Add a photo');
  await go(`room/${r0.id}`);

  // ---- a photograph still wins
  await C(async a => {
    const c = window.__copper;
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300;
    const g = cv.getContext('2d'); g.fillStyle = '#6b4a33'; g.fillRect(0, 0, 400, 300);
    const out = await c.data.api(`/api/roomphoto/${encodeURIComponent(a)}`, { method: 'PUT', body: JSON.stringify({ data: cv.toDataURL('image/jpeg', 0.8) }) });
    c.data.appRoom(a).photo = String(out.stamp);
    await c.save('', { quiet: true });
  }, r0.id);
  await wait(1200);
  const withPhoto = await C(() => ({ img: !!document.querySelector('#screen .room-photo-card .room-photo'), scene: !!document.querySelector('#screen .room-photo-card .room-scene') }));
  await go('rooms');
  const cardPhoto = await C(a => { const el = document.querySelector(`#screen .room-big[data-go="room/${a}"]`); return { photo: el.classList.contains('photo'), img: !!el.querySelector('.room-photo'), scene: !!el.querySelector('.room-scene') }; }, r0.id);
  check(withPhoto.img && !withPhoto.scene && cardPhoto.photo && cardPhoto.img && !cardPhoto.scene, 'a photograph wins on the page and the card', { page: withPhoto, card: cardPhoto });
  await C(async a => { const c = window.__copper; await c.data.api(`/api/roomphoto/${encodeURIComponent(a)}`, { method: 'DELETE' }); c.data.appRoom(a).photo = null; await c.save('', { quiet: true }); }, r0.id);
  await wait(900);

  // ---- an illustrated room opens from its card as a photographed one does: the window grows, the picture never
  // rescales and never jumps
  await go('rooms');
  const card = `#screen .room-big[data-go="room/${r0.id}"]`;
  await C(s => document.querySelector(s).scrollIntoView({ block: 'center' }), card); await wait(500);
  const cardBox = await C(s => { const b = document.querySelector(s).getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) }; }, card);
  await C(() => {
    window.__rs = [];
    const tick = () => {
      const h = document.querySelector('#screen .room-photo-card .room-scene');
      if (h) { const b = h.getBoundingClientRect(); window.__rs.push({ w: b.width, h: b.height, cy: b.top + b.height / 2, ghost: !!document.querySelector('.page-ghost'), top: !!document.querySelector('.m10-top') }); }
      if (window.__rs.length < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.click(card); await wait(1600);
  const fr = await C(() => window.__rs);
  const flying = fr.filter(f => f.top);
  const hs = fr.map(f => f.h), ws = fr.map(f => f.w);
  const steps = fr.slice(1).map((f, i) => Math.abs(f.cy - fr[i].cy));
  check(flying.length > 5, 'the illustrated room opens with the room transition (M10)', { frames: fr.length, flying: flying.length });
  check(Math.min(...hs) >= Math.max(...hs) * 0.965 && Math.min(...ws) >= Math.max(...ws) * 0.965, 'its picture never rescales (beyond letting go of the 0.97 press)', { h: [Math.min(...hs), Math.max(...hs)], w: [Math.min(...ws), Math.max(...ws)] });
  check(Math.abs(fr[0].cy - (cardBox.t + cardBox.b) / 2) <= 6 && Math.max(...steps) < 40, 'it starts centred on the card and never jumps', { first: fr[0].cy, card: (cardBox.t + cardBox.b) / 2, most: Math.max(...steps) });
  check((await C(() => location.hash)) === `#room/${r0.id}` && !(await page.$('.page-ghost, .m10-top')), 'and lands on the room with nothing left behind');
  const gradsOk = await C(() => [...document.querySelectorAll('#screen .rs-svg [fill^="url(#"]')].every(e => document.getElementById(e.getAttribute('fill').slice(5, -1))));
  check(gradsOk, 'every gradient the picture uses is there');
  await page.click('#screen .hdr-btn.back'); await wait(1300);
  check((await C(() => location.hash)) === '#rooms', 'and closes back into its card');

  // put every light back as it was
  await C(async w => {
    const c = window.__copper;
    for (const l of w) {
      if (l.color && l.level > 0 && l.color.mode === 'ct' && l.color.kelvin) await c.run({ type: 'color', target: `d:${l.id}`, kelvin: l.color.kelvin });
      if (l.color && l.level > 0 && l.color.mode === 'xy' && l.color.hex) await c.run({ type: 'color', target: `d:${l.id}`, hex: l.color.hex });
      await c.run({ type: 'level', target: `d:${l.id}`, level: l.level || 'off' });
    }
  }, was);
  await wait(800);
  check(!errors.length, 'no errors on the page', errors);
  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
