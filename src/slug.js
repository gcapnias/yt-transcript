/**
 * The slug: the kebab-case filename a transcript is stored under, derived from
 * the video title.
 *
 * No special cases. Trimming the ends is what disposes of a `--` prefix and a
 * leading `/` without either being named.
 */

/** The full title is never lost to this cap — it is in the frontmatter. */
const SLUG_MAX_LENGTH = 120;

/** Deleted outright rather than separated: `Don't` -> `dont`, not `don-t`. */
const QUOTE_MARKS = /['‘’"“”]/g;

/**
 * Latin letters NFKD does not decompose. They carry no combining mark to
 * strip, so without this table each one becomes punctuation and then a
 * separator: `Søren` -> `s-ren`, `Paweł` -> `pawe-`, `Straße` -> `stra-e`.
 */
const TRANSLITERATIONS = new Map([
  ['ø', 'o'],
  ['ł', 'l'],
  ['đ', 'd'],
  ['ß', 'ss'],
  ['æ', 'ae'],
  ['œ', 'oe'],
  ['þ', 'th'],
  ['ð', 'd'],
]);

/**
 * Below this, the slug has swallowed so much of the title that it misleads,
 * and an honest video id is worth more than a plausible-looking lie.
 */
const MIN_RETENTION = 0.5;

/** Letters and digits in any script: the denominator of the retention ratio. */
const TITLE_CHARACTERS = /[\p{L}\p{N}]/gu;

/**
 * Alphanumerics kept in the slug, over letters and digits in the title. A
 * title with nothing countable in it retains nothing, which is what sends a
 * pure-punctuation title to the video id.
 */
function retention(slug, title) {
  const titleCharacters = (String(title).match(TITLE_CHARACTERS) ?? []).length;
  if (titleCharacters === 0) return 0;

  return (slug.match(/[a-z0-9]/g) ?? []).length / titleCharacters;
}

/**
 * @param {string} title
 * @returns {string} possibly empty, for a title with no Latin alphanumerics
 */
function slugify(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/./gu, character => TRANSLITERATIONS.get(character) ?? character)
    .replace(QUOTE_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Cuts an over-long slug at the last `-` boundary at or before the cap, so the
 * last word is never a fragment. A slug with no boundary to cut at is cut
 * hard: the cap never sends a title to the video id, it only shortens it.
 */
function cap(slug) {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;

  // One character past the cap, so a `-` sitting exactly on the boundary is
  // found and the cut lands at the full width.
  const boundary = slug.slice(0, SLUG_MAX_LENGTH + 1).lastIndexOf('-');
  const cut = boundary > 0 ? slug.slice(0, boundary) : slug.slice(0, SLUG_MAX_LENGTH);
  return cut.replace(/-+$/, '');
}

/** Where a transcript goes when its channel has neither a handle nor an id. */
export const UNKNOWN_CHANNEL_FOLDER = 'unknown-channel';

/**
 * The channel folder a transcript is filed in (ADR-0008): the channel's handle,
 * kebab-cased the way a slug is — a leading `@` drops out, and any run of other
 * characters, `_`, `.` and `-` included, becomes one `-` — but with neither the
 * retention fallback nor the length cap. A folder names a channel, not a title:
 * a handle cannot be too lossy to be honest, only empty.
 *
 * A handle that is missing, or kebab-cases to nothing (non-Latin), falls back to
 * the lowercased channel id, and a channel with neither to `unknown-channel`.
 *
 * @param {{ handle?: string, channelId?: string }} channel as `yt-dlp` reported it
 * @returns {string}
 */
export function channelFolder({ handle, channelId } = {}) {
  return slugify(handle ?? '') || String(channelId ?? '').toLowerCase() || UNKNOWN_CHANNEL_FOLDER;
}

/**
 * The slug a transcript is filed under.
 *
 * A slug retaining less than half the title's letters and digits is discarded
 * for the video id. That covers the empty slug — a title entirely non-Latin,
 * or pure punctuation — but also the worse case an emptiness test misses: a
 * mixed-script title slugs to something non-empty and plausible that has
 * silently dropped most of the words. `o3CX_Y59_74.md` at least announces that
 * it gave up. Nothing functional rests on the filename: identity is the
 * frontmatter `url`, and the real title is in the frontmatter and the catalog.
 *
 * Retention is measured on the slug the title produced, **before** the cap.
 * The cap is a later step answering a filesystem question, not a fidelity one;
 * measuring after it would let sheer length send a perfectly faithful long
 * title to the video id.
 *
 * @param {string} title
 * @param {string} videoId
 * @returns {string}
 */
export function transcriptSlug(title, videoId) {
  const slug = slugify(title);
  return retention(slug, title) >= MIN_RETENTION ? cap(slug) : videoId;
}
