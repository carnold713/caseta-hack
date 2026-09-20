// The bug: after dark a lit room tile went white-on-grey. :root[data-night="1"] .room.on painted
// --fill-1 over the tint and, being the `background` shorthand, dropped the room's mesh with it, while
// the ink, the switch and the disc kept their lit values. Day and night, on the same rig.
const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
const lum = c => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(n => { const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const grey = c => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number); return Math.max(r, g, b) - Math.min(r, g, b) < 6; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGEERROR ' + e.message); fails.push('pageerror'); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); }
  await page.waitForSelector('.room', { timeout: 10000 }); await page.waitForTimeout(1000);
  await page.evaluate(() => { if (typeof sheet !== 'undefined' && sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(500);
  await page.evaluate(async () => { await command({ type: 'level', target: 'a:20', level: 100 }); });
  await page.waitForTimeout(1400);

  const read = () => page.evaluate(() => {
    const el = document.querySelector('.rtile[data-rtile="20"]');
    const cs = getComputedStyle(el);
    return { night: document.documentElement.dataset.night === '1', bg: cs.backgroundColor,
             img: (cs.backgroundImage || 'none').slice(0, 40), ink: getComputedStyle(el.querySelector('.n')).color,
             ink2: getComputedStyle(el.querySelector('.s')).color, border: cs.borderTopColor,
             tile: (() => { const t = document.querySelector('.dtile[data-tile="5"]'); return t ? getComputedStyle(t).backgroundColor : null; })(),
             rhero: (() => { const h = document.querySelector('.rhero .rh-pool'); return h ? getComputedStyle(h).getPropertyValue('--c').trim() : null; })() };
  });

  for (const mode of ['never', 'always']) {
    await page.evaluate(m => setNightLook(m), mode);
    await page.waitForTimeout(700);
    // the room page as well as Home: the device tiles live there, and they are the other tinted surface
    await page.evaluate(() => { if (sheet.isOpen()) sheet.close(); }); await page.waitForTimeout(400);
    await page.click('.rtile[data-rtile="20"] [data-act="room-open"]'); await page.waitForTimeout(800);
    const rt = await page.evaluate(() => { const t = document.querySelector('[data-tile]');
      return t ? { sel: t.className, bg: getComputedStyle(t).backgroundColor } : { sel: 'none', bg: null }; });
    await page.goBack(); await page.waitForTimeout(800);
    const r = Object.assign(await read(), { tile: rt.bg });
    console.log(`     device tile on the room page: ${rt.sel} ${rt.bg}`);
    const tag = mode === 'always' ? 'night' : 'day';
    check(r.night === (mode === 'always'), `${tag}: the look is applied`);
    check(!grey(r.bg), `${tag}: the room tile carries a colour, not a grey (${r.bg})`);
    check(r.img.startsWith('radial-gradient'), `${tag}: the room's mesh survives (${r.img})`);
    check(ratio(r.ink, r.bg) >= 4.5, `${tag}: the room's name is readable on it (${ratio(r.ink, r.bg).toFixed(2)}:1)`);
    check(ratio(r.ink2, r.bg) >= 4.5, `${tag}: the line under it is readable (${ratio(r.ink2, r.bg).toFixed(2)}:1)`);
    check(r.tile && !grey(r.tile), `${tag}: a lit light tile carries a colour too (${r.tile})`);
    console.log(`     ${tag} fill ${r.bg}  border ${r.border}`);
    await page.screenshot({ path: `${__dirname}/night_${tag}.png` });
  }
  // the whole point of the night look: after dark the same light is painted darker
  await page.evaluate(() => setNightLook('never')); await page.waitForTimeout(600);
  const day = (await read()).bg;
  await page.evaluate(() => setNightLook('always')); await page.waitForTimeout(600);
  const night = (await read()).bg;
  check(lum(night) < lum(day) - 0.01, `night is darker than day (${lum(day).toFixed(4)} then ${lum(night).toFixed(4)})`);
  await page.evaluate(() => setNightLook('auto'));
  await browser.close();
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
