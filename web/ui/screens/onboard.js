// 16 · Onboarding (v7, 12814:49907): the three pages before the password, and the password itself, over a drawn
// house whose windows light up page by page. Page 1 lights the living room; page 2 has a Pico by the door, pressed,
// its blue signal going out and a second window answering; page 3 is dusk, the porch lantern and the rest of the
// house coming on one by one, the bedroom last and slowly. The house never moves and is never redrawn: only its
// windows change, so a window lit on page 1 stays lit on page 2 rather than lighting again.
//
// Nothing here touches the home. It runs before there is a sign-in, and it is drawn in place (draw() patches the
// page it already put up) because a redraw from scratch would replay every window each time a page turned.
import { icon } from '/ui/icons.js';
import { reduced } from '/ui/motion.js';

const PAGES = [
  { a: 'Control', b: 'every light', pill: 'room', say: 'Caséta, Hue and Nanoleaf together. Nothing to save: everything is undoable.' },
  { a: 'Every', b: 'button, your way', pill: 'pico', say: 'Press, press twice, hold: each can do something different, and something else at night.' },
  { a: 'The house', b: 'on its own', pill: 'moon', say: 'Lights on before you get home, a slow light to wake to, a calmer evening. A minute each to set up.' },
];
// Which windows each page has lit, and when each one that is new comes on after the page arrives (the frame's
// times, read with get_motion_context). The house lights slower than a list staggers: it is the house doing it.
// Window 3 is the bedroom, which rises over the night fade rather than the dimmer.
const LIT = [
  { w4: 400 },
  { w4: 0, w5: 800 },
  { w4: 0, w5: 0, lantern: 580, w2: 740, w6: 900, w1: 1060, w3: 1280 },
];
const ALL = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'lantern'];
// The soft sum of the house's light behind it: a quarter, a half, all of it.
const SUM = [0.25, 0.5, 1];

let page = 0;
export const onboarded = () => { try { return localStorage.getItem('onboarded') === '1'; } catch (_) { return true; } };

// ---------- the drawing ----------
// Frame coordinates throughout (the house box is 320 x 240 at 46, 250; the ground at 490), so the numbers read
// straight against the Figma frame. The viewBox shows y 190 to 500 and the svg lets its glows spill past it.
const win = (n, x, y) => `
  <rect class="pane-off" x="${x}" y="${y}" width="36" height="44" rx="2"/><path class="mull-off" d="M${x + 17.5} ${y}v44M${x} ${y + 21.5}h36"/>
  <g class="w ${n}">
    <ellipse class="bl" cx="${x + 18}" cy="${y + 22}" rx="90" ry="75" fill="url(#obWash)"/>
    <ellipse class="bl" cx="${x + 18}" cy="${y + 22}" rx="60" ry="50" fill="url(#obBody)"/>
    <rect x="${x}" y="${y}" width="36" height="44" rx="2" fill="url(#obPane)"/><path class="mull-on" d="M${x + 17.5} ${y}v44M${x} ${y + 21.5}h36"/>
    ${y > 400 ? `<ellipse class="bl" cx="${x + 18}" cy="490" rx="40" ry="7" fill="url(#obSpill)"/>` : ''}
  </g>`;
export function houseSVG() {
  return `<svg class="ob-svg" viewBox="0 190 412 310" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="obSum"><stop offset="0" stop-color="#D98A4E" stop-opacity=".26"/><stop offset="1" stop-color="#D98A4E" stop-opacity="0"/></radialGradient>
      <radialGradient id="obWash"><stop offset="0" stop-color="#D98A4E" stop-opacity=".12"/><stop offset="1" stop-color="#D98A4E" stop-opacity="0"/></radialGradient>
      <radialGradient id="obBody"><stop offset="0" stop-color="#FFC78A" stop-opacity=".2"/><stop offset=".45" stop-color="#FFC78A" stop-opacity=".09"/><stop offset="1" stop-color="#FFC78A" stop-opacity="0"/></radialGradient>
      <radialGradient id="obSpill"><stop offset="0" stop-color="#FFB46B" stop-opacity=".2"/><stop offset="1" stop-color="#FFB46B" stop-opacity="0"/></radialGradient>
      <linearGradient id="obPane" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD9A8" stop-opacity=".85"/><stop offset="1" stop-color="#D98A4E" stop-opacity=".7"/></linearGradient>
      <radialGradient id="obLCore"><stop offset="0" stop-color="#FAE5C9" stop-opacity=".5"/><stop offset="1" stop-color="#FAE5C9" stop-opacity="0"/></radialGradient>
      <radialGradient id="obLBody"><stop offset="0" stop-color="#FFD9A8" stop-opacity=".32"/><stop offset=".45" stop-color="#FFD9A8" stop-opacity=".14"/><stop offset="1" stop-color="#FFD9A8" stop-opacity="0"/></radialGradient>
      <radialGradient id="obLWash"><stop offset="0" stop-color="#D98A4E" stop-opacity=".24"/><stop offset="1" stop-color="#D98A4E" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse class="ob-sumglow bl" cx="206" cy="370" rx="230" ry="150" fill="url(#obSum)"/>
    <g class="ob-line">
      <path d="M282 292.2V270h22v32.1"/>
      <path d="M46 330L206 258L366 330"/>
      <path d="M60 330V490M352 330V490"/>
    </g>
    ${win('w1', 96, 354)}${win('w2', 188, 354)}${win('w3', 280, 354)}${win('w4', 96, 422)}${win('w5', 188, 422)}
    <circle class="pane-off" cx="206" cy="304" r="12"/>
    <g class="w w6">
      <circle class="bl" cx="206" cy="304" r="70" fill="url(#obWash)"/><circle class="bl" cx="206" cy="304" r="40" fill="url(#obBody)"/>
      <circle cx="206" cy="304" r="12" fill="url(#obPane)"/>
    </g>
    <g class="ob-door"><rect x="286" y="430" width="36" height="60" rx="1.5"/><circle cx="315" cy="462" r="1.6"/></g>
    <rect class="pane-off" x="334" y="440" width="12" height="16" rx="3"/>
    <g class="w lantern">
      <circle class="bl" cx="340" cy="448" r="57.6" fill="url(#obLWash)"/><circle class="bl" cx="340" cy="448" r="36" fill="url(#obLBody)"/>
      <circle class="bl" cx="340" cy="448" r="11.5" fill="url(#obLCore)"/>
      <rect x="334" y="440" width="12" height="16" rx="3" fill="#FAE5C9" fill-opacity=".92"/>
      <ellipse class="bl" cx="340" cy="490" rx="45" ry="8" fill="url(#obSpill)"/>
    </g>
    <g class="ob-pico"><rect x="268" y="440" width="10" height="18" rx="3"/><rect class="ob-key" x="269.5" y="443.5" width="7" height="4" rx="1"/></g>
    <circle class="ob-ring" cx="273" cy="449" r="5"/>
    <path class="ob-ground" d="M26 490.5h360"/>
  </svg>`;
}

// ---------- lighting it ----------
// Windows turn on after their page's delay and off at once (going back): the delay is set only on the way on.
function light(root, lit, { now = false } = {}) {
  const house = root.querySelector('.ob-house'); if (!house) return;
  for (const n of ALL) {
    const el = house.querySelector(`.w.${n}`); if (!el) continue;
    const on = lit === 'all' || (lit != null && n in LIT[lit]);
    const d = on && lit !== 'all' && !now ? LIT[lit][n] : 0;
    el.style.transitionDelay = `${d}ms`;
    el.style.transitionDuration = now ? '0ms' : on && n === 'w3' && lit === 2 ? 'var(--night-fade)' : '';
    el.classList.toggle('on', on);
  }
  const sum = house.querySelector('.ob-sumglow');
  if (sum) { sum.style.transitionDuration = now ? '0ms' : ''; sum.style.opacity = lit === 'all' ? 1 : lit == null ? 0 : SUM[lit]; }
  house.dataset.lit = lit == null ? 'dark' : String(lit);
}
// Page 2: the Pico's key lights, its blue signal goes out as a ring (1 to 5 times, 0.7 s), and the window answers.
function press(root) {
  if (reduced()) return;
  const key = root.querySelector('.ob-key'), ring = root.querySelector('.ob-ring');
  if (!key || !ring || typeof key.animate !== 'function') return;
  key.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1, easing: 'ease-in' }, { opacity: 1, offset: 0.66 }, { opacity: 0 }], { duration: 300, delay: 680, easing: 'ease-out' });
  ring.animate([{ opacity: 0, transform: 'scale(1)' }, { opacity: 0.9, transform: 'scale(1.5)', offset: 0.08, easing: 'ease-in' }, { opacity: 0, transform: 'scale(5)' }], { duration: 700, delay: 680, easing: 'ease-out' });
}

// ---------- the pages ----------
const pill = p => (p.pill === 'room' ? '<span class="ob-room"><i class="slats"></i><i class="glow"></i><i class="floor"></i><i class="sofa"></i><i class="seat"></i><i class="cush"></i><i class="chair"></i></span>'
  : `<span class="ob-ic">${icon(p.pill === 'pico' ? 'remote' : 'moon', 24, 1.6)}</span>`);
const heading = p => `<span>${p.a}</span>${pill(p)}<span>${p.b}</span>`;
const goLabel = () => `${page < PAGES.length - 1 ? 'Next' : 'Get started'}${icon('arrow', 22, 1.8)}`;
function pagesHTML() {
  const p = PAGES[page];
  return `<div class="onboard v7 p${page}">
    <i class="ob-sky" aria-hidden="true"></i>
    <div class="ob-house">${houseSVG()}</div>
    <span class="ob-logo"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.5L10.65 7.35L16.5 9L10.65 10.65L9 16.5L7.35 10.65L1.5 9L7.35 7.35L9 1.5Z" fill="#D98A4E"/></svg>Caseta</span>
    <span class="ob-dots">${PAGES.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')}</span>
    <h1 class="ob-h">${heading(p)}</h1>
    <p class="ob-say">${p.say}</p>
    <button class="ob-back" data-act="ob-back" aria-label="Back" ${page ? '' : 'disabled'}>${icon('back', 22, 1.7)}</button>
    <button class="ob-go" data-act="ob-next">${goLabel()}</button>
  </div>`;
}
function loginHTML() {
  return `<div class="login v7">
    <h1 class="t-h1">Welcome</h1>
    <p class="t-body muted">Enter your home's password to get started.</p>
    <form data-form="login" class="login-form">
      <input class="field" type="password" id="pw" autocomplete="current-password" placeholder="Password" aria-label="Password">
      <button class="pill solid" type="submit">Continue</button>
      <p class="t-cap login-err" id="login-err" hidden></p>
    </form>
    <button class="link blue ob-again" data-act="ob-again">What this app does</button>
    <div class="ob-house login-house">${houseSVG()}</div></div>`;
}
// While the first snapshot is on its way: the house, dark, waiting to be this home.
export function loadingHTML() {
  return `<div class="login v7"><h1 class="t-h1">Getting your home ready</h1><p class="t-body muted">One moment.</p>
    <div class="ob-house login-house" data-lit="dark">${houseSVG()}</div></div>`;
}

// The words and the button swap with the push (0.3 s, 24 px, standard): the old line drifts out the way the page
// is going while the new one comes in behind it.
function push(el, html, dir) {
  if (!el) return;
  if (reduced() || typeof el.animate !== 'function') { el.innerHTML = html; return; }
  const ghost = el.cloneNode(true);
  ghost.classList.add('ob-ghost'); ghost.removeAttribute('data-act'); ghost.setAttribute('aria-hidden', 'true');
  el.after(ghost);
  const e = 'cubic-bezier(.2, .8, .2, 1)';
  ghost.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-24 * dir}px)` }], { duration: 300, easing: e, fill: 'forwards' })
    .finished.catch(() => {}).then(() => ghost.remove());
  el.innerHTML = html;
  el.animate([{ opacity: 0, transform: `translateX(${24 * dir}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 300, easing: e });
}

// Draw the signed-out page into the screen: the onboarding pages on a phone that has not seen them, else the
// password. A page already up is changed in place.
let shownPage = null;
export function draw(scr) {
  if (onboarded()) {
    shownPage = null;
    if (scr.querySelector('.login.v7 [data-form="login"]')) return;
    scr.innerHTML = loginHTML();
    // the house waits for the password with every window lit, already lit: nothing to watch come on here
    light(scr, 'all', { now: true });
    return;
  }
  const root = scr.querySelector('.onboard.v7');
  if (!root) {
    scr.innerHTML = pagesHTML();
    const fresh = scr.querySelector('.onboard');
    light(fresh, null, { now: true });
    wireSwipe(fresh);
    // two frames so the dark house is on screen before its first window lights
    requestAnimationFrame(() => requestAnimationFrame(() => { light(fresh, page); if (page === 1) press(fresh); }));
    shownPage = page;
    return;
  }
  if (shownPage === page) return;
  const dir = shownPage == null || page > shownPage ? 1 : -1;
  root.className = `onboard v7 p${page}`;
  root.querySelectorAll('.ob-dots i').forEach((d, i) => d.classList.toggle('on', i === page));
  push(root.querySelector('.ob-h'), heading(PAGES[page]), dir);
  push(root.querySelector('.ob-say'), PAGES[page].say, dir);
  const go = root.querySelector('.ob-go'); if (go) go.innerHTML = goLabel();
  const back = root.querySelector('.ob-back'); if (back) back.disabled = !page;
  light(root, page);
  if (page === 1) press(root);
  shownPage = page;
}

// Swiping the page sideways turns it, the way a thumb expects on a phone: left for the next page, right for the one
// before. The last page is left by its button only, since that one finishes.
function wireSwipe(el) {
  let x0 = null, y0 = 0;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
  el.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && page < PAGES.length - 1) page += 1; else if (dx > 0 && page > 0) page -= 1; else return;
    draw(el.parentElement);
  });
  el.addEventListener('pointercancel', () => { x0 = null; });
}

// A password that did not work: the windows dim once and the field says so.
export function wrong(scr) {
  const h = scr.querySelector('.login-house'); if (!h) return;
  h.classList.remove('wrong'); void h.getBoundingClientRect(); h.classList.add('wrong');
}

// The taps on these pages. Returns true when it was one of them; the caller redraws.
export function act(name) {
  if (name === 'ob-next') { if (page < PAGES.length - 1) page += 1; else { try { localStorage.setItem('onboarded', '1'); } catch (_) { /* fine */ } } return true; }
  if (name === 'ob-back') { if (page > 0) page -= 1; return true; }
  if (name === 'ob-again') { try { localStorage.removeItem('onboarded'); } catch (_) { /* fine */ } page = 0; shownPage = null; return true; }
  return false;
}

// Straight after the first sign-in, once the home has loaded: what was found, in one line.
export function foundLine(c) {
  const rooms = c.data.areas().length;
  const lights = c.data.devices().filter(d => d.domain === 'light').length;
  return `Your home: ${rooms} ${rooms === 1 ? 'room' : 'rooms'}, ${lights} ${lights === 1 ? 'light' : 'lights'}.`;
}
