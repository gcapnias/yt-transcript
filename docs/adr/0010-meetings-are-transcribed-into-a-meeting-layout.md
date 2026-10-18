# Meetings are transcribed from a local file into a meeting layout of named turns

> Partly superseded by [ADR-0011](0011-greek-titles-are-romanized-by-iso-843.md): a meeting's
> title is romanized from Greek and has no `meeting-<YYYYMMDD>` fallback, and writing a meeting
> removes its other same-title copies.

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
  `--layout prose` drops the names into one run of paragraphs, and `--layout dialog` keeps the
  turns but not the names. `--layout meeting` is refused for a video, before yt-dlp runs.
- **No rolling-repetition dedup runs on a meeting.** A repeated word in a meeting was spoken
  twice. Artifact stripping runs as for an auto track; on both samples it removed nothing.
- **A meeting's track is auto**: it is speech recognition, and the glossary has only two kinds.
- **`;` ends a sentence in the meeting layout only.** Teams writes the Greek question mark as a
  plain `;`. Counting it in prose or dialog would re-paragraph English tracks.
- **Frontmatter:** `title` is the file name without `.vtt`. `url` is omitted and `channel` is
  empty. `duration` is the latest cue end (cues overlap, so not the last one in the file), written
  `M:SS` under an hour and `H:MM:SS` from one, and omitted when the file has no cues. `upload_date`
  is the file's modification time, as a date in the machine's own calendar. `subtitles` is `auto`
  and `layout` is `meeting`, or `dialog` for a track naming no one. `--lang` is not checked.
- **Identity is the title, not a URL.** A meeting has no `url` to identify it by, so the store
  identifies it by its `title`: transcribing the same file again overwrites its transcript, and a
  different title that kebab-cases to the same slug is kept under the slug plus the first eight
  hex characters of the title's SHA-1. A meeting never removes another transcript, a video never
  overwrites a meeting, and a meeting never overwrites a video. The slug of a title with no Latin
  letters is `meeting-<YYYYMMDD>` of the file's date.
- **A cue may name several speakers.** When people join or leave, Teams puts several voice tags in
  one cue. Each speaker is credited with the text inside their own tag, in the order of the tags,
  and consecutive utterances by one speaker still form one turn. Text outside any tag has no
  speaker. Neither sample has such a cue.
- **The catalog still requires all seven keys of a video's transcript, and excuses a meeting two.**
  A transcript in the `meetings` folder with no `url` is a meeting, and is not flagged incomplete
  for lacking `url`, or for lacking `duration` (its file had no cues). A video transcript missing
  either, or any transcript with no `url` outside `meetings`, is still flagged for re-download. The
  folder is part of the test because the missing key alone cannot tell a meeting from an
  incomplete video. A meeting is never in a batch's skip set.

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
- **Settle a slug collision exactly as in a channel folder.** Rejected: that rule tells two
  transcripts apart by `url`, which a meeting lacks, so the title stands in for it.
- **Tell a meeting from a video by its missing `url` alone.** Rejected: a video transcript that
  lost its `url` would be excused instead of flagged for re-download. The folder decides too.
- **Credit a cue with several voice tags to its first speaker.** Rejected: the maintainer
  confirmed Teams writes such cues when people join or leave, and each speaker must be kept.

## Consequences

- The transcript contract widens, for meetings only: a transcript in `meetings` may lack `url`
  and `duration`, and its `channel` may be empty. The catalog reads such a transcript without
  error, and holds every video transcript to all seven keys as before.
- `upload_date` is when the file was saved, which for a downloaded export is the download, not
  the meeting.
- Because the title is the identity, renaming an export and transcribing it again makes a second
  transcript beside the first rather than replacing it. Two exports whose names have no Latin
  letters, saved the same day, share the `meeting-<YYYYMMDD>` slug and are told apart by the hash.
- "Every word appears exactly once" holds only for speech that is not artifact notation. A
  speaker heard saying a literal `>>` or a bracketed `[music]` would lose it to artifact
  stripping. That is accepted; neither sample had any.
- Speaker names are written verbatim, so meeting transcripts carry personal names. The repo is
  public, so test fixtures must be synthetic.
- A channel whose handle is `@meetings` would share the `meetings` folder. `unknown-channel`
  already carries the same risk.
- Only Teams exports were seen. Voice tags from other sources, SRT, and Teams `.docx` exports are
  not covered.
