/**
 * The cleaning pipeline: a subtitle track in, turns of paragraphs out.
 *
 *   load -> classify -> strip tags -> decode entities -> strip artifacts
 *        -> dedup (auto only) -> split into turns -> choose layout -> paragraph
 *
 * Three of those edges are forced rather than stylistic, and the comments
 * below say which. The artifact rules themselves live in `./artifacts.js`;
 * what this file settles is where they run.
 *
 * Timing is not used at all. Inter-cue gaps are exactly 0ms on every auto
 * track measured, so no pause threshold can ever fire; `tests/subtitle-track.test.js`
 * holds that measurement. The paragraph signal is YouTube's own ASR
 * punctuation, and the cleaner never inserts a period.
 *
 * Speaker-change markers are artifacts and come out as text, but they first
 * mark where a turn begins (ADR-0007). The turns are cut from the deduplicated
 * word stream, so a marker line that rolling repetition shows twice is one turn.
 */

import { stripArtifacts } from './artifacts.js';
import { classifyTrack, isNamedTrack, parseCues } from './subtitle-track.js';

/** A paragraph breaks at the first sentence end after this many words; ADR-0007. */
const PARAGRAPH_MIN_WORDS = 130;

/** A track with this many turns or more is laid out as a dialog; ADR-0007. */
const DIALOG_MIN_TURNS = 10;

/** A word ends a sentence, allowing one closing quote or bracket after the stop. */
const SENTENCE_END = /[.!?]["')\]]?$/;

/**
 * Removes inline markup: `<c>` word-timing tags, their closers, and the
 * `<00:00:01.200>` timestamps between them.
 */
function stripTags(text) {
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Decodes the entity set these tracks actually carry. Runs **after** tag
 * stripping, never before: decoding first turns a `&lt;` into a `<` that tag
 * stripping then eats along with everything up to the next `>`.
 *
 * Not cosmetic — `>>`, the auto speaker marker, is `&gt;&gt;` on disk, so this
 * is what lets `./artifacts.js` write one rule per notation.
 */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Lowercased and stripped to letters, digits and `_`, so punctuation cannot
 * break a match.
 *
 * `\p{L}\p{N}` rather than `\w`: `\w` is ASCII-only, so a Greek or Japanese
 * word normalises to the empty string, and two entirely different words then
 * compare equal. `--lang` accepts any language, so that is a live path to
 * deleted speech rather than a hypothetical one.
 */
const normalize = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');

/**
 * How many leading words of `cueWords` repeat the tail of `accumulatedWords`.
 * Ported from the standalone cleaner this tool replaces; the whole of
 * YouTube's rolling-window repetition is what it removes.
 *
 * It has **no minimum match length**, which is exactly why it must never see a
 * manual track: over five manual tracks it scored 13 deletions, all 13 false
 * positives and zero true positives, and no cutoff separates the two classes.
 *
 * A run that normalises to nothing at all — punctuation only — is not a match:
 * every such run compares equal to every other, which is a match on no
 * evidence. `trim`, not `length`, is what tests that, because joining k empty
 * words yields k-1 spaces rather than an empty string.
 */
function overlapSize(accumulatedWords, cueWords) {
  const maxCheck = Math.min(accumulatedWords.length, cueWords.length);

  for (let k = maxCheck; k > 0; k -= 1) {
    const tail = accumulatedWords.slice(-k).map(normalize).join(' ');
    const head = cueWords.slice(0, k).map(normalize).join(' ');
    if (tail === head && tail.trim().length > 0) return k;
  }

  return 0;
}

/**
 * Merges cues into one word stream, dropping each cue's overlap with what came
 * before it. `dedup` is false on manual tracks — forced to zero overlap, not
 * tuned down.
 *
 * A turn start inside the dropped overlap is the marker line of a rolling
 * repeat, so it goes with the overlap; one at or past the overlap is kept, as a
 * position in the merged stream.
 *
 * @param {Array<{ text: string, turnStarts: number[] }>} cues stripped cues
 * @param {{ dedup: boolean }} options
 * @returns {{ words: string[], turnStarts: number[] }} `turnStarts` ascending,
 *   and repeated where a turn held no words
 */
function mergeCues(cues, { dedup }) {
  const words = [];
  const turnStarts = [];

  for (const { text, turnStarts: starts } of cues) {
    const cueWords = text.split(/\s+/).filter(Boolean);
    const overlap = dedup ? overlapSize(words, cueWords) : 0;
    for (const start of starts) {
      if (start >= overlap) turnStarts.push(words.length + start - overlap);
    }
    words.push(...cueWords.slice(overlap));
  }

  return { words, turnStarts };
}

/**
 * Cuts the word stream into turns at the turn starts. A turn with no words —
 * two starts at one position, or one at the very end — is not a turn, so it is
 * dropped here and never counted. Speech before the first start is a turn.
 *
 * @param {string[]} words
 * @param {number[]} turnStarts
 * @returns {string[][]}
 */
function toTurns(words, turnStarts) {
  const cuts = [0, ...turnStarts, words.length];
  const turns = [];

  for (let index = 1; index < cuts.length; index += 1) {
    if (cuts[index] > cuts[index - 1]) turns.push(words.slice(cuts[index - 1], cuts[index]));
  }

  return turns;
}

/**
 * Breaks the word stream at the next sentence end once a paragraph has reached
 * `PARAGRAPH_MIN_WORDS` (ADR-0007). It is given one turn's words at a time, so
 * a paragraph never spans two turns.
 *
 * @param {string[]} words
 * @returns {string[]} paragraphs
 */
function toParagraphs(words) {
  const paragraphs = [];
  let current = [];

  for (const word of words) {
    current.push(word);
    if (current.length >= PARAGRAPH_MIN_WORDS && SENTENCE_END.test(word)) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  }

  if (current.length > 0) paragraphs.push(current.join(' '));
  return paragraphs;
}

/**
 * The whole pipeline.
 *
 * A named track (ADR-0009) takes its notation from the auto table, so `>>`,
 * `>>>` and `[ … ]` are artifacts even on a track that reads as manual, and
 * the credit rule, which is manual notation, does not apply to it. Dedup and
 * the recorded kind (the frontmatter) still follow the classified kind, which
 * is why the notation is chosen apart from it.
 *
 * Under `auto`, ten or more turns make a dialog. `prose` and `dialog` skip
 * that judgement and are honoured whatever the track marks: prose is one turn,
 * and dialog is every turn there is, which on a track with no notation is one.
 *
 * @param {string} rawText the subtitle track exactly as downloaded
 * @param {{ trackKey?: string, layout?: 'auto'|'prose'|'dialog' }} [options]
 *   `trackKey` is the track's key, such as `en-JkeT_87f4cc`; absent when not
 *   known, which is not a named track. `layout` is the one asked for.
 * @returns {{ trackKind: 'auto'|'manual', layout: 'prose'|'dialog',
 *             turns: string[][] }} the layout actually used, and each turn's
 *   paragraphs; prose is a single turn
 */
export function cleanTrack(rawText, { trackKey, layout = 'auto' } = {}) {
  // Classify first: the rule reads raw cue text, and every later branch needs
  // the answer.
  const trackKind = classifyTrack(rawText);

  const cues = parseCues(rawText)
    .map((cue) =>
      cue.lines
        .map((line) => decodeEntities(stripTags(line)).replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);

  // Artifacts come out here, on `cues`, while they are still separate and
  // still indexed: the first/last-cue credit rule reads the index, and the
  // sound-event rule matches within a single cue. The edge is forced — the
  // overlap detection below has no minimum match length, so repeated
  // boilerplate is precisely the repetition it mis-fires on.
  const notation = trackKey !== undefined && isNamedTrack(trackKey) ? 'auto' : trackKind;
  const spoken = stripArtifacts(cues, notation);

  const { words, turnStarts } = mergeCues(spoken, { dedup: trackKind === 'auto' });
  const turns = toTurns(words, turnStarts);

  const used = layout === 'auto' ? (turns.length >= DIALOG_MIN_TURNS ? 'dialog' : 'prose') : layout;
  if (used === 'dialog') return { trackKind, layout: used, turns: turns.map(toParagraphs) };

  return { trackKind, layout: used, turns: words.length > 0 ? [toParagraphs(words)] : [] };
}
