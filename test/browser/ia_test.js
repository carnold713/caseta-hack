// docs/ia-v5.md stages 1 to 6, measured. Four tabs, Home at rest, the pill's geometry and its hide rules, the
// sheet's detents and spacing, a scene one tap from Home, every room page and room setup page reachable, Colour as
// one row on the light page, sheets that push instead of growing, and Settings on one screen.
// PORT=4485 node ia_test.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const PORT = process.env.PORT || 4400; const BASE = `http://127.0.0.1:${PORT}`;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };

const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
// what the plan counts as a control at rest
const CTRL = `button:not([disabled]), [role="button"], input, select, a[href], summary, label.item, .chip, .mood, .sw, .tile, .swatch, .rbtn, .pk`;
const PLAN_HOME_CONTROLS = 19;   // docs/ia-v5.md 3: Home at rest, five rooms and three scenes

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they share
  // the one token run.js logged in with. open() below seeds each context with it; without the runner
  // the first #pw fills it in and the rest of the sizes reuse it.
  let token = process.env.APP_TOKEN || null;
  const open = async size => {
    const ctx = await browser.newContext({ ...SIZES[size], timezoneId: 'America/Los_Angeles' });
    if (token) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, token);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${size}] pageerror: ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/net::ERR|favicon|sw\.js/.test(m.text())) errors.push(`[${size}] console: ` + m.text()); });
    await page.goto(BASE + '/classic/'); await page.waitForTimeout(500);
    if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
    await page.waitForSelector('.room', { timeout: 15000 }); await page.waitForTimeout(1200);
    if (!token) token = await page.evaluate(() => localStorage.getItem('token'));
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); S.view = 'home'; S.room = null; S.roomPage = null; S.scenesEdit = false; location.hash = 'home'; window.scrollTo(0, 0); render(); });
    await page.waitForTimeout(500);
    return { ctx, page };
  };
  const wait = (page, ms) => page.waitForTimeout(ms);
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const controls = page => page.evaluate(sel => {
    const els = [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.closest('#splash') && !e.closest('#sheet-root') && !e.closest('#nav') && !e.closest('#nowbar') && !e.closest('#toast'); });
    const set = new Set(els);
    return els.filter(e => { let p = e.parentElement; while (p) { if (set.has(p)) return false; p = p.parentElement; } return true; }).length;
  }, CTRL);
  const sheetGeom = page => page.evaluate(() => {
    const r = document.querySelector('#sheet-root.in .sheet'); if (!r) return null;
    const rect = r.getBoundingClientRect(); const q = s => r.querySelector(s); const rc = el => el ? el.getBoundingClientRect() : null;
    const sh = q('.sh'), sb = q('.sb'), foot = q('.sfoot'), h2 = q('.sh h2'), sub = q('.sh .sub'), grab = q('.grab');
    const gb = grab ? getComputedStyle(grab, '::before') : null;
    const lastHeaderLine = sub || h2;
    const first = sb ? [...sb.children].find(c => c.getBoundingClientRect().height) : null;
    return {
      h: Math.round(rect.height), dvh: +(rect.height / window.innerHeight * 100).toFixed(1),
      detent: (r.className.match(/dt-(compact|medium|large)/) || [, ''])[1],
      grabZone: grab ? Math.round(rc(grab).height) : null,
      grabber: gb ? { w: Math.round(parseFloat(gb.width)), h: Math.round(parseFloat(gb.height)), top: Math.round(parseFloat(gb.top)) } : null,
      capped: !!q('.sh .stepcap'),
      titleTop: h2 ? Math.round(rc(h2).top - rect.top) : null,
      firstLineTop: (() => { const e = q('.sh .stepcap') || h2; return e ? Math.round(rc(e).top - rect.top) : null; })(),
      shPadBottom: sh ? Math.round(parseFloat(getComputedStyle(sh).paddingBottom)) : null,
      sbPadTop: sb ? Math.round(parseFloat(getComputedStyle(sb).paddingTop)) : null,
      headerGap: (lastHeaderLine && first) ? Math.round(rc(first).top - rc(lastHeaderLine).bottom) : null,
      footH: foot ? Math.round(rc(foot).height) : null,
      footContent: foot ? Math.round(rc(foot).height - parseFloat(getComputedStyle(foot).borderTopWidth)) : null,
      done: !!r.querySelector('.sh .donebtn'),
      pillQuiet: document.getElementById('nowbar').classList.contains('quiet'),
    };
  });
  const closeSheet = async page => { const b = await page.$('#sheet-root.in [data-act="sheet-close"]'); if (b) { await b.click(); await wait(page, 500); } };
  // The light page of a lamp that has colour or a white temperature: Home, its room, its row.
  const colourLight = page => page.evaluate(() => { const d = controllable().find(x => x.color) || controllable().find(x => x.ct); return d ? { id: d.device_id, area: devArea(d), name: d.name, colour: !!d.color } : null; });
  const openColourLight = async page => {
    const d = await colourLight(page); if (!d) return null;
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); S.view = 'home'; S.room = null; S.roomPage = null; location.hash = 'home'; render(); window.scrollTo(0, 0); }); await wait(page, 500);
    await page.click(`.room[data-room="${d.area}"] [data-act="room-open"]`); await wait(page, 600);
    await page.click(`[data-act="light-open"][data-id="${d.id}"]`); await wait(page, 700);
    return d;
  };

  // ---------------- 390x844 ----------------
  let { ctx, page } = await open('phone');

  // 1. four tabs
  const tabs = await page.$$eval('#nav button', els => els.map(b => b.dataset.view));
  check(tabs.length === 4 && tabs.join(',') === 'home,remotes,automations,settings', `four tabs, and Scenes is not one of them (${tabs.join(', ')})`);

  // 2. Home at rest
  const homeCtl = await controls(page);
  const shape = await page.evaluate(() => ({
    rooms: document.querySelectorAll('.rgrid .rtile.room .head').length,
    roomsWithSwitch: document.querySelectorAll('.rgrid .rtile.room .sw').length,
    newRoom: document.querySelectorAll('.rgrid .rtile.new').length,
    scopes: document.querySelectorAll('.scopes .chip').length,
    scenes: document.querySelectorAll('.scenerow [data-act="run-scene"]').length,
    seeAll: document.querySelectorAll('.scenerow [data-act="scenes-open"]').length,
    starred: document.querySelectorAll('.ln-row .ln-lamp').length,
    advice: document.querySelectorAll('#view > .card.pad0.list.nextrow, #view > .nextrow').length
      + document.querySelectorAll('#ln-due button, #ln-due a, #wd-home button, #wd-home a').length,
  }));
  // the connection dot in the header, the house card's three (the dimmer, All off, the "..."), the scope pills that
  // filter the grid under them, a room tile's body and switch, and the New room tile (design-spec-v5 4.5, 4.6)
  const expected = 1 + 3 + shape.starred + shape.scenes + shape.seeAll + shape.scopes + shape.rooms + shape.roomsWithSwitch + shape.newRoom + shape.advice;
  check(homeCtl === expected, `Home shows exactly the layout and nothing else: ${homeCtl} controls (1 dot + 3 house + ${shape.starred} starred + ${shape.scenes} scenes + ${shape.seeAll} See all + ${shape.scopes} scopes + ${shape.rooms} rooms + ${shape.roomsWithSwitch} switches + ${shape.newRoom} new room + ${shape.advice} advice = ${expected})`);
  const planShape = 1 + 3 + 0 + 3 + 1 + 5 + 5 + 1;   // the plan's home: five rooms, three scenes, nothing starred
  check(planShape <= PLAN_HOME_CONTROLS, `the same layout on the plan's home (five rooms, three scenes) is ${planShape} controls, at or under ${PLAN_HOME_CONTROLS}`);
  check(await page.evaluate(() => { const c = document.querySelector('.housecard'); const s = document.querySelector('.scenerow'); const r = document.querySelector('.rgrid'); return !!c && !!s && !!r && c.getBoundingClientRect().top < s.getBoundingClientRect().top && s.getBoundingClientRect().top < r.getBoundingClientRect().top; }), 'Home reads house card, then scenes, then the rooms');
  const firstRoom = await page.evaluate(() => { const r = document.querySelector('.rgrid .rtile.room'); const nav = document.getElementById('nav'); return { bottom: Math.round(r.getBoundingClientRect().bottom), navTop: Math.round(nav.getBoundingClientRect().top) }; });
  check(firstRoom.bottom <= firstRoom.navTop, `the first room is visible without scrolling at 390x844 (row bottom ${firstRoom.bottom}, tab bar top ${firstRoom.navTop})`);
  check(await page.evaluate(() => {
    const ln = document.querySelector('.ln-row');
    // a favourite whose light has left the home does not count: the row is what rowLights() can still show
    const favs = S.config.favorites.filter(t => t.startsWith('d:') && dev(t.slice(2)) && ['light', 'switch'].includes(dev(t.slice(2)).domain)).length;
    const shown = ln ? ln.querySelectorAll('.ln-lamp').length : 0;
    return shown === favs;
  }), 'the lamp row is the starred lights, and nothing when none are starred');

  // 3. the bottom of the screen
  const homeBottom = await page.evaluate(() => { const nb = document.getElementById('nowbar'); const nav = document.getElementById('nav'); return { shown: nb.classList.contains('show'), navH: Math.round(nav.getBoundingClientRect().height), furniture: Math.round(window.innerHeight - nav.getBoundingClientRect().top) }; });
  check(!homeBottom.shown && homeBottom.furniture === homeBottom.navH, `no pill on Home: the bottom furniture is the ${homeBottom.furniture}px tab bar alone`);
  check(homeBottom.navH === 53, `the tab bar is 52px of content plus its 1px hairline (${homeBottom.navH})`);
  // the pill only shows when something is lit, so give it something to say
  await page.evaluate(() => command({ type: 'level', target: 'h:all', level: 'on' })); await wait(page, 1600);
  await page.click('#nav button[data-view=remotes]'); await wait(page, 700);
  await page.waitForSelector('#nowbar .pill', { timeout: 8000 });
  const pill = await page.evaluate(() => {
    const nb = document.getElementById('nowbar'); const p = nb.querySelector('.pill'); const nav = document.getElementById('nav');
    const pb = p.getBoundingClientRect(), nvb = nav.getBoundingClientRect(); const cs = getComputedStyle(p);
    return { h: Math.round(pb.height), w: Math.round(pb.width), radius: cs.borderTopLeftRadius, bottom: getComputedStyle(nb).bottom,
      gapToContent: Math.round(nvb.top + 1 - pb.bottom), furniture: Math.round(window.innerHeight - pb.top),
      thumb: Math.round(p.querySelector('.pill-thumb').getBoundingClientRect().width),
      power: Math.round(p.querySelector('.pill-off').getBoundingClientRect().width),
      centred: Math.abs(Math.round(pb.left + pb.width / 2) - Math.round(window.innerWidth / 2)) <= 1 };
  });
  check(pill.h === 44 && pill.radius === '22px', `the pill is 44px tall with a 22px radius (${pill.h}, ${pill.radius})`);
  check(pill.w >= 160 && pill.w <= 280 && pill.centred, `the pill hugs its content between 160 and 280 and is centred (${pill.w}px)`);
  check(pill.thumb === 28 && pill.power === 32, `a 28px disc and a 32px power button (${pill.thumb}, ${pill.power})`);
  check(pill.bottom === '60px' && pill.gapToContent === 8, `the pill sits 52 + 8 above the bottom, clearing the tab bar by 8px (bottom ${pill.bottom}, gap ${pill.gapToContent})`);
  check(pill.furniture === 104, `the bottom furniture is 104px where the pill shows (${pill.furniture})`);
  // the hide rules
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(page, 300);
  await page.evaluate(() => { document.getElementById('view').style.minHeight = '2000px'; });
  const hidDown = await page.evaluate(async () => { window.scrollBy(0, 120); await new Promise(r => setTimeout(r, 80)); return document.getElementById('nowbar').classList.contains('hide'); });
  const backUp = await page.evaluate(async () => { window.scrollBy(0, -60); await new Promise(r => setTimeout(r, 80)); return !document.getElementById('nowbar').classList.contains('hide'); });
  await page.evaluate(() => window.scrollBy(0, 200)); await wait(page, 600);
  const backAtRest = await page.$eval('#nowbar', el => !el.classList.contains('hide'));
  check(hidDown && backUp && backAtRest, `the pill hides on a downward scroll and comes back on the way up and when the scroll stops (${hidDown}, ${backUp}, ${backAtRest})`);
  await page.evaluate(() => { document.getElementById('view').style.minHeight = ''; window.scrollTo(0, 0); }); await wait(page, 300);
  await page.evaluate(() => openNightSheet()); await wait(page, 700);
  check(await page.$eval('#nowbar', el => el.classList.contains('quiet')), 'the pill is hidden outright while a sheet is open');
  await closeSheet(page);
  await page.click('#nav button[data-view=home]'); await wait(page, 600);

  // 4. the sheet: the detent each one is at, and the spacing
  const want = [
    ['a light', 'medium', async () => { await page.click('.rgrid .rtile.room [data-act="room-open"]'); await wait(page, 600); await page.click('.light [data-act="light-open"]'); await wait(page, 700); }],
    ["a light's More", 'compact', async () => { await page.click('[data-act="ld-more"]'); await wait(page, 600); }],
    ['the remove confirm', 'compact', async () => { await page.click('[data-act="dev-remove"]'); await wait(page, 600); }],
    // the room is a sheet now: closeSheet() already lands on Home directly, with nothing further to back out of
    ['a sleep timer dial', 'medium', async () => { await closeSheet(page); await page.evaluate(() => window.scrollTo(0, 0)); await page.click('[data-act="house-more"]'); await wait(page, 600); await page.click('[data-act="house-timer"]'); await wait(page, 700); }],
    ['the house menu', 'compact', async () => { await page.click('[data-act="sheet-back"]'); await wait(page, 600); }],
    ['a walk step', 'medium', async () => { await closeSheet(page); await page.click('#nav button[data-view=automations]'); await wait(page, 600); if (await page.$('[data-act="au-new"]')) { await page.click('[data-act="au-new"]'); await wait(page, 600); } await page.click('[data-act="ae-new"]'); await wait(page, 800); }],
    // A fresh rig has no automations, and the step before this one opens the new-automation editor
    // without saving one, so there was nothing to open and the step timed out on a clean data
    // directory (docs/design-spec-v5.md 14.5: wiping the hub's data directory is not a reset). Put one
    // in first when the list is empty, so the sheet this step measures is reachable either way.
    ['the automation editor', 'large', async () => { await closeSheet(page);
      if (!(await page.$('[data-act="au-open"]'))) {
        await page.evaluate(async () => {
          S.config.schedules.push({ id: 'ia_probe', name: 'Porch at dusk', enabled: true,
            at: { type: 'time', time: '18:30', offset_min: 0 }, days: [0, 1, 2, 3, 4, 5, 6],
            actions: [{ type: 'level', target: 'd:7', level: 100 }], only_if: null, skip_until: null, kind: null });
          await save({ quiet: true });
        });
        await page.click('#nav button[data-view=automations]'); await wait(page, 700);
      }
      await page.click('[data-act="au-open"]'); await wait(page, 800); }],
    ['the Night sheet', 'medium', async () => { await closeSheet(page); await page.click('#nav button[data-view=settings]'); await wait(page, 600); await page.click('[data-act="night-open"]'); await wait(page, 700); }],
    ['the press sheet', 'large', async () => { await closeSheet(page); await page.click('#nav button[data-view=remotes]'); await wait(page, 600); await page.click('.remote-card'); await wait(page, 700); await page.click('.stage .pk[data-n="0"]'); await wait(page, 600); await page.click('[data-act="gesture-open"][data-g="single"]'); await wait(page, 700); }],

    ['the three presses', 'compact', async () => { await page.click('[data-act="sheet-back"]'); await wait(page, 700); }],
    ['the lights picker', 'large', async () => { await page.click('[data-act="gesture-open"][data-g="single"]'); await wait(page, 700); await page.evaluate(() => openTargetPicker(['h:all'], () => sheet.close(), () => sheet.close())); await wait(page, 800); }],
    // the remote is a sheet now: closeSheet() already lands on the Remotes list directly
    ['the scene editor', 'large', async () => { await closeSheet(page); await page.click('#nav button[data-view=home]'); await wait(page, 600); await page.click('[data-act="scenes-open"]'); await wait(page, 700); await page.click('[data-act="scenes-edit"]'); await wait(page, 500); await page.click('.tile.editing'); await wait(page, 800); }],
    // the panes this pass pushes, each reached from the top
    ['the colour controls', 'large', async () => { await closeSheet(page); await page.click('[data-act="scenes-back"]'); await wait(page, 500); await openColourLight(page); await page.click('[data-act="light-colour"]'); await wait(page, 800); }],
    ['the press sheet\'s All ways', 'large', async () => { await closeSheet(page); await page.click('#nav button[data-view=remotes]'); await wait(page, 600); await page.click('.remote-card'); await wait(page, 700); await page.click('.stage .pk[data-n="0"]'); await wait(page, 600); await page.click('[data-act="gesture-open"][data-g="single"]'); await wait(page, 700); await page.click('[data-act="recipe-all"]'); await wait(page, 800); }],
    ['the automation editor\'s More', 'medium', async () => { await closeSheet(page); await page.click('#nav button[data-view=automations]'); await wait(page, 600); await page.click('[data-act="au-open"]'); await wait(page, 800); await page.click('[data-act="ae-more"]'); await wait(page, 800); }],
  ];
  let g = null;
  for (const [name, detent, go] of want) {
    await go();
    g = await sheetGeom(page);
    check(!!g && g.detent === detent, `${name}: the ${detent} detent (${g && g.detent}, ${g && g.h}px, ${g && g.dvh}dvh)`);
    if (g && detent === 'medium') check(Math.abs(g.dvh - 56) < 0.6, `${name}: medium is 56dvh (${g.dvh})`);
    if (g && detent === 'large') check(Math.abs(g.dvh - 92) < 0.6, `${name}: large is 92dvh (${g.dvh})`);
    if (g && detent === 'compact') check(g.h >= 180 && g.dvh <= 40.1, `${name}: compact is its own content between 180px and 40dvh (${g.h}px, ${g.dvh}dvh)`);
    // the spacing rules hold on every one of them
    check(g.grabZone === 20 && g.grabber.w === 36 && g.grabber.h === 5 && g.grabber.top === 8, `${name}: a 20px grab zone with a 36x5 grabber 8px from the top (${JSON.stringify(g.grabber)})`);
    check(g.firstLineTop === 28, `${name}: the header's first line starts 28px from the sheet's top (${g.firstLineTop}${g.capped ? ', a step caption' : ''})`);
    check(g.shPadBottom === 12 && g.sbPadTop === 0 && g.headerGap === 12, `${name}: 12px between the header and the content (header pad ${g.shPadBottom}, body pad ${g.sbPadTop}, measured ${g.headerGap})`);
    check(g.pillQuiet, `${name}: the pill is out of the way`);
  }
  // an editor puts "Done" top right and has no footer (checked on every editor in section 8 as well)
  check(g.done && g.footH === null, `the last editor in the walk puts Done in the header and has no footer (done ${g.done}, footer ${g.footH})`);
  // a sheet that does have a real primary keeps a 74px footer plus the safe area
  await closeSheet(page);
  await page.click('#nav button[data-view=automations]'); await wait(page, 600);
  if (await page.$('[data-act="au-new"]')) { await page.click('[data-act="au-new"]'); await wait(page, 600); } await page.click('[data-act="ae-new"]'); await wait(page, 800);
  const wg = await sheetGeom(page);
  check(wg.footContent === 74, `a sheet with a real primary action has a 74px footer over its hairline (${wg.footContent} + 1px line = ${wg.footH})`);
  await closeSheet(page);

  // 5. scenes
  await page.click('#nav button[data-view=home]'); await wait(page, 600);
  const ran = await page.evaluate(async () => {
    const chip = document.querySelector('.scenerow [data-act="run-scene"]'); if (!chip) return 'no chip';
    window.__ran = null; const orig = window.command; window.command = a => { window.__ran = a; return orig(a); };
    chip.click(); await new Promise(r => setTimeout(r, 500)); window.command = orig; return window.__ran;
  });
  check(!!ran && (ran.type === 'preset' || ran.type === 'scene'), `a scene runs in one tap from Home (${JSON.stringify(ran)})`);
  check(!(await page.$('.scenerow [data-act="scene-new"]')), 'Home\'s scene row has no "New scene" chip any more');
  await page.click('[data-act="scenes-open"]'); await wait(page, 700);
  check((await page.evaluate(() => S.view)) === 'scenes' && !!(await page.$('#top [data-act="scenes-back"]')), 'the Scenes page is pushed from Home and has a back arrow');
  check(!!(await page.$('#top [data-act="scene-new"]')), 'making a scene is the "+" in the Scenes nav bar');
  check((await page.$$eval('[data-act="scene-new"]', els => els.length)) === 1, 'there is exactly one way to make a scene on the Scenes page');
  check(!!(await page.$('[data-act="scenes-edit"]')) && !(await page.$('.tile .tile-edit')), 'at rest a tile has one job: run the scene. Edit turns on the pencils.');
  await page.click('[data-act="scenes-edit"]'); await wait(page, 500);
  check(!!(await page.$('.tile.editing .tile-edit')), 'Edit shows the per-tile pencils');
  await page.click('[data-act="scenes-edit"]'); await wait(page, 500);
  await page.click('[data-act="scenes-back"]'); await wait(page, 600);
  check((await page.evaluate(() => S.view)) === 'home', 'back from Scenes lands on Home');

  // 6. every room sheet and room setup page, and back
  const roomIds = await page.evaluate(() => areas().map(a => a.id));
  for (const id of roomIds) {
    await page.click(`.room[data-room="${id}"] [data-act="room-open"]`); await wait(page, 600);
    const onRoom = await page.evaluate(() => ({ view: S.view, room: S.room, hash: location.hash }));
    check(onRoom.view === 'home' && onRoom.room === id && onRoom.hash === `#room/${id}`, `${id}: the room opens as a sheet, over Home, and the hash says so (${onRoom.hash})`);
    check(!!(await page.$('[data-act="room-setup"]')) && !!(await page.$('#sheet-root.in [data-act="sheet-close"]')), `${id}: the room sheet has Room setup and a close control`);
    await page.click('[data-act="room-setup"]'); await wait(page, 600);
    const onSetup = await page.evaluate(() => ({ page: S.roomPage, hash: location.hash, groups: [...document.querySelectorAll('#view .gh')].map(e => e.textContent.trim()) }));
    check(onSetup.page === 'setup' && onSetup.hash === `#room/${id}/setup`, `${id}: room setup is a page of its own (${onSetup.hash})`);
    check(onSetup.groups.length > 0, `${id}: room setup is a grouped list (${onSetup.groups.join(', ')})`);
    await page.click('[data-act="room-setup-back"]'); await wait(page, 500);
    check((await page.evaluate(() => S.roomPage)) === null && (await page.evaluate(() => S.view)) === 'home', `${id}: back from room setup reopens the room sheet`);
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await wait(page, 500); // the room is a sheet now; closing it is the way back to Home
    check((await page.evaluate(() => S.view)) === 'home' && !(await page.evaluate(() => S.room)), `${id}: closing the room sheet lands on Home`);
  }

  // ---------------- 7. stage 4: the light page and colour ----------------
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); S.view = 'home'; S.room = null; S.roomPage = null; location.hash = 'home'; render(); window.scrollTo(0, 0); }); await wait(page, 500);
  const cl = await openColourLight(page);
  if (!cl) check(false, 'the seeded home has a lamp with colour or a white temperature');
  else {
    const lp = await page.evaluate(() => {
      const r = document.querySelector('#sheet-root.in .sheet'); const sb = r.querySelector('.sb');
      const chip = sb.querySelector('[data-act="light-colour"]');
      const last = sb.lastElementChild;
      return {
        detent: (r.className.match(/dt-(compact|medium|large)/) || [, ''])[1],
        chip: chip ? chip.textContent.trim() : null, chipIsChip: !!(chip && chip.classList.contains('chip')),
        swatches: sb.querySelectorAll('.swatch').length, sel: sb.querySelectorAll('.swatch.sel').length,
        stage: !!sb.querySelector('.lstage[data-tile]'), readout: (() => { const d = sb.querySelector('.display.lv'); return d ? d.textContent.trim() : null; })(),
        wells: sb.querySelectorAll('.slider').length, vslider: !!sb.querySelector('.vslider'), steps: !!sb.querySelector('.vsteps'),
        warmthOnPage: !!sb.querySelector('[data-cwarm]'), hueOnPage: !!sb.querySelector('[data-chue]'),
        moodsOnPage: !!sb.querySelector('.ld-moods'),
        follow: !!sb.querySelector('[data-act="follow-open"]'),
        scrollable: Math.round(sb.scrollHeight - sb.clientHeight),
        lastBottom: Math.round(last.getBoundingClientRect().bottom), sbBottom: Math.round(sb.getBoundingClientRect().bottom),
        star: (() => { const b = sb.querySelector('[data-act="ld-fav"]'); return b ? b.innerText.trim() : null; })(),
      };
    });
    // design-spec-v5 4.9: the swatch row costs 68px, which the medium detent's 391px of body does not have left,
    // so a lamp with colour or a white temperature opens large and a lamp with neither opens medium
    check(lp.detent === 'large', `a lamp with colour or a white temperature opens at the large detent (${lp.detent})`);
    check(lp.stage && !!lp.readout && lp.wells === 1 && !lp.vslider && !lp.steps, `one tinted stage, one readout and one horizontal well (readout ${lp.readout}, ${lp.wells} slider)`);
    check(lp.swatches > 0 && lp.chipIsChip && /^More /.test(lp.chip), `the swatch row is on the light's own screen with a trailing chip (${lp.swatches} swatches, "${lp.chip}")`);
    // nearestSwatch only marks a colour within reach of one of the eight, so a lamp showing something of its own
    // marks nothing, which is honest. What has to hold either way: never two rings, and a pick is always marked.
    check(lp.sel <= 1, `never two rings on the swatch row (${lp.sel} marked)`);
    // by class position, not nth-of-type: the chip that leads this row is a button too, so
    // nth-of-type counts it and every swatch index shifts by one
    await page.evaluate(() => document.querySelectorAll('#sheet-root .ld-swrow .swatch')[2].click()); await wait(page, 700);
    check(await page.evaluate(() => { const ss = [...document.querySelectorAll('#sheet-root .ld-swrow .swatch')]; return ss.filter(x => x.classList.contains('sel')).length === 1 && ss[2].classList.contains('sel'); }), 'picking a swatch on the light page marks it, and only it');
    check(!lp.warmthOnPage && !lp.hueOnPage, 'the warmth slider and the hue strip stay behind the chip');
    check(!lp.moodsOnPage, "the room's mood chips are gone from the light page");
    check(lp.follow, 'Follow the day keeps its row, under the swatches');
    check(lp.scrollable <= 2 && lp.lastBottom <= lp.sbBottom + 1, `the light page fits its detent with nothing under the fold (${lp.scrollable}px to scroll, last control ${lp.lastBottom} inside ${lp.sbBottom})`);
    check(lp.star === 'Show first', `the star reads "Show first" on the light's page (${lp.star})`);
    await page.click('[data-act="light-colour"]'); await wait(page, 800);
    const cp = await page.evaluate(() => {
      const r = document.querySelector('#sheet-root.in .sheet'); const sb = r.querySelector('.sb'); const sh = r.querySelector('.sh');
      return { detent: (r.className.match(/dt-(compact|medium|large)/) || [, ''])[1], dvh: +(r.getBoundingClientRect().height / window.innerHeight * 100).toFixed(1),
        title: sh.querySelector('h2').textContent.trim(), back: !!sh.querySelector('[data-act="sheet-back"]'),
        warmth: !!sb.querySelector('[data-cwarm]'), swatches: sb.querySelectorAll('.swatch').length, more: !!sb.querySelector('[data-act="c-more"]') };
    });
    // a lamp with colour needs the swatches and the hue strip, so the pane is large; a lamp that only has a white
    // temperature is one slider, and a compact sheet is the whole of it (never 92dvh of white)
    const wantDetent = cl.colour ? 'large' : 'compact';
    check(cp.detent === wantDetent && (!cl.colour || Math.abs(cp.dvh - 92) < 0.6), `tapping "${lp.chip}" opens the colour controls at ${wantDetent} (${cp.detent}, ${cp.dvh}dvh)`);
    check(/^(Colour|Warmth)$/.test(cp.title) && cp.back, `the colour pane has its own title and a back arrow (${cp.title})`);
    check((cp.warmth || cp.swatches > 0), `the warmth slider and the swatches are behind the chip (warmth ${cp.warmth}, ${cp.swatches} swatches)`);
    await page.click('#sheet-root [data-act="sheet-back"]'); await wait(page, 700);
    check(!!(await page.$('#sheet-root [data-act="light-colour"]')), 'back from the colour pane lands on the light page');
    await closeSheet(page);
  }
  // back on Home, where the starred lamp row is
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); S.view = 'home'; S.room = null; S.roomPage = null; location.hash = 'home'; render(); window.scrollTo(0, 0); }); await wait(page, 600);
  check(!(await page.$('.ln-row .ln-rainbow')), "Home's starred lamp row has no rainbow button on the disc");
  // the ring is the sign that a lamp has colour, and it stays: star the colour lamp and look for the rainbow one
  check(await page.evaluate(async id => {
    const t = 'd:' + id; if (!S.config.favorites.includes(t)) { S.config.favorites.push(t); await save({ quiet: true, render: true }); }
    await new Promise(r => setTimeout(r, 500));
    const l = document.querySelector(`.ln-row .ln-lamp[data-id="${id}"]`);
    return !!(l && l.querySelector('.lring.color') && !l.querySelector('.ln-rainbow'));
  }, cl && cl.id), 'a starred lamp with colour wears the rainbow ring on Home, and no button on the disc');

  // ---------------- 8. stage 5: sheets that push, and Done in the header ----------------
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); S.view = 'remotes'; S.remote = null; render(); }); await wait(page, 600);
  await page.click('.remote-card'); await wait(page, 700);
  await page.click('.stage .pk[data-n="0"]'); await wait(page, 600);
  await page.click('[data-act="gesture-open"][data-g="single"]'); await wait(page, 700);
  const usual = await page.$$eval('#sheet-root .item.recipe', els => els.length);
  await page.click('[data-act="recipe-all"]'); await wait(page, 800);
  const aw = await page.evaluate(() => { const sh = document.querySelector('#sheet-root .sh'); const sb = document.querySelector('#sheet-root .sb'); return { title: sh.querySelector('h2').textContent.trim(), back: !!sh.querySelector('[data-act="sheet-back"]'), rows: sb.querySelectorAll('.item.recipe').length, fewer: !!sb.querySelector('[data-act="recipe-fewer"]') }; });
  check(aw.back && aw.title === 'All ways', `"Show all ways" pushes a pane titled "All ways" with a back arrow (${aw.title})`);
  check(!aw.fewer, 'there is no "Show fewer" to put back: Back is the way out');
  check(aw.rows > usual, `the press sheet shows ${usual} ways at rest and never all ${aw.rows} of them in place`);
  await page.click('#sheet-root [data-act="sheet-back"]'); await wait(page, 700);
  check((await page.$$eval('#sheet-root .item.recipe', els => els.length)) === usual, 'back from All ways lands on the press sheet, still showing the usual ways');
  await closeSheet(page);
  // Done in the header, and no footer, on everything the plan calls an editor
  const editors = [
    ['the automation editor', async () => { await page.click('#nav button[data-view=automations]'); await wait(page, 600); await page.click('[data-act="au-open"]'); await wait(page, 800); }],
    ["the automation editor's More", async () => { await page.click('[data-act="ae-more"]'); await wait(page, 700); }],
    ['the home name', async () => { await closeSheet(page); await page.click('#nav button[data-view=settings]'); await wait(page, 600); await page.click('[data-act="home-name"]'); await wait(page, 700); }],
    ['a light set', async () => { await closeSheet(page); await page.click('[data-act="settings-page"][data-p="sets"]'); await wait(page, 600); await page.click('[data-act="group-new"]'); await wait(page, 800); }],
  ];
  for (const [name, go] of editors) {
    await go();
    const e = await page.evaluate(() => ({ done: !!document.querySelector('#sheet-root .sh .donebtn'), foot: !!document.querySelector('#sheet-root .sb .sfoot'), x: !!document.querySelector('#sheet-root .sh [data-act="sheet-close"] svg') }));
    check(e.done && !e.foot && !e.x, `${name}: Done in the top right, no footer (done ${e.done}, footer ${e.foot})`);
  }
  await closeSheet(page);
  await page.evaluate(() => { S.config.groups = groups().filter(g => g.name !== 'New set'); save({ quiet: true, render: false }); }); await wait(page, 500);

  // ---------------- 9. stage 6: Settings on one screen ----------------
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); S.settingsPage = null; S.view = 'settings'; location.hash = 'settings'; render(); window.scrollTo(0, 0); }); await wait(page, 600);
  const st = await page.evaluate(() => ({
    more: !!document.querySelector('[data-act="settings-more"]'),
    prefs: !!document.querySelector('[data-act="prefs"]'),
    rows: document.querySelectorAll('#view > .card.pad0.list > .item').length,
    headers: [...document.querySelectorAll('#view .gh')].map(e => e.textContent.trim()),
    h2: document.querySelectorAll('#view .h2').length,
    caps: (() => { const g = document.querySelector('#view .gh'); if (!g) return null; const cs = getComputedStyle(g); return { t: cs.textTransform, size: cs.fontSize, w: cs.fontWeight, ls: cs.letterSpacing }; })(),
    docH: document.documentElement.scrollHeight, vh: window.innerHeight,
    pages: [...document.querySelectorAll('[data-act="settings-page"]')].map(e => e.dataset.p),
  }));
  check(!st.more, 'there is no "More settings" page any more');
  check(!st.prefs, 'there is no "Preferences" row any more: the house values are their own rows');
  check(st.headers.join(' · ') === 'Your home · The house · This app · Advanced', `Settings is four groups in the caps style (${st.headers.join(', ')})`);
  check(st.h2 === 0, `no 18px section headers left on Settings (${st.h2})`);
  check(!!st.caps && st.caps.t === 'uppercase' && st.caps.size === '12px' && st.caps.w === '500', `the section headers are 12/16 500 caps (${JSON.stringify(st.caps)})`);
  // the plan's sketch draws fourteen rows on the one page (its "13" leaves out the red one at the bottom)
  check(st.rows === 14, `fourteen rows on one Settings screen: the connection, four, three, three, two and Sign out (${st.rows})`);
  check(st.docH <= st.vh * 1.6, `all of Settings is one scroll, with nothing on a second page (${st.docH}px against ${st.vh})`);
  check(['home', 'devices', 'sets', 'timing', 'backup'].every(x => st.pages.includes(x)), `each rare thing has its own short page (${st.pages.join(', ')})`);
  for (const pg of ['home', 'devices', 'sets', 'timing', 'backup']) {
    await page.click(`[data-act="settings-page"][data-p="${pg}"]`); await wait(page, 500);
    const on = await page.evaluate(() => ({ back: !!document.querySelector('#top [data-act="settings-back"]'), title: (document.querySelector('#top .t2') || document.querySelector('#top h1') || document.querySelector('#top .nt') || {}).textContent }));
    check(on.back, `Settings › ${pg}: a page with a back arrow`);
    await page.click('#top [data-act="settings-back"]'); await wait(page, 400);
  }
  // every command that used to sit on More settings still has a home
  const homes = await page.evaluate(async () => {
    const found = {};
    const look = (k, sel) => { found[k] = !!document.querySelector(sel); };
    S.settingsPage = 'home'; render(); await new Promise(r => setTimeout(r, 200));
    look('update', '[data-act="update-connector"], .item .t'); look('autoUpdate', '[data-act="auto-update"]'); look('howTo', '[data-act="settings-how"]');
    S.settingsPage = 'devices'; render(); await new Promise(r => setTimeout(r, 200));
    look('addDevice', '[data-act="ad-open"]'); look('hue', '[data-act="hue-open"]'); look('lookAgain', '[data-act="refresh"]'); look('rooms', '[data-act="rooms-open"]');
    S.settingsPage = 'timing'; render(); await new Promise(r => setTimeout(r, 200));
    look('double', '[data-setting="double_ms"]'); look('hold', '[data-setting="hold_ms"]');
    S.settingsPage = 'backup'; render(); await new Promise(r => setTimeout(r, 200));
    look('backup', '[data-act="backup"]'); look('restore', '[data-act="restore"]');
    S.settingsPage = 'sets'; render(); await new Promise(r => setTimeout(r, 200));
    look('sets', '[data-act="group-new"]');
    S.settingsPage = null; render(); await new Promise(r => setTimeout(r, 200));
    look('onLevel', '[data-act="onlevel-open"]'); look('power', '[data-act="power-open"]'); look('night', '[data-act="night-open"]'); look('where', '[data-act="where-open"]');
    return found;
  });
  check(Object.values(homes).every(Boolean), `every command that was on More settings has a home (${Object.entries(homes).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'all of them'})`);
  await ctx.close();

  // ---------------- 360, 390 and 1280: no horizontal overflow anywhere ----------------
  for (const size of ['small', 'phone', 'desktop']) {
    ({ ctx, page } = await open(size));
    check((await overflow(page)) === 0, `no horizontal overflow on Home at ${size}`);
    await page.click('.room [data-act="room-open"]'); await wait(page, 600);
    check((await overflow(page)) === 0, `no horizontal overflow on the room sheet at ${size}`);
    await page.click('[data-act="room-setup"]'); await wait(page, 600);
    check((await overflow(page)) === 0, `no horizontal overflow on room setup at ${size}`);
    await page.click('[data-act="room-setup-back"]'); await wait(page, 400);
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await wait(page, 400); // the room is a sheet now; closing it is the way back to Home
    await page.click('[data-act="scenes-open"]'); await wait(page, 600);
    check((await overflow(page)) === 0, `no horizontal overflow on the Scenes page at ${size}`);
    await page.click('[data-act="scenes-back"]'); await wait(page, 400);
    for (const v of ['remotes', 'automations', 'settings']) { await page.click(`#nav button[data-view=${v}]`); await wait(page, 450); check((await overflow(page)) === 0, `no horizontal overflow on ${v} at ${size}`); }
    // the Settings pages, the light page and the colour pane: the three sizes, and inside the sheet too
    for (const pg of ['home', 'devices', 'sets', 'timing', 'backup']) {
      await page.click(`[data-act="settings-page"][data-p="${pg}"]`); await wait(page, 400);
      check((await overflow(page)) === 0, `no horizontal overflow on Settings › ${pg} at ${size}`);
      await page.click('#top [data-act="settings-back"]'); await wait(page, 350);
    }
    const sbOverflow = () => page.evaluate(() => { const sb = document.querySelector('#sheet-root.in .sb'); return sb ? Math.round(sb.scrollWidth - sb.clientWidth) : -1; });
    const d = await openColourLight(page);
    if (d) {
      check((await overflow(page)) === 0 && (await sbOverflow()) <= 0, `no horizontal overflow on the light page at ${size}`);
      await page.click('[data-act="light-colour"]'); await wait(page, 700);
      check((await overflow(page)) === 0 && (await sbOverflow()) <= 0, `no horizontal overflow on the colour controls at ${size}`);
      await closeSheet(page);
    }
    await ctx.close();
  }

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  console.log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'ALL OK');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
