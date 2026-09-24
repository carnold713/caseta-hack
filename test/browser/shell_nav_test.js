// The shell's history and its motion, clicked through.
//
// History: one Back a step. Tabs never stack (Back from any tab is Home, Back from Home leaves), a link to a tab's own
// page is that tab, a sheet opened from its page is a step of its own and whatever closes it (its X, a choice in it,
// Android's back) steps back, a walk or a deletion that finishes leaves the way Back would, a page opened from a tab
// keeps that tab lit, and a deep link at the bottom of the history does not leave the app on the first Back. Each of
// these was broken in a way the owner could press into: choosing a time in a routine's When sheet wrote the routine
// over the sheet's step and the next Back went Home; finishing Welcome lights pushed Routines on top of the walk, so
// Back went into the walk again; Settings' Rooms row stacked Rooms on Settings.
//
// Motion: through a push, a tab, a sheet rising, dropping and swapped for a picker, a back swipe and a crossfade, every
// line of words keeps its line count and its ellipsis at every frame, as it has at rest at both ends. The frames are
// the real ones: every animation is paused where it starts and stepped through by hand. A crossfade used to lay the
// old words out in the new element's box, so "All off" fading over "5 on" went to two lines, and a label crossfading
// while its area was pressed (scaled to .96) wrapped "Rest your thumb to turn on" onto three.
//
// It puts the configuration back as it found it.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const ROOT = `http://127.0.0.1:${PORT}/`;
const fails = [];
const check = (what, ok, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got).slice(0, 500)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- text through a transition, in the page ----------
const INSTALL = () => {
  if (window.__tx) return;
  // how many lines an element's own words make, and whether they are cut short
  const lines = el => {
    const mids = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) mids.push(r.top + r.height / 2);
    }
    mids.sort((a, b) => a - b);
    const gap = (parseFloat(getComputedStyle(el).fontSize) || 14) * 0.3;
    let k = 0, last = -1e9;
    for (const t of mids) { if (t - last > gap) k++; last = t; }
    return k;
  };
  const blockOf = el => { let b = el; while (b && getComputedStyle(b).display === 'inline') b = b.parentElement; return b || el; };
  const cut = el => { const b = blockOf(el), cs = getComputedStyle(b); return (cs.textOverflow === 'ellipsis' && b.scrollWidth > b.clientWidth + 1) || (cs.webkitLineClamp !== 'none' && b.scrollHeight > b.clientHeight + 1); };
  const shown = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const texts = () => {
    const out = [], seen = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!n.nodeValue.trim() || !el || seen.has(el) || el.closest('script, style, svg')) continue;
      seen.add(el);
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.width < 1) continue;
      out.push(el);
    }
    return out;
  };
  const say = el => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ')[0]} "${el.textContent.trim().slice(0, 30)}"`;
  const lookOf = el => `${lines(el)} line${lines(el) === 1 ? '' : 's'}${cut(el) ? ' cut short' : ''}`;
  window.__tx = {
    anims: [], fresh: new Set(),
    // at rest: what every line of words looks like, stamped on it, so a copy made of it (a ghost, a crossfade)
    // carries what it looked like with it
    stamp() { for (const el of texts()) el.dataset.lc = lookOf(el); },
    // a frame: a stamped line against its stamp; any other remembered, for its own rest at the end
    frame(t) {
      const bad = [];
      for (const el of texts()) {
        const now = lookOf(el);
        if (el.dataset.lc) { if (el.dataset.lc !== now) bad.push(`${t} ms: ${say(el)} rests as ${el.dataset.lc}, shows ${now}`); } else { (el.__frames || (el.__frames = [])).push([t, now]); this.fresh.add(el); }
      }
      return bad;
    },
    end() {
      const bad = [];
      for (const el of this.fresh) {
        if (!el.isConnected || !el.__frames) continue;
        const now = lookOf(el);
        const off = el.__frames.find(([, v]) => v !== now);
        if (off) bad.push(`${off[0]} ms: ${say(el)} showed ${off[1]}, rests as ${now}`);
        el.__frames = null;
      }
      this.fresh = new Set();
      document.querySelectorAll('[data-lc]').forEach(e => e.removeAttribute('data-lc'));
      return bad;
    },
    // every animation that ends, held still where it is, then set to a moment after its own start
    hold() { for (const a of document.getAnimations()) { const t = a.effect && a.effect.getTiming(); if (!t || t.iterations === Infinity || this.anims.includes(a)) continue; a.pause(); a.__t0 = a.currentTime || 0; this.anims.push(a); } },
    seek(ms) { this.hold(); for (const a of this.anims) { try { a.currentTime = a.__t0 + ms; } catch (_) { /* gone */ } } },
    release() { for (const a of this.anims) { try { a.finish(); } catch (_) { try { a.play(); } catch (__) { /* gone */ } } } this.anims = []; },
  };
  // a page change starts its motion in the app's own hashchange; this one is added after it and holds it all
  window.addEventListener('hashchange', () => { if (window.__txOn) window.__tx.hold(); });
};
async function through(page, what, act, { settle = 700 } = {}) {
  await page.evaluate(INSTALL);
  await page.evaluate(() => { window.__tx.stamp(); window.__txOn = true; });
  await page.evaluate(act);
  await page.evaluate(() => window.__tx.hold());
  await wait(120);
  const bad = [];
  for (const t of [0, 30, 60, 100, 140, 180, 220, 260, 300, 360, 420]) bad.push(...await page.evaluate(t => { window.__tx.seek(t); return window.__tx.frame(t); }, t));
  await page.evaluate(() => { window.__txOn = false; window.__tx.release(); });
  await wait(settle);
  bad.push(...await page.evaluate(() => window.__tx.end()));
  check(`${what}: every line of words keeps its lines and its ellipsis throughout`, !bad.length, bad.slice(0, 6));
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  let prev = null;
  const open = async (W, H) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); } catch (_) {} }, process.env.APP_TOKEN);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${W} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/net::ERR|Failed to load resource|WebSocket/.test(m.text()) && !/\/ui\/font\//.test((m.location() || {}).url || '')) errors.push(`${W} console: ${m.text()}`); });
    await page.goto(`${ROOT}?night=0#home`);
    if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
    await page.waitForFunction(() => window.__copper && window.__copper.S && window.__copper.S.ready, null, { timeout: 15000 });
    await wait(800);
    if (!prev) prev = await page.evaluate(() => JSON.stringify(window.__copper.S.config));
    // two routines to walk through, one with a name as long as a name may be
    await page.evaluate(async () => {
      const c = window.__copper; const s = c.S.config.settings;
      s.greeted = true; s.home_name = 'The Arnold-Whitfield Family Lake House o';
      s.adaptive = s.adaptive || {}; s.adaptive.enabled = true;
      c.S.config.schedules = (c.S.config.schedules || []).filter(x => !String(x.id).startsWith('zz'));
      ['Porch, path and garden lights for the long winter evenings w', 'Kitchen'].forEach((n, i) => { const sc = c.RT.newRoutine(); sc.id = `zz${i}`; sc.name = n; });
      await c.save('', { quiet: true });
      // on a rig no earlier test has greeted, the first-time greeting is already up over Home
      if (document.querySelector('#sheet-root[data-key="greet"]')) c.closeSheet();
    });
    return { ctx, page };
  };

  // ================= the history, at the owner's 412 =================
  {
    const { ctx, page } = await open(412, 915);
    const where = () => page.evaluate(() => ({ hash: location.hash, n: history.state && history.state.n, tab: (document.querySelector('#tabs:not([hidden]) [aria-current]') || { dataset: {} }).dataset.go || null, sheet: !!document.querySelector('#sheet-root:not([hidden]) .sheet') }));
    const settled = () => page.evaluate(() => ({ ghosts: document.querySelectorAll('.sheet-ghost, .page-ghost, .xf-old').length, scrims: document.querySelectorAll('.scrim').length, op: getComputedStyle(document.querySelector('#screen')).opacity }));
    const tab = async t => { await page.click(`#tabs [data-go="${t}"]`); await wait(700); };
    const tap = async sel => { await page.evaluate(s => document.querySelector(s).click(), sel); await wait(800); };
    const back = async () => { await page.goBack().catch(() => {}); await wait(800); };
    const is = async (what, hash, n, extra = {}) => { const w = await where(); check(what, w.hash === hash && w.n === n && Object.entries(extra).every(([k, v]) => w[k] === v), w); };

    for (const seq of [['rooms', 'remotes', 'routines', 'settings', 'home'], ['settings', 'routines', 'remotes', 'rooms']]) {
      for (const t of seq) { await tab(t); await is(`the ${t} tab is lit, ${t === 'home' ? 'at the bottom' : 'one step above Home'}`, `#${t}`, t === 'home' ? 0 : 1, { tab: t }); }
    }
    await back(); await is('Back from a tab is Home', '#home', 0, { tab: 'home' });
    await page.evaluate(() => { const b = document.querySelector('#tabs [data-go="routines"]'); b.click(); b.click(); }); await wait(900);
    await is('a tab tapped twice is one step', '#routines', 1);

    // a choice in a sheet steps back to its page
    await tap('.rt-card[data-go="routine/zz0"]');
    await tap('.rs .tok[data-go$="/when"]');
    await is('a routine\'s When is a sheet a step above it', '#routine/zz0/when', 3, { sheet: true });
    await tap('#sheet-root [data-act="w-type"][data-v="time"]');
    await tap('#sheet-root [data-act="w-use"]');
    await is('Use this time steps back to the routine', '#routine/zz0', 2, { sheet: false });
    check('and leaves no sheet, scrim or copy behind', JSON.stringify(await settled()) === JSON.stringify({ ghosts: 0, scrims: 0, op: '1' }), await settled());
    await back(); await is('Back from the routine is Routines', '#routines', 1);

    // a list comes back where it was left, by the back circle, the browser and a swipe alike
    await page.evaluate(async () => { const c = window.__copper; for (let i = 2; i < 9; i++) { const sc = c.RT.newRoutine(); sc.id = `zz${i}`; sc.name = `Routine ${i}`; } await c.save('', { quiet: true }); });
    await wait(600);
    for (const [how, act] of [['the back circle', () => document.querySelector('.routine-page .hdr-btn.back').click()], ['the browser', () => history.back()], ['a back swipe', () => { const b = window.__caseta.back; b.start('left', 2, 400); b.progress(0.5, 150, 400); b.commit(); }]]) {
      await page.evaluate(() => window.scrollTo(0, 600)); await wait(200);
      const y0 = await page.evaluate(() => Math.round(scrollY));
      await tap('.rt-card[data-go="routine/zz7"]');
      const y1 = await page.evaluate(() => Math.round(scrollY));
      await page.evaluate(act); await wait(1000);
      const y2 = await page.evaluate(() => Math.round(scrollY));
      check(`Routines comes back where it was left, by ${how}`, y0 > 300 && y1 === 0 && Math.abs(y2 - y0) <= 1 && (await where()).hash === '#routines', { left: y0, routine: y1, back: y2 });
    }
    await page.evaluate(async () => { const c = window.__copper; c.S.config.schedules = c.S.config.schedules.filter(x => !/^zz[2-8]/.test(x.id)); await c.save('', { quiet: true }); });
    await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);

    // a picker in a sheet, closed by Android's back, and on to the bottom
    await tap('.rt-card[data-go="routine/zz0"]');
    await tap('.routine-page [data-go$="/more"]'); await tap('#sheet-root [data-act="name"]');
    await page.evaluate(() => window.__caseta.back.commit()); await wait(800);
    await is('Android\'s back closes the sheet and its picker to the routine', '#routine/zz0', 2, { sheet: false });
    await page.evaluate(() => window.__caseta.back.commit()); await wait(900);
    await is('and again is Routines', '#routines', 1);
    await page.evaluate(() => window.__caseta.back.commit()); await wait(900);
    await is('and again Home', '#home', 0);
    check('and from Home, Back leaves the app', (await page.evaluate(() => window.__caseta.back.commit())) === false);

    // deleting a routine from its own sheet leaves its page
    await tab('routines'); await tap('.rt-head [data-act="new"]');
    await tap('.routine-page [data-go$="/more"]'); await tap('#sheet-root [data-act="delete"]'); await tap('#sheet-root [data-act="delete-go"]');
    await is('a routine deleted from its sheet leaves for Routines', '#routines', 1, { sheet: false });
    await back(); await is('and Back from there is Home', '#home', 0);

    // a walk: out from its first question, and finished
    await tab('routines'); await tap('.gtile[data-go="setup/welcome"]');
    await tap('[data-act="gs-back"]');
    await is('back from a walk\'s first question is Routines, as it was', '#routines', 1);
    const had = await page.evaluate(() => window.__copper.S.config.schedules.map(x => x.id));
    await tap('.gtile[data-go="setup/welcome"]');
    for (let i = 0; i < 6; i++) { const t = await page.evaluate(() => { const b = document.querySelector('.next-btn:not([disabled])'); if (!b) return null; const t = b.textContent; b.click(); return t; }); await wait(900); if (!t || !/Next/.test(t)) break; }
    await is('finishing Welcome lights lands on Routines, one step above Home', '#routines', 1);
    await back(); await is('and Back is Home, not the walk again', '#home', 0);
    await page.evaluate(async had => { const c = window.__copper; c.S.config.schedules = c.S.config.schedules.filter(x => had.includes(x.id)); await c.save('', { quiet: true }); }, had);

    // links to a tab's page, and the tab a page keeps
    await tab('settings'); await tap('.settings-page [data-go="rooms"]');
    await is('Settings\' Rooms row is the Rooms tab', '#rooms', 1, { tab: 'rooms' });
    await tab('settings'); await tap('.settings-page [data-go="activity"]');
    await is('Activity opened from Settings keeps Settings lit', '#activity', 2, { tab: 'settings' });
    await tab('home'); await tap('.home-head [data-go="activity"]');
    await is('and opened from Home keeps Home lit', '#activity', 1, { tab: 'home' });
    await tab('settings'); await tap('.settings-page [data-go="nightstand"]'); await tap('.ns-home');
    await is('the Nightstand\'s Home is Home at the bottom', '#home', 0);

    // a deep link at the bottom of the history
    await page.goto(`${ROOT}?night=0#settings`); await page.waitForFunction(() => window.__copper && window.__copper.S.ready); await wait(900);
    await page.evaluate(() => { history.replaceState({ n: 0 }, '', location.href); sessionStorage.setItem('navN', '0'); });
    await tab('rooms'); await is('a tab from a deep link takes its place at the bottom', '#rooms', 0);
    await page.evaluate(() => window.__caseta.back.commit()); await wait(800);
    await is('and Back from it is Home, not out of the app', '#home', 0);

    // the app opened (or reloaded) on each tab and on a deep page: another tab takes the bottom entry's place, the same
    // tab again changes nothing, Back is Home, and from Home Back has nowhere to go but out
    for (const [start, to] of [['rooms', 'settings'], ['remotes', 'routines'], ['routines', 'rooms'], ['settings', 'remotes'], ['routine/zz0', 'rooms']]) {
      await page.goto(`${ROOT}?night=0&open=${start.replace('/', '-')}#${start}`); await page.waitForFunction(() => window.__copper && window.__copper.S.ready); await wait(900);
      await is(`opened on ${start}, it is the bottom of the history`, `#${start}`, 0);
      await tab(to); await is(`opened on ${start}, the ${to} tab takes its place at the bottom`, `#${to}`, 0, { tab: to });
      await tab(to); await is('the same tab again changes nothing', `#${to}`, 0);
      check('and Back has somewhere to go (Home)', await page.evaluate(() => window.__caseta.back.can()));
      await page.evaluate(() => window.__caseta.back.commit()); await wait(800);
      await is('Back from it is Home, at the bottom', '#home', 0, { tab: 'home' });
      check('and from Home, Back has nowhere to go but out of the app', !(await page.evaluate(() => window.__caseta.back.can())));
    }
    await page.goto(`${ROOT}?night=0#home`); await page.waitForFunction(() => window.__copper && window.__copper.S.ready); await wait(900);
    await tab('remotes'); await page.reload(); await page.waitForFunction(() => window.__copper && window.__copper.S.ready); await wait(900);
    await is('reloaded on a tab reached from Home, it is still a step above Home', '#remotes', 1, { tab: 'remotes' });
    await tab('settings'); await is('and another tab from there is one step above Home', '#settings', 1, { tab: 'settings' });
    await back(); await is('and Back is Home', '#home', 0);

    // a sheet through a reload and forward, and sheets crossing
    await tab('settings'); await tap('.settings-page [data-go="settings/fade"]');
    await page.reload(); await page.waitForFunction(() => window.__copper && window.__copper.S.ready); await wait(1200);
    await is('a sheet comes back up after a reload', '#settings/fade', 2, { sheet: true });
    await tap('#sheet-root .sheet-close'); await is('and its X steps back', '#settings', 1, { sheet: false });
    await page.goForward(); await wait(900); await is('forward opens it again', '#settings/fade', 2, { sheet: true });
    await page.evaluate(() => { document.querySelector('#sheet-root .sheet-close').click(); setTimeout(() => document.querySelector('.settings-page [data-go="settings/nightlook"]').click(), 80); });
    await wait(1000);
    await is('a sheet opened while another drops is the one up', '#settings/nightlook', 2, { sheet: true });
    check('with one scrim', (await settled()).scrims === 1, await settled());
    await page.evaluate(() => document.querySelector('#tabs [data-go="routines"]').click()); await wait(1000);
    await is('a tab over an open sheet closes it and switches', '#routines', 1, { sheet: false });
    await page.evaluate(() => { document.querySelector('.rt-card[data-go="routine/zz1"]').click(); setTimeout(() => document.querySelector('#tabs [data-go="rooms"]').click(), 60); });
    await wait(1200);
    await is('a tab tapped in the middle of a push lands whole', '#rooms', 1);
    check('with nothing left half faded', JSON.stringify(await settled()) === JSON.stringify({ ghosts: 0, scrims: 0, op: '1' }), await settled());

    // a deletion takes its page with it: a light removed from its About sheet, a room deleted from its setup, a scene
    // deleted from its editor. Each leaves the way Back would, and no step of what is gone is left under it: Back from
    // there is one step, and Home is the only place Back leaves from. Removing a light here is only the app's half of
    // it (the bridge's half is stubbed), so the pretend house keeps every light for the tests after this one.
    // the app opened on `hash`, with the home as it was, a spare room and a spare scene in it, and the stub in place
    const load = async (hash, key) => { await page.goto(`${ROOT}?night=0&open=${key}#${hash}`); await page.waitForFunction(() => window.__copper && window.__copper.S.ready); await wait(900); };
    const fresh = async (hash, key) => {
      await load('home', `${key}a`);
      await page.evaluate(p => {
        const c = window.__copper;
        c.S.config = JSON.parse(p);
        const s = c.S.config.settings; s.greeted = true;
        s.rooms = (s.rooms || []).filter(r => !String(r.id).startsWith('zz'));
        s.rooms.push({ id: 'zzroom', name: 'Spare room', device_ids: [], bridge_area: null, hue_room: null });
        c.S.config.presets = (c.S.config.presets || []).filter(x => !String(x.id).startsWith('zz'));
        c.S.config.presets.push({ id: 'zzscene', name: 'Spare scene', levels: {}, fade: null });
        return c.save('', { quiet: true });
      }, prev);
      await wait(400);
      await load(hash, key);
      await page.evaluate(() => { const c = window.__copper; c.EDIT.removeDevice = async id => { c.EDIT.forgetDevice(id); delete c.S.inv.devices[id]; return { stillListed: true }; }; });
    };
    const push = async h => { await page.evaluate(h => { location.hash = h; }, h); await wait(800); };
    await fresh('home', 'del1');
    const lamp = await page.evaluate(() => { const c = window.__copper; const d = c.data.controllable().find(x => x.domain === 'light' && c.EDIT.canRemove(x.device_id) && c.data.devArea(x)); return d && { id: d.device_id, room: c.data.devArea(d) }; });
    check('there is a light in a room to remove', !!lamp, lamp);
    const remove = async () => { await tap(`.hdr-btn[data-go="light/${lamp.id}/about"]`); await tap('#sheet-root [data-act="about-remove"]'); await tap('#sheet-root [data-act="about-remove-go"]'); await wait(400); };
    const bottom = async what => {
      await page.evaluate(() => window.__caseta.back.commit()); await wait(900);
      await is(`${what}: Back is Home`, '#home', 0, { sheet: false });
      check(`${what}: and from Home, Back has nowhere to go but out`, !(await page.evaluate(() => window.__caseta.back.can())));
    };

    await tab('rooms'); await push(`room/${lamp.room}`); await push(`light/${lamp.id}`);
    await remove();
    await is('a light removed from its About sheet leaves for its room', `#room/${lamp.room}`, 2, { sheet: false });
    await page.evaluate(() => window.__caseta.back.commit()); await wait(900);
    await is('and Back from its room is Rooms', '#rooms', 1);
    await bottom('a light removed from its room');

    await fresh('home', 'del2');
    await push(`light/${lamp.id}`);
    await remove();
    await is('a light opened from Home and removed leaves for Home', '#home', 0, { sheet: false });
    check('and from Home, Back has nowhere to go but out', !(await page.evaluate(() => window.__caseta.back.can())));

    await fresh(`light/${lamp.id}`, 'del3');
    await is('the app opened on a light has it at the bottom', `#light/${lamp.id}`, 0);
    await remove();
    await is('removed, its room takes its place at the bottom', `#room/${lamp.room}`, 0, { sheet: false });
    await bottom('a light the app opened on');

    await fresh('home', 'del4');
    await tab('rooms'); await push('room/zzroom');
    await tap('.hdr-btn[data-go="room/zzroom/setup"]'); await is('a room\'s setup is a sheet a step above it', '#room/zzroom/setup', 3, { sheet: true });
    await tap('#sheet-root [data-act="setup-delete"]'); await tap('#sheet-root [data-act="setup-delete-go"]'); await wait(600);
    await is('a room deleted from its setup leaves for Rooms, one step above Home', '#rooms', 1, { sheet: false, tab: 'rooms' });
    await bottom('a deleted room');

    await fresh('room/zzroom/setup', 'del5');
    await tap('#sheet-root [data-act="setup-delete"]'); await tap('#sheet-root [data-act="setup-delete-go"]'); await wait(600);
    await is('a room deleted from its setup, the app opened on it, is Rooms at the bottom', '#rooms', 0, { sheet: false, tab: 'rooms' });
    await bottom('a room deleted where the app opened');

    await fresh('home', 'del6');
    await push('scenes/zzscene');
    await is('a scene opened by its address is a step above Home', '#scenes/zzscene', 1, { sheet: true });
    await tap('#sheet-root [data-act="scene-delete"]'); await tap('#sheet-root [data-act="scene-delete-go"]'); await wait(600);
    await is('deleted, All scenes takes its place at the same step', '#scenes', 1, { sheet: false });
    await bottom('a scene deleted where it was opened by its address');

    await fresh('scenes/zzscene', 'del7');
    await tap('#sheet-root [data-act="scene-delete"]'); await tap('#sheet-root [data-act="scene-delete-go"]'); await wait(600);
    await is('a scene deleted where the app opened on it is All scenes at the bottom', '#scenes', 0, { sheet: false });
    await bottom('a scene deleted where the app opened');

    await fresh('home', 'del8');
    await push('scenes'); await push('scenes/zzscene');
    await is('a scene opened from All scenes is a sheet a step above it', '#scenes/zzscene', 2, { sheet: true });
    await tap('#sheet-root [data-act="scene-delete"]'); await tap('#sheet-root [data-act="scene-delete-go"]'); await wait(600);
    await is('deleted, it steps back to All scenes', '#scenes', 1, { sheet: false });
    await bottom('a scene deleted from All scenes');
    check('and the deletions were real', await page.evaluate(() => { const c = window.__copper; return !c.data.presets().some(p => p.id === 'zzscene'); }));

    await page.evaluate(async p => { const c = window.__copper; c.S.config = JSON.parse(p); await c.save('', { quiet: true }); }, prev);
    await ctx.close();
  }

  // ================= text through the motion, at 360 and 412 =================
  for (const [W, H] of [[360, 780], [412, 915]]) {
    const { ctx, page } = await open(W, H);
    const go = async h => { await page.evaluate(h => { window.__copper.closeSheet(); location.hash = h; }, h); await wait(900); };
    await go('routines');
    await through(page, `${W}: a push into a routine`, () => document.querySelector('.rt-card[data-go="routine/zz0"]').click());
    await through(page, `${W}: back to Routines`, () => history.back());
    await through(page, `${W}: a tab to Settings`, () => document.querySelector('#tabs [data-go="settings"]').click());
    await through(page, `${W}: a sheet rising`, () => document.querySelector('.settings-page [data-go="settings/connection"]').click());
    await through(page, `${W}: a sheet dropping`, () => document.querySelector('#sheet-root .sheet-close').click());
    await through(page, `${W}: a push into Activity`, () => document.querySelector('.settings-page [data-go="activity"]').click());
    await go('routine/zz0');
    await through(page, `${W}: the More sheet rising`, () => document.querySelector('.routine-page [data-go$="/more"]').click());
    await through(page, `${W}: a picker swapped in`, () => document.querySelector('#sheet-root [data-act="name"]').click());
    await through(page, `${W}: the picker's back arrow`, () => document.querySelector('#sheet-root [data-act="picker-back"]').click());
    await through(page, `${W}: the sheet put away by Android's back`, () => window.__caseta.back.commit());
    await go('routines');
    await through(page, `${W}: a back swipe off Routines`, () => { const b = window.__caseta.back; b.start('left', 2, 400); b.progress(0.4, 120, 400); b.commit(); });
    await go('routines/winddown');
    await through(page, `${W}: the wind-down's headline crossfading off`, () => document.querySelector('[data-act="wd-toggle"]').click(), { settle: 900 });
    await through(page, `${W}: and on`, () => document.querySelector('[data-act="wd-toggle"]').click(), { settle: 900 });
    await go('nightstand');
    await through(page, `${W}: the Nightstand's words crossfading while pressed`, () => { const a = document.querySelector('.ns-area[data-act]'); a.style.transform = 'scale(.96)'; a.click(); });
    // with its lamp on, the line under the title is set smaller through the area's own class, which the fading copy
    // must keep once it sits in the unlit area
    await page.evaluate(() => { const c = window.__copper; const d = c.data.controllable().find(x => x.domain === 'light'); c.S.config.settings.night_light = d.device_id; c.S.states[d.device_id] = { ...(c.S.states[d.device_id] || {}), level: 100 }; c.render(); });
    await wait(700);
    await through(page, `${W}: the Nightstand's lit words crossfading as it goes off`, () => { const c = window.__copper; const d = c.data.dev(c.S.config.settings.night_light); c.S.states[d.device_id] = { ...(c.S.states[d.device_id] || {}), level: 0 }; c.render(); }, { settle: 900 });
    // the shared crossfade, on Home's headline: "All off" and "1 on" are not the same length
    await go('home');
    await page.evaluate(() => { const c = window.__copper; for (const d of c.data.controllable()) c.S.states[d.device_id] = { ...(c.S.states[d.device_id] || {}), level: 0 }; c.render(); });
    await wait(700);
    await through(page, `${W}: Home's headline as a light comes on`, () => { const c = window.__copper; const d = c.data.controllable()[0]; c.S.states[d.device_id] = { ...(c.S.states[d.device_id] || {}), level: 60 }; c.render(); }, { settle: 900 });
    await through(page, `${W}: and as it goes off`, () => { const c = window.__copper; for (const d of c.data.controllable()) c.S.states[d.device_id] = { ...(c.S.states[d.device_id] || {}), level: 0 }; c.render(); }, { settle: 900 });
    await page.evaluate(async p => { const c = window.__copper; c.S.config = JSON.parse(p); await c.save('', { quiet: true }); }, prev);
    await ctx.close();
  }

  // a file that is not there is a 404, not the app's page in its place (the fonts are not in the repository)
  const font = await fetch(`${ROOT}ui/font/LutronSansScreen-Regular.woff2`).then(r => ({ status: r.status, type: r.headers.get('content-type') || '' }));
  check('a missing file under /ui/ is a 404, not the app\'s page', font.status === 404 && !/html/.test(font.type), font);
  const routeOk = await fetch(`${ROOT}ui/`).then(r => r.status === 200 && /html/.test(r.headers.get('content-type') || ''));
  check('and the app\'s page is still the app\'s page', routeOk);
  check('no page errors', !errors.length, errors);
  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
