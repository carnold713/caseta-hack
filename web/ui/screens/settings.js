// 11 · Settings (12732:49411). The home, the buttons, the evening, the devices, the connector, backups, and
// signing out; one grouped list, each row opening a sheet over it (#settings/<sheet>). Everything the old Settings
// reached is reachable here: Hue and Nanoleaf pairing, adding a device, hidden devices, light sets, the connector's
// updates and install line, the bridge's own notes, backup and restore, the connection, ideas, the classic app.
import { whereSheet, whereActions } from '/ui/screens/where.js';
import { nightHours, actions as routineListActions } from '/ui/screens/routines.js';
import { connSheet, connActions } from '/ui/screens/conn.js';
import { nameSheet, confirmSheet } from '/ui/screens/pickers.js';
import { ideasSheet, installSheet, nextActions } from '/ui/screens/next.js';
import { nightLamp } from '/ui/screens/nightstand.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const info = c => (c.S.agent && c.S.agent.info) || {};
const secs = v => (v ? `${v} s` : 'At once');
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* fine */ } };

function row(c, t, v, go, opts = {}) {
  const { esc, icon } = c;
  const tag = opts.act ? `data-act="${opts.act}"` : `data-go="${go}"`;
  return `<button class="row ${opts.ic ? 'has-ic' : ''} ${opts.tall ? 'tall' : ''}" ${tag}>${opts.ic ? `<span class="row-ic">${icon(opts.ic, 20, 1.4)}</span>` : ''}<span class="row-txt"><span class="t">${t}</span>${opts.d ? `<span class="d">${esc(opts.d)}</span>` : ''}</span>${v != null && v !== '' ? `<span class="row-val">${esc(v)}</span>` : ''}<span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`;
}
const toggle = (t, on, act, d = '') => `<div class="row"><span class="row-txt"><span class="t">${t}</span>${d ? `<span class="d">${d}</span>` : ''}</span><button class="toggle" role="switch" aria-checked="${!!on}" data-act="${act}" aria-label="${t}"></button></div>`;

export function view(c) {
  const { esc, icon, RT, data, DAY, EDIT } = c;
  const s = c.S.config.settings;
  const i = info(c);
  const lutron = data.devices().filter(d => !/^(hue_|nanoleaf_)/.test(String(d.device_id))).length;
  const hue = i.hue || null;
  const nl = ((i.nanoleaf || {}).devices || []);
  const conn = c.conn();
  const zone = RT.zoneName(s.timezone) || 'Not set';
  return `<div class="settings-page">
    <header class="tab-head bar">
      <h1 class="t-h1 bar-t">Settings</h1>
      <button class="hdr-btn a1" data-go="settings/connection" aria-label="Connection"><span class="conn-state ${conn}"></span>${icon('wifi', 22, 1.6)}</button>
    </header>

    <div class="t-over sec">Home</div>
    <div class="group">
      ${row(c, 'Name', s.home_name || 'Home', 'settings/name')}
      ${row(c, 'Location', s.location ? (s.location.name || 'Saved') : 'Not set', 'settings/where')}
      ${row(c, 'Time zone', zone, 'settings/timezone')}
      ${row(c, 'Rooms', plural(data.areas().length, 'room'), 'rooms')}
    </div>

    <div class="t-over sec">Buttons</div>
    <div class="group">
      ${row(c, 'When nothing is lit, power brings back', (s.power_on || 'restore') === 'all' ? 'Everything' : 'What was on', 'settings/power', { tall: true })}
      ${row(c, 'Rooms come on at', `${s.group_on_level}%`, 'settings/onlevel')}
      ${row(c, 'Fade time', secs(s.default_fade ?? 0.5), 'settings/fade')}
      ${row(c, 'Press timing', `Twice ≤ ${(s.double_ms / 1000).toFixed(2).replace(/0$/, '')} s · hold ${(s.hold_ms / 1000).toFixed(2).replace(/0$/, '')} s`, 'timing')}
    </div>

    <div class="t-over sec">Evening</div>
    <div class="group">
      ${row(c, 'House goes quiet', `${RT.fmtTime(s.night_start)} to ${RT.fmtTime(s.night_end)}`, 'settings/night')}
      ${toggle('Evening wind-down', RT.windDownOn(), 'wd-toggle')}
      ${toggle('Following lamps dim too', DAY.followBright(), 'follow-bright')}
      ${row(c, 'Night look', { auto: 'Automatic', always: 'Always', never: 'Never' }[s.night_look || 'auto'], 'settings/nightlook')}
      ${row(c, 'Night light', nightLamp(c) ? nightLamp(c).name : 'Not chosen', 'settings/nightlight')}
      ${row(c, 'Nightstand', '', 'nightstand', { d: 'A dim, warm page for the middle of the night' })}
    </div>

    <div class="t-over sec">Devices</div>
    <div class="group">
      ${row(c, 'Lutron bridge', plural(lutron, 'device'), 'settings/bridge', { ic: 'wifi' })}
      ${row(c, 'Philips Hue', hue && hue.paired ? plural(hue.lights || 0, 'light') : 'Not connected', 'settings/hue', { ic: 'bulb' })}
      ${row(c, 'Nanoleaf', nl.length ? plural(nl.length, 'controller') : 'None', 'settings/nanoleaf', { ic: 'sparkle' })}
      ${row(c, 'Add a Lutron device', '', 'add', { ic: 'plus' })}
      ${row(c, 'Light sets', data.groups().length ? plural(data.groups().length, 'set') : 'None yet', 'settings/sets', { ic: 'lamp' })}
      ${row(c, 'Hidden devices', String(EDIT.hidden().length), 'settings/hidden', { ic: 'dots' })}
    </div>

    <div class="t-over sec">Connector</div>
    <div class="group">
      ${toggle('Updates itself', s.auto_update !== false, 'auto-update', esc(`${i.version ? `v${String(i.version).replace(/^v/, '')}` : 'Version not known yet'}${i.update_available ? ` · ${i.latest} is out` : ''}`))}
      ${i.update_available ? `<button class="row" data-act="update-now"><span class="row-txt"><span class="t">Update to ${esc(i.latest)} now</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : ''}
      ${row(c, 'How your home connects', '', 'settings/how')}
    </div>

    <div class="t-over sec">Backup</div>
    <div class="group">
      ${row(c, 'Back up all settings', lsGet('backupAt') ? RT.dayRel(RT.zparts(new Date(Number(lsGet('backupAt')))).date).replace(/^./, x => x.toUpperCase()) : 'Never', '', { act: 'backup', ic: 'undo' })}
      ${row(c, 'Restore from a backup', '', 'settings/restore', { ic: 'clock' })}
    </div>

    <div class="t-over sec">This app</div>
    <div class="group">
      ${row(c, 'Recent activity', '', 'activity', { ic: 'pulse' })}
      ${row(c, 'Ideas for your home', '', 'settings/ideas', { ic: 'sparkle' })}
      ${row(c, 'Add to your home screen', '', 'settings/install', { ic: 'home' })}
      <a class="row has-ic" href="/classic/"><span class="row-ic">${icon('back', 20, 1.4)}</span><span class="row-txt"><span class="t">Open the classic app</span><span class="d">The previous design, for anything you miss</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></a>
    </div>

    <div class="group logout"><button class="row has-ic" data-act="logout"><span class="row-ic">${icon('door', 20, 1.4)}</span><span class="row-txt"><span class="t">Log out</span></span></button></div>
    <p class="set-foot">Caseta Hack${i.version ? ` · connector v${esc(String(i.version).replace(/^v/, ''))}` : ''} · ${esc(s.home_name || 'Home')}</p>
  </div>`;
}

// ---------- the sheets ----------
const radioRows = (c, list, cur, act) => `<div class="group">${list.map(([v, t, d]) => `<button class="row way ${d ? 'two' : ''} ${String(cur) === String(v) ? 'sel' : ''}" data-act="${act}" data-v="${v}"><span class="radio ${String(cur) === String(v) ? 'on' : ''}">${String(cur) === String(v) ? c.icon('check', 14, 2.2) : ''}</span><span class="row-txt"><span class="t">${t}</span>${d ? `<span class="d">${d}</span>` : ''}</span></button>`).join('')}</div>`;
function zoneRow(c, z) {
  const s = c.S.config.settings; const on = s.timezone === z;
  return `<button class="row way two ${on ? 'sel' : ''}" data-act="set-tz" data-v="${c.esc(z)}"><span class="radio ${on ? 'on' : ''}">${on ? c.icon('check', 14, 2.2) : ''}</span><span class="row-txt"><span class="t">${c.esc(c.RT.zoneName(z))}</span><span class="d">${c.esc(z)}${z === c.RT.phoneTZ() ? ' · this phone' : ''}</span></span></button>`;
}
function zoneList(c) {
  const q = (c.ui.tzQ || '').trim().toLowerCase(); if (!q) return '';
  let all = []; try { all = Intl.supportedValuesOf('timeZone'); } catch (_) { all = []; }
  const found = all.filter(z => z.toLowerCase().includes(q) || c.RT.zoneName(z).toLowerCase().includes(q)).slice(0, 30);
  return found.length ? `<div class="group">${found.map(z => zoneRow(c, z)).join('')}</div>` : '<p class="t-cap muted sheet-p">No time zone by that name.</p>';
}
const SHEETS = {
  name: c => nameSheet(c, { over: 'Home', title: 'Name', value: c.S.config.settings.home_name || '', act: 'set-name' }),
  where: c => whereSheet(c),
  timezone(c) {
    const s = c.S.config.settings; const RT = c.RT;
    const phone = RT.phoneTZ();
    return { over: 'Home', title: 'Time zone', body: `<p class="t-cap muted sheet-p">Routines, the wind-down and Follow the day run on the home's clock.</p>
      <div class="group">${[...new Set([s.timezone, phone].filter(Boolean))].map(z => zoneRow(c, z)).join('')}</div>
      <div class="name-form"><input class="field" data-input="tz-q" placeholder="Find another" value="${c.esc(c.ui.tzQ || '')}" aria-label="Find a time zone"></div>
      <div class="tz-list">${zoneList(c)}</div>` };
  },
  power: c => ({ over: 'Buttons', title: 'When nothing is lit', body: `<p class="t-cap muted sheet-p">What the power button, All on and a remote's On bring back when every light is off.</p>${radioRows(c, [['restore', 'What was on before', 'The lights that were on, at the same levels'], ['all', 'Everything', 'Every light at its usual level']], c.S.config.settings.power_on || 'restore', 'set-power')}` }),
  onlevel: c => ({ over: 'Buttons', title: 'Rooms come on at', body: `<p class="t-cap muted sheet-p">What a light comes on at when a button or a room just says on.</p><div class="chip-wrap">${[100, 90, 80, 70, 60, 50].map(v => `<button class="chip" aria-pressed="${c.S.config.settings.group_on_level === v}" data-act="set-onlevel" data-v="${v}">${v}%</button>`).join('')}</div>` }),
  fade: c => ({ over: 'Buttons', title: 'Fade time', body: `<p class="t-cap muted sheet-p">How long a light takes to reach a new level when nothing else says.</p><div class="chip-wrap">${[0, 0.5, 1, 2, 3, 5].map(v => `<button class="chip" aria-pressed="${(c.S.config.settings.default_fade ?? 0.5) === v}" data-act="set-fade" data-v="${v}">${v ? `${v} s` : 'At once'}</button>`).join('')}</div>` }),
  night: c => nightHours(c),
  nightlook: c => ({ over: 'Evening', title: 'Night look', body: `<p class="t-cap muted sheet-p">The app dims and warms like a room lit by lamps.</p>${radioRows(c, [['auto', 'Automatic', 'In the night hours'], ['always', 'Always', ''], ['never', 'Never', '']], c.S.config.settings.night_look || 'auto', 'set-nightlook')}` }),
  // 19 · the light Nightstand's held thumb brings up to 10%. Unchosen, a lamp in a bedroom.
  nightlight(c) {
    const { esc, data } = c;
    const cur = nightLamp(c);
    const lights = data.controllable().filter(d => d.domain === 'light');
    return { over: 'Evening', title: 'Night light', body: `<p class="t-cap muted sheet-p">On the Nightstand page a resting thumb brings it up to 10%, as warm as it goes, and it goes out by itself after 15 minutes.</p>${lights.length ? radioRows(c, lights.map(d => [esc(d.device_id), esc(d.name), esc(data.devAreaName(d))]), cur ? cur.device_id : '', 'set-nightlight') : '<p class="t-body muted sheet-p">No dimmable lights yet.</p>'}` };
  },
  connection: c => connSheet(c),
  bridge(c) {
    const i = info(c); const h = i.health || null;
    const facts = h ? [h.bridge_ok ? `${plural(h.buttons || 0, 'button')} on the bridge` : 'the bridge is not answering', plural(h.bindings || 0, 'button setting'), h.uptime_s ? `connector running ${Math.round(h.uptime_s / 3600)} h` : ''].filter(Boolean).join(' · ') : '';
    return { over: 'Devices', title: 'Lutron bridge', body: `<div class="group">
        <div class="row"><span class="row-txt"><span class="t">${c.S.agent.online ? 'Connected' : 'Not connected'}</span><span class="d">${c.esc([(i.bridge || {}).host ? `bridge at ${i.bridge.host}` : '', facts].filter(Boolean).join(' · '))}</span></span></div>
        <button class="row" data-act="refresh"><span class="row-txt"><span class="t">Look for new lights</span><span class="d">Asks the bridge for everything it has again</span></span></button>
        <button class="row" data-go="settings/connection"><span class="row-txt"><span class="t">Connection and the remotes</span></span><span class="row-chev">${c.icon('chev', 16, 1.8)}</span></button>
        <button class="row" data-go="add"><span class="row-txt"><span class="t">Add a Lutron device</span><span class="d">Without the Lutron app</span></span><span class="row-chev">${c.icon('chev', 16, 1.8)}</span></button>
      </div>` };
  },
  hue(c) {
    const h = c.ui.hue || (c.ui.hue = { step: (info(c).hue || {}).paired ? 'connected' : 'find', bridges: [], host: '', busy: false, error: null, manual: false, looked: false });
    const i = info(c).hue || {};
    const { esc, icon } = c;
    if (h.step === 'connected' && i.paired) {
      const rooms = Object.values(c.S.inv.areas || {}).filter(a => String(a.id).startsWith('hue_')).map(a => a.name);
      return { over: 'Devices', title: 'Philips Hue', body: `<div class="group"><div class="row"><span class="row-txt"><span class="t">${plural(i.lights || 0, 'light')} in ${plural(i.rooms || 0, 'room')}</span><span class="d">${esc(`Connected · ${i.host || ''}${i.live ? ' · live' : ''}${i.error ? ` · ${i.error}` : ''}`)}</span></span></div></div>
        ${rooms.length ? `<p class="t-cap muted sheet-p">Rooms: ${esc(rooms.join(', '))}</p>` : ''}
        <p class="t-cap muted sheet-p">Hue's own scenes stay in the Hue app; scenes made here can mix Hue and Caséta lights.</p>
        <div class="group"><button class="row" data-act="hue-forget"><span class="row-txt"><span class="t">Forget this bridge</span><span class="d">Its lights leave the app. The Hue app is not affected.</span></span></button></div>` };
    }
    if (h.step === 'press') return { over: 'Philips Hue', title: 'Press the button', body: `<p class="t-body muted sheet-p">Press the round button on top of the Hue bridge at ${esc(h.host)}, then tap Connect. You have about half a minute.</p>
      ${h.error ? `<div class="note warn">${icon('info', 20, 1.4)}<p>${esc(h.error)} Press the button again and tap Connect right after.</p></div>` : ''}
      <div class="sheet-btns"><button class="pill solid" data-act="hue-pair" ${h.busy ? 'disabled' : ''}>${h.busy ? 'Waiting for the button…' : 'Connect'}</button><button class="pill ghost" data-act="hue-back">Back</button></div>` };
    const list = h.bridges.map(b => `<button class="row" data-act="hue-pick" data-host="${esc(b.host)}"><span class="row-txt"><span class="t">${esc(b.name || 'Hue bridge')}</span><span class="d">${esc(b.host)}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`).join('');
    return { over: 'Devices', title: 'Connect a Hue bridge', body: `<p class="t-cap muted sheet-p">Its lights and rooms join this app, and a remote button can control them.</p>
      ${h.busy ? '<p class="t-body sheet-p">Looking for your Hue bridge…</p>' : ''}
      ${h.error ? `<div class="note warn">${icon('info', 20, 1.4)}<p>${esc(h.error)}</p></div>` : ''}
      ${list ? `<div class="group">${list}</div>` : !h.busy && h.looked ? '<p class="t-body muted sheet-p">No Hue bridge answered. Is it plugged in, on the same network as the connector?</p>' : ''}
      ${h.manual ? `<div class="name-form"><input class="field" data-input="hue-host" inputmode="decimal" placeholder="192.168.1.20" value="${esc(h.host)}" aria-label="The bridge's address"><button class="pill solid" data-act="hue-manual">Use</button></div><p class="t-cap muted sheet-p">The Hue app shows it under Settings, Bridges.</p>` : ''}
      <div class="sheet-btns"><button class="pill ghost" data-act="hue-discover">${h.looked ? 'Look again' : 'Look for it'}</button>${h.manual ? '' : '<button class="pill ghost" data-act="hue-manual-show">Type its address</button>'}</div>` };
  },
  nanoleaf(c) {
    const n = c.ui.nl || (c.ui.nl = { step: 'list', devices: [], host: '', busy: false, error: null, manual: false, looked: false });
    const { esc, icon } = c;
    const paired = (info(c).nanoleaf || {}).devices || [];
    if (n.step === 'press') return { over: 'Nanoleaf', title: 'Hold the power button', body: `<p class="t-body muted sheet-p">Hold the power button on the controller at ${esc(n.host)} for 5 to 7 seconds, until its panels flash, then tap Connect.</p>
      ${n.error ? `<div class="note warn">${icon('info', 20, 1.4)}<p>${esc(n.error)} Hold the button again and tap Connect right after.</p></div>` : ''}
      <div class="sheet-btns"><button class="pill solid" data-act="nl-pair" ${n.busy ? 'disabled' : ''}>${n.busy ? 'Waiting for the panels…' : 'Connect'}</button><button class="pill ghost" data-act="nl-back">Back</button></div>` };
    const found = n.devices.map(d => `<button class="row" data-act="nl-pick" data-host="${esc(d.host)}"><span class="row-txt"><span class="t">${esc(d.name || 'Nanoleaf')}</span><span class="d">${esc(d.host)}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`).join('');
    return { over: 'Devices', title: 'Nanoleaf', body: `${paired.length ? `<div class="group">${paired.map(d => `<div class="row"><span class="row-txt"><span class="t">${esc(d.name || 'Nanoleaf')}</span><span class="d">${esc(`${d.model || 'Light panels'} · ${d.host}${d.error ? ' · not reachable right now' : ''}`)}</span></span><button class="link blue" data-act="nl-forget" data-serial="${esc(d.serial)}">Forget</button></div>`).join('')}</div>` : ''}
      <p class="t-cap muted sheet-p">Each controller pairs on its own. Its panels join this app as a light.</p>
      ${n.busy ? '<p class="t-body sheet-p">Looking for your Nanoleaf…</p>' : ''}
      ${n.error ? `<div class="note warn">${icon('info', 20, 1.4)}<p>${esc(n.error)}</p></div>` : ''}
      ${found ? `<div class="group">${found}</div>` : !n.busy && n.looked ? '<p class="t-body muted sheet-p">No Nanoleaf answered. Is it on, on the same network as the connector?</p>' : ''}
      ${n.manual ? `<div class="name-form"><input class="field" data-input="nl-host" inputmode="decimal" placeholder="192.168.1.44" value="${esc(n.host)}" aria-label="Its address"><button class="pill solid" data-act="nl-manual">Use</button></div>` : ''}
      <div class="sheet-btns"><button class="pill ghost" data-act="nl-discover">${paired.length ? 'Connect another' : 'Look for one'}</button>${n.manual ? '' : '<button class="pill ghost" data-act="nl-manual-show">Type its address</button>'}</div>` };
  },
  hidden(c) {
    const ids = c.EDIT.hidden();
    return { over: 'Devices', title: 'Hidden devices', body: `<p class="t-cap muted sheet-p">A device you removed stays off every list even if your bridge goes on reporting it. Tap one to bring it back.</p>
      <div class="group">${ids.map(id => { const d = (c.S.inv.devices || {})[id]; return `<button class="row" data-act="unhide" data-id="${c.esc(id)}"><span class="row-txt"><span class="t">${c.esc(d ? d.name : 'A device the bridge still lists')}</span><span class="d">${c.esc(d ? `${d.domain === 'pico' ? 'Remote' : 'Light'}${d.type ? ` · ${d.type}` : ''}` : `id ${id}`)}</span></span><span class="row-val">Bring back</span></button>`; }).join('') || '<div class="row"><span class="row-txt"><span class="d">None hidden.</span></span></div>'}</div>` };
  },
  sets(c) {
    const { esc, icon, data } = c;
    const open = c.ui.setOpen && data.groups().find(g => g.id === c.ui.setOpen);
    if (open) {
      const lights = data.controllable().filter(d => d.domain !== 'cover');
      return { over: 'Light set', title: open.name, body: `<div class="name-form"><input class="field" data-input="set-rename" value="${esc(open.name)}" maxlength="40" aria-label="Name"></div>
        ${data.areas().map(a => { const ds = lights.filter(d => data.devArea(d) === a.id); return ds.length ? `<div class="t-over sec-s">${esc(a.name)}</div><div class="group">${ds.map(d => { const on = open.device_ids.includes(d.device_id); return `<button class="row ck" data-act="set-light" data-id="${esc(d.device_id)}" aria-pressed="${on}"><span class="row-txt"><span class="t">${esc(d.name)}</span></span><span class="box ${on ? 'on' : ''}">${on ? icon('check', 14, 2.2) : ''}</span></button>`; }).join('')}</div>` : ''; }).join('')}
        <div class="sheet-btns"><button class="pill ghost" data-act="set-done">Done</button><button class="pill ghost" data-act="set-delete">Delete this set</button></div>` };
    }
    return { over: 'Devices', title: 'Light sets', body: `<p class="t-cap muted sheet-p">A hand-picked mix of lights, like Downstairs path, for a button or a routine to control.</p>
      <div class="group">${data.groups().map(g => `<button class="row" data-act="set-open" data-id="${esc(g.id)}"><span class="row-txt"><span class="t">${esc(g.name)}</span></span><span class="row-val">${plural(g.device_ids.length, 'light')}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`).join('')}
        <button class="row" data-act="set-new"><span class="row-txt"><span class="t">New set</span></span>${icon('plus', 18, 1.7)}</button></div>` };
  },
  how(c) {
    const line = `curl -fsSL "${location.origin}/install.sh?token=${c.S.token}" | sh`;
    return { over: 'Connector', title: 'How your home connects', body: `<div class="how">
      <p class="t-body muted sheet-p">A small helper program on a computer in your house links this app to your Lutron bridge: a Mac, a Raspberry Pi, a NAS, an old laptop that stays on.</p>
      <p class="t-body sheet-p">On that computer, open the Terminal app, paste this line and press Enter:</p>
      <div class="code"><code>${c.esc(line)}</code><button class="pill ghost sm" data-act="copy" data-text="${c.esc(line)}">Copy</button></div>
      <p class="t-body muted sheet-p">When it asks, press the small black button on the back of your Lutron bridge. The moment it connects, your rooms appear. It starts again by itself after a restart.</p></div>` };
  },
  restore: c => ({ over: 'Backup', title: 'Restore from a backup', body: `<p class="t-cap muted sheet-p">Paste the settings a backup copied, or pick the file one saved. Everything is replaced, and Undo puts it back.</p>
    <div class="restore"><textarea class="field" data-input="restore-text" rows="6" placeholder="Paste here" aria-label="Backup">${c.esc(c.ui.restoreText || '')}</textarea></div>
    <div class="sheet-btns"><button class="pill solid" data-act="restore-go">Restore</button><label class="pill ghost">Pick a file<input type="file" accept="application/json,.json" data-change="restore-file" hidden></label></div>` }),
  logout: c => ({ over: 'This phone', title: 'Log out?', body: `<p class="t-body muted sheet-p">This phone forgets the password. Your home, its remotes and its routines keep running.</p>
    <div class="sheet-btns"><button class="pill solid" data-act="logout-go">Log out</button><button class="pill ghost" data-act="sheet-close">Keep me in</button></div>` }),
  ideas: c => ideasSheet(c),
  install: c => installSheet(c),
};
export function sheetFor(c, r) {
  const make = r.id && SHEETS[r.id];
  return make ? { spec: make(c, r), parent: 'settings' } : null;
}

// ---------- taps ----------
async function hueCall(c, body) { return c.data.api('/api/hue', { method: 'POST', body: JSON.stringify(body) }); }
async function nlCall(c, body) { return c.data.api('/api/nanoleaf', { method: 'POST', body: JSON.stringify(body) }); }
function download(name, text) {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } catch (_) { /* the clipboard has it */ }
}
function restore(c, text) {
  let cfg;
  try { cfg = JSON.parse(text); } catch (_) { c.toast('That is not a settings backup', { err: true }); return; }
  if (!cfg || typeof cfg !== 'object' || !cfg.settings) { c.toast('That is not a settings backup', { err: true }); return; }
  c.S.config = cfg; c.ui.restoreText = '';
  c.closeSheet(); history.replaceState(null, '', '#settings');
  // the whole configuration replaced: like a deletion, nothing on the page brings the old one back, so it keeps Undo
  c.save('Settings restored', { keepUndo: true });
}

export const actions = {
  ...whereActions,
  ...connActions,
  ...nextActions,
  'wd-toggle': routineListActions['wd-toggle'],
  'night-set': routineListActions['night-set'],
  'set-name'(c, form, r, v) { c.S.config.settings.home_name = String(v).trim().slice(0, 40); c.saveSoon(); },
  'tz-q'(c, el, r, v) { c.ui.tzQ = v; const l = document.querySelector('#sheet-root .tz-list'); if (l) l.innerHTML = zoneList(c); },
  'set-tz'(c, el) { c.S.config.settings.timezone = el.dataset.v; c.save(`The home's clock is ${c.RT.zoneName(el.dataset.v)} time`); },
  'set-power'(c, el) { c.S.config.settings.power_on = el.dataset.v; c.save(el.dataset.v === 'all' ? 'Power brings back everything' : 'Power brings back what was on'); },
  'set-onlevel'(c, el) { c.S.config.settings.group_on_level = Number(el.dataset.v); c.save(`Rooms come on at ${el.dataset.v}%`); },
  'set-fade'(c, el) { c.S.config.settings.default_fade = Number(el.dataset.v); c.save(`Fade time ${Number(el.dataset.v) ? `${el.dataset.v} s` : 'none'}`); },
  'set-nightlight'(c, el) { const d = c.data.dev(el.dataset.v); if (!d) return; c.S.config.settings.night_light = d.device_id; c.save(`Night light: ${d.name}`); },
  'set-nightlook'(c, el) { c.S.config.settings.night_look = el.dataset.v; c.save(`Night look: ${{ auto: 'automatic', always: 'always', never: 'never' }[el.dataset.v]}`); },
  'follow-bright'(c) { c.DAY.setFollowBrightness(!c.DAY.followBright()); c.save(c.DAY.followBright() ? 'Following lamps dim in the evening too' : 'Following lamps keep their brightness'); },
  'auto-update'(c) { const s = c.S.config.settings; s.auto_update = s.auto_update === false; c.save(s.auto_update ? 'The connector updates itself' : 'Updates are up to you'); },
  async 'update-now'(c) { try { await c.data.api('/api/update-connector', { method: 'POST' }); c.toast('Updating the connector. It is back in a minute.'); } catch (e) { c.toast(e.message, { err: true }); } },
  async refresh(c) { try { await c.data.api('/api/refresh', { method: 'POST' }); c.toast('Asked the bridge for everything again'); } catch (e) { c.toast(e.message, { err: true }); } },
  async copy(c, el) { try { await navigator.clipboard.writeText(el.dataset.text); c.toast('Copied'); } catch (_) { c.toast('Copying is blocked here. Press and hold the line to copy it.', { err: true }); } },
  async backup(c) {
    const text = JSON.stringify(c.S.config, null, 2);
    const stamp = new Date().toISOString().slice(0, 10);
    download(`caseta-settings-${stamp}.json`, text);
    let copied = false; try { await navigator.clipboard.writeText(text); copied = true; } catch (_) { /* the file has it */ }
    lsSet('backupAt', String(Date.now()));
    c.toast(copied ? 'Settings saved to a file and copied' : 'Settings saved to a file');
    c.render();
  },
  'restore-text'(c, el, r, v) { c.ui.restoreText = v; },
  'restore-go'(c) { restore(c, c.ui.restoreText || ''); },
  'restore-file'(c, el) { const f = el.files && el.files[0]; if (!f) return; f.text().then(t => restore(c, t)); },
  unhide(c, el) {
    const id = el.dataset.id; const d = (c.S.inv.devices || {})[id];
    c.EDIT.unhideDevice(id);
    c.save(`${d ? d.name : 'The device'} is back`);
  },
  'set-open'(c, el) { c.ui.setOpen = el.dataset.id; c.render(); },
  'set-done'(c) { c.ui.setOpen = null; c.render(); },
  'set-new'(c) {
    const taken = new Set(c.data.groups().map(g => g.name));
    let name = 'New set', i = 2; while (taken.has(name)) name = `New set ${i++}`;
    const g = { id: Math.random().toString(36).slice(2, 10), name, device_ids: [], on_level: null };
    c.S.config.groups = [...c.data.groups(), g];
    c.ui.setOpen = g.id;
    c.render();
  },
  'set-rename'(c, el, r, v) { const g = c.data.groups().find(x => x.id === c.ui.setOpen); if (!g || !String(v).trim()) return; g.name = String(v).trim().slice(0, 40); c.saveSoon(); },
  'set-light'(c, el) {
    const g = c.data.groups().find(x => x.id === c.ui.setOpen); if (!g) return;
    const id = el.dataset.id;
    g.device_ids = g.device_ids.includes(id) ? g.device_ids.filter(x => x !== id) : [...g.device_ids, id];
    c.save('', { quiet: true });
  },
  'set-delete'(c) {
    const g = c.data.groups().find(x => x.id === c.ui.setOpen); if (!g) return;
    c.openPicker('delete', () => confirmSheet(c, { over: g.name, title: 'Delete this set?', act: 'set-delete-go', yes: 'Delete', text: 'Buttons and routines that control it stop controlling those lights. The lights themselves are not touched.' }));
  },
  'set-delete-go'(c) {
    const id = c.ui.setOpen;
    c.S.config.groups = c.data.groups().filter(g => g.id !== id);
    c.ui.setOpen = null; c.closePicker();
    c.save('Light set deleted', { keepUndo: true });
  },
  // Hue
  async 'hue-discover'(c) {
    const h = c.ui.hue; if (!h) return;
    Object.assign(h, { busy: true, error: null, bridges: [], looked: true }); c.render();
    try { const r = await hueCall(c, { op: 'discover' }); h.bridges = (r.detail && r.detail.bridges) || []; } catch (e) { h.error = e.message; }
    h.busy = false; c.render();
  },
  'hue-manual-show'(c) { c.ui.hue.manual = true; c.render(); },
  'hue-host'(c, el, r, v) { c.ui.hue.host = v; },
  'hue-manual'(c) { const h = c.ui.hue; if (!String(h.host || '').trim()) { c.toast('Type the address first', { err: true }); return; } h.host = h.host.trim(); h.step = 'press'; h.error = null; c.render(); },
  'hue-pick'(c, el) { const h = c.ui.hue; h.host = el.dataset.host; h.step = 'press'; h.error = null; c.render(); },
  'hue-back'(c) { const h = c.ui.hue; h.step = 'find'; h.error = null; c.render(); },
  async 'hue-pair'(c) {
    const h = c.ui.hue; if (h.busy) return;
    h.busy = true; h.error = null; c.render();
    try { await hueCall(c, { op: 'pair', host: h.host }); h.busy = false; h.step = 'connected'; c.toast('Hue bridge connected'); }
    catch (e) { h.busy = false; h.error = e.message; }
    c.render();
  },
  async 'hue-forget'(c, el) {
    el.disabled = true;
    try { await hueCall(c, { op: 'forget' }); c.ui.hue = null; c.closeSheet(); history.replaceState(null, '', '#settings'); c.toast('Hue bridge forgotten'); c.render(); }
    catch (e) { el.disabled = false; c.toast(e.message, { err: true }); }
  },
  // Nanoleaf
  async 'nl-discover'(c) {
    const n = c.ui.nl; if (!n) return;
    Object.assign(n, { busy: true, error: null, devices: [], looked: true }); c.render();
    try { const r = await nlCall(c, { op: 'discover' }); n.devices = (r.detail && r.detail.devices) || []; } catch (e) { n.error = e.message; }
    n.busy = false; c.render();
  },
  'nl-manual-show'(c) { c.ui.nl.manual = true; c.render(); },
  'nl-host'(c, el, r, v) { c.ui.nl.host = v; },
  'nl-manual'(c) { const n = c.ui.nl; if (!String(n.host || '').trim()) { c.toast('Type the address first', { err: true }); return; } n.host = n.host.trim(); n.step = 'press'; n.error = null; c.render(); },
  'nl-pick'(c, el) { const n = c.ui.nl; n.host = el.dataset.host; n.step = 'press'; n.error = null; c.render(); },
  'nl-back'(c) { const n = c.ui.nl; n.step = 'list'; n.error = null; c.render(); },
  async 'nl-pair'(c) {
    const n = c.ui.nl; if (n.busy) return;
    n.busy = true; n.error = null; c.render();
    try { await nlCall(c, { op: 'pair', host: n.host }); c.ui.nl = null; c.toast('Nanoleaf connected'); }
    catch (e) { n.busy = false; n.error = e.message; }
    c.render();
  },
  async 'nl-forget'(c, el) {
    el.disabled = true;
    try { await nlCall(c, { op: 'forget', serial: el.dataset.serial }); c.toast('Nanoleaf forgotten'); c.render(); }
    catch (e) { el.disabled = false; c.toast(e.message, { err: true }); }
  },
  logout(c) { c.go('settings/logout'); },
  'logout-go'(c) { try { localStorage.removeItem('token'); } catch (_) { /* fine */ } c.S.token = ''; c.closeSheet(); if (c.S.ws) { try { c.S.ws.onclose = null; c.S.ws.close(); } catch (_) { /* gone */ } } c.render(); },
};
