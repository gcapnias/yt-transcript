import test from 'node:test';
import assert from 'node:assert/strict';

import { renderCatalog } from '../src/catalog.js';
import { xPost } from '../src/site.js';
import { renderTranscript } from '../src/transcript.js';
import { videoSuffix } from '../src/x-post.js';
import { parseMetadata } from '../src/ytdlp.js';
import { readXPrintLine, readXTrack } from './fixtures.js';

/**
 * X posts through the same seam as YouTube: (track, metadata) -> transcript.
 * The metadata is what yt-dlp really printed for each post, recorded; only the
 * empty-text post is built by hand, since none could be found live.
 */

const FETCHED_AT = new Date('2026-10-05T12:00:00.000Z');

const recorded = (name) => parseMetadata(readXPrintLine(name));

function render(metadata, { trackText = readXTrack() } = {}) {
  return renderTranscript({
    trackText,
    // What a post target carries: the url fetched, which is never the identity.
    url: 'https://mobile.x.com/POTETO/status/2102050467505430555?s=20',
    videoId: null,
    site: xPost(),
    metadata,
    fetchedAt: FETCHED_AT,
  });
}

/** The frontmatter as `key: value` lines, quotes left on. */
function frontmatter(transcript) {
  const block = transcript.contents.split('\n---\n')[0];
  return Object.fromEntries(
    block
      .split('\n')
      .slice(1)
      .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]),
  );
}

test('a post transcript has the seven keys, built from what yt-dlp reported', () => {
  const transcript = render(recorded('poteto-2102050467505430555'));
  const fields = frontmatter(transcript);

  assert.deepEqual(Object.keys(fields), [
    'title',
    'url',
    'channel',
    'duration',
    'upload_date',
    'fetched',
    'subtitles',
  ]);
  assert.equal(fields.url, 'https://x.com/poteto/status/2102050467505430555');
  assert.equal(fields.channel, '"lauren (@poteto)"');
  assert.equal(fields.duration, '"38:01"');
  assert.equal(fields.upload_date, '2026-09-21');
  assert.equal(fields.subtitles, 'auto');
  assert.equal(transcript.url, fields.url);
});

test('the title is the post text: links gone, whitespace collapsed, nothing cut', () => {
  const { title } = render(recorded('poteto-2102050467505430555')).video;

  assert.ok(title.startsWith("here's how i shipped 2,500 PRs last month to production"));
  assert.ok(title.endsWith("i talk slowly"), 'the link was not removed from the end');
  assert.doesNotMatch(title, /t\.co|https?:/);
  // yt-dlp's own title is `<name> - <text>` cut at 72 characters with `...`.
  assert.ok(!title.startsWith('lauren - '));
  assert.ok(!title.endsWith('...'));
  assert.ok(title.length > 72);
  assert.doesNotMatch(title, /\s{2,}/);

  const messy = { ...recorded('poteto-2102050467505430555'), description: 'a  b\n\nc https://t.co/x d　e' };
  assert.equal(render(messy).video.title, 'a b c d e');
});

test('the fetched entry rank distinguishes later videos', () => {
  const metadata = recorded('poteto-2102050467505430555');
  const bare = render(metadata).url;

  assert.equal(render({ ...metadata, title: `${metadata.title} #2` }).url, `${bare}/video/2`);
});

test('video 1 is never numbered, in a url or a filename, and a later video always is', () => {
  assert.equal(videoSuffix(1, '/video/'), '');
  assert.equal(videoSuffix(1, '-'), '');
  assert.equal(videoSuffix(2, '/video/'), '/video/2');
  assert.equal(videoSuffix(12, '-'), '-12');
});

test('the url uses the handle yt-dlp reports, not the one the input spelled', () => {
  // twitter.com/CTVJLaidlaw/status/1600649710662213632 reports JocelynVLaidlaw.
  const first = render(recorded('ctv-1600649710662213632-video1'));
  assert.equal(first.url, 'https://x.com/JocelynVLaidlaw/status/1600649710662213632');
  assert.equal(frontmatter(first).channel, '"Jocelyn Laidlaw (@JocelynVLaidlaw)"');

  const second = render(recorded('ctv-1600649710662213632-video2'));
  assert.equal(second.url, 'https://x.com/JocelynVLaidlaw/status/1600649710662213632');
  assert.equal(frontmatter(second).duration, '"1:42"');
});

test('the fetched entry rank determines identity, not the selector in webpage_url', () => {
  const entry = {
    ...recorded('ctv-1600649710662213632-video2'),
    title: 'Jocelyn Laidlaw - title #2',
    webpageUrl: 'https://twitter.com/CTVJLaidlaw/status/1600649710662213632/video/3',
  };
  const second = render(entry);

  assert.equal(second.url, 'https://x.com/JocelynVLaidlaw/status/1600649710662213632/video/2');
  assert.equal(second.collisionId, '1600649710662213632-2');

  const first = {
    ...entry,
    title: 'Jocelyn Laidlaw - title #1',
    webpageUrl: 'https://x.com/CTVJLaidlaw/status/1600649710662213632/video/2',
  };
  assert.equal(render(first).url, 'https://x.com/JocelynVLaidlaw/status/1600649710662213632');
});

test('an entry with no rank suffix is the first video, regardless of the requested number', () => {
  const bare = {
    ...recorded('ctv-1600649710662213632-video2'),
    title: 'Jocelyn Laidlaw - a single video',
    webpageUrl: 'https://x.com/poteto/status/1600649710662213632',
  };
  assert.equal(render(bare).url, 'https://x.com/JocelynVLaidlaw/status/1600649710662213632');
  assert.equal(render({ ...bare, webpageUrl: '' }).url, 'https://x.com/JocelynVLaidlaw/status/1600649710662213632');
});

test('the post id identifies the transcript, never the media id', () => {
  const transcript = render(recorded('poteto-2102050467505430555'));

  assert.equal(transcript.collisionId, '2102050467505430555');
  const third = { ...recorded('poteto-2102050467505430555'), title: 'Post title #3' };
  assert.equal(render(third).collisionId, '2102050467505430555-3');
});

test('every X track is recorded as auto, whatever the track itself says', () => {
  // The premise: the content check reads this track as manual, as does yt-dlp's
  // own listing. ADR-0003 is why neither decides.
  const transcript = render(recorded('poteto-2102050467505430555'));

  assert.equal(transcript.trackKind, 'auto');
  assert.equal(frontmatter(transcript).subtitles, 'auto');
});

test('the cleaned body has no X markup and drops no spoken word', () => {
  const trackText = readXTrack();
  const body = render(recorded('poteto-2102050467505430555'), { trackText }).contents.split('\n---\n\n')[1];

  assert.doesNotMatch(body, /X-word-ms|character_ranges|index=|[<>]/);

  // Independently of the cleaner: the words every cue text line carries once
  // its tags are cut, in order.
  const spoken = trackText
    .split(/\r?\n/)
    .filter((line) => line && line !== 'WEBVTT' && !line.includes('-->'))
    .map((line) => line.replace(/<[^>]*>/g, ''))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);

  assert.ok(spoken.length > 100, 'the trimmed track is too short to prove anything');
  assert.deepEqual(body.split(/\s+/).filter(Boolean), spoken);
});

test('the slug comes from the title, and falls back to the lowercased handle and post id', () => {
  assert.equal(render(recorded('poteto-2102050467505430555')).slug.startsWith('heres-how-i-shipped-2-500-prs'), true);

  // Japanese text: too little of the title survives slugging.
  const japanese = render(recorded('kw5hine-2106578219269005639'));
  assert.equal(japanese.filename, 'kw5hine-2106578219269005639.md');
  assert.equal(frontmatter(japanese).channel, '"Kダブシャイン (@kw5hine)"');

  // Only the case changes: the handle's underscore is kept.
  const weidel = { ...recorded('kw5hine-2106578219269005639'), uploaderId: 'Alice_Weidel', displayId: '1877462752526053592' };
  assert.equal(render(weidel).slug, 'alice_weidel-1877462752526053592');

  // A later video of the same post is told apart in the slug too.
  assert.equal(render({ ...weidel, title: 'Post title #2' }).slug, 'alice_weidel-1877462752526053592-2');
});

test('a post with no text is titled by its handle and id, and filed under them', () => {
  const empty = {
    ...recorded('kw5hine-2106578219269005639'),
    description: ' https://t.co/cTiQ5Oo5WA ',
    uploaderId: 'Alice_Weidel',
    uploader: 'Alice Weidel',
    displayId: '1877462752526053592',
  };
  const transcript = render(empty);

  assert.equal(transcript.video.title, '@Alice_Weidel post 1877462752526053592');
  assert.equal(frontmatter(transcript).title, '"@Alice_Weidel post 1877462752526053592"');
  // Not slugified from that title, which would give `alice-weidel-post-187...`.
  assert.equal(transcript.slug, 'alice_weidel-1877462752526053592');
});

test('a quote post is the quoting post, from its own first video', () => {
  const transcript = render(recorded('maiyang-2102344659276099794'));

  assert.equal(transcript.url, 'https://x.com/MaiYangAI/status/2102344659276099794');
  assert.equal(frontmatter(transcript).channel, '"Mai Yang (@MaiYangAI)"');
  assert.equal(frontmatter(transcript).duration, '"25:23"');
});

test('the catalog lists a post transcript with no change of its own', () => {
  const transcript = render(recorded('poteto-2102050467505430555'));
  const { markdown, warnings } = renderCatalog([{ path: transcript.filename, text: transcript.contents }]);

  assert.deepEqual(warnings, []);
  assert.match(markdown, /\(heres-how-i-shipped-2-500-prs[^)]*\.md\) \| lauren \(@poteto\) \| 38:01 \| 2026-09-21 \| auto \|/);
});
