import test from 'node:test';
import assert from 'node:assert/strict';

import { main, parseArgs, UsageError } from '../src/cli.js';
import { describeFailure, NO_SUBTITLES, RATE_LIMITED } from '../src/fetch-outcome.js';
import { FetchError, preflight, YtDlpMissingError } from '../src/ytdlp.js';

const URL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';

/** A fetch that failed the way a recorded process outcome says it did. */
function failingFetch(failure, lang = 'en') {
  return async () => {
    throw new FetchError(describeFailure({ failure, url: URL, lang }), {
      url: URL,
      exitCode: failure === NO_SUBTITLES ? 0 : 1,
      failure,
      retryable: failure === RATE_LIMITED,
    });
  };
}

/** Collects the lines main would have printed, so no test writes to a terminal. */
function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { out: (line) => out.push(line), err: (line) => err.push(line) } };
}

test('a missing yt-dlp is named, with something to install, rather than a stack trace', async () => {
  await assert.rejects(
    () => preflight({ binary: 'yt-dlp-definitely-not-installed' }),
    (error) => {
      assert.ok(error instanceof YtDlpMissingError);
      assert.match(error.message, /was not found on PATH/);
      assert.match(error.message, /install yt-dlp/i);
      assert.doesNotMatch(error.message, /at .*\(.*:\d+:\d+\)/, 'message reads like a stack trace');
      return true;
    },
  );
});

test('flags parse to the settled set', () => {
  assert.deepEqual(parseArgs(['o3CX_Y59_74']), {
    target: 'o3CX_Y59_74',
    lang: 'en',
    playlist: false,
  });
  assert.deepEqual(parseArgs(['--lang', 'el', '--playlist', 'o3CX_Y59_74']), {
    target: 'o3CX_Y59_74',
    lang: 'el',
    playlist: true,
  });
  assert.throws(() => parseArgs([]), UsageError);
  assert.throws(() => parseArgs(['--nope', 'o3CX_Y59_74']), UsageError);
  assert.throws(() => parseArgs(['--lang']), UsageError);
});

test('no target prints the usage and exits non-zero, spawning nothing', async () => {
  const { err, io } = capture();

  assert.equal(await main([], io), 1);
  assert.match(err.join('\n'), /Usage: yt-transcript/);
});

test('an unfetchable target is rejected before yt-dlp is ever reached', async () => {
  const { err, io } = capture();

  assert.equal(await main(['https://vimeo.com/123456'], io), 1);
  assert.match(err.join('\n'), /Not a YouTube video, playlist or channel/);
});

test('a playlist or channel says so plainly, since batches are not built yet', async () => {
  const { err, io } = capture();

  assert.equal(await main(['@freecodecamp'], io), 1);
  assert.match(err.join('\n'), /channel expands into a batch/);
});

// The failure path returns before any post-success work runs at all, which is
// why no `rebuildCatalog` stub is needed below. The catalog's own triggers are
// asserted in tests/catalog.test.js.
test('no usable subtitles exits 1, having written nothing', async () => {
  const { err, io } = capture();

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: failingFetch(NO_SUBTITLES),
  });

  assert.equal(code, 1);
  assert.match(err.join('\n'), /No subtitles in "en"/);
});

test('a rate-limited fetch exits 1 too — there is no second exit code', async () => {
  const { err, io } = capture();

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: failingFetch(RATE_LIMITED),
  });

  assert.equal(code, 1);
  assert.match(err.join('\n'), /Rate-limited fetching/);
  assert.match(err.join('\n'), /may succeed/);
});

test('a successful fetch exits 0, and --lang reaches it', async () => {
  const { out, io } = capture();

  const code = await main(['--lang', 'el', 'o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async ({ lang }) => {
      assert.equal(lang, 'el', '--lang did not reach the fetch');
      return { file: 'transcripts/a-talk.md', transcript: { url: URL, trackKind: 'auto' } };
    },
    // Stubbed so no test writes into the repository's own transcripts/.
    rebuildCatalog: async () => ({ file: 'transcripts/README.md', count: 1, warnings: [] }),
  });

  assert.equal(code, 0);
  assert.match(out.join('\n'), /transcripts\/a-talk\.md/);
});

test('each rung of the retry ladder is reported, naming the video', async () => {
  const { err, io } = capture();

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async (_video, { onRetry }) => {
      onRetry({ attempt: 1, attempts: 4, delayMs: 5000 });
      return failingFetch(RATE_LIMITED)();
    },
  });

  assert.equal(code, 1);
  assert.match(err.join('\n'), /Rate-limited fetching https:\/\/www\.youtube\.com\/watch\?v=o3CX_Y59_74 \(attempt 1 of 4\); retrying in 5s\./);
});
