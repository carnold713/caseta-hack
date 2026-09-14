# Pico Hack: visual design specification

Direction: the IKEA Home smart iOS app. Light, flat, print-like. This document replaces the current dark "glow" system in `web/styles.css` and is written so it can be implemented without judgment calls. Where a value is stated, use it exactly.

Reference screens studied (Mobbin, IKEA Home smart, iOS): Rooms home with colored room cards, scene chips row, "New scene" outlined card, Products tab, Entrance room list, light detail (orange circle, tick slider, color circles), "What should your products do?", "Choose the products you want in this scene" (Selected / Rooms / All products chips), "After work" scene overview with pink "To start your scene" and teal "To end your scene" blocks, "How should we start this scene?" option sheet, "Which lights should we include?" with the colored room accordion rows, Edit "Entrance" sheet with colored header, Choose a room colour, Settings sheet, Power-on settings, Change rooms, Let's add some rooms, Product information sheet.

---

## 1. Principles

- **White ground, color as blocks.** The page is white. Color appears only as large flat fills (room cards, the detail circle, guidance blocks) and one small orange dot for "on". Nothing else is tinted.
- **Everything else is black, white and grey.** Text, icons, buttons, borders and controls use only `#111111`, white and three greys. A selected thing turns black; an unselected thing is white with a hairline.
- **Print typography.** One humanist sans (Noto Sans), two weights that matter (400 and 700), left aligned, sentence case, generous line height. Titles are big and plain, never letter-spaced uppercase.
- **No light effects.** No gradients, glows, blurs, glass, inner shadows or radial backgrounds. Depth comes from a flat fill or a 1px line; only sheets and the toast float.
- **Friendly geometry.** Rounded corners (16px cards, full pills), round icon buttons, thin 1.5px line icons. Big tap targets, lots of white space, one thing per row.

---

## 2. Tokens

### Neutrals

| token | hex | use |
|---|---|---|
| `--bg` | `#FFFFFF` | page and sheet ground |
| `--bg-2` | `#F5F5F5` | grey chips, icon circles, inactive segments, bottom bar |
| `--card` | `#FFFFFF` | rows and cards |
| `--line` | `#DFDFDF` | card and row borders, outlined buttons |
| `--hairline` | `#EBEBEB` | separators inside lists |
| `--text` | `#111111` | primary text, icons, black buttons |
| `--text-2` | `#484848` | secondary text |
| `--text-3` | `#767676` | tertiary text, captions, inactive tab labels |
| `--disabled-bg` | `#E6E6E6` | disabled primary button |
| `--disabled-fg` | `#9A9A9A` | disabled text |

### Accents

| token | hex | use |
|---|---|---|
| `--orange` | `#F58A1F` | the "on" dot, live press on a Pico button |
| `--orange-circle` | `#F7A64F` | the big circle behind a light detail illustration (the remote detail uses the room color instead) |
| `--orange-tint` | `#FCE3C4` | fill behind an "on" percentage badge, slider tooltip area |
| `--black` | `#111111` | primary buttons, selected chips, toggle on, tab underline |
| `--green` | `#2E8B57` | connected dot only |
| `--red` | `#C8102E` | error toast background, disconnected dot only |

### Room palette (8 flat colors)

Rooms are assigned in this order by the sorted room list (wrap after 8). Text and icons on every fill are `#111111`; all eight were chosen so black stays readable (minimum contrast 5.5:1). The soft variant is used for guidance blocks, the "at night" panel, and the room accordion body.

| name | fill | soft |
|---|---|---|
| Mustard | `#E3A82B` | `#F7E6BE` |
| Steel | `#5C8CA8` | `#D3E1EA` |
| Sky | `#8FBDD6` | `#DCEBF3` |
| Meadow | `#4B9B5E` | `#C9E3CF` |
| Lemon | `#FFD400` | `#FFF2A8` |
| Blush | `#F2B8BC` | `#FADFE1` |
| Clay | `#C99B6C` | `#EAD8C3` |
| Sand | `#D9CDB5` | `#EFE9DD` |

### Typography

Font: **Noto Sans** from Google Fonts, weights 400, 600, 700. Stack: `"Noto Sans", -apple-system, "Segoe UI", Roboto, sans-serif`. Body color `--text`. `-webkit-font-smoothing: antialiased`.

| style | size / line | weight | use |
|---|---|---|---|
| Display | 24 / 30 | 700 | sheet questions ("What should this button do?") |
| Page title | 22 / 28 | 700 | top bar title |
| Section title | 18 / 24 | 700 | "Rooms", "Your scenes", "Start" |
| Card title | 16 / 22 | 700 | room name, row name, chip title |
| Body | 15 / 22 | 400 | descriptions, list text |
| Label | 15 / 20 | 600 | buttons, chips, tabs |
| Caption | 13 / 18 | 400 | subtitles, percentages, timestamps, tab-bar labels |

No uppercase tracking anywhere. No italics.

### Spacing, radii, shadow, icons

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40. Screen gutter 16px. Vertical gap between cards 12px. Section title margin: 32px above, 12px below.
- Radii: room card 16px, row card 12px, info block 16px, chip and button 999px (pill), sheet top corners 24px, icon circle 50%, input 8px.
- Shadow: none on cards, rows or buttons. Sheet: `0 -2px 12px rgba(0,0,0,.08)`. Toast: `0 4px 16px rgba(0,0,0,.16)`. Slider knob: `0 1px 3px rgba(0,0,0,.25)`. That is the full list.
- Icons: 24px grid, 1.5px stroke, round caps and joins, `currentColor`, no fills. Small size 20px. Keep the existing symbol set; reduce stroke from 1.8 to 1.5.

---

## 3. Components

**Top bar.** Height 56px plus safe area, white, no border, no blur. Title Page title style at left, 16px gutter. Right side: one round icon button (40px, white, 1px `--line`, 24px icon). Detail pages replace the title with a 40px back arrow button at left, a centered Card title, and the round icon button at right. Pressed: background `--bg-2`.

**Underline tabs.** Full width, 44px tall, each tab equal width, Label style, `--text-3` inactive, `--text` active. Active underline 2px `--black` across the tab; a 1px `--hairline` runs under the whole row. No pill, no animation on switch.

**Room card.** Full width, min height 100px, radius 16px, fill = room color, padding 16px, no border, no shadow. Layout: 24px icon top-left; room name (Card title) directly under it; optional secondary line (Caption, `--text-2`) under the name. Bottom-left, 12px above the bottom edge: the **on chip**, a 36px white circle with a 20px bulb icon in `#111111`, shown only when at least one light in the room is on; when all off the chip is absent. Right side: a 52×32 toggle (see Toggle) vertically centered at 16px from the right edge, and a 40px white round chevron button (rotates 90° when the room is expanded) to its left. Pressed: scale .98. Expanded: the card keeps its fill; light rows appear below it inside a container filled with the room's **soft** color, radius 0 0 16px 16px, padding 8px, rows stacked with 8px gaps (the card's bottom radius becomes 0 while open).

**Scene chip (home).** Height 64px, radius 16px, fill `--bg-2`, padding 12px 16px 12px 12px, no border. Left: 40px white circle with 20px icon. Then title (Card title) and subtitle (Caption `--text-3`, e.g. "6 lights" or "From the Lutron app"). Chips sit in a horizontal scroller with 8px gaps and 16px side padding. Pressed: fill `#EBEBEB`. While running (1 s): white circle turns `--black`, icon white.

**"New …" outlined card.** Same size as a scene chip. White, 1px `--line`, radius 16px. 24px plus-in-circle icon then Card title text. Pressed: fill `--bg-2`.

**Product / light row.** White card, 1px `--line`, radius 12px, min height 72px, padding 12px 12px 12px 16px. Left: 24px domain icon. Middle: name (Card title) and, on the same line in Caption `--text-3` after a " · ", the room; second line Caption showing the level ("65%", "Off", "High"). Right: the **action button**, a 44px circle. On: fill `--black`, 20px sun icon white, and an 8px `--orange` dot at the top-left rim (offset 4px, 4px) with a 2px white ring. Off: fill `--bg-2`, icon `--text-3`, no dot. Disabled or unreachable: whole row text `--text-3`, button `--bg-2`, no dot. Pressed: scale .96 on the button only. Dimmable rows carry the horizontal tick slider under the text block (see Slider), 8px below, full width minus the action button column. Fan rows replace the slider with five chips (Off, Low, Medium, Med-hi, High). Shade rows show three secondary buttons (Open, Stop, Close) at 32px height. Switch rows have no slider.

**Slider, horizontal (rows).** Translate IKEA's vertical ticks: a strip 24px tall, full width. Ticks 2px wide on a 6px pitch. Filled ticks (left of the value) are `--black`, 16px tall; unfilled ticks are `#D0D0D0`, 10px tall; all bottom-aligned. No knob. The value is the boundary. Implement as `<input type=range>` with a transparent thumb and a `repeating-linear-gradient` background split at `--p`; hit area 44px tall via padding. While dragging, a black pill tooltip (Caption 700, white, 28px tall, radius 999) shows "38%" above the boundary. Disabled: all ticks `#E6E6E6`.

**Slider, vertical (detail view).** 44px wide, 240px tall, right-aligned to the gutter. Ticks 2px tall on a 6px pitch, right-aligned: filled (below the value) `--black` 28px wide, unfilled `#D0D0D0` 18px wide. Tooltip pill to the left of the value tick, 40px tall, Card title white on `--black`, always visible while dragging, hidden otherwise.

**Toggle.** 52×32, radius 999. Off: track `#DADADA`, knob 28px white at 2px inset with the knob shadow. On: track `--black`, knob translates 20px. Disabled: track `#EBEBEB`, knob `#F5F5F5`. No color other than black.

**Chips (selection).** Height 40px, padding 0 16px, radius 999, Label style, 8px gap, icon 20px. Selected: fill `--black`, text white. Unselected: fill `--bg-2`, text `--text`. Outlined variant (used in dense lists): white, 1px `--line`. Pressed: scale .96. Disabled: `--disabled-bg` / `--disabled-fg`.

**Primary button.** Full width, height 56px, radius 999, fill `--black`, Label white. Pressed: fill `#333333`, scale .98. Disabled: `--disabled-bg` / `--disabled-fg`. Optional trailing count badge: 28px white circle with black number, 12px from the right edge (IKEA "Next (1)"). Small size 40px, padding 0 20px.

**Secondary button.** Same sizes, white, 1px `#111111`, Label `--text`. Pressed: fill `--bg-2`. Destructive variant: text `--red`, border `--line`.

**Bottom sheet.** White, radius 24px top, shadow as tokened, max height 92dvh, scrim `rgba(0,0,0,.4)`. Grab handle 40×4 `#D0D0D0`, 8px from the top. Title row 56px: optional 40px back button at left, title centered (Card title) or, for question sheets, a left-aligned Display title with a Body `--text-2` description beneath (24px top padding, 16px gutter). Close button 40px at right. Body padding 0 16px, bottom padding 24px plus safe area. Sticky footer for the primary button when present: white, 16px padding, 1px `--hairline` above. List rows inside sheets: 64px tall, 24px icon, Card title text with Caption subtitle, chevron `--text-3` at right, separated by 1px `--hairline`, no card border.

**Colored info block.** Radius 16px, padding 16px, min height 88px, fill = a room **soft** color (default `Blush` soft for "start here" guidance, `Steel` soft for status, `Lemon` soft for warnings). Title Card title, Body text `--text-2` beneath, and at the right a 40px white circle with an arrow or plus icon when the block is tappable. Used for empty states, the setup nudge, and the "not connected" banner. Never red, never bordered.

**Bottom bar.** Height 56px plus safe area, fill `#F7F7F7`, 1px `--hairline` on top, no blur, no radius. Four items of equal width: Home, Remotes, Scenes, Settings. 24px icon over an 11px 600 label (labels are shown: with four items the remote and settings glyphs need words). Active: icon and label `--text`, icon stroke 2px. Inactive: `--text-3`. No pill, no indicator.

**Status pill.** Height 32px, padding 0 12px 0 10px, radius 999, white, 1px `--line`, Caption 600 `--text`. Leading 8px dot: `--green` connected, `--red` disconnected. Text: "Connected" / "Not connected". Pressed: fill `--bg-2`.

**Toast.** Fixed bottom, 16px above the bottom bar, width min(92vw, 420px), height 52px, radius 12px, fill `--black`, Body white, padding 0 16px. Action ("Undo", "Retry") is Label white with a 1px white underline, 16px to the right of the text. Error: fill `--red`, same text. When a sheet is open the toast moves to the top.

---

## 4. Screens

**Home.** Most prominent: the stack of colored room cards. Order: (1) top bar: home name as title, status pill at right; (2) status line, Body `--text-2`, "3 lights on · Kitchen, Hall"; (3) scene chip row, horizontal scroll, first chip is a "New scene" outlined card, then every scene; (4) favorites row, same chip component with a star icon in the white circle and a level subtitle, hidden when empty (no banner); (5) "All off" as a full-width secondary button, 48px, power icon, hold behavior shown by a 3px black progress line along the bottom edge; (6) any sleep timer as a `Steel` soft info block with a small "Cancel" secondary button; (7) section title "Rooms"; (8) room cards, 12px apart, each expandable into light rows. Not connected: a `Lemon` soft info block sits above the scene row with "Not connected to your home" and a "What to check" arrow. No devices: a single `Blush` soft block "Let's connect your home" with an arrow, then nothing else.

**Remotes list.** Most prominent: the remote cards. Top bar "Remotes" with a status pill. Body `--text-2` line "Press a button on any remote to open it here." Then one white row card per remote, 88px tall: a 56px mini Pico line drawing at left (black 1px outline, white fill, tiny orange dots on set buttons), name (Card title), Caption "Kitchen · 2 buttons set up", chevron at right. "Needs attention" is a Caption in `--text` with a 6px `--orange` dot before it, not a colored badge.

**Remote detail.** Most prominent: the Pico on the circle. Top bar: back button, remote name centered, status pill right. Body: a 240px circle centered, 24px below the bar, filled with the **room color** of the remote's room (`--room` on `.hero-disc`; fall back to Mustard when the remote has no room). The Pico illustration (`picoArt`, 118px wide) sits centered on it, drawn in its real finish (white, black, ivory or gray) with 1px edges and no drop shadow. Button states on the illustration: set = 8px `--orange` dot top-right; selected = 2px `--black` outline; live press = fill `--orange` for 1.2 s. Under the circle, 16px: Caption `--text-3` centered "Tap a button on the picture, or press it on the real remote.", then a plain Body link "Not your remote? Change the picture" with a pencil icon. Then a list card (white, `--line` border, radius 12px) with one row per real button: 40px `--bg-2` circle showing the button's label ("On", "Off", "1"), title "On button", Caption lines "Press: Turns Kitchen on or off" and "Hold: Brightens…"; "Nothing yet" in `--text-3`; chevron. Last: the "This remote may still do what the Lutron app set up" disclosure as a plain Body link row with a chevron. The **look sheet** ("Which remote is this?") is a standard sheet: Section title "Layout", a list of sheet rows each with a 30px Pico thumbnail, model name and code, a black check on the current one; Section title "Colour", four chips (White, Black, Ivory, Gray), selected black; a Caption note at the bottom.

**Button sheet.** Display title "What should the On button do?", Body description "Pick a kind of press." Three sheet rows: Press, Press twice, Hold, each with the gesture icon in a 40px circle (`--black` with white icon when set, `--bg-2` when not), the plain-language summary as Caption, an "At night: …" Caption with a moon icon when set, and a chevron. A broken binding shows "Points at something that is gone. Pick again." in `--text` with a leading orange dot. Footer note in Caption `--text-3`.

**Recipe sheet.** Back button, title = gesture name centered, Caption sub = button name. Order: (1) Normally / At night switch: two chips, selected black, unselected grey, left aligned; when At night is chosen the whole body below sits on a `Steel` soft panel (radius 16px, padding 16px) with the hours note as Body and a "Change the hours" underlined link; (2) Section title "Which lights?"; (3) a horizontal chip row: room chips, "Everything", the current pick shown black, and a "Specific lights…" outlined chip with a dots icon; the full chooser sheet uses IKEA's accordion: full-width room rows filled with the room color, radius 12px, chevron in a darker 32px circle, a 24px square checkbox at right (white unchecked, black with white check when checked), and light rows in white beneath an open room; (4) Section title "What should happen?"; (5) recipe rows as white cards, 1px `--line`, radius 12px, 12px gaps, title Card title, description Caption `--text-2`; the selected recipe gets a 2px `--black` border and a 24px black check circle at right; "Nothing" is the first row; (6) a custom binding shows as a `Sand` soft info block with the description; (7) "More options" as a plain Body link row with chevron that reveals a secondary button "Fine-tune: fade times, several steps, timers…"; (8) "Try it now" secondary button, full width. The fine-tune editor keeps its step cards as white bordered cards with 8px-radius inputs, 1px `--line`, Label captions above each; "Add a step" secondary, "Done" primary in a sticky footer.

**Scenes.** Most prominent: the scene list. Top bar "Scenes", round plus button at right. Section "Your scenes": rows in one white list card, 40px `--bg-2` circle with a play icon at left (tapping runs the scene; it flashes black for 1 s), name, Caption "4 lights · fades over 8 s", star icon button (filled black when favorite) and pencil at right. Section "From the Lutron app": same rows, subtitle "Edit it in the Lutron app", no pencil. Footer: "New scene" outlined card. Empty: a `Blush` soft block "Set the lights the way you like them, then save that look" with a plus circle.

**Scene editor (sheet).** Display title "What should your lights do?", Body description "Turn lights on, off or set them to a level." Then: name input (56px, 1px `--line`, radius 8px, Card title text), a "Change gradually over" row with a select at right, two secondary buttons in a row ("Use the lights as they are now", "Try it"). Then per-room groups: Section title with the room name, a white list card, each light row with a 24px square checkbox at left, name, and at right either the horizontal tick slider (140px wide), a toggle, or a fan select; unchecked rows read "Left alone" in `--text-3`. Sticky footer: "Done" primary. Below the footer inside the scroll: "Delete this scene" destructive secondary.

**Settings.** Most prominent: the connection card. Top bar "Settings" with status pill. (1) Connection: a white bordered card with a 48px circle (`--black` with white link icon when online, `--bg-2` when not), "Connected to your home" Card title, Caption detail, and a small secondary "Look for new lights"; when offline the card is a `Lemon` soft block with the three checks as Body lines. (2) Set up: three list rows with 28px numbered circles (black with white number when done, white with `--line` border when not), the install line in a `--bg-2` block, monospace 13px, radius 8px, copy button at right. (3) Section "Night-time": two time inputs side by side. (4) Section "This app": list card with Home name (inline input at right), Add to home screen, Recent activity. (5) "Advanced" plain link row with chevron, revealing: Timing card (two tick sliders with Quick/Relaxed captions, the tester as a `Steel` soft block), Light sets card with "New set" small secondary, Backup / Restore secondary pair, and "Sign out" destructive secondary, each in its own white bordered card.

**Activity (sheet).** Title "Recent activity" centered. One list, rows 64px: 24px icon, event text Body, Caption detail, time as Caption `--text-3` at right. Empty: Body `--text-2` "Nothing yet. Press a remote button."

---

## 5. Motion

Allowed transitions; everything else is static.

- Sheet in: `transform` 100% to 0, 320ms `cubic-bezier(.2,.8,.2,1)`; scrim opacity 240ms. Sheet out: 240ms same curve.
- Pressed: `transform: scale(.96)` (buttons, chips) or `.98` (cards), 120ms ease-out, restores 160ms.
- Room card expand: body height via `grid-template-rows 0fr → 1fr`, 260ms `cubic-bezier(.2,.8,.2,1)`; chevron rotate 90°, same timing.
- Toggle knob: 200ms `cubic-bezier(.2,.8,.2,1)`; track color 200ms.
- Tab switch and view change: none (instant).
- `prefers-reduced-motion`: all of the above become 1ms.

---

## 6. Copy tone

- Talk like a helpful person, not a system: "Tap a button on the picture", "Nothing yet", "Let's connect your home". Sentence case everywhere.
- Say what happens in plain words and lead with the light, not the technology: "Turns Kitchen on or off", never "Toggle target a:kitchen".
- Questions as titles when the person has to choose: "Which lights?", "What should happen?", "How should we start this?"; one short line of help under the question, no exclamation marks except a greeting.

---

## 7. Do not

1. No dark background, no `#0b0c10`, no radial "glow" layer behind the page.
2. No gradients of any kind, including the "on" fill inside tiles and the amber slider track.
3. No blur, `backdrop-filter`, translucency or glass on the bottom bar, top bar or sheet.
4. No colored translucent tints (`rgba(255,181,71,.16)`) behind icons; icon circles are white, `--bg-2` or `--black` only.
5. No uppercase, letter-spaced section headers; section titles are 18px bold sentence case.
6. No colored borders to show state (amber outline, teal border); state is a 2px black border, a black fill, or the orange dot.
7. No amber, teal, rose or green accents on buttons or text; primary is black, the only accent is the orange dot and the room fills.
8. No staggered fade-in on page load, no pulses, no shake, no spinning ring; loading is a plain Body "Loading…" line.
