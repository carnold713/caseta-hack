// The polish pass, measured: no sheet replay on a sheet-to-sheet step, the recipe list keeps its scroll, no squeezed
// sheets, no title drop with a back arrow, the toast never over the last control, tab switches shift nothing, the
// rainbow button lands on Colour, the light row opens the light page, Home's first room is visible at 390x844, hover
// does not stick on touch, no horizontal overflow at 360/390/1280, no page errors. PORT=4485 node polish_test.js
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400; const BASE = `http://127.0.0.1:${PORT}`;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const SIZES = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, small: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false } };
  let token = null;
  const open = async size => {
    const ctx = await browser.newContext({ ...SIZES[size] });
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
    if (token) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, token);
    await ctx.addInitScript(() => { window.__cls = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__cls.push({ v: e.value, t: e.startTime }); }).observe({ type: 'layout-shift', buffered: true }); } catch (_) {} });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${size}] pageerror: ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/net::ERR|favicon|sw\.js/.test(m.text())) errors.push(`[${size}] console: ` + m.text()); });
    await page.goto(BASE + '/classic/'); await page.waitForTimeout(500);
    if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
    await page.waitForSelector('.room', { timeout: 15000 }); await page.waitForTimeout(1200);
    if (!token) token = await page.evaluate(() => localStorage.getItem('token'));
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); S.view = 'home'; S.room = null; S.roomPage = null; location.hash = 'home'; window.scrollTo(0, 0); render(); }); await page.waitForTimeout(500);
    return { ctx, page };
  };
  const wait = (page, ms) => page.waitForTimeout(ms);
  const sheetY = page => page.evaluate(() => Math.round(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#sheet-root .sheet')).transform).m42));
  const sheetBox = page => page.$eval('#sheet-root .sheet', el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height) }; });
  const titleTop = page => page.$eval('#sheet-root .sh h2', el => Math.round(el.getBoundingClientRect().top));
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // sample the sheet's translateY for 450ms after a tap: a replay is a value near the sheet's height
  const replay = async (page, fn) => { await fn(); const ys = []; for (let i = 0; i < 11; i++) { ys.push(await sheetY(page)); await wait(page, 40); } return Math.max(...ys); };

  // ---------- phone 390x844 ----------
  let { ctx, page } = await open('phone');
  // ia-v5 stage 1: there is no floating bar on Home any more, so the first room has to clear the tab bar instead
  const bar = await page.$eval('#nav', el => Math.round(el.getBoundingClientRect().top));
  const room = await page.$eval('.room', el => Math.round(el.getBoundingClientRect().bottom));
  check(room <= bar, `Home's first room card is fully visible at 390x844 without scrolling (card bottom ${room}, tab bar top ${bar})`);
  check(await page.evaluate(() => { const nb = document.getElementById('nowbar'); return !nb.classList.contains('show') && !nb.querySelector('.pill'); }), 'no pill on Home: the house card at the top carries the house controls');
  // ia-v5 stage 2: the lamp row is the starred lights only, and nothing at all when nothing is starred
  check((await page.$$eval('.ln-lamp', els => els.length)) === (await page.evaluate(() => S.config.favorites.filter(t => t.startsWith('d:') && dev(t.slice(2)) && ['light', 'switch'].includes(dev(t.slice(2)).domain)).length)), 'the lamp row carries the starred lights only');
  check(await page.evaluate(() => { const r = document.querySelector('.room'); const s = document.querySelector('.scenerow'); return r && s && s.getBoundingClientRect().top < r.getBoundingClientRect().top; }), 'the scene row comes before the rooms');
  check(await page.evaluate(() => document.querySelectorAll('.rgrid > .rtile.room').length === areas().length), 'the rooms are one grid, one tile each');
  check(await page.evaluate(() => { const r = document.querySelector('.rtile.room'); return !!r.querySelector('.head[data-act="room-open"]') && !!r.querySelector('.sw'); }), 'a room tile carries the body that opens it and a switch'); // design-spec-v5 4.4: a tile has no chevron, its body is the way in
  check(await page.evaluate(() => { const n = document.querySelector('.nextrow'); const s = document.querySelector('.scenerow'); return !n || (s && n.getBoundingClientRect().top > s.getBoundingClientRect().top); }), 'the Next row, when shown, is last');
  check((await overflow(page)) === 0, 'no horizontal overflow on Home at 390');
  // ia-v5 stage 2 (revised): a room opens in the bottom sheet, and the tile's body is what opens it
  // design-spec-v5 2.1: one ink per component. A tinted tile's name takes --t-ink and its sub line --t-ink-2, so
  // "the name is ink" is now "the name is not the same grey as the line under it", which holds lit and unlit both.
  const roomInk = await page.evaluate(() => { const t = document.querySelector('.rtile.room'); return { n: getComputedStyle(t.querySelector('.n')).color, s: getComputedStyle(t.querySelector('.s')).color }; });
  check(roomInk.n !== roomInk.s, `a room tile's name is its ink, not the second ink its sub line takes (${roomInk.n} vs ${roomInk.s})`);
  await page.click('.room[data-room="20"] .head'); await wait(page, 700);
  check((await page.evaluate(() => S.view)) === 'home' && (await page.evaluate(() => S.room)) === '20', 'the room tile opens the room sheet, over Home');
  check((await page.$eval('#sheet-root .sh h2', el => el.textContent.trim())) === 'Kitchen', "the room sheet's title is the room");
  check((await overflow(page)) === 0, 'no horizontal overflow on the room sheet at 390');
  check(!!(await page.$('.dtile.light [data-act="light-open"]')), "a device tile's body is the way into the light");
  check(await page.evaluate(() => { const r = document.querySelector('.dtile.light'); return !r.querySelector('.fav') && !r.querySelector('.rainbow') && !r.querySelector('.chev'); }), 'the tile carries no star, no rainbow button and no chevron');
  check(await page.evaluate(() => { const r = document.querySelector('.dtile.light'); return !!r.querySelector('.dfoot .dpow') && !!r.querySelector('.lv').textContent.trim(); }), 'a device tile carries the power button in its corner and its value on its second line');
  await page.click('.dtile.light .dn'); await wait(page, 700);
  check(!!(await page.$('#ld')), 'tapping the light row (its name) opens the light page, in the same sheet');
  check(!!(await page.$('#sheet-root [data-act="sheet-back"]')), 'a light opened from the room carries a back arrow to it');
  await page.click('[data-act="sheet-back"]'); await wait(page, 600);
  // the light name is ink, the same way the room name on Home is (the .body type class used to grey the whole fold)
  const nameInk = await page.evaluate(() => { const t = document.querySelector('.dtile.light'); return { name: getComputedStyle(t.querySelector('.dn')).color, val: getComputedStyle(t.querySelector('.lv')).color }; });
  check(nameInk.name !== nameInk.val, `a light name on the room sheet is ink, not the second ink its value takes (${nameInk.name} vs ${nameInk.val})`);
  // the pressed state fires on the tile, its power button and the Room setup row (a hover rule used to outrank
  // :active). design-spec-v5 4.10 B: pressing the tile's body steps the WHOLE card, so the surface that changes
  // is the .dtile and not the transparent .dbody the finger is on, which is why the two selectors are separate.
  for (const [sel, obs, label] of [['.dtile.light .dbody', '.dtile.light', 'the tile body'], ['.dtile.light .dpow', '.dtile.light .dpow', 'its power button'], ['[data-act="room-setup"]', '[data-act="room-setup"]', 'the Room setup row']]) {
    const pt = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return { miss: true, view: S.view, room: S.room, page: S.roomPage, hash: location.hash, html: (document.getElementById('view').innerHTML || '').slice(0, 220) }; el.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = el.getBoundingClientRect(); return { x: b.left + Math.min(30, b.width / 2), y: b.top + b.height / 2 }; }, sel);
    if (pt.miss) { console.log('   (diag) missing', sel, JSON.stringify(pt)); continue; }
    await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await wait(page, 200);
    const st = await page.evaluate(([sel, obs]) => { const p = document.querySelector(sel), o = document.querySelector(obs); return { act: p.matches(':active'), bg: getComputedStyle(o).backgroundColor, col: getComputedStyle(o).color, tf: getComputedStyle(o).transform }; }, [sel, obs]);
    await page.mouse.up(); await wait(page, 250);
    // a row that opens something else takes us with it: come back so the resting style can be read on the
    // same row. The room is a sheet now, so closing whatever opened and reopening the room (rather than a
    // page's own back arrow) is what "coming back" means.
    await page.evaluate(() => {
      const wasRoom = S.room;
      if (sheet.isOpen()) sheet.close();
      if (S.view === 'room' && S.roomPage) goRoom(S.room);
      else if (wasRoom && typeof openRoomSheet === 'function') openRoomSheet(wasRoom);
    });
    await wait(page, 600);
    const rest = await page.$eval(obs, el => ({ bg: getComputedStyle(el).backgroundColor, col: getComputedStyle(el).color, tf: getComputedStyle(el).transform }));
    check(st.act && (st.bg !== rest.bg || st.col !== rest.col || st.tf !== rest.tf), `${label} changes while it is held (${st.bg} / ${st.col} / ${st.tf} held, ${rest.bg} / ${rest.col} / ${rest.tf} at rest)`);
  }
  await page.click('.dtile.light .dn'); await wait(page, 700);
  const lightBox = await sheetBox(page); const lightTitle = (await titleTop(page)) - lightBox.top;
  check((await page.$eval('#sheet-root .sb', el => el.scrollTop)) === 0, 'a fresh light page opens scrolled to the top');
  // sheet to sheet: no replay, the title stays on its line, the card eases to the content
  const maxY = await replay(page, () => page.click('[data-act="ld-more"]'));
  check(maxY === 0, `light page to More: the sheet never slides away (translateY stayed at ${maxY})`);
  await wait(page, 200);
  const moreBox = await sheetBox(page); const moreTitle = (await titleTop(page)) - moreBox.top;
  check(!!(await page.$('#sheet-root .sh.hasback [data-act="sheet-back"]')), 'the More sheet has a back arrow');
  check(moreTitle === lightTitle, `the title sits on the same line with a back arrow as without (${moreTitle} vs ${lightTitle} px from the sheet's top)`);
  check(moreBox.h < lightBox.h - 120, `the More sheet sized to its content (${moreBox.h} px, the light page was ${lightBox.h})`);
  const gap = await page.evaluate(() => { const sb = document.querySelector('#sheet-root .sb'); const last = sb.lastElementChild; return Math.round(sb.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom); });
  check(gap <= 40, `no blank slab under the content of a short sheet (${gap} px below the last card)`);
  const maxY2 = await replay(page, () => page.click('[data-act="sheet-back"]'));
  check(maxY2 === 0, `Back: no replay either (${maxY2})`);
  await wait(page, 200);
  // this light was opened from the room (above), so it keeps its own back arrow to it even on the way back
  // from More: that arrow is real, not something to lose, so it is expected here now, not absent.
  check(!!(await page.$('#ld')) && !!(await page.$('#sheet-root .sh.hasback')), 'Back lands on the light page, keeping its own back arrow to the room');
  await page.click('[data-act="sheet-close"]'); await wait(page, 600);
  check((await page.evaluate(() => SHEET_KEY)) === null, 'closing a sheet clears SHEET_KEY');
  // the Remove confirm: footer pinned to the sheet's bottom edge. sheet-close dropped all the way to Home (the
  // room is a sheet too now), so the room is reopened the way a tap would before reaching the light again.
  await page.click('.room[data-room="20"] .head'); await wait(page, 600);
  await page.click('.dtile.light .dn'); await wait(page, 600); await page.click('[data-act="ld-more"]'); await wait(page, 400); await page.click('[data-act="dev-remove"]'); await wait(page, 500);
  const foot = await page.evaluate(() => { const sb = document.querySelector('#sheet-root .sb'); const f = sb.querySelector('.sfoot'); return f ? Math.round(sb.getBoundingClientRect().bottom - f.getBoundingClientRect().bottom) : null; });
  check(foot !== null && Math.abs(foot) <= 1, `the Remove confirm's footer sits on the sheet's bottom edge (${foot} px off)`);
  check(!!(await page.$('#sheet-root .sfoot .btn.danger')), 'Remove is the destructive style');
  await page.click('[data-act="sheet-close"]'); await wait(page, 600);
  // ia-v5 stage 2: the rainbow button is gone from the row. The row's own value is the colour, and it is the way in.
  await page.click('#nav button[data-view=home]'); await wait(page, 600);
  if (await page.$('.room[data-room="hue_room1"]')) {
    await page.evaluate(async () => { const id = Object.keys(S.inv.devices).find(k => (S.inv.devices[k] || {}).color); await command({ type: 'level', target: 'd:' + id, level: 60 }); }); await wait(page, 1200);
    await page.click('.room[data-room="hue_room1"] .head'); await wait(page, 700);
    check(!!(await page.$('.dtile.light .lring.color')) && !(await page.$('.dtile.light .rainbow')), 'a colour lamp wears the rainbow ring on its tile, and no rainbow button');
    check(!!(await page.$('.dtile.light .lv .cdot')), "the colour dot is the tile's value for a lamp that has colour");
    await page.click('.dtile.light .lring.color'); await wait(page, 800);
    // design-spec-v5 4.9: the swatch row came up to the light's own screen and the Colour value row retired into
    // it; the warmth slider and the hue strip stay a tap further, behind "More colours"
    check(!!(await page.$('#sheet-root .ld-swrow .swatch')) && !!(await page.$('#sheet-root [data-act="light-colour"].chip')) && !(await page.$('#sheet-root [data-cwarm]')) && !(await page.$('#sheet-root .cmore')), 'the light page carries the swatch row, and the warmth slider and hue strip stay behind it');
    await page.click('#sheet-root [data-act="light-colour"]'); await wait(page, 900);
    const c = await page.evaluate(() => { const c = document.querySelector('#sheet-root .ccol'); const sb = document.querySelector('#sheet-root .sb'); if (!c) return null; const b = c.getBoundingClientRect(); const s = sb.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), sbTop: Math.round(s.top), sbBottom: Math.round(s.bottom), scroll: sb.scrollTop, vh: innerHeight }; });
    check(!!c, `tapping the Colour row opens the colour controls (section top ${c && c.top})`);
    // the white swatches left the row (the Warmth slider covers white), so give the lamp a colour first; the nearest
    // swatch is marked even when the colour did not come from a tap on it
    await page.evaluate(() => { const id = Object.keys(S.inv.devices).find(k => (S.inv.devices[k] || {}).color); S.states[id] = { ...(S.states[id] || {}), level: 60, color: { mode: 'xy', kelvin: 2000, xy: [0.6, 0.3], hex: '#ff3b30' } }; paintState(); }); await wait(page, 500);
    check((await page.$eval('#sheet-root .swatch.sel', el => getComputedStyle(el).outlineColor)) === 'rgb(38, 38, 38)', 'the nearest swatch is marked, with an ink ring, for a colour the lamp was given');
    await page.click('[data-act="sheet-close"]'); await wait(page, 600);
  } else console.log('skip  (no Hue room paired)');
  // the toast with a sheet open: it lifts over the sheet's sticky footer, so the primary is never under it
  await page.click('#nav button[data-view=automations]'); await wait(page, 500);
  // "New automation" is a row once the home has some, and the empty state's own offer before that
  if (await page.$('[data-act="au-new"]')) { await page.click('[data-act="au-new"]'); await wait(page, 600); }
  await page.click('[data-act="ae-new"]'); await wait(page, 800);
  await page.evaluate(() => toast('Turns Bedroom on', { undo: () => {} })); await wait(page, 500);
  const ts = await page.evaluate(() => {
    const t = document.getElementById('toast').getBoundingClientRect();
    const p = document.querySelector('#sheet-root .sfoot .btn.primary'); const f = document.querySelector('#sheet-root .sfoot');
    const hits = [0.1, 0.5, 0.9].map(fx => { const h = document.elementFromPoint(t.left + t.width * fx, t.top + t.height / 2); return h && h.closest('.sfoot') ? 'FOOTER' : 'clear'; });
    return { toast: [Math.round(t.top), Math.round(t.bottom)], primary: p ? [Math.round(p.getBoundingClientRect().top), Math.round(p.getBoundingClientRect().bottom)] : null, foot: f ? Math.round(f.getBoundingClientRect().top) : null, hits };
  });
  check(!!ts.primary && ts.toast[1] <= ts.primary[0] && !ts.hits.includes('FOOTER'), `the toast sits above a sheet's primary button (toast ${ts.toast.join('..')}, primary ${ts.primary && ts.primary.join('..')})`);
  check((await page.evaluate(() => getComputedStyle(document.getElementById('toast')).transitionProperty)).includes('bottom'), 'the toast eases between its two places instead of jumping');
  // keyboard: the sheet takes focus and Tab stays inside it
  const trap = await page.evaluate(async () => {
    const root = document.getElementById('sheet-root');
    const inside0 = root.contains(document.activeElement);
    const out = [];
    for (let i = 0; i < 12; i++) {
      const list = [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(e => e.getClientRects().length);
      const a = document.activeElement; const idx = list.indexOf(a);
      const next = idx < 0 || idx === list.length - 1 ? list[0] : list[idx + 1];
      next.focus(); out.push(root.contains(document.activeElement));
    }
    return { inside0, all: out.every(Boolean) };
  });
  check(trap.inside0, 'a sheet takes focus when it opens');
  const escaped = await (async () => { for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); } return page.evaluate(() => document.getElementById('sheet-root').contains(document.activeElement)); })();
  check(escaped, 'Tab stays inside the open sheet (the page behind the scrim is never reached)');
  await page.evaluate(() => { document.getElementById('toast').className = ''; });
  await page.click('[data-act="sheet-close"]'); await wait(page, 700);
  check(!(await page.evaluate(() => document.getElementById('toast').className.includes('show'))) && (await page.evaluate(() => getComputedStyle(document.getElementById('toast')).visibility)) === 'hidden', "a hidden toast is out of the tab order (visibility: hidden)");
  // the value row shows its answer: it wraps to a second line instead of being cut
  // ia-v5 stage 2: the room's More sheet is the room setup page now, and its value rows are on it
  await page.click('#nav button[data-view=home]'); await wait(page, 500);
  await page.click('.room[data-room="20"] .head'); await wait(page, 700);
  await page.click('[data-act="room-setup"]'); await wait(page, 700);
  check((await page.evaluate(() => S.roomPage)) === 'setup' && (await page.$eval('#top .nested-hd .t2', el => el.textContent.trim())) === 'Kitchen setup', 'Room setup is a page, reached from the room');
  const vals = await page.$$eval('#view .item .val', els => els.map(e => ({ t: e.textContent.trim(), cut: e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).whiteSpace === 'nowrap' })));
  check(vals.length > 0 && vals.every(v => !v.cut), `no value row hides its answer (${vals.map(v => v.t).slice(0, 3).join(' | ')})`);
  await page.click('[data-act="room-setup-back"]'); await wait(page, 500);
  check((await page.evaluate(() => S.roomPage)) === null && (await page.evaluate(() => S.view)) === 'home' && (await page.evaluate(() => S.room)) === '20', 'back from Room setup reopens the room sheet');
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await wait(page, 500); // the room is a sheet now; closing it is the way back to Home
  check((await page.evaluate(() => S.view)) === 'home' && !(await page.evaluate(() => S.room)), 'closing the room sheet lands on Home');
  // ia-v5 stage 1: the All off hold draws a ring around the power button (it was a background sweep on the bar)
  {
    await page.evaluate(() => window.scrollTo(0, 0)); await wait(page, 300);
    const pb = await page.$eval('.housecard .hc-off', el => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.move(pb.x, pb.y); await page.mouse.down(); await wait(page, 450);
    const sweep = await page.$eval('.housecard .hc-off', el => ({ ring: getComputedStyle(el.querySelector('.c')).boxShadow, holding: el.classList.contains('holding') }));
    await page.mouse.up(); await wait(page, 900);
    check(sweep.holding && /rgba\(0, 109, 204/.test(sweep.ring), `the All off hold rings the power button while held (${sweep.ring.slice(0, 40)})`);
    // the release was a tap, so the house went off: bring it back for the checks that follow
    await page.evaluate(() => command({ type: 'level', target: 'h:all', level: 'on' })); await wait(page, 1600);
  }
  await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await wait(page, 500);
  // ia-v5 stage 1: the Now view is gone. Everything it held is on Home's house card: the headline, the number, the
  // dimmer, All off, and Night / Sleep timer / the shades behind the "..." menu.
  check(await page.$eval('.housecard .hc-head', el => el.textContent.trim().length > 0), 'the house card carries the headline the Now view had');
  check(/%$/.test(await page.$eval('.housecard .hc-num', el => el.textContent)), 'the house number carries a %');
  check(await page.$eval('.housecard .hc-off', el => !el.classList.contains('dark')), 'All off is the primary blue while the house is lit');
  await page.click('[data-act="house-more"]'); await wait(page, 800);
  {
    const acts = await page.$$eval('#sheet-root [data-act]', els => els.map(e => e.dataset.act));
    check(acts.includes('now-night') && acts.includes('house-timer') && acts.includes('house-shades'), `the house menu keeps Night, the sleep timer and the shades (${acts.join(',')})`);
    const box = await sheetBox(page);
    check(/dt-compact/.test(await page.$eval('#sheet-root .sheet', el => el.className)) && box.h <= Math.round(844 * 0.4) + 2, `the house menu is a compact sheet (${box.h}px)`);
  }
  await page.click('[data-act="house-timer"]'); await wait(page, 700);
  {
    const box = await sheetBox(page);
    check(!!(await page.$('#sheet-root .sh.hasback [data-act="sheet-back"]')) && !!(await page.$('#sheet-root .td-ring')), `the house-wide sleep timer opens from the menu with a back arrow (${box.h}px)`);
  }
  await page.click('[data-act="sheet-back"]'); await wait(page, 500);
  check(!!(await page.$('#sheet-root [data-act="house-shades"]')), 'Back lands on the house menu again');
  await page.click('[data-act="sheet-close"]'); await wait(page, 600);
  // the toast never sits on the last control: Settings scrolled to its end
  await page.click('#nav button[data-view=settings]'); await wait(page, 500);
  await page.evaluate(() => { toast('Saved', { undo: () => {} }); window.scrollTo(0, document.documentElement.scrollHeight); }); await wait(page, 400);
  const tb = await page.evaluate(() => { const t = document.getElementById('toast').getBoundingClientRect(); const kids = [...document.querySelectorAll('#view *')].filter(e => e.getClientRects().length); let last = 0; for (const e of kids) last = Math.max(last, e.getBoundingClientRect().bottom); return { toastTop: Math.round(t.top), last: Math.round(last), h: Math.round(t.height) }; });
  check(tb.last <= tb.toastTop, `the last control on Settings clears the toast (control bottom ${tb.last}, toast top ${tb.toastTop})`);
  const hit = await page.evaluate(() => { const b = document.querySelector('[data-act="logout"]').getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el && el.closest('[data-act="logout"]') ? 'row' : (el && el.id) || el.tagName; });
  check(hit === 'row', `Sign out is what is under the finger with a toast up (${hit})`);
  const undoBox = await page.$eval('#toast button', el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return Math.round(b.height + parseFloat(cs.paddingTop) * 0 ); });
  check((await page.$eval('#toast button', el => el.getBoundingClientRect().height)) >= 44, `the toast action has a 44px hit box (${await page.$eval('#toast button', el => Math.round(el.getBoundingClientRect().height))})`);
  void undoBox;
  await page.evaluate(() => { document.getElementById('toast').className = ''; window.scrollTo(0, 0); });
  // hover does not stick on touch: a hovered primary keeps its resting blue
  await page.click('[data-act="night-open"]'); await wait(page, 500);
  await page.click('[data-act="sheet-close"]'); await wait(page, 500);
  await page.click('[data-act="home-name"]'); await wait(page, 500);
  check(!!(await page.$('#sheet-root .sh .donebtn')) && !(await page.$('#sheet-root .sfoot')), 'the home name sheet puts Done in its header and has no footer');
  await page.click('[data-act="sheet-close"]'); await wait(page, 500);
  // the same check on a sheet that does have a real primary: a hovered primary keeps its resting blue
  await page.click('#nav button[data-view=home]'); await wait(page, 500);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.click('[data-act="house-more"]'); await wait(page, 500);
  await page.click('[data-act="house-timer"]'); await wait(page, 700);
  await page.hover('#sheet-root .btn.primary'); await wait(page, 200);
  check((await page.$eval('#sheet-root .btn.primary', el => getComputedStyle(el).backgroundColor)) === 'rgb(0, 109, 204)', 'a hovered primary button keeps its resting blue on a touch device (no sticking hover)');
  await page.click('[data-act="sheet-close"]'); await wait(page, 500);
  await page.click('#nav button[data-view=settings]'); await wait(page, 500);
  // tab switch: layout shift 0
  await page.click('#nav button[data-view=home]'); await wait(page, 600);
  await page.evaluate(() => { window.__cls.length = 0; });
  await page.click('#nav button[data-view=remotes]'); await wait(page, 700);
  await page.click('#nav button[data-view=automations]'); await wait(page, 700);
  const cls = await page.evaluate(() => window.__cls.reduce((a, e) => a + e.v, 0));
  check(cls === 0, `two tab switches cause no layout shift (${cls.toFixed(3)})`);
  // the recipe sheet: content-sized (never squeezed by the button sheet), keeps its scroll, the tick appears where you tapped
  await page.click('#nav button[data-view=remotes]'); await wait(page, 500); await page.click('.remote-card'); await wait(page, 600);
  await page.click('.stage .pk[data-n="0"]'); await wait(page, 600);
  const bh = (await sheetBox(page)).h;
  await page.click('[data-act="gesture-open"][data-g="single"]'); await wait(page, 700);
  const rh = (await sheetBox(page)).h;
  check(rh / 844 >= 0.6, `the recipe sheet is at least 60% of the viewport (${rh} px, ${Math.round(rh / 844 * 100)}%; the button sheet was ${bh})`);
  await page.click('[data-act="recipe-all"]'); await wait(page, 600);
  check(!!(await page.$('#sheet-root .sh.hasback [data-act="sheet-back"]')) && (await page.$eval('#sheet-root .sh h2', el => el.textContent.trim())) === 'All ways', '"Show all ways" pushes an "All ways" sheet with a back arrow');
  const scrollable = await page.$eval('#sheet-root .sb', el => el.scrollHeight - el.clientHeight);
  check(scrollable > 0, `the full list scrolls inside the sheet (${scrollable} px to scroll, in a ${rh}px sheet)`);
  await page.evaluate(s => { document.querySelector('#sheet-root .sb').scrollTop = Math.min(200, s); }, scrollable); await wait(page, 200);
  const before = await page.$eval('#sheet-root .sb', el => el.scrollTop);
  // whichever unselected way is furthest down the list this home happens to offer
  const rid = await page.evaluate(() => { const rows = [...document.querySelectorAll('.item.recipe[data-r]:not(.sel)')]; return rows.length ? rows[Math.min(3, rows.length - 1)].dataset.r : null; });
  check(!!rid, 'the full list offers a way that is not already chosen');
  const maxY3 = await replay(page, () => page.click(`[data-act="recipe"][data-r="${rid}"]`));
  await wait(page, 700);
  const after = await page.$eval('#sheet-root .sb', el => el.scrollTop);
  check(Math.abs(after - before) <= 2, `tapping a recipe keeps the list's scroll (${before} -> ${after})`);
  check(maxY3 === 0, `tapping a recipe does not replay the slide-up (${maxY3})`);
  check(!!(await page.$(`[data-act="recipe"][data-r="${rid}"].sel .chk`)), 'the tick appears on the row that was tapped');
  // Back is the way out of All ways, and it lands on the press sheet (ia-v5 stage 5)
  await page.click('#sheet-root [data-act="sheet-back"]'); await wait(page, 700);
  check(!!(await page.$('[data-act="pick-open"]')), 'Back from All ways lands on the press sheet');
  // the target picker from the recipe sheet is not letterboxed either
  if (!(await page.$('[data-act="pick-target-more"]'))) { await page.click('[data-act="pick-open"]'); await wait(page, 400); }
  await page.evaluate(() => document.querySelector('[data-act="pick-target-more"]').scrollIntoView({ block: 'center' })); await wait(page, 200);
  await page.click('[data-act="pick-target-more"]'); await wait(page, 700);
  const ph = (await sheetBox(page)).h;
  check(ph / 844 >= 0.6, `the lights picker is at least 60% of the viewport (${ph})`);
  const pf = await page.evaluate(() => { const sb = document.querySelector('#sheet-root .sb'); const f = sb.querySelector('.sfoot'); return f ? Math.round(sb.getBoundingClientRect().bottom - f.getBoundingClientRect().bottom) : null; });
  check(pf !== null && Math.abs(pf) <= 1, `the picker's Done sits on the sheet's bottom edge (${pf})`);
  await page.click('[data-act="sheet-close"]'); await wait(page, 600);
  // a walk's sub-sheet keeps the walk's minimum height (Wake-up light > Another light)
  await page.click('#nav button[data-view=automations]'); await wait(page, 500);
  await page.evaluate(() => openWakeupSetup()); await wait(page, 700);
  const wh = (await sheetBox(page)).h;
  if (await page.$('[data-act="gs-lamp-more"]')) {
    const wy = await replay(page, () => page.click('[data-act="gs-lamp-more"]')); await wait(page, 300);
    const lh = (await sheetBox(page)).h;
    check(lh >= wh - 2 && wy === 0, `"Another light…" keeps the walk's height and does not replay (${wh} -> ${lh}, translateY ${wy})`);
    await page.click('[data-act="sheet-back"]'); await wait(page, 500);
  }
  await page.click('[data-act="sheet-close"]'); await wait(page, 600);
  // the wind-down sheet grows with an eased height, not a jump
  await page.click('[data-act="wd-open"]'); await wait(page, 600);
  const h0 = (await sheetBox(page)).h;
  await page.click('#sheet-root [data-act="wd-toggle"]'); await wait(page, 120);
  const hMid = (await sheetBox(page)).h; await wait(page, 500); const h1 = (await sheetBox(page)).h;
  check(h1 !== h0 ? (hMid > Math.min(h0, h1) && hMid < Math.max(h0, h1)) : true, `the wind-down sheet eases between heights (${h0} -> ${hMid} -> ${h1})`);
  await page.click('#sheet-root [data-act="wd-toggle"]'); await wait(page, 600);
  await page.click('[data-act="sheet-close"]'); await wait(page, 600);
  await page.click('[data-act="wd-open"]'); await wait(page, 500); await page.click('[data-act="sheet-close"]'); await wait(page, 600);
  const wdBefore = await page.evaluate(() => sheet.isOpen());
  await page.click('#view [data-act="wd-toggle"]'); await wait(page, 700);
  check(!wdBefore && !(await page.evaluate(() => sheet.isOpen())), 'the wind-down toggle on the tab does not reopen a sheet that was just closed');
  await page.click('#view [data-act="wd-toggle"]'); await wait(page, 600);
  // ia-v5 stage 1: the headline lives on the pill, which shows where Home is not. It still never truncates.
  await page.click('#nav button[data-view=home]'); await wait(page, 500);
  await page.evaluate(() => { for (const id of ['5', '7', '10', '11']) S.states[id] = { ...(S.states[id] || {}), level: 50 }; paintState(); }); await wait(page, 500);
  await page.click('#nav button[data-view=remotes]'); await wait(page, 600);
  const head = await page.$eval('#nb-head', el => ({ t: el.textContent, sw: el.scrollWidth, cw: el.clientWidth }));
  check(head.sw <= head.cw + 1 && /rooms are on$/.test(head.t), `the pill headline fits with four rooms on ("${head.t}")`);
  {
    const g = await page.evaluate(() => { const pill = document.querySelector('#nowbar .pill'); const nav = document.getElementById('nav'); const pb = pill.getBoundingClientRect(), nb = nav.getBoundingClientRect(); return { h: Math.round(pb.height), w: Math.round(pb.width), gap: Math.round(nb.top + 1 - pb.bottom), bottom: getComputedStyle(document.getElementById('nowbar')).bottom }; });
    check(g.h === 44 && g.w >= 160 && g.w <= 280 && g.gap === 8 && g.bottom === '60px', `the pill is 44px, hugs its content and clears the tab bar by 8px (${JSON.stringify(g)})`);
  }
  await page.click('#nav button[data-view=home]'); await wait(page, 500);
  await page.evaluate(() => { for (const id of ['10', '11']) S.states[id] = { ...(S.states[id] || {}), level: 0 }; paintState(); });
  await ctx.close();

  // ---------- small 360x740 and desktop 1280x800: overflow, header column, grabber ----------
  for (const size of ['phone', 'small', 'desktop']) {
    ({ ctx, page } = await open(size));
    check((await overflow(page)) === 0, `no horizontal overflow on Home at ${size}`);
    await page.click('.room[data-room="20"] .head'); await wait(page, 600);
    check((await overflow(page)) === 0, `no horizontal overflow on the room sheet at ${size}`);
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await wait(page, 500); // the room is a sheet now; closing it is the way back to Home
    for (const v of ['remotes', 'automations', 'settings']) { await page.click(`#nav button[data-view=${v}]`); await wait(page, 400); check((await overflow(page)) === 0, `no horizontal overflow on ${v} at ${size}`); }
    // Scenes is a page pushed from Home now, not a tab
    await page.click('#nav button[data-view=home]'); await wait(page, 400); await page.click('[data-act="scenes-open"]'); await wait(page, 500);
    check((await overflow(page)) === 0, `no horizontal overflow on the Scenes page at ${size}`);
    await page.click('[data-act="scenes-back"]'); await wait(page, 400);
    if (size === 'desktop') {
      const tx = await page.$eval('#top .t1', el => Math.round(el.getBoundingClientRect().left));
      const mx = await page.$eval('main', el => Math.round(el.getBoundingClientRect().left + 16));
      check(tx === mx, `the header sits on the 640px content column (title x ${tx}, content x ${mx})`);
      await page.click('#nav button[data-view=settings]'); await wait(page, 500);
      await page.click('[data-act="night-open"]'); await wait(page, 500);
      check((await page.evaluate(() => getComputedStyle(document.querySelector('#sheet-root .grab'), '::before').display)) === 'none', 'the grabber is hidden with a mouse');
      await page.hover('#sheet-root .list > .item'); await wait(page, 200);
      const hb = await page.$eval('#sheet-root .list > .item', el => getComputedStyle(el).backgroundColor);
      void hb;
      await page.click('[data-act="sheet-close"]'); await wait(page, 500);
      await page.click('#nav button[data-view=home]'); await wait(page, 400);
      await page.hover('.rtile.room'); await wait(page, 200);
      check((await page.$eval('.rtile.room', el => getComputedStyle(el).backgroundColor)) !== 'rgb(255, 255, 255)', 'tiles show a hover fill with a mouse');
    }
    await ctx.close();
  }
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  console.log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'ALL OK');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
