import test from 'node:test';
import assert from 'node:assert/strict';

import { planBatch } from '../src/batch-plan.js';

const A = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
const B = 'https://www.youtube.com/watch?v=bbbbbbbbbbb';
const C = 'https://www.youtube.com/watch?v=ccccccccccc';

test('a batch fetches what is not already on disk, in expansion order', () => {
  assert.deepEqual(planBatch([A, B, C], [B]), { fetch: [A, C], skipped: [B] });
});

test('a batch whose videos are all on disk fetches nothing — and that is a success', () => {
  assert.deepEqual(planBatch([A, B], [B, A]), { fetch: [], skipped: [A, B] });
});

test('an expansion to zero videos plans nothing', () => {
  assert.deepEqual(planBatch([], [A]), { fetch: [], skipped: [] });
});

test('--force means exactly "ignore the skip set", and nothing more', () => {
  assert.deepEqual(planBatch([A, B, C], [A, B, C], true), { fetch: [A, B, C], skipped: [] });
});

test('a transcript the directory holds under any other name still counts', () => {
  // The skip set is built from frontmatter `url`s, so the caller never hands
  // filenames in and a renamed transcript is recognised by its identity.
  assert.deepEqual(planBatch([A, B], [A]).fetch, [B]);
});

test('a video listed twice by the expansion is fetched once', () => {
  assert.deepEqual(planBatch([A, B, A], []), { fetch: [A, B], skipped: [] });
});

test('an existing url the batch never expanded to is not reported as skipped', () => {
  assert.deepEqual(planBatch([A], [B, C]), { fetch: [A], skipped: [] });
});
