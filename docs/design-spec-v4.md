# Pico Hack: visual design specification v4 (the Tenzing skin)

Direction: Tenzing, Lutron's design system, read from its Figma component library and digested in `tenzing-digest.md` (which holds every source value and node id; this document only repeats what an implementer needs). v4 replaces `design-spec-v3.md` (the Sonos direction) as the look of the app. It keeps everything `ui-concepts.md`, `ux-flows.md` and `motion-spec.md` say about behaviour, lamp discs, moods, the night look and motion, and it keeps v3's shell: the flyout sheets, the Light now bar above the tab bar, the Now view, the light detail, the light concepts. Only surfaces, colour, type, radii, controls and icon style change. Where a value is stated, use it exactly; where a component has no Tenzing equivalent the section says "no Tenzing component; designed in its family" and explains which Tenzing pieces it is built from.

**Tenzing is a light system.** White cards with hairline borders on a `#f8f8f8` page, dark grey ink, one blue accent (`#006dcc`), Helvetica Neue, small radii (4 / 8 / 12), thin outline icons. There are no dark surface tokens in the file, so **the app's dark surfaces (the Light now bar, the Now view, the light detail sheet) become white, elevated surfaces**: the Tenzing dialog card (white, radius 12, the `Light/5` shadow) that Lutron itself uses for its lighting controls. Contrast now comes from elevation and from blue, not from a dark ground. The light stays the artwork: the lamp ramp is the only warm colour on the page, exactly as before.

---

## 1. What Tenzing does, in nine observations

1. **One light world.** A near-white page, white cards, white floating surfaces. Depth is a 1px hairline at 9% black for things that sit on the page, and a soft layered shadow plus a 0.4px inner outline for things that float over it. No grey-on-grey, no dark ground.
2. **Blue is the state.** `#006dcc` means selected, on, focused, primary. A device that is on gets a pale blue fill and a blue icon ring; a selected tab gets a blue outline; the primary button, the slider fill, the toggle track and the calendar's chosen day are blue. Nothing else is coloured except status (red `#cc0000`, green `#3a7934`).
3. **Small radii, small type.** 4 on inputs and tags, 8 on cards and tiles, 12 on menus, dialogs and sliders; pills only on chips and buttons. Type is Helvetica Neue at 12 to 24px with zero tracking; the biggest thing on a page is a 24/28 Bold title, the only big number is 40/48 Regular.
4. **Outlined inputs, outlined chips.** Fields are a 1px 90% black outline with a 12px grey label above and 12px subtext below. Chips are 1px `#b3b3b3` outlines with no fill; selected is a 2px dark outline, not a dark fill.
5. **Icon buttons come in five sizes and six moods.** 24 / 32 / 40 / 48 / 56 boxes with 16 to 32 icons; Primary (blue), Secondary (grey circle or blue outline), Danger, Transparent, Subtle. A toggle version turns blue when on. Every target is at least 48px in touch terms.
6. **Lighting controls are wells.** Lutron's dimmer is a tall white rounded well (136x320, radius 12) that fills with blue from the bottom, with a small grip line in the fill and two chevron circles under it. Colour temperature is the same well with a gradient. That is the app's slider family now.
7. **Lists are quiet, menus float.** A list row is 18/24 text with a 24px leading icon and 24px trailing icon, hover 6% black, focus a 2px blue ring. A menu is a white radius-12 card with a shadow, a grey search field at the top and a "Recents"-style header.
8. **Feedback is calm.** Progress is a 4 / 8 / 16px bar in 6% black filled blue over 600ms; success and failure are 20px green or red circles beside the title. Notifications are white cards with a 4px coloured left edge.
9. **Motion is quick and quiet.** One curve, `cubic-bezier(0.4, 0.12, 0.3, 1)`, at 150ms for hover and press and 255ms for select; a slower `cubic-bezier(0.3, 0, 0, 1)` at 600ms for progress.

**What this means for a lighting app.** Tenzing already draws lights: an on device is a pale blue card with a blue ring around a bulb, a dimmer is a blue well. The app keeps its warm lamp discs as the picture of the light (they are the artwork) and uses Tenzing's blue for everything that is a control state. A room that is on is a pale blue card; the disc inside it is warm.

---

## 2. Tokens

All values are Tenzing variables unless marked "in family" (derived, not in the file).

### Surfaces and ink

| token | value | Tenzing source | use |
|---|---|---|---|
| `--bg` | `#f8f8f8` | `Surfaces/background` | the page, the tab bar, the header |
| `--surface` | `#ffffff` | `Surface/Surface 3` | cards, sheets, the bar, the Now view, menus |
| `--surface-2` | `#fcfcfc` | `Surface/Surface 2` | resting tiles and stages |
| `--fill-1` | `rgba(0,0,0,0.02)` | `Table/zebra` | selected chip fill, an off device card |
| `--fill-2` | `rgba(0,0,0,0.06)` | `Button/secondary` | secondary buttons, icon circles, tracks, search fields, an off lamp disc |
| `--fill-3` | `rgba(0,0,0,0.10)` | `Button/secondary_hover` | pressed greys, hovered rows |
| `--fill-disabled` | `rgba(0,0,0,0.04)` | `Button/disabled` | disabled fills |
| `--line` | `rgba(0,0,0,0.09)` | `divider_opacity` | card borders, row separators, outlined toggles |
| `--line-2` | `rgba(0,0,0,0.13)` | `border2_opacity` | slider wells, the status text button, scrollbars |
| `--line-3` | `rgba(0,0,0,0.31)` | `1_opacity` | checkbox lines |
| `--line-input` | `rgba(0,0,0,0.90)` | `4_opacity` | input outlines |
| `--line-hover` | `rgba(0,0,0,0.60)` | `3_opacity` | hovered input outline (2px) |
| `--line-disabled` | `#ebebeb` | `Borders & Dividers/disabled` | disabled input outline |
| `--text` | `#262626` | `Typography/primary` | titles, row text, icons |
| `--text-2` | `#666666` | `Typography/secondary` | labels, sub lines, captions, section headers, tile labels |
| `--text-disabled` | `rgba(179,179,179,0.4)` | `Typography/disabled` | disabled text and icons |
| `--on-blue` | `#ffffff` | `Typography/on-button_primary` | text and icons on blue |
| `--scrim` | `rgba(38,38,38,0.4)` | in family (no scrim token; `#262626` at 40%) | behind a modal sheet |

### Accent and status

| token | value | Tenzing source | use |
|---|---|---|---|
| `--blue` | `#006dcc` | `Button/primary`, `Theme/theme`, `focus` | primary buttons, on states, selected, focus rings, slider fills |
| `--blue-hover` | `#004480` | `Button/primary_hover` | hovered blue |
| `--blue-pressed` | `#003666` | `Button/primary_pressed` | pressed blue |
| `--blue-10` | `rgba(0,109,204,0.10)` | `Chips/hw-background` | a room or device that is on, the active tab pill |
| `--blue-20` | `rgba(0,109,204,0.20)` | `Chips/hw-background-hover` | its border, a pressed Pico button |
| `--blue-40` | `rgba(0,109,204,0.40)` | `Icons/disabled_theme` | disabled blue outline |
| `--red` | `#cc0000` | `Button/danger` | danger buttons, error outline, error toast edge, the offline dot |
| `--red-hover` `#990000` · `--red-pressed` `#880000` · `--red-10` `rgba(204,0,0,0.10)` · `--red-text` `#990000` | | `danger_hover`, `danger_pressed`, `Chips/red-background`, `Chips/red-content` | |
| `--green` | `#3a7934` | `Icons/success` | the connected dot, success ticks |
| `--green-bg` `#cee9cc` · `--green-text` `#31672d` | | `Chips/green-*` | a "Connected" tag |
| `--chip-line` | `#b3b3b3` | `Chips/filter_border` | chip outlines, disabled chip content |
| `--brand` | `#006dcc` | `Theme/theme` | the splash only (Lutron Blue `#1E75BB` exists as a variable but no component uses it; stay on `#006dcc`) |
| `--lamp-10` to `--lamp-100` | unchanged from `light.css` | | lamp discs, the light field |
| `--lamp-off` | `--fill-2` | in family | an off disc on white |

### Shadows

| token | value | Tenzing source |
|---|---|---|
| `--shadow-1` | `0 1.6px 3.6px rgba(0,0,0,0.13), 0 0.3px 0.9px rgba(0,0,0,0.10), inset 0 0 0 0.4px rgba(0,0,0,0.20)` | `Drop Shadows/Light/1`: tiles, knobs |
| `--shadow-2` | `0 3.2px 7.2px rgba(0,0,0,0.13), 0 0.6px 1.8px rgba(0,0,0,0.10), inset 0 0 0 0.4px rgba(0,0,0,0.20)` | `Light/2`: the active nav row |
| `--shadow-3` | `0 6.4px 14.4px rgba(0,0,0,0.13), 0 1.2px 3.6px rgba(0,0,0,0.11), inset 0 0 0 0.4px rgba(0,0,0,0.20)` | `Light/3`: menus, popovers, hovered tiles, the toast |
| `--shadow-5` | `0 14.8px 28.2px rgba(0,0,0,0.18), 0 2.4px 7.2px rgba(0,0,0,0.14), inset 0 0 0 0.4px rgba(0,0,0,0.20)` | `Light/5`: dialog cards, the Light now bar, sheets |
| `--shadow-pressed` | `inset 0 2px 5px rgba(0,0,0,0.30)` | `Secondary Button Pressed` |

The inset 0.4px layer is a hairline edge; keep it on every floating surface, it is what makes white read on white.

### Radii

`--r-xs` 4 (inputs, tags, square action icons, toggle control cells) · `--r-s` 8 (cards on the page, tiles, device and room cards, the toast) · `--r-md` 12 (menus, dialogs, sheets, sliders, the bar, the status text button) · `--r-lg` 16 (small buttons, chip S, action icon S) · `--r-xl` 24 (chip M and L, action icon M and L, standard buttons) · `--r-2xl` 28 (the primary CTA, action icon XL). Nothing uses 999px; a 48px control with radius 24 is already a pill.

### Night look

Tenzing has no warm or dark mode in the file, so the night look no longer retints the surfaces (in family: a warm `#f8f8f8` would be an invented token). `:root[data-night="1"]` keeps every surface and only lowers the light field's intensity as `motion-spec.md` already allows, and switches `--blue-10` on room cards to `--fill-1` so lit rooms glow warm from their discs rather than blue. `theme-color` is `#f8f8f8` always.

---

## 3. Type

Helvetica Neue, the Tenzing family. It is not a web font Lutron ships, so the stack is `"Helvetica Neue", Helvetica, Arial, Roboto, sans-serif` (Roboto on Android is the honest fallback; do not load Inter or Noto). Weights 400, 500, 700. Letter spacing 0 on everything except the wordmark. Sentence case; Tenzing has no uppercase style.

| style | size/line | weight | colour | Tenzing style | use |
|---|---|---|---|---|---|
| Title 1 `.t1` | 24/28 | 700 | `--text` | `Bold/h24` (page title) | root page titles ("Home", "Remotes", "Settings"), the Now view headline |
| Title 2 `.t2` | 20/24 | 500 | `--text` | `Medium/m20` (dialog header) | sheet titles, nested page titles, a light's name on its sheet, the remote's name |
| Section `.h2` | 18/24 | 500 | `--text-2` | `Medium/m18` (widget header) | section headings; margin 24px 0 12px, first one 8px top |
| Row `.t` | 16/20 | 500 | `--text` | `Medium/m16` | row titles, card titles, device and room names, tile names |
| Body | 16/20 | 400 | `--text-2` | `Regular/r16` | paragraphs, help copy, the status line on Home, values at the right of a row |
| List | 18/24 | 400 | `--text` | `Regular/r18` (list item) | rows inside menus and the Now view's room list |
| Sub `.d` | 14/16 | 400 | `--text-2` | `Regular/r14` | second lines |
| Caption `.small` `.cap` | 12/16 | 400 | `--text-2` | `Regular/r12` | field labels, subtext, captions, disc labels, tab labels |
| Button | 14/16 | 500 | `--text` | `Medium/m14` | small and text buttons, chip S, tags, "Back" |
| Button large | 16/20 | 500 | `--on-blue` | the cover CTA | primary pills, chip M |
| Big number `.display` | 40/48 | 400 | `--text` | `Regular/r40` | the level on the Now view, the light detail and the timer dial |
| Bar title | 16/20 | 500 | `--text` | `Medium/m16` | the Light now bar headline |
| Bar caption | 12/16 | 400 | `--text-2` | `Regular/r12` | the caption above it |
| Wordmark `.wordmark` | 14/16 | 700 | `--text` | in family (after the "CONNECT PLACES" mark) | "PICO HACK", 0.12em tracking, uppercase; the splash at 22/28 |

`body` is 16/20 400 `--text`. Links in running copy are 500 weight `--blue`, no underline (Tenzing's hovered "See All" row).

---

## 4. Layout and the shell

Side gutter 16px on the page (Tenzing's desktop pages use 24; 16 at phone width), 24px inside sheets and dialog surfaces. Cards on the page: `--surface`, radius 8, 1px `--line`, no shadow; 8px between cards in a group, 24px between groups. Floating surfaces (bar, sheets, menus): radius 12, `--shadow-5` or `--shadow-3`.

```
#app  (--bg)
  header#top       root:   [.t1 title] ........ [status circle]
                   nested: [Back link]                       (a second line holds .t2 and the tools)
  main#view        root pages: --bg, full bleed
                   nested pages: --bg, no sheet, no grabber; the Back link is the only chrome
  #nowbar          the Light now bar, a floating white card above #nav (section 7)
  nav#nav          tab bar on --bg with a 1px --line top edge, five items
  #sheet-root      modal sheets (section 8)
  #toast
```

- `#top` is sticky, 56px plus the safe area, `--bg`. Root: `.t1` at the left, the status circle at the right. Nested: the Tenzing page header: a "Back" link (16px chevron plus 14/16 Medium "Back", 8px padding, radius 28) on the first line, then `.t2` with the tools at the right. There is no wordmark strip and no grabber on nested pages; Tenzing pages are flat.
- **Status circle**: `.iconbtn.status`, a Medium Secondary action icon (40px `--fill-2` circle, 20px `link` glyph, `--text`) with a 10px dot at its top-right corner, `--green` when the connector is online, `--red` when not, with a 2px `--bg` ring. Tap goes to Settings. `m-dot-hello` and `m-dot-lost` stay on this dot.
- **Tab bar** `#nav` (no Tenzing component; designed in its family from the side nav rows and the Outlined Only toggle icons): `--bg`, 1px `--line` top edge, 56px plus the safe area, five items (Home, Remotes, Scenes, Automations, Settings), 24px outline icons, 12/16 Medium labels. Inactive: icon and label `--text-2`. Active: icon and label `--blue`, and a 40x24 `--blue-10` pill (radius 12) behind the icon, the Device Card "on" fill. Lays out five without wrapping at 360px.
- `main` bottom padding is the tab bar plus the bar (when shown) plus 24px.

---

## 5. Components

### Cards and rows

- `.card`: `--surface`, radius 8, 1px `--line`, padding 16, no shadow (the Tenzing stat card). `.card + .card` 8px apart. A "widget" card that holds a list gets radius 12 and padding 24 on desktop widths; on the phone keep 8 and 16.
- `.card.pad0.list > .item`: min-height 56px, padding 12px 16px, gap 16 (the Tenzing List Item: 24px leading icon, 24px trailing icon 16px from the right). Row title `.t` 16/20 500; `.d` 14/16 `--text-2`; a value at the right `.val` 16/20 400 `--text-2`; the chevron 20px `--text-2`. Separator: 1px `--line` inset 16px. Hover and pressed: `--fill-2`. Keyboard focus: a 2px `--blue` inset ring.
- An add row: `+` glyph 20px `--blue` in the icon slot, title 16/20 500 `--blue`, in its own card (in family: the "See All" row, whose hover is blue text).
- Leading icons in rows are bare 24px outline glyphs, `--text`. The 40px `.ic` circle is a Medium Secondary-Filled action icon (`--fill-2`, 20px glyph) and is used for actions (play, run) and the tip card.
- `.tip` (no Tenzing component; designed in its family from the Device Health stat card): `.card` with `display:flex`, gap 16; left: `.cap` "Tip" (or "Get started", "Not connected") 12/16 `--text-2`, then the message 16/20 500, then an optional `.d`; right: a 48px Large Secondary action icon (`--fill-2` circle, 24px glyph) or a small button ("Turn on", "Show me"). A warning tip carries a red tag (below) instead of a colour on the card.
- Tag (Tenzing "Tags"): 32 tall, padding 8px 12px, radius 4, 14/16 Medium; red: `--red-10` fill, `--red-text`; green: `--green-bg`, `--green-text`; grey: `--fill-2`, `--text`. Used for "3 alerts", "Connected", "Update available".
- `.banner` becomes a `.tip` with no circle.

### Buttons

- `.btn.primary`: `--blue` pill, white 16/20 500; 48px tall with radius 24 and 24px side padding; `.lg` 56px with radius 28 and 28px side padding (the cover CTA); hover `--blue-hover`; pressed `--blue-pressed`; disabled `--fill-disabled` with `--text-disabled`. Focus: 2px `--blue` ring outside a 2px white inner stroke.
- `.btn` (secondary): `--fill-2` pill, 48px, radius 24, `--text` 16/20 500, no border; pressed `--fill-3` with `--shadow-pressed`. `.sm`: the Tenzing small button, 32px tall, min-width 104, radius 16, 14/16 500, padding 8px 0 4px (its text sits 2px high by design; centre it optically). `.block` full width.
- `.btn.ghost`: the Tenzing text button: 32px tall, radius 16, 14/16 500 `--text`, no fill; hover `--fill-2`. Under a primary pill it is "Cancel", "Close", "Not now", centred.
- `.btn.danger`: `--red` fill, white text, hover `--red-hover`, pressed `--red-pressed`. The Sign out row in Settings stays a list row with an `x` glyph.
- `.btn.outline` (new, the Secondary outlined action): 1.75px `--blue` outline, `--blue` text, transparent; hover `--fill-1`.
- Status text button (Tenzing `button/text/active`): 136x48, radius 12, 1px `--line-2`, 16/20 400 `--text`, centred. It is the readout above a well ("25%", "Off") and is not pressable unless it opens something.
- `.iconbtn`: a Medium Secondary-Filled action icon, 40px `--fill-2` circle, 20px glyph, radius 24; `.plain` is Transparent (no container, `--text`); `.on` is Primary (`--blue`, white glyph); `.sm` 32px, 20px glyph, 6px padding, radius 16; `.lg` 48px, 24px glyph; `.xl` 56px, 32px glyph, radius 28. Hover `--fill-3`; pressed `--fill-3` with `--shadow-pressed`; disabled `--fill-disabled`. Square variant `.sq` (Subtle Fill Square): radius 8, for toolbar icons inside a card header (32px, radius 4, as on Device Control).
- `.field-btn` (a row-shaped button inside a form): the Tenzing Select at Medium: 1px `--line-input`, radius 4, padding 10px 10px 10px 12px, 16/20, value left in `--text`, a 20px chevron right.

### Chips and segments

- `.chip`: the Tenzing Chip, Medium: 40px, padding 0 24px, radius 24, 1px `--chip-line` outline, no fill, 16/20 500 `--text`, 20px icons, gap 12. `.sm`: Small, 32px, padding 0 16px, radius 16, 14/16 500, 16px icons. `.lg`: Large, 48px, padding 0 32px, radius 24, 18/24 500, 24px icons.
- `.sel` / `.on`: 2px `--text` outline with `--fill-1` fill (Tenzing's selected chip; not a dark fill). Hover: `--fill-2`. Focus: 2px `--blue` outline. Disabled: `--chip-line` outline and text, `--fill-disabled`.
- A numeric badge in a chip (counts, "3"): a 16px `--blue` circle with white 12/16 500 text, the Tenzing "Numerical Only" trailing icon.
- `.chip.day` (Mo, Tu...): 40x40, padding 0, a Medium chip made round; selected as above.
- `.seg`: the same chips side by side, 8px apart.
- Mood chips `.mood` (no Tenzing component; designed in its family as a Large chip with a disc): 48px, radius 24, 1px `--chip-line`, padding 8px 20px 8px 8px, a 32px lamp disc as the leading icon, 16/20 500; selected 2px `--text` outline and `--fill-1`.

### Toggle

`.sw`: the Tenzing Switch, 44x24. On: `--blue` track with a 20px white knob at the right (2px inset), `--shadow-1` on the knob. Off (in family: the file only renders the on state): `--line-2` track, the same white knob at the left. Transition 150ms on the knob with the responsive curve. Focus: 2px `--blue` ring.

### Sliders: wells, not tracks

Tenzing has no knob slider. Its dimmer is a well that fills with blue, so every level control in the app becomes a well (`.well`):

- **Vertical well** (`.vslider`, the light detail): the Tenzing slider as documented, 136x320, `--surface`, 1px `--line-2`, radius 12, overflow hidden; the fill `--blue` from the bottom to `--p`, its bottom corners radius 12, its top edge straight; a 40x4 grip in `rgba(255,255,255,0.4)` 8px below the fill's top edge. Under it two 40px `--fill-2` circles with chevron-down and chevron-up that step 10%. On a 360px phone the well is 112 wide beside a 140px disc (the only departure from the documented 136).
- **Horizontal well** (`.slider`, room and light rows, the house dimmer; in family: the same well laid on its side): 40px tall in a light row, 32px on the bar, 48px on the Now view; `--surface`, 1px `--line-2`, radius 12; the fill `--blue` from the left, its left corners radius 12; a 4x20 grip 8px inside the fill's leading edge. The native `input[type=range]` stays in the DOM for `slide.js` and is drawn transparent over the well; `--p` paints the fill. Disabled: fill `--fill-disabled`.
- The value tooltip `.stip`: the Tenzing status text button at 32px tall (radius 12, 1px `--line-2`, white, 14/16 500), above the grip while dragging.
- Read-only progress (the sleep timer's draining hairline, `.m-timer-line`): the Tenzing Medium progress bar, 8px, radius 4, track `--fill-2`, fill `--blue`, 600ms with the transition curve when it jumps.

### Inputs

Outlined fields, the Tenzing way, all at Medium: `.field > span` label 12/16 400 `--text-2` above with a 4px gap (a required mark is `--red`); `.input`: `--surface`, 1px `--line-input`, radius 4, padding 10px 10px 10px 12px, 16/20 `--text`, ghost text `--text-2`; hover 2px `--line-hover`; focus 2px `--blue`; error 2px `--red` with 12/16 `--red` subtext and a 16px error icon; disabled 1px `--line-disabled` with `--text-disabled`. `select.input` keeps a 20px chevron at the right. Inside a `.card` the field looks the same (white on white with its outline). `type="time"` and `type="number"` inside list rows sit at the right as a plain value, 16/20 `--text`, no outline; the number input in Advanced uses the Tenzing NumberInput (min-width 120, minus and plus as 16px icons in 24px boxes with a 16px divider).

Checkboxes `.cb`: 16px, radius 4, 2px `--line-3`; checked: 2px `--blue` outline and a `--blue` tick on white (the Tenzing checked state); 4px padding around it, 8px to a 14/16 label. In a list row use the Multi Select row: a 24px checkbox at the left.

Search (`.search`, Settings and pickers): the Tenzing search container: `--fill-2`, radius 4, 40px, padding 8px 16px, a 24px magnifier, 18/24 placeholder `--text-2`; hover `--fill-3`; focus 2px `--blue`.

### Tiles (scenes and favourites on Home)

`.tile`: a Tenzing Visual Picker. Face 112x112 (in family: between the documented Petite 64 and Small 136; keep Small's rules): `--surface-2`, radius 8, padding 16, `--shadow-1`; hover `--surface` with `--shadow-3` over 150ms; pressed 255ms. The face shows the lamp discs of what the tile controls (`lampHTML`, up to four 28px discs in a 2x2 cluster, one 44px disc for a single light). Label under, 16px below the face, centred: `.n` 14/16 500 `--text-2` one line, `.s` 12/16 `--text-2`. A running scene: 2px `--blue` outline and a 32px blue check circle overhanging the top-right corner by 8px (the Selected state) for as long as the `m-wash` plays. `.tile.new`: the face holds a 48px `+` glyph `--text-2` (the "placeholder icon at 48px" rule), label "New scene".

### The room card (Home)

The Tenzing Device Card, room sized:

```
.room  (radius 8, 1px border, padding 0)
       off:  --surface,  border --line
       on:   --blue-10,  border --blue-20          (the Device Card "on" state)
  .head   [56px slot: a 48px ring (--line when off, --blue when on) around the lamp disc 32]
          [.n 16/20 500 ; .s 16/20 400 --text-2 "Off" / "62%"]  [chev 32 --fill-2 square radius 4]  [.sw]
  .body   (grid-rows 0fr/1fr as today), same fill, a 1px --line hairline above the first row
    .moodrow (Large chips with discs)
    .light rows: [lamp disc 32 in a 40px ring] [.n 16/20 500 ; .lv 14/16 --text-2] [.act] [star 32]
                 a 40px horizontal well under the row, full width
```

`.act` (a light's on/off) is the Action Icon - Toggle, Filled, 40px: off `--fill-2` circle with a 20px `--text` bulb; on `--blue` with a white bulb. Fans keep the speed chips (Small); shades keep Open / Stop / Close as three `.btn.sm`.

### Lamp discs

Unchanged: `.lamp` is the level, fill from the ramp; off is `--fill-2`. `lampOff()` reads `--lamp-off`. Discs sit inside Tenzing's 48px ring when they stand for a device: `--line` ring when off, `--blue` ring when on. The disc itself never turns blue.

### Badges

A 24px `--red` circle, 4px padding, 16px white glyph, 1px white edge, overhanging the top-right of a disc ring or a tile (the Tenzing Badge): low battery, timer running, needs attention.

---

## 6. The screens

### Splash and sign in (onboarding)

1. **Splash**: full-bleed `--brand` (`#006dcc`) with `.wordmark` in white at 22/28 centred; fades over 255ms into Welcome. With a token it shows for 255ms while the snapshot loads.
2. **Welcome** (`loginHTML`): a `--bg` page, no header, no tab bar, no bar; a white `.card` (radius 12, `--shadow-5`, padding 24, the Tenzing dialog card) centred at 15vh: `.t2` "Welcome", Body "Enter your home's password to get started.", an outlined field labelled "Password", `.btn.primary.lg.block` "Continue" (disabled until typed), `.btn.ghost` "Where do I find it?" centred under it. A wrong password: the field goes to its error state and the subtext reads "That's not the password".
3. **Getting ready**: the same card with "Getting your home ready..." 16/20 500 centred and the Tenzing indeterminate progress bar (Medium, 8px) sweeping under it; when connected, "Connected to your home" with a 20px `--green` check circle (the Success state) for 900ms, then Home. Offline: straight to Home with the Not connected tip.
4. **First run with no connector** (`setupEmpty`): a sheet: `.t2` "Let's connect your home", Body copy as before, a 192px Visual Picker Medium face (radius 8, `--surface-2`, `--shadow-1`) holding `picoArt` at 84px wide, `.btn.primary` "Show me how", `.btn.ghost` "Later".

### Home (root)

Header: `.t1` home name, status circle. In order:

1. `.m-hero` with the light field behind items 2 and 3 (lamp colours, unchanged).
2. **Light now strip**: the headline in Body `--text-2`, then the lamp discs with 12/16 labels; each disc in a 32px ring (`--blue` when on). All off lives on the bar.
3. **Scenes**: `.h2` "Scenes" with a "See all" text link in `--blue` at the right; the `.tiles` row.
4. **Sleep timers**: each timer is a `.card` row: the 40px ring with the disc inside, `.t` "Kitchen off in 12 min", `.d` "Sleep timer", a `.btn.sm` "Cancel", and the 8px progress bar draining along the card's bottom edge.
5. **Coming up**: a `.card.pad0.list` under `.h2` "Coming up".
6. **Tips**: `.tip` cards; "Not connected" carries a red tag.
7. **Rooms**: `.h2` "Rooms", the room cards, 8px apart.

### Remotes (root) and the remote page (nested)

- Root: `.t1` "Remotes"; Body "Press a button on any remote to open it here."; one `.card.pad0.list` with a row per remote: a 40px pico thumb, `.t` name, `.d` "Kitchen · 3 buttons set up", a chevron; "Needs attention" is a red tag at the right.
- Remote page: the Back link, then `.t2` the remote's name with `.d` "Kitchen · 5-button remote" under it. The **stage** (no Tenzing component; designed in its family as a Visual Picker Large face): 240x240, `--surface-2`, radius 8, `--shadow-1`, `picoArt` interactive at 104px wide inside. A selected Pico button gets a 2px `--blue` stroke (`.pk.sel`), a live press fills `--blue-20` for 150ms. Under it `.btn.ghost` "Not your remote? Change the picture". Then `.h2` "Buttons" and the rows (glyph, title, the three gesture lines in `.d`, chevron). The "may still do what the Lutron app set up" note is a `.tip` with a chevron.

### Scenes (root)

`.t1` "Scenes", a 40px `+` `.iconbtn.on` (blue) in the header. Sections "Your scenes", "From the Lutron app", "Room moods", each a `.card.pad0.list`; the row's icon slot is a 40px `--fill-2` circle with a play glyph, a star at the right, a pencil for yours. Empty state: a `.tip` with a 48px `+` circle.

### Settings (root)

`.t1` "Settings", status circle. Order as in v3, restyled:

1. **Connection tip**: `.tip` "Connected to your home" with a green "Connected" tag and `.d` "3 lights · 2 remotes · bridge at 192.168.1.91". Not connected: a red tag "Not connected".
2. `.h2` "Your home": rows with values and toggles; "Connector 0.5.1" shows an "Update available" grey tag and a `.btn.sm.primary` "Update" (blue, 32px, radius 16).
3. `.h2` "Set up": numbered steps: 24px circles, 1px `--line-3` ring, 12/16 500; done = `--blue` fill with a white tick; the install line in a `.code` block on `--fill-2`, radius 4, Courier at 12/16.
4. `.h2` "Night-time": time inputs at the right of rows; the three look chips (Small).
5. `.h2` "This app", 6. `.h2` "Advanced" (two horizontal wells with 12/16 captions; the NumberInput for default brightness), 7. the "Sign out" row.

### The light detail sheet (white, elevated)

`sheet.open(name, body)`; the `dark` option is accepted and ignored (there is no dark surface any more). The Tenzing dimmer dialog, for one light:

1. Header: `.t2` the light's name, a 24px close icon at the right (the dialog header, 24px padding).
2. `.d` "Kitchen · Accent" under the title.
3. The stage: the lamp disc `.ld-disc` (140 to 200px by level) at the left, the vertical well (112x280 on phones) at the right with its two chevron circles under it.
4. The status text button showing the level ("62%" or "Off") centred under the stage (Tenzing's "25%" readout), and `.display` is not used here.
5. The mood row (Large chips with discs).
6. A row of three 56px Extra Large Secondary action icons with 12/16 labels: "Sleep timer" (clock), "Favourite" (star; on = Primary blue with a filled star), "What kind".

### The sleep-timer dial

No Tenzing component; designed in its family. The 240px ring: track `--fill-2` 12px, progress `--blue` with a round cap (the progress bar bent into a circle), a 28px white knob with `--shadow-1` and a 1px `--line-2` edge. Centre: `.td-cap` 12/16 `--text-2`, `.td-min` 40/48 400, the disc 96. Under it Small chips for the presets and `.btn.primary` "Start".

---

## 7. The Light now bar and the Now view

The bar is the app's now-playing bar. Present on every page once signed in and the snapshot has arrived, hidden on the login pages. 8px above the tab bar, 12px side margins. **No Tenzing component; designed in its family** as the dialog card: `--surface`, radius 12, `--shadow-5`, padding 12px 16px 14px, z-index below `#sheet-root`.

```
#nowbar
  .nb-main (tap: opens the Now view)
    .nb-thumb  44px --fill-2 square, radius 8, holding a 28px lamp disc at the house's mean lit level
               (a 20px bulb glyph --text-2 when everything is off)
    .nb-text   .cap "Home"                                   12/16 400 --text-2
               .t   "Kitchen and Outside are on"             16/20 500 --text, one line, ellipsis
    .nb-off    a 40px Medium Primary action icon (--blue circle, white power glyph): All off.
               Tap: all lights off. Hold 1s: also shades and fans; the m-hold sweep draws --blue-pressed
               across the circle (the warm sweep stays in the light field), then Motion.allOff().
  .nb-level  (only while something is on)
    sun-low glyph 20px --text-2 | a 32px horizontal well | the level 14/16 500 --text-2, 32px wide
```

Behaviour unchanged from v3 (`houseLevel()`, `setHouseLevel(v)`, the 120ms gate, `paintNowBar()`). `Motion.barIn` and `Motion.textSwap` stay.

### The Now view

A modal sheet (`sheet.open('', body, { full: true })`), white, full height, radius 12 at the top, the Tenzing dialog at phone size:

1. Header: a 24px close icon at the right, no title.
2. The artwork: a Visual Picker Large face, 240x240, `--surface-2`, radius 8, padding 32, `--shadow-1`, holding the lit rooms' lamp discs in a loose cluster (at most six); everything off = one 96px off disc with the `moon` glyph.
3. `.t1` centred: the headline; `.d` centred: "5 lights · 62% on average".
4. `.display` 40/48 the mean level, centred, then the house well (48px tall) with the level at the right.
5. A row of four 56px Extra Large Secondary action icons with 12/16 labels: "All off" (Primary blue), "Night", "Sleep timer", "Scenes".
6. `.h2` "Rooms", then a `.card.pad0.list` of Tenzing list rows: a 32px disc in a ring, name 18/24 400 `--text`, `.lv` 14/16 `--text-2`, a `.sw` at the right; separators `--line`. Tap the name to close and open that room on Home.

---

## 8. Modal sheets

`#sheet-root .sheet` (no Tenzing component; designed in its family as the dialog card pulled up from the bottom): `--surface`, radius 12 at the top corners (Tenzing's largest surface radius), `--shadow-5`, max-height 92dvh, the `--scrim` behind. Grabber 36x4 `--line-2` at 8px (in family). The header `.sh`: padding 24px 24px 8px, `.t2` at the left with the sub line in Body `--text-2` under it, a 24px Transparent close icon at the top right (and a 24px back chevron at the top left when `back`), the Tenzing dialog header. Body padding 4px 24px 24px plus the safe area. `.sfoot` sticky with the primary pill, a 1px `--line` above.

`full: true` makes the sheet 100dvh with 12px top corners. The `dark` option is ignored: every sheet is white.

Lists inside sheets: `.card.pad0.list` as on pages. The recipe list: rows in one card; the selected row is the Single Select list item, a 24px `--blue` checkmark at the left and the title in 500 weight. The target picker's room rows: `.roomrow` is a Multi Select list row (24px checkbox at the left) with the disc, the name, "3 lights, the whole room" and the expand chevron; the lights under it are rows in the same card. Menus that pop from a chip (day picker, "Which lights") use the Tenzing Menu: white, radius 12, `--shadow-3`, 4px side padding, an optional search row, max-width two thirds of the viewport, max-height two thirds of the viewport, "Clear all" `.btn.sm` and "Save" `.btn.sm.primary` at the bottom.

Toast (no Tenzing component; designed in its family after the notification card in the ProgressBar example): `--surface`, radius 8, `--shadow-3`, 52px tall, padding 0 16px, a 4px `--blue` bar down the left edge (`--red` for `.err`), 14/16 500 `--text`, an action in `--blue`; bottom is the bar's top plus 12px.

---

## 9. Motion

Everything in `motion-spec.md` stands, retimed to Tenzing's curves: `--ease` becomes `cubic-bezier(0.4, 0.12, 0.3, 1)`; press and hover feedback 150ms; select, chip and toggle changes 255ms; sheet open 300ms on the same curve; progress and the timer bar 600ms on `cubic-bezier(0.3, 0, 0, 1)`. Tile hover: shadow from `--shadow-1` to `--shadow-3` and the face from `--surface-2` to `--surface` over 150ms (Tenzing's Visual Picker motion). `Motion.textSwap` and `Motion.barIn` unchanged. The light field, the scene wash, the veil and the warm hold sweep stay warm: the light is still the artwork.

---

## 10. What changes in code (for the implementer)

- `index.html`: drop the Google Fonts link; font stack per section 3; `theme-color` `#f8f8f8`; `manifest.webmanifest` `background_color` `#f8f8f8`, `theme_color` `#006dcc`.
- `styles.css`: rewritten to sections 2 to 5 and 8. Class names stay; additions: `.well` (horizontal well drawn behind the native range), `.tag`, `.btn.outline`, `.iconbtn.sq`, `.badge`; `.sheet.dark` rules are deleted (the class is harmless if still set).
- `light.css`: `--lamp-off` is `--fill-2`; `.vslider` becomes the vertical well; the light detail and Now view drop their dark tokens; `.mood` per section 5; `.td-ring` per section 6.
- `core.js`: the nested header draws the Back link and a second line (`.t2` plus tools) instead of the wordmark strip; `sheet.open` ignores `dark`; `statusCircle()` unchanged.
- `home.js`: room card carries `.on` when any light is on (the blue-10 fill); tiles render the Visual Picker face; the timer row gets the progress bar.
- `light.js`: the light sheet and Now view per sections 6 and 7 (white); `lampHTML(..., dark)` is called with `false` everywhere.
- `remotes.js`: the stage per section 6; `.pk.sel` blue stroke, `.pk.live` blue-20 fill.
- `settings.js`, `scenes.js`: tags and small buttons per section 5.
- `motion.js`: curve and durations per section 9.
- `sw.js`: bump VERSION to `v11`.
- The Playwright suite must still print `errors: none`; selectors it relies on (`.room`, `.item.remote-card`, `.stage .pico-svg`, `#sheet-root.in`, `[data-act=...]`) are unchanged.

---

## Implementation notes

- **Helvetica Neue** is present on iOS and macOS only; Android renders Roboto. The metrics differ by a pixel or two per line; the line heights above are Tenzing's and hold on both. Do not substitute a web font: Tenzing's look is the system Helvetica.
- **Wells in a 16px gutter.** A 40px well under a light row is heavier than v3's 4px track; that is the Tenzing dimmer and is intentional. If a room has more than six lights, collapse the wells to the 8px progress-bar geometry until the row is tapped (in family: the read-only progress bar).
- **The dark option.** Keeping `sheet.open(..., { dark: true })` callable means the v3 call sites need no edits; it is a no-op.
- **Blue on warm.** Blue rings and blue fills sit next to warm discs everywhere. That contrast is the point: warm is the light, blue is the control.
