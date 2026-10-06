# X post failures are told apart by reading yt-dlp's stderr

A YouTube fetch is classified by its exit code and whether a subtitle track was written. Every
non-zero exit counts as rate limiting and is retried. **An X post fetch also reads `yt-dlp`'s
stderr after a non-zero exit, and the extractor it reports.** X's permanent failures all exit 1,
the same as a 429:

- a post with no video;
- a `/video/N` the post doesn't have, or a `/photo/N` that selects a photo;
- a post that needs a login.

Classifying them by exit code alone would retry each one three times, about a minute of waiting,
for a result that cannot change.

These are the rules:

- **Who failed is checked before what failed.** An error from an extractor other than X's
  (`ERROR: [generic] …`, `Unsupported URL`) means a link-only post was followed to another site.
  That is a "not an X post" failure, whatever its words say. This matters because the same text,
  for example `No video formats found`, means "no video in this post" only when X's own extractor
  says it.
- **A success must come from X.** After a zero exit, `extractor_key` must be `Twitter`, and both
  the handle and the post id must have been reported. The post id identifies the transcript
  (ADR-0004), and the handle names its `channel`. Only such a success is written, so every X
  transcript holds a video from the post it is filed under.
- **Anything unrecognised is treated as rate limiting,** and retried.

## Considered options

- **Classify X failures by exit code only, like YouTube.** Rejected: every post with no video
  would wait out the whole retry ladder before failing.
- **Ask yt-dlp first, with a pre-flight query or `.info.json`.** Rejected: that costs a second
  request per fetch, and the spec keeps every fetch to one invocation.
- **Read stderr, for X posts only.** Chosen.

## Consequences

- The patterns match `yt-dlp`'s own wording, recorded from version 2026.08.19. If that wording
  changes, the failure is treated as rate limiting and retried. That is slower, but nothing wrong
  gets written.
- The login-required patterns come from reading the extractor's source code. No protected or
  age-restricted post could be reached to record one.
- A YouTube fetch is still classified by its exit code and track alone.
