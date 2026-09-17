/**
 * The transcript rendering seam:
 *
 *   (raw subtitle track text, video metadata) -> { filename, contents }
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

/**
 * @param {object} input
 * @param {string} input.trackText the subtitle track exactly as downloaded
 * @param {string} input.url the canonical `https://www.youtube.com/watch?v=<id>` form
 * @param {string} input.videoId
 * @param {{ title: string, channel: string, duration: string, uploadDate: string }} input.metadata
 * @param {Date} [input.fetchedAt]
 * @returns {{ slug: string, filename: string, contents: string,
 *             url: string, videoId: string, trackKind: 'auto'|'manual',
 *             video: { title: string, channel: string, duration: string,
 *                      uploaded: string } }}
 */
export function renderTranscript({ trackText, url, videoId, metadata, fetchedAt = new Date() }) {
  const { trackKind, paragraphs } = cleanTrack(trackText);
  const slug = transcriptSlug(metadata?.title ?? '', videoId);

  const frontmatter = renderFrontmatter({
    title: metadata?.title ?? '',
    url,
    channel: metadata?.channel ?? '',
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
      title: metadata?.title ?? '',
      channel: metadata?.channel ?? '',
      duration: metadata?.duration ?? '',
      uploaded: formatUploadDate(metadata?.uploadDate ?? ''),
    },
  };
}
