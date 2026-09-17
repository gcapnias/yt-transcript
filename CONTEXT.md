# yt-transcript

Turns YouTube videos into Markdown transcripts that read as prose, for use as agent input or reference material. It produces transcripts, never summaries.

## Language

**Transcript**:
A single Markdown file holding one video's spoken content as prose, preceded by frontmatter describing the video.
_Avoid_: Caption file, subtitle file, article

**Slug**:
The kebab-case filename a transcript is stored under, derived from the video title.
_Avoid_: Filename, title slug, permalink

**Frontmatter**:
The YAML block opening a transcript, describing the video it came from.
_Avoid_: Header, metadata block

**Cue**:
One timed unit of text in the subtitle file yt-dlp downloads. Cues are an intermediate the pipeline consumes and discards; they never appear in a transcript.
_Avoid_: Caption, line, segment, subtitle

**Artifact**:
Anything a subtitle track carries that is not spoken content: a provenance credit, speaker-change notation, or a sound event. Artifacts are removed while cleaning, so they never reach a transcript. Notation is track-kind-specific, and a transcriber's annotation on speech — an uncertain name, on-screen text — is not an artifact and survives verbatim.
_Avoid_: Noise, junk, markup, tag

**Paragraph**:
A run of consecutive cues merged into prose, broken at the first sentence end after a minimum word count. Paragraphs are the transcript's only structure.
_Avoid_: Block, chunk, section

**Subtitle track**:
The source text for a transcript, either **manual** (authored by a human) or **auto** (produced by YouTube's machinery — speech recognition, or its machine translation of another language's recognition). Manual is preferred; which one was used is always recorded. There are only these two kinds: a translated track is an auto track, and a transcript does not say what language was spoken.
_Avoid_: Captions, CC, transcript (the track is the input, the transcript is the output)

**Catalog**:
A Markdown index of every transcript, derived wholly from transcript frontmatter so it cannot drift from what is on disk.
_Avoid_: Index, manifest, database, TOC

**Rebuild**:
Regenerating the catalog by rescanning every transcript on disk, in full. A rebuild never appends to what was there before, so the catalog afterwards reflects exactly what is on disk and nothing else.
_Avoid_: Refresh, sync, reindex, update

**Fetch**:
The tool acting on one video: download a subtitle track, clean it into prose, write the transcript. Always singular — a playlist is many fetches, never one large one.
_Avoid_: Download, scrape, sync, import

**Batch**:
The set of fetches a single playlist or channel URL expands into. A batch survives the failure of any of its fetches.
_Avoid_: Run, job, queue, bulk fetch

**Expand**:
Turning a playlist or channel URL into the list of videos it names, so each can be fetched. Only playlist and channel URLs expand; a video URL is already a single video.
_Avoid_: Resolve, enumerate, crawl, unroll
