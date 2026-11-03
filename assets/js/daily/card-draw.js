// Draws the 1080x1080 score card from cardModel's output (card.js). DOM only; the layout choices are tested in
// tools/daily-card.test.js. Sprites load by relative URL from this site, so the canvas is never tainted and
// toBlob works. No board and no fences on the card: that would be a spoiler.

export const CARD_SIZE = 1080;

const C = {
  page: '#e3ecd2',
  panel: '#f8fbf1',
  grid: '#c9d7b2',
  chalk: '#2f4220',
  muted: '#5d6e4c',
  outline: '#3b2618',
  gold: '#e9b949', // the hint colour, for the bulb
  flame: '#e8833a', // the streak flame; not one of the meaning colours
  flameCore: '#f4a640',
};
const DISPLAY = '"Grandstander", "Trebuchet MS", system-ui, sans-serif';
const BODY = '"Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
const LEFT = 96; // the left edge of the text column
const COLUMN = 560; // text on the lower lines stays left of the toad

const SPRITE_BASE = new URL('../../sprites/', import.meta.url);
const images = new Map();

/** A sprite as an image, loaded once. Same origin, so drawing it leaves the canvas clean. */
function loadSprite(name) {
  if (!images.has(name)) {
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`sprite ${name}.svg did not load`));
      img.src = new URL(`${name}.svg`, SPRITE_BASE).href;
    });
    p.catch(() => images.delete(name)); // try again next time
    images.set(name, p);
  }
  return images.get(name);
}

/** Wait for the web fonts, but draw anyway after 1.5 s (offline, blocked, slow). */
async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  const loads = Promise.all([
    document.fonts.load('800 100px Grandstander'),
    document.fonts.load('600 52px Grandstander'),
    document.fonts.load('700 40px Nunito'),
  ]).catch(() => {});
  await Promise.race([loads, new Promise((r) => setTimeout(r, 1500))]);
}

/** Shrink a font size until `text` fits `maxWidth`. */
function fit(ctx, text, weight, family, size, maxWidth) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 20 && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** The hint bulb, drawn (not an emoji): a gold glass on a cream base, outlined. Drawn in a 100-unit box scaled to `s`, top-left at x, y; about 0.92 * s tall. */
function drawBulb(ctx, x, y, s) {
  const k = s / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = C.outline;
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(50, 40, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.panel;
  roundRect(ctx, 36, 70, 28, 22, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath(); // a little shine
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.panel;
  ctx.arc(50, 40, 19, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
}

/** The streak flame, drawn. */
function drawFlame(ctx, x, y, s) {
  const k = s / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = C.outline;
  ctx.fillStyle = C.flame;
  ctx.beginPath();
  ctx.moveTo(52, 4);
  ctx.bezierCurveTo(56, 30, 86, 42, 86, 68);
  ctx.bezierCurveTo(86, 88, 70, 98, 50, 98);
  ctx.bezierCurveTo(30, 98, 14, 86, 14, 66);
  ctx.bezierCurveTo(14, 48, 28, 40, 30, 22);
  ctx.bezierCurveTo(40, 30, 44, 36, 46, 44);
  ctx.bezierCurveTo(52, 34, 54, 20, 52, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.flameCore;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(50, 56);
  ctx.bezierCurveTo(60, 66, 68, 72, 66, 82);
  ctx.bezierCurveTo(64, 90, 56, 92, 50, 92);
  ctx.bezierCurveTo(42, 92, 34, 88, 34, 78);
  ctx.bezierCurveTo(34, 68, 46, 66, 50, 56);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draw the card for a cardModel(...) result and resolve to a PNG Blob. */
export async function drawCard(model) {
  const [, icon, toad] = await Promise.all([fontsReady(), loadSprite('icon-gnome'), loadSprite(model.toad)]);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Garden background, then a cream panel with the outline like every card on the site.
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 8;
  ctx.fillStyle = C.panel;
  roundRect(ctx, 36, 36, CARD_SIZE - 72, CARD_SIZE - 72, 56);
  ctx.fill();
  ctx.stroke();

  // 1. Wordmark
  ctx.drawImage(icon, LEFT, 84, 84, 84);
  ctx.fillStyle = C.chalk;
  fit(ctx, model.wordmark, 800, DISPLAY, 56, CARD_SIZE - LEFT - 84 - 20 - 96);
  ctx.fillText(model.wordmark, LEFT + 84 + 20, 142);

  // 2. #N Mode
  ctx.fillStyle = C.muted;
  fit(ctx, model.title, 600, DISPLAY, 54, CARD_SIZE - 2 * LEFT);
  ctx.fillText(model.title, LEFT, 262);

  // 3. The score, large, with the hint bulb beside it
  const bulb = model.hint ? 140 : 0;
  const gap = model.hint ? 28 : 0;
  const size = fit(ctx, model.score, 800, DISPLAY, 210, CARD_SIZE - 2 * LEFT - bulb - gap);
  ctx.fillStyle = C.chalk;
  ctx.fillText(model.score, LEFT, 262 + 40 + size * 0.78);
  const scoreBase = 262 + 40 + size * 0.78;
  if (model.hint) {
    const w = ctx.measureText(model.score).width;
    drawBulb(ctx, LEFT + w + gap, scoreBase - size * 0.78 + (size * 0.78 - bulb) / 2 + 6, bulb);
  }

  // 4. One square per try
  const sq = 92;
  const sqGap = 20;
  const sqY = scoreBase + 58;
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.outline;
  model.squares.forEach((s, i) => {
    ctx.fillStyle = s.color;
    roundRect(ctx, LEFT + 3 + i * (sq + sqGap), sqY, sq, sq, 20);
    ctx.fill();
    ctx.stroke();
  });

  // 5. Caption
  let y = sqY + sq + 92;
  ctx.fillStyle = C.chalk;
  fit(ctx, model.caption, 800, DISPLAY, 64, COLUMN);
  ctx.fillText(model.caption, LEFT, y);

  // 6. Beat and streak
  if (model.beat) {
    y += 68;
    ctx.fillStyle = C.muted;
    fit(ctx, model.beat, 700, BODY, 44, COLUMN);
    ctx.fillText(model.beat, LEFT, y);
  }
  if (model.streak) {
    y += 76;
    drawFlame(ctx, LEFT, y - 50, 58);
    ctx.fillStyle = C.chalk;
    fit(ctx, model.streak, 700, BODY, 44, COLUMN - 78);
    ctx.fillText(model.streak, LEFT + 76, y);
  }

  // 7. Sir Croakwell, bottom right, front view
  const th = 400;
  const tw = (th * 390) / 460;
  ctx.drawImage(toad, CARD_SIZE - 64 - tw, CARD_SIZE - 62 - th, tw, th);

  // 8. Footer
  ctx.fillStyle = C.muted;
  fit(ctx, model.footer, 700, BODY, 40, COLUMN);
  ctx.fillText(model.footer, LEFT, CARD_SIZE - 92);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the card could not be made into a PNG'))), 'image/png');
  });
}

/** Offer a Blob as a file download (the Save image button). */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
