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
 * @param {'auto'|'manual'} kind
 * @param {string} id a video id
 * @returns {string} the subtitle track exactly as downloaded
 */
export function readFixture(kind, id) {
  return fs.readFileSync(path.join(FIXTURES_DIR, kind, `${id}.en.vtt`), 'utf8');
}
