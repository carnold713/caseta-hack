// 06 · Follow the day (12733:48715): a page pushed from a lamp. Then the switches: this lamp, dimming in the evening
// too, and the other lamps in the room.
//
// v7 · 8 (12815:51423, paused as built 12813:48703): the day is a 24 hour sky dial, noon at the top and midnight at
// the bottom, the day running clockwise so the morning is on the left and the evening on the right. The ring is the
// sky's colour hour by hour, brighter for the part of today already lived; inside it today's curve glows in its own
// whites, drawn in towards the warm night and out towards the cool noon. The sun sits at its live place and the lamp
// is a small bead on the curve beside it. A colour picked by hand pauses it: the sky dims to a trace and the bead
// leaves the curve for the middle, in the colour that was picked, until "Follow the day again".
//
// A finger on the ring scrubs the day ("At 9:00 pm · 2400K") and springs back to now when it lifts. It is a preview:
// the lamp is never touched.
import { kelvinHex } from '/ui/colour.js';
import { glowHTML, whiteStops } from '/ui/glow.js';
import { track } from '/ui/gesture.js';
import { CasetaDaylight } from '/data/index.js';
import { windDownLevelAt } from '/ui/screens/routines.js';

const HOUR = 3600000;
const V = 170, R = 150;                 // the dial's half size and the ring's radius (stroke 28), in its own units
const CURVE = [80, 124];               // today's curve: its radius at 2200K and at 5000K
const hm = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, ' ');
const warmth = k => CasetaDaylight.warmthName(k);
const round100 = k => Math.round(k / 100) * 100;

// Where an hour of the day sits on the dial: noon at the top, clockwise.
const ang = h => ((h - 12) * 15) * Math.PI / 180;
const at = (h, r) => [r * Math.sin(ang(h)), -r * Math.cos(ang(h))];
const pct = v => `${(((v + V) / (2 * V)) * 100).toFixed(2)}%`;
const f1 = n => n.toFixed(1);

// The sky's colour through the day, anchored on this home's own sunrise, noon and sunset (the UI doc's angular
// stops, turned from fractions of the ring into hours either side of the sun's moments).
const SKY = [
  ['noon', 0, '#F4F1EA'], ['noon', 3.6, '#FAE5C9'], ['sunset', -1.2, '#FFD9A8'], ['sunset', 0, '#FFB46B'],
  ['sunset', 1.44, '#B86C35'], ['sunset', 2.88, '#3A2A20'], ['midnight', 0, '#2A2724'], ['sunrise', -2, '#3A2A20'],
  ['sunrise', -0.8, '#B86C35'], ['sunrise', 0, '#FFB46B'], ['sunrise', 1.6, '#FFD9A8'], ['noon', -1.92, '#FAE5C9'],
];
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
function skyAt(stops, h) {
  for (let i = 0; i < stops.length; i++) {
    const [h0, c0] = stops[i], [h1r, c1] = stops[(i + 1) % stops.length];
    const h1 = h1r <= h0 ? h1r + 24 : h1r;
    const hh = h < h0 ? h + 24 : h;
    if (hh >= h0 && hh <= h1) return mixHex(c0, c1, h1 === h0 ? 0 : (hh - h0) / (h1 - h0));
  }
  return stops[0][1];
}

// Everything the dial needs, read once per draw.
function dayModel(c, d) {
  const id = d.device_id, skew = c.S.sunSkew || 0;
  const now = c.DAY.homeNow();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const hourOf = t => (+t - +start) / HOUR;
  const nowH = hourOf(now);
  const real = h => new Date(+start + h * HOUR + skew);
  const kAt = h => c.DAY.followKelvinFor(id, real(h));
  const sun = c.DAY.followDay(real(12));
  const home = t => new Date(+t - skew);
  const m = sun ? { sunrise: ((hourOf(home(sun.sunrise)) % 24) + 24) % 24, sunset: ((hourOf(home(sun.sunset)) % 24) + 24) % 24, noon: ((hourOf(home(sun.noon)) % 24) + 24) % 24 } : null;
  if (m) m.midnight = (m.noon + 12) % 24;
  const stops = m ? SKY.map(([a, o, col]) => [(((m[a] + o) % 24) + 24) % 24, col]).sort((x, y) => x[0] - y[0]) : null;
  return { id, now, start, nowH, kAt, m, stops, sunTimes: sun ? { rise: home(sun.sunrise), set: home(sun.sunset) } : null };
}

// The dial's drawing: the sky ring, today's curve (lived part glowing, the rest a faint dashed line), and, when
// brightness follows too, the wind-down's curve as a thin inner ring.
function dialSVG(c, md) {
  const N = 96, step = 24 / N;
  let ring = '', lived = '', future = '', bright = '';
  if (md.stops) {
    for (let i = 0; i < N; i++) {
      const h0 = i * step, h1 = h0 + step + 0.03;
      const [x0, y0] = at(h0, R), [x1, y1] = at(h1, R);
      ring += `<path d="M${f1(x0)} ${f1(y0)}A${R} ${R} 0 0 1 ${f1(x1)} ${f1(y1)}" stroke="${skyAt(md.stops, h0 + step / 2)}" stroke-opacity="${h0 + step / 2 <= md.nowH ? 0.9 : 0.35}"/>`;
    }
  } else {
    ring = `<circle r="${R}" stroke="#3A3A3A" stroke-opacity=".6"/>`;
  }
  const ks = [];
  for (let i = 0; i <= N; i++) ks.push(md.kAt(i * step));
  const has = ks.every(k => k != null);
  let kmin = null, kmax = null;
  if (has) {
    kmin = Math.min(...ks); kmax = Math.max(...ks);
    const rOf = k => CURVE[0] + (CURVE[1] - CURVE[0]) * Math.max(0, Math.min(1, (k - 2200) / 2800));
    const pts = ks.map((k, i) => at(i * step, rOf(k)));
    const nowI = Math.min(N, md.nowH / step);
    for (let i = 0; i < N; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (i + 1 <= nowI) lived += `<path d="M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}" stroke="${whiteStops(ks[i]).body}"/>`;
      else future += `${future ? 'L' : 'M'}${f1(x0)} ${f1(y0)}`;
    }
    if (future) future += `L${f1(pts[N][0])} ${f1(pts[N][1])}`;
  }
  if (c.DAY.followBright()) {
    const pad = n => String(n).padStart(2, '0');
    let dpath = '';
    for (let i = 0; i <= N; i++) {
      const h = i * step, lv = windDownLevelAt(c, `${pad(Math.floor(h) % 24)}:${pad(Math.round((h % 1) * 60) % 60)}`);
      const [x, y] = at(h, 60 + 8 * (lv / 100));
      dpath += `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`;
    }
    bright = `<path class="fd-bright" d="${dpath}Z"/>`;
  }
  return {
    kmin, kmax, has,
    svg: `<svg class="dc-chart fd-svg" viewBox="${-V} ${-V} ${2 * V} ${2 * V}" role="img" aria-label="Today's sky and the lamp's white through it">
      <defs><filter id="fdBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter></defs>
      <g class="fd-sky">
        <g class="fd-ring" fill="none" stroke-width="28">${ring}</g>
        ${has ? `<g class="fd-curve-glow" fill="none" stroke-width="7" stroke-linecap="round" filter="url(#fdBlur)">${lived}</g>
        <g class="fd-curve" fill="none" stroke-width="3" stroke-linecap="round">${lived}</g>
        ${future ? `<path class="fd-future" d="${future}"/>` : ''}` : ''}
        ${bright}
      </g>
    </svg>`,
  };
}

function dialCard(c, d) {
  const { esc, icon } = c;
  const id = d.device_id;
  const md = dayModel(c, d);
  const dial = dialSVG(c, md);
  if (!md.m || !dial.has) {
    return `<section class="dc-card fd-card fd-nohome"><div class="t-over dc-over">Colour temperature today</div>
      <div class="fd-dial nohome">${dial.svg}<div class="fd-centre"><p>Where is home? Follow the day needs it for the sun.</p></div></div>
      <button class="pill solid fd-locate" data-act="follow-locate">${icon('sunrise', 20, 1.7)}Use my location</button></section>`;
  }
  const following = c.DAY.isFollowing(id), paused = following && c.DAY.followPaused(id);
  const lv = c.data.level(id) || 0, lit = lv > 0;
  const kNow = md.kAt(md.nowH) || 2700;
  const col = (c.S.states[id] || {}).color || {};
  // the colour it is keeping: the one picked, or a white picked by hand
  const pick = col.mode === 'xy' && col.hex ? col.hex : col.kelvin ? kelvinHex(col.kelvin) : kelvinHex(kNow);
  const white = kelvinHex(kNow);
  const rNow = CURVE[0] + (CURVE[1] - CURVE[0]) * Math.max(0, Math.min(1, (kNow - 2200) / 2800));
  const [bx, by] = paused ? [0, -4] : at(md.nowH, rNow);
  const [sx, sy] = at(md.nowH, R);
  const [mx, my] = at(0, 118);
  const offline = c.conn() === 'off';
  const state = [paused ? 'paused' : '', following ? 'following' : 'idle', lit ? 'lit' : 'dark', offline ? 'offline' : ''].filter(Boolean).join(' ');
  // the middle says what the lamp is doing: its white now, keeping your colour, or what it will come on at
  const centre = paused
    ? `<span class="t-over fd-o">Now · your colour</span><span class="fd-sub fd-below">Paused for now</span>`
    : !following
      ? `<span class="t-over fd-o">The day now</span><span class="fd-k">${round100(kNow)}K</span><span class="fd-sub">${esc(warmth(kNow))}</span>`
      : !lit
        ? `<span class="t-over fd-o">Now</span><span class="fd-k">Off</span><span class="fd-sub">Comes on at ${round100(kNow)}K</span>`
        : `<span class="t-over fd-o">Now</span><span class="fd-k">${round100(kNow)}K</span><span class="fd-sub">${esc(warmth(kNow))}</span>`;
  const sunGlow = glowHTML({ level: 100, kelvin: kNow, ctx: 'tile' });
  return `<section class="dc-card fd-card">
    <div class="t-over dc-over">Colour temperature today</div><span class="dc-range">${round100(dial.kmin)} to ${round100(dial.kmax)}K</span>
    <div class="fd-dial ${state}" data-drag>
      ${dial.svg}
      <span class="fd-moon" style="left:${pct(mx)};top:${pct(my)}" aria-hidden="true">${icon('moon', 16, 1.8)}</span>
      <span class="fd-sun" style="left:${pct(sx)};top:${pct(sy)}" aria-hidden="true">${sunGlow}<i style="background:${whiteStops(kNow).body}"></i></span>
      <span class="fd-bead" style="left:${pct(bx)};top:${pct(by)}" aria-hidden="true">
        <span class="b-glow b-pick-glow">${glowHTML({ level: 100, hex: pick, ctx: 'tile' })}</span><span class="b-glow b-white-glow">${glowHTML({ level: lit ? lv : 60, kelvin: kNow, ctx: 'dot' })}</span>
        <i class="b-pick" style="background:${pick}"></i><i class="b-white" style="background:${white}"></i></span>
      <span class="fd-scrub" aria-hidden="true"><i></i></span>
      <div class="fd-centre" data-xf="standard">${centre}</div>
    </div>
    <div class="fd-sunline"><span>Sunrise ${hm(md.sunTimes.rise)}</span><span>Sunset ${hm(md.sunTimes.set)}</span></div>
  </section>`;
}

// The page's own light: the lamp's glow falling from the top, in the colour it is keeping or the day's white, the
// two crossfading when it pauses or resumes (colour never slides).
function pageGlow(c, d) {
  const id = d.device_id, lv = c.data.level(id) || 0;
  if (!lv) return '<span class="fd-glow" aria-hidden="true"></span>';
  const col = (c.S.states[id] || {}).color || {};
  const k = c.DAY.followKelvinFor(id) || 2700;
  const paused = c.DAY.followPaused(id);
  const pick = col.mode === 'xy' && col.hex ? { hex: col.hex } : { kelvin: col.kelvin || k };
  return `<span class="fd-glow ${paused ? 'paused' : ''}" aria-hidden="true">
    <span class="g-pick">${glowHTML({ level: lv, ...pick, ctx: 'hero', y: 0 })}</span><span class="g-white">${glowHTML({ level: lv, kelvin: k, ctx: 'hero', y: 0 })}</span></span>`;
}

export function view(c, r, d) {
  const { esc, icon } = c;
  const id = d.device_id;
  const on = c.DAY.isFollowing(id);
  const paused = on && c.DAY.followPaused(id);
  const lamps = c.DAY.roomFollowLamps(c.data.devArea(d));
  const others = lamps.filter(x => x.device_id !== id);
  return `<div class="dev follow-page">
    ${pageGlow(c, d)}
    <header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">Follow the day</h1>
    <p class="t-cap muted fd-sub">${esc(d.name)} · ${esc(c.data.devAreaName(d) || '')}</p>
    ${dialCard(c, d)}
    <div class="group fd-rows">
      <div class="row has-ic"><span class="row-ic sunrise">${icon('sunrise', 20, 1.7)}</span><span class="row-txt" data-xf="standard"><span class="t">${on ? (paused ? 'Paused for now' : 'Following now') : 'Follow the day'}</span>${paused ? '<span class="d">You picked a colour, so it keeps that colour, off and on, until you resume.</span>' : ''}</span>
        <button class="toggle" role="switch" aria-checked="${on}" data-act="follow-toggle" aria-label="Follow the day"></button></div>
      ${paused ? `<button class="row has-ic fd-resume" data-act="follow-resume" data-enter="drop"><span class="row-ic">${icon('sunrise', 20, 1.7)}</span><span class="row-txt"><span class="t blue">Follow the day again</span><span class="d">Goes back to the day's white now</span></span></button>` : ''}
      <div class="row sub tall has-ic"><span class="row-ic">${icon('moon', 20, 1.7)}</span><span class="row-txt"><span class="t">Dim in the evening too</span><span class="d q">Uses the same curve as the evening wind-down</span></span>
        <button class="toggle" role="switch" aria-checked="${c.DAY.followBright()}" data-act="follow-bright" aria-label="Dim in the evening too"></button></div>
      ${others.length ? `<button class="row has-ic" data-act="follow-also"><span class="row-ic">${icon('bulb', 20, 1.7)}</span><span class="row-txt"><span class="t">Also for</span></span><span class="row-val nm-cut">${others.filter(x => c.DAY.isFollowing(x.device_id)).length} of ${others.length} other lamp${others.length === 1 ? '' : 's'} in ${esc(c.data.devAreaName(d))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : ''}
    </div>
    <div class="fd-info">${icon('hand', 22, 1.6)}<p>Picking a colour by hand pauses this. The lamp keeps your colour when it is turned off and on again, until you resume.</p></div>
    <p class="fd-drift">${icon('clock', 16, 1.7)}Drifts slowly, about 30 s. You won’t see it change.</p>
  </div>`;
}

// A finger on the ring: a preview of the day at that hour, the marker and the middle following it (LINEAR, the
// number stepping); the lamp is not touched, and letting go springs back to now. The ring is a grip; anywhere else
// on the card the page scrolls.
export function after(c, r, scr) {
  const d = c.data.dev(r.id); if (!d) return;
  const dial = scr.querySelector('.fd-dial:not(.nohome)'); if (!dial) return;
  const scrub = dial.querySelector('.fd-scrub'), centre = dial.querySelector('.fd-centre');
  const onRing = e => {
    const b = dial.getBoundingClientRect(), u = b.width / (2 * V);
    const dist = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)) / u;
    return dist > R - 26 && dist < R + 26;
  };
  const hourAt = e => {
    const b = dial.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (b.left + b.width / 2), -(e.clientY - (b.top + b.height / 2)));
    const h = ((a * 180 / Math.PI) / 15 + 12 + 24) % 24;
    return Math.round(h * 4) / 4 % 24;
  };
  let md = null, last = null;
  track(dial, {
    c, accept: onRing, grab: onRing,
    start() { md = dayModel(c, d); dial.classList.add('scrubbing'); },
    move(e) {
      const h = hourAt(e); if (h === last) return; last = h;
      const [x, y] = at(h, R);
      scrub.style.left = pct(x); scrub.style.top = pct(y);
      const k = md.kAt(h) || 2700;
      scrub.firstElementChild.style.background = whiteStops(k).body;
      const t = new Date(+md.start + h * HOUR);
      centre.innerHTML = `<span class="t-over fd-o">At ${hm(t)}</span><span class="fd-k">${round100(k)}K</span><span class="fd-sub">${c.esc(warmth(k))}</span>`;
    },
    end() { dial.classList.remove('scrubbing'); last = null; c.render(); },
  });
}

// "Also for": the other lamps in the room that can follow, each with its own switch. A picker in a sheet.
export function alsoSheet(c, d) {
  const lamps = c.DAY.roomFollowLamps(c.data.devArea(d)).filter(x => x.device_id !== d.device_id);
  return {
    over: c.data.devAreaName(d), title: 'Follow the day',
    body: `<p class="t-body muted sheet-p">The lamps here that can change their warmth.</p><div class="group">${lamps.map(x => `
      <div class="row sub"><span class="row-txt"><span class="t">${c.esc(x.name)}</span><span class="d">${c.DAY.isFollowing(x.device_id) ? (c.DAY.followPaused(x.device_id) ? 'Paused: keeping a colour you picked' : 'Following the day') : 'Not following'}</span></span>
        <button class="toggle" role="switch" aria-checked="${c.DAY.isFollowing(x.device_id)}" data-act="follow-one" data-id="${c.esc(x.device_id)}" aria-label="${c.esc(x.name)} follows the day"></button></div>`).join('')}</div>`,
  };
}

export const actions = {
  // a lamp a picked colour paused goes back to the day's white (the connector's {type: color, follow: true}); the
  // page shows it at once, the bead going back to the curve, and the lamp glides there on the 30 s drift
  async 'follow-resume'(c, el, r) {
    const id = r.id;
    const f = c.S.follow || {};
    c.S.follow = { ...f, paused: (f.paused || []).filter(x => x !== id), ids: [...new Set([...(f.ids || []), id])] };
    c.render();
    if (await c.run({ type: 'color', target: `d:${id}`, follow: true })) c.toast('Following the day again');
  },
  'follow-toggle'(c, el, r) {
    const on = el.getAttribute('aria-checked') !== 'true';
    c.DAY.setFollowIds([r.id], on);
    c.save(on ? 'Following the day' : 'Stopped following the day');
  },
  'follow-bright'(c, el) {
    const on = el.getAttribute('aria-checked') !== 'true';
    c.DAY.setFollowBrightness(on);
    c.save(on ? 'Lamps following the day dim in the evening too' : 'Following the day leaves brightness alone');
  },
  'follow-also'(c, el, r) { const d = c.data.dev(r.id); if (d) { c.go(`light/${r.id}/follow/also`); } },
  'follow-one'(c, el) {
    const on = el.getAttribute('aria-checked') !== 'true';
    c.DAY.setFollowIds([el.dataset.id], on);
    const d = c.data.dev(el.dataset.id);
    c.save(`${d ? d.name : 'It'} ${on ? 'follows the day' : 'stopped following the day'}`);
  },
  'follow-locate'(c) {
    if (!navigator.geolocation) { c.toast('This phone will not say where it is. Set the location in Settings.', { err: true }); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      c.S.config.settings.location = { lat: Math.round(pos.coords.latitude * 10000) / 10000, lng: Math.round(pos.coords.longitude * 10000) / 10000, name: '' };
      try { c.S.config.settings.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { /* keep it */ }
      c.save('Location saved. The day follows your own sun.');
    }, () => c.toast('No location. Allow it for this site, or set it in Settings.', { err: true }), { timeout: 12000, maximumAge: 600000 });
  },
};
