/**
 * Reading a subtitle track: what kind it is, and what cues it holds.
 *
 * Ported from `clean-transcript.js` and the `prototype/paragraph-rules` cue
 * parser. Both were measured against the thirteen real tracks in
 * `tests/fixtures/`, so the shapes tolerated here are the shapes observed
 * there, not a guess at the WebVTT grammar.
 *
 * Nothing in this module strips or decodes anything: cue lines come out
 * verbatim, because classification reads *raw* cue text and every later rule
 * needs the cues still separate.
 */

/**
 * Both timestamp separators, because no `--sub-format` is passed: `yt-dlp`
 * prefers `.vtt` but is not obliged to hand us one, and an `.srt` differs only
 * in using a comma and numbering its cues.
 */
const CUE_TIMING = /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/;

/** Lines that carry no speech: the WebVTT header and an SRT cue number. */
const NOT_SPEECH = /^(WEBVTT|Kind:|Language:|NOTE\b|\d+$)/;

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
 * skip, and (from ytdlp-xmu.3) which artifact notation to look for.
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
 * Splits a subtitle track into its cues.
 *
 * Every cue carrying a timing line comes out, including the ones whose text is
 * empty: dropping them here would break the contiguity the timing tests read,
 * and the cleaning pipeline discards them anyway.
 *
 * @param {string} rawText
 * @returns {{ startMs: number, endMs: number, lines: string[] }[]}
 */
export function parseCues(rawText) {
  const cues = [];
  let current = null;
  let lines = [];

  const close = () => {
    if (current) cues.push({ ...current, lines });
    current = null;
    lines = [];
  };

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const timing = CUE_TIMING.exec(line);

    if (timing) {
      close();
      current = { startMs: toMilliseconds(timing[1]), endMs: toMilliseconds(timing[2]) };
      continue;
    }

    // Anything before the first cue is header, not speech. Clearing the buffer
    // unconditionally above is what keeps it from leaking into cue one.
    if (!current || !line || NOT_SPEECH.test(line)) continue;
    lines.push(line);
  }

  close();
  return cues;
}
