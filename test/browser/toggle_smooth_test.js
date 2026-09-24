// A light switched from the app lands once, smoothly, and stays landed while the bridge reports its way there.
//
// The owner's words: "when i toggle things on/off, in the app, there is a lot of like quick flashes as it figured out
// which light is on". A real home does not answer a command with its new state once. A Lutron dimmer reports the
// level it was at, then the levels it fades through, then the new one; a Hue lamp is said at its new level by the
// connector and again by its event stream, sometimes at its old brightness first; a room or the house arrives a light
// at a time. The plain fake connector answers with the final state at once, which is why none of that ever showed
// here. This test puts the fake on the bridge's own pace ({"echo": "bridge"} in fake-do.json) and switches lights from
// every place a person can, reading each tile, room card and pill on every frame: each one's lit state must change
// exactly once, each light's shown level must go straight from where it was to where it lands, and nothing may be
// left on the page but the new state. Then the bridge's last word: a light that does not change goes back once, after
// its fade, and a light changed at the wall shows at once even while another is held.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
// the fake connector reads this file from its data directory, which is this run's working directory
const DO_FILE = path.join(process.env.DATA_DIR || process.cwd(), 'fake-do.json');
let bad = 0;
const check = (what, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS ' : 'FAIL ') + what + (got === undefined ? '' : ` | ${JSON.stringify(got)}`)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const tell = async o => { fs.writeFileSync(DO_FILE, JSON.stringify(o)); for (let i = 0; i < 20 && fs.existsSync(DO_FILE); i++) await wait(100); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready && window.__copper.S.config, null, { timeout: 15000 });
  await wait(1200);
  const C = (fn, arg) => page.evaluate(fn, arg);

  // A room with two or more lamps, and one Lutron dimmer in it. What this test pins and the scene it makes are taken
  // away again at the end.
  const setup = await C(async () => {
    const c = window.__copper;
    const lamp = d => d.domain === 'light' || d.domain === 'switch';
    const room = c.data.areas().find(a => c.H.roomLights(a.id).filter(lamp).length >= 2 && c.H.roomLights(a.id).some(d => d.domain === 'light' && !/^(hue_|nanoleaf_)/.test(d.device_id)));
    if (!room) return null;
    const ids = c.H.roomLights(room.id).filter(lamp).map(d => d.device_id);
    const dim = ids.find(id => c.data.dev(id).domain === 'light' && !/^(hue_|nanoleaf_)/.test(id));
    const was = { favorites: [...(c.S.config.favorites || [])], default_fade: c.S.config.settings.default_fade };
    c.S.config.settings.default_fade = 0.5;
    c.S.config.favorites = [...new Set([...(c.S.config.favorites || []), `d:${dim}`, `a:${room.id}`, 'p:smoothscene'])];
    c.S.config.presets = (c.S.config.presets || []).filter(p => p.id !== 'smoothscene');
    c.S.config.presets.push({ id: 'smoothscene', name: 'Smooth test', area: room.id, levels: Object.fromEntries(ids.map((id, i) => [id, i === 0 ? 80 : 30])), fade: 1 });
    await c.save('', { quiet: true });
    const house = c.data.controllable().filter(lamp).map(d => d.device_id);
    const switches = ids.filter(id => c.data.dev(id).domain === 'switch');
    return { aid: room.id, ids, dim, was, house, switches };
  });
  check('a room with two lamps and a Lutron dimmer to switch', !!setup, setup);
  if (!setup) { await browser.close(); process.exit(1); }
  const { aid, ids, dim, house, switches } = setup;
  // where the scene puts each light: a switch is on at whatever level it reports
  const inScene = (id, v) => v === (id === ids[0] ? 80 : 30) || (switches.includes(id) && v > 0);
  await tell({ echo: 'bridge', stuck: [] });

  // Levels set straight through the layer (not a tap), then left to settle at the bridge's pace.
  const setLevels = async lv => { await C(async lv => { for (const [id, v] of Object.entries(lv)) await window.__copper.data.run({ type: 'level', target: `d:${id}`, level: v }); }, lv); await wait(2400); };
  const allTo = v => Object.fromEntries(ids.map(id => [id, v]));
  const go = async hash => { await C(h => { location.hash = h; }, hash); await wait(1000); };

  // Every frame for `ms`: each tile's, room card's and pill's lit state, each light's shown level, and the most fading
  // copies any one tile has at once (a second is a crossfade started over before the first had finished).
  const record = (ms) => C(async ({ ms, ids }) => {
    const c = window.__copper;
    const SEL = '#screen .tile, #screen .room-big, #screen .pin-room, #screen .card.house, #screen .dev, #screen .onoff-pill';
    const key = el => (el.getAttribute('data-go') ? `${el.classList[0]} ${el.getAttribute('data-go')}` : el.classList[0] + (el.classList.contains('house') ? ' house' : ''));
    const lit = el => (el.matches('.onoff-pill') ? !el.classList.contains('off') : /\b(on|lit)\b/.test(el.className));
    const seen = {}, levels = {};
    let copies = 0;
    const t0 = performance.now();
    await new Promise(res => {
      const tick = () => {
        for (const el of document.querySelectorAll(SEL)) {
          if (el.closest('.xf-old, .page-ghost')) continue;
          const k = key(el), l = lit(el), a = (seen[k] = seen[k] || []);
          if (a[a.length - 1] !== l) a.push(l);
        }
        for (const id of ids) { const v = c.data.level(id), a = (levels[id] = levels[id] || []); if (a[a.length - 1] !== v) a.push(v); }
        for (const el of document.querySelectorAll('#screen .tile')) copies = Math.max(copies, el.querySelectorAll(':scope > .xf-old').length);
        if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    return { seen, levels, copies };
  }, { ms, ids });

  // One toggle: every element changes its lit state at most once, the ones named in `must` exactly once, and each
  // light's shown level goes straight from where it was to where it lands.
  const toggle = async (name, act, must, want) => {
    const rec = record(2600);
    await wait(50);
    await act();
    const r = await rec;
    const flips = Object.fromEntries(Object.entries(r.seen).map(([k, a]) => [k, a.length - 1]));
    const twice = Object.entries(flips).filter(([, n]) => n > 1);
    const missing = must.filter(m => !Object.keys(flips).some(k => k.includes(m) && flips[k] === 1));
    check(`${name}: nothing flips more than once, and ${must.join(', ')} change once`, !twice.length && !missing.length, { twice, missing, flips });
    const stepped = Object.entries(r.levels).filter(([, a]) => a.length > 2);
    check(`${name}: each light's level goes straight to where it lands`, !stepped.length, r.levels);
    if (want != null) {
      const at = await C(ids => ids.map(id => window.__copper.data.level(id)), ids);
      check(`${name}: and lands where the bridge has it`, at.every((v, i) => (typeof want === 'function' ? want(ids[i], v) : v === want)), at);
    }
    check(`${name}: no crossfade stacked over another on a tile`, r.copies <= 1, r.copies);
  };
  const click = sel => () => page.click(sel);
  const tile = `.tile[data-go="light/${dim}"]`;
  const isDim = id => id === dim;

  // a light tile's power circle, in its room
  await setLevels(allTo(0)); await go(`room/${aid}`);
  await toggle('room tile on', click(`#screen ${tile} .pwr`), [`light/${dim}`], (id, v) => (isDim(id) ? v > 0 : v === 0));
  await toggle('room tile off', click(`#screen ${tile} .pwr`), [`light/${dim}`], 0);
  // the room page's On and Off
  await toggle('room page On', click('#screen [data-act="room-on"]'), ['onoff-pill', ...ids.map(id => `light/${id}`)], (id, v) => v > 0);
  await toggle('room page Off', click('#screen [data-act="room-off"]'), ['onoff-pill', ...ids.map(id => `light/${id}`)], 0);
  // a scene chip on the room page
  await toggle('room scene chip', click('#screen [data-act="scene"][data-t="p:smoothscene"]'), ['onoff-pill', ...ids.map(id => `light/${id}`)], inScene);
  // a room card's power circle on Rooms
  await setLevels(allTo(0)); await go('rooms');
  await toggle('Rooms card on', click(`#screen .room-big[data-go="room/${aid}"] .pwr`), [`room/${aid}`], (id, v) => v > 0);
  await toggle('Rooms card off', click(`#screen .room-big[data-go="room/${aid}"] .pwr`), [`room/${aid}`], 0);
  // pinned on Home: the room's power circle and the light's tile, with the rest of the house dark
  await setLevels(Object.fromEntries(house.map(id => [id, 0]))); await go('home');
  await toggle('Home pinned room on', click(`#screen .pin-room[data-go="room/${aid}"] .pwr`), [`room/${aid}`, `light/${dim}`, 'house'], (id, v) => v > 0);
  await toggle('Home pinned room off', click(`#screen .pin-room[data-go="room/${aid}"] .pwr`), [`room/${aid}`, `light/${dim}`], 0);
  await toggle('Home pinned tile on', click(`#screen .pin-grid ${tile} .pwr`), [`light/${dim}`, `room/${aid}`], (id, v) => (isDim(id) ? v > 0 : v === 0));
  await toggle('Home pinned tile off', click(`#screen .pin-grid ${tile} .pwr`), [`light/${dim}`, `room/${aid}`], 0);
  // Home's All off, with the room lit
  await setLevels(allTo(60));
  await toggle('Home All off', click('#screen [data-act="house-off"]'), ['house', `room/${aid}`, `light/${dim}`], 0);
  // a scene chip pinned on Home
  await toggle('Home scene chip', click('#screen .chip-row [data-act="scene"][data-t="p:smoothscene"]'), [`room/${aid}`, `light/${dim}`], inScene);
  // a light's own page
  await setLevels(allTo(0)); await go(`light/${dim}`);
  await toggle('light page On', click('#screen [data-act="dev-on"]'), ['dev', 'onoff-pill'], (id, v) => (isDim(id) ? v > 0 : v === 0));
  await toggle('light page Off', click('#screen [data-act="dev-off"]'), ['dev', 'onoff-pill'], 0);

  // The bridge's last word. A light that does not change is shown as it is once its fade should be over: one change
  // to on at the tap, and one back to off, not before the fade and not much after it.
  await go(`room/${aid}`);
  await tell({ stuck: [dim] });
  const t = C(async ({ sel, ms }) => {
    const out = []; let last = null; const t0 = performance.now();
    await new Promise(res => { const tick = () => { const el = document.querySelector(sel); const on = !!el && el.classList.contains('on'); if (on !== last) { out.push([Math.round(performance.now() - t0), on]); last = on; } if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    return out;
  }, { sel: `#screen ${tile}`, ms: 3500 });
  await wait(50);
  await page.click(`#screen ${tile} .pwr`);
  const seq = await t;
  const back = seq.find(([, on], i) => i > 1 && !on);
  check('a light that does not come on: shown on at the tap, then off once, after its fade', seq.length === 3 && seq[1][1] && back && back[0] > 900 && back[0] < 3000, seq);
  await tell({ stuck: [] });
  await wait(600);

  // A light changed at the wall while another is held shows at once; so does the held one, changed at the wall once
  // it has landed.
  await setLevels({ ...allTo(0), [ids.find(id => id !== dim)]: 40 });
  const other = ids.find(id => id !== dim);
  await page.click(`#screen ${tile} .pwr`);
  await wait(120);
  const t1 = Date.now();
  await tell({ states: { [other]: { level: 75 } } });
  await page.waitForFunction(id => window.__copper.data.level(id) === 75, other, { timeout: 3000 }).catch(() => {});
  const shown = await C(id => window.__copper.data.level(id), other);
  check('a light changed at the wall while another is held shows at once', shown === 75 && Date.now() - t1 < 1200, { shown, ms: Date.now() - t1 });
  await wait(2200);
  await tell({ states: { [dim]: { level: 20 } } });
  await page.waitForFunction(id => window.__copper.data.level(id) === 20, dim, { timeout: 3000 }).catch(() => {});
  check('and the light this phone switched, changed at the wall once it has landed, shows that too', (await C(id => window.__copper.data.level(id), dim)) === 20);

  // put the rig back the way it was found
  await tell({ echo: 'plain', stuck: [] });
  await setLevels(allTo(0));
  await C(async was => {
    const c = window.__copper;
    c.S.config.favorites = was.favorites;
    c.S.config.settings.default_fade = was.default_fade;
    c.S.config.presets = (c.S.config.presets || []).filter(p => p.id !== 'smoothscene');
    await c.save('', { quiet: true });
  }, setup.was);
  check('no errors on the page', !errors.length, errors);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(async e => { console.error('FAILED', e.message); try { fs.writeFileSync(DO_FILE, JSON.stringify({ echo: 'plain', stuck: [] })); } catch (_) { /* fine */ } process.exit(1); });
