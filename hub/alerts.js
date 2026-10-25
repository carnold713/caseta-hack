'use strict';
// Calls and texts on the lights. The Android app (mobile/, CallsListener.java) posts to /api/alert when a call starts
// ringing, stops ringing, or a text arrives; this decides, from settings.alerts, whether the lights show it and how,
// and the connector plays it (agent/alerts.py). Only the sender's name ever reaches the hub, never what a text says,
// and it is used here to pick a colour and then forgotten.
//
// settings.alerts:
//   on        whether calls and texts show on the lights at all
//   lights    the lights that show them (device ids)
//   call      {pattern, color, color2}: pattern flash | breathe | alternate | glow; color2 is alternate's second
//   text      the same, for a text
//   people    [{name, color}]: a call or text from someone whose name holds this one shows in their colour instead
//   dnd       stay dark while the phone is on Do Not Disturb (unless that person or app is let through it)
//   only_on   only lights that are already on show it
//   apps      texts from "sms" (the phone's own texting app) or "all" messaging apps
//   by_app    [{pkg, name, pattern, color, color2}]: an app of its own. Any notification it makes shows, in its colour and
//             pattern; a text or call from it takes its colour (a person's own colour still comes first). The phone
//             is handed the list (native.js alertApps) and sends only those apps' other notifications.

const PATTERNS = ['flash', 'breathe', 'alternate', 'glow'];
const DEFAULTS = {
  call: { pattern: 'flash', color: '#4fd39a', color2: '#4c8dff' },
  text: { pattern: 'breathe', color: '#4c8dff', color2: '#a66bff' },
};
const TEXT_S = 3.5;      // a text plays for this long
const CALL_S = 60;       // a call until the phone says it stopped ringing, or this
const TEXT_GAP_MS = 2500; // texts closer together than this (a burst of messages) show once

const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const isDev = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
// an Android package name: com.whatsapp, org.thoughtcrime.securesms
const isPkg = v => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(v) && v.length <= 120;

function look(v, d) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    pattern: PATTERNS.includes(o.pattern) ? o.pattern : d.pattern,
    color: isHex(o.color) ? o.color.toLowerCase() : d.color,
    color2: isHex(o.color2) ? o.color2.toLowerCase() : d.color2,
  };
}

function normalizeAlerts(v) {
  const a = v && typeof v === 'object' ? v : {};
  const people = [];
  for (const p of Array.isArray(a.people) ? a.people : []) {
    const name = p && typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    if (name && isHex(p.color) && people.length < 20) people.push({ name, color: p.color.toLowerCase() });
  }
  const byApp = [];
  for (const r of Array.isArray(a.by_app) ? a.by_app : []) {
    if (!r || !isPkg(r.pkg) || byApp.some(x => x.pkg === r.pkg) || byApp.length >= 30) continue;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.replace(/\s+/g, ' ').trim().slice(0, 40) : r.pkg;
    byApp.push({ pkg: r.pkg, name, ...look(r, { pattern: 'flash', color: DEFAULTS.text.color, color2: DEFAULTS.text.color2 }) });
  }
  return {
    on: a.on === true,
    lights: [...new Set(Array.isArray(a.lights) ? a.lights.filter(isDev) : [])].slice(0, 32),
    call: look(a.call, DEFAULTS.call),
    text: look(a.text, DEFAULTS.text),
    people,
    dnd: a.dnd !== false,
    only_on: a.only_on === true,
    apps: a.apps === 'all' ? 'all' : 'sms',
    by_app: byApp,
  };
}

// The colour for this sender: the first person whose name is in theirs ("Sam" finds "Sam Lee")
function personColour(alerts, from) {
  const f = String(from || '').toLowerCase();
  if (!f) return null;
  const p = alerts.people.find(x => f.includes(x.name.toLowerCase()));
  return p ? p.color : null;
}

// What to do with one event from the phone: {action} for the connector, or {skip: why}.
//   ev = {kind: call | text | app, state: start | stop, key, from, sms, dnd, app}
// memo keeps when the last text, and each app's last notification, showed, for the burst rule.
function decideAlert(alerts, ev, now = Date.now(), memo = {}) {
  const kind = ['call', 'text', 'app'].includes(ev.kind) ? ev.kind : null;
  if (!kind) return { skip: 'kind' };
  const key = /^[A-Za-z0-9_-]{1,64}$/.test(String(ev.key || '')) ? String(ev.key) : 'one';
  // a call that stopped ringing always stops, whatever has changed since it started
  if (ev.state === 'stop') return kind === 'call' ? { action: { type: 'alert', op: 'stop', id: `call:${key}` } } : { skip: 'stop' };
  if (!alerts.on) return { skip: 'off' };
  if (!alerts.lights.length) return { skip: 'no lights' };
  if (alerts.dnd && ev.dnd === true) return { skip: 'do not disturb' };
  const rule = (alerts.by_app || []).find(r => r.pkg === ev.app) || null;
  if (kind === 'app' && !rule) return { skip: 'app' };
  if (kind === 'text' && alerts.apps === 'sms' && ev.sms === false && !rule) return { skip: 'app' };
  if (kind !== 'call') {
    const slot = kind === 'app' ? `app:${rule.pkg}` : 'textAt';
    if (memo[slot] != null && now - memo[slot] < TEXT_GAP_MS) return { skip: 'burst' };
    memo[slot] = now;
  }
  // a call keeps the call's pattern in its app's colour; a text or anything else from an app with a look of its own
  // takes that look; a person's own colour comes first whatever it came through
  const base = kind === 'app' ? rule : alerts[kind];
  const lk = rule && kind !== 'call' ? rule : { ...base, ...(rule ? { color: rule.color } : {}) };
  const mine = personColour(alerts, ev.from);
  const colors = lk.pattern === 'alternate' ? [mine || lk.color, lk.color2] : [mine || lk.color];
  return {
    action: {
      type: 'alert', op: 'start', id: `${kind}:${key}`, lights: alerts.lights, pattern: lk.pattern, colors,
      seconds: kind === 'call' ? CALL_S : TEXT_S, only_on: alerts.only_on,
    },
  };
}

module.exports = { normalizeAlerts, decideAlert, personColour, PATTERNS, DEFAULTS, TEXT_S, CALL_S };
