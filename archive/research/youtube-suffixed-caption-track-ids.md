# YouTube suffixed caption track ids (`en-uYU-mmqFLq8`, `en-JkeT_87f4cc`)

Researched 2026-10-09 for issue gcapnias/yt-transcript#14. Installed yt-dlp: `2026.08.19` (`yt-dlp --version`). Source read at tag `2026.08.19` (`https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.08.19/yt_dlp/extractor/youtube/_video.py`, saved locally as `.scratch/i14src/_video.py`). All live runs: 2026-10-09, `yt-dlp --js-runtimes node ...` with `fnm_multishells` stripped from PATH. Raw outputs are in `.scratch/i14/` (`ls-<id>.txt`, `dl-<id>/`, `pat-*/`, `pages/`). Nothing was posted upstream.

Prior art, not repeated here: `archive/research/yt-dlp-sub-langs-matching-and-ignore-errors.md` (fullmatch + `re.I`, manual wins over auto for the same key, `en-fr`-style translations) and `archive/research/subtitle-speaker-notation.md`.

Facts and inferences are labelled **Fact** / **Inference**.

## 1. How the ids are formed

**Fact (source).** `_video.py` at `2026.08.19`, nested helper `get_lang_code` inside `_real_extract` (L4203-L4205):

```python
def get_lang_code(track):
    return (remove_start(track.get('vssId') or '', '.').replace('.', '-')
            or track.get('languageCode'))
```

The subtitle key is the track's `vssId` with one leading `.` removed and remaining `.` turned into `-`; `languageCode` is only a fallback. For manual tracks (`kind != 'asr'`) the key is passed to `process_language(subtitles, ...)` (L4285-L4290). Auto-caption tracks use the same helper (so ASR is `a.en` -> `a-en`, then `remove_start(..., 'a-')`).

**Fact (live capture).** `--write-pages` on `ilmBGeGldrI` saved the `youtubei/v1/player` response (`.scratch/i14/pages/`). `grep -aoh '"vssId":"[^"]*"'` returned exactly:

```
".en.JkeT_87f4cc"   (trackName "DTVCC1")
".en.uYU-mmqFLq8"   (trackName "CC1")
"a.en"              (kind "asr")
```

So the suffix is supplied by YouTube inside `vssId` (`.<lang>.<id>`); yt-dlp does not generate it. yt-dlp's `name` for the listing comes from `captionTrack.name` (`English - CC1`).

**Fact (history).** yt-dlp commit `120916dac` (2021-05-13) "[youtube] multiple subtitles in same language" introduced the `vssId` logic. Message: "Fixes: https://github.com/ytdl-org/youtube-dl/issues/21164" (title "[youtube] Extra subtitles being overwritten"), "Related: #310, ytdl-org/youtube-dl/pull/26112". Before it, the key was `languageCode`, so a second track in the same language overwrote the first. Test URL added then: `wsQiKKfKxug`. Found with `git log -S"def get_lang_code"` (earliest hit in this file's history is `ecdc9049c`, 2021-10-12, for translated subs, which only touches the neighbouring code) and `gh api repos/yt-dlp/yt-dlp/commits/120916dac`. Related issues read (titles only): yt-dlp#2655, yt-dlp#14889 (Cantonese, the `remove_start(lang_code, 'a-')` path).

**Fact (translations).** Auto translation keys are `<target>-<lang_code>` where `lang_code` is the full key of the manual track (L4297-L4300: `trans_code += f'-{lang_code}'`), and the name becomes `"<target name> from <track name>"`. That is why `en-en-uYU-mmqFLq8` ("English from English - CC1") exists. Translations are only built when `writeautomaticsub` or `--list-subs` is active (L4237).

**Suffix format.**
- **Fact.** In every suffixed key observed (3 distinct ids, below) the suffix is exactly 11 characters from `[A-Za-z0-9_-]`: `uYU-mmqFLq8`, `JkeT_87f4cc`, `1JJtFDtHuZg` (user-named track "French Speakers Only", video `wsQiKKfKxug`). Note `-` and `_` occur inside the suffix, so the key can contain extra hyphens.
- **Fact.** Because yt-dlp replaces `.` with `-`, any dot in a `vssId` would also become `-`. No dotted suffix was seen.
- **Fact.** The CC1 and DTVCC1 ids are identical across every Microsoft/GitHub/NASA live recording sampled (below), so they are constants, not per-video ids.
- **Inference.** The id is probably a deterministic hash of the track name (same name -> same id across videos; user-defined names get their own id). Not verified; no YouTube documentation found. Nothing in yt-dlp guarantees length 11. It looks like the YouTube video-id shape (11 chars base64url), but that is a resemblance, not a contract.
- **Inference.** A suffix appears whenever a track has a `trackName`. The plain `en` track is the one with an empty name (`wsQiKKfKxug` shows both `en` and `en-1JJtFDtHuZg`).

## 2. Prevalence

Commands: `yt-dlp --js-runtimes node --list-subs --skip-download https://www.youtube.com/watch?v=<id>` (4 s pacing, no 429s), IDs from `--flat-playlist --print "%(id)s | %(title)s | %(live_status)s"` on `@GitHub|@code|@Windows|@dotnet|@MicrosoftDeveloper/streams` and `/videos` plus `ytsearch` queries. "M" = manual track keys (excluding `live_chat`), "A" = English-relevant automatic keys (`en`, `en-orig`, `en-en-<id>`). `CC1` = `en-uYU-mmqFLq8`, `DTV` = `en-JkeT_87f4cc`.

| id | title | live? | manual (M) | auto (A) |
| --- | --- | --- | --- | --- |
| ilmBGeGldrI | Something new is coming from Windows (Oct 7) | was_live | CC1, DTV | en, en-orig, en-en-CC1, en-en-DTV |
| 0kOXsQUNzss | GitHub Copilot Day live (GitHub, Sept 2026) | was_live | CC1, DTV | same four |
| HG0twQJ7aG4 | Microsoft Build 2026 Day 1 LIVE | was_live | CC1, DTV | same four |
| nlGqajJEsWs | Microsoft Build 2026 Day 2 LIVE | was_live | **en**, CC1, DTV | same four |
| TUeET4zY95c | Microsoft Ignite: Opening Keynote | was_live | CC1, DTV | same four |
| uydwDk91Y9Y | MCP Live! (MicrosoftDeveloper) | was_live | CC1, DTV | same four |
| IAEQt_yqfLA | Let's Learn GitHub Copilot SDK | was_live | CC1, DTV | same four |
| L4kig78ld58 | GitHub Copilot Dev Days | was_live | CC1, DTV | same four |
| x6p9Ri0DlNE | NASA's SpaceX Crew-12 Re-Entry & Splashdown (NASA) | was_live | CC1, DTV | same four |
| XT6KEenXgEc | Blazor Community Standup | was_live | none | en, en-orig |
| Fx05xzrjJ0Y | VS Code Live: Agent Host, Agents window... | was_live | none | none ("no automatic captions") |
| J6AV1qF13os | Windows Central live Oct 7 event | was_live | none | en, en-orig |
| RE_AsVyoOSQ | Yahoo Finance: Microsoft Windows Event | was_live | none | en, en-orig |
| 39BalPDuTo0 | Apple Event September 9 2026 | was_live | plain `en` + 14 other languages (no suffix) | en, en-orig |
| wYSncx9zLIU | Google I/O '26 Keynote | was_live | plain `en` + 7 languages (no suffix) | en, en-orig |
| wtMaYmkhANQ | Welcome to GitHub Copilot Day (GitHub) | not live | none | en, en-orig |
| KT6p0MNXoCE | How to run Copilot agent sessions across any device (GitHub Copilot Day) | not live | none | en, en-orig |
| ghh5VGouRVI | VS Code Learn: Spring Boot with Copilot | not live | none | en, en-orig |
| bwKmnINg-sY | Improving Performance in .NET Applications | not live | none | en, en-orig |
| 6c8fpShFjZE | Future of ASP.NET Core & Blazor in .NET 11 | not live | none | en, en-orig |
| _A5E6n4vMMM | Iron Sharpens Iron (Windows channel) | not live | en (plain) | en, en-orig |
| wsQiKKfKxug | (yt-dlp test video for multi-track, uploader unchecked) | not live | en, `en-1JJtFDtHuZg` ("English - French Speakers Only") | not recorded |

**Facts.**
- 9 of 9 sampled live recordings from Microsoft Events / MicrosoftDeveloper / Windows / GitHub / NASA that show suffixed tracks have both CC1 and DTV with the same two ids. This included the user-suggested GitHub Copilot Day recording `0kOXsQUNzss` and Build, Ignite.
- Suffixed tracks are not universal for live recordings: Blazor standup, VS Code Live `Fx05xzrjJ0Y`, Windows Central and Yahoo Finance recordings had none; Apple and Google I/O had ordinary plain-language manual tracks.
- None of the 6 non-live uploads from the same channels had suffixed tracks (5 of the 6 had no manual tracks at all; `_A5E6n4vMMM` has a plain `en`).
- `nlGqajJEsWs` (Build Day 2) has a plain `en` manual track plus both suffixed ones. The plain `en` is poor: 4106 cues, no `<c>`, text such as "Heat. Heat. N." over minute-long cues (`.scratch/i14/pat-combo/nlGqajJEsWs.en.vtt`). So plain `en` alongside suffixed tracks is possible, and not necessarily the best of them.
- `live_chat` appears as a manual key (`json`) on live recordings with chat replay; relevant if anyone uses `all`.
- On the live recordings the `en` auto entry lists 9-10 "English" variants (extra vtt-only `unknown` entries, apparently from the HLS manifest, "Downloading m3u8 information"). Not investigated further.

**Inference.** The CC1/DTVCC1 pair most likely comes from broadcast-style 608/708 caption ingestion into a live stream, hence the NASA match. The sample is small (22 videos) and biased toward live events.

## 3. Track contents

Downloaded with `yt-dlp --js-runtimes node --skip-download --write-sub --sub-langs 'en-uYU-mmqFLq8,en-JkeT_87f4cc' --sub-format vtt -P .scratch/i14/dl-<id> -o '%(id)s' <url>` for `ilmBGeGldrI`, `0kOXsQUNzss`, `x6p9Ri0DlNE`. Counts via `grep -ac -- '-->'`, `grep -ao '<c[ >]'`, `grep -ac '&gt;&gt;&gt;'`.

| video | track | bytes | cues | `<c` tags | first cue | last cue |
| --- | --- | --- | --- | --- | --- | --- |
| ilmBGeGldrI | CC1 | 920,686 | 3,939 | 25,772 | 00:19:35.774 | 01:29:14.349 |
| ilmBGeGldrI | DTVCC1 | 175,441 | 1,973 | 0 | 00:19:35.849 | 01:29:34.133 |
| 0kOXsQUNzss | CC1 | 3,838,084 | 15,354 | 109,375 | 00:09:01.974 | 04:09:41.333 |
| 0kOXsQUNzss | DTVCC1 | 703,375 | 7,680 | 0 | 00:09:02.018 | 04:09:57.451 |
| x6p9Ri0DlNE | CC1 | 1,817,286 | 7,434 | 50,444 | 00:01:21.848 | 02:19:06.938 |
| x6p9Ri0DlNE | DTVCC1 | 336,154 | 3,729 | 0 | 00:01:23.616 | 02:18:57.762 |

**Facts.**
- **Span:** both tracks cover the same span within about 1-20 s at each end. The timeline starts late (9-20 min) because the live pre-roll has no captions.
- **Classifier (ADR-0002):** CC1 contains `<c>` word-timing tags in all three videos, so a `<c>`-based classifier would call it auto. DTVCC1 has none (manual). Both are served as manual tracks by YouTube.
- **Format:** CC1 is the roll-up style typical of YouTube auto captions: each cue repeats the previous line plus a new line carrying `<c>` tags (about 2x the cues of DTVCC1, 5x the bytes). DTVCC1 cues carry `size:53% position:73% line:71%`, are about 25-30 characters, break mid-sentence ("It's wonderful to be in San / Francisco with all of you for"), and overlap in time (e.g. `00:19:35.849-00:19:38.149`, then `00:19:37.916-00:19:44.749`, then `00:19:38.249-00:19:47.016` repeating "Good morning."). So DTVCC1 is not free of duplication; it needs overlap/dup handling like any VTT.
- **Speaker change notation:** `&gt;&gt;` (HTML-escaped `>>`) and `&gt;&gt;&gt;` appear at the start of a line. Counts of lines containing: ilmBGeGldrI CC1 144 (142 `>>` + 2 `>>>`), DTVCC1 48 (47 + 1); x6p9Ri0DlNE CC1 722 (`>>` only), DTVCC1 244; **0kOXsQUNzss (GitHub Copilot Day): zero markers in either track**. No `- ` lines, no `NAME:` labels in any of the six files. VTT escapes `>` as `&gt;`, so a raw `>>` search finds nothing.
- `>>>` vs `>>`: both occur within one video (ilmBGeGldrI has `>>>` once or twice), so a parser should accept two or more.
- **Reads cleaner:** DTVCC1, by volume and absence of roll-up repetition; its flaw is time-overlapping 2-line fragments. CC1 repeats each line in two or three consecutive cues (see "Good morning." in the first 30 lines of `ilmBGeGldrI` CC1).
- **Named user track:** `wsQiKKfKxug` `en-1JJtFDtHuZg` has 0 `<c>` tags (not further inspected).

**Inference.** For these videos DTVCC1 is the better source for a transcript, and a `<c>`-only classifier misfiles CC1. If both are downloaded, a rule like "prefer track without `<c>`" would pick DTVCC1, but that is a design decision for the ADR, not proven here.

## 4. Matching with `--sub-langs`

Semantics (from the prior doc, re-verified in `orderedSet_from_options`): each comma-separated entry is a regex, `re.compile(val, re.I).fullmatch` against each available key; manual keys are inserted first, and an auto key is added only if that key is not already present.

**Pattern:** `en-[A-Za-z0-9_-]{11}` (no comma inside the braces, which matters because the option is split on `,`).

**Fact, empirical (real downloads).** `--skip-download --write-sub --write-auto-sub --sub-langs 'en-[A-Za-z0-9_-]{11}' --sub-format vtt`:

| video | files written |
| --- | --- |
| ilmBGeGldrI | `en-uYU-mmqFLq8`, `en-JkeT_87f4cc` only |
| nlGqajJEsWs | `en-uYU-mmqFLq8`, `en-JkeT_87f4cc` only (plain `en` not selected) |
| wsQiKKfKxug | `en-1JJtFDtHuZg` only |

Not written: `en`, `en-orig`, `en-en-uYU-mmqFLq8`, `en-en-JkeT_87f4cc`, any translation.

**Fact, empirical (combined list).** `--sub-langs 'en,en-US,en-GB,en-orig,en-[A-Za-z0-9_-]{11}'` on `nlGqajJEsWs` wrote `en` (the manual one), `en-orig`, `en-uYU-mmqFLq8`, `en-JkeT_87f4cc`: download order follows the CLI entry order.

**Fact, corpus check.** `node .scratch/i14/regtest.cjs .scratch/i14 '<pattern>'` builds `^(?:pattern)$` with the `i` flag (equivalent to Python `fullmatch` + `re.I`) over the 3,003 distinct language keys collected from all 22 `--list-subs` outputs (including every auto translation key). Matches: `en-uYU-mmqFLq8`, `en-JkeT_87f4cc` only. For contrast `en-[A-Z]{2}` matches `en-ar en-en en-fr en-de en-id en-it en-ja en-ko en-th en-tr en-vi` (the pitfall from the prior doc). Nothing in the corpus was `en-US`/`en-GB`; neither appeared in any list.

**Why it excludes the others (derived from lengths).** After `en-` the remainder must be exactly 11 characters: `orig` (4), `US`/`GB` (2), `fr`-style (2-3), `en-uYU-mmqFLq8` for the auto translation (14), `pt-BR`/`es-419` translations (5-6) are all rejected.

**Risks (inference unless stated).**
1. Any key `en-` plus exactly 11 chars would match, for example an auto translation from a manual track whose language code is 11 characters long (e.g. `yue-Hant-TW`). None seen; unlikely.
2. The 11-char length is observed, not guaranteed by YouTube or yt-dlp. A looser pattern such as `en-[A-Za-z0-9_-]{6,}` would also admit translations from longer regional codes (`en-zh-Hant-TW` style); an alternative that stays tight is to list the two known ids literally (`en-uYU-mmqFLq8`, `en-JkeT_87f4cc`), but user-named tracks (`en-1JJtFDtHuZg`) would then be missed.
3. Regional manual tracks that also have a name would presumably be `en-US-<id>` (not observed); `en-[A-Za-z0-9_-]{11}` would not match them (`en-US-` + 11).
4. A video with both a plain `en` manual track and suffixed ones (`nlGqajJEsWs`) yields several manual files; the plain one can be the worst (placeholder-like "Heat. Heat." text there). The downstream selection rule is open.
5. Fetching suffixed tracks adds requests/files per video (two extra VTTs up to ~3.8 MB each for a 4 h stream).
6. `<c>` classifier misclassifies CC1 as auto; classification by `<c>` and by track key disagree here.
7. Behaviour depends on `get_lang_code` using `vssId`; it has been stable since 2021 (commit `120916dac`) but is an internal detail.
8. Sample size is small and live-event biased; ids might differ for other caption sources (e.g. CC2, other names).

## Sources

- yt-dlp `2026.08.19` `yt_dlp/extractor/youtube/_video.py`, `get_lang_code` L4203-L4205 and caption loop L4285-L4335: https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/youtube/_video.py#L4203-L4335
- yt-dlp commit `120916dac` "[youtube] multiple subtitles in same language": https://github.com/yt-dlp/yt-dlp/commit/120916dac
- youtube-dl issue 21164 "[youtube] Extra subtitles being overwritten": https://github.com/ytdl-org/youtube-dl/issues/21164
- yt-dlp commit `ecdc9049c` "[YouTube] Add auto-translated subtitles": https://github.com/yt-dlp/yt-dlp/commit/ecdc9049c
- yt-dlp issues #2655 and #14889: https://github.com/yt-dlp/yt-dlp/issues/2655, https://github.com/yt-dlp/yt-dlp/issues/14889
- Local prior research: `archive/research/yt-dlp-sub-langs-matching-and-ignore-errors.md`, `archive/research/subtitle-speaker-notation.md`
- Raw evidence: `.scratch/i14/` (gitignored, may not persist)
- Commands: `gh api repos/yt-dlp/yt-dlp/commits/120916dac`, `git log -S"def get_lang_code"` in a blobless clone, `yt-dlp --list-subs`, `yt-dlp --write-pages`, `yt-dlp --write-sub --write-auto-sub --sub-langs ...`, `node .scratch/i14/regtest.cjs`
