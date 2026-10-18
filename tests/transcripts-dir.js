/**
 * Helpers for tests that put files into, or read them back out of, a throwaway
 * transcripts directory. Paths are relative to it and `/`-separated, as the
 * catalog's are.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/** Puts a file at a path relative to the transcripts directory, folder and all. */
export async function put(dir, relative, text) {
  await fs.mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
  await fs.writeFile(path.join(dir, relative), text, 'utf8');
}

/** Every file under the directory, at any depth, sorted. */
export async function listFiles(dir) {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}
