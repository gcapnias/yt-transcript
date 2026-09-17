import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { NO_SUBTITLES, RATE_LIMITED } from '../src/fetch-outcome.js';
import {
  expandArgs,
  ExpansionError,
  fetchArgs,
  fetchFailure,
  FetchError,
  findSubtitleTrack,
  parseExpansion,
} from '../src/ytdlp.js';
import { withTempDir } from '../src/temp-dir.js';

const URL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';


// The other half of the success test — exit 0 alone is not success — and the
// only half that is about bytes on disk rather than the exit code.
test('a zero-byte subtitle file is no subtitle file', async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'o3CX_Y59_74.en.vtt'), '', 'utf8');
    assert.equal(await findSubtitleTrack(dir), null);

    await fs.writeFile(path.join(dir, 'o3CX_Y59_74.el.vtt'), 'WEBVTT\n', 'utf8');
    assert.equal(await findSubtitleTrack(dir), path.join(dir, 'o3CX_Y59_74.el.vtt'));
  });
});

test('a recorded process outcome becomes the failure it means', () => {
  const outcome = { url: URL, lang: 'en' };

  assert.equal(fetchFailure({ ...outcome, exitCode: 0, hasTrack: true }), null);

  const noSubtitles = fetchFailure({ ...outcome, exitCode: 0, hasTrack: false });
  assert.ok(noSubtitles instanceof FetchError);
  assert.equal(noSubtitles.failure, NO_SUBTITLES);
  assert.equal(noSubtitles.retryable, false, 'a permanent failure was marked retryable');
  assert.equal(noSubtitles.exitCode, 0);
  assert.equal(noSubtitles.url, URL);

  // The one retried exception, and the reason the ladder ever runs.
  const rateLimited = fetchFailure({ ...outcome, exitCode: 1, hasTrack: false });
  assert.equal(rateLimited.failure, RATE_LIMITED);
  assert.equal(rateLimited.retryable, true, 'a 429 was not marked retryable');
  assert.equal(rateLimited.exitCode, 1);
  assert.match(rateLimited.message, /may succeed/);
});

test('--lang reaches yt-dlp verbatim, and is matched exactly', () => {
  const args = fetchArgs({ url: URL, lang: 'en', destDir: '/tmp/run' });

  assert.equal(args[args.indexOf('--sub-langs') + 1], 'en');
  // `en` must not match `en-US`, `en-orig` is never requested, and exactness
  // is also what keeps `live_chat` out of a live stream's "manual" track.
  assert.ok(!args.includes('all'), 'broadened to --sub-langs all');
  assert.ok(!args.some((arg) => arg.endsWith('-orig')), 'requested an -orig track');
  assert.deepEqual(
    fetchArgs({ url: URL, lang: 'el', destDir: '/tmp/run' }).filter((arg) => arg === 'el'),
    ['el'],
  );
});

// Expansion: the only invocation that reads a playlist. Both halves below are
// pure — the spawn between them stays outside the tested seams, by decision.

test('every per-video invocation refuses the playlist, inside a batch as much as outside', () => {
  // This flag is the whole implementation of the divergence: a
  // `watch?v=...&list=...` URL means the video, and the fetch is always
  // exactly one video — including each fetch a batch performs.
  assert.ok(fetchArgs({ url: URL, lang: 'en', destDir: '/tmp/run' }).includes('--no-playlist'));
});

test('expansion reads the listing flat, and downloads nothing', () => {
  const args = expandArgs({ url: 'https://www.youtube.com/playlist?list=PL123' });

  assert.ok(args.includes('--flat-playlist'), 'expansion walked the playlist member by member');
  assert.ok(args.includes('--simulate'), 'expansion could download');
  assert.equal(args[args.indexOf('--print') + 1], '%(id)s');
  assert.equal(args.at(-1), 'https://www.youtube.com/playlist?list=PL123');
  // The divergence flag belongs to the per-video fetch; forcing it here would
  // reduce a playlist to its first video.
  assert.ok(!args.includes('--no-playlist'), 'the expansion refused to read the playlist');
});

test('expansion output is normalised to the settled canonical url form', () => {
  assert.deepEqual(parseExpansion('o3CX_Y59_74\r\n4JofSJIrjwU\n\n'), [
    'https://www.youtube.com/watch?v=o3CX_Y59_74',
    'https://www.youtube.com/watch?v=4JofSJIrjwU',
  ]);
});

test('a listing row that is not a playable video costs that row, not the batch', () => {
  assert.deepEqual(parseExpansion('[deleted]\no3CX_Y59_74\n'), [
    'https://www.youtube.com/watch?v=o3CX_Y59_74',
  ]);
});

test('an empty listing expands to zero videos rather than to a failure', () => {
  assert.deepEqual(parseExpansion(''), []);
});

test('expansion failure names the playlist and what yt-dlp said', () => {
  const error = new ExpansionError(
    'https://www.youtube.com/playlist?list=PL404',
    1,
    'ERROR: [youtube:tab] PL404: The playlist does not exist.\n',
  );

  assert.ok(error instanceof ExpansionError);
  assert.match(error.message, /Could not read the playlist or channel/);
  assert.match(error.message, /PL404/);
  assert.match(error.message, /The playlist does not exist\./);
  assert.doesNotMatch(error.message, /at .*\(.*:\d+:\d+\)/, 'message reads like a stack trace');
});
