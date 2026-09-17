import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { fetchTranscript } from '../src/fetch.js';
import { NO_SUBTITLES, RATE_LIMITED, RETRY_DELAYS_MS } from '../src/fetch-outcome.js';
import { fetchArgs, FetchError, findSubtitleTrack } from '../src/ytdlp.js';
import { main } from '../src/cli.js';

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

/** A recorded process outcome, replayed instead of spawning `yt-dlp`. */
function recordedFetch(outcomes) {
  const calls = [];
  const remaining = [...outcomes];

  return {
    calls,
    async fetch({ url, lang, destDir }) {
      calls.push({ url, lang, destDir });
      const outcome = remaining.shift() ?? outcomes.at(-1);

      if (outcome.failure) {
        throw new FetchError(`recorded ${outcome.failure}`, {
          url,
          exitCode: outcome.failure === NO_SUBTITLES ? 0 : 1,
          failure: outcome.failure,
          retryable: outcome.failure === RATE_LIMITED,
        });
      }

      // A successful fetch leaves the track in the per-run temporary directory.
      const trackPath = path.join(destDir, `${VIDEO_ID}.en.vtt`);
      await fs.writeFile(trackPath, TRACK, 'utf8');
      return { metadata: METADATA, trackPath };
    },
  };
}

async function withTranscriptsDir(use) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-transcript-test-'));
  try {
    return await use(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('a fetch that exits 0 but writes no subtitle file is a failure, not a success', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedFetch([{ failure: NO_SUBTITLES }]);

    await assert.rejects(
      () =>
        fetchTranscript(
          { url: URL, videoId: VIDEO_ID, lang: 'en' },
          { fetch: recorded.fetch, dir, sleep: async () => assert.fail('retried a permanent failure') },
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

test('a zero-byte subtitle file is no subtitle file', async () => {
  await withTranscriptsDir(async (dir) => {
    await fs.writeFile(path.join(dir, `${VIDEO_ID}.en.vtt`), '', 'utf8');
    assert.equal(await findSubtitleTrack(dir), null);

    await fs.writeFile(path.join(dir, `${VIDEO_ID}.el.vtt`), TRACK, 'utf8');
    assert.equal(await findSubtitleTrack(dir), path.join(dir, `${VIDEO_ID}.el.vtt`));
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
            fetch: recorded.fetch,
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
      { fetch: recorded.fetch, dir, sleep: async (ms) => slept.push(ms) },
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
      { fetch: recorded.fetch, dir, sleep: async () => {} },
    );

    const dirs = recorded.calls.map((call) => call.destDir);
    assert.equal(new Set(dirs).size, dirs.length, 'a retry reused the failed attempt’s directory');
    for (const destDir of dirs) {
      await assert.rejects(() => fs.stat(destDir), { code: 'ENOENT' });
    }
  });
});

test('the requested language reaches yt-dlp exactly as asked', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedFetch([{}]);

    await fetchTranscript(
      { url: URL, videoId: VIDEO_ID, lang: 'en' },
      { fetch: recorded.fetch, dir, sleep: async () => {} },
    );

    assert.equal(recorded.calls[0].lang, 'en', 'the default language is not en');
  });
});

test('--lang is passed to yt-dlp verbatim, and matched exactly', () => {
  const args = fetchArgs({ url: URL, lang: 'en', destDir: '/tmp/run' });

  assert.equal(args[args.indexOf('--sub-langs') + 1], 'en');
  // `en` must not match `en-US`, `en-orig` is never requested, and the
  // exact match is also what keeps `live_chat` out.
  assert.ok(!args.includes('all'), 'broadened to --sub-langs all');
  assert.ok(!args.some((arg) => arg.endsWith('-orig')), 'requested an -orig track');
  assert.deepEqual(
    fetchArgs({ url: URL, lang: 'el', destDir: '/tmp/run' }).filter((arg) => arg === 'el'),
    ['el'],
  );
});

/** Collects the lines main would have printed, so no test writes to a terminal. */
function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { out: (line) => out.push(line), err: (line) => err.push(line) } };
}

// No catalog rebuild is asserted here because there is nothing to rebuild yet
// (that is ytdlp-xmu.4): the failure path returns before any post-success work
// runs at all, which is the property that keeps it true once the catalog lands.
test('no usable subtitles exits 1 and writes nothing', async () => {
  const { err, io } = capture();

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async () => {
      throw new FetchError('No subtitles in "en" are available for ' + URL, {
        url: URL,
        exitCode: 0,
        failure: NO_SUBTITLES,
        retryable: false,
      });
    },
  });

  assert.equal(code, 1);
  assert.match(err.join('\n'), /No subtitles in "en"/);
});

test('a rate-limited fetch exits 1 — there is no second exit code', async () => {
  const { err, io } = capture();

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async () => {
      throw new FetchError('Rate-limited fetching ' + URL + '; a later run may succeed.', {
        url: URL,
        exitCode: 1,
        failure: RATE_LIMITED,
        retryable: true,
      });
    },
  });

  assert.equal(code, 1);
  assert.match(err.join('\n'), /Rate-limited/);
});

test('a successful fetch exits 0', async () => {
  const { out, io } = capture();

  const code = await main(['--lang', 'el', 'o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async ({ lang }) => {
      assert.equal(lang, 'el', '--lang did not reach the fetch');
      return {
        file: 'transcripts/a-talk.md',
        transcript: { url: URL, trackKind: 'auto' },
      };
    },
  });

  assert.equal(code, 0);
  assert.match(out.join('\n'), /transcripts\/a-talk\.md/);
});
