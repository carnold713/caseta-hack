# Open × Copper Night · the app in Open's language

A concept pass, not a build spec: six screens of the app as it is today, the same data and the same flows,
re-skinned in the visual language of **Open** (the iOS breathwork and meditation app), each with its own motion
timeline, plus four isolated motion studies. Nothing in `web/ui/` changes yet.

Everything lives in the Figma file `jhFLTG342sNF9LyGll8LDf`, page **Open × Copper Night** (`13118:5934`):

| Section | Node | What is in it |
|---|---|---|
| 00 · Language | `13123:209` | what we took from Open, the palette as variables, the type ramp as text styles, the four motion curves, local components (`13123:213`) |
| 01 · Screens | `13123:210` | 01 Home `13125:310`, 02 Room `13127:362`, 03 A light `13128:416`, 04 Scene `13131:446`, 05 Remote `13132:482`, 06 Goodnight `13133:529` |
| 02 · Motion studies | `13123:211` | a six-pose storyboard of each screen's timeline; Study A Bloom `13141:1934`, B Odometer `13141:2028`, C Ring `13142:1934`, D Sonar `13142:2027` |
| 03 · Reference | `13123:212` | the Open screens it was read from, linked to Mobbin |

Every frame is 412 x 915 and rests on its **final pose**, so the static canvas shows the designed screen. Select a
frame and press play to see it move; each screen's timeline is 7 s, each study 5.5 to 6 s.

## What we took from Open

Read from 170 Open screens on Mobbin across 46 flows
([the app](https://mobbin.com/apps/open-ios-c244e38f-ae98-4b62-aa01-12efbcc3715f/5168362a-394b-4f77-949a-9880c526be18/screens)).

- Pure black, with no gradient behind content. Cards are a flat warm `#1A1818`, hairlines `#1E1E1E`.
- One quiet grotesk at Regular or Light, never bold: hierarchy comes from size and grey level. Uppercase for menus
  ("RECENTS / FAVORITES / TIMER") and section labels. A monospace for every number, time and meta line.
- Thin white line art (1.25 to 2 px), with overlapping circles (the flower of life) as the signature graphic.
- Tilted oval crops of photography with words split either side of the oval ("BREATHE FT. / TÂCHES").
- Three label-over-value cards in a row; a thin-ring play button; one copper tag for state; cream pills for the
  primary action; lime for "confirmed".
- The section rhythm: hairline, UPPERCASE label on the left, "SEE ALL →" on the right.
- A nav of line icons that names only the active tab, in tiny caps, under a fade to black.

What we added for a lighting app: **light is amber and appears only where something is lit**, as a flat fill at
low opacity, so overlapping lamps glow where they overlap without any blur. Every state change moves, and nothing
moves without one.

## Tokens

Colour variables, collection **Open × CN**, one mode (Night):

| Token | Hex | Use |
|---|---|---|
| `bg/base` | `#000000` | every screen |
| `bg/raised` · `bg/card` · `bg/card-hi` | `#111111` · `#1A1818` · `#242424` | sheets · cards · a row being pressed |
| `line/hair` · `line/strong` | `#1E1E1E` · `#3D3D3D` | dividers · tracks, rings of rooms that are off |
| `text/primary` · `secondary` · `tertiary` · `disabled` | `#FFFFFF` · `#BDBBB9` · `#8C8C8A` · `#4F4F4F` | text levels; disabled is inactive tabs and off rooms |
| `accent/cream` | `#F0ECE8` | the primary pill (black text) |
| `accent/rust` · `accent/rust-text` | `#7B3707` · `#E2A274` | the state tag |
| `accent/lime` | `#A7BA3E` | confirmed: a scene that is on |
| `accent/slate` · `accent/red` | `#4D6F82` · `#D44339` | cool tag · destructive (proposed, not yet used) |
| `light/amber` | `#FFB55E` | light itself: fills at 5% + 9% × level, needles, progress arcs |
| `light/ember` · `light/warm` · `light/cool` | `#E8743B` · `#FFDDB0` · `#CFE3FF` | warmer, whiter and colour lamps |

Type, as text styles **Open/…**, in Geist and Geist Mono (the closest available to Open's Suisse-like grotesk):

| Style | Spec | Example |
|---|---|---|
| Numeral XL | Geist ExtraLight 120/108, −5% | the level on a light |
| Display | Light 44/46, −3% | Kitchen Pico, Sleep well |
| Title | Light 30/34, −2% | 5 rooms on |
| Menu | Regular 26/28, −1.5%, UPPER | the room list on Home |
| Headline | Regular 21/26, −1% | Living room, Relax |
| Tab | Regular 17/22, −0.5% | All / Rooms / Scenes / Remotes |
| Body · Body S | Regular 15/21 · 13/18 | descriptions, rows |
| Label | Regular 12/16, +4%, UPPER | ROOMS · SEE ALL → |
| Tag | Medium 10/12, +7%, UPPER | EVENING |
| Meta mono | Geist Mono 11/14, +2%, UPPER | 52% · 2700K · WARM |

## The six screens

- **01 Home.** The house is a flower: seven overlapping circles, one per room, white and amber-tinted when lit,
  grey when off. Under it the count ("5 rooms on"), the mean level in mono, three ring buttons (All off,
  Goodnight, All on), then Open's uppercase menu as the room list with each level in mono.
- **02 Room.** The room photo in a tilted oval with LIVING ROOM and FT. EVENING laid across it, the title with
  chevrons to the next room, a copper tag, three cards (Scene, Level, Warmth), a ring dimmer you drag round, and
  the lights with thin level bars.
- **03 A light.** The lamp is the flower: at 0% its seven circles sit on top of each other, at 100% they open
  fully. A huge thin numeral, a ruler that slides under an amber needle, three cards, and − / power / +.
- **04 Scene.** Open's technique picker: each lamp in the scene is a circle sized by its level, swiped between
  scenes, run with the thin-ring play button, with a legend of lamp levels underneath.
- **05 Remote.** The Pico as line art that draws itself, leader lines out to uppercase labels for each button,
  then what the top button does as label/value rows.
- **06 Goodnight.** A countdown, the house flower going dark room by room with the porch left as a small amber
  ring, a checklist that says what each light, fan and shade did, and the cream "Done →" pill.

## Motion

Four curves, used everywhere:

| Name | Curve | For |
|---|---|---|
| Settle | `CUSTOM_CUBIC_BEZIER 0.16, 1, 0.3, 1` (expo-out), 0.6 to 1.0 s | anything arriving: rises, draws, underlines, digit rolls, bar widths |
| Spring | `CUSTOM_SPRING bounce 0.22` | anything the hand touched: knobs, petals, ring presses, swapped titles |
| Breathe | `CUSTOM_CUBIC_BEZIER 0.65, 0, 0.35, 1`, 2 s or slower | idle life: the flower breathing over 4 s, the photo drifting |
| Leave | `CUSTOM_CUBIC_BEZIER 0.7, 0, 0.84, 0`, 0.2 to 0.3 s | toasts and tags going away |

Rules: siblings 50 to 70 ms apart; chrome first, then the hero, then content top to bottom; numbers never cut,
they roll, and rolls use Settle, never Spring, so a digit cannot overshoot into the wrong number; anything that
changes because of a press shows where the press came from (a ripple, sonar, a finger, a toast).

What each screen's timeline plays:

| Screen | Load | The moment |
|---|---|---|
| 01 Home | each circle draws itself from its outer edge (1.0 s, 70 ms apart), lit ones fill, the flower breathes | 3.2 s, the Kitchen Pico is pressed: toast drops in, Kitchen's circle whitens with two ripples, its row flashes and lights, 4 → 5 rolls, 52% → 55% |
| 02 Room | oval springs in and settles its tilt, overlay words slide in from opposite edges, the ring draws to 62% with its knob | 2.4 s, a finger takes the knob to 85%: card dips and swaps, tag and bars follow a beat apart, the photo brightens |
| 03 A light | petals unfold to 75% with a 30° counter-turn, digits roll up, ruler slides | 2.3 s drag down to 30% (petals close, disc dims), then up to 90%; the needle stretches at each stop |
| 04 Scene | Bright's four full circles draw in | 1.5 s swipe: composition follows the finger, Bright slides out, Relax in, circles shrink one by one, the accent ring cools to blue; 3.4 s Run: ring dips, play folds into pause, amber arc traces the fade, each lamp fills with a ripple, check, "On now" in lime |
| 05 Remote | the outline draws itself, buttons pop in, leaders run out to labels | 2.2 s press: button dips and flashes, two sonar rings, other labels to 30%, copper tag; 4.5 s double press pulses twice and lights the matching row |
| 06 Goodnight | house draws as on Home | five ticks, 0.8 s apart (6 s live): seconds roll, one room goes out per tick and its row checks off; at zero the numerals step back, Sleep well rises, the pill turns cream |

The four studies isolate the pieces at 1.3x with the exact timings written under each: **A Bloom** (draw, fill,
breathe, a room coming on), **B Odometer** (digit columns and the ruler), **C Ring** (tap, fade progress, done),
**D Sonar** (a press next to a hold, with the 0.8 s hold threshold drawn as an arc).

## How the storyboards were made

`export_video` renders fine, but the build machine cannot download from figma.com, so motion was checked another
way: each storyboard pose is a clone of the screen with every keyframe track evaluated at that time (cubic
beziers solved exactly, springs approximated as a damped oscillation with the same overshoot, path trims redrawn
as a polyline cut to length) and then frozen. That is how two bugs were caught: digit columns on a spring
overshot into blank space and the wrong number, and dashes are no stand-in for a path trim (Figma restarts a
dash at every segment).
