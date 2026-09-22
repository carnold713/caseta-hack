// 10 · Routines (12732:48782). What the house does on its own: the next thing due, any timer running, each routine
// as a card with its days and a switch, the four guided setups, and the two house-wide habits (the evening wind-down
// and Follow the day). #routines/winddown, /winddown-levels, /winddown-curve and /night are sheets over it.
import { whereBlock, whereActions, whereSheet } from '/ui/screens/where.js';

const tzKept = (home, phone) => { try { return localStorage.getItem('tzKeep') === `${home}|${phone}`; } catch (_) { return false; } };

// The guided setups, as the file tiles them. Wake-up needs a dimmer; the buttons need a remote.
export function guidedTiles(c) {
  const { icon, data } = c;
  const hasDim = data.controllable().some(d => d.domain === 'light');
  const hasRemote = data.remotes().length > 0;
  const tiles = [
    ['welcome', 'door', 'Welcome lights', true],
    ['wakeup', 'sunrise', 'Wake-up light', hasDim],
    ['goodnight', 'moon', 'Goodnight button', hasRemote],
    ['leaving', 'home', 'Leaving button', hasRemote],
    ['new', 'plus', 'Something else', true],
  ].filter(t => t[3]);
  return `<div class="gtiles" data-keep="gtiles">${tiles.map(([k, ic, t]) => `<button class="gtile" ${k === 'new' ? 'data-act="new"' : `data-go="setup/${k}"`}><span class="ic-c">${icon(ic, 20, 1.4)}</span><span class="t">${t}</span></button>`).join('')}</div>`;
}

function dayDots(c, days) {
  const RT = c.RT;
  return `<span class="ddots">${RT.WEEK.map(i => `<i class="${days.includes(i) ? 'on' : ''}">${RT.DAY_LETTER[i]}</i>`).join('')}</span>`;
}
function card(c, sc) {
  const { esc, RT } = c;
  const paused = sc.enabled === false;
  const nl = RT.nextLine(sc);
  const warn = nl && typeof nl === 'object' && nl.warn ? nl.text : '';
  return `<div class="rt-card ${paused ? 'paused' : ''}" data-go="routine/${esc(sc.id)}" role="link" aria-label="${esc(sc.name || 'Routine')}">
    <div class="rt-body"><span class="rt-t nm-cut">${esc(sc.name || 'Routine')}</span><span class="rt-s">${esc(RT.sentence(sc))}</span>
      ${warn ? `<span class="rt-warn">${esc(warn)}</span>` : ''}
      <span class="rt-days">${dayDots(c, sc.days || RT.ALL_DAYS)}<span class="dt">${esc(RT.daysText(sc.days))}</span></span></div>
    ${paused ? '<span class="chip tag paused-chip">Paused</span>' : ''}
    <button class="toggle" role="switch" aria-checked="${!paused}" data-act="rt-toggle" data-id="${esc(sc.id)}" aria-label="${esc(sc.name || 'Routine')} on or off"></button></div>`;
}

export function view(c) {
  const { esc, icon, RT, DAY, data } = c;
  const s = c.S.config.settings;
  const list = RT.list();
  // a routine just made is "New routine" only until its maker comes back here
  c.ui.freshRoutine = null;
  const clash = RT.zoneClash();
  const tz = clash && !tzKept(clash.home, clash.phone)
    ? `<div class="banner">${icon('globe', 22, 1.5)}<div><p>Your phone is on ${esc(clash.phoneName)} time but home is on ${esc(clash.homeName)}.</p>
        <div class="btns"><button class="pill ghost sm" data-act="tz-keep">Use ${esc(clash.homeName)}</button><button class="link blue" data-act="tz-phone">Use this phone's</button></div></div></div>` : '';
  const needLoc = !s.location && list.some(sc => sc.at && sc.at.type !== 'time');
  const up = RT.upNext();
  const upCard = up ? `<div class="upnext"><span class="glow"></span><span class="t-over">Up next</span>
      <span class="ic-c">${icon(up.icon, 24, 1.7)}</span><span class="un-t nm-cut">${esc(up.title)}</span><span class="un-s">${esc(up.sub)}</span>
      <button class="pill ghost sm" data-act="${up.skipping ? 'rt-unskip' : 'rt-skip'}" data-id="${esc(up.sc.id)}" data-date="${esc(up.date)}">${esc(up.skipLabel)}</button></div>` : '';
  const timers = RT.timers().map(t => `<div class="timer-row"><span class="ring"><svg viewBox="0 0 36 36" width="36" height="36"><circle cx="18" cy="18" r="14" class="trk"/><circle cx="18" cy="18" r="14" class="arc" style="stroke-dasharray:88;stroke-dashoffset:${Math.round(88 * (1 - Math.min(1, t.mins / 60)))}"/></svg>${icon('timer', 16, 1.6)}</span>
      <span class="t-row nm-cut">${esc(t.text)}</span><button class="link" data-act="timer-cancel" data-t="${esc(t.key)}">Cancel</button></div>`).join('');
  const following = DAY.followIds().filter(id => data.dev(id));
  const lamps = data.controllable().filter(d => DAY.canFollow(d));
  const followSub = following.length ? `${following.length} ${following.length === 1 ? 'lamp' : 'lamps'} following` : lamps.length ? 'Off' : 'Needs a lamp that changes its white';
  const habits = `<div class="group habits">
      <button class="row has-ic" data-go="routines/winddown"><span class="row-ic">${icon('moon', 20, 1.4)}</span><span class="row-txt"><span class="t">Evening wind-down</span><span class="d">${esc(RT.windDownLine())}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <button class="row has-ic" data-act="follow" ${lamps.length ? '' : 'disabled'}><span class="row-ic">${icon('sunrise', 20, 1.4)}</span><span class="row-txt"><span class="t">Follow the day</span><span class="d">${esc(followSub)}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    </div>`;
  return `<div class="routines-page">
    <div class="rt-head"><h1 class="t-h1">Routines</h1><button class="hdr-btn a1" data-act="new" aria-label="New routine">${icon('plus', 22, 1.7)}</button></div>
    ${tz}
    ${needLoc ? `<div class="loc-card">${whereBlock(c)}</div>` : ''}
    ${upCard}${timers}
    ${list.length ? `<div class="t-over sec">Your routines</div><div class="rt-list">${list.map(sc => card(c, sc)).join('')}</div>`
      : `<p class="t-body muted rt-empty">What should your home do on its own? Each of these takes about a minute.</p>`}
    <div class="t-over sec">Set up in a minute</div>
    ${guidedTiles(c)}
    ${habits}
    <p class="t-cap muted foot">Have timers in the Lutron app? Keep them in one place, here or there, so they don't fight.</p>
  </div>`;
}

// ---------- the evening wind-down ----------
function windDown(c) {
  const { esc, icon, RT } = c;
  const s = c.S.config.settings;
  const on = RT.windDownOn();
  const caption = !s.location
    ? `Without your home's location, dimming starts at ${RT.fmtTime((s.adaptive && s.adaptive.winddown && s.adaptive.winddown.earliest) || '18:00')}.`
    : `Dimming starts after sunset and reaches its lowest at the quiet time. From then until ${RT.fmtTime(s.night_end)}, on means ${s.night_level}%. Early mornings are soft too. This is also when night starts for your remotes.`;
  return { over: 'Routines', title: 'Evening wind-down', body: `<div class="wd">
    <div class="group"><div class="row"><span class="row-txt"><span class="t">${on ? 'On' : 'Off'}</span></span><button class="toggle" role="switch" aria-checked="${on}" data-act="wd-toggle" aria-label="Evening wind-down"></button></div></div>
    <p class="t-body muted sheet-p">As the evening goes on, lights you turn on come on a little dimmer, so the house feels calmer late. Set a level yourself and it stays.</p>
    ${on ? `<div class="group"><button class="row" data-act="night-hours"><span class="row-txt"><span class="t">When does the house go quiet?</span></span><span class="row-val">${esc(RT.fmtTime(s.night_start))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button></div>
      <p class="t-cap muted sheet-p">${esc(caption)}</p>${s.location ? '' : `<div class="loc-card in-sheet">${whereBlock(c, { compact: true })}</div>`}
      <div class="group"><button class="row" data-go="routines/winddown-levels"><span class="row-txt"><span class="t">Advanced: change the levels</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button></div>` : ''}
  </div>` };
}
function levels(c) {
  const { esc, icon, RT } = c;
  const s = c.S.config.settings; const wd = (s.adaptive && s.adaptive.winddown) || {};
  const chips = (k, vals, cur) => `<div class="chip-wrap">${vals.map(([v, l]) => `<button class="chip sm" aria-pressed="${cur === v}" data-act="wd-set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const block = (t, d, inner) => `<div class="wd-q"><p class="t-row">${t}</p>${d ? `<p class="t-cap muted">${d}</p>` : ''}${inner}</div>`;
  return { over: 'Evening wind-down', title: 'The levels', body: `<div class="wd">
    ${block('Early morning', `Before ${esc(RT.fmtTime(wd.morning_until || '07:30'))}`, chips('morning_level', [[40, '40%'], [60, '60%'], [100, '100%']], wd.morning_level))}
    ${block('Start dimming', '', chips('sunset_offset_min', [[0, 'At sunset'], [30, '30 min after'], [60, '1 hour after']], wd.sunset_offset_min))}
    ${block('Down to', 'By the time the house goes quiet', chips('to_level', [[60, '60%'], [50, '50%'], [40, '40%']], wd.to_level))}
    ${block('At night', 'While the house is quiet, until night ends', chips('night_level', [[35, '35%'], [25, '25%'], [15, '15%']], s.night_level))}
    <div class="group"><button class="row" data-act="night-hours"><span class="row-txt"><span class="t">Night ends</span></span><span class="row-val">${esc(RT.fmtTime(s.night_end))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button></div>
    <p class="t-cap sheet-p wd-today">${esc(RT.windDownToday())}</p>
    <div class="group">
      <div class="row"><span class="row-txt"><span class="t">Also lower lights nobody has touched for 20 minutes</span><span class="d">Gently, over a minute, only lights above the curve. Turn it off if it ever fights you.</span></span><button class="toggle" role="switch" aria-checked="${!!wd.nudge}" data-act="wd-nudge" aria-label="Lower untouched lights"></button></div>
      <button class="row" data-go="routines/winddown-curve"><span class="row-txt"><span class="t">Curve by the hour</span><span class="d">Set the level for each time of day yourself</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    </div>
    <p class="t-cap muted sheet-p">Task lights (counters, desks, mirrors) are never dimmed. Pressing a top button twice is always full brightness.</p>
  </div>` };
}
function curve(c) {
  const { esc, icon } = c;
  const ad = (c.S.config.settings.adaptive) || {};
  const pts = ad.points || [];
  const LV = [100, 90, 80, 70, 60, 50, 40, 35, 30, 25, 20, 15, 10, 5];
  const rows = pts.map((p, i) => `<div class="row pt-row"><input class="field time" type="time" value="${esc(p.time)}" data-change="pt-set" data-i="${i}" data-k="time" aria-label="Time">
      <select class="field sel" data-change="pt-set" data-i="${i}" data-k="level" aria-label="Level">${LV.map(v => `<option value="${v}" ${p.level === v ? 'selected' : ''}>${v}%</option>`).join('')}</select>
      <button class="link blue" data-act="pt-remove" data-i="${i}" ${pts.length <= 2 ? 'disabled' : ''}>Remove</button></div>`).join('');
  return { over: 'Evening wind-down', title: 'Curve by the hour', body: `<div class="wd">
    <div class="chip-wrap">${[['winddown', 'Follow the sun'], ['points', 'By the hour']].map(([v, l]) => `<button class="chip sm" aria-pressed="${(ad.mode || 'winddown') === v}" data-act="wd-mode" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="t-cap muted sheet-p">${ad.mode === 'points' ? 'What on means at each time of day. Between two times it slides from one to the next; after the last it holds until the first.' : 'Following the sun uses the levels on the page before. Pick By the hour to draw the curve yourself.'}</p>
    <div class="group">${rows}<button class="row" data-act="pt-add"><span class="row-txt"><span class="t">Add a time</span></span>${icon('plus', 18, 1.7)}</button></div>
  </div>` };
}
// The night hours belong to the house; the wind-down and the remotes' night versions both read them.
export function nightHours(c) {
  const s = c.S.config.settings;
  return { over: 'The house', title: 'Night', body: `<div class="group">
    <label class="row"><span class="row-txt"><span class="t">The house goes quiet</span><span class="d">Buttons can do something different from here on</span></span><input class="field time" type="time" value="${c.esc(s.night_start)}" data-change="night-set" data-k="night_start" aria-label="The house goes quiet"></label>
    <label class="row"><span class="row-txt"><span class="t">Night ends</span></span><input class="field time" type="time" value="${c.esc(s.night_end)}" data-change="night-set" data-k="night_end" aria-label="Night ends"></label>
  </div>` };
}

const SHEETS = { winddown: windDown, 'winddown-levels': levels, 'winddown-curve': curve, night: nightHours, where: whereSheet };
export function sheetFor(c, r) {
  const make = r.id && SHEETS[r.id];
  if (!make) return null;
  const parent = r.id === 'winddown-levels' ? 'routines/winddown' : r.id === 'winddown-curve' ? 'routines/winddown-levels' : 'routines';
  return { spec: make(c, r), parent };
}

// ---------- taps shared by the pages that change a routine's run ----------
export const runActions = {
  'rt-toggle'(c, el) { const sc = c.RT.byId(el.dataset.id); if (sc) c.save(c.RT.setEnabled(sc, sc.enabled === false)); },
  'rt-skip'(c, el) { const sc = c.RT.byId(el.dataset.id); if (!sc) return; const msg = c.RT.skip(sc, el.dataset.date || null); if (msg) c.save(msg); else c.toast('Nothing to skip yet'); },
  'rt-unskip'(c, el) { const sc = c.RT.byId(el.dataset.id); if (sc) c.save(c.RT.unskip(sc)); },
};

export const actions = {
  ...whereActions,
  ...runActions,
  new(c) {
    const sc = c.RT.newRoutine();
    c.ui.freshRoutine = sc.id;
    c.save('Routine created');
    c.go(`routine/${sc.id}`);
  },
  'tz-keep'(c) { const x = c.RT.zoneClash(); if (x) { try { localStorage.setItem('tzKeep', `${x.home}|${x.phone}`); } catch (_) { /* fine */ } } c.render(); },
  'tz-phone'(c) { c.S.config.settings.timezone = c.RT.phoneTZ(); c.save("Following this phone's clock"); },
  'timer-cancel'(c, el) {
    const t = el.dataset.t; const target = t.includes('|') ? t.split('|') : t;
    delete (c.S.timers || {})[t];
    c.run({ type: 'cancel_timer', target }).then(ok => { if (ok) c.toast('Timer cancelled'); c.render(); });
  },
  follow(c) {
    const on = c.DAY.followIds().find(id => c.data.dev(id));
    const first = on || (c.data.controllable().find(d => c.DAY.canFollow(d)) || {}).device_id;
    if (first) c.go(`light/${first}/follow`);
  },
  'wd-toggle'(c) { const s = c.S.config.settings; s.adaptive = s.adaptive || {}; s.adaptive.enabled = !s.adaptive.enabled; c.save(s.adaptive.enabled ? 'Evening wind-down is on' : 'Evening wind-down is off'); },
  'wd-set'(c, el) { c.save(c.RT.setWindDown(el.dataset.k, el.dataset.v)); },
  'wd-nudge'(c) { const w = c.S.config.settings.adaptive.winddown = c.S.config.settings.adaptive.winddown || {}; w.nudge = !w.nudge; c.save(w.nudge ? 'Untouched lights will lower gently' : 'Untouched lights are left alone'); },
  'wd-mode'(c, el) { c.S.config.settings.adaptive.mode = el.dataset.v; c.save(el.dataset.v === 'points' ? 'Following the curve by the hour' : 'Following the sun'); },
  'pt-add'(c) { c.RT.addPoint(); c.save('', { quiet: true }); },
  'pt-remove'(c, el) { c.RT.removePoint(Number(el.dataset.i)); c.save('', { quiet: true }); },
  'pt-set'(c, el, r, v) { c.RT.setPoint(Number(el.dataset.i), el.dataset.k, v); c.saveSoon(400); },
  'night-hours'(c) { c.openPicker('night', nightHours); },
  'night-set'(c, el, r, v) { const msg = c.RT.setNight(el.dataset.k, v); if (msg) c.save(msg); },
};
