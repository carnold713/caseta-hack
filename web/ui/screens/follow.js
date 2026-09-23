// 06 · Follow the day (12733:48715): a page pushed from a lamp. The day's colour temperature from 4 am to 4 am with
// the sun's three moments and where now is, then the switches: this lamp, dimming in the evening too, and the other
// lamps in the room.
import { kelvinHex } from '/ui/colour.js';

const W = 340, TOP = 44.8, BOT = 167.3, BASE = 176;
const HOUR = 3600000;

// The home's wall clock for a moment, as a Date whose local fields read the home's time.
const homeClock = (c, t) => new Date(+t - (c.S.sunSkew || 0));
const hm = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, ' ');

function chart(c, d) {
  const id = d.device_id;
  const now = c.DAY.homeNow();
  // the day on screen runs from the 4 am before now to the 4 am after it
  const start = new Date(now); start.setHours(4, 0, 0, 0); if (start > now) start.setDate(start.getDate() - 1);
  const x = t => Math.max(0, Math.min(W, ((+t - +start) / (24 * HOUR)) * W));
  const N = 96, pts = [];
  for (let i = 0; i <= N; i++) { const t = new Date(+start + (24 * HOUR * i) / N); pts.push([t, c.DAY.followKelvinFor(id, new Date(+t + (c.S.sunSkew || 0)))]); }
  const ks = pts.map(p => p[1]).filter(k => k != null);
  if (!ks.length) return null;
  const kmin = Math.min(...ks), kmax = Math.max(...ks);
  const mired = k => 1e6 / k;
  const y = k => TOP + (BOT - TOP) * ((mired(k) - mired(kmax)) / Math.max(1, mired(kmin) - mired(kmax)));
  const line = pts.map(([t, k], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(k).toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${BASE} L0 ${BASE} Z`;
  const grad = [0, 4, 8, 13, 17, 21, 25, 29, 33, 38, 42, 46, 50, 54, 58, 63, 67, 71, 75, 79, 83, 88, 92, 96, 100]
    .map(p => `<stop offset="${p}%" stop-color="${kelvinHex(pts[Math.round((p / 100) * N)][1])}"/>`).join('');
  const sun = c.DAY.followDay(new Date(+start + 12 * HOUR + (c.S.sunSkew || 0)));
  const at = t => homeClock(c, t);
  const marks = sun ? [['Sunrise', at(sun.sunrise)], ['Solar noon', at(sun.noon)], ['Sunset', at(sun.sunset)]] : [];
  const nk = c.DAY.followKelvinFor(id), nx = x(now), ny = y(nk);
  const lx = Math.max(0, Math.min(W - 91, nx - 45.5));
  const hourX = h => (((h - 4 + 24) % 24) / 24) * W;
  return `<svg class="dc-chart" viewBox="0 0 ${W} 230" width="${W}" height="230" role="img" aria-label="Colour temperature through today">
    <defs>
      <linearGradient id="dcArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFD7B0" stop-opacity=".28"/><stop offset="1" stop-color="#D98A4E" stop-opacity=".02"/></linearGradient>
      <linearGradient id="dcLine" x1="0" y1="0" x2="1" y2="0">${grad}</linearGradient>
      <radialGradient id="dcGlow"><stop stop-color="#FFA24A" stop-opacity=".55"/><stop offset="1" stop-color="#FFA24A" stop-opacity="0"/></radialGradient>
    </defs>
    ${sun ? `<rect x="0" y="36" width="${x(marks[0][1]).toFixed(1)}" height="140" fill="#000" fill-opacity=".18"/>
    <rect x="${x(marks[2][1]).toFixed(1)}" y="36" width="${(W - x(marks[2][1])).toFixed(1)}" height="140" fill="#000" fill-opacity=".18"/>` : ''}
    <line x1="0" x2="${W}" y1="176.5" y2="176.5" stroke="#fff" stroke-opacity=".1"/>
    ${marks.map(([, t]) => `<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="32" y2="176" stroke="#F5F4F2" stroke-opacity=".22"/>`).join('')}
    <path d="${area}" fill="url(#dcArea)"/>
    <path d="${line}" fill="none" stroke="url(#dcLine)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${marks.map(([n, t]) => `<text class="mk" x="${Math.max(20, Math.min(W - 24, x(t))).toFixed(1)}" y="8" text-anchor="middle">${n}</text><text class="mt" x="${Math.max(20, Math.min(W - 24, x(t))).toFixed(1)}" y="22" text-anchor="middle">${hm(t)}</text>`).join('')}
    <rect x="${nx.toFixed(1)}" y="82" width="1" height="${Math.max(0, ny - 88).toFixed(1)}" fill="#F5F4F2" fill-opacity=".35"/>
    <rect class="now-pill" x="${lx.toFixed(1)}" y="58" width="91" height="24" rx="12"/><text class="now-t" x="${(lx + 45.5).toFixed(1)}" y="74" text-anchor="middle">Now · ${Math.round(nk / 100) * 100}K</text>
    <circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="18" fill="url(#dcGlow)"/>
    <circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="7" fill="${kelvinHex(nk)}" stroke="#fff" stroke-width="2"/>
    ${[[6, '6 am'], [12, 'noon'], [18, '6 pm'], [0, 'midnight']].map(([h, t]) => `<text class="ax" x="${hourX(h).toFixed(1)}" y="196" text-anchor="middle">${t}</text>`).join('')}
  </svg>` + `<span class="dc-range">${Math.round(kmin / 100) * 100}–${Math.round(kmax / 100) * 100}K</span>`;
}

export function view(c, r, d) {
  const { esc, icon } = c;
  const id = d.device_id;
  const on = c.DAY.isFollowing(id);
  const lamps = c.DAY.roomFollowLamps(c.data.devArea(d));
  const others = lamps.filter(x => x.device_id !== id);
  const ready = c.DAY.followReady();
  const ch = ready ? chart(c, d) : null;
  const card = ch
    ? `<section class="dc-card"><div class="t-over dc-over">Colour temperature today</div>${ch}
        <div class="dc-legend"><span><i class="sw"></i>Colour temperature</span>${c.DAY.followBright() ? '<span><i class="dash"></i>Brightness follows too</span>' : ''}</div></section>`
    : `<section class="dc-card dc-empty"><p class="t-body">Tell the app where your home is and the white follows your own sunrise and sunset.</p>
        <button class="pill solid" data-act="follow-locate">${icon('sunrise', 20, 1.7)}Use my location</button></section>`;
  return `<div class="dev follow-page">
    <span class="halo"></span>
    <header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">Follow the day</h1>
    <p class="t-cap muted fd-sub">${esc(d.name)} · ${esc(c.data.devAreaName(d) || '')}</p>
    ${card}
    <div class="group fd-rows">
      <div class="row has-ic"><span class="row-ic sunrise">${icon('sunrise', 20, 1.7)}</span><span class="row-txt"><span class="t">${on ? (c.DAY.followPaused(id) ? 'Paused for now' : 'Following now') : 'Follow the day'}</span>${on && c.DAY.followPaused(id) ? '<span class="d">You picked a colour, so it keeps that colour, off and on, until you resume.</span>' : ''}</span>
        <button class="toggle" role="switch" aria-checked="${on}" data-act="follow-toggle" aria-label="Follow the day"></button></div>
      ${on && c.DAY.followPaused(id) ? `<button class="row has-ic fd-resume" data-act="follow-resume"><span class="row-ic">${icon('sunrise', 20, 1.7)}</span><span class="row-txt"><span class="t blue">Follow the day again</span><span class="d">Goes back to the day's white now</span></span></button>` : ''}
      <div class="row sub tall has-ic"><span class="row-ic">${icon('moon', 20, 1.7)}</span><span class="row-txt"><span class="t">Dim in the evening too</span><span class="d q">Uses the same curve as the evening wind-down</span></span>
        <button class="toggle" role="switch" aria-checked="${c.DAY.followBright()}" data-act="follow-bright" aria-label="Dim in the evening too"></button></div>
      ${others.length ? `<button class="row has-ic" data-act="follow-also"><span class="row-ic">${icon('bulb', 20, 1.7)}</span><span class="row-txt"><span class="t">Also for</span></span><span class="row-val">${others.filter(x => c.DAY.isFollowing(x.device_id)).length} of ${others.length} other lamp${others.length === 1 ? '' : 's'} in ${esc(c.data.devAreaName(d))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : ''}
    </div>
    <div class="fd-info">${icon('hand', 22, 1.6)}<p>Picking a colour by hand pauses this. The lamp keeps your colour when it is turned off and on again, until you resume.</p></div>
    <p class="fd-drift">${icon('clock', 16, 1.7)}Drifts slowly (about 30 s), so you won’t notice it changing.</p>
  </div>`;
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
  // a lamp a picked colour paused goes back to the day's white (the connector's {type: color, follow: true})
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
