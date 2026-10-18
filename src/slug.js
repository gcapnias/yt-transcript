/**
 * The slug: the kebab-case filename a transcript is stored under, derived from
 * the video title, or a meeting's file name.
 *
 * No special cases. Trimming the ends is what disposes of a `--` prefix and a
 * leading `/` without either being named.
 */

/** The full title is never lost to this cap — it is in the frontmatter. */
const SLUG_MAX_LENGTH = 120;

/** Deleted outright rather than separated: `Don't` -> `dont`, not `don-t`. */
const QUOTE_MARKS = /['‘’"“”]/g;

/**
 * Latin letters NFKD does not decompose. They carry no combining mark to
 * strip, so without this table each one becomes punctuation and then a
 * separator: `Søren` -> `s-ren`, `Paweł` -> `pawe-`, `Straße` -> `stra-e`.
 */
const TRANSLITERATIONS = new Map([
  ['ø', 'o'],
  ['ł', 'l'],
  ['đ', 'd'],
  ['ß', 'ss'],
  ['æ', 'ae'],
  ['œ', 'oe'],
  ['þ', 'th'],
  ['ð', 'd'],
]);

/** Greek letters ISO 843 Type 2 gives one Latin spelling, whatever surrounds them. */
const GREEK_LETTERS = new Map([
  ['α', 'a'], ['β', 'v'], ['γ', 'g'], ['δ', 'd'], ['ε', 'e'], ['ζ', 'z'],
  ['η', 'i'], ['θ', 'th'], ['ι', 'i'], ['κ', 'k'], ['λ', 'l'], ['μ', 'm'],
  ['ν', 'n'], ['ξ', 'x'], ['ο', 'o'], ['π', 'p'], ['ρ', 'r'], ['σ', 's'],
  ['ς', 's'], ['τ', 't'], ['υ', 'y'], ['φ', 'f'], ['χ', 'ch'], ['ψ', 'ps'],
  ['ω', 'o'],
]);

const GREEK_VOWELS = new Set([...'αεηιουω']);

/** `αυ`, `ευ` and `ηυ` are `v` before these letters or a vowel, `f` before any other or at a word's end. */
const VOICED_CONSONANTS = new Set([...'βγδζλμνρ']);

/** What the first vowel of `αυ`, `ευ` and `ηυ` is, before the υ is decided. */
const DIGRAPH_VOWELS = new Map([
  ['α', 'a'],
  ['ε', 'e'],
  ['η', 'i'],
]);

/**
 * The marks that mean a vowel is stressed: grave, acute and perispomeni. NFKD folds
 * tonos and oxia into the acute, so those two need no code point of their own.
 */
const ACCENT_MARKS = /[\u0300\u0301\u0342]/;
const DIAERESIS = '\u0308';

/**
 * A word, for the rules that need one: a maximal run of Greek letters with
 * their combining marks attached. Anything else, a space or a Latin letter,
 * ends it.
 */
const GREEK_WORD = /\p{Script=Greek}[\p{Script=Greek}\p{M}]*/gu;

/**
 * One Greek word, lowercase and decomposed, as letters each with the marks that
 * follow it. The marks are kept because ISO 843 note 9 reads them: they are
 * what tells `άυλος` from `αύλος`.
 */
function greekLetters(word) {
  const letters = [];
  for (const character of word.normalize('NFKD').toLowerCase()) {
    if (/\p{M}/u.test(character) && letters.length > 0) letters[letters.length - 1].marks += character;
    else letters.push({ letter: character, marks: '' });
  }
  return letters;
}

/**
 * One Greek word into Latin letters by ISO 843 Type 2 (ELOT 743), the
 * transcription Greek passports use (ADR-0011). Marks are read for the digraph
 * rule and then left out of the result.
 *
 * `αυ`, `ευ`, `ηυ` and `ου` are digraphs unless the first vowel is stressed or
 * the υ carries a diaeresis, when each letter converts alone (`άυλος` is
 * `aylos`, `αύλος` is `avlos`). A stress on the υ keeps the digraph.
 */
function romanizeWord(word) {
  const letters = greekLetters(word);
  let latin = '';

  for (let i = 0; i < letters.length; i += 1) {
    const { letter, marks } = letters[i];
    const next = letters[i + 1];
    const afterNext = letters[i + 2];

    const joinsUpsilon = next?.letter === 'υ' && !ACCENT_MARKS.test(marks) && !next.marks.includes(DIAERESIS);

    if (joinsUpsilon && DIGRAPH_VOWELS.has(letter)) {
      const voiced =
        afterNext && (VOICED_CONSONANTS.has(afterNext.letter) || GREEK_VOWELS.has(afterNext.letter));
      latin += DIGRAPH_VOWELS.get(letter) + (voiced ? 'v' : 'f');
      i += 1;
    } else if (joinsUpsilon && letter === 'ο') {
      latin += 'ou';
      i += 1;
    } else if (letter === 'μ' && next?.letter === 'π') {
      // At the start or end of the word `b`; between letters, `mp`.
      latin += i === 0 || i + 2 === letters.length ? 'b' : 'mp';
      i += 1;
    } else if (letter === 'γ' && next && 'γξχ'.includes(next.letter)) {
      // `γγ` is `ng`, `γξ` `nx`, `γχ` `nch`: the γ is a nasal and the next
      // letter converts on its own.
      latin += 'n';
    } else {
      latin += GREEK_LETTERS.get(letter) ?? letter;
    }
  }

  return latin;
}

/**
 * Greek letters in the text into Latin ones, and nothing else touched. It runs
 * before the marks are stripped from the rest of the title, because the
 * digraph rule needs the accents and diaereses.
 */
function romanizeGreek(text) {
  return String(text).replace(GREEK_WORD, romanizeWord);
}

/**
 * Below this, the slug has swallowed so much of the title that it misleads,
 * and an honest fallback is worth more than a plausible-looking lie.
 */
const MIN_RETENTION = 0.5;

/**
 * Letters and digits in any script: the denominator of the retention ratio.
 * Counted on the title with its Greek romanized, so θ to `th` cannot inflate
 * the ratio, and with the Latin table (`ß` to `ss`) left out, so no Latin
 * title's outcome moves.
 */
const TITLE_CHARACTERS = /[\p{L}\p{N}]/gu;

/**
 * Alphanumerics kept in the slug, over letters and digits in the title. A
 * title with nothing countable in it retains nothing, which is what sends a
 * pure-punctuation title to its fallback.
 */
function retention(slug, title) {
  const titleCharacters = (String(title).match(TITLE_CHARACTERS) ?? []).length;
  if (titleCharacters === 0) return 0;

  return (slug.match(/[a-z0-9]/g) ?? []).length / titleCharacters;
}

/**
 * The Latin pipeline, on text whose Greek is already romanized.
 *
 * @param {string} romanized
 * @returns {string} possibly empty, for text with no Latin alphanumerics
 */
function kebabCase(romanized) {
  return String(romanized)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/./gu, character => TRANSLITERATIONS.get(character) ?? character)
    .replace(QUOTE_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** @returns {string} possibly empty, for a title with no Latin or Greek alphanumerics */
const slugify = (title) => kebabCase(romanizeGreek(title));

/**
 * Cuts an over-long slug at the last `-` boundary at or before the cap, so the
 * last word is never a fragment. A slug with no boundary to cut at is cut
 * hard: the cap never sends a title to its fallback, it only shortens it.
 */
function cap(slug) {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;

  // One character past the cap, so a `-` sitting exactly on the boundary is
  // found and the cut lands at the full width.
  const boundary = slug.slice(0, SLUG_MAX_LENGTH + 1).lastIndexOf('-');
  const cut = boundary > 0 ? slug.slice(0, boundary) : slug.slice(0, SLUG_MAX_LENGTH);
  return cut.replace(/-+$/, '');
}

/** Where a transcript goes when its channel has neither a handle nor an id. */
export const UNKNOWN_CHANNEL_FOLDER = 'unknown-channel';

/** Where every meeting is filed, beside the channel folders (ADR-0010). */
export const MEETINGS_FOLDER = 'meetings';

/**
 * The channel folder a transcript is filed in (ADR-0008): the channel's handle,
 * kebab-cased the way a slug is — a leading `@` drops out, and any run of other
 * characters, `_`, `.` and `-` included, becomes one `-` — but with neither the
 * retention fallback nor the length cap. A folder names a channel, not a title:
 * a handle cannot be too lossy to be honest, only empty.
 *
 * A Greek handle is romanized first. A handle that is missing, or kebab-cases to
 * nothing (a script other than Latin or Greek), falls back to the lowercased
 * channel id, and a channel with neither to `unknown-channel`.
 *
 * @param {{ handle?: string, channelId?: string }} channel as `yt-dlp` reported it
 * @returns {string}
 */
export function channelFolder({ handle, channelId } = {}) {
  return slugify(handle ?? '') || String(channelId ?? '').toLowerCase() || UNKNOWN_CHANNEL_FOLDER;
}

/**
 * The slug a title makes, or null when it makes none worth filing under.
 *
 * A slug retaining less than half the title's letters and digits is discarded.
 * That covers the empty slug — a title entirely in another script, or pure
 * punctuation — but also the worse case an emptiness test misses: a
 * mixed-script title slugs to something non-empty and plausible that has
 * silently dropped most of the words. Greek is romanized before it is counted
 * (ADR-0011), so a Greek title keeps its words.
 *
 * Retention is measured on the slug the title produced, **before** the cap.
 * The cap is a later step answering a filesystem question, not a fidelity one;
 * measuring after it would let sheer length send a perfectly faithful long
 * title to a fallback.
 *
 * @param {string} title
 * @returns {string|null}
 */
export function usableSlug(title) {
  const romanized = romanizeGreek(title);
  const slug = kebabCase(romanized);
  return retention(slug, romanized) >= MIN_RETENTION ? cap(slug) : null;
}

/**
 * The slug a video's or post's transcript is filed under, or the fallback when
 * its title has no usable slug. `o3CX_Y59_74.md` at least announces that it
 * gave up. Nothing functional rests on the filename: identity is the
 * frontmatter `url`, and the real title is in the frontmatter and the catalog.
 *
 * A meeting has no fallback: its caller uses `usableSlug` and refuses the
 * meeting when it is null, because a dated or hashed name would not say what
 * the file is, and would break "transcribing the same file again replaces its
 * transcript" (ADR-0011).
 *
 * @param {string} title
 * @param {string} fallback the video id, or a post's `<handle>-<post id>`
 * @returns {string}
 */
export function transcriptSlug(title, fallback) {
  return usableSlug(title) ?? fallback;
}
