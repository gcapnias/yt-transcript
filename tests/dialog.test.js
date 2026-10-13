import test from 'node:test';
import assert from 'node:assert/strict';

import { runBatch } from '../src/batch.js';
import { readFrontmatter, renderCatalog } from '../src/catalog.js';
import { main, parseArgs, UsageError } from '../src/cli.js';
import { renderTranscript } from '../src/transcript.js';

const METADATA = { title: 'A Talk', channel: 'Chan', duration: '1:00', uploadDate: '20260910' };
const URL = 'https://www.youtube.com/watch?v=o3CX_Y59_74';

/**
 * A track from cues, each cue a list of lines. `auto` adds the two signals the
 * classifier reads, so the cue text stays exactly what the test wrote.
 */
function track(cues, { auto = false } = {}) {
  const stamp = (n) => `00:00:${String(n).padStart(2, '0')}.000`;
  const settings = auto ? ' align:start position:0%' : '';
  const blocks = cues.map((lines, index) => {
    const text = (Array.isArray(lines) ? lines : [lines]).join('\n');
    const body = auto ? text.replace(/(\S+)$/, '<c>$1</c>') : text;
    return `${stamp(index)} --> ${stamp(index + 1)}${settings}\n${body}`;
  });
  return `WEBVTT\nKind: captions\nLanguage: en\n\n${blocks.join('\n\n')}\n`;
}

function render(trackText, overrides = {}) {
  return renderTranscript({
    trackText,
    url: URL,
    videoId: 'o3CX_Y59_74',
    metadata: METADATA,
    fetchedAt: new Date('2026-09-16T14:03:05Z'),
    ...overrides,
  });
}

const body = (contents) => contents.split(/\n---\n\n/)[1].trimEnd();
const paragraphs = (contents) => body(contents).split('\n\n');
const layoutOf = (contents) => /^layout: (\w+)$/m.exec(contents)?.[1];

/** n turns, each `>> Turn k said something.` */
const autoTurns = (n) => Array.from({ length: n }, (_u, k) => `>> Turn ${k} said something.`);
const manualTurns = (n) => Array.from({ length: n }, (_u, k) => `- Turn ${k} said something.`);

// ------------------------------------------------------------ detection

test('an auto track with ten turns is a dialog, one em-dashed paragraph per turn', () => {
  const { contents } = render(track(autoTurns(10), { auto: true }));

  assert.equal(layoutOf(contents), 'dialog');
  const blocks = paragraphs(contents);
  assert.equal(blocks.length, 10);
  assert.equal(blocks[0], '— Turn 0 said something.');
  assert.ok(blocks.every((block) => block.startsWith('— ')));
  assert.doesNotMatch(body(contents), />/);
});

test('nine turns, however many sound-event-only turns, is prose', () => {
  const cues = [...autoTurns(9), '>> [music]', '>> [applause]', '>>> [laughter]'];
  const { contents } = render(track(cues, { auto: true }));

  assert.equal(layoutOf(contents), 'prose');
  assert.doesNotMatch(body(contents), /^— /m);
});

test('a sound-event-only turn in the middle is not a turn either', () => {
  const nine = autoTurns(9);
  const cues = [...nine.slice(0, 5), '>> [music]', ...nine.slice(5)];
  assert.equal(layoutOf(render(track(cues, { auto: true })).contents), 'prose');
});

test('a track with no notation is prose', () => {
  const { contents } = render(track(['Hello there.', 'General Kenobi.'], { auto: true }));
  assert.equal(layoutOf(contents), 'prose');
  assert.doesNotMatch(body(contents), /^— /);
});

test('a manual track with ten dash turns is a dialog', () => {
  const { contents, trackKind } = render(track(manualTurns(10)));
  assert.equal(trackKind, 'manual');
  assert.equal(layoutOf(contents), 'dialog');
  assert.equal(paragraphs(contents).length, 10);
});

test('on a manual track a `- ...` line continues the turn it interrupts', () => {
  const cues = [...manualTurns(9), '- Final turn.', '- ... and on we go.', '- … again.'];
  const { contents } = render(track(cues));
  const blocks = paragraphs(contents);

  assert.equal(layoutOf(contents), 'dialog');
  assert.equal(blocks.length, 10);
  assert.equal(blocks[9], '— Final turn. ... and on we go. … again.');
});

test('a `- ...` line does not turn nine turns into ten', () => {
  const cues = [...manualTurns(9), '- ... still turn eight.'];
  assert.equal(layoutOf(render(track(cues)).contents), 'prose');
});

test('speech before the first marker is the first turn, and carries the dash', () => {
  const cues = ['Welcome everyone.', ...autoTurns(9)];
  const { contents } = render(track(cues, { auto: true }));
  const blocks = paragraphs(contents);

  assert.equal(layoutOf(contents), 'dialog');
  assert.equal(blocks.length, 10);
  assert.equal(blocks[0], '— Welcome everyone.');
});

test('a marker on the second line of a cue starts a turn there', () => {
  const cues = [['First speaker.', '>> Second speaker.'], ...autoTurns(8)];
  const blocks = paragraphs(render(track(cues, { auto: true })).contents);

  assert.equal(blocks[0], '— First speaker.');
  assert.equal(blocks[1], '— Second speaker.');
});

test('rolling-cue repeats of one marker line count as one turn', () => {
  // Each cue repeats the previous cue's last line, as YouTube's rolling window does.
  const cues = [];
  for (let k = 0; k < 10; k += 1) {
    cues.push([`>> Turn ${k} opens.`, `Turn ${k} goes on.`]);
    cues.push([`Turn ${k} goes on.`, `>> Turn ${k + 1} opens.`]);
  }
  // Nine turns, each marker line shown twice: counting the repeats would give ten or more.
  const nine = render(track(cues.slice(0, 17), { auto: true })).contents;
  assert.equal(layoutOf(nine), 'prose', 'a repeated marker was counted twice');

  const ten = render(track(cues.slice(0, 19), { auto: true })).contents;
  assert.equal(layoutOf(ten), 'dialog');
  assert.equal(paragraphs(ten).length, 10);
});

test('a short interjection is kept as its own turn', () => {
  const cues = ['>> Tell me more about it.', '>> Yeah.', '>> It began in 1995.', ...autoTurns(7)];
  const blocks = paragraphs(render(track(cues, { auto: true })).contents);
  assert.equal(blocks[1], '— Yeah.');
});

test('the triple marker is a turn too, and no stray > is left behind', () => {
  const cues = [...autoTurns(5), ...Array.from({ length: 5 }, (_u, k) => `>>> Triple ${k}.`)];
  const { contents } = render(track(cues, { auto: true }));
  assert.equal(layoutOf(contents), 'dialog');
  assert.doesNotMatch(body(contents), />/);
});

test('a named track reads the auto marker even though it is manual', () => {
  const { contents, trackKind } = render(track(autoTurns(10)), { trackKey: 'en-JkeT_87f4cc' });
  assert.equal(trackKind, 'manual');
  assert.equal(layoutOf(contents), 'dialog');
});

test('a manual track that is not named does not read `>>` as a turn', () => {
  const { contents } = render(track(autoTurns(10)), { trackKey: 'en' });
  assert.equal(layoutOf(contents), 'prose');
});

// ------------------------------------------------------------ rendering

test('a turn longer than 130 words splits into paragraphs, and only the first is dashed', () => {
  const sentence = 'one two three four five six seven eight nine ten.';
  const longTurn = Array.from({ length: 16 }, () => sentence).join(' '); // 160 words
  const cues = [`>> ${longTurn}`, ...autoTurns(9)];
  const blocks = paragraphs(render(track(cues, { auto: true })).contents);

  assert.equal(blocks.length, 11);
  assert.ok(blocks[0].startsWith('— one two'));
  assert.equal(blocks[0].split(' ').length, 1 + 130);
  assert.ok(!blocks[1].startsWith('— '));
  assert.equal(blocks[1].split(' ').length, 30);
  assert.ok(blocks[2].startsWith('— Turn 0'));
});

test('a paragraph never spans two turns, even short of 130 words', () => {
  const blocks = paragraphs(render(track(autoTurns(10), { auto: true })).contents);
  assert.ok(blocks.every((block) => (block.match(/Turn/g) ?? []).length === 1));
});

test('prose breaks at the first sentence end after 130 words, not 100', () => {
  const cues = Array.from(
    { length: 15 },
    (_u, k) => `word${k} bravo charlie delta echo foxtrot golf hotel india juliet.`,
  );
  const blocks = paragraphs(render(track(cues, { auto: true })).contents);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].split(' ').length, 130);
  assert.equal(blocks[1].split(' ').length, 20);
});

test('NAME: labels survive verbatim in both layouts', () => {
  const cues = ['- CA: Welcome.', ...manualTurns(8), '- Chris: Hello.'];
  const dialog = render(track(cues));
  assert.equal(layoutOf(dialog.contents), 'dialog');
  assert.match(body(dialog.contents), /^— CA: Welcome\./);
  assert.match(body(dialog.contents), /^— Chris: Hello\.$/m);

  const prose = render(track(cues), { layout: 'prose' });
  assert.match(body(prose.contents), /CA: Welcome\./);
  assert.match(body(prose.contents), /Chris: Hello\./);
});

// ------------------------------------------------------------ frontmatter

test('every new transcript records the layout used, after subtitles', () => {
  const prose = render(track(['Hello.'])).contents;
  assert.match(prose, /^subtitles: manual\nlayout: prose\n---$/m);

  const dialog = render(track(manualTurns(10))).contents;
  assert.match(dialog, /^subtitles: manual\nlayout: dialog\n---$/m);
});

// ------------------------------------------------------------ override

test('--layout prose forces prose on a ten-turn track, recorded as prose', () => {
  const { contents } = render(track(autoTurns(10), { auto: true }), { layout: 'prose' });
  assert.equal(layoutOf(contents), 'prose');
  assert.doesNotMatch(body(contents), /^— /m);
  assert.equal(paragraphs(contents).length, 1);
});

test('--layout dialog uses every turn of a three-turn track', () => {
  const { contents, warnings } = render(track(autoTurns(3), { auto: true }), { layout: 'dialog' });
  assert.equal(layoutOf(contents), 'dialog');
  assert.equal(paragraphs(contents).length, 3);
  assert.deepEqual(warnings, []);
});

test('--layout dialog on a track with no notation is one turn, with a warning naming the video', () => {
  const { contents, warnings } = render(track(['Hello there.', 'General Kenobi.'], { auto: true }), {
    layout: 'dialog',
  });

  assert.equal(layoutOf(contents), 'dialog');
  assert.deepEqual(paragraphs(contents), ['— Hello there. General Kenobi.']);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes(URL), warnings[0]);
});

test('--layout auto never warns and is never written to the frontmatter', () => {
  const { contents, warnings } = render(track(['Hello.']), { layout: 'auto' });
  assert.deepEqual(warnings, []);
  assert.doesNotMatch(contents, /layout: auto/);
});

test('--layout parses, defaults to auto, and rejects anything else', () => {
  assert.equal(parseArgs(['o3CX_Y59_74']).layout, 'auto');
  assert.equal(parseArgs(['--layout', 'dialog', 'o3CX_Y59_74']).layout, 'dialog');
  assert.equal(parseArgs(['o3CX_Y59_74', '--layout', 'prose']).layout, 'prose');
  assert.throws(() => parseArgs(['--layout', 'poem', 'o3CX_Y59_74']), UsageError);
  assert.throws(() => parseArgs(['--layout']), UsageError);
});

test('an invalid --layout exits with a usage error and fetches nothing', async () => {
  const err = [];
  const code = await main(['--layout', 'poem', 'o3CX_Y59_74'], { out() {}, err: (l) => err.push(l) }, {
    preflight: async () => assert.fail('reached yt-dlp'),
  });
  assert.equal(code, 1);
  assert.match(err.join('\n'), /--layout/);
  assert.match(err.join('\n'), /Usage: yt-transcript/);
});

test('--layout is in the help text', async () => {
  const err = [];
  await main([], { out() {}, err: (l) => err.push(l) });
  assert.match(err.join('\n'), /--layout auto\|prose\|dialog/);
});

test('--layout reaches a single fetch, and its warnings reach stderr', async () => {
  const seen = [];
  const err = [];
  const code = await main(['--layout', 'dialog', 'o3CX_Y59_74'], { out() {}, err: (l) => err.push(l) }, {
    preflight: async () => '2026.09.01',
    fetchTranscript: async ({ layout }) => {
      seen.push(layout);
      return { file: 'x.md', transcript: { url: URL, trackKind: 'auto', warnings: [`WARN ${URL}`] } };
    },
    rebuildCatalog: async () => ({ file: 'transcripts/README.md', count: 1, warnings: [] }),
  });

  assert.equal(code, 0);
  assert.deepEqual(seen, ['dialog']);
  assert.ok(err.includes(`WARN ${URL}`));
});

test('--layout reaches every fetch of a batch, and each warning is reported', async () => {
  const A = 'https://www.youtube.com/watch?v=4JofSJIrjwU';
  const B = 'https://www.youtube.com/watch?v=o3CX_Y59_74';
  const seen = [];
  const warned = [];

  await runBatch([A, B], {
    layout: 'prose',
    sleep: async () => {},
    onWarning: (warning) => warned.push(warning),
    fetchOne: async ({ url, layout }) => {
      seen.push([url, layout]);
      return { file: 'x.md', transcript: { warnings: [`w ${url}`] } };
    },
  });

  assert.deepEqual(seen, [[A, 'prose'], [B, 'prose']]);
  assert.deepEqual(warned, [`w ${A}`, `w ${B}`]);
});

test('a batch fetches with layout auto unless told otherwise', async () => {
  const seen = [];
  await runBatch(['https://www.youtube.com/watch?v=4JofSJIrjwU'], {
    sleep: async () => {},
    fetchOne: async ({ layout }) => {
      seen.push(layout);
      return { file: 'x.md' };
    },
  });
  assert.deepEqual(seen, ['auto']);
});

// ------------------------------------------------------------ catalog

test('the catalog reports no warning for transcripts that predate layout', () => {
  const legacy = (name) => ({
    path: `chan/${name}.md`,
    text:
      `---\ntitle: "${name}"\nurl: https://www.youtube.com/watch?v=${name.padEnd(11, 'x')}\n` +
      `channel: "Chan"\nduration: "1:00"\nupload_date: 2026-09-10\n` +
      `fetched: 2026-09-16T14:03:05Z\nsubtitles: auto\n---\n\nProse.\n`,
  });
  const files = [legacy('alpha'), legacy('beta')];
  const { warnings, count } = renderCatalog(files);

  assert.deepEqual(warnings, []);
  assert.equal(count, 2);
  assert.equal(readFrontmatter(files[0].text).values.layout, undefined);
});

test('a transcript carrying layout catalogs without a warning too', () => {
  const text = render(track(manualTurns(10))).contents;
  const { warnings, count } = renderCatalog([{ path: 'chan/a-talk.md', text }]);
  assert.deepEqual(warnings, []);
  assert.equal(count, 1);
});
