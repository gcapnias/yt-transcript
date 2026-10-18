# yt-transcript

Turns videos on YouTube and X into Markdown transcripts that read as prose or as
dialog, for use as agent input or reference material. It produces transcripts, never
summaries.

Each fetch downloads a subtitle track, cleans it into paragraphs or, for a
multi-speaker track, turns, and writes one Markdown file with frontmatter describing
the video, filed in a folder per channel:
`transcripts/<channel folder>/<slug>.md`. The folder is the channel's handle in
kebab-case (`@iamseankochel` on YouTube becomes `iamseankochel/`), with Greek
letters romanized, falling back to its
channel id, or to `unknown-channel/`; the same handle on YouTube and X is one folder
(see [ADR-0008](docs/adr/0008-transcripts-are-filed-by-channel-handle.md)). Fetching a
video again removes any older transcript of it elsewhere, so a renamed channel or a
retitled video moves rather than duplicates. A catalog at `transcripts/README.md`
lists every transcript on disk, derived from their frontmatter so it cannot drift
from what is there; it warns about any transcript left outside a channel folder.

## Prerequisites

- **Node `>=22.18.0 <23 || >=24.2.0`** — versions where `import.meta.main` exists; see [#2](https://github.com/gcapnias/yt-transcript/issues/2). Needed only to run from source, not for the [standalone executable](#standalone-executable)
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
  fetches the post's own Nth media item instead. `N` counts the post's own photos as
  well as its videos, so selecting a photo fails, and a quoted video is reachable only
  through the quoted post's URL. There is no fetch-every-video mode. A `t.co` link
  always fetches the first video, even one that points at `/video/N`: X redirects it
  to the bare post before `yt-dlp` sees the selector.
- **One transcript per video.** The transcript's `url` is
  `https://x.com/i/status/<post id>`, built from the post id `yt-dlp` reports, plus
  `/video/N` from the post's second video on, where `N` counts videos only. So every
  spelling of a post (`twitter.com`, `/i/status`, `t.co`, `/video/1`) overwrites the
  same file, and each of the post's later videos gets a file of its own. Selecting a
  video of a post that has several costs a second request to `yt-dlp`, to list the
  post's videos and find which one was fetched. If that video is not in the list, the
  fetch fails and nothing is written. A transcript written by v0.2.0 has the handle in
  its `url`, so fetching that post again writes a second file. `title` is the post
  text with links removed, `channel` is `Display Name (@handle)`, and `subtitles` is
  always `auto`: X's tracks are speech recognition. When the post text is too short, or neither Latin nor Greek, to make a slug, the file
  is named `<handle>-<post id>.md`, lowercased.
- **Refused or failed with a message, never retried:** X Broadcasts and Spaces
  (`/i/broadcasts/…`, `/i/events/…`, `/i/spaces/…`), which carry no subtitles; a post
  with no video; a `/video/N` the post does not have, or a `/photo/N` that selects a
  photo; a video with no subtitle track
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

## Standalone executable

Build a single executable from the same source, to drop on a `PATH` or hand to someone
without a clone:

```bash
npm run build
```

The binary lands in `dist/` as `yt-transcript.exe` on Windows and `yt-transcript`
elsewhere, built for the machine that runs the build. It runs exactly like `npx .`:
same arguments, flags, output, exit codes and files, relative to the directory it is
run from.

```bash
dist/yt-transcript o3CX_Y59_74
```

Like `npx .`, it needs `yt-dlp` on `PATH` to fetch videos, but it does not need Node,
whose version requirement applies only to running from source. [Bun](https://bun.sh)
is needed only to build it (tested with Bun 1.4.3), and the binary is large, about
96 MB, because it embeds Bun's runtime. Running the source under Bun is not supported.

## Meetings

A path ending in `.vtt` is a meeting, such as a Microsoft Teams transcript export:

```bash
yt-transcript path/to/meeting.vtt
```

It is transcribed from the file, with no download, so `yt-dlp` is not needed. The
transcript is filed in `transcripts/meetings/` and listed in the catalog. Each
cue's speaker is read from its `<v Name>` voice tag, the parts of one utterance
(`<uuid>/<utterance>-<part>` cue ids) are rejoined even when other speakers' cues
sit between them, and consecutive utterances by one speaker form one turn, written
`— **Name:** text`. A cue with no voice tag is an unnamed turn. A `.vtt` that names
no speakers is laid out as an unnamed dialog. Nothing is deduplicated, and every
word in the cues is in the transcript. In this layout `;` counts as a sentence end
for paragraph breaks, because Teams writes the Greek question mark that way.
`--layout prose` drops the names. `--lang`, `--playlist` and `--force` are ignored.

The file name, without `.vtt`, is the meeting's identity: transcribing the same file
again replaces its transcript. Its slug is made from that name, with Greek romanized
(`Συνάντηση.vtt` becomes `synantisi.md`); a file whose name has too few Latin or
Greek letters to make a slug is refused, and must be renamed (see
[ADR-0011](docs/adr/0011-greek-titles-are-romanized-by-iso-843.md)).

The frontmatter has no `url`: `title` is the file name without `.vtt`, `channel` is
empty, `duration` is the latest cue end, `upload_date` is the file's modification
date, and `subtitles` is `auto`. Speaker names are written exactly as in the file;
see [ADR-0010](docs/adr/0010-meetings-are-transcribed-into-a-meeting-layout.md).

## Flags

- `--lang <code>` — subtitle language. Default `en`, which accepts `en`,
  `en-orig`, `en-US`, `en-GB` or a named track (`en-` plus an 11-character id,
  such as `en-JkeT_87f4cc` for a live recording's `English - DTVCC1`): a manual
  track is preferred over an auto one, then the variants in that order, named
  tracks last. When a manual or named track loses, a single-video fetch names
  it and the `--lang` that selects it. Any other code, `en-US` included, is
  matched exactly.
- `--layout auto|prose|dialog|meeting` — `meeting` is for a `.vtt` only (see
  Meetings); for a URL, default `auto`: a track whose speaker changes
  (`>>` on auto and named tracks, `- ` on other manual ones) give it 10 or more
  turns becomes a dialog, each turn opening with `— `; speech before the first
  change counts as a turn. Any other track is prose. `prose` and `dialog` force
  one, in a batch for every video; `dialog` on a track with no speaker changes
  gives one turn and a warning. The layout used is recorded as `layout:` in the
  frontmatter.
- `--playlist` — read a `watch?v=...&list=...` URL as the playlist rather than the
  single video. A bare playlist or channel URL expands without it.
- `--force` — in a batch, ignore the skip set and re-fetch everything. A single
  video is re-fetched either way, so this is a no-op there.

`catalog` is a subcommand, not a flag: it takes no target and no flags.
