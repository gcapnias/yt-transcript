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
 * its file's name. Both kinds are held to one rule for every filename they try
 * (ADR-0011): the slug, then the slug plus the collision id, then `-2`, `-3`,
 * and the first that is free, holds the same transcript, or holds a file with
 * no identity is taken. A video never overwrites a meeting and a meeting never
 * overwrites a video. A meeting has one transcript: writing it removes every
 * other meeting in the `meetings` folder with its title, and never a video.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { isMeetingFile, readFrontmatter } from './catalog.js';

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
 * Writes a transcript into its channel folder, at the first filename that is
 * usable for it (`resolveFilename`): the slug, then the slug suffixed with the
 * collision id (the video id, an X post's post id, a meeting's title hash),
 * then `-2`, `-3` and so on. Another channel's file of the same slug is not a
 * collision.
 *
 * Once written, every *other* copy of the same transcript is removed: for a
 * video, any file carrying its `url`, in any folder or at the top level, so a
 * renamed channel or a retitled video moves rather than leaving a stale copy;
 * for a meeting, any other meeting in the `meetings` folder with its title.
 * If the write fails, nothing is removed.
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
  await removeOtherCopies(transcript, file, dir);
  return file;
}

async function removeOtherCopies(transcript, written, dir) {
  const incoming = identityOf(transcript);
  for (const { path: relative, text } of await readTranscriptFiles(dir)) {
    const file = path.join(dir, relative);
    if (file !== written && sameIdentity(fileIdentity(relative, text), incoming)) await fs.rm(file);
  }
}

/**
 * What a transcript is the transcript *of*: a video's (or an X post's) `url`,
 * a meeting's `title`. `null` is a file with no identity, which no one owns.
 *
 * @typedef {{ kind: 'url', value: string } | { kind: 'title', value: string } | null} Identity
 */

/** @returns {Identity} the identity of the transcript about to be written */
function identityOf(transcript) {
  return transcript.isMeeting
    ? { kind: 'title', value: transcript.title }
    : { kind: 'url', value: transcript.url };
}

/**
 * The identity of a file already on disk. The catalog's parse and its
 * `isMeetingFile` decide, so a file the catalog calls a meeting is one here.
 * A `url` is read from a block with an unreadable line too, as before: a file
 * carrying one is unmistakably about that video.
 *
 * @param {string} relative the path relative to the transcripts directory
 * @param {string} text
 * @returns {Identity}
 */
function fileIdentity(relative, text) {
  const { values } = readFrontmatter(text) ?? {};
  if (!values) return null;
  if ('url' in values) return { kind: 'url', value: values.url };
  if (isMeetingFile(relative, values)) return { kind: 'title', value: values.title };
  return null;
}

function sameIdentity(a, b) {
  return a !== null && b !== null && a.kind === b.kind && a.value === b.value;
}

/**
 * The first candidate filename that is usable for the transcript: free, held
 * by a transcript with the same identity, or held by a file with none (an
 * unreadable block, or one that parses without a `url` outside `meetings`).
 * That last overwrite is deliberate, for a video and a meeting alike: the
 * file has no `url` to be cleaned up by, so leaving it would leave the broken
 * file behind for good. A file that is someone else's, a different video or
 * any meeting for a video, is stepped over, never overwritten.
 */
async function resolveFilename(transcript, folder) {
  const incoming = identityOf(transcript);
  const stem = `${transcript.slug}-${transcript.collisionId}`;
  const candidates = function* () {
    yield transcript.filename;
    yield `${stem}.md`;
    for (let n = 2; ; n += 1) yield `${stem}-${n}.md`;
  };

  for (const candidate of candidates()) {
    let existing;
    try {
      existing = await fs.readFile(path.join(folder, candidate), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return candidate;
    }

    const owner = fileIdentity(`${transcript.channelFolder}/${candidate}`, existing);
    if (owner === null || sameIdentity(owner, incoming)) return candidate;
  }
}
