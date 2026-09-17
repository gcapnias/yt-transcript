import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { withTempDir } from '../src/temp-dir.js';
import { readTranscriptUrl, writeTranscript } from '../src/transcript-store.js';

const transcript = (videoId, slug, marker) => ({
  slug,
  filename: `${slug}.md`,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  videoId,
  contents: `---\ntitle: "A talk"\nurl: https://www.youtube.com/watch?v=${videoId}\n---\n\n${marker}\n`,
});

test('a transcript is written under its slug', async () => {
  await withTempDir(async (dir) => {
    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });

    assert.equal(path.basename(file), 'a-talk.md');
    assert.match(await fs.readFile(file, 'utf8'), /first/);
  });
});

test('re-running the same video overwrites its transcript', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });
    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk.md');
    assert.deepEqual(await fs.readdir(dir), ['a-talk.md']);
    assert.match(await fs.readFile(file, 'utf8'), /second/);
  });
});

test('two different videos sharing a title produce two files', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });
    const file = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk-4JofSJIrjwU.md');
    assert.deepEqual((await fs.readdir(dir)).sort(), ['a-talk-4JofSJIrjwU.md', 'a-talk.md']);
  });
});

test('the url is read back out of the frontmatter, whatever the line endings', () => {
  assert.equal(
    readTranscriptUrl('---\r\ntitle: "A talk"\r\nurl: https://www.youtube.com/watch?v=abc\r\n---\r\n\r\nprose\r\n'),
    'https://www.youtube.com/watch?v=abc',
  );
  assert.equal(readTranscriptUrl('no frontmatter here\n'), null);
  assert.equal(readTranscriptUrl('---\ntitle: "A talk"\n---\n\nprose\n'), null);
});

test('a byte-order mark does not hide a transcript identity', () => {
  // The failure without this: the file reads as unowned, so the next video
  // with the same title overwrites it instead of taking a suffixed filename.
  const { contents } = transcript('o3CX_Y59_74', 'a-talk', 'first');

  assert.equal(readTranscriptUrl(`﻿${contents}`), 'https://www.youtube.com/watch?v=o3CX_Y59_74');
});

test('a line the frontmatter parser cannot read does not cost a transcript its identity', () => {
  // Same failure as the byte-order mark, on a different input: anything that
  // makes the block unreadable as a whole must not make the *video* unknown,
  // because an unknown video is one the next write is free to overwrite.
  const contents = [
    '---',
    'title: "A talk"',
    '  wrapped continuation of something',
    'url: https://www.youtube.com/watch?v=o3CX_Y59_74',
    '---',
    '',
    'prose',
    '',
  ].join('\n');

  assert.equal(readTranscriptUrl(contents), 'https://www.youtube.com/watch?v=o3CX_Y59_74');
});

test('a byte-order marked transcript survives a different video of the same title', async () => {
  await withTempDir(async (dir) => {
    const existing = transcript('o3CX_Y59_74', 'a-talk', 'first');
    await fs.writeFile(path.join(dir, 'a-talk.md'), `﻿${existing.contents}`, 'utf8');

    const file = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk-4JofSJIrjwU.md');
    assert.match(await fs.readFile(path.join(dir, 'a-talk.md'), 'utf8'), /first/);
  });
});
