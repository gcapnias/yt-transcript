import test from 'node:test';
import assert from 'node:assert/strict';

import { describeBatch, FETCH_DELAY_MS, runBatch } from '../src/batch.js';
import { describeFailure, NO_SUBTITLES, RATE_LIMITED } from '../src/fetch-outcome.js';
import { recordedFailure } from './recorded-outcomes.js';

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
      throw recordedFailure({ failure: RATE_LIMITED, url });
    },
    sleep,
  });

  assert.deepEqual(slept, [FETCH_DELAY_MS]);
});

test('one failing video does not stop the batch; the run collects and reports it', async () => {
  const { sleep } = clock();

  const result = await runBatch([A, B, C], {
    fetchOne: async ({ url, videoId }) => {
      if (url === B) throw recordedFailure({ failure: NO_SUBTITLES, url });
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

test('each failure is reported in full as it happens, not only counted at the end', async () => {
  const { sleep } = clock();
  const reported = [];

  await runBatch([A], {
    fetchOne: async ({ url }) => {
      throw recordedFailure({ failure: RATE_LIMITED, url });
    },
    sleep,
    onFailure: (entry) => reported.push(entry.message),
  });

  // The wording is normative: a rate-limited message names the video and says
  // a later run *may* succeed. A batch must not abbreviate that away.
  assert.equal(reported.length, 1);
  assert.equal(reported[0], describeFailure({ failure: RATE_LIMITED, url: A, lang: 'en' }));
  assert.match(reported[0], /may succeed/);
});

test('each successful fetch hands its transcript, file and passed-over tracks to onFetched', async () => {
  const handed = [];
  const { sleep } = clock();
  const passedOver = [{ kind: 'manual', key: 'en-abc' }];

  await runBatch([A, B], {
    fetchOne: async ({ url, videoId }) => ({
      file: `transcripts/${videoId}.md`,
      transcript: { url, trackKind: 'manual' },
      passedOver,
    }),
    sleep,
    onFetched: (entry) => handed.push(entry),
  });

  assert.deepEqual(handed, [
    {
      url: A,
      file: 'transcripts/4JofSJIrjwU.md',
      transcript: { url: A, trackKind: 'manual' },
      passedOver,
    },
    {
      url: B,
      file: 'transcripts/F3lL98Pj90o.md',
      transcript: { url: B, trackKind: 'manual' },
      passedOver,
    },
  ]);
});

test('a failed fetch is never handed to onFetched', async () => {
  const handed = [];
  const { sleep } = clock();

  await runBatch([A], {
    fetchOne: async ({ url }) => {
      throw recordedFailure({ failure: RATE_LIMITED, url });
    },
    sleep,
    onFetched: (entry) => handed.push(entry),
  });

  assert.deepEqual(handed, []);
});

test("a video's warnings come after its onFetched, before the next video", async () => {
  const events = [];
  const { sleep } = clock();

  await runBatch([A, B], {
    fetchOne: async ({ url, videoId }) => ({
      file: `transcripts/${videoId}.md`,
      transcript: { url, trackKind: 'auto', warnings: [`warn ${videoId}`] },
    }),
    sleep,
    onProgress: ({ position }) => events.push(`progress ${position}`),
    onFetched: ({ url }) => events.push(`fetched ${url}`),
    onWarning: (warning) => events.push(warning),
  });

  assert.deepEqual(events, [
    'progress 1',
    `fetched ${A}`,
    'warn 4JofSJIrjwU',
    'progress 2',
    `fetched ${B}`,
    'warn F3lL98Pj90o',
  ]);
});

test('an onFetched that throws does not turn a written transcript into a failure', async () => {
  const warned = [];
  const { sleep } = clock();

  const result = await runBatch([A, B], {
    fetchOne: recordingFetch(),
    sleep,
    onFetched: () => {
      throw new Error('stdout closed');
    },
    onWarning: (warning) => warned.push(warning),
    onFailure: () => assert.fail('a report error was recorded as a failed fetch'),
  });

  assert.equal(result.failures.length, 0);
  assert.equal(result.fetched.length, 2);
  assert.deepEqual(warned, [
    'transcripts/4JofSJIrjwU.md was written, but reporting it failed: stdout closed',
    'transcripts/F3lL98Pj90o.md was written, but reporting it failed: stdout closed',
  ]);
});

test('an onWarning that throws is not swallowed, and is not a failed fetch either', async () => {
  const { sleep } = clock();
  const failed = [];

  await assert.rejects(
    runBatch([A], {
      fetchOne: async ({ url, videoId }) => ({
        file: `transcripts/${videoId}.md`,
        transcript: { url, trackKind: 'auto', warnings: ['careful'] },
      }),
      sleep,
      onWarning: () => {
        throw new Error('stderr closed');
      },
      onFailure: (entry) => failed.push(entry),
    }),
    /stderr closed/,
  );
  assert.deepEqual(failed, []);
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
  // Self-sufficient at a distance: on a long batch the full report of this
  // failure is hundreds of progress lines further up.
  assert.equal(failureLines[1], `  ${B} (${NO_SUBTITLES})`);
});

test('a failure with no classification still makes the roll-call', () => {
  const { failureLines } = describeBatch({
    fetched: [],
    skipped: [],
    failures: [{ url: A, failure: null, message: 'EPERM: operation not permitted' }],
  });

  assert.equal(failureLines[1], `  ${A}`);
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
