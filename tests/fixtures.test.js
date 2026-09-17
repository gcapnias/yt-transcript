import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { AUTO_IDS, FIXTURES_DIR, MANUAL_IDS } from './fixtures.js';

// These are the entire evidence base for every track-kind-dependent rule, and
// nothing in the repository can restore them once the root clutter is deleted.
test('the eight auto subtitle tracks are present and non-empty', () => {
  for (const id of AUTO_IDS) {
    const file = path.join(FIXTURES_DIR, 'auto', `${id}.en.vtt`);
    assert.ok(fs.statSync(file).size > 0, `empty or missing auto fixture: ${id}`);
  }
});

test('the five manual subtitle tracks are present and non-empty', () => {
  for (const id of MANUAL_IDS) {
    const file = path.join(FIXTURES_DIR, 'manual', `${id}.en.vtt`);
    assert.ok(fs.statSync(file).size > 0, `empty or missing manual fixture: ${id}`);
  }
});

test('auto and manual fixtures stay distinguishable by directory', () => {
  const listing = (kind) =>
    fs
      .readdirSync(path.join(FIXTURES_DIR, kind))
      .filter((name) => name.endsWith('.vtt'))
      .sort();

  assert.deepEqual(
    listing('auto'),
    AUTO_IDS.map((id) => `${id}.en.vtt`).sort(),
  );
  assert.deepEqual(
    listing('manual'),
    MANUAL_IDS.map((id) => `${id}.en.vtt`).sort(),
  );
});
