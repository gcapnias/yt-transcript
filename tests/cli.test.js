import test from 'node:test';
import assert from 'node:assert/strict';

import { main, parseArgs, UsageError } from '../src/cli.js';
import { preflight, YtDlpMissingError } from '../src/ytdlp.js';

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
