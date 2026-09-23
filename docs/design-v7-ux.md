# Copper Night v7 · UX

The UX half of the v7 pass (the brief is `design-v7-brief.md`; the UI half is `design-v7-ui.md`). For each of the
twenty: the moment, the flow and its states, the exact copy, what touch does, the data, and the one thing about
light that should feel special. Everything here runs on what the app already knows unless a screen says
**New:** plainly, and every new thing is kept small.

Read with `what-the-app-does.md` beside it: nothing it lists may disappear, and nothing here removes anything.

**Two changes to the list, said up front.**

- **15 is replaced.** "Today in light" moves into 14 as the head of the light log. Both need the same one new
  thing (a short history of light levels) and both serve the same moment (looking back at the day), so as two
  screens they would repeat each other. Its slot goes to **the sleep timer as a candle burning down**, the brief's
  first "if there is room" item: a nightly moment, on data the app already has, and the most literal "light" idea
  on the list.
- **20 keeps its title and changes its scope.** The app is an installed web app. Android does not let a web app
  put a widget on the home screen or a tile on the lock screen; that needs a native shell, which this project does
  not have. What a web app can do is the icon's long-press shortcuts and a notification with buttons, which does
  show on the lock screen. 20 designs those, well, and marks the widget as "if it ever goes native".

Copy in this document is exact and ready to ship. Quoted text is what a person reads; `{braces}` are values.

---

## 1 · Home · the house, lit

**The moment.** Anyone opening the app, usually to do one thing. Before they read a word, the top of the screen
should already have told them whether the house is lit, and roughly how.

**Flow and states**

- **The field.** A soft light field behind the greeting and the house card, about the top 300 of the page. Each
  room with something on adds one pool of light: its colour is the blend of that room's lit lamps (a white lamp
  by its kelvin, a colour lamp by its colour, a Caseta dimmer, which has no colour, as copper), its size and
  strength from the room's mean level. Pools sit in a fixed place per room (from the room's order), so a person
  learns "the left glow is the kitchen" without being told.
- **It drifts, it does not breathe.** Pools wander a few pixels on the 30 s drift. Breathing is kept for one
  meaning across the app: *waiting to hear from the house* (see 18). A breathing Home would read as a problem.
- **Empty (no devices):** no field at all, the plain page and "Add a device" as today.
- **All off:** the field is gone; the page is just `#121212`. That darkness is the information.
- **One room lit:** one pool. **Many:** pools overlap and mix; above five rooms, the five brightest show and the
  rest fold into a faint copper haze so the header never turns into a rainbow.
- **Night hours:** the night look already warms the app; the field also caps at half strength so the phone is
  never the brightest thing in a dark room.
- **Reconnecting (first ten seconds):** unchanged. **Offline:** the field freezes at the last known light and
  cools to ember (18).
- **A change arrives from elsewhere** (a remote, a routine): the pool grows or shrinks over the dimmer's 0.4 s,
  so a glance at the phone shows the house responding.

**Copy.** None new. The headline stays "{n} on · {level}%"; all off reads "All off". The line under the bar
stays "Adjusts the {n} lights on in {rooms}".

**Touch**

- Tap, hold, swipe on the field: nothing. It is light, not a control, and the page scrolls through it.
- Never: the field must not be tappable, and must not sit under a control in a way that makes the control harder
  to read. Text keeps its contrast whatever colour is behind it (the UI half sets a scrim floor).

**Data.** Each light's level, colour mode (white or colour), kelvin or colour, and room. All in the state already.

**Delight.** Open the app at dusk and the top of the screen is the colour of your living room.

---

## 2 · Rooms · light that pools

**The moment.** Someone walking into, or out of, a room, reaching for that room. The list answers "which rooms
are lit" before a name is read.

**Flow and states**

- Each room card's glow is its real light: the pool's radius follows the room's mean level (a room at 10% has a
  small low glow near the power button, a room at 100% fills the card), its colour is the blend of its lamps, as
  on Home. A photographed room gets the same light as a wash over the photo's lower half, so the photo still reads.
- **Turning a room on:** the pool blooms from the power button outward over the dimmer's 0.4 s, reaching the size
  of the level it lands at. **Off:** the pool draws back into the button and goes out.
- **Empty (no rooms):** "No rooms yet" with "Add a room". **One room:** one card, the "All scenes" card above it.
- **A room with only a fan or shade:** no glow, no power button (as built: a room with nothing to switch has none).
- **Night hours:** a room turned on from dark comes on at the evening's level (the wind-down's), not full, and
  the bloom is correspondingly small.
- **Offline:** cards keep their last glow at ember; the power button still takes a tap, which answers with the
  offline toast rather than pretending.
- **Error (a light did not answer):** the pool grows only as far as the lights that did; a toast names the one
  that did not.

**Copy**

- Status under the name, as built: "3 on · 45%", "Off".
- Toasts: "{Room} on · Undo", "{Room} off · Undo".
- One light failed: "{Light} didn't answer. The rest of {Room} is on."
- Offline tap: "Can't reach the house right now. Your remotes still work."

**Touch**

- Tap the power button: on or off. A room is small enough in scope for a tap (see "the on ladder" at the end), and
  it lands at the evening's level at night, with Undo.
- Tap the card: open the room. Hold the card: nothing extra; no hidden menus on cards.
- Swipe: scrolls. A touch that lands while the list is still moving only stops the scroll, as built, so a
  flicked list never turns a room on.

**Data.** Room membership, levels, colours; the wind-down's level now (`curveLevelNow`).

**Delight.** Scroll the list and the lit rooms glow up through it like windows seen from the street.

---

## 3 · A light · the lamp's own glow

**The moment.** Someone who has decided on one lamp and wants it just so: brighter, dimmer, warmer. The page
should feel like touching the lamp.

**Flow and states**

- The hero lamp casts light: a halo (table, floor, pendant) or a cone (spot, downlight, wall washer, from the
  light's kind). Its size tracks the level and its colour the lamp's white or colour. While a finger is on the
  dial, the halo is locked to the finger (M6: no easing), and the number steps with it.
- **Off:** no halo; the lamp art is drawn as an unlit outline. The dial is still there, showing where it will come
  back to, greyed.
- **On-or-off switch (no level):** the halo is either full or none; no dial.
- **Colour lamp showing a colour:** the halo is that colour, and the White and Colour cards say which is showing,
  as built. **Following the day:** the halo is the curve's white right now and shifts on the 30 s drift, so the
  halo is the truthful place to *see* following.
- **Timer running:** a thin ring around the halo draws down with the time left (15 is the full treatment).
- **Night hours:** the halo is capped so it never reaches the screen's edges.
- **Error:** a change the bridge refused puts the dial back where the lamp really is, with a toast.
- **Offline:** halo at ember, dial greyed, a tap on it says why.

**Copy**

- Title as built: room over name, "On · 75%" / "Off" pill.
- Under "Brightness": nothing new. While following: "Following the day · 2900K now".
- Error: "{Light} didn't change. It's still at {level}%."

**Touch**

- Tap the On half of the pill: on, at its last level (or the evening's, at night). Off half: off.
- Drag the dial sideways or by its knob: level. An up or down swipe that starts on the arc scrolls, as built.
- Tap minus or plus: nudge 10.
- Hold minus: dims steadily to 1%, never to off (off is always a deliberate tap). Hold plus: brightens steadily.
- Never: the dial bottoms out at 1%, so a slip on the dial can dim a light but never switch it off mid-drag; off
  is the pill's Off half, one tap. (A change: say so in the build notes if the dial reaches 0 today.)

**Data.** Level, colour mode, kelvin or colour, kind (for halo or cone), timer, follow state.

**Delight.** The glow grows under your thumb before the lamp across the room has finished catching up.

---

## 4 · Colour · painting with light

**The moment.** A colour lamp, a mood: someone wants the living room blue for a film, or amber for a late drink.

**Flow and states**

- The sheet washes towards the picked colour: a low tint over its surface, deepest at the top, so the whole sheet
  is lit by the lamp. The twelve colours are beads of lit glass; the wheel's handle glows with the colour under it.
- **The wash is the lamp's truth.** If a pick is outside what this lamp can show, the lamp is clamped (as today)
  and the wash, the handle's glow and the value dot all show the clamped colour, not the asked one. No warning; the
  bead the person tapped still shows as picked.
- **Lamp off:** opening Colour is intent, so a pick turns it on, in that colour from the first moment (the connector
  sets it while dark), at its last level, or the evening's level at night, not 100% as now. **Change:** today an
  off lamp comes on at 100%; at 11 pm that is the wrong answer.
- **Following the day:** the note stays: picking pauses it. Once paused, a small line at the foot of the sheet
  offers "Follow the day again".
- **Many lamps (a room's colour):** out of scope for this sheet; it stays per lamp.
- **Offline:** beads visible, wash stays at the current colour, a pick answers with the offline toast.

**Copy**

- Header: "Colour", sub "{Light} · {colour name}" (the twelve names in `colour.js`; a wheel pick reads "Custom").
- Following: "Picking a colour pauses Follow the day. The lamp keeps your colour, off and on, until you resume it."
- Toast: "{Light} · {colour name} · Undo".
- Paused footer: "Keeping your colour · Follow the day again".

**Touch**

- Tap a bead: sets at once, the selection ring slides (M1).
- The wheel is a picker and takes the finger at once; a drag moves the lamp through the gate (newest value next).
- Swipe down on the grab bar or header: close. Swipe on the wheel: never closes the sheet.
- Never: a bead scrolled past with momentum does not pick; beads obey the "landing only stops the scroll" rule.

**Data.** The lamp's colour, gamut, level, follow state. The wind-down level.

**Delight.** Tap amber and the sheet itself glows amber, like holding a gel up to the lamp.

---

## 5 · White · the time of day

**The moment.** Someone who wants the room warmer or cooler and thinks of it as "evening light" or "daylight",
not as a number.

**Flow and states**

- The white bar becomes a sky, left to right: candle (dusk, deep amber), warm (late sun), soft white, neutral
  (clear morning), cool, daylight (noon). It stays in mireds, as built, so equal steps look equal. The five named
  whites sit on it as moments of the day.
- **Where the day is now:** a small sun rides the bar at the Follow the day white for this minute ("Outside it's
  about 3400K"). It shows where "following" would put the lamp, so the two features explain each other.
- **Beyond this lamp:** the part a lamp cannot reach is night haze (hatched, as built), with "Beyond this lamp ·
  max 5000K"; a named white past it dims and clamps.
- **Lamp off:** as Colour: a pick turns it on in that white, at its last or evening level.
- **Following the day:** the lamp's marker rides the sun marker; picking by hand pauses it, same note as Colour.
- **Location unknown:** no sun marker, and a quiet line under the bar offers where home is.
- **Offline:** as Colour.

**Copy**

- Header: "White", sub "{Light} · {kelvin}K · {name}" ("2700K · Warm").
- Sun marker label: "Now outside".
- Location missing: "Add where home is to see today's light here".
- Toast: "{Light} · Warm white · Undo".

**Touch**

- Tap a named white: sets at once.
- Drag along the bar: sideways moves the white; an up or down swipe that starts on it scrolls (as built).
- Tap the sun marker: sets the lamp to the day's white right now, as a one-off (does not start following).
- Hold the sun marker: "Follow the day" starts for this lamp; the hold fills the marker with light over 0.6 s.
- Never: tapping the sun marker is not the same as following; the toast says which happened.

**Data.** Kelvin, lamp range, `followKelvinFor(id, now)`, `warmthName`. Nothing new.

**Delight.** Your lamp's white sits on the same sky as the afternoon outside the window.

---

## 6 · A scene arriving

**The moment.** Someone who has just tapped "Relax" and wants to know it happened, with the room already changing.

**Flow and states**

- The tapped chip lights first (0.24 s), then a sweep of light travels out from it across the page: each tile
  it reaches crossfades to its new state, tiles nearer the chip first, 0.04 s apart, all inside the scene's 1 s.
  The count ("3 on") and the room's glow settle last.
- **The wave follows the truth.** A tile crossfades when the light's state arrives (or at its place in the wave,
  whichever is later), so a slow bridge shows as a tile catching up, not as a lie.
- **A scene with a longer fade (15 s, 30 s, 1 min):** the sweep runs at once; tiles take the fade. The chip shows a
  thin progress line under it for the fade's length.
- **Already showing this scene:** a single soft ring from the chip; nothing else moves.
- **One light did not answer:** its tile stays; a note names it with Try again.
- **Offline:** the chip does not light; the offline toast.
- **Lutron's own scenes:** same wave; they are runnable, not editable.

**Copy**

- Toast: "Relax · Put back" (Undo is worded as what it does here; it restores every light the scene touched).
- Already showing: "Already showing Relax".
- A light missed: "Floor lamp didn't change · Try again".
- Long fade: chip sub "Arriving · 30 s".

**Touch**

- Tap a chip: run. Scenes are named, chosen, and undoable in one tap, so they stay a tap.
- Hold a chip (0.5 s): edit it, as a scene tile already does on All scenes.
- Swipe the chip row: scrolls sideways; a touch that lands while it moves only stops it.
- Never: a scene run from dark at night is not capped (a scene is an exact look someone made), but its toast stays
  up for 8 s instead of the usual 5 so Put back is easy to reach.

**Data.** The scene's lights and levels, states as they arrive, the scene's fade.

**Delight.** The light seems to leave your fingertip and walk across the room.

---

## 7 · Scene editor · a stage

**The moment.** Someone shaping a look: "Dinner, but the pendant lower". They are thinking in lights, not rows.

**Flow and states**

- A stage (the room's photo, darkened, or its generated gradient) with one orb per light in the scene, in a row.
  An orb's height is its level (floor is off, top is 100%), its glow its colour or white, its icon its kind.
  It is a mixing desk made of light.
- **Lights in the room but not in the scene** sit as hollow rings on a shelf below the stage.
- **Editing the scene does not touch the room** unless "Show it on the room" is on; then every change moves the
  real light too (through the gate). "Try it" runs the whole scene once, with Put back.
- **Empty scene:** stage dark, shelf full: "Tap a light below to add it".
- **Many lights (more than six):** the stage scrolls sideways; orbs shrink to 44, never smaller.
- **Following the day in a scene:** the orb shows a small sun and the curve's white now.
- **Fade:** chips under the stage: "Instant", "15 s", "30 s", "1 min" (the hub's limit).
- **Offline:** scenes live on the app's server, so a change could not be kept. The stage greys, orbs stop taking
  a finger, and one line says why. Nothing is half-applied or held to send later.

**Copy**

- Title: scene name, tap to rename. Sub: "{n} lights · {room}".
- Toggle: "Show it on the room". Button: "Try it".
- Empty: "Tap a light below to add it".
- Toasts: "Pendant at 40% in Dinner · Undo", "Pendant left out of Dinner · Undo".
- Offline: "Can't change scenes while the house is out of reach."

**Touch**

- Drag an orb up or down: its level. An orb is a grip (takes the finger at once), so the stage does not scroll
  under it; a swipe that starts between orbs scrolls the page.
- Tap an orb: its sheet (level, "As it is", Follow the day, the five whites, the twelve colours), as built.
- Drag an orb to the floor: off in this scene. Drag it onto the shelf: leave it out. Tap a ring on the shelf: add
  it at the room's current level.
- Hold: nothing extra.
- Never: "Show it on the room" is off each time the editor opens, so moving an orb never surprises the room.

**Data.** The scene's entries, the room's lights, kinds, photos. Nothing new.

**Delight.** You set a scene by raising and lowering little lights, and they glow the way the room will.

---

## 8 · Follow the day

**The moment.** Someone curious or doubtful about why the lamp is the white it is, or who picked a colour an hour
ago and now wants the lamp to go back to following.

**Flow and states**

- A 24 hour sky dial: a ring, midnight at the bottom, noon at the top. Day hours (sunrise to sunset) are the sky's
  colour, night hours dark. Around the ring, today's curve glows in its own whites (2000K deep amber at midnight,
  5200K at noon). The sun sits at its live place; the lamp's marker sits on the curve beside it.
- In the middle: the lamp's white now, large ("2900K"), and its name ("Warm").
- **Paused (a colour picked by hand):** the ring dims to a quiet trace; the lamp's marker leaves the ring and sits
  in the middle in its picked colour. One line and one button: resume.
- **Brightness follows too:** a second, inner ring shows the brightness curve (the wind-down's).
- **Several lamps follow:** "Also for" row, as built.
- **Location unknown:** the ring is drawn without a sun and with a single line asking where home is.
- **Lamp off:** marker hollow: "Comes on at 2900K".
- **Offline:** ring and sun keep going (they are maths on today's sun); the marker greys.

**Copy**

- Title "Follow the day", sub "{Light} · {Room}".
- Centre: "{kelvin}K", "{Warm}". Off: "Comes on at {kelvin}K".
- Paused: "Keeping a colour you picked" and the button "Follow the day again".
- Toggles: "Following now", "Dim in the evening too" with "Uses the same curve as the evening wind-down".
- Footer: "Drifts slowly, about 30 s. You won't see it change." (The file's dash becomes a comma.)
- Location: "Where is home? Follow the day needs it for the sun."

**Touch**

- Drag around the ring: a preview only. The marker and the centre show "At 9:00 pm · 2400K"; the lamp is not
  touched. Let go and it springs back to now.
- Tap "Follow the day again": resumes at once; the lamp glides to the curve on the 30 s drift, as the app decided it.
- Never: scrubbing the ring never changes the lamp. A ring drag is a grip; the page scrolls outside it.

**Data.** `followKelvin`, `followPoints`, the sun, `followPaused`, the follow settings. Nothing new.

**Delight.** The dial is today's sky, and your lamp is a small bead of it.

---

## 9 · Evening wind-down

**The moment.** Someone setting up the evening once, or checking at 9 pm why the lamp came on softer.

**Flow and states**

- One horizontal timeline, from an hour before sunset to the next morning. A glow band shows the level "on" gives
  at each moment: full until dimming starts, a ramp down to the evening level, a step to the night level at the
  quiet time, then the soft early morning. A moon sits at the quiet time; "Now" is a thin line.
- **The honest part:** the wind-down sets the level lights *come on at*. It does not dim lights already on. The
  copy says so.
- **Off:** band flat and full height; one line explains; a single toggle.
- **Location unknown:** dimming starts at a clock time instead of sunset; the band's left edge is a time, not a sun.
- **Now inside the night:** the band left of Now is dimmed (past), the rest glows.
- **Night versions of buttons** share these hours; a line says so, linking to them.

**Copy**

- Headline: "Tonight at {11 pm} the house goes quiet."
- Under it: "Lights you turn on after {9:10 pm} come on softer, down to {50}% by {11 pm}, then {30}% until
  {6:30 am}."
- Off: "Off · lights come on as bright late as early".
- Toasts: "Quiet from 11:30 pm · Undo", "Down to 40% · Undo".
- Night buttons: "Buttons with a night version use these hours too".

**Touch**

- Drag the moon sideways: moves the quiet time, 15 min steps, applied on release with Undo. It is a grip.
- Drag the band's lowest step up or down: the evening level (a grip on its handle only).
- Tap the band anywhere: shows "At {10 pm}: {45}%" under the finger for 2 s. Nothing changes.
- Swipe on the page outside the grips: scrolls.
- Never: moving the quiet time never touches a light that is on.

**Data.** `winddownLevel` and its settings, night start and end, the sun. Nothing new.

**Delight.** You can see the evening getting softer, and see your bedtime as a moon rising over it.

---

## 10 · Goodnight house

**The moment.** Last thing at night, one hand, maybe already walking to bed. The house should go dark and the
phone should go dark with it.

**Flow and states**

- The Goodnight row is held for 1 s (as built); the ring fills with light while held and empties if let go.
- **When it completes:** the screen dims room by room *as the house does*: each room's glow on the page goes out
  when that room's lights report off. The route to bed (the light Goodnight keeps) stays as the last small glow,
  with a thin ring counting its two minutes down.
- Then everything is dark except one line, centred: "Sleep well". After 3 s, the page settles into Nightstand
  (19) if it is the night hours, or back to Home if it is not.
- **Nothing kept on:** no ember, straight to "Sleep well".
- **Fans and shades:** listed under the line as they finish: "Fans stopped · Shades closed".
- **One light did not answer:** its room stays lit on the page, truthfully, with "Kitchen strip stayed on" and a
  tap to turn it off.
- **Offline:** the hold still fills, and on completion: "The house didn't hear that. Your remotes still work."
  No darkening, since nothing went dark.

**Copy**

- Row: "Goodnight house", "Hold to turn everything off".
- While the route stays lit: "{Hall light} stays dim for two minutes".
- End: "Sleep well". Toast under it for 8 s: "Goodnight · Put back".
- Partial: "{Light} stayed on · Turn off".

**Touch**

- Hold 1 s: Goodnight. A tap on the row: the sub line flashes "Hold it" for 2 s, nothing else.
- During the dark-out: a tap anywhere skips to the end state, never cancels Goodnight.
- Put back: a tap, brings back exactly what was on. It is a deliberate choice in the toast, not a stray.
- Never: the dark-out is not a countdown. Goodnight has happened by the time the screen dims.

**Data.** `goodnightActions`, the kept light, state messages, fans, shades, night hours.

**Delight.** The phone goes dark in the same order as the house, and says goodnight last.

---

## 11 · Wake-up light

**The moment.** Setting up waking to light, usually in the evening, wanting to know what 6 am will feel like.

**Flow and states**

- The guided setup's summary page gains a preview: a strip from the start of the rise to the alarm, with a sun you
  drag. As you drag, the whole screen brightens and warms the way the bedroom will at that minute: black, then a
  deep ember, then the lamp's white at its end level.
- **The preview tells the truth about colour.** The wake-up is a level with a long fade; the colour is the lamp's.
  If the lamp follows the day, the preview uses the curve's white at each minute (about 2200K before sunrise,
  2700K at it). If not, it uses the colour the lamp was last left in, and says so.
- **Dimmer with no colour:** preview is copper.
- **Already on at wake time:** the routine is skipped (only if all off); the page says so.
- **Many wake-ups (weekdays, weekend):** one row each, each with its own preview.
- **Lamp is a switch:** no rise possible; the setup offers a lamp or a dimmer.

**Copy**

- Summary (as built): "{Bedside lamp} starts rising at {6:05 am} and reaches {50}% by {6:30 am} {on weekdays}.
  Skipped if it is already on."
- Strip ends: "{6:05 am}", "{6:30 am}". Sun label while dragging: "{6:18 am} · {22}%".
- Not following: "It rises in the colour it was last left in."
- Try it: "Hold to try it on the lamp · 30 s".
- Toast: "Wake-up light on · Undo" (it is created at once, as every routine is).

**Touch**

- Drag the sun: preview only; nothing in the bedroom changes.
- Hold "Try it" 0.6 s: the real lamp runs the rise compressed to 30 s, then offers Put back. A hold, because a
  stray tap at 11 pm would light the room someone is sleeping in.
- Tap the times or days: their pickers, as built.

**Data.** The wake-up's start, minutes, end level, days; the lamp's colour and follow state; the curve.

**Delight.** Your phone rehearses tomorrow's sunrise in your hand.

---

## 12 · Welcome lights, coming up

**The moment.** Late afternoon, someone glancing at Home who wants to know the porch will be on when they get
back, and to skip it if they will not be out.

**Flow and states**

- Within the hour before a routine runs, Home's "Coming up" line becomes a card with a ring. The ring fills with
  light as the moment nears; at sunset, the ring's colour moves from daylight to the lamp's evening warmth.
- **When it runs:** the ring closes, a small bloom, and the card becomes a line: "{Porch} is on · off at {11 pm}".
  After 10 min it goes.
- **Skipped:** the ring empties and greys; "Skipping tonight" with "Don't skip".
- **Only if the house is dark, and it is not:** the card says it plainly, so a skip is not a surprise.
- **Did not run:** from the activity log (`ok: false`): the card stays with the reason and a way to do it now.
- **Many coming up:** the soonest gets the ring; others are lines under it.
- **No location:** sunset routines say they need it (rare, since the setup asks).
- **None set up:** no card; the suggestion slot may offer Welcome lights, as built.

**Copy**

- Card: "{Porch at dusk}", sub "{Porch light} on at {7:12 pm} · in {24} min", link "Skip tonight".
- Running: "{Porch light} is on · off at {11:00 pm}".
- Skipped: "Skipping tonight", link "Don't skip".
- Waiting on the dark: "Runs only if the house is dark. {Kitchen} is on right now."
- Missed: "{Porch at dusk} didn't run: couldn't reach the bridge." Button: "Turn it on".

**Touch**

- Tap Skip tonight: skips at once, toast with Undo.
- Tap the card: opens the routine.
- Tap "Turn it on" (a missed routine): turns its lights on. One named light, a deliberate button, a tap.
- Swipe: scrolls. Never: the ring is not a button; nothing on the card turns on early.

**Data.** `upNext`, `nextRunOf`, skipping, only-if, sunset, the activity log for failures. Nothing new.

**Delight.** You can watch dusk arrive around a small ring, and know the door will be lit.

---

## 13 · A remote, pressed

**The moment.** Someone standing with a Pico in one hand and the phone in the other, finding out or checking what a
button does.

**Flow and states**

- A real press jumps to the remote, as built, and now the light travels: the pressed key lights, the leader line
  carries a bead of light to the label, and the lights that press drives pulse once in a strip under the remote,
  **as their new state arrives** (a pulse is a confirmation, never a prediction).
- **Press twice:** two beads, a beat apart. **Hold:** the key glows for as long as it is held and the bead stays
  on the line; the strip's lights ramp live.
- **Night version active:** the label and bead are the night's warmer tone, and the label reads the night version.
- **Nothing set on that press:** the key lights grey, the bead stops at the label: "Nothing set yet".
- **A press that drives a light that no longer exists:** the bead turns red at the label (as built).
- **An unknown remote:** Home shows a card offering to add it, not this page.
- **Offline:** the phone cannot hear presses. The remotes still work; the page says so and nothing lights.

**Copy**

- Banner (as built): "Press any button on a real remote to jump to it".
- Label while pressed: the press's sentence ("Turn on · Kitchen").
- Nothing set: "Nothing set yet · Set it".
- Night: "After 10:30 pm: Nightlight level".
- Offline: "Your remotes still work. This page lights up again when the house is back in touch."

**Touch**

- Tap a drawn key: what that press does (as built). Tap a label: the same.
- Hold a drawn key: nothing different from a tap.
- Never: a key drawn on the screen never presses the real button, runs its action, or tries it. Trying is done
  with the remote in hand, which is the point.

**Data.** Button and gesture messages, what each press does, which lights it drives, night hours, state. Nothing new.

**Delight.** Press the real button and watch the light run out of it, down the line, into the room.

---

## 14 · Activity as a light log (with Today in light)

**The moment.** "Who left the lights on?", "When did the porch go off?", or just a curious look at the day in the
evening.

**Flow and states**

- **Today in light**, a card at the top: three short facts about the day's light, in words.
- **The ribbons:** one thin strip per room, across 24 hours, filled where the room was lit: height or brightness by
  level, colour by the room's light. Rooms never lit today are listed as one line, not drawn.
- **The log** under the ribbons, as built, with its filters.
- **Scrubbing:** tap or drag along the ribbons and a thin line shows that moment: each room's level, and the log
  scrolls to the nearest entry. Where a change lines up with a log entry (a press, a routine, the app), it says
  who: "by the Kitchen Pico".
- **Early in the day:** "So far today". **History not there yet:** the card and ribbons wait with one line.
- **Previous days:** up to 7, one at a time.
- **Offline:** shows what it has, with the offline line.

**Copy**

- Card title: "Today in light".
- Facts (the three that apply): "Lit for {6 h 20 min} across the house", "Softest after dark: {12}% in
  {Bedroom} at {11:05 pm}", "On longest: {Floor lamp}", "Everything off at {11:40 pm}".
- Waiting: "Light history starts today. Come back this evening."
- Scrub line: "{9:40 pm} · Kitchen {30}% · Warm · by the Kitchen Pico".
- Day header: "Today", "Yesterday", "Monday".

**Touch**

- Tap or drag sideways on the ribbons: scrub. An up or down swipe that starts on them scrolls.
- Swipe the day header left or right: another day.
- Tap a log entry: its light or remote.
- Never: nothing here controls a light. It is a record.

**Data.** **New:** a light history. The hub keeps each light's level and white or colour at each change, for 7
days, and serves a day at a time. Everything above is worked out from that plus the activity log. It is the only
large-ish addition in this document, and it is still just "log the state messages the hub already receives".

**Delight.** Your day, drawn as the light it was.

---

## 15 · Sleep timer · a candle burning down (replaces "Today in light")

**Why here.** See the top: "Today in light" is now part of 14.

**The moment.** In bed or on the sofa, someone who wants the lamp to go out by itself after they have stopped
thinking about it.

**Flow and states**

- The sleep timer sheet (06b) keeps its choices. Once running, it shows a candle: the flame is the lamp's own
  colour, the candle's height the time left over the time chosen. It burns down smoothly (it is the app deciding,
  so it is slow and quiet).
- **At the end:** the lamp fades out (the timer fades, it never snaps) and the flame gutters with it, shrinking and
  going out as the lamp's state arrives.
- **Timer set to a level, not off:** the candle burns down to a low stub that stays lit.
- **Many timers:** a candle each, small, on the light's page and on Home's "Coming up".
- **Started by a remote or routine:** same candle.
- **Offline:** candle keeps burning (the connector keeps the timer), a line says so.
- **Night hours:** the candle is the brightest thing on the page and that is fine; nothing else glows.

**Copy**

- Choosing (as built): "Pick how long. The light fades out at the end, it won't snap off."
- Running: "{Floor lamp} fades out at {11:42 pm}", "{38} min left".
- To a level: "{Floor lamp} goes down to {10}% at {11:42 pm}".
- Buttons: "Add 15 min", "Stop the timer", "Off now".
- Offline: "The house keeps the timer. It will still go out."

**Touch**

- Tap Add 15 min: the candle grows back.
- Tap Stop the timer: the light stays as it is; toast with Undo.
- Tap Off now: off at once; toast with Undo.
- Never: stopping the timer never turns anything on or up.

**Data.** Timers (`ends_at`, level). **New, small:** the timer also records how long it was set for, so the candle
knows its full height when a remote started it. Until then, a timer the app did not start draws its candle from
the time left.

**Delight.** The lamp across the room is going out slowly, and so is the candle in your hand.

---

## 16 · Onboarding

**The moment.** The first time, on a new phone, maybe with the lighting already installed and the connector
running. They want to know what this is and get in.

**Flow and states**

- A drawn house, the same on all three pages. Page 1 ("Control every light"): one window lights. Page 2 ("Every
  button, your way"): a hand and a Pico by the door, and a second window lights as it is pressed. Page 3 ("The
  house on its own"): the sky goes to dusk, the porch comes on, and a bedroom window rises slowly.
- **Password:** the house waits, all windows lit, behind the field.
- **After sign-in:** the drawing becomes this home: one window per room (up to eight), lit where rooms are really
  lit now. A short line counts what was found.
- **Wrong password:** the windows dim once; the field says so.
- **Connector not running yet:** the house is drawn dark and the one line that installs it is offered.
- **Seen before:** straight to the password, as built. "What this app does" brings the pages back.

**Copy**

- Page 1: "Control every light". "Caséta, Hue and Nanoleaf together. Nothing to save: everything is undoable."
- Page 2: "Every button, your way". "Press, press twice, hold: each can do something different, and something else
  at night."
- Page 3: "The house on its own". "Lights on before you get home, a slow light to wake to, a calmer evening. A
  minute each to set up."
- Password: "Welcome", "Enter your home's password to get started."
- Wrong: "That's not it. Try again."
- Found: "Your home: {7} rooms, {23} lights."
- No connector: "Your home's computer hasn't said hello yet."

**Touch**

- Tap Next, or swipe left: next page. Swipe right or back: previous.
- Never: onboarding changes nothing in the house.

**Data.** Rooms, lit state, connector status. Nothing new.

**Delight.** The drawing becomes your house, and its windows are lit where your rooms are.

---

## 17 · A device added

**The moment.** Someone with a new dimmer or Pico in hand, pressing and holding its button, a bit unsure.

**Flow and states**

- As built (M7): listening sonar, a ping when heard, the card with the name and room chips.
- **New:** when "Add to my home" is tapped, the device's icon leaves the card as a small light and travels down to
  a strip of room chips, into the chosen room; the room's chip glows once, and then the page offers the room.
- **A dimmer or switch:** "It works right away". **A remote:** straight to its page to set it up.
- **Nothing heard (after a while):** the hint as built. **Several heard:** the list card, as built.
- **Room with no Lutron area:** the note as built. **Bridge error:** plain words and "See what the bridge said".
- **Offline:** listening cannot start; the reason is said.

**Copy (as built, plus)**

- "Tap Listen, then hold the small button on your new device for 10 seconds."
- "Nothing yet? Let go, wait a moment, and hold again. A device from another home needs a factory reset first."
- Done: "Added {Hall dimmer}". "It is in {Hallway} and shows up there in a moment."
- New button after it lands: "Go to {Hallway}".
- A remote: "Set it up now".

**Touch**

- Tap a room chip: picks it. Tap "Add to my home": adds.
- Hold: nothing. Swipe the card down: back to listening.
- Never: adding a dimmer does not turn it on to "show" it.

**Data.** The add session, the rooms, the created device. Nothing new.

**Delight.** The new device drops into its room as a spark, and the room lights up to welcome it.

---

## 18 · Offline, calmly

**The moment.** The internet flickers, the house computer restarts, the bridge stops answering. The person should
feel "it's working on it", never "I broke it".

**Flow and states**

- **First ten seconds:** unchanged; a grey dot breathes after the greeting.
- **After ten seconds:** every glow in the app (Home's field, room cards, tiles, halos) settles to one ember: low,
  warm, and breathing slowly on the 1.6 s loop. Everything stays readable at its last known state. The card says
  which link is out, and what, if anything, to do.
- **Four failures, four sentences:** this phone, the app's server, the house computer, the Lutron bridge.
- **Taps while offline:** answered at once with the toast. **Commands are never queued** to replay later; a light
  changing by itself half an hour after a tap would be worse than the tap failing.
- **Coming back:** the ember stops breathing and each glow returns to its true light over 0.4 s. A line says so
  once.
- **Night:** the ember is dimmer still.

**Copy**

- Greeting: "Offline · showing last known state" (as built).
- Card, by cause: "This phone is offline. Your remotes still work." / "Can't reach the app's server. Your remotes
  still work." / "The house computer isn't answering. It may be restarting." / "The Lutron bridge isn't answering.
  Check it has power."
- Tap toast: "Can't reach the house right now. Your remotes still work."
- Back: "Back in touch".

**Touch**

- Tap the card or the greeting: the connection sheet.
- Controls: work as normal and answer with the toast.
- Never: nothing turns red in the first ten seconds, nothing is blanked, nothing is queued.

**Data.** `connState`, the agent's status, the connection sheet's four links. Nothing new.

**Delight.** When it can't reach the house, the app keeps its light low and warm, like a banked fire.

---

## 19 · Nightstand mode

**The moment.** 2 am, awake, the phone on the nightstand. Someone wants a little light to get up by, without
waking anyone, then to put it out.

**Flow and states**

- **When:** the app opens into it in the night hours when nothing inside is lit (outdoor lights left on overnight
  do not count), or straight after Goodnight (10).
  "Home" in a corner leaves it.
- **The page:** near black, no field, the time small, one very large soft area: "Night light". A web page cannot
  dim the phone's screen, so it draws dark and avoids white entirely.
- **The night light is a held touch, not a tap.** Rest a thumb and, after a quarter of a second, a candle glow
  rises under it, and the lamp rises with it to 10% at its warmest white. Let go and it stays. After 15 min it goes
  out by itself (Light the way).
- **Lamp on:** the area becomes "Off", which is a tap.
- **Which light:** the one Goodnight keeps, else one chosen once here.
- **No night light chosen:** "Pick a light for night".
- **Morning (night hours end):** goes back to Home.
- **Offline:** "Can't reach the house. Your remotes still work."

**Copy**

- "Night light", sub "Rest your thumb to turn on".
- On: "{Bedside lamp} · 10% · off by itself at {2:21 am}". Area: "Off".
- Choose: "Pick a light for night". Leave: "Home".

**Touch**

- Rest a thumb 0.25 s: on, growing as held, to 10%. Tap when on: off.
- Swipe: nothing moves; the page does not scroll.
- Never: a brush or a pick-up turns nothing on; nothing ever comes on above 10% here.

**Data.** Night hours, lit state, the Goodnight kept light, the Light the way recipe. **New, small:** one setting,
the night light.

**Delight.** Your thumb makes the light, a small warm glow under it and across the room.

---

## 20 · Beyond the app

**Why the change.** An installed web app cannot place a widget or a lock screen tile on Android. It can offer
shortcuts on the icon and a notification with buttons, which the lock screen shows. That is what this designs.

**The moment.** In bed, on the way out, the phone locked: someone wants one thing without opening the app.

**Flow and states**

- **Icon shortcuts** (long-press the app icon): "All off", "Goodnight", "Night light", "Scenes". All off runs and
  then opens with Undo; Goodnight opens the hold (10), never runs by itself; Night light opens 19.
- **One quiet notification** while something is running on its own: a sleep timer (15), or the Goodnight route
  light. It shows the end time, not a live count, and offers buttons.
- **Nothing running:** no notification.
- **Notifications not allowed:** the shortcuts still work, and the app asks once, never again.
- **Widget, if it ever goes native:** a card with the house's glow, "{3} on", and All off. Drawn as a concept.

**Copy**

- Shortcuts: "All off", "Goodnight", "Night light", "Scenes".
- Timer notification: "{Floor lamp} fades out at {11:42 pm}", buttons "Off now", "Add 15 min".
- Goodnight: "{Hall light} stays dim until {11:02 pm}", button "Off now".
- Asking: "Show running timers on the lock screen?" with "Allow" and "Not now".

**Touch**

- A shortcut: its action or its page. A notification button: its action, then the notification updates.
- Never: nothing outside the app turns lights on. Every action outside the app turns off, stops, or adds time.

**Data.** Timers, the Goodnight kept light. **New, small:** notifications need the service worker to hold the
sign-in, and the manifest's shortcuts change to these four.

**Delight.** The same small candle and the same copper, even on the lock screen.

---

## Across all twenty

- **Glow means light that is really on.** Every glow is drawn from a light's actual level and colour. It grows
  when the state arrives, not when a finger is lifted, except under a finger on a slider, where it follows the
  finger. Copper is light that is on; Lutron blue stays Lutron's things.
- **Colour is never slid.** A lamp, halo, tile or pool arrives in its colour and changes brightness; colour changes
  crossfade, as the connector does.
- **Breathing means waiting.** Only the reconnecting dot, Add a device's listening and the offline ember breathe.
  Everything else drifts or stands still.
- **The on ladder.** Turning off is always a tap. Turning on: a light or a room is a tap (and lands at the evening's
  level at night), a scene is a tap with Put back, the whole house is a 0.6 s hold, Goodnight a 1 s hold, anything
  in Nightstand a held thumb. A tap on a held control says "Hold it", and does nothing else. Nothing outside the app
  turns lights on.
- **Holds look the same.** A hold fills its control with light from the left or round the ring, and empties if let
  go.
- **Previews never touch the house.** Scrubbing the sky dial, the wind-down, the wake-up strip, the ribbons, the
  scene editor with "Show it on the room" off. Anything that does touch the house is labelled "Try it" and offers
  Put back.
- **Sliders and grips.** A slider moves sideways and lets a vertical swipe scroll. A grip (a knob, an orb, the moon,
  the sun) takes the finger at once. A touch that lands on a moving page only stops it.
- **Night changes three things.** Every glow is capped at half; a light turned on from dark comes on at the
  evening's level; Undo toasts stay longer (8 s).
- **Undo is worded as what it does.** "Undo" for a change, "Put back" for a scene, Goodnight or Try it. Never a
  Save button.
- **Offline is calm.** Last known state, ember glow, one sentence naming the cause, the remotes still work, nothing
  queued.
- **Reduced motion.** Every sweep, bloom, bead and wave becomes a plain crossfade; every glow still shows its
  light.
