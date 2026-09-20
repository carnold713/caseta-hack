// A hub restart must read as "Reconnecting" for ten seconds, not "Not connected", and the app must not blank what
// it already knows while the connector finds its way back. PORT=4400 node reconnect_test.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const PORT = process.env.PORT || 4400; const BASE = `http://127.0.0.1:${PORT}`;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  let token = null; try { token = fs.readFileSync(`${__dirname}/polish_token.txt`, 'utf8').trim(); } catch (_) {}
  if (token) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, token);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR|favicon|sw\.js|WebSocket/.test(m.text())) errors.push('console: ' + m.text()); });
  const wait = ms => page.waitForTimeout(ms);
  await page.goto(BASE + '/'); await wait(600);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 15000 }); await wait(1500);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); render(); }); await wait(400);

  const read = () => page.evaluate(() => ({
    state: connState(),
    cls: (document.querySelector('#top .status') || {}).className || '',
    title: (document.querySelector('#top .status') || {}).title || '',
    rooms: document.querySelectorAll('.rgrid .rtile.room').length,
    devices: Object.keys(S.inv.devices || {}).length,
    notConnectedRow: !!document.querySelector('.nextrow .t') && /Not connected/.test(document.querySelector('.nextrow .t').textContent),
    headline: (document.querySelector('.hc-head') || {}).textContent || '',
  }));

  const before = await read();
  check(before.state === 'ok' && /\bok\b/.test(before.cls) && before.rooms > 0, `connected to start with (${before.state}, ${before.rooms} rooms)`);

  // 1. the socket drops the way a hub restart drops it
  await page.evaluate(() => { S.ws.onclose(); });
  await wait(300);
  const dropped = await read();
  check(dropped.state === 'reconnecting' && /reconnecting/.test(dropped.cls) && dropped.title === 'Reconnecting', `a fresh drop reads as Reconnecting, not Not connected (${dropped.state}, "${dropped.title}")`);
  check(!dropped.notConnectedRow, 'no "Not connected" row while it is still reconnecting');
  check(dropped.rooms === before.rooms && dropped.devices === before.devices, `the rooms stay on screen (${dropped.rooms} of ${before.rooms})`);
  check(dropped.headline === before.headline, `the house card still says what it said (${dropped.headline})`);

  // 2. a hub that has just come back has nothing to say yet: an empty snapshot must not blank the home
  await page.evaluate(() => {
    const cfg = JSON.parse(JSON.stringify(S.config));
    S.ws.onmessage({ data: JSON.stringify({ type: 'snapshot', inventory: { devices: {}, buttons: {}, scenes: {}, areas: {} }, states: {}, agent: { online: false, info: null }, timers: {}, activity: [], config: cfg }) });
  });
  await wait(500);
  const empty = await read();
  check(empty.rooms === before.rooms && empty.devices === before.devices, `an empty snapshot from a restarting hub does not blank the home (${empty.rooms} rooms, ${empty.devices} devices)`);
  check(empty.state === 'reconnecting' && !empty.notConnectedRow, `and it still reads as Reconnecting (${empty.state})`);

  // 3. ten seconds later, with no connector, it does go red
  await page.evaluate(() => { S.troubleSince = Date.now() - 11000; render(); });
  await wait(400);
  const gone = await read();
  check(gone.state === 'off' && /\boff\b/.test(gone.cls) && gone.title === 'Not connected', `after ten seconds it says Not connected (${gone.state}, "${gone.title}")`);
  check(gone.notConnectedRow, 'and the advice row appears');
  check(gone.rooms === before.rooms, `even then the rooms it knows stay on screen (${gone.rooms})`);

  // 4. the real thing: let it reconnect on its own
  await page.evaluate(() => { if (S.ws) { try { S.ws.close(); } catch (_) {} } connectWS(); });
  await page.waitForFunction(() => connState() === 'ok', null, { timeout: 15000 }).catch(() => {});
  await wait(800);
  const back = await read();
  check(back.state === 'ok' && !back.notConnectedRow && back.rooms === before.rooms, `it comes back green on its own (${back.state}, ${back.rooms} rooms)`);

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  console.log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'ALL OK');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
