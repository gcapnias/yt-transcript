/**
 * One fetch: one video in, one transcript on disk.
 *
 * This is the unit a batch repeats (ytdlp-xmu.6) — the retry ladder is already
 * inside it, so a batch loop must not wrap it in a second one.
 *
 * The ladder sits *around* the temporary directory rather than inside it, so
 * every retry is a fresh invocation into a fresh directory. Retrying into the
 * directory a refused attempt left behind risks reading a half-written track
 * as the next attempt's success.
 */

import fs from 'node:fs/promises';

import { withRateLimitRetries } from './fetch-outcome.js';
import { xPost, YOUTUBE } from './site.js';
import { withTempDir } from './temp-dir.js';
import { renderTranscript } from './transcript.js';
import { writeTranscript } from './transcript-store.js';
import { fetchSubtitleTrack } from './ytdlp.js';

/**
 * Fetches a video's subtitle track and writes its transcript.
 *
 * Nothing is written unless the fetch succeeded: the transcript is rendered
 * inside the temporary directory's lifetime and written only after the ladder
 * returns, so a failed fetch leaves `transcripts/` untouched.
 *
 * An X post is fetched with `post: { videoNumber }` and no `videoId`: its
 * identity is not known until yt-dlp has reported on it (ADR-0004), so the
 * transcript is rendered, and named, from that report. This is the one place a
 * request is turned into the site every layer below asks (see `site.js`).
 *
 * @param {{ url: string, videoId: string|null, post?: { videoNumber: number },
 *           lang?: string }} video
 * @param {{ fetchTrack?: Function, write?: Function, dir?: string,
 *           sleep?: (ms: number) => Promise<void>, delays?: number[],
 *           onRetry?: Function }} [deps]
 * @returns {Promise<{ transcript: object, file: string }>}
 * @throws {FetchError} carrying `failure` and `retryable`
 */
export async function fetchTranscript({ url, videoId, post, lang = 'en' }, deps = {}) {
  // `fetchTrack` downloads the subtitle track; a *fetch*, in this codebase's
  // vocabulary, is the whole operation this function performs.
  const { fetchTrack = fetchSubtitleTrack, write = writeTranscript, dir, sleep, delays, onRetry } =
    deps;
  const site = post ? xPost(post.videoNumber) : YOUTUBE;

  const transcript = await withRateLimitRetries(
    () =>
      withTempDir(async (destDir) => {
        const { metadata, trackPath } = await fetchTrack({ url, lang, destDir, site });

        // Rendered before the directory goes: only the transcript leaves it.
        return renderTranscript({
          trackText: await fs.readFile(trackPath, 'utf8'),
          url,
          videoId,
          site,
          metadata,
        });
      }),
    { sleep, delays, onRetry },
  );

  const file = await write(transcript, { dir });
  return { transcript, file };
}
