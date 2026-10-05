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
import { transcriptSlug } from './slug.js';
import { postIdentity } from './x-post.js';

/**
 * @param {object} input
 * @param {string} input.trackText the subtitle track exactly as downloaded
 * @param {string} input.url for a YouTube video, the canonical
 *   `https://www.youtube.com/watch?v=<id>` form
 * @param {string} input.videoId for a YouTube video, its id
 * @param {{ videoNumber: number }} [input.post] present for an X post: `url` and
 *   `videoId` are then ignored, and rebuilt from the metadata (see `x-post.js`)
 * @param {{ title: string, channel: string, duration: string, uploadDate: string,
 *           description?: string, uploader?: string, uploaderId?: string,
 *           displayId?: string }} input.metadata
 * @param {Date} [input.fetchedAt]
 * `videoId` in the result is what the filename collision rule suffixes: the
 * YouTube video id, or for an X post the post id (plus `-<N>` for video N ≥ 2).
 * `url` is the frontmatter `url`, for an X post the one built from metadata.
 *
 * @returns {{ slug: string, filename: string, contents: string,
 *             url: string, videoId: string, trackKind: 'auto'|'manual',
 *             video: { title: string, channel: string, duration: string,
 *                      uploaded: string } }}
 */
export function renderTranscript({
  trackText,
  url: fetchedUrl,
  videoId: fetchedVideoId,
  post,
  metadata,
  fetchedAt = new Date(),
}) {
  const { trackKind: detectedKind, paragraphs } = cleanTrack(trackText);
  const identity = post ? postIdentity(metadata ?? {}, post.videoNumber) : null;

  // For an X post the identity comes from what yt-dlp reported, never from the
  // url fetched (ADR-0004), and every track is auto, whatever it looks like
  // (ADR-0003). The *cleaning* above still follows what the track looks like:
  // the recorded kind is a claim about provenance, not a cleaning rule.
  const url = identity?.url ?? fetchedUrl;
  const videoId = identity?.videoId ?? fetchedVideoId;
  const trackKind = identity ? 'auto' : detectedKind;
  const title = identity?.title ?? metadata?.title ?? '';
  const channel = identity?.channel ?? metadata?.channel ?? '';
  // A post with no text has no title to slug: `@alice post 1` would read as
  // `alice-post-1`, so it goes straight to the fallback.
  const slug = identity
    ? identity.hasText
      ? transcriptSlug(title, identity.fallbackSlug)
      : identity.fallbackSlug
    : transcriptSlug(title, videoId);

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
    videoId,
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
