# The data layer

Phase 1 of the Copper Night rebuild. The app's state, its transport and its rules, with no DOM in them, in
`web/data/`. The old UI and the new one both run on it, so a rule fixed here is fixed in both, and the rules can
be tested without a browser.

## What is in it

| File | Global | What it owns |
|---|---|---|
| `caseta-data.js` | `CasetaData` | The state (`S`), the socket and what each message does to the state, `api()` and the command gate, `hold()` (a light a finger just set beats the bridge's echoes for a moment), save and undo, the connection's quiet window, and every question asked of the inventory: devices, rooms, targets, remotes, `describe()` |
| `home.js` | `CasetaHome` | Light roles, the five suggested scenes and their levels, which scene a room is showing, a room's scenes in order, what is lit, what is pinned to Home and in what order, the one-time seeding of the app's rooms |
| `daylight.js` | `CasetaDaylight` | Follow the day: the curve, who follows it, the words for what a lamp is doing, and the names of whites |
| `edit.js` | `CasetaEdit` | Changing the home: making, renaming, deleting rooms and moving things between them (and asking the bridges to follow); making and editing scenes; a light's kind and role; hiding and removing a device; what the Add a device card offers (a heard device's name, the rooms, which of the Lutron bridge's areas a room maps to) and filing a new device into the room it was put in |
| `remotes.js` | `CasetaRemotes` | Picos: which key is which on each model, learning a remote's numbering from its presses, what a press does and how that is said, the ready-made ways a press can go, night versions, walks through scenes, Leaving, the usual layout, the step editor's fields |
| `routines.js` | `CasetaRoutines` | Routines: time in the home's own zone, on-and-off pairs folded into one, the sentence a routine is said in, the next run and skipping it, the three guided setups, the evening wind-down's numbers, running timers |
| `index.js` | | The ES-module entry for the new UI |

Each file is one file for every host, the same as `web/js/kinds.js`: a plain `<script>` gets the global, a test
`require`s it, and an ES module imports it through `index.js`. Each module is a factory built on a
`CasetaData` instance, and everything it would otherwise reach for in the browser is handed in, so a test can
hand in a fake: `fetch`, `WebSocket`, `storage`, `location`, a clock, `setTimeout`.

```js
import { create, CasetaHome, CasetaDaylight, CasetaEdit, CasetaRemotes, CasetaRoutines } from '/data/index.js';
const data = create({ storage: localStorage });
const home = CasetaHome.create(data);
const day = CasetaDaylight.create(data);
const edit = CasetaEdit.create(data, home);
const remotes = CasetaRemotes.create(data, home);
const routines = CasetaRoutines.create(data, home, remotes);
data.connectWS({ message: (m, r) => { if (r.changed) redraw(r.type); } });
```

## Rules that live here and nowhere else

- **A known home is never blanked.** A snapshot or inventory with no devices, arriving when devices are already
  known, is a hub still waiting for its connector. It is kept out (`apply` returns `keptHome`).
- **The hub's echo of a save is not news.** A `config` message identical to the last save changes nothing.
- **Ten quiet seconds.** `connState()` is `ok`, then `reconnecting` for `RECONNECT_GRACE`, then `off`.
  `noteConn()` says when a window has started so the caller can book the one repaint that turns it red.
- **One command in flight per light.** `gate(send)` returns the slider senders: the newest value goes next,
  everything between is dropped, and the bridge's echo is ignored for `ECHO_QUIET` after.
- **Nothing saves in the middle of a rule.** Where the old code saved partway through (seeding rooms, writing
  the five, following the day), the layer changes the config and says so, and the caller saves.
- **A scene's fade is at most a minute.** The hub keeps a preset's `fade` only from 0 to 60 seconds and drops a
  longer one without an error, so `CasetaEdit.FADES` stops at 60. The old app offered 5, 15 and 30 minutes, which
  never saved; it offers the same steps as the new one now.
- **Undoing a move asks the bridge too.** Moving a device between rooms asks the Lutron or Hue bridge to move it
  as well, so putting the config back is not enough on its own: Undo asks the bridge to move it back.
- **The daylight curve is the connector's.** `test/data/daylight.test.js` compares the anchor table with
  `agent/daylight.py` and runs the connector's own Python at moments through a day, requiring the same kelvin.

## How the old UI runs on it

`web/js/core.js` builds the instances (`DATA`, `HOME`, `DAY`, `EDIT`) and every global name the other scripts call now
points into them: `const describe = DATA.describe`, `const moodLevels = HOME.moodLevels`, and so on. No caller
changed. What is really the UI's stayed where it was: the sheet, the walk, the toast, painting state in place,
the render dispatcher.

## What moved in later phases

Each of these moved at the start of the phase whose screens needed it, after that phase's frames had been read
from the Figma file, because each one depended on something the file decides:

- **Colour vocabulary.** Settled in phase 3: Copper Night has its own twelve lamp colours and names
  (`web/ui/colour.js`), so the old app's swatches stay the old app's.
- **The Lantern tint solver** (`color.js`, lit surfaces pinned to one luminance, room meshes). It is proven by
  `scripts/tint-check.js` against `web/js/color.js` byte for byte, and Copper Night draws lit tiles as copper
  gradients. Reused or deleted when phase 3 settles how a colour lamp's tile is tinted.
- **Button and routine recipes.** Moved in phase 4 as `remotes.js` and `routines.js`.
- **Add a device.** Its rules moved into `edit.js` in phase 5. Hue and Nanoleaf pairing and the setup
  suggestions stay in their screens (`web/ui/screens/settings.js`, `next.js`): each is a few API calls and a
  flag, with no rule another host would share.

## Tests

`npm test` runs `test/data/*.test.js` with the hub's tests. Every test there was also run against a deliberately
broken copy of the rule it guards, to see it go red.
