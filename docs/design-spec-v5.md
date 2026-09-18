# Pico Hack: visual design specification v5 (Lantern)

Lantern is Tenzing with the lights on. It supersedes `docs/design-spec-v4.md` (the Tenzing skin) and
is assembled from five deliverables that were written in parallel: the creative director's
`00-direction.md` (binding), the app designer's `01-ui.md`, the UX designer's `02-ux.md`, the colour
and accessibility engineer's `03-colour.md` (with its runnable validator `tint_check.js`) and the
motion designer's `04-motion.md` (with `inkswap.js`). Where two of them disagreed, this document
rules; every ruling is listed in section 12 so the decision is auditable.

Everything in `design-spec-v4.md` stands except where a reversal is named here. The `#f8f8f8` page,
white cards, one blue, Helvetica Neue, the radii ladder 4/8/12/16/24/28, the type ladder, the shadow
ladder, the wells, the chips, the switch, the sheet, the toast and the four-item tab bar are
unchanged and are not reopened.

Values are exact. Where a number was measured it says so; the measurements were taken at 390x844 and
360x844 against the app's own `styles.css`, `light.css` and `motion.css`, and the room sheet's
geometry was re-measured in the running rig while assembling this document (section 4.8).

---

## 1. What Lantern is

### 1.1 The one idea

**The light is the biggest thing on the screen, and it is the only thing with colour.**

Our subject is light, so the rule is literal: a light that is on is drawn in the hue it is actually
emitting, on a filled surface big enough to read across a dark room, with its brightness on the disc,
in words, and in the well. A light that is off is a quiet white card. Every screen answers one
question at a glance, from arm's length, with the phone held low: what is lit right now, and how
much.

When two designs disagree later, the one that makes the lit thing more obviously lit wins. When a
proposal adds colour, weight or size to something that is not a light or a thing your hand is
touching, it loses.

Personality, for copy and for future work: quiet in the dark, honest about what the lights are doing.
White paper, one blue for your hand, and light as the only colour, at its real size and its real hue.
It never shouts, never decorates, and never shows a state it cannot vouch for.

### 1.2 The three reversals of v4

| # | v4 said | Lantern says | where |
|---|---|---|---|
| **R1** | A room or device that is on takes a `--blue-10` fill with a `--blue-20` border (v4 §5, "The room card") | A lit card is tinted with the light's own colour, pinned to one WCAG luminance, with white ink. `--blue` never fills a card again | §3 |
| **R2** | Tinting stops at the lamp disc: "the light stays the artwork" on white paper | Tinting extends from discs to card **surfaces** and to the room hero. The light is now literally the surface | §3, §4 |
| **R3** | "One light world": a near-white page, white cards, white floating surfaces, no dark ground (v4 §1.1) | A lit card is a dark saturated ground with white ink. That suspension is **confined to lit device cards, lit room cards and the light sheet's stage** and to nothing else | §1.3 |

### 1.3 The boundary of the reversal

R3 puts a dark saturated ground into a system whose first principle was one light world. That is a
real cost and it is bounded:

- **The page stays `#f8f8f8`.** A dark page is not a token change, it is every sheet, every off card,
  the tab bar, the input outlines and a shadow ladder built to make white read on white. It is a
  rewrite, not a slice.
- **Untouched:** off cards, sheets, menus, the toast, elevation and the shadow ladder, the tab bar,
  and blue as the control accent. Blue is not merely preserved, it is promoted: it is the luminance
  anchor the whole tint system is built on (§3.1).
- **The house card stays `--surface` white.** It is always present, always at the top, and it is a
  control panel rather than a device. A dark slab under the large title would swamp Home. It is not a
  lit card and does not take the fill.
- **Night is slice 6 and must not block slices 1 to 5. Lit cards get no night variant** (§3.4, §10).
- **The glare answer is the night look, which already exists.** `:root[data-night="1"]` and the
  Automatic / Always / Never control in Settings are in the app already.

### 1.4 What the reference gave us, and what we refused

The reference is a three-screen orange smart-home concept. Taken: the filled / unfilled card states,
the two-column device grid, the corner power button, the scene icon row, the room hero photograph,
the mode chip row, and the composition of the device screen (one object, one huge readout, one
control).

Refused, and not to be reopened: the greeting header with an avatar (one user, no accounts; the `.t1`
title and the status circle stay exactly as they are), the raised centre "+" and a fifth tab, the big
radial dial, floating round buttons over the room hero, the segmented pill row as navigation, any
invented data (no energy figures, no presence, no arrival greeting), any second accent, any
gesture with no visible twin, and any change that makes an existing capability unreachable.

**The reference's own values are refused with them.** Its Ceiling Light card measures roughly
`#F96D0E`: white title at 2.91:1, white-at-35% slider track at 1.46:1 against the card. We take the
idea and not the numbers. Our fill is about one stop darker, and that is the whole reason the feature
can ship.

### 1.5 The arbitration between warmth and blue

> **Colour on a surface answers "what is this light emitting right now". Blue answers "what you
> selected, or what your hand can touch". No surface may use both to mean the same thing.**

- **Tinted fills** come from one function and one function only: `litSurface()` (§3.2), seeded from
  the state the app already keeps through `tintOptsFor(id)`. Nothing computes a fill any other way.
- **Blue stays on controls** on white surfaces: switch tracks, well fills on an off card, selected
  chip outlines, the active tab pill, focus rings, links, the house power button.
- **On a lit card there is no blue at all.** The well's fill is `#FFFFFF` on a darkened own-hue
  track; the power button is a white disc with the card's own fill as its glyph. This is what
  answers the app designer's note that at `--tile-ctl: var(--blue)` the well would be the heaviest
  thing on a lit tile: at the engineer's real values it never is.
- **A disc on a tinted card drops its blue `.ringed` outline.** The capability rings stay:
  `.lring.color` (rainbow) and `.lring.ct` (warm to cool) are how you know a lamp *can* show colour.
- **"On" is never carried by fill alone.** At 5% a dimmer's fill is close to a 40% dimmer's. Every
  lit tile states its value in words ("5%", "Off", "Medium") and the corner power button carries the
  boolean. Colour is never the only channel, which is also what keeps us inside WCAG 1.4.1.
- **Level is never carried by the fill alone either.** A colour lamp's card is the same at 1% and at
  80%, because the card's job is identity. The disc, the words and the well carry brightness.

### 1.6 The shape of the app

Unchanged from `ia-v5.md` and confirmed here: **four tabs** (Home, Remotes, Automations, Settings),
Scenes at `#scenes` behind "See all", **a room and a light open in a bottom sheet over Home**, room
setup is still a page at `#room/<area>/setup`, there is no Light now bar and no Now view.

---

## 2. Tokens

### 2.1 One naming scheme for the whole app

Two prefixes, and the difference between them is *who writes them*.

| prefix | written by | scope | example |
|---|---|---|---|
| `--t-*` | `tintApply(el, opts)` in `web/js/color.js`, per element, at paint time | live colour on a tinted surface | `--t-fill` |
| `--tile-*`, `--grid-*`, `--hero-*`, `--scell*` | `:root` in `styles.css`, once | static geometry | `--tile-min-h` |
| `--m-*` | `:root` in `motion.css`, once | durations and delays | `--m-track` |

The app designer's placeholder colour names (`--tile-fill`, `--tile-ink`, `--tile-ink-2`,
`--tile-ctl`, `--tile-ctl-bg`, `--tile-edge`, `--tile-press`) do not ship. They map onto the
engineer's real keys as follows, and the engineer's set is the set of record because `tintApply` is
the single writer and its object keys map to the properties mechanically.

| placeholder (`01-ui.md`) | real property | transform key | value on a lit card |
|---|---|---|---|
| `--tile-fill` | `--t-fill` | `fill` | the hue at luminance 0.1529 |
| `--tile-press` | `--t-fill-pressed` | `fillPressed` | the same hue at 0.82 of that luminance |
| `--tile-ink` | `--t-ink` | `ink` | `#FFFFFF`, always |
| `--tile-ink-2` | `--t-ink-2` | `ink2` | the hue at luminance 0.8850 |
| `--tile-edge` | `--t-border` (the card's own edge) | `border` | `rgba(0,0,0,.28)` |
| (none) | `--t-line` (any control boundary) | `line` | the hue at luminance 0.6050 |
| `--tile-ctl`, as the well's fill | `--t-well-fill` | `wellFill` | `#FFFFFF` |
| `--tile-ctl-bg` | `--t-well` (the well's track) | `wellTrack` | the hue at 0.42 of the card's luminance |
| (none) | `--t-well-line` | `wellLine` | the same as `--t-line` |
| `--tile-ctl`, as the power button | `--t-btn-bg` | `btnBg` | `#FFFFFF` |
| (none) | `--t-btn-ink` | `btnIcon` | the card's own `fill` |
| (none) | `--t-btn-bg-pressed` | `btnBgPressed` | the same as `ink2` |
| (none) | `--t-btn-ink-pressed` | `btnIconPressed` | the card's own `fill` |
| (the level) | `--p` | written by `tintLevel(el, v)` | `0%` to `100%` |

`--tile-ctl` conflated two surfaces that the transform separates: the well's fill and the power
button's face. They happen to be the same colour (`#FFFFFF`) on a lit card and are different colours
on an off card, so they are two properties.

### 2.2 Added: the painted colour tokens

Declared in `:root` with the off-card values as fallbacks, so an element that has never been through
`tintApply` renders as an ordinary Tenzing card and nothing can flash.

| token | fallback | use |
|---|---|---|
| `--t-fill` | `var(--surface)` | the card's surface |
| `--t-fill-pressed` | `var(--fill-1)` | the card's surface while the body is pressed |
| `--t-ink` | `var(--text)` | the name, and any glyph drawn directly on the card |
| `--t-ink-2` | `var(--text-2)` | the value line and a room's sub line |
| `--t-line` | `var(--line-2)` | any visible control boundary on the card |
| `--t-well` | `var(--surface)` | the slider well's track |
| `--t-well-fill` | `var(--blue)` | the slider well's fill |
| `--t-well-line` | `var(--line-2)` | the slider well's 1px outline |
| `--t-btn-bg` | `var(--fill-2)` | the round power button's face |
| `--t-btn-ink` | `var(--text)` | its glyph |
| `--t-btn-bg-pressed` | `var(--fill-3)` | its pressed face |
| `--t-btn-ink-pressed` | `var(--text)` | its pressed glyph |
| `--t-border` | `var(--line)` | the card's own 1px edge |

### 2.3 Added: geometry

| token | value | use |
|---|---|---|
| `--tile-r` | `var(--r-lg)` 16px | the radius of a device tile, a room tile and a scene face |
| `--tile-pad` | 14px | tile padding |
| `--grid-gap` | 12px | between tiles, both grids |
| `--tile-min-h` | 172px (the box measures 174 with its hairline) | the device tile |
| `--rtile-min-h` | 150px (the box measures 152) | the room tile |
| `--hero-h` | **180px**, 160px under 380px wide | the room hero |
| `--scell` | 62px | a scene cell's width |
| `--scell-disc` | 56px | a scene cell's disc |

### 2.4 Added: motion

| token | value | what it is |
|---|---|---|
| `--m-track` | **80ms** | the one added duration. Not a transition between two states: the lag a surface uses to follow a finger that is still moving. The number is already in the app, hard coded in `light.js` (`gsap.quickTo(st, 'lv', { duration: .08 })`); this names it and gives it one home |
| `--m-ink-swap` | 60ms | a **delay**, not a duration: the point inside a 255ms fill cross-fade at which the ink flips polarity. Solved, not chosen (§7.2) |
| `--m-ink-swap-slow` | 95ms | the same point inside the 600ms offline fade |

The existing vocabulary is otherwise untouched: `--ease` `cubic-bezier(.4,.12,.3,1)` at 150ms
(press, hover), 255ms (select, toggle, state) and 300ms (sheet travel); `--ease-slow`
`cubic-bezier(.3,0,0,1)` at 600ms (progress, and now confidence). No fifth duration.

### 2.5 Reversed, and named as reversals

| what | where it was | what it becomes | why |
|---|---|---|---|
| A room or device that is on takes `--blue-10` with a `--blue-20` border | v4 §5 | `--t-fill`, the light's own colour at one luminance | R1. Fans and shades keep the blue on-state: warmth means emitted light and nothing else |
| Cards and tiles are radius `--r-s` 8 | v4 §2, §5 | a device tile, a room tile and a scene face are radius `--r-lg` **16** | still a step on Tenzing's own ladder. At 169px, 8 reads as a settings card |
| A device disc sits in a blue `.ringed` outline when on | v4 §5, "Lamp discs" | on a tinted tile the blue outline is dropped; `.lring.color` and `.lring.ct` stay | a blue ring on a surface that is already the light's colour is noise |
| A scene is a 112x112 Visual Picker face with `--shadow-1` | v4 §5, "Tiles" | on **Home** it is the 62px scene cell: a 56px disc over a label, no face, no shadow. The Scenes page keeps the v4 face | the reference's better form, and five fit across |
| Inline row sliders were deleted | `ia-v5.md` 2 (not v4) | a 36px well returns, on the device tile only, for a dimmable light that is on, through `slide.js`'s existing gate | slice 2, with the gate as the condition |
| The light detail's control is a 96x94 vertical well with two chevron circles | v4 §5, §6 | a 48px horizontal well, no chevrons. `.vslider`, `.vsteps` and `data-act="ld-step"` retire | one slider idiom in the whole app instead of two |
| The light detail's readout is the 136px status text button, and "`.display` is not used here" | v4 §6 | `.display` 40/48 is the readout | one object, one huge readout |
| A light row opened through a chevron and carried its value on a row | v4 §5 | the tile body is the way in; the value is the tile's second line | |
| The night look switches `.room.on` from `--blue-10` to `--fill-1` | v4 §2, "Night look" | a lit card has **no night variant**: it is already at 0.1529 with white ink. Night changes the page and the off cards only, in slice 6 | the system is night-proof by construction |

Unchanged and not reopened: `#f8f8f8`, white cards, one blue, Helvetica Neue, the type ladder, the
shadow ladder, the wells, the chips, the switch, the sheet, the toast, the tab bar.

---

## 3. The tint system

The colour and accessibility engineer's system is the system of record. This section is its contract,
its transform, its states and its cost.

### 3.1 The contract, in WCAG terms

> **Every lit card in the app is painted at exactly one WCAG relative luminance, 0.1529, which is the
> luminance of Lutron blue `#006DCC`; therefore white `#FFFFFF` body text on any lit card measures at
> least 4.5:1 (measured 5.17:1 to 5.24:1), the secondary ink at least 4.5:1 (measured 4.61:1 to
> 4.70:1), the visible boundary of every control at least 3:1 (measured 3.23:1 to 3.29:1), and the
> lit card against the `#F8F8F8` page at least 3:1 (measured 4.87:1 to 4.94:1), for every hue, every
> saturation, every level from 1% to 100% and every Kelvin from 2000 to 6500.**

Measured by the validator over 457 day surfaces, every ratio taken on the quantised 8-bit hex the
browser will actually paint:

| pair | WCAG clause | required | min | max |
|---|---|---|---|---|
| white ink on the card fill | 1.4.3 body text | 4.5:1 | **5.17** | 5.24 |
| secondary ink on the card fill | 1.4.3 body text | 4.5:1 | **4.61** | 4.70 |
| white ink on the pressed fill | 1.4.3 body text | 4.5:1 | **5.98** | 6.06 |
| slider well outline on the fill | 1.4.11 non-text | 3:1 | **3.23** | 3.29 |
| slider fill on the slider well | 1.4.11 non-text | 3:1 | **9.19** | 9.32 |
| slider fill on the card | 1.4.11 non-text | 3:1 | **5.17** | 5.24 |
| power button on the card | 1.4.11 non-text | 3:1 | **5.17** | 5.24 |
| button glyph on the button | 1.4.11 non-text | 3:1 | **5.17** | 5.24 |
| pressed power button on the card | 1.4.11 non-text | 3:1 | **4.61** | 4.70 |
| a lit card against the page | 1.4.1 use of colour | 3:1 | **4.87** | 4.94 |
| a lit card against an off card | 1.4.1 use of colour | 3:1 | **5.17** | 5.24 |

**Where we exceed AA on purpose.** Body text is held at 5.17:1 rather than 4.5:1. The margin is what
lets the fill's hue and chroma move freely (a whole 8-bit rounding wobble is 1.3% of the number and
can never reach the threshold) and it is what makes the same white ink legal on the pressed variant
with no second calculation.

**Where AAA is out of reach.** AAA body text is 7:1, which would force the fill to luminance 0.10,
where a saturated hue starts losing its identity (a 0.10 yellow is an olive brown, and the point of
the feature is that a yellow lamp makes a yellow card). AAA large text (4.5:1) is met everywhere. If
the owner ever asks for AAA body text the single change is `TINT.yOn: 0.1000` and the validator
re-proves the system at that value; the cost is hue identity.

**The one decision behind it:** hue is the message, lightness is the budget, chroma is the
confidence. Pin the fill's WCAG relative luminance to a constant, keep the lamp's hue exactly, keep
as much chroma as the sRGB gamut allows at that luminance, clamped into a band by how much the app
actually knows. Because luminance is pinned, the ink is a constant and can never flip; every ratio is
a property of the system rather than of a particular lamp; a deep violet lamp comes *up* to the
pinned luminance and a pure yellow lamp comes *down* to it, by the same line of code.

**Why 0.1529 and not another value in the legal window (0.10 to 0.1833):** it is the measured
luminance of `#006DCC`, so Lutron blue is a member of the ramp rather than an exception to it. A blue
switch card and a green lamp card are then the same surface at two hues, and the white ink on a lit
card is the same `--on-blue` white the app already puts on a blue button. The validator prints
`lum('#006DCC') = 0.1530` and shows the `ctl` path reproducing `#006DCC` byte for byte.

**Why OKLCh.** It is the only cheap space that holds a hue steady while lightness moves. HSL does
not: HSL lightness 50% is luminance 0.78 at yellow and 0.07 at blue. CIELCh has the blue-to-purple
hue shift as lightness drops, which would turn a blue lamp into a violet card. What OKLCh does *not*
give is a contrast guarantee: a fixed OKLab `L` is not a fixed WCAG luminance. **So we do not clamp
on `L`. We clamp on measured WCAG luminance and solve for the `L` that produces it.** Using OKLCh's
own lightness as the accessibility knob is the mistake this system exists to avoid.

### 3.2 The transform

Runnable as written. It goes at the end of `web/js/color.js`, after the existing `lightFill` /
`colorState` block, in that file's idiom: plain functions, no framework, comments that say why. It
is verbatim the code in sections 1 and 2 of `tint_check.js`, so the numbers above are the numbers the
validator measured.

```js
// sRGB transfer function, both directions. 8-bit in, linear-light out.
const srgbToLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hexToLin(hex) {
  const h = String(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  return [0, 2, 4].map(i => srgbToLin(parseInt(n.slice(i, i + 2), 16) / 255));
}
function linToHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, linToSrgb(v))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Linear sRGB -> OKLab (Ottosson's M1 / M2). The cube root is the perceptual part:
// it is what makes a fixed L step feel the same at the dark end and the light end.
function linToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
// OKLab -> linear sRGB. May land outside 0..1: that is out of gamut, and the
// caller decides what to do about it rather than clipping here.
function oklabToLin(L, A, B) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const RAD = Math.PI / 180;
function hexToOklch(hex) {
  const [L, A, B] = linToOklab(...hexToLin(hex));
  return { L, C: Math.hypot(A, B), H: (Math.atan2(B, A) / RAD + 360) % 360 };
}
const oklchToLin = (L, C, H) => oklabToLin(L, C * Math.cos(H * RAD), C * Math.sin(H * RAD));

// WCAG 2.x relative luminance and contrast, measured on the quantised 8-bit hex
// the browser will actually paint, not on the float we computed on the way there.
const lum = hex => { const [r, g, b] = hexToLin(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TINT = {
  yOn: 0.1529,          // = lum('#006DCC'). White ink lands at 5.17:1 on it
  yOnNight: 0.1150,     // accepted by the transform, never passed in slices 1 to 5 (section 3.4)
  yInk2: 0.8850,        // secondary ink: 4.61:1 on a card
  yLine: 0.6050,        // any control boundary: 3.23:1 on a card
  wellK: 0.42,          // slider well interior, as a fraction of the card's luminance
  hueFallbackLamp: 70,  // amber: what a lamp with no usable hue falls back to
  hueFallbackCtl: 250   // the blue family: what a control falls back to
};

// Chroma bands, in OKLCh chroma units. This is the one place the system says how much it knows.
const TINT_BANDS = {
  colour: { min: 0.070, max: 0.160, maxNight: 0.130 },
  ct:     { min: 0.045, max: 0.100, maxNight: 0.090 },
  dim:    { min: 0.040, max: 0.075, maxNight: 0.070 },
  ctl:    { min: 0.000, max: 0.200, maxNight: 0.200 }  // a control keeps Lutron blue as it is
};

const inGamut = rgb => rgb.every(v => v >= -1e-6 && v <= 1 + 1e-6);

// At fixed chroma and hue, luminance rises with OKLab L, so a bisection finds the L that hits the
// target exactly. 16 halvings resolve L about two hundred times finer than one 8-bit step.
function solveL(C, H, yTarget) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const rgb = oklchToLin(mid, C, H);
    const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    if (y < yTarget) lo = mid; else hi = mid;
  }
  const rgb = oklchToLin((lo + hi) / 2, C, H);
  if (!inGamut(rgb)) return null;
  const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return Math.abs(y - yTarget) > 3e-4 ? null : linToHex(rgb);
}

// Hue and a wish for chroma in, a paintable hex at yTarget out. C = 0 is a grey of the right
// luminance and is always paintable, so this always returns something.
function solveC(H, C, yTarget) {
  const first = solveL(C, H, yTarget);
  if (first) return first;
  let lo = 0, hi = C;
  for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (solveL(mid, H, yTarget)) lo = mid; else hi = mid; }
  return solveL(lo, H, yTarget) || solveL(0, H, yTarget) || '#6D6D6D';
}

// Rounding to 8 bits moves luminance by up to 0.0015, which would move a measured ratio by about
// 0.04 and make the guarantee an approximation. The target is nudged until the byte the browser
// paints falls on the safe side: dir -1 for a surface, dir +1 for ink and lines. The guarantee then
// reads as "at least", never "about".
function pinLuma(H, C, yTarget, dir) {
  let t = yTarget, hex = solveC(H, C, t);
  for (let i = 0; i < 6 && dir; i++) {
    const y = lum(hex);
    if (dir < 0 ? y <= yTarget : y >= yTarget) return hex;
    t -= (y - yTarget) + 1e-5 * (dir < 0 ? 1 : -1);
    hex = solveC(H, C, t);
  }
  return hex;
}

// What a device's live state contributes: a hue, a chroma wish and a band.
function tintSeed(kind, hex, level, night) {
  const band = TINT_BANDS[kind] || TINT_BANDS.ctl;
  const src = hexToOklch(hex);
  const fallback = kind === 'ctl' ? TINT.hueFallbackCtl : TINT.hueFallbackLamp;
  const H = src.C < 2e-3 ? fallback : src.H;
  // Level moves chroma over a narrow band and nothing else. A 1% lamp is 82% as colourful as a 100%
  // lamp, which is felt but never measured: luminance is pinned either way.
  const lv = Math.max(0, Math.min(100, Number(level) || 0));
  const dim = kind === 'ctl' ? 1 : 0.82 + 0.18 * lv / 100;
  const cap = night ? band.maxNight : band.max;
  return { H, C: Math.min(cap, Math.max(band.min, src.C)) * dim };
}

// The memo. A surface depends on four things only: the state, the source hex, the 5% level bucket
// and the night flag. A full slider drag can therefore ask for at most 21 distinct surfaces per
// colour. Past the cap the map is dropped rather than half-evicted: one recompute per card, no
// bookkeeping on every hit.
const TINT_MEMO = new Map();
const TINT_MEMO_CAP = 256;
function litSurface(opts) {
  const o = opts || {};
  const bucket = Math.round(Math.max(0, Math.min(100, Number(o.level) || 0)) / 5);
  const key = `${o.state || 'on'}|${o.kind || 'ctl'}|${o.hex || ''}|${bucket}|${o.night ? 1 : 0}`;
  const hit = TINT_MEMO.get(key);
  if (hit) return hit;
  const made = buildLitSurface(o, bucket * 5);
  if (TINT_MEMO.size >= TINT_MEMO_CAP) TINT_MEMO.clear();
  TINT_MEMO.set(key, made);
  return made;
}

function buildLitSurface(o, level) {
  const night = !!o.night;
  const yOn = night ? TINT.yOnNight : TINT.yOn;

  // Off, and anything with no state worth tinting: the ordinary Tenzing card.
  if (o.state === 'off') {
    return { state: 'off', fill: '#FFFFFF', fillPressed: '#F2F2F2', ink: '#262626', ink2: '#666666',
             line: '#B3B3B3', wellTrack: '#EDEDED', wellFill: '#006DCC', wellLine: '#B3B3B3',
             btnBg: '#EDEDED', btnIcon: '#262626', btnBgPressed: '#DEDEDE', btnIconPressed: '#262626',
             border: 'rgba(0,0,0,.09)' };
  }

  // On, but the connector is not answering. Keeps the luminance (the card still reads as on) and
  // drops the hue entirely (it stops claiming a colour it cannot currently see).
  const seed = o.state === 'unknown'
    ? { H: 0, C: 0 }
    : tintSeed(o.kind || 'ctl', o.hex || '#006DCC', level, night);

  const fill = pinLuma(seed.H, seed.C, yOn, -1);
  const line = pinLuma(seed.H, seed.C * 0.6, TINT.yLine, +1);
  const ink2 = pinLuma(seed.H, seed.C * 0.5, TINT.yInk2, +1);
  return {
    state: o.state === 'unknown' ? 'unknown' : 'on',
    fill,
    // Pressed is a luminance step, not an opacity change, so it is the same felt amount of press on
    // every hue. 18% deeper reads as a press and keeps white ink above 4.5:1 on its own.
    fillPressed: pinLuma(seed.H, seed.C, yOn * 0.82, -1),
    ink: '#FFFFFF',
    ink2,
    line,
    wellLine: line,
    // The slider: a deepened well, a white fill. The well's outline carries the 3:1 the control
    // needs; the fill against the well carries the value.
    wellTrack: pinLuma(seed.H, seed.C, yOn * TINT.wellK, -1),
    wellFill: '#FFFFFF',
    // The round power button inverts the card, the way the reference's does.
    btnBg: '#FFFFFF',
    btnIcon: fill,
    btnBgPressed: ink2,
    btnIconPressed: fill,
    border: 'rgba(0,0,0,.28)'
  };
}
```

**How a card consumes it.** `litSurface()` returns colours, not styles. One helper writes them onto
the element and the CSS never mentions a colour again.

```js
// Paint a card from a surface. Everything the card's CSS needs is a custom property, so a colour
// change is thirteen property writes on one element and no reflow. `--p` is written separately by
// tintLevel so a drag never touches anything but the one property that has to move at 60fps.
function tintApply(el, opts) {
  if (!el) return;
  const s = litSurface(opts);
  if (el.dataset.tint === s.fill && el.dataset.tintState === s.state) return;   // nothing moved
  el.dataset.tint = s.fill; el.dataset.tintState = s.state;
  const st = el.style;
  st.setProperty('--t-fill', s.fill);
  st.setProperty('--t-fill-pressed', s.fillPressed);
  st.setProperty('--t-ink', s.ink);
  st.setProperty('--t-ink-2', s.ink2);
  st.setProperty('--t-line', s.line);
  st.setProperty('--t-well', s.wellTrack);
  st.setProperty('--t-well-fill', s.wellFill);
  st.setProperty('--t-well-line', s.wellLine);
  st.setProperty('--t-btn-bg', s.btnBg);
  st.setProperty('--t-btn-ink', s.btnIcon);
  st.setProperty('--t-btn-bg-pressed', s.btnBgPressed);
  st.setProperty('--t-btn-ink-pressed', s.btnIconPressed);
  st.setProperty('--t-border', s.border);
  el.classList.toggle('lit', s.state !== 'off');
  el.classList.toggle('unknown', s.state === 'unknown');
}
// The per-frame path during a slider drag. One property, no colour work at all.
function tintLevel(el, v) { if (el) el.style.setProperty('--p', `${Math.round(v)}%`); }

// What to hand tintApply for a device, straight from the state the app already keeps.
// The four kinds are the four things the app can honestly know.
function tintOptsFor(id) {
  const d = dev(id), st = S.states[id] || {}, lv = level(id) || 0;
  // listed but never reported: only a light has a level to be missing (8.4)
  if (d && d.domain === 'light' && level(id) == null && devices().length) return { state: 'unknown' };
  if (!targetOn(`d:${id}`)) return { state: 'off' };
  if (connLost()) return { state: 'unknown' };                              // last known, and it says so
  const c = st.color;
  if (d && d.color && c && c.mode === 'xy' && c.hex) return { kind: 'colour', hex: c.hex, level: lv };
  if (d && d.ct && c && c.mode === 'ct' && c.kelvin) return { kind: 'ct', hex: kelvinHex(c.kelvin), level: lv };
  if (d && d.domain === 'light') return { kind: 'dim', hex: lampColor(Math.max(1, lv)), level: lv };
  return { kind: 'ctl', hex: '#006DCC', level: 100 };                       // switch, plug, fan, shade
}
```

The existing `.slider` rule in `styles.css` already draws itself from `--fill`, `--track` and an
`inset 0 0 0 1px var(--line-2)` outline, so a tinted well is three variable overrides and **no new
slider CSS at all**. That is why the well's outline is the control boundary that carries the 3:1 in
the contract: it is the line the app already draws.

### 3.3 The device-kind bands

Chroma encodes how much the app actually knows. Put the three side by side in one grid and they read
as three degrees of certainty about the same thing, which is what they are.

| kind | band (OKLCh chroma) | what it is | day fill examples |
|---|---|---|---|
| `colour` | 0.070 to 0.160 | a lamp reporting a real `xy` colour | green `#207D20`, pure yellow `#707000`, deep violet `#8456BE`, pure red `#BE4336`, cyan `#017979`, pure blue `#3D68CB` |
| `ct` | 0.045 to 0.100 | a white-temperature lamp | 2700K `#956226`, 4500K `#796A55`, 6500K `#606D88` |
| `dim` | 0.040 to 0.075 | a Caseta dimmer, whose colour is `lampColor(level)` and therefore inferred | 1% `#796B58`, 50% `#886641`, 100% `#906341` |
| `ctl` | unclamped | a switch, plug, fan or shade, which has no colour at all | `#006DCC`, byte exact |

0.160 is where a 169px surface stops being a tint and starts being a colour chip at phone viewing
distance; sRGB's maximum OKLCh chroma is about 0.32, so the band is half the gamut's reach and
deliberately restrained. 0.070 is the floor that keeps a near-white `xy` value from painting an
ambiguous grey card.

Three consequences to state plainly, because they will be asked about:

- **A plain Caseta dimmer at full is `#A65900`. The reference's orange card is `#A95701`.** They are
  the same card. Most of this house is plain dimmers, and the dimmers are the shot the owner pointed
  at, not the poor relation of the Hue lamps.
- **A dimmer's card shifts hue with level and a colour lamp's does not** (a dimmer is `#766B5D` at
  5%, `#8B6639` at 40%, `#A65900` at 100%; a green lamp is near enough the same green at 1% and at
  80%). That asymmetry is correct and nobody may "fix" it: the warm ramp's own hue moves with level,
  and a green lamp really is green at both levels.
- **2700K no longer disappears.** The source `#FFB25C` is a pale cream at 1.3:1 against the page; the
  transform returns `#956226` at 4.88:1. Nothing about the fix is special-cased for warm white: it
  falls out of pinning the luminance.

**Level never touches luminance.** A 5% lamp and a 100% lamp produce cards of identical luminance and
identical contrast ratios. Level is written out in words, drawn as the well's fill length, and shown
in the lamp disc, which still uses `lightFill(id, level)` and is still pale at a low level. What
level is allowed to touch is chroma, over `C_effective = C_clamped * (0.82 + 0.18 * level / 100)`.

**The proof that the ink cannot flip mid-drag**, by exhaustion rather than by argument. The validator
recomputes the surface from scratch at every one of 101 levels for each of 24 hues at full saturation
(2400 lit states):

```
  distinct ink colours seen across 2400 lit states: 1 (#FFFFFF)
  body-ink ratio min 5.17 max 5.24, whole spread 0.0699 (= 8-bit rounding of the fill)
  largest change between two adjacent 1% steps of a drag: 0.0604, 1.17% of the ratio   PASS
```

One ink. There is no threshold, so there is nothing to flip.

### 3.4 Off, offline, unknown and night

| case | `tintOptsFor` returns | fill | ink | the words beside it |
|---|---|---|---|---|
| anything off | `{state:'off'}` | `#FFFFFF` (`--surface`) | `#262626` | "Off" |
| on, connector not answering | `{state:'unknown'}` | `#6D6D6D` | `#FFFFFF` | the last known value, in `--t-ink-2` |
| listed but never reported | `{state:'unknown'}` | `#6D6D6D` | `#FFFFFF` | "Not answering" |

**Off** is the Tenzing card exactly as v4 defines it, unchanged. On versus off is carried by a 5.17:1
luminance difference **and** by the word "Off", so WCAG 1.4.1 is satisfied without relying on colour.

**Unknown, and the rule that keeps it honest:**

> Luminance is what the app knows about **on**. Hue is what it knows about **colour**. When it cannot
> see the device, it keeps the first and drops the second.

The card stays at 0.1529 and goes to chroma zero: `#6D6D6D`, a neutral grey of exactly the pinned
luminance. Every measured ratio is identical to a tinted card's, so nothing about the layout or the
legibility changes. The card still reads unmistakably as on. It simply stops asserting a colour.

This fires on `connState() === 'off'` and **not** on `'reconnecting'`. The app's existing rule is a
ten-second grace period (`RECONNECT_GRACE` in `core.js`) during which it stays quiet rather than
flapping; a grid draining to grey and back every time the hub blinks is exactly the noise that rule
exists to prevent. During those ten seconds the cards keep their colour.

**Night.** The transform accepts a `night` flag and carries `yOnNight` (0.1150) and per-band
`maxNight` ceilings, and the validator sweeps all 451 night surfaces to prove that every ratio
improves rather than to assume it. **No call site passes `night` in slices 1 to 5, and the night look
does not change a lit card**: a lit card is already at 0.1529 with white ink and is night-proof by
construction. Night is slice 6, it is the page and the off cards only, and if it ever wants darker
lit cards that is one flag that the validator has already proved.

### 3.5 Rooms and groups

A room card and a room hero have several lights of several colours.

> **Average the hues as vectors, weighted by level times chroma; scale the room's chroma by the
> length of that vector; and if the vector is shorter than 0.72, stop guessing and wear Lutron blue.**

```js
// A room's tint. Not a mean of hexes: averaging a red lamp and a green lamp gives yellow, and no lamp
// in that room is yellow. Lights that agree give a saturated room; lights that disagree pull the
// chroma down towards nothing. 0.72 is the resultant of two equal lights 90 degrees apart in hue,
// and past a right angle there is no honest mean.
const ROOM_COHERENCE_MIN = 0.72;
function roomTintSeed(lights, night) {
  const lit = (lights || []).filter(l => (l.level || 0) > 0);
  if (!lit.length) return null;
  let x = 0, y = 0, wc = 0, w = 0, lv = 0;
  for (const l of lit) {
    const s = tintSeed(l.kind || 'colour', l.hex || '#006DCC', l.level, night);
    const k = (l.level / 100) * Math.max(0.02, s.C);
    x += k * Math.cos(s.H * RAD); y += k * Math.sin(s.H * RAD);
    wc += k * s.C; w += k; lv += l.level;
  }
  const R = w > 0 ? Math.hypot(x, y) / w : 0;
  if (R < ROOM_COHERENCE_MIN) return { kind: 'ctl', hex: '#006DCC', level: lv / lit.length, coherence: R };
  const H = (Math.atan2(y, x) / RAD + 360) % 360;
  const C = (wc / w) * R;
  return { kind: 'colour', hex: pinLuma(H, C, night ? TINT.yOnNight : TINT.yOn), level: lv / lit.length, coherence: R };
}
```

Measured, on seven compositions:

```
  three greens, one dim      coherence 1.00  tinted   fill #297C2B
  green loud, red faint      coherence 0.91  tinted   fill #3B7B29
  blue, violet, indigo       coherence 0.96  tinted   fill #5F64BE
  two warm whites            coherence 1.00  tinted   fill #906432
  a lamp and a dimmer        coherence 0.99  tinted   fill #A5591B
  green and red, equal       coherence 0.55  falls back to Lutron blue  fill #006DCC
  everything off                              the off surface
```

Not a mean of the hexes, because the room card would assert a colour that exists nowhere in the
house. Not the brightest, because one lamp is not the room and turning it off would swing the card
with no user intent between the two states. Not the dominant, because it is arbitrary when two lights
are close and it makes the card jump as levels cross. Weighting by **level times chroma** rather than
by level alone keeps a bright white lamp from dragging the room's hue towards its residual tint; the
`Math.max(0.02, s.C)` floor keeps a room of nothing but white lamps from dividing by zero.

Below 0.72 the room wears the house colour and the room's own sub line ("3 of 4 on") carries the
information.

**One hard rule about the room photograph, which is this section's and not the UX designer's:** text
never sits on a translucent scrim over a room photograph. Measured, white ink over a scrim of the
room's own fill on a white photograph reaches 2.66:1 at alpha 0.62, 3.16:1 at 0.72, 3.65:1 at 0.80
and 4.07:1 at 0.86. There is no alpha that reaches 4.5:1 while still letting the photograph through,
which is the entire reason to have a photograph. Lantern's answer is simpler than a band: **nothing
is ever drawn over the hero at all** (§4.8).

### 3.5a The room tile's mesh

§3.5 answers "if this room were **one** colour, which one". Home's room tile no longer asks that
question. A tile is a picture of the room, and a room with two purple lamps and a red one is not one
colour and is certainly not blue: below the coherence floor the flat fill was giving a lit room a
Lutron-blue card that said nothing about what was actually on in it.

> **One soft radial per lit lamp, in that lamp's own colour, over a base of the strongest lamp.**

`roomMeshStops()` (js/color.js) returns one stop per lit lamp, in the room's own order, so two purple
lamps and a red one give two purple blobs and a red one. Anchors are fixed per index, never random, so
a repaint does not make the blobs walk around the tile. One lamp is not a mesh: a single blob over its
own colour is the flat fill with a seam in it, so a one-lamp room stays flat.

**Contrast is carried by construction, and no proven unit moved.** Every stop is
`pinLuma(H, C, yOn, -1)` fed by `tintSeed` — the same generator, the same luminance target and the
same chroma bands that already produce `buildLitSurface`'s `fill`. The validator measures white ink
over every surface that generator can make, so a stop cannot be a colour it has not already measured.
Checked directly over 3,456 stops spanning every hue pair at three levels: **worst white-on-stop
5.17:1**, against the 4.5:1 the body text needs. The ink therefore stays `#FFFFFF` across the whole
mesh and the tile needs no second ink rule.

`roomTintSeed` and the 0.72 coherence floor are unchanged and still govern anywhere a single flat
colour is the answer; §3.5's reasoning against a mean, the brightest and the dominant all still hold
for that case. The mesh is not a mean — it shows each lamp rather than inventing one colour for all
of them — so the objection those rules answer does not arise here.

### 3.6 Memoisation and per-frame cost

Measured by the validator on node 20, 20000 calls:

```
  cold (memo cleared every call): 189.5 us
  warm (memo hit): 270.8 ns
  one full 1..100 slider sweep, memo warm after the first pass: 0.037 ms for 100 frames
  a 12-card grid painted cold: 2.27 ms  (one frame budget is 16.7 ms)
```

**The cold path is genuinely expensive and it is never on a frame.** 190us is five `pinLuma` calls,
each a 16-step bisection on OKLab `L`, some wrapped in a 9-step bisection on chroma, plus up to a few
quantisation nudges. It runs once per distinct (state, hex, 5% bucket, night) tuple.

**What is memoised.** `TINT_MEMO`, a `Map` keyed on exactly those four things, capped at 256 entries,
cleared outright on overflow. A hit is 271ns, and `tintApply` returns before even those thirteen
property writes when `el.dataset.tint` already matches.

**The per-frame path, explicitly.** During a slider drag, one `style.setProperty('--p', ...)` on one
element. It does not touch `litSurface`, the memo, OKLab or any other card. Level reaches the surface
only through a 5% bucket, so a full 0 to 100 drag can ask for at most 21 distinct surfaces, not 101,
and each is a memo hit after the first pass.

`tintApply` is called from `paintDeviceTiles()` / `paintRoomTiles()` inside `paintState()`, for the
cards in the DOM: at most a dozen. At steady state a full paint pass costs about 3us of colour work,
which is under 0.02% of a frame. The one cold case is a lamp changing colour, which produces one new
surface (190us) inside a user-initiated event that already round-trips to a bridge.

**No allocation in the frame path.** `tintLevel` allocates one template string; `litSurface`
allocates one object per distinct surface, at most 256 alive.

### 3.7 The validator

`tint_check.js` **is brought into the repo as `scripts/tint-check.js`**, wired as `npm run
tint-check`, and run before a commit that touches `web/js/color.js`. It is the regression test for
every number in this document. Plain `node`, no dependencies, no arguments; it exits 1 if any check
fails and 0 only when all of them pass.

What it sweeps: the OKLab conversion against the published OKLCh values for the sRGB primaries plus a
round trip over all 768 single-channel byte values; the hue wheel every 15 degrees at 40/70/100
saturation at levels 1/25/60/100 (288 states); 2000K to 6500K in 100K steps at levels 1/50/100 (138
states) using `kelvinHex` lifted verbatim from `web/js/color.js`; the white-only dimmer at seven
levels using `lampColor` lifted verbatim from `web/js/light.js`; switch, plug, fan and shade; off and
offline; the named killers; all of it again under `data-night="1"` (451 further surfaces); the
no-flip proof; the room rule on seven compositions; and the cost, cold and warm. Each surface is
audited on twelve pairs.

The final summary output, as it stands:

```
OKLab conversion check (published OKLCh for the sRGB primaries)
  #FFFFFF  got L=1.0000 C=0.0000 H=89.88   want L=1.0000 C=0.0000 H=  n/a   PASS
  #000000  got L=0.0000 C=0.0000 H=0.00   want L=0.0000 C=0.0000 H=  n/a   PASS
  #FF0000  got L=0.6280 C=0.2577 H=29.23   want L=0.6280 C=0.2577 H=29.23   PASS
  #00FF00  got L=0.8664 C=0.2948 H=142.50   want L=0.8664 C=0.2948 H=142.50   PASS
  #0000FF  got L=0.4520 C=0.3132 H=264.05   want L=0.4520 C=0.3132 H=264.05   PASS
  #808080  got L=0.5999 C=0.0000 H=89.88   want L=0.5999 C=0.0000 H=  n/a   PASS
  round trip sRGB -> OKLCh -> sRGB over 768 single-channel values: 0 mismatches  PASS

  white-only dimmer
  ----------------------------------------------------------------------------------------------------------------
  dimmer lv  1               fill #796B58  ink #FFFFFF  ink2 #F9F1E6  ink 5.18  ink2 4.62  line 3.23  sld 9.29  btn 5.18  page 4.87  PASS
  dimmer lv 50               fill #886641  ink #FFFFFF  ink2 #FFF0DF  ink 5.22  ink2 4.67  line 3.26  sld 9.21  btn 5.22  page 4.91  PASS
  dimmer lv100               fill #906341  ink #FFFFFF  ink2 #FFEFE3  ink 5.19  ink2 4.62  line 3.25  sld 9.20  btn 5.19  page 4.89  PASS

  no colour data
  ----------------------------------------------------------------------------------------------------------------
  switch on                  fill #006DCC  ink #FFFFFF  ink2 #E9F3FF  ink 5.17  ink2 4.61  line 3.24  sld 9.28  btn 5.17  page 4.87  PASS
  fan Medium                 fill #006DCC  ink #FFFFFF  ink2 #E9F3FF  ink 5.17  ink2 4.61  line 3.24  sld 9.28  btn 5.17  page 4.87  PASS
  shade 60% open             fill #006DCC  ink #FFFFFF  ink2 #E9F3FF  ink 5.17  ink2 4.61  line 3.24  sld 9.28  btn 5.17  page 4.87  PASS

  off and unknown
  ----------------------------------------------------------------------------------------------------------------
  anything off               fill #FFFFFF  ink #262626  ink2 #666666  ink 15.13  ink2 5.74  line 2.10  sld 4.42  btn 1.17  page 1.06  PASS
  on, connector offline      fill #6D6D6D  ink #FFFFFF  ink2 #F2F2F2  ink 5.17  ink2 4.62  line 3.25  sld 9.29  btn 5.17  page 4.87  PASS

  the named killers
  ----------------------------------------------------------------------------------------------------------------
  pure yellow 100%           fill #707000  ink #FFFFFF  ink2 #F4F6B8  ink 5.24  ink2 4.67  line 3.27  sld 9.25  btn 5.24  page 4.94  PASS
  pure yellow 1%             fill #707000  ink #FFFFFF  ink2 #F3F6C3  ink 5.24  ink2 4.69  line 3.29  sld 9.25  btn 5.24  page 4.94  PASS
  lime                       fill #587701  ink #FFFFFF  ink2 #E3FAC0  ink 5.18  ink2 4.61  line 3.24  sld 9.30  btn 5.18  page 4.88  PASS
  cyan                       fill #017979  ink #FFFFFF  ink2 #B5FFFE  ink 5.23  ink2 4.66  line 3.26  sld 9.28  btn 5.23  page 4.93  PASS
  deep violet                fill #8456BE  ink #FFFFFF  ink2 #F5F0FF  ink 5.18  ink2 4.63  line 3.23  sld 9.21  btn 5.18  page 4.88  PASS
  pure blue                  fill #3D68CB  ink #FFFFFF  ink2 #ECF2FF  ink 5.20  ink2 4.63  line 3.25  sld 9.21  btn 5.20  page 4.89  PASS
  pure red                   fill #BE4336  ink #FFFFFF  ink2 #FFEFEC  ink 5.19  ink2 4.65  line 3.26  sld 9.22  btn 5.19  page 4.89  PASS
  the rig Desk lamp green    fill #207D20  ink #FFFFFF  ink2 #D2FECE  ink 5.23  ink2 4.68  line 3.28  sld 9.25  btn 5.23  page 4.92  PASS
  2700K warm white           fill #956226  ink #FFFFFF  ink2 #FFF0E1  ink 5.18  ink2 4.64  line 3.25  sld 9.22  btn 5.18  page 4.88  PASS
  6500K daylight             fill #606D88  ink #FFFFFF  ink2 #ECF2FF  ink 5.20  ink2 4.63  line 3.25  sld 9.20  btn 5.20  page 4.89  PASS
  near-white xy from a scene fill #796C3B  ink #FFFFFF  ink2 #F9F2D8  ink 5.22  ink2 4.66  line 3.28  sld 9.21  btn 5.22  page 4.92  PASS
  1% level colour lamp       fill #AA5519  ink #FFFFFF  ink2 #FFEFE6  ink 5.22  ink2 4.66  line 3.28  sld 9.21  btn 5.22  page 4.92  PASS

  hue sweep and kelvin sweep (quiet: 288 + 138 states)
  ----------------------------------------------------------------------------------------------------------------
  body-ink ratio across all 426 quiet states: min 5.17 (xy h150 s 40 lv  1, #287B57)  max 5.24 (ct 4500K lv  1, #796A55)

  the same 440 states under :root[data-night="1"]
  ----------------------------------------------------------------------------------------------------------------
  body-ink ratio at night: min 6.36 (ct 4200K lv 50)  max 6.44 (xy h135 s 40 lv 60)

No-flip proof: 101 levels x 24 hues, the fill recomputed at every step
  ----------------------------------------------------------------------------------------------------------------
  distinct ink colours seen across 2400 lit states: 1 (#FFFFFF)
  body-ink ratio min 5.17 max 5.24, whole spread 0.0699 (= 8-bit rounding of the fill)
  largest change between two adjacent 1% steps of a drag: 0.0604, 1.17% of the ratio   PASS

Room tint: the coherence rule
  ----------------------------------------------------------------------------------------------------------------
  three greens, one dim      coherence 1.00  tinted          fill #297C2B  ink 5.23  page 4.93  PASS
  green and red, equal       coherence 0.55  falls back to Lutron blue  fill #006DCC  ink 5.17  page 4.87  PASS
  green loud, red faint      coherence 0.91  tinted          fill #3B7B29  ink 5.18  page 4.88  PASS
  two warm whites            coherence 1.00  tinted          fill #906432  ink 5.18  page 4.88  PASS
  a lamp and a dimmer        coherence 0.99  tinted          fill #A5591B  ink 5.19  page 4.89  PASS
  blue, violet, indigo       coherence 0.96  tinted          fill #5F64BE  ink 5.18  page 4.88  PASS
  everything off             no lit lights: the off surface

The pinned values, measured
  ----------------------------------------------------------------------------------------------------------------
  lum('#006DCC') = 0.1530   TINT.yOn = 0.1529
  a day card vs the page #F8F8F8: 4.87:1
  a night card vs the page #F8F8F8: 6.01:1

Cost
  ----------------------------------------------------------------------------------------------------------------
  cold (memo cleared every call): 192.3 us
  warm (memo hit): 259.9 ns
  one full 1..100 slider sweep, memo warm after the first pass: 0.038 ms for 100 frames
  a 12-card grid painted cold: 2.31 ms  (one frame budget is 16.7 ms)

The contract, measured over every surface the sweeps produced
  ----------------------------------------------------------------------------------------------------------------
  body ink on fill 4.5 @day          need 4.5   min 5.17   max 5.24   over  457 surfaces   PASS
  body ink on fill 4.5 @night        need 4.5   min 6.36   max 6.44   over  451 surfaces   PASS
  button icon on button 3.0 @day     need 3.0   min 5.17   max 5.24   over  457 surfaces   PASS
  button icon on button 3.0 @night   need 3.0   min 6.36   max 6.44   over  451 surfaces   PASS
  card vs an off card 3.0 @day       need 3.0   min 5.17   max 5.24   over  457 surfaces   PASS
  card vs an off card 3.0 @night     need 3.0   min 6.36   max 6.44   over  451 surfaces   PASS
  card vs page 1.4.1 3.0 @day        need 3.0   min 4.87   max 4.94   over  457 surfaces   PASS
  card vs page 1.4.1 3.0 @night      need 3.0   min 5.99   max 6.07   over  451 surfaces   PASS
  ink on pressed fill 4.5 @day       need 4.5   min 5.98   max 6.06   over  457 surfaces   PASS
  ink on pressed fill 4.5 @night     need 4.5   min 7.27   max 7.37   over  451 surfaces   PASS
  large ink on fill 3.0 @day         need 3.0   min 5.17   max 5.24   over  457 surfaces   PASS
  large ink on fill 3.0 @night       need 3.0   min 6.36   max 6.44   over  451 surfaces   PASS
  power button on card 3.0 @day      need 3.0   min 5.17   max 5.24   over  457 surfaces   PASS
  power button on card 3.0 @night    need 3.0   min 6.36   max 6.44   over  451 surfaces   PASS
  pressed button on card 3.0 @day    need 3.0   min 4.61   max 4.70   over  457 surfaces   PASS
  pressed button on card 3.0 @night  need 3.0   min 5.66   max 5.77   over  451 surfaces   PASS
  second ink on fill 4.5 @day        need 4.5   min 4.61   max 4.70   over  457 surfaces   PASS
  second ink on fill 4.5 @night      need 4.5   min 5.66   max 5.77   over  451 surfaces   PASS
  slider fill on card 3.0 @day       need 3.0   min 5.17   max 5.24   over  457 surfaces   PASS
  slider fill on card 3.0 @night     need 3.0   min 6.36   max 6.44   over  451 surfaces   PASS
  slider fill on well 3.0 @day       need 3.0   min 9.19   max 9.32   over  457 surfaces   PASS
  slider fill on well 3.0 @night     need 3.0   min 10.67   max 10.83   over  451 surfaces   PASS
  well outline on fill 3.0 @day      need 3.0   min 3.23   max 3.29   over  457 surfaces   PASS
  well outline on fill 3.0 @night    need 3.0   min 3.97   max 4.04   over  451 surfaces   PASS

==================================================================================================================
10910 checks over 910 surfaces.  10910 PASS, 0 FAIL.
==================================================================================================================
```

Slice 6 wires this run into the test suite alongside the Playwright suites.

---

## 4. Components

| component | class | lives on |
|---|---|---|
| Device tile | `.dtile` | the room sheet's grid |
| Device grid | `.dgrid` | the room sheet |
| Wide device tile (fan, shade) | `.dtile.wide` | the room sheet's grid, last |
| Room tile | `.rtile.room` | Home |
| Room grid | `.rgrid` | Home |
| New room tile | `.rtile.new` | Home, the grid's last cell |
| Scope pill row | `.scopes` | Home |
| Scene cell row | `.scells` | Home |
| Room hero | `.rhero` | the room sheet, at the top of its body |
| Light sheet stage | `.lstage` | the light sheet |

**`.tile` is the scene tile and is not used for any of these.** It already carries `:active`,
`.running` and `.editing` rules in `styles.css`, and `paintTiles()` in `light.js` rewrites
`.tile[data-tgt] .face` wholesale from a key, which a cross-fade cannot survive. The lit selectors
are `.dtile.lit`, `.rtile.lit` and `.lstage.lit`.

**The one idea behind these components.** The device tile and the light sheet are the same object at
two sizes: a tinted surface, a disc, the value in words, a corner power button, one well. Learn the
tile and you already know the sheet. Everything else on a screen is white paper.

**Three measured facts these components are sized to**, re-checked in the running rig at 390x844:

1. A sheet's body padding is **20px**. Measured inner width of a sheet body: **350px at 390**,
   **320px at 360**.
2. The large detent is 92dvh: the room sheet measures **776.5px** at 844, of which the grab zone
   takes **20** and the header **62**, leaving a **694.5px scrolling body**.
3. Home's page gutter is 16px and `main` is capped at 640: inner width **358px at 390**, **328px at
   360**.

### 4.1 The device tile

Two columns inside the room sheet, one tile per controllable device in the room. Pico remotes are
excluded: they are not controllable and never enter a grid.

| | 390 | 360 | >= 560 viewport |
|---|---|---|---|
| columns | 2 | 2 | 3 |
| grid gap | 12px | 12px | 12px |
| tile width | **169px** `(350 - 12) / 2` | **154px** `(320 - 12) / 2` | **192px** at a 640 body `(600 - 24) / 3` |
| tile min-height | 172px, so the box measures **174** | same | same |
| radius | `--r-lg` 16px | same | same |
| padding | 14px | 14px | 14px |
| border | 1px `--t-border` | same | same |
| shadow | none | none | none |

Height arithmetic: `14 + 40 (disc) + 10 + 20 (name) + 2 + 16 (value) + 12 + 44 (foot) + 14 = 172` of
content, plus the 1px hairline top and bottom, so the box measures **174**. A two-line name adds 20
and the box is **194**. Tiles in one grid row always match, because a CSS grid row track is one
height and the foot is pinned with `margin-top: auto`.

**No shadow** is deliberate and is Tenzing: a thing that sits on the page gets a hairline, a thing
that floats gets a shadow. The reference's cards float; ours do not.

```html
<div class="dtile light" data-tile="DEVICE_ID" data-tgt="d:DEVICE_ID" data-kind="dim">
  <button class="dbody" data-act="light-open" data-id="DEVICE_ID">
    <span class="lring color">                              <!-- only when the lamp has colour or ct -->
      <span class="ddisc lamp" data-ldisc="DEVICE_ID"
            style="background:FILL">…20px glyph…</span>
      <span class="badge">…clock…</span>                    <!-- only while a sleep timer runs -->
    </span>
    <span class="dn">Desk lamp</span>
    <span class="lv dv" data-lrowval="DEVICE_ID">…dot…Green · 80%</span>
  </button>
  <div class="dfoot">
    <div class="sliderwrap dwell">
      <input class="slider" type="range" min="0" max="100"
             data-lvl="DEVICE_ID" data-slide="d:DEVICE_ID" aria-label="Desk lamp brightness">
    </div>
    <button class="act dpow" data-act="toggle" data-t="d:DEVICE_ID" data-act-lvl="DEVICE_ID"
            aria-label="Desk lamp on or off">…power glyph 20px…</button>
  </div>
</div>
```

1. **The disc**, 40px, top left. `lampHTML(lv, 40, ICON(lightIcon(d), 'sm'))` with class `ddisc` and
   `data-ldisc` added. It wears `.lring.color` or `.lring.ct` when the lamp has that capability, and
   **never** the blue `.ringed` outline. The disc carries the pure `lightFill(id, lv)`, unlightened.
   The card is the tint, the disc is the truth: a yellow lamp's card is olive `#707000` and the dot
   at its corner is pure yellow.
2. **The name**, `.dn`, 16/20 500, `--t-ink`, clamped to two lines, `overflow-wrap: anywhere`.
3. **The value**, `.lv.dv`, 14/16 400, `--t-ink-2`, one line with an ellipsis, produced by the
   existing `lightRowValue(d)` verbatim: "80%", "Off", "On", "Medium", "Open", "Not answering", or a
   colour dot plus "Green · 80%". Never a bare percentage with no word behind it, never colour alone.
4. **The foot**, 44px tall, `margin-top: auto`: the inline well at the left (flex, `min-width: 0`)
   and the 40px round power button at the right, 10px apart.

Three type sizes are the budget; the tile spends two (16/20 500 and 14/16 400). The third, `.display`
40/48, is reserved for the light sheet.

**The inline well.** Only for a dimmable light (`d.domain === 'light'`) that is on: not for a switch,
not for a fan, not for a shade, not for an off lamp.

- It is a native `input.slider` drawn as a Tenzing well, so **`slide.js`'s gesture gate applies with
  no new code**: a finger that moves down scrolls the sheet, a deliberate sideways drag of 8px or
  more sets the level, a tap sets it where the finger landed.
- Geometry: `--well-h: 36px`, `--grip-h: 18px`, radius `--r-md`, in a 44px `.dwell` row, so the touch
  target measures 44px tall once `slide.js`'s own 4px of vertical slop is counted.
- Width: `169 - 2 - 28 - 40 - 10 = 89px` at 390, measured 89 x 36; 74 at 360; 112 at a 640 body.
- **No `.stip` tooltip.** There is no room for one and no need: the value line above is the readout,
  and `boot.js`'s existing `input` handler already writes the dragged value into `.lv` and repaints
  `[data-ldisc]`, because the tile carries the class `light`.
- 74px is a coarse dimmer and is meant to be. The precise one is one tap away in the light sheet.
- **Presence is a class, not a re-render.** The well is always in the render string for a dimmable
  light and is hidden by `visibility` when the light is off, so the tile's geometry is identical in
  both states and the power button never moves.

**Every state:**

| state | condition | treatment |
|---|---|---|
| **off** | `level(id) === 0` | `--surface`, 1px `--line`, name `--text`, value `--text-2`, disc `--lamp-off` with a `--text-2` glyph, well hidden, power button `--fill-2` with a `--text` glyph |
| **on, tinted** | domain `light` or `switch`, level > 0 | `.lit`: background `--t-fill`, edge `--t-border`, name `--t-ink`, value `--t-ink-2`, disc at `lightFill(id, lv)`, well `--t-well-fill` on `--t-well` inside a `--t-well-line` outline, power button `--t-btn-bg` with a `--t-btn-ink` glyph |
| **on, not tinted** | domain `fan` or `cover`, on | `--blue-10` fill, `--blue-20` border, `--text` ink, `--text-2` value, power button `--blue` with a white glyph. Warmth means emitted light and nothing else |
| **pressed** | the body pressed | the **whole card** steps to `--t-fill-pressed` and scales to `.99`; the power button and the well keep their own pressed states and do not dip the card (`:has()`, §7.3) |
| **focused** | `.dbody:focus-visible` | `box-shadow: inset 0 0 0 2px var(--blue)`, matching `.list > .item:focus-visible` |
| **unknown** | `connLost()`, or listed and never reported | `.unknown`: fill `#6D6D6D`, white ink, the last known words in `--t-ink-2`, the well hidden. **Nothing is disabled**: the controls still respond, because a command that fails already reverts optimistically |

There is no invented "unreachable device" state beyond `unknown`. The app has no other flag and will
not pretend to.

**Rendered versus painted.** There is no virtual DOM. `render()` rebuilds the view's HTML,
`paintState()` then walks the DOM, and anything whose look follows live state has to be reachable
from a data attribute.

| part | rendered once | painted by | hook |
|---|---|---|---|
| the box, the disc element, the name, the well, the power button | yes | | |
| `.lit` / `.unknown` and the thirteen `--t-*` properties | | **new** `paintDeviceTiles()` | `[data-tile]` |
| `.on` | | `paintState()`'s `[data-tgt]` sweep **unchanged** | `data-tgt="d:<id>"` |
| disc fill and its `.off` class | | `paintLightDiscs()` **unchanged** | `[data-ldisc]` |
| the value line | | `paintLightRowValues()` **unchanged** | `[data-lrowval]` |
| the well's value and `--p` | | `paintState()` **unchanged** | `[data-lvl]` on `input.slider` |
| the well and the value **while a finger drags** | | `boot.js`'s `input` handler **unchanged** | `[data-slide]` + `.closest('.light')` + `.lv` + `[data-ldisc]` |
| the power button's `.on` | | `paintState()` **unchanged** | `[data-act-lvl]`, which also fires `Motion.lightChanged` |
| the name | never repainted (a rename re-renders) | | |

**The tile needs exactly one new painter.** Everything else exists already, which is why the tile
root carries the class `light` and the value element carries the class `lv`: `boot.js`'s slider
handler does `el.closest('.light')`, then writes the live value into `.lv` and repaints
`[data-ldisc]`. Keeping those two class names means the inline dimmer works on day one with no JS
written for it.

```js
// new, in js/light.js beside paintLightDiscs, called from paintLight()
function paintDeviceTiles() {
  document.querySelectorAll('[data-tile]').forEach(el => {
    const id = el.dataset.tile, d = dev(id); if (!d) return;
    const lv = (d.domain === 'light' || d.domain === 'switch') ? (level(id) || 0) : (isOn(id) ? 100 : 0);
    el.classList.toggle('on', lv > 0);
    if (d.domain === 'fan' || d.domain === 'cover') return;   // a fan or a shade is never tinted
    tintApply(el, tintOptsFor(id));                           // sets .lit / .unknown and the --t-* set
    const pw = el.querySelector('.dpow'); if (pw) pw.setAttribute('aria-pressed', lv > 0 ? 'true' : 'false');
  });
}
```

`paintDeviceTiles` is a class toggle and thirteen property writes over at most a dozen tiles, on the
same optimistic path `paintState()` already runs, and the power button's command is dispatched before
any of it. **If a tint ever costs a frame at the moment of a tap, drop the tint, not the frame.**

**Copy and accessibility.** The tile body's own text (name then value) is read in order, so no
`aria-label` is needed on `.dbody`. Power button: `aria-label="<name> on or off"`, the wording the
app already uses on every `.sw`, plus `aria-pressed` painted. Well: `aria-label="<name> brightness"`.

### 4.2 The device grid

```html
<div class="gh">Lights</div>
<div class="dgrid" id="dgrid">…tiles…</div>
```

```
.dgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
```

`minmax(0, 1fr)` and not `1fr`, for the reason already written into `styles.css` at `.tiles.grid`: a
plain `1fr` is `minmax(auto, 1fr)` and one long unbreakable device name would set the track's width
and push the grid off the phone.

**Header.** "Lights" when every device in the room is a light or a switch. **"In this room"** when the
room also holds a fan or a shade, because a grid headed Lights with a fan in it is a small lie and
the room sheet is the one screen that has to hold mixed devices.

**Order.** `roomOrder()` first (a starred light leads, then by name), then by domain: lights and
switches, then fans, then shades. Fans and shades are last because their tiles span both columns and
a spanning tile in the middle of a grid leaves a hole beside it. **The grid is never re-sorted by
state**: a tile that jumps to the front when its light comes on moves under the thumb that just
turned it on.

| devices | layout |
|---|---|
| 0 | no grid. One `.card.pad0.list` row, "Nothing in this room yet" / "Move a light or a remote in here.", opening `roomsAddSheet(aid)`, above the Room setup row |
| 1 | `.dgrid.one`: the single tile spans both columns and its disc grows to 48px. A lone 169px tile beside 181px of nothing reads as a bug, and the wider tile gives its well 250px, which is a better dimmer. The composition is unchanged, only the width |
| 2 | one row of two |
| 3 | two rows; the third tile keeps column 1 and does **not** stretch. Only a grid of exactly one stretches, because stretching a widow breaks the column rhythm for every row above it |
| 5 | three rows: 2, 2, 1 |
| 12 | six rows, about 1104px, inside a 694px scrolling sheet body. No chunking and no virtualisation: twelve tiles is twelve `<div>`s |

At 360 nothing changes but the tile width. At >= 560 the grid goes to three columns; at the 640px
content cap that is a 192px tile, the same component with 23px more air.

### 4.3 The fan tile and the shade tile

A fan has a speed, a shade has a position, and **only a light with a level is ever tinted**. A fan or
shade that is on takes the Tenzing on-state (`--blue-10` fill, `--blue-20` border, `--text` ink),
because warmth means emitted light and nothing else.

Both **span both columns** and sit last in the grid, carrying their existing controls inline:

```html
<div class="dtile wide" data-tile="DEVICE_ID" data-tgt="d:DEVICE_ID" data-kind="fan">
  <div class="dbody static">…disc…<span class="dn">Ceiling fan</span>
    <span class="lv dv" data-lrowval="DEVICE_ID">Medium</span></div>
  <div class="fan">…the existing five chips, markup unchanged…</div>
</div>
```

- **Fan**: the disc, the name, the speed in words ("Medium", "Off"), then the existing `.fan` chip
  strip verbatim (`data-act="fan"`, `[data-lvl][data-speed]` already paints the selected chip). Five
  `flex: 1` chips at 32px tall share 322px of inner width at 390 (58px each) and 292 at 360 (52px
  each), which is what the room sheet already does today. Measured height about 164px.
- **Shade**: the disc, the name, "Open" or "Closed", the existing three `.btn.sm` (Open, Stop, Close)
  and under them the existing 36px openness well. Measured height about 214px. **Stop is the control
  a two-state corner button cannot carry**, and a spanning tile is what keeps it visible.
- Neither carries a corner power button: the fan's boolean is the Off chip, and a shade has no on and
  off, which is also why the whole-room toggle skips shade-only rooms.

**Why spanning is allowed even though the one idea says the lit thing is the biggest.** The hierarchy
channel is colour and fill, not area: a spanning fan tile is still a white card with grey ink beside a
saturated lit lamp. Folding five speeds behind a tap would take setting a fan speed from two taps to
three, which is a capability getting further away for no gain (ledger rows 13 and 14).

### 4.4 The room tile (Home)

A different component from the device tile, as ruled: rooms are the grid on Home, devices are the
grid on the room sheet. A room tile is one control, not five; it is shorter, and it has no well.

```html
<div class="rtile room" data-tgt="a:AREA_ID" data-room="AREA_ID" data-rtile="AREA_ID">
  <button class="head" data-act="room-open" data-id="AREA_ID" aria-label="Kitchen">
    <span class="slot">
      <span class="lamp onchip" data-onchip="a:AREA_ID" style="background:…">…20px room glyph…</span>
      <!-- or, when the room has a photograph: -->
      <img class="rslot-photo" src="/api/roomphoto/AREA_ID?token=…&v=STAMP" alt="" width="40" height="40">
    </span>
    <span class="n">Kitchen</span>
    <span class="s">2 of 2 on</span>
  </button>
  <div class="rfoot">
    <button class="sw" data-tgt="a:AREA_ID" data-act="toggle" data-t="a:AREA_ID"
            aria-label="Kitchen on or off"></button>
  </div>
</div>
```

**It keeps the class `room` and the inner `.head > .s` shape on purpose.** `paintState()`'s
`[data-tgt]` branch already toggles `.on`, rewrites `.head .s` with `roomSummary()` and fires
`Motion.lightChanged`, and `paintOnChips()` already fills the 32px disc from the room's mean level.
Keeping those two names means the room tile inherits its whole live behaviour and the Playwright
suites that assert on `.room` keep finding it. Only the tint needs a new painter, `paintRoomTiles()`
over `[data-rtile]`, the same shape as `paintDeviceTiles` but seeded by `roomTintSeed()` (§3.5).

| | 390 | 360 | >= 560 |
|---|---|---|---|
| tile width | **173px** `(358 - 12) / 2` | **158px** `(328 - 12) / 2` | 3 columns, 194.7px at 640 |
| min-height | 150px, so the box measures **152** | same | same |
| radius, padding, border | `--r-lg` 16, 14px, 1px `--t-border` | | |

Height arithmetic: `14 + 40 (slot) + 10 + 20 (name) + 2 + 16 (sub) + 10 + 24 (switch) + 14 = 150`,
plus the hairline: **152**. Measured 173 x 152 at 390 and 158 x 152 at 360.

Contents in order: the 40px slot, the name `.n` 16/20 500 `--t-ink` clamped to one line with an
ellipsis, the sub `.s` 14/16 400 `--t-ink-2` (the existing `roomSummary()` strings, with the mean
level appended when something is on: "2 of 3 on · 40%"), then the foot with the switch at the right.

**States** are the device tile's, minus the well: off is `--surface` and `--line`; on is `--t-fill`
computed from the room's own lights; `unknown` suppresses the hue. A room tile is tinted when any
light in it is on.

**One control, not two.** The room tile keeps the 44x24 `.sw` rather than the device tile's round
power button, because the two components should not be confused at a glance: a switch means "this
stands for several lights", a round power button means "this is one device". The chevron from
`roomRow` does not come across; on a tile the whole surface is the affordance.

**The optional 40px photograph** replaces the disc in the slot: radius `--r-s` 8, not a circle (a
circle reads as a face), `object-fit: cover`, `box-shadow: inset 0 0 0 1px var(--line)` so a pale
photo still has an edge. Both are 40px, so the grid never reflows when a photo lands or fails. With a
photo the room loses its warm disc, and its lit state is then carried by three other channels: the
tile's tint, the sub line in words, and the switch. That is the trade, and it is why the photograph
is optional and the disc is the default. If the image fails to load, an `error` listener swaps the
class back to the disc: nothing ever shows a broken image icon.

### 4.5 The room grid and the New room tile

```
.rgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
```

**The New room tile** is the grid's last cell, in `All` scope only, and only once the home has at
least one room. Outlined, no fill, 1px dashed `--line-2`, a 24px `+` over "New room" in `--blue`,
`data-act="rooms-new"`, the same 152px box.

It is not decoration: it is the room grid's own add affordance, the same job the "New room" row does
inside the move sheet and the "New room" chip does inside Add a device. It answers the owner's
standing request that adding a room show up everywhere he would want to add one, and it takes making
a room from four taps to one. It is also what keeps a one-room grid from looking broken: the row is
full, and the second cell is an offer rather than a hole.

### 4.6 The scope pill row (Home)

```html
<div class="scopes chips scroll" id="scopes">
  <button class="chip sel" data-act="scope" data-a="all" aria-pressed="true">All</button>
  <button class="chip" data-act="scope" data-a="20" aria-pressed="false">Bedroom</button>
  …
</div>
```

- Built from `.chips.scroll`, which already bleeds to the gutters, hides its scrollbar, masks both
  ends and drags with a mouse (`slide.js`'s second block lists `.chips.scroll` by name).
- Chip: Tenzing Medium, 40px tall, radius `--r-xl` 24, 1px `--chip-line`, 16/20 500 `--text`, with
  the side padding tightened from 24px to **16px** so a five-room row is not 500px of air.
- Selected: `.sel`, already `--fill-1` with a 2px `--text` inset outline. **Never a filled accent
  pill.** Blue on Home already means the active tab and the thing you can touch.
- No counts and no dots on the pills. The grid two rows below already says which rooms are on.
- `.chips.scroll` bleeds by **24px**, which is a sheet's gutter. Used unmodified on a 16px page that
  is 406px of box on a 390px phone and the whole page scrolls sideways. The scope row takes the
  page's gutter instead, exactly as `.scenerow .chips.scroll` already does.

**Pills, in order:** `All`, then one pill per room in the grid's own order. **There is no `On`
pill** (§12, row 2).

**What each scope shows:**

| pill | the grid shows | extra |
|---|---|---|
| `All` | every room, then the **New room** tile last | nothing |
| a room | that room's tile alone, spanning both columns | the room's mood chips directly under the tile, when it has moods |

**When it renders:** only when the home has **4 or more rooms**. Below that the grid is at most three
cells plus the New room tile and a filter over it is furniture with nothing to do. At four rooms the
grid is already three rows and starts to run past the fold, which is the moment a filter earns its
52px.

| rooms | behaviour |
|---|---|
| 1 to 3 | the row is not rendered at all |
| 4 to about 5 | fits without scrolling at 390 ("All" is 56px, a room pill averages 96px) |
| 14 | scrolls. On render the selected pill is brought into view with `scrollIntoView({ inline: 'center', block: 'nearest' })` and no smooth behaviour on first paint, so the row never opens mid-animation |

**It does not persist.** The scope is page state (`S.homeScope`), never the hash, and Home always
opens at `All`. Home's job is the house; the filter is for the minute you are in.

**The handler's contract:** `data-act="scope"` with `data-a` of an area id or `all`. The handler sets
the scope, repaints the pills' `.sel` and `aria-pressed` in place, and re-renders **only** the grid
container `#rgrid`. It must not call `render()`: a full render on Home returns the page to the top
and throws away the scroll position the person was reading from.

**The payoff, in one number.** A fourteen-room home is about 1836px of Home, 2.4 screens. One pill
tap makes it about 900px, one screen, with that room's on/off, its level, its name and its moods all
in view and no sheet opened. That is what the row is for, and it is why selecting a room shows one
tile rather than nothing useful.

### 4.7 The scene cell row (Home)

Replaces the horizontal `.chip` row in `sceneRowHTML`. The reference's form: a disc over a label,
vertical, five across.

```html
<div class="gh">Scenes<a class="link" data-act="scenes-open" href="#scenes">See all</a></div>
<div class="scells">
  <button class="scell" data-act="run-scene" data-t="p:dinner1">
    <span class="sc-disc lamp" style="background:FILL">…24px glyph…</span>
    <span class="sc-n">Dinner</span>
  </button>
  …
</div>
```

| | value |
|---|---|
| cell width | 62px |
| gap | 8px |
| disc | 56px, `lampHTML(lv, 56, ICON(icon))`, a 24px glyph |
| label | `.sc-n` 14/16 500 `--text`, centred, two lines then an ellipsis, 8px under the disc |
| cell height | 80px with a one-line label, 96px with two. The discs stay aligned at the top, so a row of mixed labels is still a straight line of discs |
| row | a horizontal scroller in the `.ln-row` idiom: bleeds `0 -16px`, padded `6px 16px`, masked at both ends, scrollbar hidden |

Five across at 390: `5 x 62 + 4 x 8 = 342`, and the fifth cell's right edge lands on 358, exactly the
page's content edge. The row bleeds into the gutter, so a sliver of the sixth cell shows in the right
margin: that sliver is the scroll affordance, and it is why the cell is 62 and not 64. At 360 four
and a half cells show and the row scrolls.

The fill is the scene's own lamp colour exactly as the chip does today: `tileItems(s.id)[0].fill` at
that entry's level. **One disc, not a cluster**: at 56px a four-disc cluster is 22px per lamp, under
the legibility floor, and the chip this replaces already shows a single disc. The cluster stays where
it works, on the Scenes page's 112px `.tile` faces, which are untouched.

States: pressed scales the disc (`.scell:active .sc-disc { transform: scale(.94) }`, the `.ln-lamp`
idiom); running gets `outline: 2px solid var(--blue); outline-offset: 3px` on the disc for as long as
`m-wash` plays; a starred scene is already sorted to the front by `homeScenes()` and needs no mark.

Behaviour, copy and routes are unchanged: a tap runs the scene, "See all" opens `#scenes`, a starred
scene is first, there is no "New scene" chip (making a scene is `See all` then `+`, two taps), and
the no-scenes-yet row is unchanged.

### 4.8 The room hero

Top of the room sheet's body, inside the 20px padding, above everything else.

```html
<div class="rhero" data-rhero="AREA_ID">
  <span class="rh-pool" data-rh="DEVICE_ID" style="--x:62%;--y:38%;--s:180px;--c:#F9C489"></span>
  …one per light, at most 8…
</div>
```

| | 390 | 360 | 640 |
|---|---|---|---|
| width | 350px (the full body width) | 320px | 600px |
| height | **180px** | **160px** | 180px |
| radius | `--r-md` 12 | same | same |
| background | `--surface-2` | same | same |
| edge | `inset 0 0 0 1px var(--line)` | same | same |
| margin | `4px 0 16px` | same | same |

**180px, and the arithmetic that settles it.** Measured in the running rig: the large detent is
776.5px, the grab zone 20, the header 62, the body **694.5**. With the hero at 180 the blocks below
it land at: room toggle row ends at 266, the moods block ends at 390, the "Lights" header ends at
438, the first grid row ends at 612, the second grid row runs 624 to 798. At 140 the same rows land
at 226, 350, 398, 572 and 584 to 758. **The 40px buys 40px more of the second grid row's peek and
nothing else**; the moods row is above the fold by more than 300px either way.

> Losing argument, recorded: `02-ux.md` claimed 140px "is what keeps the whole-room toggle and the
> moods row above the fold in a three light room", but its arithmetic assumed a 156px device tile
> where the measured tile is 174, and at 180 the moods row still ends about 300px above the fold.

**The generated light field is the default and ships on every room.** One soft radial per light,
placed deterministically from the device id, sized by its level, coloured by `lightFill(id, level)`,
multiplied over `--surface-2`. It is live: turn the desk lamp green and the room's hero goes green. A
photograph is a dead image of a room; the generated hero is the room as it is lit right now, which is
the more valuable of the two and the one this app is uniquely able to draw.

**It is plain CSS radial gradients and it does not use `js/lightfield.js`.** That module is a
singleton bound to Home's hero (`F.host`, one WebGL context) and it stays there. The room hero costs
no context, no module and no frame, and it is paintable from data attributes. At most 8 pools;
beyond that, the 8 highest levels are kept and the rest are folded into the nearest kept pool's
opacity.

Placement, deterministic so a pool never jumps between renders:

```js
function rhPlace(id) {                       // stable, no randomness, no state
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { x: 12 + (h % 77), y: 26 + ((h >>> 7) % 44) };   // per cent, inside the box
}
const rhSize = lv => Math.round(96 + 148 * (lv / 100));    // px, the pool's box
```

The render string emits the pools once with their `--x`, `--y` and `--s`. `paintRoomHero()` then only
writes `--c` and `opacity` (`0.18 + 0.62 * lv / 100`, zero when the light is off), so the DOM never
changes shape while the room is open and a colour change is a property write that can cross-fade.

**The photograph version**, when the room has one:

```html
<div class="rhero photo" data-rhero="AREA_ID">
  <img class="rh-img" data-roomphoto="AREA_ID" src="/api/roomphoto/AREA_ID?token=…&v=STAMP"
       alt="" decoding="async">
</div>
```

Same box, same radius, same height, `object-fit: cover`, same 1px inset edge. **No text and no
control ever sits on it.** The room's name is in the sheet header above it; type over a photograph
needs a scrim, a scrim cannot reach 4.5:1 while letting the photograph through (§3.5), and we are not
building a new component for a picture of a kitchen. The reference's floating round buttons are
refused for the same reason plus one more: we could not guarantee their contrast over an image of
unknown luminance. On `error` the `<img>` is removed and the class drops back to the generated hero,
which is always available, and nothing tells the person off about it.

**The empty case**, a room with no lights: `.rhero.empty`, `--surface-2`, no pools, the room's 48px
glyph centred in `--text-2`. No copy, no button. The row below already says it in words.

### 4.9 The revised light sheet

One object, one readout, one control: the tile grown to the size of a screen.

```html
<div class="ld light" id="ld" data-id="DEVICE_ID">
  <div class="lstage" data-tile="DEVICE_ID">
    <div class="lamp ld-disc" data-ldisc="DEVICE_ID" role="button" tabindex="0"
         style="width:124px;height:124px;background:FILL">…96px glyph…</div>
    <button class="act dpow" data-act="toggle" data-t="d:DEVICE_ID" data-act-lvl="DEVICE_ID"
            aria-label="Desk lamp on or off">…power…</button>
  </div>
  <div class="display lv" id="ld-big">80%</div>
  <div class="sliderwrap ld-well">
    <input class="slider" type="range" min="0" max="100"
           data-lvl="DEVICE_ID" data-slide="d:DEVICE_ID" aria-label="Desk lamp brightness">
  </div>
  …swatch row, for a lamp with colour or white temperature…
  …the Follow the day row, unchanged…
  <div class="ld-actions">…three .rbtn: Sleep timer, Show first, More…</div>
</div>
```

The stage carries `data-tile`, so **`paintDeviceTiles()` paints the light sheet too**: the same
painter, the same thirteen properties, the same `.lit` / `.unknown` classes and the same
`aria-pressed` on the corner button. There is no second tint path anywhere in the app.

1. **The stage**: full body width, **140px** tall, radius `--r-md`, background `--t-fill`, the lamp
   disc centred at `heroSize(lv)` (100 to 128px) and the same 40px round power button in its
   **bottom right corner**, inset 12px. The tile's corner button and the stage's corner button are
   the same control at the same size in the same place: that is the continuity between the two
   screens.
2. **One readout**: `.display` 40/48 400, centred, 12px under the stage, in `--t-ink`. "80%", "Off",
   "Not answering", or for a non-dimmable light "On". This replaces the 136px `.ld-level` status-text
   button. It carries the class `lv`, so `boot.js`'s slider handler writes the dragged value straight
   into it with no new code, in exactly the copy we want.
3. **One control**: a **horizontal** well, 48px tall (`--well-h: 48px`, `--grip-h: 24px`), full body
   width, 16px under the readout. The vertical `.vslider`, the two `.vsteps` chevron circles and the
   `ld-step` act retire. The app then has one slider idiom instead of two: the same well at 36px in a
   tile, 40px on the house card and 48px here. The disc keeps its vertical drag as the gesture's
   visible twin, unchanged in `wireLightSheet()`.
4. **The mode chip row**: for a lamp with colour or white temperature, the existing `.swatches` row
   comes up to the light's own screen (40px round swatches, the current `.swatch.sel` ring), with a
   trailing `.chip.sm` "More colours" that opens the existing colour pane. The `Colour ›` value row
   retires into that row; the pane behind it, the warmth slider and the hue strip are untouched and
   still reachable. "Follow the day" stays exactly as it is, under the swatches. The swatch row needs
   the **sheet's 20px gutter**, not `.chips.scroll`'s 24, or the last swatch and "More colours" fall
   off the right edge.
5. **The three round actions** stay: Sleep timer, Show first (the star, still the only place a light
   is starred), More.

**The detent, measured.** The grab zone is 20 and the header 62, so a medium sheet (56dvh, 473px at
844) leaves **391px of body**. The composition above measures **412px** for a lamp with colour and
**344px** without it, once the 68px swatch row is taken out. So a light with colour or white
temperature opens **large** and a light without opens **medium**, and in both cases nothing sits
under the fold. That mirrors what the colour pane already does today.

A non-dimmable light (`switch`): no well, the `.display` reads "On" or "Off", the stage's corner
button is the whole control, and the `.ld-swcol` switch retires.

### 4.10 The CSS

Written in the existing files' idiom: flat selectors, tokens, comments that say why. `styles.css`
gets sections A to E, `light.css` gets F, `motion.css` gets the block in §7. Nothing here needs a
build step, a framework or a web font.

```css
/* ================= A. tokens: the tinted surface, and the grid ================= */
/* The --t-* set is written per element by tintApply() from the colour engineer's litSurface(); the
   values here are the untinted fallbacks, which are also what an off tile uses. One ink per
   component: never two inks in one grid. */
:root {
  --t-fill: var(--surface);      --t-fill-pressed: var(--fill-1);
  --t-ink: var(--text);          --t-ink-2: var(--text-2);
  --t-line: var(--line-2);
  --t-well: var(--surface);      --t-well-fill: var(--blue);   --t-well-line: var(--line-2);
  --t-btn-bg: var(--fill-2);     --t-btn-ink: var(--text);
  --t-btn-bg-pressed: var(--fill-3); --t-btn-ink-pressed: var(--text);
  --t-border: var(--line);
  --tile-r: var(--r-lg);  --tile-pad: 14px;  --grid-gap: 12px;
  --tile-min-h: 172px;    --rtile-min-h: 150px;
  --hero-h: 180px;        --scell: 62px;     --scell-disc: 56px;
}

/* ================= B. the device tile (the room sheet's grid) ================= */
/* minmax(0, 1fr) and not 1fr: a plain 1fr is minmax(auto, 1fr) and one long device name would set
   the track's width and push the grid off the phone (the same reason .tiles.grid gives). */
.dgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--grid-gap); }
/* one device: the tile takes the whole row. A lone half-width tile beside 181px of nothing reads as
   a bug, and the full width gives its well 250px, which is a better dimmer. */
.dgrid.one .dtile, .dtile.wide { grid-column: 1 / -1; }
.dgrid.one .ddisc { width: 48px; height: 48px; }

.dtile { position: relative; display: flex; flex-direction: column; min-height: var(--tile-min-h);
  padding: var(--tile-pad); border-radius: var(--tile-r); background: var(--t-fill);
  border: 1px solid var(--t-border); color: var(--t-ink); transform-origin: 50% 50%;
  transition: background-color .255s var(--ease), border-color .255s var(--ease),
              color 1ms var(--ease) var(--m-ink-swap), transform .15s var(--ease); }
.dtile.wide { min-height: 0; }
/* the whole card is the press surface, so the pressed fill is the engineer's fillPressed, which is
   the surface his validator measures the white ink against. :has() keeps the two controls inside
   from dipping the card; light.css already uses :has(), so this is not a new dependency. */
.dtile:active:not(:has(.dpow:active)):not(:has(.dwell:active)) {
  background-color: var(--t-fill-pressed); transform: scale(.99); }
.dtile .dbody { display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
  flex: 1 1 auto; min-width: 0; margin: -6px -6px 0; padding: 6px 6px 12px;
  border-radius: var(--r-md); color: inherit; text-align: left; background: none; }
.dtile .dbody:focus-visible { outline: 0; box-shadow: inset 0 0 0 2px var(--blue); }
.dtile .ddisc { width: 40px; height: 40px; }
.dtile .ddisc svg.i { width: 20px; height: 20px; }
/* the capability rings stay (they say what the lamp can do); the blue "on" ring goes, because the
   surface behind the disc is already the light's own colour */
.dtile .lring::before { inset: -3px; }
.dtile .ddisc.ringed { outline: none; }
.dtile .dn { font-size: 16px; line-height: 20px; font-weight: 500; color: var(--t-ink);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  overflow-wrap: anywhere; }
.dtile .dv { font-size: 14px; line-height: 16px; font-weight: 400; color: var(--t-ink-2);
  margin-top: -8px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: flex; align-items: center; }
.dtile .dv .cdot { flex: none; }
/* the foot is pinned to the bottom, so a two-line name grows the tile without moving the controls */
.dtile .dfoot { display: flex; align-items: center; gap: 10px; height: 44px; margin-top: auto; }
/* the well is always rendered for a dimmable light and hidden by visibility when it is off: there is
   no virtual DOM, and a tile whose geometry changed as the light came on would shift under the thumb */
.dtile .dwell { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; height: 44px;
  opacity: 0; visibility: hidden; transition: opacity .15s var(--ease), visibility 0s linear .15s; }
.dtile.on[data-kind="dim"] .dwell { opacity: 1; visibility: visible; transition-delay: 0s; }
.dtile .dwell .slider { --well-h: 36px; --grip-h: 18px;
  --track: var(--t-well); --fill: var(--t-well-fill); --line-2: var(--t-well-line); }
/* the 40px action icon, given a 48px touch box the same way .fav and .btn.sm get one */
.dtile .dpow { width: 40px; height: 40px; flex: none;
  background: var(--t-btn-bg); color: var(--t-btn-ink);
  transition: background-color .15s var(--ease), color .15s var(--ease), transform .15s var(--ease); }
.dtile .dpow::after { content: ""; position: absolute; inset: -4px; }
.dtile .dpow svg.i { width: 20px; height: 20px; }
.dtile .dpow:active { transform: scale(.92);
  background: var(--t-btn-bg-pressed); color: var(--t-btn-ink-pressed); box-shadow: none; }
/* a fan or a shade that is on is not a light: it takes the Tenzing on state, never warmth */
.dtile.on[data-kind="fan"], .dtile.on[data-kind="shade"] {
  background: var(--blue-10); border-color: var(--blue-20); color: var(--text); }
.dtile.on[data-kind="fan"] .dv, .dtile.on[data-kind="shade"] .dv { color: var(--text-2); }
/* light.css gives .light .slider a 40px well and .light .sliderwrap a top margin: not in a tile */
.dtile .sliderwrap { margin-top: 0; }
.dtile.unknown .dwell { opacity: 0; visibility: hidden; }

/* ================= C. the room tile (Home) ================= */
.rgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--grid-gap); }
.rtile { position: relative; display: flex; flex-direction: column; min-height: var(--rtile-min-h);
  padding: var(--tile-pad); border-radius: var(--tile-r); background: var(--t-fill);
  border: 1px solid var(--t-border); color: var(--t-ink); transform-origin: 50% 50%;
  transition: background-color .255s var(--ease), border-color .255s var(--ease),
              color 1ms var(--ease) var(--m-ink-swap), transform .15s var(--ease); }
.rtile:active:not(:has(.sw:active)) { background-color: var(--t-fill-pressed); transform: scale(.99); }
.rtile .head { display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
  flex: 1 1 auto; min-width: 0; margin: -6px -6px 0; padding: 6px 6px 10px;
  border-radius: var(--r-md); color: inherit; text-align: left; background: none; }
.rtile .head:focus-visible { outline: 0; box-shadow: inset 0 0 0 2px var(--blue); }
.rtile .slot { width: 40px; height: 40px; display: grid; place-items: center; flex: none; }
.rtile .onchip { width: 32px; height: 32px; outline: 1px solid var(--line); outline-offset: 3px; }
.rtile .onchip svg.i { width: 20px; height: 20px; }
/* a photograph in the slot is a square with a hairline, never a circle: a circle reads as a face */
.rtile .rslot-photo { width: 40px; height: 40px; border-radius: var(--r-s); object-fit: cover;
  display: block; box-shadow: inset 0 0 0 1px var(--line); }
.rtile .n { display: block; font-size: 16px; line-height: 20px; font-weight: 500; color: var(--t-ink);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rtile .s { display: block; font-size: 14px; line-height: 16px; font-weight: 400; color: var(--t-ink-2);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: -8px; }
.rtile .rfoot { display: flex; align-items: center; justify-content: flex-end; height: 24px; margin-top: auto; }
/* the scope pill's selected room: one tile across the whole grid, its moods under it */
.rgrid.scoped .rtile { grid-column: 1 / -1; }
/* the add affordance, not a device: an outline and blue ink, never a fill */
.rtile.new { border: 1px dashed var(--line-2); background: none; color: var(--blue);
  align-items: center; justify-content: center; gap: 8px; }
.rtile.new svg.i { width: 24px; height: 24px; }

/* ================= D. the scope pills and the scene cells (Home) ================= */
/* a scope filter is not navigation: the selected pill is Tenzing's selected chip, never a filled
   accent pill, because blue on this screen already means the active tab and the thing you touch.
   .chips.scroll bleeds by 24px, which is a sheet's gutter: on a 16px page that is 406px of box on a
   390px phone and the page scrolls sideways. The row takes the page's gutter instead. */
.scopes.chips.scroll { margin: 16px -16px 4px; padding: 2px 16px 4px;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 24px), transparent); }
.scopes .chip { padding: 0 16px; }
.scopes .chip[aria-pressed="true"] { background: var(--fill-1); box-shadow: inset 0 0 0 2px var(--text); }

.scells { display: flex; align-items: flex-start; gap: 8px; overflow-x: auto; margin: 0 -16px;
  padding: 6px 16px; scrollbar-width: none;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 24px), transparent); }
.scells::-webkit-scrollbar { display: none; }
/* 5 x 62 + 4 x 8 = 342 of 358 at 390: five whole cells and a sliver of the sixth, which is the only
   affordance the row needs to say it scrolls */
.scell { flex: none; width: var(--scell); display: flex; flex-direction: column; align-items: center;
  gap: 8px; color: inherit; background: none; }
.scell .sc-disc { width: var(--scell-disc); height: var(--scell-disc); outline: 2px solid transparent;
  outline-offset: 3px; transition: outline-color .255s var(--ease), transform .15s var(--ease); }
.scell .sc-disc svg.i { width: 24px; height: 24px; }
.scell:active .sc-disc { transform: scale(.94); }
.scell.running .sc-disc { outline-color: var(--blue); }
.scell .sc-n { font-size: 14px; line-height: 16px; font-weight: 500; color: var(--text); text-align: center;
  max-width: var(--scell); overflow: hidden; overflow-wrap: break-word;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.scell:focus-visible { outline: 0; }
.scell:focus-visible .sc-disc { outline-color: var(--blue); }

/* ================= E. the room hero (the room sheet) ================= */
/* The generated field is the default and ships on every room: a photograph is a dead image of a
   room, this is the room as it is lit right now. It is plain CSS and not js/lightfield.js, because
   that module is a singleton already bound to Home's hero. */
.rhero { position: relative; height: var(--hero-h); margin: 4px 0 16px; border-radius: var(--r-md);
  overflow: hidden; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
.rh-pool { position: absolute; width: var(--s); height: var(--s); left: var(--x); top: var(--y);
  transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none; mix-blend-mode: multiply;
  background: radial-gradient(closest-side, var(--c) 0%, var(--c) 18%, transparent 100%);
  opacity: 0; transition: opacity .6s var(--ease), background .4s var(--ease); }
/* a light whose level is falling leaves more slowly than it arrives: the fact first, the light after */
.rh-pool.down { transition: opacity .9s var(--ease-slow), background .4s var(--ease); }
.rh-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
/* a room with no lights: its glyph, and nothing that pretends to be a picture */
.rhero.empty { display: grid; place-items: center; color: var(--text-2); }
.rhero.empty svg.i { width: 48px; height: 48px; stroke-width: 1; }

/* ================= F. the light sheet (light.css) ================= */
/* the tile, grown to the size of a screen: the same tinted surface, the same disc, the same corner
   power button in the same place. 140px keeps the whole sheet inside the medium detent (473px at
   844) for a plain dimmer; a lamp with colour opens large, because the swatch row costs 68px. */
.lstage { position: relative; height: 140px; margin: 0 0 12px; border-radius: var(--r-md);
  background: var(--t-fill); display: grid; place-items: center;
  transition: background-color .255s var(--ease); }
.lstage .ld-disc { position: static; }
.lstage .dpow { position: absolute; right: 12px; bottom: 12px; }
.lstage:not(.lit) { background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); }
#ld .display { text-align: center; color: var(--t-ink); margin: 0 0 16px; }
#ld .ld-well { margin: 0 0 16px; }
#ld .ld-well .slider { --well-h: 48px; --grip-h: 24px; }
/* the swatch row bleeds to the sheet's own 20px gutter, not .chips.scroll's 24, or the last swatch
   and "More colours" fall off the right edge */
#ld .swatches { margin: 0 -20px 16px; padding: 4px 20px 6px;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 20px, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(90deg, transparent, #000 20px, #000 calc(100% - 24px), transparent); }

/* ================= sizes and preferences ================= */
@media (max-width: 379px) { :root { --hero-h: 160px; } }
/* at the 640px content cap two columns would be a 294px tile, which is a card and not a tile */
@media (min-width: 560px) { .dgrid, .rgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (hover: hover) and (pointer: fine) {
  .dtile:hover:not(:active), .rtile:hover:not(:active) { background-color: var(--t-fill-pressed); }
  .scell:hover:not(:active) .sc-disc { box-shadow: var(--shadow-1); }
}
```

### 4.11 Measured, not asserted

Every number above was rendered against the app's real `styles.css`, `light.css` and `motion.css`
and measured at three widths.

| measured | 390 | 360 | 640 |
|---|---|---|---|
| device tile | 169 x 174 | 154 x 174 | 192 x 174 |
| device tile, two-line name | 169 x 194 | 154 x 194 | 192 x 194 |
| the inline well | 89 x 36 in a 44px row | 74 x 36 | 112 x 36 |
| the corner power button | 40 x 40 | 40 x 40 | 40 x 40 |
| one device, stretched | 350 x 182 | 320 x 182 | 600 x 182 |
| room tile | 173 x 152 | 158 x 152 | 194.7 x 152 |
| scene cell | 62 x 80, 96 with a wrapped label | same | same |
| room hero | 350 x 180 | 320 x 160 | 600 x 180 |
| light sheet stage, well | 350 x 140, 350 x 48 | 320 x 140, 320 x 48 | 600 x 140 |
| the room sheet: card, grab, header, body | 776.5 / 20 / 62 / 694.5 | same | same |
| horizontal page overflow | none | none | none |
| a clipped name or value | none | none | none |

---

## 5. The information re-flow

### 5.1 Home, top to bottom

| # | block | shown when | height at 390 | why here |
|---|---|---|---|---|
| 1 | Large title and the status circle | always | 64 | Unchanged. The circle is the connection, and it is the only thing on the page allowed to be a system fact. No greeting, no avatar |
| 2 | **The house card**, over the light field | always | ~208 | The hero. It answers "what is lit right now" for the whole house in one glance and holds the two most used controls in the app. Nothing may go above it |
| 3 | The due line, and the wind-down caption | when something runs within the hour · when the curve is below 100 | 24 · 20 | Transient, about the house, one line each. They belong under the object they describe |
| 4 | **The starred lamp row** | when at least one light is starred | ~120 | The only one-tap path from Home to a *specific* light, and the only place the hold-for-a-timer gesture lives |
| 5 | `SCENES` header with "See all", then the scene cells | when any scene exists | 28 + 88 | Running a scene is the shallowest thing in the app and stays one tap. Above the rooms because a scene crosses rooms |
| 6 | **The scope pill row** | when the home has 4 or more rooms | 44 + 8 | It scopes the block under it, so it sits with that block and under its header |
| 7 | `ROOMS` header, then **the room tile grid** | always | 28 + grid | The page's body. Rooms are the grid |
| 8 | `SLEEP TIMERS` header and the timer blocks | when a timer is running | 28 + 72 each | A fact about the house, never filtered by the scope pill. After the grid because it is rare |
| 9 | One row of advice, or nothing | see below | 84 | Last, and never two |

Nothing else is on Home. No greeting, no avatar, no energy figures, no "+" in the nav bar.

**The house card is unchanged.** Content, controls and copy are exactly what `houseCardHTML()` renders
today: the headline (`lightNowHeadline(rooms, 'wide')`), the sub (`nowSub`), the 40px house dimmer
well with its percentage, the "All off" button with the power glyph, and the `···` that holds Night
in every lit room, a house-wide sleep timer and "Everything off, and close the shades". The hold on
the power button still does the shades and the fans. It costs the blocks below it 208px and it is the
one block that earns them. **Its well and its All off button never take a light's colour**; the light
field behind it already carries the warmth.

**The starred lamp row stays, in place, in form**, with its hint ("Tap to switch · hold for a timer",
three visits only). Against the pull to delete it: it is the only one-tap route from Home to one
named light, it is the only visible home of the hold-for-a-timer gesture on a single light, it is opt
in (a home with nothing starred shows no row and Home starts with Scenes), and it is a row of discs
rather than a grid, so it does not compete with the room tiles for the question of what the grid on
this page is. It costs 120px, pushing the first grid row from about 636 to about 756, and the person
who starred it chose to pay that.

**The advice row** is unchanged and still at most one: "Not connected" beats everything, then the
Next row, then nothing. Never two, never above the rooms.

### 5.2 Home at 1, 5 and 14 rooms

All three at 390x844 with the tab bar, nothing starred unless said.

**One room.** No pill row. The grid is two cells on one row: the room, and New room. Page height
about 632px, so Home fits one screen with nothing to scroll.

**Five rooms** (the owner's home, one starred light, the pill row on, one advice row). The grid is
six cells over three rows, 480px. Page height about 1260px, 1.6 screens. The house card, the due
line, the starred lamp, the scenes and the pills are in the first screen; the first grid row is at
about 756px, so one room tile is visible above the fold and the rest arrive with a short scroll.
Against the same page drawn the old way (a five-row list at 128px each, chip scenes, no pills) the
room block itself is about 160px shorter. The win is not mostly length: it is that a room's state is
now a surface and not a word.

**Fourteen rooms.** The grid is fifteen cells over eight rows, about 1240px; Home is about 1900px,
2.4 screens, and the New room tile is below the fold, which is right for a setup action. This is the
size the pill row exists for: one tap on a room pill gives one tile plus its moods and about one
screen of page.

**Nothing paired at all.** Unchanged: `setupEmpty()` takes the whole page and the connect walk slides
over it. No house card, no pills, no grid, no New room tile. The first thing the app says is what to
do, not what is missing.

**Connected, but no rooms yet** (a Hue-only home can hit this). The grid holds one full-width row,
"No rooms yet" / "Your rooms appear here as soon as your home is connected", and the New room tile
beside it.

### 5.3 The room sheet

`showSheet('room', name, body, { detent: 'large', sub: roomSummary(aid), top: true })`, over Home,
exactly as `renderRoomSheet()` opens it today. Body width 350 at 390.

| # | block | shown when | height | why here |
|---|---|---|---|---|
| 1 | **The room hero** | always | 180 + 20 | The room's identity and, because it is generated from the room's own lights, its honest state at a glance. Nothing is written over it, ever |
| 2 | **The whole-room toggle** row | the room has anything that is not a shade | 58 + 8 | The daily action. First control, full width, unmissable, above every per-device detail. Unchanged from today |
| 3 | **The moods** chip row, or the "Give this room moods" offer | the room has a dimmer | 76 + 8 | The fastest way to set the whole room at once. Above the grid because it is coarser than the grid |
| 4 | `LIGHTS` (or `IN THIS ROOM`) header, then **the device grid** | always | 48 + grid | The body. Devices are the grid on the room |
| 5 | **Room setup** row | always | 24 + 64 | The way out to everything you do once. Last, and the only row in the sheet that leads to a page |

Nothing else. No "Add a photo" here, no kinds, no roles: the sheet is a control surface.

**The whole-room toggle** is unchanged: one full-width row, "Turn the room on or off", with the `.sw`
at the right pointed at `a:<aid>`. Shown when the room holds anything that is not a shade.

**The moods row** is unchanged: `moodRowHTML(aid)`, the room's mood scenes as chips with their own
lamp discs and the current mood selected. A room with a dimmer and no moods gets the existing offer
row instead: "Give this room moods" / "Bright, Relax, Dinner, Movie and Night". A room with no dimmer
gets neither.

**The colour's name stays in words.** Today the light row prints "Green · 80%". On a tile the fill and
the disc carry the colour, and the words go on carrying it too, on the value line, truncating to
"Green" at 360. Two reasons: colour is never the only channel, which is what keeps us compliant, and
a tile that says "Green" is a door with a label.

**The way out** is an unchanged row, 24px clear of the grid: "Room setup" / "What each light is for,
moods, kinds", opening the page at `#room/<area>/setup`. Room setup stays a page on purpose: it
became one because two of its rows dead-ended inside a sheet, and a nav bar's back arrow cannot go
missing.

**A room with a fan, a shade and no lights**, named because it is the awkward one:

```
  ▁▁▁▁
 Porch                                            ✕
 2 things · all off

 [ the generated hero, which has no lights to draw:
   the 48px room glyph on --surface-2 ]

 ┌──────────────────────────────────────────────┐
 │ Turn the room on or off                ( o ) │   the fan is not a shade, so the row shows
 └──────────────────────────────────────────────┘

 IN THIS ROOM

 ┌──────────────────────────────────────────────┐
 │ ✿  Ceiling fan                               │   spans both columns, no tint (a fan is not light)
 │    Off                                       │
 │   [ Off ][ Low ][ Medium ][ Med-hi ][ High ] │
 └──────────────────────────────────────────────┘
 ┌──────────────────────────────────────────────┐
 │ ▤  Porch shade                               │   spans both columns
 │    Closed                                    │
 │   [ Open ][ Stop ][ Close ]                  │
 │   [========= openness well =========]        │
 └──────────────────────────────────────────────┘

 ┌──────────────────────────────────────────────┐
 │ Room setup                                ›  │
 └──────────────────────────────────────────────┘
```

No moods row (no dimmer). No "Lights" header. No warmth anywhere. Nothing is greyed out, nothing is
missing, and no copy apologises for the room not having lamps. In a shade-only room the whole-room
toggle is absent, as it is today.

**A remote opens the same way and is untouched by this pass**: the remote sheet keeps its stage, its
Buttons list and its More, and every pane inside it still ends up back at the remote.

### 5.4 The capability ledger

The contract that the redesign loses nothing. "Taps" counts from a cold launch with Home open; a
gesture is counted separately. Every row touches a surface this document changes.

| # | what it does | today: where · taps | after: where · taps | verdict |
|---|---|---|---|---|
| 1 | **Turn a whole room on or off** | Home, the room row's switch · **1**. Room sheet's first row · 2. Swipe a room row left, "All off" · 1 + gesture | Home, the room tile's switch · **1**. Room sheet's first row · 2 | Same. The switch moves from a row to a tile foot; the swipe goes (row 2) |
| 2 | **A light's swipe action** (`rowswipe.js`) | Room sheet, swipe a light row, "Turn off" / "Turn on" · 1 + gesture. Its visible twin, the row's switch · **2** | Room sheet, the tile's corner power button · **2** | **Further, for the gesture only.** Justified: a sideways drag across a 169px cell inside a two-column grid has no unambiguous reading and would fight `slide.js` for the same gesture on the same card, and the control that replaces it is a 40px always-visible button. The tap path is unchanged at 2 |
| 3 | **Star a light** ("Show first") | Home › room › light › the star · **3** | Identical · **3** | Unchanged |
| 4 | **Sleep timer, one light** | Hold a lit starred lamp on Home · **1 hold**. Home › room › light › Sleep timer › Start · **4** | Identical · 1 hold / **4** | Unchanged. This is why the starred lamp row stays |
| 4b | **Sleep timer, the house** | House card `···` › Sleep timer › Start · **3** | Identical · **3** | Unchanged |
| 5 | **"What kind" of light** | Home › room › Room setup › the light's Kind row · **3** to the picker, 5 with both steps. Or light › More › Kind of light · 4 / 6 | Identical · **3** / 5 | Unchanged. Both doors survive |
| 6 | **Run a room mood** | Home › room › a mood chip · **2** | Room sheet, identical · **2**. New second door: a room's scope pill on Home › a mood chip · **2**, without opening a sheet | Unchanged, plus one shortcut |
| 6b | **Make a room's moods** | Home › room › "Give this room moods" · **2**. Or Room setup › Make the moods · 3 | Identical · **2** / 3 | Unchanged |
| 7 | **Colour and warmth** | Home › room › light › Colour · **3** to the pane, 4 with a swatch | Home › room › light › a swatch · **3**. The pane is behind "More colours" · 4 | **Closer by 1** for a swatch. Improved further: the tile shows the colour as a fill, a disc **and** its name, so the door is legible from the room |
| 8 | **Follow the day**, one lamp | Home › room › light › Follow the day · **3**, 4 with the switch | Identical · **3** / 4 | Unchanged |
| 8b | **Follow the day**, a room | Home › room › Room setup › the warmth row · **3**, 4 with the switch | Identical · **3** / 4 | Unchanged |
| 9 | **Remove a device** | Home › room › light › More › Remove › confirm · **5** | Identical · **5** | Unchanged |
| 10 | **Move a device to another room** | Home › room › light › More › Room › pick · **5**. Or Room setup › Name and what is in it › the device › pick · 5. Or Settings › Rooms and lights › Rooms › the room › the device › pick · 6 | Identical · **5** / 5 / 6 | Unchanged, three doors |
| 11 | **Make a room** | Settings › Rooms and lights › Rooms › New room · **4**. Plus the "New room" row in any room picker, and the chip in Add a device | **Home, the New room tile · 1**, plus all of the above unchanged | **Closer by 3** |
| 12 | **Rename a room** | Home › room › Room setup › Name and what is in it, then type · **3**. Or Settings › Rooms and lights › Rooms › the room · 4 | Identical · **3** / 4 | Unchanged |
| 13 | **Fan speeds** | Home › room › a speed chip · **2** | Home › room › a speed chip on the fan's spanning tile · **2** | Unchanged, and this is the whole reason the fan tile spans two columns |
| 14 | **Shade Open / Stop / Close** | Home › room › a button · **2**, plus the openness slider in the row | Home › room › a button on the shade's spanning tile · **2**, the openness well kept under them | Unchanged |
| 15 | **The scene editor** | Home › See all › Edit › a tile · **3** | Identical · **3** | Unchanged |
| 16 | **"See all" for scenes** | Home, the link in the SCENES header · **1** | Identical · **1** | Unchanged. The link stays in the header when the chips become cells |
| 17 | **Run a scene** | Home, a scene chip · **1** | Home, a scene cell · **1** | Unchanged |
| 18 | **Open a room** | Home, the room row · **1** | Home, the room tile body · **1** | Unchanged |
| 19 | **Set one light's brightness** | Home › room › light › drag · **2 + drag** | Home › room › drag the tile's well · **1 + drag**, still through `slide.js`'s gate. The light sheet's disc and well are unchanged | **Closer by 1** |
| 20 | **Turn one light on or off** | Home › room › the row's switch · **2**. Home, a starred lamp disc · 1 | Home › room › the tile's power button · **2**. Home, a starred lamp disc · 1 | Unchanged |
| 21 | **The house: All off, the dimmer, Night, the shades hold** | The house card and its `···` · **1** to 2 | Identical | Unchanged |
| 22 | **A room's photograph** | does not exist | Home › room › Room setup › Add a photo · **3**, then the OS picker | New (§6) |
| 23 | **Step a light by 10%** (`.vsteps`) | Light sheet, a chevron circle · 3 + tap | The 48px horizontal well, and the disc's vertical drag · 3 + drag | The control retires; the capability (setting a level) has two better doors. Stepping was a convenience with no unique capability |

**Two things get further away, both in row 2, and both are the same thing:** the sideways swipe on a
light row and on a room row. Both are shortcuts to an action that already has a visible control on
the same surface, and in both cases the visible control gets bigger and more reachable.
`rowswipe.js` is **not deleted**: its automation rows ("Skip tonight", "Delete") are untouched, and
`actionsFor()` simply stops matching `[data-lswipe]` and `.item.room` because no such rows exist on
these two surfaces any more.

**Nothing else moves at all.** Every other row above is the same number of taps or fewer.

### 5.5 Discoverability, audited

The owner has asked twice for the same thing in two shapes: adding a room should show up everywhere
he would want to add one, and changing colour should be as reachable as turning lights on.

**Making a room:** the New room tile on Home (**1**), a light › More › Room › New room (5), any
"Which room is this in?" sheet › New room (varies), Add a device › the New room chip (in the flow),
Settings › Rooms and lights › Rooms › New room (4). Five doors, one of them one tap from the first
screen.

**Turning lights on:** the house card's power button (**1**), a room tile's switch (**1**), a starred
light's disc (**1**), a scene cell (**1**), a device tile's power button (**2**), a mood chip from the
room sheet or from a room's scope pill (**2**).

**Changing colour:** seeing what colour a lamp is showing is **1** (the room tile is tinted, its disc
carries the colour and its value says the colour's name); setting a colour from a swatch is **3**;
the full pane is **4**. Colour is one tap deeper than turning that same light on from the same place,
which is the right ratio: one is daily, the other is weekly. Every step is a labelled row or a
labelled tile; there is no gesture, no scroll to find and no rainbow button that toggles something
else.

**What is one tap further than it was:** nothing, except the two swipes in ledger row 2, whose
visible twins got bigger.

---

## 6. The room photograph, end to end

Inside the director's ruling: the generated hero is the default and ships on every room, a photograph
is optional, "Add a photo" is one row in Room setup, and **no copy anywhere asks for a photograph**.
Nothing on Home, in the room sheet, in an empty state or in a toast ever suggests the app would look
better with a picture in it.

**Whose it is: the room's.** One photograph per room, and nothing else in the app takes one. A light
does not have a location; a room is the location.

### 6.1 The hub side, as shipped

**This half is already built and deployed.** It is documented here as the contract, and it is the
contract the app is written against. Where `02-ux.md` proposed a different shape (a POST of raw
bytes, registered before `express.json`, an integer stamp), the shipped shape wins.

```
PUT    /api/roomphoto/:room     requireAuth, its own express.json({ limit: '1mb' }) parser
                                body: { data: "data:image/<jpeg|jpg|png|webp>;base64,<…>" }
                                the decoded bytes are capped at PHOTO_MAX = 400 * 1024
                                writes DATA_DIR/photos/<room>.<ext>, tmp + rename, then drops the
                                other formats that room used to have (one photo per room)
                                -> 200 { ok: true, stamp: "<Date.now(), a digit string>" }
                                -> 400 { error: "that file isn't a photo we can read" }   (not a data URI, or empty)
                                -> 413 { error: "that photo is too big" }                 (decoded > 400kb)
GET    /api/roomphoto/:room     requireAuth, sends the bytes with the stored file's own type
                                ?v=<stamp> present:  Cache-Control: private, max-age=31536000, immutable
                                ?v= absent:          Cache-Control: private, no-cache
                                -> 404 { error: "no photo" } when there is none
DELETE /api/roomphoto/:room     requireAuth, removes every format for that room -> { ok: true }
```

Four things about this shape that the app depends on:

- **It is JSON, not raw bytes.** Base64 costs a third, so a 400kb photo arrives as a 533kb body; this
  one route gets its own 1mb parser rather than raising the limit on the config and every command
  with it. The global `express.json({ limit: '512kb' })` budget shared by `settings`, `groups`,
  `presets`, `bindings` and the automations is untouched, and the route does not have to be
  registered before it.
- **`?token=` is what lets a plain `<img src>` authenticate.** `requireAuth` reads
  `Authorization: Bearer` **or** `req.query.token`, the same trick `/install.sh` uses. Both the hero
  and the Home tile slot use `/api/roomphoto/<room>?token=${S.token}&v=${stamp}`. The image is served
  from the app's own origin, so it is never a cross-origin load and never a canvas taint.
- **`:room` is validated against `^[A-Za-z0-9_-]{1,64}$`**, the same pattern the room validator uses,
  so no path can be traversed, and the stored extension is part of the file name, so finding the file
  finds its type (`jpg`, `png`, `webp`).
- **The bytes never go near the config document.** On Railway `DATA_DIR` is a mounted volume, so the
  files survive a redeploy. There is no bucket and none is wanted.

`hub/validate.js` carries one field on a room, beside `bridge_area` and `hue_room`. It is **a digit
string, not an integer**:

```js
// photo: a stamp saying "this room has a picture, and this is which one". The bytes live on the
// volume beside the documents (hub/store.js); only the stamp travels in the config, and it changes
// whenever the photo does so a cached <img> knows to fetch again.
const photo = typeof r.photo === 'string' && /^[0-9]{1,16}$/.test(r.photo) ? r.photo : null;
```

That is the whole schema change, and it is already in `hub/validate.js`. Everything in §6.2 to §6.6
is the half that is still to build.

### 6.2 Where the row is

Room setup (`#room/<area>/setup`), under the existing `THIS ROOM` header, as the **first** row of that
card, above "Name and what is in it". It is the room's own identity, and that is the card the room's
identity lives in.

```
 THIS ROOM
 ┌──────────────────────────────────────────────┐
 │  +   Add a photo                             │      no photo yet
 │      It shows at the top of the room.        │
 ├──────────────────────────────────────────────┤
 │      Name and what is in it              ›   │
 │      Rename it, move lights and remotes …    │
 └──────────────────────────────────────────────┘
```

With a photo the first row becomes a 40px thumbnail in the leading slot and the title "Photo", with a
chevron.

### 6.3 The picker

`<input type="file" accept="image/*">`, hidden, one per room setup page, clicked by the row. That is
the only picker a PWA has. On iOS it offers Photo Library, Take Photo and Choose File by itself, so
**the app adds no sheet of its own in front of it**: the row is one tap and the OS asks the rest.
There is no drag and drop, no camera button, no second path.

With a photo already set, the row opens a compact sheet instead, because there are now two things to
do:

```
 Photo
 Kitchen
 ┌──────────────────────────────────────────────┐
 │ Choose a different photo                     │
 │ Remove the photo                             │
 │ The room goes back to showing its own light. │
 └──────────────────────────────────────────────┘
```

"Choose a different photo" clicks the same input. "Remove the photo" is the danger row. No confirm
sheet: it autosaves and the toast offers Undo, like everything else.

### 6.4 What happens between the pick and the picture

Autosave, no Save button, optimistic, and honest at every step.

1. **The file arrives.** Before anything else: if `file.size > 25 MB`, stop with the too-big string.
   Otherwise decode it into an `Image`; if the decode fails, stop with the not-a-photo string. This
   catches HEIC that Safari did not convert, a PDF picked through Choose File, and a corrupt file.
2. **Downscale in the browser.** Draw to a `<canvas>` so the long edge is at most **1024px** (the hero
   is 350 CSS px, so 1024 covers a 3x phone and the 640px layout), export `image/jpeg` at quality
   0.72. If the blob is over **400kb** (the hub's `PHOTO_MAX`), re-encode at 0.6, then at 0.5. If it
   is still over 400kb, stop with the too-big string. In practice a room photo lands at 30 to 60kb.
3. **Show it at once.** The row's leading slot takes the local `URL.createObjectURL` thumbnail, the
   row's value reads "Adding…" and the row is disabled. **The room's hero swaps to the local preview
   in the same frame**, so the person sees the result before the network does anything. This is the
   same optimism `paintState()` uses for a light.
4. **Upload.** `PUT /api/roomphoto/<roomId>` with `Content-Type: application/json` and the body
   `{ data: "data:image/jpeg;base64,…" }` (the blob read through `FileReader.readAsDataURL`), 20
   second timeout. `api()` already adds the bearer token.
5. **On success** the hub answers `{ ok: true, stamp: "<digits>" }`. The app writes `photo: stamp`
   (the string, verbatim) onto that room in `settings.rooms[]`, saves the config, revokes the object
   URL, repaints the hero and the Home tile from
   `/api/roomphoto/<roomId>?token=<S.token>&v=<stamp>`, and toasts **"Photo added"** with Undo.
   Replacing toasts **"Photo changed"** with Undo.
6. **On failure** everything reverts in one frame: the hero goes back to the generated field, the row
   goes back to "Add a photo" or to the previous thumbnail, and the toast carries the failure string
   and a **Try again** action that re-runs the upload with the blob still in memory.

The stamp is what makes the immutable cache safe: the URL changes whenever the picture does, so a
cached `<img>` knows to fetch again and a fresh one is cached for a year.

### 6.5 Removing, and why Undo can work

"Remove the photo" clears `photo` on the room record and saves. **It does not call DELETE.** There is
exactly one photo file per room, a replacement overwrites it (and `writePhoto` drops the other
formats), and deleting the room deletes it. So the only orphan possible is one file per room, at most
400kb each, bounded by the 64-room limit the validator already enforces. That is what makes Undo
real: the toast's Undo puts the stamp back and the picture is still there.

`DELETE /api/roomphoto/<roomId>` is called from exactly one place: `roomsDelete()` in
`web/js/rooms.js`, when the room itself goes.

The copy does not claim the bytes are gone. It says the room goes back to showing its own light,
which is exactly what happens.

### 6.6 Offline, and the distinction that matters

**"Not connected" and "offline" are two different things in this app**, and the photo flow is the
first place that difference has teeth.

- `connLost()` means the **connector** cannot be reached: the bridge, the lights, the commands. The
  hub is the same origin as the app and is still answering. **Adding a photo works normally while the
  home is not connected**, and no copy mentions it. Saying "you are offline, try later" here would be
  a lie.
- The **phone** having no network is the real offline case. Before uploading, if
  `navigator.onLine === false`, or if the request fails with a network error rather than a status,
  the flow stops at step 6 with the no-connection string and a Try again.

There is no queue and no "it will upload later". The app does not promise work it cannot prove it
did.

### 6.7 Where the photograph shows, and where it never does

- The room sheet's hero: full bleed inside the sheet's 20px gutter, radius `--r-md`, 180px,
  `object-fit: cover`.
- The 40px leading slot of that room's tile on Home, radius `--r-s` 8.

Nowhere else, ever. No text is drawn over it on either surface: the room's name is in the sheet's
header above the hero, and on the tile it is beside the slot, never on it.

---

## 7. Motion

Everything here is in the app's existing two curves and four durations, plus the one addition in
§2.4. It is bound by the line the director will not cross: **nothing may make turning a light on
slower than it is today.** Every fill is computed into the paint pass that the optimistic
`paintState()` already runs, and no animation gates a command.

### 7.1 The colour cross-fade

The signature moment: a lamp changes colour or level and its tile, its disc, the light sheet's stage
and its room's hero all move to the new colour. The `--t-*` properties are written onto the element
by the paint pass, and **CSS carries the transition, not JavaScript.** Nothing in the tile grid is
tweened by GSAP.

| what | property | duration | curve | cost |
|---|---|---|---|---|
| tile fill | `background-color` | 255ms | `--ease` | paint |
| tile edge | `border-color` | 255ms | `--ease` | paint |
| tile name and value | `color` | 1ms after a 60ms delay | `--ease` | paint |
| tile disc | `background-color` | 255ms | `Motion.E.ease` (the existing `tween()`) | paint |
| power button face and glyph | `background-color`, `color` | 150ms | `--ease` | paint |
| well fill (`--p`) | `--p` | 255ms | `--ease` | paint, optional, see 7.6 |
| well appearing or leaving | `opacity` | 150ms | `--ease` | compositor |
| light sheet stage | `background-color` | 255ms | `--ease` | paint |
| room hero pool, level rising | `opacity` | 600ms | `--ease` | paint, one small box |
| room hero pool, level falling | `opacity` | 900ms | `--ease-slow` | paint |
| room hero pool, colour | `background` | 400ms | `--ease` | paint |

255ms is the app's existing select-and-toggle duration and is what `light.js`'s `MOTION.d` already
uses for a disc, so the tile, the disc and the switch knob all land on the same frame. No new
duration.

The power button is faster than the card on purpose: **150ms for the thing your thumb touched, 255ms
for the surface, 600ms for the room.** That ladder is the hierarchy of the screen expressed in time
rather than in size.

**A light turning off fades over the same 255ms**, with the same ink flip. This app's thesis is that
light behaves like light, and a lamp that goes out over a quarter of a second is what a real lamp
does. It is not longer because the longer the inversion takes, the longer the ink sits in its
unreadable band. The one place the slow decay is right is the room hero, which carries no ink: its
pool fades over 900ms. So the card goes quiet in a quarter of a second and the room's light leaves
over nearly a second behind it, which is the correct order: the fact first, the light after. This is
a **departure from `docs/motion-spec.md` §1**, which gives a light fading out 900ms everywhere; that
number stays on the light field and comes off the card.

**GSAP has no cubic-bezier.** `web/vendor/gsap.min.js` is GSAP core with no CustomEase, so every GSAP
tween in the app approximates the CSS curve with `power2.out`. That mismatch is visible when a CSS
transition and a GSAP tween run on the same object. GSAP core accepts a plain function as an ease, so
give it the real curve: `bezier(x1,y1,x2,y2)` (a Newton solve, ten lines, into `motion.js` above
`pageIn`), `const EASE = bezier(.4,.12,.3,1)`, `const EASE_SLOW = bezier(.3,0,0,1)`, exported as
`window.Motion.E = { ease: EASE, slow: EASE_SLOW }`. Existing tweens keep their `power2.out`; new
ones that have to agree with CSS use `Motion.E.ease`.

### 7.2 The polarity problem, and the ink swap

A lit card is pinned to luminance 0.1529 and carries white ink; an off card is `--surface` white with
`#262626` ink. Turning a light on is a full polarity inversion, and **any cross-fade between two
polarities passes through a band where neither ink is legible.** This is the one real hazard in the
redesign, and it is solved by arithmetic rather than by taste.

Against `#262626` (luminance 0.0193) a card needs luminance at or above **0.2617** for 4.5:1; against
white it needs luminance at or below **0.1833**. The dead band is everything between. CSS interpolates
a hex `background-color` in sRGB, so walking each pinned fill to `#FFFFFF` and reading the luminance
gives the band in progress, and inverting `cubic-bezier(.4,.12,.3,1)` turns that into **time**, which
is what a `transition-delay` takes. The inversion matters: 45% of a 255ms ease-out is already 66% of
the way through the colour, long past the band. In ms of a 255ms cross-fade:

| pinned fill | white ink fails after | dark ink works after | the band |
|---|---|---|---|
| blue `#006DCC` | 34ms | 63ms | 29ms |
| amber | 58ms | 75ms | 16ms |
| green | 62ms | 77ms | 15ms |
| red | 64ms | 79ms | 15ms |
| purple | 70ms | 83ms | 13ms |

No single delay sits inside every band (blue's ends before purple's begins), so solve for the delay
whose **worst** unreadable stretch across all hues is smallest. That is any value from 54ms to 63ms,
all of which give 29ms, and the floor is 29ms because blue's own band is 29ms wide. Take the middle:

> **The fill cross-fades over 255ms and the ink flips once, in 1ms, at 60ms. The worst unreadable
> stretch on any hue is 29ms, under two frames, in the middle of a movement.**

The same rule runs in both directions with no special case. On the 600ms offline fade the plateau is
93ms to 100ms, worst case 33ms, and `--m-ink-swap-slow` takes 95ms from the middle of it.

```css
/* Ink does not cross-fade: it flips. The delay is solved, not chosen. */
.dtile, .rtile { transition: …, color 1ms var(--ease) var(--m-ink-swap); }
.offline .dtile, .offline .rtile {
  transition: background-color 600ms var(--ease-slow), border-color 600ms var(--ease-slow),
              color 1ms var(--ease) var(--m-ink-swap-slow); }
```

`inkswap.js` **comes into the repo beside `tint-check.js`, as `scripts/ink-swap.js`.** These delays
are a *consequence* of `TINT.yOn`: if `yOn` ever goes lighter than 0.1833 the dead band disappears
and the ink can simply cross-fade with the fill; if it goes darker, every number above moves. Rerun
it whenever `yOn` or either curve changes.

### 7.3 The tile press

Three targets inside one tile, inside a scrolling grid. They must feel like three different things.

| target | what happens | duration | property | cost |
|---|---|---|---|---|
| tile body | the **whole card** deepens to `--t-fill-pressed` and scales to `.99` | 150ms | `background-color`, `transform` | paint + compositor |
| power button | the button scales to `.92` and takes `--t-btn-bg-pressed`; the card does not move | 150ms | `transform`, `background-color` | compositor + a 40px paint |
| well | nothing on the card moves. The grip rides to the finger and the value in `.dv` follows it | per frame | `--p`, `textContent` | paint, one tile |

The card dips, the button shrinks, the well just works. **Departure from `design-spec-v4.md` §9**,
which gives a tile only a background and shadow change: `transform: scale(.99)` is added. A 112px
scene tile on white reads a shadow change; a 169px card that is already dark does not, and in a dark
room the shadow is the first thing to disappear. 1% is about 1.7px of travel, it is compositor-only,
and it is the only transform in the grid.

**Keeping the three apart.** `:active` matches ancestors, so a press on the power button would
otherwise dip the whole card. `:has()` separates them, and `light.css` already uses `:has()`, so this
is not a new dependency. The selectors are in §4.10, block B.

**How a press is cancelled when the finger turns out to be a scroll.** The tile body and the power
button use CSS `:active` and nothing else: the browser drops `:active` itself the moment a touch
becomes a scroll, and it suppresses the click that would have followed. A JS `pointerdown` class does
not get that for free and has to reimplement it badly. So the rule for the whole grid is **press
feedback is `:active`, never a class set on pointerdown.**

The well uses `slide.js`, unchanged: `pending` until the finger has moved 8px, `dead` if it moved 8px
vertically and more vertically than horizontally, `active` only on a clear sideways drag, and a tap
with no movement sets the value on `pointerup`. **No fourth gesture arbitrator is introduced.**

The other two arbitrators, and why neither touches the tile:

- `swipe.js` (pull a sheet down) already excludes `input.slider` and `.sliderwrap` through its `NO`
  list, so a drag starting on the well never pulls the room sheet. A vertical drag starting on the
  tile **body** does pull the sheet down when the grid is scrolled to the top, and that is correct:
  it is how every sheet in the app closes.
- `rowswipe.js` claims `[data-lswipe], .item.room, .item.auto[data-auswipe]`. **A device tile must
  not carry `data-lswipe`** and a room tile is not an `.item`, so neither matches. The file stays and
  is not edited: its automation rows still have producers.

### 7.4 During a drag

A transition and a 60fps value stream are incompatible: every input event restarts a 255ms ease, the
card is permanently 255ms behind the thumb, and the well and the card disagree about the number.

> **The rule: a surface that is following a finger has no transition. A surface that is being told
> about a change has one. The finger owns the frame.**

The switch lives in exactly one place, `Motion.trackLevel()` in `web/js/motion.js`, called from the
`input` handler that already exists in `boot.js`. It marks the surfaces that are following and
un-marks them 120ms after the last input event, so the final value from the hub eases in instead of
snapping.

```js
  // ---------- a value is arriving at 60fps: the surfaces that follow it drop their transitions ----------
  const TRACK_OFF = 120;   // ms of quiet after the last input event before transitions come back
  function trackLevel(sliderEl, level) {
    const s = el(sliderEl); if (!s) return;
    const v = Math.max(0, Math.min(100, Number(level) || 0));
    const id = s.dataset && (s.dataset.lvl || (s.dataset.slide || '').replace(/^d:/, ''));
    const host = s.closest('.dtile') || s.closest('.light') || s.closest('#ld');
    if (host && !host.dataset.track) host.dataset.track = '1';
    clearTimeout(s._mTrack);
    s._mTrack = setTimeout(() => { if (host) delete host.dataset.track; }, TRACK_OFF);
    // the room's hero follows the same finger, at its own lag: one property write on one pool
    const pool = id && document.querySelector(`.rh-pool[data-rh="${id}"]`);
    if (pool) { pool.dataset.track = '1'; clearTimeout(pool._mt);
      pool._mt = setTimeout(() => delete pool.dataset.track, TRACK_OFF); paintRoomHeroPool(pool, v); }
  }
```

```css
/* Nothing on a surface that is following a finger transitions: not the fill, not the ink, not the
   well's own custom property. The attribute is set and cleared in Motion.trackLevel and nowhere else. */
[data-track], [data-track] * { transition: none !important; }
/* except the hero's pool, which is allowed to lag by the one follow duration in the vocabulary */
.rh-pool[data-track] { transition: opacity var(--m-track) var(--ease) !important; }
```

Note what is **not** in the input handler: no `paintState()`. `paintState()` walks the document with
six `querySelectorAll` calls; running it 60 times a second while a finger is down is the most
expensive thing the app could do during the one interaction where it has no budget. The dragged tile
paints itself, the hero's one pool tracks itself, and `paintState()` runs on the echo as it does
today.

`slide.js`'s own `data-drag` is not reused as the switch: it is cleared **1500ms after release**
(`finish()`), because its job is to keep the bridge's echo from pulling the slider back. 1500ms of
suppressed transitions means the settle after the finger lifts is a snap. The two flags answer
different questions and both are needed.

**The drag rule, stated as a rule because it is also the design:**

> **A drag moves the surface it is on, and the room's light. It does not move the other tiles.**

While a house-wide or room-wide slider is being dragged, the individual tiles hold their last painted
fill and settle to the new one over 255ms when the finger lifts. The value under the finger and the
hero follow live. Without this, every tile's fill changes 60 times a second: 2.6ms of raster per
frame on a desktop-class rig, so about 13ms on a mid-range phone, on a 16.7ms budget, with the hero
and the well on top. That misses. In code it is the same `[data-track]` rule scoped to the grid
rather than to the tile, and a paint on `change` instead of on `input`.

### 7.5 A change nobody's thumb caused

> **A change you caused gets no extra motion: the press already answered you, and the fill is the
> confirmation. A change you did not cause gets exactly one extra beat.**

That beat is the existing `ring()` in `motion.js`: a 2px ring expanding out of the power button from
0.85 to 1.75 and fading, 550ms `power2.out`. It is compositor-only, it is already written, and it is
drawn on the control that carries the boolean, which is where the eye goes to check.

It is drawn **only** when the change was not local, **never more than twice in one paint pass** (a
scene that lights twelve tiles must not fire twelve rings: the event there is the scene, which
`Motion.sceneRun()` already washes across the affected cards), and **never on a tile that is off
screen** in a scrolling grid.

How the app knows it was you: `levelQuiet(target)` is not enough on its own, because `sendGated`
stamps the quiet window only **after** the command resolves and a plain `command()` toggle never
stamps one. So stamp at the moment of the optimistic write, one line in three places:

```js
  // ---------- which changes were ours ----------
  const MINE = Object.create(null);
  const MINE_MS = 1500;
  function mine(t) {
    const list = typeof targetDevices === 'function' ? targetDevices(t) : [];
    const until = Date.now() + MINE_MS;
    for (const id of (list.length ? list : [String(t).replace(/^d:/, '')])) MINE[id] = until;
  }
  const isMine = id => (MINE[id] || 0) > Date.now() || (typeof levelQuiet === 'function' && levelQuiet(`d:${id}`));
```

Call sites, all in existing optimistic paths: `toggleTarget()` in `home.js` before its
`paintState()`, `sendNow(v)` in `wireLightSheet`, and `colorHost.set` in `light.js`. Everything else
(a Pico, a scene run from the hub, the Hue app, an automation) arrives without a stamp and is
therefore not yours.

`Motion.lightChanged` gains the tile branch, the "was it mine" test, the per-pass budget and the
off-screen guard, and keeps every existing branch so nothing that calls it today changes behaviour.
**The tile branch deliberately does not pop the power button on turn-on**: the entire card has just
inverted, and a button that also jumps on top of that is two answers to one question. The ring is the
whole addition. A level change with no on/off flip (a Pico dimming a lamp that was already on) gets
no beat at all: the fill moves 255ms and the number changes.

The call site is `paintState()`'s `[data-tgt]` sweep in `core.js`, beside the existing `.room` and
`.tile` branches:

```js
    else if (el.classList.contains('dtile')) {
      const was = el.classList.contains('on'); el.classList.toggle('on', on);
      if (was !== on && window.Motion) Motion.lightChanged(el, level(el.dataset.tile) || (on ? 100 : 0), was);
    }
```

### 7.6 Grid entry, the sheet chain, and the two optional pieces

**No stagger on either grid.** A stagger is a promise that the order means something; in a room's
grid the order is the room's device order and on Home it is the room list. A 150ms ripple across
twelve tiles is charming on the first open of the day and is friction on the fiftieth, because it
delays the one tile you were reaching for by up to 180ms for no information.

> **Stagger shows causality, never arrival.** A scene running across rooms is causality. A screen
> appearing is arrival.

This agrees with `docs/motion-spec.md` ("no stagger; the design spec forbids staggered page loads")
and with `Motion.pageIn`, which cross-fades a view in 150ms with no travel.

**The room sheet opening with its tiles.** The sheet's own choreography is unchanged and already
right: scrim 240ms, sheet `translateY` 100% to 0 over 300ms `power3.out`, content in at 80ms. One
change to `sheetIn` in `motion.js`: it currently staggers `sb.children.slice(0, 4)`, which today is
four blocks. Guard it by taking blocks and the grid as one node, so that if the grid is ever
flattened the tiles are not staggered by accident:

```js
    const blocks = sb ? Array.from(sb.children).filter(n => !n.classList.contains('dgrid')).slice(0, 3) : [];
    const grid = sb ? sb.querySelector('.dgrid') : null;
    const content = [sh, ...blocks, grid].filter(Boolean);
```

The grid moves as one 8px block with its neighbours: twelve tiles, one tween.

**Home's grid on first paint.** `Motion.pageIn(v)` on a view change and
`Motion.pageIn(v, { launch: true })` on the first real render are both unchanged. What must **not**
happen is a tile whose tint arrives a frame after the card: every tile's fill is written by
`paintState()` in the same pass as the HTML lands (`render()` sets `innerHTML` and then calls
`paintState()` before the browser paints), so the first painted frame is already correct and there is
nothing to cross-fade. `paintDeviceTiles()` must therefore **seed** a tile it has not seen before and
let `lightChanged` treat the first paint as a seed rather than a flip, which it already does when
`prev` is not a boolean. Do not pass `wasOn` on a first paint.

**The sheet chain, room sheet to light sheet and back.** Three changes to `sheet.morph`:

- **Land the height and the content on the same frame.** Today the height takes 260ms and the content
  is done at 270ms, which is close enough to look accidental rather than intended. Make both 255ms
  exactly, the app's state duration: `.sheet.dt-medium, .sheet.dt-large { transition: transform 300ms
  var(--ease), height 255ms var(--ease); }`, and in `motion.js`'s `swap()` the incoming fade becomes
  `duration: 0.215, delay: 0.04`. The outgoing ghost stays at 80ms: the old screen should be gone
  well before the new one is readable, or the two overlap as a double image. That line also brings
  the sheet's own travel from `.32s` to the 300ms v4 §9 asks for.
- **The tinted stage arrives already tinted, never cross-faded from the room's colour.** Add
  `m-morph` to `#sheet-root` for the length of the swap (40ms, long enough to cover the insert and
  the first paint, short enough that a real colour change arriving 50ms later still cross-fades):
  `#sheet-root.m-morph .lstage, #sheet-root.m-morph .dtile { transition: none !important; }`. Without
  it, the way back from a green desk lamp to the room briefly turns the room's screen green.
- **Shrinking reveals, growing hides.** Large to medium removes about 300px from the bottom while the
  new content fades in at the top, and the sheet's own white fills the gap. Medium to large grows
  into empty space below the new content for 255ms, and the cheap answer is the right one: the room
  sheet's body is a scrolling column laid out from the top, so the empty space is below the fold of a
  scrolling list, which is where empty space is normal. No extra motion.

**The two optional pieces**, both genuinely optional:

- `@property --p { syntax: '<percentage>'; inherits: true; initial-value: 0%; }` plus
  `.dwell .slider { transition: --p 255ms var(--ease); }` makes a level arriving from a Pico or a
  scene slide the well instead of teleporting it. Without `@property` support the value jumps, which
  is exactly today's behaviour, and `[data-track]` already suppresses it during a drag.
- If a real device ever misses on the twelve-tile cross-fade, drop `border-color` from the transition
  and let the edge switch at the ink's 60ms. It is the smallest of the painted properties and the
  least missed.

### 7.7 The budget

Measured on a desktop-class rig with a twelve-tile grid at 390x844 DPR 3, reading paint and raster
out of a devtools trace. Frame pacing is useless in a headless browser, so this measures work, not
frames; read it as a share of a frame on that machine and multiply by four to six for a mid-range
phone.

| what happens | main thread | raster | per frame |
|---|---|---|---|
| nothing | 0.0ms | 0.0ms | 0 |
| 12 tiles, fill set with no transition | 0.7ms | 3.5ms | one off |
| **12 tiles, 255ms cross-fade** | 11.3ms over ~16 frames | 40.7ms over 128 raster tasks | **0.7ms main, 2.5ms raster** |
| **one tile repainted every frame (a drag)** | 20.0ms over 40 frames | 11.3ms | **0.5ms main, 0.3ms raster** |
| 12 tiles repainted every frame | 20.6ms over 40 frames | 102.5ms | 0.5ms main, 2.6ms raster |

Compositor-only: the tile body's press scale, the power button's press scale, the unprompted ring,
the sheet's travel and scrim, `pageIn`, the scene wash and the all-off veil. Paint: the fill, the
edge, the ink flip, the well's fill, the hero's pools. Layout: only the sheet's own box during a
morph.

**The stated worst case: a room sheet, twelve tiles, all lit, during a drag on one of them, on a
mid-range phone.** Per frame while the finger is moving: one tile's fill, value text and well
repainted (about 2.5ms main and 1.5ms raster at 5x), the input handler and `slide.js`'s `apply` inside
that, `sendLevel` gated to one command in flight, one hero pool's opacity, and **nothing at all for
the other eleven tiles**. That holds 60fps with room to spare, and it holds because of three
decisions: `paintState()` does not run on an input event, the hero tracks one pool rather than
re-reading the room, and a drag does not move the other tiles (§7.4).

### 7.8 `prefers-reduced-motion`

The existing rules are load-bearing and stay: `styles.css` forces every `animation-duration` and
`transition-duration` to 1ms, and `motion.css` turns off the named `m-` animations, pauses the timer
line and hides the wash and the veil. The global rule neutralises **every transition in §7.1 for
free**, which is most of this spec.

What it does not neutralise is a `transition-delay`, and that is a real defect this spec would
otherwise introduce: `transition: color 1ms var(--ease) 60ms` with the duration forced to 1ms still
holds the ink for 60ms, so a person who asked for less motion would get 60ms of unreadable text on
every state change. Extend the block:

```css
@media (prefers-reduced-motion: reduce) {
  /* v5: a delayed ink flip inside a 1ms transition is 60ms of unreadable text */
  * { transition-delay: 0s !important; }
  /* v5: a state change must still be perceivable. An unprompted change holds a 2px outline for
     1.2s instead of expanding a ring. It is a step change, not an animation: nothing moves. */
  .m-ring { display: none !important; }
  .dtile.m-said { outline: 2px solid var(--t-line); outline-offset: 2px; }
  /* v5: presses do not scale; the fill change is the whole feedback */
  .dtile:active, .rtile:active, .dtile .dpow:active { transform: none !important; }
}
```

| animation | under reduction |
|---|---|
| tile colour cross-fade | **instant**. The state is still carried three ways: the fill, the words, and the filled or unfilled power button. Nothing was ever carried by colour alone |
| ink flip | instant, delay 0, in the same frame as the fill, so it is never unreadable |
| a light turning off | instant to `--surface` |
| tile body press, power button press | fill change only, no scale |
| well drag | unchanged: a finger moving a value is not motion the app is adding |
| the unprompted change beat | a **static 2px outline held for 1200ms** on the tile, added and removed by `lightChanged` as a class. It is perceivable, it points at the tile that changed, and nothing moves. This is the only new thing reduced motion gets, and it exists because a state change must still be perceivable |
| room hero pools | the `[data-track]`-style transitions are already 1ms: levels and colours are still correct, they simply arrive |
| room sheet opening, the morph, grid entry | `Motion.sheetIn` is a no-op, `morph` already checks `Motion.reduced()`, `pageIn` is a no-op. The sheet and the grid are simply there |
| scene wash, all-off veil | hidden, as today |

### 7.9 What motion refused

A fifth duration. A dedicated "colour changed" animation: a lamp going from amber to green is the
same 255ms as a lamp going from 40% to 60%, and giving hue its own flourish would make a change of
hue feel more important than a change of brightness. A stagger on either grid. A pop on the tile's
power button when the light comes on. Any new gesture. And any motion on the photograph: no Ken
Burns, no parallax, no cross-fade when a room's photo is swapped for the generated hero. It is a
picture of a kitchen.

---

## 8. The honest states

### 8.1 Not connected

`connLost()`. The app shows the last known state and must not dress it up.

- **The house card** headline reads "Last known state" (existing `lightNowHeadline` behaviour). Its
  sub is empty. Unchanged.
- **Every hue is dropped.** Room tiles and device tiles go to `#6D6D6D` at the same pinned luminance
  with the same white ink, the hero stops drawing its pools. **Offline outranks lit.** The card still
  reads unmistakably as on; it simply stops asserting a colour it cannot currently see (§3.4).
- **The words stay.** A room tile still reads "2 of 3 on · 40%" and a light tile still reads "62%",
  because that is the last thing the home actually said and it is the most useful thing we know. The
  page-level caveat carries the doubt, not fifteen tiles each hedging.
- **The advice row** becomes the existing not-connected row, which beats the Next row: "Not
  connected" / "Not connected to your home" / "Showing the last known state. Your remotes keep
  working."
- **Controls still work.** Tapping a power button still sends; it fails and reverts, which is how a
  person finds out the home is back. Nothing is disabled, because a disabled control in an app that
  is often briefly out of touch is more annoying than a failed one.
- **The first ten seconds say nothing at all.** `connState()` is `reconnecting` for
  `RECONNECT_GRACE`; the status dot breathes and the page does not change. Unchanged by this pass,
  and the reason the tint does not drain and return every time the hub blinks.
- **Confidence leaves more slowly than it returns.** Losing it is 600ms `--ease-slow` on every tinted
  surface at once with no stagger, which reads as the screen stepping back rather than as fifteen
  lamps switching off; getting it back is the ordinary 255ms `--ease`, because coming back is a state
  change and should feel like one.

### 8.2 A room with no lights yet

Room sheet: the hero falls back to the 48px room glyph on `--surface-2`. No whole-room toggle (there
is nothing to toggle), no moods row, and the grid is replaced by one full-width row:

```
 ┌──────────────────────────────────────────────┐
 │ Nothing in this room yet                 ›   │
 │ Move a light or a remote in here.            │
 └──────────────────────────────────────────────┘
```

It opens `roomsAddSheet(aid)`, the existing "Move something into Kitchen" picker, so the fix is two
taps from the room. The "Room setup" row is still under it.

On Home, the same room's tile reads "No lights yet" (today's `roomSummary` string), is never tinted,
and its switch is absent, not greyed: there is nothing there to power.

### 8.3 A brand new home, nothing paired

Unchanged. `setupEmpty()` takes the whole page, the connect walk slides over it after 350ms, and Home
draws no house card, no pills, no grid and no New room tile.

### 8.4 A light the bridge stopped reporting

`level(id)` returns **`null`** when the bridge lists a device but has never reported a state for it.
The rule, now that a tile will show it in colour:

- When a snapshot has arrived (`devices().length > 0`) and the device has no state entry at all, the
  tile's value reads **"Not answering"**, the tile takes the **unknown** surface rather than a tint,
  and the power button is drawn unfilled but still works: sending a command is how you find out.
- The light sheet's readout reads "Not answering" in place of "Off" under the same condition, until a
  state arrives or the person moves the control.
- A device that leaves the inventory entirely still disappears, and `pruneRooms()` still refuses to
  prune while the inventory is empty (a restarting connector is not a house with no lights).

`lightRowValue()` already returns "Not answering" on this branch (§11, defect 2); what slice 6 adds
is the matching surface and the light sheet's readout.

### 8.5 The moment a command fails

- The optimistic paint reverts: `toggleTarget` already deletes the optimistic state and repaints, and
  on a tile that revert is a colour cross-fade back.
- The toast carries the friendly sentence, which it already does: `api()` passes everything it throws
  through `friendlyError()` (`core.js:55`), so `command()`'s `toast(e.message)` is already
  "Can't reach your home right now. Is the home connector running?" or "Your home did not respond.
  Try again in a moment."
- **The one gap worth closing:** when the request never left the phone, `fetch` rejects before there
  is a body to read, so no friendly mapping runs. That case toasts **"No connection. Nothing
  changed."**
- One toast per failure, not one per device: a whole-room command that fails is one sentence.

### 8.6 360px, 640px and reduced motion

360: every tile narrows (device 154, room 158), the hero drops to 160, the scene row scrolls at four
and a half cells, and nothing else changes. 640: both grids go to three columns at 560 and up, which
at the content cap is a 192px device tile and a 194.7px room tile, the same components with more air.
Reduced motion is §7.8. All three are slice 6 and all three are asserted by the Playwright suite.

---

## 9. Copy

Every new or changed user-facing string in this pass, ready to paste. No em dashes. The words
"schedule", "binding" and "target" appear in none of it.

**Home**

```
All
New room
No rooms yet
Your rooms appear here as soon as your home is connected.
```

Unchanged and reused as they are: `Rooms`, `Scenes`, `See all`, `Sleep timers`, `No scenes yet`,
`Set the lights the way you like them, then save that look`, `Tap to switch · hold for a timer`,
`Last known state`, `All off`, `Lights back on`, `All on`, `Not connected`,
`Not connected to your home`, `Showing the last known state. Your remotes keep working.`, and every
`roomSummary` string (`No lights yet`, `2 of 3 on`, `3 lights · all off`).

**The room sheet**

```
In this room
Nothing in this room yet
Move a light or a remote in here.
Not answering
```

Unchanged: `Turn the room on or off`, `Lights`, `Give this room moods`,
`Bright, Relax, Dinner, Movie and Night`, `Room setup`, `What each light is for, moods, kinds`,
`Off`, `Low`, `Medium`, `Med-hi`, `High`, `Open`, `Stop`, `Close`, and the value forms `62%`,
`Green · 62%`, `On`, `Closed`.

**The light sheet**

```
More colours
```

Unchanged: `Sleep timer`, `Show first`, `More`, `Follow the day`, and the readout forms `80%`, `Off`,
`On`, `Not answering`.

**The photograph**

```
Add a photo
It shows at the top of the room.
Photo
Adding…
Choose a different photo
Remove the photo
The room goes back to showing its own light.
```

Toasts:

```
Photo added
Photo changed
Photo removed
```

Failures, all of them:

```
That file is not a photo. Pick an image.
That photo is too big. Try one under 25 MB.
The photo did not save.
No connection. The photo was not added.
Try again
```

**Failure elsewhere**

```
No connection. Nothing changed.
```

Reused unchanged: `Can't reach your home right now. Is the home connector running?`,
`Your home did not respond. Try again in a moment.`, `Undo`, `Saved`.

---

## 10. Ship order

Six slices. Each one ships alone and leaves the app better.

**Slice 1 · Tint what already exists.** No new layout. `litSurface()`, `tintApply()`, `tintLevel()`
and `tintOptsFor()` land in `web/js/color.js`; `scripts/tint-check.js` and `npm run tint-check` land
with them. Then the section 3 rule is applied to today's surfaces: the room row's background, the
light row's background, the light sheet's stage. `--blue-10` on a lit room goes away. Change
`tween()`'s ease in `light.js` to `Motion.E.ease` so the disc agrees with the CSS arriving beside it.
**This is the slice the owner notices first**, because it is the thing he asked for in his own words,
and it is a day of CSS plus one fill function.

**Slice 2 · The device tile and the room sheet's grid.** `deviceTileHTML()` and
`paintDeviceTiles()`; `roomSheetBodyHTML` swaps `ds.map(lightRow)` for the grid; the spanning fan and
shade tiles come with it. The motion layer arrives here too: the `--m-*` tokens, the transition and
press blocks, `[data-track]`, `Motion.trackLevel`, `Motion.mine` / `isMine`, the new
`lightChanged`, and the `.dtile` branch in `paintState`. `lightRow` can stay in the file until
nothing calls it. The room sheet is where the grid is least risky and most useful.

**Slice 3 · Home: the room grid, the scope pills, the scene cells.** `roomTileHTML()` and
`paintRoomTiles()`; `scopePillsHTML()` and `S.homeScope`; the New room tile; the scene cells;
`VIEWS.home.body()` reorders to §5.1 and wraps the grid in its scope. Home's `.gh` captions and its
house card are untouched. **This is the slice that changes how the app feels.**

**Slice 4 · The room hero**, generated by default, with the optional photograph and the "Add a photo"
row in Room setup. `.rhero`, `rhPlace()`, `paintRoomHero()`, then the photo row, the hidden input, the
canvas downscale, the `PUT`, the photo sheet, and `roomsDelete()` calling `DELETE`. The hub half is
already shipped (§6.1).

**Slice 5 · The light sheet revision:** the stage, the `.display` readout, the horizontal well, the
swatch row with "More colours". `.vslider`, `.vsteps` and `ld-step` come out in the same commit that
puts the well in, not before. The sheet-chain motion changes (the 255ms height, the 215ms incoming
fade, the `m-morph` guard) land here.

**Slice 6 · The honest states:** the unknown surface wired to `connLost()` and to a null level, the
light sheet's "Not answering" readout, the network-failure toast, the empty room, 360px, reduced
motion, the night page, and `npm run tint-check` wired into whatever runs before a commit.

Nothing in slices 1 to 5 waits on slice 6, and the night look in slice 6 does not change a lit card.

---

## 11. Found on the way

Three real defects turned up while designing against the shipped code. Two are already fixed on this
branch and the third has been removed.

1. **The long-press had no `pointercancel` and no movement threshold.** `boot.js`'s handler (a lit
   lamp held for 550ms opens the sleep timer) listened for `pointerdown` and `pointerup` only. On a
   list of rows that was survivable; in a scrolling grid of twelve lit tiles, a finger that lands on
   a tile and flicks the grid would fire the timer sheet 550ms later, mid-scroll. **Fixed:** the
   handler now drops the timer on `pointercancel` and on a move of more than 10px
   (`web/js/boot.js:190`).
2. **`lightRowValue()` said "Off" for a light with no reported level.** `level(id)` returns `null`
   when the bridge lists a device it has never reported a state for, and the row did
   `const lv = level(id) || 0` and printed "Off": the app inventing a reading it did not have, on
   exactly the value a person acts on without looking twice. **Fixed:** it returns **"Not
   answering"** (`web/js/home.js:97`). §8.4 carries the matching surface.
3. **`comingUpHTML()` was dead code.** Nothing in the app rendered `#comingup`; the `ia-v5` pass had
   moved that list to the Automations tab's "Next: …" caption, and the function survived as markup
   anyone reading the file for a row would copy forward. **Deleted** from `web/js/automations.js`.

A fourth report did not survive checking and is recorded so it is not raised again: `command()` does
not toast raw error text. `api()` already passes everything it throws through `friendlyError()`
(`core.js:55`), so `command()`'s toast is already the friendly sentence. The one genuine gap is a
request that never leaves the phone, where `fetch` rejects before there is a body to map; §8.5 gives
that case its own string.

---

## 12. Where the team disagreed

Every place two deliverables said different things, what was ruled, and why. These are settled.

| # | the disagreement | ruled | why |
|---|---|---|---|
| 1 | **Room hero height.** 140px (`02-ux`, sheet arithmetic) against 180px (`01-ui`, measured; `00-direction`, for what was then a page) | **180px**, 160 under 380px wide | Re-measured: the sheet body is 694.5px, and at 180 the moods row still ends about 300px above the fold. `02-ux`'s arithmetic assumed a 156px device tile where the measured tile is 174, so the 40px buys more of the second grid row's peek and nothing it claimed |
| 2 | **The `On` scope pill.** `00-direction`: `All` plus one pill per room. `02-ux` adds `On` between them | **No `On` pill** | The director's file is the binding one and was updated without taking the departure. On its merits `On` is the one pill whose membership changes without the person touching it: the row would reflow under the thumb, and a selected `On` could empty itself while selected. The grid already answers "what is lit" by being tinted |
| 3 | **When the pill row appears.** 3 rooms (`01-ui`) against 4 (`02-ux`) | **4 or more rooms** | `02-ux` shows the arithmetic: at four rooms the grid is three rows and starts to run past the fold, which is when a filter earns its 52px. `01-ui`'s 3 is asserted without it |
| 4 | **Tint token names.** `--tile-fill` / `--tile-ink` / `--tile-ctl` (`01-ui`, placeholders) against `--t-fill` / `--t-ink` / … (`03-colour`, real) | **`--t-*` for painted colour, `--tile-*` for static geometry** (§2.1) | `tintApply` is the single writer and its object keys map to the properties mechanically. The split by *who writes the token* is the one rule an implementer can apply without a lookup |
| 5 | **The tile's control colour.** `01-ui` flagged that at `--tile-ctl: var(--blue)` the well's fill is the heaviest thing on a lit tile | **The concern does not arise**: `wellFill` is `#FFFFFF` on a darkened own-hue track and the power button is white with the card's own fill as its glyph | The engineer's real values never put blue on a lit card. `--tile-ctl` also conflated two surfaces, so it becomes `--t-well-fill` and `--t-btn-bg` |
| 6 | **The tile's class names.** `.dt-face` / `.dt-n` / `.dt-v` / `.dt-pw` (`04-motion`) against `.dbody` / `.dn` / `.lv.dv` / `.dpow` (`01-ui`) | **`01-ui`'s names**, with the motion CSS renamed onto them | `04-motion` pre-authorised it ("rename the selectors and change nothing else"), and `01-ui`'s names keep `.light` and `.lv`, which is what makes `boot.js`'s slider handler work with no new JS |
| 7 | **The press surface.** `.dbody:active` takes `--tile-press` (`01-ui`) against the whole face deepening (`04-motion`) | **The whole card deepens to `--t-fill-pressed` and scales to `.99`** | The validator measures white ink on `fillPressed` over 457 surfaces, which only means anything if the whole card is that colour. `:has()` keeps the two controls inside from dipping it |
| 8 | **The room hero's implementation.** Plain CSS radial gradients (`01-ui`, `02-ux`) against adopting `lightfield.js` into the hero box with a scope reset (`04-motion`) | **Plain CSS radial gradients.** `lightfield.js` stays bound to Home and is not edited | Two of three deliverables, and it needs no module options, no canvas adoption across a sheet morph and no second context. `04-motion`'s `trackPool`, `dprCap`, `fpsCap` and `sizeByLevel` are not needed; its timings survive as the pool's transitions |
| 9 | **Fans and shades.** A compact speed sheet and shade sheet behind the tile body (`01-ui`) against tiles that span both columns with their controls inline (`02-ux`) | **Spanning tiles, last in the grid** | The ledger is a contract: a sheet takes fan speeds from two taps to three (rows 13 and 14), and Stop has no home on a two-state corner button. The one idea survives because hierarchy is carried by colour and fill, not area: a spanning fan tile is still a white card |
| 10 | **The room tile's second control.** The `.sw` switch (`01-ui`) against a 40px round power button (`02-ux`) | **The `.sw` switch** (44x24, not the 51x31 `02-ux` quotes) | It is the only channel that separates "this stands for several lights" from "this is one device", and `paintState()`'s `[data-tgt]` branch already paints it. Taps are 1 either way |
| 11 | **The room tile's height.** 150 (`01-ui`, arithmetic shown) against 132 (`02-ux`, "planning size") | **150, box 152** | `01-ui` owns geometry and shows the arithmetic |
| 12 | **Three columns at.** 560px (`01-ui`) against 520px (`02-ux`) | **560px** | `01-ui` owns geometry; at 520 the tiles are wider than the component was measured at |
| 13 | **The scene cell's width.** 62px (`01-ui`) against 72px (`02-ux`) | **62px** | 5 x 62 + 4 x 8 = 342 of 358, which puts a sliver of the sixth cell in the gutter as the scroll affordance. 72 does not fit five |
| 14 | **The scene disc.** One disc (`01-ui`) against the `lampHTML` cluster (`00-direction`, in a parenthetical) | **One disc** | At 56px a four-disc cluster is 22px per lamp, under the legibility floor, and the chip it replaces already shows one disc. The cluster stays on the Scenes page's 112px faces |
| 15 | **The lit selector.** `.tile.lit` (`03-colour`'s CSS sample) against a new class (`04-motion`) | **`.dtile.lit`, `.rtile.lit`, `.lstage.lit`. `.tile` stays the scene tile** | `.tile` already carries `:active`, `.running` and `.editing` rules, and `paintTiles()` rewrites `.tile[data-tgt] .face` wholesale, which a cross-fade cannot survive |
| 16 | **Night.** Two constants, `yOn` and `yOnNight` (`03-colour`) against "lit cards need no night variant" (`00-direction`) | **One constant.** The transform keeps `yOnNight` and the validator keeps proving it, but **no call site passes `night` in slices 1 to 5** and the night look does not change a lit card | The arbitration is explicit, and the engineer offered the deletion himself. A lit card at 0.1529 with white ink is night-proof by construction, and slice 6 must not block slices 1 to 5 |
| 17 | **The photograph's wire format.** `POST` of raw `image/jpeg` bytes, registered before `express.json`, an integer stamp (`02-ux`) against what is deployed | **The shipped shape** (§6.1): `PUT`, a JSON data URI, its own 1mb parser, a 400kb cap on the decoded bytes, a digit-string stamp, `?token=` and `?v=` on the GET | It is built and running. `02-ux`'s copy and flow are kept verbatim; only the wire format is corrected |
| 18 | **Text over the room photograph.** An opaque `--t-fill` band under the title (`03-colour`) against nothing over the photograph at all (`00-direction`, `01-ui`, `02-ux`) | **Nothing is ever drawn over the hero** | The engineer's ruling that a scrim cannot reach 4.5:1 stands and is the reason. With no text over the photograph the band is not needed either, and the room's name is already in the sheet header above it |
| 19 | **The room hero's place.** The room *page* (`00-direction` §4) against the room *sheet* | **The room sheet**, at the top of its body | A room opens in a bottom sheet over Home; room setup is the only page. The director's file predates that correction and says so itself |
| 20 | **`--m-track`'s second use.** The hero's WebGL pool following a finger (`04-motion`) | **The hero's CSS pool following a finger**: `.rh-pool[data-track] { transition: opacity var(--m-track) … }` | Follows from ruling 8. The token keeps both of its uses and no third one |

---

## 13. What changes in code

Every file, and what happens to it. Ordered by slice.

**`web/js/color.js`** · slice 1. Gains, at the end of the file: `srgbToLin` / `linToSrgb` /
`hexToLin` / `linToHex` / `linToOklab` / `oklabToLin` / `hexToOklch` / `oklchToLin` / `lum` /
`contrast`, then `TINT`, `TINT_BANDS`, `inGamut`, `solveL`, `solveC`, `pinLuma`, `tintSeed`,
`TINT_MEMO`, `litSurface`, `buildLitSurface`, `roomTintSeed`, `ROOM_COHERENCE_MIN`, and the three
helpers `tintApply`, `tintLevel`, `tintOptsFor`. Nothing else in the file changes; `lightFill`,
`colorState`, `kelvinHex` and `lampFill` keep their jobs and are what seed the transform.

**`scripts/tint-check.js`** · slice 1, new. `v5/tint_check.js` brought into the repo verbatim, wired
as `npm run tint-check`. It is the regression test for every number in §3 and must exit 0 before a
commit that touches `color.js`.

**`scripts/ink-swap.js`** · slice 2, new. `v5/inkswap.js` brought in beside it. Rerun it if
`TINT.yOn` or either curve changes; it prints the two delay tokens in §2.4.

**`web/styles.css`** · slices 1 to 3. Gains sections A to E of §4.10: the `--t-*` and geometry tokens
in `:root`, `.dgrid` / `.dtile` and its states, `.rgrid` / `.rtile` / `.rtile.new`, `.scopes`,
`.scells` / `.scell`, `.rhero` / `.rh-pool` / `.rh-img`, and the three media queries. The `.room.on`
`--blue-10` rule and the night `.room.on` override are deleted (R1). `.slider` itself is **not**
touched: a tinted well is three variable overrides.

**`web/light.css`** · slice 5. Gains section F: `.lstage`, `#ld .display`, `#ld .ld-well`, the 20px
swatch-row bleed. Loses `.vslider`, `.vslider::before`, `.vslider::after`, `.vsteps` and `.ld-swcol`.
`.ld-level` goes with the readout it drew. `.lring` is unchanged and keeps both capability rings.

**`web/motion.css`** · slice 2, with slice 6 additions. Gains `--m-track`, `--m-ink-swap` and
`--m-ink-swap-slow` in `:root`; the `[data-track]` rule and the `.rh-pool[data-track]` exception; the
`#sheet-root.m-morph` guard; and the `prefers-reduced-motion` additions in §7.8 (`transition-delay:
0s`, `.m-ring` off, `.dtile.m-said`, no press scale).

**`web/js/light.js`** · slices 2, 4 and 5. Gains `deviceTileHTML(d)`, `paintDeviceTiles()` and
`paintRoomHero()`, all called from `paintLight()`. `openLightSheet()` is rewritten to §4.9: the
`.lstage` with `data-tile`, the `.display` readout carrying `.lv`, the horizontal well, the swatch
row with the "More colours" chip. `colourRowHTML` retires into the swatch row; the colour pane it
opened is unchanged. `wireLightSheet()` keeps the disc's vertical drag and loses the `ld-step` act.
`tween()`'s ease becomes `Motion.E.ease`.

**`web/js/home.js`** · slices 2, 3 and 6. `roomRow()` becomes `roomTileHTML()` plus
`paintRoomTiles()`; `lightRow()` becomes the tile (keeping `data-act="light-open"`, `data-lvl`,
`data-ldisc`, `data-lrowval` and `data-slide`, and dropping `data-lswipe`); `sceneRowHTML()`'s chips
become `.scells`; new `scopePillsHTML()` and `S.homeScope`; the New room tile; `VIEWS.home.body()`
reorders to §5.1. `toggleTarget()` gains one line, `Motion.mine(t)`, before its `paintState()`.
`lightRowValue()` is already correct (§11).

**`web/js/room.js`** · slices 2 and 4. `roomSheetBodyHTML()` gains the hero and swaps
`ds.map(lightRow)` for the grid in the order of §5.3; new `roomHeroHTML(aid)`. `roomSetupHTML()`
gains the photo row at the top of its `THIS ROOM` card, the hidden `<input type="file">`, the canvas
downscale, the `PUT`, and the photo sheet.

**`web/js/rooms.js`** · slice 4. `roomsDelete()` also calls `DELETE /api/roomphoto/<id>`.

**`web/js/core.js`** · slices 2 and 6. `paintState()`'s `[data-tgt]` sweep gains the `.dtile` branch
(§7.5). `command()` gains the network-failure string when `fetch` rejects before there is a body
(§8.5). The sheet's detent CSS timing moves to 255ms in `styles.css`, and `sheet.morph`'s `run()`
adds and removes `m-morph`.

**`web/js/motion.js`** · slice 2, with slice 5 additions. Gains `bezier` / `EASE` / `EASE_SLOW` and
`Motion.E`; `MINE` / `mine` / `isMine`; `trackLevel`; `inView`; the rewritten `lightChanged` with the
tile branch, the ring budget, the off-screen guard and the reduced-motion `m-said` path. `sheetIn`'s
block list takes the grid as one node. `swap()`'s incoming fade becomes 215ms after 40ms.

**`web/js/boot.js`** · slice 2. The `input` handler calls `Motion.trackLevel(el, v)` and paints the
one dragged tile; it must **not** call `paintState()`. The long-press fix is already in
(`boot.js:190`).

**`web/js/rowswipe.js`** · not edited. Its `[data-lswipe]` and `.item.room` branches simply stop
matching, because a tile is not an `.item`; its `.item.auto[data-auswipe]` branch still has
producers.

**`web/js/lightfield.js`** · not edited. It stays the singleton behind Home's hero.

**`web/js/automations.js`** · already done: `comingUpHTML()` deleted (§11).

**`hub/server.js`, `hub/store.js`, `hub/validate.js`** · already done and shipped: the three
`/api/roomphoto` routes with their own 1mb parser and 400kb cap, `readPhoto` / `writePhoto` /
`removePhoto` under `DATA_DIR/photos`, and `settings.rooms[].photo` as a digit-string stamp. §6.1 is
the contract; nothing on the hub changes in this pass.

**`web/sw.js`** · bump `VERSION` at the end of each slice that changes a cached file.

**The Playwright suite.** Kept, so no edit: `.room`, `.light`, `.slider`, `.sw`, `[data-ldisc]`,
`[data-act="room-open"]`, `[data-act="light-open"]`, `[data-act="toggle"]`, `[data-act="run-scene"]`,
`#sheet-root.in`. Broken, and worth it: any assertion of the shape `.item.room`,
`.list > .item.light` or `.scenerow .chip`, because the element is no longer an `.item` in a list.
The classes those selectors care about are all still on the new elements, so in most suites the fix
is deleting `.item` from the selector. `polish_test.js` and `fav_test.js` read `.room .light` and
`.item.room .sw`; `slide_test.js` and `hscroll_test.js` point at the room sheet's chip rows and now
also at the device tile's well. Anything asserting a swipe tray on a light row or a room row is
testing something that has moved to a visible button, and the assertion moves with it. Slice 6 adds
`npm run tint-check` to whatever runs before a commit. The suite must still print `errors: none`.

---

## 14. What building slices 2 and 3 settled

Written after the build, from what the code and the browser said rather than from what this document
predicted. Where a section above is now wrong, this one wins.

### 14.1 Contradictions between sections, resolved

| where | the disagreement | ruled |
|---|---|---|
| §1.5 vs §4.4 | §1.5 says a lit card carries no blue; §4.4 keeps the room tile's 44x24 `.sw`, whose track is `--blue`. §2.1 has no token for a switch track, which is the gap that let the two pass each other | The switch inverts on a lit card, the way the device tile's power button does: track `--t-well`, on `--t-btn-bg` with `--t-btn-ink` as the knob. Both are pairs the validator already proves. Measured 5.19 to 5.20:1 on every lit room |
| §5.1 table vs §4.6 prose | the table numbers the scope row above the `ROOMS` header; the prose says it "sits with that block and under its header" | The prose. Above the header, the row reads as a filter on Scenes |
| §3.5 | `roomTintSeed` takes "lights" without saying which devices count | Lights and switches only, the two kinds the device tile tints. A fan is not emitting light, and its `ctl` blue dragged a warm room towards the house colour. A fan-only room that is on is therefore a white card with its switch on, which is honest |
| §4.3 | "five `flex: 1` chips, 52px each" | Does not survive its own labels at 360px, where "Med-hi" needs 54. The chips size to their labels (`flex: 1 1 auto`, `nowrap`, 8px padding) and all five fit at both widths |
| §4.6 | centring the selected pill with `scrollIntoView({inline: 'center'})` | Sets the pill row's own `scrollLeft`. `scrollIntoView` centres the pill by moving whatever scrolls, and the nearest scroller that can satisfy it is the page, so a 14-room Home was thrown off the top on every render |

### 14.2 The disc of a device that emits no light

§4.3 says "the disc" without saying what colour, and the tile inherited `lightFill()` from the row it
replaced, so a running fan wore the lamp ramp's full orange in the corner of a card that §1.5 forbids
warmth on. That is the same contradiction one level down: warmth that no light is making.

One rule now, `discFill(d, lv)` in `light.js`, read by the markup and by `paintLightDiscs` so the two
cannot drift: a light or a switch takes `lightFill()`, anything else takes the ordinary on state
(`--blue-20` when on, `--lamp-off` when not). The token is resolved to a real colour rather than left
as a `var()`, because the disc is cross-faded by GSAP and GSAP cannot interpolate a custom property.

### 14.3 The validator now covers the room rule

`roomTintSeed` and `ROOM_COHERENCE_MIN` were listed under slice 1 but were not shipped with it, and a
room tile cannot be painted without them. They are in `web/js/color.js` verbatim, and the drift check
at the end of `scripts/tint-check.js` covers **13** units rather than 11, so the room's colour is
guarded the same way a device's is. Proved by moving `ROOM_COHERENCE_MIN` in the app's copy and
watching the check fail.

### 14.4 Still open

- `roomSummary()` says "1 light · all off" for a room holding only a fan, and counts a running fan in
  "2 of 2 on". It was always wrong; the room tile's sub line is a much more prominent place for it.
- §7.6's `m-morph` guard has its CSS but not its JS half, which is a `core.js` sheet change. Nothing
  needs it until the light sheet is tinted in slice 5.
- The rig's suite consumes its own fixture: `remove_test.js` takes the Bedside Lamp off the fake
  bridge, so a second run in a row fails until `fake_agent2.js` is restarted. `nanoleaf_test.js` and
  `daylight_test.js` are not ported by `mkport.sh` and need `PORT` set.
