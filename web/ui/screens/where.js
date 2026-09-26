// Where the home is: sunrise and sunset need it, and nothing else does. Asked inline wherever a routine first follows
// the sun (a routine's When, Welcome lights, the evening wind-down), answered with the phone's location or the
// nearest city from a bundled list. It is kept on the home's own hub; no service is ever called.
const LOC = { busy: false, denied: false };

// The question, or once answered, one line saying where.
export function whereBlock(c, { compact = false } = {}) {
  const { esc, icon } = c;
  const loc = c.S.config.settings.location;
  if (loc) {
    return `<p class="t-cap muted where-line">${icon('sun', 18, 1.6)}<span>${loc.name ? `Near ${esc(loc.name)}` : 'Location saved'} <button class="link blue" data-act="loc-city">Change</button></span></p>`;
  }
  const why = LOC.denied ? "Your phone didn't share its location. Pick the nearest city instead." : 'For sunrise and sunset. It stays on your hub.';
  return `<div class="loc-ask ${compact ? 'compact' : ''}"><p class="t-row">Where is your home?</p><p class="t-cap muted">${why}</p>
    <div class="btns"><button class="pill blue" data-act="loc-use" ${LOC.busy ? 'disabled' : ''}>${LOC.busy ? 'Finding you…' : 'Use my location'}</button><button class="pill ghost" data-act="loc-city">Pick a city</button></div></div>`;
}

function cityRows(c, q) {
  const list = window.searchCities ? window.searchCities(q, 12) : [];
  if (!list.length) return `<p class="t-cap muted sheet-p">No city by that name. Try a bigger one nearby.</p>`;
  return `<div class="group">${list.map(x => `<button class="row" data-act="city-pick" data-i="${window.CITIES.indexOf(x)}"><span class="row-txt"><span class="t">${c.esc(x[0])}</span><span class="d">${c.esc(x[1])}</span></span></button>`).join('')}</div>`;
}
function citySheet(c) {
  return {
    over: 'Where the home is', title: 'Which city is nearest?',
    body: `<div class="name-form"><input class="field" data-input="city-q" placeholder="Type a city" autocomplete="off" aria-label="City" value="${c.esc(c.ui.cityQ || '')}"></div><div class="city-list">${cityRows(c, c.ui.cityQ || '')}</div>`,
    after: (c2, r, root) => { const i = root.querySelector('[data-input="city-q"]'); if (i && document.activeElement !== i && !c2.ui.cityTyped) { c2.ui.cityTyped = true; setTimeout(() => i.focus(), 300); } },
  };
}
async function setLocation(c, lat, lng, name, tz) {
  const near = window.nearestCity ? window.nearestCity(lat, lng) : null;
  const nm = name || (near ? near[0] : '');
  c.S.config.settings.location = { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000, name: nm };
  if (tz) c.S.config.settings.timezone = tz;
  await c.save(nm ? `Near ${nm}` : 'Location saved');
}

// A sheet of its own, for a page with nowhere inline to ask (Settings, the wind-down's caption).
export function whereSheet(c) {
  const loc = c.S.config.settings.location;
  return { over: 'For sunrise and sunset', title: 'Where the home is', body: loc
    ? `<div class="group"><div class="row"><span class="row-txt"><span class="t">${c.esc(loc.name || 'Saved')}</span>${c.RT.sunAt('sunset', 0) ? `<span class="d">Sunset ${c.RT.fmtTime(c.RT.sunAt('sunset', 0))}</span>` : ''}</span></div></div>
       <div class="sheet-btns"><button class="pill ghost" data-act="loc-city">Pick a different city</button><button class="pill ghost" data-act="loc-use" ${LOC.busy ? 'disabled' : ''}>${LOC.busy ? 'Finding you…' : 'Use my location'}</button></div>`
    : whereBlock(c) };
}

export const whereActions = {
  'loc-use'(c) {
    if (!navigator.geolocation) { LOC.denied = true; c.render(); return; }
    LOC.busy = true; c.render();
    navigator.geolocation.getCurrentPosition(
      pos => { LOC.busy = false; LOC.denied = false; setLocation(c, pos.coords.latitude, pos.coords.longitude, null, c.RT.phoneTZ()); },
      () => { LOC.busy = false; LOC.denied = true; c.render(); },
      { timeout: 12000, maximumAge: 600000 });
  },
  'loc-city'(c) { c.ui.cityQ = ''; c.ui.cityTyped = false; if (document.querySelector('#sheet-root .sheet')) c.openPicker('city', citySheet); else c.openSheet({ ...citySheet(c), key: 'city', onClose: () => c.render() }); },
  'city-q'(c, el, r, v) {
    c.ui.cityQ = v;
    const l = document.querySelector('#sheet-root .city-list'); if (l) l.innerHTML = cityRows(c, v);
  },
  async 'city-pick'(c, el) {
    const x = window.CITIES[Number(el.dataset.i)]; if (!x) return;
    LOC.denied = false;
    if (c.ui.picker) c.closePicker(); else c.closeSheet();
    // the clock follows the phone, as with "Use my location"; the city's own zone stands in when the phone has none
    await setLocation(c, x[2], x[3], x[0], c.RT.phoneTZ() || x[4]);
  },
};
