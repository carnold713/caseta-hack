// The Copper Night UI glyphs, taken verbatim from the hidden `_design-helpers` frame in the Figma
// file (node 12731:20), which holds the generator source every frame was drawn with. They are a
// 24 grid, 1.7px round-capped stroke, no fill. Do not redraw them by eye: these are the shapes the
// designer actually shipped.
//
// Device and room art is a different set. Those come from the Lutron Illustrative IconWrapper
// library and the custom Caseta Icon board (00b), exported as SVG files, not from here.

export const PATHS = {
  back:    '<path d="M15 5l-7 7 7 7"/>',
  chev:    '<path d="M9 5l7 7-7 7"/>',
  chevD:   '<path d="M6 9l6 6 6-6"/>',
  power:   '<path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/>',
  tune:    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  home:    '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9 20v-5h6v5"/>',
  grid:    '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  remote:  '<rect x="7" y="2.5" width="10" height="19" rx="4"/><circle cx="12" cy="7" r="1.2"/><path d="M10 12h4M10 16h4"/>',
  clock:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  gear:    '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/><circle cx="12" cy="12" r="6.5"/>',
  user:    '<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  minus:   '<path d="M5 12h14"/>',
  pencil:  '<path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z"/><path d="M13 7l4 4"/>',
  x:       '<path d="M6 6l12 12M18 6L6 18"/>',
  check:   '<path d="M5 12.5l4.5 4.5L19 7"/>',
  sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon:    '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  star:    '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  timer:   '<circle cx="12" cy="13" r="7.5"/><path d="M12 13V9.5M9.5 2.5h5"/>',
  wifi:    '<path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.6a9 9 0 0 1 12.4 0M9 16.1a4.4 4.4 0 0 1 6 0"/><circle cx="12" cy="19.3" r=".6"/>',
  bulb:    '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  fan:     '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c0-4 1-6.9 3.6-6.9 2.2 0 2.5 3.9-3.6 6.9zM13.6 12c4 0 6.9 1 6.9 3.6 0 2.2-3.9 2.5-6.9-3.6zM12 13.6c0 4-1 6.9-3.6 6.9-2.2 0-2.5-3.9 3.6-6.9zM10.4 12c-4 0-6.9-1-6.9-3.6 0-2.2 3.9-2.5 6.9 3.6z"/>',
  shade:   '<rect x="4" y="3.5" width="16" height="3" rx="1"/><path d="M5.5 6.5v8h13v-8M5.5 10.5h13"/><path d="M12 14.5v3"/><circle cx="12" cy="19" r="1.3"/>',
  undo:    '<path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-2"/>',
  bolt:    '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  drop:    '<path d="M12 3.5c3 3.8 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6.2 5.5-10z"/>',
  sunrise: '<path d="M4 18h16M7 14.5a5 5 0 0 1 10 0M12 4v4M9.5 6.5L12 4l2.5 2.5M4.5 10.5l1.4 1M19.5 10.5l-1.4 1"/>',
  door:    '<path d="M5 21h14M7 21V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V21"/><circle cx="14" cy="12.5" r=".7"/>',
  bed:     '<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M3 18v2M21 18v2"/><path d="M6.5 9V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/>',
  search:  '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  hand:    '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 10V4.5a1.5 1.5 0 0 1 3 0V11M15 10.5V6.5a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6.5 7-2.8 0-4.4-1.6-5.6-3.8l-2-3.7a1.5 1.5 0 0 1 2.6-1.5L9 13.5V8a1.5 1.5 0 0 1 3 0"/>',
  pulse:   '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  dots:    '<circle cx="5.5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18.5" cy="12" r=".9"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 6.8 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r=".9"/><circle cx="10.5" cy="7.5" r=".9"/><circle cx="15" cy="7.8" r=".9"/>',
  // six more, exported from the frames that use them (21, 10, 09, 07, 01, 12) and put on the same 24 grid
  sunset:  '<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 4v5M14.5 6.5L12 9 9.5 6.5M4.2 12.5l1.4 1M19.8 12.5l-1.4 1"/>',
  globe:   '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z"/>',
  info:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".5"/>',
  lamp:    '<path d="M8.5 3.5h7l3 7.5h-13z"/><path d="M12 11v7.5M8 20.5h8"/>',
  arrow:   '<path d="M5 12h14M13 18l6-6-6-6"/>',
  wifiOff: '<path d="M2.5 9a14 14 0 0 1 5-3.2M11 5.1a14 14 0 0 1 10.5 3.9M5.8 12.6a9 9 0 0 1 3.6-2.1M14.8 10.8a9 9 0 0 1 3.4 1.8M9 16.1a4.4 4.4 0 0 1 6 0"/><circle cx="12" cy="19.3" r=".6"/><path d="M3.5 3.5l17 17"/>',
  camera:  '<path d="M4 8.5a2 2 0 0 1 2-2h1.8L9.5 4h5l1.7 2.5H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  // drawn here on the same grid and stroke, for pinning to Home: a push pin, its cap, body and point. The body has a
  // class of its own so something pinned can fill it (screens.css, .pinned)
  pin:     '<path class="pin-body" d="M9.5 3.5l-.4 5.2-2.6 4.8h11l-2.6-4.8-.4-5.2z"/><path d="M8 3.5h8M12 13.5v7"/>'
};

export const NAMES = Object.keys(PATHS);

// `currentColor` rather than a colour argument: the glyph then takes its colour from whatever it
// sits in, which is what every one of these does in the design (a row tints its own chevron, a lit
// segment its own power glyph).
export function icon(name, size = 24, stroke = 1.7) {
  const d = PATHS[name];
  if (!d) throw new Error(`no icon "${name}"`);
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">`
    + `<g stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`;
}
