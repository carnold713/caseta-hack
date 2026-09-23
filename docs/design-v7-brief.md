# Copper Night v7 · the brief

The owner asked for the next pass on the app: refine the screens, think further through UX, UI and motion, and
add flair and visual gorgeousness, above all around the concept of light. Not necessarily new screens; mostly the
existing ones taken further. Twenty screens' worth, each with an animation example.

This brief is the shared starting point for a UX designer and a UI designer working in parallel, and for the
people who then build the frames in Figma. Read it whole before starting.

## What exists

- The Figma file `jhFLTG342sNF9LyGll8LDf`, page **Pico App** (`12728:20`): the v6 frames 01 to 25, the foundations
  board `00 · Copper Night — foundations & map`, the icon set `00b`, the motion board `M · Motion principles`
  (`12761:76`) and the seven worked animations M1 to M7, and the section **Revisions · the whole-house card as
  built** (the Home card as it now works). Screens to know first: 02 Home (`12732:48971`), 03 Room
  (`12733:20`), 04 Light (`12731:22`), 05 Colour (`12732:48591`), 05b White (`12732:49220`), 06 Follow the day
  (`12733:48715`), 07 Remote (`12733:237`), 10 Routines (`12732:48782`), 13 Rooms (`12744:38`), 14 Scenes
  (`12744:111043`), 20 Add a device (`12744:112136`), 24 Activity (`12744:112331`).
- The built app (`web/ui/`), which follows the file. `docs/design-spec-v6.md` is the build spec: tokens, type,
  components, the motion tokens and what each M frame settled, and what the owner asked to change in use (read
  "On a real phone" and "The whole-house card, revisited").

## The language (keep it)

- Dark, warm, calm: background `#121212`, surfaces `#262626` / `#2B2B2B` / `#3C3C3C`, text `#FFFFFF` /
  `#D1D1D1` / `#9E9E9E`. Copper is light that is on: `#D98A4E`, hi `#E6A06A`, lo `#B86C35`. Lutron blue
  `#006DCC` / `#52AEFF` is for Lutron's own things (remotes, adding a device) and stays.
- Type: Lutron Sans Screen, Light / Regular / Medium only. H1 40 Light, hero 48, sheet titles 32, rows 16 Medium.
- Frames 412 x 915; 20 gutters; cards radius 28, groups 20; the tab bar floats 40 above the bottom, 372 x 72.
- Motion tokens: tap 0.12 s QUICK spring (scale 0.96), standard 0.24 s cubic (0.2, 0.8, 0.2, 1), enter 0.32 s
  (fade and rise 12), exit 0.2 s EASE_IN, stagger 0.04 s, sheet in 0.42 s GENTLE / out 0.28 s EASE_IN, push 0.3 s
  +-24 px, dimmer 0.4 s EASE_IN_AND_OUT, scene 1.0 s EASE_IN_AND_OUT, breathe 1.6 s loop, drift 30 s LINEAR.
- Product rules from the file: a lamp comes on already the colour it will be, brightness fades, colour never
  slides; user actions land now, what the app decides happens slowly; never flashy, no bounce except the sheet;
  respect the dark, calm mood.
- Owner's rules: never an em dash anywhere (copy, notes, layer names); the words "binding", "target" and
  "schedule" never appear in anything a person reads; there is no Save button (everything applies and offers
  Undo); nothing that turns lights ON should be one accidental tap away (the house card's All on is a hold);
  turning things off is always easy; sliders never steal a scroll.

## The twenty

A starting list. Deepen each; replace a weak one with a better one if you must, and say why.

1. **Home · the house, lit.** A living ambient field behind the header that is the house's actual light: each
   lit room contributes its warmth or colour, blended, breathing slowly; dark when everything is off.
2. **Rooms · light that pools.** Room cards whose glow is that room's real light (size from level, hue from
   the lamps); turning a room on blooms from its power button outward.
3. **A light · the lamp's own glow.** The hero lamp casts a halo or cone whose size and warmth track the level
   and colour, live under the finger on the dial.
4. **Colour · painting with light.** The sheet washes towards the picked colour; swatches as lit glass beads;
   the wheel's handle luminous.
5. **White · the time of day.** Warmth shown as a sky: candle to daylight as dusk to noon, the lamp's current
   white placed on it.
6. **A scene arriving.** The room relights in a sweep that starts from the chip that was tapped; tiles follow
   the wave; the count settles.
7. **Scene editor · a stage.** Each light as a glowing orb on the room; drag an orb up or down to set it.
8. **Follow the day.** A 24 hour sky dial with the sun's live place, today's curve glowing, and the paused
   state ("keeping a colour you picked") with its resume.
9. **Evening wind-down.** Sunset to night as one timeline: the glow band stepping down, the night hours as a
   moon, "tonight at 11 pm the house goes quiet".
10. **Goodnight house.** When the hold completes, the screen itself goes dark room by room as the house does,
    ending on a quiet "Sleep well".
11. **Wake-up light.** A sunrise preview you can scrub: the screen brightens and warms the way the bedroom will.
12. **Welcome lights / coming up.** An arrival card with a countdown ring to the porch coming on at dusk.
13. **A remote, pressed.** A real press sends light through the drawn Pico: the key lights, the leader line
    carries it, the lights it controls pulse on the room.
14. **Activity as a light log.** A day ribbon per room showing when it was lit and how bright, like a heat strip.
15. **Today in light.** A gentle insight card: hours lit, the evening's lowest level, the lamp used most.
16. **Onboarding.** A drawn house whose windows light up page by page.
17. **A device added.** The new device lands into its room with a trail of light; the room card glows once.
18. **Offline, calmly.** The house dims to an ember that breathes, not an alarm; everything still readable.
19. **Nightstand mode.** 2 am: the app at its dimmest and warmest, huge soft targets, one tap for a night light.
20. **Beyond the app.** Home screen widget and lock screen controls in the same language.

Also worth a frame if there is room: the sleep timer running as a candle burning down; the house brightness
number counting (as built); the tab switch slide (as built).

## What each role delivers

- **UX designer** → `docs/design-v7-ux.md`: for each of the twenty, the moment it serves (who, when, why), the
  flow and its states (empty, one, many, offline, night, error), the exact copy in the house voice, what a tap
  and a hold do, and what must never happen by accident. Keep it buildable on the existing data (the app knows
  every light's level, colour, room, timers, routines, the sun, the evening curve, the activity log).
- **UI designer** → `docs/design-v7-ui.md`: for each of the twenty, the layout on a 412 frame (positions and
  sizes worth stating), the lighting treatment (gradients, glows, blend, how warmth and colour are drawn), and
  one animation example as a keyframe script: which layers move, from what to what, over which token, with
  times. Reuse Copper Night tokens; invent a new one only with a reason.
- **Builders** (Figma): one frame per screen on the page **Copper Night · v7 concepts**, each with its
  animation as real keyframes (the figma-use-motion skill), a caption under it naming the screen and its
  animation, in the house voice.

## In the file

Page **Copper Night · v7 concepts** (`12813:48927`), four sections of five screens. Each main frame carries its
animation as keyframes (loops of 4 to 10 s); a second frame beside it, where there is one, is a still of another
state. The caption under every frame names what moves, on which token.

| # | Screen | Main frame | Still |
|---|---|---|---|
| 1 | Home · the house, lit | `12814:126` | 01b all off `12817:96` |
| 2 | Rooms · light that pools | `12814:49603` | |
| 3 | A light · the lamp's own glow | `12815:49080` | |
| 4 | Colour · painting with light | `12815:50658` | |
| 5 | White · the time of day | `12816:94` | |
| 6 | A scene arriving | `12814:48798` | |
| 7 | Scene editor · a stage | `12815:48891` | |
| 8 | Follow the day | `12815:51423` | |
| 9 | Evening wind-down | `12816:580` | |
| 10 | Goodnight house | `12817:49280` | |
| 11 | Wake-up light | `12814:49052` | `12814:49334` |
| 12 | Welcome lights, coming up | `12815:169` | `12815:49652` |
| 13 | A remote, pressed | `12815:50218` | `12815:50442` |
| 14 | Activity as a light log (with Today in light) | `12815:51909` | `12815:52130` |
| 15 | Sleep timer · a candle burning down | `12817:49023` | `12818:257` |
| 16 | Onboarding | `12814:49907` | |
| 17 | A device added | `12815:49995` | |
| 18 | Offline, calmly | `12815:50887` | |
| 19 | Nightstand mode | `12815:51683` | `12815:51718` |
| 20 | Beyond the app | `12816:49515` | 20b widget, if it ever goes native `12817:49222` |

Where the builders chose between the two docs: the UX doc's copy and behaviour everywhere; 15 is the sleep timer
candle and Today in light heads 14 (the UX doc's change); 18 has no red dot (offline stays calm); 20 is the icon's
shortcuts and a lock-screen notification, with the widget only as a labelled "if it ever goes native" still;
glow alphas were raised a little over the UI doc's so the light reads on screen, still under its 0.55 cap.
Invented placeholder values (the Relax levels in 6 and 7, the shelf lights in 7) are marked in their captions.

The as-built changes to the v6 screens are on the Pico App page, section "Revisions · the whole-house card as
built" (`12806:125`): the four card states, M8 hold to turn the house on, M9 the level counting with the finger,
and 06b Follow the day paused and resumed.
