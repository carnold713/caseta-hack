/* Settings: the glance (connection, your home, night-time, this app) and More settings (connector, timing, light sets, back up). */
'use strict';

VIEWS.settings = {
  nested() { return !!S.settingsMore; },
  top() {
    if (S.settingsMore) return nestedTop('settings-back', 'More settings');
    return `<div class="t1">Settings</div>${statusCircle()}`;
  },
  body() { return S.settingsMore ? settingsMore() : settingsGlance(); },
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
// The glance (docs/ux-progressive.md 2.17): the connection, the home, night-time, this app, More settings, sign out.
function settingsGlance() {
  const s = S.config.settings; const info = S.agent.info || {};
  const everConnected = devices().length > 0;
  return `
    ${connectionTipHTML()}
    ${everConnected ? '' : `<button class="tip" data-act="setup-open" style="margin-top:8px"><div class="grow"><span class="cap">Set up</span><div class="t">Let's connect your home</div><div class="d">About ten minutes, once.</div></div><span class="go">${ICON('chev')}</span></button>`}
    <div class="h2">Your home</div>
    <div class="card pad0 list">
      ${valueRow('Home name', esc(s.home_name || 'Home'), 'home-name')}
      <button class="item" data-act="ad-open"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Add a device</div><div class="d">Without the Lutron app</div></div></button>
      ${(() => { const h = info.hue; return h && h.paired ? `<button class="item" data-act="hue-open"><div class="grow"><div class="t">Hue bridge</div><div class="d">${plural(h.lights || 0, 'light')} in ${plural(h.rooms || 0, 'room')}${h.error ? ' · not reachable right now' : ''}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>` : `<button class="item" data-act="hue-open"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">Connect a Hue bridge</div><div class="d">Philips Hue lights and rooms join the app and your remotes</div></div></button>`; })()}
      <button class="item" data-act="refresh"><div class="grow"><div class="t">Look for new lights</div></div><span class="chev">${ICON('refresh', 'sm')}</span></button>
    </div>
    <div class="h2">Preferences</div>
    <div class="card pad0 list">
      ${valueRow('Power button, night hours, night look', '', 'prefs', '', { sub: prefsSub() })}
    </div>
    <div class="h2">This app</div>
    <div class="card pad0 list">
      <button class="item" data-act="install-help"><div class="grow"><div class="t">Add to your home screen</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
      <button class="item" data-act="activity"><div class="grow"><div class="t">Recent activity</div><div class="d">What was pressed, and what happened</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
      <button class="item" data-act="ideas"><div class="grow"><div class="t">Ideas for your home</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    </div>
    <div class="spacer"></div>
    ${moreRow('Connector, timing, default brightness, light sets, back up', 'settings-more', 'More settings')}
    <div class="spacer"></div>
    <div class="card pad0 list"><button class="item" data-act="logout"><div class="grow"><div class="t">Sign out</div></div><span class="chev">${ICON('x', 'sm')}</span></button></div>`;
}
// More settings: a nested page with the connector, timing, light sets, back up and restore.
function settingsMore() {
  const s = S.config.settings; const info = S.agent.info || {};
  const groupsList = groups();
  return `
    <div class="h2" style="margin-top:8px">Connector</div>
    <div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">Connector ${esc(info.version || '?')}${info.commit ? ` <span class="faint small">(${esc(info.commit)})</span>` : ''}</div><div class="d">${info.update_available ? `${esc(info.latest)} is available` : 'Up to date'}${(info.bridge || {}).host ? ` · bridge at ${esc(info.bridge.host)}` : ''}</div></div>${info.update_available ? `<button class="btn sm primary" data-act="update-connector">Update</button>` : ''}</div>
      <label class="item"><div class="grow"><div class="t">Update automatically</div><div class="d">Whenever a new version is out, the connector updates itself.</div></div><button class="sw ${s.auto_update ? 'on' : ''}" data-act="auto-update"></button></label>
      <div class="item disc" style="flex-wrap:wrap"><button class="dsum grow" data-act="settings-how" aria-expanded="${S.settingsHow ? 'true' : 'false'}"><div><div class="t">How your home connects</div><div class="d">The helper program, and the line that installs it</div></div>${ICON('chev', 'sm')}</button><div class="dwrap ${S.settingsHow ? 'open' : ''}"><div>${howToHTML()}</div></div></div>
    </div>
    <div class="h2">Timing</div>
    <div class="card">
      <label class="field" style="margin-top:0"><span>How fast is a double press? <span id="dv" class="faint">${s.double_ms} ms</span></span><input class="slider" type="range" min="200" max="800" step="10" value="${s.double_ms}" style="--p:${(s.double_ms - 200) / 6}%" data-setting="double_ms"><div class="slidercap"><span>Quick</span><span>Relaxed</span></div></label>
      <label class="field"><span>How long is a hold? <span id="hv" class="faint">${s.hold_ms} ms</span></span><input class="slider" type="range" min="300" max="1500" step="10" value="${s.hold_ms}" style="--p:${(s.hold_ms - 300) / 12}%" data-setting="hold_ms"><div class="slidercap"><span>Short</span><span>Long</span></div></label>
      <div class="d" id="tester" style="margin:4px 0 0">Press a button on any remote to test the timing.</div>
    </div>
    <div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">Default brightness for on</div><div class="d">Percent, when a button just says "on"</div></div><input type="number" min="1" max="100" value="${s.group_on_level}" data-setting="group_on_level"></div>
    </div>
    <div class="h2">Light sets</div>
    <div class="card pad0 list">
      ${groupsList.map(g => `<button class="item" data-act="group-edit" data-id="${g.id}"><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${g.device_ids.length} lights</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}
      <button class="item" data-act="group-new"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">New set</div><div class="d">A hand-picked mix, like Downstairs path.</div></div></button>
    </div>
    <div class="spacer"></div>
    <div class="card pad0 list">
      <button class="item" data-act="backup"><div class="grow"><div class="t">Back up settings</div><div class="d">Copies them to the clipboard</div></div><span class="chev">${ICON('copy', 'sm')}</span></button>
      <button class="item" data-act="restore"><div class="grow"><div class="t">Restore settings…</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    </div>`;
}
// How the home connects: the numbered steps and the install line, under More settings.
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
  sheet.open('Home name', `<label class="field" style="margin-top:0"><span>Name</span><input class="input" value="${esc(s.home_name || '')}" placeholder="Home" data-setting="home_name" maxlength="40" autocomplete="off"></label><p class="d">It shows at the top of Home.</p><div class="sfoot"><button class="btn primary lg block" data-act="sheet-close">Done</button></div>`, { detent: 'compact' });
  setTimeout(() => { const i = $('#sheet-root [data-setting="home_name"]'); if (i) { i.focus(); i.select(); } }, 350);
}
// Preferences (docs/ux-progressive.md 2.17): the power button with the house dark, the night hours, the night look, in one sheet.
function prefsSub() { const s = S.config.settings; return `${(s.power_on || 'restore') === 'all' ? 'Everything on' : 'What was on before'} · night ${fmtTime(s.night_start)} to ${fmtTime(s.night_end)}`; }
function openPrefs() {
  const s = S.config.settings;
  const body = `<div class="card pad0 list">
      ${powerRowHTML()}
    </div>
    <div class="h3" style="margin-top:24px">Night-time</div>
    <div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">Night starts</div><div class="d">Buttons can do something different at night.</div></div><input type="time" value="${s.night_start}" data-setting="night_start" aria-label="Night starts"></div>
      <div class="item"><div class="grow"><div class="t">Night ends</div></div><input type="time" value="${s.night_end}" data-setting="night_end" aria-label="Night ends"></div>
      ${nightLookRowHTML()}
    </div>`;
  showSheet('prefs', 'Preferences', body, { detent: 'medium', sub: 'The power button, night hours, night look.' });
  sheet.onClose = () => { const r = document.querySelector('[data-act="prefs"] .d'); if (r) r.textContent = prefsSub(); };
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
  const rows = areas().map(a => { const ds = controllable().filter(d => (d.area || 'none') === a.id && d.domain !== 'cover'); if (!ds.length) return ''; return `<div class="h2">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => `<label class="item"><input type="checkbox" class="cb" ${g.device_ids.includes(d.device_id) ? 'checked' : ''} data-act="group-inc" data-id="${d.device_id}"><div class="grow"><div class="t">${esc(d.name)}</div></div></label>`).join('')}</div>`; }).join('');
  sheet.open('Light set', `<label class="field"><span>Name</span><input class="input" id="group-name" value="${esc(g.name)}"></label>${rows}<div class="spacer"></div><button class="btn danger block" data-act="group-delete" data-id="${g.id}">Delete this set</button>`, { detent: 'large', done: true });
}

// The power button with the house dark: bring back what was on, or turn everything on.
function powerRowHTML() {
  const cur = S.config.settings.power_on || 'restore';
  return `<div class="item" style="flex-wrap:wrap"><div class="grow"><div class="t">Power button with the house dark</div><div class="d">${cur === 'all' ? 'Turns every light on at its usual level.' : 'Brings back the lights that were on before, at the same levels.'}</div></div>
    <div class="chips" style="flex-basis:100%;margin-top:4px" data-power-on>${[['restore', 'What was on before'], ['all', 'Everything']].map(([v, l]) => `<button class="chip sm ${cur === v ? 'sel' : ''}" data-act="power-on" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}
function setPowerOn(v) {
  S.config.settings.power_on = v;
  const row = document.querySelector('[data-power-on]'); if (row) row.closest('.item').outerHTML = powerRowHTML();
  saveSoon();
  paintNowBar();
}
