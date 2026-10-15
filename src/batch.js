/**
 * The batch loop: many fetches, never one large one.
 *
 * A playlist or channel expands into a list of videos, and each is fetched by
 * the ordinary per-video invocation. Two rules shape everything here:
 *
 * - **Failures continue, collect, report.** The loop runs to the end and hands
 *   back what failed; the caller decides the exit code. Stopping at the first
 *   failure would make one private video cost the other 199.
 * - **One catalog rebuild at the end**, which is the caller's job — a rebuild
 *   is a full rescan, so one per video would make a 200-video playlist
 *   quadratic.
 *
 * The retry ladder is **already inside `fetchTranscript`**. This loop must not
 * wrap it in a second one; it only forwards the ladder's progress outward.
 *
 * The clock is injected so the tested behaviour costs no real time. The delay
 * itself is real, and deliberately ours: every `yt-dlp` sleep flag acts inside
 * a single invocation, so none of them can space two invocations apart.
 */

import { parseTarget } from './target.js';

/** One second between fetches. No cap on batch size; this is the whole throttle. */
export const FETCH_DELAY_MS = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one fetch per url, in order.
 *
 * @param {string[]} urls canonical video urls, already stripped of what is on disk
 * @param {{ fetchOne: Function, lang?: string, layout?: 'auto'|'prose'|'dialog',
 *           sleep?: (ms: number) => Promise<void>, delayMs?: number,
 *           onProgress?: Function, onRetry?: Function, onFailure?: Function,
 *           onFetched?: (fetched: { url: string, transcript: object, file: string,
 *                                   passedOver?: object[] }) => void,
 *           onWarning?: (warning: string) => void }} deps `layout` is applied to
 *   every fetch alike, and when absent the cleaner's `auto` applies; `onFetched`
 *   gets each successful fetch's result, for the caller to report; `onWarning`
 *   gets what a fetch owes the human about it, straight after its `onFetched`.
 *   An `onFetched` or `onWarning` that throws never makes the fetch a failure:
 *   the transcript is already written.
 * @returns {Promise<{ fetched: Array<{ url: string, file: string }>,
 *                     failures: Array<{ url: string, failure: string|null, message: string }> }>}
 */
export async function runBatch(urls, deps) {
  const {
    fetchOne,
    lang = 'en',
    layout,
    sleep = wait,
    delayMs = FETCH_DELAY_MS,
    onProgress,
    onRetry,
    onFailure,
    onFetched,
    onWarning,
  } = deps;

  const fetched = [];
  const failures = [];

  for (const [index, url] of urls.entries()) {
    // Between fetches, not before the first: the delay exists to space two
    // invocations, and there is nothing to space the opening one from.
    if (index > 0) await sleep(delayMs);

    onProgress?.({ url, position: index + 1, total: urls.length });

    try {
      const { file, transcript, passedOver } = await fetchOne(
        { url, videoId: parseTarget(url).videoId, lang, layout },
        { onRetry: onRetry && ((retry) => onRetry({ url, ...retry })) },
      );
      fetched.push({ url, file });

      // The transcript is on disk and counted. Whatever reporting it does
      // from here is the caller's output failing, not the fetch failing, so
      // it is fenced off from the `catch` below that records failures.
      // Each step is fenced on its own, so a block that could not print does
      // not also swallow the warnings that follow it.
      const reporting = (step) => {
        try {
          step();
        } catch (reportError) {
          // Said on the warning stream and never rethrown: a thrown report
          // would discard every transcript the run had still to fetch.
          try {
            onWarning?.(`${file} was written, but reporting it failed: ${reportError.message}`);
          } catch {
            // The warning channel is the one that broke; there is nowhere left.
          }
        }
      };
      reporting(() => onFetched?.({ url, transcript, file, passedOver }));
      for (const warning of transcript?.warnings ?? []) reporting(() => onWarning?.(warning));
    } catch (error) {
      // `failure` is the classification a FetchError carries. Anything else
      // reaching here is still collected rather than thrown past the loop:
      // running to the end is the batch's contract, and an uncaught surprise
      // would discard every transcript the run had already reported.
      const entry = { url, failure: error.failure ?? null, message: error.message };
      failures.push(entry);

      // Reported in full as it happens, which is what lets the end-of-batch
      // summary be a terse roll-call. The failure messages are normative —
      // a rate-limited one must say a later run *may* succeed — so a batch
      // must not be the path on which that wording is lost.
      onFailure?.(entry);
    }
  }

  return { fetched, failures };
}

/**
 * Renders what the batch did. Pure, so the wording is tested without a run.
 *
 * @param {{ fetched: Array<object>, skipped: string[], failures: Array<object> }} result
 * @returns {{ summary: string, failureLines: string[] }} the summary belongs on
 *   stdout and the failure lines on stderr, so a batch can be piped.
 */
export function describeBatch({ fetched, skipped, failures }) {
  const summary =
    `${fetched.length} fetched, ${skipped.length} skipped, ${failures.length} failed.`;

  if (failures.length === 0) return { summary, failureLines: [] };

  return {
    summary,
    // A roll-call, not a repeat: each failure was already reported in full as
    // it happened. It still carries the classification, because on a long
    // batch that full report scrolls hundreds of progress lines above the
    // summary, and "which of these is worth re-running" is the question the
    // summary exists to answer.
    failureLines: [
      'Failed:',
      ...failures.map((entry) => `  ${entry.url}${entry.failure ? ` (${entry.failure})` : ''}`),
    ],
  };
}
