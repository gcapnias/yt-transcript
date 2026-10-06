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

/** The five manual tracks, the only ones in the repository. */
export const MANUAL_IDS = ['8nHBGFKLHZQ', 'DxL2HoqLbyA', 'arj7oStGLkU', 'iG9CE55wbtY', 'rNxC16mlO60'];

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
  return fs.readFileSync(path.join(FIXTURES_DIR, kind, `${id}.en.vtt`), 'utf8');
}
