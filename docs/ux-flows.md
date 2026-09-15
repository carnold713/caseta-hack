# Pico Hack: UX flows for automations, wind-down, moods and the new recipes

Companion to `design-spec.md` (the look, unchanged) and `lighting-features.md` (ideas 1 to 7). Every screen below uses the spec's components. Strings in quotes are final copy. The house rule holds everywhere: nothing has a Save button; each change saves as it happens and the toast offers "Undo". "Schedule", "binding" and "target" never appear in copy; the thing a person builds is an "automation".

## 1. Where automations live: a fifth tab

Add a fifth bottom-bar item, **"Automations"**, between Scenes and Settings, reusing the `clock` glyph. The bar is the app's table of contents for a household that will not read a manual, and "what happens on its own" is a different question from "what a button does" (Remotes) and "how the lights look" (Scenes). It is also a surface people return to weekly: "is the porch coming on tonight?", "don't wake me tomorrow", "pause it while we're away". Buried in Settings it sits under the install line; folded into Scenes it makes the tab name a lie. It gives the wind-down control and the location step a home too, so Settings stays plumbing. Cost: five labels at 11px; "Automations" fits from 360px up, "Routines" is the fallback if a device clips it. If the owner insists on four tabs, everything below survives as a section "On its own" at the top of Scenes.

## 2. Home: the "Coming up" block

A `Steel` soft info block under the All off button, present only when an automation runs in the next 24 hours. Title "Coming up". Up to two rows, "Welcome lights · 6:52pm" and "Wake-up light · tomorrow 6:05am", each with a small secondary "Skip". Tapping the title opens the Automations tab. Skip sets the skip date to that run's date, toasts "Wake-up light will skip tomorrow. Back on Wednesday at 6:05am." with Undo, and the row reads "Skipping · then Wed 6:05am". Offline: last known times; the page already carries the not-connected banner.

## 3. Automations list

**Title** "Automations". **Help** (Body, `--text-2`): "Things your home does by itself. They keep running even when your phone is off."

1. Top bar: title, status pill.
2. Card "Evening wind-down" (section 6), always first.
3. Section "Your automations", one white list card. Row: 40px circle with `sun` (sunrise), `moon` (sunset) or `clock` (time); name (Card title); two Caption lines: the rule, then the next run; a toggle at right. Tap the row to edit.
   - Rule line: "Every day, 20 minutes before sunset", "Weekdays at 6:05am", "Mon, Wed, Fri at sunrise". A paired off time (section 4.3) folds into the same row: "On at dusk, off at 11:00pm · Every day".
   - Next line: "Next: today at 6:52pm", "Next: tomorrow at 6:05am", "Next: Monday at 6:05am". Variants: "Skipping tonight · then tomorrow at 6:51pm"; "Paused" when the toggle is off (row text `--text-3`); "Needs your home's location" with a leading orange dot when it follows the sun and no location is set (tap goes straight to the location step); "Didn't run last time" with an orange dot when Recent activity holds a failed run for this id.
4. Footer: "New automation" outlined card.
5. Caption at the very bottom: "Have timers in the Lutron app? Keep them in one place, here or there, so they don't fight."

**Primary action**: "New automation". **Empty state** (replaces 3 to 5): a `Blush` block "Let your home take care of the evenings" / "Lights on before you get home, a lamp that wakes you gently, one button for goodnight. Each takes about a minute." with a plus circle, then the three guided-setup cards from section 5 and a "Something else" outlined card. **Offline**: `Lemon` block above the list, "Not connected right now" / "Your home keeps running these on its own. This list may be a little behind." If a next-run time is already in the past, the row shows only its rule line. **Saves**: the toggle saves at once, toast "Welcome lights paused" / "Welcome lights back on" with Undo.

## 4. New automation and the editor

Tapping "New automation" opens a question sheet: **"What would you like to set up?"** / "Three ready-made ones, or start from scratch." Rows: "Welcome lights · On before you get home, off at bedtime"; "Wake-up light · A lamp rises slowly before your alarm" (hidden when no dimmable light exists); "Goodnight and Leaving buttons · One hold shuts the house down" (hidden when no remote exists); "Something else · Any lights, any time". The last opens the editor.

### 4.1 The editor (sheet)

**Title** (new): "What should happen, and when?" / "Pick a time, the lights, and what they do. It saves as you go." **Title** (existing): the automation's name centred, Caption sub = its rule line. The benchmark, "porch on at dusk, off at 11", is four taps: When → Sunset → Use this time; Then turn off again → 11:00pm. Lights and action are pre-filled.

1. Row **"When?"**: value "Pick a time" with an orange dot until set; then "At sunset · 7:12pm today", "20 minutes before sunset · 6:52pm today" or "At 6:30am". Opens the When sheet (4.2).
2. Section **"Which lights?"**: the recipe sheet's chip row (rooms, "Everything", "Specific lights…"), pre-filled with the first room. When shades exist an "All shades" chip joins the row, and the full chooser gains a "Shades" accordion that appears only when the chosen action can move them.
3. Section **"What should happen?"**: recipe cards, one selected (default "Turn on"): "Turn on"; "Turn off"; "Full brightness"; "Half brightness"; "Nightlight · Very dim, 10%"; "Rise slowly · From dark to 50% over 25 minutes"; "Run a scene…"; "Close the shades" and "Open the shades" (only when shades are picked); "Turn the fan off" (only when fans are picked). A hand-edited list shows as the `Sand` block "Custom" with the `describe()` sentence.
4. Row **"Then turn off again"** (shown whenever the action leaves something on; reads "Then open again" for shades): "Leave them on" by default, else "At 11:00pm" / "At sunrise". Opens the When sheet titled "Turn off again when?".
5. Section **"Which days?"** (4.4).
6. Secondary "Try it now" (runs it once, toast "Done"; offline, the existing "Can't reach your home right now" toast).
7. Secondary "Skip tonight" (4.5), once the automation exists.
8. Plain link row "More options" (4.6).
9. Sticky footer: primary "Done", disabled until When is set; the orange dot says why.

**How it saves**: the automation exists the moment it has a time (lights and action are always filled). Until then the sheet holds it in memory and closing throws it away silently. From then on every change autosaves, toast = the sentence, "Turns Porch on 20 minutes before sunset", with Undo. The name is generated ("Porch on", "Everything off", "Bedroom lamp rises") and editable under More options. **Errors**: a failed save shows the red toast "Couldn't save. Retry". A light that has disappeared shows the existing "Points at something that is gone. Pick again." on the Which lights row.

### 4.2 The When sheet

**Title** "When?" / "Pick a clock time, or follow the sun." Three chips: "At a time", "Sunset", "Sunrise".

- At a time: one large native time input, default 6:00pm.
- Sunset or Sunrise: chips "At", "Before", "After"; when Before or After, minute pills "10", "20", "30", "45", "60", "90". Below, the result as a sentence in Body: "20 minutes before sunset. Today that's 6:52pm." Without sun data yet: "Today's time will show once your home is connected."
- Footer primary "Use this time".

**The location step** appears inside this sheet, once, when Sunset or Sunrise is chosen and no location is stored: a `Blush` block "Where is your home?" / "Sunset moves through the year, so the app needs to know roughly where you are. It's kept on your own hub." with primary "Use my location" and a plain link "Pick the nearest city instead". Success: the block becomes a Caption "Near Portland · sunset today 6:52pm" with a "Change" link, and the time zone is taken from the phone with no question asked. Denied or unavailable: "Your phone didn't share its location. Pick the nearest city instead." The city picker is a searchable sheet ("Which city is nearest?") over a bundled list, no service call; sunset a hundred kilometres off is still within minutes. "Use this time" is disabled until a location exists. If the phone's time zone later differs from the saved one (travel), a `Lemon` block on the list asks "Your phone is in a different time zone from your home. Which clock should the lights follow?" with "Keep my home's" / "Use this phone's".

### 4.3 Then turn off again

Stored as a second automation with the same name, the same days and the same lights, whose id is the parent's id plus "-off". The list folds it into the parent's row and the parent's toggle, skip and delete apply to both. This is a front-end convention only; the developer should bless it.

### 4.4 Which days?

Seven 40px round chips "S M T W T F S" (aria labels spell the day), selected black, plus three quick chips "Every day", "Weekdays", "Weekends". Caption beneath states the result, "Weekdays". Clearing the last day is refused; the caption reads "Pick at least one day" until one is chosen.

### 4.5 Skip tonight, skip tomorrow

One secondary button whose label names the next run: "Skip tonight" when it is later today, "Skip tomorrow", or "Skip Monday". It sets the skip date to that run's date, toasts "Welcome lights will skip tonight. Back tomorrow at 6:51pm." with Undo, and becomes "Skipping tonight · Don't skip". The same button sits in the Home block as "Skip".

### 4.6 More options

"Name" input; "Skip it when" select: "Never" / "The lights are already on" / "The lights are already off"; "Change gradually over" (the existing fade list); "Fine-tune: several steps, timers…" (the existing step editor, titled "Fine-tune Porch on"); "Delete this automation", destructive, toast "Automation deleted" with Undo.

## 5. The three guided setups

Each is one sheet, pre-filled by guesses from room and light names, with a `Steel` preview block above a primary "Turn it on". Nothing is saved until that tap; then everything the setup made saves at once, toast with a single Undo that removes all of it. Each opens the location step inline when it needs the sun. "More options" at the bottom holds the numbers.

**Welcome lights.** "Welcome lights" / "Lights on before you reach the door, off at bedtime." (1) "Which lights come on?" chip row, pre-filled with rooms whose names match outside, porch, patio, garden, entry or hall. (2) "Close any shades?" chips per shade, none selected (only when shades exist). (3) "Until when?" chips: "Bedtime (10:00pm)", "Sunrise", "Pick a time". (4) Checkbox "Leave the outside lights on low until morning" (only when an outside room is picked). (5) Preview: "Today: on at 6:52pm, 20 minutes before sunset. Off at 10:00pm." Makes "Welcome lights" with its off pair, using the designer's mapping; the checkbox adds "Outside lights, overnight" (dim at bedtime, off after sunrise) and narrows the first pair's off to the indoor lights. More options: "Brightness 60%", "Comes on: 20 minutes before sunset". No matching room: the chip row is empty and the preview reads "Pick at least one light."

**Wake-up light.** "Wake-up light" / "One lamp rises slowly from dark to soft, ending at the time you pick." (1) "Which lamp?" single-pick chips from bedrooms, pre-filled with the first light named lamp, then the first bedroom light; "Another light…". (2) "Wake up at" time input, default 6:30am. (3) "Which days?" pills, default weekdays. (4) Toggle "Open the shade too" when that room has one. (5) Preview: "Starts at 6:05am, reaches 50% by 6:30am. Skipped if the lamp is already on." Makes "Wake-up light" (the designer's 25-minute rise, skipped when the lights are already on) and, with the toggle, "Bedroom shade" at the alarm. More options: "Takes 15 / 25 / 40 minutes", "Ends at 30% / 50% / 70%". The Home block reads "Wake-up light · tomorrow 6:05am".

**Goodnight and Leaving buttons.** "Goodnight and Leaving" / "One hold on a remote shuts the house down and leaves one light on for a moment." Two stacked cards, each with a toggle "Set this up" (both on). Goodnight: "Which remote?" (a bedroom remote), "Which button?" chips with "Hold Off" selected, "Which lights light the way to bed?" (the "Night path" set if one exists, else hall lights). Leaving: "Which remote?" (hall or entry), "Which button?" ("Hold Off"), "Which light is by the door?" single pick (a hall light). Preview: "Hold Off on the Bedroom remote: everything off, the hall stays dim for two minutes. Hold Off on the Hall remote: everything off, the hall lamp stays on for two minutes. Fans stop and shades close." A press already in use shows "This replaces: Dims Bedroom while holding"; Undo covers it. Primary "Set up the buttons". These save as remote settings, not automations, and the sheet closes to the Remotes tab.

## 6. Evening wind-down

Lives as the first card on the Automations tab, because it is something the house does by itself on a clock; Settings › Night-time keeps its two hour fields with the Caption "Also when the evening wind-down reaches its lowest. You can change it on the Automations tab." One value, two doors, both autosave.

**Card** "Evening wind-down" with a toggle, on by default as the lighting designer asks. Because a dim light nobody asked for reads as broken, the explanation also sits where the surprise happens: while the curve is below 100% the Home status line gains a tappable Caption, "Evening wind-down is on · lights come on dimmer this late", which opens this card. The one sentence on the card, always visible: "As the evening goes on, lights you turn on come on a little dimmer, so the house feels calmer late. Set a level yourself and it stays." When on, one control: **"When does the house go quiet?"** time input, default 10:00pm (it is the same value as Night starts), Caption "Dimming starts after sunset and is lowest here. From then until 6:30am, on means 15%. Early mornings are soft too." Underneath it writes the curve's evening points so the last one lands on the quiet time; nothing else moves. Without a location: "Without your home's location, dimming starts at 6:30pm." with a "Use my location" link. Plain link "Advanced: change the levels".

**Advanced sheet** "Evening wind-down" / "The numbers behind the curve. Task lights (counters, desks, mirrors) are never dimmed, and pressing a top button twice is always full brightness." Rows: "Early morning" chips 40 / 60 / 100 with Caption "before 7:30am"; "Start dimming" chips "At sunset" / "30 min after sunset" / "1 hour after sunset"; "Down to" chips 60 / 50 / 40 with Caption "by an hour before the house goes quiet"; "At night" chips 35 / 25 / 15 with Caption "when the house is quiet, until night ends"; "Night ends" time input; a `Steel` block "Today: soft until 7:30am, full until 7:42pm, down to 15% by 10:00pm, then 15% until 6:30am."; toggle "Also gently lower lights nobody has touched for 20 minutes", off, Caption "Over a minute, only lights above the curve. Turn it off if it ever fights you."; and a "Curve by the hour" link to the raw point list (time and level per row, "Follows sunset" as a time option). Every chip saves at once with Undo. Offline: the "Today" line falls back to the last known sunset.

## 7. Roles and moods

**Entry points.** A one-time `Blush` block on Home, "Give your rooms moods" / "Say which lights are lamps and which is the main light, and each room gets Bright, Relax, Dinner, Movie and Night.", shown while no room has moods and at least one room has two lights; it walks the rooms one sheet at a time with a secondary "Next: Living room" and dismisses with an "x". Inside an expanded room card the first row is the mood row; without moods it is a single outlined chip "Make moods…".

**Confirm sheet** "What kind of light is each one in the Kitchen?" / "We guessed from the names. Fix any that are wrong." Legend Caption: "Main is the ceiling. Task is where hands work: counters, desks, mirrors. Lamps are lamps, sconces and anything for atmosphere. Decor is lit to be looked at: a lit shelf, cabinet interiors, string lights." Then one row per light: name and four chips "Main", "Task", "Lamps", "Decor", the guess pre-selected (under, cabinet, vanity, desk, island, counter → Task; lamp, sconce, picture, cove, toe → Lamps; shelf, string, display → Decor; else Main). Four 40px pills fit a 360px row; the brief asked for three, and if the owner prefers three, Decor folds into Lamps with no other change. Switch rows add the Caption "On or off only: on in Bright, off in the others." Fans are not listed. Footer primary "Make moods" (later "Update moods"), and in the walk a secondary "Skip this room". Tapping the primary saves the roles, writes five ordinary scenes named "Kitchen · Bright" and so on, carrying the room and mood keys, and toasts "Kitchen has five moods" with Undo. Updating skips any mood marked changed by you. A one-light room still gets its moods; they are just levels.

**Mood row on the room card.** Five chips (the UI concepts' D row): "Bright", "Relax", "Dinner", "Movie", "Night", tinted by level, the one whose levels match the room now drawn black. Tap runs it with its fade; the light is the confirmation. Under the row a plain Caption link "Change what each light is for" reopens the confirm sheet. Moods do not appear in the Home scene chips row; five per room would swamp it.

**On the Scenes tab.** A section "Room moods" with one row per room, "Kitchen · 5 moods · 1 changed by you", opening a sheet "Kitchen moods" that lists the five with play and pencil. Editing opens the existing scene editor with a `Steel` block "A suggested mood. Change anything you like; from then on it's yours and won't be replaced." and a secondary "Back to the suggestion". Saving marks it changed, the row reads "Changed by you", and Update moods leaves it alone. Deleting one is allowed; Make moods brings it back.

**On a remote.** In a room with moods the recipe list gains "Room mood… · Bright, Relax, Dinner, Movie or Night for Kitchen" (a picker) and "Next mood · Steps through Kitchen's moods, one per press". Without moods one row reads "Room moods · Make moods for Kitchen first" and opens the confirm sheet, returning here. The usual layout's centre button is Relax; twice is Next mood.

## 8. New remote recipes and the usual layout

In the recipe list, after "Sleep timer":

- "Light the way · Very dim for 15 minutes, then off by itself." Uses the picked lights; the chooser pre-selects a set named "Night path" when one exists. Reads best on a hold.
- "Goodnight · Everything off. The way to bed stays dim for two minutes." The picked lights are the way to bed. Adds "Fans stop and shades close." when the house has them.
- "Leaving · Everything off. The light by the door stays on for two minutes." On pick, one small sheet "Which light is by the door?" (single pick, a hall light pre-selected), then saved.

**The usual layout** spans buttons, so it is not a recipe row. On a remote with no settings and a known room, the remote detail shows a `Blush` block under the picture hint: "Set it up the usual way" / "Top turns Kitchen on, bottom turns it off, hold either to brighten or dim. The middle button is Relax." (the last sentence only on a three-button remote; "Half brightness" and "Nightlight" stand in when the room has no moods; four-button scene remotes get no block). Tapping the arrow applies the designer's layout at once (bottom twice is "everything off", since the app has no floors). Toast "Kitchen remote set up. Tap any button to change it." with Undo. On a remote that already has settings the same thing is a plain link row at the bottom, "Start over with the usual layout"; no confirmation, Undo covers it.

## 9. Hold-to-dim floor

Do not expose it. "Dim while holding" always stops at 1% and its description becomes "Stops at a glow, never off. Let go to stop." Off is a tap; a floor field would be a number nobody can picture. The fine-tune editor shows nothing new for it.

## 10. Two rules that hold everywhere

Offline never blocks editing: settings save through the hub and the connector picks them up when it reconnects, so the only offline copy is the list banner and the Try it now toast. Recent activity lists runs as "Welcome lights ran" / "Ran on its own" and failures as "Wake-up light didn't run" / "Couldn't reach the bridge", with the `clock` icon; the list row's "Didn't run last time" points there.

## 11. What this asks of the developer

- The "-off" pair convention (4.3): same name and days, id suffix, folded in the list.
- Presets carry `area`, `mood` and an `edited` flag; Update moods skips `edited`.
- The quiet-time control rewrites only the evening points of `settings.adaptive.points`; the phone computes the curve's current level for the Home Caption from the points and today's sunset.
- A bundled city table (name, lat, lng) for the location fallback.
- A fifth `#nav` item; `S.view === 'automations'`; the Home block reads `next_runs` and `sun` already in the snapshot.

## Implementation notes

What the build did where the flows could not be followed to the letter, and the small decisions it had to make. The look is `design-spec-v3.md`, so every coloured block above (`Steel`, `Blush`, `Lemon`, `Sand`) is the grey `.tip` card, and the "orange dot" is the lamp ramp's `--lamp-100`.

- **Files.** `web/js/automations.js` holds the tab, the editor and When sheet, the location step and city picker, the three guided setups, the wind-down card and sheets, roles and moods, and the Home "Coming up" block. `core.js` stores `S.sun` and `S.nextRuns` from the snapshot and the `sun` message and calls `paintSun()`, which repaints the list rows' next lines, the Home block, the wind-down captions and any open sheet that shows a sun time, without a full render. `cities.js` is loaded in `index.html` and cached by `sw.js` (`v11`).
- **The "-off" pair (4.3).** Id is the parent's plus `-off`; name, days, on or off, skip date and kind are mirrored on every save, and the pair's steps are regenerated when the lights change. The generated name drops the trailing "on" once a pair exists ("Porch", not "Porch on"), because the row already reads "On at dusk, off at 11:00pm". A pair created before the automation has a time is held in memory with it and lands in the config with it.
- **Next run and skip (4.5, 2).** The connector's `next_runs` does not honour `skip_until`, so when the reported run falls on or before the skip date the app predicts the following run from the rule and today's sun. "Skip tonight" is used for any run later today, as the flows say. The Home block labels an off pair "Welcome lights off" and its Skip sets the parent's skip date to that run's date.
- **Location (4.2).** "Use my location" takes the phone's time zone. The city picker also takes the phone's zone and falls back to the city's own only when the phone has none, so a phone in the home's zone never trips the "different time zone" tip over a different IANA name. The tip appears on the list when the zones differ; "Keep my home's" remembers the pair on this phone.
- **Which lights (4.1).** Shades sit beside lights in the chip row ("All shades") and in the full chooser, which gains a Shades section only when opened from the editor; the recipe rows "Close the shades" and "Open the shades" act on the shade part of the pick and "Turn the fan off" on the fans in it. A recipe row is selected when the steps are exactly what it would write; anything else shows as "Custom" with the `describe()` sentence.
- **Fine-tune (4.6).** The remote's step editor is reused through `S.advCustom` in `remotes.js` (`advList()` / `advChanged()`): the same editor over an automation's steps, titled "Fine-tune Porch on".
- **Wind-down (6).** The card's toggle is `settings.adaptive.enabled`; the quiet time is `settings.night_start` (the Settings row is the second door and carries the caption) and also moves the last point of the by-the-hour curve. The advanced sheet's chips show nothing selected when the stored value is off the list (the shipped `night_level` is 30). "Curve by the hour" is a plain list of time and level rows behind a "Follow the sun" / "By the hour" mode chip; a per-point "Follows sunset" option was not built, the mode chip covers that case. The Home caption uses the connector's `curve_level` and falls back to a port of `winddown_level()` with the last known sunset when offline.
- **Roles and moods (7).** In the room walk the secondary reads "Next: Living room" (skip this room and move on) and "Skip this room" on the last; "Make moods" itself advances the walk. Mood scenes are named "Kitchen · Bright", carry `area`, `mood` and `edited`, and are listed under "Room moods" rather than in Home's scene tiles or "Your scenes". The room card's mood row runs the room's mood scenes and matches the room against them; "Next mood" on a remote needs two or more moods (the `cycle_presets` rule).
- **Buttons (5, 8).** Goodnight and Leaving write one `hold` binding per button: everything off with a two-second fade, the kept light to 10% (Goodnight) or "on" (Leaving, so it follows the curve), a two-minute timer to off, then fans off and shades closed when the house has them. The usual layout also sets top twice to full brightness and the round button twice to Next mood (Nightlight without moods), per the lighting proposal; a remote without both a top and a bottom button, and the four-button scene remotes, get neither the tip nor the row.
- **Activity (10).** The hub already records `{ kind: 'schedule', id, name, ok, error }` from the connector; the rows read "Welcome lights ran / Ran on its own" and "Wake-up light didn't run / Couldn't reach the bridge", and the list row's "Didn't run last time" reads the latest such entry for its id.
- **A shared fix.** `sheet.open()` now resets the body's scroll after the root is shown: Chromium restores a hidden element's old scroll offset, so a sheet opened after a scrolled one used to start partway down.
