/**
 * What an X post's metadata means for a transcript: the identity, title and
 * slug fallback that YouTube gets from its video id and title.
 *
 * Everything is built from what `yt-dlp` reported, never from the input
 * (ADR-0004): `/i/status` and `t.co` inputs carry no handle, handles are
 * case-insensitive and get renamed, and `id` is the media id, shared with every
 * post that quotes the video. The handle is `uploader_id` and the post id is
 * `display_id`.
 */

/** Links, `t.co` ones included, are removed from the post text. */
const LINK = /https?:\/\/\S+/g;

/**
 * The post text as a title: links out, every run of whitespace (newlines and
 * U+3000 included) one space, nothing truncated. yt-dlp's own `title` is not
 * used: it is `<display name> - <text>` cut at 72 characters with a `...`.
 */
function postText(description) {
  return String(description ?? '')
    .replace(LINK, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {{ description: string, uploader: string, uploaderId: string, displayId: string }} metadata
 * @param {number} videoNumber which of the post's own videos was fetched, from 1
 * @returns {{ title: string, hasText: boolean, url: string, channel: string,
 *             videoId: string, fallbackSlug: string }}
 */
export function postIdentity(metadata, videoNumber) {
  const { uploader, uploaderId, displayId } = metadata;
  // Video 1 has no suffix, so the bare post url and `/video/1` are one transcript.
  const suffix = videoNumber > 1 ? `/video/${videoNumber}` : '';
  const text = postText(metadata.description);

  return {
    title: text || `@${uploaderId} post ${displayId}`,
    hasText: text !== '',
    url: `https://x.com/${uploaderId}/status/${displayId}${suffix}`,
    channel: uploader ? `${uploader} (@${uploaderId})` : `@${uploaderId}`,
    // What the filename collision rule suffixes, where YouTube uses the video id.
    videoId: videoNumber > 1 ? `${displayId}-${videoNumber}` : displayId,
    // Lowercased, unlike YouTube's mixed-case video id: deliberately, and only
    // the case changes, so a handle's underscores are kept.
    fallbackSlug: `${uploaderId}-${displayId}${videoNumber > 1 ? `-${videoNumber}` : ''}`.toLowerCase(),
  };
}
