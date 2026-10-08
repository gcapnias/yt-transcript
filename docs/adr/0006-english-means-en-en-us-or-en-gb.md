# English means `en`, `en-US` or `en-GB`, and the tool picks the track

The spec matched `--lang` exactly and left choosing a track to `yt-dlp`, accepting that a video
whose only English is a regional variant would report "no subtitles". In practice it reports
something worse. On such a video `--sub-langs en` selects YouTube's machine-translated `en` auto
track, which reliably returns HTTP 429 (ADR-0002), so the fetch is retried for about a minute and
then blames rate limiting, while a manual `en-US` track sits unused. Seen on `QIHnmqYU614`, and on
more videos over time.

**For the default `--lang en`, one invocation asks for `en,en-US,en-GB` with `--ignore-errors`,
and the tool chooses among whatever arrives:** manual over auto, then `en`, `en-US`, `en-GB` in
that order. Any other `--lang` is still matched exactly. The same invocation serves X posts, whose
single `en` track is fetched byte-identically.

- **`--ignore-errors` is load-bearing.** Without it, the first track that fails (`en`, with a 429)
  aborts the run before `en-US` is attempted, and nothing is written. With it, the failure becomes
  a `WARNING`, the run exits 0, and the remaining languages are still fetched. Extractor errors
  (unavailable, private, login required, X's "no video in this tweet") still exit 1 with `ERROR`,
  so their classification is unchanged.
- **A partial failure is a success.** If any track was written, the fetch succeeds and the failed
  alternatives are not reported.
- **A 429 is read from stderr when nothing arrives.** A zero exit with no track is `rate-limited`
  (retried) when stderr says `Unable to download video subtitles for '…': HTTP Error 429`, and
  `no-subtitles` otherwise.

## Considered options

- **Keep exact matching, and make the failure name `--lang en-US`.** Rejected: the user still has
  to notice and re-run, and the default fails on more and more videos.
- **A regex such as `en-[A-Z]{2}`.** Rejected: `yt-dlp` matches it case-insensitively, so it also
  accepts `en-fr`, English machine-translated from French.
- **Widen every language to its regional variants.** Rejected: English is the only language of
  interest, and a fixed list is easier to reason about than a derived pattern.
- **A second invocation only after the default fails.** Rejected: it pays the 429 and the retry
  ladder first, and the spec keeps a fetch to one invocation.

## Consequences

- This reverses the spec's "no track ranking of our own". `yt-dlp` still prefers the manual track
  within one language; the tool now ranks across languages.
- A YouTube fetch now reads stderr, but only after a zero exit with no track. ADR-0005's "a YouTube
  fetch is still classified by its exit code and track alone" no longer holds in that one case.
- Kind now outranks language, so the `<c>`-tag rule carries more weight. ADR-0002 notes it is
  unverified on auto-translated tracks: a translated `en` with no `<c>` tags would read as manual
  and beat a real manual `en-US`. The 429 wall makes this rare.
- A transcript does not record which variant it came from (`subtitles` stays `manual` or `auto`).
- Verified against `yt-dlp` 2026.08.19; the matching and `--ignore-errors` semantics are in
  `archive/research/yt-dlp-sub-langs-matching-and-ignore-errors.md`.
