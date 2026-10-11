import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  NO_POST_IDENTITY,
  NO_SUBTITLES,
  NO_VIDEO,
  NOT_AN_X_POST,
  RATE_LIMITED,
} from '../src/fetch-outcome.js';
import {
  expandArgs,
  ExpansionError,
  fetchArgs,
  fetchFailure,
  FetchError,
  findSubtitleTrack,
  parseExpansion,
  listArgs,
  parseListing,
  parseMetadata,
} from '../src/ytdlp.js';
import { xPost } from '../src/site.js';
import { classifyTrack, isNamedTrack, trackLanguage } from '../src/subtitle-track.js';
import { withTempDir } from '../src/temp-dir.js';
import {
  AUTO_ORIG_ID,
  fixtureName,
  namedFixtureName,
  readFixture,
  readNamedFixture,
  readXListing,
  readXPrintLine,
  SUBTITLE_429_WARNING,
} from './fixtures.js';

const URL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';


// The other half of the success test — exit 0 alone is not success — and the
// only half that is about bytes on disk rather than the exit code.
test('a zero-byte subtitle file is no subtitle file', async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'o3CX_Y59_74.en.vtt'), '', 'utf8');
    assert.equal(await findSubtitleTrack(dir), null);

    await fs.writeFile(path.join(dir, 'o3CX_Y59_74.el.vtt'), 'WEBVTT\n', 'utf8');
    assert.equal((await findSubtitleTrack(dir)).trackPath, path.join(dir, 'o3CX_Y59_74.el.vtt'));
  });
});

// The default English can land up to three tracks (ADR-0006); the one chosen
// is ranked, never whichever the directory listing happens to return first.

const MANUAL_TRACK = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello and welcome.\n';
const AUTO_TRACK =
  'WEBVTT\n\n00:00:00.000 --> 00:00:02.000 align:start position:0%\nHello<00:00:00.500><c> and</c>\n';

/** Writes `tracks` into a fresh directory in the order given, and ranks them. */
async function chosenTrack(tracks) {
  return withTempDir(async (dir) => {
    for (const [name, text] of tracks) await fs.writeFile(path.join(dir, name), text, 'utf8');
    const found = await findSubtitleTrack(dir);
    return found && path.basename(found.trackPath);
  });
}

/** What was passed over, as `kind key` pairs, in the order the picker ranked them. */
async function passedOver(tracks) {
  return withTempDir(async (dir) => {
    for (const [name, text] of tracks) await fs.writeFile(path.join(dir, name), text, 'utf8');
    return (await findSubtitleTrack(dir)).passedOver.map(({ kind, key }) => `${kind} ${key}`);
  });
}

test('a manual en-US track beats an auto en one', async () => {
  // The recorded case: a translated auto `en` beside the only manual English.
  const tracks = [
    ['QIHnmqYU614.en-US.vtt', readFixture('manual', 'QIHnmqYU614')],
    ['QIHnmqYU614.en.vtt', readFixture('auto', 'o3CX_Y59_74')],
  ];

  assert.equal(await chosenTrack(tracks), 'QIHnmqYU614.en-US.vtt');
  assert.equal(await chosenTrack(tracks.toReversed()), 'QIHnmqYU614.en-US.vtt');
});

test('between tracks of one kind, en beats en-orig beats en-US beats en-GB, in any order on disk', async () => {
  for (const text of [MANUAL_TRACK, AUTO_TRACK]) {
    const all = ['X.en-GB.vtt', 'X.en-US.vtt', 'X.en-orig.vtt', 'X.en.vtt'].map((name) => [
      name,
      text,
    ]);

    // `X.en-US.vtt` sorts before `X.en.vtt`, so a first-found rule picks it.
    assert.equal(await chosenTrack(all), 'X.en.vtt');
    assert.equal(await chosenTrack(all.toReversed()), 'X.en.vtt');
    // Without `en`, then without `en-orig`, in either order.
    assert.equal(await chosenTrack(all.slice(0, 3)), 'X.en-orig.vtt');
    assert.equal(await chosenTrack(all.slice(0, 3).toReversed()), 'X.en-orig.vtt');
    assert.equal(await chosenTrack(all.slice(0, 2)), 'X.en-US.vtt');
    assert.equal(await chosenTrack(all.slice(0, 2).toReversed()), 'X.en-US.vtt');
  }
});

test('a manual regional variant beats an auto en-orig track', async () => {
  for (const variant of ['en-US', 'en-GB']) {
    const tracks = [
      ['X.en-orig.vtt', AUTO_TRACK],
      [`X.${variant}.vtt`, MANUAL_TRACK],
    ];

    assert.equal(await chosenTrack(tracks), `X.${variant}.vtt`);
    assert.equal(await chosenTrack(tracks.toReversed()), `X.${variant}.vtt`);
  }
});

test('a lone en-orig track is found, and the recorded one reads as auto', async () => {
  // The recorded case: `en` refused with a 429 on a dubbed video, `en-orig` written.
  const name = fixtureName(AUTO_ORIG_ID);
  const text = readFixture('auto', AUTO_ORIG_ID);

  assert.equal(name, 'MN9dGgmLyso.en-orig.vtt');
  assert.equal(await chosenTrack([[name, text]]), name);
  assert.equal(classifyTrack(text), 'auto');
});

test('kind outranks language: every manual variant beats every auto one', async () => {
  assert.equal(
    await chosenTrack([
      ['X.en.vtt', AUTO_TRACK],
      ['X.en-US.vtt', AUTO_TRACK],
      ['X.en-GB.vtt', MANUAL_TRACK],
    ]),
    'X.en-GB.vtt',
  );
});

test('a language asked for exactly is still found', async () => {
  for (const lang of ['de', 'en-US', 'pt-BR']) {
    assert.equal(await chosenTrack([[`X.${lang}.vtt`, MANUAL_TRACK]]), `X.${lang}.vtt`);
  }
});

// Named tracks (ADR-0009): the key is a language plus an 11-character id, and
// the id may itself hold `-` and `_`, as a video id can.

const CC1 = 'en-uYU-mmqFLq8';
const DTVCC1 = 'en-JkeT_87f4cc';

test('a named track is a language plus an 11-character id, and nothing else', () => {
  for (const key of [DTVCC1, CC1, 'en-1JJtFDtHuZg', 'fr-JkeT_87f4cc', 'yue-JkeT_87f4cc']) {
    assert.equal(isNamedTrack(key), true, key);
  }
  for (const key of [
    'en',
    'en-orig',
    'en-US',
    'en-GB',
    'en-fr',
    `en-${CC1}`,
    `${DTVCC1}1`,
    DTVCC1.slice(0, -1),
    'en-US-JkeT_87f4cc',
    'JkeT_87f4cc',
  ]) {
    assert.equal(isNamedTrack(key), false, key);
  }
});

test('a track file name gives its language, whatever hyphens the id and key hold', () => {
  assert.equal(trackLanguage(`ilmBGeGldrI.${DTVCC1}.vtt`), DTVCC1);
  // A video id holding a `-` and a `_`, and a key holding a `-` inside its id.
  assert.equal(trackLanguage(`LoMOPj-lO8U.${CC1}.vtt`), CC1);
  assert.equal(trackLanguage('o3CX_Y59_74.en.srt'), 'en');
  assert.equal(trackLanguage('2101938030122868736.en-US.vtt'), 'en-US');
});

test('a manual plain en beats a manual named track, in any order on disk', async () => {
  const tracks = [
    [`X.${DTVCC1}.vtt`, MANUAL_TRACK],
    ['X.en.vtt', MANUAL_TRACK],
  ];

  assert.equal(await chosenTrack(tracks), 'X.en.vtt');
  assert.equal(await chosenTrack(tracks.toReversed()), 'X.en.vtt');
});

test('a manual named track beats every auto track', async () => {
  const tracks = ['en', 'en-orig', 'en-US', 'en-GB'].map((lang) => [`X.${lang}.vtt`, AUTO_TRACK]);
  tracks.push([`X.${DTVCC1}.vtt`, MANUAL_TRACK]);

  assert.equal(await chosenTrack(tracks), `X.${DTVCC1}.vtt`);
  assert.equal(await chosenTrack(tracks.toReversed()), `X.${DTVCC1}.vtt`);
});

test('an auto en-GB beats an auto named track, which alone is still found', async () => {
  const tracks = [
    [`X.${CC1}.vtt`, AUTO_TRACK],
    ['X.en-GB.vtt', AUTO_TRACK],
  ];

  assert.equal(await chosenTrack(tracks), 'X.en-GB.vtt');
  assert.equal(await chosenTrack(tracks.toReversed()), 'X.en-GB.vtt');
  assert.equal(await chosenTrack([[`X.${CC1}.vtt`, AUTO_TRACK]]), `X.${CC1}.vtt`);
});

test('the recorded DTVCC1 reads as manual and beats the recorded CC1, which reads as auto', async () => {
  const dtvcc1 = readNamedFixture(DTVCC1);
  const cc1 = readNamedFixture(CC1);
  const tracks = [
    [namedFixtureName(CC1), cc1],
    [namedFixtureName(DTVCC1), dtvcc1],
  ];

  assert.equal(classifyTrack(dtvcc1), 'manual');
  assert.equal(classifyTrack(cc1), 'auto');
  assert.equal(await chosenTrack(tracks), namedFixtureName(DTVCC1));
  assert.equal(await chosenTrack(tracks.toReversed()), namedFixtureName(DTVCC1));
});

// The picker also says what it passed over, so a single-video fetch can name
// the tracks a person might have wanted instead (ADR-0009).

test('manual and named tracks passed over are reported, unnamed auto ones are not', async () => {
  assert.deepEqual(
    await passedOver([
      ['X.en.vtt', MANUAL_TRACK],
      [`X.${DTVCC1}.vtt`, MANUAL_TRACK],
      [`X.${CC1}.vtt`, AUTO_TRACK],
      ['X.en-orig.vtt', AUTO_TRACK],
      ['X.en-US.vtt', AUTO_TRACK],
    ]),
    [`manual ${DTVCC1}`, `auto ${CC1}`],
  );
});

test('a named auto track that lost to an auto en is reported', async () => {
  assert.deepEqual(
    await passedOver([
      ['X.en.vtt', AUTO_TRACK],
      [`X.${CC1}.vtt`, AUTO_TRACK],
    ]),
    [`auto ${CC1}`],
  );
});

test('a manual track that lost to a better manual one is reported with its key', async () => {
  assert.deepEqual(
    await passedOver([
      ['X.en-US.vtt', MANUAL_TRACK],
      ['X.en.vtt', MANUAL_TRACK],
    ]),
    ['manual en-US'],
  );
});

test('nothing is reported when only unnamed auto tracks were passed over', async () => {
  assert.deepEqual(
    await passedOver([
      ['X.en.vtt', MANUAL_TRACK],
      ['X.en-orig.vtt', AUTO_TRACK],
      ['X.en-GB.vtt', AUTO_TRACK],
    ]),
    [],
  );
  assert.deepEqual(await passedOver([['X.en.vtt', AUTO_TRACK]]), []);
  assert.deepEqual(await passedOver([[`X.${DTVCC1}.vtt`, MANUAL_TRACK]]), []);
});

test('the recorded en-US track reads as manual', () => {
  // What makes it `subtitles: manual` once chosen.
  assert.equal(classifyTrack(readFixture('manual', 'QIHnmqYU614')), 'manual');
});

test('a recorded process outcome becomes the failure it means', () => {
  const outcome = { url: URL, lang: 'en' };

  assert.equal(fetchFailure({ ...outcome, exitCode: 0, hasTrack: true }), null);

  const noSubtitles = fetchFailure({ ...outcome, exitCode: 0, hasTrack: false });
  assert.ok(noSubtitles instanceof FetchError);
  assert.equal(noSubtitles.failure, NO_SUBTITLES);
  assert.equal(noSubtitles.retryable, false, 'a permanent failure was marked retryable');
  assert.equal(noSubtitles.exitCode, 0);
  assert.equal(noSubtitles.url, URL);

  // The one retried exception, and the reason the ladder ever runs.
  const rateLimited = fetchFailure({ ...outcome, exitCode: 1, hasTrack: false });
  assert.equal(rateLimited.failure, RATE_LIMITED);
  assert.equal(rateLimited.retryable, true, 'a 429 was not marked retryable');
  assert.equal(rateLimited.exitCode, 1);
  assert.match(rateLimited.message, /may succeed/);
});

test('a youtube fetch that exits 0 with a refused subtitle download and no track is retried', () => {
  const outcome = { url: URL, lang: 'en', exitCode: 0, hasTrack: false };
  const stderr = SUBTITLE_429_WARNING;

  const rateLimited = fetchFailure({ ...outcome, stderr });
  assert.equal(rateLimited.failure, RATE_LIMITED);
  assert.equal(rateLimited.retryable, true);
  assert.match(rateLimited.message, /may succeed/);

  assert.equal(fetchFailure({ ...outcome, stderr: '' }).failure, NO_SUBTITLES);
  assert.equal(fetchFailure({ ...outcome, hasTrack: true, stderr }), null);
});

test('the default English asks for en, en-orig, en-US, en-GB and a named track, and outlives one of them failing', () => {
  const args = fetchArgs({ url: URL, lang: 'en', destDir: '/tmp/run' });

  // `en` is widened (ADR-0006): a video whose only manual English is `en-US`,
  // or whose translated `en` is refused, is not left to that `en`.
  assert.equal(args[args.indexOf('--sub-langs') + 1], 'en,en-orig,en-US,en-GB,en-[A-Za-z0-9_-]{11}');
  assert.ok(args.includes('--ignore-errors'), 'a 429 on one variant would abort the rest');
  // Still exact codes: nothing broadens to `all`, which would let `live_chat`
  // in as a live stream's "manual" track.
  assert.ok(!args.includes('all'), 'broadened to --sub-langs all');
});

test('any other --lang reaches yt-dlp verbatim, and is matched exactly', () => {
  for (const lang of ['en-US', 'en-GB', 'en-orig', 'de', 'de-orig', 'el']) {
    const args = fetchArgs({ url: URL, lang, destDir: '/tmp/run' });

    assert.equal(args[args.indexOf('--sub-langs') + 1], lang);
    assert.ok(!args.includes('--ignore-errors'), `--lang ${lang} was widened`);
  }
});

// Expansion: the only invocation that reads a playlist. Both halves below are
// pure — the spawn between them stays outside the tested seams, by decision.

test('every per-video invocation refuses the playlist, inside a batch as much as outside', () => {
  // This flag is the whole implementation of the divergence: a
  // `watch?v=...&list=...` URL means the video, and the fetch is always
  // exactly one video — including each fetch a batch performs.
  assert.ok(fetchArgs({ url: URL, lang: 'en', destDir: '/tmp/run' }).includes('--no-playlist'));
});

test('expansion reads the listing flat, and downloads nothing', () => {
  const args = expandArgs({ url: 'https://www.youtube.com/playlist?list=PL123' });

  assert.ok(args.includes('--flat-playlist'), 'expansion walked the playlist member by member');
  assert.ok(args.includes('--simulate'), 'expansion could download');
  assert.equal(args[args.indexOf('--print') + 1], '%(id)s');
  assert.equal(args.at(-1), 'https://www.youtube.com/playlist?list=PL123');
  // The divergence flag belongs to the per-video fetch; forcing it here would
  // reduce a playlist to its first video.
  assert.ok(!args.includes('--no-playlist'), 'the expansion refused to read the playlist');
});

test('expansion output is normalised to the settled canonical url form', () => {
  assert.deepEqual(parseExpansion('o3CX_Y59_74\r\n4JofSJIrjwU\n\n'), [
    'https://www.youtube.com/watch?v=o3CX_Y59_74',
    'https://www.youtube.com/watch?v=4JofSJIrjwU',
  ]);
});

test('a listing row that is not a playable video costs that row, not the batch', () => {
  assert.deepEqual(parseExpansion('[deleted]\no3CX_Y59_74\n'), [
    'https://www.youtube.com/watch?v=o3CX_Y59_74',
  ]);
});

test('an empty listing expands to zero videos rather than to a failure', () => {
  assert.deepEqual(parseExpansion(''), []);
});

test('expansion failure names the playlist and what yt-dlp said', () => {
  const error = new ExpansionError(
    'https://www.youtube.com/playlist?list=PL404',
    1,
    'ERROR: [youtube:tab] PL404: The playlist does not exist.\n',
  );

  assert.ok(error instanceof ExpansionError);
  assert.match(error.message, /Could not read the playlist or channel/);
  assert.match(error.message, /PL404/);
  assert.match(error.message, /The playlist does not exist\./);
  assert.doesNotMatch(error.message, /at .*\(.*:\d+:\d+\)/, 'message reads like a stack trace');
});

// X posts: the fetch selects entry #1 rather than relying on `--no-playlist`
// alone, which X's extractor ignores. A second, list-only invocation exists for
// the one case the fetch cannot rank by itself (gcapnias/yt-transcript#7).

const POST_URL = 'https://x.com/poteto/status/2102050467505430555';

test('the youtube invocation is exactly what it was, with English widened', () => {
  assert.deepEqual(fetchArgs({ url: URL, lang: 'en', destDir: '/tmp/run' }), [
    '--js-runtimes',
    'node',
    '--skip-download',
    '--no-playlist',
    '--write-sub',
    '--write-auto-sub',
    '--sub-langs',
    'en,en-orig,en-US,en-GB,en-[A-Za-z0-9_-]{11}',
    '--ignore-errors',
    '--no-simulate',
    '--print',
    '%(.{title,channel,duration_string,upload_date})j',
    '-P',
    '/tmp/run',
    '-o',
    '%(id)s',
    URL,
  ]);
});

test('a post is fetched as playlist entry 1, printing what ranks the video fetched', () => {
  const args = fetchArgs({ url: POST_URL, lang: 'en', destDir: '/tmp/run', site: xPost() });

  assert.ok(args.includes('--no-playlist'), 'dropped --no-playlist, which honours /video/N');
  // `--no-playlist` alone still processes both entries of a multi-video or
  // quote post, so the first is asked for by number.
  assert.equal(args[args.indexOf('--playlist-items') + 1], '1');
  assert.equal(args.at(-1), POST_URL);
  // English is asked for as it is of a YouTube video (ADR-0006).
  assert.equal(args[args.indexOf('--sub-langs') + 1], 'en,en-orig,en-US,en-GB,en-[A-Za-z0-9_-]{11}');
  assert.ok(args.includes('--ignore-errors'));
  // The fetch itself leaves no file but the track.
  assert.ok(!args.includes('--write-info-json'));
  assert.ok(!args.includes('--dump-json') && !args.includes('-J'));

  const template = args[args.indexOf('--print') + 1];
  for (const field of [
    'id',
    'title',
    'description',
    'uploader',
    'uploader_id',
    'display_id',
    'playlist_index',
    'extractor_key',
    'webpage_url',
    'duration_string',
    'upload_date',
  ]) {
    assert.ok(template.split(/[{,}]/).includes(field), `the post invocation does not print ${field}`);
  }
});

test("a post's videos are listed whole, by media id and rank, and nothing is written", () => {
  const args = listArgs({ postId: '1600649710662213632' });

  assert.equal(args.at(-1), 'https://x.com/i/status/1600649710662213632');
  // The whole post, every video: the listing takes the playlist path on purpose.
  assert.ok(args.includes('--yes-playlist'));
  assert.ok(!args.includes('--no-playlist') && !args.includes('--playlist-items'));
  assert.ok(args.includes('--simulate'), 'the listing could download');
  for (const flag of ['--write-sub', '--write-auto-sub', '--sub-langs', '-P', '-o', '--no-simulate']) {
    assert.ok(!args.includes(flag), `the listing passes ${flag}`);
  }
  assert.equal(args[args.indexOf('--print') + 1], '%(.{id,playlist_index})j');
});

test('a recorded listing is read as media id to rank', () => {
  assert.deepEqual(parseListing(readXListing('ctv-1600649710662213632')), [
    { mediaId: '1600649511827038209', playlistIndex: 1 },
    { mediaId: '1600649511827013632', playlistIndex: 2 },
  ]);
  // A post of one video is not a playlist, so its one entry has no index.
  assert.deepEqual(parseListing('noise\r\n{"id": "7"}\r\n'), [{ mediaId: '7', playlistIndex: 1 }]);
  assert.deepEqual(parseListing(''), []);
  // Only a lone entry is video 1 by default: among several, an unindexed entry
  // has no rank, so it is left out rather than guessed as the first.
  assert.deepEqual(parseListing('{"id": "7"}\n{"id": "8", "playlist_index": 2}\n'), [
    { mediaId: '8', playlistIndex: 2 },
  ]);
});

test('recorded post metadata is read as reported', () => {
  const metadata = parseMetadata(readXPrintLine('poteto-2102050467505430555'));

  assert.equal(metadata.uploader, 'lauren');
  assert.equal(metadata.uploaderId, 'poteto');
  // The post id, not the media id the file is named after.
  assert.equal(metadata.displayId, '2102050467505430555');
  assert.equal(metadata.extractorKey, 'Twitter');
  assert.equal(metadata.duration, '38:01');
  assert.equal(metadata.uploadDate, '20260921');
  assert.match(metadata.description, /^here's how i shipped 2,500 PRs.* https:\/\/t\.co\/NgrGz7tmPM$/);
});

test('the media id and playlist index are read when reported, and absent otherwise', () => {
  const post = parseMetadata(readXPrintLine('ctv-1600649710662213632-post'));
  assert.equal(post.mediaId, '1600649511827038209');
  assert.equal(post.playlistIndex, 1);

  const selected = parseMetadata(readXPrintLine('ctv-1600649710662213632-video2'));
  assert.equal(selected.mediaId, '1600649511827013632');
  assert.equal(selected.playlistIndex, null);
});

test('the url yt-dlp extracted from is read, for the video number it names', () => {
  const metadata = parseMetadata(
    '{"display_id": "1", "webpage_url": "https://x.com/a/status/1/video/2"}\n',
  );
  assert.equal(metadata.webpageUrl, 'https://x.com/a/status/1/video/2');
});

test('a recorded post outcome becomes the failure it means', () => {
  const outcome = { url: POST_URL, lang: 'en' };

  const noVideo = fetchFailure({
    ...outcome,
    exitCode: 1,
    hasTrack: false,
    site: xPost(),
    stderr: 'ERROR: [twitter] 20: No video could be found in this tweet\n',
  });
  assert.ok(noVideo instanceof FetchError);
  assert.equal(noVideo.failure, NO_VIDEO);
  assert.equal(noVideo.retryable, false, 'a post without a video was retried');
  assert.equal(noVideo.url, POST_URL);

  const elsewhere = fetchFailure({
    ...outcome,
    exitCode: 0,
    hasTrack: true,
    site: xPost(),
    metadata: { extractorKey: 'Youtube' },
  });
  assert.equal(elsewhere.failure, NOT_AN_X_POST);

  // X's extractor answered, but with nothing to file the post under.
  const anonymous = fetchFailure({
    ...outcome,
    exitCode: 0,
    hasTrack: true,
    site: xPost(),
    metadata: { extractorKey: 'Twitter', uploaderId: '', displayId: '2102050467505430555' },
  });
  assert.equal(anonymous.failure, NO_POST_IDENTITY);

  // The same stderr on a YouTube fetch is still just a non-zero exit.
  const youtube = fetchFailure({
    url: URL,
    lang: 'en',
    exitCode: 1,
    hasTrack: false,
  });
  assert.equal(youtube.failure, RATE_LIMITED);
});
