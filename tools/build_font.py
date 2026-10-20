#!/usr/bin/env python3
"""Subset Pretendard JP (SIL OFL 1.1) to the characters used on the site.

python3 tools/build_font.py

Run again after editing page text so new characters are included. The source
font is downloaded once into the temp directory (override with
PRETENDARD_JP_TTF=/path/to/PretendardJPVariable.ttf). Requires fonttools and
brotli (pip install fonttools brotli).
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
OUT = PUBLIC / 'assets' / 'fonts' / 'PretendardJP-subset.woff2'
URL = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard-jp/dist/public/variable/PretendardJPVariable.ttf'
SOURCE = Path(os.environ.get('PRETENDARD_JP_TTF', Path(tempfile.gettempdir()) / 'PretendardJPVariable.ttf'))

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


def main() -> None:
    if not SOURCE.exists():
        print(f'downloading {URL}')
        urllib.request.urlretrieve(URL, SOURCE)
    chars = site_characters()
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.hinting = False
    options.desubroutinize = True
    font = subset.load_font(str(SOURCE), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(OUT), options)
    print(f'{OUT.relative_to(ROOT)}: {len(chars)} characters, {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
