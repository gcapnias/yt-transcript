import test from 'node:test';
import assert from 'node:assert/strict';

import { renderCatalog, scanTranscriptUrls } from '../src/catalog.js';

/** A transcript's frontmatter with the named keys left out. */
function transcript({ without = [], meeting = false } = {}) {
  const lines = meeting
    ? {
        title: 'title: "Weekly sync"',
        channel: 'channel: ""',
        upload_date: 'upload_date: 2026-09-15',
        fetched: 'fetched: 2026-09-16T14:03:05Z',
        subtitles: 'subtitles: auto',
        layout: 'layout: meeting',
      }
    : {
        title: 'title: "A Talk"',
        url: 'url: https://www.youtube.com/watch?v=o3CX_Y59_74',
        channel: 'channel: "freeCodeCamp.org"',
        duration: 'duration: "41:18"',
        upload_date: 'upload_date: 2026-09-10',
        fetched: 'fetched: 2026-09-16T14:03:05Z',
        subtitles: 'subtitles: auto',
      };
  const kept = Object.entries(lines)
    .filter(([key]) => !without.includes(key))
    .map(([, line]) => line);
  return ['---', ...kept, '---', '', 'Some words.', ''].join('\n');
}

const flagged = (files) => renderCatalog(files).warnings.map((warning) => warning.split(':')[0]);

test('a video transcript missing its url is still flagged incomplete', () => {
  const { warnings, count } = renderCatalog([
    { path: 'a-channel/a-talk.md', text: transcript({ without: ['url'] }) },
  ]);

  assert.equal(count, 0);
  assert.match(warnings[0], /a-channel\/a-talk\.md.*missing url.*re-download/i);
});

test('a video transcript missing its duration is still flagged incomplete', () => {
  const { warnings, count } = renderCatalog([
    { path: 'a-channel/a-talk.md', text: transcript({ without: ['duration'] }) },
  ]);

  assert.equal(count, 0);
  assert.match(warnings[0], /a-channel\/a-talk\.md.*missing duration.*re-download/i);
});

test('a meeting needs neither a url nor a duration, so one with no cues is listed', () => {
  const { warnings, count } = renderCatalog([
    { path: 'meetings/weekly-sync.md', text: transcript({ meeting: true }) },
  ]);

  assert.deepEqual(warnings, []);
  assert.equal(count, 1);
});

test('a meeting is still flagged when a key every transcript has is missing', () => {
  assert.deepEqual(
    flagged([{ path: 'meetings/weekly-sync.md', text: transcript({ meeting: true, without: ['channel'] }) }]),
    ['Skipped meetings/weekly-sync.md'],
  );
});

test('a transcript with no url outside the meetings folder is not a meeting', () => {
  assert.deepEqual(
    flagged([{ path: 'a-channel/weekly-sync.md', text: transcript({ meeting: true }) }]),
    ['Skipped a-channel/weekly-sync.md'],
  );
});

test('the batch skip set holds a video url and never a meeting', () => {
  assert.deepEqual(
    scanTranscriptUrls([
      { path: 'a-channel/a-talk.md', text: transcript() },
      { path: 'meetings/weekly-sync.md', text: transcript({ meeting: true }) },
    ]),
    ['https://www.youtube.com/watch?v=o3CX_Y59_74'],
  );
});
