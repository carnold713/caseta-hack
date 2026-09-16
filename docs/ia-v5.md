# Pico Hack: information architecture v5

The plan of record for the next pass. It does not change what the app can do, what it
looks like, or how it saves. It changes where things live, how many of them you see at
once, and how the bottom of the screen and the sheets feel.

Written against the app as it stands today (the polish pass, plus the Scenes tiles fix),
driven at 390x844 on a hub of my own with the fake connector and the fake Hue bridge
paired, five rooms, nine lights, two remotes, three scenes, three automations, moods in
two rooms and the evening wind-down on. Every number below was measured in that rig
unless it is named as a number the new design should hit.

**The one sentence.** Home becomes a list of rooms with the house on top, every room is a
page, every light is a page, the floating bar shrinks to a pill that only appears where
Home is not, and sheets snap to fixed stops instead of the fourteen different heights they have today.

---

## 0. What the owner said, and what this does about it

| the complaint | the answer |
|---|---|
| "It's still SO so so busy, so many options on every page" | Home goes from 88 tappable things (rooms open, the state the app remembers) to 21. The busiest screen in the app becomes a list of five rooms. |
| "I'm OK with information being deeper if it makes obvious sense what to click next" | Rooms and lights become pushed pages with one value per row and a chevron. Nothing is hidden behind a gesture. |
| "Adding a scene is nice, but it's OK to bury it deeper, and surface the scene a little higher up" | Running a scene stays one tap on Home. Making one moves two taps deeper, to a Scenes page that is no longer a tab. Four ways to make a scene become one. |
| "If I can change the RGB of a light, where would make the most sense?" | On the light's own page, one tap from the light's row, with the colour you can see on the row. The rainbow ring on the lamp row and the rainbow button on the light row both go. |
| "The bottom sheet feels a little off, weird spacing" | Two detents instead of eleven arbitrary heights, a fixed header block, 12px between header and content, footers only where there is a real primary action, "Done" top right on anything you are editing. |
| "The floating bar feels so close to the nav, everything is jumbled" | 172px of furniture at the bottom of every screen becomes 52px, and on Home it becomes zero, because the house controls move to the top of Home where they belong. |

---

## 1. The command inventory

Every action a person can take and every value they can change. "Taps" counts from a cold
launch, with the app open on Home; a tab switch counts as one tap. "Places" is every route
that reaches it today.

### Lights

| # | what it does | where it is today | taps | duplicated | how often |
|---|---|---|---|---|---|
| 1 | Turn one light on or off | Home lamp row (tap a disc) · a room's light row (the sun button) · the light's page (tap the big disc, or the switch on a non dimmer) · the Now view (room only) | 1 | yes, 3 places | daily |
| 2 | Set one light's brightness | the slider under a light's row in a room · the light's page (drag the disc, drag the well, the two chevron buttons) | 2 + drag | yes, 2 places | daily |
| 3 | Set a lamp's warmth (white tone) | the light's page, Warmth slider and the white swatches | 3 | no | weekly |
| 4 | Set a lamp's colour | the light's page, the swatch row · behind "More colours…", a hue strip and a saturation slider | 3 | no | weekly |
| 5 | Jump straight to colour | the rainbow button at the right of a light's row (opens the page scrolled to Colour) | 3 | yes, same destination as 4 | weekly |
| 6 | Say what kind of light it is | the light's page › More › Kind of light · the room's More › the light's row · the sort walk from the Next row or from Ideas | 4 to 5 | yes, 3 places | setup once |
| 7 | Say what a light is for (main, task, lamps, decor) | the room's More › What each light is for | 4 | partly (kind sets it too) | setup once |
| 8 | Star a light so it leads the row | the star in a light's row · Favourite on the light's page | 3 | yes, 2 places | rare |
| 9 | Sleep timer on one light | hold a lit lamp on Home · the light's page › Sleep timer | 1 hold | yes, 2 places | weekly |
| 10 | Cancel a running timer | the timer block on Home · the Now view's timer panel | 1 | yes, 2 places | weekly |
| 11 | Remove a light from the home | the light's page › More › Remove from my home › confirm | 6 | no | rare |
| 12 | Set a fan speed | the five chips under a fan's row in a room | 3 | no | weekly |
| 13 | Open, stop or close a shade | the three buttons under a shade's row in a room | 3 | no | weekly |

### Rooms

| # | what it does | where it is today | taps | duplicated | how often |
|---|---|---|---|---|---|
| 14 | Turn a whole room on or off | the switch on the room's card · the switch in the Now view's room list | 1 | yes, 2 places | daily |
| 15 | Open a room to see its lights | the room's chevron or its name · a room name in the Now view · a lamp's room (code path, not exposed) | 1 | yes, 2 places | daily |
| 16 | Run a room mood (Bright, Relax, Dinner, Movie, Night) | the mood chips in an open room · the small mood chips at the foot of a light's page · the Now view › Scenes › room moods · the Scenes tab › Room moods › a room · a remote button | 2 | yes, 4 places in the app | daily |
| 17 | Make the five moods for a room | the room's More › Make moods · the room's More › What each light is for · the Next row · the greeting · the Scenes tab › Room moods · a remote's "Room moods" way | 5 | yes, 5 places | setup once |
| 18 | Change one mood's levels | the Scenes tab › Room moods › a room › the pencil · the room's More › Moods › the pencil | 5 | yes, 2 places | rare |
| 19 | Put a changed mood back to the suggestion | the mood's editor › "Back to the suggestion" | 6 | no | rare |
| 20 | See what each light in a room is | the room's More › Kind of light list | 4 | yes, same as 6 | setup once |

### Scenes

| # | what it does | where it is today | taps | duplicated | how often |
|---|---|---|---|---|---|
| 21 | Run a scene | a chip in Home's scene row · a tile on the Scenes tab · a row in the Now view's Scenes panel · "Try it" in the scene editor · a remote button · an automation | 1 | yes, 3 places in the app | daily |
| 22 | Make a scene from the lights as they are | the "New scene" chip on Home · the "+" in the Scenes header · the "New scene" tile · the Now view › Scenes › the empty tip | 1 | yes, 4 places | setup once |
| 23 | Name a scene | the scene editor, the Name field | 3 | no | setup once |
| 24 | Choose which lights are in a scene | the scene editor › Add or remove lights | 4 | no | setup once |
| 25 | Set each light's level in a scene | the scene editor, one slider or switch or fan menu per light | 3 | no | setup once |
| 26 | Set a lamp's colour in a scene | the scene editor, the Colour row under that lamp | 4 | no (separate from 4) | setup once |
| 27 | Re use the lights as they are now | the scene editor › Use current levels | 3 | no | rare |
| 28 | Try a scene without leaving the editor | the scene editor › Try it · the Lutron scene sheet › Try it | 3 | yes, 2 places | setup once |
| 29 | How slowly a scene fades | the scene editor › More › Change gradually over | 5 | no | rare |
| 30 | Delete a scene | the scene editor › More › Delete this scene | 5 | no | rare |
| 31 | Show a scene first on Home | the scene editor › More › the star · the Lutron scene sheet › the star | 5 | yes, 2 places | rare |
| 32 | Read about a Lutron scene | the Scenes tab › the "···" on a Lutron tile | 3 | no | rare |

### Remotes

| # | what it does | where it is today | taps | duplicated | how often |
|---|---|---|---|---|---|
| 33 | Open a remote | the Remotes tab › a row · pressing a real button jumps to it · the Next row · the greeting | 2 | yes, 4 places | setup once |
| 34 | Choose a button | a key on the picture · a row in the Buttons list | 3 | yes, 2 places, same sheet | setup once |
| 35 | Choose a kind of press (press, press twice, hold) | the button sheet | 4 | no | setup once |
| 36 | Say what a press does (17 ready made ways) | the press sheet, five usual ways · "Show all ways" opens the other seventeen in place | 5 to 6 | no | setup once |
| 37 | Choose which lights a press controls | the press sheet › Which lights? › chips · "Specific lights…" opens the full picker | 6 | no | setup once |
| 38 | Make a press do something else at night | the press sheet › More › At night | 7 | no | rare |
| 39 | Fine tune a press (steps, fades, waits, timers) | the press sheet › More › Fine tune | 7 | no | rare |
| 40 | Clear a press | the press sheet › More › Clear this press | 7 | no | rare |
| 41 | Try what a press does | the press sheet › Try it now · the fine tune editor › Try it | 6 | yes, 2 places | setup once |
| 42 | Set a remote up the usual way | the offer at the top of a fresh remote · the remote's More › Start over with the usual layout | 3 | yes, 2 places | setup once |
| 43 | Change the picture of the remote (layout and colour) | the remote's More › Not your remote? | 5 | no | rare |
| 44 | Read why a remote may still do Lutron's thing | the remote's More › "It may still do what the Lutron app set up" | 5 | no | rare |
| 45 | Remove a remote from the home | the remote's More › Remove this remote › confirm | 6 | no | rare |
| 46 | Add a device without the Lutron app | Settings › Add a device (pick a kind, hold its button, name it, pick a room) | 7 | no | rare |

### Automations

| # | what it does | where it is today | taps | duplicated | how often |
|---|---|---|---|---|---|
| 47 | Set up Welcome lights | the Automations tab's empty rows · New automation › Welcome lights · the Next row · the greeting · Ideas | 3 | yes, 4 places | setup once |
| 48 | Set up a Wake up light | the same four routes | 3 | yes | setup once |
| 49 | Set up Goodnight and Leaving buttons | the same four routes | 3 | yes | setup once |
| 50 | Make any other automation | New automation › Something else (a five step walk) | 3 | no | setup once |
| 51 | Turn an automation on or off | the switch on its row | 2 | no | weekly |
| 52 | Open an automation | its row | 2 | no | weekly |
| 53 | Change when it runs (a clock time, or the sun with an offset) | its editor › When? | 4 | no | rare |
| 54 | Change when it goes off again | its editor › Then turn off again | 4 | no | rare |
| 55 | Change which lights | its editor › Which lights? › chips or the picker | 4 | no | rare |
| 56 | Change what happens (ten ready made ways) | its editor › What happens? | 4 | no | rare |
| 57 | Change which days | its editor › Which days? › the day chips or Every day / Weekdays / Weekends | 4 | no | rare |
| 58 | Skip it tonight or tomorrow | its editor › Skip · the Skip link on Home when it is due within the hour | 3 | yes, 2 places | weekly |
| 59 | Try it now | its editor › Try it now | 4 | no | rare |
| 60 | Rename it | its editor › More › Name | 5 | no | rare |
| 61 | Skip it when the lights are already on or off | its editor › More › Skip it when | 5 | no | rare |
| 62 | How slowly it fades | its editor › More › Change gradually over | 5 | no | rare |
| 63 | Fine tune it (several steps) | its editor › More › Fine tune | 5 | no | rare |
| 64 | Delete it | its editor › More › Delete this automation | 5 | no | rare |
| 65 | Give the home its rough location | the When sheet's sun step › Use my location · › Which city is nearest · the wind down caption's link | 5 | yes, 2 places | setup once |
| 66 | Choose which clock the lights follow | the time zone tip on the Automations tab | 2 | no | rare |
| 67 | Turn the evening wind down on or off | the switch on its row · the toggle inside its sheet | 2 | yes, 2 places | setup once |
| 68 | Set when the house goes quiet | the wind down sheet | 3 | no | rare |
| 69 | Change the wind down levels (early morning, start dimming, down to, at night, night ends) | the wind down sheet › Advanced | 4 | partly (night ends is also in Preferences) | rare |
| 70 | Gently lower untouched lights | the wind down sheet › Advanced › the toggle | 4 | no | rare |
| 71 | Draw the curve by the hour (add, remove and edit times) | the wind down sheet › Advanced › Curve by the hour | 5 | no | rare |

### The house

| # | what it does | where it is today | taps | duplicated | how often |
|---|---|---|---|---|---|
| 72 | Everything off | the power button on the bar · All off in the Now view · a remote's "Turn everything off" · Goodnight and Leaving | 1 | yes, 2 places in the app | daily |
| 73 | Everything off plus shades and fans | hold the power button on the bar or in the Now view | 1 hold | yes, 2 places | weekly |
| 74 | Bring the lights back (the house is dark) | the same power button | 1 | yes, 2 places | daily |
| 75 | Dim everything that is on | the slider on the bar · the slider in the Now view | 1 drag | yes, 2 places | daily |
| 76 | Night in every lit room | the Now view › Night | 2 | no | daily |
| 77 | A sleep timer over everything that is on | the Now view › Sleep timer › the dial › Start | 4 | no | weekly |
| 78 | Open the whole house view | tap the bar | 1 | no | daily |
| 79 | Choose what the power button does with the house dark | Settings › Preferences › the two chips | 3 | no | setup once |
| 80 | Set the night hours | Settings › Preferences · the wind down sheet (when the house goes quiet) · the wind down Advanced (night ends) | 3 | yes, 3 places for two values | setup once |
| 81 | Choose the night look | Settings › Preferences › Automatic, Always, Never | 3 | no | setup once |

### Settings and the app

| # | what it does | where it is today | taps | duplicated | how often |
|---|---|---|---|---|---|
| 82 | Name the home | Settings › Home name | 3 | no | setup once |
| 83 | Connect the home (the install line) | the first run tip · Settings › the connection card › Show me how | 3 | yes, 2 places | setup once |
| 84 | See whether the home is connected | the dot on the status circle (every page) · the card at the top of Settings | 0 | yes | daily glance |
| 85 | Update the connector | Settings › More settings › Update | 3 | no | rare |
| 86 | Let the connector update itself | Settings › More settings › the toggle | 3 | no | setup once |
| 87 | Look for new lights | Settings › Look for new lights | 2 | no | rare |
| 88 | Connect, inspect or forget a Hue bridge | Settings › Connect a Hue bridge / Hue bridge | 2 | no | setup once |
| 89 | How fast a double press is, how long a hold is | Settings › More settings › the two sliders and the live tester | 3 | no | rare |
| 90 | Default brightness for "on" | Settings › More settings › the number field | 3 | no | rare |
| 91 | Hand picked light sets | Settings › More settings › Light sets (new, rename, tick lights, delete) | 4 | no | rare |
| 92 | Back up and restore the settings | Settings › More settings › the two rows | 3 | no | rare |
| 93 | Add the app to the home screen | Settings › Add to your home screen · the Next row when it applies | 2 | yes, 2 places | setup once |
| 94 | Recent activity | Settings › Recent activity | 2 | no | rare |
| 95 | Ideas for your home | Settings › Ideas for your home · the Next row is the same list, one at a time | 2 | yes | rare |
| 96 | Dismiss a suggestion | "Not now" on the Next row | 1 | no | rare |
| 97 | Sign out | Settings › Sign out | 2 | no | rare |

**Ninety seven commands. Thirty one of them can be reached from more than one place, and
five of those (run a mood, run a scene, make a scene, make moods, set a remote up the
usual way) have four or more doors.** That is the busyness: not the number of features, the
number of doors into each one.

Two odd ones found while reading: `settings.room_colors` and the whole `ROOM_PALETTE` are
read by the code and have no interface at all (dead), and the light's role can be set two
ways that disagree (the kind picker writes a role, and the roles sheet overwrites it).

---

## 2. The verdict: one home for each command

The rule used throughout: **the place a thing lives is the place that owns the object it
changes.** A light's values live on the light's page. A room's values live on the room's
page. The house's values live at the top of Home. Anything that is "what my home does by
itself" lives on the Automations tab. Anything that is about the app rather than the home
lives in Settings. A shortcut is justified only when the command is daily and the shortcut
costs one row or one chip.

### Lights

- **On and off, and brightness.** Home: **one home, the room page's light row.** The row
  carries the name, the value ("62%", "Off"), a switch at the right and a chevron. The
  disc becomes a picture, not a control. The inline slider is deleted from the row; its
  replacement is the light page, one tap away, which is a better dimmer than a 40px well
  in a list. Path: **Home › Kitchen › Kitchen Cans**, then drag the disc.
  Shortcut kept: the switch on the row (daily, one control). Shortcut kept: the lamp
  row on Home for the starred lights only (see the Home layout). Deleted: the sun button
  on the row, the Now view's copy.
- **Colour and warmth.** Home: **the light's page, in one section called Colour.** It is
  the second thing on the page, under the dimmer. Path: **Home › Office › Desk lamp ›
  Colour › a swatch**, four taps, every one of them a labelled row. Deleted: the rainbow
  button at the right of the row, the rainbow ring on the Home lamp row, and the scroll
  jump that lands on a chopped stage. What replaces them: the light's row shows a **colour
  dot** as its value ("Red", "Warm white"), which is both the sign that the lamp has colour
  and the thing you tap. The owner asked "is it obvious?" A row that says `Desk lamp ·
  Red ›` is obvious; a rainbow ring that toggles the lamp is not.
- **Kind of light, and what a light is for.** One home: **the room page › Room setup**, a
  single page with "What each light is for" and one row per light for its kind. The light
  page's More keeps a "Kind of light" row because that is where you are when you wonder;
  it opens the same picker. Deleted: nothing. The sort walk stays as a suggestion from the
  Next row, because it is a first run thing.
- **Star.** One home: **the light's page**, as "Show first on Home". Deleted from the row.
  Starring is a rare act with a daily effect; it does not deserve a control on every row.
- **Sleep timer.** One home: **the light's page › Sleep timer.** Shortcut kept: hold a lamp
  on Home's starred row (already taught by a caption). The house wide timer moves to
  Home's house card menu.
- **Remove a light.** One home: **the light's page › More › Remove from my home.** Red, at
  the bottom, with the confirm sheet it already has.
- **Fans and shades.** One home: **the room page's row for that device**, where the speed
  chips and the open/stop/close buttons already are. No change except that they sit on a
  page instead of inside a card inside Home.

### Rooms

- **Open a room.** One home: **the room's row on Home pushes the room page.** The card no
  longer expands. This is the single change that empties Home.
- **Room on and off.** One home: the switch on the room's row on Home. Kept on the room
  page as a switch in the nav bar's right slot.
- **Moods.** One home: **the room page, a chip row directly under the title.** Deleted: the
  mood chips at the foot of the light page (they belong to the room, not the light), and
  the "room moods" block in the Now view (the Now view is going). Kept: the Scenes page's
  "Room moods" list, because that is where someone goes to *edit* a mood, and a remote's
  mood ways, because that is a different object (a button).
- **Make moods, and what each light is for.** One home: **room page › Room setup.** Path:
  **Home › Kitchen › Room setup › What each light is for › Make the moods.** Deleted: the
  duplicate "Make moods" row that sat beside it, the Scenes page route into making them
  (that list only edits existing ones now, and its empty state points at the room page).
  Kept: the Next row suggestion, which is how most people will find it.
- **Edit one mood.** One home: **Scenes page › Room moods › a room › a mood.** It opens the
  scene editor, which is right: a mood is a scene. Deleted: the second route through the
  room's More.

### Scenes: the owner's example, answered

- **Run a scene.** One home, and it is the shallowest thing in the app: **the scene row on
  Home**, one tap, right under the house card. Shortcut kept: a remote button, an
  automation. Deleted: the Now view's scene panel.
- **Make a scene.** One home: **Home › Scenes (See all) › "+"**, three taps. Deleted: the
  "New scene" chip in Home's scene row, the "New scene" tile in the grid, and the empty
  tip in the Now view. The empty state of the Scenes page keeps one big primary button,
  because an empty grid needs to say what to do. So: **one "+" when you have scenes, one
  button when you do not.**
  This is exactly what the owner asked for: the making is buried a level, the running is
  surfaced on Home.
- **Everything else about a scene** (name, lights, levels, colour per lamp, fade, delete,
  star, try) has one home already: **the scene editor**, reached from the Scenes page by
  turning on Edit and tapping a tile. The editor gets "Done" in its top right and the
  three rare things (fade, star, delete) stay behind its More.

### Remotes

Remotes is the part of the app that is already right, and the audits agree. Two changes
only:

- **The usual layout offer** becomes the fresh remote's empty state (one primary button
  under the picture) instead of a tip card with two buttons floating above the list. The
  "Start over" copy stays under More for a remote that is already set up.
- **"Show all ways"** stops expanding the list in place (five rows become twenty two under
  your finger) and **pushes a second sheet** titled "All ways", grouped, with a back arrow.
  The five usual ways plus "More ways ›" is what you see at rest.

Everything else keeps its home: a press's lights, its night version, its fine tuning and
its clearing all live under the press, which is the object being changed.

### Automations

- **Making one.** One home: the **"+" in the Automations nav bar**, which opens the four
  choices (Welcome lights, Wake up light, Goodnight and Leaving, Something else). Deleted:
  the "New automation" row at the foot of the list (the "+" replaces it). Kept: the same
  four rows as the tab's empty state, and the Next row's suggestions, which are the best
  onboarding the app has.
- **Everything about one automation** lives in its editor, which is right today. The only
  move: **"Skip tonight" leaves the editor's body and becomes a swipe action on the row**,
  because it is the one weekly thing in a page of setup once things. The editor keeps it
  too (it is the same one control, and a swipe needs a visible twin).
- **The evening wind down** stays on the Automations tab as one row with a switch under a
  header that says EVENING. Its levels stay behind Advanced. One move: **"Night ends" and
  "When the house goes quiet" stop being editable in three places.** They belong to the
  house, so they live in **Settings › Night**, and the wind down sheet shows them as a
  value row that opens that same small sheet.
- **Location** has one home: **Settings › Night** is wrong for it, so it goes in
  **Settings › Your home › Where the home is**, and the When sheet's sun step keeps its
  inline "Use my location" as a shortcut, because that is the moment the app needs it.

### The house

- **All off, bring the lights back, the house dimmer, Night, a house wide timer.** One
  home: **the house card at the top of Home.** The power button and the dimmer are on the
  card; Night and the house timer are in the card's "···" menu, together with "Everything
  off, and close the shades" which is today's hidden hold (the hold still works).
- **The Now view is deleted.** Everything in it exists on Home once the house card is
  there: the headline, the big number, the dimmer, All off, Night, Sleep timer, Scenes and
  the room list. Keeping both is what makes the app feel like it is repeating itself, and
  it is the reason the bar exists at all.
- **The bar** becomes a pill that only shows where Home is not (section 4).

### Settings

One home each, in five groups, with sub pages for the rare things. The nested "More
settings" page goes; what was on it is split by subject, so nothing is two hops deep for
no reason. Connector, version, update and "how your home connects" collapse into one row
at the top: **"Your home · Connected"**.

---

## 3. The structure

### The tab bar

**Four tabs, was five.** 52px tall plus the safe area, `--bg`, a 1px `--line` top edge,
24px outline icons, 12/16 labels, the active pill behind the icon exactly as today.

| tab | what it is for, in one sentence | what is NOT in it |
|---|---|---|
| **Home** | Control the house and its rooms right now. | Anything you set up once. No scene editor, no kinds, no moods setup. |
| **Remotes** | Say what the buttons on the wall do. | Nothing about the app, nothing about time. |
| **Automations** | Say what the home does by itself. | Remote buttons (they are Remotes), the night look (that is Settings). |
| **Settings** | The home's name, the connection, the app. | Anything you use daily. |

**Scenes leaves the tab bar.** It becomes a page pushed from Home, the way the iOS Home
app keeps scenes on the home screen and nowhere else. Running a scene is one tap on Home;
everything else about scenes is two taps away, which is the owner's own instruction.

### Home

iOS pattern: **a large title over a grouped inset list**, with one non list card at the
top. This is Settings' own shape, and the iOS Home app's shape.

```
[ large title "Home", 24/28 700, collapses to a 44px bar on scroll ]   [ connection dot ]

┌ house card ───────────────────────────────────────────┐   at rest
│ Kitchen, Office and 1 more are on         20/24 500   │   3 controls
│ 3 lights · 65%                            14/16 grey  │
│ [========== dimmer well 40px ==========]              │
│ [ ⏻ ]  All off                                [ ··· ] │
└───────────────────────────────────────────────────────┘

SCENES                                            See all ›
[ Dinner ] [ Movie ] [ Movie night ]      one scrolling row

ROOMS
┌───────────────────────────────────────────────────────┐
│ ● Bedroom      2 lights · all off          ›  ( o )   │
│ ● Hall         1 light · all off           ›  ( o )   │
│ ● Kitchen      1 of 2 on · 40%             ›  ( O )   │
│ ● Office       1 of 3 on · 55%             ›  ( O )   │
│ ● Outside      on                          ›  ( O )   │
└───────────────────────────────────────────────────────┘

[ one row of advice, or nothing ]
```

- At rest: **19 controls** (was 26 in the first screen, 33 on the page with rooms closed,
  **88 with the rooms open**, which is the state the app remembers between visits).
- One tap deeper: a room page, the Scenes page, a scene (run), the house menu.
- Two taps deeper: a light page, a mood, the room setup page.
- The starred lamp row: kept, but **only for starred lights**, and only when there is at
  least one. Today it prints every light in the house (nine discs, horizontally scrolling,
  names truncated). Starred lights are the ones a person actually wants at the top; an
  unstarred home shows no row at all and Home starts with the rooms.
- Why a card and not a list for the house: it is one object with a continuous value, and
  iOS gives those a card (the Now Playing card, the Home app's status strip).

### The room page (new, pushed)

iOS pattern: **a pushed detail view with a large title, one grouped inset list, and a
right aligned control in the nav bar.**

```
‹ Home          [ large title "Kitchen" ]            ( O )   room switch

MOODS
[ Bright ] [ Relax ] [ Dinner ] [ Movie ] [ Night ]     one scrolling row

LIGHTS
┌───────────────────────────────────────────────────────┐
│ ● Kitchen Cans        40%                  ›  ( O )   │
│ ● Island Pendants     Off                  ›  ( o )   │
│ ● Fan                 Medium               ›  ( O )   │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ Room setup                                        ›   │
└───────────────────────────────────────────────────────┘
```

- At rest: **12 controls** for a three light room (chips 5, rows 3, switches 3, setup 1),
  against the 14 that the same room adds to Home today on top of Home's own 33.
- One tap deeper: a light page, a mood, room setup.
- Two taps deeper: a light's colour, a light's kind, the moods maker.
- Swipe left on a light row: "Turn off" (or "Turn on"). Swipe is the iOS way to reach the
  second most likely action without printing a button on every row.
- Empty state, a room with no moods yet: one row in place of the chips, "Give this room
  moods · Bright, Relax, Dinner, Movie and Night ›".

### Room setup (pushed from the room page)

iOS pattern: **a grouped list of settings, one value per row.**

```
‹ Kitchen       [ "Kitchen setup" ]

WHAT EACH LIGHT IS FOR
┌ Kitchen Cans          Main           › ┐
│ Island Pendants       Task           › │
└ Fan                   Not set        › ┘

MOODS
┌ The five moods                       › ┐   (edit them)
└ Make them again from what they are   › ┘

KIND OF LIGHT
┌ Kitchen Cans   Ceiling downlights    › ┐
└ Island Pendants  Ceiling pendant     › ┘
```

At rest: **7 controls**. Today the same content is a sheet with a "Moods" row, a "What
each light is for" row and a kind list, and two of its three rows dead end with no way
back (finding N4 in the UX audit); as a page, back is the nav bar and the bug cannot exist.

### The light page (a sheet, medium detent)

iOS pattern: **a sheet with two detents and a grabber.** Medium at rest, large when you
drag it up or open Colour.

```
              ▁▁▁▁  grabber
 Ceiling                                         Done
 Office · Ceiling downlights · Main

        ( big disc )        [ well ]
                            [ ∨ ] [ ∧ ]
                  Off

 Colour                      Warm white  ●   ›      one row, medium
 ─────────────────────────────────────────────
 [ swatches ][ More colours… ]                      large only

 ( Sleep timer )  ( Show first )  ( More )
```

- At rest, medium: **7 controls** (disc, well, two steps, colour row, and two of the three
  round buttons in view). Today: 8 controls in a 704 to 776px sheet with the round buttons
  under the fold and a warmth slider always printed.
- One tap deeper: the swatches, the sleep timer dial, More.
- Two taps deeper: the hue strip, the kind picker, remove.
- Deleted from this sheet: the room's mood chips at the foot.

### The Scenes page (pushed from Home)

iOS pattern: **a collection view with a nav bar "+" and an Edit affordance beside the
section header.**

```
‹ Home          [ "Scenes" ]                             +

SCENES                                                Edit
[ Dinner ]  [ Movie ]  [ Movie night ]                tiles

ROOM MOODS
┌ Bedroom     5 moods    › ┐
└ Kitchen     5 moods    › ┘
```

- At rest: **8 controls** (3 tiles, +, Edit, 2 rows, back). Today the tab shows 11, with
  two ways to create and a pencil on every tile.
- Edit turns on the pencils; a tap on a tile in Edit mode opens the editor; Done turns it
  off. At rest a tile has one job: run the scene.
- Empty state: one line that says what to do ("Set your lights the way you like them, then
  save that look") and one primary button, "New scene".

### Remotes, and a remote

Unchanged in structure; it is the best part of the app already. Remotes at rest: **3
controls**. A remote at rest: **12** (was 14: the two buttoned offer card becomes one
primary in the empty state).

### Automations

iOS pattern: **a grouped list with a nav bar "+", swipe actions on rows, and an empty
state that says what to do.**

```
‹              [ large title "Automations" ]              +
Next: Welcome lights off at 3pm

YOUR AUTOMATIONS
┌ Porch on          On at dusk, off at 11pm   ›  ( O ) ┐
└ Bedside Lamp rises  Weekdays at 7:15am      ›  ( O ) ┘

EVENING
┌ Evening wind-down   Quiet from 10pm         ›  ( O ) ┘
```

At rest: **9 controls** (was 10, plus a time zone tip when it applies). Swipe a row for
"Skip tonight" and, in red, "Delete". Empty state: the four choices under one line, no
card above them repeating the promise.

### Settings

iOS pattern: **the Settings app itself.** One page, grouped, one value per row, red at the
bottom.

```
┌ Your home            Connected  ●        › ┐    connection, connector, update, install line

YOUR HOME
┌ Home name            Home               › ┐
│ Rooms and lights                        › │    add a device, look again, Hue bridge
│ Where the home is    Portland           › │
└ Light sets           2 sets             › ┘

THE HOUSE
┌ Power button      What was on before    › ┐
│ Night             10pm to 6:30am        › │    hours and the night look
└ Brightness for "on"            70%      › ┘

THIS APP
┌ Add to your home screen                 › ┐
│ Recent activity                         › │
└ Ideas for your home                     › ┘

ADVANCED
┌ Remote timing                           › ┐    double press, hold, the live tester
└ Back up and restore                     › ┘

┌ Sign out                                  ┐    red text, last
```

At rest: **13 rows on one page**, against 11 rows over 1.6 screens plus an 11 row "More
settings" page today (22 in two places). Everything rare has its own short page, and
nothing needs the word "more".

### Controls visible at rest, before and after

Measured before; the after column is what the new design should hit. "At rest" is what a person sees before scrolling
and before tapping anything, not counting the tab bar.

| screen | before | after | note |
|---|---|---|---|
| Home, rooms closed | 26 | **19** | the house card replaces the bar |
| Home, as the app remembers it (rooms open) | **88 on the page, 32 in view** | **19** | the biggest single win |
| A room (inside Home today, a page after) | 14 on top of Home's 33 | **12 on their own page** | same controls, alone |
| Light page, a Hue lamp | 8 in a 704px sheet | **7 in a 473px sheet** | warmth and swatches one tap deeper |
| Room setup | 5 in a sheet that dead ends | **7 on a page** | it gains the kinds it used to hide |
| Scenes | 11 (a tab) | **8 (a page)** | one way to create, not four |
| Scene editor | 9 | 8 | Done moves to the top right |
| Remotes | 3 | 3 | already right |
| A remote | 14 | **12** | the offer becomes one primary |
| The press sheet | 10, or 23 with "Show all ways" | **10, never 23** | all ways is a pushed sheet |
| Automations | 10 | **9** | the "+" replaces the new row |
| An automation | 10 | 9 | skip moves to a swipe, Done to the top |
| Settings | 11 over 1.6 screens, plus 11 on More settings | **13 on one screen** | two pages become one |
| The Now view | 16 | **0, deleted** | its contents are on Home |
| The bottom furniture, every screen | 3 on the bar, always | **2, and only where Home is not** | section 4 |

---

## 4. The bottom of the screen

Measured today at 390x844: the floating bar is **108px tall**, sits **64px** from the
bottom with 12px side margins, and the tab bar is **57px**. The gap between them is
**7px**. Together they take **172px, twenty per cent of the screen**, on every page,
forever, and on Home they cover the scene row. The bar also repeats what Home already
says: the bar reads "3 rooms are on" while Home's own headline reads "Kitchen, Office and
1 more are on", and tapping it opens a view that repeats Home a third time.

**The decision: the bar becomes a compact pill, and only where Home is not.**

- **On Home there is no pill at all.** The house controls live in the house card at the
  top of the page, which is where a person looks first anyway. Nothing floats.
- **On Remotes, Automations and Settings** a pill appears, and only when something is lit.
- **The Now view is deleted.** Tapping the pill goes to Home.

### Numbers

| thing | value |
|---|---|
| Tab bar height | 52px content, plus `env(safe-area-inset-bottom)`; `--bg`, 1px `--line` top edge |
| Tab item | 24px icon, 2px gap, 12/16 label, active pill 40x24 radius 12 `--blue-10` |
| Pill height | 44px |
| Pill radius | 22px |
| Pill width | hugs its content, min 160px, max 280px, centred |
| Pill contents | a 28px lamp disc at the house's mean level, "3 rooms are on" 14/16 500, a 32px blue power button, 12px gaps, 8px left padding, 6px right |
| Pill surface | `--surface`, `--shadow-3` (not `--shadow-5`: it is smaller and lighter than a sheet) |
| Gap, pill to tab bar | 8px |
| Pill bottom | `calc(52px + env(safe-area-inset-bottom) + 8px)` |
| Bottom furniture total | **52 + 8 + 44 = 104px where the pill shows, 52px where it does not**, against 172px everywhere today |
| Page bottom padding | `calc(52px + env(safe-area-inset-bottom) + 24px)` on Home, plus 52px more where the pill shows |
| Toast bottom | `calc(52px + env(safe-area-inset-bottom) + 12px)`, plus 52px when the pill shows; transitions over 255ms as it does now |

### Behaviour

- **Nothing on:** no pill. The tab bar alone. Turning the house on from a non Home tab is
  not a thing anyone does; Home is one tap away and it has the dimmer and the power button.
- **Scrolling:** the pill hides on a downward scroll of more than 24px (`translateY(64px)`,
  opacity 0, 200ms `var(--ease)`) and comes back on any upward scroll or when the scroll
  stops, the iOS toolbar rule. The tab bar never moves.
- **A sheet is open:** the pill is hidden outright (opacity 0, `pointer-events: none`), so
  nothing sits under the scrim pretending to be tappable, and the toast goes back to
  measuring against the sheet's footer as it does now.
- **A timer is running:** the pill's disc carries the small clock badge it already has, in
  `--blue` rather than the alert red the design audit flagged.
- **Long press on the pill's power button:** still everything off plus shades and fans,
  with the sweep drawn as a 3px `--blue-20` ring around the button rather than a background
  image, which is what regressed in the last pass.

### What this costs

The house dimmer stops being reachable in one gesture from the Remotes and Automations
tabs. That is the trade, and it is worth it: those tabs are setup surfaces, Home is one
tap away, and the pill still turns everything off from anywhere.

---

## 5. The sheet

### Measured today, at 390x844

| thing | now |
|---|---|
| Corner radius | 12px, top corners |
| Grabber | 36x4, `--line-2`, 8px from the sheet's top, no space under it |
| Header padding | 24px 24px 8px |
| Header height | 48px with no title, 56px with a title, **80px with a title and a sub line** |
| Title | 20/24 500, its top 36px from the sheet's top |
| Sub line | 16/20 `--text-2`, 4px under the title |
| Gap, header to content | **4px** |
| Content padding | 4px 24px 24px |
| Footer | 89px tall, padding 16px 24px, full bleed, 1px `--line` above, sticky at the bottom |
| Heights in the app | **271, 256, 314, 434, 473, 476, 523, 554, 688, 690, 704, 726, 757, 776**: fourteen different heights, none of them the same as another |
| Open | `translateY(100%)` to 0 over 300ms `cubic-bezier(0.4,0.12,0.3,1)`, settled at about 240ms |
| Scrim | `rgba(38,38,38,0.4)`, 255ms |

That list of heights is the "weird spacing". Nothing lands anywhere twice, a short sheet
can be 256px and the next one 476px, and the Now view is a fixed 726px with its content
ending at 368px, so more than half of it is white.

### The specification

**Detents. Three, and a sheet is never between them.**

| detent | height | when |
|---|---|---|
| **Compact** | its own content, minimum 180px, maximum 40dvh (338px at 844) | a sheet that asks one short question or shows one short list |
| **Medium** | **56dvh (473px at 844)** | a sheet that shows one object you act on, or one step of a walk |
| **Large** | **92dvh (776px at 844)** | a list you scroll, an editor, a picker, anything taller than medium |

- A sheet that opens medium can be dragged to large and back; the drag snaps, 260ms.
- A compact sheet cannot be dragged up, only down to close.
- A large sheet cannot be dragged to medium, only down to close. Two stops, never three,
  in one sheet.
- The Now view's fixed 86dvh disappears with the Now view.

**Which sheet is which**

| sheet | detent |
|---|---|
| A light | medium, large when Colour is open |
| A light's More, remove confirm, the home's name, a button's three presses, "which mood", the greeting | compact |
| A sleep timer dial | medium |
| Any walk step (connect, Something else, Welcome lights, Wake up, Goodnight, the roles sheet) | **medium, every step, so the card never changes height inside one flow** |
| The press sheet, all ways, the lights picker, the fine tune editor, the scene editor, the automation editor, the curve, activity | large |
| Preferences, wind down, wind down advanced, the kind picker, the city picker | medium |

**Spacing, top to bottom**

| part | value |
|---|---|
| Corner radius | 12px top corners (Tenzing's largest surface radius; unchanged) |
| Grab zone | 20px tall. The grabber is 36x5, radius 2.5, `--line-2`, 8px from the top |
| Header padding | 8px 20px 12px (under the grab zone) |
| Title | 20/24 500 `--text`, its top **28px** from the sheet's top |
| Sub line | **14/16 400 `--text-2`**, 2px under the title (it is 16/20 today, which competes with the title) |
| Header height | **64px** with a title, **82px** with a title and a sub line, 52px with neither |
| Close or Done | a 40px target, 12px from the right edge, vertically centred on the title |
| Back | the same, on the left; the title and the sub line then inset 44px |
| Hairline under the header | appears only when the body is scrolled, as today |
| Gap, header to content | **12px** (was 4) |
| Content padding | 0 20px 20px (was 4px 24px 24px). The 20px gutter lets an inset card carry 350px of row at 390 |
| Content bottom, no footer | `calc(20px + env(safe-area-inset-bottom))` |
| Footer | padding 12px 20px `calc(12px + env(safe-area-inset-bottom))`, one 50px primary, height **74px** plus the safe area (was 89), 1px `--line` above, sticky at the bottom |
| Gap, last content to the footer | 16px |
| Gap above the home indicator | 12px inside the footer, 20px in a body with no footer, both plus the inset |
| Scrim | `rgba(38,38,38,0.4)`, in over 255ms, out over 200ms |

**Footers and Done**

- A sheet gets a sticky footer **only when it has a real primary action**: Next, Start,
  Connect, Use this time, Done in a picker where the selection count matters.
- **Anything you are editing puts "Done" in the top right** and has no footer: the scene
  editor, the automation editor, a light set, the home's name. This is the iOS rule the
  owner asked for, and it also removes most of the "toast lands on the primary button"
  problem the UX audit found, because most sheets stop having a button at the bottom.
- A compact sheet with nothing to confirm has no footer and no primary, only the X.

**Motion**

| moment | value |
|---|---|
| Open | `translateY(100%)` to 0, **320ms** `var(--ease)`; the scrim fades over 255ms |
| Close | 220ms, the scrim over 200ms |
| Detent change (drag or a step that needs more room) | height over **260ms** `var(--ease)` |
| Step swap inside one sheet | the content crossfades over 120ms behind the existing ghost, and **the height does not move unless the detent changes**. The title stays where it is |
| Swipe down | unchanged in feel: the sheet follows the finger, a flick over 0.55px/ms or a drag past 30% of its height closes it, otherwise it springs back with no overshoot over 350ms. New: from large, a downward flick that does not close snaps to medium when the sheet has both |

**Before and after, the same sheets**

| sheet | before | after |
|---|---|---|
| A Hue light | 704 to 776px, whatever the content made | 473 medium, 776 large |
| A light's More | 256 | 256 compact (unchanged, and now the documented rule) |
| The Now view | 726 fixed, 60% white | deleted |
| A room's More | 476, dead ends on two rows | a page, no sheet |
| The press sheet | 688 | 776 large |
| The button sheet | 314 | 314 compact |
| The scene editor | 776 with a Done button in a 89px footer | 776 large, Done in the header, no footer |
| The automation editor | 757 | 776 large, Done in the header |
| Preferences | 554 | 473 medium |
| The home's name | 271 with an 89px footer | about 200 compact, Done in the header |
| A walk step | 434, then 523, then 397, then 523 | 473 at every step |

---

## 6. The move list

Six stages. Each ships on its own and leaves the app whole. Files and functions are named
as they stand today; another agent is editing `web/` in parallel, so re read before quoting
a line number.

### Stage 1: the bottom of the screen, and the sheet (highest value, lowest risk)

1. **The pill replaces the bar.** `core.js` `nowBarHTML()`, `paintNowBar()`, `barCaption()`
   and the `#nowbar` branch of `render()`; `styles.css` `#nowbar`, `#toast`, `#nav`.
   The bar's markup shrinks to the pill; `render()` shows it only when
   `S.view !== 'home'` and `litLights().length`. Keep `houseLevel`, `setHouseLevel`,
   `powerButton`, `powerLabel`, `powerTitle`, `Motion.barIn`, `Motion.textSwap`.
   *Risk: low. `power_test.js` clicks `[data-act="alloff"]` from Home; it will have to
   click the house card's button instead.*
2. **The house card.** New `houseCardHTML()` in `light.js` beside `nowMainHTML()`, called
   from `home.js` `VIEWS.home.body()` as the first block. It reuses `lightNowHeadline`,
   `nowSub`, the house well markup and `nowActionsHTML`'s power button. The "···" opens a
   compact sheet with Night (`now-night`), Sleep timer (`now-panel` becomes
   `sleepDialSheet` over `litLights()`), and "Everything off, and close the shades".
   *Risk: medium. It is new markup on the busiest page; the light field sits behind it.*
3. **Delete the Now view.** `light.js` `openNowView`, `nowViewHTML`, `nowMainHTML`,
   `nowPanelHTML`, `nowShow`, `NOW_TITLE`, `nowActionsHTML`, `nowTimerKey`, `paintNow`,
   and the `now-open` / `now-panel` / `now-room` cases. Keep `nowTimer`, `nowRingHTML`,
   `timerTotal`, `minutesLeft`.
   *Risk: medium. `now_test.js` is entirely about this view and will need rewriting
   against the house card. `paintNow()` is called from `paintLight()` and from the
   `timers` websocket case in `core.js`; both call sites go.*
4. **The sheet spec.** `styles.css` `.sheet`, `.sheet .grab`, `.sh`, `.sb`, `.sfoot`,
   `.sheet.walk`, `.sheet.full`; `core.js` `sheet.open/morph/header`. Add a `detent`
   option (`compact | medium | large`) that sets a height class, and make `sheet.morph`
   keep the height unless the detent changes. Add a `done` option to `sheet.header` that
   draws "Done" where the X is.
   *Risk: medium. Every sheet in the app is laid out by these rules. `polish_test.js`
   measures sheet heights in five places ("no squeezed sheets", "a Now panel keeps the
   card height") and will need new expected values.*
5. **Swipe knows the detents.** `swipe.js` gains the medium stop: a release between the
   two snaps to the nearer one.

### Stage 2: Home becomes a list of rooms

6. **The room page.** New `VIEWS.room` (nested, keyed on `S.room` the way `S.remote`
   works) in a new `web/js/room.js`, taking `moodRowHTML` (light.js), `lightRow` and
   `roomMoreSheet` (home.js). `home.js` `roomCard()` becomes `roomRow()`: disc, name,
   summary, chevron, switch. `toggleRoom`, `openRoomCard`, `easeScrollTo` and
   `Motion.expand` retire; `localStorage.openRooms` is no longer written.
   *Risk: high, this is the big one. `fav_test.js`, `slide_test.js`, `hscroll_test.js`,
   `kinds_test.js`, `hue_test.js` and `polish_test.js` all click
   `.room[data-room] .chev` or read `.room .light`. Keep the class names `.room`,
   `.light`, `.lrow` on the new page so most selectors survive.*
7. **The light row loses four controls.** In the new `lightRow`: delete `.act`, the star,
   the rainbow button and the inline `.sliderwrap`; add a `.sw` at the right and a value
   in the row. The colour dot becomes the row's value for a lamp that has colour.
   *Risk: medium. `slide.js`'s gesture gate exists because sliders sat in a scrolling list;
   with the sliders gone from rows it only has to serve the sheets, which is simpler. This
   is also what fixes the missing pressed state on light rows (finding N7).*
8. **Room setup.** `roomMoreSheet` becomes a page; its two dead ending rows (finding N4)
   stop existing because back is the nav bar.
9. **Swipe actions on rows.** A new `web/js/rowswipe.js` for light rows ("Turn off"),
   room rows ("All off") and automation rows ("Skip tonight", "Delete" in red). It must
   not fight `slide.js`; it no longer can, because rows have no sliders.
   *Risk: medium, it is a new gesture layer.*

### Stage 3: scenes off the tab bar

10. **Four tabs.** `index.html` `#nav`, `core.js` `render()`'s nav loop, `boot.js`'s nav
    listener. `VIEWS.scenes` gets `nested()` and is reached by `data-act="scenes-open"`
    from Home's "See all".
11. **One way to make a scene.** `home.js` `sceneRowHTML()` drops the "New scene" chip and
    keeps "See all ›". `scenes.js` `VIEWS.scenes.body()` drops the "New scene" tile, moves
    `scene-new` to a nav bar "+", and adds the Edit affordance beside the section header
    (a new `S.scenesEdit` flag that shows the per tile pencils).
12. **The scene editor** gets "Done" in the header and loses its footer
    (`scenes.js` `openSceneEditor`).

### Stage 4: the light page and colour

13. **The light sheet** opens medium with Colour as one value row
    (`light.js` `openLightSheet`, `color.js` `colorCtlHTML`): the warmth slider and the
    swatch row move behind the row, which expands the sheet to large. Delete
    `moodCaptionHTML` from the sheet's body and the `scrollTo: 'colour'` hack (finding N4
    in the design audit dies with it). `light-colour` opens the sheet with Colour already
    open.
14. **The star** moves from the row into the sheet's round button, which it already is;
    only the row's copy is deleted (step 7).

### Stage 5: sheets that push instead of growing

15. **"Show all ways"** becomes `openAllWaysSheet()` in `remotes.js` with
    `back: renderRecipeSheet`, replacing `S.recipeAll` and the `recipe-all` /
    `recipe-fewer` pair.
    *Risk: low, but `polish_test.js` checks "Show all ways can be collapsed again with
    Show fewer"; that check becomes "All ways has a back arrow".*
16. **Editors take Done in the header**: `automations.js` `renderEditor` (`ae-done`),
    `openMoreSheet`, `settings.js` `openGroupEditor` and `openHomeName`.
17. **The fresh remote's offer** becomes an empty state under the picture
    (`remotes.js` `usualLayoutHTML`), one primary and one ghost.

### Stage 6: Settings flattened

18. `settings.js` `settingsGlance()` is rewritten to the five groups in section 3;
    `settingsMore()` is split into **Connection** (the tip, the version, update, auto
    update, "how your home connects"), **Rooms and lights** (add a device, look again, the
    Hue row), **Remote timing** (the two sliders and the tester), **Back up and restore**,
    and **Light sets** stays as it is. `S.settingsMore` becomes `S.settingsPage`.
19. **Night hours get one home.** `openPrefs()` splits: the power button row and the night
    look go to "Night" and "Power button" rows on the Settings page; the wind down sheet's
    quiet time and "night ends" become value rows that open the same Night sheet
    (`automations.js` `openWindDownSheet`, `openWindDownAdvanced`).
    *Risk: medium. Three places write `settings.night_start` today; they must all go
    through one function.*

### What the Playwright suite in the scratchpad needs

- `polish_test.js` (49 checks): the checks on room cards opening in place, the light row's
  chevron and star, the Now panel's back arrow, "Show fewer", and every sheet height
  measurement change. Roughly 12 of the 49 need new expectations; none of them are testing
  something that stops being true, only something that moves.
- `now_test.js`: rewrite against the house card.
- `fav_test.js`: the star moves to the light page.
- `slide_test.js`, `hscroll_test.js`: the room's inline sliders are gone; point them at the
  light page's well and the room page's chip rows.
- `kinds_test.js`, `hue_test.js`, `remove_test.js`, `add_test.js`, `power_test.js`: they
  navigate through `room-open` and `light-open`; keep both act names on the new room row
  and light row so they keep working.
- `s16_shots.js` (the screen walk) needs its route list updated once per stage; it is the
  cheapest way to see the whole app after each stage.

---

## 7. What must not change

- **Every feature stays.** Ninety seven commands in, ninety seven commands out. The Now
  view is deleted as a screen, not as a set of abilities: its headline, big number, house
  dimmer, All off, Night, sleep timer, scenes and room list all exist on Home afterwards.
  The password gate, favourites, the Lutron scenes, the Hue paths, add and remove a device,
  the activity log, back up and restore, the install line, the fine tune editor, the curve
  by the hour and the night version of a button are all untouched.
- **The Tenzing skin stays.** `docs/design-spec-v4.md` is still the look: `#f8f8f8` page,
  white cards, one blue, Helvetica Neue, radii 4/8/12, the type ladder, the lamp ramp as
  the only warm colour, the wells, the chips, `--shadow-5` on floating surfaces. Nothing
  in this plan invents a colour, a radius or a type size. One deliberate departure, called
  out so it is a decision and not a slip: **section headers in a grouped list are set in
  caps** (12/16 500 `--text-2`, 0.06em tracking) because the owner asked for the iOS
  grouped list, and Tenzing has no uppercase style of its own.
- **The copy rules stand.** No em dashes anywhere. The words "schedule", "binding" and
  "target" never appear in anything a person reads (they survive only as code identifiers
  such as `S.config.schedules`).
- **Autosave with Undo.** No Save buttons appear anywhere in this plan. "Done" closes a
  sheet, it does not save; every change still writes through `save()` and every
  destructive or surprising change still offers Undo in the toast.
- **What the audits say already works, and must survive the move:**
  - Home's type ladder: the 24/28 title, the 20/24 headline, the grey caption, the warm
    discs as the only colour.
  - The light page as one centred composition with a single readout, and the Hue colour
    rows, which the design audit calls the best looking thing in the app.
  - The calm sheet system: nothing replays, content swaps crossfade over a ghost, the
    recipe list keeps its scroll position, the tab switch has no travel, the swipe down
    springs back without overshoot.
  - Every hidden tap having a visible way in: the row chevron, the bare room chevron, the
    captions under the round buttons, the "tap to switch, hold for a timer" hint.
  - The hit slop that makes every 32px control a 48px target.
  - The remote artwork, its blue "set" dots, and the fact that pressing a real button opens
    the right remote.
  - The token discipline: no off ladder type, no stray radii, gaps on the 8 grid.

---

## Appendix: the numbers this plan was built on

Measured at 390x844 on a seeded home (5 rooms, 9 lights, 2 remotes, 3 scenes, 3
automations, moods in 2 rooms, Hue paired, wind down on), no page errors.

| screen | tappable things | first screen | words | page height |
|---|---|---|---|---|
| Home, rooms closed | 33 | 26 | 174 | 1182px (1.4 screens) |
| Home, one room open | 47 | 27 | 174 | 1522px (1.8 screens) |
| **Home, every room open** | **88** | **32** | 141 | **2511px (3.0 screens)** |
| Remotes | 3 | 3 | 28 | 844px |
| A remote | 14 | 9 | 70 | 1320px |
| Scenes | 11 | 8 | 32 | 876px |
| Automations | 10 | 10 | 77 | 932px |
| Settings | 11 | 6 | 112 | 1338px |
| More settings | 12 | 8 | 94 | 1224px |
| The button sheet | 4 | 4 | 24 | 314px |
| The press sheet | 10 | 10 | 45 | 688px |
| The press sheet, all ways | 23 | 11 | 152 | 688px |
| The scene editor | 9 | 9 | 35 | 776px |
| The automation editor | 10 | 10 | 51 | 757px |
| The Now view | 16 | 11 | 55 | 726px |
| A Hue light | 8 | 8 | 17 | 704px |
| A room's More | 5 | 5 | 37 | 476px |

Bottom furniture: bar 108px, gap 7px, tab bar 57px, total 172px of 844 (20.4%), identical
at 360x740 where it is 172 of 740 (23.2%).
