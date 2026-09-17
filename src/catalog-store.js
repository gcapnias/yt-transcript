/**
 * Reading the transcripts directory and writing the catalog into it.
 *
 * The filesystem half of the catalog; the rendering is `catalog.js`, which is
 * pure and is where the rules are tested.
 *
 * **A rebuild is always a full rescan**, never an incremental append. That is
 * what makes drift structurally impossible rather than merely unlikely: a
 * transcript deleted by hand loses exactly its row on the next rebuild,
 * without anything having to notice the deletion.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { renderCatalog } from './catalog.js';
import { TRANSCRIPTS_DIR } from './transcript-store.js';

/**
 * Being the folder README, the catalog is excluded by the scan rule itself —
 * it has no frontmatter. The name is needed to write the file, never to filter
 * the scan.
 */
export const CATALOG_FILENAME = 'README.md';

/**
 * Rebuilds `transcripts/README.md` from what is on disk.
 *
 * This is the single entry point for both triggers, and the one a batch calls
 * **once at the end** (never once per video, which would make a 200-video
 * playlist quadratic).
 *
 * Throws only on a genuine directory read or write failure; a malformed
 * individual transcript comes back as a warning, so one bad file never costs
 * the whole catalog and the caller decides what a warning is worth.
 *
 * @param {{ dir?: string }} [options]
 * @returns {Promise<{ file: string, count: number, warnings: string[] }>}
 */
export async function rebuildCatalog({ dir = TRANSCRIPTS_DIR } = {}) {
  // A missing directory is zero transcripts, not a crash: `yt-transcript
  // catalog` in a fresh tree must still produce the empty catalog.
  await fs.mkdir(dir, { recursive: true });

  const names = (await fs.readdir(dir)).filter((name) => name.toLowerCase().endsWith('.md'));

  // Every `.md` goes to the seam, the catalog's own file included. Filtering
  // it out here would make "no filename special case" a claim nothing checks.
  const files = await Promise.all(
    names.map(async (name) => ({ path: name, text: await fs.readFile(path.join(dir, name), 'utf8') })),
  );

  const { markdown, warnings, count } = renderCatalog(files);
  const file = path.join(dir, CATALOG_FILENAME);
  await fs.writeFile(file, markdown, 'utf8');

  return { file, count, warnings };
}
