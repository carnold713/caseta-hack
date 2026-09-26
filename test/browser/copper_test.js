// Copper Night (/ui/): the core flows against the hub and the fake connector, and the screens' geometry against
// numbers read out of the Figma file with read-only use_figma scripts (absoluteBoundingBox against the frame's
// outer edge): 03 Room 12733:20, 04 Light 12731:22, 05 Colour 12732:48591, 05b White 12732:49220, 06b Sleep timer
// 12733:49235, 13 Rooms 12744:38, 17 Fan 12744:111211.
//
// Runs after nanoleaf_test so the Office has a colour lamp. It pins a light, saves a look and moves levels, and
// puts the pins and the scenes back on the way out.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// [what, selector, x, y, w, h] in page coordinates, the frame's top left being the page's (null = not checked)
const ROOM = [
  ['room H1', '.room-title h1', 20, 128, null, 44],
  ['room photo card', '.room-photo-card', 20, 188, 372, 300],
  // the room's On and Off, in the place and size of the file's All on and All off pair, with 52 tall halves
  ['On and Off', '.room-onoff', 32, 412, 348, 64],
  ['On half', '.room-onoff button:first-child', 38, 418, 165, 52],
  ['Off half', '.room-onoff button:nth-child(2)', 209, 418, 165, 52],
  // the room's brightness (Home's 56 tall bar, 16 under the picture, at 504, the full width of the page as Home's is;
  // its level is in the count beside the title) pushes the rest down 72 from the file's
  ['brightness', '.room-bright .hbar', 20, 504, 372, 56],
  ['scene chips', '.room-chips', 0, 504 + 72, null, 40],
  ['first tile', '.room-grid .tile:nth-child(1)', 20, 560 + 72, 180, 150],
  ['second tile', '.room-grid .tile:nth-child(2)', 212, 560 + 72, 180, 150],
  ['header dots', '.hdr .a1', 336, 52, 56, 56],
];
// The light page as the calm-and-flat pass left it: the drawing at the top sized to the kind of light (a bulb, a lamp
// nobody has given a kind, is 72, where the file had 180), resting 14 over the room's name, and the name, the title
// and everything under them 56 higher than the file's 04 Light, the room the smaller drawing gave back.
const LIFT = 56;
// The dial is anchored to the bottom of the screen where the page is shorter than it (screens.css, --sink): its box
// ends 24 above the screen's bottom, the gap a page with no tab bar keeps under it. On this 412 x 915 phone the page
// as drawn ends at 890 - LIFT = 834, so the dial and a fan's speeds sink by the 57 left over, which puts them back
// within a pixel of where the file's 04 Light and 17 Fan have them. Everything over them stays where it was.
const MARGIN = 24, SINK = 915 - MARGIN - (890 - LIFT);
const LIGHT = [
  ['hero art', '.hero-art', 170, 226 - LIFT - 72, 72, 72],
  ['pin', '.hdr .a2', 272, 52, 56, 56],
  ['room line', '.where', null, 240 - LIFT, null, 17],
  ['name', '.t-hero', null, 260 - LIFT, null, 48],
  ['on / off', '.onoff', 20, 326 - LIFT, 372, 72],
  ['on segment', '.onoff button:first-child', 26, 332 - LIFT, 177, 60],
  ['White', '.looks .look:nth-child(1)', 20, 414 - LIFT, 180, 132],
  ['Colour', '.looks .look:nth-child(2)', 212, 414 - LIFT, 180, 132],
  ['White circle', '.looks .look:nth-child(1) .c', 34, 428 - LIFT, 44, 44],
  ['first pill', '.feats .feat:nth-child(1)', 20, 558 - LIFT, 180, 64],
  ['pill circle', '.feats .feat:nth-child(1) .c', 28, 566 - LIFT, 48, 48],
  ['arc', '.dial > svg', 36, 640 - LIFT + SINK, 340, 190],
  ['minus', '.dial .minus', 32, 836 - LIFT + SINK, 48, 48],
  ['plus', '.dial .plus', 332, 836 - LIFT + SINK, 48, 48],
  ['Brightness', '.dial .lbl', null, 718 - LIFT + SINK, null, 17],
];
const ROOMS = [
  ['Rooms H1', '.rooms-head h1', 20, 58, null, 44],
  ['add', '.rooms-head .a1', 336, 52, 56, 56],
  ['All scenes', '.scenes-card', 20, 132, 372, 88],
  ['All scenes circle', '.scenes-card .ib', 36, 148, 56, 56],
  ['first room', '.room-big:nth-of-type(1)', 20, 232, 372, 180],
  ['second room', '.room-big:nth-of-type(2)', 20, 424, 372, 180],
  ['room power', '.room-big:nth-of-type(1) .pwr', 332, 352, 44, 44],
  ['room name', '.room-big:nth-of-type(1) .nm', 40, 340, null, 30],
];
// a fan's page moves up the same 56 under its 80 tall drawing, and its speeds sink to the bottom as the dial does
const FAN = [
  ['hero art', '.hero-art', 166, 226 - LIFT - 40, 80, 80],
  ['on / off', '.onoff', 20, 326 - LIFT, 372, 72],
  ['first pill', '.feats .feat:nth-child(1)', 20, 414 - LIFT, 180, 64],
  ['Off step', '.speeds .step:nth-of-type(1)', 60, 740 - LIFT + SINK, 44, 40],
  ['High step', '.speeds .step:nth-of-type(5)', 308, 612 - LIFT + SINK, 44, 168],
  ['minus', '.speeds .minus', 20, 826 - LIFT + SINK, 56, 56],
  ['plus', '.speeds .plus', 336, 826 - LIFT + SINK, 56, 56],
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const base = `http://127.0.0.1:${PORT}/ui/`;
  const go = async hash => { await page.goto(base + '#' + hash); await page.waitForSelector('#screen > div', { timeout: 10000 }); await wait(900); };
  const C = (fn, arg) => page.evaluate(fn, arg);
  const lv = id => C(id => window.__copper.data.level(id), id);
  // Where a device page's main control (sel) ends, against the screen and against the cards over it, in page
  // coordinates: its box's top and bottom, the bottom of the pills over it, the page's own bottom and how far the
  // document scrolls.
  const anchor = sel => C(s => {
    const y = n => { const b = document.querySelector(n).getBoundingClientRect(); return [Math.round((b.top + scrollY) * 10) / 10, Math.round((b.bottom + scrollY) * 10) / 10]; };
    const [top, bottom] = y(s);
    return { vh: innerHeight, top, bottom, feats: y('#screen .feats')[1], page: y('#screen .dev')[1], scrolls: document.scrollingElement.scrollHeight - innerHeight };
  }, sel);
  // On a short page the control ends MARGIN above the screen's bottom and nothing scrolls; on a tall one it follows
  // the pills over it by the file's gap (a light's pills end at 622 and its dial starts at 640, a fan's end at 478 and
  // its speeds start at 490) and the page, which ends with it, scrolls.
  const anchored = async (what, sel, tall, gap = 18) => {
    await page.setViewportSize({ width: 412, height: 915 }); await wait(300);
    const a = await anchor(sel);
    check(`${what}: on a short page its bottom sits ${MARGIN} above the screen's bottom`, Math.abs(a.bottom - (a.vh - MARGIN)) <= 0.6 && a.page === a.bottom && a.scrolls <= 0, a);
    await C(() => window.__copper.render()); await wait(300);
    const r = await anchor(sel);
    check(`${what}: and a redraw leaves it there`, r.top === a.top && r.bottom === a.bottom, { was: a, now: r });
    await page.setViewportSize({ width: 412, height: tall }); await wait(300);
    const t = await anchor(sel);
    check(`${what}: on a page taller than the screen (${tall}) it follows the content, ${gap} under the pills, and the page scrolls`, Math.abs(t.top - t.feats - gap) <= 0.6 && t.page === t.bottom && t.scrolls > 0 && t.bottom > t.vh - MARGIN, t);
    await page.setViewportSize({ width: 412, height: 915 }); await wait(300);
  };

  await page.goto(base);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(800);
  // every colour below is the day's: from 10 pm the night look deepens the chrome (night.css), so a run in the evening
  // would read its darker blue. The day look is pinned for this test and put back after it.
  const look0 = await C(async () => { const s = window.__copper.S.config.settings; const was = s.night_look ?? null; s.night_look = 'never'; await window.__copper.save('', { quiet: true }); window.__copper.render(); return was; });
  await wait(300);
  // the greeting a home gets once, the first time it connects, would sit over Home: this home has had it
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  // start clean: no look saved by an earlier run, and the stars as they were
  const favs0 = await C(() => window.__copper.S.config.favorites.slice());
  await C(async () => { const c = window.__copper; const n = c.S.config.presets.length; c.S.config.presets = c.S.config.presets.filter(p => !/ · (My look|New scene)/.test(p.name)); if (c.S.config.presets.length !== n) await c.data.saveConfig(); });

  const measure = async (what, list) => {
    const got = await C(L => L.map(([n, s]) => { const e = document.querySelector(s); if (!e) return [n, null]; const r = e.getBoundingClientRect(); return [n, [r.left, r.top + scrollY, r.width, r.height].map(v => Math.round(v * 10) / 10)]; }), list);
    for (let i = 0; i < list.length; i++) {
      const [n, , ...exp] = list[i]; const v = got[i][1];
      if (!v) { check(`${what}: ${n} is there`, false, 'missing'); continue; }
      const off = exp.map((x, j) => (x == null || Math.abs(v[j] - x) <= 0.6 ? null : `${'xywh'[j]} ${v[j]} not ${x}`)).filter(Boolean);
      check(`${what}: ${n} where the file has it`, !off.length, off.join(', '));
    }
  };

  // ---- 13 Rooms
  await go('rooms');
  await measure('13 Rooms', ROOMS);
  check('tab bar shows, Rooms current', await C(() => !document.querySelector('#tabs').hidden && document.querySelector('#tabs [aria-current]').dataset.go === 'rooms'));

  // ---- 04 Light: a colour lamp
  const lamp = await C(() => (window.__copper.data.controllable().find(d => d.color && d.ct) || {}).device_id);
  check('a colour lamp to test with', !!lamp, lamp);
  if (lamp) {
    await go(`light/${lamp}`);
    if (!(await lv(lamp))) { await page.click('[data-act="dev-on"]'); await wait(1500); }
    await measure('04 Light', LIGHT);
    await anchored('a colour lamp\'s dial', '#screen .dial', 700);
    check('no tab bar on a light', await C(() => document.querySelector('#tabs').hidden));

    // ---- 05b White, 05 Colour: sheets over the light, measured from the sheet's own top
    const inSheet = list => C(L => { const sh = document.querySelector('#sheet-root .sheet').getBoundingClientRect(); return L.map(([n, s]) => { const e = document.querySelector(s); if (!e) return [n, null]; const b = e.getBoundingClientRect(); return [n, [b.left, b.top - sh.top, b.width, b.height].map(v => Math.round(v))]; }); }, list);
    const sheetAt = async (what, list) => {
      const got = await inSheet(list);
      for (let i = 0; i < list.length; i++) {
        const [n, , ...exp] = list[i]; const v = got[i][1];
        const off = !v ? ['missing'] : exp.map((x, j) => (x == null || Math.abs(v[j] - x) <= 1 ? null : `${'xywh'[j]} ${v[j]} not ${x}`)).filter(Boolean);
        check(`${what}: ${n} where the file has it`, !off.length, off.join(', '));
      }
    };
    await page.click('.looks .look:nth-child(1)'); await wait(900);
    check('White opens as a sheet at #light/<id>/white', /\/white$/.test(page.url()) && !!(await page.$('#sheet-root .ws')), page.url());
    await sheetAt('05b White', [
      ['overline', '.sheet-head .t-over', 20, 28, null, 14], ['title', '.sheet-head h2', 20, 48, null, 34], ['close', '.sheet-close', 352, 28, 40, 40],
      // v7 (12816:94): the bar is a sky card, the white a sun on a path over it (its drag band is the path, x 24 to 348)
      ['White / Colour', '.seg2', 20, 100, 372, 44], ['value', '.ws-val b', 20, 154, null, 56], ['sky', '.ws-sky', 20, 214, 372, 200], ['warmth path', '.ws-track', 44, 214, 324, 200],
      // the sky's two end labels are gone (the named whites under it say the ends): the whites sit 10 under the sky
      ['sun', '.ws-thumb .disc', null, null, 28, 28], ['named whites', '.ws-chips', 20, 424, null, 40], ['Follow the day', '.ws-follow', 20, 480, null, null],
    ]);
    const tr = await page.locator('.ws-track').boundingBox();
    const at = k => tr.x + tr.width * (1e6 / 1900 - 1e6 / k) / (1e6 / 1900 - 1e6 / 6500);
    check('the bar is in mireds: 2700K sits at 41.9%', Math.abs((at(2700) - tr.x) / tr.width - 0.419) < 0.002);
    await page.mouse.move(at(3000), tr.y + 20); await page.mouse.down(); await page.mouse.move(at(4000), tr.y + 20, { steps: 6 }); await page.mouse.up(); await wait(1500);
    const k = await C(id => (window.__copper.S.states[id].color || {}).kelvin, lamp);
    check('dragging the bar to 4000K sets it', k >= 3900 && k <= 4100, k);
    await page.click('.ws-chips .chip:nth-child(2)'); await wait(1400);
    check('Warm sets 2700K and turns copper', (await C(id => (window.__copper.S.states[id].color || {}).kelvin, lamp)) === 2700 && (await page.textContent('.ws-chips .chip.current')) === 'Warm');
    // the swap plays M16 (the wheel opens out of its handle, the rows rise in), about 1.3 s: measure once it has landed
    await page.click('.seg2 button:nth-of-type(2)'); await wait(1500);
    check('the segmented control swaps to Colour in place', /\/colour$/.test(page.url()) && !!(await page.$('#sheet-root .wheel')), page.url());
    await sheetAt('05 Colour', [['wheel', '.wheel', 76, 164, 260, 260], ['value row', '.cs-val', 20, 448, 372, 28], ['first swatch', '.cs-sw .sw:first-child', 24, 506, 32, 32]]);
    await page.click('.cs-sw .sw[data-hex="#4C8DFF"]'); await wait(1400);
    check('a swatch sets the colour and names it', String(await C(id => (window.__copper.S.states[id].color || {}).hex, lamp)).toUpperCase() === '#4C8DFF' && (await page.textContent('[data-cval] b')) === 'Blue');
    const wh = await page.locator('.wheel').boundingBox();
    await page.mouse.move(wh.x + 230, wh.y + 130); await page.mouse.down(); await page.mouse.move(wh.x + 240, wh.y + 131, { steps: 3 }); await page.mouse.up(); await wait(1400);
    const red = await C(id => (window.__copper.S.states[id].color || {}).hex, lamp);
    check('three o’clock on the wheel is red', /^#ff[0-3]/i.test(red), red);
    await page.click('.sheet-close'); await wait(800);
    check('closing goes back to the light', /#light\/[^/]+$/.test(page.url()) && !(await page.$('#sheet-root .sheet')), page.url());

    // ---- 06b Sleep timer
    await page.click('.feats .feat:last-child'); await wait(900);
    await sheetAt('06b Sleep timer', [['first duration', '.dur:first-child', 20, 98, 68, 64], ['Custom', '.dur.more', 324, 98, 68, 64]]);
    await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
    await page.click('.dur[data-m="15"]'); await wait(1600);
    // the candle is the answer: no toast (the owner's rule, 2ca8d0a: a toast whose only job is Undo is not shown)
    const set15 = await C(id => { const c = window.__copper; const t = Object.entries(c.S.timers || {}).find(([k]) => c.data.targetDevices(k.includes('|') ? k.split('|') : k).includes(id)); return { ring: !!document.querySelector('.ts-run'), minutes: t ? Number(t[1].minutes) : null, toast: document.querySelector('#toast-root').textContent }; }, lamp);
    check('15 min starts a timer on the hub and the ring shows, with no toast', set15.ring && set15.minutes === 15 && !set15.toast, set15);
    // v7 (12817:49023): running, the sheet is a candle on a stage, the time left under it
    await sheetAt('06b running', [['candle stage', '.ts-run .tc-stage', 20, 98, 372, 300], ['time left', '.tc-left', 20, 418, 372, 44]]);
    check('the candle says the time left', (await page.textContent('[data-left]')) === '15 min left', await page.textContent('[data-left]'));
    // it still counts down while the sheet is up: the candle burns a little shorter every second
    const burnt = () => C(() => Number(document.querySelector('.tc-stage').style.getPropertyValue('--f')));
    const f1 = await burnt(); await wait(2100);
    check('the countdown ticks: the candle burns down', (await burnt()) < f1, { before: f1, after: await burnt() });
    await page.click('[data-act="timer-cancel"]'); await wait(1400);
    check('Stop timer stops it', !(await page.$('.ts-run')));
    await page.click('#sheet-root .scrim', { position: { x: 200, y: 40 } }); await wait(700);
    check('the scrim closes it', !/\/timer$/.test(page.url()));
  }

  // ---- behaviour on a Caseta dimmer (5, Kitchen Cans)
  await go('light/5');
  check('a dimmer has no White or Colour', !(await page.$('.looks')));
  check('and its pills close up under the switch', await C(() => Math.round(document.querySelector('.feats').getBoundingClientRect().top)) === 414 - LIFT);
  // a dimmer's page as drawn ends 144 higher still (690), so it is short on most phones: a 660 tall screen is shorter
  await anchored('a dimmer\'s dial', '#screen .dial', 660);
  const pinned0 = await C(() => window.__copper.S.config.favorites.includes('d:5'));
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  await page.click('[data-act="pin"]'); await wait(1200);
  check('the pin saves', await C(w => window.__copper.S.config.favorites.includes('d:5') !== w, pinned0));
  check('and shows no toast, no Undo (the pin itself is the answer)', !(await C(() => document.querySelector('#toast-root').textContent)), await C(() => document.querySelector('#toast-root').textContent));
  if (pinned0) { await page.click('[data-act="pin"]'); await wait(1200); }
  const svg = await page.locator('.dial > svg').boundingBox();
  const s = svg.width / 340; const pt = p => { const a = Math.PI * (1 - p / 100); return [svg.x + (170 + 150 * Math.cos(a)) * s, svg.y + (170 - 150 * Math.sin(a)) * s]; };
  // the knob is the grip (a finger anywhere else on the arc only moves it sideways, so a scroll stays a scroll)
  const from = await lv('5');
  await page.mouse.move(...pt(from)); await page.mouse.down();
  for (let p = from + (80 > from ? 5 : -5); 80 > from ? p <= 80 : p >= 80; p += 80 > from ? 5 : -5) { await page.mouse.move(...pt(p)); await wait(50); }
  await page.mouse.move(...pt(80)); await wait(50);
  await page.mouse.up(); await wait(1500);
  const v = await lv('5');
  check('dragging the arc to 80 sets 80', v >= 78 && v <= 82, v);
  check('the numeral says it', (await page.textContent('.dial .num b')) === String(v), await page.textContent('.dial .num b'));
  await page.click('.dial .plus'); await wait(1200);
  check('plus is 5 brighter', (await lv('5')) === Math.min(100, v + 5), await lv('5'));
  await page.click('[data-act="dev-off"]'); await wait(1400);
  check('Off turns it off', (await lv('5')) === 0, await lv('5'));
  await page.click('[data-act="dev-on"]'); await wait(1400);
  check('On turns it on', (await lv('5')) > 0, await lv('5'));
  await page.evaluate(() => { location.hash = 'nowhere'; }); await wait(700);
  check('an address with no page says so and offers Home and the classic app', !!(await page.$('.soon-page [data-go="home"]')) && !!(await page.$('.soon-page a[href="/classic/"]')));
  await page.click('[data-act="back"]'); await wait(800);
  check('back returns to the light', /#light\/5$/.test(page.url()), page.url());

  // ---- Home: the Pinned grid, a tile's power circle
  await go('home');
  check('the Pinned grid shows the pinned light', !!(await page.$('.pin-grid .tile[data-go="light/5"]')));
  const was = await lv('5');
  await page.click('.tile[data-go="light/5"] .pwr'); await wait(1400);
  check('the power circle toggles in place', /#home$/.test(page.url()) && ((await lv('5')) > 0) !== (was > 0), [page.url(), await lv('5')]);
  await page.click('.tile[data-go="light/5"] .nm'); await wait(700);
  check('the tile opens the light', /#light\/5$/.test(page.url()), page.url());

  // ---- 03 Room: the Kitchen
  await go('room/20');
  await page.click('[data-act="room-on"]'); await wait(1600);
  check('On turns on every light in the room', (await C(() => window.__copper.H.roomLights('20').every(d => window.__copper.data.level(d.device_id) > 0))));
  const pill = async () => C(() => { const o = document.querySelector('.room-onoff'); return { on: o.querySelector('[data-act="room-on"]').getAttribute('aria-pressed'), off: o.querySelector('.onoff-pill').classList.contains('off'), word: o.querySelector('[data-act="room-on"]').textContent.trim(), count: document.querySelector('.room-title .count').textContent.trim() }; });
  const lit = await pill();
  // how much is on, and how bright, is said once, beside the title, as the Rooms card says it; the pill says just On
  check('the pill sits under On, the pill says On and the count beside the title says how many are on and how bright', lit.on === 'true' && !lit.off && /^\d+ on · \d+%$/.test(lit.count) && lit.word === 'On', lit);
  await measure('03 Room', ROOM);
  // a lit tile is a flat fill of its light, with no glow in its corner and no coloured shadow
  const tiles = await C(() => [...document.querySelectorAll('.room-grid .tile.on')].map(t => { const cs = getComputedStyle(t); return { img: cs.backgroundImage, col: cs.backgroundColor, tinted: t.classList.contains('tinted'), glow: !!t.querySelector('.glow'), sh: cs.boxShadow }; }));
  check('lit tiles are flat fills (copper for a white light), no corner glow, no coloured shadow', tiles.length && tiles.every(t => t.img === 'none' && !t.glow && !/217, 138, 78|0px 10px/.test(t.sh) && (t.tinted || t.col === 'rgb(217, 138, 78)')), tiles);
  // New scene is the one way to make a scene on a room's page: it keeps the room as it is and opens its editor
  check('there is no second way to keep the look: no Save this look beside New scene', !(await page.$('[data-act="save-look"]')) && !!(await page.$('[data-act="room-scene-new"]')));
  const n0 = await C(() => window.__copper.data.presets().length);
  await page.click('[data-act="room-scene-new"]'); await wait(1400);
  check('New scene makes a scene and opens it over the room', (await C(() => window.__copper.data.presets().length)) === n0 + 1 && /#room\/20\/scene\//.test(page.url()), page.url());
  await page.click('#sheet-root .sheet-close'); await wait(900);
  check('closing it is the room again', /#room\/20$/.test(page.url()) && !(await page.$('#sheet-root .sheet')), page.url());
  check('and it is the room as it was, so it is the current one, in copper', /^New scene/.test((await page.textContent('.chip.current').catch(() => '')).trim()), await page.textContent('.chip.current').catch(() => ''));
  await page.click('[data-act="room-off"]'); await wait(1600);
  check('Off turns off every light in the room', (await C(() => window.__copper.H.roomLights('20').every(d => !window.__copper.data.level(d.device_id)))));
  const dark = await pill();
  check('and the pill is under Off, with On just saying On', dark.on === 'false' && dark.off && dark.word === 'On', dark);
  check('nothing current once it changes', !(await page.$('.chip.current')));
  await page.click('.chip[data-t^="p:"]'); await wait(1600);
  check('the saved look runs', (await C(() => window.__copper.H.roomLights('20').every(d => window.__copper.data.level(d.device_id) > 0))));

  // ---- 17 Fan
  await go('light/8');
  await measure('17 Fan', FAN);
  // one pill, the sleep timer: a Goodnight pill that did nothing when tapped is gone, as a light's page has none
  check('a fan\'s only pill is its sleep timer, with no Goodnight pill beside it', await C(() => { const f = [...document.querySelectorAll('#screen .feats .feat')]; return f.length === 1 && f[0].dataset.go.endsWith('/timer') && !/Goodnight/.test(document.querySelector('#screen .dev').textContent); }));
  await anchored('a fan\'s speeds', '#screen .speeds', 700, 12);
  await page.click('[data-speed="High"]'); await wait(800);
  check('a speed bar sets the fan', (await page.textContent('.speeds .big')) === 'High', await page.textContent('.speeds .big'));
  // flat bars: the chosen speed and those under it a flat blue, the rest the surface grey, no gradient and no glow
  const bars = await C(() => [...document.querySelectorAll('.speeds .step')].map(b => { const cs = getComputedStyle(b); return [cs.backgroundImage, cs.backgroundColor, cs.boxShadow]; }));
  check('the speed bars are flat: blue up to the speed, grey past it, no gradient, no glow', bars.length === 5 && bars.every(([img, , sh]) => img === 'none' && sh === 'none') && bars.every(([, col]) => col === 'rgb(0, 109, 204)'), bars);
  await page.click('.speeds .minus'); await wait(800);
  check('minus steps down', (await page.textContent('.speeds .big')) === 'Medium high', await page.textContent('.speeds .big'));

  // ---- 18 Shade (none on the rig: one put on the page for this, as layout_rooms_test does). Its window and its
  // buttons sink together, the buttons ending 6 above where the page ends, as a light's do. Nothing under them says
  // what Goodnight does: that is Goodnight's to say, not every shade's.
  await C(() => { const c = window.__copper, S = c.S, a = c.data.areas()[0]; S.inv.devices.cu_shade = { device_id: 'cu_shade', name: 'Shade', type: 'SerenaRollerShade', domain: 'cover', area: a && a.id, zone: 'cus' }; S.states.cu_shade = { level: 40 }; location.hash = 'light/cu_shade'; });
  await wait(900);
  const sh = await C(() => { const y = s => Math.round(document.querySelector('#screen ' + s).getBoundingClientRect().bottom + scrollY); return { vh: innerHeight, btns: y('.shade-btns .sbtn'), win: Math.round(document.querySelector('#screen .window').getBoundingClientRect().top + scrollY), name: y('.t-hero'), gn: !!document.querySelector('#screen .shade-gn'), page: Math.round(document.querySelector('#screen .dev').getBoundingClientRect().height) }; });
  check('a shade\'s buttons end 6 over the page\'s end, the page filling the screen, and its window sinks with them', sh.btns === sh.vh - MARGIN - 6 && sh.win - sh.btns === 336 - 755 && sh.name === 308 - LIFT && sh.page === sh.vh - MARGIN, sh);
  check('and no Goodnight row under them', !sh.gn, sh);
  await C(() => { const S = window.__copper.S; delete S.inv.devices.cu_shade; delete S.states.cu_shade; });

  // ---- the house
  await go('home');
  // the house comes on by a hold, never a tap: a tap only says to hold it
  const onPill = '[data-hold="house-on"]';
  const lit0 = await C(() => window.__copper.H.litLights().length);
  await page.click(onPill); await wait(900);
  check('a tap on the house-on pill turns nothing on', (await C(() => window.__copper.H.litLights().length)) === lit0);
  check('and its own label says Hold for a moment', (await page.textContent(onPill)).trim() === 'Hold', await page.textContent(onPill));
  await wait(2700);
  check('then goes back to what it does', (await page.textContent(onPill)).trim() !== 'Hold', await page.textContent(onPill));
  const pb = await page.locator(onPill).boundingBox();
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.mouse.down(); await wait(800); await page.mouse.up(); await wait(1600);
  check('held, the house comes on', (await C(() => window.__copper.H.litLights().length)) > 0);
  check('the pill says All on while anything is', (await page.textContent(onPill)).trim() === 'All on', await page.textContent(onPill));
  check('and neither pill is copper at rest: the headline says what is on', await C(s => getComputedStyle(document.querySelector(s)).backgroundColor === 'rgba(0, 0, 0, 0)' && !!document.querySelector('.house-pills .pill.solid[data-act="house-off"]'), onPill));
  check('nothing under the bar explains it: the headline and the bar say what is on', !(await page.$('.house-cap')));
  const bar = await page.locator('.hbar').boundingBox();
  await page.mouse.move(bar.x + bar.width * 0.6, bar.y + 28); await page.mouse.down();
  await page.mouse.move(bar.x + bar.width * 0.3, bar.y + 28, { steps: 6 }); await page.mouse.up(); await wait(1600);
  const hl = await C(() => window.__copper.H.houseLevel());
  // the knob stays under the finger: it sits 28 inside the fill's end, so the level is where the finger is plus 28
  const want = Math.round((bar.width * 0.3 + 28) / bar.width * 100);
  check('the house bar moves what is on, the knob under the finger', Math.abs(hl - want) <= 3, { hl, want });
  const hold = await page.locator('[data-hold="goodnight"]').boundingBox();
  await page.mouse.move(hold.x + 22, hold.y + 22); await page.mouse.down(); await wait(400); await page.mouse.up(); await wait(900);
  check('a short press of Goodnight does nothing', (await C(() => window.__copper.H.litLights().length)) > 0);
  await page.mouse.down(); await wait(1250); await page.mouse.up(); await wait(1600);
  check('held for a second, everything goes off', (await C(() => window.__copper.H.litLights().length)) === 0);

  // put back what this test changed
  await C(async favs => { const c = window.__copper; c.S.config.favorites = favs; c.S.config.presets = c.S.config.presets.filter(p => !/ · (My look|New scene)/.test(p.name)); await c.data.saveConfig(); }, favs0);
  await C(async was => { const s = window.__copper.S.config.settings; if (was == null) delete s.night_look; else s.night_look = was; await window.__copper.save('', { quiet: true }); }, look0);
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
