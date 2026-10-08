import test from 'node:test';
import assert from 'node:assert/strict';

import { rankInListing, reportedRank } from '../src/x-post.js';
import { parseListing, parseMetadata } from '../src/ytdlp.js';
import { readXListing, readXPrintLine } from './fixtures.js';

/**
 * Which of a post's videos was fetched. yt-dlp's ` #N` title suffix is right
 * on a whole-post fetch and wrong on a selector fetch of a multi-video post,
 * where it numbers every video `#1` (gcapnias/yt-transcript#7).
 */

const recorded = (name) => parseMetadata(readXPrintLine(name));
const CTV = 'ctv-1600649710662213632';

test('a whole-post fetch is ranked by the playlist index yt-dlp reported', () => {
  assert.equal(reportedRank(recorded(`${CTV}-post`)), 1);
  assert.equal(reportedRank(recorded('maiyang-2102344659276099794')), 1);
  assert.equal(reportedRank({ ...recorded(`${CTV}-post`), playlistIndex: 2 }), 2);
});

test('a t.co link is a whole-post fetch: X drops its /video/N on the way', () => {
  assert.equal(reportedRank(recorded(`${CTV}-tco`)), 1);
});

test('a fetch with no rank suffix is a single-video post, so its one video', () => {
  assert.equal(reportedRank(recorded('poteto-2102050467505430555')), 1);
  assert.equal(reportedRank(recorded('kw5hine-2106578219269005639')), 1);
});

test('a selector fetch of a multi-video post has no reported rank, whatever its suffix says', () => {
  // Both say `#1`; only the first is.
  assert.equal(reportedRank(recorded(`${CTV}-video1`)), null);
  assert.equal(reportedRank(recorded(`${CTV}-video2`)), null);
});

test('the listing ranks a fetched video by its media id', () => {
  const listing = parseListing(readXListing(CTV));

  assert.equal(rankInListing(recorded(`${CTV}-video1`).mediaId, listing), 1);
  assert.equal(rankInListing(recorded(`${CTV}-video2`).mediaId, listing), 2);
});

test('a media id the listing lacks has no rank, never a guessed first', () => {
  const listing = parseListing(readXListing(CTV));

  assert.equal(rankInListing('1600649511827099999', listing), null);
  assert.equal(rankInListing('', listing), null);
  assert.equal(rankInListing('1600649511827013632', []), null);
});
