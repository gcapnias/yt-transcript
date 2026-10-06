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

import { describeFailure, UNLISTED_VIDEO, withRateLimitRetries } from './fetch-outcome.js';
import { xPost, YOUTUBE } from './site.js';
import { withTempDir } from './temp-dir.js';
import { renderTranscript } from './transcript.js';
import { writeTranscript } from './transcript-store.js';
import { rankInListing, reportedRank } from './x-post.js';
import { FetchError, fetchSubtitleTrack, listPostVideos } from './ytdlp.js';

/**
 * Fetches a video's subtitle track and writes its transcript.
 *
 * Nothing is written unless the fetch succeeded: the transcript is rendered
 * inside the temporary directory's lifetime and written only after the ladder
 * returns, so a failed fetch leaves `transcripts/` untouched.
 *
 * An X post is fetched with `post: { videoNumber }` and no `videoId`: its
 * identity is not known until yt-dlp has reported on it (ADR-0004), so the
 * transcript is rendered, and named, from that report. `post.videoNumber` is
 * the input's N, which counts photos too: it is never the transcript's video
 * number, which `postVideoNumber` settles. This is the one place a request is
 * turned into the site every layer below asks (see `site.js`).
 *
 * @param {{ url: string, videoId: string|null, post?: { videoNumber: number },
 *           lang?: string }} video
 * @param {{ fetchTrack?: Function, listVideos?: Function, write?: Function, dir?: string,
 *           sleep?: (ms: number) => Promise<void>, delays?: number[],
 *           onRetry?: Function }} [deps]
 * @returns {Promise<{ transcript: object, file: string }>}
 * @throws {FetchError} carrying `failure` and `retryable`
 */
export async function fetchTranscript({ url, videoId, post, lang = 'en' }, deps = {}) {
  // `fetchTrack` downloads the subtitle track; a *fetch*, in this codebase's
  // vocabulary, is the whole operation this function performs.
  const {
    fetchTrack = fetchSubtitleTrack,
    listVideos = listPostVideos,
    write = writeTranscript,
    dir,
    sleep,
    delays,
    onRetry,
  } = deps;
  const site = post ? xPost() : YOUTUBE;

  const transcript = await withRateLimitRetries(
    () =>
      withTempDir(async (destDir) => {
        const { metadata, trackPath } = await fetchTrack({ url, lang, destDir, site });
        const videoNumber = post ? await postVideoNumber({ metadata, url, lang, listVideos }) : undefined;

        // Rendered before the directory goes: only the transcript leaves it.
        return renderTranscript({
          trackText: await fs.readFile(trackPath, 'utf8'),
          url,
          videoId,
          site,
          metadata,
          videoNumber,
        });
      }),
    { sleep, delays, onRetry },
  );

  const file = await write(transcript, { dir });
  return { transcript, file };
}

/**
 * Which of the post's videos was fetched (ADR-0004).
 *
 * A whole-post fetch, and a fetch of a post with one video, say so
 * themselves: one invocation. A fetch through a `/video/N` selector of a
 * multi-video post does not, since `yt-dlp` numbers every such video `#1`; the
 * post is listed, and the fetched media id looked up. That listing is inside
 * the attempt, so a 429 on it is retried with the fetch.
 *
 * @throws {FetchError} `UNLISTED_VIDEO` when the listing lacks the video:
 *   never filed as the first, which would overwrite the first's transcript
 */
async function postVideoNumber({ metadata, url, lang, listVideos }) {
  const reported = reportedRank(metadata);
  if (reported) return reported;

  const listing = await listVideos({ postId: metadata.displayId, url, lang });
  const listed = rankInListing(metadata.mediaId, listing);
  if (listed) return listed;

  throw new FetchError(describeFailure({ failure: UNLISTED_VIDEO, url, lang }), {
    url,
    exitCode: 0,
    failure: UNLISTED_VIDEO,
    retryable: false,
  });
}
