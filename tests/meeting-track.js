/**
 * Helpers for tests that write a Teams-style meeting track inline. Every name
 * and word is made up: the real exports are private, and this repo is public.
 */

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** `65` -> `00:01:05.000`; seconds may carry a fraction. */
export function stamp(seconds) {
  const whole = Math.floor(seconds);
  const millis = Math.round((seconds - whole) * 1000);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(whole % 60)}.${pad(millis, 3)}`;
}

export const UUID = '6643a258-c876-41b2-a09f-1bb4a515992a';

/**
 * One cue as Teams writes it: an id line, a timing line, then the text, wrapped
 * in a voice tag when it has a speaker.
 *
 * @param {{ id?: string, start: number, end: number, speaker?: string, text: string }} cue
 *   `id` is `<utterance>-<part>` and gets the uuid put in front of it
 */
export function cue({ id, start, end, speaker, text }) {
  const body = speaker === undefined ? text : `<v ${speaker}>${text}</v>`;
  return `${id === undefined ? '' : `${UUID}/${id}\n`}${stamp(start)} --> ${stamp(end)}\n${body}`;
}

/** A whole track: the header, then every cue, in the order given. */
export function meetingTrack(cues) {
  return `WEBVTT\n\n${cues.map(cue).join('\n\n')}\n`;
}
