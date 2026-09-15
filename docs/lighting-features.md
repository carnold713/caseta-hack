# Lighting features for Pico Hack: a designer's proposal

Caseta gives us one lever per load, intensity, plus switches, fans and shades. That is enough for a house that feels designed, because almost everything people notice about residential light is level, layering and timing, and the Lutron app is weak on all three: its scenes are flat snapshots, its schedules are one-line "run a scene at 6:15 pm" rows, a Pico does whatever its printed layout implies, and nothing in it ever gets dimmer as the evening goes on.

What the app already has, and what this proposal leans on: bindings per gesture with a night-time variant; actions `level` (fade up to an hour), `step`, `cycle`, `raise` / `lower` / `stop`, `fan`, `scene`, `preset`, `timer`, `cancel_timer`, `delay`; targets `d:`, `a:`, `g:`, `h:all` or a list of them; `settings.night_start`, `night_end`, `night_level` (validated, not used anywhere yet), `group_on_level`, `default_fade`. The connector has the house clock, the current level of every zone, and keeps running from its cached config when the internet is down. It has no scheduler, no location, no sensors and no push.

## The ideas

Each one: what it is, why it matters, what the user has to supply, how it maps onto the config, and effort with risk.

### 1. Clock and sun schedules

**What.** Things happen on their own at a set time or at sunrise or sunset, with no phone involved.

**Why.** Half of what follows (dusk lights, wake-up, wind-down, shades) is a schedule underneath. The connector runs it, so it keeps working through an internet outage, which Lutron's cloud schedules do not.

**Needs.** The home's location, once, from the phone's GPS or a map tap. Nothing else.

**Mapping.** New top-level `schedules: [{id, name, at, days, actions, only_if, enabled, skip_until}]`. `at` is `{clock: 'HH:MM'}` or `{sun: 'sunrise' | 'sunset' | 'noon', offset_min: -180..180}`; `days` is a list of 0..6, default every day; `actions` goes through `validateAction` and the same group and preset checks bindings use; `only_if` is `'any_on'`, `'all_off'` or null, evaluated over the union of the actions' targets; `skip_until` is a date, for "not tomorrow". `settings.location: {lat, lon}`. Times are the connector's local time, exactly as night hours already are. Agent: a `scheduler_loop` beside `hub_loop` that wakes every 30 s, computes today's fire times (the NOAA sunrise formula is about 40 lines, no dependency), fires each schedule once per day and records `{schedule_id: date}` in `DATA_DIR/schedules.state.json`. On start it fires a missed schedule only if it is under 15 minutes late, and fires nothing until the clock is sane, because a Pi has no RTC. It sends `{type: 'schedule', id, fired_at}` so runs appear in Recent activity.

**Effort M. Risk** low. The trap is the Lutron app's own schedules running in parallel, so the Settings copy should say to keep them in one place, as it already does for Pico bindings.

### 2. Dusk to dawn: welcome lights and privacy shades

**What.** The porch, the path and one lamp inside the front door come on at dusk and go off at bedtime; shades on the street side close at dusk and open in the morning.

**Why.** A house should be lit before you reach the door, and a glowing interior after dark is a fishbowl. This is the schedule people would build first, so it deserves a one-screen setup rather than the generic editor.

**Needs.** Tick the welcome lights and the street-facing shades.

**Mapping.** Three schedules created by a wizard: `{sun: 'sunset', offset_min: -20}` runs `[{type: 'level', target: [...], level: 60, fade: 3}, {type: 'lower', target: [shade ids]}]`; `{clock: <night_start>}` runs the indoor lamp off and the outdoor lights to 20; `{sun: 'sunrise', offset_min: 15}` turns the set off and `raise`s the shades. Shades need a cover-capable picker: `targetDevices('a:...')` excludes covers on purpose, so add the target kinds `h:shades` and `h:fans` in `isOneTarget`, `_resolve` and `targetDevices` / `targetName`, plus a Shades section in the picker that appears only for `level`, `raise`, `lower` and `stop`.

**Effort S** on top of 1. **Risk** low; outdoor plug-in switches are on or off, so a 60% level just means on, which the engine already handles.

### 3. Wake-up light

**What.** The bedroom lamp rises from nothing to a soft level over 25 minutes, ending at your alarm, weekdays only, and the shade follows.

**Why.** Light before sound is how you want to wake; it is also the one feature that makes a dimmer worth more than a switch, and Lutron's app cannot fade anything for longer than a scene transition.

**Needs.** One light (two at most), a time, the days.

**Mapping.** A schedule at alarm minus 25 min: `[{type: 'level', target: 'd:lamp', level: 1, fade: 0}, {type: 'level', target: 'd:lamp', level: 50, fade: 1500}]`, `only_if: 'all_off'` so it never fights someone already up, and `skip_until` for a day off. Optionally a second schedule at the alarm with `{type: 'level', target: 'd:shade', level: 40}`. Nothing new in the engine; the fine-tune editor already offers 30-minute fades.

**Effort S. Risk:** confirm on hardware that the bridge honours a 25-minute `FadeTime`; if it does not, the agent steps it (1% every 30 s, about 15 lines). Any tap on the bedroom Pico sets a level, which ends the ramp, which is the right behaviour.

### 4. Evening wind-down and a house-wide night rule

**What.** "On" gets dimmer as the evening goes on: the tap that gives 100% at 6 pm gives 65% at 9 and 30% at 11, and nobody changed anything.

**Why.** We cannot warm the light, so level over time is the entire circadian story on Caseta. It is also the change guests notice most: the house simply feels calmer late.

**Needs.** Nothing; two numbers with defaults.

**Mapping.** `settings.wind_down: {enabled, start: {clock | sun, offset_min}, from_level: 100, to_level: 50}`. `ActionRunner._group_on_level`, which already resolves `on` and `toggle`, interpolates linearly between `start` and `night_start`, then returns `settings.night_level` inside the night window (this is the field that exists and is unused). A binding with an explicit `night` variant keeps it. Numeric levels, `step`, `raise` and presets are untouched, so a double tap to 100 still works. Task-role lights (idea 7) are exempt. An optional nudge, off by default: `settings.wind_down.nudge: true` makes the agent run a `cap` every 15 minutes so any light above the curve that nobody has touched for 20 minutes fades down to it over 60 s; the agent already receives every zone change, so `last_changed` is one dict. New action `{type: 'cap', target, level, fade}` lowers only what is above `level`, and is useful in schedules on its own.

**Effort M** (S without the nudge). **Risk** medium for the nudge, since it can fight a person; low for the curve.

### 5. Night path, goodnight and leaving home

**What.** One hold on the bedside remote lights the way to the bathroom at 10% and turns it off again after 15 minutes; one hold by the front door shuts the house down but leaves the hall lamp on for two minutes.

**Why.** Night light is about not waking up fully: low level, near the floor, lamps and toe kicks rather than ceilings. Leaving home is the same idea in reverse: you should never walk out into the dark, and you should never have to look back to check.

**Needs.** One set, "Night path" (Settings, Light sets already does this), and which lamp is by the door.

**Mapping.** Recipes, no new actions. Night path: `[{type: 'level', target: 'g:path', level: 10, fade: 1}, {type: 'timer', target: 'g:path', minutes: 15, fade: 30}]`. Leaving: `[{type: 'level', target: 'h:all', level: 'off', fade: 2}, {type: 'level', target: 'd:hall', level: 30}, {type: 'timer', target: 'd:hall', minutes: 2, fade: 10}, {type: 'fan', target: 'h:fans', speed: 'Off'}, {type: 'lower', target: 'h:shades'}]`, the last two on the targets from idea 2. Goodnight is Leaving with the path instead of the hall. `RECIPES` in `remotes.js` gains three entries ("Light the way for 15 minutes", "Leaving: everything off, hall stays a moment", "Goodnight") and `recipeOf` matches them by shape.

**Effort S. Risk** none.

### 6. Hold-to-dim conventions

**What.** Hold the top button and the room brightens, hold the bottom and it dims, and dimming by hold stops at a glow instead of clicking off.

**Why.** Raise and lower is how people actually set a level; stepping through 100, 50, 20 is a demo. The floor matters because the last 2% of a hold are unrecoverable: you meant "very low" and got dark, and now you tap and get 100%.

**Needs.** Nothing.

**Mapping.** `hold_start → raise`, `hold_end → stop` already exist. Add an optional `floor: 1..100` to `lower` (and `ceiling` to `raise`): the agent watches zone updates during the ramp and sends `stop` then `level floor` when a target dips under. For groups of mixed dimmers that ramp unevenly, a stepped alternative `{type: 'ramp', target, delta: ±4, every_ms: 200, floor}` runs until `hold_end` and is cancelled by any `level` or `stop` on the target, like a timer. A "Use the usual layout" button on a fresh remote applies the convention in one tap: top = toggle to the curve level, top double = 100, top hold = raise; bottom = off, bottom double = whole floor off, bottom hold = lower with floor 1; centre = the room's Relax mood, centre double = next mood.

**Effort S** for the floor, M for `ramp`. **Risk** low; the native ramp rate is fixed by the dimmer, roughly 4 s end to end, which is right.

### 7. Layered light: roles and room moods

**What.** Every light is one of three kinds, ambient (ceiling, general), task (under-cabinet, vanity, desk, island pendants) or accent (lamps, sconces, picture lights, cove), and five moods per room come for free from that.

**Why.** Dimming everything in a room to 40% is what makes smart lighting look flat. A good room at night has the ceiling low or off, lamps and accents up, and task light only where hands are. Layering is the difference between a hotel bar and a hospital corridor, and it is exactly what a captured snapshot cannot express.

**Needs.** The app guesses the role from the name (under, cabinet, vanity, desk, island, counter: task; lamp, sconce, picture, cove, accent, toe, shelf: accent; everything else: ambient) and shows one sheet per room with three chips per light. Most people confirm rather than tag.

**Mapping.** `settings.roles: {device_id: 'ambient' | 'task' | 'accent'}`, unknown ids dropped by the validator. A "Make moods" button on a room generates five ordinary presets from the table in the defaults section, with two optional keys on the preset, `area` and `mood` (`bright | relax | dinner | movie | night`), so the Home room card can show a mood row and a remote can cycle them. New action `{type: 'cycle_presets', preset_ids: [...]}`: the agent finds the preset whose levels match the current state and runs the next one, so it feels continuous the way `cycle` already does. Regenerating skips any preset the scene editor has marked `edited: true`.

**Effort M. Risk** medium: the guess will be wrong sometimes, but because the output is ordinary presets a wrong guess is a slider drag, not a bug.

### 8. Sun-facing shade control (later)

**What.** West-facing shades come down to 30% on summer afternoons and go back up when the sun moves off.

**Why.** Glare and heat are the reason shades exist; privacy at dusk is idea 2.

**Needs.** A facing per shade, picked once. **Mapping.** `settings.facing: {device_id: 'N' | 'E' | 'S' | 'W'}`; schedules gain `months: [5..9]`; `{sun: 'noon', offset_min}` is already in idea 1; actions are plain `level` on covers. A fixed offset from noon per facing is what designers use anyway; a sun-angle model is not needed. **Effort S** after 1 and 2. Later because it needs the facing sheet and a summer to test.

### 9. Scenes that toggle back, and the task burst (later)

**What.** Press Movie again and the room goes back to how it was; double tap On and you get full brightness for ten minutes, then the mood returns.

**Mapping.** `{type: 'snapshot', target, slot}` and `{type: 'restore', slot}`, and `timer.level` accepts `'restore'`. The agent has every level already. **Effort S. Risk** low. It sits behind moods, so it waits for them.

### 10. Guest check (later)

**What.** A list in Settings of anything a visitor would find confusing: a remote whose top button does not turn on the room it is in, whose bottom does not turn it off, or any single press that acts on another room.

**Mapping.** A pure function over `bindings` and `inventory.areas`, no schema change. **Effort S.** The layout button in idea 6 prevents most of it, so this can wait.

### 11. Lights left on (later)

**What.** A phone notification at midnight if the garage or basement is still on, with an Off button in it.

**Mapping.** Web push: `settings.push_subscriptions: [...]`, VAPID keys on the hub, and a schedule action `{type: 'notify', text, if: 'any_on'}` the hub fulfils. **Effort M**, almost all hub and service worker. Wanted, but it is not lighting.

### 12. Occupancy and presence (later)

Caseta occupancy sensors are not read yet. The bridge does expose them over LEAP, so `only_if: 'occupied:<sensor_id>'` on schedules and a per-room vacancy timer are the natural shape. Phone presence for "arriving home" needs a background geofence, which a PWA cannot do reliably; a Wi-Fi presence check from the Pi is the honest route. **Effort L.** Not this release.

### 13. Away replay (later)

Replay the last 14 days of zone changes while you are away, instead of Lutron's random Smart Away; the agent already sees every change. `settings.away: true` and a rolling log on the Pi. **Effort M.** Later, because a security feature deserves its own care.

## This release

Ideas 1 to 7: schedules, dusk to dawn, wake-up light, wind-down (curve and night rule shipped, nudge off by default), night path with goodnight and leaving, hold-to-dim with a floor, and roles with moods. Build order: 1, then 2 and 3 (schedule-shaped, an afternoon each once the scheduler exists), then 4 and 6 (small engine changes), then 7, the only real UI work. If something has to drop, drop the shades half of 2 and the `ramp` action.

## Later

8 sun-facing shades, 9 snapshot and restore, 10 guest check, 11 notifications, 12 occupancy and presence, 13 away replay.

## Defaults a designer would ship

All levels are Caseta dimmer percent, which is already perceptual, so 50 looks like half.

**Room moods**, by role. Switches are on in Bright and off elsewhere unless they are the only light in the room. Fans are left alone by every mood.

| Mood | Ambient | Task | Accent | Fade |
|---|---|---|---|---|
| Bright | 100 | 100 | 60 | 1 s |
| Relax | 35 | off | 60 | 3 s |
| Dinner | 20 | off | 50 (pendants over a table count as accent) | 3 s |
| Movie | off | off | 15, and only lights behind the seating | 8 s |
| Night | off | off | one accent at 10, or one ambient at 5 if the room has no accent | 2 s |

**Nightlight level.** 10% on retrofit LED (5% flickers on many); 5% only on a load known to dim cleanly.

**Fade times.** 0.5 s for a tap (the existing default); 1 s for off from a remote, since an instant off reads as a fault; 2 to 3 s for a scene; 8 s for Movie; 30 to 60 s when a timer turns something off; 20 to 30 min for wake-up. Nothing triggered by a finger should take more than 3 s to visibly start; past that, people press again.

**Wind-down curve.** 100% until sunset plus 30 min, clamped between 18:00 and 20:00; a straight line down to 50% at `night_start`; then `night_level` 30% until `night_end`, with 15% in bedrooms and halls. Task lights are exempt from the curve; a double tap on the top button is always 100%.

**Night hours.** 22:00 to 06:30, the existing default. Households with small children want 21:00; the wizard should ask "When does the house go quiet?" rather than show two time fields.

**Hold to dim.** A hold is 500 ms (existing). A full ramp of 4 to 6 s end to end: faster cannot be caught, slower is tedious. Dimming by hold stops at 1%; off is only ever a tap. Top is on and bottom is off on every remote, for the room the remote is in, and a single press never acts on another room. The centre button is a mood, never off. Double and hold are for the household; single press is for guests.
