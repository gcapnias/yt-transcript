import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTarget, TargetParseError } from '../src/target.js';

const CANONICAL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';

test('every accepted video input form resolves to the same canonical url', () => {
  const forms = [
    'o3CX_Y59_74',
    'https://www.youtube.com/watch?v=o3CX_Y59_74',
    'https://youtu.be/o3CX_Y59_74',
    'https://www.youtube.com/shorts/o3CX_Y59_74',
    'https://youtu.be/o3CX_Y59_74?si=k3Kd0Q7lQ2wZ&t=142',
  ];

  for (const form of forms) {
    assert.deepEqual(
      parseTarget(form),
      { kind: 'video', url: CANONICAL, videoId: 'o3CX_Y59_74' },
      `input form did not normalise: ${form}`,
    );
  }
});

test('a url naming both a video and a playlist means the video', () => {
  assert.deepEqual(
    parseTarget('https://www.youtube.com/watch?v=o3CX_Y59_74&list=PLWKjhJtqVAbk'),
    { kind: 'video', url: CANONICAL, videoId: 'o3CX_Y59_74' },
  );
});

test('the playlist option forces the batch reading of that same url', () => {
  assert.deepEqual(
    parseTarget('https://www.youtube.com/watch?v=o3CX_Y59_74&list=PLWKjhJtqVAbk', {
      playlist: true,
    }),
    {
      kind: 'playlist',
      url: 'https://www.youtube.com/playlist?list=PLWKjhJtqVAbk',
      videoId: null,
    },
  );
});

test('a playlist url expands without needing the playlist option', () => {
  assert.deepEqual(parseTarget('https://www.youtube.com/playlist?list=PLWKjhJtqVAbk'), {
    kind: 'playlist',
    url: 'https://www.youtube.com/playlist?list=PLWKjhJtqVAbk',
    videoId: null,
  });
});

test('a bare handle is rewritten to the channel videos tab', () => {
  // Left alone, yt-dlp expands a handle to Videos plus Shorts plus Live.
  const expected = {
    kind: 'channel',
    url: 'https://www.youtube.com/@freecodecamp/videos',
    videoId: null,
  };

  assert.deepEqual(parseTarget('@freecodecamp'), expected);
  assert.deepEqual(parseTarget('https://www.youtube.com/@freecodecamp'), expected);
  assert.deepEqual(parseTarget('https://www.youtube.com/@freecodecamp/videos'), expected);
});

test('a tab the user typed is the tab that is fetched', () => {
  // Only a *bare* handle or channel is rewritten to Videos. Rewriting a tab
  // someone asked for by name fetches something other than what they typed.
  for (const tab of ['shorts', 'streams', 'live', 'playlists']) {
    assert.deepEqual(parseTarget(`https://www.youtube.com/@freecodecamp/${tab}`), {
      kind: 'channel',
      url: `https://www.youtube.com/@freecodecamp/${tab}`,
      videoId: null,
    });
  }

  assert.deepEqual(parseTarget('https://www.youtube.com/channel/UC8butISFwT-Wl7EV0hUK0BQ/streams'), {
    kind: 'channel',
    url: 'https://www.youtube.com/channel/UC8butISFwT-Wl7EV0hUK0BQ/streams',
    videoId: null,
  });
});

test('a channel id url resolves to that channel videos tab', () => {
  assert.deepEqual(parseTarget('https://www.youtube.com/channel/UC8butISFwT-Wl7EV0hUK0BQ'), {
    kind: 'channel',
    url: 'https://www.youtube.com/channel/UC8butISFwT-Wl7EV0hUK0BQ/videos',
    videoId: null,
  });
});

test('parsing a canonical url again yields the same target', () => {
  const inputs = [
    'o3CX_Y59_74',
    'youtu.be/o3CX_Y59_74?si=abc',
    'https://www.youtube.com/playlist?list=PLWKjhJtqVAbk',
    '@freecodecamp',
    'https://www.youtube.com/channel/UC8butISFwT-Wl7EV0hUK0BQ',
  ];

  for (const input of inputs) {
    const once = parseTarget(input);
    assert.deepEqual(parseTarget(once.url), once, `not idempotent: ${input}`);
  }
});

test('input naming nothing fetchable raises TargetParseError', () => {
  const rejected = [
    '',
    '   ',
    'not a url at all',
    'https://vimeo.com/123456',
    'https://www.youtube.com/watch?v=tooshort',
    'https://www.youtube.com/',
  ];

  for (const input of rejected) {
    assert.throws(
      () => parseTarget(input),
      TargetParseError,
      `should have been rejected: ${JSON.stringify(input)}`,
    );
  }
});
