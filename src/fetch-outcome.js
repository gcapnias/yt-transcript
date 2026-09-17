/**
 * What a fetch outcome means, and what to do about it.
 *
 * Pure and spawn-free: every rule here is decided from a recorded process
 * outcome — an exit code and whether a track landed — which is what makes the
 * exit-code rules and the retry ladder testable without a live, rate-limited
 * third party. `ytdlp.js` applies them to a real invocation.
 */

/** The requested language has no subtitle track. Permanent. */
export const NO_SUBTITLES = 'no-subtitles';

/** A refusal that looks like HTTP 429. The one retried failure. */
export const RATE_LIMITED = 'rate-limited';

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
 * forbids reading the stderr text that would tell them apart, so "every other
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
