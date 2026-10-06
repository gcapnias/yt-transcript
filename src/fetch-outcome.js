/**
 * What a fetch outcome means, and what to do about it.
 *
 * Pure and spawn-free: every rule here is decided from a recorded process
 * outcome, which is what makes the exit-code rules and the retry ladder
 * testable without a live, rate-limited third party. `ytdlp.js` applies them
 * to a real invocation.
 *
 * A YouTube video's outcome is an exit code and whether a track landed, and
 * nothing more (`classifyFetch`). An X post's outcome adds the stderr text and
 * the reported extractor (`classifyPostFetch`), because its permanent failures
 * exit like a 429 and only their words tell them apart.
 */

/** The requested language has no subtitle track. Permanent. */
export const NO_SUBTITLES = 'no-subtitles';

/** A refusal that looks like HTTP 429. The one retried failure. */
export const RATE_LIMITED = 'rate-limited';

// The X post failures. Every one is permanent: a post with no video, or with no
// such video, or behind a login, is not made fetchable by waiting.

/** The post has no video: text, photos only, or it does not exist. */
export const NO_VIDEO = 'no-video';
/** `/video/N` names a video the post does not have. */
export const NO_SUCH_VIDEO = 'no-such-video';
/** The post is protected or age-restricted; yt-transcript does not log in. */
export const LOGIN_REQUIRED = 'login-required';
/** The fetch led away from X, e.g. a link-only post followed to another site. */
export const NOT_AN_X_POST = 'not-an-x-post';
/** X answered, but without the handle or post id a transcript is filed under. */
export const NO_POST_IDENTITY = 'no-post-identity';

/**
 * The settled ladder: one wait per retry, so the invocation count is
 * `RETRY_DELAYS_MS.length + 1` everywhere and never a literal.
 *
 * Three delays means three retries after the first invocation — the reading
 * under which all three are reachable (ytdlp-xmu.5).
 */
export const RETRY_DELAYS_MS = [5000, 15000, 45000];

/**
 * Classifies one fetch from its exit code and whether a subtitle track landed.
 *
 * **Success is exit 0 *and* a non-empty subtitle file.** Both halves: a video
 * with no captions in the requested language exits 0, says `There are no
 * subtitles for the requested languages`, and writes nothing.
 *
 * **No stderr is parsed, and none is accepted here.** Measured: no captions
 * exits 0, an HTTP 429 exits 1, so the exit code alone separates the permanent
 * failure from the retryable one.
 *
 * A consequence worth stating plainly: every non-zero exit is treated as
 * rate-limited and retried, including a private or deleted video. The spec
 * forbids reading a video's stderr text that would tell them apart (an X post
 * is the one exception, in `classifyPostFetch`), so "every other
 * failure is permanent" is the reasoning behind the rule rather than a
 * distinction this code can draw. `describeFailure` is worded accordingly.
 *
 * @param {{ exitCode: number, hasTrack: boolean }} outcome
 * @returns {{ ok: true } | { ok: false, failure: string, retryable: boolean }}
 */
export function classifyFetch({ exitCode, hasTrack }) {
  if (exitCode === 0 && hasTrack) return { ok: true };
  if (exitCode === 0) return { ok: false, failure: NO_SUBTITLES, retryable: false };
  return { ok: false, failure: RATE_LIMITED, retryable: true };
}

/**
 * The stderr lines that mean a post failure, matched on the extractor's own
 * words. Recorded from `yt-dlp` 2026.08.19, except the login pair, which come
 * from the extractor's source (no protected or NSFW post was reachable).
 * `No video formats found` is what X's extractor gives for a link-only post
 * whose link held no video; from another site's extractor it is that site's
 * failure, which `OTHER_SITE_ERROR` is checked first to catch.
 */
const POST_FAILURES = [
  [/No video could be found in this tweet|No video formats found/, NO_VIDEO],
  [/Video #\d+ is unavailable|Media #\d+ is not a video/, NO_SUCH_VIDEO],
  [/requires authentication|not authorized to view/, LOGIN_REQUIRED],
];

/** An error from an extractor that is not X's, or from none: the link led away. */
const OTHER_SITE_ERROR = /^ERROR: (?:\[(?!twitter)[^\]]+\]|Unsupported URL)/m;

/**
 * Classifies one X post fetch.
 *
 * **Unlike `classifyFetch`, this reads stderr**, and only for a post, only
 * after a non-zero exit. A YouTube video's permanent failures can be told from
 * a 429 by nothing but their exit code, so none of its text is read. X's
 * cannot: a post with no video, no such video or a login wall all exit 1, the
 * same as a 429, and retrying them three times would spend a minute on a
 * certainty. Anything unrecognised stays what it was: rate-limited, retried.
 *
 * `extractorKey` is what `yt-dlp` reports for a fetch that succeeded in
 * extracting; anything but `Twitter` means a link-only post was followed to
 * another site, whose video must not be filed under the post's url. A track
 * from X that came without its handle or post id is refused too: the post id
 * identifies the transcript (ADR-0004), and the handle names its channel
 * (ADR-0005).
 *
 * @param {{ exitCode: number, hasTrack: boolean, stderr?: string, extractorKey?: string,
 *           uploaderId?: string, displayId?: string }} outcome
 * @returns {{ ok: true } | { ok: false, failure: string, retryable: boolean }}
 */
export function classifyPostFetch({
  exitCode,
  hasTrack,
  stderr = '',
  extractorKey = '',
  uploaderId = '',
  displayId = '',
}) {
  if (exitCode === 0) {
    // A success that did not say it came from X's extractor is not filed as an
    // X post: with no report there is no handle or post id to identify it by.
    if (extractorKey !== 'Twitter') return { ok: false, failure: NOT_AN_X_POST, retryable: false };
    if (hasTrack && (!uploaderId || !displayId)) {
      return { ok: false, failure: NO_POST_IDENTITY, retryable: false };
    }
    return classifyFetch({ exitCode, hasTrack });
  }

  // Who failed comes before what failed: another site's words are never read
  // as a verdict on the post.
  if (OTHER_SITE_ERROR.test(stderr)) return { ok: false, failure: NOT_AN_X_POST, retryable: false };
  for (const [pattern, failure] of POST_FAILURES) {
    if (pattern.test(stderr)) return { ok: false, failure, retryable: false };
  }

  return classifyFetch({ exitCode, hasTrack });
}

/**
 * The message a user sees for a failure.
 *
 * The signature is the guarantee that **the original spoken language is never
 * surfaced**: the only language that can reach this function is the one the
 * user asked for.
 *
 * @param {{ failure: string, url: string, lang: string }} failure
 * @returns {string}
 */
export function describeFailure({ failure, url, lang }) {
  if (failure === NO_SUBTITLES) {
    return (
      `No subtitles in "${lang}" are available for ${url}.\n` +
      'Nothing was written. yt-transcript only ever retrieves the language you asked for.'
    );
  }

  if (failure === NO_VIDEO) {
    return (
      `No video could be found in ${url}.\n` +
      'The post has only text or photos, or it does not exist. Nothing was written.'
    );
  }

  if (failure === NO_SUCH_VIDEO) {
    return (
      `There is no such video in the post ${url}.\n` +
      'Videos are numbered from 1 and count only the post\'s own. Nothing was written.'
    );
  }

  if (failure === LOGIN_REQUIRED) {
    return (
      `The post ${url} requires logging in to view (it is protected or age-restricted), ` +
      'which yt-transcript does not do.\nNothing was written.'
    );
  }

  if (failure === NOT_AN_X_POST) {
    return (
      `${url} does not lead to a video in an X post: the post is a link to another site.\n` +
      'Nothing was written.'
    );
  }

  if (failure === NO_POST_IDENTITY) {
    return (
      `yt-dlp did not report the handle and post id of ${url}, so there is no url to ` +
      'identify its transcript by.\nNothing was written.'
    );
  }

  // Observation first, interpretation second, and no promise: the translation
  // endpoint has refused a session's very first request and refused again
  // after a four-minute cooldown while native tracks succeeded in the same
  // minute. It is a near-zero standing allowance, not a quota on a timer.
  return (
    `Rate-limited fetching ${url}.\n` +
    'yt-dlp exited non-zero with no subtitle track on every attempt, which is what ' +
    'an HTTP 429 looks like. Nothing was written, and a later run may succeed.'
  );
}

/**
 * The line reporting one rung of the ladder, naming the video.
 *
 * @param {{ url: string, attempt: number, attempts: number, delayMs: number }} retry
 * @returns {string}
 */
export function describeRetry({ url, attempt, attempts, delayMs }) {
  return `Rate-limited fetching ${url} (attempt ${attempt} of ${attempts}); retrying in ${delayMs / 1000}s.`;
}

/**
 * Runs `attempt`, climbing the retry ladder while it fails retryably.
 *
 * Retryability is carried on the error, not decided here, so a failure that is
 * not a fetch failure at all — a missing `yt-dlp`, a programming error —
 * propagates on its first throw.
 *
 * `sleep` is injected so the ladder's 65 seconds of real waiting never reach a
 * test suite.
 *
 * @template T
 * @param {() => Promise<T>} attempt
 * @param {{ sleep?: (ms: number) => Promise<void>,
 *           delays?: number[],
 *           onRetry?: (retry: { attempt: number, attempts: number, delayMs: number, error: Error }) => void }} [options]
 * @returns {Promise<T>}
 */
export async function withRateLimitRetries(attempt, options = {}) {
  const { sleep = wait, delays = RETRY_DELAYS_MS, onRetry = () => {} } = options;

  for (let index = 0; ; index += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (!error?.retryable || index >= delays.length) throw error;

      const delayMs = delays[index];
      onRetry({ attempt: index + 1, attempts: delays.length + 1, delayMs, error });
      await sleep(delayMs);
    }
  }
}

/** The real wait. Not unref'd: the process must stay alive through it. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
