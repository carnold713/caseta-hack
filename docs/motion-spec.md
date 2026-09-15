# Pico Hack: motion specification

The visual system in `docs/design-spec.md` is print-like: white paper, flat colour blocks, black and grey, no light effects in the static design. This document adds the one thing paper cannot do on its own: it describes how the page *moves*, and it gives the app a single place where light is allowed to behave like light. Everything here is implemented in three files and wired by the app through explicit hook calls; nothing observes the DOM.

| file | what it is |
|---|---|
| `web/motion.css` | the pure-CSS moments, every selector prefixed `m-`, loaded after `styles.css` |
| `web/js/motion.js` | classic script, `window.Motion`, GSAP behaviours; every hook is a no-op without GSAP or under reduced motion and never throws into the app |
| `web/js/lightfield.js` | ES module, `initLightField` / `updateLightField` (also `window.LightField`), the three.js light band at the top of Home |

---

## 1. Principles

1. **Light behaves like light.** It blooms (fast start, soft landing: `power2.out`, 600 ms), it fades (a lingering decay: `power2.inOut`, 900 ms), and it never snaps. When the number changes on a slider, the light has already begun to follow the finger. Warm light on white paper is a tint, not a glow: the paper turns cream where the light falls, deeper amber where light piles up, and nothing on the page ever gets darker to fake brightness.
2. **Motion carries meaning.** Every animated moment answers a question the person just asked: did that press register, which rooms did the scene touch, is the timer still running, has the house gone quiet. There is no decoration that moves for its own sake; the one exception, the slow drift of the light band, is there so a live house does not look like a printout.
3. **60 fps on a mid phone.** Only `transform` and `opacity` are tweened on DOM elements. The light band is a single quad with one fragment shader (about 280k fragments at DPR 2, sixteen `exp()` each), rendered at 60 fps only while a value is easing and at 30 fps while it merely drifts. Blend modes are used by exactly two short-lived elements (the scene wash and the all-off band) and they are removed the moment they finish.
4. **Honour `prefers-reduced-motion`.** Every hook checks it at call time. Under reduction: sheets and pages still change state but without travel, presses do not scale, no washes, no veil, the light band renders once per state change and does not drift, the timer line shows its position but does not move.
5. **Battery.** The light band stops rendering when `document.hidden`, when its container scrolls off screen, and when the container leaves the DOM (Home re-renders, another tab). It keeps one WebGL context for the life of the page and adopts each new Home container rather than creating another. Device pixel ratio is capped at 2 and the content is soft enough that 1 would do.
6. **The easing family.** CSS: `cubic-bezier(.2,.8,.2,1)` (token `--m-ease`). GSAP: `power2.out` for arrivals, `power2.in` for departures, `power2.inOut` / `power3.out` for the sheet. No bounce, no elastic, no overshoot on layout.

---

## 2. Catalogue

Durations in milliseconds. "CSS" means `motion.css` (or the existing `styles.css` transition), "GSAP" means `motion.js`, "three" means `lightfield.js`.

| moment | what moves | duration, easing | engine | hook |
|---|---|---|---|---|
| **App launch** | top bar children drop in 6 px with a fade; the view rises 16 px with a fade; every pool of the light band blooms from nothing, left to right, 80 ms apart | 400 / 420 `power2.out`; pools 900 `power2.out` | GSAP + three | `Motion.pageIn(view, {launch:true})` once, on the first real render; `LightField.init` blooms on its own |
| **View change** | the new view rises 10 px and fades in; no stagger (the design spec forbids staggered page loads) | 260 `power2.out` | GSAP | `Motion.pageIn(view)` after `render()` when `S.view` changed. It ignores calls closer than 250 ms so a burst of renders does not flicker |
| **Room card expand** | body height via `grid-template-rows 0fr → 1fr` and the chevron rotates 90° (existing); the light rows inside settle in, 6 px, 30 ms apart | 260 `--ease`; rows 240 `power2.out` | CSS + GSAP | `Motion.expand(roomEl, open)` from `toggleRoom` |
| **Slider drag** | the light responds continuously: the room's pool in the band follows the finger (180 ms re-targets), a warm halo behind the row's action button has opacity = level, and the tooltip pill (existing) shows the number | 140 `power1.out` per input event; halo fades 600 after the finger lifts | GSAP + three | `Motion.sliderFeedback(sliderEl, level)` from the `input` handler |
| **Toggle** | knob 20 px and track colour (existing); when a light turns on: the action button pops from .88, a warm ring (`#FFB547`, 2 px) expands from it to 1.75× and fades; the room card's on-chip pops in from .4; the room's pool blooms | 200 `--ease`; pop 420 `power2.out`; ring 550 `power2.out`; pool 600 / 900 | CSS + GSAP + three | `Motion.lightChanged(rowEl, level, wasOn)` from `paintState`; `LightField.update()` from `paintState` |
| **Scene run** | the chip's icon circle turns black for 1 s (existing); a band of warm light crosses every affected room card left to right, under the card's controls, 80 ms apart top to bottom; the matching pools in the light band flare +0.55 and settle back, 90 ms apart | wash 900 `power1.inOut` (opacity in 250, out 350); flare 260 up `power2.out`, 850 down `power2.inOut` | GSAP + three | `Motion.sceneRun(roomEls)` from the `run-scene` action |
| **Sleep timer countdown** | a 3 px black line along the bottom of the timer block drains linearly for what is left; the clock icon breathes | `--m-total` linear, offset by `--m-elapsed`; breathe 2600 ease-in-out | CSS | add `m-timer` and the two custom properties to `.timerbar`, plus `<div class="m-timer-line">` |
| **Pico press on the illustration** | the whole key sinks to .93 and springs back; a radial warm flash (`#FFD9A0`) blooms behind the glyph from .35× to 1.1× of the key and fades; the key face turns orange for 1.2 s (existing `.live`) | key 360 `power2.out`; flash 550 `power2.out` | GSAP | `Motion.press(keyEl)` from `paintLive` when a key goes live, and from the `button-open` click |
| **Gesture detected** | the gesture row flashes `--orange-tint` and fades back; its icon circle pops from 1.12 | 900 `power2.out`; icon 500 | GSAP (CSS fallback `.m-pulse`) | `Motion.pulse(rowEl)` from `pulseGesture` and the settings tester |
| **Sheet open** | scrim 0 → 1; sheet `translateY 100% → 0`; then the header and the first twelve body children rise 12 px and fade in, 25 ms apart, starting at 100 ms | 240 `power1.out`; 360 `power3.out`; 280 `power2.out` | GSAP (CSS transitions in `styles.css` when GSAP is absent) | `Motion.sheetIn(root)` in the same frame `.in` is added |
| **Sheet close** | sheet `translateY 0 → 100%`; scrim 1 → 0 starting 20 ms later | 240 `power2.in`; 220 `power1.in` | GSAP | `await Motion.sheetOut(root)` then remove `.open` |
| **Toast** | opacity and a 12 px rise (existing) | 160 / 200 `--ease` | CSS | none |
| **Connection dot** | on reconnect: one green ring ripples out 10 px and fades; while disconnected: the red dot breathes | 900 once; 2200 loop | CSS | toggle `m-dot-hello` / `m-dot-lost` on `.pill .dot` when `S.agent.online` flips |
| **All off, hold** | the black 3 px progress line grows along the bottom edge (existing); the button fills with `--orange-tint` behind it at the same rate | 1000 linear | CSS | add `m-hold` to `.alloff` |
| **All off, completion** | the whole page's light drains out: a 60 vh band of warm light (`multiply`, so black stays black and white turns cream) starts a quarter of the way into the viewport and falls past the bottom edge; every pool in the light band sinks 34 px and fades to nothing | band 800 `power1.in`; pools 750 `power2.in` | GSAP + three | `Motion.allOff()` from the hold timeout, before the optimistic `paintState` |
| **Press (any button, chip, card)** | scale .94 → 1 | 340 `power2.out`; CSS keyframe `.m-press` when GSAP is absent | GSAP | `Motion.press(el)`; the existing `:active` scale in `styles.css` stays as the immediate touch response |
| **Light band, idle** | each pool drifts on a slow Lissajous path (±3.5% of width, ±7 px), breathes ±6% in size, and wanders ±2.5% in intensity | periods 7 to 14 s | three | nothing; stops under reduced motion |

### What is deliberately not animated

Tab switch inside a page and the underline tabs (the design spec says instant). Room card colour. Text. The bottom bar. Loading is still the plain "Loading…" line.

---

## 3. The light field

A full-width band at the top of Home, behind the status line and the scene chips, as tall as its wrapper (about 180 px). One soft pool of warm light per room, intensity following the average level of the room's lights.

**Why it works on white.** Additive light cannot brighten white. What a warm lamp does to white paper is tint it, so the band is drawn as a tint: the fragment shader sums a Gaussian per pool into an energy `E`, maps it to a tint strength `t = 1 - exp(-2.1 E)` and writes premultiplied `(colour × t, t)` into a transparent canvas. Composited over the page that is exactly `white → colour` by `t`, the same result as `multiply`, without a blend mode. The colour is `#FFD9A0` warm white mixed 35% with the room's soft colour (the room fill lifted 55% toward white first, so a cool Steel or a deep Meadow never muddies the warmth), and it deepens toward `#FFB547` where pools overlap. A vertical mask fades the band to nothing at its bottom edge and softly at the top so the canvas never shows a cut. A 1/255 dither on the premultiplied output keeps the tail from banding.

**Layout.** Pools are spaced evenly across the width (or at a room's `x` hint), high in the band (30% and 42% of its height, alternating) so the light spills up behind the status line and the chips float on it. Sigma is 0.72 of the spacing, clamped to 54 to 170 px, and pools are wider than they are tall (0.7). A single room gets one large pool at the centre. Layout changes (a room added or removed) ease over 700 ms.

**Timing.** Level up: 600 ms `power2.out`. Level down: 900 ms `power2.inOut`. Launch: 900 ms with an 80 ms stagger. Wash: +0.55 for 260 ms then back over 850 ms. Drain: 750 ms `power2.in`, sinking 34 px. Without GSAP the pools approach their targets exponentially (τ 170 ms up, 280 ms down).

**Budget.** three.js is imported lazily on first init, relative to the module (`../vendor/three.module.js`, which pulls `three.core.js`), so nothing is parsed until Home renders and a device without WebGL 2 never downloads it. One `WebGLRenderer` for the life of the page, `alpha: true`, `powerPreference: 'low-power'`, no depth or stencil, DPR capped at 2. 60 fps while tweening, 30 fps while drifting, 0 when hidden, off screen, detached or reduced motion (then one render per state change).

**Fallback.** No WebGL 2, or three failing to load, gives a CSS version: one absolutely positioned `radial-gradient` div per pool with `mix-blend-mode: multiply`, opacity eased by CSS transitions (600 / 900 ms), a keyframe drift, and a mask image for the vertical fade. Same API, same numbers.

**API.** `initLightField(container, getRooms)` returns a promise of the mode (`'gl'` or `'css'`). Call it on every Home render with the fresh container; the module moves its canvas across and keeps the pools' current light. `getRooms(overrides)` returns `[{ id, color, level, x? }]`; `id` must equal the room card's `data-room` so `sceneRun` can match cards to pools, and applying `overrides[device_id]` when averaging makes slider previews live. `updateLightField()` after any state paint. Extras: `washLightField(ids)`, `drainLightField()`, `previewLightField(deviceId, level)`, `destroyLightField()`. All of these are also on `window.LightField` as `init`, `update`, `wash`, `drain`, `preview`, `destroy`, `state`.

---

## 4. Wiring

Load order in `index.html`: `styles.css` then `motion.css`; `/vendor/gsap.min.js` before `motion.js`, both before the app scripts; `lightfield.js` as `<script type="module">` (modules are deferred, so `gsap` is already global when it runs).

```html
<link rel="stylesheet" href="/motion.css">
<script src="/vendor/gsap.min.js"></script>
<script src="/js/motion.js"></script>
… app scripts …
<script type="module" src="/js/lightfield.js"></script>
```

Home markup, in `VIEWS.home.body()`:

```html
<div class="m-hero">
  <div class="m-lightfield" id="lightfield"></div>
  …status line, scene chips, All off (with class m-hold)…
</div>
```

The wrapper is `position: relative; isolation: isolate` and full-bleed; the field is `position: absolute; inset: 0; z-index: -1`. It has to be `-1` inside an isolated wrapper because `html` and `body` both carry a white background, so a negative layer at the root would be painted over by the body.

Hook calls, in the order they appear in the app:

- `core.js render()`: after `v.innerHTML = view.body()` and `paintState()`, on Home call `LightField.init(document.getElementById('lightfield'), roomsForLight)` where `roomsForLight(overrides = {})` maps `areas()` to `{ id: a.id, color: roomColor(a.id).bg, level: average over controllable lights of (overrides[id] ?? level(id) ?? 0) }`. When `S.view` changed since the last render, `Motion.pageIn(v)`; on the first render with `S.ready`, `Motion.pageIn(v, { launch: true })`.
- `core.js paintState()`: for each `[data-act-lvl]` button, read `wasOn = el.classList.contains('on')` before toggling, then `Motion.lightChanged(el.closest('.light') || el, level(id), wasOn)`; for each `.room[data-tgt]`, the same with `targetOn(t)` before and after. At the end, `if (window.LightField) LightField.update()`.
- `core.js sheet.open()`: `requestAnimationFrame(() => { root.classList.add('in'); Motion.sheetIn(root); })`.
- `core.js sheet.close()`: `root.classList.remove('in'); Promise.resolve(Motion.sheetOut(root)).then(() => { root.classList.remove('open'); root.querySelector('.sb').innerHTML = ''; })`. Keep the 320 ms timeout as the fallback when `Motion` is missing.
- `core.js paintLive()`: when an element gains `.live`, `Motion.press(el)`.
- `core.js pulseGesture()` and the settings tester: replace the `pulse` class dance with `Motion.pulse(el)`.
- `boot.js` `run-scene`: `Motion.press(el); Motion.sceneRun(document.querySelectorAll('.room'))` for `h:all` scenes, or the `.room[data-room]` cards whose area contains a device in the preset's `levels` (Lutron scenes: all cards).
- `boot.js` `input` handler: after the existing tooltip code, `Motion.sliderFeedback(el, Number(el.value))`.
- `boot.js` all-off hold timeout: `Motion.allOff()` before the optimistic state write.
- `boot.js` `button-open` and `room-open`: `Motion.press(el)`; `home.js toggleRoom()`: `Motion.expand(cardEl, opening)`.
- `home.js` timer block: `class="timerbar m-timer" style="--m-total:${minutes * 60}s;--m-elapsed:${elapsedSeconds}s"` with `<div class="m-timer-line"></div>` as the last child.
- `core.js connPill()` / the `agent` message: when `S.agent.online` flips, add `m-dot-hello` (on) or `m-dot-lost` (off) to `.pill .dot`.
- `sw.js`: add `/motion.css`, `/js/motion.js`, `/js/lightfield.js`, `/vendor/gsap.min.js`, `/vendor/three.module.js`, `/vendor/three.core.js` to `SHELL` and bump `VERSION`.

Nothing here changes behaviour when GSAP or WebGL is missing: the CSS transitions in `styles.css` still run, `Motion.*` returns immediately (`sheetOut` returns a resolved promise), and the light field falls back to CSS or, if `initLightField` is never called, to nothing.
