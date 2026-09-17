/**
 * The cleaning pipeline: a subtitle track in, prose paragraphs out.
 *
 *   load -> classify -> strip tags -> decode entities -> dedup (auto only) -> paragraph
 *
 * Three of those edges are forced rather than stylistic, and the comments
 * below say which. Artifact stripping is deliberately absent: it belongs to
 * ytdlp-xmu.3 and slots in where this file says so, between entity decoding
 * and dedup.
 *
 * Timing is not used at all. Inter-cue gaps are exactly 0ms on every auto
 * track measured, so no pause threshold can ever fire; `tests/subtitle-track.test.js`
 * holds that measurement. The paragraph signal is YouTube's own ASR
 * punctuation, and the cleaner never inserts a period.
 */

import { classifyTrack, parseCues } from './subtitle-track.js';

/** Settled across every speaker tested, and hard-coded by decision, not a flag. */
export const PARAGRAPH_MIN_WORDS = 100;

/** A word ends a sentence, allowing one closing quote or bracket after the stop. */
const SENTENCE_END = /[.!?]["')\]]?$/;

/**
 * Removes inline markup: `<c>` word-timing tags, their closers, and the
 * `<00:00:01.200>` timestamps between them.
 */
export function stripTags(text) {
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
export function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/** Lowercased and stripped to word characters, so punctuation cannot break a match. */
const normalize = (word) => word.toLowerCase().replace(/[^\w]/g, '');

/**
 * How many leading words of `cueWords` repeat the tail of `accumulatedWords`.
 * Ported verbatim from `clean-transcript.js`; the whole of YouTube's
 * rolling-window repetition is what it removes.
 *
 * It has **no minimum match length**, which is exactly why it must never see a
 * manual track: over five manual tracks it scored 13 deletions, all 13 false
 * positives and zero true positives, and no cutoff separates the two classes.
 */
export function overlapSize(accumulatedWords, cueWords) {
  const maxCheck = Math.min(accumulatedWords.length, cueWords.length);

  for (let k = maxCheck; k > 0; k -= 1) {
    const tail = accumulatedWords.slice(-k).map(normalize).join(' ');
    const head = cueWords.slice(0, k).map(normalize).join(' ');
    if (tail === head && tail.length > 0) return k;
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
export function mergeCues(cues, { dedup }) {
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
 * `PARAGRAPH_MIN_WORDS`. Ported from `prototype/paragraph-rules`, where 100
 * beat every timing-based candidate on all eight tracks.
 *
 * @param {string[]} words
 * @returns {string[]} paragraphs
 */
export function toParagraphs(words) {
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
 * @returns {{ kind: 'auto'|'manual', paragraphs: string[] }}
 */
export function cleanTrack(rawText) {
  // Classify first: the rule reads raw cue text, and every later branch needs
  // the answer.
  const kind = classifyTrack(rawText);

  const cues = parseCues(rawText)
    .map((cue) =>
      cue.lines
        .map((line) => decodeEntities(stripTags(line)).replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);

  // ytdlp-xmu.3 strips artifacts here, on `cues`, before dedup: the cues are
  // still separate and still indexed, which its first/last-cue credit rule and
  // its within-a-single-cue sound-event rule both need. The edge is forced —
  // the overlap detection below has no minimum match length, so repeated
  // boilerplate is precisely the repetition it mis-fires on.

  return { kind, paragraphs: toParagraphs(mergeCues(cues, { dedup: kind === 'auto' })) };
}
