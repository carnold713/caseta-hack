const { chromium } = require('playwright-core');
const PORT = process.env.PORT || 4400;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 } });
  // The hub allows 20 logins in 15 minutes from one address and this suite is 28 tests, so they
  // share the one token run.js logged in with. Without the runner the #pw fallback below still works.
  if (process.env.APP_TOKEN) await ctx.addInitScript(t => { try { localStorage.setItem('token', t); } catch (_) {} }, process.env.APP_TOKEN);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message, e.stack && e.stack.split('\n').slice(0,3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) console.log('CONSOLE', m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(500);
  const hasPw = await page.$('#pw');
  if (hasPw) { if (await page.$('#pw')) { await page.fill('#pw', 'secret'); await page.click('button.primary'); } }
  await page.waitForTimeout(1500);
  console.log('view html length', (await page.evaluate(() => document.querySelector('#view').innerHTML.length)));
  await browser.close();
})();
