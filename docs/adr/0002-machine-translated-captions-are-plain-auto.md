# Machine-translated captions are accepted and recorded as plain `auto`

YouTube auto-translates its auto captions into roughly 160 languages, so fetching a Spanish-language
video with the default `--lang en` can yield a machine translation of Spanish speech rather than
nothing. **When such a track is obtainable we accept it**, recording it in frontmatter as plain
`subtitles: auto` — identical to a transcript of a genuinely English-spoken video. A transcript
therefore cannot say what language was actually spoken. In practice the track usually is *not*
obtainable: YouTube's translation endpoint reliably returns HTTP 429, so most attempts fail as an
ordinary rate-limited fetch. Declining to ask anyway would convert a sometimes-succeeding path into
a never-succeeding one.

## Considered options

- **Refuse translated tracks.** Rejected: it turns a usable transcript into a hard failure, and
  detecting the case reliably requires a `-J` pre-flight we dropped for cost.
- **Mark them — `subtitles: auto-translated`, or an eighth key naming the source language.**
  Rejected: it reopens the deliberately closed seven-key frontmatter contract, and the marking is
  worth little in practice because the tool only ever retrieves English and never surfaces,
  names, or suggests the original language.
- **Accept unmarked.** Chosen. The frontmatter contract stays shut and the common case — English
  videos — is unaffected.

## Consequences

- **Hard to reverse.** Marking translations later needs a new frontmatter key *and* every
  transcript already on disk is unmarked and indistinguishable from a genuine English one; there is
  no migration that can recover the truth.
- `subtitles: auto` on a transcript of a non-English video reads as a bug until you know this was
  deliberate. That is the whole reason this record exists.
- Largely moot in practice: translated tracks reliably return HTTP 429, so most attempts to fetch
  one fail as an ordinary rate-limited fetch rather than producing a translated transcript.
- Consequently the `<c>`-tag rule that classifies `manual` vs `auto` is unverified against
  auto-*translated* tracks — they could not be downloaded at all. The same 429 wall means every
  reachable input falls into one of the two verified classes.
