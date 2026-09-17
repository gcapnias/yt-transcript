/**
 * The cleaning pipeline: a subtitle track in, prose paragraphs out.
 *
 *   load -> classify -> strip tags -> decode entities -> strip artifacts
 *        -> dedup (auto only) -> paragraph
 *
 * Three of those edges are forced rather than stylistic, and the comments
 * below say which. The artifact rules themselves live in `./artifacts.js`;
 * what this file settles is where they run.
 *
 * Timing is not used at all. Inter-cue gaps are exactly 0ms on every auto
 * track measured, so no pause threshold can ever fire; `tests/subtitle-track.test.js`
 * holds that measurement. The paragraph signal is YouTube's own ASR
 * punctuation, and the cleaner never inserts a period.
 */

import { stripArtifacts } from './artifacts.js';
import { classifyTrack, parseCues } from './subtitle-track.js';

/** Settled across every speaker tested, and hard-coded by decision, not a flag. */
const PARAGRAPH_MIN_WORDS = 100;

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
 * is what lets ytdlp-xmu.3 write one rule per notation.
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
 * Ported from `clean-transcript.js`; the whole of YouTube's rolling-window
 * repetition is what it removes.
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
 * @param {string[][]} cues cue lines, already stripped and decoded
 * @param {{ dedup: boolean }} options
 * @returns {string[]}
 */
function mergeCues(cues, { dedup }) {
  const words = [];

  for (const lines of cues) {
    const cueWords = lines.join(' ').split(/\s+/).filter(Boolean);
    if (cueWords.length === 0) continue;
    words.push(...cueWords.slice(dedup ? overlapSize(words, cueWords) : 0));
  }

  return words;
}

/**
 * Breaks the word stream at the next sentence end once a paragraph has reached
 * `PARAGRAPH_MIN_WORDS`. Ported from branch `prototype/paragraph-rules`, where 100
 * beat every timing-based candidate on all eight tracks.
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
 * @param {string} rawText the subtitle track exactly as downloaded
 * @returns {{ trackKind: 'auto'|'manual', paragraphs: string[] }}
 */
export function cleanTrack(rawText) {
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
  const spoken = stripArtifacts(cues, trackKind);

  return { trackKind, paragraphs: toParagraphs(mergeCues(spoken, { dedup: trackKind === 'auto' })) };
}
