// 10 · Routines (12732:48782). What the house does on its own: the next thing due, any timer running, each routine
// as a card with its days and a switch, the four guided setups, and the two house-wide habits (the evening wind-down
// and Follow the day). #routines/winddown is the wind-down's page; /winddown-levels, /winddown-curve and
// /winddown-night are sheets over it, and /night and /where are sheets over the list.
import { whereBlock, whereActions, whereSheet } from '/ui/screens/where.js';
import { CasetaRoutines } from '/data/index.js';
import { whiteStops } from '/ui/glow.js';
import { track } from '/ui/gesture.js';

// The wind-down is a page of its own under Routines (#routines/winddown), with no tab bar, as the frame has it; its
// levels, its curve and the night hours are sheets over it. The flag is read by the app after each draw.
const WD_PAGES = ['winddown', 'winddown-levels', 'winddown-curve', 'winddown-night'];
export let noTabs = false;

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

export function view(c, r) {
  noTabs = !!(r && WD_PAGES.includes(r.id));
  if (noTabs) return windDownPage(c);
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
    <div class="rt-head bar"><h1 class="t-h1 bar-t">Routines</h1><button class="hdr-btn a1" data-act="new" aria-label="New routine">${icon('plus', 22, 1.7)}</button></div>
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
// v7 · 9 (12816:580): the evening as one timeline, from an hour before sunset to the next morning. A glow band shows
// the level "on" gives at each moment, stepping down and warming as it goes; the quiet hours are a flat low band
// with a moon over their start. It is honest about what it does: it sets the level lights come on at, and never
// dims a light that is already on.
//
// The moon is a grip (drag it sideways to move the quiet time, in 15 minute steps), and so is the handle on the
// evening's lowest step (drag it up or down for the level it gets down to). Both apply when the finger lifts, with
// Undo. A tap on the band only says what on means then. Everything the sheets had (the levels, the curve by the
// hour, the night hours) is a row away.
const pad2 = n => String(n).padStart(2, '0');
const hmMin = hm => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const minHm = m => { const t = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`; };
// "11 pm", "11:30 pm": the headline's way of saying a time
const shortTime = hm => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}${m ? `:${pad2(m)}` : ''} ${h >= 12 ? 'pm' : 'am'}`; };

// What "on" means at a moment, the way the connector decides it: the wind-down's curve (or the by-the-hour points),
// with the quiet time or the evening level swapped for what a finger is trying.
export function windDownLevelAt(c, hm, over = {}) {
  const s = c.S.config.settings, ad = s.adaptive || {}, w = ad.winddown || {};
  if (!ad.enabled) return 100;
  const pts = (ad.points || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  if (ad.mode === 'points' && pts.length >= 2) {
    const t = hmMin(hm);
    // between two times it slides; after the last it holds until the first
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!b) return a.level;
      if (t >= hmMin(a.time) && t < hmMin(b.time)) return Math.round(a.level + (b.level - a.level) * (t - hmMin(a.time)) / Math.max(1, hmMin(b.time) - hmMin(a.time)));
    }
    return pts[pts.length - 1].level;
  }
  return CasetaRoutines.winddownLevel(hm, c.RT.curveStart(), over.night_start || s.night_start, s.night_end, w.from_level || 100,
    over.to_level != null ? over.to_level : (w.to_level || 50), s.night_level || 30, w.morning_level == null ? 100 : w.morning_level, w.morning_until || '07:30');
}

// The timeline's span and its steps. An hour a step through the evening; the quiet hours one flat band; the soft
// early morning its own step. Each step carries the level at its middle, and the kelvin that level warms to.
function windDownModel(c, over = {}) {
  const s = c.S.config.settings, w = (s.adaptive && s.adaptive.winddown) || {};
  const on = c.RT.windDownOn();
  const quiet = over.night_start || s.night_start;
  const sunset = c.RT.sunAt('sunset') || c.RT.curveStart();
  const start = Math.floor((hmMin(sunset) - 60) / 60) * 60;
  const morning = w.morning_level != null && w.morning_level < 100 ? hmMin(w.morning_until || '07:30') : hmMin(s.night_end);
  const endAbs = Math.ceil((Math.max(hmMin(s.night_end), morning) + 30) / 60) * 60;
  const span = ((endAbs - start) % 1440 + 1440) % 1440 || 1440;
  const rel = hm => ((hmMin(hm) - start) % 1440 + 1440) % 1440;
  const cuts = new Set([0, span]);
  for (let m = 60; m < span; m += 60) cuts.add(m);
  for (const hm of [quiet, s.night_end, w.morning_until || '07:30']) { const m = rel(hm); if (m > 0 && m < span) cuts.add(m); }
  const xs = [...cuts].sort((a, b) => a - b);
  const steps = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    const lv = on ? windDownLevelAt(c, minHm(start + (a + b) / 2), over) : 100;
    const night = on && ((rel(quiet) <= (a + b) / 2) && ((a + b) / 2 < rel(s.night_end)));
    const last = steps[steps.length - 1];
    if (last && last.lv === lv && last.night === night) last.b = b;
    else steps.push({ a, b, lv, night });
  }
  const nowRel = rel(c.RT.nowHm());
  return { on, start, span, steps, quiet, rel, nowRel: nowRel <= span ? nowRel : null, s, w };
}
// A step warms as it dims: 3000K at full, down to 1900K from the white bar at the night's level.
const stepTone = lv => whiteStops(1900 + 1100 * Math.max(0, Math.min(1, (lv - 30) / 70))).body;

// What a tap on the band said, kept for its 2 s so a redraw in the meantime does not take it away.
let tipNow = null;
function bandHTML(c, md) {
  const P = m => `${(m / md.span * 100).toFixed(3)}%`;
  const inNow = md.nowRel != null;
  const steps = md.steps.map((st, i) => {
    const when = !inNow ? 'ahead' : st.b <= md.nowRel ? 'past' : st.a <= md.nowRel ? 'now' : 'ahead';
    const col = st.night ? '#D98A4E' : stepTone(st.lv);
    return `<span class="wd-step ${when} ${st.night ? 'night' : ''}" data-i="${i}" style="left:${P(st.a)};width:calc(${P(st.b - st.a)} - 2px);height:${Math.max(4, Math.round(96 * st.lv / 100))}px;--c:${col}"></span>`;
  }).join('');
  // the evening's lowest step, just before the quiet time, carries the handle for the level it gets down to
  const qi = md.steps.findIndex(st => st.night);
  const low = qi > 0 ? md.steps[qi - 1] : null;
  const pointsMode = (md.s.adaptive || {}).mode === 'points';
  const knob = md.on && low && !pointsMode ? `<span class="wd-knob" data-grip="low" style="left:${P((low.a + low.b) / 2)};bottom:${Math.max(4, Math.round(96 * low.lv / 100))}px" role="slider" aria-label="The level it gets down to" aria-valuenow="${md.w.to_level || 50}" tabindex="0"><i></i></span>` : '';
  const qx = md.rel(md.quiet);
  const moon = `<span class="wd-moon" data-grip="moon" style="left:${P(qx)}" role="slider" aria-label="When the house goes quiet" aria-valuetext="${c.esc(c.RT.fmtTime(md.quiet))}" tabindex="0"><span class="wd-moon-t">${c.esc(shortTime(md.quiet))}</span><span class="wd-moon-glow"></span>${c.icon('moon', 24, 1.6)}</span>`;
  const now = inNow ? `<span class="wd-now" style="left:${P(md.nowRel)}" aria-hidden="true"><i></i></span>` : '';
  // hour labels: the start, every other hour through the evening, the quiet time and the end
  const lab = [];
  for (let m = 0; m <= md.span; m += 120) lab.push(m);
  if (lab[lab.length - 1] < md.span) { if (md.span - lab[lab.length - 1] < 90) lab.pop(); lab.push(md.span); }
  const labels = lab.map((m, i) => {
    const t = minHm(md.start + m), ends = i === 0 || i === lab.length - 1;
    const h = Number(t.slice(0, 2));
    return `<span class="wd-h ${i === 0 ? 'first' : i === lab.length - 1 ? 'last' : ''}" style="left:${P(m)}">${ends ? shortTime(t) : h % 12 || 12}</span>`;
  }).join('');
  const tipOn = tipNow && performance.now() < tipNow.until;
  return `<div class="wd-band ${md.on ? '' : 'flat'}" data-drag>${steps}${now}${md.on ? moon : ''}${knob}<span class="wd-tip" ${tipOn ? `style="left:${tipNow.left}"` : 'hidden'}>${tipOn ? c.esc(tipNow.text) : ''}</span></div>
    <div class="wd-hours">${labels}</div>`;
}

function windDownPage(c) {
  const { esc, icon, RT } = c;
  const md = windDownModel(c);
  const s = md.s, w = md.w;
  const quiet = shortTime(s.night_start);
  const head = md.on ? `Tonight at ${quiet} the house goes quiet.` : 'Off · lights come on as bright late as early';
  const pointsMode = (s.adaptive || {}).mode === 'points';
  const under = !md.on ? ''
    : pointsMode ? `Lights you turn on follow your curve by the hour, then ${s.night_level}% from ${esc(RT.fmtTime(s.night_start))} until ${esc(RT.fmtTime(s.night_end))}.`
      : `Lights you turn on after ${esc(RT.fmtTime(RT.curveStart()))} come on softer, down to ${w.to_level || 50}% by ${esc(quiet)}, then ${s.night_level}% until ${esc(RT.fmtTime(s.night_end))}.`;
  return `<div class="wd-page">
    <header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">Evening wind-down</h1>
    <p class="t-cap muted fd-sub">${md.on ? 'On · every evening' : 'Off'}</p>
    <section class="wd-card ${md.on ? '' : 'off'}">
      <p class="wd-head" data-xf="standard">${esc(head)}</p>
      ${bandHTML(c, md)}
    </section>
    ${md.on ? `<p class="wd-say" data-xf="standard">${under}</p><p class="wd-honest">Lights that are already on stay as they are.</p>` : `<p class="wd-say">As the evening goes on, lights you turn on come on a little dimmer, so the house feels calmer late. Set a level yourself and it stays.</p>`}
    ${s.location ? '' : `<div class="loc-card wd-loc">${whereBlock(c, { compact: true })}</div>`}
    <div class="group wd-rows">
      <div class="row has-ic"><span class="row-ic">${icon('moon', 20, 1.4)}</span><span class="row-txt"><span class="t">Evening wind-down</span></span><button class="toggle" role="switch" aria-checked="${md.on}" data-act="wd-toggle" aria-label="Evening wind-down"></button></div>
      ${md.on ? `<button class="row has-ic" data-go="routines/winddown-levels"><span class="row-ic sunrise">${icon('sunset', 20, 1.4)}</span><span class="row-txt"><span class="t">Starts dimming</span></span><span class="row-val">${pointsMode ? 'By the hour' : esc(RT.fmtTime(RT.curveStart()))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <button class="row has-ic" data-go="routines/winddown-night"><span class="row-ic">${icon('moon', 20, 1.4)}</span><span class="row-txt"><span class="t">Quiet from</span></span><span class="row-val">${esc(RT.fmtTime(s.night_start))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <button class="row has-ic" data-go="routines/winddown-levels"><span class="row-ic">${icon('bulb', 20, 1.4)}</span><span class="row-txt"><span class="t">Night level</span></span><span class="row-val">${s.night_level}% until ${esc(RT.fmtTime(s.night_end))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <button class="row has-ic" data-go="routines/winddown-levels"><span class="row-ic">${icon('tune', 20, 1.4)}</span><span class="row-txt"><span class="t">The levels and the curve</span><span class="d">Early morning, how low it goes, by the hour</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : ''}
    </div>
    <p class="fd-drift wd-foot">${icon('clock', 16, 1.7)}Buttons with a night version use these hours too</p>
  </div>`;
}

// The grips and the tap on the band. Nothing is redrawn under the finger; the band is drawn again in place as the
// moon or the handle moves, and the change is saved when it lifts.
function wireWindDown(c, root) {
  const band = root.querySelector('.wd-band'); if (!band || band.classList.contains('flat')) return;
  const card = band.closest('.wd-card');
  const minsAt = e => { const b = band.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)); };
  const redraw = over => {
    const md = windDownModel(c, over);
    const tmp = document.createElement('div'); tmp.innerHTML = bandHTML(c, md);
    // the steps and the labels are drawn again; the grip under the finger keeps its element
    band.querySelectorAll('.wd-step, .wd-now').forEach(n => n.remove());
    const first = band.firstChild;
    tmp.querySelectorAll('.wd-step, .wd-now').forEach(n => band.insertBefore(n, first));
    const head = card.querySelector('.wd-head');
    if (head && over.night_start) head.textContent = `Tonight at ${shortTime(over.night_start)} the house goes quiet.`;
    return md;
  };
  const moon = band.querySelector('[data-grip="moon"]');
  if (moon) {
    let g = null;
    track(moon, {
      c, axis: 'x', grab: () => true,
      start() { const md = windDownModel(c); g = { md, hm: c.S.config.settings.night_start }; band.classList.add('dragging'); },
      move(e) {
        const md = g.md;
        // 15 minute steps, kept inside the evening: after dimming starts, and an hour before the night ends
        let m = Math.round(minsAt(e) * md.span / 15) * 15;
        const lo = md.rel(c.RT.curveStart()) + 15, hi = md.rel(md.s.night_end) - 60;
        m = Math.max(lo, Math.min(hi, m));
        const hm = minHm(md.start + m);
        if (hm === g.hm) return; g.hm = hm;
        moon.style.left = `${(m / md.span * 100).toFixed(3)}%`;
        moon.querySelector('.wd-moon-t').textContent = shortTime(hm);
        redraw({ night_start: hm });
      },
      end() {
        band.classList.remove('dragging');
        const hm = g && g.hm; g = null;
        if (!hm || hm === c.S.config.settings.night_start) { c.render(); return; }
        const msg = c.RT.setNight('night_start', hm);
        c.save(msg || 'Saved');
      },
    });
  }
  const knob = band.querySelector('[data-grip="low"]');
  if (knob) {
    let g = null;
    track(knob, {
      c, axis: 'y', grab: () => true,
      start(e) { const w = (c.S.config.settings.adaptive || {}).winddown || {}; g = { y0: e.clientY, from: w.to_level || 50, lv: w.to_level || 50 }; band.classList.add('dragging'); },
      move(e) {
        // 96 px of band is 100%; 5% steps between 10% and 90%
        const lv = Math.max(10, Math.min(90, Math.round((g.from + (g.y0 - e.clientY) / 96 * 100) / 5) * 5));
        if (lv === g.lv) return; g.lv = lv;
        const md = redraw({ to_level: lv });
        const qi = md.steps.findIndex(st => st.night); const low = qi > 0 ? md.steps[qi - 1] : null;
        if (low) knob.style.bottom = `${Math.max(4, Math.round(96 * low.lv / 100))}px`;
        knob.setAttribute('aria-valuenow', String(lv));
        const say = root.querySelector('.wd-say');
        if (say) say.textContent = say.textContent.replace(/down to \d+%/, `down to ${lv}%`);
      },
      end() {
        band.classList.remove('dragging');
        const was = g; g = null;
        if (!was || was.lv === was.from) { c.render(); return; }
        c.save(c.RT.setWindDown('to_level', was.lv));
      },
    });
  }
  // a tap anywhere else on the band: what on means then, under the finger, for 2 s; nothing changes
  const tip = band.querySelector('.wd-tip');
  let tipTimer = 0;
  track(band, {
    c, accept: e => !e.target.closest('[data-grip]'), move() {},
    tap(e) {
      const md = windDownModel(c);
      const m = Math.round(minsAt(e) * md.span / 15) * 15;
      const hm = minHm(md.start + m);
      tipNow = { text: `At ${shortTime(hm)}: ${windDownLevelAt(c, hm)}%`, left: `${(m / md.span * 100).toFixed(3)}%`, until: performance.now() + 2000 };
      tip.textContent = tipNow.text; tip.style.left = tipNow.left; tip.hidden = false;
      clearTimeout(tipTimer); tipTimer = setTimeout(() => { const t = document.querySelector('.wd-tip'); if (t) t.hidden = true; }, 2000);
    },
  });
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

const SHEETS = { 'winddown-levels': levels, 'winddown-curve': curve, 'winddown-night': nightHours, night: nightHours, where: whereSheet };
export function sheetFor(c, r) {
  const make = r.id && SHEETS[r.id];
  if (!make) return null;
  const parent = r.id === 'winddown-levels' || r.id === 'winddown-night' ? 'routines/winddown' : r.id === 'winddown-curve' ? 'routines/winddown-levels' : 'routines';
  return { spec: make(c, r), parent };
}
export function after(c, r, root) { if (r && WD_PAGES.includes(r.id)) wireWindDown(c, root); }

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
