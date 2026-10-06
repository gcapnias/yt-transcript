import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { fetchTranscript } from '../src/fetch.js';
import { NO_SUBTITLES, NO_VIDEO, RATE_LIMITED, RETRY_DELAYS_MS } from '../src/fetch-outcome.js';
// Production's own: there is no second temporary-directory rule to keep in
// step with it. Renamed at the import because what it holds here is the
// throwaway transcripts directory, so no test writes into the repository's.
import { withTempDir as withTranscriptsDir } from '../src/temp-dir.js';
import { FetchError, parseMetadata } from '../src/ytdlp.js';
import { readXPrintLine, readXTrack, X_TRACK_ID } from './fixtures.js';
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

// X posts: the same fetch, with the identity taken from what yt-dlp reported.

/** Replays a recorded post: the track, and the metadata yt-dlp printed for it. */
function recordedPostFetch(name) {
  const calls = [];
  return {
    calls,
    async fetchTrack({ url, lang, destDir, site }) {
      calls.push({ url, lang, site: site.name });
      const trackPath = path.join(destDir, `${X_TRACK_ID}.en.vtt`);
      await fs.writeFile(trackPath, readXTrack(), 'utf8');
      return { metadata: parseMetadata(readXPrintLine(name)), trackPath };
    },
  };
}

test('a post is fetched as a post, with a canonical handle-free url', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedPostFetch('poteto-2102050467505430555');
    const spellings = ['https://t.co/NgrGz7tmPM', 'https://x.com/i/status/2102050467505430555'];

    for (const url of spellings) {
      await fetchTranscript(
        { url, videoId: null, post: { videoNumber: 1 }, lang: 'en' },
        { fetchTrack: recorded.fetchTrack, dir },
      );
    }

    assert.deepEqual(
      recorded.calls.map((call) => [call.url, call.site]),
      spellings.map((url) => [url, 'x']),
    );
    // Two spellings, one post: the second overwrote the first.
    const files = await fs.readdir(dir);
    assert.equal(files.length, 1);
    assert.match(
      await fs.readFile(path.join(dir, files[0]), 'utf8'),
      /^---\ntitle: "here's how i shipped.*\nurl: https:\/\/x\.com\/i\/status\/2102050467505430555\n/,
    );
  });
});

test('two different posts sharing a title are told apart by post id', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedPostFetch('poteto-2102050467505430555');
    const fetchPost = (displayId, videoNumber) =>
      fetchTranscript(
        { url: 'https://x.com/i/status/1', videoId: null, post: { videoNumber }, lang: 'en' },
        {
          dir,
          fetchTrack: async (request) => {
            const fetched = await recorded.fetchTrack(request);
            return {
              ...fetched,
              metadata: {
                ...fetched.metadata,
                displayId,
                title: `${fetched.metadata.title} #${videoNumber}`,
              },
            };
          },
        },
      );

    await fetchPost('2102050467505430555', 1);
    await fetchPost('2102050467505430999', 1);
    await fetchPost('2102050467505430555', 2);

    const files = await fs.readdir(dir);
    assert.equal(files.length, 3);
    assert.ok(files.some((file) => file.endsWith('-2102050467505430999.md')));
    assert.ok(files.some((file) => file.endsWith('-2102050467505430555-2.md')));
  });
});

test('a post with no video fails at once: no retry, nothing written', async () => {
  await withTranscriptsDir(async (dir) => {
    const url = 'https://x.com/jack/status/20';
    let attempts = 0;

    await assert.rejects(
      () =>
        fetchTranscript(
          { url, videoId: null, post: { videoNumber: 1 }, lang: 'en' },
          {
            dir,
            sleep: async () => assert.fail('retried a post with no video'),
            fetchTrack: async () => {
              attempts += 1;
              throw recordedFailure({ failure: NO_VIDEO, url });
            },
          },
        ),
      (error) => error.failure === NO_VIDEO && error.retryable === false && error.message.includes(url),
    );

    assert.equal(attempts, 1);
    assert.deepEqual(await fs.readdir(dir), []);
  });
});
