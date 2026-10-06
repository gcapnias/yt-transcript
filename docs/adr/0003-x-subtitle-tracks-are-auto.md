# X subtitle tracks are always recorded as `auto`

X serves one subtitle track per video, and `yt-dlp` lists it under `subtitles`, the slot YouTube
uses for human-authored tracks, not under `automatic_captions`. Our own content check agrees with
`yt-dlp`, because its `auto` signal is YouTube's `<c>` word-timing markup, which X does not use.
**We record every X track as `subtitles: auto` anyway**, because it is speech recognition. Every
cue carries X's own per-word timing markup (`<X-word-ms ms=… character_ranges=…>`), and the text
has typical recognition errors: on the first post examined, "Potato" for the handle *poteto*, and
"Grokbot".

## Considered options

- **Trust `yt-dlp`'s listing, or our content check.** Rejected: both say `manual`, which would
  label a machine transcription as human-authored. That is the one claim the `subtitles` key
  exists to get right.
- **Teach the content check to treat `X-word-ms` markup as an auto signal.** Rejected as the rule
  itself: it ties the label to markup X could change at any time, whereas the rule is that X
  publishes no human-authored tracks at all.
- **Decide by site: every X track is `auto`.** Chosen.

## Consequences

- If X ever starts serving human-authored captions, they will be labelled `auto` until this
  decision is revisited. Transcripts already on disk cannot be relabelled after the fact.
- On an X transcript, `subtitles: auto` contradicts what `yt-dlp -J` reports. That reads as a bug
  until you know this was deliberate, which is why this record exists.
- The label records where the track came from. It does not decide how the track is cleaned.
  Cleaning still follows what the track looks like, which for X is manual. The auto cleaning
  rules are built for YouTube's rolling captions, and they lose speech on X: cleaning the
  recorded X fixture as auto drops 1 of its 261 words. A fixture test checks that cleaning an X
  track loses no word.
