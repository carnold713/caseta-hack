# Pico Hack: the progressive disclosure pass

The owner's brief: "continue refining the app with progressive disclosure as a big part of it so that the individual screens don't feel overwhelming and are a little more personal and question-based (to walk someone through things if need be)". The flyout sheets and the Light now bar stay as they are.

This document is written so an implementer can build from it without judgment calls. Section 1 is the audit of every screen as it is today (screenshots in the scratchpad, `ux-*.png`, 400x820 at 2x; the `-full` files show the whole page or sheet). Section 2 is the redesign, screen by screen, with final copy. Section 3 is the first run and the "what now?" layer. Section 4 is the implementation order.

**Rules of the house, unchanged.** No Save buttons: every change saves as it happens and the toast offers Undo. The words "schedule", "binding" and "target" never appear in copy; a person makes an "automation", a button "does" something, an action has "lights". Copy is plain second person, sentence case, and never contains an em dash (use a colon, a middle dot or a new sentence). The look is `design-spec-v3.md` as built today, or `design-spec-v4.md` (the Tenzing skin) once it lands: both keep the shell this document leans on (the flyout sheets, the Light now bar, the Now view, the light detail sheet, tip cards, list rows, chips). This pass changes what each screen shows and asks, not how it is drawn, and names no colour or size; every component it uses exists in both specs.

**Three layers, used on every screen.**

1. **Glance.** What a screen shows when it opens: the thing the person came for, one card of explanation at most, one question at most. Numbers below say what that costs today.
2. **On request.** Everything else sits behind one "More" row (or one More button on the light detail sheet) per screen, whose second line names what is inside, so nothing feels hidden. Nothing is removed from the app.
3. **Walk me through.** Anything a person does for the first time is offered as a walk: one question per screen inside a sheet, a "Next" pill, a plan at the end, one toast with one Undo. The three guided setups already do this in spirit; this pass makes the walk a component and uses it for setting up a remote, making an automation from scratch, sorting lights, giving rooms moods, adding a device and connecting the home.

**Voice.** Questions are asked the way a friend who set the house up would ask them: "Which lamp should wake you?", not "Select device". Titles are questions when the screen asks for something and names when it shows something. The app never says "I"; it says "your home", "your remote", "your lights". A suggestion is an offer, phrased as a question with a short reason, and it takes "Not now" for an answer without asking again that day.

---

## 1. Audit

Counts come from a script that read each screen's DOM: words in the visible text, and controls (buttons, inputs, selects, tappable rows). A phone screen at this size holds roughly 60 to 80 words comfortably. The fake home has four rooms (Kitchen, Bedroom, Outside, Hall), five lights, a fan and two remotes.

### 1.1 Welcome and sign in (`ux-welcome.png`, `ux-welcome-help.png`)

On it: "Welcome", one sentence, one field, Continue, "Where do I find it?". 14 words, 8 controls (most are the tab bar's hidden ancestors; effectively 3). First-time need: the password field. Noise: none. Verdict: calm, correct; leave it.

### 1.2 Home, fresh (`ux-home.png`, `ux-home-full.png`)

On it: title and status circle; "Kitchen and Outside are on" with two lamp discs; Scenes row (New scene, Dinner, Movie night, Bedside Lamp favourite); the "Let's sort your lights" tip; Rooms (three cards, each a disc, name, summary, chevron, toggle); the Light now bar. 103 words, 51 controls. First-time need: is anything on, and the rooms. Noise until asked for: the sort-your-lights tip (it is the first thing under the fold and reads as homework), the favourite tile among the scenes. Verdict: not overwhelming by itself, but the tip is the wrong first thing to say to someone who has just connected, and it is one of three tips that can stack (see 1.3).

### 1.3 Home, busy (`ux-home-busy-full.png`)

With automations, wind-down and open rooms: headline, three discs, the wind-down caption, Scenes, "Coming up" with two Skip rows, the sort tip, then rooms with mood rows, light rows, sliders, fan chips. 127 words, 56 controls, 3.8 screens tall. If the moods tip were not dismissed it would sit under the sort tip too, and offline adds a third card. Three unrelated cards of advice before the rooms is the definition of nagging. Verdict: the second most crowded root page. The fix is not to cut controls (rooms are the point) but to allow one card of advice at a time.

### 1.4 A room open (`ux-home-room-full.png`, `ux-home-room-bedroom.png`)

On it: the mood row (five chips), the "Change what each light is for" ghost link, one row per light with disc, name, level, on button, star and slider; fans add five speed chips. First-time need: the light rows. Noise: the ghost link under the mood row on every open room (it is a setup action in a control surface), and "Make moods…" on rooms without moods. Verdict: dense but honest; only the ghost link moves.

### 1.5 Light page (`ux-light.png`)

On it: disc and vertical slider, name, room, level, the mood row of its room, "Change what each light is for", three round buttons (Sleep timer, Favourite, What kind), and a full-width "Remove from my home" button. 25 words, 12 controls. First-time need: the disc and slider. Noise: "Remove from my home" as a pill at the same weight as everything else (a destructive, once-in-a-lifetime action visible on every light), "What kind" (a setup step), the ghost link. Verdict: light on words but two of the four bottom controls are things you do once.

### 1.6 What kind of light (`ux-light-kind.png`), sleep-timer dial (`ux-light-timer.png`)

The kind sheet: nine tiles in three captioned groups and one caption. 56 words, 11 controls. Fine once you want it. The dial: 32 words, 12 controls, fine. Defect in the current (v3) build: the selected chip on the dark dial renders white text on a white pill (`.td .chips .chip.sel` in `web/light.css` line 115 overrides the dark-sheet rule at `web/styles.css` line 375); "20 min" is invisible in `ux-light-timer.png` and `ux-now-timer.png`.

### 1.7 The Now view and its panels (`ux-now.png`, `ux-now-scenes.png`, `ux-now-timer.png`)

Artwork, headline, "2 lights · 70% on average", the house slider, four round buttons, Rooms with toggles. 35 words, 12 controls. The owner likes it; it is the model for the rest of the app: one big thing, one line under it, four verbs, then the list. Leave it (fix the chip defect on the timer panel).

### 1.8 Remotes list (`ux-remotes.png`)

One sentence, one row per remote with a thumbnail and "Bedroom · Not set up yet". 26 words, 2 controls. Verdict: right. "Not set up yet" is the only nudge and it is in the right place.

### 1.9 Remote page, fresh (`ux-remote-fresh-full.png`)

Stage with the picture, name, "Bedroom · 3-button remote with dimming", "Tap a button on the picture, or press it on the real remote.", the ghost "Not your remote? Change the picture", the "Set it up the usual way" tip, Buttons (five rows each "Nothing yet"), the "This remote may still do what the Lutron app set up" card, and "Remove this remote from my home". 108 words, 8 controls, 1.8 screens. First-time need: the picture and one way to start (the usual-layout tip is exactly that). Noise: the picture-change link above the fold, the Lutron caveat and the Remove card on every visit, five "Nothing yet" rows saying the same thing. Verdict: medium. The good part (tap a button on a picture) is buried under three kinds of housekeeping.

### 1.10 Remote page, set up (`ux-remote-set-full.png`)

The same, with each button row carrying up to three sentences: "Press: Turns Bedroom off · Press twice: Turns everything off · Hold: Turns everything off, then Sets Bedroom to 10%, then Turns Bedroom off after 2 min, then Turns the fans off". 136 words. Plus "Start over with the usual layout", the caveat card, the Remove card. Verdict: the Off row alone is 27 words; a person scanning for "what does the round button do" reads a paragraph. The `describe()` sentence is right for a toast and wrong for a list.

### 1.11 Button sheet (`ux-button-sheet.png`, `ux-button-sheet-set.png`)

"What should the On button do?" / "Pick a kind of press." then Press, Press twice, Hold, each with its sentence, and a footnote about the double-press delay. 38 words fresh, 58 set. Verdict: good shape and a good question. The footnote is trivia for a first-timer; the Hold row's paragraph is the 1.10 problem again.

### 1.12 Recipe sheet (`ux-recipes-full.png`, `ux-recipes-chosen.png`, `ux-recipes-night.png`, `ux-recipes-moods.png`)

"Press" / "On button"; "Which lights? tap to add or remove" with a scrolling chip row; "What should happen?" with a list of 20 rows ("Nothing" ticked on a fresh button, then Turn on or off, Turn on, Turn off, Full brightness, Half brightness, Nightlight, Movie mode, Step through brightness, A little brighter, A little dimmer, Sleep timer, Light the way, Goodnight, Leaving, Turn everything off, Run a scene…, Room moods); "More options" (disclosure with Fine-tune); "Try it now" once set. With a setting: a Normally / At night segment and, in night mode, a tip. 138 words, 26 controls, 4 screens of sheet. First-time need: three or four answers to "what should a press do": on, off, on or off, a scene. Noise: the other sixteen ways, the "Nothing" row ticked as if it were a choice already made, the lights chip row when the default (the remote's room) is right nearly every time, the night segment for people who have not asked for night behaviour. Verdict: **the most overwhelming sheet in the app** per tap: it opens on the one question most people will ask first and answers it with twenty options.

### 1.13 Which lights picker (`ux-picker-full.png`)

"Which lights should this control?" / "Tick a whole room, single lights, or both.", Everything, rooms with expanders, a summary and Done. 47 words, 20 controls. Verdict: right for what it is; it is only reached on request.

### 1.14 Fine-tune editor (`ux-finetune-full.png`)

One card per step with four labelled selects, Remove step, Add a step, Try it, Done. 90 words, 10 controls for one step. Verdict: it is the expert surface and is already behind "More options"; leave it.

### 1.15 Which remote is this (`ux-remote-look.png`)

A list of six layouts with model numbers and colour chips. 100 words, 13 controls. Verdict: fine on request; today it is offered above the fold on every remote page ("Not your remote?"), which is where it costs.

### 1.16 Scenes tab (`ux-scenes-full.png`)

Your scenes, From the Lutron app, Room moods, New scene. 29 words, 7 controls. Verdict: right.

### 1.17 Scene editor (`ux-scene-new-full.png`, `ux-scene-edit-full.png`)

"What should your lights do?" / "Turn lights on, off or set them to a level.", Name, Change gradually over, "Use the lights as they are" and "Try it", then every light in the house under room headings with a checkbox and a slider or toggle, "Delete this scene", Done. 65 words, 15 controls, 2.8 screens for a five-light home; a twenty-light home would be three times that. First-time need: a name and confirmation of what was captured. Noise: the fade select, the delete pill, and every light that is not in the scene ("Left alone" rows). Verdict: medium-high. The question in the title is good; the body answers a different one ("configure every light").

### 1.18 Room moods sheet (`ux-room-moods.png`), roles confirm (`ux-roles-full.png`)

Room moods: five rows with play and pencil, "Change what each light is for". 42 words, 12 controls, fine. Roles: the question, "We guessed from the names. Fix any that are wrong.", a 36-word legend, one row per light with four chips, Make moods. 62 words, 6 controls for one light. Verdict: good question, long preamble.

### 1.19 Automations, empty (`ux-automations-empty-full.png`)

Title, a 15-word help sentence, the Evening wind-down card (toggle plus a 27-word sentence), "Your automations", the "Let your home take care of the evenings" tip, four rows (three setups and Something else). 112 words, 5 controls. First-time need: the three setups. Noise: the help sentence, the wind-down card explaining a feature that is off, the tip repeating what the rows say. Verdict: 80 words of explanation before the first choice; the choice itself is good.

### 1.20 New automation sheet (`ux-automations-new.png`)

"What would you like to set up?" / "Three ready-made ones, or start from scratch.", four rows. 49 words, 5 controls. Verdict: right. This is the pattern.

### 1.21 Welcome lights (`ux-setup-welcome-full.png`)

Title, sub, "Which lights come on?" chips, "Until when?" chips, the "Leave the outside lights on low until morning" checkbox, the location card (Where is your home?, Use my location, Pick the nearest city instead), the Preview card, "More options", "Turn it on" (disabled until a location). 86 words, 23 controls, 2.5 screens. First-time need: one question at a time; instead all four are stacked and the location card, which is the blocker, sits third. Verdict: medium. Good questions, all at once.

### 1.22 Wake-up light (`ux-setup-wakeup-full.png`)

"Which lamp?", "Wake up at" with a big time input, "Which days?" with seven day chips and three quick chips and a caption, Preview, More options, Turn it on. 59 words, 21 controls. Verdict: the best of the three; still three questions on one screen where the lamp and the time are the only ones a first-timer must answer.

### 1.23 Goodnight and Leaving (`ux-setup-buttons-full.png`)

Two cards, each with a toggle and three or four chip rows ("Which remote?", "Which button?", "This replaces: …", "Which lights light the way to bed?" / "Which light is by the door?"), then a 40-word Preview and "Set up the buttons". 129 words, 25 controls, 2.8 screens. First-time need: four answers, of which three are already guessed right. Verdict: **the most overwhelming guided setup**: it asks eight things on one screen when the walk is "which remote is by your bed, which by the door".

### 1.24 Automations list (`ux-automations-full.png`)

Help sentence, wind-down card, rows with rule and next lines, New automation, the Lutron timers caption. 92 words, 6 controls. First-time need: the rows. Noise: the help sentence every visit, the wind-down card's paragraph when the feature is off, the Lutron caption. Verdict: medium-light; a third of the words are explanation.

### 1.25 The editor (`ux-editor-full.png`, `ux-editor-saved-full.png`)

"What should happen, and when?" / "Pick a time, the lights, and what they do. It saves as you go.", When? (orange dot), Then turn off again, Which lights? chips, What should happen? (eight rows), Which days? (seven day chips, three quick chips, a caption), Try it now, Skip tonight (once saved), More options (with a five-item sub), Done. 97 words, 29 controls, 1.7 screens. The benchmark in `ux-flows.md` is four taps; the screen shows everything those four taps could touch. First-time need: When, then Done. Noise on a new automation: days (nearly always Every day), Try it now before anything is set, the whole recipe list when "Turn on" is already picked. Verdict: medium-high; a form where a walk was asked for.

### 1.26 When sheet, location step, city picker (`ux-when-time.png`, `ux-when-sunset.png`, `ux-when-location.png`, `ux-city.png`)

Three chips and a time, or At/Before/After, six minute pills, a sentence, the location line or card, Use this time. 17 to 64 words. Verdict: good; a question, its answers, one pill. The location card inside it is right where it should be. Leave it.

### 1.27 More options (`ux-editor-more.png`)

Name, Skip it when, Change gradually over, Fine-tune, Delete. 47 words, 7 controls. Verdict: right; this is what "More" should look like everywhere.

### 1.28 Evening wind-down card (`ux-winddown.png`), advanced (`ux-winddown-advanced-full.png`), curve (`ux-winddown-curve.png`)

Card on: toggle, 27-word sentence, "When does the house go quiet?" with a time, a 24-word caption, "Advanced: change the levels". 59 words, 3 controls. Advanced: a 26-word sub, five rows of chips and a time, the Today card, the untouched-lights toggle with a 20-word caption, Curve by the hour. 128 words, 16 controls. Curve: mode chips, a 22-word caption, four time and level rows. 96 words, 17 controls. First-time need: the toggle and the quiet time. Verdict: the card is fine when on; when off it still spends 27 words on the first screen of the Automations tab. Advanced is dense but is two taps deep, which is where dense belongs.

### 1.29 Settings (`ux-settings-full.png`, `ux-settings-howto-full.png`)

Connection tip; Your home (Home name, Add a device, Connect a Hue bridge, Look for new lights, Connector 0.5.1 with Update, Update automatically); Set up (three numbered steps, two "Show me how" disclosures, the install line); Night-time (Night starts with two explanatory lines, Night ends, Night look with three chips); This app (Add to home screen, Recent activity); Advanced (two sliders with captions and the tester line, Default brightness for on); Light sets (New set with a 17-word sub); Back up, Restore; Sign out. 296 words, 23 controls, 3.5 screens (4 with the how-to open). First-time need, connected: nothing, or Add a device. First-time need, not connected: the install line. Noise: everything else, and it is all on one scroll. Verdict: **the most overwhelming screen in the app**: three times the words of any other root page, a setup guide for a step that is done, and expert timing sliders at the same level as the home's name.

### 1.30 Recent activity (`ux-activity.png`), Light set editor (`ux-set-editor.png`), Add to home screen (`ux-install-help.png`)

All fine on request. The set editor is the scene editor's shape without levels; it moves with Settings' Advanced.

### 1.31 Add a device (`ux-add-listen-full.png`, `ux-add-found.png`, `ux-add-name-full.png`)

Title, a 15-word sub, the Experimental card (43 words), "What are you adding?" chips, "Hold its button" with the instruction card and countdown, the "Nothing found?" caption (34 words), "Show technical details". 137 words, 7 controls, before anything has happened. Name step: 56 words, fine. First-time need: "what are you adding" then "hold its button". Noise: the disclaimer above the question, the failure advice before there is a failure, the technical link on the happy path. Verdict: medium-high. It also starts listening before it knows what to listen for, so the instruction shown first is for a dimmer even if you are adding a remote.

### 1.32 Connect a Hue bridge (`ux-hue-find-full.png`, `ux-hue-press.png`)

Find: sub, Found row, "Or type the bridge's address" field and pill, a caption. 50 words, 4 controls. Press: 40 words, 3 controls. Verdict: light; the manual address is a second path shown at first glance.

### 1.33 Remove confirm (`ux-remove-confirm.png`), offline (`ux-home-offline.png`, `ux-settings-offline.png`), first run (`ux-first-run.png`, `ux-first-run-settings-full.png`)

Remove: title, a 19-word sub about the undocumented bridge, a card, "Show technical details", Remove, Keep it. Fine except the technical link on the first attempt. Offline: a card on Home, "Last known state" on the bar. Fine. First run: the setup sheet over a bare Home, then Settings with the steps: the sheet is good; Settings is the same 3.5 screens with the one useful thing (the install line) behind a disclosure in the middle.

### The ranking

Most overwhelming, in order, with the reason:

1. **Settings** (1.29): 296 words on one scroll, a finished setup guide, expert sliders beside the home name.
2. **Recipe sheet** (1.12): twenty ways to answer a question that has four common answers; "Nothing" pre-ticked; the lights row and the night segment before the question.
3. **Goodnight and Leaving** (1.23): eight questions on one screen, three of them already guessed right.
4. **Home when busy** (1.3): up to three cards of advice before the rooms.
5. **The editor for a new automation** (1.25): a full form for a four-tap job.
6. **Add a device** (1.31): 137 words of caveat and troubleshooting before the first question.
7. **Remote page once set up** (1.10): three-sentence rows and three housekeeping cards.
8. **Scene editor** (1.17): every light in the house, including the ones the scene leaves alone.

---

## 2. Redesign

### 2.0 Three components everything below uses

**The walk** (`walk()` in `web/js/core.js`, styles in `web/styles.css`). One sheet, one question per step, opened with `sheet.open` and re-rendered in place through the same body swap `showSheet()` uses in `automations.js` (move `showSheet`/`SHEET_KEY` into `core.js` so every file can use it).

- Header: the sheet's big header. Step 1 has the close circle only; later steps have the back circle (previous step) and the close circle. Above the title a Caption "1 of 3" in `--text-3`. Title `.t2` is the question. Sub is optional and at most one sentence.
- Body kinds: `pick` (one answer: a `.card.pad0.list` of rows; tapping a row records it and advances, no Next pill), `multi` (chips or a checklist; a "Next" primary pill in the sticky footer, disabled until the step's `valid()` is true), `time` (the big time input plus optional days chips; Next), `custom` (any HTML plus Next), `plan` (the last step: a `.tip` with cap "Here's the plan" and the summary sentence, then value rows for the numbers, then the primary named by the walk, e.g. "Turn it on", and a ghost "Not now").
- A value row (below) on the plan step reopens that step; coming back lands on the plan again.
- Steps declare `skip()` so a step whose answer is already known (a home with one remote, a location already stored) is not shown; the caption counts only the steps that will show.
- Saving: nothing is written until the plan's primary. Then everything the walk made saves at once with one toast and one Undo (this is how the setups already work). Closing the sheet earlier throws the draft away silently.
- Motion: `Motion.pageIn` on the body at every step; nothing else.
- Every walk is also reachable without the walk: the stacked sheet or page that exists today remains the editor for the thing once it exists.

**The More row.** `moreRow(sub)` renders one `.card.pad0.list` with a single row: title "More", second line listing what is behind it ("Change the picture, start over, remove"), chevron. Always the last card on a screen. It opens a sheet titled with the thing's name (the remote's name, the light's name, "More settings"). On the light detail sheet, which has a row of round buttons instead of list cards, the same idea is a round button labelled "More".

**The value row.** A list row whose title is the question and whose `.val` is the current answer: "Which lights?" · "Bedroom". Tapping it expands the chips under it (in place, `Motion.expand`) or opens the sheet that answers it. It replaces every chip row that is shown open by default today when the default answer is usually right.

### 2.1 Home

**Glance.** Title, status circle; the Light now strip; the wind-down caption when it applies; Scenes; sleep timers; Coming up; **at most one card** (2.1a); Rooms.

**2.1a One card at a time.** The `sortBlockHTML()` tip, the `moodsTipHTML()` tip and the setup tip are replaced by a single slot filled by `nextCardHTML()` (section 3). Priority when more than one applies: not connected (the existing "Not connected to your home" tip) beats everything; otherwise the Next card shows its one suggestion; otherwise nothing. Two cards never stack.

**Room card open.** The mood row stays. The ghost link "Change what each light is for" under the row is removed; the mood row gains a trailing small chip with the `dots` glyph and the label "Change" that opens the roles sheet (`roles-open`). Rooms without moods keep the single "Make moods…" chip. Everything else in the card is unchanged.

**Removed, hidden, moved.** Removed from Home: the sort-lights tip, the moods tip (both become suggestions, section 3), the ghost link (moved into the mood row as a chip). Nothing else changes.

### 2.2 Light page (the light detail sheet)

**Glance.** Stage, name, room and role, the level, the mood row (with the same trailing "Change" chip as 2.1), and three round buttons: "Sleep timer", "Favourite", "More".

**On request: More** opens a sheet on the same surface as the light page, titled with the light's name, sub "Kitchen · Pendant" (the role caption as today), with one `.card.pad0.list`:

- "What kind of light is this?" · val: the current kind ("Pendant") or "Not set" · chevron. Opens the existing kind sheet with back.
- "Remove from my home" · sub "It leaves your Lutron bridge." · `x` glyph. Opens the existing remove confirm. Hidden for Hue lights, as now.

**Removed, hidden, moved.** "What kind" leaves the button row (it is still one tap further, and the sort walk in section 3 opens the kind sheet directly). "Remove from my home" leaves the first glance. The ghost link goes as in 2.1.

### 2.3 Now view

Unchanged. Fix the selected chip on the timer panel (1.6).

### 2.4 Remotes list

Unchanged. The body line stays: "Press a button on any remote to open it here."

### 2.5 Remote page

**Glance.**

1. The stage with the picture, the name, "Bedroom · 3-button remote with dimming".
2. The hint "Tap a button on the picture, or press it on the real remote." only while the remote has no settings.
3. On a fresh remote with a known room, the usual-layout tip, rewritten as an offer: cap "Set up", title **"Want the usual layout?"**, sub "Top turns Bedroom on, bottom turns it off, hold either to brighten or dim. The middle button is Half brightness." (last sentence as today: "Relax" when the room has moods; none on a remote without a round button), the chevron circle applies it, plus a ghost "I'll pick myself" that hides the tip for this remote (`localStorage` `usualHidden:{device_id}`). The "Start over with the usual layout" row keeps the capability afterwards.
4. "Buttons": one row per button. The second line is at most two lines: line one is the press, line two the other two gestures. Each gesture is described by `shortDescribe(actions)`: the recipe's title when `recipeOf()` matches one ("Turn on", "Full brightness", "Brighten while holding", "Goodnight", "Runs the Dinner scene" for scenes), otherwise `describe()`. Format: `Turn on` / `Twice: Full brightness · Hold: Brighten while holding`. An unset button reads "Nothing yet" once, not three times. A night version adds nothing to the row (it shows on the button sheet).
5. The More row: "More" / "Change the picture, the Lutron app, start over, remove".

**On request: More** opens a sheet titled with the remote's name:

- "Not your remote? Change the picture" · chevron (the existing look sheet, with back).
- "Start over with the usual layout" (only when the remote has settings; applies at once, Undo covers it, as now).
- "It may still do what the Lutron app set up" · sub "Both things happen. Tap to read how to make it fully yours." Tapping expands the existing paragraph under the row.
- "Remove this remote from my home" · sub "It leaves the bridge and stops working until it is added again." · `x` glyph.

**Removed, hidden, moved.** The "Not your remote?" ghost link, the Lutron caveat card and the Remove card move under More. The three-line rows become two-line rows. The hint disappears once one button is set.

### 2.6 Button sheet

**Glance.** Title "What should the On button do?", sub **"Bedroom Pico · pick a kind of press."** Three rows: "Press", "Press twice", "Hold", each with `shortDescribe` of its actions or "Nothing yet", and the night line "At night: …" when one exists. The broken marker stays. The double-press footnote is removed from here (it reappears at the one moment it matters, 2.7).

### 2.7 Recipe sheet (the button's kind of press)

**Glance**, top to bottom:

1. Header: title is the kind of press ("Press", "Press twice", "Hold"); sub is "On button". Unchanged.
2. When `g === 'double'` and the button has no double setting yet, a Caption under the header: "Once it has a press-twice, a single press waits a moment so the two can be told apart." This is the only place the footnote lives.
3. The value row **"Which lights?"** · val: the picked lights ("Bedroom", "Bedroom and Outside", "Everything"). Tapping it expands today's chip row (with the `dots` "Specific lights…" chip) under the row; it stays expanded for the life of the sheet. It opens expanded when the pick is not the remote's own room, so a person editing a custom pick sees it at once.
4. `.h2` **"What should happen?"** and a `.card.pad0.list` of the **usual ways** for this kind of press, followed by one row "Show all ways" with the `dots` glyph. The usual ways:
   - Press: Turn on · Turn off · Turn on or off · Run a scene… · Room mood… (or "Next mood" when the room has two or more moods and no mood is picked; or "Room moods · Make moods for Bedroom first" when it has none and the room has a dimmer).
   - Press twice: Full brightness · Nightlight · Turn everything off · Run a scene… · Room mood… (same substitutions).
   - Hold: Brighten while holding · Dim while holding · Sleep timer · Goodnight · Turn everything off.
   - When every picked light is a fan: Fan: faster · Fan: slower · Turn on or off · Turn off.
   The recipe currently set is always visible: if it is not among the usual ways it is appended to the short list, ticked. The "Nothing" row is gone from the list; a fresh button simply shows no tick.
5. "Show all ways" expands, in place, into the full list grouped under Captions: **"Brightness"** (Turn on, Turn off, Turn on or off, Full brightness, Half brightness, Nightlight, Movie mode, Step through brightness, A little brighter, A little dimmer, and on a hold Brighten while holding and Dim while holding), **"Scenes and moods"** (Run a scene…, Room mood…, Next mood), **"Timers and going out"** (Sleep timer, Light the way, Goodnight, Leaving, Turn everything off), **"Fans"** (Fan: faster, Fan: slower; only when the pick has a fan). Rows keep today's second lines. Once expanded it stays expanded for the life of the sheet; a second open of the sheet starts short again.
6. The Custom tip, when the steps match no recipe. Unchanged.
7. "Try it now" (secondary), only when something is set. Unchanged.
8. The More row: "More" / "At night, fine-tune, clear".

**On request: More** opens a sheet titled "Press on the On button" (the gesture and the button), with:

- "At night, do something different" · val: `shortDescribe` of the night actions or "Off" · chevron. Opens this same recipe sheet in night mode, which keeps today's Normally / At night segment at the top and the night tip ("Between 10pm and 6:30am this button does this instead. Change the hours").
- "Fine-tune: fade times, several steps, timers…" · chevron. The existing editor.
- "Clear this press" · sub "Does nothing until you pick something again." Applies the "nothing" recipe: toast "Cleared" with Undo, back to the recipe sheet.

**Removed, hidden, moved.** The "Nothing" row moves under More as "Clear this press". The Normally / At night segment moves under More (it still appears at the top once you are in night mode). The lights chip row collapses into a value row. The full list collapses behind "Show all ways". Nothing is deleted.

### 2.8 Which lights picker, fine-tune editor, which remote is this

Unchanged. They are reached on request only.

### 2.9 Scenes tab

Unchanged. The empty-state tip's title becomes a question: cap "Scenes", title **"What look would you like to keep?"**, sub "Set the lights the way you like them, then save that look. A remote button can run it later."

### 2.10 Scene editor

Both the fresh and the existing editor share one layout; the fresh one has the name field focused.

**Glance.**

1. Title: fresh "What should we call this look?" with sub "Saved from the lights as they are: Kitchen Cans 60%, Bedside Lamp 30%, Porch on." (the sub lists the included lights and levels, at most six, then "and 2 more"); existing: the scene's name, sub "3 lights · fades over 3 seconds" (the row text from the tab).
2. Name field (underline field, as now).
3. `.h2` "In this look", then only the lights the scene includes, under room headings, each with its slider, toggle or fan select, as today. A room with none of its lights included is not drawn.
4. One row card: **"Add or remove lights"** · val "3 of 6" · chevron. Opens a sheet "Which lights are in this look?" with today's full per-room checklist (checkboxes only, no sliders), back to the editor. Ticking a light adds it at its current level, as now.
5. The pair "Use the lights as they are" and "Try it". Unchanged.
6. The More row: "More" / "Fade, delete".
7. Sticky "Done".

**On request: More** opens "More" with sub the scene's name: "Change gradually over" (the existing select), and "Delete this scene" (danger). A room mood adds the existing "A suggested mood" tip at the top of the editor, unchanged, and "Back to the suggestion" stays where it is.

**Removed, hidden, moved.** The fade select and the delete pill move under More. Lights not in the scene move behind "Add or remove lights".

### 2.11 Roles confirm sheet

Unchanged in shape. The legend shrinks to one line: **"Main is the ceiling light. Task is where hands work. Lamps are for atmosphere. Decor is lit to be looked at."** In the moods walk (section 3) this sheet is the walk's step for each room, with the caption "Room 1 of 3" and the secondary "Next: Living room" as today.

### 2.12 Automations tab

**Glance.**

1. Title, status circle.
2. Offline tip and time-zone tip when they apply (unchanged).
3. A `.card.pad0.list` with one row **"Evening wind-down"**, toggle at right, sub when off "Lights you turn on come on a little dimmer late in the evening." and when on "Quiet from 10pm · lights come on dimmer as the evening goes on." Tapping the row (not the toggle) opens the wind-down sheet (2.15).
4. `.h2` "Your automations" and the rows, unchanged. Empty: the three setups and "Something else" as rows, with the tip above them reduced to one line: cap "Get started", title **"What should your home do on its own?"**, sub "Each of these takes about a minute."
5. "New automation" row.

The 15-word help sentence at the top is removed. The Lutron timers caption moves to the bottom of the New automation sheet.

### 2.13 New automation sheet

Unchanged: "What would you like to set up?" / "Three ready-made ones, or start from scratch." and the four rows. At the bottom, the Caption "Have timers in the Lutron app? Keep them in one place, here or there, so they don't fight."

### 2.14 Something else: the walk for a new automation, and the editor

**"Something else" opens a walk** (nothing is saved until the plan):

1. **"Which lights?"** (multi): the chip row pre-filled with the first room, "Everything", "All shades" when shades exist, the `dots` "Specific lights…" chip. Next.
2. **"What should they do?"** (pick): the `AUTO_RECIPES` rows that apply to the pick (Turn on, Turn off, Full brightness, Half brightness, Nightlight, Rise slowly, Run a scene…, and the shade and fan rows when they apply). "Run a scene…" opens the scene picker as a sub-step and advances on pick.
3. **"When?"** (custom): today's When sheet body (At a time / Sunset / Sunrise, the time or the offset chips, the sentence, the location step inline). Next is "Use this time" and stays disabled until a location exists when the sun is chosen.
4. **"Then turn off again?"** (pick), only when the action leaves something on (shades: "Then open again?"): rows "Leave them on" · "At bedtime (10pm)" (the night start) · "At sunrise" · "Pick a time…" (opens the When sheet body titled "Turn off again when?" as a sub-step).
5. **Plan**: cap "Here's the plan", the sentence "Bedroom on, 20 minutes before sunset. Off at 10pm. Every day." Value rows under it: "Which days?" · "Every day" (tapping expands today's seven-day chips and quick chips in place), "Name" · the generated name (tapping reveals the name field). Primary **"Turn it on"**, ghost "Not now". "Turn it on" writes the automation (and its off pair), closes the sheet, toast is the sentence with Undo.

**The editor for an existing automation** keeps today's stacked layout with three rows collapsed into value rows:

- The When card: "When?" and "Then turn off again" rows, unchanged.
- "Which lights?" value row (2.0), expanding to the chip row.
- "What happens" value row · val the recipe title ("Turn on") or "Custom"; tapping opens a sheet "What should happen?" with the recipe list and the Custom tip, back to the editor.
- "Which days?" value row · val "Every day" / "Weekdays" / "Mon, Wed, Fri"; expands to the day chips in place.
- "Try it now" and "Skip tonight" secondaries, then the More row "More" / "Name, skip it when, fade, fine-tune, delete" (the existing More options sheet), then Done.

The fresh-editor title "What should happen, and when?" is no longer needed (the walk covers it); the editor's title is always the automation's name with the rule line as sub.

### 2.15 Evening wind-down sheet, advanced, curve

**The sheet** (opened from the row in 2.12) is today's card as a sheet titled "Evening wind-down": the toggle row, the sentence "As the evening goes on, lights you turn on come on a little dimmer, so the house feels calmer late. Set a level yourself and it stays.", and when on the "When does the house go quiet?" time row, its caption, and the row "Advanced: change the levels". The Settings cross-reference ("Also when the evening wind-down reaches its lowest…") lives here as the last line of the caption: "This is also when night starts for your remotes." and leaves Settings.

**Advanced.** Sub shortens to "The numbers behind the curve." The two facts move to a Caption at the very bottom: "Task lights (counters, desks, mirrors) are never dimmed. Pressing a top button twice is always full brightness." Rows unchanged. **Curve by the hour**: unchanged.

### 2.16 The three guided setups as walks

Each keeps its title and sub on step 1 only. The pre-fills and the saved shapes are exactly those in `ux-flows.md` section 5; only the asking changes.

**Welcome lights.** Title "Welcome lights", sub "Lights on before you reach the door, off at bedtime."

1. **"Which lights should come on before you get home?"** (multi, chips pre-filled with outside-ish rooms, `dots` "Specific lights…"). Next; disabled with the caption "Pick at least one light" when empty.
2. **"Close any shades too?"** (multi, one chip per shade, none selected; skipped when the home has no shades). Next.
3. **"Until when?"** (pick): "Bedtime (10pm)" · "Sunrise" · "Pick a time…" (reveals the time input under the row; Next appears). When an outside room is picked, a checkbox under the rows: "Leave the outside lights on low until morning".
4. **"Where is your home?"** (custom; skipped when a location is stored): the existing location card content: sentence, "Use my location", "Pick the nearest city instead". Advances by itself when the location lands.
5. **Plan**: "Today: on at 6:52pm, 20 minutes before sunset. Off at 10pm." Value rows "Brightness" · "60%" (chips 40, 60, 80, 100 on tap), "Comes on" · "20 minutes before sunset" (chips At sunset, 10, 20, 30, 45 min before). Primary "Turn it on".

**Wake-up light.** Title "Wake-up light", sub "One lamp rises slowly from dark to soft, ending at the time you pick."

1. **"Which lamp should wake you?"** (pick): rows for the bedroom dimmers (the guessed lamp first, ticked), then "Another light…" which opens the existing lamp picker as a sub-step. Skipped when the home has exactly one dimmer.
2. **"What time do you wake up?"** (time): the big time input, then the day chips with the quick chips and the caption. Sub: "It starts 25 minutes before, so it's soft by then." Next.
3. **"Open the shade too?"** (pick; only when that room has a shade): "Yes, at the time I wake" · "No".
4. **Plan**: "Starts at 6:05am, reaches 50% by 6:30am. Skipped if the lamp is already on." Value rows "Takes" · "25 minutes" (15, 25, 40), "Ends at" · "50%" (30, 50, 70). Primary "Turn it on".

**Goodnight and Leaving.** Title "Goodnight and Leaving", sub "One hold shuts the house down and leaves one light on for a moment."

1. **"Which remote is by your bed?"** (pick): one row per remote (the bedroom one first), then "Skip Goodnight". Skipped when there is one remote (it is used).
2. **"Which lights light the way to bed?"** (multi, pre-filled as today). Next.
3. **"Which remote is by the door you leave from?"** (pick): rows, then "Skip Leaving". Skipped when there is one remote.
4. **"Which light is by that door?"** (pick): lights with hall lights first. Skipped when Leaving was skipped.
5. **Plan**: the sentence as today ("Hold Off on the Bedroom Pico: everything off, Bedroom stays dim for two minutes. Hold Off on the Kitchen Pico: everything off, Hall stays on for two minutes. Fans stop."). Value rows "Goodnight button" · "Hold Off on the Bedroom Pico" and "Leaving button" · "Hold Off on the Kitchen Pico"; tapping one expands the "Hold On / Hold Round / Hold Off" chips for that remote, with the "This replaces: …" caption when the chosen hold is in use. Primary "Set up the buttons". Saves as remote settings and lands on the Remotes tab, as now.

### 2.17 Settings

**Glance.**

1. The Connection tip. Connected: "Connected to your home" / "5 lights · 2 remotes" (the bridge address moves to More settings). Not connected: as today.
2. **While the home has never connected**, directly under the tip: the "Connect your home" walk entry (2.18) as a `.tip`: cap "Set up", title "Let's connect your home", sub "About ten minutes, once.", chevron. Once the home has connected this card is gone from the glance.
3. `.h2` "Your home": "Home name"; "Add a device"; "Connect a Hue bridge" / "Hue bridge"; "Look for new lights" (sub shortened to "Added or renamed something in the Lutron app? Look again.").
4. `.h2` "Night-time": "Night starts" with sub "Buttons can do something different at night." (one line; the wind-down sentence and the link leave); "Night ends"; "Night look" with its three chips.
5. `.h2` "This app": "Add to your phone's home screen"; "Recent activity"; **"Ideas for your home"** · sub "Things worth setting up, one at a time" (section 3.4).
6. The More row: "More settings" / "Connector, timing, default brightness, light sets, back up".
7. "Sign out" card.

**On request: More settings** is a nested page (the remote page's nested layout: back circle, wordmark, status circle; `S.settingsMore = true`), title `.t2` "More settings":

- `.h2` "Connector": the card with "Connector 0.5.1" (version, commit, "Up to date" / "Update available: 0.7.0" with the Update pill), "Update automatically" toggle, and a row "How your home connects" · chevron that expands today's step 2 how-to (the numbered steps, the install line with its copy button). The bridge address as a Caption under the version: "Bridge at 192.168.1.91".
- `.h2` "Timing": the two sliders with captions and the tester line, unchanged; then the "Default brightness for on" row.
- `.h2` "Light sets": the sets and "New set" row (sub shortened to "A hand-picked mix, like Downstairs path.").
- The "Back up settings" and "Restore settings…" card.

**Removed, hidden, moved.** The Set up steps leave Settings once connected (step 1 "Sign in" is always done and is deleted outright; step 2 lives under More settings › How your home connects; step 3 "Take over a remote" lives on the remote page's More sheet, which already carries the same copy). Connector version and auto-update, Timing, Default brightness, Light sets, Back up and Restore move to More settings. The wind-down cross-reference moves to the wind-down sheet.

### 2.18 Connect your home (first run)

The setup sheet becomes a two-step walk, title "Let's connect your home":

1. **"Do you have a computer at home that stays on?"**, sub "A Mac, a Raspberry Pi, a NAS, an old laptop. A small helper program on it links this app to your Lutron bridge. About ten minutes, once." Rows: "Yes, show me how" · "Not yet". The Pico picture stays above the rows as today. "Not yet" closes the sheet; Home keeps the "Let's connect your home" tip (2.17 item 2 on Settings, and the existing `setupEmpty()` tip on Home).
2. **"Paste this line on that computer"** (custom): "Open the Terminal app on it, paste this line, press Enter." the install line in its code block with the copy button, then "When it asks, press the small black button on the back of your Lutron bridge." and a Caption "The moment it connects, the dot at the top turns green and your rooms appear. It starts again by itself after a restart." No Next: the sheet stays until the connector's first snapshot arrives, at which point the "Connected to your home" moment (existing) takes over, or until it is closed.

### 2.19 Add a device

A walk, title "Add a device" on step 1 only, sub **"Without the Lutron app. This part of the bridge is undocumented, so if it says no, the Lutron app still works as before."** (the Experimental card becomes these two sentences).

1. **"What are you adding?"** (pick): rows "Dimmer or switch", "Plug-in module", "Pico remote", "Shade", "Fan control". Picking starts listening (today it starts on open; move the `adStart()` call to this pick so the instruction on step 2 is the right one).
2. **"Hold its button"** (custom): the instruction card for that kind with the dots and "Listening · 2:59 left"; the Found list appears under it and tapping a found device advances. Only after 45 seconds with nothing heard, the caption "Nothing found? Let go, wait a moment, and hold again. The bridge only hears a device that is not already part of a home; one that came from another home needs a factory reset first." and a "Listen again" pill when listening has stopped. "Show technical details" appears only after an error (the error card keeps it).
3. **"Name it"**: unchanged (name, "Which room?" chips, the new-room caption). Primary "Add to my home".
4. **Added**: unchanged.

### 2.20 Connect a Hue bridge

Find: sub shortens to "Its lights and rooms join this app, and a remote button can control them." The Found list, then a ghost "Type its address instead" that reveals the field, the pill and the caption. Press and Connected: unchanged.

### 2.21 Remove confirm

Unchanged, except "Show technical details" appears only after the bridge has said no (the retry already opens it).

### 2.22 Welcome, loading, offline, activity, install help, light set editor, city picker, When sheet, More options

Unchanged.

---

## 3. First run and "what now?"

### 3.1 The greeting

When the first snapshot of a session arrives and the connector is online, the existing "Connected to your home" tick shows for 900ms, then Home. On top of that, **once per home** (a config flag `settings.greeted: true`, so a second phone does not see it again), a sheet slides over Home:

- Title **"Your home is connected"**, sub "5 lights in 4 rooms, and 2 remotes. Where would you like to start?"
- Rows (each present only when it applies):
  - "Set up the Kitchen remote" · "Top on, bottom off, hold to dim" (the first remote with a room; opens that remote page and applies the usual layout at once, with its toast and Undo).
  - "Give a room moods" · "Bright, Relax, Dinner, Movie and Night" (when a room has two or more lights; starts the moods walk).
  - "Lights on before you get home" · "On before sunset, off at bedtime" (when an outside-ish room exists; starts the Welcome lights walk).
  - "Just look around" (closes the sheet).
- The flag is set when the sheet closes, whichever row was tapped.

### 3.2 The Next card

One `.tip` in Home's card slot (2.1a), cap **"Next"**, a title that asks, a one-line reason, the chevron circle at the right that does the thing, and a ghost "Not now". One suggestion at a time; the first eligible one in this order:

| id | shows when | title | reason | the chevron does |
|---|---|---|---|---|
| `remote` | a remote with a room has no settings | "Set up the Kitchen remote?" | "Top turns Kitchen on, bottom off, hold to dim. Ten seconds." | opens that remote page (the usual-layout tip is at the top) |
| `sort` | a dimmable light has no kind | "Want your lights sorted?" | "Say what kind of lamp each one is, and Relax, Dinner and Movie know what to dim." | the sort walk (3.3) |
| `moods` | a room with two or more lights has no moods | "Give the Kitchen moods?" | "Bright, Relax, Dinner, Movie and Night, made from what each light is." | the roles walk over all such rooms (existing `moods-walk`) |
| `welcome` | an outside-ish room exists and no automation has `kind: 'welcome'` | "Lights on before you get home?" | "Outside comes on 20 minutes before sunset and goes off at bedtime." | the Welcome lights walk |
| `wakeup` | a bedroom dimmer exists and no automation has `kind: 'wakeup'` | "Wake up to a slow light?" | "The Bedside Lamp rises from dark over 25 minutes." | the Wake-up light walk |
| `goodnight` | a remote exists and no hold is a Goodnight recipe | "One button for goodnight?" | "Hold Off on the Bedroom Pico: everything off, a dim path to bed." | the Goodnight and Leaving walk |
| `install` | `matchMedia('(display-mode: standalone)')` is false | "Put this app on your home screen?" | "It opens full-screen, like a real app." | the install help sheet |

Names in the copy are the real ones (the first matching remote, room or lamp).

**Without nagging**, four rules:

1. **One per session.** The card shows at most one suggestion per app open (`sessionStorage` `next:shown`). "Not now" removes the card for the rest of the session; the next open may show the next eligible one.
2. **"Not now" is remembered** for 14 days per suggestion (`localStorage` `next:{id}:until`).
3. **Three in a row is a no.** After three "Not now" taps within seven days (`localStorage` `next:quiet:until`), the card stays away for 30 days. It never comes back for a suggestion whose condition has stopped applying.
4. **Never over a problem.** Not connected, a broken button ("Needs attention") or a failed automation run takes the slot instead (the existing not-connected tip; for the other two a tip with cap "Needs attention", the existing copy, and a chevron to the place).

Doing the thing, by any path, ends the suggestion for good (its condition no longer holds).

### 3.3 The sort walk

The `sort` suggestion opens the existing kind sheet for the first untagged dimmable light with a Caption "Light 1 of 4" above the title, and a footer with the primary **"Next: Island Pendants"** (the next untagged light) and a ghost "Skip this one". Picking a tile does not close the sheet (as now); Next moves on. The last light's primary reads "Done". One toast at the end: "4 lights sorted" with Undo. The kind sheet opened from the light page's More sheet is unchanged (no caption, no footer).

### 3.4 Ideas for your home

Settings › This app › "Ideas for your home" opens a sheet titled **"Ideas for your home"**, sub "The things the Next card can suggest. Done ones stay here too." One row per suggestion in the table, in order: title as the row title, reason as the sub, a tick circle at the right when its condition no longer holds (done), otherwise a chevron that does the thing. Rows whose condition cannot apply in this home (no shades, no remotes) are omitted. This is how a dismissed suggestion stays reachable.

### 3.5 Question-based empty states

Each root page's empty state asks its question and offers its walk, so a person who skipped the greeting finds the same door later:

- Remotes with no settings anywhere: the list stays; the first row's sub is already "Not set up yet".
- Scenes empty: 2.9.
- Automations empty: 2.12.
- Settings never connected: 2.17 item 2.

---

## 4. Implementation order

The six changes that matter most, first. Each is shippable on its own; none changes the data shapes.

### The six

1. **The walk component, and the three guided setups as walks** (2.0, 2.16). Files: `web/js/core.js` (`walk()`, `showSheet`/`SHEET_KEY` moved here, the value row helper `valueRow()`), `web/js/automations.js` (`openWelcomeSetup`, `openWakeupSetup`, `openButtonsSetup` and their `render*` functions become step lists; `save*` unchanged), `web/styles.css` (the step caption, the plan tip, the ghost under the primary). This is the change the brief is about: one question at a time.

2. **The recipe sheet: usual ways, Show all ways, the lights value row, More** (2.6, 2.7). Files: `web/js/remotes.js` (`RECIPES` gains a `usual` map per gesture, `renderRecipeSheet` renders short or grouped, `openButtonSheet` loses the footnote, a `recipeMoreSheet()`; `applyRecipe('nothing')` stays and is called by "Clear this press"), `web/styles.css` (group captions inside a list card). It halves the words on the most-tapped sheet.

3. **Settings split into the glance and More settings** (2.17). Files: `web/js/settings.js` (`VIEWS.settings.body` split into `settingsGlance()` and `settingsMore()`, `nested()` returns `S.settingsMore`, `top()` uses `nestedTop('settings-back')`, `setupSteps` reduced to the how-to block), `web/js/boot.js` (the `settings-back` act), `web/js/core.js` (nothing new if `nestedTop` already takes the act name).

4. **The Next card, the greeting and Ideas for your home** (3.1 to 3.5). Files: a new `web/js/next.js` (the table, eligibility, the storage rules, `nextCardHTML()`, `openGreeting()`, `openIdeas()`, the sort walk), `web/js/home.js` (the card slot replaces `sortBlockHTML` and `moodsTipHTML`), `web/js/core.js` (call `openGreeting()` where the "Connected to your home" moment ends), `web/js/settings.js` (the Ideas row), `web/index.html` (script tag), `web/sw.js` (bump the version so the new file is cached), `hub/validate.js` (allow `settings.greeted`).

5. **Remote page and light page: short rows and More sheets** (2.2, 2.5). Files: `web/js/remotes.js` (`shortDescribe()`, `remoteDetail` layout, `remoteMoreSheet()`, the hint only while unset, the usual-layout tip as an offer with "I'll pick myself"), `web/js/light.js` (`openLightSheet` button row, `lightMoreSheet()`, the mood row's trailing "Change" chip in `moodRowHTML`), `web/js/home.js` (nothing: the mood row is rendered by `light.js`).

6. **Something else as a walk, and the editor's value rows; the wind-down row** (2.12, 2.14, 2.15). Files: `web/js/automations.js` (`openEditor(null)` starts a walk that ends in `aeSave`; `renderEditor` uses value rows for lights, what happens and days; `windDownCardHTML` becomes a row plus `openWindDownSheet()`; the help sentence and the caption move), `web/styles.css` (nothing new beyond change 1).

### Then

7. Scene editor (2.10): `web/js/scenes.js` (`openSceneEditor` draws included lights only, `openSceneLightsSheet()`, `sceneMoreSheet()`).
8. Add a device as a walk (2.19): `web/js/adddevice.js` (`adShow` steps, `adStart()` moved to the kind pick, the 45-second caption timer, the technical link gated on `AD.error`).
9. Connect your home as a walk (2.18): `web/js/home.js` (`openSetupSheet`), `web/js/settings.js` (the tip while never connected).
10. Small copy: the roles legend (2.11), the Hue find sheet (2.20), the Scenes empty state (2.9), the remove confirm's technical link (2.21), the automations empty tip (2.12).
11. The defect: `web/light.css` line 115, scope the timer chip rule so the dark sheet's `.chip.sel` colours win (delete the rule, or add `.sheet.dark .td .chips .chip.sel { background: var(--on-dark); color: var(--now); }`).

### What the Playwright suite needs

`ui_test2.js` and `err_test.js` must still print `errors: none`. Selectors that change: the remote page's "Not your remote?" link (now inside the More sheet), `[data-act="advanced"]` (now a row in the recipe More sheet), `#sheet-root details.more summary` on the recipe sheet (gone; use `[data-act="recipe-more"]`), the setup sheets' `[data-act="gs-save"]` (now the plan step's primary, same act name), the settings `details.more summary` (now under More settings). The `ux_shots.js` script in the scratchpad reaches every screen and is the quickest way to re-audit after each change.

## 5. The kind picker: where, then what

A kind of light is a place and a fixture, `<place>-<fixture>`: `desk-lamp`, `desk-tape`, `ceiling-track`, `window-track`. The room is separate (the bridge already knows it), so a light reads "Living room · Window track light": the room name, then the kind's label. The table lives in one file, `web/js/kinds.js`, loaded by the app as `KIND_DEF` and required by `hub/validate.js`, so the ids and the roles (ambient fills the room, task is light for your hands, accent is lamps and glow) are the same on both sides. Ten places (Ceiling, Wall, Window, Desk, Table, Floor, Under a cabinet, Shelf or cove, Bed, Outside), three to eight fixtures each, 46 kinds. The nine one-word ids from before (`pendant`, `desk`, `reading`) still read: the app resolves them to the new id on read and the hub writes the new id back on the next save.

The picker is a walk of two questions in one sheet (`openKindSheet` in `web/js/light.js`), opened from the light's More sheet or by the sort walk:

1. **"Where is this light?"** · sub "Kitchen Cans · Kitchen. Moods use it to know what to dim." A `.card.pad0.list` of the ten places, each a `pick` row with a glyph, the name, and a second line naming its first three fixtures ("Flush light, downlights, pendant, …"). The place that holds the current kind, if any, shows the kind's label on its second line and a check. Tapping a row advances.
2. **"What is it?"** · sub "Kitchen Cans · Kitchen · Desk". Only that place's fixtures, each a `pick` row with the fixture's icon, its name and its role as the second line ("Task · light for your hands"). The current answer shows selected; tapping it again clears it (a footnote says so, only while something is chosen). Picking saves at once through `saveSoon()`, as before, and the sheet stays open showing the choice. The back circle returns to step 1.

The sheet keeps one height across the two steps (`showSheet` with the same key locks it, as every walk does), so nothing jumps when the list gets shorter. When the light already has a kind, opening the picker lands on step 2 for its place, with step 1 one tap back; from step 1 the back circle goes where the picker was opened from (the More sheet). In the sort walk (3.3) both steps carry the "Light n of N" caption; Skip is in the footer on both, Next / Done on step 2 and on step 1 only once the light has a kind, so the primary never asks to move on from a light that has no answer yet.

Every fixture has an `#i-lamp-<fixture>` symbol in `web/index.html`, in the same hand as the original nine (24 by 24, round caps); `lightIcon(d)` returns the fixture's icon, so the tiles, the room rows, the light page's disc and the sleep-timer lamp all draw it. Places reuse an icon of their kind where one fits (Ceiling, Wall, Table, Floor, Under a cabinet) and the room glyphs otherwise (Desk, Bed, Outside), plus two small ones of their own (`window`, `shelf`).

## 6. Warmth and colour (Hue lamps)

A Hue lamp that can do white temperature or colour says so in the inventory (`ct`, `color`, `ct_range`), and its state carries `color: {mode, kelvin, hex}`. The app draws one component for it (`web/js/color.js`, styles in `web/light.css`), on the light page and in the scene editor. The connector clamps every request to what the lamp can do; the app never sends a colour to a Caséta light.

1. **Light page, a lamp with white temperature.** Under the brightness readout, a row **"Warmth"** with its value at the right ("Warm · 2700 K": the friendly name, then the kelvin small). The slider's track runs warm to cool over the lamp's own range; the names are Candle (to 2300 K), Warm (to 3000), Soft white (to 3700), Neutral (to 4500), Cool (to 5500), Daylight above. Every move sends at once (one in flight, newest wins, as brightness does), and the disc and the well take the tone.
2. **Light page, a colour lamp.** Below Warmth, a row **"Colour"** with its value at the right (the swatch's name, "Custom", or the warmth when the lamp is showing a white): a scrolling row of round swatches, the whites from the warmth scale first (those inside the lamp's range), then Red, Orange, Amber, Yellow, Green, Teal, Blue, Indigo, Purple, Pink. The one the lamp is showing wears the blue ring. Then the value row **"More colours…"** (a dot of the current colour at the right), which opens in place, keeping the sheet's height: a **Hue** strip on a rainbow track and a **Saturation** slider whose track runs from white to the picked hue. Brightness first, warmth next, the full colour picker one tap further.
3. **The disc, the rows and the tiles.** A lamp whose state carries a colour is painted in it wherever a disc stands for it: the light page's disc and well, the room row's disc, the scene tiles. Brightness still sets how pale the tint is; off is the off grey. A white tone is painted on a warm-to-cool scale (the lamp ramp's orange at 2000 K, peach in the middle, a pale blue at 6500 K) so a cool white still reads as lit on a white sheet.
4. **Scenes.** "New scene" and "Use the lights as they are" store, for a Hue lamp showing a colour, `{level, kelvin}` or `{level, hex}` beside the plain numbers of the other lights. In the editor, such a lamp's row keeps its slider and gains a value row under it: **"Colour"** (or **"Warmth"** for a white-only lamp) · a dot and the value ("Blue", "Warm · 2700 K", or "As it is" when the scene leaves the colour alone). Tapping it opens the same component in place, with an extra first chip **"As it is"** that returns the entry to a plain level. The row's slider changes the brightness and keeps the colour.
5. **What stays brightness only.** The Now view, the Light now bar, the house dimmer, room sliders, moods and the room toggle: colour lives on the lamp's own page and in scenes, where a person adjusts one lamp or keeps a look.
6. **Gestures.** The warmth, hue and saturation sliders are native range inputs, so `js/slide.js` gates them like every slider: a passing finger scrolls, a sideways drag or a tap sets. The swatch row scrolls sideways like any chip row.
