// Keeps `node --test src/` green until the first real engine test lands.
// Delete this file when Phase 3 starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('engine folder is wired into the test runner', () => {
  assert.ok(true);
});
