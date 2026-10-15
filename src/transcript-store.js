/**
 * Where transcripts live: `transcripts/<channel folder>/<slug>.md`, one
 * Markdown file per video (ADR-0008).
 *
 * Identity is the frontmatter `url`, never the filename. That is what makes
 * both of these safe at once: a re-run of the same video overwrites silently
 * and bumps `fetched`, while two different videos that happen to share a title
 * produce two files rather than one destroying the other. A video has one
 * transcript: writing it removes any other file carrying its `url`.
 *
 * A meeting has no `url` (ADR-0010), so it is identified by its title, which is
 * its file's name: the same title overwrites, and a different title that slugs
 * to the same filename is suffixed with the collision id. A meeting never
 * removes another transcript, and no video overwrites one.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { isMeetingFrontmatter, readFrontmatter } from './catalog.js';

/** Transcripts sit one level down, in a channel folder: see ADR-0008. */
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
 * Every `.md` at the top level of the directory and one level down in each
 * channel folder, as `{ path, text }` with `path` relative to the directory
 * and `/`-separated, so it can be a link as it stands (`isInChannelFolder`
 * reads that convention back). Nothing deeper is read.
 *
 * The one reader behind a rebuild, a batch's skip set and a write's search for
 * the other copies of a video, so none of them can disagree about what is on
 * disk. The catalog's own file is included: it is excluded by the scan rule,
 * with no filename special case.
 *
 * @param {string} dir
 * @returns {Promise<Array<{ path: string, text: string }>>}
 */
export async function readTranscriptFiles(dir) {
  // A missing directory is zero transcripts, not a crash: `yt-transcript
  // catalog` in a fresh tree must still produce the empty catalog.
  await fs.mkdir(dir, { recursive: true });

  const isMarkdown = (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md');
  const topLevel = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    topLevel
      .filter((entry) => entry.isDirectory())
      .map(async (folder) =>
        (await fs.readdir(path.join(dir, folder.name), { withFileTypes: true }))
          .filter(isMarkdown)
          .map((entry) => `${folder.name}/${entry.name}`),
      ),
  );

  const paths = [...topLevel.filter(isMarkdown).map((entry) => entry.name), ...nested.flat()];
  return Promise.all(
    paths.map(async (relative) => ({
      path: relative,
      text: await fs.readFile(path.join(dir, relative), 'utf8'),
    })),
  );
}

/**
 * Writes a transcript into its channel folder, resolving a true title
 * collision within that folder by suffixing the second file with its collision
 * id: the video id, or an X post's post id. Another channel's file of the same
 * slug is not a collision.
 *
 * Once written, every *other* transcript carrying the same `url` is removed,
 * in any folder or at the top level: a renamed channel or a retitled video
 * moves, rather than leaving a stale copy. If the write fails, nothing is
 * removed.
 *
 * @param {{ slug: string, filename: string, contents: string, url?: string,
 *           title?: string, isMeeting?: boolean, collisionId: string,
 *           channelFolder: string }} transcript
 *   a meeting (`isMeeting`) has no `url` and brings its `title` instead
 * @param {{ dir?: string }} [options]
 * @returns {Promise<string>} the path written
 */
export async function writeTranscript(transcript, { dir = TRANSCRIPTS_DIR } = {}) {
  const folder = path.join(dir, transcript.channelFolder);
  await fs.mkdir(folder, { recursive: true });

  const file = path.join(folder, await resolveFilename(transcript, folder));
  await fs.writeFile(file, transcript.contents, 'utf8');
  if (!transcript.isMeeting) await removeOtherCopies(transcript.url, file, dir);
  return file;
}

async function removeOtherCopies(url, written, dir) {
  for (const { path: relative, text } of await readTranscriptFiles(dir)) {
    const file = path.join(dir, relative);
    if (file !== written && readTranscriptUrl(text) === url) await fs.rm(file);
  }
}

async function resolveFilename(transcript, folder) {
  let existing;
  try {
    existing = await fs.readFile(path.join(folder, transcript.filename), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return transcript.filename;
  }

  // A meeting is the same meeting when the file there is one too, under the
  // same title. A video's transcript, or another title, is not.
  if (transcript.isMeeting) {
    const { values } = readFrontmatter(existing) ?? {};
    return values && isMeetingFrontmatter(values) && values.title === transcript.title
      ? transcript.filename
      : `${transcript.slug}-${transcript.collisionId}.md`;
  }

  // The same video, or a file we cannot read an identity out of: overwrite.
  const owner = readTranscriptUrl(existing);
  if (owner === null || owner === transcript.url) return transcript.filename;

  return `${transcript.slug}-${transcript.collisionId}.md`;
}
