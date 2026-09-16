/* Philips Hue: connect a Hue bridge from Settings. The connector finds the bridge on the home
   network, the person presses the round button on it, the bridge hands out a key, and its lights,
   rooms and scenes join the app (they arrive as ordinary inventory, namespaced hue_). */
'use strict';

const HU = { open: false, step: 'find', bridges: [], host: '', busy: false, error: null, manual: false };
const hueInfo = () => ((S.agent && S.agent.info) || {}).hue || null;

function openHue() {
  const info = hueInfo();
  Object.assign(HU, { open: true, step: info && info.paired ? 'connected' : 'find', bridges: [], host: '', busy: false, error: null, manual: false });
  huShow(true);
  if (HU.step === 'find') huDiscover();
}
function huShow(full) {
  const titles = { find: 'Connect a Hue bridge', press: 'Press the button', connected: 'Hue bridge' };
  const subs = { find: 'Its lights and rooms join this app, and a remote button can control them.', press: 'The bridge hands out a key only while its button was just pressed.', connected: '' };
  const body = HU.step === 'connected' ? huConnectedHTML() : HU.step === 'press' ? huPressHTML() : huFindHTML();
  if (full || !sheet.isOpen() || !HU.open) { sheet.open(titles[HU.step], body, { sub: subs[HU.step], back: HU.step === 'press', onBack: () => { HU.step = 'find'; HU.error = null; huShow(true); } }); HU.open = true; sheet.onClose = () => { HU.open = false; }; }
  else sheet.update(body);
}
function huFindHTML() {
  const list = HU.bridges.map(b => `<button class="item" data-act="hue-pick" data-host="${esc(b.host)}">${ICON('link')}<div class="grow"><div class="t">${esc(b.name || 'Hue bridge')}</div><div class="d">${esc(b.host)}${b.id ? ' · ' + esc(b.id) : ''}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('');
  const searching = HU.busy ? `<div class="tip"><div class="grow"><span class="cap">Looking</span><div class="t">Looking for your Hue bridge...</div><div class="d">It has to be on the same network as the connector.</div></div><div class="dots ad-dots"><i></i><i></i><i></i><i></i></div></div>` : '';
  const none = !HU.busy && !HU.bridges.length && !HU.error ? `<div class="tip"><div class="grow"><span class="cap">Nothing found</span><div class="t">No Hue bridge answered</div><div class="d">Is it plugged in, with its lights on, on the same network as the connector? You can also type its address.</div></div><button class="btn sm" data-act="hue-discover">Look again</button></div>` : '';
  const err = HU.error ? `<div class="tip"><div class="grow"><span class="cap">Something went wrong</span><div class="t">${esc(HU.error)}</div></div><button class="btn sm" data-act="hue-discover">Try again</button></div>` : '';
  // the manual address is a second path: a ghost link reveals it (2.20)
  const manual = HU.manual ? `<label class="field" style="margin-top:20px"><span>The bridge's address</span><input class="input" id="hue-host" inputmode="decimal" placeholder="192.168.1.20" value="${esc(HU.host)}" autocomplete="off"></label>
    <button class="btn block" data-act="hue-manual">Use this address</button>
    <p class="small faint" style="margin:16px 0 0">The Hue app shows the address under Settings, Bridges, then the bridge.</p>` : `<button class="btn ghost" data-act="hue-manual-show" style="margin-top:16px">Type its address instead</button>`;
  return `${searching}${err}${list ? `<div class="h2">Found</div><div class="card pad0 list">${list}</div>` : ''}${none}${manual}`;
}
function huPressHTML() {
  return `<div class="tip"><div class="grow"><span class="cap">${esc(HU.host)}</span><div class="t">Press the round button on top of the Hue bridge, then tap Connect</div><div class="d">You have about half a minute after pressing it.</div></div>${HU.busy ? '<div class="dots ad-dots"><i></i><i></i><i></i><i></i></div>' : ''}</div>
    ${HU.error ? `<div class="tip" style="margin-top:8px"><div class="grow"><span class="cap">Not yet</span><div class="t">${esc(HU.error)}</div><div class="d">Press the button again and tap Connect right after.</div></div></div>` : ''}
    <div class="sfoot"><button class="btn primary lg block" data-act="hue-pair" ${HU.busy ? 'disabled' : ''}>${HU.busy ? 'Waiting for the button...' : 'Connect'}</button></div>`;
}
function huConnectedHTML() {
  const i = hueInfo() || {};
  const rooms = Object.values(S.inv.areas || {}).filter(a => String(a.id).startsWith('hue_')).map(a => a.name);
  return `<div class="tip"><div class="grow"><span class="cap">Connected · ${esc(i.host || '')}</span><div class="t">${plural(i.lights || 0, 'light')} in ${plural(i.rooms || 0, 'room')}</div><div class="d">${i.live ? 'Live: changes made in the Hue app show up here right away.' : 'Reconnecting to its event stream...'}${i.error ? ` ${esc(i.error)}` : ''}</div></div><div class="ic lg">${ICON('link')}</div></div>
    ${rooms.length ? `<div class="h2">Rooms</div><div class="chips">${rooms.map(r => `<span class="chip">${esc(r)}</span>`).join('')}</div>` : ''}
    <p class="small faint" style="margin:16px 0 0">Hue's own scenes stay in the Hue app; make scenes here and they can mix Hue and Caseta lights. Colour and white temperature come in a later pass; on, off and brightness work now.</p>
    <div class="card pad0 list" style="margin-top:20px"><button class="item" data-act="hue-forget"><div class="grow"><div class="t">Forget this bridge</div><div class="d">Its lights leave the app. The Hue app is not affected.</div></div><span class="chev">${ICON('x', 'sm')}</span></button></div>`;
}
async function huDiscover() {
  HU.busy = true; HU.error = null; HU.bridges = []; huShow();
  try { const r = await api('/api/hue', { method: 'POST', body: JSON.stringify({ op: 'discover' }) }); HU.bridges = (r.detail && r.detail.bridges) || []; }
  catch (e) { HU.error = e.message; }
  HU.busy = false; if (HU.open) huShow();
}
async function huPair() {
  if (HU.busy) return;
  HU.busy = true; HU.error = null; huShow();
  try {
    await api('/api/hue', { method: 'POST', body: JSON.stringify({ op: 'pair', host: HU.host }) });
    HU.busy = false; HU.step = 'connected'; huShow(true); toast('Hue bridge connected');
  } catch (e) { HU.busy = false; HU.error = e.message; huShow(); }
}
window.Hue = { onAgent() { if (HU.open && HU.step === 'connected') huShow(); } };
document.addEventListener('input', e => { if (e.target.id === 'hue-host') HU.host = e.target.value; });  // survives a re-render while the search finishes
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'hue-open': openHue(); break;
    case 'hue-discover': huDiscover(); break;
    case 'hue-manual-show': HU.manual = true; huShow(); { const i = document.getElementById('hue-host'); if (i) i.focus(); } break;
    case 'hue-pick': HU.host = d.host; HU.error = null; HU.step = 'press'; huShow(true); break;
    case 'hue-manual': { const v = (document.getElementById('hue-host') || {}).value || ''; if (!v.trim()) { toast('Type the address first', { err: true }); break; } HU.host = v.trim(); HU.error = null; HU.step = 'press'; huShow(true); break; }
    case 'hue-pair': huPair(); break;
    case 'hue-forget': { el.disabled = true; try { await api('/api/hue', { method: 'POST', body: JSON.stringify({ op: 'forget' }) }); sheet.close(); toast('Hue bridge forgotten'); } catch (err) { el.disabled = false; toast(err.message, { err: true }); } break; }
  }
});
