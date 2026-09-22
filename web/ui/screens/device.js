// A device's own page, pushed from a tile: 04 Light (12731:22), 17 Fan (12744:111211), 18 Shade (12744:111298).
// No tab bar on any of them, as the file draws them. The white, colour, sleep timer, Follow the day and "about"
// pages hang off a light as #light/<id>/<page>.
import { CasetaDaylight } from '/data/index.js';
import { endsMs } from '/ui/screens/parts.js';
import { sheets as lookSheets, actions as lookActions } from '/ui/screens/looks.js';

export const noTabs = true;
// White, Colour and the sleep timer are sheets over this page (looks.js); the rest are pages of their own.
export const sheets = lookSheets;

const FAN = [['Off', 'Off'], ['Low', 'Low'], ['Medium', 'Medium'], ['MediumHigh', 'Med-high'], ['High', 'High']];
const FAN_WORD = { Off: 'Off', Low: 'Low', Medium: 'Medium', MediumHigh: 'Medium high', High: 'High' };
// The five swatches on the Colour tile, from the file's twelve lamp colours.
const TILE_SWATCHES = ['#FF5A4E', '#FFC24A', '#4FD39A', '#4C8DFF', '#A66BFF'];

// ---------- the arc ----------
// A half circle round (170, 170) of radius 150 inside a 340 x 190 box: 0% at the left end, 100% at the right.
const CX = 170, CY = 170, R = 150;
function arcPoint(p) { const a = Math.PI * (1 - p / 100); return [CX + R * Math.cos(a), CY - R * Math.sin(a)]; }
function arcPath(p) { const [x, y] = arcPoint(p); return `M20 170 A150 150 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`; }
function dialHTML(c, lv) {
  const { icon } = c;
  const [kx, ky] = arcPoint(lv);
  return `<div class="dial shifted" data-drag="dial" role="slider" aria-label="Brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${lv}">
    <svg viewBox="0 0 340 190" width="340" height="190" aria-hidden="true">
      <defs><linearGradient id="dialgrad" x1="20" y1="170" x2="150.919" y2="-53.421" gradientUnits="userSpaceOnUse">
        <stop stop-color="#F6E3CF"/><stop offset=".45" stop-color="#E8A774"/><stop offset="1" stop-color="#D98A4E"/></linearGradient></defs>
      <path class="trk" d="M20 170 A150 150 0 0 1 320 170"/>
      <path class="fil" d="${arcPath(lv)}" stroke="url(#dialgrad)" ${lv > 0 ? '' : 'visibility="hidden"'}/>
      <circle class="kn" cx="${kx.toFixed(2)}" cy="${ky.toFixed(2)}" r="12"/>
    </svg>
    <div class="lbl">Brightness</div>
    <div class="num"><b>${lv}</b><span>%</span></div>
    <button class="nudge minus" data-act="nudge" data-by="-5" aria-label="Dimmer">${icon('minus', 20, 1.7)}</button>
    <span class="lo">${icon('moon', 22, 1.7)}</span><span class="hi">${icon('sun', 22, 1.7)}</span>
    <button class="nudge plus" data-act="nudge" data-by="5" aria-label="Brighter">${icon('plus', 20, 1.7)}</button>
  </div>`;
}

function header(c, d) {
  const { icon, esc } = c;
  const starred = (c.S.config.favorites || []).includes(`d:${d.device_id}`);
  return `<header class="hdr">
    <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
    <button class="hdr-btn a2 ${starred ? 'starred' : ''}" data-act="star" aria-pressed="${starred}" aria-label="${starred ? 'Starred on Home' : 'Star on Home'}">${icon('star', 22, 1.7)}</button>
    <button class="hdr-btn a1" data-go="light/${esc(d.device_id)}/about" aria-label="About this ${d.domain === 'fan' ? 'fan' : d.domain === 'cover' ? 'shade' : 'light'}">${icon('dots', 22, 1.7)}</button>
  </header>`;
}

function feature(c, { act, go, glyph, title, sub, on, disabled }) {
  return `<button class="feat ${on ? 'on' : ''}" ${act ? `data-act="${act}"` : ''} ${go ? `data-go="${c.esc(go)}"` : ''} ${disabled ? 'disabled' : ''}>
    <span class="c">${c.icon(glyph, 20, 1.7)}</span><span class="t">${c.esc(title)}</span><span class="d">${c.esc(sub)}</span></button>`;
}

function timerLine(c, id) {
  for (const [t, v] of Object.entries(c.S.timers || {})) {
    if (!v || !v.ends_at) continue;
    if (c.data.targetDevices(t.includes('|') ? t.split('|') : t).includes(id)) {
      const m = Math.max(1, Math.round((endsMs(v.ends_at) - Date.now()) / 60000));
      return `${m} min left`;
    }
  }
  return null;
}

// ---------- the page ----------
export function view(c, r) {
  const d = c.data.dev(r.id);
  if (!d) return `<div class="dev"><header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${c.icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">That light is gone</h1><p class="t-body muted soon">It is no longer in your home.</p></div>`;
  if (d.domain === 'fan') return fanView(c, d);
  if (d.domain === 'cover') return shadeView(c, d);
  return lightView(c, d);
}

function lightView(c, d) {
  const { data, icon, esc, S } = c;
  const id = d.device_id;
  const lv = data.level(id) || 0;
  const on = lv > 0;
  const dim = d.domain === 'light';
  const col = (S.states[id] || {}).color || null;
  const showingWhite = on && col && col.mode === 'ct' && col.kelvin;
  const showingColour = on && col && col.mode === 'xy' && col.hex;
  const tl = on ? timerLine(c, id) : null;
  const follow = c.DAY.canFollow(d);
  const following = follow && c.DAY.isFollowing(id);
  const looks = [];
  if (d.ct) {
    const k = showingWhite ? Math.round(col.kelvin / 100) * 100 : null;
    looks.push(`<button class="look ${showingWhite ? 'showing' : ''}" data-go="light/${esc(id)}/white">
      <span class="c">${icon('sun', 20, 1.7)}</span>${showingWhite ? '<span class="tag">Showing</span>' : ''}
      <span class="t">White</span><span class="d ${k ? '' : 'q'}">${k ? `${k}K · ${esc(CasetaDaylight.warmthName(col.kelvin))}` : 'Warm to daylight'}</span></button>`);
  }
  if (d.color) {
    looks.push(`<button class="look ${showingColour ? 'showing' : ''}" data-go="light/${esc(id)}/colour">
      <span class="c" ${showingColour ? `style="background:${esc(col.hex)}"` : ''}>${icon('palette', 20, 1.7)}</span>${showingColour ? '<span class="tag">Showing</span>' : `<span class="sw">${TILE_SWATCHES.map(h => `<i style="background:${h}"></i>`).join('')}</span>`}
      <span class="t">Colour</span><span class="d ${showingColour ? '' : 'q'}">${showingColour ? 'Your colour' : 'Any colour'}</span></button>`);
  }
  const feats = [];
  if (follow) feats.push(feature(c, { go: `light/${id}/follow`, glyph: 'sunrise', title: 'Follow the day', sub: following ? (c.DAY.followPaused(id) ? 'Paused' : 'On') : 'Off', on: following }));
  feats.push(feature(c, { go: `light/${id}/timer`, glyph: 'timer', title: 'Sleep timer', sub: tl || 'Off', on: !!tl, disabled: !on && !tl }));
  // the page closes up where a lamp has no white or colour: the pills and the dial sit under the switch instead
  const shift = looks.length ? 0 : -144;
  return `<div class="dev ${on ? 'on' : ''}" style="--shift:${shift}px">
    <span class="halo"></span>
    <img class="hero-art" src="${c.artSrc(c.deviceArt(c, d))}" alt="">
    ${header(c, d)}
    <div class="where">${esc(data.devAreaName(d) || '')}</div>
    <h1 class="t-hero">${esc(d.name)}</h1>
    <div class="onoff">
      <button data-act="dev-on" aria-pressed="${on}">${icon('power', 22, 2)}<span>${on && dim ? `On · <span data-lv>${lv}</span>%` : 'On'}</span></button>
      <button data-act="dev-off" aria-pressed="${!on}">${icon('power', 22, 2)}Off</button>
    </div>
    ${looks.length ? `<div class="looks">${looks.join('')}</div>` : ''}
    <div class="feats shifted">${feats.join('')}</div>
    ${dim ? dialHTML(c, lv) : ''}
  </div>`;
}

function fanView(c, d) {
  const { data, icon, esc, S } = c;
  const id = d.device_id;
  const sp = data.isOn(id) ? ((S.states[id] || {}).fan_speed || 'Medium') : 'Off';
  const idx = Math.max(0, FAN.findIndex(([k]) => k === sp));
  const on = idx > 0;
  const tl = on ? timerLine(c, id) : null;
  const bars = FAN.map(([k, label], i) => `<button class="step ${i <= idx ? 'fill' : ''} ${i === idx ? 'sel' : ''}" data-act="fan-speed" data-speed="${k}" style="left:${60 + i * 62}px;top:${250 - i * 32}px;height:${40 + i * 32}px" aria-label="${FAN_WORD[k]}" aria-pressed="${i === idx}"></button>
    <span class="steplbl ${i === idx ? 'sel' : ''}" style="left:${82 + i * 62}px">${label}</span>`).join('');
  return `<div class="dev is-fan ${on ? 'on' : ''}">
    <span class="halo"></span>
    <img class="hero-art" src="${c.artSrc('light-ceiling-fan')}" alt="">
    ${header(c, d)}
    <div class="where">${esc(data.devAreaName(d) || '')}</div>
    <h1 class="t-hero">${esc(d.name)}</h1>
    <div class="onoff blue">
      <button data-act="dev-on" aria-pressed="${on}">${icon('power', 22, 2)}${on ? `On · ${FAN_WORD[sp]}` : 'On'}</button>
      <button data-act="dev-off" aria-pressed="${!on}">${icon('power', 22, 2)}Off</button>
    </div>
    <div class="feats fan-feats">
      ${feature(c, { go: `light/${id}/timer`, glyph: 'timer', title: 'Sleep timer', sub: tl || 'Off', on: !!tl, disabled: !on && !tl })}
      ${feature(c, { glyph: 'moon', title: 'Goodnight', sub: 'Stops with it', on: false })}
    </div>
    <div class="speeds">
      <div class="lbl">Speed</div>
      <div class="big">${FAN_WORD[sp]}</div>
      ${bars}
      <button class="nudge minus" data-act="fan-step" data-by="-1" aria-label="Slower">${icon('minus', 22, 1.7)}</button>
      <span class="fa lo">${icon('fan', 24, 1.7)}</span><span class="fa hi">${icon('fan', 24, 1.7)}</span>
      <button class="nudge plus" data-act="fan-step" data-by="1" aria-label="Faster">${icon('plus', 22, 1.7)}</button>
    </div>
  </div>`;
}

function shadeView(c, d) {
  const { data, icon, esc } = c;
  const id = d.device_id;
  const open = Math.max(0, Math.min(100, data.level(id) ?? 0));
  const moving = c.ui.moving && c.ui.moving[id] && Date.now() - c.ui.moving[id] < 30000;
  return `<div class="dev is-shade ${open > 0 ? 'on' : ''}" style="--down:${100 - open}">
    <span class="halo"></span>
    <img class="hero-art" src="${c.artSrc('lutron-rollershades')}" alt="">
    ${header(c, d)}
    <div class="where">${esc(data.devAreaName(d) || '')}</div>
    <h1 class="t-hero">${esc(d.name)}</h1>
    <div class="window" data-drag="shade" role="slider" aria-label="How far open" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${open}">
      <span class="sun"></span><span class="sill"></span>
      <span class="fabric"><span class="hem"></span></span><span class="roller"></span>
      <span class="handle"><i></i></span>
    </div>
    <div class="readout"><span class="tick"></span><b data-open>${open}%</b><span>open</span></div>
    <div class="shade-btns">
      <button class="sbtn" data-act="shade" data-cmd="raise" aria-label="Open"><span class="c">${icon('chev', 24, 1.8).replace('<g ', '<g transform="rotate(-90 12 12)" ')}</span><span class="l">Open</span></button>
      <button class="sbtn stop ${moving ? 'moving' : ''}" data-act="shade" data-cmd="stop" aria-label="Stop"><span class="c"><i></i></span><span class="l">Stop</span></button>
      <button class="sbtn" data-act="shade" data-cmd="lower" aria-label="Close"><span class="c">${icon('chevD', 24, 1.8)}</span><span class="l">Close</span></button>
    </div>
    <div class="group shade-gn"><div class="row has-ic"><span class="row-ic">${icon('moon', 20, 1.7)}</span><span class="row-txt"><span class="t">Closes with Goodnight</span></span><span class="row-val">Always</span></div></div>
  </div>`;
}

// ---------- dragging ----------
export function after(c, r, root) {
  const d = c.data.dev(r.id); if (!d) return;
  const id = d.device_id;
  if (d.domain === 'light') wireDial(c, id, root.querySelector('[data-drag="dial"]'));
  if (d.domain === 'cover') wireShade(c, id, root.querySelector('[data-drag="shade"]'));
}

function paintDial(el, v) {
  const [kx, ky] = arcPoint(v);
  const fil = el.querySelector('.fil'), kn = el.querySelector('.kn');
  fil.setAttribute('d', arcPath(v)); fil.setAttribute('visibility', v > 0 ? 'visible' : 'hidden');
  kn.setAttribute('cx', kx.toFixed(2)); kn.setAttribute('cy', ky.toFixed(2));
  el.querySelector('.num b').textContent = v;
  el.setAttribute('aria-valuenow', v);
  const lvl = document.querySelector('.dev [data-lv]'); if (lvl) lvl.textContent = v;
}

function wireDial(c, id, el) {
  if (!el) return;
  const svg = el.querySelector('svg');
  const at = e => {
    const b = svg.getBoundingClientRect(); const s = b.width / 340;
    const cx = b.left + CX * s, cy = b.top + CY * s;
    let a = Math.atan2(cy - e.clientY, e.clientX - cx);
    if (a < 0) a = e.clientX < cx ? Math.PI : 0;
    return Math.round((1 - a / Math.PI) * 100);
  };
  const near = e => { const b = svg.getBoundingClientRect(); const s = b.width / 340; const dx = e.clientX - (b.left + CX * s), dy = e.clientY - (b.top + CY * s); const r = Math.hypot(dx, dy) / s; return r > 100 && r < 200 && dy < 20 * s; };
  const set = v => {
    v = Math.max(0, Math.min(100, v));
    paintDial(el, v);
    c.assume([id], v);
    c.gate.sendLevel(`d:${id}`, v);
    el.closest('.dev').classList.toggle('on', v > 0);
  };
  svg.addEventListener('pointerdown', e => { if (!near(e)) return; e.preventDefault(); c.ui.dragging = true; svg.setPointerCapture(e.pointerId); set(at(e)); });
  svg.addEventListener('pointermove', e => { if (c.ui.dragging && svg.hasPointerCapture(e.pointerId)) set(at(e)); });
  const end = () => { if (c.ui.dragging) c.endDrag(); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

function wireShade(c, id, el) {
  if (!el) return;
  const at = e => { const b = el.getBoundingClientRect(); return Math.round(100 - Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) * 100); };
  const set = v => {
    const page = el.closest('.dev');
    page.style.setProperty('--down', 100 - v);
    page.querySelector('[data-open]').textContent = `${v}%`;
    el.setAttribute('aria-valuenow', v);
    c.assume([id], v);
    c.gate.sendLevel(`d:${id}`, v);
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); c.ui.dragging = true; el.setPointerCapture(e.pointerId); set(at(e)); });
  el.addEventListener('pointermove', e => { if (c.ui.dragging && el.hasPointerCapture(e.pointerId)) set(at(e)); });
  const end = () => { if (c.ui.dragging) c.endDrag(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

// ---------- taps ----------
export const actions = {
  ...lookActions,
  'dev-on'(c, el, r) {
    const d = c.data.dev(r.id); if (!d || c.data.isOn(r.id)) return;
    if (d.domain === 'fan') { fanTo(c, r.id, 'Medium'); return; }
    c.assume([r.id], d.domain === 'light' ? (c.S.config.settings.group_on_level || 100) : 100); c.soon();
    c.run({ type: 'level', target: `d:${r.id}`, level: 'on' });
  },
  'dev-off'(c, el, r) {
    const d = c.data.dev(r.id); if (!d || !c.data.isOn(r.id)) return;
    if (d.domain === 'fan') { fanTo(c, r.id, 'Off'); return; }
    c.assume([r.id], 0); c.soon();
    c.run({ type: 'level', target: `d:${r.id}`, level: 'off' });
  },
  nudge(c, el, r) {
    const v = Math.max(1, Math.min(100, (c.data.level(r.id) || 0) + Number(el.dataset.by)));
    c.assume([r.id], v); c.soon();
    c.gate.sendLevel(`d:${r.id}`, v);
  },
  star(c, el, r) {
    const t = `d:${r.id}`; const f = c.S.config.favorites || (c.S.config.favorites = []);
    const i = f.indexOf(t);
    if (i >= 0) f.splice(i, 1); else f.push(t);
    c.save(i >= 0 ? 'Taken off Home' : 'Starred on Home');
  },
  'fan-speed'(c, el, r) { fanTo(c, r.id, el.dataset.speed); },
  'fan-step'(c, el, r) {
    const sp = c.data.isOn(r.id) ? ((c.S.states[r.id] || {}).fan_speed || 'Medium') : 'Off';
    const i = Math.max(0, Math.min(FAN.length - 1, FAN.findIndex(([k]) => k === sp) + Number(el.dataset.by)));
    fanTo(c, r.id, FAN[i][0]);
  },
  shade(c, el, r) {
    const cmd = el.dataset.cmd;
    c.ui.moving = c.ui.moving || {};
    if (cmd === 'stop') delete c.ui.moving[r.id]; else c.ui.moving[r.id] = Date.now();
    c.run({ type: cmd, target: `d:${r.id}` });
    c.soon();
  },
};

function fanTo(c, id, speed) {
  c.S.states[id] = { ...(c.S.states[id] || {}), fan_speed: speed, level: speed === 'Off' ? 0 : 100 };
  c.soon();
  c.run({ type: 'fan', target: `d:${id}`, speed });
}
