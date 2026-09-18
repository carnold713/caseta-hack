/* Pico Hack: light as a flat disc (docs/ui-concepts.md A, B, D, E, F, H; surfaces from docs/design-spec-v4.md).
   The "Light now" strip on Home, the white light detail sheet, the Now view and the house well
   behind the house card, room moods, lamp kinds, the sleep-timer dial and the night look.
   Loaded after home.js; paintState() in core.js calls paintLight() so every real state change
   moves the discs once. */
'use strict';

// ---------- the lamp ramp: five stops, interpolated continuously; off is --lamp-off (--fill-2: every surface is white now) ----------
const LAMP_RAMP = [[10, '#FDF1E1'], [25, '#FCE3C4'], [50, '#F9C489'], [75, '#F7A64F'], [100, '#F58A1F']];
const MOTION = { d: .255, ease: 'power3.out' };
if (window.gsap && gsap.matchMedia) gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => { MOTION.d = 0; return () => { MOTION.d = .255; }; });

let LAMP_OFF_CACHE = null;
function lampOff() { if (!LAMP_OFF_CACHE) LAMP_OFF_CACHE = (getComputedStyle(document.documentElement).getPropertyValue('--lamp-off') || 'rgba(0,0,0,.06)').trim() || 'rgba(0,0,0,.06)'; return LAMP_OFF_CACHE; }
function mixHex(a, b, t) {
  const pa = a.slice(1).match(/../g).map(x => parseInt(x, 16)), pb = b.slice(1).match(/../g).map(x => parseInt(x, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// `dark` is accepted and ignored: there is no dark surface any more, an off disc is --lamp-off everywhere.
function lampColor(lv, dark) { // eslint-disable-line no-unused-vars
  const v = Number(lv) || 0;
  if (v <= 0) return lampOff();
  if (v <= LAMP_RAMP[0][0]) return LAMP_RAMP[0][1];
  for (let i = 1; i < LAMP_RAMP.length; i++) { const [b, cb] = LAMP_RAMP[i], [a, ca] = LAMP_RAMP[i - 1]; if (v <= b) return mixHex(ca, cb, (v - a) / (b - a)); }
  return LAMP_RAMP[LAMP_RAMP.length - 1][1];
}
const lvText = v => (v > 0 ? `${v}%` : 'Off');
const lvLabel = (v, dim) => (dim ? lvText(v) : v > 0 ? 'On' : 'Off'); // a switch is on or off, never a percentage
const discSize = lv => Math.round(24 + 32 * clamp(lv, 0, 100) / 100);
const heroSize = lv => Math.round(100 + 28 * clamp(lv, 0, 100) / 100);
// `fill` overrides the ramp: a Hue lamp's disc is painted in its own colour (js/color.js lampFill).
function lampHTML(lv, size, inner, cls = '', dark = false, fill = null) { return `<span class="lamp ${lv > 0 ? '' : 'off'} ${cls}" style="width:${size}px;height:${size}px;background:${fill || lampColor(lv, dark)}">${inner || ''}</span>`; }
// One tween, only when something actually changed. Without GSAP (or under reduced motion) the value is set outright.
function tween(el, vars, done) {
  if (!el) return;
  if (window.gsap && MOTION.d > 0) gsap.to(el, { ...vars, duration: MOTION.d, ease: MOTION.ease, overwrite: 'auto', onComplete: done });
  else { for (const [k, v] of Object.entries(vars)) el.style[k] = typeof v === 'number' ? `${v}px` : v; if (done) done(); }
}
function elFrom(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

// ---------- lamp kinds and roles (E): the table is web/js/kinds.js (KIND_DEF), shared with the hub ----------
// A kind is a place and a fixture (`desk-lamp`, `ceiling-track`). KINDS keeps the old [id, label, role] shape for readers of it.
const KINDS = Object.values(KIND_DEF.KINDS).map(k => [k.id, k.label, k.role]);
const KIND_ROLE = KIND_DEF.ROLES;
// One vocabulary everywhere (the roles sheet, the kind picker, the light page): Main, Task, Lamps, Decor.
const ROLE_LABEL = { ambient: 'Main', task: 'Task', accent: 'Lamps', decor: 'Decor' };
const ROLE_CAP = { ambient: 'Main · fills the room', task: 'Task · light for your hands', accent: 'Lamps · for atmosphere', decor: 'Decor · lit to be looked at' };
// "Kitchen · Ceiling pendant · Task": the one caption for a light, used by its page and its More sheet.
function lightCaption(id) { const d = dev(id); if (!d) return ''; const k = lightKind(id), r = lightRole(id); return [devAreaName(d), k ? kindLabel(k) : null, r ? ROLE_LABEL[r] : null].filter(Boolean).map(esc).join(' · '); }
function kindLabel(k) { const x = KIND_DEF.KINDS[KIND_DEF.normalize(k)]; return x ? x.label : null; }
// The stored id, read as the id in the table: the nine old one-word ids ("pendant") still resolve ("ceiling-pendant").
function lightKind(id) { return KIND_DEF.normalize(((S.config && S.config.settings.light_kinds) || {})[id]); }
function lightRole(id) { const r = ((S.config && S.config.settings.roles) || {})[id]; if (r) return r; const k = lightKind(id); return k ? KIND_ROLE[k] : null; }
function lightIcon(d) { const k = lightKind(d.device_id); return k ? KIND_DEF.KINDS[k].icon : domainIcon(d.domain); }
const roomLights = aid => controllable().filter(d => devArea(d) === aid && (d.domain === 'light' || d.domain === 'switch'));
const roomDimmers = aid => roomLights(aid).filter(d => d.domain === 'light');
function meanLevel(ids) { const xs = ids.map(id => level(id) || 0); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0; }
const roomMean = aid => meanLevel(roomLights(aid).map(d => d.device_id));

// The kind picker (docs/ux-progressive.md 5): two questions in one sheet, "Where is this light?" then "What is it?".
// On its own, or as a step of the sort walk (SORT set: a "Light n of N" caption, Next / Done and Skip in the footer).
// KP is the open picker: the light, the place chosen on step 1 (null while on step 1), where the back arrow goes from step 1.
let KP = null;
function openKindSheet(id, opts = {}) {
  const d = dev(id); if (!d) return;
  const cur = lightKind(id);
  KP = { id, place: cur ? KIND_DEF.KINDS[cur].place : null, back: opts.back || null };  // a set kind lands on step 2, step 1 one tap back
  kindRender();
  if (SORT && SORT.list.includes(id)) sheet.onClose = () => { SORT = null; SHEET_KEY = null; KP = null; };
}
function kindRender() {
  if (!KP) return;
  const { id } = KP; const d = dev(id); if (!d) return;
  const w = SORT && SORT.list.includes(id) ? SORT : null;
  const place = KP.place ? KIND_DEF.placeOf(KP.place) : null;
  const who = `${esc(d.name)} · ${esc(devAreaName(d))}`;
  const onBack = place ? () => { KP.place = null; kindRender(); } : KP.back;
  showSheet(w ? 'sort' : 'kind', place ? 'What is it?' : 'Where is this light?', (place ? kindFixturesHTML(id, place) : kindPlacesHTML(id)) + kindFootHTML(id, !!place),
    { detent: 'medium', sub: place ? `${who} · ${esc(place.name)}` : `${who}. Moods use it to know what to dim.`, back: !!onBack, onBack, cap: w ? `Light ${w.list.indexOf(id) + 1} of ${w.list.length}` : '', top: true });
}
// Step 1: the places. The row's second line names a few of its fixtures, or the kind already chosen there.
function kindPlacesHTML(id) {
  const cur = lightKind(id); const curPlace = cur ? KIND_DEF.KINDS[cur].place : null;
  const rows = KIND_DEF.PLACES.map(p => {
    const sel = curPlace === p.id;
    const sub = sel ? kindLabel(cur) : cap(p.fixtures.slice(0, 3).map(f => f.name.toLowerCase()).join(', ')) + (p.fixtures.length > 3 ? ' and more' : '');
    return `<button class="item pick ${sel ? 'sel' : ''}" data-act="kind-place" data-id="${id}" data-p="${p.id}">${ICON(p.icon)}<div class="grow"><div class="t">${p.name}</div><div class="d">${esc(sub)}</div></div>${sel ? `<span class="chk">${ICON('check')}</span>` : `<span class="chev">${ICON('chev', 'sm')}</span>`}</button>`;
  });
  return `<div class="card pad0 list">${rows.join('')}</div>`;
}
// Step 2: that place's fixtures, each with its icon and its role. Tapping the chosen one again clears it.
function kindFixturesHTML(id, place) {
  const cur = lightKind(id);
  const rows = place.fixtures.map(f => `<button class="item pick ${cur === f.id ? 'sel' : ''}" data-act="kind-pick" data-id="${id}" data-k="${f.id}">${ICON(f.icon)}<div class="grow"><div class="t">${f.name}</div><div class="d">${ROLE_CAP[f.role]}</div></div>${cur === f.id ? `<span class="chk">${ICON('check')}</span>` : ''}</button>`);
  return `<div class="card pad0 list">${rows.join('')}</div>` + (cur && KIND_DEF.KINDS[cur].place === place.id ? `<p class="faint small" style="margin:16px 0 0">Tap the chosen one again to clear it.</p>` : '');
}
// The sort walk's footer. Next / Done sits on step 2, and on step 1 once the light has a kind; Skip is always there.
function kindFootHTML(id, step2) {
  const w = SORT && SORT.list.includes(id) ? SORT : null; if (!w) return '';
  const next = w.list[w.list.indexOf(id) + 1];
  const go = step2 || lightKind(id) ? `<button class="btn primary lg block" data-act="sort-next" data-id="${id}">${next ? `Next: ${esc(dev(next).name)}` : 'Done'}</button>` : '';
  return `<div class="sfoot">${go}<button class="btn ghost block" data-act="sort-skip" data-id="${id}">Skip this one</button></div>`;
}
// The sort walk (docs/ux-progressive.md 3.3): the kind sheet for each untagged dimmable light in turn, one toast at the end.
let SORT = null;
function untaggedLights() { const kinds = S.config.settings.light_kinds || {}; return controllable().filter(d => d.domain === 'light' && !kinds[d.device_id]).map(d => d.device_id); }
function openSortWalk() {
  const list = untaggedLights(); if (!list.length) return;
  SORT = { list, prev: JSON.stringify(S.config), done: 0 };
  openKindSheet(list[0]);
}
function sortStep(id, skipped) {
  const w = SORT; if (!w) return;
  if (!skipped && lightKind(id)) w.done++;
  const next = w.list[w.list.indexOf(id) + 1];
  if (next) { openKindSheet(next); return; }
  const n = w.done, prev = w.prev; SORT = null; closeSheet();
  if (n) { save({ quiet: true, render: true }).then(() => toast(`${plural(n, 'light')} sorted`, { undo: async () => { S.config = JSON.parse(prev); await save({ msg: 'Undone' }); } })); }
  else render();
}
function pickPlace(id, p) { if (KP && KP.id === id && KIND_DEF.placeOf(p)) { KP.place = p; kindRender(); } }
function pickKind(id, k) {
  if (!KIND_ROLE[k]) return;
  const s = S.config.settings; s.light_kinds = s.light_kinds || {}; s.roles = s.roles || {};
  if (lightKind(id) === k) { delete s.light_kinds[id]; delete s.roles[id]; }
  else { s.light_kinds[id] = k; s.roles[id] = KIND_ROLE[k]; }
  saveSoon();
  if (KP && KP.id === id) kindRender();
  const d = dev(id); if (!d) return;
  document.querySelectorAll(`.lkind[data-ldisc="${id}"]`).forEach(b => { b.innerHTML = ICON(lightIcon(d)); });
  document.querySelectorAll('.tile[data-tgt] .face').forEach(f => { delete f.dataset.k; });
  paintLight();
}

// ---------- tiles: a little picture of the light each one controls ----------
function tileItems(t) {
  if (t.startsWith('p:')) { const p = presets().find(x => x.id === t.slice(2)); if (!p) return []; return Object.entries(p.levels).filter(([id]) => dev(id)).map(([id, v]) => { const lv = levelOf(v), c = colorOf(v); const h = entryHex(c); return { lv, icon: lightIcon(dev(id)), fill: h && lv > 0 ? lampFill(h, lv) : null }; }); }
  if (t.startsWith('s:')) return [{ lv: 0, icon: 'scene' }];
  return targetDevices(t).map(id => { const d = dev(id); const lv = isOn(id) ? (level(id) || 100) : 0; return { lv, icon: d.domain === 'light' || d.domain === 'switch' ? lightIcon(d) : domainIcon(d.domain), fill: colorState(id) && lv > 0 ? lightFill(id, lv) : null }; });
}
function tileFaceHTML(items) {
  if (!items.length) return `<div class="cluster one">${lampHTML(0, 44, ICON('bulb', 'sm'))}</div>`;
  if (items.length === 1) return `<div class="cluster one">${lampHTML(items[0].lv, 44, ICON(items[0].icon, 'sm'), '', false, items[0].fill)}</div>`;
  const xs = items.slice(0, 4);
  return `<div class="cluster ${['', 'one', 'two', 'three', 'four'][xs.length]}">${xs.map(i => lampHTML(i.lv, 28, ICON(i.icon, 'sm'), '', false, i.fill)).join('')}</div>`;
}
function paintTiles() {
  document.querySelectorAll('.tile[data-tgt] .face').forEach(face => {
    const items = tileItems(face.parentElement.dataset.tgt); const k = items.map(i => `${i.lv}/${i.icon}/${i.fill || ''}`).join(',');
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
  // a mood that would leave the room dark is not a look: the main light keeps a floor
  if (!Object.values(out).some(v => levelOf(v) > 0)) { const dim = roomDimmers(aid)[0]; if (dim) out[dim.device_id] = 15; }
  return out;
}
// Which mood the room is in right now, if any (within a couple of percent). A room with mood scenes is matched against them.
function levelsMatch(lv) {
  const ids = Object.keys(lv).filter(dev); if (!ids.length) return false;
  // a mood that leaves every light off is not a look: a dark room is dark, not "in Movie"
  if (!ids.some(id => levelOf(lv[id]) > 0)) return false;
  return ids.every(id => { const cur = level(id) || 0, want = levelOf(lv[id]); return dev(id).domain === 'switch' || dev(id).domain === 'fan' ? (cur > 0) === (want > 0) : Math.abs(cur - want) <= 2; });
}
function moodMatch(aid) {
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  if (ps.length) { const p = ps.find(x => levelsMatch(x.levels)); return p ? p.mood : null; }
  for (const m of MOODS) { if (levelsMatch(moodLevels(aid, m))) return m.id; }
  return null;
}
// The room card's first row (docs/ux-flows.md 7): the room's five mood scenes, or one chip that makes them.
// The room card's first row (docs/ux-flows.md 7): the room's mood scenes, nothing else. Making and changing moods lives under the room's More.
function moodRowHTML(aid) {
  if (!roomDimmers(aid).length) return '';
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  if (!ps.length) return '';
  const cur = moodMatch(aid);
  return `<div class="moodrow" data-moods="${aid}"><div class="moods">${ps.map(p => { const m = moodById(p.mood); return `<button class="mood ${cur === m.id ? 'sel' : ''}" data-act="mood" data-area="${aid}" data-mood="${m.id}">${lampHTML(presetMax(p), 32, ICON(m.icon, 'sm'))}<span>${m.name}</span></button>`; }).join('')}</div></div>`;
}
async function applyMood(aid, mid) {
  const m = moodById(mid); if (!m) return;
  const p = (typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : []).find(x => x.mood === mid);
  if (p) { for (const [id, v] of Object.entries(p.levels)) if (dev(id)) S.states[id] = { ...(S.states[id] || {}), level: levelOf(v) }; paintState(); await command({ type: 'preset', preset_id: p.id }); return; }
  const lv = moodLevels(aid, m);
  const byLevel = {};
  for (const [id, v] of Object.entries(lv)) { (byLevel[v] = byLevel[v] || []).push(`d:${id}`); S.states[id] = { ...(S.states[id] || {}), level: v }; }
  paintState();
  await Promise.all(Object.entries(byLevel).map(([v, ts]) => command({ type: 'level', target: ts.length === 1 ? ts[0] : ts, level: Number(v), fade: m.fade })));
}
function openMoodSave(aid) {
  const rows = MOODS.map(m => { const lv = moodLevels(aid, m); const desc = Object.entries(lv).map(([id, v]) => `${dev(id).name} ${dev(id).domain === 'switch' ? (v > 0 ? 'on' : 'off') : lvText(v).toLowerCase()}`).join(', '); return `<button class="item" data-act="mood-save-pick" data-area="${aid}" data-mood="${m.id}">${lampHTML(m.head, 40, ICON(m.icon, 'sm'))}<div class="grow"><div class="t">${m.name}</div><div class="d">${esc(desc)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`; }).join('');
  sheet.open('Which mood?', `<div class="card pad0 list">${rows}</div>`, { detent: 'compact', sub: `It becomes a scene for ${esc(areaName(aid))} that a remote button can run.` });
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
// short: true for the bar's one line (18 characters of names), 'wide' for the Now view's 24px headline (26), false on Home.
function lightNowHeadline(rooms, short = false) {
  // the quiet ten seconds change nothing on the page: the status dot is what says "Reconnecting" (core.js)
  if (connLost()) return 'Last known state';
  if (!rooms.length) return 'Everything is off';
  const n = rooms.map(r => r.name);
  const budget = short === 'wide' ? 26 : 18;
  if (short) { if (n.length > 2 || (n.length === 2 && n.join('').length > budget)) return `${n.length} rooms are on`; }
  else if (n.length > 2) return `${esc(n.slice(0, 2).join(', '))} and ${n.length - 2} more are on`;
  return `${esc(n.join(' and '))} ${n.length === 1 ? 'is' : 'are'} on`;
}
// The row under the house card on Home: the starred lights only, lit in their own colour and 56px, grey and 44px
// when off. Tap toggles one, hold a lit one for a sleep timer. A home with nothing starred shows no row at all and
// Home starts with the scenes (docs/ia-v5.md 3). "Show first on Home" is the star on the light's own page.
function rowLights() {
  const order = new Map(areas().map((a, i) => [a.id, i])); const f = S.config.favorites;
  return controllable().filter(d => (d.domain === 'light' || d.domain === 'switch') && f.includes('d:' + d.device_id))
    .sort((a, b) => ((order.get(devArea(a)) ?? 999) - (order.get(devArea(b)) ?? 999)) || a.name.localeCompare(b.name));
}
// Is a sleep timer running over this light?
function timerOn(id) { return Object.entries(S.timers || {}).some(([t, v]) => v && v.ends_at && targetDevices(tsplit(t)).includes(id)); }
function lampItemHTML(d) {
  const lv = isOn(d.device_id) ? (level(d.device_id) || 100) : 0;
  const ring = typeof ringClass === 'function' ? ringClass(d) : '';
  const size = lv > 0 ? 56 : 44;
  // the rainbow ring is the whole sign that this lamp has colour (docs/ia-v5.md 2): no button sits on the disc any
  // more. A hold opens the lamp's page, where Colour is one row under the dimmer.
  return `<div class="ln-lamp ${lv > 0 ? 'on' : ''}" role="button" tabindex="0" data-act="lamp-toggle" data-id="${d.device_id}" ${lv > 0 ? 'data-long="open-light"' : ''} data-t="d:${d.device_id}" data-level="${lv}" data-timer="${timerOn(d.device_id) ? 1 : ''}" title="${esc(d.name)}" aria-label="${esc(d.name)}, ${lv > 0 ? 'on' : 'off'}"><span class="lring ${ring}">${lampHTML(lv, size, ICON(lightIcon(d), 'sm'), '', false, lightFill(d.device_id, lv))}${timerOn(d.device_id) ? `<span class="badge">${ICON('clock')}</span>` : ''}</span><span class="ln-name">${esc(d.name)}</span></div>`;
}
// The hint under the row, the first three times Home is seen.
function lampHintHTML() {
  let n = 0; try { n = Number(localStorage.getItem('lnHint') || 0); if (!sessionStorage.getItem('lnHintSeen')) { sessionStorage.setItem('lnHintSeen', '1'); localStorage.setItem('lnHint', String(n + 1)); } } catch (_) { return ''; }
  return n < 3 ? `<p class="ln-hint">Tap to switch · hold for a timer</p>` : '';
}
// The headline the strip used to print is the house card's now; what is left here is what is due within the hour,
// the wind-down caption and the starred lamps.
function lightNowHTML() {
  const ds = rowLights();
  const due = typeof dueLineHTML === 'function' ? dueLineHTML() : '';
  return `<div class="lightnow ${ds.length ? '' : 'norow'}" id="lightnow"><div id="ln-due">${due}</div><div id="wd-home">${typeof windDownCaptionHTML === 'function' ? windDownCaptionHTML() : ''}</div><div class="ln-row ${ds.length ? '' : 'empty'}">${ds.map(d => lampItemHTML(d)).join('')}</div>${ds.length ? lampHintHTML() : ''}</div>`;
}
function paintLightNow() {
  const root = $('#lightnow'); if (!root) return;
  const row = root.querySelector('.ln-row');
  const ds = rowLights();
  const have = new Map([...row.querySelectorAll('.ln-lamp')].map(el => [el.dataset.id, el]));
  const order = ds.map(d => d.device_id).join(',');
  if (ds.length !== have.size || ds.some(d => !have.has(d.device_id)) || row.dataset.order !== order) { row.dataset.order = order; row.innerHTML = ds.map(d => lampItemHTML(d)).join(''); row.classList.toggle('empty', !ds.length); root.classList.toggle('norow', !ds.length); return; }
  for (const d of ds) {
    const el = have.get(d.device_id);
    const lv = isOn(d.device_id) ? (level(d.device_id) || 100) : 0;
    const fill = lightFill(d.device_id, lv);
    const tm = timerOn(d.device_id) ? '1' : '';
    if (el.dataset.timer !== tm) { el.dataset.timer = tm; const b = el.querySelector('.badge'); if (tm && !b) el.querySelector('.lring').insertAdjacentHTML('beforeend', `<span class="badge">${ICON('clock')}</span>`); else if (!tm && b) b.remove(); }
    if (Number(el.dataset.level) === lv && el.dataset.fill === fill) continue;
    const was = Number(el.dataset.level) > 0;
    el.dataset.level = lv; el.dataset.fill = fill;
    el.classList.toggle('on', lv > 0);
    if (lv > 0) el.setAttribute('data-long', 'open-light'); else el.removeAttribute('data-long');
    const lamp = el.querySelector('.lamp'); lamp.classList.toggle('off', lv <= 0);
    // the disc breathes: colour, and size 44 to 56 when it comes on
    const size = lv > 0 ? 56 : 44;
    if (was !== lv > 0) tween(lamp, { backgroundColor: fill, width: size, height: size }); else tween(lamp, { backgroundColor: fill });
  }
}
// A room opens as its own page now (js/room.js).
function openRoomCard(aid) { if (typeof goRoom === 'function') goRoom(aid); }
// The room card's disc (and the Now view's) takes the ramp fill at the room's mean level; off is the off grey.
function paintLnHint() { /* the hint is rendered once per visit; nothing to repaint */ }
function paintOnChips() {
  document.querySelectorAll('[data-onchip]').forEach(el => {
    const t = el.dataset.onchip; const on = targetOn(t);
    const c = lampColor(on ? roomMean(t.slice(2)) : 0);
    el.classList.toggle('off', !on);
    if (el.dataset.fill === c) return;
    if (el.dataset.fill) tween(el, { backgroundColor: c }); else el.style.backgroundColor = c;
    el.dataset.fill = c;
  });
}
// Each light row's disc follows its own level.
// The value printed on a light's row: "62%", "Off", "Medium", or a colour dot and its name.
function paintLightRowValues() {
  document.querySelectorAll('[data-lrowval]').forEach(el => {
    const d = dev(el.dataset.lrowval); if (!d || typeof lightRowValue !== 'function') return;
    const v = lightRowValue(d); if (el.innerHTML !== v) el.innerHTML = v;
  });
}
function paintLightDiscs() {
  document.querySelectorAll('[data-ldisc]').forEach(el => {
    const id = el.dataset.ldisc; const d = dev(id); if (!d) return;
    const lv = d.domain === 'light' || d.domain === 'switch' ? (level(id) || 0) : (isOn(id) ? 100 : 0);
    const c = lightFill(id, lv);
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
let POWEROFF = null;   // set while the "some lights are automated" sheet is open; read by its two buttons, in boot.js
function litLights() { return controllable().filter(d => (d.domain === 'light' || d.domain === 'switch') && (level(d.device_id) || 0) > 0); }
function houseLevel() { const ls = litLights(); return ls.length ? meanLevel(ls.map(d => d.device_id)) : 0; }
// Of the given lights, the ones an enabled automation turns on (never one whose action turns them off; that
// automation already wants them dark, so the power button is not fighting it). A preset an automation runs is
// not unpacked here, only a plain level or "back on" action, which covers the ordinary case.
function autoOnLights(ids) {
  const set = new Set(ids); const hit = new Set();
  for (const sc of (typeof schedules === 'function' ? schedules() : [])) {
    if (sc.enabled === false) continue;
    for (const a of sc.actions || []) {
      if (!((a.type === 'level' && a.level !== 'off' && a.level !== 0) || a.type === 'restore')) continue;
      for (const id of targetDevices(a.target)) if (set.has(id)) hit.add(id);
    }
  }
  return [...hit];
}
function turnOffLights(target) {
  const ids = targetDevices(target);
  if (!ids.length) return;   // nothing to turn off: an empty list is not a valid command, so this is a no-op
  for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level: 0 };
  paintState();
  command({ type: 'level', target, level: 'off' });
}
// The power button: everything off while anything is lit, unless some of what is lit is on an automation, in
// which case a short sheet asks first rather than quietly fighting it every time. With the house dark it turns
// the lights on, either the ones that were on before (the connector remembers them) or every light, as the
// Settings choice says.
function powerButton() {
  if (litLights().length) {
    const lit = litLights().map(d => d.device_id);
    const auto = autoOnLights(lit);
    if (auto.length) { openPowerOffSheet(lit, auto); return; }
    turnOffLights('h:all');
    return;
  }
  const all = (S.config.settings.power_on || 'restore') === 'all';
  command(all ? { type: 'level', target: 'h:all', level: 'on' } : { type: 'restore', target: 'h:all' });
}
// The choice, once: turn everything off anyway, or leave the automated ones and turn off just the rest.
// Closing the sheet without picking either leaves the house exactly as it was.
function openPowerOffSheet(lit, auto) {
  const names = auto.map(id => (dev(id) || {}).name).filter(Boolean);
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const one = names.length === 1;
  const rest = lit.filter(id => !auto.includes(id));
  const body = `<p class="body" style="margin:0 0 20px">${esc(list)} ${one ? 'is' : 'are'} on an automation right now. Turn ${one ? 'it' : 'them'} off with everything else, or leave ${one ? 'it' : 'them'} on and turn off the rest of the house?</p>
    <div class="card pad0 list">
      <button class="item" data-act="poweroff-all"><div class="grow"><div class="t">Turn off everything</div></div></button>
      <button class="item" data-act="poweroff-rest"><div class="grow"><div class="t">Leave ${one ? 'it' : 'them'} on</div><div class="d">${rest.length ? `${plural(rest.length, 'other light')} turn off` : 'Nothing else is on'}</div></div></button>
    </div>`;
  showSheet('poweroff', 'Some lights are automated', body, { detent: 'compact' });
  POWEROFF = { lit, auto, rest };
}
function powerLabel() { return litLights().length ? 'All off' : ((S.config.settings.power_on || 'restore') === 'all' ? 'All on' : 'Lights back on'); }
function powerTitle() { return litLights().length ? 'All off. Hold for shades and fans' : (powerLabel() + '. Hold for shades and fans'); }
// Shared by the bar and the Now view: one command in flight while dragging, the last value always lands.
function setHouseLevel(v) {
  v = clamp(Math.round(v), 1, 100);
  // dims what is on; when nothing is on, sliding is how the house comes on: every light goes to that level
  const lit = litLights().map(d => d.device_id);
  const ids = lit.length ? lit : controllable().filter(d => d.domain === 'light' || d.domain === 'switch').map(d => d.device_id);
  if (!ids.length) return;
  for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level: v };
  sendLevel(ids.map(id => `d:${id}`), v);
  paintState();
}

// ---------- the house card at the top of Home (docs/ia-v5.md 3, 4) ----------
// The house is one object with a continuous value, so it gets a card and not a list row: the headline, the count and
// the mean level, the house dimmer, All off, and a "..." that carries Night, a house-wide sleep timer and the hold's
// "everything off, and close the shades". The floating bar used to hold these; on Home nothing floats now.
function nowSub(rooms, on, lv) {
  if (!on.length) return connOk() ? 'Slide the dimmer or tap the power button to bring the lights up' : '';
  return `${plural(on.length, 'light')} · ${lv}%${rooms.length > 6 ? ` · ${rooms.length - 6} more rooms` : ''}`;
}
function houseCardHTML() {
  const rooms = roomsLit(); const on = litLights(); const lv = houseLevel();
  return `<div class="housecard" id="housecard">
    <div class="hc-head" id="hc-head">${lightNowHeadline(rooms, 'wide')}</div>
    <div class="hc-sub" id="hc-sub">${nowSub(rooms, on, lv)}</div>
    <div class="hc-level">${ICON('sun-low', 'sm')}<input class="slider" type="range" min="1" max="100" value="${on.length ? lv : 1}" style="--p:${on.length ? lv : 0}%" data-house="1" aria-label="House brightness"><span class="hc-num">${on.length ? lv + '%' : 'Off'}</span></div>
    <div class="hc-actions">
      <button class="hc-off ${on.length ? '' : 'dark'}" data-act="alloff" title="${powerTitle()}" aria-label="${powerLabel()}"><span class="c">${ICON('power', 'sm')}</span><span id="hc-pw">${powerLabel()}</span></button>
      <button class="iconbtn hc-more" data-act="house-more" title="More for the house" aria-label="More for the house">${ICON('dots', 'sm')}</button>
    </div></div>`;
}
// The "..." menu: a compact sheet with the three rare house-wide things.
function houseMenuSheet() {
  const on = litLights();
  const body = `<div class="card pad0 list">
    <button class="item" data-act="now-night" ${on.length ? '' : 'disabled'}>${ICON('moon')}<div class="grow"><div class="t">Night in every lit room</div><div class="d">${on.length ? 'The Night mood wherever a light is on' : 'Nothing is on'}</div></div></button>
    <button class="item" data-act="house-timer" ${on.length ? '' : 'disabled'}>${ICON('clock')}<div class="grow"><div class="t">Sleep timer</div><div class="d">${on.length ? `${plural(on.length, 'light')} fade off when the time is up` : 'Nothing is on'}</div></div></button>
    <button class="item" data-act="house-shades">${ICON('shade')}<div class="grow"><div class="t">Everything off, and close the shades</div><div class="d">The fans stop too. Holding the power button does the same.</div></div></button>
  </div>`;
  showSheet('house-more', 'The whole house', body, { sub: nowSub(roomsLit(), on, houseLevel()) || 'Everything is off', detent: 'compact' });
}
function paintHouseCard() {
  const root = $('#housecard'); if (!root) return;
  const rooms = roomsLit(); const on = litLights(); const lv = houseLevel();
  const head = root.querySelector('#hc-head'); const h = lightNowHeadline(rooms, 'wide');
  if (head && head.innerHTML !== h) { if (window.Motion) Motion.textSwap(head, h); else head.innerHTML = h; }
  const sub = root.querySelector('#hc-sub'); const sv = nowSub(rooms, on, lv); if (sub && sub.textContent !== sv) sub.textContent = sv;
  const sl = root.querySelector('[data-house]');
  if (sl && !sl.dataset.drag) { sl.value = on.length ? lv : 1; sl.style.setProperty('--p', `${on.length ? lv : 0}%`); const num = root.querySelector('.hc-num'); if (num) num.textContent = on.length ? `${lv}%` : 'Off'; }
  const pw = root.querySelector('.hc-off');
  if (pw) { pw.classList.toggle('dark', !on.length); pw.title = powerTitle(); pw.setAttribute('aria-label', powerLabel()); const lab = pw.querySelector('#hc-pw'); if (lab && lab.textContent !== powerLabel()) lab.textContent = powerLabel(); }
}
// The running timer that ends soonest (the house timer or a room's); any light's timer counts, lit or not.
function nowTimer() {
  let best = null;
  for (const [t, v] of Object.entries(S.timers || {})) {
    if (!v || !v.ends_at) continue;
    if (!best || v.ends_at < best.v.ends_at) best = { t, v };
  }
  return best;
}
function nowRingHTML(t, v, size, width, cls) {
  const total = timerTotal(t, v.ends_at), f = clamp(minutesLeft(v.ends_at) / total, 0, 1);
  const r = size / 2 - width, c = 2 * Math.PI * r;
  return `<svg class="tring ${cls}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" style="--w:${width}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/><circle class="prog" cx="${size / 2}" cy="${size / 2}" r="${r}" style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - f)}"/></svg>`;
}

// ---------- light detail sheet (B): the Tenzing dimmer dialog, white and elevated ----------
let LD = null;
// opts.onBack: shown as a back arrow instead of the plain X, for a light opened from somewhere with a screen to
// return to (a room's own sheet). Left out, this behaves exactly as it always has: no back arrow, since it is
// the first screen in its own sheet. Every sub-screen (Colour, More, the sleep timer, Follow the day) reopens
// this same sheet with a bare `openLightSheet(id)`, so the chain below reads that back option straight off the
// still-open LD rather than losing it: whatever got you here is still where "back" goes, however many panes deep.
function openLightSheet(id, opts = {}) {
  const d = dev(id); if (!d) return;
  const reentry = sheet.isOpen() && LD && LD.id === id;
  const onBack = opts.onBack !== undefined ? opts.onBack : (reentry ? LD.onBack : null);
  const lv = level(id) || 0, t = `d:${id}`, dim = d.domain === 'light';
  const colour = colorState(id); // a Hue lamp's {mode, kelvin, hex}; null for a Caseta light
  LD = { id, lv, dim, dragging: false, lastSend: 0, drag0: null, stTween: null, color: colour ? { ...colour } : null, more: false, onBack };
  const well = `<div class="vcol"><div class="vslider" role="slider" aria-label="Brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${lv}" tabindex="0" style="--p:${lv}%"></div>
      <div class="vsteps"><button class="iconbtn down" data-act="ld-step" data-d="-10" aria-label="Dimmer">${ICON('chev')}</button><button class="iconbtn up" data-act="ld-step" data-d="10" aria-label="Brighter">${ICON('chev')}</button></div></div>`;
  // one composition: the disc and the well side by side, centred; one readout under them; Colour as one value row; the
  // three actions. The warmth slider and the swatches live behind the Colour row, which pushes its own pane.
  const body = `<div class="ld" id="ld" data-id="${id}">
    <div class="ld-hero"><div class="ld-stage"><div class="lamp ld-disc ${lv > 0 ? '' : 'off'}" style="width:${heroSize(lv)}px;height:${heroSize(lv)}px;background:${lightFill(id, lv)}" role="button" tabindex="0" aria-label="Drag up or down to dim, tap to turn ${lv > 0 ? 'off' : 'on'}">${ICON(lightIcon(d), 'lampart')}</div></div>
      ${dim ? well : `<div class="ld-swcol"><button class="sw ${lv > 0 ? 'on' : ''}" data-act="ld-toggle" aria-label="On or off"></button></div>`}</div>
    <div class="ld-level">${lvLabel(lv, dim)}</div>
    ${colourRowHTML(id, d, colour)}
    <div class="ld-actions">
      <button class="rbtn" data-act="ld-timer" data-t="${t}" ${lv > 0 ? '' : 'disabled'}><span class="c">${ICON('clock')}</span><span>Sleep timer</span></button>
      <button class="rbtn ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="ld-fav" data-t="${t}"><span class="c">${ICON('star')}</span><span>Show first</span></button>
      <button class="rbtn" data-act="ld-more" data-id="${id}"><span class="c">${ICON('dots')}</span><span>More</span></button>
    </div>
  </div>`;
  sheet.open(esc(d.name), body, { detent: 'medium', sub: lightCaption(id), back: !!onBack, onBack });
  wireLightSheet();
  if (opts.colour) openColourSheet(id);
}
// Colour on the light page: one value row whose value is the colour the lamp is showing, a dot and its name.
// That row is both the sign that this lamp has colour and the way in (docs/ia-v5.md 2).
const colourTitle = d => (d.color ? 'Colour' : 'Warmth');
// The name alone on the row ("Warm", "Red"), never the kelvin: the row has one line, and the number belongs to the
// pane behind it, where the warmth slider prints it.
function colourValueHTML(cur, id) {
  const tag = id && typeof followTagHTML === 'function' ? followTagHTML(id) : '';
  return `${colourDot(cur)}${esc(String(colourLabel(cur)).split(' · ')[0])}${tag}`;
}
function colourRowHTML(id, d, cur) {
  if (!d.ct && !d.color) return '';
  // a lamp that is following the day says so beside the white it is showing, and the row under it is where that
  // is switched on and off (docs/ux-progressive.md 2.24)
  const follow = typeof followRowHTML === 'function' ? followRowHTML(id) : '';
  return `<div class="card pad0 list ld-colour">${valueRow(colourTitle(d), `<span data-ldcolour>${colourValueHTML(cur, id)}</span>`, 'light-colour', `data-id="${id}"`)}${follow}</div>`;
}
// The colour controls: their own pane, pushed from the row, with a back arrow to the light's page. The sheet goes
// large because the warmth slider, the swatches and the hue strip need the room (docs/ia-v5.md 3, 5).
function openColourSheet(id) {
  const d = dev(id); if (!d || (!d.ct && !d.color)) return;
  if (!LD || LD.id !== id) { openLightSheet(id); return; }
  // a lamp with colour needs the room for the swatches and the hue strip, so the sheet goes large; a lamp that only
  // has a white temperature is one slider, and a compact sheet is the whole of it
  const bare = !d.color;
  // on its own screen the hue strip is open from the start and every colour is shown at once: this is the screen the
  // owner could not find, so nothing on it is hidden behind a second tap
  if (LD.more == null || LD.more === false) LD.more = !!d.color;
  const body = `<div class="ld-ccol">${colorCtlHTML('ld', id, d, LD.color, { more: !!LD.more, bare, full: true })}</div>`;
  showSheet('light-colour', colourTitle(d), body, { detent: d.color ? 'large' : 'compact', sub: `${esc(d.name)} · ${esc(devAreaName(d))}`, back: true, onBack: () => openLightSheet(id) });
}
// The light page's More (2.2): its room (docs' owner example: a light's own page is where you'd think to move a
// light to a different room), what kind of light it is, and removing it from the home.
function lightMoreSheet(id) {
  const d = dev(id); if (!d) return;
  const k = lightKind(id); const kind = k ? (KINDS.find(x => x[0] === k) || [])[1] : null; const role = lightRole(id);
  const body = `<div class="card pad0 list">
    ${valueRow('Room', esc(devAreaName(d)), 'ld-room', `data-id="${id}"`)}
    ${valueRow('Kind of light', kind ? esc(kind) : 'Not set', 'ld-kind', `data-id="${id}"`)}
    ${/^(hue_|nanoleaf_)/.test(String(id)) ? '' : `<button class="item ld-remove" data-act="dev-remove" data-id="${id}">${ICON('trash')}<div class="grow"><div class="t">Remove from my home</div><div class="d">It leaves your Lutron bridge.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`}
  </div>`;
  void role;
  showSheet('light-more', esc(d.name), body, { detent: 'compact', sub: lightCaption(id), back: true, onBack: () => openLightSheet(id) });
}
function wireLightSheet() {
  const root = $('#ld'); if (!root || !LD) return;
  const disc = root.querySelector('.ld-disc'), sl = root.querySelector('.vslider');
  const st = { lv: LD.lv };
  // the disc glows in the lamp's own colour when it has one; the well's fill takes the same tint
  const fill = v => { const h = stateHex(LD.color); return h && v > 0 ? lampFill(h, v) : lampColor(v); };
  const tintWell = () => { if (sl) { const h = stateHex(LD.color); if (h) sl.style.setProperty('--vfill', lampFill(h, 100)); else sl.style.removeProperty('--vfill'); } };
  const apply = v => { const s = heroSize(v); disc.style.width = disc.style.height = `${s}px`; disc.style.background = fill(v); disc.classList.toggle('off', v <= 0); };
  tintWell();
  // the well's tint and the disc always; the colour pane's controls when that is what is showing, and the row's
  // dot and name when the light's page is (the sheet holds one or the other, never both)
  LD.paintColor = () => {
    tintWell(); apply(LD.lv);
    colorPaint($('#sheet-root .ccol'), LD.color);
    const v = $('#sheet-root [data-ldcolour]'); if (v) v.innerHTML = colourValueHTML(LD.color, LD.id);
  };
  // the disc follows the finger with an 80ms lag, so it breathes rather than snaps
  const quick = window.gsap && MOTION.d > 0 ? gsap.quickTo(st, 'lv', { duration: .08, ease: 'power3.out', onUpdate: () => apply(st.lv) }) : v => { st.lv = v; apply(v); };
  LD.show = (v, animate) => {
    v = clamp(Math.round(v), 0, 100); LD.lv = v;
    if (animate && window.gsap && MOTION.d > 0) { if (LD.stTween) LD.stTween.kill(); LD.stTween = gsap.to(st, { lv: v, duration: MOTION.d, ease: MOTION.ease, onUpdate: () => apply(st.lv) }); }
    else quick(v);
    root.querySelector('.ld-level').textContent = lvLabel(v, LD.dim);
    if (sl) { sl.style.setProperty('--p', `${v}%`); sl.setAttribute('aria-valuenow', v); }
    const sw = root.querySelector('[data-act="ld-toggle"]'); if (sw) sw.classList.toggle('on', v > 0);
    const tb = root.querySelector('[data-act="ld-timer"]'); if (tb) tb.disabled = v <= 0;
    disc.setAttribute('aria-label', `Drag up or down to dim, tap to turn ${v > 0 ? 'off' : 'on'}`);
  };
  // one command in flight while dragging, the last value always lands (sendLevel drops the ones between)
  const sendNow = v => { S.states[LD.id] = { ...(S.states[LD.id] || {}), level: v }; LD.lastSend = Date.now(); sendLevel(`d:${LD.id}`, v); paintState(); };
  const queue = sendNow;
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
  disc.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const v = LD.lv > 0 ? 0 : (LD.dim ? S.config.settings.group_on_level : 100); LD.show(v); sendNow(v); } });
}
// The light sheet's colour controls (js/color.js): every change goes to the lamp at once, one in flight, newest wins.
colorHost('ld', {
  cur: id => (LD && LD.id === id ? LD.color : colorState(id)),
  opts: () => ({ more: !!(LD && LD.more) }),
  more: (id, open) => { if (LD && LD.id === id) LD.more = open; },
  set(id, v) {
    if (!LD || LD.id !== id || !v) return;
    const prev = LD.color || {};
    LD.color = v.kelvin != null ? { ...prev, mode: 'ct', kelvin: v.kelvin, hex: kelvinHex(v.kelvin) } : { ...prev, mode: 'xy', hex: v.hex };
    S.states[id] = { ...(S.states[id] || {}), color: { ...((S.states[id] || {}).color || {}), ...LD.color } };
    // a colour change turns the lamp on (the connector sends on: true); show it at full until the echo says otherwise
    if (LD.lv <= 0) { LD.show(100); S.states[id].level = 100; }
    LD.lastSend = Date.now();
    sendColor(`d:${id}`, v);
    LD.paintColor(); paintState();
  },
});
// A real state change while the sheet is open moves the disc once (never while the thumb is on it).
function paintLightDetail() {
  const root = $('#ld') || $('#sheet-root .ccol');
  if (!root || !LD || !LD.show || LD.dragging || Date.now() - LD.lastSend < 800 || levelQuiet(`d:${LD.id}`)) return;
  const v = level(LD.id) || 0;
  if (v !== LD.lv) LD.show(v, true);
  // the lamp's colour changed elsewhere (the Hue app, a scene): the disc and the controls follow
  const c = colorState(LD.id);
  if (c && LD.paintColor && JSON.stringify(c) !== JSON.stringify(LD.color)) { LD.color = { ...c }; LD.paintColor(); }
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
      <div class="td-centre"><div class="td-cap">Off in</div><div class="td-min display">${min} min</div>${lampHTML(lv, 96, timerLampInner(t), 'td-lamp', false)}</div>
      <div class="td-knob" style="left:${p.x}px;top:${p.y}px"></div>
    </div>
    <div class="chips scroll">${TIMER_CHIPS.map(m => `<button class="chip sm ${m === min ? 'sel' : ''}" data-act="timer-pick" data-m="${m}">${m} min</button>`).join('')}</div>
    <button class="btn primary lg block" data-act="timer" data-t="${esc(t)}" data-m="${min}" ${st}>Start</button>
  </div>`;
}
function sleepDialSheet(t, opts = {}) {
  const body = dialHTML(t, 20);
  sheet.open('Sleep timer', body, { detent: 'medium', sub: `${esc(cap(targetName(tsplit(t))))} fades off when the time is up.`, back: !!opts.back, onBack: opts.back || null });
  wireDial();
}
function wireDial() {
  const root = $('#td'); if (!root || !TD) return;
  const ring = root.querySelector('.td-ring'), prog = root.querySelector('.prog'), knob = root.querySelector('.td-knob');
  const show = (min, animate) => {
    TD.min = min;
    root.querySelector('.td-min').textContent = `${min} min`;
    ring.setAttribute('aria-valuenow', min);
    root.querySelectorAll('.chips .chip').forEach(c => { const sel = Number(c.dataset.m) === min; c.classList.toggle('sel', sel); if (sel && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: MOTION.d ? 'smooth' : 'auto' }); });
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
  TD.show = show;
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
  const totalS = total * 60, elapsedS = Math.max(0, totalS - Math.max(0, v.ends_at - Date.now() / 1000));
  const n = targetDevices(tgt).length; const who = n > 3 ? plural(n, 'light') : cap(targetName(tgt));
  return `<div class="timerbar m-timer" style="--m-total:${totalS}s;--m-elapsed:${Math.round(elapsedS)}s"><div class="m-timer-line"></div><div class="ring40" data-ring="${esc(t)}" data-ends="${v.ends_at}" data-f="${f.toFixed(3)}"><svg class="tring" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle class="track" cx="20" cy="20" r="18"/><circle class="prog" cx="20" cy="20" r="18" style="stroke-dasharray:${RING40_C};stroke-dashoffset:${RING40_C * (1 - f)}"/></svg><span class="lamp" style="width:${s}px;height:${s}px;background:${lampColor(lv)}"></span></div><div class="grow"><div class="t">${esc(who)} ${v.level ? 'to ' + v.level + '%' : 'off'} <span data-countdown="${v.ends_at}"></span></div><div class="d">Sleep timer</div></div><button class="btn sm" data-act="cancel-timer" data-t="${esc(t)}">Cancel</button></div>`;
}
// The Home ring drains once a minute; the disc inside follows the light's level.
function paintRings() {
  document.querySelectorAll('[data-ring]').forEach(el => {
    const t = el.dataset.ring, endsAt = Number(el.dataset.ends);
    const total = timerTotal(t, endsAt), f = clamp(minutesLeft(endsAt) / total, 0, 1); const C = Number(el.dataset.c) || RING40_C;
    if (f.toFixed(3) !== el.dataset.f) { el.dataset.f = f.toFixed(3); tween(el.querySelector('.prog'), { strokeDashoffset: C * (1 - f) }); }
    const lv = meanLevel(targetDevices(tsplit(t))); const s = 12 + 16 * lv / 100, c = lampColor(lv);
    const disc = el.querySelector('.lamp'); if (disc && !disc.classList.contains('td-lamp') && disc.dataset.lv !== String(lv)) { if (disc.dataset.lv != null) tween(disc, { width: s, height: s, backgroundColor: c }); disc.dataset.lv = lv; }
    if (disc && disc.classList.contains('td-lamp') && disc.dataset.lv !== String(lv)) { disc.dataset.lv = lv; disc.style.background = c; disc.classList.toggle('off', lv <= 0); }
    el.querySelectorAll('[data-countdown-min]').forEach(m => { m.textContent = `${minutesLeft(endsAt)} min`; });
  });
  const td = $('#td'); if (td && TD && !TD.dragging) { const disc = td.querySelector('.td-lamp'); const lv = meanLevel(targetDevices(tsplit(TD.t))); if (disc && disc.dataset.lv !== String(lv)) { if (disc.dataset.lv != null) tween(disc, { backgroundColor: lampColor(lv) }); disc.dataset.lv = lv; disc.classList.toggle('off', lv <= 0); } }
}
setInterval(() => { if (document.querySelector('[data-ring]')) paintRings(); paintHouseCard(); }, 15000);

// ---------- night look (H): the surfaces stay (Tenzing has no warm mode); lit rooms glow warm from their discs and the light field rests ----------
const THEME_COLOR = { day: '#f8f8f8', night: '#f8f8f8' };
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
  document.querySelectorAll('.lamp.off').forEach(el => { el.style.background = lampOff(); delete el.dataset.fill; });
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
  paintLightRowValues();
  paintTiles();
  paintMoodRows();
  paintRings();
  paintLightDetail();
  if (typeof paintFollow === 'function') paintFollow();
  paintHouseCard();
}

// Everything off, plus the shades closed and the fans stopped: the power button's hold, and the one row in the
// house card's menu that says so in words.
async function houseAllOffShades() {
  if (sheet.isOpen() && SHEET_KEY === 'house-more') sheet.close();
  if (window.Motion) Motion.allOff();
  await command({ type: 'level', target: 'h:all', level: 'off' });
  for (const d of controllable()) { if (d.domain === 'cover') command({ type: 'lower', target: `d:${d.device_id}` }); if (d.domain === 'fan') command({ type: 'fan', target: `d:${d.device_id}`, speed: 'Off' }); }
  toast('Everything off, shades closing');
}

// ---------- events: the same delegated pattern as boot.js, for the acts this file owns ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'lamp-toggle': { const now = Date.now(); if (el._tap && now - el._tap < 300) break; el._tap = now; toggleTarget(`d:${d.id}`); break; }  // a double tap is one toggle, not two
    case 'lamp-room': openRoomCard(d.id); break;
    // opened from inside the Room sheet: its back arrow returns to that room's own screen, redrawn in place
    case 'light-open': { if (SHEET_KEY === 'room' && S.room) openLightSheet(d.id, { onBack: () => renderRoomSheet() }); else openLightSheet(d.id); break; }
    case 'light-colour': { const id = d.id; if (LD && LD.id === id && sheet.isOpen()) openColourSheet(id); else openLightSheet(id, { colour: true }); break; }
    case 'kind-open': openKindSheet(d.id); break;
    case 'room-more': if (typeof goRoom === 'function') goRoom(d.area, 'setup'); break;
    case 'room-kind': { const id = d.id; openKindSheet(id); break; }
    case 'timer-pick': if (TD && TD.show) TD.show(Number(d.m), true); break;
    case 'kind-place': pickPlace(d.id, d.p); break;
    case 'kind-pick': pickKind(d.id, d.k); break;
    case 'mood': applyMood(d.area, d.mood); break;
    case 'mood-save': openMoodSave(d.area); break;
    case 'mood-save-pick': saveMoodScene(d.area, d.mood); break;
    case 'ld-step': if (LD && LD.set) LD.set(LD.lv + Number(d.d)); break;
    case 'ld-toggle': if (LD && LD.show) { const v = LD.lv > 0 ? 0 : 100; LD.show(v); S.states[LD.id] = { ...(S.states[LD.id] || {}), level: v }; LD.lastSend = Date.now(); command({ type: 'level', target: `d:${LD.id}`, level: v }); paintState(); } break;
    case 'ld-timer': { const id = LD && LD.id; if (id && !(level(id) > 0)) break; sleepTimerSheet(d.t, { back: id ? () => openLightSheet(id) : null }); break; }
    case 'ld-fav': toggleFav(d.t); el.classList.toggle('on', S.config.favorites.includes(d.t)); break;
    case 'ld-kind': { const id = d.id; openKindSheet(id, { back: () => lightMoreSheet(id) }); break; }
    case 'ld-room': { const id = d.id; if (typeof roomsMoveSheet === 'function') roomsMoveSheet(id, devArea(dev(id)), { back: true, onBack: () => lightMoreSheet(id) }); break; }
    case 'ld-more': lightMoreSheet(d.id); break;
    case 'sort-next': sortStep(d.id, false); break;
    case 'sort-skip': sortStep(d.id, true); break;
    // the pill's caption goes to Home, where the house card lives (the Now view is gone)
    case 'now-open': if (S.view !== 'home') { S.view = 'home'; location.hash = 'home'; render(); window.scrollTo(0, 0); } break;
    case 'house-more': houseMenuSheet(); break;
    case 'house-timer': { const ids = litLights(); if (!ids.length) break; sleepDialSheet(ids.map(x => `d:${x.device_id}`).join('|'), { back: () => houseMenuSheet() }); break; }
    case 'house-shades': houseAllOffShades(); break;
    case 'now-night': { const rs = roomsLit(); if (!rs.length) { toast('Nothing is on'); break; } if (window.Motion) Motion.press(el.querySelector('.c') || el); for (const r of rs) applyMood(r.id, 'night'); if (sheet.isOpen() && SHEET_KEY === 'house-more') sheet.close(); toast(`Night in ${rs.length > 2 ? plural(rs.length, 'room') : rs.map(r => r.name).join(' and ')}`); break; }
    case 'timer': rememberTimer(d.t, Number(d.m)); break; // boot.js sends it; this remembers how long it was
    case 'night-look': setNightLook(d.v); break;
    case 'sort-go': openSortWalk(); break;
  }
});
