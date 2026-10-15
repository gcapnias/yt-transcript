/**
 * Reading a subtitle track: what kind it is, and what cues it holds.
 *
 * The cue parser is ported from the standalone cleaner this tool replaces and
 * the parser on branch `prototype/paragraph-rules`, both measured against the
 * thirteen real tracks in `tests/fixtures/`.
 *
 * Nothing here strips or decodes anything: cue lines come out verbatim,
 * because classification reads *raw* cue text and every later rule needs the
 * cues still separate.
 */

/**
 * Both timestamp separators. `yt-dlp` prefers `.vtt` but is not obliged to
 * hand us one — no `--sub-format` is passed — and an `.srt` differs only in
 * using a comma and numbering its cues.
 */
const CUE_TIMING = /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/;

/**
 * The two signals an auto track carries and a manual track never does:
 * `<c>` word-timing tags and the `align:start position:0%` cue setting.
 * Measured at 0 occurrences on five manual tracks against 319–1265 on eight
 * auto ones.
 */
const AUTO_SIGNAL = /<c[\s.>]|align:start position:0%/;

/**
 * Manual or auto, read from the subtitle track body and never from the log —
 * the log says `Writing video subtitles to:` for auto tracks too, and
 * `Kind: captions` appears in both.
 *
 * One signal, three consumers: the `subtitles` frontmatter key, the dedup
 * skip, and which artifact notation to look for.
 *
 * @param {string} rawText the subtitle track exactly as downloaded
 * @returns {'auto'|'manual'}
 */
export function classifyTrack(rawText) {
  return AUTO_SIGNAL.test(rawText) ? 'auto' : 'manual';
}

/**
 * A named track's key: a 2-3 letter language, no region, then exactly eleven
 * characters of YouTube's track id (ADR-0009). The id holds `-` and `_`, so
 * the key can hold more hyphens than the language and id show.
 */
const NAMED_TRACK = /^[A-Za-z]{2,3}-[A-Za-z0-9_-]{11}$/;

/**
 * Whether a track's key is a named track's, such as `en-JkeT_87f4cc`. True
 * however the track was asked for; `en`, `en-orig`, `en-US` and `en-GB` are
 * not named, nor is a translation keyed `en-` plus a longer track key.
 *
 * @param {string} key a track's key, as `trackKeyFromFileName` reads it
 */
export function isNamedTrack(key) {
  return NAMED_TRACK.test(key);
}

/**
 * A track's key, read from the file name `yt-dlp` gave it: everything between
 * the id and the extension (`<id>.<key>.<ext>`). Neither a video id nor a
 * media id holds a dot, and a key never does either: `yt-dlp` writes its dots
 * as hyphens.
 *
 * @param {string} fileName
 */
export function trackKeyFromFileName(fileName) {
  return fileName.slice(fileName.indexOf('.') + 1, fileName.lastIndexOf('.'));
}

/** Milliseconds, as an integer, so cue arithmetic never rounds. */
function toMilliseconds(timestamp) {
  const [clock, fraction = '0'] = timestamp.replace(',', '.').split('.');
  const [hours, minutes, seconds] = clock.split(':').map(Number);
  const millis = Number(fraction.padEnd(3, '0').slice(0, 3));
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/**
 * Splits a track into blank-line-delimited blocks, which is the structure both
 * WebVTT and SRT are actually written in: a header block, then one block per
 * cue, each optionally preceded by an identifier line.
 *
 * Only a **truly empty** line ends a block. A line holding a single space does
 * not: `yt-dlp`'s auto tracks emit exactly that inside a cue, and treating it
 * as a terminator would cut those cues in half.
 */
function toBlocks(rawText) {
  const blocks = [];
  let block = [];

  for (const line of rawText.split(/\r?\n/)) {
    if (line === '') {
      if (block.length > 0) blocks.push(block);
      block = [];
      continue;
    }
    block.push(line);
  }

  if (block.length > 0) blocks.push(block);
  return blocks;
}

/**
 * Splits a subtitle track into its cues.
 *
 * A line counts as speech by **position** — it follows a timing line inside
 * the same block — and never by what it says. A lexical filter here would
 * silently eat a cue reading `1995` or one opening with `NOTE`, which is
 * exactly the class of failure the cleaning rules exist to make impossible.
 *
 * Every cue carrying a timing line comes out, including the ones whose text is
 * empty: dropping them would break the cue contiguity the timing tests read,
 * and the cleaning pipeline discards them anyway.
 *
 * @param {string} rawText
 * @param {{ ids?: boolean }} [options] `ids` reads each cue's identifier line,
 *   when it has one, into `id`: a meeting's cue ids rebuild its utterances
 * @returns {{ startMs: number, endMs: number, lines: string[], id?: string }[]}
 */
export function parseCues(rawText, { ids = false } = {}) {
  const cues = [];

  for (const block of toBlocks(rawText)) {
    let current = null;
    let identifier = null;

    for (const rawLine of block) {
      const line = rawLine.trim();
      const timing = CUE_TIMING.exec(line);

      if (timing) {
        current = { startMs: toMilliseconds(timing[1]), endMs: toMilliseconds(timing[2]), lines: [] };
        // Opt-in, and only on a cue that has one, so a video's track parses
        // exactly as it did before identifiers were ever read.
        if (ids && identifier !== null) current.id = identifier;
        cues.push(current);
        continue;
      }

      if (!current) identifier = line;

      // Before the block's timing line sits its identifier, and a block with
      // no timing line at all is a header or a NOTE. Neither is speech.
      if (current && line) current.lines.push(line);
    }
  }

  return cues;
}
