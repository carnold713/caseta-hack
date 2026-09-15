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
const lightRooms = () => areas().filter(a => controllable().some(d => (d.area || 'none') === a.id && d.domain !== 'cover'));
const dimmers = () => controllable().filter(d => d.domain === 'light');

function daysText(days) {
  const d = [...new Set(days || ALL_DAYS)].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '0,6') return 'Weekends';
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
    if (!controllable().length && !S.agent.online) return setupEmpty();
    let h = `<p class="body" style="margin:0 0 16px">Things your home does by itself. They keep running even when your phone is off.</p>`;
    if (!S.agent.online) h += `<div class="tip"><div class="grow"><span class="cap">Not connected</span><div class="t">Not connected right now</div><div class="d">Your home keeps running these on its own. This list may be a little behind.</div></div></div><div class="spacer"></div>`;
    h += tzTipHTML();
    h += windDownCardHTML();
    const list = topLevel();
    if (!list.length) return h + emptyStateHTML();
    h += `<div class="h2">Your automations</div><div class="card pad0 list" id="auto-list">${list.map(autoRowHTML).join('')}</div>`;
    h += `<div class="spacer"></div><div class="card pad0 list"><button class="item" data-act="au-new"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">New automation</div></div></button></div>`;
    h += `<p class="d" style="margin:16px 0 0">Have timers in the Lutron app? Keep them in one place, here or there, so they don't fight.</p>`;
    return h;
  },
};
function autoRowHTML(sc) {
  const off = pairOf(sc); const glyph = sc.at.type === 'sunrise' ? 'sun' : sc.at.type === 'sunset' ? 'moon' : 'clock';
  return `<div class="item auto ${sc.enabled === false ? 'paused' : ''}"><button class="auto-main" data-act="au-open" data-id="${esc(sc.id)}"><div class="ic">${ICON(glyph, 'sm')}</div><div class="grow"><div class="t">${esc(sc.name || 'Automation')}</div><div class="d">${esc(ruleLine(sc, off))}</div><div class="d" data-next="${esc(sc.id)}">${nextLineHTML(sc)}</div></div></button><button class="sw ${sc.enabled === false ? '' : 'on'}" data-act="au-toggle" data-id="${esc(sc.id)}" aria-label="On or off"></button></div>`;
}
function guidedRowsHTML() {
  const rows = [
    ['gs-welcome', 'moon', 'Welcome lights', 'On before you get home, off at bedtime'],
    dimmers().length ? ['gs-wakeup', 'bed', 'Wake-up light', 'A lamp rises slowly before your alarm'] : null,
    remotes().length ? ['gs-buttons', 'remote', 'Goodnight and Leaving buttons', 'One hold shuts the house down'] : null,
    ['ae-new', 'plus', 'Something else', 'Any lights, any time'],
  ].filter(Boolean);
  return `<div class="card pad0 list">${rows.map(([act, ic, t, d]) => `<button class="item" data-act="${act}">${ICON(ic)}<div class="grow"><div class="t">${t}</div><div class="d">${d}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}</div>`;
}
function emptyStateHTML() {
  return `<div class="h2">Your automations</div><div class="tip"><div class="grow"><span class="cap">Get started</span><div class="t">Let your home take care of the evenings</div><div class="d">Lights on before you get home, a lamp that wakes you gently, one button for goodnight. Each takes about a minute.</div></div><span class="go">${ICON('plus')}</span></div><div class="spacer"></div>${guidedRowsHTML()}`;
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
  const wc = $('#wd-cap'); if (wc) wc.innerHTML = windDownCaption();
  const wh = $('#wd-home'); if (wh) wh.innerHTML = windDownCaptionHTML();
  const wt = $('#wd-today'); if (wt) wt.textContent = todaySentence();
  if (WH && SHEET_KEY === 'when') renderWhenSheet();
  if (GS && SHEET_KEY === 'setup') renderSetup();
  if (AE && SHEET_KEY === 'editor') renderEditor();
}

// ---------- Home: Coming up ----------
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
  return `<div class="h2">Coming up<a class="link" data-act="nav" data-view="automations" href="#automations">See all</a></div><div class="card pad0 list">${rows.map(row).join('')}</div>`;
}

// ---------- sheets that re-render in place ----------
let SHEET_KEY = null;
// Same key while the sheet is open: swap the body and keep the scroll position; otherwise open afresh.
function showSheet(key, title, body, opts = {}) {
  const root = $('#sheet-root');
  if (SHEET_KEY === key && root.classList.contains('open') && root.classList.contains('in')) {
    const sb = root.querySelector('.sb'); const top = sb.scrollTop; sb.innerHTML = body; sb.scrollTop = top;
    const h = root.querySelector('.sh h2'); if (h) h.innerHTML = title;
    const sub = root.querySelector('.sh .sub'); if (sub && opts.sub) sub.innerHTML = opts.sub;
    sheet.onBack = opts.onBack || null; return;
  }
  SHEET_KEY = key; sheet.open(title, body, opts);
}
function closeSheet() { SHEET_KEY = null; sheet.close(); }

// ---------- New automation ----------
function openNewAutomation() {
  showSheet('new', 'What would you like to set up?', guidedRowsHTML(), { sub: 'Three ready-made ones, or start from scratch.' });
}

// ---------- the editor (4.1) ----------
let AE = null; // { id, draft, draftOff, isNew, L, Sh, customName, dayWarn }
const aeSc = () => (AE ? scById(AE.id) || AE.draft : null);
const aeInConfig = () => !!(AE && scById(AE.id));
const aeOff = () => (AE ? pairOf(aeSc()) || AE.draftOff : null);
function openEditor(id) {
  sheet.onClose = () => { AE = null; WH = null; S.advCustom = null; SHEET_KEY = null; };
  if (id && scById(id)) {
    const sc = scById(id); const { L, Sh } = splitT(targetsOf(sc));
    if (!L.length && !Sh.length && lightRooms()[0]) L.push(`a:${lightRooms()[0].id}`);
    AE = { id, draft: null, draftOff: null, isNew: false, L, Sh, customName: sc.name !== autoName(sc, L, Sh, !!pairOf(sc)), dayWarn: false };
  } else {
    const room = lightRooms()[0]; const L = room ? [`a:${room.id}`] : ['h:all'];
    const draft = { id: uid(), name: '', enabled: true, at: null, days: [...ALL_DAYS], actions: AUTO_RECIPES[0].mk(L, []), only_if: null, skip_until: null, kind: 'custom' };
    draft.name = autoName(draft, L, []);
    AE = { id: draft.id, draft, draftOff: null, isNew: true, L, Sh: [], customName: false, dayWarn: false };
  }
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
  const body = items.length ? `<div class="card pad0 list">${items.map((it, i) => `<button class="item" data-act="ae-scene" data-i="${i}"><div class="ic">${ICON('scene', 'sm')}</div><div class="grow"><div class="t">${esc(it.n)}</div><div class="d">${it.s}</div></div></button>`).join('')}</div>` : `<div class="empty"><h3>No scenes yet</h3><p>Make one on the Scenes tab first.</p></div>`;
  showSheet('ae-scene', 'Which scene?', body, { back: true, onBack: renderEditor });
}
function daysHTML(days, act, warn) {
  const quick = [['all', 'Every day', ALL_DAYS], ['weekdays', 'Weekdays', [1, 2, 3, 4, 5]], ['weekends', 'Weekends', [0, 6]]];
  return `<div class="chips days">${ALL_DAYS.map(i => `<button class="chip day ${days.includes(i) ? 'sel' : ''}" data-act="${act}-day" data-d="${i}" aria-label="${DAY_LONG[i]}" aria-pressed="${days.includes(i)}">${DAY_LETTER[i]}</button>`).join('')}</div>
  <div class="chips" style="margin-top:8px">${quick.map(([v, l, set]) => `<button class="chip sm ${set.join() === [...days].sort().join() ? 'sel' : ''}" data-act="${act}-days" data-v="${v}">${l}</button>`).join('')}</div>
  <p class="d" style="margin:8px 0 0">${warn ? 'Pick at least one day' : daysText(days)}</p>`;
}
function setDay(days, i, warnHost) { const j = days.indexOf(i); if (j >= 0) { if (days.length === 1) { warnHost.dayWarn = true; return; } days.splice(j, 1); } else days.push(i); warnHost.dayWarn = false; days.sort(); }
const QUICK_DAYS = { all: ALL_DAYS, weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };
function renderEditor() {
  const sc = aeSc(); if (!sc) return;
  const off = aeOff(); const { L, Sh } = AE; const inCfg = aeInConfig();
  const rid = autoRecipeOf(sc, L, Sh); const r = AUTO_RECIPES.find(x => x.id === rid);
  const fresh = AE.isNew && !sc.at;
  const title = fresh ? 'What should happen, and when?' : esc(sc.name);
  const sub = fresh ? 'Pick a time, the lights, and what they do. It saves as you go.' : esc(ruleLine(sc, off));
  const showOff = r ? (r.on || r.open) : leavesOn(sc.actions);
  const offLabel = r && r.open ? 'Then open again' : 'Then turn off again';
  const offVal = off ? whenValue(off.at) : (r && r.open ? 'Leave them closed' : 'Leave them on');
  const when = `<div class="card pad0 list"><button class="item" data-act="ae-when"><div class="grow"><div class="t">When?</div></div><span class="val">${sc.at ? esc(whenValue(sc.at)) : `<span class="odot"></span>Pick a time`}</span><span class="chev">${ICON('chev', 'sm')}</span></button>
    ${showOff ? `<button class="item" data-act="ae-off"><div class="grow"><div class="t">${offLabel}</div></div><span class="val">${esc(offVal)}</span><span class="chev">${ICON('chev', 'sm')}</span></button>` : ''}</div>`;
  const sel = [...L, ...Sh];
  const chipsT = [...sel, ...lightRooms().map(a => `a:${a.id}`), 'h:all', ...(hasShades() ? ['h:shades'] : [])].filter((v, i, arr) => arr.indexOf(v) === i && targetExists(v));
  const chipName = t => t === 'h:shades' ? 'All shades' : cap(targetName(t));
  const broken = (sc.actions || []).some(a => a.target && !targetExists(a.target));
  const which = `<div class="h2">Which lights?</div><div class="chips scroll">${chipsT.map(t => `<button class="chip ${sel.includes(t) ? 'sel' : ''}" data-act="ae-target" data-t="${esc(t)}">${sel.includes(t) ? ICON('check', 'sm') : ''}${esc(chipName(t))}</button>`).join('')}<button class="chip" data-act="ae-target-more">${ICON('dots', 'sm')}Specific lights…</button></div>
    ${broken ? `<p class="d" style="margin:8px 0 0"><span class="odot"></span>Points at something that is gone. Pick again.</p>` : sel.length > 1 ? `<p class="d" style="margin:8px 0 0">${esc(cap(targetName(packTarget(sel))))}</p>` : ''}`;
  const chk = `<span class="chk">${ICON('check', 'sm')}</span>`;
  const list = AUTO_RECIPES.filter(x => recipeApplies(x, L, Sh)).map(x => `<button class="item recipe ${rid === x.id ? 'sel' : ''}" data-act="ae-recipe" data-r="${x.id}"><div class="grow"><div class="t">${x.t}</div>${x.d ? `<div class="d">${x.d}</div>` : ''}</div>${rid === x.id ? chk : ''}</button>`).join('');
  const custom = rid === 'custom' ? `<div class="tip" style="margin-top:12px"><div class="grow"><span class="cap">Custom</span><div class="t">${esc(describe(sc.actions))}</div></div></div>` : '';
  const what = `<div class="h2">What should happen?</div><div class="card pad0 list">${list}</div>${custom}`;
  const days = `<div class="h2">Which days?</div>${daysHTML(sc.days, 'ae', AE.dayWarn)}`;
  const actions = `<div class="stack" style="margin-top:24px"><button class="btn block" data-act="ae-try">${ICON('play', 'sm')} Try it now</button>${inCfg ? `<button class="btn block" data-act="ae-skip">${esc(skipLabel(sc))}</button>` : ''}</div>
    <div class="card pad0 list" style="margin-top:16px"><button class="item" data-act="ae-more"><div class="grow"><div class="t">More options</div><div class="d">Name, skip it when, fade, fine-tune, delete</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  const foot = `<div class="sfoot"><button class="btn primary lg block" data-act="ae-done" ${sc.at ? '' : 'disabled'}>Done</button></div>`;
  showSheet('editor', title, `${when}${which}${what}${days}${actions}${foot}`, { sub });
}

// ---------- the When sheet (4.2) ----------
let WH = null; // { mode: 'at' | 'off', type, time, rel, mins }
function openWhenSheet(mode) {
  const sc = aeSc(); const cur = mode === 'off' ? (aeOff() || {}).at : sc.at;
  WH = { mode, type: cur ? cur.type : 'time', time: cur && cur.time ? cur.time : (mode === 'off' ? (S.config.settings.night_start || '22:00') : '18:00'), rel: cur && cur.offset_min ? (cur.offset_min < 0 ? 'before' : 'after') : 'at', mins: cur && cur.offset_min ? Math.abs(cur.offset_min) : 20 };
  renderWhenSheet();
}
function whAt() { const w = WH; return w.type === 'time' ? { type: 'time', time: w.time, offset_min: 0 } : { type: w.type, time: null, offset_min: w.rel === 'at' ? 0 : (w.rel === 'before' ? -w.mins : w.mins) }; }
function renderWhenSheet() {
  const w = WH; if (!w) return; const loc = S.config.settings.location;
  let body = `<div class="chips">${[['time', 'At a time'], ['sunset', 'Sunset'], ['sunrise', 'Sunrise']].map(([v, l]) => `<button class="chip ${w.type === v ? 'sel' : ''}" data-act="wh-type" data-v="${v}">${l}</button>`).join('')}</div>`;
  if (w.type === 'time') body += `<div class="when-time"><input type="time" class="time-big" id="wh-time" value="${w.time}" aria-label="Time"></div>`;
  else {
    body += `<div class="chips" style="margin-top:16px">${[['at', 'At'], ['before', 'Before'], ['after', 'After']].map(([v, l]) => `<button class="chip sm ${w.rel === v ? 'sel' : ''}" data-act="wh-rel" data-v="${v}">${l}</button>`).join('')}</div>`;
    if (w.rel !== 'at') body += `<div class="chips" style="margin-top:8px">${[10, 20, 30, 45, 60, 90].map(m => `<button class="chip sm ${w.mins === m ? 'sel' : ''}" data-act="wh-mins" data-v="${m}">${m}</button>`).join('')}</div>`;
    const at = whAt(); const hm = loc ? sunAt(at.type, at.offset_min) : null;
    body += `<p class="body" style="margin:16px 0 0">${cap(whenClause(at))}. ${hm ? `Today that's ${fmtTime(hm)}.` : loc ? "Today's time will show once your home is connected." : ''}</p>`;
    body += locationStepHTML();
  }
  const canUse = w.type === 'time' || !!loc;
  body += `<div class="sfoot"><button class="btn primary lg block" data-act="wh-use" ${canUse ? '' : 'disabled'}>Use this time</button>${w.mode === 'off' && aeOff() ? `<button class="btn ghost block" data-act="wh-leave">Leave them on</button>` : ''}</div>`;
  showSheet('when', w.mode === 'off' ? 'Turn off again when?' : 'When?', body, { sub: 'Pick a clock time, or follow the sun.', back: true, onBack: renderEditor });
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
const LOC = { denied: false, busy: false };
function locationStepHTML() {
  const loc = S.config.settings.location;
  if (loc) { const hm = sunAt('sunset', 0); return `<p class="d" style="margin:12px 0 0">Near ${esc(loc.name || 'your home')}${hm ? ` · sunset today ${fmtTime(hm)}` : ''} <a data-act="loc-city" href="#">Change</a></p>`; }
  return `<div class="tip top" style="margin-top:16px"><div class="grow"><span class="cap">Location</span><div class="t">Where is your home?</div><div class="d">${LOC.denied ? "Your phone didn't share its location. Pick the nearest city instead." : "Sunset moves through the year, so the app needs to know roughly where you are. It's kept on your own hub."}</div><div class="row wrap" style="margin-top:12px"><button class="btn sm primary" data-act="loc-use" ${LOC.busy ? 'disabled' : ''}>${LOC.busy ? 'Finding you…' : 'Use my location'}</button><button class="btn ghost" data-act="loc-city">Pick the nearest city instead</button></div></div></div>`;
}
// Whatever asked for the location is drawn again once it is known.
function locRepaint() {
  if (WH && SHEET_KEY === 'when') renderWhenSheet();
  else if (GS && SHEET_KEY === 'setup') renderSetup();
  else if (SHEET_KEY === 'city') { /* the picker closes itself */ }
  else if (!sheet.isOpen() || SHEET_KEY === null) render();
}
function locBack() { if (WH) renderWhenSheet(); else if (GS) renderSetup(); else { closeSheet(); render(); } }
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
  showSheet('city', 'Which city is nearest?', `<label class="field"><span>City</span><input class="input" id="city-q" placeholder="Type a city" autocomplete="off"></label><div id="city-list">${cityListHTML('')}</div>`, { sub: 'Sunset a hundred kilometres off is still within minutes.', back: true, onBack: locBack });
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
  showSheet('more', 'More options', body, { sub: esc(sc.name), back: true, onBack: renderEditor });
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
function roomMatches(t, re) { const aid = t.startsWith('a:') ? t.slice(2) : t.startsWith('d:') ? ((dev(t.slice(2)) || {}).area || 'none') : null; return !!aid && re.test(areaName(aid)); }
function openWelcomeSetup() {
  const pre = lightRooms().filter(a => OUTSIDE_RE.test(a.name)).map(a => `a:${a.id}`);
  GS = { kind: 'welcome', targets: pre, shades: [], until: 'bedtime', untilTime: '22:00', low: false, level: 60, offset: 20, more: false };
  sheet.onClose = () => { GS = null; SHEET_KEY = null; };
  renderSetup();
}
function openWakeupSetup() {
  const beds = dimmers().filter(d => BEDROOM_RE.test(areaName(d.area)));
  const lamp = beds.find(d => /lamp/i.test(d.name)) || beds[0] || dimmers()[0];
  GS = { kind: 'wakeup', lamp: lamp ? lamp.device_id : null, alarm: '06:30', days: [1, 2, 3, 4, 5], shade: false, minutes: 25, end: 50, dayWarn: false, more: false };
  sheet.onClose = () => { GS = null; SHEET_KEY = null; };
  renderSetup();
}
function openButtonsSetup() {
  const rs = remotes(); if (!rs.length) return;
  const bedRemote = rs.find(d => BEDROOM_RE.test(areaName(d.area))) || rs[0];
  const hallRemote = rs.find(d => HALL_RE.test(areaName(d.area))) || rs.find(d => d.device_id !== bedRemote.device_id) || rs[0];
  const path = groups().find(g => /night path/i.test(g.name));
  const hallRooms = lightRooms().filter(a => HALL_RE.test(a.name));
  const hallLights = controllable().filter(d => (d.domain === 'light' || d.domain === 'switch') && HALL_RE.test(areaName(d.area)));
  const door = hallLights[0] || controllable().find(d => d.domain === 'light' || d.domain === 'switch');
  const pathT = path ? [`g:${path.id}`] : hallRooms.length ? [`a:${hallRooms[0].id}`] : (lightRooms()[0] ? [`a:${lightRooms()[0].id}`] : []);
  GS = { kind: 'buttons', gn: { on: true, remote: bedRemote.device_id, button: defaultHoldButton(bedRemote), path: pathT }, lv: { on: true, remote: hallRemote.device_id, button: defaultHoldButton(hallRemote), door: door ? `d:${door.device_id}` : null } };
  sheet.onClose = () => { GS = null; SHEET_KEY = null; };
  renderSetup();
}
function defaultHoldButton(d) { const real = picoSlots(d).filter(s => s.real).map(s => s.n); return real.includes(2) ? 2 : real[real.length - 1]; }
function chip(act, label, sel, data = '') { return `<button class="chip ${sel ? 'sel' : ''}" data-act="${act}" ${data}>${sel ? ICON('check', 'sm') : ''}${label}</button>`; }
function renderSetup() {
  const g = GS; if (!g) return;
  if (g.kind === 'welcome') return renderWelcome(g);
  if (g.kind === 'wakeup') return renderWakeup(g);
  return renderButtons(g);
}
function welcomePreview(g) {
  if (!g.targets.length) return 'Pick at least one light.';
  const s = S.config.settings; const onHm = sunAt('sunset', -g.offset);
  const off = g.until === 'bedtime' ? `at ${fmtTime(s.night_start)}` : g.until === 'sunrise' ? `at sunrise${sunAt('sunrise') ? ` (${fmtTime(sunAt('sunrise'))})` : ''}` : `at ${fmtTime(g.untilTime)}`;
  const rel = g.offset ? `${g.offset} minutes before sunset` : 'at sunset';
  return onHm ? `Today: on at ${fmtTime(onHm)}, ${rel}. Off ${off}.` : `On ${rel}. Off ${off}.`;
}
function renderWelcome(g) {
  const s = S.config.settings; const loc = s.location;
  const chipsT = [...g.targets, ...lightRooms().map(a => `a:${a.id}`), 'h:all'].filter((v, i, arr) => arr.indexOf(v) === i && targetExists(v));
  let body = `<div class="h2">Which lights come on?</div><div class="chips scroll">${chipsT.map(t => chip('gs-target', esc(cap(targetName(t))), g.targets.includes(t), `data-t="${esc(t)}"`)).join('')}<button class="chip" data-act="gs-target-more">${ICON('dots', 'sm')}Specific lights…</button></div>`;
  const shades = controllable().filter(d => d.domain === 'cover');
  if (shades.length) body += `<div class="h2">Close any shades?</div><div class="chips">${shades.map(d => chip('gs-shade', esc(d.name), g.shades.includes(`d:${d.device_id}`), `data-t="d:${d.device_id}"`)).join('')}</div>`;
  body += `<div class="h2">Until when?</div><div class="chips">${chip('gs-until', `Bedtime (${fmtTime(s.night_start)})`, g.until === 'bedtime', 'data-v="bedtime"')}${chip('gs-until', 'Sunrise', g.until === 'sunrise', 'data-v="sunrise"')}${chip('gs-until', 'Pick a time', g.until === 'time', 'data-v="time"')}</div>`;
  if (g.until === 'time') body += `<div class="when-time"><input type="time" class="time-big" id="gs-until-time" value="${g.untilTime}" aria-label="Off at"></div>`;
  if (g.targets.some(t => roomMatches(t, OUTSIDE_RE))) body += `<label class="check" style="margin-top:16px"><input type="checkbox" class="cb" id="gs-low" ${g.low ? 'checked' : ''}><span>Leave the outside lights on low until morning</span></label>`;
  if (!loc) body += locationStepHTML();
  body += `<div class="tip" style="margin-top:16px"><div class="grow"><span class="cap">Preview</span><div class="t">${esc(welcomePreview(g))}</div></div></div>`;
  body += `<details class="more" data-more="1" ${g.more ? 'open' : ''}><summary>More options${ICON('chev', 'sm')}</summary><div><p class="d" style="margin:0 0 6px">Brightness ${g.level}%</p><div class="chips">${[40, 60, 80, 100].map(v => chip('gs-level', `${v}%`, g.level === v, `data-v="${v}"`)).join('')}</div><p class="d" style="margin:12px 0 6px">Comes on: ${g.offset ? `${g.offset} minutes before sunset` : 'at sunset'}</p><div class="chips">${[0, 10, 20, 30, 45].map(v => chip('gs-offset', v ? `${v} min before` : 'At sunset', g.offset === v, `data-v="${v}"`)).join('')}</div></div></details>`;
  body += `<div class="sfoot"><button class="btn primary lg block" data-act="gs-save" ${g.targets.length && loc ? '' : 'disabled'}>Turn it on</button></div>`;
  showSheet('setup', 'Welcome lights', body, { sub: 'Lights on before you reach the door, off at bedtime.' });
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
function renderWakeup(g) {
  const beds = dimmers().filter(d => BEDROOM_RE.test(areaName(d.area)));
  const lampD = g.lamp ? dev(g.lamp) : null;
  const shown = [...beds]; if (lampD && !shown.includes(lampD)) shown.unshift(lampD);
  let body = `<div class="h2">Which lamp?</div><div class="chips scroll">${shown.map(d => chip('gs-lamp', esc(d.name), g.lamp === d.device_id, `data-id="${d.device_id}"`)).join('')}<button class="chip" data-act="gs-lamp-more">${ICON('dots', 'sm')}Another light…</button></div>`;
  body += `<div class="h2">Wake up at</div><div class="when-time"><input type="time" class="time-big" id="gs-alarm" value="${g.alarm}" aria-label="Wake up at"></div>`;
  body += `<div class="h2">Which days?</div>${daysHTML(g.days, 'gs', g.dayWarn)}`;
  const shade = lampD ? controllable().find(d => d.domain === 'cover' && (d.area || 'none') === (lampD.area || 'none')) : null;
  if (shade) body += `<div class="card pad0 list" style="margin-top:16px"><div class="item"><div class="grow"><div class="t">Open the shade too</div><div class="d">${esc(shade.name)}, at the time you wake</div></div><button class="sw ${g.shade ? 'on' : ''}" data-act="gs-shade-tgl" aria-label="Open the shade too"></button></div></div>`;
  body += `<div class="tip" style="margin-top:16px"><div class="grow"><span class="cap">Preview</span><div class="t">${esc(wakeupPreview(g))}</div></div></div>`;
  body += `<details class="more" data-more="1" ${g.more ? 'open' : ''}><summary>More options${ICON('chev', 'sm')}</summary><div><p class="d" style="margin:0 0 6px">Takes</p><div class="chips">${[15, 25, 40].map(v => chip('gs-minutes', `${v} minutes`, g.minutes === v, `data-v="${v}"`)).join('')}</div><p class="d" style="margin:12px 0 6px">Ends at</p><div class="chips">${[30, 50, 70].map(v => chip('gs-end', `${v}%`, g.end === v, `data-v="${v}"`)).join('')}</div></div></details>`;
  body += `<div class="sfoot"><button class="btn primary lg block" data-act="gs-save" ${g.lamp ? '' : 'disabled'}>Turn it on</button></div>`;
  showSheet('setup', 'Wake-up light', body, { sub: 'One lamp rises slowly from dark to soft, ending at the time you pick.' });
}
function openLampPicker() {
  const rows = lightRooms().map(a => { const ds = dimmers().filter(d => (d.area || 'none') === a.id); if (!ds.length) return ''; return `<div class="h2">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => `<button class="item" data-act="gs-lamp-pick" data-id="${d.device_id}">${lampHTML(level(d.device_id) || 0, 28, '')}<div class="grow"><div class="t">${esc(d.name)}</div></div>${GS.lamp === d.device_id ? ICON('check', 'sm') : ''}</button>`).join('')}</div>`; }).join('');
  showSheet('lamp', 'Which light?', rows || '<div class="empty"><p>No dimmable lights found.</p></div>', { sub: 'A dimmer, so it can rise slowly.', back: true, onBack: renderSetup });
}
function saveWakeup(g) {
  if (!g.lamp) return;
  const lampD = dev(g.lamp); const room = lampD ? areaName(lampD.area) : 'Bedroom';
  const base = { enabled: true, days: [...g.days], skip_until: null, kind: 'wakeup' };
  const list = [{ ...base, id: uid(), name: 'Wake-up light', at: { type: 'time', time: hmAdd(g.alarm, -g.minutes), offset_min: 0 }, actions: [{ type: 'level', target: `d:${g.lamp}`, level: g.end, fade: g.minutes * 60 }], only_if: 'all_off' }];
  const shade = lampD && g.shade ? controllable().find(d => d.domain === 'cover' && (d.area || 'none') === (lampD.area || 'none')) : null;
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
function renderButtons(g) {
  const rs = remotes();
  const remoteChips = (act, cur) => `<div class="chips scroll">${rs.map(d => chip(act, esc(d.name), cur === d.device_id, `data-id="${d.device_id}"`)).join('')}</div>`;
  // the chosen button first, so "Hold Off" is in view on a five-button remote
  const buttonChips = (act, pid, cur) => { const d = dev(pid); if (!d) return ''; const ns = picoSlots(d).filter(s => s.real).map(s => s.n).sort((a, b) => (a === cur ? -1 : b === cur ? 1 : a - b)); return `<div class="chips scroll">${ns.map(n => chip(act, `Hold ${esc(buttonLabel(pid, n))}`, cur === n, `data-n="${n}"`)).join('')}</div>`; };
  const replaces = (pid, n) => { const acts = gestureActions(pid, n, 'hold'); return acts.length ? `<p class="d" style="margin:8px 0 0">This replaces: ${esc(describe(acts))}</p>` : ''; };
  const card = (key, title, sub, inner) => `<div class="card"><div class="row"><div class="grow"><div class="t">${title}</div><div class="d">${sub}</div></div><button class="sw ${g[key].on ? 'on' : ''}" data-act="gs-card" data-k="${key}" aria-label="Set this up"></button></div>${g[key].on ? inner : ''}</div>`;
  const gnLights = [...g.gn.path, ...groups().filter(x => /night path/i.test(x.name)).map(x => `g:${x.id}`), ...lightRooms().map(a => `a:${a.id}`)].filter((v, i, arr) => arr.indexOf(v) === i && targetExists(v));
  const gn = `<p class="d" style="margin:12px 0 6px">Which remote?</p>${remoteChips('gs-gn-remote', g.gn.remote)}<p class="d" style="margin:12px 0 6px">Which button?</p>${buttonChips('gs-gn-button', g.gn.remote, g.gn.button)}${replaces(g.gn.remote, g.gn.button)}<p class="d" style="margin:12px 0 6px">Which lights light the way to bed?</p><div class="chips scroll">${gnLights.map(t => chip('gs-gn-path', esc(cap(targetName(t))), g.gn.path.includes(t), `data-t="${esc(t)}"`)).join('')}</div>`;
  const doorLights = controllable().filter(d => d.domain === 'light' || d.domain === 'switch').sort((a, b) => (HALL_RE.test(areaName(b.area)) ? 1 : 0) - (HALL_RE.test(areaName(a.area)) ? 1 : 0));
  const lv = `<p class="d" style="margin:12px 0 6px">Which remote?</p>${remoteChips('gs-lv-remote', g.lv.remote)}<p class="d" style="margin:12px 0 6px">Which button?</p>${buttonChips('gs-lv-button', g.lv.remote, g.lv.button)}${replaces(g.lv.remote, g.lv.button)}<p class="d" style="margin:12px 0 6px">Which light is by the door?</p><div class="chips scroll">${doorLights.map(d => chip('gs-lv-door', esc(d.name), g.lv.door === `d:${d.device_id}`, `data-t="d:${d.device_id}"`)).join('')}</div>`;
  let body = `<div class="stack" style="margin-top:8px">${card('gn', 'Goodnight', 'Set this up', gn)}${card('lv', 'Leaving', 'Set this up', lv)}</div>`;
  body += `<div class="tip" style="margin-top:16px"><div class="grow"><span class="cap">Preview</span><div class="t">${esc(buttonsPreview(g))}</div></div></div>`;
  const ok = (g.gn.on && g.gn.remote) || (g.lv.on && g.lv.remote);
  body += `<div class="sfoot"><button class="btn primary lg block" data-act="gs-save" ${ok ? '' : 'disabled'}>Set up the buttons</button></div>`;
  showSheet('setup', 'Goodnight and Leaving', body, { sub: 'One hold on a remote shuts the house down and leaves one light on for a moment.' });
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
  return `Dimming starts after sunset and is lowest here. From then until ${fmtTime(s.night_end)}, on means ${s.night_level}%. Early mornings are soft too.`;
}
function windDownCardHTML() {
  const s = S.config.settings; const { ad } = wdSettings(); const on = !!ad.enabled;
  return `<div class="card wd"><div class="row"><div class="grow"><div class="t">Evening wind-down</div></div><button class="sw ${on ? 'on' : ''}" data-act="wd-toggle" aria-label="Evening wind-down"></button></div>
    <p class="body" style="margin:8px 0 0">As the evening goes on, lights you turn on come on a little dimmer, so the house feels calmer late. Set a level yourself and it stays.</p>
    ${on ? `<div class="row" style="margin-top:16px"><div class="grow"><div class="t">When does the house go quiet?</div></div><input type="time" class="wd-time" value="${s.night_start}" data-wd="night_start" aria-label="When does the house go quiet?"></div>
    <p class="d" id="wd-cap" style="margin:8px 0 0">${windDownCaption()}</p>
    <button class="btn ghost" data-act="wd-advanced" style="margin-top:8px">Advanced: change the levels</button>` : ''}</div>`;
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
    <div class="item"><div class="grow"><div class="t">Night ends</div></div><input type="time" value="${s.night_end}" data-wd="night_end" aria-label="Night ends"></div>
  </div>
  <div class="tip" style="margin-top:16px"><div class="grow"><span class="cap">Today</span><div class="t" id="wd-today">${esc(todaySentence())}</div></div></div>
  <div class="card pad0 list" style="margin-top:16px"><div class="item"><div class="grow"><div class="t">Also gently lower lights nobody has touched for 20 minutes</div><div class="d">Over a minute, only lights above the curve. Turn it off if it ever fights you.</div></div><button class="sw ${wd.nudge ? 'on' : ''}" data-act="wd-nudge" aria-label="Gently lower untouched lights"></button></div>
    <button class="item" data-act="wd-curve"><div class="grow"><div class="t">Curve by the hour</div><div class="d">Set the level for each time of day yourself</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  showSheet('wd-adv', 'Evening wind-down', body, { sub: 'The numbers behind the curve. Task lights (counters, desks, mirrors) are never dimmed, and pressing a top button twice is always full brightness.' });
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
  const rows = pts.map((p, i) => `<div class="item"><input type="time" value="${p.time}" data-pt="${i}" data-k="time" aria-label="Time" style="text-align:left;width:110px"><div class="grow"></div><select class="input" data-pt="${i}" data-k="level" style="width:90px;min-height:40px;padding:6px 32px 6px 12px">${LEVEL_OPTS.map(v => `<option value="${v}" ${p.level === v ? 'selected' : ''}>${v}%</option>`).join('')}</select><button class="iconbtn plain sm" data-act="wd-pt-remove" data-i="${i}" ${pts.length <= 2 ? 'disabled' : ''} aria-label="Remove">${ICON('trash', 'sm')}</button></div>`).join('');
  const body = `<div class="chips">${[['winddown', 'Follow the sun'], ['points', 'By the hour']].map(([v, l]) => `<button class="chip ${ad.mode === v ? 'sel' : ''}" data-act="wd-mode" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="d" style="margin:12px 0 0">${ad.mode === 'points' ? 'What "on" means at each time of day; between two times it slides from one to the next, and after the last one it holds until the first.' : 'Following the sun uses the levels on the previous sheet. Switch to "By the hour" to draw the curve yourself.'}</p>
    <div class="card pad0 list" style="margin-top:12px">${rows}<button class="item" data-act="wd-pt-add"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Add a time</div></div></button></div>`;
  showSheet('wd-curve', 'Curve by the hour', body, { sub: 'The level for "on", hour by hour.', back: true, onBack: openWindDownAdvanced });
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
const presetMax = p => Math.max(0, ...Object.values(p.levels || {}).map(v => (typeof v === 'number' ? v : (v && v !== 'Off' ? 100 : 0))));
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
  const body = `<p class="d">Main is the ceiling. Task is where hands work: counters, desks, mirrors. Lamps are lamps, sconces and anything for atmosphere. Decor is lit to be looked at: a lit shelf, cabinet interiors, string lights.</p>
    <div class="card pad0 list" style="margin-top:12px">${rows}</div>
    <div class="sfoot"><button class="btn primary lg block" data-act="rl-make">${has ? 'Update moods' : 'Make moods'}</button>${walk ? `<button class="btn ghost block" data-act="rl-skip">${nextAid ? `Next: ${esc(areaName(nextAid))}` : 'Skip this room'}</button>` : ''}</div>`;
  showSheet('roles', `What kind of light is each one in the ${esc(areaName(aid))}?`, body, { sub: 'We guessed from the names. Fix any that are wrong.', back: !!RS.back, onBack: RS.back });
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
function moodsWalkRooms() { return lightRooms().filter(a => roomLights(a.id).length >= 2).map(a => a.id); }
function moodsTipHTML() {
  if (lightRooms().some(a => roomHasMoods(a.id))) return '';
  const walk = moodsWalkRooms(); if (!walk.length) return '';
  try { if (localStorage.getItem('moodsTipDismissed')) return ''; } catch (_) { /* ignore */ }
  return `<div class="spacer"></div><div class="tip top" id="moodstip"><div class="grow"><span class="cap">Moods</span><div class="t">Give your rooms moods</div><div class="d">Say which lights are lamps and which is the main light, and each room gets Bright, Relax, Dinner, Movie and Night.</div><button class="btn ghost" data-act="moods-dismiss">${ICON('x', 'sm')} Not now</button></div><button class="go" data-act="moods-walk" title="Start with ${esc(areaName(walk[0]))}">${ICON('chev')}</button></div>`;
}
// The Scenes tab's "Room moods" section: one row per room that has them.
function roomMoodsSectionHTML() {
  const rooms = lightRooms().filter(a => roomHasMoods(a.id)); if (!rooms.length) return '';
  return `<div class="h2">Room moods</div><div class="card pad0 list">${rooms.map(a => { const ps = roomMoodPresets(a.id); const ch = ps.filter(p => p.edited).length; return `<button class="item" data-act="rm-open" data-area="${a.id}">${lampHTML(targetOn(`a:${a.id}`) ? roomMean(a.id) : 0, 40, ICON(roomIcon(a.name), 'sm'))}<div class="grow"><div class="t">${esc(a.name)}</div><div class="d">${plural(ps.length, 'mood')}${ch ? ` · ${ch} changed by you` : ''}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`; }).join('')}</div>`;
}
function openRoomMoodsSheet(aid) {
  const ps = roomMoodPresets(aid); const ch = ps.filter(p => p.edited).length;
  const rows = ps.map(p => { const m = moodById(p.mood); return `<div class="item"><button class="ic" data-act="run-scene" data-t="p:${p.id}" title="Run">${ICON('play', 'sm')}</button><div class="grow"><div class="t">${esc(m.name)}</div><div class="d">${p.edited ? 'Changed by you' : 'Suggested'} · ${plural(Object.keys(p.levels).length, 'light')}</div></div><button class="iconbtn plain" data-act="scene-edit" data-id="${p.id}" title="Edit">${ICON('edit', 'sm')}</button></div>`; }).join('');
  const body = `<div class="card pad0 list">${rows}</div><div class="stack" style="margin-top:16px"><button class="btn block" data-act="rl-open" data-area="${aid}">Change what each light is for</button></div>`;
  showSheet('roommoods', `${esc(areaName(aid))} moods`, body, { sub: `${plural(ps.length, 'mood')}${ch ? ` · ${ch} changed by you` : ''}` });
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
    case 'tz-keep': try { localStorage.setItem('tzKeep', `${S.config.settings.timezone}|${phoneTZ()}`); } catch (_) { /* ignore */ } render(); break;
    case 'tz-phone': S.config.settings.timezone = phoneTZ(); save({ msg: `Following this phone's clock` }); break;
    // the editor
    case 'ae-new': openEditor(null); break;
    case 'ae-when': openWhenSheet('at'); break;
    case 'ae-off': openWhenSheet('off'); break;
    case 'ae-target': aeToggleTarget(d.t); break;
    case 'ae-target-more': openTargetPicker([...AE.L, ...AE.Sh], list => { const { L, Sh } = splitT(list); aeSetTargets(L, Sh); }, renderEditor, { shades: true }); break;
    case 'ae-recipe': aeApplyRecipe(d.r); break;
    case 'ae-scene': { const it = AE.scenePick[Number(d.i)]; if (!it) break; const sc = aeSc(); sc.actions = [it.a]; const off = aeOff(); if (off) off.actions = makePair(sc, off.at, AE.L, AE.Sh).actions; aeSave(); break; }
    case 'ae-day': { const sc = aeSc(); setDay(sc.days, Number(d.d), AE); if (AE.dayWarn) renderEditor(); else aeSave(`Runs ${daysText(sc.days).toLowerCase()}`); break; }
    case 'ae-days': { const sc = aeSc(); sc.days = [...QUICK_DAYS[d.v]]; AE.dayWarn = false; aeSave(`Runs ${daysText(sc.days).toLowerCase()}`); break; }
    case 'ae-try': aeTry(); break;
    case 'ae-skip': { const sc = aeSc(); if (skipping(sc)) unSkip(sc); else doSkip(sc); setTimeout(renderEditor, 50); break; }
    case 'ae-more': openMoreSheet(); break;
    case 'ae-finetune': aeFineTune(); break;
    case 'ae-delete': aeDelete(); break;
    case 'ae-done': closeSheet(); break;
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
    case 'gs-target-more': openTargetPicker(GS.targets, list => { GS.targets = list; renderSetup(); }, renderSetup); break;
    case 'gs-shade': { const i = GS.shades.indexOf(d.t); if (i >= 0) GS.shades.splice(i, 1); else GS.shades.push(d.t); renderSetup(); break; }
    case 'gs-until': GS.until = d.v; renderSetup(); break;
    case 'gs-level': GS.level = Number(d.v); renderSetup(); break;
    case 'gs-offset': GS.offset = Number(d.v); renderSetup(); break;
    case 'gs-lamp': GS.lamp = d.id; renderSetup(); break;
    case 'gs-lamp-more': openLampPicker(); break;
    case 'gs-lamp-pick': GS.lamp = d.id; renderSetup(); break;
    case 'gs-day': setDay(GS.days, Number(d.d), GS); renderSetup(); break;
    case 'gs-days': GS.days = [...QUICK_DAYS[d.v]]; GS.dayWarn = false; renderSetup(); break;
    case 'gs-shade-tgl': GS.shade = !GS.shade; renderSetup(); break;
    case 'gs-minutes': GS.minutes = Number(d.v); renderSetup(); break;
    case 'gs-end': GS.end = Number(d.v); renderSetup(); break;
    case 'gs-card': GS[d.k].on = !GS[d.k].on; renderSetup(); break;
    case 'gs-gn-remote': GS.gn.remote = d.id; GS.gn.button = defaultHoldButton(dev(d.id)); renderSetup(); break;
    case 'gs-gn-button': GS.gn.button = Number(d.n); renderSetup(); break;
    case 'gs-gn-path': { const i = GS.gn.path.indexOf(d.t); if (i >= 0) GS.gn.path.splice(i, 1); else GS.gn.path = normalizeTargets([...GS.gn.path, d.t], d.t); renderSetup(); break; }
    case 'gs-lv-remote': GS.lv.remote = d.id; GS.lv.button = defaultHoldButton(dev(d.id)); renderSetup(); break;
    case 'gs-lv-button': GS.lv.button = Number(d.n); renderSetup(); break;
    case 'gs-lv-door': GS.lv.door = d.t; renderSetup(); break;
    case 'gs-save': if (GS.kind === 'welcome') saveWelcome(GS); else if (GS.kind === 'wakeup') saveWakeup(GS); else saveButtons(GS); break;
    // wind-down
    case 'wd-toggle': { const { ad } = wdSettings(); ad.enabled = !ad.enabled; save({ msg: ad.enabled ? 'Evening wind-down is on' : 'Evening wind-down is off' }); break; }
    case 'wd-advanced': openWindDownAdvanced(); break;
    case 'wd-set': wdSet(d.k, d.v); break;
    case 'wd-nudge': { const { wd } = wdSettings(); wd.nudge = !wd.nudge; el.classList.toggle('on', wd.nudge); save({ msg: wd.nudge ? 'Untouched lights will lower gently' : 'Untouched lights are left alone', render: false }); break; }
    case 'wd-curve': openCurveSheet(); break;
    case 'wd-mode': { const { ad } = wdSettings(); ad.mode = d.v; save({ msg: d.v === 'points' ? 'Following the curve by the hour' : 'Following the sun', render: false }); openCurveSheet(); break; }
    case 'wd-pt-add': { const { ad } = wdSettings(); const last = ad.points[ad.points.length - 1]; ad.points.push({ time: hmAdd(last ? last.time : '20:00', 60), level: last ? last.level : 50 }); ad.points.sort((a, b) => a.time.localeCompare(b.time)); save({ quiet: true, render: false }); openCurveSheet(); break; }
    case 'wd-pt-remove': { const { ad } = wdSettings(); if (ad.points.length > 2) { ad.points.splice(Number(d.i), 1); save({ quiet: true, render: false }); openCurveSheet(); } break; }
    // roles and moods
    case 'roles-open': case 'rl-open': openRolesSheet(d.area); break;
    case 'rl-pick': RS.roles[d.id] = d.r; renderRolesSheet(); break;
    case 'rl-make': rolesMake(); break;
    case 'rl-skip': rolesAdvance(RS.walk, RS.aid, null); break;
    case 'moods-walk': { const walk = moodsWalkRooms(); if (walk.length) openRolesSheet(walk[0], { walk }); break; }
    case 'moods-dismiss': try { localStorage.setItem('moodsTipDismissed', '1'); } catch (_) { /* ignore */ } { const b = $('#moodstip'); if (b) b.remove(); } break;
    case 'rm-open': openRoomMoodsSheet(d.area); break;
  }
});
document.addEventListener('change', e => {
  const el = e.target; const d = el.dataset;
  if (el.id === 'wh-time' && WH) { WH.time = el.value || WH.time; return; }
  if (el.id === 'gs-until-time' && GS) { GS.untilTime = el.value || GS.untilTime; renderSetup(); return; }
  if (el.id === 'gs-alarm' && GS) { GS.alarm = el.value || GS.alarm; renderSetup(); return; }
  if (el.id === 'gs-low' && GS) { GS.low = el.checked; renderSetup(); return; }
  if (el.id === 'ae-name' && AE) { const sc = aeSc(); const v = el.value.trim(); const auto = autoName(sc, AE.L, AE.Sh, !!aeOff()); sc.name = v || auto; AE.customName = !!v && v !== auto; syncPair(sc); if (AE.draftOff) AE.draftOff.name = sc.name; aeSaveSoon(); const h = $('#sheet-root .sh .sub'); if (h) h.textContent = sc.name; return; }
  if (el.id === 'ae-onlyif' && AE) { aeSc().only_if = el.value || null; aeSaveSoon(); return; }
  if (el.id === 'ae-fade' && AE) { const sc = aeSc(); for (const a of sc.actions) if (a.type === 'level') { if (el.value === '') delete a.fade; else a.fade = Number(el.value); } aeSaveSoon(); return; }
  if (d.wd) { const s = S.config.settings; const v = el.value; if (!/^\d\d:\d\d$/.test(v)) return; s[d.wd] = v; if (d.wd === 'night_start') rewriteEveningPoints(v); save({ msg: d.wd === 'night_start' ? `Quiet from ${fmtTime(v)}` : `Night ends at ${fmtTime(v)}`, render: false }); const wc = $('#wd-cap'); if (wc) wc.innerHTML = windDownCaption(); const wt = $('#wd-today'); if (wt) wt.textContent = todaySentence(); return; }
  if (d.pt != null) { const { ad } = wdSettings(); const p = ad.points[Number(d.pt)]; if (!p) return; if (d.k === 'time') { if (/^\d\d:\d\d$/.test(el.value)) p.time = el.value; } else p.level = Number(el.value); ad.points.sort((a, b) => a.time.localeCompare(b.time)); saveSoon(); return; }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'city-q') { const l = $('#city-list'); if (l) l.innerHTML = cityListHTML(el.value); }
});
document.addEventListener('toggle', e => { const el = e.target; if (el && el.dataset && el.dataset.more != null && GS) GS.more = el.open; }, true);
