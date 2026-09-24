// Copper Night (/ui/): changing the home. About this light (what it is for, what it is, its room, hiding it), Follow
// the day, room setup (renaming, a new room, deleting one and putting it back) and scenes (making one, editing it, starring,
// running it, the press and hold, deleting it and putting it back, the five suggestions). Puts the config back as it found it.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.removeItem('scenesNotNow'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|Failed to load resource/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  const base = `http://127.0.0.1:${PORT}/ui/`;
  const C = (fn, arg) => page.evaluate(fn, arg);
  const go = async hash => { await page.goto(base + '#' + hash); await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900); };
  const cfg = () => C(() => window.__copper.S.config);

  await page.goto(base);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(800);
  // the greeting a home gets once, the first time it connects, would sit over Home: this home has had it
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const before = await C(() => JSON.stringify(window.__copper.S.config));
  // Positions read from the file, measured from the sheet's own top (a sheet) or the page's (a page).
  const at = async (what, list, inSheet) => {
    const got = await C(([L, sh]) => { const top = sh ? document.querySelector('#sheet-root .sheet').getBoundingClientRect().top : -scrollY; return L.map(([n, sel]) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top - top, b.width, b.height].map(v => Math.round(v)); }); }, [list, inSheet]);
    list.forEach(([n, , ...exp], i) => { const v = got[i]; const off = !v ? ['missing'] : exp.map((x, j) => (x == null || Math.abs(v[j] - x) <= 1 ? null : `${'xywh'[j]} ${v[j]} not ${x}`)).filter(Boolean); check(`${what}: ${n} where the file has it`, !off.length, off.join(', ')); });
  };

  // ---- 19 About this light, on the Kitchen Cans (5)
  await go('light/5/about');
  check('About opens as a sheet', !!(await page.$('#sheet-root .about')) && (await page.textContent('.sheet-head h2')) === 'About this light');
  await at('19 About', [['What it’s for', '.about .t-over.sec-s', 20, 110, null, 14], ['Main light', '.choice[data-role="ambient"]', 20, 134, 180, 116], ['Decorative', '.choice[data-role="decor"]', 212, 262, 180, 116], ['What it is', '.about .what-is', 20, 406, null, 14]], true);
  await page.click('.choice[data-role="task"]'); await wait(1000);
  check('what it is for: Task', (await cfg()).settings.roles['5'] === 'task');
  await page.click('.chip[data-place="ceiling"]'); await wait(500);
  check('a place shows its kinds', (await page.$$('.kind')).length >= 5);
  await page.click('.kind[data-kind="ceiling-downlights"]'); await wait(1000);
  let s = (await cfg()).settings;
  check('the kind is set, and with it the role', s.light_kinds['5'] === 'ceiling-downlights' && s.roles['5'] === 'ambient', [s.light_kinds['5'], s.roles['5']]);
  await page.click('.kind[data-kind="ceiling-downlights"]'); await wait(1000);
  check('tapping it again clears it', !(await cfg()).settings.light_kinds['5']);
  await page.click('[data-act="about-move"]'); await wait(500);
  check('Move to room opens a room picker inside the sheet', !!(await page.$('#sheet-root [data-act="about-move-to"][data-room="22"]')) && !!(await page.$('#sheet-root .sheet-back')));
  const area = () => C(() => window.__copper.data.devArea(window.__copper.data.dev('5')));
  const from = await area(), to = from === '22' ? '20' : '22';
  const bridgeArea = () => C(() => (window.__copper.data.dev('5') || {}).area);
  const bridge0 = await bridgeArea();
  await C(() => { document.querySelector('#toast-root').innerHTML = ''; });
  await page.click(`[data-act="about-move-to"][data-room="${to}"]`); await wait(1400);
  check('moved to another room', (await area()) === to, await area());
  // a move is not a deletion: no toast and no Undo (2ca8d0a); the About sheet's own room line is the answer
  check('and no toast, no Undo', !(await C(() => document.querySelector('#toast-root').textContent)), await C(() => document.querySelector('#toast-root').textContent));
  await page.waitForFunction(b => (window.__copper.data.dev('5') || {}).area !== b, bridge0, { timeout: 5000 }).catch(() => {});
  check('the bridge moved it too', (await bridgeArea()) !== bridge0, [await bridgeArea(), bridge0]);
  // moved back the same way a person would, through Move to room
  await page.click('[data-act="about-move"]'); await wait(500);
  await page.click(`[data-act="about-move-to"][data-room="${from}"]`); await wait(1400);
  await page.waitForFunction(b => (window.__copper.data.dev('5') || {}).area === b, bridge0, { timeout: 5000 }).catch(() => {});
  check('moving it back puts it back, on the bridge too', (await area()) === from && (await bridgeArea()) === bridge0, [await area(), from, await bridgeArea(), bridge0]);
  await page.click('[data-act="about-hide"]'); await wait(1000);
  check('Hide from the app', (await cfg()).settings.hidden_devices.includes('5'));
  await page.click('[data-act="about-hide"]'); await wait(1000);
  check('and back', !(await cfg()).settings.hidden_devices.includes('5'));
  check('a Lutron light offers Remove from home', !!(await page.$('[data-act="about-remove"]')));
  await page.click('[data-act="about-remove"]'); await wait(500);
  check('which asks first', !!(await page.$('[data-act="about-remove-go"]')));
  await page.click('#sheet-root [data-act="picker-back"]'); await wait(500);
  check('Keep it goes back to About', !!(await page.$('#sheet-root .about')));
  await page.click('.sheet-close'); await wait(600);
  check('closing About returns to the light', /#light\/5$/.test(page.url()), page.url());

  // ---- 06 Follow the day, on a colour lamp
  const lamp = await C(() => (window.__copper.data.controllable().find(d => d.ct) || {}).device_id);
  await go(`light/${lamp}/follow`);
  check('Follow the day is a page with the day drawn', !!(await page.$('.follow-page .dc-chart')) && (await page.textContent('.page-h1')) === 'Follow the day');
  const f0 = await C(id => window.__copper.DAY.isFollowing(id), lamp);
  await page.click('[data-act="follow-toggle"]'); await wait(1000);
  check('its switch starts or stops it', (await C(id => window.__copper.DAY.isFollowing(id), lamp)) !== f0);
  const b0 = await C(() => window.__copper.DAY.followBright());
  await page.click('[data-act="follow-bright"]'); await wait(1000);
  check('Dim in the evening too', (await C(() => window.__copper.DAY.followBright())) !== b0);

  // ---- 16 Room setup: rename the Kitchen, then put the name back
  await go('room/20/setup');
  check('Room setup opens over the room', (await page.textContent('#sheet-root .t-over')) === 'Room setup');
  await at('16 Room setup', [['name and photo', '.setup .group:nth-of-type(1)', 20, 100, 372, 136], ['follow and timer', '.setup .group:nth-of-type(2)', 20, 252, 372, 112], ['in this room', '.setup .group:nth-of-type(3)', 20, 380, 372, 112]], true);
  await page.click('[data-act="setup-name"]'); await wait(500);
  await page.fill('.name-form input', 'Kitchen two'); await wait(1300);
  check('the name saves as it is typed', await C(() => window.__copper.data.areaName('20')) === 'Kitchen two');
  await page.press('.name-form input', 'Enter'); await wait(600);
  check('Enter goes back to setup, which shows the new name', (await page.textContent('#sheet-root .sheet-head h2')) === 'Kitchen two');
  await page.click('[data-act="setup-name"]'); await wait(400);
  await page.fill('.name-form input', 'Kitchen'); await wait(1300);
  await page.press('.name-form input', 'Enter'); await wait(500);
  await page.click('[data-act="setup-lights"]'); await wait(500);
  check('what is in the room, as a picker', (await page.$$('#sheet-root [data-act="setup-move"]')).length >= 2);
  await page.click('#sheet-root [data-act="picker-back"]'); await wait(400);
  await page.click('[data-act="setup-timer"]'); await wait(700);
  check('the room’s sleep timer is the timer sheet, for the room', /room\/20\/timer$/.test(page.url()) && (await page.textContent('.ts-applies .v')) === 'This room', page.url());
  await page.click('.sheet-close'); await wait(500);

  // ---- a new room, named, then deleted (toasts are off, so there is no Undo; the test puts it back itself)
  await go('rooms');
  const n0 = await C(() => window.__copper.data.appRooms().length);
  await page.click('[data-act="room-new"]'); await wait(1500);
  check('+ makes a room and opens its setup at the name', /#room\/[^/]+\/setup$/.test(page.url()) && !!(await page.$('.name-form input')), page.url());
  await page.fill('.name-form input', 'Den'); await wait(1300);
  const rid = await C(() => location.hash.split('/')[1]);
  check('named Den', (await C(id => window.__copper.data.areaName(id), rid)) === 'Den' && (await C(() => window.__copper.data.appRooms().length)) === n0 + 1);
  await page.press('.name-form input', 'Enter'); await wait(400);
  const withDen = await C(() => JSON.stringify(window.__copper.S.config));
  await page.click('[data-act="setup-delete"]'); await wait(400);
  await page.click('[data-act="setup-delete-go"]'); await wait(1500);
  check('deleting it goes back to Rooms', /#rooms$/.test(page.url()) && !(await C(id => window.__copper.data.appRoom(id), rid)), page.url());
  check('and no toast and no Undo (toasts are off)', (await C(() => document.querySelector('#toast-root').innerHTML)) === '', await C(() => document.querySelector('#toast-root').innerHTML));
  await C(async prev => { const c = window.__copper; c.data.restoreConfig(prev); await c.save('', { quiet: true }); }, withDen); await wait(600);
  check('the room put back directly is there again', !!(await C(id => window.__copper.data.appRoom(id), rid)));

  // ---- 14 and 15: scenes
  await C(() => { const c = window.__copper; c.run({ type: 'level', target: 'd:5', level: 60 }); });
  await wait(1200);
  await go('scenes');
  check('All scenes, with the five offered to a room that has none', !!(await page.$('.suggest-card [data-act="scenes-five"]')));
  await at('14 All scenes', [['title (its padding box: the text is at 20, 128)', '.scenes-page .page-h1', 0, 108, null, 64], ['caption', '.scenes-page .fd-sub', 20, 178, null, null], ['add', '.scenes-page .hdr .a1', 336, 52, 56, 56]]);
  await page.click('[data-act="scene-new"]'); await wait(1500);
  const pid = await C(() => location.hash.split('/')[1]);
  check('+ makes a scene from what is on and opens it', !!pid && !!(await page.$('#sheet-root .scene-sheet')), pid);
  await page.click('[data-act="scene-name"]'); await wait(400);
  await page.fill('.name-form input', 'Reading'); await wait(1300);
  await page.press('.name-form input', 'Enter'); await wait(500);
  const P = () => C(id => window.__copper.data.presets().find(p => p.id === id), pid);
  check('renamed Reading', (await P()).name === 'Reading');
  await page.click('.chip[data-act="scene-fade"][data-s="30"]'); await wait(900);
  check('Arrives in 30 s, kept by the hub', (await P()).fade === 30 && (await page.textContent('.arr-head .v')) === '30 s', [(await P()).fade, await page.textContent('.arr-head .v')]);
  const n1 = Object.keys((await P()).levels).length;
  await page.click('[data-act="scene-add"]'); await wait(500);
  const addable = await page.$$('#sheet-root [data-act="scene-add-go"]');
  if (addable.length) { await addable[0].click(); await wait(1000); check('Add a light', Object.keys((await P()).levels).length === n1 + 1); }
  await page.click('.sl-row[data-id="5"]'); await wait(500);
  check('a light opens to its level', !!(await page.$('.sl-edit input[type=range]')));
  await C(() => { const i = document.querySelector('.sl-edit input[type=range]'); i.value = 25; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
  await wait(1200);
  check('and the slider sets it in the scene', Number(typeof (await P()).levels['5'] === 'object' ? (await P()).levels['5'].level : (await P()).levels['5']) === 25, (await P()).levels['5']);
  await page.click('.sl-row[data-id="5"] .sl-x'); await wait(900);
  check('the x takes a light out', !('5' in (await P()).levels));
  await page.click('[data-act="scene-star"]'); await wait(900);
  check('the star puts it on Home', (await cfg()).favorites.includes('p:' + pid));
  await page.click('.sheet-close'); await wait(700);
  check('closing goes back to the list', /#scenes$/.test(page.url()), page.url());
  check('a starred scene is a tile', !!(await page.$(`.scene-tile[data-id="${pid}"]`)));
  await C(() => { const c = window.__copper; document.querySelector('#toast-root').innerHTML = ''; window.__sent = []; if (!c.__run0) { c.__run0 = c.run; c.run = a => { window.__sent.push(a); return c.__run0(a); }; } });
  await page.click(`.scene-tile[data-id="${pid}"]`); await wait(1400);
  // running a scene is shown by its lights: no toast and no Put back (2ca8d0a)
  const ran = await C(id => ({ sent: window.__sent.filter(a => a.type === 'preset' && a.preset_id === id).length, toast: document.querySelector('#toast-root').textContent }), pid);
  check('a tap runs it (one preset sent) with no toast and no Put back', ran.sent === 1 && !ran.toast, ran);
  await C(() => { const c = window.__copper; if (c.__run0) { c.run = c.__run0; delete c.__run0; } });
  await page.locator(`.scene-row[data-id="${pid}"]`).scrollIntoViewIfNeeded();
  await page.evaluate(id => document.querySelector(`.scene-row[data-id="${id}"]`).scrollIntoView({ block: 'center' }), pid); await wait(300);
  const row = await page.locator(`.scene-row[data-id="${pid}"]`).boundingBox();
  await page.mouse.move(row.x + 120, row.y + 30); await page.mouse.down(); await wait(750); await page.mouse.up(); await wait(900);
  check('press and hold opens it instead', page.url().endsWith(`#scenes/${pid}`) && !!(await page.$('#sheet-root .scene-sheet')), page.url());
  const withScene = await C(() => JSON.stringify(window.__copper.S.config));
  await page.click('[data-act="scene-delete"]'); await wait(400);
  await page.click('[data-act="scene-delete-go"]'); await wait(1400);
  check('Delete scene, back to the list', !(await P()) && /#scenes$/.test(page.url()));
  check('and no toast and no Undo (toasts are off)', (await C(() => document.querySelector('#toast-root').innerHTML)) === '', await C(() => document.querySelector('#toast-root').innerHTML));
  await C(async prev => { const c = window.__copper; c.data.restoreConfig(prev); await c.save('', { quiet: true }); }, withScene); await wait(600);
  check('the scene put back directly is there again', !!(await P()));
  const aid = await C(() => document.querySelector('.suggest-card [data-act="scenes-five"]')?.dataset.area);
  if (aid) {
    await page.click(`.suggest-card [data-act="scenes-five"][data-area="${aid}"]`); await wait(1400);
    check('Add all five', (await C(a => window.__copper.data.presets().filter(p => p.area === a && p.mood).length, aid)) === 5);
  }
  const lut = await page.$('[data-act="scene-run-lutron"]');
  if (lut) {
    // the run itself is what is checked; it used to be read off its "is on" toast, and toasts are off
    const sid = await lut.getAttribute('data-sid');
    await C(() => { const c = window.__copper; window.__sent = []; if (!c.__run0) { c.__run0 = c.run; c.run = a => { window.__sent.push(a); return c.__run0(a); }; } });
    await lut.click(); await wait(1200);
    const lr = await C(id => ({ sent: window.__sent.filter(a => a.type === 'scene' && String(a.scene_id) === id).length, toast: document.querySelector('#toast-root').innerHTML }), sid);
    await C(() => { const c = window.__copper; if (c.__run0) { c.run = c.__run0; delete c.__run0; } });
    check('a Lutron scene runs, with no toast', lr.sent === 1 && lr.toast === '', lr);
  }

  // put the config back as it was
  await C(async b => { const c = window.__copper; c.data.restoreConfig(b); await c.data.saveConfig(); }, before);
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
