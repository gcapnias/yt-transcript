import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { withTempDir } from '../src/temp-dir.js';
import { writeTranscript } from '../src/transcript-store.js';
import { listFiles as listing } from './transcripts-dir.js';

const transcript = (videoId, slug, marker, channelFolder = 'a-channel') => ({
  slug,
  filename: `${slug}.md`,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  collisionId: videoId,
  channelFolder,
  contents: `---\ntitle: "A talk"\nurl: https://www.youtube.com/watch?v=${videoId}\n---\n\n${marker}\n`,
});

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

test('a transcript with CRLF line endings is still recognised as owned', async () => {
  await withTempDir(async (dir) => {
    const existing = transcript('o3CX_Y59_74', 'a-talk', 'first');
    await put(dir, 'a-channel/a-talk.md', existing.contents.replace(/\n/g, '\r\n'));

    const file = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk-4JofSJIrjwU.md');
    assert.match(await read(dir, 'a-channel/a-talk.md'), /first/);
  });
});

test('a line the frontmatter parser cannot read does not cost a transcript its identity', async () => {
  // Same failure as the byte-order mark, on a different input: anything that
  // makes the block unreadable as a whole must not make the *video* unknown,
  // because an unknown video is one the next write is free to overwrite.
  await withTempDir(async (dir) => {
    await put(
      dir,
      'a-channel/a-talk.md',
      [
        '---',
        'title: "A talk"',
        '  wrapped continuation of something',
        'url: https://www.youtube.com/watch?v=o3CX_Y59_74',
        '---',
        '',
        'prose',
        '',
      ].join('\n'),
    );

    const file = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'second'), { dir });

    assert.equal(path.basename(file), 'a-talk-4JofSJIrjwU.md');
    assert.match(await read(dir, 'a-channel/a-talk.md'), /prose/);
  });
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

// A meeting has no url: its identity is its title, and it is filed in `meetings`.
const meeting = (title, marker, { slug = 'weekly-sync', collisionId = 'abc12345', filename = `${slug}.md` } = {}) => ({
  slug,
  filename,
  title,
  isMeeting: true,
  collisionId,
  channelFolder: 'meetings',
  contents: `---\ntitle: "${title}"\nchannel: ""\nlayout: meeting\n---\n\n${marker}\n`,
});

const read = (dir, relative) => fs.readFile(path.join(dir, relative), 'utf8');

const put = async (dir, relative, contents) => {
  await fs.mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
  await fs.writeFile(path.join(dir, relative), contents, 'utf8');
};

test('a meeting whose suffixed filename is held by another meeting goes to -2, and nothing is overwritten', async () => {
  await withTempDir(async (dir) => {
    // Reachable without any hash collision: the second title is the first's slug plus an id.
    await writeTranscript(meeting('Weekly sync', 'one'), { dir });
    await writeTranscript(meeting('Weekly sync-abc12345', 'two', { slug: 'weekly-sync-abc12345' }), { dir });
    const file = await writeTranscript(meeting('Weekly Sync!', 'three'), { dir });

    assert.equal(path.basename(file), 'weekly-sync-abc12345-2.md');
    assert.deepEqual(await listing(dir), [
      'meetings/weekly-sync-abc12345-2.md',
      'meetings/weekly-sync-abc12345.md',
      'meetings/weekly-sync.md',
    ]);
    assert.match(await read(dir, 'meetings/weekly-sync.md'), /one/);
    assert.match(await read(dir, 'meetings/weekly-sync-abc12345.md'), /two/);
    assert.match(await read(dir, 'meetings/weekly-sync-abc12345-2.md'), /three/);
  });
});

test('a video whose suffixed filename is held by another video goes to -2, then -3', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });
    // A different video squats on the suffix the next one will want.
    await put(dir, 'a-channel/a-talk-4JofSJIrjwU.md', transcript('zzzzzzzzzzz', 'a-talk', 'second').contents);

    const second = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'third'), { dir });
    assert.equal(path.basename(second), 'a-talk-4JofSJIrjwU-2.md');

    await put(dir, 'a-channel/a-talk-4JofSJIrjwU-2.md', transcript('yyyyyyyyyyy', 'a-talk', 'squatter').contents);
    const next = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'fifth'), { dir });
    assert.equal(path.basename(next), 'a-talk-4JofSJIrjwU-3.md');
    assert.match(await read(dir, 'a-channel/a-talk-4JofSJIrjwU.md'), /second/);
    assert.match(await read(dir, 'a-channel/a-talk-4JofSJIrjwU-2.md'), /squatter/);
  });
});

test('a transcript already at a suffixed or numbered filename is overwritten there, with no new file', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(meeting('Weekly sync', 'one'), { dir });
    await writeTranscript(meeting('Weekly sync-abc12345', 'two', { slug: 'weekly-sync-abc12345' }), { dir });
    const first = await writeTranscript(meeting('Weekly Sync!', 'three'), { dir });
    const again = await writeTranscript(meeting('Weekly Sync!', 'four'), { dir });

    assert.equal(again, first);
    assert.equal((await listing(dir)).length, 3);
    assert.match(await read(dir, 'meetings/weekly-sync-abc12345-2.md'), /four/);

    // And at the plain suffixed step, for a video.
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'v1'), { dir });
    const suffixed = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'v2'), { dir });
    const rewritten = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'v3'), { dir });
    assert.equal(rewritten, suffixed);
    assert.deepEqual((await listing(dir)).filter((f) => f.startsWith('a-channel/')), [
      'a-channel/a-talk-4JofSJIrjwU.md',
      'a-channel/a-talk.md',
    ]);
  });
});

test('a video never overwrites a meeting, even in a folder named meetings', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(meeting('Weekly sync', 'the meeting'), { dir });

    const file = await writeTranscript(transcript('o3CX_Y59_74', 'weekly-sync', 'the video', 'meetings'), { dir });

    assert.equal(path.basename(file), 'weekly-sync-o3CX_Y59_74.md');
    assert.match(await read(dir, 'meetings/weekly-sync.md'), /the meeting/);
    assert.match(await read(dir, 'meetings/weekly-sync-o3CX_Y59_74.md'), /the video/);
  });
});

test('a file whose frontmatter cannot be read is overwritten, at the base and at a suffixed step', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'a-channel/a-talk.md', 'no frontmatter at all\n');
    const base = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'first'), { dir });
    assert.equal(path.basename(base), 'a-talk.md');
    assert.match(await read(dir, 'a-channel/a-talk.md'), /first/);

    // Base held by another video, the suffixed step held by an unclosed block.
    await put(dir, 'a-channel/a-talk-4JofSJIrjwU.md', '---\ntitle: "never closed"\n\nprose\n');
    const suffixed = await writeTranscript(transcript('4JofSJIrjwU', 'a-talk', 'second'), { dir });
    assert.equal(path.basename(suffixed), 'a-talk-4JofSJIrjwU.md');
    assert.match(await read(dir, 'a-channel/a-talk-4JofSJIrjwU.md'), /second/);
    assert.deepEqual(await listing(dir), ['a-channel/a-talk-4JofSJIrjwU.md', 'a-channel/a-talk.md']);
  });
});

test('a parsed file with no url, outside meetings, is overwritten by an incoming video', async () => {
  await withTempDir(async (dir) => {
    // An incomplete video transcript: the catalog flags it for re-download.
    await put(dir, 'a-channel/a-talk.md', '---\ntitle: "A talk"\n---\n\nbroken\n');

    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'repaired'), { dir });

    assert.equal(path.basename(file), 'a-talk.md');
    assert.deepEqual(await listing(dir), ['a-channel/a-talk.md']);
    assert.match(await read(dir, 'a-channel/a-talk.md'), /repaired/);
  });
});

test('an incoming meeting overwrites a file with no identity at its base filename', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'meetings/weekly-sync.md', 'not a transcript\n');

    const file = await writeTranscript(meeting('Weekly sync', 'fresh'), { dir });

    assert.equal(path.basename(file), 'weekly-sync.md');
    assert.deepEqual(await listing(dir), ['meetings/weekly-sync.md']);
    assert.match(await read(dir, 'meetings/weekly-sync.md'), /fresh/);
  });
});

test('writing a meeting again leaves one file with its title, when only a suffixed copy existed', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'meetings/x-abc12345.md', meeting('X', 'old', { slug: 'x' }).contents);

    const file = await writeTranscript(meeting('X', 'new', { slug: 'x' }), { dir });

    assert.equal(path.basename(file), 'x.md');
    assert.deepEqual(await listing(dir), ['meetings/x.md']);
    assert.match(await read(dir, 'meetings/x.md'), /new/);
  });
});

test('a same-title meeting at an unrelated filename is removed when the meeting is written', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'meetings/meeting-20260915.md', meeting('Συνάντηση', 'legacy').contents);

    await writeTranscript(meeting('Συνάντηση', 'current', { slug: 'synantisi' }), { dir });

    assert.deepEqual(await listing(dir), ['meetings/synantisi.md']);
  });
});

test('writing a meeting never removes a video in meetings, or a meeting with another title', async () => {
  await withTempDir(async (dir) => {
    const titled = (id, slug, folder) =>
      transcript(id, slug, 'video', folder).contents.replace('"A talk"', '"Weekly sync"');
    await put(dir, 'meetings/weekly-chat.md', titled('o3CX_Y59_74', 'weekly-chat', 'meetings'));
    await put(dir, 'meetings/other.md', meeting('Other', 'other').contents);
    await put(dir, 'a-channel/elsewhere.md', titled('4JofSJIrjwU', 'elsewhere', 'a-channel'));

    await writeTranscript(meeting('Weekly sync', 'mine'), { dir });

    assert.deepEqual(await listing(dir), [
      'a-channel/elsewhere.md',
      'meetings/other.md',
      'meetings/weekly-chat.md',
      'meetings/weekly-sync.md',
    ]);
  });
});

test('a meeting-folder file with no url and no title has no identity, and is overwritten', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'meetings/weekly-sync.md', '---\nlayout: meeting\n---\n\nuntitled\n');
    await put(dir, 'meetings/weekly-sync-abc12345.md', '---\ntitle: ""\nlayout: meeting\n---\n\nblank\n');

    const first = await writeTranscript(meeting('Weekly sync', 'fresh'), { dir });
    assert.equal(path.basename(first), 'weekly-sync.md');
    assert.match(await read(dir, 'meetings/weekly-sync.md'), /fresh/);

    // Held by a meeting now, so the next different title reaches the blank-titled file.
    const second = await writeTranscript(meeting('Weekly Sync!', 'second'), { dir });
    assert.equal(path.basename(second), 'weekly-sync-abc12345.md');
    assert.deepEqual(await listing(dir), ['meetings/weekly-sync-abc12345.md', 'meetings/weekly-sync.md']);
  });
});

test('a file whose url is present but empty has no identity, and is overwritten', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'a-channel/a-talk.md', '---\ntitle: "A talk"\nurl:\n---\n\nbroken\n');

    const file = await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'repaired'), { dir });

    assert.equal(path.basename(file), 'a-talk.md');
    assert.deepEqual(await listing(dir), ['a-channel/a-talk.md']);
    assert.match(await read(dir, 'a-channel/a-talk.md'), /repaired/);
  });
});

// Fails the write itself, after the filename was resolved: the transcript's own
// file is chosen (same identity), and it is read-only. Permissions are restored
// so the temp dir can be removed.
const failingWrite = async (dir, ownFile, attempt) => {
  const target = path.join(dir, ownFile);
  await fs.chmod(target, 0o444);
  try {
    await assert.rejects(attempt, (error) => error.code === 'EPERM' || error.code === 'EACCES');
  } finally {
    await fs.chmod(target, 0o644);
  }
};

test('a write that fails after the filename is chosen removes no other copy of a video', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'second', 'new-handle'), { dir });
    await put(dir, 'old-handle/a-talk.md', transcript('o3CX_Y59_74', 'a-talk', 'old').contents);

    await failingWrite(dir, 'new-handle/a-talk.md', writeTranscript(transcript('o3CX_Y59_74', 'a-talk', 'third', 'new-handle'), { dir }));

    assert.match(await read(dir, 'old-handle/a-talk.md'), /old/);
    assert.match(await read(dir, 'new-handle/a-talk.md'), /second/);
  });
});

test('a write that fails after the filename is chosen removes no other copy of a meeting', async () => {
  await withTempDir(async (dir) => {
    await writeTranscript(meeting('X', 'own', { slug: 'x' }), { dir });
    await put(dir, 'meetings/legacy.md', meeting('X', 'legacy').contents);

    await failingWrite(dir, 'meetings/x.md', writeTranscript(meeting('X', 'new', { slug: 'x' }), { dir }));

    assert.match(await read(dir, 'meetings/legacy.md'), /legacy/);
    assert.match(await read(dir, 'meetings/x.md'), /own/);
  });
});
