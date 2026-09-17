import test from 'node:test';
import assert from 'node:assert/strict';

import { main, parseArgs, UsageError } from '../src/cli.js';
import { describeFailure, NO_SUBTITLES, RATE_LIMITED } from '../src/fetch-outcome.js';
import { ExpansionError, preflight, YtDlpMissingError } from '../src/ytdlp.js';
import { recordedFailure } from './recorded-outcomes.js';

const URL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';
const PLAYLIST = 'https://www.youtube.com/playlist?list=PLWKjhJtqVAbk';
const VIDEOS = [
  'https://www.youtube.com/watch?v=4JofSJIrjwU',
  'https://www.youtube.com/watch?v=F3lL98Pj90o',
  'https://www.youtube.com/watch?v=gaDdrDdczO4',
];

/** A fetch that failed the way a recorded process outcome says it did. */
function failingFetch(failure, lang = 'en') {
  return async () => {
    throw recordedFailure({ failure, url: URL, lang });
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
    force: false,
  });
  assert.deepEqual(parseArgs(['--lang', 'el', '--playlist', '--force', 'o3CX_Y59_74']), {
    target: 'o3CX_Y59_74',
    lang: 'el',
    playlist: true,
    force: true,
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

test('an unfetchable target is rejected before yt-dlp is ever reached, playlist flag or not', async () => {
  const { err, io } = capture();

  assert.equal(await main(['--playlist', 'https://vimeo.com/123456'], io), 1);
  assert.match(err.join('\n'), /Not a YouTube video, playlist or channel/);
});

// The failure path returns before any post-success work runs at all, which is
// why no `rebuildCatalog` stub is needed below.
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

test('a successful fetch reports the video title, channel, duration and upload date', async () => {
  const { out, io } = capture();

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async () => ({
      file: 'transcripts/a-talk.md',
      transcript: {
        url: URL,
        trackKind: 'auto',
        video: {
          title: 'OpenAI Codex Crash Course',
          channel: 'freeCodeCamp.org',
          duration: '41:18',
          uploaded: '2026-09-10',
        },
      },
    }),
    rebuildCatalog: async () => ({ file: 'transcripts/README.md', count: 1, warnings: [] }),
  });

  assert.equal(code, 0);
  const report = out.join('\n');
  assert.match(report, /^transcripts\/a-talk\.md$/m);
  assert.match(report, /^ +title +OpenAI Codex Crash Course$/m);
  assert.match(report, /^ +channel +freeCodeCamp\.org$/m);
  assert.match(report, /^ +duration +41:18$/m);
  assert.match(report, /^ +uploaded +2026-09-10$/m);
  assert.match(report, /\(auto subtitle track\)/);
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

// The catalog's two triggers are CLI wiring, so they belong here rather than
// beside the rendering rules. The rebuild itself is stubbed throughout: what
// is under test is that it fires, once, on exactly the right paths.

test('`yt-transcript catalog` rebuilds without fetching anything', async () => {
  const { out, io } = capture();
  let rebuilds = 0;

  const code = await main(['catalog'], io, {
    preflight: async () => assert.fail('catalog preflighted yt-dlp'),
    fetchTranscript: async () => assert.fail('catalog fetched something'),
    rebuildCatalog: async () => {
      rebuilds += 1;
      return { file: 'transcripts/README.md', count: 3, warnings: [] };
    },
  });

  assert.equal(code, 0);
  assert.equal(rebuilds, 1);
  assert.match(out.join('\n'), /transcripts\/README\.md/);
  assert.match(out.join('\n'), /3 transcripts/);
});

test('catalog takes no target and no flags', async () => {
  const { err, io } = capture();

  assert.equal(await main(['catalog', 'o3CX_Y59_74'], io, { rebuildCatalog: async () => {} }), 1);
  assert.match(err.join('\n'), /Usage: yt-transcript/);
});

test('a successful single-video fetch rebuilds the catalog exactly once', async () => {
  const { io, err } = capture();
  let rebuilds = 0;

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async () => ({
      file: 'transcripts/a-talk.md',
      transcript: { url: URL, trackKind: 'auto' },
    }),
    rebuildCatalog: async () => {
      rebuilds += 1;
      return { file: 'transcripts/README.md', count: 1, warnings: ['a-bad-file.md is malformed'] };
    },
  });

  assert.equal(code, 0);
  assert.equal(rebuilds, 1);
  // A malformed neighbour is reported, never fatal.
  assert.match(err.join('\n'), /a-bad-file\.md/);
});

test('a failed fetch rebuilds nothing', async () => {
  const { io } = capture();

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: failingFetch(NO_SUBTITLES),
    rebuildCatalog: async () => assert.fail('a failed fetch rebuilt the catalog'),
  });

  assert.equal(code, 1);
});

test('a written transcript is still reported when the rebuild itself fails', async () => {
  const { out, err, io } = capture();

  const code = await main(['o3CX_Y59_74'], io, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async () => ({
      file: 'transcripts/a-talk.md',
      transcript: { url: URL, trackKind: 'auto' },
    }),
    rebuildCatalog: async () => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    },
  });

  assert.equal(code, 1);
  assert.match(out.join('\n'), /transcripts\/a-talk\.md/);
  assert.match(err.join('\n'), /yt-transcript catalog/);
});

// Batches. The expansion spawn, the real one-second delay and the disk scan
// are all injected here: what is under test is the command's wiring and its
// exit codes, and the suite must never sleep for a real second.

/** Everything a batch reaches for, stubbed, with the counters worth asserting. */
function batchDeps(overrides = {}) {
  const counters = { rebuilds: 0, fetched: [], slept: [] };
  const deps = {
    preflight: async () => '2026.09.01',
    expandPlaylist: async () => VIDEOS,
    readExistingUrls: async () => [],
    sleep: async (ms) => void counters.slept.push(ms),
    fetchTranscript: async ({ url, videoId }) => {
      counters.fetched.push(url);
      return { file: `transcripts/${videoId}.md`, transcript: { url, trackKind: 'auto' } };
    },
    rebuildCatalog: async () => {
      counters.rebuilds += 1;
      return { file: 'transcripts/README.md', count: counters.fetched.length, warnings: [] };
    },
    ...overrides,
  };
  return { counters, deps };
}

test('a playlist fetches every video in it, one per-video fetch each', async () => {
  const { counters, deps } = batchDeps();
  const { out, io } = capture();

  const code = await main([PLAYLIST], io, deps);

  assert.equal(code, 0);
  assert.deepEqual(counters.fetched, VIDEOS);
  assert.match(out.join('\n'), /3 fetched, 0 skipped, 0 failed/);
});

test('a bare @handle expands the channel, through its Videos tab', async () => {
  let expandedUrl = null;
  const { deps } = batchDeps({
    expandPlaylist: async ({ url }) => {
      expandedUrl = url;
      return VIDEOS.slice(0, 1);
    },
  });
  const { io } = capture();

  assert.equal(await main(['@freecodecamp'], io, deps), 0);
  assert.equal(expandedUrl, 'https://www.youtube.com/@freecodecamp/videos');
});

test('watch?v=...&list=... fetches only the video, and --playlist takes the playlist', async () => {
  const both = 'https://www.youtube.com/watch?v=o3CX_Y59_74&list=PLWKjhJtqVAbk';

  const single = batchDeps({
    expandPlaylist: async () => assert.fail('a watch?v=...&list=... URL expanded by default'),
  });
  assert.equal(await main([both], capture().io, single.deps), 0);
  assert.deepEqual(single.counters.fetched, [URL]);

  const batched = batchDeps();
  assert.equal(await main(['--playlist', both], capture().io, batched.deps), 0);
  assert.deepEqual(batched.counters.fetched, VIDEOS);
});

test('re-running a batch fetches nothing that is already on disk', async () => {
  const { counters, deps } = batchDeps({ readExistingUrls: async () => VIDEOS });
  const { out, io } = capture();

  // An all-skipped batch is a success, and still rebuilds exactly once.
  assert.equal(await main([PLAYLIST], io, deps), 0);
  assert.deepEqual(counters.fetched, []);
  assert.equal(counters.rebuilds, 1);
  assert.match(out.join('\n'), /0 fetched, 3 skipped, 0 failed/);
});

test('--force re-fetches everything in the batch and changes nothing else', async () => {
  const { counters, deps } = batchDeps({ readExistingUrls: async () => VIDEOS });
  const { io } = capture();

  assert.equal(await main(['--force', PLAYLIST], io, deps), 0);
  assert.deepEqual(counters.fetched, VIDEOS);
  assert.equal(counters.rebuilds, 1);
  assert.deepEqual(counters.slept, [1000, 1000], '--force changed the pacing too');
});

test('--force on a single video is accepted, since one video overwrites anyway', async () => {
  const { counters, deps } = batchDeps();
  const { io } = capture();

  assert.equal(await main(['--force', 'o3CX_Y59_74'], io, deps), 0);
  assert.deepEqual(counters.fetched, [URL]);
});

test('one failing video does not stop the batch, and the run exits non-zero naming it', async () => {
  const { counters, deps } = batchDeps({
    fetchTranscript: async ({ url, videoId }) => {
      if (url === VIDEOS[1]) throw recordedFailure({ failure: NO_SUBTITLES, url });
      return { file: `transcripts/${videoId}.md`, transcript: { url, trackKind: 'auto' } };
    },
  });
  const { out, err, io } = capture();

  const code = await main([PLAYLIST], io, deps);

  assert.equal(code, 1);
  assert.equal(counters.rebuilds, 1, 'a batch with a failure skipped its one rebuild');
  assert.match(out.join('\n'), /2 fetched, 0 skipped, 1 failed/);
  assert.match(err.join('\n'), /F3lL98Pj90o/);
});

test('a batch reports a failure in the same words the single-video path does', async () => {
  const { deps } = batchDeps({
    expandPlaylist: async () => VIDEOS.slice(0, 1),
    fetchTranscript: async ({ url }) => {
      throw recordedFailure({ failure: RATE_LIMITED, url });
    },
  });
  const { err, io } = capture();

  assert.equal(await main([PLAYLIST], io, deps), 1);
  // Normative wording, whole: naming the video, and saying a later run *may*
  // succeed and nothing stronger.
  assert.ok(
    err.includes(describeFailure({ failure: RATE_LIMITED, url: VIDEOS[0], lang: 'en' })),
    'the batch abbreviated a failure message the spec settles word by word',
  );
});

test('consecutive fetches are spaced, and the catalog is rebuilt exactly once', async () => {
  const { counters, deps } = batchDeps();
  const { io } = capture();

  assert.equal(await main([PLAYLIST], io, deps), 0);

  assert.deepEqual(counters.slept, [1000, 1000]);
  assert.equal(counters.rebuilds, 1);
});

test('a batch that expands to zero videos is a success, and still rebuilds once', async () => {
  const { counters, deps } = batchDeps({ expandPlaylist: async () => [] });
  const { out, io } = capture();

  assert.equal(await main([PLAYLIST], io, deps), 0);
  assert.deepEqual(counters.fetched, []);
  assert.equal(counters.rebuilds, 1);
  assert.match(out.join('\n'), /0 fetched, 0 skipped, 0 failed/);
});

test('expansion failure is a hard error: nothing is fetched and nothing is rebuilt', async () => {
  const { counters, deps } = batchDeps({
    expandPlaylist: async ({ url }) => {
      throw new ExpansionError(url, 1, 'ERROR: The playlist does not exist.');
    },
    rebuildCatalog: async () => assert.fail('a failed expansion rebuilt the catalog'),
  });
  const { err, io } = capture();

  assert.equal(await main([PLAYLIST], io, deps), 1);
  assert.deepEqual(counters.fetched, []);
  assert.match(err.join('\n'), /Could not read the playlist or channel/);
});

test('a batch does not consult the disk at all when --force is given', async () => {
  const { deps } = batchDeps({
    readExistingUrls: async () => assert.fail('--force still scanned transcripts/'),
  });

  assert.equal(await main(['--force', PLAYLIST], capture().io, deps), 0);
});

test("a malformed neighbour warns without costing the batch its exit code", async () => {
  const { deps } = batchDeps({
    rebuildCatalog: async () => ({
      file: 'transcripts/README.md',
      count: 3,
      warnings: ['Skipped broken.md: its frontmatter is not readable. Re-download it to restore it.'],
    }),
  });
  const { err, io } = capture();

  assert.equal(await main([PLAYLIST], io, deps), 0);
  assert.match(err.join('\n'), /broken\.md/);
});

test('a batch reports what it fetched even when the single rebuild fails', async () => {
  const { deps } = batchDeps({
    rebuildCatalog: async () => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    },
  });
  const { out, err, io } = capture();

  const code = await main([PLAYLIST], io, deps);

  assert.equal(code, 1);
  assert.match(out.join('\n'), /3 fetched/);
  assert.match(err.join('\n'), /yt-transcript catalog/);
});

test('a batch preflights yt-dlp before it expands anything', async () => {
  const { deps } = batchDeps({
    preflight: async () => {
      throw new YtDlpMissingError('yt-dlp');
    },
    expandPlaylist: async () => assert.fail('a missing yt-dlp still spawned an expansion'),
  });
  const { err, io } = capture();

  assert.equal(await main([PLAYLIST], io, deps), 1);
  assert.match(err.join('\n'), /was not found on PATH/);
});

test('each rung of the retry ladder is reported inside a batch too', async () => {
  const { deps } = batchDeps({
    fetchTranscript: async ({ url, videoId }, { onRetry }) => {
      onRetry({ attempt: 1, attempts: 4, delayMs: 5000 });
      return { file: `transcripts/${videoId}.md`, transcript: { url, trackKind: 'auto' } };
    },
    expandPlaylist: async () => VIDEOS.slice(0, 1),
  });
  const { err, io } = capture();

  assert.equal(await main([PLAYLIST], io, deps), 0);
  assert.match(err.join('\n'), /4JofSJIrjwU \(attempt 1 of 4\); retrying in 5s\./);
});
