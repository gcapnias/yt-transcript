# Named tracks are English too, and write their artifacts the auto way

YouTube can list a manual track under a track name as well as its language, so one video carries
several tracks in one language. `yt-dlp` keys each by YouTube's track id: `English - CC1` becomes
`en-uYU-mmqFLq8`, `English - DTVCC1` becomes `en-JkeT_87f4cc`. The default English (ADR-0006)
asked for exact keys, so it never fetched these, and settled for an auto track or nothing. On
`ilmBGeGldrI` the transcript opened with speech recognition of the pre-show music ("Heat. Heat.
N.") while two human caption tracks went unused. Seen in #14. In a sample of 22 videos, 9 live
recordings (Microsoft, GitHub, NASA) carried both, under the same two keys, and no ordinary upload
did (`archive/research/youtube-suffixed-caption-track-ids.md`).

**For the default `--lang en`, the same invocation also asks for `en-[A-Za-z0-9_-]{11}`, and a
track whose key is a language plus an 11-character id is a named track, however it was asked
for.** Within a kind, named tracks rank after `en`, `en-orig`, `en-US` and `en-GB`. A named track
is manual in every respect but one: it writes its artifacts the way an auto track does, so a
leading `>>` or `>>>` marks a speaker change and a `[…]` sound event is removed. The auto speaker
marker is widened to `>>` or `>>>` as well.

- **When a manual track is passed over for another, a single-video fetch says so,** naming each
  and the `--lang` that would select it. Any other `--lang` is matched exactly, so
  `--lang en-JkeT_87f4cc` already works; the hint only makes it findable.
- **Kind still outranks everything.** CC1 carries `<c>` timing tags and reads as auto, so DTVCC1,
  which reads as manual, wins wherever both exist, which is everywhere they were seen.

## Considered options

- **The two known keys exactly.** Rejected: bulletproof, but blind to any other named track, such
  as a user-named one (`en-1JJtFDtHuZg`, "French Speakers Only", seen on `wsQiKKfKxug`).
- **Rank named manual tracks above a plain manual `en`.** Rejected: it fixes `nlGqajJEsWs`, whose
  plain manual `en` is junk, but on any ordinary video carrying both it prefers a side track over
  the main one with no evidence that is better. The hint covers that case instead.
- **Read `>>` on every manual track.** Rejected: ADR-0007 keeps notation per kind on purpose, and
  the evidence is only about named tracks.
- **Classify CC1 as manual.** Rejected for now: as auto it already cleans correctly (rolling
  repetition removed, markers stripped), and it has never been seen without DTVCC1.

## Consequences

- The pattern rests on an observed length. The suffix is YouTube's, probably a hash of the track
  name, and nothing guarantees 11 characters. A translation keyed `en-` plus an 11-character
  language code (`en-yue-Hant-TW`) would match; none has been seen, and as an auto track it would
  rank last.
- Notation now depends on the track's key as well as its kind. ADR-0007's notation table holds
  for every track that is not named.
- A video with only CC1 would record `subtitles: auto` for a human-made track. Never seen.
- `nlGqajJEsWs` (Build 2026, day 2) still gets its junk plain `en`; the hint names the named
  tracks and the `--lang` for them.
- Verified against `yt-dlp` 2026.08.19.
