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

import { createHash } from 'node:crypto';

import { cleanTrack } from './clean.js';
import { formatUploadDate, renderFrontmatter } from './frontmatter.js';
import { cleanMeeting } from './meeting.js';
import { YOUTUBE } from './site.js';
import { MEETINGS_FOLDER, usableSlug } from './slug.js';

/** What opens a turn's first paragraph: an em dash and a space (ADR-0007). */
const TURN_DASH = '— ';

/** The `.vtt` a meeting's title is the file name without. */
const VTT_EXTENSION = /\.vtt$/i;

/**
 * Raised when a meeting's file name makes no usable slug (ADR-0011). A meeting
 * has no fallback name, so it is refused, and the remedy is the user's: rename
 * the file.
 */
export class UnusableMeetingNameError extends Error {
  constructor(fileName) {
    super(
      `Cannot transcribe "${fileName}": its name has too few Latin or Greek letters to make a filename. Rename the file and try again.`,
    );
    this.name = 'UnusableMeetingNameError';
    this.fileName = fileName;
  }
}

/** A date in the machine's own calendar, as yt-dlp writes one: `20260915`. */
function compactLocalDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * The shape both renderers end in: the body laid out from the turns, joined to
 * the frontmatter, and the rest of the result carried through untouched. The
 * one place the dash rule lives.
 *
 * No H1 and no timestamps: the title is in the frontmatter, and repeating it is
 * redundant for the agent that consumes the file. In a dialog or a meeting each
 * turn's first paragraph opens with an em dash, and in a meeting a named turn
 * follows it with the speaker's name in bold. Prose has no turns to open.
 *
 * @param {{ slug: string, frontmatter: string, layout: 'prose'|'dialog'|'meeting',
 *           turns: Array<{ speaker: string|null, paragraphs: string[] }> }} parts
 *   the rest of `parts` is the result's own fields
 */
function composeTranscript({ slug, frontmatter, turns, layout, ...rest }) {
  const body = turns
    .flatMap(({ speaker, paragraphs }) => {
      if (layout === 'prose') return paragraphs;
      const opening = speaker === null ? TURN_DASH : `${TURN_DASH}**${speaker}:** `;
      return [`${opening}${paragraphs[0]}`, ...paragraphs.slice(1)];
    })
    .join('\n\n');

  return { slug, filename: `${slug}.md`, contents: `${frontmatter}\n\n${body}\n`, layout, ...rest };
}

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

  // Forcing a dialog onto a track with no speaker-change notation is honoured,
  // but the human asked for turns and got one, so they are told which video. A
  // track whose only marker opens it does carry notation, and an empty track
  // has no turn at all; the warning describes neither.
  const warnings =
    requestedLayout === 'dialog' && !marksTurns && turns.length === 1
      ? [`--layout dialog: ${url} marks no speaker changes, so its dialog is a single turn.`]
      : [];

  return composeTranscript({
    slug,
    frontmatter,
    // In a video's dialog no speaker is ever named.
    turns: turns.map((paragraphs) => ({ speaker: null, paragraphs })),
    layout,
    isMeeting: false,
    url,
    collisionId,
    // Where the store files it (ADR-0008); never written into the frontmatter.
    channelFolder,
    trackKind,
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
  });
}

/**
 * The meeting counterpart of `renderTranscript` (ADR-0010):
 *
 *   (the local .vtt's text and name, its modification time) -> { filename, contents }
 *
 * A meeting has no site, so nothing here is identified by one: the title is the
 * file name, the date is when the file was saved, there is no url and no
 * channel, and the track is recorded as auto because it is speech recognition.
 * The slug is made from the title alone, Greek romanized (ADR-0011), so it does
 * not move when the file is saved again; a title with no usable slug is refused
 * with `UnusableMeetingNameError`, before anything is written.
 * Pure, as `renderTranscript` is: the caller reads the file and its mtime, and
 * passes `transcribedAt`, when the transcribing happened.
 *
 * @param {object} input
 * @param {string} input.trackText the meeting's track exactly as exported
 * @param {string} input.fileName the file's name, directory left off
 * @param {Date} input.modifiedAt the file's modification time
 * @param {'auto'|'prose'|'dialog'|'meeting'} [input.layout] the layout asked for
 * @param {Date} [input.transcribedAt]
 * @throws {UnusableMeetingNameError} when the file name has no usable slug
 *
 * `collisionId` in the result is what a slug collision suffixes: a short hash
 * of the title, which differs exactly when the meetings do. `url` is
 * `undefined` and `isMeeting` is true: a meeting is identified by its title
 * (see `writeTranscript`).
 *
 * @returns {{ slug: string, filename: string, contents: string, title: string,
 *             isMeeting: true, url: undefined, collisionId: string,
 *             channelFolder: 'meetings', trackKind: 'auto',
 *             layout: 'prose'|'dialog'|'meeting', warnings: string[],
 *             video: { title: string, channel: string, duration: string,
 *                      uploaded: string } }}
 */
export function renderMeetingTranscript({
  trackText,
  fileName,
  modifiedAt,
  layout: requestedLayout,
  transcribedAt = new Date(),
}) {
  const title = fileName.replace(VTT_EXTENSION, '');
  // First, so a refusal costs nothing: no fallback name stands in, because the
  // date of a re-downloaded file would file the same meeting twice.
  const slug = usableSlug(title);
  if (slug === null) throw new UnusableMeetingNameError(fileName);

  const { layout, duration, turns } = cleanMeeting(trackText, { layout: requestedLayout });
  const uploadDate = compactLocalDate(modifiedAt);

  const frontmatter = renderFrontmatter({
    title,
    channel: '',
    ...(duration !== null && { duration }),
    uploadDate,
    // The frontmatter key is `fetched`, and for a meeting it records when the
    // file was transcribed: the key's name is the contract, not the concept.
    fetchedAt: transcribedAt,
    subtitles: 'auto',
    layout,
  });

  return composeTranscript({
    slug,
    frontmatter,
    turns,
    layout,
    title,
    isMeeting: true,
    url: undefined,
    collisionId: createHash('sha1').update(title).digest('hex').slice(0, 8),
    channelFolder: MEETINGS_FOLDER,
    trackKind: 'auto',
    warnings: [],
    // Named `video` because the CLI's report and every video's result read that
    // key; for a meeting it is what the run tells the human about the meeting.
    video: { title, channel: '', duration: duration ?? '', uploaded: formatUploadDate(uploadDate) },
  });
}
