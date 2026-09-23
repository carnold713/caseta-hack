// 19 · About this light (12744:111930): a sheet over the light's page. What it is for, what it is, which room it is
// in, hiding it, removing it. For a fan or a shade only the last three.
import { roomPicker, confirmSheet, undoMove } from '/ui/screens/pickers.js';

// What each role does in the five suggested scenes, as the file says it.
const ROLES = [
  ['ambient', 'Main light', 'Bright and Relax use this'],
  ['task', 'Task light', 'Dropped for Relax'],
  ['accent', 'Lamp for atmosphere', 'Kept on for Relax and Movie'],
  ['decor', 'Decorative', 'Low in every scene'],
];
// The places, in the file's words.
const PLACE_WORD = { ceiling: 'Ceiling', wall: 'Wall', window: 'Window', desk: 'Desk', table: 'Table', floor: 'Floor', cabinet: 'Under cabinet', shelf: 'Shelf / cove', bed: 'Bed', outside: 'Outside' };
const noun = d => (d.domain === 'fan' ? 'fan' : d.domain === 'cover' ? 'shade' : 'light');

export function about(c, r) {
  const d = c.data.dev(r.id); if (!d) return null;
  const { esc, icon } = c;
  const id = d.device_id;
  const isLight = d.domain === 'light' || d.domain === 'switch';
  const K = window.KIND_DEF;
  let body = '';
  if (isLight) {
    const role = c.H.lightRole(id);
    body += `<div class="t-over sec-s">What it’s for</div><div class="choices">${ROLES.map(([k, t, s]) => `
      <button class="choice ${role === k ? 'sel' : ''}" data-act="about-role" data-role="${k}" aria-pressed="${role === k}">
        <span class="t">${t}</span><span class="d">${s}</span>${role === k ? `<span class="tick">${icon('check', 16, 2)}</span>` : ''}</button>`).join('')}</div>`;
    const kind = c.H.lightKind(id);
    const place = (c.ui.aboutPlace && c.ui.aboutPlace[id]) || (kind ? K.KINDS[kind].place : null);
    body += `<div class="t-over sec-s what-is">What it is</div>
      <div class="chip-wrap">${K.PLACES.map(p => `<button class="chip sm" data-act="about-place" data-place="${p.id}" aria-pressed="${place === p.id}">${PLACE_WORD[p.id] || p.name}</button>`).join('')}</div>`;
    if (place) {
      const P = K.placeOf(place);
      body += `<div class="kinds">${P.fixtures.map(f => `
        <button class="kind ${kind === f.id ? 'sel' : ''}" data-act="about-kind" data-kind="${f.id}" aria-pressed="${kind === f.id}">
          <img src="${c.artSrc(c.kindArt(f.id))}" alt=""><span>${esc(f.name)}</span>${kind === f.id ? `<span class="tick">${icon('check', 16, 2)}</span>` : ''}</button>`).join('')}</div>`;
    }
    body += `<p class="t-cap muted about-note">${kind ? 'Tap it again to clear it. ' : ''}Suggested scenes use this to know what to dim.</p>`;
  }
  const hiddenNow = c.EDIT.hidden().includes(id);
  body += `<div class="group about-rows">
    <button class="row" data-act="about-move"><span class="row-txt"><span class="t">Move to room</span></span><span class="row-val">${esc(c.data.devAreaName(d) || 'No room')}</span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>
    <div class="row"><span class="row-txt"><span class="t">Hide from the app</span></span><button class="toggle" role="switch" aria-checked="${hiddenNow}" data-act="about-hide" aria-label="Hide from the app"></button></div>
    ${c.EDIT.canRemove(id) ? `<button class="row" data-act="about-remove"><span class="row-txt"><span class="t">Remove from home</span></span><span class="row-chev">${icon('chev', 16, 1.8)}</span></button>` : ''}
  </div>
  ${c.EDIT.canRemove(id) ? '' : `<p class="t-cap muted about-note">${String(id).startsWith('hue_') ? 'A Hue lamp leaves through the Hue app.' : 'A Nanoleaf leaves through its own app.'}</p>`}`;
  return { over: d.name, title: `About this ${noun(d)}`, body: `<div class="about">${body}</div>` };
}

export const actions = {
  'about-role'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const k = el.dataset.role;
    const was = c.H.lightRole(r.id);
    c.EDIT.setRole(r.id, was === k ? null : k);
    // the room's suggested scenes follow what each light is for; one the person changed stays as it is
    const aid = c.data.devArea(d);
    if (aid && c.H.roomHasSuggested(aid)) c.H.suggestScenes(aid);
    const t = (ROLES.find(x => x[0] === k) || [])[1] || '';
    c.save(was === k ? `${d.name}: nothing set` : `${d.name}: ${t.toLowerCase()}`);
  },
  'about-place'(c, el, r) { c.ui.aboutPlace = { ...(c.ui.aboutPlace || {}), [r.id]: el.dataset.place }; c.render(); },
  'about-kind'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const k = c.EDIT.setKind(r.id, el.dataset.kind);
    const K = window.KIND_DEF;
    c.save(k ? `${d.name} is a ${K.KINDS[k].label.toLowerCase()}` : `${d.name}: kind cleared`);
  },
  'about-move'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    c.openPicker('move', c2 => roomPicker(c2, { over: d.name, title: 'Which room is it in?', current: c2.data.devArea(d), act: 'about-move-to' }));
  },
  async 'about-move-to'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const prev = JSON.stringify(c.S.config);
    const from = c.data.devArea(d);
    let rid = el.dataset.room;
    if (rid === '__new') rid = c.EDIT.createRoom().id;
    const target = c.EDIT.moveDevice(r.id, rid);
    c.closePicker();
    await c.save('', { quiet: true });
    c.toast(`${d.name} moved to ${target ? target.name : 'no room'}`, { undo: () => undoMove(c, r.id, from, prev) });
    if (target) c.EDIT.bridgeMoveDevice(r.id, target.id).then(changed => { if (changed) c.save('', { quiet: true }); }).catch(e => c.toast(`Moved here. The bridge kept it where it was: ${e.message}`));
  },
  'about-hide'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const on = el.getAttribute('aria-checked') !== 'true';
    if (on) c.EDIT.hideDevice(r.id); else c.EDIT.unhideDevice(r.id);
    c.save(on ? `${d.name} is hidden. It still works from its remotes.` : `${d.name} is back`);
  },
  'about-remove'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    c.openPicker('remove', () => confirmSheet(c, { over: d.name, title: 'Remove from home?', act: 'about-remove-go', yes: 'Remove',
      text: 'It leaves your Lutron bridge and stops working until it is added again. Buttons and automations that used it forget it. The Lutron app will not list it any more either.' }));
  },
  async 'about-remove-go'(c, el, r) {
    const d = c.data.dev(r.id); if (!d) return;
    const prev = JSON.stringify(c.S.config);
    el.disabled = true; el.textContent = 'Removing';
    try {
      const { stillListed } = await c.EDIT.removeDevice(r.id);
      c.closePicker(); c.closeSheet();
      await c.save('', { quiet: true });
      c.go('home');
      c.toast(`${d.name} removed from your home`, { keepUndo: true, undo: async () => { c.data.restoreConfig(prev); c.EDIT.unhideDevice(r.id); await c.save('Put back'); } });
      // an older connector does not say whether the bridge let go of it: hide it if it comes back
      if (!stillListed) setTimeout(() => { if (c.data.dev(r.id)) { c.EDIT.hideDevice(r.id); c.save('', { quiet: true }); } }, 4000);
    } catch (e) {
      el.disabled = false; el.textContent = 'Remove';
      c.toast(`The bridge said no: ${e.message}`, { err: true });
    }
  },
};
