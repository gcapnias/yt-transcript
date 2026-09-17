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
 * @param {string} title
 * @returns {string} possibly empty, for a title with no Latin alphanumerics
 */
function slugify(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(QUOTE_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Cuts an over-long slug at the last `-` boundary at or before the cap, so the
 * last word is never a fragment. A slug with no boundary to cut at is cut
 * hard: the title is not empty, and the video-id fallback is for empty slugs.
 */
function cap(slug) {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;

  // One character past the cap, so a `-` sitting exactly on the boundary is
  // found and the cut lands at the full width.
  const boundary = slug.slice(0, SLUG_MAX_LENGTH + 1).lastIndexOf('-');
  const cut = boundary > 0 ? slug.slice(0, boundary) : slug.slice(0, SLUG_MAX_LENGTH);
  return cut.replace(/-+$/, '');
}

/**
 * The slug a transcript is filed under.
 *
 * An empty slug — a title entirely non-Latin, or pure punctuation — falls back
 * to the video id, so no transliteration dependency is needed and the tool
 * never simply fails on a Greek or Japanese title.
 *
 * @param {string} title
 * @param {string} videoId
 * @returns {string}
 */
export function transcriptSlug(title, videoId) {
  return cap(slugify(title)) || videoId;
}
