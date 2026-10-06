# The canonical X post URL comes from yt-dlp's report, not from the input

A transcript is identified by its frontmatter `url`. For YouTube, that canonical form is derived
from the input alone, by text parsing with no network call. **For an X post, the canonical
`https://x.com/<handle>/status/<post id>` is built from the handle and post id that `yt-dlp`
reports when it fetches the post**, not from what the user typed. The input cannot supply it
reliably: `/i/status/<id>`, `/i/web/status/<id>` and `t.co` links carry no handle at all, and
handles are case-insensitive and get renamed. For example, `twitter.com/CTVJLaidlaw/status/…`
reports the handle `JocelynVLaidlaw`.

A post can carry several videos, and `/video/N` (or `/photo/N`, which `yt-dlp` treats the same)
selects one of them. The canonical URL keeps that choice: `…/status/<post id>/video/N` for
N ≥ 2. Video 1 has no suffix, so the bare post URL and `/video/1` are the same transcript.

## Considered options

- **Canonicalise from the input, like YouTube.** Rejected: `/i/status` and `t.co` inputs could not
  be accepted, and two spellings of the same post would produce two transcripts.
- **Handle-free `https://x.com/i/status/<post id>`.** It is derivable from most inputs and never
  changes, but the URL no longer shows whose post it is. Rejected in favour of readability.
- **Handle form, taken from yt-dlp's report.** Chosen.

## Consequences

- Before fetching, an X input's identity is not known, so an "already on disk" check can only run
  after `yt-dlp` has reported on the post. No X batch exists (`yt-dlp` cannot expand profiles or
  threads), so for now this costs nothing.
- If the author later renames their handle, fetching the same post again produces a second
  transcript under the new URL. This was accepted as rare.
