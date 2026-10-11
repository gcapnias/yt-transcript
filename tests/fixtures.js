/**
 * The real subtitle tracks every cleaning test reads. Not a test file — the
 * `npm test` glob only picks up `*.test.js`.
 *
 * These are the entire evidence base for the cleaning rules, and their line
 * endings are part of that evidence: the auto tracks are CRLF, the manual ones
 * LF, byte-identical to what `yt-dlp` wrote and pinned by `.gitattributes`.
 * Nothing here may normalise them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** The eight auto tracks — also the spec's acceptance set of video ids. */
export const AUTO_IDS = [
  '4JofSJIrjwU',
  'F3lL98Pj90o',
  'gaDdrDdczO4',
  'hfba9dAT6xE',
  'LoMOPj-lO8U',
  'M6mYodf0dJM',
  'n0VhIVtviC0',
  'o3CX_Y59_74',
];

/**
 * The one `en-orig` track (ADR-0006, #12): the untranslated recognition of a
 * dubbed video whose stacked `en` is refused with a 429. Recorded from `yt-dlp`
 * 2026.08.19 with `--sub-langs en-orig`, trimmed to its first cues. Kept out of
 * `AUTO_IDS`, which is the cleaning rules' acceptance set.
 */
export const AUTO_ORIG_ID = 'MN9dGgmLyso';

/** The six manual tracks, the only ones in the repository. */
export const MANUAL_IDS = [
  '8nHBGFKLHZQ',
  'DxL2HoqLbyA',
  'arj7oStGLkU',
  'iG9CE55wbtY',
  'rNxC16mlO60',
  'QIHnmqYU614',
];

/**
 * A track's language where it is not plain `en`. `QIHnmqYU614` has no manual
 * `en` track, only `en-US` (ADR-0006); it was recorded from `yt-dlp`
 * 2026.08.19 with `--lang en-US`.
 */
const TRACK_LANGUAGES = { QIHnmqYU614: 'en-US', MN9dGgmLyso: 'en-orig' };

/**
 * What `yt-dlp` 2026.08.19 wrote to stderr on `QIHnmqYU614`, asked for
 * `en,en-US,en-GB` with `--ignore-errors`: the translated `en` was refused,
 * and the run exited 0 (ADR-0006).
 */
export const SUBTITLE_429_WARNING =
  "WARNING: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests\n";

/**
 * The two named tracks of `ilmBGeGldrI`, a live recording (ADR-0009, #14), in
 * `named/`. Recorded 2026-10-11 from `yt-dlp` 2026.08.19 with
 * `yt-dlp --js-runtimes node --skip-download --write-sub --sub-langs
 * en-JkeT_87f4cc,en-uYU-mmqFLq8 --sub-format vtt -o '%(id)s'
 * https://www.youtube.com/watch?v=ilmBGeGldrI`, then trimmed (the files are
 * otherwise byte-for-byte what it wrote, LF line endings):
 *
 * - `DTVCC1` ("English - DTVCC1", key `en-JkeT_87f4cc`): the header and the
 *   first 478 lines, which are cues from 00:19:35.849 to 00:24:56.599. It holds
 *   a `>>>` and a `>>` speaker marker and one `[ Applause ]` event.
 * - `CC1` ("English - CC1", key `en-uYU-mmqFLq8`): the header and the first 60
 *   lines, which are cues from 00:19:35.774 to 00:19:53.091. It opens with a
 *   `>>>` speaker marker.
 */
export const NAMED_VIDEO_ID = 'ilmBGeGldrI';

/** The file name `yt-dlp` gave a recorded named track, from its key. */
export function namedFixtureName(key) {
  return `${NAMED_VIDEO_ID}.${key}.vtt`;
}

/** @param {string} key `en-JkeT_87f4cc` (DTVCC1) or `en-uYU-mmqFLq8` (CC1) */
export function readNamedFixture(key) {
  return fs.readFileSync(path.join(FIXTURES_DIR, 'named', namedFixtureName(key)), 'utf8');
}

/**
 * The file name `yt-dlp` gave a recorded track: `<id>.<lang>.vtt`.
 *
 * @param {string} id a video id
 */
export function fixtureName(id) {
  return `${id}.${TRACK_LANGUAGES[id] ?? 'en'}.vtt`;
}

/**
 * X posts, recorded from `yt-dlp` 2026.08.19: `x/<name>.json` is the line its
 * `--print` emitted for a post, `x/<name>-listing.jsonl` what the list-only
 * invocation printed for one, and `x/<media id>.en.vtt` is a track trimmed to
 * its first cues (the X cue markup is the evidence, not the length).
 *
 * The CTV post (two videos, no photos) is recorded fetched four ways: `-post`
 * bare, `-video1` and `-video2` through `/video/N`, and `-tco` through the
 * `t.co` link in its text, which resolves to `/video/1` and is then redirected
 * by X to the bare post.
 */
export const X_TRACK_ID = '2101938030122868736';

/**
 * The recorded post as `yt-dlp` printed it: one JSON line, the shape
 * `parseMetadata` reads. The files are stored indented to be readable.
 *
 * @param {string} name a recorded post, without extension
 */
export function readXPrintLine(name) {
  const recorded = fs.readFileSync(path.join(FIXTURES_DIR, 'x', `${name}.json`), 'utf8');
  return `${JSON.stringify(JSON.parse(recorded))}\n`;
}

/**
 * A recorded listing of a post's videos: the lines the list-only invocation
 * printed, one JSON object per video, stored exactly as emitted.
 *
 * @param {string} name a recorded post, without the `-listing.jsonl` suffix
 */
export function readXListing(name) {
  return fs.readFileSync(path.join(FIXTURES_DIR, 'x', `${name}-listing.jsonl`), 'utf8');
}

/** The trimmed X track exactly as downloaded. */
export function readXTrack() {
  return fs.readFileSync(path.join(FIXTURES_DIR, 'x', `${X_TRACK_ID}.en.vtt`), 'utf8');
}

/**
 * @param {'auto'|'manual'} kind
 * @param {string} id a video id
 * @returns {string} the subtitle track exactly as downloaded
 */
export function readFixture(kind, id) {
  return fs.readFileSync(path.join(FIXTURES_DIR, kind, fixtureName(id)), 'utf8');
}
