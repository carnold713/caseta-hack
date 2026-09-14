/* Settings: connection and setup, night hours, advanced. */
'use strict';

VIEWS.settings = {
  top() { return `<div><h1>Settings</h1></div>${connPill()}`; },
  body() {
    const s = S.config.settings; const info = S.agent.info || {};
    const nd = controllable().length, np = remotes().length;
    const everConnected = devices().length > 0;
    const groupsList = groups();
    return `
    <div class="h2">Home connection</div>
    <div class="card enter">
      <div class="row"><div class="ic ${S.agent.online ? 'green' : 'rose'} round">${ICON('link')}</div><div class="grow"><div style="font-weight:700">${S.agent.online ? 'Connected to your home' : everConnected ? 'Not connected right now' : 'Not connected yet'}</div><div class="muted small">${S.agent.online ? `${plural(nd, 'light')} · ${plural(np, 'remote')}${(info.bridge || {}).host ? ` · bridge at ${esc(info.bridge.host)}` : ''}` : everConnected ? `Last seen with ${plural(nd, 'light')} and ${plural(np, 'remote')}` : 'Follow the steps below'}</div></div></div>
      ${S.agent.online ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="refresh">${ICON('refresh', 'sm')} Look for new lights</button></div><p class="faint tiny" style="margin:8px 0 0">Added or renamed something in the Lutron app? Look again to pick it up.</p>` : ''}
      ${!S.agent.online ? `<details class="more" ${everConnected ? 'open' : ''}><summary>${ICON('chev', 'sm')}What to check</summary><div class="muted small"><ol style="padding-left:18px;margin:0"><li>Is the computer running the connector on and awake?</li><li>Is it on the same Wi-Fi as your Lutron bridge?</li><li>Is the internet working there?</li></ol><p style="margin:8px 0 0">Your remotes keep working from their last saved settings while disconnected.</p></div></details>` : ''}
    </div>
    ${setupSteps(everConnected)}
    <div class="h2">Night-time</div>
    <div class="card enter">
      <p class="muted small" style="margin:0 0 6px">Buttons can do something different at night, like turning on dim instead of bright.</p>
      <div class="row"><label class="field grow"><span>Night starts</span><input class="input" type="time" value="${s.night_start}" data-setting="night_start"></label><label class="field grow"><span>Night ends</span><input class="input" type="time" value="${s.night_end}" data-setting="night_end"></label></div>
    </div>
    <div class="h2">This app</div>
    <div class="card pad0 list enter">
      <div class="item"><div class="ic">${ICON('house', 'sm')}</div><div class="grow"><div class="t">Home name</div></div><input class="input" style="width:150px" value="${esc(s.home_name)}" placeholder="Home" data-setting="home_name"></div>
      <button class="item" data-act="install-help"><div class="ic">${ICON('remote', 'sm')}</div><div class="grow"><div class="t">Add to your phone's home screen</div><div class="d">Opens full-screen like a real app</div></div>${ICON('chev', 'sm')}</button>
      <button class="item" data-act="activity"><div class="ic">${ICON('history', 'sm')}</div><div class="grow"><div class="t">Recent activity</div><div class="d">What was pressed, and what happened</div></div>${ICON('chev', 'sm')}</button>
    </div>
    <details class="more enter" style="margin-top:22px"><summary>${ICON('chev', 'sm')}Advanced</summary><div>
      <div class="card">
        <div style="font-weight:600;margin-bottom:4px">Timing</div>
        <label class="field"><span>How fast is a double press? <b id="dv">${s.double_ms} ms</b></span><input class="slider thin" type="range" min="200" max="800" step="10" value="${s.double_ms}" style="--p:${(s.double_ms - 200) / 6}%" data-setting="double_ms"><div class="row between tiny faint" style="justify-content:space-between"><span>Quick</span><span>Relaxed</span></div></label>
        <label class="field"><span>How long is a hold? <b id="hv">${s.hold_ms} ms</b></span><input class="slider thin" type="range" min="300" max="1500" step="10" value="${s.hold_ms}" style="--p:${(s.hold_ms - 300) / 12}%" data-setting="hold_ms"><div class="row tiny faint" style="justify-content:space-between"><span>Short</span><span>Long</span></div></label>
        <div class="banner" style="margin:6px 0 0" id="tester">Press a button on any remote to test the timing.</div>
        <label class="field"><span>Default brightness for "on" (%)</span><input class="input" type="number" min="1" max="100" value="${s.group_on_level}" data-setting="group_on_level"></label>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="row"><div style="font-weight:600" class="grow">Light sets</div><button class="btn sm" data-act="group-new">${ICON('plus', 'sm')} New set</button></div>
        <p class="muted small" style="margin:4px 0 8px">Rooms come from the Lutron app automatically. A set is for a hand-picked mix, like "Downstairs path".</p>
        ${groupsList.length ? `<div class="list">${groupsList.map(g => `<button class="item" data-act="group-edit" data-id="${g.id}" style="padding-left:0;padding-right:0"><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${g.device_ids.length} lights</div></div>${ICON('chev', 'sm')}</button>`).join('')}</div>` : ''}
      </div>
      <div class="card" style="margin-top:10px"><div class="row wrap"><button class="btn sm" data-act="backup">${ICON('copy', 'sm')} Back up settings</button><button class="btn sm" data-act="restore">Restore settings…</button></div></div>
      <div class="card" style="margin-top:10px"><button class="btn ghost danger block" data-act="logout">Sign out</button></div>
    </div></details>`;
  },
};

function setupSteps(everConnected) {
  const online = S.agent.online;
  const line = `curl -fsSL "${location.origin}/install.sh?token=${S.token}" | sh`;
  return `<div class="card enter" style="margin-top:10px"><div style="font-weight:700;margin-bottom:4px">Set up</div><div class="steps">
    <div class="step done"><div class="num"></div><div class="grow"><div class="t">Sign in</div></div></div>
    <div class="step ${online || everConnected ? 'done' : ''}"><div class="num"></div><div class="grow"><div class="t">Connect your home</div><div class="d">A small helper program runs on a computer in your house so this app can reach the Lutron bridge. It takes about ten minutes.</div>
      <details class="more"><summary>${ICON('chev', 'sm')}Show me how</summary><div class="small muted">
        <p style="margin:0 0 8px"><b style="color:var(--text)">1.</b> Pick a computer that stays on and is on your home Wi-Fi: a Mac, a Raspberry Pi, a NAS, an old laptop.</p>
        <p style="margin:0 0 4px"><b style="color:var(--text)">2.</b> Open the Terminal app on it, paste this line, press Enter:</p>
        <div class="code"><code>${esc(line)}</code><button class="iconbtn" style="width:32px;height:32px" data-act="copy" data-text="${esc(line)}">${ICON('copy', 'sm')}</button></div>
        <p style="margin:8px 0"><b style="color:var(--text)">3.</b> When it asks, press the small black button on the back of your Lutron bridge.</p>
        <p style="margin:0">That's it. The moment it connects, this page turns green and your rooms appear. It starts again by itself after a restart.</p>
      </div></details></div></div>
    <div class="step"><div class="num"></div><div class="grow"><div class="t">Take over a remote <span class="faint">(optional)</span></div><div class="d">Your remotes still do what the Lutron app told them, as well as what you set here.</div>
      <details class="more"><summary>${ICON('chev', 'sm')}Show me how</summary><div class="small muted">Open the Lutron app, tap the remote, and remove the lights it controls. Keep it paired to the bridge. From then on only your settings run. Skip this if you just want to add a double press or a hold on top of what it already does.</div></details></div></div>
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
    return `<div class="item"><div class="ic">${ICON(ic, 'sm')}</div><div class="grow"><div class="t" style="font-weight:500">${esc(t)}</div><div class="d">${esc(d)}</div></div><div class="val">${when}</div></div>`;
  }).join('')}</div>`;
}
function paintActivity() { const el = $('#activity'); if (el) el.innerHTML = activityHTML(); }
function openInstallHelp() {
  sheet.open('Add to your home screen', `<div class="stack small muted">
    <div class="card"><b style="color:var(--text)">Android (Chrome)</b><br>Tap the ⋮ menu, then <b style="color:var(--text)">Add to Home screen</b>. Tap Install if it offers.</div>
    <div class="card"><b style="color:var(--text)">iPhone (Safari)</b><br>Tap the share button, then <b style="color:var(--text)">Add to Home Screen</b>.</div>
    <p>It then opens full-screen with its own icon, and works from anywhere, not just at home.</p></div>`);
}
function openGroupEditor(id) {
  let g = groups().find(x => x.id === id);
  if (!g) { g = { id: uid(), name: 'New set', device_ids: [], on_level: null }; S.config.groups.push(g); }
  S.groupEdit = g.id;
  const rows = areas().map(a => { const ds = controllable().filter(d => (d.area || 'none') === a.id && d.domain !== 'cover'); if (!ds.length) return ''; return `<div class="h2">${esc(a.name)}</div><div class="card pad0 list">${ds.map(d => `<label class="item"><input type="checkbox" style="width:22px;height:22px;accent-color:var(--amber)" ${g.device_ids.includes(d.device_id) ? 'checked' : ''} data-act="group-inc" data-id="${d.device_id}"><div class="grow"><div class="t">${esc(d.name)}</div></div></label>`).join('')}</div>`; }).join('');
  sheet.open('Light set', `<label class="field"><span>Name</span><input class="input" id="group-name" value="${esc(g.name)}"></label>${rows}<div class="spacer"></div><button class="btn primary block" data-act="sheet-close">Done</button><div class="spacer"></div><button class="btn ghost danger block" data-act="group-delete" data-id="${g.id}">Delete this set</button>`);
}
