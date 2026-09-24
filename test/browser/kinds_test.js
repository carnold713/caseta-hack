// The two-step kind picker (docs/ux-progressive.md 5): where, then what. Saved id and role, one sheet height across
// the steps, a legacy one-word id renders the new label, the sort walk still completes. PORT=4401 node kinds_test.js
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // reuse a saved token where there is one: the hub allows 20 logins per 15 minutes
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/classic/`); if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500);
  const h = () => page.$eval('#sheet-root .sheet', el => Math.round(el.getBoundingClientRect().height));
  const title = () => page.$eval('#sheet-root .sh h2', el => el.textContent.trim());
  const capn = () => page.$eval('#sheet-root .sh', el => { const c = el.querySelector('.stepcap'); return c ? c.textContent.trim() : ''; });
  const saved = async () => (await page.evaluate(() => api('/api/snapshot'))).config.settings;
  const reset = async () => { await page.evaluate(async () => { S.config.settings.light_kinds = {}; S.config.settings.roles = {}; await save({ quiet: true }); }); };
  await reset();

  // 1. the light's More sheet, then Kind: step 1 asks where
  await page.click('.room[data-room="20"] [data-act="room-open"]'); await page.waitForTimeout(400);
  await page.click('[data-act="light-open"][data-id="5"]'); await page.waitForSelector('#sheet-root.in'); await page.waitForTimeout(500);
  await page.click('[data-act="ld-more"]'); await page.waitForTimeout(400);
  check((await page.$eval('[data-act="ld-kind"] .val', el => el.textContent.trim())) === 'Not set', 'More sheet: Kind reads "Not set" before a pick');
  await page.click('[data-act="ld-kind"]'); await page.waitForTimeout(500);
  check((await title()) === 'Where is this light?', 'step 1 asks where');
  check((await page.$$('[data-act="kind-place"]')).length === 10, 'step 1 lists ten places');
  const h1 = await h();
  await page.screenshot({ path: 's13-kind-1-where.png' });
  // 2. a place, then only its fixtures with the role as the second line
  await page.click('[data-act="kind-place"][data-p="desk"]'); await page.waitForTimeout(450);
  check((await title()) === 'What is it?', 'step 2 asks what');
  const h2 = await h();
  check(h1 === h2, `sheet keeps one height across the steps (${h1} vs ${h2})`);
  const rows = await page.$$eval('[data-act="kind-pick"]', els => els.map(e => e.dataset.k));
  check(rows.join(',') === 'desk-lamp,desk-tape,desk-task,desk-monitor', 'step 2 lists the desk fixtures only: ' + rows.join(','));
  check((await page.$eval('[data-act="kind-pick"][data-k="desk-tape"] .d', el => el.textContent.trim())) === 'Lamps · for atmosphere', 'a fixture row carries its role');
  check(!!(await page.$('[data-act="sheet-back"]')), 'step 2 has a back arrow');
  await page.screenshot({ path: 's13-kind-2-what.png' });
  await page.click('[data-act="kind-pick"][data-k="desk-tape"]'); await page.waitForTimeout(1200);
  check(!!(await page.$('[data-act="kind-pick"][data-k="desk-tape"].sel .chk')), 'the chosen fixture shows selected');
  check(h2 === await h(), 'height unchanged after the pick');
  await page.screenshot({ path: 's13-kind-2-picked.png' });
  let s = await saved();
  check(s.light_kinds['5'] === 'desk-tape', 'saved light_kinds has the new id: ' + s.light_kinds['5']);
  check(s.roles['5'] === 'accent', 'saved roles has the role: ' + s.roles['5']);
  // back to step 1: the place row shows the chosen kind
  await page.click('[data-act="sheet-back"]'); await page.waitForTimeout(450);
  check((await title()) === 'Where is this light?', 'back arrow returns to step 1');
  check((await page.$eval('[data-act="kind-place"][data-p="desk"] .d', el => el.textContent.trim())) === 'Desk tape light', 'the place row reads the chosen kind');
  check(h1 === await h(), 'height unchanged on the way back');
  // back again from step 1 lands on the More sheet with the new label
  await page.click('[data-act="sheet-back"]'); await page.waitForTimeout(450);
  check((await page.$eval('[data-act="ld-kind"] .val', el => el.textContent.trim())) === 'Desk tape light', 'More sheet: Kind reads the new label');
  // reopening lands on step 2 for its place, step 1 one tap back
  await page.click('[data-act="ld-kind"]'); await page.waitForTimeout(450);
  check((await title()) === 'What is it?', 'a set kind reopens on step 2');
  check((await page.$$eval('[data-act="kind-pick"]', els => els.map(e => e.dataset.k))).includes('desk-tape'), '...for its place');
  // tapping the chosen one again clears it
  await page.click('[data-act="kind-pick"][data-k="desk-tape"]'); await page.waitForTimeout(1200);
  s = await saved();
  check(!s.light_kinds['5'] && !s.roles['5'], 'tapping the chosen one again clears the kind and the role');
  check(!(await page.$('[data-act="kind-pick"].sel')), 'nothing selected after the clear');
  // the room is a sheet now: sheet-close would drop past it to Home, and light 6 (below) is reached from it
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); openRoomSheet('20'); }); await page.waitForTimeout(600);

  // 3. a legacy one-word id in the config renders the new label and icon
  await page.evaluate(async () => { S.config.settings.light_kinds['6'] = 'pendant'; await save({ quiet: true }); });
  await page.waitForTimeout(300);
  check((await page.evaluate(() => lightKind('6'))) === 'ceiling-pendant', 'legacy "pendant" reads as ceiling-pendant');
  check((await page.evaluate(() => lightIcon(dev('6')))) === 'lamp-pendant', 'legacy id resolves to the fixture icon');
  check((await page.evaluate(() => lightRole('6'))) === 'ambient', 'legacy id gives the role');
  s = await saved();
  check(s.light_kinds['6'] === 'ceiling-pendant', 'the hub writes the normalised id back: ' + s.light_kinds['6']);
  await page.click('[data-act="light-open"][data-id="6"]'); await page.waitForTimeout(500);
  await page.click('[data-act="ld-more"]'); await page.waitForTimeout(400);
  check((await page.$eval('[data-act="ld-kind"] .val', el => el.textContent.trim())) === 'Ceiling pendant', 'More sheet reads "Ceiling pendant" for a legacy id');
  await page.click('[data-act="ld-kind"]'); await page.waitForTimeout(450);
  check((await title()) === 'What is it?' && !!(await page.$('[data-act="kind-pick"][data-k="ceiling-pendant"].sel')), 'legacy id opens on step 2 with the pendant selected');
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(600);

  // 4. the sort walk: two steps per light, the caption, Next / Done, Skip
  await reset(); await page.waitForTimeout(300);
  const order = await page.evaluate(() => untaggedLights());  // the walk's order: light 1 gets downlights, light 2 is skipped, the rest table lamps
  await page.evaluate(() => openSortWalk()); await page.waitForTimeout(600);
  const n = order.length;
  check((await capn()) === `Light 1 of ${n}` && (await title()) === 'Where is this light?', `walk opens on light 1 of ${n}, step 1`);
  check(!(await page.$('[data-act="sort-next"]')) && !!(await page.$('[data-act="sort-skip"]')), 'step 1 of an untagged light offers Skip only');
  const w1 = await h();
  await page.screenshot({ path: 's13-kind-sort-1.png' });
  await page.click('[data-act="kind-place"][data-p="ceiling"]'); await page.waitForTimeout(450);
  check((await capn()) === `Light 1 of ${n}` && (await title()) === 'What is it?', 'step 2 keeps the caption');
  check(w1 === await h(), 'walk keeps one height across the steps');
  check(/^Next: /.test(await page.$eval('[data-act="sort-next"]', el => el.textContent.trim())), 'step 2 has the Next pill');
  await page.click('[data-act="kind-pick"][data-k="ceiling-downlights"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: 's13-kind-sort-2.png' });
  await page.click('[data-act="sort-next"]'); await page.waitForTimeout(450);
  check((await capn()) === `Light 2 of ${n}` && (await title()) === 'Where is this light?', 'Next moves to light 2, step 1');
  await page.click('[data-act="sort-skip"]'); await page.waitForTimeout(450);
  check((await capn()) === `Light 3 of ${n}`, 'Skip moves to light 3');
  for (let i = 3; i <= n; i++) {
    await page.click('[data-act="kind-place"][data-p="table"]'); await page.waitForTimeout(400);
    await page.click('[data-act="kind-pick"][data-k="table-lamp"]'); await page.waitForTimeout(400);
    if (i === n) check((await page.$eval('[data-act="sort-next"]', el => el.textContent.trim())) === 'Done', 'the last light reads Done');
    await page.click('[data-act="sort-next"]'); await page.waitForTimeout(700);
  }
  check(!(await page.evaluate(() => sheet.isOpen())), 'walk closes after Done');
  const toastText = await page.$eval('#toast', el => el.textContent.trim());
  check(toastText.startsWith(`${n - 1} lights sorted`) && toastText.endsWith('Undo'), 'one toast with Undo: ' + toastText);
  await page.screenshot({ path: 's13-kind-sort-done.png' });
  s = await saved();
  check(s.light_kinds[order[0]] === 'ceiling-downlights' && s.roles[order[0]] === 'ambient' && !s.light_kinds[order[1]] && order.slice(2).every(id => s.light_kinds[id] === 'table-lamp' && s.roles[id] === 'accent'), 'walk saved the picks and left the skipped one alone: ' + JSON.stringify(s.light_kinds));
  // the roles legend on the room card: the kinds walk left the tagged lights with icons. The device tiles (and
  // their discs) live inside a room's own sheet, so open one to see them (the walk itself never needed to).
  await page.evaluate(() => openRoomSheet('20')); await page.waitForTimeout(600);
  check((await page.evaluate(() => document.querySelectorAll('.dtile .ddisc use').length)) >= 1, 'device tiles still draw the lamp discs');
  // the walk just changed what kind these lights are, so the glyph on the tile has to be the new one
  check(await page.evaluate(() => { const els = [...document.querySelectorAll('.dtile .ddisc[data-ldisc]')]; return els.length > 0 && els.every(e => { const u = e.querySelector('use'); const d = dev(e.dataset.ldisc); return !!u && u.getAttribute('href') === '#i-' + lightIcon(d); }); }), "each tile's disc draws the kind the walk gave it");

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  console.log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'ALL OK');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
