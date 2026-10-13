/**
 * Artifact stripping: everything a subtitle track carries that is not spoken
 * content comes out, and everything else stays.
 *
 * Every rule here branches on track kind, because **the same notation means
 * opposite things in the two kinds**: `[music]` on an auto track is an
 * artifact, while `[Caplin?]` on a manual one is content. A uniform bracket
 * rule silently deletes real speech; that is settled by measurement, not
 * preference.
 *
 * Four classes, and only three of them need code:
 *
 * | Class                   | Manual           | Auto        | Disposition                    |
 * |-------------------------|------------------|-------------|--------------------------------|
 * | Provenance credits      | `Transcriber:`   | none        | Drop the cue, first or last only |
 * | Speaker change          | leading `- `     | `>>`, `>>>` | Delete the marker, keep the cue |
 * | Sound events            | `(Laughter)`     | `[snorts]`  | Strip the token, shape-guarded |
 * | Transcriber annotations | `[Caplin?]`      | none        | Keep verbatim, brackets and all |
 *
 * The speaker-change marker is removed as text but first marks where a turn
 * begins (ADR-0007); `stripArtifacts` reports those positions to `./clean.js`.
 *
 * The fourth class needs no rule: the bracket rule simply does not apply to
 * manual tracks. The brackets *are* the meaning — unwrapping turns
 * `Matt [Caplin?],` into `Matt Caplin?,`, a question mark that now reads as
 * the speaker's.
 *
 * Where in the pipeline this runs, and why that edge is forced, is settled in
 * `./clean.js`.
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

/**
 * What each kind's notation looks like, in one place per kind, because a kind
 * is the only thing that selects between them.
 *
 * `marker` is line-start speaker change. `continuation`, where a kind has one,
 * is a marked line that is the same speaker resuming rather than a new one: a
 * manual `- ...` follows an interjection, so it is stripped but opens no turn.
 * `soundEvent` is non-nesting by construction: the enclosed text may not
 * contain its own delimiters, so the match can never run past the token it
 * opened.
 *
 * Each notation is applied only to its own kind. A `>>` on a manual track is
 * someone quoting Markdown and a `[snorts]` never occurs there at all, so
 * crossing them over could only ever delete content. The one exception is a
 * named track, which is manual but written with the auto notation (ADR-0009):
 * `stripArtifacts` is told which notation to read, not which kind it is.
 *
 * The auto marker is two or three `>`, removed whole: `>>>` is a speaker
 * change too, and `>>` alone would leave a stray `>`.
 */
const NOTATION = {
  manual: { marker: /^-\s+/, continuation: /^-\s+(?:\.{3}|…)/, soundEvent: /\(([^()]*)\)/g },
  auto: { marker: /^>>>?\s*/, soundEvent: /\[([^[\]]*)\]/g },
};

/**
 * Stand where a turn begins and where a cue line begins while the cue's lines
 * are joined and its sound events removed, then are read back out as word
 * positions. Control characters, so they can neither occur in a track nor be
 * mistaken for a word.
 */
const TURN_MARK = '\u0001';
const LINE_MARK = '\u0002';
const MARKS = /[\u0001\u0002]/g;

/** The marks a run of text holds, space-separated so they read back out as tokens. */
const marksIn = (text) => (text.match(MARKS) ?? []).join(' ');

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
 * Manual notation only — it does not occur on auto tracks, so applying it
 * there could only ever delete speech, and a named track, which reads the
 * auto notation, keeps such a line.
 */
function dropsAsCredit(lines, index, total, notation) {
  if (notation !== 'manual') return false;
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
 * trimmed, and a cue left with no words is **dropped entirely** — contributing
 * no words and no whitespace.
 *
 * A speaker-change marker leaves a turn start behind, as the word position in
 * the cue's text where the turn begins. A cue with no words survives if it
 * carries one: `>> [music]` has no words but still ends the turn before it.
 * Whether a turn with no words counts is `./clean.js`'s call, not this one's.
 * Where each cue line begins is reported too: rolling repetition repeats whole
 * lines, and that is how `./clean.js` tells a repeated marker from a new one.
 *
 * @param {string[][]} cues cue lines, already tag-stripped, entity-decoded,
 *   whitespace-collapsed and trimmed — `CREDIT` and both markers anchor at the
 *   start of a line and read that trim as given
 * @param {'auto'|'manual'} notation which kind's notation to read: the track's
 *   kind, except that a named track reads as `'auto'` (ADR-0009)
 * @returns {Array<{ text: string, turnStarts: number[], lineStarts: number[] }>}
 *   the surviving cues, both lists counted in words from the start of `text`,
 *   ascending
 */
export function stripArtifacts(cues, notation) {
  const { marker, continuation, soundEvent } = NOTATION[notation];
  const stripped = [];

  for (const [index, lines] of cues.entries()) {
    // Evaluated against the list as it arrives, so dropping a cue can never
    // promote its neighbour into first or last position.
    if (dropsAsCredit(lines, index, cues.length, notation)) continue;

    // A sound event split across two lines holds a line mark: it is judged
    // without the mark, and leaves the mark behind when it goes.
    const joined = lines
      .map((line) => line.replace(marker, continuation?.test(line) ? '' : `${TURN_MARK} `))
      .map((line) => `${LINE_MARK} ${line}`)
      .join(' ')
      .replace(soundEvent, (token, enclosed) =>
        isSoundEvent(enclosed.replace(MARKS, '')) ? ` ${marksIn(enclosed)} ` : token,
      )
      .replace(/\s+/g, ' ')
      .trim();

    const words = [];
    const turnStarts = [];
    const lineStarts = [];
    for (const token of joined.split(' ').filter(Boolean)) {
      if (token === TURN_MARK) turnStarts.push(words.length);
      else if (token === LINE_MARK) lineStarts.push(words.length);
      else words.push(token);
    }

    if (words.length > 0 || turnStarts.length > 0) {
      stripped.push({ text: words.join(' '), turnStarts, lineStarts });
    }
  }

  return stripped;
}
