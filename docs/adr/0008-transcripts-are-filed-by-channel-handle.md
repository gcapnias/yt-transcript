# Transcripts are filed in one folder per channel, named by its handle

`transcripts/` was flat by decision: a directory listing was the browse experience. At 147
transcripts from 20 channels, 89 of them from one channel, that listing no longer finds anything.
Seen in #13.

**Each transcript is stored as `transcripts/<channel folder>/<slug>.md`, exactly one level down,
and the catalog stays at `transcripts/README.md`.** The channel folder is the channel's handle on
its site, made kebab-case: `@iamseankochel` on YouTube becomes `iamseankochel/`, `@some_user` on X
becomes `some-user/`. A channel with no handle, or one whose handle kebab-cases to nothing, falls
back to its lowercased channel id. The handle comes from the one `yt-dlp` invocation a fetch
already makes, at fetch time.

- **The same handle on both sites is one folder.** `mattpocockuk/` holds Matt Pocock's YouTube
  videos and his X posts. Two unrelated accounts sharing a handle share a folder too; each file's
  frontmatter still says who it came from.
- **A slug is unique only within its folder.** A title collision is checked against the folder
  being written to, and still resolved by the frontmatter `url`.
- **A video has one transcript.** Writing a transcript removes any other transcript carrying the
  same `url`, in any folder. A channel that changes its handle moves its videos to the new folder
  as they are re-fetched; the rest stay behind until they are.
- **Reading covers every folder.** A rebuild and a batch's skip set read the top level and every
  channel folder. A transcript found outside a channel folder is still listed, with a warning to
  move it, so it is neither dropped from the catalog nor fetched again.
- **One catalog.** Its rows link to `<folder>/<slug>.md`. A channel folder has no index of its own.

## Considered options

- **The display name, slugged** (`sean-kochel/`). Rejected: it changes whenever a channel renames
  itself, and X's display names carry no handle to keep the same person together across sites.
  It would have been derivable from frontmatter alone; the handle is not (see Consequences).
- **The channel id always** (`UCFig7skuwYrCIGy0tuZHA2Q/`). Rejected as the rule, kept as the
  fallback: stable, but unreadable in a file browser, which is the whole point of the folders.
- **A site layer** (`youtube/<handle>/`). Rejected: a second level, and it splits one person
  across two folders.
- **A suffix for X** (`gcapnias-x/`). Rejected for the same split.
- **Record the handle in frontmatter.** Rejected: it reopens the seven-key contract ADR-0002 kept
  closed, and nothing needs to recompute a folder from disk.
- **Have `catalog` move misplaced transcripts.** Rejected: a rebuild derives the catalog and
  touches nothing else. Misplaced files are warned about instead.

## Consequences

- **A YouTube transcript's folder cannot be recomputed from its frontmatter.** `channel: "Sean
  Kochel"` does not contain `@iamseankochel`. Moving existing files needed a one-off lookup of
  each channel's handle; re-filing them again would need another.
- Every write scans all folders for its `url`. That is cheap at this size, and a batch already
  scans once.
- The existing transcripts are moved once with `git mv`, in the change that introduces the
  folders. The tool carries no migration logic.
