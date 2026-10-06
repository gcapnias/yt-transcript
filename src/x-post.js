/**
 * What an X post's metadata means for a transcript: the identity, title and
 * slug fallback that YouTube gets from its video id and title.
 *
 * Everything is built from what `yt-dlp` reported, never from the input
 * (ADR-0004): `/i/status` and `t.co` inputs carry no handle, handles are
 * case-insensitive and get renamed, and `id` is the media id, shared with every
 * post that quotes the video. The handle is `uploader_id`, the post id is
 * `display_id`, and the video's rank is settled by the fetch, which may have
 * to list the post to find it (`reportedRank`, `rankInListing`).
 */

import { transcriptSlug } from './slug.js';

/** Links, `t.co` ones included, are removed from the post text. */
const LINK = /https?:\/\/\S+/g;

/**
 * The post text as a title: links out, every run of whitespace (newlines and
 * U+3000 included) one space, nothing truncated. yt-dlp's own `title` is
 * `<display name> - <text>` truncated, with a rank suffix that is not always
 * right (`reportedRank`).
 */
function postText(description) {
  return String(description ?? '')
    .replace(LINK, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What names video N of a post, wherever a post is named: video 1 gets nothing,
 * so the bare post url and `/video/1` are one transcript.
 *
 * @param {number} videoNumber which of the post's own videos, from 1
 * @param {string} separator `/video/` in a url, `-` in a filename
 * @returns {string}
 */
export function videoSuffix(videoNumber, separator) {
  return videoNumber > 1 ? `${separator}${videoNumber}` : '';
}

/**
 * Which video entry was fetched, when the fetch alone can tell: its rank from
 * 1 among the post's videos (photos excluded), or `null` when only a listing
 * of the post can tell.
 *
 * `yt-dlp`'s ` #N` title suffix is trusted for one thing only. A whole-post
 * fetch reports the rank as `playlist_index`, and the suffix agrees with it. A
 * fetch through a `/video/N` selector reports no index, and on a multi-video
 * post its suffix is `#1` for every video, the second included: a bug in
 * yt-dlp's Twitter extractor (ADR-0004). What that path still gets right is
 * leaving the suffix off when the post has only one video.
 *
 * @param {{ title?: string, playlistIndex?: number|null }} metadata
 * @returns {number|null}
 */
export function reportedRank({ title, playlistIndex }) {
  if (playlistIndex) return playlistIndex;
  return / #[1-9]\d*$/.test(title ?? '') ? null : 1;
}

/**
 * The fetched video's rank in a listing of its post, found by media id, or
 * `null` when the listing lacks it. Never a guessed first: that guess is what
 * files a later video over the first one's transcript.
 *
 * @param {string} mediaId
 * @param {{ mediaId: string, playlistIndex: number }[]} listing
 * @returns {number|null}
 */
export function rankInListing(mediaId, listing) {
  if (!mediaId) return null;
  return listing.find((entry) => entry.mediaId === mediaId)?.playlistIndex ?? null;
}

/**
 * @param {{ description: string, uploader: string, uploaderId: string,
 *           displayId: string }} metadata
 * @param {number} videoNumber the fetched video's rank among the post's videos,
 *   settled by the fetch (`reportedRank`, else `rankInListing`)
 * @returns {{ title: string, url: string, channel: string, collisionId: string,
 *             slug: string }}
 */
export function postIdentity(metadata, videoNumber) {
  const { uploader, uploaderId, displayId } = metadata;
  const text = postText(metadata.description);
  // Lowercased, unlike YouTube's mixed-case video id: deliberately, and only
  // the case changes, so a handle's underscores are kept.
  const fallbackSlug = `${uploaderId}-${displayId}${videoSuffix(videoNumber, '-')}`.toLowerCase();

  return {
    title: text || `@${uploaderId} post ${displayId}`,
    url: `https://x.com/i/status/${displayId}${videoSuffix(videoNumber, '/video/')}`,
    channel: uploader ? `${uploader} (@${uploaderId})` : `@${uploaderId}`,
    // What the filename collision rule suffixes, where YouTube uses the video
    // id: the post, never the video's own id (CONTEXT.md, Post).
    collisionId: `${displayId}${videoSuffix(videoNumber, '-')}`,
    // A post with no text has no title to slug: `@alice post 1` would read as
    // `alice-post-1`, so it goes straight to the fallback.
    slug: text ? transcriptSlug(text, fallbackSlug) : fallbackSlug,
  };
}
