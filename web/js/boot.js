/* Event wiring. One delegated listener; every interactive element carries data-act. */
'use strict';

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act; const d = el.dataset;
  switch (act) {
    case 'nav': e.preventDefault(); S.view = d.view; S.room = null; S.roomPage = null; location.hash = S.view; if (sheet.isOpen()) sheet.close(); render(); window.scrollTo(0, 0); break;
    case 'conn': S.view = 'settings'; S.settingsPage = null; location.hash = 'settings'; render(); break;
    // Settings is one screen; a rare thing lives on a short page behind one row (docs/ia-v5.md 3)
    case 'settings-page': S.settingsPage = d.p; render(); window.scrollTo(0, 0); break;
    // the disclosure eases open in place, so the cards under it are not thrown 288px down in one frame
    case 'settings-how': { S.settingsHow = !S.settingsHow; const w = el.parentElement.querySelector('.dwrap'); if (w) w.classList.toggle('open', S.settingsHow); el.setAttribute('aria-expanded', S.settingsHow ? 'true' : 'false'); break; }
    case 'settings-back': S.settingsPage = null; render(); window.scrollTo(0, 0); break;
    case 'toggle': toggleTarget(d.t); break;
    case 'power-on': setPowerOn(d.v); break;
    case 'fav': toggleFav(d.t); break;
    case 'run-scene': { const t = d.t; el.classList.add('running'); setTimeout(() => el.classList.remove('running'), 1000); if (window.Motion) { Motion.press(el.classList.contains('item') ? el.querySelector('.ic') || el : el); Motion.sceneRun([el.querySelector('.face'), ...sceneRooms(t)].filter(Boolean)); } await command(t.startsWith('p:') ? { type: 'preset', preset_id: t.slice(2) } : { type: 'scene', scene_id: t.slice(2) }); break; }
    case 'cmd': command(JSON.parse(d.cmd)); break;
    case 'fan': setFan(d.id, d.s); break;
    case 'alloff': if (!el._held) powerButton(); el._held = false; break;
    case 'cancel-timer': await command({ type: 'cancel_timer', target: tsplit(d.t) }); break;
    case 'timer': { sheet.close(); const tgt = tsplit(d.t); const n = targetDevices(tgt).length; const ok = await command({ type: 'timer', target: tgt, minutes: Number(d.m), fade: 5 }); if (ok) toast(n > 1 ? `${plural(n, 'light')} turn off in ${d.m} min` : `${cap(targetName(tgt))} turns off in ${d.m} min`); break; }
    case 'update-connector': el.disabled = true; el.textContent = 'Updating…'; toast('Updating the connector. The dot goes red, then green again in about a minute.'); try { const r = await api('/api/update-connector', { method: 'POST' }); toast(r.detail && r.detail.to ? `Updated to ${r.detail.to}. Restarting…` : 'Updated. Restarting…'); } catch (err) { toast(err.message, { err: true }); render(); } break;
    case 'auto-update': S.config.settings.auto_update = !S.config.settings.auto_update; el.classList.toggle('on', S.config.settings.auto_update); save({ quiet: true, render: false }); break;
    case 'refresh': el.classList.add('dim'); try { await api('/api/refresh', { method: 'POST' }); toast('Looked again'); } catch (err) { toast(err.message, { err: true }); } el.classList.remove('dim'); break;
    case 'remote-open': S.remote = d.id; render(); window.scrollTo(0, 0); picoPhotoAvailable(dev(d.id)).then(u => { if (u) render(); }); break;
    case 'remote-back': S.remote = null; render(); break;
    case 'remote-look': openLookSheet(); break;
    case 'remote-more': S.remoteLutron = false; remoteMoreSheet(); break;
    case 'remote-lutron': S.remoteLutron = !S.remoteLutron; remoteMoreSheet(); break;
    case 'usual-hide': try { localStorage.setItem(`usualHidden:${d.id}`, '1'); } catch (_) { /* ignore */ } { const t = $('#usualtip'); if (t) { if (window.gsap && !Motion.reduced()) { t.style.overflow = 'hidden'; gsap.to(t, { height: 0, opacity: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.255, ease: 'power2.inOut', onComplete: () => t.remove() }); } else t.remove(); } } break;
    case 'recipe-more': recipeMoreSheet(); break;
    case 'recipe-night': S.night = true; renderRecipeSheet(); break;
    case 'recipe-clear': applyRecipe('nothing'); break;
    case 'recipe-all': openAllWaysSheet(); break;
    case 'pick-open': S.pickOpen = !S.pickOpen; renderRecipeSheet(); break;
    case 'scene-lights': openSceneLightsSheet(); break;
    case 'scene-more': sceneMoreSheet(); break;
    case 'look-model': setLook('model', d.m); break;
    case 'look-finish': setLook('finish', d.f); break;
    case 'button-open': if (window.Motion) Motion.press(el.classList.contains('item') ? el.querySelector('.ic') || el : el); S.pickTargets = null; S.advCustom = null; openButtonSheet(Number(d.n)); break;
    case 'gesture-open': S.pickTargets = null; openRecipeSheet(d.g, false); break;
    case 'recipe-mode': S.night = d.night === '1'; renderRecipeSheet(); break;
    case 'pick-target': toggleTargetChip(d.t); break;
    case 'pick-target-more': openTargetPicker(S.pickTargets, list => { S.pickTargets = list; retargetCurrent(); renderRecipeSheet(); }, renderRecipeSheet); break;
    case 'picker-done': { const p = S.targetPick; if (p.selected.length) p.onDone(p.selected); break; }
    case 'picker-expand': { const p = S.targetPick; if (p.open.has(d.id)) p.open.delete(d.id); else p.open.add(d.id); el.closest('.roomrow').classList.toggle('open'); const rl = document.querySelector(`[data-roomlights="${d.id}"]`); if (rl) rl.classList.toggle('open'); break; }
    case 'adv-target': { const i = Number(d.i); const list = advList(); if (!list || !list[i]) break; openTargetPicker(tlist(list[i].target), sel => { const l = advList(); if (l && l[i]) l[i].target = packTarget(sel); advChanged(); renderAdvanced(); }, renderAdvanced, { shades: !!S.advCustom }); break; }
    case 'recipe': applyRecipe(d.r); break;
    case 'pick-scene': pickScene(Number(d.i)); break;
    case 'advanced': openAdvanced(); break;
    case 'adv-add': { const list = advList(); if (!list) break; list.push({ type: 'level', target: advDefaultTarget(), level: S.advCustom ? 'on' : 'toggle' }); renderAdvanced(); advChanged(); break; }
    case 'adv-remove': { const list = advList(); if (!list) break; list.splice(Number(d.i), 1); renderAdvanced(); advChanged(); break; }
    case 'adv-done': { if (S.advCustom) { S.advCustom.onDone(); break; } const b = currentBindingForEdit(); if (b && !b.actions.length && !(b.night && b.night.actions.length)) S.config.bindings = S.config.bindings.filter(x => x.id !== b.id); if (b && b.night && !b.night.actions.length) b.night = null; await save({ msg: 'Saved' }); renderRecipeSheet(); break; }
    case 'leaving-door': saveLeaving(d.t); break;
    case 'usual-layout': applyUsualLayout(S.remote, { scroll: !!el.closest('#usualtip') }); break;
    case 'try-actions': tryActions(); break;
    case 'sheet-close': sheet.close(); break;
    case 'sheet-back': if (sheet.onBack) sheet.onBack(); else sheet.close(); break;
    case 'toast-undo': { const t = $('#toast'); t.className = ''; if (t._undo) t._undo(); break; }
    case 'toast-action': { const t = $('#toast'); t.className = ''; if (t._action) t._action(); break; }
    case 'scenes-open': S.view = 'scenes'; S.room = null; S.roomPage = null; S.scenesEdit = false; location.hash = 'scenes'; if (sheet.isOpen()) sheet.close(); render(); window.scrollTo(0, 0); break;
    case 'scenes-back': S.view = 'home'; S.scenesEdit = false; location.hash = 'home'; render(); window.scrollTo(0, 0); break;
    case 'scenes-edit': S.scenesEdit = !S.scenesEdit; render(); break;
    case 'scene-new': newScene(); break;
    case 'scene-edit': openSceneEditor(d.id, false, { back: typeof backTo === 'function' ? backTo(d.back, d.area) : null }); break;
    case 'scene-lutron': sceneLutronSheet(d.id); break;
    case 'scene-capture': sceneCapture(); break;
    case 'scene-delete': sceneDelete(d.id); break;
    case 'scene-sw': { const p = presets().find(x => x.id === S.sceneEdit); const on = !(levelOf(p.levels[d.id]) > 0); sceneLevel(d.id, on ? 100 : 0); el.classList.toggle('on', on); break; }
    case 'scene-suggest': sceneSuggest(d.id); break;
    case 'install-help': openInstallHelp(); break;
    case 'activity': openActivity(); break;
    case 'copy': navigator.clipboard.writeText(d.text).then(() => toast('Copied')).catch(() => toast('Select the text and copy it', { err: true })); break;
    case 'group-new': openGroupEditor(null); break;
    case 'group-edit': openGroupEditor(d.id); break;
    case 'group-delete': S.config.groups = groups().filter(x => x.id !== d.id); for (const b of bindings()) { b.actions = b.actions.filter(a => a.target !== 'g:' + d.id); if (b.night) b.night.actions = b.night.actions.filter(a => a.target !== 'g:' + d.id); } S.config.favorites = S.config.favorites.filter(f => f !== 'g:' + d.id); sheet.close(); save({ msg: 'Set deleted' }); break;
    case 'backup': navigator.clipboard.writeText(JSON.stringify(S.config, null, 2)).then(() => toast('Settings copied to the clipboard')).catch(() => toast('Clipboard blocked', { err: true })); break;
    case 'restore': { const t = prompt('Paste the settings you backed up'); if (!t) break; try { S.config = JSON.parse(t); save({ msg: 'Settings restored' }); } catch (_) { toast('That is not a settings backup', { err: true }); } break; }
    case 'logout': S.token = ''; localStorage.removeItem('token'); if (S.ws) S.ws.close(); S.ready = false; S._everReady = false; S._loadingShown = false; S._barShown = false; sheet.close(); render(); break;
    case 'pw-help': sheet.open("Your home's password", `<p class="body">It's the password whoever set up your hub chose. It's in the hub's settings under APP_PASSWORD.</p><div class="spacer"></div><button class="btn primary lg block" data-act="sheet-close">Got it</button>`); break;
    case 'setup-open': openSetupSheet(); break;
    case 'home-name': openHomeName(); break;
    case 'night-open': openNightSheet(); break;
    case 'power-open': openPowerSheet(); break;
    case 'onlevel-open': openOnLevelSheet(); break;
    case 'where-open': openWhereSheet(); break;
  }
});

// Room cards a scene touches, for the wash of light.
function sceneRooms(t) {
  const all = [...document.querySelectorAll('.room[data-room]')];
  if (!t.startsWith('p:')) return all;
  const p = presets().find(x => x.id === t.slice(2)); if (!p) return all;
  const areasHit = new Set(Object.keys(p.levels).map(id => devArea(dev(id))));
  return all.filter(el => areasHit.has(el.dataset.room));
}

// Inputs: change events (checkboxes, selects, text) and live slider input.
document.addEventListener('change', e => {
  const el = e.target; const d = el.dataset;
  if (d.act === 'scene-inc') sceneInclude(d.id, el.checked);
  else if (d.act === 'picker-toggle') {
    const p = S.targetPick; const i = p.selected.indexOf(d.t);
    if (el.checked && i < 0) p.selected = normalizeTargets([...p.selected, d.t], d.t);
    if (!el.checked && i >= 0) p.selected.splice(i, 1);
    // reflect exclusivity in the other checkboxes without rebuilding the sheet
    document.querySelectorAll('[data-act="picker-toggle"]').forEach(c => { c.checked = p.selected.includes(c.dataset.t); });
    const btn = document.querySelector('[data-act="picker-done"]'); if (btn) btn.disabled = !p.selected.length;
    const sum = document.querySelector('#picker-summary'); if (sum) sum.textContent = p.selected.length ? `${cap(targetName(packTarget(p.selected)))} · ${plural(targetDevices(p.selected).length, 'light')}` : 'Nothing picked yet';
  }
  else if (d.act === 'group-inc') { const g = groups().find(x => x.id === S.groupEdit); if (!g) return; g.device_ids = el.checked ? [...new Set([...g.device_ids, d.id])] : g.device_ids.filter(x => x !== d.id); saveSoon(); }
  else if (d.sceneLvl) sceneLevel(d.sceneLvl, el.tagName === 'SELECT' ? el.value : Number(el.value));
  else if (d.adv != null) advEdit(Number(d.adv), d.k, el.value);
  else if (d.setting) setSetting(d.setting, el.value);
  else if (el.id === 'scene-name') sceneEdit('name', el.value);
  else if (el.id === 'scene-fade') sceneEdit('fade', el.value);
  else if (el.id === 'group-name') { const g = groups().find(x => x.id === S.groupEdit); if (g) { g.name = el.value.trim() || 'Untitled'; saveSoon(); } }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'pw') { const b = document.querySelector('[data-form="login"] .btn.primary'); if (b) b.disabled = !el.value; const f = $('#pwfield'); if (f && f.classList.contains('err')) { f.classList.remove('err'); const sub = f.querySelector('.sub'); if (sub) sub.remove(); } return; }
  if (el.type !== 'range') return;
  el.style.setProperty('--p', `${el.value}%`);
  // the row's own level is the readout (no tooltip): a scene row's second line follows the finger too
  if (el.dataset.sceneLvl) { const it = el.closest('.item'); const dd = it && it.querySelector('.grow .d'); if (dd) dd.textContent = Number(el.value) > 0 ? `${el.value}%` : 'Off'; }
  if (el.dataset.slide) {
    el.dataset.drag = '1';
    if (window.Motion) Motion.sliderFeedback(el, Number(el.value));
    const t = el.dataset.slide; const v = Number(el.value);
    const row = el.closest('.light');
    const lv = row && row.querySelector('.lv'); if (lv) lv.textContent = v === 0 ? 'Off' : `${v}%`;
    const disc = row && row.querySelector('[data-ldisc]'); if (disc) { const c = lightFill(disc.dataset.ldisc, v); disc.style.backgroundColor = c; disc.dataset.fill = c; disc.classList.toggle('off', v <= 0); }
    sendLevel(t, v);
  }
  if (el.dataset.house) {
    // the house dimmer on Home's house card: the number follows the finger, one command in flight
    el.dataset.drag = '1';
    const v = Number(el.value); const num = el.parentElement.querySelector('.hc-num'); if (num) num.textContent = `${v}%`;
    setHouseLevel(v);
  }
  if (el.dataset.setting === 'double_ms') $('#dv').textContent = `${el.value} ms`;
  if (el.dataset.setting === 'hold_ms') $('#hv').textContent = `${el.value} ms`;
});

// Hold-to-do-more on the All off button (also closes shades, stops fans).
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-act="alloff"]'); if (!el) return;
  el.classList.add('holding');
  el._t = setTimeout(() => {
    el._held = true; el.classList.remove('holding'); if (navigator.vibrate) navigator.vibrate(30);
    houseAllOffShades();
  }, 1000);
});
document.addEventListener('pointerup', e => { const el = e.target.closest('[data-act="alloff"]'); if (el) { clearTimeout(el._t); el.classList.remove('holding'); } });
document.addEventListener('pointercancel', e => { const el = e.target.closest('[data-act="alloff"]'); if (el) { clearTimeout(el._t); el.classList.remove('holding'); } });
// Keyboard: a row that is a button (role="button") acts on Enter and Space like a real one.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target; if (!el || el.getAttribute('role') !== 'button' || !el.dataset.act || el.tagName === 'BUTTON') return;
  e.preventDefault(); el.click();
});
// Long-press a lit lamp in the row for a sleep timer.
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-long="open-light"]'); if (!el) return;
  if (e.target.closest('[data-act]') !== el) return;   // a control sitting on the disc (the rainbow button) is not a hold on the lamp
  el._lt = setTimeout(() => { el._long = true; sleepTimerSheet(el.dataset.t); }, 550);
});
document.addEventListener('pointerup', e => { const el = e.target.closest('[data-long]'); if (el) clearTimeout(el._lt); });
document.addEventListener('click', e => { const el = e.target.closest('[data-long]'); if (el && el._long) { el._long = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);

document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'login') return;
  e.preventDefault();
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error === 'wrong password' ? "That's not the password" : b.error || 'Could not sign in');
    S.token = b.token; localStorage.setItem('token', b.token); connectWS(); render();
  } catch (err) {
    const f = $('#pwfield');
    // the label stays "Password"; the message goes under the field in red (the .field.err .sub rule)
    if (/not the password/.test(err.message) && f) { f.classList.add('err'); let sub = f.querySelector('.sub'); if (!sub) { sub = document.createElement('span'); sub.className = 'sub'; f.appendChild(sub); } sub.textContent = err.message; f.setAttribute('role', 'alert'); }
    else toast(err.message, { err: true });
  }
});
// The splash: the brand blue with the wordmark, then a 255ms fade into whatever the first page is.
setTimeout(() => { const sp = $('#splash'); if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 300); } }, 255);
$('#sheet-root .scrim').addEventListener('click', () => sheet.close());
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view; S.remote = null; S.room = null; S.roomPage = null; S.settingsPage = null; location.hash = S.view; render(); window.scrollTo(0, 0); }));
// The hash is the route: #home, #remotes, #room/<area>, #room/<area>/setup, #scenes, #automations, #settings.
window.addEventListener('hashchange', () => {
  const parts = location.hash.slice(1).split('/'); const v = parts[0];
  if (!v || !VIEWS[v]) return;
  if (v === 'room') { if (typeof roomFromHash === 'function' && roomFromHash(parts)) { S.view = 'room'; render(); } return; }
  if (v !== S.view || S.room) { S.view = v; S.room = null; S.roomPage = null; render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.isOpen()) sheet.close(); });
// a cold load straight onto #room/<area> (a shared link, a reload): read the room out of the hash before the first render
if (S.view === 'room') { const parts = location.hash.slice(1).split('/'); S.room = parts[1] ? decodeURIComponent(parts[1]) : null; S.roomPage = parts[2] === 'setup' ? 'setup' : null; }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (S.token) connectWS();
render();
