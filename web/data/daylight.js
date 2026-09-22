/* Caseta data layer, part three: Follow the day. A lamp keeps its white matched to the time of day, on its own, for
   as long as it is on: cool and bright around midday, warm in the evening, like daylight.

   The connector does the work (agent/daylight.py). This is the app's half: the same curve, so a screen can say what
   a lamp is set to right now and draw the day's shape, plus who follows it and the words for what it is doing.
   The anchor table below is a copy of the one in agent/daylight.py, and test/data/daylight.test.js reads that file
   and fails if the two ever differ.

   The names of whites (Candle, Warm, Soft white...) live here too: every white the app names is on this scale.

   Moved verbatim from web/js/daylight.js (and warmthName from web/js/color.js) for Copper Night phase 1; those
   files keep their global names pointed here. Same shape as caseta-data.js: window.CasetaDaylight in a browser,
   `require` in a test. */
(function (root) {
  'use strict';

  // (moment, minutes from it, kelvin). "midnight" is solar midnight, twelve hours before that day's noon.
  const FOLLOW_ANCHORS = [
    ['midnight', 0, 2000],
    ['sunrise', -60, 2200],
    ['sunrise', 0, 2700],
    ['sunrise', 90, 4000],
    ['noon', 0, 5200],
    ['sunset', -120, 4000],
    ['sunset', 0, 2900],
    ['sunset', 60, 2400],
  ];
  const toMirek = k => 1e6 / Math.max(1, Number(k) || 1);
  const toKelvin = m => Math.round(1e6 / Math.max(1, Number(m) || 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // What a white is called, by its kelvin.
  const WARMTH_NAMES = [[2300, 'Candle'], [3000, 'Warm'], [3700, 'Soft white'], [4500, 'Neutral'], [5500, 'Cool']];
  function warmthName(k) { for (const [top, n] of WARMTH_NAMES) if (k <= top) return n; return 'Daylight'; }

  function create(D, opts = {}) {
    const S = D.S;
    const now = opts.now || (() => Date.now());

    // ---------- the home's clock and the home's sun ----------
    // The connector's own clock, kept as an offset from this phone's, so a home in another zone (or a rig driven at
    // a chosen time of day) reads right here.
    function homeNow() { return new Date(now() - (S.sunSkew || 0)); }
    // Today's three moments as Dates, or null when the app has not been told where the home is.
    function followDay(when) {
      const s = S.sun || {};
      if (!s.sunrise || !s.sunset) return null;
      const rise = new Date(s.sunrise), set = new Date(s.sunset);
      if (isNaN(rise) || isNaN(set)) return null;
      const noon = s.noon && !isNaN(new Date(s.noon)) ? new Date(s.noon) : new Date((rise.getTime() + set.getTime()) / 2);
      // the connector sends today's sun; another day of the year is a minute or two out, which no eye can see
      const shift = when ? Math.round((when - noon) / 86400000) : 0;
      const move = d => new Date(d.getTime() + shift * 86400000);
      return { sunrise: move(rise), sunset: move(set), noon: move(noon) };
    }
    const followReady = () => !!followDay();
    // Yesterday, today and tomorrow's anchors in time order: that is what makes 3am and the hour after dusk sit
    // between two anchors like any other moment.
    function followPoints(when) {
      const base = followDay(when); if (!base) return [];
      const out = [];
      for (const delta of [-1, 0, 1]) {
        const day = { sunrise: new Date(+base.sunrise + delta * 86400000), sunset: new Date(+base.sunset + delta * 86400000), noon: new Date(+base.noon + delta * 86400000) };
        day.midnight = new Date(+day.noon - 12 * 3600000);
        for (const [moment, offset, kelvin] of FOLLOW_ANCHORS) out.push([new Date(+day[moment] + offset * 60000), toMirek(kelvin)]);
      }
      out.sort((a, b) => a[0] - b[0]);
      return out.filter((p, i) => i === 0 || p[0] - out[i - 1][0] >= 60000);
    }
    // The white at a moment, in mireds (a million over kelvin): a step in mireds looks like an even step to the eye,
    // a step in kelvin does not, so the curve is drawn and interpolated in them.
    function followMirek(when) {
      const pts = followPoints(when); if (!pts.length) return null;
      const t = +when;
      if (t <= +pts[0][0]) return pts[0][1];
      if (t >= +pts[pts.length - 1][0]) return pts[pts.length - 1][1];
      for (let i = 1; i < pts.length; i++) {
        if (t <= +pts[i][0]) {
          const [t0, m0] = pts[i - 1], [t1, m1] = pts[i];
          const span = t1 - t0;
          return m0 + (m1 - m0) * (span <= 0 ? 0 : (t - t0) / span);
        }
      }
      return pts[pts.length - 1][1];
    }
    function followKelvin(when) { const m = followMirek(when || homeNow()); return m == null ? null : toKelvin(m); }
    // Clamped to what this lamp can show: every Hue lamp reports its own range, and nothing is ever asked of it
    // that it cannot do.
    function followKelvinFor(id, when) {
      const m = followMirek(when || homeNow()); if (m == null) return null;
      const d = D.dev(id) || {};
      const [kmin, kmax] = d.ct && d.ct_range ? d.ct_range : [2000, 6500];
      return toKelvin(clamp(m, toMirek(kmax), toMirek(kmin)));
    }

    // ---------- who follows ----------
    const followSettings = () => (S.config && S.config.settings && S.config.settings.follow_day) || { device_ids: [], brightness: false };
    const followIds = () => followSettings().device_ids || [];
    const followBright = () => !!followSettings().brightness;
    // The connector's own word on it: the lamps it is following and the ones it has stopped for.
    const followLive = () => (S.follow || {});
    const isFollowing = id => followIds().includes(id) || ((followLive().ids || []).includes(id));
    const followPaused = id => isFollowing(id) && (followLive().paused || []).includes(id);
    // A lamp can follow the day when it can change its white. A Caseta dimmer has no colour at all, so it is never
    // offered it.
    const canFollow = d => !!(d && d.ct);
    const roomFollowLamps = aid => D.controllable().filter(d => D.devArea(d) === aid && canFollow(d));
    const followEntry = () => { const s = S.config.settings; return s.follow_day || (s.follow_day = { device_ids: [], brightness: false }); };
    // Start or stop some lamps following. Changes the config; the caller saves.
    function setFollowIds(ids, on) {
      const list = Array.isArray(ids) ? ids : [ids];
      const fd = followEntry();
      fd.device_ids = fd.device_ids || [];
      for (const id of list) {
        const i = fd.device_ids.indexOf(id);
        if (on && i < 0) fd.device_ids.push(id);
        if (!on && i >= 0) fd.device_ids.splice(i, 1);
      }
    }
    // Whether following lamps also dim towards the evening. Changes the config; the caller saves.
    function setFollowBrightness(on) { followEntry().brightness = !!on; }

    // ---------- what it is doing, in words ----------
    // "because it is mid-afternoon": where in the day this moment sits, said the way a person would.
    function followWhen(when) {
      const d = followDay(when || homeNow()); if (!d) return '';
      const t = +(when || homeNow());
      const rise = +d.sunrise, set = +d.sunset, noon = +d.noon, M = 60000;
      if (t < rise - 60 * M) return 'because it is the middle of the night';
      if (t < rise) return 'because the sun is about to come up';
      if (t < rise + 90 * M) return 'because the sun is coming up';
      if (t < noon - 120 * M) return 'because it is mid-morning';
      if (t <= noon + 120 * M) return 'because it is the middle of the day';
      if (t < set - 120 * M) return 'because it is mid-afternoon';
      if (t < set) return 'because the afternoon is turning';
      if (t < set + 60 * M) return 'because the sun is going down';
      return 'because the evening has come';
    }
    // "Soft white, 3450 K, because it is mid-afternoon". The white the lamp is really showing when it is following
    // and the connector has already set it; otherwise the one the curve asks for, which is what it would be given.
    function followNowText(id) {
      const st = (S.states[id] || {}).color;
      const lit = (D.level(id) || 0) > 0;
      const live = lit && isFollowing(id) && !followPaused(id) && st && st.mode === 'ct' && st.kelvin ? Math.round(st.kelvin) : null;
      const k = live || followKelvinFor(id);
      if (k == null) return '';
      const what = `${warmthName(k)}, ${k} K, ${followWhen()}`;
      // a lamp that is off is left alone, so the honest line is what it will be when it comes on
      return lit ? what : `Off just now. When you turn it on: ${what}`;
    }
    // What the day asks for at this moment, whatever the lamp is doing.
    function followWouldText(id) {
      const k = followKelvinFor(id); if (k == null) return '';
      return `${warmthName(k)}, ${k} K, ${followWhen()}`;
    }

    return {
      homeNow, followDay, followReady, followPoints, followMirek, followKelvin, followKelvinFor,
      followSettings, followIds, followBright, followLive, isFollowing, followPaused, canFollow, roomFollowLamps,
      setFollowIds, setFollowBrightness, followWhen, followNowText, followWouldText,
    };
  }

  const CasetaDaylight = { create, FOLLOW_ANCHORS, toMirek, toKelvin, WARMTH_NAMES, warmthName };
  if (typeof module !== 'undefined' && module.exports) module.exports = CasetaDaylight;
  if (root) root.CasetaDaylight = CasetaDaylight;
})(typeof window !== 'undefined' ? window : null);
