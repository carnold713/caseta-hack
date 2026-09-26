// The header that stays (M15, M15b; header.css draws it). As a page scrolls, its title and header circles shrink a
// little and stay at the top with a blurred scrim fading in behind them. All of it follows one number, the page's
// scroll over its first 64 px (0 at rest, 1 from 64 on), which this module writes as --hdr-p onto the page's header
// rows and the lines beside them (ROWS), the only things that read it. It used to be written once on #app, but a
// custom property is inherited, so every write restyled all of the page under it: on a mid-range phone that was
// 10 to 40 ms a frame, and the header's first 64 px of a scroll dropped frames. Each redraw writes it onto the new
// rows (sync), and #screen's own style is left to the transitions that move it:
//
//   wire()        one passive scroll listener, at most one write a frame (requestAnimationFrame), reading nothing
//                 but scrollY, so a fling on Android stays smooth; what moves is the stylesheet's translate, scale
//                 and opacity
//   sync()        write it now: the redraw calls this once the page is drawn and scrolled where it goes, so a
//                 redraw mid-scroll leaves the header where it was and a page put back where it was scrolled has
//                 its header collapsed from its first frame, with nothing animating
//   freeze(n, y)  a copy of a page moved off #screen (the page a transition flies away, the page waiting under a
//                 back swipe) no longer scrolls, so its sticky header rows are held where they were stuck at scroll
//                 y, collapsed as they were
const REACH = 64;

export const progress = y => Math.max(0, Math.min(1, (Number(y) || 0) / REACH));
// four places are plenty, and a value that has not changed is not written again
const text = p => String(Math.round(p * 10000) / 10000);

// what reads --hdr-p (header.css): the header rows, and the page's line under a header row
const ROWS = '#screen :is(.bar, .bar-pin, .bar ~ .fd-sub, .bar ~ .rm-sub)';
export function sync() {
  const v = text(progress(window.scrollY));
  for (const n of document.querySelectorAll(ROWS)) if (n.style.getPropertyValue('--hdr-p') !== v) n.style.setProperty('--hdr-p', v);
}

export function freeze(node, y = window.scrollY) {
  if (!node || !node.style) return node;
  node.classList.add('hdr-frozen');
  node.style.setProperty('--hdr-y', `${Math.round((Number(y) || 0) * 100) / 100}px`);
  node.style.setProperty('--hdr-p', text(progress(y)));
  // its rows take the copy's number, not the one last written onto them (a frame behind in a scroll, or another page's)
  node.querySelectorAll(':is(.bar, .bar-pin, .fd-sub, .rm-sub)').forEach(n => n.style.removeProperty('--hdr-p'));
  return node;
}

let wired = false, queued = false;
export function wire() {
  if (wired) return;
  wired = true;
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }, { passive: true });
  sync();
}
