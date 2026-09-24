// Copper Night motion: the animations the Figma file plays on its "M · Motion principles" board and in M1 to M7,
// read off the running app with document.getAnimations(), each checked for the file's duration, curve and values.
// Then the same walk with the phone asking for reduced motion, where none of it may run.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (name, ok, got) => { bad += ok ? 0 : 1; console.log((ok ? 'PASS' : 'FAIL'), name, ok ? '' : `| got: ${JSON.stringify(got)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// every animation running now, as plain data
const running = () => document.getAnimations().map(a => {
  const t = a.effect.getTiming(); const el = a.effect.target; const kf = a.effect.getKeyframes();
  return {
    cls: el ? String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) : '',
    pseudo: a.effect.pseudoElement || '', name: a.animationName || '', dur: Math.round(Number(t.duration)), delay: Math.round(t.delay),
    ease: t.easing, it: t.iterations, props: Object.keys(kf[0] || {}).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)),
    from: kf[0] || {}, to: kf[kf.length - 1] || {}, ghost: !!(el && el.closest && el.closest('.page-ghost, .sheet-ghost')),
  };
});

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
  const { ctx, page } = await open();
  const root = `http://127.0.0.1:${PORT}/`;
  const C = (fn, arg) => page.evaluate(fn, arg);
  const anims = () => C(running);
  const tap = sel => C(s => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel);
  const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });

  await page.goto(root + '#home'); await ready(); await wait(1200);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  await wait(600);

  // ---- the tokens are the file's curves
  const tok = await C(() => { const s = getComputedStyle(document.documentElement); return ['--spring', '--spring-quick', '--ease', '--ease-in', '--ease-both', '--tap', '--sheet-in', '--sheet-out', '--push', '--dimmer', '--scene'].map(k => s.getPropertyValue(k).trim()); });
  check('GENTLE is the file\'s sheet spring', tok[0].startsWith('linear(0, 0.0188, 0.0679') && tok[0].endsWith('0.9993)'), tok[0].slice(0, 40));
  check('QUICK is the file\'s press spring', tok[1].startsWith('linear(0, 0.03, 0.1077') && tok[1].includes('1.1084'), tok[1].slice(0, 40));
  check('standard, EASE_IN and EASE_IN_AND_OUT', tok[2].replace(/\s/g, '') === 'cubic-bezier(.2,.8,.2,1)' && tok[3] === 'ease-in' && tok[4] === 'ease-in-out', tok.slice(2, 5));
  check('durations: tap .12, sheet .42 / .28, push .3, dimmer .4, scene 1.0', tok.slice(5).join() === '120ms,420ms,280ms,300ms,400ms,1000ms', tok.slice(5));

  // ---- M4 · the app opening is a load: its blocks fade in and rise 12 px, 0.32 s, 0.04 s apart
  // (a real reload: going to the same page with a new hash would only be a tab change)
  await C(() => history.replaceState(null, '', '#rooms')); await page.reload(); await ready(); await wait(30);
  let a = await anims();
  const rise = a.filter(x => x.dur === 320 && x.props.includes('transform') && /translateY\(12px\)/.test(x.from.transform || ''));
  const delays = [...new Set(rise.map(x => x.delay))].sort((p, q) => p - q);
  check('M4: opening the app, its blocks rise 12 px over 0.32 s', rise.length >= 3, a.slice(0, 6));
  check('M4: 0.04 s apart', delays.slice(0, 4).join() === '0,40,80,120', delays);
  check('M4: on the standard curve', rise.every(x => x.ease === 'cubic-bezier(0.2, 0.8, 0.2, 1)'), rise.map(x => x.ease));
  await wait(900);

  // ---- a tab: the page slides the way the tab bar reads, 0.3 s standard
  await C(() => { location.hash = 'remotes'; }); await wait(60);
  a = await anims();
  check('a tab to the right comes in from the right', a.some(x => x.dur === 300 && !x.ghost && /translateX\(24px\)/.test(x.from.transform || '')), a.filter(x => x.dur === 300));
  check('and the tab it left drifts out to the left', a.some(x => x.dur === 300 && x.ghost && /translateX\(-24px\)/.test(x.to.transform || '')));
  await wait(500);
  await C(() => { location.hash = 'rooms'; }); await wait(60);
  a = await anims();
  check('a tab to the left comes in from the left', a.some(x => x.dur === 300 && !x.ghost && /translateX\(-24px\)/.test(x.from.transform || '')), a.filter(x => x.dur === 300));
  await wait(600);

  // ---- M4 · push: the room comes in from +24 px, the list drifts -24 px, 0.3 s
  const roomId = await C(() => document.querySelector('[data-go^="room/"]').dataset.go);
  await C(g => { location.hash = g; }, roomId); await wait(60);
  a = await anims();
  const inn = a.find(x => x.dur === 300 && !x.ghost && /translateX\(24px\)/.test(x.from.transform || ''));
  const out = a.find(x => x.dur === 300 && x.ghost && /translateX\(-24px\)/.test(x.to.transform || ''));
  check('M4: a pushed page comes in from +24 px with a fade', !!inn && inn.from.opacity === '0' || (inn && Number(inn.from.opacity) === 0), a.filter(x => x.dur === 300));
  check('M4: the page under it drifts -24 px and fades', !!out && Number(out.to.opacity) === 0, a.filter(x => x.dur === 300));
  await wait(500);
  check('the old page is gone once it has drifted', !(await page.$('.page-ghost')));
  await C(() => history.back()); await wait(60);
  a = await anims();
  check('back runs the other way: in from -24 px', a.some(x => x.dur === 300 && !x.ghost && /translateX\(-24px\)/.test(x.from.transform || '')), a.filter(x => x.dur === 300));
  await wait(600);

  // ---- M2 · a light turns off: the copper pill slides 0.24 s standard; its light fades and shrinks to .85, 0.4 s EASE_IN_AND_OUT
  const light = await C(() => { const c = window.__copper; const d = c.data.controllable().find(x => x.domain === 'light' && c.data.isOn(x.device_id) && c.data.level(x.device_id) > 0) || c.data.controllable().find(x => x.domain === 'light'); return d.device_id; });
  await C(id => { location.hash = `light/${id}`; }, light); await wait(700);
  const wasOn = await C(() => !!document.querySelector('.dev.on'));
  await tap(wasOn ? '[data-act="dev-off"]' : '[data-act="dev-on"]'); await wait(40);
  a = await anims();
  const pill = a.find(x => /onoff-pill/.test(x.cls) && x.props.includes('transform'));
  check('M2: the copper pill slides to the other half, 0.24 s standard', !!pill && pill.dur === 240 && pill.ease === 'cubic-bezier(0.2, 0.8, 0.2, 1)', a.map(x => [x.cls, x.dur, x.props.join('+')]));
  const halo = a.filter(x => /onelight/.test(x.cls));
  check('M2: the lamp\'s one light fades and scales on the dimmer, 0.4 s EASE_IN_AND_OUT', halo.some(x => x.props.includes('opacity') && x.dur === 400 && x.ease === 'ease-in-out') && halo.some(x => x.props.includes('transform') && /0\.85/.test((x.from.transform || '') + (x.to.transform || ''))), halo);
  await wait(600);
  await tap(wasOn ? '[data-act="dev-on"]' : '[data-act="dev-off"]'); await wait(700);

  // ---- M1 · a sheet drops 0.28 s EASE_IN and the scrim fades; the sheet itself is gone at once
  await C(id => { location.hash = `light/${id}/timer`; }, light); await wait(900);
  check('a sheet is up', !!(await page.$('#sheet-root .sheet')));
  await tap('#sheet-root [data-act="sheet-close"]'); await wait(40);
  a = await anims();
  const drop = a.find(x => /\bsheet\b/.test(x.cls) && x.ghost && x.dur === 280);
  check('M1: the sheet drops to 100% over 0.28 s EASE_IN', !!drop && drop.ease === 'ease-in' && /translateY\(100%\)/.test(drop.to.transform || ''), a.filter(x => x.ghost));
  check('M1: the scrim fades with it', a.some(x => /scrim/.test(x.cls) && x.ghost && x.dur === 280 && Number(x.to.opacity) === 0));
  check('the real sheet is closed at once, so nothing on it can be tapped', !(await page.$('#sheet-root .sheet')));
  await wait(450);
  check('and the falling copy is gone after', !(await page.$('.sheet-ghost')));

  // ---- M3 · tiles crossfade: one light 0.4 s, a scene arriving 1.0 s, both EASE_IN_AND_OUT
  await C(g => { location.hash = g; }, roomId); await wait(900);
  const tid = await C(() => { const b = document.querySelector('.room-grid [data-act="toggle"]'); return b && b.dataset.id; });
  if (tid) {
    await tap(`.room-grid [data-act="toggle"][data-id="${tid}"]`); await wait(40);
    a = await anims();
    check('a light toggled: its tile crossfades over the dimmer, 0.4 s', a.some(x => /xf-old/.test(x.cls) && x.dur === 400 && x.ease === 'ease-in-out'), a.filter(x => /xf/.test(x.cls)));
    await wait(700);
    check('the old tile is gone after', !(await page.$('.xf-old')));
    await tap(`.room-grid [data-act="toggle"][data-id="${tid}"]`); await wait(800);
  } else check('the room has a light to toggle', false);
  const chip = await page.$('.room-chips [data-act="scene"]');
  if (chip) {
    await tap('.room-chips [data-act="scene"]'); await wait(1400);
    const xf = await C(() => document.getAnimations().filter(x => /xf-old/.test(String(x.effect.target && x.effect.target.className))).map(x => Math.round(Number(x.effect.getTiming().duration))));
    const scene = await C(() => document.body.classList.contains('scene-arriving'));
    check('M3: a scene arriving crossfades its lights over 1.0 s', scene && (xf.length === 0 || xf.every(d => d === 1000)), { scene, xf });
    await wait(2500);
  }

  // ---- toasts are off (the owner's call): asking for one draws nothing, so nothing of it rises or leaves
  await C(() => window.__copper.toast('Testing')); await wait(400);
  a = await anims();
  const tr = await C(() => document.querySelector('#toast-root').innerHTML);
  check('a toast asked for draws nothing and animates nothing', tr === '' && !a.some(x => /toast/.test(x.cls)), { tr, anims: a.filter(x => /toast/.test(x.cls)) });

  // ---- M7 · listening: three sonar rings a third of a beat apart, the glow breathing; then a ping and the card on GENTLE
  await C(() => { location.hash = 'add'; }); await wait(700);
  a = await anims();
  const rings = a.filter(x => x.name === 'sonar');
  check('M7: three sonar rings, 1.6 s ease-out, looping', rings.length === 3 && rings.every(x => x.dur === 1600 && x.from.easing === 'ease-out' && (x.it === Infinity || x.it === null)), rings.map(x => [x.cls, x.dur, x.from.easing, x.it, x.ghost]));
  check('M7: a third of a beat apart', rings.map(x => x.delay).sort((p, q) => p - q).join() === '0,533,1067', rings.map(x => x.delay));
  check('M7: the glow and the inner ring breathe on 1.6 s', a.some(x => x.name === 'glowbreathe' && x.dur === 1600) && a.some(x => x.name === 'innerbreathe' && x.dur === 1600));
  const t0 = await C(() => document.getAnimations().filter(x => x.animationName === 'sonar').map(x => x.startTime));
  await C(() => window.__copper.render()); await wait(60);
  const t1 = await C(() => document.getAnimations().filter(x => x.animationName === 'sonar').map(x => x.startTime));
  check('a redraw does not start the loop over', t0.length === 3 && t1.every(t => t === 0), { t0, t1 });
  await page.waitForSelector('.ad-card', { timeout: 8000 }).catch(() => null);
  a = await anims();
  const card = a.filter(x => /ad-card/.test(x.cls));
  check('M7: the heard card slides up 360 px on the GENTLE spring', card.some(x => x.dur === 420 && /^linear\(0( 0%)?, 0\.0188/.test(x.ease) && /360px/.test(x.from.transform || '')), card);
  check('M7: one ping goes out, 0.4 s ease-out to 1.7', a.some(x => /ping/.test(x.cls) && x.dur === 400 && /1\.7/.test(x.to.transform || '')), a.filter(x => /ping/.test(x.cls)));
  check('M7: the name field and the rooms rise in after it', a.some(x => /ad-field/.test(x.cls) && x.delay === 200) && a.some(x => /chip/.test(x.cls) && x.delay >= 280));
  await tap('[data-act="back"]'); await wait(800);

  check('no errors on the page', !errors.length, errors);
  await ctx.close();

  // ---- reduced motion: none of it runs
  const rm = await open({ reducedMotion: 'reduce' });
  const P = rm.page;
  await P.goto(root + '#home'); await P.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 }); await wait(900);
  await P.evaluate(() => { location.hash = 'rooms'; }); await wait(60);
  const r1 = await P.evaluate(running);
  await P.evaluate(g => { location.hash = g; }, roomId); await wait(60);
  const r2 = await P.evaluate(running);
  check('reduced motion: no stagger and no push', !r1.concat(r2).some(x => x.dur >= 300 && x.it !== Infinity), r1.concat(r2).slice(0, 4));
  check('reduced motion: no page left drifting', !(await P.$('.page-ghost')));
  await rm.ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
