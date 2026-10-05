# yt-transcript

Turns videos on YouTube and X into Markdown transcripts that read as prose, for use as
agent input or reference material. It produces transcripts, never summaries.

Each fetch downloads a subtitle track, cleans it into paragraphs, and writes one
Markdown file under `transcripts/` with frontmatter describing the video. A catalog
at `transcripts/README.md` lists every transcript on disk, derived from their
frontmatter so it cannot drift from what is there.

## Prerequisites

- **Node `>=22.18.0 <23 || >=24.2.0`** — versions where `import.meta.main` exists; see [#2](https://github.com/gcapnias/yt-transcript/issues/2)
- **`yt-dlp`** on `PATH` — every fetch is a `yt-dlp` spawn; nothing is bundled

## Usage

Fetch one video, by URL or by bare id:

```bash
npx . https://www.youtube.com/watch?v=o3CX_Y59_74
npx . o3CX_Y59_74
```

Fetch a playlist or a channel — the URL expands into a batch, one fetch per video:

```bash
npx . "https://www.youtube.com/watch?v=o3CX_Y59_74&list=PLxxxxxxxx" --playlist
```

Fetch the video in an X post, by its URL:

```bash
npx . https://x.com/poteto/status/2102050467505430555
npx . https://x.com/poteto/status/2102050467505430555/video/2
```

Rebuild the catalog from what is on disk, fetching nothing:

```bash
npx . catalog
```

A target may be a video URL, a bare video id, a `youtu.be` or `/shorts` link, a
playlist URL, a channel URL, or a bare `@handle`; or an X post URL.

### X posts

A post is always one fetch, never a batch. Accepted: status URLs on `x.com` and
`twitter.com` (also `www.`, `mobile.` and `m.`) in the forms `/<handle>/status/<id>`,
`/i/status/<id>` and `/i/web/status/<id>`, and `t.co` short links. A query string or
fragment is ignored.

- **One video per fetch.** A post with several videos, or one that quotes another
  post's video, fetches its own first video. A trailing `/video/N` (or `/photo/N`)
  fetches the post's own Nth video instead; `N` counts only the post's own videos,
  so a quoted video is reachable only through the quoted post's URL. There is no
  fetch-every-video mode.
- **One transcript per video.** The transcript's `url` is built from the handle and
  post id `yt-dlp` reports, plus `/video/N` from the second video on, so every
  spelling of a post (`twitter.com`, `/i/status`, `t.co`, `/video/1`) overwrites the
  same file. `title` is the post text with links removed, `channel` is
  `Display Name (@handle)`, and `subtitles` is always `auto`: X's tracks are speech
  recognition. When the post text is too short or not Latin to make a slug, the file
  is named `<handle>-<post id>.md`, lowercased.
- **Refused or failed with a message, never retried:** X Broadcasts and Spaces
  (`/i/broadcasts/…`, `/i/events/…`, `/i/spaces/…`), which carry no subtitles; a post
  with no video; a `/video/N` the post does not have; a video with no subtitle track
  (common on short clips); a post that requires logging in, which this tool does not
  do; and a link-only post that leads to another site. Profiles, threads, likes,
  lists, search and bare post ids are not supported.
- X's captions have little sentence punctuation, so paragraphs come out uneven.

### Without cloning

Run straight from this repository, no `git clone` first:

```bash
npx --allow-git=root github:gcapnias/yt-transcript o3CX_Y59_74
npx --allow-git=root github:gcapnias/yt-transcript catalog
```

`--allow-git=root` is required. Since npm 12 the default for `allow-git` is
`"none"`, so a git-sourced spec is refused outright:

```
npm error code EALLOWGIT
npm error Fetching packages of type "git" have been disabled
```

`root` permits the git dependency you are explicitly running; `all` would permit
any, which is broader than this needs. The first run also prints a
`gitignore-fallback` warning about the missing `.npmignore` — harmless, npm falls
back to `.gitignore` to decide what to ship.

Both forms need `yt-dlp` on `PATH`; npx does not bundle it.

## Flags

- `--lang <code>` — subtitle language, matched exactly. Default `en`.
- `--playlist` — read a `watch?v=...&list=...` URL as the playlist rather than the
  single video. A bare playlist or channel URL expands without it.
- `--force` — in a batch, ignore the skip set and re-fetch everything. A single
  video is re-fetched either way, so this is a no-op there.

`catalog` is a subcommand, not a flag: it takes no target and no flags.
