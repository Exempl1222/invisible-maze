// The deploy's cache-busting stamper (tools/stamp-version.mjs), run on a temp copy of the real site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stampSite, shortVersion } from './stamp-version.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = '0123456789abcdef0123456789abcdef01234567';

/** What the deploy collects into _site, copied to a temp folder. */
function copySite() {
  const dir = mkdtempSync(join(tmpdir(), 'gsg-site-'));
  for (const p of ['index.html', 'play', 'daily', 'assets']) cpSync(join(REPO, p), join(dir, p), { recursive: true });
  mkdirSync(join(dir, 'src'));
  cpSync(join(REPO, 'src/game'), join(dir, 'src/game'), { recursive: true, filter: (s) => !s.endsWith('.test.js') });
  return dir;
}
function* files(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}
const snapshot = (dir) => Object.fromEntries([...files(dir)].map((f) => [f.slice(dir.length), readFileSync(f)]));

test('shortVersion is the first 8 characters', () => {
  assert.equal(shortVersion(SHA), '01234567');
  assert.equal(shortVersion('abc12345\n'), 'abc12345');
});

test('real site: every own reference gets ?v=, every stamped file still exists, no external URL is touched, no file is missing', () => {
  const dir = copySite();
  try {
    const before = snapshot(dir);
    const r = stampSite(dir, SHA);
    assert.deepEqual(r.unresolved, [], 'a reference to a file that is not there');
    assert.ok(r.rewritten > 50, `only ${r.rewritten} rewritten`);
    const pageDirs = [dir, join(dir, 'daily'), join(dir, 'play')];
    let seen = 0;
    const REF = /(["'`])((?:[^"'`\s$\\?#]*?)\.(?:js|mjs|json|css))\?v=01234567\1/g;
    for (const f of files(dir)) {
      if (!['.html', '.js', '.css'].includes(extname(f))) continue;
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(REF)) {
        seen++;
        assert.ok([dirname(f), ...pageDirs].some((d) => existsSync(resolve(d, m[2]))), `${m[2]} in ${f}`);
      }
      assert.doesNotMatch(text, /\?v=01234567\?v=/, 'stamped twice');
      assert.doesNotMatch(text, /https?:\/\/[^\s"'`]*\?v=01234567/, `an external URL was stamped in ${f}`);
    }
    assert.equal(seen, r.rewritten);
    // the entry points and the level files are among them
    assert.match(readFileSync(join(dir, 'daily/index.html'), 'utf8'), /src="\.\.\/assets\/js\/daily\/main\.js\?v=01234567"/);
    assert.match(readFileSync(join(dir, 'daily/index.html'), 'utf8'), /href="\.\.\/assets\/css\/daily\.css\?v=01234567"/);
    assert.match(readFileSync(join(dir, 'assets/js/daily/config.js'), 'utf8'), /daily-easy\.json\?v=01234567/);
    assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /from '\.\/assets\/js\/teaser\.js\?v=01234567'/);
    // the external font stylesheet and the Turnstile script URL are as they were
    const daily = readFileSync(join(dir, 'daily/index.html'), 'utf8');
    assert.match(daily, /href="https:\/\/fonts\.googleapis\.com\/css2\?family=Grandstander[^"]*"/);
    assert.match(readFileSync(join(dir, 'assets/js/daily/turnstile.js'), 'utf8'), /api\.js\?render=explicit'/);
    // art (svg) and json data files themselves are not rewritten
    for (const [path, buf] of Object.entries(before)) if (['.svg', '.json', '.png'].includes(extname(path))) assert.deepEqual(readFileSync(dir + path), buf, path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('real site: running it twice changes nothing the second time', () => {
  const dir = copySite();
  try {
    stampSite(dir, SHA);
    const once = snapshot(dir);
    const again = stampSite(dir, SHA);
    assert.equal(again.rewritten, 0);
    assert.deepEqual(snapshot(dir), once);
    assert.equal(stampSite(dir, 'ffffffff00000000').rewritten, 0, 'a stamped reference is left alone even for another version');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every syntax form, and the things that must be left alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsg-forms-'));
  try {
    mkdirSync(join(dir, 'daily'));
    mkdirSync(join(dir, 'assets/js'), { recursive: true });
    mkdirSync(join(dir, 'assets/css'));
    mkdirSync(join(dir, 'assets/levels'));
    for (const f of ['assets/js/a.js', 'assets/js/b.js', 'assets/js/w.js', 'assets/js/c.js', 'assets/css/x.css', 'assets/css/y.css', 'assets/levels/l.json']) writeFileSync(join(dir, f), '');
    writeFileSync(join(dir, 'index.html'), '<link rel="stylesheet" href="assets/css/x.css"><script type="module" src="assets/js/a.js"></script><link href="https://cdn.example/x.css" rel="stylesheet"><script src="//cdn.example/y.js"></script><script src="/root.js"></script><a href="#top">t</a>');
    writeFileSync(join(dir, 'assets/js/a.js'), [
      "import { b } from './b.js';",
      "import './c.js';",
      "export { c } from './c.js';",
      "const lazy = import('./b.js');",
      "const u = new URL('./w.js', import.meta.url);",
      "const bare = new URL('w.js', import.meta.url);",
      "const worker = new Worker(new URL('./w.js', import.meta.url), { type: 'module' });",
      "export const LEVEL_URL = '../levels/l.json';",
      "const page = '../assets/levels/l.json';",
      "const ext = 'https://cdn.example/lib.js';",
      "const already = './b.js?v=old';",
      "const tmpl = `./${name}.js`;",
      "const none = './nowhere.js';",
      "const svg = '../sprites/gnome.svg';",
    ].join('\n'));
    writeFileSync(join(dir, 'assets/css/x.css'), "@import './y.css';\n@import url(\"y.css\");\n.a { background: url(../sprites/t.svg); }");
    const r = stampSite(dir, SHA);
    const a = readFileSync(join(dir, 'assets/js/a.js'), 'utf8');
    for (const want of [
      "from './b.js?v=01234567'", "import './c.js?v=01234567'", "export { c } from './c.js?v=01234567'", "import('./b.js?v=01234567')",
      "new URL('./w.js?v=01234567', import.meta.url)", "new URL('w.js?v=01234567', import.meta.url)",
      "new Worker(new URL('./w.js?v=01234567', import.meta.url)", "'../levels/l.json?v=01234567'", "'../assets/levels/l.json?v=01234567'",
    ]) assert.ok(a.includes(want), want);
    for (const keep of ["'https://cdn.example/lib.js'", "'./b.js?v=old'", '`./${name}.js`', "'./nowhere.js'", "'../sprites/gnome.svg'"]) assert.ok(a.includes(keep), keep);
    assert.deepEqual(r.unresolved.map((u) => u.ref), ['./nowhere.js']);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes('href="assets/css/x.css?v=01234567"') && html.includes('src="assets/js/a.js?v=01234567"'));
    assert.ok(html.includes('href="https://cdn.example/x.css"') && html.includes('src="//cdn.example/y.js"') && html.includes('src="/root.js"'));
    const css = readFileSync(join(dir, 'assets/css/x.css'), 'utf8');
    assert.ok(css.includes("@import './y.css?v=01234567'") && css.includes('@import url("y.css?v=01234567")') && css.includes('url(../sprites/t.svg)'));
    assert.throws(() => stampSite(dir, 'x'), /version/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
