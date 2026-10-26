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
const manifest = { version: 1, generatedBy: 'tools/build-sprites.mjs', gnome: {}, tiles: {}, teleporter: {}, wall: {} };
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
manifest.palette = { glow: GLOW, wood: C.stake, hat: C.hat, water: C.water, grass: C.grass, outline: C.ink };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const count = ['gnome', 'tiles', 'teleporter', 'wall'].reduce((n, g) => n + Object.keys(manifest[g]).length, 0);
console.log(`wrote ${count} sprites and manifest.json to assets/sprites`);
