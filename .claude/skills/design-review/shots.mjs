// Design-review screenshots and measurements. Needs the site served on :4173 (`npm run serve`).
//   node .claude/skills/design-review/shots.mjs <out-dir> [YYYY-MM-DD]
// Run from the repo root. The date picks the daily puzzle (default: today in Sydney).
// Prints one JSON line per page and size; saves <size>-<page>.png (phone pages also get -full.png).
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { withAnswer } from '../../../tests/answers.js';

const out = process.argv[2];
if (!out) { console.error('usage: shots.mjs <out-dir> [YYYY-MM-DD]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const date = process.argv[3] || new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const URL0 = process.env.BASE || 'http://localhost:4173'; // BASE=http://localhost:4181 to review another checkout
const easy = JSON.parse(readFileSync('assets/levels/daily-easy.json', 'utf8'));
const dayIndex = Math.round((Date.parse(date) - Date.parse(easy.start)) / 86400000);
if (dayIndex < 0 || dayIndex >= easy.levels.length) { console.error(`no daily for ${date}`); process.exit(2); }

const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  lap1: { viewport: { width: 1366, height: 625 } },
  lap2: { viewport: { width: 1280, height: 585 } },
};
const FRAC = { R: [0.88, 0.5], D: [0.5, 0.88], L: [0.12, 0.5], U: [0.5, 0.12] };

const measure = (page) => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const small = [...document.querySelectorAll('button, a[href], [role=button], input, select')]
    // Board tiles aren't rule 4 targets (players tap the lines between them, sized by the board), so leave them out.
    .filter((e) => vis(e) && !e.closest('dialog:not([open])') && !e.closest('#board'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
    .map((e) => { const r = e.getBoundingClientRect(); return `${(e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`; });
  const cells = [...document.querySelectorAll('#board .cell')];
  const go = document.querySelector('#go');
  return {
    hScroll: document.documentElement.scrollWidth > innerWidth,
    small,
    boardFits: cells.length ? cells.every((c) => c.getBoundingClientRect().bottom <= innerHeight) : null,
    tryFits: go && vis(go) ? go.getBoundingClientRect().bottom <= innerHeight : null,
    dialogTop: (() => { const d = document.querySelector('dialog[open]'); return d ? d.scrollTop : null; })(),
  };
});

async function dismissHowTo(page) {
  // How to play opens only after the day's level has loaded, so wait for the board before looking for it.
  await page.locator('#board .cell').first().waitFor();
  await page.waitForTimeout(400);
  const b = page.getByRole('button', { name: "Let's trap him" });
  if (await b.isVisible().catch(() => false)) await b.click();
  await page.waitForTimeout(300);
}
async function placeAnswer(page, level) {
  for (const [x, y, d] of withAnswer(level).answer) {
    const t = page.locator(`#board .cell[data-x="${x}"][data-y="${y}"]`);
    await t.scrollIntoViewIfNeeded();
    const b = await t.boundingBox();
    await page.mouse.move(b.x + b.width * FRAC[d][0], b.y + b.height * FRAC[d][1]);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(120);
  }
}

const browser = await chromium.launch();
for (const [size, opts] of Object.entries(SIZES)) {
  const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce', timezoneId: 'Australia/Sydney' });
  const errors = [];
  const shot = async (page, name, setup) => {
    // "Failed to load resource" console lines carry no URL; requestfailed below reports the same failures with one.
    page.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
    page.on('requestfailed', (r) => !/fonts\.g/.test(r.url()) && errors.push(`${name}: failed ${r.url()}`));
    await setup(page);
    await page.waitForTimeout(500);
    console.log(JSON.stringify({ size, page: name, ...(await measure(page)) }));
    await page.screenshot({ path: `${out}/${size}-${name}.png` });
    if (size === 'phone') await page.screenshot({ path: `${out}/${size}-${name}-full.png`, fullPage: true });
    await page.close(); // pages in one context share storage; a page left open can interfere with the next
  };
  const fresh = () => ctx.newPage();
  const daily = (mode) => `${URL0}/daily/?mode=${mode}&date=${date}`;

  await shot(await fresh(), 'home', (p) => p.goto(`${URL0}/`));
  await shot(await fresh(), 'select', (p) => p.goto(`${URL0}/play/`));
  await shot(await fresh(), 'level', (p) => p.goto(`${URL0}/play/?level=1`));
  await shot(await fresh(), 'howto', (p) => p.goto(daily('easy')));
  await shot(await fresh(), 'easy', async (p) => { await p.goto(daily('easy')); await dismissHowTo(p); });
  await shot(await fresh(), 'hard', async (p) => { await p.goto(daily('hard')); await dismissHowTo(p); });
  await shot(await fresh(), 'win', async (p) => {
    await p.goto(daily('easy')); await p.evaluate(() => localStorage.clear()); await p.reload(); await dismissHowTo(p);
    await placeAnswer(p, easy.levels[dayIndex]);
    await p.locator('#go').click(); await p.waitForTimeout(2500); await p.evaluate(() => scrollTo(0, 0));
  });
  await shot(await fresh(), 'loss', async (p) => {
    await p.goto(daily('hard')); await dismissHowTo(p);
    await p.locator('#go').click(); await p.waitForTimeout(2500); await p.evaluate(() => scrollTo(0, 0));
  });
  if (errors.length) console.log(JSON.stringify({ size, errors }));
  await ctx.close();
}
await browser.close();
