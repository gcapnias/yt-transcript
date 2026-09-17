/**
 * Target parsing: what the user typed -> what the tool should fetch.
 *
 * Purely syntactic. No network call is made here, and none may be added:
 * `yt-dlp` picks its own extractor by regex before any I/O, so ours does too.
 *
 * The seam is `input string -> { kind, url, videoId }`.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]+$/;
const HANDLE = /^@[A-Za-z0-9_.-]+$/;

/** Channel tabs yt-dlp recognises, dropped so the Videos tab can be imposed. */
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
  constructor(input) {
    super(`Not a YouTube video, playlist or channel: ${input}`);
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

function playlist(listId, input) {
  if (!listId || !PLAYLIST_ID.test(listId)) throw new TargetParseError(input);
  return {
    kind: 'playlist',
    url: `https://www.youtube.com/playlist?list=${listId}`,
    videoId: null,
  };
}

/**
 * A channel always resolves to its Videos tab. Left alone, `yt-dlp` expands a
 * channel to Videos plus Shorts plus Live.
 */
function channel(pathSegments) {
  const segments = [...pathSegments];
  if (segments.length > 1 && CHANNEL_TABS.has(segments[segments.length - 1].toLowerCase())) {
    segments.pop();
  }
  return {
    kind: 'channel',
    url: `https://www.youtube.com/${segments.join('/')}/videos`,
    videoId: null,
  };
}

/**
 * @param {string} input a URL, a bare video id, or a bare `@handle`
 * @param {{ playlist?: boolean }} [options] `playlist: true` forces the batch
 *   reading of a URL that names both a video and a playlist
 * @returns {{ kind: 'video'|'playlist'|'channel', url: string, videoId: string|null }}
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
  if (host !== 'youtu.be' && host !== 'youtube.com' && !host.endsWith('.youtube.com')) {
    return null;
  }
  url.hostname = host;
  return url;
}
