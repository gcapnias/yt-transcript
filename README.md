# yt-transcript

Turns YouTube videos into Markdown transcripts that read as prose, for use as agent
input or reference material. It produces transcripts, never summaries.

Each fetch downloads a subtitle track, cleans it into paragraphs, and writes one
Markdown file under `transcripts/` with frontmatter describing the video. A catalog
at `transcripts/README.md` indexes every transcript on disk.

## Prerequisites

- **Node >= 22**
- **`yt-dlp`** on `PATH` — every download is a `yt-dlp` spawn; nothing is bundled

## Usage

Fetch one video, by URL or by bare id:

```
npx . https://www.youtube.com/watch?v=o3CX_Y59_74
npx . o3CX_Y59_74
```

Fetch a playlist or a channel — the URL expands into a batch, one fetch per video:

```
npx . "https://www.youtube.com/watch?v=o3CX_Y59_74&list=PLxxxxxxxx" --playlist
```

Rebuild the catalog from what is on disk, fetching nothing:

```
npx . catalog
```

A target may be a video URL, a bare video id, a `youtu.be` or `/shorts` link, a
playlist URL, a channel URL, or a bare `@handle`.

## Flags

- `--lang <code>` — subtitle language, matched exactly. Default `en`.
- `--playlist` — read a `watch?v=...&list=...` URL as the playlist rather than the
  single video. A bare playlist or channel URL expands without it.
- `--force` — in a batch, ignore the skip set and re-fetch everything. A single
  video is re-fetched either way, so this is a no-op there.

`catalog` is a subcommand, not a flag: it takes no target and no flags.
