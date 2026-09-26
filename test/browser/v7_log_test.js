// Copper Night v7 · log: 13 a remote, pressed (12815:50218, 12815:50442) and 14 Activity as a light log headed by
// Today in light (12815:51909, 12815:52130), with the light history the hub now keeps.
//
// A real press comes from the fake connector (fake-do.json in the run's data directory): the raw press, the gesture,
// then whatever is set for it, run like any command, so the lights come on because the house said so. The light log
// is read twice: once against the hub's real history (whatever this run has lit so far), and once against a
// yesterday made up in the page, so every number on the card and every span on the ribbons can be checked.
// Puts the config back as it found it.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const press = p => fs.writeFileSync(path.join(process.cwd(), 'fake-do.json'), JSON.stringify({ press: p }));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, ...opts });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    return { ctx, page };
  };
  const base = `http://127.0.0.1:${PORT}/ui/`;
  const { page } = await open();
  const C = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await page.goto(base + '#home');
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
  await ready(); await wait(800);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const before = await C(() => JSON.stringify(window.__copper.S.config));
  const goto = async h => { await C(x => { location.hash = x; }, h); await wait(700); };
  const at = async (what, list) => {
    const got = await C(L => L.map(([, sel]) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top + scrollY, b.width, b.height].map(v => Math.round(v)); }), list);
    list.forEach(([n, , ...exp], i) => { const v = got[i]; const off = !v ? ['missing'] : exp.map((x, j) => (x == null || Math.abs(v[j] - x) <= 1 ? null : `${'xywh'[j]} ${v[j]} not ${x}`)).filter(Boolean); check(`${what}: ${n} where the file has it`, !off.length, off.join(', ') || v); });
  };

  // ================= the hub's light history =================
  const anon = await fetch(`http://127.0.0.1:${PORT}/api/history`);
  check('the light history needs the app token', anon.status === 401, anon.status);
  const hist = () => C(async () => (await window.__copper.data.lightHistory(Date.now() - 3600000, Date.now())));
  // a change from the app, a burst of them, and one at the wall
  await C(async () => { const c = window.__copper; await c.run({ type: 'level', target: 'd:11', level: 0 }); });
  await wait(400);
  const h0 = await hist();
  const n0 = (h0.lights['11'] || []).length;
  await C(async () => { const c = window.__copper; for (const v of [20, 35, 50, 64]) { await c.run({ type: 'level', target: 'd:11', level: v }); } });
  await wait(500);
  let h1 = await hist();
  const hall = h1.lights['11'] || [];
  // (the hall set to 0 just before may fall inside the same fifteen seconds, and so be part of the one burst)
  check('a burst of changes is written down as one entry, at its last level', hall.length <= n0 + 1 && hall[hall.length - 1][1] === 64, { before: n0, after: hall.map(r => r[1]) });
  fs.writeFileSync(path.join(process.cwd(), 'fake-do.json'), JSON.stringify({ states: { 11: { level: 23 } } }));
  await wait(900);
  h1 = await hist();
  const wall = h1.lights['11'] || [];
  check('a change at the wall is written down too', wall.length && wall[wall.length - 1][1] === 23, wall);
  check('a fan is not light, so it is not kept', !h1.lights['8'], Object.keys(h1.lights));
  check('the history says when it began', typeof h1.since === 'number' && h1.since <= Date.now(), h1.since);
  await C(async () => { const c = window.__copper; await c.run({ type: 'level', target: 'd:11', level: 0 }); });

  // ================= 13 · a remote, pressed =================
  // the Kitchen Pico set up the usual way, and the kitchen dark, so a press on its top key turns it on
  await C(async () => {
    const c = window.__copper;
    c.S.config.bindings = c.S.config.bindings.filter(b => b.device_id !== '9' && b.device_id !== '12');
    c.REM.applyUsualLayout('9');
    await c.save('', { quiet: true });
    await c.run({ type: 'level', target: 'a:20', level: 'off' });
  });
  await goto('remote/9'); await wait(600);
  const strip = await C(() => { const s = document.querySelector('.lm-strip'); return s && { over: s.querySelector('.lm-over').textContent, chips: [...s.querySelectorAll('.lm-chip')].map(x => [x.querySelector('.lm-nm').textContent, x.classList.contains('on')]) }; });
  // the kitchen's two dimmers, and whatever else earlier tests filed in the kitchen (a Nanoleaf panel, say)
  const kitchen = chipsOf => ['Island Pendants', 'Kitchen Cans'].every(n => chipsOf.some(x => x[0] === n && !x[1]));
  check('the remote\'s page has the strip of the lights it moves, under the room\'s name', strip && /kitchen/i.test(strip.over) && kitchen(strip.chips), strip);
  await at('13 Remote, pressed', [['stage', '.rstage', 20, 205, 372, 332], ['lights strip', '.lm-strip', 20, 549, 372, null]]);
  const under = await C(() => Math.round(document.querySelector('.rm-key').getBoundingClientRect().top - document.querySelector('.lm-strip').getBoundingClientRect().bottom));
  check('the key\'s rows follow the strip 20 below (708 with one row of lights, as the file has it)', under === 20, under);

  // a real press on the top key
  press({ device_id: '9', button_number: 0, gesture: 'single' });
  await page.waitForFunction(() => document.querySelector('.pk.lit[data-key="0"]'), null, { timeout: 4000 });
  const lit = await C(() => {
    const key = document.querySelector('.pk.lit[data-key="0"]');
    const anim = el => (el ? el.getAnimations() : []).map(a => ({ name: a.animationName, d: a.effect.getTiming().duration, delay: Math.round(a.effect.getTiming().delay), t: Math.round(a.currentTime) }));
    const bead = document.querySelector('.rstage .bead');
    return {
      key: anim(key), glow: anim(key.querySelector('.pk-lit')), lead: anim(document.querySelector('.lead-lit')), bead: anim(bead),
      path: bead && getComputedStyle(bead).offsetPath, label: document.querySelector('.ld.fx-lab .lt').textContent,
      ring: getComputedStyle(key.querySelector('.pk-ring path, .pk-ring rect, .pk-ring circle')).stroke,
    };
  });
  console.log('   the press, as drawn:', JSON.stringify(lit));
  check('the pressed key taps (0.6 s on the quick spring) and lights from inside for 2.2 s', lit.key.some(a => a.name === 'lg-tap' && a.d === 600) && lit.glow.some(a => a.name === 'lg-key' && a.d === 2200), [lit.key, lit.glow]);
  check('in Lutron blue', /82, 174, 255/.test(lit.ring), lit.ring);
  check('its leader draws on over the same clock', lit.lead.some(a => a.name === 'lg-lead' && a.d === 2200), lit.lead);
  check('and a bead runs the leader from the key to its label', lit.bead.some(a => a.name === 'lg-bead-go' && a.d === 360) && /path/.test(lit.path || ''), [lit.bead, lit.path]);
  check('the animation is where the press is: its delay is minus the time since it', lit.glow.every(a => a.delay <= 0 && a.delay > -1500), lit.glow);
  check('the label says what the press does, without the remote\'s own room', /^turn on$/i.test(lit.label.trim()), lit.label);
  await page.screenshot({ path: 'v7-13-pressed.png' });
  // the lights come on in copper as the house says so, 0.04 s apart
  const K = '.lm-chip[data-id="5"], .lm-chip[data-id="6"]';
  await page.waitForFunction(k => [...document.querySelectorAll(k)].every(x => x.classList.contains('on')), K, { timeout: 4000 }).catch(() => {});
  const chips = await C(k => {
    const ks = [...document.querySelectorAll(k)];
    const out = { on: ks.filter(x => x.classList.contains('on')).length, glows: ks.filter(x => x.querySelector('.glow:not(.off)')).length, delays: [] };
    for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.closest && t.closest('.lm-chip') && t.parentElement.classList.contains('glow')) out.delays.push([a.effect.getTiming().duration, a.effect.getTiming().delay]); }
    out.d = [...document.querySelectorAll('.lm-chip')].map(x => x.style.getPropertyValue('--d'));
    return out;
  }, K);
  check('the lights the press drives come on in the strip, each with its glow', chips.on === 2 && chips.glows === 2, chips);
  check('their glows fade in on the dimmer, 0.04 s apart', chips.delays.some(x => x[0] === 400 && x[1] === 0) && chips.delays.some(x => x[0] === 400 && x[1] === 40), chips);
  await wait(250);
  await page.screenshot({ path: 'v7-13-lit.png' });
  await wait(2300);
  check('the key and its leader go dark again once the press has been told', !(await page.$('.pk.lit')) && !(await page.$('.lead-lit')) && !(await page.$('.bead')));
  check('the lights stay on: they are really on', (await page.$$('.lm-chip.on[data-id="5"], .lm-chip.on[data-id="6"]')).length === 2);

  // press twice: two beads a beat apart
  press({ device_id: '9', button_number: 2, gesture: 'double' });
  await page.waitForFunction(() => document.querySelector('.pk.lit[data-key="2"]'), null, { timeout: 4000 });
  const beads = await C(() => [...document.querySelectorAll('.rstage .bead')].map(b => parseInt(b.style.getPropertyValue('--fx'), 10)));
  check('a press twice sends two beads, a beat (0.24 s) apart', beads.length === 2 && Math.abs(Math.abs(beads[0] - beads[1]) - 240) <= 2, beads);
  await wait(2400);

  // a hold: the key stays lit and the bead stays at the label while it is held, and goes when it is let go
  press({ device_id: '9', button_number: 3, gesture: 'hold', ms: 1800 });
  await page.waitForFunction(() => document.querySelector('.pk.lit.fx-held[data-key="3"]'), null, { timeout: 4000 }).catch(() => {});
  await wait(700);
  const held = await C(() => ({ key: !!document.querySelector('.pk.lit.fx-held[data-key="3"]'), bead: !!document.querySelector('.bead.fx-held'), lead: !!document.querySelector('.lead-lit.fx-held') }));
  check('held: the key, the leader and the bead stay lit', held.key && held.bead && held.lead, held);
  await page.waitForFunction(() => document.querySelector('.pk.lit.fx-out') || !document.querySelector('.pk.lit'), null, { timeout: 4000 }).catch(() => {});
  await wait(500);
  check('let go: it all goes dark', !(await page.$('.pk.lit')), await C(() => (document.querySelector('.pk.lit') || {}).outerHTML));
  await wait(400);

  // a remote with nothing set has no strip; a key with nothing set lights grey and says so, with the way to set it
  // (remove_test may have taken the Bedroom Pico away, so this is the Kitchen Pico with its keys cleared for a moment)
  await C(async () => { const c = window.__copper; window.__keep = JSON.stringify(c.S.config.bindings); c.S.config.bindings = c.S.config.bindings.filter(b => b.device_id !== '9'); await c.save('', { quiet: true }); });
  await wait(300);
  check('a remote with nothing set has no strip: it moves no lights', !(await page.$('.lm-strip')));
  press({ device_id: '9', button_number: 0, gesture: 'single' });
  await page.waitForFunction(() => document.querySelector('.pk.lit[data-key="0"]'), null, { timeout: 4000 });
  const none = await C(() => { const l = document.querySelector('.ld.fx-lab'); return { key: document.querySelector('.pk.lit').getAttribute('class'), label: l.querySelector('.lt').textContent, go: l.dataset.go, bead: document.querySelector('.bead').className }; });
  check('nothing set: the key lights grey and the bead stops at "Nothing set"', /none/.test(none.key) && /none/.test(none.bead) && none.label === 'Nothing set', none);
  check('and the label leads to setting it', none.go === 'remote/9/k0-single', none.go);
  await page.screenshot({ path: 'v7-13-nothing.png' });
  await wait(2400);
  await C(async () => { const c = window.__copper; c.S.config.bindings = JSON.parse(window.__keep); await c.save('', { quiet: true }); });

  // a press on a remote while the Remotes list is open jumps to it, with its light running
  await goto('remotes');
  press({ device_id: '9', button_number: 0, gesture: 'single' });
  await page.waitForFunction(() => /#remote\/9$/.test(location.href) && document.querySelector('.pk.lit[data-key="0"]'), null, { timeout: 4000 }).catch(() => {});
  check('a press heard on the Remotes list opens that remote with the press lit', /#remote\/9$/.test(page.url()) && !!(await page.$('.pk.lit[data-key="0"]')), page.url());
  await wait(2400);

  // offline: the phone cannot hear presses, the page says so calmly
  await C(() => { const c = window.__copper; window.__was = { a: c.S.agent.online, t: c.S.troubleSince }; c.S.agent.online = false; c.S.troubleSince = Date.now() - 20000; c.render(); });
  const deaf = await C(() => (document.querySelector('.listen.deaf') || {}).textContent || '');
  check('offline: "Offline. Your remotes still work."', deaf.trim() === 'Offline. Your remotes still work.', deaf);
  await C(() => { const c = window.__copper; c.S.agent.online = window.__was.a; c.S.troubleSince = window.__was.t; c.render(); });

  // reduced motion: the bead and the tap go, the light still comes and goes as a crossfade
  const rm = await open({ reducedMotion: 'reduce' });
  await rm.page.goto(base + '#remote/9'); await rm.page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  press({ device_id: '9', button_number: 0, gesture: 'single' });
  await rm.page.waitForFunction(() => document.querySelector('.pk.lit[data-key="0"]'), null, { timeout: 4000 }).catch(() => {});
  const calm = await rm.page.evaluate(() => { const k = document.querySelector('.pk.lit[data-key="0"]'); const b = document.querySelector('.bead'); return k && { bead: b ? getComputedStyle(b).display : 'none', tap: k.getAnimations().map(a => a.animationName), key: k.querySelector('.pk-lit').getAnimations().map(a => [a.animationName, a.effect.getTiming().duration]) }; });
  check('reduced motion: no bead and no tap, the key still lights over 2.2 s', calm && calm.bead === 'none' && !calm.tap.includes('lg-tap') && calm.key.some(x => x[1] === 2200), calm);
  await rm.ctx.close();
  await wait(2400);

  // ================= 14 · Activity as a light log =================
  // against the hub's own history: this run has lit the kitchen, so today has a kitchen ribbon
  await C(() => { const c = window.__copper; window.__asked = []; const f = c.data.lightHistory; c.data.__real = f; c.data.lightHistory = (a, b) => { window.__asked.push([a, b]); return f(a, b); }; });
  await goto('activity'); await wait(900);
  // rooms by the lights in them, since earlier tests may have filed the lights into the app's own rooms
  const R = await C(() => { const d = window.__copper.data; const of = id => ({ id: d.devArea(d.dev(id)), name: d.devAreaName(d.dev(id)) }); return { kitchen: of('6'), hall: of('11'), porch: of('7') }; });
  const real = await C(k => ({ asked: window.__asked.length, rooms: [...document.querySelectorAll('.rb .rb-nm span:first-child')].map(e => e.textContent), segs: document.querySelectorAll(`.rb[data-aid="${k}"] .rb-seg`).length, now: !!document.querySelector('.rb-now'), card: (document.querySelector('.til-over') || {}).textContent }), R.kitchen.id);
  check('Activity asks the hub for the day\'s light and draws a ribbon for the kitchen this run lit', real.asked >= 1 && real.rooms.includes(R.kitchen.name) && real.segs >= 1, real);
  check('today has a now line, and the card is headed Today in light (or So far today)', real.now && /today in light|so far today/i.test(real.card || ''), real);
  check('the log is still there below it', (await page.$$('.ev')).length > 0 && (await page.$$('.act-f .chip')).length === 4);
  await at('14 Activity', [['filters', '.act-f', 0, 192, null, 40], ['Today in light', '.til', 20, 252, 372, null], ['day header', '.ll-head', 0, null, null, 32]]);
  await page.screenshot({ path: 'v7-14-today.png', fullPage: true });

  // a made-up yesterday, so the numbers can be checked: the kitchen early and all evening, a lamp to 95% warm at
  // 7:48 pm (a change from the app), a bedside lamp at 12% at 9 pm, the porch from 7:12 pm; the hall never lit
  await C(() => {
    const c = window.__copper;
    c.data.lightHistory = async (from, to) => {
      window.__from = from;
      const t = h => Math.max(from, Math.min(to, from + h * 3600000));
      return { from, to, since: from - 3 * 86400000, lights: {
        5: [[t(6.7), 90, null], [t(8.5), 0, null], [t(12), 60, null], [t(12.67), 0, null], [t(18), 80, null]],
        6: [[t(18.5), 40, 2700], [t(19.8), 95, 2700], [t(21.2), 0, null]],
        11: [[t(0), 10, null], [t(0.58), 0, null], [t(6.5), 30, null], [t(7.17), 0, null], [t(21), 12, null], [t(21.4), 0, null]],
        7: [[t(19.2), 100, null]],
      } };
    };
    c.ui.logBack = 1; c.ui.logScrub = null; c.render();
  });
  await wait(600);
  // the change at 7:48 pm yesterday, from this app, in the log
  await C(() => { const c = window.__copper; c.S.activity.unshift({ kind: 'app', action: { type: 'level', target: 'd:6', level: 95 }, at: new Date(window.__from + 19.8 * 3600000 + 20000).toISOString() }); c.render(); });
  await wait(300);
  const fx = await C(() => {
    const an = sel => [...document.querySelectorAll(sel)].map(e => e.getAnimations().map(a => [a.animationName, a.effect.getTiming().duration, Math.round(a.effect.getTiming().delay)])).flat();
    return { til: an('.til'), wipe: an('.rb-lit'), curve: an('.til-line') };
  });
  const wipes = fx.wipe.filter(a => a[0] === 'lg-wipe').map(a => a[2]);
  check('the day draws in: the card rises (0.32 s), the curve over the scene\'s 1.0 s', fx.til.some(a => a[0] === 'lg-rise' && a[1] === 320) && fx.curve.some(a => a[0] === 'lg-trim' && a[1] === 1000), fx);
  check('each ribbon over 1.0 s from 1.1 s, 0.04 s apart', wipes.length >= 2 && wipes.every((w, i) => !i || w - wipes[i - 1] === 40), fx.wipe);
  await wait(2800);
  const y = await C(k => {
    const q = s => [...document.querySelectorAll(s)].map(e => e.textContent.trim());
    const seg = [...document.querySelectorAll(`.rb[data-aid="${k}"] .rb-seg`)].map(e => [parseFloat(e.style.left), e.style.background]);
    return { over: q('.til-over')[0], head: q('.til-total')[0], facts: q('.til-f'), rooms: q('.rb .rb-nm span:first-child'), dark: q('.rb-dark')[0], seg, axis: q('.rb-axis span'), now: !!document.querySelector('.rb-now'), day: q('.ll-name')[0] };
  }, R.kitchen.id);
  console.log('   yesterday, as drawn:', JSON.stringify(y));
  check('the card is headed "Yesterday in light"', y.over === 'Yesterday in light' && y.day === 'Yesterday', [y.over, y.day]);
  // lit across the house: 12 am to 12:35, 6:30 to 8:30, noon to 12:40, then 6 pm to midnight
  check('lit for 9 h 15 min across the house', y.head === '9 h 15 min', y.head);
  check(`softest after dark: 12% in ${R.hall.name} at 9:00 pm`, y.facts.includes(`Softest after dark: 12% in ${R.hall.name} at 9:00 pm`), y.facts);
  check('on longest: Kitchen Cans', y.facts.some(f => f === 'On longest: Kitchen Cans'), y.facts);
  const litRooms = [R.hall.name, R.kitchen.name, R.porch.name].sort((a, b) => a.localeCompare(b));
  check('a ribbon for each room lit, in name order, the rest named as not lit', y.rooms.join() === litRooms.join() && /^Not lit that day: /.test(y.dark || ''), [y.rooms, litRooms, y.dark]);
  check('the kitchen\'s morning span starts at 6:42 am, as bright as 90% is (alpha 0.825)', Math.abs(y.seg[0][0] - 6.7 / 24 * 100) < 0.05 && Math.abs(parseFloat(y.seg[0][1].split(',')[3]) - 0.825) < 0.01, y.seg[0]);
  check('a past day has no now line and runs to midnight', !y.now && y.axis[y.axis.length - 1] === '12 am', y.axis);
  await page.screenshot({ path: 'v7-14-yesterday.png', fullPage: true });

  // scrub: a tap on the kitchen ribbon at 8:30 pm reads that moment
  const tapAt = async (h, aid, type = 'tap') => C(([hh, a, ty]) => {
    const rbs = document.querySelector('.rbs'); const row = document.querySelector(`.rb[data-aid="${a}"] .rb-strip`).getBoundingClientRect();
    const b = rbs.getBoundingClientRect(); const x = b.left + b.width * hh / 24, yy = row.top + 12;
    const o = (xx, y2) => ({ bubbles: true, cancelable: true, clientX: xx, clientY: y2, pointerId: 5, pointerType: 'touch', isPrimary: true });
    rbs.dispatchEvent(new PointerEvent('pointerdown', o(x, yy)));
    if (ty === 'drag') { for (const dx of [10, 30, 60]) rbs.dispatchEvent(new PointerEvent('pointermove', o(x + dx, yy + 1))); rbs.dispatchEvent(new PointerEvent('pointerup', o(x + 60, yy + 1))); return; }
    if (ty === 'swipe') { for (const dy of [10, 30, 60]) rbs.dispatchEvent(new PointerEvent('pointermove', o(x + 1, yy + dy))); rbs.dispatchEvent(new PointerEvent('pointercancel', o(x + 1, yy + 60))); return; }
    rbs.dispatchEvent(new PointerEvent('pointerup', o(x, yy)));
  }, [h, aid, type]);
  await wait(300);
  await tapAt(20.5, R.kitchen.id);
  await wait(450);
  const sc = await C(() => ({ lab: document.querySelector('.rb-lab').textContent, on: document.querySelector('.rb-scrub').classList.contains('on'), dim: document.querySelector('.rbw').classList.contains('scrubbing'), at: document.querySelectorAll('.rb-seg.at').length, v: [...document.querySelectorAll('.rb-v')].map(e => e.textContent), row: (document.querySelector('.ev.lit') || {}).textContent || '' }));
  check(`a tap reads the moment: "8:30 pm · ${R.kitchen.name} 95% · Warm · from the app"`, new RegExp(`^8:[23]\\d pm · ${R.kitchen.name} 95% · Warm · from the app$`).test(sc.lab) && sc.on, sc.lab);
  check('every room\'s level beside its name, the periods lit then standing out', sc.dim && sc.at >= 2 && sc.v.includes('95%') && sc.v.includes('100%'), sc);
  check('and the matching log row lit', /to 95%/.test(sc.row), sc.row);
  await page.screenshot({ path: 'v7-14-scrubbed.png' });
  // a drag sideways follows the finger; an up-or-down swipe that starts on the ribbons is a scroll, not a scrub
  // from 9 am, 60 px to the right: about four hours on, on the hall's ribbon
  await tapAt(9, R.hall.id, 'drag'); await wait(300);
  const drag = await C(() => document.querySelector('.rb-lab').textContent);
  check('a drag sideways moves the moment with the finger', new RegExp(`^12:\\d\\d pm · ${R.hall.name} off$`).test(drag), drag);
  await C(() => { window.__copper.ui.logScrub = null; window.__copper.render(); }); await wait(400);
  await tapAt(15, R.kitchen.id, 'swipe'); await wait(300);
  check('an up or down swipe starting on the ribbons reads nothing', !(await C(() => document.querySelector('.rb-scrub').classList.contains('on'))));
  await tapAt(20.5, R.kitchen.id); await wait(4600);
  check('the moment goes after a while, on its own', !(await C(() => document.querySelector('.rb-scrub').classList.contains('on'))) && !(await page.$('.ev.lit')));

  // another day: the day header's arrows (and a swipe on it)
  await C(() => document.querySelector('.ll-day.next').click()); await wait(700);
  check('the next arrow goes back to today', (await C(() => document.querySelector('.ll-name').textContent)) === 'Today' && (await C(() => window.__copper.ui.logBack)) === 0);
  check('there is no day after today', await C(() => document.querySelector('.ll-day.next').disabled));
  await C(() => { const h = document.querySelector('.ll-head'); const o = x => ({ bubbles: true, clientX: x, clientY: h.getBoundingClientRect().top + 16, pointerId: 6, pointerType: 'touch', isPrimary: true }); h.dispatchEvent(new PointerEvent('pointerdown', o(300))); for (const x of [290, 250, 200]) h.dispatchEvent(new PointerEvent('pointermove', o(x))); h.dispatchEvent(new PointerEvent('pointerup', o(200))); });
  await wait(300);
  await C(() => { const h = document.querySelector('.ll-head'); const o = x => ({ bubbles: true, clientX: x, clientY: h.getBoundingClientRect().top + 16, pointerId: 7, pointerType: 'touch', isPrimary: true }); h.dispatchEvent(new PointerEvent('pointerdown', o(100))); for (const x of [110, 150, 200]) h.dispatchEvent(new PointerEvent('pointermove', o(x))); h.dispatchEvent(new PointerEvent('pointerup', o(200))); });
  await wait(700);
  check('a swipe right on the day header goes to the day before', (await C(() => window.__copper.ui.logBack)) === 1, await C(() => window.__copper.ui.logBack));

  // no history yet: the card and the ribbons wait with one line
  await C(() => { const c = window.__copper; c.data.lightHistory = async (from, to) => ({ from, to, since: null, lights: {} }); c.ui.logBack = 2; c.render(); }); await wait(700);
  check('no history yet: "Light history starts today."', (await C(() => (document.querySelector('.ll-note') || {}).textContent)) === 'Light history starts today.');
  check('nothing on the page controls a light: no toggle, no slider in the light log', (await page.$$('.ll [data-act="toggle"], .ll input, .ll [role="slider"]')).length === 0);

  check('no errors on the page', !errors.length, errors);
  await C(async prev => { const c = window.__copper; c.data.lightHistory = c.data.__real || c.data.lightHistory; c.data.restoreConfig(prev); await c.save('', { quiet: true }); }, before);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
