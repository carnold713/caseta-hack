# What the app does

This describes everything the app can do, in words, with no reference to how any of it
currently looks or where any of it currently sits. It is written for somebody designing a new
version from scratch: the list of things that have to remain possible, and the reasons behind
the ones whose reasons are not obvious. How they are arranged, named, grouped or drawn is open.

Nothing here is a layout instruction. Where a behaviour is described precisely ("within two
minutes", "after ten seconds"), that is because the number is load bearing and was arrived at
by hitting the problem, not because the screen has to say it.

---

## 1. The shape of the thing, because it constrains the design

The app controls the lights in one home. It is used almost entirely one handed, often in the
dark, often while walking into a room, and very often to do one small thing and put the phone
away. Someone opening it has usually already decided what they want.

It has three parts. A phone app, a small server on the internet that holds the settings, and a
connector running on a computer inside the house that actually talks to the lighting hardware.
This matters to the design in four ways:

**Something can always be out of reach.** The phone can lose the internet, the house computer
can lose power, the lighting bridge can stop answering. These are different failures and the
app can tell them apart. It should never present a failure as though the user did something
wrong, and it should never blank out what it already knows just because it briefly cannot
confirm it.

**The remotes keep working when the app does not.** The physical buttons in the house are run
by the connector from its own cached copy of the settings. Losing the internet does not stop
them. The app should never imply otherwise.

**State is live and arrives unprompted.** Lights change because somebody flipped a switch,
pressed a remote, or because an automation fired. The app is told as it happens. It is not a
form that gets submitted; it is a window onto something moving.

**There is no save button anywhere, by design.** Every change takes effect immediately and
offers to undo itself. This is a hard rule. Any new design has to keep it.

---

## 2. What the home is made of

The app works with several kinds of hardware at once and treats them as equals wherever it can.
A person should rarely need to know which brand a light is.

**Dimmable lights.** A level from 0 to 100. In-wall dimmers, plug-in dimmers, and lamps on the
other systems below.

**On-or-off lights and switches.** No level, just on or off.

**Fans.** Off, low, medium, medium-high, high. Five states, not a slider.

**Shades, blinds and drapes.** Open, close, stop part way, or go to a position.

**Remotes.** Physical button remotes mounted on walls or carried around. They have between one
and five buttons depending on the model, and the app knows the real button layout of every
model so it can show a picture of the actual remote in the user's hand rather than a list of
button numbers. The user can correct the model and the colour if the app guessed wrong, and
real product photography can replace the drawings.

**Colour lamps and white-temperature lamps.** Some lamps can show any colour; some can only
change how warm or cool their white is; some can do neither. The app knows which, per lamp,
from the hardware itself, and never offers a control a given lamp cannot honour. It also knows
each lamp's actual limits (which colours it can physically produce, how warm and how cool its
white goes) and quietly clamps any request to them, so nothing is ever asked for that would
come out wrong.

Three lighting systems are supported and can be mixed freely in the same room, the same scene,
the same button and the same automation: the Lutron Caséta system, Philips Hue, and Nanoleaf.
Adding a fourth should not require the design to change.

---

## 3. Controlling lights directly

**Turn one light on or off.** Everywhere a light appears.

**Set one light's brightness.** A continuous value, adjusted by dragging. Dragging must feel
like moving the light itself, not like submitting a number: the light should follow the finger
in something close to real time rather than waiting for release.

**Nudge a light up or down** by a small step without dragging.

**Set a fan's speed** to one of its five states.

**Open, close or stop a shade**, or put it at a position.

**Set a lamp's colour.** Two different questions that must not be conflated:

- *Which colour*, for a lamp that can show any colour. The user needs a fast way to reach the
  common colours and a way to reach any colour at all, including a precise one.
- *How warm or cool the white*, for a lamp that does white only, or for a colour lamp when the
  user wants white rather than a colour. This runs from candlelight through to daylight, over
  whatever range the particular lamp supports.

A lamp that can do both needs both, and needs it to be obvious which one it is currently
showing. When a scene or an automation has set a lamp to some colour, the colour controls
should show where that colour sits, not reset to a default.

**See what every light is doing right now**, at a glance, including which are on, how bright,
and what colour. A lamp showing a colour should be identifiable as that colour without opening
it.

**Control a whole room at once**: on, off, and a brightness for everything in it.

**Control the whole house at once**: everything off, everything on, and a brightness across
everything that is currently lit.

**Turn the house off completely**, meaning the lights and also the fans stopped and the shades
closed. This is deliberately a separate, slightly harder action than "lights off", because it
is a bedtime gesture rather than a leaving-the-room one.

**Mark the handful of lights worth reaching fastest.** A user can star any light, and starred
lights get a shortcut that does not involve going through their room. Most homes have three or
four lights that account for most of the day's taps, and they are rarely in the same room. A
home with nothing starred should show no trace of the feature rather than an empty shelf.

---

## 4. Rooms

Rooms are the app's own. They start out mirroring whatever the connected bridges already
report, so a new user's home is already organised, but from that moment the app's list is the
truth.

**Make a room. Rename it. Delete it.**

**Move any light, shade or remote into any room**, regardless of which system it belongs to. A
Hue lamp and a Caséta dimmer can share a room.

**Give a room a photograph.** A picture of the actual room, used as its identity. There is also
a generated fallback for rooms without one, so no room ever looks unfinished. Photographs are
optional and removable, and removing one is undoable.

**See what a room is doing**: how many of its lights are on, and at what overall level.

**Get to everything about a room from the room**: its lights, its scenes, and its setup.

When a room is created or renamed, the app also asks the Lutron bridge to keep up, so other
Lutron apps see the same names. That request is undocumented and some bridges refuse it. When
that happens nothing is lost: the room is the app's own and works fully. The user is told, once,
plainly, that the bridge has no matching room of its own. This must not read as an error.

---

## 5. Scenes

A scene is a saved look: a set of lights, each at a level, each with a colour where it has one.

**There is one kind of scene.** This is a rule, not an accident. A scene can belong to a room or
to no room, and that is the only distinction. A scene with a room appears on that room, and is
grouped under it in any list of scenes. A scene without one is simply not in a room. Any scene
can be given a room, or have its room taken away, at any time.

**Make a scene from the lights as they are.** The most common way: set the room up by hand, then
save that.

**Edit a scene.** Change its name, which lights are in it, the level of each, the colour of each,
and how long it takes to arrive.

**Run a scene.** One tap, from wherever the scene appears.

**A room can be offered five scenes automatically**: Bright, Relax, Dinner, Movie and Night,
computed from what each light in the room is for (see the next section). These are ordinary
scenes from the moment they exist. Changing one makes it the user's, and a later refresh leaves
it alone. They can be deleted, renamed, moved between rooms, or edited like anything else.

**Scenes arrive quickly.** Roughly a second. A scene is something you press and want to have
happened, not an effect to watch. Longer fades remain available per scene, up to half an hour,
for anyone who wants a scene to ease in. This came out of the five suggested scenes originally
taking up to eight seconds, which read as the app ignoring the press.

**Lutron's own scenes appear alongside**, runnable, but not editable here, since they live in
Lutron's app.

**A scene can be starred too**, which brings it to the front wherever scenes are listed. The
same idea as starring a light: a home usually has one or two scenes that get run constantly and
a dozen that do not.

---

## 6. What each light is for

Two separate pieces of information can be recorded about each light, both optional, both used to
make other things smarter.

**What a light is *for*** in its room: the main light, a task light, a lamp for atmosphere, or
something decorative. This is what the five suggested scenes are computed from. Bright turns
everything up; Relax drops the task lights and keeps the lamps; Movie takes almost everything
down. The app guesses from the light's name and the user corrects it.

**What a light *is***: where it is and what kind of fixture it is. Ten places (ceiling, wall,
window, desk, table, floor, under a cabinet, shelf or cove, bed, outside) and the fixtures that
make sense in each, 46 in total. A pendant, a chandelier, a track light, puck lights, a porch
light, a desk lamp, a tape light, and so on.

The kind gives the light a recognisable icon and a sensible name, so a list of lights reads like
a room rather than like an inventory.

---

## 7. Remotes and buttons

This is the heart of the app and the largest body of functionality. The physical remotes in the
house are Lutron Picos, which by default do one fixed thing. The app gives every button far
more.

### The three ways a button can be pressed

Every button on every remote can be given three different jobs:

- **A press.**
- **A press twice**, quickly.
- **A hold.**

The timing that separates these is adjustable, with a live tester so the user can press their
actual remote and see what the app detected. This matters because people's hands differ and
because a slow double press that registers as two single presses is baffling.

One consequence must be surfaced: giving a button a double press necessarily makes its single
press wait a moment, so the two can be told apart. The user should be told this when it first
becomes true of a button, not left to notice the lag.

### Which lights a button drives

Every job a button does is aimed at something. That can be:

- One light.
- A whole room.
- Several lights and rooms at once, picked freely, without having to create a named group first.
- The whole house.
- All the shades, or all the fans.
- A named set the user made deliberately, for the cases a room does not express.

Different jobs on the same button can aim at different things. The press can drive three lights
while the hold drives one.

### What a button can be made to do

The app offers these as a list of plain-language choices. The user picks one sentence; they do
not build anything. Roughly two dozen of them:

**Basic.** Turn on. Turn off. Turn on or off, depending on what is currently lit. Full
brightness. Half brightness. A nightlight level. A slow fade down to a low level for watching
something.

**Back to how it was.** Puts the lights back exactly as they were when they went off: the
brightness each was at and the colour each was showing. Whichever scene was running comes back
without the scene needing to be named, and so does a state that was never a scene. What comes
back is deliberately the recent sweep rather than the whole archive: whatever went off most
recently and everything that went dark within about two minutes of it. That way a room switched
off on Tuesday and not wanted since is not part of tonight's press. With nothing remembered it
behaves as a plain "on".

**Stepping.** Step through brightness levels, one per press. Step through a chosen list of
scenes, one per press, in an order the user sets. On a remote with a pair of arrow keys, the
step-through can be put on both at once, forwards on the up arrow and backwards on the down
arrow, so one press moves on and the other undoes it.

**Gradual.** Brighten while holding, dim while holding, stopping when released. Dimming by hold
stops at a glow rather than going to off, because off should always be a deliberate tap.

A button whose press steps the brightness gets this for free on its hold: with nothing chosen for
the hold, holding it ramps the same direction the press nudges, and letting go stops. That is what
an arrow on a wall dimmer does, and making somebody set it by hand on both arrows is work to arrive
at the obvious. Anything chosen by hand wins, and the app says on the button that the hold already
does something rather than reading as unset. It does not apply to a fan, where a step is a speed and
a ramp means nothing.

**Scenes.** Run any scene. Offer to create the five suggested scenes for a room that has none.

**Timers.** Start a sleep timer over the target. "Light the way", which puts lights on very dim
for a quarter of an hour and then turns them off by itself.

**Leaving and going to bed.** Goodnight, which turns everything off but leaves the route to bed
dimly lit for a couple of minutes. Leaving, which does the same with the light by the door. Both
also stop the fans and close the shades where the home has them. The user picks which light is
the one that stays on.

**Everything off.**

**Fans.** Faster, slower.

Only the handful most likely for the button being edited are shown at once, with everything else
one step away. Which handful depends on what kind of press it is, what the target is, and
whether the button is an arrow key. This is worth preserving in some form: the full list at once
is too long to scan while standing in a hallway.

### Night versions

**Any button can do something different between two hours the user sets.** The same press, a
different result after the house goes quiet: coming on dim instead of bright, for instance. The
hours are one setting shared by everything that cares about them.

### The full editor, for the cases the sentences do not cover

Behind the simple list, a button can also be given an arbitrary sequence: several steps in a
row, with waits between them, each step with its own target, its own fade time, its own level or
colour. This is where timers, caps, colour commands and delays can be composed by hand. Most
people never open it; the people who need it need it badly.

The underlying vocabulary, for completeness, is: set a level, nudge a level, start raising,
start lowering, stop, set a fan speed, run a scene, run one of the app's scenes, step through
levels, step through scenes, set a colour or a white temperature, cap a level (bring anything
above a ceiling down without touching anything already dimmer), start a timer, cancel a timer,
put things back the way they were, and wait.

### The remote itself

**See a remote as a picture of the real thing**, with its real buttons, so the user taps the
button they are holding rather than choosing "button 3".

**Press a button on the real remote and have the app jump to it.** The single most useful thing
in the whole feature, because it removes the need to know which remote is which.

**Set up a remote the usual way in one action.** Most people want top-on, bottom-off, hold to
brighten or dim, and the middle button on something useful. Offering that as a single choice,
and letting them adjust afterwards, is much better than making them fill in five buttons.

**Start a remote over.**

**Correct the remote's model and colour** when the guess is wrong.

**Move a remote to a different room.**

**Remove a remote from the home.**

**See at a glance which buttons have something on them and which do not**, and see when a button
points at a light that no longer exists.

**Know that the remote may still do its original Lutron job as well.** The app explains this and
explains how to stop it, because a button that does two things at once is otherwise a mystery.

---

## 8. Automations: things the home does by itself

**Guided setups** for the four things most people want, each a short series of plain questions
rather than an editor:

- **Welcome lights**: on before you get home, off at bedtime.
- **A wake-up light**: a lamp that rises slowly before the alarm.
- **A goodnight button**.
- **A leaving button**.

**A from-scratch editor** for everything else, which can express:

- **When**: a clock time, or sunrise, or sunset, with an offset of up to three hours either side.
- **Which days** of the week.
- **What happens**: any of the actions a button can do, including several in sequence.
- **An optional matching off time**, so "on at sunset, off at eleven" is one thing rather than two.
- **A condition**: only if something is already on, or only if everything is off. This is what
  stops a welcome light from firing when you are already home.
- **Skip tonight**, without deleting or disabling anything.
- **Pause an automation** without deleting it.

**Anything due soon is surfaced** so the user is not surprised, with a way to skip it from there.

**Sunrise and sunset need to know roughly where the home is.** This can be taken from the phone
once, or picked from a list of cities. It is stored on the user's own server and used for
nothing else. Time zone is handled too, including noticing when the phone's time zone and the
home's disagree, and offering to fix it.

**The evening wind-down.** Turning a light "on" gets gradually dimmer as the evening goes on, so
that the same button does the right thing at nine and at midnight. It has one control that
matters: when the house goes quiet. Behind that, for the people who want it, the curve itself is
adjustable.

---

## 9. Timers

**Set a sleep timer** on one light, a room, or everything that is on. The lights go off by
themselves after the chosen time, fading rather than snapping.

**See a running timer** and how long is left.

**Cancel a running timer.**

Timers can be started by hand, by a button, or by an automation.

---

## 10. Follow the day

A lamp can keep its white matched to the time of day by itself, for as long as it is on: cool and
bright around midday, warm in the evening, deep and dim late at night. The curve is anchored to
the home's own sunrise, solar noon and sunset, and is clamped to what each lamp can actually
show.

**Switch it on per lamp**, from the lamp, from a room's setup for all the lamps in that room that
can do it, or as part of a scene (a scene entry can say "follow the day" instead of naming a
fixed colour).

**See what the lamp is set to right now and the shape of the day**, so the feature is legible
rather than magic.

**Setting a colour or a warmth by hand pauses it** for that lamp until the lamp is next turned
on. This is important: the user's explicit choice always wins, and it un-pauses at the natural
moment rather than needing to be switched back on.

**Brightness can follow too**, off by default. When on, a following lamp also dims towards the
evening, on the same curve as the evening wind-down so the two never disagree.

**Three different speeds, because they are three different events.** Drifting with the sun over
the course of the day is a change nobody asked for and should go unnoticed, so it is slow, about
half a minute. A lamp being switched on should arrive at the right white immediately, because
until it does it is showing the wrong thing. A scene bringing a lamp into following should arrive
with the scene.

**A lamp comes on already the colour it is going to be.** When a lamp that was left on some
colour is switched on, the colour is set while the lamp is still dark, where the change cannot be
seen, so the fade up happens at the destination colour rather than travelling there in front of
the user. Any new design should hold onto this: the brightness fading in is pleasant, the colour
sliding from blue to white is not.

Lights that have no colour at all are never offered any of this.

---

## 11. Setting the home up

**Connect to the home for the first time**, with a clear account of what the connector is, where
it has to run, and the single line that installs it.

**Add a Lutron device without using the Lutron app.** The bridge is put into listening mode, the
user holds the button on the new device, the app reports what the bridge heard, and the user
names it and picks a room. This is experimental and speaks an undocumented protocol, so every
exchange with the bridge is recorded and readable from the phone for when a bridge answers
differently than expected.

**Remove a device from the home**, which tells the bridge and clears everything here that
referred to it.

**Hide a device** that exists but should not clutter the app, and unhide it later.

**Connect a Philips Hue bridge.** The connector finds it on the network, the user presses the
round button on the bridge, and its lights and rooms join the app.

**Connect Nanoleaf controllers.** Each pairs on its own by holding its power button, joins as its
own light, and can be forgotten on its own. There is no bridge, so this is a list rather than a
single connection. Nanoleaf's own built-in effects are out of scope; the app treats a controller
as a light with a colour.

**Be walked through the things worth doing next.** The app can tell when a home is half set up
(a remote with nothing on it, lights with no kind recorded, a room with no scenes, no welcome
light, no goodnight button) and offers one suggestion at a time rather than a checklist. This
should feel like advice, not like nagging, and must be dismissible.

**Install the app to the phone's home screen**, with instructions.

---

## 12. Preferences

- **Name the home.**
- **What the power button does when nothing is lit**: bring back what was on before, or turn
  everything on.
- **The level a room or a set comes on at.**
- **The default fade time** for ordinary changes.
- **The double-press window and the hold threshold**, with the live tester.
- **When the house goes quiet**, the two hours that drive night versions of buttons, the evening
  wind-down, and the night look.
- **The night look**: the app itself dims and warms after dark. Automatic, always, or never.
- **Whether the evening wind-down is on.**
- **Whether following lamps also dim in the evening.**
- **Whether the connector updates itself** when a new version is available, and a way to update
  it by hand.
- **Time zone and location.**
- **Back up every setting, and restore from a backup.** Plain text, so it can be kept anywhere.
- **Log out.**

---

## 13. Knowing what is going on

**The connection is always legible, and it distinguishes three states**, because they call for
different reactions:

- Everything is fine.
- Something dropped a moment ago. For the first ten seconds this is deliberately quiet: a
  neutral, breathing indicator, no red, and not a word on the page changes. Most drops recover
  within that window and the user should never have known.
- It has really been gone a while. Only now does it go red, say the state on screen is the last
  known one, and offer help.

A server that has just restarted has no inventory until its own connector reconnects. The app
keeps the home it already knows rather than blanking itself for that minute.

**Recent activity**: what was pressed, what ran, and what happened. Useful for "who left the
lights on" and for tuning the press timing.

**Connection diagnostics** for the case where every remote in the house goes quiet at once. The
app can report how many buttons the bridge is offering, how many buttons have something on them,
when the last press arrived, how long the connector has been running, and the bridge's own last
words. Crucially it distinguishes a real fault from noise the app itself caused, and leads with
whether anything needs the user at all, rather than presenting a log and leaving them to guess.

**Every change can be undone**, immediately after making it.

---

## 14. Things that are deliberately not there

Worth knowing so they are not reinvented as gaps:

- No accounts, no cloud service, no third-party access. One home, one password.
- No editing of Lutron's own scenes; they belong to Lutron's app.
- No Nanoleaf effects.
- No save buttons.
- No requirement that the user understand which brand any light is.

---

## 15. The rules behind the behaviour

These are the principles the current behaviour was derived from. They are the part most worth
carrying forward, because they generate the right answer for cases this document does not list.

**Nothing the app can do may disappear.** Things may move, merge or be renamed. They may not be
dropped.

**A thing the user asked for happens now. A thing the app decided happens slowly.** This is why
a scene arrives in a second, a lamp switched on gets its colour immediately, and drifting with
the sun takes thirty seconds. Any new timing decision should be checked against this rule.

**The user's explicit choice always beats the app's.** Setting a colour by hand stops the
automatic colour. Editing a suggested scene stops it being overwritten. Nothing the app does
automatically should ever be hard to override.

**An expected state is not a fault.** A bridge that refuses an undocumented request, a lamp that
cannot do colour, a brief disconnection, a room with no scenes yet: none of these are errors and
none should be dressed as one.

**Say the thing, not the jargon.** The interface has never used the words "binding", "target" or
"schedule" where a person can see them. It says what a button does and when a thing happens.
This is worth keeping whatever else changes.

**Show the value, not just the label.** A button's row says what that button does. A light's row
says what the light is doing. A scene's tile says what it contains. A person should be able to
answer "what is set up here" without opening anything.
