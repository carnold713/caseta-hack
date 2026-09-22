# Copper Night · build spec (v6)

The design the phone UI is being rebuilt to. Source of truth is the Figma file
"Collin's Sandbox", page **Pico App**
([12728:20](https://www.figma.com/design/jhFLTG342sNF9LyGll8LDf/Collin-s-Sandbox?node-id=12728-20)).
This document is the file digested for building: it repeats only what an
implementer needs, and records every place the file and the dev handoff doc
disagree.

v6 replaces `design-spec-v5.md` (the light "Lantern" theme) as the look of the
app. It says nothing about behaviour: `what-the-app-does.md` remains the
functional source of truth and nothing it lists may disappear.

Target device: Google Pixel 10, 412 x 915 dp. Every screen frame is 412 x 915
unless it is marked scroll.

## Read this first: four traps

**1. Child coordinates in the exported code sit inside the 1px border.**
Frames with a border export their children relative to the padding box. The tab
bar's active circle reads `left: 7px` in the export and is 8px from the frame
edge. The device tile's power circle reads `left: 15px` and is 16px from the
edge. Add 1 wherever the parent has a border, or every measurement in the app
lands a pixel tight.

**2. The helpers frame's palette is a draft, not the shipping palette.**
The file contains a hidden frame, `_design-helpers (source for builders)`
([12731:20](https://www.figma.com/design/jhFLTG342sNF9LyGll8LDf/Collin-s-Sandbox?node-id=12731-20)),
holding the generator source every frame was built with. It is the best record
of geometry and component recipes in the file and this spec leans on it. But its
colour constants (`C`) were the first pass. A later pass (`__finish`) rebound
every fill to the Hypatia library and changed the values. **The shipping values
are in the token table below**, not in `C`. The mapping is recorded so the
generator source stays readable.

**3. Layer names go stale; geometry does not.** The whole-house brightness bar
is named "Brightness bar · 58%" and is drawn at 52%, matching the "7 on · 52%"
above it. Measure, do not read.

**4. The font has three weights in the shipping file, not eight.** The generator
used Extralight, Light, Book, Regular, Medium. `__finish` folded them: Extralight
to Light, Book at 28 to 32 to Light 32, Regular at 18 to 22 to Medium, Book at 18
and under to Regular. What survives is **Light, Regular, Medium**. Ship those
three weights and no others.

## Colour

Bound to the Hypatia Design System "Color Tokens" collection in Figma. Implement
as named tokens, never as loose hex. Copper is the one deliberate exception: it
means "this light is on" and Hypatia has no equivalent.

| Role | Token | Value |
|---|---|---|
| Page background | (unbound) | `#121212` |
| Cards, tiles, sheet body | `Surfaces/primary-onDark` | `#262626` |
| Grouped lists, toasts, toggle track, segment track | `Surfaces/secondary-onDark · Caseta` (local override) | `#2B2B2B` |
| Raised on a group: icon circles, selected segment | `Surfaces/secondary-onDark` | `#3C3C3C` |
| Text primary | `Typography/primary-light` | `#FFFFFF` |
| Text secondary | `Typography/secondary-light` | `#D1D1D1` |
| Text tertiary | (unbound) | `#9E9E9E` |
| Icons primary | `Icons/primary-onDark` | `#FFFFFF` |
| Icons secondary | `Icons/secondary-onDark` | `#D1D1D1` |
| Borders | `Border/primary-onDark` | `#3C3C3C` |
| Controls and selection | `Buttons/Primary/Fills/solid-default-fill` | `#006DCC` |
| Chip selected | `Chips/onDark/selected-stroke` + `selected-content` | `#52AEFF` outline, `#FFFFFF` text |
| Chip unselected | `Chips/onDark/default-stroke` + `default-content` | `#787878` outline, `#D1D1D1` text |
| Ghost button | `Buttons/Secondary onDark` ghost stroke + content | `#FAFAFA` at 90% outline, `#FFFFFF` text |
| Light button | `Buttons/Secondary onDark` solid fill + content | `#F8F8F8` fill, `#262626` text |
| Text link | `Buttons/Secondary onDark` text-link content | `#FFFFFF`, underlined |
| Success / warning / error | `Error & Success/*` | `#3A7934` / `#DB6900` / `#CC0000` |
| Sheet scrim | `Overlay/overlay-50` | `#262626` at 50% |
| Light is on | copper (unbound) | `#D98A4E` |

Copper family: tile gradient `#E6A06A` to `#D98A4E` at 50% to `#B86C35`; arc and
brightness-fill gradient `#F3D9C3` to `#E6A06A` at 45% to `#D98A4E`; pale
`#F3D9C3`; deep `#B86C35`.

**Rules.** Copper only ever means a light is on, or the current light look. Blue
means a control or a selection. Red appears only for a real fault: offline after
10 s, or a button pointing at a light that has been removed.

### Draft palette mapping (for reading the generator source)

| `C` key | draft | ships as |
|---|---|---|
| `bg` | `#121212` | unchanged |
| `s1` | `#1C1C1C` | `Surfaces/primary-onDark` `#262626` |
| `s2` | `#262626` | `Surfaces/secondary-onDark` `#3C3C3C`, or the Caseta override `#2B2B2B` on a grouped surface |
| `s3` | `#333333` | as `s2` |
| `t1` | `#F5F4F2` | `#FFFFFF` |
| `t2` | `#9E9E9E` | `#D1D1D1` as text and icons; `#9E9E9E` survives only as unbound tertiary text |
| `t3` | `#6E6E6E` | `Icons/secondary-onDark` `#D1D1D1` |
| `lb` | `#006DCC` | unchanged |
| `lbHi` | `#52AEFF` | chip selected content, text links (underlined) |
| `ok` / `warn` / `err` | `#7BC68A` / `#E8B64C` / `#E5664F` | `#3A7934` / `#DB6900` / `#CC0000` |
| `cu` family | `#D98A4E` etc. | unchanged, never bound |

The override rule `__finish` applied: a surface on `secondary-onDark` drops to
the darker Caseta override, **except** a circle sitting directly on such a
surface, which keeps `secondary-onDark` so it reads as lifted. That is why an
icon circle inside a grouped row is lighter than the group behind it.

## Type

**Lutron Sans Screen**, fallback DM Sans. Three weights: Light (300), Regular
(400), Medium (500).

| Role | Size / weight | Line | Tracking |
|---|---|---|---|
| Display numeral | 88 Light | | -3% |
| Detail hero title | 44 Light | | centred |
| H1 page title | 40 Light | 44 | -2% |
| Sheet title | 32 Light | 34 | -1.5% |
| Tile name, section title | 20 Medium | | |
| Body | 16 Regular | 22 | |
| Row title | 16 Medium | 22 | |
| Caption, values | 14 Regular | 18 | |
| Overline | 12 Medium, uppercase | | +6% |

H1 sits at x 20, y 128 on a pushed page. On Home it sits at y 88 with a 14
Regular greeting above it at y 66.

## Layout

20px side gutters. 12px between tiles. Radii: tiles, cards and sheets 28; list
groups and toasts 20; chips and pills fully round.

Header icon buttons are 56px circles at y 52, the back button at x 20 and the
actions ending at x 336 (each further button 64 to the left).

The tab bar floats: 372 x 72 at (20, 803), radius 36, fill `#121212` at 72% with
a 16px backdrop blur, a 1px border and a drop shadow 0 16 20 rgba(0,0,0,.5). The
active tab is a 56px white circle inset 8 on every side; the inactive icons are
24px at x 123 / 223 / 323 (inner), y 23. Gesture handle 108 x 4 at (152, 903).

**Any circle at the end of a pill or track has equal padding on all sides.** The
whole-house knob is 40px in a 56px track, so 8 all round. The active tab is 56 in
72, so 8 all round.

## Components

Geometry taken from the generator source and confirmed against the rendered
frames.

**Row.** Height 64, or 72 with a subtitle. Optional 40px icon circle at x 16
(fill `secondary-onDark`, 20px glyph). Title at x 68 when there is a circle,
x 16 when not: 16 Medium, line 22, at y 14 with a subtitle or vertically centred
without. Subtitle 14 Regular line 18 at y 38, secondary. A value sits right
aligned 36 from the right edge (16 when there is no chevron), 14 Regular,
secondary. Chevron 16px at `w - 32`. Divider 1px white at 6%, from the text
inset to the right edge, on every row but the last.

**List group.** Radius 20, fill `Surfaces/secondary-onDark · Caseta`, clips its
rows, height is the sum of its rows.

**Toggle.** 52 x 32, radius 16. Track `#006DCC` when on, `secondary-onDark` when
off. Knob 24px at x 4 (off) or x 24 (on), white when on.

**Chip.** Height 40, radius 20, 16 left padding (12 with a leading dot or icon),
16 right, 8 gap, label 14 Medium. Unselected: 1px `#787878` outline, `#D1D1D1`
label. Selected: 1.5px `#52AEFF` outline, white label. A scene chip carries a
28 x 12 row of colour dots before its name.

**On / Off segmented control.** Track height 72, radius 36, fill
`secondary-onDark`, 6 inset. Two segments each `(w - 18) / 2` wide and 60 tall,
radius 30. The active one is copper with a white 22px power glyph and an 18
Medium white label, 10 apart, centred. The inactive one has no fill, a secondary
glyph and label. **Tap only. There is no swipe or drag control anywhere in this
design.**

**Device tile.** **168 x 150**, radius 28. Power circle 44px at 16, 16 from the
frame edge. Device glyph 48px in the top right, 12 from the top and right edges.
Name 16 Medium at x 16, y 94, width 136. Value line 14 Regular at y 116.
- On: gradient `#E6A06A` to `#D98A4E` to `#B86C35` top to bottom, 1px white 14%
  border, shadow 0 10 28 rgba(217,138,78,.28), white power circle with a dark
  glyph, an 86px warm glow bleeding off the top right corner.
- Colour lamp: the same shape tinted to the lamp's own colour. The blue lamp in
  the file is `#5B7FE0` to `#3C5DB8` at 55% to `#2A3F82`, border
  rgba(157,182,255,.45), shadow rgba(91,127,224,.35).
- Off: fill `Surfaces/primary-onDark`, 1px border, power circle on the Caseta
  override, glyph at 20% opacity, secondary value text.
- Unreachable: as off, dimmed.

**Room card.** 200 x 132, radius 28, the room photo or the generated fallback,
with a bottom scrim from transparent to black 60% over the lower 72. Name 16
Medium at (16, 84), status 13 Regular at (16, 106), both white.

**Sheet.** Scrim over the parent. Body radius 28, fill `Surfaces/primary-onDark`,
shadow 0 -8 40 rgba(0,0,0,.5). Grabber 40 x 4 at (186, 8). Overline 12 Medium
+6% at (20, 28). Title 32 Light line 34 at (20, 48), or y 32 with no overline.
Close button a 40px circle at (352, 28).

**Undo toast.** 372 x 56 at x 20, radius 20, fill `Surfaces/secondary-onDark ·
Caseta`, shadow 0 16 40 rgba(0,0,0,.5). Check glyph 20px at (18, 18), message 15
Regular at x 48, action 15 Medium copper right aligned 20 from the right edge. A
2px progress bar runs along the bottom for the life of the toast, about 5 s.

**Brightness arc.** 380 wide, stroke 56. Track `#2A2724`. Fill the copper arc
gradient. Knob a 40px white circle with a 4px `#0E0D0C` ring, centred on the arc
end. Sweeps a half circle, 0% at the left.

**Whole-house brightness bar.** 332 x 56, radius 28, track the Caseta override,
fill the copper arc gradient to the current percentage. Small sun glyph 22px at
(17, 17) inside the fill, large sun glyph 26px at (291, 15). Knob 40px, 8 from
the top, centred on the fill edge.

**Hold ring.** A 44px circle on the Caseta override with a progress ring drawn
around it as the hold advances. Used by "Goodnight house" on Home. The house-off
hold is 1000 ms.

## The icon set

The generator source carries the full path data for the 36 UI glyphs, drawn on a
24 grid with a 1.7px round-capped stroke and no fill: `back chev chevD power tune
home grid remote clock gear user plus minus x check sun moon star sparkle timer
wifi bulb fan shade undo bolt drop sunrise door bed search hand pulse dots
palette camera`. They are extracted verbatim into `web/js/icons.js`; do not
redraw them.

Device and room art is separate: the Lutron **Illustrative IconWrapper** library
(white line art on a 64 grid, 2.75 stroke) plus the custom **Caseta Icon** set on
board 00b for the 17 light types and 10 room types. Those export as SVG from
Figma.

## Where the file and the handoff doc disagree

The handoff doc says the file wins. It does. These are the three that matter:

| | Handoff doc | File | Ships as |
|---|---|---|---|
| Device tile | 180 x 150 | 168 x 150 | **168 x 150** |
| Tile power circle | at 16 / 16 | `left: 15` in the export | **16 / 16** (the export is inside the 1px border) |
| Tab bar active circle | inset 8 | `left: 7` in the export | **inset 8** (same reason) |

The second and third are not really disagreements, they are trap 1. Recorded so
nobody re-derives them from the export and builds everything a pixel tight.

## Built so far

`web/ui/` holds the foundations, served alongside the old app until cutover:
`tokens.css` (colour, type ramp, motion), `components.css` (every component
below), `icons.js` (the 36 glyphs) and `gallery.html`, which renders every
component and state. The gallery is the phase 2 check: open `/ui/gallery.html`
and compare it against the file.

Two things learned building it, both now fixed in `components.css` and worth
keeping:

- The 1px hairlines are **inset box-shadows, not `border`**. A real border moves
  the padding box in by one, so every absolutely placed child lands a pixel tight
  and the whole-house bar comes out 332 minus 2. With an inset shadow the padding
  box is the frame box and the file's numbers go in as written. This is trap 1
  again, and it is easy to walk into twice.
- The tab bar spaces its four circles with `space-between` and an 8 inset, which
  puts their centres at 36 / 136 / 236 / 336. `space-around` looks similar and is
  wrong by 16 at each end.

**Open: the webfont.** `tokens.css` declares Lutron Sans Screen at
`/ui/font/LutronSansScreen-{Light,Regular,Medium}.woff2`. Those three files are
not in the repo, because whether the face can ship as a webfont in the PWA is
still unanswered. Until they land the stack falls back to DM Sans and the three
requests 404 harmlessly. Drop the files in and it starts working with no other
change.

## Motion

One set of tokens across the app. What the user asks for lands now; what the app
decides happens slowly; a lamp's colour never visibly slides.

| Token | Duration | Easing | Use |
|---|---|---|---|
| tap | 120 ms | quick spring | scale 0.96 and back |
| standard | 240 ms | `cubic-bezier(.2,.8,.2,1)` | fades, colour and selection changes, segment slides |
| enter | 320 ms | same | fade in and rise 12 |
| exit | 200 ms | ease-in | always faster than enter |
| stagger | 40 ms | | between items on load |
| sheet in | 420 ms | gentle spring | scrim fades in over 240 |
| sheet out | 280 ms | ease-in | |
| push | 300 ms | cubic | in from +24 with a fade, the old page drifts -24 |
| dimmer | 400 ms | ease-in-out | glow opacity and scale 0.85 to 1 |
| scene | 1000 ms | ease-in-out | every light crossfades together |
| breathe | 1600 ms loop | ease-in-out | reconnecting dot, opacity .3 to .8 |
| drift | about 30 s | linear | Follow-the-day colour drift |

A lamp switched on gets its colour set while it is still dark, then fades up in
brightness. That is already what the connector does (`_before_on`, `ON_FADE_SECONDS`
0.4); the UI must not fight it. Honour the OS reduce-motion setting by swapping
movement for plain fades.

## What does not change

The hub, the connector, the protocol between them and the phone, the config
schema, and `web/js/kinds.js`, which the hub requires. This is a front-end
rebuild on top of the existing data layer. The load-bearing timings stay as they
are: long press 550 ms, house-off hold 1000 ms, the press window and hold
threshold from the settings the owner chose, and the connector fades (drift 30 s,
lamp on 0.4 s, scene 1.0 s).
