/* Pico Hack: light as a flat disc (docs/ui-concepts.md A, B, D, E, F, H; surfaces from docs/design-spec-v3.md).
   The "Light now" strip on Home, the dark light detail sheet, the Now view and the house slider
   behind the Light now bar, room moods, lamp kinds, the sleep-timer dial and the night look.
   Loaded after home.js; paintState() in core.js calls paintLight() so every real state change
   moves the discs once. */
'use strict';

// ---------- the lamp ramp: five stops, interpolated continuously; off is --lamp-off (--card-2 on light, --now-2 on dark) ----------
const LAMP_RAMP = [[10, '#FDF1E1'], [25, '#FCE3C4'], [50, '#F9C489'], [75, '#F7A64F'], [100, '#F58A1F']];
const LAMP_OFF_DARK = '#38464E'; // --now-2
const MOTION = { d: .36, ease: 'power3.out' };
if (window.gsap && gsap.matchMedia) gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => { MOTION.d = 0; return () => { MOTION.d = .36; }; });

let LAMP_OFF_CACHE = null;
function lampOff() { if (!LAMP_OFF_CACHE) LAMP_OFF_CACHE = (getComputedStyle(document.documentElement).getPropertyValue('--lamp-off') || '#D5D9DC').trim() || '#D5D9DC'; return LAMP_OFF_CACHE; }
function mixHex(a, b, t) {
  const pa = a.slice(1).match(/../g).map(x => parseInt(x, 16)), pb = b.slice(1).match(/../g).map(x => parseInt(x, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function lampColor(lv, dark) {
  const v = Number(lv) || 0;
  if (v <= 0) return dark ? LAMP_OFF_DARK : lampOff();
  if (v <= LAMP_RAMP[0][0]) return LAMP_RAMP[0][1];
  for (let i = 1; i < LAMP_RAMP.length; i++) { const [b, cb] = LAMP_RAMP[i], [a, ca] = LAMP_RAMP[i - 1]; if (v <= b) return mixHex(ca, cb, (v - a) / (b - a)); }
  return LAMP_RAMP[LAMP_RAMP.length - 1][1];
}
const lvText = v => (v > 0 ? `${v}%` : 'Off');
const lvLabel = (v, dim) => (dim ? lvText(v) : v > 0 ? 'On' : 'Off'); // a switch is on or off, never a percentage
const discSize = lv => Math.round(24 + 32 * clamp(lv, 0, 100) / 100);
const heroSize = lv => Math.round(160 + 80 * clamp(lv, 0, 100) / 100);
function lampHTML(lv, size, inner, cls = '', dark = false) { return `<span class="lamp ${lv > 0 ? '' : 'off'} ${cls}" style="width:${size}px;height:${size}px;background:${lampColor(lv, dark)}">${inner || ''}</span>`; }
// One tween, only when something actually changed. Without GSAP (or under reduced motion) the value is set outright.
function tween(el, vars, done) {
  if (!el) return;
  if (window.gsap && MOTION.d > 0) gsap.to(el, { ...vars, duration: MOTION.d, ease: MOTION.ease, overwrite: 'auto', onComplete: done });
  else { for (const [k, v] of Object.entries(vars)) el.style[k] = typeof v === 'number' ? `${v}px` : v; if (done) done(); }
}
function elFrom(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

// ---------- lamp kinds and roles (E) ----------
const KINDS = [
  ['ceiling', 'Ceiling', 'ambient'], ['pendant', 'Pendant', 'ambient'], ['downlights', 'Downlights', 'ambient'],
  ['desk', 'Desk lamp', 'task'], ['reading', 'Reading light', 'task'], ['cabinet', 'Under-cabinet', 'task'],
  ['floor', 'Floor lamp', 'accent'], ['table', 'Table lamp', 'accent'], ['picture', 'Picture light', 'accent'],
];
const KIND_ROLE = Object.fromEntries(KINDS.map(k => [k[0], k[2]]));
const ROLE_LABEL = { ambient: 'Ambient', task: 'Task', accent: 'Accent', decor: 'Decor' };
const ROLE_CAP = { ambient: 'Ambient · fills the room', task: 'Task · light for your hands', accent: 'Accent · lamps and glow' };
function lightKind(id) { return ((S.config && S.config.settings.light_kinds) || {})[id] || null; }
function lightRole(id) { const r = ((S.config && S.config.settings.roles) || {})[id]; if (r) return r; const k = lightKind(id); return k ? KIND_ROLE[k] : null; }
function lightIcon(d) { const k = lightKind(d.device_id); return k ? `lamp-${k}` : domainIcon(d.domain); }
const roomLights = aid => controllable().filter(d => (d.area || 'none') === aid && (d.domain === 'light' || d.domain === 'switch'));
const roomDimmers = aid => roomLights(aid).filter(d => d.domain === 'light');
function meanLevel(ids) { const xs = ids.map(id => level(id) || 0); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0; }
const roomMean = aid => meanLevel(roomLights(aid).map(d => d.device_id));

function openKindSheet(id, opts = {}) {
  const d = dev(id); if (!d) return;
  sheet.open('What kind of light is this?', kindGridHTML(id), { sub: `${esc(d.name)} · ${esc(areaName(d.area))}. Moods use it to know what to dim.`, back: !!opts.back, onBack: opts.back || null });
}
function kindGridHTML(id) {
  const cur = lightKind(id);
  return ['ambient', 'task', 'accent'].map(role => `<div class="kind-cap">${ROLE_CAP[role]}</div><div class="kind-grid">${KINDS.filter(k => k[2] === role).map(k =>
    `<button class="kind ${cur === k[0] ? 'sel' : ''}" data-act="kind-pick" data-id="${id}" data-k="${k[0]}">${ICON('lamp-' + k[0])}<span class="t">${k[1]}</span>${cur === k[0] ? `<span class="chk">${ICON('check', 'sm')}</span>` : ''}</button>`).join('')}</div>`).join('')
    + `<p class="faint small" style="margin:16px 0 0">Tap the chosen one again to clear it.</p>`;
}
function pickKind(id, k) {
  const s = S.config.settings; s.light_kinds = s.light_kinds || {}; s.roles = s.roles || {};
  if (s.light_kinds[id] === k) { delete s.light_kinds[id]; delete s.roles[id]; }
  else { s.light_kinds[id] = k; s.roles[id] = KIND_ROLE[k]; }
  saveSoon();
  sheet.update(kindGridHTML(id));
  const d = dev(id); if (!d) return;
  document.querySelectorAll(`[data-act="kind-open"][data-id="${id}"]`).forEach(b => { b.innerHTML = ICON(lightIcon(d)); });
  document.querySelectorAll('.tile[data-tgt] .face').forEach(f => { delete f.dataset.k; });
  const blk = $('#sortblock'); if (blk && Object.keys(s.light_kinds).length) blk.remove();
  paintLight();
}
// A one-time nudge on Home while nothing is tagged. Dismissable, remembered on this phone.
function sortBlockHTML() {
  const kinds = (S.config.settings.light_kinds) || {};
  const untagged = controllable().filter(d => d.domain === 'light' && !kinds[d.device_id]);
  if (Object.keys(kinds).length || !untagged.length) return '';
  try { if (localStorage.getItem('sortLightsDismissed')) return ''; } catch (_) { /* ignore */ }
  return `<div class="spacer"></div><div class="tip sortblock" id="sortblock"><div class="grow"><span class="cap">Tip</span><div class="t">Let's sort your lights</div><div class="d">Tap the disc next to a light to say what kind of lamp it is. Then Relax, Dinner and Movie know what to dim.</div><button class="btn ghost" data-act="sort-dismiss">Not now</button></div><button class="go" data-act="sort-go" data-id="${untagged[0].device_id}" title="Start with ${esc(untagged[0].name)}">${ICON('chev')}</button></div>`;
}

// ---------- tiles: a little picture of the light each one controls ----------
function tileItems(t) {
  if (t.startsWith('p:')) { const p = presets().find(x => x.id === t.slice(2)); if (!p) return []; return Object.entries(p.levels).filter(([id]) => dev(id)).map(([id, v]) => ({ lv: typeof v === 'number' ? v : (v && v !== 'Off' ? 100 : 0), icon: lightIcon(dev(id)) })); }
  if (t.startsWith('s:')) return [{ lv: 0, icon: 'scene' }];
  return targetDevices(t).map(id => { const d = dev(id); return { lv: isOn(id) ? (level(id) || 100) : 0, icon: d.domain === 'light' || d.domain === 'switch' ? lightIcon(d) : domainIcon(d.domain) }; });
}
function tileFaceHTML(items) {
  if (!items.length) return `<div class="cluster one">${lampHTML(0, 44, ICON('bulb', 'sm'))}</div>`;
  if (items.length === 1) return `<div class="cluster one">${lampHTML(items[0].lv, 44, ICON(items[0].icon, 'sm'))}</div>`;
  const xs = items.slice(0, 4);
  return `<div class="cluster ${['', 'one', 'two', 'three', 'four'][xs.length]}">${xs.map(i => lampHTML(i.lv, 28, ICON(i.icon, 'sm'))).join('')}</div>`;
}
function paintTiles() {
  document.querySelectorAll('.tile[data-tgt] .face').forEach(face => {
    const items = tileItems(face.parentElement.dataset.tgt); const k = items.map(i => `${i.lv}/${i.icon}`).join(',');
    if (face.dataset.k === k) return;
    face.dataset.k = k; face.innerHTML = tileFaceHTML(items);
  });
}

// ---------- moods (D): computed from roles, never stored ----------
const MOODS = [
  { id: 'bright', name: 'Bright', icon: 'sun', head: 100, fade: 1, roles: { ambient: 100, task: 100, accent: 60, decor: 50 }, sw: true },
  { id: 'relax', name: 'Relax', icon: 'sofa', head: 40, fade: 3, roles: { ambient: 35, task: 0, accent: 60, decor: 40 } },
  { id: 'dinner', name: 'Dinner', icon: 'kitchen', head: 60, fade: 3, roles: { ambient: 20, task: 0, accent: 50, decor: 40 } },
  { id: 'movie', name: 'Movie', icon: 'film', head: 20, fade: 8, roles: { ambient: 0, task: 0, accent: 15, decor: 0 } },
  { id: 'night', name: 'Night', icon: 'moon', head: 5, fade: 2, night: true },
];
const moodById = id => MOODS.find(m => m.id === id);
// Levels per light for a mood in a room. Switches are on only in Bright; fans and shades are left alone.
function moodLevels(aid, mood) {
  const ds = roomLights(aid);
  const tagged = ds.some(d => lightRole(d.device_id));
  const out = {};
  if (mood.night) {
    for (const d of ds) out[d.device_id] = d.domain === 'switch' ? 0 : (tagged ? 0 : mood.head);
    if (tagged) {
      const dim = roomDimmers(aid);
      const acc = dim.find(d => lightRole(d.device_id) === 'accent');
      if (acc) out[acc.device_id] = 10;
      else { const amb = dim.find(d => (lightRole(d.device_id) || 'ambient') === 'ambient'); if (amb) out[amb.device_id] = 5; }
    }
    return out;
  }
  for (const d of ds) {
    if (d.domain === 'switch') out[d.device_id] = mood.sw ? 100 : 0;
    else if (!tagged) out[d.device_id] = mood.head;
    else out[d.device_id] = mood.roles[lightRole(d.device_id) || 'ambient'];
  }
  return out;
}
// Which mood the room is in right now, if any (within a couple of percent). A room with mood scenes is matched against them.
function levelsMatch(lv) {
  const ids = Object.keys(lv).filter(dev); if (!ids.length) return false;
  return ids.every(id => { const cur = level(id) || 0, want = typeof lv[id] === 'number' ? lv[id] : (lv[id] && lv[id] !== 'Off' ? 100 : 0); return dev(id).domain === 'switch' || dev(id).domain === 'fan' ? (cur > 0) === (want > 0) : Math.abs(cur - want) <= 2; });
}
function moodMatch(aid) {
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  if (ps.length) { const p = ps.find(x => levelsMatch(x.levels)); return p ? p.mood : null; }
  for (const m of MOODS) { if (levelsMatch(moodLevels(aid, m))) return m.id; }
  return null;
}
// The room card's first row (docs/ux-flows.md 7): the room's five mood scenes, or one chip that makes them.
function moodRowHTML(aid) {
  if (!roomDimmers(aid).length) return '';
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  if (!ps.length) return `<div class="moodrow" data-moods="${aid}"><div class="moods"><button class="chip" data-act="roles-open" data-area="${aid}">${ICON('plus', 'sm')}Make moods…</button></div></div>`;
  const cur = moodMatch(aid);
  return `<div class="moodrow" data-moods="${aid}"><div class="moods">${ps.map(p => { const m = moodById(p.mood); return `<button class="mood ${cur === m.id ? 'sel' : ''}" data-act="mood" data-area="${aid}" data-mood="${m.id}">${lampHTML(presetMax(p), 40, ICON(m.icon, 'sm'))}<span>${m.name}</span></button>`; }).join('')}</div><div class="moodfoot"><button class="btn ghost" data-act="roles-open" data-area="${aid}">Change what each light is for</button></div></div>`;
}
async function applyMood(aid, mid) {
  const m = moodById(mid); if (!m) return;
  const p = (typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : []).find(x => x.mood === mid);
  if (p) { for (const [id, v] of Object.entries(p.levels)) if (dev(id)) S.states[id] = { ...(S.states[id] || {}), level: typeof v === 'number' ? v : (v && v !== 'Off' ? 100 : 0) }; paintState(); await command({ type: 'preset', preset_id: p.id }); return; }
  const lv = moodLevels(aid, m);
  const byLevel = {};
  for (const [id, v] of Object.entries(lv)) { (byLevel[v] = byLevel[v] || []).push(`d:${id}`); S.states[id] = { ...(S.states[id] || {}), level: v }; }
  paintState();
  await Promise.all(Object.entries(byLevel).map(([v, ts]) => command({ type: 'level', target: ts.length === 1 ? ts[0] : ts, level: Number(v), fade: m.fade })));
}
function openMoodSave(aid) {
  const rows = MOODS.map(m => { const lv = moodLevels(aid, m); const desc = Object.entries(lv).map(([id, v]) => `${dev(id).name} ${dev(id).domain === 'switch' ? (v > 0 ? 'on' : 'off') : lvText(v).toLowerCase()}`).join(', '); return `<button class="item" data-act="mood-save-pick" data-area="${aid}" data-mood="${m.id}">${lampHTML(m.head, 40, ICON(m.icon, 'sm'))}<div class="grow"><div class="t">${m.name}</div><div class="d">${esc(desc)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`; }).join('');
  sheet.open('Which mood?', `<div class="card pad0 list">${rows}</div>`, { sub: `It becomes a scene for ${esc(areaName(aid))} that a remote button can run.` });
}
function saveMoodScene(aid, mid) {
  const m = moodById(mid); if (!m) return;
  const name = `${areaName(aid)} · ${m.name}`.slice(0, 60);
  let p = presets().find(x => x.area === aid && x.mood === mid && !x.edited);
  if (p) { p.levels = moodLevels(aid, m); p.fade = m.fade; p.name = name; }
  else { p = { id: uid(), name, levels: moodLevels(aid, m), fade: m.fade, area: aid, mood: mid, edited: false }; S.config.presets.push(p); }
  sheet.close();
  save({ msg: `${cap(p.name)} is now a scene` });
}

// ---------- Light now (A): one lamp per room that is on, sized by the room's mean level ----------
function roomsLit() {
  return areas().map(a => {
    const ds = roomLights(a.id); if (!ds.length || !ds.some(d => isOn(d.device_id))) return null;
    return { id: a.id, name: a.name, level: Math.max(1, roomMean(a.id)), icon: roomIcon(a.name) };
  }).filter(Boolean);
}
function lightNowHeadline(rooms) {
  if (!S.agent.online) return 'Last known state';
  if (!rooms.length) return 'Everything is off';
  const n = rooms.map(r => r.name);
  const list = n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  return `${esc(list)} ${n.length === 1 ? 'is' : 'are'} on`;
}
function lampItemHTML(r, size) {
  const s = size == null ? discSize(r.level) : size;
  return `<button class="ln-lamp" data-act="lamp-room" data-id="${r.id}" data-level="${r.level}" title="Open ${esc(r.name)}"><span class="lamp" style="width:${s}px;height:${s}px;background:${lampColor(r.level)}">${ICON(r.icon, 'sm')}</span><span class="ln-name">${esc(r.name)}</span></button>`;
}
function lightNowHTML() {
  const rooms = roomsLit();
  return `<div class="lightnow" id="lightnow"><p class="statusline ln-line">${lightNowHeadline(rooms)}</p><div class="ln-row ${rooms.length ? '' : 'empty'}">${rooms.map(r => lampItemHTML(r)).join('')}</div></div>`;
}
function paintLightNow() {
  const root = $('#lightnow'); if (!root) return;
  const rooms = roomsLit();
  const line = root.querySelector('.ln-line'); const h = lightNowHeadline(rooms);
  if (line.innerHTML !== h) { if (window.Motion) Motion.textSwap(line, h); else line.innerHTML = h; }
  const row = root.querySelector('.ln-row');
  const want = new Set(rooms.map(r => r.id));
  const have = new Map([...row.querySelectorAll('.ln-lamp')].filter(el => !el.dataset.gone).map(el => [el.dataset.id, el]));
  for (const [id, el] of have) if (!want.has(id)) { el.dataset.gone = '1'; tween(el.querySelector('.lamp'), { width: 0, height: 0 }, () => el.remove()); }
  let prev = null;
  for (const r of rooms) {
    let el = have.get(r.id);
    const s = discSize(r.level), c = lampColor(r.level);
    if (!el) {
      el = elFrom(lampItemHTML(r, 0));
      if (prev) prev.after(el); else row.prepend(el);
      tween(el.querySelector('.lamp'), { width: s, height: s, backgroundColor: c });
    } else if (Number(el.dataset.level) !== r.level) {
      el.dataset.level = r.level;
      tween(el.querySelector('.lamp'), { width: s, height: s, backgroundColor: c });
    }
    prev = el;
  }
  if (rooms.length) row.classList.remove('empty');
  else setTimeout(() => { if (row.isConnected && !roomsLit().length) row.classList.add('empty'); }, MOTION.d * 1000 + 20);
}
function openRoomCard(aid) {
  if (S.view !== 'home') { S.view = 'home'; location.hash = 'home'; render(); }
  if (!S.openRooms.has(aid)) toggleRoom(aid);
  const el = document.querySelector(`.room[data-room="${aid}"]`);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: MOTION.d ? 'smooth' : 'auto' });
}
// The room card's disc (and the Now view's) takes the ramp fill at the room's mean level; off is the surface's off grey.
function paintOnChips() {
  document.querySelectorAll('[data-onchip]').forEach(el => {
    const t = el.dataset.onchip; const on = targetOn(t); const dark = !!el.closest('.dark');
    const c = lampColor(on ? roomMean(t.slice(2)) : 0, dark);
    el.classList.toggle('off', !on);
    if (el.dataset.fill === c) return;
    if (el.dataset.fill) tween(el, { backgroundColor: c }); else el.style.backgroundColor = c;
    el.dataset.fill = c;
  });
}
// Each light row's disc follows its own level.
function paintLightDiscs() {
  document.querySelectorAll('[data-ldisc]').forEach(el => {
    const id = el.dataset.ldisc; const d = dev(id); if (!d) return;
    const lv = d.domain === 'light' || d.domain === 'switch' ? (level(id) || 0) : (isOn(id) ? 100 : 0);
    const c = lampColor(lv, !!el.closest('.dark'));
    el.classList.toggle('off', lv <= 0);
    if (el.dataset.fill === c) return;
    if (el.dataset.fill) tween(el, { backgroundColor: c }); else el.style.backgroundColor = c;
    el.dataset.fill = c;
  });
}
function paintMoodRows() {
  document.querySelectorAll('[data-moods]').forEach(row => { const m = moodMatch(row.dataset.moods); row.querySelectorAll('[data-mood]').forEach(ch => ch.classList.toggle('sel', ch.dataset.mood === m)); });
}

// ---------- the house: every light that is on, its mean level, and one slider for all of them ----------
function litLights() { return controllable().filter(d => (d.domain === 'light' || d.domain === 'switch') && (level(d.device_id) || 0) > 0); }
function houseLevel() { const ls = litLights(); return ls.length ? meanLevel(ls.map(d => d.device_id)) : 0; }
let houseGate = null, housePending = null;
// Shared by the bar and the Now view: one command per 120ms while dragging, the last value always lands.
function setHouseLevel(v) {
  v = clamp(Math.round(v), 1, 100);
  const ids = litLights().map(d => d.device_id); if (!ids.length) return;
  for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level: v };
  housePending = { ids, v };
  if (houseGate) return;
  houseGate = setTimeout(() => {
    houseGate = null; const p = housePending; housePending = null; if (!p) return;
    command({ type: 'level', target: p.ids.map(id => `d:${id}`), level: p.v, fade: 0 });
    paintState();
  }, 120);
}

// ---------- the Now view: the Sonos full-screen now playing, for the house ----------
function nowArtHTML(rooms) {
  if (!rooms.length) return lampHTML(0, 96, ICON('moon', 'lg'), '', true);
  // one lit room fills the square like album art; more rooms share it
  const n = Math.min(rooms.length, 6);
  const base = n <= 1 ? 96 : n === 2 ? 60 : n <= 4 ? 52 : 44;  // the square is 200px with 20px padding: two grown discs must fit side by side
  return rooms.slice(0, 6).map(r => lampHTML(r.level, Math.round(base + base * 0.35 * clamp(r.level, 0, 100) / 100), ICON(r.icon, n <= 2 ? '' : 'sm'), '', true)).join('');
}
function nowSub(rooms, on, lv) {
  if (!on.length) return 'Everything is off';
  return `${plural(on.length, 'light')} · ${lv}% on average${rooms.length > 6 ? ` · ${rooms.length - 6} more rooms` : ''}`;
}
const NOW = { panel: 'main' };
// The running timer that covers the lit lights, soonest first (the house timer or a room's).
function nowTimer() {
  const lit = new Set(litLights().map(d => d.device_id)); if (!lit.size) return null;
  let best = null;
  for (const [t, v] of Object.entries(S.timers || {})) {
    if (!v || !v.ends_at) continue;
    if (!targetDevices(tsplit(t)).some(id => lit.has(id))) continue;
    if (!best || v.ends_at < best.v.ends_at) best = { t, v };
  }
  return best;
}
function nowRingHTML(t, v, size, width, cls) {
  const total = timerTotal(t, v.ends_at), f = clamp(minutesLeft(v.ends_at) / total, 0, 1);
  const r = size / 2 - width, c = 2 * Math.PI * r;
  return `<svg class="tring ${cls}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" style="--w:${width}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/><circle class="prog" cx="${size / 2}" cy="${size / 2}" r="${r}" style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - f)}"/></svg>`;
}
function nowActionsHTML() {
  const rb = (act, icon, label, extra = '', inner = '') => `<button class="rbtn ${act === 'alloff' ? 'm-hold' : ''}" data-act="${act}" ${extra}><span class="c">${ICON(icon)}${inner}</span><span>${label}</span></button>`;
  const tm = nowTimer();
  const timer = tm
    ? `<button class="rbtn timing" data-act="now-panel" data-p="timer-active" data-ring="${esc(tm.t)}" data-ends="${tm.v.ends_at}" data-c="${(2 * Math.PI * 28).toFixed(2)}"><span class="c">${ICON('clock')}${nowRingHTML(tm.t, tm.v, 64, 3, 'rring')}</span><span data-countdown-min="${tm.v.ends_at}">${minutesLeft(tm.v.ends_at)} min</span></button>`
    : rb('now-panel', 'clock', 'Sleep timer', 'data-p="timer"');
  return `${rb('alloff', 'power', 'All off', 'title="Hold for shades and fans"')}${rb('now-night', 'moon', 'Night')}${timer}${rb('now-panel', 'scene', 'Scenes', 'data-p="scenes"')}`;
}
function nowMainHTML() {
  const rooms = roomsLit(); const on = litLights(); const lv = houseLevel();
  const rows = areas().map(a => {
    const ds = controllable().filter(d => (d.area || 'none') === a.id && d.domain !== 'cover'); if (!ds.length) return '';
    const t = `a:${a.id}`; const on = targetOn(t);
    return `<div class="item"><span class="lamp ${on ? '' : 'off'}" data-onchip="${t}" style="width:36px;height:36px;background:${lampColor(on ? roomMean(a.id) : 0, true)}">${ICON(roomIcon(a.name), 'sm')}</span><button class="grow" data-act="now-room" data-id="${a.id}"><div class="n">${esc(a.name)}</div><div class="lv" data-roomsum="${a.id}">${esc(roomSummary(a.id))}</div></button><button class="sw ${on ? 'on' : ''}" data-tgt="${t}" data-act="toggle" data-t="${t}"></button></div>`;
  }).join('');
  return `<div class="now-art" id="now-art" data-k="${rooms.map(r => r.id + ':' + r.level).join(',')}">${nowArtHTML(rooms)}</div>
    <div class="t2 now-head" id="now-head">${lightNowHeadline(rooms)}</div>
    <div class="now-sub" id="now-sub">${nowSub(rooms, on, lv)}</div>
    <div class="now-level ${on.length ? '' : 'dim'}">${ICON('sun-low', 'sm')}<input class="slider" type="range" min="1" max="100" value="${lv}" style="--p:${lv}%" data-house="1" aria-label="House brightness" ${on.length ? '' : 'disabled'}><span class="nb-num">${lv}</span></div>
    <div class="now-actions" id="now-actions" data-tk="${nowTimerKey()}">${nowActionsHTML()}</div>
    <div class="h2">Rooms</div><div class="card pad0 list now-rooms">${rows}</div>`;
}
function nowTimerKey() { const tm = nowTimer(); return tm ? `${tm.t}@${tm.v.ends_at}@${minutesLeft(tm.v.ends_at)}` : ''; }
const nowTop = title => `<div class="now-top"><button class="now-back" data-act="now-panel" data-p="main" aria-label="Back">${ICON('back', 'sm')}</button><div class="t2">${title}</div></div>`;
function nowPanelHTML(p) {
  if (p === 'scenes') {
    const list = [...presets().filter(x => !x.mood).map(x => ({ id: 'p:' + x.id, name: x.name, sub: plural(Object.keys(x.levels).length, 'light') })), ...lutronScenes().map(x => ({ id: 's:' + x.scene_id, name: x.name, sub: 'From the Lutron app' }))];
    const moods = roomsLit().map(r => { const ps = presets().filter(x => x.area === r.id && x.mood); if (!ps.length) return ''; return `<div class="h2">${esc(r.name)} moods</div><div class="chips scroll">${ps.map(x => `<button class="chip" data-act="run-scene" data-t="p:${x.id}">${esc((x.name.split('·')[1] || x.name).trim())}</button>`).join('')}</div>`; }).join('');
    const rows = list.map(x => `<button class="item" data-act="run-scene" data-t="${x.id}"><span class="ic">${ICON('play', 'sm')}</span><div class="grow"><div class="n">${esc(x.name)}</div><div class="lv">${esc(x.sub)}</div></div></button>`).join('');
    return nowTop('Scenes') + (rows ? `<div class="card pad0 list now-rooms">${rows}</div>` : `<p class="now-sub" style="text-align:left">No scenes yet. Set the lights how you like them and save the look on the Scenes tab.</p>`) + moods;
  }
  if (p === 'timer') {
    const ids = litLights(); if (!ids.length) return nowTop('Sleep timer') + '<p class="now-sub" style="text-align:left">Nothing is on.</p>';
    const t = ids.map(x => `d:${x.device_id}`).join('|');
    return nowTop('Sleep timer') + `<p class="now-sub" style="text-align:left;margin-top:-4px">${esc(cap(targetName(tsplit(t))))} fade off when the time is up.</p>` + dialHTML(t, 20, true);
  }
  if (p === 'timer-active') {
    const tm = nowTimer(); if (!tm) return nowMainHTML();
    const tgt = tsplit(tm.t); const lv = meanLevel(targetDevices(tgt)); const left = minutesLeft(tm.v.ends_at);
    return nowTop('Sleep timer') + `<div class="td" id="td-active">
      <div class="td-ring big" data-ring="${esc(tm.t)}" data-ends="${tm.v.ends_at}" data-c="${RING_C.toFixed(2)}">${nowRingHTML(tm.t, tm.v, 240, 12, '')}
        <div class="td-centre"><div class="td-cap">${tm.v.level ? 'Down to ' + tm.v.level + '% in' : 'Off in'}</div><div class="td-min display" data-countdown-min="${tm.v.ends_at}">${left} min</div>${lampHTML(lv, 96, timerLampInner(tm.t), 'td-lamp', true)}</div>
      </div>
      <p class="now-sub" style="margin:-4px 0 16px">${esc(cap(targetName(tgt)))}</p>
      <button class="btn lg block" data-act="now-panel" data-p="timer">Change the time</button>
      <button class="btn primary lg block" data-act="cancel-timer" data-t="${esc(tm.t)}" data-stay="1" style="margin-top:8px">Cancel the timer</button></div>`;
  }
  return nowMainHTML();
}
function nowShow(p) {
  NOW.panel = p;
  const root = $('#nowview'); if (!root) return;
  root.innerHTML = nowPanelHTML(p);
  const sb = root.closest('.sb'); if (sb) sb.scrollTop = 0;
  if (p === 'timer') wireDial();
  if (window.Motion) Motion.pageIn(root, { force: true });
}
function nowViewHTML() { NOW.panel = 'main'; return `<div class="now" id="nowview">${nowMainHTML()}</div>`; }
function openNowView() { sheet.open('', nowViewHTML(), { dark: true, cls: 'now' }); }
function paintNow() {
  const root = $('#nowview'); if (!root) return;
  if (NOW.panel === 'timer-active' && !nowTimer()) { nowShow('main'); return; }
  if (NOW.panel !== 'main') { root.querySelectorAll('[data-countdown-min]').forEach(el => { el.textContent = `${minutesLeft(Number(el.dataset.countdownMin))} min`; }); return; }
  const rooms = roomsLit(); const on = litLights(); const lv = houseLevel();
  const art = root.querySelector('#now-art'); const k = rooms.map(r => r.id + ':' + r.level).join(',');
  if (art.dataset.k !== k) { art.dataset.k = k; art.innerHTML = nowArtHTML(rooms); }
  const head = root.querySelector('#now-head'); const h = lightNowHeadline(rooms);
  if (head.innerHTML !== h) { if (window.Motion) Motion.textSwap(head, h); else head.innerHTML = h; }
  root.querySelector('#now-sub').textContent = nowSub(rooms, on, lv);
  const sl = root.querySelector('[data-house]');
  if (sl && !sl.dataset.drag) { sl.value = lv; sl.style.setProperty('--p', `${lv}%`); sl.disabled = !on.length; sl.parentElement.classList.toggle('dim', !on.length); root.querySelector('.nb-num').textContent = lv; }
  const acts = root.querySelector('#now-actions'); const tk = nowTimerKey();
  if (acts && acts.dataset.tk !== tk) { acts.dataset.tk = tk; acts.innerHTML = nowActionsHTML(); }
}

// ---------- light detail sheet (B), on the dark surface ----------
let LD = null;
function openLightSheet(id) {
  const d = dev(id); if (!d) return;
  const lv = level(id) || 0, t = `d:${id}`, dim = d.domain === 'light', role = lightRole(id);
  LD = { id, lv, dim, dragging: false, lastSend: 0, drag0: null, stTween: null };
  const body = `<div class="ld" id="ld" data-id="${id}">
    <div class="ld-hero"><div class="ld-stage"><div class="lamp ld-disc ${lv > 0 ? '' : 'off'}" style="width:${heroSize(lv)}px;height:${heroSize(lv)}px;background:${lampColor(lv, true)}" role="button" aria-label="Drag up or down to dim, tap to turn ${lv > 0 ? 'off' : 'on'}">${ICON(lightIcon(d), 'lampart')}</div></div>
      ${dim ? `<div class="vslider" role="slider" aria-label="Brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${lv}" tabindex="0" style="--p:${lv}%"><div class="vtip">${lvText(lv)}</div></div>` : `<div class="ld-swcol"><button class="sw ${lv > 0 ? 'on' : ''}" data-act="ld-toggle" aria-label="On or off"></button></div>`}</div>
    <div class="t2 ld-name">${esc(d.name)}</div>
    <div class="ld-cap">${esc(areaName(d.area))}${role ? ` · ${ROLE_LABEL[role]}` : ''}</div>
    <div class="ld-level display">${lvLabel(lv, dim)}</div>
    ${moodRowHTML(d.area || 'none')}
    <div class="ld-actions">
      <button class="rbtn" data-act="ld-timer" data-t="${t}"><span class="c">${ICON('clock')}</span><span>Sleep timer</span></button>
      <button class="rbtn ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="ld-fav" data-t="${t}"><span class="c">${ICON('star')}</span><span>Favourite</span></button>
      <button class="rbtn" data-act="ld-kind" data-id="${id}"><span class="c">${ICON(lightIcon(d))}</span><span>What kind</span></button>
    </div>
    <button class="btn ghost block ld-remove" data-act="dev-remove" data-id="${id}">Remove from my home</button>
  </div>`;
  sheet.open('', body, { dark: true });
  wireLightSheet();
}
function wireLightSheet() {
  const root = $('#ld'); if (!root || !LD) return;
  const disc = root.querySelector('.ld-disc'), sl = root.querySelector('.vslider');
  const st = { lv: LD.lv };
  const apply = v => { const s = heroSize(v); disc.style.width = disc.style.height = `${s}px`; disc.style.background = lampColor(v, true); disc.classList.toggle('off', v <= 0); };
  // the disc follows the finger with an 80ms lag, so it breathes rather than snaps
  const quick = window.gsap && MOTION.d > 0 ? gsap.quickTo(st, 'lv', { duration: .08, ease: 'power3.out', onUpdate: () => apply(st.lv) }) : v => { st.lv = v; apply(v); };
  LD.show = (v, animate) => {
    v = clamp(Math.round(v), 0, 100); LD.lv = v;
    if (animate && window.gsap && MOTION.d > 0) { if (LD.stTween) LD.stTween.kill(); LD.stTween = gsap.to(st, { lv: v, duration: MOTION.d, ease: MOTION.ease, onUpdate: () => apply(st.lv) }); }
    else quick(v);
    root.querySelector('.ld-level').textContent = lvLabel(v, LD.dim);
    if (sl) { sl.style.setProperty('--p', `${v}%`); sl.setAttribute('aria-valuenow', v); sl.querySelector('.vtip').textContent = lvText(v); }
    const sw = root.querySelector('[data-act="ld-toggle"]'); if (sw) sw.classList.toggle('on', v > 0);
  };
  // one command per 120ms while dragging, the last value always lands
  let pendingV = null, gate = null;
  const sendNow = v => { S.states[LD.id] = { ...(S.states[LD.id] || {}), level: v }; LD.lastSend = Date.now(); command({ type: 'level', target: `d:${LD.id}`, level: v, fade: 0 }); paintState(); };
  const queue = v => { pendingV = v; if (gate) return; gate = setTimeout(() => { gate = null; if (pendingV != null) { const x = pendingV; pendingV = null; sendNow(x); } }, 120); };
  LD.set = v => { v = clamp(Math.round(v), 0, 100); if (v === LD.lv) return; LD.show(v); queue(v); };
  const startDrag = () => { LD.dragging = true; if (LD.stTween) LD.stTween.kill(); if (sl) sl.classList.add('drag'); };
  const endDrag = () => { LD.dragging = false; LD.lastSend = Date.now(); if (sl) sl.classList.remove('drag'); };
  if (sl) {
    const fromY = y => { const r = sl.getBoundingClientRect(); return clamp(Math.round((r.bottom - y) / r.height * 100), 0, 100); };
    sl.addEventListener('pointerdown', e => { e.preventDefault(); sl.setPointerCapture(e.pointerId); startDrag(); const v = fromY(e.clientY); LD.show(v); queue(v); });
    sl.addEventListener('pointermove', e => { if (!LD.dragging || LD.drag0) return; LD.set(fromY(e.clientY)); });
    sl.addEventListener('pointerup', endDrag); sl.addEventListener('pointercancel', endDrag);
    sl.addEventListener('keydown', e => { const step = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, Home: -200, End: 200 }[e.key]; if (step == null) return; e.preventDefault(); LD.set(LD.lv + step); });
  }
  // the disc is a drag surface: 240px of travel is the whole range; a plain tap turns the light on or off
  disc.addEventListener('pointerdown', e => { e.preventDefault(); disc.setPointerCapture(e.pointerId); LD.drag0 = { y: e.clientY, lv: LD.lv, moved: false }; if (LD.dim) startDrag(); });
  disc.addEventListener('pointermove', e => { const g = LD.drag0; if (!g || !LD.dim) return; const dy = g.y - e.clientY; if (Math.abs(dy) > 3) g.moved = true; if (g.moved) LD.set(g.lv + dy / 240 * 100); });
  const discUp = () => { const g = LD.drag0; if (!g) return; LD.drag0 = null; if (LD.dim) endDrag(); if (!g.moved) { const v = LD.lv > 0 ? 0 : (LD.dim ? S.config.settings.group_on_level : 100); LD.show(v); sendNow(v); LD.lastSend = Date.now(); } };
  disc.addEventListener('pointerup', discUp); disc.addEventListener('pointercancel', () => { LD.drag0 = null; if (LD.dim) endDrag(); });
}
// A real state change while the sheet is open moves the disc once (never while the thumb is on it).
function paintLightDetail() {
  const root = $('#ld'); if (!root || !LD || !LD.show || LD.dragging || Date.now() - LD.lastSend < 800) return;
  const v = level(LD.id) || 0;
  if (v !== LD.lv) LD.show(v, true);
}

// ---------- sleep-timer dial (F) ----------
const TIMER_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120];
const TIMER_CHIPS = [5, 10, 15, 20, 30, 45, 60, 90];
const RING_C = 2 * Math.PI * 114, RING40_C = 2 * Math.PI * 18;
const TIMER_TOTAL = {}; // target -> { ends_at, minutes } so the Home ring knows how full it started
let TD = null;
function snapMinutes(f) { const raw = f * 120; let best = TIMER_STEPS[0]; for (const m of TIMER_STEPS) if (Math.abs(m - raw) < Math.abs(best - raw)) best = m; return best; }
function knobPos(min) { const a = (min / 120) * 2 * Math.PI; return { x: 120 + 114 * Math.sin(a), y: 120 - 114 * Math.cos(a) }; }
function timerLampInner(t) { const ids = targetDevices(tsplit(t)); const d = ids.length === 1 ? dev(ids[0]) : null; return ICON(d ? lightIcon(d) : 'bulb', 'lampart md'); }
// t is a target, or several joined by | (the house timer from the Now view); the agent keys timers the same way.
function dialHTML(t, min, stay = false) {
  const tgt = tsplit(t); const ids = targetDevices(tgt); const lv = meanLevel(ids);
  TD = { t, min, dragging: false };
  const p = knobPos(min); const st = stay ? 'data-stay="1"' : '';
  return `<div class="td" id="td">
    <div class="td-ring" role="slider" aria-label="Minutes" aria-valuemin="5" aria-valuemax="120" aria-valuenow="${min}" tabindex="0">
      <svg class="tring" viewBox="0 0 240 240" width="240" height="240" aria-hidden="true"><circle class="track" cx="120" cy="120" r="114"/><circle class="prog" cx="120" cy="120" r="114" style="stroke-dasharray:${RING_C};stroke-dashoffset:${RING_C * (1 - min / 120)}"/></svg>
      <div class="td-centre"><div class="td-cap">Off in</div><div class="td-min display">${min} min</div>${lampHTML(lv, 96, timerLampInner(t), 'td-lamp', stay)}</div>
      <div class="td-knob" style="left:${p.x}px;top:${p.y}px"></div>
    </div>
    <div class="chips">${TIMER_CHIPS.map(m => `<button class="chip ${m === min ? 'sel' : ''}" data-act="timer" data-t="${esc(t)}" data-m="${m}" ${st}>${m} min</button>`).join('')}</div>
    <button class="btn primary lg block" data-act="timer" data-t="${esc(t)}" data-m="${min}" ${st}>Start</button>
  </div>`;
}
function sleepDialSheet(t, opts = {}) {
  const body = dialHTML(t, 20);
  sheet.open('Sleep timer', body, { sub: `${esc(cap(targetName(tsplit(t))))} fades off when the time is up.`, back: !!opts.back, onBack: opts.back || null });
  wireDial();
}
function wireDial() {
  const root = $('#td'); if (!root || !TD) return;
  const ring = root.querySelector('.td-ring'), prog = root.querySelector('.prog'), knob = root.querySelector('.td-knob');
  const show = (min, animate) => {
    TD.min = min;
    root.querySelector('.td-min').textContent = `${min} min`;
    ring.setAttribute('aria-valuenow', min);
    root.querySelectorAll('.chips .chip').forEach(c => c.classList.toggle('sel', Number(c.dataset.m) === min));
    root.querySelector('.btn.primary').dataset.m = min;
    const p = knobPos(min), off = RING_C * (1 - min / 120);
    if (animate && window.gsap && MOTION.d > 0) { gsap.to(prog, { strokeDashoffset: off, duration: MOTION.d, ease: MOTION.ease, overwrite: 'auto' }); gsap.to(knob, { left: p.x, top: p.y, duration: MOTION.d, ease: MOTION.ease, overwrite: 'auto' }); }
    else { prog.style.strokeDashoffset = off; knob.style.left = `${p.x}px`; knob.style.top = `${p.y}px`; }
  };
  const fromPoint = (x, y) => { const r = ring.getBoundingClientRect(); const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2); let f = Math.atan2(dx, -dy) / (2 * Math.PI); if (f < 0) f += 1; return f; };
  const pick = f => { let m = snapMinutes(f); if (TD.min >= 90 && f < .25) m = 120; if (TD.min <= 15 && f > .75) m = 5; return m; };
  ring.addEventListener('pointerdown', e => { e.preventDefault(); ring.setPointerCapture(e.pointerId); TD.dragging = true; show(pick(fromPoint(e.clientX, e.clientY))); });
  ring.addEventListener('pointermove', e => { if (!TD.dragging) return; const m = pick(fromPoint(e.clientX, e.clientY)); if (m !== TD.min) show(m); });
  const end = () => { TD.dragging = false; };
  ring.addEventListener('pointerup', end); ring.addEventListener('pointercancel', end);
  ring.addEventListener('keydown', e => { const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (!dir) return; e.preventDefault(); const i = clamp(TIMER_STEPS.indexOf(TD.min) + dir, 0, TIMER_STEPS.length - 1); show(TIMER_STEPS[i], true); });
}
function rememberTimer(t, minutes) { TIMER_TOTAL[t] = { started: Date.now() / 1000, minutes }; }
function timerTotal(t, endsAt) {
  const r = TIMER_TOTAL[t];
  if (r && Math.abs(r.started + r.minutes * 60 - endsAt) < 120) return r.minutes;
  // started elsewhere (a remote): take what is left, rounded up to a step, as the whole
  const left = Math.max(1, (endsAt - Date.now() / 1000) / 60);
  const total = TIMER_STEPS.find(m => m >= left) || Math.ceil(left);
  TIMER_TOTAL[t] = { started: endsAt - total * 60, minutes: total };
  return total;
}
const minutesLeft = endsAt => Math.max(0, Math.ceil((endsAt - Date.now() / 1000) / 60));
function timerBlockHTML(t, v) {
  const tgt = tsplit(t);
  const total = timerTotal(t, v.ends_at), left = minutesLeft(v.ends_at), f = clamp(left / total, 0, 1);
  const lv = meanLevel(targetDevices(tgt)); const s = 12 + 16 * lv / 100;
  return `<div class="timerbar"><div class="ring40" data-ring="${esc(t)}" data-ends="${v.ends_at}" data-f="${f.toFixed(3)}"><svg class="tring" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle class="track" cx="20" cy="20" r="18"/><circle class="prog" cx="20" cy="20" r="18" style="stroke-dasharray:${RING40_C};stroke-dashoffset:${RING40_C * (1 - f)}"/></svg><span class="lamp" style="width:${s}px;height:${s}px;background:${lampColor(lv)}"></span></div><div class="grow"><div class="t">${esc(cap(targetName(tgt)))} ${v.level ? 'to ' + v.level + '%' : 'off'} <span data-countdown="${v.ends_at}"></span></div><div class="d">Sleep timer</div></div><button class="btn sm" data-act="cancel-timer" data-t="${esc(t)}">Cancel</button></div>`;
}
// The Home ring drains once a minute; the disc inside follows the light's level.
function paintRings() {
  document.querySelectorAll('[data-ring]').forEach(el => {
    const t = el.dataset.ring, endsAt = Number(el.dataset.ends);
    const total = timerTotal(t, endsAt), f = clamp(minutesLeft(endsAt) / total, 0, 1); const C = Number(el.dataset.c) || RING40_C;
    if (f.toFixed(3) !== el.dataset.f) { el.dataset.f = f.toFixed(3); tween(el.querySelector('.prog'), { strokeDashoffset: C * (1 - f) }); }
    const lv = meanLevel(targetDevices(tsplit(t))); const s = 12 + 16 * lv / 100, c = lampColor(lv, !!el.closest('.dark'));
    const disc = el.querySelector('.lamp'); if (disc && !disc.classList.contains('td-lamp') && disc.dataset.lv !== String(lv)) { if (disc.dataset.lv != null) tween(disc, { width: s, height: s, backgroundColor: c }); disc.dataset.lv = lv; }
    if (disc && disc.classList.contains('td-lamp') && disc.dataset.lv !== String(lv)) { disc.dataset.lv = lv; disc.style.background = c; disc.classList.toggle('off', lv <= 0); }
    el.querySelectorAll('[data-countdown-min]').forEach(m => { m.textContent = `${minutesLeft(endsAt)} min`; });
  });
  const td = $('#td'); if (td && TD && !TD.dragging) { const disc = td.querySelector('.td-lamp'); const lv = meanLevel(targetDevices(tsplit(TD.t))); if (disc && disc.dataset.lv !== String(lv)) { if (disc.dataset.lv != null) tween(disc, { backgroundColor: lampColor(lv) }); disc.dataset.lv = lv; disc.classList.toggle('off', lv <= 0); } }
}
setInterval(() => { if (document.querySelector('[data-ring]')) paintRings(); if (typeof paintNow === 'function') paintNow(); }, 15000);

// ---------- night look (H): the light surfaces go warm grey; the dark ones, the text and the lamp ramp stay ----------
const THEME_COLOR = { day: '#F1F2F3', night: '#ECEAE5' };
function inNightHours(start, end) {
  const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
  const toMin = hm => { const [h, m] = String(hm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const a = toMin(start), b = toMin(end);
  return a > b ? (cur >= a || cur < b) : (cur >= a && cur < b);
}
function nightWanted() {
  const s = (S.config && S.config.settings) || {};
  const mode = s.night_look || 'auto';
  if (mode === 'always') return true; if (mode === 'never') return false;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
  return inNightHours(s.night_start || '22:00', s.night_end || '06:30');
}
function applyNightLook() {
  const on = nightWanted(), html = document.documentElement;
  if ((html.dataset.night === '1') === on) return;
  if (on) html.dataset.night = '1'; else delete html.dataset.night;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = on ? THEME_COLOR.night : THEME_COLOR.day;
  LAMP_OFF_CACHE = null;
  document.querySelectorAll('.lamp.off').forEach(el => { if (!el.closest('.dark')) { el.style.background = lampOff(); delete el.dataset.fill; } });
}
function nightLookRowHTML() {
  const cur = (S.config.settings.night_look) || 'auto';
  return `<div class="item" style="flex-wrap:wrap"><div class="grow"><div class="t">Night look</div><div class="d">The app dims and warms like a room lit by lamps, between those hours or when your phone is in dark mode.</div></div>
    <div class="chips" style="flex-basis:100%;margin-top:4px" data-night-look>${[['auto', 'Automatic'], ['always', 'Always'], ['never', 'Never']].map(([v, l]) => `<button class="chip sm ${cur === v ? 'sel' : ''}" data-act="night-look" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}
function setNightLook(v) {
  S.config.settings.night_look = v;
  document.querySelectorAll('[data-act="night-look"]').forEach(c => c.classList.toggle('sel', c.dataset.v === v));
  applyNightLook();
  save({ quiet: true, render: false });
}
setInterval(applyNightLook, 30000);
if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', applyNightLook); }
applyNightLook();

// ---------- painting: called from paintState() after every render and every state message ----------
function paintLight() {
  applyNightLook();
  paintLightNow();
  paintOnChips();
  paintLightDiscs();
  paintTiles();
  paintMoodRows();
  paintRings();
  paintLightDetail();
  paintNow();
}

// ---------- events: the same delegated pattern as boot.js, for the acts this file owns ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'lamp-room': openRoomCard(d.id); break;
    case 'light-open': openLightSheet(d.id); break;
    case 'kind-open': openKindSheet(d.id); break;
    case 'kind-pick': pickKind(d.id, d.k); break;
    case 'mood': applyMood(d.area, d.mood); break;
    case 'mood-save': openMoodSave(d.area); break;
    case 'mood-save-pick': saveMoodScene(d.area, d.mood); break;
    case 'ld-toggle': if (LD && LD.show) { const v = LD.lv > 0 ? 0 : 100; LD.show(v); S.states[LD.id] = { ...(S.states[LD.id] || {}), level: v }; LD.lastSend = Date.now(); command({ type: 'level', target: `d:${LD.id}`, level: v }); paintState(); } break;
    case 'ld-timer': { const id = LD && LD.id; sleepTimerSheet(d.t, { back: id ? () => openLightSheet(id) : null }); break; }
    case 'ld-fav': toggleFav(d.t); el.classList.toggle('on', S.config.favorites.includes(d.t)); break;
    case 'ld-kind': { const id = d.id; openKindSheet(id, { back: () => openLightSheet(id) }); break; }
    case 'now-open': openNowView(); break;
    case 'now-room': sheet.close(); openRoomCard(d.id); break;
    case 'now-night': for (const r of roomsLit()) applyMood(r.id, 'night'); break;
    case 'now-panel': nowShow(d.p); break;
    case 'timer': rememberTimer(d.t, Number(d.m)); break; // boot.js sends it; this remembers how long it was
    case 'night-look': setNightLook(d.v); break;
    case 'sort-go': openKindSheet(d.id); break;
    case 'sort-dismiss': try { localStorage.setItem('sortLightsDismissed', '1'); } catch (_) { /* ignore */ } { const b = $('#sortblock'); if (b) b.remove(); } break;
  }
});
