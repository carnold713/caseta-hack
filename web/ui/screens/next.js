// What now: the one suggestion Home offers at a time, the "Coming up" line, the greeting the first time a home
// connects, and Settings' Ideas for your home, which lists every suggestion with the done ones ticked. Carried over
// from the old app's web/js/next.js so none of it is lost; the file draws a card like this ("A card holding one
// row's worth") without saying what goes in it.
//
// One suggestion per session, never over a problem, and "Not now" is remembered: 14 days for that one, and after
// three in a week the card rests for 30.
import { glowHTML } from '/ui/glow.js';

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
  // One that should have turned a light on this evening offers to do it now: one named light, a deliberate button.
  if (sc && turnsOn(sc) && missedLately(c, sc)) return { title: `${sc.name} didn't run: couldn't reach the bridge.`, reason: '', go: `routine/${sc.id}`, warn: true, now: sc.id };
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

// ---------- 12 · Welcome lights, coming up (12815:169, 12815:49652) ----------
// Within the hour before a routine turns a light on, the "Coming up" line becomes a card with a ring. The ring fills
// as the moment nears, in plain white until the last ten minutes, when it crosses to copper (0.24 s standard): the
// light is close. A sunset routine's card is a small dusk, its sun sinking and fading as the minutes go. When it
// runs the ring goes (0.2 s EASE_IN), the lantern lights with its glow on the dimmer, and the card becomes a line
// for ten minutes. Skipped, the ring empties and greys. Nothing on the card turns anything on early; the ring is not
// a button.
const RING = 2 * Math.PI * 34.5;   // r 34.5: the 3 px stroke inside the 72 ring
const turnsOn = sc => (sc.actions || []).some(a => (a.type === 'level' && a.level !== 'off' && a.level !== 0) || a.type === 'preset' || a.type === 'scene');
const hmMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
// The light a routine turns on, by name, and the one to draw: "Porch light", its art and its colour.
function routineLight(c, sc) {
  const { L } = c.RT.splitOf(sc);
  const ids = c.data.targetDevices(L.length === 1 ? L[0] : L);
  const d = ids.map(id => c.data.dev(id)).find(x => x && (x.domain === 'light' || x.domain === 'switch')) || null;
  return { name: L.length ? c.data.targetName(L.length === 1 ? L[0] : L) : 'The lights', d, ids };
}
// Failed in the last six hours: late enough in the day that turning it on now is still what it was for.
function missedLately(c, sc) {
  const e = (c.S.activity || []).find(x => x.kind === 'schedule' && x.id === sc.id);
  return !!(e && e.ok === false && e.at && Date.now() - Date.parse(e.at) < 6 * 3600000);
}
// Ran within the last ten minutes, by the activity log: the card stays as a line for that long.
function ranRecently(c, sc) {
  const e = (c.S.activity || []).find(x => x.kind === 'schedule' && x.id === sc.id);
  return !!(e && e.ok !== false && e.at && Date.now() - Date.parse(e.at) < 600000);
}
// A run skipped for tonight still gets its card (greyed, with Don't skip) until its time has passed.
function skippedSoon(c) {
  const { RT } = c; const now = hmMin(RT.nowHm());
  for (const sc of RT.schedules()) {
    if (sc.enabled === false || RT.parentOf(sc) || !turnsOn(sc) || RT.skipping(sc) !== RT.today()) continue;
    const hm = sc.at.type === 'time' ? sc.at.time : RT.sunAt(sc.at.type, sc.at.offset_min);
    if (!hm) continue;
    const m = hmMin(hm) - now;
    if (m > 0 && m <= 60) return { sc, hm, min: m };
  }
  return null;
}
function arrivalCard(c, sc, { min = 0, time = '', date = '', state = 'soon' } = {}) {
  const { esc, RT, H } = c;
  const { name, d, ids } = routineLight(c, sc);
  const p = state === 'soon' ? Math.max(0, Math.min(1, 1 - min / 60)) : state === 'ran' ? 1 : 0;
  const close = state === 'soon' && min <= 10;
  let cap;
  if (state === 'ran') {
    const off = RT.pairOf(sc);
    const offHm = off ? (off.at.type === 'time' ? off.at.time : RT.sunAt(off.at.type, off.at.offset_min)) : null;
    cap = `${name} is on${offHm ? ` · off at ${RT.fmtTime(offHm)}` : ''}`;
  } else if (state === 'skipped') cap = 'Skipping tonight';
  else if (sc.only_if === 'all_off' && H.litLights().length) {
    // said plainly, so a skip is not a surprise
    const where = c.data.devAreaName(H.litLights()[0]) || H.litLights()[0].name;
    cap = `Only if the house is dark. ${where} is on.`;
  } else cap = `${name} on at ${time} · in ${min} min`;
  // the lantern's own light once it is on: the real light's level and white, tile scale
  let glow = '';
  if (d) {
    const lv = state === 'ran' ? Math.max(1, ...ids.map(id => c.data.level(id) || 0)) : 100;
    const col = (c.S.states[d.device_id] || {}).color;
    glow = glowHTML({ level: lv, kelvin: col && col.mode === 'ct' ? col.kelvin : 3000, hex: d.color && col && col.mode === 'xy' ? col.hex : undefined, ctx: 'tile', cls: `ar-glow${state === 'ran' ? '' : ' off'}` });
  }
  // a light outside is drawn as the porch lantern the file draws, whatever the switch behind it is
  const art = c.artSrc(!d || OUTSIDE.test(c.data.devAreaName(d)) ? 'light-porch-lantern' : c.deviceArt(c, d));
  const sun = sc.at && sc.at.type === 'sunset' && state === 'soon';
  const link = state === 'ran' ? '' : state === 'skipped'
    ? `<button class="link" data-act="next-unskip" data-id="${esc(sc.id)}">Don't skip</button>`
    : `<button class="link" data-act="next-skip" data-id="${esc(sc.id)}" data-date="${esc(date)}">${esc(RT.skipLabel(sc))}</button>`;
  return `<div class="card-row arrival ${state}${close ? ' close' : ''}" data-go="routine/${esc(sc.id)}" role="link" style="--p:${p.toFixed(3)}">
    <span class="dusk" aria-hidden="true"></span>
    ${sun ? '<span class="dusk-sun" aria-hidden="true"><i></i></span>' : ''}
    <span class="ar-ring" aria-hidden="true">${glow}
      <svg viewBox="0 0 72 72"><defs><linearGradient id="ar-cu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3D9C3"/><stop offset=".5" stop-color="#E6A06A"/><stop offset="1" stop-color="#D98A4E"/></linearGradient></defs>
        <circle class="trk" cx="36" cy="36" r="34.5"/><circle class="arc w" cx="36" cy="36" r="34.5" style="stroke-dasharray:${RING.toFixed(2)};stroke-dashoffset:${(RING * (1 - p)).toFixed(2)}"/><circle class="arc cu" cx="36" cy="36" r="34.5" style="stroke-dasharray:${RING.toFixed(2)};stroke-dashoffset:${(RING * (1 - p)).toFixed(2)}"/></svg>
      <img class="ar-art" src="${art}" alt=""><img class="ar-art lit" src="${art}" alt=""></span>
    <span class="ar-txt"><span class="t">${esc(sc.name)}</span><span class="d" data-xf="standard">${esc(cap)}</span>${link}</span>
  </div>`;
}

// Home's cards: what is due within the hour, then the problem or the one suggestion.
export function homeCards(c) {
  const { esc, icon, RT } = c;
  let out = '';
  const dues = RT.upcoming(3600000);
  // The soonest routine that turns a light on gets the ring; one that ran in the last ten minutes stays as a line;
  // one skipped for tonight stays, greyed, with Don't skip.
  const arrive = dues.find(x => !RT.parentOf(x.sc) && turnsOn(x.sc));
  const ran = !arrive && RT.schedules().find(sc => !RT.parentOf(sc) && turnsOn(sc) && ranRecently(c, sc));
  const skipped = !arrive && !ran ? skippedSoon(c) : null;
  if (arrive) out += arrivalCard(c, arrive.sc, { min: Math.max(1, Math.ceil((arrive.n.t - Date.now()) / 60000)), time: arrive.n.time, date: arrive.n.date });
  else if (ran) out += arrivalCard(c, ran, { state: 'ran' });
  else if (skipped) out += arrivalCard(c, skipped.sc, { state: 'skipped' });
  // anything else due within the hour is a line under it, as before
  const due = dues.find(x => !(arrive && x === arrive) && !(x.sc === (ran || (skipped && skipped.sc))));
  if (due) {
    const sc = RT.parentOf(due.sc) || due.sc;
    const off = due.sc !== sc;
    const sk = RT.skipping(sc);
    out += `<div class="card-row next-row" data-go="routine/${esc(sc.id)}" role="link"><span class="row-ic">${icon('clock', 20, 1.6)}</span>
      <span class="row-txt"><span class="t">${esc(sc.name)}${off ? (due.sc.actions.some(a => a.type === 'raise') ? ' opens' : ' off') : ''} at ${esc(due.n.time)}</span></span>
      <button class="link blue" data-act="${sk ? 'next-unskip' : 'next-skip'}" data-id="${esc(sc.id)}" data-date="${esc(due.n.date)}">${sk ? "Don't skip" : 'Skip'}</button></div>`;
  }
  const lv = RT.curveLevelNow();
  if (lv != null && lv < 100) out += `<button class="wd-home" data-go="routines/winddown">${icon('moon', 16, 1.6)}Wind-down · lights on at ${lv}%</button>`;
  const p = problem(c);
  const s = p || pick(c);
  // A suggestion is its question alone; the why is in Settings' Ideas. A problem keeps its second line: what went wrong.
  if (s) {
    const tag = s.go ? `data-go="${esc(s.go)}"` : `data-act="${s.act}" data-id="${esc(s.id2 || '')}"`;
    out += `<div class="card-row next-row ${p ? 'warn' : ''}" ${tag} role="link"><span class="row-ic">${icon(p ? 'info' : 'sparkle', 20, 1.6)}</span>
      <span class="row-txt"><span class="t">${esc(s.title)}</span>${p && s.reason ? `<span class="d">${esc(s.reason)}</span>` : ''}</span>
      ${p ? (p.now ? `<button class="link blue" data-act="next-now" data-id="${esc(p.now)}">Turn it on</button>` : '') : `<button class="link" data-act="next-later" data-id="${esc(s.id)}">Not now</button>`}</div>`;
  }
  return out ? `<div class="next-cards">${out}</div>` : '';
}

// The first time a home connects: where would you like to start. Once per home (settings.greeted).
export function greetingSheet(c) {
  const { esc, icon, data } = c;
  const x = home(c);
  const rows = [];
  if (x.fresh) rows.push(`<button class="row has-ic" data-act="next-remote" data-id="${esc(x.fresh.device_id)}"><span class="row-ic">${icon('remote', 20, 1.4)}</span><span class="row-txt"><span class="t">Set up the ${esc(data.devAreaName(x.fresh))} remote</span></span></button>`);
  if (x.noScenes.length) rows.push(`<button class="row has-ic" data-act="next-moods" data-id="${esc(x.noScenes[0])}"><span class="row-ic">${icon('sparkle', 20, 1.4)}</span><span class="row-txt"><span class="t">Suggest scenes for a room</span></span></button>`);
  if (x.outside.length) rows.push(`<button class="row has-ic" data-go="setup/welcome"><span class="row-ic">${icon('door', 20, 1.4)}</span><span class="row-txt"><span class="t">Lights on before you get home</span></span></button>`);
  rows.push(`<button class="row has-ic" data-act="sheet-close"><span class="row-ic">${icon('home', 20, 1.4)}</span><span class="row-txt"><span class="t">Just look around</span></span></button>`);
  const nd = data.controllable().length, np = data.remotes().length, nr = c.RT.lightRooms().length;
  return { over: 'Welcome', title: 'Your home is connected', body: `<p class="t-body muted sheet-p">${nd} ${nd === 1 ? 'light' : 'lights'} in ${nr} ${nr === 1 ? 'room' : 'rooms'}${np ? `, ${np} ${np === 1 ? 'remote' : 'remotes'}` : ''}.</p><div class="group">${rows.join('')}</div>` };
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
  // A missed routine, done now by hand: its lights come on, as it would have turned them on.
  'next-now'(c, el) {
    const sc = c.RT.byId(el.dataset.id); if (!sc) return;
    const on = (sc.actions || []).filter(a => a.type !== 'lower' && a.type !== 'raise');
    for (const a of on) c.run(a);
    c.toast(`${sc.name} on`);
  },
  'next-unskip'(c, el) { const sc = c.RT.byId(el.dataset.id); if (sc) c.save(c.RT.unskip(sc)); },
};
