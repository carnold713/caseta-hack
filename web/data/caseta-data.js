/* Caseta data layer: the app's state, its transport and every question it asks of that state, with no DOM in it.

   Phase 1 of the Copper Night rebuild (docs/design-spec-v6.md). Everything here used to live in web/js/core.js
   between the sheet code and the render dispatcher. It is pulled out so that the old UI and the new one run on
   the same layer, and so the rules that matter can be tested without a browser: an empty inventory never blanks
   a known home, a config the hub echoes back is not news, the connection is quiet for ten seconds before it is
   red, and a finger on a slider sends one command per light at a time with the newest value winning.

   One file for every host, the same as web/js/kinds.js: the old UI loads it as a plain <script> and gets
   `window.CasetaData`, the tests `require` it, and the new UI imports it through web/data/index.js.

   `create(deps)` builds one instance. Everything the layer would otherwise reach for in the browser is handed
   in, so a test can hand in a fake: fetch, WebSocket, storage, location, a clock, setTimeout. Nothing here
   draws, toasts or renders. Where the old code did one of those in the middle of a data rule, the rule is here
   and the drawing is left to the caller, which gets back enough to know what to redraw. */
(function (root) {
  'use strict';

  // The first ten seconds of a drop are quiet: a grey dot, nothing else changes. Only after that is anything red.
  const RECONNECT_GRACE = 10000;
  // How long after a slider sends a value the bridge's own echo of an older one is ignored.
  const ECHO_QUIET = 1500;
  // How long a dropped socket waits before dialling again.
  const RECONNECT_AFTER = 2000;
  // The activity list keeps this many entries, newest first.
  const ACTIVITY_MAX = 100;

  // Pico button labels by LEAP button number (what the bridge reports). Cosmetic only.
  const MODEL_NAMES = { Pico1Button: '1-button remote', Pico2Button: '2-button remote', Pico2ButtonRaiseLower: '2-button remote with dimming', Pico3Button: '3-button remote', Pico3ButtonRaiseLower: '3-button remote with dimming', Pico4Button: '4-button remote', Pico4ButtonScene: '4-button scene remote', Pico4ButtonZone: '4-button remote', Pico4Button2Group: '4-button remote', PaddleSwitchPico: 'Paddle remote' };
  const LAYOUTS = {
    Pico2Button: { 0: 'On', 2: 'Off' }, PaddleSwitchPico: { 0: 'On', 2: 'Off' },
    Pico2ButtonRaiseLower: { 0: 'On', 2: 'Off', 3: 'Raise', 4: 'Lower' },
    Pico3Button: { 0: 'On', 1: 'Round', 2: 'Off' }, Pico3ButtonRaiseLower: { 0: 'On', 1: 'Round', 2: 'Off', 3: 'Raise', 4: 'Lower' },
    Pico4Button: { 1: '1', 2: '2', 3: '3', 4: '4' }, Pico4ButtonScene: { 0: '1', 1: '2', 2: '3', 3: '4' }, Pico4ButtonZone: { 0: '1', 1: '2', 2: '3', 3: '4' },
    Pico4Button2Group: { 0: 'A on', 1: 'A off', 2: 'B on', 3: 'B off' }, Pico1Button: { 0: 'Button' },
  };
  const GESTURE_LABEL = { single: 'Press', double: 'Press twice', hold: 'Hold' };

  // ---------- small pure helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function fmtDur(s) { return s >= 60 ? `${Math.round(s / 60)} min` : `${s} ${s === 1 ? 'second' : 'seconds'}`; }
  function fanName(s) { return { Off: 'off', Low: 'low', Medium: 'medium', MediumHigh: 'medium-high', High: 'high' }[s] || s; }
  function fmtTime(hm) { const [h, m] = hm.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${ap}`; }
  // A scene's entry for a light is a number, a fan speed, or {level, kelvin?, hex?} for a Hue lamp with its colour.
  function levelOf(v) { if (v && typeof v === 'object') return Number(v.level) || 0; if (typeof v === 'number') return v; return v && v !== 'Off' ? 100 : 0; }
  function colorOf(v) { if (!v || typeof v !== 'object') return null; if (v.follow === true) return { follow: true }; if (v.kelvin != null) return { mode: 'ct', kelvin: v.kelvin }; if (v.hex) return { mode: 'xy', hex: v.hex }; return null; }
  // Targets: d:<device> a:<area> g:<group> h:all, or a list of those; favorites also allow p:<preset> s:<lutron scene>
  const tlist = t => (Array.isArray(t) ? t : t ? [t] : []);
  const tsplit = t => (typeof t === 'string' && t.includes('|') ? t.split('|') : t);
  // The user sees three gestures. "Hold" may be stored as hold (on release) or as hold_start + hold_end (while holding).
  function userGestureOf(b) { return b.gesture === 'hold_start' || b.gesture === 'hold_end' ? 'hold' : b.gesture; }
  function friendlyError(msg) {
    if (/agent is offline/i.test(msg)) return "Can't reach your home right now. Is the home connector running?";
    if (/did not answer/i.test(msg)) return 'Your home did not respond. Try again in a moment.';
    if (/unknown (preset|group)/i.test(msg)) return 'That points at something that no longer exists. Pick it again.';
    return msg;
  }

  function create(deps = {}) {
    const now = deps.now || (() => Date.now());
    const later = deps.setTimeout || ((f, ms) => setTimeout(f, ms));
    const storage = deps.storage || null;
    // Things only the caller can answer, looked up when they are needed rather than when this is built: the old
    // UI defines them in files that load after this one.
    const hooks = { roomScenes: null, signedOut: null };

    const S = {
      token: (storage && storage.getItem('token')) || '',
      inv: { devices: {}, buttons: {}, scenes: {}, areas: {}, bridge: null, updated: null },
      states: {}, timers: {}, activity: [],
      config: null,
      agent: { online: false, info: null },
      ready: false, ws: null,
      live: {}, lastSaved: null,
      add: null,
      sun: null, nextRuns: {}, // today's sun and the next run of each automation, from the connector
      // "Follow the day" as the connector sees it (which lamps, which were set by hand, the white each shows), and how
      // far this phone's clock is from the home's, so the curve is read at the home's own time.
      follow: null, sunSkew: 0,
      // A drop is quiet until it has lasted: `troubleSince` is when the socket or the connector last went away.
      // Nothing turns red until RECONNECT_GRACE has passed, and the app never blanks what it already knows.
      troubleSince: 0, wsOpen: false,
    };

    // ---------- connection ----------
    // 'ok' while the connector is there, 'reconnecting' for the first ten seconds of trouble, 'off' after that.
    function connState() {
      if (S.agent.online && S.wsOpen) return 'ok';
      if (!S.troubleSince) return S.agent.online ? 'ok' : 'off';
      return now() - S.troubleSince < RECONNECT_GRACE ? 'reconnecting' : 'off';
    }
    const connOk = () => connState() === 'ok';
    const connLost = () => connState() === 'off';
    // Called whenever the socket or the connector changes state: starts or clears the quiet window. Returns
    // 'started' when a window has just opened, so the caller can book the one repaint that turns the dot red when
    // it runs out; 'cleared' when trouble has ended; null when nothing changed.
    function noteConn(ok) {
      if (ok) { const was = !!S.troubleSince; S.troubleSince = 0; return was ? 'cleared' : null; }
      if (S.troubleSince) return null;
      S.troubleSince = now();
      return 'started';
    }

    // The home's clock, as an offset from this phone's: the connector sends the time in the home's own zone with every
    // sun message, and "Follow the day" reads the curve at that time rather than at whatever the phone thinks it is.
    function noteSunClock() {
      const iso = S.sun && S.sun.now; if (!iso) return;
      const t = new Date(iso); if (isNaN(t.getTime())) return;
      S.sunSkew = now() - t.getTime();
    }

    // ---------- the socket's messages, applied to the state ----------
    // Returns what the message was and whether it changed anything the screen shows, so the caller decides what
    // to redraw. The rules about what counts as news live here; the drawing does not.
    const hasDevices = inv => Object.keys((inv && inv.devices) || {}).length > 0;
    function apply(m) {
      switch (m.type) {
        case 'snapshot': {
          const firstReady = !S.ready;
          S.add = m.add || null;
          // A hub that has just restarted has an empty inventory until its connector is back. Keep the home we
          // already know rather than blanking the app for the minute that takes.
          const kept = !hasDevices(m.inventory) && hasDevices(S.inv);
          if (!kept) { S.inv = m.inventory; S.states = m.states; S.timers = m.timers || {}; }
          S.agent = m.agent; S.activity = m.activity || [];
          S.sun = m.sun || null; S.nextRuns = m.next_runs || {}; noteSunClock();
          S.follow = m.follow || null;
          S.config = m.config; S.lastSaved = JSON.stringify(m.config); S.ready = true;
          S.wsOpen = true;
          const conn = noteConn(!!(m.agent && m.agent.online));
          return { type: 'snapshot', changed: true, firstReady, keptHome: kept, conn };
        }
        // the same rule: an empty list from a hub that is still waiting for its connector is not news
        case 'inventory': {
          if (!hasDevices(m.inventory) && hasDevices(S.inv)) return { type: 'inventory', changed: false, keptHome: true };
          S.inv = m.inventory; return { type: 'inventory', changed: true };
        }
        case 'state': Object.assign(S.states, m.states); return { type: 'state', changed: true };
        case 'timers': S.timers = m.timers || {}; return { type: 'timers', changed: true };
        // The hub broadcasts every save to every phone, including the one that made it. That echo is not news.
        case 'config': {
          const text = JSON.stringify(m.config);
          if (text === S.lastSaved) return { type: 'config', changed: false };
          S.config = m.config; S.lastSaved = text; return { type: 'config', changed: true };
        }
        case 'agent': {
          S.agent = { online: m.online, info: m.info || null };
          return { type: 'agent', changed: true, conn: noteConn(!!m.online) };
        }
        case 'activity': {
          S.activity.unshift(m.entry); S.activity.length = Math.min(S.activity.length, ACTIVITY_MAX);
          return { type: 'activity', changed: true, entry: m.entry };
        }
        // after every config change and every ten minutes: the sun, the curve level and the next runs
        case 'sun': S.sun = m.sun || null; S.nextRuns = m.next_runs || {}; noteSunClock(); return { type: 'sun', changed: true };
        // which lamps are following the day, and the white each one is showing
        case 'follow': S.follow = m.follow || null; return { type: 'follow', changed: true };
        case 'button': case 'gesture': return { type: m.type, changed: true, key: noteLive(m) };
        // add_state, add_heard, add_log, nanoleaf_log, toast: nothing of the app's state, handed straight on
        default: return { type: m.type, changed: false, passThrough: true };
      }
    }

    // A press on a real remote: which button, what it did, and when. Returns the `<device>/<button>` key.
    function noteLive(m) {
      const key = `${m.device_id}/${m.button_number}`;
      const cur = S.live[key] || {};
      if (m.type === 'button') { cur.event = m.event; cur.at = now(); }
      else { cur.gesture = m.gesture; cur.at = now(); cur.bound = m.bound; }
      S.live[key] = cur;
      return key;
    }

    // ---------- transport ----------
    async function api(path, opts = {}) {
      const doFetch = deps.fetch || fetch;
      const res = await doFetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${S.token}`, ...(opts.headers || {}) } });
      if (res.status === 401) {
        S.token = ''; if (storage) storage.removeItem('token');
        if (hooks.signedOut) hooks.signedOut();
        throw new Error('Signed out');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(friendlyError(body.error || `${res.status}`));
      return body;
    }
    // Run one action now. Throws with a message fit to show when it cannot.
    function run(action) { return api('/api/command', { method: 'POST', body: JSON.stringify(action) }); }

    // While a finger is moving: one command in flight per target and kind (brightness, colour), the newest value
    // always goes next and everything between is dropped. Echoes from the bridge are ignored for a moment after.
    // `send` is how a command goes out; the old UI hands in its own, which shows a toast when one fails.
    function gate(send) {
      const LV = { inflight: {}, latest: {}, quiet: {} };
      function sendGated(key, target, action) {
        LV.latest[key] = { target, action };
        if (LV.inflight[key]) return LV.inflight[key];
        LV.inflight[key] = (async () => {
          while (LV.latest[key]) {
            const p = LV.latest[key]; delete LV.latest[key];
            await send(p.action);
            LV.quiet[JSON.stringify(p.target)] = now() + ECHO_QUIET;
            for (const t of Array.isArray(p.target) ? p.target : [p.target]) LV.quiet[JSON.stringify(t)] = now() + ECHO_QUIET;
          }
          delete LV.inflight[key];
        })();
        return LV.inflight[key];
      }
      const sendLevel = (target, level, extra) => sendGated(JSON.stringify(target), target, { type: 'level', target, level, fade: 0, ...(extra || {}) });
      // Colour or white temperature for a Hue lamp: payload is {kelvin} or {hex}, with an optional level.
      const sendColor = (target, payload) => sendGated('color:' + JSON.stringify(target), target, { type: 'color', target, fade: 0, ...payload });
      // True while a target was set from this phone recently: the bridge's own echo must not pull the slider back.
      const levelQuiet = target => { const q = LV.quiet[JSON.stringify(target)]; return !!(q && q > now()); };
      return { sendGated, sendLevel, sendColor, levelQuiet };
    }

    // Save the whole config. The hub validates it and hands back what it stored, which becomes the config. Returns
    // the config as it was before, as text, so the caller can offer Undo; throws when the save did not happen.
    async function saveConfig() {
      const prev = S.lastSaved;
      const r = await api('/api/config', { method: 'PUT', body: JSON.stringify(S.config) });
      S.config = r.config; S.lastSaved = JSON.stringify(r.config);
      return { prev };
    }
    // Put back a config as it was before, ready for saveConfig(). Undo is exactly this and a save.
    function restoreConfig(prevText) { S.config = JSON.parse(prevText); }

    // The socket. The server speaks and this listens: every write goes over HTTP. `on.message(m, result)` gets each
    // message after it has been applied. A dropped socket dials again after two seconds for as long as there is a
    // token, and keeps what it knows on screen meanwhile (on.close).
    function connectWS(on = {}) {
      const WS = deps.WebSocket || WebSocket;
      const loc = deps.location || location;
      if (S.ws) { try { S.ws.onclose = null; S.ws.close(); } catch (_) { /* ignore */ } }
      const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WS(`${proto}://${loc.host}/ws/app?token=${encodeURIComponent(S.token)}`);
      S.ws = ws;
      ws.onopen = () => { S.wsOpen = true; if (on.open) on.open(); };
      ws.onmessage = ev => { const m = JSON.parse(ev.data); const r = apply(m); if (on.message) on.message(m, r); };
      // The hub restarting looks like this. Stay quiet: keep what we know on screen, say "Reconnecting" for ten
      // seconds, and only then admit that the home is not there.
      ws.onclose = () => {
        S.wsOpen = false; const conn = noteConn(false);
        if (on.close) on.close(conn);
        later(() => { if (S.token) connectWS(on); }, RECONNECT_AFTER);
      };
      return ws;
    }

    // ---------- inventory ----------
    // A device removed from the app stays hidden even when the bridge goes on listing it: some bridges keep a
    // deleted remote in their own list until it is unpaired there, and it should not come back on the next refresh.
    const hiddenDevices = () => ((S.config && S.config.settings && S.config.settings.hidden_devices) || []);
    const devices = () => { const hide = hiddenDevices(); return Object.values(S.inv.devices || {}).filter(d => !hide.includes(d.device_id)); };
    const dev = id => (S.inv.devices || {})[id];

    // ---------- rooms the app owns ----------
    // settings.rooms is the truth about rooms once it exists: the app's own list, seeded from the bridges the first
    // time it is needed (ensureRooms in js/rooms.js) and edited from the Rooms page. While it is empty the app reads
    // the bridges exactly as it always did, so a home that never opens Rooms sees no change at all.
    const appRooms = () => ((S.config && S.config.settings && S.config.settings.rooms) || []);
    const appRoom = id => appRooms().find(r => r.id === id) || null;
    // Which app room a device is in: the room that names it, else the room standing for its bridge room, else
    // Elsewhere. Built once per config and inventory (both are replaced wholesale, so identity is a safe cache key).
    let RIDX = { rooms: null, devs: null, byDevice: null, byArea: null };
    function roomIndex() {
      const rooms = appRooms(); const devs = S.inv.devices || {};
      if (RIDX.rooms === rooms && RIDX.devs === devs) return RIDX;
      const byDevice = new Map(), byArea = new Map();
      for (const r of rooms) for (const id of (r.device_ids || [])) if (!byDevice.has(id)) byDevice.set(id, r.id);
      for (const r of rooms) {
        if (r.bridge_area && !byArea.has(r.bridge_area)) byArea.set(r.bridge_area, r.id);
        if (r.hue_room && !byArea.has(r.hue_room)) byArea.set(r.hue_room, r.id);
      }
      RIDX = { rooms, devs, byDevice, byArea };
      return RIDX;
    }
    // The room id to file a device under: the app room that names it, the app room standing for its bridge room,
    // or the bridge room itself when the app has not taken that one over (a Hue bridge paired after the list was
    // made, a room added in the Lutron app since). `d` may be a bare {} (a device that has gone).
    function devArea(d) {
      if (!d) return 'none';
      if (!appRooms().length) return d.area || 'none';
      const ix = roomIndex();
      return ix.byDevice.get(d.device_id) || ix.byArea.get(d.area) || d.area || 'none';
    }
    // A room's name, whether the id is one of the app's rooms or a bridge area.
    function areaName(id) {
      const r = appRoom(id);
      if (r) return r.name;
      return ((S.inv.areas || {})[id] || {}).name || 'Elsewhere';
    }
    const devAreaName = d => areaName(devArea(d));
    function byName(a, b) { return (devAreaName(a) + a.name).localeCompare(devAreaName(b) + b.name); }
    const controllable = () => devices().filter(d => ['light', 'switch', 'fan', 'cover'].includes(d.domain)).sort(byName);
    const remotes = () => devices().filter(d => d.domain === 'pico').sort(byName);
    // Every room, in name order: the app's own list (an empty room still shows, because the person made it and it is
    // where the next light goes), then any room the app has not taken over that something is actually in, then
    // Elsewhere for anything in no room at all. With no app list this is exactly what it always was.
    function areas() {
      const out = appRooms().map(r => ({ id: r.id, name: r.name }));
      const have = new Set(out.map(o => o.id));
      for (const id of new Set(controllable().map(devArea))) {
        if (have.has(id)) continue;
        have.add(id);
        out.push({ id, name: id === 'none' ? 'Elsewhere' : areaName(id) });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }
    const level = id => { const s = S.states[id]; return s && s.level != null ? s.level : null; };
    const isOn = id => (level(id) || 0) > 0 || !!((S.states[id] || {}).fan_speed && S.states[id].fan_speed !== 'Off');
    const buttonsOf = pid => Object.values(S.inv.buttons || {}).filter(b => b.device_id === pid).sort((a, b) => a.button_number - b.button_number);
    const groups = () => (S.config && S.config.groups) || [];
    const presets = () => (S.config && S.config.presets) || [];
    const lutronScenes = () => Object.values(S.inv.scenes || {});

    // ---------- targets ----------
    function targetDevices(t) {
      if (Array.isArray(t)) return [...new Set(t.flatMap(targetDevices))];
      if (!t) return [];
      const [k, id] = [t.slice(0, 1), t.slice(2)];
      if (k === 'd') return dev(id) ? [id] : [];
      if (k === 'a') return controllable().filter(d => devArea(d) === id && d.domain !== 'cover').map(d => d.device_id);
      if (k === 'g') { const g = groups().find(x => x.id === id); return g ? g.device_ids.filter(dev) : []; }
      if (t === 'h:all') return controllable().filter(d => d.domain === 'light' || d.domain === 'switch').map(d => d.device_id);
      if (t === 'h:shades') return controllable().filter(d => d.domain === 'cover').map(d => d.device_id);
      if (t === 'h:fans') return controllable().filter(d => d.domain === 'fan').map(d => d.device_id);
      return [];
    }
    function targetName(t) {
      if (Array.isArray(t)) { const names = t.map(targetName); return names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', '); }
      if (!t) return 'nothing';
      if (t === 'h:all') return 'everything';
      if (t === 'h:shades') return 'the shades';
      if (t === 'h:fans') return 'the fans';
      const [k, id] = [t.slice(0, 1), t.slice(2)];
      if (k === 'd') return dev(id) ? dev(id).name : 'a light that is gone';
      if (k === 'a') return id === 'none' ? 'Elsewhere' : areaName(id);
      if (k === 'g') { const g = groups().find(x => x.id === id); return g ? g.name : 'a set of lights that is gone'; }
      if (k === 'p') { const p = presets().find(x => x.id === id); return p ? p.name : 'a scene that is gone'; }
      if (k === 's') { const s = (S.inv.scenes || {})[id]; return s ? s.name : 'a scene that is gone'; }
      return t;
    }
    const targetOn = t => targetDevices(t).some(isOn);
    function targetExists(t) {
      if (Array.isArray(t)) return t.length > 0 && t.every(targetExists);
      if (t === 'h:all' || t === 'h:shades' || t === 'h:fans') return true;
      const [k, id] = [t.slice(0, 1), t.slice(2)];
      if (k === 'd') return !!dev(id);
      if (k === 'a') return areas().some(a => a.id === id);
      if (k === 'g') return groups().some(g => g.id === id);
      if (k === 'p') return presets().some(p => p.id === id);
      if (k === 's') return !!(S.inv.scenes || {})[id];
      return false;
    }
    // All pickable targets, rooms first, then individual lights inside each room.
    function targetOptions(opts = {}) {
      const out = [];
      if (!opts.noAll) out.push({ id: 'h:all', name: 'Everything', sub: 'every light in the house', kind: 'all' });
      for (const a of areas()) {
        const ds = controllable().filter(d => devArea(d) === a.id);
        if (opts.fansOnly && !ds.some(d => d.domain === 'fan')) continue;
        if (!opts.fansOnly && !opts.noRooms && ds.some(d => d.domain !== 'cover')) out.push({ id: `a:${a.id}`, name: a.name, sub: `${ds.filter(d => d.domain !== 'cover').length} lights`, kind: 'room' });
        for (const d of ds) if (!opts.fansOnly || d.domain === 'fan') out.push({ id: `d:${d.device_id}`, name: d.name, sub: a.name, kind: d.domain });
      }
      for (const g of groups()) out.push({ id: `g:${g.id}`, name: g.name, sub: `${g.device_ids.length} lights`, kind: 'group' });
      return out;
    }
    // True when every device a target names is a shade (so raise and lower read as open and close).
    function isShadeTarget(t) { if (t === 'h:shades') return true; const ids = targetDevices(t); return ids.length > 0 && ids.every(id => (dev(id) || {}).domain === 'cover'); }

    // ---------- remotes ----------
    const modelName = d => MODEL_NAMES[d.type] || 'Remote';
    const buttonLabel = (pid, n) => { const d = dev(pid); const l = d && LAYOUTS[d.type]; return (l && l[n]) || `Button ${n + 1}`; };
    const buttonTitle = (pid, n) => { const l = buttonLabel(pid, n); return /^\d$/.test(l) ? `button ${l}` : `${l} button`; };
    const bindings = () => (S.config && S.config.bindings) || [];
    const bindingsFor = (pid, n) => bindings().filter(b => b.device_id === pid && b.button_number === n);
    const binding = (pid, n, g) => bindingsFor(pid, n).find(b => b.gesture === g);
    const holdBindings = (pid, n) => bindingsFor(pid, n).filter(b => userGestureOf(b) === 'hold');

    // Plain-language summary of an action list.
    function describe(actions) {
      if (!actions || !actions.length) return '';
      const parts = actions.map(a => {
        const t = a.target ? targetName(a.target) : '';
        switch (a.type) {
          case 'level': {
            if (a.level === 'toggle') return `Turns ${t} on or off`;
            if (a.level === 'on') return `Turns ${t} on`;
            if (a.level === 'off' || a.level === 0) return a.fade >= 5 ? `Fades ${t} off over ${fmtDur(a.fade)}` : `Turns ${t} off`;
            return a.fade >= 5 ? `Fades ${t} to ${a.level}% over ${fmtDur(a.fade)}` : `Sets ${t} to ${a.level}%`;
          }
          case 'restore': return `Puts ${t} back the way it was`;
          case 'step': return a.delta > 0 ? `Makes ${t} a little brighter` : `Makes ${t} a little dimmer`;
          case 'cycle': return `Steps ${t} through ${a.levels.map(l => l === 0 ? 'off' : l + '%').join(', ')}`;
          case 'raise': return isShadeTarget(a.target) ? `Opens ${t}` : `Brightens ${t} while holding`;
          case 'lower': return isShadeTarget(a.target) ? `Closes ${t}` : `Dims ${t} while holding`;
          case 'stop': return `Stops ${t}`;
          case 'cap': return `Lowers ${t} to ${a.level}% where it is brighter`;
          case 'cycle_presets': {
            const ids = a.preset_ids || [];
            const p = presets().find(x => x.id === ids[0]);
            const back = a.dir === -1 ? ' backwards' : '';
            // A room's name is only honest when the loop holds every one of that room's scenes. Some of them
            // are a list somebody chose, and it reads as the count.
            const rs = hooks.roomScenes && p && p.area ? hooks.roomScenes(p.area) : null;
            const whole = !!rs && (m => m.length === ids.length && m.every((v, i) => v === ids[i]))(rs.map(x => x.id));
            return whole ? `Steps${back} through ${areaName(p.area)}'s scenes` : `Steps${back} through ${plural(ids.length, 'scene')}`;
          }
          case 'fan': return a.speed === 'Off' ? `Turns ${t}${t === 'the fans' ? '' : ' fan'} off` : `Sets ${t}${t === 'the fans' ? '' : ' fan'} to ${fanName(a.speed)}`;
          case 'scene': return `Runs the ${targetName('s:' + a.scene_id)} scene`;
          case 'preset': return `Runs the ${targetName('p:' + a.preset_id)} scene`;
          case 'timer': return `Turns ${t} ${a.level ? 'to ' + a.level + '%' : 'off'} after ${a.minutes} min`;
          case 'cancel_timer': return `Cancels the timer on ${t}`;
          case 'delay': return `waits ${a.ms >= 1000 ? (a.ms / 1000) + ' s' : a.ms + ' ms'}`;
          default: return a.type;
        }
      });
      const kept = parts.filter((x, i) => i === 0 || x !== parts[i - 1]);
      return cap(kept.map((x, i) => (i ? x.charAt(0).toLowerCase() + x.slice(1) : x)).join(', then '));
    }

    // ---------- summaries ----------
    // The mean level of a room's lights, with optional stand-in levels (a drag not yet sent).
    function roomMeanLevel(aid, overrides = {}) {
      const ds = controllable().filter(d => devArea(d) === aid && d.domain !== 'cover');
      if (!ds.length) return 0;
      return ds.reduce((a, d) => a + (overrides[d.device_id] ?? level(d.device_id) ?? 0), 0) / ds.length;
    }
    function roomSummary(aid) {
      const ds = controllable().filter(d => devArea(d) === aid);
      const on = ds.filter(d => isOn(d.device_id)).length;
      if (!ds.length) return 'No lights yet';   // a room the person just made, waiting for its first light
      return on ? `${on} of ${ds.length} on` : `${ds.length} ${ds.length === 1 ? 'light' : 'lights'} · all off`;
    }
    function tileSub(t) {
      const ds = targetDevices(t);
      if (t.startsWith('d:')) { const d = dev(t.slice(2)); if (!d) return ''; if (d.domain === 'fan') return fanName((S.states[d.device_id] || {}).fan_speed || 'Off'); const v = level(d.device_id); return v == null ? '' : v === 0 ? 'Off' : `${v}%`; }
      const on = ds.filter(isOn).length; return on ? `${on} on` : 'Off';
    }

    return {
      S, hooks,
      // connection
      connState, connOk, connLost, noteConn, noteSunClock,
      // the socket and the wire
      apply, noteLive, api, run, gate, saveConfig, restoreConfig, connectWS,
      // inventory and rooms
      hiddenDevices, devices, dev, appRooms, appRoom, roomIndex, devArea, devAreaName, areaName, areas,
      controllable, remotes, byName, level, isOn, buttonsOf, groups, presets, lutronScenes,
      // targets
      targetDevices, targetName, targetOn, targetExists, targetOptions, isShadeTarget,
      // remotes
      modelName, buttonLabel, buttonTitle, bindings, bindingsFor, binding, holdBindings,
      // words
      describe, roomMeanLevel, roomSummary, tileSub,
    };
  }

  const CasetaData = {
    create,
    RECONNECT_GRACE, ECHO_QUIET, RECONNECT_AFTER, ACTIVITY_MAX,
    MODEL_NAMES, LAYOUTS, GESTURE_LABEL,
    esc, uid, clamp, cap, plural, fmtDur, fanName, fmtTime, levelOf, colorOf, tlist, tsplit, userGestureOf, friendlyError,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CasetaData;
  if (root) root.CasetaData = CasetaData;
})(typeof window !== 'undefined' ? window : null);
