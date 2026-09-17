import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const AUTO = [
  '4JofSJIrjwU',
  'F3lL98Pj90o',
  'gaDdrDdczO4',
  'hfba9dAT6xE',
  'LoMOPj-lO8U',
  'M6mYodf0dJM',
  'n0VhIVtviC0',
  'o3CX_Y59_74',
];

const MANUAL = ['8nHBGFKLHZQ', 'DxL2HoqLbyA', 'arj7oStGLkU', 'iG9CE55wbtY', 'rNxC16mlO60'];

// These are the entire evidence base for every track-kind-dependent rule, and
// nothing in the repository can restore them once the root clutter is deleted.
test('the eight auto subtitle tracks are present and non-empty', () => {
  for (const id of AUTO) {
    const file = path.join(fixtures, 'auto', `${id}.en.vtt`);
    assert.ok(fs.statSync(file).size > 0, `empty or missing auto fixture: ${id}`);
  }
});

test('the five manual subtitle tracks are present and non-empty', () => {
  for (const id of MANUAL) {
    const file = path.join(fixtures, 'manual', `${id}.en.vtt`);
    assert.ok(fs.statSync(file).size > 0, `empty or missing manual fixture: ${id}`);
  }
});

test('auto and manual fixtures stay distinguishable by directory', () => {
  const listing = (kind) =>
    fs
      .readdirSync(path.join(fixtures, kind))
      .filter((name) => name.endsWith('.vtt'))
      .sort();

  assert.deepEqual(
    listing('auto'),
    AUTO.map((id) => `${id}.en.vtt`).sort(),
  );
  assert.deepEqual(
    listing('manual'),
    MANUAL.map((id) => `${id}.en.vtt`).sort(),
  );
});
