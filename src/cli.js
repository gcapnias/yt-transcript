import { describeBatch, runBatch } from './batch.js';
import { planBatch } from './batch-plan.js';
import { readExistingUrls, rebuildCatalog } from './catalog-store.js';
import { LAYOUTS } from './clean.js';
import { fetchTranscript } from './fetch.js';
import { describeRetry } from './fetch-outcome.js';
import { parseTarget, TargetParseError } from './target.js';
import { MeetingFileNotFoundError, transcribeMeeting, UnusableMeetingNameError } from './transcribe.js';
import { preflight, expandPlaylist, ExpansionError, FetchError, YtDlpMissingError } from './ytdlp.js';

const USAGE = `Usage: yt-transcript <url|id|file.vtt> [--lang <code>]
                     [--layout auto|prose|dialog|meeting] [--playlist] [--force]
       yt-transcript catalog

  <url|id>      a YouTube video URL, a bare video id, a youtu.be or /shorts
                link, a playlist URL, a channel URL, or a bare @handle; or
                an X post URL (x.com or twitter.com /<handle>/status/<id>,
                /i/status/<id>, or a t.co link), which fetches one video:
                its first, or the media item a trailing /video/N or
                /photo/N selects
  <file.vtt>    a meeting's local .vtt file, such as a Microsoft Teams
                transcript export, instead of a URL. It is transcribed with
                no download, into transcripts/meetings, as a meeting: turns
                named by speaker (— **Name:** text). A file that names no
                speakers is a dialog. --lang, --playlist and --force are
                ignored
  --lang <code> subtitle language (default: en). en accepts en, en-orig,
                en-US, en-GB or a named track (en-JkeT_87f4cc), preferring
                a manual track, then that order, named tracks last; any
                other code is matched exactly
  --layout <l>  auto|prose|dialog|meeting (default: auto). auto lays a track
                out as a dialog, one turn per speaker change, when it has 10
                or more turns, and as prose otherwise. prose and dialog force
                one; in a batch it applies to every video. meeting is for a
                .vtt file only, and is what auto picks for one that names
                speakers; prose drops the names
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
  const options = { target: null, lang: 'en', layout: 'auto', playlist: false, force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lang') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new UsageError('--lang needs a language code.');
      options.lang = value;
      index += 1;
    } else if (arg === '--layout') {
      const value = argv[index + 1];
      if (!LAYOUTS.includes(value)) {
        throw new UsageError(`--layout needs one of ${LAYOUTS.join(', ')}.`);
      }
      options.layout = value;
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
  const transcribe = deps.transcribeMeeting ?? transcribeMeeting;

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

  // A meeting is transcribed from the file and goes no further: no preflight,
  // no yt-dlp and no network (ADR-0010). `--lang`, `--playlist` and `--force`
  // mean nothing to it and are ignored.
  if (target.kind === 'file') {
    return meeting({ target, options, io: { out, err }, deps: { transcribe, rebuild } });
  }

  if (options.layout === 'meeting') {
    err('--layout meeting only applies to a meeting: give a .vtt file.');
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
  if (target.kind === 'playlist' || target.kind === 'channel') {
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
    //
    // An X post has no video id and its identity is only known after the fetch
    // (ADR-0004); it is fetched by the url it was typed as, and the video
    // number it chose.
    const { transcript, file, passedOver } = await fetchOne(
      {
        url: target.url,
        videoId: target.videoId,
        ...(target.kind === 'post' && { post: { videoNumber: target.videoNumber } }),
        lang: options.lang,
        layout: options.layout,
      },
      { onRetry: (retry) => err(describeRetry({ url: target.url, ...retry })) },
    );

    return await finishOne({ transcript, file, passedOver, io: { out, err }, rebuild });
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
 * The description fields are the ticket's own acceptance criterion — a path
 * and a url alone make the reader open the file to learn whether the right
 * video was fetched. Which fields, and in what order, is `renderTranscript`'s
 * `video` to say; naming them again here would be a second list to keep in
 * step with the first. A field the metadata did not carry is left out rather
 * than printed empty or as a placeholder.
 *
 * The line after the track kind names the manual and named tracks that lost
 * to the one used, so a person who wanted one can say which (ADR-0009). It is
 * absent when none did.
 *
 * The one renderer for single-video, meeting and batch fetches; a second copy
 * would drift.
 *
 * @param {import('./ytdlp.js').PassedOverTrack[]} [passedOver]
 */
function report(out, transcript, file, passedOver = []) {
  out(file);
  // A meeting has no url, so its line opens with the layout instead of one.
  const subject = transcript.isMeeting ? `${transcript.layout} layout` : transcript.url;
  out(`  ${subject}  (${transcript.trackKind} subtitle track)`);
  if (passedOver.length > 0) {
    const tracks = passedOver.map(({ kind, key }) => `${kind} ${key}`).join(', ');
    out(`  also on this video: ${tracks}; re-run with --lang <key> to use one`);
  }

  const fields = Object.entries(transcript.video ?? {}).filter(([, value]) => value);
  // Aligned on the longest label present, so the column is never a constant
  // that a renamed field silently outgrows.
  const width = Math.max(0, ...fields.map(([label]) => label.length));
  for (const [label, value] of fields) out(`  ${label.padEnd(width)}  ${value}`);
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
 * What follows a single written transcript, a video's or a meeting's: report
 * it, pass on its warnings, and rebuild the catalog.
 *
 * The rebuild is a full rescan rather than an appended row, so it runs after
 * the write and reflects the whole directory. A batch (ytdlp-xmu.6) calls
 * `rebuildCatalog` once at its end instead of once per video.
 *
 * @returns {Promise<number>} the process exit code
 */
async function finishOne({ transcript, file, passedOver, io: { out, err }, rebuild }) {
  report(out, transcript, file, passedOver);
  for (const warning of transcript.warnings ?? []) err(warning);

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
}

/**
 * The meeting command: read the `.vtt`, write the transcript, then the same
 * two required effects as a single fetch (see `finishOne`).
 *
 * @returns {Promise<number>} the process exit code
 */
async function meeting({ target, options, io, deps: { transcribe, rebuild } }) {
  let result;
  try {
    result = await transcribe({ path: target.path, layout: options.layout });
  } catch (error) {
    // Both are the user's to fix and both happen before anything is written,
    // so neither rebuilds the catalog.
    if (!(error instanceof MeetingFileNotFoundError || error instanceof UnusableMeetingNameError)) throw error;
    io.err(error.message);
    return 1;
  }

  return finishOne({ ...result, io, rebuild });
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
    layout: options.layout,
    sleep,
    // The block of each video that was written goes to stdout under its
    // progress line, so a long batch still says what each video was and where
    // it landed. Failures, warnings and retries stay on stderr, so `2>/dev/null`
    // leaves a clean record of what was written and `2>&1` interleaves the
    // failures in as they happen. A video's warnings follow its block.
    onFetched: ({ transcript, file, passedOver }) => report(out, transcript, file, passedOver),
    onWarning: (warning) => err(warning),
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

