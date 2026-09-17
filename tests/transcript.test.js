import test from 'node:test';
import assert from 'node:assert/strict';

import { renderTranscript } from '../src/transcript.js';
import { readFixture } from './fixtures.js';

const METADATA = {
  title: 'OpenAI Codex Crash Course – Build & Deploy Apps with Autonomous AI',
  channel: 'freeCodeCamp.org',
  duration: '41:18',
  uploadDate: '20260910',
};

const FETCHED_AT = new Date('2026-09-16T14:03:05.123Z');

/**
 * Builds a subtitle track from cue texts. `auto` decides which track kind the
 * classifier will read out of the body, using the same two signals a real
 * track carries: `<c>` word-timing tags and `align:start position:0%`.
 */
function track(cueTexts, { auto = false } = {}) {
  const stamp = (n) => `00:00:${String(n).padStart(2, '0')}.000`;
  const settings = auto ? ' align:start position:0%' : '';
  const cues = cueTexts.map((text, index) => {
    const body = auto ? text.replace(/(\s)(\S+)$/, '$1<00:00:00.500><c>$2</c>') : text;
    return `${stamp(index)} --> ${stamp(index + 1)}${settings}\n${body}`;
  });
  return `WEBVTT\nKind: captions\nLanguage: en\n\n${cues.join('\n\n')}\n`;
}

function render(trackText, overrides = {}) {
  return renderTranscript({
    trackText,
    url: 'https://www.youtube.com/watch?v=o3CX_Y59_74',
    videoId: 'o3CX_Y59_74',
    metadata: METADATA,
    fetchedAt: FETCHED_AT,
    ...overrides,
  });
}

const body = (contents) => contents.split(/\n---\n\n/)[1];

// ---------------------------------------------------------------- slug

test('all eight verified titles produce their settled slugs', () => {
  const vectors = [
    ['How to Fine-Tune any AI Model Locally (FULL Tutorial)', 'how-to-fine-tune-any-ai-model-locally-full-tutorial'],
    ['/wayfinder: Nothing is too big to plan anymore', 'wayfinder-nothing-is-too-big-to-plan-anymore'],
    [
      'New Skills! v1.2 brings /wait-what, /writing-for-agents, and fixes /grill-me',
      'new-skills-v1-2-brings-wait-what-writing-for-agents-and-fixes-grill-me',
    ],
    ['The Best LOCAL Agentic Coding Workflow (Complete Guide)', 'the-best-local-agentic-coding-workflow-complete-guide'],
    ['Claude Codes New INTENT.MD, What is It?', 'claude-codes-new-intent-md-what-is-it'],
    [
      'mattpocock/skills: A complete AI Coding workflow, end-to-end',
      'mattpocock-skills-a-complete-ai-coding-workflow-end-to-end',
    ],
    ["Don't waste time on specs: /prototype instead", 'dont-waste-time-on-specs-prototype-instead'],
    [
      'OpenAI Codex Crash Course – Build & Deploy Apps with Autonomous AI',
      'openai-codex-crash-course-build-deploy-apps-with-autonomous-ai',
    ],
  ];

  for (const [title, slug] of vectors) {
    const transcript = render(track(['Hello.']), { metadata: { ...METADATA, title } });
    assert.equal(transcript.filename, `${slug}.md`, `slug wrong for: ${title}`);
  }
});

test('a title that slugs to nothing falls back to the video id', () => {
  for (const title of ['Πώς να μάθεις', '日本語のタイトル', '!!! ??? ...']) {
    const transcript = render(track(['Hello.']), { metadata: { ...METADATA, title } });
    assert.equal(transcript.filename, 'o3CX_Y59_74.md', `no fallback for: ${title}`);
  }
});

test('latin letters NFKD cannot decompose are transliterated, not turned into separators', () => {
  // Without the table each of these carries no combining mark to strip, so it
  // becomes punctuation and then a separator: `s-ren`, `pawe-`, `stra-e`.
  const vectors = [
    ['Søren on agents', 'soren-on-agents'],
    ['Paweł and Straße', 'pawel-and-strasse'],
    ['Æon œuvre Þor and ð', 'aeon-oeuvre-thor-and-d'],
  ];

  for (const [title, slug] of vectors) {
    const transcript = render(track(['Hello.']), { metadata: { ...METADATA, title } });
    assert.equal(transcript.filename, `${slug}.md`, `slug wrong for: ${title}`);
  }
});

test('a slug retaining under half the title is discarded for the video id', () => {
  // The case an emptiness test misses: non-empty, plausible-looking, and it
  // has silently swallowed most of the title. The video id at least admits it.
  const transcript = render(track(['Hello.']), {
    metadata: { ...METADATA, title: 'Πώς να μάθεις AI' },
  });

  assert.equal(transcript.filename, 'o3CX_Y59_74.md');
});

test('a mostly-latin title keeps its slug even with non-latin words in it', () => {
  // The other side of the ratio: retention here is well above half, so falling
  // back would throw away a filename that genuinely describes the video.
  const transcript = render(track(['Hello.']), {
    metadata: { ...METADATA, title: 'Νέα Skills! v1.2 για agents' },
  });

  assert.equal(transcript.filename, 'skills-v1-2-agents.md');
});

test('a slug past 120 characters is cut at a dash boundary with no trailing dash', () => {
  const title = `${'alpha bravo charlie delta '.repeat(8)}omega`;
  const transcript = render(track(['Hello.']), { metadata: { ...METADATA, title } });
  const slug = transcript.filename.replace(/\.md$/, '');

  assert.ok(slug.length <= 120, `slug is ${slug.length} characters`);
  assert.ok(!slug.endsWith('-'), 'slug ends with a dash');
  assert.ok(slug.startsWith('alpha-bravo-charlie-delta-alpha'));
  // The cut lands on a word boundary, so the last word is never a fragment.
  assert.ok(/-(alpha|bravo|charlie|delta|omega)$/.test(slug), slug);
});

test('a long latin title is truncated, never discarded for the video id', () => {
  // Retention is measured on the slug the title produces, before the cap:
  // the cap is a later, separate step, and letting it drive the ratio would
  // send every sufficiently long title to the video id.
  const title = `${'alpha bravo charlie delta '.repeat(20)}omega`;
  const transcript = render(track(['Hello.']), { metadata: { ...METADATA, title } });
  const slug = transcript.filename.replace(/\.md$/, '');

  assert.notEqual(slug, 'o3CX_Y59_74', 'a perfectly good latin title fell back to the video id');
  assert.ok(slug.length <= 120, `slug is ${slug.length} characters`);
  assert.ok(slug.startsWith('alpha-bravo-charlie-delta-alpha'));
});

test('a title carrying combining marks folds to plain ascii', () => {
  const transcript = render(track(['Hello.']), { metadata: { ...METADATA, title: 'Café Крем naïve' } });
  assert.equal(transcript.filename, 'cafe-naive.md');
});

test('the rendered transcript carries what the run reports about the video', () => {
  // The same four values the frontmatter records, formatted once here so the
  // terminal and the file cannot disagree about the upload date.
  const { video } = render(track(['Hello.']));

  assert.deepEqual(video, {
    title: METADATA.title,
    channel: 'freeCodeCamp.org',
    duration: '41:18',
    uploaded: '2026-09-10',
  });
});

// -------------------------------------------------------- frontmatter

test('frontmatter carries exactly the seven keys, in order, with the settled quoting', () => {
  const { contents } = render(track(['Hello there.'], { auto: true }));

  assert.ok(
    contents.startsWith(
      [
        '---',
        'title: "OpenAI Codex Crash Course – Build & Deploy Apps with Autonomous AI"',
        'url: https://www.youtube.com/watch?v=o3CX_Y59_74',
        'channel: "freeCodeCamp.org"',
        'duration: "41:18"',
        'upload_date: 2026-09-10',
        'fetched: 2026-09-16T14:03:05Z',
        'subtitles: auto',
        '---',
        '',
        '',
      ].join('\n'),
    ),
    contents.slice(0, 400),
  );
});

test('a title containing a quote or a backslash is escaped, not re-quoted', () => {
  const { contents } = render(track(['Hello.']), {
    metadata: { ...METADATA, title: 'He said "hi" \\ bye', channel: 'a "b" c' },
  });

  assert.match(contents, /^title: "He said \\"hi\\" \\\\ bye"$/m);
});

test('subtitles reads manual when the track body carries neither auto signal', () => {
  assert.match(render(track(['Hello.'], { auto: false })).contents, /^subtitles: manual$/m);
  assert.match(render(track(['Hello.'], { auto: true })).contents, /^subtitles: auto$/m);
});

test('a real auto track classifies auto and a real manual track classifies manual', () => {
  assert.match(render(readFixture('auto', 'o3CX_Y59_74')).contents, /^subtitles: auto$/m);
  assert.match(render(readFixture('manual', 'DxL2HoqLbyA')).contents, /^subtitles: manual$/m);
});

test('re-rendering the same video overwrites the same filename and bumps fetched', () => {
  const first = render(track(['Hello.'], { auto: true }));
  const second = render(track(['Hello.'], { auto: true }), {
    fetchedAt: new Date('2026-09-17T09:00:00.000Z'),
  });

  assert.equal(second.filename, first.filename);
  assert.match(second.contents, /^fetched: 2026-09-17T09:00:00Z$/m);
  assert.notEqual(second.contents, first.contents);
});

// --------------------------------------------------------------- body

test('the body is prose: no heading, no timestamps, no markup', () => {
  const { contents } = render(readFixture('auto', 'o3CX_Y59_74'));
  const prose = body(contents);

  assert.ok(!/^#/m.test(prose), 'the body carries a heading');
  assert.ok(!/-->/.test(prose), 'the body carries a cue timing line');
  assert.ok(!/\d{2}:\d{2}:\d{2}\.\d{3}/.test(prose), 'the body carries a timestamp');
  assert.ok(!/<[^>]*>/.test(prose), 'the body carries markup');
  assert.ok(!/&(amp|lt|gt|quot|#39);/.test(prose), 'the body carries an undecoded entity');
});

test('paragraphs are separated by blank lines and break at a sentence end past 100 words', () => {
  // Ten words per cue, each ending a sentence, and each cue distinct so dedup
  // has nothing to find either way.
  const cues = Array.from(
    { length: 15 },
    (_unused, index) => `word${index} bravo charlie delta echo foxtrot golf hotel india juliet.`,
  );
  const { contents } = render(track(cues, { auto: true }));
  const paragraphs = body(contents).trimEnd().split('\n\n');

  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0].split(' ').length, 100);
  assert.equal(paragraphs[1].split(' ').length, 50);
  assert.ok(paragraphs[0].endsWith('.'));
});

test('entities are decoded after tags are stripped, so an escaped angle bracket survives', () => {
  // Decoding first would turn `&lt;` into a `<` that tag stripping then eats
  // through to the next `>`, swallowing the words between.
  const { contents } = render(track(['Use &lt;canvas&gt; for that.']));
  assert.match(body(contents), /^Use <canvas> for that\./);
});

// ------------------------------------------------------------- dedup

test('an auto track loses its rolling-window repetition', () => {
  const { contents } = render(
    track(
      [
        'OpenAI Codex is an autonomous AI coding',
        'OpenAI Codex is an autonomous AI coding agent',
        'agent designed to read code bases.',
      ],
      { auto: true },
    ),
  );

  assert.equal(body(contents).trimEnd(), 'OpenAI Codex is an autonomous AI coding agent designed to read code bases.');
});

test('a manual track keeps a cue that repeats the previous cue, because dedup never runs on it', () => {
  const { contents } = render(track(['I love it.', 'I love it, truly.']));

  assert.equal(body(contents).trimEnd(), 'I love it. I love it, truly.');
});

test('a non-Latin auto track keeps words that share no letters', () => {
  // Stripping to ASCII word characters normalises every Greek word to the
  // empty string, at which point two unrelated words compare equal and real
  // speech disappears. `--lang` accepts any language, so this is reachable.
  const { contents } = render(track(['καλημέρα κόσμε', 'τότε άλλο πράγμα'], { auto: true }));

  assert.equal(body(contents).trimEnd(), 'καλημέρα κόσμε τότε άλλο πράγμα');
});

test('a non-Latin auto track still loses its rolling-window repetition', () => {
  const { contents } = render(track(['καλημέρα κόσμε', 'καλημέρα κόσμε αγαπητέ'], { auto: true }));

  assert.equal(body(contents).trimEnd(), 'καλημέρα κόσμε αγαπητέ');
});

test('every auto fixture comes out free of the repetition its cues carry', () => {
  for (const id of ['4JofSJIrjwU', 'F3lL98Pj90o', 'M6mYodf0dJM', 'o3CX_Y59_74']) {
    const prose = body(render(readFixture('auto', id)).contents);
    // The rolling window re-emits a whole cue's worth of words, so an
    // immediately doubled 6-word run is the signature of dedup not running.
    assert.ok(!/\b(\w+(?: \w+){5}) \1\b/i.test(prose), `rolling-window repetition survived in ${id}`);
  }
});

// -------------------------------- regression: the 13 measured deletions

test('manual output keeps every sentence the auto dedup heuristic would have eaten', () => {
  const warmth = body(render(readFixture('manual', 'DxL2HoqLbyA')).contents);
  const shakespeare = body(render(readFixture('manual', 'iG9CE55wbtY')).contents);
  const wait = body(render(readFixture('manual', 'arj7oStGLkU')).contents);

  // Dialogue echo: k=2, the second speaker's opening word deleted.
  //
  // The literal lost its two `- ` prefixes when artifact stripping landed:
  // both cues are line-start speaker markers, and deleting them is this
  // pipeline's settled behaviour. What the assertion measures is unchanged —
  // both utterances survive, nothing is deleted — and it reads like an
  // accidental duplication precisely because the marker is gone. It is not
  // one, and dedup still never runs on a manual track.
  assert.ok(warmth.includes('Warmth. Warmth, light.'), 'the two-speaker exchange lost a word');
  // Number split across cues: k=1, a whole magnitude deleted.
  assert.ok(warmth.includes('100 trillion, trillion atoms'), 'the split number lost a magnitude');
  // Rhetorical repeat: k=2, the entire cue erased.
  assert.ok(shakespeare.includes('do you? Do you?'), 'the rhetorical repeat was erased');
  // Quotation restated: k=6, six words gone.
  assert.ok(shakespeare.includes('who had to move to think." Who had to move to think.'), 'the restated quotation was cut');
  // Sentence opening on the word the last one closed with: k=1.
  assert.ok(wait.includes('do that like that. That would be the plan.'), 'the repeated closing word was cut');
  // Discourse marker: k=1.
  assert.ok(wait.includes('right now. Now, sometimes'), 'the discourse marker was cut');
});

// ----------------------------------------------------------- artifacts
//
// The inverse of the scope-boundary test ytdlp-xmu.2 left here: every token it
// asserted was still present is now asserted gone, and every token that is
// content is asserted to survive.

test('every artifact token the fixtures carry is gone from the rendered prose', () => {
  const warmth = body(render(readFixture('manual', 'DxL2HoqLbyA')).contents);
  const laughing = body(render(readFixture('manual', 'iG9CE55wbtY')).contents);
  const credited = body(render(readFixture('manual', 'rNxC16mlO60')).contents);
  const amara = body(render(readFixture('manual', '8nHBGFKLHZQ')).contents);
  const auto = body(render(readFixture('auto', 'o3CX_Y59_74')).contents);

  // Each fixture is anchored on a line it still carries before its token is
  // asserted gone. A negated regex passes against `undefined` too, so without
  // the anchor a change to the rendered shape would retire this whole test in
  // silence.
  assert.ok(warmth.includes('Vitamin D'), 'the warmth track did not render');
  assert.ok(!/(^|\s)- /.test(warmth), 'a manual speaker marker survived');
  assert.ok(laughing.includes('Shakespeare'), 'the Shakespeare track did not render');
  assert.ok(!/\(Laughter\)|\(Applause\)|\(Sigh\)|\(Audience\)/.test(laughing), 'a manual sound event survived');
  assert.ok(credited.includes('hold a plank'), 'the credited track did not render');
  assert.ok(!/Transcriber:|Reviewer:/.test(credited), 'a provenance credit survived');
  assert.ok(amara.includes('neutron stars'), 'the Amara track did not render');
  assert.ok(!amara.includes('Subtitles by the Amara.org community'), 'a final-cue credit survived');
  assert.ok(auto.includes('Codex'), 'the auto track did not render');
  assert.ok(!auto.includes('>>'), 'an auto speaker marker survived');
  assert.ok(!/\[snorts\]|\[music\]|\[laughter\]|\[clears throat\]/.test(auto), 'an auto sound event survived');
});

test('a credit in the first cue of a manual track goes, and the same text mid-track stays', () => {
  // Four cues, not three: with three the repeat would land in last position
  // and the position guard would drop it for the wrong reason.
  const { contents } = render(
    track(['Transcriber: Jane Doe', 'Hello there.', 'Transcriber: Jane Doe', 'Goodbye now.']),
  );

  assert.equal(body(contents).trimEnd(), 'Hello there. Transcriber: Jane Doe Goodbye now.');
});

test('a credit in the final cue of a manual track goes, and the speech before it stays', () => {
  // `8nHBGFKLHZQ` carries its credit as the last cue, which is why the
  // position guard covers both ends rather than the first cue alone.
  const amara = body(render(readFixture('manual', '8nHBGFKLHZQ')).contents);

  assert.ok(!amara.includes('Amara'), 'the final-cue credit survived');
  assert.ok(amara.trimEnd().endsWith('interesting neutron stars, click here.'), amara.slice(-120));
});

test('a credit is never dropped on an auto track, where the notation does not occur', () => {
  const { contents } = render(track(['Transcriber training is a real job.', 'And so it goes.'], { auto: true }));

  assert.match(body(contents), /^Transcriber training is a real job\./);
});

test('the speaker markers go and the speech beside them stays, in both notations', () => {
  const manual = render(track(['- Heat.', '- Warmth, light.']));
  const auto = render(track(['&gt;&gt; So this is the plan.', '&gt;&gt; It is a good one.'], { auto: true }));

  assert.equal(body(manual.contents).trimEnd(), 'Heat. Warmth, light.');
  // Entity decoding is a precondition, not cosmetic: `>>` is `&gt;&gt;` on
  // disk, so the rule only ever sees the decoded form.
  assert.equal(body(auto.contents).trimEnd(), 'So this is the plan. It is a good one.');
});

test("a speaker's own notation is not stripped from the other kind of track", () => {
  const manual = render(track(['>> is how you quote in Markdown.']));
  const auto = render(track(['- is a bullet, not a speaker.'], { auto: true }));

  assert.match(body(manual.contents), /^>> is how you quote/);
  assert.match(body(auto.contents), /^- is a bullet/);
});

test('short sound events are stripped on both kinds, each in its own notation', () => {
  const manual = render(track(['(Laughter) That was the whole point.', 'He agreed (Applause) at once.']));
  const auto = render(track(['[snorts] That was dumb, bro.', 'It went [clears throat] rather well.'], { auto: true }));

  // Token-level, because speech shares the line with the token.
  assert.equal(body(manual.contents).trimEnd(), 'That was the whole point. He agreed at once.');
  assert.equal(body(auto.contents).trimEnd(), 'That was dumb, bro. It went rather well.');
});

test('a parenthetical over four words, or carrying sentence punctuation, survives', () => {
  // The shape guard is what makes the rule fail safe: an unrecognised long
  // parenthetical stays visible rather than taking speech with it.
  const long = render(track(['He paused (and then he thought about it) before answering.']));
  const punctuated = render(track(['He paused (wait. really) before answering.']));

  assert.match(body(long.contents), /He paused \(and then he thought about it\) before answering\./);
  assert.match(body(punctuated.contents), /He paused \(wait\. really\) before answering\./);
});

test('the shape guard holds in auto notation too, where it guards against ASR inventing a token', () => {
  // The guard is what makes the rule fail safe, and the ASR vocabulary it
  // faces is open — so it has to hold on the kind that produces the surprises.
  const long = render(track(['He paused [and then he thought about it] fully.'], { auto: true }));
  const punctuated = render(track(['He paused [wait. really] fully.'], { auto: true }));

  assert.match(body(long.contents), /He paused \[and then he thought about it\] fully\./);
  assert.match(body(punctuated.contents), /He paused \[wait\. really\] fully\./);
});

test('a bracketed annotation survives verbatim on a manual track and is stripped on an auto one', () => {
  // The same guard-clean token both ways: the asymmetry is the rule, not the
  // token's shape. Unwrapping it would turn `Matt [Caplin?],` into
  // `Matt Caplin?,`, a question mark that now reads as the speaker's.
  const manual = render(track(['The answer by Matt [Caplin] holds.']));
  const auto = render(track(['The answer by Matt [Caplin] holds.'], { auto: true }));

  assert.match(body(manual.contents), /The answer by Matt \[Caplin\] holds\./);
  assert.match(body(auto.contents), /The answer by Matt holds\./);
});

test('the real transcriber annotations survive verbatim, brackets and all', () => {
  const amara = body(render(readFixture('manual', '8nHBGFKLHZQ')).contents);
  const wait = body(render(readFixture('manual', 'arj7oStGLkU')).contents);

  assert.ok(amara.includes('Matt [Caplin?],'), 'the annotation lost its brackets');
  assert.ok(wait.includes('[This is a perfect time to get some work done.] [Nope!]'), 'the annotation was altered');
});

test('a bracket opening in one cue and closing in the next is left untouched', () => {
  // Matched within a single cue only, so a token spanning a cue boundary is
  // not a token at all.
  const { contents } = render(track(['So then [he', 'paused] and continued.'], { auto: true }));

  assert.match(body(contents), /So then \[he paused\] and continued\./);
});

test('a sound-event-only cue contributes no words and no whitespace', () => {
  const { contents } = render(track(['Hello there.', '(Laughter)', 'Goodbye now.']));

  assert.equal(body(contents).trimEnd(), 'Hello there. Goodbye now.');
});

test('artifacts are stripped before dedup, so repeated boilerplate never feeds the overlap rule', () => {
  // `[music]` closing one cue and opening the next is exactly the repetition
  // the overlap detection mis-fires on, and it has no minimum match length.
  const { contents } = render(
    track(['the plan is simple [music]', '[music] the plan is simple and it works.'], { auto: true }),
  );

  assert.equal(body(contents).trimEnd(), 'the plan is simple and it works.');
});
