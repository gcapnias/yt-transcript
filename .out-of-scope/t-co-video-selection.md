# Selecting a post's later video through a `t.co` link

A `t.co` link to an X post always fetches the post's first video, even when the link was shared
from a later one. yt-transcript does not resolve `t.co` redirects itself to recover which video was
meant.

## Why this is out of scope

The video selector does not survive X's redirects, so `yt-dlp` never sees it. Re-checked on
2026-10-08 with `curl -sIL -A curl`, the user agent `yt-dlp`'s `TwitterShortenerIE` sends:

```text
https://t.co/LOTC1G911U
  301 -> https://twitter.com/CTVJLaidlaw/status/1600649710662213632/video/1
  307 -> /CTVJLaidlaw/status/1600649710662213632
  307 -> /JocelynVLaidlaw/status/1600649710662213632
```

A direct `…/video/2` URL is redirected to the bare post the same way. Only the first hop names the
video, so the one fix would be to read that hop ourselves before fetching. That conflicts with how
the tool is built:

- **No network call while parsing a target.** Reading a target is pure, and the parser says that no
  network call may be added there. Moving the lookup into the fetch layer would make a fetch two
  requests, and the tool keeps a fetch to one `yt-dlp` invocation (ADR-0006 rejected a second
  invocation for the same reason).
- **It rests on X's undocumented behaviour.** The fix only works while X keeps `/video/N` in the
  first hop of a redirect it owns. If that changes, the lookup silently stops working.
- **The case is rare, and has a workaround.** It only matters for a `t.co` link into a post carrying
  more than one video. The post URL with `/video/N` already fetches the right video. No real `t.co`
  link to a second video has ever been captured.

The behaviour itself is documented as a limitation in the glossary (**Post**), in ADR-0004 and in
the README.

## Prior requests

- #8: "A `t.co` link to a post's later video fetches the first video instead"
