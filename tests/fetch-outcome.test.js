import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyFetch,
  describeFailure,
  describeRetry,
  withRateLimitRetries,
  NO_SUBTITLES,
  RATE_LIMITED,
  RETRY_DELAYS_MS,
} from '../src/fetch-outcome.js';

test('success needs exit 0 and a subtitle track, both halves', () => {
  assert.deepEqual(classifyFetch({ exitCode: 0, hasTrack: true }), { ok: true });

  // A video with no captions in the requested language exits 0 and writes
  // nothing. Exit 0 alone is not success.
  assert.deepEqual(classifyFetch({ exitCode: 0, hasTrack: false }), {
    ok: false,
    failure: NO_SUBTITLES,
    retryable: false,
  });

  // A non-zero exit that somehow left a file behind is still a failure.
  assert.deepEqual(classifyFetch({ exitCode: 1, hasTrack: true }), {
    ok: false,
    failure: RATE_LIMITED,
    retryable: true,
  });
});

test('the exit code alone decides, so no stderr text is parsed', () => {
  // The classifier takes no stderr at all; anything handed to it beside the
  // exit code is ignored, including the very text a parser would key on.
  const rateLimited = {
    exitCode: 1,
    hasTrack: false,
    stderr: 'ERROR: HTTP Error 429: Too Many Requests',
  };
  const noCaptions = {
    exitCode: 0,
    hasTrack: false,
    stderr: 'There are no subtitles for the requested languages\nHTTP Error 429',
  };

  assert.equal(classifyFetch(rateLimited).failure, RATE_LIMITED);
  assert.equal(classifyFetch(rateLimited).retryable, true);
  assert.equal(classifyFetch(noCaptions).failure, NO_SUBTITLES);
  assert.equal(classifyFetch(noCaptions).retryable, false);
});

test('a rate-limited fetch is retried once per delay, in the settled ladder', async () => {
  const slept = [];
  const reported = [];
  let attempts = 0;

  await assert.rejects(
    () =>
      withRateLimitRetries(
        async () => {
          attempts += 1;
          throw Object.assign(new Error('rate limited'), { retryable: true });
        },
        { sleep: async (ms) => slept.push(ms), onRetry: (entry) => reported.push(entry) },
      ),
    /rate limited/,
  );

  assert.deepEqual(slept, [5000, 15000, 45000]);
  assert.deepEqual(RETRY_DELAYS_MS, [5000, 15000, 45000]);
  assert.equal(attempts, RETRY_DELAYS_MS.length + 1);
  assert.equal(reported.length, RETRY_DELAYS_MS.length);
  assert.deepEqual(
    reported.map((entry) => entry.attempt),
    [1, 2, 3],
  );
});

test('a retried fetch that succeeds stops climbing the ladder', async () => {
  const slept = [];
  let attempts = 0;

  const value = await withRateLimitRetries(
    async () => {
      attempts += 1;
      if (attempts < 2) throw Object.assign(new Error('rate limited'), { retryable: true });
      return 'transcript';
    },
    { sleep: async (ms) => slept.push(ms) },
  );

  assert.equal(value, 'transcript');
  assert.equal(attempts, 2);
  assert.deepEqual(slept, [5000]);
});

test('a permanent failure is not retried', async () => {
  const slept = [];
  let attempts = 0;

  await assert.rejects(
    () =>
      withRateLimitRetries(
        async () => {
          attempts += 1;
          throw Object.assign(new Error('no subtitles'), { retryable: false });
        },
        { sleep: async (ms) => slept.push(ms) },
      ),
    /no subtitles/,
  );

  assert.equal(attempts, 1);
  assert.deepEqual(slept, []);
});

test('an error that is not a fetch failure at all is never retried', async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      withRateLimitRetries(
        async () => {
          attempts += 1;
          throw new TypeError('something else broke');
        },
        { sleep: async () => assert.fail('slept over a non-retryable error') },
      ),
    TypeError,
  );

  assert.equal(attempts, 1);
});

test('the rate-limited message names the video and promises nothing', () => {
  const url = 'https://www.youtube.com/watch?v=o3CX_Y59_74';
  const message = describeFailure({ failure: RATE_LIMITED, url, lang: 'en' });

  assert.ok(message.includes(url), 'the message does not name the video');
  assert.match(message, /may succeed/);
  // A near-zero standing allowance, not a refilling quota: the wording may say
  // a later run *may* succeed, and nothing stronger.
  for (const oversold of [/try again later/i, /will succeed/i, /wait \d/i, /resets?\b/i, /refill/i]) {
    assert.doesNotMatch(message, oversold);
  }
});

test('the retry line names the video and the wait', () => {
  const url = 'https://www.youtube.com/watch?v=o3CX_Y59_74';
  const line = describeRetry({ url, attempt: 1, attempts: 4, delayMs: 5000 });

  assert.ok(line.includes(url));
  assert.match(line, /rate.?limited/i);
  assert.match(line, /5s|5 seconds/);
});

test('no failure message names a language other than the one asked for', () => {
  const url = 'https://www.youtube.com/watch?v=o3CX_Y59_74';

  for (const failure of [NO_SUBTITLES, RATE_LIMITED]) {
    const message = describeFailure({ failure, url, lang: 'el' });
    assert.ok(message.includes(url));
    // The original spoken language is never surfaced, never named in an error
    // and never suggested as a --lang value. The signature is the guarantee —
    // no other language can reach this function — and this is the guard rail.
    assert.doesNotMatch(message, /--lang/);
    assert.doesNotMatch(message, /\b(english|spanish|german|french|original language)\b/i);
  }

  assert.match(describeFailure({ failure: NO_SUBTITLES, url, lang: 'el' }), /"el"/);
});
