import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { fetchTranscript } from '../src/fetch.js';
import {
  NO_SUBTITLES,
  NO_VIDEO,
  RATE_LIMITED,
  RETRY_DELAYS_MS,
  UNLISTED_VIDEO,
} from '../src/fetch-outcome.js';
// Production's own: there is no second temporary-directory rule to keep in
// step with it. Renamed at the import because what it holds here is the
// throwaway transcripts directory, so no test writes into the repository's.
import { withTempDir as withTranscriptsDir } from '../src/temp-dir.js';
import { FetchError, parseListing, parseMetadata } from '../src/ytdlp.js';
import { readXListing, readXPrintLine, readXTrack, X_TRACK_ID } from './fixtures.js';
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
    // A whole-post fetch, ranked by the playlist index yt-dlp reports with it.
    const fetchPost = (displayId, playlistIndex) =>
      fetchTranscript(
        { url: 'https://x.com/i/status/1', videoId: null, post: { videoNumber: 1 }, lang: 'en' },
        {
          dir,
          listVideos: async () => assert.fail('listed a whole-post fetch'),
          fetchTrack: async (request) => {
            const fetched = await recorded.fetchTrack(request);
            return { ...fetched, metadata: { ...fetched.metadata, displayId, playlistIndex } };
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

// Which of a post's videos was fetched. On a selector fetch of a multi-video
// post, yt-dlp numbers every video `#1`, so the post is listed and the fetched
// media id looked up in it (gcapnias/yt-transcript#7).

const CTV = 'ctv-1600649710662213632';
const CTV_POST = 'https://x.com/i/status/1600649710662213632';

/** The CTV post fetched as `name` records, with its videos listed on request. */
function recordedCtvFetch(name, { listing = CTV } = {}) {
  const fetched = recordedPostFetch(name);
  const listed = [];
  return {
    fetched,
    listed,
    /** Every yt-dlp invocation, the fetch and the listing both. */
    get invocations() {
      return fetched.calls.length + listed.length;
    },
    deps: {
      fetchTrack: fetched.fetchTrack,
      async listVideos(request) {
        listed.push(request);
        return parseListing(readXListing(listing));
      },
    },
  };
}

async function fetchCtv(url, recorded, dir, deps = {}) {
  return fetchTranscript(
    { url, videoId: null, post: { videoNumber: 1 }, lang: 'en' },
    { dir, ...recorded.deps, ...deps },
  );
}

test("a post's later video, fetched through /video/2, is named as that video", async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedCtvFetch(`${CTV}-video2`);
    const { transcript, file } = await fetchCtv(`${CTV_POST}/video/2`, recorded, dir);

    assert.equal(transcript.url, `${CTV_POST}/video/2`);
    assert.equal(transcript.collisionId, '1600649710662213632-2');
    assert.match(await fs.readFile(file, 'utf8'), /\nurl: https:\/\/x\.com\/i\/status\/1600649710662213632\/video\/2\n/);
    // The fetch, then one listing of the post the fetch reported.
    assert.equal(recorded.invocations, 2);
    assert.deepEqual(recorded.listed.map((request) => request.postId), ['1600649710662213632']);
  });
});

test("/video/1 and the bare post are one transcript, the later video another", async () => {
  await withTranscriptsDir(async (dir) => {
    const bare = recordedCtvFetch(`${CTV}-post`);
    const first = recordedCtvFetch(`${CTV}-video1`);
    const second = recordedCtvFetch(`${CTV}-video2`);

    const fromBare = await fetchCtv(CTV_POST, bare, dir);
    const fromFirst = await fetchCtv(`${CTV_POST}/video/1`, first, dir);
    await fetchCtv(`${CTV_POST}/video/2`, second, dir);

    assert.equal(fromBare.transcript.url, CTV_POST);
    assert.equal(fromFirst.transcript.url, CTV_POST);
    assert.equal(fromBare.transcript.collisionId, '1600649710662213632');
    assert.equal(fromFirst.transcript.collisionId, '1600649710662213632');
    assert.equal(fromFirst.file, fromBare.file, '/video/1 did not overwrite the bare post');
    assert.equal((await fs.readdir(dir)).length, 2, 'video 2 overwrote video 1');
  });
});

test('a bare post is one invocation, ranked by what the fetch reported', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedCtvFetch(`${CTV}-post`);
    await fetchCtv(CTV_POST, recorded, dir);

    assert.equal(recorded.invocations, 1);
  });
});

test('a selector fetch of a single-video post is one invocation', async () => {
  await withTranscriptsDir(async (dir) => {
    // A post of one video carries no rank suffix, selector or not.
    const recorded = recordedCtvFetch('poteto-2102050467505430555');
    const { transcript } = await fetchCtv('https://x.com/i/status/2102050467505430555/video/1', recorded, dir);

    assert.equal(transcript.url, 'https://x.com/i/status/2102050467505430555');
    assert.equal(recorded.invocations, 1);
  });
});

test('a t.co link is ranked as the whole-post fetch X redirects it to', async () => {
  await withTranscriptsDir(async (dir) => {
    // https://t.co/LOTC1G911U -> twitter.com/CTVJLaidlaw/status/<id>/video/1,
    // which X redirects to the bare post: no selector reaches yt-dlp.
    const recorded = recordedCtvFetch(`${CTV}-tco`);
    const { transcript } = await fetchCtv('https://t.co/LOTC1G911U', recorded, dir);

    assert.equal(transcript.url, CTV_POST);
    assert.equal(recorded.invocations, 1);
  });
});

test('a fetched video the listing lacks fails the post, and is never filed as the first', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedCtvFetch(`${CTV}-video2`);
    const url = `${CTV_POST}/video/2`;

    await assert.rejects(
      () =>
        fetchCtv(url, recorded, dir, {
          sleep: async () => assert.fail('retried a video that cannot be ranked'),
          listVideos: async () => [{ mediaId: '1600649511827038209', playlistIndex: 1 }],
        }),
      (error) =>
        error instanceof FetchError &&
        error.failure === UNLISTED_VIDEO &&
        error.retryable === false &&
        error.message.includes(url),
    );
    assert.deepEqual(await fs.readdir(dir), [], 'an unranked video was written');
  });
});

test('a rate-limited listing is retried with its fetch, each into a fresh directory', async () => {
  await withTranscriptsDir(async (dir) => {
    const recorded = recordedCtvFetch(`${CTV}-video2`);
    let listings = 0;

    const { transcript } = await fetchCtv(`${CTV_POST}/video/2`, recorded, dir, {
      sleep: async () => {},
      listVideos: async (request) => {
        listings += 1;
        if (listings === 1) throw recordedFailure({ failure: RATE_LIMITED, url: CTV_POST });
        return recorded.deps.listVideos(request);
      },
    });

    assert.equal(transcript.url, `${CTV_POST}/video/2`);
    assert.equal(recorded.fetched.calls.length, 2);
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
