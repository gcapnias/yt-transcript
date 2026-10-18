/**
 * One transcription: one meeting's local `.vtt` in, one transcript on disk
 * (ADR-0010). The counterpart of `fetch.js`, with none of its machinery: no
 * yt-dlp, no network, no temporary directory and no retry ladder, because the
 * track is already a file and reading it cannot be rate-limited.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { renderMeetingTranscript } from './transcript.js';
import { writeTranscript } from './transcript-store.js';

/** Raised when the `.vtt` a user named is not there. */
export class MeetingFileNotFoundError extends Error {
  constructor(file) {
    super(`File not found: ${file}`);
    this.name = 'MeetingFileNotFoundError';
    this.file = file;
  }
}

/**
 * @param {{ path: string, layout?: 'auto'|'prose'|'dialog'|'meeting' }} input
 *   `path` is the `.vtt`'s absolute path, as `parseTarget` gives it
 * @param {{ dir?: string, now?: () => Date }} [options] `now` is the clock the
 *   transcribing is dated by (the frontmatter key is called `fetched`); `dir`
 *   is where transcripts live
 * @returns {Promise<{ transcript: ReturnType<typeof renderMeetingTranscript>, file: string }>}
 * @throws {MeetingFileNotFoundError} before anything is written
 * @throws {UnusableMeetingNameError} before anything is written
 */
export async function transcribeMeeting({ path: trackPath, layout }, { dir, now = () => new Date() } = {}) {
  let trackText;
  let modifiedAt;
  try {
    [trackText, { mtime: modifiedAt }] = await Promise.all([
      fs.readFile(trackPath, 'utf8'),
      fs.stat(trackPath),
    ]);
  } catch (error) {
    // A directory named `x.vtt` is not a track either, and says so as EISDIR.
    if (error.code === 'ENOENT' || error.code === 'EISDIR') throw new MeetingFileNotFoundError(trackPath);
    throw error;
  }

  const transcript = renderMeetingTranscript({
    trackText,
    fileName: path.basename(trackPath),
    modifiedAt,
    layout,
    transcribedAt: now(),
  });

  const file = await writeTranscript(transcript, { dir });
  return { transcript, file };
}
