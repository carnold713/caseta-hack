# Copper Night · build spec (v6)

The design the phone UI is being rebuilt to. Source of truth is the Figma file
"Collin's Sandbox", page **Copper Night** (it was called Pico App until v7)
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
- **One off tile on the draft palette.** Room detail's "Ceiling pendant · Off"
  tile is `#1C1C1C` with a `#333333` circle, `#9E9E9E` glyph and value and
  `#F5F4F2` name: the off tile as it was before the rebind. The off tiles on Home
  are bound. (It escaped the first count because that count skipped layers named
  like art, and "Pendant" is one of those names.) Built from the tokens.
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

### Lamp colours and whites

Read from the foundations board (00). These are Copper Night's own and replace
the old app's ten swatches, so a colour's name (it comes from the nearest
swatch) changes with them.

- **Lamp colours, twelve, in this order:** `#FF5A4E` `#FF8A3D` `#FFC24A`
  `#F5E15B` `#9EE06A` `#4FD39A` `#3CC6D6` `#4C8DFF` `#6E6BFF` `#A66BFF`
  `#F06BD2` `#FF7AA0`. The Colour tile on Light detail previews five of them
  (`#FF5A4E` `#FFC24A` `#4FD39A` `#4C8DFF` `#A66BFF`) as 20px discs 14 apart.
- **White, candle to daylight:** one bar of eight even stops, `#FF8A1F` `#FF9A3C`
  `#FFAE5E` `#FFBB78` `#FFCB98` `#FFD7B0` `#FFE7D2` `#FFF6F0`, which the handoff
  puts at 1900 K to 6500 K. The board does not say whether the stops are even in
  kelvin or in mireds; the connector works in mireds, so that is the reading to
  confirm with the designer.

The board is out of date in three places, so read it for colour values only:
its rules still say off is "swipe, or hold" (the design has no swipe), its type
labels are the weights before the clean-up (Extralight, Book), and its palette is
the draft one. One thing on it is not stale and answers an open question in the
handoff: its map puts **"one suggestion"** on Home, after the rooms.

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

**Figtree** (SIL Open Font License 1.1), served by the hub from `web/ui/font/`,
falling back to the system face. The design was drawn in Lutron Sans Screen, which
never shipped; the owner chose Figtree in its place. Three weights carry the type
scale: Light (300), Regular (400), Medium (500).

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
All are 40 tall and fully round. A choice chip can carry a 16px glyph (drawn at
1.8 on the 24 grid) after a 12 left pad.
- *Choice chip* (the controls sheet, filters): no fill, 1px `#787878` outline,
  `#D1D1D1` label, 16 each side, 8 gap. Selected: 1.5px `#52AEFF` outline,
  white label. **Current**, for the scene a room is in right now: filled copper
  `#D98A4E`, no outline, white label and glyph. Copper, not blue, because it is
  the look the lights are showing, not a choice being made.
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

**Device tile.** Two widths, one per place: **168 x 150** in Home's starred strip
(it scrolls sideways, so a third tile peeks in), **180 x 150** in a room's two
column grid (180 + 12 + 180 = 372). Radius 28. Power circle 44px at 16, 16 from
the frame edge. Device art 48px, 12 from the top and right edges (108, 12 on a
168 tile; 120, 12 on a 180). Name and value at 16, 94 and 16, 116; the name box
is the tile width less 32.
Name 16 Medium at x 16, y 94, width 136. Value line 14 Regular at y 116.
- On: gradient `#E6A06A` to `#D98A4E` to `#B86C35` top to bottom, 1px white 14%
  border, shadow 0 10 28 rgba(217,138,78,.28), white power circle with a
  copper-deep glyph, an 86px `#FFF1DC` glow at 89, -9 bleeding off the top right
  corner.
- Colour lamp: the same shape tinted to the lamp's own colour. The blue lamp in
  the file is `#5B7FE0` to `#3C5DB8` at 55% to `#2A3F82`, border
  rgba(157,182,255,.45), shadow rgba(91,127,224,.35), power glyph `#2F4A99`. In
  the room grid its glow is tinted too (`#CFE0FF`); on Home it was left warm
  (`#FFF1DC`). A blue lamp should glow blue, so the room grid is the one to follow.
- A running timer: a 28-tall chip at 16, 66 on the tile, `#121212` at 35%, a 14px
  timer glyph and "12 min" in 12 Medium.
- Fan: the power circle becomes an icon circle (Caseta override, fan glyph), and
  five 8px speed dots 3 apart sit at 112, 34, white for each speed up to the
  current one and white at 25% after it.
- Shade: an icon circle with the shade glyph, and a 10 x 44 bar at the top right
  (radius 5, Caseta override) whose `#9E9E9E` fill, hanging from the top, is how
  much of the window the shade covers: 60% at "40% open".
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
| Device tile | 180 x 150 | 168 x 150 on Home, 180 x 150 in a room | **both**: see Device tile |
| Tile power circle | at 16 / 16 | `left: 15` in the export | **16 / 16** (the export is inside the 1px border) |
| Tab bar active circle | inset 8 | `left: 7` in the export | **inset 8** (same reason) |

None of the three is a real disagreement. The tile row was one when only Home
had been read: an earlier version of this spec said the handoff had the tile
width wrong, and it did not, the room grid uses exactly its 180. The other two
are trap 1. Recorded so nobody re-derives them from the export and builds
everything a pixel tight.

## Checking the build against the file

`scripts/ui-parity.js` (`npm run test:ui`) opens the gallery in Chromium and
measures 31 things inside the components: offsets from each component's outer
edge, sizes, and the computed colours of the glyphs. The expected values are the
ones read out of frame 02 Home. It currently passes all 31. The screens' own
numbers are checked by `test/browser/copper_test.js`, which needs the hub.

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

### Phase 3: the app at `/ui/`

`web/ui/index.html` and `app.js` are the new app, running on the data layer
(`docs/data-layer.md`) beside the old one at `/`. Built so far: **02 Home**,
**13 Rooms**, **03 Room**, **04 Light**, **05 Colour**, **05b White**,
**06 Follow the day**, **06b Sleep timer**, **13 Rooms**, **14 All scenes**,
**15 a scene**, **16 Room setup**, **17 Fan**, **18 Shade** and **19 About
this light**: all of phase 3, laid out in `screens.css` from each frame's own
numbers. Pages not built yet land on a
plain "still being rebuilt" page that links to the current app, so nothing is
out of reach meanwhile.

White, Colour and the sleep timer are **sheets over the light's page**, as the
file draws them, and each is a sub route (`#light/<id>/white`) so Back and a
shared link land on it. Dismissing one puts the address back without adding a
step to Back; White and Colour swap in place without the sheet rising again.

`test/browser/copper_test.js` drives these screens against the hub and the fake
connector (the dial, the house bar, Goodnight's hold, All on and off, Save this
look, a fan's steps, stars, the white bar, the wheel, a timer) and measures
them against frames 03, 04, 05, 05b, 06b, 13 and 17. `test/browser/copper_edit_test.js`
covers the rest: About this light, Follow the day, Room setup, a new room, and
making, editing, running and deleting a scene.

What reading frames 03 to 19 settled:

- **The brightness arc on the light page is not the component above.** It is
  340 x 190 at (36, 640), radius 150, stroke **40**, track **`#2E2E2E`**, fill
  `#F6E3CF` to `#E8A774` at 45% to `#D98A4E`, knob a 24px white disc with a 4px
  `#121212` ring. "Brightness" at 718, the 88 numeral at 736, the minus and
  plus circles (48) at y 836, moon and sun (22) at y 849.
- **A fan has five steps, Off included**, so the tile's five dots were right
  and the question about Caseta's four speeds is closed: Medium lights three.
  The fan page's On is **blue**, not copper: a fan is not a light.
- **"Stops with Goodnight" and "Closes with Goodnight" are toggles in the file
  with nothing behind them.** Goodnight stops every fan and closes every shade,
  and the config has no per-device exception. The pages say "Stops with it" and
  "Always" rather than draw a switch that does nothing; making them real is a
  config schema change, which this rebuild does not make.
- **The house card's pill says "All on" while anything is on** and turns every
  light on; from a dark house it is the power setting's "Lights back on" or
  "All on".
- **"Save this look"** makes the room's current levels (whites and colours
  included, off lights as off) into a scene called "My look", then "My look 2".
  It shows only while the room matches none of its scenes.
- A light with neither white nor colour closes the page up by 144: the pills
  sit at 414 and the dial moves up with them.
- **The white bar is in mireds.** It runs 1900K to 6500K; the file puts 2700K
  at 41.9% of it and a 5000K lamp limit at 87.6%, which is exactly 1,000,000/K
  and nowhere near a kelvin scale. That answers the open question. The part of
  the bar a lamp cannot reach is hatched, with "Beyond this lamp · max 5000K"
  above it, and a named white past the limit is dimmed and clamps.
- The five named whites are Candle 2200, Warm 2700, Neutral 4000, Cool 5000,
  Daylight 6500: the names `warmthName` already gives those values.
- **The colour wheel's hue runs clockwise from three o'clock**, red at the
  right, as the file's 36 wedges do; distance from the middle is saturation.
  The file names one of its twelve lamp colours ("Blue" for `#4C8DFF`); the
  other eleven are named in `web/ui/colour.js` the same plain way.
- The sleep timer's "Custom" opens a second row (10, 20, 45, 90, 120 min),
  the steps the old dial offered past the four the file shows. "Applies to"
  is this lamp, its room, or everything that is on.
- **A scene's fade stops at a minute.** Frame 15 offers "5 min" and "30 min";
  the hub keeps a scene's fade only up to 60 seconds and drops a longer one
  silently, so those chips are 15 s, 30 s and 1 min instead. A longer fade needs
  a hub change, which this rebuild does not make.
- **Scenes and a scene's lights.** Frame 14 runs a scene on a tap and edits it
  on a press and hold (500 ms), and the chevron on a row edits it too. Running
  one says so with Undo, which puts back every light it touched. Frame 15 shows
  each light's level and colour but no control for them; tapping a light opens
  its level (a slider, a fan's speeds, a switch's on and off) and, for a lamp,
  "As it is", Follow the day, the five whites and the twelve colours, so nothing
  the old scene editor did is lost. Name, "Try it" and "Use the lights as they
  are now" are kept for the same reason.
- **About this light (19)** sets what a light is for and what it is on the same
  sheet; picking a kind sets the role its fixture plays, as it always has, and
  the kinds offered are `web/js/kinds.js`'s (the file draws an arc lamp and a
  tree lamp under Floor, which that table does not have). Changing a role
  refreshes the room's suggested scenes, leaving any the person changed.
- **Pickers inside a sheet** (which room, which light to add, a name, "are you
  sure") are the app's addition: the file draws none of them. Each opens in
  place with a back arrow and closes back to the sheet.
- The connector reports a timer's end as **epoch seconds**. (The browser
  suite's fake connector also used to send a `timers` message the hub does not
  handle; it now sends `timer` as the real one does, so timers show in tests.)

### Phase 4: remotes and routines

Built: **21 Remotes**, **07 a remote**, **08 what a press does**, **09 what it
controls**, **25 Press timing**, **10 Routines**, **23 a routine**, **22 the
guided setups** (Welcome lights, Wake-up light, Goodnight button, Leaving
button), the **evening wind-down** sheets and **24 Activity**. Their rules are
two more data layer files, `web/data/remotes.js` and `web/data/routines.js`
(`docs/data-layer.md`), with unit tests.

Routes: `#remotes`, `#remote/<id>` with `/k<key>-<single|double|hold>` (one
press) and `/more` as sheets, `#timing`, `#routines` with `/winddown`,
`/winddown-levels`, `/winddown-curve` and `/night` as sheets, `#routine/<id>`
with `/when`, `/days`, `/what`, `/lights`, `/off`, `/onlyif`, `/more`,
`#setup/<welcome|wakeup|goodnight|leaving>`, `#activity`. The old app's
`#automations` still lands on Routines.

`test/browser/copper_remotes_test.js` drives all of it (a press on a real
remote jumping to it, every way a press can be set, Controls, night versions,
steps, the usual layout, timing, a routine made and changed through its
sentence, skip, delete and Undo, both kinds of guided setup, the wind-down,
Activity's filters) and measures frames 21, 07, 25, 10, 23, 22 and 24.

What reading frames 07 to 25 settled:

- **The remote on the stage is Lutron's product photograph** in the file
  (`pj2-3brl-gwh-ph-fr-8`, white only). It could not be exported into the repo
  from here (the asset host is outside this environment's network), so the
  remote is drawn in SVG key for key, in all four finishes and every model the
  bridge reports, which the one photograph could not do anyway. A photograph
  dropped into `web/img/picos/` as `<model>-<finish>.png` or `<model>.png` is
  used instead, with the keys laid over it unseen so they still light and tap.
- **Keys are named by where they sit**: Top button, Up arrow, Middle button,
  Down arrow, Bottom button (the file's "TOP BUTTON"), not by the bridge's
  labels. A four-button remote's keys are Button 1 to 4.
- **Leaders spread.** The file's five leaders sit beside their keys; on the
  3-button-with-arrows the middle three keys are closer together than two lines
  of words, so a label moves down when it would crowd the one above and its
  leader bends to reach it.
- **The suggested five** are the file's for a press (Turn on, Turn on or off,
  Bring back how it was, Run a scene, Goodnight); a press twice and a hold get
  their own five, an arrow leads with a nudge and a walk through scenes, and a
  fan with its speeds. Everything else the old recipe list had is under More
  choices, grouped, so no way of setting a press is lost.
- **Different at night** turns on with the same lights at a nightlight glow (a
  hold: dimming), and the sentence under it opens the night version's own ways,
  including building it step by step. The hours are the house's night, shown as
  "10:30 pm to 6:30 am" where the file uses an en dash.
- **Controls (09) applies as you pick** and moves the night version with the
  press. "New set" makes a saved set from the lights picked now; renaming sets
  stays in Settings.
- **Build it step by step** is the old fine-tune editor on the new surface: a
  card of plain fields per step, for a press, its night version, or a routine.
- **Press timing's sliders are the hub's ranges**: a double press 0.15 to
  1.5 s, a hold 0.25 to 3 s. The tester draws two taps only when it heard both;
  a double press it was only told about is named, not drawn.
- **A routine is a sentence.** The blue words open the sheet that changes them;
  the day circles toggle in place. A routine with no condition reads "and run
  every time"; one that leaves nothing on has no "then off" clause.
- **"+" makes the routine at once** (the first room on at sunset, or 6 pm
  without a location) and opens it as "New routine" with the file's "Routine
  created" toast and Undo; the title becomes its name once it is left.
- **Welcome lights asks when you get home** (the file's 5:30, 6:00, 6:30, a
  time, or sunset), then the days with "only if the house is dark", then when
  they go off, then how bright and which shades. The old sunset-only setup is
  the "Or at sunset" answer.
- **The time zone banner** keeps both answers: "Use Mountain" (the home's
  clock) as the file draws it, and "Use this phone's".
- **Activity's filters**: Buttons are remote presses, Routines are routines
  that ran or did not, Changes are commands from the app and the house computer
  coming and going. The hub records no author, so a change reads "From the
  app" where the file writes a person's name.

### Phase 5: setup, settings and the cutover

Built: **01 onboarding**, **11 Settings** and every sheet it opens, **12 the
connection sheet**, **20 Add a device**, and Home's greeting, suggestion card
and "Coming up" line. Then the cutover: **the new app is at `/`** and the old
one at **`/classic/`**, where it keeps working exactly as before.

Routes: `#settings` with `/name`, `/where`, `/timezone`, `/power`, `/onlevel`,
`/fade`, `/night`, `/nightlook`, `/connection`, `/bridge`, `/hue`,
`/nanoleaf`, `/hidden`, `/sets`, `/how`, `/restore`, `/ideas`, `/install` and
`/logout` as sheets; `#add`. A route the new app does not know lands on a "Not
here" page with Go home and the classic app.

`test/browser/copper_setup_test.js` drives it (onboarding to sign-in, the
classic app at `/classic/`, the greeting once per home, the suggestion and Not
now, the connection sheet and the remotes check, each Settings sheet that
changes something, a backup restored and undone, and a Pico heard, named, put
in a room and made) and measures frames 01 and 11.

What reading frames 01, 11, 12 and 20 settled:

- **Onboarding is three pages before the password**, the file's copper star
  pill, dots, a two-line headline around a picture pill, a 64 back circle and
  a 296 wide button. It shows once per phone; "What this app does" under the
  password brings it back. The file's first page joins "Nothing to save" and
  "everything is undoable" with a long dash; here it is a colon.
- **Settings is one grouped list** in the file's order (Home, Buttons,
  Evening, Devices, Connector, Backup) with This app and Log out added below,
  because the old Settings reached all of it: Hue and Nanoleaf pairing, hidden
  devices, light sets, the connector's updates and install line, the bridge's
  notes, backup and restore, ideas, installing to the home screen, and the
  classic app. Every row opens a sheet that applies as it is changed, with
  Undo on the toast.
- **Night look** is a warm veil over the whole app (`body.nightlook`): always,
  never, or automatically during the house's night hours.
- **The connection sheet's headline says the one thing that matters**: nothing
  ("Nothing needs you. Everything is connected"), a blip that has passed, a
  reconnect in progress, or the first link that is down and what to check. The
  four rows are this phone, the app's server, the house computer and the
  Lutron bridge. "Check the remotes" counts buttons, not button settings, so a
  button with a tap, a double press and a hold is one button set up. It opens
  from the greeting line on Home, the offline card and Settings.
- **Add a device listens as soon as it opens** and stops when it is left. The
  file's three steps (Listening, Name it, Pick a room) run over a radar drawn
  around the file's wireless illustration; what the bridge hears slides up in
  a card with a name and the rooms as chips, and one tap makes it. A room the
  Lutron bridge has no area for is still offered: the bridge keeps the device
  under one of its own areas, the card says which, and the app files it where
  it was put. "See what the bridge said" and "Which button?" are kept from the
  old flow, since this part of the bridge is undocumented.
- **Home offers one suggestion at a time** under the rooms (a remote to set
  up, moods, Welcome lights and the rest of the old app's list), never over a
  problem, with Not now remembered. "Coming up" appears when a routine runs
  within the hour, with Skip. The first time a home connects it is greeted
  once with where to start, and closing that is remembered on the hub.
- **The cutover keeps both apps offline-ready.** The service worker caches the
  new app, the classic app and what they share, and falls back to whichever
  one the address asked for. `/ui/` still serves the new app, so old links
  keep working.

### On a real phone: widths, touch and sheets

The file's frames are 412 wide; phones are 375 to 430. What that settled:

- **The page is the phone's width** (up to 600) with the file's 20 gutter on
  each side, not a 412 column in the middle. Two-up grids (tiles, the White and
  Colour cards, the remotes, choices) share the width between the gutters;
  artwork and controls the file centres (the lamp, the dial, the fan's speeds,
  the shade's window, the colour wheel, the radar) stay centred; what the file
  pins to an edge stays 20 from that edge. The tab bar, the toast and every
  sheet run edge to edge less the gutters (a sheet, the full width).
- **Nothing ends behind the tab bar.** It floats 40 above the bottom and is 72
  tall, so every page ends 24 above its top edge (136 plus the safe area).
- **A slider never steals a scroll** (`web/ui/gesture.js`). A finger landing on
  one does nothing; a sideways drag moves the house bar, the White track and the
  dial, an up-or-down swipe that starts on them scrolls the page natively
  (`touch-action: pan-y`), a tap sets nothing, and a touch that lands while the
  page is still moving only stops the scroll. The dial's knob and the shade's
  hem are grips that take a finger at once in any direction; the colour wheel is
  a picker and takes it at once too.
- **The knob stays under the finger.** The house bar's knob sits 28 inside the
  end of its fill, as the file draws it, so the fill ends 28 past the finger;
  the sun at the dim end steps aside when the knob reaches it.
- **What a finger set is what shows.** For 1.5 s after a slider moves, the
  bridge's echoes of the values it passed through do not pull it back
  (`S.held`, `hold()` in the data layer).
- **Sheets swipe away** (`web/ui/sheetdrag.js`): from the grab bar and the
  header, or from the body when it is scrolled to the top. The sheet follows the
  finger and the scrim thins; past a quarter of the sheet or a flick it drops
  the rest of the way on EASE_IN, short of that it springs back on GENTLE.
- **A tab slides the way the tab bar reads**: a tab to the right comes in from
  +24 and the old one drifts -24, the push's 0.3 s standard; to the left, the
  other way. The load stagger is for the app opening.
- **Follow the day, paused by a colour, stays paused.** Picking a colour or a
  warmth by hand pauses it, and the lamp comes back on in that colour after
  being off, and after the connector restarts (it keeps the paused lamps in
  `follow.state.json`). "Follow the day again" on the Follow the day page
  resumes it (`{type: "color", target, follow: true}`). Connector 0.21.0.

`test/browser/copper_touch_test.js` checks the gestures, the sheet swipe, and
every main page at 390 and 430 for width, gutters and the tab bar.

### The whole-house card, revisited

In use, the file's card read wrongly: "All on" was filled copper whenever
anything was on, so it looked like a state ("everything is on") while two lamps
in one room were lit, and one brush of a thumb lit the whole house at night.
What changed, on purpose, against the file:

- **The line under the bar says which lights it moves**: "Adjusts the 2 lights
  on in Office" (or "in Office and Kitchen", "in 3 rooms").
- **Off is a tap, on is a hold.** "All off" is the solid pill whenever anything
  is on. "All on" is an outlined pill that has to be held for 0.6 s; copper
  fills it from the left while it is held and empties if it is let go. A tap
  turns nothing on and the line under the bar says to hold it. A finger that
  goes on to scroll scrolls.
- **Neither pill shows a state.** The headline ("2 on · 60%") does.
- **It says how bright "All on" will be** while the evening wind-down holds
  lights down: "All on · 30%".
- **With everything off there is no slider** (it used to bring every light up
  from dark): just "Lights back on", held, which brings back what was on before
  (or every light, as Settings says).

**Back in the file.** These changes are drawn in the file, so it matches the
build again. The v6 original of 02 Home is kept in the Archive section, and the
Motion section holds the four whole-house card states (A two lamps on, B a tap
on All on, C holding, D everything off) and three worked animations in the
style of M1 to M7: **M8** hold to turn the house on (`12810:125`), **M9** the
house level counting with the finger (`12811:281`), and **06b** Follow the day
paused by a picked colour and resumed (`12813:48703`). 06's own copy was
corrected to the built behaviour: a picked colour pauses it until you resume,
through off and on.

**Next: v7.** The pass after this one lives in `design-v7-brief.md`,
`design-v7-ux.md` (flows and copy) and `design-v7-ui.md` (layout, the lighting
system, keyframe scripts), drawn in the file's App · current screens section. It
is concept work: nothing in it is built yet, and this spec stays the source of
truth for what is.

**The webfont.** `tokens.css` used to declare Lutron Sans Screen from files that
were never in the repo, so every phone fell back to its own face. The app is now
set in Figtree: one variable woff2 per subset (latin, latin-ext, as Fontsource cuts
them) in `web/ui/font/` with its licence as `OFL.txt`, the latin file preloaded by
the page, both in the service worker's offline list, and served for a year under
names that never change (a new cut ships under a new name). `layout_shell_test`
checks the face has loaded, measures as Figtree and is what Chromium draws, so it
cannot quietly fall back again.

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

### Read from the file's own animations

The Copper Night page has a motion board, **M · Motion principles** (12761:76, a
6 s timeline with the token table and twelve specimens), and seven worked
interactions beside it on real screens: **M1** sheet up and down (colour
sheet), **M2** light turns off, **M3** scene arrives, **M4** screen load
stagger and push, **M5** connection drops, **M6** brightness drag, **M7** add a
device. They are keyframe timelines, so `get_motion_context` returns each
animated node's keyframes, easing and timing exactly (the figma-implement-motion
skill), and everything below was taken from there rather than from the table
above.

What that settled:

- **The two springs are exact.** GENTLE (the sheet, and M7's result card)
  overshoots 2.8% and settles; QUICK (every press) overshoots 10.8%. Both are in
  `tokens.css` as the `linear()` curves the file exports, not approximations.
  EASE_IN is CSS `ease-in` and EASE_IN_AND_OUT is `ease-in-out`.
- **M1**: the sheet rises from off-screen in 0.42 s GENTLE while the scrim fades
  in over 0.24 s standard; it drops in 0.28 s EASE_IN with the scrim. Picking a
  swatch slides one selection ring 42 px (a swatch and its gap), moves the
  wheel's handle, recolours the value dot and crossfades the colour's name, all
  0.24 s standard; the swatch itself gets the press.
- **M2**: the copper pill slides to the other half in 0.24 s standard while the
  labels change colour; the glow fades and scales 1 to 0.85, and the lamp art dims,
  over the dimmer's 0.4 s EASE_IN_AND_OUT. On is the reverse.
- **M3**: the chip is pressed, the selected chip crossfades in 0.24 s, then every
  affected tile, the room's count and the badge crossfade together over the
  scene's 1.0 s EASE_IN_AND_OUT. The undo toast comes in over 0.32 s (fade and
  rise 12), its bar drains linearly, and it leaves in 0.2 s EASE_IN.
- **M4**: on load the title and its button arrive together, then each card
  0.04 s after the last (fade from 0 and rise 12, 0.32 s standard). Opening a
  room brings the new page in from +24 px with a fade while the list drifts
  -24 px and fades, 0.3 s standard.
- **M5**: nothing for the first ten seconds but the breathing dot (0.3 to 0.8,
  1.6 s EASE_IN_AND_OUT). Then the greeting crossfades to Offline, the page dims
  to 80% and moves down to make room while the card comes down 12 px into it.
  When the connection returns the card leaves in 0.2 s EASE_IN and the page
  rises back into its room.
- **M6**: the arc, the knob and the glow are locked to the finger and the number
  steps (HOLD), with no easing. That is what the dial already did.
- **M7**: while listening, three sonar rings go out from the inner ring a third
  of a beat apart (scale 0.6 to 1.6, opacity 0.6 to 0, 1.6 s ease-out) and the
  glow and inner ring breathe on the same 1.6 s. When a device is heard the
  rings fade, one ping goes out (scale 1 to 1.7, 0.4 s ease-out), the icon
  crossfades to the device's, the step dots change colour, and the result card
  slides up 360 px on GENTLE with the name field and the room chips rising in
  after it, 0.04 s apart.

### How the app plays them

The app draws each screen whole from its state, so the element a CSS transition
would animate is replaced by every redraw. `web/ui/motion.js` makes the
stylesheets' transitions real anyway:

- **carry**: before a redraw it notes every transitioning element's values
  (and `::before` / `::after`, where a toggle's knob lives); after, it pairs
  each new element with the one that stood in its place and plays that
  element's own `transition` from the old value to the new. Anything still
  moving is handed to the new element at the same point, so the bridge's
  confirmation arriving 20 ms after a tap does not cut the animation short.
- **crossfade** (`data-xf`): what cannot be interpolated, a copper gradient or a
  line of words, fades from a copy of the old over the new: 0.4 s for one
  light, 1.0 s while a scene arrives, 0.24 s standard with `data-xf="standard"`.
- **coming and going** (`data-enter`): an element drawn for the first time
  rises, drops, slides up like a sheet or pings once, as the attribute says,
  and only on the redraw that first draws it. What leaves goes in 0.2 s EASE_IN.
- **push, back and load** follow how deep the page sits: a tab is 0, what a tab
  opens is 1, a page opened from those is 2. A redraw asked for by the socket
  waits while a page is still arriving; a tap redraws at once.
- **loops** (the breathing dot, the sonar) are kept on the document's clock, so
  a redraw never starts one over.
- **reduced motion**: none of this runs, and the stylesheet cuts every CSS
  animation to nothing.

`test/browser/copper_motion_test.js` reads each of these off the running app
with `document.getAnimations()` and checks the file's duration, curve and
values, then walks the same screens with reduced motion on and checks that
nothing moves.

## What does not change

The hub, the connector, the protocol between them and the phone, the config
schema, and `web/js/kinds.js`, which the hub requires. This is a front-end
rebuild on top of the existing data layer. The load-bearing timings stay as they
are: long press 550 ms, house-off hold 1000 ms, the press window and hold
threshold from the settings the owner chose, and the connector fades (drift 30 s,
lamp on 0.4 s, scene 1.0 s).
