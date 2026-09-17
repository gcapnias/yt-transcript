/**
 * The failures a recorded `yt-dlp` outcome produces, built once for every test
 * that needs one. Not a test file — the `npm test` glob only picks up
 * `*.test.js`.
 *
 * Four suites were each re-deriving `exitCode` and `retryable` from a failure
 * kind by hand, which is production's rule (`classifyFetch`) copied into the
 * tests four times and free to drift from it.
 *
 * One thing is stated here and one is asked for. The exit code is stated,
 * because it is the measured process fact a test is replaying: no captions
 * exits 0, an HTTP 429 exits 1. Whether that outcome is worth retrying is
 * asked of `classifyFetch`, so no test can hold an opinion about the ladder
 * that production does not share.
 */

import { classifyFetch, describeFailure, NO_SUBTITLES } from '../src/fetch-outcome.js';
import { FetchError } from '../src/ytdlp.js';

/**
 * @param {{ failure: string, url: string, lang?: string, message?: string }} outcome
 * @returns {FetchError} exactly what a fetch of that video would have thrown
 */
export function recordedFailure({ failure, url, lang = 'en', message }) {
  const exitCode = failure === NO_SUBTITLES ? 0 : 1;
  const { retryable } = classifyFetch({ exitCode, hasTrack: false });

  return new FetchError(message ?? describeFailure({ failure, url, lang }), {
    url,
    exitCode,
    failure,
    retryable,
  });
}
