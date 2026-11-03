// Renders the link-preview image: assets/og/daily.png (1200x630), from the existing sprites.
//   node tools/build-og.mjs      (or: npm run build:og)
// Generated, never hand-edited (docs/DAILY_SPEC.md, "v3.2"). Uses Playwright's Chromium, so run
// `npx playwright install chromium` once. The web fonts come from Google Fonts; with no network the page falls
// back to system fonts, so run this with a connection before committing a new image.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}assets/og/daily.png`;
const W = 1200;
const H = 630;

/** A sprite as a data URI, so the composition needs no server. */
const sprite = (name) => `data:image/svg+xml;base64,${readFileSync(`${root}assets/sprites/${name}.svg`).toString('base64')}`;

// Same tokens as assets/css/site.css; outline is #3b2618, never black.
const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Grandstander:wght@600;800&family=Nunito:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root { --page:#e3ecd2; --panel:#f8fbf1; --grid:#c9d7b2; --chalk:#2f4220; --muted:#5d6e4c; --outline:#3b2618; --grass:#8cbf5a; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; background: var(--page); overflow: hidden; }
  .frame { position: absolute; inset: 24px; background: var(--panel); border: 8px solid var(--outline); border-radius: 48px; }
  .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 120px; background: var(--grass); border-top: 6px solid var(--outline); border-radius: 0 0 40px 40px; opacity: .55; }
  .mark { position: absolute; left: 80px; top: 76px; display: flex; align-items: center; gap: 20px; font: 800 38px "Grandstander", "Trebuchet MS", system-ui, sans-serif; color: var(--muted); }
  .mark img { width: 64px; height: 64px; }
  h1 { position: absolute; left: 80px; top: 176px; font: 800 88px/1.04 "Grandstander", "Trebuchet MS", system-ui, sans-serif; color: var(--chalk); letter-spacing: -1px; }
  .tag { position: absolute; left: 82px; top: 372px; font: 700 40px "Nunito", system-ui, sans-serif; color: var(--muted); }
  .scene { position: absolute; left: 80px; bottom: 56px; width: 640px; height: 130px; }
  .scene img { position: absolute; }
  .toad { position: absolute; right: 64px; bottom: 36px; height: 430px; }
</style></head>
<body>
  <div class="frame"><div class="ground"></div></div>
  <div class="mark"><img src="${sprite('icon-gnome')}" alt=""></div>
  <h1>Gnome<br>Sweet Gnome</h1>
  <p class="tag">One new fence puzzle a day</p>
  <div class="scene">
    <img src="${sprite('gnome-right-idle')}" style="left:0;bottom:0;height:130px" alt="">
    <img src="${sprite('wall-v')}" style="left:190px;bottom:6px;height:108px" alt="">
    <img src="${sprite('wall-v')}" style="left:270px;bottom:6px;height:108px" alt="">
    <img src="${sprite('wall-v')}" style="left:350px;bottom:6px;height:108px" alt="">
    <img src="${sprite('tile-house')}" style="left:460px;bottom:0;height:130px" alt="">
  </div>
  <img class="toad" src="${sprite('toad-front-point')}" alt="">
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' }).catch(() => {});
  await Promise.race([page.evaluate(() => document.fonts.ready), new Promise((r) => setTimeout(r, 4000))]);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  mkdirSync(`${root}assets/og`, { recursive: true });
  await page.screenshot({ path: OUT, type: 'png', animations: 'disabled', clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
