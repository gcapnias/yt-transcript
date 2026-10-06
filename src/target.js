/**
 * Target parsing: what the user typed -> what the tool should fetch.
 *
 * Purely syntactic. No network call is made here, and none may be added:
 * `yt-dlp` picks its own extractor by regex before any I/O, so ours does too.
 *
 * The seam is `input string -> { kind, url, videoId }`, plus `videoNumber` on an
 * X post. A post's canonical url is not settled here: it comes from what
 * `yt-dlp` reports once the post is fetched (ADR-0004), so a post target
 * carries the url to *fetch* and nothing a transcript is identified by.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** A shape guard, not a playlist-id format: rejects empty and junk `list=` values. */
const LIST_ID_SHAPE = /^[A-Za-z0-9_-]+$/;
const HANDLE = /^@[A-Za-z0-9_.-]+$/;

/** An X host, with the `www.`, `mobile.` and `m.` subdomains `yt-dlp` accepts. */
const X_HOST = /^(?:(?:www|m|mobile)\.)?(?:x|twitter)\.com$/;
/**
 * A status url: `/<handle>/status/<id>`, `/i/status/<id>` or
 * `/i/web/status/<id>`, optionally naming one of the post's videos. `/photo/N`
 * is the same selector as `/video/N` to `yt-dlp`, so it is read the same way.
 *
 * What precedes `/status` is captured as the url's prefix, not as a handle:
 * `i` and `i/web` name nobody, and the handle a transcript records comes from
 * `yt-dlp` anyway (ADR-0004).
 */
const X_STATUS = /^\/(i\/web|[A-Za-z0-9_]+)\/status\/(\d+)(?:\/(video|photo)\/([1-9]\d*))?\/?$/;
/** Neither carries a subtitle track, so there is nothing for this tool to fetch. */
const X_NO_SUBTITLES = /^\/i\/(?:broadcasts|events|spaces)\//;
const T_CO_CODE = /^\/[A-Za-z0-9]+\/?$/;

/**
 * Channel tabs yt-dlp recognises. A URL already ending in one of these names
 * the tab it wants, so nothing is imposed on it.
 */
const CHANNEL_TABS = new Set([
  'videos',
  'shorts',
  'streams',
  'live',
  'featured',
  'playlists',
  'community',
  'about',
  'search',
]);

/** Raised when an input names nothing this tool knows how to fetch. */
export class TargetParseError extends Error {
  constructor(input, message = `Not a YouTube video, playlist or channel, or an X post: ${input}`) {
    super(message);
    this.name = 'TargetParseError';
    this.input = input;
  }
}

function video(videoId) {
  return {
    kind: 'video',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
  };
}

/**
 * A post is fetched as typed, minus its query and fragment: `/i/status` and
 * `t.co` inputs carry no handle to rebuild a url from. An explicit media
 * selector stays on the fetch url, including `/video/1`.
 */
function post(url, path, videoNumber = 1, selector = '') {
  const suffix = selector ? `/${selector}/${videoNumber}` : '';
  return { kind: 'post', url: `https://${url.hostname}${path}${suffix}`, videoId: null, videoNumber };
}

function xTarget(url, input) {
  if (url.hostname === 't.co') {
    if (!T_CO_CODE.test(url.pathname)) throw new TargetParseError(input);
    return post(url, url.pathname.replace(/\/$/, ''));
  }

  if (X_NO_SUBTITLES.test(url.pathname)) {
    throw new TargetParseError(
      input,
      `X Broadcasts and Spaces carry no subtitles, so there is nothing to fetch: ${input}`,
    );
  }

  const match = X_STATUS.exec(url.pathname);
  if (!match) throw new TargetParseError(input);
  const [, prefix, postId, selector, videoNumber] = match;
  return post(url, `/${prefix}/status/${postId}`, videoNumber ? Number(videoNumber) : 1, selector);
}

function playlist(listId, input) {
  if (!listId || !LIST_ID_SHAPE.test(listId)) throw new TargetParseError(input);
  return {
    kind: 'playlist',
    url: `https://www.youtube.com/playlist?list=${listId}`,
    videoId: null,
  };
}

/**
 * A *bare* channel resolves to its Videos tab: left alone, `yt-dlp` expands a
 * channel to Videos plus Shorts plus Live.
 *
 * A tab the user typed is left exactly as typed. Imposing Videos on
 * `/@handle/shorts` would fetch something other than what was asked for, and
 * the rewrite exists only to settle the bare case's ambiguity.
 */
function channel(segments) {
  const tab = CHANNEL_TABS.has(segments[segments.length - 1].toLowerCase());
  const pathname = tab ? segments.join('/') : `${segments.join('/')}/videos`;

  return {
    kind: 'channel',
    url: `https://www.youtube.com/${pathname}`,
    videoId: null,
  };
}

/**
 * @param {string} input a URL, a bare video id, or a bare `@handle`
 * @param {{ playlist?: boolean }} [options] `playlist: true` forces the batch
 *   reading of a URL that names both a video and a playlist
 * @returns {{ kind: 'video'|'playlist'|'channel', url: string, videoId: string|null }
 *   | { kind: 'post', url: string, videoId: null, videoNumber: number }}
 */
export function parseTarget(input, options = {}) {
  const forcePlaylist = options.playlist === true;
  const trimmed = String(input ?? '').trim();
  if (!trimmed) throw new TargetParseError(input);

  // Checked before the bare video id, since a handle is never a video id.
  if (HANDLE.test(trimmed)) return channel([trimmed]);

  if (VIDEO_ID.test(trimmed)) return video(trimmed);

  const url = toUrl(trimmed);
  if (!url) throw new TargetParseError(input);

  if (url.hostname === 't.co' || X_HOST.test(url.hostname)) return xTarget(url, input);

  const segments = url.pathname.split('/').filter(Boolean);
  const listId = url.searchParams.get('list');

  if (url.hostname === 'youtu.be') {
    return video(requireVideoId(segments[0], input));
  }

  if (segments[0] === 'watch') {
    // A `watch?v=...&list=...` URL means the video, deliberately diverging from
    // yt-dlp's own default. `--playlist` is what asks for the playlist instead.
    if (forcePlaylist && listId) return playlist(listId, input);
    return video(requireVideoId(url.searchParams.get('v'), input));
  }

  if (segments[0] === 'shorts') {
    return video(requireVideoId(segments[1], input));
  }

  if (segments[0] === 'playlist') {
    return playlist(listId, input);
  }

  if (segments[0] && HANDLE.test(segments[0])) {
    return channel(segments);
  }

  if (['channel', 'c', 'user'].includes(segments[0]) && segments[1]) {
    return channel(segments);
  }

  throw new TargetParseError(input);
}

function requireVideoId(candidate, input) {
  if (!candidate || !VIDEO_ID.test(candidate)) throw new TargetParseError(input);
  return candidate;
}

function toUrl(candidate) {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const known =
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 't.co' ||
    X_HOST.test(host);
  if (!known) return null;
  // `mobile.` and `m.` name no other site than the X host they prefix.
  url.hostname = host.replace(/^(?:m|mobile)\.(?=(?:x|twitter)\.com$)/, '');
  return url;
}
