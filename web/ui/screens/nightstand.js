// 19 · Nightstand mode (12815:51683, on: 12815:51718). 2 am, the phone on the nightstand: the app at its dimmest
// and warmest, no tab bar, one very large soft area. Nothing here is white or blue; a web page cannot dim the
// phone's screen, so it draws dark instead.
//
// The night light is a held thumb, never a tap: rest a thumb for a quarter of a second and the lamp rises to 10% at
// its warmest white on the night fade (1.6 s), and goes out by itself after 15 minutes (the connector's own timer,
// the Light the way recipe). Off is a tap. Nothing here ever turns anything above 10%.
//
// #nightstand. Goodnight sends the app here after its dark-out; it also opens from Settings. Entered at any hour it
// draws the same page; when the night ends while it is showing, it goes back to Home.
import { glowHTML } from '/ui/glow.js';

export const noTabs = true;
const LEVEL = 10;
const MINUTES = 15;
const BEDROOM = /bed|master|nursery|guest/i;
const inWindow = (m, a, b) => (a === b ? false : a < b ? m >= a && m < b : m >= a || m < b);
const hm = s => { const [h, mm] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (mm || 0); };

// The light the night light is: the one chosen in Settings, else a lamp in a bedroom, else none (and the page asks).
export function nightLamp(c) {
  const { data } = c;
  const set = (c.S.config.settings || {}).night_light;
  if (set && data.dev(set)) return data.dev(set);
  const dims = data.controllable().filter(d => d.domain === 'light');
  const beds = dims.filter(d => BEDROOM.test(data.devAreaName(d)));
  return beds.find(d => /lamp|bedside|nightstand/i.test(d.name)) || beds[0] || null;
}
// Night by the house's own hours (Settings, "House goes quiet"): what "the night ends" means here.
function nightNow(c) { const s = c.S.config.settings || {}; return inWindow(hm(c.RT.nowHm()), hm(s.night_start || '22:00'), hm(s.night_end || '06:30')); }
const clock = v => { const [h, m] = String(v).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}`; };

// When the connector's timer turns it out, in the home's clock: the running timer if there is one, else the one
// this page started.
function offAt(c, d) {
  const t = c.RT.timers().find(x => x.key === `d:${d.device_id}` || (Array.isArray(x.target) && x.target.includes(`d:${d.device_id}`)));
  const ms = t ? t.endsMs : c.ui.ns && c.ui.ns.id === d.device_id && c.ui.ns.until > Date.now() ? c.ui.ns.until : null;
  if (!ms) return null;
  return c.RT.fmtTime(c.RT.zparts(new Date(ms)).hm);
}

const MOON = '<svg class="ns-moon" width="36" height="36" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" fill="currentColor"/></svg>';

export function view(c) {
  const { esc, icon, data } = c;
  const d = nightLamp(c);
  const off = c.conn() === 'off';
  const lv = d ? data.level(d.device_id) || 0 : 0;
  const on = !!d && lv > 0;
  const hint = c.ui.nsHint && Date.now() - c.ui.nsHint < 2000;
  let area, title, sub;
  if (!d) {
    area = 'data-act="ns-pick"'; title = 'Pick a light for night'; sub = 'Once, and it stays chosen';
  } else if (off) {
    area = ''; title = 'Night light'; sub = "Can't reach the house. Your remotes still work.";
  } else if (on) {
    const at = offAt(c, d);
    area = 'data-act="ns-off"'; title = 'Off'; sub = `${d.name} · ${lv}%${at ? ` · off by itself at ${at}` : ''}`;
  } else {
    area = 'data-hold="ns-on" data-ms="250" data-act="ns-tap"'; title = 'Night light'; sub = hint ? 'Hold it' : 'Rest your thumb to turn on';
  }
  // The one light on the page is the lamp's real light: drawn at the night light's level and candle white while the
  // lamp is on, and held at 0.85 and nothing while it is off, so on and off are the dimmer's scale and opacity pair.
  const glow = d ? glowHTML({ level: LEVEL, kelvin: 1900, ctx: 'hero', gain: 0.75, cls: `ns-glow${on ? '' : ' off'}`, name: 'night-light' }) : '';
  return `<div class="ns-page${on ? ' on' : ''}">
    <header class="ns-top"><button class="ns-home" data-go="home">${icon('home', 24, 1.6)}<span>Home</span></button></header>
    <div class="ns-time" aria-label="The time">${esc(clock(c.RT.nowHm()))}</div>
    <div class="ns-area${on ? ' on' : ''}${off ? ' offline' : ''}" ${area} role="button" tabindex="0" aria-label="${esc(on ? `Turn ${d.name} off` : title)}">
      <span class="ns-ring" aria-hidden="true">${glow}
        <svg width="112" height="112" viewBox="0 0 112 112"><circle class="ns-track" cx="56" cy="56" r="55.5"/><circle class="ns-fill" cx="56" cy="56" r="55.5" pathLength="1" transform="rotate(-90 56 56)"/></svg></span>
      ${MOON}
      <span class="ns-lbl" data-xf="standard"><span class="ns-title">${esc(title)}</span><span class="ns-sub">${esc(sub)}</span></span>
    </div>
  </div>`;
}

// When the night ends while the page is showing, it goes back to Home. Entered by day (from Settings), it stays.
export function after(c) {
  const n = nightNow(c);
  const ns = c.ui.nsNight || (c.ui.nsNight = { was: n });
  if (ns.was && !n) { c.ui.nsNight = null; setTimeout(() => c.goTab('home'), 0); return; }
  ns.was = n;
}
export function leave(c) { c.ui.nsNight = null; }

function pickSheet(c) {
  const { esc, icon, data } = c;
  const cur = nightLamp(c);
  const lights = data.controllable().filter(d => d.domain === 'light');
  const rows = lights.map(d => { const sel = cur && cur.device_id === d.device_id; return `<button class="row way two ${sel ? 'sel' : ''}" data-act="ns-set" data-v="${esc(d.device_id)}"><span class="radio ${sel ? 'on' : ''}">${sel ? icon('check', 14, 2.2) : ''}</span><span class="row-txt"><span class="t">${esc(d.name)}</span><span class="d">${esc(data.devAreaName(d))}</span></span></button>`; }).join('');
  return { over: 'Nightstand', title: 'Pick a light for night', key: 'ns-pick', body: `<p class="t-cap muted sheet-p">It comes on at 10%, as warm as it goes, and goes out by itself after 15 minutes.</p><div class="group">${rows}</div>` };
}

export const actions = {
  // a quarter of a second of a resting thumb: the lamp rises on the night fade, and its own timer puts it out
  async 'ns-on'(c) {
    const d = nightLamp(c); if (!d || c.conn() === 'off') return;
    const id = d.device_id, T = `d:${id}`;
    c.ui.ns = { id, until: Date.now() + MINUTES * 60000 };
    // a lamp that follows the day is already at the night's warmest; any other white lamp is asked for its warmest
    // white, so it comes on candle-warm rather than in whatever it was last left in
    const warm = d.ct && !c.DAY.isFollowing(id);
    const k = d.ct_range ? d.ct_range[0] : 2000;
    const going = c.turn(warm ? { type: 'color', target: T, kelvin: Math.max(1000, Math.round(k)), level: LEVEL, fade: 1.6 } : { type: 'level', target: T, level: LEVEL, fade: 1.6 });
    c.render();
    const ok = await going;
    if (ok) await c.run({ type: 'timer', target: T, minutes: MINUTES, level: 0, fade: 5 });
  },
  // a tap while it is off does nothing but say how
  'ns-tap'(c) { c.ui.nsHint = Date.now(); c.render(); setTimeout(() => c.render(), 2100); },
  // off is a tap, on the dimmer; a level set by hand drops the lamp's timer on its own (the connector's rule)
  'ns-off'(c) {
    const d = nightLamp(c); if (!d) return;
    c.ui.ns = null;
    c.turn({ type: 'level', target: `d:${d.device_id}`, level: 'off', fade: 0.4 });
    c.render();
  },
  'ns-pick'(c) { c.openSheet(pickSheet(c)); },
  'ns-set'(c, el) {
    const d = c.data.dev(el.dataset.v); if (!d) return;
    c.S.config.settings.night_light = d.device_id;
    c.closeSheet();
    c.save(`Night light: ${d.name}`);
  },
};
