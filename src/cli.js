import fs from 'node:fs/promises';

import { parseTarget, TargetParseError } from './target.js';
import { withTempDir } from './temp-dir.js';
import { renderTranscript } from './transcript.js';
import { writeTranscript } from './transcript-store.js';
import { fetchSubtitleTrack, preflight, FetchError, YtDlpMissingError } from './ytdlp.js';

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
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, io = {}) {
  const out = io.out ?? ((line) => process.stdout.write(`${line}\n`));
  const err = io.err ?? ((line) => process.stderr.write(`${line}\n`));

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
    await preflight();
  } catch (error) {
    if (!(error instanceof YtDlpMissingError)) throw error;
    err(error.message);
    return 1;
  }

  try {
    // Only the rendered transcript leaves the temporary directory: the
    // subtitle track is gone by the time this returns, on this path and on the
    // throwing one alike.
    const transcript = await withTempDir(async (destDir) => {
      const { metadata, trackPath } = await fetchSubtitleTrack({
        url: target.url,
        lang: options.lang,
        destDir,
      });

      return renderTranscript({
        trackText: await fs.readFile(trackPath, 'utf8'),
        url: target.url,
        videoId: target.videoId,
        metadata,
      });
    });

    const file = await writeTranscript(transcript);
    report(out, transcript, file);
    return 0;
  } catch (error) {
    if (!(error instanceof FetchError)) throw error;
    err(error.message);
    return 1;
  }
}

function report(out, transcript, file) {
  out(file);
  out(`  ${transcript.url}  (${transcript.subtitles} subtitles)`);
}

