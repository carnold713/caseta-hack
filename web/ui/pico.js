// A Pico remote, drawn. The file stages Lutron's product photograph (pj2-3brl, white); that photograph could not be
// exported into the repo, so the remote is drawn instead, key for key in the same 100 x 212 box the photograph
// measures, in any of the four finishes and every model. A photograph dropped into web/img/picos/ as
// <model>-<finish>.png or <model>.png is used in its place (see its README), with the keys laid over it unseen so
// they can still be tapped and lit.
//
// Each key is a <g data-key="n"> so a screen can light the one pressed (.pressed), the one picked (.sel), and show
// which have settings. `keyCentres` says where each key sits, for the leader lines on the remote page.
import { CasetaRemotes } from '/data/index.js';

const { PICO_MODELS, PICO_FINISHES } = CasetaRemotes;
const W = 100, H = 212;

// Where each key is, in the 100 x 212 box: [x, y, w, h] and the point its leader starts from.
function layout(model) {
  const def = PICO_MODELS[model] || PICO_MODELS['PJ2-3BRL'];
  const g = def.geom;
  const out = [];
  if (g) {
    for (const [kind, , glyph] of def.slots) {
      if (glyph === 'on') out.push({ kind, glyph, box: g.on, shape: 'rect' });
      else if (glyph === 'off') out.push({ kind, glyph, box: g.off, shape: 'rect' });
      else if (kind === 'diag-up') out.push({ kind, glyph, box: g.mid, shape: 'up', at: [g.mid[0] + g.mid[2] * 0.3, g.mid[1] + g.mid[3] * 0.22] });
      else if (kind === 'diag-down') out.push({ kind, glyph, box: g.mid, shape: 'down', at: [g.mid[0] + g.mid[2] * 0.7, g.mid[1] + g.mid[3] * 0.8] });
      else if (kind === 'round-mid') { const [cx, cy, r] = g.fav; out.push({ kind, glyph, box: [cx - r, cy - r, r * 2, r * 2], shape: 'circle' }); }
    }
    return out;
  }
  const hs = { big: 30, half: 18, round: 30, quarter: 36, 'rocker-top': 84, 'rocker-bottom': 84 };
  const total = def.slots.reduce((a, s) => a + hs[s[0]], 0) + 5 * (def.slots.length - 1);
  let y = (H - total) / 2;
  for (const [kind, , glyph] of def.slots) {
    const h = hs[kind];
    const box = kind === 'round' ? [W / 2 - h / 2, y, h, h] : [15, y, 70, h];
    out.push({ kind, glyph, box, shape: kind === 'round' ? 'circle' : kind });
    y += h + 5;
  }
  return out;
}
const centre = k => k.at || [k.box[0] + k.box[2] / 2, k.box[1] + k.box[3] / 2];

// The drawn remote. opts: model, finish, keys (the slots with their real numbers), set (numbers with settings),
// sel (the key picked), pressed (the key just pressed), interactive, height.
export function picoSVG(opts) {
  const model = opts.model || 'PJ2-3BRL';
  const f = PICO_FINISHES[opts.finish] || PICO_FINISHES.white;
  const fk = opts.finish || 'white';
  const keys = layout(model);
  const nums = opts.keys || PICO_MODELS[model].slots.map(s => ({ n: s[1], real: true }));
  const ink = f.ink;
  const bulb = (cx, cy, rays) => {
    const r = 5.2, top = cy - 2.2;
    let g = `<path d="M${cx - r},${top} a${r},${r} 0 1 1 ${r * 2},0 c0,3 -2.4,4.6 -2.6,7.2 h-${r * 2 - 5.2} c-0.2,-2.6 -2.6,-4.2 -2.6,-7.2z" fill="none" stroke="${ink}" stroke-width="1.15" stroke-linejoin="round"/>`
      + `<path d="M${cx - 2.4},${top + r + 6.4} h4.8 M${cx - 2.1},${top + r + 8.2} h4.2" stroke="${ink}" stroke-width="1.1" stroke-linecap="round"/>`;
    if (rays) g += [-90, -45, 0, 45, 90, 135, 225].map(a => { const t = a * Math.PI / 180; return `<line x1="${(cx + Math.cos(t) * (r + 2.4)).toFixed(1)}" y1="${(top + Math.sin(t) * (r + 2.4)).toFixed(1)}" x2="${(cx + Math.cos(t) * (r + 4.6)).toFixed(1)}" y2="${(top + Math.sin(t) * (r + 4.6)).toFixed(1)}" stroke="${ink}" stroke-width="1.1" stroke-linecap="round"/>`; }).join('');
    return g;
  };
  const tri = (cx, cy, up) => `<path d="M${cx - 4.6},${cy + (up ? 3 : -3)} L${cx},${cy + (up ? -3.2 : 3.2)} L${cx + 4.6},${cy + (up ? 3 : -3)}z" fill="none" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`;
  const parts = keys.map((k, i) => {
    const num = nums[i] || { n: i, real: false };
    const [x, y, w, h] = k.box;
    let shape;
    if (k.shape === 'circle') shape = `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}"/>`;
    else if (k.shape === 'up') shape = `<path d="M${x + 3.5},${y} h${w - 7} a3.5,3.5 0 0 1 3.5,3.5 L${x},${y + h - 3.5} v-${h - 7} a3.5,3.5 0 0 1 3.5,-3.5z"/>`;
    else if (k.shape === 'down') shape = `<path d="M${x + w},${y + 3.5} v${h - 7} a3.5,3.5 0 0 1 -3.5,3.5 h-${w - 7} a3.5,3.5 0 0 1 -3.5,-3.5z"/>`;
    else if (k.shape === 'rocker-top') shape = `<path d="M${x + 6},${y} h${w - 12} a6,6 0 0 1 6,6 v${h - 6} h-${w} v-${h - 6} a6,6 0 0 1 6,-6z"/>`;
    else if (k.shape === 'rocker-bottom') shape = `<path d="M${x},${y} h${w} v${h - 6} a6,6 0 0 1 -6,6 h-${w - 12} a6,6 0 0 1 -6,-6z"/>`;
    else shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${k.kind === 'half' ? 3 : 3.5}"/>`;
    const [cx, cy] = centre(k);
    let glyph = '';
    if (k.glyph === 'on' || k.glyph === 'off') glyph = bulb(PICO_MODELS[model].geom ? x + w * 0.2 : cx, PICO_MODELS[model].geom ? y + h * 0.36 : cy, k.glyph === 'on');
    else if (k.glyph === 'up' || k.glyph === 'down') glyph = tri(cx, cy, k.glyph === 'up');
    else if (k.glyph !== 'fav') glyph = `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${ink}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${k.glyph}</text>`;
    const cls = ['pk', num.real ? '' : 'ghost', opts.sel === num.n ? 'sel' : '', opts.pressed === num.n ? 'pressed' : ''].filter(Boolean).join(' ');
    const act = opts.interactive && num.real ? ` data-act="${opts.interactive}" data-n="${num.n}" role="button" aria-label="${opts.label ? opts.label(num.n) : 'Key'}"` : '';
    return `<g class="${cls}" data-key="${num.n}"${act}><g class="pk-shape" fill="url(#pkb-${fk})" stroke="${f.btnEdge}" stroke-width=".7" filter="url(#pk-lift)">${shape}</g>${glyph}<g class="pk-ring" fill="none">${shape}</g></g>`;
  }).join('');
  const hh = opts.height || 212;
  return `<svg class="pico-svg" viewBox="0 0 ${W} ${H}" width="${Math.round(hh * W / H)}" height="${hh}" aria-hidden="${opts.interactive ? 'false' : 'true'}">
    <defs>
      <linearGradient id="pkbody-${fk}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${f.bodyHi}"/><stop offset=".55" stop-color="${f.body}"/><stop offset="1" stop-color="${f.bodyLo}"/></linearGradient>
      <linearGradient id="pkb-${fk}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f.btnHi}"/><stop offset=".35" stop-color="${f.btn}"/><stop offset="1" stop-color="${f.btnLo}"/></linearGradient>
      <filter id="pk-lift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy=".8" stdDeviation=".7" flood-color="#000" flood-opacity=".22"/></filter>
      <filter id="pk-shadow" x="-20%" y="-10%" width="140%" height="125%"><feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000" flood-opacity=".45"/></filter>
    </defs>
    <g filter="url(#pk-shadow)"><rect x="1" y="6" width="${W - 2}" height="200" rx="8.5" fill="url(#pkbody-${fk})" stroke="${f.edge}" stroke-width=".8"/></g>
    <rect x="2.2" y="7.2" width="${W - 4.4}" height="197.6" rx="7.6" fill="none" stroke="${f.bodyHi}" stroke-opacity=".9" stroke-width=".6"/>
    ${parts}</svg>`;
}

// Where each key's leader starts, in the drawing's own units, top to bottom, with its number.
export function keyCentres(model, keys) {
  return layout(model).map((k, i) => ({ n: (keys[i] || {}).n, real: (keys[i] || {}).real !== false, at: centre(k), right: k.box[0] + k.box[2] })).filter(k => k.n != null)
    .sort((a, b) => a.at[1] - b.at[1]);
}
export const PICO_BOX = { W, H };

// A photograph dropped in by the owner, looked for once per model and finish.
const found = {};
export function picoPhoto(model, finish, onFound) {
  const urls = [`/img/picos/${model}-${finish}.png`, `/img/picos/${model}.png`];
  for (const u of urls) if (found[u]) return u;
  const key = urls.join('|');
  if (found[key] === undefined) {
    found[key] = false;
    (async () => {
      for (const u of urls) {
        try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok && /image/.test(r.headers.get('content-type') || '')) { found[u] = true; if (onFound) onFound(); return; } } catch (_) { /* none */ }
      }
    })();
  }
  return null;
}
