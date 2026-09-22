// A list of steps, each a card of plain fields: what kind of step, which lights, how far, how slowly. The remote
// sheet and the routine page both edit their lists with it. Every field carries data-change="st-edit" with the step
// and the field; "Remove this step" is data-act="st-remove". What those do to which list is the page's own.
export function stepCards(c, list) {
  const { esc, data, REM } = c;
  const has = k => data.controllable().some(d => d.domain === k);
  const targets = [['h:all', 'Everything'], ...(has('cover') ? [['h:shades', 'All shades']] : []), ...(has('fan') ? [['h:fans', 'All fans']] : []), ...data.targetOptions({ noAll: true }).map(o => [o.id, `${o.kind === 'room' ? '' : '   '}${o.name}${o.kind === 'room' ? ' (room)' : ''}`])];
  const sel = (i, k, opts, v) => `<select class="field sel" data-change="st-edit" data-i="${i}" data-k="${k}">${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const fadeOpts = [['', 'As usual'], [0, 'At once'], [1, '1 second'], [3, '3 seconds'], [8, '8 seconds'], [30, '30 seconds'], [120, '2 minutes'], [600, '10 minutes'], [1800, '30 minutes']];
  const field = (label, inner) => `<label class="st-f"><span>${label}</span>${inner}</label>`;
  const tgt = (i, a) => field('Which lights', sel(i, 'target', Array.isArray(a.target) ? [[JSON.stringify(a.target), data.targetName(a.target)], ...targets] : targets, Array.isArray(a.target) ? JSON.stringify(a.target) : a.target));
  return list.map((a, i) => {
    let f = field(`Step ${i + 1}`, sel(i, 'type', Object.entries(REM.ACTION_LABELS), a.type === 'preset' ? 'scene' : a.type));
    switch (a.type) {
      case 'level': f += tgt(i, a) + field('Brightness', sel(i, 'level', [['toggle', 'On or off'], ['on', 'On'], ['off', 'Off'], ...[100, 90, 75, 60, 50, 40, 30, 20, 10, 5].map(v => [v, v + '%'])], a.level)) + field('Change gradually over', sel(i, 'fade', fadeOpts, a.fade ?? '')); break;
      case 'step': f += tgt(i, a) + field('Amount', sel(i, 'delta', [[25, 'Much brighter'], [10, 'A little brighter'], [5, 'Slightly brighter'], [1, 'Fan: one speed faster'], [-1, 'Fan: one speed slower'], [-5, 'Slightly dimmer'], [-10, 'A little dimmer'], [-25, 'Much dimmer']], a.delta)); break;
      case 'cycle': f += tgt(i, a) + field('Levels, in order', `<input class="field" data-change="st-edit" data-i="${i}" data-k="levels" value="${esc((a.levels || []).join(', '))}" placeholder="100, 50, 20, 0">`); break;
      case 'raise': case 'lower': case 'stop': case 'cancel_timer': case 'restore': f += tgt(i, a); break;
      case 'fan': f += tgt(i, a) + field('Speed', sel(i, 'speed', [['Off', 'Off'], ['Low', 'Low'], ['Medium', 'Medium'], ['MediumHigh', 'Medium high'], ['High', 'High']], a.speed)); break;
      case 'scene': case 'preset': { const items = [...data.presets().map(p => ['p:' + p.id, p.name]), ...data.lutronScenes().map(s => ['s:' + s.scene_id, s.name + ' (Lutron)'])]; f += field('Scene', sel(i, 'scene_ref', items, a.type === 'preset' ? 'p:' + a.preset_id : 's:' + a.scene_id)); break; }
      case 'timer': f += tgt(i, a) + field('After', sel(i, 'minutes', [5, 10, 15, 20, 30, 45, 60, 90, 120].map(m => [m, m + ' minutes']), a.minutes)) + field('Then set to', sel(i, 'level', [[0, 'Off'], [5, '5%'], [10, '10%'], [30, '30%']], a.level || 0)) + field('Change gradually over', sel(i, 'fade', fadeOpts, a.fade ?? '')); break;
      case 'delay': f += field('Wait', sel(i, 'ms', [[250, 'A quarter second'], [500, 'Half a second'], [1000, '1 second'], [2000, '2 seconds'], [5000, '5 seconds'], [15000, '15 seconds'], [30000, '30 seconds']], a.ms)); break;
      default: f += `<p class="t-cap muted">${esc(data.describe([a]))}</p>`;
    }
    return `<div class="st-card">${f}<button class="link blue" data-act="st-remove" data-i="${i}">Remove this step</button></div>`;
  }).join('');
}
