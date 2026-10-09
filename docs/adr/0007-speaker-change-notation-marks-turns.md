# Speaker-change notation marks turns, and ten of them make a dialog

Every transcript used to be prose, and speaker-change notation was an artifact that was thrown
away. A video with more than one speaker is now laid out as a dialog. The notation is still
removed as text, but it first marks where one turn ends and the next begins.

**A track is a dialog when it carries 10 or more speaker-change turns. Otherwise it is prose.**
On an auto track the marker is a leading `>>`, and a turn that holds only a sound event (such as
`>> [music]`) doesn't count. On a manual track the marker is a leading `- `, and `- ...` continues
the current turn rather than starting a new one. Each turn opens with an em dash. No speaker is
named, because no track names its speakers reliably.

The threshold comes from the survey in `archive/research/subtitle-speaker-notation.md`. The
highest count on a recent single-speaker auto track was 5, from embedded clips and laughter. The
lowest on a recent multi-speaker one was 81.

## Considered options

- **Turns per hour instead of a count.** Rejected: the rates overlap (52 per hour on a solo
  video, 64 on a multi-speaker one).
- **Name speakers from `NAME:` labels on manual tracks** (TED's `CA:`). Rejected: look-alikes
  such as `Translator:` and `Guilt:` appear on single-speaker tracks. These labels stay in the text
  verbatim, as before.
- **Labels such as `Speaker A` / `Speaker B`.** Rejected: they would claim identities the
  track doesn't carry, and they become wrong once a third speaker joins.
- **Fold short interjections into the previous turn.** Rejected: it would put one speaker's
  "Yeah." inside the other speaker's sentence. Every turn that still has words after its
  artifacts are removed is kept.

## Consequences

- A dialog is only as good as its markers. On a recent auto track, only about 57% of `>>` turns
  line up with the turns on a manual track of the same audio. Some `>>` turns are the same
  speaker resuming after an interjection.
- Multi-speaker videos with no markers stay prose. That covers auto tracks uploaded before
  about mid-2025, manual tracks without `- `, and every X track.
- A turn never shares a paragraph with the next turn. A long turn still splits into paragraphs.
- The paragraph minimum rises from 100 to 130 words for both layouts, so a prose transcript
  comes out differently the next time it is fetched.
- Detection can be overridden with `--layout prose|dialog`. The default, `auto`, applies the
  threshold above. Frontmatter records the layout actually used.
