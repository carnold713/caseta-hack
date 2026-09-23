// An address the app has no page for (an old bookmark, a mistyped link). It says so, and offers Home and the
// classic app, which keeps the previous design at /classic/ for anything someone misses.
export const noTabs = false;

export function view(c) {
  const { icon } = c;
  return `<div class="soon-page">
    <header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">Not here</h1>
    <div class="soon">
      <p class="t-body muted">There is no page at this address. Everything the app does is a tap or two from Home.</p>
      <div class="sheet-btns"><button class="pill solid" data-go="home">Go home</button><a class="pill ghost" href="/classic/">Classic app</a></div>
    </div>
  </div>`;
}
