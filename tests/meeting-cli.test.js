import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { rebuildCatalog } from '../src/catalog-store.js';
import { main, parseArgs } from '../src/cli.js';
import { parseTarget } from '../src/target.js';
import { withTempDir } from '../src/temp-dir.js';
import { MeetingFileNotFoundError, transcribeMeeting } from '../src/transcribe.js';
import { writeTranscript } from '../src/transcript-store.js';
import { meetingTrack } from './meeting-track.js';
import { listFiles } from './transcripts-dir.js';

const MODIFIED_AT = new Date('2026-09-15T12:00:00Z');

const CUES = [
  { id: '3-0', start: 0, end: 4, speaker: 'Ana Lopez', text: 'Shall we begin;' },
  { id: '1-0', start: 4, end: 6, speaker: 'Ben Okafor', text: 'Yes.' },
];

/** Writes a meeting track as `name` into a fresh folder and stamps its mtime. */
async function meetingFile(dir, name, cues = CUES) {
  const file = path.join(dir, name);
  await fs.writeFile(file, meetingTrack(cues), 'utf8');
  await fs.utimes(file, MODIFIED_AT, MODIFIED_AT);
  return file;
}

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { out: (line) => out.push(line), err: (line) => err.push(line) } };
}

/** Every dependency that would touch yt-dlp or the network, each failing the test if called. */
const forbidden = Object.fromEntries(
  ['preflight', 'fetchTranscript', 'expandPlaylist', 'readExistingUrls'].map((name) => [
    name,
    async () => assert.fail(`${name} was called for a local file`),
  ]),
);

// ------------------------------------------------------------ target

test('a path ending in .vtt is a local file carrying its absolute path', () => {
  assert.deepEqual(parseTarget('notes/Weekly sync.vtt'), {
    kind: 'file',
    path: path.resolve('notes/Weekly sync.vtt'),
  });
  assert.equal(parseTarget(path.resolve('a.VTT')).kind, 'file');
});

test('a .vtt is never read as a url, even one that looks like one', () => {
  assert.equal(parseTarget('https://www.youtube.com/watch?v=o3CX_Y59_74.vtt').kind, 'file');
});

// ------------------------------------------------------------ transcribing

test('transcribing a file writes a meeting transcript into the meetings folder', async () => {
  await withTempDir(async (dir) => {
    const input = await meetingFile(dir, 'Weekly sync.vtt');
    const out = path.join(dir, 'transcripts');

    const { file, transcript } = await transcribeMeeting(
      { path: input },
      { dir: out, now: () => new Date('2026-09-16T14:03:05Z') },
    );

    assert.equal(file, path.join(out, 'meetings', 'weekly-sync.md'));
    assert.equal(transcript.layout, 'meeting');
    const text = await fs.readFile(file, 'utf8');
    assert.match(text, /^title: "Weekly sync"$/m);
    assert.match(text, /^upload_date: 2026-09-15$/m);
    assert.match(text, /^fetched: 2026-09-16T14:03:05Z$/m);
    assert.match(text, /^— \*\*Ana Lopez:\*\* Shall we begin;$/m);
    assert.match(text, /^— \*\*Ben Okafor:\*\* Yes\.$/m);
  });
});

test('transcribing the same file again overwrites it; another meeting of the same slug is kept', async () => {
  await withTempDir(async (dir) => {
    const out = path.join(dir, 'transcripts');
    const first = await meetingFile(dir, 'Weekly sync.vtt');
    await transcribeMeeting({ path: first }, { dir: out });
    await transcribeMeeting({ path: first }, { dir: out });
    assert.deepEqual(await listFiles(out), ['meetings/weekly-sync.md']);

    const second = await meetingFile(dir, 'Weekly Sync!.vtt', [CUES[1]]);
    await transcribeMeeting({ path: second }, { dir: out });
    const files = await listFiles(out);
    assert.equal(files.length, 2);
    assert.ok(files.includes('meetings/weekly-sync.md'));
  });
});

test('a meeting never removes a video transcript, nor a video one a meeting', async () => {
  await withTempDir(async (dir) => {
    const out = path.join(dir, 'transcripts');
    const url = 'https://www.youtube.com/watch?v=o3CX_Y59_74';
    await writeTranscript(
      {
        slug: 'a-talk',
        filename: 'a-talk.md',
        url,
        collisionId: 'o3CX_Y59_74',
        channelFolder: 'a-channel',
        contents: `---\ntitle: "A talk"\nurl: ${url}\n---\n\nx\n`,
      },
      { dir: out },
    );
    await transcribeMeeting({ path: await meetingFile(dir, 'Weekly sync.vtt') }, { dir: out });

    assert.deepEqual(await listFiles(out), ['a-channel/a-talk.md', 'meetings/weekly-sync.md']);
  });
});

test('a missing file is named, and nothing is written', async () => {
  await withTempDir(async (dir) => {
    const out = path.join(dir, 'transcripts');

    await assert.rejects(
      () => transcribeMeeting({ path: path.join(dir, 'nope.vtt') }, { dir: out }),
      (error) => {
        assert.ok(error instanceof MeetingFileNotFoundError);
        assert.match(error.message, /file not found/i);
        assert.ok(error.message.includes('nope.vtt'));
        return true;
      },
    );
    await assert.rejects(() => fs.stat(out), { code: 'ENOENT' });
  });
});

test('a rebuild lists the meeting under the meetings folder, with no url', async () => {
  await withTempDir(async (dir) => {
    const out = path.join(dir, 'transcripts');
    await transcribeMeeting({ path: await meetingFile(dir, 'Weekly sync.vtt') }, { dir: out });

    const { count, warnings } = await rebuildCatalog({ dir: out });
    const catalog = await fs.readFile(path.join(out, 'README.md'), 'utf8');

    assert.equal(count, 1);
    assert.deepEqual(warnings, []);
    assert.match(
      catalog,
      /^\| \[Weekly sync\]\(meetings\/weekly-sync\.md\) \|  \| 0:06 \| 2026-09-15 \| auto \|$/m,
    );
  });
});

test('a meeting with no cues is still listed, with an empty duration', async () => {
  await withTempDir(async (dir) => {
    const out = path.join(dir, 'transcripts');
    await transcribeMeeting({ path: await meetingFile(dir, 'Empty.vtt', []) }, { dir: out });

    const { count, warnings } = await rebuildCatalog({ dir: out });
    const catalog = await fs.readFile(path.join(out, 'README.md'), 'utf8');

    assert.equal(count, 1);
    assert.deepEqual(warnings, []);
    assert.doesNotMatch(catalog, /undefined/);
  });
});

// ------------------------------------------------------------ the command

test('a .vtt argument transcribes without ever reaching yt-dlp, and rebuilds the catalog', async () => {
  const { out, err, io } = capture();
  const calls = [];

  const code = await main(['--lang', 'el', '--layout', 'prose', 'meetings/Weekly sync.vtt'], io, {
    ...forbidden,
    transcribeMeeting: async (input) => {
      calls.push(input);
      return {
        file: 'transcripts/meetings/weekly-sync.md',
        transcript: {
          layout: 'prose',
          trackKind: 'auto',
          warnings: [],
          video: { title: 'Weekly sync', duration: '0:06', uploaded: '2026-09-15' },
        },
      };
    },
    rebuildCatalog: async () => ({ file: 'transcripts/README.md', count: 1, warnings: [] }),
  });

  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(calls, [{ path: path.resolve('meetings/Weekly sync.vtt'), layout: 'prose' }]);
  const printed = out.join('\n');
  assert.match(printed, /transcripts\/meetings\/weekly-sync\.md/);
  assert.match(printed, /Weekly sync/);
  assert.doesNotMatch(printed, /undefined|null/);
});

test('a missing .vtt exits 1 with "file not found", never touching yt-dlp or the catalog', async () => {
  const { err, io } = capture();

  const code = await main(['definitely-not-here/Weekly sync.vtt'], io, {
    ...forbidden,
    rebuildCatalog: async () => assert.fail('the catalog was rebuilt after a failure'),
  });

  assert.equal(code, 1);
  assert.match(err.join('\n'), /file not found/i);
  assert.match(err.join('\n'), /Weekly sync\.vtt/);
});

test('--layout meeting is only for a .vtt', async () => {
  const { err, io } = capture();

  const code = await main(['--layout', 'meeting', 'o3CX_Y59_74'], io, forbidden);

  assert.equal(code, 1);
  assert.match(err.join('\n'), /--layout meeting/);
  assert.match(err.join('\n'), /\.vtt/);
});

test('--layout meeting is accepted by the parser, and the usage names the new layout and input', async () => {
  assert.equal(parseArgs(['--layout', 'meeting', 'a.vtt']).layout, 'meeting');

  const { err, io } = capture();
  await main([], io);
  assert.match(err.join('\n'), /auto\|prose\|dialog\|meeting/);
  assert.match(err.join('\n'), /\.vtt/);
});
