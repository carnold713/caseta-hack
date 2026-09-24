// A room's picture draws the lights the room really has (web/ui/roomscene.js). The owner asked for it in these words:
// "in my living room, if I have a window tracklight, and a ceiling tracklight, and a floor lamp, it can generate a scene
// with those specific lights... and then if I later go in an add another light, like another floor lamp, the scene
// changes to add that floor lamp", and "I have a nanoleaf aurora as a light and want that visually represented".
// So: each kind of light has a drawing of its own, lit by its light and dark without it; a second of anything is a
// second lamp and leaves the others where they were; the window's lights are drawn at the window; a Nanoleaf with no
// kind is its panels, in the shape its model says; and setting a kind in About this light changes the picture on the
// room's page, its Rooms card and its Home card.
// Needs a Nanoleaf: run it after hue_test, hue_color_test and nanoleaf_test (the suite's order does).
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? `  (${JSON.stringify(got)})` : '')); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); localStorage.setItem('onboarded', '1'); sessionStorage.setItem('next:shown', 'none'); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon|net::ERR|404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const C = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`http://127.0.0.1:${PORT}/#rooms`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => window.__copper && window.__copper.S && window.__copper.S.ready, null, { timeout: 15000 });
  await C(async () => { const c = window.__copper; c.closeSheet(); if (!c.S.config.settings.greeted) { c.S.config.settings.greeted = true; await c.data.saveConfig(); } });
  await wait(900);
  const go = async h => { await C(x => { location.hash = x; }, h); await wait(1000); };

  // ---------- the drawing on its own: a room made up here, drawn, and read back ----------
  // Each fixture as the picture says it: which drawing, which lights, its panels' shape, how strongly its light is
  // lit (the brightest of its lit parts), and its markup with the svg's own id prefix taken out, to compare two draws.
  const draw = (kind, lights) => C(([k, ls]) => import('/ui/roomscene.js').then(m => {
    // a drawing's own ids differ from one svg to the next; what it draws does not
    const same = h => h.replace(/url\(#[^)]*\)/g, 'url()').replace(/ (id|href)="[^"]*"/g, '');
    const L = (l, i) => ({ id: String(l.id || i + 1), name: l.name || `Light ${i + 1}`, kind: l.kind || null, level: l.level == null ? 70 : l.level, kelvin: 2700, hex: l.hex || null, panel: l.panel || null });
    const svg = m.sceneSVG({ id: 'kinds', name: k, kind: k, lights: ls.map(L), fans: [], shades: [] });
    const d = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return [...d.querySelectorAll('[data-fx]')].map(g => {
      const parts = [...d.querySelectorAll(`.rl[data-l="${g.getAttribute('data-i')}"]`)];
      const ops = parts.map(p => Number((/opacity:([\d.]+)/.exec(p.getAttribute('style') || '') || [])[1] || 0));
      // its colour: on its lit parts, and on the stops of its own gradients (its glow, its cones, its lit shade)
      const stops = [...d.querySelectorAll(`[data-l="${g.getAttribute('data-i')}"] stop`)];
      const colours = [...parts, ...stops].map(p => (/color:(#[0-9A-Fa-f]{6})/.exec(p.getAttribute('style') || '') || [])[1]).filter(Boolean);
      return { fx: g.getAttribute('data-fx'), lamps: g.getAttribute('data-lamp').split(' '), shape: g.getAttribute('data-shape'), op: Math.max(0, ...ops), colours: [...new Set(colours)], html: same(g.outerHTML) };
    });
  }), [kind, lights]);

  // ---- the owner's living room: a window track, a ceiling track and a floor lamp are three fixtures, each itself
  const owner = [{ id: '1', kind: 'window-track' }, { id: '2', kind: 'ceiling-track' }, { id: '3', kind: 'floor-lamp' }];
  const three = await draw('living', owner);
  const of = (fx, id) => (fx.find(f => f.lamps.includes(id)) || {}).fx;
  check(three.length === 3 && of(three, '1') === 'wintrack' && of(three, '2') === 'track' && of(three, '3') === 'floor', 'the owner\'s living room: a window track at the window, a track on the ceiling, a floor lamp', three.map(f => [f.fx, f.lamps]));
  // adding another floor lamp adds a second floor lamp, and the three already there stay exactly as they were drawn
  const four = await draw('living', [...owner, { id: '4', kind: 'floor-lamp' }]);
  check(four.length === 4 && four.filter(f => f.fx === 'floor').length === 2 && of(four, '4') === 'floor', 'another floor lamp is a second floor lamp in the picture', four.map(f => [f.fx, f.lamps]));
  check(three.every((f, i) => four[i] && four[i].html === f.html), 'and the three already drawn do not move or change');
  // and a Nanoleaf Aurora, with no kind set, joins them as lit triangles in its own colour
  const five = await draw('living', [...owner, { id: '4', kind: 'floor-lamp' }, { id: 'nanoleaf_A', name: 'Living room panels', panel: 'tri', hex: '#FF3FA4', level: 80 }]);
  const aurora = five.find(f => f.lamps.includes('nanoleaf_A'));
  check(five.length === 5 && aurora && aurora.fx === 'panels' && aurora.shape === 'tri', 'a Nanoleaf Aurora with no kind is drawn as its triangles', aurora && [aurora.fx, aurora.shape]);
  check(aurora && aurora.op > 0.5 && aurora.colours.some(x => x.toUpperCase() === '#FF3FA4'), 'lit, in its own colour', aurora && { op: aurora.op, colours: aurora.colours });
  check(four.every((f, i) => five[i].html === f.html), 'adding it moves nothing already drawn');

  // ---- a second of each kind of place is a second lamp, in every room
  for (const room of ['living', 'kitchen', 'bedroom', 'office', 'dining', 'hall', 'porch', 'bath', 'garage', 'room']) {
    const pairs = [['floor-lamp', 'floor'], ['table-lamp', 'table'], ['wall-sconce', 'sconce'], ['ceiling-pendant', 'pendant'], ['wall-panels', 'panels'], ['ceiling-track', 'track']];
    const got = [];
    for (const [k, fx] of pairs) {
      const two = await draw(room, [{ id: '1', kind: k }, { id: '2', kind: k }]);
      got.push(two.length === 2 && two.every(f => f.fx === fx) ? null : [k, two.map(f => f.fx)]);
    }
    const win = await draw(room, [{ id: '1', kind: 'window-track' }]);
    check(got.every(x => !x) && win[0].fx === 'wintrack', `${room}: two of each are two lamps, and the window takes its window lights`, got.filter(Boolean));
  }

  // ---- each kind that used to borrow another's drawing has its own, lit with its light and dark without it
  const NEW = [['ceiling-track', 'track'], ['wall-track', 'walltrack'], ['window-track', 'wintrack'], ['ceiling-spots', 'spots'], ['window-spots', 'winspots'],
    ['window-tape', 'wintape'], ['window-pendant', 'winpendant'], ['window-string', 'winstring'], ['wall-picture', 'picture'], ['wall-uplight', 'uplight'],
    ['wall-mirror', 'mirror'], ['wall-panels', 'panels']];
  for (const room of ['living', 'bedroom', 'office']) {
    const bad = [];
    for (const [k, fx] of NEW) {
      const on = (await draw(room, [{ id: '1', kind: k, level: 80 }]))[0];
      const off = (await draw(room, [{ id: '1', kind: k, level: 0 }]))[0];
      if (!(on.fx === fx && off.fx === fx && on.op > 0.5 && off.op === 0)) bad.push({ k, on: [on.fx, on.op], off: [off.fx, off.op] });
    }
    check(!bad.length, `${room}: every new kind draws its own fixture, lit when on and dark when off`, bad);
  }
  // a colour lamp's colour reaches each of them
  const blue = [];
  for (const [k] of NEW) { const f = (await draw('living', [{ id: '1', kind: k, level: 80, hex: '#4C8DFF' }]))[0]; if (!f.colours.some(x => x.toUpperCase() === '#4C8DFF')) blue.push(k); }
  check(!blue.length, 'and each glows a colour lamp\'s colour', blue);
  // the panels' shape follows the model: Aurora triangles, Canvas squares, Shapes hexagons, Lines bars
  const shapes = await C(() => import('/ui/roomscene.js').then(m => [['NL22', ''], ['NL29', ''], ['NL42', ''], ['NL59', ''], ['', 'Aurora'], ['', 'Canvas'], ['', 'Hexagons'], ['', 'Lines'], ['', 'Panels']].map(([a, b]) => m.panelShape(a, b))));
  check(JSON.stringify(shapes) === JSON.stringify(['tri', 'square', 'hex', 'line', 'tri', 'square', 'hex', 'line', 'tri']), 'panels take their shape from the model or the name, triangles when unknown', shapes);
  const drawnShapes = [];
  for (const s of ['tri', 'square', 'hex', 'line']) drawnShapes.push((await draw('bedroom', [{ id: 'nanoleaf_B', name: 'Panels', panel: s }]))[0].shape);
  check(drawnShapes.join() === 'tri,square,hex,line', 'and are drawn in that shape', drawnShapes);

  // ---------- in the app ----------
  const was = await C(() => { const s = window.__copper.S.config.settings; return JSON.stringify({ kinds: s.light_kinds || {}, roles: s.roles || {} }); });
  const card = aid => `#screen .room-big[data-go="room/${aid}"]`;
  const fixtures = sel => C(s => [...document.querySelectorAll(`${s} .rs-svg [data-fx]`)].filter(g => !g.dataset.empty).map(g => ({ fx: g.dataset.fx, lamps: g.dataset.lamp.split(' '), shape: g.dataset.shape || null })), sel);
  const fxOf = async (sel, id) => ((await fixtures(sel)).find(f => f.lamps.includes(id)) || {});

  // ---- a Nanoleaf with no kind is its panels, in the shape its controller reports
  const nl = await C(() => { const c = window.__copper; const d = c.data.controllable().find(x => String(x.device_id).startsWith('nanoleaf_') && c.data.devArea(x) && !c.H.roomPhotoURL(c.data.devArea(x))); return d ? { id: d.device_id, aid: c.data.devArea(d), model: d.model || null, kind: c.H.lightKind(d.device_id) } : null; });
  check(!!nl, 'a Nanoleaf filed in a room (nanoleaf_test runs first)', nl);
  if (nl) {
    if (nl.kind) { await C(async id => { const c = window.__copper; delete c.S.config.settings.light_kinds[id]; await c.save('', { quiet: true }); }, nl.id); await wait(600); }
    await go('rooms');
    const f = await fxOf(card(nl.aid), nl.id);
    check(f.fx === 'panels' && f.shape === 'tri', 'on its Rooms card, the living room\'s Nanoleaf (Light Panels, NL22) is its triangles', { f, model: nl.model });
    await C(id => window.__copper.run({ type: 'level', target: `d:${id}`, level: 80 }), nl.id); await wait(500);
    await C(id => window.__copper.run({ type: 'color', target: `d:${id}`, hex: '#FF3FA4' }), nl.id); await wait(1200);
    await go(`room/${nl.aid}`);
    const lit = await C(id => {
      const g = [...document.querySelectorAll('#screen .room-photo-card .rs-svg [data-fx="panels"]')].find(x => x.dataset.lamp.split(' ').includes(id));
      if (!g) return null;
      const parts = [...document.querySelectorAll(`#screen .room-photo-card .rs-svg .rl[data-l="${g.dataset.i}"]`)];
      return { op: Math.max(...parts.map(p => Number(p.style.opacity) || 0)), colours: [...new Set(parts.map(p => getComputedStyle(p).color))] };
    }, nl.id);
    check(lit && lit.op > 0.5 && lit.colours.includes('rgb(255, 63, 164)'), 'on the room\'s page its panels glow its colour', lit);
    // About this light opens on the wall's kinds for it, where its panels are, without setting anything
    await go(`light/${nl.id}/about`);
    const about = await C(() => ({ place: (document.querySelector('.chip[data-place][aria-pressed="true"]') || {}).dataset?.place || null, panels: !!document.querySelector('.kind[data-kind="wall-panels"]') }));
    const kindAfter = await C(id => window.__copper.H.lightKind(id), nl.id);
    check(about.place === 'wall' && about.panels && !kindAfter, 'its About sheet opens on the wall\'s kinds, and nothing is saved for it', { about, kindAfter });
    await C(() => window.__copper.closeSheet()); await wait(500);
    await C(id => window.__copper.run({ type: 'level', target: `d:${id}`, level: 'off' }), nl.id); await wait(400);
  }

  // ---- setting a kind in About this light changes the picture at once: the room's page, its Rooms card and Home
  const pick = await C(() => {
    const c = window.__copper;
    const byId = (x, y) => String(x.device_id).localeCompare(String(y.device_id), undefined, { numeric: true });
    for (const a of c.data.areas()) {
      if (c.H.roomPhotoURL(a.id)) continue;
      const ls = c.H.roomLights(a.id).slice().sort(byId).filter(d => !/^(hue_|nanoleaf_)/.test(String(d.device_id)));
      if (ls.length >= 2) return { aid: a.id, first: ls[0].device_id, second: ls[1].device_id };
    }
    return null;
  });
  check(!!pick, 'a room with two Lutron lights and no photograph', pick);
  if (pick) {
    // no kinds on them to begin with, so what changes is the kind
    await C(async ([a, b]) => { const c = window.__copper; const s = c.S.config.settings; s.light_kinds = s.light_kinds || {}; delete s.light_kinds[a]; delete s.light_kinds[b]; await c.save('', { quiet: true }); }, [pick.first, pick.second]);
    await go(`light/${pick.first}/about`);
    await page.click('.chip[data-place="window"]'); await wait(500);
    await page.click('.kind[data-kind="window-track"]'); await wait(1000);
    const set = await C(id => window.__copper.H.lightKind(id), pick.first);
    check(set === 'window-track', 'About this light sets it as a window track', set);
    await C(() => window.__copper.closeSheet()); await wait(400);
    await go(`room/${pick.aid}`);
    check((await fxOf('#screen .room-photo-card', pick.first)).fx === 'wintrack', 'the room\'s page draws it as a track at the window', await fixtures('#screen .room-photo-card'));
    await go('rooms');
    check((await fxOf(card(pick.aid), pick.first)).fx === 'wintrack', 'so does its Rooms card', await fixtures(card(pick.aid)));
    await go('home');
    const homeSel = `#screen .room-card[data-go="room/${pick.aid}"]`;
    check((await fxOf(homeSel, pick.first)).fx === 'wintrack', 'and its card on Home', await fixtures(homeSel));

    // ---- a second floor lamp, set the same way, is a second floor lamp, and the window track stays where it was
    const before = await C(([s, id]) => { const g = [...document.querySelectorAll(`${s} .rs-svg [data-fx]`)].find(x => x.dataset.lamp.split(' ').includes(id)); return g ? g.innerHTML.replace(/url\(#[^)]*\)/g, 'url()').replace(/ (id|href)="[^"]*"/g, '') : null; }, [homeSel, pick.first]);
    await go(`light/${pick.second}/about`);
    await page.click('.chip[data-place="floor"]'); await wait(500);
    await page.click('.kind[data-kind="floor-lamp"]'); await wait(1000);
    await C(() => window.__copper.closeSheet()); await wait(400);
    await go('home');
    const after = await C(([s, id]) => { const g = [...document.querySelectorAll(`${s} .rs-svg [data-fx]`)].find(x => x.dataset.lamp.split(' ').includes(id)); return g ? g.innerHTML.replace(/url\(#[^)]*\)/g, 'url()').replace(/ (id|href)="[^"]*"/g, '') : null; }, [homeSel, pick.first]);
    check((await fxOf(homeSel, pick.second)).fx === 'floor', 'a light set as a floor lamp is drawn as one', await fixtures(homeSel));
    check(before && before === after, 'and the window track already drawn is drawn just as it was');
    await C(async id => { const c = window.__copper; c.S.config.settings.light_kinds[id] = 'floor-lamp'; await c.save('', { quiet: true }); }, pick.first); await wait(900);
    await go(`room/${pick.aid}`);
    const floors = (await fixtures('#screen .room-photo-card')).filter(f => f.fx === 'floor' && (f.lamps.includes(pick.first) || f.lamps.includes(pick.second)));
    check(floors.length === 2, 'two floor lamps in the room are two floor lamps in its picture', floors);
  }

  // put the kinds (and the roles a kind sets) back as the test found them
  await C(async w => { const c = window.__copper; const x = JSON.parse(w); c.S.config.settings.light_kinds = x.kinds; c.S.config.settings.roles = x.roles; await c.save('', { quiet: true }); }, was);
  await wait(600);
  check(!errors.length, 'no errors on the page', errors);
  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
