// 07 · a remote (12733:237), 08 · what a press does (12733:49417), 09 · what it controls (12734:20).
//
// #remote/<id> is the remote on its stage with a leader to each key: what the key does, and a dot that says set,
// nothing yet, or pointing at something gone. Under it, the picked key's three presses. #remote/<id>/k<n>-<press>
// is the sheet for one press: what it controls, five suggested ways, every other way, a different way at night,
// and building it step by step. #remote/<id>/more is the rest: the room, the picture, the usual layout, the Lutron
// app, removing it.
import { keyCentres, PICO_BOX } from '/ui/pico.js';
import { remoteArt, pressedKey } from '/ui/screens/remotes.js';
import { valueLine, lampHex } from '/ui/screens/parts.js';
import { roomPicker, confirmSheet } from '/ui/screens/pickers.js';
import { picoSVG } from '/ui/pico.js';
import { colourName } from '/ui/colour.js';
import { stepCards } from '/ui/screens/steps.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const G = ['single', 'double', 'hold'];
const STAGE_H = 300, STAGE_TOP = 16, STAGE_LEFT = 24;
const usualHidden = pid => { try { return !!localStorage.getItem(`usualHidden:${pid}`); } catch (_) { return false; } };

// The key picked on a remote's page: the one last pressed or tapped, else the first.
function keyOf(c, d) {
  const ns = c.REM.buttonNumbers(d);
  const k = (c.ui.remoteKey || {})[d.device_id];
  return ns.includes(k) ? k : ns[0];
}
// "10:30 pm"
const clock = hm => { if (!hm) return ''; const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`; };

// What a key's leader says: the first thing it does, and a word about the rest.
function leader(c, pid, n) {
  const R = c.REM;
  if (R.buttonBroken(pid, n)) return { err: true, t: 'Light removed', s: 'Points at a removed light' };
  const set = G.filter(g => R.gestureActions(pid, n, g).length);
  if (!set.length) {
    const inh = R.inheritedHold(pid, n);
    return inh ? { t: 'Nothing yet', s: `Hold ${inh.dir === 'up' ? 'brightens' : 'dims'}` } : { none: true, t: 'Nothing yet', s: '' };
  }
  const first = set[0];
  const acts = R.gestureActions(pid, n, first);
  const rest = set.slice(1);
  const t = first === 'single' ? R.shortDescribe(acts) : `${R.GESTURE_WORD[first]}: ${R.shortDescribe(acts)}`;
  const s = rest.length === 1 ? `${R.GESTURE_WORD[rest[0]]}: ${R.shortDescribe(R.gestureActions(pid, n, rest[0]))}` : rest.length ? `Also ${rest.map(g => R.GESTURE_WORD[g].toLowerCase()).join(', ')}` : '';
  return { t, s };
}

function stage(c, d, sel) {
  const { esc, REM } = c;
  const pid = d.device_id;
  const model = REM.modelFor(d);
  const scale = STAGE_H / PICO_BOX.H;
  const pressed = pressedKey(c, pid);
  const keys = keyCentres(model, REM.slots(d)).filter(k => k.real);
  // Each label sits beside its key unless that would crowd the one above, when it moves down and its leader bends to
  // reach it: the middle keys of a remote with arrows sit closer together than two lines of words.
  const ys = keys.map(k => Math.round(STAGE_TOP + k.at[1] * scale));
  const ly = [];
  ys.forEach((y, i) => { ly[i] = Math.max(y, i ? ly[i - 1] + 42 : 22); });
  const over = ly.length ? ly[ly.length - 1] - 310 : 0;
  if (over > 0) for (let i = ly.length - 1; i >= 0; i--) ly[i] = Math.min(ly[i] - (i === ly.length - 1 ? over : 0), i < ly.length - 1 ? ly[i + 1] - 42 : ly[i]);
  const DOT = 158, BEND = 176, END = 196;
  const paths = keys.map((k, i) => {
    const L = leader(c, pid, k.n);
    const cls = L.err ? 'err' : '';
    return `<path class="${cls}" d="M${DOT + 8} ${ys[i]} H${BEND} L${END - 6} ${ly[i]} H${END}"/><circle class="le ${cls} ${k.n === sel ? 'on' : ''}" cx="${END + 2}" cy="${ly[i]}" r="2"/>`;
  }).join('');
  const lines = keys.map((k, i) => {
    const L = leader(c, pid, k.n);
    const state = L.err ? 'err' : L.none ? 'none' : 'set';
    const on = k.n === sel;
    return `<i class="sd ${state}" style="top:${ys[i] - 3}px"></i>
      <button class="ld ${state} ${on ? 'on' : ''} ${pressed === k.n ? 'pressed' : ''}" style="top:${ly[i] - 20}px" data-act="key" data-n="${k.n}" aria-label="${esc(REM.buttonName(pid, k.n))}">
      <span class="lt nm-cut">${esc(L.t)}</span>${L.s ? `<span class="ls nm-cut">${esc(L.s)}</span>` : ''}</button>`;
  }).join('');
  return `<div class="rstage">
    <span class="rart" style="left:${STAGE_LEFT}px;top:${STAGE_TOP}px">${remoteArt(c, d, { height: STAGE_H, sel, pressed, interactive: 'key', label: n => esc(REM.buttonName(pid, n)) })}</span>
    <svg class="leaders" width="372" height="332" aria-hidden="true">${paths}</svg>${lines}</div>`;
}

// The three presses of the picked key.
function pressRows(c, d, n) {
  const { esc, icon, REM } = c;
  const pid = d.device_id;
  const night = c.S.config.settings.night_start;
  return G.map(g => {
    const acts = REM.gestureActions(pid, n, g);
    const nacts = REM.gestureActions(pid, n, g, true);
    const b = REM.mainBinding(pid, n, g);
    const broken = b && REM.bindingBroken(b);
    const inh = g === 'hold' && !acts.length ? REM.inheritedHold(pid, n) : null;
    const value = broken ? 'Points at a removed light' : acts.length ? REM.shortDescribe(acts) : inh ? `${inh.dir === 'up' ? 'Brightens' : 'Dims'} while held · follows the press` : 'Nothing yet';
    return `<button class="row prow ${nacts.length ? 'tall' : ''}" data-go="remote/${esc(pid)}/k${n}-${g}" data-grow="${n}/${g}">
      <span class="row-txt"><span class="pl">${REM.GESTURE_WORD[g]}</span><span class="pv ${broken ? 'err' : acts.length || inh ? '' : 'q'}">${esc(value)}</span>
      ${nacts.length ? `<span class="pn">${icon('moon', 14, 1.5)}<span>After ${esc(clock(night))}: ${esc(REM.shortDescribe(nacts))}</span></span>` : ''}</span>
      <span class="row-chev">${icon('chev', 16, 1.8)}</span></button>`;
  }).join('');
}

export function view(c, r) {
  const { esc, icon, REM, data } = c;
  const d = data.dev(r.id);
  if (!d || d.domain !== 'pico') return `<header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header><h1 class="t-h1 page-h1">Remote</h1><p class="t-body muted soon">This remote is not in your home any more.</p>`;
  const pid = d.device_id;
  const sel = keyOf(c, d);
  const has = REM.buttonNumbers(d).some(n => REM.buttonSet(pid, n));
  const quiet = !data.buttonsOf(pid).length;
  const u = REM.usualLayoutTargets(d);
  const offer = !has && u && !usualHidden(pid)
    ? `<div class="offer"><p class="t-row">Want the usual way?</p><p class="t-cap muted">Top turns ${esc(data.devAreaName(d))} on, bottom turns it off, holding either brightens or dims${u.round != null ? ', the middle is a scene' : ''}.</p>
        <div class="btns"><button class="pill blue" data-act="usual">Set up the usual way</button><button class="pill ghost" data-act="usual-hide">I'll pick myself</button></div></div>` : '';
  const waiting = quiet ? `<div class="note warn">${icon('info', 20, 1.4)}<p>Your bridge has not listed this remote's keys yet. It can take a few minutes after a remote is added. Press a key on it once and it is learned; until then what you set is kept but does not run. <button class="link blue" data-act="refresh">Look again</button></p></div>` : '';
  const twice = REM.gestureActions(pid, sel, 'double').length
    ? `<div class="note">${icon('info', 20, 1.4)}<p>This button has a double press now, so its single press waits a moment to tell them apart.</p></div>` : '';
  return `<div class="remote-page">
    <header class="hdr">
      <button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button>
      <button class="hdr-btn a1" data-go="remote/${esc(pid)}/more" aria-label="More">${icon('dots', 22, 1.7)}</button>
    </header>
    <h1 class="t-h1 page-h1 nm-cut">${esc(d.name)}</h1>
    <p class="t-cap muted rm-sub">${esc(REM.modelLine(d))}</p>
    <div class="listen pin"><span class="breath"><i></i></span><span>Press any button on a real remote to jump to it</span></div>
    ${waiting}${offer}
    ${stage(c, d, sel)}
    <div class="t-over sec rm-key">${esc(REM.buttonName(pid, sel))}</div>
    <div class="group">${pressRows(c, d, sel)}</div>
    ${twice}
  </div>`;
}

// ---------- 08 · one press ----------
const pressKey = (pid, n, g) => `${pid}/${n}/${g}`;
function parse(r) { const m = /^k(\d+)-(single|double|hold)$/.exec(r.sub || ''); return m ? { n: Number(m[1]), g: m[2] } : null; }
// The lights this press is pointed at: what is being picked, else what it does now, else the remote's room.
function picked(c, pid, n, g) {
  const k = pressKey(pid, n, g);
  const cur = (c.ui.pick || {})[k];
  return cur && cur.length ? cur : c.REM.targetsOf(pid, n, g);
}
const T = (c, pid, n, g) => c.REM.packTarget(picked(c, pid, n, g));
function targetWord(c, t) {
  const list = Array.isArray(t) ? t : [t];
  if (list.length > 1) return c.REM.targetSummary(t);
  const w = c.data.targetName(t);
  return w.charAt(0).toUpperCase() + w.slice(1);
}
const radio = (on, icon) => `<span class="radio ${on ? 'on' : ''}">${on ? icon('check', 14, 2.2) : ''}</span>`;
function wayRow(c, pid, r, sel, night) {
  const { esc, icon } = c;
  const d = c.REM.recipeLine(r, pid);
  return `<button class="row way ${sel ? 'sel' : ''} ${d ? 'two' : ''}" data-act="way" data-r="${r.id}" ${night ? 'data-night="1"' : ''} aria-pressed="${sel}">
    ${radio(sel, icon)}<span class="row-txt"><span class="t">${esc(r.t)}</span>${d ? `<span class="d">${esc(d)}</span>` : ''}</span>${r.pick ? `<span class="row-chev">${icon('chev', 16, 1.8)}</span>` : ''}</button>`;
}
function pressSheet(c, r) {
  const d = c.data.dev(r.id); const p = parse(r); if (!d || !p) return null;
  const { esc, icon, REM } = c;
  const { n, g } = p; const pid = d.device_id;
  const acts = REM.gestureActions(pid, n, g);
  const nacts = REM.gestureActions(pid, n, g, true);
  const t = T(c, pid, n, g);
  const cur = REM.recipeOf(acts);
  const s = c.S.config.settings;
  const inh = g === 'hold' && !acts.length ? REM.inheritedHold(pid, n) : null;
  const notes = [
    g === 'double' && !acts.length ? 'Once it has a press twice, a single press waits a moment so the two can be told apart.' : null,
    inh ? `With nothing set here, holding this button ${inh.dir === 'up' ? 'brightens' : 'dims'} ${c.data.targetName(inh.target)} until you let go, because a press nudges it. Pick something below to do that instead.` : null,
    acts.length && REM.mainBinding(pid, n, g) && REM.bindingBroken(REM.mainBinding(pid, n, g)) ? 'This points at something that has been removed. Pick again.' : null,
  ].filter(Boolean).map(x => `<div class="note">${icon('info', 20, 1.4)}<p>${esc(x)}</p></div>`).join('');
  const custom = cur === 'custom' ? `<button class="row way sel two" data-act="steps" aria-pressed="true">${radio(true, icon)}<span class="row-txt"><span class="t">Your own steps</span><span class="d">${esc(c.data.describe(acts))}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : '';
  const body = `<div class="press">
    <div class="group"><button class="row slim" data-act="controls"><span class="row-txt"><span class="t">Controls</span></span><span class="row-val">${esc(targetWord(c, t))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button></div>
    ${notes}
    <div class="t-over sec-s">Suggested</div>
    <div class="group">${custom}${REM.suggested(pid, n, g, t).map(x => wayRow(c, pid, x, x.id === cur, false)).join('')}</div>
    <button class="card-row press-more" data-act="ways"><span class="row-ic">${icon('dots', 18, 1.6)}</span><span class="row-txt"><span class="t">More choices</span><span class="d">Brightness steps, hold to dim, timers, leaving, fans…</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    <div class="group night-g">
      <div class="row nrow"><span class="row-ic">${icon('moon', 18, 1.6)}</span><span class="row-txt"><span class="t">Different at night</span><span class="d">${esc(clock(s.night_start))} to ${esc(clock(s.night_end))}</span></span>
        <button class="toggle" role="switch" aria-checked="${!!nacts.length}" data-act="night-toggle" aria-label="Different at night"></button></div>
      ${nacts.length ? `<button class="row nsent" data-act="night-ways"><i class="cn"></i>${icon('moon', 16, 1.6)}<span class="row-txt"><span class="nw">At night:</span> <span class="nv">${esc(REM.shortDescribe(nacts))}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : ''}
    </div>
    <button class="card-row press-steps" data-act="steps"><span class="row-ic">${icon('tune', 18, 1.6)}</span><span class="row-txt"><span class="t">Build it step by step</span><span class="d">Several steps, waits, colours</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    ${acts.length ? `<div class="sheet-btns"><button class="pill ghost" data-act="try">Try it now</button><button class="pill ghost" data-act="clear">Clear this press</button></div>` : ''}
  </div>`;
  return { over: d.name, title: `${REM.buttonName(pid, n)} · ${REM.GESTURE_WORD[g]}`, body };
}

// ---------- 09 · what it controls ----------
const MODES = [['one', 'One light'], ['room', 'A room'], ['several', 'Pick several'], ['house', 'Whole house'], ['shades', 'All shades'], ['fans', 'All fans'], ['sets', 'Saved sets']];
function modeOf(t) {
  if (Array.isArray(t)) return 'several';
  if (t === 'h:all') return 'house'; if (t === 'h:shades') return 'shades'; if (t === 'h:fans') return 'fans';
  if (t.startsWith('g:')) return 'sets'; if (t.startsWith('d:')) return 'one';
  return 'room';
}
function lampCircle(c, d) {
  const on = c.data.isOn(d.device_id);
  const hex = on ? lampHex(c, d) : null;
  return `<span class="lampc ${on ? 'on' : ''}"${hex ? ` style="color:${hex}"` : ''}>${c.icon(d.domain === 'fan' ? 'fan' : d.domain === 'cover' ? 'shade' : 'lamp', 18, 1.3)}</span>`;
}
function levelText(c, d) {
  const v = valueLine(c, d); const hex = lampHex(c, d);
  const nm = hex && c.data.isOn(d.device_id) ? colourName(hex) : null;
  return nm ? `<span class="lv">${c.data.level(d.device_id)}% · ${c.esc(nm)}</span><i class="cdot" style="background:${hex}"></i>` : `<span class="lv ${c.data.isOn(d.device_id) ? '' : 'off'}">${c.esc(v)}</span>`;
}
function controlsSheet(c, pid, n, g, over) {
  const { esc, icon, data, REM } = c;
  const t = T(c, pid, n, g); const list = Array.isArray(t) ? t : [t];
  const k = pressKey(pid, n, g);
  const mode = ((c.ui.ctlMode || {})[k]) || modeOf(t);
  const hasShades = data.controllable().some(d => d.domain === 'cover'), hasFans = data.controllable().some(d => d.domain === 'fan');
  const chips = MODES.filter(([m]) => (m !== 'shades' || hasShades) && (m !== 'fans' || hasFans) && (m !== 'sets' || true))
    .map(([m, l]) => `<button class="chip sm ${mode === m ? 'lead' : ''}" aria-pressed="${mode === m}" data-act="ctl-mode" data-m="${m}">${mode === m ? icon('check', 16, 1.6) : ''}${l}</button>`).join('');
  const lights = data.controllable().filter(d => d.domain !== 'cover' || mode === 'several');
  const allIds = new Set(data.targetDevices(t));
  let body = '';
  if (mode === 'one' || mode === 'several') {
    body = data.areas().map(a => {
      const ds = lights.filter(d => data.devArea(d) === a.id); if (!ds.length) return '';
      const inRoom = ds.filter(d => allIds.has(d.device_id)).length;
      return `<div class="ck-head"><span class="t-over">${esc(a.name)}</span>${mode === 'several' ? `<span class="ck-n">${inRoom} of ${ds.length}</span>` : ''}</div>
        <div class="group">${ds.map(d => {
          const on = mode === 'one' ? list.length === 1 && list[0] === `d:${d.device_id}` : allIds.has(d.device_id);
          return `<button class="row ck" data-act="${mode === 'one' ? 'ctl-set' : 'ctl-toggle'}" data-t="d:${esc(d.device_id)}" aria-pressed="${on}">
            ${lampCircle(c, d)}<span class="row-txt"><span class="t ${data.isOn(d.device_id) ? '' : 'off'}">${esc(d.name)}</span></span>${levelText(c, d)}
            ${mode === 'one' ? radio(on, icon) : `<span class="box ${on ? 'on' : ''}">${on ? icon('check', 14, 2.2) : ''}</span>`}</button>`;
        }).join('')}</div>`;
    }).join('');
  } else if (mode === 'room') {
    body = `<div class="group">${data.areas().filter(a => data.targetDevices(`a:${a.id}`).length).map(a => {
      const on = list.length === 1 && list[0] === `a:${a.id}`;
      return `<button class="row ck" data-act="ctl-set" data-t="a:${esc(a.id)}" aria-pressed="${on}"><span class="row-txt"><span class="t">${esc(a.name)}</span></span><span class="lv">${plural(data.targetDevices(`a:${a.id}`).length, 'light')}</span>${radio(on, icon)}</button>`;
    }).join('')}</div>`;
  } else if (mode === 'house' || mode === 'shades' || mode === 'fans') {
    const tt = { house: 'h:all', shades: 'h:shades', fans: 'h:fans' }[mode];
    const on = list.length === 1 && list[0] === tt;
    body = `<div class="group"><button class="row ck" data-act="ctl-set" data-t="${tt}" aria-pressed="${on}"><span class="row-txt"><span class="t">${{ house: 'Every light in the house', shades: 'Every shade', fans: 'Every fan' }[mode]}</span></span><span class="lv">${data.targetDevices(tt).length}</span>${radio(on, icon)}</button></div>`;
  } else if (mode === 'sets') {
    body = `<div class="t-over sec-s">Saved sets</div><div class="chip-wrap sets">${data.groups().map(gr => `<button class="chip lead" aria-pressed="${list.length === 1 && list[0] === `g:${gr.id}`}" data-act="ctl-set" data-t="g:${esc(gr.id)}">${icon('lamp', 16, 1.2)}${esc(gr.name)}<span class="muted">· ${plural(gr.device_ids.length, 'light')}</span></button>`).join('')}
      <button class="chip lead" data-act="ctl-newset">${icon('plus', 16, 1.2)}New set</button></div>
      <p class="t-cap muted sheet-p ctl-note">A new set is made from the lights picked now. Rename or change sets in Settings.</p>`;
  }
  const summary = `<div class="ctl-sum"><span class="row-ic">${icon('lamp', 20, 1.3)}</span><div><p><span class="muted">Controls </span><b>${esc(data.targetDevices(t).length ? REM.targetSummary(t) : targetWord(c, t))}</b></p><p class="t-cap muted">Applied as you pick · Undo from the toast</p></div></div>`;
  return { over, title: 'Controls', body: `<div class="ctl"><div class="chip-wrap modes">${chips}</div>${body}${summary}</div>` };
}

// ---------- the other pickers ----------
function waysSheet(c, pid, n, g, night) {
  const { esc, REM } = c;
  const t = T(c, pid, n, g);
  const cur = REM.recipeOf(REM.gestureActions(pid, n, g, night));
  const body = REM.allWays(pid, n, g, t).map(([name, rs]) => `<div class="t-over sec-s">${esc(name)}</div><div class="group">${rs.map(x => wayRow(c, pid, x, x.id === cur, night)).join('')}</div>`).join('');
  const nightNote = night ? `<p class="t-cap muted sheet-p">Between ${clock(c.S.config.settings.night_start)} and ${clock(c.S.config.settings.night_end)} this press does this instead. The hours are the house's, in Settings.</p>` : '';
  const nightSteps = night ? `<button class="card-row press-steps" data-act="night-steps"><span class="row-ic">${c.icon('tune', 18, 1.6)}</span><span class="row-txt"><span class="t">Build the night version step by step</span><span class="d">Several steps, waits, colours</span></span><span class="row-chev">${c.icon('chev', 16, 1.8)}</span></button>` : '';
  return { over: `${REM.buttonName(pid, n)} · ${REM.GESTURE_WORD[g]}`, title: night ? 'At night' : 'More choices', body: `<div class="ways">${nightNote}${night ? `<div class="group">${wayRow(c, pid, { id: 'nothing', t: 'Nothing different', d: 'The same as the rest of the day' }, false, true)}</div>` : ''}${body}${nightSteps}</div>` };
}
function sceneSheet(c, pid, n, g, night) {
  const { esc, data, H, REM } = c;
  const x = REM.recipeCtx(pid);
  const cur = REM.gestureActions(pid, n, g, night)[0] || {};
  const row = (a, name, sub) => {
    const on = (a.type === 'preset' && cur.type === 'preset' && cur.preset_id === a.preset_id) || (a.type === 'scene' && cur.type === 'scene' && cur.scene_id === a.scene_id);
    return `<button class="row way ${on ? 'sel' : ''} two" data-act="scene-pick" data-a="${esc(JSON.stringify(a))}" ${night ? 'data-night="1"' : ''}>${radio(on, c.icon)}<span class="row-txt"><span class="t">${esc(name)}</span><span class="d">${esc(sub)}</span></span></button>`;
  };
  const rooms = data.areas().filter(a => H.roomScenes(a.id).length).sort((a, b) => (b.id === x.aid) - (a.id === x.aid));
  let body = rooms.map(a => `<div class="t-over sec-s">${esc(a.name)}${a.id === x.aid ? " · this remote's room" : ''}</div><div class="group">${H.roomScenes(a.id).map(p => row({ type: 'preset', preset_id: p.id }, H.sceneShortName(p), p.mood ? (p.edited ? 'Changed by you' : 'Suggested') : 'Yours')).join('')}</div>`).join('');
  const loose = data.presets().filter(p => !p.area || !data.areas().some(a => a.id === p.area));
  if (loose.length) body += `<div class="t-over sec-s">Any room</div><div class="group">${loose.map(p => row({ type: 'preset', preset_id: p.id }, p.name, 'Yours')).join('')}</div>`;
  const theirs = data.lutronScenes();
  if (theirs.length) body += `<div class="t-over sec-s">From the Lutron app</div><div class="group">${theirs.map(s => row({ type: 'scene', scene_id: s.scene_id }, s.name, 'From the Lutron app')).join('')}</div>`;
  return { over: `${REM.buttonName(pid, n)} · ${REM.GESTURE_WORD[g]}`, title: 'Which scene?', body: body || `<p class="t-body muted sheet-p">No scenes yet. Make one from a room's page or All scenes, then pick it here.</p>` };
}
function cycleSheet(c, pid, n, g, night) {
  const { esc, data, H, REM, icon } = c;
  const k = pressKey(pid, n, g);
  const pickedIds = (c.ui.cycle || {})[k] || REM.cycleIdsOf(pid, n, g, night);
  const x = REM.recipeCtx(pid);
  const row = p => { const at = pickedIds.indexOf(p.id); return `<button class="row way ${at >= 0 ? 'sel' : ''} two" data-act="cycle-scene" data-p="${esc(p.id)}"><span class="order ${at >= 0 ? 'on' : ''}">${at >= 0 ? at + 1 : ''}</span><span class="row-txt"><span class="t">${esc(H.sceneShortName(p))}</span><span class="d">${at >= 0 ? `Number ${at + 1} in the loop` : 'Not in the loop'}</span></span></button>`; };
  const rooms = data.areas().filter(a => H.roomScenes(a.id).length).map(a => {
    const mp = H.roomScenes(a.id); const all = mp.every(p => pickedIds.includes(p.id));
    return `<div class="t-over sec-s">${esc(a.name)}</div><div class="group"><button class="row two" data-act="cycle-room" data-a="${esc(a.id)}"><span class="row-ic">${icon('grid', 18, 1.6)}</span><span class="row-txt"><span class="t">All of ${esc(a.name)}'s scenes</span><span class="d">${all ? 'Already in the loop. Tap to take them out.' : `Adds ${mp.length} in order`}</span></span></button>${mp.map(row).join('')}</div>`;
  }).join('');
  const loose = data.presets().filter(p => !p.area);
  const pair = x.arrows && (n === x.arrows.up || n === x.arrows.down);
  return {
    over: `${REM.buttonName(pid, n)} · ${REM.GESTURE_WORD[g]}`, title: 'Which scenes, in order?',
    body: `<p class="t-cap muted sheet-p">${pair ? 'Up arrow goes forwards, down arrow goes back.' : 'One step per press.'} Tap them in the order the presses should walk them.</p>${rooms}${loose.length ? `<div class="t-over sec-s">Any room</div><div class="group">${loose.map(row).join('')}</div>` : ''}
      <div class="sheet-btns"><button class="pill solid" data-act="cycle-save" ${pickedIds.length < 2 ? 'disabled' : ''}>${pickedIds.length < 2 ? 'Pick at least two' : pair ? 'Set both arrows' : 'Use these'}</button><button class="pill ghost" data-act="cycle-clear">Start over</button></div>`,
  };
}
function doorSheet(c, pid, n, g, night) {
  const { esc, data, REM } = c;
  const cur = REM.doorOf(pid, n, g);
  const lights = data.controllable().filter(d => d.domain === 'light' || d.domain === 'switch');
  const body = data.areas().map(a => { const ds = lights.filter(d => data.devArea(d) === a.id); return ds.length ? `<div class="t-over sec-s">${esc(a.name)}</div><div class="group">${ds.map(d => `<button class="row ck" data-act="door-pick" data-t="d:${esc(d.device_id)}" ${night ? 'data-night="1"' : ''}>${lampCircle(c, d)}<span class="row-txt"><span class="t">${esc(d.name)}</span></span>${radio(cur === `d:${d.device_id}`, c.icon)}</button>`).join('')}</div>` : ''; }).join('');
  return { over: 'Leaving', title: 'Which light is by the door?', body: `<p class="t-cap muted sheet-p">It stays on for two minutes after everything else goes off.</p>${body}` };
}
// Building a press step by step: each step a card of plain fields, saved as it changes.
function stepsSheet(c, pid, n, g, night) {
  const { esc, icon, data, REM } = c;
  const b = REM.mainBinding(pid, n, g);
  const list = night ? ((b && b.night && b.night.actions) || []) : ((b && b.actions) || []);
  const cards = stepCards(c, list);
  return {
    over: `${REM.buttonName(pid, n)} · ${REM.GESTURE_WORD[g]}${night ? ' · at night' : ''}`, title: 'Step by step',
    body: `<div class="steps">${list.length ? '' : `<p class="t-cap muted sheet-p">${night && !b ? 'Set what this press does normally first; the night version sits on top of it.' : 'No steps yet. Steps run in order, top to bottom.'}</p>`}${cards}
      ${b && b.gesture === 'hold_start' && !night ? '<p class="t-cap muted sheet-p">These run when the hold begins; letting go stops them.</p>' : ''}
      <div class="sheet-btns"><button class="pill solid" data-act="st-add" ${night && !b ? 'disabled' : ''}>Add a step</button>${list.length ? '<button class="pill ghost" data-act="try" data-night="' + (night ? 1 : 0) + '">Try it</button>' : ''}</div></div>`,
  };
}

// ---------- the More sheet ----------
function moreSheet(c, r) {
  const d = c.data.dev(r.id); if (!d) return null;
  const { esc, icon, REM, data, EDIT } = c;
  const pid = d.device_id;
  const has = REM.buttonNumbers(d).some(n => REM.buttonSet(pid, n));
  const u = REM.usualLayoutTargets(d);
  const listed = data.buttonsOf(pid).map(b => b.button_number).sort((a, b) => a - b);
  const heard = REM.seen(d);
  const facts = `What your bridge says: ${d.type || 'no type'}${d.serial ? `, serial ${d.serial}` : ''}, ${listed.length ? `keys ${listed.join(', ')}` : heard.length ? `no keys listed, presses heard from ${heard.join(', ')}` : 'no keys listed yet'}.`;
  const body = `<div class="rmore">
    <div class="group">
      <button class="row" data-act="rm-room"><span class="row-txt"><span class="t">Room</span></span><span class="row-val">${esc(data.devAreaName(d))}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <button class="row" data-act="rm-look"><span class="row-txt"><span class="t">Not your remote? Change the picture</span></span><span class="row-val">${esc(REM.PICO_FINISHES[REM.finishFor(d)].name)}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <button class="row" data-go="timing"><span class="row-txt"><span class="t">Press timing</span><span class="d">How long a double press and a hold are</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    </div>
    <div class="group">
      ${u ? `<button class="row" data-act="usual"><span class="row-txt"><span class="t">${has ? 'Start over with the usual layout' : 'Set up the usual way'}</span><span class="d">Top turns ${esc(data.devAreaName(d))} on, bottom turns it off, holding either brightens or dims.</span></span></button>` : ''}
      ${has ? `<button class="row" data-act="rm-clear"><span class="row-txt"><span class="t">Clear every button</span><span class="d">It does nothing here until you pick again.</span></span></button>` : ''}
      <button class="row" data-act="rm-lutron" aria-expanded="${!!c.ui.lutronOpen}"><span class="row-txt"><span class="t">It may still do what the Lutron app set up</span><span class="d">${c.ui.lutronOpen ? 'To make a remote fully yours, open the Lutron app, tap this remote, and remove the lights it controls (keep it paired). From then on only your settings run. Leave it as it is if you only want to add a double press or a hold on top of what it already does.' : 'Both things happen. Tap to read how to make it fully yours.'}</span></span></button>
    </div>
    <div class="group"><button class="row" data-act="rm-remove"><span class="row-txt"><span class="t">Remove this remote from my home</span><span class="d">It leaves the bridge and stops working until it is added again.</span></span></button></div>
    <p class="t-cap muted sheet-p">${esc(facts)}</p></div>`;
  return { over: 'Remote', title: d.name, body };
}
function lookSheet(c, d) {
  const { esc, icon, REM } = c;
  const cur = REM.modelFor(d), fin = REM.finishFor(d);
  const rows = Object.entries(REM.PICO_MODELS).map(([k, m]) => `<button class="row look-row" data-act="look-model" data-m="${k}"><span class="look-th">${picoSVG({ model: k, finish: fin, height: 52 })}</span>
    <span class="row-txt"><span class="t">${esc(m.name)}</span><span class="d">${esc(m.long)}${m.types.includes(d.type) ? ' · what the bridge reports' : ''}</span></span>${cur === k ? `<span class="row-tick">${icon('check', 20, 1.9)}</span>` : ''}</button>`).join('');
  const fins = Object.entries(REM.PICO_FINISHES).map(([k, f]) => `<button class="chip sm lead" aria-pressed="${fin === k}" data-act="look-finish" data-f="${k}"><i class="cdot" style="background:${f.body};box-shadow:inset 0 0 0 1px ${f.edge}"></i>${esc(f.name)}</button>`).join('');
  return { over: d.name, title: 'Which remote is this?', body: `<div class="t-over sec-s">Colour</div><div class="chip-wrap">${fins}</div><div class="t-over sec-s">Layout</div><div class="group">${rows}</div><p class="t-cap muted sheet-p">The bridge already knows the layout. Change it only if the picture does not match what is on your wall.</p>` };
}

export const noTabs = false;
export function sheetFor(c, r) {
  if (r.sub === 'more') return { spec: moreSheet(c, r), parent: `remote/${r.id}` };
  if (parse(r)) return { spec: pressSheet(c, r), parent: `remote/${r.id}` };
  return null;
}

// ---------- taps ----------
const here = (c, r) => { const d = c.data.dev(r.id); const p = parse(r); return d && p ? { d, pid: d.device_id, n: p.n, g: p.g } : null; };
const said = (c, pid, n, g, acts) => `${c.REM.buttonName(pid, n)} · ${c.REM.GESTURE_WORD[g]} → ${acts && acts.length ? c.REM.shortDescribe(acts) : 'Nothing'}`;
async function tryList(c, list) {
  for (const a of list) {
    if (a.type === 'delay') { await new Promise(res => setTimeout(res, Math.min(a.ms || 0, 5000))); continue; }
    if (!(await c.run(a))) return;
  }
  c.toast('Done');
}
const stepsNight = c => !!(c.ui.picker && c.ui.picker.name === 'steps-night');
function stepList(c, x, night) {
  const b = c.REM.mainBinding(x.pid, x.n, x.g); if (!b) return null;
  return night ? ((b.night && b.night.actions) || null) : b.actions;
}
function setPick(c, x, list) {
  const k = pressKey(x.pid, x.n, x.g);
  c.ui.pick = { ...(c.ui.pick || {}), [k]: list };
  const t = c.REM.packTarget(list);
  const moved = [c.REM.retarget(x.pid, x.n, x.g, false, t), c.REM.retarget(x.pid, x.n, x.g, true, t)].some(Boolean);
  if (moved) c.save(`Controls ${targetWord(c, t)}`); else c.render();
}

export const actions = {
  key(c, el, r) { c.ui.remoteKey = { ...(c.ui.remoteKey || {}), [r.id]: Number(el.dataset.n) }; c.render(); },
  usual(c, el, r) {
    const d = c.data.dev(r.id); if (!d || !c.REM.applyUsualLayout(d.device_id)) return;
    c.save(`${d.name} set up the usual way`);
  },
  'usual-hide'(c, el, r) { try { localStorage.setItem(`usualHidden:${r.id}`, '1'); } catch (_) { /* fine */ } c.render(); },
  async refresh(c) { try { await c.data.api('/api/refresh', { method: 'POST' }); c.toast('Asked the bridge again'); } catch (e) { c.toast(e.message, { err: true }); } },

  // 08
  way(c, el, r) {
    const x = here(c, r); if (!x) return;
    const night = el.dataset.night === '1';
    const rid = el.dataset.r;
    const got = c.REM.applyRecipe(x.pid, x.n, x.g, night, rid, T(c, x.pid, x.n, x.g));
    if (!got) return;
    if (got.needsNormal) { c.toast('Pick what it does normally first'); return; }
    if (got.pick === 'scene') { c.openPicker('scene', c2 => sceneSheet(c2, x.pid, x.n, x.g, night)); return; }
    if (got.pick === 'cycle') { c.ui.cycle = { ...(c.ui.cycle || {}), [pressKey(x.pid, x.n, x.g)]: null }; c.ui.cycleNight = night; c.openPicker('cycle', c2 => cycleSheet(c2, x.pid, x.n, x.g, night)); return; }
    if (got.pick === 'door') { c.openPicker('door', c2 => doorSheet(c2, x.pid, x.n, x.g, night)); return; }
    if (got.pick === 'moods') {
      const k = c.REM.suggestAndCycle(x.pid, x.n, x.g, night);
      if (c.ui.picker) c.closePicker();
      c.save(k ? `${c.REM.recipeCtx(x.pid).room} has ${k} scenes, and a press steps through them` : 'Nothing to suggest yet');
      return;
    }
    c.save(night ? `At night: ${got.actions.length ? c.REM.shortDescribe(got.actions) : 'the same as by day'}` : said(c, x.pid, x.n, x.g, got.actions));
  },
  ways(c, el, r) { const x = here(c, r); if (x) c.openPicker('ways', c2 => waysSheet(c2, x.pid, x.n, x.g, false)); },
  'night-ways'(c, el, r) { const x = here(c, r); if (x) c.openPicker('night', c2 => waysSheet(c2, x.pid, x.n, x.g, true)); },
  'night-toggle'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const on = el.getAttribute('aria-checked') !== 'true';
    if (!on) { c.REM.setActions(x.pid, x.n, x.g, true, null); c.save('The same by night as by day'); return; }
    if (!c.REM.gestureActions(x.pid, x.n, x.g).length) { c.toast('Pick what it does normally first'); return; }
    // the usual night version: the same lights at a nightlight glow, or for a hold, dimming
    const got = c.REM.applyRecipe(x.pid, x.n, x.g, true, x.g === 'hold' ? 'hold_down' : 'night', T(c, x.pid, x.n, x.g));
    if (got && got.actions) c.save(`At night: ${c.REM.shortDescribe(got.actions)}`);
  },
  controls(c, el, r) { const x = here(c, r); if (x) c.openPicker('controls', c2 => controlsSheet(c2, x.pid, x.n, x.g, `${c2.REM.buttonName(x.pid, x.n)} · ${c2.REM.GESTURE_WORD[x.g]}`)); },
  'ctl-mode'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const m = el.dataset.m;
    c.ui.ctlMode = { ...(c.ui.ctlMode || {}), [pressKey(x.pid, x.n, x.g)]: m };
    // the modes that are one choice apply at once
    if (m === 'house' || m === 'shades' || m === 'fans') { setPick(c, x, [{ house: 'h:all', shades: 'h:shades', fans: 'h:fans' }[m]]); return; }
    c.render();
  },
  'ctl-set'(c, el, r) { const x = here(c, r); if (x) setPick(c, x, [el.dataset.t]); },
  'ctl-toggle'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const t = el.dataset.t;
    // start from the lights themselves so a room can be picked apart one light at a time
    const now = c.data.targetDevices(T(c, x.pid, x.n, x.g)).map(id => `d:${id}`);
    const next = now.includes(t) ? now.filter(v => v !== t) : [...now, t];
    if (!next.length) { c.toast('Keep at least one'); return; }
    setPick(c, x, next);
  },
  'ctl-newset'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const ids = c.data.targetDevices(T(c, x.pid, x.n, x.g)).filter(id => (c.data.dev(id) || {}).domain !== 'cover');
    if (!ids.length) { c.toast('Pick some lights first'); return; }
    const taken = new Set(c.data.groups().map(g => g.name));
    let name = 'New set', i = 2; while (taken.has(name)) name = `New set ${i++}`;
    const g = { id: Math.random().toString(36).slice(2, 10), name, device_ids: ids, on_level: null };
    c.S.config.groups = [...c.data.groups(), g];
    setPick(c, x, [`g:${g.id}`]);
    c.save(`${name}: ${plural(ids.length, 'light')}`);
  },
  'scene-pick'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const night = el.dataset.night === '1';
    const a = JSON.parse(el.dataset.a);
    if (!c.REM.setActions(x.pid, x.n, x.g, night, [a])) { c.toast('Pick what it does normally first'); return; }
    c.closePicker();
    c.save(night ? `At night: ${c.REM.shortDescribe([a])}` : said(c, x.pid, x.n, x.g, [a]));
  },
  'cycle-scene'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const k = pressKey(x.pid, x.n, x.g);
    const cur = ((c.ui.cycle || {})[k] || c.REM.cycleIdsOf(x.pid, x.n, x.g, !!c.ui.cycleNight)).slice();
    const i = cur.indexOf(el.dataset.p); if (i >= 0) cur.splice(i, 1); else cur.push(el.dataset.p);
    c.ui.cycle = { ...(c.ui.cycle || {}), [k]: cur }; c.render();
  },
  'cycle-room'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const k = pressKey(x.pid, x.n, x.g);
    let cur = ((c.ui.cycle || {})[k] || c.REM.cycleIdsOf(x.pid, x.n, x.g, !!c.ui.cycleNight)).slice();
    const mp = c.H.roomScenes(el.dataset.a).map(p => p.id);
    cur = mp.every(id => cur.includes(id)) ? cur.filter(id => !mp.includes(id)) : [...cur, ...mp.filter(id => !cur.includes(id))];
    c.ui.cycle = { ...(c.ui.cycle || {}), [k]: cur }; c.render();
  },
  'cycle-clear'(c, el, r) { const x = here(c, r); if (!x) return; c.ui.cycle = { ...(c.ui.cycle || {}), [pressKey(x.pid, x.n, x.g)]: [] }; c.render(); },
  'cycle-save'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const k = pressKey(x.pid, x.n, x.g);
    const night = !!c.ui.cycleNight;
    const ids = (c.ui.cycle || {})[k] || c.REM.cycleIdsOf(x.pid, x.n, x.g, night);
    const done = c.REM.saveCycle(x.pid, x.n, x.g, night, ids);
    if (!done) { c.toast(night ? 'Pick what it does normally first' : 'Pick at least two'); return; }
    c.closePicker();
    c.save(done === 2 ? `The arrows step through ${ids.length} scenes` : `Steps through ${ids.length} scenes`);
  },
  'door-pick'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const night = el.dataset.night === '1';
    if (night) { if (!c.REM.setActions(x.pid, x.n, x.g, true, c.REM.shutdownActions(el.dataset.t, 'on'))) { c.toast('Pick what it does normally first'); return; } }
    else c.REM.saveLeaving(x.pid, x.n, x.g, el.dataset.t);
    c.closePicker();
    c.save(`${c.REM.buttonName(x.pid, x.n)} · ${c.REM.GESTURE_WORD[x.g]} → Leaving`);
  },
  steps(c, el, r) { const x = here(c, r); if (x) c.openPicker('steps', c2 => stepsSheet(c2, x.pid, x.n, x.g, false)); },
  'night-steps'(c, el, r) { const x = here(c, r); if (x) c.openPicker('steps-night', c2 => stepsSheet(c2, x.pid, x.n, x.g, true)); },
  'st-add'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const night = stepsNight(c);
    const list = c.REM.stepsFor(x.pid, x.n, x.g, night); if (!list) return;
    list.push(c.REM.freshAction('level', T(c, x.pid, x.n, x.g)));
    c.save('', { quiet: true });
  },
  'st-remove'(c, el, r) {
    const x = here(c, r); if (!x) return;
    const night = stepsNight(c);
    const list = stepList(c, x, night); if (!list) return;
    list.splice(Number(el.dataset.i), 1);
    // a press, or a night version, with no steps left is none
    if (!list.length) c.REM.setActions(x.pid, x.n, x.g, night, null);
    c.save('Step removed');
  },
  'st-edit'(c, el, r, v) {
    const x = here(c, r); if (!x) return;
    const list = stepList(c, x, stepsNight(c)); if (!list) return;
    const k = el.dataset.k;
    if (k === 'target') { list[Number(el.dataset.i)].target = v.startsWith('[') ? JSON.parse(v) : v; }
    else c.REM.editAction(list, Number(el.dataset.i), k, v);
    c.saveSoon(300);
    if (k === 'type' || k === 'scene_ref') c.render();
  },
  try(c, el, r) { const x = here(c, r); if (x) tryList(c, c.REM.gestureActions(x.pid, x.n, x.g, el.dataset.night === '1')); },
  clear(c, el, r) {
    const x = here(c, r); if (!x) return;
    c.REM.applyRecipe(x.pid, x.n, x.g, false, 'nothing');
    c.save(`${c.REM.buttonName(x.pid, x.n)} · ${c.REM.GESTURE_WORD[x.g]} cleared`);
  },

  // More
  'rm-room'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    c.openPicker('room', c2 => roomPicker(c2, { over: d.name, title: 'Which room is it in?', current: c2.data.devArea(d), act: 'rm-room-to' }));
  },
  async 'rm-room-to'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    let rid = el.dataset.room;
    if (rid === '__new') rid = c.EDIT.createRoom().id;
    const room = c.EDIT.moveDevice(d.device_id, rid);
    c.closePicker();
    await c.save(`${d.name} moved to ${room ? room.name : 'no room'}`);
    if (room) c.EDIT.bridgeMoveDevice(d.device_id, room.id).then(ch => { if (ch) c.save('', { quiet: true }); }).catch(() => { /* the app has it right either way */ });
  },
  'rm-look'(c, el, r) { const d = c.data.dev(r.id); if (d) c.openPicker('look', c2 => lookSheet(c2, c2.data.dev(r.id) || d)); },
  'look-model'(c, el, r) { const d = c.data.dev(r.id); if (!d) return; c.REM.setLook(d.device_id, 'model', el.dataset.m); c.save('', { quiet: true }); },
  'look-finish'(c, el, r) { const d = c.data.dev(r.id); if (!d) return; c.REM.setLook(d.device_id, 'finish', el.dataset.f); c.save('', { quiet: true }); },
  'rm-lutron'(c) { c.ui.lutronOpen = !c.ui.lutronOpen; c.render(); },
  'rm-clear'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    c.openPicker('clear', () => confirmSheet(c, { over: d.name, title: 'Clear every button?', act: 'rm-clear-go', yes: 'Clear them', text: 'Every press, press twice and hold on this remote stops doing anything here. What the Lutron app set up is not touched.' }));
  },
  'rm-clear-go'(c, el, r) { const d = c.data.dev(r.id); if (!d) return; c.REM.clearRemote(d.device_id); c.closePicker(); c.save(`${d.name} cleared`); },
  'rm-remove'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    c.openPicker('remove', () => confirmSheet(c, { over: d.name, title: 'Remove this remote?', act: 'rm-remove-go', yes: 'Remove',
      text: 'It leaves your Lutron bridge and stops working until it is added again. What its buttons did here is forgotten. The Lutron app will not list it any more either.' }));
  },
  async 'rm-remove-go'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const prev = JSON.stringify(c.S.config);
    el.disabled = true; el.textContent = 'Removing';
    try {
      const { stillListed } = await c.EDIT.removeDevice(d.device_id);
      c.closePicker(); c.closeSheet();
      await c.save('', { quiet: true });
      c.go('remotes');
      c.toast(`${d.name} removed from your home`, { undo: async () => { c.data.restoreConfig(prev); c.EDIT.unhideDevice(d.device_id); await c.save('Put back'); } });
      if (!stillListed) setTimeout(() => { if (c.data.dev(d.device_id)) { c.EDIT.hideDevice(d.device_id); c.save('', { quiet: true }); } }, 4000);
    } catch (e) {
      el.disabled = false; el.textContent = 'Remove';
      c.toast(`The bridge said no: ${e.message}`, { err: true });
    }
  },
};

// A press on a real remote while its page is open picks that key; a different remote's press opens that remote.
export function live(c, m, r) {
  if (m.type !== 'gesture') return;
  const d = c.data.dev(m.device_id); if (!d) return;
  c.ui.remoteKey = { ...(c.ui.remoteKey || {}), [d.device_id]: m.button_number };
  if (d.device_id !== r.id && !r.sub) { c.go(`remote/${d.device_id}`); c.toast(`That's ${d.name}`); }
}
