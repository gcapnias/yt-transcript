import test from 'node:test';
import assert from 'node:assert/strict';

import { planBatch } from '../src/batch-plan.js';
import { scanTranscriptUrls } from '../src/catalog.js';
import { renderFrontmatter } from '../src/frontmatter.js';
import { parseTarget } from '../src/target.js';
import { parseExpansion } from '../src/ytdlp.js';

const A = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
const B = 'https://www.youtube.com/watch?v=bbbbbbbbbbb';
const C = 'https://www.youtube.com/watch?v=ccccccccccc';

test('a batch fetches what is not already on disk, in expansion order', () => {
  assert.deepEqual(planBatch([A, B, C], [B]), { toFetch: [A, C], skipped: [B] });
});

test('a batch whose videos are all on disk fetches nothing — and that is a success', () => {
  assert.deepEqual(planBatch([A, B], [B, A]), { toFetch: [], skipped: [A, B] });
});

test('an expansion to zero videos plans nothing', () => {
  assert.deepEqual(planBatch([], [A]), { toFetch: [], skipped: [] });
});

test('--force means exactly "ignore the skip set", and nothing more', () => {
  assert.deepEqual(planBatch([A, B, C], [A, B, C], true), { toFetch: [A, B, C], skipped: [] });
});

test('a transcript the directory holds under any other name still counts', () => {
  // The skip set is built from frontmatter `url`s, so the caller never hands
  // filenames in and a renamed transcript is recognised by its identity.
  assert.deepEqual(planBatch([A, B], [A]).toFetch, [B]);
});

test('a video listed twice by the expansion is fetched once', () => {
  assert.deepEqual(planBatch([A, B, A], []), { toFetch: [A, B], skipped: [] });
});

test('an existing url the batch never expanded to is not reported as skipped', () => {
  assert.deepEqual(planBatch([A], [B, C]), { toFetch: [A], skipped: [] });
});

/**
 * The skip set only works if both halves speak the same url form, and neither
 * half alone can prove that. Here a real expansion meets a real transcript:
 * the id goes out through `parseExpansion`, and the url a fetch would have
 * written goes in through `renderFrontmatter` and back out through the scan.
 *
 * The failure this guards is silent and total — a drifted form skips nothing,
 * so every batch re-fetches everything it already has, and still exits 0.
 */
test('the expansion and the transcripts on disk agree on what a url looks like', () => {
  const expanded = parseExpansion('o3CX_Y59_74\n');

  const onDisk = scanTranscriptUrls([
    {
      path: 'a-talk.md',
      text: `${renderFrontmatter({
        title: 'A Talk',
        // Exactly what a fetch writes: the CLI hands `parseTarget`'s url to
        // the fetch, and the fetch puts that url in the frontmatter.
        url: parseTarget('o3CX_Y59_74').url,
        channel: 'freeCodeCamp.org',
        duration: '41:18',
        uploadDate: '20260910',
        fetchedAt: new Date('2026-09-16T14:03:05.123Z'),
        subtitles: 'auto',
      })}\n\nProse.\n`,
    },
  ]);

  assert.deepEqual(planBatch(expanded, onDisk), { toFetch: [], skipped: expanded });
});
