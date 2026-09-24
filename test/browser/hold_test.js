// A hold nobody has set on an arrow whose press nudges the brightness. The connector ramps it anyway
// (agent/test_holdstep.py is that side); what this checks is that the app says so, because a button
// reading "Nothing yet" while it is busy dimming the room is the app lying about itself.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/classic/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 }); await page.waitForTimeout(1200);

  // a clean Kitchen Pico with one thing on it: the up arrow nudges the room brighter on a press
  const arrows = await page.evaluate(async () => {
    S.config.bindings = bindings().filter(b => b.device_id !== '9');
    const pair = arrowPair('9');
    S.config.bindings.push({ id: uid(), device_id: '9', button_number: pair.up, gesture: 'single', actions: [{ type: 'step', target: 'a:20', delta: 10 }], night: null });
    S.config.bindings.push({ id: uid(), device_id: '9', button_number: pair.down, gesture: 'single', actions: [{ type: 'step', target: 'a:20', delta: -10 }], night: null });
    await save({ quiet: true });
    return pair;
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
  check(arrows && arrows.up != null && arrows.down != null, `the Pico has a pair of arrows (${JSON.stringify(arrows)})`);

  const holdLine = async n => {
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(300);
    await page.evaluate(num => { S.remote = '9'; openButtonSheet(num); }, n); await page.waitForTimeout(600);
    return (await page.textContent('[data-act="gesture-open"][data-g="hold"] .d')).trim();
  };

  let line = await holdLine(arrows.up);
  check(/^Brightens while holding/.test(line), `the up arrow's hold says it brightens ("${line}")`);
  check(!/^Nothing yet/.test(line), 'and no longer reads as unset');
  check(!!(await page.$('[data-act="gesture-open"][data-g="hold"] .ic.on')), 'its icon is lit like anything else that does something');
  check(!(await page.$('[data-act="gesture-open"][data-g="hold"] .d.none')), 'and the line is not greyed');

  line = await holdLine(arrows.down);
  check(/^Dims while holding/.test(line), `the down arrow's hold says it dims ("${line}")`);

  // the sheet behind the row has to say it too, and name what the press actually nudges rather than
  // whatever the chooser happens to have picked
  await page.click('[data-act="gesture-open"][data-g="hold"]'); await page.waitForTimeout(800);
  const tip = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.tip')].find(x => /Already works/.test(x.textContent));
    return t ? t.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check(!!tip, 'the hold sheet carries the note');
  check(tip && /dims/.test(tip), `which says which way it goes ("${tip}")`);
  const room = await page.evaluate(() => targetName('a:20'));
  check(tip && tip.includes(room), `and names the lights the press nudges (${room})`);
  await page.screenshot({ path: __dirname + '/hold-inherited.png' });

  // anything set by hand wins, and the note goes away
  await page.evaluate(async () => {
    const pair = arrowPair('9');
    S.config.bindings.push({ id: uid(), device_id: '9', button_number: pair.up, gesture: 'hold', actions: [{ type: 'level', target: 'a:20', level: 0 }], night: null });
    await save({ quiet: true });
  });
  await page.waitForTimeout(600);
  line = await holdLine(arrows.up);
  check(!/while holding/.test(line), `a hold set by hand is what shows ("${line}")`);

  // and a press that is not a nudge inherits nothing
  await page.evaluate(async () => {
    const pair = arrowPair('9');
    S.config.bindings = bindings().filter(b => b.device_id !== '9');
    S.config.bindings.push({ id: uid(), device_id: '9', button_number: pair.up, gesture: 'single', actions: [{ type: 'level', target: 'a:20', level: 100 }], night: null });
    await save({ quiet: true });
  });
  await page.waitForTimeout(600);
  line = await holdLine(arrows.up);
  check(line === 'Nothing yet', `a press that turns lights on lends the hold nothing ("${line}")`);

  console.log('errors: ' + (errors.length ? errors.join(' | ') : 'none'));
  if (errors.length) fails.push('page errors');
  await browser.close();
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
