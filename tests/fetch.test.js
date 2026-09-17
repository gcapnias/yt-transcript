import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { fetchTranscript } from '../src/fetch.js';
import { NO_SUBTITLES, RATE_LIMITED, RETRY_DELAYS_MS } from '../src/fetch-outcome.js';
// Production's own: there is no second temporary-directory rule to keep in
// step with it. Renamed at the import because what it holds here is the
// throwaway transcripts directory, so no test writes into the repository's.
import { withTempDir as withTranscriptsDir } from '../src/temp-dir.js';
import { FetchError } from '../src/ytdlp.js';
import { recordedFailure } from './recorded-outcomes.js';

const URL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';
const VIDEO_ID = 'o3CX_Y59_74';

const TRACK = `WEBVTT

00:00:00.000 --> 00:00:02.000
Hello and welcome.
`;

const METADATA = {
  title: 'A Talk',
  channel: 'A Channel',
  duration: '1:00',
  uploadDate: '20260910',
};

/**
 * Replays recorded process outcomes in place of spawning `yt-dlp`, so the exit
 * codes and the retry ladder are covered without a live, rate-limited third
 * party. A `{}` outcome is a success; `{ failure }` is the named failure.
 */
function recordedFetch(outcomes) {
  const calls = [];
  const remaining = [...outcomes];

  return {
    calls,
    async fetchTrack({ url, lang, destDir }) {
      calls.push({ url, lang, destDir });
      const outcome = remaining.shift() ?? outcomes.at(-1);

      if (outcome.failure) {
        throw recordedFailure({
          failure: outcome.failure,
          url,
          message: `recorded ${outcome.failure}`,
        });
      }

      // A successful fetch leaves the track in the per-run temporary directory.
      const trackPath = path.join(destDir, `${VIDEO_ID}.en.vtt`);
      await fs.writeFile(trackPath, TRACK, 'utf8');
      return { metadata: METADATA, trackPath };
    },
  };
}

test('a fetch that exits 0 but writes no subtitle file is a failure, not a success', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedFetch([{ failure: NO_SUBTITLES }]);

    await assert.rejects(
      () =>
        fetchTranscript(
          { url: URL, videoId: VIDEO_ID, lang: 'en' },
          {
            fetchTrack: recorded.fetchTrack,
            dir,
            sleep: async () => assert.fail('retried a permanent failure'),
          },
        ),
      (error) => {
        assert.ok(error instanceof FetchError);
        assert.equal(error.failure, NO_SUBTITLES);
        assert.equal(error.exitCode, 0);
        return true;
      },
    );

    assert.equal(recorded.calls.length, 1, 'a permanent failure was retried');
    assert.deepEqual(await fs.readdir(dir), [], 'a failed fetch wrote a transcript');
  });
});

test('a rate-limited fetch climbs the ladder, then leaves nothing behind', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedFetch([{ failure: RATE_LIMITED }]);
    const slept = [];
    const retries = [];

    await assert.rejects(
      () =>
        fetchTranscript(
          { url: URL, videoId: VIDEO_ID, lang: 'en' },
          {
            fetchTrack: recorded.fetchTrack,
            dir,
            sleep: async (ms) => slept.push(ms),
            onRetry: (entry) => retries.push(entry),
          },
        ),
      (error) => {
        assert.equal(error.failure, RATE_LIMITED);
        return true;
      },
    );

    assert.deepEqual(slept, RETRY_DELAYS_MS);
    assert.equal(recorded.calls.length, RETRY_DELAYS_MS.length + 1);
    assert.equal(retries.length, RETRY_DELAYS_MS.length);
    assert.deepEqual(await fs.readdir(dir), [], 'a failed fetch wrote a transcript');
  });
});

test('a rate limit that lifts produces the transcript it was holding up', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedFetch([{ failure: RATE_LIMITED }, { failure: RATE_LIMITED }, {}]);
    const slept = [];

    const { file } = await fetchTranscript(
      { url: URL, videoId: VIDEO_ID, lang: 'en' },
      { fetchTrack: recorded.fetchTrack, dir, sleep: async (ms) => slept.push(ms) },
    );

    assert.deepEqual(slept, [5000, 15000]);
    assert.deepEqual(await fs.readdir(dir), ['a-talk.md']);
    assert.match(await fs.readFile(file, 'utf8'), /Hello and welcome\./);
  });
});

test('each attempt gets its own temporary directory, and none survives', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedFetch([{ failure: RATE_LIMITED }, {}]);

    await fetchTranscript(
      { url: URL, videoId: VIDEO_ID, lang: 'en' },
      { fetchTrack: recorded.fetchTrack, dir, sleep: async () => {} },
    );

    // A refused attempt can leave a half-written track behind; reusing its
    // directory would let the next attempt read that as its own success.
    const dirs = recorded.calls.map((call) => call.destDir);
    assert.equal(new Set(dirs).size, dirs.length, 'a retry reused the failed attempt’s directory');
    for (const destDir of dirs) {
      await assert.rejects(() => fs.stat(destDir), { code: 'ENOENT' });
    }
  });
});

test('the language defaults to en and reaches the download unchanged', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedFetch([{}, {}]);

    await fetchTranscript({ url: URL, videoId: VIDEO_ID }, { fetchTrack: recorded.fetchTrack, dir });
    await fetchTranscript(
      { url: URL, videoId: VIDEO_ID, lang: 'el' },
      { fetchTrack: recorded.fetchTrack, dir },
    );

    assert.deepEqual(
      recorded.calls.map((call) => call.lang),
      ['en', 'el'],
    );
  });
});
