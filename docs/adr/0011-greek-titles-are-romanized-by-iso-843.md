# Greek titles are romanized by ISO 843, and a meeting's identity holds across files

A slug kept only Latin letters, so a Greek title fell back: a video to its id, an X post to
`<handle>-<post id>`, a meeting to `meeting-<YYYYMMDD>` of its file's modification date. The
meeting fallback broke ADR-0010's promise that transcribing the same file again overwrites its
transcript: a re-downloaded export has a new date, so it got a new filename and the old copy
stayed. The store also decided ownership in two inconsistent ways and checked only one filename.
Seen in the review of PR #18.

**Greek letters in a title or handle are romanized by ISO 843 Type 2 (transcription, the system
of ELOT 743, Greek passports and the UN), folded to ASCII, before a slug or channel folder is
made of them.** `Συνάντηση ομάδας` becomes `synantisi-omadas`, `Ευάγγελος` becomes `evangelos`,
`ΑΥΤΟΚΙΝΗΤΟ` becomes `aftokinito`. Only Greek is romanized; every other non-Latin script is still
dropped.

- **The context rules read accents and diaereses before they are stripped.** Whether `αυ`, `ευ`,
  `ηυ` or `ου` is a digraph depends on them (`άυλος` is `aylos`, `αύλος` is `avlos`), and `μπ`
  and a final `αυ` or `ευ` depend on where a word ends. A word, for those rules, is a run of Greek
  letters.
- **The retention rule is measured against the romanized title**, so a digraph (`θ` to `th`)
  cannot make a lossy slug look faithful.
- **A meeting whose slug is still empty or too lossy is refused**: nothing is written and the
  command fails, naming the file and asking for it to be renamed. A meeting has no fallback name.
  A video keeps its video id, and an X post its `<handle>-<post id>`.
- **A meeting has one transcript.** Writing a meeting removes every other meeting in the
  `meetings` folder with the same title, after the write succeeds, as writing a video removes
  every other copy with the same `url`. A video in that folder is never removed.
- **A video never overwrites a meeting.** A video whose filename holds a meeting is treated as a
  collision, the same as one holding another video.
- **A collision is suffixed until the filename is free or already holds the same transcript**:
  `<slug>-<collision id>.md`, then `<slug>-<collision id>-2.md`, `-3`, and so on. Each step is
  checked the way the first filename is, including that a file whose frontmatter cannot be read
  is overwritten.

## Considered options

- **ISO 843 Type 1 (transliteration).** Rejected: it is reversible only with its macrons (`η` to
  `ī`), which a slug strips, and without them it gives forms no Greek reader writes:
  `euangelos`, `autokinito`, `mpampas`.
- **Romanize meeting titles only.** Rejected: a Greek video title has the same problem, and one
  slug rule is easier to reason about than two.
- **A stable fallback for a meeting, `meeting-<title hash>`.** Rejected: the maintainer wants no
  meeting filed under a name that does not say what it is. Renaming the file is the remedy.
- **Fail when a suffixed filename is taken too.** Rejected for numbered suffixes: the collision
  takes deliberate effort to reach, and a write should still succeed.

## Consequences

- Supersedes ADR-0010's `meeting-<YYYYMMDD>` slug and its "a meeting never removes another
  transcript", and ADR-0008's fallback to the channel id for a Greek handle.
- Existing files move one at a time, the next time each is fetched or transcribed: a Greek video
  named by its id moves to its romanized slug, and a `meeting-<YYYYMMDD>.md` is removed when that
  meeting is transcribed again. There is no migration command.
- A renamed export is still a different meeting (ADR-0010).
