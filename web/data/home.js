/* Caseta data layer, part two: the home's own rules. Which role a light plays, the five scenes a room is offered and
   what levels each gives it, which of a room's scenes the lights are showing, which lights are lit, and the first-time
   seeding of the app's rooms from the bridges'. No DOM, no saving, no toasts: each rule that used to save in the middle
   (seeding rooms, writing the five) now changes the config and says so, and the caller saves.

   Moved verbatim from web/js/light.js, web/js/automations.js and web/js/rooms.js for Copper Night phase 1; those
   files keep their global names pointed here, so the old UI runs on this too. Built on an instance of
   CasetaData (web/data/caseta-data.js); the kinds table (web/js/kinds.js) is looked up when a role is asked for,
   because in the old UI it loads after this file does.

   Same shape as caseta-data.js: a plain <script> gets window.CasetaHome, a test `require`s it. */
(function (root) {
  'use strict';

  // ---------- the five a room is offered: computed from roles, never stored ----------
  const SUGGESTED_FADE = 1;
  const MOODS = [
    { id: 'bright', name: 'Bright', icon: 'sun', head: 100, fade: SUGGESTED_FADE, roles: { ambient: 100, task: 100, accent: 60, decor: 50 }, sw: true },
    { id: 'relax', name: 'Relax', icon: 'sofa', head: 40, fade: SUGGESTED_FADE, roles: { ambient: 35, task: 0, accent: 60, decor: 40 } },
    { id: 'dinner', name: 'Dinner', icon: 'kitchen', head: 60, fade: SUGGESTED_FADE, roles: { ambient: 20, task: 0, accent: 50, decor: 40 } },
    { id: 'movie', name: 'Movie', icon: 'film', head: 20, fade: SUGGESTED_FADE, roles: { ambient: 0, task: 0, accent: 15, decor: 0 } },
    { id: 'night', name: 'Night', icon: 'moon', head: 5, fade: SUGGESTED_FADE, night: true },
  ];
  // What each of the five used to fade over, so a scene still carrying one can be brought forward. Once
  // nothing matches, this does nothing, which is what makes it safe to leave in place.
  const OLD_SUGGESTED_FADE = { bright: 1, relax: 3, dinner: 3, movie: 8, night: 2 };
  const MOOD_ORDER = ['bright', 'relax', 'dinner', 'movie', 'night'];
  const moodById = id => MOODS.find(m => m.id === id);

  // ---------- roles ----------
  const ROLE_LABEL = { ambient: 'Main', task: 'Task', accent: 'Lamps', decor: 'Decor' };
  const ROLE_CAP = { ambient: 'Main · fills the room', task: 'Task · light for your hands', accent: 'Lamps · for atmosphere', decor: 'Decor · lit to be looked at' };
  const ROLE_CHIPS = [['ambient', 'Main'], ['task', 'Task'], ['accent', 'Lamps'], ['decor', 'Decor']];
  // A first guess at a light's role from its name, for the sheet that asks the person to confirm it.
  function guessRole(name) {
    const n = (name || '').toLowerCase();
    if (/under|cabinet|vanity|desk|island|counter/.test(n)) return 'task';
    if (/lamp|sconce|picture|cove|toe/.test(n)) return 'accent';
    if (/shelf|string|display/.test(n)) return 'decor';
    return 'ambient';
  }

  function create(D, opts = {}) {
    const S = D.S;
    const kinds = () => opts.kinds || (root && root.KIND_DEF) || null;
    const uid = opts.uid || (() => Math.random().toString(36).slice(2, 10));
    const levelOf = v => { if (v && typeof v === 'object') return Number(v.level) || 0; if (typeof v === 'number') return v; return v && v !== 'Off' ? 100 : 0; };
    const tsplit = t => (typeof t === 'string' && t.includes('|') ? t.split('|') : t);

    // ---------- a light's kind and role ----------
    function lightKind(id) { const K = kinds(); return K ? K.normalize(((S.config && S.config.settings.light_kinds) || {})[id]) : null; }
    function lightRole(id) { const r = ((S.config && S.config.settings.roles) || {})[id]; if (r) return r; const k = lightKind(id); const K = kinds(); return k && K ? K.ROLES[k] : null; }
    function kindLabel(k) { const K = kinds(); if (!K) return null; const x = K.KINDS[K.normalize(k)]; return x ? x.label : null; }

    // ---------- a room's lights ----------
    const roomLights = aid => D.controllable().filter(d => D.devArea(d) === aid && (d.domain === 'light' || d.domain === 'switch'));
    const roomDimmers = aid => roomLights(aid).filter(d => d.domain === 'light');
    function meanLevel(ids) { const xs = ids.map(id => D.level(id) || 0); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0; }
    const roomMean = aid => meanLevel(roomLights(aid).map(d => d.device_id));
    function litLights() { return D.controllable().filter(d => (d.domain === 'light' || d.domain === 'switch') && (D.level(d.device_id) || 0) > 0); }
    function houseLevel() { const ls = litLights(); return ls.length ? meanLevel(ls.map(d => d.device_id)) : 0; }
    // Is a sleep timer running over this light?
    function timerOn(id) { return Object.entries(S.timers || {}).some(([t, v]) => v && v.ends_at && D.targetDevices(tsplit(t)).includes(id)); }
    // The starred lights, in room order then by name: the row under the house card on Home. A home with nothing
    // starred has no row at all.
    function rowLights() {
      const order = new Map(D.areas().map((a, i) => [a.id, i])); const f = S.config.favorites;
      return D.controllable().filter(d => (d.domain === 'light' || d.domain === 'switch') && f.includes('d:' + d.device_id))
        .sort((a, b) => ((order.get(D.devArea(a)) ?? 999) - (order.get(D.devArea(b)) ?? 999)) || a.name.localeCompare(b.name));
    }

    // ---------- scenes ----------
    // The five used to fade over as much as eight seconds, and a scene keeps whatever fade it was made
    // with, so shortening the table alone would have left every scene already in a home still crawling.
    // A scene is brought forward only when it still holds exactly the number the app gave it and the
    // person has not been into it: anything they chose, at any length, is theirs. Idempotent by
    // construction, because after one pass nothing matches any more. Returns how many it changed.
    function shortenSuggestedFades() {
      let n = 0;
      for (const p of D.presets()) {
        if (!p.mood || p.edited) continue;
        if (p.fade === OLD_SUGGESTED_FADE[p.mood] && p.fade !== SUGGESTED_FADE) { p.fade = SUGGESTED_FADE; n++; }
      }
      return n;
    }
    // Levels per light for one of the five in a room. Switches are on only in Bright; fans and shades are left alone.
    function moodLevels(aid, mood) {
      const ds = roomLights(aid);
      const tagged = ds.some(d => lightRole(d.device_id));
      const out = {};
      if (mood.night) {
        for (const d of ds) out[d.device_id] = d.domain === 'switch' ? 0 : (tagged ? 0 : mood.head);
        if (tagged) {
          const dim = roomDimmers(aid);
          const acc = dim.find(d => lightRole(d.device_id) === 'accent');
          if (acc) out[acc.device_id] = 10;
          else { const amb = dim.find(d => (lightRole(d.device_id) || 'ambient') === 'ambient'); if (amb) out[amb.device_id] = 5; }
        }
        return out;
      }
      for (const d of ds) {
        if (d.domain === 'switch') out[d.device_id] = mood.sw ? 100 : 0;
        else if (!tagged) out[d.device_id] = mood.head;
        else out[d.device_id] = mood.roles[lightRole(d.device_id) || 'ambient'];
      }
      // one that would leave the room dark is not a look: the main light keeps a floor
      if (!Object.values(out).some(v => levelOf(v) > 0)) { const dim = roomDimmers(aid)[0]; if (dim) out[dim.device_id] = 15; }
      return out;
    }
    // Are the lights showing these levels right now (within a couple of percent)?
    function levelsMatch(lv) {
      const ids = Object.keys(lv).filter(D.dev); if (!ids.length) return false;
      // a look that leaves every light off is not a look: a dark room is dark, not "in Movie"
      if (!ids.some(id => levelOf(lv[id]) > 0)) return false;
      return ids.every(id => { const cur = D.level(id) || 0, want = levelOf(lv[id]); return D.dev(id).domain === 'switch' || D.dev(id).domain === 'fan' ? (cur > 0) === (want > 0) : Math.abs(cur - want) <= 2; });
    }
    // A room's scenes: every scene filed under that room, whoever made it. The five suggested ones lead, in
    // the order they are suggested in, and anything made by hand follows in the order it was made.
    //
    // `mood` on a scene is not a kind of thing any more. A scene is a scene; the field only notes which of
    // the five suggestions this one came from, so "back to the suggestion" and a later refresh know what to
    // put back. A scene without one is an ordinary scene that happens to live in a room, and everything in
    // the app treats the two the same.
    function roomScenes(aid) {
      const rank = p => { const i = MOOD_ORDER.indexOf(p.mood); return i < 0 ? MOOD_ORDER.length : i; };
      return D.presets().filter(p => p.area === aid).map((p, i) => ({ p, i }))
        .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p);
    }
    const roomHasScenes = aid => roomScenes(aid).length > 0;
    // The five a room is offered, specifically: what "make them again" refreshes and what the walk counts.
    const roomSuggested = aid => MOOD_ORDER.map(m => D.presets().find(p => p.area === aid && p.mood === m)).filter(Boolean);
    const roomHasSuggested = aid => roomSuggested(aid).length > 0;
    // The scene the room is in, by id. A room with no scenes of its own is still matched against the five
    // it would be offered, so the row that offers them can say which one the lights are already showing.
    function sceneMatch(aid) { const p = roomScenes(aid).find(x => levelsMatch(x.levels)); return p ? p.id : null; }
    function suggestedMatch(aid) { for (const m of MOODS) if (levelsMatch(moodLevels(aid, m))) return m.id; return null; }
    // A scene filed under a room carries the room in its name ("Kitchen · Relax"), which is right in a list
    // of every scene and repetition on the room's own page. Strip it there, and leave a name that never had
    // it alone.
    function sceneShortName(p) {
      const room = p && p.area ? D.areaName(p.area) : null;
      const n = (p && p.name) || '';
      return room && n.startsWith(`${room} · `) ? n.slice(room.length + 3) : n;
    }
    const presetMax = p => Math.max(0, ...Object.values(p.levels || {}).map(levelOf));
    // Write (or refresh) the five scenes a room is offered. One the person changed is left alone.
    function suggestScenes(aid) {
      let made = 0, kept = 0;
      for (const m of MOODS) {
        const p = D.presets().find(x => x.area === aid && x.mood === m.id);
        if (p && p.edited) { kept++; continue; }
        const name = `${D.areaName(aid)} · ${m.name}`.slice(0, 60);
        if (p) { p.levels = moodLevels(aid, m); p.fade = m.fade; p.name = name; }
        else S.config.presets.push({ id: uid(), name, levels: moodLevels(aid, m), fade: m.fade, area: aid, mood: m.id, edited: false });
        made++;
      }
      return { made, kept };
    }
    // Keep one of the five as a scene of its own (or refresh the one already kept, unless it has been edited
    // since). Returns the scene.
    function keepMoodScene(aid, mid) {
      const m = moodById(mid); if (!m) return null;
      const name = `${D.areaName(aid)} · ${m.name}`.slice(0, 60);
      let p = D.presets().find(x => x.area === aid && x.mood === mid && !x.edited);
      if (p) { p.levels = moodLevels(aid, m); p.fade = m.fade; p.name = name; }
      else { p = { id: uid(), name, levels: moodLevels(aid, m), fade: m.fade, area: aid, mood: mid, edited: false }; S.config.presets.push(p); }
      return p;
    }

    // ---------- rooms ----------
    // Every device the app can file in a room: the lights, switches, fans, shades and the remotes.
    const fileable = () => [...D.controllable(), ...D.remotes()];
    const roomById = id => (id ? D.appRooms().find(r => r.id === id) || null : null);
    // A short "· Hue" / "· Nanoleaf" suffix for a device row, or nothing for a plain Lutron device.
    function bridgeTag(deviceId) {
      const id = String(deviceId);
      if (id.startsWith('hue_')) return ' · Hue';
      if (id.startsWith('nanoleaf_')) return ' · Nanoleaf';
      return '';
    }
    // The bridges' rooms become the app's, ids and all. Keeping each bridge room's own id is what makes this free:
    // `a:20` still means the Kitchen, the Kitchen's scenes are still the Kitchen's. This runs once, ever, per home
    // (settings.rooms_seeded marks it done): after that, a room here comes only from this app. A room made since in
    // the Lutron app or the Hue app is never imported on its own; its devices are simply unfiled until they are put
    // in one of the person's own rooms. Returns true when it changed the config, which the caller then saves.
    function ensureRooms() {
      const s = S.config && S.config.settings; if (!s) return false;
      let changed = false;
      if (!s.rooms_seeded) {
        if ((s.rooms || []).length) {
          // a home from before this flag existed: it has already been seeded, once, in the past. Mark it done
          // without importing anything more, rather than treating "the flag is missing" as "seed once again",
          // which would be one more of exactly the re-adds this flag exists to stop.
          s.rooms_seeded = true;
          changed = true;
        } else {
          const fresh = Object.values(S.inv.areas || {})
            .filter(a => a && a.id && a.name)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .map(a => ({ id: String(a.id), name: String(a.name).slice(0, 40), device_ids: [], bridge_area: String(a.id).startsWith('hue_') ? null : String(a.id), hue_room: String(a.id).startsWith('hue_') ? String(a.id) : null }));
          if (!fresh.length) return false;   // no bridge has answered with a room yet: try again once one does
          s.rooms = fresh;
          s.rooms_seeded = true;
          changed = true;
        }
      }
      if (pruneRooms()) changed = true;
      return changed;
    }
    // A device the bridges have stopped reporting leaves its room quietly. Never while the home is not answering:
    // an empty inventory is a connector that is still coming back, not a house with no lights in it.
    function pruneRooms() {
      const s = S.config && S.config.settings; if (!s || !(s.rooms || []).length) return false;
      const known = S.inv.devices || {};
      if (!Object.keys(known).length) return false;
      let changed = false;
      for (const r of s.rooms) {
        const keep = (r.device_ids || []).filter(id => known[id]);
        if (keep.length !== (r.device_ids || []).length) { r.device_ids = keep; changed = true; }
      }
      return changed;
    }

    const HOME = {
      lightKind, lightRole, kindLabel,
      roomLights, roomDimmers, meanLevel, roomMean, litLights, houseLevel, timerOn, rowLights,
      shortenSuggestedFades, moodLevels, levelsMatch, roomScenes, roomHasScenes, roomSuggested, roomHasSuggested,
      sceneMatch, suggestedMatch, sceneShortName, presetMax, suggestScenes, keepMoodScene,
      fileable, roomById, bridgeTag, ensureRooms, pruneRooms,
    };
    // describe() names a loop of scenes for its room only when it holds all of that room's scenes.
    D.hooks.roomScenes = roomScenes;
    return HOME;
  }

  const CasetaHome = { create, SUGGESTED_FADE, MOODS, OLD_SUGGESTED_FADE, MOOD_ORDER, moodById, ROLE_LABEL, ROLE_CAP, ROLE_CHIPS, guessRole };
  if (typeof module !== 'undefined' && module.exports) module.exports = CasetaHome;
  if (root) root.CasetaHome = CasetaHome;
})(typeof window !== 'undefined' ? window : null);
