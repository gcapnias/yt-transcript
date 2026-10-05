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

import { transcriptSlug } from './slug.js';

/** The `/video/N` or `/photo/N` at the end of a status url. */
const VIDEO_NUMBER = /\/status\/\d+\/(?:video|photo)\/([1-9]\d*)\/?(?:[?#].*)?$/;

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
 * Which of the post's videos was fetched, as `yt-dlp` reports it.
 *
 * `webpage_url` is the url the extractor worked from: the input as typed, or
 * for a `t.co` link the url it expands to. A short link carries no number of
 * its own, so only the report can say it named video 2. With no number in the
 * report, the one requested stands.
 */
function reportedVideoNumber(webpageUrl, requested) {
  const match = VIDEO_NUMBER.exec(webpageUrl ?? '');
  return match ? Number(match[1]) : requested;
}

/**
 * @param {{ description: string, uploader: string, uploaderId: string, displayId: string,
 *           webpageUrl?: string }} metadata
 * @param {number} requested which of the post's own videos was asked for, from 1
 * @returns {{ title: string, url: string, channel: string, collisionId: string,
 *             slug: string }}
 */
export function postIdentity(metadata, requested) {
  const { uploader, uploaderId, displayId } = metadata;
  const videoNumber = reportedVideoNumber(metadata.webpageUrl, requested);
  const text = postText(metadata.description);
  // Lowercased, unlike YouTube's mixed-case video id: deliberately, and only
  // the case changes, so a handle's underscores are kept.
  const fallbackSlug = `${uploaderId}-${displayId}${videoSuffix(videoNumber, '-')}`.toLowerCase();

  return {
    title: text || `@${uploaderId} post ${displayId}`,
    url: `https://x.com/${uploaderId}/status/${displayId}${videoSuffix(videoNumber, '/video/')}`,
    channel: uploader ? `${uploader} (@${uploaderId})` : `@${uploaderId}`,
    // What the filename collision rule suffixes, where YouTube uses the video
    // id: the post, never the video's own id (CONTEXT.md, Post).
    collisionId: `${displayId}${videoSuffix(videoNumber, '-')}`,
    // A post with no text has no title to slug: `@alice post 1` would read as
    // `alice-post-1`, so it goes straight to the fallback.
    slug: text ? transcriptSlug(text, fallbackSlug) : fallbackSlug,
  };
}
