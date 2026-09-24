// Nanoleaf: connect two controllers from Settings (a list, not a single toggle card), forget one, control
// colour on the one that is left, file it into an existing room without asking the Lutron bridge to move it,
// and confirm it is offered "Follow the day" like any ct-capable lamp. PORT=4420 node nanoleaf_test.js
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const SHOT = process.env.SHOT_DIR || __dirname;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR|502/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  const shot = n => page.screenshot({ path: `${SHOT}/s22-${n}.png` });
  const text = async sel => ((await page.textContent(sel)) || '').replace(/\s+/g, ' ').trim();

  await page.goto(`http://127.0.0.1:${PORT}/classic/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav button[data-view=settings]', { timeout: 10000 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(300);
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400);
  await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400);

  // ---------- 1. connect flow, with more than one controller ----------
  console.log('before pairing: row says', await text('[data-act="nl-open"] .t'));
  await page.click('[data-act="nl-open"]'); await page.waitForSelector('#sheet-root.in'); await page.waitForTimeout(300);
  await page.waitForSelector('[data-act="nl-pick"]', { timeout: 8000 }); await page.waitForTimeout(200);
  const found = await page.$$eval('[data-act="nl-pick"]', els => els.map(e => ({ host: e.dataset.host, name: e.querySelector('.t').textContent })));
  console.log('found by mDNS:', JSON.stringify(found));
  await shot('nl-find');
  await page.click('[data-act="nl-pick"][data-host="192.168.1.44"]'); await page.waitForTimeout(300);
  console.log('press step:', await text('#sheet-root .tip .t'));
  await shot('nl-press');
  await page.click('[data-act="nl-pair"]'); await page.waitForTimeout(300);
  console.log('waiting label:', await text('[data-act="nl-pair"]'));
  await page.waitForSelector('#sheet-root.in', { state: 'hidden', timeout: 10000 }).catch(() => {}); await page.waitForTimeout(400);
  console.log('after first pairing: row says', await text('[data-act="nl-device"]:first-of-type .t'), '|', await text('[data-act="nl-device"]:first-of-type .d'));
  await shot('nl-connected-one');

  // a second, independent controller, at a different address
  await page.click('[data-act="nl-open"]'); await page.waitForSelector('[data-act="nl-pick"]', { timeout: 8000 }); await page.waitForTimeout(200);
  await page.click('[data-act="nl-pick"][data-host="192.168.1.45"]'); await page.waitForTimeout(300);
  await page.click('[data-act="nl-pair"]'); await page.waitForTimeout(2200);
  const rows = await page.$$eval('[data-act="nl-device"]', els => els.map(e => e.querySelector('.t').textContent));
  console.log('after pairing both: rows', JSON.stringify(rows));
  await shot('nl-connected-two');
  const ids = await page.evaluate(() => Object.keys(S.inv.devices).filter(k => k.startsWith('nanoleaf_')).sort());
  console.log('inventory ids:', JSON.stringify(ids));
  const shapes = await page.evaluate(ids => ids.map(id => ({ id, color: S.inv.devices[id].color, ct: S.inv.devices[id].ct, ct_range: S.inv.devices[id].ct_range, domain: S.inv.devices[id].domain })), ids);
  console.log('device shapes:', JSON.stringify(shapes));

  // ---------- 2. forget one, the other is untouched ----------
  const nlRows = await page.$$('[data-act="nl-device"]');
  await nlRows[nlRows.length - 1].click(); await page.waitForTimeout(300);
  console.log('device sheet:', await text('#sheet-root .sh h2'), '|', await text('#sheet-root .tip .t'));
  await page.click('[data-act="nl-forget"]'); await page.waitForTimeout(700);
  const afterForget = await page.evaluate(() => Object.keys(S.inv.devices).filter(k => k.startsWith('nanoleaf_')));
  console.log('after forgetting one: left', JSON.stringify(afterForget), '| rows now', await page.$$eval('[data-act="nl-device"]', els => els.length));

  const keepId = ids[0]; // NL-1, "Living room panels", the one not forgotten

  // ---------- 3. colour control on the one that is left ----------
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(300);
  await page.evaluate(id => command({ type: 'level', target: `d:${id}`, level: 55 }), keepId); await page.waitForTimeout(500);
  await page.evaluate(() => { window.__cmds = []; const orig = window.command; window.command = a => { window.__cmds.push(a); return orig(a); }; });
  await page.evaluate(id => openLightSheet(id), keepId); await page.waitForSelector('#ld'); await page.waitForTimeout(500);
  console.log('light page: colour row', !!(await page.$('#ld [data-act="light-colour"]')), '| Follow the day row (no location yet)', !!(await page.$('#ld [data-act="follow-open"]')));
  await page.click('#ld [data-act="light-colour"]'); await page.waitForSelector('#sheet-root [data-cwarm]'); await page.waitForTimeout(500);
  await shot('nl-colour');
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const warm = await page.$('#sheet-root [data-cwarm]'); const wb = await warm.boundingBox();
  await touch('touchStart', wb.x + wb.width * 0.15, wb.y + wb.height / 2);
  for (let i = 1; i <= 8; i++) await touch('touchMove', wb.x + wb.width * 0.15 + i * 22, wb.y + wb.height / 2);
  await touch('touchEnd'); await page.waitForTimeout(500);
  const kelvinCmds = await page.evaluate(() => window.__cmds.filter(c => c.type === 'color' && c.kelvin != null));
  console.log('warmth drag: color commands with kelvin', kelvinCmds.length, JSON.stringify(kelvinCmds.slice(-1)));
  if (!(await page.$('#sheet-root .cmore [data-chue]'))) { await page.click('#sheet-root [data-act="c-more"]'); await page.waitForTimeout(400); }
  await page.click('#sheet-root .swatch[data-hex="#ff2a1a"]'); await page.waitForTimeout(500);
  const hexCmds = await page.evaluate(() => window.__cmds.filter(c => c.type === 'color' && c.hex));
  console.log('swatch: hex commands', hexCmds.length, JSON.stringify(hexCmds.slice(-1)));
  await page.waitForTimeout(1800);
  console.log('state after echo:', await page.evaluate(id => JSON.stringify(S.states[id].color), keepId));
  await page.click('#sheet-root [data-act="sheet-back"]'); await page.waitForTimeout(400);
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(400);

  // ---------- 4. room assignment: no bridge-native room, so it starts in Elsewhere and files like a Caseta device ----------
  const apiCalls = [];
  await page.evaluate(() => { window.__apiCalls = window.__apiCalls || []; const orig = window.api; window.api = (path, opts) => { window.__apiCalls.push({ path, body: opts && opts.body ? JSON.parse(opts.body) : null }); return orig(path, opts); }; });
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400);
  await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400);
  await page.click('[data-act="rooms-open"]'); await page.waitForTimeout(500);
  const inElsewhere = await page.$$eval('[data-act="rooms-move"][data-from="none"]', els => els.map(e => e.querySelector('.t').textContent));
  console.log('Elsewhere lists it:', inElsewhere.includes('Living room panels'), '| tag reads', await text(`[data-act="rooms-move"][data-id="${keepId}"] .d`));
  await shot('nl-rooms-elsewhere');
  await page.click(`[data-act="rooms-move"][data-id="${keepId}"]`); await page.waitForSelector('[data-rooms-pick]'); await page.waitForTimeout(300);
  const kitchenRow = await page.$('[data-rooms-pick] [data-v="20"]');
  console.log('Kitchen is offered as a room to move into:', !!kitchenRow, '| move note mentions Hue, not Lutron:', (await text('#sheet-root .d')).includes('Hue bridge is told'));
  if (kitchenRow) await kitchenRow.click();
  await page.waitForTimeout(600);
  const movedArea = await page.evaluate(id => S.inv.devices[id].area, keepId);
  const roomAfter = await page.evaluate(id => { const r = (S.config.settings.rooms || []).find(x => (x.device_ids || []).includes(id)); return r && r.name; }, keepId);
  console.log('filed under app room:', roomAfter, '| bridge-reported area untouched (no native room to move it to):', movedArea);
  const deviceMoveCalls = await page.evaluate(() => window.__apiCalls.filter(c => c.path === '/api/rooms' && c.body && c.body.op === 'device_move'));
  console.log('Lutron device_move calls sent for it:', deviceMoveCalls.filter(c => c.body.id === keepId).length, '(should be 0: nothing to ask a bridge that never had this light)');
  await shot('nl-rooms-filed');

  // ---------- 5. Follow the day: offered exactly like a ct-capable Hue lamp once the home has a location ----------
  await page.evaluate(async () => { S.config.settings.location = { lat: 45.52, lng: -122.68, name: 'Portland' }; await save({ quiet: true, render: false }); });
  await page.waitForTimeout(600);
  await page.click('[data-act="sheet-close"]').catch(() => {});
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(500);
  await page.evaluate(id => openLightSheet(id), keepId); await page.waitForSelector('#ld'); await page.waitForTimeout(500);
  console.log('with a location: Follow the day row', !!(await page.$('#ld [data-act="follow-open"]')), '| value', await text('#ld [data-act="follow-open"] .val'));
  await page.click('#ld [data-act="follow-open"]'); await page.waitForTimeout(500);
  await shot('nl-follow-pane');
  await page.click('#sheet-root [data-act="follow-toggle"]'); await page.waitForTimeout(900);
  const follow = await page.evaluate(() => ({ cfg: S.config.settings.follow_day, live: S.follow }));
  console.log('switched on: config says', JSON.stringify(follow.cfg), '| the connector says', JSON.stringify(follow.live));
  await shot('nl-follow-on');
  await page.waitForTimeout(1500);
  console.log('kelvin it settled on:', await page.evaluate(id => JSON.stringify(S.states[id].color), keepId));

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
