// Layout, measured: every page, sheet and picker of Routines, Settings, Add a device, Activity, the Nightstand, the
// onboarding and the password, at the owner's 412 and a small Android's 360, over data made to be awkward (a routine
// named with all 60 of its letters, a paused one, one with eight steps, the wake-up and welcome walks' own routines,
// a 40 letter home name, timers running, a full log and an empty one, long bridge names, the connector offline and
// reconnecting). What fails here is what the owner kept finding by eye:
//   words that overflow their box with no ellipsis to say so, or are cut off by a box that clips them
//   two lines of words sitting on each other
//   the page scrolling sideways, or words past the edge of the screen
//   the end of a page still under the floating tab bar when it is scrolled all the way down
//   a sheet reaching higher than 80 from the top, or its last words hidden at its bottom
//   page errors
// Every other page (Home, Rooms, a room, a light, Scenes, Remotes, a remote) is checked for the shell's own rules
// only: the tab bar clearance, no sideways scroll, no errors.
//
// Animations are run to their end before anything is measured, so a page caught mid-stagger does not read as
// overlapping itself. It puts the configuration back as it found it.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const ROOT = `http://127.0.0.1:${PORT}/`;
const fails = [];
let passed = 0;
const check = (what, ok, got) => { if (ok) { passed++; return; } console.log('FAIL ' + what + (got !== undefined ? `  (${JSON.stringify(got).slice(0, 600)})` : '')); fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LONG = 'Porch, path and garden lights for the long winter evenings w';   // the 60 letters a name may have
const HOME = 'The Arnold-Whitfield Family Lake House o';                       // and the 40 a home's may

// ---------- what is measured, in the page ----------
// Every element that holds words of its own is looked at through the lines its words make (Range rects), each cut to
// what the boxes around it let show and trimmed to the glyphs' middle, so two lines merely touching do not count.
const MEASURE = () => {
  const vw = innerWidth;
  const out = { overflow: [], overlap: [], hscroll: [], edge: [] };
  const root = document.querySelector('#sheet-root');
  const scope = root && !root.hidden && root.querySelector('.sheet') ? root.querySelector('.sheet') : document.querySelector('#screen');
  const name = el => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').trim().split(/\s+/).slice(0, 2).join('.')} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36)}"`;
  const hidden = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (e.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || e.classList.contains('xf-old')) return true; } return false; };
  const clipOf = el => {
    const r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const b = e.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { r.l = Math.max(r.l, b.left); r.r = Math.min(r.r, b.right); }
        if (cs.overflowY !== 'visible') { r.t = Math.max(r.t, b.top); r.b = Math.min(r.b, b.bottom); }
      }
      if (cs.position === 'fixed') break;
    }
    return r;
  };
  const inScroller = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (/auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
  const blockOf = el => { let b = el; while (b && getComputedStyle(b).display === 'inline') b = b.parentElement; return b || el; };
  const texts = [], lines = new Map();
  const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement; if (!el || (el.closest('svg') && !el.closest('text')) || hidden(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rects = [...rg.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;
    if (!lines.has(el)) { lines.set(el, []); texts.push(el); }
    lines.get(el).push(...rects);
  }
  for (const el of texts) {
    const box = blockOf(el), bcs = getComputedStyle(box);
    const meant = (bcs.textOverflow === 'ellipsis' && bcs.overflowX !== 'visible') || bcs.webkitLineClamp !== 'none';
    const scroller = inScroller(el);
    // the words' own lines against the box that holds them (scrollWidth would also count a control's invisible reach)
    const bb = box.getBoundingClientRect();
    const inner = { l: bb.left + parseFloat(bcs.borderLeftWidth), r: bb.right - parseFloat(bcs.borderRightWidth), t: bb.top, b: bb.bottom };
    if (!meant && !scroller && box.tagName !== 'CODE' && bb.width > 0 && lines.get(el).some(r => r.right > inner.r + 1 || r.left < inner.l - 1)) out.overflow.push(`${name(box)} runs out of its ${Math.round(bb.width)} px`);
    if (!meant && !/visible|auto|scroll/.test(bcs.overflowY) && bb.height > 0 && lines.get(el).some(r => r.bottom > inner.b + 2)) out.overflow.push(`${name(box)} cut off at its ${Math.round(bb.height)} px height`);
    const clip = clipOf(el), fs = parseFloat(getComputedStyle(el).fontSize) || 14;
    el.__vis = lines.get(el).map(r => { const m = Math.max(0, (r.height - fs) / 2) + fs * 0.12; return { l: Math.max(r.left, clip.l), t: Math.max(r.top + m, clip.t), r: Math.min(r.right, clip.r), b: Math.min(r.bottom - m, clip.b) }; }).filter(r => r.r - r.l > 1 && r.b - r.t > 1);
    if (scroller) continue;
    if (el.__vis.some(r => r.r > vw + 0.5 || r.l < -0.5)) out.edge.push(`${name(el)} past the screen's edge`);
    else if (!meant && lines.get(el).some(r => (r.right > clip.r + 1 && r.left < clip.r) || (r.left < clip.l - 1 && r.right > clip.l))) out.edge.push(`${name(el)} cut off with no ellipsis`);
  }
  const list = texts.filter(e => e.__vis.length);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.contains(b) || b.contains(a)) continue;
    for (const p of a.__vis) for (const q of b.__vis) {
      const ow = Math.min(p.r, q.r) - Math.max(p.l, q.l), oh = Math.min(p.b, q.b) - Math.max(p.t, q.t);
      if (ow > 2 && oh > 3) { out.overlap.push(`${name(a)} on ${name(b)}`); break; }
    }
  }
  const se = document.scrollingElement;
  if (se.scrollWidth > se.clientWidth + 1) out.hscroll.push(`${se.scrollWidth} wide in ${se.clientWidth}`);
  return out;
};
// Scrolled to the bottom: the lowest thing that shows (words, a control, a card) against the tab bar's top, or the
// screen's bottom on a page with no tab bar. Decoration (a glow, anything aria-hidden) is left out.
const CLEAR = () => {
  const se = document.scrollingElement; se.scrollTop = se.scrollHeight;
  const tabs = document.querySelector('#tabs');
  const bar = tabs && !tabs.hidden ? tabs.getBoundingClientRect().top : innerHeight;
  let bottom = -1e9, last = '';
  for (const el of document.querySelectorAll('#screen *')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.xf-old, [aria-hidden="true"], .glow')) continue;
    let unseen = false; for (let e = el; e && e.id !== 'screen'; e = e.parentElement) if (Number(getComputedStyle(e).opacity) === 0) { unseen = true; break; }
    if (unseen) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const shows = !el.children.length || /^(BUTTON|IMG|INPUT|SELECT|svg)$/i.test(el.tagName) || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.boxShadow !== 'none';
    if (shows && r.bottom > bottom) { bottom = r.bottom; last = `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ')[0]}`; }
  }
  return { bar: Math.round(bar), bottom: Math.round(bottom), last, tabs: !!(tabs && !tabs.hidden) };
};
// A sheet: its top, and at the bottom of its own scroll, where its last content ends against its bottom padding.
const SHEET = () => {
  const s = document.querySelector('#sheet-root:not([hidden]) .sheet'); if (!s) return null;
  s.scrollTop = s.scrollHeight;
  const r = s.getBoundingClientRect();
  let bottom = -1e9;
  for (const el of s.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (b.height > 0 && getComputedStyle(el).display !== 'none') bottom = Math.max(bottom, b.bottom); }
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), content: Math.round(bottom), pad: parseFloat(getComputedStyle(s).paddingBottom) };
};
// every animation that ends, ended now
const SETTLE = () => { for (const a of document.getAnimations()) { const t = a.effect && a.effect.getTiming(); if (t && t.iterations !== Infinity) { try { a.finish(); } catch (_) { /* fine */ } } } };

// ---------- the awkward data ----------
const SEED = async ([LONG, HOME]) => {
  const c = window.__copper, S = c.S, RT = c.RT, s = S.config.settings;
  s.greeted = true;
  s.home_name = HOME;
  s.adaptive = s.adaptive || {}; s.adaptive.enabled = true;
  s.location = s.location || { lat: 42.36, lng: -71.06, name: 'Boston' };
  S.config.schedules = (S.config.schedules || []).filter(x => !String(x.id).startsWith('zz'));
  [LONG, 'Kitchen', 'Weekend mornings in the sunroom with the coffee on', 'Bedtime lamps in every room of the upstairs', 'Away'].forEach((n, i) => {
    const sc = RT.newRoutine(); sc.id = `zz${i}`; sc.name = n;
    if (i === 1) sc.at = { type: 'sunset', time: null, offset_min: -30 };
    if (i === 2) sc.days = [0, 6];
    if (i === 3) sc.enabled = false;
    if (i === 4) sc.only_if = 'all_off';
  });
  const many = RT.byId('zz0');
  for (let i = 0; i < 7; i++) many.actions.push(i % 2 ? { type: 'delay', ms: 60000 } : { ...many.actions[0], level: 20 + i * 10 });
  RT.syncPair(many);
  const g = RT.wakeupStart(); if (g.lamp) RT.saveWakeup(g).forEach((x, i) => { x.id = `zzw${i}`; });
  const wl = RT.welcomeStart(); if (!wl.targets.length) wl.targets = RT.lightRooms().slice(0, 2).map(a => `a:${a.id}`);
  const made = RT.saveWelcome(wl) || [];
  if (made.length) { const base = made[0].id; made.forEach((x, i) => { x.id = x.id.startsWith(base) ? `zzm${x.id.slice(base.length)}` : `zzx${i}`; }); }
  await c.save('', { quiet: true });
};
// what the hub keeps outside the configuration: shown here only, and replaced by the hub's next word
const LOCAL = ([full]) => {
  const c = window.__copper, S = c.S;
  const ids = c.data.controllable().map(d => d.device_id);
  S.timers = { ...(S.timers || {}), [`d:${ids[0]}`]: { ends_at: Date.now() + 25 * 60000, level: 0 }, [`d:${ids[1]}`]: { ends_at: Date.now() + 90 * 60000, level: 30 } };
  const remote = c.data.remotes()[0];
  S.activity = full ? Array.from({ length: 40 }, (_, i) => {
    const at = new Date(Date.now() - i * 47 * 60000).toISOString();
    return [remote ? { kind: 'pico', device_id: remote.device_id, button_number: 2, gesture: 'single', bound: true, at } : { kind: 'agent', online: true, at },
      { kind: 'schedule', id: 'zz0', name: 'Porch, path and garden lights for the long winter evenings w', ok: i % 8 !== 1, error: "couldn't reach the bridge because it was restarting", at },
      { kind: 'app', action: { type: 'level', target: `d:${ids[2]}`, level: 40 }, at }, { kind: 'agent', online: i % 2 === 0, at }][i % 4];
  }) : [];
  const info = S.agent && S.agent.info;
  if (info && info.nanoleaf && info.nanoleaf.devices) info.nanoleaf.devices.forEach(d => { d.name = 'Nanoleaf Shapes Hexagons over the living room sofa'; });
  c.render();
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const watch = (p, tag) => {
    p.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/net::ERR|Failed to load resource|WebSocket/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  };
  let prev = null;

  for (const [W, H] of [[412, 915], [360, 780]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage(); watch(page, W);
    await page.goto(`${ROOT}?night=0#home`);
    if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
    await page.waitForFunction(() => window.__copper && window.__copper.S && window.__copper.S.ready, null, { timeout: 15000 });
    await wait(800);
    if (!prev) prev = await page.evaluate(() => JSON.stringify(window.__copper.S.config));
    await page.evaluate(SEED, [LONG, HOME]);
    const ids = await page.evaluate(() => { const c = window.__copper; return { room: c.data.areas()[0].id, light: c.data.controllable()[0].device_id, remote: (c.data.remotes()[0] || {}).device_id || null }; });
    let seen = 0;

    const go = async (hash, { full = true } = {}) => {
      await page.evaluate(h => { const c = window.__copper; c.closeSheet(); c.ui.picker = null; if (location.hash === '#' + h) c.render(); else location.hash = h; }, hash);
      await wait(350);
      await page.evaluate(LOCAL, [full]);
      await wait(150);
    };
    const tap = async sel => { await page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel); await wait(350); };
    // the rules for a page or sheet of this area; `shell` for someone else's page: the shell's rules only
    const look = async (tag, { shell = false } = {}) => {
      seen++;
      await page.evaluate(SETTLE); await page.evaluate(() => window.scrollTo(0, 0));
      const sheet = await page.evaluate(() => !!document.querySelector('#sheet-root:not([hidden]) .sheet'));
      const m = await page.evaluate(MEASURE);
      const at = `${W}: ${tag}`;
      let shot = false;
      if (!shell) {
        check(`${at}: words fit their boxes`, !m.overflow.length, m.overflow);
        check(`${at}: no words on other words`, !m.overlap.length, m.overlap);
        check(`${at}: no words past an edge or cut off`, !m.edge.length, m.edge);
        shot = shot || m.overflow.length || m.overlap.length || m.edge.length;
      }
      check(`${at}: no sideways scroll`, !m.hscroll.length, m.hscroll);
      if (sheet) {
        const s = await page.evaluate(SHEET);
        check(`${at}: the sheet stops 80 from the top`, s.top >= 79.5, s);
        check(`${at}: the sheet's last words clear its bottom`, s.content <= s.bottom - s.pad + 1, s);
      } else {
        const cl = await page.evaluate(CLEAR);
        check(`${at}: the end of the page clears the ${cl.tabs ? 'tab bar' : 'screen\'s bottom'}`, cl.bottom <= cl.bar + 0.5, cl);
        shot = shot || cl.bottom > cl.bar + 0.5;
      }
      if (shot) await page.screenshot({ path: `layout-${W}-${tag.replace(/[^a-z0-9]+/gi, '_')}.png` });
    };

    // ---- Routines
    await go('routines'); await look('Routines');
    await go('routines/winddown'); await look('the evening wind-down');
    for (const s of ['winddown-levels', 'winddown-curve', 'winddown-night']) { await go(`routines/${s}`); await look(`the wind-down's ${s.slice(9)} sheet`); }
    await page.evaluate(() => { const a = window.__copper.S.config.settings.adaptive; a.mode = 'points'; if (!a.points || a.points.length < 2) a.points = [{ time: '07:00', level: 100 }, { time: '18:00', level: 80 }, { time: '21:00', level: 40 }, { time: '23:00', level: 15 }]; });
    await go('routines/winddown-curve'); await look('the curve by the hour');
    await go('routines/winddown'); await look('the wind-down by the hour');
    await page.evaluate(() => { const a = window.__copper.S.config.settings.adaptive; a.mode = 'winddown'; a.enabled = false; });
    await go('routines/winddown'); await look('the wind-down, off');
    await page.evaluate(() => { window.__copper.S.config.settings.adaptive.enabled = true; });
    await go('routines/night'); await look('the night hours sheet');
    await go('routines/where'); await look('where the home is');
    // ---- a routine, its sheets and the pickers inside them
    for (const [id, what] of [['zz0', 'a routine with a long name and eight steps'], ['zz1', 'a routine at sunset'], ['zz3', 'a paused routine'], ['zzw0', 'the wake-up light'], ['zzm', 'the welcome lights']]) { await go(`routine/${id}`); await look(what); }
    for (const s of ['when', 'off', 'days', 'what', 'lights', 'onlyif', 'more']) { await go(`routine/zz0/${s}`); await look(`a routine's ${s} sheet`); }
    await go('routine/zz1/when'); await look('when, at sunset');
    for (const [act, what] of [['name', 'the name picker'], ['steps', 'the steps picker'], ['delete', 'the delete question']]) { await go('routine/zz0/more'); await tap(`#sheet-root [data-act="${act}"]`); await look(what); }
    await go('routine/zz0/what'); await tap('#sheet-root [data-act="what"][data-r="scene"]'); await look('the scene picker');
    // ---- the guided walks, every question
    for (const k of ['welcome', 'wakeup', 'goodnight', 'leaving']) {
      await page.evaluate(() => { window.__copper.ui.gs = null; });
      await go(`setup/${k}`);
      for (let i = 0; i < 5; i++) {
        await look(`${k} walk, question ${i + 1}`);
        const more = await page.evaluate(() => { const b = document.querySelector('.next-btn:not([disabled])'); return !!b && /Next/.test(b.textContent); });
        if (!more) break;
        await tap('.next-btn');
      }
    }
    await page.evaluate(() => { window.__copper.ui.gs = null; });
    // ---- Settings and every sheet under it
    await go('settings'); await look('Settings');
    for (const s of ['name', 'where', 'timezone', 'power', 'onlevel', 'fade', 'night', 'nightlook', 'nightlight', 'connection', 'bridge', 'hue', 'nanoleaf', 'hidden', 'sets', 'how', 'restore', 'logout', 'ideas', 'install']) { await go(`settings/${s}`); await look(`Settings' ${s} sheet`); }
    await go('settings/timezone'); await page.fill('#sheet-root [data-input="tz-q"]', 'a'); await wait(300); await look('a time zone search');
    await go('settings/sets'); await tap('#sheet-root [data-act="set-new"]'); await look('a light set open');
    await page.evaluate(() => { const c = window.__copper; c.S.config.groups = (c.S.config.groups || []).filter(g => !/^New set/.test(g.name)); c.ui.setOpen = null; });
    await go('settings/hue');
    await page.evaluate(() => { const c = window.__copper; c.ui.hue = { step: 'find', bridges: [{ host: '192.168.100.200', name: 'Philips Hue bridge in the upstairs hall closet' }], host: '', busy: false, error: 'The bridge did not answer in time. Check it is on the same network.', manual: true, looked: true }; c.render(); });
    await wait(300); await look('finding a Hue bridge');
    await page.evaluate(() => { const c = window.__copper; c.ui.hue.step = 'press'; c.ui.hue.host = '192.168.100.200'; c.render(); }); await wait(300); await look('pairing a Hue bridge');
    await page.evaluate(() => { window.__copper.ui.hue = null; });
    await go('settings/nanoleaf');
    await page.evaluate(() => { const c = window.__copper; c.ui.nl = { step: 'list', devices: [{ host: '192.168.100.201', name: 'Nanoleaf Lines in the office above the desk' }], host: '', busy: false, error: 'Nothing answered.', manual: true, looked: true }; c.render(); });
    await wait(300); await look('finding a Nanoleaf');
    await page.evaluate(() => { window.__copper.ui.nl = null; });
    // ---- Add a device, Activity, the Nightstand
    await go('add'); await look('Add a device');
    await go('activity'); await look('Activity, a full log');
    await go('activity', { full: false }); await look('Activity, an empty log');
    await go('nightstand'); await look('the Nightstand');
    // ---- the connector offline, then reconnecting
    for (const st of ['off', 'reconnecting']) {
      for (const h of ['routines', 'settings', 'settings/connection', 'nightstand']) {
        await go(h);
        await page.evaluate(st => { const S = window.__copper.S; S.agent.online = false; S.troubleSince = st === 'off' ? Date.now() - 60000 : Date.now(); window.__copper.render(); }, st);
        await wait(250); await look(`${h}, ${st === 'off' ? 'offline' : 'reconnecting'}`);
      }
      await page.evaluate(() => { const S = window.__copper.S; S.agent.online = true; S.troubleSince = 0; window.__copper.render(); });
    }
    // ---- the shell over everyone else's pages
    for (const h of ['home', 'rooms', `room/${ids.room}`, `light/${ids.light}`, 'scenes', 'remotes', ids.remote && `remote/${ids.remote}`, 'timing'].filter(Boolean)) { await go(h); await look(h, { shell: true }); }
    console.log(`${W} wide: ${seen} pages, sheets and pickers looked at`);
    await page.evaluate(async p => { const c = window.__copper; c.closeSheet(); c.S.config = JSON.parse(p); await c.save('', { quiet: true }); }, prev);
    await ctx.close();
  }

  // ---- the first run: never onboarded, not signed in
  for (const [W, H] of [[412, 915], [360, 780]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); watch(page, `${W} first run`);
    await page.goto(`${ROOT}#home`); await wait(600);
    for (let i = 1; i <= 3; i++) {
      await wait(2200);
      await page.evaluate(SETTLE);
      const m = await page.evaluate(MEASURE);
      check(`${W}: onboarding page ${i}: no words on other words`, !m.overlap.length, m.overlap);
      check(`${W}: onboarding page ${i}: words fit and nothing is cut off`, !m.overflow.length && !m.edge.length && !m.hscroll.length, m);
      if (m.overlap.length) await page.screenshot({ path: `layout-${W}-onboarding-${i}.png` });
      await page.click('.ob-go');
    }
    await wait(1000); await page.evaluate(SETTLE);
    const m = await page.evaluate(MEASURE);
    check(`${W}: the password page is clean`, !m.overlap.length && !m.overflow.length && !m.edge.length && !m.hscroll.length, m);
    await ctx.close();
  }

  check('no page errors', !errors.length, errors);
  console.log(`${passed} checks passed, ${fails.length} failed`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
