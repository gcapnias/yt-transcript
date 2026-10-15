# Meetings are transcribed from a local file into a meeting layout of named turns

Microsoft Teams exports a meeting's speech recognition as a `.vtt` file. Unlike any YouTube or X
track, it names the speaker of every cue with a WebVTT voice tag (`<v Name>…</v>`). Today's
cleaning strips that tag along with every other, so the file comes out as prose with every speaker
lost. Seen in #15. A prototype (branch `prototype/15-teams-dialog`) rebuilt two 30-minute,
6-speaker meetings into named turns with no word lost, and the maintainer read both as correct.

**A path ending in `.vtt` is a meeting, transcribed from that file without yt-dlp, and laid out as
a third layout, `meeting`: turns that open with an em dash and the speaker's name in bold.** The
transcript is filed in a `meetings` folder beside the channel folders and listed in the catalog.

- **Teams splits an utterance into numbered parts** (`<uuid>/<utterance>-<part>`), and other
  speakers' cues can sit between them. The parts are joined back together, and utterances are
  ordered by where their first part appears in the file, never by utterance number, which goes
  backwards in file order (58 and 42 times in the two samples).
- **Consecutive utterances by one named speaker form one turn.** An utterance with no named
  speaker is an unnamed turn of its own. A meeting whose track names no one is laid out as a
  dialog, like a video whose track marks changes of speaker. Every turn is kept, as in ADR-0007.
- **No rolling-repetition dedup runs on a meeting.** A repeated word in a meeting was spoken
  twice. Artifact stripping runs as for an auto track; on both samples it removed nothing.
- **A meeting's track is auto**: it is speech recognition, and the glossary has only two kinds.
- **`;` ends a sentence in the meeting layout only.** Teams writes the Greek question mark as a
  plain `;`. Counting it in prose or dialog would re-paragraph English tracks.
- **Frontmatter:** `title` is the file name without `.vtt`. `url` is omitted and `channel` is
  empty. `duration` is estimated from the last cue's end. `upload_date` is the file's modification
  date. `subtitles` is `auto` and `layout` is `meeting`. `--lang` is not checked.

## Considered options

- **Lay a meeting out as a dialog**, with the existing unnamed em-dash turns. Rejected: it throws
  away the one thing a meeting track has that no other track does.
- **Name speakers in dialog** rather than adding a layout. Rejected: a dialog's turns come from
  notation that never names anyone (ADR-0007), and the two would be indistinguishable in
  frontmatter.
- **Record the track as `manual`**, which is what the existing kind classifier reads a Teams file
  as. Rejected: the text is machine speech recognition, which the glossary calls auto.
- **File meetings in `unknown-channel`**, which a transcript with no channel already falls into.
  Rejected: meetings are their own collection, not videos missing a channel.
- **Recognize a local file only when it exists**, and send anything else to the URL parser.
  Rejected: a mistyped path would fail with a URL error instead of "file not found".

## Consequences

- The transcript contract widens: a transcript may lack `url` and `duration`, and its `channel`
  may be empty. The catalog reads such a transcript without error.
- `upload_date` is when the file was saved, which for a downloaded export is the download, not
  the meeting.
- Speaker names are written verbatim, so meeting transcripts carry personal names. The repo is
  public, so test fixtures must be synthetic.
- A channel whose handle is `@meetings` would share the `meetings` folder. `unknown-channel`
  already carries the same risk.
- Only Teams exports were seen. Voice tags from other sources, SRT, and Teams `.docx` exports are
  not covered.
