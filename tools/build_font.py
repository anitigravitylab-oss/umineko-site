#!/usr/bin/env python3
"""Subset the site's web fonts (both SIL OFL 1.1).

python3 tools/build_font.py

- Pretendard JP: every character used on the pages. Run again after editing
  page text so new characters are included.
- Instrument Serif Italic: ASCII only (numerals and the large "0").

Source fonts are downloaded once into the temp directory (override with
PRETENDARD_JP_TTF / INSTRUMENT_SERIF_TTF). Requires fonttools and brotli
(pip install fonttools brotli).
"""
from __future__ import annotations

import os
import re
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
FONTS = PUBLIC / 'assets' / 'fonts'
TMP = Path(tempfile.gettempdir())
PRETENDARD = (
    'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard-jp/dist/public/variable/PretendardJPVariable.ttf',
    Path(os.environ.get('PRETENDARD_JP_TTF', TMP / 'PretendardJPVariable.ttf')),
    FONTS / 'PretendardJP-subset.woff2',
)
INSTRUMENT = (
    'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/instrumentserif/InstrumentSerif-Italic.ttf',
    Path(os.environ.get('INSTRUMENT_SERIF_TTF', TMP / 'InstrumentSerif-Italic.ttf')),
    FONTS / 'InstrumentSerif-Italic-subset.woff2',
)
ASCII = ''.join(chr(c) for c in range(0x20, 0x7f))

# Always available, so small edits (numbers, ASCII, common punctuation) never fall back
BASE = ''.join(chr(c) for c in range(0x20, 0x7f)) + '、。，．・：；？！「」『』（）［］【】〈〉《》〜ー―…‥〇々×÷±→←↑↓“”‘’％＃＆＠／＿＋－＝０１２３４５６７８９'


def site_characters() -> str:
    text = []
    for path in sorted(PUBLIC.rglob('*.html')) + [PUBLIC / 'assets' / 'main.js']:
        source = path.read_text(encoding='utf-8')
        source = re.sub(r'<svg[\s\S]*?</svg>', ' ', source)  # path data is never rendered as text
        text.append(source)
    chars = {c for c in ''.join(text) + BASE if c.isprintable() and c not in '\n\t'}
    return ''.join(sorted(chars))


def build(spec: tuple[str, Path, Path], chars: str) -> None:
    url, source, out = spec
    if not source.exists():
        print(f'downloading {url}')
        urllib.request.urlretrieve(url, source)
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.hinting = False
    options.desubroutinize = True
    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    out.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(out), options)
    print(f'{out.relative_to(ROOT)}: {len(chars)} characters, {out.stat().st_size // 1024} KB')


def main() -> None:
    build(PRETENDARD, site_characters())
    build(INSTRUMENT, ASCII)


if __name__ == '__main__':
    main()
