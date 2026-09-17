/* Settings: one screen of grouped inset lists, and a short page behind each rare thing (docs/ia-v5.md 3, stage 6).
   There is no "More settings" any more: the connector went to "Your home", the devices to "Rooms and lights", the
   timing sliders and the back up to Advanced, and the night hours and the power button to "The house". */
'use strict';

// The short pages behind a row. Each is a title and a body; `settings-page` opens one, `settings-back` leaves it.
const SETTINGS_PAGES = {
  home: { title: 'Your home', body: () => settingsHomePage() },
  devices: { title: 'Rooms and lights', body: () => settingsDevicesPage() },
  sets: { title: 'Light sets', body: () => settingsSetsPage() },
  timing: { title: 'Remote timing', body: () => settingsTimingPage() },
  backup: { title: 'Back up and restore', body: () => settingsBackupPage() },
};
VIEWS.settings = {
  nested() { return !!(S.settingsPage && SETTINGS_PAGES[S.settingsPage]); },
  top() {
    const p = SETTINGS_PAGES[S.settingsPage];
    if (p) return nestedTop('settings-back', esc(p.title));
    return `<div class="t1">Settings</div>${statusCircle()}`;
  },
  body() { const p = SETTINGS_PAGES[S.settingsPage]; return p ? p.body() : settingsGlance(); },
};

// "just now", "4 minutes ago", "2 hours ago": how long since something happened, in plain words.
function ago(ms) {
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${plural(mins, 'minute')} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  return `${plural(Math.round(hours / 24), 'day')} ago`;
}
function connectionTipHTML() {
  const nd = controllable().length, np = remotes().length;
  const everConnected = devices().length > 0;
  // the quiet ten seconds after a drop: the card says what is happening without going red (connState in core.js)
  if (connState() === 'reconnecting' && everConnected) {
    return `<div class="tip"><div class="grow"><span class="cap">Connection</span><div class="t">Reconnecting</div><div class="d">${plural(nd, 'light')} · ${plural(np, 'remote')}</div><div class="d">The app lost its link for a moment. Everything on screen is the last thing your home said.</div></div><span class="tag">Reconnecting</span></div>`;
  }
  if (S.agent.online) {
    const h = (S.agent.info || {}).health || null;
    // What the connector itself holds. A remote that does nothing is usually one of these three: the bridge
    // is not listing its buttons, the connector has no button settings, or no press ever arrives.
    const facts = h ? [
      h.bridge_ok ? `${plural(h.buttons || 0, 'button')} on the bridge` : 'the bridge is not answering',
      `${plural(h.bindings || 0, 'button setting')}`,
      h.last_press_at ? `last press ${ago(h.last_press_at * 1000)}` : 'no press seen yet',
    ].join(' · ') : '';
    const warn = h && (!h.bridge_ok || !h.buttons || !h.bindings);
    return `<div class="tip"><div class="grow"><span class="cap">Connection</span><div class="t">Connected to your home</div><div class="d">${plural(nd, 'light')} · ${plural(np, 'remote')}</div>${facts ? `<div class="d">${esc(facts)}</div>` : ''}</div><span class="tag ${warn ? 'red' : 'green'}">${warn ? 'Check this' : 'Connected'}</span></div>`;
  }
  return `<div class="tip top"><div class="grow"><span class="cap">Connection</span><div class="t">${everConnected ? 'Not connected right now' : 'Not connected yet'}</div><div class="d">${everConnected ? `Last seen with ${plural(nd, 'light')} and ${plural(np, 'remote')}.` : 'A small helper program on a computer in your house links this app to your Lutron bridge.'}</div>${everConnected ? `<div class="d">Is the computer running the connector on and awake?<br>Is it on the same Wi-Fi as your Lutron bridge?<br>Is the internet working there?</div><div class="d">Your remotes keep working from their last saved settings while disconnected.</div>` : ''}</div><span class="tag red">Not connected</span></div>`;
}
// One word for the state of the link, for the row at the top of Settings.
function connTag() {
  if (connState() === 'reconnecting' && devices().length) return `<span class="tag">Reconnecting</span>`;
  if (S.agent.online) { const h = (S.agent.info || {}).health || null; const warn = h && (!h.bridge_ok || !h.buttons || !h.bindings); return `<span class="tag ${warn ? 'red' : 'green'}">${warn ? 'Check this' : 'Connected'}</span>`; }
  return `<span class="tag red">Not connected</span>`;
}
// Settings, one screen (docs/ia-v5.md 3): the connection, your home, the house, this app, advanced, sign out.
// Section headers are the caps style the rest of the app uses for a grouped list.
function settingsGlance() {
  const s = S.config.settings;
  const everConnected = devices().length > 0;
  const loc = s.location;
  const nSets = groups().length;
  const nLights = controllable().length;
  return `
    <div class="card pad0 list" style="margin-top:8px">
      ${valueRow('Your home', connTag(), 'settings-page', 'data-p="home"')}
    </div>
    ${everConnected ? '' : `<button class="tip" data-act="setup-open" style="margin-top:8px"><div class="grow"><span class="cap">Set up</span><div class="t">Let's connect your home</div><div class="d">About ten minutes, once.</div></div><span class="go">${ICON('chev')}</span></button>`}
    <div class="gh">Your home</div>
    <div class="card pad0 list">
      ${valueRow('Home name', esc(s.home_name || 'Home'), 'home-name')}
      ${valueRow('Rooms and lights', `${plural(areas().length, 'room')} · ${plural(nLights, 'light')}`, 'settings-page', 'data-p="devices"')}
      ${valueRow('Where the home is', loc && loc.name ? esc(loc.name) : (loc ? 'Saved' : 'Not set'), 'where-open')}
      ${valueRow('Light sets', nSets ? esc(plural(nSets, 'set')) : 'None yet', 'settings-page', 'data-p="sets"')}
    </div>
    <div class="gh">The house</div>
    <div class="card pad0 list">
      ${valueRow('Power button', (s.power_on || 'restore') === 'all' ? 'Everything on' : 'What was on before', 'power-open')}
      ${valueRow('Night', `${fmtTime(s.night_start)} to ${fmtTime(s.night_end)}`, 'night-open')}
      ${valueRow('Brightness for on', `${s.group_on_level}%`, 'onlevel-open')}
    </div>
    <div class="gh">This app</div>
    <div class="card pad0 list">
      <button class="item" data-act="install-help"><div class="grow"><div class="t">Add to your home screen</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
      <button class="item" data-act="activity"><div class="grow"><div class="t">Recent activity</div><div class="d">What was pressed, and what happened</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
      <button class="item" data-act="ideas"><div class="grow"><div class="t">Ideas for your home</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    </div>
    <div class="gh">Advanced</div>
    <div class="card pad0 list">
      ${valueRow('Remote timing', '', 'settings-page', 'data-p="timing"', { sub: 'Double press and hold' })}
      ${valueRow('Back up and restore', '', 'settings-page', 'data-p="backup"')}
    </div>
    <div class="spacer"></div>
    <div class="card pad0 list"><button class="item danger" data-act="logout"><div class="grow"><div class="t">Sign out</div></div><span class="chev">${ICON('x', 'sm')}</span></button></div>`;
}
// Your home: how the app reaches the lights, and the connector that does it.
function settingsHomePage() {
  const s = S.config.settings; const info = S.agent.info || {};
  const everConnected = devices().length > 0;
  return `
    ${connectionTipHTML()}
    ${everConnected ? '' : `<button class="tip" data-act="setup-open" style="margin-top:8px"><div class="grow"><span class="cap">Set up</span><div class="t">Let's connect your home</div><div class="d">About ten minutes, once.</div></div><span class="go">${ICON('chev')}</span></button>`}
    <div class="gh">The connector</div>
    <div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">Connector ${esc(info.version || '?')}${info.commit ? ` <span class="faint small">(${esc(info.commit)})</span>` : ''}</div><div class="d">${info.update_available ? `${esc(info.latest)} is available` : 'Up to date'}${(info.bridge || {}).host ? ` · bridge at ${esc(info.bridge.host)}` : ''}</div></div>${info.update_available ? `<button class="btn sm primary" data-act="update-connector">Update</button>` : ''}</div>
      <label class="item"><div class="grow"><div class="t">Update automatically</div><div class="d">Whenever a new version is out, the connector updates itself.</div></div><button class="sw ${s.auto_update ? 'on' : ''}" data-act="auto-update"></button></label>
      <div class="item disc" style="flex-wrap:wrap"><button class="dsum grow" data-act="settings-how" aria-expanded="${S.settingsHow ? 'true' : 'false'}"><div><div class="t">How your home connects</div><div class="d">The helper program, and the line that installs it</div></div>${ICON('chev', 'sm')}</button><div class="dwrap ${S.settingsHow ? 'open' : ''}"><div>${howToHTML()}</div></div></div>
    </div>`;
}
// Rooms and lights: the rooms themselves, adding a device without the Lutron app, the Hue bridge, any paired
// Nanoleaf controllers, and looking again.
function settingsDevicesPage() {
  const info = S.agent.info || {};
  return `
    <div class="gh">Rooms</div>
    <div class="card pad0 list">
      ${valueRow('Rooms', esc(plural(areas().length, 'room')), 'rooms-open', '', { sub: 'Make one, rename it, move lights and remotes between them' })}
    </div>
    <div class="gh">Lights and remotes</div>
    <div class="card pad0 list">
      <button class="item" data-act="ad-open"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Add a device</div><div class="d">Without the Lutron app</div></div></button>
      ${(() => { const h = info.hue; return h && h.paired ? `<button class="item" data-act="hue-open"><div class="grow"><div class="t">Hue bridge</div><div class="d">${plural(h.lights || 0, 'light')} in ${plural(h.rooms || 0, 'room')}${h.error ? ' · not reachable right now' : ''}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>` : `<button class="item" data-act="hue-open"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Connect a Hue bridge</div><div class="d">Philips Hue lights and rooms join the app and your remotes</div></div></button>`; })()}
      <button class="item" data-act="refresh"><div class="grow"><div class="t">Look for new lights</div></div><span class="chev">${ICON('refresh', 'sm')}</span></button>
    </div>
    <div class="gh">Nanoleaf</div>
    <div class="card pad0 list">
      ${nanoleafList().map(d => `<button class="item" data-act="nl-device" data-serial="${esc(d.serial)}"><div class="ic">${ICON('link', 'sm')}</div><div class="grow"><div class="t">${esc(d.name || 'Nanoleaf')}</div><div class="d">${esc(d.model || 'Light panels')}${d.error ? ' · not reachable right now' : ''}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}
      <button class="item" data-act="nl-open"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">${nanoleafList().length ? 'Connect another Nanoleaf' : 'Connect a Nanoleaf'}</div><div class="d">Each one pairs on its own, hold its power button until it flashes</div></div></button>
    </div>`;
}
// Light sets: a hand-picked mix of lights, for a button or an automation to point at.
function settingsSetsPage() {
  return `<div class="card pad0 list" style="margin-top:8px">
      ${groups().map(g => `<button class="item" data-act="group-edit" data-id="${g.id}"><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${plural(g.device_ids.length, 'light')}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}
      <button class="item" data-act="group-new"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">New set</div><div class="d">A hand-picked mix, like Downstairs path.</div></div></button>
    </div>`;
}
// Remote timing: how fast a double press is, how long a hold is, and a live tester.
function settingsTimingPage() {
  const s = S.config.settings;
  return `<div class="card" style="margin-top:8px">
      <label class="field" style="margin-top:0"><span>How fast is a double press? <span id="dv" class="faint">${s.double_ms} ms</span></span><input class="slider" type="range" min="200" max="800" step="10" value="${s.double_ms}" style="--p:${(s.double_ms - 200) / 6}%" data-setting="double_ms"><div class="slidercap"><span>Quick</span><span>Relaxed</span></div></label>
      <label class="field"><span>How long is a hold? <span id="hv" class="faint">${s.hold_ms} ms</span></span><input class="slider" type="range" min="300" max="1500" step="10" value="${s.hold_ms}" style="--p:${(s.hold_ms - 300) / 12}%" data-setting="hold_ms"><div class="slidercap"><span>Short</span><span>Long</span></div></label>
      <div class="d" id="tester" style="margin:4px 0 0">Press a button on any remote to test the timing.</div>
    </div>`;
}
function settingsBackupPage() {
  return `<div class="card pad0 list" style="margin-top:8px">
      <button class="item" data-act="backup"><div class="grow"><div class="t">Back up settings</div><div class="d">Copies them to the clipboard</div></div><span class="chev">${ICON('copy', 'sm')}</span></button>
      <button class="item" data-act="restore"><div class="grow"><div class="t">Restore settings…</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    </div>`;
}
// How the home connects: the numbered steps and the install line, behind the row on the Your home page.
function howToHTML() {
  const line = `curl -fsSL "${location.origin}/install.sh?token=${S.token}" | sh`;
  return `<div class="muted" style="margin-top:8px">
    <p style="margin:0 0 8px"><b style="color:var(--text)">1.</b> Pick a computer that stays on and is on your home Wi-Fi: a Mac, a Raspberry Pi, a NAS, an old laptop.</p>
    <p style="margin:0 0 4px"><b style="color:var(--text)">2.</b> Open the Terminal app on it, paste this line, press Enter:</p>
    <div class="code"><code>${esc(line)}</code><button class="iconbtn sm" data-act="copy" data-text="${esc(line)}">${ICON('copy', 'sm')}</button></div>
    <p style="margin:8px 0"><b style="color:var(--text)">3.</b> When it asks, press the small black button on the back of your Lutron bridge.</p>
    <p style="margin:0">That's it. The moment it connects, the dot at the top turns green and your rooms appear. It starts again by itself after a restart.</p>
  </div>`;
}
function setSetting(k, v) {
  const s = S.config.settings;
  if (k === 'double_ms' || k === 'hold_ms' || k === 'group_on_level') s[k] = Number(v); else s[k] = v;
  if (k === 'double_ms') $('#dv').textContent = `${v} ms`; if (k === 'hold_ms') $('#hv').textContent = `${v} ms`;
  if (k === 'home_name') { const t = document.querySelector('#top .t1'); if (t && S.view === 'home') t.textContent = v || 'Home'; const r = document.querySelector('[data-act="home-name"] .val'); if (r) r.textContent = v || 'Home'; paintNowBar(); }
  saveSoon();
}
// The name saves as you type (the value row, the page title and the bar follow).
document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.setting === 'home_name') setSetting('home_name', e.target.value); });
function openActivity() {
  sheet.open('Recent activity', `<div id="activity">${activityHTML()}</div>`, { detent: 'large' });
}
function activityHTML() {
  if (!S.activity.length) return `<div class="tip"><div class="grow"><span class="cap">Activity</span><div class="t">Nothing yet</div><div class="d">Press a remote button and it shows up here.</div></div></div>`;
  return `<div class="card pad0 list">${S.activity.slice(0, 60).map(e => {
    const when = new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    let t = '', d = '', ic = 'bolt';
    if (e.kind === 'pico') { const dv = dev(e.device_id); t = `${dv ? dv.name : 'Remote'} · ${buttonLabel(e.device_id, e.button_number)}`; d = `${GESTURE_LABEL[userGestureOf({ gesture: e.gesture })] || e.gesture}${e.bound ? '' : ' · nothing set'}`; ic = 'remote'; }
    else if (e.kind === 'app') { t = describe([e.action]) || 'Command'; d = 'From the app'; ic = 'bulb'; }
    else if (e.kind === 'agent') { t = e.online ? 'Connected to your home' : 'Lost connection to your home'; ic = 'link'; }
    // an automation the connector ran (or could not): { kind: 'schedule', id, name, ok, error }
    else if (e.kind === 'schedule') { const nm = e.name || (typeof scById === 'function' && scById(e.id) ? scById(e.id).name : 'An automation'); t = e.ok === false ? `${nm} didn't run` : `${nm} ran`; d = e.ok === false ? "Couldn't reach the bridge" : 'Ran on its own'; ic = 'clock'; }
    return `<div class="item">${ICON(ic)}<div class="grow"><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></div><div class="val">${when}</div></div>`;
  }).join('')}</div>`;
}
function paintActivity() { const el = $('#activity'); if (el) el.innerHTML = activityHTML(); }
// The home's name: a small sheet with one field, saved as you type.
function openHomeName() {
  const s = S.config.settings;
  sheet.open('Home name', `<label class="field" style="margin-top:0"><span>Name</span><input class="input" value="${esc(s.home_name || '')}" placeholder="Home" data-setting="home_name" maxlength="40" autocomplete="off"></label><p class="d">It shows at the top of Home. It saves as you type.</p>`, { detent: 'compact', done: true });
  setTimeout(() => { const i = $('#sheet-root [data-setting="home_name"]'); if (i) { i.focus(); i.select(); } }, 350);
}
// The house's night: the hours and the look, one home for both (docs/ia-v5.md 2). The evening wind-down sheet opens
// this same sheet rather than keeping a second copy of the hours.
function openNightSheet(opts = {}) {
  const s = S.config.settings;
  const body = `<div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">The house goes quiet</div><div class="d">Buttons can do something different from here on.</div></div><input type="time" value="${s.night_start}" data-night="night_start" aria-label="The house goes quiet"></div>
      <div class="item"><div class="grow"><div class="t">Night ends</div></div><input type="time" value="${s.night_end}" data-night="night_end" aria-label="Night ends"></div>
    </div>
    <div class="card pad0 list" style="margin-top:16px">${nightLookRowHTML()}</div>`;
  showSheet('night', 'Night', body, { detent: 'medium', sub: 'The hours, and how the app looks then.', back: !!opts.back, onBack: opts.back || null });
  sheet.onClose = () => { if (S.view === 'settings' && !S.settingsPage) render(); };
}
// One writer for the night hours, wherever they are changed (docs/ia-v5.md 6, stage 6).
function setNightHours(k, v) {
  if (!/^\d\d:\d\d$/.test(v)) return;
  S.config.settings[k] = v;
  if (k === 'night_start' && typeof rewriteEveningPoints === 'function') rewriteEveningPoints(v);
  save({ msg: k === 'night_start' ? `Quiet from ${fmtTime(v)}` : `Night ends at ${fmtTime(v)}`, render: false });
  const wc = $('#wd-cap'); if (wc && typeof windDownCaption === 'function') wc.innerHTML = windDownCaption();
  const wt = $('#wd-today'); if (wt && typeof todaySentence === 'function') wt.textContent = todaySentence();
}
document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.night; if (k) setNightHours(k, e.target.value); });
// The power button with the house dark: two chips, nothing else.
function openPowerSheet() {
  showSheet('power-pref', 'Power button', `<div class="card pad0 list">${powerRowHTML()}</div>`, { detent: 'compact', sub: 'What it does when every light is already off.' });
  sheet.onClose = () => { if (S.view === 'settings' && !S.settingsPage) render(); };
}
// Default brightness for "on": one number.
function openOnLevelSheet() {
  const s = S.config.settings;
  showSheet('onlevel', 'Brightness for on', `<div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">Percent</div><div class="d">What a light comes on at when a button or a room switch just says "on".</div></div><input type="number" min="1" max="100" value="${s.group_on_level}" data-setting="group_on_level" aria-label="Brightness for on"></div>
    </div>`, { detent: 'compact' });
  sheet.onClose = () => { if (S.view === 'settings' && !S.settingsPage) render(); };
}
// Where the home is: the app needs it for sunset, and nothing else. One home for it (docs/ia-v5.md 2).
function openWhereSheet() {
  const loc = S.config.settings.location;
  LOC.host = openWhereSheet;
  // once it is known the sentence has done its job: the card says where, and the two ways to change it follow
  const body = loc
    ? `<div class="card pad0 list"><div class="item"><div class="grow"><div class="t">${esc(loc.name || 'Saved')}</div><div class="d">${typeof sunAt === 'function' && sunAt('sunset', 0) ? `Sunset today ${fmtTime(sunAt('sunset', 0))}` : 'Kept on your own hub'}</div></div></div></div>
       <div class="stack" style="margin-top:24px"><button class="btn block" data-act="loc-city">Pick a different city</button><button class="btn ghost block" data-act="loc-use" ${LOC.busy ? 'disabled' : ''}>${LOC.busy ? 'Finding you…' : 'Use my location'}</button></div>`
    : locationBodyHTML();
  showSheet('where', 'Where the home is', body, { detent: 'medium', sub: 'For sunset and sunrise.' });
  sheet.onClose = () => { LOC.host = null; if (S.view === 'settings' && !S.settingsPage) render(); };
}
function openInstallHelp() {
  sheet.open('Add to your home screen', `<div class="stack">
    <div class="card"><div class="t">Android (Chrome)</div><div class="body">Tap the ⋮ menu, then <b style="color:var(--text)">Add to Home screen</b>. Tap Install if it offers.</div></div>
    <div class="card"><div class="t">iPhone (Safari)</div><div class="body">Tap the share button, then <b style="color:var(--text)">Add to Home Screen</b>.</div></div>
    <p class="body">It then opens full-screen with its own icon, and works from anywhere, not just at home.</p></div>`);
}
function openGroupEditor(id) {
  let g = groups().find(x => x.id === id);
  if (!g) { g = { id: uid(), name: 'New set', device_ids: [], on_level: null }; S.config.groups.push(g); }
  S.groupEdit = g.id;
  const rows = areas().map(a => { const ds = controllable().filter(d => devArea(d) === a.id && d.domain !== 'cover'); if (!ds.length) return ''; return `<div class="h2">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => `<label class="item"><input type="checkbox" class="cb" ${g.device_ids.includes(d.device_id) ? 'checked' : ''} data-act="group-inc" data-id="${d.device_id}"><div class="grow"><div class="t">${esc(d.name)}</div></div></label>`).join('')}</div>`; }).join('');
  sheet.open('Light set', `<label class="field"><span>Name</span><input class="input" id="group-name" value="${esc(g.name)}"></label>${rows}<div class="spacer"></div><button class="btn danger block" data-act="group-delete" data-id="${g.id}">Delete this set</button>`, { detent: 'large', done: true });
}

// The power button with the house dark: bring back what was on, or turn everything on. The sheet's own title says
// which button this is, so the row is the sentence and the two chips.
function powerRowHTML() {
  const cur = S.config.settings.power_on || 'restore';
  return `<div class="item" style="flex-wrap:wrap"><div class="grow"><div class="d">${cur === 'all' ? 'Turns every light on at its usual level.' : 'Brings back the lights that were on before, at the same levels.'}</div></div>
    <div class="chips" style="flex-basis:100%;margin-top:4px" data-power-on>${[['restore', 'What was on before'], ['all', 'Everything']].map(([v, l]) => `<button class="chip sm ${cur === v ? 'sel' : ''}" data-act="power-on" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}
function setPowerOn(v) {
  S.config.settings.power_on = v;
  const row = document.querySelector('[data-power-on]'); if (row) row.closest('.item').outerHTML = powerRowHTML();
  saveSoon();
  paintNowBar();
}
