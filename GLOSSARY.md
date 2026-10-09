# yt-transcript

Turns videos on YouTube and X into Markdown transcripts that read as prose or as dialog, for use as agent input or reference material. It produces transcripts, never summaries.

## Language

**Site**:
Where a video lives: YouTube or X. Each site has its own URL shapes and its own subtitle track conventions; everything after the subtitle track is downloaded is the same for both.
_Avoid_: Source, platform, provider, service

**Post**:
An X post carrying one or more videos, and possibly photos. Fetching a post fetches one video: its first (its own, or else the one it quotes), or the media item that a trailing `/video/N` or `/photo/N` selects. That N counts photos too, and selecting a photo fetches nothing. A `t.co` link never selects: X redirects it to the bare post, so it fetches the first video. The video's number among the post's videos (photos excluded) is its **rank**, and it is never the selector's N. A transcript records and is identified by the post, plus the video's number among the post's videos when it is not the first. It is never identified by the video's own id, which every post quoting the video shares.
_Avoid_: Tweet, status

**Channel**:
Who published a video: a YouTube channel, or the X account that made the post.
_Avoid_: Uploader, author, creator

**Transcript**:
A single Markdown file holding one video's spoken content, laid out as prose or as dialog, preceded by frontmatter describing the video.
_Avoid_: Caption file, subtitle file, article

**Slug**:
The kebab-case filename a transcript is stored under, derived from the video title. A slug is unique only within its channel folder: two channels may each hold a transcript under the same slug.
_Avoid_: Filename, title slug, permalink

**Channel folder**:
The folder a transcript is filed in, named by the kebab-case form of the channel's handle on its site (`@iamseankochel` on YouTube, `@mattpocockuk` on X), not by its display name; a channel with no usable handle falls back to its channel id, and one with neither goes into `unknown-channel`. The same handle on both sites names one folder. Transcripts sit exactly one level down, in their channel's folder, never deeper and never loose beside the catalog.
_Avoid_: Channel directory, subfolder, bucket, shelf

**Frontmatter**:
The YAML block opening a transcript, describing the video it came from.
_Avoid_: Header, metadata block

**Cue**:
One timed unit of text in the subtitle file yt-dlp downloads. Cues are an intermediate the pipeline consumes and discards; they never appear in a transcript.
_Avoid_: Caption, line, segment, subtitle

**Artifact**:
Anything a subtitle track carries that is not spoken content: a provenance credit, speaker-change notation, or a sound event. Artifacts are removed while cleaning, so they never reach a transcript; in a dialog, speaker-change notation is still removed as text, but first marks where one turn ends and the next begins. Notation is track-kind-specific, except that a named track writes its artifacts the way an auto track does, though it is manual in every other respect; a transcriber's annotation on speech — an uncertain name, on-screen text — is not an artifact and survives verbatim.
_Avoid_: Noise, junk, markup, tag

**Paragraph**:
A run of consecutive cues merged into prose, broken at the first sentence end after a minimum word count. In a dialog, a paragraph never spans two turns.
_Avoid_: Block, chunk, section

**Layout**:
How a transcript arranges its spoken content: as **prose**, a sequence of paragraphs, or as **dialog**, a sequence of turns. A transcript is laid out as dialog when its subtitle track marks changes of speaker, and as prose otherwise, so a video with several speakers whose track marks none is still prose.
_Avoid_: Format, mode, style

**Turn**:
An unbroken run of speech by one speaker in a dialog, made of one or more paragraphs. A turn ends where the subtitle track marks a change of speaker.
_Avoid_: Utterance, line, block, segment

**Subtitle track**:
The source text for a transcript, either **manual** (authored by a human) or **auto** (produced by a site's machinery — speech recognition, or YouTube's machine translation of another language's recognition). Manual is preferred; which one was used is always recorded. There are only these two kinds: a translated track is an auto track, every X track is an auto track, and a transcript does not say what language was spoken. When several tracks are acceptable, a manual one is preferred over an auto one, then the plain language over a regional variant. For English, YouTube's untranslated recognition track `en-orig` is also acceptable, ranked right after plain `en`.
_Avoid_: Captions, CC, transcript (the track is the input, the transcript is the output)

**Regional variant**:
A subtitle track whose language carries a region, such as `en-US` or `en-GB`. English, the default language, is accepted as plain `en`, as `en-orig`, as either of those two regional variants, or as a named track; `en-orig` is not a regional variant but YouTube's untranslated speech-recognition track. Any other language is accepted only exactly as asked for. A transcript does not say which of them it came from.
_Avoid_: Locale, dialect, sub-language

**Named track**:
A subtitle track listed under a track name as well as its language, such as `English - CC1` or `English - DTVCC1`, so that one video can carry several tracks in the same language. Among acceptable tracks of one kind, a named track comes after the plain language and its regional variants.
_Avoid_: Suffixed id, broadcast captions, CC stream

**Catalog**:
A single Markdown index of every transcript on disk, whichever channel folder holds it, derived wholly from transcript frontmatter so it cannot drift from what is on disk. Channel folders have no index of their own.
_Avoid_: Index, manifest, database, TOC

**Rebuild**:
Regenerating the catalog by rescanning every transcript on disk, in full. A rebuild never appends to what was there before, so the catalog afterwards reflects exactly what is on disk and nothing else.
_Avoid_: Refresh, sync, reindex, update

**Fetch**:
The tool acting on one video: download a subtitle track, clean it into prose or dialog, write the transcript. Always singular — a playlist is many fetches, never one large one.
_Avoid_: Download, scrape, sync, import

**Batch**:
The set of fetches a single playlist or channel URL expands into. A batch survives the failure of any of its fetches.
_Avoid_: Run, job, queue, bulk fetch

**Expand**:
Turning a playlist or channel URL into the list of videos it names, so each can be fetched. Only playlist and channel URLs expand; a video URL is already a single video.
_Avoid_: Resolve, enumerate, crawl, unroll
