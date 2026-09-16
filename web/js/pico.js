/* Pico remote artwork. Accurate physical layouts drawn as SVG; a real product photo
   dropped into web/img/picos/<model>.png (or <model>-<finish>.png) is used instead when present. */
'use strict';

// Physical layouts, top to bottom. Each slot: kind (big, half, round, rocker-top, rocker-bottom, quarter) and
// which LEAP button number sits there (per model, from what the bridge reports).
const PICO_MODELS = {
  'PJ2-3BRL': { name: '5 buttons: on, raise and lower around a round favorite, off', types: ['Pico3ButtonRaiseLower'],
    slots: [['big', 0, 'on'], ['diag-up', 3, 'up'], ['diag-down', 4, 'down'], ['round-mid', 1, 'fav'], ['big', 2, 'off']],
    // explicit geometry in the 100 x 212 box, measured from Lutron's product photo
    geom: { on: [11, 12, 78, 54], mid: [11, 74, 78, 78], off: [11, 160, 78, 40], fav: [50, 113, 15] } },
  'PJ2-3BRL-classic': { name: '5 buttons, older style: on, raise bar, favorite, lower bar, off', types: [], slots: [['big', 0, 'on'], ['half', 3, 'up'], ['round', 1, 'fav'], ['half', 4, 'down'], ['big', 2, 'off']] },
  'PJ2-2BRL': { name: '4 buttons: on, raise, lower, off', types: ['Pico2ButtonRaiseLower'], slots: [['big', 0, 'on'], ['half', 3, 'up'], ['half', 4, 'down'], ['big', 2, 'off']] },
  'PJ2-3B': { name: '3 buttons: on, favorite, off', types: ['Pico3Button'], slots: [['big', 0, 'on'], ['round', 1, 'fav'], ['big', 2, 'off']] },
  'PJ2-2B': { name: '2 buttons: on, off', types: ['Pico2Button'], slots: [['big', 0, 'on'], ['big', 2, 'off']] },
  'PJ2-4B': { name: '4 scene buttons', types: ['Pico4Button', 'Pico4ButtonScene', 'Pico4ButtonZone', 'Pico4Button2Group'], slots: [['quarter', 0, '1'], ['quarter', 1, '2'], ['quarter', 2, '3'], ['quarter', 3, '4']] },
  'PJ2-P': { name: 'Paddle (rocker)', types: ['PaddleSwitchPico'], slots: [['rocker-top', 0, 'on'], ['rocker-bottom', 2, 'off']] },
  'PJ2-1B': { name: '1 button', types: ['Pico1Button'], slots: [['big', 0, 'on']] },
};
const PICO_FINISHES = { white: { body: '#f4f4f1', edge: '#d6d6d1', btn: '#ffffff', btnEdge: '#cfcfc9', ink: '#2b2b2b' }, black: { body: '#2a2a2c', edge: '#151517', btn: '#3a3a3d', btnEdge: '#232325', ink: '#f2f2f2' }, ivory: { body: '#efe9d8', edge: '#d3ccb8', btn: '#f8f4e6', btnEdge: '#d6cfba', ink: '#2b2b2b' }, gray: { body: '#b9bcc0', edge: '#9a9da2', btn: '#cfd2d6', btnEdge: '#a8abb0', ink: '#1f1f1f' } };

function picoModelFor(d) {
  const look = (S.config && S.config.settings.remote_looks || {})[d.device_id] || {};
  if (look.model && PICO_MODELS[look.model]) return look.model;
  for (const [k, m] of Object.entries(PICO_MODELS)) if (m.types.includes(d.type)) {
    // Pico4Button (the older one) reports buttons 1-4; shift the slots to match what the bridge says.
    return k;
  }
  return 'PJ2-3BRL';
}
function picoFinishFor(d) { const look = (S.config && S.config.settings.remote_looks || {})[d.device_id] || {}; return look.finish || 'white'; }
// Buttons the bridge actually reports for this remote, mapped onto the model's slots.
function picoSlots(d, modelKey) {
  const model = PICO_MODELS[modelKey || picoModelFor(d)];
  const reported = buttonsOf(d.device_id).map(b => b.button_number);
  let slots = model.slots;
  if (model === PICO_MODELS['PJ2-4B'] && reported.length && Math.min(...reported) === 1) slots = slots.map(([k, n, g]) => [k, n + 1, g]);
  return slots.map(([kind, n, glyph]) => ({ kind, n, glyph, real: reported.includes(n) }));
}

// Geometry in a 100 x 212 box (the real Pico is 1.25 x 2.62 in).
function picoSVG(d, opts = {}) {
  const f = PICO_FINISHES[opts.finish || picoFinishFor(d)] || PICO_FINISHES.white;
  const slots = opts.model ? PICO_MODELS[opts.model].slots.map(([kind, n, glyph]) => ({ kind, n, glyph, real: true })) : picoSlots(d);
  const set = new Set(bindings().filter(b => b.device_id === d.device_id).map(b => b.button_number));
  const W = 100, H = 212, PAD = 11, GAP = 5;
  const heights = { big: 30, half: 18, round: 30, quarter: 36, 'rocker-top': 84, 'rocker-bottom': 84 };
  const modelDef = PICO_MODELS[opts.model || picoModelFor(d)];
  const geom = modelDef && modelDef.geom;
  const total = geom ? 0 : slots.reduce((a, s) => a + heights[s.kind], 0) + GAP * (slots.length - 1);
  let y = (H - total) / 2;
  const parts = [];
  for (const s of slots) {
    let h = heights[s.kind] || 0; let x = PAD, w = W - PAD * 2;
    const cls = `pk ${s.real ? 'real' : 'ghost'} ${set.has(s.n) ? 'set' : ''} ${opts.selected === s.n ? 'sel' : ''}`;
    const attrs = opts.interactive && s.real ? `data-act="button-open" data-n="${s.n}" data-live="${d.device_id}/${s.n}" role="button" tabindex="0"` : `data-live="${d.device_id}/${s.n}"`;
    let shape, glyph = '';
    let cx = W / 2, cy = y + h / 2; const ink = f.ink;
    if (geom) {
      // fixed geometry: pick the box for this slot
      if (s.glyph === 'on') { [x, y, w, h] = geom.on; cx = x + w / 2; cy = y + h / 2; shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" />`; }
      else if (s.glyph === 'off') { [x, y, w, h] = geom.off; cx = x + w / 2; cy = y + h / 2; shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" />`; }
      else if (s.kind === 'diag-up') { const [mx, my, mw, mh] = geom.mid; shape = `<path d="M${mx + 5},${my} h${mw - 10} a5,5 0 0 1 5,5 L${mx},${my + mh - 5} v-${mh - 10} a5,5 0 0 1 5,-5z" />`; cx = mx + mw * 0.22; cy = my + mh * 0.22; }
      else if (s.kind === 'diag-down') { const [mx, my, mw, mh] = geom.mid; shape = `<path d="M${mx + mw},${my + 5} v${mh - 10} a5,5 0 0 1 -5,5 h-${mw - 10} a5,5 0 0 1 -5,-5z" />`; cx = mx + mw * 0.78; cy = my + mh * 0.78; }
      else if (s.kind === 'round-mid') { const [fx, fy, fr] = geom.fav; cx = fx; cy = fy; shape = `<circle cx="${fx}" cy="${fy}" r="${fr}" />`; }
      if (s.kind === 'diag-up' || s.kind === 'diag-down') { const [mx, my, mw, mh] = geom.mid; x = mx; y = my; w = mw; h = mh; }
      if (s.kind === 'round-mid') { const [fx, fy, fr] = geom.fav; x = fx - fr; y = fy - fr; w = fr * 2; h = fr * 2; }
    }
    else if (s.kind === 'round') shape = `<circle cx="${cx}" cy="${cy}" r="${h / 2}" />`;
    else if (s.kind === 'rocker-top') shape = `<path d="M${x + 6},${y} h${w - 12} a6,6 0 0 1 6,6 v${h - 6} h-${w} v-${h - 6} a6,6 0 0 1 6,-6z" />`;
    else if (s.kind === 'rocker-bottom') shape = `<path d="M${x},${y} h${w} v${h - 6} a6,6 0 0 1 -6,6 h-${w - 12} a6,6 0 0 1 -6,-6z" />`;
    else shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${s.kind === 'half' ? 4 : 6}" />`;
    switch (s.glyph) {
      case 'on': glyph = `<circle cx="${cx}" cy="${cy}" r="5.2" fill="${ink}"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map(a => { const r = a * Math.PI / 180; return `<line x1="${cx + Math.cos(r) * 7.5}" y1="${cy + Math.sin(r) * 7.5}" x2="${cx + Math.cos(r) * 10}" y2="${cy + Math.sin(r) * 10}" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`; }).join(''); break;
      case 'off': glyph = `<circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="${ink}" stroke-width="1.8"/>`; break;
      case 'up': glyph = `<path d="M${cx - 5},${cy + 3} L${cx},${cy - 3} L${cx + 5},${cy + 3}z" fill="${ink}"/>`; break;
      case 'down': glyph = `<path d="M${cx - 5},${cy - 3} L${cx},${cy + 3} L${cx + 5},${cy - 3}z" fill="${ink}"/>`; break;
      case 'fav': glyph = `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${ink}"/>`; break;
      default: glyph = `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-size="12" font-weight="700" fill="${ink}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${esc(s.glyph)}</text>`;
    }
    const dot = s.kind === 'diag-up' ? [x + 6, y + h - 6] : s.kind === 'round-mid' ? [x + w - 2, y + 2] : [x + w - 6, y + 6];
    parts.push(`<g class="${cls}" ${attrs}><g class="pk-shape" fill="${f.btn}" stroke="${f.btnEdge}" stroke-width="1">${shape}</g>${glyph}${set.has(s.n) ? `<circle cx="${dot[0]}" cy="${dot[1]}" r="2.6" class="pk-dot"/>` : ''}</g>`);
    if (!geom) y += h + GAP;
  }
  return `<svg class="pico-svg ${opts.cls || ''}" viewBox="0 0 ${W} ${H}" width="${opts.width || 100}" aria-label="${esc(d.name)} remote">
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${f.body}" stroke="${f.edge}" stroke-width="1.5"/>
    ${parts.join('')}</svg>`;
}
// A photo, if the owner dropped one in. Buttons then get transparent hotspots placed with the same geometry.
const PHOTO_CACHE = {};
function picoPhotoURL(d) {
  const model = picoModelFor(d), fin = picoFinishFor(d);
  return [`/img/picos/${model}-${fin}.png`, `/img/picos/${model}.png`];
}
async function picoPhotoAvailable(d) {
  for (const u of picoPhotoURL(d)) {
    if (PHOTO_CACHE[u] === undefined) { try { const r = await fetch(u, { method: 'HEAD' }); PHOTO_CACHE[u] = r.ok && /image/.test(r.headers.get('content-type') || ''); } catch (_) { PHOTO_CACHE[u] = false; } }
    if (PHOTO_CACHE[u]) return u;
  }
  return null;
}
function picoArt(d, opts = {}) {
  const url = picoPhotoURL(d).find(u => PHOTO_CACHE[u]);
  if (!url) return picoSVG(d, opts);
  // Photo with hotspots: reuse the SVG with transparent buttons over the image.
  return `<div class="pico-photo" style="width:${opts.width || 100}px"><img src="${url}" alt="${esc(d.name)} remote">${picoSVG(d, { ...opts, cls: 'overlay' })}</div>`;
}
