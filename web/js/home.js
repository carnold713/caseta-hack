/* Home: control the house right now. Top to bottom: the headline, what is due within the hour, every light as a lamp
   in one row, the rooms, the scenes as one chip row, and one row of advice last. */
'use strict';

VIEWS.home = {
  top() {
    const name = (S.config.settings.home_name || 'Home');
    return `<div class="t1">${esc(name)}</div>${statusCircle()}`;
  },
  body() {
    const hasDevices = controllable().length > 0;
    if (!hasDevices && !S.agent.online) return setupEmpty();
    let h = `<div class="m-hero"><div class="m-lightfield" id="lightfield"></div>` + lightNowHTML() + `</div>`;
    h += '<div class="h2">Rooms</div>';
    h += areas().map(roomCard).join('');
    const timers = Object.entries(S.timers || {});
    if (timers.length) h += `<div class="h3" style="margin-top:24px">Sleep timers</div>` + timers.map(([t, v]) => timerBlockHTML(t, v)).join('');
    h += sceneRowHTML();
    // one row of advice at most (docs/ux-progressive.md 2.1a): not connected beats everything, then the Next row, then nothing
    if (!S.agent.online) h += `<div class="card pad0 list nextrow"><button class="item" data-act="nav" data-view="settings"><div class="grow"><span class="cap">Not connected</span><div class="t">Not connected to your home</div><div class="d">Showing the last known state. Your remotes keep working.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
    else if (typeof nextCardHTML === 'function') h += nextCardHTML();
    return h;
  },
  after() {
    tickCountdowns();
    if (!controllable().length && !S.agent.online && !S._setupShown) { S._setupShown = true; setTimeout(openSetupSheet, 350); }
    // the moment the connector's first snapshot lands, the connect walk has done its job
    if (walkIs('connect') && controllable().length && S.agent.online) closeSheet();
  },
};

// Nothing connected yet: the page carries a tip, and on Home a walk slides over it once.
function setupEmpty() {
  return `<button class="tip" data-act="setup-open" style="margin-top:8px"><div class="grow"><span class="cap">Get started</span><div class="t">Let's connect your home</div><div class="d">A small helper program links this app to your Lutron bridge. About ten minutes, once.</div></div><span class="go">${ICON('chev')}</span></button>`;
}
// Connect your home (docs/ux-progressive.md 2.18): two steps, and the second stays until the home connects.
function openSetupSheet() {
  const demo = { device_id: '', name: 'Pico', type: 'Pico3ButtonRaiseLower', area: null };
  const line = `curl -fsSL "${location.origin}/install.sh?token=${S.token}" | sh`;
  walk({ key: 'connect', title: "Let's connect your home", steps: [
    { id: 'computer', kind: 'pick', title: 'Do you have a computer at home that stays on?', sub: 'A Mac, a Raspberry Pi, a NAS, an old laptop. A small helper program on it links this app to your Lutron bridge. About ten minutes, once.',
      body: () => `<div class="stage sm">${picoSVG(demo, { width: 76, model: 'PJ2-3BRL' })}</div><div class="card pad0 list">${pickRow('yes', 'Yes, show me how')}<button class="item" data-act="sheet-close"><div class="grow"><div class="t">Not yet</div></div></button></div>` },
    { id: 'paste', kind: 'custom', noNext: true, title: 'Paste this line on that computer', sub: 'Open the Terminal app on it, paste this line, press Enter.',
      body: () => `<div class="code"><code>${esc(line)}</code><button class="iconbtn sm" data-act="copy" data-text="${esc(line)}">${ICON('copy', 'sm')}</button></div>
        <p class="body" style="margin:16px 0 0">When it asks, press the small black button on the back of your Lutron bridge.</p>
        <p class="d" style="margin:12px 0 0">The moment it connects, the dot at the top turns green and your rooms appear. It starts again by itself after a restart.</p>` },
  ] });
}
// Scenes on Home: one chip row under a small caption. A tap runs the scene; the first chip makes a new one. A starred scene is pinned to the front.
function homeScenes() {
  const favs = S.config.favorites;
  const sc = [...presets().filter(p => !(p.mood && p.area)).map(p => ({ id: 'p:' + p.id, name: p.name })), ...lutronScenes().map(s => ({ id: 's:' + s.scene_id, name: s.name }))];
  return sc.sort((a, b) => (favs.includes(b.id) ? 1 : 0) - (favs.includes(a.id) ? 1 : 0));
}
function sceneRowHTML() {
  const sc = homeScenes();
  const chip = s => { const items = tileItems(s.id); const it = items[0] || { lv: 0, icon: 'scene' }; return `<button class="chip" data-act="run-scene" data-t="${s.id}">${lampHTML(it.lv, 24, ICON(it.icon, 'sm'), '', false, it.fill)}${esc(s.name)}</button>`; };
  return `<div class="scenerow"><div class="h3">Scenes<a class="link" data-act="nav" data-view="scenes" href="#scenes" style="float:right;font-size:12px;line-height:16px;font-weight:500">See all</a></div><div class="chips scroll">${sc.map(chip).join('')}<button class="chip new" data-act="scene-new">${ICON('plus', 'sm')}New scene</button></div></div>`;
}
function domainIcon(dm) { return { light: 'bulb', switch: 'plug', fan: 'fan', cover: 'shade' }[dm] || 'bulb'; }
// Lights in a room: a starred light first, then by name.
function roomOrder(ds) { const f = S.config.favorites; return ds.slice().sort((a, b) => (f.includes('d:' + b.device_id) ? 1 : 0) - (f.includes('d:' + a.device_id) ? 1 : 0)); }
function roomCard(a) {
  const ds = roomOrder(controllable().filter(d => (d.area || 'none') === a.id));
  const open = S.openRooms.has(a.id);
  const t = `a:${a.id}`;
  const hasToggle = ds.some(d => d.domain !== 'cover');
  const on = targetOn(t);
  const more = roomDimmers(a.id).length ? `<button class="room-more" data-act="room-more" data-area="${a.id}">${ICON('dots', 'sm')}More<span class="d" style="font-weight:400">· moods, what each light is for, kinds</span><span class="chev">${ICON('chev', 'sm')}</span></button>` : '';
  return `<div class="room ${open ? 'open' : ''} ${on ? 'on' : ''}" data-tgt="${t}" data-room="${a.id}">
    <div class="head"><button class="info" data-act="room-open" data-id="${a.id}"><span class="slot"><span class="lamp onchip ${on ? '' : 'off'}" data-onchip="${t}" style="width:32px;height:32px;background:${lampColor(on ? roomMean(a.id) : 0)}">${ICON(roomIcon(a.name), 'sm')}</span></span><div><div class="n">${esc(a.name)}</div><div class="s">${esc(roomSummary(a.id))}</div></div></button>
      <div class="side"><button class="chev" data-act="room-open" data-id="${a.id}" aria-label="${open ? 'Close' : 'Open'} ${esc(a.name)}">${ICON('chev', 'sm')}</button>${hasToggle ? `<button class="sw" data-tgt="${t}" data-act="toggle" data-t="${t}" aria-label="${esc(a.name)} on or off"></button>` : ''}</div></div>
    <div class="body"><div><div class="lights">${moodRowHTML(a.id)}${ds.map(lightRow).join('')}${more}</div></div></div></div>`;
}
// The disc for a light, in the ring that says what it can do: the rainbow for colour, warm-to-cool for white temperature.
function ringClass(d) { return d.color ? 'color' : d.ct ? 'ct' : ''; }
function lightRow(d) {
  const id = d.device_id; const t = `d:${id}`;
  const fav = `<button class="iconbtn plain fav ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="fav" data-t="${t}" title="Favourite" aria-label="Favourite">${ICON('star', 'sm')}</button>`;
  const opens = d.domain === 'light' || d.domain === 'switch';
  const lv = opens ? (level(id) || 0) : (isOn(id) ? 100 : 0);
  const ring = ringClass(d);
  const discInner = `<span class="lkind lamp ${lv > 0 ? '' : 'off'}" data-ldisc="${id}" style="background:${lightFill(id, lv)}">${ICON(opens ? lightIcon(d) : domainIcon(d.domain))}</span>`;
  const disc = ring ? `<span class="lring ${ring}">${discInner}</span>` : discInner;
  const act = `<button class="act ${isOn(id) ? 'on' : ''}" data-act-lvl="${id}" data-act="toggle" data-t="${t}" aria-label="${esc(d.name)} on or off">${ICON(d.domain === 'fan' ? 'fan' : 'sun', 'sm')}</button>`;
  const rainbow = ring ? `<button class="iconbtn sm rainbow ${ring}" data-act="light-colour" data-id="${id}" title="${d.color ? 'Colour' : 'Warmth'}" aria-label="${d.color ? 'Colour' : 'Warmth'}">${ICON('sun', 'sm')}</button>` : '';
  const head = (withAct) => opens
    ? `<div class="row lrow" role="button" tabindex="0" data-act="light-open" data-id="${id}">${disc}<div class="grow"><div class="n">${esc(d.name)}</div><div class="lv" data-lvl="${id}"></div></div>${rainbow}${withAct ? act : ''}${fav}<span class="chev">${ICON('chev', 'sm')}</span></div>`
    : `<div class="row">${disc}<div class="grow"><div class="n">${esc(d.name)}</div><div class="lv" data-lvl="${id}"></div></div>${withAct ? act : ''}${fav}</div>`;
  const slider = `<div class="sliderwrap"><input class="slider" type="range" min="0" max="100" data-lvl="${id}" data-slide="${t}" aria-label="${esc(d.name)} brightness"></div>`;
  if (d.domain === 'fan') return `<div class="light">${head(true)}<div class="fan">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<button class="chip" data-lvl="${id}" data-speed="${s}" data-act="fan" data-id="${id}" data-s="${s}">${s === 'MediumHigh' ? 'Med-hi' : s}</button>`).join('')}</div></div>`;
  if (d.domain === 'cover') return `<div class="light">${head(false)}<div class="shade"><button class="btn sm" data-act="cmd" data-cmd='{"type":"raise","target":"${t}"}'>Open</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"stop","target":"${t}"}'>Stop</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"lower","target":"${t}"}'>Close</button></div>${slider}</div>`;
  if (d.domain === 'switch') return `<div class="light">${head(true)}</div>`;
  return `<div class="light">${head(true)}${slider}</div>`;
}
// The room's More sheet: its moods, what each light is for, and the kind of each light.
function roomMoreSheet(aid) {
  const ps = typeof roomMoodPresets === 'function' ? roomMoodPresets(aid) : [];
  const ds = roomLights(aid);
  const kinds = ds.map(d => { const k = lightKind(d.device_id); return `<button class="item" data-act="room-kind" data-id="${d.device_id}" data-area="${aid}">${lampHTML(level(d.device_id) || 0, 28, ICON(lightIcon(d), 'sm'))}<div class="grow"><div class="t">${esc(d.name)}</div></div><span class="val">${k ? esc(kindLabel(k)) : 'Not set'}</span><span class="chev">${ICON('chev', 'sm')}</span></button>`; }).join('');
  const body = `<div class="card pad0 list">
    ${ps.length ? valueRow('Moods', `${ps.length} moods`, 'rm-open', `data-area="${aid}"`, { sub: 'Bright, Relax, Dinner, Movie and Night' }) : `<button class="item" data-act="roles-open" data-area="${aid}"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Make moods</div><div class="d">Bright, Relax, Dinner, Movie and Night, from what each light is for</div></div></button>`}
    <button class="item" data-act="roles-open" data-area="${aid}"><div class="grow"><div class="t">What each light is for</div><div class="d">Main, task, lamps or decor: the moods use it</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
  </div>
  <div class="h3" style="margin-top:24px">Kind of light</div><div class="card pad0 list">${kinds}</div>`;
  showSheet('room-more', esc(areaName(aid)), body, { sub: `${plural(ds.length, 'light')}` });
}
function tickCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const left = Math.max(0, Math.round((Number(el.dataset.countdown) * 1000 - Date.now()) / 60000));
    el.textContent = left <= 0 ? 'any moment' : `in ${left} min`;
  });
  if (document.querySelector('[data-countdown]')) setTimeout(tickCountdowns, 15000);
}
function toggleRoom(id) {
  const opening = !S.openRooms.has(id);
  if (opening) S.openRooms.add(id); else S.openRooms.delete(id);
  localStorage.setItem('openRooms', JSON.stringify([...S.openRooms]));
  const el = document.querySelector(`.room[data-room="${id}"]`); if (!el) return;
  // closing a card near the end of the page: ease the scroll along with the collapse, so the page never yanks under the finger
  if (!opening) {
    const body = el.querySelector('.body > div'); const shrink = body ? body.offsetHeight : 0;
    const maxAfter = document.documentElement.scrollHeight - shrink - window.innerHeight;
    if (shrink && window.scrollY > maxAfter) easeScrollTo(Math.max(0, maxAfter), 255);
  }
  el.classList.toggle('open', opening); if (window.Motion) Motion.expand(el, opening);
}
function easeScrollTo(y, ms) {
  const y0 = window.scrollY; const t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => { const f = Math.min(1, (now - t0) / ms); window.scrollTo(0, Math.round(y0 + (y - y0) * ease(f))); if (f < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
// A star pins a light to the front of the lamp row and the top of its room.
function toggleFav(t) {
  const f = S.config.favorites;
  const i = f.indexOf(t);
  if (i >= 0) f.splice(i, 1); else f.push(t);
  document.querySelectorAll(`[data-act="fav"][data-t="${t}"]`).forEach(b => b.classList.toggle('on', i < 0));
  save({ quiet: true, render: S.view === 'home' });
}
// Optimistic toggle: flip immediately, revert if the command fails.
async function toggleTarget(t) {
  const on = targetOn(t);
  const ids = targetDevices(t);
  for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level: on ? 0 : (dev(id).domain === 'switch' ? 100 : S.config.settings.group_on_level), fan_speed: on ? 'Off' : 'High' };
  paintState();
  const ok = await command({ type: 'level', target: t, level: 'toggle' });
  if (!ok) { for (const id of ids) delete S.states[id]; paintState(); }
}
// A fan speed: painted at once, put back if the bridge says no.
async function setFan(id, speed) {
  const prev = S.states[id];
  S.states[id] = { ...(S.states[id] || {}), fan_speed: speed, level: speed === 'Off' ? 0 : 100 }; paintState();
  const ok = await command({ type: 'fan', target: `d:${id}`, speed });
  if (!ok) { if (prev) S.states[id] = prev; else delete S.states[id]; paintState(); }
}
function sleepTimerSheet(t, opts) { sleepDialSheet(t, opts); } // the dial and chips live in light.js
