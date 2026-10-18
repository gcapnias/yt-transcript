import test from 'node:test';
import assert from 'node:assert/strict';

import { readFrontmatter } from '../src/catalog.js';
import { renderMeetingTranscript } from '../src/transcript.js';
import { body } from './inline-track.js';
import { meetingTrack } from './meeting-track.js';

const TRANSCRIBED_AT = new Date('2026-09-16T14:03:05.123Z');
// No `Z`: noon local time, so the local date is the 15th in every time zone.
const MODIFIED_AT = new Date('2026-09-15T12:00:00');

function render(trackText, overrides = {}) {
  return renderMeetingTranscript({
    trackText,
    fileName: 'Weekly sync.vtt',
    modifiedAt: MODIFIED_AT,
    transcribedAt: TRANSCRIBED_AT,
    ...overrides,
  });
}

/**
 * The made-up meeting the exact-output test reads, in file order. Each line is
 * one of the shapes the ticket names:
 *
 *  - Ana's utterance 5 has another speaker's cue between its parts
 *  - utterance numbers run 5, 2, 7, 9, 4: backwards in file order
 *  - utterances 7 and 9 are back-to-back by Ana
 *  - Ben's "Great." is a one-word reply
 *  - utterance 4's second part starts with the word its first part ended on
 *  - Ben's turn ends on the word Ana's next turn starts with
 *  - the last cue has no voice tag and no id
 */
const CUES = [
  { id: '5-0', start: 1, end: 4, speaker: 'Ana Lopez', text: 'We shipped the parser last week and' },
  { id: '2-0', start: 3, end: 5, speaker: 'Ben Okafor', text: 'Great.' },
  { id: '5-1', start: 4, end: 7, speaker: 'Ana Lopez', text: 'it passed every check.' },
  { id: '7-0', start: 8, end: 10, speaker: 'Ana Lopez', text: 'Next is the report.' },
  { id: '9-0', start: 10, end: 12, speaker: 'Ana Lopez', text: 'It is due Friday.' },
  { id: '4-0', start: 13, end: 16, speaker: 'Ben Okafor', text: 'I can review the test' },
  { id: '4-1', start: 16, end: 19, speaker: 'Ben Okafor', text: 'test plan today' },
  { id: '12-0', start: 19, end: 21, speaker: 'Ana Lopez', text: 'today works for me.' },
  { start: 22, end: 25, text: 'Static on the line.' },
];

const EXPECTED_BODY = [
  '— **Ana Lopez:** We shipped the parser last week and it passed every check.',
  '— **Ben Okafor:** Great.',
  '— **Ana Lopez:** Next is the report. It is due Friday.',
  '— **Ben Okafor:** I can review the test test plan today',
  '— **Ana Lopez:** today works for me.',
  '— Static on the line.',
].join('\n\n');

test('a Teams track comes out as named turns, exactly', () => {
  const { contents } = render(meetingTrack(CUES));

  assert.equal(body(contents), `${EXPECTED_BODY}\n`);
});

test('the words in the cues are the words in the transcript, none dropped or doubled', () => {
  const { contents } = render(meetingTrack(CUES));

  const spoken = CUES.flatMap((cue) => cue.text.split(' ')).sort();
  const written = body(contents)
    .replace(/^— (\*\*[^*]+:\*\* )?/gm, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  assert.deepEqual(written, spoken);
});

test('the frontmatter names the file, not a video', () => {
  const { contents, filename, channelFolder, trackKind, layout, url } = render(meetingTrack(CUES));

  assert.equal(
    contents.split('\n---\n')[0],
    [
      '---',
      'title: "Weekly sync"',
      'channel: ""',
      'duration: "0:25"',
      'upload_date: 2026-09-15',
      'fetched: 2026-09-16T14:03:05Z',
      'subtitles: auto',
      'layout: meeting',
    ].join('\n'),
  );
  assert.equal(filename, 'weekly-sync.md');
  assert.equal(channelFolder, 'meetings');
  assert.equal(trackKind, 'auto');
  assert.equal(layout, 'meeting');
  assert.equal(url, undefined);
});

test('the catalog reads a meeting transcript back, and its title survives', () => {
  const { values } = readFrontmatter(render(meetingTrack(CUES)).contents);

  assert.equal(values.title, 'Weekly sync');
  assert.equal(values.layout, 'meeting');
  assert.equal('url' in values, false);
});

test('duration is the latest cue end, M:SS under an hour and H:MM:SS from one', () => {
  const at = (end) => meetingTrack([{ id: '1-0', start: 0, end, speaker: 'Ana Lopez', text: 'Hello.' }]);
  const durationOf = (end) => /^duration: "(.*)"$/m.exec(render(at(end)).contents)?.[1];

  assert.equal(durationOf(59), '0:59');
  assert.equal(durationOf(65), '1:05');
  assert.equal(durationOf(3599), '59:59');
  assert.equal(durationOf(3723), '1:02:03');
});

test('a track with the latest end in the middle still reports that end', () => {
  const track = meetingTrack([
    { id: '1-0', start: 0, end: 200, speaker: 'Ana Lopez', text: 'Long.' },
    { id: '2-0', start: 10, end: 20, speaker: 'Ben Okafor', text: 'Short.' },
  ]);
  assert.match(render(track).contents, /^duration: "3:20"$/m);
});

test('a file with no cues has no duration key', () => {
  const { contents } = render('WEBVTT\n\n');

  assert.doesNotMatch(contents, /^duration:/m);
  assert.match(contents, /^layout: dialog$/m);
});

test('a long turn breaks into paragraphs, and a semicolon ends a sentence in it', () => {
  const lead = Array.from({ length: 129 }, (_u, i) => `w${i}`).join(' ');
  const text = `${lead} ready; and then ${Array.from({ length: 5 }, (_u, i) => `x${i}`).join(' ')}.`;
  const { contents } = render(meetingTrack([{ id: '1-0', start: 0, end: 9, speaker: 'Ana Lopez', text }]));

  const paragraphs = body(contents).trimEnd().split('\n\n');
  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0], `— **Ana Lopez:** ${lead} ready;`);
  assert.equal(paragraphs[1], 'and then x0 x1 x2 x3 x4.');
});

test('layout prose drops the names and does not treat a semicolon as a sentence end', () => {
  const lead = Array.from({ length: 129 }, (_u, i) => `w${i}`).join(' ');
  const text = `${lead} ready; and then more`;
  const track = meetingTrack([
    { id: '1-0', start: 0, end: 9, speaker: 'Ana Lopez', text },
    { id: '2-0', start: 9, end: 12, speaker: 'Ben Okafor', text: 'Fine.' },
  ]);
  const { contents, layout } = render(track, { layout: 'prose' });

  assert.equal(layout, 'prose');
  assert.match(contents, /^layout: prose$/m);
  assert.equal(body(contents), `${text} Fine.\n`);
  assert.doesNotMatch(contents, /Ana|Ben|\*\*|^— /m);
});

test('a track that names no speakers is a dialog of unnamed turns, one per utterance', () => {
  const track = meetingTrack([
    { id: '1-0', start: 0, end: 2, text: 'First thing' },
    { id: '2-0', start: 2, end: 4, text: 'Second thing.' },
    { id: '1-1', start: 4, end: 6, text: 'goes on.' },
  ]);
  const { contents, layout, channelFolder } = render(track);

  assert.equal(layout, 'dialog');
  assert.match(contents, /^layout: dialog$/m);
  assert.equal(channelFolder, 'meetings');
  assert.equal(body(contents), '— First thing goes on.\n\n— Second thing.\n');
});

test('cues with no ids are an utterance each, and the same speaker still forms one turn', () => {
  const track = meetingTrack([
    { start: 0, end: 2, speaker: 'Ana Lopez', text: 'One.' },
    { start: 2, end: 4, speaker: 'Ana Lopez', text: 'Two.' },
    { start: 4, end: 6, speaker: 'Ben Okafor', text: 'Three.' },
  ]);

  assert.equal(
    body(render(track).contents),
    '— **Ana Lopez:** One. Two.\n\n— **Ben Okafor:** Three.\n',
  );
});

test('a name is verbatim; entities decode, a class on the tag is ignored, a tag may span lines', () => {
  const track = [
    'WEBVTT',
    '',
    `${'a'.repeat(8)}/1-0`,
    '00:00:00.000 --> 00:00:02.000',
    '<v.loud Zoë O&#39;Neil &amp; Co>Tom &amp; Jerry',
    'went home.</v>',
    '',
  ].join('\n');

  assert.equal(
    body(render(track).contents),
    "— **Zoë O'Neil & Co:** Tom & Jerry went home.\n",
  );
});

test('a repeated word is spoken twice, never a caption artifact', () => {
  const track = meetingTrack([
    { id: '1-0', start: 0, end: 2, speaker: 'Ana Lopez', text: 'no no no' },
    { id: '1-1', start: 2, end: 4, speaker: 'Ana Lopez', text: 'no way' },
  ]);

  assert.equal(body(render(track).contents), '— **Ana Lopez:** no no no no way\n');
});

test('the title falls back to a dated name when the file name has no Latin letters', () => {
  const { slug } = render(meetingTrack(CUES), { fileName: 'Συνάντηση.vtt' });

  assert.equal(slug, 'meeting-20260915');
});

// ------------------------------------------------------------ several voices in one cue

/** A cue written by hand, because the helper wraps its text in one voice tag. */
const rawCue = (id, start, end, text) => ({ id, start, end, text });

test('a cue with several voice tags credits each speaker, in tag order', () => {
  const track = meetingTrack([
    { id: '1-0', start: 0, end: 3, speaker: 'Ana Lopez', text: 'Welcome back.' },
    rawCue('2-0', 3, 6, '<v Ben Okafor>Sorry I am late.</v>\n<v Cleo Marsh>Hi, I just joined.</v>'),
    { id: '3-0', start: 6, end: 9, speaker: 'Cleo Marsh', text: 'Can you hear me?' },
  ]);

  assert.equal(
    body(render(track).contents),
    [
      '— **Ana Lopez:** Welcome back.',
      '— **Ben Okafor:** Sorry I am late.',
      '— **Cleo Marsh:** Hi, I just joined. Can you hear me?',
    ].join('\n\n') + '\n',
  );
});

test('voice tags side by side on one line, and a speaker returning, each make their own turn', () => {
  const track = meetingTrack([
    rawCue('1-0', 0, 3, '<v Ana Lopez>One.</v><v Ben Okafor>Two.</v><v Ana Lopez>Three.</v>'),
  ]);

  assert.equal(
    body(render(track).contents),
    '— **Ana Lopez:** One.\n\n— **Ben Okafor:** Two.\n\n— **Ana Lopez:** Three.\n',
  );
});

test('a multi-voice cue keeps every word, and a later part of its utterance still joins in', () => {
  const track = meetingTrack([
    rawCue('4-0', 0, 3, '<v Ana Lopez>We start and</v>\n<v Ben Okafor>me too</v>'),
    { id: '5-0', start: 3, end: 5, speaker: 'Cleo Marsh', text: 'Noted.' },
    { id: '4-1', start: 5, end: 7, speaker: 'Ben Okafor', text: 'then we go.' },
  ]);

  assert.equal(
    body(render(track).contents),
    [
      '— **Ana Lopez:** We start and',
      '— **Ben Okafor:** me too then we go.',
      '— **Cleo Marsh:** Noted.',
    ].join('\n\n') + '\n',
  );
});
