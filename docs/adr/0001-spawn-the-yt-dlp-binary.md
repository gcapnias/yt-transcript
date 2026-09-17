# Spawn the `yt-dlp` binary rather than fetching subtitles in pure JavaScript

`yt-transcript` is a Node CLI, so the obvious shape is a pure-JS pipeline — `youtubei.js` or a
similar library talking to YouTube directly, with no external binary to install. We rejected that
and made the tool a wrapper that spawns the `yt-dlp` executable as a child process, preflighting
for it on PATH and failing with an actionable message when it is absent.

## Considered options

- **Pure JS (`youtubei.js` and friends).** Rejected as **not durable**. Subtitle retrieval depends
  on YouTube's player internals, which YouTube changes as a countermeasure; keeping up is a
  full-time adversarial job, and `yt-dlp` is the project that does it. A pure-JS tool works until
  it abruptly doesn't, and the failure lands on us.
- **`yt-dlp-ejs`.** Not applicable. It is a *challenge solver*, not a JS reimplementation of
  yt-dlp, and it is **not needed for subtitles**: verified live that `--write-auto-sub` output is
  byte-identical (122,555 bytes) with and without a JS runtime available.
- **Spawn the binary.** Chosen. Accepts an external dependency the user must install in exchange
  for someone else maintaining the adversarial surface.

## Consequences

- The tool has a runtime prerequisite outside npm. This is surfaced as a preflight check with a
  clear install message, not as a stack trace at first use.
- Every per-video fetch passes **`--js-runtimes node`**. It costs nothing today, silences
  yt-dlp's deprecation warning, and keeps the pipeline working if subtitles ever do begin to
  require a JS runtime. Node >= 22 is yt-dlp's floor for this flag, which is why `engines`
  demands it. Expanding a playlist or channel does not pass it: the rationale above is subtitle
  extraction, and a flat listing runs no player JavaScript.
- The `yt-dlp` spawn is the tool's only impure seam; everything above it is text in, text out.

Full evidence: `archive/research/yt-dlp-js-runtime-and-pure-js-paths.md`.
