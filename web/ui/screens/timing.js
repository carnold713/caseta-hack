// 25 · Press timing (12747:80): how long the app waits to tell a press from a double press, and how long a finger
// has to stay down to be a hold. A live tester at the top hears a real remote and draws the taps it heard against
// the window, so the numbers can be set by feel.
import { picoSVG } from '/ui/pico.js';

export const noTabs = false;

const DOUBLE = { min: 150, max: 1500 }, HOLD = { min: 250, max: 3000 };
const secs = ms => `${(ms / 1000).toFixed(ms % 100 ? 2 : 1).replace(/0$/, '')} s`;
const pct = (v, r) => Math.round(((v - r.min) / (r.max - r.min)) * 100);
const WORD = { single: 'Press', double: 'Press twice', hold: 'Hold', hold_start: 'Hold', hold_end: 'Hold' };

function slider(label, key, v, range) {
  return `<div class="tm-row"><div class="tm-top"><span class="t-row">${label}</span><span class="t-row" data-val="${key}">${secs(v)}</span></div>
    <input class="tm-range" type="range" min="${range.min}" max="${range.max}" step="10" value="${v}" data-tm="${key}" style="--p:${pct(v, range)}%" aria-label="${label}"></div>`;
}

export function view(c) {
  const { icon, esc } = c;
  const s = c.S.config.settings;
  const dbl = s.double_ms || 350, hold = s.hold_ms || 500;
  const h = c.ui.heard;
  // the chart: 0 to 212 px is the double-press window stretched to a readable width
  let chart = '';
  if (h && h.gap != null) {
    const span = Math.max(dbl, h.gap) * 1.25;
    const x = ms => Math.round(22 + (ms / span) * 190);
    chart = `<div class="tm-chart">
      <i class="win" style="left:30px;width:${x(dbl) - 30}px"></i><i class="axis"></i>
      <i class="tap" style="left:${x(0) - 8}px"></i><i class="tap" style="left:${x(h.gap) - 8}px"></i>
      <i class="br" style="left:${x(0)}px;width:${x(h.gap) - x(0)}px"></i><span class="gap" style="left:${Math.round((x(0) + x(h.gap)) / 2)}px">${secs(h.gap)}</span>
      <span class="tl" style="left:${x(0)}px">tap</span><span class="tl" style="left:${x(h.gap)}px">tap</span><span class="wl">${secs(dbl)}</span></div>`;
  } else if (h && h.held != null) {
    chart = `<p class="tm-held">Held ${secs(h.held)}</p>`;
  }
  return `<div class="timing-page">
    <header class="hdr bar"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1 bar-t bar-pin">Press timing</h1>
    <div class="tm-card ${h && Date.now() - h.at < 1600 ? 'live' : ''}">
      <p class="tm-prompt">${h ? esc(h.who) : 'Press a remote'}</p>
      <div class="tm-rings"><i class="r0"></i><i class="r1"></i><i class="r2"></i><i class="r3"></i><span class="tm-pico">${remoteNow(c, h)}</span></div>
      <p class="tm-heard">${h && h.gesture ? esc(WORD[h.gesture] || h.gesture) : 'Listening'}</p>
      ${chart}
    </div>
    <div class="group tm-group">${slider('Press twice within', 'double_ms', dbl, DOUBLE)}${slider('Hold after', 'hold_ms', hold, HOLD)}</div>
  </div>`;
}

// The remote last heard, drawn small in the middle of the rings; before any press, the first remote in the house.
function remoteNow(c, h) {
  const d = (h && c.data.dev(h.device)) || c.data.remotes()[0];
  return picoSVG(d ? { model: c.REM.modelFor(d), finish: c.REM.finishFor(d), keys: c.REM.slots(d), height: 90 } : { height: 90 });
}

export function after(c, r, root) {
  root.querySelectorAll('input[data-tm]').forEach(inp => {
    const key = inp.dataset.tm; const range = key === 'double_ms' ? DOUBLE : HOLD;
    inp.addEventListener('pointerdown', () => { c.ui.dragging = true; });
    inp.addEventListener('input', () => {
      const v = Number(inp.value);
      inp.style.setProperty('--p', `${pct(v, range)}%`);
      const lab = root.querySelector(`[data-val="${key}"]`); if (lab) lab.textContent = secs(v);
      c.S.config.settings[key] = v;
      c.saveSoon(600);
    });
    const end = () => c.endDrag();
    inp.addEventListener('change', end); inp.addEventListener('pointerup', end); inp.addEventListener('pointercancel', end);
  });
}

export const actions = {};

// What a real remote just did: the time between two taps, how long a finger stayed down, and what the app made of it.
export function live(c, m) {
  const d = c.data.dev(m.device_id);
  const h = c.ui.heard && Date.now() - c.ui.heard.at < 4000 && c.ui.heard.device === m.device_id ? c.ui.heard : { taps: [], device: m.device_id };
  h.who = d ? `${d.name} · ${c.REM.buttonName(m.device_id, m.button_number)}` : 'A remote';
  h.at = Date.now();
  if (m.type === 'button') {
    if (m.event === 'Press') { h.down = Date.now(); h.taps = [...(h.taps || []), Date.now()].slice(-2); h.gesture = null; h.held = null; }
    if (m.event === 'Release' && h.down) h.held = Date.now() - h.down;
    h.gap = h.taps.length === 2 ? h.taps[1] - h.taps[0] : null;
  } else {
    h.gesture = m.gesture;
    // only two taps the app really heard are drawn; a double press it was told about but did not time is just named
    if (m.gesture !== 'double') h.gap = null;
  }
  c.ui.heard = h;
}
