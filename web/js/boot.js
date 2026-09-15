/* Event wiring. One delegated listener; every interactive element carries data-act. */
'use strict';

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act; const d = el.dataset;
  switch (act) {
    case 'nav': e.preventDefault(); S.view = d.view; location.hash = S.view; if (sheet.isOpen()) sheet.close(); render(); window.scrollTo(0, 0); break;
    case 'conn': S.view = 'settings'; location.hash = 'settings'; render(); break;
    case 'toggle': toggleTarget(d.t); break;
    case 'fav': toggleFav(d.t); break;
    case 'run-scene': { const t = d.t; el.classList.add('running'); setTimeout(() => el.classList.remove('running'), 1000); if (window.Motion) { Motion.press(el); Motion.sceneRun(sceneRooms(t)); } await command(t.startsWith('p:') ? { type: 'preset', preset_id: t.slice(2) } : { type: 'scene', scene_id: t.slice(2) }); break; }
    case 'cmd': command(JSON.parse(d.cmd)); break;
    case 'fan': S.states[d.id] = { ...(S.states[d.id] || {}), fan_speed: d.s, level: d.s === 'Off' ? 0 : 100 }; paintState(); command({ type: 'fan', target: `d:${d.id}`, speed: d.s }); break;
    case 'room-open': if (window.Motion) Motion.press(el); toggleRoom(d.id); break;
    case 'alloff': if (!el._held) { for (const id of targetDevices('h:all')) S.states[id] = { ...(S.states[id] || {}), level: 0 }; paintState(); command({ type: 'level', target: 'h:all', level: 'off' }); } el._held = false; break;
    case 'cancel-timer': command({ type: 'cancel_timer', target: d.t }); break;
    case 'timer': sheet.close(); await command({ type: 'timer', target: d.t, minutes: Number(d.m), fade: 5 }); toast(`${targetName(d.t)} turns off in ${d.m} min`); break;
    case 'update-connector': el.disabled = true; el.textContent = 'Updating…'; toast('Updating the connector. The dot goes red, then green again in about a minute.'); try { const r = await api('/api/update-connector', { method: 'POST' }); toast(r.detail && r.detail.to ? `Updated to ${r.detail.to}. Restarting…` : 'Updated. Restarting…'); } catch (err) { toast(err.message, { err: true }); render(); } break;
    case 'auto-update': S.config.settings.auto_update = !S.config.settings.auto_update; el.classList.toggle('on', S.config.settings.auto_update); save({ quiet: true, render: false }); break;
    case 'refresh': el.classList.add('dim'); try { await api('/api/refresh', { method: 'POST' }); toast('Looked again'); } catch (err) { toast(err.message, { err: true }); } el.classList.remove('dim'); break;
    case 'remote-open': S.remote = d.id; render(); window.scrollTo(0, 0); picoPhotoAvailable(dev(d.id)).then(u => { if (u) render(); }); break;
    case 'remote-back': S.remote = null; render(); break;
    case 'remote-look': openLookSheet(); break;
    case 'look-model': setLook('model', d.m); break;
    case 'look-finish': setLook('finish', d.f); break;
    case 'button-open': if (window.Motion) Motion.press(el); S.pickTargets = null; openButtonSheet(Number(d.n)); break;
    case 'gesture-open': S.pickTargets = null; openRecipeSheet(d.g, false); break;
    case 'recipe-mode': S.night = d.night === '1'; renderRecipeSheet(); break;
    case 'pick-target': toggleTargetChip(d.t); break;
    case 'pick-target-more': openTargetPicker(S.pickTargets, list => { S.pickTargets = list; retargetCurrent(); renderRecipeSheet(); }, renderRecipeSheet); break;
    case 'picker-done': { const p = S.targetPick; if (p.selected.length) p.onDone(p.selected); break; }
    case 'picker-expand': { const p = S.targetPick; if (p.open.has(d.id)) p.open.delete(d.id); else p.open.add(d.id); el.closest('.roomrow').classList.toggle('open'); const rl = document.querySelector(`[data-roomlights="${d.id}"]`); if (rl) rl.classList.toggle('open'); break; }
    case 'adv-target': { const b = currentBindingForEdit(); const list = S.night ? b.night.actions : b.actions; const i = Number(d.i); openTargetPicker(tlist(list[i].target), sel => { list[i].target = packTarget(sel); saveSoon(); renderAdvanced(); }, renderAdvanced); break; }
    case 'recipe': applyRecipe(d.r); break;
    case 'pick-scene': pickScene(Number(d.i)); break;
    case 'advanced': openAdvanced(); break;
    case 'adv-add': { const b = currentBindingForEdit(); const list = S.night ? b.night.actions : b.actions; list.push({ type: 'level', target: S.pickTargets && S.pickTargets.length ? packTarget(S.pickTargets) : defaultTarget(S.remote), level: 'toggle' }); renderAdvanced(); saveSoon(); break; }
    case 'adv-remove': { const b = currentBindingForEdit(); const list = S.night ? b.night.actions : b.actions; list.splice(Number(d.i), 1); renderAdvanced(); saveSoon(); break; }
    case 'adv-done': { const b = currentBindingForEdit(); if (b && !b.actions.length && !(b.night && b.night.actions.length)) S.config.bindings = S.config.bindings.filter(x => x.id !== b.id); if (b && b.night && !b.night.actions.length) b.night = null; await save({ msg: 'Saved' }); renderRecipeSheet(); break; }
    case 'try-actions': tryActions(); break;
    case 'sheet-close': sheet.close(); break;
    case 'sheet-back': if (sheet.onBack) sheet.onBack(); else sheet.close(); break;
    case 'toast-undo': { const t = $('#toast'); t.className = ''; if (t._undo) t._undo(); break; }
    case 'toast-action': { const t = $('#toast'); t.className = ''; if (t._action) t._action(); break; }
    case 'scene-new': newScene(); break;
    case 'scene-edit': openSceneEditor(d.id); break;
    case 'scene-capture': sceneCapture(); break;
    case 'scene-delete': sceneDelete(d.id); break;
    case 'scene-sw': { const p = presets().find(x => x.id === S.sceneEdit); const on = !(p.levels[d.id] > 0); p.levels[d.id] = on ? 100 : 0; el.classList.toggle('on', on); saveSoon(); break; }
    case 'install-help': openInstallHelp(); break;
    case 'activity': openActivity(); break;
    case 'copy': navigator.clipboard.writeText(d.text).then(() => toast('Copied')).catch(() => toast('Select the text and copy it', { err: true })); break;
    case 'group-new': openGroupEditor(null); break;
    case 'group-edit': openGroupEditor(d.id); break;
    case 'group-delete': S.config.groups = groups().filter(x => x.id !== d.id); for (const b of bindings()) { b.actions = b.actions.filter(a => a.target !== 'g:' + d.id); if (b.night) b.night.actions = b.night.actions.filter(a => a.target !== 'g:' + d.id); } S.config.favorites = S.config.favorites.filter(f => f !== 'g:' + d.id); sheet.close(); save({ msg: 'Set deleted' }); break;
    case 'backup': navigator.clipboard.writeText(JSON.stringify(S.config, null, 2)).then(() => toast('Settings copied to the clipboard')).catch(() => toast('Clipboard blocked', { err: true })); break;
    case 'restore': { const t = prompt('Paste the settings you backed up'); if (!t) break; try { S.config = JSON.parse(t); save({ msg: 'Settings restored' }); } catch (_) { toast('That is not a settings backup', { err: true }); } break; }
    case 'logout': S.token = ''; localStorage.removeItem('token'); if (S.ws) S.ws.close(); sheet.close(); render(); break;
  }
});

// Room cards a scene touches, for the wash of light.
function sceneRooms(t) {
  const all = [...document.querySelectorAll('.room[data-room]')];
  if (!t.startsWith('p:')) return all;
  const p = presets().find(x => x.id === t.slice(2)); if (!p) return all;
  const areasHit = new Set(Object.keys(p.levels).map(id => (dev(id) || {}).area || 'none'));
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
let slideTimer = null;
document.addEventListener('input', e => {
  const el = e.target; if (el.type !== 'range') return;
  el.style.setProperty('--p', `${el.value}%`);
  const wrap = el.closest('.sliderwrap'); if (wrap) { wrap.classList.add('drag'); wrap.style.setProperty('--p', `${el.value}%`); const tip = wrap.querySelector('.tip'); if (tip) tip.textContent = `${el.value}%`; clearTimeout(wrap._t); wrap._t = setTimeout(() => wrap.classList.remove('drag'), 900); }
  if (el.dataset.slide) {
    el.dataset.drag = '1';
    if (window.Motion) Motion.sliderFeedback(el, Number(el.value));
    const t = el.dataset.slide; const v = Number(el.value);
    const lv = el.closest('.light') && el.closest('.light').querySelector('.lv'); if (lv) lv.textContent = v === 0 ? 'Off' : `${v}%`;
    clearTimeout(slideTimer); slideTimer = setTimeout(() => { command({ type: 'level', target: t, level: v, fade: 0 }); }, 120);
  }
  if (el.dataset.setting === 'double_ms') $('#dv').textContent = `${el.value} ms`;
  if (el.dataset.setting === 'hold_ms') $('#hv').textContent = `${el.value} ms`;
});
document.addEventListener('pointerup', e => { const el = e.target; if (el.dataset && el.dataset.slide) { setTimeout(() => { delete el.dataset.drag; }, 800); } });

// Hold-to-do-more on the All off button (also closes shades, stops fans).
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-act="alloff"]'); if (!el) return;
  el.classList.add('holding');
  el._t = setTimeout(async () => {
    el._held = true; el.classList.remove('holding'); if (navigator.vibrate) navigator.vibrate(30);
    if (window.Motion) Motion.allOff();
    await command({ type: 'level', target: 'h:all', level: 'off' });
    for (const d of controllable()) { if (d.domain === 'cover') command({ type: 'lower', target: `d:${d.device_id}` }); if (d.domain === 'fan') command({ type: 'fan', target: `d:${d.device_id}`, speed: 'Off' }); }
    toast('Everything off, shades closing');
  }, 1000);
});
document.addEventListener('pointerup', e => { const el = e.target.closest('[data-act="alloff"]'); if (el) { clearTimeout(el._t); el.classList.remove('holding'); } });
document.addEventListener('pointercancel', e => { const el = e.target.closest('[data-act="alloff"]'); if (el) { clearTimeout(el._t); el.classList.remove('holding'); } });
// Long-press a favorite tile for a sleep timer.
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-long="open-light"]'); if (!el) return;
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
  } catch (err) { toast(err.message, { err: true }); }
});
$('#sheet-root .scrim').addEventListener('click', () => sheet.close());
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view; if (S.view !== 'remotes') S.remote = null; location.hash = S.view; render(); window.scrollTo(0, 0); }));
window.addEventListener('hashchange', () => { const v = location.hash.slice(1).split('/')[0]; if (v && VIEWS[v] && v !== S.view) { S.view = v; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.isOpen()) sheet.close(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (S.token) connectWS();
render();
