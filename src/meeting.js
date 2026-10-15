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
 * Either end of a WebVTT voice tag: what changes who is speaking inside a cue.
 * An opening, `<v Name>`, allows classes (`<v.loud Name>`) and captures the
 * name, which runs to the closing `>` and may hold spaces and any other
 * punctuation. The closing, `</v>`, leaves no one speaking.
 */
const VOICE_BOUNDARY = /<v(?:\.[^\s>]*)*\s+([^>]*)>|<\/v>/gi;

/** The words of a stretch of cue text, tags stripped and artifacts out as for an auto track. */
function wordsOf(text) {
  const lines = text
    .split('\n')
    .map((line) => collapse(decodeEntities(stripTags(line))))
    .filter(Boolean);
  const [{ text: spoken = '' } = {}] = stripArtifacts([lines], 'auto');
  return spoken.split(' ').filter(Boolean);
}

/**
 * One cue's speech, as one segment per speaker, in the order of their voice
 * tags. A cue usually has one tag, but when people join or leave a meeting
 * Teams puts several in one cue, and each speaker is credited with the text
 * inside their own tag. Text outside any tag has no speaker, and adjacent
 * stretches by the same speaker are one segment.
 *
 * @returns {Array<{ speaker: string|null, words: string[] }>}
 */
function readCue(cue) {
  const text = cue.lines.join('\n');
  const segments = [];
  let speaker = null;
  let from = 0;

  const take = (to) => {
    const words = wordsOf(text.slice(from, to));
    if (words.length === 0) return;
    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker) last.words.push(...words);
    else segments.push({ speaker, words });
  };

  for (const boundary of text.matchAll(VOICE_BOUNDARY)) {
    take(boundary.index);
    speaker = boundary[1] === undefined ? null : collapse(decodeEntities(boundary[1])) || null;
    from = boundary.index + boundary[0].length;
  }
  take(text.length);

  return segments;
}

/**
 * Rejoins each utterance's parts in part order, wherever in the file they
 * sit, and orders the utterances by where their first cue appears. A cue with
 * no such id is an utterance of its own. An utterance with no words is not one.
 * An utterance whose cues credit several speakers comes out as one entry per
 * speaker, in tag order.
 *
 * @returns {Array<{ speaker: string|null, words: string[] }>}
 */
function rebuildUtterances(cues) {
  const utterances = new Map();

  for (const [position, cue] of cues.entries()) {
    const match = UTTERANCE_ID.exec(cue.id ?? '');
    const key = match ? match[1] : `cue ${position}`;
    if (!utterances.has(key)) utterances.set(key, []);
    utterances.get(key).push({ part: match ? Number(match[2]) : 0, position, segments: readCue(cue) });
  }

  // An utterance whose cues name several speakers comes out as one entry per
  // speaker, in order; the entries of one speaker next to each other are one.
  return [...utterances.values()].flatMap((parts) => {
    parts.sort((a, b) => a.part - b.part || a.position - b.position);
    const runs = [];
    for (const segment of parts.flatMap((part) => part.segments)) {
      const last = runs[runs.length - 1];
      if (last && last.speaker === segment.speaker) last.words.push(...segment.words);
      else runs.push({ speaker: segment.speaker, words: [...segment.words] });
    }
    return runs;
  });
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
