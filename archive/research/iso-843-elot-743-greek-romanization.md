# ISO 843:1997 / ELOT 743 Greek romanization, for ASCII filename slugs

Researched 2026-10-18. Question: which Greek-to-Latin scheme to use when slugifying Modern Greek titles (e.g. Teams export `Συνάντηση ομάδας.vtt`) in `src/slug.js`. Nothing in the repo was changed.

Labels: **Fact** = read in a primary source (cited). **Inference** = my deduction. **Verified** = executed against a reference implementation.

## Summary

1. ISO 843:1997 defines two systems. **Type 1** is transliteration: letter for letter, reversible, uses macron and accent marks. **Type 2** is transcription: pronunciation-based, context-dependent (`αυ` becomes `av` or `af`, `μπ` becomes `b` or `mp`), not reversible. ELOT 743 (the Greek national standard) specifies both. The passport and UN/UNGEGN systems are Type 2.
2. **Recommendation for slugs: Type 2 (ELOT 743 transcription), ASCII-folded.** It is what Greek passports, road signs and the UN use, so `Ευάγγελος` becomes `evangelos`, the form a Greek reader expects to search for. Type 1 would give `euangelos`, `aftokinito` would become `autokinito`, and `μπαμπάς` would become `mpampas`. Type 1's one advantage (reversibility) is destroyed anyway by ASCII folding (see section 6) and by lowercasing.
3. **Ordering constraint (important).** Type 2 needs tonos and diaeresis information to decide whether `αυ/ευ/ηυ/ου` is a digraph. With `slugify`'s current order (NFKD, strip `\p{M}`, then map), `άυλος` (`aylos`, immaterial) and `αύλος` (`avlos`, flute) become the same string, and `αϋπνία` wrongly gets `f`. The Greek mapping must run on the NFKD string **before** the combining marks are stripped (or on the NFC string directly). Details in section 5.
4. Everything else in the table is context-free per letter, or depends only on the next/previous letter and word boundaries.

## 1. Sources and what each one gave

| Source | What it gave | Trust |
|---|---|---|
| [ISO catalogue, ISO 843:1997](https://www.iso.org/standard/5215.html) | Edition 1, 1997-01, 12 pages, ICS 01.140.10, stage 90.93 "confirmed", last reviewed and confirmed 2026. Scope: "Establishes a system for the transliteration and/or transcription of Greek characters into Latin characters". The standard text is paywalled and was **not read**. | primary (catalogue only) |
| ELOT 743, 2nd edition, 2001-05-04, full text (SETE-hosted copy via [Wayback](https://web.archive.org/web/20150922010901/http://sete.gr/files/Media/Egkyklioi/040707Latin-Greek.pdf), 14 pages, Greek) | Tables 1 to 4, notes 1 to 12, scope. Its Annex A is stated to be an exact translation of the matching ISO 843 annex. The PDF text layer is garbled, so I **read the rendered pages as images**. This is the main primary source below. | primary (national standard, supersedes 743:1982, aligned with ISO 843:1997 per its foreword) |
| [UNGEGN WGRS, Report on the Current Status of UN Romanization Systems, v4.0, March 2016, Greek entry](https://www.eki.ee/wgrs/rom1_el.pdf) | UN 1987 system (resolution V/19, "based on ELOT 743"), its rules A to D, notes 3 and 4. | primary (UN working group) |
| [Wikipedia, Romanization of Greek](https://en.wikipedia.org/wiki/Romanization_of_Greek) and [Wikipedia, ISO 843](https://en.wikipedia.org/wiki/ISO_843) | Cross-check only. States Type 2 is "adopted by the Greek and Cypriot governments as standard for romanization of names on Greek passports". | secondary |
| [Greek Data Protection Authority decision 2368/2003 (FEK 1562/B/2003)](https://www.e-nomothesia.gr/kat-deltia-tautotetos/2368-2003.html) | ELOT 743 was approved by ministerial decision ΔΙΕΜ/Φ06.5/α 12167/28.09.1983 and is "binding" for writing Greek names in Latin; applies to new IDs and passports. Does not list the rules. | primary (government decision), no rule content |
| [`greek-text-utils` 1.0.1](https://www.npmjs.com/package/greek-text-utils), source unpacked from the npm tarball | Reference implementation; used to **verify** the examples (section 7). | secondary |

Not found: a current gov.gr or Hellenic Police page stating the passport rule. The passport claim rests on Wikipedia plus the 2003 decision plus UNGEGN. Treat "passports use Type 2" as well supported but not read from a passport authority.

## 2. Type 1 versus Type 2

**Fact (ELOT 743:2001, section 1 "Σκοπός").** The standard defines "Τύπος 1, μεταγραμματισμός" and "Τύπος 2, μεταγραφή", and recommends:

- Type 1 for exchanging bibliographic references, catalogues, and where the original Greek may need to be reconstructed. It suits automatic transliteration where the reader or machine does not know Greek.
- Type 2 "μπορεί να χρησιμοποιηθεί στις κάρτες ταυτότητας, στα διαβατήρια, στα οδικά σήματα, στα τοπωνύμια χαρτών" (identity cards, passports, road signs, map place names) where correct pronunciation of the Greek word matters more than recovering the original spelling.
- Annex B (informative) describes a reversal method for Type 2, but Type 2 is not strictly reversible.
- The standard says the implementer must state which type is adopted.

**Fact (ELOT note 1, Type 1).** Type 1 combinations are converted letter by letter; "the only exception" is the double vowels `ΑΥ αυ ΕΥ ευ ΟΥ ου`, which map to `AU au EU eu OU ou`.

**Fact (UNGEGN).** The UN system is a transcription (Type 2); the UN report says the UN 1987 transliteration is reversible transcription given in ISO 843 informative Annex B. Differences from ELOT 743:2001 exist in the UN report's notation, but its rules A to D match ELOT notes 3 to 7 (section 4).

| | Type 1 (ISO 843 / ELOT 743 Table 1) | Type 2 (ELOT 743 Table 2, passports, UN) |
|---|---|---|
| Name | transliteration (μεταγραμματισμός) | transcription (μεταγραφή) |
| Goal | reversibility, catalogues | pronunciation, signs, passports |
| η, ω | Ī ī, Ō ō (macron) | i, o |
| Context rules | only αυ/ευ/ου exception | many |
| Reversible | yes (with macrons and accents) | no |

## 3. Single-letter mappings

Source: ELOT 743:2001 Tables 1 and 2, rendered pages 2 and 3 of the PDF. Type 1 diacritic forms for accented letters: ELOT Table 3 maps the monotonic tonos to the Latin acute accent and dialytika to the diaeresis, and the [Wikipedia ISO 843 page](https://en.wikipedia.org/wiki/ISO_843) lists the resulting letters (Ά→Á, Ή→Ī + U+0301, ΐ→ḯ, ΰ→ÿ + U+0301).

| Greek | Type 1 | Type 2 |
|---|---|---|
| Α α | A a | A a |
| Β β | V v | V v |
| Γ γ | G g | G g |
| Δ δ | D d | D d |
| Ε ε | E e | E e |
| Ζ ζ | Z z | Z z |
| Η η | Ī ī (macron; alt. `I¯`) | I i |
| Θ θ | TH th (`Th` allowed, see section 6) | TH th |
| Ι ι | I i | I i |
| Κ κ | K k | K k |
| Λ λ | L l | L l |
| Μ μ | M m | M m |
| Ν ν | N n | N n |
| Ξ ξ | X x | X x |
| Ο ο | O o | O o |
| Π π | P p | P p |
| Ρ ρ | R r | R r |
| Σ σ and final ς | S s (ς also `s`) | S s (ς also `s`) |
| Τ τ | T t | T t |
| Υ υ | Y y | Y y |
| Φ φ | F f | F f |
| Χ χ | CH ch | CH ch |
| Ψ ψ | PS ps | PS ps |
| Ω ω | Ō ō (macron) | O o |

**Fact (ELOT note 2).** ς and σ both give `s`; the converter must pick the final sigma back by word position, "ςτο τέλος μιας λέξης". In the reverse direction a Latin `s` followed by a non-letter or punctuation becomes `ς`. For slugs this is irrelevant (both map to `s`).

Accented and diaeresis letters keep the base letter and add the mark: ά→á, ί→í, ϊ→ï, ΐ→ḯ, ύ→ý, ϋ→ÿ, ΰ→ÿ + acute, ή→ī + acute (Type 1) / í (Type 2), ώ→ṓ (Type 1) / ó (Type 2). **Inference:** for Type 2 the accent mark is kept (Table 3 maps tonos to acute); passport practice drops it, and for ASCII slugs it is dropped regardless.

## 4. Digraph and context rules

**Fact (ELOT 743:2001 Table 2 plus notes 3 to 10), Type 2.** Rows abbreviated; the letters in parentheses in the standard are listed only for clarity (note 8), the conversion is by each independent character.

| Greek | Type 2 | Condition |
|---|---|---|
| ΑΥ αυ, ΕΥ ευ, ΗΥ ηυ | `av`, `ev`, `iv` | next letter is `β γ δ ζ λ μ ν ρ` or any vowel (note 3) |
| ΑΥ αυ, ΕΥ ευ, ΗΥ ηυ | `af`, `ef`, `if` | next letter is `θ κ ξ π σ τ φ χ ψ`, or the word ends (note 4) |
| αυ, ευ, ηυ | `ay`, `ey`, `iy` | note 9: the vowel before υ is accented, **or** υ carries a diaeresis. Then each letter converts separately (α=a, υ=y). |
| ΟΥ ου | `ou` | always (row 41), except note 9 |
| ου | `oy` | note 9, e.g. `όυ`, `οϋ` (row 42) |
| ΜΠ μπ | `b` | at the beginning **or** end of a word (notes 5, 7) |
| ΜΠ μπ | `mp` | in the middle of a word (note 6) |
| ΝΤ ντ | `nt` | always; no word-initial `d` in ELOT 743:2001 (row 35) |
| ΓΓ γγ | `ng` | always |
| ΓΚ γκ | `gk` | always (row 11) |
| ΓΞ γξ | `nx` | always |
| ΓΧ γχ | `nch` | always |
| ΑΙ ΕΙ ΟΙ ΥΙ | `ai ei oi yi` | letter by letter; with diaeresis on the ι (αϊ, εϊ, οϊ) `aï eï oï` |
| tonos on a digraph | accent moves to the first vowel (note 10) | `αύρ`→`ávr`, `αύχ`→`áfch`, `εύβ`→`évv`, `ηύρ`→`ívr`, `ηύξ`→`ífx` (the standard's examples, read from the rendered page) |

Note 10 is stated in the standard as: when `αυ ευ ηυ` is stressed, the accent is transferred onto the vowel in the Latin output. Combined with note 9 this gives the distinguishing rule: the accent on the **υ** keeps the digraph (`αύ` → `áv`), the accent on the **first vowel** breaks it (`άυ` → `áy`).

**Fact (Type 1).** Only αυ, ευ, ου are exceptions: `au`, `eu`, `ou`. Everything else is letter by letter, so `μπ`=`mp`, `ντ`=`nt`, `γγ`=`gg`, `γκ`=`gk`, `γξ`=`gx`, `γχ`=`gch`, `ηυ`=`īy`. The ELOT text says nothing about accents or diaeresis on these doubles in Type 1; [Wikipedia](https://en.wikipedia.org/wiki/ISO_843) lists `eu`/`eú` and `ou`/`oú`. **Inference:** `άυ` and `αϋ` in Type 1 would be letter by letter (`áy`, `aÿ`), but this is not stated in text I could read (the ISO text is paywalled).

**Cross-check with UNGEGN (Fact).** UN rules: `αυ ευ ηυ` are `av/ev/iv` before `β γ δ ζ λ μ ν ρ` and vowels, `af/ef/if` before `θ κ ξ π σ τ φ χ ψ` and at word end (A and B); `μπ` is `b` at word start and end, `mp` in the middle (C and D); `γγ`=`ng`, `γξ`=`nx`, `γχ`=`nch`; note 3: `αυ ευ ου` convert character by character when the preceding vowel is accented or υ has a diaeresis. UN also lists `γκ` and `ντ` as plain letter sequences `gk`, `nt`. This agrees with ELOT 743:2001.

Secondary disagreement worth knowing: Wikipedia's comparison table mentions `d` for word-initial `ντ` for some systems. That is not ELOT 743:2001 or the UN table; ignore it for this scheme.

## 5. Ordering constraints against the existing `slugify`

`src/slug.js` does `.normalize('NFKD').replace(/\p{M}/gu, '')` before the character map. For Greek that loses exactly the information Type 2 rule 9 needs.

| Input | Type 2 | After NFKD + strip marks, then map | Problem |
|---|---|---|---|
| `αύλος` (flute) | `avlos` | `avlos` | none |
| `άυλος` (immaterial) | `aylos` | `avlos` | accent on first vowel lost, wrong |
| `αϋπνία` | `aypnia` | `afpnia` | diaeresis lost, wrong (`f`) |
| `καϊμάκι` | `kaimaki` | `kaimaki` | harmless: `αϊ` and `αι` both give `ai` |
| `ΐ`, `ΰ` | `i`, `y` | same | NFKD gives ι + U+0308 + U+0301; fine if handled before strip |

Rules that need marks: only note 9 (diaeresis on υ, accent on the vowel before υ) in `αυ ευ ηυ ου`. Rules that do **not** need marks: everything else (`μπ`, `ντ`, `γγ`, ..., sigma, single letters). Exact needs:

- Run the Greek mapping **before** `\p{M}` stripping, on the NFKD (or NFC) string. In NFKD, `ά` is `α` + U+0301, `ϋ` is `υ` + U+0308, `ΰ` is `υ` + U+0308 + U+0301, so a mapper looking at the next code points can see marks after each letter.
- To decide a digraph, examine: (a) any combining mark after the **first** vowel (U+0301 or U+0342 etc.) means no digraph; (b) U+0308 after the υ means no digraph; (c) a U+0301 after the υ keeps the digraph.
- Alternatively, work on NFC and test precomposed characters `ά έ ή ό ϋ ΰ ΐ ϊ ύ` with a small set; this is easier in plain JS and has no mark-stripping step.
- Greek input from Teams may arrive in NFC or NFD and as polytonic precomposed (U+1F00 to 1FFF) forms; NFKD normalisation first covers all of them. Greek tonos (U+0384) and dialytika tonos (U+0385) as standalone symbols decompose under NFKD to a space plus mark; treat as noise.
- Lowercase first only if you also keep final sigma irrelevant: JS `toLowerCase()` turns final `Σ` into `ς`, both map to `s`, so no issue. Uppercase context rules are identical to lowercase (the standard lists upper and lower pairs together), so lowercasing before the digraph pass is safe.

Retention check in `transcriptSlug`: once Greek is mapped, titles that previously slugged to an empty string and fell back to the video id now produce real slugs; letter counts in `TITLE_CHARACTERS` include Greek, so retention stays near 1 (digraph expansions like `θ`→`th` push the count above 1, which is fine for a `>= 0.5` test).

## 6. Uppercase, polytonic, ASCII folding

**Fact (ELOT note 11).** A Greek letter that produces a double capital (`Θ`→`TH`, `Χ`→`CH`, `Ψ`→`PS`) followed by lowercase text (for instance after a full stop): the second and later capitals "may, for aesthetic reasons, be written as lowercase". The standard's examples: `Chara` for `CHara`, `Thalassa` for `THalassa`, `Psari` for `PSari`. So `ΘΑ` is `THA` (all caps) and `Θα` is `Tha` or `THa`; both acceptable. For slugs, this is moot after lowercasing.

**Fact (ELOT note 12).** The macron must be shown for Type 1; if it cannot be, "another character" may substitute, but that is the user's responsibility (loss of reversibility).

**Polytonic (Fact, ELOT Table 3).** Oxia → acute, varia → grave, perispomeni → circumflex, psili/koronis/apostrophos → apostrophe, **dasia → `h`**, ypogegrammeni/prosgegrammeni → cedilla, enotikon → hyphen. Tonos and dialytika map to acute and diaeresis. Archaic letters (Table 4): digamma `W`, yot `j`, Byzantine sigma `S`. **Inference:** for Modern Greek filenames only the dasia → `h` rule changes letters (`Ὁμηρος`→`homiros`); every other polytonic mark is stripped by NFKD + `\p{M}`. Dasia must be detected before the strip if you want `h`; an acceptable simplification is to drop it.

**ASCII folding of Type 1.** After removing macrons and accents Type 1 collapses to: η→i, ι→i, υ→y, ω→o, ο→o, with only `αυ ευ ου` special. It is no longer reversible, so its main reason to exist is gone.

## 7. Worked examples

Type 1 and Type 2 both **with marks as the standard prints them**, then ASCII slug form. Type 2 and the ASCII forms were **verified** against `greek-text-utils` 1.0.1 (outputs below); where it prints Type 1 as accent-free ASCII it matches my hand mapping.

| Greek | Type 1 | Type 2 | slug Type 1 | slug Type 2 | Notes |
|---|---|---|---|---|---|
| Συνάντηση | Synántīsī | Synántisi | `synantisi` | `synantisi` | `ντ` is `nt` in both; η→ī in Type 1 only |
| Ευάγγελος | Euángelos | Evángelos | `euangelos` | `evangelos` | `ευ` before vowel α is `ev`; `γγ`=`ng` in Type 2, `gg` in Type 1 (hand-derived: Type 1 `γγ`=`gg`) |
| Αύριο | Aúrio | Ávrio | `aurio` | `avrio` | accent on υ keeps the digraph; note 10 moves the accent to the first vowel (Type 2) |
| μπαμπάς | mpampás | bampás | `mpampas` | `bampas` | initial `μπ`=`b`, medial `μπ`=`mp` |
| Ντίνος | Ntínos | Ntínos | `ntinos` | `ntinos` | `ΝΤ` is `NT`, not `D`, in ELOT 743:2001 |
| Θεσσαλονίκη | THessaloníkī (`Thessaloníkī`) | Thessaloníki | `thessaloniki` | `thessaloniki` | note 11 permits `Th` |
| καϊμάκι | kaïmáki | kaïmáki | `kaimaki` | `kaimaki` | diaeresis separates `αϊ`; mark loss harmless |
| Ψυχή | PSychī́ (`Psychī́`) | Psychí | `psychi` | `psychi` | |
| ΑΥΤΟΚΙΝΗΤΟ | AUTOKINĪTO | AFTOKINITO | `autokinito` | `aftokinito` | `αυ` before τ is `af` |
| Συνάντηση ομάδας | Synántīsī omádas | Synántisi omádas | `synantisi-omadas` | `synantisi-omadas` | the Teams example |

`greek-text-utils` 1.0.1 output (accent-free): Type 1 / Type 2: `Euangelos / Evangelos`, `Aurio / Avrio`, `mpampas / bampas`, `Ntinos / Ntinos`, `THessaloniki / Thessaloniki` (it is inconsistent on `TH`, which note 11 allows), `PSychi / Psychi`, `AUTOKINITO / AFTOKINITO`, `άυλος`→`aylos` in both, `αύλος`→`aulos / avlos`, `αϋπνία`→`aypnia`, `γκάζι`→`gkazi`. This confirms my reading of note 9 (accent on first vowel or diaeresis breaks the digraph) for Type 2. It also shows that package's Type 1 treats `άυλος` as `ay`, matching my inference.

## 8. Existing JavaScript implementations (reference only)

- **`greek-text-utils`** [npm](https://www.npmjs.com/package/greek-text-utils), v1.0.1 (published 2025-08-10, no later versions), **MIT**, author Dimitris Karagiannis, [repo](https://github.com/mkarajohn/greek-text-utils). Offers `toISO843Type1`, `toISO843Type2`, `fromISO843Type1`, `toGreeklish`, others. README: Type 2 "matching the official government converter". Verified matches the ELOT note 3, 4, 9 rules above. Not used at runtime by the project; the implementation is table-driven and small enough to mirror.
- **`greek-utils`** (vbarzokas), the package `greek-text-utils` says it is based on; not examined.
- Not JavaScript: PyPI `romanize` (Apache, last updated 2017) and a WordPress plugin "KGR ELOT 743".

## 9. Minimal in-house rule set for Type 2 (for the implementer)

1. NFC-normalise (or NFKD, but inspect marks before dropping them).
2. Lowercase.
3. Tokenise by words (word boundary = anything not a letter); `μπ` rule needs word start/end; `αυ ευ ηυ` rule needs the following letter or word end.
4. For `αυ ευ ηυ ου`: no digraph if the first vowel is accented, or the υ has a diaeresis. For `ου` with the digraph: `ou`.
5. Otherwise `αυ ευ ηυ`: `v` before `β γ δ ζ λ μ ν ρ` and vowels, else `f` (including word end).
6. `μπ`: `b` at word start or end, else `mp`. `γγ`=`ng`, `γξ`=`nx`, `γχ`=`nch`, `γκ`=`gk`, `ντ`=`nt`.
7. Single letters per section 3, Type 2 column (θ=`th`, χ=`ch`, ψ=`ps`, η=`i`, ω=`o`, υ=`y`, ς σ=`s`).
8. Strip remaining marks, continue with the existing `[^a-z0-9]+` to `-` step.

## Caveats

- ISO 843:1997 itself is paywalled and was not read. The ELOT 743:2001 text is stated by its own foreword to align with it, and the UN report and `greek-text-utils` agree, but the Type 1 treatment of accented/diaeresis doubles is an inference.
- The ELOT PDF was read as images, so spot-check the table cells in the original before quoting row numbers.
- The ELOT shop page lists "ΕΛΟΤ 743.0" as withdrawn on 2001-05-04, which is the date of the second edition PDF; this is consistent with a revision, not with abolition. I did not verify the current ELOT 743 catalogue status.

## Files

- Scratch (untracked): `E:\Shared\Workspaces\personal\yt-dlp-playground\.scratch\gtu\` (ELOT PDF, page PNGs, unpacked npm tarball, `t.mjs` verification script).
