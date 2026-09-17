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
import { renderFrontmatter } from './frontmatter.js';
import { transcriptSlug } from './slug.js';

/**
 * @param {object} input
 * @param {string} input.trackText the subtitle track exactly as downloaded
 * @param {string} input.url the canonical `https://www.youtube.com/watch?v=<id>` form
 * @param {string} input.videoId
 * @param {{ title: string, channel: string, duration: string, uploadDate: string }} input.metadata
 * @param {Date} [input.fetchedAt]
 * @returns {{ slug: string, filename: string, contents: string,
 *             url: string, videoId: string, subtitles: 'auto'|'manual' }}
 */
export function renderTranscript({ trackText, url, videoId, metadata, fetchedAt = new Date() }) {
  const { kind, paragraphs } = cleanTrack(trackText);
  const slug = transcriptSlug(metadata?.title ?? '', videoId);

  const frontmatter = renderFrontmatter({
    title: metadata?.title ?? '',
    url,
    channel: metadata?.channel ?? '',
    duration: metadata?.duration ?? '',
    uploadDate: metadata?.uploadDate ?? '',
    fetchedAt,
    subtitles: kind,
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
    subtitles: kind,
  };
}
