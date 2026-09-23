'use strict';
// A short memory of light: each light's level, and its white or colour, at each change over the last seven days.
// The Activity page draws the day from it (a ribbon per room, "Today in light"). It is nothing new to the house:
// only the state messages the hub already receives, written down.
//
// Kept small on purpose. A light's entry is written only when its level or colour changes; a burst of changes (a
// slider dragged, a fade reported step by step, a hold ramping) coalesces into one entry at the burst's start, so
// a dimming by hold is one line and not forty; each light keeps at most PER_LIGHT entries and nothing older than
// DAYS, apart from the one entry that says what the light was doing when the window opens.
//
// An entry is the text "t,level,tone": t in epoch milliseconds, level 0 to 100, tone a white in kelvin, a colour
// as #rrggbb, or empty for a light with no colour (a Caseta dimmer). Text rather than a small array because the
// store pretty-prints its documents, which would put every number of every entry on a line of its own.

const DAYS = 7;
const DAY = 86400000;
const COALESCE_MS = 15000;
const PER_LIGHT = 2000;
const MAX_LIGHTS = 300;
const LIT = ['light', 'switch'];

const toneOf = st => {
  const c = st && st.color;
  if (!c) return '';
  if (c.mode === 'ct' && c.kelvin) return String(Math.round(c.kelvin));
  if (c.hex && /^#?[0-9a-f]{6}$/i.test(c.hex)) return '#' + String(c.hex).replace('#', '').toLowerCase();
  return '';
};
const pack = (t, level, tone) => `${t},${level},${tone}`;
function unpack(s) {
  const [t, l, tone] = String(s).split(',');
  return [Number(t), Number(l), tone ? (tone[0] === '#' ? tone : Number(tone)) : null];
}

// doc: what the store held ({v, lights: {id: [entry...]}}), or nothing. now: the clock, for tests.
function create(doc, { now = () => Date.now() } = {}) {
  const lights = {};
  if (doc && doc.lights && typeof doc.lights === 'object') {
    for (const [id, list] of Object.entries(doc.lights)) if (Array.isArray(list)) lights[id] = list.filter(s => typeof s === 'string');
  }
  let dirty = false;

  // A light's new state. domain says what the device is, so shades and fans (whose "level" is not light) are left out.
  function note(id, st, domain) {
    if (!LIT.includes(domain) || !st || st.level == null || !isFinite(Number(st.level))) return false;
    const level = Math.max(0, Math.min(100, Math.round(Number(st.level))));
    // a light that is off has no colour worth keeping: off is off, whatever it was showing
    const tone = level > 0 ? toneOf(st) : '';
    const t = now();
    let list = lights[id];
    if (!list) {
      if (Object.keys(lights).length >= MAX_LIGHTS) return false;
      list = lights[id] = [];
    }
    const last = list.length ? unpack(list[list.length - 1]) : null;
    if (last && last[1] === level && String(last[2] == null ? '' : last[2]) === tone) return false;
    if (last && t - last[0] < COALESCE_MS && list.length > 1) {
      // part of the same burst: the burst's entry takes the new value, and goes away if the burst ended where it
      // started (on and straight off again)
      list[list.length - 1] = pack(last[0], level, tone);
      const before = unpack(list[list.length - 2]);
      if (before[1] === level && String(before[2] == null ? '' : before[2]) === tone) list.pop();
    } else {
      list.push(pack(t, level, tone));
    }
    if (list.length > PER_LIGHT) list.splice(0, list.length - PER_LIGHT);
    dirty = true;
    return true;
  }

  // Everything a state message carried. states: {id: state}; domainOf(id) says what each device is.
  function record(states, domainOf) {
    let any = false;
    for (const [id, st] of Object.entries(states || {})) if (note(id, st, domainOf(id))) any = true;
    return any;
  }

  // Forget what is older than the window, keeping for each light the entry that was in force when it opens.
  function prune() {
    const cut = now() - DAYS * DAY;
    for (const [id, list] of Object.entries(lights)) {
      let i = 0;
      while (i + 1 < list.length && unpack(list[i + 1])[0] <= cut) i++;
      if (i) { list.splice(0, i); dirty = true; }
      // a light that has been off for the whole window and has no news has nothing to say
      if (list.length === 1) { const [t, l] = unpack(list[0]); if (t <= cut && l === 0) { delete lights[id]; dirty = true; } }
    }
  }

  // The entries between from and to (epoch ms), each light led by the entry in force at `from`, its time moved up
  // to `from`. Returned as [t, level, tone] with tone a kelvin number, a '#rrggbb', or null.
  function slice(from, to) {
    const out = {};
    for (const [id, list] of Object.entries(lights)) {
      const rows = [];
      let lead = null;
      for (const s of list) {
        const e = unpack(s);
        if (e[0] <= from) { lead = e; continue; }
        if (e[0] > to) break;
        rows.push(e);
      }
      if (lead && lead[1] > 0) rows.unshift([from, lead[1], lead[2]]);
      else if (lead && rows.length) rows.unshift([from, 0, null]);
      if (rows.length) out[id] = rows;
    }
    return out;
  }

  // When the history begins: the oldest entry kept, or null before anything has been written. The app tells "no
  // light yet today" from "no history yet" by it.
  function since() {
    let t = null;
    for (const list of Object.values(lights)) if (list.length) { const f = unpack(list[0])[0]; if (t == null || f < t) t = f; }
    return t;
  }

  const toJSON = () => ({ v: 1, lights });
  const takeDirty = () => { const d = dirty; dirty = false; return d; };
  return { note, record, prune, slice, since, toJSON, takeDirty };
}

module.exports = { create, DAYS, COALESCE_MS, PER_LIGHT };
