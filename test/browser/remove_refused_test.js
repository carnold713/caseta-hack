// Copper Night (/ui/): a remote the bridge will not remove. The bridge saying no used to end in a toast and a remote
// that could not be got rid of (and with toasts off, not even the toast: the button just went back to "Remove"); now it
// ends in a sheet saying so, with "Remove from this app only", which clears its buttons and hides it. The fake connector
// refuses to remove a device it does not have.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`http://127.0.0.1:${PORT}/ui/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(800);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const before = await C(() => JSON.stringify(window.__copper.S.config));

  // a remote this app knows and the bridge does not: removing it on the bridge is refused
  await C(async () => {
    const c = window.__copper;
    c.S.inv.devices['98'] = { device_id: '98', name: 'Ghost Pico', type: 'Pico3ButtonRaiseLower', model: 'PJ2-3BRL', domain: 'pico', area: null, zone: null };
    c.S.config.bindings.push({ id: 'ghost-b', device_id: '98', button_number: 2, gesture: 'single', actions: [{ type: 'level', target: 'h:all', level: 'on' }], night: null, enabled: true, name: '' });
    c.S.config.favorites.push('d:98');
    await c.data.saveConfig();
  });
  await C(() => { location.hash = 'remote/98/more'; }); await wait(900);
  check('the remote\'s More sheet offers Remove remote', !!(await page.$('[data-act="rm-remove"]')));
  await page.click('[data-act="rm-remove"]'); await wait(500);
  await page.click('[data-act="rm-remove-go"]');
  await page.waitForSelector('[data-act="rm-forget-go"]', { timeout: 8000 }).catch(() => {});
  check('a refusal ends in a sheet, not only a toast', !!(await page.$('[data-act="rm-forget-go"]')));
  check('which says the bridge would not', /would not remove it/.test(await page.textContent('#sheet-root').catch(() => '')));
  check('and says what the bridge said', /404|NotFound/.test(await page.textContent('#sheet-root').catch(() => '')));

  await page.click('[data-act="rm-forget-go"]'); await wait(1200);
  const after = await C(() => { const c = window.__copper; return { hidden: (c.S.config.settings.hidden_devices || []).includes('98'), bound: c.S.config.bindings.some(b => b.device_id === '98'), fav: c.S.config.favorites.includes('d:98'), listed: c.data.devices().some(d => d.device_id === '98'), hash: location.hash }; });
  check('Remove from this app only: hidden', after.hidden, after);
  check('its buttons cleared', !after.bound, after);
  check('its pin gone', !after.fav, after);
  check('no longer listed', !after.listed, after);
  check('back on Remotes', /#remotes/.test(after.hash), after.hash);
  // Toasts are off in this app (web/ui/app.js TOASTS), so the confirm sheet is the safeguard; the remote can still be
  // shown again from Settings, Hidden devices
  check('listed under Hidden devices', await C(() => window.__copper.EDIT.hidden().includes('98')));

  // leave the home as it was found
  await C(async b => { const c = window.__copper; c.data.restoreConfig(b); delete c.S.inv.devices['98']; await c.data.saveConfig(); }, before);
  check('no page errors', !errors.length, errors);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
