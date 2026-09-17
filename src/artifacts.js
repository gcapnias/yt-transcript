/**
 * Artifact stripping: everything a subtitle track carries that is not spoken
 * content comes out, and everything else stays.
 *
 * Every rule here branches on track kind, because **the same notation means
 * opposite things in the two kinds**: `[music]` on an auto track is noise,
 * while `[Caplin?]` on a manual one is content. A uniform bracket rule
 * silently deletes real speech; that is settled by measurement, not
 * preference.
 *
 * Four classes, and only two of them need code:
 *
 * | Class                   | Manual           | Auto        | Disposition                    |
 * |-------------------------|------------------|-------------|--------------------------------|
 * | Provenance credits      | `Transcriber:`   | none        | Drop the cue, first or last only |
 * | Speaker change          | leading `- `     | leading `>>`| Delete the marker, keep the cue |
 * | Sound events            | `(Laughter)`     | `[snorts]`  | Strip the token, shape-guarded |
 * | Transcriber annotations | `[Caplin?]`      | none        | Keep verbatim, brackets and all |
 *
 * The fourth class needs no rule: the bracket rule simply does not apply to
 * manual tracks. The brackets *are* the meaning — unwrapping turns
 * `Matt [Caplin?],` into `Matt Caplin?,`, a question mark that now reads as
 * the speaker's.
 *
 * This runs **before dedup**, and that edge is forced: the overlap detection
 * has no minimum match length, so repeated boilerplate is exactly the
 * repetition it mis-fires on.
 */

/**
 * The provenance credits, matched case-insensitively at the start of a line.
 *
 * The pattern alone is not safe — "subtitles by…" is a phrase a speaker could
 * plausibly utter mid-talk. The **position guard** in `dropsAsCredit` is what
 * makes it safe, and it covers both ends because one sample track carries its
 * credit as its final cue.
 */
const CREDIT = /^(Transcriber|Reviewer|Translator|Subtitles by|Captions by|Amara)\b/i;

/** Line-start speaker change, one notation per track kind. */
const SPEAKER_MARKER = { manual: /^-\s+/, auto: /^>>\s*/ };

/**
 * Sound events, one notation per track kind. Non-nesting by construction: the
 * enclosed text may not contain its own delimiters, so the match can never run
 * past the token it opened.
 */
const SOUND_EVENT = { manual: /\(([^()]*)\)/g, auto: /\[([^[\]]*)\]/g };

/**
 * The shape guard, and a deliberate cost. A curated vocabulary of event words
 * was rejected — it needs curating forever against an open ASR vocabulary, and
 * `[snorts]` was on nobody's list — so the rule reads shape instead: **four
 * words or fewer, and no sentence punctuation**.
 *
 * That makes the rule **fail safe**. An unrecognised long parenthetical stays
 * visible in the prose rather than taking speech with it.
 */
function isSoundEvent(enclosed) {
  if (/[.?!]/.test(enclosed)) return false;
  return enclosed.trim().split(/\s+/).filter(Boolean).length <= 4;
}

/**
 * Whether a cue is a provenance credit standing where only a credit can stand.
 * Manual tracks only — the notation does not occur on auto ones, so applying
 * it there could only ever delete speech.
 */
function dropsAsCredit(lines, index, total, trackKind) {
  if (trackKind !== 'manual') return false;
  if (index !== 0 && index !== total - 1) return false;
  return lines.some((line) => CREDIT.test(line));
}

/**
 * Strips the artifacts from a track's cues.
 *
 * Cues arrive **separate and indexed**, and both facts are load-bearing: the
 * credit rule reads the index, and the sound-event rule matches **within a
 * single cue**, so a bracket opening in one cue and closing in the next is not
 * a token at all. Each cue's lines are collapsed into one string on the way
 * out, which is what `mergeCues` would have done anyway.
 *
 * Removal is **token-level**, because speech shares the line with the token
 * (`(Audience) Good.`). Afterwards whitespace runs collapse, the cue is
 * trimmed, and a cue left holding only whitespace is **dropped entirely** —
 * contributing no words and no whitespace.
 *
 * @param {string[][]} cues cue lines, already tag-stripped and entity-decoded
 * @param {'auto'|'manual'} trackKind
 * @returns {string[][]} the surviving cues, each a single-element line list
 */
export function stripArtifacts(cues, trackKind) {
  const marker = SPEAKER_MARKER[trackKind];
  const soundEvent = SOUND_EVENT[trackKind];
  const stripped = [];

  for (const [index, lines] of cues.entries()) {
    // Evaluated against the list as it arrives, so dropping a cue can never
    // promote its neighbour into first or last position.
    if (dropsAsCredit(lines, index, cues.length, trackKind)) continue;

    const text = lines
      .map((line) => line.replace(marker, ''))
      .join(' ')
      .replace(soundEvent, (token, enclosed) => (isSoundEvent(enclosed) ? ' ' : token))
      .replace(/\s+/g, ' ')
      .trim();

    if (text) stripped.push([text]);
  }

  return stripped;
}
