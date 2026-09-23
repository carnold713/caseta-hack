// The service worker's offline shell (web/sw.js) names every file each app needs, and only files that exist. A
// screen added to web/ui/screens/ without being listed would open online and fail the first time the phone is not.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const WEB = path.join(__dirname, '..', '..', 'web');

function shell() {
  const src = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
  const lists = {};
  for (const name of ['APP', 'CLASSIC', 'SHARED']) {
    const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(src);
    lists[name] = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  }
  return lists;
}

test('every file the shell names exists', () => {
  const { APP, CLASSIC, SHARED } = shell();
  for (const u of [...APP, ...CLASSIC, ...SHARED]) {
    const f = u.endsWith('/') ? path.join(WEB, u, 'index.html') : path.join(WEB, u);
    assert.ok(fs.existsSync(f), `${u} is listed but not in web/`);
  }
});

test('the new app\'s every module, stylesheet, picture and data file is in it', () => {
  const { APP } = shell();
  const want = [
    ...fs.readdirSync(path.join(WEB, 'ui')).filter(f => /\.(js|css)$/.test(f)).map(f => `/ui/${f}`),
    ...fs.readdirSync(path.join(WEB, 'ui', 'screens')).map(f => `/ui/screens/${f}`),
    ...fs.readdirSync(path.join(WEB, 'ui', 'art')).map(f => `/ui/art/${f}`),
    ...fs.readdirSync(path.join(WEB, 'data')).map(f => `/data/${f}`),
  ];
  for (const u of want) assert.ok(APP.includes(u), `${u} is missing from the shell in web/sw.js`);
});

test('the new app is at / and the previous one at /classic/', () => {
  const root = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const classic = fs.readFileSync(path.join(WEB, 'classic', 'index.html'), 'utf8');
  assert.match(root, /\/ui\/app\.js/);
  assert.match(classic, /\/js\/boot\.js/);
});
