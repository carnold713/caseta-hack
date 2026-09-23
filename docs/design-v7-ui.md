# Copper Night v7 · the UI and the light

The UI half of the v7 pass (the brief is `design-v7-brief.md`; the UX half is `design-v7-ux.md`). For each of
the twenty: the layout on a 412 x 915 frame, how the light is drawn, one looping animation as a keyframe script a
builder can type into Figma, and why it earns its place. The last section, **A lighting system**, holds the rules
all twenty share. Read its first two parts before building any glow, because every screen below calls them.

Nothing here changes a component's geometry from `design-spec-v6.md` unless it says so. Where a copy line appears
it is a placeholder in the house voice; `design-v7-ux.md` owns the words.

## How to read the scripts

**Coordinates** are frame coordinates (0,0 is the frame's top left) unless a line says *card coords*, which are
relative to that card's top left. Sizes are x, y, w, h. A glow's position is its centre.

**Glows** are written `GLOW(cx, cy, D, tone, level)`. That is three ellipses, built exactly as **A lighting
system · 2** says, grouped as `Glow · {name}` with the layers `wash`, `body`, `core`. Where a script moves "the
glow", it moves the group, so the three layers stay locked together.

**Properties** use the Figma motion names: `OPACITY`, `TRANSLATION_X`, `TRANSLATION_Y`, `SCALE_XY`, `ROTATION`,
`WIDTH`, `HEIGHT`, `FILL_COLOR` (the layer's solid fill), `PATH_TRIM_END`, `EFFECT_RADIUS` (the radius of the
layer's first effect: a layer blur or a drop shadow's blur).

**Easing** uses the Figma names. `STD` is short for `CUSTOM_CUBIC_BEZIER 0.2,0.8,0.2,1`, the house "standard".
The others are written in full: `EASE_IN`, `EASE_OUT`, `EASE_IN_AND_OUT`, `LINEAR`, `GENTLE`, `QUICK`, `HOLD`.

**A press** is always the tap token, as the motion board draws it (12761:76): `SCALE_XY 1 to 0.96` over 0.12 s
`QUICK`, then `0.96 to 1` over the next 0.48 s `QUICK`. Scripts write it as one row, `TAP at t`.

**Times** are seconds from the start of the loop. Every timeline loops. Rows marked *reset* only return the demo
to its first frame for the loop; they are not part of the design and the app does not play them.

**Tokens** used, all from `tokens.css`: tap 0.12, standard 0.24, enter 0.32 (fade and rise 12), exit 0.2
`EASE_IN`, stagger 0.04, sheet in 0.42 `GENTLE`, sheet out 0.28 `EASE_IN`, push 0.3 ±24, dimmer 0.4
`EASE_IN_AND_OUT`, scene 1.0 `EASE_IN_AND_OUT`, breathe 1.6 loop, drift 30 `LINEAR`. Five new ones are proposed,
each with its reason, in **A lighting system · 6**: ambient 8.0, wave 0.06 per 100 px, land 0.6, ember 4.8, night
fade 1.6.

---

## 1. Home · the house, lit

**Layout.** As built (02 Home, 12732:48971), with one layer added at the very back.

- `House light` field: frame 412 x 420 at (0, 0), clips its content, sits under everything. A layer mask on it:
  linear gradient top to bottom, alpha 1 at 0%, 1 at 52%, 0 at 100%, so the light fades out by y 420 and the
  starred tiles sit on plain `#121212`.
- Greeting 14 Regular at (20, 66); H1 40 Light at (20, 88); header circles 56 at (272, 52) and (336, 52).
- Whole house card (20, 164, 372, 324), radius 28. **Change:** fill `#262626` at 88% with a background blur of 20,
  so the field shows through it as frosted glass. Its own copper glow (380 at card 170, -190) is removed: the field
  now does that job, and the card no longer tells the same story twice.
- Starred overline (20, 506); tiles strip (0, 530, 412, 150), tiles 168 x 150; scene chips (20, 696); coming up
  card (20, 752, 372, 68); tab bar (20, 803, 372, 72).

**Lighting.** One pool of light per room that is on, placed on a fixed constellation so a room always glows in the
same place: slot 1 (104, 64), slot 2 (330, 40), slot 3 (230, 180), slot 4 (40, 220), slot 5 (380, 240), slot 6
(150, 300). Rooms take slots in the order of the Rooms tab; a seventh room and beyond reuses slots 1 to 6 at 0.8 of
the size. Pools use the Home pool scale (D 160 to 360). The frame state (7 on in 3 rooms):

- `Glow · Living room`: `GLOW(104, 64, 317, 2700K, 62%)`: wash 507 `#D98A4E` at 0.075, body 317 `#FFC78A` at
  0.166, core 101 `#FFD9A8` at 0.38.
- `Glow · Living room · Accent`: the blue lamp in that room is its own smaller pool, 0.6 of a white pool:
  `GLOW(176, 140, 172, #4C8DFF, 40%)`: wash 275 `#2A3F82` at 0.061, body 172 `#4C8DFF` at 0.098, core 55 `#CFE0FF`
  at 0.244.
- `Glow · Office`: `GLOW(230, 180, 286, 3000K, 40%)`: wash 458 `#D98A4E` at 0.061, body 286 `#FFD9A8` at 0.134,
  core 92 `#FAE5C9` at 0.305.
- `Glow · Porch`: `GLOW(380, 240, 360, 3000K, 100%)`: wash 576 at 0.10, body 360 `#FFD9A8` at 0.22, core 115
  `#FAE5C9` at 0.50. Most of it sits behind the frosted card, which is right: it is outside.
- Every glow layer blends `SCREEN`, so two pools that overlap add up to more light where they meet, the way two
  lamps do on a wall.
- **Off:** a room that is off has no pool at all. With everything off the field is empty and the header sits on
  `#121212`. No grey glow, no placeholder.

**Animation · the house breathing, one room going out** (8.0 s loop, ambient token).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Living room · body | SCALE_XY | 1 | 1.03 | 0.0 | 4.0 | EASE_IN_AND_OUT |
| Living room · body | SCALE_XY | 1.03 | 1 | 4.0 | 8.0 | EASE_IN_AND_OUT |
| Living room · body | OPACITY | 1 | 0.88 | 0.0 | 4.0 | EASE_IN_AND_OUT |
| Living room · body | OPACITY | 0.88 | 1 | 4.0 | 8.0 | EASE_IN_AND_OUT |
| Porch · body | SCALE_XY | 1.03 | 1 | 0.0 | 4.0 | EASE_IN_AND_OUT |
| Porch · body | SCALE_XY | 1 | 1.03 | 4.0 | 8.0 | EASE_IN_AND_OUT |
| Glow · Office | OPACITY | 1 | 0 | 3.0 | 3.4 | EASE_IN_AND_OUT |
| Glow · Office | SCALE_XY | 1 | 0.85 | 3.0 | 3.4 | EASE_IN_AND_OUT |
| Headline "7 on · 52%" | OPACITY | 1 | 0 | 3.0 | 3.24 | STD |
| Headline "5 on · 58%" | OPACITY | 0 | 1 | 3.0 | 3.24 | STD |
| Glow · Office (reset) | OPACITY | 0 | 1 | 6.6 | 7.0 | EASE_IN_AND_OUT |
| Glow · Office (reset) | SCALE_XY | 0.85 | 1 | 6.6 | 7.0 | EASE_IN_AND_OUT |
| Headlines (reset) | OPACITY | swap back | | 6.6 | 6.84 | STD |

**Why it is gorgeous.** The top of Home stops being decoration and becomes a picture of the house from above at
night: you can see which rooms are lit, how warm, how bright, before reading a word.

---

## 2. Rooms · light that pools

**Layout.** As built (13 Rooms, 12744:38): H1 "Rooms" and the 56 plus circle at (336, 52); All scenes card
(20, 132, 372, 88) radius 28; room cards 372 x 180 radius 28 at (20, 232), (20, 424), (20, 616), 12 apart. Power
circle 44 at card coords (312, 120), 16 in from the right and bottom. Name 20 Medium at card (16, 104), status 14
Regular at card (16, 134).

**Lighting.**

- **The photo is lit, not just the glow.** A card with a photo stacks: photo; `Room · off veil` (`#121212` at 55%
  plus a `#808080` fill at 100% in blend `SATURATION`, so the photo goes grey); `Room · warmth` (fill `#FFB46B` at
  0% to 10% by level, blend `SOFT_LIGHT`); the glow; the bottom scrim (as built, black 0% to 78%). Off: veil at
  100%, warmth at 0. On: veil at 0, warmth at 0.10 x level.
- **The glow comes from where the room's light is**: `GLOW` at card coords (272, 44), room scale (D 140 to 320),
  toned by the room's lamps (the average white in mireds; colour lamps add their own 0.6 pool beside it at card
  (210, 60)). Living room at 62% 2700K: D 282, body `#FFC78A` at 0.166, core `#FFD9A8` at 0.38, wash `#D98A4E` at
  0.075. Clipped by the card.
- Cards without a photo (the generated art at 22%): same stack without the saturation layer; lit, the art goes to
  32% and takes the glow over it.
- Power circle: on, fill `#D98A4E`, glyph white 22, drop shadow 0 0 16 `#D98A4E` at 0.45; off, `#121212` at 70%,
  glyph `#D1D1D1`.

**Animation · Kitchen turned on, blooming from its button** (4.0 s loop). Kitchen card at (20, 424); its power
circle's centre is at (354, 566).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Kitchen · power | TAP at 0.30 | | | 0.30 | 0.90 | QUICK |
| Kitchen · power · on (copper circle) | OPACITY | 0 | 1 | 0.30 | 0.54 | STD |
| Glow · Kitchen | TRANSLATION_X | +62 | 0 | 0.42 | 0.82 | EASE_IN_AND_OUT |
| Glow · Kitchen | TRANSLATION_Y | +98 | 0 | 0.42 | 0.82 | EASE_IN_AND_OUT |
| Glow · Kitchen | SCALE_XY | 0.2 | 1 | 0.42 | 0.82 | EASE_IN_AND_OUT |
| Glow · Kitchen | OPACITY | 0 | 1 | 0.42 | 0.82 | EASE_IN_AND_OUT |
| Kitchen · off veil | OPACITY | 1 | 0 | 0.50 | 0.90 | EASE_IN_AND_OUT |
| Kitchen · warmth | OPACITY | 0 | 1 | 0.50 | 0.90 | EASE_IN_AND_OUT |
| Status "All off" | OPACITY | 1 | 0 | 0.42 | 0.66 | STD |
| Status "2 of 4 on · 70%" | OPACITY | 0 | 1 | 0.42 | 0.66 | STD |
| Everything above (reset) | reverse | | | 3.20 | 3.60 | EASE_IN_AND_OUT |

The glow starts centred on the button (+62, +98 from where it rests) at a fifth of its size and opens out to the
room's light: that is the bloom. The photo warms 0.08 s behind the glow (two staggers), so the light seems to
reach the room rather than appear on it.

**Why it is gorgeous.** Turning a room on looks like what it is: light starting at the switch and filling the
room, and a room that is off looks asleep rather than merely unhighlighted.

---

## 3. A light · the lamp's own glow

**Layout.** As built (04 Light, 12731:22): back (20, 52), star (272, 52), dots (336, 52); lamp art 180 at
(116, 46); room caption 14 at (168, 240); title 44 Light at (110, 260); On / Off (20, 326, 372, 72); White and
Colour tiles 180 x 132 at (20, 414) and (212, 414); feature rows 180 x 64 at (20, 558) and (212, 558); dial group
(0, 640, 412, 250), arc 340 x 190 at (36, 640), stroke centre radius 150 around (206, 810). Knob position at level
p: x = 206 - 150 cos(πp), y = 810 - 150 sin(πp): (312, 704) at 75%, (183, 662) at 45%, (85, 722) at 20%.

**Lighting.** The v6 halo (one 560 disc at 0.10) becomes the full recipe, plus two new layers.

- `Glow · Lamp`: `GLOW(206, 112, D, tone, level)`, hero scale (D 260 to 560). At 75% 2700K: wash 832 `#D98A4E` at
  0.084 with layer blur 32; body 520 `#FFC78A` at 0.184; core 166 `#FFD9A8` at 0.42. All `SCREEN`.
- `Lamp · filament`: an ellipse 64 x 72 at (174, 72) inside the bulb's glass, radial `#FFF1DC` at 0.45 to 0, so the
  lamp art is lit from within, not just stroked in white.
- `Lamp · floor pool`: the light landing below it: ellipse at (206, 236), 300 x 36 at 100% (width 120 + 180 x
  level), radial ramp colour at 0.12 x m, layer blur 12. It sits behind the room caption and makes the lamp feel
  like it stands in the room.
- `Dial · knob glow`: ellipse 72 centred on the knob, radial body tone at 0.30 to 0, `SCREEN`. The knob looks like
  it holds the light.
- The arc fill is the lamp's own light: for a white, the copper arc gradient as built (`#F3D9C3` 0%, `#E6A06A` 45%,
  `#D98A4E` 100%). For a colour lamp, the tint's glow stop at 0%, the lamp colour at 45%, the tint's deep stop at
  100% (blue: `#CFE0FF`, `#4C8DFF`, `#2A3F82`).
- The number "75" gets a drop shadow 0, 0, blur 24, body tone at 0.25, only at 50% and above.
- **Colour lamp:** same layers, colour tone (body lamp colour, core the tint glow, wash the tint deep), alphas from
  the colour column of the level table. The On segment stays copper: it means on, not which colour.
- **Off:** `Glow · Lamp`, filament, floor pool and knob glow at opacity 0 and the glow at scale 0.85; lamp art at
  20%; arc shows the `#2A2724` track only; number `#9E9E9E`.

**Animation · dragging from 75% to 20% and back** (6.0 s loop). M6's rule: locked to the finger, no easing, the
number steps. Knob and knob glow share keyframes.

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Touch (44 disc, white 18%) | OPACITY | 0 | 1 | 0.40 | 0.52 | STD |
| Knob + knob glow | TRANSLATION_X | 0 | -129 | 0.50 | 1.25 | LINEAR |
| Knob + knob glow | TRANSLATION_Y | 0 | -42 | 0.50 | 1.25 | LINEAR |
| Knob + knob glow | TRANSLATION_X | -129 | -227 | 1.25 | 2.00 | LINEAR |
| Knob + knob glow | TRANSLATION_Y | -42 | +18 | 1.25 | 2.00 | LINEAR |
| Arc fill | PATH_TRIM_END | 0.75 | 0.20 | 0.50 | 2.00 | LINEAR |
| Glow · Lamp | SCALE_XY | 1 | 0.76 | 0.50 | 2.00 | LINEAR |
| Glow · Lamp | OPACITY | 1 | 0.57 | 0.50 | 2.00 | LINEAR |
| Lamp · floor pool | WIDTH | 255 | 156 | 0.50 | 2.00 | LINEAR |
| Lamp · filament | OPACITY | 1 | 0.55 | 0.50 | 2.00 | LINEAR |
| Numbers 75 / 60 / 45 / 30 / 20 | OPACITY | one at a time | | 0.50, 0.88, 1.25, 1.62, 2.00 | | HOLD |
| Touch | OPACITY | 1 | 0 | 2.00 | 2.20 | EASE_IN |
| All of the above | the same path back up | 20% | 75% | 3.20 | 4.70 | LINEAR |

The glow's scale and opacity come straight from the level table: at 20% the hero D is 394 (394 / 520 = 0.76) and
m is 0.48 (0.48 / 0.84 = 0.57).

**Why it is gorgeous.** The finger is not moving a number, it is visibly turning a lamp down: the halo tightens, the
bulb cools inside, the pool on the floor shrinks, all at the pace of the thumb.

---

## 4. Colour · painting with light

**Layout.** The colour sheet over Light (05, 12732:48591): sheet top y 250, body radius 28, grabber 40 x 4 at
(186, 258); overline (20, 278); title 32 Light (20, 298); close 40 at (352, 278); White / Colour segment
(20, 350, 372, 44); wheel 236 at (88, 425), centre (206, 543); value row at y 700 (12 dot at (20, 705), name 20
Medium at x 40, "Enter exact" link right aligned 20 in); swatch row y 723, 34 discs 8 apart (x = 20 + 42i, it
scrolls sideways); note line at y 790.

**Lighting.**

- `Sheet · wash`: inside the sheet, clipped by it, an ellipse 560 x 380 centred on (206, 250), the sheet's top
  edge, radial lamp colour at 0.14 to 0 at 100%, `SCREEN`. Two stacked copies (`wash · old`, `wash · new`) so the
  colour can crossfade: colour never slides.
- The page behind the scrim shows the lamp's hero glow in the picked colour: the 04 glow recoloured, so the lamp
  itself is seen changing above the sheet.
- **Swatches as lit glass beads.** Each 34 disc is a radial gradient centred at (35%, 30%) of the disc, three stops
  from the tint set: 0% the tint glow, 45% the lamp colour, 100% the tint deep (blue: `#CFE0FF`, `#4C8DFF`,
  `#2A3F82`; amber: `#FFEBC4`, `#FFC24A`, `#8F5F0E`). Inner shadow 0, -2, blur 4, black 25%. A specular ellipse 12 x
  6 at disc (7, 5), white 55%, layer blur 2. Drop shadow 0, 4, blur 12, lamp colour at 0.30. They look like
  glass that light is passing through.
- Selected bead: the ring as built (2 px white, 4 out), plus `GLOW` at the bead, dot scale (D 40), colour tone at
  100%: body lamp colour at 0.16.
- **The wheel's handle is luminous**: 36 disc filled with the picked colour, 3 px white ring, and an 88 radial of
  the picked colour at 0.35 to 0, `SCREEN`, behind it. Behind the whole wheel, a 300 ellipse of white at 0.04 to 0,
  so the wheel sits on its own faint light.

**Animation · blue to amber** (5.0 s loop). Blue is swatch 7 (x 314), amber swatch 2 (x 104). The handle moves
from blue's place on the wheel (141, 492) to amber's (269, 597).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Swatch · amber | TAP at 0.50 | | | 0.50 | 1.10 | QUICK |
| Selection ring | TRANSLATION_X | 0 | -210 | 0.50 | 0.74 | STD |
| Bead glow | TRANSLATION_X | 0 | -210 | 0.50 | 0.74 | STD |
| Bead glow · blue body | OPACITY | 1 | 0 | 0.50 | 0.74 | STD |
| Bead glow · amber body | OPACITY | 0 | 1 | 0.50 | 0.74 | STD |
| Wheel handle + its glow | TRANSLATION_X | 0 | +128 | 0.50 | 0.74 | STD |
| Wheel handle + its glow | TRANSLATION_Y | 0 | +105 | 0.50 | 0.74 | STD |
| Handle fill · blue / amber | OPACITY | crossfade | | 0.50 | 0.74 | STD |
| Value dot and name "Blue" / "Amber" | OPACITY | crossfade | | 0.50 | 0.74 | STD |
| Sheet · wash · old (blue) | OPACITY | 1 | 0 | 0.50 | 0.90 | EASE_IN_AND_OUT |
| Sheet · wash · new (amber) | OPACITY | 0 | 1 | 0.50 | 0.90 | EASE_IN_AND_OUT |
| Lamp glow behind scrim · blue / amber | OPACITY | crossfade | | 0.50 | 0.90 | EASE_IN_AND_OUT |
| Everything (reset, amber to blue) | the same rows mirrored | | | 3.00 | 3.40 | as above |

The controls move on the standard 0.24 s because the person moved them; the light washes on the dimmer's 0.4 s
because it is light.

**Why it is gorgeous.** The whole sheet takes on the colour of the lamp, so choosing a colour feels like tinting the
room you are sitting in, and the beads read as the colours of light, not paint chips.

---

## 5. White · the time of day

**Layout.** The same sheet on its White side (05b, 12732:49220): overline, title, segment as in 4.

- Readout "2700K" 48 Light at (20, 408), with the 12 dot and "Warm" 16 Regular after it at x 190.
- `Sky` card (20, 476, 372, 200), radius 28: the control. Horizon line at card y 168, 1 px white 10%.
- Sun path: dashed arc, 1 px white 16%, dash 2 gap 4, from card (24, 168) up to (348, 40), y = 168 - 128 sin(tπ/2)
  with x = 24 + 324t, t the white's position in mireds from 1900K (t = 0) to 6500K (t = 1). 2700K is t = 0.42:
  sun at card (160, 90). 4000K is t = 0.74: card (264, 50).
- Sun: 28 disc on the path, the grip (a finger takes it at once). Beyond the lamp's limit (5000K, t = 0.88, card x
  308) the sky is hatched: 45° lines, white 6%, 6 apart.
- Under the sky, 12 Medium overline, `#9E9E9E`: "CANDLE · DUSK" at (20, 686), "DAYLIGHT · NOON" right aligned at 392.
- Chips (Candle, Warm, Neutral, Cool, Daylight) 40 tall at y 716; note line 14 at (20, 768); Follow the day row
  group (20, 800, 372, 72).

**Lighting.** The sky is three stacked fills in the card, then the sun.

- `Sky · base`: `#171411`.
- `Sky · dusk`: linear 0° (left to right): `#FF8A1F` at 0.55 at 0%, `#FFAE5E` at 0.40 at 30%, `#FFD7B0` at 0.24 at
  60%, `#FFF6F0` at 0.16 at 100%. These are the file's eight white stops, so the sky is the actual candle to
  daylight bar laid on its side.
- `Sky · night`: linear 90° (top to bottom): `#121212` at 0.72 at 0%, `#121212` at 0 at 84%. The horizon is where
  the light is.
- `Sky · noon`: radial at card (300, 30), 360 wide, `#F4F1EA` at 0.18 to 0. Its opacity follows the sun: 0 at
  t = 0.3, 1 at t = 1.
- Sun: fill the lamp's current white from the ramp (`#FFC78A` at 2700K), 1 px white 40% rim, and `GLOW` at the sun
  with dot scale doubled (D 80), white tone, 100%.
- The sheet's top wash (as in 4) takes the ramp colour at 0.10, so the sheet is faintly warm at candle and faintly
  clean at daylight.

**Animation · dragging the sun from 2700K to 4000K** (8.0 s loop). A drag is locked to the finger (M6).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Touch | OPACITY | 0 | 1 | 0.90 | 1.02 | STD |
| Sun + its glow | TRANSLATION_X | 0 | +104 | 1.00 | 2.60 | LINEAR |
| Sun + its glow | TRANSLATION_Y | 0 | -40 | 1.00 | 2.60 | LINEAR |
| Sun | FILL_COLOR | #FFC78A | #FAE5C9 | 1.00 | 2.60 | LINEAR |
| Sky · noon | OPACITY | 0.17 | 0.63 | 1.00 | 2.60 | LINEAR |
| Readouts 2700K / 3000K / 3500K / 4000K | OPACITY | one at a time | | 1.00, 1.40, 2.00, 2.60 | | HOLD |
| Chip "Warm" copper / "Cool" copper | OPACITY | crossfade | | 2.60 | 2.84 | STD |
| Sheet wash · 2700K / 4000K | OPACITY | crossfade | | 1.00 | 2.60 | LINEAR |
| Touch | OPACITY | 1 | 0 | 2.60 | 2.80 | EASE_IN |
| All of the above (reset) | the same path back | | | 4.80 | 6.40 | LINEAR |

The sun's fill slides here, which the product rules otherwise forbid, because this is a finger dragging a lamp live;
it is the one place colour moves continuously, and only under a finger.

**Why it is gorgeous.** Kelvin numbers mean nothing to most people, but everyone knows the difference between late
afternoon and a candle, and here the lamp's white is literally the sky at that hour.

---

## 6. A scene arriving

**Layout.** Room page as built (03, 12733:20): back (20, 52); dots (336, 52); H1 (20, 128); "7 devices · 3 on"
right aligned at y 151; hero photo card (20, 188, 372, 300) with the count badge 56 at (36, 204) and All on / All
off (32, 412), each 168 x 64; chips row at y 504 (Relax chip at (123, 504, 88, 40), centre (167, 524)); tiles
180 x 150 at (20, 560), (212, 560), (20, 722), (212, 722).

**Lighting.**

- `Wave`: an ellipse 1200 centred on the tapped chip (167, 524). Radial, a soft ring of light: 0% `#FFB46B` at 0,
  78% at 0, 88% `#FFB46B` at 0.14, 100% at 0. `SCREEN`. The colour is the scene's warmest lamp (Relax: 2200K
  `#FFB46B`); a scene with colour lamps uses its first colour lamp's body colour at 0.10.
- `Chip · spark`: `GLOW(167, 524, 120, copper, 100%)` under the chip at the moment it is pressed, fading as the wave
  leaves.
- Tiles, hero photo and badge each have a `before` and an `after` layer (the M3 method). The hero photo's `after`
  is the warmth and veil treatment from screen 2 at the scene's level.
- Count badge: a 2 px copper ring (`#E6A06A`), r 27, around the badge, drawn as it settles.

**Animation · Relax arriving** (6.0 s loop). The wave spreads at 0.06 s per 100 px (the wave token), so each thing
starts when the ring reaches it. Distances from the chip: tile 1 125 px, tile 2 174, hero 192, tile 3 279, tile 4
304, badge 309.

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Chip · Relax | TAP at 0.30 | | | 0.30 | 0.90 | QUICK |
| Chip · Relax · current (copper) | OPACITY | 0 | 1 | 0.30 | 0.54 | STD |
| Chip · spark | OPACITY | 0 | 1 | 0.30 | 0.42 | STD |
| Chip · spark | OPACITY | 1 | 0 | 0.42 | 1.00 | EASE_IN_AND_OUT |
| Wave | SCALE_XY | 0.03 | 1 | 0.42 | 0.78 | LINEAR |
| Wave | OPACITY | 1 | 0 | 0.60 | 0.78 | EASE_IN |
| Tile 1 · after | OPACITY | 0 | 1 | 0.50 | 1.50 | EASE_IN_AND_OUT |
| Tile 2 · after | OPACITY | 0 | 1 | 0.52 | 1.52 | EASE_IN_AND_OUT |
| Hero photo · after | OPACITY | 0 | 1 | 0.54 | 1.54 | EASE_IN_AND_OUT |
| Tile 3 · after | OPACITY | 0 | 1 | 0.59 | 1.59 | EASE_IN_AND_OUT |
| Tile 4 · after | OPACITY | 0 | 1 | 0.60 | 1.60 | EASE_IN_AND_OUT |
| Badge ring | PATH_TRIM_END | 0 | 1 | 0.61 | 1.61 | EASE_IN_AND_OUT |
| Badge "3" / "4" | OPACITY | crossfade | | 1.61 | 1.85 | STD |
| Badge ring | OPACITY | 1 | 0 | 1.61 | 1.85 | STD |
| "7 devices · 3 on" / "· 4 on" | OPACITY | crossfade | | 1.61 | 1.85 | STD |
| Undo toast | OPACITY + TRANSLATION_Y | 0, +12 | 1, 0 | 1.61 | 1.93 | STD |
| Undo toast · bar | WIDTH | 332 | 0 | 1.93 | 5.40 | LINEAR |
| Undo toast | OPACITY | 1 | 0 | 5.40 | 5.60 | EASE_IN |
| All `after` layers, chip (reset) | OPACITY | 1 | 0 | 5.60 | 6.00 | EASE_IN |

**Why it is gorgeous.** The scene visibly comes from the place you touched and washes over the room, so a single tap
reads as cause and effect, and the count only changes once the light has arrived.

---

## 7. Scene editor · a stage

**Layout.** A page one level down from Scenes. Back (20, 52); H1 "Relax" 40 Light (20, 128); caption "Living room
· 4 lights" 14 at (20, 176).

- `Stage` card (20, 212, 372, 440), radius 28, fill `#1A1715`.
- Floor line at card y 380, 1 px white 8%, full width less 24 each side. Below it the floor: linear top to bottom
  `#221D19` to `#161311`.
- Four lanes, orbs centred at card x 57, 143, 229, 315 (86 apart). An orb's height is its level: centre card
  y = 360 - 280 x level (100% at y 80, 1% at y 357).
- Orb: 44 disc. A stem from the orb to the floor: 1 px white 8%, like a stage wire. Level 14 Medium at the orb's
  right, 8 from its edge, white. Light name 14 Regular `#D1D1D1`, centred under the lane at card y 400.
- Off lane: below the floor line; an orb dragged under y 380 snaps there and shows as a 44 ring, 1 px `#6E6E6E`, no
  fill, no glow, "Off" in `#9E9E9E`.
- Under the stage: colour chips for the orb last touched (40 tall at y 668), and a ghost pill 372 x 48 at
  (20, 724) to play the scene in the room. No Save: every move applies to the scene and offers Undo.

**Lighting.**

- Each orb: radial fill, 0% the core tone, 60% the body tone, 100% the wash deep (2700K: `#FFD9A8`, `#FFC78A`,
  `#B86C35`); 1 px rim white 22%. A colour orb uses the tint stops.
- `GLOW` at each orb, orb scale (D 56 to 140).
- `Floor pool` under each orb, on the floor line: ellipse width 40 + 80 x √level, height 14, body tone at 0.12 x m,
  layer blur 8. It is the orb's light landing on the stage.
- `Stage · wash`: one ellipse 520 x 300 at card (186, 120), radial `#D98A4E` at 0.10 to 0, opacity equal to the
  scene's average level, so a brighter scene lights the whole stage.

**Animation · lifting the pendant from 30% to 80%** (6.0 s loop). Pendant is lane 2, card x 143: it rises 140
(0.5 x 280).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Touch | OPACITY | 0 | 1 | 0.80 | 0.92 | STD |
| Orb 2 + glow + level label | TRANSLATION_Y | 0 | -140 | 1.00 | 2.20 | LINEAR |
| Glow · Orb 2 | SCALE_XY | 1 | 1.28 | 1.00 | 2.20 | LINEAR |
| Glow · Orb 2 | OPACITY | 0.63 | 1 | 1.00 | 2.20 | LINEAR |
| Stem 2 | HEIGHT | 82 | 222 | 1.00 | 2.20 | LINEAR |
| Floor pool 2 | WIDTH | 84 | 112 | 1.00 | 2.20 | LINEAR |
| Floor pool 2 | OPACITY | 0.63 | 1 | 1.00 | 2.20 | LINEAR |
| Stage · wash | OPACITY | 0.46 | 0.58 | 1.00 | 2.20 | LINEAR |
| Level 30 / 45 / 60 / 70 / 80 | OPACITY | one at a time | | 1.00, 1.30, 1.60, 1.90, 2.20 | | HOLD |
| Touch | OPACITY | 1 | 0 | 2.20 | 2.40 | EASE_IN |
| All of the above (reset) | the same path down | | | 3.80 | 5.00 | LINEAR |

**Why it is gorgeous.** A scene becomes something you can see at a glance, four lights hung at their heights over a
stage, and setting one is lifting a light, not typing a percentage.

---

## 8. Follow the day

**Layout.** Back (20, 52); H1 "Follow the day" (20, 128); caption "Floor lamp · Living room" 14 at (20, 176).

- `Day dial` card (20, 212, 372, 440), radius 28, `#262626`.
- The dial: a ring of diameter 300 (stroke centre), stroke 28, centred at card (186, 186), frame (206, 398). Noon at
  the top, midnight at the bottom, the day running clockwise, so the morning is on the left and the evening on the
  right.
- Inside the ring, `Today's curve`: a closed vector around the same centre whose radius is the planned white, from
  r 72 at 2200K to r 118 at 5000K. It bulges at noon and draws in at night.
- The sun: a 20 disc on the ring at now's angle (angle = (hour - 12) x 15°, clockwise from the top). The moon: a 16
  crescent at the bottom, `#D1D1D1` at 60%.
- Centre: "NOW" 12 Medium overline `#9E9E9E` at centre y - 44; "2400K" 44 Light centred on the centre; "warming
  toward evening" 14 Regular `#D1D1D1` at centre y + 30.
- Paused state: under the dial, "Keeping a colour you picked" 14 Regular `#D1D1D1` centred at card y 356, and the
  light button (`#F8F8F8`, text `#262626`) 220 x 48 centred at card (76, 380), frame (96, 592): "Follow the day
  again".
- Below the card, the existing group (Following now, Dim in the evening too, Also for) from y 668.

**Lighting.**

- The ring is an angular gradient (`GRADIENT_ANGULAR`, starting at the top, going clockwise), stops at: 0.00
  `#F4F1EA`; 0.15 `#FAE5C9`; 0.25 `#FFD9A8`; 0.30 `#FFB46B` (sunset, 7:12 pm); 0.36 `#B86C35`; 0.42 `#3A2A20`;
  0.50 `#2A2724` (midnight); 0.70 `#3A2A20`; 0.75 `#B86C35`; 0.783 `#FFB46B` (sunrise, 6:48 am); 0.85 `#FFD9A8`;
  0.92 `#FAE5C9`; 1.00 `#F4F1EA`. The whole ring at opacity 0.35; the part of today already lived, from midnight
  to now, is a second copy at 0.9 trimmed to now.
- `Today's curve`: stroke 3, the same angular gradient, and a duplicate with layer blur 10 at 0.5 under it: the glow.
  It is trimmed to now like the ring; the rest of the day is a 1 px dashed white 16% line.
- Sun: fill the ramp colour at now (`#FFB46B` at 2400K), `GLOW` with dot scale doubled (D 80), 100%.
- **Paused:** the ring and curve drop to 0.2; the sun is replaced by a 20 disc in the picked colour (blue
  `#4C8DFF`) with a 1.5 px white ring and a colour-tone glow D 80. Seen at once: the day is still there, the lamp is
  keeping its own colour.

**Animation · resuming, then the day moving** (8.0 s loop). The drift is 30 s in life; here two hours pass in six
seconds, and the caption says so. Now is 6 pm. The two trimmed copies are paths that start at midnight and run
clockwise, so 6 pm is 0.75 of the way round and 8 pm is 0.833.

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Pill "Follow the day again" | TAP at 1.00 | | | 1.00 | 1.60 | QUICK |
| Pill + "Keeping a colour you picked" | OPACITY | 1 | 0 | 1.12 | 1.32 | EASE_IN |
| Ring (day copy) + curve | OPACITY | 0.2 | 0.9 | 1.12 | 2.12 | EASE_IN_AND_OUT |
| Picked colour disc + its glow | OPACITY | 1 | 0 | 1.12 | 2.12 | EASE_IN_AND_OUT |
| Sun + its glow | OPACITY | 0 | 1 | 1.12 | 2.12 | EASE_IN_AND_OUT |
| Centre "Paused" / "2400K" | OPACITY | crossfade | | 1.12 | 1.36 | STD |
| Sun group (pivot at dial centre) | ROTATION | 0 | 30° | 2.20 | 8.00 | LINEAR |
| Ring (day copy) | PATH_TRIM_END | 0.750 | 0.833 | 2.20 | 8.00 | LINEAR |
| Today's curve (lit copy) | PATH_TRIM_END | 0.750 | 0.833 | 2.20 | 8.00 | LINEAR |
| Sun | FILL_COLOR | #FFB46B | #FFA85A | 2.20 | 8.00 | LINEAR |
| Centre 2400K / 2300K / 2200K | OPACITY | crossfade | | 4.00, 6.00 | +0.24 | STD |
| All (reset to paused) | | | | 8.00 | | HOLD |

The sun's colour slides because this is the app's drift, the one thing the rules allow to move that slowly.

**Why it is gorgeous.** A whole day fits in one circle you already understand, a clock, and the lamp's light reads
as a place on it, bright at noon, amber at the edges, dark at the bottom.

---

## 9. Evening wind-down

**Layout.** Back (20, 52); H1 "Evening wind-down" (20, 128); caption 14 "On · every evening" at (20, 176).

- `Tonight` card (20, 212, 372, 256), radius 28. Overline "TONIGHT" at card (20, 20); line "At 11 pm the house goes
  quiet" 20 Medium at card (20, 40).
- Time axis: card x 20 (7 pm) to x 352 (7 am), 27.67 px per hour. Baseline at card y 176. Hour labels 12 Regular
  `#9E9E9E` at card y 196: "7 pm" at 20, "9" at 75, "11 pm" at 131, "3 am" at 242, "7 am" right aligned at 352.
- `Glow band`: four steps bottom anchored on the baseline, one per hour: 7 to 8 pm 100%, 8 to 9 pm 80%, 9 to 10 pm
  60%, 10 to 11 pm 40%. Height = 80 x level (80, 64, 48, 32), each 27.67 wide, radius 6 on the top corners.
- Night hours, 11 pm to 7 am: a flat 332 wide band (card x 131 to 352) 2 tall on the baseline, white 8%. The moon:
  a 24 crescent at card (242, 120), `#D1D1D1` at 70%.
- Now marker: a 1 px white 60% line, card y 72 to 176, with a 8 disc on the baseline.
- Below: the steps as a list group (20, 488), then the rooms it covers.

**Lighting.**

- Each step warms as it dims: 7 pm `#FFD9A8` (3000K), 8 pm `#FFC78A` (2700K), 9 pm `#FFB46B` (2200K), 10 pm
  `#FF9A3C` (1900K from the white bar). Fill: linear top to bottom, the step's colour at 0.85 to `#D98A4E` at 0.30.
- Over each step, its glow: a copy with layer blur 16 at 0.35, `SCREEN`, 8 wider and 8 taller. The glow shrinks
  with the step, so the band's light visibly draws in.
- The moon has a `GLOW` of D 64 in `#F4F1EA` at 0.06, the faintest light in the app: the night is not empty, only
  quiet.
- Steps still to come sit at 0.45; the step under the now marker is at 1.

**Animation · the evening played through** (8.0 s loop). One hour is 0.5 s.

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Now marker | OPACITY | 0 | 1 | 0.20 | 0.52 | STD |
| Now marker | TRANSLATION_X | 0 | +332 | 0.50 | 6.50 | LINEAR |
| Step 7 pm | OPACITY | 0.45 | 1 | 0.50 | 0.90 | EASE_IN_AND_OUT |
| Step 7 pm | OPACITY | 1 | 0.45 | 1.00 | 1.40 | EASE_IN_AND_OUT |
| Step 8 pm | OPACITY | 0.45 | 1 | 1.00 | 1.40 | EASE_IN_AND_OUT |
| Step 8 pm | OPACITY | 1 | 0.45 | 1.50 | 1.90 | EASE_IN_AND_OUT |
| Step 9 pm | OPACITY | 0.45 | 1 | 1.50 | 1.90 | EASE_IN_AND_OUT |
| Step 9 pm | OPACITY | 1 | 0.45 | 2.00 | 2.40 | EASE_IN_AND_OUT |
| Step 10 pm | OPACITY | 0.45 | 1 | 2.00 | 2.40 | EASE_IN_AND_OUT |
| Step 10 pm | OPACITY | 1 | 0.45 | 2.50 | 2.90 | EASE_IN_AND_OUT |
| Moon + its glow | OPACITY | 0.3 | 1 | 2.50 | 3.50 | EASE_IN_AND_OUT |
| Moon | TRANSLATION_Y | +6 | 0 | 2.50 | 3.50 | EASE_IN_AND_OUT |
| Now marker | OPACITY | 1 | 0 | 6.50 | 6.70 | EASE_IN |
| Moon (reset) | OPACITY | 1 | 0.3 | 7.00 | 7.40 | EASE_IN_AND_OUT |

**Why it is gorgeous.** The evening reads as a single gesture, a warm light stepping down the stairs into night,
so "the house winds down" is something you see rather than a list of times.

---

## 10. Goodnight house

**Layout.** Home (as screen 1) at the moment the hold ring on "Goodnight house" (card coords (20, 262), ring 44)
completes. Added layers, over everything, under the status bar:

- `Night veil`: 412 x 915, `#0A0908`.
- "Sleep well" 32 Light `#D1D1D1`, centred at y 432; a moon glyph 24, `#D1D1D1`, centred at y 388.

**Lighting.**

- Rooms go out in the Rooms tab order, each pool on the dimmer, 0.24 s apart. Starred tiles cross to their off look
  at the same moment as their room's pool.
- When the last room is out, the veil closes over the interface: the app itself goes to sleep with the house.
- The only light left: `GLOW(206, 388, 96, #F4F1EA, 1%)`: no core, body at 0.06, wash at 0.03. A moon, not a lamp.

**Animation · the house going to sleep** (8.0 s loop).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Hold ring arc | PATH_TRIM_END | 0.125 | 1 | 0.20 | 1.20 | LINEAR |
| Goodnight row | TAP-like press: SCALE_XY | 1 | 0.98 | 0.20 | 0.32 | QUICK |
| Glow · Living room | OPACITY / SCALE_XY | 1 / 1 | 0 / 0.85 | 1.30 | 1.70 | EASE_IN_AND_OUT |
| Tile Floor lamp · after (off) | OPACITY | 0 | 1 | 1.30 | 1.70 | EASE_IN_AND_OUT |
| Glow · Living room · Accent | OPACITY / SCALE_XY | 1 / 1 | 0 / 0.85 | 1.30 | 1.70 | EASE_IN_AND_OUT |
| Tile Accent lamp · after (off) | OPACITY | 0 | 1 | 1.30 | 1.70 | EASE_IN_AND_OUT |
| Glow · Office | OPACITY / SCALE_XY | 1 / 1 | 0 / 0.85 | 1.54 | 1.94 | EASE_IN_AND_OUT |
| Glow · Porch | OPACITY / SCALE_XY | 1 / 1 | 0 / 0.85 | 1.78 | 2.18 | EASE_IN_AND_OUT |
| Tile Porch light · after (off) | OPACITY | 0 | 1 | 1.78 | 2.18 | EASE_IN_AND_OUT |
| Headline "7 on · 52%" / "All off" | OPACITY | crossfade | | 2.18 | 2.42 | STD |
| Night veil | OPACITY | 0 | 0.92 | 2.40 | 4.00 | EASE_IN_AND_OUT |
| Moon + its glow | OPACITY | 0 | 1 | 3.60 | 5.20 | EASE_IN_AND_OUT |
| "Sleep well" | OPACITY | 0 | 1 | 3.80 | 4.12 | STD |
| "Sleep well" | TRANSLATION_Y | +12 | 0 | 3.80 | 4.12 | STD |
| Night veil, moon, text (reset) | OPACITY | to 0 | | 7.20 | 7.60 | EASE_IN |
| Glows and tiles (reset) | OPACITY | back | | 7.60 | 8.00 | EASE_IN_AND_OUT |

The veil uses the breathe duration, 1.6 s, as a one-shot: this is the night fade token (see 6 in the system).

**Why it is gorgeous.** Saying goodnight to the house is answered in kind: the phone darkens room by room with the
house and leaves one soft moon, which is the calmest confirmation an app can give.

---

## 11. Wake-up light

**Layout.** Back (20, 52); H1 "Wake-up light" (20, 128); caption "Bedside lamp · weekdays, 6:30 am" 14 at (20, 176).

- `Window` card (20, 212, 372, 340), radius 28: the bedroom's morning seen through a window. Horizon at card y 250;
  the sun a 44 disc that rises from card (186, 290) to (186, 170).
- Clock readout over the window: "6:00" 48 Light at card (24, 24), and the lamp's level "1%" 14 Regular `#D1D1D1`
  under it at card (24, 80).
- `Scrub` track (20, 572, 372, 56), radius 28, Caseta `#2B2B2B`; fill as the house bar; knob 40 white, 8 in on every
  side. Labels "6:00" at (20, 640) and "6:30" right aligned at 392, 12 Regular `#9E9E9E`. The knob is a grip; a
  sideways drag scrubs, an up or down swipe scrolls.
- Rows group (20, 676): Days, Lamp, How long.

**Lighting.** The screen itself is the preview: three full frame layers over the background and under the content,
each 412 x 915, `SCREEN`.

- `Dawn · first light`: radial centred (206, 1000), 900 wide, `#FF8A1F` at 0.22 to 0.
- `Dawn · sunrise`: radial centred (206, 900), 1300 wide, `#FFB46B` at 0.22 at 0%, `#D98A4E` at 0.08 at 50%, 0 at
  100%.
- `Dawn · morning`: linear top to bottom, `#FFD9A8` at 0 at 0%, `#FFD9A8` at 0.10 at 100%.
- The window card: sky linear top to bottom from `#171411` to `#3A2A20` at rest; its own `Window · morning` copy
  from `#3A3026` to `#FFD9A8` at 0.55; the sun fills with the lamp's white at that minute (`#FF8A1F` at 6:00,
  `#FFB46B` at 6:15, `#FFD9A8` at 6:30) and carries a glow of D 140.
- The track's fill is the lamp's own ramp instead of copper: `#FF8A1F` at 0% to `#FFB46B` at 50% to `#FFD9A8` at
  100%.

**Animation · scrubbing the half hour** (8.0 s loop).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Touch on knob | OPACITY | 0 | 1 | 0.90 | 1.02 | STD |
| Knob | TRANSLATION_X | 0 | +316 | 1.00 | 5.00 | LINEAR |
| Track fill | WIDTH | 56 | 372 | 1.00 | 5.00 | LINEAR |
| Dawn · first light | OPACITY | 0 | 1 | 1.00 | 2.40 | LINEAR |
| Dawn · sunrise | OPACITY | 0 | 1 | 2.20 | 3.80 | LINEAR |
| Dawn · morning | OPACITY | 0 | 1 | 3.60 | 5.00 | LINEAR |
| Window · morning | OPACITY | 0 | 1 | 1.00 | 5.00 | LINEAR |
| Sun + glow | TRANSLATION_Y | 0 | -120 | 1.00 | 5.00 | LINEAR |
| Sun | FILL_COLOR | #FF8A1F | #FFD9A8 | 1.00 | 5.00 | LINEAR |
| Clock 6:00 / 6:10 / 6:20 / 6:30 | OPACITY | one at a time | | 1.00, 2.33, 3.67, 5.00 | | HOLD |
| Level 1% / 20% / 60% / 100% | OPACITY | one at a time | | 1.00, 2.33, 3.67, 5.00 | | HOLD |
| All of the above (reset) | the same path back | | | 6.20 | 7.80 | LINEAR |

**Why it is gorgeous.** You do not read what the wake-up light will do, you watch your phone become the morning it
will make, and the scrubber feels like pulling the sun up.

---

## 12. Welcome lights · coming up

**Layout.** Home, scrolled so the arrival card sits at (20, 404). The card replaces the v6 coming-up row when the
next thing is a light coming on.

- `Arrival` card 372 x 128, radius 28, `#262626`, 1 px `#3C3C3C`.
- Countdown ring 72 at card (20, 28): track 3 px white 8%, progress 3 px, round caps, starting at twelve. Inside it
  the porch lantern art 32, `#D1D1D1`.
- Title "Porch comes on at dusk" 16 Medium at card (108, 32); caption "In 18 min · 7:12 pm" 14 Regular `#D1D1D1` at
  card (108, 56); text link "Skip tonight" 14 at card (108, 86).
- `Dusk` strip on the right of the card: the card's right 140, card x 232 to 372, full height.

**Lighting.**

- `Dusk`: linear 0° from `#262626` at 0 (card x 232) to `#3A2A20` at 1 (the card's edge), clipped by the card; and
  a sinking sun: ellipse 80 at card (330, 118), half below the card's bottom edge, radial `#FFB46B` at 0.28 to 0,
  layer blur 12.
- Progress arc: the copper arc gradient (`#F3D9C3` to `#E6A06A` to `#D98A4E`), because it counts down to a light.
  Before the last ten minutes it is `#D1D1D1`, and it crosses to copper for the last ten: the light is close.
- When the porch comes on: the lantern art goes white and takes `GLOW` at the ring's centre, tile scale (D 96),
  3000K, 100%.

**Animation · the last minutes to dusk** (6.0 s loop). Compressed: the ring covers the last 18 minutes.

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Ring progress (white) | PATH_TRIM_END | 0.70 | 0.83 | 0.00 | 1.60 | LINEAR |
| Ring progress (copper) | OPACITY | 0 | 1 | 1.60 | 1.84 | STD |
| Ring progress (copper) | PATH_TRIM_END | 0.83 | 1 | 1.60 | 3.60 | LINEAR |
| Dusk · sun | TRANSLATION_Y | 0 | +24 | 0.00 | 3.60 | LINEAR |
| Dusk · sun | OPACITY | 1 | 0.35 | 0.00 | 3.60 | LINEAR |
| Caption 18 / 12 / 6 / 1 min | OPACITY | one at a time | | 0.00, 1.20, 2.40, 3.40 | | HOLD |
| Lantern art · lit | OPACITY | 0 | 1 | 3.60 | 4.00 | EASE_IN_AND_OUT |
| Glow · Lantern | OPACITY | 0 | 1 | 3.60 | 4.00 | EASE_IN_AND_OUT |
| Glow · Lantern | SCALE_XY | 0.85 | 1 | 3.60 | 4.00 | EASE_IN_AND_OUT |
| Caption "In 1 min" / "On now · 7:12 pm" | OPACITY | crossfade | | 3.60 | 3.84 | STD |
| Ring (both) | OPACITY | 1 | 0 | 3.84 | 4.04 | EASE_IN |
| All (reset) | back to start | | | 5.60 | 6.00 | EASE_IN_AND_OUT |

**Why it is gorgeous.** The card is a small sunset with a porch light waiting in it: the countdown and the dusk are
the same motion, so you feel the moment coming instead of reading a time.

---

## 13. A remote, pressed

**Layout.** Remote page as built (07, 12733:237): back (20, 52); dots (336, 52); H1 "Kitchen Pico" (20, 128);
caption (20, 176); hint pill (20, 210, 286, 34); remote card (20, 256, 372, 328), radius 28, with the drawn Pico
146 x 300 at (40, 272), the top key 107 x 78 at (59, 280), leader dots at x 178, labels at x 228.

- New: `Lights it moves` strip (20, 600, 372, 88), radius 20, Caseta `#2B2B2B`. Overline "KITCHEN" 12 Medium at
  strip (16, 14); three light chips, each a 40 circle with the light's glyph and its name 14 Regular to its right,
  at strip x 16, 136, 256, y 36.
- The "TOP BUTTON" section moves down to y 708.

**Lighting.**

- The signal is drawn in two colours on purpose: Lutron blue while it is the remote's (a remote is Lutron's own
  thing), copper once it is light. `Signal` is an 8 disc `#52AEFF` with a 24 radial `#52AEFF` at 0.35 to 0.
- `Key · lit`: over the pressed key, an inner glow: the key's own shape filled radial `#52AEFF` at 0.18 at the
  centre to 0, plus the existing blue outline.
- `Leader · lit`: a copy of the key's leader line, 1.5 px `#52AEFF`, trimmed from 0 to 1.
- Each light chip on: the circle fills with the tile gradient (`#E6A06A`, `#D98A4E` 50%, `#B86C35`), glyph white,
  and `GLOW` at the circle, dot scale (D 40), the lamp's tone, at the level the press sets. Off: `#3C3C3C` circle,
  glyph `#D1D1D1`.

**Animation · the top key pressed** (4.0 s loop).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Top key | TAP at 0.40 | | | 0.40 | 1.00 | QUICK |
| Key · lit | OPACITY | 0 | 1 | 0.40 | 0.64 | STD |
| Leader · lit | PATH_TRIM_END | 0 | 1 | 0.52 | 0.76 | STD |
| Signal | OPACITY | 0 | 1 | 0.52 | 0.60 | STD |
| Signal | TRANSLATION_X | 0 | +50 | 0.52 | 0.76 | STD |
| Signal | OPACITY | 1 | 0 | 0.76 | 0.96 | EASE_IN |
| Label "Turn on · Kitchen" | OPACITY 0.7 to 1 and back | | | 0.76 / 1.60 | 1.00 / 1.84 | STD |
| Chip 1 · on + glow | OPACITY | 0 | 1 | 0.80 | 1.20 | EASE_IN_AND_OUT |
| Chip 2 · on + glow | OPACITY | 0 | 1 | 0.84 | 1.24 | EASE_IN_AND_OUT |
| Chip 3 · on + glow | OPACITY | 0 | 1 | 0.88 | 1.28 | EASE_IN_AND_OUT |
| Glows 1 to 3 | SCALE_XY | 0.85 | 1 | 0.80 to 0.88 | +0.40 | EASE_IN_AND_OUT |
| Key · lit, Leader · lit | OPACITY | 1 | 0 | 2.40 | 2.60 | EASE_IN |
| Chips 1 to 3 (reset) | OPACITY | 1 | 0 | 3.40 | 3.80 | EASE_IN_AND_OUT |

The chips are 0.04 apart, the stagger: a real press lights them together, the stagger only lets the eye follow the
signal along the row.

**Why it is gorgeous.** It draws the invisible thing that just happened, a press travelling from plastic to light,
and the change of colour from Lutron blue to copper tells you where the remote ends and the light begins.

---

## 14. Activity as a light log

**Layout.** Back (20, 52); H1 "Activity" (20, 128); filter chips 40 tall at y 188 (All, Buttons, Routines, Changes).

- Overline "TODAY IN LIGHT" at (20, 252).
- Ribbons, one per room, 56 apart from y 276: room name 12 Medium `#D1D1D1` at (20, y), strip 372 x 24 at
  (20, y + 18), radius 12, base `#2B2B2B`. Five rooms: y 276, 332, 388, 444, 500.
- Time axis labels 12 Regular `#6E6E6E` at y 560: "6 am", "noon", "6 pm" at their x (12 am at 20, now at the
  right edge), "now" right aligned.
- A now line: 1 px white 50%, from y 290 to y 550, at the right end.
- The list as built from y 600.

**Lighting.**

- A strip is a heat strip: each lit period is a rect across its time span, full strip height, filled with the
  light's tone at alpha 0.15 + 0.75 x level (a room at 100% for an hour is a bright band, a 10% night light a faint
  one). Several lamps in a room at once: the brightest wins, the others add at 0.3 in `SCREEN`.
- Colour lamps in their body colour at that alpha x 0.8.
- Each lit rect has a drop shadow 0, 0, blur 10, its tone at 0.35 x level: the ribbons glow where they were bright.
- Button presses and routines are 2 px ticks on the strip, white 40%, so cause sits on top of light.
- A tapped period: tooltip 20 radius `#3C3C3C`, 14 Regular, e.g. "7:48 pm · Relax · 62%", 8 above the strip;
  every other period drops to 0.5.

**Animation · the day drawing in, one period read** (6.0 s loop).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Ribbon 1 · lit mask | WIDTH | 0 | 372 | 0.20 | 1.20 | STD |
| Ribbon 2 · lit mask | WIDTH | 0 | 372 | 0.24 | 1.24 | STD |
| Ribbon 3 · lit mask | WIDTH | 0 | 372 | 0.28 | 1.28 | STD |
| Ribbon 4 · lit mask | WIDTH | 0 | 372 | 0.32 | 1.32 | STD |
| Ribbon 5 · lit mask | WIDTH | 0 | 372 | 0.36 | 1.36 | STD |
| Now line | OPACITY | 0 | 1 | 1.20 | 1.52 | STD |
| Living room · 7:48 pm period | TAP at 2.40 | | | 2.40 | 3.00 | QUICK |
| All other periods | OPACITY | 1 | 0.5 | 2.40 | 2.64 | STD |
| Tooltip | OPACITY + TRANSLATION_Y | 0, +12 | 1, 0 | 2.40 | 2.72 | STD |
| Tooltip | OPACITY | 1 | 0 | 4.40 | 4.60 | EASE_IN |
| All other periods | OPACITY | 0.5 | 1 | 4.40 | 4.64 | STD |
| Ribbons (reset) | OPACITY | 1 | 0 | 5.40 | 5.60 | EASE_IN |
| Masks (reset) | WIDTH | 372 | 0 | 5.60 | | HOLD |

The ribbons draw over the scene's 1.0 s on the standard curve, 0.04 apart.

**Why it is gorgeous.** The log stops being a list of sentences and becomes a picture of the day's light, where the
evening glows, the night is a thin ember, and a single glance says when the house was alive.

---

## 15. Today in light

**Layout.** A card on Activity, above the ribbons (it moves them down by 252), and in a compact form as Home's one
suggestion after the rooms.

- Full: `Today in light` card (20, 188, 372, 236), radius 28, `#262626`.
  - Overline "TODAY IN LIGHT" at card (20, 22).
  - "6 h 20 min" 40 Light at card (20, 42); "lit, across the house" 14 Regular `#D1D1D1` at card (20, 90).
  - `Day curve` area chart 332 x 64 at card (20, 118): the house's total light over the day.
  - Two facts, 14 Regular, at card y 196: "Lowest tonight · 12%" at x 20; "Most used · Floor lamp" at x 196, each
    after a 16 glyph.
- Compact (Home): 372 x 112 at x 20, the headline and the curve only, curve 180 x 48 at card (172, 32).

**Lighting.**

- Curve area: linear top to bottom, `#FFC78A` at 0.45 to 0. Top line 2 px `#FFD9A8`, and a copy with layer blur 8 at
  0.5: the glow. Over the night hours the line crosses to `#FFB46B`, because the house was warmer then.
- The lowest point: an 8 disc `#FFB46B` with `GLOW` of D 36 at 12%, where the curve bottoms out in the evening.
- The most used lamp's glyph sits in a 32 circle with the tile gradient and a tile-scale glow at its usual level.
- Card corner light: `GLOW` at card (340, 0), D 220, 2700K, at the day's average level (a 30% day is a small,
  quiet glow).

**Animation · the day's light drawn in** (5.0 s loop).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Card | OPACITY + TRANSLATION_Y | 0, +12 | 1, 0 | 0.00 | 0.32 | STD |
| Curve area · mask | WIDTH | 0 | 332 | 0.30 | 1.30 | STD |
| Curve top line | PATH_TRIM_END | 0 | 1 | 0.30 | 1.30 | STD |
| Curve glow | PATH_TRIM_END | 0 | 1 | 0.30 | 1.30 | STD |
| Headline 1 h / 3 h / 5 h / 6 h 20 min | OPACITY | one at a time | | 0.30, 0.55, 0.80, 1.05 | | HOLD |
| Lowest point + glow | OPACITY | 0 | 1 | 1.10 | 1.42 | STD |
| Lowest point + glow | SCALE_XY | 0.6 | 1 | 1.10 | 1.42 | STD |
| Facts row | OPACITY + TRANSLATION_Y | 0, +12 | 1, 0 | 1.30 | 1.62 | STD |
| Card corner glow | OPACITY | 0 | 1 | 0.30 | 0.70 | EASE_IN_AND_OUT |
| Card (reset) | OPACITY | 1 | 0 | 4.60 | 4.80 | EASE_IN |

**Why it is gorgeous.** Numbers about light are shown as light: the day is a glowing ridge whose shape you remember
the next evening, and the insight arrives as calmly as a card sliding into place.

---

## 16. Onboarding

**Layout.** Three pages, the same frame.

- `House` drawing 280 x 240 at (66, 150): roof and walls as 2 px line art `#D1D1D1` at 60%; six windows 36 x 44 in
  two rows (upper row at house (52, 84), (122, 84), (192, 84); lower row at (52, 152), (122, 152), (192, 152)); a
  door 36 x 60 at house (212, 180) is the porch, a 12 lantern beside it at (254, 196). Ground line at house y 240,
  1 px white 10%, 360 wide.
- Title 32 Light at (20, 448); body 16 Regular `#D1D1D1` at (20, 498), width 372.
- Page dots at y 760, centred: 8 discs 8 apart, the current one 24 x 8, copper.
- Light button (`#F8F8F8`, text `#262626`) 372 x 48 at (20, 796), "Continue"; a text link under it at y 860.

**Lighting.**

- Window off: fill `#1A1816`, 1 px `#3C3C3C`.
- Window lit: fill linear top to bottom `#FFD9A8` at 0.85 to `#D98A4E` at 0.70; behind it a glow ellipse 120 x 100,
  radial `#FFC78A` at 0.18 to 0, `SCREEN`; below the lower row, spill on the ground: ellipse 80 x 14 at the
  window's x on the ground line, `#FFB46B` at 0.12, layer blur 6.
- Page 1 (the app): one window lit, living room, lower left. Page 2 (rooms): three windows. Page 3 (the house,
  routines): all six and the porch lantern, `GLOW` at the lantern, tile scale (D 72), 3000K, 100%.
- Behind the whole house, one soft sum of its light: ellipse 460 x 300 at (206, 300), radial `#D98A4E` at 0.04 per
  lit window to 0. The house seems to warm the dark around it as it fills.

**Animation · three pages, the house filling** (8.0 s loop). Page content pushes (0.3 s, ±24); the house stays put
and only its windows change.

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Window 4 (lower left) · lit + glow | OPACITY | 0 | 1 | 0.40 | 0.80 | EASE_IN_AND_OUT |
| House sum glow | OPACITY | 0 | 0.25 | 0.40 | 0.80 | EASE_IN_AND_OUT |
| Continue | TAP at 2.20 | | | 2.20 | 2.80 | QUICK |
| Page 1 text | TRANSLATION_X + OPACITY | 0, 1 | -24, 0 | 2.32 | 2.62 | STD |
| Page 2 text | TRANSLATION_X + OPACITY | +24, 0 | 0, 1 | 2.32 | 2.62 | STD |
| Page dot active | TRANSLATION_X | 0 | +16 | 2.32 | 2.56 | STD |
| Window 5 · lit + glow | OPACITY | 0 | 1 | 2.60 | 3.00 | EASE_IN_AND_OUT |
| Window 1 · lit + glow | OPACITY | 0 | 1 | 2.76 | 3.16 | EASE_IN_AND_OUT |
| House sum glow | OPACITY | 0.25 | 0.5 | 2.60 | 3.16 | EASE_IN_AND_OUT |
| Continue | TAP at 4.80 | | | 4.80 | 5.40 | QUICK |
| Page 2 / Page 3 text | same push as above | | | 4.92 | 5.22 | STD |
| Page dot active | TRANSLATION_X | +16 | +32 | 4.92 | 5.16 | STD |
| Windows 2, 3, 6 · lit + glow | OPACITY | 0 | 1 | 5.20, 5.36, 5.52 | +0.40 | EASE_IN_AND_OUT |
| Lantern + its glow | OPACITY | 0 | 1 | 5.68 | 6.08 | EASE_IN_AND_OUT |
| House sum glow | OPACITY | 0.5 | 1 | 5.20 | 6.08 | EASE_IN_AND_OUT |
| All windows, lantern (reset) | OPACITY | 1 | 0 | 7.40 | 7.80 | EASE_IN_AND_OUT |
| Page 3 to page 1, dot (reset) | push back | | | 7.60 | 7.90 | STD |

Windows light 0.16 s apart, four staggers: slower than a list, because it is the house doing it, not the interface.

**Why it is gorgeous.** Onboarding becomes a small story, a dark house filling with light as you learn it, and the
final page looks like coming home at night.

---

## 17. A device added

**Layout.** Rooms (as screen 2), after "Done" on Add a device (20, 12744:112136) returns here. A `Newcomer` layer:
the device's art 48 in a 56 circle (Caseta `#2B2B2B`, 1 px white 14%), starting at (178, 820), where the M7
result card's icon was.

- Living room card at (20, 232, 372, 180). The newcomer lands at its status line, card (16, 134), then becomes the
  "+1" in "3 of 6 on".
- Undo toast (20, 732, 372, 56) after the landing: "Table lamp is in Living room", "Undo".

**Lighting.**

- The newcomer carries a small light: `GLOW` at its centre, tile scale (D 72), 3000K, 60%.
- `Trail`: three copies of that glow following the newcomer, each 0.04 behind the last, at opacity 0.5, 0.3, 0.15
  and scale 0.9, 0.8, 0.7. On a dark screen that reads as a comet of light.
- The room card glows once: a rim light, 1.5 px stroke `#FFD9A8` inside the card's edge, and an outer drop shadow
  0, 0, blur 32, `#D98A4E` at 0.35. Both from 0 to their value and back to 0. The room's own light (its pool, from
  screen 2) is not touched: the welcome is separate from the room's state.

**Animation · landing in the room** (5.0 s loop). The flight uses a different easing on each axis, so a straight
translate draws a curve: X eases out and Y eases in and out, so it rises first and drifts right into place.

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Newcomer + glow | OPACITY | 0 | 1 | 0.20 | 0.52 | STD |
| Newcomer + glow | TRANSLATION_Y | 0 | -470 | 0.50 | 1.10 | EASE_IN_AND_OUT |
| Newcomer + glow | TRANSLATION_X | 0 | -142 | 0.50 | 1.10 | EASE_OUT |
| Newcomer + glow | SCALE_XY | 1 | 0.5 | 0.50 | 1.10 | EASE_IN_AND_OUT |
| Trail 1 / 2 / 3 | same three rows | | | 0.54 / 0.58 / 0.62 | 1.14 / 1.18 / 1.22 | as above |
| Trail 1 to 3 | OPACITY | as set | 0 | 1.00 | 1.30 | EASE_IN |
| Newcomer | OPACITY | 1 | 0 | 1.10 | 1.30 | EASE_IN |
| Card rim + shadow | OPACITY | 0 | 1 | 1.10 | 1.50 | EASE_IN_AND_OUT |
| Card shadow | EFFECT_RADIUS | 16 | 32 | 1.10 | 1.50 | EASE_IN_AND_OUT |
| Card rim + shadow | OPACITY | 1 | 0 | 1.50 | 2.50 | EASE_IN_AND_OUT |
| Status "3 of 5 on" / "3 of 6 on" | OPACITY | crossfade | | 1.10 | 1.34 | STD |
| Undo toast | OPACITY + TRANSLATION_Y | 0, +12 | 1, 0 | 1.40 | 1.72 | STD |
| Undo toast · bar | WIDTH | 332 | 0 | 1.72 | 4.50 | LINEAR |
| Undo toast | OPACITY | 1 | 0 | 4.50 | 4.70 | EASE_IN |
| Status (reset) | crossfade back | | | 4.70 | 4.94 | STD |

The flight is 0.6 s, the land token: a 470 px journey on the push's 0.3 s reads as a throw.

**Why it is gorgeous.** The new device is shown arriving where it now lives, carrying its own little light, and the
room acknowledges it with one warm glance.

---

## 18. Offline, calmly

**Layout.** Home, ten seconds after the connection drops (M5): the greeting crossfades to "Offline"; the page dims to
80% and moves down 100; the `Offline` card (20, 164, 372, 88), radius 20, Caseta `#2B2B2B`, comes down 12 into
the space: a 40 circle with the wifi glyph at card (16, 24); "Can't reach the house" 16 Medium at card (68, 20);
"Trying again · the remotes still work" 14 Regular `#D1D1D1` at card (68, 44).

- Beside "Offline", an 8 disc `#CC0000` at 70%, still: the one real fault colour, small and not blinking.
- Tiles keep their last known look under a `#121212` at 35% veil, the value line reads "Last seen 9:41 pm" in
  `#6E6E6E`.

**Lighting.**

- The house light field of screen 1 collapses into one ember: `GLOW(206, 110, 220, ember, 30%)` where ember is body
  `#B86C35` at 0.12, core `#D98A4E` at 0.18 (D 70), wash `#B86C35` at 0.06 with layer blur 40.
- Lit tiles keep their colour but their glows drop to half opacity; they are memories, not light.
- The reconnecting dot (8, white) breathes as built.

**Animation · the ember** (4.8 s loop, the ember token: three breaths of the reconnecting dot).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Glow · Ember | OPACITY | 0.6 | 1 | 0.00 | 2.40 | EASE_IN_AND_OUT |
| Glow · Ember | OPACITY | 1 | 0.6 | 2.40 | 4.80 | EASE_IN_AND_OUT |
| Glow · Ember | SCALE_XY | 0.96 | 1 | 0.00 | 2.40 | EASE_IN_AND_OUT |
| Glow · Ember | SCALE_XY | 1 | 0.96 | 2.40 | 4.80 | EASE_IN_AND_OUT |
| Ember · wash | EFFECT_RADIUS | 40 | 48 | 0.00 | 2.40 | EASE_IN_AND_OUT |
| Ember · wash | EFFECT_RADIUS | 48 | 40 | 2.40 | 4.80 | EASE_IN_AND_OUT |
| Reconnecting dot | OPACITY | 0.3 | 0.8 | 0.00 | 0.80 | EASE_IN_AND_OUT |
| Reconnecting dot | OPACITY | 0.8 | 0.3 | 0.80 | 1.60 | EASE_IN_AND_OUT |
| Reconnecting dot | same pair | | | 1.60, 3.20 | 3.20, 4.80 | EASE_IN_AND_OUT |

**Why it is gorgeous.** Losing the connection is drawn as a fire banked for the night, not a warning light, so the
screen stays calm and honest at once.

---

## 19. Nightstand mode

**Layout.** Opened after midnight from Home, or by laying the phone down on charge. No tab bar, no header row
except one exit circle 56 at (336, 52), fill `#1A1411`, glyph `#7D6A5A`.

- Background `#0A0908`.
- Time "2:14" 88 Light, `#7D6A5A`, centred at y 120.
- `Night light` button: a 240 circle at (86, 260), fill `#1A1411`, 1 px `#3A2A20`, moon glyph 40 `#BFA38A` at
  its centre; label "Night light" 20 Medium `#BFA38A` centred at y 526; caption "Bedside lamp at 1%" 14 `#7D6A5A`
  at y 556.
- Two big pills, 372 x 88, radius 44, fill `#1A1411`, 1 px `#2A2019`: "Everything off" at (20, 640) and "Hallway,
  just enough to walk" at (20, 744). Labels 20 Medium `#BFA38A` centred.
- Everything is at least 88 tall: a sleepy thumb cannot miss.

**Lighting.** The night palette (see 7 in the system): nothing white, nothing blue.

- Night light on: the circle's fill gets an inner radial, `#FF9A3C` at 0.12 at the centre to 0 at the edge, and
  `GLOW(206, 380, 360, 1900K, 1%)` in the night palette: body `#FF8A1F` at 0.10, wash `#B86C35` at 0.06 with layer
  blur 40, no core (at 1% there is no hot centre).
- The label turns `#E0B48A` (the warmest ink allowed) with "On" appended.
- Off is the circle as drawn, with no glow at all.

**Animation · the night light, on and off** (6.0 s loop).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| Night light button | TAP at 0.60 | | | 0.60 | 1.20 | QUICK |
| Button · inner light | OPACITY | 0 | 1 | 0.72 | 2.32 | EASE_IN_AND_OUT |
| Glow · Night light | OPACITY | 0 | 1 | 0.72 | 2.32 | EASE_IN_AND_OUT |
| Glow · Night light | SCALE_XY | 0.85 | 1 | 0.72 | 2.32 | EASE_IN_AND_OUT |
| Label "Night light" / "Night light · On" | OPACITY | crossfade | | 0.72 | 0.96 | STD |
| Night light button | TAP at 4.00 | | | 4.00 | 4.60 | QUICK |
| Button · inner light + glow | OPACITY | 1 | 0 | 4.12 | 4.52 | EASE_IN_AND_OUT |
| Glow · Night light | SCALE_XY | 1 | 0.85 | 4.12 | 4.52 | EASE_IN_AND_OUT |
| Label | crossfade back | | | 4.12 | 4.36 | STD |

On takes the night fade (1.6 s), because eyes that were asleep need the light to arrive slowly; off takes the
dimmer's 0.4, because turning off is always easy.

**Why it is gorgeous.** At 2 am the phone becomes a warm dark object with one ember of a button, and pressing it
lights a glow on the screen that matches the glow now on the nightstand.

---

## 20. Beyond the app

**Layout.** One frame showing the Android home screen widgets (top) and the lock screen controls (bottom), over a
`#0E0D0C` wallpaper. Widgets are set in Lutron Sans Screen; the system clock stays in the system face.

- `Room widget` 2 x 2: 184 x 184 at (20, 96), radius 28, `#262626` at 92% with a background blur of 24. "Living
  room" 16 Medium at (16, 16); "3 on · 62%" 14 at (16, 40); power circle 56 at (112, 112), copper when on.
- `House widget` 4 x 1: 372 x 96 at (20, 296). Headline "7 on · 52%" 20 Medium at (20, 20); a mini house bar
  200 x 8 at (20, 60), radius 4, copper arc gradient to the level; "All off" solid light pill 120 x 48 at (232, 24).
  With everything off it reads "All off" and the pill becomes the outlined "Lights back on", held.
- `Scenes widget` 4 x 2: 372 x 184 at (20, 408). Three scene tiles 108 x 144 at (16, 20), (132, 20), (248, 20),
  radius 20, each with its colour dots row and name.
- Lock screen, from y 616: Quick Settings tiles 176 x 72, radius 36: "House · 7 on" at (20, 640) (copper fill when
  anything is on, `#2B2B2B` when not), "Goodnight house" at (216, 640) (a hold, the ring drawn in the tile).
- Lock screen shortcuts, 64 circles at (40, 816) and (308, 816): "All off" and "Night light". The system already
  asks a long press for these, which keeps turning a light on out of a pocket's reach.

**Lighting.** The same recipe at widget scale (D 80 to 200), clipped by each widget.

- Room widget: `GLOW` at widget (160, 20), 2700K, the room's level (62%: D 186, body `#FFC78A` at 0.166).
- House widget: a glow along the top edge: ellipse 420 x 120 at widget (240, 0), radial `#D98A4E` at 0.14 x m to 0.
- Scene tiles: each tile's glow is the scene's dominant tone at the scene's level, top right, D 96; a colour scene
  mixes its first two colours as two glows 0.6 of the size, side by side.
- Quick Settings tile on: tile gradient (`#E6A06A`, `#D98A4E`, `#B86C35`), glyph `#B86C35` in a white 40 circle.

**Animation · all off from the widget, then back on with a hold** (6.0 s loop).

| Layer | Property | From | To | Start | End | Easing |
|---|---|---|---|---|---|---|
| House widget · All off pill | TAP at 0.50 | | | 0.50 | 1.10 | QUICK |
| All widget glows | OPACITY / SCALE_XY | 1 / 1 | 0 / 0.85 | 0.62 | 1.02 | EASE_IN_AND_OUT |
| Room widget power · copper | OPACITY | 1 | 0 | 0.62 | 1.02 | EASE_IN_AND_OUT |
| Mini bar fill | WIDTH | 104 | 0 | 0.62 | 1.02 | EASE_IN_AND_OUT |
| Headline "7 on · 52%" / "All off" | OPACITY | crossfade | | 0.62 | 0.86 | STD |
| Pill "All off" / "Lights back on" | OPACITY | crossfade | | 0.62 | 0.86 | STD |
| QS tile · copper | OPACITY | 1 | 0 | 0.62 | 0.86 | STD |
| Pill "Lights back on" · hold fill | WIDTH | 0 | 120 | 3.00 | 3.60 | LINEAR |
| Everything above | reverse | | | 3.60 | 4.00 | EASE_IN_AND_OUT |
| Hold fill | OPACITY | 1 | 0 | 3.60 | 3.84 | STD |

The hold is the house card's 0.6 s, filled from the left in copper as built.

**Why it is gorgeous.** The light follows you out of the app: the same pools of warmth sit on the home screen and
the lock screen, so a glance at the phone shows the house before you open anything.

---

## A lighting system

The rules the twenty share, so they read as one app.

### 1. The palette for light on dark

Light is drawn only in these colours. Nothing else on the dark glows.

**Whites, the lamp ramp.** Five stops between the file's warm end and daylight; everything between is a straight
mix of its neighbours, in mireds.

| Kelvin | Stop | Core (hot centre) | Body | Wash (spill) |
|---|---|---|---|---|
| 1900 | from the white bar | `#FFB46B` | `#FF8A1F` | `#B86C35` |
| 2200 | `#FFB46B` | `#FFC78A` | `#FFB46B` | `#B86C35` |
| 2700 | `#FFC78A` | `#FFD9A8` | `#FFC78A` | `#D98A4E` |
| 3000 | `#FFD9A8` | `#FAE5C9` | `#FFD9A8` | `#D98A4E` |
| 4000 | `#FAE5C9` | `#F4F1EA` | `#FAE5C9` | `#E6A06A` |
| 5000 and up | `#F4F1EA` | `#F4F1EA` | `#F4F1EA` | `#E6A06A` at half alpha |

The core is one stop cooler than the body, because the centre of a real light is always whiter than its edge. The
wash is always from the copper family: that is what makes a daylight lamp still look like Copper Night.

**Colour lamps.** Core, body and wash come from the tint set `web/ui/tint.js` already computes (the file's blue
tile turned round the hue wheel in OKLCh): core is the tint's glow stop, body is the lamp's own colour, wash is the
tint's deep stop. Blue: `#CFE0FF`, `#4C8DFF`, `#2A3F82`. A colour lamp's glow is capped lower than a white's (table
below), because saturated light on black reads louder than white at the same alpha: that is the "never neon" rule
made numeric.

**Copper** (`#D98A4E`, hi `#E6A06A`, lo `#B86C35`, pale `#F3D9C3`) remains the interface's word for on: filled
controls, the current scene chip, the arc. Light itself is drawn in the ramp; copper is its accent and its spill.

**Lutron blue** (`#006DCC`, `#52AEFF`) never glows as a light. It appears as light only as the remote's signal on
screen 13, before it turns into copper.

### 2. A glow is three layers

Every glow is a group of three ellipses sharing a centre, drawn bottom to top, each a radial gradient from the
stated alpha at the centre to 0 at the edge, each in blend `SCREEN` (so overlapping lights add, as real ones do).
The group itself is `PASS_THROUGH`.

| Layer | Diameter | Colour | Stops | Extra |
|---|---|---|---|---|
| wash | 1.6 D | wash tone | a at 0%, 0 at 100% | layer blur 32 (40 at night) |
| body | D | body tone | a at 0%, 0.45a at 45%, 0 at 100% | none |
| core | 0.32 D | core tone | a at 0%, 0 at 100% | only above 20% |

Base alphas at 100%: white core 0.50, body 0.22, wash 0.10; colour core 0.40, body 0.16, wash 0.10. No layer
anywhere goes above 0.55 (the tile glow as built is the ceiling). Three layers, never more: one is a flat disc, two
still has an edge, three is the least that reads as light.

Name them `Glow · {what} / wash`, `/ body`, `/ core`. Put glows under the content they belong to and clip them by
their card, except the Home field and the hero lamp, which bleed off the frame's top edge.

### 3. Size and strength by level

For a light at level L (0 to 1):

- **Diameter** D = Dmin + (Dmax - Dmin) x √L. The square root because the eye reads light by area and the first
  percent matters most: a lamp at 25% already looks half as big as full.
- **Strength**: every alpha above is multiplied by m = 0.35 + 0.65 x L. Even 1% is visible (m = 0.36): a light that
  is on is never drawn as off.
- **Core** only above 20%. A lamp turned very low has no hot centre, just a soft body.

| Context | Dmin | Dmax | 1% | 25% | 50% | 75% | 100% |
|---|---|---|---|---|---|---|---|
| Hero lamp (Light page) | 260 | 560 | 290 | 410 | 472 | 520 | 560 |
| Home pool | 160 | 360 | 180 | 260 | 301 | 333 | 360 |
| Room card | 140 | 320 | 158 | 230 | 267 | 296 | 320 |
| Widget | 80 | 200 | 92 | 140 | 165 | 184 | 200 |
| Orb (scene stage) | 56 | 140 | 64 | 98 | 115 | 129 | 140 |
| Tile | 48 | 96 | 53 | 72 | 82 | 90 | 96 |
| Dot, chip, bead | 20 | 40 | 22 | 30 | 34 | 37 | 40 |
| m (strength) | | | 0.36 | 0.51 | 0.68 | 0.84 | 1.00 |

A colour lamp in a room pool draws as its own pool at 0.6 D beside the room's white pool: colour is an accent in a
room, not its whole light.

### 4. Off, unreachable, offline

- **Off is the absence of light.** No glow layers at all, never a grey glow. Art at 20%, numbers `#9E9E9E`, tracks
  bare. A room photo goes grey and dark (screen 2's veil).
- **Unreachable** is off, dimmed to 60%, with "Not responding" in `#6E6E6E`.
- **Offline** (the whole house) collapses every glow into one ember (screen 18); tiles keep their last colours at
  half glow under a 35% veil.

### 5. How light moves

- A light's glow changes by **scale and opacity together**, always the pair: on is 0.85 to 1 and 0 to 1 on the
  dimmer (0.4 s `EASE_IN_AND_OUT`). A glow never moves position unless its source moves.
- **Colour never slides** when a person picks it: two glow layers crossfade. It slides only under a finger in a live
  drag (screens 3, 5) or in the app's own drift (screen 8).
- **Under a finger, light is locked to it**: `LINEAR` keyframes, numbers stepping on `HOLD` (M6).
- **What the app decides is slow**: scenes 1.0 s, drift 30 s, the house going to sleep one room each 0.24 s.
- **Breathing means one of three things, and only one breathes per screen**: living (the Home field, ambient 8.0
  s, at most 3% scale and 12% opacity), waiting (the reconnecting dot, breathe 1.6 s) and resting (the offline
  ember, 4.8 s).
- **Reduced motion**: loops stop at their midpoint, spatial moves become the standard crossfade, glows still change
  opacity on the dimmer.

### 6. The five proposed tokens

| Token | Value | Why the existing ones do not cover it |
|---|---|---|
| ambient | 8.0 s loop, `EASE_IN_AND_OUT` | Breathe (1.6 s) already means "waiting to reconnect"; a living house must move slower than attention or it reads as a signal. |
| wave | 0.06 s per 100 px of distance from the source | Stagger orders a list; a scene spreads through space. 60 ms per 100 px crosses the screen in about 0.35 s, inside the scene's 1.0 s. |
| land | 0.6 s, X `EASE_OUT` with Y `EASE_IN_AND_OUT` | Push (0.3 s) is for 24 px; a 470 px flight at that pace reads as a throw, at 0.6 s as a placing. |
| ember | 4.8 s loop, `EASE_IN_AND_OUT` | Three breaths of the reconnecting dot, so the two never beat against each other; slow enough to read as rest, not alarm. |
| night fade | 1.6 s one-shot, `EASE_IN_AND_OUT` | A light coming on at night, or the app going dark, must arrive slower than the dimmer for eyes adjusted to the dark. It reuses breathe's length so the app keeps one family of times. |

### 7. Night mode

From the start of the evening wind-down (or 10 pm without one) until the wake-up light or 6 am, the interface shifts
and the lights do not: a lamp's glow always shows the lamp's real colour.

| What | Day | Night | Nightstand (after midnight, screen 19) |
|---|---|---|---|
| Background | `#121212` | `#121212` | `#0A0908` |
| Text 1 | `#FFFFFF` | `#F1E7DC` | `#BFA38A` |
| Text 2 | `#D1D1D1` | `#C2B8AD` | `#7D6A5A` |
| White fills (active tab, knob, light button) | `#F8F8F8` | `#EDE3D8` | none: `#1A1411` fills, `#3A2A20` lines |
| Controls blue | `#006DCC` | `#0B5CA3` | not shown |
| Glow alpha | x 1 | x 0.7 | x 0.5, whites shifted one ramp stop warmer on screen |
| Glow size | x 1 | x 0.9 | x 1 (fewer, larger, softer) |
| Wash blur | 32 | 40 | 40 |
| App-decided motion | as tokens | x 1.5 | x 1.5; on uses the night fade |
| Person's actions | as tokens | as tokens | as tokens: a tap still lands now |

The crossing into night is itself a drift: every chrome colour slides over 30 s `LINEAR`, so nobody sees the moment
it happens, only that the phone has grown warmer by bedtime.
