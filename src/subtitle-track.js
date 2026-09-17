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
 * @returns {{ startMs: number, endMs: number, lines: string[] }[]}
 */
export function parseCues(rawText) {
  const cues = [];

  for (const block of toBlocks(rawText)) {
    let current = null;

    for (const rawLine of block) {
      const line = rawLine.trim();
      const timing = CUE_TIMING.exec(line);

      if (timing) {
        current = { startMs: toMilliseconds(timing[1]), endMs: toMilliseconds(timing[2]), lines: [] };
        cues.push(current);
        continue;
      }

      // Before the block's timing line sits its identifier, and a block with
      // no timing line at all is a header or a NOTE. Neither is speech.
      if (current && line) current.lines.push(line);
    }
  }

  return cues;
}
