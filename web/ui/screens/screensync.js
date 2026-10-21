// The room's Hue colour lights following the PC's screen (agent/screensync.py; the PC runs pc/screensync.py). One
// row on the room's page, shown once the PC program has been seen, and only in a room with a Hue colour light. One
// room follows at a time: switching it on here moves it from wherever it was.
//
//   on       this room follows (config.settings.screen_sync.room), and is not paused
//   off      it does not; a light changed by hand while following pauses it, which reads as off here too, and
//            switching it on again resumes it
// The line under it says what is happening when that is not plain from the lights: waiting for the PC, or what is
// in the way. The Hue bridge's button is the one fix a person can make from here, so that is a row of its own.

const sync = c => ((c.S.agent && c.S.agent.info) || {}).screen_sync || null;
const settingRoom = c => (((c.S.config || {}).settings || {}).screen_sync || {}).room || null;

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
  if (!c.H.roomLights(aid).some(d => String(d.device_id).startsWith('hue_') && d.color)) return '';
  const { esc, icon } = c;
  const state = mine && s && s.room === aid ? s.state : (mine ? 'waiting' : 'off');
  const on = mine && state !== 'paused';
  const needsKey = mine && s && !s.stream_key;
  const why = String((s && s.why) || '');
  const line = state === 'problem' ? why.charAt(0).toUpperCase() + why.slice(1) : (on || state === 'paused' ? LINES[state] || '' : '');
  const busy = c.ui.syncPairing;
  return `<div class="group sync-rows">
    <div class="row has-ic"><span class="row-ic">${icon('screen', 20, 1.7)}</span>
      <span class="row-txt"><span class="t">PC screen</span>${line && !needsKey ? `<span class="d">${esc(line)}</span>` : ''}</span>
      <button class="toggle" role="switch" aria-checked="${on}" data-act="sync-toggle" data-id="${esc(aid)}" aria-label="Follow the PC screen"></button></div>
    ${needsKey ? `<button class="row has-ic" data-act="sync-pair" ${busy ? 'aria-busy="true"' : ''}><span class="row-ic">${icon('bolt', 20, 1.7)}</span>
      <span class="row-txt"><span class="t">${busy ? 'Press the button on the Hue bridge' : 'Connect to the Hue bridge again'}</span></span></button>` : ''}
  </div>`;
}

export const syncActions = {
  async 'sync-toggle'(c, el) {
    const aid = el.dataset.id;
    const s = sync(c);
    const settings = c.S.config.settings;
    const mine = (settings.screen_sync || {}).room === aid;
    if (mine && !(s && s.state === 'paused')) {
      settings.screen_sync = { room: null };
      await c.save('', { quiet: true });
      return;
    }
    if (!mine) { settings.screen_sync = { room: aid }; await c.save('', { quiet: true }); }
    try { await c.data.api('/api/screensync', { method: 'POST', body: JSON.stringify({ op: 'resume' }) }); }
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
