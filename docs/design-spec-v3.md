# Pico Hack: visual design specification v3 (the Sonos direction)

Direction: the Sonos iOS app (2024 redesign), studied screen by screen on Mobbin. This document replaces `design-spec.md` (the IKEA direction) as the look of the app. It keeps everything `ui-concepts.md`, `ux-flows.md` and `motion-spec.md` say about behaviour, lamp discs, moods, the night look and motion; only the surfaces, type, colour and layering change. Where a value is stated, use it exactly.

Reference screens studied (Sonos, iOS): splash (black, and ochre); Terms; Welcome (email); Check your email; Allow Bluetooth; the product sheet "Era 100 · Add" with page dots; "Getting your Era 100 ready..." (four-dot loader); "Connecting to your Era 100..." (tick); Settings (light, with the "Get to know your Sonos One" card); Settings nested (back circle, wordmark, account and gear); General Settings; Room › Products; Sound (Trueplay card, EQ, Volume Limit); Hardware toggles; Groups (empty and with "Home"); Create Group; Network; System Updates; Voice Assistants; Your System home (Recently Played, Your Services, Sonos Favorites, Tip card, Edit Home, Search pill); home with Trending Now tiles; the collection page; the now-playing bar (idle "No Content", and playing); the full-screen now playing (dark); the track sheet (Save, Sleep Timer); Queue; Messages; Search with keyboard; the older Settings with the five-icon tab bar and the "Living Room · No music selected" bar above it.

---

## 1. What Sonos does, in nine observations

1. **Two layers.** A dark ground and a light grey sheet that carries the content. Root pages are light, full-bleed, with a big bold title top-left and two round icon buttons top-right. Nested pages ride on a sheet: a strip of ground shows above it holding a round back button, the wordmark, and the icon buttons; the sheet has 28px top corners and a short dark grabber. Modal sheets dim whatever is behind them.
2. **Grey on grey.** Cards are a slightly darker grey than the sheet. No borders, no shadows, no white. Depth is one step of grey and a radius.
3. **Black is the accent.** The only saturated thing on a page is the artwork. Primary buttons, selected chips, toggles that are on, and the wordmark are black. Everything else is a grey or black text.
4. **Big titles, quiet rows.** Titles are 34px bold, tight tracking, sentence case, always left. Rows are 17px, regular to medium weight, with a 14px grey second line. Section headings are 20px semibold. Nothing is uppercase except the wordmark.
5. **Rows live in grouped cards.** Related rows share one card with hairline separators inset from the edge. A chevron closes a row that opens something; a value ("Off", "Channel 6") or a toggle closes one that does not. "+" rows add things and sit in their own card.
6. **Pills.** Primary is a full-width 56px black pill with white 17px semibold text, a text button centred under it ("Cancel", "Close", "Change network"). Small actions are 44px pills: black inside a card ("Sign In"), grey on the page ("Edit Home", "Turn on"). Icon buttons are 40px grey circles.
7. **The now-playing bar.** A dark slate rounded bar pinned to the bottom, above the tab bar when there is one: a rounded-square thumbnail, a small caption (the room), a bold white title, a round button, a play button, and under them a slider with a white knob and the level as a number. Tapping it opens a full-screen dark view: big artwork, bold title, grey subtitle, a large light circular play button, the slider, and the room name centred at the bottom between two round buttons.
8. **Onboarding is a conversation on plain pages.** Full-bleed brand colour for the splash. Then plain light pages: a big title, one paragraph, one underlined field (label above, a single hairline under the value), the black pill pinned near the bottom with a text button beneath. Progress is a sentence ("Getting your Era 100 ready...") with a four-dot loader, then a tick. Adding hardware is a sheet sliding over the dark ground with a big product render, the product name, a caption, "Add", and page dots.
9. **A tip card.** Grey card, "Tip" caption, a bold two-line message, a 64px grey circle with an icon at the right. Used for the one thing the app would like you to do next.

**What this means for a lighting app: the light is the artwork.** Sonos gets its only colour from album covers. We get ours from the lamp ramp (`--lamp-10` to `--lamp-100`) and the warm light field. Room colours leave every surface; a room is a grey card whose lamp disc shows its level. The ochre splash (`--brand`) is the one brand colour, and it is a stop on the lamp ramp, so the app opens on the colour of a lamp.

---

## 2. Tokens

### Surfaces and ink

| token | hex | use |
|---|---|---|
| `--ground` | `#DFE2E4` | behind sheets: the strip above a nested page, the tab bar |
| `--sheet` | `#F1F2F3` | root pages, the page sheet, modal sheets |
| `--card` | `#E3E6E8` | grouped cards, chips, icon circles, grey pills, tiles |
| `--card-2` | `#D5D9DC` | a pressed card or pill, the "Edit Home" style pill |
| `--line` | `#CBD0D3` | hairlines inside cards, underline fields, slider tracks |
| `--text` | `#111111` | primary text, icons |
| `--text-2` | `#4A5054` | body copy, sub lines that matter |
| `--text-3` | `#737A7F` | captions, values at the right of a row, placeholders |
| `--black` | `#111111` | primary pills, selected chips, toggles on, the wordmark |
| `--disabled-bg` | `#C7CBCE` | disabled primary pill |
| `--disabled-fg` | `#8B9297` | disabled text |
| `--scrim` | `rgba(17,17,17,.55)` | behind a modal sheet |

### The dark surfaces (the bar and the Now view)

| token | hex | use |
|---|---|---|
| `--bar` | `#3A474F` | the Light now bar |
| `--bar-2` | `#4A5860` | thumbnail square and round buttons on the bar, pressed rows on dark |
| `--now` | `#2B3940` | the full-screen Now view and the light detail sheet |
| `--now-2` | `#38464E` | cards and rows on the Now view |
| `--on-dark` | `#FFFFFF` | titles and icons on dark |
| `--on-dark-2` | `#C3CACF` | captions and sub lines on dark |
| `--on-dark-3` | `#8D979D` | disabled on dark |
| `--knob` | `#FFFFFF` | slider knob everywhere |

### Colour

| token | hex | use |
|---|---|---|
| `--brand` | `#D9A35B` | the splash, and nothing else |
| `--lamp-10` … `--lamp-100` | unchanged from `light.css` | lamp discs, the light field, the on chip |
| `--green` | `#2E8B57` | the connection dot when connected |
| `--red` | `#C8102E` | the connection dot when not, the error toast |

`ROOM_PALETTE` and `roomColor()` stay in `core.js` (settings still carry `room_colors`), but nothing renders them. The light field takes `lampColor(level)` per room instead of the room colour, so the haze is the colour of the light, not of paint.

### Night look

The same mechanism (`:root[data-night="1"]` in `light.css`), retuned: the light surfaces go warm grey rather than cream, the dark ones stay. `--ground #D8D5CF`, `--sheet #ECEAE5`, `--card #DEDBD5`, `--card-2 #D0CCC5`, `--line #C3BFB8`, `--text-3 #6E6B66`. `theme-color` follows `--sheet`.

---

## 3. Type

Inter from Google Fonts (`wght@400;500;600;700`), falling back to `-apple-system, Roboto, sans-serif`. Inter reads like the system face Sonos uses on iOS; Noto Sans does not. Titles carry tight tracking; nothing else does.

| style | size/line | weight | tracking | use |
|---|---|---|---|---|
| Title 1 `.t1` | 32/38 | 700 | -0.02em | root page titles in the header row ("Home", "Remotes", "Settings") |
| Title 2 `.t2` | 28/34 | 700 | -0.02em | sheet titles, nested page titles, the product name on a remote |
| Section `.h2` | 20/26 | 600 | -0.01em | section headings; margin 28px 0 12px, first one 8px top |
| Row `.t` | 17/22 | 500 | 0 | row titles, card titles, tile names |
| Body | 16/24 | 400 | 0 | paragraphs, help copy, `--text-2` |
| Sub `.d` | 14/20 | 400 | 0 | second lines, `--text-3` |
| Caption `.small` `.cap` `.tiny` | 13/18 | 400 | 0 | captions, the "Tip" word, disc labels |
| Bar title | 16/20 | 600 | 0 | the Light now bar headline, white |
| Bar caption | 12/16 | 500 | 0.02em | the caption above it, `--on-dark-2` |
| Big number `.display` | 40/44 | 600 | -0.02em | the level in the Now view and the light detail |
| Wordmark `.wordmark` | 13/16 | 700 | 0.18em | "PICO HACK", the only uppercase |

`body` is 16/24 400. Sentence case everywhere. No underlines on links; a link in running copy is 500 weight, `--text`.

---

## 4. Layout and the shell

Side gutter 16px on the page, 16px inside sheets. Cards are 16px radius, sheets 28px, the bar 20px, tiles 12px, thumbnails 10px, pills 999px. Vertical rhythm: 8px between cards in a group, 24px between groups, 28px above a section heading.

```
#app
  header#top       root: [.t1 title] ........ [status circle]
                   nested: [back circle] [wordmark] [status circle]  on --ground
  main#view        .page   root pages: --sheet, full bleed, no radius
                   .page.nested: --sheet, 28px top corners, a grabber, sits below the strip
  #nowbar          the Light now bar, fixed above #nav (section 7)
  nav#nav          tab bar on --ground, five items, black icons
  #sheet-root      modal sheets (section 8)
  #toast
```

- `#top` is sticky, 56px plus the safe area, background follows the page (`--sheet` for roots, `--ground` for nested). Root: `.t1` left, then a 40px status circle at the right. Nested: a 36px `--card` circle with a back chevron at the left, `.wordmark` centred, the status circle at the right.
- **Status circle** replaces the "Connected" pill: `.iconbtn.status` 40px `--card` circle with the `link` glyph and a 10px dot at its top-right corner, `--green` when the connector is online, `--red` when not, with a 2px `--sheet` ring. Tap goes to Settings. The `m-dot-hello` and `m-dot-lost` animations move to this dot.
- **Nested pages** (today only the remote detail): `main` gets `.nested`, the strip of `--ground` above it is the header, the page has 28px top corners and a 36x5 `#AEB4B8` grabber centred 8px from the top, padding-top 20px. The `pageIn` motion is the same.
- **Tab bar** `#nav`: `--ground`, 56px plus the safe area, five items (Home, Remotes, Scenes, Automations, Settings), 24px line icons, 11/14 600 labels, `--text-3` when inactive and `--text` with a 2px stroke when active. The Automations item is added by the automations work; the bar must lay out five without wrapping at 360px.
- `main` bottom padding is the tab bar plus the bar (when shown) plus 24px, so the last card clears both.

---

## 5. Components

### Cards and rows

- `.card`: `--card`, radius 16, padding 16, no border, no shadow. `.card + .card` 8px apart.
- `.card.pad0.list > .item`: min-height 56px, padding 14px 16px, gap 12px. Separator: 1px `--line` from 16px in (`margin-left: 16px` on a pseudo element, or `border-top` on an inner wrapper). Row title `.t` 17/22 500; `.d` 14/20 `--text-3`; a value at the right `.val` 15/20 `--text-3`; the chevron `--text` (not grey), 20px. Pressed: `--card-2`.
- An add row: `+` glyph 20px in the icon slot, no circle, title only, in its own card.
- Leading icons in rows are bare 24px glyphs, `--text`, no circle. The 40px `.ic` circle stays for actions (play, run) and for the tip card.
- `.tip`: `.card` with `display:flex`, gap 16; left column: `.cap` "Tip" (or "Get started", "Not connected") in `--text-3`, then the message 17/22 600, then an optional `.d`; right: a 64px `--card-2` circle with a 28px glyph, or a small grey pill button ("Turn on", "Show me"). This replaces every `.infoblock` (blush, steel, lemon, sand, sky): they are all one grey card now. A warning is a title, not a colour.
- `.banner` becomes a `.tip` with no circle.

### Buttons

- `.btn.primary`: black pill, 48px; `.lg` 56px; white 17/22 600. Pressed `#2A2A2A`. Disabled `--disabled-bg` / `--disabled-fg`.
- `.btn` (secondary): `--card` pill, 48px, `--text` 16/22 500, no border. Pressed `--card-2`. `.sm` 40px 15px. `.block` full width.
- `.btn.ghost`: a text button, 16/22 500, `--text`, no underline, centred when `.block`, 44px tall for the target. Under a primary pill it is the "Cancel", "Close", "Not now".
- `.btn.danger`: `--card` pill with `--red` text. The Sign out row in Settings is a list row with an `x` glyph at the right instead (Sonos "Sign Out ✕").
- `.iconbtn`: 40px `--card` circle, `--text` glyph, no border. `.plain` transparent. `.on` black with white glyph. `.sm` 36px (the back circle and the sheet close circle).
- `.field-btn` (a row-shaped button inside a form): `--card` 48px radius 12, value left, chevron right.

### Chips and segments

- `.chip`: 40px pill, `--card`, 15/20 500, gap 8; `.sel`/`.on` black with white text; `.outline` is gone: use the same `--card` fill with a leading `+` or `dots` glyph. `.sm` 36px.
- `.seg`: the same chips side by side.
- Service-style circles (`.circ`): 64px `--card` circles with a 28px glyph, label under in `.small`, used for the mood row on a room card? No: moods keep the lamp disc chips from `light.css` (section 6).

### Toggle

`.sw` 52x32. Off: transparent, 2px `--text` border, a 10px `--text` dot at 8px from the left. On: black fill, a 24px `--knob` circle at the right, no shadow. Transition .2s on the knob only.

### Sliders

The tick slider is retired. `.slider` (native range, restyled): a 4px track, `--line`, filled to the value with `--text` (`--p`), and a 24px round `--knob` thumb with `0 1px 3px rgba(0,0,0,.3)` shadow, 44px tall hit area. On dark (`.dark .slider`, and inside `#nowbar`): track `rgba(255,255,255,.28)`, fill `--on-dark`, knob `--knob`. The tooltip `.sliderwrap .tip` stays (black pill with the value) on light; on dark it is `--on-dark` with `--now` text.

The vertical slider in the light detail (`.vslider`) becomes an 8px vertical track with the same fill and a 28px knob, 240px tall, on the dark sheet.

### Inputs

Underline fields, the Sonos way: `.field > span` label 15/20 500 `--text-2` above; `.input` is transparent, no radius, padding 10px 0, 17/22, a 1px `--line` bottom border, black when focused, no outline. `select.input` keeps a chevron at the right. Inside a `.card` the underline is `--card-2` on `--card` (the "System Name" card). `type="time"` and `type="number"` inputs inside list rows sit at the right as a value, 17px, `--text`, no border at all.

Checkboxes `.cb`: 24px, radius 6, 2px `--text` border, black fill with a white tick when checked.

### Tiles (scenes and favourites on Home)

`.tiles` is a horizontal row of `.tile`: 112x112 (face) plus the label, radius 12, `--card` face, 8px gap. The face shows the lamp discs of what the tile controls (`lampHTML`, up to four 28px discs in a 2x2 cluster centred, one 44px disc when it is a single light) so the tile reads as a little picture of the light. Label under the face: `.n` 15/20 600 one line, `.s` 13/18 `--text-3`. `.tile.new`: the face is `--card` with a 32px `+` glyph centred, label "New scene". Pressed `.98` scale. A running scene's face gets the `m-wash`.

### The room card (Home)

```
.room (--card, radius 16)
  .head   [lamp disc 44 with the room glyph] [.n 17/22 600 ; .s 14/20 --text-3] [chev circle 36 --card-2] [.sw]
  .body   (grid-rows 0fr/1fr as today), background --card, a hairline above the first row
    .moodrow (unchanged)
    .light rows: [lamp disc 36] [.n 16/22 500 ; .lv 13/18 --text-3] [.act 40 circle --card-2, black when on] [star 36]
                 slider under the row, full width
```

No white boxes inside; light rows are separated by `--line` hairlines inset 16px. Fans keep the speed chips; shades keep Open / Stop / Close as three `.btn.sm`.

### Lamp discs

Unchanged: `.lamp` is the level, fill from the ramp, off is `--card-2` (on light) or `--now-2` (on dark). `lampOff()` reads `--lamp-off`, a token set to `--card-2` on `:root` and to `--now-2` on `.dark`.

---

## 6. The screens

### Splash and sign in (onboarding)

1. **Splash**: on first paint, when there is no token, `#app` shows a full-bleed `--brand` page with `.wordmark` at 22px centred; it fades over 400ms into the Welcome page. With a token, the splash shows for 400ms while the snapshot loads, then the loading state.
2. **Welcome** (`loginHTML`): plain `--sheet` page, no header, no tab bar, no bar. Padding 24px 20px. `.t1` "Welcome" at 15vh; body "Enter your home's password to get started."; an underline field, label "Password"; the black pill "Continue" pinned 24px above the safe area, disabled until something is typed; under it `.btn.ghost` "Where do I find it?", which opens a sheet: title "Your home's password", body "It's the password whoever set up your hub chose. It's in the hub's settings under APP_PASSWORD." A wrong password shakes nothing: the field label turns `--red` and reads "That's not the password".
3. **Getting ready**: after sign in, until the snapshot arrives: the same plain page with "Getting your home ready..." 17/22 500 centred at 40% height and a four-dot loader (four 8px `--text` dots, 8px apart, opacity stepping in turn, 1.2s loop). When the snapshot arrives and the connector is online: the sentence becomes "Connected to your home" with a 44px tick glyph for 900ms, then Home. When the connector is offline: straight to Home, which carries the Not connected tip.
4. **First run with no connector** (`setupEmpty`): a sheet over the page, not a card: `.t2` "Let's connect your home", body "A small helper program on a computer or Raspberry Pi in your house links this app to your Lutron bridge. About ten minutes, once.", a 200px `--card` rounded square (radius 24) holding `picoArt` of a 5-button remote at 120px wide, primary "Show me how" (goes to Settings › Set up), ghost "Later".

### Home (root)

Header: `.t1` home name, status circle. Page, in order:

1. `.m-hero` with the light field behind items 2 and 3 (the field uses lamp colours now).
2. **Light now strip** (`lightNowHTML`): the headline in Body `--text-2` ("Kitchen and Outside are on"), then the row of lamp discs with room labels. Unchanged in behaviour. The All off button leaves this hero: it lives on the bar (section 7).
3. **Scenes** section: `.h2` "Scenes" with a plain link "See all" at the right that goes to the Scenes tab; the `.tiles` row (New scene first, then your scenes, Lutron's, favourites).
4. **Sleep timers**: each `.timerbar` becomes a `.card` row: the 40px ring with the disc inside, `.t` "Kitchen off in 12 min", `.d` "Sleep timer", a `.btn.sm` "Cancel".
5. **Coming up** (automations work): a `.card.pad0.list` titled by `.h2` "Coming up".
6. **Tips**: the sort-your-lights nudge and the not-connected notice are `.tip` cards.
7. **Rooms**: `.h2` "Rooms", the room cards, 8px apart.

### Remotes (root) and the remote page (nested)

- Root: `.t1` "Remotes"; a Body line "Press a button on any remote to open it here."; one `.card.pad0.list` with a row per remote: a 40px pico thumb (`picoArt` at 40 wide) in the icon slot, `.t` name, `.d` "Kitchen · 3 buttons set up" (or "Not set up yet"), a chevron. "Needs attention" is a second `.d` line in `--text`.
- Remote page: nested layout. The page starts with the **stage**: a 240px `--card` rounded square (radius 24) centred, `picoArt` interactive at 120px wide inside; under it `.t2` the remote's name centred, `.d` "Kitchen · 5-button remote" centred; `.btn.ghost` "Not your remote? Change the picture". Then `.h2` "Buttons" and the `.card.pad0.list` of button rows (glyph, title, the three gesture lines, chevron). Then the "may still do what the Lutron app set up" `details` as a `.tip` with a chevron, opening the same copy. The "usual layout" tip from `ux-flows.md` section 8 goes above the Buttons section.

### Scenes (root)

`.t1` "Scenes", a 40px `+` `.iconbtn` in the header. Sections "Your scenes", "From the Lutron app", "Room moods" (automations work), each one `.card.pad0.list`; the row's icon slot is a 40px `--card-2` circle with a play glyph (the run button), a star at the right, a pencil for yours. Empty state: a `.tip` "Set the lights the way you like them, then save that look" with a `+` circle.

### Settings (root)

`.t1` "Settings", status circle. In order:

1. **Connection tip**: `.tip` "Connected to your home" / `.d` "3 lights · 2 remotes · bridge at 192.168.1.91", the circle holds the `link` glyph. Not connected: "Not connected right now" with the three questions as `.d` lines. Never connected: "Not connected yet" / "Follow the steps below."
2. `.h2` "Your home": `.card.pad0.list`: "Home name" with the value at the right as an underline-less input; "Look for new lights" with a refresh glyph at the right (tap runs it); "Connector 0.5.1" with `.d` "Up to date" or "Update available: 0.6.0" and, when available, a `.btn.sm.primary` "Update"; "Update automatically" with a toggle.
3. `.h2` "Set up": the steps card as today, restyled: numbered circles 28px, `--card-2` ring, black when done; the `details` "Show me how" rows become plain rows with a chevron that rotates; the install line stays in a `.code` block on `--card-2`.
4. `.h2` "Night-time": `.card.pad0.list`: "Night starts" with a time input at the right; "Night ends"; "Night look" with the three chips on a second line. The automations work adds "When does the house go quiet?" here as a caption pointing at the Automations tab.
5. `.h2` "This app": "Add to your phone's home screen", "Recent activity", chevrons.
6. `.h2` "Advanced": a card with the two timing sliders (restyled sliders, captions "Quick / Relaxed" and "Short / Long"), the tester line, "Default brightness for on" as a row with a number input at the right; a "Light sets" card with an add row; "Back up settings" and "Restore settings…" as rows.
7. A last `.card.pad0.list` with one row "Sign out" and an `x` glyph at the right.

### The light detail sheet (dark)

`sheet.open(name, body, { dark: true })`. The Sonos now-playing view, for one light:

1. The stage: the lamp disc `.ld-disc` (160 to 240px by level, as today) centred in a 280px-tall stage, the vertical slider at the right as before.
2. `.t2` on dark, the light's name; `.d` on dark, "Kitchen · Accent".
3. `.display` the level, white, centred ("62%" or "On").
4. The mood row (unchanged component, dark variant: chips `--now-2`, selected `--on-dark` with `--now` text).
5. A row of three 56px round `--now-2` buttons with 13px labels under them: "Sleep timer" (clock), "Favourite" (star, filled black-on-white when on), "What kind" (the lamp kind sheet).

### The sleep-timer dial

Unchanged layout, on the light sheet: track `--line`, progress `--text`, knob `--knob` with the shadow. Chips and the primary pill as in section 5.

---

## 7. The Light now bar and the Now view

The bar is the app's now-playing bar. It is present on every root page once signed in and the snapshot has arrived, hidden on the login pages and on nested pages? No: nested pages keep it (Sonos keeps it under nested sheets). It sits 8px above the tab bar with 12px side margins, `--bar`, radius 20, padding 12px 16px 14px, z-index below `#sheet-root` so a modal scrim covers it.

```
#nowbar
  .nb-main (tap: opens the Now view)
    .nb-thumb  44px --bar-2 rounded square (radius 10) holding a 28px lamp disc at the house's mean lit level
               (or a bulb glyph in --on-dark-3 when everything is off)
    .nb-text   .cap "Home" (the home name)            12/16 500 --on-dark-2
               .t   "Kitchen and Outside are on"      16/20 600 --on-dark, one line, ellipsis
                    "Everything is off" / "Last known state" when offline
    .nb-off    40px --bar-2 circle, power glyph: the All off button.
               Tap: all lights off (the current alloff action). Hold 1s: also shades and fans, with the
               m-hold warm sweep drawn on the circle and Motion.allOff().
  .nb-level  (only while something is on)
    sun-low glyph 20px --on-dark-2 | .slider (dark) | the level number 15/20 500 --on-dark-2, 28px wide
```

The level slider is the house dimmer: dragging sends `{type:'level', target:[d:… every light that is on], level:v, fade:0}` with the same 120ms gate as a room slider, and the number follows the finger. The value shown is the mean level of the lights that are on. When a light changes elsewhere, `paintNowBar()` updates the thumb disc, the headline, the number and the slider (never while the thumb is held).

The bar appears with `Motion.pageIn` on the first render (a 16px rise) and its headline cross-fades on change (`Motion.textSwap` is a new 200ms hook: fade out, replace, fade in; no-op without GSAP).

### The Now view

Opened by tapping `.nb-main`; a dark modal sheet (`sheet.open('', body, { dark: true, full: true })`, full height, 28px corners, its own grabber). The Sonos full-screen now playing, for the house:

1. The artwork: a 240px `--now-2` rounded square (radius 16) centred, holding the lit rooms' lamp discs laid out in a loose cluster (`discSize` per room, at most six, the rest counted in the caption); when everything is off, one 96px off disc with the `moon` glyph.
2. `.t2` white centred: the headline ("Kitchen and Outside are on"); `.d` `--on-dark-2` centred: "5 lights · 62% on average" or "Everything is off".
3. The house slider row (the same control as the bar, 8px track here) with the level number at the right.
4. A row of round 56px `--now-2` buttons, 13px labels under: "All off" (power), "Night" (moon: runs the Night mood in every lit room), "Sleep timer" (clock: the dial for every light that is on), "Scenes" (scene glyph: closes and goes to the Scenes tab).
5. `.h2` on dark "Rooms", then one dark row per room (`--now-2` card, rows separated by `rgba(255,255,255,.08)`): lamp disc 36, name 16/22 500 white, `.lv` 13 `--on-dark-2`, a `.sw` on dark (off: `--on-dark-2` border and dot; on: `--on-dark` fill, `--now` knob). Tap the name to close the view and open that room card on Home.

---

## 8. Modal sheets

`#sheet-root .sheet`: `--sheet`, radius 28 top, max-height 92dvh, no shadow; the `--scrim` behind. Grabber 36x5 `#AEB4B8` at 8px. The header `.sh` is always the big kind: a 36px `--card` close circle at the top right (and a back circle at the top left when `back`), then `.t2` left with the sub line in Body `--text-2` under it, 24px top padding, 20px side padding, 8px bottom. The `question` option no longer changes anything and can be ignored. Body padding 4px 20px 24px plus the safe area. `.sfoot` sticky with the primary pill on `--sheet`, a `--line` hairline above.

`.dark` sheets (light detail, Now): `--now` surface, white text, `--on-dark-2` captions, cards `--now-2`, grabber `rgba(255,255,255,.35)`, close circle `--now-2` with a white glyph. `full: true` makes the sheet 100dvh with 28px corners only at the top and no scrim gap (Sonos's now playing).

Lists inside sheets: `.card.pad0.list` as on pages. The recipe list: each `.recipe` is a row in one grouped card (no separate white cards), the selected one shows a black 24px tick circle at the right and its title in 600 weight. The target picker's room rows: `.roomrow` is a `--card` card with the lamp disc, the name, "3 lights, the whole room", the expand chevron and a checkbox; the lights under it are rows in the same card.

Toast: black pill, 52px, white, radius 14, bottom is the bar's top plus 12px; error toast `--red`. Unchanged otherwise.

---

## 9. Motion, unchanged and two additions

Everything in `motion-spec.md` stands. Two additions:

- `Motion.textSwap(el, html)`: fade out 120ms, swap, fade in 200ms, `y` 4px. Used by the bar headline and the Light now headline.
- `Motion.barIn(el)`: the bar's first appearance, a 16px rise over 360ms, 120ms after the page.

The light field colours: `roomsForLight()` returns `color: lampColor(level)` per room. The haze is warm always; a room that is off contributes nothing, as today.

---

## 10. What changes in code (for the implementer)

- `index.html`: Inter instead of Noto Sans; `theme-color` `#F1F2F3`; the shell gains `#nowbar` between `main` and `nav`; `manifest.webmanifest` `background_color` and `theme_color` follow.
- `styles.css`: rewritten to sections 2 to 5 and 8. Class names stay so the JS keeps working, except: `.infoblock` (all variants) → `.tip`; `.pill` (connection) → `.iconbtn.status`; `.hero-disc` → `.stage`; `.remote-card` → a `.item` row; `.timerbar` → `.card` row; `.recipe` cards → rows; `.tile` face and label.
- `light.css`: retokened; the light detail on `.dark`; `--lamp-off`.
- `core.js`: `render()` draws the root or nested header, and the bar (`nowBarHTML`, `paintNowBar` called from `paintState`); `loginHTML` and the loading states per section 6; `sheet.open` takes `dark` and `full`; `roomsForLight` uses `lampColor`; `statusLine` feeds the bar; `connPill()` becomes `statusCircle()`.
- `home.js`: Home per section 6; the All off button and its hold move to the bar (the `pointerdown` handlers in `boot.js` target `[data-act="alloff"]`, which the bar's button carries).
- `remotes.js`: list rows and the nested page; `S.remote` sets `.nested`.
- `scenes.js`, `settings.js`: per section 6.
- `light.js`: the light sheet on `.dark`; the Now view (`openNowView`, `nowViewHTML`, `paintNow`); house slider logic shared by the bar and the view (`houseLevel()`, `setHouseLevel(v)`).
- `motion.js`: `textSwap`, `barIn`; the status dot classes move from `.pill .dot` to `.status .dot`.
- `sw.js`: bump VERSION to `v10`.
- The Playwright suite (`ui_test2.js`, `err_test.js`) must still print `errors: none`; selectors it relies on: `.room`, `.remote-card` (update to the new row), `.remote-hero .pico-svg` (update to `.stage .pico-svg`), `#sheet-root.in`, `[data-act=...]` names unchanged.
