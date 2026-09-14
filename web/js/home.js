/* Home: control the house right now. */
'use strict';

VIEWS.home = {
  top() {
    const name = (S.config.settings.home_name || 'Home');
    return `<h1>${esc(name)}</h1>${connPill()}`;
  },
  body() {
    const hasDevices = controllable().length > 0;
    if (!hasDevices && !S.agent.online) return setupEmpty();
    let h = `<p class="statusline" id="statusline">${statusLine()}</p>`;
    if (!S.agent.online) h += `<button class="infoblock lemon" data-act="nav" data-view="settings" style="margin-bottom:16px"><div class="grow"><div class="t">Not connected to your home</div><div class="d">Showing the last known state. Your remotes keep working from their saved settings.</div></div><span class="go">${ICON('chev', 'sm')}</span></button>`;
    const sc = [...presets().map(p => ({ id: 'p:' + p.id, name: p.name, sub: `${Object.keys(p.levels).length} lights` })), ...lutronScenes().map(s => ({ id: 's:' + s.scene_id, name: s.name, sub: 'From the Lutron app' }))];
    const favs = S.config.favorites.filter(targetExists).filter(t => !/^[ps]:/.test(t));
    h += `<div class="tiles"><button class="tile new" data-act="scene-new"><div class="ic white">${ICON('plus', 'sm')}</div><div class="n">New scene</div></button>${sc.map(s => `<button class="tile" data-act="run-scene" data-t="${s.id}"><div class="ic">${ICON('scene', 'sm')}</div><div><div class="n">${esc(s.name)}</div><div class="s">${esc(s.sub)}</div></div></button>`).join('')}${favs.map(favTile).join('')}</div>`;
    h += `<div class="spacer"></div><button class="alloff" data-act="alloff">${ICON('power', 'sm')}<span>All off</span><span class="d">Hold for shades and fans</span><div class="hold"></div></button>`;
    const timers = Object.entries(S.timers || {});
    if (timers.length) h += '<div class="spacer"></div>' + timers.map(([t, v]) => `<div class="timerbar">${ICON('clock')}<div class="grow"><div class="t">${esc(cap(targetName(t.includes('|') ? t.split('|') : t)))} ${v.level ? 'to ' + v.level + '%' : 'off'} <span data-countdown="${v.ends_at}"></span></div><div class="d">Sleep timer</div></div><button class="btn sm" data-act="cancel-timer" data-t="${esc(t)}">Cancel</button></div>`).join('');
    h += '<div class="h2">Rooms</div>';
    h += areas().map(roomCard).join('');
    return h;
  },
  after() { tickCountdowns(); },
};

function setupEmpty() {
  return `<button class="infoblock blush" data-act="nav" data-view="settings" style="margin-top:8px"><div class="grow"><div class="t">Let's connect your home</div><div class="d">A small helper program on a computer in your house links this app to your Lutron bridge. About ten minutes, once.</div></div><span class="go">${ICON('chev', 'sm')}</span></button>`;
}
function favTile(t) {
  const d = t.startsWith('d:') ? dev(t.slice(2)) : null;
  const icon = d ? domainIcon(d.domain) : 'house';
  return `<button class="tile" data-tgt="${t}" data-act="toggle" data-t="${t}" data-long="open-light"><div class="ic">${ICON(icon, 'sm')}</div><div><div class="n">${esc(cap(targetName(t)))}</div><div class="s">${esc(tileSub(t))}</div></div></button>`;
}
function domainIcon(dm) { return { light: 'bulb', switch: 'plug', fan: 'fan', cover: 'shade' }[dm] || 'bulb'; }
function roomCard(a) {
  const ds = controllable().filter(d => (d.area || 'none') === a.id);
  const open = S.openRooms.has(a.id);
  const t = `a:${a.id}`;
  const c = roomColor(a.id);
  const hasToggle = ds.some(d => d.domain !== 'cover');
  return `<div class="room ${open ? 'open' : ''}" data-tgt="${t}" data-room="${a.id}" style="--room:${c.bg};--room-soft:${c.soft}">
    <div class="head"><button class="info" data-act="room-open" data-id="${a.id}">${ICON(roomIcon(a.name))}<div class="n">${esc(a.name)}</div><div class="s">${esc(roomSummary(a.id))}</div><div class="onchip ${targetOn(t) ? '' : 'hidden'}" data-onchip="${t}">${ICON('bulb', 'sm')}</div></button>
      <div class="side"><button class="chev" data-act="room-open" data-id="${a.id}">${ICON('chev', 'sm')}</button>${hasToggle ? `<button class="sw" data-tgt="${t}" data-act="toggle" data-t="${t}"></button>` : ''}</div></div>
    <div class="body"><div><div class="lights">${ds.map(lightRow).join('')}</div></div></div></div>`;
}
function lightRow(d) {
  const id = d.device_id; const t = `d:${id}`;
  const fav = `<button class="iconbtn plain ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="fav" data-t="${t}" style="width:36px;height:36px" title="Favorite">${ICON('star', 'sm')}</button>`;
  const head = (sub) => `<div class="row">${ICON(domainIcon(d.domain))}<div class="grow"><div class="n">${esc(d.name)}</div><div class="lv" data-lvl="${id}">${sub}</div></div>${fav}`;
  if (d.domain === 'fan') return `<div class="light">${head('')}<button class="act ${isOn(id) ? 'on' : ''}" data-act-lvl="${id}" data-act="toggle" data-t="${t}">${ICON('fan', 'sm')}</button></div><div class="fan">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<button class="chip" data-lvl="${id}" data-speed="${s}" data-act="fan" data-id="${id}" data-s="${s}">${s === 'MediumHigh' ? 'Med-hi' : s}</button>`).join('')}</div></div>`;
  if (d.domain === 'cover') return `<div class="light">${head('')}</div><div class="shade"><button class="btn sm" data-act="cmd" data-cmd='{"type":"raise","target":"${t}"}'>Open</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"stop","target":"${t}"}'>Stop</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"lower","target":"${t}"}'>Close</button></div><div class="sliderwrap"><input class="slider" type="range" min="0" max="100" data-lvl="${id}" data-slide="${t}"><div class="tip"></div></div></div>`;
  if (d.domain === 'switch') return `<div class="light">${head('')}<button class="act ${isOn(id) ? 'on' : ''}" data-act-lvl="${id}" data-act="toggle" data-t="${t}">${ICON('sun', 'sm')}</button></div></div>`;
  return `<div class="light">${head('')}<button class="act ${isOn(id) ? 'on' : ''}" data-act-lvl="${id}" data-act="toggle" data-t="${t}">${ICON('sun', 'sm')}</button></div><div class="sliderwrap"><input class="slider" type="range" min="0" max="100" data-lvl="${id}" data-slide="${t}"><div class="tip"></div></div></div>`;
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
// Optimistic toggle: flip immediately, revert if the command fails.
async function toggleTarget(t) {
  const on = targetOn(t);
  const ids = targetDevices(t);
  for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level: on ? 0 : (dev(id).domain === 'switch' ? 100 : S.config.settings.group_on_level), fan_speed: on ? 'Off' : 'High' };
  paintState();
  const ok = await command({ type: 'level', target: t, level: 'toggle' });
  if (!ok) { for (const id of ids) delete S.states[id]; paintState(); }
}
function sleepTimerSheet(t) {
  const name = targetName(t);
  sheet.open('Sleep timer', `<p class="muted" style="margin:0 0 16px">${esc(cap(name))} will fade off after…</p><div class="chips">${[5, 10, 15, 20, 30, 45, 60, 90].map(m => `<button class="chip" data-act="timer" data-t="${esc(t)}" data-m="${m}">${m} min</button>`).join('')}</div>`, { question: true, sub: '' });
}
