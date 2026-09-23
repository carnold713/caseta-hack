// 12 · the connection sheet (12733:48815): the four links between this phone and the lights, each ticked or not,
// and a row into what the remotes are doing. Opened from the dot beside the greeting, the offline card's "What can I
// do?", and Settings. Its headline says the one thing that matters: nothing, a blip, or what to check.
const ago = ms => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.round(h / 24); return `${d} ${d === 1 ? 'day' : 'days'} ago`;
};
const health = c => ((c.S.agent && c.S.agent.info) || {}).health || null;

// The four links, in order from this phone outwards, each with a word for how it is.
function links(c) {
  const h = health(c);
  const phone = typeof navigator === 'undefined' || navigator.onLine !== false;
  const server = !!c.S.wsOpen;
  const house = !!(c.S.agent && c.S.agent.online);
  const bridge = house && h ? !!h.bridge_ok : null;
  return [
    ['Phone', phone, phone ? 'Online' : 'No internet'],
    ['Server', server, server ? 'Reachable' : phone ? 'Not answering' : 'Waiting for the phone'],
    ['House computer', house, house ? 'Running' : server ? 'Not heard from' : 'Unknown'],
    ['Lutron bridge', bridge, bridge == null ? (house ? 'Checking' : 'Unknown') : bridge ? 'Connected' : 'Not answering'],
  ];
}
export function connSheet(c) {
  const { esc, icon } = c;
  const st = c.conn();
  const L = links(c);
  const h = health(c);
  const firstBad = L.find(x => x[1] === false);
  const title = st === 'ok'
    ? (c.S.troubleSince === 0 && c.ui.hadBlip ? 'Nothing needs you. That blip was the app reconnecting' : 'Nothing needs you. Everything is connected')
    : st === 'reconnecting' ? 'Reconnecting. Nothing needs you yet'
      : firstBad && firstBad[0] === 'Phone' ? 'This phone is offline'
        : firstBad && firstBad[0] === 'Server' ? "Can't reach this app's server"
          : 'Your home is not answering';
  const rows = L.map(([n, ok, word]) => `<div class="row cn-row"><span class="cn-ic ${ok === false ? 'bad' : ok ? 'ok' : ''}">${icon(ok === false ? 'x' : ok ? 'check' : 'dots', 20, 1.7)}</span><span class="row-txt"><span class="t">${n}</span></span><span class="row-val">${esc(word)}</span></div>`).join('');
  const deaf = h && h.buttons_ok === false ? `<div class="note warn">${icon('info', 20, 1.4)}<p>Your Lutron bridge has stopped reporting button presses, so your remotes will not do anything here. The app can still control your lights. Unplugging the bridge for ten seconds and plugging it back in usually clears this.</p></div>` : '';
  const help = st === 'ok' ? '' : `<p class="t-body muted sheet-p">${firstBad && firstBad[0] === 'Phone' ? 'Check this phone’s Wi-Fi or mobile data.' : 'Your remotes and wall controls keep working: they talk to the bridge directly. Check that the computer running the connector is on and awake, on the same Wi-Fi as your Lutron bridge, and that the internet works there. It reconnects on its own within a minute.'}</p>`;
  // buttons, not button settings: a button with a tap, a double press and a hold is still one button set up
  const set = c.data.remotes().flatMap(d => c.REM.buttonNumbers(d).filter(n => c.REM.buttonSet(d.device_id, n))).length;
  const remotesLine = h ? `Bridge offers ${h.buttons || 0} buttons · ${set} set up${h.last_press_at ? ` · last press ${ago(h.last_press_at * 1000)}` : ''}` : `${set} ${set === 1 ? 'button' : 'buttons'} set up`;
  return {
    over: 'Connection', title,
    body: `<div class="conn">${help}<div class="group">${rows}</div>${deaf}
      <div class="group"><button class="row has-ic tall" data-act="conn-remotes"><span class="row-ic">${icon('remote', 20, 1.4)}</span><span class="row-txt"><span class="t">Check the remotes</span><span class="d">${esc(remotesLine)}</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button></div></div>`,
  };
}
// From "Check the remotes": the bridge's count, the app's, what is not set up yet, and the last press.
export function remotesSheet(c) {
  const { esc, icon, data, REM } = c;
  const h = health(c) || {};
  const rs = data.remotes();
  const keys = rs.flatMap(d => REM.buttonNumbers(d).map(n => ({ d, n })));
  const unset = keys.filter(k => !REM.buttonSet(k.d.device_id, k.n));
  const last = h.last_press ? String(h.last_press).split('/') : null;
  const lastDev = last ? data.dev(last[0]) : null;
  const quiet = (h.quiet_remotes || []).map(id => data.dev(id)).filter(Boolean);
  const notes = (h.notes || []).slice().reverse();
  const bad = notes.filter(n => !n.ok);
  return {
    over: 'Connection', title: 'The remotes',
    body: `<div class="conn"><div class="group">
      <div class="row"><span class="row-txt"><span class="t">Buttons the bridge offers</span></span><span class="row-val">${h.buttons != null ? h.buttons : keys.length}</span></div>
      <div class="row"><span class="row-txt"><span class="t">Set up in the app</span></span><span class="row-val">${keys.length - unset.length}</span></div>
      <button class="row" data-go="remotes"><span class="row-txt"><span class="t">Not set up yet</span></span><span class="row-val">${unset.length} ${unset.length === 1 ? 'button' : 'buttons'}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
      <div class="row"><span class="row-txt"><span class="t">Last press</span></span><span class="row-val">${h.last_press_at ? esc(`${c.RT.fmtTime(c.RT.zparts(new Date(h.last_press_at * 1000)).hm)}${lastDev ? ` · ${lastDev.name}` : ''}`) : 'None yet'}</span></div>
    </div>
    ${quiet.length ? `<p class="t-cap muted sheet-p">Not heard from lately: ${esc(quiet.map(d => d.name).join(', '))}. A remote with a flat battery goes quiet like this.</p>` : ''}
    ${notes.length || h.lib ? `<div class="t-over sec-s">What your bridge last said</div><p class="t-cap muted sheet-p">${esc(!notes.length ? 'Nothing to report.' : bad.length ? `${bad.length} ${bad.length === 1 ? 'thing' : 'things'} to look at.` : 'Nothing here needs you. These are answers to things the app asked for.')}${h.lib ? ` Lutron library ${esc(h.lib)}.` : ''}</p>
      <div class="notes">${notes.slice(0, 20).map(n => `<p class="${n.ok ? '' : 'bad'}">${esc(ago(n.at * 1000))}: ${esc(n.text)}</p>`).join('')}</div>` : ''}
    </div>`,
  };
}
// 18 · Offline, calmly (v7, 12815:50887). Ten seconds into a drop Home says, in one sentence, which link is out and
// what, if anything, to do, and that the remotes still work. Never an alarm: no red, and the card opens the same
// connection sheet as the dot.
const WIFI_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M13.8 10.1A10 10 0 0 1 19 12.9"/><path d="M2 9.3a15 15 0 0 1 4.3-2.6"/><path d="M10.7 5.6A15 15 0 0 1 22 9.3"/><circle cx="12" cy="20" r=".6" fill="currentColor"/></svg>';
// The first link that is out, from this phone outwards, as the card's two lines.
export function offlineCause(c) {
  const bad = links(c).find(x => x[1] === false);
  const which = bad ? bad[0] : 'House computer';
  if (which === 'Phone') return ['This phone is offline.', 'Your remotes still work.'];
  if (which === 'Server') return ["Can't reach the app's server.", 'Your remotes still work.'];
  if (which === 'Lutron bridge') return ["The Lutron bridge isn't answering.", 'Check it has power.'];
  return ["The house computer isn't answering.", 'It may be restarting. Your remotes still work.'];
}
export function offlineCard(c) {
  const [head, sub] = offlineCause(c);
  return `<button class="offline-card v7" data-act="conn-open" data-enter="drop" aria-label="Connection">
    <span class="oc-ic">${WIFI_OFF}</span><span class="oc-txt"><span class="t">${c.esc(head)}</span><span class="d">${c.esc(sub)}</span></span>
    <span class="oc-chev">${c.icon('chev', 20, 1.8)}</span></button>`;
}
// What a tap says while the house cannot be reached. Nothing is queued: a light changing by itself half an hour after
// the tap would be worse than the tap failing.
export const OFFLINE_TAP = "Can't reach the house right now. Your remotes still work.";

export const connActions = {
  'conn-open'(c) { c.openSheet({ ...connSheet(c), key: 'conn', onClose: () => c.render() }); },
  'conn-remotes'(c) {
    // over a routed sheet (Settings) it opens inside it with a back arrow; over the plain one it takes its place
    if (c.ui.routed) c.openPicker('remotes', remotesSheet);
    else c.openSheet({ ...remotesSheet(c), key: 'conn-remotes', onClose: () => c.render() });
  },
};
