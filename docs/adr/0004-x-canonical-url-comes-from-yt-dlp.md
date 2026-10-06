# The canonical X post URL comes from yt-dlp's report, not from the input

A transcript is identified by its frontmatter `url`. For YouTube, that canonical form is derived
from the input alone, by text parsing with no network call. **For an X post, the canonical
`https://x.com/i/status/<post id>` is built from the post id that `yt-dlp` reports
(`display_id`) when it fetches the post**, not from what the user typed. The input cannot supply
it reliably: a `t.co` link carries no post id at all, and `id` is the media id, which every post
quoting the video shares.

A post can carry several videos, and photos too. A trailing `/video/N` or `/photo/N` selects item N
of the post's media, photos included, so the input's N is not the video's number. The canonical
URL records the fetched video's **rank among the post's videos**, which `yt-dlp` reports as a
` #N` suffix on `title`: `…/status/<post id>/video/N` for N ≥ 2. The first video has no suffix, so
the bare post URL and its first video are the same transcript. A `t.co` link to a later video is
numbered correctly for the same reason, because the number comes from the report, not the link.

## Considered options

- **Canonicalise from the input, like YouTube.** Rejected: `t.co` inputs could not be accepted,
  and two spellings of the same post would produce two transcripts.
- **Handle form, `https://x.com/<handle>/status/<post id>`, from the reported handle.** Chosen
  first, for readability, and shipped in v0.2.0. Replaced: handles are case-insensitive and get
  renamed, so the same post could end up with two identities. The handle is still recorded, in
  `channel`.
- **Video number from the input's `/video/N`, or from `webpage_url`.** Rejected: that N counts
  photos too, and a short link has none.
- **Handle-free form, post id and video rank from yt-dlp's report.** Chosen.

## Consequences

- Before fetching, an X input's identity is not known, so an "already on disk" check can only run
  after `yt-dlp` has reported on the post. No X batch exists (`yt-dlp` cannot expand profiles or
  threads), so for now this costs nothing.
- The URL no longer shows whose post it is; read `channel` for that.
- A transcript written by v0.2.0 carries the handle form. Fetching the same post again writes a
  second transcript rather than overwriting it, because the `url`s differ. Delete the old file
  if that matters.
- The video number depends on `yt-dlp`'s title format (` #N`). If that format changes, every
  video is read as the first, and later videos would overwrite the first one's transcript.
