import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readTranscriptUrl, writeTranscript } from '../src/transcript-store.js';

const transcript = (videoId, slug, marker) => ({
  slug,
  filename: `${slug}.md`,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  videoId,
  contents: `---\ntitle: "A talk"\nurl: https://www.youtube.com/watch?v=${videoId}\n---\n\n${marker}\n`,
});

async function inTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-transcript-test-'));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('a transcript is written under its slug', async () => {
  await inTempDir(async (dir) => {
    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });

    assert.equal(path.basename(file), 'a-talk.md');
    assert.match(await fs.readFile(file, 'utf8'), /first/);
  });
});

test('re-running the same video overwrites its transcript', async () => {
  await inTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });
    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk.md');
    assert.deepEqual(await fs.readdir(dir), ['a-talk.md']);
    assert.match(await fs.readFile(file, 'utf8'), /second/);
  });
});

test('two different videos sharing a title produce two files', async () => {
  await inTempDir(async (dir) => {
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
