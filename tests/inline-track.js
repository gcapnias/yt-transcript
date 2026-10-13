/**
 * Helpers for tests that write a subtitle track inline and render it into a
 * transcript, so no test needs a fixture file or the network to do it.
 */

import { renderTranscript } from '../src/transcript.js';

export const METADATA = {
  title: 'OpenAI Codex Crash Course – Build & Deploy Apps with Autonomous AI',
  channel: 'freeCodeCamp.org',
  duration: '41:18',
  uploadDate: '20260910',
};

export const URL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';

const FETCHED_AT = new Date('2026-09-16T14:03:05.123Z');

/**
 * Builds a subtitle track from cues, each cue one line or a list of lines.
 * `auto` decides which track kind the classifier will read out of the body,
 * using the same two signals a real track carries: `<c>` word-timing tags and
 * `align:start position:0%`. Tags are stripped before anything reads the text,
 * so the cue text that comes out is exactly what the test wrote.
 */
export function track(cues, { auto = false } = {}) {
  const stamp = (n) => `00:00:${String(n).padStart(2, '0')}.000`;
  const settings = auto ? ' align:start position:0%' : '';
  const written = cues.map((lines, index) => {
    const text = [lines].flat().join('\n');
    const body = auto ? text.replace(/(\s)(\S+)$/, '$1<00:00:00.500><c>$2</c>') : text;
    return `${stamp(index)} --> ${stamp(index + 1)}${settings}\n${body}`;
  });
  return `WEBVTT\nKind: captions\nLanguage: en\n\n${written.join('\n\n')}\n`;
}

/** Renders a track as the video at `URL`, with `overrides` on any input. */
export function render(trackText, overrides = {}) {
  return renderTranscript({
    trackText,
    url: URL,
    videoId: 'o3CX_Y59_74',
    metadata: METADATA,
    fetchedAt: FETCHED_AT,
    ...overrides,
  });
}

/** A transcript's body: everything after the frontmatter, trailing newline and all. */
export const body = (contents) => contents.split(/\n---\n\n/)[1];
