// Calls and texts (web/ui/screens/alerts.js, hub/alerts.js), against the fake connector, which says back the alert
// the hub sent it.
//
//   the page opens with the office's Hue lights chosen, and off
//   switching it on, a light left out, a pattern and colours: all kept in the house's settings
//   Try it plays the pattern as the page shows it, on the lights chosen
//   a person added gets a colour of their own, and a call from them comes in it; the call stops when the phone says
//   Do Not Disturb keeps a text dark; a text from another app is shown only once that is allowed
//   the lights showing a call are in the activity
const { chromium } = require('playwright-core');
const path = require('path');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`http://127.0.0.1:${PORT}/#home`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.solid'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(800);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const al = () => C(() => JSON.parse(JSON.stringify(window.__copper.S.config.settings.alerts || null)));
  const hubAl = () => C(async () => { const r = await fetch('/api/snapshot', { headers: { authorization: `Bearer ${localStorage.getItem('token')}` } }); return (await r.json()).config.settings.alerts; });
  const post = body => C(async b => { const r = await fetch('/api/alert', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(b) }); return r.json(); }, body);

  const office = await C(() => { const c = window.__copper; const r = c.data.areas().find(a => /office/i.test(a.name)); return r ? { id: r.id, hue: c.H.roomLights(r.id).filter(d => String(d.device_id).startsWith('hue_') && d.domain === 'light' && d.color).map(d => d.device_id), plug: c.H.roomLights(r.id).filter(d => String(d.device_id).startsWith('hue_') && d.domain !== 'light').map(d => d.device_id) } : null; });
  check('the house has an office with Hue lights', !!office && office.hue.length > 0, office);

  await C(() => { location.hash = 'alerts'; }); await wait(1200);
  check('the page opens', !!(await page.$('.al-page')), null);
  const sel = await C(() => [...document.querySelectorAll('[data-act="al-light"][aria-pressed="true"]')].map(b => b.dataset.id));
  check('the office lights are chosen to begin with', office && JSON.stringify(sel.sort()) === JSON.stringify([...office.hue].sort()), sel);
  if (office && office.plug.length) check('a Hue plug is not offered', !(await page.$(`[data-act="al-light"][data-id="${office.plug[0]}"]`)), office.plug);
  check('and it is off', (await C(() => document.querySelector('[data-act="al-on"]').getAttribute('aria-checked'))) === 'false', null);
  const offered = await C(() => { const c = window.__copper; const ids = [...document.querySelectorAll('[data-act="al-light"]')].map(b => b.dataset.id);
    const all = c.data.devices ? c.data.devices() : [];
    const dimmer = c.data.areas().flatMap(r => c.H.roomLights(r.id)).find(d => d.domain === 'light' && !/^(hue_|nanoleaf_)/.test(String(d.device_id)));
    const sw = c.data.areas().flatMap(r => c.H.roomLights(r.id)).find(d => d.domain === 'switch' && !/^(hue_|nanoleaf_)/.test(String(d.device_id)));
    const nano = c.data.areas().flatMap(r => c.H.roomLights(r.id)).find(d => String(d.device_id).startsWith('nanoleaf_'));
    return { dimmer: dimmer && ids.includes(dimmer.device_id), sw: sw ? ids.includes(sw.device_id) : false, nano: nano ? ids.includes(nano.device_id) : null }; });
  check('a Lutron dimmer is offered, a switch is not', offered.dimmer === true && offered.sw === false, offered);
  if (offered.nano !== null) check('a Nanoleaf is offered', offered.nano === true, offered);

  await page.click('[data-act="al-on"]'); await wait(1200);
  let a = await hubAl();
  check('switched on, with the office lights, kept by the house', !!a && a.on === true && JSON.stringify([...a.lights].sort()) === JSON.stringify([...office.hue].sort()), a);
  // another Hue light chosen, then left out again
  const other = await C(() => { const b = [...document.querySelectorAll('[data-act="al-light"][aria-pressed="false"]')][0]; return b ? b.dataset.id : null; });
  if (other) {
    await page.click(`[data-act="al-light"][data-id="${other}"]`); await wait(900);
    a = await hubAl();
    check('a light can be added', a.lights.includes(other), a.lights);
    await page.click(`[data-act="al-light"][data-id="${other}"]`); await wait(900);
    a = await hubAl();
    check('and left out again', !a.lights.includes(other), a.lights);
  }
  // a call in two colours
  await page.click('[data-al="call"] [data-act="al-pattern"][data-p="alternate"]'); await wait(900);
  check('two colours offers a second colour', !!(await page.$('[data-al="call"] [data-act="al-color2"]')), null);
  await page.click('[data-al="call"] [data-act="al-color"][aria-label="Red"]'); await wait(600);
  await page.click('[data-al="call"] [data-act="al-color2"][aria-label="Blue"]'); await wait(1000);
  a = await hubAl();
  check('the call pattern and its colours are kept', a.call.pattern === 'alternate' && a.call.color === '#ff5a4e' && a.call.color2 === '#4c8dff', a.call);

  // Try it
  const tried = page.waitForResponse(r => r.url().endsWith('/api/alert'));
  await page.click('[data-al="call"] [data-act="al-test"]');
  const t = await (await tried).json();
  const act = (t.detail || {}).action || {};
  check('Try it plays the call on the lights chosen', act.type === 'alert' && act.op === 'start' && act.pattern === 'alternate' && JSON.stringify(act.colors) === JSON.stringify(['#ff5a4e', '#4c8dff']) && act.lights.length === office.hue.length && act.seconds <= 4, t);

  // a person of their own
  await page.fill('[data-input="al-pname"]', 'Sam');
  await page.press('[data-input="al-pname"]', 'Enter'); await wait(1200);
  a = await hubAl();
  const sam = (a.people || [])[0];
  check('a person added gets a colour of their own', !!sam && sam.name === 'Sam' && /^#[0-9a-f]{6}$/.test(sam.color) && sam.color !== a.call.color && sam.color !== a.text.color, a.people);
  check('and the field is empty again', (await C(() => document.querySelector('[data-input="al-pname"]').value)) === '', null);
  await page.click('.al-pedit [data-act="al-pcolor"][aria-label="Purple"]'); await wait(1000);
  a = await hubAl();
  check('their colour can be changed', a.people[0].color === '#a66bff', a.people);

  // the phone: a call from Sam rings in Sam's colour, then stops
  let r = await post({ kind: 'call', state: 'start', key: 'ring1', from: 'Sam Lee', sms: true, dnd: false });
  check('a call from them comes in their colour', r.ok && r.detail && r.detail.action.id === 'call:ring1' && r.detail.action.colors[0] === '#a66bff' && r.detail.action.seconds === 60, r);
  r = await post({ kind: 'call', state: 'stop', key: 'ring1' });
  check('and stops when the phone says', r.ok && r.detail && r.detail.action.op === 'stop' && r.detail.action.id === 'call:ring1', r);
  r = await post({ kind: 'text', state: 'start', key: 't1', from: 'Alex', sms: true, dnd: true });
  check('Do Not Disturb keeps a text dark', r.skipped === 'do not disturb', r);
  r = await post({ kind: 'text', state: 'start', key: 't2', from: 'Alex', sms: false, dnd: false });
  check('a text from another app is not shown', r.skipped === 'app', r);
  await page.click('[data-act="al-apps"]'); await wait(1000);
  r = await post({ kind: 'text', state: 'start', key: 't3', from: 'Alex', sms: false, dnd: false });
  check('until other apps are allowed', r.ok && r.detail && r.detail.action.pattern === 'breathe', r);
  await wait(800);
  const act2 = await C(() => (window.__copper.S.activity || []).filter(e => e.kind === 'alert').map(e => e.what));
  check('the activity says the lights showed a call and a text', act2.includes('call') && act2.includes('text'), act2);

  await page.click('.al-people [data-act="al-person"]'); await wait(400);
  if (!(await page.$('.al-pedit'))) { await page.click('.al-people [data-act="al-person"]'); await wait(400); }
  await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'alerts-phone.png'), fullPage: true });
  await page.click('[data-act="al-premove"]'); await wait(1000);
  a = await hubAl();
  check('a person can be removed', a.people.length === 0, a.people);

  // the Android app: an app of its own, chosen from the phone's apps
  const BRIDGE = () => {
    window.__set = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      nativePromise(plugin, method, opts) {
        if (method === 'setAlertApps') window.__set.push(opts.pkgs);
        const r = method === 'calls' ? { access: true, android: 35 }
          : method === 'alertAppList' ? { recent: [{ pkg: 'com.ring.app', name: 'Ring', at: 1 }], all: [{ pkg: 'com.ring.app', name: 'Ring' }, { pkg: 'com.whatsapp', name: 'WhatsApp' }, { pkg: 'com.spotify.music', name: 'Spotify' }] }
          : {};
        return Promise.resolve(r);
      },
    };
  };
  const nctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await nctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
  await nctx.addInitScript(BRIDGE);
  const np = await nctx.newPage();
  np.on('pageerror', e => errors.push('pageerror (app): ' + e.message));
  const N = (fn, arg) => np.evaluate(fn, arg);
  await np.goto(`http://127.0.0.1:${PORT}/#alerts`);
  await np.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await wait(1200);
  check('with notification access, nothing asks for it', !(await np.$('[data-act="al-allow"]')), null);
  await np.click('[data-go="alerts/apps"]'); await wait(1000);
  const listed = await N(() => [...document.querySelectorAll('#sheet-root [data-act="al-apick"]')].map(b => b.dataset.name));
  check('the phone\'s apps are offered, those lately notifying first', JSON.stringify(listed) === JSON.stringify(['Ring', 'WhatsApp', 'Spotify']), listed);
  await np.fill('#sheet-root [data-input="al-appq"]', 'wha'); await wait(300);
  const found = await N(() => [...document.querySelectorAll('#sheet-root [data-act="al-apick"]')].map(b => b.dataset.name));
  check('and can be searched', JSON.stringify(found) === JSON.stringify(['WhatsApp']), found);
  await np.click('#sheet-root [data-act="al-apick"][data-pkg="com.whatsapp"]'); await wait(1400);
  a = await hubAl();
  const wa = (a.by_app || [])[0];
  check('an app chosen gets a look of its own, in a colour not taken', !!wa && wa.pkg === 'com.whatsapp' && wa.name === 'WhatsApp' && wa.pattern === 'flash' && ![a.call.color, a.text.color].includes(wa.color), a.by_app);
  check('and the phone is told to send its notifications', (await N(() => window.__set)).some(l => JSON.stringify(l) === '["com.whatsapp"]'), await N(() => window.__set));
  await np.click('[data-al="app:0"] [data-act="al-pattern"][data-p="glow"]'); await wait(800);
  await np.click('[data-al="app:0"] [data-act="al-color"][aria-label="Green"]'); await wait(1200);
  a = await hubAl();
  check('its pattern and colour are kept', a.by_app[0].pattern === 'glow' && a.by_app[0].color === '#4fd39a', a.by_app);
  const tried2 = np.waitForResponse(r => r.url().endsWith('/api/alert'));
  await np.click('[data-al="app:0"] [data-act="al-test"]');
  const t2 = await (await tried2).json();
  check('Try it plays its look', t2.detail && t2.detail.action.pattern === 'glow' && t2.detail.action.colors[0] === '#4fd39a', t2);
  r = await post({ kind: 'app', state: 'start', key: 'n1', app: 'com.whatsapp', from: 'Group chat', dnd: false });
  check('anything it notifies shows in its look', r.ok && r.detail && r.detail.action.pattern === 'glow' && r.detail.action.colors[0] === '#4fd39a', r);
  r = await post({ kind: 'app', state: 'start', key: 'n2', app: 'com.spotify.music', dnd: false });
  check('an app without one does not', r.skipped === 'app', r);
  await np.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'alerts-apps.png'), fullPage: true });
  await np.click('[data-act="al-aremove"]'); await wait(1200);
  a = await hubAl();
  check('an app can be removed', a.by_app.length === 0 && (await N(() => window.__set)).some(l => l.length === 0), a.by_app);
  await nctx.close();

  const text = await C(() => document.querySelector('.al-page').innerText);
  check('no dashes in what it says', !/[\u2013\u2014]/.test(text), null);
  // put the house back for the tests after this one
  await C(async () => { const c = window.__copper; delete c.S.config.settings.alerts; await c.data.saveConfig(); });
  check('no errors', errors.length === 0, errors);
  await browser.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
