import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyFetch,
  classifyPostFetch,
  describeFailure,
  describeRetry,
  withRateLimitRetries,
  LOGIN_REQUIRED,
  NO_POST_IDENTITY,
  NO_SUBTITLES,
  NO_SUCH_VIDEO,
  NO_VIDEO,
  NOT_AN_X_POST,
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

// Recorded from yt-dlp 2026.08.19 on QIHnmqYU614, asking for `en,en-US,en-GB`
// with `--ignore-errors`: the translated `en` refused, and the run exited 0.
const SUBTITLE_429 = "WARNING: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests\n";

test('a non-zero exit is decided by its exit code, whatever stderr says', () => {
  const rateLimited = {
    exitCode: 1,
    hasTrack: false,
    stderr: 'ERROR: HTTP Error 429: Too Many Requests',
  };

  assert.equal(classifyFetch(rateLimited).failure, RATE_LIMITED);
  assert.equal(classifyFetch(rateLimited).retryable, true);
  assert.equal(classifyFetch({ exitCode: 1, hasTrack: false }).failure, RATE_LIMITED);
});

test('exit 0 with no track is rate-limited when a subtitle download was refused with a 429', () => {
  // `--ignore-errors` turns the refusal into a warning (ADR-0006), so the
  // exit code no longer tells it from a video with no English at all.
  assert.deepEqual(classifyFetch({ exitCode: 0, hasTrack: false, stderr: SUBTITLE_429 }), {
    ok: false,
    failure: RATE_LIMITED,
    retryable: true,
  });
});

test('exit 0 with no track and no refused download has no subtitles', () => {
  for (const stderr of [
    undefined,
    '',
    'WARNING: There are no subtitles for the requested languages\n',
    // A 429 that is not a subtitle download's is not this warning.
    'WARNING: [youtube] QIHnmqYU614: HTTP Error 429: Too Many Requests\n',
  ]) {
    assert.deepEqual(
      classifyFetch({ exitCode: 0, hasTrack: false, stderr }),
      { ok: false, failure: NO_SUBTITLES, retryable: false },
      String(stderr),
    );
  }
});

test('a track that arrived is a success, whichever alternatives were refused', () => {
  assert.deepEqual(classifyFetch({ exitCode: 0, hasTrack: true, stderr: SUBTITLE_429 }), { ok: true });
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

  // The ladder is what feeds describeRetry, so the keys it emits are the keys
  // that function reads. Drift here reads as "retrying in NaNs" to a user.
  assert.deepEqual(Object.keys(reported[0]).sort(), ['attempt', 'attempts', 'delayMs', 'error']);
  assert.deepEqual(
    reported.map((entry) => entry.delayMs),
    RETRY_DELAYS_MS,
  );
  assert.equal(reported[0].attempts, RETRY_DELAYS_MS.length + 1);
  assert.match(describeRetry(reported[0]), /attempt 1 of 4.*5s/);
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

// X posts. Every non-zero exit is still one exit code, but unlike YouTube's
// the permanent X failures have no other tell than the extractor's own message,
// so the stderr text is read — for posts only, and only after exit 1.

const POST_URL = 'https://x.com/poteto/status/2102050467505430555';
const post = (overrides) => ({ exitCode: 1, hasTrack: false, stderr: '', extractorKey: '', ...overrides });

test('a post fetch succeeds, or has no subtitles, exactly as a YouTube one does', () => {
  const identity = { uploaderId: 'poteto', displayId: '2102050467505430555' };
  assert.deepEqual(classifyPostFetch(post({ exitCode: 0, hasTrack: true, extractorKey: 'Twitter', ...identity })), {
    ok: true,
  });
  assert.deepEqual(classifyPostFetch(post({ exitCode: 0, extractorKey: 'Twitter' })), {
    ok: false,
    failure: NO_SUBTITLES,
    retryable: false,
  });
});

test('a post fetch with no track is rate-limited only when a subtitle download was refused', () => {
  const answered = { exitCode: 0, extractorKey: 'Twitter' };

  assert.deepEqual(classifyPostFetch(post({ ...answered, stderr: SUBTITLE_429 })), {
    ok: false,
    failure: RATE_LIMITED,
    retryable: true,
  });
  assert.deepEqual(classifyPostFetch(post({ ...answered, stderr: '' })), {
    ok: false,
    failure: NO_SUBTITLES,
    retryable: false,
  });
  // A track from X, with what identifies it, is a success despite the warning.
  assert.deepEqual(
    classifyPostFetch(
      post({
        ...answered,
        hasTrack: true,
        stderr: SUBTITLE_429,
        uploaderId: 'poteto',
        displayId: '2102050467505430555',
      }),
    ),
    { ok: true },
  );
});

test('the permanent post failures are told apart from rate limiting, and never retried', () => {
  const recorded = [
    // Recorded from yt-dlp 2026.08.19.
    ['ERROR: [twitter] 20: No video could be found in this tweet', NO_VIDEO],
    ['ERROR: [twitter] 2102344659276099794: Video #2 is unavailable', NO_SUCH_VIDEO],
    // From the extractor's source: no protected or NSFW post could be reached.
    [
      'ERROR: [twitter] 1: NSFW tweet requires authentication. Use --cookies, --cookies-from-browser',
      LOGIN_REQUIRED,
    ],
    [
      'ERROR: [twitter] 1: You are not authorized to view this protected tweet. Use --cookies',
      LOGIN_REQUIRED,
    ],
    // A link-only post followed to another site's extractor, and failing there.
    ['ERROR: [generic] https://example.com/a: HTTP Error 404: Not Found', NOT_AN_X_POST],
    ['ERROR: Unsupported URL: https://www.nasa.gov/live', NOT_AN_X_POST],
    // The same words mean different things by who said them: X's extractor
    // finding no video in the post, or another site's finding none at the link.
    ['ERROR: [twitter] 1: No video formats found!; please report this issue', NO_VIDEO],
    ['ERROR: [generic] https://example.com/a: No video formats found!', NOT_AN_X_POST],
  ];

  for (const [stderr, failure] of recorded) {
    assert.deepEqual(
      classifyPostFetch(post({ stderr })),
      { ok: false, failure, retryable: false },
      stderr,
    );
  }
});

test('a post fetch that fails any other way is still rate-limited, and retried', () => {
  for (const stderr of ['', 'ERROR: [twitter] 1: HTTP Error 429: Too Many Requests']) {
    assert.deepEqual(classifyPostFetch(post({ stderr })), {
      ok: false,
      failure: RATE_LIMITED,
      retryable: true,
    });
  }
});

test('a video that came from another site is never a post transcript', () => {
  // A link-only post can make yt-dlp follow the link to a YouTube video, and
  // exit 0 with a track. Writing that under the X post's url would be a lie.
  assert.deepEqual(classifyPostFetch(post({ exitCode: 0, hasTrack: true, extractorKey: 'Youtube' })), {
    ok: false,
    failure: NOT_AN_X_POST,
    retryable: false,
  });
});

test('an X success with no handle or post id is refused: there is nothing to file it under', () => {
  const identified = { exitCode: 0, hasTrack: true, extractorKey: 'Twitter' };

  for (const missing of [
    { uploaderId: '', displayId: '2102050467505430555' },
    { uploaderId: 'poteto', displayId: '' },
    {},
  ]) {
    assert.deepEqual(
      classifyPostFetch(post({ ...identified, ...missing })),
      { ok: false, failure: NO_POST_IDENTITY, retryable: false },
      JSON.stringify(missing),
    );
  }

  assert.deepEqual(
    classifyPostFetch(post({ ...identified, uploaderId: 'poteto', displayId: '2102050467505430555' })),
    { ok: true },
  );
});

test('every post failure message names the post and says nothing was written', () => {
  for (const failure of [NO_VIDEO, NO_SUCH_VIDEO, LOGIN_REQUIRED, NOT_AN_X_POST, NO_POST_IDENTITY]) {
    const message = describeFailure({ failure, url: POST_URL, lang: 'en' });
    assert.ok(message.includes(POST_URL), `${failure} did not name the post`);
    assert.match(message, /Nothing was written/);
    assert.doesNotMatch(message, /rate.?limit/i);
  }

  assert.match(describeFailure({ failure: NO_VIDEO, url: POST_URL, lang: 'en' }), /no video/i);
  assert.match(describeFailure({ failure: NO_SUCH_VIDEO, url: POST_URL, lang: 'en' }), /no such video/i);
  assert.match(
    describeFailure({ failure: LOGIN_REQUIRED, url: POST_URL, lang: 'en' }),
    /requires logging in.*does not do/s,
  );
});
