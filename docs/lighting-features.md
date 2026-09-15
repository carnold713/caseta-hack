# Lighting features for Pico Hack: a designer's proposal

Caseta gives us one lever per load, intensity, plus switches, fans and shades. That is enough for a house that feels designed, because almost everything people notice about residential light is level, layering and timing, and the Lutron app is weak on all three: its scenes are flat snapshots, its schedules are one-line "run a scene at 6:15 pm" rows, a Pico does whatever its printed layout implies, and nothing in it ever gets dimmer as the evening goes on.

## Where things stand (config version 3)

The app has bindings per gesture with a night-time variant; actions `level` (fade up to an hour), `step`, `cycle`, `raise` / `lower` / `stop`, `fan`, `scene`, `preset`, `timer`, `cancel_timer`, `delay`; targets `d:`, `a:`, `g:`, `h:all` or a list of them; presets; sleep timers; night hours.

In `hub/validate.js` and the connector but without app screens yet: `schedules[]` (`at: {type: 'time' | 'sunrise' | 'sunset', time, offset_min}`, `days` with 0 = Sunday, `actions`, `enabled`), `settings.location {lat, lng, name}`, `settings.timezone`, `settings.adaptive {enabled, points: [{time, level}]}`, which `_group_on_level` consults whenever a binding says `on` or `toggle`, and `settings.roles {device_id: 'ambient' | 'task' | 'accent' | 'decor'}`. `agent/sun.py` computes sunrise and sunset with no dependency; `schedule_loop` fires once a day inside a 10-minute window. Nothing reads sensors; there is no push. Several ideas below are therefore "finish the screen, pick the defaults", and I say which.

## The ideas

### 1. Clock and sun schedules (mostly built)

**What.** Things happen on their own at a time or at sunrise or sunset, with no phone involved.

**Why.** Half of what follows is a schedule underneath. The connector runs it, so it keeps working through an internet outage, which Lutron's cloud schedules do not.

**Needs.** The home's location, once, from the phone's GPS (`settings.location`). Nothing else.

**Mapping.** The shape is in place. Three small additions: `only_if: 'any_on' | 'all_off' | null` on a schedule, evaluated over the union of its actions' targets (wake-up must not fight someone already up); `skip_until: 'YYYY-MM-DD'` for "not tomorrow"; and the agent should persist `_fired` to `DATA_DIR/schedules.state.json` and refuse to fire until the clock is sane, because a Pi has no RTC and a restart inside the 10-minute window currently runs a schedule twice. The screen: a Schedules list showing `next_runs`, with a "Skip tomorrow" row action.

**Effort** S for the additions, M for the screen. **Risk** low; the trap is the Lutron app's own schedules running in parallel, and Settings should say to keep them in one place, as it already does for Pico bindings.

### 2. Dusk to dawn: welcome lights and privacy shades

**What.** The porch, the path and one lamp inside the front door come on at dusk and go off at bedtime; shades on the street side close at dusk and open in the morning.

**Why.** A house should be lit before you reach the door, and a glowing interior after dark is a fishbowl. People would build this schedule first, so it deserves a one-screen setup rather than the generic editor.

**Needs.** Tick the welcome lights and the street-facing shades.

**Mapping.** A wizard writes three schedules: `{type: 'sunset', offset_min: -20}` runs `[{type: 'level', target: [...], level: 60, fade: 3}, {type: 'lower', target: [shade ids]}]`; `{type: 'time', time: <night_start>}` turns the indoor lamp off and the outdoor lights to 20; `{type: 'sunrise', offset_min: 15}` turns the set off and `raise`s the shades. Shades need a cover-capable picker: `targetDevices('a:...')` excludes covers on purpose, so add the target kinds `h:shades` and `h:fans` to `isOneTarget`, `_resolve` and `targetDevices` / `targetName`, plus a Shades section in the picker shown only for `level`, `raise`, `lower` and `stop`.

**Effort S** on top of 1. **Risk** low; outdoor plug-in switches are on or off, so 60 just means on, which the engine already handles.

### 3. Wake-up light

**What.** The bedroom lamp rises from nothing to a soft level over 25 minutes, ending at your alarm, weekdays only, and the shade follows.

**Why.** Light before sound is how you want to wake. It is the one feature that makes a dimmer worth more than a switch, and Lutron's app cannot fade anything for longer than a scene transition.

**Needs.** One light (two at most), a time, the days.

**Mapping.** A schedule at alarm minus 25 min, `days: [1, 2, 3, 4, 5]`, `only_if: 'all_off'`: `[{type: 'level', target: 'd:lamp', level: 1, fade: 0}, {type: 'level', target: 'd:lamp', level: 50, fade: 1500}]`, and optionally a second schedule at the alarm with `{type: 'level', target: 'd:shade', level: 40}`. Nothing new in the engine; the fine-tune editor already offers 30-minute fades.

**Effort S. Risk:** confirm on hardware that the bridge honours a 25-minute `FadeTime`; if not, the agent steps it (1% every 30 s, about 15 lines). Any tap on the bedroom Pico sets a level, which ends the ramp, which is the right behaviour.

### 4. Evening wind-down: the adaptive "on" curve (built) and a night rule

**What.** "On" gets dimmer as the evening goes on: the tap that gives 100% at 6 pm gives 60% at 9 and 30% at 11, and nobody changed anything.

**Why.** We cannot warm the light, so level over time is the entire circadian story on Caseta. It is also the change guests notice most: the house simply feels calmer late.

**Needs.** Nothing. A switch in Settings, on by default, and the points from the defaults section.

**Mapping.** `settings.adaptive` and `adaptive_level()` exist; missing are the screen, the defaults and three refinements. (a) Task-role lights are exempt: resolve `on` per device rather than once per action, and use `group_on_level` when `roles[device] === 'task'`; you still need to see the knife at 10 pm. (b) The last point is the night level, so `settings.night_level` should feed it or be retired: one truth. (c) A point may follow the sun, `{sun: 'sunset', offset_min: 30, level: 100}`, resolved daily, because a curve pinned to the clock is wrong for half the year. A group's `on_level` already overrides the curve, which is the right opt-out for a set. Optional nudge, off by default: `settings.adaptive.nudge: true` runs a new action `{type: 'cap', target, level, fade}` every 15 minutes, lowering only lights above the curve that nobody has touched for 20 minutes; the agent sees every zone change, so `last_changed` is one dict.

**Effort S** for the screen and (a) and (b), S for (c), M for the nudge. **Risk** low for the curve, medium for the nudge, which can fight a person.

### 5. Night path, goodnight and leaving home

**What.** One hold on the bedside remote lights the way to the bathroom at 10% and turns it off again after 15 minutes; one hold by the front door shuts the house down but leaves the hall lamp on for two minutes.

**Why.** Night light is about not waking up fully: low level, near the floor, lamps and toe kicks rather than ceilings. Leaving is the same idea in reverse: you should never walk out into the dark.

**Needs.** One set, "Night path" (Settings › Light sets already does this), and which lamp is by the door.

**Mapping.** Recipes, no new actions. Night path: `[{type: 'level', target: 'g:path', level: 10, fade: 1}, {type: 'timer', target: 'g:path', minutes: 15, fade: 30}]`. Leaving: `[{type: 'level', target: 'h:all', level: 'off', fade: 2}, {type: 'level', target: 'd:hall', level: 30}, {type: 'timer', target: 'd:hall', minutes: 2, fade: 10}, {type: 'fan', target: 'h:fans', speed: 'Off'}, {type: 'lower', target: 'h:shades'}]`, the last two on the targets from idea 2. Goodnight is Leaving with the path instead of the hall. `RECIPES` in `remotes.js` gains three entries and `recipeOf` matches them by shape.

**Effort S. Risk** none.

### 6. Hold-to-dim conventions

**What.** Hold the top button and the room brightens, hold the bottom and it dims, and dimming by hold stops at a glow instead of clicking off.

**Why.** Raise and lower is how people actually set a level; stepping through 100, 50, 20 is a demo. The floor matters because the last 2% of a hold are unrecoverable: you meant "very low", got dark, and the next tap gives you 100%.

**Needs.** Nothing.

**Mapping.** `hold_start → raise`, `hold_end → stop` already exist. Add optional `floor: 1..100` to `lower`: the agent watches zone updates during the ramp and sends `stop` then `level floor` when a target dips under. For groups of mixed dimmers that ramp unevenly, a stepped alternative `{type: 'ramp', target, delta: ±4, every_ms: 200, floor}` runs until `hold_end` and is cancelled by any `level` or `stop` on the target, like a timer. A "Use the usual layout" button on a fresh remote applies the convention in one tap: top = toggle to the curve level, top double = 100, top hold = raise; bottom = off, bottom double = whole floor off, bottom hold = lower with floor 1; centre = the room's Relax mood, centre double = next mood.

**Effort S** for the floor and the layout button, M for `ramp`. **Risk** low; the native ramp rate is fixed by the dimmer, roughly 4 s end to end, which is right.

### 7. Layered light: roles (built) and room moods

**What.** Every light is one of four kinds: ambient (ceiling, general), task (under-cabinet, vanity, desk, island pendants), accent (lamps, sconces, picture lights, cove) or decor (things that are lit to be looked at, not seen by: cabinet interiors, a lit shelf, string lights). Five moods per room come for free from that.

**Why.** Dimming everything in a room to 40% is what makes smart lighting look flat. A good room at night has the ceiling low or off, lamps and accents up, task light only where hands are. Layering is the difference between a hotel bar and a hospital corridor, and it is exactly what a captured snapshot cannot express.

**Needs.** The app guesses the role from the name (under, cabinet, vanity, desk, island, counter: task; lamp, sconce, picture, cove, toe: accent; shelf, string, display: decor; the rest ambient) and shows one sheet per room, four chips per light. Most people confirm rather than tag.

**Mapping.** `settings.roles` is validated already. A "Make moods" button on a room generates five ordinary presets from the table in the defaults section, with three optional keys on the preset: `area`, `mood` (`bright | relax | dinner | movie | night`) and `edited` (set by the scene editor, so regenerating never overwrites a hand-tuned one). The Home room card shows a mood row from `presets.filter(p => p.area === id)`. New action `{type: 'cycle_presets', preset_ids: [...]}`: the agent finds the preset whose levels match the current state and runs the next one, so it feels continuous the way `cycle` already does.

**Effort M. Risk** medium: the guess will be wrong sometimes, but the output is ordinary presets, so a wrong guess is a slider drag, not a bug.

### 8. Sun-facing shade control (later)

West-facing shades come down to 30% on summer afternoons and go back up when the sun moves off. Needs a facing per shade, `settings.facing: {device_id: 'N' | 'E' | 'S' | 'W'}`; `at.type` gains `'noon'` and schedules gain `months: [5..9]`; actions are plain `level` on covers. A fixed offset from noon per facing is what designers use anyway. **Effort S** after 1 and 2; later because it needs the facing sheet and a summer to test.

### 9. Scenes that toggle back, and the task burst (later)

Press Movie again and the room goes back to how it was; double tap On for full brightness for ten minutes, then the mood returns. `{type: 'snapshot', target, slot}`, `{type: 'restore', slot}`, and `timer.level` accepts `'restore'`; the agent has every level already. **Effort S**, but it sits behind moods.

### 10. Guest check (later)

A list in Settings of anything a visitor would find confusing: a remote whose top button does not turn on the room it is in, whose bottom does not turn it off, or any single press that acts on another room. A pure function over `bindings` and `inventory.areas`, no schema change. **Effort S.** The layout button in idea 6 prevents most of it.

### 11. Lights left on (later)

A phone notification at midnight if the garage is still on, with an Off button in it. Web push: `settings.push_subscriptions[]`, VAPID keys on the hub, a schedule action `{type: 'notify', text, if: 'any_on'}` the hub fulfils. **Effort M**, all hub and service worker. Wanted, but not lighting.

### 12. Occupancy and presence (later)

Caseta occupancy sensors are not read yet; the bridge exposes them over LEAP, so `only_if: 'occupied:<sensor_id>'` and a per-room vacancy timer are the natural shape. "Arriving home" needs a background geofence, which a PWA cannot do reliably; Wi-Fi presence from the Pi is the honest route. **Effort L.**

### 13. Away replay (later)

Replay the last 14 days of zone changes while you are away instead of Lutron's random Smart Away; the agent already sees every change. `settings.away: true` and a rolling log on the Pi. **Effort M.**

## This release

Ideas 1 to 7: finish schedules, dusk to dawn, wake-up light, the adaptive curve with the task exemption and night rule (nudge off by default), night path with goodnight and leaving, hold-to-dim with a floor, and roles with moods. Build order: 1, then 2 and 3 (an afternoon each), then 4 and 6 (small engine changes), then 7, the only real UI work. If something must drop, drop the shades half of 2 and `ramp`.

## Later

8 sun-facing shades, 9 snapshot and restore, 10 guest check, 11 notifications, 12 occupancy and presence, 13 away replay.

## Defaults a designer would ship

Levels are Caseta dimmer percent, which is already perceptual, so 50 looks like half.

**Room moods**, by role. Switches are on in Bright and off elsewhere unless they are the only light in the room. Fans are left alone by every mood.

| Mood | Ambient | Task | Accent | Decor | Fade |
|---|---|---|---|---|---|
| Bright | 100 | 100 | 60 | 50 | 1 s |
| Relax | 35 | off | 60 | 40 | 3 s |
| Dinner | 20 | off | 50 (pendants over a table count as accent) | 40 | 3 s |
| Movie | off | off | 15, only lights behind the seating | off | 8 s |
| Night | off | off | one accent at 10, or one ambient at 5 if there is no accent | off | 2 s |

**Nightlight level.** 10% on retrofit LED (5% flickers on many); 5% only on a load known to dim cleanly.

**Adaptive "on" curve** (`settings.adaptive.points`). The shipped default steps from 15 to 100 at 07:00, which is a slap in the face in a dark kitchen. Use: 06:00 → 40, 07:30 → 100, sunset + 30 min (or 18:30 until points can follow the sun) → 100, 21:00 → 60, 22:00 → 35, 23:00 → 15, held at 15 overnight. Task lights exempt; a double tap on the top button is always 100.

**Fade times.** 0.5 s for a tap (the existing default); 1 s for off from a remote, since an instant off reads as a fault; 2 to 3 s for a scene; 8 s for Movie; 30 to 60 s when a timer turns something off; 20 to 30 min for wake-up. Nothing triggered by a finger should take more than 3 s to visibly start; past that, people press again.

**Night hours.** 22:00 to 06:30, the existing default. Households with small children want 21:00; the wizard should ask "When does the house go quiet?" rather than show two time fields.

**Hold to dim.** A hold is 500 ms (existing). A full ramp of 4 to 6 s end to end: faster cannot be caught, slower is tedious. Dimming by hold stops at 1%; off is only ever a tap. Top is on and bottom is off on every remote, for the room the remote is in, and a single press never acts on another room. The centre button is a mood, never off. Double and hold are for the household; single press is for guests.
