/* Caseta data layer, part six: routines. A routine is a config.schedules entry; one that turns something on and
   off again is two entries, the second with the first's id and "-off" after it, folded into one routine everywhere
   the app shows it. This file owns time in the home's own zone, the sentences a routine is said in, when each runs
   next and skipping it, the ready-made things a routine can do, the three guided setups, and the evening wind-down.
   Nothing here draws or saves.

   Moved from web/js/automations.js for Copper Night. The old UI keeps its own copy until it is retired to /classic/.
   The words the person sees say "routine"; the stored name is still "schedules", which is the hub's.

   Same shape as the others: a plain <script> gets window.CasetaRoutines, a test `require`s it. */
(function (root) {
  'use strict';

  const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  // Monday first, the way the file draws the days
  const WEEK = [1, 2, 3, 4, 5, 6, 0];
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const QUICK_DAYS = { all: ALL_DAYS, weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };
  const pad2 = n => String(n).padStart(2, '0');
  const hmMin = hm => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const minHm = m => { const t = ((m % 1440) + 1440) % 1440; return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`; };
  const hmAdd = (hm, mins) => minHm(hmMin(hm) + mins);
  // "6:30 am", "11:00 pm": the file always writes the minutes and a space before am or pm.
  function fmtTime(hm) { if (!hm) return ''; const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${pad2(m)} ${h >= 12 ? 'pm' : 'am'}`; }

  // Port of winddown_level() in agent/engine.py: the night level in the night hours, a soft early morning, full until
  // dimming starts, then a straight line down to the quiet time.
  function inWindow(now, start, end) { if (start === end) return false; return start < end ? (now >= start && now < end) : (now >= start || now < end); }
  function winddownLevel(nowHm, startHm, nightStart, nightEnd, fromLevel, toLevel, nightLevel, morningLevel = 100, morningUntil = '07:30') {
    if (inWindow(nowHm, nightStart, nightEnd)) return nightLevel;
    if (hmMin(nightEnd) <= hmMin(nowHm) && hmMin(nowHm) < hmMin(morningUntil)) return morningLevel;
    const now = hmMin(nowHm), start = hmMin(startHm), ns = hmMin(nightStart);
    if (ns <= start) return now < start ? fromLevel : toLevel;
    if (now < start) return fromLevel;
    if (now >= ns) return toLevel;
    return Math.round(fromLevel + (toLevel - fromLevel) * ((now - start) / (ns - start)));
  }

  function create(D, H, R, opts = {}) {
    const S = D.S;
    const uid = opts.uid || (() => Math.random().toString(36).slice(2, 10));
    const now = opts.now || (() => Date.now());
    const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const tlist = t => (Array.isArray(t) ? t : t ? [t] : []);
    const packTarget = list => (list.length === 1 ? list[0] : list.slice());
    const settings = () => S.config.settings;

    // ---------- time, in the home's zone ----------
    function phoneTZ() { try { return (opts.phoneTZ && opts.phoneTZ()) || Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (_) { return null; } }
    function homeTZ() { const tz = S.config && settings().timezone; if (!tz) return undefined; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (_) { return undefined; } }
    // "Mountain", "Pacific", or the city of a zone with no everyday name
    function zoneName(tz) {
      if (!tz) return '';
      try {
        const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' }).formatToParts(new Date(now())).find(x => x.type === 'timeZoneName');
        if (p && !/^GMT/.test(p.value)) return p.value.replace(/ (Standard )?Time$/, '');
      } catch (_) { /* fall through */ }
      return tz.split('/').pop().replace(/_/g, ' ');
    }
    // Calendar date, clock time and weekday of an instant, as the home's clock reads them.
    function zparts(d) {
      const o = {};
      try { for (const p of new Intl.DateTimeFormat('en-US', { timeZone: homeTZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)) o[p.type] = p.value; }
      catch (_) { return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }; }
      return { date: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour === '24' ? '00' : o.hour}:${o.minute}` };
    }
    const dayNum = date => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000;
    const weekdayOf = date => new Date(date + 'T12:00:00Z').getUTCDay();
    const today = () => zparts(new Date(now())).date;
    const nowHm = () => zparts(new Date(now())).hm;
    const addDays = (date, n) => { const d = new Date((dayNum(date) + n) * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
    // "today", "tomorrow", "Monday"
    function dayRel(date) { const diff = dayNum(date) - dayNum(today()); if (diff === 0) return 'today'; if (diff === 1) return 'tomorrow'; if (diff === -1) return 'yesterday'; return DAY_LONG[weekdayOf(date)]; }
    // The day a skip is for, said the way a person would: "tonight" for this evening, else the day.
    function skipWord(date, hm) { const rel = dayRel(date); return rel === 'today' ? (hm && hmMin(hm) >= 17 * 60 ? 'tonight' : 'today') : rel; }
    function runInfo(iso) {
      if (!iso) return null;
      const d = new Date(iso); if (isNaN(d.getTime())) return null;
      const z = zparts(d);
      return { t: d.getTime(), date: z.date, hm: z.hm, rel: dayRel(z.date), time: fmtTime(z.hm), past: d.getTime() < now() - 60000 };
    }
    // Today's sunrise or sunset plus an offset, as HH:MM, or null before the connector has said.
    function sunAt(type, offsetMin = 0) {
      const iso = S.sun && S.sun[type]; if (!iso) return null;
      const d = new Date(iso); if (isNaN(d.getTime())) return null;
      return zparts(new Date(d.getTime() + (offsetMin || 0) * 60000)).hm;
    }
    // The phone and the home keep different clocks, and nobody has said which the lights follow yet.
    function zoneClash() {
      const home = S.config && settings().timezone, phone = phoneTZ();
      if (!home || !phone || home === phone) return null;
      return { home, phone, homeName: zoneName(home), phoneName: zoneName(phone) };
    }

    // ---------- routines and their pairs ----------
    const schedules = () => (S.config && S.config.schedules) || [];
    const byId = id => schedules().find(x => x.id === id) || null;
    const isPairId = id => /-off$/.test(id) && !!byId(id.slice(0, -4));
    const pairOf = sc => (sc ? byId(sc.id + '-off') : null);
    const parentOf = sc => (sc && isPairId(sc.id) ? byId(sc.id.slice(0, -4)) : null);
    const list = () => schedules().filter(sc => !isPairId(sc.id));
    const isShadeT = t => t === 'h:shades' || (typeof t === 'string' && t.startsWith('d:') && (D.dev(t.slice(2)) || {}).domain === 'cover');
    function splitT(ts) { const L = [], Sh = []; for (const t of ts) (isShadeT(t) ? Sh : L).push(t); return { L, Sh }; }
    function fansIn(L) { if (L.includes('h:fans')) return ['h:fans']; return D.targetDevices(L).filter(id => (D.dev(id) || {}).domain === 'fan').map(id => `d:${id}`); }
    const lightRooms = () => D.areas().filter(a => D.controllable().some(d => D.devArea(d) === a.id && d.domain !== 'cover'));
    const dimmers = () => D.controllable().filter(d => d.domain === 'light');
    function targetsOf(sc) { return [...new Set((sc.actions || []).flatMap(a => tlist(a.target)))].filter(D.targetExists); }
    function splitOf(sc) { const s = splitT(targetsOf(sc)); if (!s.L.length && !s.Sh.length && lightRooms()[0]) s.L.push(`a:${lightRooms()[0].id}`); return s; }

    function daysText(days) {
      const d = [...new Set(days || ALL_DAYS)].sort();
      if (d.length === 7) return 'Every day';
      if (d.join() === '1,2,3,4,5') return 'Weekdays';
      if (d.join() === '0,6') return 'Weekends';
      if (d.length === 6) return `Every day but ${DAY_LONG[ALL_DAYS.find(i => !d.includes(i))]}`;
      return WEEK.filter(i => d.includes(i)).map(i => DAY_SHORT[i]).join(', ');
    }
    // "every day", "on weekdays", "at weekends", "on Mon, Wed"
    function dayPhrase(days) {
      const t = daysText(days);
      return t === 'Every day' ? 'every day' : t === 'Weekends' ? 'at weekends' : t.startsWith('Every day but') ? t.toLowerCase().replace(/but (\w)/, (m, c) => `but ${c.toUpperCase()}`) : `on ${t === 'Weekdays' ? 'weekdays' : t}`;
    }
    // "at 6:30 am", "at sunset", "30 min after sunset"
    function whenClause(at) {
      if (!at) return '';
      if (at.type === 'time') return `at ${fmtTime(at.time)}`;
      const off = at.offset_min || 0;
      if (!off) return `at ${at.type}`;
      return `${Math.abs(off)} min ${off < 0 ? 'before' : 'after'} ${at.type}`;
    }
    // The When row: "Sunset + 30 min (7:42 pm today)", "6:30 am".
    function whenValue(at) {
      if (!at) return 'Pick a time';
      if (at.type === 'time') return fmtTime(at.time);
      const off = at.offset_min || 0;
      const base = `${cap(at.type)}${off ? ` ${off < 0 ? '−' : '+'} ${Math.abs(off)} min` : ''}`;
      const hm = settings().location ? sunAt(at.type, off) : null;
      return hm ? `${base} (${fmtTime(hm)} today)` : base;
    }
    // The token in the sentence: "Sunset", "+ 30 min", "6:30 am".
    function whenTokens(at) {
      if (!at) return ['Pick a time'];
      if (at.type === 'time') return [fmtTime(at.time)];
      const off = at.offset_min || 0;
      return [cap(at.type), off ? `${off < 0 ? '−' : '+'} ${Math.abs(off)} min` : 'on the dot'];
    }

    // ---------- what a routine does ----------
    const AUTO_RECIPES = [
      { id: 'on', t: 'Turn on', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 'on' }] },
      { id: 'off', t: 'Turn off', mk: L => [{ type: 'level', target: packTarget(L), level: 'off' }] },
      { id: 'full', t: 'Full brightness', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 100 }] },
      { id: 'half', t: 'Half brightness', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 50 }] },
      { id: 'night', t: 'Nightlight level', d: '10%', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 10, fade: 1 }] },
      { id: 'rise', t: 'Rise slowly', d: 'To 50% over 25 min', on: true, mk: L => [{ type: 'level', target: packTarget(L), level: 50, fade: 1500 }] },
      { id: 'scene', t: 'Run a scene…', on: true, pick: true },
      { id: 'shades_close', t: 'Close the shades', shades: true, open: true, mk: (L, Sh) => [{ type: 'lower', target: packTarget(Sh) }] },
      { id: 'shades_open', t: 'Open the shades', shades: true, mk: (L, Sh) => [{ type: 'raise', target: packTarget(Sh) }] },
      { id: 'fan_off', t: 'Turn the fan off', fans: true, mk: L => [{ type: 'fan', target: packTarget(fansIn(L)), speed: 'Off' }] },
    ];
    function recipeApplies(r, L, Sh) { if (r.shades) return Sh.length > 0; if (r.fans) return fansIn(L).length > 0; return L.length > 0; }
    function recipeOf(sc, L, Sh) {
      const acts = sc.actions || [];
      for (const r of AUTO_RECIPES) if (r.mk && recipeApplies(r, L, Sh) && JSON.stringify(r.mk(L, Sh)) === JSON.stringify(acts)) return r.id;
      if (acts.length === 1 && (acts[0].type === 'preset' || acts[0].type === 'scene')) return 'scene';
      return 'custom';
    }
    function leavesOn(acts) { return (acts || []).some(a => (a.type === 'level' && a.level !== 'off' && a.level !== 0) || a.type === 'preset' || a.type === 'scene' || a.type === 'lower'); }
    const tn = t => cap(D.targetName(packTarget(tlist(t))));
    // What it does, in the sentence's words: "Turn on", "Run Relax".
    function whatWord(sc) {
      const { L, Sh } = splitOf(sc); const rid = recipeOf(sc, L, Sh); const a = (sc.actions || [])[0] || {};
      if (rid === 'scene') return `Run ${cap(D.targetName(a.type === 'preset' ? 'p:' + a.preset_id : 's:' + a.scene_id))}`;
      const r = AUTO_RECIPES.find(x => x.id === rid);
      return r ? r.t : 'Several steps';
    }
    // "Turn on · Porch light"
    function whatValue(sc) {
      const { L, Sh } = splitOf(sc); const rid = recipeOf(sc, L, Sh);
      if (rid === 'scene' || rid === 'custom') return rid === 'custom' ? D.describe(sc.actions) : whatWord(sc);
      return `${whatWord(sc)} · ${tn(rid.startsWith('shades') ? Sh : L)}`;
    }
    // "Porch on", "Everything off", "Bedroom lamp rises"; with an off pair, just "Porch".
    function autoName(sc, L, Sh, paired = false) {
      const rid = recipeOf(sc, L, Sh); const a = (sc.actions || [])[0] || {};
      const n = ({ on: () => (paired ? tn(L) : `${tn(L)} on`), off: () => `${tn(L)} off`, full: () => `${tn(L)} full brightness`, half: () => `${tn(L)} half brightness`, night: () => `${tn(L)} nightlight`, rise: () => `${tn(L)} rises`,
        scene: () => cap(D.targetName(a.type === 'preset' ? 'p:' + a.preset_id : 's:' + a.scene_id)), shades_close: () => `${Sh.includes('h:shades') ? 'Shades' : tn(Sh)} close`, shades_open: () => `${Sh.includes('h:shades') ? 'Shades' : tn(Sh)} open`, fan_off: () => 'Fan off' }[rid] || (() => tn(L.length ? L : Sh)))();
      return n.slice(0, 60);
    }
    // The card's sentence: "Porch light on at sunset, off at 11:00 pm", "Bedside lamp rises from 6:30 am",
    // "Entry on at 5:45 pm if everything is off".
    function sentence(sc) {
      const off = pairOf(sc);
      const { L, Sh } = splitOf(sc); const rid = recipeOf(sc, L, Sh);
      const head = rid === 'rise' ? `${tn(L)} rises ${sc.at && sc.at.type === 'time' ? `from ${fmtTime(sc.at.time)}` : whenClause(sc.at)}`
        : `${rid === 'custom' ? D.describe(sc.actions) : autoName(sc, L, Sh, false)} ${whenClause(sc.at)}`;
      const tail = off ? `, ${off.actions.some(a => a.type === 'raise') ? 'open' : 'off'} ${whenClause(off.at)}` : '';
      const cond = sc.only_if === 'all_off' ? ' if everything is off' : sc.only_if === 'any_on' ? ' if something is on' : '';
      return `${head}${tail}${cond}`;
    }
    const ONLY_IF = [[null, 'Always'], ['all_off', 'Everything is off'], ['any_on', 'Something is on']];
    const onlyIfText = v => (ONLY_IF.find(x => x[0] === (v || null)) || ONLY_IF[0])[1];
    function makePair(sc, at, L, Sh) {
      const shades = recipeOf(sc, L, Sh) === 'shades_close';
      return { id: sc.id + '-off', name: sc.name, enabled: sc.enabled !== false, at, days: [...sc.days], actions: shades ? [{ type: 'raise', target: packTarget(Sh) }] : [{ type: 'level', target: packTarget(L.length ? L : Sh), level: 'off', fade: 1 }], only_if: null, skip_until: sc.skip_until || null, kind: sc.kind || null };
    }
    // Keep a pair in step with its routine: name, days, on or off, skip.
    function syncPair(sc) {
      const off = pairOf(sc); if (!off) return;
      off.name = sc.name; off.days = [...sc.days]; off.enabled = sc.enabled !== false; off.skip_until = sc.skip_until || null; off.kind = sc.kind || null;
    }

    // ---------- when it runs next ----------
    function predictNextRun(sc) {
      const z = zparts(new Date(now()));
      for (let i = 0; i < 8; i++) {
        const date = addDays(z.date, i);
        if (!(sc.days || ALL_DAYS).includes(weekdayOf(date))) continue;
        if (sc.skip_until && date <= sc.skip_until) continue;
        const hm = sc.at.type === 'time' ? sc.at.time : sunAt(sc.at.type, sc.at.offset_min);
        if (!hm) return null;
        if (i === 0 && hm <= z.hm) continue;
        return { date, hm, rel: dayRel(date), time: fmtTime(hm), past: false, predicted: true, t: now() + ((dayNum(date) - dayNum(z.date)) * 1440 + hmMin(hm) - hmMin(z.hm)) * 60000 };
      }
      return null;
    }
    function nextRunOf(sc) {
      if (!sc || !sc.at || sc.enabled === false) return null;
      let r = runInfo((S.nextRuns || {})[sc.id]);
      if (r && sc.skip_until && r.date <= sc.skip_until) r = null;
      if (r && r.past) r = null;
      return r || predictNextRun(sc);
    }
    const skipping = sc => (sc.skip_until && sc.skip_until >= today() ? sc.skip_until : null);
    function failedLast(sc) { const e = (S.activity || []).find(x => x.kind === 'schedule' && x.id === sc.id); return !!(e && e.ok === false); }
    // "Skip tonight", "Skip Monday"; "Don't skip" while one is skipped.
    function skipLabel(sc) {
      const sk = skipping(sc); if (sk) return "Don't skip";
      const n = nextRunOf(sc); return `Skip ${n ? skipWord(n.date, n.hm) : 'next time'}`;
    }
    // The line under a routine: why it will not run, or when it will.
    function nextLine(sc) {
      if (sc.enabled === false) return 'Paused';
      if (sc.at.type !== 'time' && !settings().location) return { warn: true, text: "Needs your home's location" };
      if (failedLast(sc)) return { warn: true, text: "Didn't run last time" };
      const n = nextRunOf(sc); if (!n) return '';
      const sk = skipping(sc);
      return sk ? `Skipping ${skipWord(sk, n.hm)} · then ${n.rel} at ${n.time}` : `Next: ${n.rel} at ${n.time}`;
    }
    // Skip one run, the next one or the one on `date`. Returns the sentence the toast says, or null.
    function skip(sc, date) {
      const n = nextRunOf(sc); const d = date || (n && n.date); if (!d) return null;
      const hm = n ? n.hm : null;
      sc.skip_until = d; syncPair(sc);
      const after = nextRunOf(sc);
      const back = after ? (after.rel === 'tomorrow' || after.rel === 'today' ? ` Back ${after.rel} at ${after.time}.` : ` Back on ${after.rel} at ${after.time}.`) : '';
      return `${sc.name} will skip ${skipWord(d, hm)}.${back}`;
    }
    function unskip(sc) { sc.skip_until = null; syncPair(sc); return `${sc.name} is back on`; }
    function setEnabled(sc, on) { sc.enabled = !!on; syncPair(sc); return on ? `${sc.name} back on` : `${sc.name} paused`; }
    function remove(id) { S.config.schedules = schedules().filter(x => x.id !== id && x.id !== id + '-off'); }
    // What runs within `ms`, soonest first: each routine, or its off half.
    function upcoming(ms) {
      return schedules().filter(sc => sc.enabled !== false).map(sc => ({ sc, n: nextRunOf(sc) }))
        .filter(x => x.n && x.n.t && x.n.t - now() < ms).sort((a, b) => a.n.t - b.n.t);
    }
    // The Up next card: the soonest routine this week, with its title, its line and the day to skip.
    function upNext() {
      const x = upcoming(7 * 86400000)[0]; if (!x) return null;
      const sc = parentOf(x.sc) || x.sc; const off = pairOf(sc);
      const isOff = x.sc !== sc;
      // "at 6:00 pm", "tomorrow at 6:00 pm", "on Monday at 6:00 pm"
      const at = n => (n.rel === 'today' ? `at ${n.time}` : n.rel === 'tomorrow' ? `tomorrow at ${n.time}` : `on ${n.rel} at ${n.time}`);
      let sub;
      if (isOff) { const on = nextRunOf(sc); sub = `${off.actions.some(a => a.type === 'raise') ? 'Opens' : 'Off'} ${at(x.n)}${on ? ` · on again ${sc.at.type === 'time' ? at(on) : on.rel === 'today' ? `at ${sc.at.type}` : `${on.rel === 'tomorrow' ? 'tomorrow' : 'on ' + on.rel} at ${sc.at.type}`}` : ''}`; }
      else sub = `${whatWord(sc)} ${at(x.n)}${off ? ` · off at ${fmtTime(sunOrTime(off.at))}` : ''}`;
      const sun = (isOff ? off.at : sc.at).type;
      return { sc, date: x.n.date, hm: x.n.hm, title: sc.name || 'Routine', sub, icon: sun === 'sunset' ? 'sunset' : sun === 'sunrise' ? 'sunrise' : 'clock', skipping: !!skipping(sc), skipLabel: skipping(sc) ? "Don't skip" : `Skip ${skipWord(x.n.date, x.n.hm)}` };
    }
    const sunOrTime = at => (at.type === 'time' ? at.time : sunAt(at.type, at.offset_min) || '00:00');

    // ---------- making and changing one ----------
    // A new routine: the first room on at sunset (or 6 pm when the home has no location), every day.
    function newRoutine() {
      const room = lightRooms()[0]; const L = room ? [`a:${room.id}`] : ['h:all'];
      const at = settings().location ? { type: 'sunset', time: null, offset_min: 0 } : { type: 'time', time: '18:00', offset_min: 0 };
      const sc = { id: uid(), name: '', enabled: true, at, days: [...ALL_DAYS], actions: AUTO_RECIPES[0].mk(L, []), only_if: null, skip_until: null, kind: 'custom' };
      sc.name = autoName(sc, L, [], false);
      S.config.schedules.push(sc);
      return sc;
    }
    // A routine keeps its automatic name until somebody types one.
    const named = sc => { const { L, Sh } = splitOf(sc); return !!sc.name && sc.name !== autoName(sc, L, Sh, !!pairOf(sc)) && sc.name !== autoName(sc, L, Sh, !pairOf(sc)); };
    function rename(sc, name, wasAuto) {
      if (wasAuto) { const { L, Sh } = splitOf(sc); sc.name = autoName(sc, L, Sh, !!pairOf(sc)); }
      if (name != null) { const v = String(name).trim().slice(0, 60); if (v) sc.name = v; }
      syncPair(sc);
    }
    function touch(sc, auto) { if (auto) rename(sc, null, true); else syncPair(sc); }
    function setWhen(sc, at) { const auto = !named(sc); sc.at = at; touch(sc, auto); }
    function setDays(sc, days) { if (!days.length) return false; const auto = !named(sc); sc.days = [...new Set(days)].sort(); touch(sc, auto); return true; }
    function toggleDay(sc, d) { const has = sc.days.includes(d); if (has && sc.days.length === 1) return false; return setDays(sc, has ? sc.days.filter(x => x !== d) : [...sc.days, d]); }
    function setRecipe(sc, rid, L, Sh) {
      const r = AUTO_RECIPES.find(x => x.id === rid); if (!r || r.pick) return false;
      const auto = !named(sc);
      sc.actions = r.mk(L, Sh);
      const off = pairOf(sc);
      // a routine that leaves nothing on has nothing to turn off again
      if (off && !(r.on || r.open)) S.config.schedules = schedules().filter(x => x.id !== off.id);
      else if (off) off.actions = makePair(sc, off.at, L, Sh).actions;
      touch(sc, auto);
      return true;
    }
    function setScene(sc, action) {
      const auto = !named(sc); sc.actions = [action];
      const { L, Sh } = splitOf(sc); const off = pairOf(sc); if (off) off.actions = makePair(sc, off.at, L, Sh).actions;
      touch(sc, auto);
    }
    function setTargets(sc, L, Sh) {
      const auto = !named(sc);
      const cur = splitOf(sc); const rid = recipeOf(sc, cur.L, cur.Sh); const r = AUTO_RECIPES.find(x => x.id === rid);
      if (r && r.mk && recipeApplies(r, L, Sh)) sc.actions = r.mk(L, Sh);
      else if (r && r.mk) sc.actions = AUTO_RECIPES[0].mk(L.length ? L : Sh, Sh);
      else for (const a of sc.actions) { if (!a.target || a.target === 'h:all') continue; a.target = packTarget(a.type === 'raise' || a.type === 'lower' ? (Sh.length ? Sh : L) : (L.length ? L : Sh)); }
      const off = pairOf(sc); if (off) off.actions = makePair(sc, off.at, L, Sh).actions;
      touch(sc, auto);
    }
    // The second half: off (or open) again at `at`, or null for "leave them".
    function setOff(sc, at) {
      const auto = !named(sc);
      const off = pairOf(sc);
      if (!at) { if (off) S.config.schedules = schedules().filter(x => x.id !== off.id); touch(sc, auto); return; }
      if (off) off.at = at;
      else { const { L, Sh } = splitOf(sc); S.config.schedules.push(makePair(sc, at, L, Sh)); }
      touch(sc, auto);
    }
    const canHaveOff = sc => { const { L, Sh } = splitOf(sc); const r = AUTO_RECIPES.find(x => x.id === recipeOf(sc, L, Sh)); return r ? !!(r.on || r.open) : leavesOn(sc.actions); };
    function setOnlyIf(sc, v) { sc.only_if = v || null; }
    function fadeOf(sc) { const lv = (sc.actions || []).find(a => a.type === 'level'); return lv && lv.fade != null ? lv.fade : null; }
    function setFade(sc, v) { for (const a of sc.actions) if (a.type === 'level') { if (v == null || v === '') delete a.fade; else a.fade = Number(v); } }

    // ---------- the three guided setups ----------
    const OUTSIDE_RE = /outside|outdoor|porch|patio|garden|entry|hall|exterior|yard|deck|front|drive|garage/i;
    const BEDROOM_RE = /bed|nursery|guest/i;
    const HALL_RE = /hall|entry|foyer|landing|stairs|mud/i;
    function roomMatches(t, re) { const aid = t.startsWith('a:') ? t.slice(2) : t.startsWith('d:') ? D.devArea(D.dev(t.slice(2))) : null; return !!aid && re.test(D.areaName(aid)); }
    const shadesInHouse = () => D.controllable().filter(d => d.domain === 'cover');

    // Welcome lights: on when you get home (a clock time, or around sunset), off at bedtime, sunrise or a time.
    function welcomeStart() {
      const pre = lightRooms().filter(a => OUTSIDE_RE.test(a.name)).map(a => `a:${a.id}`);
      return { targets: pre.length ? pre : (lightRooms()[0] ? [`a:${lightRooms()[0].id}`] : []), shades: [], arrive: 'time', arriveTime: '18:00', offset: 20, days: [1, 2, 3, 4, 5], onlyDark: true, until: 'bedtime', untilTime: '22:00', low: false, level: 60 };
    }
    function welcomeOffAt(g) {
      const s = settings();
      return g.until === 'bedtime' ? { type: 'time', time: s.night_start, offset_min: 0 } : g.until === 'sunrise' ? { type: 'sunrise', time: null, offset_min: 0 } : { type: 'time', time: g.untilTime, offset_min: 0 };
    }
    const welcomeOnAt = g => (g.arrive === 'sunset' ? { type: 'sunset', time: null, offset_min: -g.offset } : { type: 'time', time: g.arriveTime, offset_min: 0 });
    // "Entry light comes on at 6:00 pm on weekdays, only if the house is dark, and goes off at bedtime."
    function welcomeSummary(g) {
      if (!g.targets.length) return 'Pick at least one light.';
      const on = g.arrive === 'sunset' ? (g.offset ? `${g.offset} min before sunset` : 'at sunset') : `at ${fmtTime(g.arriveTime)}`;
      const off = g.until === 'bedtime' ? `at bedtime (${fmtTime(settings().night_start)})` : g.until === 'sunrise' ? 'at sunrise' : `at ${fmtTime(g.untilTime)}`;
      const who = tn(g.targets);
      const verb = D.targetDevices(g.targets).length === 1 ? 'comes' : 'come';
      return `${who} ${verb} on ${on} ${dayPhrase(g.days)}${g.onlyDark ? ', only if the house is dark,' : ''} and ${verb === 'comes' ? 'goes' : 'go'} off ${off}.${g.shades.length ? ` ${plural(g.shades.length, 'shade')} close${g.shades.length === 1 ? 's' : ''} too.` : ''}`;
    }
    function saveWelcome(g) {
      if (!g.targets.length || (g.arrive === 'sunset' && !settings().location)) return null;
      const id = uid(); const T = packTarget(g.targets);
      const outsideT = g.targets.filter(t => roomMatches(t, OUTSIDE_RE)), indoorT = g.targets.filter(t => !roomMatches(t, OUTSIDE_RE));
      const offAt = welcomeOffAt(g);
      const base = { enabled: true, days: [...g.days], skip_until: null, kind: 'welcome' };
      const on = { ...base, id, name: 'Welcome lights', at: welcomeOnAt(g), actions: [{ type: 'level', target: T, level: g.level, fade: 3 }], only_if: g.onlyDark ? 'all_off' : null };
      if (g.shades.length) on.actions.push({ type: 'lower', target: packTarget(g.shades) });
      const out = [on];
      const low = g.low && outsideT.length > 0;
      const offTargets = low ? indoorT : g.targets;
      if (offTargets.length) out.push({ ...base, id: id + '-off', name: 'Welcome lights', at: offAt, only_if: null, actions: [{ type: 'level', target: packTarget(offTargets), level: 'off', fade: 1 }, ...(g.shades.length && g.until === 'sunrise' ? [{ type: 'raise', target: packTarget(g.shades) }] : [])] });
      if (low) { const id2 = uid(); out.push({ ...base, id: id2, name: 'Outside lights, overnight', at: offAt, only_if: null, actions: [{ type: 'level', target: packTarget(outsideT), level: 20, fade: 3 }] }, { ...base, id: id2 + '-off', name: 'Outside lights, overnight', at: { type: 'sunrise', time: null, offset_min: 15 }, only_if: null, actions: [{ type: 'level', target: packTarget(outsideT), level: 'off', fade: 1 }] }); }
      if (g.shades.length && g.until !== 'sunrise') out.push({ ...base, id: uid(), name: 'Shades open', at: { type: 'sunrise', time: null, offset_min: 15 }, only_if: null, actions: [{ type: 'raise', target: packTarget(g.shades) }] });
      S.config.schedules.push(...out);
      return out;
    }

    // Wake-up light: one lamp rises from dark over a while, ending at the time you wake.
    function wakeupStart() {
      const beds = dimmers().filter(d => BEDROOM_RE.test(D.devAreaName(d)));
      const lamp = beds.find(d => /lamp/i.test(d.name)) || beds[0] || dimmers()[0];
      return { lamp: lamp ? lamp.device_id : null, alarm: '06:30', days: [1, 2, 3, 4, 5], shade: false, minutes: 25, end: 50 };
    }
    function wakeShade(g) { const d = g.lamp ? D.dev(g.lamp) : null; return d ? D.controllable().find(x => x.domain === 'cover' && D.devArea(x) === D.devArea(d)) || null : null; }
    function wakeupSummary(g) {
      if (!g.lamp) return 'Pick a lamp.';
      const d = D.dev(g.lamp);
      return `${d ? d.name : 'The lamp'} starts rising at ${fmtTime(hmAdd(g.alarm, -g.minutes))} and reaches ${g.end}% by ${fmtTime(g.alarm)} ${dayPhrase(g.days)}. Skipped if it is already on.${g.shade && wakeShade(g) ? ` ${wakeShade(g).name} opens at ${fmtTime(g.alarm)}.` : ''}`;
    }
    function saveWakeup(g) {
      if (!g.lamp) return null;
      const d = D.dev(g.lamp); const room = d ? D.devAreaName(d) : 'Bedroom';
      const base = { enabled: true, days: [...g.days], skip_until: null, kind: 'wakeup' };
      const out = [{ ...base, id: uid(), name: 'Wake-up light', at: { type: 'time', time: hmAdd(g.alarm, -g.minutes), offset_min: 0 }, actions: [{ type: 'level', target: `d:${g.lamp}`, level: g.end, fade: g.minutes * 60 }], only_if: 'all_off' }];
      const shade = g.shade ? wakeShade(g) : null;
      if (shade) out.push({ ...base, id: uid(), name: `${room} shade`, at: { type: 'time', time: g.alarm, offset_min: 0 }, actions: [{ type: 'raise', target: `d:${shade.device_id}` }], only_if: null });
      S.config.schedules.push(...out);
      return out;
    }

    // Goodnight and Leaving: a hold on a remote shuts the house down and keeps one light on for a moment.
    // The bottom key, or the last real one; `avoid` keeps the two off the same key of one remote.
    function holdButton(d, avoid = null) {
      const real = R.slots(d).filter(s => s.real);
      const order = [real.find(s => s.glyph === 'off'), ...real.slice().reverse()].filter(Boolean).map(s => s.n);
      return order.find(n => n !== avoid) ?? (real.length ? real[real.length - 1].n : 0);
    }
    function buttonStart(kind) {
      const rs = D.remotes(); if (!rs.length) return null;
      if (kind === 'goodnight') {
        const r = rs.find(d => BEDROOM_RE.test(D.devAreaName(d))) || rs[0];
        const path = D.groups().find(g => /night path/i.test(g.name));
        const hall = lightRooms().filter(a => HALL_RE.test(a.name));
        const keep = path ? [`g:${path.id}`] : hall.length ? [`a:${hall[0].id}`] : [];
        return { kind, remote: r.device_id, button: holdButton(r), keep };
      }
      const r = rs.find(d => HALL_RE.test(D.devAreaName(d))) || rs[0];
      const lights = D.controllable().filter(d => d.domain === 'light' || d.domain === 'switch');
      const door = lights.find(d => HALL_RE.test(D.devAreaName(d))) || lights[0];
      return { kind, remote: r.device_id, button: holdButton(r), keep: door ? [`d:${door.device_id}`] : [] };
    }
    function buttonSummary(g) {
      const d = D.dev(g.remote); if (!d) return 'Pick a remote.';
      const key = R.buttonName(g.remote, g.button);
      const extra = (() => { const f = D.controllable().some(x => x.domain === 'fan'), sh = D.controllable().some(x => x.domain === 'cover'); return f && sh ? ' Fans stop and shades close.' : f ? ' Fans stop.' : sh ? ' Shades close.' : ''; })();
      const kept = g.keep.length ? `${tn(g.keep)} ${g.kind === 'goodnight' ? 'stays dim' : 'stays on'} for two minutes` : 'nothing stays on';
      return `Hold the ${key.toLowerCase()} on ${d.name}: everything goes off and ${kept}.${extra}`;
    }
    function saveButton(g) {
      if (!D.dev(g.remote)) return null;
      const actions = R.shutdownActions(g.keep.length ? packTarget(g.keep) : null, g.kind === 'goodnight' ? 'dim' : 'on');
      R.holdReplace(g.remote, g.button, actions);
      return actions;
    }

    // ---------- the evening wind-down ----------
    const wd = () => { const s = settings(); s.adaptive = s.adaptive || {}; s.adaptive.winddown = s.adaptive.winddown || {}; return { ad: s.adaptive, wd: s.adaptive.winddown }; };
    // Where dimming starts today: sunset plus the offset, kept between earliest and latest; without the sun, earliest.
    function curveStart() {
      const w = wd().wd; const sunset = sunAt('sunset', w.sunset_offset_min || 0);
      if (!sunset) return w.earliest || '18:00';
      return minHm(Math.max(hmMin(w.earliest || '18:00'), Math.min(hmMin(w.latest || '20:00'), hmMin(sunset))));
    }
    function curveLevelNow() {
      const s = settings(); const { ad, wd: w } = wd();
      if (!ad.enabled) return null;
      if (S.sun && S.sun.curve_level != null) return S.sun.curve_level;
      return winddownLevel(nowHm(), curveStart(), s.night_start, s.night_end, w.from_level || 100, w.to_level || 50, s.night_level || 30, w.morning_level == null ? 100 : w.morning_level, w.morning_until || '07:30');
    }
    const windDownOn = () => !!wd().ad.enabled;
    // The row: "On · house goes quiet at 10:30 pm"
    const windDownLine = () => (windDownOn() ? `Quiet at ${fmtTime(settings().night_start)}` : 'Off');
    function windDownToday() {
      const s = settings(); const w = wd().wd;
      const ml = w.morning_level == null ? 100 : w.morning_level;
      return `Today: ${ml < 100 ? `soft until ${fmtTime(w.morning_until || '07:30')}, ` : ''}full until ${fmtTime(curveStart())}, down to ${w.to_level || 50}% by ${fmtTime(s.night_start)}, then ${s.night_level}% until ${fmtTime(s.night_end)}.`;
    }
    function setWindDown(k, v) {
      const s = settings(); const w = wd().wd; v = Number(v);
      if (k === 'night_level') s.night_level = v; else w[k] = v;
      return { morning_level: `Early morning: ${v}%`, sunset_offset_min: v ? `Dimming starts ${v} minutes after sunset` : 'Dimming starts at sunset', to_level: `Down to ${v}%`, night_level: `At night: ${v}%` }[k] || 'Saved';
    }
    // The quiet time moves the last evening point of the by-the-hour curve too, so both modes agree.
    function rewriteEveningPoints(quiet) {
      const { ad } = wd(); if (!Array.isArray(ad.points) || ad.points.length < 2) return;
      const pts = ad.points.slice().sort((a, b) => a.time.localeCompare(b.time));
      pts[pts.length - 1].time = quiet;
      ad.points = pts.filter((p, i) => i === pts.length - 1 || p.time < quiet);
      if (ad.points.length < 2) ad.points = pts.slice(-2);
    }
    function setNight(k, v) {
      if (!/^\d\d:\d\d$/.test(v)) return null;
      settings()[k] = v;
      if (k === 'night_start') rewriteEveningPoints(v);
      return k === 'night_start' ? `Quiet from ${fmtTime(v)}` : `Night ends at ${fmtTime(v)}`;
    }
    function addPoint() {
      const { ad } = wd(); ad.points = ad.points || [];
      const last = ad.points[ad.points.length - 1];
      ad.points.push({ time: hmAdd(last ? last.time : '20:00', 60), level: last ? last.level : 50 });
      ad.points.sort((a, b) => a.time.localeCompare(b.time));
    }
    function removePoint(i) { const { ad } = wd(); if ((ad.points || []).length > 2) ad.points.splice(i, 1); }
    function setPoint(i, k, v) {
      const { ad } = wd(); const p = (ad.points || [])[i]; if (!p) return;
      if (k === 'time') { if (/^\d\d:\d\d$/.test(v)) p.time = v; } else p.level = Math.max(1, Math.min(100, Number(v) || 1));
      ad.points.sort((a, b) => a.time.localeCompare(b.time));
    }

    // ---------- timers that are running ----------
    // Each running timer: what it covers, in words, and the minutes left.
    function timers() {
      const out = [];
      for (const [t, v] of Object.entries(S.timers || {})) {
        if (!v || !v.ends_at) continue;
        const ms = typeof v.ends_at === 'number' && v.ends_at < 1e12 ? v.ends_at * 1000 : new Date(v.ends_at).getTime();
        if (!(ms > now())) continue;
        const target = t.includes('|') ? t.split('|') : t;
        const lv = Number(v.level) || 0;
        out.push({ key: t, target, name: tn(target), mins: Math.max(1, Math.round((ms - now()) / 60000)), level: lv, endsMs: ms, text: `${tn(target)} · ${lv ? `to ${lv}%` : 'off'} in ${Math.max(1, Math.round((ms - now()) / 60000))} min` });
      }
      return out.sort((a, b) => a.endsMs - b.endsMs);
    }

    return {
      DAY_LONG, DAY_SHORT, DAY_LETTER, WEEK, ALL_DAYS, QUICK_DAYS, AUTO_RECIPES, ONLY_IF,
      fmtTime, hmAdd, hmMin, phoneTZ, homeTZ, zoneName, zoneClash, zparts, today, nowHm, addDays, dayRel, skipWord, runInfo, sunAt, weekdayOf,
      schedules, byId, isPairId, pairOf, parentOf, list, splitT, splitOf, targetsOf, lightRooms, dimmers,
      daysText, dayPhrase, whenClause, whenValue, whenTokens, recipeApplies, recipeOf, leavesOn, whatWord, whatValue, autoName, sentence, onlyIfText, makePair, syncPair,
      predictNextRun, nextRunOf, skipping, failedLast, skipLabel, nextLine, skip, unskip, setEnabled, remove, upcoming, upNext,
      newRoutine, named, rename, setWhen, setDays, toggleDay, setRecipe, setScene, setTargets, setOff, canHaveOff, setOnlyIf, fadeOf, setFade,
      OUTSIDE_RE, roomMatches, shadesInHouse, welcomeStart, welcomeSummary, saveWelcome, wakeupStart, wakeShade, wakeupSummary, saveWakeup,
      holdButton, buttonStart, buttonSummary, saveButton,
      curveStart, curveLevelNow, windDownOn, windDownLine, windDownToday, setWindDown, rewriteEveningPoints, setNight, addPoint, removePoint, setPoint,
      timers,
    };
  }

  const CasetaRoutines = { create, winddownLevel, fmtTime, DAY_LONG, DAY_SHORT, DAY_LETTER, WEEK, ALL_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = CasetaRoutines;
  if (root) root.CasetaRoutines = CasetaRoutines;
})(typeof window !== 'undefined' ? window : null);
