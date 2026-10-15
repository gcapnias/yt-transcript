/**
 * Reading the transcripts directory (the reader is `transcript-store.js`) and
 * writing the catalog into it.
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

import { renderCatalog, scanTranscriptUrls } from './catalog.js';
import { readTranscriptFiles, TRANSCRIPTS_DIR } from './transcript-store.js';

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
  const { markdown, warnings, count } = renderCatalog(await readTranscriptFiles(dir));
  const file = path.join(dir, CATALOG_FILENAME);
  await fs.writeFile(file, markdown, 'utf8');

  return { file, count, warnings };
}

/**
 * The `url`s `transcripts/` already holds — what a batch subtracts from its
 * expansion.
 *
 * Reads the directory, channel folders included, the same way a rebuild does,
 * so a batch cannot disagree with the catalog about what is already there.
 * Skipping is batch-only: this is never consulted for a single video URL,
 * which still overwrites.
 *
 * @param {{ dir?: string }} [options]
 * @returns {Promise<string[]>}
 */
export async function readExistingUrls({ dir = TRANSCRIPTS_DIR } = {}) {
  return scanTranscriptUrls(await readTranscriptFiles(dir));
}
