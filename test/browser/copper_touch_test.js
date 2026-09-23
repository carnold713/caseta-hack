// Copper Night on a real phone: sliders that never steal a scroll, sheets that swipe away, and a layout that sits
// 20 from each edge at any phone width with nothing lost behind the tab bar.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const open = async (width) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    return { ctx, page };
  };
  const root = `http://127.0.0.1:${PORT}/`;
  const { ctx, page } = await open(390);
  const C = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  const goto = async h => { await C(x => { location.hash = x; }, h); await wait(700); };
  await page.goto(root + '#home'); await ready(); await wait(900);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });

  // a finger on an element: down at (x, y), through each step, then up (or a cancel, as a scroll ends one)
  const finger = (sel, steps, { cancel = false, id = 7 } = {}) => C(([s, st, cn, pid]) => {
    const el = document.querySelector(s); const b = el.getBoundingClientRect();
    const at = ([dx, dy]) => ({ clientX: b.left + dx, clientY: b.top + dy });
    const fire = (type, p, target) => (target || el).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: pid, pointerType: 'touch', isPrimary: true, ...at(p) }));
    fire('pointerdown', st[0], document.elementFromPoint(at(st[0]).clientX, at(st[0]).clientY));
    for (const p of st.slice(1)) fire('pointermove', p);
    fire(cn ? 'pointercancel' : 'pointerup', st[st.length - 1]);
  }, [sel, steps, cancel, id]);
  const sent = () => C(() => (window.__sent || []).length);
  // count the level commands this phone sends
  await C(() => { window.__sent = []; const c = window.__copper; const g = c.gate.sendLevel; c.gate.sendLevel = (...a) => { window.__sent.push(a); return g(...a); }; });

  // ---- the house bar (shown only while something is on: with everything off there is nothing for it to move)
  if (!(await page.$('.hbar'))) { await C(async () => { const c = window.__copper; const a = c.data.areas().find(x => c.H.roomLights(x.id).length); await c.run({ type: 'level', target: `a:${a.id}`, level: 60 }); }); await wait(1500); }
  check('with something on, the house bar is there', !!(await page.$('.hbar')));
  const lvl = () => C(() => document.querySelector('.hbar').getAttribute('aria-valuenow'));
  let before = await lvl();
  await finger('.hbar', [[100, 20], [101, 30], [102, 60], [103, 110]], { cancel: true });
  check('a scroll that starts on the house bar changes nothing', (await lvl()) === before && (await sent()) === 0, { before, now: await lvl(), sent: await sent() });
  await finger('.hbar', [[100, 20], [100, 20]]);
  check('a tap on the house bar changes nothing', (await lvl()) === before && (await sent()) === 0);
  await C(() => document.dispatchEvent(new Event('scroll')));
  await finger('.hbar', [[60, 20], [90, 22], [140, 24]]);
  check('a touch that only stops a scroll changes nothing', (await sent()) === 0);
  await wait(300);
  await finger('.hbar', [[60, 20], [75, 21], [140, 22], [200, 23]]);
  check('a sideways drag sets the level', (await sent()) > 0 && (await lvl()) !== before, { sent: await sent(), lvl: await lvl() });
  const kn = await C(() => { const b = document.querySelector('.hbar').getBoundingClientRect(); const k = document.querySelector('.hbar .knob').getBoundingClientRect(); return Math.round(k.left + k.width / 2 - b.left); });
  check('and the knob is under the finger', Math.abs(kn - 200) <= 2, kn);
  await wait(1600);

  // ---- the number above the bar counts with the finger, while it is still down
  const counted = await C(async () => {
    const el = document.querySelector('.hbar'); const b = el.getBoundingClientRect();
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: b.left + x, clientY: b.top + 28 }));
    const seen = [];
    ev('pointerdown', 80);
    for (const x of [92, 120, 160, 200, 240]) { ev('pointermove', x); seen.push([Number(document.querySelector('[data-hlv]').textContent), Number(el.getAttribute('aria-valuenow'))]); }
    ev('pointerup', 240);
    return seen;
  });
  check('the house level counts with the finger as it drags', counted.slice(1).every(([n, v]) => n === v) && counted[counted.length - 1][0] > counted[1][0], counted);
  await wait(1600);

  // ---- the bridge talking while a finger is still deciding (the first few px) must not take the bar away
  await C(() => { window.__sent = []; });
  const kept = await C(async () => {
    const el = document.querySelector('.hbar'); const b = el.getBoundingClientRect();
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: b.left + x, clientY: b.top + 28 }));
    ev('pointerdown', 150);
    window.__copper.render(); window.__copper.soon();
    await new Promise(r => setTimeout(r, 150));
    const same = document.querySelector('.hbar') === el;
    ev('pointermove', 154); ev('pointermove', 175); ev('pointermove', 230); ev('pointerup', 230);
    return same;
  });
  check('a redraw waits while a finger is on the bar, so the bar is not swapped out from under it', kept);
  check('and the drag that follows works', (await sent()) > 0, await sent());
  await wait(1600);

  // ---- a light's dial
  const light = await C(() => { const c = window.__copper; return c.data.controllable().find(d => d.domain === 'light').device_id; });
  await goto(`light/${light}`);
  await C(() => { window.__sent = []; });
  // the light's level (the dial's own number glides, so it can be between values for a moment)
  const dialAt = () => C(id => window.__copper.data.level(id), light);
  await wait(600);
  before = await dialAt();
  // a point on the arc well away from the knob (the knob itself takes a finger at once, which is the point of it)
  const arc = await C(lv => { const s = document.querySelector('.dial svg').getBoundingClientRect(), d = document.querySelector('.dial').getBoundingClientRect(); const p = lv < 50 ? 85 : 15; const a = Math.PI * (1 - p / 100); return [Math.round(s.left - d.left + 170 + 150 * Math.cos(a)), Math.round(170 - 150 * Math.sin(a))]; }, before || 0);
  await finger('.dial', [arc, [arc[0] + 2, arc[1] - 20], [arc[0] + 3, arc[1] - 70]], { cancel: true });
  check('a scroll that starts on the dial changes nothing', (await dialAt()) === before && (await sent()) === 0, { before, now: await dialAt(), sent: await sent() });
  const k = await C(() => { const g = document.querySelector('.dial .kgrab').getBoundingClientRect(), d = document.querySelector('.dial').getBoundingClientRect(); return [Math.round(g.left - d.left + 28), Math.round(g.top - d.top + 28)]; });
  await finger('.dial', [k, [k[0] - 30, k[1] - 40], [k[0] - 80, k[1] - 80]]);
  check('the knob takes a finger in any direction', (await sent()) > 0 && (await dialAt()) !== before, { sent: await sent(), v: await dialAt() });
  await wait(1600);

  // ---- switching a light on while the evening curve is on: it shows the level it is about to be, from the first
  //      frame, and the dial glides there: no 100% first and then a jump down to the evening's level
  const adaptive0 = await C(() => JSON.stringify(window.__copper.S.config.settings.adaptive || null));
  await C(async () => { const c = window.__copper; c.S.config.settings.adaptive = { ...(c.S.config.settings.adaptive || {}), enabled: true }; await c.data.saveConfig(); });
  await goto(`light/${light}`);
  if (await C(() => !!document.querySelector('.dev.on'))) { await C(() => document.querySelector('[data-act="dev-off"]').click()); await wait(1200); }
  const want = await C(id => window.__copper.onLevel(id, `d:${id}`), light);
  const seen = await C(async () => {
    document.querySelector('[data-act="dev-on"]').click();
    const out = [];
    for (let i = 0; i < 30; i++) { out.push(Number(document.querySelector('.dial').getAttribute('aria-valuenow'))); await new Promise(r => setTimeout(r, 50)); }
    return out;
  });
  check('on at the evening level: the dial never goes past where the light ends up', Math.max(...seen) <= want + 1, { want, seen });
  check('it rises there without a jump (no step bigger than a glide makes)', seen.every((v, i) => !i || Math.abs(v - seen[i - 1]) <= 40), seen);
  check('and the light is where the app said it would be', Math.abs((await C(id => window.__copper.data.level(id), light)) - want) <= 1, { want, got: await C(id => window.__copper.data.level(id), light) });
  await C(async a => { const c = window.__copper; c.S.config.settings.adaptive = JSON.parse(a) || undefined; if (!c.S.config.settings.adaptive) delete c.S.config.settings.adaptive; await c.data.saveConfig(); }, adaptive0);
  await wait(400);

  // ---- a sheet swiped away, and one let go too soon
  const touch = (sel, ys) => C(([s, ys]) => {
    const el = document.querySelector(s); const b = el.getBoundingClientRect(); const x = b.left + 40;
    const t = y => new Touch({ identifier: 3, target: el, clientX: x, clientY: b.top + y });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t(ys[0])], targetTouches: [t(ys[0])], changedTouches: [t(ys[0])] }));
    for (const y of ys.slice(1)) el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(y)], targetTouches: [t(y)], changedTouches: [t(y)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t(ys[ys.length - 1])] }));
  }, [sel, ys]);
  await goto(`light/${light}/timer`); await wait(300);
  await touch('#sheet-root .sheet-head', [10, 20, 40, 50]);
  await wait(700);
  check('a short swipe springs back: the sheet stays', !!(await page.$('#sheet-root .sheet')), await C(() => location.hash));
  await touch('#sheet-root .sheet-head', [10, 40, 120, 220, 320]);
  await wait(700);
  check('swiped down, the sheet goes', !(await page.$('#sheet-root .sheet')));
  check('and the address is the page again', (await C(() => location.hash)) === `#light/${light}`, await C(() => location.hash));
  await goto(`light/${light}/timer`); await wait(300);
  const sw = await C(() => document.querySelector('#sheet-root .sheet').getBoundingClientRect().width);
  check('a sheet is the full width of the screen', sw === 390, sw);
  await C(() => window.__copper.closeSheet()); await wait(500);

  // ---- layout at 390 and 430: no sideways overflow, 20 from the edges, nothing behind the tab bar
  const pages = ['home', 'rooms', 'room/20', `light/${light}`, 'remotes', 'remote/9', 'routines', 'settings', 'activity', 'scenes'];
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const p of pages) {
      await goto(p);
      const over = await C(() => document.documentElement.scrollWidth - innerWidth);
      check(`${width}: ${p} fits the width`, over <= 0, over);
    }
    await goto('home');
    const edges = await C(() => { const t = document.querySelector('.tabbar').getBoundingClientRect(), h = document.querySelector('.house').getBoundingClientRect(); return [t.left, innerWidth - t.right, h.left, innerWidth - h.right].map(Math.round); });
    check(`${width}: the tab bar and the cards sit 20 from each edge`, edges.every(e => e === 20), edges);
    await goto('settings');
    await C(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(300);
    const gap = await C(() => { const kids = [...document.querySelector('.settings-page').children].filter(e => e.getBoundingClientRect().height); const last = kids[kids.length - 1].getBoundingClientRect(); return Math.round(document.querySelector('.tabbar').getBoundingClientRect().top - last.bottom); });
    check(`${width}: scrolled to the end, the last of Settings clears the tab bar`, gap >= 16, gap);
  }

  check('no errors on the page', !errors.length, errors);
  await ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
