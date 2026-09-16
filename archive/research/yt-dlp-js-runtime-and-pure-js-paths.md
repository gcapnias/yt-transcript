# yt-dlp JS-runtime requirement (EJS) and pure-JS alternatives to the yt-dlp binary

Research date: 2026-09-16

## Answers

**Q1 — yt-dlp/ejs and `--js-runtimes`**

1. `yt-dlp-ejs` is a **challenge-solver script package** yt-dlp runs inside an external JavaScript engine to solve the JavaScript challenges YouTube's player now requires (signature/`n`-parameter deciphering and PO-Token/BotGuard-style challenges). It replaces yt-dlp's old built-in `JSInterp`/PhantomJS approach, which YouTube's current player code has made insufficient. It is *not* a general runtime abstraction on its own — it's the solver logic; the "runtime abstraction" (choosing/launching Deno, Node, QuickJS, Bun) is a separate part of yt-dlp core.
2. Use `--js-runtimes node` (auto-detects `node` on `PATH`) or `--js-runtimes node:/path/to/node` to pin an explicit binary. Node **is officially supported**, minimum version **22.0.0**, and the wiki setup guide lists it as a fully documented option — but it is explicitly **not first-class/default**: a yt-dlp maintainer states in PR #14864 that "Deno is the only runtime that is enabled by default... Deno has priority over all other runtimes (e.g. if `--js-runtime node` is passed, yt-dlp will still choose Deno unless the opt was preceded by `--no-js-runtimes`)... Deno is what we have been recommending everyone to use... because it carries the fewest security concerns and fewest known issues." The original announcement issue (#15012) ranks runtimes "in order of recommendation, from strongest to weakest": 1) Deno, 2) Node, 3) QuickJS, 4) QuickJS-ng, 5) Bun (deprecated). So: Node works and is supported, but is second-tier to Deno, and you must pass `--no-js-runtimes --js-runtimes node` (or otherwise disable Deno) if you want Node actually used when Deno is also present, since Deno silently wins by default.
3. `yt-dlp-ejs` is distributed as a **PyPI Python package** (`pip install -U "yt-dlp[default]"` pulls it in as the `default` extras group), containing bundled/compiled JS solver scripts. It is **bundled inside** the official PyInstaller executables (`yt-dlp.exe`, `yt-dlp_macos`, `yt-dlp_linux`) and the zipimport Unix binary — no extra action needed there. For pip/pipx installs without the `default` extra, or third-party packages (pacman, brew, etc.) that don't bundle it, you must either install the `yt-dlp-ejs` PyPI package directly (version must match yt-dlp's `pyproject.toml` pin), or enable auto-download via `--remote-components ejs:npm` (Deno/Bun only, pulls from npm) or `--remote-components ejs:github` (downloads from yt-dlp/ejs GitHub release assets, any runtime, may fail on IPv6-only/GitHub-blocked networks). It is not something you `npm install` for a Node-only setup — the npm route in yt-dlp's own mechanism is Deno/Bun-only.
4. **The warning is not purely cosmetic for subtitles.** YouTube's own PO-Token enforcement table (yt-dlp wiki, "PO Token Guide") lists three separate cases requiring PO Tokens: GVS (media streaming), Player (format URL fetching), and **Subs (subtitle requests)** — and states the default `web` client requires a PO Token for both GVS and Subs. Issue #13075 ("[youtube] Some subtitles require POT now?") and the fix release note "[ie/youtube] Add PO token support for subtitles" (2025.05.22) confirm subtitles were already affected by PO-Token enforcement over a year before this research. A live example from issue #17598 (Sept 2026) explicitly shows `Automatic captions for 1 languages are missing` in a run's debug log even while JS runtimes were configured, i.e., auto-caption availability can be gated by the same challenge-solving machinery as formats. So a subtitles-only workflow (`--write-auto-sub --skip-download`) is **not guaranteed to be unaffected** — it depends on which player client yt-dlp ends up using; some clients don't require a PO Token for Subs, but you cannot assume "no JS runtime -> subtitles still fine" in general, and this scenario should be tested empirically before relying on it.
5. There is **no announced hard version/date cutoff** found in the primary sources. What is documented is a stated trajectory, not a deadline: announcement #15012 says "Support for YouTube without a JavaScript runtime is now considered 'deprecated.' It does still work somewhat; however, format availability will be limited, and severely so in some cases (e.g. for logged-in users). Format availability without a JS runtime is expected to worsen as time goes on, and this will not be considered a 'bug'... It's also expected that, eventually, support for YouTube will not be possible at all without a JS runtime." Issue #17619 (Sept 2026) shows a user already hitting a **hard error** (not just degraded formats) for an age-restricted/logged-in scenario without a JS runtime — so the "eventual" breakage is already partially arriving for specific request types (age-gated/logged-in content), even though the general warning is still framed as a deprecation notice rather than a flat cutoff.

**Q2 — Pure-JS alternative to spawning the yt-dlp binary**

Bottom line: **not durably viable today as a replacement for yt-dlp** for a general-purpose subtitle+metadata CLI. `youtubei.js` (LuanRT/YouTube.js) is the only actively maintained, reasonably complete pure-JS candidate, and even it needs continual patching against YouTube's PO-Token/BotGuard changes and has open issues about transcript/format failures as recently as its `16.0.x` line. `ytdl-core` (fent) is paused since 2023; its fork `@distube/ytdl-core` is **archived** and its own README tells users to migrate to `youtubei.js`. Simple scraper-style transcript packages (`youtube-transcript`, `youtube-captions-scraper`, `youtube-transcript-api` npm packages) are unofficial HTML/timedtext scrapers with no PO-Token handling, and their own issue trackers show recurring "Transcript is disabled on this video" failures attributed to YouTube IP-banning scraper traffic — a structural weakness, not a bug to be fixed. Shelling out to the actual `yt-dlp` binary (directly via `child_process`, or via a thin wrapper like `yt-dlp-wrap`) remains the robust choice, because yt-dlp is the only project here with (a) a dedicated, versioned challenge-solver component (`yt-dlp-ejs`) under active co-development with yt-dlp core, and (b) a large, fast-moving maintainer team that ships fixes within days of YouTube player changes (191k-star repo, ~2,650 open issues, commits same day as this research). `yt-dlp-wrap` itself is a thin, low-maintenance wrapper (last npm publish 2023-09-13) — it doesn't need to be updated often because it just shells out, but that also means it inherits zero of yt-dlp's PO-Token logic itself; all the actual YouTube-compat work still happens in the yt-dlp binary it wraps.

---

## Detail

### Q1.1 — What `yt-dlp/ejs` is

From the yt-dlp wiki EJS setup guide:

> "To download from YouTube, yt-dlp needs to solve JavaScript challenges presented by YouTube using an external JavaScript runtime. This involves running challenge solver scripts maintained at yt-dlp-ejs... EJS replaces the prior JSInterp and PhantomJS based approach. For YouTube both are no longer used."
(`yt-dlp/yt-dlp` wiki, `EJS.md`)

The `yt-dlp/ejs` GitHub repo's own README describes itself tersely as "External JavaScript for yt-dlp supporting many runtimes" and documents build/runtime requirements (Deno ≥2.3, Node ≥22, QuickJS ≥2023-12-9, QuickJS-ng any version, Bun ≥1.2.11 ≤1.3.14/deprecated) but does not itself spell out the PoToken/signature purpose in the passages retrieved — that framing comes from the wiki and the original announcement issue (#14404):

> "Up until now, yt-dlp has been able to use its built-in JavaScript 'interpreter' to solve the JavaScript challenges that are required for YouTube downloads. But due to recent changes on YouTube's end, the built-in JS interpreter will soon be insufficient for this purpose. The changes are so drastic that yt-dlp will need to leverage a proper JavaScript runtime in order to solve the JS challenges."
(`yt-dlp/yt-dlp` issue #14404, "[Announcement] Upcoming new requirements for YouTube downloads")

So: **it is a challenge-solver script package** (JS source solving YouTube's `n`/signature and BotGuard/PO-Token-style JS challenges) that yt-dlp core invokes inside whichever JS runtime is configured — not a runtime itself, and not a general-purpose abstraction layer independent of yt-dlp.

### Q1.2 — Using Node instead of Deno

Wiki (`EJS.md`), Node section:

> "node — https://nodejs.org — Installation instructions: Minimum supported version: `22.0.0`. Download from https://nodejs.org/en/download/ or from your package manager. — Enable with `--js-runtimes node` or `--js-runtimes node:/path/to/node`. It is recommended to add this to your yt-dlp configuration file to avoid needing to pass it every time. — Notes: Runs code with *some* permissions restricted."

The `yt-dlp/ejs` README's own compatibility table:

| Runtime / engine | Required version |
|---|---|
| deno | `>=2.3` |
| node | `>=22` |

Your installed Node v24 satisfies this comfortably.

**Deno vs Node priority.** A yt-dlp maintainer, replying in PR #14864 to "isn't [supporting old Deno] similarly the case for node[?]", stated plainly:

> "Yes, but they are not first-class runtimes... Deno is the only runtime that is enabled by default. Deno has priority over all other runtimes (e.g. if `--js-runtime node` is passed, yt-dlp will still choose Deno unless the opt was preceded by `--no-js-runtimes`). Deno is what we have been recommending everyone to use. Why? Because it carries the fewest security concerns and fewest known issues. Lowering the minimum required version negates that."
(`yt-dlp/yt-dlp` PR #14864 discussion)

The original announcement issue #15012 ranks runtimes "in order of recommendation, from strongest to weakest": Deno (recommended for most users) > Node > QuickJS > QuickJS-ng > Bun (deprecated), and notes: "only `deno` is enabled by default; all others are disabled by default for security reasons."

**Practical implication for your case:** since Deno is "unavailable" per your warning message (not installed), passing `--js-runtimes node` should be sufficient on its own — Deno only "wins" over Node when *both* are present. But if you ever install Deno too, `--js-runtimes node` alone will silently be overridden by Deno; you'd then need `--no-js-runtimes --js-runtimes node:/path/to/node` to force Node.

### Q1.3 — Installing the EJS scripts themselves

Wiki (`EJS.md`), "Step 2: Install EJS challenge solver scripts (yt-dlp-ejs)":

| yt-dlp distribution | EJS scripts installation options |
|---|---|
| Official PyInstaller-bundled executable (`yt-dlp.exe`, `yt-dlp_macos`, `yt-dlp_linux`) | No additional action required — bundled. |
| Official zipimport binary (Unix `yt-dlp`) | No additional action required — bundled. |
| PyPI package (pip, pipx) | Install/upgrade with `default` dependency group, or enable npm downloads (Deno/Bun only), or enable GitHub downloads. |
| Third-party package (pacman, brew, etc.) | Depends whether the packager bundles `yt-dlp-ejs`; otherwise enable npm or GitHub downloads. |

Three concrete options documented:

1. **PyPI package**: `pip install -U "yt-dlp[default]"` (the `default` extras group includes `yt-dlp-ejs`), or install `yt-dlp-ejs` directly from PyPI — but "The version MUST match the version specified in yt-dlp's `pyproject.toml`... yt-dlp may bump the minimum version on updates without warning, and old versions will be ignored by yt-dlp."
2. **npm auto-download**: `--remote-components ejs:npm` — "This option only works with Deno and Bun runtimes, which support downloading npm packages on-the-fly." (Not applicable to a Node-only setup.)
3. **GitHub auto-download**: `--remote-components ejs:github` — downloads directly from `github.com/yt-dlp/ejs` release assets, works for any runtime including Node, but "may not work if GitHub and GitHub release assets are not accessible from your network... including if you are using yt-dlp with an IPv6 IP-only (e.g., `--force-ipv6`)."

The `yt-dlp/ejs` README confirms it's packaged as a Python wheel: "Installation is straightforward: `pip install -U yt-dlp-ejs`... distributed as a Python package through pip, with prebuilt wheels containing bundled JavaScript dependencies (meriyah and astring)." Since this research's Windows setup is presumably running the PyPI/pip-installed yt-dlp (given Node v24 is separately installed rather than a PyInstaller `.exe`), the actionable path is: confirm yt-dlp was installed with `pip install -U "yt-dlp[default]"` (or install `yt-dlp-ejs` directly, version-pinned to match).

### Q1.4 — Does this affect subtitle/caption extraction, or only formats?

This is **not clearly cosmetic for subtitles**. The yt-dlp wiki's "PO Token Guide" defines three separate enforcement surfaces:

> "There are currently three cases yt-dlp may require PO Tokens for video downloads, depending on the client used: GVS: Google Video Server requests (video streaming)... Player: Innertube `player` requests (fetch video format URLs)... Subs: Subtitle requests."

And the current enforcement table lists, for the `web` client (yt-dlp's typical primary client): `Subs, GVS` both require a PO Token, with the note "Only SABR formats available." Other clients vary — e.g. `web_embedded` and `android_vr` are listed "Not required" for their respective cases, `tv` "Not required."

Historical confirmation that this already broke subtitles specifically: issue #13075 "[youtube] Some subtitles require POT now?" (closed by yt-dlp release note "[ie/youtube] Add PO token support for subtitles", 2025.05.22) — i.e., yt-dlp had to add PO-Token plumbing specifically for the subtitle-fetch code path, meaning subtitle URLs are (at least for some clients) gated the same way format URLs are.

Live 2026 evidence: issue #17598 ("PO Token not working", Sept 1 2026) shows debug output where, even with both Node and Deno configured as JS runtimes, the log includes `Automatic captions for 1 languages are missing` — i.e., a JS-runtime/PO-Token-related failure mode directly manifesting as missing auto-captions, not just missing video formats.

**Conclusion:** Whether `--write-auto-sub --skip-download` is affected depends on which player client(s) yt-dlp selects for that run (controllable via `player_client` extractor arg) and whether that client's caption track requires a PO Token. The default `web` client's `Subs` column is PO-Token-gated, so relying on "no JS runtime -> subtitles still work" is not something the primary sources support as a general guarantee — it should be verified empirically for the specific client/config in use, and a JS runtime should be treated as needed for subtitle reliability, not just formats.

### Q1.5 — Is there a hard deadline?

No specific version number or calendar date was found in any primary source for when non-JS-runtime YouTube extraction will stop working. What is documented is a one-way trend with a repeated non-committal on timing:

> "Support for YouTube without a JavaScript runtime is now considered 'deprecated.' It does still work somewhat; however, format availability will be limited, and severely so in some cases (e.g. for logged-in users). Format availability without a JS runtime is expected to worsen as time goes on, and this will not be considered a 'bug' but rather an inevitability for which there is no solution. It's also expected that, eventually, support for YouTube will not be possible at all without a JS runtime."
(`yt-dlp/yt-dlp` issue #15012, "[Announcement] External JavaScript runtime now required for full YouTube support")

Evidence the "eventually" is already partly arriving in narrower cases: issue #17619 (Sept 2026) shows a user hitting what they describe as "the hard Error which prevented it from listing the formats" for an age-restricted/logged-in download without a JS runtime, with a maintainer reply clarifying: "for logged in users it is expected that you need a JS runtime... JS runtimes are intended for making all the formats available instead of just a small subset." So: **degraded-but-working today for anonymous/simple downloads, already hard-broken today for some logged-in/age-gated cases, trending toward full breakage with no committed date.**

---

### Q2.1–2.3 — Candidate packages, maintenance status, and coverage

| Package | Latest npm publish | Weekly downloads (npm, week of 2026-09-05) | GitHub repo status | Auto-generated captions? | Playlist enumeration? |
|---|---|---|---|---|---|
| **youtubei.js** (`youtubei.js`, LuanRT/YouTube.js) | 2026-08-13 (v18.0.0) | 118,970 | Active: not archived, pushed 2026-09-16, 5,317 stars, 101 open issues | Yes, via `getTranscript()`/`get_transcript` Innertube endpoint — but with open issues (#1102, #866) about transcript panels missing/400 errors on some videos as recently as v16.x | Yes, via `getPlaylist()` — historical issues (#574, #575, "getPlaylist not returns full result", "=> 400 Error") suggest occasional breakage tied to YouTube-side changes, apparently later patched |
| **ytdl-core** (fent/node-ytdl-core, original) | dist-tag latest 4.11.5 (registry data was ambiguous on exact date; GitHub repo last pushed 2025-11-10) | 249,024 (high, but largely legacy/transitive installs — see status below) | Not archived, but README states: "Active development on this repository has been paused since 2023-07-14," community-maintained only, PRs not merged, recommends `@distube/ytdl-core` fork | Not verified as reliable; project itself is paused | Not verified; project itself is paused |
| **@distube/ytdl-core** | 2025-06-13 (v4.16.12) | 44,426 | **Archived = true** on GitHub. README: "@distube/youtube depends on youtubei.js from now on. This fork will be no longer maintained." Recommends youtubei.js. | Not being developed further | Not being developed further |
| **youtube-captions-scraper** | 2024-02-28 (v2.0.3) | 3,674 | Not checked for archive status; low download count and 2-year-stale publish suggest low maintenance | Scrapes caption tracks directly; no PO-Token handling documented | No — captions only, not general metadata/playlist |
| **yt-dlp-wrap** | 2023-09-13 (v2.3.12) | 4,619 | GitHub repo lookup (`foxesdocode/yt-dlp-wrap`, per npm `repository` field) returned 404 via GitHub API at research time — **could not verify current repo location/activity**; flagging as unverified rather than guessing | N/A — shells out to yt-dlp binary, inherits yt-dlp's own subtitle support entirely | N/A — same |
| **youtube-transcript** (Kakulukian/youtube-transcript) | 2026-04-25 (v1.3.1) | 124,529 | Active: not archived, pushed 2026-04-25, 584 stars, 31 open issues | Manually-authored and auto captions both fetched via timedtext scraping (no PO-Token handling) — but **recurring, unresolved failure mode**: issue #11 "Error: Transcript is disabled on this video" and issue #42 both attribute failures to YouTube IP-banning the scraping approach, not a fixable bug. A commenter in #11 states: "I discovered this library is just a scrapper. Google banned a lot of public IP's from being able to do that... if youre stuck on this, `youtubei.js` worked for me but its a bit more involved." | No — transcript-only, no playlist/metadata support |
| **youtube-transcript-api** (npm, 0x6a69616e) | 2025-06-26 (v3.0.6) | 8,503 | Described in its own npm metadata as "based on reverse-engineered youtube-transcript.io" — i.e., depends on a **third-party proxy site**, not directly on YouTube; an additional point of failure outside YouTube's own changes | Unverified reliability against YouTube directly (indirect dependency) | No |

Notes on evidence quality:
- `ytdl-core` (fent) weekly download count (249k) is almost certainly inflated by transitive/legacy dependents rather than reflecting current recommended usage — the project's own README tells users it is paused and points at the fork, and that fork in turn is archived and points at `youtubei.js`. Treat the download number as a lagging indicator, not a maintenance signal.
- `youtubei.js`'s own issue tracker shows it is still actively chasing YouTube changes as of its `16.0.x`–`18.0.0` releases: issue #1119 "v16.0.1 - LOGIN_REQUIRED bot detection blocking videoDetails on clients", #1124 "16.0.1 YouTube Video Download Failing with 403 Error for deciphered URL" (explicitly notes "functioned correctly until January 22nd, 2025" then broke), #1101 "16.0.1 `getTrending()` function broken due to the removal of the aggregated trending page." These show a pattern consistent with the rest of the ecosystem: YouTube changes break the library periodically, and fixes follow with some lag, not instantly.
- Playlist enumeration in `youtubei.js` is not proven broken today — the specific open/closed issues found (#574, #575) are from an earlier version (8.2.0) and were not confirmed still open in the current 16–18.x line in the passages retrieved; flagging this as **not fully re-verified against the current release** rather than asserting it's fine.

### Q2.4 — Bottom line, skeptical

A pure-JS pipeline is **not a durable, general-purpose replacement for yt-dlp today**:

- The two "traditional" pure-JS downloader libraries (`ytdl-core` and its most popular fork `@distube/ytdl-core`) have both effectively **conceded defeat**: the original is unmaintained since mid-2023, and its actively-forked successor is archived with an explicit README pointer to `youtubei.js`.
- `youtubei.js` is the only candidate under active development with the surface area (metadata, transcripts, playlists) the task needs, but its own issue tracker shows it is running the same treadmill yt-dlp is — chasing YouTube's bot-detection/BotGuard/PO-Token changes release to release, with recent (2026) breakage reports (#1119, #1124, #1101) that took real engineering time to diagnose and patch. It does not, by itself, solve BotGuard/PO-Token generation — issue #674 shows the maintainers had to be asked to even accept a `poToken` parameter, meaning callers are expected to source PO Tokens themselves (e.g. via a separate BotGuard-solving tool), which reintroduces exactly the kind of JS-challenge-solving complexity yt-dlp centralizes in `yt-dlp-ejs`.
- The dedicated transcript-only scraper packages (`youtube-transcript`, `youtube-transcript-api`, `youtube-captions-scraper`) are the least robust of all: they scrape either YouTube's timedtext endpoint directly with no PO-Token/BotGuard handling, or (in the `youtube-transcript-api` npm package's case) a third-party reverse-engineered proxy site. `youtube-transcript`'s own issue tracker documents an **unfixable-by-design failure mode** — YouTube IP-banning the scraping traffic — with a maintainer/commenter effectively admitting there's no code fix, only "use a proxy" or "switch to `youtubei.js`."
- `yt-dlp` itself, by contrast, has a dedicated versioned component (`yt-dlp-ejs`) co-developed with yt-dlp core specifically to keep pace with YouTube's JS-challenge changes, a large active maintainer base, and same-day commit activity as of this research date. Wrapping the actual yt-dlp binary (via `child_process` directly, or a thin wrapper like `yt-dlp-wrap`) inherits all of that ongoing maintenance for free, at the cost of a binary dependency and process-spawn overhead.

**Recommendation:** for a subtitles + metadata CLI that needs to keep working through 2026's ongoing YouTube churn, spawning the `yt-dlp` binary (with a Node.js JS runtime configured per Q1, or Deno as primary with Node fallback) remains the robust choice. If a pure-JS path is desired for deployment-simplicity reasons (no external binary), `youtubei.js` is the only defensible candidate today, but it should be treated as **requiring the same kind of "expect breakage, watch for patches" operational posture as yt-dlp itself** — not as a lower-maintenance alternative — and a PO-Token/BotGuard-solving strategy (e.g. a `bgutil`-style provider) will likely still be needed for reliable access to protected content and possibly for subtitle tracks (see Q1.4).

Unverifiable / flagged items:
- Could not confirm the current canonical GitHub repository for the npm package `yt-dlp-wrap` (the `repository` field in its npm metadata, `github.com/foxesdocode/yt-dlp-wrap`, returned 404 via the GitHub API at research time — it may have been renamed, deleted, or the metadata may be stale). Its last npm publish was 2023-09-13; given it's a thin wrapper this is less concerning than for a library with its own YouTube-parsing logic, but recent maintenance could not be directly verified.
- Whether `youtubei.js`'s playlist enumeration (`getPlaylist()`) is currently reliable against the present-day (v16–18.x) YouTube frontend was not directly confirmed — the relevant open/fixed issues found in the index were from the older 8.2.0 release line.
- Whether the default `web` client's PO-Token requirement for `Subs` (per the PO Token Guide table) actually triggers in a plain `--write-auto-sub --sub-lang en --skip-download` invocation without any other flags was not directly tested (no network downloads were run per task constraints); this is inferred from the documented enforcement table and issue history, not from a fresh reproduction.

---

## Sources

- [yt-dlp/ejs README](https://github.com/yt-dlp/ejs) — accessed 2026-09-16
- [yt-dlp/ejs README (raw)](https://raw.githubusercontent.com/yt-dlp/ejs/HEAD/README.md) — accessed 2026-09-16
- [yt-dlp wiki: External JS Scripts Setup Guide (EJS.md)](https://github.com/yt-dlp/yt-dlp/wiki/EJS) — accessed 2026-09-16
- [yt-dlp wiki: PO Token Guide](https://github.com/yt-dlp/yt-dlp-wiki/blob/master/PO%20Token%20Guide.md) — accessed 2026-09-16
- [yt-dlp/yt-dlp issue #14404 — [Announcement] Upcoming new requirements for YouTube downloads](https://github.com/yt-dlp/yt-dlp/issues/14404) — accessed 2026-09-16
- [yt-dlp/yt-dlp issue #15012 — [Announcement] External JavaScript runtime now required for full YouTube support](https://github.com/yt-dlp/yt-dlp/issues/15012) — accessed 2026-09-16
- [yt-dlp/yt-dlp PR #14864 discussion — Deno < 2.0.0 support / first-class runtime status](https://github.com/yt-dlp/yt-dlp/issues/14864) — accessed 2026-09-16
- [yt-dlp/yt-dlp issue #17598 — PO Token not working (Sept 2026)](https://github.com/yt-dlp/yt-dlp/issues/17598) — accessed 2026-09-16
- [yt-dlp/yt-dlp issue #17619 — Can't download age restricted video despite cookies](https://github.com/yt-dlp/yt-dlp/issues/17619) — accessed 2026-09-16
- [yt-dlp/yt-dlp issue #13075 — [youtube] Some subtitles require POT now?](https://github.com/yt-dlp/yt-dlp/issues/13075) — accessed 2026-09-16
- [yt-dlp/yt-dlp issue #16256 — n challenge solver failed / yt-dlp-ejs bundling clarification](https://github.com/yt-dlp/yt-dlp/issues/16256) — accessed 2026-09-16
- [yt-dlp/yt-dlp issue #16118 — Provider "deno" returned an invalid response](https://github.com/yt-dlp/yt-dlp/issues/16118) — accessed 2026-09-16
- [yt-dlp/yt-dlp issue #15684 — n challenge solver failed in spite of prerequisites](https://github.com/yt-dlp/yt-dlp/issues/15684) — accessed 2026-09-16
- [LuanRT/YouTube.js repository](https://github.com/LuanRT/YouTube.js) — accessed 2026-09-16
- [LuanRT/YouTube.js issue #674 — Allow passing poToken for unblock YouTube restrictions](https://github.com/LuanRT/YouTube.js/issues/674) — accessed 2026-09-16
- [LuanRT/YouTube.js issue #1119 — v16.0.1 LOGIN_REQUIRED bot detection blocking videoDetails](https://github.com/LuanRT/YouTube.js/issues/1119) — accessed 2026-09-16
- [LuanRT/YouTube.js issue #1124 — 16.0.1 YouTube Video Download Failing with 403 Error for deciphered URL](https://github.com/LuanRT/YouTube.js/issues/1124) — accessed 2026-09-16
- [LuanRT/YouTube.js issue #1101 — getTrending() broken due to removal of aggregated trending page](https://github.com/LuanRT/YouTube.js/issues/1101) — accessed 2026-09-16
- [LuanRT/YouTube.js issue #1102 — get_transcript request failed with status 400](https://github.com/LuanRT/YouTube.js/issues/1102) — accessed 2026-09-16
- [LuanRT/YouTube.js issue #574 / #575 — getPlaylist 400 error / incomplete results](https://github.com/LuanRT/YouTube.js/issues/574) — accessed 2026-09-16
- [distubejs/ytdl-core README (raw) — deprecation notice](https://raw.githubusercontent.com/distubejs/ytdl-core/master/README.md) — accessed 2026-09-16
- [fent/node-ytdl-core README (raw) — paused since 2023-07-14](https://raw.githubusercontent.com/fent/node-ytdl-core/master/README.md) — accessed 2026-09-16
- [Kakulukian/youtube-transcript issue #11 — Error: Transcript is disabled on this video](https://github.com/Kakulukian/youtube-transcript/issues/11) — accessed 2026-09-16
- [Kakulukian/youtube-transcript issue #42 — VPN/transcript fetching not working](https://github.com/Kakulukian/youtube-transcript/issues/42) — accessed 2026-09-16
- npm registry metadata (fetched via `registry.npmjs.org`), accessed 2026-09-16:
  - [youtubei.js](https://www.npmjs.com/package/youtubei.js)
  - [@distube/ytdl-core](https://www.npmjs.com/package/@distube/ytdl-core)
  - [ytdl-core](https://www.npmjs.com/package/ytdl-core)
  - [youtube-captions-scraper](https://www.npmjs.com/package/youtube-captions-scraper)
  - [yt-dlp-wrap](https://www.npmjs.com/package/yt-dlp-wrap)
  - [youtube-transcript](https://www.npmjs.com/package/youtube-transcript)
  - [youtube-transcript-api](https://www.npmjs.com/package/youtube-transcript-api)
- npm download-count API (`api.npmjs.org/downloads/point/last-week/<package>`), queried 2026-09-16 for the week of 2026-09-05 to 2026-09-11
- GitHub REST API repo metadata (`api.github.com/repos/<owner>/<repo>`), queried 2026-09-16 for stars/open-issues/archived/pushed_at on: `yt-dlp/yt-dlp`, `LuanRT/YouTube.js`, `distubejs/ytdl-core`, `fent/node-ytdl-core`, `Kakulukian/youtube-transcript`
