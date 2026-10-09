# How subtitle tracks mark speaker changes and speaker identity (gcapnias/yt-transcript#11)

Research date: 2026-10-09. yt-dlp 2026.08.19, `--js-runtimes node`. The primary evidence is the subtitle files themselves; nobody documents these conventions, so there is no spec to cite. Everything below was measured on tracks downloaded for this survey.

Downloads: `.scratch/speaker-survey/run1/` (leftovers of the first, hung run, old `dl.sh`, so those were requested as `en` only) and `.scratch/speaker-survey/run2/` (this run, `--sub-langs en,en-US,en-GB,en-orig --ignore-errors --sleep-subtitles 5`, one video per call). Scripts: `tools/analyze.mjs` (marker and turn counts), `tools/align.mjs` (auto `>>` vs manual `- ` timing comparison), `tools/dl-fn.sh` (the one-video download function). Tracks are untrusted data; nothing in them was executed.

## Summary

1. **Auto tracks (`>>`).** In 2026-uploaded videos, every multi-speaker auto track carries `>>` (7 of 7, 81 to 477 distinct non-noise turns). In videos uploaded 2017 to mid-2025, five clearly multi-speaker auto tracks carry **no `>>` at all**. So absence of `>>` does not mean one speaker.
2. **`>>` is not clean.** It also appears on single-narrator videos (0 to 5 distinct non-noise turns in 6 recent solo videos, from embedded clips and from laughter), before pure sound events (`>> [music]`, `>> [laughter]`, up to 13% of turns), and mid-speech after a short interjection. Against a human manual track of the same audio, auto `>>` matched 57% by precision and 75% by recall (4 s window).
3. **Manual tracks have no single convention.** Of 4 multi-speaker manual tracks: one uses `- ` per turn (Lex Fridman), one uses recurring `NAME:` labels (TED), two carry **nothing** (Dwarkesh, PBS). Single-speaker manual tracks produced no `- ` line (3 of 3). They do produce `NAME:` look-alikes.
4. **X tracks carry no speaker notation** (2 tracks, one of them a genuine two-person interview).
5. **No source names a speaker automatically.** No `<v Name>` voice tag appears in any of 31 tracks. Names exist only as hand-typed `NAME:` labels on some manual tracks.

## 1. Sample and language keys

`Kind` is the track kind from the body (`<c>` word-timing tags means auto), as in `src/subtitle-track.js`. `Key` is the language key the file came from. Where `en` and `en-orig` both downloaded and were byte-identical, I list `en=en-orig`. `Uploaded` is the info-json `upload_date`.

| Video | Speakers (judgement) | Uploaded | Dur | Track analysed: kind, key |
|---|---|---|---|---|
| `ilmBGeGldrI` Microsoft event | many presenters (event; no title/desc check beyond the issue) | 2026-10-07 | 90 min | auto, `en` (run1) |
| `MN9dGgmLyso` Pocock x Lauren Tan | 2 | 2026-10-03 | 66 min | auto, `en-orig` (en 429; 19+ `-orig` keys, dubbed) |
| `s7d2d8FhevU` Lex Fridman #502 | 2 | 2026-09-17 | 217 min | manual `en` and auto `en-orig`, same audio |
| `j774AFDJqFg` Tim Ferriss, Kevin Ryan | 2 | 2026-09-25 | 76 min | auto, `en-orig` (en 429; 20 `-orig` keys, dubbed) |
| `PrSf7IOYu-I` Dwarkesh, 3 AI researchers | 4 (host says "three of my AI researcher friends") | 2026-09-11 | 97 min | manual `en` and auto `en-orig` |
| `SDdLlTkmyfM` Syntax podcast | 2 hosts | 2026-09-16 | 61 min | auto, `en=en-orig` |
| `mc9WVVAUQGE` Hot Ones, Holland and Bernthal | 3 | 2026-07-23 | 29 min | auto, `en-orig` (en 429; 4 `-orig` keys) |
| `_uUskajC1Ps` TED, Anderson and Ruff-Bell | 2 | n/a | 21 min | manual, `en` |
| `EwAQMQjABAk` PBS NewsHour segment | more than 1 (reporter plus documentary clips; I read only the first minute) | n/a | 8 min | manual, `en` (two more suffixed manual keys, not fetched) |
| `xzprMuJiLYU` Education 2.0 panel | 4 or more (moderator plus panelists, from the text) | 2023-02-01 | 56 min | auto, `en=en-orig` |
| `39axFlxuZPU` Gervais talk-show clip compilation | several (dialogue in text) | 2025-06-30 | 9 min | auto, `en=en-orig` |
| `ghwaIiE3Nd8` Lex #6, Guido van Rossum | 2 | 2018-11-22 | 87 min | auto, `en` (run1) |
| `U9DyHthJ6LA` Hot Ones, Gordon Ramsay | 2 | 2019-01-24 | 31 min | auto, `en` (run1) |
| `KnIAAkSNtqo` Senate hearing, Bill C16 | several | 2017-05-18 | 60 min | auto, `en-orig` (en 429; 19 `-orig` keys) |
| `2091335109718712320` (X) Denis Labelle with Lauren Tan | 2 ("thanks for having me" in text) | n/a | 56 min | X track, `en` |
| `psN1DORYYV0` TED, Brene Brown | 1 | 2012-03-16 | 21 min | manual `en` and auto `en-orig` |
| `8S0FDjFBj8o` TEDx, Will Stephen | 1 | 2015-01-15 | 6 min | manual `en` and auto `en-orig` |
| `PkZNo7MFNFg` freeCodeCamp JavaScript | 1 | 2018-12-10 | 207 min | manual `en` and auto `en-orig` |
| `U3aXWizDbQ4` Fireship, C in 100 Seconds | 1 | 2021-11-10 | 2 min | auto, `en=en-orig` |
| `BCg4U1FzODs` Traversy, TypeScript crash course | 1 | 2021-08-18 | 52 min | auto, `en-orig` (en 429; 15 `-orig` keys) |
| `BsJGo1wFTvQ` Pocock, Skills v1.3 | 1 | 2026-10-05 | 15 min | auto, `en=en-orig` |
| `gaDdrDdczO4` Pocock, Skills v1.2 | 1 | 2026-08-05 | 12 min | auto, `en-orig` (en 429; 18 `-orig` keys) |
| `F3lL98Pj90o` Pocock, /wayfinder | 1 | 2026-07-30 | 15 min | auto, `en-orig` (en 429; 20 `-orig` keys) |
| `WrCjAAl9okA` Fireship | 1 narrator plus a clip | 2026-10-07 | 6 min | auto, `en=en-orig` |
| `_5p1_TNSWqQ` Fireship | 1 narrator plus clips | 2026-10-05 | 6 min | auto, `en=en-orig` |
| `I_KVMFrUtPk` Fireship | 1 | 2026-09-30 | 5 min | auto, `en=en-orig` |
| `2101938030122868736` (X) Lauren Tan solo talk | 1 | n/a | 38 min | X track, `en` |

About 28 videos, 31 analysed tracks (counting both kinds where a video had both). Hard-failed downloads: none. I retried every `en` 429 with `en-orig` and each succeeded first time (`MN9dGgmLyso`, `j774AFDJqFg`, `mc9WVVAUQGE`, `BCg4U1FzODs`, `KnIAAkSNtqo`, `gaDdrDdczO4`, `F3lL98Pj90o`).

Language observation that supports issue #12: **every one of the 7 videos whose `en` returned 429 lists 4 or more `-orig` automatic-caption keys (4, 15, 18, 19, 20, 20, 20), i.e. multi-audio or dubbed videos.** Every video with exactly one `-orig` key downloaded `en` without error. `PrSf7IOYu-I` lists 9 `-orig` keys but also has a real manual `en`, which downloaded. A caution: `en` and `en-orig` differ when a video has both a manual track and an auto one (`en` is then the manual track, `en-orig` the auto one). That is how one video gave me both kinds. A track from `en-orig` is always auto in this sample.

## 2. Auto tracks: `>>`

On disk the marker is `&gt;&gt;` at the start of a line (no `<v>` tags and no names anywhere). Auto tracks repeat each line across 2 to 3 rolling cues, so a raw line count is about 2.5 to 3 times the number of turns. Both are given: **raw** = lines on disk, **distinct** = after dropping lines already in the previous cue (what a reader sees). **Non-noise** = distinct turns minus those whose whole text is a bracket token such as `[music]`, `[laughter]`. The raw counts match the ones in the brief (263 and 249).

### 2.1 Multi-speaker, 2026 uploads (all have `>>`)

| Video | raw | distinct | noise turns | non-noise per hour | turns of 3 words or fewer | median words/turn |
|---|---|---|---|---|---|---|
| `ilmBGeGldrI` | 263 | 105 | 8 (17 start with `[`) | 64 | 30 (29%) | 20 |
| `MN9dGgmLyso` | 249 | 83 | 2 | 74 | 9 (11%) | 41 |
| `s7d2d8FhevU` | 945 | 314 | 1 | 87 | 40 (13%) | 35 |
| `j774AFDJqFg` | 1438 | 479 | 2 | 377 | 83 (17%) | 19 |
| `PrSf7IOYu-I` | 756 | 252 | 0 | 156 | 20 (8%) | 49 |
| `SDdLlTkmyfM` | 475 | 157 | 0 | 155 | 24 (15%) | 25 |
| `mc9WVVAUQGE` | 1198 | 410 | 52 (13%) | 732 | 139 (34%), 204 are 5 or fewer (50%) | 6 |

Turn length is very uneven: median 6 to 49 words, 8% to 34% of turns are 3 words or fewer ("Yeah.", "Right.", "Thank you, brother."), and the longest single turn is 352 to 1745 words (the 1745 is in `ilmBGeGldrI`, likely a long presentation; I did not check). Hot Ones is the extreme: rapid banter, median 6 words.

### 2.2 Multi-speaker, older uploads: no `>>` at all

| Video | Uploaded | raw `>>` | Note |
|---|---|---|---|
| `KnIAAkSNtqo` Senate hearing | 2017 | 0 | several speakers |
| `ghwaIiE3Nd8` Lex #6 | 2018 | 0 | 2 speakers |
| `U9DyHthJ6LA` Hot Ones Ramsay | 2019 | 0 | 2 speakers; 24 bracket-only lines (`[Music]`-type) remain |
| `xzprMuJiLYU` panel | 2023 | 0 | moderator plus 3 panelists |
| `39axFlxuZPU` Gervais clips | 2025-06 | 0 | several speakers |

Every one of the 7 tracks uploaded 2026-07 or later has `>>`, and every one of the 5 uploaded 2017 to 2025-06 lacks it. That is a correlation over 12 tracks, not an explanation: I do not know whether the cause is upload date, the ASR generation in use when the captions were first made, or something per-channel. I did not test re-processed old videos.

### 2.3 Single-speaker auto tracks

| Video | Uploaded | Duration | distinct `>>` | Of which non-noise | What they are |
|---|---|---|---|---|---|
| `BsJGo1wFTvQ` | 2026-10 | 15 min | 0 | 0 | |
| `gaDdrDdczO4` | 2026-08 | 12 min | 0 | 0 | |
| `I_KVMFrUtPk` | 2026-09 | 5 min | 0 | 0 | |
| `WrCjAAl9okA` | 2026-10 | 6 min | 1 | 1 | embedded clip of a speaker ("whose job it is to keep America at the frontier of the AI race"); the narrator's return gets **no** marker, so the turn runs 1165 words to the end |
| `F3lL98Pj90o` | 2026-07 | 15 min | 2 | 1 | `>> [laughter]` then `>> that kind of tells you how big it was.`, the **same speaker** carrying on after a laugh |
| `_5p1_TNSWqQ` | 2026-10 | 6 min | 6 | 5 | embedded clips (`>> [screaming]`, `>> IT'S A MODEL THAT WILL POWER THE 90,000`, `>> Democracy.`), mostly genuine other voices |
| `BCg4U1FzODs`, `U3aXWizDbQ4`, `PkZNo7MFNFg`, `psN1DORYYV0`, `8S0FDjFBj8o` (2012 to 2021) | old | | 0 each | 0 | no information about false positives: old tracks never carry `>>` even when multi-speaker |

So **`>>` does appear on single-speaker auto tracks**: 3 of 6 recent solo tracks have at least one, up to 5 non-noise turns, none have more than 5. Those are mostly real voice changes (embedded clips), so "false positive" is only partly the right word. They are real speaker changes the reader may not care about.

### 2.4 Noise and same-speaker markers

- Before sound events: `>> [music]`, `>> Heat. Heat.` (song lyrics in the `ilmBGeGldrI` intro), `>> [applause]`, `>> [laughter]` (52 of 410 turns on Hot Ones). Conversely `[laughter]` mid-sentence causes a split: in `MN9dGgmLyso`, `>> and a huge fan of yours. I [laughter]` then `>> started climbing more and more?` (same speaker).
- Same speaker, new `>>` after a short interjection, with no genuine turn: in `s7d2d8FhevU`, the auto track has `>> less amendable to scientific rigor so I` at 14:38 while the human track keeps one speaker, and `>> yes,` followed one cue later by `>> the human mind is incredibly complicated` (16:39).
- Auto turns shorter than 3 words are mostly genuine backchannel ("Mhm.", "Yes, they do."), which is why they are 8% to 34% of turns.

### 2.5 Auto `>>` against a human track for the same audio (`s7d2d8FhevU`)

`tools/align.mjs` matches each auto `>>` start (first cue showing the line) to the nearest manual `- ` cue start. The manual track is not ground truth either (it is a human captioner's choice), so read these as agreement, not accuracy.

| Window | Auto turns with a manual `- ` within window | Manual `- ` with an auto `>>` within window |
|---|---|---|
| 2 s | 52.5% (165 of 314) | 69.9% (188 of 269) |
| 4 s | 57.0% (179 of 314) | 75.1% (202 of 269) |
| 8 s | 63.7% (200 of 314) | 82.2% (221 of 269) |

Auto emits more turns than the manual track (314 vs 269), roughly a third of them with no manual counterpart, and misses a quarter of the manual ones within 4 s. Boundaries are usable for locating turns approximately, not exactly.

## 3. Manual tracks

Manual tracks (the `en` key where a manual track exists) show four different practices. No single regex covers them.

| Video | Speakers | Notation | Count |
|---|---|---|---|
| `s7d2d8FhevU` (Lex) | 2 | leading `- ` per turn; also `- ...` when the original speaker resumes after an interjection | 269 `- ` lines, 15 of them `- ...`; 38 (14%) are 3 words or fewer |
| `_uUskajC1Ps` (TED) | 2 | `NAME:` labels on turn changes only; first-speaker cue unlabelled; full name first time, initials afterwards | `Chris Anderson:` once then `CA:` 13 times; `Monique Ruff-Bell:` once then `MRB:` 13 times |
| `PrSf7IOYu-I` (Dwarkesh) | 4 | none | 0 |
| `EwAQMQjABAk` (PBS) | more than 1 | none | 0 |

Raw excerpts:

```
00:00:00.180 --> 00:00:03.590
- The following is a conversation
with Andrew Scull, a historian of

00:01:30.840 --> 00:01:30.960
- Yes

00:01:31.000 --> 00:01:34.960
- ... over the past century but mostly
we still are not good at treating
```

```
00:00:18.723 --> 00:00:21.434
MRB: Why did you think
the world was going to end in 1984?

00:00:21.476 --> 00:00:23.728
CA: Because I read George Orwell, "1984."
```

The `- ...` pattern matters: `src/artifacts.js` strips the marker with `^-\s+`, so it deletes `- ...` down to `...`, and the interjection `- Yes` before it is a separate turn. A `- ...` line is a resumption by the previous speaker, not a new turn.

### 3.1 Single-speaker manual tracks

| Video | `- ` lines | Other notation that looks like a speaker marker |
|---|---|---|
| `psN1DORYYV0` Brene Brown | 0 | `Guilt: I'm sorry. I made a mistake.` and `Shame: I'm sorry. I am a mistake.` (role-played dialogue, not speakers); 36 `(Laughter)` lines |
| `8S0FDjFBj8o` Will Stephen | 0 | `Translator: Gustavo Rocha` and `Reviewer: Ariana Bleau Lugo` (credits, already handled by `CREDIT`); 9 bracket-only lines |
| `PkZNo7MFNFg` freeCodeCamp | 0 | `Beau:  This is the Beginner's Javascript course` (one label on the only speaker, first cue); 114 bracket-only section titles like `[Running Javascript]`; one en-dash continuation `– we passed in the a...` (not matched by `^-\s+`) |

False positives for `- ` in manual single-speaker tracks: 0 of 3 tracks, 0 lines. False positives for a `NAME:` pattern: all 3 tracks. `PrSf7IOYu-I`'s manual track also matches a naive name regex on `Okay: give you 10x total productivity uplift.`, and `s7d2d8FhevU` on `Friedrich Nietzsche: "To live is to suffer,` (a quotation). A real speaker label recurs; one-off hits are noise, and only a recurring label with two or more distinct names is evidence.

Not found in any track: `<v Name>` voice tags (0 in 31 tracks), `[Name]` labels on speech, all-caps labels (the 13 hits in `_uUskajC1Ps` are the `CA:`/`MRB:` initials).

## 4. X

Both X tracks (`2091335109718712320`, a 56-minute two-person interview; `2101938030122868736`, a 38-minute solo talk) hold plain cues wrapped in `<X-word-ms ...>` tags with no `>>`, no `- `, no labels and no `<v>` tags. The interview is a genuine two-speaker conversation and the track gives no hint of it. `analyze.mjs` reports X tracks as `manual` (no `<c>` tags), but ADR 0003 records them as `auto`. Two tracks is a small sample, and 9 of 16 X videos in the earlier survey (`yt-dlp-x-com-support.md`) have no track at all.

## Conclusions

**(a) Detecting that a video has more than one speaker**

| Track kind | Reliable? | Evidence |
|---|---|---|
| auto, 2026 upload | Yes, as a count | 7 of 7 multi-speaker tracks had at least 81 distinct non-noise `>>` turns; 6 recent solo tracks had at most 5 |
| auto, older upload | No: false negatives | 5 of 5 multi-speaker tracks had zero |
| manual | No | 2 of 4 multi-speaker manual tracks had no marker of any kind |
| X | No | 0 of 1 |

Threshold suggested by the data, for auto tracks only: **count distinct, non-noise `>>` turns and treat the video as multi-speaker at 10 or more.** The gap between 5 (highest solo) and 81 (lowest multi-speaker) is wide, so 10 sits well inside it. Use the count, not a rate per hour: the solo `_5p1_TNSWqQ` (5 turns in 6 minutes, 52 per hour) overlaps `ilmBGeGldrI` (64 per hour). Drop turns whose whole text is a bracket token before counting. Below 10, say nothing: a track with no `>>` could still be multi-speaker, and a manual track without markers likewise. For manual tracks, test for a recurring `- ` (more than 10 lines) or two or more distinct recurring `NAME:` labels.

**(b) Locating turn boundaries**

- Manual `- `: the best boundary signal found, but present in 1 of 4 multi-speaker manual tracks. Treat `- ...` as a resumption, not a boundary.
- Manual `NAME:`: reliable where present (28 labels, 2 speakers, in the TED example; I read only the first minutes, not every label).
- Auto `>>`: approximate only. About 57% of auto turns match a human boundary within 4 s, and about 75% of human boundaries have an auto one. Expect extra boundaries before sound events and after interjections, and missing ones when a narrator returns after an embedded clip.

**(c) Naming speakers**

Not possible from any auto track or from X. Possible only on manual tracks with `NAME:` labels: 1 of 4 multi-speaker manual tracks in this sample. Labels use inconsistent forms (full name then initials), so mapping labels to people needs the recurrence rule above, and a single leading label (`Beau:`) on a solo track is not a speaker list.

## Where the sample is weak

- **Single-speaker auto false-positive rate rests on 6 recent videos.** All were short (5 to 15 minutes), none was a long solo lecture. A long solo video with many embedded clips could exceed 10.
- **No short multi-speaker video.** The shortest multi-speaker `>>` track is 29 minutes. A 3-minute two-person exchange may fall under the threshold.
- **No short multi-speaker manual track other than TED/PBS**, so "manual tracks without markers" is 2 of 4, not a rate. Manual tracks come from very few channels (Lex, TED, PBS, Dwarkesh, freeCodeCamp, TEDx).
- **The upload-date pattern is unexplained.** I did not test it by comparing tracks of the same age on different channels, and cannot rule out a per-channel effect.
- **Speaker counts are my judgement** from titles and text; I did not listen. `ilmBGeGldrI`'s speaker count is from the issue description only, and the PBS segment was read for about a minute.
- **The previous run's `dl.sh` is still alive.** PID 1916 (`/bin/bash ./tools/dl.sh run1 MN9dGgmLyso ghwaIiE3Nd8 U9DyHthJ6LA KnIAAkSNtqo 8xJpxj6T1BQ R1vskiVDwl4 eIho2S0ZahI 446E-r0rXHI pX2zvfD6GCY`, started 02:39) kept downloading into `run1/` during this session (`ghwaIiE3Nd8`, `U9DyHthJ6LA`, `KnIAAkSNtqo` appeared). I did not kill it and I did not wait on it. It shares request quota with this run and requests `en` only. The three leftovers I analysed from it are noted above (the first two are auto `en`; the third, an `en` 429, I re-fetched as `en-orig` in `run2`). It may add `8xJpxj6T1BQ`, `R1vskiVDwl4`, `eIho2S0ZahI`, `446E-r0rXHI`, `pX2zvfD6GCY` later; those are not analysed.
- **Download failures:** none outright. Seven `en` requests returned HTTP 429, all on multi-audio videos, all recovered with `en-orig` on the first retry. No call hung.

## Sources

- Track files, one per row of the tables, in `E:\Shared\Workspaces\personal\yt-dlp-playground\.scratch\speaker-survey\run1\`, `...\run2\` and `...\run2\x\`; plus `E:\Shared\Workspaces\personal\yt-dlp-playground\.scratch\mn9-orig\MN9dGgmLyso.en-orig.vtt`.
- `src/artifacts.js` (the `NOTATION` markers `^-\s+` and `^>>\s*`), `src/subtitle-track.js` (`classifyTrack`, `AUTO_SIGNAL`), `src/clean.js` (entity decode, so `&gt;&gt;` becomes `>>`).
- `docs/adr/0002-machine-translated-captions-are-plain-auto.md`, `0003-x-subtitle-tracks-are-auto.md`, `0006-english-means-en-en-us-or-en-gb.md`.
- `archive/research/yt-dlp-x-com-support.md` (X subtitle track frequency and `X-word-ms` markup).
- Video URLs: `https://www.youtube.com/watch?v=<id>` for each id in section 1; X posts `https://x.com/DenisLabelle/status/2091337807939706928` and `https://x.com/poteto/status/2102050467505430555`.
