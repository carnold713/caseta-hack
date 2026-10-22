// The room's Hue colour lights and Nanoleaf panels following the PC's screen (agent/screensync.py; the PC runs
// pc/screensync.py). One row on the room's page, shown once the PC program has been seen, and only in a room with
// a light that can follow. One room follows at a time: switching it on here moves it from wherever it was. In the
// room that follows, a second row opens the positions page (screenSheet, below).
//
//   on       this room follows (config.settings.screen_sync.room), switched on (the connector keeps on and off,
//            so a remote's "PC screen on or off" and this switch are the same switch), and not paused
//   off      switched off here or from a remote; or paused by a hand on one of its lights, which reads as off too.
//            Switching it on again resumes it. Off keeps the room, so a remote can switch it back on
// The line under it says what is happening when that is not plain from the lights: waiting for the PC, or what is
// in the way. The Hue bridge's button is the one fix a person can make from here, so that is a row of its own.

const sync = c => ((c.S.agent && c.S.agent.info) || {}).screen_sync || null;
const settingRoom = c => (((c.S.config || {}).settings || {}).screen_sync || {}).room || null;

// A light that can follow the screen: a Hue colour light, or a Nanoleaf
const canFollow = d => (String(d.device_id).startsWith('hue_') && !!d.color) || String(d.device_id).startsWith('nanoleaf_');

const LINES = {
  syncing: 'Following',
  starting: 'Starting',
  waiting: 'Waiting for the PC',
  paused: 'Paused',
};

export function syncRow(c, aid) {
  const s = sync(c);
  const mine = settingRoom(c) === aid;
  if (!mine && !(s && s.pc)) return '';
  if (!c.H.roomLights(aid).some(canFollow)) return '';
  const { esc, icon } = c;
  const state = mine && s && s.room === aid ? s.state : (mine ? 'waiting' : 'off');
  const on = mine && (s && s.room === aid && 'on' in s ? !!s.on : state !== 'paused' && state !== 'off');
  const needsKey = mine && s && !s.stream_key;
  const why = String((s && s.why) || '');
  // a computer that keeps looking for the Pi and never hears it back: the one thing to do is type the Pi's address in
  const pc = (s && s.pc) || {};
  const deaf = mine && pc.hears === false && pc.pi_address && state !== 'syncing';
  const who = pc.name || (pc.os === 'mac' ? 'The Mac' : 'The computer');
  const line = deaf ? `${who} can't hear the Pi. In its settings, set the Pi's address to ${pc.pi_address}`
    : state === 'problem' ? why.charAt(0).toUpperCase() + why.slice(1) : (on || state === 'paused' ? LINES[state] || '' : '');
  const busy = c.ui.syncPairing;
  return `<div class="group sync-rows">
    <div class="row has-ic"><span class="row-ic">${icon('screen', 20, 1.7)}</span>
      <span class="row-txt"><span class="t">PC screen</span>${line && !needsKey ? `<span class="d">${esc(line)}</span>` : ''}</span>
      <button class="toggle" role="switch" aria-checked="${on}" data-act="sync-toggle" data-id="${esc(aid)}" aria-label="Follow the PC screen"></button></div>
    ${mine ? `<button class="row has-ic" data-go="room/${esc(aid)}/screen"><span class="row-ic">${icon('grid', 20, 1.7)}</span>
      <span class="row-txt"><span class="t">Light positions</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : ''}
    ${needsKey ? `<button class="row has-ic" data-act="sync-pair" ${busy ? 'aria-busy="true"' : ''}><span class="row-ic">${icon('bolt', 20, 1.7)}</span>
      <span class="row-txt"><span class="t">${busy ? 'Press the button on the Hue bridge' : 'Connect to the Hue bridge again'}</span></span></button>` : ''}
  </div>`;
}

export const syncActions = {
  async 'sync-toggle'(c, el) {
    const aid = el.dataset.id;
    const settings = c.S.config.settings;
    const mine = (settings.screen_sync || {}).room === aid;
    const on = el.getAttribute('aria-checked') === 'true';
    // another room following moves here; this one keeps its room either way, on or off
    if (!mine) { settings.screen_sync = { room: aid }; await c.save('', { quiet: true }); }
    el.setAttribute('aria-checked', String(!on));
    try { await c.data.api('/api/screensync', { method: 'POST', body: JSON.stringify({ op: mine && on ? 'off' : 'on' }) }); }
    catch (e) { c.toast(e.message, { err: true }); }
    c.render();
  },
  // A pairing from before the PC screen did not keep the bridge's streaming key: the same button press again gives it
  async 'sync-pair'(c) {
    if (c.ui.syncPairing) return;
    const host = (((c.S.agent && c.S.agent.info) || {}).hue || {}).host;
    if (!host) { c.go('settings'); return; }
    c.ui.syncPairing = true; c.render();
    try { await c.data.api('/api/hue', { method: 'POST', body: JSON.stringify({ op: 'pair', host }) }); }
    catch (e) { c.toast(e.message, { err: true }); }
    c.ui.syncPairing = false; c.render();
  },
};

// ---------- the positions page (#room/<id>/screen) ----------
// The screen drawn in the middle of a wall, and every light that can follow as a dot where it stands: drag one to
// where it really is, and it takes its colour from that part of the screen (outside the screen, from the nearest
// edge). The connector moves it as soon as the change is saved, so with the PC screen on the light changes under the
// finger's last position. Below, each light can be left out. Positions are settings.screen_sync.lights, in screen
// units: -1 to 1 is the screen's own width and height, and the page shows SPAN either way.
// A gradient light (a Play gradient tube or lightstrip: several colours along one light) is drawn as a bar as long as
// the part of the screen its sections take ("span", the screen's width to begin with); the handle at its right end
// stretches it, and Flip turns it round when its colours come out the wrong way.
const SPAN = 2.5;
const pct = v => (((v + SPAN) / (2 * SPAN)) * 100).toFixed(2);
// a gradient light's bar, kept inside the page so its handle can always be reached: left and width, as styles
const barBox = (x, span) => {
  const l = Math.max(-SPAN, x - span / 2), r = Math.min(SPAN, x + span / 2);
  return `left:${pct(l)}%;width:${((Math.max(0.05, r - l)) / (2 * SPAN)) * 100}%`;
};
const NANO_GLYPH = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/></svg>';
function lightsHere(c, aid) {
  const s = sync(c);
  const mine = (((c.S.config.settings || {}).screen_sync || {}).lights) || {};
  const placed = s && s.room === aid ? (s.placed || []) : [];
  // what the page shows is the setting when there is one (a drag shows at once), the connector's default otherwise
  return placed.map(p => {
    const m = mine[p.id] || {};
    return { ...p, x: typeof m.x === 'number' ? m.x : p.x, y: typeof m.y === 'number' ? m.y : p.y, on: m.on !== false,
      span: typeof m.span === 'number' ? m.span : p.span, flip: 'flip' in m ? m.flip === true : p.flip };
  });
}
export function screenSheet(c, r) {
  const { esc, icon } = c;
  const aid = r.id;
  const list = lightsHere(c, aid);
  const name = d => (c.data.dev(d.id) || {}).name || d.name;
  const dots = list.map(d => `<button class="ss-dot ${d.on ? '' : 'out'} ${d.kind}" data-ssid="${esc(d.id)}" data-x0="${d.x}" style="left:${pct(d.x)}%;top:${pct(d.y)}%" aria-label="${esc(name(d))}">
      <span class="ss-disc">${d.kind === 'nanoleaf' ? NANO_GLYPH : icon('bulb', 20, 1.7)}</span><span class="ss-name">${esc(name(d))}</span></button>`).join('');
  const bars = list.filter(d => d.segments > 1).map(d => `<div class="ss-span ${d.on ? '' : 'out'}" data-span="${esc(d.id)}" data-w="${d.span}" style="${barBox(d.x, d.span)};top:${pct(d.y)}%">
      <i class="ss-end ${d.flip ? 'flip' : ''}"></i><b class="ss-len" data-sslen="${esc(d.id)}" aria-label="Length of ${esc(name(d))}"></b></div>`).join('');
  const rows = list.map(d => `<div class="row"><span class="row-txt"><span class="t">${esc(name(d))}</span><span class="d">${d.kind === 'nanoleaf' ? 'Nanoleaf' : d.segments > 1 ? `Hue · ${d.segments} sections` : 'Hue'}</span></span>
      ${d.segments > 1 ? `<button class="chip sm ${d.flip ? 'lead' : ''}" aria-pressed="${!!d.flip}" data-act="ss-flip" data-id="${esc(d.id)}">Flip</button>` : ''}
      <button class="toggle" role="switch" aria-checked="${d.on}" data-act="ss-light" data-id="${esc(d.id)}" aria-label="${esc(name(d))} follows the screen"></button></div>`).join('');
  const body = list.length
    ? `<div class="ss">
        <div class="ss-stage" data-drag data-aid="${esc(aid)}">
          <div class="ss-screen" style="left:${pct(-1)}%;top:${pct(-1)}%;width:${(2 / (2 * SPAN)) * 100}%;height:${(2 / (2 * SPAN)) * 100}%"><span>Screen</span></div>
          ${bars}${dots}
        </div>
        <div class="group ss-rows">${rows}</div>
        ${Object.keys((((c.S.config.settings || {}).screen_sync || {}).lights) || {}).length ? '<div class="sheet-btns"><button class="pill ghost" data-act="ss-reset">Start over</button></div>' : ''}
      </div>`
    : `<p class="t-cap muted sheet-p">${sync(c) && sync(c).room === aid ? 'Nothing in this room can follow the screen.' : 'Waiting for the connector.'}</p>`;
  return { over: c.data.areaName(aid), title: 'Light positions', body, after: (c2, r2, root) => wireStage(c2, root) };
}
function wireStage(c, root) {
  const stage = root && root.querySelector('.ss-stage');
  if (!stage) return;
  const aid = stage.dataset.aid;
  const save = async (id, patch) => {
    const ss = c.S.config.settings.screen_sync || (c.S.config.settings.screen_sync = { room: aid, lights: {} });
    const lights = ss.lights || (ss.lights = {});
    lights[id] = { ...(lights[id] || {}), ...patch };
    c.endDrag();
    await c.save('', { quiet: true });
  };
  const at = e => {
    const b = stage.getBoundingClientRect();
    return { x: Math.max(-SPAN, Math.min(SPAN, ((e.clientX - b.left) / b.width) * 2 * SPAN - SPAN)),
      y: Math.max(-SPAN, Math.min(SPAN, ((e.clientY - b.top) / b.height) * 2 * SPAN - SPAN)) };
  };
  // a gradient light's length: its handle, pulled away from or towards the light's middle
  for (const h of stage.querySelectorAll('.ss-len')) {
    const id = h.dataset.sslen;
    const bar = stage.querySelector(`.ss-span[data-span="${CSS.escape(id)}"]`);
    const dot = stage.querySelector(`.ss-dot[data-ssid="${CSS.escape(id)}"]`);
    let span = null;
    h.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId); c.ui.dragging = true; span = null; });
    h.addEventListener('pointermove', e => {
      if (!h.hasPointerCapture(e.pointerId)) return;
      const cx = Number(dot.dataset.x || dot.dataset.x0);
      span = Math.max(0.4, Math.min(5, 2 * Math.abs(at(e).x - cx)));
      bar.setAttribute('style', `${barBox(cx, span)};top:${bar.style.top}`);
    });
    const done = () => { if (span == null) { c.endDrag(); return; } const v = Math.round(span * 1000) / 1000; span = null; save(id, { span: v }); };
    h.addEventListener('pointerup', done);
    h.addEventListener('pointercancel', done);
  }
  for (const dot of stage.querySelectorAll('.ss-dot')) {
    let moved = false;
    const bar = stage.querySelector(`.ss-span[data-span="${CSS.escape(dot.dataset.ssid)}"]`);
    dot.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      dot.setPointerCapture(e.pointerId);
      c.ui.dragging = true; moved = false;
      dot.classList.add('held');
    });
    dot.addEventListener('pointermove', e => {
      if (!dot.hasPointerCapture(e.pointerId)) return;
      const { x, y } = at(e);
      dot.style.left = `${pct(x)}%`; dot.style.top = `${pct(y)}%`;
      if (bar) bar.setAttribute('style', `${barBox(x, Number(bar.dataset.w))};top:${pct(y)}%`);
      dot.dataset.x = x.toFixed(3); dot.dataset.y = y.toFixed(3);
      moved = true;
    });
    const done = async e => {
      if (!moved) { dot.classList.remove('held'); c.endDrag(); return; }
      dot.classList.remove('held');
      moved = false;
      await save(dot.dataset.ssid, { x: Number(dot.dataset.x), y: Number(dot.dataset.y) });
    };
    dot.addEventListener('pointerup', done);
    dot.addEventListener('pointercancel', done);
  }
}
export const screenActions = {
  async 'ss-light'(c, el) {
    const ss = c.S.config.settings.screen_sync || (c.S.config.settings.screen_sync = { room: null, lights: {} });
    const lights = ss.lights || (ss.lights = {});
    const id = el.dataset.id;
    const one = { ...(lights[id] || {}) };
    if (one.on === false) delete one.on; else one.on = false;
    if (Object.keys(one).length) lights[id] = one; else delete lights[id];
    await c.save('', { quiet: true });
  },
  async 'ss-flip'(c, el) {
    const ss = c.S.config.settings.screen_sync || (c.S.config.settings.screen_sync = { room: null, lights: {} });
    const lights = ss.lights || (ss.lights = {});
    const id = el.dataset.id;
    const now = el.getAttribute('aria-pressed') === 'true';
    lights[id] = { ...(lights[id] || {}), flip: !now };
    if (now) delete lights[id].flip;
    await c.save('', { quiet: true });
  },
  async 'ss-reset'(c) {
    const ss = c.S.config.settings.screen_sync || {};
    ss.lights = {};
    await c.save('', { quiet: true });
  },
};
