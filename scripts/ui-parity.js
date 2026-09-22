// Copper Night parity: measures the built components in Chromium and compares them with numbers read
// out of the Figma file itself (frame 02 Home, node 12732:48971), using read-only use_figma scripts:
// absoluteBoundingBox relative to the parent's outer edge for geometry, resolved variables for colour.
//
// Not from screenshots and not from the code export. The export puts a bordered frame's children a
// pixel in and halves shadow blurs, and three of the numbers below were wrong in this repo for exactly
// that reason until they were read from the file. docs/design-spec-v6.md has the story.
//
//   npm run test:ui
//
// When a screen is built, add its measurements here the same way: read them from the file first.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url.split('?')[0]);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
// [what, parent selector, child selector, expected x, y, w, h]  (null = do not check)
const FILE = [
  ['tile power circle',    '#tiles .tile.on', '.pwr',  16, 16, 44, 44],
  ['tile art',             '#tiles .tile.on', '.art', 108, 12, 48, 48],
  ['tile name',            '#tiles .tile.on', '.nm',   16, 94, 136, null],
  ['tile value',           '#tiles .tile.on', '.vl',   16, 116, null, null],
  ['tile glow',            '#tiles .tile.on', '.glow', 89, -9, 86, 86],
  ['tile power glyph',     '#tiles .tile.on .pwr', '.ic', 11, 11, 22, 22],
  ['bar small sun',        '.hbar', '.lo',   17, 17, 22, 22],
  ['bar large sun',        '.hbar', '.hi',  291, 15, 26, 26],
  ['bar knob',             '.hbar', '.knob', 125, 8, 40, 40],
  ['bar fill',             '.hbar', '.fill', 0, 0, 173, 56],
  ['whole-house bar',      '.card.lit', '.hbar', 20, null, 332, 56],
  ['hold moon',            '#hold', '.ic',  12, 12, 20, 20],
  ['scene chip dots',      '.chip.scene', '.chip-dots', 13, 14, 28, 12],
  ['coming-up circle',     '.card-row', '.row-ic', 14, 14, 40, 40],
  ['coming-up title',      '.card-row', '.row-txt .t', 66, null, null, null],
  ['header back',          '.hdr', '.back', 20, 52, 56, 56],
  ['header icon',          '.hdr .back', '.ic', 18, 18, 20, 20],
  ['tab active circle',    '.tabbar', 'button[aria-current]', 8, 8, 56, 56],
  ['tab icon 2 (grid)',    '.tabbar', 'button:nth-child(2) .ic', 124, 24, 24, 24],
  ['tab icon 4 (clock)',   '.tabbar', 'button:nth-child(4) .ic', 324, 24, 24, 24],
];
// colours read from the file for the same placements
const COLOURS = [
  ['lit tile power glyph', '#tiles .tile.on .pwr', 'color', 'rgb(184, 108, 53)'],
  ['blue tile power glyph', '#tiles .tile.tinted .pwr', 'color', 'rgb(47, 74, 153)'],
  ['off tile power glyph', '#tiles .tile:not(.on):not(.gone) .pwr', 'color', 'rgb(209, 209, 209)'],
  ['sun inside the fill', '.hbar .lo', 'color', 'rgb(18, 18, 18)'],
  ['sun on the track', '.hbar .hi', 'color', 'rgb(209, 209, 209)'],
  ['All off glyph', '.pill.ghost .ic', 'color', 'rgb(209, 209, 209)'],
  ['scene chip label', '.chip.scene', 'color', 'rgb(255, 255, 255)'],
  ['scene chip fill', '.chip.scene', 'backgroundColor', 'rgb(38, 38, 38)'],
  ['more chip label', '.chip.more', 'color', 'rgb(209, 209, 209)'],
  ['tab active glyph', '.tabbar button[aria-current]', 'color', 'rgb(18, 18, 18)'],
  ['tab idle glyph', '.tabbar button:nth-child(2)', 'color', 'rgb(209, 209, 209)'],
];
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/ui/gallery.html`); await page.waitForTimeout(600);
  // The whole-house knob is the one that caught an assumption: at 52% the file's fill ends at 173 and
  // the knob's left edge is at 125, inside the fill with 8 all round, not centred on its edge.
  const got = await page.evaluate(F => F.map(([what, ps, cs, ...exp]) => {
    const p = document.querySelector(ps); const c = p && p.querySelector(cs);
    if (!c) return [what, 'missing'];
    const a = p.getBoundingClientRect(), r = c.getBoundingClientRect();
    return [what, [r.left - a.left, r.top - a.top, r.width, r.height].map(v => Math.round(v * 10) / 10), exp];
  }), FILE);
  let bad = 0;
  for (const [what, v, exp] of got) {
    if (v === 'missing') { console.log('MISSING', what); bad++; continue; }
    const off = v.map((x, i) => exp[i] == null ? null : Math.abs(x - exp[i]) > .6 ? `${['x','y','w','h'][i]} ${x} not ${exp[i]}` : null).filter(Boolean);
    console.log((off.length ? 'OFF  ' : 'ok   ') + what.padEnd(22) + (off.length ? off.join(', ') : v.join(' ')));
    if (off.length) bad++;
  }
  const cols = await page.evaluate(C => C.map(([what, s, prop, exp]) => { const e = document.querySelector(s); return [what, e ? getComputedStyle(e)[prop] : 'missing', exp]; }), COLOURS);
  for (const [what, v, exp] of cols) { const ok = v === exp; if (!ok) bad++; console.log((ok ? 'ok   ' : 'OFF  ') + what.padEnd(22) + v + (ok ? '' : `  (file ${exp})`)); }
  console.log(bad ? `${bad} off` : 'ALL MATCH THE FILE');
  await b.close(); srv.close();
  process.exit(bad ? 1 : 0);
});
