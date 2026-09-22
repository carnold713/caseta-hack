// 24 · Activity (12744:112331): what happened, newest first, grouped by when. A remote pressed and what it did, a
// routine that ran (or could not), a change made from this app, the house computer coming and going. Filters for
// the first three.
import { picoSVG } from '/ui/pico.js';

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
    html += `<div class="ev">${art}<div class="ev-t"><p>${esc(L.text)}</p><span>${esc(RT.fmtTime(RT.zparts(new Date(e.at)).hm))}</span></div></div>`;
  }
  if (cur) html += '</div>';
  return `<div class="activity-page">
    <header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">Activity</h1>
    <div class="chip-wrap act-f">${FILTERS.map(([k, l]) => `<button class="chip" aria-pressed="${f === k}" data-act="filter" data-f="${k}">${l}</button>`).join('')}</div>
    ${html || `<p class="t-body muted soon">${f === 'all' ? 'Nothing yet. Press a remote button and it shows up here.' : 'Nothing of that kind yet.'}</p>`}
  </div>`;
}
function picoMini(c, d) { return picoSVG({ model: c.REM.modelFor(d), finish: c.REM.finishFor(d), keys: c.REM.slots(d), height: 32 }); }

export const actions = {
  filter(c, el) { c.ui.actFilter = el.dataset.f; c.render(); },
};
