// 22 · the guided setups (12744:111876): Welcome lights, Wake-up light, and a Goodnight or Leaving button. One
// question a screen, big answers to tap, what it will do so far in a card under them, and Next. Nothing is saved
// until the last step, where Next becomes the thing it sets up.
//
// #setup/<welcome|wakeup|goodnight|leaving>. The walk's own state is ctx.ui.gs; the back circle steps back through
// it and leaves from the first question.
import { whereBlock, whereActions } from '/ui/screens/where.js';
import { picoSVG } from '/ui/pico.js';
import { icon as glyph } from '/ui/icons.js';
import { sunriseHTML, sunriseActions, wireSunrise } from '/ui/screens/routine.js';

export const noTabs = true;
const KINDS = { welcome: 'Welcome lights', wakeup: 'Wake-up light', goodnight: 'Goodnight button', leaving: 'Leaving button' };
const ART = { welcome: 'lutron-sunrise', wakeup: 'lutron-sunrise', goodnight: 'room-bedroom', leaving: 'room-entry' };
const ARRIVALS = ['17:30', '18:00', '18:30'];

function state(c, kind) {
  if (!c.ui.gs || c.ui.gs.kind !== kind) {
    const g = kind === 'welcome' ? c.RT.welcomeStart() : kind === 'wakeup' ? c.RT.wakeupStart() : c.RT.buttonStart(kind);
    c.ui.gs = { kind, step: 0, g, other: false };
  }
  return c.ui.gs;
}
const tile = (act, v, label, on, extra = '') => `<button class="ans ${on ? 'sel' : ''}" data-act="${act}" data-v="${v}" aria-pressed="${on}" ${extra}><span>${label}</span>${on ? `<i class="tick">${glyph('check', 22, 2)}</i>` : ''}</button>`;
const sameDays = (a, b) => [...a].sort().join() === [...b].sort().join();

// Each step: the question, its answers, whether Next can go on yet. `skip` leaves a step out of the count.
function steps(c, gs) {
  const { esc, icon, RT, REM, data } = c;
  const g = gs.g;
  const s = c.S.config.settings;
  const dayTiles = act => `<div class="answers">${[['weekdays', 'Weekdays'], ['all', 'Every day'], ['weekends', 'Weekends']].map(([k, l]) => tile(act, k, l, sameDays(g.days, RT.QUICK_DAYS[k]))).join('')}${tile(`${act}-pick`, '1', 'Pick days…', !['weekdays', 'all', 'weekends'].some(k => sameDays(g.days, RT.QUICK_DAYS[k])))}</div>
    ${!['weekdays', 'all', 'weekends'].some(k => sameDays(g.days, RT.QUICK_DAYS[k])) || gs.pickDays ? `<div class="dd-row">${RT.WEEK.map(i => `<button class="dd big ${g.days.includes(i) ? 'on' : ''}" data-act="gs-day" data-d="${i}" aria-label="${RT.DAY_LONG[i]}">${RT.DAY_LETTER[i]}</button>`).join('')}</div>` : ''}`;
  const roomTiles = (act, list, multi) => `<div class="answers">${list.map(([t, l]) => tile(act, t, esc(l), multi ? g[multi].includes(t) : false)).join('')}</div>`;
  if (gs.kind === 'welcome') {
    const rooms = RT.lightRooms().map(a => [`a:${a.id}`, a.name]);
    const shades = data.controllable().filter(d => d.domain === 'cover');
    const outside = g.targets.some(t => RT.roomMatches(t, RT.OUTSIDE_RE));
    return [
      { q: 'Which lights should welcome you home?', ok: g.targets.length > 0, body: roomTiles('w-target', [...rooms, ['h:all', 'Everything']], 'targets') },
      { q: 'When do you usually get home?', ok: g.arrive === 'time' || !!s.location, body: `<div class="answers">${ARRIVALS.map(t => tile('w-arrive', t, RT.fmtTime(t), g.arrive === 'time' && g.arriveTime === t && !gs.other)).join('')}
          ${tile('w-arrive', 'other', gs.other || (g.arrive === 'time' && !ARRIVALS.includes(g.arriveTime)) ? RT.fmtTime(g.arriveTime) : 'Other time…', g.arrive === 'time' && (gs.other || !ARRIVALS.includes(g.arriveTime)), 'data-other="1"')}</div>
          ${gs.other ? `<div class="when-time"><input class="time-big" type="time" value="${esc(g.arriveTime)}" data-change="w-arrive-time" aria-label="Home at"></div>` : ''}
          <div class="group"><button class="row has-ic ${g.arrive === 'sunset' ? 'sel' : ''}" data-act="w-sunset"><span class="row-ic">${icon('sunrise', 20, 1.4)}</span><span class="row-txt"><span class="t">Or at sunset</span></span><span class="row-val">${RT.sunAt('sunset') ? `${esc(RT.fmtTime(RT.sunAt('sunset', -g.offset)))} today` : ''}</span>${g.arrive === 'sunset' ? `<span class="row-tick">${icon('check', 20, 1.9)}</span>` : `<span class="row-chev">${icon('chev', 16, 1.8)}</span>`}</button></div>
          ${g.arrive === 'sunset' ? `<div class="chip-wrap">${[0, 10, 20, 30, 45].map(m => `<button class="chip sm" aria-pressed="${g.offset === m}" data-act="w-offset" data-v="${m}">${m ? `${m} min before` : 'At sunset'}</button>`).join('')}</div>${whereBlock(c)}` : ''}` },
      { q: 'Which days?', ok: g.days.length > 0, body: `${dayTiles('w-days')}
          <div class="group"><div class="row"><span class="row-txt"><span class="t">Only if the house is dark</span><span class="d">Skipped when someone is already home with the lights on</span></span><button class="toggle" role="switch" aria-checked="${!!g.onlyDark}" data-act="w-dark" aria-label="Only if the house is dark"></button></div></div>` },
      { q: 'When should they go off?', ok: true, body: `<div class="answers">${tile('w-until', 'bedtime', `Bedtime, ${RT.fmtTime(s.night_start)}`, g.until === 'bedtime')}${tile('w-until', 'sunrise', 'Sunrise', g.until === 'sunrise')}${tile('w-until', 'time', g.until === 'time' ? RT.fmtTime(g.untilTime) : 'Other time…', g.until === 'time')}</div>
          ${g.until === 'time' ? `<div class="when-time"><input class="time-big" type="time" value="${esc(g.untilTime)}" data-change="w-until-time" aria-label="Off at"></div>` : ''}
          <div class="group">
            ${outside ? `<div class="row"><span class="row-txt"><span class="t">Leave the outside lights on low until morning</span></span><button class="toggle" role="switch" aria-checked="${!!g.low}" data-act="w-low" aria-label="Outside lights low overnight"></button></div>` : ''}
            <button class="row" data-act="w-level"><span class="row-txt"><span class="t">How bright</span></span><span class="row-val">${g.level}%</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
          </div>
          ${gs.levelOpen ? `<div class="chip-wrap">${[40, 60, 80, 100].map(v => `<button class="chip sm" aria-pressed="${g.level === v}" data-act="w-level-set" data-v="${v}">${v}%</button>`).join('')}</div>` : ''}
          ${shades.length ? `<div class="t-over sec-s">Close any shades too?</div><div class="chip-wrap">${shades.map(d => `<button class="chip sm" aria-pressed="${g.shades.includes(`d:${d.device_id}`)}" data-act="w-shade" data-v="d:${esc(d.device_id)}">${esc(d.name)}</button>`).join('')}</div>` : ''}` },
    ];
  }
  if (gs.kind === 'wakeup') {
    const dims = data.controllable().filter(d => d.domain === 'light');
    const beds = dims.filter(d => /bed|nursery|guest/i.test(data.devAreaName(d)));
    const shown = (gs.allLamps ? dims : beds.length ? beds : dims.slice(0, 6));
    if (g.lamp && !shown.some(d => d.device_id === g.lamp) && data.dev(g.lamp)) shown.unshift(data.dev(g.lamp));
    const shade = RT.wakeShade(g);
    // 11 · the rise rehearsed on the phone once there is a lamp, a time and a length to show (routine.js)
    const preview = g.lamp ? `<div class="t-over sec-s">See how it wakes you</div>${sunriseHTML(c, { lamp: g.lamp, start: RT.hmAdd(g.alarm, -g.minutes), minutes: g.minutes, end: g.end, days: g.days }, 'setup')}` : '';
    return [
      { q: 'Which lamp should wake you?', ok: !!g.lamp, body: `<div class="answers">${shown.map(d => tile('k-lamp', d.device_id, `${esc(d.name)}<small>${esc(data.devAreaName(d))}</small>`, g.lamp === d.device_id)).join('')}${gs.allLamps || dims.length === shown.length ? '' : tile('k-all', '1', 'Another light…', false)}</div>` },
      { q: 'What time do you wake up?', ok: g.days.length > 0, body: `<div class="when-time"><input class="time-big" type="time" value="${esc(g.alarm)}" data-change="k-alarm" aria-label="Wake up at"></div>${dayTiles('k-days')}` },
      { q: 'How gently?', ok: true, body: `<div class="t-over sec-s">It takes</div><div class="answers">${[15, 25, 40].map(v => tile('k-min', v, `${v} minutes`, g.minutes === v)).join('')}</div>
          <div class="t-over sec-s">And ends at</div><div class="answers">${[30, 50, 70].map(v => tile('k-end', v, `${v}%`, g.end === v)).join('')}</div>${preview}` },
      { q: `Open ${shade ? shade.name : 'the shade'} too?`, skip: !shade, ok: true, body: `<div class="answers">${tile('k-shade', '1', 'Yes, when I wake', !!g.shade)}${tile('k-shade', '0', 'No', !g.shade)}</div>${preview}` },
    ];
  }
  // a Goodnight or a Leaving button
  const rs = data.remotes();
  const d = data.dev(g.remote);
  const keys = d ? REM.slots(d).filter(x => x.real) : [];
  const replaces = d ? REM.gestureActions(g.remote, g.button, 'hold') : [];
  const lights = data.controllable().filter(x => x.domain === 'light' || x.domain === 'switch');
  const goodnight = gs.kind === 'goodnight';
  const keepTiles = goodnight
    ? roomTiles('b-keep', [...data.groups().filter(x => /night path/i.test(x.name)).map(x => [`g:${x.id}`, x.name]), ...RT.lightRooms().map(a => [`a:${a.id}`, a.name])], 'keep') + `<div class="group"><button class="row ${g.keep.length ? '' : 'sel'}" data-act="b-none"><span class="row-txt"><span class="t">None: everything off at once</span></span>${g.keep.length ? '' : `<span class="row-tick">${icon('check', 20, 1.9)}</span>`}</button></div>`
    : `<div class="answers">${lights.sort((a, b) => (/hall|entry|foyer|mud/i.test(data.devAreaName(b)) ? 1 : 0) - (/hall|entry|foyer|mud/i.test(data.devAreaName(a)) ? 1 : 0)).slice(0, 8).map(x => tile('b-door', `d:${x.device_id}`, `${esc(x.name)}<small>${esc(data.devAreaName(x))}</small>`, g.keep[0] === `d:${x.device_id}`)).join('')}</div>`;
  return [
    { q: goodnight ? 'Which remote is by your bed?' : 'Which remote is by the door you leave from?', skip: rs.length < 2, ok: !!d, body: `<div class="answers remotes">${rs.map(x => tile('b-remote', x.device_id, `<span class="ans-pico">${picoSVG({ model: REM.modelFor(x), finish: REM.finishFor(x), keys: REM.slots(x), height: 44 })}</span>${esc(x.name)}<small>${esc(data.devAreaName(x))}</small>`, g.remote === x.device_id)).join('')}</div>` },
    { q: `Which button do you hold for ${goodnight ? 'Goodnight' : 'Leaving'}?`, ok: true, body: `<div class="answers">${keys.map(k => tile('b-key', k.n, `Hold ${esc(REM.buttonName(g.remote, k.n).toLowerCase())}`, g.button === k.n)).join('')}</div>
        ${replaces.length ? `<p class="t-cap muted sheet-p">This replaces what holding it does now: ${esc(data.describe(replaces))}</p>` : ''}` },
    { q: goodnight ? 'Which lights light the way to bed?' : 'Which light is by that door?', ok: goodnight || g.keep.length > 0, body: `<p class="t-cap muted sheet-p">${goodnight ? 'They stay dim for two minutes after everything else goes off.' : 'It stays on for two minutes after everything else goes off.'}</p>${keepTiles}` },
  ];
}
const summary = (c, gs) => (gs.kind === 'welcome' ? c.RT.welcomeSummary(gs.g) : gs.kind === 'wakeup' ? c.RT.wakeupSummary(gs.g) : c.RT.buttonSummary(gs.g));

export function view(c, r) {
  const { esc, icon } = c;
  const kind = r.id;
  if (!KINDS[kind] || (kind === 'goodnight' || kind === 'leaving') && !c.data.remotes().length) {
    return `<header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header><h1 class="t-h1 page-h1">${esc(KINDS[kind] || 'Set up')}</h1><p class="t-body muted soon">${kind === 'goodnight' || kind === 'leaving' ? 'This needs a remote. Pair a Pico first and it shows up here.' : 'Nothing to set up here.'}</p>`;
  }
  const gs = state(c, kind);
  const all = steps(c, gs); const live = all.filter(x => !x.skip);
  if (gs.step >= live.length) gs.step = live.length - 1;
  const st = live[gs.step];
  const last = gs.step === live.length - 1;
  const dots = live.map((_, i) => `<i class="${i < gs.step ? 'done' : i === gs.step ? 'cur' : ''}"></i>`).join('');
  return `<div class="guided">
    <header class="hdr"><button class="hdr-btn back" data-act="gs-back" aria-label="Back">${icon('back', 22, 1.7)}</button>
      <div class="stepper">${dots}<span>${gs.step + 1} of ${live.length}</span></div></header>
    <div class="g-art"><span class="glow"></span><img src="${c.artSrc(ART[kind])}" alt=""></div>
    <div class="t-over g-over">${esc(KINDS[kind])}</div>
    <h2 class="g-q">${esc(st.q)}</h2>
    <div class="g-body">${st.body}</div>
    <div class="sofar"><span class="t-over">So far</span><p>${esc(summary(c, gs))}</p></div>
    <button class="next-btn" data-act="gs-next" ${st.ok ? '' : 'disabled'}>${last ? (kind === 'welcome' || kind === 'wakeup' ? 'Turn it on' : 'Set up the button') : 'Next'}</button>
  </div>`;
}

// ---------- taps ----------
const G = c => c.ui.gs && c.ui.gs.g;
const toggleIn = (list, v) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
export function after(c, r, scr) { wireSunrise(c, scr); }
export const actions = {
  ...whereActions,
  ...sunriseActions,
  // back through the questions, and from the first one out the way it came in (a step back, not Routines pushed on top)
  'gs-back'(c) { const gs = c.ui.gs; if (gs && gs.step > 0) { gs.step -= 1; gs.other = false; c.render(); window.scrollTo(0, 0); } else { c.ui.gs = null; c.back(); } },
  'gs-next'(c, el, r) {
    const gs = c.ui.gs; if (!gs) return;
    const live = steps(c, gs).filter(x => !x.skip);
    if (!live[gs.step] || !live[gs.step].ok) return;
    if (gs.step < live.length - 1) { gs.step += 1; gs.other = false; gs.pickDays = false; c.render(); window.scrollTo(0, 0); return; }
    // The last Next sets it up and goes to what it made: back to Routines, where the walk was started, or the
    // remote's page in the walk's own place in the history. Either way Back no longer goes into the walk again at
    // its first question, which it did when the page was pushed on top of it.
    const g = gs.g;
    if (gs.kind === 'welcome') { if (!c.RT.saveWelcome(g)) return; c.ui.gs = null; c.save('Welcome lights set up'); c.finish('routines'); return; }
    if (gs.kind === 'wakeup') { if (!c.RT.saveWakeup(g)) return; c.ui.gs = null; c.save('Wake-up light on'); c.finish('routines'); return; }
    if (!c.RT.saveButton(g)) return;
    c.ui.gs = null;
    c.ui.remoteKey = { ...(c.ui.remoteKey || {}), [g.remote]: g.button };
    c.save(`${gs.kind === 'goodnight' ? 'Goodnight' : 'Leaving'} button set up`);
    c.replace(`remote/${g.remote}`);
  },
  'gs-day'(c, el) { const g = G(c); const d = Number(el.dataset.d); const next = toggleIn(g.days, d); if (!next.length) { c.toast('Pick at least one day'); return; } g.days = next.sort(); c.ui.gs.pickDays = true; c.render(); },
  // welcome
  'w-target'(c, el) { const g = G(c); const v = el.dataset.v; g.targets = g.targets.includes(v) ? g.targets.filter(x => x !== v) : c.REM.normalizeTargets([...g.targets, v], v); c.render(); },
  'w-arrive'(c, el) { const g = G(c); if (el.dataset.other) { c.ui.gs.other = true; g.arrive = 'time'; } else { c.ui.gs.other = false; g.arrive = 'time'; g.arriveTime = el.dataset.v; } c.render(); },
  'w-arrive-time'(c, el, r, v) { if (/^\d\d:\d\d$/.test(v)) { G(c).arriveTime = v; c.render(); } },
  'w-sunset'(c) { const g = G(c); g.arrive = 'sunset'; c.ui.gs.other = false; c.render(); },
  'w-offset'(c, el) { G(c).offset = Number(el.dataset.v); c.render(); },
  'w-days'(c, el) { G(c).days = [...c.RT.QUICK_DAYS[el.dataset.v]]; c.ui.gs.pickDays = false; c.render(); },
  'w-days-pick'(c) { c.ui.gs.pickDays = true; c.render(); },
  'w-dark'(c) { const g = G(c); g.onlyDark = !g.onlyDark; c.render(); },
  'w-until'(c, el) { G(c).until = el.dataset.v; c.render(); },
  'w-until-time'(c, el, r, v) { if (/^\d\d:\d\d$/.test(v)) { G(c).untilTime = v; c.render(); } },
  'w-low'(c) { const g = G(c); g.low = !g.low; c.render(); },
  'w-level'(c) { c.ui.gs.levelOpen = !c.ui.gs.levelOpen; c.render(); },
  'w-level-set'(c, el) { G(c).level = Number(el.dataset.v); c.render(); },
  'w-shade'(c, el) { const g = G(c); g.shades = toggleIn(g.shades, el.dataset.v); c.render(); },
  // wake-up
  'k-lamp'(c, el) { G(c).lamp = el.dataset.v; c.render(); },
  'k-all'(c) { c.ui.gs.allLamps = true; c.render(); },
  'k-alarm'(c, el, r, v) { if (/^\d\d:\d\d$/.test(v)) { G(c).alarm = v; c.render(); } },
  'k-days'(c, el) { G(c).days = [...c.RT.QUICK_DAYS[el.dataset.v]]; c.ui.gs.pickDays = false; c.render(); },
  'k-days-pick'(c) { c.ui.gs.pickDays = true; c.render(); },
  'k-min'(c, el) { G(c).minutes = Number(el.dataset.v); c.render(); },
  'k-end'(c, el) { G(c).end = Number(el.dataset.v); c.render(); },
  'k-shade'(c, el) { G(c).shade = el.dataset.v === '1'; c.render(); },
  // buttons
  'b-remote'(c, el) { const g = G(c); const d = c.data.dev(el.dataset.v); if (!d) return; g.remote = d.device_id; g.button = c.RT.holdButton(d); c.render(); },
  'b-key'(c, el) { G(c).button = Number(el.dataset.v); c.render(); },
  'b-keep'(c, el) { const g = G(c); const v = el.dataset.v; g.keep = g.keep.includes(v) ? g.keep.filter(x => x !== v) : c.REM.normalizeTargets([...g.keep, v], v); c.render(); },
  'b-none'(c) { G(c).keep = []; c.render(); },
  'b-door'(c, el) { G(c).keep = [el.dataset.v]; c.render(); },
};
