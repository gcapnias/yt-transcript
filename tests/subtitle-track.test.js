import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyTrack, parseCues } from '../src/subtitle-track.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const AUTO = [
  '4JofSJIrjwU',
  'F3lL98Pj90o',
  'gaDdrDdczO4',
  'hfba9dAT6xE',
  'LoMOPj-lO8U',
  'M6mYodf0dJM',
  'n0VhIVtviC0',
  'o3CX_Y59_74',
];

const readFixture = (kind, id) => fs.readFileSync(path.join(fixtures, kind, `${id}.en.vtt`), 'utf8');

/**
 * The reason no pause-based paragraph rule can ever fire. YouTube's rolling
 * window makes auto cues contiguous by construction, so the gap between one
 * cue's end and the next one's start is exactly zero — not "small", zero.
 * Anyone reintroducing a timing heuristic should fail here first.
 */
test('inter-cue gaps are exactly 0 milliseconds across all eight auto tracks', () => {
  for (const id of AUTO) {
    const cues = parseCues(readFixture('auto', id));
    assert.ok(cues.length > 100, `too few cues parsed from ${id}: ${cues.length}`);

    for (let index = 1; index < cues.length; index += 1) {
      assert.equal(
        cues[index].startMs - cues[index - 1].endMs,
        0,
        `${id} cue ${index} does not begin where cue ${index - 1} ended`,
      );
    }
  }
});

test('manual tracks do carry inter-cue gaps, so the zero above is a property of auto tracks', () => {
  const cues = parseCues(readFixture('manual', 'iG9CE55wbtY'));
  const gaps = cues.slice(1).filter((cue, index) => cue.startMs !== cues[index].endMs);
  assert.ok(gaps.length > 0);
});

test('track kind is read from the body, from either auto signal', () => {
  assert.equal(classifyTrack('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhi<c> there</c>\n'), 'auto');
  assert.equal(
    classifyTrack('WEBVTT\n\n00:00:00.000 --> 00:00:01.000 align:start position:0%\nhi there\n'),
    'auto',
  );
  assert.equal(classifyTrack('WEBVTT\nKind: captions\n\n00:00:00.000 --> 00:00:01.000\nhi there\n'), 'manual');
});

test('the cue parser tolerates both line endings and both timestamp separators', () => {
  const crlf = 'WEBVTT\r\n\r\n1\r\n00:00:01,000 --> 00:00:02,500\r\nfirst line\r\nsecond line\r\n';
  assert.deepEqual(parseCues(crlf), [
    { startMs: 1000, endMs: 2500, lines: ['first line', 'second line'] },
  ]);
});

test('lines before the first cue never leak into the first cue', () => {
  const cues = parseCues('WEBVTT\nNOTE a stray header line\n\n00:00:00.000 --> 00:00:01.000\nreal text\n');
  assert.deepEqual(cues[0].lines, ['real text']);
});
