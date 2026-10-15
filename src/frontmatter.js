/**
 * The frontmatter: the YAML block opening a transcript, describing the video
 * it came from, or the meeting.
 *
 * Seven keys, in one order, then `layout`, which is newer than the rest and the
 * only one a transcript may lack. A meeting has no `url` and may have no
 * `duration` (ADR-0010), so both are written only when given. Every value
 * format below was settled against a YAML parser rather than by eye — see the
 * spec's Transcript contract section before widening any of it.
 */

/**
 * `title` and `channel` are **always** double-quoted, never quoted-when-needed:
 * three of the eight sample titles contain a `:` and one begins with `/`, and
 * `title: /wayfinder: Nothing is too big...` is invalid YAML. A conditional
 * rule is one an implementer gets subtly wrong.
 *
 * The backslash is escaped before the quote, so the backslash this inserts is
 * not escaped a second time.
 */
function quoted(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * `20260910` -> `2026-09-10`. A bare `20260910` is a number YAML and humans
 * both misread.
 *
 * Exported because the run's report shows the same date to the same human: two
 * formatters for one field is how the file and the terminal come to disagree.
 */
export function formatUploadDate(uploadDate) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(uploadDate ?? '').trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : String(uploadDate ?? '').trim();
}

/**
 * A full ISO-8601 UTC instant, `Z`-suffixed and second-precision. A date alone
 * loses same-day re-fetches, and milliseconds are noise in a provenance field.
 */
function formatFetched(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @param {{ title: string, url?: string, channel: string, duration?: string,
 *           uploadDate: string, fetchedAt: Date, subtitles: 'auto'|'manual',
 *           layout: 'prose'|'dialog'|'meeting' }} video
 * @returns {string} the block, closing `---` included, with no trailing newline
 */
export function renderFrontmatter(video) {
  return [
    '---',
    `title: ${quoted(video.title)}`,
    // Normalised to one shape on disk, so one regex reads it back.
    ...(video.url === undefined ? [] : [`url: ${video.url}`]),
    `channel: ${quoted(video.channel)}`,
    // Always quoted: bare `41:18` is not a string — YAML 1.1 parsers read
    // colon-separated digits as sexagesimal and yield 2478. Carried through
    // exactly as `yt-dlp` reported it, or as a meeting's last cue end shaped
    // like it. Left out when `undefined`, which only a meeting with no cues is.
    ...(video.duration === undefined ? [] : [`duration: ${quoted(video.duration)}`]),
    `upload_date: ${formatUploadDate(video.uploadDate)}`,
    `fetched: ${formatFetched(video.fetchedAt)}`,
    `subtitles: ${video.subtitles}`,
    // The layout used, not the one asked for. Written on every new transcript,
    // but the catalog never requires it: transcripts older than it have none.
    `layout: ${video.layout}`,
    '---',
  ].join('\n');
}
