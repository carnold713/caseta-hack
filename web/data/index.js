// The data layer for code written as ES modules (the Copper Night UI in web/ui/). Each file is one file for every
// host, the same as web/js/kinds.js: imported for its side effect it sets a window global, which this hands on as
// named exports. The old UI loads the same files as plain <script>s, so both UIs run on one layer.
//
//   import { create } from '/data/index.js';          the state, the wire, every question asked of the state
//   import { CasetaHome } from '/data/index.js';      roles, the five scenes, room seeding: CasetaHome.create(data)
//   import { CasetaDaylight } from '/data/index.js';  Follow the day's curve and words: CasetaDaylight.create(data)
//   import { CasetaEdit } from '/data/index.js';      rooms, scenes, kinds, hiding, removing: CasetaEdit.create(data, home)
import './caseta-data.js';
import './home.js';
import './daylight.js';
import './edit.js';

const CasetaData = window.CasetaData;
export default CasetaData;
export const CasetaHome = window.CasetaHome;
export const CasetaDaylight = window.CasetaDaylight;
export const CasetaEdit = window.CasetaEdit;
export const {
  create, RECONNECT_GRACE, ECHO_QUIET, RECONNECT_AFTER, ACTIVITY_MAX, MODEL_NAMES, LAYOUTS, GESTURE_LABEL,
  esc, uid, clamp, cap, plural, fmtDur, fanName, fmtTime, levelOf, colorOf, tlist, tsplit, userGestureOf, friendlyError,
} = CasetaData;
