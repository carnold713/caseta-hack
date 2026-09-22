// Copper Night (/ui/), phase 4: remotes and routines. The Remotes list (21) and a press on a real remote jumping to
// it, a remote's page (07) with its leaders, what one press does (08) and what it controls (09), night versions,
// steps, the usual layout, Press timing (25); Routines (10), a routine made and changed through its sentence (23),
// the guided setups (22), the evening wind-down, and Activity (24). Geometry against the frames, read with
// read-only use_figma scripts. Puts the config back as it found it.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.removeItem('usualHidden:9'); localStorage.removeItem('tzKeep'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const base = `http://127.0.0.1:${PORT}/ui/`;
  const C = (fn, arg) => page.evaluate(fn, arg);
  const go = async hash => { await page.goto(base + '#' + hash); await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900); };
  const cfg = () => C(() => window.__copper.S.config);
  const tap = async sel => { await C(s => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel); await wait(700); };
  const toastText = () => C(() => (document.querySelector('#toast-root .msg') || {}).textContent || '');

  await page.goto(base);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(800);
  const before = await C(() => JSON.stringify(window.__copper.S.config));
  // start from remotes with nothing set, as a new home would
  await C(async () => { const c = window.__copper; c.S.config.bindings = []; await c.save('', { quiet: true }); });
  const at = async (what, list, inSheet) => {
    const got = await C(([L, sh]) => { const top = sh ? document.querySelector('#sheet-root .sheet').getBoundingClientRect().top : -scrollY; return L.map(([n, sel]) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top - top, b.width, b.height].map(v => Math.round(v)); }); }, [list, inSheet]);
    list.forEach(([n, , ...exp], i) => { const v = got[i]; const off = !v ? ['missing'] : exp.map((x, j) => (x == null || Math.abs(v[j] - x) <= 1 ? null : `${'xywh'[j]} ${v[j]} not ${x}`)).filter(Boolean); check(`${what}: ${n} where the file has it`, !off.length, off.join(', ')); });
  };

  // ---- 21 Remotes
  await go('remotes');
  check('Remotes lists each Pico as a card', (await page.$$('.rcard')).length === (await C(() => window.__copper.data.remotes().length)));
  await at('21 Remotes', [['H1 (its padding box: the text is at 20, 58)', '.top-h1', 0, 0, null, 102], ['listening banner', '.listen', 20, 128, 372, 48], ['first card', '.rcard:nth-child(1)', 20, 196, 180, 232], ['second card', '.rcard:nth-child(2)', 212, 196, 180, 232],
    ['stage', '.rcard:nth-child(1) .rc-stage', 28, 204, 164, 136], ['name', '.rcard:nth-child(1) .rc-nm', 36, 346, 156, null], ['status', '.rcard:nth-child(1) .rc-st', 36, 374, null, 18], ['usual link', '.rcard:nth-child(1) .rc-usual', 36, 394, null, 18]]);
  check('a card with nothing set says so and offers the usual way', /Nothing set up yet/.test(await page.textContent('.rcard:nth-child(1)')) && !!(await page.$('.rcard .rc-usual')));
  // a press on the real Kitchen Pico (9): the list jumps to it with that key picked
  await C(() => window.__copper.live({ type: 'gesture', device_id: '9', button_number: 2, gesture: 'single' })); await wait(900);
  check('a press on a real remote jumps to it', /#remote\/9$/.test(page.url()), page.url());
  check('with the key it pressed picked', /bottom button/i.test(await page.textContent('.rm-key')), await page.textContent('.rm-key'));

  // ---- 07 a remote
  await go('remote/9');
  check('nothing set: the usual way is offered', !!(await page.$('.offer')));
  await tap('[data-act="usual-hide"]');
  check("I'll pick myself hides it", !(await page.$('.offer')));
  await at('07 Remote', [['H1 (its padding box: the text is at 20, 128)', '.page-h1', 0, 108, null, 64], ['caption', '.rm-sub', 20, 176, null, 17], ['banner', '.listen.pin', 20, 208, 327, 36], ['stage', '.rstage', 20, 256, 372, 332], ['key overline', '.rm-key', 20, 606, null, 14], ['press group', '.remote-page .group', 20, 626, 372, null]]);
  check('the caption names room, finish and model', (await page.textContent('.rm-sub')) === 'Kitchen · White · 3-button with arrows', await page.textContent('.rm-sub'));
  check('a leader for each of the five keys, each saying Nothing yet', (await page.$$('.ld')).length === 5 && (await page.$$('.ld.none')).length === 5);
  await tap('.ld[data-n="3"]');
  check('tapping a leader picks that key', /up arrow/i.test(await page.textContent('.rm-key')));
  await tap('.pico-svg .pk[data-n="0"]');
  check('so does tapping the key on the picture', /top button/i.test(await page.textContent('.rm-key')) && !!(await page.$('.pk.sel[data-n="0"]')));

  // ---- 08 one press
  await tap('.prow[data-grow="0/single"]');
  check('Press opens its sheet', (await page.textContent('#sheet-root h2')) === 'Top button · Press' && /#remote\/9\/k0-single$/.test(page.url()), await page.textContent('#sheet-root h2'));
  check('Controls starts on the remote\'s room', (await page.textContent('#sheet-root [data-act="controls"] .row-val')) === 'Kitchen');
  check('five suggested ways', (await page.$$('#sheet-root .press .t-over + .group .way')).length === 5);
  await tap('#sheet-root .way[data-r="on"]');
  let b = (await cfg()).bindings.find(x => x.device_id === '9' && x.button_number === 0 && x.gesture === 'single');
  check('Turn on is set on the top button', !!b && b.actions[0].level === 'on' && b.actions[0].target === 'a:20', b);
  check('and said in the toast', (await toastText()) === 'Top button · Press → Turn on · Kitchen', await toastText());
  check('the picked way is ticked', !!(await page.$('#sheet-root .way.sel[data-r="on"] .radio.on')));
  // night
  await tap('#sheet-root [data-act="night-toggle"]');
  b = (await cfg()).bindings.find(x => x.device_id === '9' && x.button_number === 0 && x.gesture === 'single');
  check('Different at night gives it a nightlight version', !!b.night && b.night.actions[0].level === 10, b.night);
  check('with its sentence under the switch', /At night:/.test(await page.textContent('#sheet-root .nsent')));
  // 09 Controls: one light
  await tap('#sheet-root [data-act="controls"]');
  check('Controls opens inside the sheet with a back arrow', (await page.textContent('#sheet-root h2')) === 'Controls' && !!(await page.$('#sheet-root .sheet-back')));
  await tap('#sheet-root [data-act="ctl-mode"][data-m="one"]');
  const one = await C(() => document.querySelector('#sheet-root [data-act="ctl-set"][data-t^="d:"]').dataset.t);
  await tap(`#sheet-root [data-act="ctl-set"][data-t="${one}"]`);
  b = (await cfg()).bindings.find(x => x.device_id === '9' && x.button_number === 0 && x.gesture === 'single');
  check('picking one light moves the press, and its night version, onto it', b.actions[0].target === one && b.night.actions[0].target === one, [b.actions[0].target, b.night.actions[0].target, one]);
  check('the summary says what it controls', /Controls 1 light/.test(await page.textContent('#sheet-root .ctl-sum')), await page.textContent('#sheet-root .ctl-sum'));
  await tap('#sheet-root [data-act="ctl-mode"][data-m="several"]');
  const two = await C(() => [...document.querySelectorAll('#sheet-root [data-act="ctl-toggle"]')].map(e => e.dataset.t));
  await tap(`#sheet-root [data-act="ctl-toggle"][data-t="${two.find(t => t !== one)}"]`);
  b = (await cfg()).bindings.find(x => x.device_id === '9' && x.button_number === 0 && x.gesture === 'single');
  check('Pick several adds a second light', Array.isArray(b.actions[0].target) && b.actions[0].target.length === 2, b.actions[0].target);
  await tap('#sheet-root [data-act="picker-back"]');
  // More choices keeps its tick in place
  await tap('#sheet-root [data-act="ways"]');
  check('More choices lists every way, grouped', (await page.$$('#sheet-root .ways .t-over')).length >= 3);
  await tap('#sheet-root .way[data-r="full"]');
  b = (await cfg()).bindings.find(x => x.device_id === '9' && x.button_number === 0 && x.gesture === 'single');
  check('Full brightness from More choices', b.actions[0].level === 100 && !!(await page.$('#sheet-root .way.sel[data-r="full"]')), b.actions);
  await tap('#sheet-root [data-act="picker-back"]');
  // step by step
  await tap('#sheet-root .press-steps[data-act="steps"]');
  const n0 = b.actions.length;
  await tap('#sheet-root [data-act="st-add"]'); await wait(600);
  b = (await cfg()).bindings.find(x => x.device_id === '9' && x.button_number === 0 && x.gesture === 'single');
  check('Add a step', b.actions.length === n0 + 1, b.actions);
  await page.selectOption('#sheet-root .st-card:nth-of-type(2) select[data-k="type"]', 'delay'); await wait(900);
  b = (await cfg()).bindings.find(x => x.device_id === '9' && x.button_number === 0 && x.gesture === 'single');
  check('a step changed through its fields', b.actions[1] && b.actions[1].type === 'delay', b.actions);
  await tap('#sheet-root [data-act="picker-back"]');
  check('two steps read as your own', !!(await page.$('#sheet-root .way.sel[data-act="steps"]')));
  await tap('#sheet-root [data-act="clear"]');
  check('Clear this press', !(await cfg()).bindings.some(x => x.device_id === '9' && x.button_number === 0 && x.gesture === 'single'));
  await tap('#sheet-root .sheet-close');
  check('closing the sheet returns to the remote', /#remote\/9$/.test(page.url()), page.url());

  // a hold: brighten while held is a start and a stop
  await go('remote/9/k3-hold');
  await tap('#sheet-root .way[data-r="hold_up"]');
  const holds = (await cfg()).bindings.filter(x => x.device_id === '9' && x.button_number === 3).map(x => x.gesture).sort();
  check('a hold to brighten is a start and a stop', holds.join() === 'hold_end,hold_start', holds);
  await tap('#sheet-root .sheet-close');
  await tap('.ld[data-n="3"]');
  check('its leader says so', /Hold: Brighten while held/.test(await page.textContent('.ld[data-n="3"]')), await page.textContent('.ld[data-n="3"]'));

  // More: the usual layout, the picture
  await go('remote/9/more');
  await tap('#sheet-root [data-act="usual"]');
  const nb = (await cfg()).bindings.filter(x => x.device_id === '9').length;
  check('the usual layout sets every key', nb >= 10, nb);
  await tap('#sheet-root [data-act="rm-look"]');
  await tap('#sheet-root [data-act="look-finish"][data-f="black"]');
  check('the picture can change finish', (await cfg()).settings.remote_looks['9'].finish === 'black');
  await tap('#sheet-root [data-act="look-finish"][data-f="white"]');
  await go('remote/9');
  check('with everything set, every dot is blue', (await page.$$('.rstage .sd.set')).length === 5);
  await go('remotes');
  check('and the card counts it', /5 of 5 set/.test(await page.textContent('.rcard[data-go="remote/9"]')), await page.textContent('.rcard[data-go="remote/9"]'));

  // ---- 25 Press timing
  await go('timing');
  // the caption is one line in the file's face and may wrap in a stand-in one, so the card is measured from it
  await at('25 Press timing', [['H1 (its padding box: the text is at 20, 128)', '.page-h1', 0, 108, null, 64], ['caption', '.tm-sub', 20, 180, null, null], ['tester', '.tm-card', 20, null, 372, 404], ['sliders', '.tm-group', 20, null, 372, 192]]);
  const gaps = await C(() => { const b = s => document.querySelector(s).getBoundingClientRect(); return [b('.tm-card').top - b('.tm-sub').bottom, b('.tm-group').top - b('.tm-card').bottom]; });
  check('25 Press timing: the tester 24 under the caption and the sliders 20 under it', Math.abs(gaps[0] - 24) <= 1 && Math.abs(gaps[1] - 20) <= 1, gaps);
  await C(() => { const i = document.querySelector('input[data-tm="double_ms"]'); i.value = '500'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(1500);
  check('the double-press window saves as it moves', (await cfg()).settings.double_ms === 500, (await cfg()).settings.double_ms);
  await C(() => { const c = window.__copper; for (const ev of ['Press', 'Release', 'Press', 'Release']) c.live({ type: 'button', device_id: '9', button_number: 0, event: ev }); c.live({ type: 'gesture', device_id: '9', button_number: 0, gesture: 'double' }); }); await wait(600);
  check('the tester says what it heard', /Heard: Press twice/.test(await page.textContent('.tm-heard')));
  check('and draws the two taps', (await page.$$('.tm-chart .tap')).length === 2);

  // ---- 10 Routines, 23 a routine
  await go('routines');
  await at('10 Routines', [['H1', '.rt-head h1', 20, 58, null, 44], ['plus', '.rt-head .a1', 336, 52, 56, 56]]);
  await tap('[data-act="new"]');
  check('+ makes a routine and opens it as New routine', /#routine\//.test(page.url()) && (await page.textContent('.page-h1')) === 'New routine');
  const rid = page.url().split('/').pop();
  const sc = () => cfg().then(c => c.schedules.find(x => x.id === rid));
  await at('23 New routine', [['H1 (its padding box: the text is at 20, 128)', '.page-h1', 0, 108, null, 64], ['sentence', '.rs', 20, 200, null, null], ['first token', '.rs .tok', null, 200, null, 44]]);
  await tap('.rs .dd[data-d="0"]');
  check('a day in the sentence toggles', !(await sc()).days.includes(0), (await sc()).days);
  await tap('.rs .cl:nth-child(3) .tok:first-of-type');
  check('the blue word opens What it does', (await page.textContent('#sheet-root h2')) === 'What it does');
  await tap('#sheet-root .way[data-r="half"]');
  check('Half brightness', (await sc()).actions[0].level === 50, (await sc()).actions);
  await tap('#sheet-root .sheet-close');
  await go(`routine/${rid}/when`);
  await tap('#sheet-root [data-act="w-type"][data-v="time"]');
  await page.fill('#sheet-root input[data-change="w-time"]', '07:15'); await page.dispatchEvent('#sheet-root input[data-change="w-time"]', 'change'); await wait(300);
  await tap('#sheet-root [data-act="w-use"]');
  check('When: a clock time', (await sc()).at.time === '07:15', (await sc()).at);
  await go(`routine/${rid}/off`);
  await tap('#sheet-root [data-act="off-bedtime"]');
  check('Off again at bedtime makes the off half', !!(await cfg()).schedules.find(x => x.id === rid + '-off'));
  await go(`routine/${rid}/onlyif`);
  await tap('#sheet-root [data-act="onlyif"][data-v="all_off"]');
  check('Only if everything is off', (await sc()).only_if === 'all_off');
  await go(`routine/${rid}`);
  check('the sentence reads it back', /then off at/.test(await page.textContent('.rs')) && /everything is off/.test(await page.textContent('.rs')), await page.textContent('.rs'));
  await tap('.rt-paused [data-act="rt-toggle"]');
  check('Paused', (await sc()).enabled === false && (await cfg()).schedules.find(x => x.id === rid + '-off').enabled === false);
  await tap('.rt-paused [data-act="rt-toggle"]');
  await go('routines');
  check('the routine is a card with its days', !!(await page.$(`.rt-card[data-go="routine/${rid}"] .ddots`)));
  check('and the Up next card offers a skip', !!(await page.$('.upnext [data-act="rt-skip"]')));
  await tap('.upnext [data-act="rt-skip"]');
  check('skipping sets the day', !!(await sc()).skip_until, await sc());
  await go(`routine/${rid}/more`);
  await tap('#sheet-root [data-act="delete"]');
  await tap('#sheet-root [data-act="delete-go"]');
  check('deleted, both halves', !(await cfg()).schedules.some(x => x.id === rid || x.id === rid + '-off'));
  await tap('#toast-root [data-act="toast-undo"]'); await wait(800);
  check('Undo puts it back', !!(await sc()));

  // ---- 22 guided: Welcome lights and a Goodnight button
  await go('setup/welcome');
  await at('22 Welcome lights', [['stepper', '.stepper', null, 60, null, 40], ['overline', '.g-over', 20, 268, null, 14], ['question', '.g-q', 20, 290, null, null], ['first answer', '.ans', 20, 386, 180, 72]]);
  const nWel = (await cfg()).schedules.length;
  for (let i = 0; i < 4; i++) await tap('.next-btn');
  check('Welcome lights: four questions, then it is set up', (await cfg()).schedules.filter(x => x.kind === 'welcome').length >= 2 && (await cfg()).schedules.length > nWel && /#routines$/.test(page.url()), page.url());
  await go('setup/goodnight');
  const gnSteps = await C(() => document.querySelector('.stepper span').textContent);
  for (let i = 0; i < 3; i++) await tap('.next-btn');
  const gn = (await cfg()).bindings.filter(x => x.gesture === 'hold' && x.actions[0].target === 'h:all');
  check('Goodnight button: set up as a hold that turns everything off', gn.length >= 1 && /#remote\//.test(page.url()), [gnSteps, page.url()]);

  // ---- the evening wind-down
  await go('routines/winddown');
  const wd0 = !!((await cfg()).settings.adaptive || {}).enabled;
  await tap('#sheet-root [data-act="wd-toggle"]');
  check('the wind-down switch', !!(await cfg()).settings.adaptive.enabled !== wd0);
  if (!(await cfg()).settings.adaptive.enabled) await tap('#sheet-root [data-act="wd-toggle"]');
  await tap('#sheet-root [data-go="routines/winddown-levels"]');
  await tap('#sheet-root [data-act="wd-set"][data-k="to_level"][data-v="40"]');
  check('a level in Advanced', (await cfg()).settings.adaptive.winddown.to_level === 40);

  // ---- 24 Activity
  await go('activity');
  await at('24 Activity', [['H1 (its padding box: the text is at 20, 128)', '.page-h1', 0, 108, null, 64], ['filters', '.act-f', 0, 192, null, 40]]);
  check('Activity lists what happened', (await page.$$('.ev')).length > 0);
  await tap('[data-act="filter"][data-f="pico"]');
  const kinds = await C(() => [...document.querySelectorAll('.ev .ev-ic')].every(e => e.classList.contains('pico')));
  check('Buttons shows only remote presses', kinds);

  check('no errors on the page', !errors.length, errors);
  await C(async prev => { const c = window.__copper; c.data.restoreConfig(prev); await c.save('', { quiet: true }); }, before);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
