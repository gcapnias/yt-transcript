# yt-dlp playlist/channel behaviour — verified facts

Verified locally against `yt-dlp 2026.08.19` on Windows (Git Bash), network calls made
against real YouTube URLs (NASA channel `@NASA` / `UCLA_DiR1FfKNvjuUpBHmylQ`, and playlist
`PLF98rxtslw6s`). All commands and trimmed output below are exact transcripts from this
session.

---

## 1. `watch?v=<id>&list=<listid>` default behaviour

**Answer:** With no extra flags, yt-dlp processes the **whole playlist**, not just the
single video. `--no-playlist` forces single-video-only; `--yes-playlist` forces the
playlist (this is also the default).

`--help` text (verbatim):

```
    --no-playlist                   Download only the video, if the URL refers
                                    to a video and a playlist
    --yes-playlist                  Download the playlist, if the URL refers to
                                    a video and a playlist
```

Empirical confirmation, using `U="https://www.youtube.com/watch?v=9wq3VHsL_bE&list=PLF98rxtslw6s"`
(a real 3-item NASA playlist containing that video):

```
$ yt-dlp --flat-playlist --simulate --print "%(id)s" "$U"      # no flag
9wq3VHsL_bE
sZfFevvUFUk
6o3m9Bw67Os

$ yt-dlp --flat-playlist --simulate --no-playlist --print "%(id)s" "$U"
9wq3VHsL_bE

$ yt-dlp --flat-playlist --simulate --yes-playlist --print "%(id)s" "$U"
9wq3VHsL_bE
sZfFevvUFUk
6o3m9Bw67Os
```

No-flag output is identical to `--yes-playlist`: default = whole playlist.

---

## 2. Channel URL forms

**Answer:** All of `@handle` (bare), `@handle/videos`, `@handle/shorts`, `/c/Name`, and
`/channel/UC...` resolve to the `YoutubeTab` extractor (`youtube:tab`). A **bare**
`/@handle` (no `/videos` suffix) expands to **multiple sub-playlists** — Videos, Live, and
Shorts tabs are all pulled in, each yielding its own batch of entries with a distinct
`playlist_title` (`"NASA - Videos"`, `"NASA - Live"`, `"NASA - Shorts"`) but the **same**
`playlist_id` (the channel's `UC...` id). `/@handle/videos` and `/@handle/shorts` scope to
just that one tab.

Evidence — bare handle, `--playlist-items 1-3` (limit applies **per sub-tab**, so 9 rows
came back, 3 per tab):

```
$ yt-dlp --flat-playlist --simulate --playlist-items 1-3 \
    --print "%(extractor_key)s|%(id)s|%(playlist_id)s|%(playlist_title)s" \
    "https://www.youtube.com/@NASA"
Youtube|IwZVXmQdX1E|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Videos
Youtube|90Kgw_SvK4w|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Videos
Youtube|jHKf1eHp3eQ|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Videos
Youtube|v03RjDNwG1o|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Live
Youtube|M3HKLzjvKPc|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Live
Youtube|awQzjn72bI0|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Live
Youtube|myZ9kn9MIWQ|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Shorts
Youtube|QP5Fs3AYuWE|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Shorts
Youtube|VV_JW4iCni0|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Shorts
```

Note: `%(extractor_key)s` on each *entry* prints `Youtube` (the video extractor), because
flat-playlist entries are themselves single-video URL results. The **container's**
extractor key is obtained with the `playlist:` print prefix:

```
$ yt-dlp --flat-playlist --simulate --playlist-items 1 --print "playlist:%(extractor_key)s %(id)s %(title)s" \
    "https://www.youtube.com/@NASA/videos"
YoutubeTab UCLA_DiR1FfKNvjuUpBHmylQ NASA - Videos
```

`/channel/UC...` also resolves to `YoutubeTab` (4 rows shown, one per `--print` call with
`playlist-items 1-3`):

```
$ yt-dlp --flat-playlist --simulate --playlist-items 1-3 --print "playlist:%(extractor_key)s" \
    "https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ"
YoutubeTab
YoutubeTab
YoutubeTab
YoutubeTab
```

`/c/NASA` (legacy vanity URL) redirects to the same channel and shows the **same
multi-tab (Videos/Live/Shorts) expansion** as the bare handle — confirmed with the same
`--playlist-items 1-3` limit used for the bare-handle test above (3 items per tab, 9 total):

```
$ yt-dlp --flat-playlist --simulate --playlist-items 1-3 \
    --print "%(extractor_key)s %(id)s %(playlist_title)s" "https://www.youtube.com/c/NASA"
Youtube IwZVXmQdX1E NASA - Videos
Youtube 90Kgw_SvK4w NASA - Videos
Youtube jHKf1eHp3eQ NASA - Videos
Youtube v03RjDNwG1o NASA - Live
Youtube M3HKLzjvKPc NASA - Live
Youtube awQzjn72bI0 NASA - Live
Youtube myZ9kn9MIWQ NASA - Shorts
Youtube QP5Fs3AYuWE NASA - Shorts
Youtube VV_JW4iCni0 NASA - Shorts
```

(An earlier run of this same URL with a tighter `--playlist-items 1-2` limit only showed
Videos+Live in its first 4 rows — that was just the per-tab item cap cutting off before
reaching the Shorts tab's rows, not evidence that Shorts was excluded. The `--playlist-items
1-3` run above is the correct, matched-conditions comparison against Q2's bare-handle test.)

`/@NASA/shorts` (scoped tab) resolves to a single `YoutubeTab` container (Shorts tab only,
not multi-tab) — confirmed by requesting the container extractor key on that URL. Similarly,
the earlier `/channel/UC...` test that printed 4 `YoutubeTab` lines for `playlist-items 1-3`
is itself evidence of multi-tab expansion (1 line for the outer container plus 3 for the
Videos/Live/Shorts sub-tabs), consistent with the bare-handle and `/c/Name` results above.

`yt-dlp --list-extractors` also lists a distinct legacy `youtube:playlist` extractor key,
but in this version a plain `youtube.com/playlist?list=...` URL is actually routed through
`youtube:tab`, not `youtube:playlist` (see Q4 verbose trace).

---

## 3. Cheapest reliable enumeration

**Answer:** `yt-dlp --flat-playlist --simulate --print "<template>" <url>` (or `-J
--flat-playlist` for full JSON) — no video/subtitle downloads happen, and per-item webpage
fetches are skipped because `--flat-playlist` bypasses per-video extraction. Cost scales
with pagination of the *listing* pages only (roughly one request per ~100 items), not with
playlist/channel size beyond that.

Command used:

```
yt-dlp --flat-playlist --simulate --print "%(id)s %(title)s" <playlist-or-channel-url>
```

Timings (wall clock, this machine, this network):

```
# 3-item real playlist, full enumeration
$ time yt-dlp --flat-playlist --simulate --print "..." "https://www.youtube.com/playlist?list=PLF98rxtslw6s"
real 0m1.356s

# NASA channel Videos tab, first 50 items
$ time yt-dlp --flat-playlist --simulate --playlist-items 1-50 --print "%(id)s" "https://www.youtube.com/@NASA/videos"
real 0m1.626s

# NASA channel Videos tab, first 200 items
$ time yt-dlp --flat-playlist --simulate --playlist-items 1-200 --print "%(id)s" "https://www.youtube.com/@NASA/videos"
real 0m3.441s
```

**Exact request counts measured** (via `-v`, counting `Downloading webpage`/`Downloading
API JSON` lines):

```
# 50 items: 1 webpage fetch + 1 API page = 2 requests
[youtube:tab] @NASA/videos: Downloading webpage
[youtube:tab] UCLA_DiR1FfKNvjuUpBHmylQ page 1: Downloading API JSON

# 200 items: 1 webpage fetch + 6 API pages = 7 requests
[youtube:tab] @NASA/videos: Downloading webpage
[youtube:tab] UCLA_DiR1FfKNvjuUpBHmylQ page 1: Downloading API JSON
[youtube:tab] UCLA_DiR1FfKNvjuUpBHmylQ page 2: Downloading API JSON
[youtube:tab] UCLA_DiR1FfKNvjuUpBHmylQ page 3: Downloading API JSON
[youtube:tab] UCLA_DiR1FfKNvjuUpBHmylQ page 4: Downloading API JSON
[youtube:tab] UCLA_DiR1FfKNvjuUpBHmylQ page 5: Downloading API JSON
[youtube:tab] UCLA_DiR1FfKNvjuUpBHmylQ page 6: Downloading API JSON
```

So each API page carries roughly 30–50 items (200 items / 6 pages ≈ 33/page; consistent
with the 50-item case needing only 1 page). Total requests = 1 (initial webpage) + ceil(N /
~30-50) (API pages), i.e. **linear in item count with a large constant divisor** — for a
~50-video playlist that's 1–2 requests total; for a channel with thousands of videos,
expect roughly (thousands / 35) extra API-page requests on top of the 1 webpage fetch. This
divisor (~30–50 items/page) is measured directly from the two data points above, not
independently confirmed against yt-dlp's source for a fixed page-size constant — I did not
enumerate a genuinely large (multi-thousand-video) channel in full to avoid an expensive,
slow call, so the "thousands of videos" extrapolation is inferred from this 50-vs-200
comparison, not directly measured at that scale.

---

## 4. Distinguishing playlist/channel vs single-video URL without a network call

**Answer:** Yes — extractor **selection** (which extractor key matches a URL) is done by
regex matching in-process, before any network I/O; confirmed by reproducing it with a dead
proxy (network calls fail, extractor line still prints). There's no dedicated "print
extractor key, no network" CLI flag; the practical way to observe it is `-v` and the
`[<extractor>] Extracting URL: ...` line, which appears before `Downloading webpage`. The
key nuance: a bare `watch?v=` check is not enough to classify a URL as "single video" —
any `watch?v=` URL with a `list=` parameter is dispatched through `youtube:tab` first
regardless of `--no-playlist`; see the table below.

Verbose trace for a channel tab URL — extractor line precedes the network fetch line:

```
[youtube:tab] Extracting URL: https://www.youtube.com/@NASA/videos
[youtube:tab] @NASA/videos: Downloading webpage        <- first network I/O happens here
[debug] [youtube:tab] Selected tab: 'videos' (videos), Requested tab: 'videos'
```

**Correction from an initial pass:** the table below distinguishes the **dispatch-time**
extractor (which extractor's regex actually matches the URL and does the fetch — the fact
that answers "is this a single video or a container" offline) from the **entry-level**
`%(extractor_key)s` printed on each flattened result row (always `Youtube`, because every
flat-playlist entry is itself a resolved single-video result, regardless of what container
produced it). Q2's per-entry table intentionally showed the latter; this table shows the
former, which is the one that matters for URL classification.

Resolved **dispatch-time** extractor keys observed for each URL shape (via `-v`, reading the
`Extracting URL:` line, i.e. offline classification):

| URL shape                                     | dispatch-time extractor key |
|------------------------------------------------|------------------------------|
| `watch?v=<id>` (no `list=`)                    | `youtube` (`Youtube`)        |
| `watch?v=<id>&list=<id>`, default or `--yes-playlist` | `youtube:tab` (`YoutubeTab`) — delegates internally to `youtube:playlist` → the playlist URL, then to `youtube` per entry |
| `watch?v=<id>&list=<id>`, with `--no-playlist` | `youtube:tab` **is still dispatched first**, then falls back/delegates to `youtube` for the single video |
| `playlist?list=<id>`                           | `youtube:tab` (`YoutubeTab`) |
| `@handle`, `@handle/videos`, `@handle/shorts`  | `youtube:tab` (`YoutubeTab`) |
| `/c/Name`                                       | `youtube:tab` (`YoutubeTab`) |
| `/channel/UC...`                                | `youtube:tab` (`YoutubeTab`) |

This is a materially different (and more useful) fact than my first pass reported: **any
`watch?v=` URL that also carries a `list=` parameter is dispatched through `youtube:tab`
first, regardless of `--no-playlist`/`--yes-playlist`** — the flag only affects what happens
*after* dispatch (whether the tab extractor expands to the full playlist or collapses back
to the single video), not which extractor is invoked. So the offline classification rule a
caller should use is: "does the URL contain `list=`, or is it playlist/channel-shaped?" →
`youtube:tab`; otherwise → `youtube`. Simply checking for a bare `watch?v=` is **not**
sufficient to conclude "single video, no tab involved."

Confirmed with:

```
$ yt-dlp -v --simulate --playlist-items 1 "https://www.youtube.com/watch?v=9wq3VHsL_bE&list=PLF98rxtslw6s" 2>&1 | grep "Extracting URL"
[youtube:tab] Extracting URL: https://www.youtube.com/watch?v=9wq3VHsL_bE&list=PLF98rxtslw6s
[youtube:tab] Extracting URL: https://www.youtube.com/playlist?list=PLF98rxtslw6s
[youtube] Extracting URL: https://www.youtube.com/watch?v=9wq3VHsL_bE

$ yt-dlp -v --simulate --no-playlist "https://www.youtube.com/watch?v=9wq3VHsL_bE&list=PLF98rxtslw6s" 2>&1 | grep "Extracting URL"
[youtube:tab] Extracting URL: https://www.youtube.com/watch?v=9wq3VHsL_bE&list=PLF98rxtslw6s
[youtube] Extracting URL: https://www.youtube.com/watch?v=9wq3VHsL_bE

$ yt-dlp -v --simulate --playlist-items 1 "https://www.youtube.com/playlist?list=PLF98rxtslw6s" 2>&1 | grep "Extracting URL"
[youtube:tab] Extracting URL: https://www.youtube.com/playlist?list=PLF98rxtslw6s
[youtube] Extracting URL: https://www.youtube.com/watch?v=9wq3VHsL_bE
```

**Offline-ness independently proven:** re-running with a dead proxy (`--proxy 127.0.0.1:1`,
connection actively refused) still prints `[youtube:tab] Extracting URL: ...` before any
retry/failure — i.e. extractor selection happens before, and independent of, any successful
network I/O:

```
$ yt-dlp -v --proxy 127.0.0.1:1 --simulate "https://www.youtube.com/@NASA/videos" 2>&1 | head -14
...
[youtube:tab] Extracting URL: https://www.youtube.com/@NASA/videos
[youtube:tab] @NASA/videos: Downloading webpage
WARNING: [youtube:tab] ('Unable to connect to proxy', NewConnectionError(...)). Retrying (1/3)...
```

Note: `yt-dlp --list-extractors` also lists a separate legacy `youtube:playlist` key, but
this version does **not** route plain `playlist?list=` URLs through it — they go through
`youtube:tab` instead. So the reliable offline signal is "does the URL match a `watch?v=`
pattern (→ `Youtube`, single video, playlist expansion only if `list=` present and not
suppressed) vs. everything channel/playlist-shaped (→ `YoutubeTab`)" — a **string-pattern**
distinction that a caller could replicate without invoking yt-dlp at all (i.e. sniff the URL
shape yourself), rather than something yt-dlp exposes as a dedicated flag.

---

## 5. Per-item failure in a batch

**Answer:** By default, yt-dlp **continues** with the rest of the batch after a per-item
extraction/download error (this is the documented default: `--no-abort-on-error`, "Continue
with next video on download errors ... (default)"). `--abort-on-error` stops the whole run
at the first failure. `-i`/`--ignore-errors` is about **postprocessing** success
bookkeeping, not about continuing (that already happens by default) — quoting `--help`
verbatim:

```
    -i, --ignore-errors             Ignore download and postprocessing errors.
                                    The download will be considered successful
                                    even if the postprocessing fails
    --no-abort-on-error             Continue with next video on download errors;
                                    e.g. to skip unavailable videos in a
                                    playlist (default)
    --abort-on-error                Abort downloading of further videos if an
                                    error occurs (Alias: --no-ignore-errors)
```

Empirically constructed batch: one deliberately-invalid video id (`aaaaaaaaaaa`, "This
video is unavailable") followed by one real video id, passed as two URLs on the command
line. I'm treating multiple positional URLs as behaviourally equivalent to playlist-item
iteration here based on the observed output (both bad and good items are attempted, in
order) — I did not independently verify in source that this uses exactly the same code path
as playlist-entry iteration, so that equivalence is an inference from behaviour, not a
confirmed implementation detail. The `--help` wording for `--no-abort-on-error` ("skip
unavailable videos in a playlist ... (default)") directly covers the playlist case, which is
the one the CLI design question is actually about:

```
BAD="https://www.youtube.com/watch?v=aaaaaaaaaaa"
GOOD="https://www.youtube.com/watch?v=9wq3VHsL_bE"

# default (no flags): continues past the bad item, prints the good one, exit code 1
$ yt-dlp --flat-playlist --simulate --print "%(id)s" "$BAD" "$GOOD"
ERROR: [youtube] aaaaaaaaaaa: This video is unavailable
9wq3VHsL_bE
EXIT=1

# -i: same behaviour (continues, prints good item) — exit code still 1
$ yt-dlp -i --flat-playlist --simulate --print "%(id)s" "$BAD" "$GOOD"
ERROR: [youtube] aaaaaaaaaaa: This video is unavailable
9wq3VHsL_bE
EXIT=1

# --abort-on-error: stops immediately, good item never reached, exit code 1
$ yt-dlp --abort-on-error --flat-playlist --simulate --print "%(id)s" "$BAD" "$GOOD"
ERROR: [youtube] aaaaaaaaaaa: This video is unavailable
EXIT=1
```

Confirmed empirically: **exit code is 1** whenever any item in the run errored, regardless
of `-i`/default/`--abort-on-error`, and regardless of whether later items succeeded. `-i`
does not change this exit-code behaviour in this version — it only affects whether a
postprocessing-stage failure (distinct from extraction failure) is counted as a failure.
This is a meaningful nuance worth flagging for CLI design: a caller cannot use exit code
alone to distinguish "all items failed" from "some items failed, some succeeded" — both are
exit code 1. Per-item success/failure has to be tracked by parsing `ERROR:` lines / using
`--print`/`-J` output per item, not from the process exit code.

**"No subtitles available" is a distinct, milder failure mode — worth flagging since it's
the case most relevant to a transcript CLI.** Requesting a subtitle language that doesn't
exist for a video does **not** produce an `ERROR:`-level failure or a nonzero exit code; it
is silently skipped and the run reports success:

```
$ yt-dlp --skip-download --write-subs --sub-langs "zz-NoSuchLang" --print "%(id)s" \
    "https://www.youtube.com/watch?v=9wq3VHsL_bE"
9wq3VHsL_bE
EXIT=0
```

So "video is private/deleted/region-blocked" (hard failure, `ERROR:`, exit 1, would
abort under `--abort-on-error`) and "video exists but has no subtitles in the requested
language" (soft/no-op, exit 0, no error line) are **different failure classes** that a
caller needs to distinguish by inspecting stderr/output, not by exit code alone — exit code
0 does not mean "subtitles were written for every item."

---

## 6. Rate limiting / throttling

**Answer:** Yes, yt-dlp has several built-in sleep/delay knobs, but none are enabled by
default (all default to no sleep). YouTube rate-limiting (HTTP 429) on bulk requests,
*especially bulk subtitle downloads*, is a real, documented, currently-active problem with
these flags as the standard mitigation.

`--help` text (verbatim):

```
    --sleep-requests SECONDS        Number of seconds to sleep between requests
                                    during data extraction
    --sleep-interval SECONDS        Number of seconds to sleep before each
                                    download. This is the minimum time to sleep
                                    when used along with --max-sleep-interval
                                    (Alias: --min-sleep-interval)
    --max-sleep-interval SECONDS    Maximum number of seconds to sleep. Can only
                                    be used along with --min-sleep-interval
    --sleep-subtitles SECONDS       Number of seconds to sleep before each
                                    subtitle download
```

The `--help` examples section even ships a canned "sleep" recipe (verbatim):

```
    -t sleep                        --sleep-subtitles 5 --sleep-requests 0.75
                                    --sleep-interval 10 --max-sleep-interval 20
```

None of these have a nonzero default (I did not find a default value printed anywhere in
`--help`; absence of a stated default plus the "recipe" existing as an opt-in `-t` preset
implies the shipped default is 0/off) — **I did not independently re-verify the literal
default value in code**, so treat "defaults to 0" as inferred from `--help` phrasing, not
directly measured.

Documented evidence of YouTube throttling bulk/subtitle requests, via firecrawl developer
index:

- `yt-dlp/yt-dlp#106` — feature request ("[Feature Request] parameter to rate limit
  youtube api requests"): *"for channels with thousands of videos, youtube-dlp downloads
  hundreds or thousands of channel index pages at full speed, eventually resulting in the
  dreaded 429 blocking from youtube ... --sleep-interval is insufficient as this only
  pauses in between video downloads."* This issue's resolution **is** the `--sleep-requests`
  flag (the PR that closed it added it) — confirming `--sleep-requests` was purpose-built
  for exactly this channel/playlist-listing throttling problem, distinct from
  `--sleep-interval`'s per-download-only scope.
  https://github.com/yt-dlp/yt-dlp/issues/106

- `yt-dlp/yt-dlp#13831` — open issue, "[YouTube] Unable to download video subtitles: HTTP
  Error 429: Too Many Requests" — reporter hits 429 specifically on subtitle downloads
  (`--write-auto-subs --sub-langs ...`), described as intermittent/unstable. Still
  referenced/linked from a more recent issue (`#15709`) as of this index snapshot — i.e., an
  ongoing, not fully resolved, class of problem.
  https://github.com/yt-dlp/yt-dlp/issues/13831

  Pulled the full comment thread via `gh api repos/yt-dlp/yt-dlp/issues/13831/comments`.
  Maintainer (`bashonly`), first comment, quoted directly: *"This looks to be an evolution of
  the problem reported in #13770, which was fixed (at least for a while) by
  8820101aa3152e5f4811541c645f8b5de231ba8c. YT has likely imposed a much stricter rate-limit
  on subtitles requests since then. They could also be increasing their fingerprinting
  efforts. If you want to still be able to download the video when the subtitles download
  fails, then add `-i` (`--ignore-errors`) to your command."* This is a real maintainer-level
  admission that a prior fix (commit `8820101a`) only held "for a while" before YouTube
  tightened rate-limiting further specifically on **auto-translated/auto-generated**
  subtitle requests (several commenters, e.g. `AntonSamokat`, `zhenda-hub`, `KlfJoat`,
  independently narrow the trigger to `--write-auto-subs`/translated captions, not
  original-language subs, which download fine). Other maintainer (`seproDev`) guidance in
  the thread: use `--impersonate`/`curl_cffi` (browser TLS-fingerprint impersonation) as a
  workaround for the fingerprinting angle, and use the `-t sleep` preset alias
  (`--sleep-subtitles 5 --sleep-requests 0.75 --sleep-interval 10 --max-sleep-interval 20`)
  as the sleep-based mitigation — though multiple commenters after that point (`mozlima`,
  `m3m0m2`) report 429s persisting even with `--impersonate` and `--sleep-*` flags combined,
  so neither is a guaranteed fix. No one in the thread cites a precise request-volume
  threshold; `ms2048` reports subtitles for "hundreds of videos" eventually succeeding but
  "slowly," via a manual per-video retry loop with a separate download-archive for
  subtitles — i.e. the practical state of the art here is retry-with-backoff, not a flag that
  makes the problem go away.

- Secondary/community evidence (weaker, not primary source, but corroborating at a magnitude
  level): a `fabric` tool's troubleshooting doc explicitly says *"YouTube is rate limiting
  subtitle requests"* is a **common** issue and recommends `--sleep-requests 5` or "wait
  10–30 minutes"; community blog posts (Zenn, GitCode, VideoHelp forum) independently report
  the same 429-on-subtitles/bulk-channel-download pattern and the same
  `--sleep-requests`/`--sleep-interval` mitigation. None of these give a precise "volume
  threshold" number (e.g. "N requests before you get blocked") — reports describe it as
  happening after enough requests in a short window, with no consistently-cited exact count.
  **I could not find a precise documented volume threshold; treat any specific number as
  unverified.**

---

## 7. Playlist metadata available per item

**Answer:** `%(playlist_id)s`, `%(playlist_title)s`, `%(playlist_index)s`, and
`%(playlist_uploader)s` are all reliably populated for both a real playlist and a channel
tab. `%(playlist_count)s` is reliably populated for a real playlist but was **`NA` for the
channel tab** in this test. All five are `NA` for a single video URL with no `list=`
param.

(a) Real playlist (`playlist?list=PLF98rxtslw6s`, `--flat-playlist`, full enumeration):

```
$ yt-dlp --flat-playlist --simulate \
    --print "%(playlist_index)s|%(playlist_count)s|%(playlist_id)s|%(playlist_title)s|%(playlist_uploader)s|%(id)s" \
    "https://www.youtube.com/playlist?list=PLF98rxtslw6s"
1|3|PLF98rxtslw6s|Nancy Grace Roman Space Telescope|NASA|9wq3VHsL_bE
2|3|PLF98rxtslw6s|Nancy Grace Roman Space Telescope|NASA|sZfFevvUFUk
3|3|PLF98rxtslw6s|Nancy Grace Roman Space Telescope|NASA|6o3m9Bw67Os
```
All five fields populated, including `playlist_count` (3, correct).

(b) Channel URL (`@NASA/videos`, `--playlist-items 1-3`):

```
$ yt-dlp --flat-playlist --simulate --playlist-items 1-3 \
    --print "%(extractor_key)s|%(id)s|%(playlist_id)s|%(playlist_title)s|%(playlist_index)s|%(playlist_count)s|%(playlist_uploader)s" \
    "https://www.youtube.com/@NASA/videos"
Youtube|IwZVXmQdX1E|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Videos|1|NA|NASA
Youtube|90Kgw_SvK4w|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Videos|2|NA|NASA
Youtube|jHKf1eHp3eQ|UCLA_DiR1FfKNvjuUpBHmylQ|NASA - Videos|3|NA|NASA
```
`playlist_id`, `playlist_title`, `playlist_index`, `playlist_uploader` populated;
`playlist_count` is `NA` — YouTube channel tabs don't expose a total count up front the way
a bounded playlist does.

**Ruled out `--playlist-items` truncation as the cause of the `NA`** (i.e. confirmed this
is a real playlist-vs-channel-tab difference, not an artifact of limiting the item range):
applying the *same* `--playlist-items` limit to the real, bounded playlist still reports the
correct total count, and a second channel tab (`@NASA/shorts`) also reports `NA`:

```
# real playlist, under an item limit: count still populated correctly (3)
$ yt-dlp --flat-playlist --simulate --playlist-items 1-2 \
    --print "%(playlist_index)s|%(playlist_count)s" "https://www.youtube.com/playlist?list=PLF98rxtslw6s"
1|3
2|3

# a second channel tab (Shorts), same NA pattern
$ yt-dlp --flat-playlist --simulate --playlist-items 1-2 \
    --print "%(playlist_count)s" "https://www.youtube.com/@NASA/shorts"
NA
NA
```

This confirms the `NA` on channel tabs is a genuine property of the `youtube:tab` extractor
for channel listings (likely because a channel tab's total count isn't known upfront and
would require paging through the whole tab to compute — not independently confirmed in
source, but consistent with the observed behaviour and with the paginated `Downloading API
JSON` requests seen in Q3), not a side effect of limiting `--playlist-items`.

(c) Single video, no `list=` param:

```
$ yt-dlp --flat-playlist --simulate \
    --print "%(id)s|%(playlist_id)s|%(playlist_title)s|%(playlist_index)s|%(playlist_count)s|%(playlist_uploader)s" \
    "https://www.youtube.com/watch?v=9wq3VHsL_bE"
9wq3VHsL_bE|NA|NA|NA|NA|NA
```
All playlist fields `NA` as expected.
