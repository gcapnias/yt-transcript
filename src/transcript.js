/**
 * The transcript rendering seam:
 *
 *   (raw subtitle track text, video metadata[, post]) -> { filename, contents }
 *
 * One call, one diffable string. Everything the cleaning pipeline, the slug
 * and the frontmatter decide is visible in that string, which is why the tests
 * assert on it rather than on any stage inside — the pipeline's order is
 * forced, and pinning its stages individually would make it unrefactorable.
 *
 * Pure: no clock is read (the caller passes `fetchedAt`), and no file is
 * touched. Writing is `transcript-store.js`.
 */

import { cleanTrack } from './clean.js';
import { formatUploadDate, renderFrontmatter } from './frontmatter.js';
import { YOUTUBE } from './site.js';

/**
 * @param {object} input
 * @param {string} input.trackText the subtitle track exactly as downloaded
 * @param {string} input.url for a YouTube video, the canonical
 *   `https://www.youtube.com/watch?v=<id>` form
 * @param {string} input.videoId for a YouTube video, its id
 * @param {import('./site.js').Site} [input.site] YouTube unless given; an X post
 *   ignores `url` and `videoId`, and rebuilds both from the metadata
 * @param {{ title: string, channel: string, duration: string, uploadDate: string,
 *           description?: string, uploader?: string, uploaderId?: string,
 *           displayId?: string }} input.metadata
 * @param {Date} [input.fetchedAt]
 *
 * `collisionId` in the result is what the filename collision rule suffixes: the
 * YouTube video id, or for an X post the post id (plus `-<N>` for video N ≥ 2).
 * `url` is the frontmatter `url`, for an X post the one built from metadata.
 *
 * @returns {{ slug: string, filename: string, contents: string,
 *             url: string, collisionId: string, trackKind: 'auto'|'manual',
 *             video: { title: string, channel: string, duration: string,
 *                      uploaded: string } }}
 */
export function renderTranscript({
  trackText,
  url: fetchedUrl,
  videoId: fetchedVideoId,
  site = YOUTUBE,
  metadata,
  fetchedAt = new Date(),
}) {
  const { trackKind: detectedKind, paragraphs } = cleanTrack(trackText);
  const { url, collisionId, trackKind, title, channel, slug } = site.identify({
    metadata,
    url: fetchedUrl,
    videoId: fetchedVideoId,
    trackKind: detectedKind,
  });

  const frontmatter = renderFrontmatter({
    title,
    url,
    channel,
    duration: metadata?.duration ?? '',
    uploadDate: metadata?.uploadDate ?? '',
    fetchedAt,
    // `subtitles` is the frontmatter key's name, not the concept's: the track
    // kind is what it records.
    subtitles: trackKind,
  });

  // No H1 and no timestamps: the title is in the frontmatter, and repeating it
  // is redundant for the agent that consumes the file.
  const body = paragraphs.join('\n\n');

  return {
    slug,
    filename: `${slug}.md`,
    contents: `${frontmatter}\n\n${body}\n`,
    url,
    collisionId,
    trackKind,
    // What the run tells the human it just fetched. Carried out here rather
    // than re-read from the file or re-formatted by the CLI, so the terminal
    // and the frontmatter can only ever say the same thing.
    video: {
      title,
      channel,
      duration: metadata?.duration ?? '',
      uploaded: formatUploadDate(metadata?.uploadDate ?? ''),
    },
  };
}
