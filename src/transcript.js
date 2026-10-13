/**
 * The transcript rendering seam:
 *
 *   (raw subtitle track text, video metadata[, site]) -> { filename, contents }
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

/** What opens a turn's first paragraph: an em dash and a space (ADR-0007). */
const TURN_DASH = '— ';

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
 *           displayId?: string, channelId?: string }} input.metadata
 * @param {number} [input.videoNumber] for an X post, which of its videos the
 *   track is, from 1; settled by the fetch, and required for a post
 * @param {string} [input.trackKey] the track's key, such as `en-JkeT_87f4cc`;
 *   a named track is cleaned with the auto notation (ADR-0009)
 * @param {'auto'|'prose'|'dialog'} [input.layout] the layout asked for, which
 *   `cleanTrack` takes as `auto` when absent. The result's `layout` is the one
 *   used, and `warnings` is what the caller owes the human about it.
 * @param {Date} [input.fetchedAt]
 *
 * `collisionId` in the result is what the filename collision rule suffixes: the
 * YouTube video id, or for an X post the post id (plus `-<N>` for video N ≥ 2).
 * `url` is the frontmatter `url`, for an X post the one built from metadata.
 *
 * @returns {{ slug: string, filename: string, contents: string,
 *             url: string, collisionId: string, channelFolder: string,
 *             trackKind: 'auto'|'manual', layout: 'prose'|'dialog',
 *             warnings: string[],
 *             video: { title: string, channel: string, duration: string,
 *                      uploaded: string } }}
 */
export function renderTranscript({
  trackText,
  url: fetchedUrl,
  videoId: fetchedVideoId,
  site = YOUTUBE,
  metadata,
  videoNumber,
  trackKey,
  layout: requestedLayout,
  fetchedAt = new Date(),
}) {
  const { trackKind: detectedKind, layout, marksTurns, turns } = cleanTrack(trackText, {
    trackKey,
    layout: requestedLayout,
  });
  const { url, collisionId, trackKind, title, channel, channelFolder, slug } = site.identify({
    metadata,
    url: fetchedUrl,
    videoId: fetchedVideoId,
    trackKind: detectedKind,
    videoNumber,
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
    // The layout actually used, never the one asked for: `auto` is not a layout.
    layout,
  });

  // No H1 and no timestamps: the title is in the frontmatter, and repeating it
  // is redundant for the agent that consumes the file. In a dialog each turn's
  // first paragraph opens with an em dash; no speaker is ever named.
  const body = turns
    .flatMap((paragraphs) =>
      layout === 'dialog' ? [`${TURN_DASH}${paragraphs[0]}`, ...paragraphs.slice(1)] : paragraphs,
    )
    .join('\n\n');

  // Forcing a dialog onto a track with no speaker-change notation is honoured,
  // but the human asked for turns and got one, so they are told which video. A
  // track whose only marker opens it does carry notation, and an empty track
  // has no turn at all; the warning describes neither.
  const warnings =
    requestedLayout === 'dialog' && !marksTurns && turns.length === 1
      ? [`--layout dialog: ${url} marks no speaker changes, so its dialog is a single turn.`]
      : [];

  return {
    slug,
    filename: `${slug}.md`,
    contents: `${frontmatter}\n\n${body}\n`,
    url,
    collisionId,
    // Where the store files it (ADR-0008); never written into the frontmatter.
    channelFolder,
    trackKind,
    layout,
    warnings,
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
