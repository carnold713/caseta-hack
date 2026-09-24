// Rooms the app owns: seeding, making, renaming, moving a Lutron light, moving a Hue lamp, deleting,
// the pickers, adding a device into a room with no Lutron area, and a:<room> on the connector.
// This one restarts the fake connector itself: the fake bridges keep what a run did to them, so the
// only way to a clean start is a fresh one. It kills any fake connector on this test's own port, by
// reading /proc/<pid>/environ rather than by matching the command line, so a sibling rig is untouched.
const { chromium } = require('playwright-core');
const fs = require('fs');
const { spawn } = require('child_process');
const PORT = process.env.PORT || process.env.HUB_PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// The fake bridges keep what a run did to them (new areas, moved lights), so every run starts them again.
// REFUSE_AREA=1 is the owner's own Lutron bridge: it answers 400 BadRequest to CreateRequest /area.
function restartFake(refuse) {
  // Every connector attached to this hub has to go, not just the one this test started: another rig's
  // connector would reconnect and quietly undo the behaviour the next checks are about to measure.
  try {
    for (const pid of fs.readdirSync('/proc').filter(x => /^\d+$/.test(x))) {
      let env = '';
      try { env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch (_) { continue; }
      let cmd = '';
      try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch (_) { continue; }
      if (cmd.includes('fake_connector') && env.includes(`HUB_PORT=${PORT}\u0000`)) { try { process.kill(Number(pid)); } catch (_) {} }
    }
  } catch (_) { /* not linux, fall through to the pid file */ }
  try { process.kill(Number(fs.readFileSync(__dirname + '/fakeR.pid', 'utf8').trim())); } catch (_) {}
  const out = fs.openSync(__dirname + '/fakeR.log', 'a');
  const env = { ...process.env, HUB_PORT: String(PORT), LAG_MS: '150' };
  if (refuse) env.REFUSE_AREA = '1'; else delete env.REFUSE_AREA;
  const child = spawn('node', [require('path').join(__dirname, 'fake_connector.js')], { env, detached: true, stdio: ['ignore', out, out] });
  fs.writeFileSync(__dirname + '/fakeR.pid', String(child.pid));
  child.unref();
}
const FRESH = { version: 3, settings: {}, groups: [], presets: [], bindings: [], favorites: [], schedules: [] };
// The hub may still be handing out the snapshot it had when the connector reconnected, so the wipe is repeated
// until the page itself agrees the home has no rooms of its own.
async function resetConfig(page) {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(c => api('/api/config', { method: 'PUT', body: JSON.stringify(c) }).catch(() => {}), FRESH);
    await page.waitForTimeout(400);
    if (await page.evaluate(() => appRooms().length === 0)) return true;
  }
  return false;
}

(async () => {
  restartFake(false); await wait(2000);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR|502/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/classic/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('#nav button[data-view=settings]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); });
  // a clean home: no rooms of the app's own yet
  check('the home starts with no rooms of its own', await resetConfig(page), await page.evaluate(() => appRooms()));

  // Pair the fake Hue bridge first, so a Hue room ("Office") is part of the home the way the owner's is.
  await page.evaluate(() => api('/api/hue', { method: 'POST', body: JSON.stringify({ op: 'pair', host: '192.168.1.20' }) }));
  await page.waitForTimeout(2200);
  check('Hue room joined the home', await page.evaluate(() => !!(S.inv.areas || {}).hue_room1), await page.evaluate(() => Object.keys(S.inv.areas || {})));

  // 1. Nothing seeded yet: the app still reads the bridges, exactly as before.
  check('no app rooms before anything is touched', await page.evaluate(() => appRooms().length === 0), await page.evaluate(() => appRooms()));
  const bridgeRooms = await page.evaluate(() => areas().map(a => a.name));
  check('rooms come from the bridges to start with', bridgeRooms.join(',') === 'Bedroom,Hall,Kitchen,Office,Outside', bridgeRooms);

  // 2. Settings has the Rooms row; opening it seeds the list from both bridges, keeping their ids.
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400);
  await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); 
  await page.click('[data-act="rooms-open"]'); await page.waitForTimeout(700);
  const seeded = await page.evaluate(() => appRooms().map(r => [r.id, r.name, r.bridge_area, r.hue_room]));
  check('seeded one room per bridge room, ids kept', seeded.length === 5
    && seeded.some(r => r[0] === '20' && r[1] === 'Kitchen' && r[2] === '20' && r[3] === null)
    && seeded.some(r => r[0] === 'hue_room1' && r[1] === 'Office' && r[2] === null && r[3] === 'hue_room1'), seeded);
  check('the Rooms page lists them', (await page.$$eval('[data-act="rooms-one"] .t', e => e.map(x => x.textContent))).join(',') === 'Bedroom,Hall,Kitchen,Office,Outside', await page.$$eval('[data-act="rooms-one"] .t', e => e.map(x => x.textContent)));
  await page.screenshot({ path: 'rooms-list.png' });

  // seeding must not change what any room resolves to
  const kitchenBefore = await page.evaluate(() => targetDevices('a:20').sort());
  check('a:20 still resolves to the Kitchen lights', kitchenBefore.join(',') === '5,6', kitchenBefore);

  // 3. Make a room. The app has it at once; the Lutron bridge is asked for one to match (this rig accepts).
  await page.click('[data-act="rooms-new"]'); await page.waitForTimeout(1200);
  const made = await page.evaluate(() => { const r = appRooms().find(x => x.name === 'New room'); return r ? { id: r.id, area: r.bridge_area, len: r.id.length } : null; });
  check('a new room exists in the app', !!made && made.len === 8, made);
  check('the Lutron bridge made an area for it', !!made && made.area === '30', made);
  await page.fill('#room-name', 'Studio'); await page.waitForTimeout(1600);
  check('renaming saves and reaches the bridge', await page.evaluate(() => appRooms().some(r => r.name === 'Studio')) && await page.evaluate(() => (S.inv.areas['30'] || {}).name === 'Studio'), await page.evaluate(() => [appRooms().map(r => r.name), (S.inv.areas['30'] || {}).name]));
  await page.screenshot({ path: 'rooms-one.png' });
  const studio = await page.evaluate(() => appRooms().find(r => r.name === 'Studio').id);

  // 4. Move a Lutron light (Island Pendants, id 6, Kitchen) into Studio.
  await page.click('[data-act="rooms-add"]'); await page.waitForSelector('#sheet-root.in'); await page.waitForTimeout(500);
  await page.screenshot({ path: 'rooms-add.png' });
  await page.click('[data-act="rooms-move-to"][data-id="6"]'); await page.waitForTimeout(1400);
  check('the light is filed in the new room', await page.evaluate(() => devArea(dev('6')) === appRooms().find(r => r.name === 'Studio').id), await page.evaluate(() => devArea(dev('6'))));
  check('it left the Kitchen everywhere', (await page.evaluate(() => targetDevices('a:20'))).join(',') === '5', await page.evaluate(() => targetDevices('a:20')));
  check('the new room resolves to it', (await page.evaluate(id => targetDevices('a:' + id), studio)).join(',') === '6', await page.evaluate(id => targetDevices('a:' + id), studio));
  check('the Lutron bridge moved it too', await page.evaluate(() => dev('6').area === '30'), await page.evaluate(() => dev('6').area));
  check('areaName answers for an app room id', await page.evaluate(id => areaName(id), studio) === 'Studio', await page.evaluate(id => areaName(id), studio));

  // 5. Move a Hue lamp (hue_l1, Desk lamp, in the Hue Office) into Studio: the Hue bridge is told too, and
  //    because Studio is not a Hue room yet, one is made there first.
  await page.click('[data-act="rooms-add"]'); await page.waitForTimeout(500);
  await page.click('[data-act="rooms-move-to"][data-id="hue_l1"]'); await page.waitForTimeout(1800);
  check('the Hue lamp is in the app room', await page.evaluate(id => devArea(dev('hue_l1')) === id, studio), await page.evaluate(() => devArea(dev('hue_l1'))));
  const hueRoom = await page.evaluate(id => (appRooms().find(r => r.id === id) || {}).hue_room, studio);
  check('a Hue room was made for it', hueRoom === 'hue_room2', hueRoom);
  check('the Hue bridge moved the lamp', await page.evaluate(() => dev('hue_l1').area === 'hue_room2'), await page.evaluate(() => dev('hue_l1').area));
  const mixed = await page.evaluate(id => targetDevices('a:' + id).sort(), studio);
  check('one room holds a Lutron light and a Hue lamp', mixed.join(',') === '6,hue_l1', mixed);
  await page.screenshot({ path: 'rooms-mixed.png' });

  // 6. Every picker offers the app's rooms. Home first.
  await page.click('#nav button[data-view=home]'); await page.waitForTimeout(700);
  const homeRooms = await page.$$eval('.rgrid .room .n', e => e.map(x => x.textContent));
  check('Home lists the app rooms', homeRooms.join(',') === 'Bedroom,Hall,Kitchen,Office,Outside,Studio', homeRooms);
  await page.screenshot({ path: 'rooms-home.png' });
  // the room, opened by its app room id: a sheet now, not a pushed page, so its title lives in the sheet's own
  // header rather than #top (an intentional interface change, not a regression: see the room-sheet work)
  await page.click(`.rgrid .room[data-room="${studio}"] .head`); await page.waitForTimeout(600);
  const ttl = await page.textContent('#sheet-root .sh h2').catch(() => '');
  check('the room opens as a sheet on an app room', /Studio/.test(ttl) && (await page.$$eval('.dgrid .dtile.light .dn', e => e.map(x => x.textContent))).length === 2, [ttl, await page.$$eval('.dgrid .dtile.light .dn', e => e.map(x => x.textContent))]);
  await page.screenshot({ path: 'rooms-roompage.png' });
  // room setup reaches the Rooms page for this room
  await page.click('[data-act="room-setup"]'); await page.waitForTimeout(500);
  check('room setup offers the room itself', await page.$(`[data-act="rooms-open"][data-id="${studio}"]`) !== null, null);
  await page.click(`[data-act="rooms-open"][data-id="${studio}"]`); await page.waitForTimeout(600);
  check('it opens that room', await page.evaluate(() => S.view === 'rooms' && !!S.roomsEdit), await page.evaluate(() => [S.view, S.roomsEdit]));
  // back goes where it came from
  await page.click('[data-act="rooms-one-back"]'); await page.waitForTimeout(300);
  await page.click('[data-act="rooms-back"]'); await page.waitForTimeout(500);
  check('back returns to the room it came from', await page.evaluate(() => S.view === 'room'), await page.evaluate(() => S.view));

  // a remote's "which lights" chips, an automation's chips and the scene editor all read the same list
  const remoteChips = await page.evaluate(() => areas().map(a => `a:${a.id}`).filter(targetExists).map(t => targetName(t)));
  check('targets name the app rooms', remoteChips.includes('Studio') && remoteChips.includes('Kitchen'), remoteChips);
  const opts = await page.evaluate(() => targetOptions().filter(o => o.kind === 'room').map(o => o.name));
  check('the lights picker offers them', opts.includes('Studio'), opts);

  // 7. Adding a device into a room with no Lutron area of its own: the Hue Office.
  await page.click('#nav button[data-view=settings]'); await page.waitForTimeout(400);
  await page.click('[data-act="settings-page"][data-p="devices"]'); await page.waitForTimeout(400); 
  await page.click('[data-act="ad-open"]'); await page.waitForSelector('#sheet-root.in'); await page.waitForTimeout(400);
  await page.click('[data-act="ad-kind"][data-k="pico"]'); await page.waitForSelector('[data-act="ad-pick"]', { timeout: 10000 });
  await page.click('[data-act="ad-pick"]'); await page.waitForTimeout(500);
  const chips = await page.$$eval('[data-ad-rooms] .chip', e => e.map(x => x.textContent));
  // the room picker also offers a "New room" chip at the end now (adding a room from wherever you'd think to);
  // filtered out here since this check is about the app's existing rooms, not that affordance
  const roomChips = chips.filter(c => c !== 'New room');
  check('adding a device offers every app room, Hue included', roomChips.join(',') === 'Bedroom,Hall,Kitchen,Office,Outside,Studio', chips);
  await page.fill('#ad-name', 'Office Pico');
  await page.click('[data-act="ad-area"][data-id="hue_room1"]'); await page.waitForTimeout(400);
  const note = await page.textContent('.small.faint');
  check('it says which Lutron room will be used', /no room called Office/.test(note) && /filed in Office here/.test(note), note);
  await page.screenshot({ path: 'rooms-add-device.png' });
  await page.click('[data-act="ad-create"]'); await page.waitForSelector('[data-act="ad-again"]', { timeout: 10000 }); await page.waitForTimeout(1200);
  const done = await page.textContent('.ad-done .muted');
  check('the done step explains both rooms', /It is in Office/.test(done) && /Lutron bridge has it under/.test(done), done);
  await page.screenshot({ path: 'rooms-add-done.png' });
  await page.click('[data-act="sheet-close"]'); await page.waitForTimeout(800);
  check('the new remote is in the app room that was chosen', await page.evaluate(() => devArea(dev('13')) === 'hue_room1'), await page.evaluate(() => [dev('13') && dev('13').area, devArea(dev('13'))]));

  // 8. Delete a room: nothing leaves the home, its devices go back to their bridge room, and Undo works.
  await page.click('[data-act="rooms-open"]'); await page.waitForTimeout(500);
  await page.click(`[data-act="rooms-one"][data-id="${studio}"]`); await page.waitForTimeout(400);
  await page.click('[data-act="rooms-delete"]'); await page.waitForTimeout(1200);
  check('the room is gone', await page.evaluate(id => !appRooms().some(r => r.id === id), studio), await page.evaluate(() => appRooms().map(r => r.name)));
  check('its Lutron light went back to its bridge room', await page.evaluate(() => devArea(dev('6')) === '30' || devArea(dev('6')) === 'none'), await page.evaluate(() => devArea(dev('6'))));
  check('its Hue lamp went back to its bridge room', await page.evaluate(() => devArea(dev('hue_l1')) === 'hue_room2' || devArea(dev('hue_l1')) === 'none'), await page.evaluate(() => devArea(dev('hue_l1'))));
  check('no device was removed from the home', await page.evaluate(() => !!dev('6') && !!dev('hue_l1')), null);
  const undo = await page.$('#toast button[data-act="toast-undo"]');
  check('deleting offers Undo', !!undo, null);
  if (undo) { await undo.click(); await page.waitForTimeout(1200); }
  check('Undo puts the room back with its lights', await page.evaluate(id => { const r = appRooms().find(x => x.id === id); return !!r && r.device_ids.includes('6') && r.device_ids.includes('hue_l1'); }, studio), await page.evaluate(() => appRooms()));

  // 9. A device the bridges stop reporting leaves its room quietly.
  await page.evaluate(() => { delete S.inv.devices['6']; S.inv.devices = { ...S.inv.devices }; ensureRooms(); });
  await page.waitForTimeout(900);
  check('a light the bridges no longer report is dropped', await page.evaluate(id => !(appRooms().find(x => x.id === id) || {}).device_ids.includes('6'), studio), await page.evaluate(() => appRooms()));

  // 10. The owner's own bridge: it refuses CreateRequest /area. The room is still made, and the app says so.
  restartFake(true); await wait(2500);
  await resetConfig(page);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); goRooms(); });
  await page.waitForTimeout(800);
  await page.click('[data-act="rooms-new"]'); await page.waitForTimeout(1600);
  const refused = await page.evaluate(() => appRooms().find(r => r.name === 'New room'));
  check('a refused area does not lose the room', !!refused && refused.bridge_area === null, refused);
  const where = await page.textContent('.tip .cap ~ .d').catch(() => '');
  check('the room page says the bridge refused, not that it has a room', /would not make a room/i.test(where || '') && /lives here only/i.test(where || ''), where);
  await page.screenshot({ path: 'rooms-refused.png' });
  // and a light can still be moved into it: the app is what decides where it lives
  await page.click('[data-act="rooms-add"]'); await page.waitForTimeout(600);
  await page.click('[data-act="rooms-move-to"][data-id="5"]'); await page.waitForTimeout(1400);
  check('a light moves into a room the bridge refused', await page.evaluate(() => devArea(dev('5')) === appRooms().find(r => r.name === 'New room').id), await page.evaluate(() => devArea(dev('5'))));
  check('and that room resolves to it', (await page.evaluate(() => targetDevices('a:' + appRooms().find(r => r.name === 'New room').id))).join(',') === '5', await page.evaluate(() => targetDevices('a:' + appRooms().find(r => r.name === 'New room').id)));
  check('the Lutron bridge still has the light where it was', await page.evaluate(() => dev('5').area === '20'), await page.evaluate(() => dev('5').area));

  // leave the home as it was found: no rooms of the app's own, nothing moved, so the next suite on this rig
  // starts from the same house every other test expects
  restartFake(false); await wait(2500);
  await resetConfig(page);

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  console.log(bad ? `FAILED ${bad}` : 'rooms: ok');
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
