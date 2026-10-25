// Calls and texts (#alerts): a call ringing or a text arriving on the phone shows on the lights chosen here, in a
// pattern and colour of their own, and in a person's own colour when they have one. The phone tells the hub
// (mobile/, CallsListener.java), the hub decides from these settings (hub/alerts.js), the connector plays it and puts
// the lights back (agent/alerts.py). Saved as settings.alerts; this phone's half is Android's notification access.
// Any light can show them: a Hue or Nanoleaf in colour, a Lutron dimmer or a Hue white bulb in brightness. An app
// can have a look of its own (by_app): any notification it makes shows, and its texts and calls take its colour.
import * as native from '/ui/native.js';
import { LAMP_COLOURS, colourName, sameHex } from '/ui/colour.js';

export const noTabs = true;

const PATTERNS = [['flash', 'Flash'], ['breathe', 'Breathe'], ['alternate', 'Two colours'], ['glow', 'Glow']];
const DEFAULTS = {
  call: { pattern: 'flash', color: '#4fd39a', color2: '#4c8dff' },
  text: { pattern: 'breathe', color: '#4c8dff', color2: '#a66bff' },
};

// The settings as the page shows them, defaults filled in. The first time, the office's Hue lights are chosen.
function alerts(c) {
  const s = c.S.config.settings;
  if (!s.alerts || typeof s.alerts !== 'object') s.alerts = {};
  const a = s.alerts;
  a.call = { ...DEFAULTS.call, ...(a.call || {}) };
  a.text = { ...DEFAULTS.text, ...(a.text || {}) };
  if (!Array.isArray(a.people)) a.people = [];
  if (!Array.isArray(a.lights)) a.lights = [];
  if (!Array.isArray(a.by_app)) a.by_app = [];
  if (!a.lights.length && !a.on && !c.ui.alSeeded) {
    c.ui.alSeeded = true;
    const office = c.data.areas().find(r => /office/i.test(r.name || ''));
    if (office) a.lights = showLights(c, office.id).filter(d => d.color && String(d.device_id).startsWith('hue_')).map(d => d.device_id);
  }
  return a;
}

// The lights that can show one, by room: anything that dims (Hue, Nanoleaf, a Lutron dimmer). A switch is left out,
// a Hue plug or a Lutron one alike: a relay clicked on and off for every text is worn out for nothing.
const showLights = (c, aid) => c.H.roomLights(aid).filter(d => d.domain === 'light');
function lightRooms(c) {
  return c.data.areas().map(r => ({ id: r.id, name: r.name, lights: showLights(c, r.id) })).filter(r => r.lights.length);
}
// A look by its key: "call", "text", or "app:<n>" for the nth app with one of its own
const lookOf = (a, key) => (String(key).startsWith('app:') ? a.by_app[Number(String(key).slice(4))] : a[key]);

// The phone's apps, for choosing one: lately notifying first, then all of them (native.js alertAppList)
let appList = null;

let access = null;   // this phone's notification access, once asked
function askAccess(c) {
  native.calls().then(r => { const was = access && access.access; access = r; if (was !== r.access) c.render(); });
}
let listening = false;

export function view(c) {
  const { esc, icon } = c;
  const a = alerts(c);
  if (native.isNative && !access) askAccess(c);
  if (native.isNative && !listening) {
    listening = true;
    // back from Android's settings: ask again
    document.addEventListener('visibilitychange', () => { if (!document.hidden && /^#alerts/.test(location.hash)) askAccess(c); });
  }
  const head = `<header class="hdr bar"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1 bar-t bar-pin">Calls and texts</h1>`;
  const toggle = (t, on, act, d = '') => `<div class="row"><span class="row-txt"><span class="t">${t}</span>${d ? `<span class="d">${d}</span>` : ''}</span><button class="toggle" role="switch" aria-checked="${!!on}" data-act="${act}" aria-label="${t}"></button></div>`;
  let phone = '';
  if (!native.isNative) phone = '<p class="t-body muted al-lede">Calls and texts reach the lights from the Android app.</p>';
  else if (access && !access.access) {
    phone = `<div class="group al-access">
        <button class="row" data-act="al-allow"><span class="row-txt"><span class="t">Allow notification access</span><span class="d">How this phone hears its calls and texts</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
        ${access.android >= 33 ? `<button class="row" data-act="al-appinfo"><span class="row-txt"><span class="t">Greyed out?</span><span class="d">App info, then ⋮, then Allow restricted settings</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : ''}
      </div>`;
  }
  const chosen = new Set(a.lights);
  const rooms = lightRooms(c);
  const lights = rooms.length ? rooms.map(r => `<div class="t-cap muted al-room">${esc(r.name)}</div>
      <div class="group">${r.lights.map(d => `<button class="row way ${chosen.has(d.device_id) ? 'sel' : ''}" data-act="al-light" data-id="${esc(d.device_id)}" aria-pressed="${chosen.has(d.device_id)}">
        <span class="radio ${chosen.has(d.device_id) ? 'on' : ''}">${chosen.has(d.device_id) ? icon('check', 14, 2.2) : ''}</span>
        <span class="row-txt"><span class="t">${esc(d.name)}</span>${d.color ? '' : '<span class="d">Brightness only</span>'}</span></button>`).join('')}</div>`).join('')
    : '<p class="t-cap muted al-lede">No lights that dim yet.</p>';
  return `<div class="al-page">${head}
    ${phone}
    <div class="group al-main">${toggle('Show them on the lights', a.on, 'al-on')}</div>
    <div class="t-over sec">Lights</div>
    ${lights}
    ${kindBlock(c, a, 'call', 'Calls')}
    ${kindBlock(c, a, 'text', 'Texts')}
    <div class="group">${toggle('From other messaging apps too', a.apps === 'all', 'al-apps', 'WhatsApp, Signal and the like')}</div>
    ${appsBlock(c, a)}
    ${peopleBlock(c, a)}
    <div class="t-over sec">When</div>
    <div class="group">
      ${toggle('Not during Do Not Disturb', a.dnd !== false, 'al-dnd', 'Unless that person can ring through it')}
      ${toggle('Only lights that are on', a.only_on === true, 'al-onlyon')}
    </div>
  </div>`;
}

const swatches = (c, sel, act, kind) => `<div class="al-sw" role="radiogroup">${LAMP_COLOURS.map(([n, x]) => `<button class="sw ${sameHex(x, sel) ? 'sel' : ''}" style="background:${x}" data-act="${act}" data-kind="${kind}" data-hex="${x.toLowerCase()}" role="radio" aria-checked="${sameHex(x, sel)}" aria-label="${n}"></button>`).join('')}</div>`;

// A pattern and its colours, with Try it: a call's, a text's, or an app's own
function lookBlock(c, k, key, extra = '') {
  return `<div class="al-kind" data-al="${c.esc(key)}">
      <div class="chip-wrap al-pats">${PATTERNS.map(([p, t]) => `<button class="chip sm" data-act="al-pattern" data-kind="${c.esc(key)}" data-p="${p}" aria-pressed="${k.pattern === p}">${t}</button>`).join('')}</div>
      ${swatches(c, k.color, 'al-color', key)}
      ${k.pattern === 'alternate' ? `<p class="t-cap muted al-and">and</p>${swatches(c, k.color2, 'al-color2', key)}` : ''}
      <div class="al-try"><span class="t-cap muted">${c.esc(colourName(k.color))}${k.pattern === 'alternate' ? ` and ${c.esc(colourName(k.color2))}` : ''}</span>
        <span class="al-btns">${extra}<button class="pill ghost sm" data-act="al-test" data-kind="${c.esc(key)}">Try it</button></span></div>
    </div>`;
}
const kindBlock = (c, a, kind, title) => `<div class="t-over sec">${title}</div>${lookBlock(c, a[kind], kind)}`;

const PATTERN_NAME = Object.fromEntries(PATTERNS);
function appsBlock(c, a) {
  const { esc, icon } = c;
  const open = c.ui.alApp;
  return `<div class="t-over sec">Apps</div>
    <div class="group al-apps">${a.by_app.map((r, i) => `<button class="row" data-act="al-app" data-i="${i}" aria-expanded="${open === i}">
        <span class="al-dot" style="background:${esc(r.color)}"></span><span class="row-txt"><span class="t">${esc(r.name)}</span><span class="d">${esc(PATTERN_NAME[r.pattern] || 'Flash')} · ${esc(colourName(r.color))}</span></span></button>
        ${open === i ? `<div class="al-pedit">${lookBlock(c, r, `app:${i}`, `<button class="pill ghost sm" data-act="al-aremove" data-i="${i}">Remove</button>`)}</div>` : ''}`).join('')}
      ${native.isNative ? `<button class="row" data-go="alerts/apps"><span class="row-txt"><span class="t">Add an app</span><span class="d">Everything it notifies shows, in its own colour</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`
        : a.by_app.length ? '' : '<div class="row"><span class="row-txt"><span class="d">Apps are added from the Android app</span></span></div>'}
    </div>`;
}

// ---------- choosing an app (#alerts/apps) ----------
function appRows(c) {
  const { esc } = c;
  const have = new Set(alerts(c).by_app.map(r => r.pkg));
  const q = String(c.ui.alAppQ || '').trim().toLowerCase();
  const pick = l => (l || []).filter(x => !have.has(x.pkg) && (!q || x.name.toLowerCase().includes(q)));
  const recent = pick(appList && appList.recent), seen = new Set(recent.map(x => x.pkg));
  const rest = pick(appList && appList.all).filter(x => !seen.has(x.pkg));
  const rows = l => l.map(x => `<button class="row" data-act="al-apick" data-pkg="${esc(x.pkg)}" data-name="${esc(x.name)}"><span class="row-txt"><span class="t">${esc(x.name)}</span></span></button>`).join('');
  if (!appList) return '<div class="group"><div class="row"><span class="row-txt"><span class="d">Looking</span></span></div></div>';
  return `${recent.length ? `<div class="t-over sec-s">Notified lately</div><div class="group">${rows(recent)}</div>` : ''}
    ${rest.length ? `<div class="t-over sec-s">All apps</div><div class="group">${rows(rest)}</div>` : ''}
    ${!recent.length && !rest.length ? '<p class="t-cap muted sheet-p">None found</p>' : ''}`;
}
export function sheetFor(c, r) {
  if (r.id !== 'apps') return null;
  if (!appList) native.alertAppList().then(l => { appList = l; c.render(); });
  return { parent: 'alerts', spec: { over: 'Calls and texts', title: 'Add an app', body: `
    <div class="al-appq"><input class="field" data-input="al-appq" value="${c.esc(c.ui.alAppQ || '')}" placeholder="Search" aria-label="Search apps" autocomplete="off"></div>
    <div class="al-applist">${appRows(c)}</div>` } };
}

function peopleBlock(c, a) {
  const { esc } = c;
  const open = c.ui.alPerson;
  return `<div class="t-over sec">People</div>
    <div class="group al-people">${a.people.map((p, i) => `<button class="row" data-act="al-person" data-i="${i}">
        <span class="al-dot" style="background:${esc(p.color)}"></span><span class="row-txt"><span class="t">${esc(p.name)}</span><span class="d">${esc(colourName(p.color))}</span></span></button>
        ${open === i ? `<div class="al-pedit">${swatches(c, p.color, 'al-pcolor', String(i))}<button class="pill ghost sm" data-act="al-premove" data-i="${i}">Remove</button></div>` : ''}`).join('')}
      <form class="row al-add" data-submit="al-padd"><input class="field" data-input="al-pname" value="${esc(c.ui.alName || '')}" placeholder="A name, as your contacts have it" aria-label="Name" maxlength="40" autocomplete="off">
        <button class="pill ghost sm" type="submit">Add</button></form>
    </div>`;
}

const save = c => c.save('', { quiet: true });

export const actions = {
  'al-allow'() { native.openCalls(); },
  'al-appinfo'() { native.openAppInfo(); },
  'al-on'(c) { const a = alerts(c); a.on = !a.on; save(c); },
  'al-apps'(c) { const a = alerts(c); a.apps = a.apps === 'all' ? 'sms' : 'all'; save(c); },
  'al-dnd'(c) { const a = alerts(c); a.dnd = a.dnd === false; save(c); },
  'al-onlyon'(c) { const a = alerts(c); a.only_on = !a.only_on; save(c); },
  'al-light'(c, el) {
    const a = alerts(c), id = el.dataset.id;
    a.lights = a.lights.includes(id) ? a.lights.filter(x => x !== id) : [...a.lights, id];
    save(c);
  },
  'al-pattern'(c, el) { const k = lookOf(alerts(c), el.dataset.kind); if (k) { k.pattern = el.dataset.p; save(c); } },
  'al-color'(c, el) { const k = lookOf(alerts(c), el.dataset.kind); if (k) { k.color = el.dataset.hex; save(c); } },
  'al-color2'(c, el) { const k = lookOf(alerts(c), el.dataset.kind); if (k) { k.color2 = el.dataset.hex; save(c); } },
  async 'al-test'(c, el) {
    const a = alerts(c), key = el.dataset.kind;
    const app = key.startsWith('app:') ? lookOf(a, key) : null;
    try {
      const r = await c.data.api('/api/alert', { method: 'POST', body: JSON.stringify({ kind: 'test', of: app ? 'app' : key, app: app ? app.pkg : undefined, alerts: a }) });
      if (r && r.skipped === 'no lights') c.toast('Choose a light first', { err: true });
    } catch (e) { c.toast(e.message || 'The house computer did not answer', { err: true }); }
  },
  'al-app'(c, el) { const i = Number(el.dataset.i); c.ui.alApp = c.ui.alApp === i ? null : i; c.render(); },
  'al-aremove'(c, el) { alerts(c).by_app.splice(Number(el.dataset.i), 1); c.ui.alApp = null; save(c); },
  'al-appq'(c, el, r, v) { c.ui.alAppQ = v; const l = document.querySelector('#sheet-root .al-applist'); if (l) l.innerHTML = appRows(c); },
  'al-apick'(c, el) {
    const a = alerts(c);
    const used = new Set([...a.by_app.map(x => x.color), a.call.color, a.text.color].map(x => x.toLowerCase()));
    const color = LAMP_COLOURS.map(([, x]) => x.toLowerCase()).find(x => !used.has(x)) || LAMP_COLOURS[0][1].toLowerCase();
    a.by_app.push({ pkg: el.dataset.pkg, name: el.dataset.name, pattern: 'flash', color, color2: DEFAULTS.text.color2 });
    c.ui.alApp = a.by_app.length - 1;
    c.ui.alAppQ = '';
    c.dismiss();
    save(c);
  },
  'al-person'(c, el) { const i = Number(el.dataset.i); c.ui.alPerson = c.ui.alPerson === i ? null : i; c.render(); },
  'al-pcolor'(c, el) { const p = alerts(c).people[Number(el.dataset.kind)]; if (p) { p.color = el.dataset.hex; save(c); } },
  'al-premove'(c, el) { alerts(c).people.splice(Number(el.dataset.i), 1); c.ui.alPerson = null; save(c); },
  'al-pname'(c, el, r, v) { c.ui.alName = v; },
  'al-padd'(c) {
    const name = String(c.ui.alName || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) return;
    const a = alerts(c);
    const used = new Set(a.people.map(p => p.color.toLowerCase()));
    const free = LAMP_COLOURS.map(([, x]) => x.toLowerCase()).find(x => !used.has(x) && x !== a.call.color && x !== a.text.color) || LAMP_COLOURS[0][1].toLowerCase();
    a.people.push({ name, color: free });
    c.ui.alName = '';
    c.ui.alPerson = a.people.length - 1;
    save(c);
  },
};
