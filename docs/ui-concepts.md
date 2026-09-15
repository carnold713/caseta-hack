# Pico Hack: making it feel like a lighting app

Companion to `design-spec.md`. The spec stays the base: white ground, flat room colour, black and grey for everything else, Noto Sans, no gradients, glows or blur. This document proposes what to add so the app feels like light rather than settings, ranks the ideas, and says what each one must never turn into. Every value not in the spec is called out as an extension.

## What the reference apps actually do

Studied on Mobbin (iOS): Philips Hue, IKEA Home smart, Apple Home, Hatch Sleep, Google Home, SmartThings, and the ring and dial controls in Tiimo, Apple Health, Dyson, Toggl and Polestar. Two honest patterns emerged.

- **Light as a big flat disc.** IKEA's light detail is a flat `#F7A64F` circle behind a photo of the bulb, vertical ticks at the right, and a row of small orange circles at different tints for warm white. Its "Rise and shine" editor says "Over 30 min · Lights rise from 6:30 AM" and its "Lights start at" sheet is eight orange circles from pale to saturated. Nothing glows; the tint does the work.
- **Light as tinted surface.** Hue paints the whole room header with the running scene's colour on a dark ground and draws its Natural light schedule as dots along a sun arc. Apple Home blurs a wallpaper and fills the bulb glyph yellow. Both read as light and both are exactly the dark, glowing, translucent language the owner rejected.

So the direction is IKEA's, pushed further: **light is a flat disc whose size and tint track the real dimmer level.** Rings say time. A day is a horizontal line. Everything sits on paper.

## Shared primitives and token extensions

Three primitives carry all eight concepts, so they ship once.

**Lamp disc.** An opaque circle. Where there is room its diameter follows the level; everywhere its fill follows the level along a five-stop ramp. The ramp reuses three existing accents and adds two interpolations. It is the only coloured icon circle in the app and means one thing: this much light. Caseta dimmers are single-channel, so the ramp stands for intensity only, never colour temperature.

| token | hex | note |
|---|---|---|
| `--lamp-10` | `#FDF1E1` | new, midway white to tint |
| `--lamp-25` | `#FCE3C4` | = `--orange-tint` |
| `--lamp-50` | `#F9C489` | new, midway tint to circle |
| `--lamp-75` | `#F7A64F` | = `--orange-circle` |
| `--lamp-100` | `#F58A1F` | = `--orange` |

Fill is interpolated continuously between stops (GSAP does this per frame, each frame one solid colour). Off is `--bg-2` with the icon in `--text-3`. Icons on any stop are `#111111` (7.7:1 on `--lamp-100`).

**Ring.** A circular progress track: `#D0D0D0` track, `--black` progress, round caps, 12px stroke at 240px, 4px at 40px. Used for time only (sleep timer, scene fade), never for level.

**Dayline.** One horizontal 24-hour axis with a 2px black sun arc from sunrise to sunset, a `Steel` soft night band and a `Lemon` soft daylight band, events as lamp discs on the axis.

Motion for all three: GSAP `duration: .36, ease: 'power3.out'` (the closest core ease to the spec curve), tweens fire only on a real state change, never on load, never looping. `gsap.matchMedia()` sets duration to 0 under `prefers-reduced-motion`.

---

## A. Light now: the light field on Home

The literal version, soft pools of warm light behind the room cards, is the `#glow` radial layer the spec deleted, so it is rejected. The flat version keeps the idea and moves it above the cards, where it does not fight them. The status line ("3 lights on · Kitchen, Hall") becomes a row of lamp discs, one per room that is on, bottom-aligned like lamps on a shelf. Diameter is `24 + 32 × level/100` px (24px at 1%, 56px at 100%, level = the room's mean), fill from the ramp, the room's 20px icon inside in black, room name as Caption `--text-3` beneath. When someone presses a Pico in the kitchen the kitchen disc grows on the phone: that WebSocket `state` message is the moment the app is alive, and it is a single 360ms tween. All off shrinks every disc to nothing in one tween, no stagger. With everything off the row collapses to the existing Body line "Everything is off". Tap a disc to open that room's card.

```
Kitchen and Hall are on                 Body --text-2
                                        row height 72, discs bottom-aligned
    ○         ●          ◉              24..56px, ramp fill, icon 20px black
   Hall    Kitchen     Living           Caption --text-3
[New scene] [Evening] [Movie] ...       scene chips, unchanged
```

Coexistence with the colour cards: the room fill says *which room*, the disc says *how much light*; they never blend. Inside the card the 36px on chip keeps its bulb but takes the ramp fill instead of white (a one-token change to the spec's room card; the owner should confirm). Hard edges, one colour per disc, white page as the dark room.

Must never become: blurred blobs, a bloom shader, discs bleeding into each other, glow rings, a dark strip, a pulse.

## B. Brightness that behaves like light: the light detail sheet

A dimmer knob is rejected: rotation is a poor thumb gesture, the Pico's own vocabulary is up and down, and a knob invites the metal rim that turns into chrome. The vertical column wins because the remote is vertical. There is no light detail view today (long-press only opens the sleep timer), so this adds one: a sheet opened by tapping a light's name in a row or a favourite tile. The hero is the spec's vertical tick slider (44 × 240, right-aligned, black filled ticks) beside a lamp disc that breathes with your thumb: diameter `160 + 80 × level/100`, ramp fill, `gsap.quickTo` on both with an 80ms lag so the light follows the finger rather than snapping. The disc is also a drag surface: drag up or down anywhere on it to dim, which is the knob feeling without a knob. Inside the disc a 1.5px black line drawing of the lamp kind (from E). The ticks stay black: the light lives in the disc, not the control.

```
┌ ‹  Pendant · Kitchen                 ✕ ┐
│           ╭──────────╮        ─         │
│          │   lamp     │       ─         │  disc 160..240, ramp fill
│          │   drawing  │      ══         │  ticks 44×240 per spec
│           ╰──────────╯      ══         │
│               65%                        │  Display 24/30 700
│         Kitchen · Ambient                │  Caption --text-3
│ [● Bright][● Relax][◐ Dinner][◔ Movie]   │  mood row (D)
│ ( Sleep timer )     ( ☆ Favourite )      │  secondary 40px
```

Rows keep their horizontal tick slider for quick use. Off: disc 160px `--bg-2`, drawing `--text-3`, tooltip "Off".

Must never become: a halo around the disc, a gradient inside it, an orange slider track, a rotary knob, a shadow under the lamp.

## C. Sun arc: the dayline

One horizontal day carries sunrise, sunset, wake-up, evening dim-down and the night hours. Full-width white card, 1px `--line`, radius 16, 16px padding, 136px tall. The axis sits at y = 88: 24 hour ticks 2px `#D0D0D0`, hour labels Caption `--text-3` at 6am, 12pm, 6pm. Above it the sun arc, 2px `--text`, from the sunrise disc to the sunset disc (12px `--orange`), peak at y = 24. Under the axis a `Lemon` soft band for daylight and `Steel` soft bands for the night hours, which are exactly the `night_start` and `night_end` settings that exist today. Now is a 2px black line with a 6px black dot on the axis. Schedule events are lamp discs on the axis, sized by the rule from A (24 to 56px) so "wake up to 30%" is visibly smaller than "evening 100%", with the sun or moon icon inside and a Caption 700 label beneath. Drag a disc to move its time; drag the night band edges to change the hours. Adaptive brightness is the same picture read across: the disc sizes are the curve.

```
             ╭────────╮                   arc 2px black, sunrise → sunset
        ╭────╯        ╰────╮
   ●────╯                  ╰────●         sunrise / sunset 12px --orange
 ┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃  hour ticks, now = 2px black line
 ▒▒▒▒▒▒     ◉                    ◉ ▒▒▒▒▒  night bands Steel soft, event discs
 12am      6am      12pm       6pm  12am  Caption --text-3
      Wake up 6:30 · 30%    Wind down 9pm · 20%
```

Where: first as the Night-time editor in Settings, replacing the two time inputs (the two-band version). Later the same component becomes the schedule editor if scheduling ships. Sunrise and sunset are computed on the phone from a latitude and longitude entered once; no service call. Dragging uses plain pointer events plus `gsap.quickTo` on x (GSAP Draggable is a separate plugin and not vendored).

Must never become: a sky gradient, a purple-to-orange arc, stars, a chart on black, a curve with a shaded area.

## D. Room mood row

Bright, Relax, Dinner, Movie and Night as five scene chips (spec component: 64px, radius 16, `--bg-2`) whose 40px white circle becomes a 40px lamp disc, tint only, at the mood's level with the mood glyph in black: sun 100%, sofa 40%, kitchen 60%, film 20%, moon 5%. The tint *is* the preview: you can see that Movie is dim before you tap it. Tapping applies with the room's fade; the light itself is the confirmation, so no hold-to-preview and no flicker. Selected: the chip goes `--black` with white text, the disc unchanged so its colour still reads. Moods are computed, not stored: with roles from E, Relax is ambient 40 and accent 60 with task off, Dinner ambient 30 and accent 70, Movie ambient 20 only, Night the light tagged night at 5%; without roles every light takes the level. A plain link "Save as a scene" turns one into a preset.

```
[ ● Bright ] [ ● Relax ] [ ◐ Dinner ] [ ◔ Movie ] [ ○ Night ]
   lamp-100     lamp-50     lamp-75      lamp-25     lamp-10
```

Where: the first row inside an expanded room card, in the soft-colour body above the light rows, and the row under the disc in B.

Must never become: photo tiles, gradient circles, colour temperature swatches, a scene gallery.

## E. Light roles, tagged by lamp kind

Roles (ambient, task, accent) are inferred from the kind of lamp, which is a picture, not a category name. Tap the icon in a light row to open "What kind of light is this?", a three-column grid of white outlined cards (radius 12, 1px `--line`, 96px tall, 24px icon, Card title): Ceiling, Pendant, Downlights (ambient); Desk lamp, Reading light, Under-cabinet (task); Floor lamp, Table lamp, Picture light (accent). Selected: 2px `--black` border and the 24px black check circle, as recipe rows do. Nine new 24px 1.5px-stroke symbols on the existing grid. Stored as `settings.light_kinds[device_id]`. Payoff: the row icon becomes the lamp, the disc in B draws it, D gets real moods, and A can order discs ambient first. A one-time `Blush` soft block on Home, "Let's sort your lights", when nothing is tagged; never a wizard.

```
┌ Ceiling ┐ ┌ Pendant ┐ ┌ Downlights ┐   Ambient       Caption --text-3
┌ Desk    ┐ ┌ Reading ┐ ┌ Cabinet    ┐   Task
┌ Floor   ┐ ┌ Table   ┐ ┌ Picture    ┐   Accent
```

Must never become: colour-coded badges, a required onboarding step, 3D lamp renders.

## F. Sleep-timer dial

The chips stay (5, 10, 20, 30, 60) because chips are faster. Above them a 240px ring: 12px `#D0D0D0` track, `--black` progress, a 28px white knob with the spec's knob shadow. Drag around the ring in 5-minute steps to 60, then 15-minute steps to 120 (one full turn). Centre: Caption `--text-3` "Off in", Display "20 min", and beneath the number a 96px lamp disc at the light's current level. Once running, the same ring at 40px with a 4px stroke sits inside the existing `Steel` soft timer block on Home, draining anticlockwise once a minute, with the lamp disc inside it shrinking toward the "then" level. Time and light in one glance.

```
        ╭─────●────╮      ring 240, track #D0D0D0, progress black
       │   Off in    │
       │   20 min    │    Display 24/30
       │    (◉)      │    lamp disc 96, current level
        ╰───────────╯
 [5 min] [10] [20] [30] [60]
```

Must never become: a glowing orange arc on black, a gradient stroke, seconds ticking, anything animating continuously.

## G. A running scene

Today the chip's circle goes black for one second. A scene with a fade should show its time honestly. The chip's 40px circle becomes a 3px ring that fills over the real fade, the scene icon inside, subtitle "Fading · 12 s left" then "Done" for 2 s. The discs in A tween to their target sizes over the same duration, linearly: slow and calm is the point. For long fades (5 to 30 min wind-downs) a `Steel` soft block appears on Home like the timer block: "Wind down is fading Living room to 20% · 14 min left", the 40px ring, and a "Stop" secondary that holds the levels where they are. Needs the hub to publish a `fading` message with start, duration and targets.

Must never become: a full-screen takeover, a now-playing bar, sparkles, a light sweep across the card.

## H. Night look for the app

A black night mode would bring `#0f1117` back through the side door, so it is rejected. Instead the paper dims and warms, like a room lit by lamps. Between `night_start` and `night_end`, or under `prefers-color-scheme: dark`, the tokens swap instantly at the minute boundary; a Settings row "Night look: Automatic / Always / Never" overrides. Text stays `#111111`, room fills and the lamp ramp stay, so the discs in A now sit on warm paper and read as lamps in a dim room. `--text-3` darkens because `#767676` drops to 3.96:1 on the new ground.

| token | day | night |
|---|---|---|
| `--bg` | `#FFFFFF` | `#F6F1E8` |
| `--bg-2` | `#F5F5F5` | `#ECE6DB` |
| `--card` | `#FFFFFF` | `#FBF8F3` |
| `--line` / `--hairline` | `#DFDFDF` / `#EBEBEB` | `#D9D3C8` / `#E4DED3` |
| `--text-3` | `#767676` | `#6A6A6A` (4.7:1) |
| bottom bar, `theme-color` | `#F7F7F7`, `#FFFFFF` | `#F1ECE3`, `#F6F1E8` |

Must never become: a black or navy ground, glowing accents, blurred bars, lowered opacity, a "dark mode" toggle.

## Libraries

GSAP carries every concept: tweens on disc size and fill, `quickTo` while dragging, `stroke-dashoffset` on rings. Load `/vendor/gsap.min.js` with a plain script before `core.js`, add it to `SHELL` in `sw.js` and bump the version. three.js earns nothing here. Its one honest use would be an unlit, orthographic, flat-shaded lamp in B that tilts as you drag, and that costs 1.4 MB in the shell cache for something a 1.5px SVG drawing does better in this system. Hold it until there is a 3D remote to justify it.

## Ranking

| concept | impact | effort | ship first |
|---|---|---|---|
| A · Light now strip and tinted on chip | high | small | yes |
| B · Light detail sheet with breathing disc | high | medium | yes |
| D · Mood row | high | medium | yes |
| H · Night look | medium | small | yes |
| F · Sleep-timer dial | medium | medium | yes |
| C · Dayline as the Night-time editor | medium | small | yes |
| G · Running scene ring | medium | medium (hub change) | next |
| E · Lamp kinds | medium | medium (nine icons, a sheet) | next |
| C · Dayline as a full schedule editor | high | large (needs scheduling) | later |

Ship A first: it is one row on Home, it reuses the ramp everywhere else, and it is the moment the phone answers a Pico press with light. B and D together make a light feel like a thing you hold. H and F are small. G and E follow once the hub reports fades and the icons are drawn. The full dayline waits for scheduling to exist.
