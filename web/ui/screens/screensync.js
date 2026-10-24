// The room's Hue colour lights and Nanoleaf panels following the PC's screen (agent/screensync.py; the PC runs
// pc/windows, pc/mac). One row on the room's page, shown once the PC program has been seen, and only in a room with
// a light that can follow. One room follows at a time: switching it on here moves it from wherever it was. In the
// room that follows, a second row opens the positions page (screenedit.js).
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
    ${mine ? `<button class="row has-ic" data-go="screen/${esc(aid)}"><span class="row-ic">${icon('grid', 20, 1.7)}</span>
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
