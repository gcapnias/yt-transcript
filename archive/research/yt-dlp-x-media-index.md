# X `/photo/N` and `/video/N`: what N means (gcapnias/yt-transcript#7)

yt-dlp master checked: commit 51bab8a0116f4d8004c315706d809782607d5847, `yt_dlp/extractor/twitter.py`.

## 1. Is the URL form officially documented by X?
No. Nothing I found defines N, whether photos and videos count together, or whether it is 1-based.
Looked at:
- docs.x.com `llms.txt`, `x-api/llms.txt`, the v2 Data Dictionary, the Data Dictionary Reference and the Enterprise data dictionary (fetched as `.md`).
- The v1.1 pages at developer.x.com `.../v1/data-dictionary/object-model/extended-entities` and `/entities`. These now redirect to `https://docs.x.com/overview`, so the v1.1 contract is gone from the official site.
- help.x.com "Identifying information for a post or Moment" (https://help.x.com/en/using-x/post-and-moment-url). It returned 403 to curl. A web-search snippet says only that appending `/video/1` to a post URL renders a video player. I could not read the page, so that is unverified and it does not define N.

Only indirect evidence exists. The docs show these URLs as example `expanded_url` values of media entities, never as a spec:
- v2 data dictionary: `"expanded_url": "https://x.com/LovesNandos/status/1211797914437259264/photo/1"`, with `display_url` `pic.x.com/...` and `media_key`.
- Data Dictionary Reference: `https://x.com/TwitterDev/status/1304102743196356610/video/1`.
- Enterprise dictionary: "`expanded_url` ... Links to the media display page", example `.../photo/1`.
All examples are `/1`. Nothing covers N >= 2.

## 2. Official media-ordering contract
- v2: `attachments.media_keys` is an array of media keys on the Post (https://docs.x.com/x-api/fundamentals/data-dictionary.md). The docs do not say its order matches display order or the URL N. Media types are `animated_gif`, `photo`, `video`; "Media refers to any image, GIF, or video attached to a Tweet". There is no separate video ranking.
- v1.1 (Enterprise dictionary, https://docs.x.com/x-api/enterprise-gnip-2.0/fundamentals/data-dictionary.md): `extended_entities.media` is "the preferred metadata source for native media"; `entities.media` lists only the first photo. The same page says "Posts can only have one type of media attached... up to four photos... For videos and GIFs, one can be attached." That text is legacy, and issue #6210 below shows an image plus a video in one post. No ordering statement beyond it being an array.
- Closest official contract: an array of mixed-type media objects. Nothing equates it to the URL N.

## 3. yt-dlp behaviour (implementation, not X's contract)
Regex (line 271): `.../status/(?P<id>\d+)(?:/(?:video|photo)/(?P<index>\d+))?`. `video` and `photo` are interchangeable.

Lines 1351-1371:
```python
videos = traverse_obj(status, (
    (None, 'quoted_status'), 'extended_entities', 'media', lambda _, m: m['type'] != 'photo', {dict}))

if self._yes_playlist(twid, selected_index, video_label='URL-specified video number'):
    selected_entries = (*map(extract_from_video_info, videos), *extract_from_card_info(status.get('card')))
else:
    desired_obj = traverse_obj(status, (
        (None, 'quoted_status'), 'extended_entities', 'media', int(selected_index) - 1, {dict}), get_all=False)
    if not desired_obj:
        raise ExtractorError(f'Video #{selected_index} is unavailable', expected=True)
    elif desired_obj.get('type') != 'video':
        raise ExtractorError(f'Media #{selected_index} is not a video', expected=True)

    # Restore original archive id and video index in title
    for index, entry in enumerate(videos, 1):
        if entry.get('id') != desired_obj.get('id'):
            continue
        if index == 1:
            info['_old_archive_ids'] = [make_archive_id(self, twid)]
        if len(videos) != 1:
            info['title'] += f' #{index}'
        break
    return {**info, **extract_from_video_info(desired_obj), 'display_id': twid}
```
Permalink: https://github.com/yt-dlp/yt-dlp/blob/51bab8a0116f4d8004c315706d809782607d5847/yt_dlp/extractor/twitter.py#L1351-L1371

- The index is used only with `--no-playlist`. With the default `--yes-playlist` it is ignored and all videos are returned (upstream test "URL specifies video number but --yes-playlist", `playlist_mincount: 2`).
- Selection is `media[N-1]` over ALL `extended_entities.media`, 1-based, photos included. If that item is not `type == 'video'` it errors "Media #N is not a video" (an `animated_gif` also errors).
- The ` #index` suffix is *meant* to be the 1-based rank of the selected media among non-photo media. The `videos` list filters only `type != 'photo'`, so animated GIFs count too. The rank is found by matching media `id`, and the suffix is omitted when the post has exactly one such media. In practice the match is broken (see Live runs): on a multi-video post the selector path always reports `#1`.
- Intended design: URL N = all-media position, suffix = video rank. The two differ when a photo comes before the video.
- The upstream test for this post (https://github.com/yt-dlp/yt-dlp/blob/51bab8a0116f4d8004c315706d809782607d5847/yt_dlp/extractor/twitter.py#L748-L772) expects title `... #1` and id `1600649511827013632` for `.../1600649710662213632/video/2` with `noplaylist`. The live runs show that this video is the post's second video, so the test bakes in the bug.
- Other fields: the selector branch returns a single info dict, not a playlist. It sets `id` (media id), `display_id` (post id), `title`, formats, and `_old_archive_ids` (meant only for rank 1). It sets no `playlist_index`, `n_entries` or `playlist_count`, so the media `id` is the only per-video identity. The `--yes-playlist` path returns entries in order, each with the suffix (lines 1387-1388) and a `playlist_index`. Both are the rank among videos, not the URL N.

Related history:
- https://github.com/yt-dlp/yt-dlp/pull/5183 multi-video tweets.
- https://github.com/yt-dlp/yt-dlp/pull/5757 "Heed `--no-playlist` for multi-video tweets" (merged 2022-12-09, closes #5752) added `/video/N`.
- https://github.com/yt-dlp/yt-dlp/issues/6210: reporter used `https://twitter.com/hlo_again/status/1599108751385972737/video/2`, "This post has an image and video in it ... with --no-playlist it fails with `Video #2 is unavailable`". Observed evidence that on X `/video/2` counts the photo.
- https://github.com/yt-dlp/yt-dlp/pull/6211 (merged 2023-02-12): "Fixes the behavior of `--no-playlist` when image media is present. It also now adds the old archive id to the post and adds `#2` to the title like with playlist items." Its diff switched the regex to `(?:video|photo)`, selects `media[N-1]` from all media, and added the "Restore original archive id and video index in title" loop. So the all-media N and the video-rank suffix are a deliberate design.

## Summary
| Claim | Status |
|---|---|
| Meaning of N in `/photo/N`, `/video/N` | Not officially documented. Only `/1` examples as `expanded_url`. |
| Media array order in API | Documented only as an array of mixed-type media (`attachments.media_keys`, `extended_entities.media`). No guarantee tied to URL N. Legacy "one media type per post" text is outdated. |
| N counts photos and videos together, 1-based | yt-dlp behaviour (`media[N-1]` over all media), corroborated by issue #6210. Consistent with ADR 0004. |
| ` #N` suffix | Meant to be the rank among non-photo media (GIFs count), omitted if there is only one. Correct on the whole-post (playlist) path. On the selector path it is wrong for multi-video posts: observed `#1` for the second video. |
| Rank from other fields | Not exposed on the selector path. Only the media `id` tells videos apart. On the playlist path, `playlist_index` gives it. |

Implication: on a selector fetch, don't trust the suffix as the rank. Find the rank by listing the post and matching the media `id`. A missing suffix still means a single-video post, because the `len(videos) != 1` check does not depend on the broken match.

## Live runs (2026-10-06, yt-dlp 2026.08.19, no cookies)

Post `twitter.com/CTVJLaidlaw/status/1600649710662213632`. `-J` output was kept in gitignored scratch space and is not preserved.

| Input | Flags | `_type` | `id` (media) | duration | title suffix | `playlist_index` / `n_entries` |
|---|---|---|---|---|---|---|
| bare | none | playlist, 2 entries | `…038209` / `…013632` | 113.49 / 102.226 | `#1` / `#2` | 1 / 2, n_entries 2 |
| bare | `--no-playlist --playlist-items 1` | playlist, 1 entry (`playlist_count` 2) | `…038209` | 113.49 | `#1` | 1, n_entries 1 |
| `/video/1` | `--no-playlist` | video | `…038209` | 113.49 | `#1` | absent |
| `/video/2` | `--no-playlist` | video | `…013632` | 102.226 | **`#1`** | absent |

Findings:
- The post has two videos and no photos, so `/video/1` works.
- The selector path labels the second video `#1`, and also attaches `_old_archive_ids`, which the code reserves for index 1. The full playlist labels the same media id `#2`. So the selector path's suffix is wrong. The likely cause is the code's match loop, `entry.get('id') != desired_obj.get('id')`: if the GraphQL media dicts carry no `id` key, both sides are `None` and the first video always matches. This cause is an inference and was not checked against the raw API payload. yt-dlp's own test expects `#1` for `/video/2`, which bakes the bug in.
- No field in the selector response carries the rank: there is no `playlist_index`, `n_entries` or `playlist_count`. Only the media `id` tells the two videos apart.
- In the playlist response, the rank is reliable: `playlist_index` and the `#N` suffix agree, keyed by media `id`.
