// A page the new app does not draw yet. Everything it stands for still works in the current app, which stays at /
// until the cutover (the handoff's phase 5), so this says so and goes there.
export const noTabs = false;

const NAMES = {
  remotes: 'Remotes', remote: 'Remote', routines: 'Routines', settings: 'Settings', activity: 'Recent activity',
  scenes: 'All scenes', 'rooms-add': 'Add a room', room: 'Room setup', light: 'This light',
};
const SUB = { white: 'White', colour: 'Colour', timer: 'Sleep timer', follow: 'Follow the day', about: 'About this light', setup: 'Room setup' };

export function view(c, r) {
  const { esc, icon } = c;
  const title = (r.sub && SUB[r.sub]) || NAMES[r.name] || 'Not here yet';
  return `<div class="soon-page">
    <header class="hdr"><button class="hdr-btn back" data-act="back" aria-label="Back">${icon('back', 22, 1.7)}</button></header>
    <h1 class="t-h1 page-h1">${esc(title)}</h1>
    <div class="soon">
      <p class="t-body muted">This page is still being rebuilt in the new look. Everything on it works in the current app.</p>
      <a class="pill ghost" href="/">Open the current app</a>
    </div>
  </div>`;
}
