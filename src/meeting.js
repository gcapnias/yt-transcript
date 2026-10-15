/**
 * Cleaning a meeting's track: a Teams `.vtt` in, named turns of paragraphs out
 * (ADR-0010).
 *
 *   parse cues -> read speaker -> strip tags -> decode entities -> strip artifacts
 *              -> rebuild utterances -> group into turns -> choose layout -> paragraph
 *
 * It is a separate path from `cleanTrack` because three of that pipeline's
 * rules are wrong for a meeting. Tag stripping would discard the voice tag
 * that names the speaker, rolling-repetition dedup would delete words that
 * were spoken twice, and turns come from named speakers rather than from
 * speaker-change notation. Nothing here changes what a YouTube or X track
 * produces.
 *
 * Timing is read for one thing only: the meeting's length. Order is never
 * taken from it, because Teams' cues overlap during crosstalk.
 */

import { stripArtifacts } from './artifacts.js';
import { decodeEntities, stripTags, toParagraphs } from './clean.js';
import { parseCues } from './subtitle-track.js';

/**
 * A WebVTT voice tag's opening, `<v Name>`, allowing classes (`<v.loud Name>`).
 * The name runs to the closing `>`, so it may hold spaces and any other
 * punctuation.
 */
const VOICE_TAG = /<v(?:\.[^\s>]*)*\s+([^>]*)>/i;

/** Teams' cue id: `<uuid>/<utterance>-<part>`. The uuid and utterance together name the utterance. */
const UTTERANCE_ID = /^(.+\/\d+)-(\d+)$/;

/**
 * A sentence end in a meeting. Teams writes the Greek question mark as a plain
 * `;`, so it counts here and nowhere else: in prose or dialog it would
 * re-paragraph English tracks.
 */
const MEETING_SENTENCE_END = /[.!?;]["')\]]?$/;

const collapse = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * One cue's speaker and words. The speaker comes from the first voice tag,
 * before every tag is stripped; a cue without one has none. Artifacts come out
 * as for an auto track, cue by cue.
 */
function readCue(cue) {
  const speaker = collapse(decodeEntities(VOICE_TAG.exec(cue.lines.join(' '))?.[1] ?? '')) || null;
  const lines = cue.lines
    .map((line) => collapse(decodeEntities(stripTags(line))))
    .filter(Boolean);
  const [{ text = '' } = {}] = stripArtifacts([lines], 'auto');

  return { speaker, words: text.split(' ').filter(Boolean) };
}

/**
 * Rejoins each utterance's parts in part order, wherever in the file they
 * sit, and orders the utterances by where their first cue appears. A cue with
 * no such id is an utterance of its own. An utterance with no words is not one.
 *
 * @returns {Array<{ speaker: string|null, words: string[] }>}
 */
function rebuildUtterances(cues) {
  const utterances = new Map();

  for (const [position, cue] of cues.entries()) {
    const match = UTTERANCE_ID.exec(cue.id ?? '');
    const key = match ? match[1] : `cue ${position}`;
    if (!utterances.has(key)) utterances.set(key, []);
    utterances.get(key).push({ part: match ? Number(match[2]) : 0, position, ...readCue(cue) });
  }

  return [...utterances.values()]
    .map((parts) => {
      parts.sort((a, b) => a.part - b.part || a.position - b.position);
      return {
        speaker: parts.find((part) => part.speaker)?.speaker ?? null,
        words: parts.flatMap((part) => part.words),
      };
    })
    .filter((utterance) => utterance.words.length > 0);
}

/**
 * Consecutive utterances by one named speaker form one turn; an utterance with
 * no speaker is a turn of its own. Every turn is kept, a one-word reply
 * included (ADR-0007).
 */
function toTurns(utterances) {
  const turns = [];

  for (const { speaker, words } of utterances) {
    const last = turns[turns.length - 1];
    if (speaker && last?.speaker === speaker) last.words.push(...words);
    else turns.push({ speaker, words: [...words] });
  }

  return turns;
}

/**
 * The layout used for the one asked for. A track that names a speaker is a
 * meeting, one that names none is a dialog, and `prose` and `dialog` are
 * honoured as asked.
 */
function chooseLayout(requested, named) {
  if (requested === 'prose' || requested === 'dialog') return requested;
  return named ? 'meeting' : 'dialog';
}

/**
 * @param {number} ms
 * @returns {string} `M:SS` under an hour, `H:MM:SS` from one: the shape yt-dlp
 *   reports a video's duration in
 */
function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * The whole path.
 *
 * @param {string} rawText the meeting's track exactly as exported
 * @param {{ layout?: 'auto'|'prose'|'dialog'|'meeting' }} [options] the layout
 *   asked for; `auto` and `meeting` both mean "name the speakers if there are
 *   any"
 * @returns {{ layout: 'prose'|'dialog'|'meeting', duration: string|null,
 *             turns: Array<{ speaker: string|null, paragraphs: string[] }> }}
 *   `speaker` is set only in the meeting layout. `duration` is the latest cue
 *   end, null when the file has no cues.
 */
export function cleanMeeting(rawText, { layout = 'auto' } = {}) {
  const cues = parseCues(rawText, { ids: true });
  const utterances = rebuildUtterances(cues);
  const chosen = chooseLayout(
    layout,
    utterances.some((utterance) => utterance.speaker),
  );

  // Prose is every utterance's words as one run; the others are turns.
  const turns =
    chosen === 'prose'
      ? [{ speaker: null, words: utterances.flatMap((utterance) => utterance.words) }]
      : toTurns(utterances);
  const sentenceEnd = chosen === 'meeting' ? MEETING_SENTENCE_END : undefined;

  return {
    layout: chosen,
    duration: cues.length > 0 ? formatDuration(Math.max(...cues.map((cue) => cue.endMs))) : null,
    turns: turns
      .filter((turn) => turn.words.length > 0)
      .map(({ speaker, words }) => ({
        speaker: chosen === 'meeting' ? speaker : null,
        paragraphs: toParagraphs(words, sentenceEnd),
      })),
  };
}
