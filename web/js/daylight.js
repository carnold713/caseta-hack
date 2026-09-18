/* Follow the day: a lamp keeps its white matched to the time of day, on its own, for as long as it is on.
   Cool and bright around midday, warm in the evening, like daylight.

   The connector does the work (agent/daylight.py); this file is the app's half: the same curve, so the light's
   page can say what a lamp is set to right now and draw the day's shape, and the three places it is switched on
   (a light's page, a room, a scene). The anchor table below is a copy of the one in agent/daylight.py: change
   one and change the other.

   Loaded after color.js (warmthName, kelvinHex) and before light.js, room.js and scenes.js, which draw its rows. */
'use strict';

// (moment, minutes from it, kelvin). "midnight" is solar midnight, twelve hours before that day's noon.
const FOLLOW_ANCHORS = [
  ['midnight', 0, 2000],
  ['sunrise', -60, 2200],
  ['sunrise', 0, 2700],
  ['sunrise', 90, 4000],
  ['noon', 0, 5200],
  ['sunset', -120, 4000],
  ['sunset', 0, 2900],
  ['sunset', 60, 2400],
];
const toMirek = k => 1e6 / Math.max(1, Number(k) || 1);
const toKelvin = m => Math.round(1e6 / Math.max(1, Number(m) || 1));

// ---------- the home's clock and the home's sun ----------
// The connector's own clock, kept as an offset from this phone's, so a home in another zone (or a rig driven at a
// chosen time of day) reads right here.
function homeNow() { return new Date(Date.now() - (S.sunSkew || 0)); }
// Today's three moments as Dates, or null when the app has not been told where the home is.
function followDay(when) {
  const s = S.sun || {};
  if (!s.sunrise || !s.sunset) return null;
  const rise = new Date(s.sunrise), set = new Date(s.sunset);
  if (isNaN(rise) || isNaN(set)) return null;
  const noon = s.noon && !isNaN(new Date(s.noon)) ? new Date(s.noon) : new Date((rise.getTime() + set.getTime()) / 2);
  // the connector sends today's sun; another day of the year is a minute or two out, which no eye can see
  const shift = when ? Math.round((when - noon) / 86400000) : 0;
  const move = d => new Date(d.getTime() + shift * 86400000);
  return { sunrise: move(rise), sunset: move(set), noon: move(noon) };
}
const followReady = () => !!followDay();
// Yesterday, today and tomorrow's anchors in time order: that is what makes 3am and the hour after dusk sit
// between two anchors like any other moment.
function followPoints(when) {
  const base = followDay(when); if (!base) return [];
  const out = [];
  for (const delta of [-1, 0, 1]) {
    const day = { sunrise: new Date(+base.sunrise + delta * 86400000), sunset: new Date(+base.sunset + delta * 86400000), noon: new Date(+base.noon + delta * 86400000) };
    day.midnight = new Date(+day.noon - 12 * 3600000);
    for (const [moment, offset, kelvin] of FOLLOW_ANCHORS) out.push([new Date(+day[moment] + offset * 60000), toMirek(kelvin)]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.filter((p, i) => i === 0 || p[0] - out[i - 1][0] >= 60000);
}
// The white at a moment, in mireds (a million over kelvin): a step in mireds looks like an even step to the eye,
// a step in kelvin does not, so the curve is drawn and interpolated in them.
function followMirek(when) {
  const pts = followPoints(when); if (!pts.length) return null;
  const t = +when;
  if (t <= +pts[0][0]) return pts[0][1];
  if (t >= +pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= +pts[i][0]) {
      const [t0, m0] = pts[i - 1], [t1, m1] = pts[i];
      const span = t1 - t0;
      return m0 + (m1 - m0) * (span <= 0 ? 0 : (t - t0) / span);
    }
  }
  return pts[pts.length - 1][1];
}
function followKelvin(when) { const m = followMirek(when || homeNow()); return m == null ? null : toKelvin(m); }
// Clamped to what this lamp can show: every Hue lamp reports its own range, and nothing is ever asked of it
// that it cannot do.
function followKelvinFor(id, when) {
  const m = followMirek(when || homeNow()); if (m == null) return null;
  const d = dev(id) || {};
  const [kmin, kmax] = d.ct && d.ct_range ? d.ct_range : [2000, 6500];
  return toKelvin(clamp(m, toMirek(kmax), toMirek(kmin)));
}

// ---------- who follows ----------
const followSettings = () => (S.config && S.config.settings && S.config.settings.follow_day) || { device_ids: [], brightness: false };
const followIds = () => followSettings().device_ids || [];
const followBright = () => !!followSettings().brightness;
// The connector's own word on it: the lamps it is following and the ones it has stopped for.
const followLive = () => (S.follow || {});
const isFollowing = id => followIds().includes(id) || ((followLive().ids || []).includes(id));
const followPaused = id => isFollowing(id) && (followLive().paused || []).includes(id);
// A lamp can follow the day when it can change its white. A Caseta dimmer has no colour at all, so it is never offered it.
const canFollow = d => !!(d && d.ct);
const roomFollowLamps = aid => controllable().filter(d => devArea(d) === aid && canFollow(d));

function setFollow(ids, on, opts = {}) {
  const list = Array.isArray(ids) ? ids : [ids];
  const s = S.config.settings;
  const fd = s.follow_day || (s.follow_day = { device_ids: [], brightness: false });
  fd.device_ids = fd.device_ids || [];
  for (const id of list) {
    const i = fd.device_ids.indexOf(id);
    if (on && i < 0) fd.device_ids.push(id);
    if (!on && i >= 0) fd.device_ids.splice(i, 1);
  }
  save({ msg: opts.msg || (on ? 'Following the day' : 'No longer following the day'), render: opts.render !== false });
}
function setFollowBright(on) {
  const s = S.config.settings;
  const fd = s.follow_day || (s.follow_day = { device_ids: [], brightness: false });
  fd.brightness = !!on;
  save({ msg: on ? 'It will dim towards the evening too' : 'It will leave brightness alone', render: false });
}

// ---------- what it is doing, in words ----------
// "because it is mid-afternoon": where in the day this moment sits, said the way a person would.
function followWhen(when) {
  const d = followDay(when || homeNow()); if (!d) return '';
  const t = +(when || homeNow());
  const rise = +d.sunrise, set = +d.sunset, noon = +d.noon, M = 60000;
  if (t < rise - 60 * M) return 'because it is the middle of the night';
  if (t < rise) return 'because the sun is about to come up';
  if (t < rise + 90 * M) return 'because the sun is coming up';
  if (t < noon - 120 * M) return 'because it is mid-morning';
  if (t <= noon + 120 * M) return 'because it is the middle of the day';
  if (t < set - 120 * M) return 'because it is mid-afternoon';
  if (t < set) return 'because the afternoon is turning';
  if (t < set + 60 * M) return 'because the sun is going down';
  return 'because the evening has come';
}
// "Soft white, 3450 K, because it is mid-afternoon". The white the lamp is really showing when it is following and
// the connector has already set it; otherwise the one the curve asks for, which is what it would be given.
function followNowText(id) {
  const st = (S.states[id] || {}).color;
  const lit = (level(id) || 0) > 0;
  const live = lit && isFollowing(id) && !followPaused(id) && st && st.mode === 'ct' && st.kelvin ? Math.round(st.kelvin) : null;
  const k = live || followKelvinFor(id);
  if (k == null) return '';
  const what = `${warmthName(k)}, ${k} K, ${followWhen()}`;
  // a lamp that is off is left alone, so the honest line is what it will be when it comes on
  return lit ? what : `Off just now. When you turn it on: ${what}`;
}
// What the day asks for at this moment, whatever the lamp is doing: the line the pane shows before it is switched on.
function followWouldText(id) {
  const k = followKelvinFor(id); if (k == null) return '';
  return `${warmthName(k)}, ${k} K, ${followWhen()}`;
}
// The small tag that used to sit on the Colour row. The light sheet's Colour value row retired into its swatch
// row (docs/design-spec-v5.md 4.9) and the tag went with it, so nothing calls this at the moment: the Follow the
// day row's own value ("On", "Paused", "Off") is the one place the state is said. Kept because it is the phrase
// any other host would want, and because its painter still finds whatever renders it.
const followTagHTML = id => (isFollowing(id) && !followPaused(id) ? `<span class="daytag" data-followtag="${id}">Following the day</span>` : '');

// ---------- the day's shape ----------
// A sparkline of the curve with a dot at now, in the lamp's own tints: inline SVG, no libraries.
let SPARK_N = 0;
function daySparkHTML(id, opts = {}) {
  const base = followDay(); if (!base) return '';
  const W = 350, H = 72, pad = 10, top = 8, bot = H - 20;
  const start = +base.noon - 12 * 3600000, span = 24 * 3600000;
  const steps = 96;
  const vals = [];
  for (let i = 0; i <= steps; i++) { const when = new Date(start + span * (i / steps)); vals.push([when, followMirek(when)]); }
  const mireks = vals.map(v => v[1]);
  const lo = Math.min(...mireks), hi = Math.max(...mireks);
  const x = when => pad + (W - 2 * pad) * clamp((+when - start) / span, 0, 1);
  const y = m => top + (bot - top) * ((m - lo) / Math.max(1, hi - lo));   // low mireds (cool) sit high
  const line = vals.map(([w, m], i) => `${i ? 'L' : 'M'}${x(w).toFixed(1)} ${y(m).toFixed(1)}`).join(' ');
  const area = `${line} L${x(vals[vals.length - 1][0]).toFixed(1)} ${bot} L${x(vals[0][0]).toFixed(1)} ${bot} Z`;
  const gid = `ds${++SPARK_N}`;
  // two gradients from the same whites: the wash under the curve in the tints themselves, the line in the same
  // tints mixed towards the ink, because a 5200 K white is invisible on a white card
  const at = f => kelvinHex(toKelvin(followMirek(new Date(start + span * f))));
  const stops = f => [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1].map(v => `<stop offset="${Math.round(v * 100)}%" stop-color="${f(at(v))}"/>`).join('');
  const now = homeNow();
  const nk = followKelvinFor(id), nm = followMirek(now);
  const nx = x(now), ny = y(nm);
  const label = (when, text) => `<text class="dsl" x="${clamp(x(when), 18, W - 18).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(text)}</text>`;
  const hm = d => { try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d); } catch (_) { return ''; } };
  return `<svg class="dayspark" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="The white through the day, ${opts.aria || ''}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">${stops(c => c)}</linearGradient>
    <linearGradient id="${gid}i" x1="0" y1="0" x2="1" y2="0">${stops(c => mixHex(c, '#262626', 0.42))}</linearGradient></defs>
    <path class="dsa" d="${area}" fill="url(#${gid})"/>
    <path class="dsc" d="${line}" stroke="url(#${gid}i)"/>
    <line class="dsn" x1="${nx.toFixed(1)}" y1="${top - 2}" x2="${nx.toFixed(1)}" y2="${bot}"/>
    <circle class="dsd" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="5.5" fill="${kelvinHex(nk || toKelvin(nm))}"/>
    ${label(base.sunrise, hm(base.sunrise))}${label(base.noon, 'Midday')}${label(base.sunset, hm(base.sunset))}
  </svg>`;
}

// ---------- 1. the light's page: a row under Colour, and its own short pane ----------
function followRowHTML(id) {
  const d = dev(id); if (!canFollow(d)) return '';
  return valueRow('Follow the day', isFollowing(id) ? (followPaused(id) ? 'Paused' : 'On') : 'Off', 'follow-open', `data-id="${id}"`);
}
// The day's shape and what the lamp is set to right now, as one card: the line reads the value, the sparkline
// shows where in the day it comes from.
function followCardHTML(id, opts = {}) {
  if (!followReady()) return '';
  const d = dev(id) || {};
  // a fixed line is not repainted from the curve: it is saying something else, like why the lamp is not following
  const line = opts.line != null ? `<div class="dayline">${esc(opts.line)}</div>` : `<div class="dayline" data-follownow="${id}">${esc(followNowText(id))}</div>`;
  return `<div class="dayspark-wrap">${line}<div data-daysvg="${id}">${daySparkHTML(id, { aria: esc(d.name || '') })}</div></div>`;
}
function openFollowSheet(id) {
  const d = dev(id); if (!canFollow(d)) return;
  const on = isFollowing(id), paused = followPaused(id);
  const sw = (act, label, state, data = '') => `<button class="sw ${state ? 'on' : ''}" data-act="${act}" ${data} aria-label="${esc(label)}"></button>`;
  let h = `<div class="card pad0 list"><div class="item"><div class="grow"><div class="t">Follow the day</div><div class="d">Cool and bright around midday, warm in the evening, like daylight.</div></div>${sw('follow-toggle', 'Follow the day', on, `data-id="${id}"`)}</div></div>`;
  if (!followReady()) {
    h += `<p class="d" style="margin:12px 0 0">Tell the app where the home is and the white will follow your own sunrise and sunset. <a data-act="loc-use" href="#">Use my location</a></p>`;
  } else if (on) {
    h += followCardHTML(id, paused ? { line: 'You set this one by hand. Following again when you next turn it on.' } : {});
    h += `<div class="card pad0 list" style="margin-top:16px"><div class="item"><div class="grow"><div class="t">Dim towards the evening too</div><div class="d">Brightness comes down with the evening wind-down.</div></div>${sw('follow-bright', 'Dim towards the evening too', followBright())}</div></div>`;
    h += `<p class="d" style="margin:12px 0 0">Set a colour or a warmth on this lamp by hand and it stops following until you next turn it on.</p>`;
  } else {
    h += followCardHTML(id, { line: followWouldText(id) ? `Right now that would be ${followWouldText(id)}` : '' });
  }
  showSheet('follow', 'Follow the day', h, { detent: 'medium', grow: true, sub: `${esc(d.name)} · ${esc(devAreaName(d))}`, back: true, onBack: () => openLightSheet(id) });
}

// ---------- 2. a room: one row in Room setup, for the lamps in it that can do warmth ----------
function followRoomRowHTML(aid) {
  const lamps = roomFollowLamps(aid); if (!lamps.length) return '';
  const names = lamps.map(d => d.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const on = lamps.every(d => isFollowing(d.device_id));
  const some = !on && lamps.some(d => isFollowing(d.device_id));
  // the row names the lamps it applies to; what is left out is explained in the pane, where there is room for it
  const sub = esc(list);
  const n = lamps.filter(d => isFollowing(d.device_id)).length;
  return `<div class="gh">Warmth</div><div class="card pad0 list"><div class="item"><button class="auto-main" data-act="follow-room-open" data-area="${aid}"><div class="grow"><div class="t">Follow the day</div><div class="d">${some ? `${n} of ${lamps.length} · ` : ''}${sub}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button><button class="sw ${on ? 'on' : ''}" data-act="follow-room" data-area="${aid}" aria-label="Follow the day in this room"></button></div></div>`;
}
// The room's pane: the sentence, the day's shape and one row per lamp that can do it.
function openFollowRoomSheet(aid) {
  const lamps = roomFollowLamps(aid); if (!lamps.length) return;
  const others = controllable().filter(d => devArea(d) === aid && !canFollow(d) && (d.domain === 'light' || d.domain === 'switch'));
  let h = `<p class="body" style="margin:0 0 16px">Cool and bright around midday, warm in the evening, like daylight. It applies to the lamps here that can change their warmth.</p>`;
  h += `<div class="card pad0 list">${lamps.map(d => `<div class="item">${lampHTML(level(d.device_id) || 0, 28, ICON(lightIcon(d), 'sm'))}<div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${isFollowing(d.device_id) ? (followPaused(d.device_id) ? 'Set by hand, following again when you next turn it on' : 'Following the day') : 'Not following'}</div></div><button class="sw ${isFollowing(d.device_id) ? 'on' : ''}" data-act="follow-toggle" data-id="${d.device_id}" data-area="${aid}" aria-label="${esc(d.name)} follows the day"></button></div>`).join('')}</div>`;
  h += followCardHTML(lamps[0].device_id, { line: `Right now: ${followWouldText(lamps[0].device_id)}` });
  if (others.length) h += `<p class="d" style="margin:12px 0 0">${esc(others.map(d => d.name).join(', '))} cannot change warmth, so ${others.length === 1 ? 'it is' : 'they are'} left out.</p>`;
  // it is opened from the Room setup page, so the way out is the X, not a back arrow to a sheet that is not there
  showSheet('follow-room', 'Follow the day', h, { detent: 'medium', grow: true, sub: esc(areaName(aid)) });
}

// ---------- painting ----------
// The pane and the rows follow the connector's news without being rebuilt under a finger.
function paintFollow() {
  document.querySelectorAll('[data-follownow]').forEach(el => { const t = followNowText(el.dataset.follownow); if (t && el.textContent !== t) el.textContent = t; });
  document.querySelectorAll('[data-daysvg]').forEach(el => { const h = daySparkHTML(el.dataset.daysvg); if (h) el.innerHTML = h; });
  document.querySelectorAll('[data-followtag]').forEach(el => { const id = el.dataset.followtag; el.style.display = isFollowing(id) && !followPaused(id) ? '' : 'none'; });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'follow-open': openFollowSheet(d.id); break;
    case 'follow-toggle': {
      const on = !isFollowing(d.id);
      el.classList.toggle('on', on);
      setFollow(d.id, on, { render: false });
      if (SHEET_KEY === 'follow') openFollowSheet(d.id);
      else if (SHEET_KEY === 'follow-room' && d.area) openFollowRoomSheet(d.area);
      break;
    }
    case 'follow-bright': setFollowBright(!followBright()); if (SHEET_KEY === 'follow') { const id = ($('#sheet-root [data-act="follow-toggle"]') || {}).dataset; if (id && id.id) openFollowSheet(id.id); } break;
    case 'follow-room-open': openFollowRoomSheet(d.area); break;
    case 'follow-room': {
      const lamps = roomFollowLamps(d.area); const on = !lamps.every(x => isFollowing(x.device_id));
      el.classList.toggle('on', on);
      setFollow(lamps.map(x => x.device_id), on, { render: S.view === 'room' });
      break;
    }
  }
});
