# yt-dlp support for x.com / twitter.com (input for gcapnias/yt-transcript#4)

Binary: `yt-dlp 2026.08.19` (win_exe, stable@2026.08.19 594bd50c2). Runs done 2026-10-05, no cookies, no login.
Source read: https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.08.19/yt_dlp/extractor/twitter.py (line numbers below refer to this tagged file). Raw JSON dumps were kept in gitignored scratch space and are not preserved.

## 1. Extractors and URL shapes

`yt-dlp --list-extractors | grep -i twitter` returns exactly six: `twitter`, `twitter:amplify`, `twitter:broadcast`, `twitter:card`, `twitter:shortener`, `twitter:spaces`. (`periscope`, `periscope:user` are separate and not X-hosted.)

Host regex (`TwitterBaseIE._BASE_REGEX`, l.38): `https?://(?:(?:www|m(?:obile)?)\.)?(?:(?:twitter|x)\.com|<tor onion>)/`

| Extractor | Pattern (after host) | Notes |
|---|---|---|
| `twitter` (l.271) | `(?:i/web\|[^/]+)/status/<id>` or `statuses/<id>`, optional `/(video\|photo)/<n>` | Covers `/user/status/N`, `/i/status/N`, `/i/web/status/N`, mobile., m., www., twitter.com and x.com. |
| `twitter:card` (l.158) | `i/cards/tfw/v1/<id>`, `i/videos/<id>`, `i/videos/tweet/<id>` | Legacy embed URLs. |
| `twitter:amplify` (l.1395) | `https://amp.twimg.com/v/<uuid>` | Legacy; the starwars test URL now fails with HTTP 500 "Domain Not Found". |
| `twitter:broadcast` (l.1453) | `i/broadcasts/<id>` and `i/events/<id>` | `/i/events/` returns a playlist of the event's tweets, else falls through to a broadcast. |
| `twitter:spaces` (l.1599) | `i/spaces/<13 chars>` | Audio (or video) Spaces. |
| `twitter:shortener` (l.1772) | `https://t.co/<code>` or `tco:<code>` | Follows redirect and hands to the matching extractor (empirical: `t.co/NgrGz7tmPM` resolved to the poteto post). |

NOT supported (empirical, all `ERROR: Unsupported URL`, exit 1, via the generic fallback): profile `https://x.com/poteto`, `/poteto/likes`, `/search?q=`, `/i/lists/N`, `/hashtag/...`. There is no user-timeline, likes, list, search or thread extractor in the 2026.08.19 source (grep of `class` and `_VALID_URL` shows only the six above). I found no evidence one ever existed in yt-dlp main (I could not find a commit showing removal; absence of evidence). Issue #8522 "Twitter/X media page" was closed `not_planned`; bashonly: duplicate of #6450, "If it's even possible to implement anymore, it's unlikely to be worth the effort considering new ownership and API instability". #6450 (download all media from an account) is still open. Issue #14930 (Spaces from a profile URL) was declined by maintainers (bashonly: the expectation for a profile URL is "all the videos of the profile"; seproDev: "I don't think this should be added... create a plugin").
Threads: no thread/conversation extraction. A URL gives only that one post.

`fxtwitter.com` / `vxtwitter.com` are not in any `_VALID_URL`, but empirically yt-dlp resolves them to the `Twitter` extractor with `webpage_url=https://x.com/...` and `original_url=<fx url>` (generic extractor follows the redirect). Treat as works-today, not contractual. `/video/1` and `/photo/1` suffixes are accepted; with default playlist behaviour the index is ignored (poteto `/photo/1` returned the video); the index only takes effect with `--no-playlist` (`_yes_playlist`, l.~1311).

Data sources: GraphQL `TweetResultByRestId` (default, guest token, no login needed), legacy API (`--extractor-args twitter:api=legacy`), or syndication (`api=syndication`; also automatic fallback on HTTP 429) (l.1146-1200).

## 2. Failure modes (all exit code 1; yt-dlp uses 1 for any error)

Empirical:
- Text-only post / no media (`x.com/jack/status/20`, PTrubey, SpaceX, sputnik_jp, natecurtiss): `ERROR: [twitter] <id>: No video could be found in this tweet`. Source l.1383-1386 (`raise_no_formats(..., expected=True)`).
- Non-existent id (`x.com/x/status/1`): same "No video could be found" (GraphQL returns empty, so deleted/never-existing posts can look identical to media-less posts unless a tombstone is returned).
- Photo-only post / GIF-only: photos are filtered (`type != 'photo'`, l.1275), so same "No video could be found". Animated GIFs have `type: animated_gif`, are NOT filtered, so they are extracted as a short mp4 video without subtitles (source reading; I found no live GIF sample, the BAKKOOONN test post now gives "No video could be found").
- Link-only post whose t.co points elsewhere (0xROAS, gulf_news, AthleticsWeekly): the extractor falls back to `url_result(entities.urls[0].expanded_url)` (l.1378-1384) and follows to another extractor. Observed errors: `[generic] ...: HTTP Error 404`, or `[twitter] <id>: No video formats found!; please report this issue ...`. NASA post with a nasa.gov card: `Unsupported URL: https://www.nasa.gov/...` (the fallback URL, not the X URL, appears in the error).
- Suspended author (reposted source): `ERROR: [twitter] 1694928419052458133: Suspended` (the id in the message is the reposted tweet's id).
- Dead broadcast: `ERROR: [twitter:broadcast] <id>: Broadcast no longer exists`.

From source only (no live example or login available):
- Tombstone (deleted/withheld): `Twitter API says: <tombstone text>` (l.1096-1098).
- Protected: `TweetUnavailable` reason `Protected` -> `raise_login_required('You are not authorized to view this protected tweet')`.
- NSFW/age-restricted: reasons `NsfwLoggedOut` / `NsfwViewerHasNoStatedAge` -> `raise_login_required('NSFW tweet requires authentication')` (l.1103-1106). API errors containing "not authorized" also map to login-required. Needs `--cookies-from-browser` / `--cookies` (`is_logged_in` = `auth_token` cookie present). The yt-dlp test NSFW post (Rizdraws) now gives only "No video could be found" (stale).
- Other API errors: `Error(s) while querying API: <msg>`.
- Login is otherwise NOT needed for public video posts (all samples below ran with no cookies).

Multiple videos: a post with N>1 videos returns a **playlist** (`playlist_result`, l.1389-1392). Playlist `id` = post id; each entry `id` = that video's media id, `display_id` = post id, title gets suffix ` #1`, ` #2`; entries share the post's uploader/description/timestamp. Empirical: CTVJLaidlaw/status/1600649710662213632 -> playlist of 2 (entry ids 1600649511827038209 and 1600649511827013632, titles ending `#1`, `#2`). `--no-playlist` plus `/video/N` selects one. A single-video post returns a plain video, not a playlist (no suffix).

Quote posts: `videos = traverse_obj(status, ((None, 'quoted_status'), 'extended_entities', 'media', ...))` (l.1363-1365): the post's own videos come first, then the quoted post's. Empirical: Mai Yang's post 2102344659276099794 (own video + quote of poteto's talk) -> playlist of 2: entry #1 id 2102299487825805312 (own, 25:23), entry #2 id 2101938030122868736 (poteto's video, 38:01). Both carry the QUOTING author's uploader/title/description. A quote with no own video yields a single plain video from the quoted post.
Plain reposts: `_extract_status` returns `retweeted_status` instead of the wrapper (l.1201; fixed in PR #8016), so uploader/title/description become the ORIGINAL author's, id = original media; display_id = the URL's id.

Why id != post id (poteto example): `id` is the **media id** (`media.id_str`, l.1244 `extract_from_video_info`), not the tweet id. The media (`amplify_video/2101938030122868736`) was uploaded first, then attached to the tweet. Both are Snowflake ids; decoded timestamps: media 2101938030122868736 = 2026-09-21T07:34:13Z, tweet 2102050467505430555 = 2026-09-21T15:01:00Z (7.5 h later). The same media is reused by quotes (Mai Yang's entry #2 has that same id). `display_id` always holds the post id from the URL. Implication for the CLI: `id` is not the pasted post id and is not unique per post; use `display_id` for post identity and expect files named by `id`.

## 3. Metadata derivation (source l.1210-1241, `_real_extract`)

- `description`: `full_text` (else `text`) with `\n` replaced by a space. NOT stripped of t.co links (poteto description ends with `https://t.co/NgrGz7tmPM`). For reposts, it is the original's text.
- `title`: same text, remove every `\s+(https?://[^ ]+)` (t.co links and the whitespace before them), then `truncate_string(text, left=72)`: if len > 72 -> first 69 chars + `...`, else unchanged (`truncate_string`: `s[:left-3] + '...'`). If `user.name` exists, `title = f'{uploader} - {title}'`. So title = `<display name> - <text up to 72 chars>`; the uploader prefix is not counted in the 72. Newline->space happens before link stripping, which leaves double spaces (empirical: "production  this was ori..."). Multi-video entries append ` #N`. Empty-text post: title would be `<uploader> - ` (source only; no sample found). `fulltitle` = `title` (empirical identical).
- `uploader` = `user.name` (display name, e.g. "lauren", "Historic Vids"); `uploader_id` = `user.screen_name` (the @handle); `uploader_url` = `https://twitter.com/<handle>`.
- `channel_id` = numeric user id (`user_id_str` / `user.id_str`), e.g. poteto 2832427459. No `channel` / `channel_url`.
- `id` = media id; `display_id` = post id from URL; `webpage_url` = `https://x.com/<handle>/status/<post id>`.
- `timestamp` = `unified_timestamp(created_at)` (post time, not media upload time).
- Also: `view_count`, `like_count`, `repost_count`, `comment_count`, `age_limit` (18 if `possibly_sensitive`), `tags` (hashtags), `duration` from `video_info.duration_millis`/1000, `_old_archive_ids` = `twitter <post id>` for the first entry.

## 4. Subtitles

- Source of the VTT: the HLS master playlist of the video. `_extract_variant_formats` calls `_extract_m3u8_formats_and_subtitles` (l.43-50); `common.py` l.2289-2308 turns every `#EXT-X-MEDIA:TYPE=SUBTITLES` into `subtitles[LANGUAGE]` with `ext: vtt`. twitter.py never sets `automatic_captions` (only `subtitles`, l.1244-1267, 1325-1342).
- Why `subtitles`, not `automatic_captions`: the generic m3u8 code has no notion of auto-generated tracks, yet X's manifest labels them auto: `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="en (auto-generated)",...,LANGUAGE="en",CHARACTERISTICS="twitter.show-text-when-muted,twitter.auto-generated"` (curl of poteto's master m3u8). So the tracks are machine-generated but filed under `subtitles`; `automatic_captions` is always `{}` for X. For the CLI: `--write-subs` is what works; `--write-auto-subs` is irrelevant.
- Language key = manifest `LANGUAGE` (observed `en`, `de`); one track per video observed. It is the speech language (`de` for Alice Weidel's German-language video; `en` for the Kダブシャイン clip of English speech under a Japanese post).
- VTT caveat (empirical, from the VTT of media 2102470611381473280): cues contain proprietary inline tags, e.g. `<X-word-ms ms=19,200,180,... index=1 character_ranges=0-0,1-5,...>I hope that we will end this war</X-word-ms>`. A transcript parser must strip arbitrary `<...>` tags. The file is named by media id (`<media id>.en.vtt`), not post id.
- Frequency (16 distinct video entries sampled): subtitles on 7: long speech-heavy videos (55:41, 12:56, 38:01 x2 via quote, 25:23, 1:13:55) and some short ones (1:33; a 19 s clip). Absent on: 15 s, 24 s, 30 s x2, 45 s, 54 s clips, both videos of the 2-video CTV post, and a 30:50 TV interview (Bret Baier). So long speech videos usually have a track, short/music clips usually do not, not guaranteed. The "no subtitles" path will be common.
- Broadcasts and Spaces: no subtitle handling in their code (l.1450-1785); empirical: broadcast 1pKdRDvrQqQJW -> "has no subtitles"; Space 1DXGydznBYWKM -> `subtitles` NA (`live_status` `was_live`, no duration). Spaces errors from source: "Twitter Space ended and replay is disabled", "not started yet", "ended but not downloadable yet".

## 5. Samples (`yt-dlp -J --skip-download <url>`, no cookies)

| # | URL | id | display_id | title | description (first 100) | uploader / uploader_id | duration | subs | auto caps |
|---|---|---|---|---|---|---|---|---|---|
| 1 | x.com/poteto/status/2102050467505430555 | 2101938030122868736 | 2102050467505430555 | `lauren - here's how i shipped 2,500 PRs last month to production  this was ori...` | here's how i shipped 2,500 PRs last month to production  this was originally supposed to be for Curs | lauren / poteto | 38:01 | en | none |
| 2 | x.com/kw5hine/status/2106578219269005639 (non-English author) | 2102470611381473280 | 2106578219269005639 | `Kダブシャイン - ゼレ:  この戦争を終わらせたいです  この戦争をトランプ大統領が  終わらせてくれることを願っています` | ゼレ:  この戦争を終わらせたいです  この戦争をトランプ大統領が  終わらせてくれることを願っています　 https://t.co/cTiQ5Oo5WA | Kダブシャイン / kw5hine | 19 s | en | none |
| 3 | x.com/historyinmemes/status/1790637656616943991 (name != handle; short, no subs) | 1790637589910654976 | 1790637656616943991 | `Historic Vids - One of the most intense moments in history` | One of the most intense moments in history https://t.co/Zgzhvix8ES | Historic Vids / historyinmemes | 15 s | none | none |
| 4 | x.com/Alice_Weidel/status/1877462752526053592 (German) | 1877447109680435200 | 1877462752526053592 | `Alice Weidel - Now also as a video: The full conversation with @elonmusk!` | Now also as a video: The full conversation with @elonmusk! https://t.co/5BrLGV8viu | Alice Weidel / Alice_Weidel | 1:13:55 | de | none |
| 5 | twitter.com/CTVJLaidlaw/status/1600649710662213632 (multi-video, PLAYLIST of 2) | playlist 1600649710662213632; entries 1600649511827038209 (#1), 1600649511827013632 (#2) | 1600649710662213632 | `Jocelyn Laidlaw - How Kirstie Alley's tragic death inspired me to share more about my c...` (+ ` #1` / ` #2` on entries) | How Kirstie Alley's tragic death inspired me to share more about my cancer diagnosis. #colorectalcan | Jocelyn Laidlaw / JocelynVLaidlaw | 1:53, 1:42 | none | none |
| 6 | x.com/MaiYangAI/status/2102344659276099794 (Chinese; quote of poteto's video, PLAYLIST of 2) | playlist 2102344659276099794; entries 2102299487825805312 (#1), 2101938030122868736 (#2) | 2102344659276099794 | `Mai Yang - 又看了一遍 Lauren（@poteto）讲她过去一个月怎么合进约 2000 个 PR。这本来是给 Cursor Compile in L...` | 又看了一遍 Lauren（@poteto）讲她过去一个月怎么合进约 2000 个 PR。这本来是给 Cursor Compile in London 的分享，内容很干。她反复讲的那个比喻，我挺喜欢。 | Mai Yang / MaiYangAI | 25:23, 38:01 | en, en | none |
| 7 | x.com/DenisLabelle/status/2091337807939706928 | 2091335109718712320 | 2091337807939706928 | `Denis Labelle - 55 minutes of 🧠with Lauren @poteto` | 55 minutes of 🧠with Lauren @poteto https://t.co/Ms27AMKYQt | Denis Labelle / DenisLabelle | 55:41 | en | none |
| 8 | x.com/TopHeroes_/status/2001950365332455490 (short ad clip, no subs) | 2001841416071450628 | 2001950365332455490 | `Top Heroes - Forgot to close My heroes solo level up in my phone  ✨Unlock the fog,...` | Forgot to close My heroes solo level up in my phone  ✨Unlock the fog, discover new lands, expand you | Top Heroes / TopHeroes_ | 30 s | none | none |
| 9 | x.com/jack/status/20 (no media) | - | - | `ERROR: [twitter] 20: No video could be found in this tweet`, exit 1 | | | | | |

Other runs: BretBaier/status/1905393918977393099 (30:50, no subs), jamestalarico/status/2023659473466687994 (54 s, no subs), Clavicular0/status/2040047896960118912 (24 s, no subs), XcorpJP/status/2061667834326098213 (45 s, no subs), poteto/status/2099558917282181186 (12:56, en), poteto/status/2098165460714057863 (1:33, en), oshtru/status/1577855540407197696 (30 s, no subs), Space tweet MoniqueCamarra/status/1550101959377551360 (routes to `twitter:spaces`, id `1lPJqmBeeNAJb`, no subs), broadcast `i/broadcasts/1pKdRDvrQqQJW` (title `NASA, SpaceX launch Crew-13 to the ISS`, uploader Reuters, no subs).

Not found: a video-only post with empty text (none located); no live protected / NSFW / tombstone sample reproduced; no firecrawl search available (the `firecrawl search` CLI returned "requires a Firecrawl API key"), so candidates came from WebSearch, yt-dlp's own `_TESTS`, and the firecrawl developer-index HTTP endpoint (issues/PRs).

Environment note (not X-specific): `yt-dlp -v` crashes in this shell (`OSError: [WinError 4392]` in `utils/_jsruntime.py` resolving the `fnm_multishells` Node shim). Non-verbose runs work; relevant if the CLI ever passes `-v`.

## Summary table

| Question | Answer |
|---|---|
| Supported URLs | status posts on x.com/twitter.com/mobile./m./www. incl. `/i/status`, `/i/web/status`, `/video/N`, `/photo/N`; `t.co`; `/i/broadcasts`, `/i/events`; `/i/spaces`; legacy cards/amplify |
| Not supported | profiles, likes, media tab, lists, search, hashtags, threads (maintainers declined: #8522, #14930) |
| Login needed? | Not for public videos; NSFW/protected need cookies |
| No media | exit 1, `No video could be found in this tweet`; link-only posts follow the link |
| Multi-video / quote | playlist, entries `title #N`, entry id = media id, display_id = post id; quoted video appended after own |
| id vs post id | `id` = media id (earlier snowflake), `display_id` = post id |
| title | `<display name> - <text w/o URLs, newlines->spaces, truncated to 72 chars incl. "...">` |
| description | full text, t.co kept |
| Subtitles | only from HLS `EXT-X-MEDIA TYPE=SUBTITLES` (X auto-generated) in `subtitles`, never `automatic_captions`; VTT has `<X-word-ms ...>` tags; often absent on short clips; none for broadcasts/Spaces |

## Addendum: triage findings (2026-10-05)

Further local runs of yt-dlp 2026.08.19 while triaging #4:

- **`--no-playlist` does not reduce a bare multi-video or quote post to one video.** On
  `twitter.com/CTVJLaidlaw/status/1600649710662213632` and `x.com/MaiYangAI/status/2102344659276099794`,
  both entries are still printed.
- **`/video/N` selects the post's own Nth video, but only together with `--no-playlist`.** Without
  it, the suffix is ignored and every entry is returned. `/photo/N` behaves identically to
  `/video/N`.
- **N counts only the post's own media.** On the Mai Yang quote post (own video + quoted video),
  `/video/1` returns the own video, while `/video/2` fails: `ERROR: [twitter] <post id>: Video #2 is
  unavailable`. The quoted video is reachable only through the quoted post's URL.
- **An out-of-range N fails the same way** (`Video #3 is unavailable` on the two-video CTV post).
- **The handle in a URL can differ from the reported handle** (renames): `twitter.com/CTVJLaidlaw/…`
  reports `uploader_id` `JocelynVLaidlaw`, and its `webpage_url` echoes the input, not the
  current handle.
- **`extractor_key` is `Twitter`** for status posts, which can be used to confirm a link-only post
  was not handed to another site's extractor.
- **The X cue markup is removed cleanly by the existing tag stripping.** `cleanTrack` on the poteto
  track (882 `<X-word-ms>` cues) left no markup and dropped no word (word-aligned diff). It produced
  16 paragraphs of 80 to 1,153 words, because X tracks carry little sentence-end punctuation. The
  existing content check classifies the track as `manual`, since it looks for YouTube's `<c>`
  markup.

## Sources
- yt-dlp twitter extractor @2026.08.19: https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/twitter.py
- yt-dlp common.py (m3u8 subtitles): https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/common.py
- yt-dlp utils `truncate_string`: https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/utils/_utils.py
- Issue #8522 Twitter/X media page (not planned): https://github.com/yt-dlp/yt-dlp/issues/8522
- Issue #6450 download all media from account: https://github.com/yt-dlp/yt-dlp/issues/6450
- Issue #14930 Spaces from profile URL: https://github.com/yt-dlp/yt-dlp/issues/14930
- PR #8016 retweet extraction fix: https://github.com/yt-dlp/yt-dlp/pull/8016
- PR #7516 GraphQL API: https://github.com/yt-dlp/yt-dlp/pull/7516
- Local runs of yt-dlp 2026.08.19 against the URLs listed above.
