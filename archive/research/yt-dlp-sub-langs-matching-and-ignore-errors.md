# yt-dlp `--sub-langs` matching and `--ignore-errors` semantics

Researched 2026-10-08 against yt-dlp tag `2026.08.19` (source fetched from raw.githubusercontent.com at that tag). Regex behaviour was checked with an equivalent JS `^(?:...)$` test (no Python on this machine); the `fullmatch` + `re.I` semantics come straight from the source quoted below. Nothing was run against live URLs; extractor-error conclusions are derived from code.

Link base `Y` = `https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp`

## 1. `--sub-langs` matching

### 1.1 Anchoring: full match, case-insensitive

[`Y/utils/_utils.py#L5340`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/utils/_utils.py#L5325-L5352), `orderedSet_from_options(..., use_regex=True)`:

```python
current = (filter(re.compile(val, re.I).fullmatch, alias_dict['all']) if use_regex
           else [val] if val in alias_dict['all'] else None)
```

- Each comma-separated entry is compiled as a regex and applied with `.fullmatch` to each available language key. It is anchored at both ends and cannot match a substring. A plain `en` matches only the key `en`, not `en-US`.
- The flag is `re.I`, so matching is case-insensitive. This matters in 1.3.
- `all` is an alias; a leading `-` discards matches (`all,-live_chat`).
- Option help ([options.py#L1001-L1008](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/options.py#L1001-L1008)): `--sub-langs "en.*,ja"` ... "where "en.*" is a regex pattern that matches "en" followed by 0 or more of any character".
- An invalid regex becomes `ValueError('Wrong regex for subtitlelangs: ...')` ([YoutubeDL.py#L3180-L3183](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L3180-L3183)).
- The option value is split with a plain `value.split(',')` and each piece is `.strip()`ed ([options.py#L248-L254](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/options.py#L248-L254)). A comma inside a regex (for example `{2,3}`) therefore splits the entry; avoid commas in patterns.

### 1.2 Answers for `en-[A-Z]{2}` (fullmatch, re.I)

| key | matches? |
| --- | --- |
| `en-US`, `en-GB` | yes |
| `en-en-US` | no |
| `en-orig` | no |
| `de-en-US` | no |
| `en` | no (list `en` as its own entry) |
| `es-419`, `en-419` | no (digits are not `[A-Z]`) |
| `en-US-x`, `en-Hans` | no |
| `en-us` | yes (re.I) |
| `en-fr`, `en-de` | yes, a pitfall (see 1.3) |

For numeric region codes like `es-419`, use a class with digits, for example `es-[0-9]{3}` as a separate entry (no commas inside braces).

### 1.3 Pitfall: YouTube auto-translated captions are keyed `<target>-<source>`

[`Y/extractor/youtube/_video.py#L4290-L4315`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/youtube/_video.py#L4290-L4315):

```python
if is_manual_subs and trans_code != 'und':
    if not get_translated_subs:
        continue
    trans_code += f'-{lang_code}'
...
# Add an "-orig" label to the original language so that it can be distinguished.
# The subs are returned without "-orig" as well for compatibility
process_language(automatic_captions, base_url, f'{trans_code}-orig', ...)
```

- English translated from a French manual track is `en-fr`; German translated from `en-US` is `de-en-US`.
- Because matching is case-insensitive, `en-[A-Z]{2}` also matches `en-fr` / `en-de`. These are machine translations into English, not regional English, and they are only present when a manual track exists in that source language.
- Case-sensitive alternatives: Python inline scoped flag `(?-i:en-[A-Z]{2})`, or an explicit list such as `en-(US|GB|CA|AU|IN|IE|NZ)` (still re.I, but exact codes). Test checked in JS only: case-sensitive `en-[A-Z]{2}` accepts `en-US`/`en-GB` and rejects `en-fr`/`en-us`. The inline-flag syntax was not run in Python here.
- Translated subs can be disabled with `--extractor-args "youtube:skip=translated_subs"` ([README `#youtube`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/README.md#youtube), [_video.py#L4237](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/youtube/_video.py#L4237)).
- The original-language auto caption is exposed both as `xx-orig` and as plain `xx` (code comment above), so plain `en` also catches an English original auto caption. Key formats for non-YouTube sites were not checked.

### 1.4 Manual vs automatic when both exist

[`YoutubeDL.py#L3159-L3168`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L3159-L3168), `process_subtitles`:

```python
available_subs, normal_sub_langs = {}, []
if normal_subtitles and self.params.get('writesubtitles'):
    available_subs.update(normal_subtitles)
    normal_sub_langs = tuple(normal_subtitles.keys())
if automatic_captions and self.params.get('writeautomaticsub'):
    for lang, cap_info in automatic_captions.items():
        if lang not in available_subs:
            available_subs[lang] = cap_info
```

Manual subtitles are inserted first; an automatic caption is added only if that language key is absent. For a language with both, **the manual track wins and the auto caption is silently ignored**. Regexes are matched against `all_sub_langs = tuple(available_subs.keys())` (L3175).

### 1.5 Download order

`orderedSet_from_options` walks entries in CLI order and appends each entry's matches in `available_subs` order (manual keys first, then auto-only keys); `orderedSet` drops duplicates keeping the first ([_utils.py#L774-L783](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/utils/_utils.py#L774-L783)). `process_subtitles` then iterates `requested_langs` (L3198) and `_write_subtitles` iterates `requested_subtitles.items()` ([L4465](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L4465)). So `--sub-langs en,en-[A-Z]{2}` downloads `en` first, then regional variants.

A literal language that is absent only warns (L3199-L3202): `self.report_warning(f'{lang} subtitles not available for {video_id}')`. A regex matching nothing is silent. With no `--sub-langs` at all, a single language is picked, preferring `en` (L3185-L3190).

## 2. `--ignore-errors` / `-i`

### 2.1 The three settings of `ignoreerrors`

[`options.py#L380-L391`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/options.py#L380-L391):

```python
'-i', '--ignore-errors',  action='store_true',  dest='ignoreerrors'
    # 'Ignore download and postprocessing errors. The download will be considered successful even if the postprocessing fails'
'--no-abort-on-error',    action='store_const', dest='ignoreerrors', const='only_download'
    # 'Continue with next video on download errors; e.g. to skip unavailable videos in a playlist (default)'
'--abort-on-error', '--no-ignore-errors', action='store_false', dest='ignoreerrors'
    # 'Abort downloading of further videos if an error occurs (Alias: --no-ignore-errors)'
```

[`__init__.py#L155`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/__init__.py#L155): `set_default_compat('abort-on-error', 'ignoreerrors', 'only_download')`. The **default is `'only_download'`**. README compat section: "`--no-abort-on-error` is enabled by default. Use `--abort-on-error` or `--compat-options abort-on-error` to abort on errors instead".

| flag | `ignoreerrors` | truthy | `is True` |
| --- | --- | --- | --- |
| default / `--no-abort-on-error` | `'only_download'` | yes | no |
| `-i` | `True` | yes | yes |
| `--abort-on-error` | `False` | no | no |

### 2.2 Core mechanism: `trouble()` and the exit code

[`YoutubeDL.py#L1072-L1104`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L1072-L1104):

```python
if not is_error:
    return
if not self.params.get('ignoreerrors'):
    ...
    raise DownloadError(message, exc_info)
self._download_retcode = 1
```

`report_error` (L1160) calls `trouble`. Under any truthy `ignoreerrors` (default or `-i`), an error prints `ERROR: ...` on stderr, does not raise, and sets the return code to 1. `download()` returns `_download_retcode` (L3717), which `_real_main` returns as the exit code. Only `--abort-on-error` raises `DownloadError` (also exit 1, [`main`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/__init__.py#L1081) `except DownloadError: _exit(1)`).

### 2.3 (a) Subtitle download failure (HTTP 429)

[`YoutubeDL.py#L4491-L4503`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L4449-L4503), `_write_subtitles`:

```python
except (DownloadError, ExtractorError, OSError, ValueError, *network_exceptions) as err:
    msg = f'Unable to download video subtitles for {sub_lang!r}: {err}'
    if self.params.get('ignoreerrors') is not True:  # False or 'only_download'
        if not self.params.get('ignoreerrors'):
            self.report_error(msg)
        raise DownloadError(msg)
    self.report_warning(msg)
```

- `-i` (`True`): only `report_warning`; the loop continues with the next language; the video completes; exit 0. Matches the empirical result.
- Default (`'only_download'`): raises `DownloadError(msg)`. The `for` loop is abandoned, so **remaining languages are not attempted**. `_handle_extraction_exceptions` ([L1728-L1752](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L1722-L1752), generic `except Exception: if self.params.get('ignoreerrors'): self.report_error(...)`) prints `ERROR:` and sets retcode 1.
- `--abort-on-error`: `report_error` raises `DownloadError` immediately; exit 1.

`-i` is the only setting where a subtitle failure is non-fatal and the later languages still download. The only trace of the skipped language is the WARNING line and the missing file.

### 2.4 (b) Extractor errors

[`YoutubeDL.py#L1728-L1752`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L1722-L1752):

```python
except GeoRestrictedError as e:
    ...
    self.report_error(msg)
except ExtractorError as e:  # An error we somewhat expected
    self.report_error(str(e), e.format_traceback())
except Exception as e:
    if self.params.get('ignoreerrors'):
        self.report_error(str(e), tb=encode_compat_str(traceback.format_exc()))
    else:
        raise
```

`ExtractorError` and `GeoRestrictedError` always go through `report_error` -> `trouble`. With default or `-i`: `ERROR:` on stderr, no exception, **exit 1**. `-i` changes nothing for them. With `--abort-on-error`: `DownloadError`, exit 1. Video unavailable / private / login required / geo-blocked are all `ExtractorError`s (`UnavailableVideoError` is handled in [`__download_wrapper`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L3685-L3692) via `report_error`).

X/Twitter "No video could be found in this tweet" ([twitter.py#L1377](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/twitter.py#L1377)):

```python
self.raise_no_formats('No video could be found in this tweet', expected=True)
```

[`InfoExtractor.raise_no_formats`](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/common.py#L1265-L1272):

```python
if expected and (self.get_param('ignore_no_formats_error') or self.get_param('wait_for_video')):
    self.report_warning(msg, video_id)
elif isinstance(msg, ExtractorError):
    raise msg
else:
    raise ExtractorError(msg, expected=expected, video_id=video_id)
```

Without `--ignore-no-formats-error` this raises `ExtractorError` -> ERROR, exit 1, with or without `-i`. Only `--ignore-no-formats-error` turns it into a WARNING (extraction then continues, so subtitles/metadata for the item are still processed).

### 2.5 (c) Narrower options

- `--no-abort-on-error` is the default and does not tolerate subtitle failures for the current video: it still raises `DownloadError` ([L4498-L4500](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L4498-L4500)), which ends up as ERROR + exit 1 and skips remaining languages. Its effect is only "continue with the next video in a playlist"; for a single URL it equals the default.
- No subtitle-specific tolerance option exists. The `is not True` check is keyed to `-i`, so `-i` is the only switch that downgrades subtitle download errors to warnings.
- `--ignore-no-formats-error` ([options.py#L1245-L1254](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/options.py#L1245-L1254): "Ignore "No video formats" error. Useful for extracting metadata even if the videos are not actually available for download (experimental)") is orthogonal. It covers `raise_no_formats` cases and "Requested format is not available" ([YoutubeDL.py#L3095-L3099](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L3095-L3099)), not subtitle HTTP errors and not login/private/unavailable errors.
- Other effects of `-i`: postprocessing errors are downgraded only when `ignoreerrors is True` (`run_pp`, [L3815-L3818](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/YoutubeDL.py#L3812-L3818)); missing ffmpeg for merging becomes a warning (L3545-L3548). Likely irrelevant with `--skip-download`.
- With `-i`, exit code alone cannot distinguish "all subtitles fetched" from "one language skipped after a 429". Detect via the `Unable to download video subtitles for '<lang>'` WARNING on stderr or by checking the files on disk.

## 3. Implications for yt-transcript

- A regional-English entry should be case-sensitive or an explicit region list, to avoid `en-fr`-style auto-translations. Keep commas out of regexes. Add `es-[0-9]{3}`-style entries separately if numeric regions matter.
- `-i` leaves extractor failures at exit 1 + ERROR and only converts subtitle and postprocessing failures into warnings/exit 0.
