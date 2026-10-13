import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { renderCatalog } from '../src/catalog.js';
import { CATALOG_FILENAME, readExistingUrls, rebuildCatalog } from '../src/catalog-store.js';
import { withTempDir } from '../src/temp-dir.js';

/** A transcript as the writer produces one. Only the catalog's keys vary. */
const transcript = (title, uploadDate = '2026-09-10', videoId = 'o3CX_Y59_74') =>
  `---\ntitle: "${title}"\nurl: https://www.youtube.com/watch?v=${videoId}\n`
  + `channel: "freeCodeCamp.org"\nduration: "41:18"\nupload_date: ${uploadDate}\n`
  + `fetched: 2026-09-16T14:03:05Z\nsubtitles: auto\n---\n\nProse.\n`;

/** Puts a file at a path relative to the transcripts directory, folder and all. */
async function put(dir, relative, text) {
  await fs.mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
  await fs.writeFile(path.join(dir, relative), text, 'utf8');
}

test('a rebuild is a full rescan: a hand-deleted transcript loses exactly its row', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'freecodecamp/a-talk.md', transcript('A Talk'));
    await put(dir, 'freecodecamp/b-talk.md', transcript('B Talk', '2026-09-09'));

    const first = await rebuildCatalog({ dir });
    assert.equal(first.count, 2);
    assert.deepEqual(first.warnings, []);

    await fs.rm(path.join(dir, 'freecodecamp', 'b-talk.md'));
    const second = await rebuildCatalog({ dir });

    const markdown = await fs.readFile(path.join(dir, CATALOG_FILENAME), 'utf8');
    assert.equal(second.count, 1);
    assert.match(markdown, /\[A Talk\]/);
    assert.doesNotMatch(markdown, /B Talk/);
  });
});

/**
 * The second rebuild above read back the catalog the first one wrote, so the
 * scan rule excluding it is proven end-to-end and not only at the seam.
 */
test('the catalog it wrote last time is not a transcript this time', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'freecodecamp/a-talk.md', transcript('A Talk'));

    await rebuildCatalog({ dir });
    const { count, warnings } = await rebuildCatalog({ dir });

    assert.equal(count, 1);
    assert.deepEqual(warnings, []);
  });
});

test('a malformed transcript on disk is reported but never fatal', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'freecodecamp/a-talk.md', transcript('A Talk'));
    await put(dir, 'freecodecamp/broken.md', '---\ntitle: "Half"\n');

    const { count, warnings } = await rebuildCatalog({ dir });

    assert.equal(count, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /broken\.md/);
  });
});

test('a rebuild lists transcripts from every channel folder, linked by their relative path', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'freecodecamp/a-talk.md', transcript('A Talk'));
    await put(dir, 'mattpocockuk/b-talk.md', transcript('B Talk', '2026-09-09', 'aaaaaaaaaaa'));

    const { count, warnings } = await rebuildCatalog({ dir });

    const markdown = await fs.readFile(path.join(dir, CATALOG_FILENAME), 'utf8');
    assert.equal(count, 2);
    assert.deepEqual(warnings, []);
    assert.match(markdown, /\[A Talk\]\(freecodecamp\/a-talk\.md\)/);
    assert.match(markdown, /\[B Talk\]\(mattpocockuk\/b-talk\.md\)/);
  });
});

test('a rebuild warns once for a transcript outside a channel folder and still lists it', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'loose.md', transcript('Loose'));
    await put(dir, 'freecodecamp/a-talk.md', transcript('A Talk', '2026-09-09', 'aaaaaaaaaaa'));

    const { count, warnings } = await rebuildCatalog({ dir });

    assert.equal(count, 2);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /loose\.md/);
    assert.match(warnings[0], /outside a channel folder/);
    assert.match(await fs.readFile(path.join(dir, CATALOG_FILENAME), 'utf8'), /\(loose\.md\)/);
  });
});

test('a file two levels down is not read', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'freecodecamp/a-talk.md', transcript('A Talk'));
    await put(dir, 'freecodecamp/old/deep.md', transcript('Deep', '2026-09-09', 'aaaaaaaaaaa'));

    const { count } = await rebuildCatalog({ dir });

    assert.equal(count, 1);
    assert.deepEqual(await readExistingUrls({ dir }), ['https://www.youtube.com/watch?v=o3CX_Y59_74']);
  });
});

test('a batch reads its skip set off the disk the same way a rebuild does', async () => {
  await withTempDir(async (dir) => {
    // Renamed by hand, and still recognised: identity is the frontmatter url.
    await put(dir, 'freecodecamp/whatever-i-called-it.md', transcript('A Talk'));
    await rebuildCatalog({ dir });

    assert.deepEqual(await readExistingUrls({ dir }), [
      'https://www.youtube.com/watch?v=o3CX_Y59_74',
    ]);
  });
});

test('the skip set holds the urls of channel folders and of top-level transcripts', async () => {
  await withTempDir(async (dir) => {
    await put(dir, 'freecodecamp/a-talk.md', transcript('A Talk'));
    await put(dir, 'loose.md', transcript('Loose', '2026-09-09', 'aaaaaaaaaaa'));

    assert.deepEqual((await readExistingUrls({ dir })).sort(), [
      'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      'https://www.youtube.com/watch?v=o3CX_Y59_74',
    ]);
  });
});

test('a transcripts directory that does not exist yet holds nothing to skip', async () => {
  await withTempDir(async (parent) => {
    assert.deepEqual(await readExistingUrls({ dir: path.join(parent, 'transcripts') }), []);
  });
});

test('rebuilding a directory that does not exist yet writes the empty catalog', async () => {
  await withTempDir(async (parent) => {
    const dir = path.join(parent, 'transcripts');

    const { count, file } = await rebuildCatalog({ dir });

    assert.equal(count, 0);
    assert.equal(await fs.readFile(file, 'utf8'), renderCatalog([]).markdown);
  });
});
