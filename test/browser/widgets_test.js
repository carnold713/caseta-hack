// The Android app's side of Settings and the Widgets page (screens/widgets.js, native.js), in Chromium.
//
// Without the Android bridge (a browser) nothing calls it: Settings has no This phone group, and #widgets says where
// widgets live. With a stand-in bridge (window.Capacitor, recording every call): This phone's timer switch saves on
// the phone (setPhone, never the house's config), the Widgets row lists the placed widgets and the ten with Add, a
// widget's page shows a picture of it that follows each choice, every choice is saved at once (setWidget), Done
// hands back (widgetDone), and the home is handed to the widgets (widgetData). None of it has a dash in its words,
// or says "target", "binding" or "schedule".
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const ROOT = `http://127.0.0.1:${PORT}/ui/`;
const fails = [];
const check = (what, ok, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got).slice(0, 400)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// The bridge, as the Android shell injects it: every call recorded, and answers like HubPlugin's.
const BRIDGE = () => {
  const calls = window.__calls = [];
  const cfg = kind => ({ kind, theme: 'night', shade: 40, corners: 'system', accent: kind === 'light' || kind === 'colour' ? 'lamp' : 'copper', labels: true, levels: true, icons: true, density: 'roomy', steps: kind === 'room', levelsAt: [25, 50, 75, 100], minutes: [15, 30, 60], nightLevel: 10, routine: '', colours: ['k2700', '#FF5A4E', '#4C8DFF'] });
  const placed = [{ id: 11, kind: 'room', cfg: cfg('room') }, { id: 12, kind: 'colour', cfg: cfg('colour') }];
  let phone = { timerMode: 'live', notifications: true, liveUpdates: true, android: 36, widgets: 2, canAdd: true };
  window.Capacitor = {
    isNativePlatform: () => true,
    nativePromise(plugin, method, opts) {
      calls.push({ plugin, method, opts: JSON.parse(JSON.stringify(opts || {})) });
      const r = (() => {
        switch (method) {
          case 'phone': return phone;
          case 'setPhone': phone = { ...phone, ...opts }; return phone;
          case 'widgets': return { list: placed, canAdd: true };
          case 'widget': return placed.find(w => w.id === opts.id) || null;
          case 'setWidget': { const w = placed.find(x => x.id === opts.id); w.cfg = opts.cfg; return w; }
          case 'addWidget': return { asked: true };
          case 'widgetDone': return { left: false };
          case 'notifications': case 'askNotifications': return { allowed: true };
          default: return {};
        }
      })();
      return Promise.resolve(r);
    },
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const open = async (bridge) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
    if (bridge) await ctx.addInitScript(BRIDGE);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    return { ctx, page };
  };
  const ready = page => page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  const words = page => page.evaluate(() => document.querySelector('#screen').innerText);
  const clean = (what, text) => {
    check(`${what}: no em or en dash`, !/[\u2013\u2014]/.test(text));
    check(`${what}: never says target, binding or schedule`, !/\b(target|binding|schedule)s?\b/i.test(text), (text.match(/\b(target|binding|schedule)s?\b/i) || [])[0]);
  };

  // ---------- a browser: nothing native ----------
  {
    const { ctx, page } = await open(false);
    await page.goto(ROOT + '#settings'); await ready(page); await wait(800);
    check('in a browser Settings has no This phone group', await page.evaluate(() => !document.querySelector('.phone-group') && !/This phone\n/.test(document.querySelector('#screen').innerText)));
    await page.goto(ROOT + '#widgets'); await wait(800);
    const t = await words(page);
    check('in a browser #widgets says where widgets live', /Widgets live in the Android app/.test(t), t.slice(0, 120));
    check('and offers no Add', await page.locator('[data-act="wg-add"]').count() === 0);
    clean('the browser widgets page', t);
    await ctx.close();
  }

  // ---------- inside the Android app ----------
  const { ctx, page } = await open(true);
  const calls = m => page.evaluate(m => window.__calls.filter(c => c.method === m).map(c => c.opts), m);
  await page.goto(ROOT + '#settings'); await ready(page); await wait(1500);
  check('the home is handed to the widgets', (await calls('widgetData')).some(o => o.model && o.model.rooms && o.model.rooms.length && o.model.lights.length), (await calls('widgetData')).length);
  const st = (await calls('widgetData')).find(o => o.state);
  check('with every lamp\'s level and the house count', !!(st && st.state.levels && Object.keys(st.state.levels).length && st.state.house));
  await page.locator('.phone-group').waitFor({ timeout: 5000 });
  let t = await page.locator('.phone-group').innerText();
  check('Settings has This phone with Timer in the status bar', /Timer in the status bar/.test(t) && /Widgets/.test(t), t);
  check('the status bar switch is on', await page.locator('[data-act="phone-live"]').getAttribute('aria-checked') === 'true');
  check('and no quiet row while it is', await page.locator('[data-act="phone-quiet"]').count() === 0);
  await page.locator('[data-act="phone-live"]').click(); await wait(400);
  check('turning it off saves on the phone, a quiet notification', (await calls('setPhone')).at(-1).timerMode === 'quiet', await calls('setPhone'));
  check('then Quiet notification instead shows, on', await page.locator('[data-act="phone-quiet"]').getAttribute('aria-checked') === 'true');
  await page.locator('[data-act="phone-quiet"]').click(); await wait(400);
  check('and turning that off is none at all', (await calls('setPhone')).at(-1).timerMode === 'none');
  await page.locator('[data-act="phone-live"]').click(); await wait(400);
  check('and back on is the status bar again', (await calls('setPhone')).at(-1).timerMode === 'live');
  check('the house\'s config was not touched by it', !(await page.evaluate(() => JSON.stringify(window.__copper.S.config))).includes('timerMode'));
  clean('This phone', await page.locator('.phone-group').innerText());

  // the Widgets list
  await page.locator('.phone-group [data-go="widgets"]').click();
  await page.waitForFunction(() => location.hash === '#widgets' && document.querySelectorAll('.wg-placed .row').length === 2, null, { timeout: 5000 }).catch(() => {});
  t = await words(page);
  check('Widgets lists the two placed', await page.locator('.wg-placed [data-go^="widgets/"]').count() === 2, t.slice(0, 200));
  check('and the ten there are, each with Add', await page.locator('.wg-kinds .row').count() === 10 && await page.locator('[data-act="wg-add"]').count() === 10);
  clean('the widgets list', t);
  await page.locator('[data-act="wg-add"][data-kind="scenes"]').click(); await wait(300);
  check('Add asks Android to place that one', (await calls('addWidget')).at(-1).kind === 'scenes');

  // one widget's page
  await page.waitForFunction(() => document.querySelectorAll('.wg-placed [data-go="widgets/11"]').length === 1, null, { timeout: 5000 }).catch(() => {});
  await page.locator('.wg-placed [data-go="widgets/11"]').click();
  await page.locator('#screen .wgp').first().waitFor({ timeout: 5000 });
  check('a widget\'s page opens with its picture', await page.locator('.wg-stage .wgp[data-kind="room"]').count() === 1);
  check('with no tab bar', await page.evaluate(() => document.querySelector('#tabs').hidden));
  const rooms = await page.locator('[data-act="wg-target"]').count();
  check('it offers the rooms', rooms > 0, rooms);
  const second = page.locator('[data-act="wg-target"]').nth(Math.min(1, rooms - 1));
  const v = await second.getAttribute('data-v'); const name = (await second.locator('.t').innerText()).trim();
  await second.click(); await wait(300);
  check('choosing a room saves it at once', (await calls('setWidget')).at(-1).cfg.target === v, (await calls('setWidget')).at(-1));
  check('and the picture shows it', (await page.locator('#screen .wgp').first().innerText()).includes(name), name);
  await page.locator('[data-act="wg-theme"][data-v="day"]').click(); await wait(200);
  check('Day saves and the picture turns day', (await calls('setWidget')).at(-1).cfg.theme === 'day' && await page.locator('#screen .wgp.wgp-day').count() === 1);
  await page.locator('[data-act="wg-theme"][data-v="clear"]').click(); await wait(200);
  check('Clear offers a shade', await page.locator('[data-act="wg-shade"]').count() === 5);
  await page.locator('[data-act="wg-shade"][data-v="60"]').click(); await wait(200);
  check('and the shade is saved', (await calls('setWidget')).at(-1).cfg.shade === 60);
  await page.locator('[data-act="wg-corners"][data-v="square"]').click(); await wait(200);
  check('square corners', (await calls('setWidget')).at(-1).cfg.corners === 'square' && await page.locator('#screen .wgp.sq').count() === 1);
  await page.locator('[data-act="wg-icons"]').click(); await wait(200);
  check('icons off: saved, and gone from the picture', (await calls('setWidget')).at(-1).cfg.icons === false && await page.locator('#screen .wgp .wgp-ic').count() === 0);
  await page.locator('[data-act="wg-steps"]').click(); await wait(200);
  check('Dimmer and brighter off: saved, and gone from the picture', (await calls('setWidget')).at(-1).cfg.steps === false && await page.locator('#screen .wgp .wgp-btn').count() === 0);
  await page.locator('[data-act="wg-density"][data-v="compact"]').click(); await wait(200);
  check('compact', (await calls('setWidget')).at(-1).cfg.density === 'compact');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/widget-page.png`, fullPage: true });
  check('no Save button anywhere', !/\bSave\b/.test(await words(page)));
  clean('a widget\'s page', await words(page));

  // the colour lamp's page
  await page.goto(ROOT + '#widgets/12'); await page.locator('#screen .wgp').first().waitFor({ timeout: 5000 });
  check('a colour widget offers colours and the lamp\'s own colour', await page.locator('[data-act="wg-colour"]').count() >= 12 && await page.locator('[data-act="wg-accent"]').count() === 2);
  await page.locator('[data-act="wg-colour"][data-v="#9EE06A"]').click(); await wait(200);
  check('a colour added is saved', (await calls('setWidget')).at(-1).cfg.colours.includes('#9EE06A'));
  clean('a colour widget\'s page', await words(page));

  // Done
  await page.goto(ROOT + '#widgets'); await wait(500);
  await page.locator('.wg-placed [data-go="widgets/11"]').click(); await page.locator('#screen .wgp').first().waitFor({ timeout: 5000 });
  await page.locator('[data-act="wg-done"]').click(); await wait(600);
  check('Done hands back to Android and steps back', (await calls('widgetDone')).length === 1 && await page.evaluate(() => location.hash) === '#widgets', await page.evaluate(() => location.hash));

  check('no errors on the page', errors.length === 0, errors);
  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
