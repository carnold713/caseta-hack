/* Nanoleaf: connect one or more Nanoleaf controllers from Settings. Unlike Hue there is no bridge, so this
   is a list, not a single toggle card: each controller pairs on its own (hold its power button, then tap
   Connect), joins the app as its own light (namespaced nanoleaf_<serial>), and can be forgotten on its own
   without touching any other one. */
'use strict';

const NL = { open: false, step: 'find', devices: [], host: '', busy: false, error: null, manual: false };
const nanoleafInfo = () => ((S.agent && S.agent.info) || {}).nanoleaf || null;
const nanoleafList = () => (nanoleafInfo() || {}).devices || [];

function openNanoleaf() {
  Object.assign(NL, { open: true, step: 'find', devices: [], host: '', busy: false, error: null, manual: false });
  nlShow(true);
  nlDiscover();
}
function nlShow(full) {
  const titles = { find: 'Connect a Nanoleaf', press: 'Hold the power button' };
  const subs = { find: 'Its panels join this app, and a remote button can control them.', press: 'The controller hands out a key only while its panels were just made to flash.' };
  const body = NL.step === 'press' ? nlPressHTML() : nlFindHTML();
  if (full || !sheet.isOpen() || !NL.open) { sheet.open(titles[NL.step], body, { detent: 'medium', sub: subs[NL.step], back: NL.step === 'press', onBack: () => { NL.step = 'find'; NL.error = null; nlShow(true); } }); NL.open = true; sheet.onClose = () => { NL.open = false; }; }
  else sheet.update(body);
}
function nlFindHTML() {
  const list = NL.devices.map(d => `<button class="item" data-act="nl-pick" data-host="${esc(d.host)}">${ICON('link')}<div class="grow"><div class="t">${esc(d.name || 'Nanoleaf')}</div><div class="d">${esc(d.host)}</div></div><span class="chev">${ICON('chev', 'sm')}</span></button>`).join('');
  const searching = NL.busy ? `<div class="tip"><div class="grow"><span class="cap">Looking</span><div class="t">Looking for your Nanoleaf...</div><div class="d">It has to be on the same network as the connector.</div></div><div class="dots ad-dots"><i></i><i></i><i></i><i></i></div></div>` : '';
  const none = !NL.busy && !NL.devices.length && !NL.error ? `<div class="tip"><div class="grow"><span class="cap">Nothing found</span><div class="t">No Nanoleaf answered</div><div class="d">Is it on, on the same network as the connector? You can also type its address.</div></div><button class="btn sm" data-act="nl-discover">Look again</button></div>` : '';
  const err = NL.error ? `<div class="tip"><div class="grow"><span class="cap">Something went wrong</span><div class="t">${esc(NL.error)}</div></div><button class="btn sm" data-act="nl-discover">Try again</button></div>` : '';
  const manual = NL.manual ? `<label class="field" style="margin-top:20px"><span>Its address</span><input class="input" id="nl-host" inputmode="decimal" placeholder="192.168.1.44" value="${esc(NL.host)}" autocomplete="off"></label>
    <button class="btn block" data-act="nl-manual">Use this address</button>
    <p class="small faint" style="margin:16px 0 0">Most routers list it by name in their device list, as "Nanoleaf" or similar.</p>` : `<button class="btn ghost" data-act="nl-manual-show" style="margin-top:16px">Type its address instead</button>`;
  return `${searching}${err}${list ? `<div class="h2">Found</div><div class="card pad0 list">${list}</div>` : ''}${none}${manual}`;
}
function nlPressHTML() {
  return `<div class="tip"><div class="grow"><span class="cap">${esc(NL.host)}</span><div class="t">Hold the power button on the controller for 5-7 seconds, until its panels flash, then tap Connect</div><div class="d">You have about half a minute after they flash.</div></div>${NL.busy ? '<div class="dots ad-dots"><i></i><i></i><i></i><i></i></div>' : ''}</div>
    ${NL.error ? `<div class="tip" style="margin-top:8px"><div class="grow"><span class="cap">Not yet</span><div class="t">${esc(NL.error)}</div><div class="d">Hold the button again and tap Connect right after.</div></div></div>` : ''}
    <div class="sfoot"><button class="btn primary lg block" data-act="nl-pair" ${NL.busy ? 'disabled' : ''}>${NL.busy ? 'Waiting for the panels...' : 'Connect'}</button></div>`;
}
async function nlDiscover() {
  NL.busy = true; NL.error = null; NL.devices = []; nlShow();
  try { const r = await api('/api/nanoleaf', { method: 'POST', body: JSON.stringify({ op: 'discover' }) }); NL.devices = (r.detail && r.detail.devices) || []; }
  catch (e) { NL.error = e.message; }
  NL.busy = false; if (NL.open) nlShow();
}
async function nlPair() {
  if (NL.busy) return;
  NL.busy = true; NL.error = null; nlShow();
  try {
    await api('/api/nanoleaf', { method: 'POST', body: JSON.stringify({ op: 'pair', host: NL.host }) });
    NL.busy = false; sheet.close(); toast('Nanoleaf connected');
  } catch (e) { NL.busy = false; NL.error = e.message; nlShow(); }
}
// Tapping a paired controller in Settings: its name, model and a Forget of its own. Forgetting is
// reversible in spirit only (the panels would need pairing again), so it asks nothing further, the same
// as Hue's forget: the person just came from the list, and undo would only re-open the same held-button dance.
function nlDeviceSheet(serial) {
  const d = nanoleafList().find(x => x.serial === serial); if (!d) return;
  const body = `<div class="tip"><div class="grow"><span class="cap">${esc(d.host)}</span><div class="t">${esc(d.model || 'Nanoleaf')}</div><div class="d">${d.error ? `Not reachable right now: ${esc(d.error)}` : 'Connected'}</div></div><div class="ic lg">${ICON('link')}</div></div>
    <div class="card pad0 list" style="margin-top:20px"><button class="item" data-act="nl-forget" data-serial="${esc(serial)}"><div class="grow"><div class="t">Forget this Nanoleaf</div><div class="d">It leaves the app. Pair it again with the button on the controller.</div></div><span class="chev">${ICON('chev', 'sm')}</span></button></div>`;
  sheet.open(esc(d.name || 'Nanoleaf'), body, { detent: 'compact', sub: 'Its panels' });
}
async function nlForget(serial, el) {
  if (el) el.disabled = true;
  try { await api('/api/nanoleaf', { method: 'POST', body: JSON.stringify({ op: 'forget', serial }) }); sheet.close(); toast('Nanoleaf forgotten'); }
  catch (e) { if (el) el.disabled = false; toast(e.message, { err: true }); }
}
// While pairing sheet is open, a fresh agent info does not change what it shows (it is watching its own
// pair() promise, not the wire); this only matters if a device sheet for one already paired is open and its
// reachability changes underneath it, so it can just be re-shown from the live list.
window.Nanoleaf = { onAgent() { /* no persistent sheet needs a wire-driven refresh (see comment above) */ } };
document.addEventListener('input', e => { if (e.target.id === 'nl-host') NL.host = e.target.value; });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'nl-open': openNanoleaf(); break;
    case 'nl-device': nlDeviceSheet(d.serial); break;
    case 'nl-discover': nlDiscover(); break;
    case 'nl-manual-show': NL.manual = true; nlShow(); { const i = document.getElementById('nl-host'); if (i) i.focus(); } break;
    case 'nl-pick': NL.host = d.host; NL.error = null; NL.step = 'press'; nlShow(true); break;
    case 'nl-manual': { const v = (document.getElementById('nl-host') || {}).value || ''; if (!v.trim()) { toast('Type the address first', { err: true }); break; } NL.host = v.trim(); NL.error = null; NL.step = 'press'; nlShow(true); break; }
    case 'nl-pair': nlPair(); break;
    case 'nl-forget': nlForget(d.serial, el); break;
  }
});
