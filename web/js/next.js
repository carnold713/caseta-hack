/* The "what now?" layer (docs/ux-progressive.md 3): the Next card on Home, the greeting after the first
   connection, and Settings › Ideas for your home. One suggestion at a time, never over a problem, and
   "Not now" is remembered. Loaded after the views, before boot.js. */
'use strict';

const NX_DAY = 86400000;
const nxGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const nxSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
const nxSess = { get: k => { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* ignore */ } } };

// The home's shape, as the suggestions read it.
const outsideRooms = () => lightRooms().filter(a => OUTSIDE_RE.test(a.name));
const bedroomLamp = () => { const beds = dimmers().filter(d => BEDROOM_RE.test(devAreaName(d))); return beds.find(d => /lamp/i.test(d.name)) || beds[0] || null; };
const usualRemotes = () => remotes().filter(d => usualLayoutTargets(d));
const freshRemote = () => usualRemotes().find(d => !remoteHasSettings(d)) || null;
const roomsWithoutScenes = () => suggestWalkRooms().filter(aid => !roomHasScenes(aid));
const hasGoodnight = () => bindings().some(b => userGestureOf(b) === 'hold' && recipeOf(b.actions) === 'goodnight');
const bedRemote = () => remotes().find(x => BEDROOM_RE.test(devAreaName(x))) || remotes()[0] || null;
const standalone = () => !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

// The table (3.2): `can` says whether it could ever apply in this home, `when` whether it applies now.
const NEXT = [
  { id: 'remote', can: () => usualRemotes().length > 0, when: () => !!freshRemote(),
    title: () => `Set up the ${esc(devAreaName(freshRemote() || usualRemotes()[0]))} remote?`,
    reason: () => `Top turns ${esc(devAreaName(freshRemote() || usualRemotes()[0]))} on, bottom off, hold to dim. Ten seconds.`,
    go: () => { const d = freshRemote(); if (!d) return; goRemoteDetail(d.device_id); } },
  { id: 'sort', can: () => dimmers().length > 0, when: () => untaggedLights().length > 0,
    title: () => 'Want your lights sorted?', reason: () => 'Say what kind of lamp each one is, and Relax, Dinner and Movie know what to dim.',
    go: () => openSortWalk() },
  { id: 'moods', can: () => suggestWalkRooms().length > 0, when: () => roomsWithoutScenes().length > 0,
    title: () => `Suggest scenes for the ${esc(areaName(roomsWithoutScenes()[0] || suggestWalkRooms()[0]))}?`, reason: () => 'Bright, Relax, Dinner, Movie and Night, made from what each light is.',
    go: () => { const walk = roomsWithoutScenes(); if (walk.length) openRolesSheet(walk[0], { walk }); } },
  { id: 'welcome', can: () => outsideRooms().length > 0, when: () => !schedules().some(sc => sc.kind === 'welcome'),
    title: () => 'Lights on before you get home?', reason: () => `${esc(outsideRooms()[0].name)} comes on 20 minutes before sunset and goes off at bedtime.`,
    go: () => openWelcomeSetup() },
  { id: 'wakeup', can: () => !!bedroomLamp(), when: () => !schedules().some(sc => sc.kind === 'wakeup'),
    title: () => 'Wake up to a slow light?', reason: () => `The ${esc(bedroomLamp().name)} rises from dark over 25 minutes.`,
    go: () => openWakeupSetup() },
  { id: 'goodnight', can: () => remotes().length > 0, when: () => !hasGoodnight(),
    title: () => 'One button for goodnight?', reason: () => `Hold Off on the ${esc(bedRemote().name)}: everything off, a dim path to bed.`,
    go: () => openButtonsSetup() },
  { id: 'install', can: () => true, when: () => !standalone(),
    title: () => 'Add this app to your home screen?', reason: () => 'It opens full-screen, like a real app.',
    go: () => openInstallHelp() },
];
const nextById = id => NEXT.find(x => x.id === id);
const nextSnoozed = id => Number(nxGet(`next:${id}:until`) || 0) > Date.now();
const nextQuiet = () => Number(nxGet('next:quiet:until') || 0) > Date.now();
const nextApplies = s => s.can() && s.when() && !nextSnoozed(s.id);
// One per session: the first eligible suggestion when the app opens, kept for as long as it still applies.
function nextPick() {
  if (nextQuiet()) return null;
  const shown = nxSess.get('next:shown');
  if (shown === 'none') return null;
  if (shown) { const s = nextById(shown); return s && nextApplies(s) ? s : null; }
  const s = NEXT.find(nextApplies);
  if (s) nxSess.set('next:shown', s.id);
  return s || null;
}
// Never over a problem: a broken button or a failed automation run takes the slot.
function problemCardHTML() {
  const broken = bindings().find(bindingBroken);
  if (broken) { const d = dev(broken.device_id); return `<div class="card pad0 list nextrow"><button class="item" data-act="next-remote" data-id="${esc(broken.device_id)}"><div class="grow"><span class="cap">Needs attention</span><div class="t">${esc(d ? d.name : 'A remote')} points at something that is gone</div><div class="d">Pick again.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`; }
  const failed = topLevel().find(failedLast);
  if (failed) return `<div class="card pad0 list nextrow"><button class="item" data-act="nav" data-view="automations"><div class="grow"><span class="cap">Needs attention</span><div class="t">${esc(failed.name)} didn't run</div><div class="d">Couldn't reach the bridge</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  return '';
}
// The Next row: one 56px list row, last on Home, never above the rooms.
function nextCardHTML() {
  if (!S.config) return '';
  const p = problemCardHTML(); if (p) return p;
  const s = nextPick(); if (!s) return '';
  return `<div class="card pad0 list nextrow" id="nextcard"><div class="item" role="button" tabindex="0" data-act="next-go" data-id="${s.id}"><div class="grow"><span class="cap">Next</span><div class="t">${s.title()}</div><div class="d">${s.reason()}</div></div><button class="btn ghost" data-act="next-later" data-id="${s.id}">Not now</button><span class="chev">${ICON('chev', 'sm')}</span></div></div>`;
}
// "Not now": gone for the rest of the session, remembered 14 days; three in a week and the card rests for 30 days.
function nextLater(id) {
  const now = Date.now();
  nxSet(`next:${id}:until`, String(now + 14 * NX_DAY));
  let list = []; try { list = JSON.parse(nxGet('next:notnow') || '[]'); } catch (_) { list = []; }
  list = list.filter(t => now - t < 7 * NX_DAY); list.push(now); nxSet('next:notnow', JSON.stringify(list));
  if (list.length >= 3) nxSet('next:quiet:until', String(now + 30 * NX_DAY));
  nxSess.set('next:shown', 'none');
  const el = $('#nextcard'); if (el) el.remove();
}
function nextGo(id) { const s = nextById(id); if (s) s.go(); }

// ---------- the greeting (3.1): once per home, after "Connected to your home" ----------
function openGreeting() {
  if (!S.config || S.config.settings.greeted || !S.agent.online || !controllable().length || sheet.isOpen()) return;
  const nd = controllable().length, np = remotes().length, nr = lightRooms().length;
  const row = (act, id, icon, t, d) => `<button class="item" data-act="${act}" ${id ? `data-id="${esc(id)}"` : ''}>${ICON(icon)}<div class="grow"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><span class="chev">${ICON('chev', 'sm')}</span></button>`;
  const rows = [];
  const r = freshRemote(); if (r) rows.push(row('greet-remote', r.device_id, 'remote', `Set up the ${esc(devAreaName(r))} remote`, 'Top on, bottom off, hold to dim'));
  if (roomsWithoutScenes().length) rows.push(row('greet-moods', '', 'sofa', 'Suggest scenes for a room', 'Bright, Relax, Dinner, Movie and Night'));
  if (outsideRooms().length && !schedules().some(sc => sc.kind === 'welcome')) rows.push(row('greet-welcome', '', 'moon', 'Lights on before you get home', 'On before sunset, off at bedtime'));
  rows.push(row('sheet-close', '', 'house', 'Just look around', ''));
  sheet.open('Your home is connected', `<div class="card pad0 list">${rows.join('')}</div>`, { detent: 'compact', sub: `${plural(nd, 'light')} in ${plural(nr, 'room')}${np ? `, and ${plural(np, 'remote')}` : ''}. Where would you like to start?` });
  sheet.onClose = () => greetDone(true);
}
// The flag is set when the sheet closes, whichever row was tapped; an action that saves on its own carries it.
function greetDone(saveNow) {
  sheet.onClose = null;
  if (!S.config || S.config.settings.greeted) return;
  S.config.settings.greeted = true;
  if (saveNow) save({ quiet: true, render: false });
}

// ---------- Ideas for your home (3.4): every suggestion, done ones ticked ----------
function openIdeas() {
  const rows = NEXT.filter(s => s.can()).map(s => { const done = !s.when(); return `<button class="item ${done ? 'done' : ''}" ${done ? '' : `data-act="next-go" data-id="${s.id}"`}><div class="grow"><div class="t">${s.title()}</div><div class="d">${s.reason()}</div></div>${done ? ICON('check', 'tick') : `<span class="chev">${ICON('chev', 'sm')}</span>`}</button>`; });
  sheet.open('Ideas for your home', `<div class="card pad0 list">${rows.join('')}</div>`, { detent: 'large', sub: 'The things the Next card can suggest. Done ones stay here too.' });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'next-go': if (sheet.isOpen() && el.closest('#sheet-root')) sheet.close(); nextGo(d.id); break;
    case 'next-later': nextLater(d.id); break;
    case 'next-remote': goRemoteDetail(d.id); break;
    case 'ideas': openIdeas(); break;
    case 'greet-remote': greetDone(false); goRemoteDetail(d.id); applyUsualLayout(d.id); break;
    case 'greet-moods': greetDone(true); { const walk = roomsWithoutScenes(); if (walk.length) openRolesSheet(walk[0], { walk }); else sheet.close(); } break;
    case 'greet-welcome': greetDone(true); openWelcomeSetup(); break;
  }
});
