import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { sanitizeChildEnv } from './child-env.js';
import { classifyFetch, describeFailure } from './fetch-outcome.js';

/** The binary name looked up on PATH. Overridable so tests need not uninstall it. */
export const YT_DLP = 'yt-dlp';

export class YtDlpMissingError extends Error {
  constructor(binary) {
    super(
      `${binary} was not found on PATH as an executable, and yt-transcript needs ` +
        'it to download subtitle tracks.\n' +
        '\nInstall it, then run yt-transcript again:\n' +
        '  winget install yt-dlp.yt-dlp     (Windows)\n' +
        '  brew install yt-dlp              (macOS)\n' +
        '  pipx install yt-dlp              (any platform with Python)\n' +
        '\nOn Windows, install one that puts yt-dlp.exe on PATH: a .cmd or .bat\n' +
        'wrapper cannot be launched directly, and looks the same as absent here.\n' +
        '\nOther options: https://github.com/yt-dlp/yt-dlp#installation',
    );
    this.name = 'YtDlpMissingError';
  }
}

/**
 * A fetch that produced no usable subtitle track.
 *
 * `failure` is the classification (`no-subtitles` or `rate-limited`) and
 * `retryable` is what the retry ladder reads; a batch reports on `failure`.
 */
export class FetchError extends Error {
  constructor(message, { url, exitCode, failure, retryable = false }) {
    super(message);
    this.name = 'FetchError';
    this.url = url;
    this.exitCode = exitCode;
    this.failure = failure;
    this.retryable = retryable;
  }
}

/**
 * Spawns `yt-dlp` and collects its output.
 *
 * `shell: false` throughout: the `--print` template must reach `yt-dlp`
 * byte-for-byte, and a shell layer mangles `%(...)` and `{}`.
 */
function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: sanitizeChildEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      reject(error.code === 'ENOENT' ? new YtDlpMissingError(binary) : error);
    });
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

/**
 * Confirms `yt-dlp` is on PATH and executable, so a missing prerequisite is a
 * clear message rather than a stack trace at first use.
 *
 * @throws {YtDlpMissingError}
 * @returns {Promise<string>} the reported version
 */
export async function preflight({ binary = YT_DLP } = {}) {
  const { exitCode, stdout } = await run(binary, ['--version']);
  if (exitCode !== 0) throw new YtDlpMissingError(binary);
  return stdout.trim();
}

/**
 * Reads the single JSON line `--print` emits on stdout.
 *
 * `duration_string` already arrives in the wanted `M:SS` shape, so no duration
 * arithmetic is written anywhere. Values are carried through exactly as
 * `yt-dlp` reported them; reformatting is the transcript's business.
 *
 * @param {string} stdout
 * @returns {{ title: string, channel: string, duration: string, uploadDate: string }|null}
 */
export function parseMetadata(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .findLast((candidate) => candidate.startsWith('{'));
  if (!line) return null;

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  return {
    title: parsed.title ?? '',
    channel: parsed.channel ?? '',
    duration: parsed.duration_string ?? '',
    uploadDate: parsed.upload_date ?? '',
  };
}

/**
 * Builds the one settled per-video invocation. Every flag is load-bearing; see
 * the spec's Fetching section before changing any of them.
 */
export function fetchArgs({ url, lang, destDir }) {
  return [
    '--js-runtimes',
    'node',
    '--skip-download',
    '--no-playlist',
    '--write-sub',
    '--write-auto-sub',
    '--sub-langs',
    lang,
    '--no-simulate',
    '--print',
    '%(.{title,channel,duration_string,upload_date})j',
    '-P',
    destDir,
    '-o',
    '%(id)s',
    url,
  ];
}

/**
 * One blind invocation per video: downloads the subtitle track into `destDir`
 * and emits the metadata on stdout. No pre-flight query, no second round-trip,
 * and no `.info.json` is ever written.
 *
 * @returns {Promise<{ metadata: object, trackPath: string }>}
 */
export async function fetchSubtitleTrack({ url, lang = 'en', destDir, binary = YT_DLP }) {
  const { exitCode, stdout } = await run(binary, fetchArgs({ url, lang, destDir }));

  // One invocation, one verdict. The retry ladder lives a level up, in
  // `fetch.js`, so every retry is a fresh invocation into a fresh directory.
  const trackPath = await findSubtitleTrack(destDir);
  const failure = fetchFailure({ exitCode, hasTrack: trackPath !== null, url, lang });
  if (failure) throw failure;

  return { metadata: parseMetadata(stdout), trackPath };
}

/**
 * Turns one recorded process outcome into the error it means, or `null` when
 * the fetch succeeded. Separated from the spawn so the mapping from an exit
 * code to a retryable failure is testable without a live invocation.
 *
 * @param {{ exitCode: number, hasTrack: boolean, url: string, lang: string }} outcome
 * @returns {FetchError|null}
 */
export function fetchFailure({ exitCode, hasTrack, url, lang }) {
  const outcome = classifyFetch({ exitCode, hasTrack });
  if (outcome.ok) return null;

  return new FetchError(describeFailure({ failure: outcome.failure, url, lang }), {
    url,
    exitCode,
    failure: outcome.failure,
    retryable: outcome.retryable,
  });
}

/**
 * Success requires a subtitle file that is actually there and not empty.
 *
 * `--skip-download` means nothing else can land in the directory, so any
 * non-empty file is the track. Extension is a preference, not a filter: no
 * `--sub-format` is passed, so treating a non-vtt track as "no subtitles"
 * would report the wrong failure.
 */
export async function findSubtitleTrack(destDir) {
  const entries = await fs.readdir(destDir, { withFileTypes: true });

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const trackPath = path.join(destDir, entry.name);
    const { size } = await fs.stat(trackPath);
    if (size > 0) candidates.push(trackPath);
  }

  return candidates.find((file) => file.toLowerCase().endsWith('.vtt')) ?? candidates[0] ?? null;
}
