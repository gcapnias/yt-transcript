import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NO_SUBTITLES, RATE_LIMITED } from '../src/fetch-outcome.js';
import { fetchArgs, fetchFailure, FetchError, findSubtitleTrack } from '../src/ytdlp.js';

const URL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';

async function withTempDir(use) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-transcript-test-'));
  try {
    return await use(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// The other half of the success test — exit 0 alone is not success — and the
// only half that is about bytes on disk rather than the exit code.
test('a zero-byte subtitle file is no subtitle file', async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'o3CX_Y59_74.en.vtt'), '', 'utf8');
    assert.equal(await findSubtitleTrack(dir), null);

    await fs.writeFile(path.join(dir, 'o3CX_Y59_74.el.vtt'), 'WEBVTT\n', 'utf8');
    assert.equal(await findSubtitleTrack(dir), path.join(dir, 'o3CX_Y59_74.el.vtt'));
  });
});

test('a recorded process outcome becomes the failure it means', () => {
  const outcome = { url: URL, lang: 'en' };

  assert.equal(fetchFailure({ ...outcome, exitCode: 0, hasTrack: true }), null);

  const noSubtitles = fetchFailure({ ...outcome, exitCode: 0, hasTrack: false });
  assert.ok(noSubtitles instanceof FetchError);
  assert.equal(noSubtitles.failure, NO_SUBTITLES);
  assert.equal(noSubtitles.retryable, false, 'a permanent failure was marked retryable');
  assert.equal(noSubtitles.exitCode, 0);
  assert.equal(noSubtitles.url, URL);

  // The one retried exception, and the reason the ladder ever runs.
  const rateLimited = fetchFailure({ ...outcome, exitCode: 1, hasTrack: false });
  assert.equal(rateLimited.failure, RATE_LIMITED);
  assert.equal(rateLimited.retryable, true, 'a 429 was not marked retryable');
  assert.equal(rateLimited.exitCode, 1);
  assert.match(rateLimited.message, /may succeed/);
});

test('--lang reaches yt-dlp verbatim, and is matched exactly', () => {
  const args = fetchArgs({ url: URL, lang: 'en', destDir: '/tmp/run' });

  assert.equal(args[args.indexOf('--sub-langs') + 1], 'en');
  // `en` must not match `en-US`, `en-orig` is never requested, and exactness
  // is also what keeps `live_chat` out of a live stream's "manual" track.
  assert.ok(!args.includes('all'), 'broadened to --sub-langs all');
  assert.ok(!args.some((arg) => arg.endsWith('-orig')), 'requested an -orig track');
  assert.deepEqual(
    fetchArgs({ url: URL, lang: 'el', destDir: '/tmp/run' }).filter((arg) => arg === 'el'),
    ['el'],
  );
});
