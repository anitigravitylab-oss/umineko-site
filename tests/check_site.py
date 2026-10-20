#!/usr/bin/env python3
"""Static checks for the umineko.dev pages. No dependencies beyond Python 3.

python3 tests/check_site.py

Browser behaviour (layout widths, steppers, menu, copy, no-JS) is covered
separately by `node tests/browser_check.cjs`.
"""
from __future__ import annotations

import re
import struct
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
PAGES = ['index.html', 'operator/index.html', '404.html']
EMAIL = 'contact@umineko.dev'
ZETTER_EMAIL = 'contact@z-etter.com'


class Markup(HTMLParser):
    def __init__(self, text: str):
        super().__init__(convert_charrefs=True)
        self.nodes: list[tuple[str, dict[str, str | None]]] = []
        self.text: list[str] = []
        self._skip = 0
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag, dict(attrs)))
        if tag in ('script', 'style'):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.text.append(data)


class Checker:
    def __init__(self):
        self.count = 0
        self.failures: list[str] = []

    def ok(self, condition: bool, message: str):
        self.count += 1
        if not condition:
            self.failures.append(message)


def local_path(url: str) -> Path | None:
    parts = urlsplit(url)
    if parts.scheme or parts.netloc or not parts.path.startswith('/'):
        return None
    path = parts.path
    if path.endswith('/'):
        path += 'index.html'
    return PUBLIC / path.lstrip('/')


def png_size(path: Path) -> tuple[int, int]:
    head = path.read_bytes()[:24]
    return struct.unpack('>II', head[16:24])


def main() -> int:
    c = Checker()
    raw = {name: (PUBLIC / name).read_text(encoding='utf-8') for name in PAGES}
    docs = {name: Markup(text) for name, text in raw.items()}
    ids = {name: [a['id'] for _, a in doc.nodes if a.get('id')] for name, doc in docs.items()}
    index_ids = set(ids['index.html'])

    for name, doc in docs.items():
        text = raw[name]
        visible = ''.join(doc.text)
        dupes = [k for k, n in Counter(ids[name]).items() if n > 1]
        c.ok(not dupes, f'{name}: duplicate ids {dupes}')
        c.ok(sum(tag == 'h1' for tag, _ in doc.nodes) == 1, f'{name}: expected exactly one h1')
        c.ok(any(t == 'html' and a.get('lang') == 'ja' for t, a in doc.nodes), f'{name}: html lang="ja"')
        c.ok(any(t == 'meta' and a.get('name') == 'viewport' for t, a in doc.nodes), f'{name}: viewport meta')
        c.ok(any(t == 'title' for t, _ in doc.nodes), f'{name}: title')
        c.ok('{{' not in text, f'{name}: unreplaced template placeholder')
        c.ok('main.css' in text, f'{name}: links main.css')

        # Naming: うみねこ in hiragana, Zetter, あめ→はれ
        for wrong in ['ウミネコ', '海猫', 'ZETTR', 'Zettr', 'アメハレ', '雨晴れ']:
            c.ok(wrong not in visible, f'{name}: uses "{wrong}"')
        c.ok('うみねこ' in visible, f'{name}: mentions うみねこ')

        for tag, attrs in doc.nodes:
            if tag == 'img':
                c.ok('alt' in attrs and 'width' in attrs and 'height' in attrs, f'{name}: <img> needs alt/width/height ({attrs.get("src")})')
            if tag == 'button':
                c.ok(attrs.get('type') == 'button', f'{name}: <button> needs type="button"')
            if tag == 'script' and attrs.get('src'):
                c.ok(local_path(attrs['src']) is not None, f'{name}: external script {attrs["src"]}')
            if tag == 'link' and attrs.get('rel') == 'stylesheet':
                c.ok(local_path(attrs['href'] or '') is not None, f'{name}: external stylesheet')
            if attrs.get('target') == '_blank':
                c.ok({'noopener', 'noreferrer'} <= set((attrs.get('rel') or '').split()), f'{name}: target=_blank without noopener noreferrer')
            for ref in ('aria-controls', 'aria-labelledby'):
                for target in (attrs.get(ref) or '').split():
                    c.ok(target in ids[name], f'{name}: {ref} points to missing #{target}')
            if tag == 'use':
                href = attrs.get('href') or ''
                c.ok(href.startswith('#') and href[1:] in ids[name], f'{name}: <use> points to missing {href}')
            for attr in ('href', 'src'):
                url = attrs.get(attr)
                if not url:
                    continue
                if url.startswith('#') and len(url) > 1:
                    c.ok(url[1:] in ids[name], f'{name}: anchor {url} has no target')
                elif url.startswith('/#'):
                    c.ok(url[2:] in index_ids, f'{name}: {url} has no target on the top page')
                elif url.startswith('mailto:'):
                    c.ok(url in (f'mailto:{EMAIL}', f'mailto:{ZETTER_EMAIL}'), f'{name}: unexpected address {url}')
                else:
                    path = local_path(url)
                    if path is not None and not url.startswith('/#'):
                        c.ok(path.exists(), f'{name}: missing local file {url}')

    # Top page structure
    index = docs['index.html']
    for section in ['top', 'why', 'vision', 'products', 'next', 'about', 'try', 'contact']:
        c.ok(section in index_ids, f'index.html: missing #{section}')
    products = [a for t, a in index.nodes if t == 'article' and 'product' in (a.get('class') or '').split()]
    c.ok([a.get('id') for a in products] == ['zetter', 'amehare'], 'index.html: Zetter and あめ→はれ are listed in order')
    for a in products:
        c.ok(a.get('aria-labelledby') in index_ids, f'index.html: product {a.get("id")} has no heading')
        c.ok('hidden' not in a, f'index.html: product {a.get("id")} must not be hidden')
    c.ok(sum(1 for t, a in index.nodes if 'data-stepper' in a) == 4, 'index.html: expected 4 steppers')
    copies = [a.get('data-copy') for t, a in index.nodes if 'data-copy' in a]
    c.ok(copies == [EMAIL], 'index.html: copy button carries the contact address')
    index_text = ''.join(index.text)
    for phrase in ['人類から、', 'コミュニケーション', 'ゼロ', 'Zetter', 'あめ→はれ', '運営：しゃち', '構想', 'サンプル']:
        c.ok(phrase in index_text, f'index.html: missing text "{phrase}"')

    # Operator page keeps the disclosure wording
    operator_text = ''.join(docs['operator/index.html'].text)
    for phrase in ['個人事業', '請求があった場合に、遅滞なく電子メールその他の方法で提供します。', EMAIL]:
        c.ok(phrase in operator_text, f'operator: missing "{phrase}"')

    # Assets
    css = (PUBLIC / 'assets/main.css').read_text(encoding='utf-8')
    c.ok(css.count('{') == css.count('}'), 'main.css: unbalanced braces')
    c.ok('prefers-reduced-motion' in css, 'main.css: reduced-motion rules')
    og = PUBLIC / 'assets/og.png'
    c.ok(og.exists() and png_size(og) == (1200, 630), 'og.png must be 1200x630')
    for old in ['assets/style.css', 'assets/site.js', 'assets/connection.svg']:
        c.ok(not (PUBLIC / old).exists(), f'stale asset still present: {old}')

    # Web font: self-hosted subset that covers every character on the pages
    font = PUBLIC / 'assets/fonts/PretendardJP-subset.woff2'
    c.ok(font.exists(), 'web font subset is missing (run tools/build_font.py)')
    c.ok((PUBLIC / 'assets/fonts/InstrumentSerif-Italic-subset.woff2').exists(), 'serif font subset is missing (run tools/build_font.py)')
    for license_file in ('OFL-Pretendard.txt', 'OFL-InstrumentSerif.txt'):
        c.ok((PUBLIC / 'assets/fonts' / license_file).exists(), f'font license {license_file} is missing')
    for name in PAGES:
        c.ok('PretendardJP-subset.woff2' in raw[name], f'{name}: font is not preloaded')
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print('SKIP: font coverage (pip install fonttools brotli to enable)')
    else:
        cmap = TTFont(font).getBestCmap()
        used = set()
        for name, doc in docs.items():
            used |= set(''.join(doc.text))
            used |= {ch for t, a in doc.nodes for k, v in a.items() if k in ('alt', 'aria-label') and v for ch in v}
        js = (PUBLIC / 'assets/main.js').read_text(encoding='utf-8')
        used |= set(''.join(re.findall(r"'([^']*)'", js)))
        # Emoji are drawn by the device's emoji font, not the web font
        def is_emoji(ch: str) -> bool:
            cp = ord(ch)
            return cp >= 0x1F000 or 0x2600 <= cp <= 0x27BF or cp in (0xFE0F, 0x200D)
        missing = sorted(ch for ch in used if ch.strip() and not is_emoji(ch) and ord(ch) not in cmap)
        c.ok(not missing, f'font subset lacks {"".join(missing)} (run tools/build_font.py)')

    # Delivery settings
    wrangler = (ROOT / 'wrangler.toml').read_text(encoding='utf-8')
    c.ok('directory = "./public"' in wrangler and 'not_found_handling = "404-page"' in wrangler, 'wrangler.toml: assets settings changed')
    sitemap = ET.parse(PUBLIC / 'sitemap.xml').getroot()
    locs = [el.text for el in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
    c.ok(locs == ['https://umineko.dev/', 'https://umineko.dev/operator/'], 'sitemap.xml: unexpected URLs')
    c.ok('Sitemap: https://umineko.dev/sitemap.xml' in (PUBLIC / 'robots.txt').read_text(), 'robots.txt: sitemap line')
    c.ok('X-Content-Type-Options: nosniff' in (PUBLIC / '_headers').read_text(), '_headers: security headers')

    if c.failures:
        print('\n'.join(f'FAIL: {f}' for f in c.failures))
        print(f'{len(c.failures)} of {c.count} checks failed')
        return 1
    print(f'PASS: {c.count} structural checks')
    return 0


if __name__ == '__main__':
    sys.exit(main())
