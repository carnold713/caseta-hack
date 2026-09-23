// Copper Night, phase 5: the app at / after the cutover and the classic app at /classic/, the onboarding pages
// before the password (01), Settings (11) and its sheets, the connection sheet (12), adding a Lutron device (20)
// with the fake bridge hearing a Pico, and Home's suggestion card, greeting and night look. Puts the config back and
// takes the device it added out again.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const watch = page => {
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  };
  const root = `http://127.0.0.1:${PORT}/`;

  // ---- 01 Onboarding, on a phone that has never signed in
  const fresh = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p0 = await fresh.newPage(); watch(p0);
  await p0.goto(root); await wait(1200);
  check('/ is the new app, and a new phone sees the onboarding first', !!(await p0.$('.onboard')) && /Control/.test(await p0.textContent('.ob-h')));
  const box = async (sel) => p0.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); }, sel);
  const logo = await box('.ob-logo'), go = await box('.ob-go'), back = await box('.ob-back');
  check('01: the logo pill at 20, 52, 44 tall', logo[0] === 20 && logo[1] === 52 && logo[3] === 44, logo);
  check('01: Get started 296 x 64 at 96, 812', go[0] === 96 && go[1] === 812 && go[2] === 296 && go[3] === 64, go);
  check('01: the back circle 64 at 20, 812', back[0] === 20 && back[1] === 812 && back[2] === 64, back);
  for (let i = 0; i < 3; i++) { await p0.click('.ob-go'); await wait(300); }
  check('three pages, then the password', !!(await p0.$('#pw')));
  await p0.fill('#pw', 'secret'); await p0.click('.login-form button');
  await p0.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(800);
  check('signing in lands on Home', !!(await p0.$('.home')));
  await p0.reload(); await wait(1200);
  check('the onboarding is not shown again', !(await p0.$('.onboard')));
  await fresh.close();

  // ---- the classic app, kept at /classic/
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.removeItem('next:shown'); for (const k of Object.keys(localStorage)) if (/^next:/.test(k)) localStorage.removeItem(k); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage(); watch(page);
  await page.goto(root + 'classic/'); await wait(2500);
  check('the classic app still opens at /classic/', !!(await page.$('#nav')) || !!(await page.$('#pw')) || !!(await page.$('.tabs')), await page.title());

  const C = (fn, arg) => page.evaluate(fn, arg);
  const cfg = () => C(() => window.__copper.S.config);
  const goto = async hash => { await page.goto(root + '#' + hash); await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900); };
  const tap = async sel => { await C(s => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel); await wait(700); };
  await page.goto(root); await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  const before = await C(() => JSON.stringify(window.__copper.S.config));

  // ---- the greeting, once per home
  await C(async () => { const c = window.__copper; c.closeSheet(); c.S.config.settings.greeted = false; c.ui.greeted = false; await c.data.saveConfig(); });
  // a fresh load, as a phone opening the app would: the save above already re-rendered Home once
  await page.reload(); await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(1200);
  check('a home connected for the first time is greeted', (await C(() => (document.querySelector('#sheet-root h2') || {}).textContent)) === 'Your home is connected');
  await tap('#sheet-root [data-act="sheet-close"]');
  check('closing it remembers it', (await cfg()).settings.greeted === true);

  // ---- Home: the one suggestion, and Not now
  await goto('home');
  check('Home offers one suggestion under the rooms', (await page.$$('.next-cards .next-row')).length >= 1);
  const later = await page.$('.next-row [data-act="next-later"]');
  if (later) { await tap('.next-row [data-act="next-later"]'); check('Not now puts it away for the session', !(await page.$('.next-row [data-act="next-later"]'))); }

  // ---- 12 the connection sheet, from the greeting line
  await tap('.home-head .greet');
  check('the greeting line opens the connection sheet', (await C(() => document.querySelector('#sheet-root .t-over').textContent)) === 'Connection');
  check('four links, each ticked', (await page.$$('#sheet-root .cn-ic.ok')).length === 4);
  await tap('#sheet-root [data-act="conn-remotes"]');
  check('Check the remotes counts the buttons', /Buttons the bridge offers/.test(await page.textContent('#sheet-root')));
  await C(() => window.__copper.closeSheet());

  // ---- 11 Settings
  await goto('settings');
  const sections = await C(() => [...document.querySelectorAll('.settings-page .t-over.sec')].map(e => e.textContent));
  check('Settings has the file\'s sections, and This app', ['Home', 'Buttons', 'Evening', 'Devices', 'Connector', 'Backup', 'This app'].every(x => sections.includes(x)), sections);
  const h1 = await C(() => { const b = document.querySelector('.settings-page .page-h1').getBoundingClientRect(); return [b.top, b.height].map(Math.round); });
  check('11: Settings at 128 (its padding box at 108)', h1[0] === 108 && h1[1] === 64, h1);
  await goto('settings/power');
  await tap('#sheet-root [data-act="set-power"][data-v="all"]');
  check('power brings back everything', (await cfg()).settings.power_on === 'all');
  await tap('#sheet-root [data-act="set-power"][data-v="restore"]');
  await goto('settings/onlevel');
  await tap('#sheet-root [data-act="set-onlevel"][data-v="80"]');
  check('rooms come on at 80%', (await cfg()).settings.group_on_level === 80);
  await goto('settings/fade');
  await tap('#sheet-root [data-act="set-fade"][data-v="2"]');
  check('fade time 2 s', (await cfg()).settings.default_fade === 2);
  await goto('settings/nightlook');
  await tap('#sheet-root [data-act="set-nightlook"][data-v="always"]');
  check('night look always, and the app wears it', (await cfg()).settings.night_look === 'always' && (await C(() => document.body.classList.contains('nightlook'))));
  await tap('#sheet-root [data-act="set-nightlook"][data-v="never"]');
  check('and never', !(await C(() => document.body.classList.contains('nightlook'))));
  await goto('settings/name');
  await page.fill('#sheet-root .name-form input', 'Test Home'); await wait(1400);
  check('the home\'s name saves as it is typed', (await cfg()).settings.home_name === 'Test Home');
  await goto('settings/timezone');
  await page.fill('#sheet-root [data-input="tz-q"]', 'chicago'); await wait(300);
  await tap('#sheet-root .tz-list [data-act="set-tz"][data-v="America/Chicago"]');
  check('a time zone found by name', (await cfg()).settings.timezone === 'America/Chicago');
  await goto('settings/sets');
  await tap('#sheet-root [data-act="set-new"]');
  const light = await C(() => document.querySelector('#sheet-root [data-act="set-light"]').dataset.id);
  await tap(`#sheet-root [data-act="set-light"][data-id="${light}"]`);
  check('a light set with a light in it', (await cfg()).groups.some(g => g.name === 'New set' && g.device_ids.includes(light)));
  await goto('settings/hue');
  // hue_test runs earlier in the suite and leaves a bridge paired; alone, there is none yet
  if (await page.$('#sheet-root [data-act="hue-forget"]')) {
    check('Hue: a paired bridge shows its lights, and Forget', /lights? in \d+ rooms?/.test(await page.textContent('#sheet-root')));
  } else {
    await tap('#sheet-root [data-act="hue-discover"]'); await wait(1500);
    check('Hue: looking for a bridge answers', !!(await page.$('#sheet-root [data-act="hue-pick"]')) || /No Hue bridge|connected|lights? in/i.test(await page.textContent('#sheet-root')));
  }
  await goto('settings/how');
  check('How your home connects shows the install line', /install\.sh\?token=/.test(await page.textContent('#sheet-root code')));
  await goto('settings/restore');
  const good = await C(() => JSON.stringify({ ...window.__copper.S.config, settings: { ...window.__copper.S.config.settings, home_name: 'Restored' } }));
  await C(t => { const a = document.querySelector('#sheet-root textarea'); a.value = t; a.dispatchEvent(new Event('input', { bubbles: true })); }, good);
  await tap('#sheet-root [data-act="restore-go"]'); await wait(800);
  check('a backup restores', (await cfg()).settings.home_name === 'Restored');
  await tap('#toast-root [data-act="toast-undo"]'); await wait(900);
  check('and Undo takes it back', (await cfg()).settings.home_name === 'Test Home');

  // ---- 20 Add a device: the fake bridge hears a Pico 2.5 s after listening starts
  await goto('add');
  check('Add a device starts listening', /Listening/.test(await page.textContent('.ad-status')));
  await page.waitForSelector('.ad-card .ad-field input', { timeout: 8000 }).catch(() => null);
  check('what the bridge heard slides up with a name and a room', /Heard: Pico/.test(await page.textContent('.ad-card')), await page.textContent('.add-page'));
  await page.fill('.ad-card .ad-field input', 'Hall Pico'); await wait(200);
  const roomId = await C(() => document.querySelector('.ad-rooms [data-act="ad-room"]').dataset.id);
  await tap(`.ad-rooms [data-act="ad-room"][data-id="${roomId}"]`);
  await tap('.ad-card [data-act="ad-create"]'); await wait(2500);
  check('Add to my home makes it', /Added Hall Pico/.test(await page.textContent('.ad-card')), await page.textContent('.add-page'));
  check('in the room it was put in', (await C(r => window.__copper.data.devArea(window.__copper.data.dev('13') || {}), roomId)) === roomId);
  await tap('[data-act="back"]'); await wait(800);
  check('leaving stops the bridge listening', (await C(() => !!(window.__copper.S.add && window.__copper.S.add.active))) === false);

  check('no errors on the page', !errors.length, errors);
  await C(async prev => { const c = window.__copper; if (c.data.dev('13')) { try { await c.EDIT.removeDevice('13'); } catch (_) {} } c.data.restoreConfig(prev); c.S.config.settings.greeted = true; await c.data.saveConfig(); }, before);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
