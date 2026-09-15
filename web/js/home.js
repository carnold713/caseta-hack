/* Home: control the house right now. */
'use strict';

VIEWS.home = {
  top() {
    const name = (S.config.settings.home_name || 'Home');
    return `<div class="t1">${esc(name)}</div>${statusCircle()}`;
  },
  body() {
    const hasDevices = controllable().length > 0;
    if (!hasDevices && !S.agent.online) return setupEmpty();
    const sc = [...presets().filter(p => !(p.mood && p.area)).map(p => ({ id: 'p:' + p.id, name: p.name, sub: `${Object.keys(p.levels).length} lights` })), ...lutronScenes().map(s => ({ id: 's:' + s.scene_id, name: s.name, sub: 'From the Lutron app' }))];
    const favs = S.config.favorites.filter(targetExists).filter(t => !/^[ps]:/.test(t));
    let h = `<div class="m-hero"><div class="m-lightfield" id="lightfield"></div>` + lightNowHTML() + `<div id="wd-home">${typeof windDownCaptionHTML === 'function' ? windDownCaptionHTML() : ''}</div>`;
    h += `<div class="h2">Scenes<a class="link" data-act="nav" data-view="scenes" href="#scenes">See all</a></div>`;
    h += `<div class="tiles"><button class="tile new" data-act="scene-new"><div class="face">${ICON('plus')}</div><div class="label"><div class="n">New scene</div></div></button>${sc.map(s => `<button class="tile" data-act="run-scene" data-t="${s.id}"><div class="face">${tileFaceHTML(tileItems(s.id))}</div><div class="label"><div class="n">${esc(s.name)}</div><div class="s">${esc(s.sub)}</div></div></button>`).join('')}${favs.map(favTile).join('')}</div></div>`;
    const timers = Object.entries(S.timers || {});
    if (timers.length) h += '<div class="spacer"></div>' + timers.map(([t, v]) => timerBlockHTML(t, v)).join('');
    h += `<div id="comingup">${typeof comingUpHTML === 'function' ? comingUpHTML() : ''}</div>`;
    if (!S.agent.online) h += `<div class="spacer"></div><button class="tip" data-act="nav" data-view="settings"><div class="grow"><span class="cap">Not connected</span><div class="t">Not connected to your home</div><div class="d">Showing the last known state. Your remotes keep working from their saved settings.</div></div><span class="go">${ICON('chev')}</span></button>`;
    h += sortBlockHTML();
    h += typeof moodsTipHTML === 'function' ? moodsTipHTML() : '';
    h += '<div class="h2">Rooms</div>';
    h += areas().map(roomCard).join('');
    return h;
  },
  after() {
    tickCountdowns();
    if (!controllable().length && !S.agent.online && !S._setupShown) { S._setupShown = true; setTimeout(openSetupSheet, 350); }
  },
};

// Nothing connected yet: the page carries a tip, and on Home a sheet slides over it once.
function setupEmpty() {
  return `<button class="tip" data-act="setup-open" style="margin-top:8px"><div class="grow"><span class="cap">Get started</span><div class="t">Let's connect your home</div><div class="d">A small helper program links this app to your Lutron bridge. About ten minutes, once.</div></div><span class="go">${ICON('chev')}</span></button>`;
}
function openSetupSheet() {
  const demo = { device_id: '', name: 'Pico', type: 'Pico3ButtonRaiseLower', area: null };
  sheet.open("Let's connect your home", `<p class="body">A small helper program on a computer or Raspberry Pi in your house links this app to your Lutron bridge. About ten minutes, once.</p>
    <div class="stage sm">${picoSVG(demo, { width: 84, model: 'PJ2-3BRL' })}</div>
    <button class="btn primary lg block" data-act="nav" data-view="settings">Show me how</button><button class="btn ghost block" data-act="sheet-close">Later</button>`);
}
function favTile(t) {
  const d = t.startsWith('d:') ? dev(t.slice(2)) : null;
  const opens = d && (d.domain === 'light' || d.domain === 'switch');
  return `<button class="tile ${targetOn(t) ? 'on' : ''}" data-tgt="${t}" data-act="toggle" data-t="${t}" data-long="open-light"><div class="face">${tileFaceHTML(tileItems(t))}</div><div class="label" ${opens ? `data-act="light-open" data-id="${d.device_id}"` : ''}><div class="n">${esc(cap(targetName(t)))}</div><div class="s">${esc(tileSub(t))}</div></div></button>`;
}
function domainIcon(dm) { return { light: 'bulb', switch: 'plug', fan: 'fan', cover: 'shade' }[dm] || 'bulb'; }
function roomCard(a) {
  const ds = controllable().filter(d => (d.area || 'none') === a.id);
  const open = S.openRooms.has(a.id);
  const t = `a:${a.id}`;
  const hasToggle = ds.some(d => d.domain !== 'cover');
  const on = targetOn(t);
  return `<div class="room ${open ? 'open' : ''} ${on ? 'on' : ''}" data-tgt="${t}" data-room="${a.id}">
    <div class="head"><button class="info" data-act="room-open" data-id="${a.id}"><span class="lamp onchip ${on ? '' : 'off'}" data-onchip="${t}" style="width:44px;height:44px;background:${lampColor(on ? roomMean(a.id) : 0)}">${ICON(roomIcon(a.name))}</span><div><div class="n">${esc(a.name)}</div><div class="s">${esc(roomSummary(a.id))}</div></div></button>
      <div class="side"><button class="chev" data-act="room-open" data-id="${a.id}">${ICON('chev', 'sm')}</button>${hasToggle ? `<button class="sw" data-tgt="${t}" data-act="toggle" data-t="${t}"></button>` : ''}</div></div>
    <div class="body"><div><div class="lights">${moodRowHTML(a.id)}${ds.map(lightRow).join('')}</div></div></div></div>`;
}
function lightRow(d) {
  const id = d.device_id; const t = `d:${id}`;
  const fav = `<button class="iconbtn plain fav ${S.config.favorites.includes(t) ? 'on' : ''}" data-act="fav" data-t="${t}" title="Favourite">${ICON('star', 'sm')}</button>`;
  const opens = d.domain === 'light' || d.domain === 'switch';
  const lv = opens ? (level(id) || 0) : (isOn(id) ? 100 : 0);
  const disc = opens
    ? `<button class="lkind lamp ${lv > 0 ? '' : 'off'}" data-act="kind-open" data-id="${id}" data-ldisc="${id}" title="What kind of light is this?" style="background:${lampColor(lv)}">${ICON(lightIcon(d))}</button>`
    : `<span class="lkind lamp ${lv > 0 ? '' : 'off'}" data-ldisc="${id}" style="background:${lampColor(lv)}">${ICON(domainIcon(d.domain))}</span>`;
  const act = `<button class="act ${isOn(id) ? 'on' : ''}" data-act-lvl="${id}" data-act="toggle" data-t="${t}">${ICON(d.domain === 'fan' ? 'fan' : 'sun', 'sm')}</button>`;
  const head = (withAct) => `<div class="row">${disc}<${opens ? `button class="grow lopen" data-act="light-open" data-id="${id}"` : 'div class="grow"'}><div class="n">${esc(d.name)}</div><div class="lv" data-lvl="${id}"></div></${opens ? 'button' : 'div'}>${withAct ? act : ''}${fav}</div>`;
  const slider = `<div class="sliderwrap"><input class="slider" type="range" min="0" max="100" data-lvl="${id}" data-slide="${t}"><div class="stip"></div></div>`;
  if (d.domain === 'fan') return `<div class="light">${head(true)}<div class="fan">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<button class="chip" data-lvl="${id}" data-speed="${s}" data-act="fan" data-id="${id}" data-s="${s}">${s === 'MediumHigh' ? 'Med-hi' : s}</button>`).join('')}</div></div>`;
  if (d.domain === 'cover') return `<div class="light">${head(false)}<div class="shade"><button class="btn sm" data-act="cmd" data-cmd='{"type":"raise","target":"${t}"}'>Open</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"stop","target":"${t}"}'>Stop</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"lower","target":"${t}"}'>Close</button></div>${slider}</div>`;
  if (d.domain === 'switch') return `<div class="light">${head(true)}</div>`;
  return `<div class="light">${head(true)}${slider}</div>`;
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
  const el = document.querySelector(`.room[data-room="${id}"]`); if (el) { el.classList.toggle('open', S.openRooms.has(id)); if (window.Motion) Motion.expand(el, S.openRooms.has(id)); }
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
function sleepTimerSheet(t, opts) { sleepDialSheet(t, opts); } // the dial and chips live in light.js
