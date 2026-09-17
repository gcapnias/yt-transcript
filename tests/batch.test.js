import test from 'node:test';
import assert from 'node:assert/strict';

import { describeBatch, FETCH_DELAY_MS, runBatch } from '../src/batch.js';
import { describeFailure, NO_SUBTITLES, RATE_LIMITED } from '../src/fetch-outcome.js';
import { FetchError } from '../src/ytdlp.js';

const A = 'https://www.youtube.com/watch?v=4JofSJIrjwU';
const B = 'https://www.youtube.com/watch?v=F3lL98Pj90o';
const C = 'https://www.youtube.com/watch?v=gaDdrDdczO4';

/**
 * An injected clock. The delay between fetches is real seconds in production
 * and recorded numbers here, so the suite never sleeps.
 */
function clock() {
  const slept = [];
  return { slept, sleep: async (ms) => void slept.push(ms) };
}

/** A fetch that succeeds, recording which video it was handed. */
function recordingFetch(fetched = []) {
  return async ({ url, videoId, lang }) => {
    fetched.push({ url, videoId, lang });
    return { file: `transcripts/${videoId}.md`, transcript: { url, trackKind: 'auto' } };
  };
}

function failure(url, kind) {
  return new FetchError(describeFailure({ failure: kind, url, lang: 'en' }), {
    url,
    exitCode: kind === NO_SUBTITLES ? 0 : 1,
    failure: kind,
    retryable: kind === RATE_LIMITED,
  });
}

test('a batch fetches every video, one per-video fetch each', async () => {
  const fetched = [];
  const { sleep } = clock();

  const result = await runBatch([A, B, C], { fetchOne: recordingFetch(fetched), sleep });

  assert.deepEqual(
    fetched.map((entry) => entry.url),
    [A, B, C],
  );
  assert.equal(result.failures.length, 0);
  assert.equal(result.fetched.length, 3);
});

test('the video id reaches each fetch, and --lang with it', async () => {
  const fetched = [];
  const { sleep } = clock();

  await runBatch([A], { fetchOne: recordingFetch(fetched), sleep, lang: 'el' });

  assert.deepEqual(fetched, [{ url: A, videoId: '4JofSJIrjwU', lang: 'el' }]);
});

test('consecutive fetches are at least one second apart, and the first waits for nothing', async () => {
  const { slept, sleep } = clock();

  await runBatch([A, B, C], { fetchOne: recordingFetch(), sleep });

  // Our own loop, not a yt-dlp flag: every sleep flag it has acts *inside* one
  // invocation, so none of them can space two invocations apart.
  assert.deepEqual(slept, [FETCH_DELAY_MS, FETCH_DELAY_MS]);
  assert.ok(FETCH_DELAY_MS >= 1000);
});

test('a single-video batch never waits at all', async () => {
  const { slept, sleep } = clock();

  await runBatch([A], { fetchOne: recordingFetch(), sleep });

  assert.deepEqual(slept, []);
});

test('the delay is paid before a failing fetch too, so a retry storm is still spaced', async () => {
  const { slept, sleep } = clock();

  await runBatch([A, B], {
    fetchOne: async ({ url }) => {
      throw failure(url, RATE_LIMITED);
    },
    sleep,
  });

  assert.deepEqual(slept, [FETCH_DELAY_MS]);
});

test('one failing video does not stop the batch; the run collects and reports it', async () => {
  const { sleep } = clock();

  const result = await runBatch([A, B, C], {
    fetchOne: async ({ url, videoId }) => {
      if (url === B) throw failure(url, NO_SUBTITLES);
      return { file: `transcripts/${videoId}.md`, transcript: { url, trackKind: 'auto' } };
    },
    sleep,
  });

  assert.deepEqual(
    result.fetched.map((entry) => entry.url),
    [A, C],
    'the batch stopped at the failure instead of running to the end',
  );
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].url, B);
  assert.equal(result.failures[0].failure, NO_SUBTITLES);
});

test('a failure with no classification is still collected, never thrown past the loop', async () => {
  const { sleep } = clock();

  const result = await runBatch([A, B], {
    fetchOne: async ({ url, videoId }) => {
      if (url === A) throw new Error('EPERM: operation not permitted');
      return { file: `transcripts/${videoId}.md`, transcript: { url, trackKind: 'auto' } };
    },
    sleep,
  });

  assert.equal(result.fetched.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].failure, null);
  assert.match(result.failures[0].message, /EPERM/);
});

test('a batch of nothing runs, and fails at nothing', async () => {
  const { slept, sleep } = clock();

  const result = await runBatch([], {
    fetchOne: async () => assert.fail('an empty batch fetched something'),
    sleep,
  });

  assert.deepEqual(result, { fetched: [], failures: [] });
  assert.deepEqual(slept, []);
});

test('progress is reported per video, and so is each rung of the retry ladder', async () => {
  const { sleep } = clock();
  const progress = [];
  const retries = [];

  await runBatch([A, B], {
    fetchOne: async ({ url, videoId }, { onRetry }) => {
      // A failing video costs up to 65 seconds of real waiting, so the ladder
      // must be visible while it runs rather than only in the summary.
      onRetry({ attempt: 1, attempts: 4, delayMs: 5000 });
      return { file: `transcripts/${videoId}.md`, transcript: { url, trackKind: 'auto' } };
    },
    sleep,
    onProgress: (entry) => progress.push(entry),
    onRetry: (entry) => retries.push(entry),
  });

  assert.deepEqual(progress, [
    { url: A, position: 1, total: 2 },
    { url: B, position: 2, total: 2 },
  ]);
  assert.deepEqual(retries, [
    { url: A, attempt: 1, attempts: 4, delayMs: 5000 },
    { url: B, attempt: 1, attempts: 4, delayMs: 5000 },
  ]);
});

test('the summary counts all three outcomes and names every failure', () => {
  const { summary, failureLines } = describeBatch({
    fetched: [{ url: A, file: 'transcripts/a.md' }],
    skipped: [C],
    failures: [{ url: B, failure: NO_SUBTITLES, message: 'No subtitles in "en" for ' + B }],
  });

  assert.match(summary, /1 fetched/);
  assert.match(summary, /1 skipped/);
  assert.match(summary, /1 failed/);
  assert.equal(failureLines.length, 2);
  assert.match(failureLines.join('\n'), /F3lL98Pj90o/);
});

test('a batch that failed at nothing says so without a failure section', () => {
  const { summary, failureLines } = describeBatch({
    fetched: [{ url: A, file: 'transcripts/a.md' }],
    skipped: [],
    failures: [],
  });

  assert.match(summary, /1 fetched/);
  assert.deepEqual(failureLines, []);
});
