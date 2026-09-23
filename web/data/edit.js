/* Caseta data layer, part four: changing the home. Making, renaming, deleting a room and moving things between
   rooms; making and editing a scene; what kind of light something is and what it is for; hiding a device and
   removing one. Every function here changes the config and returns what it changed; saving it, and saying so, is
   the caller's. The few that talk to a bridge are async and throw a message fit to show.

   Moved from web/js/rooms.js, scenes.js, light.js and adddevice.js so the old UI and Copper Night run on one copy.
   Built on a CasetaData instance and its CasetaHome.

   Same shape as the others: a plain <script> gets window.CasetaEdit, a test `require`s it. */
(function (root) {
  'use strict';

  // How long a scene takes to arrive, the steps offered, in seconds. null is "as suggested", which is one second.
  // The hub keeps a scene's fade only up to 60 seconds (hub/validate.js) and drops a longer one without a word, so
  // nothing longer is offered: the design's 5 and 30 minute steps, and the old app's, could never be stored.
  const FADES = [0, 1, 3, 5, 8, 15, 30, 60];
  const fadeText = s => (s == null ? '1 s' : s === 0 ? 'At once' : s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);

  function create(D, H, opts = {}) {
    const S = D.S;
    const kinds = () => opts.kinds || (root && root.KIND_DEF) || null;
    const uid = opts.uid || (() => Math.random().toString(36).slice(2, 10));
    const levelOf = v => { if (v && typeof v === 'object') return Number(v.level) || 0; if (typeof v === 'number') return v; return v && v !== 'Off' ? 100 : 0; };
    const tlist = t => (Array.isArray(t) ? t : t ? [t] : []);
    const packTarget = list => (list.length === 1 ? list[0] : list.slice());
    const settings = () => S.config.settings;
    const rooms = () => settings().rooms || [];
    const roomById = id => rooms().find(r => r.id === id) || null;

    // ---------- rooms ----------
    // A new room, named as given, or "New room", "New room 2"... A name already taken gets a number after it.
    function createRoom(name) {
      H.ensureRooms();
      const names = new Set(rooms().map(r => r.name.toLowerCase()));
      let n = String(name || '').trim().slice(0, 40);
      if (!n) { n = 'New room'; let i = 2; while (names.has(n.toLowerCase())) n = `New room ${i++}`; }
      else if (names.has(n.toLowerCase())) { let i = 2; while (names.has(`${n} ${i}`.toLowerCase())) i++; n = `${n} ${i}`; }
      const room = { id: uid(), name: n, device_ids: [], bridge_area: null, hue_room: null };
      settings().rooms = [...rooms(), room];
      return room;
    }
    function renameRoom(id, name) {
      const r = roomById(id); if (!r) return null;
      const n = String(name || '').trim().slice(0, 40);
      if (n) r.name = n;
      return r;
    }
    // Nothing in it is removed from the home: everything goes back to the room its bridge puts it in.
    function deleteRoom(id) {
      const r = roomById(id); if (!r) return null;
      settings().rooms = rooms().filter(x => x.id !== id);
      return r;
    }
    // A device into a room (or, with no room, into none of the app's). Returns the room it went to.
    function moveDevice(deviceId, roomId) {
      H.ensureRooms();
      const target = roomById(roomId);
      for (const r of rooms()) r.device_ids = (r.device_ids || []).filter(x => x !== deviceId);
      if (target) target.device_ids = [...(target.device_ids || []), deviceId];
      settings().rooms = [...rooms()];
      return target;
    }
    // "5 · 1 fan · 1 shade": what a room holds.
    function roomContents(aid) {
      const ds = D.controllable().filter(d => D.devArea(d) === aid);
      const n = dm => ds.filter(d => d.domain === dm).length;
      const lights = ds.filter(d => d.domain === 'light' || d.domain === 'switch').length;
      const bits = [];
      if (lights) bits.push(String(lights));
      if (n('fan')) bits.push(`${n('fan')} fan${n('fan') === 1 ? '' : 's'}`);
      if (n('cover')) bits.push(`${n('cover')} shade${n('cover') === 1 ? '' : 's'}`);
      return bits.join(' · ') || 'Nothing yet';
    }

    // Keeping the bridges in step. Each runs after the app has saved, and a bridge that says no changes nothing
    // about the room: the caller only says so. They return what the config gained, if anything, for a quiet save.
    const roomsApi = body => D.api('/api/rooms', { method: 'POST', body: JSON.stringify(body) });
    async function bridgeMakeRoom(id) {
      const r = roomById(id); if (!r || r.bridge_area) return false;
      const res = await roomsApi({ op: 'area_create', name: r.name });
      const made = ((res && res.detail) || {}).area_id;
      const room = roomById(id);
      if (made && room) { room.bridge_area = String(made); return true; }
      return false;
    }
    async function bridgeRenameRoom(id) {
      const r = roomById(id); if (!r) return;
      if (r.hue_room) { try { await roomsApi({ op: 'hue_rename', room: r.hue_room, name: r.name }); } catch (_) { /* the Lutron side below says it if it fails too */ } }
      if (r.bridge_area) await roomsApi({ op: 'area_rename', area: r.bridge_area, name: r.name });
    }
    // Returns true when the config changed (a Hue room was made to match) and wants saving.
    async function bridgeMoveDevice(deviceId, roomId) {
      const r = roomById(roomId); if (!r) return false;
      if (String(deviceId).startsWith('hue_')) {
        let target = r.hue_room, changed = false;
        if (!target) {
          const made = await roomsApi({ op: 'hue_create', name: r.name });
          target = ((made && made.detail) || {}).room;
          const room = roomById(roomId);
          if (target && room) { room.hue_room = String(target); changed = true; }
        }
        if (target) await roomsApi({ op: 'hue_move', device: deviceId, room: target });
        return changed;
      }
      if (String(deviceId).startsWith('nanoleaf_')) return false;   // no bridge room to keep in step with
      if (!r.bridge_area) return false;
      await roomsApi({ op: 'device_move', id: deviceId, area: r.bridge_area });
      return false;
    }

    // ---------- scenes ----------
    const preset = id => D.presets().find(p => p.id === id) || null;
    // Any change to one of the five makes it the person's own, so a refresh leaves it alone.
    function markEdited(p) { if (p && p.mood && !p.edited) p.edited = true; }
    // A new scene from whatever is on now.
    function newScene(aid) {
      const p = { id: uid(), name: 'New scene', levels: {}, fade: null };
      for (const d of D.controllable()) {
        if (d.domain === 'cover') continue;
        if (aid && D.devArea(d) !== aid) continue;
        if (D.isOn(d.device_id)) p.levels[d.device_id] = H.sceneEntryNow(d, 100);
      }
      if (aid) { p.area = aid; p.name = `${D.areaName(aid)} · New scene`.slice(0, 60); }
      S.config.presets.push(p);
      return p;
    }
    function renameScene(p, name) {
      const n = String(name || '').trim();
      if (!n) return;
      // a scene in a room keeps the room in its name, so it reads right in a list of every scene
      p.name = (p.area && !n.startsWith(`${D.areaName(p.area)} · `) ? `${D.areaName(p.area)} · ${n}` : n).slice(0, 60);
      markEdited(p);
    }
    function sceneInclude(p, deviceId, on) {
      const d = D.dev(deviceId); if (!d) return;
      if (on) p.levels[deviceId] = H.sceneEntryNow(d, 100); else delete p.levels[deviceId];
      markEdited(p);
    }
    // A light's brightness in the scene, keeping the colour it has there; a fan's speed; a switch's on or off.
    function sceneSetLevel(p, deviceId, v) {
      if (!(deviceId in p.levels)) return;
      const cur = p.levels[deviceId];
      if (typeof v === 'string') p.levels[deviceId] = v;
      else { const lv = Math.max(0, Math.min(100, Math.round(v))); p.levels[deviceId] = cur && typeof cur === 'object' ? { ...cur, level: lv } : lv; }
      markEdited(p);
    }
    // A lamp's colour in the scene: {kelvin}, {hex}, {follow: true}, or null for "as it is".
    function sceneSetColour(p, deviceId, c) {
      if (!(deviceId in p.levels)) return;
      const lv = levelOf(p.levels[deviceId]);
      p.levels[deviceId] = !c ? lv : c.follow ? { level: lv, follow: true } : c.kelvin != null ? { level: lv, kelvin: Math.round(c.kelvin) } : { level: lv, hex: String(c.hex).toLowerCase() };
      markEdited(p);
    }
    // Filing a scene under a room, or none. The name carries the room, so it follows the scene.
    function sceneSetRoom(p, aid) {
      const short = H.sceneShortName(p);
      p.area = aid || null;
      p.name = (aid ? `${D.areaName(aid)} · ${short}` : short).slice(0, 60);
      markEdited(p);
    }
    function sceneSetFade(p, s) { p.fade = s == null || s === '' ? null : Number(s); markEdited(p); }
    // "Use the lights as they are now": every light already in the scene takes its current level and colour.
    function sceneCapture(p) {
      for (const id of Object.keys(p.levels)) { const d = D.dev(id); if (d) p.levels[id] = H.sceneEntryNow(d, 0); }
      markEdited(p);
    }
    // "Back to the suggestion": one of the five computed again, and a refresh may replace it from now on.
    function sceneSuggest(p) {
      if (!p || !p.mood || !p.area) return false;
      const m = H.moodById(p.mood);
      if (!m) return false;
      p.levels = H.moodLevels(p.area, m); p.fade = m.fade; p.name = `${D.areaName(p.area)} · ${m.name}`.slice(0, 60); p.edited = false;
      return true;
    }
    // A scene gone takes its buttons with it (the hub would refuse a button that runs a scene that is not there),
    // and its star.
    function deleteScene(id) {
      const p = preset(id); if (!p) return null;
      S.config.presets = D.presets().filter(x => x.id !== id);
      for (const b of D.bindings()) {
        b.actions = b.actions.filter(a => !(a.type === 'preset' && a.preset_id === id));
        if (b.night) b.night.actions = b.night.actions.filter(a => !(a.type === 'preset' && a.preset_id === id));
      }
      S.config.favorites = S.config.favorites.filter(f => f !== 'p:' + id);
      return p;
    }
    // The devices a scene sets, in room order.
    function sceneDevices(p) {
      const order = new Map(D.areas().map((a, i) => [a.id, i]));
      return Object.keys(p.levels || {}).map(D.dev).filter(Boolean)
        .sort((a, b) => ((order.get(D.devArea(a)) ?? 999) - (order.get(D.devArea(b)) ?? 999)) || a.name.localeCompare(b.name));
    }
    const lightsText = n => `${n} light${n === 1 ? '' : 's'}`;

    // ---------- what a light is ----------
    // The kind: a place and a fixture. Picking it sets the role the fixture plays; picking it again clears both.
    function setKind(id, k) {
      const K = kinds(); if (!K || !K.ROLES[k]) return null;
      const s = settings(); s.light_kinds = s.light_kinds || {}; s.roles = s.roles || {};
      if (H.lightKind(id) === k) { delete s.light_kinds[id]; delete s.roles[id]; return null; }
      s.light_kinds[id] = k; s.roles[id] = K.ROLES[k];
      return k;
    }
    // What it is for, on its own: Main, Task, Lamps, Decor.
    function setRole(id, r) {
      const s = settings(); s.roles = s.roles || {};
      if (r) s.roles[id] = r; else delete s.roles[id];
    }

    // ---------- hiding and removing ----------
    const hidden = () => settings().hidden_devices || [];
    function hideDevice(id) { const s = settings(); const list = s.hidden_devices || (s.hidden_devices = []); if (!list.includes(id)) list.push(id); }
    function unhideDevice(id) { const s = settings(); if (s.hidden_devices) s.hidden_devices = s.hidden_devices.filter(x => x !== id); }
    // Everything a removed device was part of: its buttons, the automations and scenes that named it, its star, its
    // kind and role, its room. Undo is the caller keeping the config from before.
    function forgetDevice(id) {
      const t = 'd:' + id; const cfg = S.config;
      cfg.bindings = D.bindings().filter(b => b.device_id !== id);
      const strip = list => list.map(a => { if (!a.target) return a; const rest = tlist(a.target).filter(x => x !== t); return rest.length === tlist(a.target).length ? a : (rest.length ? { ...a, target: packTarget(rest) } : null); }).filter(Boolean);
      for (const b of cfg.bindings) { b.actions = strip(b.actions); if (b.night) b.night.actions = strip(b.night.actions); }
      cfg.bindings = cfg.bindings.filter(b => b.actions.length || (b.night && b.night.actions.length));
      for (const sc of cfg.schedules || []) sc.actions = strip(sc.actions);
      cfg.schedules = (cfg.schedules || []).filter(sc => sc.actions.length);
      for (const p of cfg.presets) delete p.levels[id];
      for (const g of cfg.groups) g.device_ids = g.device_ids.filter(x => x !== id);
      cfg.favorites = cfg.favorites.filter(f => f !== t);
      if (cfg.settings.light_kinds) delete cfg.settings.light_kinds[id];
      if (cfg.settings.roles) delete cfg.settings.roles[id];
      if (cfg.settings.remote_looks) delete cfg.settings.remote_looks[id];
      for (const r of cfg.settings.rooms || []) r.device_ids = (r.device_ids || []).filter(x => x !== id);
    }
    // Only a Lutron device can be removed from here: a Hue lamp or a Nanoleaf leaves through its own app.
    const canRemove = id => !/^(hue_|nanoleaf_)/.test(String(id));
    // Ask the bridge to let it go, then forget it. Returns { stillListed } (some bridges keep listing a removed
    // device, which is then hidden so the next refresh does not bring it back).
    async function removeDevice(id) {
      const r = await D.api('/api/removedevice', { method: 'POST', body: JSON.stringify({ id }) });
      forgetDevice(id);
      if (S.inv.devices) delete S.inv.devices[id];
      const stillListed = !!(r && r.detail && r.detail.still_listed);
      if (stillListed) hideDevice(id);
      return { stillListed };
    }

    // ---------- adding a Lutron device ----------
    // What the bridge calls a device it heard, in plain words, and the name a new one starts with.
    function addTypeName(t) {
      if (!t) return 'Device';
      if (/Pico/.test(t)) { const m = D.modelName({ type: t }); return m === 'Remote' ? 'Pico remote' : `Pico ${m}`; }
      if (/Shade|Blind|Drape|Tilt/.test(t)) return 'Shade';
      if (/Fan/.test(t)) return 'Fan control';
      if (/PlugIn.*Dimmer/.test(t)) return 'Plug-in dimmer';
      if (/PlugIn.*Switch/.test(t)) return 'Plug-in switch';
      if (/Dimmer|Dimmed|Tune/.test(t)) return 'Dimmer';
      if (/Switch/.test(t)) return 'Switch';
      return t;
    }
    const addDefaultName = t => { const n = addTypeName(t); return /^Pico/.test(n) ? 'New remote' : `New ${n.toLowerCase()}`; };
    // The rooms a new device can go in: the app's own once it has them, else the Lutron bridge's.
    function addRooms() {
      H.ensureRooms();
      if (rooms().length) return rooms().map(r => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
      return Object.values(S.inv.areas || {}).filter(a => a && a.id && a.name && !String(a.id).startsWith('hue_')).sort((a, b) => a.name.localeCompare(b.name));
    }
    // The bridge can only make a device in one of its own areas: the room's own when it has one, else the area its
    // Lutron lights already use, else one with the same name, else the first. `own` says whether it is the room's.
    function lutronHomeFor(roomId) {
      const areas = Object.values(S.inv.areas || {}).filter(a => a && a.id && a.name && !String(a.id).startsWith('hue_')).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (!areas.length) return null;
      const r = roomById(roomId);
      if (r && r.bridge_area) { const own = areas.find(a => String(a.id) === r.bridge_area); if (own) return { id: String(own.id), name: own.name, own: true }; }
      if (!r) { const a = areas.find(x => String(x.id) === roomId); if (a) return { id: String(a.id), name: a.name, own: true }; }
      const mates = H.fileable().filter(d => D.devArea(d) === roomId && !String(d.device_id).startsWith('hue_') && d.area && !String(d.area).startsWith('hue_'));
      if (mates.length) { const a = areas.find(x => String(x.id) === String(mates[0].area)); if (a) return { id: String(a.id), name: a.name, own: false }; }
      const want = ((r && r.name) || '').toLowerCase();
      const near = want && areas.find(a => String(a.name).toLowerCase() === want);
      if (near) return { id: String(near.id), name: near.name, own: false };
      return { id: String(areas[0].id), name: areas[0].name, own: false };
    }
    // A device just made: into the room the person picked, whichever area the bridge used, and back from hidden if
    // it was removed once before. True when the config changed.
    function fileNewDevice(deviceId, serial, roomId) {
      let changed = false;
      const ids = new Set([deviceId, ...Object.values(S.inv.devices || {}).filter(x => serial && String(x.serial || '') === String(serial)).map(x => x.device_id)].filter(Boolean));
      for (const id of ids) if (hidden().includes(id)) { unhideDevice(id); changed = true; }
      const did = deviceId || [...ids][0];
      const target = roomById(roomId);
      if (did && target && !(target.device_ids || []).includes(did)) {
        for (const x of rooms()) x.device_ids = (x.device_ids || []).filter(y => y !== did);
        target.device_ids = [...(target.device_ids || []), did];
        // a new list, so the data layer's room index (cached on the list) is rebuilt
        settings().rooms = [...rooms()];
        changed = true;
      }
      return changed;
    }

    return {
      FADES, fadeText,
      addTypeName, addDefaultName, addRooms, lutronHomeFor, fileNewDevice,
      createRoom, renameRoom, deleteRoom, moveDevice, roomContents, bridgeMakeRoom, bridgeRenameRoom, bridgeMoveDevice,
      markEdited, newScene, renameScene, sceneInclude, sceneSetLevel, sceneSetColour, sceneSetRoom, sceneSetFade,
      sceneCapture, sceneSuggest, deleteScene, sceneDevices, lightsText,
      setKind, setRole, hidden, hideDevice, unhideDevice, forgetDevice, canRemove, removeDevice,
    };
  }

  const CasetaEdit = { create, FADES, fadeText };
  if (typeof module !== 'undefined' && module.exports) module.exports = CasetaEdit;
  if (root) root.CasetaEdit = CasetaEdit;
})(typeof window !== 'undefined' ? window : null);
