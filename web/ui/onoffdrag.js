// On and Off, dragged as well as tapped. People reach for the pill as they would a switch and pull it across, so it
// follows a sideways drag inside its track. The labels change as it crosses the middle, so what letting go would do
// is always shown; let go past the middle (or flicked either way) and it is that half's tap, let go short of it and it
// slides home with nothing sent. An up or down swipe that starts on it still scrolls the page (gesture.js), and a
// plain tap on either half is still that half's button.
import { track } from '/ui/gesture.js';

const FLICK = 0.4;    // px per ms: a flick this fast goes the way it was flicked, wherever the pill is let go
const FRESH = 80;     // ms: a finger that stopped longer ago than this before lifting was not flicking

export function wireOnOff(c, root) {
  for (const box of root.querySelectorAll('.onoff')) {
    const pill = box.querySelector('.onoff-pill');
    const [on, off] = box.querySelectorAll(':scope > button');
    if (!pill || !on || !off) continue;
    let travel = 0, from = 0, at = 0, x0 = 0, was = false, last = null, v = 0, swallow = 0;
    // the pill follows from where the finger landed, not from where the drag was recognised a few pixels later
    box.addEventListener('pointerdown', e => { x0 = e.clientX; });
    const show = toOff => {
      if (pill.classList.contains('off') === toOff) return false;
      pill.classList.toggle('off', toOff);
      on.setAttribute('aria-pressed', String(!toOff));
      off.setAttribute('aria-pressed', String(toOff));
      return true;
    };
    track(box, {
      c, axis: 'x', late: true,
      start: e => {
        travel = off.offsetLeft - on.offsetLeft;
        was = pill.classList.contains('off');
        from = at = was ? travel : 0;
        last = { x: e.clientX, t: performance.now() }; v = 0;
        box.classList.add('held');
        // the pill follows the finger with no lag; its colour still turns on its own curve as it crosses
        pill.style.transition = 'background-color var(--standard) var(--ease)';
      },
      move: e => {
        const t = performance.now();
        if (t > last.t) v = (e.clientX - last.x) / (t - last.t);
        last = { x: e.clientX, t };
        at = Math.min(travel, Math.max(0, from + e.clientX - x0));
        pill.style.transform = `translateX(${at}px)`;
        // a small tick as it crosses, like the detent of a real switch
        if (show(at > travel / 2) && navigator.vibrate) navigator.vibrate(8);
      },
      end: () => {
        box.classList.remove('held');
        const flick = performance.now() - last.t < FRESH && Math.abs(v) > FLICK;
        const toOff = flick ? v > 0 : at > travel / 2;
        pill.style.transition = '';
        pill.style.transform = '';
        show(toOff);
        // the click a mouse makes on letting go is not a tap as well
        swallow = performance.now() + 400;
        if (toOff !== was) (toOff ? off : on).click();
      },
    });
    box.addEventListener('click', e => {
      if (e.isTrusted && performance.now() < swallow) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }
}
