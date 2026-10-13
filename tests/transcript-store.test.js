import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { withTempDir } from '../src/temp-dir.js';
import { readTranscriptUrl, writeTranscript } from '../src/transcript-store.js';

const transcript = (videoId, slug, marker, channelFolder = 'a-channel') => ({
  slug,
  filename: `${slug}.md`,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  collisionId: videoId,
  channelFolder,
  contents: `---\ntitle: "A talk"\nurl: https://www.youtube.com/watch?v=${videoId}\n---\n\n${marker}\n`,
});

/** Every `.md` under the directory, as `folder/name` paths, sorted. */
async function listing(dir) {
  const found = [];
  for (const folder of await fs.readdir(dir, { withFileTypes: true })) {
    if (!folder.isDirectory()) {
      found.push(folder.name);
      continue;
    }
    for (const name of await fs.readdir(path.join(dir, folder.name))) found.push(`${folder.name}/${name}`);
  }
  return found.sort();
}

test('a transcript is written under its slug, in its channel folder', async () => {
  await withTempDir(async (dir) => {
    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });

    assert.equal(file, path.join(dir, 'a-channel', 'a-talk.md'));
    assert.match(await fs.readFile(file, 'utf8'), /first/);
  });
});

test('re-running the same video overwrites its transcript', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });
    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk.md');
    assert.deepEqual(await listing(dir), ['a-channel/a-talk.md']);
    assert.match(await fs.readFile(file, 'utf8'), /second/);
  });
});

test('two different videos sharing a title in one folder produce two files', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });
    const file = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk-4JofSJIrjwU.md');
    assert.deepEqual(await listing(dir), ['a-channel/a-talk-4JofSJIrjwU.md', 'a-channel/a-talk.md']);
  });
});

test('two different videos sharing a title in different folders are not a collision', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first', 'one'), { dir });
    await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'second', 'two'), { dir });

    assert.deepEqual(await listing(dir), ['one/a-talk.md', 'two/a-talk.md']);
  });
});

test('a video re-fetched into another channel folder leaves one transcript, in the new one', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first', 'old-handle'), { dir });
    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'second', 'new-handle'), { dir });

    assert.equal(file, path.join(dir, 'new-handle', 'a-talk.md'));
    assert.deepEqual(await listing(dir), ['new-handle/a-talk.md']);
  });
});

test('a video re-fetched from the top level leaves one transcript, in its folder', async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'a-talk.md'), transcript('o3CX_Y59_74', 'a-talk', 'loose').contents);

    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'filed'), { dir });

    assert.deepEqual(await listing(dir), ['a-channel/a-talk.md']);
  });
});

test('a video whose title changed leaves only the file under its new slug', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'old-title', 'first'), { dir });
    await writeTranscript(transcript('o3CX_Y59_74', 'new-title', 'second'), { dir });

    assert.deepEqual(await listing(dir), ['a-channel/new-title.md']);
  });
});

test('writing a video leaves every other video, and the catalog, where they are', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('4JofSJIrjwU', 'other', 'other', 'elsewhere'), { dir });
    await fs.writeFile(path.join(dir, 'README.md'), '# Transcripts\n');

    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });

    assert.deepEqual(await listing(dir), ['README.md', 'a-channel/a-talk.md', 'elsewhere/other.md']);
  });
});

test('a failed write deletes nothing', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first', 'old-handle'), { dir });
    // A file where the new folder must go: the write cannot happen.
    await fs.writeFile(path.join(dir, 'new-handle'), 'in the way');

    await assert.rejects(writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'second', 'new-handle'), { dir }));

    assert.deepEqual(await listing(dir), ['new-handle', 'old-handle/a-talk.md']);
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
    await fs.mkdir(path.join(dir, 'a-channel'));
    await fs.writeFile(path.join(dir, 'a-channel', 'a-talk.md'), `﻿${existing.contents}`, 'utf8');

    const file = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk-4JofSJIrjwU.md');
    assert.match(await fs.readFile(path.join(dir, 'a-channel', 'a-talk.md'), 'utf8'), /first/);
  });
});
