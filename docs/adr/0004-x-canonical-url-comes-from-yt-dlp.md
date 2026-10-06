# The canonical X post URL comes from yt-dlp's report, not from the input

A transcript is identified by its frontmatter `url`. For YouTube, that canonical form is derived
from the input alone, by text parsing with no network call. **For an X post, the canonical
`https://x.com/i/status/<post id>` is built from the post id that `yt-dlp` reports
(`display_id`) when it fetches the post**, not from what the user typed. The input cannot supply
it reliably: a `t.co` link carries no post id at all, and `id` is the media id, which every post
quoting the video shares.

A post can carry several videos, and photos too. A trailing `/video/N` or `/photo/N` selects item N
of the post's media, photos included, so the input's N is not the video's number. The canonical
URL records the fetched video's **rank among the post's videos**: `…/status/<post id>/video/N`
for N ≥ 2. The first video has no suffix, so the bare post URL and its first video are the same
transcript.

The rank comes from `yt-dlp` too, but its report can be trusted only in some cases
(gcapnias/yt-transcript#7):

- **Whole-post fetch** (no selector): the rank is `playlist_index`, and the ` #N` title suffix
  agrees with it. One invocation.
- **No ` #N` suffix**: the post has one video, so this is video 1, selector or not. One invocation.
- **Selector fetch of a multi-video post** (no `playlist_index`, suffix present): `yt-dlp`
  2026.08.19 numbers every video `#1` here, the second included. Its Twitter extractor finds the
  rank by matching media dicts on an `id` key that is most likely absent, so the first video always
  matches. That cause is inferred from the code, not confirmed against the raw API payload, and
  upstream's own test expects `#1` for `/video/2`. So the suffix is ignored. The post is listed in
  a second, list-only invocation (`--yes-playlist`, nothing written), and the fetched media `id`
  (the only field that tells the videos apart) is looked up in it. If the list lacks it, the fetch
  fails. It never falls back to video 1, because that fallback is how a later video's transcript
  overwrote the first's.

A `t.co` link never reaches the selector path. X redirects it to the bare post (verified
2026-10-06: `t.co/…` → `twitter.com/<handle>/status/<id>/video/1` → 307 to `/<handle>/status/<id>`,
and `/video/2` redirects the same way). So it is always a whole-post fetch of the first video,
numbered correctly, but a `t.co` link to a later video fetches the first one instead.

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
- **Video rank from the ` #N` title suffix on every fetch.** Chosen first, for its single
  invocation. Replaced: on a selector fetch of a multi-video post the suffix is always `#1`, so
  `/video/2` overwrote video 1's transcript.
- **List the post on every fetch, or before fetching.** Rejected: it doubles the requests of the
  common case, a whole post or a single-video post, whose own report is right.

## Consequences

- Before fetching, an X input's identity is not known, so an "already on disk" check can only run
  after `yt-dlp` has reported on the post. No X batch exists (`yt-dlp` cannot expand profiles or
  threads), so for now this costs nothing.
- The URL no longer shows whose post it is; read `channel` for that.
- A transcript written by v0.2.0 carries the handle form. Fetching the same post again writes a
  second transcript rather than overwriting it, because the `url`s differ. Delete the old file
  if that matters.
- Selecting a video of a multi-video post costs two `yt-dlp` invocations, not one. Once upstream
  fixes the selector path's numbering, the listing can be dropped. That is a separate change, and it
  should be verified against a live `/video/2` fetch first.
- The "single video" signal still depends on `yt-dlp`'s title format (` #N`). If the suffix
  disappears, a selector fetch of a multi-video post reads as video 1 without listing, and the
  overwrite returns. If the suffix starts appearing on single-video posts, those fetches cost a
  listing but are still numbered right.
- A listing that cannot find the fetched video is a post failure (`unlisted-video`), never retried.
  A 429 on the listing is retried with its fetch, as one attempt.
