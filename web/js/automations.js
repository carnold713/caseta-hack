/* Automations (docs/ux-flows.md): the fifth tab, the editor and the When sheet, the three guided setups,
   the evening wind-down card, room roles and moods, and the Home "Coming up" block.
   An automation is a config.schedules entry; "-off" pairs (4.3) are a second entry folded into the first.
   Loaded after light.js and remotes.js, before boot.js. Same delegated data-act pattern as the other files. */
'use strict';

// ---------- time, in the home's zone ----------
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const pad2 = n => String(n).padStart(2, '0');
function phoneTZ() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (_) { return null; } }
function homeTZ() { const tz = S.config && S.config.settings.timezone; if (!tz) return undefined; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (_) { return undefined; } }
// Calendar date, clock time and weekday of an instant, as the home's clock reads them.
function zparts(d) {
  const o = {};
  try { for (const p of new Intl.DateTimeFormat('en-US', { timeZone: homeTZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' }).formatToParts(d)) o[p.type] = p.value; }
  catch (_) { return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, weekday: DAY_LONG[d.getDay()] }; }
  return { date: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour === '24' ? '00' : o.hour}:${o.minute}`, weekday: o.weekday };
}
const dayNum = date => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000;
const weekdayOf = date => new Date(date + 'T12:00:00Z').getUTCDay();
const todayDate = () => zparts(new Date()).date;
const addDays = (date, n) => { const d = new Date(dayNum(date) * 86400000 + n * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
// "today", "tomorrow", "Monday"
function dayRel(date) { const diff = dayNum(date) - dayNum(todayDate()); if (diff === 0) return 'today'; if (diff === 1) return 'tomorrow'; return DAY_LONG[weekdayOf(date)]; }
function hmAdd(hm, mins) { const [h, m] = hm.split(':').map(Number); const t = ((h * 60 + m + mins) % 1440 + 1440) % 1440; return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`; }
// A run from an ISO instant the connector sent: null when there is none or it does not parse (never "Invalid Date").
function runInfo(iso) {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d.getTime())) return null;
  const z = zparts(d);
  return { d, date: z.date, hm: z.hm, rel: dayRel(z.date), time: fmtTime(z.hm), past: d.getTime() < Date.now() - 60000 };
}
// Today's sunrise or sunset plus an offset, as HH:MM, or null before the connector has said.
function sunAt(type, offsetMin = 0) {
  const iso = S.sun && S.sun[type]; if (!iso) return null;
  const d = new Date(iso); if (isNaN(d.getTime())) return null;
  return zparts(new Date(d.getTime() + (offsetMin || 0) * 60000)).hm;
}

// ---------- schedules: pairs, rules, names ----------
const schedules = () => (S.config && S.config.schedules) || [];
const scById = id => schedules().find(x => x.id === id);
const isPairId = id => /-off$/.test(id) && !!scById(id.slice(0, -4));
const pairOf = sc => (sc ? scById(sc.id + '-off') : null) || null;
const parentOf = sc => (sc && isPairId(sc.id) ? scById(sc.id.slice(0, -4)) : null);
const topLevel = () => schedules().filter(sc => !isPairId(sc.id));
const isShadeT = t => t === 'h:shades' || (typeof t === 'string' && t.startsWith('d:') && (dev(t.slice(2)) || {}).domain === 'cover');
function splitT(list) { const L = [], Sh = []; for (const t of list) (isShadeT(t) ? Sh : L).push(t); return { L, Sh }; }
function fansIn(L) { if (L.includes('h:fans')) return ['h:fans']; return targetDevices(L).filter(id => (dev(id) || {}).domain === 'fan').map(id => `d:${id}`); }
const hasShades = () => controllable().some(d => d.domain === 'cover');
const hasFans = () => controllable().some(d => d.domain === 'fan');
const lightRooms = () => areas().filter(a => controllable().some(d => devArea(d) === a.id && d.domain !== 'cover'));
const dimmers = () => controllable().filter(d => d.domain === 'light');

function daysText(days) {
  const d = [...new Set(days || ALL_DAYS)].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '0,6') return 'Weekends';
  if (d.length === 6) return `Every day but ${DAY_LONG[ALL_DAYS.find(i => !d.includes(i))]}`;
  return [1, 2, 3, 4, 5, 6, 0].filter(i => d.includes(i)).map(i => DAY_SHORT[i]).join(', ');
}
// "at 6:30am", "at sunset", "20 minutes before sunset"
function whenClause(at, short = false) {
  if (!at) return '';
  if (at.type === 'time') return `at ${fmtTime(at.time)}`;
  const off = at.offset_min || 0;
  if (!off) return short && at.type === 'sunset' ? 'at dusk' : `at ${at.type}`;
  return `${Math.abs(off)} ${short ? 'min' : 'minutes'} ${off < 0 ? 'before' : 'after'} ${at.type}`;
}
function ruleLine(sc, off) {
  if (!sc.at) return '';
  if (off && off.at) { const shades = off.actions.some(a => a.type === 'raise'); return `${shades ? 'Closed' : 'On'} ${whenClause(sc.at, true)}, ${shades ? 'open' : 'off'} ${whenClause(off.at, true)} · ${daysText(sc.days)}`; }
  const c = whenClause(sc.at);
  return c.startsWith('at') ? `${daysText(sc.days)} ${c}` : `${daysText(sc.days)}, ${c}`;
}
// "At sunset · 7:12pm today", "20 minutes before sunset · 6:52pm today", "At 6:30am"
function whenValue(at) {
  if (!at) return '';
  if (at.type === 'time') return `At ${fmtTime(at.time)}`;
  const hm = S.config.settings.location ? sunAt(at.type, at.offset_min) : null;
  return `${cap(whenClause(at))}${hm ? ` · ${fmtTime(hm)} today` : ''}`;
}
function autoSentence(sc) { return `${describe(sc.actions)} ${whenClause(sc.at)}`.trim(); }

// The recipe list of the editor (4.1, item 3). L: the lights picked, Sh: the shades picked.
const AUTO_RECIPES = [
  { id: 'on', t: 'Turn on', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 'on' }] },
  { id: 'off', t: 'Turn off', mk: L => [{ type: 'level', target: packTarget(L), level: 'off' }] },
  { id: 'full', t: 'Full brightness', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 100 }] },
  { id: 'half', t: 'Half brightness', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 50 }] },
  { id: 'night', t: 'Nightlight', d: 'Very dim, 10%', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 10, fade: 1 }] },
  { id: 'rise', t: 'Rise slowly', d: 'From dark to 50% over 25 minutes', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 50, fade: 1500 }] },
  { id: 'scene', t: 'Run a scene…', on: true, pick: true },
  { id: 'shades_close', t: 'Close the shades', shades: true, open: true, mk: (L, Sh) => [{ type: 'lower', target: packTarget(Sh) }] },
  { id: 'shades_open', t: 'Open the shades', shades: true, mk: (L, Sh) => [{ type: 'raise', target: packTarget(Sh) }] },
  { id: 'fan_off', t: 'Turn the fan off', fans: true, mk: L => [{ type: 'fan', target: packTarget(fansIn(L)), speed: 'Off' }] },
];
function recipeApplies(r, L, Sh) { if (r.shades) return Sh.length > 0; if (r.fans) return fansIn(L).length > 0; return L.length > 0; }
function autoRecipeOf(sc, L, Sh) {
  const acts = sc.actions || [];
  for (const r of AUTO_RECIPES) if (r.mk && recipeApplies(r, L, Sh) && JSON.stringify(r.mk(L, Sh)) === JSON.stringify(acts)) return r.id;
  if (acts.length === 1 && (acts[0].type === 'preset' || acts[0].type === 'scene')) return 'scene';
  return 'custom';
}
function leavesOn(acts) { return (acts || []).some(a => (a.type === 'level' && a.level !== 'off' && a.level !== 0) || a.type === 'preset' || a.type === 'scene' || a.type === 'lower'); }
function targetsOf(sc) { return [...new Set((sc.actions || []).flatMap(a => tlist(a.target)))].filter(targetExists); }
// "Porch on", "Everything off", "Bedroom lamp rises"; with an off pair the row already says "On at dusk, off at 11:00pm", so just "Porch".
function autoName(sc, L, Sh, paired = false) {
  const rid = autoRecipeOf(sc, L, Sh); const a = sc.actions[0] || {};
  const tn = t => cap(targetName(packTarget(t)));
  const n = ({ on: () => paired ? tn(L) : `${tn(L)} on`, off: () => `${tn(L)} off`, full: () => `${tn(L)} full brightness`, half: () => `${tn(L)} half brightness`, night: () => `${tn(L)} nightlight`, rise: () => `${tn(L)} rises`,
    scene: () => cap(targetName(a.type === 'preset' ? 'p:' + a.preset_id : 's:' + a.scene_id)), shades_close: () => `${Sh.includes('h:shades') ? 'Shades' : tn(Sh)} close`, shades_open: () => `${Sh.includes('h:shades') ? 'Shades' : tn(Sh)} open`, fan_off: () => 'Fan off' }[rid] || (() => tn(L.length ? L : Sh)))();
  return n.slice(0, 60);
}
function makePair(sc, at, L, Sh) {
  const shades = autoRecipeOf(sc, L, Sh) === 'shades_close';
  return { id: sc.id + '-off', name: sc.name, enabled: sc.enabled !== false, at, days: [...sc.days], actions: shades ? [{ type: 'raise', target: packTarget(Sh) }] : [{ type: 'level', target: packTarget(L.length ? L : Sh), level: 'off', fade: 1 }], only_if: null, skip_until: sc.skip_until || null, kind: sc.kind || null };
}
// The next run: what the connector said, unless a skip covers it, then predicted from the rule and today's sun.
function predictNextRun(sc) {
  const now = zparts(new Date());
  for (let i = 0; i < 8; i++) {
    const date = addDays(now.date, i);
    if (!(sc.days || ALL_DAYS).includes(weekdayOf(date))) continue;
    if (sc.skip_until && date <= sc.skip_until) continue;
    const hm = sc.at.type === 'time' ? sc.at.time : sunAt(sc.at.type, sc.at.offset_min);
    if (!hm) return null;
    if (i === 0 && hm <= now.hm) continue;
    return { date, hm, rel: dayRel(date), time: fmtTime(hm), past: false, predicted: true };
  }
  return null;
}
function nextRunOf(sc) {
  if (!sc || !sc.at || sc.enabled === false) return null;
  let r = runInfo((S.nextRuns || {})[sc.id]);
  if (r && sc.skip_until && r.date <= sc.skip_until) r = null;
  return r || predictNextRun(sc);
}
function skipWord(date) { const rel = dayRel(date); return rel === 'today' ? 'tonight' : rel; }
function skipping(sc) { return sc.skip_until && sc.skip_until >= todayDate() ? sc.skip_until : null; }
function failedLast(sc) { const e = S.activity.find(x => x.kind === 'schedule' && x.id === sc.id); return !!(e && e.ok === false); }
function skipLabel(sc) {
  const sk = skipping(sc); if (sk) return `Skipping ${skipWord(sk)} · Don't skip`;
  const n = nextRunOf(sc); return `Skip ${n ? skipWord(n.date) : 'next time'}`;
}
function nextLineHTML(sc) {
  if (sc.enabled === false) return 'Paused';
  if (sc.at.type !== 'time' && !S.config.settings.location) return `<span class="odot"></span>Needs your home's location`;
  if (failedLast(sc)) return `<span class="odot"></span>Didn't run last time`;
  const n = nextRunOf(sc); if (!n || n.past) return '';
  const sk = skipping(sc);
  return sk ? `Skipping ${skipWord(sk)} · then ${n.rel} at ${n.time}` : `Next: ${n.rel} at ${n.time}`;
}
// Keep a pair in step with its parent: name, days, on or off, skip.
function syncPair(sc) {
  const off = pairOf(sc); if (!off) return;
  off.name = sc.name; off.days = [...sc.days]; off.enabled = sc.enabled !== false; off.skip_until = sc.skip_until || null; off.kind = sc.kind || null;
}
function setEnabled(sc, on) {
  sc.enabled = on; syncPair(sc);
  save({ msg: on ? `${sc.name} back on` : `${sc.name} paused`, render: S.view === 'automations' || S.view === 'home' });
}
// Skip one run: the skip date is that run's date. `date` comes from the row that was tapped (Home) or the next run.
function doSkip(sc, date) {
  const n = nextRunOf(sc); const d = date || (n && n.date); if (!d) { toast('Nothing to skip yet'); return; }
  sc.skip_until = d; syncPair(sc);
  const after = nextRunOf(sc);
  const back = after ? (after.rel === 'tomorrow' || after.rel === 'today' ? `Back ${after.rel} at ${after.time}.` : `Back on ${after.rel} at ${after.time}.`) : '';
  save({ msg: `${sc.name} will skip ${skipWord(d)}. ${back}`.trim(), render: S.view === 'automations' || S.view === 'home' });
}
function unSkip(sc) { sc.skip_until = null; syncPair(sc); save({ msg: `${sc.name} is back on`, render: S.view === 'automations' || S.view === 'home' }); }

// ---------- the tab ----------
VIEWS.automations = {
  top() { return `<div class="t1">Automations</div>${statusCircle()}`; },
  body() {
    if (!controllable().length && connLost()) return setupEmpty();
    let h = `<div class="spacer"></div>`;
    if (connLost()) h += `<div class="tip"><div class="grow"><span class="cap">Not connected</span><div class="t">Not connected right now</div><div class="d">Your home keeps running these on its own. This list may be a little behind.</div></div></div><div class="spacer"></div>`;
    h += nextCaptionHTML();
    h += tzTipHTML();
    const list = topLevel();
    // the grouped-list caps headers the rest of the app uses (docs/ia-v5.md 3, 7)
    if (!list.length) return h + windDownRowHTML() + emptyStateHTML();
    h += `<div class="gh">Your automations</div><div class="card pad0 list" id="auto-list">${list.map(autoRowHTML).join('')}</div>`;
    h += `<div class="gh">Evening</div>` + windDownRowHTML();
    h += `<div class="spacer"></div><div class="card pad0 list"><button class="item" data-act="au-new"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">New automation</div></div></button></div>`;
    return h;
  },
};
function autoRowHTML(sc) {
  const off = pairOf(sc); const glyph = sc.at.type === 'sunrise' ? 'sun' : sc.at.type === 'sunset' ? 'moon' : 'clock';
  // what a swipe on this row offers (js/rowswipe.js): skip the next run, or delete. Both have a twin in the editor.
  const n = nextRunOf(sc); const sk = skipping(sc);
  const sw = `data-auswipe="${esc(sc.id)}" data-auswipe-date="${n ? esc(n.date) : ''}" data-auswipe-skipping="${sk ? 1 : 0}"`;
  return `<div class="item auto ${sc.enabled === false ? 'paused' : ''}" ${sw}><button class="auto-main" data-act="au-open" data-id="${esc(sc.id)}"><div class="ic">${ICON(glyph, 'sm')}</div><div class="grow"><div class="t">${esc(sc.name || 'Automation')}</div><div class="d">${esc(ruleLine(sc, off))}</div><div class="d" data-next="${esc(sc.id)}">${nextLineHTML(sc)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button><button class="sw ${sc.enabled === false ? '' : 'on'}" data-act="au-toggle" data-id="${esc(sc.id)}" aria-label="${esc(sc.name || 'Automation')} on or off"></button></div>`;
}
function guidedRowsHTML(cap) {
  const rows = [
    ['gs-welcome', 'moon', 'Welcome lights', 'On before you get home, off at bedtime'],
    dimmers().length ? ['gs-wakeup', 'bed', 'Wake-up light', 'A lamp rises slowly before your alarm'] : null,
    remotes().length ? ['gs-buttons', 'remote', 'Goodnight and Leaving buttons', 'One hold shuts the house down'] : null,
    ['ae-new', 'plus', 'Something else', 'Any lights, any time'],
  ].filter(Boolean);
  return `<div class="card pad0 list">${cap ? `<div class="lcap">${esc(cap)}</div>` : ''}${rows.map(([act, ic, t, d]) => `<button class="item" data-act="${act}">${ICON(ic)}<div class="grow"><div class="t">${t}</div><div class="d">${d}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}</div>`;
}
// Nothing set up yet: one card, its caption doing the work the separate "Get started" card used to (design 32).
function emptyStateHTML() {
  return `<div class="h2">What should your home do on its own?</div>${guidedRowsHTML('Get started · each takes about a minute')}`;
}
function tzTipHTML() {
  const home = S.config.settings.timezone, phone = phoneTZ();
  if (!home || !phone || home === phone) return '';
  try { if (localStorage.getItem('tzKeep') === `${home}|${phone}`) return ''; } catch (_) { /* ignore */ }
  return `<div class="tip top"><div class="grow"><span class="cap">Time zone</span><div class="t">Your phone is in a different time zone from your home. Which clock should the lights follow?</div><div class="row" style="margin-top:12px"><button class="btn sm" data-act="tz-keep">Keep my home's</button><button class="btn sm" data-act="tz-phone">Use this phone's</button></div></div></div><div class="spacer"></div>`;
}
// Painted in place after every 'sun' message and after a run is reported: the rows' next lines, the Home block, the captions.
function paintSun() {
  document.querySelectorAll('[data-next]').forEach(el => { const sc = scById(el.dataset.next); if (sc) el.innerHTML = nextLineHTML(sc); });
  const cu = $('#comingup'); if (cu) cu.innerHTML = comingUpHTML();
  const due = $('#ln-due'); if (due) due.innerHTML = dueLineHTML();
  const nc = $('#next-cap'); if (nc) nc.outerHTML = nextCaptionHTML();
  const wc = $('#wd-cap'); if (wc) wc.innerHTML = windDownCaption();
  const wh = $('#wd-home'); if (wh) wh.innerHTML = windDownCaptionHTML();
  const wt = $('#wd-today'); if (wt) wt.textContent = todaySentence();
  if (WH && SHEET_KEY === 'when') renderWhenSheet();
  if (WALK.cur && SHEET_KEY === WALK.cur.key) walkRender(WALK.cur);
  if (AE && SHEET_KEY === 'editor') renderEditor();
}

// ---------- what is coming up: one line on Home when something is due within the hour, one caption on the Automations tab ----------
function upcoming(withinMs) {
  return schedules().filter(sc => sc.enabled !== false).map(sc => ({ sc, n: nextRunOf(sc) })).filter(x => x.n && !x.n.past && x.n.d && x.n.d.getTime() - Date.now() < withinMs).sort((a, b) => a.n.d - b.n.d);
}
function upcomingLabel({ sc, n }) {
  const label = `${sc.name}${parentOf(sc) ? (sc.actions.some(a => a.type === 'raise') ? ' open' : ' off') : ''}`;
  const when = n.rel === 'today' ? n.time : n.rel === 'tomorrow' ? `tomorrow ${n.time}` : `${DAY_SHORT[weekdayOf(n.date)]} ${n.time}`;
  return `${label} at ${when}`;
}
function dueLineHTML() {
  const x = upcoming(3600000)[0]; if (!x) return '';
  const parent = parentOf(x.sc) || x.sc; const sk = skipping(parent);
  return `<p class="ln-due"><span>${esc(upcomingLabel(x))}</span><span>·</span><button class="link" data-act="${sk ? 'au-unskip' : 'au-skip'}" data-id="${esc(parent.id)}" data-date="${x.n.date}">${sk ? "Don't skip" : 'Skip'}</button></p>`;
}
function nextCaptionHTML() {
  const x = upcoming(7 * 86400000)[0]; if (!x) return '<span id="next-cap"></span>';
  return `<p class="d" id="next-cap" style="margin:-8px 0 16px">Next: ${esc(upcomingLabel(x))}</p>`;
}
function comingUpHTML() {
  const rows = schedules().filter(sc => sc.enabled !== false).map(sc => ({ sc, n: nextRunOf(sc) })).filter(x => x.n && !x.n.past && x.n.d && x.n.d.getTime() - Date.now() < 24 * 3600000)
    .sort((a, b) => a.n.d - b.n.d).slice(0, 2);
  if (!rows.length) return '';
  const row = ({ sc, n }) => {
    const parent = parentOf(sc) || sc; const sk = skipping(parent);
    const label = `${sc.name}${parentOf(sc) ? (sc.actions.some(a => a.type === 'raise') ? ' open' : ' off') : ''}`;
    const when = n.rel === 'today' ? n.time : n.rel === 'tomorrow' ? `tomorrow ${n.time}` : `${DAY_SHORT[weekdayOf(n.date)]} ${n.time}`;
    return `<div class="item"><div class="grow"><div class="t">${esc(label)}</div><div class="d">${sk ? `Skipping · then ${esc(when)}` : esc(when)}</div></div><button class="btn sm" data-act="${sk ? 'au-unskip' : 'au-skip'}" data-id="${esc(parent.id)}" data-date="${n.date}">${sk ? "Don't skip" : 'Skip'}</button></div>`;
  };
  return `<div class="gh">Coming up<a class="link" data-act="nav" data-view="automations" href="#automations">See all</a></div><div class="card pad0 list">${rows.map(row).join('')}</div>`;
}

// ---------- New automation ---------- (showSheet and SHEET_KEY live in core.js)
function openNewAutomation() {
  showSheet('new', 'What would you like to set up?', `${guidedRowsHTML()}<p class="d" style="margin:16px 0 0">Have timers in the Lutron app? Keep them in one place, here or there, so they don't fight.</p>`, { detent: 'medium', sub: 'Three ready-made ones, or start from scratch.' });
}

// ---------- the editor (4.1) ----------
let AE = null; // { id, draft, draftOff, isNew, L, Sh, customName, dayWarn }
const aeSc = () => (AE ? scById(AE.id) || AE.draft : null);
const aeInConfig = () => !!(AE && scById(AE.id));
const aeOff = () => (AE ? pairOf(aeSc()) || AE.draftOff : null);
// An existing automation opens the editor; a new one is made in a walk (2.14) and only reaches the editor once it exists.
function openEditor(id) {
  if (!(id && scById(id))) { openNewAutoWalk(); return; }
  sheet.onClose = () => { AE = null; WH = null; S.advCustom = null; SHEET_KEY = null; };
  const sc = scById(id); const { L, Sh } = splitT(targetsOf(sc));
  if (!L.length && !Sh.length && lightRooms()[0]) L.push(`a:${lightRooms()[0].id}`);
  AE = { id, draft: null, draftOff: null, isNew: false, L, Sh, customName: sc.name !== autoName(sc, L, Sh, !!pairOf(sc)), dayWarn: false, exp: {} };
  renderEditor();
}
// Save when the automation exists (it has a time); until then the sheet holds it in memory.
function aeSave(msg) {
  const sc = aeSc(); if (!sc) return;
  if (!AE.customName) sc.name = autoName(sc, AE.L, AE.Sh, !!aeOff());
  syncPair(sc); if (AE.draftOff) { AE.draftOff.name = sc.name; AE.draftOff.days = [...sc.days]; }
  if (sc.at) {
    if (!aeInConfig()) { S.config.schedules.push(AE.draft); if (AE.draftOff) S.config.schedules.push(AE.draftOff); AE.draft = null; AE.draftOff = null; }
    save({ msg: msg || autoSentence(sc), render: S.view === 'automations' || S.view === 'home' });
  }
  renderEditor();
}
function aeSaveSoon() { if (aeInConfig()) saveSoon(); }
function aeSetTargets(L, Sh) {
  const sc = aeSc(); const rid = autoRecipeOf(sc, AE.L, AE.Sh); const r = AUTO_RECIPES.find(x => x.id === rid);
  AE.L = L; AE.Sh = Sh;
  if (r && r.mk && recipeApplies(r, L, Sh)) sc.actions = r.mk(L, Sh);
  else if (r && r.mk) sc.actions = AUTO_RECIPES[0].mk(L.length ? L : Sh, Sh);
  else for (const a of sc.actions) { if (!a.target || a.target === 'h:all') continue; a.target = packTarget(a.type === 'raise' || a.type === 'lower' ? (Sh.length ? Sh : L) : (L.length ? L : Sh)); }
  const off = aeOff(); if (off) off.actions = makePair(sc, off.at, L, Sh).actions;
  aeSave();
}
function aeToggleTarget(t) {
  const all = [...AE.L, ...AE.Sh]; const i = all.indexOf(t);
  let next; if (i >= 0) { if (all.length === 1) return; next = all.filter(x => x !== t); } else next = normalizeTargets([...all, t], t);
  const { L, Sh } = splitT(next); aeSetTargets(L, Sh);
}
function aeApplyRecipe(rid) {
  const sc = aeSc(); const r = AUTO_RECIPES.find(x => x.id === rid); if (!r) return;
  if (r.pick) { openAutoScenePicker(); return; }
  sc.actions = r.mk(AE.L, AE.Sh);
  const off = aeOff();
  if (off && !(r.on || r.open)) { if (aeInConfig()) S.config.schedules = schedules().filter(x => x.id !== off.id); AE.draftOff = null; }
  else if (off) off.actions = makePair(sc, off.at, AE.L, AE.Sh).actions;
  aeSave();
}
function openAutoScenePicker() {
  const items = [...presets().map(p => ({ a: { type: 'preset', preset_id: p.id }, n: p.name, s: p.mood ? 'Room mood' : 'Your scene' })), ...lutronScenes().map(s => ({ a: { type: 'scene', scene_id: s.scene_id }, n: s.name, s: 'From the Lutron app' }))];
  AE.scenePick = items;
  const body = items.length ? `<div class="card pad0 list">${items.map((it, i) => `<button class="item" data-act="ae-scene" data-i="${i}"><div class="ic">${ICON('scene', 'sm')}</div><div class="grow"><div class="t">${esc(it.n)}</div><div class="d">${it.s}</div></div></button>`).join('')}</div>` : `<div class="tip"><div class="grow"><span class="cap">Scenes</span><div class="t">No scenes yet</div><div class="d">Make one on the Scenes tab first.</div></div></div>`;
  showSheet('ae-scene', 'Which scene?', body, { detent: 'medium', back: true, onBack: renderEditor });
}
function daysHTML(days, act, warn) {
  const quick = [['all', 'Every day', ALL_DAYS], ['weekdays', 'Weekdays', [1, 2, 3, 4, 5]], ['weekends', 'Weekends', [0, 6]]];
  return `<div class="chips days">${ALL_DAYS.map(i => `<button class="chip day ${days.includes(i) ? 'sel' : ''}" data-act="${act}-day" data-d="${i}" aria-label="${DAY_LONG[i]}" aria-pressed="${days.includes(i)}">${DAY_LETTER[i]}</button>`).join('')}</div>
  <div class="chips" style="margin-top:8px">${quick.map(([v, l, set]) => `<button class="chip sm ${set.join() === [...days].sort().join() ? 'sel' : ''}" data-act="${act}-days" data-v="${v}">${l}</button>`).join('')}</div>
  <p class="d" style="margin:8px 0 0">${warn ? 'Pick at least one day' : daysText(days)}</p>`;
}
function setDay(days, i, warnHost) { const j = days.indexOf(i); if (j >= 0) { if (days.length === 1) { warnHost.dayWarn = true; return; } days.splice(j, 1); } else days.push(i); warnHost.dayWarn = false; days.sort(); }
const QUICK_DAYS = { all: ALL_DAYS, weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };
// The chip row of lights an automation can pick from: the picked ones, the rooms, everything, all shades, and "Specific lights…".
function targetChipsHTML(sel, act, moreAct) {
  const chipsT = [...sel, ...lightRooms().map(a => `a:${a.id}`), 'h:all', ...(hasShades() ? ['h:shades'] : [])].filter((v, i, arr) => arr.indexOf(v) === i && targetExists(v));
  const chipName = t => t === 'h:shades' ? 'All shades' : cap(targetName(t));
  return `<div class="chips scroll">${chipsT.map(t => `<button class="chip ${sel.includes(t) ? 'sel' : ''}" data-act="${act}" data-t="${esc(t)}">${sel.includes(t) ? ICON('check', 'sm') : ''}${esc(chipName(t))}</button>`).join('')}<button class="chip" data-act="${moreAct}">${ICON('dots', 'sm')}Specific lights…</button></div>`;
}
function recipeRowsHTML(L, Sh, rid, act) {
  const chk = `<span class="chk">${ICON('check', 'sm')}</span>`;
  return AUTO_RECIPES.filter(x => recipeApplies(x, L, Sh)).map(x => `<button class="item recipe ${rid === x.id ? 'sel' : ''}" data-act="${act}" data-r="${x.id}"><div class="grow"><div class="t">${x.t}</div>${x.d ? `<div class="d">${x.d}</div>` : ''}</div>${rid === x.id ? chk : ''}</button>`).join('');
}
function renderEditor() {
  const sc = aeSc(); if (!sc) return;
  const off = aeOff(); const { L, Sh } = AE; const inCfg = aeInConfig();
  const rid = autoRecipeOf(sc, L, Sh); const r = AUTO_RECIPES.find(x => x.id === rid);
  const title = esc(sc.name);
  const sub = esc(ruleLine(sc, off));
  const showOff = r ? (r.on || r.open) : leavesOn(sc.actions);
  const offLabel = r && r.open ? 'Then open again' : 'Then turn off again';
  const offVal = off ? whenValue(off.at) : (r && r.open ? 'Leave them closed' : 'Leave them on');
  const when = `<div class="card pad0 list"><button class="item" data-act="ae-when"><div class="grow"><div class="t">When?</div></div><span class="val">${sc.at ? esc(whenValue(sc.at)) : `<span class="odot"></span>Pick a time`}</span><span class="chev">${ICON('chev', 'sm')}</span></button>
    ${showOff ? `<button class="item" data-act="ae-off"><div class="grow"><div class="t">${offLabel}</div></div><span class="val">${esc(offVal)}</span><span class="chev">${ICON('chev', 'sm')}</span></button>` : ''}</div>`;
  const sel = [...L, ...Sh];
  const broken = (sc.actions || []).some(a => a.target && !targetExists(a.target));
  const lightsBody = `${targetChipsHTML(sel, 'ae-target', 'ae-target-more')}${broken ? `<p class="d" style="margin:8px 0 0"><span class="odot"></span>Points at something that is gone. Pick again.</p>` : ''}`;
  const rows = valueRow('Which lights?', esc(cap(targetName(packTarget(sel)))), 'ae-exp', 'data-k="L"', { open: AE.exp.L, sub: broken ? '<span class="odot"></span>Points at something that is gone' : '' }) + (AE.exp.L ? `<div class="vrow-body">${lightsBody}</div>` : '')
    + valueRow('What happens?', r ? esc(r.t) : 'Custom', 'ae-what')
    + valueRow('Which days?', esc(daysText(sc.days)), 'ae-exp', 'data-k="D"', { open: AE.exp.D }) + (AE.exp.D ? `<div class="vrow-body">${daysHTML(sc.days, 'ae', AE.dayWarn)}</div>` : '');
  const body = `<div class="card pad0 list" style="margin-top:8px">${rows}</div>`;
  const actions = `<div class="stack" style="margin-top:24px"><button class="btn block" data-act="ae-try">${ICON('play', 'sm')} Try it now</button>${inCfg ? `<button class="btn block" data-act="ae-skip">${esc(skipLabel(sc))}</button>` : ''}</div>
    <div style="margin-top:16px">${moreRow('Name, skip it when, fade, fine-tune, delete', 'ae-more')}</div>`;
  // no footer: an editor closes with "Done" in its top right, and every change has already autosaved
  showSheet('editor', title, `${when}${body}${actions}`, { detent: 'large', sub, done: true });
}
// "What happens": the recipe list on its own sheet, back to the editor.
function openWhatSheet() {
  const sc = aeSc(); if (!sc) return;
  const rid = autoRecipeOf(sc, AE.L, AE.Sh);
  const custom = rid === 'custom' ? `<div class="tip" style="margin-top:12px"><div class="grow"><span class="cap">Custom</span><div class="t">${esc(describe(sc.actions))}</div></div></div>` : '';
  showSheet('ae-what', 'What should happen?', `<div class="card pad0 list">${recipeRowsHTML(AE.L, AE.Sh, rid, 'ae-recipe')}</div>${custom}`, { detent: 'large', sub: esc(cap(targetName(packTarget([...AE.L, ...AE.Sh])))), back: true, onBack: renderEditor });
}

// ---------- "Something else": the walk for a new automation (2.14) ----------
let NW = null; // { L, Sh, rid, sceneAct, off, offAt, days, name, customName, dayWarn }
const nwShades = () => !NW.L.length && NW.Sh.length > 0;
function nwActions() { if (NW.sceneAct) return [NW.sceneAct]; const r = AUTO_RECIPES.find(x => x.id === NW.rid && recipeApplies(x, NW.L, NW.Sh)) || AUTO_RECIPES.find(x => recipeApplies(x, NW.L, NW.Sh)); return r ? r.mk(NW.L, NW.Sh) : []; }
function nwLeavesOn() { return leavesOn(nwActions()); }
function nwOffAt() {
  const s = S.config.settings;
  if (NW.off === 'bedtime') return { type: 'time', time: s.night_start, offset_min: 0 };
  if (NW.off === 'sunrise') return { type: 'sunrise', time: null, offset_min: 0 };
  if (NW.off === 'time' && NW.offAt) return NW.offAt;
  return null;
}
function nwDraft() {
  const sc = { id: uid(), name: '', enabled: true, at: whAt(), days: [...NW.days], actions: nwActions(), only_if: null, skip_until: null, kind: 'custom' };
  const offAt = nwLeavesOn() ? nwOffAt() : null;
  const off = offAt ? makePair(sc, offAt, NW.L, NW.Sh) : null;
  sc.name = NW.customName && NW.name ? NW.name : autoName(sc, NW.L, NW.Sh, !!off);
  if (off) off.name = sc.name;
  return { sc, off };
}
// "Bedroom on, 20 minutes before sunset. Off at 10pm. Every day."
function nwSentence() {
  const { sc, off } = nwDraft();
  const what = autoName(sc, NW.L, NW.Sh, false);
  return `${what}, ${whenClause(sc.at)}. ${off ? `${off.actions.some(a => a.type === 'raise') ? 'Open' : 'Off'} ${whenClause(off.at)}. ` : ''}${daysText(NW.days)}.`;
}
function openNewAutoWalk() {
  const room = lightRooms()[0]; const L = room ? [`a:${room.id}`] : ['h:all'];
  NW = { L, Sh: [], rid: 'on', sceneAct: null, off: 'leave', offAt: null, days: [...ALL_DAYS], name: '', customName: false, dayWarn: false, nameOpen: false };
  WH = { mode: 'at', type: 'time', time: '18:00', rel: 'at', mins: 20, render: renderSetup };
  const s = S.config.settings;
  walk({ key: 'newauto', state: NW, primary: 'Turn it on', onClose: () => { NW = null; WH = null; }, onDone: nwSave, steps: [
    { id: 'lights', kind: 'multi', title: 'Which lights?', valid: () => NW.L.length + NW.Sh.length > 0, body: () => targetChipsHTML([...NW.L, ...NW.Sh], 'nw-target', 'nw-target-more') + (NW.L.length + NW.Sh.length > 1 ? `<p class="d" style="margin:8px 0 0">${esc(cap(targetName(packTarget([...NW.L, ...NW.Sh]))))}</p>` : '') },
    { id: 'what', kind: 'pick', title: 'What should they do?', body: () => `<div class="card pad0 list">${AUTO_RECIPES.filter(x => recipeApplies(x, NW.L, NW.Sh)).map(x => pickRow(x.id, x.t, x.d || '', !NW.sceneAct && NW.rid === x.id)).join('')}</div>${NW.sceneAct ? `<p class="d" style="margin:8px 0 0">Runs the ${esc(targetName(NW.sceneAct.type === 'preset' ? 'p:' + NW.sceneAct.preset_id : 's:' + NW.sceneAct.scene_id))} scene</p>` : ''}`,
      onPick: (w, rid) => { if (rid === 'scene') { openNwScenePicker(); return false; } NW.rid = rid; NW.sceneAct = null; } },
    { id: 'when', kind: 'custom', title: 'When?', sub: 'Pick a clock time, or follow the sun.', next: 'Use this time', valid: () => WH.type === 'time' || !!S.config.settings.location, body: () => whenBodyHTML(WH) },
    { id: 'off', kind: 'pick', title: () => nwShades() ? 'Then open again?' : 'Then turn off again?', skip: () => !nwLeavesOn(),
      body: () => `<div class="card pad0 list">${pickRow('leave', nwShades() ? 'Leave them closed' : 'Leave them on', '', NW.off === 'leave')}${pickRow('bedtime', `At bedtime (${fmtTime(s.night_start)})`, '', NW.off === 'bedtime')}${pickRow('sunrise', 'At sunrise', '', NW.off === 'sunrise')}${pickRow('time', 'Pick a time…', NW.off === 'time' && NW.offAt ? cap(whenClause(NW.offAt)) : '', NW.off === 'time', ICON('clock'))}</div>`,
      onPick: (w, v) => { if (v === 'time') { openNwOffTime(); return false; } NW.off = v; } },
    { id: 'plan', kind: 'plan', body: w => {
      const { sc } = nwDraft();
      const days = walkValueRow(w, 'days', 'Which days?', esc(daysText(NW.days)), daysHTML(NW.days, 'nw', NW.dayWarn));
      const name = valueRow('Name', esc(sc.name), 'nw-name', '', { open: NW.nameOpen }) + (NW.nameOpen ? `<div class="vrow-body"><input class="input" id="nw-name" value="${esc(NW.customName ? NW.name : sc.name)}" maxlength="60" aria-label="Name"></div>` : '');
      return planHTML(esc(nwSentence()), days + name);
    } },
  ] });
}
function openNwScenePicker() {
  const items = [...presets().map(p => ({ a: { type: 'preset', preset_id: p.id }, n: p.name, s: p.mood ? 'Room mood' : 'Your scene' })), ...lutronScenes().map(s => ({ a: { type: 'scene', scene_id: s.scene_id }, n: s.name, s: 'From the Lutron app' }))];
  NW.scenePick = items;
  const body = items.length ? `<div class="card pad0 list">${items.map((it, i) => `<button class="item" data-act="nw-scene" data-i="${i}"><div class="ic">${ICON('scene', 'sm')}</div><div class="grow"><div class="t">${esc(it.n)}</div><div class="d">${it.s}</div></div></button>`).join('')}</div>` : `<div class="tip"><div class="grow"><span class="cap">Scenes</span><div class="t">No scenes yet</div><div class="d">Make one on the Scenes tab first.</div></div></div>`;
  showSheet('nw-scene', 'Which scene?', body, { detent: 'medium', back: true, onBack: renderSetup });
}
// "Pick a time…" for the off pair: the When body on its own sheet, back to the walk.
function openNwOffTime() {
  const cur = NW.offAt;
  NW.atWH = WH;
  WH = { mode: 'off', type: cur ? cur.type : 'time', time: cur && cur.time ? cur.time : (S.config.settings.night_start || '22:00'), rel: cur && cur.offset_min ? (cur.offset_min < 0 ? 'before' : 'after') : 'at', mins: cur && cur.offset_min ? Math.abs(cur.offset_min) : 20, render: renderNwOffTime };
  renderNwOffTime();
}
function renderNwOffTime() {
  const canUse = WH.type === 'time' || !!S.config.settings.location;
  const back = () => { WH = NW.atWH; renderSetup(); };
  showSheet('nw-off', nwShades() ? 'Open again when?' : 'Turn off again when?', `${whenBodyHTML(WH)}<div class="sfoot"><button class="btn primary lg block" data-act="nw-off-use" ${canUse ? '' : 'disabled'}>Use this time</button></div>`, { detent: 'medium', sub: 'Pick a clock time, or follow the sun.', back: true, onBack: back });
}
function nwOffUse() { NW.offAt = whAt(); NW.off = 'time'; WH = NW.atWH; walkAdvance(WALK.cur); }
function nwSave() {
  if (!NW || !WALK.cur) return;
  const { sc, off } = nwDraft();
  const msg = nwSentence();
  S.config.schedules.push(sc); if (off) S.config.schedules.push(off);
  closeSheet(); goAutomations();
  save({ msg });
}

// ---------- the When sheet (4.2) ----------
let WH = null; // { mode: 'at' | 'off', type, time, rel, mins }
function openWhenSheet(mode) {
  const sc = aeSc(); const cur = mode === 'off' ? (aeOff() || {}).at : sc.at;
  WH = { mode, type: cur ? cur.type : 'time', time: cur && cur.time ? cur.time : (mode === 'off' ? (S.config.settings.night_start || '22:00') : '18:00'), rel: cur && cur.offset_min ? (cur.offset_min < 0 ? 'before' : 'after') : 'at', mins: cur && cur.offset_min ? Math.abs(cur.offset_min) : 20 };
  renderWhenSheet();
}
function whAt() { const w = WH; return w.type === 'time' ? { type: 'time', time: w.time, offset_min: 0 } : { type: w.type, time: null, offset_min: w.rel === 'at' ? 0 : (w.rel === 'before' ? -w.mins : w.mins) }; }
// The body of the When question: at a time, or around the sun; the location step inline when the sun needs it.
function whenBodyHTML(w) {
  const loc = S.config.settings.location;
  let body = `<div class="chips">${[['time', 'At a time'], ['sunset', 'Sunset'], ['sunrise', 'Sunrise']].map(([v, l]) => `<button class="chip ${w.type === v ? 'sel' : ''}" data-act="wh-type" data-v="${v}">${l}</button>`).join('')}</div>`;
  if (w.type === 'time') body += `<div class="when-time"><input type="time" class="time-big" id="wh-time" value="${w.time}" aria-label="Time"></div>`;
  else {
    body += `<div class="chips" style="margin-top:16px">${[['at', 'At'], ['before', 'Before'], ['after', 'After']].map(([v, l]) => `<button class="chip sm ${w.rel === v ? 'sel' : ''}" data-act="wh-rel" data-v="${v}">${l}</button>`).join('')}</div>`;
    if (w.rel !== 'at') body += `<div class="chips" style="margin-top:8px">${[10, 20, 30, 45, 60, 90].map(m => `<button class="chip sm ${w.mins === m ? 'sel' : ''}" data-act="wh-mins" data-v="${m}">${m}</button>`).join('')}</div>`;
    const at = whAt(); const hm = loc ? sunAt(at.type, at.offset_min) : null;
    body += `<p class="body" style="margin:16px 0 0">${cap(whenClause(at))}. ${hm ? `Today that's ${fmtTime(hm)}.` : loc ? "Today's time will show once your home is connected." : ''}</p>`;
    body += locationStepHTML();
  }
  return body;
}
function renderWhenSheet() {
  const w = WH; if (!w) return;
  if (w.render) { w.render(); return; }  // the When body inside a walk or another sheet draws itself
  const loc = S.config.settings.location;
  const canUse = w.type === 'time' || !!loc;
  const body = whenBodyHTML(w) + `<div class="sfoot"><button class="btn primary lg block" data-act="wh-use" ${canUse ? '' : 'disabled'}>Use this time</button>${w.mode === 'off' && aeOff() ? `<button class="btn ghost block" data-act="wh-leave">Leave them on</button>` : ''}</div>`;
  showSheet('when', w.mode === 'off' ? 'Turn off again when?' : 'When?', body, { detent: 'medium', sub: 'Pick a clock time, or follow the sun.', back: true, onBack: renderEditor });
}
function whUse() {
  const sc = aeSc(); if (!sc || !WH) return;
  const at = whAt();
  if (WH.mode === 'at') { sc.at = at; WH = null; aeSave(); return; }
  let off = aeOff();
  if (!off) { off = makePair(sc, at, AE.L, AE.Sh); if (aeInConfig()) S.config.schedules.push(off); else AE.draftOff = off; }
  else off.at = at;
  WH = null; aeSave(`${describe(off.actions)} ${whenClause(at)}`);
}
function whLeave() {
  const off = aeOff(); if (off && aeInConfig()) S.config.schedules = schedules().filter(x => x.id !== off.id); AE.draftOff = null;
  WH = null; aeSave(aeInConfig() ? 'Left on' : null);
}

// ---------- the location step (4.2): inside the When sheet, the guided setups, and the wind-down card ----------
const LOC = { denied: false, busy: false, host: null };
function locationStepHTML() {
  const loc = S.config.settings.location;
  if (loc) { const hm = sunAt('sunset', 0); return `<p class="d" style="margin:12px 0 0">Near ${esc(loc.name || 'your home')}${hm ? ` · sunset today ${fmtTime(hm)}` : ''} <a data-act="loc-city" href="#">Change</a></p>`; }
  return `<div class="tip top" style="margin-top:16px"><div class="grow"><span class="cap">Location</span><div class="t">Where is your home?</div><div class="d">${LOC.denied ? "Your phone didn't share its location. Pick the nearest city instead." : "Sunset moves through the year, so the app needs to know roughly where you are. It's kept on your own hub."}</div><div class="row wrap" style="margin-top:12px"><button class="btn sm primary" data-act="loc-use" ${LOC.busy ? 'disabled' : ''}>${LOC.busy ? 'Finding you…' : 'Use my location'}</button><button class="btn ghost" data-act="loc-city">Pick the nearest city instead</button></div></div></div>`;
}
// The location question as a walk step's body: the title is the question, so only the sentence and the two ways to answer.
function locationBodyHTML() {
  return `<p class="body">${LOC.denied ? "Your phone didn't share its location. Pick the nearest city instead." : "Sunset moves through the year, so the app needs to know roughly where you are. It's kept on your own hub."}</p>
    <div class="stack" style="margin-top:20px"><button class="btn primary lg block" data-act="loc-use" ${LOC.busy ? 'disabled' : ''}>${LOC.busy ? 'Finding you…' : 'Use my location'}</button><button class="btn ghost block" data-act="loc-city">Pick the nearest city instead</button></div>`;
}
// Whatever asked for the location is drawn again once it is known.
function locRepaint() {
  if (LOC.host) { LOC.host(); return; }
  if (WH && SHEET_KEY === 'when') renderWhenSheet();
  else if (WALK.cur && SHEET_KEY === WALK.cur.key) walkRender(WALK.cur);
  else if (WH && WH.render && SHEET_KEY === 'nw-off') renderNwOffTime();
  else if (SHEET_KEY === 'city') { /* the picker closes itself */ }
  else if (!sheet.isOpen() || SHEET_KEY === null) render();
}
function locBack() { if (LOC.host) { LOC.host(); return; } if (WALK.cur) { if (WH && WH.render === renderNwOffTime) renderNwOffTime(); else walkRender(WALK.cur); } else if (WH) renderWhenSheet(); else { closeSheet(); render(); } }
function useMyLocation() {
  if (!navigator.geolocation) { LOC.denied = true; locRepaint(); return; }
  LOC.busy = true; locRepaint();
  navigator.geolocation.getCurrentPosition(
    pos => { LOC.busy = false; LOC.denied = false; setLocation(pos.coords.latitude, pos.coords.longitude, null, phoneTZ()); },
    () => { LOC.busy = false; LOC.denied = true; locRepaint(); },
    { timeout: 12000, maximumAge: 600000 });
}
function setLocation(lat, lng, name, tz) {
  const c = typeof nearestCity === 'function' ? nearestCity(lat, lng) : null; const nm = name || (c ? c[0] : '');
  S.config.settings.location = { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000, name: nm };
  if (tz) S.config.settings.timezone = tz;
  return save({ msg: nm ? `Near ${nm}` : 'Location saved', render: !sheet.isOpen() }).then(locRepaint);
}
function openCityPicker() {
  showSheet('city', 'Which city is nearest?', `<label class="field"><span>City</span><input class="input" id="city-q" placeholder="Type a city" autocomplete="off"></label><div id="city-list">${cityListHTML('')}</div>`, { detent: 'medium', sub: 'Sunset a hundred kilometres off is still within minutes.', back: true, onBack: locBack });
  const q = $('#city-q'); if (q) setTimeout(() => q.focus(), 350);
}
function cityListHTML(q) {
  const list = typeof searchCities === 'function' ? searchCities(q, 12) : [];
  if (!list.length) return `<p class="d" style="margin-top:8px">No city by that name in the list. Try a bigger one nearby.</p>`;
  return `<div class="card pad0 list">${list.map(c => `<button class="item" data-act="city-pick" data-i="${CITIES.indexOf(c)}"><div class="grow"><div class="t">${esc(c[0])}</div><div class="d">${esc(c[1])}</div></div></button>`).join('')}</div>`;
}
// The clock follows the phone, as with "Use my location"; the city's own zone only stands in when the phone has none.
function pickCity(i) {
  const c = CITIES[i]; if (!c) return;
  LOC.denied = false;
  setLocation(c[2], c[3], c[0], phoneTZ() || c[4]).then(() => { locBack(); });
}

// ---------- More options (4.6) ----------
const FADE_OPTS = [['', 'Default'], [0, 'Instantly'], [1, '1 second'], [3, '3 seconds'], [8, '8 seconds'], [30, '30 seconds'], [120, '2 minutes'], [600, '10 minutes'], [1200, '20 minutes'], [1800, '30 minutes']];
function openMoreSheet() {
  const sc = aeSc(); if (!sc) return;
  const lv = (sc.actions || []).find(a => a.type === 'level'); const fade = lv && lv.fade != null ? lv.fade : '';
  const body = `<label class="field"><span>Name</span><input class="input" id="ae-name" value="${esc(sc.name)}" maxlength="60"></label>
    <label class="field"><span>Skip it when</span><select class="input" id="ae-onlyif">${[['', 'Never'], ['any_on', 'The lights are already on'], ['all_off', 'The lights are already off']].map(([v, l]) => `<option value="${v}" ${(sc.only_if || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Change gradually over</span><select class="input" id="ae-fade">${FADE_OPTS.map(([v, l]) => `<option value="${v}" ${String(fade) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="btn block" data-act="ae-finetune" style="margin-top:8px">Fine-tune: several steps, timers…</button>
    <div class="spacer"></div><div class="spacer"></div><button class="btn danger block" data-act="ae-delete">Delete this automation</button>`;
  showSheet('more', 'More options', body, { detent: 'medium', sub: esc(sc.name), back: true, onBack: renderEditor, done: true });
}
function aeFineTune() {
  const sc = aeSc(); if (!sc) return;
  S.advCustom = {
    list: () => (aeSc() || { actions: [] }).actions,
    title: `Fine-tune ${sc.name}`, sub: 'Steps run in order.',
    target: packTarget(AE.L.length ? AE.L : (AE.Sh.length ? AE.Sh : ['h:all'])),
    changed: () => aeSaveSoon(),
    onBack: () => { S.advCustom = null; aeFromActions(); openMoreSheet(); },
    onDone: () => { S.advCustom = null; aeFromActions(); if (aeInConfig()) save({ msg: 'Saved', render: S.view === 'automations' }); renderEditor(); },
  };
  SHEET_KEY = 'finetune'; renderAdvanced();
}
// After a fine-tune, the chips follow whatever the steps now point at.
function aeFromActions() { const sc = aeSc(); if (!sc) return; const { L, Sh } = splitT(targetsOf(sc)); if (L.length || Sh.length) { AE.L = L; AE.Sh = Sh; } }
// Deleting from the row's swipe: one confirm, then the same removal the editor does. Undo is in the toast.
function confirmDeleteAutomation(sc) {
  const body = `<div class="tip"><div class="grow"><span class="cap">${esc(ruleLine(sc, pairOf(sc)))}</span><div class="t">It stops running</div><div class="d">Your lights keep whatever they are doing now.</div></div></div><div class="spacer"></div><button class="btn danger block" data-act="au-delete-yes" data-id="${esc(sc.id)}">Delete this automation</button>`;
  showSheet('au-del', `Delete ${esc(sc.name || 'this automation')}?`, body, { detent: 'compact' });
}
function deleteAutomation(id) {
  const prev = JSON.stringify(S.config);
  S.config.schedules = schedules().filter(x => x.id !== id && x.id !== id + '-off');
  closeSheet();
  save({ msg: 'Automation deleted', undo: true });
  toast('Automation deleted', { undo: async () => { S.config = JSON.parse(prev); await save({ msg: 'Undone' }); } });
}
function aeDelete() {
  const sc = aeSc(); if (!sc) return;
  if (aeInConfig()) { S.config.schedules = schedules().filter(x => x.id !== sc.id && x.id !== sc.id + '-off'); closeSheet(); save({ msg: 'Automation deleted' }); }
  else closeSheet();
}
async function aeTry() {
  const sc = aeSc(); if (!sc || !sc.actions.length) return;
  for (const a of sc.actions) { if (!(await command(a))) return; }
  toast('Done');
}

// ---------- the three guided setups (5) ----------
let GS = null;
const OUTSIDE_RE = /outside|outdoor|porch|patio|garden|entry|hall|exterior|yard|deck|front|drive|garage/i;
const BEDROOM_RE = /bed|nursery|guest/i;
const HALL_RE = /hall|entry|foyer|landing|stairs|mud/i;
function roomMatches(t, re) { const aid = t.startsWith('a:') ? t.slice(2) : t.startsWith('d:') ? devArea(dev(t.slice(2))) : null; return !!aid && re.test(areaName(aid)); }
// Each setup is a walk (docs/ux-progressive.md 2.16): one question per step, the plan at the end, saved by the plan's primary (`gs-save`).
function openWelcomeSetup() {
  const pre = lightRooms().filter(a => OUTSIDE_RE.test(a.name)).map(a => `a:${a.id}`);
  GS = { kind: 'welcome', targets: pre, shades: [], until: 'bedtime', untilTime: '22:00', low: false, level: 60, offset: 20 };
  const s = S.config.settings; const shades = () => controllable().filter(d => d.domain === 'cover');
  walk({ key: 'setup', title: 'Welcome lights', sub: 'Lights on before you reach the door, off at bedtime.', state: GS, primary: 'Turn it on', doneAct: 'gs-save', onClose: () => { GS = null; }, steps: [
    { id: 'targets', kind: 'multi', title: 'Which lights should come on before you get home?', valid: () => GS.targets.length > 0, body: () => {
      const chipsT = [...GS.targets, ...lightRooms().map(a => `a:${a.id}`), 'h:all'].filter((v, i, arr) => arr.indexOf(v) === i && targetExists(v));
      return `<div class="chips scroll">${chipsT.map(t => chip('gs-target', esc(cap(targetName(t))), GS.targets.includes(t), `data-t="${esc(t)}"`)).join('')}<button class="chip" data-act="gs-target-more">${ICON('dots', 'sm')}Specific lights…</button></div><p class="d" style="margin:8px 0 0">${GS.targets.length ? esc(cap(targetName(packTarget(GS.targets)))) : 'Pick at least one light'}</p>`;
    } },
    { id: 'shades', kind: 'multi', title: 'Close any shades too?', skip: () => !shades().length, body: () => `<div class="chips">${shades().map(d => chip('gs-shade', esc(d.name), GS.shades.includes(`d:${d.device_id}`), `data-t="d:${d.device_id}"`)).join('')}</div><p class="d" style="margin:8px 0 0">${GS.shades.length ? `${plural(GS.shades.length, 'shade')} close with the lights` : 'None: the shades stay as they are'}</p>` },
    { id: 'until', kind: 'pick', title: 'Until when?', body: () => `<div class="card pad0 list">${pickRow('bedtime', `Bedtime (${fmtTime(s.night_start)})`, '', GS.until === 'bedtime')}${pickRow('sunrise', 'Sunrise', sunAt('sunrise') ? fmtTime(sunAt('sunrise')) + ' today' : '', GS.until === 'sunrise')}${pickRow('time', 'Pick a time…', '', GS.until === 'time')}</div>
      ${GS.until === 'time' ? `<div class="when-time"><input type="time" class="time-big" id="gs-until-time" value="${GS.untilTime}" aria-label="Off at"></div>` : ''}
      ${GS.targets.some(t => roomMatches(t, OUTSIDE_RE)) ? `<label class="check" style="margin-top:16px"><input type="checkbox" class="cb" id="gs-low" ${GS.low ? 'checked' : ''}><span>Leave the outside lights on low until morning</span></label>` : ''}`,
      onPick: (w, v) => { GS.until = v; if (v === 'time') { walkRender(w); return false; } }, foot: w => GS.until === 'time' ? walkNextFoot('Next', true) : '' },
    { id: 'loc', kind: 'custom', noNext: true, title: 'Where is your home?', skip: () => !!S.config.settings.location, body: locationBodyHTML },
    { id: 'plan', kind: 'plan', body: w => planHTML(esc(welcomePreview(GS)),
      walkValueRow(w, 'level', 'Brightness', `${GS.level}%`, `<div class="chips">${[40, 60, 80, 100].map(v => chip('gs-level', `${v}%`, GS.level === v, `data-v="${v}"`)).join('')}</div>`)
      + walkValueRow(w, 'offset', 'Comes on', GS.offset ? `${GS.offset} minutes before sunset` : 'At sunset', `<div class="chips">${[0, 10, 20, 30, 45].map(v => chip('gs-offset', v ? `${v} min before` : 'At sunset', GS.offset === v, `data-v="${v}"`)).join('')}</div>`)) },
  ] });
}
function wakeShade(g) { const lampD = g.lamp ? dev(g.lamp) : null; return lampD ? controllable().find(d => d.domain === 'cover' && devArea(d) === devArea(lampD)) : null; }
function openWakeupSetup() {
  const beds = dimmers().filter(d => BEDROOM_RE.test(devAreaName(d)));
  const lamp = beds.find(d => /lamp/i.test(d.name)) || beds[0] || dimmers()[0];
  GS = { kind: 'wakeup', lamp: lamp ? lamp.device_id : null, alarm: '06:30', days: [1, 2, 3, 4, 5], shade: false, minutes: 25, end: 50, dayWarn: false };
  walk({ key: 'setup', title: 'Wake-up light', sub: 'One lamp rises slowly from dark to soft, ending at the time you pick.', state: GS, primary: 'Turn it on', doneAct: 'gs-save', onClose: () => { GS = null; }, steps: [
    { id: 'lamp', kind: 'pick', title: 'Which lamp should wake you?', skip: () => dimmers().length === 1, body: () => {
      const lampD = GS.lamp ? dev(GS.lamp) : null; const shown = [...beds]; if (lampD && !shown.includes(lampD)) shown.unshift(lampD);
      return `<div class="card pad0 list">${shown.map(d => pickRow(d.device_id, esc(d.name), esc(devAreaName(d)), GS.lamp === d.device_id, lampHTML(level(d.device_id) || 0, 28, ''))).join('')}<button class="item" data-act="gs-lamp-more">${ICON('dots')}<div class="grow"><div class="t">Another light…</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
    }, onPick: (w, v) => { GS.lamp = v; } },
    { id: 'alarm', kind: 'time', title: 'What time do you wake up?', sub: () => `It starts ${GS.minutes} minutes before, so it's soft by then.`, valid: () => GS.days.length > 0, body: () => `<div class="when-time" style="margin-top:8px"><input type="time" class="time-big" id="gs-alarm" value="${GS.alarm}" aria-label="Wake up at"></div><div class="h2">Which days?</div>${daysHTML(GS.days, 'gs', GS.dayWarn)}` },
    { id: 'shade', kind: 'pick', title: 'Open the shade too?', sub: () => { const sh = wakeShade(GS); return sh ? esc(sh.name) : ''; }, skip: () => !wakeShade(GS), body: () => `<div class="card pad0 list">${pickRow('yes', 'Yes, at the time I wake', '', GS.shade)}${pickRow('no', 'No', '', !GS.shade)}</div>`, onPick: (w, v) => { GS.shade = v === 'yes'; } },
    { id: 'plan', kind: 'plan', body: w => planHTML(esc(wakeupPreview(GS)),
      valueRow('Which lamp?', esc((dev(GS.lamp) || {}).name || 'Pick a lamp'), 'walk-goto', 'data-id="lamp"')
      + valueRow('Wakes you at', `${fmtTime(GS.alarm)} · ${esc(daysText(GS.days))}`, 'walk-goto', 'data-id="alarm"')
      + walkValueRow(w, 'minutes', 'Takes', `${GS.minutes} minutes`, `<div class="chips">${[15, 25, 40].map(v => chip('gs-minutes', `${v} minutes`, GS.minutes === v, `data-v="${v}"`)).join('')}</div>`)
      + walkValueRow(w, 'end', 'Ends at', `${GS.end}%`, `<div class="chips">${[30, 50, 70].map(v => chip('gs-end', `${v}%`, GS.end === v, `data-v="${v}"`)).join('')}</div>`)) },
  ] });
}
function openButtonsSetup() {
  const rs = remotes(); if (!rs.length) return;
  const bedRemote = rs.find(d => BEDROOM_RE.test(devAreaName(d))) || rs[0];
  const hallRemote = rs.find(d => HALL_RE.test(devAreaName(d))) || rs.find(d => d.device_id !== bedRemote.device_id) || rs[0];
  const path = groups().find(g => /night path/i.test(g.name));
  const hallRooms = lightRooms().filter(a => HALL_RE.test(a.name));
  const hallLights = controllable().filter(d => (d.domain === 'light' || d.domain === 'switch') && HALL_RE.test(devAreaName(d)));
  const door = hallLights[0] || controllable().find(d => d.domain === 'light' || d.domain === 'switch');
  const pathT = path ? [`g:${path.id}`] : hallRooms.length ? [`a:${hallRooms[0].id}`] : (lightRooms()[0] ? [`a:${lightRooms()[0].id}`] : []);
  const same = hallRemote.device_id === bedRemote.device_id;
  GS = { kind: 'buttons', gn: { on: true, remote: bedRemote.device_id, button: defaultHoldButton(bedRemote), path: pathT }, lv: { on: true, remote: hallRemote.device_id, button: defaultHoldButton(hallRemote, same ? defaultHoldButton(bedRemote) : null), door: door ? `d:${door.device_id}` : null } };
  const remoteRows = (key, skipLabel) => { const cur = GS[key]; const sorted = [...rs].sort((a, b) => (a.device_id === (key === 'gn' ? bedRemote : hallRemote).device_id ? -1 : b.device_id === (key === 'gn' ? bedRemote : hallRemote).device_id ? 1 : 0)); return `<div class="card pad0 list">${sorted.map(d => pickRow(d.device_id, esc(d.name), esc(devAreaName(d)), cur.on && cur.remote === d.device_id, `<div class="remote-thumb">${picoArt(d, { width: 40 })}</div>`)).join('')}${pickRow('skip', skipLabel, '', !cur.on, ICON('x'))}</div>`; };
  const pickRemote = (key, v) => { if (v === 'skip') { GS[key].on = false; return; } GS[key].on = true; GS[key].remote = v; GS[key].button = defaultHoldButton(dev(v), key === 'lv' && GS.gn.on && GS.gn.remote === v ? GS.gn.button : null); };
  const doorLights = () => controllable().filter(d => d.domain === 'light' || d.domain === 'switch').sort((a, b) => (HALL_RE.test(devAreaName(b)) ? 1 : 0) - (HALL_RE.test(devAreaName(a)) ? 1 : 0));
  // the chosen button first, so "Hold Off" is in view on a five-button remote
  const buttonChips = (act, pid, cur) => { const d = dev(pid); if (!d) return ''; const ns = picoSlots(d).filter(s => s.real).map(s => s.n).sort((a, b) => (a === cur ? -1 : b === cur ? 1 : a - b)); return `<div class="chips scroll">${ns.map(n => chip(act, `Hold ${esc(buttonLabel(pid, n))}`, cur === n, `data-n="${n}"`)).join('')}</div>`; };
  const replaces = (pid, n) => { const acts = gestureActions(pid, n, 'hold'); return acts.length ? `<p class="d" style="margin:8px 0 0">This replaces: ${esc(describe(acts))}</p>` : ''; };
  const holdName = k => `Hold ${esc(buttonLabel(GS[k].remote, GS[k].button))} on the ${esc(dev(GS[k].remote).name)}`;
  walk({ key: 'setup', title: 'Goodnight and Leaving', sub: 'One hold shuts the house down and leaves one light on for a moment.', state: GS, primary: 'Set up the buttons', doneAct: 'gs-save', onClose: () => { GS = null; }, steps: [
    { id: 'gnRemote', kind: 'pick', title: 'Which remote is by your bed?', sub: 'Holding a button on it will be Goodnight.', skip: () => rs.length === 1, body: () => remoteRows('gn', 'Skip Goodnight'), onPick: (w, v) => pickRemote('gn', v) },
    { id: 'gnPath', kind: 'multi', title: 'Which lights light the way to bed?', sub: 'They stay dim for two minutes after everything else goes off.', skip: () => !GS.gn.on, body: () => { const gnLights = [...GS.gn.path, ...groups().filter(x => /night path/i.test(x.name)).map(x => `g:${x.id}`), ...lightRooms().map(a => `a:${a.id}`)].filter((v, i, arr) => arr.indexOf(v) === i && targetExists(v)); return `<div class="chips scroll">${gnLights.map(t => chip('gs-gn-path', esc(cap(targetName(t))), GS.gn.path.includes(t), `data-t="${esc(t)}"`)).join('')}</div><p class="d" style="margin:8px 0 0">${GS.gn.path.length ? esc(cap(targetName(packTarget(GS.gn.path)))) : 'None: everything goes off at once'}</p>`; } },
    { id: 'lvRemote', kind: 'pick', title: 'Which remote is by the door you leave from?', sub: 'Holding a button on it will be Leaving.', skip: () => rs.length === 1, body: () => remoteRows('lv', 'Skip Leaving'), onPick: (w, v) => pickRemote('lv', v) },
    { id: 'lvDoor', kind: 'pick', title: 'Which light is by that door?', sub: 'It stays on for two minutes after everything else goes off.', skip: () => !GS.lv.on, body: () => `<div class="card pad0 list">${doorLights().map(d => pickRow(`d:${d.device_id}`, esc(d.name), esc(devAreaName(d)), GS.lv.door === `d:${d.device_id}`, lampHTML(level(d.device_id) || 0, 28, ''))).join('')}</div>`, onPick: (w, v) => { GS.lv.door = v; } },
    { id: 'plan', kind: 'plan', valid: () => (GS.gn.on && GS.gn.remote) || (GS.lv.on && GS.lv.remote), body: w => planHTML(esc(buttonsPreview(GS)),
      (GS.gn.on ? walkValueRow(w, 'gn', 'Goodnight button', holdName('gn'), buttonChips('gs-gn-button', GS.gn.remote, GS.gn.button) + replaces(GS.gn.remote, GS.gn.button)) : valueRow('Goodnight button', 'Skipped', 'walk-goto', 'data-id="gnRemote"'))
      + (GS.lv.on ? walkValueRow(w, 'lv', 'Leaving button', holdName('lv'), buttonChips('gs-lv-button', GS.lv.remote, GS.lv.button) + replaces(GS.lv.remote, GS.lv.button)) : valueRow('Leaving button', 'Skipped', 'walk-goto', 'data-id="lvRemote"'))) },
  ] });
}
// The bottom (Off) button, or the last real one; `avoid` keeps Leaving off the button Goodnight already took on the same remote.
function defaultHoldButton(d, avoid = null) { const real = picoSlots(d).filter(s => s.real).map(s => s.n); const order = [2, ...real.slice().reverse()]; return order.find(n => real.includes(n) && n !== avoid) ?? real[real.length - 1]; }
function chip(act, label, sel, data = '') { return `<button class="chip ${sel ? 'sel' : ''}" data-act="${act}" ${data}>${sel ? ICON('check', 'sm') : ''}${label}</button>`; }
// The setups and the new-automation walk redraw through the walk; anything that changes their state calls this.
function renderSetup() { if (WALK.cur) walkRender(WALK.cur); }
function welcomePreview(g) {
  if (!g.targets.length) return 'Pick at least one light.';
  const s = S.config.settings; const onHm = sunAt('sunset', -g.offset);
  const off = g.until === 'bedtime' ? `at ${fmtTime(s.night_start)}` : g.until === 'sunrise' ? `at sunrise${sunAt('sunrise') ? ` (${fmtTime(sunAt('sunrise'))})` : ''}` : `at ${fmtTime(g.untilTime)}`;
  const rel = g.offset ? `${g.offset} minutes before sunset` : 'at sunset';
  return onHm ? `Today: on at ${fmtTime(onHm)}, ${rel}. Off ${off}.` : `On ${rel}. Off ${off}.`;
}
function saveWelcome(g) {
  const s = S.config.settings; if (!g.targets.length || !s.location) return;
  const id = uid(); const T = packTarget(g.targets);
  const outsideT = g.targets.filter(t => roomMatches(t, OUTSIDE_RE)), indoorT = g.targets.filter(t => !roomMatches(t, OUTSIDE_RE));
  const offAt = g.until === 'bedtime' ? { type: 'time', time: s.night_start, offset_min: 0 } : g.until === 'sunrise' ? { type: 'sunrise', time: null, offset_min: 0 } : { type: 'time', time: g.untilTime, offset_min: 0 };
  const base = { enabled: true, days: [...ALL_DAYS], only_if: null, skip_until: null, kind: 'welcome' };
  const on = { ...base, id, name: 'Welcome lights', at: { type: 'sunset', time: null, offset_min: -g.offset }, actions: [{ type: 'level', target: T, level: g.level, fade: 3 }] };
  if (g.shades.length) on.actions.push({ type: 'lower', target: packTarget(g.shades) });
  const list = [on];
  const low = g.low && outsideT.length > 0;
  const offTargets = low ? indoorT : g.targets;
  if (offTargets.length) list.push({ ...base, id: id + '-off', name: 'Welcome lights', at: offAt, actions: [{ type: 'level', target: packTarget(offTargets), level: 'off', fade: 1 }, ...(g.shades.length && g.until === 'sunrise' ? [{ type: 'raise', target: packTarget(g.shades) }] : [])] });
  if (low) { const id2 = uid(); list.push({ ...base, id: id2, name: 'Outside lights, overnight', at: offAt, actions: [{ type: 'level', target: packTarget(outsideT), level: 20, fade: 3 }] }, { ...base, id: id2 + '-off', name: 'Outside lights, overnight', at: { type: 'sunrise', time: null, offset_min: 15 }, actions: [{ type: 'level', target: packTarget(outsideT), level: 'off', fade: 1 }] }); }
  if (g.shades.length && g.until !== 'sunrise') list.push({ ...base, id: uid(), name: 'Shades open', at: { type: 'sunrise', time: null, offset_min: 15 }, actions: [{ type: 'raise', target: packTarget(g.shades) }] });
  S.config.schedules.push(...list);
  const onHm = sunAt('sunset', -g.offset);
  closeSheet(); GS = null;
  goAutomations(); save({ msg: `Welcome lights set up${onHm ? `. Today at ${fmtTime(onHm)}` : ''}` });
}
function wakeupPreview(g) {
  if (!g.lamp) return 'Pick a lamp.';
  return `Starts at ${fmtTime(hmAdd(g.alarm, -g.minutes))}, reaches ${g.end}% by ${fmtTime(g.alarm)}. Skipped if the lamp is already on.`;
}
// "Another light…": every dimmer in the house, as a sub-step of the wake-up walk; picking one answers the step.
function openLampPicker() {
  const rows = lightRooms().map(a => { const ds = dimmers().filter(d => devArea(d) === a.id); if (!ds.length) return ''; return `<div class="h3">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => `<button class="item" data-act="gs-lamp-pick" data-id="${d.device_id}">${lampHTML(level(d.device_id) || 0, 28, '')}<div class="grow"><div class="t">${esc(d.name)}</div></div>${GS.lamp === d.device_id ? `<span class="chk">${ICON('check')}</span>` : ''}</button>`).join('')}</div>`; }).join('');
  showSheet('lamp', 'Which light?', rows || `<div class="tip"><div class="grow"><span class="cap">Lights</span><div class="t">No dimmable lights found</div></div></div>`, { detent: 'medium', sub: 'A dimmer, so it can rise slowly.', back: true, onBack: renderSetup });
}
function saveWakeup(g) {
  if (!g.lamp) return;
  const lampD = dev(g.lamp); const room = lampD ? devAreaName(lampD) : 'Bedroom';
  const base = { enabled: true, days: [...g.days], skip_until: null, kind: 'wakeup' };
  const list = [{ ...base, id: uid(), name: 'Wake-up light', at: { type: 'time', time: hmAdd(g.alarm, -g.minutes), offset_min: 0 }, actions: [{ type: 'level', target: `d:${g.lamp}`, level: g.end, fade: g.minutes * 60 }], only_if: 'all_off' }];
  const shade = lampD && g.shade ? controllable().find(d => d.domain === 'cover' && devArea(d) === devArea(lampD)) : null;
  if (shade) list.push({ ...base, id: uid(), name: `${room} shade`, at: { type: 'time', time: g.alarm, offset_min: 0 }, actions: [{ type: 'raise', target: `d:${shade.device_id}` }], only_if: null });
  S.config.schedules.push(...list);
  closeSheet(); GS = null;
  goAutomations(); save({ msg: `Wake-up light set up. Starts at ${fmtTime(hmAdd(g.alarm, -g.minutes))}.` });
}
function goAutomations() { if (S.view !== 'automations') { S.view = 'automations'; location.hash = 'automations'; } }
function buttonsPreview(g) {
  const parts = [];
  const name = t => targetName(packTarget(tlist(t)));
  if (g.gn.on && g.gn.remote) parts.push(`Hold ${buttonLabel(g.gn.remote, g.gn.button)} on the ${dev(g.gn.remote).name}: everything off, ${g.gn.path.length ? `${name(g.gn.path)} stays dim for two minutes` : 'nothing stays on'}.`);
  if (g.lv.on && g.lv.remote) parts.push(`Hold ${buttonLabel(g.lv.remote, g.lv.button)} on the ${dev(g.lv.remote).name}: everything off, ${g.lv.door ? `${name(g.lv.door)} stays on for two minutes` : 'nothing stays on'}.`);
  if (!parts.length) return 'Turn on at least one of the two.';
  if (hasFans() || hasShades()) parts.push(hasFans() && hasShades() ? 'Fans stop and shades close.' : hasFans() ? 'Fans stop.' : 'Shades close.');
  return parts.join(' ');
}
// Everything off, one light kept (dim, or on) for two minutes, fans and shades when the house has them.
function shutdownActions(keep, mode) {
  const acts = [{ type: 'level', target: 'h:all', level: 'off', fade: 2 }];
  if (keep) acts.push({ type: 'level', target: keep, level: mode === 'dim' ? 10 : 'on', fade: 1 }, { type: 'timer', target: keep, minutes: 2, level: 0, fade: 10 });
  if (hasFans()) acts.push({ type: 'fan', target: 'h:fans', speed: 'Off' });
  if (hasShades()) acts.push({ type: 'lower', target: 'h:shades' });
  return acts;
}
function holdReplace(pid, n, actions) {
  S.config.bindings = bindings().filter(b => !(b.device_id === pid && b.button_number === n && ['hold', 'hold_start', 'hold_end'].includes(b.gesture)));
  S.config.bindings.push({ id: uid(), device_id: pid, button_number: n, gesture: 'hold', actions, night: null });
}
function saveButtons(g) {
  let n = 0;
  if (g.gn.on && g.gn.remote) { holdReplace(g.gn.remote, g.gn.button, shutdownActions(g.gn.path.length ? packTarget(g.gn.path) : null, 'dim')); n++; }
  if (g.lv.on && g.lv.remote) { holdReplace(g.lv.remote, g.lv.button, shutdownActions(g.lv.door, 'on')); n++; }
  if (!n) return;
  closeSheet(); GS = null;
  S.view = 'remotes'; S.remote = null; location.hash = 'remotes';
  save({ msg: n === 2 ? 'Goodnight and Leaving buttons set up' : g.gn.on ? 'Goodnight button set up' : 'Leaving button set up' });
  window.scrollTo(0, 0);
}

// ---------- evening wind-down (6) ----------
// Port of winddown_level() in agent/engine.py: night level in the night hours, a soft morning, full until the start, then a line down.
function inWindow(now, start, end) { if (start === end) return false; return start < end ? (now >= start && now < end) : (now >= start || now < end); }
const hmMin = hm => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
function winddownLevel(nowHm, startHm, nightStart, nightEnd, fromLevel, toLevel, nightLevel, morningLevel = 100, morningUntil = '07:30') {
  if (inWindow(nowHm, nightStart, nightEnd)) return nightLevel;
  if (hmMin(nightEnd) <= hmMin(nowHm) && hmMin(nowHm) < hmMin(morningUntil)) return morningLevel;
  const now = hmMin(nowHm), start = hmMin(startHm), ns = hmMin(nightStart);
  if (ns <= start) return now < start ? fromLevel : toLevel;
  if (now < start) return fromLevel;
  if (now >= ns) return toLevel;
  return Math.round(fromLevel + (toLevel - fromLevel) * ((now - start) / (ns - start)));
}
const wdSettings = () => { const ad = S.config.settings.adaptive || {}; return { ad, wd: ad.winddown || {} }; };
// Where dimming starts today: sunset plus the offset, kept between earliest and latest; without the sun, earliest.
function curveStart() {
  const { wd } = wdSettings(); const sunset = sunAt('sunset', wd.sunset_offset_min || 0);
  if (!sunset) return wd.earliest || '18:00';
  const m = clamp(hmMin(sunset), hmMin(wd.earliest || '18:00'), hmMin(wd.latest || '20:00'));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}
function curveLevelNow() {
  const s = S.config.settings; const { ad, wd } = wdSettings();
  if (!ad.enabled) return null;
  if (S.sun && S.sun.curve_level != null) return S.sun.curve_level;
  return winddownLevel(zparts(new Date()).hm, curveStart(), s.night_start, s.night_end, wd.from_level || 100, wd.to_level || 50, s.night_level || 30, wd.morning_level == null ? 100 : wd.morning_level, wd.morning_until || '07:30');
}
function windDownCaption() {
  const s = S.config.settings; const { wd } = wdSettings();
  if (!s.location) return `Without your home's location, dimming starts at ${fmtTime(wd.earliest || '18:00')}. <a data-act="loc-use" href="#">Use my location</a>`;
  return `Dimming starts after sunset and reaches its lowest at the quiet time. From then until ${fmtTime(s.night_end)}, on means ${s.night_level}%. Early mornings are soft too. This is also when night starts for your remotes.`;
}
// The Automations tab's row (2.12): the toggle at the right, the sheet behind the row itself.
function windDownRowHTML() {
  const s = S.config.settings; const { ad } = wdSettings(); const on = !!ad.enabled;
  const sub = on ? `Quiet from ${fmtTime(s.night_start)} · lights come on dimmer as the evening goes on.` : 'Lights you turn on come on a little dimmer late in the evening.';
  return `<div class="card pad0 list wd"><div class="item"><button class="auto-main" data-act="wd-open"><div class="grow"><div class="t">Evening wind-down</div><div class="d">${esc(sub)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button><button class="sw ${on ? 'on' : ''}" data-act="wd-toggle" aria-label="Evening wind-down on or off"></button></div></div>`;
}
const windDownCardHTML = windDownRowHTML;
// The wind-down sheet (2.15): the toggle, the sentence, and when on the quiet time, its caption and the Advanced row.
function openWindDownSheet() {
  const s = S.config.settings; const { ad } = wdSettings(); const on = !!ad.enabled;
  const body = `<div class="card pad0 list wd"><div class="item"><div class="grow"><div class="t">${on ? 'On' : 'Off'}</div></div><button class="sw ${on ? 'on' : ''}" data-act="wd-toggle" aria-label="Evening wind-down"></button></div></div>
    <p class="body" style="margin:16px 0 0">As the evening goes on, lights you turn on come on a little dimmer, so the house feels calmer late. Set a level yourself and it stays.</p>
    ${on ? `<div class="card pad0 list wd" style="margin-top:16px">${valueRow('When does the house go quiet?', esc(fmtTime(s.night_start)), 'wd-night')}</div>
    <p class="d" id="wd-cap" style="margin:8px 0 0">${windDownCaption()}</p>
    <div class="card pad0 list" style="margin-top:16px"><button class="item" data-act="wd-advanced"><div class="grow"><div class="t">Advanced: change the levels</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>` : ''}`;
  showSheet('wd', 'Evening wind-down', body, { detent: 'medium', top: true, grow: true });
}
// The Home caption while the curve is below full.
function windDownCaptionHTML() {
  const lv = curveLevelNow(); if (lv == null || lv >= 100) return '';
  return `<button class="d wd-home" data-act="nav" data-view="automations">Evening wind-down is on · lights come on dimmer this late</button>`;
}
// The quiet time moves the last evening point of the by-the-hour curve too, so both modes agree.
function rewriteEveningPoints(quiet) {
  const { ad } = wdSettings(); if (!Array.isArray(ad.points) || ad.points.length < 2) return;
  const pts = ad.points.slice().sort((a, b) => a.time.localeCompare(b.time));
  pts[pts.length - 1].time = quiet;
  ad.points = pts.filter((p, i) => i === pts.length - 1 || p.time < quiet);
  if (ad.points.length < 2) ad.points = pts.slice(-2);
}
function todaySentence() {
  const s = S.config.settings; const { wd } = wdSettings();
  return `Today: ${(wd.morning_level == null ? 100 : wd.morning_level) < 100 ? `soft until ${fmtTime(wd.morning_until || '07:30')}, ` : ''}full until ${fmtTime(curveStart())}, down to ${wd.to_level}% by ${fmtTime(s.night_start)}, then ${s.night_level}% until ${fmtTime(s.night_end)}.`;
}
function openWindDownAdvanced() {
  const s = S.config.settings; const { wd } = wdSettings();
  const chips = (k, vals, cur) => `<div class="chips" style="flex-basis:100%;margin-top:6px">${vals.map(([v, l]) => `<button class="chip sm ${cur === v ? 'sel' : ''}" data-act="wd-set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const row = (t, d, inner) => `<div class="item" style="flex-wrap:wrap"><div class="grow"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div>${inner}</div>`;
  const body = `<div class="card pad0 list">
    ${row('Early morning', `before ${fmtTime(wd.morning_until || '07:30')}`, chips('morning_level', [[40, '40%'], [60, '60%'], [100, '100%']], wd.morning_level))}
    ${row('Start dimming', '', chips('sunset_offset_min', [[0, 'At sunset'], [30, '30 min after sunset'], [60, '1 hour after sunset']], wd.sunset_offset_min))}
    ${row('Down to', 'by an hour before the house goes quiet', chips('to_level', [[60, '60%'], [50, '50%'], [40, '40%']], wd.to_level))}
    ${row('At night', 'when the house is quiet, until night ends', chips('night_level', [[35, '35%'], [25, '25%'], [15, '15%']], s.night_level))}
    ${valueRow('Night ends', esc(fmtTime(s.night_end)), 'wd-night-adv')}
  </div>
  <div class="tip" style="margin-top:16px"><div class="grow"><span class="cap">Today</span><div class="t" id="wd-today">${esc(todaySentence())}</div></div></div>
  <div class="card pad0 list" style="margin-top:16px"><div class="item"><div class="grow"><div class="t">Also gently lower lights nobody has touched for 20 minutes</div><div class="d">Over a minute, only lights above the curve. Turn it off if it ever fights you.</div></div><button class="sw ${wd.nudge ? 'on' : ''}" data-act="wd-nudge" aria-label="Gently lower untouched lights"></button></div>
    <button class="item" data-act="wd-curve"><div class="grow"><div class="t">Curve by the hour</div><div class="d">Set the level for each time of day yourself</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>
  <p class="d" style="margin:16px 0 0">Task lights (counters, desks, mirrors) are never dimmed. Pressing a top button twice is always full brightness.</p>`;
  showSheet('wd-adv', 'Evening wind-down', body, { detent: 'medium', sub: 'The numbers behind the curve.', back: true, onBack: openWindDownSheet });
}
function wdSet(k, v) {
  const s = S.config.settings; const { wd } = wdSettings(); v = Number(v);
  const msg = { morning_level: `Early morning: ${v}%`, sunset_offset_min: v ? `Dimming starts ${v} minutes after sunset` : 'Dimming starts at sunset', to_level: `Down to ${v}%`, night_level: `At night: ${v}%` }[k];
  if (k === 'night_level') s.night_level = v; else wd[k] = v;
  save({ msg, render: false }); openWindDownAdvanced();
}
const LEVEL_OPTS = [100, 90, 80, 70, 60, 50, 40, 35, 30, 25, 20, 15, 10, 5];
function openCurveSheet() {
  const { ad } = wdSettings();
  const pts = ad.points || [];
  const rows = pts.map((p, i) => `<div class="item"><input type="time" value="${p.time}" data-pt="${i}" data-k="time" aria-label="Time" style="text-align:left;width:104px;flex:none"><div class="grow" style="min-width:0"></div><select class="input" data-pt="${i}" data-k="level" style="width:100px;flex:none;min-height:40px;padding:6px 32px 6px 10px">${LEVEL_OPTS.map(v => `<option value="${v}" ${p.level === v ? 'selected' : ''}>${v}%</option>`).join('')}</select><button class="iconbtn plain sm" data-act="wd-pt-remove" data-i="${i}" ${pts.length <= 2 ? 'disabled' : ''} aria-label="Remove">${ICON('trash', 'sm')}</button></div>`).join('');
  const body = `<div class="chips">${[['winddown', 'Follow the sun'], ['points', 'By the hour']].map(([v, l]) => `<button class="chip ${ad.mode === v ? 'sel' : ''}" data-act="wd-mode" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="d" style="margin:12px 0 0">${ad.mode === 'points' ? 'What "on" means at each time of day; between two times it slides from one to the next, and after the last one it holds until the first.' : 'Following the sun uses the levels on the previous sheet. Switch to "By the hour" to draw the curve yourself.'}</p>
    <div class="card pad0 list" style="margin-top:12px">${rows}<button class="item" data-act="wd-pt-add"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Add a time</div></div></button></div>`;
  showSheet('wd-curve', 'Curve by the hour', body, { detent: 'large', sub: 'The level for "on", hour by hour.', back: true, onBack: openWindDownAdvanced });
}

// ---------- roles and moods (7) ----------
const MOOD_ORDER = ['bright', 'relax', 'dinner', 'movie', 'night'];
const ROLE_CHIPS = [['ambient', 'Main'], ['task', 'Task'], ['accent', 'Lamps'], ['decor', 'Decor']];
function guessRole(name) {
  const n = (name || '').toLowerCase();
  if (/under|cabinet|vanity|desk|island|counter/.test(n)) return 'task';
  if (/lamp|sconce|picture|cove|toe/.test(n)) return 'accent';
  if (/shelf|string|display/.test(n)) return 'decor';
  return 'ambient';
}
function roomMoodPresets(aid) { return MOOD_ORDER.map(m => presets().find(p => p.area === aid && p.mood === m)).filter(Boolean); }
const roomHasMoods = aid => roomMoodPresets(aid).length > 0;
const presetMax = p => Math.max(0, ...Object.values(p.levels || {}).map(levelOf));
// Write (or refresh) the five moods of a room as ordinary scenes. A mood the person changed is left alone.
function makeMoods(aid) {
  let made = 0, kept = 0;
  for (const m of MOODS) {
    const p = presets().find(x => x.area === aid && x.mood === m.id);
    if (p && p.edited) { kept++; continue; }
    const name = `${areaName(aid)} · ${m.name}`.slice(0, 60);
    if (p) { p.levels = moodLevels(aid, m); p.fade = m.fade; p.name = name; }
    else S.config.presets.push({ id: uid(), name, levels: moodLevels(aid, m), fade: m.fade, area: aid, mood: m.id, edited: false });
    made++;
  }
  return { made, kept };
}
let RS = null;
function openRolesSheet(aid, opts = {}) {
  const ds = roomLights(aid); if (!ds.length) return;
  const roles = {}; for (const d of ds) roles[d.device_id] = lightRole(d.device_id) || guessRole(d.name);
  RS = { aid, roles, walk: opts.walk || null, after: opts.after || null, back: opts.back || null };
  sheet.onClose = () => { RS = null; SHEET_KEY = null; };
  renderRolesSheet();
}
function renderRolesSheet() {
  const { aid, roles } = RS; const ds = roomLights(aid); const has = roomHasMoods(aid);
  const rows = ds.map(d => `<div class="item" style="flex-wrap:wrap"><div class="grow"><div class="t">${esc(d.name)}</div>${d.domain === 'switch' ? '<div class="d">On or off only: on in Bright, off in the others.</div>' : ''}</div><div class="chips" style="flex-basis:100%;margin-top:6px">${ROLE_CHIPS.map(([r, l]) => `<button class="chip ${roles[d.device_id] === r ? 'sel' : ''}" data-act="rl-pick" data-id="${d.device_id}" data-r="${r}">${l}</button>`).join('')}</div></div>`).join('');
  const walk = RS.walk; const nextAid = walk ? walk[walk.indexOf(aid) + 1] : null;
  const body = `<p class="d">Main is the ceiling light. Task is where hands work. Lamps are for atmosphere. Decor is lit to be looked at.</p>
    <div class="card pad0 list" style="margin-top:12px">${rows}</div>
    <div class="sfoot"><button class="btn primary lg block" data-act="rl-make">${has ? 'Update moods' : 'Make moods'}</button>${walk ? `<button class="btn ghost block" data-act="rl-skip">${nextAid ? `Next: ${esc(areaName(nextAid))}` : 'Skip this room'}</button>` : ''}</div>`;
  void ds;
  showSheet('roles', `What kind of light is each one in the ${esc(areaName(aid))}?`, body, { detent: 'medium', sub: 'We guessed from the names. Fix any that are wrong.', back: !!RS.back, onBack: RS.back, cap: walk ? `Room ${walk.indexOf(aid) + 1} of ${walk.length}` : '', top: true });
}
function rolesMake() {
  const { aid, roles, walk } = RS; const s = S.config.settings; s.roles = s.roles || {};
  for (const [id, r] of Object.entries(roles)) s.roles[id] = r;
  const had = roomHasMoods(aid); const { kept } = makeMoods(aid);
  const room = areaName(aid);
  const msg = had ? `${room}'s moods updated${kept ? ` · ${kept} kept as you changed ${kept === 1 ? 'it' : 'them'}` : ''}` : `${room} has five moods`;
  rolesAdvance(walk, aid, msg);
}
// In the walk, the next room's sheet follows; otherwise the sheet closes and whatever asked for moods gets them.
function rolesAdvance(walk, aid, msg) {
  const nextAid = walk ? walk[walk.indexOf(aid) + 1] : null; const after = RS.after;
  if (nextAid) { if (msg) save({ msg, render: true }); RS = null; openRolesSheet(nextAid, { walk, after }); return; }
  RS = null; closeSheet();
  if (msg) save({ msg });
  if (after) setTimeout(after, msg ? 0 : 350);
}
// Rooms the moods walk visits: every room with two or more lights. (The Home tip that offered it is now the Next card, next.js.)
function moodsWalkRooms() { return lightRooms().filter(a => roomLights(a.id).length >= 2).map(a => a.id); }
// The Scenes tab's "Room moods" section: one row per room that has them.
function roomMoodsSectionHTML() {
  const rooms = lightRooms().filter(a => roomHasMoods(a.id)); if (!rooms.length) return '';
  return `<div class="gh">Room moods</div><div class="card pad0 list">${rooms.map(a => { const ps = roomMoodPresets(a.id); const ch = ps.filter(p => p.edited).length; return `<button class="item" data-act="rm-open" data-area="${a.id}">${lampHTML(targetOn(`a:${a.id}`) ? roomMean(a.id) : 0, 40, ICON(roomIcon(a.name), 'sm'))}<div class="grow"><div class="t">${esc(a.name)}</div><div class="d">${plural(ps.length, 'mood')}${ch ? ` · ${ch} changed by you` : ''}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`; }).join('')}</div>`;
}
// `back` is a route name, so a sheet opened from the room setup page can walk back to the one that opened it.
// 'room-more' is the old name of the room setup page, which is a page now: there is nothing to go back to in a sheet.
function backTo(name, aid) { return name === 'roommoods' ? () => openRoomMoodsSheet(aid) : null; }
function openRoomMoodsSheet(aid, opts = {}) {
  const ps = roomMoodPresets(aid); const ch = ps.filter(p => p.edited).length;
  const rows = ps.map(p => { const m = moodById(p.mood); return `<div class="item"><button class="ic" data-act="run-scene" data-t="p:${p.id}" title="Run" aria-label="Run ${esc(m.name)}">${ICON('play', 'sm')}</button><div class="grow"><div class="t">${esc(m.name)}</div><div class="d">${p.edited ? 'Changed by you' : 'Suggested'} · ${plural(Object.keys(p.levels).length, 'light')}</div></div><button class="iconbtn plain" data-act="scene-edit" data-id="${p.id}" data-back="roommoods" data-area="${aid}" title="Edit" aria-label="Edit ${esc(m.name)}">${ICON('edit', 'sm')}</button></div>`; }).join('');
  const body = `<div class="card pad0 list">${rows}</div><div class="card pad0 list" style="margin-top:16px"><button class="item" data-act="rl-open" data-area="${aid}" data-back="roommoods">${ICON('dots')}<div class="grow"><div class="t">Change what each light is for</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  const back = backTo(opts.back, aid);
  showSheet('roommoods', `${esc(areaName(aid))} moods`, body, { detent: 'medium', sub: `${plural(ps.length, 'mood')}${ch ? ` · ${ch} changed by you` : ''}`, back: !!back, onBack: back });
}

// ---------- events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    // the list
    case 'au-new': openNewAutomation(); break;
    case 'au-open': { const sc = scById(d.id); if (!sc) break; if (sc.at.type !== 'time' && !S.config.settings.location) { openEditor(sc.id); openWhenSheet('at'); } else openEditor(sc.id); break; }
    case 'au-toggle': { const sc = scById(d.id); if (sc) setEnabled(sc, sc.enabled === false); break; }
    case 'au-skip': { const sc = scById(d.id); if (sc) doSkip(sc, d.date); break; }
    case 'au-unskip': { const sc = scById(d.id); if (sc) unSkip(sc); break; }
    // the swipe's delete: the same confirm the editor's Delete row uses
    case 'au-swipe-delete': { const sc = scById(d.id); if (sc) confirmDeleteAutomation(sc); break; }
    case 'au-delete-yes': deleteAutomation(d.id); break;
    case 'tz-keep': try { localStorage.setItem('tzKeep', `${S.config.settings.timezone}|${phoneTZ()}`); } catch (_) { /* ignore */ } render(); break;
    case 'tz-phone': S.config.settings.timezone = phoneTZ(); save({ msg: `Following this phone's clock` }); break;
    // the editor
    case 'ae-new': openNewAutoWalk(); break;
    case 'ae-when': openWhenSheet('at'); break;
    case 'ae-off': openWhenSheet('off'); break;
    case 'ae-exp': AE.exp[d.k] = !AE.exp[d.k]; renderEditor(); break;
    case 'ae-what': openWhatSheet(); break;
    case 'ae-target': aeToggleTarget(d.t); break;
    case 'ae-target-more': openTargetPicker([...AE.L, ...AE.Sh], list => { const { L, Sh } = splitT(list); aeSetTargets(L, Sh); }, renderEditor, { shades: true }); break;
    case 'ae-recipe': aeApplyRecipe(d.r); break;
    // the new-automation walk
    case 'nw-target': { const all = [...NW.L, ...NW.Sh]; const i = all.indexOf(d.t); const next = i >= 0 ? all.filter(x => x !== d.t) : normalizeTargets([...all, d.t], d.t); const { L, Sh } = splitT(next); NW.L = L; NW.Sh = Sh; renderSetup(); break; }
    case 'nw-target-more': SHEET_KEY = 'nw-pick'; openTargetPicker([...NW.L, ...NW.Sh], list => { const { L, Sh } = splitT(list); NW.L = L; NW.Sh = Sh; renderSetup(); }, renderSetup, { shades: true }); break;
    case 'nw-scene': { const it = NW.scenePick[Number(d.i)]; if (!it) break; NW.sceneAct = it.a; NW.rid = 'scene'; walkAdvance(WALK.cur); break; }
    case 'nw-off-use': nwOffUse(); break;
    case 'nw-day': setDay(NW.days, Number(d.d), NW); renderSetup(); break;
    case 'nw-days': NW.days = [...QUICK_DAYS[d.v]]; NW.dayWarn = false; renderSetup(); break;
    case 'nw-name': NW.nameOpen = !NW.nameOpen; renderSetup(); if (NW.nameOpen) { const i = $('#nw-name'); if (i) i.focus(); } break;
    case 'ae-scene': { const it = AE.scenePick[Number(d.i)]; if (!it) break; const sc = aeSc(); sc.actions = [it.a]; const off = aeOff(); if (off) off.actions = makePair(sc, off.at, AE.L, AE.Sh).actions; aeSave(); break; }
    case 'ae-day': { const sc = aeSc(); setDay(sc.days, Number(d.d), AE); if (AE.dayWarn) renderEditor(); else aeSave(`Runs ${daysText(sc.days).replace(/^Every/, 'every')}`); break; }
    case 'ae-days': { const sc = aeSc(); sc.days = [...QUICK_DAYS[d.v]]; AE.dayWarn = false; aeSave(`Runs ${daysText(sc.days).replace(/^Every/, 'every')}`); break; }
    case 'ae-try': aeTry(); break;
    case 'ae-skip': { const sc = aeSc(); if (skipping(sc)) unSkip(sc); else doSkip(sc); setTimeout(renderEditor, 50); break; }
    case 'ae-more': openMoreSheet(); break;
    case 'ae-finetune': aeFineTune(); break;
    case 'ae-delete': aeDelete(); break;
    // the When sheet and the location step
    case 'wh-type': WH.type = d.v; renderWhenSheet(); break;
    case 'wh-rel': WH.rel = d.v; renderWhenSheet(); break;
    case 'wh-mins': WH.mins = Number(d.v); renderWhenSheet(); break;
    case 'wh-use': whUse(); break;
    case 'wh-leave': whLeave(); break;
    case 'loc-use': e.preventDefault(); useMyLocation(); break;
    case 'loc-city': e.preventDefault(); openCityPicker(); break;
    case 'city-pick': pickCity(Number(d.i)); break;
    // guided setups
    case 'gs-welcome': openWelcomeSetup(); break;
    case 'gs-wakeup': openWakeupSetup(); break;
    case 'gs-buttons': openButtonsSetup(); break;
    case 'gs-target': { const i = GS.targets.indexOf(d.t); if (i >= 0) GS.targets.splice(i, 1); else GS.targets = normalizeTargets([...GS.targets, d.t], d.t); renderSetup(); break; }
    case 'gs-target-more': SHEET_KEY = 'gs-pick'; openTargetPicker(GS.targets, list => { GS.targets = list; renderSetup(); }, renderSetup); break;
    case 'gs-shade': { const i = GS.shades.indexOf(d.t); if (i >= 0) GS.shades.splice(i, 1); else GS.shades.push(d.t); renderSetup(); break; }
    case 'gs-level': GS.level = Number(d.v); renderSetup(); break;
    case 'gs-offset': GS.offset = Number(d.v); renderSetup(); break;
    case 'gs-lamp-more': openLampPicker(); break;
    case 'gs-lamp-pick': if (WALK.cur) walkPick(WALK.cur, d.id); break;
    case 'gs-day': setDay(GS.days, Number(d.d), GS); renderSetup(); break;
    case 'gs-days': GS.days = [...QUICK_DAYS[d.v]]; GS.dayWarn = false; renderSetup(); break;
    case 'gs-minutes': GS.minutes = Number(d.v); renderSetup(); break;
    case 'gs-end': GS.end = Number(d.v); renderSetup(); break;
    case 'gs-gn-button': GS.gn.button = Number(d.n); renderSetup(); break;
    case 'gs-gn-path': { const i = GS.gn.path.indexOf(d.t); if (i >= 0) GS.gn.path.splice(i, 1); else GS.gn.path = normalizeTargets([...GS.gn.path, d.t], d.t); renderSetup(); break; }
    case 'gs-lv-button': GS.lv.button = Number(d.n); renderSetup(); break;
    case 'gs-save': if (!GS) break; if (GS.kind === 'welcome') saveWelcome(GS); else if (GS.kind === 'wakeup') saveWakeup(GS); else saveButtons(GS); break;
    // wind-down
    case 'wd-open': openWindDownSheet(); break;
    case 'wd-toggle': { const { ad } = wdSettings(); ad.enabled = !ad.enabled; save({ msg: ad.enabled ? 'Evening wind-down is on' : 'Evening wind-down is off', render: S.view === 'automations' || S.view === 'home' }); if (sheet.isOpen() && SHEET_KEY === 'wd') openWindDownSheet(); break; }
    case 'wd-advanced': openWindDownAdvanced(); break;
    // the hours belong to the house: both rows open Settings' own Night sheet, with a back arrow to here
    case 'wd-night': openNightSheet({ back: openWindDownSheet }); break;
    case 'wd-night-adv': openNightSheet({ back: openWindDownAdvanced }); break;
    case 'wd-set': wdSet(d.k, d.v); break;
    case 'wd-nudge': { const { wd } = wdSettings(); wd.nudge = !wd.nudge; el.classList.toggle('on', wd.nudge); save({ msg: wd.nudge ? 'Untouched lights will lower gently' : 'Untouched lights are left alone', render: false }); break; }
    case 'wd-curve': openCurveSheet(); break;
    case 'wd-mode': { const { ad } = wdSettings(); ad.mode = d.v; save({ msg: d.v === 'points' ? 'Following the curve by the hour' : 'Following the sun', render: false }); openCurveSheet(); break; }
    case 'wd-pt-add': { const { ad } = wdSettings(); const last = ad.points[ad.points.length - 1]; ad.points.push({ time: hmAdd(last ? last.time : '20:00', 60), level: last ? last.level : 50 }); ad.points.sort((a, b) => a.time.localeCompare(b.time)); save({ quiet: true, render: false }); openCurveSheet(); break; }
    case 'wd-pt-remove': { const { ad } = wdSettings(); if (ad.points.length > 2) { ad.points.splice(Number(d.i), 1); save({ quiet: true, render: false }); openCurveSheet(); } break; }
    // roles and moods
    // "Give this room moods" also lives inside the Room sheet now: when that is what is open, both the back
    // arrow and the finished flow land back on the room's own screen, redrawn, instead of closing past it.
    case 'roles-open': case 'rl-open': {
      const fromRoom = SHEET_KEY === 'room' && typeof renderRoomSheet === 'function';
      const back = d.back ? backTo(d.back, d.area) : (fromRoom ? () => renderRoomSheet() : null);
      openRolesSheet(d.area, { back, after: fromRoom ? () => renderRoomSheet() : null });
      break;
    }
    case 'rl-pick': RS.roles[d.id] = d.r; renderRolesSheet(); break;
    case 'rl-make': rolesMake(); break;
    case 'rl-skip': rolesAdvance(RS.walk, RS.aid, null); break;
    case 'moods-walk': { const walk = moodsWalkRooms(); if (walk.length) openRolesSheet(walk[0], { walk }); break; }
    case 'rm-open': openRoomMoodsSheet(d.area, { back: d.back }); break;
  }
});
document.addEventListener('change', e => {
  const el = e.target; const d = el.dataset;
  if (el.id === 'wh-time' && WH) { WH.time = el.value || WH.time; return; }
  if (el.id === 'gs-until-time' && GS) { GS.untilTime = el.value || GS.untilTime; renderSetup(); return; }
  if (el.id === 'gs-alarm' && GS) { GS.alarm = el.value || GS.alarm; renderSetup(); return; }
  if (el.id === 'gs-low' && GS) { GS.low = el.checked; renderSetup(); return; }
  if (el.id === 'nw-name' && NW) { const v = el.value.trim(); NW.name = v; NW.customName = !!v; renderSetup(); return; }
  if (el.id === 'ae-name' && AE) { const sc = aeSc(); const v = el.value.trim(); const auto = autoName(sc, AE.L, AE.Sh, !!aeOff()); sc.name = v || auto; AE.customName = !!v && v !== auto; syncPair(sc); if (AE.draftOff) AE.draftOff.name = sc.name; aeSaveSoon(); const h = $('#sheet-root .sh .sub'); if (h) h.textContent = sc.name; return; }
  if (el.id === 'ae-onlyif' && AE) { aeSc().only_if = el.value || null; aeSaveSoon(); return; }
  if (el.id === 'ae-fade' && AE) { const sc = aeSc(); for (const a of sc.actions) if (a.type === 'level') { if (el.value === '') delete a.fade; else a.fade = Number(el.value); } aeSaveSoon(); return; }
  if (d.pt != null) { const { ad } = wdSettings(); const p = ad.points[Number(d.pt)]; if (!p) return; if (d.k === 'time') { if (/^\d\d:\d\d$/.test(el.value)) p.time = el.value; } else p.level = Number(el.value); ad.points.sort((a, b) => a.time.localeCompare(b.time)); saveSoon(); return; }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'city-q') { const l = $('#city-list'); if (l) l.innerHTML = cityListHTML(el.value); }
});
