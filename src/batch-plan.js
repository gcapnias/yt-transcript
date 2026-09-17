/**
 * The skip set: which of a batch's videos are actually fetched.
 *
 * Pure, and the seam the spec names — `(expanded urls, existing urls, force)
 * -> urls to fetch`. Nothing here reads the disk; the caller supplies the
 * `url`s it scanned out of `transcripts/`.
 *
 * **Skipping is batch-only.** A single video URL still overwrites, by design:
 * re-fetching one video is a deliberate act, while re-fetching a 200-video
 * playlist to gain two new entries is not.
 *
 * Matching is on the frontmatter `url` — the transcript's identity — and never
 * on the filename, so a transcript renamed by hand is still recognised.
 */

/**
 * @param {string[]} expanded canonical video urls, in expansion order
 * @param {string[]} existing the `url`s already present in `transcripts/`
 * @param {boolean} [force] `--force` means exactly "ignore the skip set"
 * @returns {{ fetch: string[], skipped: string[] }} `skipped` names only videos
 *   this batch expanded to, so it reads as a report about this run rather than
 *   about the directory.
 */
export function planBatch(expanded, existing = [], force = false) {
  const onDisk = new Set(existing);
  const seen = new Set();
  const fetch = [];
  const skipped = [];

  for (const url of expanded) {
    // A playlist may list the same video twice; a batch fetches it once.
    if (seen.has(url)) continue;
    seen.add(url);

    if (!force && onDisk.has(url)) skipped.push(url);
    else fetch.push(url);
  }

  return { fetch, skipped };
}
