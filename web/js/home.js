/* Home: control the house right now. */
'use strict';

VIEWS.home = {
  top() {
    const name = (S.config.settings.home_name || 'Home');
    return `<div><h1>${esc(name)}</h1><div class="sub" id="statusline">${statusLine()}</div></div>${connPill()}`;
  },
  body() {
    const hasDevices = controllable().length > 0;
    if (!hasDevices && !S.agent.online) return setupEmpty();
    let h = '';
    if (!S.agent.online) h += `<div class="banner err">${ICON('link')}<div><b>Not connected to your home.</b> Showing the last known state. Your remotes keep working from their saved settings.<br><a href="#settings" data-act="nav" data-view="settings">What to check</a></div></div>`;
    h += `<button class="alloff enter" data-act="alloff"><div class="ic amber round">${ICON('power')}</div><div class="grow"><div class="t">All off</div><div class="d">Every light in the house. Hold to also close shades and stop fans.</div></div><div class="hold"></div></button>`;
    const timers = Object.entries(S.timers || {});
    if (timers.length) h += '<div class="spacer"></div>' + timers.map(([t, v]) => `<div class="timerbar enter">${ICON('clock')}<div class="grow"><div class="t">${esc(targetName(t))} ${v.level ? 'to ' + v.level + '%' : 'off'} <span data-countdown="${v.ends_at}"></span></div><div class="d">Sleep timer</div></div><button class="btn sm" data-act="cancel-timer" data-t="${esc(t)}">Cancel</button></div>`).join('');
    const favs = S.config.favorites.filter(targetExists);
    h += `<div class="h2">Favorites ${favs.length ? '' : '<span class="link" style="color:var(--text-3);font-weight:500">tap ☆ to add</span>'}</div>`;
    if (favs.length) h += `<div class="tiles">${favs.map(favTile).join('')}</div>`;
    else h += `<div class="banner">${ICON('star')}<div>Star a light, room or scene and it shows up here for one-tap control.</div></div>`;
    const sc = [...presets().map(p => ({ id: 'p:' + p.id, name: p.name })), ...lutronScenes().map(s => ({ id: 's:' + s.scene_id, name: s.name }))];
    if (sc.length) h += `<div class="h2">Scenes <button class="link" data-act="nav" data-view="scenes">Edit</button></div><div class="chips scroll">${sc.map(s => `<button class="chip" data-act="run-scene" data-t="${s.id}">${ICON('scene', 'sm')}${esc(s.name)}</button>`).join('')}</div>`;
    h += '<div class="h2">Rooms</div>';
    h += areas().map(roomCard).join('');
    return h;
  },
  after() { tickCountdowns(); },
};

function setupEmpty() {
  return `<div class="empty enter"><div class="ill">${ICON('house', 'lg')}</div><h3>Let's connect your home</h3><p>A small helper program on a computer in your house links this app to your Lutron bridge. It takes about ten minutes, once.</p><button class="btn primary lg" data-act="nav" data-view="settings">Set up my home</button></div>`;
}
function favTile(t) {
  const k = t.slice(0, 1);
  if (k === 'p' || k === 's') return `<button class="tile scene enter" data-act="run-scene" data-t="${t}"><div class="ic teal round">${ICON('scene')}</div><div><div class="n">${esc(cap(targetName(t)))}</div><div class="s">Scene</div></div></button>`;
  const d = k === 'd' ? dev(t.slice(2)) : null;
  const icon = d ? domainIcon(d.domain) : 'house';
  return `<button class="tile enter" data-tgt="${t}" data-act="toggle" data-t="${t}" data-long="open-light"><div class="fill"></div><div class="ic round">${ICON(icon)}</div><div><div class="n">${esc(cap(targetName(t)))}</div><div class="s">${esc(tileSub(t))}</div></div></button>`;
}
function domainIcon(dm) { return { light: 'bulb', switch: 'plug', fan: 'fan', cover: 'shade' }[dm] || 'bulb'; }
function roomCard(a) {
  const ds = controllable().filter(d => (d.area || 'none') === a.id);
  const open = S.openRooms.has(a.id);
  const t = `a:${a.id}`;
  const hasToggle = ds.some(d => d.domain !== 'cover');
  return `<div class="room enter ${open ? 'open' : ''}" data-tgt="${t}" data-room="${a.id}">
    <div class="head"><button class="grow row" data-act="room-open" data-id="${a.id}" style="text-align:left;color:inherit"><span class="chev faint">${ICON('chev')}</span><div class="grow"><div class="n">${esc(a.name)}</div><div class="s">${esc(roomSummary(a.id))}</div></div></button>
      <button class="iconbtn ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="fav" data-t="${t}" title="Favorite">${ICON('star', 'sm')}</button>
      ${hasToggle ? `<button class="sw" data-tgt="${t}" data-act="toggle" data-t="${t}"></button>` : ''}</div>
    <div class="body"><div><div class="lights">${ds.map(lightRow).join('')}</div></div></div></div>`;
}
function lightRow(d) {
  const id = d.device_id; const t = `d:${id}`;
  const fav = `<button class="iconbtn ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="fav" data-t="${t}" style="width:34px;height:34px">${ICON('star', 'sm')}</button>`;
  if (d.domain === 'fan') return `<div class="light"><div class="row"><div class="n grow">${esc(d.name)}</div>${fav}</div><div class="fan">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<button class="chip" data-lvl="${id}" data-speed="${s}" data-act="fan" data-id="${id}" data-s="${s}">${s === 'MediumHigh' ? 'Med-hi' : s}</button>`).join('')}</div></div>`;
  if (d.domain === 'cover') return `<div class="light"><div class="row"><div class="n grow">${esc(d.name)}</div><span class="lv" data-lvl="${id}"></span>${fav}</div><div class="shade"><button class="btn sm" data-act="cmd" data-cmd='{"type":"raise","target":"${t}"}'>Open</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"stop","target":"${t}"}'>Stop</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"lower","target":"${t}"}'>Close</button></div></div>`;
  if (d.domain === 'switch') return `<div class="light"><div class="row"><div class="n grow">${esc(d.name)}</div>${fav}<button class="sw" data-lvl="${id}" data-act="toggle" data-t="${t}"></button></div></div>`;
  return `<div class="light"><div class="row"><div class="n grow">${esc(d.name)}</div><span class="lv" data-lvl="${id}"></span>${fav}<button class="sw" data-lvl="${id}" data-act="toggle" data-t="${t}"></button></div><input class="slider thin" type="range" min="0" max="100" data-lvl="${id}" data-slide="${t}"></div>`;
}
function tickCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const left = Math.max(0, Math.round((Number(el.dataset.countdown) * 1000 - Date.now()) / 60000));
    el.textContent = left <= 0 ? 'any moment' : `in ${left} min`;
  });
  if (document.querySelector('[data-countdown]')) setTimeout(tickCountdowns, 15000);
}
function toggleRoom(id) {
  if (S.openRooms.has(id)) S.openRooms.delete(id); else S.openRooms.add(id);
  localStorage.setItem('openRooms', JSON.stringify([...S.openRooms]));
  const el = document.querySelector(`.room[data-room="${id}"]`); if (el) el.classList.toggle('open', S.openRooms.has(id));
}
function toggleFav(t) {
  const f = S.config.favorites;
  const i = f.indexOf(t);
  if (i >= 0) f.splice(i, 1); else f.push(t);
  document.querySelectorAll(`[data-act="fav"][data-t="${t}"]`).forEach(b => b.classList.toggle('on', i < 0));
  save({ quiet: true, render: S.view === 'home' });
}
// Optimistic toggle: flip immediately, revert if no state arrives.
async function toggleTarget(t) {
  const on = targetOn(t);
  const ids = targetDevices(t);
  for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level: on ? 0 : (dev(id).domain === 'switch' ? 100 : S.config.settings.group_on_level), fan_speed: on ? 'Off' : 'High' };
  paintState();
  const ok = await command({ type: 'level', target: t, level: 'toggle' });
  if (!ok) { document.querySelectorAll(`[data-tgt="${t}"]`).forEach(el => { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); }); }
}
function sleepTimerSheet(t) {
  const name = targetName(t);
  sheet.open(`Sleep timer`, `<p class="muted" style="margin:0 0 14px">${esc(name)} will fade off after…</p><div class="chips" style="justify-content:center">${[5, 10, 15, 20, 30, 45, 60, 90].map(m => `<button class="chip" data-act="timer" data-t="${esc(t)}" data-m="${m}">${m} min</button>`).join('')}</div>`);
}
