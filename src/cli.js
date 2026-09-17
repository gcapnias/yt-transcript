import { fetchTranscript } from './fetch.js';
import { describeRetry } from './fetch-outcome.js';
import { parseTarget, TargetParseError } from './target.js';
import { preflight, FetchError, YtDlpMissingError } from './ytdlp.js';

const USAGE = `Usage: yt-transcript <url|id> [--lang <code>] [--playlist]

  <url|id>      a YouTube video URL, a bare video id, a youtu.be or /shorts
                link, a playlist URL, a channel URL, or a bare @handle
  --lang <code> subtitle language, matched exactly (default: en)
  --playlist    read a watch?v=...&list=... URL as the playlist, not the video`;

/**
 * Splits argv into a target and the settled flag set. Purely syntactic; an
 * unknown flag is a usage error rather than something passed on to `yt-dlp`.
 */
export function parseArgs(argv) {
  const options = { target: null, lang: 'en', playlist: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lang') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new UsageError('--lang needs a language code.');
      options.lang = value;
      index += 1;
    } else if (arg === '--playlist') {
      options.playlist = true;
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
 * @param {{ preflight?: Function, fetchTranscript?: Function }} [deps] injected
 *   so the exit codes can be tested against recorded process outcomes; the
 *   `yt-dlp` spawn itself stays outside the tested seams, by decision.
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, io = {}, deps = {}) {
  const out = io.out ?? ((line) => process.stdout.write(`${line}\n`));
  const err = io.err ?? ((line) => process.stderr.write(`${line}\n`));
  const checkYtDlp = deps.preflight ?? preflight;
  const fetchOne = deps.fetchTranscript ?? fetchTranscript;

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

  if (target.kind !== 'video') {
    err(`A ${target.kind} expands into a batch of fetches, which is not built yet: ${target.url}`);
    return 1;
  }

  try {
    await checkYtDlp();
  } catch (error) {
    if (!(error instanceof YtDlpMissingError)) throw error;
    err(error.message);
    return 1;
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

function report(out, transcript, file) {
  out(file);
  out(`  ${transcript.url}  (${transcript.trackKind} subtitle track)`);
}

