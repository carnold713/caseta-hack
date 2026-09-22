# Copper Night · build spec (v6)

The design the phone UI is being rebuilt to. Source of truth is the Figma file
"Collin's Sandbox", page **Pico App**
([12728:20](https://www.figma.com/design/jhFLTG342sNF9LyGll8LDf/Collin-s-Sandbox?node-id=12728-20)).
This document is the file digested for building: it repeats only what an
implementer needs, and records every place the file and the dev handoff doc
disagree.

**How it was read.** From the file itself, with read-only `use_figma` scripts
running against the Plugin API: `absoluteBoundingBox` for geometry, bound
variables resolved per node for colour, `exportAsync` for the art. Not from
screenshots, and not from `get_design_context`'s React rendering, which is a
translation of the file and turned out to lose things (see trap 1). Every
number in the components section was measured that way, and
`scripts/ui-parity.js` checks the built components against those numbers.

v6 replaces `design-spec-v5.md` (the light "Lantern" theme) as the look of the
app. It says nothing about behaviour: `what-the-app-does.md` remains the
functional source of truth and nothing it lists may disappear.

Target device: Google Pixel 10, 412 x 915 dp. Every screen frame is 412 x 915
unless it is marked scroll.

## Read this first: four traps

**1. The code export puts children inside the 1px border; the file does not.**
`get_design_context` renders a bordered frame's children relative to the padding
box, so the tab bar's active circle reads `left: 7px` there. Measured in the
file it is 8 from the frame edge, and the tile's power circle is at 16,16, not
the export's 15,15. The export also turns Figma drop shadows into CSS
`drop-shadow()` filters, which halve the blur, so a shadow copied from it into a
`box-shadow` comes out half as soft. Take geometry and effects from the file.

**2. The helpers frame's palette is a draft, and so is the foundations board.**
The file contains a hidden frame, `_design-helpers (source for builders)`
([12731:20](https://www.figma.com/design/jhFLTG342sNF9LyGll8LDf/Collin-s-Sandbox?node-id=12731-20)),
holding the generator source the frames were built with: a good record of
recipes, but its colour constants (`C`) were the first pass. A later pass
(`__finish`) rebound the screens to the Hypatia library and changed the values.
**The shipping values are in the token table below.**

Counted across the page, the screens are overwhelmingly on the bound tokens.
What is left unbound is three specific things, listed under "Loose ends in the
file". But the **foundations board (00) was never rebound**: its 75 text and
swatch fills are all on the draft palette. Do not read colours off board 00.

**3. Layer names go stale; geometry does not.** The whole-house brightness bar
is named "Brightness bar · 58%" and is drawn at 52%, matching the "7 on · 52%"
above it. Measure, do not read.

**4. The font has three weights in the shipping file, not eight.** The generator
used Extralight, Light, Book, Regular, Medium. `__finish` folded them: Extralight
to Light, Book at 28 to 32 to Light 32, Regular at 18 to 22 to Medium, Book at 18
and under to Regular. What survives is **Light, Regular, Medium**. Ship those
three weights and no others.

## Loose ends in the file

Found by counting every solid fill and stroke on the page and resolving the
bound ones. None of these is a reason to deviate from the tokens; they are
recorded so nobody copies them.

- **A fourth text tone, `#6E6E6E`, unbound.** Used the same way on twelve
  frames for the quietest information: "Nothing yet", Activity timestamps, "Off
  at 9:56 pm", the connector version line, the little "Any colour" and "Off"
  hints on the colour tiles. Consistent enough to be deliberate, so it ships as
  `--text-4`. Hypatia has no token for it. **Question for the designer.**
- **The scene-chip dot rings are `#1C1C1C`.** Each colour dot has a 2px ring cut
  in the colour of what it sits on. The chip behind it was rebound to `#262626`
  and the ring was not, so in the file the ring is a shade darker than the chip
  it is cutting. Built to match the chip.
- **The foundations board**, above.

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

**Icon stroke is per placement, not one weight.** The glyphs are drawn at 1.7
on the 24 grid and the file then scales and adjusts them, so the weight you pass
depends on where the glyph sits. Measured:

| Placement | Size | Weight (24 grid) | Colour |
|---|---|---|---|
| Header button | 20 | 1.7 | white |
| Tab bar | 24 | 1.7 | active `#121212` on the white circle, idle `#D1D1D1` |
| Tile power | 22 | 2.0 | lit tile `#B86C35`; colour lamp its own deep tone (`#2F4A99` for the blue); off tile `#D1D1D1` |
| Pill power | 20 | 1.9 | "All on" white; "All off" `#D1D1D1` though its label is white |
| Brightness bar, small sun | 22 | 1.8 | `#121212`, since it sits in the copper fill |
| Brightness bar, large sun | 26 | 1.6 | `#D1D1D1` |
| Row circle, hold ring | 20 | 1.7 | white |

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

**Chips come in three kinds, and they are not one component with states.**
All are 40 tall and fully round.
- *Choice chip* (the controls sheet, filters): no fill, 1px `#787878` outline,
  `#D1D1D1` label, 16 each side, 8 gap. Selected: 1.5px `#52AEFF` outline,
  white label.
- *Scene chip*: filled `#262626`, 1px `#3C3C3C` border, **white** label, 12 left
  and 16 right, **10** gap, a 28 x 12 row of colour dots before the name. The
  dots are three 12px discs 8 apart, each overlapping the last by 4, each with a
  2px ring in the chip's own colour.
- *More chip* ("All scenes"): filled `#262626`, no border, `#D1D1D1` label, 14
  each side.

**On / Off segmented control.** Track height 72, radius 36, fill
`secondary-onDark`, 6 inset. Two segments each `(w - 18) / 2` wide and 60 tall,
radius 30. The active one is copper with a white 22px power glyph and an 18
Medium white label, 10 apart, centred. The inactive one has no fill, a secondary
glyph and label. **Tap only. There is no swipe or drag control anywhere in this
design.**

**Device tile.** **168 x 150**, radius 28. Power circle 44px at 16, 16 from the
frame edge. Device art 48px at 108, 12, so 12 from the top and right edges.
Name 16 Medium at x 16, y 94, width 136. Value line 14 Regular at y 116.
- On: gradient `#E6A06A` to `#D98A4E` to `#B86C35` top to bottom, 1px white 14%
  border, shadow 0 10 28 rgba(217,138,78,.28), white power circle with a
  copper-deep glyph, an 86px `#FFF1DC` glow at 89, -9 bleeding off the top right
  corner.
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
fill the copper arc gradient to the current percentage. Small sun 22px at
(17, 17) inside the fill, large sun 26px at (291, 15). Knob 40px white with a
0 2 8 rgba(0,0,0,.28) shadow, **sitting inside the end of the fill with 8 on
every side**, not centred on the fill edge: at 52% the fill ends at 173 and the
knob's left edge is at 125. So the fill never goes below 56.

**Hold ring.** A 44px circle on the Caseta override with the moon (20) at 12,12.
Around it a white 8% track and a white 2px round-capped arc, r 20.5. At rest the
arc is already about an eighth of the way round from twelve o'clock, as the hint
that this is held, and it closes over the 1000 ms hold. White, not copper:
nothing here is a light that is on. Used by "Goodnight house" on Home.

**Coming-up card.** 372 x 68, radius 20 (a row's worth, so the group radius, not
the card's 28), `#262626` with a 1px `#3C3C3C` line. A 40 circle on the Caseta
override at 14, 14; title 16 Medium at 66, 13; caption 14 Regular secondary at
66, 35; a trailing text link.

**Whole-house card glow.** While anything is on, a 380px radial copper glow
(`#D98A4E` at 22% to nothing) sits at 170, -190 inside the card, clipped by it.

**Scroll fade.** A 129px fade above the floating tab bar, `#121212` from 0% to
85% at 35% to solid.

## The icon set

The generator source carries the full path data for the 36 UI glyphs, drawn on a
24 grid with a 1.7px round-capped stroke and no fill: `back chev chevD power tune
home grid remote clock gear user plus minus x check sun moon star sparkle timer
wifi bulb fan shade undo bolt drop sunrise door bed search hand pulse dots
palette camera`. They are extracted verbatim into `web/js/icons.js`; do not
redraw them.

Device and room art is separate. The custom **Caseta Icon** set on board 00b,
17 light types and 10 room types, is exported straight from the file with
`exportAsync` into `web/ui/art/`, byte for byte. White line on a 64 grid at
2.75, so 2.06 at the 48 a tile shows it at.

Some screens also use the Lutron **Illustrative IconWrapper** library (Home's
Floor lamp and Accent lamp tiles use its "Lamps" and "LampSolutions"). Those are
remote library components and are not exported yet; the helpers frame lists the
32 the design draws on. Until they are, the nearest Caseta icon stands in.

## Where the file and the handoff doc disagree

The handoff doc says the file wins. It does. These are the three that matter:

| | Handoff doc | File | Ships as |
|---|---|---|---|
| Device tile | 180 x 150 | 168 x 150 | **168 x 150** |
| Tile power circle | at 16 / 16 | `left: 15` in the export | **16 / 16** (the export is inside the 1px border) |
| Tab bar active circle | inset 8 | `left: 7` in the export | **inset 8** (same reason) |

The second and third are not really disagreements, they are trap 1. Recorded so
nobody re-derives them from the export and builds everything a pixel tight.

## Checking the build against the file

`scripts/ui-parity.js` (`npm run test:ui`) opens the gallery in Chromium and
measures 31 things inside the components: offsets from each component's outer
edge, sizes, and the computed colours of the glyphs. The expected values are the
ones read out of frame 02 Home. It currently passes all 31. When a screen is
built, its numbers go in there the same way.

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
