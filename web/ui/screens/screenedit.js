// Light positions (#screen/<room id>): where each light that follows the PC's screen stands around it, which part of
// the screen it takes its colour from, and how bright it is shown. A page of its own, so a computer's window can give
// it room; on a phone the stage sits above the inspector, side by side on anything wider.
//
// The stage is the screen on a wall, live: the connector shows the page the computer's 16 x 9 grid and every light's
// colour while the page is open (agent/screensync.py _live, asked for every few seconds with op "watch"). Each light
// is a dot in the colour it is being sent; a gradient light is a bar of its sections' colours, upright for one that
// stands. The selected light's part of the screen is lit and the rest dimmed, so what drives it can be seen; a zone
// set by hand is a rectangle with corners to pull. Everything snaps to the screen's own grid (the 16 x 9 cells the
// connector works from, carried on past its edges) unless Snap is off.
//
// Settings are settings.screen_sync.lights[id]: x, y (screen units: -1 to 1 is the screen's width and height), on,
// span and flip (a gradient light), gain (brightness, 1 as the screen is), zone {x0, y0, x1, y1} (on the screen).
export const noTabs = true;

const SX = 2.5, SY = 2.5;                    // the stage shows this far either way of the screen's middle
const CW = 16, CH = 9;                       // the connector's grid
const STEP_X = 2 / CW, STEP_Y = 2 / CH;      // one cell, in screen units
const SPREAD = 0.15, SPREAD_V = 0.3;         // how a light with no zone looks around its place (screensync.py weights)
const WATCH_MS = 8000;

const px = x => (((x + SX) / (2 * SX)) * 100);
const py = y => (((y + SY) / (2 * SY)) * 100);
const f2 = v => v.toFixed(2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sync = c => ((c.S.agent && c.S.agent.info) || {}).screen_sync || null;
const snapOn = c => c.ui.seSnap !== false;
const snapX = (c, x) => (snapOn(c) ? Math.round(x / STEP_X) * STEP_X : x);
const snapY = (c, y) => (snapOn(c) ? -1 + Math.round((y + 1) / STEP_Y) * STEP_Y : y);
const r4 = v => Math.round(v * 10000) / 10000;

// The room's lights that can follow, as the connector places them, with what the page has changed on top
function lightsHere(c, aid) {
  const s = sync(c);
  const mine = (((c.S.config.settings || {}).screen_sync || {}).lights) || {};
  const placed = s && s.room === aid ? (s.placed || []) : [];
  return placed.map(p => {
    const m = mine[p.id] || {};
    const d = c.data.dev(p.id);
    return {
      ...p, name: (d && d.name) || p.name,
      x: typeof m.x === 'number' ? m.x : p.x, y: typeof m.y === 'number' ? m.y : p.y, on: m.on !== false,
      span: typeof m.span === 'number' ? m.span : p.span, flip: 'flip' in m ? m.flip === true : !!p.flip,
      gain: typeof m.gain === 'number' ? m.gain : (p.gain || 1),
      zone: m.zone && typeof m.zone === 'object' ? m.zone : (m.zone === null ? null : p.zone || null),
    };
  });
}

// ---------- which part of the screen a light looks at (the connector's own sums, screensync.py) ----------
function pointWeights(x, y) {
  const cu = (clamp(x, -1, 1) + 1) / 2, cv = (clamp(y, -1, 1) + 1) / 2;
  const out = [];
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
    const u = (i + 0.5) / CW, v = (j + 0.5) / CH;
    out.push(Math.exp(-((u - cu) ** 2) / (2 * SPREAD ** 2)) * Math.exp(-((v - cv) ** 2) / (2 * SPREAD_V ** 2)));
  }
  return out;
}
function zoneWeights(z) {
  const u0 = (clamp(z.x0, -1, 1) + 1) / 2, u1 = (clamp(z.x1, -1, 1) + 1) / 2, v0 = (clamp(z.y0, -1, 1) + 1) / 2, v1 = (clamp(z.y1, -1, 1) + 1) / 2;
  const out = [];
  for (let j = 0; j < CH; j++) {
    const oy = Math.max(0, Math.min(v1, (j + 1) / CH) - Math.max(v0, j / CH));
    for (let i = 0; i < CW; i++) out.push(Math.max(0, Math.min(u1, (i + 1) / CW) - Math.max(u0, i / CW)) * oy);
  }
  return out;
}
function splitZone(z, n, upright, flip) {
  const tall = upright || (z.y1 - z.y0) * 9 > (z.x1 - z.x0) * 16;
  const parts = [];
  for (let k = 0; k < n; k++) {
    const a = k / n, b = (k + 1) / n;
    parts.push(tall ? { x0: z.x0, y0: z.y1 - b * (z.y1 - z.y0), x1: z.x1, y1: z.y1 - a * (z.y1 - z.y0) }
      : { x0: z.x0 + a * (z.x1 - z.x0), y0: z.y0, x1: z.x0 + b * (z.x1 - z.x0), y1: z.y1 });
  }
  return flip ? parts.reverse() : parts;
}
// Each of a light's sections, where it looks: a zone ({x0..}) or a point ({x, y})
function regions(d) {
  const n = Math.max(1, d.segments || 1);
  if (d.zone) return d.kind === 'nanoleaf' ? [d.zone] : splitZone(d.zone, n, d.upright, d.flip);
  if (n === 1) return [{ x: d.x, y: d.y }];
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1) - 0.5) * (d.flip ? -1 : 1) * (d.span || 2);
    out.push(d.upright ? { x: d.x, y: d.y - t } : { x: d.x + t, y: d.y });
  }
  return out;
}
// How much each cell counts towards the light, the strongest cell 1
function lightWeights(d) {
  const all = regions(d).map(r => ('x0' in r ? zoneWeights(r) : pointWeights(r.x, r.y))).map(w => { const m = Math.max(...w) || 1; return w.map(v => v / m); });
  return all[0].map((_, i) => Math.max(...all.map(w => w[i])));
}

// ---------- drawing ----------
function gridLines() {
  const W = 1000, H = 562.5;
  const X = x => (px(x) / 100) * W, Y = y => (py(y) / 100) * H;
  let minor = '', major = '';
  const mod = (a, b) => ((a % b) + b) % b;
  // a line on every cell's edge, carried on past the screen; a stronger one every four cells across and at the
  // screen's top and bottom
  for (let k = Math.ceil(-SX / STEP_X); k <= Math.floor(SX / STEP_X); k++) {
    const d = `M${X(k * STEP_X).toFixed(1)} 0V${H}`;
    if (mod(k, 4) === 0) major += d; else minor += d;
  }
  for (let k = Math.ceil((-SY + 1) / STEP_Y); k <= Math.floor((SY + 1) / STEP_Y); k++) {
    const d = `M0 ${Y(-1 + k * STEP_Y).toFixed(1)}H${W}`;
    if (mod(k, 9) === 0) major += d; else minor += d;
  }
  // the screen's middle, across and up
  major += `M${X(0)} 0V${H}M0 ${Y(0)}H${W}`;
  return `<svg class="se-lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path class="mi" d="${minor}"/><path class="ma" d="${major}"/></svg>`;
}
const boxStyle = z => `left:${f2(px(z.x0))}%;top:${f2(py(z.y0))}%;width:${f2(px(z.x1) - px(z.x0))}%;height:${f2(py(z.y1) - py(z.y0))}%`;
function barBox(d) {
  const span = d.span || 2;
  if (d.upright) {
    const t = Math.max(-SY, d.y - span / 2), b = Math.min(SY, d.y + span / 2);
    return `left:${f2(px(d.x))}%;top:${f2(py(t))}%;height:${f2(py(b) - py(t))}%`;
  }
  const l = Math.max(-SX, d.x - span / 2), r = Math.min(SX, d.x + span / 2);
  return `top:${f2(py(d.y))}%;left:${f2(px(l))}%;width:${f2(px(r) - px(l))}%`;
}
const liveOf = (c, id) => ((c.ui.syncLive && c.ui.syncLive.lights) || {})[id] || null;
const avgHex = list => {
  if (!list || !list.length) return null;
  const s = [0, 0, 0];
  for (const h of list) for (let k = 0; k < 3; k++) s[k] += parseInt(h.slice(k * 2, k * 2 + 2), 16);
  return `#${s.map(v => Math.round(v / list.length).toString(16).padStart(2, '0')).join('')}`;
};
const ZONES = [['left', 'Left edge'], ['right', 'Right edge'], ['top', 'Top'], ['bottom', 'Bottom'], ['middle', 'Middle'], ['whole', 'Whole screen']];
const PRESET = {
  left: { x0: -1, y0: -1, x1: -0.5, y1: 1 }, right: { x0: 0.5, y0: -1, x1: 1, y1: 1 }, top: { x0: -1, y0: -1, x1: 1, y1: -1 + 3 * STEP_Y },
  bottom: { x0: -1, y0: 1 - 3 * STEP_Y, x1: 1, y1: 1 }, middle: { x0: -0.5, y0: -1 + 2 * STEP_Y, x1: 0.5, y1: 1 - 2 * STEP_Y }, whole: { x0: -1, y0: -1, x1: 1, y1: 1 },
};

export function view(c, r) {
  const { esc, icon } = c;
  const aid = r.id;
  if (c.ui.seSnap === undefined) { try { c.ui.seSnap = localStorage.getItem('se-snap') !== '0'; } catch (_) { c.ui.seSnap = true; } }
  const s = sync(c);
  const list = lightsHere(c, aid);
  if (!c.ui.seSel || !list.some(d => d.id === c.ui.seSel)) c.ui.seSel = (list[0] || {}).id || null;
  const sel = list.find(d => d.id === c.ui.seSel) || null;
  const pc = (s && s.room === aid && s.pc) || {};
  const ds = Array.isArray(pc.displays) ? pc.displays : [];
  const asked = ((c.S.config.settings || {}).screen_sync || {}).display;
  const mine = asked && (!asked.pc || asked.pc === pc.name) && ds.some(d => d.id === asked.id) && Date.now() - asked.at < 30000 ? asked.id : null;
  const showing = mine || pc.display || (ds.find(d => d.main) || ds[0] || {}).id;
  const head = `<header class="hdr bar"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1 bar-t bar-pin">Light positions</h1>
    <p class="t-cap muted se-over">${esc(c.data.areaName(aid) || '')}${pc.name ? ` · ${esc(pc.name)}` : ''}</p>`;
  if (!list.length) {
    return `<div class="se-page">${head}<p class="t-cap muted se-empty">${s && s.room === aid ? 'Nothing in this room can follow the screen.' : 'Waiting for the connector.'}</p></div>`;
  }
  const zones = list.filter(d => d.zone).map(d => `<div class="se-zone ${d.id === c.ui.seSel ? 'sel' : ''} ${d.on ? '' : 'out'}" data-zone="${esc(d.id)}" style="${boxStyle(d.zone)}">
      <span class="se-zl">${esc(d.name)}</span>${d.id === c.ui.seSel ? ['nw', 'ne', 'sw', 'se'].map(k => `<b class="se-h ${k}" data-hz="${k}"></b>`).join('') : ''}</div>`).join('');
  const bars = list.filter(d => (d.segments || 1) > 1).map(d => {
    const hx = liveOf(c, d.id);
    const grad = hx && hx.length ? `linear-gradient(${d.upright ? 'to top' : 'to right'}, ${(d.flip ? [...hx].reverse() : hx).map(h => `#${h}`).join(', ')})` : '';
    return `<div class="se-bar ${d.upright ? 'up' : ''} ${d.on ? '' : 'out'} ${d.id === c.ui.seSel ? 'sel' : ''}" data-bar="${esc(d.id)}" data-w="${d.span}" style="${barBox(d)}">
      <i class="se-fill" style="${grad ? `background:${grad}` : ''}"></i><i class="se-end ${d.flip ? 'flip' : ''}"></i>
      <b class="se-len" data-selen="${esc(d.id)}" aria-label="Length of ${esc(d.name)}"></b></div>`;
  }).join('');
  const dots = list.map(d => {
    const col = avgHex(liveOf(c, d.id));
    return `<button class="se-dot ${d.on ? '' : 'out'} ${d.id === c.ui.seSel ? 'sel' : ''}" data-seid="${esc(d.id)}" data-x0="${d.x}" data-y0="${d.y}" style="left:${f2(px(d.x))}%;top:${f2(py(d.y))}%" aria-label="${esc(d.name)}">
      <span class="se-disc" ${col ? `style="background:${col}"` : ''}></span><span class="se-name">${esc(d.name)}</span></button>`;
  }).join('');
  const stage = `<div class="se-stage ${snapOn(c) ? 'snap' : ''}" data-aid="${esc(aid)}">
      ${gridLines()}
      <div class="se-screen" style="left:${px(-1)}%;top:${py(-1)}%;width:${px(1) - px(-1)}%;height:${py(1) - py(-1)}%">
        <canvas class="se-live" width="${CW}" height="${CH}"></canvas><canvas class="se-mask" width="${CW}" height="${CH}"></canvas>
        <span class="se-wait">${c.ui.syncLive && c.ui.syncLive.grid ? '' : 'Waiting for the screen'}</span></div>
      ${zones}${bars}<i class="se-guide v" hidden></i><i class="se-guide h" hidden></i>${dots}
    </div>`;
  const tools = `<div class="se-tools">
      <button class="chip sm" data-act="se-snap" aria-pressed="${snapOn(c)}">Snap to grid</button>
      ${ds.length > 1 ? ds.map(d => `<button class="chip sm" data-act="se-display" data-id="${esc(d.id)}" data-pc="${esc(pc.name || '')}" aria-pressed="${d.id === showing}">${esc(d.name)}</button>`).join('') : ''}
    </div>`;
  return `<div class="se-page">${head}
    <div class="se-wrap">
      <div class="se-left">${tools}${stage}
        <p class="t-cap muted se-hint">Drag each light to where it really is. The part of the screen that drives the selected light is lit.</p></div>
      <div class="se-panel">${sel ? inspector(c, sel) : ''}
        <div class="t-over sec-s">Lights</div>
        <div class="group se-list">${list.map(d => `<button class="row se-row ${d.id === c.ui.seSel ? 'sel' : ''}" data-act="se-pick" data-id="${esc(d.id)}">
            <span class="se-sw1" data-sw="${esc(d.id)}" style="${avgHex(liveOf(c, d.id)) ? `background:${avgHex(liveOf(c, d.id))}` : ''}"></span>
            <span class="row-txt"><span class="t">${esc(d.name)}</span><span class="d">${d.on ? `${Math.round(d.gain * 100)}%${d.zone ? ' · its own zone' : ''}` : 'Left out'}</span></span></button>`).join('')}</div>
        <div class="sheet-btns"><button class="pill ghost" data-act="se-reset">Start over</button></div>
      </div>
    </div></div>`;
}

function inspector(c, d) {
  const { esc } = c;
  const kind = d.kind === 'nanoleaf' ? 'Nanoleaf' : (d.segments || 1) > 1 ? `Hue · ${d.segments} sections${d.upright ? ', standing' : ''}` : 'Hue';
  const hx = liveOf(c, d.id) || [];
  const g = Math.round(d.gain * 100);
  return `<div class="se-insp">
    <div class="se-ihead"><div><p class="t-row se-iname">${esc(d.name)}</p><p class="t-cap muted">${kind}</p></div>
      <button class="toggle" role="switch" aria-checked="${d.on}" data-act="se-follow" data-id="${esc(d.id)}" aria-label="${esc(d.name)} follows the screen"></button></div>
    <div class="se-sws" data-sws="${esc(d.id)}">${(hx.length ? hx : ['']).map(h => `<i ${h ? `style="background:#${h}"` : ''}></i>`).join('')}</div>
    <div class="se-gain"><div class="tm-top"><span class="t-row">Brightness</span><span class="t-row" data-gainval>${g}%</span></div>
      <input class="tm-range" type="range" min="10" max="200" step="5" value="${g}" data-gain="${esc(d.id)}" style="--p:${((g - 10) / 190) * 100}%" aria-label="Brightness of ${esc(d.name)}"></div>
    <div class="t-over sec-s">Part of the screen</div>
    <div class="chip-wrap se-zones">
      <button class="chip sm" data-act="se-zone-auto" data-id="${esc(d.id)}" aria-pressed="${!d.zone}">Where it stands</button>
      ${ZONES.map(([k, t]) => `<button class="chip sm" data-act="se-zone" data-id="${esc(d.id)}" data-zone-preset="${k}" aria-pressed="${!!d.zone && JSON.stringify(d.zone) === JSON.stringify(PRESET[k])}">${t}</button>`).join('')}
    </div>
    <p class="t-cap muted se-zhint">${d.zone ? 'Drag the rectangle, or pull its corners, to choose exactly what it follows.' : 'It follows the part of the screen nearest where it stands.'}</p>
    ${(d.segments || 1) > 1 ? `<div class="se-irow"><span class="t-row">Sections run the other way</span><button class="toggle" role="switch" aria-checked="${d.flip}" data-act="se-flip" data-id="${esc(d.id)}" aria-label="Flip ${esc(d.name)}"></button></div>` : ''}
    <div class="se-irow"><button class="pill ghost" data-act="se-light-reset" data-id="${esc(d.id)}">Reset this light</button></div>
  </div>`;
}

// ---------- live: the screen and the lights' colours, painted in place (no redraw of the page) ----------
function paint(c, root) {
  const live = c.ui.syncLive || {};
  const cv = root.querySelector('.se-live');
  if (cv && live.grid && live.grid.w === CW && live.grid.h === CH) {
    const ctx2 = cv.getContext('2d'), img = ctx2.createImageData(CW, CH), hex = live.grid.rgb;
    for (let i = 0; i < CW * CH; i++) {
      for (let k = 0; k < 3; k++) img.data[i * 4 + k] = parseInt(hex.substr(i * 6 + k * 2, 2), 16);
      img.data[i * 4 + 3] = 255;
    }
    ctx2.putImageData(img, 0, 0);
    const w = root.querySelector('.se-wait'); if (w) w.textContent = '';
  }
  for (const [id, list] of Object.entries(live.lights || {})) {
    const col = avgHex(list);
    const dot = root.querySelector(`.se-dot[data-seid="${CSS.escape(id)}"] .se-disc`); if (dot) dot.style.background = col;
    const sw = root.querySelector(`[data-sw="${CSS.escape(id)}"]`); if (sw) sw.style.background = col;
    const sws = root.querySelector(`[data-sws="${CSS.escape(id)}"]`);
    if (sws) sws.innerHTML = list.map(h => `<i style="background:#${h}"></i>`).join('');
    const bar = root.querySelector(`.se-bar[data-bar="${CSS.escape(id)}"] .se-fill`);
    if (bar) {
      const up = bar.parentElement.classList.contains('up'), flip = !!bar.parentElement.querySelector('.se-end.flip');
      bar.style.background = `linear-gradient(${up ? 'to top' : 'to right'}, ${(flip ? [...list].reverse() : list).map(h => `#${h}`).join(', ')})`;
    }
  }
}
// the selected light's part of the screen lit, the rest dimmed
function mask(root, d) {
  const cv = root.querySelector('.se-mask');
  if (!cv) return;
  const ctx2 = cv.getContext('2d'), img = ctx2.createImageData(CW, CH);
  const w = d ? lightWeights(d) : null;
  for (let i = 0; i < CW * CH; i++) img.data[i * 4 + 3] = w ? Math.round((1 - Math.min(1, w[i] * 1.25)) * 190) : 0;
  ctx2.putImageData(img, 0, 0);
}
export function onLive(c) {
  const root = document.querySelector('.se-page');
  if (root) paint(c, root);
}

// Ask the connector to keep showing the page the screen while it is open
let watching = null;
function watch(c) {
  const ask = () => c.data.api('/api/screensync', { method: 'POST', body: JSON.stringify({ op: 'watch' }) }).catch(() => {});
  if (watching) return;
  ask();
  watching = setInterval(() => {
    if (!/^#screen\//.test(location.hash) || document.hidden) { if (!/^#screen\//.test(location.hash)) { clearInterval(watching); watching = null; } return; }
    ask();
  }, WATCH_MS);
}

// ---------- dragging: dots, a gradient light's length, a zone and its corners ----------
export function after(c, r, root) {
  const stage = root && root.querySelector('.se-stage');
  watch(c);
  if (!stage) return;
  const list = lightsHere(c, r.id);
  const byId = Object.fromEntries(list.map(d => [d.id, d]));
  paint(c, root);
  mask(root, byId[c.ui.seSel]);
  const save = async (id, patch) => {
    const ss = c.S.config.settings.screen_sync || (c.S.config.settings.screen_sync = { room: r.id, lights: {} });
    const lights = ss.lights || (ss.lights = {});
    lights[id] = { ...(lights[id] || {}), ...patch };
    c.endDrag();
    await c.save('', { quiet: true });
  };
  const at = e => {
    const b = stage.getBoundingClientRect();
    return { x: clamp(((e.clientX - b.left) / b.width) * 2 * SX - SX, -SX, SX), y: clamp(((e.clientY - b.top) / b.height) * 2 * SY - SY, -SY, SY) };
  };
  const guideV = stage.querySelector('.se-guide.v'), guideH = stage.querySelector('.se-guide.h');
  const guides = (id, x, y) => {
    const others = list.filter(d => d.id !== id);
    const vx = others.find(d => Math.abs(d.x - x) < 1e-3), hy = others.find(d => Math.abs(d.y - y) < 1e-3);
    const onEdgeX = [-1, 0, 1].find(v => Math.abs(v - x) < 1e-3), onEdgeY = [-1, 0, 1].find(v => Math.abs(v - y) < 1e-3);
    guideV.hidden = !(vx || onEdgeX !== undefined); guideH.hidden = !(hy || onEdgeY !== undefined);
    guideV.style.left = `${f2(px(x))}%`; guideH.style.top = `${f2(py(y))}%`;
  };
  const hideGuides = () => { guideV.hidden = true; guideH.hidden = true; };
  // a press that does not move selects; one that moves drags
  const drag = (el, { start, move, end }) => {
    let moved = false, from = null;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId); c.ui.dragging = true; moved = false; from = at(e);
      if (start) start(e);
    });
    el.addEventListener('pointermove', e => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      const p = at(e);
      if (!moved && Math.hypot(p.x - from.x, p.y - from.y) < 0.03) return;
      moved = true; move(p, from);
    });
    const done = () => { hideGuides(); const m = moved; moved = false; end(m); };
    el.addEventListener('pointerup', done); el.addEventListener('pointercancel', done);
  };
  for (const dot of stage.querySelectorAll('.se-dot')) {
    const id = dot.dataset.seid, d = byId[id];
    const bar = stage.querySelector(`.se-bar[data-bar="${CSS.escape(id)}"]`);
    let x = d.x, y = d.y;
    drag(dot, {
      start: () => dot.classList.add('held'),
      move: p => {
        x = clamp(snapX(c, p.x), -SX, SX); y = clamp(snapY(c, p.y), -SY, SY);
        dot.style.left = `${f2(px(x))}%`; dot.style.top = `${f2(py(y))}%`;
        if (bar) bar.setAttribute('style', barBox({ ...d, x, y }));
        guides(id, x, y);
      },
      end: moved => {
        dot.classList.remove('held');
        if (!moved) { c.endDrag(); if (c.ui.seSel !== id) { c.ui.seSel = id; c.render(); } return; }
        c.ui.seSel = id;
        save(id, { x: r4(x), y: r4(y) });
      },
    });
  }
  for (const h of stage.querySelectorAll('.se-len')) {
    const id = h.dataset.selen, d = byId[id], bar = h.parentElement;
    let span = d.span;
    drag(h, {
      move: p => {
        const raw = 2 * Math.abs(d.upright ? p.y - d.y : p.x - d.x);
        span = clamp(snapOn(c) ? Math.round(raw / 0.25) * 0.25 : raw, 0.4, 5);
        bar.setAttribute('style', barBox({ ...d, span }));
      },
      end: moved => { if (!moved) { c.endDrag(); return; } save(id, { span: r4(span) }); },
    });
  }
  // the selected light's zone: moved by its middle, sized by its corners, kept on the screen and to whole cells
  const zoneEl = stage.querySelector('.se-zone.sel');
  if (zoneEl) {
    const id = zoneEl.dataset.zone, d = byId[id];
    let z = { ...d.zone };
    const show = () => { zoneEl.setAttribute('style', boxStyle(z)); mask(root, { ...d, zone: z }); };
    const cell = (v, step) => (snapOn(c) ? -1 + Math.round((v + 1) / step) * step : v);
    drag(zoneEl, {
      move: (p, from) => {
        const w = d.zone.x1 - d.zone.x0, hgt = d.zone.y1 - d.zone.y0;
        const x0 = clamp(cell(d.zone.x0 + p.x - from.x, STEP_X), -1, 1 - w), y0 = clamp(cell(d.zone.y0 + p.y - from.y, STEP_Y), -1, 1 - hgt);
        z = { x0, y0, x1: x0 + w, y1: y0 + hgt };
        show();
      },
      end: moved => { if (!moved) { c.endDrag(); return; } save(id, { zone: { x0: r4(z.x0), y0: r4(z.y0), x1: r4(z.x1), y1: r4(z.y1) } }); },
    });
    for (const hd of zoneEl.querySelectorAll('.se-h')) {
      const k = hd.dataset.hz;
      drag(hd, {
        move: p => {
          const x = clamp(cell(p.x, STEP_X), -1, 1), y = clamp(cell(p.y, STEP_Y), -1, 1);
          if (k.includes('w')) z.x0 = Math.min(x, z.x1 - STEP_X); else z.x1 = Math.max(x, z.x0 + STEP_X);
          if (k.includes('n')) z.y0 = Math.min(y, z.y1 - STEP_Y); else z.y1 = Math.max(y, z.y0 + STEP_Y);
          show();
        },
        end: moved => { if (!moved) { c.endDrag(); return; } save(id, { zone: { x0: r4(z.x0), y0: r4(z.y0), x1: r4(z.x1), y1: r4(z.y1) } }); },
      });
    }
  }
  // brightness: shown at once on the slider, kept a moment after the finger stops
  const range = root.querySelector('input[data-gain]');
  if (range) {
    const id = range.dataset.gain;
    range.addEventListener('pointerdown', () => { c.ui.dragging = true; });
    range.addEventListener('input', () => {
      const v = Number(range.value);
      range.style.setProperty('--p', `${((v - 10) / 190) * 100}%`);
      const lab = root.querySelector('[data-gainval]'); if (lab) lab.textContent = `${v}%`;
      const ss = c.S.config.settings.screen_sync || (c.S.config.settings.screen_sync = { room: r.id, lights: {} });
      const lights = ss.lights || (ss.lights = {});
      lights[id] = { ...(lights[id] || {}), gain: v / 100 };
      c.saveSoon(400);
    });
    const end = () => c.endDrag();
    range.addEventListener('change', end); range.addEventListener('pointerup', end); range.addEventListener('pointercancel', end);
  }
}

// ---------- taps ----------
const lightsOf = (c, aid) => {
  const ss = c.S.config.settings.screen_sync || (c.S.config.settings.screen_sync = { room: aid || null, lights: {} });
  return ss.lights || (ss.lights = {});
};
export const actions = {
  'se-pick'(c, el) { c.ui.seSel = el.dataset.id; c.render(); },
  'se-snap'(c) {
    c.ui.seSnap = !snapOn(c);
    try { localStorage.setItem('se-snap', c.ui.seSnap ? '1' : '0'); } catch (_) {}
    c.render();
  },
  async 'se-follow'(c, el, r) {
    const lights = lightsOf(c, r.id), id = el.dataset.id;
    const one = { ...(lights[id] || {}) };
    if (one.on === false) delete one.on; else one.on = false;
    lights[id] = one;
    await c.save('', { quiet: true });
  },
  async 'se-flip'(c, el, r) {
    const lights = lightsOf(c, r.id), id = el.dataset.id;
    const now = el.getAttribute('aria-checked') === 'true';
    lights[id] = { ...(lights[id] || {}), flip: !now };
    if (now) delete lights[id].flip;
    await c.save('', { quiet: true });
  },
  async 'se-zone'(c, el, r) {
    const lights = lightsOf(c, r.id), id = el.dataset.id;
    lights[id] = { ...(lights[id] || {}), zone: { ...PRESET[el.dataset.zonePreset] } };
    await c.save('', { quiet: true });
  },
  async 'se-zone-auto'(c, el, r) {
    const lights = lightsOf(c, r.id), id = el.dataset.id;
    lights[id] = { ...(lights[id] || {}) };
    delete lights[id].zone;
    await c.save('', { quiet: true });
  },
  async 'se-light-reset'(c, el, r) {
    const lights = lightsOf(c, r.id);
    delete lights[el.dataset.id];
    await c.save('', { quiet: true });
  },
  async 'se-reset'(c, el, r) {
    const ss = c.S.config.settings.screen_sync || {};
    ss.lights = {};
    await c.save('', { quiet: true });
  },
  async 'se-display'(c, el) {
    const ss = c.S.config.settings.screen_sync || (c.S.config.settings.screen_sync = { room: null, lights: {} });
    ss.display = { id: el.dataset.id, at: Date.now(), ...(el.dataset.pc ? { pc: el.dataset.pc } : {}) };
    await c.save('', { quiet: true });
  },
};
