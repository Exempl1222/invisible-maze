// Pure helpers behind the line-wall input: which side of a tile a press hits, which line that
// is, why a line can't take a wall, and the screen-reader text. No DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLevel } from '../src/game/index.js';
import { sideAt, lineFor, pointTarget, lineKey, explainLine, wallSidesText } from '../assets/js/play/lines.js';

const pack = JSON.parse(readFileSync(new URL('../assets/levels/pack-01.json', import.meta.url), 'utf8'));

test('sideAt: the diagonals split a tile into four triangles', () => {
  assert.equal(sideAt(0.5, 0.05), 'U');
  assert.equal(sideAt(0.5, 0.95), 'D');
  assert.equal(sideAt(0.05, 0.5), 'L');
  assert.equal(sideAt(0.95, 0.5), 'R');
  assert.equal(sideAt(0.9, 0.2), 'R'); // right of the up-right diagonal
  assert.equal(sideAt(0.6, 0.2), 'U');
  assert.equal(sideAt(0.2, 0.7), 'L'); // inside the left triangle
  assert.equal(sideAt(0.2, 0.9), 'D'); // below the lower-left diagonal
  assert.equal(sideAt(0.4, 0.9), 'D');
});

test('sideAt: every point maps to exactly one side, including the diagonals', () => {
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
    assert.ok(['U', 'R', 'D', 'L'].includes(sideAt(i / 20, j / 20)));
  }
});

test('lineFor: canonical wall form, and the border maps to nothing', () => {
  assert.deepEqual(lineFor(2, 3, 'R', 7), [2, 3, 'R']);
  assert.deepEqual(lineFor(2, 3, 'D', 7), [2, 3, 'D']);
  assert.deepEqual(lineFor(2, 3, 'L', 7), [1, 3, 'R']);
  assert.deepEqual(lineFor(2, 3, 'U', 7), [2, 2, 'D']);
  assert.equal(lineFor(0, 3, 'L', 7), null);
  assert.equal(lineFor(0, 0, 'U', 7), null);
  assert.equal(lineFor(6, 3, 'R', 7), null);
  assert.equal(lineFor(3, 6, 'D', 7), null);
});

test('lineKey: both tiles beside a line give the same key', () => {
  assert.equal(lineKey(lineFor(2, 3, 'R', 7)), lineKey(lineFor(3, 3, 'L', 7)));
  assert.equal(lineKey(lineFor(2, 3, 'D', 7)), lineKey(lineFor(2, 4, 'U', 7)));
});

test('pointTarget: every point on the board resolves to one tile and one side', () => {
  const size = 7, gap = 3, S = 350;
  for (let px = 0; px < S; px += 7) for (let py = 0; py < S; py += 7) {
    const t = pointTarget(px, py, S, size, gap);
    assert.ok(t.x >= 0 && t.x < size && t.y >= 0 && t.y < size, `${px},${py}`);
    assert.ok(['U', 'R', 'D', 'L'].includes(t.side));
  }
  // Centre of tile (3,3), pressed near its right edge, targets the line right of it.
  const c = (S - 6 * gap) / 7;
  const p = c + gap;
  const t = pointTarget(3 * p + c * 0.9, 3 * p + c * 0.5, S, size, gap);
  assert.deepEqual([t.x, t.y, t.side], [3, 3, 'R']);
  assert.deepEqual(t.line, [3, 3, 'R']);
  // Near the top edge of the first row: border, no line.
  const top = pointTarget(3 * p + c * 0.5, 2, S, size, gap);
  assert.equal(top.line, null);
  assert.equal(top.side, 'U');
});

test('explainLine: buildable lines are ok; the others say why', () => {
  // A fixed board with a river, bridge, rock, teleporters, robot and beacon (not a pack level, so it
  // doesn't change when the pack is rebuilt).
  const lv = parseLevel({ size: 7, tiles: ['...a...', '.....#.', 'B.~~.~=', '~~=~=~.', '#......', '......R', '#....a.'], moveLimit: 9, wallBudget: 4 });
  const why = (x, y, side) => explainLine(lv, lineFor(x, y, side, lv.size), { x, y, side }).why;
  // top-left corner area: ".." grass pair
  assert.equal(explainLine(lv, [1, 0, 'D'], { x: 1, y: 0, side: 'D' }).ok, lv.lineBuildable(1, 0, 'D'));
  assert.match(why(0, 0, 'U'), /edge of the board/);
  // beacon at (0,2): line between (0,2) and (1,2)
  assert.match(why(0, 2, 'R'), /beacon/);
  // robot at (6,5)
  assert.match(why(6, 5, 'L'), /robot/);
  // river at (2,2)
  assert.match(why(1, 2, 'R'), /river/);
  // bridge at (6,2)? row "B.~~.~=" has the bridge at x=6
  assert.match(why(6, 2, 'U'), /bridge/);
  // teleporter at (3,0)
  assert.match(why(3, 0, 'R'), /teleporter/);
  // rock at (5,1)
  assert.match(why(5, 1, 'L'), /rock/);
});

test('explainLine agrees with the engine on every line of every pack level', () => {
  for (const j of pack.levels) {
    const lv = parseLevel(j);
    for (let y = 0; y < lv.size; y++) for (let x = 0; x < lv.size; x++) for (const dir of ['R', 'D']) {
      if ((dir === 'R' && x === lv.size - 1) || (dir === 'D' && y === lv.size - 1)) continue;
      const e = explainLine(lv, [x, y, dir], { x, y, side: dir });
      assert.equal(e.ok, lv.lineBuildable(x, y, dir));
      if (!e.ok) assert.ok(e.why.length > 10);
    }
  }
});

test('wallSidesText: reads walls around a tile', () => {
  const walls = new Set(['2,3,R', '2,3,D']);
  const has = (w) => walls.has(lineKey(w));
  assert.equal(wallSidesText(2, 3, 7, has), 'walls on right and bottom');
  assert.equal(wallSidesText(3, 3, 7, has), 'wall on left');
  assert.equal(wallSidesText(2, 4, 7, has), 'wall on top');
  assert.equal(wallSidesText(0, 0, 7, has), '');
  const many = new Set(['2,3,R', '2,3,D', '1,3,R', '2,2,D']);
  assert.equal(wallSidesText(2, 3, 7, (w) => many.has(lineKey(w))), 'walls on top, right, bottom and left');
});
