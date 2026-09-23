# caseta-hack · Pico superpowers for Lutron Caséta

Double-click, hold, custom groups and app-side scenes for Pico remotes, with a
phone app you can install on Android (PWA, packageable with PWABuilder).

```
 phone (PWA) ──HTTPS/WSS──▶  hub on Railway  ◀──WSS (outbound)──  agent at home ──LEAP/TLS──▶ Smart Bridge
                             stores config,                        talks to the bridge,
                             serves the app,                       detects gestures,
                             relays commands                       runs the bindings
```

Why two halves: the Smart Bridge's LEAP API (port 8081) is LAN-only, so
something must run inside your house. The agent is a ~300 line Python
script that runs on any always-on box (Raspberry Pi, NAS, old laptop, a
Docker container). It dials **out** to Railway, so nothing is exposed on
your home network. If the internet drops, the agent keeps running your
Pico bindings from its cached config.

## What you get

- **Remotes:** tap a button on a picture of the Pico (or press it on the
  real remote and the app jumps there), then say what a press, a double
  press and a hold do. One-sentence choices: turn the room on or off,
  nightlight, movie mode, brighten while holding, sleep timer, run a
  scene, everything off. Five usual ways are what you see; **"Show all
  ways" pushes a second sheet**, "All ways", grouped, with a back arrow,
  rather than growing twenty-two rows under your finger. "More options"
  opens the full editor: fade times, several steps in a row, waits, timers. The picture is drawn
  with the real button layout for every Pico model; a "Not your remote?"
  link switches layout and colour, and Lutron's own product photos can be
  dropped into `web/img/picos/` (see the README there) to replace the
  drawings.
- **Any mix of lights per command.** "Which lights?" takes whole rooms,
  single lights, or both, so On can drive three lights while Off drives
  one, without making a named set first.
- **Night-time versions:** any button can do something else between the
  hours you set, like turning on dim instead of bright.
- **Rooms belong to this app.** Settings › Rooms: make a room, rename it,
  delete it, and move any light, shade or remote between rooms, Lutron and
  Philips Hue together. The list starts as whatever your bridges already
  report, one room per Lutron area and per Hue room, so nothing changes
  until you change it; from then on the app's list is the truth and every
  room the app shows comes from it. A room is still one thing a button can
  control ("Kitchen"); hand-picked sets exist under Advanced.
- **Scenes:** a look for the whole house, saved from the lights as they
  are right now, with a fade. Lutron's own scenes sit in the same grid.
  Running one is one tap on Home; everything else is on the **Scenes page**,
  pushed from Home's "See all" (it is not a tab). At rest a tile has one
  job: run the scene. "Edit" beside the section header turns on the
  per-tile pencils, and a tap on a tile then opens it (the editor for
  yours, a short "from the Lutron app" sheet for Lutron's, where the star
  that pins it to the front on Home lives). Making one has a single door:
  the "+" in the page's nav bar, or the empty state's one button. Under
  the tiles, only what a tile cannot show: a room that has never been
  offered its five.
- **Home is a list of rooms** (docs/ia-v5.md). A large title that collapses
  to a 44px bar on scroll, then the **house card**: the headline ("Kitchen
  and Bedroom are on"), the count and the mean level, a dimmer for
  everything that is on, and the power button. All off while anything is
  lit (hold it to close the shades and stop the fans too), and with the
  house dark it brings back the lights that were on before, at the same
  levels (the connector remembers them), or turns everything on, as you
  choose in Settings. The card's "···" holds the three rarer house-wide
  things: Night in every lit room, a sleep timer over everything that is
  on, and "Everything off, and close the shades" in words.
  Under the card, a line for anything due within the hour with a Skip,
  then the **starred lights** as one lamp row (only the ones you starred,
  and no row at all when none are): lit in their own colour at 56px, grey
  and smaller when off; tap one to toggle it, hold a lit one for a sleep
  timer. Then the scenes as one chip row (a tap runs one, "See all" opens
  the Scenes page), then the **rooms as one grouped inset list**: a disc,
  the name, what the room is doing, a chevron and a switch. One row of
  advice (Next) comes last.
- **A room is a page.** Its chevron pushes it: the room's scene chips, its
  lights as one list, and one "Room setup" row. A light's row carries its
  name, its value ("62%", "Off", "Medium", or a colour dot and the colour's
  name), a chevron into the light's page and a switch. No inline slider, no
  sun button, no star, no rainbow button: the light's own page is one tap
  away and is a better dimmer than a 40px well in a list. Fan speeds and
  the open/stop/close of a shade stay on the row. **Room setup** is a page
  under it: what each light is for, the room's scenes, and the kind of each
  light.
- **The light page, and colour.** Drag the disc to dim (or the well beside
  it, or the two chevrons), then one value row: **Colour** (or **Warmth** on
  a lamp that only does white), whose value is the colour the lamp is
  showing, a dot and its name. Tapping it **pushes the colour controls**
  with a back arrow: the warmth slider, every colour at once, and the hue
  and saturation strips. Then the three round buttons: Sleep timer, "Show
  first" (the star that pins the lamp to Home's row), More. The page itself
  sits at the medium detent with nothing under the fold; the colour screen
  goes large on a colour lamp and compact on a warmth-only one. The rainbow
  button that used to sit on the lamp's disc is gone: the ring says the
  lamp has colour, and the row says which colour.
- **The bottom of the screen.** Home has nothing floating: its house card
  is where the house controls live. On Remotes, Automations and Settings a
  44px **pill** appears when something is lit, 8px above the tab bar: a disc
  at the house's mean level, what is on, and the power button (hold it for
  the shades and fans). It slides away on a downward scroll and comes back
  on the way up, it is hidden outright while a sheet is open, and tapping
  it goes to Home. Four tabs: Home, Remotes, Automations, Settings.
- **A drop is quiet.** The hub restarting, or a phone changing network, closes the app's WebSocket; it retries after
  two seconds. For the first ten seconds the status dot is a neutral grey that breathes and reads "Reconnecting", the
  page does not change a word, and nothing goes red. Only after ten seconds without the connector does the dot turn
  red, the headline become "Last known state" and the "Not connected" row appear. A hub that has just come back has an
  empty inventory until its own connector reconnects: the app keeps the home it already knows rather than blanking
  itself for that minute.
- **Sheets have three stops** and are never between them: compact (their own
  content, 180px to 40dvh), medium (56dvh) and large (92dvh). A sheet you are
  editing puts "Done" in its top right and has no footer; a sheet with a real
  primary action keeps a 74px footer. Swipe one down to close it, or from
  large down to medium.
- **One kind of scene.** A scene is a scene wherever it came from. It can
  belong to a room or to none, and that is the only difference between
  them: a scene with a room shows on that room's page, joins its
  step-through, and is grouped under it on the Scenes tab; a scene without
  one is listed under "Any room". Say which lights are the main light, task
  light, lamps or decor and a room can be **suggested five scenes**, Bright,
  Relax, Dinner, Movie and Night, computed from what each light is for.
  They are ordinary scenes from the moment they exist: change any of them
  and it becomes yours, and a later refresh leaves it alone. A scene you
  made yourself can be given a room in its editor and then sits beside
  them. What each light is for, the room's scenes and the kind of each
  light live on the room's **Room setup** page; back is the nav bar, so no
  row on it can dead end.
- **Back to how it was.** A press that puts the lights back exactly as they
  were when they went off: the brightness each one was at and the colour it
  was showing, so whichever scene was running comes back without the scene
  needing to be named. The connector keeps that for every light, frozen the
  moment the light goes dark and kept across a restart. What comes back is
  the sweep, not the archive: whatever went off most recently and everything
  that went dark within two minutes of it, so a room turned off on Tuesday
  and not wanted since is not part of tonight's press. It works on any
  target, so it can be a room's remote or the whole house, and with nothing
  remembered it is an ordinary "on".
- **Arrows that step through scenes:** "Step through scenes" asks which
  scenes, in the order you want them walked. Tap a room's row to take all
  the scenes in a room at once, or tick them one at a time from any room;
  ticking is the ordering. On a remote with a pair of arrows it sets both,
  the up arrow going forwards and the down arrow back, so one press moves
  on and the other undoes it. The loop remembers where it is and checks
  that against the lights, so an arrow pressed twice in opposite
  directions lands where it started even when two scenes are only a few
  per cent apart, and anything that moves the lights in between puts the
  loop back on whichever scene now fits.
- **Kinds of light:** each light can say where it is and what it is,
  two questions in one sheet: Ceiling, Wall, Window, Desk, Table, Floor,
  Under a cabinet, Shelf or cove, Bed or Outside, then the fixture for
  that place (a desk lamp or a desk tape light, a ceiling track light or
  a window track light, a pendant, a chandelier, puck lights, a porch
  light, 46 in all). The kind picks the light's icon and its part in the
  room's suggested scenes. The table is one file, `web/js/kinds.js`, shared by the
  app and the hub.
- **Automations:** things the home does by itself. Three guided setups
  (Welcome lights before sunset, a Wake-up light that rises slowly before
  the alarm, Goodnight and Leaving buttons) and a from-scratch editor:
  a clock time or sunrise/sunset with an offset, the lights, what happens,
  an optional off time, days, skip tonight. Sunset needs the home's rough
  location, taken from the phone once or picked from a city list; it stays
  on your hub. The **Evening wind-down** makes "on" a little dimmer as the
  night goes on, with one control: when the house goes quiet.
- **Add a device without the Lutron app (experimental).** Settings ›
  Add a device puts the bridge into listening mode, you hold the new
  device's button, the app shows what the bridge heard, you name it and
  pick a room. It speaks the same undocumented bridge protocol the Lutron
  app uses (`agent/adddevice.py` lists the four requests) and logs every
  exchange behind "Show technical details" so a bridge that answers
  differently can be understood from the phone. Removing works the same
  way: "Remove from my home" on a light's page or a remote's page sends
  the bridge a delete and clears everything here that used the device. The
  room you pick is one of yours, Hue rooms included: when your Lutron bridge
  has no room to match it, the device is created in one the bridge does
  have, the sheet says which, and the app files it where you asked.
- **Philips Hue too (first pass).** Settings › Connect a Hue bridge: the
  connector finds the bridge on the network, you press its round button,
  and its lights and rooms join the app beside the Caséta ones (its own
  scenes stay in the Hue app; scenes made here can mix both),
  with live state from the bridge's event stream. Rooms, sliders, scenes,
  automations, sleep timers and Pico buttons all work on them, so
  one button can drive a Caséta dimmer and a Hue lamp together. A lamp
  that can do white temperature gets a Warmth slider (Candle to Daylight,
  over the lamp's own range) on its **colour screen**, one tap from the
  Colour row on its page; a colour lamp gets all ten colours at once and,
  under "Any colour", a hue strip and a saturation slider already open (the
  swatch nearest the lamp's colour is marked, so a colour set by a scene
  still shows where it sits). Inside the scene editor the same component
  keeps its eight-swatch scrolling row behind "More colours…". The disc,
  the room row and the scene tiles glow in the lamp's actual colour. A
  scene saved from what is on keeps each Hue lamp's colour or warmth with
  its brightness, and the scene editor has a Colour (or Warmth) row per
  lamp. The connector reads what each lamp can do from the bridge (its
  gamut and mirek range) and clamps every request to it, so nothing is
  ever sent that the lamp cannot show.
- **Nanoleaf too.** Settings › Nanoleaf: hold the power button on the
  controller for 5-7 seconds until its panels flash, then tap Connect.
  Unlike Hue there is no bridge, so this is a list, not one toggle: each
  controller pairs on its own, joins the app as its own light, and can be
  forgotten on its own without touching any other one. It has no room of
  its own to match, so it files into one of your rooms exactly like a
  Caséta device, and it is offered on/off, brightness, colour and warmth
  and works with rooms, scenes, automations and Follow the day the
  same way a Hue lamp does. Built-in Nanoleaf effects are not part of this.
- **Follow the day.** A lamp can keep its white matched to the time of day by
  itself, for as long as it is on: cool and bright around midday, warm in the
  evening, like daylight. The curve is anchored to your own sunrise, solar noon
  and sunset (2000K deep at night, 2700K at sunrise, 5200K at midday, 2900K at
  sunset, 2400K an hour after it) and is clamped to what each lamp can show.
  Switch it on in three places, all the same setting: the row under **Colour**
  on a light's page, "Follow the day" in **Room setup** for the lamps in a room
  that can do warmth, or a **scene** entry that says "follow the day" instead of
  a fixed colour. The light's page shows what the lamp is set to right now and
  the day's shape. Set a colour or a warmth by hand and that lamp stops
  following, and keeps that colour through off and on and a connector restart,
  until you tap "Follow the day again" (or switch it off and on in the list). Brightness is an option, off by default:
  switched on, a following lamp dims towards the evening on the evening
  wind-down's own curve, so the two never disagree. A Caseta dimmer has no
  colour, so it is never offered it.
- **Autosave with Undo.** Nothing to remember to save.
- **Recent activity:** what was pressed and what happened, for "who left
  the lights on" and for tuning the double-press timing.

Works with the regular Smart Bridge (L-BDG2) and the Pro (L-BDGPRO2).

## The Lutron-side caveats

The bridge still runs whatever the Lutron app programmed a Pico to do,
in parallel with your bindings. For a Pico you want to fully own, open
the Lutron app and remove the devices it controls (keep the Pico paired
to the bridge). It then reports presses and does nothing else, and your
bindings are the only thing that runs. A Pico can stay half-Lutron too:
leave its native "On" and "Off", and bind only the double click.

**When every remote goes quiet at once.** The bridge reports presses only
to a client that has subscribed to each button, and pylutron-caseta walks
that list one button at a time and abandons the whole walk at the first
refusal: it logs an error, returns, and lets its login report success. From
the outside nothing looks wrong. The bridge still lists every button, the
lights still answer, and no press ever arrives again. The connector watches
the library's own log for that refusal, asks the bridge again three times,
and if it is still refused says so in Settings › Connection, along with how
long the connector has been running, which version of the library it ended
up with, and the bridge's own last words. Power-cycling the bridge is what
usually clears it.

Rooms are this app's own (Settings › Rooms). It still asks your Lutron
bridge to keep up: a new room is offered to it as a `CreateRequest /area`,
a rename as an `UpdateRequest /area/{id}`, and a light moved between rooms
as an `UpdateRequest /device/{id}` carrying `AssociatedArea`. None of that
is documented by Lutron and a bridge may simply answer 400 BadRequest. It
costs nothing when it does: the room is the app's, everything in the app
keeps working, the room's page says the bridge has no room of its own for
it, and every exchange is in the same log "Show technical details" shows.
The Philips Hue bridge documents rooms and does as it is told, so a room
renamed here is renamed in the Hue app too. Adding a device from the app is
experimental (above): the bridge's association mode and "device heard"
channel are not documented by Lutron either, so the first try on a bridge is
also the test.

## Setup

### 1. Hub on Railway

The repo deploys as-is (Nixpacks, `npm start`). Set these variables on
the service:

| variable | purpose |
|---|---|
| `APP_PASSWORD` | what you type into the phone app |
| `AGENT_TOKEN` | shared secret the home agent presents |
| `DATA_DIR` | `/data`, with a volume mounted there so config survives deploys |
| `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256` | optional, after PWABuilder packaging (see below) |

Then generate a domain. `/healthz` is the health check. The current
deployment lives at https://hub-production-fa07.up.railway.app.

### 2. Connector at home

The easy way: sign in to the app, open Settings › Set up › Connect your
home › Show me how, and paste the one line it gives you into a terminal on
the always-on machine. The line fetches `/install.sh` with the hub URL and
token baked in; the script installs Python dependencies, finds and pairs
the bridge (press its button when asked), and registers a launchd job
(Mac) or a systemd user service (Linux, Raspberry Pi) so it survives
reboots.

By hand, on a machine with Python 3.10+:

```
git clone https://github.com/carnold713/caseta-hack && cd caseta-hack/agent
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python find_bridge.py              # prints the bridge's IP
python pair.py <ip>                # press the button on the back of the bridge when asked
cp .env.example .env               # fill in HUB_URL and AGENT_TOKEN
set -a; . ./.env; set +a; python agent.py
```

`pair.py` writes `caseta.key`, `caseta.crt` and `caseta-bridge.crt` into
`agent/data/` and remembers the bridge's address there too. Give the bridge
a DHCP reservation in your router so that address never changes.
Keep them private: they are full control of your lights.

Run it for good with `caseta-agent.service` (systemd) or the `Dockerfile`
(`--network host` so it can reach the bridge). Within a few seconds the
dot in the app's header turns green and your rooms appear.

### 3. Phone

Open the Railway URL in Chrome on Android, sign in, **Add to Home screen**.
That already gives you a full-screen app with an icon.

For a real APK / Play-Store style install, go to
[pwabuilder.com](https://www.pwabuilder.com), paste the URL, and package
for Android. PWABuilder gives you a signing-key SHA-256 fingerprint and a
package name. The hub serves them at `/.well-known/assetlinks.json`, which is
what makes Android trust the app and hide the browser bar: from
`hub/assetlinks.json` in the repo (the current Android package's), unless
`ANDROID_CERT_SHA256` and `ANDROID_PACKAGE_NAME` (or a whole `ASSETLINKS_JSON`)
are set on Railway, which win.

### Updating the connector

Settings shows the connector's version next to the hub's. Tap **Update
now**, or leave **Update automatically** on (the default) and the hub
updates it by itself whenever a newer connector ships: it sends an
`update` command down the existing link, the connector runs `git reset
--hard origin/<branch>` and `pip install -r requirements.txt`, then
re-executes itself. Pairing is untouched. A connector older than 0.3.0
does not understand the command; run the install line once by hand and
it takes care of itself from then on. Bump `VERSION` in `agent/agent.py`
whenever the connector changes; the hub reads it to know what "latest" is.
Connector 0.8.0 is the first that understands the `color` action and the
object form of scene levels; older connectors ignore colour and apply the
brightness alone. 0.8.1 adds `restore` (the power button with the house
dark): the connector keeps what was lit in the two minutes before the last
light went off, in `last_on.json`, and brings it back at the same levels. 0.9.0 is the first that understands
rooms the app owns: `a:<room>` may name one of `settings.rooms` (it falls back to the bridge's own area, so an
older connector simply goes on reading the bridge), and it takes the `room_*` commands that ask each bridge to
keep up. 0.10.0 is the first that understands "Follow the day": it holds `settings.follow_day`, keeps every
following lamp that is on at the white the day asks for, and reports what it is doing back to the app.

## Configure

1. **Remotes** tab: press any button on a Pico and its remote opens. Tap a
   button, tap Press / Press twice / Hold, pick what should happen. It
   saves as you go.
2. **Scenes** page (Home › See all): set the lights how you like them (Home or the real
   switches), tap +, name it. A remote button can run it.
3. **Automations** tab: pick one of the three guided setups or "Something
   else", answer the questions, done. Each row has a toggle and a next-run
   time; the Home tab shows what is coming up with a Skip.
4. **Settings** is one screen, grouped: **Your home** (the connection, and
   behind it the connector, its version, updating it and the install line);
   **Your home** (the home's name, Rooms and lights, where the home is,
   light sets); **The house** (the power button with the house dark, Night,
   the brightness "on" means); **This app** (add to the home screen, recent
   activity, ideas); **Advanced** (remote timing with its live tester, back
   up and restore); and Sign out. There is no "More settings" page: each
   rare thing is a short page or a small sheet behind one row. Rooms
   (make, rename, delete, move anything between them), adding a device and
   the Hue bridge are all on **Settings › Rooms and lights**.

A worked example, a 3-button Pico in the kitchen:

| button | gesture | actions |
|---|---|---|
| On | single | Group Kitchen → on |
| On | double | App scene "Bright" (cans 100, pendants 100, under-cabinet 100) |
| Favorite | single | App scene "Dinner" |
| Favorite | double | Lutron scene "Movie night" |
| Favorite | hold | Everything → off (a group of the whole floor) |
| Raise | hold begins | Group Kitchen → raise |
| Raise | hold ends | Group Kitchen → stop |
| Raise | single | Group Kitchen → step +10 |

A button whose single press is a brightness step and that has nothing set on
its hold gets the hold for free: holding it ramps the same way the press
nudges, and letting go stops. Set anything on that hold and the fallback
steps aside. `raise`, `lower` and `stop` are bridge commands on a Lutron
zone; on a Hue or Nanoleaf lamp the connector runs the ramp itself, four
points every 160ms, so a held arrow moves those lamps too.

Action types (`hub/validate.js` is the schema): `level`, `step`, `raise`,
`lower`, `stop`, `cap`, `fan`, `scene`, `preset`, `cycle`, `cycle_presets`,
`timer`, `cancel_timer`, `delay`, `restore` (what was on before the house went dark, or plain on) and `color`. `color` is
`{type: "color", target, kelvin: 1000-10000 | hex: "#rrggbb", level?: 0-100,
fade?: seconds}` with exactly one of `kelvin` and `hex`; it reaches only the
Hue lamps in the target that can do what it asks (white temperature for
`kelvin`, colour for `hex`) and turns them on. A scene's `levels[id]` is a
number, a fan speed, or `{level, kelvin}` / `{level, hex}` for a Hue lamp.
The connector reports a lamp's abilities in the inventory (`color: true`,
`ct: true`, `ct_range: [kelvin_min, kelvin_max]`) and its state carries
`color: {mode: "ct" | "xy" | null, kelvin, xy, hex}`.

**Follow the day** is one setting, `settings.follow_day = {device_ids: [], brightness: false}`, and
one extra shape for a scene's `levels[id]`: `{level, follow: true}` in place of a colour, for a Hue
lamp that can change its white. The connector owns the rest: it keeps every following lamp that is on
at the white `agent/daylight.py` asks for. Three speeds, because they are three different
things: drifting with the sun is a change nobody asked for, so it takes 30 seconds on a look every
five minutes and goes unnoticed; a lamp switched on gets today's white in 0.4 seconds, because a lamp
left on a colour is showing the wrong thing until it arrives; a scene that says "follow the day"
brings it over a second, with the scene. A lamp coming on from off is a case of its own: it is given
today's white while it is still dark, in a request of its own that carries no brightness and no "on",
so the fade up happens at the colour it is going to be rather than travelling there from whatever the
lamp was left on, pauses a lamp somebody sets by hand until it is next switched off and on, and
sends `{type: "follow", follow: {ids, paused, kelvin, brightness, ready}}` up so the app can say what
each lamp is doing. The `sun` message carries `noon` now, which is what the app's copy of the curve
hangs on.

Single click on a button that also has a double click binding waits the
double window (default 350 ms) before firing. A button with no double
binding fires instantly.

## Look and feel

The app at `/` is **Copper Night**, a dark design in Figma, on top of the same
hub, connector and data. Its build spec is `docs/design-spec-v6.md`, read from
the Figma file itself; it lives in `web/ui/`, and `/ui/gallery.html` shows every
component. It covers Home, Rooms, a room and its setup, a light (white, colour,
sleep timer, Follow the day, About), a fan, a shade, every scene, Remotes and
what each press does, Routines and the guided setups, Activity, Settings (Hue
and Nanoleaf pairing, light sets, hidden devices, the connector, backup and
restore), adding a Lutron device, and a short onboarding before the password.
`docs/data-layer.md` covers the data layer it runs on. Its motion is the file's
own: the sheet and press springs, page pushes, the load stagger, the dimmer and
scene crossfades and the add-device sonar were read from the file's keyframe
timelines (M1 to M7) and are played by `web/ui/motion.js`.

**The previous app is kept at `/classic/`**, unchanged and linked from
Settings, This app. Everything below about its look describes that one.

`docs/design-spec-v3.md` is the visual spec the interface follows, derived
from the Sonos iOS app: a light grey sheet with grouped grey cards, black
pills and chips, Inter, big left-aligned titles, a dark slate "Light now"
bar above the tabs, dark full-screen Now and light pages, and the lamp ramp
as the only colour. `docs/ui-concepts.md` covers the lamp discs and a room's
scene chips,
`docs/ux-flows.md` the automations, `docs/motion-spec.md` the motion (GSAP
hooks in `js/motion.js`, the three.js light field in `js/lightfield.js`).
Read the spec before changing styles. Sliders are inert to a passing finger
(`js/slide.js`): only a tap or a sideways drag moves one, so scrolling the
page never changes a light, and the viewport does not zoom.

## Layout

```
hub/server.js     Express + ws: static PWA, /api/*, /ws/app (phones), /ws/agent (home), /install.sh
hub/validate.js   config schema, shared truth for bindings and actions
hub/store.js      JSON files in DATA_DIR
web/              the PWA: index.html (the new app, same as web/ui/index.html), classic/index.html (the previous
                  app at /classic/), styles.css, light.css, motion.css, js/{core,pico,home,light,room,rooms,remotes,scenes,settings,automations,cities,color,daylight,boot,slide,motion,lightfield}.js, sw.js, icons/
web/data/         the data layer, no DOM: state, socket, api and command gate, save and undo, inventory and
                  targets (caseta-data.js), roles and suggested scenes (home.js), Follow the day (daylight.js).
                  One file for every host: a script tag, a require, or an import through index.js
web/ui/           Copper Night: index.html + app.js (the app at /, also served at /ui/), motion.js, screens/, screens.css, tokens.css,
                  components.css, icons.js, colour.js, art/ (exported from Figma), gallery.html
agent/agent.py    bridge connection, event fan-out, hub link with reconnect
agent/engine.py   gesture state machine, action runner, timers (pylutron-caseta underneath)
agent/adddevice.py  add a device from the app: association mode, device heard, create, and the
                  undocumented room requests (create an area, rename one, move a device)
agent/hue.py      Philips Hue bridge: pairing, lights and rooms as hue_ devices, levels, colour and warmth,
                  room create/rename/delete and moving a lamp between rooms, event stream
agent/nanoleaf.py A list of directly-paired Nanoleaf controllers, each its own nanoleaf_ device: pairing,
                  levels, colour and warmth, no bridge and no native room, a light poll instead of an event stream
agent/color.py    CIE xy <-> hex with gamut clamping, kelvin <-> mirek, hue/sat <-> rgb, a black-body tint (no dependencies)
agent/daylight.py Follow the day: the anchor table, the sun-anchored curve, mireds, and each lamp's own limits
agent/sun.py      sunrise, sunset and solar noon for a date and a place (NOAA, no network)
agent/pair.py     one-time certificate pairing; find_bridge.py finds the bridge over mDNS
scripts/          install.sh (served filled-in by the hub), make-icons.js
```

## Local development

```
npm install
APP_PASSWORD=dev AGENT_TOKEN=dev npm start     # http://localhost:4400
```

Without a bridge, a fake connector that speaks the same protocol is all the
hub needs; the message shapes are documented at the top of `hub/server.js`
and in `agent/agent.py`. `test/browser/fake_connector.js` is one, and the
browser suite starts it for you.

### Tests

```
npm test               the hub's contracts, the data layer's rules (test/data), and a check
                       that no two app scripts declare the same top-level name (they share
                       one global scope). The Follow the day test runs agent/daylight.py
                       with python3 and requires the same kelvin; without python3 it skips
npm run test:ui        the Copper Night components, measured in Chromium against numbers
                       read out of the Figma file
npm run tint-check     every colour the tinted surface can make, measured for contrast
npm run test:browser   the app itself in Chromium, against a hub and a fake connector
                       the runner starts on a port it picks. test/browser/README.md
```

The connector's own tests need nothing but Python, except where noted:

```
cd agent
python3 test_engine.py      gesture timing, and the action runner's presets and colour
python3 test_buttons.py     a bridge that answers about everything except buttons
python3 test_cycle.py       stepping through scenes, forwards and backwards
python3 test_adddevice.py   the add-device session against a stub bridge
python3 test_color.py       colour maths: round trips, gamut clamping, kelvin
python3 test_daylight.py    Follow the day: anchors, mireds, a lamp's limits, a northern summer
python3 test_lanes.py       a fast swipe: latest level wins, the rest are dropped
python3 test_hue.py         the Hue client against a fake bridge (needs aiohttp)
python3 test_nanoleaf.py    the Nanoleaf client against two fake controllers (needs aiohttp)
python3 test_followscene.py a scene that says "follow the day" (needs aiohttp)
python3 test_followfade.py  how fast the white arrives, and why it is not one answer
python3 test_beforeon.py    a lamp comes on already the colour it is going to be (needs aiohttp)
python3 test_restore.py     back the way it was: levels, colours, and which lights belong to the press
```
