/* Pico Hack: the kinds of light. A kind is a place and a fixture, `<place>-<fixture>`: `desk-lamp`, `desk-tape`,
   `ceiling-track`, `window-track`. The room is separate (it comes from the bridge), so "Living room · Window track light"
   is the room name plus the kind's label. Every fixture has a role that a suggested scene dims by: ambient fills the room, task is
   light for your hands, accent is lamps and glow.
   One file for both halves: the browser gets `window.KIND_DEF`, the hub does `require('../web/js/kinds.js')`, so the
   app and the validator agree on the ids and the roles. */
(function (root) {
  'use strict';

  // [fixture id, row title, kind label, role, icon]. The icon is an `#i-<name>` symbol in web/index.html.
  const PLACES = [
    { id: 'ceiling', name: 'Ceiling', icon: 'lamp-ceiling', fixtures: [
      ['flush', 'Flush light', 'Flush ceiling light', 'ambient', 'lamp-flush'],
      ['downlights', 'Downlights', 'Ceiling downlights', 'ambient', 'lamp-downlights'],
      ['pendant', 'Pendant', 'Ceiling pendant', 'ambient', 'lamp-pendant'],
      ['chandelier', 'Chandelier', 'Chandelier', 'ambient', 'lamp-chandelier'],
      ['track', 'Track light', 'Ceiling track light', 'ambient', 'lamp-track'],
      ['fan', 'Fan light', 'Ceiling fan light', 'ambient', 'lamp-fan'],
      ['spots', 'Spotlights', 'Ceiling spotlights', 'accent', 'lamp-spots'],
      ['tape', 'Tape light in a cove', 'Ceiling cove tape light', 'accent', 'lamp-tape'],
    ] },
    { id: 'wall', name: 'Wall', icon: 'lamp-sconce', fixtures: [
      ['sconce', 'Sconce', 'Wall sconce', 'accent', 'lamp-sconce'],
      ['picture', 'Picture light', 'Picture light', 'accent', 'lamp-picture'],
      ['uplight', 'Uplight', 'Wall uplight', 'accent', 'lamp-uplight'],
      ['track', 'Track light', 'Wall track light', 'ambient', 'lamp-track'],
      ['tape', 'Tape light', 'Wall tape light', 'accent', 'lamp-tape'],
      ['mirror', 'Mirror light', 'Mirror light', 'task', 'lamp-mirror'],
      ['panels', 'Light panels', 'Wall light panels', 'accent', 'lamp-panels'],
    ] },
    { id: 'window', name: 'Window', icon: 'window', fixtures: [
      ['track', 'Track light', 'Window track light', 'ambient', 'lamp-track'],
      ['tape', 'Tape light', 'Window tape light', 'accent', 'lamp-tape'],
      ['pendant', 'Pendant', 'Window pendant', 'ambient', 'lamp-pendant'],
      ['spots', 'Spotlights', 'Window spotlights', 'accent', 'lamp-spots'],
      ['string', 'String lights', 'Window string lights', 'accent', 'lamp-string'],
    ] },
    { id: 'desk', name: 'Desk', icon: 'desk', fixtures: [
      ['lamp', 'Desk lamp', 'Desk lamp', 'task', 'lamp-desk'],
      ['tape', 'Tape light', 'Desk tape light', 'accent', 'lamp-tape'],
      ['task', 'Task light', 'Desk task light', 'task', 'lamp-task'],
      ['monitor', 'Monitor light bar', 'Monitor light bar', 'task', 'lamp-monitor'],
    ] },
    { id: 'table', name: 'Table', icon: 'lamp-table', fixtures: [
      ['lamp', 'Table lamp', 'Table lamp', 'accent', 'lamp-table'],
      ['reading', 'Reading light', 'Table reading light', 'task', 'lamp-reading'],
      ['accent', 'Accent lamp', 'Table accent lamp', 'accent', 'lamp-accent'],
    ] },
    { id: 'floor', name: 'Floor', icon: 'lamp-floor', fixtures: [
      ['lamp', 'Floor lamp', 'Floor lamp', 'accent', 'lamp-floor'],
      ['reading', 'Reading light', 'Floor reading light', 'task', 'lamp-reading'],
      ['uplight', 'Uplight', 'Floor uplight', 'accent', 'lamp-uplight'],
      ['torchiere', 'Torchiere', 'Torchiere', 'ambient', 'lamp-torchiere'],
    ] },
    { id: 'cabinet', name: 'Under a cabinet', icon: 'lamp-cabinet', fixtures: [
      ['tape', 'Tape light', 'Under-cabinet tape light', 'task', 'lamp-tape'],
      ['puck', 'Puck lights', 'Under-cabinet puck lights', 'task', 'lamp-puck'],
      ['task', 'Task bar', 'Under-cabinet task bar', 'task', 'lamp-cabinet'],
    ] },
    { id: 'shelf', name: 'Shelf or cove', icon: 'shelf', fixtures: [
      ['tape', 'Tape light', 'Shelf tape light', 'accent', 'lamp-tape'],
      ['puck', 'Puck lights', 'Shelf puck lights', 'accent', 'lamp-puck'],
      ['spot', 'Accent spot', 'Shelf accent spot', 'accent', 'lamp-spot'],
    ] },
    { id: 'bed', name: 'Bed', icon: 'bed', fixtures: [
      ['lamp', 'Bedside lamp', 'Bedside lamp', 'accent', 'lamp-bedside'],
      ['headboard', 'Headboard light', 'Headboard light', 'accent', 'lamp-headboard'],
      ['reading', 'Reading light', 'Bed reading light', 'task', 'lamp-reading'],
      ['tape', 'Under-bed tape light', 'Under-bed tape light', 'accent', 'lamp-tape'],
    ] },
    { id: 'outside', name: 'Outside', icon: 'tree', fixtures: [
      ['porch', 'Porch light', 'Porch light', 'ambient', 'lamp-porch'],
      ['path', 'Path lights', 'Path lights', 'accent', 'lamp-path'],
      ['flood', 'Floodlight', 'Floodlight', 'ambient', 'lamp-flood'],
      ['string', 'String lights', 'Outdoor string lights', 'accent', 'lamp-string'],
      ['landscape', 'Landscape spots', 'Landscape spots', 'accent', 'lamp-spot'],
      ['step', 'Step lights', 'Step lights', 'accent', 'lamp-step'],
    ] },
  ];

  // The nine one-word ids from before kinds had a place. Read as the new id; the hub writes the new id back.
  const LEGACY = {
    ceiling: 'ceiling-flush', pendant: 'ceiling-pendant', downlights: 'ceiling-downlights',
    desk: 'desk-lamp', reading: 'floor-reading', cabinet: 'cabinet-tape',
    floor: 'floor-lamp', table: 'table-lamp', picture: 'wall-picture',
  };

  // KINDS: id -> { id, place, fixture, name, label, role, icon }. ROLES: id -> role.
  const KINDS = {}, ROLES = {};
  for (const p of PLACES) {
    p.fixtures = p.fixtures.map(([fixture, name, label, role, icon]) => {
      const id = `${p.id}-${fixture}`;
      const k = { id, place: p.id, fixture, name, label, role, icon };
      KINDS[id] = k; ROLES[id] = role; return k;
    });
  }
  // A stored id (new or legacy) to the id in the table, or null when it names nothing.
  function normalize(id) { if (typeof id !== 'string') return null; const k = LEGACY[id] || id; return KINDS[k] ? k : null; }
  const placeOf = id => PLACES.find(p => p.id === id) || null;

  const KIND_DEF = { PLACES, KINDS, ROLES, LEGACY, normalize, placeOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = KIND_DEF;
  if (root) root.KIND_DEF = KIND_DEF;
})(typeof window !== 'undefined' ? window : null);
