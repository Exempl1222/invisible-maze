// Cache busting without a build step. The deploy runs this on the collected site (_site), never on the repo:
//   node tools/stamp-version.mjs _site "$GITHUB_SHA"
// It appends ?v=<first 8 characters of the version> to every relative reference to our own .js, .mjs, .json and
// .css files, so a new deploy never mixes with a cached old file. Rewritten forms:
//   HTML     <script src>, <link href> (and any other src/href that points at one of those files)
//   JS       'x.js' in import ... from, export ... from, import 'x', import('x'), new URL('x', import.meta.url),
//            and plain string constants such as LEVEL_URL in config.js (any quoted ./ or ../ path)
//   CSS      @import
// Absolute and external URLs are untouched, so are references that already carry a query (running it twice is
// the same as once), and so is any reference that does not resolve to a file in the site (it is reported).
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = '(?:js|mjs|json|css)';
const NOT_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i; // a scheme, protocol-relative, root-relative or fragment: not ours to stamp

const ATTR = new RegExp(`(\\b(?:src|href)\\s*=\\s*)(["'])([^"'?#\\s]+\\.${EXT})\\2`, 'gi');
const STRING = new RegExp(`(["'\`])((?:\\.{1,2}/)[^"'\`\\s?#$\\\\]*\\.${EXT})\\1`, 'g');
const NEW_URL = new RegExp(`(new\\s+URL\\(\\s*)(["'])([^"'\`\\s?#$\\\\]+\\.${EXT})\\2(\\s*,\\s*import\\.meta\\.url)`, 'g');
const CSS_IMPORT = new RegExp(`(@import\\s+(?:url\\(\\s*)?)(["']?)([^"')\\s?#]+\\.css)\\2`, 'gi');

/** Version text for the query: the first 8 characters. */
export const shortVersion = (v) => String(v).trim().slice(0, 8);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/**
 * Stamp every own reference under `root`. Returns { files, rewritten, unresolved: [{ file, ref }] }.
 * A reference counts as resolving if it points at a file when read from the file that holds it, from the
 * site root, or from a page folder (daily/, play/): string constants are read by the page, not by the module.
 */
export function stampSite(root, version) {
  const v = shortVersion(version);
  if (!/^[A-Za-z0-9]{4,8}$/.test(v)) throw new Error(`version must be at least 4 letters or digits, got "${version}"`);
  const base = resolve(root);
  const pageDirs = [base, join(base, 'daily'), join(base, 'play')];
  const result = { files: 0, rewritten: 0, unresolved: [] };

  for (const file of walk(base)) {
    const ext = extname(file).toLowerCase();
    if (!['.html', '.js', '.mjs', '.css'].includes(ext)) continue;
    const here = dirname(file);
    const exists = (ref) => [here, ...pageDirs].some((d) => existsSync(resolve(d, ref)));
    let changed = 0;
    const stampRef = (ref, whole, build) => {
      if (NOT_URL.test(ref)) return whole;
      if (!exists(ref)) {
        result.unresolved.push({ file: file.slice(base.length + 1), ref });
        return whole;
      }
      changed++;
      return build(`${ref}?v=${v}`);
    };

    let text = readFileSync(file, 'utf8');
    const before = text;
    if (ext === '.html') text = text.replace(ATTR, (m, pre, q, ref) => stampRef(ref, m, (r) => `${pre}${q}${r}${q}`));
    if (ext === '.css') text = text.replace(CSS_IMPORT, (m, pre, q, ref) => stampRef(ref, m, (r) => `${pre}${q}${r}${q}`));
    if (ext !== '.css') {
      text = text.replace(NEW_URL, (m, pre, q, ref, post) => stampRef(ref, m, (r) => `${pre}${q}${r}${q}${post}`));
      text = text.replace(STRING, (m, q, ref) => stampRef(ref, m, (r) => `${q}${r}${q}`));
    }
    result.files++;
    if (text !== before) {
      writeFileSync(file, text);
      result.rewritten += changed;
    }
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [dir, version] = process.argv.slice(2);
  if (!dir || !version) {
    console.error('usage: node tools/stamp-version.mjs <site folder> <commit sha>');
    process.exit(2);
  }
  const r = stampSite(dir, version);
  console.log(`Stamped ${r.rewritten} references in ${r.files} files with ?v=${shortVersion(version)}.`);
  for (const u of r.unresolved) console.warn(`Not stamped (no such file): ${u.ref} in ${u.file}`);
}
