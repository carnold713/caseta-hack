// Which picture a device or a room gets. Every file named here is one exported from the Figma file (web/ui/art/):
// the Caseta Icon set for kinds of light and rooms, and the few Lutron illustrative icons the frames use.

// A light's kind is `<place>-<fixture>` (web/js/kinds.js). The fixture decides the drawing, and for a lamp the place
// says which lamp.
const BY_FIXTURE = {
  pendant: 'light-pendant', chandelier: 'light-chandelier', sconce: 'light-wall-sconce', picture: 'light-wall-sconce',
  downlights: 'light-downlight', flush: 'light-downlight', spots: 'light-downlight', spot: 'light-downlight',
  track: 'light-track-light', tape: 'light-tape-light', puck: 'light-puck-lights', fan: 'light-ceiling-fan',
  reading: 'light-reading-lamp', torchiere: 'light-torchiere', uplight: 'light-torchiere', accent: 'light-table-lamp',
  headboard: 'light-bedside-lamp', task: 'light-desk-lamp', monitor: 'light-desk-lamp', string: 'light-tree-lamp',
};
const LAMP_BY_PLACE = { desk: 'light-desk-lamp', table: 'light-table-lamp', floor: 'light-floor-lamp', bed: 'light-bedside-lamp' };

export function deviceArt(ctx, d) {
  if (!d) return 'lutron-lamps';
  if (d.domain === 'fan') return 'light-ceiling-fan';
  if (d.domain === 'cover') return 'lutron-rollershades';
  if (d.domain === 'switch') return 'lutron-dimmer';
  const k = ctx.H.lightKind(d.device_id);
  if (k) {
    const [place, ...rest] = k.split('-'); const fixture = rest.join('-');
    if (place === 'outside' && (fixture === 'lamp' || fixture === 'sconce' || fixture === 'lantern')) return 'light-porch-lantern';
    if (fixture === 'lamp') return LAMP_BY_PLACE[place] || 'light-table-lamp';
    if (BY_FIXTURE[fixture]) return BY_FIXTURE[fixture];
  }
  // a light nobody has said the kind of: the Lutron lamp the Home frame draws for exactly that case
  return 'lutron-lamps';
}

// A room's picture for the card that has no photograph yet, from its name. Null when nothing fits: the card is then
// the gradient alone, which is what the file draws for a room it has no icon for.
const ROOM_WORDS = [
  [/living|family|den|lounge|great|media|tv/, 'room-living-room'], [/kitchen|pantry|breakfast/, 'room-kitchen'],
  [/bed|nursery|guest/, 'room-bedroom'], [/office|study|desk|library|work/, 'room-office'],
  [/dining/, 'room-dining-room'], [/hall|entry|foyer|mud|stairs|landing/, 'room-entry'],
  [/porch|patio|deck|outside|outdoor|exterior/, 'room-porch'], [/bath|powder|shower|laundry/, 'room-bathroom'],
  [/garage|shop|workshop/, 'room-garage'], [/garden|yard|pool/, 'room-garden'],
];
export function roomArt(name) {
  const n = String(name || '').toLowerCase();
  for (const [re, art] of ROOM_WORDS) if (re.test(n)) return art;
  return null;
}
export const artSrc = name => `/ui/art/${name}.svg`;
