// 23 · a routine (12744:112203). The routine said as one sentence whose blue words are the things to change: when,
// which days, what it does and to which lights, when it undoes that, and on what condition. "In short" repeats it as
// rows. Every change saves as it is made. #routine/<id>/<when|days|what|lights|off|onlyif|more> are the sheets.
import { whereBlock, whereActions } from '/ui/screens/where.js';
import { runActions } from '/ui/screens/routines.js';
import { stepCards } from '/ui/screens/steps.js';
import { confirmSheet, nameSheet } from '/ui/screens/pickers.js';
import { icon as glyph } from '/ui/icons.js';
import { glowHTML, setGlow, whiteStops, colourStops } from '/ui/glow.js';
import { track } from '/ui/gesture.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const sc0 = (c, r) => c.RT.byId(r.id);
const tok = (text, go, chev = true, extra = '') => `<button class="tok" data-go="${go}" ${extra}><span>${text}</span>${chev ? glyph('chevD', 18, 1.6) : ''}</button>`;
// "Porch light", "Kitchen and 2 more"
function lightsWord(c, sc) {
  const { L, Sh } = c.RT.splitOf(sc);
  const t = [...L, ...Sh];
  const w = c.data.targetName(c.REM.packTarget(t.length ? t : ['h:all']));
  return w.charAt(0).toUpperCase() + w.slice(1);
}
function offWord(c, sc) {
  const off = c.RT.pairOf(sc);
  const { L, Sh } = c.RT.splitOf(sc);
  const shades = c.RT.recipeOf(sc, L, Sh) === 'shades_close';
  if (!off) return { lead: 'then', text: shades ? 'leave them closed' : 'leave them on' };
  return { lead: shades ? 'then open at' : 'then off at', text: off.at.type === 'time' ? c.RT.fmtTime(off.at.time) : c.RT.whenValue(off.at).replace(/ \(.*\)$/, '').toLowerCase() };
}
const ONLY = { all_off: ['only if', 'everything is off'], any_on: ['only if', 'something is on'] };

export function view(c, r) {
  const { esc, icon, RT } = c;
  const sc = sc0(c, r);
  if (!sc) return `<header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header><h1 class="t-h1 page-h1">Routine</h1><p class="t-body muted soon">This routine has been deleted.</p>`;
  const base = `routine/${sc.id}`;
  const fresh = c.ui.freshRoutine === sc.id;
  const at = RT.whenTokens(sc.at);
  const off = offWord(c, sc);
  const only = ONLY[sc.only_if] || ['and', 'run every time'];
  const days = sc.days || RT.ALL_DAYS;
  const sentence = `<div class="rs">
    <div class="cl"><span class="w">At</span>${tok(esc(at[0]), `${base}/when`, sc.at && sc.at.type !== 'time')}${at[1] ? tok(esc(at[1]), `${base}/when`, false) : ''}</div>
    <div class="cl"><span class="w">on</span><span class="tok days">${RT.WEEK.map(i => `<button class="dd ${days.includes(i) ? 'on' : ''}" data-act="day" data-d="${i}" aria-pressed="${days.includes(i)}" aria-label="${RT.DAY_LONG[i]}">${RT.DAY_LETTER[i]}</button>`).join('')}</span></div>
    <div class="cl"><span class="w">do</span>${tok(esc(RT.whatWord(sc)), `${base}/what`)}${tok(esc(lightsWord(c, sc)), `${base}/lights`)}</div>
    ${RT.canHaveOff(sc) ? `<div class="cl"><span class="w">${off.lead}</span>${tok(esc(off.text), `${base}/off`, !RT.pairOf(sc))}</div>` : ''}
    <div class="cl"><span class="w">${only[0]}</span>${tok(esc(only[1]), `${base}/onlyif`)}</div>
  </div>`;
  const offRow = RT.canHaveOff(sc) ? `<button class="row kv" data-go="${base}/off"><span class="row-txt"><span class="t">${RT.pairOf(sc) && RT.pairOf(sc).actions.some(a => a.type === 'raise') ? 'Open again' : 'Off again'}</span></span><span class="row-val">${esc(RT.pairOf(sc) ? RT.whenValue(RT.pairOf(sc).at) : 'Leave them')}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : '';
  const row = (t, v, go) => `<button class="row kv" data-go="${base}/${go}"><span class="row-txt"><span class="t">${t}</span></span><span class="row-val">${esc(v)}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`;
  const nl = RT.nextLine(sc);
  const warn = nl && typeof nl === 'object' ? nl.text : '';
  const sun = sc.at && sc.at.type !== 'time';
  return `<div class="routine-page">
    <header class="hdr bar">
      <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
      <button class="hdr-btn a1" data-go="${base}/more" aria-label="More">${icon('dots', 22, 1.7)}</button>
    </header>
    <h1 class="t-h1 page-h1 nm-cut bar-t bar-pin">${esc(fresh ? 'New routine' : sc.name || 'Routine')}</h1>
    ${fresh ? '' : `<p class="t-cap muted rm-sub">${esc(typeof nl === 'string' ? nl : '')}</p>`}
    ${wakeOf(c, sc) ? sunriseHTML(c, wakeOf(c, sc), `r:${sc.id}`) : ''}
    ${sentence}
    ${warn ? `<p class="rt-warn big">${esc(warn)}</p>` : ''}
    <div class="group rt-short">
      ${row('When', RT.whenValue(sc.at), 'when')}
      ${row('Days', RT.daysText(sc.days), 'days')}
      ${row('What it does', RT.whatValue(sc), 'what')}
      ${offRow}
      ${row('Only if', RT.onlyIfText(sc.only_if), 'onlyif')}
    </div>
    <div class="group rt-paused"><div class="row"><span class="row-txt"><span class="t">Paused</span></span><button class="toggle" role="switch" aria-checked="${sc.enabled === false}" data-act="rt-toggle" data-id="${esc(sc.id)}" aria-label="Paused"></button></div></div>
    <div class="rt-btns">
      ${sc.enabled === false ? '' : `<button class="pill ghost" data-act="${RT.skipping(sc) ? 'rt-unskip' : 'rt-skip'}" data-id="${esc(sc.id)}">${esc(RT.skipLabel(sc))}</button>`}
      ${wakeOf(c, sc) ? '' : '<button class="pill ghost" data-act="try">Try it</button>'}
    </div>
    ${sun && !c.S.config.settings.location ? whereBlock(c) : ''}
  </div>`;
}

// ---------- 11 · the wake-up light, rehearsed (12814:49052, 12814:49334) ----------
// A window onto the bedroom's morning and a strip from the start of the rise to the alarm. Dragging the knob pulls
// the sun up: the whole screen brightens and warms the way the room will at that minute, the clock and the level
// stepping with it. It is a preview and never touches the lamp; "Hold to try it on the lamp" is the one thing here
// that does, and it offers Put back. The guided setup (guided.js) draws the same preview.
//
// w: { lamp, start 'HH:MM', minutes, end, days }. `key` keeps where the sun was left across redraws.
export function wakeOf(c, sc) {
  if (!sc || sc.kind !== 'wakeup' || !sc.at || sc.at.type !== 'time') return null;
  const a = (sc.actions || []).find(x => x.type === 'level' && typeof x.target === 'string' && x.target.startsWith('d:'));
  if (!a) return null;
  return { lamp: a.target.slice(2), start: sc.at.time, minutes: Math.max(1, Math.round((Number(a.fade) || 0) / 60)), end: Number(a.level) || 50, days: sc.days || c.RT.ALL_DAYS };
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const toM = k => 1e6 / k, toK = m => 1e6 / m;
// The lamp's colour at a point of the rise. It tells the truth: a lamp that follows the day rises in the day's
// white at that minute; any other colour lamp in the colour it was last left in (and the page says so); a dimmer
// with no colour of its own in the copper ramp, ember to warm white.
function wakeColour(c, w, f) {
  const d = c.data.dev(w.lamp) || {};
  if (d.ct && c.DAY.isFollowing(w.lamp) && !c.DAY.followPaused(w.lamp)) {
    const at = c.RT.hmAdd(w.start, Math.round(w.minutes * f));
    const ahead = ((c.RT.hmMin(at) - c.RT.hmMin(c.RT.nowHm())) + 1440) % 1440;
    const k = c.DAY.followKelvinFor(w.lamp, new Date(Date.now() + ahead * 60000));
    if (k) return { kelvin: k };
  }
  const st = (c.S.states[w.lamp] || {}).color;
  if (d.color && st && st.mode === 'xy' && st.hex) return { hex: String(st.hex).toLowerCase(), last: true };
  if (d.ct && st && st.kelvin) return { kelvin: Math.round(st.kelvin), last: true };
  if (d.ct || d.color) return { kelvin: 2700, last: true };
  const m = f < 0.5 ? toM(1900) + (toM(2200) - toM(1900)) * f * 2 : toM(2200) + (toM(3000) - toM(2200)) * (f - 0.5) * 2;
  return { kelvin: Math.round(toK(m)), ramp: true };
}
const stopsOf = col => (col.hex ? colourStops(col.hex) : whiteStops(col.kelvin));
const rgbaOf = (h, a) => { const x = String(h).replace('#', ''); return `rgba(${[0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)).join(',')},${a})`; };
function wakeAt(c, w, f) {
  const lv = Math.max(1, Math.round(w.end * f));
  const [h, m] = c.RT.hmAdd(w.start, Math.round(w.minutes * f)).split(':').map(Number);
  return { lv, hm: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, ap: h >= 12 ? 'pm' : 'am', col: wakeColour(c, w, f) };
}
// Everything that moves with the finger is a custom property or a line of text, so a drag never redraws the page.
function sunriseVars(c, w, f) {
  const { col } = wakeAt(c, w, f);
  const st = stopsOf(col);
  return `--f:${f.toFixed(4)};--sun:${st.body};--sun-hi:${st.core};--dawn-1:${rgbaOf(st.body, 0.22)};--dawn-2:${rgbaOf(st.body, 0.22)};--dawn-2b:${rgbaOf('#D98A4E', 0.08)};--dawn-3:${rgbaOf(st.core, 0.1)}`;
}
const STARS = [[64, 38], [118, 92], [206, 70], [232, 128], [282, 50], [300, 110], [330, 30], [150, 140]];
export function sunriseHTML(c, w, key) {
  const { esc, RT } = c;
  const d = c.data.dev(w.lamp);
  if (!d) return '';
  const tr = c.ui.wakeTry && c.ui.wakeTry.key === key ? c.ui.wakeTry : null;
  const f = clamp01(((c.ui.sunrise || {})[key]) || 0);
  const now = wakeAt(c, w, f);
  const ramp = [0, 0.5, 1].map(x => stopsOf(wakeAt(c, w, x).col).body);
  const alarm = RT.hmAdd(w.start, w.minutes);
  // a tap on the try button only says Hold: a stray tap at 11 pm would light the room someone is sleeping in
  const hint = c.ui.wakeHint && Date.now() - c.ui.wakeHint < 2000;
  const trying = tr ? `<button class="pill solid sr-try" data-act="wake-put-back">Put back</button><p class="t-cap muted sr-note">${Date.now() - tr.at < 30000 ? `Rising to ${w.end}%` : `At ${w.end}%`}</p>`
    : `<button class="pill ghost hold-pill sr-try" data-hold="wake-try" data-ms="600" data-act="wake-try-hint" data-key="${esc(key)}" data-lamp="${esc(w.lamp)}" data-end="${w.end}" aria-label="Hold to try it on ${esc(d.name)}">${hint ? 'Hold' : `Try it on ${esc(d.name)}`}</button>`;
  return `<div class="sunrise" data-sunrise="${esc(key)}" data-w="${esc(JSON.stringify(w))}" style="${sunriseVars(c, w, f)}">
    <div class="dawn" aria-hidden="true"><i class="d1"></i><i class="d2"></i><i class="d3"></i></div>
    <div class="sr-window" aria-hidden="true">
      <i class="sr-am"></i>
      <span class="sr-stars">${STARS.map(([x, y]) => `<i style="left:${(x / 372 * 100).toFixed(1)}%;top:${y}px"></i>`).join('')}</span>
      <span class="sr-sun">${glowHTML({ level: now.lv, ...(now.col.hex ? { hex: now.col.hex } : { kelvin: now.col.kelvin }), ctx: 'orb', cls: 'sr-glow' })}<i class="sr-disc"></i></span>
      <svg class="sr-hills" viewBox="0 0 372 100" preserveAspectRatio="none"><path class="far" d="M-72 58C8 -6 166 -8 250 58V100H-72z"/><path class="near" d="M158 64C230 2 402 2 490 64V100H158z"/><rect class="ground" x="-1" y="34" width="374" height="66"/></svg>
      <div class="sr-clock"><span class="sr-hm">${now.hm}</span><span class="sr-ap"> ${now.ap}</span></div>
      <div class="sr-level">${now.lv}%</div>
    </div>
    <div class="sr-scrub">
      <span class="sr-label" aria-hidden="true">${now.hm} ${now.ap} · ${now.lv}%</span>
      <div class="sr-track" role="slider" aria-label="Preview the wake-up light" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(f * 100)}" style="--ramp:linear-gradient(90deg, ${ramp.join(', ')})"><i class="sr-fill"></i><i class="sr-knob"></i></div>
      <div class="sr-ends"><span>${esc(RT.fmtTime(w.start))}</span><span>${esc(RT.fmtTime(alarm))}</span></div>
    </div>
    ${trying}
  </div>`;
}
// Set the preview to f in place: the custom properties, the numbers, the sun's glow.
function paintSunrise(c, root, f) {
  let w; try { w = JSON.parse(root.dataset.w); } catch (_) { return; }
  const now = wakeAt(c, w, f);
  root.setAttribute('style', sunriseVars(c, w, f));
  root.querySelector('.sr-hm').textContent = now.hm;
  root.querySelector('.sr-ap').textContent = ` ${now.ap}`;
  root.querySelector('.sr-level').textContent = `${now.lv}%`;
  root.querySelector('.sr-label').textContent = `${now.hm} ${now.ap} · ${now.lv}%`;
  root.querySelector('.sr-track').setAttribute('aria-valuenow', String(Math.round(f * 100)));
  setGlow(root.querySelector('.sr-glow'), { level: now.lv, ...(now.col.hex ? { hex: now.col.hex } : { kelvin: now.col.kelvin }), ctx: 'orb' });
  (c.ui.sunrise || (c.ui.sunrise = {}))[root.dataset.sunrise] = f;
}
// The knob is a grip; a sideways drag on the track scrubs and an up or down swipe scrolls. Under the finger the sun
// is locked to it, no easing (M6), and the numbers step.
export function wireSunrise(c, scr) {
  for (const root of scr.querySelectorAll('[data-sunrise]')) {
    const tr = root.querySelector('.sr-track');
    const at = e => { const r = tr.getBoundingClientRect(); return clamp01((e.clientX - r.left - 28) / Math.max(1, r.width - 56)); };
    track(tr, {
      c, axis: 'x',
      grab: e => !!e.target.closest('.sr-knob'),
      start: () => { root.classList.add('scrubbing'); if (c.ui.wakeTry) stopTry(c); },
      move: e => paintSunrise(c, root, at(e)),
      end: () => root.classList.remove('scrubbing'),
      tap: e => paintSunrise(c, root, at(e)),
    });
  }
  // a try on the lamp plays the rise across the screen as the lamp does it
  const t = c.ui.wakeTry;
  if (t && !t.raf && Date.now() - t.at < 30000) {
    const step = () => {
      if (c.ui.wakeTry !== t) return;
      const f = clamp01((Date.now() - t.at) / 30000);
      const el = document.querySelector(`[data-sunrise="${CSS.escape(t.key)}"]`);
      if (el) paintSunrise(c, el, f); else (c.ui.sunrise || (c.ui.sunrise = {}))[t.key] = f;
      if (f < 1) t.raf = requestAnimationFrame(step); else { t.raf = 0; c.render(); }
    };
    t.raf = requestAnimationFrame(step);
  }
}
function stopTry(c) { const t = c.ui.wakeTry; if (t && t.raf) cancelAnimationFrame(t.raf); if (t) t.raf = 0; }
export const sunriseActions = {
  // a tap says how and does nothing: a stray tap at 11 pm would light the room someone is sleeping in
  'wake-try-hint'(c) { c.ui.wakeHint = Date.now(); c.render(); setTimeout(() => c.render(), 2100); },
  // held 0.6 s: the real lamp runs the rise compressed to 30 s, from where it is now
  'wake-try'(c, el) {
    const id = el.dataset.lamp, end = Number(el.dataset.end) || 50;
    if (!c.data.dev(id)) return;
    stopTry(c);
    c.ui.wakeTry = { key: el.dataset.key, id, prev: c.data.level(id) || 0, at: Date.now(), raf: 0 };
    (c.ui.sunrise || (c.ui.sunrise = {}))[el.dataset.key] = 0;
    c.render();
    c.run({ type: 'level', target: `d:${id}`, level: end, fade: 30 });
  },
  // exactly what it was before the try: off, or the level it was at
  'wake-put-back'(c) {
    const t = c.ui.wakeTry; if (!t) return;
    stopTry(c); c.ui.wakeTry = null;
    c.turn(t.prev ? { type: 'level', target: `d:${t.id}`, level: t.prev } : { type: 'level', target: `d:${t.id}`, level: 'off', fade: 0.4 });
    c.render();
  },
};
export function after(c, r, scr) { wireSunrise(c, scr); }

// ---------- the sheets ----------
function whenSheet(c, sc, mode) {
  const { esc, RT } = c;
  const cur = mode === 'off' ? (RT.pairOf(sc) || {}).at : sc.at;
  const w = c.ui.when && c.ui.when.id === sc.id && c.ui.when.mode === mode ? c.ui.when : (c.ui.when = {
    id: sc.id, mode, type: cur ? cur.type : 'time', time: cur && cur.time ? cur.time : (mode === 'off' ? c.S.config.settings.night_start || '22:00' : '18:00'),
    rel: cur && cur.offset_min ? (cur.offset_min < 0 ? 'before' : 'after') : 'at', mins: cur && cur.offset_min ? Math.abs(cur.offset_min) : 30,
  });
  const at = w.type === 'time' ? { type: 'time', time: w.time, offset_min: 0 } : { type: w.type, time: null, offset_min: w.rel === 'at' ? 0 : (w.rel === 'before' ? -w.mins : w.mins) };
  const chip = (act, v, l, on) => `<button class="chip sm" aria-pressed="${on}" data-act="${act}" data-v="${v}">${l}</button>`;
  let body = `<div class="chip-wrap">${[['time', 'At a time'], ['sunset', 'Sunset'], ['sunrise', 'Sunrise']].map(([v, l]) => chip('w-type', v, l, w.type === v)).join('')}</div>`;
  // the chosen way carries its tick, as every other list of ways does
  if (mode === 'off') body = `<div class="group"><button class="row way ${RT.pairOf(sc) ? '' : 'sel'}" data-act="off-leave"><span class="radio ${RT.pairOf(sc) ? '' : 'on'}">${RT.pairOf(sc) ? '' : c.icon('check', 14, 2.2)}</span><span class="row-txt"><span class="t">Leave them as they are</span></span></button>
      <button class="row way" data-act="off-bedtime"><span class="radio"></span><span class="row-txt"><span class="t">At bedtime (${esc(RT.fmtTime(c.S.config.settings.night_start))})</span></span></button></div>` + body;
  if (w.type === 'time') body += `<div class="when-time"><input class="time-big" type="time" value="${esc(w.time)}" data-change="w-time" aria-label="Time"></div>`;
  else {
    body += `<div class="chip-wrap">${[['at', 'On the dot'], ['before', 'Before'], ['after', 'After']].map(([v, l]) => chip('w-rel', v, l, w.rel === v)).join('')}</div>`;
    if (w.rel !== 'at') body += `<div class="chip-wrap">${[10, 20, 30, 45, 60, 90].map(m => chip('w-mins', m, `${m} min`, w.mins === m)).join('')}</div>`;
    const hm = c.S.config.settings.location ? RT.sunAt(at.type, at.offset_min) : null;
    body += `${hm ? `<p class="t-body sheet-p when-say">${esc(RT.fmtTime(hm))} today</p>` : ''}${whereBlock(c)}`;
  }
  const can = w.type === 'time' || !!c.S.config.settings.location;
  body += `<div class="sheet-btns"><button class="pill solid" data-act="w-use" ${can ? '' : 'disabled'}>Use this time</button></div>`;
  return { over: sc.name, title: mode === 'off' ? 'Off again when?' : 'When?', body: `<div class="when">${body}</div>` };
}
function daysSheet(c, sc) {
  const { RT } = c;
  const days = sc.days || RT.ALL_DAYS;
  return { over: sc.name, title: 'Which days?', body: `<div class="days-s">
    <div class="dd-row">${RT.WEEK.map(i => `<button class="dd big ${days.includes(i) ? 'on' : ''}" data-act="day" data-d="${i}" aria-pressed="${days.includes(i)}" aria-label="${RT.DAY_LONG[i]}">${RT.DAY_LETTER[i]}</button>`).join('')}</div>
    <div class="chip-wrap">${[['all', 'Every day'], ['weekdays', 'Weekdays'], ['weekends', 'Weekends']].map(([v, l]) => `<button class="chip sm" aria-pressed="${RT.QUICK_DAYS[v].join() === [...days].sort().join()}" data-act="days-quick" data-v="${v}">${l}</button>`).join('')}</div>
</div>` };
}
function whatSheet(c, sc) {
  const { esc, icon, RT } = c;
  const { L, Sh } = RT.splitOf(sc);
  const rid = RT.recipeOf(sc, L, Sh);
  const rows = RT.AUTO_RECIPES.filter(x => RT.recipeApplies(x, L, Sh)).map(x => `<button class="row way ${rid === x.id ? 'sel' : ''} ${x.d ? 'two' : ''}" data-act="what" data-r="${x.id}"><span class="radio ${rid === x.id ? 'on' : ''}">${rid === x.id ? icon('check', 14, 2.2) : ''}</span><span class="row-txt"><span class="t">${esc(x.t)}</span>${x.d ? `<span class="d">${esc(x.d)}</span>` : ''}</span>${x.pick ? `<span class="row-chev">${icon('chev', 16, 1.8)}</span>` : ''}</button>`).join('');
  const custom = rid === 'custom' ? `<div class="group"><div class="row way sel two"><span class="radio on">${icon('check', 14, 2.2)}</span><span class="row-txt"><span class="t">Your own steps</span><span class="d">${esc(c.data.describe(sc.actions))}</span></span></div></div>` : '';
  return { over: sc.name, title: 'What it does', body: `${custom}<div class="group">${rows}</div>
    <button class="card-row press-steps" data-act="steps"><span class="row-ic">${icon('tune', 18, 1.6)}</span><span class="row-txt"><span class="t">Step by step</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` };
}
function lightsSheet(c, sc) {
  const { esc, icon, data, RT } = c;
  const { L, Sh } = RT.splitOf(sc);
  const sel = [...L, ...Sh];
  const box = on => `<span class="box ${on ? 'on' : ''}">${on ? icon('check', 14, 2.2) : ''}</span>`;
  const row = (t, name, sub) => `<button class="row ck" data-act="light" data-t="${esc(t)}" aria-pressed="${sel.includes(t)}"><span class="row-txt"><span class="t">${esc(name)}</span>${sub ? `<span class="d">${esc(sub)}</span>` : ''}</span>${box(sel.includes(t))}</button>`;
  const rooms = RT.lightRooms();
  const shades = data.controllable().filter(d => d.domain === 'cover');
  const lights = rooms.map(a => {
    const ds = data.controllable().filter(d => data.devArea(d) === a.id && d.domain !== 'cover');
    return `<div class="t-over sec-s">${esc(a.name)}</div><div class="group">${row(`a:${a.id}`, `All of ${a.name}`, '')}${ds.map(d => row(`d:${d.device_id}`, d.name, '')).join('')}</div>`;
  }).join('');
  return { over: sc.name, title: 'Which lights?', body: `<div class="group">${row('h:all', 'Everything', '')}</div>${lights}
    ${shades.length ? `<div class="t-over sec-s">Shades</div><div class="group">${row('h:shades', 'All shades', '')}${shades.map(d => row(`d:${d.device_id}`, d.name, data.devAreaName(d))).join('')}</div>` : ''}
    ${data.groups().length ? `<div class="t-over sec-s">Your sets</div><div class="group">${data.groups().map(g => row(`g:${g.id}`, g.name, `${plural(g.device_ids.length, 'light')}`)).join('')}</div>` : ''}` };
}
function onlyIfSheet(c, sc) {
  const { icon } = c;
  const opts = [[null, 'Every time'], ['all_off', 'Everything is off'], ['any_on', 'Something is on']];
  return { over: sc.name, title: 'Only if', body: `<div class="group">${opts.map(([v, t]) => { const on = (sc.only_if || null) === v; return `<button class="row way ${on ? 'sel' : ''}" data-act="onlyif" data-v="${v || ''}"><span class="radio ${on ? 'on' : ''}">${on ? icon('check', 14, 2.2) : ''}</span><span class="row-txt"><span class="t">${t}</span></span></button>`; }).join('')}</div>` };
}
function moreSheet(c, sc) {
  const { esc, icon, RT } = c;
  const fade = RT.fadeOf(sc);
  const FADE = [['', 'As usual'], [0, 'At once'], [1, '1 second'], [3, '3 seconds'], [8, '8 seconds'], [30, '30 seconds'], [120, '2 minutes'], [600, '10 minutes'], [1200, '20 minutes'], [1800, '30 minutes']];
  return { over: 'Routine', title: sc.name || 'Routine', body: `<div class="group">
      <button class="row kv" data-act="name"><span class="row-txt"><span class="t">Name</span></span><span class="row-val">${esc(sc.name)}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      ${sc.actions.some(a => a.type === 'level') ? `<label class="row"><span class="row-txt"><span class="t">Fade</span></span><select class="field sel" data-change="fade" aria-label="Fade">${FADE.map(([v, l]) => `<option value="${v}" ${String(fade ?? '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      <button class="row" data-act="steps"><span class="row-txt"><span class="t">Step by step</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    </div>
    <div class="group"><button class="row" data-act="delete"><span class="row-txt"><span class="t">Delete routine</span></span></button></div>` };
}
function stepsSheet(c, sc) {
  return { over: sc.name, title: 'Step by step', body: `<div class="steps">${stepCards(c, sc.actions)}
    <div class="sheet-btns"><button class="pill solid" data-act="st-add">Add a step</button><button class="pill ghost" data-act="try">Try it</button></div></div>` };
}
function scenesSheet(c, sc) {
  const { esc, data, H } = c;
  const items = [...data.presets().map(p => [{ type: 'preset', preset_id: p.id }, H.sceneShortName(p), p.area ? data.areaName(p.area) : 'Any room']), ...data.lutronScenes().map(s => [{ type: 'scene', scene_id: s.scene_id }, s.name, 'Lutron app'])];
  return { over: sc.name, title: 'Which scene?', body: items.length ? `<div class="group">${items.map(([a, n, s]) => `<button class="row two" data-act="scene" data-a="${esc(JSON.stringify(a))}"><span class="row-txt"><span class="t">${esc(n)}</span><span class="d">${esc(s)}</span></span></button>`).join('')}</div>` : '<p class="t-body muted sheet-p">No scenes yet.</p>' };
}

const SHEETS = { when: (c, sc) => whenSheet(c, sc, 'at'), off: (c, sc) => whenSheet(c, sc, 'off'), days: daysSheet, what: whatSheet, lights: lightsSheet, onlyif: onlyIfSheet, more: moreSheet };
export function sheetFor(c, r) {
  const sc = sc0(c, r); const make = sc && r.sub && SHEETS[r.sub];
  return make ? { spec: make(c, sc), parent: `routine/${r.id}` } : null;
}

// ---------- taps ----------
async function tryIt(c, sc) {
  for (const a of sc.actions) {
    if (a.type === 'delay') { await new Promise(res => setTimeout(res, Math.min(a.ms || 0, 5000))); continue; }
    if (!(await c.run(a))) return;
  }
  c.toast('Done');
}
function whenAt(w) { return w.type === 'time' ? { type: 'time', time: w.time, offset_min: 0 } : { type: w.type, time: null, offset_min: w.rel === 'at' ? 0 : (w.rel === 'before' ? -w.mins : w.mins) }; }
// the title stays "New routine" while it is being made, until it is named or left
const done = (c, sc, msg) => c.save(msg);

export const actions = {
  ...whereActions,
  ...runActions,
  ...sunriseActions,
  day(c, el, r) {
    const sc = sc0(c, r); if (!sc) return;
    if (!c.RT.toggleDay(sc, Number(el.dataset.d))) { c.toast('Pick at least one day'); return; }
    done(c, sc, `Runs ${c.RT.daysText(sc.days).replace(/^Every/, 'every')}`);
  },
  'days-quick'(c, el, r) { const sc = sc0(c, r); if (!sc) return; c.RT.setDays(sc, c.RT.QUICK_DAYS[el.dataset.v]); done(c, sc, `Runs ${c.RT.daysText(sc.days).replace(/^Every/, 'every')}`); },
  'w-type'(c, el) { c.ui.when.type = el.dataset.v; c.render(); },
  'w-rel'(c, el) { c.ui.when.rel = el.dataset.v; c.render(); },
  'w-mins'(c, el) { c.ui.when.mins = Number(el.dataset.v); c.render(); },
  'w-time'(c, el, r, v) { if (/^\d\d:\d\d$/.test(v)) c.ui.when.time = v; },
  'w-use'(c, el, r) {
    const sc = sc0(c, r); const w = c.ui.when; if (!sc || !w) return;
    const at = whenAt(w);
    if (w.mode === 'off') c.RT.setOff(sc, at); else c.RT.setWhen(sc, at);
    c.ui.when = null;
    // closed as its X closes it: a step back to the routine, not the routine written over the sheet's step
    c.dismiss();
    done(c, sc, w.mode === 'off' ? `Off again ${c.RT.whenClause(at)}` : `Runs ${c.RT.whenClause(at)}`);
  },
  'off-leave'(c, el, r) { const sc = sc0(c, r); if (!sc) return; c.RT.setOff(sc, null); c.ui.when = null; c.dismiss(); done(c, sc, 'Left as they are'); },
  'off-bedtime'(c, el, r) {
    const sc = sc0(c, r); if (!sc) return;
    const at = { type: 'time', time: c.S.config.settings.night_start, offset_min: 0 };
    c.RT.setOff(sc, at); c.ui.when = null; c.dismiss();
    done(c, sc, `Off again at bedtime`);
  },
  what(c, el, r) {
    const sc = sc0(c, r); if (!sc) return;
    const rid = el.dataset.r;
    if (rid === 'scene') { c.openPicker('scene', c2 => scenesSheet(c2, sc0(c2, r) || sc)); return; }
    const { L, Sh } = c.RT.splitOf(sc);
    if (c.RT.setRecipe(sc, rid, L, Sh)) done(c, sc, c.RT.whatValue(sc));
  },
  scene(c, el, r) { const sc = sc0(c, r); if (!sc) return; c.RT.setScene(sc, JSON.parse(el.dataset.a)); c.closePicker(); done(c, sc, c.RT.whatValue(sc)); },
  light(c, el, r) {
    const sc = sc0(c, r); if (!sc) return;
    const { L, Sh } = c.RT.splitOf(sc);
    const all = [...L, ...Sh]; const t = el.dataset.t;
    let next;
    if (all.includes(t)) { if (all.length === 1) { c.toast('Keep at least one'); return; } next = all.filter(x => x !== t); }
    else next = c.REM.normalizeTargets([...all, t], t);
    const s = c.RT.splitT(next);
    c.RT.setTargets(sc, s.L, s.Sh);
    done(c, sc, `${lightsWord(c, sc)}`);
  },
  onlyif(c, el, r) { const sc = sc0(c, r); if (!sc) return; c.RT.setOnlyIf(sc, el.dataset.v || null); done(c, sc, c.RT.onlyIfText(sc.only_if)); },
  fade(c, el, r, v) { const sc = sc0(c, r); if (!sc) return; c.RT.setFade(sc, v === '' ? null : v); c.saveSoon(300); },
  name(c, el, r) { const sc = sc0(c, r); if (sc) c.openPicker('name', c2 => nameSheet(c2, { over: 'Routine', title: 'Name', value: sc.name, act: 'rt-name', max: 60 })); },
  'rt-name'(c, form, r, v) { const sc = sc0(c, r); if (!sc || !String(v).trim()) return; c.RT.rename(sc, v); c.ui.freshRoutine = null; c.saveSoon(); },
  steps(c, el, r) { const sc = sc0(c, r); if (sc) c.openPicker('steps', c2 => stepsSheet(c2, sc0(c2, r) || sc)); },
  'st-add'(c, el, r) {
    const sc = sc0(c, r); if (!sc) return;
    const { L, Sh } = c.RT.splitOf(sc);
    sc.actions.push(c.REM.freshAction('level', c.REM.packTarget(L.length ? L : Sh.length ? Sh : ['h:all'])));
    c.RT.syncPair(sc); c.save('', { quiet: true });
  },
  'st-remove'(c, el, r) {
    const sc = sc0(c, r); if (!sc) return;
    if (sc.actions.length === 1) { c.toast('A routine needs one step at least'); return; }
    sc.actions.splice(Number(el.dataset.i), 1); c.save('Step removed');
  },
  'st-edit'(c, el, r, v) {
    const sc = sc0(c, r); if (!sc) return;
    const k = el.dataset.k; const i = Number(el.dataset.i);
    if (k === 'target') sc.actions[i].target = v.startsWith('[') ? JSON.parse(v) : v;
    else c.REM.editAction(sc.actions, i, k, v);
    c.saveSoon(300);
    if (k === 'type' || k === 'scene_ref') c.render();
  },
  try(c, el, r) { const sc = sc0(c, r); if (sc) tryIt(c, sc); },
  delete(c, el, r) {
    const sc = sc0(c, r); if (!sc) return;
    c.openPicker('delete', () => confirmSheet(c, { over: sc.name, title: 'Delete this routine?', act: 'delete-go', yes: 'Delete', text: 'It stops running. Your lights stay as they are.' }));
  },
  async 'delete-go'(c, el, r) {
    const sc = sc0(c, r); if (!sc) return;
    const prev = JSON.stringify(c.S.config);
    c.RT.remove(sc.id);
    // off the page it was on, as Back would go: to Routines, or wherever the routine was opened from
    c.leave('routines');
    await c.save('', { quiet: true });
    c.toast(`${sc.name || 'Routine'} deleted`, { keepUndo: true, undo: async () => { c.data.restoreConfig(prev); await c.save('Put back'); } });
  },
};
