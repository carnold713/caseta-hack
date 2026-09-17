/* Home: control the house right now (docs/ia-v5.md 3). Top to bottom: the house card, the starred lights as one lamp
   row when there are any, the scenes as one chip row, the rooms as one grouped inset list, and one row of advice last.
   A room is a page of its own now (js/room.js); nothing on Home expands. */
'use strict';

VIEWS.home = {
  top() {
    const name = (S.config.settings.home_name || 'Home');
    return `<div class="t1">${esc(name)}</div>${statusCircle()}`;
  },
  body() {
    const hasDevices = controllable().length > 0;
    if (!hasDevices && connLost()) return setupEmpty();
    let h = `<div class="m-hero"><div class="m-lightfield" id="lightfield"></div>` + houseCardHTML() + lightNowHTML() + `</div>`;
    h += sceneRowHTML();
    h += `<div class="gh">Rooms</div><div class="card pad0 list rooms">${areas().map(roomRow).join('')}</div>`;
    const timers = Object.entries(S.timers || {});
    if (timers.length) h += `<div class="gh">Sleep timers</div>` + timers.map(([t, v]) => timerBlockHTML(t, v)).join('');
    // one row of advice at most (docs/ux-progressive.md 2.1a): not connected beats everything, then the Next row, then nothing
    // a drop is quiet for its first ten seconds: nothing is said until it has really failed (connState in core.js)
    if (connLost()) h += `<div class="card pad0 list nextrow"><button class="item" data-act="nav" data-view="settings"><div class="grow"><span class="cap">Not connected</span><div class="t">Not connected to your home</div><div class="d">Showing the last known state. Your remotes keep working.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
    else if (typeof nextCardHTML === 'function') h += nextCardHTML();
    return h;
  },
  after() {
    tickCountdowns();
    if (!controllable().length && connLost() && !S._setupShown) { S._setupShown = true; setTimeout(openSetupSheet, 350); }
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
// Running a scene is one tap, here. Making one is two taps deeper, behind the "+" on the Scenes page.
function sceneRowHTML() {
  const sc = homeScenes();
  const chip = s => { const items = tileItems(s.id); const it = items[0] || { lv: 0, icon: 'scene' }; return `<button class="chip" data-act="run-scene" data-t="${s.id}">${lampHTML(it.lv, 24, ICON(it.icon, 'sm'), '', false, it.fill)}${esc(s.name)}</button>`; };
  const seeAll = `<a class="link" data-act="scenes-open" href="#scenes">See all</a>`;
  // no scenes yet: the row says so and opens the Scenes page, where the one way to make one lives
  if (!sc.length) return `<div class="scenerow"><div class="gh">Scenes${seeAll}</div><div class="card pad0 list"><button class="item" data-act="scenes-open"><div class="grow"><div class="t">No scenes yet</div><div class="d">Set the lights the way you like them, then save that look</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div></div>`;
  return `<div class="scenerow"><div class="gh">Scenes${seeAll}</div><div class="chips scroll">${sc.map(chip).join('')}</div></div>`;
}
function domainIcon(dm) { return { light: 'bulb', switch: 'plug', fan: 'fan', cover: 'shade' }[dm] || 'bulb'; }
// Lights in a room: a starred light first, then by name.
function roomOrder(ds) { const f = S.config.favorites; return ds.slice().sort((a, b) => (f.includes('d:' + b.device_id) ? 1 : 0) - (f.includes('d:' + a.device_id) ? 1 : 0)); }
// One room, one row: its disc, its name, what it is doing, a chevron into the room's page and a switch.
// Nothing expands any more, so Home holds five rows where it used to hold five open cards.
function roomRow(a) {
  const t = `a:${a.id}`;
  const ds = controllable().filter(d => devArea(d) === a.id);
  const hasToggle = ds.some(d => d.domain !== 'cover');
  const on = targetOn(t);
  return `<div class="item room ${on ? 'on' : ''}" data-tgt="${t}" data-room="${a.id}">
    <button class="head" data-act="room-open" data-id="${a.id}" aria-label="${esc(a.name)}"><span class="slot"><span class="lamp onchip ${on ? '' : 'off'}" data-onchip="${t}" style="width:32px;height:32px;background:${lampColor(on ? roomMean(a.id) : 0)}">${ICON(roomIcon(a.name), 'sm')}</span></span><span class="grow"><span class="n">${esc(a.name)}</span><span class="s">${esc(roomSummary(a.id))}</span></span><span class="chev">${ICON('chev', 'sm')}</span></button>
    ${hasToggle ? `<button class="sw" data-tgt="${t}" data-act="toggle" data-t="${t}" aria-label="${esc(a.name)} on or off"></button>` : ''}</div>`;
}
// The disc for a light, in the ring that says what it can do: the rainbow for colour, warm-to-cool for white temperature.
function ringClass(d) { return d.color ? 'color' : d.ct ? 'ct' : ''; }
// One light, one row on its room's page: the disc as a picture, the name, what it is doing, a chevron into the
// light's page and a switch. The sun button, the star, the rainbow button and the inline slider are gone: the light's
// own page is a better dimmer than a 40px well in a list, and it is one tap away (docs/ia-v5.md 2).
function lightRowValue(d) {
  const id = d.device_id;
  if (d.domain === 'fan') return esc(cap(fanName((S.states[id] || {}).fan_speed || 'Off')));
  if (d.domain === 'switch') return isOn(id) ? 'On' : 'Off';
  if (d.domain === 'cover') return isOn(id) ? 'Open' : 'Closed';
  const lv = level(id) || 0;
  // a lamp that can show colour says which colour it is showing: that is both the sign and the way in
  // the colour's name only: the kelvin behind it belongs on the light's page, not on a row
  if ((d.color || d.ct) && lv > 0 && typeof colourLabel === 'function') { const c = colorState(id); if (c && c.mode) return `${colourDot(c)}${esc(String(colourLabel(c)).split(' · ')[0])} · ${lv}%`; }
  return lv > 0 ? `${lv}%` : 'Off';
}
function lightRow(d) {
  const id = d.device_id; const t = `d:${id}`;
  const opens = d.domain === 'light' || d.domain === 'switch';
  const lv = opens ? (level(id) || 0) : (isOn(id) ? 100 : 0);
  const ring = ringClass(d);
  const discInner = `<span class="lkind lamp ${lv > 0 ? '' : 'off'}" data-ldisc="${id}" style="background:${lightFill(id, lv)}">${ICON(opens ? lightIcon(d) : domainIcon(d.domain))}</span>`;
  const disc = ring ? `<span class="lring ${ring}">${discInner}</span>` : discInner;
  const sw = `<button class="sw" data-lvl="${id}" data-act="toggle" data-t="${t}" aria-label="${esc(d.name)} on or off"></button>`;
  const head = opens
    ? `<div class="row lrow" role="button" tabindex="0" data-act="light-open" data-id="${id}">${disc}<div class="grow"><div class="n">${esc(d.name)}</div><div class="lv" data-lrowval="${id}">${lightRowValue(d)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></div>`
    : `<div class="row">${disc}<div class="grow"><div class="n">${esc(d.name)}</div><div class="lv" data-lrowval="${id}">${lightRowValue(d)}</div></div></div>`;
  if (d.domain === 'fan') return `<div class="item light" data-lswipe="${t}"><div class="lwrap">${head}<div class="fan">${['Off', 'Low', 'Medium', 'MediumHigh', 'High'].map(s => `<button class="chip" data-lvl="${id}" data-speed="${s}" data-act="fan" data-id="${id}" data-s="${s}">${s === 'MediumHigh' ? 'Med-hi' : s}</button>`).join('')}</div></div></div>`;
  if (d.domain === 'cover') return `<div class="item light"><div class="lwrap">${head}<div class="shade"><button class="btn sm" data-act="cmd" data-cmd='{"type":"raise","target":"${t}"}'>Open</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"stop","target":"${t}"}'>Stop</button><button class="btn sm" data-act="cmd" data-cmd='{"type":"lower","target":"${t}"}'>Close</button></div><div class="sliderwrap"><input class="slider" type="range" min="0" max="100" data-lvl="${id}" data-slide="${t}" aria-label="${esc(d.name)} openness"></div></div></div>`;
  return `<div class="item light" data-lswipe="${t}"><div class="lwrap">${head}</div>${sw}</div>`;
}
function tickCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const left = Math.max(0, Math.round((Number(el.dataset.countdown) * 1000 - Date.now()) / 60000));
    el.textContent = left <= 0 ? 'any moment' : `in ${left} min`;
  });
  if (document.querySelector('[data-countdown]')) setTimeout(tickCountdowns, 15000);
}
// A star pins a light to the front of Home's lamp row. It is set on the light's own page.
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
