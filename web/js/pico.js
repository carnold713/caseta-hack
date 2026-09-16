/* Pico remote artwork. Accurate physical layouts drawn as SVG; a real product photo
   dropped into web/img/picos/<model>.png (or <model>-<finish>.png) is used instead when present. */
'use strict';

// Physical layouts, top to bottom. Each slot: kind (big, half, round, rocker-top, rocker-bottom, quarter) and
// which LEAP button number sits there (per model, from what the bridge reports).
const PICO_MODELS = {
  'PJ2-3BRL': { name: '5 buttons: on, raise and lower around a round favorite, off', types: ['Pico3ButtonRaiseLower'],
    slots: [['big', 0, 'on'], ['diag-up', 3, 'up'], ['diag-down', 4, 'down'], ['round-mid', 1, 'fav'], ['big', 2, 'off']],
    // explicit geometry in the 100 x 212 box, measured from Lutron's product photo
    geom: { on: [15, 12, 70, 50], mid: [15, 67, 70, 78], off: [15, 150, 70, 50], fav: [50, 106, 16.5], led: [7.5, 23.5] } },
  'PJ2-3BRL-classic': { name: '5 buttons, older style: on, raise bar, favorite, lower bar, off', types: [], slots: [['big', 0, 'on'], ['half', 3, 'up'], ['round', 1, 'fav'], ['half', 4, 'down'], ['big', 2, 'off']] },
  'PJ2-2BRL': { name: '4 buttons: on, raise, lower, off', types: ['Pico2ButtonRaiseLower'], slots: [['big', 0, 'on'], ['half', 3, 'up'], ['half', 4, 'down'], ['big', 2, 'off']] },
  'PJ2-3B': { name: '3 buttons: on, favorite, off', types: ['Pico3Button'], slots: [['big', 0, 'on'], ['round', 1, 'fav'], ['big', 2, 'off']] },
  'PJ2-2B': { name: '2 buttons: on, off', types: ['Pico2Button'], slots: [['big', 0, 'on'], ['big', 2, 'off']] },
  'PJ2-4B': { name: '4 scene buttons', types: ['Pico4Button', 'Pico4ButtonScene', 'Pico4ButtonZone', 'Pico4Button2Group'], slots: [['quarter', 0, '1'], ['quarter', 1, '2'], ['quarter', 2, '3'], ['quarter', 3, '4']] },
  'PJ2-P': { name: 'Paddle (rocker)', types: ['PaddleSwitchPico'], slots: [['rocker-top', 0, 'on'], ['rocker-bottom', 2, 'off']] },
  'PJ2-1B': { name: '1 button', types: ['Pico1Button'], slots: [['big', 0, 'on']] },
};
// Finishes: the body and button tones plus the highlight and shade each gradient runs between. Glyphs are
// printed in a soft grey on the light finishes, as on the real remote.
const PICO_FINISHES = {
  white: { body: '#f3f3f1', bodyHi: '#fbfbfa', bodyLo: '#e3e3e0', edge: '#cfcfcb', btn: '#fdfdfc', btnHi: '#ffffff', btnLo: '#efefec', btnEdge: '#d2d2ce', ink: '#8d8d8b', led: '#5a5a58' },
  black: { body: '#2b2b2d', bodyHi: '#3a3a3d', bodyLo: '#1c1c1e', edge: '#131315', btn: '#353538', btnHi: '#434347', btnLo: '#262629', btnEdge: '#1e1e21', ink: '#d6d6d4', led: '#c8c8c6' },
  ivory: { body: '#efe9d8', bodyHi: '#f8f4e8', bodyLo: '#dfd7c2', edge: '#cfc7b0', btn: '#f9f5e8', btnHi: '#fffdf4', btnLo: '#ece5d2', btnEdge: '#d4ccb6', ink: '#8f8874', led: '#5e5a4c' },
  gray: { body: '#b9bcc0', bodyHi: '#c9ccd0', bodyLo: '#a3a6ab', edge: '#8f9297', btn: '#cfd2d6', btnHi: '#dcdfe3', btnLo: '#bdc0c5', btnEdge: '#a2a5aa', ink: '#3f4246', led: '#2a2c2f' },
};

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

// Geometry in a 100 x 212 box (the real Pico is 1.25 x 2.62 in). Drawn to read like the product photo: a
// softly lit body with a rounded edge, buttons that stand proud with a highlight along the top and a shadow
// below, printed glyphs, the small status LED, and the wordmark on the off button.
function picoSVG(d, opts = {}) {
  const fk = opts.finish || picoFinishFor(d);
  const f = PICO_FINISHES[fk] || PICO_FINISHES.white;
  const slots = opts.model ? PICO_MODELS[opts.model].slots.map(([kind, n, glyph]) => ({ kind, n, glyph, real: true })) : picoSlots(d);
  const set = new Set(bindings().filter(b => b.device_id === d.device_id).map(b => b.button_number));
  const W = 100, H = 212, PAD = 15, GAP = 5;
  const heights = { big: 30, half: 18, round: 30, quarter: 36, 'rocker-top': 84, 'rocker-bottom': 84 };
  const modelDef = PICO_MODELS[opts.model || picoModelFor(d)];
  const geom = modelDef && modelDef.geom;
  const total = geom ? 0 : slots.reduce((a, s) => a + heights[s.kind], 0) + GAP * (slots.length - 1);
  let y = (H - total) / 2;
  const parts = [];
  const ink = f.ink;
  // a printed light bulb: an outline, with rays for "on"
  const bulb = (cx, cy, rays) => {
    const r = 5.2, top = cy - 2.2;
    let g = `<path d="M${cx - r},${top} a${r},${r} 0 1 1 ${r * 2},0 c0,3 -2.4,4.6 -2.6,7.2 h-${r * 2 - 5.2} c-0.2,-2.6 -2.6,-4.2 -2.6,-7.2z" fill="none" stroke="${ink}" stroke-width="1.15" stroke-linejoin="round"/>`
      + `<path d="M${cx - 2.4},${top + r + 6.4} h4.8 M${cx - 2.1},${top + r + 8.2} h4.2 M${cx - 1.5},${top + r + 10} h3" stroke="${ink}" stroke-width="1.1" stroke-linecap="round"/>`;
    if (rays) g += [-90, -45, 0, 45, 90, 135, 225].map(a => { const t = a * Math.PI / 180; return `<line x1="${(cx + Math.cos(t) * (r + 2.4)).toFixed(1)}" y1="${(top + Math.sin(t) * (r + 2.4)).toFixed(1)}" x2="${(cx + Math.cos(t) * (r + 4.6)).toFixed(1)}" y2="${(top + Math.sin(t) * (r + 4.6)).toFixed(1)}" stroke="${ink}" stroke-width="1.1" stroke-linecap="round"/>`; }).join('');
    return g;
  };
  const tri = (cx, cy, up) => `<path d="M${cx - 4.6},${cy + (up ? 3 : -3)} L${cx},${cy + (up ? -3.2 : 3.2)} L${cx + 4.6},${cy + (up ? 3 : -3)}z" fill="none" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`;
  const wordmark = (cx, cy) => `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="6.2" font-weight="700" letter-spacing=".5" fill="${ink}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">LUTRON</text>`;
  for (const s of slots) {
    let h = heights[s.kind] || 0; let x = PAD, w = W - PAD * 2;
    const cls = `pk ${s.real ? 'real' : 'ghost'} ${set.has(s.n) ? 'set' : ''} ${opts.selected === s.n ? 'sel' : ''}`;
    const attrs = opts.interactive && s.real ? `data-act="button-open" data-n="${s.n}" data-live="${d.device_id}/${s.n}" role="button" tabindex="0"` : `data-live="${d.device_id}/${s.n}"`;
    let shape, glyph = '', extra = '';
    let cx = W / 2, cy = y + h / 2;
    let gx = null, gy = null; // where the printed glyph sits (off-centre on the real remote)
    if (geom) {
      if (s.glyph === 'on') { [x, y, w, h] = geom.on; cx = x + w / 2; cy = y + h / 2; gx = x + w * 0.2; gy = y + h * 0.36; shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3.5" />`; }
      else if (s.glyph === 'off') { [x, y, w, h] = geom.off; cx = x + w / 2; cy = y + h / 2; gx = x + w * 0.2; gy = y + h * 0.36; shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3.5" />`; extra = wordmark(x + w * 0.31, y + h * 0.86); }
      else if (s.kind === 'diag-up') { const [mx, my, mw, mh] = geom.mid; shape = `<path d="M${mx + 3.5},${my} h${mw - 7} a3.5,3.5 0 0 1 3.5,3.5 L${mx},${my + mh - 3.5} v-${mh - 7} a3.5,3.5 0 0 1 3.5,-3.5z" />`; cx = mx + mw * 0.2; cy = my + mh * 0.17; }
      else if (s.kind === 'diag-down') { const [mx, my, mw, mh] = geom.mid; shape = `<path d="M${mx + mw},${my + 3.5} v${mh - 7} a3.5,3.5 0 0 1 -3.5,3.5 h-${mw - 7} a3.5,3.5 0 0 1 -3.5,-3.5z" />`; cx = mx + mw * 0.82; cy = my + mh * 0.83; }
      else if (s.kind === 'round-mid') { const [fx, fy, fr] = geom.fav; cx = fx; cy = fy; shape = `<circle cx="${fx}" cy="${fy}" r="${fr}" />`; }
      if (s.kind === 'diag-up' || s.kind === 'diag-down') { const [mx, my, mw, mh] = geom.mid; x = mx; y = my; w = mw; h = mh; }
      if (s.kind === 'round-mid') { const [fx, fy, fr] = geom.fav; x = fx - fr; y = fy - fr; w = fr * 2; h = fr * 2; }
    }
    else if (s.kind === 'round') shape = `<circle cx="${cx}" cy="${cy}" r="${h / 2}" />`;
    else if (s.kind === 'rocker-top') shape = `<path d="M${x + 6},${y} h${w - 12} a6,6 0 0 1 6,6 v${h - 6} h-${w} v-${h - 6} a6,6 0 0 1 6,-6z" />`;
    else if (s.kind === 'rocker-bottom') shape = `<path d="M${x},${y} h${w} v${h - 6} a6,6 0 0 1 -6,6 h-${w - 12} a6,6 0 0 1 -6,-6z" />`;
    else shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${s.kind === 'half' ? 3 : 3.5}" />`;
    switch (s.glyph) {
      case 'on': glyph = bulb(gx == null ? cx : gx, gy == null ? cy : gy, true); break;
      case 'off': glyph = bulb(gx == null ? cx : gx, gy == null ? cy : gy, false); break;
      case 'up': glyph = tri(cx, cy, true); break;
      case 'down': glyph = tri(cx, cy, false); break;
      case 'fav': glyph = ''; break;
      default: glyph = `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${ink}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${esc(s.glyph)}</text>`;
    }
    const dot = s.kind === 'diag-up' ? [x + 6, y + h - 6] : s.kind === 'round-mid' ? [x + w - 2, y + 2] : [x + w - 6, y + 6];
    parts.push(`<g class="${cls}" ${attrs}><g class="pk-shape" fill="url(#pk-btn-${fk})" stroke="${f.btnEdge}" stroke-width=".7" filter="url(#pk-lift)">${shape}</g>${glyph}${extra}${set.has(s.n) ? `<circle cx="${dot[0]}" cy="${dot[1]}" r="2.6" class="pk-dot"/>` : ''}</g>`);
    if (!geom) y += h + GAP;
  }
  const led = geom && geom.led ? `<circle cx="${geom.led[0]}" cy="${geom.led[1]}" r="1.1" fill="${f.led}" opacity=".85"/>` : '';
  return `<svg class="pico-svg ${opts.cls || ''}" viewBox="0 0 ${W} ${H}" width="${opts.width || 100}" aria-label="${esc(d.name)} remote">
    <defs>
      <linearGradient id="pk-body-${fk}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${f.bodyHi}"/><stop offset=".55" stop-color="${f.body}"/><stop offset="1" stop-color="${f.bodyLo}"/></linearGradient>
      <linearGradient id="pk-btn-${fk}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f.btnHi}"/><stop offset=".35" stop-color="${f.btn}"/><stop offset="1" stop-color="${f.btnLo}"/></linearGradient>
      <filter id="pk-lift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy=".8" stdDeviation=".7" flood-color="#000" flood-opacity=".22"/></filter>
      <filter id="pk-body-shadow" x="-10%" y="-6%" width="120%" height="116%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.8" flood-color="#000" flood-opacity=".18"/></filter>
    </defs>
    <g filter="url(#pk-body-shadow)"><rect x="1" y="6" width="${W - 2}" height="200" rx="8.5" fill="url(#pk-body-${fk})" stroke="${f.edge}" stroke-width=".8"/></g>
    <rect x="2.2" y="7.2" width="${W - 4.4}" height="197.6" rx="7.6" fill="none" stroke="${f.bodyHi}" stroke-opacity=".9" stroke-width=".6"/>
    ${led}${parts.join('')}</svg>`;
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
