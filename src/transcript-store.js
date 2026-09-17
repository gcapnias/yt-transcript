/**
 * Where transcripts live: a flat `transcripts/` directory, one Markdown file
 * per video.
 *
 * Identity is the frontmatter `url`, never the filename. That is what makes
 * both of these safe at once: a re-run of the same video overwrites silently
 * and bumps `fetched`, while two different videos that happen to share a title
 * produce two files rather than one destroying the other.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { readFrontmatter } from './catalog.js';

/** Flat, by decision: a directory listing is the browse experience. */
export const TRANSCRIPTS_DIR = 'transcripts';

/**
 * Reads the `url` out of a transcript's frontmatter — which video this file is
 * already about, and nothing else.
 *
 * The parse itself is the catalog's (`readFrontmatter`), deliberately: a
 * second reader with its own rules is how a transcript comes to be owned by
 * one module and unowned by the other. It was, and the divergence was a
 * byte-order mark — this reader missed it, dropped the file's identity, and
 * `resolveFilename` overwrote another video's transcript.
 *
 * Neither completeness nor readability is asked for here — only the `url`. A
 * file carrying one, whatever else is wrong with its block, is unmistakably
 * about that video, and the catalog's "re-download it" warning is a milder
 * answer than destroying it. Anything stricter reopens the overwrite on some
 * other malformed input.
 *
 * @param {string} text a transcript's full contents
 * @returns {string|null}
 */
export function readTranscriptUrl(text) {
  return readFrontmatter(text)?.values?.url ?? null;
}

/**
 * Writes a transcript, resolving a true title collision by suffixing the
 * second file with its video id.
 *
 * @param {{ slug: string, filename: string, contents: string, url: string, videoId: string }} transcript
 * @param {{ dir?: string }} [options]
 * @returns {Promise<string>} the path written
 */
export async function writeTranscript(transcript, { dir = TRANSCRIPTS_DIR } = {}) {
  await fs.mkdir(dir, { recursive: true });

  const file = path.join(dir, await resolveFilename(transcript, dir));
  await fs.writeFile(file, transcript.contents, 'utf8');
  return file;
}

async function resolveFilename(transcript, dir) {
  let existing;
  try {
    existing = await fs.readFile(path.join(dir, transcript.filename), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return transcript.filename;
  }

  // The same video, or a file we cannot read an identity out of: overwrite.
  const owner = readTranscriptUrl(existing);
  if (owner === null || owner === transcript.url) return transcript.filename;

  return `${transcript.slug}-${transcript.videoId}.md`;
}
