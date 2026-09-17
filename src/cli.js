import { describeBatch, runBatch } from './batch.js';
import { planBatch } from './batch-plan.js';
import { readExistingUrls, rebuildCatalog } from './catalog-store.js';
import { fetchTranscript } from './fetch.js';
import { describeRetry } from './fetch-outcome.js';
import { parseTarget, TargetParseError } from './target.js';
import { preflight, expandPlaylist, ExpansionError, FetchError, YtDlpMissingError } from './ytdlp.js';

const USAGE = `Usage: yt-transcript <url|id> [--lang <code>] [--playlist] [--force]
       yt-transcript catalog

  <url|id>      a YouTube video URL, a bare video id, a youtu.be or /shorts
                link, a playlist URL, a channel URL, or a bare @handle
  --lang <code> subtitle language, matched exactly (default: en)
  --playlist    read a watch?v=...&list=... URL as the playlist, not the video
  --force       in a batch, ignore the skip set and re-fetch everything. A
                single video is re-fetched either way.

  catalog       rebuild transcripts/README.md from what is on disk, fetching
                nothing. Takes no target and no flags.`;

/**
 * `catalog` is a subcommand, not a flag and not a second executable: it takes
 * no target and does something categorically different from fetching. It is
 * matched ahead of the flag parser rather than inside it, so the fetch
 * command's own argument shape is left exactly as it was.
 */
const CATALOG_COMMAND = 'catalog';

/**
 * Splits argv into a target and the settled flag set. Purely syntactic; an
 * unknown flag is a usage error rather than something passed on to `yt-dlp`.
 */
export function parseArgs(argv) {
  const options = { target: null, lang: 'en', playlist: false, force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lang') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new UsageError('--lang needs a language code.');
      options.lang = value;
      index += 1;
    } else if (arg === '--playlist') {
      options.playlist = true;
    } else if (arg === '--force') {
      // A no-op on a single video rather than an error: a single video URL
      // overwrites anyway, so `--force` asks for what already happens.
      options.force = true;
    } else if (arg.startsWith('-')) {
      throw new UsageError(`Unknown option: ${arg}`);
    } else if (options.target === null) {
      options.target = arg;
    } else {
      throw new UsageError('Only one target may be given.');
    }
  }

  if (options.target === null) throw new UsageError('A video URL or id is required.');
  return options;
}

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * The whole command. Returns an exit code rather than calling `process.exit`,
 * so the temporary directory's cleanup always runs before the process ends.
 *
 * @param {string[]} argv arguments after the executable and script
 * @param {{ out?: (line: string) => void, err?: (line: string) => void }} [io]
 * @param {{ preflight?: Function, fetchTranscript?: Function, rebuildCatalog?: Function,
 *           expandPlaylist?: Function, readExistingUrls?: Function,
 *           sleep?: (ms: number) => Promise<void> }} [deps] injected so the
 *   exit codes can be tested against recorded process outcomes; the `yt-dlp`
 *   spawn itself stays outside the tested seams, by decision. `sleep` is the
 *   batch's clock — real seconds in production, a recorded number in tests.
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, io = {}, deps = {}) {
  const out = io.out ?? ((line) => process.stdout.write(`${line}\n`));
  const err = io.err ?? ((line) => process.stderr.write(`${line}\n`));
  const checkYtDlp = deps.preflight ?? preflight;
  const fetchOne = deps.fetchTranscript ?? fetchTranscript;
  const rebuild = deps.rebuildCatalog ?? rebuildCatalog;
  const expand = deps.expandPlaylist ?? expandPlaylist;
  const readUrls = deps.readExistingUrls ?? readExistingUrls;

  if (argv[0] === CATALOG_COMMAND) {
    if (argv.length > 1) {
      err(`${CATALOG_COMMAND} takes no target and no flags.`);
      err('');
      err(USAGE);
      return 1;
    }

    // No preflight: a rebuild reads the disk and nothing else, so it must work
    // on a machine that has no `yt-dlp` at all.
    const { file, count, warnings } = await rebuild();
    for (const warning of warnings) err(warning);
    out(`${file}  (${count} transcripts)`);
    return 0;
  }

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(error.message);
    err('');
    err(USAGE);
    return 1;
  }

  let target;
  try {
    target = parseTarget(options.target, { playlist: options.playlist });
  } catch (error) {
    if (!(error instanceof TargetParseError)) throw error;
    err(error.message);
    return 1;
  }

  try {
    await checkYtDlp();
  } catch (error) {
    if (!(error instanceof YtDlpMissingError)) throw error;
    err(error.message);
    return 1;
  }

  // A playlist or channel is many fetches, and nothing else about a fetch
  // changes: the same per-video invocation runs inside the loop.
  if (target.kind !== 'video') {
    return batch({
      target,
      options,
      io: { out, err },
      deps: { expand, readUrls, fetchOne, rebuild, sleep: deps.sleep },
    });
  }

  try {
    // The temporary directory, the retry ladder and the write all live inside
    // fetchTranscript: the subtitle track is gone by the time this returns, on
    // this path and on the throwing one alike.
    const { transcript, file } = await fetchOne(
      { url: target.url, videoId: target.videoId, lang: options.lang },
      { onRetry: (retry) => err(describeRetry({ url: target.url, ...retry })) },
    );

    report(out, transcript, file);

    // The rebuild is a full rescan rather than an appended row, so it runs
    // after the write and reflects the whole directory. A batch (ytdlp-xmu.6)
    // calls `rebuildCatalog` once at its end instead of once per video.
    try {
      const { warnings } = await rebuild();
      for (const warning of warnings) err(warning);
    } catch (error) {
      // The spec does not cover a rebuild that fails on I/O, so this is a
      // reading rather than a rule: the rebuild is a *required* trigger, not a
      // nicety, and a command with two required effects that manages one has
      // not succeeded. Exit 1 covering several conditions distinguished only
      // by the message is already this tool's shape — rate-limited and
      // permanently unfetchable share it too.
      //
      // The transcript is written and already reported. Losing that fact in a
      // stack trace would be the worse failure, so name both and say what
      // fixes it.
      reportRebuildFailure(err, error, 'The transcript was written');
      return 1;
    }

    return 0;
  } catch (error) {
    // Rate-limited and permanently unfetchable share exit 1. There is no
    // second exit code: the two are the same observable, and inventing a code
    // for a distinction the tool cannot make would be a lie to a script.
    if (!(error instanceof FetchError)) throw error;
    err(error.message);
    return 1;
  }
}

/**
 * What one fetch tells the human: where the transcript landed, which video it
 * came from, and which video that *is*.
 *
 * The four description fields are the ticket's own acceptance criterion — a
 * path and a url alone make the reader open the file to learn whether the
 * right video was fetched. A field the metadata did not carry is left out
 * rather than printed empty or as a placeholder.
 *
 * Single-video only. A batch reports per-video progress and a roll-call
 * instead, and four lines per video would bury both.
 */
function report(out, transcript, file) {
  out(file);
  out(`  ${transcript.url}  (${transcript.trackKind} subtitle track)`);

  const video = transcript.video ?? {};
  for (const field of ['title', 'channel', 'duration', 'uploaded']) {
    if (video[field]) out(`  ${field.padEnd(8)}  ${video[field]}`);
  }
}

/**
 * What a failed rebuild says, on either path: the work that survived, then the
 * one command that finishes the job.
 *
 * Shared because only the subject differs between the single-video path and
 * the batch. Two copies of a settled sentence drift, and the half that drifts
 * is always the one nobody reads.
 *
 * @param {(line: string) => void} err
 * @param {Error} error
 * @param {string} written what is already on disk, as a sentence opening
 */
function reportRebuildFailure(err, error, written) {
  err(`${written}, but the catalog could not be rebuilt: ${error.message}`);
  err('Run `yt-transcript catalog` to rebuild it.');
}

/**
 * The batch command: expand, subtract, fetch each, rebuild once, report.
 *
 * A failed fetch sets the exit code; a rebuild *warning* about some other
 * malformed transcript is reported and costs nothing, exactly as on the
 * single-video path — a batch is not the place to fail over a neighbour. A
 * rebuild that throws does set it, following the single-video path again: the
 * rebuild is a required trigger, not a nicety.
 *
 * @returns {Promise<number>} the process exit code
 */
async function batch({ target, options, io: { out, err }, deps }) {
  const { expand, readUrls, fetchOne, rebuild, sleep } = deps;

  let expanded;
  try {
    expanded = await expand({ url: target.url });
  } catch (error) {
    if (!(error instanceof ExpansionError)) throw error;
    // See `ExpansionError` for why this one is hard. Nothing was fetched, so
    // there is nothing to rebuild either.
    err(error.message);
    return 1;
  }

  // The skip set is read only here — see `planBatch` for why skipping is
  // batch-only. Under `--force` the scan is not even paid for.
  const existing = options.force ? [] : await readUrls();
  const { toFetch, skipped } = planBatch(expanded, existing, options.force);

  out(`${target.url}`);
  out(`  ${expanded.length} videos, ${toFetch.length} to fetch, ${skipped.length} already on disk`);

  const { fetched, failures } = await runBatch(toFetch, {
    fetchOne,
    lang: options.lang,
    sleep,
    onProgress: ({ url, position, total }) => out(`[${position}/${total}] ${url}`),
    onRetry: (retry) => err(describeRetry(retry)),
    // In full, exactly as the single-video path reports it: the wording is
    // normative and a batch is not allowed to abbreviate it away.
    onFailure: ({ message }) => err(message),
  });

  // Once for the whole batch — see `runBatch` for why never once per video.
  // Unconditional, including a zero-video or all-skipped batch: "exactly
  // once" is only a testable claim if nothing can skip it.
  let rebuildError = null;
  try {
    const { warnings } = await rebuild();
    for (const warning of warnings) err(warning);
  } catch (error) {
    rebuildError = error;
  }

  const { summary, failureLines } = describeBatch({ fetched, skipped, failures });
  out(summary);
  for (const line of failureLines) err(line);

  if (rebuildError) {
    // Reported after the summary, never instead of it: what the batch fetched
    // is the more valuable fact, and a rebuild is recoverable by one command.
    reportRebuildFailure(err, rebuildError, 'The transcripts were written');
  }

  // Zero videos, and a batch where everything was skipped, are successes.
  return failures.length > 0 || rebuildError ? 1 : 0;
}

