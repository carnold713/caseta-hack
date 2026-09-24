// One press of Back is one step. The owner had to press Back "a bunch of times" to get anywhere: every tab switch
// was a step of its own, and closing a sheet wrote the page over the sheet's entry, so the next Back landed on the
// same page again. Now a tab never stacks (Back from any tab is Home), a sheet opened from its page is closed by
// stepping back, and a page opened from a page is one step. Also here: text never selects on a tap.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (what, ok, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push('console: ' + m.text()); });
  const root = `http://127.0.0.1:${PORT}/`;
  await page.goto(root + '#home');
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(1000);
  // a fresh home greets once; answer it so it is not over the tabs
  await page.evaluate(async () => { const c = window.__copper; if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.save('', { quiet: true }); } c.closeSheet(); });
  await wait(400);
  const where = () => page.evaluate(() => ({ hash: location.hash, n: history.state && history.state.n, sheet: !!document.querySelector('#sheet-root .sheet') }));
  const tab = async t => { await page.click(`#tabs [data-go="${t}"]`); await wait(700); };
  const back = async () => { await page.goBack().catch(() => {}); await wait(700); };

  // hopping through every tab and pressing Back once lands on Home
  await tab('rooms'); await tab('remotes'); await tab('routines'); await tab('settings'); await tab('rooms');
  let w = await where();
  check('after five tab hops the history under Rooms is only Home', w.hash === '#rooms' && w.n === 1, w);
  await back();
  w = await where();
  check('one Back from a tab is Home', w.hash === '#home' && w.n === 0, w);

  // a page opened from a tab is one step; Back returns to the tab
  await tab('rooms');
  const roomGo = await page.evaluate(() => { const el = document.querySelector('#screen [data-go^="room/"]'); return el && el.dataset.go; });
  check('Rooms lists a room to open', !!roomGo, roomGo);
  if (roomGo) {
    await page.evaluate(g => document.querySelector(`#screen [data-go="${g}"]`).click(), roomGo); await wait(900);
    check('the room is one step above Rooms', (await where()).n === 2, await where());
    await back();
    check('Back from the room is Rooms', (await where()).hash === '#rooms', await where());
  }

  // a sheet opened from its page, closed with its X, then one Back: Home, not Settings twice
  await tab('settings');
  await page.evaluate(() => document.querySelector('#screen [data-go^="settings/"]').click());
  await page.waitForSelector('#sheet-root .sheet', { timeout: 5000 }).catch(() => {});
  await wait(600);
  w = await where();
  check('the sheet is a step of its own over Settings', w.sheet && w.n === 2, w);
  const x = await page.evaluate(() => { const b = document.querySelector('#sheet-root .sheet-head [data-act="sheet-close"], #sheet-root [data-act="sheet-close"]'); if (b) b.click(); return !!b; });
  check('the sheet has its close button', x);
  await wait(800);
  w = await where();
  check('closing it steps back to Settings', !w.sheet && w.hash === '#settings' && w.n === 1, w);
  await back();
  w = await where();
  check('and one more Back is Home', w.hash === '#home' && w.n === 0, w);

  // switching tabs from deep inside another tab still leaves only Home underneath
  await tab('rooms');
  if (roomGo) { await page.evaluate(g => document.querySelector(`#screen [data-go="${g}"]`).click(), roomGo); await wait(800); }
  await tab('remotes');
  w = await where();
  check('a tab tapped from a room sits right above Home', w.hash === '#remotes' && w.n === 1, w);
  await tab('home');
  w = await where();
  check('the Home tab is the bottom', w.hash === '#home' && w.n === 0, w);

  // text does not select on a tap, but a field still does
  const sel = await page.evaluate(() => [getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect, (() => { const i = document.createElement('input'); document.body.appendChild(i); const v = getComputedStyle(i).userSelect || getComputedStyle(i).webkitUserSelect; i.remove(); return v; })()]);
  check('words on the page never select on a tap; a field still does', sel[0] === 'none' && sel[1] !== 'none', sel);
  await page.dblclick('.home-head h1').catch(() => {});
  check('a double tap on the title selects nothing', (await page.evaluate(() => String(getSelection()))) === '');

  check('no errors on the page', !errors.length, errors);
  await browser.close();
  if (fails.length) { console.log(`FAILED ${fails.length}`); process.exit(1); }
})().catch(e => { console.log('FAILED', e.message); process.exit(1); });
