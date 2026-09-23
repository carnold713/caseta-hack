// 24 · Activity (12744:112331): what happened, newest first, grouped by when. A remote pressed and what it did, a
// routine that ran (or could not), a change made from this app, the house computer coming and going. Filters for
// the first three.
//
// 14 · Activity as a light log (12815:51909, 12815:52130). Above the list, the day drawn as the light it was:
// "Today in light" (how long the house was lit, the evening's softest level, the lamp on longest, with the day's
// curve), then a ribbon per room, a heat strip of when it was lit and how bright, with a now line. Tap or drag along
// the ribbons to read a moment ("7:48 pm · Living room 62% · Warm · by the Kitchen Pico") with the matching log row
// lit. A record, never a control: nothing here touches a light. It is drawn from the hub's light history
// (hub/history.js, data.lightHistory), a day at a time, up to seven days back.
import { picoSVG } from '/ui/pico.js';
import { glowHTML, whiteStops } from '/ui/glow.js';
import { track } from '/ui/gesture.js';
import { colourName } from '/ui/colour.js';
import { CasetaDaylight } from '/data/index.js';

export const noTabs = false;

const FILTERS = [['all', 'All'], ['pico', 'Buttons'], ['schedule', 'Routines'], ['app', 'Changes']];

// A result in a few words: "Kitchen off", "Living room to 30%", "Relax".
function result(c, actions) {
  const a = (actions || [])[0]; if (!a) return '';
  const t = a.target ? c.data.targetName(a.target) : '';
  const T = t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  switch (a.type) {
    case 'level': return a.level === 'on' ? `${T} on` : a.level === 'off' || a.level === 0 ? `${T} off` : a.level === 'toggle' ? `${T} on or off` : `${T} to ${a.level}%`;
    case 'preset': return c.data.targetName('p:' + a.preset_id);
    case 'scene': return c.data.targetName('s:' + a.scene_id);
    case 'restore': return `${T} back as it was`;
    case 'timer': return `${T} ${a.level ? `to ${a.level}%` : 'off'} in ${a.minutes} min`;
    case 'fan': return `${T} fan ${a.speed === 'Off' ? 'off' : 'on'}`;
    case 'raise': return c.data.isShadeTarget(a.target) ? `${T} open` : `${T} brighter`;
    case 'lower': return c.data.isShadeTarget(a.target) ? `${T} closed` : `${T} dimmer`;
    default: return c.data.describe([a]);
  }
}
function line(c, e) {
  const { REM, RT, data } = c;
  if (e.kind === 'pico') {
    const d = data.dev(e.device_id);
    const g = e.gesture === 'hold_start' || e.gesture === 'hold_end' ? 'hold' : e.gesture;
    const acts = d ? REM.gestureActions(e.device_id, e.button_number, g) : [];
    const who = `${d ? d.name : 'A remote'}: ${REM.buttonName(e.device_id, e.button_number).toLowerCase()} ${REM.GESTURE_PAST[e.gesture] || 'pressed'}`;
    return { icon: 'remote', pico: d, text: e.bound && acts.length ? `${who} → ${result(c, acts)}` : `${who}${e.bound ? '' : ', nothing set'}` };
  }
  if (e.kind === 'schedule') {
    const sc = RT.byId(e.id);
    const name = e.name || (sc && sc.name) || 'A routine';
    return { icon: 'clock', text: e.ok === false ? `${name} didn't run: ${e.error || "couldn't reach the bridge"}` : `${name} ran${sc ? ` → ${result(c, sc.actions)}` : ''}` };
  }
  if (e.kind === 'app') {
    const a = e.action || {};
    if (a.type === 'timer') return { icon: 'timer', text: `Sleep timer from the app → ${result(c, [a])}` };
    return { icon: 'user', text: `From the app → ${result(c, [a]) || data.describe([a])}` };
  }
  if (e.kind === 'agent') return { icon: 'wifi', text: e.online ? 'The house computer came back' : 'Lost touch with the house computer' };
  return { icon: 'pulse', text: e.kind || 'Something happened' };
}
// "Tonight", "Earlier today", "Yesterday", "Monday", "12 Sep"
function section(c, iso) {
  const RT = c.RT;
  const d = new Date(iso); const z = RT.zparts(d);
  const rel = RT.dayRel(z.date);
  if (rel === 'today') return RT.hmMin(z.hm) >= 17 * 60 ? 'Tonight' : 'Earlier today';
  if (rel === 'yesterday') return 'Yesterday';
  const days = Math.round((Date.parse(RT.today()) - Date.parse(z.date)) / 86400000);
  if (days > 0 && days < 7) return rel;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
// Where a log entry leads: a remote's page, or the one light a change from the app was made to.
function entryGo(c, e) {
  if (e.kind === 'pico' && c.data.dev(e.device_id)) return `remote/${e.device_id}`;
  const t = e.kind === 'app' && e.action && e.action.target;
  if (typeof t === 'string' && t.startsWith('d:') && c.data.dev(t.slice(2))) return `light/${t.slice(2)}`;
  return '';
}

// ---------- the light log ----------
const DAY_MS = 86400000;
const BACK_MAX = 6;   // today and the six days before it: the seven the hub keeps
const FX_LEN = 2600;  // the draw-in, start to the now line settled
// What the page has fetched, by date, and what it is still waiting for. Forgotten when the page is left, so coming
// back to it asks again.
const LOG = { days: {}, asking: {}, failed: {}, drawnAt: {} };
// A light's level as this page last saw it live, and since when: the tail of today past the history the hub sent.
const liveSeen = {};
let M = null;   // the day as last drawn: what a scrub reads from
let scrubTimer = 0;

const dayNum = date => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY_MS;
// Midnight at the home, as an instant: guessed as UTC midnight, then moved by what the home's clock read there.
function dayStart(c, date) {
  let t = dayNum(date) * DAY_MS;
  for (let i = 0; i < 3; i++) {
    const z = c.RT.zparts(new Date(t));
    const off = (dayNum(z.date) - dayNum(date)) * 1440 + c.RT.hmMin(z.hm);
    if (!off) break;
    t -= off * 60000;
  }
  return t;
}
const clockAt = (c, t) => c.RT.fmtTime(c.RT.zparts(new Date(t)).hm);
function dur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
// A light's tone as a colour to draw with: a white on the lamp ramp, a colour lamp in its own colour.
const toneHex = tone => (typeof tone === 'string' && tone[0] === '#' ? tone : whiteStops(tone || 2700).body);
const toneWord = tone => (typeof tone === 'string' && tone[0] === '#' ? colourName(tone) : tone ? CasetaDaylight.warmthName(tone) : '');
const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${[0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(',')},${Math.max(0, Math.min(1, a)).toFixed(3)})`; };

function ask(c, date, from, to) {
  if (LOG.asking[date]) return;
  LOG.asking[date] = true;
  c.data.lightHistory(from, to).then(r => {
    LOG.days[date] = { lights: r.lights || {}, since: r.since == null ? null : r.since, at: Date.now() };
    delete LOG.failed[date];
  }).catch(e => { LOG.failed[date] = e.message || 'unavailable'; })
    .finally(() => { LOG.asking[date] = false; c.render(); });
}

// Each light's lit spans on the day, [{a, b, l, tone}], from the history and, for today, what it is doing now.
function lightSpans(c, day, from, end, today) {
  const out = {};
  const ids = new Set([...Object.keys(day.lights), ...(today ? c.data.controllable().map(d => d.device_id) : [])]);
  for (const id of ids) {
    const d = c.data.dev(id);
    if (!d || (d.domain !== 'light' && d.domain !== 'switch')) continue;
    const rows = (day.lights[id] || []).slice();
    if (today) {
      const st = c.S.states[id] || {}; const lv = c.data.level(id);
      const col = st.color || {};
      const tone = col.mode === 'xy' && col.hex ? col.hex.toLowerCase() : col.kelvin || null;
      const seen = liveSeen[id];
      if (!seen || seen.l !== lv) liveSeen[id] = { l: lv, t: Date.now() };
      const last = rows[rows.length - 1];
      if (lv != null && (last ? last[1] !== lv : lv > 0)) rows.push([Math.max(last ? last[0] : from, Math.min(liveSeen[id].t, day.at), from), lv, lv > 0 ? tone : null]);
    }
    const spans = [];
    rows.forEach(([t, l, tone], i) => {
      const a = Math.max(from, t), b = Math.min(end, i + 1 < rows.length ? rows[i + 1][0] : end);
      if (l > 0 && b > a) spans.push({ a, b, l, tone });
    });
    if (spans.length) out[id] = spans;
  }
  return out;
}
// A room's ribbon: at each moment the brightest of its lights, in that light's tone.
function roomSpans(spans, ids) {
  const own = ids.flatMap(id => spans[id] || []);
  if (!own.length) return [];
  const pts = [...new Set(own.flatMap(s => [s.a, s.b]))].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    let best = null;
    for (const s of own) if (s.a <= a && s.b >= b && (!best || s.l > best.l)) best = s;
    if (!best) continue;
    const prev = out[out.length - 1];
    if (prev && prev.b === a && prev.l === best.l && prev.tone === best.tone) prev.b = b;
    else out.push({ a, b, l: best.l, tone: best.tone });
  }
  return out;
}
// Where the house was lit at all: the union of every light's spans.
function union(list) {
  const s = list.slice().sort((x, y) => x.a - y.a); const out = [];
  for (const x of s) { const p = out[out.length - 1]; if (p && x.a <= p.b) p.b = Math.max(p.b, x.b); else out.push({ a: x.a, b: x.b }); }
  return out;
}
// The rooms an entry in the log touched, for its tick on the ribbons and for saying who a change was by.
function entryRooms(c, e) {
  const { data, REM, RT } = c;
  let acts = [];
  if (e.kind === 'pico') acts = REM.gestureActions(e.device_id, e.button_number, e.gesture === 'hold_start' || e.gesture === 'hold_end' ? 'hold' : e.gesture);
  else if (e.kind === 'schedule') acts = (RT.byId(e.id) || {}).actions || [];
  else if (e.kind === 'app') acts = [e.action || {}];
  const ids = new Set();
  for (const a of acts) {
    if (a.target) for (const id of data.targetDevices(a.target)) ids.add(id);
    if (a.type === 'preset') { const p = data.presets().find(x => x.id === a.preset_id); if (p) for (const id of Object.keys(p.levels || {})) ids.add(id); }
  }
  const rooms = new Set([...ids].map(id => data.devArea(data.dev(id))));
  if (e.kind === 'pico' && !rooms.size && data.dev(e.device_id)) rooms.add(data.devArea(data.dev(e.device_id)));
  return rooms;
}
const byWho = (c, e) => (e.kind === 'pico' ? `by the ${(c.data.dev(e.device_id) || {}).name || 'remote'}` : e.kind === 'schedule' ? `by ${e.name || (c.RT.byId(e.id) || {}).name || 'a routine'}` : 'from the app');

// Everything the card and the ribbons say about one day.
function dayModel(c, back) {
  const { RT, data, H } = c;
  const date = RT.addDays(RT.today(), -back);
  const today = back === 0;
  const from = dayStart(c, date), to = dayStart(c, RT.addDays(date, 1));
  const now = Date.now();
  const day = LOG.days[date];
  if (!day) { if (!LOG.failed[date]) ask(c, date, from, today ? now : to); return { date, today, from, to, loading: !LOG.failed[date], failed: LOG.failed[date] || null }; }
  const end = today ? Math.min(now, to) : to;
  // the strip runs from midnight to now (at least six hours of it early in the morning), or the whole day
  const span = today ? Math.max(end, from + 6 * 3600000) - from : to - from;
  const spans = lightSpans(c, day, from, end, today);
  const rooms = data.areas().map(a => {
    const ids = H.roomLights(a.id).map(d => d.device_id);
    return { id: a.id, name: a.name, ids, segs: roomSpans(spans, ids) };
  }).filter(r => r.ids.length);
  const all = Object.values(spans).flat();
  const lit = union(all);
  const litMs = lit.reduce((s, x) => s + x.b - x.a, 0);
  // after dark: from today's sunset, or six in the evening before the connector has said
  const sunset = RT.sunAt('sunset');
  const dark = from + RT.hmMin(sunset || '18:00') * 60000;
  let softest = null;
  for (const [id, ss] of Object.entries(spans)) for (const s of ss) {
    if (s.b <= dark) continue;
    const t = Math.max(s.a, dark);
    if (!softest || s.l < softest.l || (s.l === softest.l && t < softest.t)) softest = { l: s.l, t, id, tone: s.tone };
  }
  let longest = null;
  for (const [id, ss] of Object.entries(spans)) {
    const ms = ss.reduce((s, x) => s + x.b - x.a, 0);
    if (!longest || ms > longest.ms) longest = { id, ms, l: Math.round(ss.reduce((s, x) => s + x.l * (x.b - x.a), 0) / ms), tone: ss[ss.length - 1].tone };
  }
  const lastOff = lit.length && lit[lit.length - 1].b < end - 60000 && lit[lit.length - 1].b >= dark ? lit[lit.length - 1].b : null;
  // the house's light across the day, sampled and softened into a ridge
  const N = 120; const raw = [];
  for (let i = 0; i <= N; i++) {
    const t = from + span * i / N;
    raw.push(t > end ? null : Object.values(spans).reduce((s, ss) => s + (ss.find(x => x.a <= t && x.b > t) || { l: 0 }).l / 100, 0));
  }
  const curve = raw.map((v, i) => (v == null ? null : raw.slice(Math.max(0, i - 2), i + 3).filter(x => x != null).reduce((a, b, _, l) => a + b / l.length, 0)));
  const avg = litMs ? all.reduce((s, x) => s + x.l * (x.b - x.a), 0) / all.reduce((s, x) => s + (x.b - x.a), 0) : 0;
  const entries = (c.S.activity || []).filter(e => { const t = Date.parse(e.at); return t >= from && t <= end && e.kind !== 'agent'; })
    .map(e => ({ e, t: Date.parse(e.at), rooms: entryRooms(c, e) }));
  // the history itself began after this day did (or has not begun): an empty day is then a wait, not a dark house
  const fresh = day.since == null || day.since > from;
  return { date, today, from, to, end, span, rooms, spans, litMs, softest, longest, lastOff, curve, avg, entries, fresh, dark, empty: !all.length, day };
}

const pct = (m, t) => `${(Math.max(0, Math.min(1, (t - m.from) / m.span)) * 100).toFixed(3)}%`;

// The card: "Today in light".
function lightCard(c, m) {
  const { esc, icon, data, RT } = c;
  const early = m.today && RT.hmMin(RT.nowHm()) < 17 * 60;
  const name = m.today ? 'Today' : RT.dayRel(m.date) === 'yesterday' ? 'Yesterday' : RT.dayRel(m.date);
  const over = early ? 'So far today' : `${name.charAt(0).toUpperCase() + name.slice(1)} in light`;
  const total = dur(m.litMs);
  // the headline counts up in whole hours before it lands (the file's 1 h, 3 h, 5 h, 6 h 20 min)
  const hrs = m.litMs / 3600000;
  const steps = hrs >= 2 ? [0.16, 0.47, 0.79].map(f => `${Math.max(1, Math.round(hrs * f))} h`) : [];
  const W = 332, HGT = 64, TOP = 9;
  const peak = Math.max(...m.curve.filter(v => v != null), 0);
  const pts = m.curve.map((v, i) => (v == null ? null : [W * i / (m.curve.length - 1), HGT - 1 - (peak ? v / peak : 0) * (HGT - 1 - TOP)])).filter(Boolean);
  // a Catmull-Rom ridge through the samples
  let d = '';
  pts.forEach((p, i) => {
    if (!i) { d = `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`; return; }
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p3 = pts[i + 1] || p;
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6], c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  });
  const lastX = pts.length ? pts[pts.length - 1][0] : 0;
  // over the night hours the line is warmer, because the house was
  const ns = c.S.config.settings.night_start;
  const nx = ns ? Math.max(0, Math.min(1, (RT.hmMin(ns) * 60000) / m.span)) : 1;
  let low = '';
  if (m.softest && pts.length) {
    const i = Math.round((m.softest.t - m.from) / m.span * (m.curve.length - 1));
    const p = pts[Math.min(pts.length - 1, Math.max(0, i))];
    low = `<span class="til-low" style="left:${p[0].toFixed(1)}px;top:${p[1].toFixed(1)}px">${glowHTML({ level: m.softest.l, ctx: 'dot', kelvin: 2200, cls: 'til-lowg' })}<i></i></span>`;
  }
  const facts = [];
  if (m.softest) facts.push(`<p class="til-f">${icon('moon', 14, 1.6)}<span>Softest after dark: ${m.softest.l}% in ${esc(data.devAreaName(data.dev(m.softest.id)))} at ${esc(clockAt(c, m.softest.t))}</span></p>`);
  if (m.longest) facts.push(`<p class="til-f"><span class="til-lamp">${glowHTML({ level: m.longest.l, ctx: 'tile', hex: typeof m.longest.tone === 'string' ? m.longest.tone : null, kelvin: typeof m.longest.tone === 'number' ? m.longest.tone : 2700, cls: 'til-lampg' })}<i></i>${icon('lamp', 14, 1.5)}</span><span>On longest: ${esc((data.dev(m.longest.id) || {}).name || 'a light')}</span></p>`);
  if (m.lastOff) facts.push(`<p class="til-f">${icon('power', 14, 1.6)}<span>Everything off at ${esc(clockAt(c, m.lastOff))}</span></p>`);
  return `<div class="til" data-til="${esc(m.date)}">
    ${m.avg ? glowHTML({ level: m.avg, ctx: 'card', kelvin: 2700, x: 340, y: 0, cls: 'til-corner' }) : ''}
    <div class="t-over til-over">${esc(over)}</div>
    <p class="til-lit">Lit for</p>
    <p class="til-h">${steps.map((s, i) => `<span class="til-step" style="--at:${[0, 550, 800][i]}ms;--len:${[550, 250, 250][i]}ms">${s}</span>`).join('')}<span class="til-total ${steps.length ? 'counted' : ''}">${esc(total)}</span></p>
    <p class="til-sub">across the house</p>
    <div class="til-curve"><svg width="${W}" height="${HGT}" viewBox="0 0 ${W} ${HGT}" aria-hidden="true">
      <defs><linearGradient id="til-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC78A" stop-opacity=".45"/><stop offset="1" stop-color="#FFC78A" stop-opacity="0"/></linearGradient>
        <linearGradient id="til-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="${nx.toFixed(3)}" stop-color="#FFD9A8"/><stop offset="${Math.min(1, nx + 0.02).toFixed(3)}" stop-color="#FFB46B"/></linearGradient>
        <filter id="til-blur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>
      <rect class="til-base" x="0" y="${HGT - 1}" width="${W}" height="1"/>
      ${d ? `<path class="til-area" d="${d} L${lastX.toFixed(1)} ${HGT} L0 ${HGT}Z" fill="url(#til-fill)"/>
      <path class="til-glow" d="${d}" pathLength="1" stroke="url(#til-line)" filter="url(#til-blur)"/>
      <path class="til-line" d="${d}" pathLength="1" stroke="url(#til-line)"/>` : ''}
    </svg>${low}</div>
    ${facts.length ? `<div class="til-facts">${facts.join('')}</div>` : ''}
  </div>`;
}

// The ribbons: one per room, the day across it, a now line, and the scrub.
function ribbons(c, m) {
  const { esc, RT } = c;
  const lit = m.rooms.filter(r => r.segs.length);
  const dark = m.rooms.filter(r => !r.segs.length);
  const rows = lit.map((r, i) => {
    const ticks = m.entries.filter(x => x.rooms.has(r.id)).map(x => `<i class="rb-tick" style="left:${pct(m, x.t)}"></i>`).join('');
    const segs = r.segs.map(s => {
      const col = toneHex(s.tone); const colour = typeof s.tone === 'string';
      const a = (0.15 + 0.75 * s.l / 100) * (colour ? 0.8 : 1);
      return `<i class="rb-seg" data-a="${s.a}" data-b="${s.b}" style="left:${pct(m, s.a)};width:calc(${pct(m, s.b)} - ${pct(m, s.a)});background:${rgba(col, a)};box-shadow:0 0 10px ${rgba(col, 0.35 * s.l / 100)}"></i>`;
    }).join('');
    return `<div class="rb" data-aid="${esc(r.id)}"><p class="rb-nm"><span>${esc(r.name)}</span><span class="rb-v"></span></p><div class="rb-strip"><div class="rb-lit" style="--i:${i}">${segs}${ticks}</div></div></div>`;
  }).join('');
  // the clock under the strips: midnight, six, noon, six, and now
  const marks = [[0, '12 am'], [6, '6 am'], [12, 'noon'], [18, '6 pm']].map(([h, l]) => [m.from + h * 3600000, l]);
  if (!m.today) marks.push([m.to, '12 am']);
  const nowAt = m.today ? m.end : null;
  const axis = marks.filter(([t]) => t - m.from <= m.span && (nowAt == null || Math.abs(t - nowAt) > m.span * 0.09))
    .map(([t, l], i, all) => `<span style="left:${pct(m, t)}" class="${!i ? 'first' : t >= m.from + m.span - 1 && i === all.length - 1 ? 'last' : ''}">${l}</span>`).join('')
    + (nowAt != null ? `<span class="${nowAt >= m.from + m.span - 60000 ? 'last' : ''}" style="left:${pct(m, nowAt)}">now</span>` : '');
  const sc = c.ui.logScrub && c.ui.logScrub.date === m.date ? c.ui.logScrub : null;
  const dayName = m.today ? 'Today' : RT.dayRel(m.date) === 'yesterday' ? 'Yesterday' : RT.dayRel(m.date);
  const head = `<div class="ll-head" data-swipe="day">
      <button class="ll-day" data-act="log-day" data-d="1" aria-label="The day before" ${Number(c.ui.logBack || 0) >= BACK_MAX ? 'disabled' : ''}>${c.icon('back', 16, 1.8)}</button>
      <span class="t-over ll-name">${esc(dayName.charAt(0).toUpperCase() + dayName.slice(1))}</span>
      <button class="ll-day next" data-act="log-day" data-d="-1" aria-label="The day after" ${m.today ? 'disabled' : ''}>${c.icon('chev', 16, 1.8)}</button></div>`;
  return `<div class="rbw ${sc ? 'scrubbing' : ''}">
    ${head}
    <div class="rbs" role="img" aria-label="${esc(`${dayName}: ${lit.map(r => r.name).join(', ') || 'no rooms'} lit`)}">${rows}
      ${nowAt != null && lit.length ? `<i class="rb-now" style="left:${pct(m, nowAt)}"></i>` : ''}
    </div>
    <div class="rb-scrub ${sc ? 'on' : ''}"><i class="rb-line"></i><span class="rb-lab"></span></div>
    ${lit.length ? `<div class="rb-axis">${axis}</div>` : ''}
    ${dark.length ? `<p class="rb-dark">${lit.length ? `Not lit ${m.today ? 'today' : 'that day'}` : 'Nothing lit'}: ${esc(dark.map(r => r.name).join(', '))}</p>` : ''}
  </div>`;
}

function lightLog(c) {
  const back = Math.max(0, Math.min(BACK_MAX, Number(c.ui.logBack) || 0));
  const m = dayModel(c, back);
  M = m.day ? m : null;
  const off = c.conn() === 'off' ? `<p class="ll-off">The house is out of touch. This is the light up to when it went quiet.</p>` : '';
  // before the history has come, the page keeps its room so the log does not jump when it lands
  if (m.loading) return `<section class="ll waiting"><div class="til til-wait"></div></section>`;
  if (m.failed && !m.day) return `<section class="ll">${off || '<p class="ll-note">The light history is not here right now. The log below still is.</p>'}</section>`;
  if (m.empty && m.fresh) return `<section class="ll">${off}<p class="ll-note">Light history starts today. Come back this evening.</p></section>`;
  // the day draws in once, the first time it is shown: every piece is a CSS animation told how far in it is (--fx)
  if (LOG.drawnAt[m.date] == null) LOG.drawnAt[m.date] = Date.now();
  const t = Date.now() - LOG.drawnAt[m.date];
  const fx = t < FX_LEN ? ` fx" style="--fx:${-t}ms` : '';
  return `<section class="ll${fx}">${lightCard(c, m)}${ribbons(c, m)}${off}</section>`;
}

// ---------- scrubbing ----------
// A moment on the ribbons: the line there, what the room under the finger was doing and who did it, each room's
// level beside its name, the periods lit at that moment standing out, and the matching log row lit.
function readAt(c, m, t, aid) {
  const room = m.rooms.find(r => r.id === aid) || m.rooms.find(r => r.segs.length);
  if (!room) return null;
  const at = s => s.a <= t && s.b > t;
  const seg = room.segs.find(at);
  // the change that made the room what it was then, and the log entry that lines up with it
  let change = null;
  for (const s of room.segs) { if (s.a <= t) change = Math.max(change || 0, s.a); if (s.b <= t) change = Math.max(change || 0, s.b); }
  let who = null;
  if (change != null) {
    let best = null;
    for (const x of m.entries) if (x.rooms.has(room.id) && Math.abs(x.t - change) < 120000 && (!best || Math.abs(x.t - change) < Math.abs(best.t - change))) best = x;
    who = best;
  }
  const parts = [clockAt(c, t), seg ? `${room.name} ${seg.l}%` : `${room.name} off`];
  if (seg && toneWord(seg.tone)) parts.push(toneWord(seg.tone));
  if (who) parts.push(byWho(c, who.e));
  // the log row: the entry that lines up, else the one nearest in time
  let near = who;
  if (!near) for (const x of m.entries) if (!near || Math.abs(x.t - t) < Math.abs(near.t - t)) near = x;
  return { text: parts.join(' · '), room, row: near ? near.e.at : null };
}
function paintScrub(c, scr, st, settle) {
  const m = M; const w = scr.querySelector('.rbw'); if (!m || !w) return;
  const on = !!st;
  w.classList.toggle('scrubbing', on);
  const box = w.querySelector('.rb-scrub');
  if (box) box.classList.toggle('on', on);
  scr.querySelectorAll('.ev.lit').forEach(e => e.classList.remove('lit'));
  if (!on) { scr.querySelectorAll('.rb-v').forEach(v => { v.textContent = ''; }); scr.querySelectorAll('.rb-seg.at').forEach(s => s.classList.remove('at')); return; }
  const r = readAt(c, m, st.t, st.aid); if (!r) return;
  const x = pct(m, st.t);
  box.style.setProperty('--sx', x);
  // the line runs from under the label to just past the last strip, however many rooms there are
  const rbs = w.querySelector('.rbs');
  if (rbs) box.style.height = `${rbs.offsetTop + rbs.offsetHeight + 6}px`;
  const lab = box.querySelector('.rb-lab');
  lab.textContent = r.text;
  // the label sits over the line, kept inside the strips' width
  const W = box.clientWidth, lw = lab.offsetWidth, sx = W * Math.max(0, Math.min(1, (st.t - m.from) / m.span));
  box.style.setProperty('--lx', `${Math.round(Math.max(0, Math.min(W - lw, sx - lw / 2)))}px`);
  for (const row of w.querySelectorAll('.rb')) {
    const room = m.rooms.find(q => q.id === row.dataset.aid);
    const s = room && room.segs.find(q => q.a <= st.t && q.b > st.t);
    row.querySelector('.rb-v').textContent = s ? `${s.l}%` : '';
    row.classList.toggle('here', !!room && room.id === r.room.id);
  }
  scr.querySelectorAll('.rb-seg').forEach(s => s.classList.toggle('at', Number(s.dataset.a) <= st.t && Number(s.dataset.b) > st.t));
  const ev = r.row ? scr.querySelector(`.ev[data-at="${CSS.escape(r.row)}"]`) : null;
  if (ev) {
    ev.classList.add('lit');
    // the log follows to it once the finger lifts, and only as far as it must: never out from under a drag
    if (settle) { const b = ev.getBoundingClientRect(); if (b.top < 0 || b.bottom > innerHeight - 136) ev.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
}
function scrubFrom(c, scr, e) {
  const m = M; const rbs = scr.querySelector('.rbs'); if (!m || !rbs) return null;
  const b = rbs.getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width));
  let t = m.from + f * m.span;
  if (m.today) t = Math.min(t, m.end);
  const row = [...rbs.querySelectorAll('.rb')].find(el => { const r = el.getBoundingClientRect(); return e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6; });
  const prev = c.ui.logScrub;
  return { date: m.date, t, aid: row ? row.dataset.aid : prev && prev.date === m.date ? prev.aid : null };
}
// The moment stays up a while after the finger lifts, then goes, as the file's tooltip does.
function letGo(c) {
  clearTimeout(scrubTimer);
  scrubTimer = setTimeout(() => { c.ui.logScrub = null; const scr = document.querySelector('#screen'); if (scr && !c.ui.dragging) paintScrub(c, scr, null); }, 4000);
}

export function view(c) {
  const { esc, icon, RT } = c;
  const f = c.ui.actFilter || 'all';
  const all = (c.S.activity || []).filter(e => f === 'all' || e.kind === f || (f === 'app' && e.kind === 'agent'));
  // the press and its release come as one line: a hold's end is not news
  const list = all.filter(e => !(e.kind === 'pico' && e.gesture === 'hold_end')).slice(0, 100);
  let html = ''; let cur = null;
  for (const e of list) {
    const sec = section(c, e.at);
    if (sec !== cur) { if (cur) html += '</div>'; html += `<div class="t-over sec">${esc(sec)}</div><div class="tl">`; cur = sec; }
    const L = line(c, e);
    const art = L.pico ? `<span class="ev-ic pico">${picoMini(c, L.pico)}</span>` : `<span class="ev-ic">${icon(L.icon, 20, 1.4)}</span>`;
    const go = entryGo(c, e);
    html += `<div class="ev" data-at="${esc(e.at)}"${go ? ` data-go="${esc(go)}" role="link"` : ''}>${art}<div class="ev-t"><p>${esc(L.text)}</p><span>${esc(RT.fmtTime(RT.zparts(new Date(e.at)).hm))}</span></div></div>`;
  }
  if (cur) html += '</div>';
  return `<div class="activity-page">
    <header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">Activity</h1>
    <div class="chip-wrap act-f">${FILTERS.map(([k, l]) => `<button class="chip" aria-pressed="${f === k}" data-act="filter" data-f="${k}">${l}</button>`).join('')}</div>
    ${lightLog(c)}
    ${html || `<p class="t-body muted soon">${f === 'all' ? 'Nothing yet. Press a remote button and it shows up here.' : 'Nothing of that kind yet.'}</p>`}
  </div>`;
}
function picoMini(c, d) { return picoSVG({ model: c.REM.modelFor(d), finish: c.REM.finishFor(d), keys: c.REM.slots(d), height: 32 }); }

// After each draw: the ribbons take a sideways drag or a tap (an up or down swipe that starts on them still scrolls),
// and the day header a swipe to another day. A moment being read is put back on the new drawing.
export function after(c, r, scr) {
  const rbs = scr.querySelector('.rbs');
  if (rbs) {
    track(rbs, {
      c, axis: 'x',
      start() { clearTimeout(scrubTimer); },
      move(e) { const st = scrubFrom(c, scr, e); if (st) { c.ui.logScrub = st; paintScrub(c, scr, st); } },
      end() { paintScrub(c, scr, c.ui.logScrub, true); letGo(c); },
      tap(e) { const st = scrubFrom(c, scr, e); if (st) { c.ui.logScrub = st; paintScrub(c, scr, st, true); letGo(c); } },
    });
    if (c.ui.logScrub && M && c.ui.logScrub.date === M.date) paintScrub(c, scr, c.ui.logScrub);
  }
  const head = scr.querySelector('.ll-head');
  if (head) {
    let x0 = null, dx = 0;
    track(head, { c, axis: 'x', start(e) { x0 = e.clientX; dx = 0; }, move(e) { dx = e.clientX - x0; }, end() { if (Math.abs(dx) > 40) toDay(c, dx > 0 ? 1 : -1); } });
  }
}
function toDay(c, d) {
  const next = Math.max(0, Math.min(BACK_MAX, (Number(c.ui.logBack) || 0) + d));
  if (next === (Number(c.ui.logBack) || 0)) return;
  c.ui.logBack = next; c.ui.logScrub = null; clearTimeout(scrubTimer);
  c.render();
}

// Leaving forgets what was fetched, so the next visit asks the hub again; the day and the scrub start fresh.
export function leave(c) {
  for (const k of ['days', 'asking', 'failed', 'drawnAt']) LOG[k] = {};
  c.ui.logBack = 0; c.ui.logScrub = null; clearTimeout(scrubTimer); M = null;
}

export const actions = {
  filter(c, el) { c.ui.actFilter = el.dataset.f; c.render(); },
  'log-day'(c, el) { toDay(c, Number(el.dataset.d) || 0); },
};
