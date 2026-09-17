import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Runs `use` against a fresh per-run temporary directory and removes that
 * directory afterwards, on success and on failure alike.
 *
 * The subtitle track lands here rather than in the working directory, which is
 * how the tool leaves no intermediate files behind. Nothing inside `use` may
 * call `process.exit`: that would skip the `finally` and strand the directory.
 *
 * @template T
 * @param {(dir: string) => Promise<T>} use
 * @returns {Promise<T>}
 */
export async function withTempDir(use) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-transcript-'));
  try {
    return await use(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
