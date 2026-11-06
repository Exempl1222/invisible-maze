// Builds every Gnome Sweet Gnome sprite as its own self-contained SVG in assets/sprites/.
// One source of truth: change a shape or colour here, run `node tools/build-sprites.mjs`,
// and every file plus manifest.json is regenerated. No dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'sprites');
mkdirSync(OUT, { recursive: true });

/* ---------- palette (also documented in docs/ART_SPEC.md) ---------- */
const C = {
  ink: '#3b2618',
  skin: '#f4c7a4', skin2: '#e2a684', ear: '#e39b84', ear2: '#d68c75', blush: '#ee9a86',
  nose: '#e8917a', nose2: '#d27762', noseHi: '#f6c0ae',
  beard: '#f6f3ed', beard2: '#dcd5c9', strand: '#cbc2b3', mouth: '#7a2e22',
  hat: '#c94a32', hat2: '#a8382a', hat3: '#8f2e22', hatHi: '#e57a60',
  tunic: '#4f7a3a', tunic2: '#3c5f2b', belt: '#5a3a22', buckle: '#e9b949',
  trousers: '#7a5230', trousers2: '#644225', boot: '#6b4226', boot2: '#55331d',
  pouch: '#8d5d38', pouch2: '#74492a',
  grass: '#8cbf5a', grassTuft: '#6e9e44', daisy: '#f6f3ed', buttercup: '#f2d35b',
  stone: '#9aa3a6', stone2: '#7c8588', stoneHi: '#c4cbcd', stoneLine: '#6b7477', moss: '#6f9a3f', mossHi: '#86b84e',
  bush: '#3f7a34', bush2: '#2f6128', bushHi: '#6aa04c', berry: '#7a5bd0',
  water: '#5aa9d6', water2: '#4892c0', ripple: '#bfe3f4',
  log: '#a0703f', log2: '#86592f', logEnd: '#d9a066',
  bark: '#7b5434', bark2: '#5f3f25', heart: '#d9a066', ring: '#b07a45', hollow: '#140d0a',
  stake: '#c48a52', stake2: '#a87140', rail: '#8d5d38', soil: '#7a5230', soil2: '#644225', dust: '#d9c9a8',
  ribbon: '#e9b949', ribbon2: '#c9962a',
  cap: '#c94a32', cap2: '#a8382a', stem: '#f2e6cf', stem2: '#dccbab', door: '#8d5d38',
  shadow: '#2d4a1f',
};
const GLOW = { a: '#5ff0d8', b: '#c79bff', c: '#ffcf5a' }; // teleporter pairs 1, 2, 3

/* ---------- drawing helpers ---------- */
// Every id in a file starts with that file's prefix, and every CSS rule is scoped to the
// sprite's root class, so many sprites can be inlined into one page without clashing.
let cid = 0;
let PFX = 'gsg-';
const O = (w) => `stroke="${C.ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/** A filled shape with a clipped shade and an outline on top. */
function part(d, fill, shade, shadeFill, w = 2.2) {
  const id = PFX + (++cid);
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${fill}"/>` +
    (shade ? `<g clip-path="url(#${id})"><path d="${shade}" fill="${shadeFill}"/></g>` : '') +
    `<path d="${d}" fill="none" ${O(w)}/>`;
}
const T = 1.8; // tile outline width

/* ---------- the gnome ---------- */
function bodyFront(back) {
  return `
  <g class="boot-l">${part('M36 131 C34 124 38 119 46 119 C52 119 55 123 55 131 Z', C.boot, 'M46 126 H60 V135 H40 Z', C.boot2)}</g>
  <g class="boot-r">${part('M65 131 C65 123 68 119 74 119 C82 119 86 124 84 131 Z', C.boot, 'M74 126 H90 V135 H70 Z', C.boot2)}</g>
  ${part('M44 112 L76 112 L76 122 L66 122 L64 117 L56 117 L54 122 L44 122 Z', C.trousers, 'M64 110 H80 V125 H64 Z', C.trousers2)}
  ${part('M42 82 C35 94 33 108 35 118 C46 121 74 121 85 118 C87 108 85 94 78 82 Z', C.tunic, 'M70 80 C80 92 82 106 80 122 L92 122 L92 80 Z', C.tunic2)}
  ${part('M35 104 C50 107 70 107 85 104 L85 111 C70 114 50 114 35 111 Z', C.belt)}
  ${back
    ? part('M39 108 H50 V116 C50 118 49 119 47 119 H42 C40 119 39 118 39 116 Z', C.pouch, 'M45 106 H53 V121 H45 Z', C.pouch2, 1.8) +
      `<path d="M60 84 V104" stroke="${C.tunic2}" stroke-width="1.6" stroke-linecap="round"/>`
    : part('M70 108 H81 V116 C81 118 80 119 78 119 H73 C71 119 70 118 70 116 Z', C.pouch, 'M76 106 H84 V121 H76 Z', C.pouch2, 1.8) +
      `<rect x="55" y="103" width="10" height="10" rx="1.5" fill="${C.buckle}" ${O(1.8)}/><rect x="58" y="106" width="4" height="4" fill="${C.belt}"/>`}
  <g class="arm-l">
    ${part('M46 84 C38 88 31 97 30 105 C33 108 38 108 40 106 C41 99 45 94 49 92 Z', C.tunic, 'M28 100 H44 V112 H28 Z', C.tunic2)}
    ${part('M29 107 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', C.skin, 'M35 108 a6 6 0 0 0 8 4 V116 H30 Z', C.skin2)}
  </g>
  <g class="arm-r">
    ${part('M74 84 C82 88 89 97 90 105 C87 108 82 108 80 106 C79 99 75 94 71 92 Z', C.tunic, 'M80 96 H94 V112 H80 Z', C.tunic2)}
    ${part('M79 107 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', C.skin, 'M85 108 a6 6 0 0 0 8 4 V116 H80 Z', C.skin2)}
  </g>`;
}
const ears = () => `${part('M43 62 C35 60 29 54 29 50 C35 50 41 54 45 57 Z', C.skin)}
  <path d="M38 56 C35 55 33 53 33 52 C36 52 39 54 41 56 Z" fill="${C.ear}"/>
  ${part('M77 62 C85 60 91 54 91 50 C85 50 79 54 75 57 Z', C.skin, 'M80 52 L95 48 L95 64 L76 62 Z', C.skin2)}
  <path d="M82 56 C85 55 87 53 87 52 C84 52 81 54 79 56 Z" fill="${C.ear2}"/>`;
const hatBand = () => part('M36 52 C52 47 68 47 84 52 L84 59 C68 54 52 54 36 59 Z', C.hat2, 'M68 46 H90 V62 H68 Z', C.hat3, 2);
function headFront() {
  return `<g class="head">${ears()}
    ${part('M41 64 a19 18 0 1 0 38 0 a19 18 0 1 0 -38 0', C.skin, 'M70 44 C78 54 78 72 66 86 L90 86 L90 44 Z', C.skin2)}
    <circle cx="47" cy="69" r="4.5" fill="${C.blush}" opacity=".55"/><circle cx="73" cy="69" r="4.5" fill="${C.blush}" opacity=".55"/>
    <g class="eyes">
      <ellipse cx="52" cy="61" rx="3.6" ry="4.2" fill="#fff" ${O(1.5)}/><circle cx="52.7" cy="61.8" r="2.2" fill="#2b1a10"/><circle cx="53.5" cy="60.8" r=".8" fill="#fff"/>
      <ellipse cx="68" cy="61" rx="3.6" ry="4.2" fill="#fff" ${O(1.5)}/><circle cx="67.3" cy="61.8" r="2.2" fill="#2b1a10"/><circle cx="68.1" cy="60.8" r=".8" fill="#fff"/>
    </g>
    <g class="brows">
      ${part('M44 55 C47 50 54 49 58 53 C54 53 49 54 45 57 Z', C.beard, null, null, 1.6)}
      ${part('M76 55 C73 50 66 49 62 53 C66 53 71 54 75 57 Z', C.beard, 'M68 48 H80 V58 H68 Z', C.beard2, 1.6)}
    </g>
    ${part('M40 66 C37 82 42 98 50 106 C53 103 56 107 60 111 C64 107 67 103 70 106 C78 98 83 82 80 66 C75 75 67 79 60 79 C53 79 45 75 40 66 Z', C.beard, 'M66 76 C74 74 80 68 84 64 L84 112 L64 112 C70 100 70 88 66 76 Z', C.beard2)}
    <path d="M50 85 C51 92 53 98 55 102 M60 84 V104 M70 85 C69 92 67 98 65 102 M45 80 C45 86 47 92 49 96" fill="none" stroke="${C.strand}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M55 79 Q60 85 65 79 Z" fill="${C.mouth}" ${O(1.5)}/>
    ${part('M60 73 C54 70 45 71 42 78 C48 79 54 78 60 76 C66 78 72 79 78 78 C75 71 66 70 60 73 Z', C.beard, 'M40 76 H80 V82 H40 Z', C.beard2, 1.8)}
    ${part('M53 69 a7 6.5 0 1 0 14 0 a7 6.5 0 1 0 -14 0', C.nose, 'M62 70 a7 6.5 0 0 0 7 -2 V80 H58 Z', C.nose2, 1.8)}
    <ellipse cx="57.5" cy="66.5" rx="2" ry="1.4" fill="${C.noseHi}"/>
    ${part('M38 54 C36 34 44 18 58 12 C70 7 84 10 91 20 C95 27 94 36 88 36 C84 36 82 31 79 29 C82 37 83 46 82 54 C68 50 52 50 38 54 Z', C.hat, 'M66 8 C78 12 86 24 84 56 L100 56 L100 0 L66 0 Z', C.hat2)}
    <path d="M50 46 C50 36 54 26 60 19 M67 47 C69 39 72 32 77 27" fill="none" stroke="${C.hat2}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M45 42 C45 33 49 25 55 19" fill="none" stroke="${C.hatHi}" stroke-width="2.4" stroke-linecap="round"/>
    ${hatBand()}
  </g>`;
}
function headBack() {
  return `<g class="head">
    ${part('M40 70 C38 80 40 88 45 93 C47 86 47 78 45 70 Z', C.beard, null, null, 1.8)}
    ${part('M80 70 C82 80 80 88 75 93 C73 86 73 78 75 70 Z', C.beard, 'M74 70 H86 V96 H74 Z', C.beard2, 1.8)}
    ${ears()}
    ${part('M41 64 a19 18 0 1 0 38 0 a19 18 0 1 0 -38 0', C.beard, 'M68 44 C78 54 78 72 66 86 L90 86 L90 44 Z', C.beard2)}
    <path d="M50 70 C51 74 52 78 54 80 M60 70 V81 M70 70 C69 74 68 78 66 80" fill="none" stroke="${C.strand}" stroke-width="1.4" stroke-linecap="round"/>
    ${part('M82 54 C84 34 76 18 62 12 C50 7 36 10 29 20 C25 27 26 36 32 36 C36 36 38 31 41 29 C38 37 37 46 38 54 C52 50 68 50 82 54 Z', C.hat, 'M66 10 C78 16 84 30 84 56 L100 56 L100 0 L66 0 Z', C.hat2)}
    <path d="M70 46 C70 36 66 26 60 19 M53 47 C51 39 48 32 43 27" fill="none" stroke="${C.hat2}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M46 42 C47 33 50 25 54 20" fill="none" stroke="${C.hatHi}" stroke-width="2.4" stroke-linecap="round"/>
    ${hatBand()}
  </g>`;
}
function side() {
  const boot = 'M50 132 C49 125 52 121 58 121 C64 121 69 125 73 129 C74 131 73 132 71 132 Z';
  return `
  <g class="boot-l"><g transform="translate(-8 -1)">${part(boot, C.boot2)}</g></g>
  <g class="arm-l">
    ${part('M53 84 C51 92 51 100 53 106 C56 108 59 108 60 106 C60 98 60 92 59 86 Z', C.tunic2)}
    ${part('M51 108 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0', C.skin2)}
  </g>
  <g class="boot-r">${part(boot, C.boot, 'M62 126 H78 V134 H62 Z', C.boot2)}</g>
  ${part('M50 112 H70 V123 H50 Z', C.trousers, 'M62 110 H72 V125 H62 Z', C.trousers2)}
  ${part('M47 82 C41 94 40 108 42 118 C52 121 68 121 78 118 C80 108 78 94 73 82 Z', C.tunic, 'M66 80 C74 92 76 106 74 122 L90 122 L90 80 Z', C.tunic2)}
  ${part('M41 104 C54 107 66 107 79 104 L79 111 C66 114 54 114 41 111 Z', C.belt)}
  ${part('M37 107 H47 V115 C47 117 46 118 44 118 H40 C38 118 37 117 37 115 Z', C.pouch, 'M43 105 H50 V120 H43 Z', C.pouch2, 1.8)}
  <rect x="70" y="103.5" width="7" height="9" rx="1.2" fill="${C.buckle}" ${O(1.6)}/>
  <g class="arm-r">
    ${part('M58 84 C56 92 56 100 58 106 C61 108 65 108 66 106 C66 98 66 92 65 86 Z', C.tunic, 'M62 80 H70 V110 H62 Z', C.tunic2)}
    ${part('M56 109 a5.5 5.5 0 1 0 11 0 a5.5 5.5 0 1 0 -11 0', C.skin, 'M62 110 a5.5 5.5 0 0 0 6 3 V118 H56 Z', C.skin2)}
  </g>
  <g class="head">
    ${part('M47 60 C41 57 36 51 37 47 C42 49 47 53 50 57 Z', C.skin)}
    <path d="M43 55 C40 53 39 51 39 50 C42 51 44 53 46 55 Z" fill="${C.ear}"/>
    ${part('M44 64 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0', C.skin, 'M70 46 C80 56 80 72 68 84 L90 84 L90 46 Z', C.skin2)}
    <circle cx="68" cy="70" r="4" fill="${C.blush}" opacity=".55"/>
    <g class="eyes"><ellipse cx="71" cy="61" rx="3" ry="4" fill="#fff" ${O(1.5)}/><circle cx="72.4" cy="61.8" r="2" fill="#2b1a10"/><circle cx="73" cy="60.8" r=".7" fill="#fff"/></g>
    <g class="brows">${part('M64 55 C67 50 74 50 78 54 C74 54 69 55 65 57 Z', C.beard, null, null, 1.6)}</g>
    ${part('M50 68 C47 82 53 98 64 106 C68 103 72 105 75 101 C81 91 82 80 80 72 C74 78 64 78 56 74 Z', C.beard, 'M70 76 C78 74 82 70 84 68 L84 110 L66 110 C72 98 72 86 70 76 Z', C.beard2)}
    <path d="M58 84 C59 92 61 98 64 102 M67 84 C67 92 68 97 70 101 M53 78 C53 84 55 90 57 94" fill="none" stroke="${C.strand}" stroke-width="1.4" stroke-linecap="round"/>
    ${part('M81 72 C75 70 67 72 64 79 C70 80 77 79 83 78 C86 77 85 73 81 72 Z', C.beard, 'M60 77 H90 V84 H60 Z', C.beard2, 1.8)}
    ${part('M75 68 a7 6.5 0 1 0 14 0 a7 6.5 0 1 0 -14 0', C.nose, 'M83 70 a7 6.5 0 0 0 7 -2 V80 H78 Z', C.nose2, 1.8)}
    <ellipse cx="79.5" cy="65.5" rx="2" ry="1.4" fill="${C.noseHi}"/>
    ${part('M42 56 C41 44 42 34 44 26 C40 30 36 34 32 34 C27 32 28 24 34 18 C40 12 50 9 58 10 C70 12 78 26 82 52 C70 48 54 50 42 56 Z', C.hat, 'M62 8 C74 14 80 28 84 56 L100 56 L100 0 L62 0 Z', C.hat2)}
    <path d="M53 48 C53 38 55 28 58 20 M68 48 C68 38 66 28 63 20" fill="none" stroke="${C.hat2}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M48 44 C47 36 48 28 51 21" fill="none" stroke="${C.hatHi}" stroke-width="2.4" stroke-linecap="round"/>
    ${part('M41 52 C54 46 70 44 83 48 L84 56 C70 52 56 53 42 59 Z', C.hat2, 'M70 40 H90 V62 H70 Z', C.hat3, 2)}
  </g>`;
}

const GNOME_CSS = `
*{transform-box:view-box}
.rig{transform-origin:60px 131px}.head{transform-origin:60px 84px}
.eyes{transform-origin:60px 61px}.brows{transform-origin:60px 54px}
.arm-l{transform-origin:46px 88px}.arm-r{transform-origin:74px 88px}
.boot-l{transform-origin:46px 131px}.boot-r{transform-origin:74px 131px}
.side .arm-l{transform-origin:56px 86px}.side .arm-r{transform-origin:62px 86px}
.side .eyes{transform-origin:71px 61px}.side .brows{transform-origin:71px 54px}
.side .boot-l,.side .boot-r{transform-origin:60px 131px}
.idle .rig{animation:breathe 2.4s ease-in-out infinite}
.idle .head{animation:ponder 4.8s ease-in-out infinite}
.idle .eyes,.walk .eyes{animation:blink 4.2s infinite}
@keyframes breathe{50%{transform:translateY(-1.2px) scale(1,1.015)}}
@keyframes ponder{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
.walk .rig{animation:bob .6s ease-in-out infinite}
.walk .boot-l{animation:stepA .6s ease-in-out infinite}
.walk .boot-r{animation:stepB .6s ease-in-out infinite}
.walk .arm-l,.walk .arm-r{animation:swing .6s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0) rotate(-2.5deg)}25%,75%{transform:translateY(-3px) rotate(0)}50%{transform:translateY(0) rotate(2.5deg)}}
@keyframes stepA{0%,50%,100%{transform:translateY(0)}25%{transform:translateY(-5px) rotate(-8deg)}}
@keyframes stepB{0%,50%,100%{transform:translateY(0)}75%{transform:translateY(-5px) rotate(8deg)}}
@keyframes swing{0%,100%{transform:rotate(18deg)}50%{transform:rotate(-16deg)}}
.side.walk .rig{animation:bobS .6s ease-in-out infinite}
.side.walk .boot-l{animation:stride .6s ease-in-out infinite}
.side.walk .boot-r{animation:stride .6s ease-in-out infinite;animation-delay:-.3s}
.side.walk .arm-l{animation:swingS .6s ease-in-out infinite;animation-delay:-.3s}
.side.walk .arm-r{animation:swingS .6s ease-in-out infinite}
@keyframes bobS{0%,50%,100%{transform:translateY(0) rotate(3deg)}25%,75%{transform:translateY(-3px) rotate(4deg)}}
@keyframes stride{0%,100%{transform:translateX(7px)}25%{transform:translate(0,-4px)}50%{transform:translateX(-7px)}75%{transform:translate(0,0)}}
@keyframes swingS{0%,100%{transform:rotate(-26deg)}50%{transform:rotate(24deg)}}
.shrug .arm-l{animation:shrugL 2.2s ease-in-out infinite}
.shrug .arm-r{animation:shrugR 2.2s ease-in-out infinite}
.shrug .head{animation:sink 2.2s ease-in-out infinite}
.shrug .brows{animation:brows 2.2s ease-in-out infinite}
.side.shrug .arm-l,.side.shrug .arm-r{animation:shrugS 2.2s ease-in-out infinite}
@keyframes shrugL{0%,15%,85%,100%{transform:rotate(0)}35%,65%{transform:rotate(64deg)}}
@keyframes shrugR{0%,15%,85%,100%{transform:rotate(0)}35%,65%{transform:rotate(-64deg)}}
@keyframes shrugS{0%,15%,85%,100%{transform:rotate(0)}35%,65%{transform:rotate(-78deg)}}
@keyframes sink{0%,15%,85%,100%{transform:translateY(0) rotate(0)}35%,65%{transform:translateY(3px) rotate(-7deg)}}
@keyframes brows{0%,15%,85%,100%{transform:translateY(0)}35%,65%{transform:translateY(-3px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

/** Gnome on a square 140 canvas. Feet anchor at (70, 131). */
function gnomeSvg(dir, state) {
  cid = 0;
  PFX = `gsg-g${dir[0]}${state[0]}-`;
  const isSide = dir === 'left' || dir === 'right';
  const inner = isSide ? side() : bodyFront(dir === 'up') + (dir === 'up' ? headBack() : headFront());
  const body = `<ellipse cx="60" cy="131" rx="30" ry="5" fill="${C.shadow}" opacity=".22"/><g class="rig">${inner}</g>`;
  const place = dir === 'left' ? 'translate(130 0) scale(-1 1)' : 'translate(10 0)';
  return svgDoc(140, 140, GNOME_CSS,
    `<g class="${state} ${isSide ? 'side' : dir}"><g transform="${place}">${body}</g></g>`,
    `Gnome, ${state}, facing ${dir}`, 'gsg-gnome');
}

/* ---------- tiles (64 x 64, full bleed) ---------- */
const GRASS_TUFTS = [
  'M9 18 l2 -5 l2 5 M44 12 l2 -5 l2 5 M14 48 l2 -5 l2 5 M48 44 l2 -5 l2 5 M30 30 l2 -4 l2 4',
  'M16 10 l2 -5 l2 5 M50 24 l2 -5 l2 5 M8 36 l2 -5 l2 5 M36 52 l2 -5 l2 5',
  'M24 14 l2 -5 l2 5 M42 38 l2 -5 l2 5 M10 54 l2 -5 l2 5 M54 52 l2 -4 l2 4 M28 40 l2 -4 l2 4',
];
const GRASS_DOTS = [
  [[24, 54, C.daisy], [54, 24, C.buttercup]],
  [[40, 14, C.daisy], [20, 44, C.daisy], [56, 40, C.buttercup]],
  [[12, 26, C.buttercup]],
];
const grass = (v = 0) => `<rect width="64" height="64" fill="${C.grass}"/>
  <path d="${GRASS_TUFTS[v]}" fill="none" stroke="${C.grassTuft}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
  GRASS_DOTS[v].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${c}"/>`).join('');
const rock = () => part('M10 50 C8 36 18 22 32 20 C46 18 56 30 56 44 C56 52 48 56 32 56 C18 56 12 54 10 50 Z', C.stone, 'M38 26 C50 32 52 46 44 56 L60 60 L60 20 Z', C.stone2, T) +
  `<path d="M18 34 C20 28 26 24 31 24" fill="none" stroke="${C.stoneHi}" stroke-width="2.4" stroke-linecap="round"/>
   <path d="M14 48 C16 44 22 44 26 46 C24 50 18 51 14 48 Z" fill="${C.moss}"/><path d="M34 40 L40 36 M36 46 L42 44" stroke="${C.stoneLine}" stroke-width="1.4" stroke-linecap="round"/>`;
const bush = () => part('M8 50 C4 42 8 32 18 32 C18 22 30 16 38 22 C46 18 58 26 54 36 C62 40 60 54 50 54 L14 54 C11 54 9 52 8 50 Z', C.bush, 'M36 36 C48 38 52 46 48 56 L64 58 L64 30 Z', C.bush2, T) +
  `<path d="M16 38 C18 34 22 32 26 33 M30 25 C33 22 37 22 40 24" fill="none" stroke="${C.bushHi}" stroke-width="2.2" stroke-linecap="round"/>` +
  [[24, 44], [42, 42], [34, 49], [30, 38]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${C.berry}" stroke="${C.ink}" stroke-width="1"/>`).join('');
/** Seamless water: nothing touches the edges, so river tiles join in any direction. */
const river = () => `<rect width="64" height="64" fill="${C.water}"/>
  <path d="M40 4 C46 16 42 30 48 40 C52 48 50 56 52 60 L60 60 L60 4 Z" fill="${C.water2}" opacity=".6"/>
  <path d="M12 12 q4 -3 8 0 M34 22 q4 -3 8 0 M14 38 q4 -3 8 0 M38 50 q3 -2 6 0 M50 32 q3 -2 6 0" fill="none" stroke="${C.ripple}" stroke-width="2" stroke-linecap="round"/>`;
/** Logs run left to right: the gnome walks left and right across it (river runs up and down). */
const bridgeLogs = () =>
  part('M4 22 H60 C63 22 63 31 60 31 H4 C1 31 1 22 4 22 Z', C.log, 'M4 28 H64 V34 H0 Z', C.log2, T) +
  part('M4 33 H60 C63 33 63 42 60 42 H4 C1 42 1 33 4 33 Z', C.log, 'M4 39 H64 V45 H0 Z', C.log2, T) +
  `<ellipse cx="4.5" cy="26.5" rx="2.6" ry="4" fill="${C.logEnd}" ${O(1.4)}/><ellipse cx="4.5" cy="37.5" rx="2.6" ry="4" fill="${C.logEnd}" ${O(1.4)}/>
   <path d="M12 26 H40 M20 37 H52" stroke="${C.log2}" stroke-width="1.4" stroke-linecap="round"/>
   <path d="M30 20 V44" stroke="${C.belt}" stroke-width="2.4" stroke-linecap="round"/>`;
const house = () => part('M24 34 H40 V56 H24 Z', C.stem, 'M33 34 H44 V58 H33 Z', C.stem2, T) +
  `<path d="M28 56 V47 a4 4 0 0 1 8 0 V56 Z" fill="${C.door}" ${O(1.6)}/><circle cx="34" cy="51.5" r=".9" fill="${C.buckle}"/>` +
  part('M6 36 C6 18 20 8 32 8 C44 8 58 18 58 36 C50 39 14 39 6 36 Z', C.cap, 'M40 8 C52 14 56 24 56 40 L64 40 L64 0 Z', C.cap2, T) +
  `<circle cx="20" cy="22" r="3.2" fill="${C.daisy}"/><circle cx="34" cy="16" r="2.4" fill="${C.daisy}"/><circle cx="44" cy="26" r="3.6" fill="${C.daisy}"/><circle cx="30" cy="29" r="2" fill="${C.daisy}"/>
   <circle class="lamp" cx="32" cy="42" r="2.6" fill="${C.buttercup}" ${O(1.2)}/>`;
const startMark = () => `<ellipse cx="32" cy="46" rx="18" ry="7" fill="${C.soil}" opacity=".35"/>` +
  [[20, 44], [32, 48], [44, 44], [26, 40], [38, 40]].map(([x, y]) => part(`M${x - 4} ${y} a4 2.6 0 1 0 8 0 a4 2.6 0 1 0 -8 0`, C.stone, null, null, 1.2)).join('');

/* ---------- hollow stump teleporter ---------- */
const STUMP_CSS = `
*{transform-box:view-box}
.swirl{transform-origin:0 0;animation:spin 3.2s linear infinite}
.rune{animation:glow 2.6s ease-in-out infinite;filter:drop-shadow(0 0 1.6px currentColor)}
.aura{transform-box:fill-box;transform-origin:center;animation:aura 2.6s ease-in-out infinite}
.beam{animation:beam 2.6s ease-in-out infinite}
.shroom{filter:drop-shadow(0 0 2.5px currentColor)}
.mote{transform-box:fill-box;animation:mote 2.8s ease-out infinite both}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes glow{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes aura{0%,100%{opacity:.18;transform:scale(.92)}50%{opacity:.4;transform:scale(1.05)}}
@keyframes beam{0%,100%{opacity:.35}50%{opacity:.8}}
@keyframes mote{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(var(--mx),-22px);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
function stump(glow) {
  const spiral = 'M0 0 c2 -1 4 1 3 3 c-1 3 -5 3 -7 1 c-3 -3 -1 -8 3 -9 c4 -1 8 2 8 6';
  const motes = [[28, 24, -3, 0], [34, 22, 3, .7], [31, 25, -1, 1.4], [37, 24, 4, 2.1]].map(([x, y, mx, d]) =>
    `<circle class="mote" cx="${x}" cy="${y}" r="1.2" fill="${glow}" style="--mx:${mx}px;animation-delay:${d}s"/>`).join('');
  return `<defs>
    <radialGradient id="${PFX}hole" cx="50%" cy="55%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="${glow}"/><stop offset="1" stop-color="${C.hollow}"/></radialGradient>
    <linearGradient id="${PFX}beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${glow}" stop-opacity=".75"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></linearGradient>
    <clipPath id="${PFX}hc"><ellipse cx="32" cy="26" rx="12" ry="4.4"/></clipPath></defs>
  <ellipse class="aura" cx="32" cy="57" rx="29" ry="6.5" fill="${glow}"/>
  ${part('M14 26 C14 34 13 46 11 52 C9 55 6 56 4 58 C9 59 13 57 16 58 C20 60 26 59 32 59 C38 59 44 60 48 58 C51 57 55 59 60 58 C58 56 55 55 53 52 C51 46 50 34 50 26 Z', C.bark, 'M38 24 C43 36 43 48 41 62 L66 62 L66 20 Z', C.bark2, T)}
  <path d="M19 32 C19 40 18 46 17 52 M45 32 C45 40 46 46 47 52 M32 46 V56" stroke="${C.bark2}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <g class="rune" style="color:${glow}"><path d="M23 36 v8 M23 36 l4 3 l-4 3 M30.5 35 l3 9 M33.5 35 l-3 9 M40 36 v8 M40 40 l4 -4 M40 40 l4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g class="shroom" style="color:${glow}">
    <rect x="9.4" y="50" width="2.4" height="5" rx="1" fill="${C.stem}" ${O(1)}/><path d="M5.5 51 C5.5 47 8 45.5 10.6 45.5 C13 45.5 15.6 47 15.6 51 Z" fill="${glow}" ${O(1.2)}/><circle cx="9" cy="48.2" r=".8" fill="#fff"/>
    <rect x="54.6" y="52" width="1.8" height="3.6" rx=".8" fill="${C.stem}" ${O(.9)}/><path d="M52.5 53 C52.5 50 54 49 55.5 49 C57 49 58.5 50 58.5 53 Z" fill="${glow}" ${O(1)}/></g>
  <ellipse cx="32" cy="26" rx="18" ry="7" fill="${C.heart}" ${O(T)}/>
  <ellipse cx="32" cy="26" rx="15" ry="5.6" fill="none" stroke="${C.ring}" stroke-width="1"/>
  ${part('M14 25 C14 21 18 19.5 22 20.5 C19.5 22.5 17 24.5 14.5 27.5 Z', C.mossHi, null, null, 1.2)}
  <ellipse cx="32" cy="26" rx="12" ry="4.4" fill="url(#${PFX}hole)"/>
  <g clip-path="url(#${PFX}hc)">
    <g transform="translate(32 26.4) scale(1.25 .42)"><g class="swirl">
      <path d="${spiral}" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>
      <path d="${spiral}" transform="rotate(180)" fill="none" stroke="${glow}" stroke-width="1.4" stroke-linecap="round"/>
    </g></g>
    <ellipse cx="32" cy="27.8" rx="12" ry="4.4" fill="none" stroke="${C.hollow}" stroke-width="2.6" opacity=".75"/>
  </g>
  <ellipse cx="32" cy="26" rx="12" ry="4.4" fill="none" ${O(1.2)}/>
  <path class="beam" d="M21 26 L25 -2 H39 L43 26 Z" fill="url(#${PFX}beam)"/>
  ${motes}`;
}

/* ---------- wooden walls (build once on load) ---------- */
const WALL_CSS = `
.pc{transform-box:fill-box;transform-origin:50% 100%}
.rail{transform-box:fill-box;transform-origin:0% 50%}
.railv{transform-box:fill-box;transform-origin:50% 0%}
.burst,.ribbon,.spark{transform-box:fill-box;transform-origin:center}
.soil{animation:growX .3s ease-out both}
.stake{animation:rise .45s ease-out both}
.post{animation:post .4s ease-out both}
.rail{animation:growX .3s ease-out both}
.railv{animation:growY .3s ease-out both}
.burst{animation:burst .5s ease-out both}
.ribbon{animation:pop .35s ease-out both}
.spark{animation:spark 2.4s ease-in-out infinite}
@keyframes growX{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes growY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes rise{0%{transform:translateY(34px)}70%{transform:translateY(-3px)}100%{transform:translateY(0)}}
@keyframes post{0%{transform:scaleY(0)}65%{transform:scaleY(1.15)}100%{transform:scaleY(1)}}
@keyframes pop{0%{transform:scale(0)}65%{transform:scale(1.2)}100%{transform:scale(1)}}
@keyframes burst{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--dx),-10px);opacity:0}}
@keyframes spark{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.burst{opacity:0}}`;
const delay = (s) => `animation-delay:${s.toFixed(2)}s`;
function wallH(hint) {
  return `<defs><clipPath id="${PFX}ground"><rect x="-2" y="-30" width="68" height="59"/></clipPath></defs>
  <g class="pc soil">${part('M2 28 C10 25 54 25 62 28 C63 30 61 32 58 32 H6 C3 32 1 30 2 28 Z', C.soil, null, null, 1.6)}</g>
  <g clip-path="url(#${PFX}ground)">` +
    [5, 19, 33, 47].map((x, i) => `<g class="stake" style="${delay(i * .09)}">${part(`M${x} 30 L${x} 8 L${x + 6} 2 L${x + 12} 8 L${x + 12} 30 Z`, C.stake, `M${x + 7} 0 H${x + 14} V32 H${x + 7} Z`, C.stake2, 1.6)}<path d="M${x + 3} 12 V24" stroke="${C.stake2}" stroke-width="1.2" stroke-linecap="round"/></g>`).join('') +
    `</g>` +
    [10, 23].map((y, i) => `<g class="rail" style="${delay(.45 + i * .12)}"><path d="M2 ${y} H62 V${y + 5} H2 Z" fill="${C.rail}" ${O(1.6)}/><circle cx="12" cy="${y + 2.5}" r=".9" fill="${C.ink}"/><circle cx="52" cy="${y + 2.5}" r=".9" fill="${C.ink}"/></g>`).join('') +
    [-9, -5, 5, 9].map((dx, i) => `<circle class="burst" cx="${10 + i * 14}" cy="27" r="2.2" fill="${C.dust}" style="--dx:${dx}px"/>`).join('') +
    (hint ? `<g class="ribbon" style="${delay(.8)}">${part('M28 9 H36 V30 H28 Z', C.ribbon, 'M32 8 H38 V31 H32 Z', C.ribbon2, 1.4)}${part('M32 9 C26 2 20 4 22 8 C24 11 29 10 32 9 C35 10 40 11 42 8 C44 4 38 2 32 9 Z', C.ribbon, null, null, 1.4)}</g>
      <path class="spark" style="${delay(1)}" d="M52 2 l1.2 2.8 l2.8 1.2 l-2.8 1.2 l-1.2 2.8 l-1.2 -2.8 l-2.8 -1.2 l2.8 -1.2 Z" fill="#fff" ${O(.8)}/>
      <path class="spark" style="${delay(1.8)}" d="M8 0 l1 2.2 l2.2 1 l-2.2 1 l-1 2.2 l-1 -2.2 l-2.2 -1 l2.2 -1 Z" fill="#fff" ${O(.8)}/>` : '');
}
function wallV(hint) {
  const ys = [16, 30, 44, 58, 70];
  return `<g class="pc soil">${part('M5 10 C5 4 19 4 19 10 V66 C19 72 5 72 5 66 Z', C.soil, 'M13 2 H24 V74 H13 Z', C.soil2, 1.6)}</g>` +
    ys.map((y, i) => `<g class="pc post" style="${delay(i * .09)}">${part(`M6 ${y} L6 ${y - 12} L12 ${y - 17} L18 ${y - 12} L18 ${y} Z`, C.stake, `M12 ${y - 20} H20 V${y + 2} H12 Z`, C.stake2, 1.6)}</g>`).join('') +
    `<g class="railv" style="${delay(.5)}"><path d="M10 6 H14 V66 H10 Z" fill="${C.rail}" ${O(1.4)}/></g>` +
    [-7, 7, -6, 6].map((dx, i) => `<circle class="burst" cx="12" cy="${16 + i * 14}" r="2.2" fill="${C.dust}" style="--dx:${dx}px"/>`).join('') +
    (hint ? `<g class="ribbon" style="${delay(.8)}">${part('M4 32 H20 V40 H4 Z', C.ribbon, 'M12 31 H22 V41 H12 Z', C.ribbon2, 1.4)}${part('M4 36 C-2 30 -2 26 2 27 C5 28 5 33 4 36 Z', C.ribbon, null, null, 1.2)}</g>
      <path class="spark" style="${delay(1)}" d="M20 6 l1 2.2 l2.2 1 l-2.2 1 l-1 2.2 l-1 -2.2 l-2.2 -1 l2.2 -1 Z" fill="#fff" ${O(.8)}/>` : '');
}

/* ---------- Sir Croakwell, the toad wizard (docs/VILLAIN_SPEC.md) ---------- */
// Ported from docs/mockups/croakwell. No hat red anywhere on him; his magic is lime.
const K = {
  skin: '#6f8c3c', skinHi: '#a3c25c', skinLo: '#435d20', bulgeHi: '#b3cf6a', bulgeLo: '#5c7830',
  arm: '#56712c', palm: '#5f7a32', web: '#7a9a40', pad: '#c9dc8a', freckle: '#b3cf6a', belly: '#e6dca0', bellyLine: '#cbbf80',
  eyeHi: '#ffe08a', eye: '#e8b63c', eyeLo: '#b07a18', pupil: '#1f1a14', lid: '#6a8738', lidBack: '#5c7830',
  hatHi: '#7a58b8', hatLo: '#3b2768', brim: '#2f1f55', spring: '#4f3585', cloakHi: '#5e4396', cloakLo: '#36245e', collar: '#4a3478',
  orange: '#ff9a3c', gold: '#ffd96b', goldD: '#d9a22b', acorn: '#a8761a', lilac: '#8f6fcc', card: '#fffaf0',
  pink: '#ff7fa6', pinkHi: '#ffd0de', cheek: '#ff8fa3', tongue: '#e0687c', mouth: '#5a1f2a', cream: '#fff6e0',
  lime: '#d8f26a', limeCore: '#f4ffc4', fly: '#2a2a24', sac: '#f1e2a0', snail: '#d98c5f', snailFoot: '#c9b38e',
  wood: '#9b6a3a', cloud: '#7b8494', rain: '#9fb4c8', smoke: '#9aa0a8',
};
const CONFETTI = [K.orange, K.pink, K.lime, K.cream];
const f1 = (n) => +n.toFixed(1);
const ell = (cx, cy, rx, ry) => `M${f1(cx - rx)} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
const rr = (x, y, w, h, r = 0) => r
  ? `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`
  : `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
const star4 = (cx, cy, s) => `M${cx} ${cy - s} l${f1(s * .38)} ${f1(s * .62)} l${f1(s * .62)} ${f1(s * .38)} l${f1(-s * .62)} ${f1(s * .38)} l${f1(-s * .38)} ${f1(s * .62)} l${f1(-s * .38)} ${f1(-s * .62)} l${f1(-s * .62)} ${f1(-s * .38)} l${f1(s * .62)} ${f1(-s * .38)} Z`;
/** A line with an ink edge: ink stroke underneath, coloured stroke on top. */
const inkLine = (d, color, w, edge = 3, extra = '') =>
  `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${f1(w + edge * 2)}" stroke-linecap="round" stroke-linejoin="round" ${extra}/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
/** A small confetti bit: [x, y, rotation, colour index]. */
const bit = ([x, y, rot, c], w = 7, h = 4, cls = '', style = '') => {
  const r = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${CONFETTI[c % 4]}" stroke="${C.ink}" stroke-width=".9" transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"/>`;
  return cls ? `<g class="${cls}" style="${style}">${r}</g>` : r;
};
/** Overlapping blobs as one outlined shape: ink under all of them, fills on top. */
const blob = (ds, fill, w) => ds.map((d) => `<path d="${d}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${w * 2}" stroke-linejoin="round"/>`).join('') + ds.map((d) => `<path d="${d}" fill="${fill}"/>`).join('');
/** Keyframes for a small elliptical orbit (CSS can't follow an ellipse without offset-path). */
function orbitFrames(name, cx, cy, rx, ry, n = 12) {
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return `${f1((i / n) * 100)}%{transform:translate(${f1(cx + rx * Math.cos(a))}px,${f1(cy + ry * Math.sin(a))}px)}`;
  });
  return `@keyframes ${name}{${pts.join('')}}`;
}
const fly = (cls, s = 1) => `<g class="${cls}"><g transform="scale(${s})">
  <ellipse cx="-3" cy="-5" rx="5.5" ry="3.3" fill="#fff" ${O(1)} opacity=".9"/><ellipse cx="3" cy="-5" rx="4.6" ry="2.8" fill="#fff" ${O(1)} opacity=".9"/>
  <ellipse cx="0" cy="0" rx="5" ry="3.6" fill="${K.fly}" ${O(1.2)}/><circle cx="-4" cy="-.5" r="1.2" fill="#fff"/></g></g>`;

/** The webbed four-finger hand, fingers up, palm at the origin. `fist` curls the fingers. */
function hand({ w = 3, glow = false, fist = false } = {}) {
  const tips = [[-18, -26], [-6, -32], [6, -32], [18, -26]];
  const roots = [[-10, -4], [-4, -8], [4, -8], [10, -4]];
  if (fist) {
    return part(ell(0, 0, 18, 13), K.palm, null, null, w) +
      [[-11, -9], [-4, -13], [4, -13], [11, -9]].map(([x, y]) => part(ell(x, y, 6.5, 6), K.palm, null, null, w)).join('') +
      [[-11, -10], [-4, -14], [4, -14], [11, -10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="${K.pad}"/>`).join('') +
      part(ell(15, 4, 5.5, 5), K.palm, null, null, w);
  }
  return part('M-18 -24 Q-12 -12 -6 -30 Q0 -16 6 -30 Q12 -12 18 -24 L13 -2 L-13 -2 Z', K.web, null, null, w) +
    roots.map(([x, y], i) => `<line x1="${x}" y1="${y}" x2="${tips[i][0]}" y2="${tips[i][1]}" stroke="${C.ink}" stroke-width="${7 + w * 2}" stroke-linecap="round"/>`).join('') +
    roots.map(([x, y], i) => `<line x1="${x}" y1="${y}" x2="${tips[i][0]}" y2="${tips[i][1]}" stroke="${K.palm}" stroke-width="7" stroke-linecap="round"/>`).join('') +
    part(ell(0, 0, 17, 12), K.palm, null, null, w) +
    tips.map(([x, y]) => part(ell(x, y - 1, 5, 5), K.pad, null, null, w * .8)).join('') +
    (glow ? `<g class="pulse">${tips.map(([x, y]) => `<circle cx="${x}" cy="${y - 1}" r="9" fill="${K.lime}" opacity=".45"/>`).join('')}
      <circle cx="-6" cy="-33" r="3.2" fill="${K.limeCore}"/><circle cx="6" cy="-33" r="3.2" fill="${K.limeCore}"/></g>` : '');
}

/** The wizard hat in back-mockup coordinates (brim at y 542). `tip` is the transform of the spring tip. */
function hat(w, tip) {
  const snailShell = 'M236 532 m-1 0 a2 2 0 1 1 3 1 a4 4 0 1 1 -6 -3';
  return part(ell(195, 542, 54, 12), K.brim, null, null, w) +
    part('M163 540 C171 504 187 474 200 454 L214 458 C219 488 225 514 229 540 Z', `url(#${PFX}hat)`, null, null, w) +
    `<g transform="${tip}">` +
    inkLine('M207 456 c6 -14 20 -14 20 -2 c0 10 -12 10 -10 0 c2 -12 18 -14 22 -2 c3 9 -8 11 -8 2 c0 -10 14 -14 22 -6', K.spring, 6, w * .6) +
    part(ell(257, 446, 9, 9), K.orange, null, null, w) +
    `<path d="M250 443 Q257 438 264 443 M249 449 Q257 454 265 449" fill="none" stroke="${K.gold}" stroke-width="2" stroke-linecap="round"/></g>` +
    part('M166 528 Q196 538 227 528 L229 538 Q196 548 164 538 Z', K.orange, null, null, w) +
    [[176, 535], [190, 538], [204, 538], [218, 535]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${K.gold}"/>`).join('') +
    `<g transform="rotate(-18 172 518)">${part(rr(165, 506, 14, 20, 2), K.card, null, null, w * .7)}<path d="M172 511 l4 5 l-4 5 l-4 -5 Z" fill="${K.orange}" stroke="${C.ink}" stroke-width=".8"/></g>` +
    `<g transform="rotate(-10 192 495)">${part(rr(185, 488, 15, 14, 1.5), K.lilac, null, null, w * .7)}<rect x="187" y="490" width="11" height="10" fill="none" stroke="${K.cream}" stroke-width="1.2" stroke-dasharray="2 2"/></g>` +
    part('M214 500 l2.5 5.5 l6 0.6 l-4.5 4 l1.3 6 l-5.3 -3 l-5.3 3 l1.3 -6 l-4.5 -4 l6 -0.6 Z', K.gold, null, null, w * .7) +
    part('M226 540 Q232 534 248 538 L250 542 Q236 544 226 542 Z', K.snailFoot, null, null, w * .6) +
    `<path d="M248 538 L252 528 M245 538 L246 527" stroke="${C.ink}" stroke-width="1.5" stroke-linecap="round"/>` +
    part(ell(236, 532, 8, 8), K.snail, null, null, w * .6) + `<path d="${snailShell}" fill="none" stroke="${C.ink}" stroke-width="1.2"/>`;
}

/** The gold acorn button on the cloak (replaces the mockup's toadstool clasp). Centre (cx, cy), about 22 tall. */
const acorn = (cx, cy, w) =>
  part(`M${cx - 8} ${cy - 2} C${cx - 8} ${cy + 8} ${cx - 3} ${cy + 12} ${cx} ${cy + 12} C${cx + 3} ${cy + 12} ${cx + 8} ${cy + 8} ${cx + 8} ${cy - 2} Z`, K.gold, `M${cx + 2} ${cy - 4} H${cx + 10} V${cy + 14} H${cx + 1} Z`, K.goldD, w) +
  part(`M${cx - 10} ${cy - 1} C${cx - 10} ${cy - 11} ${cx + 10} ${cy - 11} ${cx + 10} ${cy - 1} Z`, K.acorn, null, null, w) +
  `<path d="M${cx} ${cy - 10} V${cy - 14}" stroke="${C.ink}" stroke-width="${w + 1}" stroke-linecap="round"/><path d="M${cx - 3} ${cy + 4} Q${cx - 4} ${cy + 8} ${cx - 2} ${cy + 9}" fill="none" stroke="${K.cream}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`;

const toadDefs = (back) => `<defs>
  <radialGradient id="${PFX}skin" cx="45%" cy="${back ? 20 : 25}%" r="80%"><stop offset="0" stop-color="${K.skinHi}"/><stop offset="${back ? .5 : .55}" stop-color="${K.skin}"/><stop offset="1" stop-color="${K.skinLo}"/></radialGradient>
  <radialGradient id="${PFX}bulge" cx="45%" cy="30%" r="70%"><stop offset="0" stop-color="${K.bulgeHi}"/><stop offset="1" stop-color="${K.bulgeLo}"/></radialGradient>
  <radialGradient id="${PFX}eye" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${K.eyeHi}"/><stop offset=".6" stop-color="${K.eye}"/><stop offset="1" stop-color="${K.eyeLo}"/></radialGradient>
  <linearGradient id="${PFX}hat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${K.hatHi}"/><stop offset="1" stop-color="${K.hatLo}"/></linearGradient>
  <linearGradient id="${PFX}cloak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${K.cloakHi}"/><stop offset="1" stop-color="${K.cloakLo}"/></linearGradient>
  <filter id="${PFX}glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>`;

/* ----- back view: a 390 x 200 band. Mockup coordinates are mapped with k = .62; hands and arms live in band coordinates ----- */
const TB = { k: 0.46, tx: 105.3, ty: -179.8 }; // x' = tx + k x, y' = ty + k y  (dome top of the idle pose lands at y 70)
const TOAD_CSS = `
.breathe{transform-box:fill-box;transform-origin:50% 100%;animation:toadBreathe 3.2s ease-in-out infinite}
@keyframes toadBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}
.bounce{animation:toadBounce .5s ease-in-out infinite}
@keyframes toadBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
.snap{transform-box:fill-box;transform-origin:0% 100%;animation:toadSnap 1.5s ease-in-out infinite}
@keyframes toadSnap{0%,55%,100%{transform:scale(.55)}65%,80%{transform:scale(1)}}
.pulse{animation:toadPulse 1.2s ease-in-out infinite}
@keyframes toadPulse{0%,100%{opacity:.55}50%{opacity:1}}
.twinkle{transform-box:fill-box;transform-origin:center;animation:toadTwinkle 1.6s ease-in-out infinite}
@keyframes toadTwinkle{0%,100%{opacity:.35;transform:scale(.7)}50%{opacity:1;transform:scale(1.1)}}
.drip{animation:toadDrip 1.1s linear infinite}
@keyframes toadDrip{0%{transform:translateY(-3px);opacity:0}25%{opacity:1}100%{transform:translateY(12px);opacity:0}}
.blink{animation:toadBlink 4s infinite}
@keyframes toadBlink{0%,93%,100%{opacity:0}96%{opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

/** Pose numbers: from the mockup's renderVals(), hands re-placed into the band.
    The hat is cocked to the right, over his right eye, so it stays below the board's bottom edge instead of
    standing up over the bottom row (idle clears the edge; gloat clears it at rest, about 2px at the top of
    his bounce; cast reaches about 9px over for its 600ms, with his hands). Leaning left lifts the spring tip. */
const BACK = {
  idle: { dy: 0, hat: 'rotate(40 195 540)', tip: 'rotate(0 207 456)', L: [36, 36, -8], R: [354, 36, 8], glow: false, sac: [0, 0], lid: false },
  cast: { dy: -8, hat: 'rotate(34 195 540)', tip: 'rotate(-25 207 456)', L: [34, 4, -24], R: [356, 4, 24], glow: true, sac: [14, 10], lid: false },
  gloat: { dy: -16, hat: 'rotate(54 195 540)', tip: 'rotate(-40 207 456)', L: [36, 6, -10], R: [354, 38, 10], glow: false, sac: [24, 18], lid: false, fist: 'L' },
  sulk: { dy: 30, hat: '', tip: 'rotate(0 207 456)', L: [72, 66, 0], R: [322, 88, 172], glow: false, sac: [0, 0], lid: true, noHat: true },
};
function toadBackSvg(mood) {
  cid = 0;
  PFX = `gsg-tb-${mood}-`;
  const m = BACK[mood];
  const HS = 0.8; // hand scale
  const hw = 2.4 / HS; // hand outline width in hand units
  const bw = 2.4 / TB.k; // body outline width in mockup units
  const shY = 96 + TB.k * m.dy;
  const arm = (sx, [hx, hy], side) => `M${sx} ${f1(shY)} Q${f1((sx + hx) / 2 + side * 8)} ${f1((shY + hy) / 2)} ${hx} ${hy}`;
  const armSvg = (sx, h, side) => inkLine(arm(sx, h, side), K.arm, 15, 2.2) + `<path d="${arm(sx, h, side)}" fill="none" stroke="${K.skinHi}" stroke-width="5" stroke-linecap="round" opacity=".45" transform="translate(${-side * 2} -2)"/>`;
  const handSvg = ([x, y, rot], mirror, fist) => `<g class="toad-hand" transform="translate(${x} ${y}) rotate(${rot})${mirror ? ' scale(-1 1)' : ''} scale(${HS})">${hand({ w: hw, glow: m.glow, fist })}</g>`;
  const tipOf = ([x, y, rot]) => { const r = rot * Math.PI / 180; return [x + 26 * Math.sin(r), y - 26 * Math.cos(r)]; };

  // Magic: the conjured fence plank above the hands, lime trails from the fingertips, sparkles, confetti.
  const [fl, fr] = [tipOf(m.L), tipOf(m.R)];
  const trail = (f, tx, ty) => `M${f1(f[0])} ${f1(f[1])} Q${f1((f[0] + tx) / 2)} ${f1(Math.min(f[1], ty) - 30)} ${tx} ${ty}`;
  const castFx = mood === 'cast' ? `<g>
    <rect x="168" y="-40" width="62" height="22" rx="11" fill="${K.lime}" opacity=".6" filter="url(#${PFX}glow)"/>
    ${part(rr(179, -33, 32, 6, 3), C.stake, null, null, 1.4)}${part(rr(173, -35, 10, 11, 2), C.stake2, null, null, 1.4)}
    <rect x="211" y="-33" width="16" height="6" rx="3" fill="none" stroke="${K.lime}" stroke-width="1.6" stroke-dasharray="3 3"/>
    <path d="${trail(fl, 180, -26)}" fill="none" stroke="${K.lime}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 8" class="pulse"/>
    <path d="${trail(fr, 222, -26)}" fill="none" stroke="${K.lime}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 8" class="pulse"/>
    ${[[132, -26, 5], [288, -24, 5], [200, -14, 4]].map(([x, y, s], i) => `<path class="twinkle" style="animation-delay:${i * .4}s" d="${star4(x, y, s)}" fill="${K.lime}" ${O(.8)}/>`).join('')}
    ${[[60, -14], [338, -16], [104, -34], [300, -34]].map(([x, y], i) => `<circle class="twinkle" style="animation-delay:${i * .3}s" cx="${x}" cy="${y}" r="2.4" fill="${K.limeCore}"/>`).join('')}
    ${[[150, -20, 30, 0], [258, -12, -25, 1], [118, -30, 60, 2], [322, -30, 15, 3], [236, -38, 50, 1], [86, -30, -40, 0]].map((b, i) => bit(b, 7, 4, 'twinkle', `animation-delay:${i * .25}s`)).join('')}</g>` : '';

  const gloatFx = mood === 'gloat' ? `<g>
    <text x="8" y="112" transform="rotate(-8 8 112)" font-family="Grandstander, 'Nunito', system-ui, sans-serif" font-size="22" font-weight="800" fill="${K.cream}" stroke="${C.ink}" stroke-width="4.5" paint-order="stroke" stroke-linejoin="round">Hehehe!</text>
    ${[[70, 10, 30, 0], [118, -6, -30, 1], [96, 60, 55, 2], [270, 4, 10, 3], [300, 56, -50, 0], [330, 70, 25, 1], [214, -8, -35, 2]].map((b, i) => bit(b, 7, 4, 'twinkle', `animation-delay:${i * .2}s`)).join('')}
    <path d="M118 100 q-9 -4 -12 -14 M272 100 q9 -4 12 -14" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/></g>` : '';

  // Sulk: he lets go of the board. A clenched fist shakes up on the left, the right hand dangles, the hat lies fallen
  // (snail still aboard), "Rats!" in a small speech bubble over his head, a small rain cloud, a flat whoopee cushion.
  const font = `font-family="Grandstander, 'Nunito', system-ui, sans-serif"`;
  const fist = mood !== 'sulk' ? '' : `<g class="toad-fist" transform="translate(${m.L[0]} ${m.L[1]})"><g class="fist-shake">
    <g stroke="${C.ink}" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M-22 -20 q-5 5 0 11"/><path d="M-29 -24 q-8 9 0 18"/><path d="M22 -20 q5 5 0 11"/><path d="M29 -24 q8 9 0 18"/></g>
    ${part(rr(-14, -12, 28, 24, 9), K.palm, null, null, 2.2)}
    ${[[-9, -12], [-3, -14], [3.5, -14], [9.5, -12]].map(([x, y]) => part(ell(x, y, 5, 5), K.arm, null, null, 1.8)).join('')}
    ${[[-9, -13.5], [-3, -15.5], [3.5, -15.5], [9.5, -13.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${K.pad}"/>`).join('')}
    ${part('M-12 0 Q-2 -6 8 -2 Q10 2 4 4 Q-6 6 -12 4 Z', K.arm, null, null, 1.8)}
    <g stroke="${C.ink}" stroke-width="2" stroke-linecap="round" fill="none" transform="translate(19 -33)"><path d="M-5 -2 q3 -1 3 -4"/><path d="M5 -2 q-3 -1 -3 -4"/><path d="M-5 4 q3 1 3 4"/><path d="M5 4 q-3 1 -3 4"/></g></g></g>`;
  const fallenHat = mood !== 'sulk' ? '' : `<g class="toad-hat-off" transform="translate(347 108) rotate(84) scale(.36) translate(-195 -542)">${hat(2.4 / .36, 'rotate(0 207 456)')}</g>`;
  const sulkFx = mood === 'sulk' ? `<g>
    ${fallenHat}
    ${blob([ell(292, 46, 12, 9), ell(308, 40, 15, 12), ell(326, 46, 11, 8), rr(284, 46, 52, 10, 5)], K.cloud, 2)}
    ${[[292, 64], [308, 64], [324, 64]].map(([x, y], i) => `<path class="drip" style="animation-delay:${i * .35}s" d="M${x} ${y} l-3 8" stroke="${K.rain}" stroke-width="2.4" stroke-linecap="round"/>`).join('')}
    <g class="toad-bubble">${part('M188 46 L193 62 L202 46 Z', '#fffaf0', null, null, 2.2)}${part(rr(160, 18, 70, 30, 13), '#fffaf0', null, null, 2.2)}<rect x="190" y="43" width="11" height="6" fill="#fffaf0"/>
      <text x="195" y="39" text-anchor="middle" ${font} font-size="17" font-weight="800" fill="${C.ink}">Rats!</text></g>
    ${part('M244 134 Q270 126 294 135 Q270 141 244 134 Z', K.pink, null, null, 1.6)}${part(rr(292, 131, 10, 6, 2), K.pink, null, null, 1.6)}</g>` : '';

  const eyeRim = (cx) => inkLine(`M${cx - 28} 542 A31 31 0 0 1 ${cx + 28} 542`, K.gold, 5, bw * .8) + `<path d="M${cx - 13} 538 A20 20 0 0 1 ${cx + 5} 532" fill="none" stroke="${K.cream}" stroke-width="2" stroke-linecap="round"/>`;
  const lid = (cx) => m.lid ? part(`M${cx - 31} 550 A31 31 0 0 1 ${cx + 31} 550 Z`, K.lidBack, null, null, bw) : '';
  const hum = `<g fill="${K.freckle}" opacity=".7">${[[120, 612, 5], [132, 624, 3], [270, 612, 5], [258, 624, 3], [195, 640, 4], [150, 664, 3.5], [240, 664, 3.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
  const sacs = m.sac[0] ? [10, 380].map((x) => part(ell(x, 604, m.sac[0], m.sac[1]), K.sac, null, null, bw)).join('') : '';
  const tongue = mood === 'gloat' ? `<g class="snap">${inkLine('M300 592 Q352 566 352 500', K.tongue, 9, bw * .8)}${part(ell(352, 498, 7, 7), K.tongue, null, null, bw * .8)}
    <g transform="translate(354 488) scale(1.5)">${fly('flyStill', 1)}</g></g>` : '';
  const hemPath = 'M-62 800 L-62 700 Q-30 682 0 700 Q30 682 60 700 Q90 682 120 700 Q150 682 180 700 Q210 682 240 700 Q270 682 300 700 Q330 682 360 700 Q390 682 420 700 Q438 690 452 700 L452 800 Z';
  const diamonds = [[-30, 706, 6], [30, 706, 6], [90, 706, 6], [150, 708, 5], [240, 708, 5], [300, 706, 6], [360, 706, 6], [420, 706, 6]]
    .map(([x, y, s]) => part(`M${x} ${y} l${s} 8 l${-s} 8 l${-s} -8 Z`, K.orange, null, null, bw * .55)).join('');
  const slingshot = inkLine('M44 724 L44 702 M44 702 L34 682 M44 702 L54 682', '#8b5e34', 5, bw * .6) + inkLine('M34 684 Q44 696 54 684', K.tongue, 2.5, bw * .45);
  const cushion = mood === 'sulk' ? '' : part(ell(358, 704, 24, 15), K.pink, null, null, bw * .8) + part(rr(376, 698, 12, 9, 3), K.pink, null, null, bw * .8) +
      `<path d="M344 698 Q352 694 360 698" fill="none" stroke="${K.pinkHi}" stroke-width="2.5" stroke-linecap="round"/>`;

  const inner = `
    ${tongue}${sacs}
    ${part('M-62 800 L-62 716 C-56 650 10 592 110 560 C142 544 170 538 195 538 C220 538 248 544 280 560 C380 592 446 650 452 716 L452 800 Z', `url(#${PFX}skin)`, null, null, bw)}
    <path d="M60 640 C80 600 120 576 150 570" fill="none" stroke="${K.skinHi}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    ${hum}
    ${part(ell(145, 554, 33, 33), `url(#${PFX}bulge)`, null, null, bw)}${part(ell(245, 554, 33, 33), `url(#${PFX}bulge)`, null, null, bw)}
    ${eyeRim(145)}${eyeRim(245)}${lid(145)}${lid(245)}
    ${m.noHat ? "" : `<g class="toad-hat" transform="${m.hat}">${hat(bw * .7, m.tip)}</g>`}
    ${part(hemPath, `url(#${PFX}cloak)`, null, null, bw)}
    ${acorn(195, 690, bw * .7)}${diamonds}${slingshot}${cushion}`;

  // Nothing of him may hang below the band (the cloak path runs long); the top and sides stay open for the spell.
  const body = `${toadDefs(true)}<clipPath id="${PFX}band"><rect x="-80" y="-300" width="550" height="440"/></clipPath><g clip-path="url(#${PFX}band)">
    ${mood === 'idle' ? `<g transform="translate(${TB.tx} ${TB.ty}) scale(${TB.k})">${fly('flyOrbit', 1.3)}</g>` : ''}
    ${armSvg(102, m.L, -1)}${armSvg(288, m.R, 1)}
    ${mood === 'sulk' ? fist : handSvg(m.L, false, m.fist === 'L')}${handSvg(m.R, true, m.fist === 'R')}
    <g transform="translate(${TB.tx} ${TB.ty}) scale(${TB.k})"><g transform="translate(0 ${m.dy - 30})"><g class="${mood === 'idle' ? 'breathe' : mood === 'gloat' ? 'bounce' : ''}">${inner}</g></g></g>
    ${castFx}${gloatFx}${sulkFx}</g>`;
  const css = TOAD_CSS + (mood === 'sulk' ? '.fist-shake{animation:toadFist 1.6s ease-in-out infinite}@keyframes toadFist{0%,32%,100%{transform:translate(0,0) rotate(0)}4%{transform:translate(-2px,0) rotate(-4deg)}8%{transform:translate(2px,0) rotate(4deg)}12%{transform:translate(-2px,0) rotate(-4deg)}16%{transform:translate(2px,0) rotate(4deg)}20%{transform:translate(-1px,0) rotate(-2deg)}24%{transform:translate(0,0) rotate(0)}}' : '') + (mood === 'idle' ? orbitFrames('toadOrbit', 303, 468, 30, 11) + '.flyOrbit{animation:toadOrbit 2.4s linear infinite}' : '');
  const label = { idle: 'Sir Croakwell, a toad wizard, watching from behind', cast: 'Sir Croakwell casting a fence spell', gloat: 'Sir Croakwell gloating', sulk: 'Sir Croakwell sulking' }[mood];
  return svgDoc(390, 140, css, body, label, 'gsg-toad').replace('<svg ', '<svg style="overflow:visible" ');
}

/* ----- face-on view: 390 x 460, mockup coordinates as drawn ----- */
function toadFrontSvg(pose) {
  cid = 0;
  PFX = `gsg-tf-${pose}-`;
  const smug = pose === 'smug';
  const w = 2.4;
  const lidPath = (cx, a1, a2) => {
    const p = (a) => [f1(cx + 40 * Math.cos(a * Math.PI / 180)), f1(186 + 40 * Math.sin(a * Math.PI / 180))];
    const [p1, p2] = [p(a1), p(a2)];
    return `M${p1[0]} ${p1[1]} A40 40 0 ${((a2 - a1) % 360 + 360) % 360 > 180 ? 1 : 0} 1 ${p2[0]} ${p2[1]} Z`;
  };
  const lidL = smug ? ell(128, 186, 40, 40) : lidPath(128, 222, 318);
  const lidR = smug ? lidPath(262, 212, 328) : lidPath(262, 222, 318);
  const px = smug ? 9 : 9, py = 5; // looking to his right (the viewer's right), like the title mock
  const handFx = hand({ w: 3 });
  const cushion = smug ? `${part(ell(195, 424, 44, 26), K.pink, null, null, w)}${part(rr(236, 416, 16, 12, 4), K.pink, null, null, w)}
    <path d="M168 414 Q182 406 196 412" fill="none" stroke="${K.pinkHi}" stroke-width="3" stroke-linecap="round"/>
    ${inkLine('M128 354 Q112 404 166 398', K.arm, 24, w)}${inkLine('M262 354 Q278 404 224 398', K.arm, 24, w)}
    <g transform="translate(168 396) rotate(35)">${handFx}</g><g transform="translate(222 396) rotate(-35) scale(-1 1)">${handFx}</g>` :
    `${inkLine('M128 354 Q112 410 160 414', K.arm, 24, w)}
    <g transform="translate(162 414) rotate(70)">${part(ell(0, 0, 17, 12), K.palm, null, null, 3)}${[[-14, -14], [-4, -18], [6, -18], [15, -12]].map(([x, y]) => part(ell(x, y, 5, 5), K.pad, null, null, 2.4)).join('')}</g>
    ${inkLine('M262 352 Q330 340 338 280', K.arm, 24, w)}
    <g transform="translate(340 272) rotate(28)">${part(ell(0, 0, 15, 13), K.palm, null, null, 3)}
      ${[[-9, -6, 6], [9, -6, 6], [12, 3, 5]].map(([x, y, r]) => part(ell(x, y, r, r), K.web, null, null, 2.4)).join('')}
      ${inkLine('M-3 -8 L-3 -42', K.palm, 8, 2.4)}${part(ell(-3, -44, 6, 6), K.pad, null, null, 2.4)}
      <g class="pulse"><circle cx="-3" cy="-48" r="14" fill="${K.lime}" opacity=".4"/></g>
      <path class="twinkle" d="${star4(-3, -66, 9)}" fill="${K.lime}" ${O(1)}/></g>`;
  const mouth = smug
    ? part('M158 286 Q195 316 236 282 Q224 300 196 302 Q172 302 158 286 Z', K.mouth, null, null, 3) + part(rr(188, 292, 10, 8, 2.5), K.card, null, null, 1.6) +
      `<g transform="rotate(30 230 294)">${part(ell(230, 294, 7, 5), K.tongue, null, null, 1.6)}</g>` +
      `<path d="M98 196 Q128 172 158 196" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/><path d="M92 176 l-9 -5 M102 166 l-5 -8" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>`
    : part('M156 284 Q195 330 238 282 Q196 300 156 284 Z', K.mouth, null, null, 3) + `<ellipse cx="198" cy="302" rx="14" ry="5" fill="${K.tongue}"/>`;
  const flyG = smug ? `<ellipse cx="318" cy="96" rx="22" ry="9" fill="none" stroke="${C.ink}" stroke-width="1.2" stroke-dasharray="2 4" opacity=".45"/><g class="flyF">${fly('', 1.3)}</g>` : '';
  const body = `${toadDefs(false)}
    ${part('M36 470 C38 392 80 342 132 322 L258 322 C310 342 352 392 354 470 Z', `url(#${PFX}skin)`, null, null, w)}
    ${part(ell(195, 432, 74, 78), K.belly, null, null, w)}
    <g stroke="${K.bellyLine}" stroke-width="2" fill="none" stroke-linecap="round"><path d="M150 400 Q195 412 240 400"/><path d="M144 430 Q195 444 246 430"/><path d="M150 460 Q195 472 240 460"/></g>
    ${part('M36 470 C38 392 80 346 130 334 Q156 386 140 470 Z', `url(#${PFX}cloak)`, null, null, w)}
    ${part('M354 470 C352 392 310 346 260 334 Q234 386 250 470 Z', `url(#${PFX}cloak)`, null, null, w)}
    ${part('M120 338 Q132 326 146 336 Q160 326 172 340 L170 350 Q158 340 146 348 Q132 340 122 348 Z', K.collar, null, null, w)}
    ${part('M270 338 Q258 326 244 336 Q230 326 218 340 L220 350 Q232 340 244 348 Q258 340 268 348 Z', K.collar, null, null, w)}
    ${cushion}
    ${part('M68 268 C58 206 100 156 195 154 C290 156 332 206 322 268 C314 318 262 346 195 346 C128 346 76 318 68 268 Z', `url(#${PFX}skin)`, null, null, w)}
    <path d="M108 310 Q195 362 282 310 Q262 342 195 350 Q128 342 108 310 Z" fill="${K.belly}" stroke="${C.ink}" stroke-width="${w}" stroke-linejoin="round"/>
    <path d="M92 232 C100 200 128 184 160 182" fill="none" stroke="${K.skinHi}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <g fill="${K.freckle}" opacity=".7"><circle cx="84" cy="250" r="4"/><circle cx="96" cy="240" r="2.5"/><circle cx="306" cy="250" r="4"/><circle cx="294" cy="240" r="2.5"/><circle cx="195" cy="232" r="3"/></g>
    ${part(ell(128, 180, 50, 50), `url(#${PFX}bulge)`, null, null, w)}${part(ell(262, 180, 50, 50), `url(#${PFX}bulge)`, null, null, w)}
    ${part(ell(128, 186, 38, 38), `url(#${PFX}eye)`, null, null, w)}${part(ell(262, 186, 38, 38), `url(#${PFX}eye)`, null, null, w)}
    <ellipse cx="${128 + px}" cy="${188 + py}" rx="17" ry="15" fill="${K.pupil}"/><ellipse cx="${262 + px}" cy="${188 + py}" rx="17" ry="15" fill="${K.pupil}"/>
    <circle cx="${120 + px}" cy="${179 + py}" r="7" fill="#fff"/><circle cx="${254 + px}" cy="${179 + py}" r="7" fill="#fff"/>
    <circle cx="${137 + px}" cy="${196 + py}" r="3" fill="#fff" opacity=".9"/><circle cx="${271 + px}" cy="${196 + py}" r="3" fill="#fff" opacity=".9"/>
    ${part(lidL, K.lid, null, null, 3.2)}${part(lidR, K.lid, null, null, 3.2)}
    ${smug ? `<g class="blink">${part(ell(262, 186, 40, 40), K.lid, null, null, 3.2)}</g>` : ''}
    <circle cx="183" cy="258" r="3.2" fill="${C.ink}"/><circle cx="207" cy="258" r="3.2" fill="${C.ink}"/>
    <ellipse cx="100" cy="262" rx="22" ry="12" fill="${K.cheek}" opacity=".6"/><ellipse cx="290" cy="262" rx="22" ry="12" fill="${K.cheek}" opacity=".6"/>
    ${mouth}
    <g transform="rotate(-8 195 146)"><g transform="translate(195 146) scale(1.12) translate(-195 -542)">${hat(2.2 / 1.12, 'rotate(0 207 456)')}</g></g>
    ${acorn(195, 338, 1.8)}
    ${flyG}`;
  const orbit = smug ? orbitFrames('toadOrbitF', 318, 96, 22, 9) + '.flyF{animation:toadOrbitF 2.4s linear infinite}' : '';
  const css = TOAD_CSS + orbit;
  return svgDoc(390, 460, css, body, smug ? 'Sir Croakwell the toad wizard, winking' : 'Sir Croakwell the toad wizard, one finger up', 'gsg-toad').replace('<svg ', '<svg style="overflow:visible" ');
}

/* ---------- writer ---------- */
/** Prefix every selector with the sprite's root class and every keyframe name with gsg-. */
function scope(css, root) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const sel = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (sel.startsWith('@keyframes')) out += `@keyframes gsg-${sel.slice(11).trim()}{${body}}`;
    else if (sel.startsWith('@media')) out += `${sel}{${scope(body, root)}}`;
    else out += sel.split(',').map((x) => `${root} ${x.trim()}`).join(',') + `{${body.replace(/animation:(?!none)([a-zA-Z][\w-]*)/g, 'animation:gsg-$1')}}`;
    i = j;
  }
  return out;
}
function svgDoc(w, h, css, body, label, root = '') {
  const cls = root ? ` class="${root}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${cls} viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}">` +
    (css ? `<style>${scope(css.replace(/\s*\n\s*/g, ''), '.' + root)}</style>` : '') + body.replace(/\n\s*/g, '') + `</svg>\n`;
}
const manifest = { version: 1, generatedBy: 'tools/build-sprites.mjs', gnome: {}, tiles: {}, teleporter: {}, wall: {}, villain: {}, icon: {} };
function write(name, svg, meta, group) {
  writeFileSync(join(OUT, name), svg);
  manifest[group][name.replace('.svg', '')] = { file: `assets/sprites/${name}`, ...meta };
}

for (const dir of ['down', 'up', 'left', 'right']) {
  for (const state of ['idle', 'walk', 'shrug']) {
    const loop = { idle: 4.8, walk: 0.6, shrug: 2.2 }[state];
    write(`gnome-${dir}-${state}.svg`, gnomeSvg(dir, state),
      { size: [140, 140], anchor: [70, 131], loop: true, cycleSeconds: loop }, 'gnome');
  }
}
const tile = (name, body, label, meta = {}) => { cid = 0; PFX = `gsg-${name.slice(5)}-`; write(`${name}.svg`, svgDoc(64, 64, '', body, label), { size: [64, 64], ...meta }, 'tiles'); };
[0, 1, 2].forEach((v) => tile(`tile-grass-${v + 1}`, grass(v), 'Grass'));
tile('tile-rock', grass(0) + rock(), 'Rock');
tile('tile-bush', grass(1) + bush(), 'Berry bush');
tile('tile-river', river(), 'River', { seamless: true });
tile('tile-bridge-h', river() + bridgeLogs(), 'Bridge, crossing left to right', { use: 'river runs up and down' });
tile('tile-bridge-v', river() + `<g transform="rotate(90 32 32)">${bridgeLogs()}</g>`, 'Bridge, crossing top to bottom', { use: 'river runs left and right' });
tile('tile-house', grass(2) + house(), 'Toadstool house, the goal');
tile('tile-start', grass(0) + startMark(), 'Start');
for (const [k, glow] of Object.entries(GLOW)) {
  cid = 0; PFX = `gsg-s${k}-`;
  write(`stump-${k}.svg`, svgDoc(64, 64, STUMP_CSS, grass(2) + stump(glow), `Hollow stump teleporter, pair ${k.toUpperCase()}`, 'gsg-stump'),
    { size: [64, 64], glow, holeCentre: [32, 26], loop: true }, 'teleporter');
}
for (const hint of [false, true]) {
  const sfx = hint ? '-hint' : '';
  cid = 0; PFX = `gsg-wh${sfx}-`;
  write(`wall-h${sfx}.svg`, svgDoc(64, 32, WALL_CSS, wallH(hint), hint ? 'Wooden wall from a hint' : 'Wooden wall', 'gsg-wall'),
    { size: [64, 32], groundLine: 28, once: true, buildSeconds: hint ? 1.15 : 0.9 }, 'wall');
  cid = 0; PFX = `gsg-wv${sfx}-`;
  write(`wall-v${sfx}.svg`, svgDoc(24, 72, WALL_CSS, wallV(hint), hint ? 'Wooden wall from a hint' : 'Wooden wall', 'gsg-wall'),
    { size: [24, 72], centreLine: 12, once: true, buildSeconds: hint ? 1.15 : 0.8 }, 'wall');
}
// Sir Croakwell (docs/VILLAIN_SPEC.md): four back-view moods for the board border, two face-on poses.
for (const mood of ['idle', 'cast', 'gloat', 'sulk']) {
  write(`toad-back-${mood}.svg`, toadBackSvg(mood),
    { size: [390, 140], loop: mood === 'idle' || mood === 'gloat', cycleSeconds: { idle: 3.2, cast: 1.6, gloat: 0.5, sulk: 1.6 }[mood], ...(mood === 'cast' ? { overflowTop: 42 } : {}) }, 'villain');
}
for (const pose of ['smug', 'point']) {
  write(`toad-front-${pose}.svg`, toadFrontSvg(pose), { size: [390, 460], loop: true, cycleSeconds: pose === 'smug' ? 4 : 1.6 }, 'villain');
}
// The wordmark icon and favicon: the down-facing gnome's head, hat to beard, on a grass tile. Static.
cid = 0; PFX = 'gsg-icon-';
{
  const head = headFront().replace('<g class="head">', '<g>');
  const svg = svgDoc(64, 64, '', `<clipPath id="gsg-icon-clip"><rect width="64" height="64" rx="14"/></clipPath><g clip-path="url(#gsg-icon-clip)"><rect width="64" height="64" fill="${C.grass}"/><svg viewBox="14 2 112 112" width="64" height="64">${head}</svg></g><rect x="1" y="1" width="62" height="62" rx="13" fill="none" stroke="${C.ink}" stroke-width="2"/>`, 'Gnome Sweet Gnome');
  write('icon-gnome.svg', svg, { size: [64, 64], crop: 'head of gnome-down-idle' }, 'icon');
  writeFileSync(join(ROOT, 'assets', 'favicon.svg'), svg);
}
manifest.palette = { glow: GLOW, wood: C.stake, hat: C.hat, water: C.water, grass: C.grass, outline: C.ink };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const count = ['gnome', 'tiles', 'teleporter', 'wall', 'villain', 'icon'].reduce((n, g) => n + Object.keys(manifest[g]).length, 0);
console.log(`wrote ${count} sprites and manifest.json to assets/sprites`);
