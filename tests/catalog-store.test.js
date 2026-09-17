import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { renderCatalog } from '../src/catalog.js';
import { CATALOG_FILENAME, readExistingUrls, rebuildCatalog } from '../src/catalog-store.js';
import { withTempDir } from '../src/temp-dir.js';

/** A transcript as the writer produces one. Only the catalog's keys vary. */
const transcript = (title, uploadDate = '2026-09-10') =>
  `---\ntitle: "${title}"\nurl: https://www.youtube.com/watch?v=o3CX_Y59_74\n`
  + `channel: "freeCodeCamp.org"\nduration: "41:18"\nupload_date: ${uploadDate}\n`
  + `fetched: 2026-09-16T14:03:05Z\nsubtitles: auto\n---\n\nProse.\n`;

test('a rebuild is a full rescan: a hand-deleted transcript loses exactly its row', async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'a-talk.md'), transcript('A Talk'), 'utf8');
    await fs.writeFile(path.join(dir, 'b-talk.md'), transcript('B Talk', '2026-09-09'), 'utf8');

    const first = await rebuildCatalog({ dir });
    assert.equal(first.count, 2);
    assert.deepEqual(first.warnings, []);

    await fs.rm(path.join(dir, 'b-talk.md'));
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
    await fs.writeFile(path.join(dir, 'a-talk.md'), transcript('A Talk'), 'utf8');

    await rebuildCatalog({ dir });
    const { count, warnings } = await rebuildCatalog({ dir });

    assert.equal(count, 1);
    assert.deepEqual(warnings, []);
  });
});

test('a malformed transcript on disk is reported but never fatal', async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'a-talk.md'), transcript('A Talk'), 'utf8');
    await fs.writeFile(path.join(dir, 'broken.md'), '---\ntitle: "Half"\n', 'utf8');

    const { count, warnings } = await rebuildCatalog({ dir });

    assert.equal(count, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /broken\.md/);
  });
});

test('a batch reads its skip set off the disk the same way a rebuild does', async () => {
  await withTempDir(async (dir) => {
    // Renamed by hand, and still recognised: identity is the frontmatter url.
    await fs.writeFile(path.join(dir, 'whatever-i-called-it.md'), transcript('A Talk'), 'utf8');
    await rebuildCatalog({ dir });

    assert.deepEqual(await readExistingUrls({ dir }), [
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
