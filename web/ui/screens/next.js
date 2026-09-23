// What now: the one suggestion Home offers at a time, the "Coming up" line, the greeting the first time a home
// connects, and Settings' Ideas for your home, which lists every suggestion with the done ones ticked. Carried over
// from the old app's web/js/next.js so none of it is lost; the file draws a card like this ("A card holding one
// row's worth") without saying what goes in it.
//
// One suggestion per session, never over a problem, and "Not now" is remembered: 14 days for that one, and after
// three in a week the card rests for 30.
const DAY = 86400000;
const get = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* fine */ } };
const sget = k => { try { return sessionStorage.getItem(k); } catch (_) { return null; } };
const sset = (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* fine */ } };
const standalone = () => !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

const OUTSIDE = /outside|outdoor|porch|patio|garden|exterior|yard|deck|front|drive|garage/i;
const BED = /bed|nursery|guest/i;
function home(c) {
  const { data, H, REM, RT } = c;
  const rooms = RT.lightRooms();
  const dims = data.controllable().filter(d => d.domain === 'light');
  const usual = data.remotes().filter(d => REM.usualLayoutTargets(d));
  const fresh = usual.find(d => !REM.buttonNumbers(d).some(n => REM.buttonSet(d.device_id, n))) || null;
  const untagged = dims.filter(d => !H.lightKind(d.device_id) && !H.lightRole(d.device_id));
  const walk = rooms.filter(a => H.roomLights(a.id).length >= 2).map(a => a.id);
  const noScenes = walk.filter(aid => !H.roomHasScenes(aid));
  const bedLamp = (() => { const b = dims.filter(d => BED.test(data.devAreaName(d))); return b.find(d => /lamp/i.test(d.name)) || b[0] || null; })();
  const hasGoodnight = data.bindings().some(b => (b.gesture === 'hold' || b.gesture === 'hold_start') && REM.recipeOf(b.actions) === 'goodnight');
  const bedRemote = data.remotes().find(x => BED.test(data.devAreaName(x))) || data.remotes()[0] || null;
  const outside = rooms.filter(a => OUTSIDE.test(a.name));
  return { usual, fresh, untagged, walk, noScenes, bedLamp, hasGoodnight, bedRemote, outside };
}
// The table: `can` says whether it could ever apply in this home, `when` whether it applies now.
function table(c) {
  const x = home(c); const { data, RT } = c;
  return [
    { id: 'remote', can: x.usual.length > 0, when: !!x.fresh,
      title: `Set up the ${data.devAreaName(x.fresh || x.usual[0] || {})} remote?`, reason: `Top turns ${data.devAreaName(x.fresh || x.usual[0] || {})} on, bottom off, hold to dim. Ten seconds.`, act: 'next-remote', id2: x.fresh && x.fresh.device_id },
    { id: 'sort', can: data.controllable().some(d => d.domain === 'light'), when: x.untagged.length > 0,
      title: 'Want your lights sorted?', reason: 'Say what kind of lamp each one is, and Relax, Dinner and Movie know what to dim.', go: x.untagged[0] ? `light/${x.untagged[0].device_id}/about` : null },
    { id: 'moods', can: x.walk.length > 0, when: x.noScenes.length > 0,
      title: `Suggest scenes for the ${data.areaName(x.noScenes[0] || x.walk[0])}?`, reason: 'Bright, Relax, Dinner, Movie and Night, made from what each light is.', act: 'next-moods', id2: x.noScenes[0] },
    { id: 'welcome', can: x.outside.length > 0, when: !RT.schedules().some(sc => sc.kind === 'welcome'),
      title: 'Lights on before you get home?', reason: `${(x.outside[0] || {}).name || 'Outside'} comes on as you arrive and goes off at bedtime.`, go: 'setup/welcome' },
    { id: 'wakeup', can: !!x.bedLamp, when: !RT.schedules().some(sc => sc.kind === 'wakeup'),
      title: 'Wake up to a slow light?', reason: `The ${(x.bedLamp || {}).name} rises from dark over 25 minutes.`, go: 'setup/wakeup' },
    { id: 'goodnight', can: data.remotes().length > 0, when: !x.hasGoodnight,
      title: 'One button for goodnight?', reason: `Hold the bottom button on ${(x.bedRemote || {}).name}: everything off, a dim path to bed.`, go: 'setup/goodnight' },
    { id: 'install', can: true, when: !standalone(), title: 'Add this app to your home screen?', reason: 'It opens full-screen, like a real app.', go: 'settings/install' },
  ];
}
const snoozed = id => Number(get(`next:${id}:until`) || 0) > Date.now();
const quiet = () => Number(get('next:quiet:until') || 0) > Date.now();

// A problem takes the slot: a button pointing at something gone, or a routine that did not run.
function problem(c) {
  const b = c.data.bindings().find(x => c.REM.bindingBroken(x));
  if (b) { const d = c.data.dev(b.device_id); return { title: `${d ? d.name : 'A remote'} points at something that is gone`, reason: 'Pick again.', go: `remote/${b.device_id}`, warn: true }; }
  const sc = c.RT.list().find(x => c.RT.failedLast(x));
  if (sc) return { title: `${sc.name} didn't run`, reason: "Couldn't reach the bridge", go: `routine/${sc.id}`, warn: true };
  return null;
}
function pick(c) {
  if (quiet()) return null;
  const all = table(c);
  const shown = sget('next:shown');
  if (shown === 'none') return null;
  if (shown) { const s = all.find(x => x.id === shown); return s && s.can && s.when && !snoozed(s.id) ? s : null; }
  const s = all.find(x => x.can && x.when && !snoozed(x.id));
  sset('next:shown', s ? s.id : 'none');
  return s || null;
}

// Home's cards: what is due within the hour, then the problem or the one suggestion.
export function homeCards(c) {
  const { esc, icon, RT } = c;
  let out = '';
  const due = RT.upcoming(3600000)[0];
  if (due) {
    const sc = RT.parentOf(due.sc) || due.sc;
    const off = due.sc !== sc;
    const sk = RT.skipping(sc);
    out += `<div class="card-row next-row" data-go="routine/${esc(sc.id)}" role="link"><span class="row-ic">${icon('clock', 20, 1.6)}</span>
      <span class="row-txt"><span class="t">${esc(sc.name)}${off ? (due.sc.actions.some(a => a.type === 'raise') ? ' opens' : ' off') : ''} at ${esc(due.n.time)}</span><span class="d">Coming up</span></span>
      <button class="link blue" data-act="${sk ? 'next-unskip' : 'next-skip'}" data-id="${esc(sc.id)}" data-date="${esc(due.n.date)}">${sk ? "Don't skip" : 'Skip'}</button></div>`;
  }
  const lv = RT.curveLevelNow();
  if (lv != null && lv < 100) out += `<button class="wd-home" data-go="routines/winddown">${icon('moon', 16, 1.6)}Evening wind-down is on · lights come on at ${lv}% now</button>`;
  const p = problem(c);
  const s = p || pick(c);
  if (s) {
    const tag = s.go ? `data-go="${esc(s.go)}"` : `data-act="${s.act}" data-id="${esc(s.id2 || '')}"`;
    out += `<div class="card-row next-row ${p ? 'warn' : ''}" ${tag} role="link"><span class="row-ic">${icon(p ? 'info' : 'sparkle', 20, 1.6)}</span>
      <span class="row-txt"><span class="t">${esc(s.title)}</span><span class="d">${esc(s.reason)}</span></span>
      ${p ? '' : `<button class="link" data-act="next-later" data-id="${esc(s.id)}">Not now</button>`}</div>`;
  }
  return out ? `<div class="next-cards">${out}</div>` : '';
}

// The first time a home connects: where would you like to start. Once per home (settings.greeted).
export function greetingSheet(c) {
  const { esc, icon, data } = c;
  const x = home(c);
  const rows = [];
  if (x.fresh) rows.push(`<button class="row has-ic" data-act="next-remote" data-id="${esc(x.fresh.device_id)}"><span class="row-ic">${icon('remote', 20, 1.4)}</span><span class="row-txt"><span class="t">Set up the ${esc(data.devAreaName(x.fresh))} remote</span><span class="d">Top on, bottom off, hold to dim</span></span></button>`);
  if (x.noScenes.length) rows.push(`<button class="row has-ic" data-act="next-moods" data-id="${esc(x.noScenes[0])}"><span class="row-ic">${icon('sparkle', 20, 1.4)}</span><span class="row-txt"><span class="t">Suggest scenes for a room</span><span class="d">Bright, Relax, Dinner, Movie and Night</span></span></button>`);
  if (x.outside.length) rows.push(`<button class="row has-ic" data-go="setup/welcome"><span class="row-ic">${icon('door', 20, 1.4)}</span><span class="row-txt"><span class="t">Lights on before you get home</span><span class="d">On as you arrive, off at bedtime</span></span></button>`);
  rows.push(`<button class="row has-ic" data-act="sheet-close"><span class="row-ic">${icon('home', 20, 1.4)}</span><span class="row-txt"><span class="t">Just look around</span></span></button>`);
  const nd = data.controllable().length, np = data.remotes().length, nr = c.RT.lightRooms().length;
  return { over: 'Welcome', title: 'Your home is connected', body: `<p class="t-body muted sheet-p">${nd} ${nd === 1 ? 'light' : 'lights'} in ${nr} ${nr === 1 ? 'room' : 'rooms'}${np ? `, and ${np} ${np === 1 ? 'remote' : 'remotes'}` : ''}. Where would you like to start?</p><div class="group">${rows.join('')}</div>` };
}
export const shouldGreet = c => !!(c.S.config && !c.S.config.settings.greeted && c.S.agent.online && c.data.controllable().length);

// Settings' Ideas for your home: every suggestion this home could use, the done ones ticked.
export function ideasSheet(c) {
  const { esc, icon } = c;
  const rows = table(c).filter(s => s.can).map(s => {
    const done = !s.when;
    const tag = done ? '' : s.go ? `data-go="${esc(s.go)}"` : `data-act="${s.act}" data-id="${esc(s.id2 || '')}"`;
    return `<button class="row two ${done ? 'done' : ''}" ${tag} ${done ? 'disabled' : ''}><span class="row-txt"><span class="t">${esc(s.title)}</span><span class="d">${esc(s.reason)}</span></span>${done ? `<span class="row-tick">${icon('check', 20, 1.9)}</span>` : `<span class="row-chev">${icon('chev', 16, 1.8)}</span>`}</button>`;
  });
  return { over: 'This app', title: 'Ideas for your home', body: `<p class="t-cap muted sheet-p">What the suggestion card on Home can offer. Done ones stay here too.</p><div class="group">${rows.join('')}</div>` };
}
export function installSheet() {
  return { over: 'This app', title: 'Add to your home screen', body: `<div class="group">
    <div class="row sub"><span class="row-txt"><span class="t">iPhone (Safari)</span><span class="d">Tap the share button, then Add to Home Screen.</span></span></div>
    <div class="row sub"><span class="row-txt"><span class="t">Android (Chrome)</span><span class="d">Tap the menu, then Add to Home screen. Tap Install if it offers.</span></span></div></div>
    <p class="t-cap muted sheet-p">It then opens full-screen with its own icon, and works from anywhere, not just at home.</p>` };
}

export const nextActions = {
  'next-later'(c, el) {
    const id = el.dataset.id; const now = Date.now();
    set(`next:${id}:until`, String(now + 14 * DAY));
    let list = []; try { list = JSON.parse(get('next:notnow') || '[]'); } catch (_) { list = []; }
    list = list.filter(t => now - t < 7 * DAY); list.push(now); set('next:notnow', JSON.stringify(list));
    if (list.length >= 3) set('next:quiet:until', String(now + 30 * DAY));
    sset('next:shown', 'none');
    c.render();
  },
  'next-remote'(c, el) {
    const id = el.dataset.id; if (!id) return;
    c.closeSheet();
    if (c.REM.applyUsualLayout(id)) c.save(`${c.data.dev(id).name} set up the usual way`);
    c.go(`remote/${id}`);
  },
  'next-moods'(c, el) {
    const aid = el.dataset.id; if (!aid) return;
    c.closeSheet();
    c.H.suggestScenes(aid);
    c.save(`${c.data.areaName(aid)} has five scenes`);
    c.go(`room/${aid}`);
  },
  'next-skip'(c, el) { const sc = c.RT.byId(el.dataset.id); if (!sc) return; const msg = c.RT.skip(sc, el.dataset.date); if (msg) c.save(msg); },
  'next-unskip'(c, el) { const sc = c.RT.byId(el.dataset.id); if (sc) c.save(c.RT.unskip(sc)); },
};
