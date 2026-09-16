/* Settings: connection and setup, night hours, advanced. */
'use strict';

VIEWS.settings = {
  top() { return `<div class="t1">Settings</div>${statusCircle()}`; },
  body() {
    const s = S.config.settings; const info = S.agent.info || {};
    const nd = controllable().length, np = remotes().length;
    const everConnected = devices().length > 0;
    const groupsList = groups();
    const conn = S.agent.online
      ? `<div class="tip"><div class="grow"><span class="cap">Connection</span><div class="t">Connected to your home</div><div class="d">${plural(nd, 'light')} · ${plural(np, 'remote')}${(info.bridge || {}).host ? ` · bridge at ${esc(info.bridge.host)}` : ''}</div></div><span class="go">${ICON('link')}</span></div>`
      : `<div class="tip top"><div class="grow"><span class="cap">Connection</span><div class="t">${everConnected ? 'Not connected right now' : 'Not connected yet'}</div><div class="d">${everConnected ? `Last seen with ${plural(nd, 'light')} and ${plural(np, 'remote')}.` : 'Follow the steps below.'}</div>${everConnected ? `<div class="d">Is the computer running the connector on and awake?<br>Is it on the same Wi-Fi as your Lutron bridge?<br>Is the internet working there?</div><div class="d">Your remotes keep working from their last saved settings while disconnected.</div>` : ''}</div><span class="go">${ICON('link')}</span></div>`;
    return `
    <div class="spacer"></div>${conn}
    <div class="h2">Your home</div>
    <div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">Home name</div></div><input class="input name" value="${esc(s.home_name)}" placeholder="Home" data-setting="home_name"></div>
      <button class="item" data-act="ad-open"><div class="grow"><div class="t">Add a device</div><div class="d">A new dimmer, switch, remote or shade, without the Lutron app</div></div><span class="chev">${ICON('plus', 'sm')}</span></button>
      ${(() => { const h = info.hue; return h && h.paired ? `<button class="item" data-act="hue-open"><div class="grow"><div class="t">Hue bridge</div><div class="d">${plural(h.lights || 0, 'light')} in ${plural(h.rooms || 0, 'room')}${h.error ? ' · not reachable right now' : ''}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>` : `<button class="item" data-act="hue-open"><div class="grow"><div class="t">Connect a Hue bridge</div><div class="d">Philips Hue lights and rooms join the app and your remotes</div></div><span class="chev">${ICON('plus', 'sm')}</span></button>`; })()}
      <button class="item" data-act="refresh"><div class="grow"><div class="t">Look for new lights</div><div class="d">Added or renamed something in the Lutron app? Look again to pick it up.</div></div><span class="chev">${ICON('refresh', 'sm')}</span></button>
      <div class="item"><div class="grow"><div class="t">Connector ${esc(info.version || '?')}${info.commit ? ` <span class="faint small">(${esc(info.commit)})</span>` : ''}</div><div class="d">${info.update_available ? `Update available: ${esc(info.latest)}` : 'Up to date'}</div></div>${info.update_available ? `<button class="btn sm primary" data-act="update-connector">Update</button>` : ''}</div>
      <label class="item"><div class="grow"><div class="t">Update automatically</div><div class="d">Whenever a new version is out, the connector updates itself.</div></div><button class="sw ${s.auto_update ? 'on' : ''}" data-act="auto-update"></button></label>
    </div>
    <div class="h2">Set up</div>
    ${setupSteps(everConnected)}
    <div class="h2">Night-time</div>
    <div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">Night starts</div><div class="d">Buttons can do something different at night, like turning on dim instead of bright.</div><div class="d">Also when the evening wind-down reaches its lowest. You can change it on the <a data-act="nav" data-view="automations" href="#automations">Automations tab</a>.</div></div><input type="time" value="${s.night_start}" data-setting="night_start"></div>
      <div class="item"><div class="grow"><div class="t">Night ends</div></div><input type="time" value="${s.night_end}" data-setting="night_end"></div>
      ${nightLookRowHTML()}
    </div>
    <div class="h2">This app</div>
    <div class="card pad0 list">
      <button class="item" data-act="install-help"><div class="grow"><div class="t">Add to your phone's home screen</div><div class="d">Opens full-screen like a real app</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
      <button class="item" data-act="activity"><div class="grow"><div class="t">Recent activity</div><div class="d">What was pressed, and what happened</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    </div>
    <div class="h2">Advanced</div>
    <div class="card">
      <div class="t">Timing</div>
      <label class="field"><span>How fast is a double press? <span id="dv" class="faint">${s.double_ms} ms</span></span><input class="slider" type="range" min="200" max="800" step="10" value="${s.double_ms}" style="--p:${(s.double_ms - 200) / 6}%" data-setting="double_ms"><div class="slidercap"><span>Quick</span><span>Relaxed</span></div></label>
      <label class="field"><span>How long is a hold? <span id="hv" class="faint">${s.hold_ms} ms</span></span><input class="slider" type="range" min="300" max="1500" step="10" value="${s.hold_ms}" style="--p:${(s.hold_ms - 300) / 12}%" data-setting="hold_ms"><div class="slidercap"><span>Short</span><span>Long</span></div></label>
      <div class="d" id="tester" style="margin:4px 0 8px">Press a button on any remote to test the timing.</div>
    </div>
    <div class="card pad0 list">
      <div class="item"><div class="grow"><div class="t">Default brightness for on</div><div class="d">Percent, when a button just says "on"</div></div><input type="number" min="1" max="100" value="${s.group_on_level}" data-setting="group_on_level"></div>
    </div>
    <div class="h2">Light sets</div>
    <div class="card pad0 list">
      ${groupsList.map(g => `<button class="item" data-act="group-edit" data-id="${g.id}"><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${g.device_ids.length} lights</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('')}
      <button class="item" data-act="group-new"><span class="plus">${ICON('plus', 'sm')}</span><div class="grow"><div class="t">New set</div><div class="d">Rooms come from the Lutron app. A set is a hand-picked mix, like "Downstairs path".</div></div></button>
    </div>
    <div class="spacer"></div>
    <div class="card pad0 list">
      <button class="item" data-act="backup"><div class="grow"><div class="t">Back up settings</div><div class="d">Copies them to the clipboard</div></div><span class="chev">${ICON('copy', 'sm')}</span></button>
      <button class="item" data-act="restore"><div class="grow"><div class="t">Restore settings…</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>
    </div>
    <div class="spacer"></div>
    <div class="card pad0 list"><button class="item" data-act="logout"><div class="grow"><div class="t">Sign out</div></div><span class="chev">${ICON('x', 'sm')}</span></button></div>`;
  },
};

function setupSteps(everConnected) {
  const online = S.agent.online;
  const line = `curl -fsSL "${location.origin}/install.sh?token=${S.token}" | sh`;
  return `<div class="card"><div class="steps">
    <div class="step done"><div class="num"></div><div class="grow"><div class="t">Sign in</div></div></div>
    <div class="step ${online || everConnected ? 'done' : ''}"><div class="num"></div><div class="grow"><div class="t">Connect your home</div><div class="d">A small helper program runs on a computer in your house so this app can reach the Lutron bridge. It takes about ten minutes.</div>
      <details class="more"><summary>Show me how${ICON('chev', 'sm')}</summary><div class="muted">
        <p style="margin:0 0 8px"><b style="color:var(--text)">1.</b> Pick a computer that stays on and is on your home Wi-Fi: a Mac, a Raspberry Pi, a NAS, an old laptop.</p>
        <p style="margin:0 0 4px"><b style="color:var(--text)">2.</b> Open the Terminal app on it, paste this line, press Enter:</p>
        <div class="code"><code>${esc(line)}</code><button class="iconbtn sm" data-act="copy" data-text="${esc(line)}">${ICON('copy', 'sm')}</button></div>
        <p style="margin:8px 0"><b style="color:var(--text)">3.</b> When it asks, press the small black button on the back of your Lutron bridge.</p>
        <p style="margin:0">That's it. The moment it connects, the dot at the top turns green and your rooms appear. It starts again by itself after a restart.</p>
      </div></details></div></div>
    <div class="step"><div class="num"></div><div class="grow"><div class="t">Take over a remote <span class="faint">(optional)</span></div><div class="d">Your remotes still do what the Lutron app told them, as well as what you set here.</div>
      <details class="more"><summary>Show me how${ICON('chev', 'sm')}</summary><div class="muted">Open the Lutron app, tap the remote, and remove the lights it controls. Keep it paired to the bridge. From then on only your settings run. Skip this if you just want to add a double press or a hold on top of what it already does.</div></details></div></div>
  </div></div>`;
}
function setSetting(k, v) {
  const s = S.config.settings;
  if (k === 'double_ms' || k === 'hold_ms' || k === 'group_on_level') s[k] = Number(v); else s[k] = v;
  if (k === 'double_ms') $('#dv').textContent = `${v} ms`; if (k === 'hold_ms') $('#hv').textContent = `${v} ms`;
  saveSoon();
}
function openActivity() {
  sheet.open('Recent activity', `<div id="activity">${activityHTML()}</div>`);
}
function activityHTML() {
  if (!S.activity.length) return '<div class="empty"><p>Nothing yet. Press a remote button.</p></div>';
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
  sheet.open('Light set', `<label class="field"><span>Name</span><input class="input" id="group-name" value="${esc(g.name)}"></label>${rows}<div class="spacer"></div><button class="btn danger block" data-act="group-delete" data-id="${g.id}">Delete this set</button><div class="sfoot"><button class="btn primary lg block" data-act="sheet-close">Done</button></div>`);
}
