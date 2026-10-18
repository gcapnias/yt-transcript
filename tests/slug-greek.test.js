import test from 'node:test';
import assert from 'node:assert/strict';

import { channelFolder, usableSlug, transcriptSlug } from '../src/slug.js';

// Romanization is observed through the slug a title produces, the public seam:
// a Greek title that slugs to the fallback would mean the rule did not run.
const FALLBACK = 'FALLBACK';
const slugOf = (title) => transcriptSlug(title, FALLBACK);

function check(vectors) {
  for (const [title, slug] of vectors) assert.equal(slugOf(title), slug, `slug wrong for: ${title}`);
}

test('the worked examples of ELOT 743 Type 2 come out as the research note gives them', () => {
  check([
    ['Συνάντηση', 'synantisi'],
    ['Ευάγγελος', 'evangelos'],
    ['Αύριο', 'avrio'],
    ['μπαμπάς', 'bampas'],
    ['Ντίνος', 'ntinos'],
    ['Θεσσαλονίκη', 'thessaloniki'],
    ['καϊμάκι', 'kaimaki'],
    ['Ψυχή', 'psychi'],
    ['ΑΥΤΟΚΙΝΗΤΟ', 'aftokinito'],
    ['Συνάντηση ομάδας', 'synantisi-omadas'],
  ]);
});

test('single letters, and a final sigma, convert one for one', () => {
  check([
    ['θχψξ', 'thchpsx'],
    ['ηιυω', 'iiyo'],
    ['βγδζ', 'vgdz'],
    ['λέξης', 'lexis'],
    ['ΟΔΟΣ', 'odos'],
  ]);
});

test('αυ, ευ and ηυ are v before a voiced consonant and before a vowel', () => {
  check([
    ['αυλή', 'avli'],
    ['ευρώ', 'evro'],
    ['ηυρα', 'ivra'],
    ['αυγό', 'avgo'],
    ['ευα', 'eva'],
    ['αυιι', 'avii'],
  ]);
});

test('αυ, ευ and ηυ are f before an unvoiced consonant and at the end of a word', () => {
  check([
    ['αυτί', 'afti'],
    ['ευχή', 'efchi'],
    ['ηυξ', 'ifx'],
    ['ναυ', 'naf'],
    ['ζευ', 'zef'],
    ['ηυ', 'if'],
    ['αυ ευ', 'af-ef'],
  ]);
});

test('ου is ou', () => {
  check([['ουρανός', 'ouranos']]);
});

test('μπ is b at the start or end of a word, and mp inside one', () => {
  check([
    ['μπάλα', 'bala'],
    ['κάμπος', 'kampos'],
    ['ρομπ', 'rob'],
    ['μπαμπάς μπάλα', 'bampas-bala'],
  ]);
});

test('ντ, γκ, γγ, γξ and γχ follow their own rules', () => {
  check([
    ['ντομάτα', 'ntomata'],
    ['γκάζι', 'gkazi'],
    ['άγγελος', 'angelos'],
    ['λάρυγξ', 'larynx'],
    ['άγχος', 'anchos'],
  ]);
});

test('an accent on the first vowel, or a diaeresis on the υ, breaks the digraph', () => {
  check([
    ['άυλος', 'aylos'],
    ['αύλος', 'avlos'],
    ['αϋπνία', 'aypnia'],
    ['όυ', 'oy'],
    ['οϋ', 'oy'],
    ['ΆΥΛΟΣ', 'aylos'],
    ['ΕΎΡΟΣ', 'evros'],
    ['έυρος', 'eyros'],
    ['ήυρος', 'iyros'],
  ]);
});

test('an accent on the υ itself keeps the digraph', () => {
  check([
    ['αύχ', 'afch'],
    ['εύβ', 'evv'],
    ['ηύρ', 'ivr'],
    ['ούρα', 'oura'],
  ]);
});

test('Greek in decomposed form romanizes as it does precomposed', () => {
  check([
    ['άυλος'.normalize('NFD'), 'aylos'],
    ['αύλος'.normalize('NFD'), 'avlos'],
    ['αϋπνία'.normalize('NFD'), 'aypnia'],
    ['Συνάντηση'.normalize('NFD'), 'synantisi'],
  ]);
});

test('a word is a run of Greek letters: a Latin letter or a space ends it', () => {
  check([
    ['aμπα', 'aba'],
    ['ναυ ναυ', 'naf-naf'],
    ['ναυx', 'nafx'],
  ]);
});

test('a Greek video title is romanized instead of falling back, and a mixed title keeps both parts', () => {
  check([
    ['Πώς να μάθεις AI', 'pos-na-matheis-ai'],
    ['Νέα Skills! v1.2 για agents', 'nea-skills-v1-2-gia-agents'],
    ['Συνάντηση – Weekly sync', 'synantisi-weekly-sync'],
  ]);
});

test('retention is measured against the romanized title, so θ to th cannot inflate it', () => {
  // `θθθθ` romanizes to eight letters, all kept. Eight CJK letters beside them
  // make the slug exactly half the romanized title; a ninth takes it under.
  // Were each digraph counted as one letter, the slug would keep 8 of 13 and
  // the second title would wrongly survive.
  assert.equal(slugOf('θθθθ 日日日日日日日日'), 'thththth');
  assert.equal(slugOf('θθθθ 日日日日日日日日日'), FALLBACK);
});

test('another script is still dropped, and a title of nothing else falls back', () => {
  check([
    ['日本語のタイトル', FALLBACK],
    ['Привет', FALLBACK],
    ['!!! ??? ...', FALLBACK],
  ]);
});

test('a Greek title mixed with CJK is judged by what the romanized title keeps', () => {
  check([
    ['Συνάντηση 会議', 'synantisi'],
    ['Συνάντηση 日本語日本語日本語日本語日本語', FALLBACK],
  ]);
});

test('latin titles are untouched, and the latin table does not feed the denominator', () => {
  check([
    ['Søren on agents', 'soren-on-agents'],
    ['Straße', 'strasse'],
  ]);
});

test('a Greek channel handle is romanized, and the channel id applies only when nothing is left', () => {
  assert.equal(channelFolder({ handle: '@Συνάντηση', channelId: 'UCabc' }), 'synantisi');
  assert.equal(channelFolder({ handle: '@ΑΥΤΟΚΙΝΗΤΟ_Θ', channelId: 'UCabc' }), 'aftokinito-th');
  assert.equal(channelFolder({ handle: '@日本語', channelId: 'UCabc' }), 'ucabc');
});

test('a meeting slug is the usable slug, and null when the name is empty or too lossy', () => {
  assert.equal(usableSlug('Συνάντηση'), 'synantisi');
  assert.equal(usableSlug('Weekly sync'), 'weekly-sync');
  assert.equal(usableSlug('会議 Q3'), 'q3');
  assert.equal(usableSlug('日本会議 Q3'), null);
  assert.equal(usableSlug('日本会議'), null);
  assert.equal(usableSlug('!!! ???'), null);
  assert.equal(usableSlug(''), null);
});
