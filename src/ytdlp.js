import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { sanitizeChildEnv } from './child-env.js';
import { describeFailure } from './fetch-outcome.js';
import { YOUTUBE } from './site.js';
import { parseTarget, TargetParseError } from './target.js';

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
 * `failure` is the classification (`no-subtitles`, `rate-limited`, or one of
 * the X post kinds in `fetch-outcome.js`) and
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
 * The last five fields are printed for an X post only, and are empty strings
 * for a YouTube video.
 *
 * @returns {{ title: string, channel: string, duration: string, uploadDate: string,
 *             description: string, uploader: string, uploaderId: string,
 *             displayId: string, extractorKey: string }|null}
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
    // Printed for an X post only; empty on YouTube, which never asks for them.
    description: parsed.description ?? '',
    uploader: parsed.uploader ?? '',
    uploaderId: parsed.uploader_id ?? '',
    displayId: parsed.display_id ?? '',
    extractorKey: parsed.extractor_key ?? '',
  };
}

/**
 * Builds the one settled per-video invocation. Every flag is load-bearing; see
 * the spec's Fetching section before changing any of them.
 *
 * The `site` adds its own flags and names what is printed (see `site.js`).
 */
export function fetchArgs({ url, lang, destDir, site = YOUTUBE }) {
  return [
    '--js-runtimes',
    'node',
    '--skip-download',
    '--no-playlist',
    ...site.extraArgs,
    '--write-sub',
    '--write-auto-sub',
    '--sub-langs',
    lang,
    '--no-simulate',
    '--print',
    `%(.{${site.printFields}})j`,
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
export async function fetchSubtitleTrack({ url, lang = 'en', destDir, site = YOUTUBE, binary = YT_DLP }) {
  const { exitCode, stdout, stderr } = await run(binary, fetchArgs({ url, lang, destDir, site }));

  // One invocation, one verdict. The retry ladder lives a level up, in
  // `fetch.js`, so every retry is a fresh invocation into a fresh directory.
  const trackPath = await findSubtitleTrack(destDir);
  const metadata = parseMetadata(stdout);
  const failure = fetchFailure({
    exitCode,
    hasTrack: trackPath !== null,
    url,
    lang,
    site,
    stderr,
    extractorKey: metadata?.extractorKey,
  });
  if (failure) throw failure;

  return { metadata, trackPath };
}

/**
 * Turns one recorded process outcome into the error it means, or `null` when
 * the fetch succeeded. Separated from the spawn so the mapping from an exit
 * code to a retryable failure is testable without a live invocation.
 *
 * The whole outcome is handed to the `site`, which decides what of it to read:
 * an X post reads stderr and the reported extractor, a YouTube video neither.
 *
 * @param {{ exitCode: number, hasTrack: boolean, url: string, lang: string,
 *           site?: import('./site.js').Site, stderr?: string,
 *           extractorKey?: string }} outcome
 * @returns {FetchError|null}
 */
export function fetchFailure({ exitCode, hasTrack, url, lang, site = YOUTUBE, stderr, extractorKey }) {
  const outcome = site.classify({ exitCode, hasTrack, stderr, extractorKey });
  if (outcome.ok) return null;

  return new FetchError(describeFailure({ failure: outcome.failure, url, lang }), {
    url,
    exitCode,
    failure: outcome.failure,
    retryable: outcome.retryable,
  });
}

/**
 * Raised when a playlist or channel could not be read at all.
 *
 * **Expansion failure is a hard error**, unlike a failure inside the batch: a
 * batch that cannot learn what it contains has nothing to continue past.
 */
export class ExpansionError extends Error {
  constructor(url, exitCode, stderr) {
    const detail = String(stderr ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);

    super(
      `Could not read the playlist or channel: ${url}` +
        (detail ? `\n  yt-dlp said: ${detail}` : '') +
        `\n  yt-dlp exited ${exitCode}. Check the URL is right and public, then try again.`,
    );
    this.name = 'ExpansionError';
    this.url = url;
    this.exitCode = exitCode;
  }
}

/**
 * Builds the expansion invocation — the **only** one that reads a playlist.
 *
 * `--flat-playlist` is what keeps it to the two HTTP requests a listing costs
 * rather than one per member, and `--simulate` is what stops it downloading
 * anything. `%(id)s` is printed rather than a URL: the id is the stable part,
 * and `parseTarget` normalises it to the settled canonical form.
 *
 * `--js-runtimes node` is deliberately absent. Its rationale is subtitle
 * extraction; a flat listing does not run player JavaScript.
 */
export function expandArgs({ url }) {
  return ['--flat-playlist', '--simulate', '--print', '%(id)s', url];
}

/**
 * Turns the expansion's stdout into canonical video urls.
 *
 * Normalisation goes through `parseTarget`, the one place that knows the
 * settled url form. A line it cannot read is dropped rather than fatal: a
 * channel listing can carry a row that is not a playable video, and losing the
 * whole batch over one is worse than fetching the rest.
 *
 * @param {string} stdout
 * @returns {string[]}
 */
export function parseExpansion(stdout) {
  const urls = [];
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate) continue;

    let target;
    try {
      target = parseTarget(candidate);
    } catch (error) {
      if (!(error instanceof TargetParseError)) throw error;
      continue;
    }
    if (target.kind === 'video') urls.push(target.url);
  }
  return urls;
}

/**
 * Expands a playlist or channel url into the videos it contains.
 *
 * One invocation for the whole listing; each video is then fetched by the
 * ordinary per-video invocation above, `--no-playlist` and all.
 *
 * @returns {Promise<string[]>} canonical video urls, in listing order
 * @throws {ExpansionError}
 */
export async function expandPlaylist({ url, binary = YT_DLP }) {
  const { exitCode, stdout, stderr } = await run(binary, expandArgs({ url }));
  if (exitCode !== 0) throw new ExpansionError(url, exitCode, stderr);

  // Exit 0 with no lines is an empty playlist, which is a success with zero
  // videos rather than a failure to expand.
  return parseExpansion(stdout);
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
