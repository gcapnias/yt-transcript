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

// X posts. The canonical url is not knowable here: it is settled after the
// fetch, from what yt-dlp reports (ADR-0004). So the target carries the url to
// *fetch* and the number of the video wanted, and nothing else.

const POST = '2102050467505430555';

test('every x post input form is a post, fetched as video 1', () => {
  const forms = [
    `https://x.com/poteto/status/${POST}`,
    `https://twitter.com/poteto/status/${POST}`,
    `https://www.x.com/poteto/status/${POST}`,
    `https://mobile.x.com/POTETO/status/${POST}?s=20`,
    `https://m.twitter.com/poteto/status/${POST}#top`,
    `x.com/poteto/status/${POST}`,
    `https://x.com/poteto/status/${POST}/video/1`,
    `https://x.com/poteto/status/${POST}/photo/1`,
  ];

  for (const form of forms) {
    const target = parseTarget(form);
    assert.equal(target.kind, 'post', `not a post: ${form}`);
    assert.equal(target.videoNumber, 1, `not video 1: ${form}`);
    assert.equal(target.videoId, null, `a post has no video id: ${form}`);
  }
});

test('a post url without a handle is still a post, fetched as typed', () => {
  for (const form of [`https://x.com/i/status/${POST}`, `https://x.com/i/web/status/${POST}`]) {
    const target = parseTarget(form);
    assert.equal(target.kind, 'post');
    assert.equal(target.url, form);
  }
});

test('a t.co short link is a post, fetched as video 1', () => {
  assert.deepEqual(parseTarget('https://t.co/NgrGz7tmPM'), {
    kind: 'post',
    url: 'https://t.co/NgrGz7tmPM',
    videoId: null,
    videoNumber: 1,
  });
});

test('/video/N and /photo/N both select the Nth video, and the url keeps the choice', () => {
  for (const kind of ['video', 'photo']) {
    assert.deepEqual(parseTarget(`https://twitter.com/CTVJLaidlaw/status/160/${kind}/2`), {
      kind: 'post',
      url: 'https://twitter.com/CTVJLaidlaw/status/160/video/2',
      videoId: null,
      videoNumber: 2,
    });
  }
});

test('a post url fetched bare, as video 1 or as photo 1 is the same target', () => {
  const bare = parseTarget(`https://x.com/poteto/status/${POST}`);
  assert.deepEqual(parseTarget(`https://x.com/poteto/status/${POST}/video/1`), bare);
  assert.deepEqual(parseTarget(`https://x.com/poteto/status/${POST}/photo/1`), bare);
  assert.equal(bare.url, `https://x.com/poteto/status/${POST}`);
});

test('a query string or fragment never reaches the fetched url', () => {
  assert.equal(
    parseTarget(`https://mobile.x.com/POTETO/status/${POST}?s=20#top`).url,
    `https://x.com/POTETO/status/${POST}`,
  );
});

test('parsing the fetched url of a post again yields the same target', () => {
  for (const input of [`mobile.x.com/POTETO/status/${POST}?s=20`, `x.com/a/status/${POST}/photo/3`]) {
    const once = parseTarget(input);
    assert.deepEqual(parseTarget(once.url), once, `not idempotent: ${input}`);
  }
});

test('x broadcasts and spaces are refused with their own reason', () => {
  for (const form of [
    'https://x.com/i/broadcasts/1pKdRDvrQqQJW',
    'https://x.com/i/events/1234567890',
    'https://x.com/i/spaces/1DXGydznBYWKM',
  ]) {
    assert.throws(
      () => parseTarget(form),
      (error) => error instanceof TargetParseError && /no subtitles/.test(error.message),
      `not refused for its own reason: ${form}`,
    );
  }
});

test('x urls with no extractor stay unsupported, and the error mentions X', () => {
  const rejected = [
    'https://x.com/poteto',
    'https://x.com/poteto/likes',
    'https://x.com/search?q=yt-dlp',
    'https://x.com/i/lists/123',
    'https://x.com/poteto/status/abc',
    'https://x.com/poteto/status/160/video/0',
    POST,
  ];

  for (const input of rejected) {
    assert.throws(
      () => parseTarget(input),
      (error) => error instanceof TargetParseError && /X post/.test(error.message),
      `should have been rejected as unsupported: ${input}`,
    );
  }
});
