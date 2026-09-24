// Scenes are made and changed from the room itself. The owner asked to "edit or add scenes directly in rooms easily":
// New scene is the last chip, Edit over the chips turns each one into a way into its scene, and the scene's editor
// opens over the room (#room/<id>/scene/<scene id>), so closing it, or deleting the scene, is the room again.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  const root = `http://127.0.0.1:${PORT}/`;
  await page.goto(root + '#rooms');
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(900);

  // a room with lights in it
  const aid = await page.evaluate(() => { const c = window.__copper; const a = c.data.areas().find(x => c.H.roomLights(x.id).length); return a && a.id; });
  check(!!aid, 'a room with lights', aid);
  await page.evaluate(id => { location.hash = `#room/${id}`; }, aid); await wait(900);
  const hashRoom = await page.evaluate(() => location.hash);

  // ---- New scene: the last chip, which makes one and opens it over the room
  const chipLast = await page.evaluate(() => { const b = [...document.querySelectorAll('.room-chips .chip')].pop(); return b && b.dataset.act; });
  check(chipLast === 'room-scene-new', 'New scene is the last chip in the room', chipLast);
  const before = await page.evaluate(() => window.__copper.data.presets().length);
  await page.click('[data-act="room-scene-new"]');
  await page.waitForSelector('#sheet-root .sheet', { timeout: 5000 }).catch(() => {});
  await wait(800);
  const made = await page.evaluate(() => ({ hash: location.hash, n: window.__copper.data.presets().length, room: !!document.querySelector('#screen .room'), title: (document.querySelector('#sheet-root .sheet h2, #sheet-root .sheet .sheet-title') || {}).textContent || '', stage: !!document.querySelector('#sheet-root .sc-stage') }));
  check(made.n === before + 1, 'it made one scene', made.n - before);
  check(/^#room\/[^/]+\/scene\/.+/.test(made.hash), 'its editor is a sheet over the room', made.hash);
  check(made.room, 'with the room still under it', made.room);
  check(made.stage, 'the scene editor, with its stage of lights', made.stage);
  const pid = made.hash.split('/').pop();
  const lvCount = await page.evaluate(id => Object.keys(window.__copper.data.presets().find(p => p.id === id).levels).length, pid);
  const roomLights = await page.evaluate(id => window.__copper.data.controllable().filter(d => window.__copper.data.devArea(d) === id && d.domain !== 'cover').length, aid);
  check(lvCount === roomLights, 'every light in the room is in it, so there is something to change', { lvCount, roomLights });

  // the sheet's own taps work from the room: a fade chip changes this scene
  await page.click('#sheet-root [data-act="scene-fade"][data-s="5"]').catch(() => {});
  await wait(600);
  const fade = await page.evaluate(id => window.__copper.data.presets().find(p => p.id === id).fade, pid);
  check(fade === 5, 'changing it from the room changes the scene', fade);

  // closing it is the room again, one step back
  await page.evaluate(() => document.querySelector('#sheet-root .sheet [data-act="sheet-close"]').click()); await wait(800);
  const closed = await page.evaluate(() => ({ hash: location.hash, sheet: !!document.querySelector('#sheet-root .sheet') }));
  check(closed.hash === hashRoom && !closed.sheet, 'closing it is the room', closed);

  // ---- Edit: over the chips; each chip then opens its scene, until Done
  const head = await page.$('.room-sec [data-act="room-scenes-edit"]');
  check(!!head, 'the room has Edit over its scenes');
  if (head) {
    await head.click(); await wait(400);
    const pencils = await page.evaluate(() => ({ editing: document.querySelectorAll('.room-chips .chip.editing').length, all: document.querySelectorAll('.room-chips .chip[data-id]').length - document.querySelectorAll('.room-chips [data-act="room-scene-new"]').length, label: document.querySelector('.room-sec .link').textContent }));
    check(pencils.editing > 0 && pencils.editing === pencils.all && pencils.label === 'Done', 'every scene chip turns into a way in, and Edit reads Done', pencils);
    const lit = await page.evaluate(() => Object.keys(window.__copper.S.states).filter(id => (window.__copper.S.states[id] || {}).level > 0).length);
    await page.click(`.room-chips .chip.editing[data-id="${pid}"]`); await wait(800);
    const edit = await page.evaluate(() => ({ hash: location.hash, sheet: !!document.querySelector('#sheet-root .sheet') }));
    check(edit.sheet && edit.hash.endsWith(`/scene/${pid}`), 'tapping a chip in Edit opens that scene over the room', edit);
    const litAfter = await page.evaluate(() => Object.keys(window.__copper.S.states).filter(id => (window.__copper.S.states[id] || {}).level > 0).length);
    check(lit === litAfter, 'and does not run it', { lit, litAfter });
    await page.goBack(); await wait(700);
    check(await page.evaluate(() => location.hash) === hashRoom, 'Back from it is the room');
    await page.click('.room-sec [data-act="room-scenes-edit"]'); await wait(400);
    check(!(await page.$('.room-chips .chip.editing')), 'Done turns the chips back into scenes to run');
  }

  // ---- Holding a chip opens it over the room too
  const box = await page.evaluate(id => { const b = document.querySelector(`.room-chips .chip[data-id="${id}"]`); if (!b) return null; b.scrollIntoView({ inline: 'center', block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, pid);
  if (box) {
    await page.mouse.move(box.x, box.y); await page.mouse.down(); await wait(750); await page.mouse.up(); await wait(800);
    const held = await page.evaluate(() => location.hash);
    check(held.endsWith(`/scene/${pid}`), 'holding a chip opens its scene over the room', held);
  } else check(false, 'the new scene has a chip in the room');

  // ---- Deleting it from the room leaves the room showing, without it
  if (await page.$('#sheet-root [data-act="scene-delete"]')) {
    await page.click('#sheet-root [data-act="scene-delete"]'); await wait(400);
    await page.click('#sheet-root [data-act="scene-delete-go"]'); await wait(1000);
    const gone = await page.evaluate(id => ({ hash: location.hash, sheet: !!document.querySelector('#sheet-root .sheet'), still: !!window.__copper.data.presets().find(p => p.id === id), chip: !!document.querySelector(`.room-chips [data-id="${id}"]`) }), pid);
    check(gone.hash === hashRoom && !gone.sheet, 'deleting it from the room is the room again', gone);
    check(!gone.still && !gone.chip, 'without it', gone);
  } else check(false, 'the sheet has Delete scene');

  // ---- a second New scene is not the same name as the first
  await page.click('[data-act="room-scene-new"]'); await wait(900);
  await page.evaluate(() => document.querySelector('#sheet-root .sheet [data-act="sheet-close"]').click()); await wait(600);
  await page.click('[data-act="room-scene-new"]'); await wait(900);
  const names = await page.evaluate(id => window.__copper.data.presets().filter(p => p.area === id && /New scene/.test(p.name)).map(p => p.name), aid);
  check(names.length >= 2 && new Set(names).size === names.length, 'two new scenes have different names', names);
  // tidy: take them out again so later tests see the room as it was
  await page.evaluate(async id => { const c = window.__copper; for (const p of c.data.presets().filter(x => x.area === id && /New scene/.test(x.name))) c.EDIT.deleteScene(p.id); await c.save('', { quiet: true }); }, aid);

  check(!errors.length, 'no errors on the page', errors);
  await browser.close();
  if (fails.length) { console.log(`FAILED ${fails.length}`); process.exit(1); }
})().catch(e => { console.log('FAILED', e.message); process.exit(1); });
