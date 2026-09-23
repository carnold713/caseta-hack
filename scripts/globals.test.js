// Every web/js/*.js is a plain <script>, so they all share one global scope. Two files declaring the
// same top-level name is not an error anywhere: the later file's declaration is the one that wins, the
// earlier file's callers quietly get the wrong function, and what you see is a row that renders empty.
//
// That is exactly how this check came to exist. A room's scene row was added to light.js as
// sceneRowHTML, home.js had owned that name for its own row of scene cells since Home was built, and
// light.js loads after home.js: Home's scene row simply stopped appearing. Nothing threw.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const JS = path.join(WEB, 'js');

function topLevelNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
  return names;
}

test('no top-level name in web/js is declared by two plain scripts', () => {
  // A <script type="module"> has a scope of its own, so its top-level names cannot collide with anyone's.
  const html = fs.readFileSync(path.join(WEB, 'classic', 'index.html'), 'utf8');  // the classic app, which is the one made of plain scripts
  const modules = new Set([...html.matchAll(/<script[^>]*type="module"[^>]*src="\/js\/([^"]+)"/g)].map(m => m[1]));
  const files = fs.readdirSync(JS).filter(n => n.endsWith('.js') && !modules.has(n));
  assert.ok(files.length > 5, 'found the app scripts');

  const where = new Map();
  for (const f of files) {
    for (const n of topLevelNames(fs.readFileSync(path.join(JS, f), 'utf8'))) {
      if (!where.has(n)) where.set(n, []);
      where.get(n).push(f);
    }
  }
  const clashes = [...where].filter(([, fs_]) => fs_.length > 1)
    .map(([n, fs_]) => `${n} is declared in ${fs_.join(' and ')}`);
  assert.deepEqual(clashes, [], `\n  ${clashes.join('\n  ')}\n  The file that loads last wins and the other file's callers get the wrong one.`);
});
