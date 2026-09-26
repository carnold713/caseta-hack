// Copper Night v7, the setup group: 16 Onboarding (the house whose windows light page by page), 17 A device added
// (the light that lands in its room chip), 18 Offline, calmly (the ember, the one sentence, a tap that queues
// nothing), and 20 Beyond the app (the icon's shortcuts and the lock screen notification for a running sleep timer).
// Puts back the lights it turned on, takes out the device it added, and cancels the timer it set.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
let bad = 0;
const check = (ok, what, got) => { bad += ok ? 0 : 1; console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${typeof got === 'string' ? got : JSON.stringify(got)})` : '')); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const watch = page => {
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/net::ERR|502|404|401|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  };
  const root = `http://127.0.0.1:${PORT}/`;

  // ================= 16 · Onboarding, on a phone that has never signed in =================
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const p = await ctx.newPage(); watch(p);
    const C = (fn, arg) => p.evaluate(fn, arg);
    const lit = () => C(() => [...document.querySelectorAll('.onboard .ob-house .w')].filter(w => getComputedStyle(w).opacity > 0.95).map(w => w.classList[1]).sort().join(','));
    await p.goto(root); await wait(250);
    check(!!(await p.$('.onboard.v7 .ob-house svg')), 'the first page draws the house');
    const early = await lit();
    await wait(1100);
    check(early === '' && (await lit()) === 'w4', 'it starts dark and the living room window lights 0.4 s in, on the dimmer', { early, now: await lit() });
    const house = await C(() => { const b = document.querySelector('.ob-house').getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); });
    check(house[0] === 0 && house[2] === 412 && Math.abs(house[1] + house[3] - 500) <= 1, 'the house stands on the frame\'s ground line (490) across the 412 frame', house);
    await p.screenshot({ path: 'v7-setup-onboard-1.png' });

    // page 2: the Pico by the door is pressed, its blue ring goes out, and a second window answers
    await p.click('.ob-go'); await wait(150);
    const ring = await C(() => document.querySelector('.ob-ring').getAnimations().map(a => [a.effect.getTiming().duration, a.effect.getTiming().delay]));
    check(ring.length === 1 && ring[0][0] === 700 && ring[0][1] === 680, 'page 2: the Pico\'s signal ring goes out over 0.7 s, 0.68 s after the page arrives', ring);
    const pushed = await C(() => document.querySelectorAll('.onboard .ob-ghost').length);
    check(pushed === 2, 'the words push: the old line drifts out while the new one comes in', pushed);
    const stroke = await C(() => getComputedStyle(document.querySelector('.ob-ring')).stroke);
    check(stroke === 'rgb(82, 174, 255)', 'the signal is Lutron blue, the Pico being Lutron\'s own', stroke);
    await wait(1500);
    check((await lit()) === 'w4,w5', 'the window the Pico controls is lit, and the first never lit twice', await lit());
    await p.screenshot({ path: 'v7-setup-onboard-2.png' });

    // page 3: dusk, the porch, then the rest of the house one by one, the bedroom last over the night fade
    await p.click('.ob-go'); await wait(1000);
    const mid = await lit();
    const w3 = await C(() => getComputedStyle(document.querySelector('.ob-house .w.w3')).transitionDuration);
    await wait(2200);
    const sky = await C(() => getComputedStyle(document.querySelector('.ob-sky')).opacity);
    check(Number(sky) === 1, 'page 3 goes to dusk', sky);
    check(mid.split(',').length < 7 && (await lit()) === 'lantern,w1,w2,w3,w4,w5,w6', 'the house fills one window at a time, the porch lantern too', { mid, end: await lit() });
    check(w3 === '1.6s', 'the bedroom window rises on the night fade', w3);
    check((await C(() => document.querySelector('.ob-go').textContent.trim())) === 'Get started', 'the last page says Get started');
    await p.screenshot({ path: 'v7-setup-onboard-3.png' });

    // back, and a swipe: going back puts out what page 3 lit, at once
    await p.click('.ob-back'); await wait(700);
    check((await lit()) === 'w4,w5', 'back to page 2 puts page 3\'s windows out', await lit());
    const swipe = dx => C(d => { const el = document.querySelector('.onboard'); const f = (t, x) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: 600, pointerId: 3 })); f('pointerdown', 200); f('pointerup', 200 + d); }, dx);
    await swipe(120); await wait(300);
    check(/Control/.test(await p.textContent('.ob-h')), 'a swipe to the right turns back a page');
    await swipe(-120); await wait(300);
    check(/Every/.test(await p.textContent('.ob-h')), 'and a swipe to the left turns on');
    await p.click('.ob-go'); await wait(300); await p.click('.ob-go'); await wait(500);

    // the password: the house waits behind the field, lit; a wrong one dims its windows once
    check(!!(await p.$('#pw')) && (await C(() => document.querySelectorAll('.login-house .w.on').length)) === 7, 'the password page, the house lit behind the field');
    await p.fill('#pw', 'not it'); await p.click('.login-form button'); await wait(250);
    check((await p.textContent('#login-err')) === "That's not it. Try again." && (await C(() => document.querySelector('.login-house').classList.contains('wrong'))), 'a wrong password: the windows dim once and the field says so', await p.textContent('#login-err'));
    await p.screenshot({ path: 'v7-setup-password.png' });
    await ctx.close();
  }

  // ================= signed in =================
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const initSeed = t => { try { if (t) localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', '1'); } catch (_) {} };
  await ctx.addInitScript(initSeed, process.env.APP_TOKEN || '');
  const page = await ctx.newPage(); watch(page);
  const C = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => window.__copper && window.__copper.S.ready, null, { timeout: 15000 });
  await page.goto(root + '#home');
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('.login-form button'); }
  await ready(); await wait(900);
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  const commands = [];
  page.on('request', r => { if (r.url().endsWith('/api/command')) commands.push(r.postData()); });

  try {
    // ================= 17 · A device added =================
    await C(() => { location.hash = 'add'; }); await wait(600);
    await page.waitForSelector('.ad-card .ad-field input', { timeout: 9000 });
    await page.fill('.ad-card .ad-field input', 'Porch Pico');
    const roomId = await C(() => document.querySelector('.ad-rooms [data-act="ad-room"]').dataset.id);
    const roomName = await C(() => document.querySelector('.ad-rooms [data-act="ad-room"]').textContent.trim());
    await page.click(`.ad-rooms [data-act="ad-room"][data-id="${roomId}"]`); await wait(300);
    const steps = await C(() => [...document.querySelectorAll('.ad-steps .as')].map(s => (s.classList.contains('done') ? 'done' : s.classList.contains('on') ? 'on' : '-')).join(' '));
    check(steps === 'done done on', 'with a name and a room, the first two steps tick and the third is in hand', steps);
    const chip = await C(id => { const b = document.querySelector(`.ad-rooms [data-id="${id}"]`).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2].map(Math.round); }, roomId);
    await page.click('[data-act="ad-create"]');
    await page.waitForSelector('.ad-fly .ad-x.lead', { timeout: 8000, state: 'attached' });
    const fly = await C(() => {
      const lead = document.querySelector('.ad-fly .ad-x.lead');
      const tim = el => el.getAnimations().map(a => ({ d: a.effect.getTiming().duration, e: a.effect.getTiming().easing, k: Object.keys(a.effect.getKeyframes()[1]).filter(x => !/offset|easing|composite|computedOffset/.test(x)) }));
      return { x: tim(lead).find(a => a.k.includes('transform')), y: tim(lead.querySelector('.ad-y'))[0], trails: document.querySelectorAll('.ad-fly .ad-x.trail').length, copper: !!lead.querySelector('.glow:not(.off)') };
    });
    check(fly.x && fly.x.d === 600 && fly.x.e === 'ease-out' && fly.y.d === 600 && fly.y.e === 'ease-in-out', 'the light flies on the land token: X eases out, Y eases in and out, so it curves', fly);
    check(fly.trails === 3 && fly.copper, 'a small copper light with three trailing it', fly);
    await wait(700);
    await page.screenshot({ path: 'v7-setup-added-flight.png' });
    const rim = await C(() => { const r = document.querySelector('.ad-fly .ad-rim'); if (!r) return null; const b = r.getBoundingClientRect(); return { at: [b.left + b.width / 2, b.top + b.height / 2].map(Math.round), border: getComputedStyle(r).borderTopColor, anims: r.getAnimations().length }; });
    check(rim && Math.abs(rim.at[0] - chip[0]) <= 1 && Math.abs(rim.at[1] - chip[1]) <= 1 && rim.anims === 1, 'it lands on the room chip it was put in, and the chip glows once', { rim, chip });
    check(rim && rim.border === 'rgb(255, 217, 168)', 'the chip\'s rim is the pale of a lit lamp, not blue', rim && rim.border);
    await page.waitForSelector('.ad-card.done', { timeout: 6000 });
    await wait(500);
    const done = await C(() => ({ t: document.querySelector('.ad-card.done .t').textContent, said: !!document.querySelector('.ad-card.done .ad-said'), go: document.querySelector('.ad-card.done .ad-go').textContent.trim(), steps: document.querySelectorAll('.ad-steps .as.done').length, check: !!document.querySelector('.radar .ad-check') }));
    check(done.t === 'Added Porch Pico' && !done.said, 'Added {name}, and no line repeating the room the button names', done);
    check(done.steps === 3 && done.check, 'every step ticks and the radar holds a check', done);
    check(done.go === 'Set it up now', 'a remote is offered straight to its page to set it up', done.go);
    check((await C(() => window.__copper.data.devArea(window.__copper.data.dev('13') || {}))) === roomId, 'and it is in that room');
    await page.screenshot({ path: 'v7-setup-added.png' });
    await C(async () => { const c = window.__copper; if (c.data.dev('13')) { try { await c.EDIT.removeDevice('13'); } catch (_) {} } });
    await C(() => { location.hash = 'home'; }); await wait(900);

    // ================= 18 · Offline, calmly =================
    // something on, so there is a lit tile to tap and a light to see kept
    const lamp = await C(async () => { const c = window.__copper; const d = c.data.devices().find(x => x.domain === 'light' && !/^(hue_|nanoleaf_)/.test(x.device_id)); await c.run({ type: 'level', target: `d:${d.device_id}`, level: 60 }); return d.device_id; });
    await wait(1200);
    await C(() => { const c = window.__copper; c.S.agent.online = false; c.S.troubleSince = Date.now() - 11000; c.render(); });
    await wait(600);
    const off = await C(() => {
      const home = document.querySelector('.home');
      const e = getComputedStyle(home, '::before'), e2 = getComputedStyle(home, '::after');
      const dot = document.querySelector('.home-head .conn-dot');
      const inner = dot ? getComputedStyle(dot, '::after') : null;
      return {
        cls: document.querySelector('#app').className, card: (document.querySelector('.offline-card') || {}).innerText || '',
        ember: [e.content, e.animationName, e.animationDuration, e2.animationName], field: document.querySelector('.house-light') ? getComputedStyle(document.querySelector('.house-light')).opacity : 'none',
        dot: dot ? [getComputedStyle(dot).backgroundColor, inner.backgroundColor, inner.animationName, inner.animationDuration] : null,
        greet: document.querySelector('.home-head .greet').textContent.trim(),
      };
    });
    check(/offline/.test(off.cls) && /The house computer isn't answering\./.test(off.card) && /It may be restarting\. Your remotes still work\./.test(off.card), 'one calm sentence names the cause, and the remotes still work', off.card);
    check(off.ember[0] !== 'none' && /ember/.test(off.ember[1]) && off.ember[2].startsWith('4.8s') && !/ember/.test(off.ember[3]), 'Home\'s light is one ember, one soft light breathing on the ember token (4.8 s)', off.ember);
    check(off.field === 'none' || Number(off.field) === 0, 'the living field has gone out into it', off.field);
    check(off.dot && !/204, 0, 0/.test(off.dot.join()) && off.dot[1] === 'rgb(158, 158, 158)' && off.dot[2] === 'breathe' && off.dot[3] === '1.6s', 'no red dot: a grey one breathing, as it waits', off.dot);
    check(off.greet === 'Offline · showing last known state', 'the greeting says it is showing the last known state', off.greet);
    await page.screenshot({ path: 'v7-setup-offline.png' });
    await page.click('.offline-card');  await wait(500);
    check((await C(() => (document.querySelector('#sheet-root .t-over') || {}).textContent)) === 'Connection', 'the card opens the connection sheet');
    await C(() => window.__copper.closeSheet());
    // a tap on a light answers at once and sends nothing
    const aid = await C(id => window.__copper.data.devArea(window.__copper.data.dev(id)), lamp);
    await C(a => { location.hash = `room/${a}`; }, aid); await wait(900);
    const veil = await C(() => { const t = document.querySelector('.tile.on'); return t ? getComputedStyle(t, '::after').backgroundColor : null; });
    check(veil === 'rgba(18, 18, 18, 0.35)', 'a lit tile keeps its look under a 35% veil', veil);
    const n0 = commands.length, before = await C(() => JSON.stringify(window.__copper.S.states));
    await page.click(`.tile .pwr[data-id="${lamp}"]`); await wait(250);
    // it used to answer in a toast; toasts are off (the owner's call), so for now the tap is silent
    const toastNow = await C(() => document.querySelector('#toast-root').innerHTML);
    check(toastNow === '', 'a tap on a light shows no toast (toasts are off)', toastNow);
    await wait(800);
    check(commands.length === n0 && before === await C(() => JSON.stringify(window.__copper.S.states)), 'and nothing is sent, queued or pretended', { sent: commands.length - n0 });
    await page.screenshot({ path: 'v7-setup-offline-tap.png' });
    // coming back, for real: the socket drops, reconnects, and the ember goes (the "Back in touch" toast is off)
    await C(() => { location.hash = 'home'; }); await wait(700);
    await C(() => { const c = window.__copper; window.__oldWs = c.S.ws; c.S.agent.online = true; c.S.ws.close(); });
    await wait(150);
    await C(() => { const c = window.__copper; c.S.troubleSince = Date.now() - 11000; c.render(); });
    // what used to be read off the "Back in touch" toast: a new socket open, the house answering, the ember gone
    await page.waitForFunction(() => { const c = window.__copper; return c.S.ws !== window.__oldWs && c.S.wsOpen && c.conn() === 'ok' && !document.querySelector('#app').classList.contains('offline'); }, null, { timeout: 12000 }).catch(() => {});
    await wait(300);
    const back = await C(() => { const c = window.__copper; const r = { fresh: c.S.ws !== window.__oldWs, conn: c.conn(), app: document.querySelector('#app').className, toast: document.querySelector('#toast-root').innerHTML }; delete window.__oldWs; return r; });
    check(back.fresh && back.conn === 'ok' && !/offline/.test(back.app) && back.toast === '', 'back: the socket dials again, the ember goes, and no toast', back);
    await C(async id => { await window.__copper.run({ type: 'level', target: `d:${id}`, level: 'off' }); }, lamp);
    await wait(900);

    // ================= 20 · Beyond the app: the icon's shortcuts =================
    const man = await (await fetch(root + 'manifest.webmanifest')).json();
    const sc = man.shortcuts.map(s => `${s.name} ${s.url}`);
    check(JSON.stringify(man.shortcuts.map(s => s.name)) === '["All off","Goodnight","Night light","Scenes"]', 'the icon\'s long-press offers All off, Goodnight, Night light, Scenes', sc);
    const icons = await Promise.all(man.shortcuts.map(s => fetch(root + s.icons[0].src.slice(1)).then(r => r.status)));
    check(icons.every(s => s === 200), 'each with its own icon', icons);
    // All off acts; it used to say so in a toast, and toasts are off
    const litIds = await C(async () => { const c = window.__copper; const ls = c.data.devices().filter(x => x.domain === 'light' && !/^(hue_|nanoleaf_)/.test(x.device_id)).slice(0, 2); await c.run({ type: 'level', target: `d:${ls[0].device_id}`, level: 40 }); await c.run({ type: 'level', target: `d:${ls[1].device_id}`, level: 70 }); return ls.map(x => x.device_id); });
    await wait(1200);
    await page.goto(root + '?do=all-off'); await ready(); await wait(1800);
    const after = await C(ids => ({ lv: ids.map(id => window.__copper.data.level(id)), url: location.search, hash: location.hash, toast: document.querySelector('#toast-root').innerHTML }), litIds);
    check(after.lv.every(v => !v) && after.url === '' && after.toast === '', 'All off from the icon: everything off, the app open on it, with no toast', after);
    await C(async ids => { for (const id of ids) await window.__copper.run({ type: 'level', target: `d:${id}`, level: 'off' }); }, litIds);
    await wait(900);
    // Goodnight and Night light only open; nothing turns on from outside the app
    const n1 = commands.length;
    await page.goto(root + '?do=goodnight'); await ready(); await wait(1500);
    const gn = await C(() => ({ hash: location.hash, called: !!document.querySelector('.goodnight .hold.called'), inView: (() => { const b = document.querySelector('.goodnight').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; })() }));
    check(gn.called && gn.inView && /home|^$/.test(gn.hash.replace('#', '')), 'Goodnight opens Home with its hold in view, pointed at once, never pressed', gn);
    await page.goto(root + '?do=night-light'); await ready(); await wait(1200);
    const nl = await C(() => location.hash);
    check(nl === '#nightstand' || nl === '#home', 'Night light opens the nightstand', nl);
    await wait(500);
    check(commands.length === n1, 'neither sends a thing', { sent: commands.length - n1 });

    // ================= 20 · the lock screen notification for a running sleep timer =================
    // asked once, right after a timer starts, never on load
    await page.addInitScript(() => { window.__askNotify = true; try { localStorage.removeItem('notifyAsked'); } catch (_) {} });
    // a real load (the address is only a hash away, which would not reload)
    await page.goto(root + '#home'); await page.reload(); await ready(); await wait(1200);
    check(!(await page.$('#sheet-root .nt-preview')), 'nothing is asked on load');
    // a full run leaves other tests' sleep timers going (Nightstand's 15 minutes, a room's): clear them first, so
    // the notifications counted below are only this test's
    await C(async () => { const c = window.__copper; for (const t of Object.keys(c.S.timers || {})) { try { await c.run({ type: 'cancel_timer', target: t.includes('|') ? t.split('|') : t }); } catch (_) {} } });
    for (let i = 0; i < 20 && await C(() => Object.keys(window.__copper.S.timers || {}).length); i++) await wait(250);
    const tLamp = await C(() => window.__copper.data.devices().find(x => x.domain === 'light' && !/^(hue_|nanoleaf_)/.test(x.device_id)).device_id);
    await C(async id => { const c = window.__copper; await c.run({ type: 'level', target: `d:${id}`, level: 30 }); await c.run({ type: 'timer', target: `d:${id}`, minutes: 30, fade: 5 }); }, tLamp);
    await page.waitForSelector('#sheet-root .nt-preview', { timeout: 6000 }).catch(() => {});
    const askTxt = await C(() => (document.querySelector('#sheet-root .sheet') || {}).innerText || '');
    check(/Show running timers on the lock screen\?/.test(askTxt) && /fades out at \d{1,2}:\d\d (am|pm)/.test(askTxt) && /Allow/.test(askTxt) && /Not now/.test(askTxt), 'a timer starts: asked once, with what it would show', askTxt.replace(/\n+/g, ' | '));
    await page.screenshot({ path: 'v7-setup-ask.png' });
    await page.click('#sheet-root [data-act="notify-later"]'); await wait(400);
    check((await C(() => localStorage.getItem('notifyAsked'))) === '1' && !(await page.$('#sheet-root .sheet')), 'Not now, and it never asks again');
    // allowed: the worker shows "{Lamp} fades out at {time}" with Off now and Add 15 min
    await ctx.grantPermissions(['notifications'], { origin: root.replace(/\/$/, '') });
    await C(async id => { const c = window.__copper; await c.run({ type: 'timer', target: `d:${id}`, minutes: 45, fade: 5 }); }, tLamp);
    const notes = async () => C(async () => { const r = await navigator.serviceWorker.ready; return (await r.getNotifications()).map(n => ({ title: n.title, tag: n.tag, actions: (n.actions || []).map(a => a.title), icon: n.icon })); });
    let shown = [];
    for (let i = 0; i < 20 && !shown.length; i++) { await wait(400); shown = await notes().catch(() => []); }
    const name = await C(id => window.__copper.data.dev(id).name, tLamp);
    const want = await C(() => { const t = Object.values(window.__copper.S.timers)[0]; const c = window.__copper; return c.RT.fmtTime(c.RT.zparts(new Date(t.ends_at * 1000)).hm); });
    check(shown.length === 1 && shown[0].title === `${name} fades out at ${want}` && JSON.stringify(shown[0].actions) === '["Off now","Add 15 min"]', '"{Lamp} fades out at {time}", with Off now and Add 15 min', shown);
    check(shown.length === 1 && /timer-candle\.png$/.test(shown[0].icon), 'with the candle', shown[0] && shown[0].icon);
    // the timer ends (cancelled here): the notification goes with it
    await C(async id => { await window.__copper.run({ type: 'cancel_timer', target: `d:${id}` }); }, tLamp);
    let gone = shown;
    for (let i = 0; i < 15 && gone.length; i++) { await wait(300); gone = await notes().catch(() => []); }
    check(!gone.length, 'no timer running, no notification', gone);
    await C(async id => { await window.__copper.run({ type: 'level', target: `d:${id}`, level: 'off' }); }, tLamp);
    await wait(500);

    check(!errors.length, 'no errors on the page', errors);
  } finally {
    await C(async () => { const c = window.__copper; if (c.data.dev('13')) { try { await c.EDIT.removeDevice('13'); } catch (_) {} } for (const t of Object.keys(c.S.timers || {})) { try { await c.run({ type: 'cancel_timer', target: t.includes('|') ? t.split('|') : t }); } catch (_) {} } })
      .catch(e => console.error('could not put the home back:', e.message));
    await C(async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.unregister(); }).catch(() => {});
  }
  await browser.close();
  console.log(bad ? `FAILED ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
