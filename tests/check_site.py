#!/usr/bin/env python3
"""Validate static markup; optionally render the unchanged CSS/JS in Chromium.

python tests/check_site.py
python tests/check_site.py --browser --screenshots /tmp/umineko-preview

Browser checks inline local resources to work without a server or Internet.
They do NOT verify HTTP routing, deployment, or live external destinations.
"""
from __future__ import annotations
import argparse
import base64
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import shutil
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
PAGES = ['index.html', 'operator/index.html', '404.html']
BRAND_ASSETS = {'/assets/logo-circle-64.png', '/assets/logo-circle-192.png', '/assets/logo-circle-512.png'}

class Markup(HTMLParser):
    def __init__(self, text: str):
        super().__init__(convert_charrefs=True)
        self.nodes: list[tuple[str, dict[str, str | None]]] = []
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag, dict(attrs)))


def check_static(allow_existing_brand_assets: bool = False) -> int:
    checks = 0
    parsed = {name: Markup((PUBLIC / name).read_text()) for name in PAGES}
    for name, doc in parsed.items():
        ids = [a['id'] for _, a in doc.nodes if 'id' in a]
        assert not [key for key, count in Counter(ids).items() if count > 1], f'{name}: duplicate ID'
        assert sum(tag == 'h1' for tag, _ in doc.nodes) == 1, f'{name}: expected one h1'
        assert any(tag == 'html' and a.get('lang') == 'ja' for tag, a in doc.nodes)
        assert any(tag == 'meta' and a.get('name') == 'viewport' for tag, a in doc.nodes)
        checks += 4
        for tag, attrs in doc.nodes:
            if tag == 'img':
                assert 'alt' in attrs and 'width' in attrs and 'height' in attrs
                checks += 1
            if attrs.get('target') == '_blank':
                assert {'noopener', 'noreferrer'} <= set((attrs.get('rel') or '').split())
                checks += 1
            if tag == 'button':
                assert attrs.get('type') == 'button'
                checks += 1
            for refattr in ['aria-controls', 'aria-labelledby']:
                for target in (attrs.get(refattr) or '').split():
                    assert target in ids, f'{name}: unknown {refattr} target {target}'
                    checks += 1
            for attr in ['href', 'src']:
                raw = attrs.get(attr)
                if not raw:
                    continue
                url = urlsplit(raw)
                if url.scheme or url.netloc:
                    assert not raw.startswith(('javascript:', 'http:')), raw
                    continue
                path = unquote(url.path)
                if not path:
                    targetfile = name
                else:
                    target = PUBLIC / path.lstrip('/') if path.startswith('/') else (PUBLIC / name).parent / path
                    if target.is_dir() or path.endswith('/'):
                        target = target / 'index.html'
                    if path in BRAND_ASSETS and allow_existing_brand_assets and not target.exists():
                        continue  # Existing GitHub blobs verified separately; never a production setting.
                    assert target.is_file(), f'{name}: missing local resource {raw}'
                    targetfile = str(target.relative_to(PUBLIC))
                if url.fragment and targetfile in parsed:
                    targetids = {a.get('id') for _, a in parsed[targetfile].nodes}
                    assert unquote(url.fragment) in targetids, f'{name}: broken anchor {raw}'
                checks += 1
    sitemap = ET.parse(PUBLIC / 'sitemap.xml')
    urls = {node.text for node in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')}
    assert urls == {'https://umineko.dev/', 'https://umineko.dev/operator/'}
    assert 'noindex' in (PUBLIC / '404.html').read_text()
    assert '運営：しゃち / 開発：うみねこ' in (PUBLIC / 'index.html').read_text()
    assert '請求があった場合に、遅滞なく電子メールその他の方法で提供します。' in (PUBLIC / 'operator/index.html').read_text()
    ET.parse(PUBLIC / 'assets/connection.svg')
    print(f'PASS: {checks + 5} structural checks')
    return checks + 5


def render_html(name: str = 'index.html', javascript: bool = True) -> str:
    """Replace only transport: exact local stylesheet, SVG and script contents."""
    text = (PUBLIC / name).read_text()
    text = re.sub(r'<link rel="stylesheet"[^>]*>', lambda _: '<style>' + (PUBLIC / 'assets/style.css').read_text() + '</style>', text)
    text = re.sub(r'<script src="[^"]+" defer></script>', '', text)
    text = re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>', '', text)
    svg = base64.b64encode((PUBLIC / 'assets/connection.svg').read_bytes()).decode()
    text = text.replace('/assets/connection.svg', 'data:image/svg+xml;base64,' + svg)
    if javascript:
        text = text.replace('</body>', '<script>' + (PUBLIC / 'assets/site.js').read_text() + '</script></body>')
    return text


def check_browser(screenshots: Path | None) -> None:
    from playwright.sync_api import sync_playwright
    if screenshots:
        screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        chromium = shutil.which('chromium') or shutil.which('chromium-browser')
        options = {'headless': True}
        if chromium:
            options['executable_path'] = chromium
        browser = p.chromium.launch(**options)
        errors: list[str] = []
        for width in [320, 360, 390, 768, 1024, 1440, 1920]:
            page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
            page.on('pageerror', lambda error: errors.append(str(error)))
            for name in PAGES:
                page.set_content(render_html(name))
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{name}: overflow at {width}px'
                assert page.locator('h1').is_visible()
                assert page.locator('main').is_visible()
            page.close()
        page = browser.new_page(viewport={'width':390, 'height':844}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(render_html())
        menu = page.locator('.menu-toggle')
        nav = page.locator('#site-nav')
        assert menu.is_visible() and not nav.is_visible()
        menu.click()
        assert nav.is_visible() and menu.get_attribute('aria-expanded') == 'true'
        page.keyboard.press('Escape')
        assert not nav.is_visible() and menu.evaluate('(el) => el === document.activeElement')
        menu.click()
        page.locator('h1').click()
        assert not nav.is_visible()
        menu.click()
        page.set_viewport_size({'width':1440, 'height':1000})
        assert nav.is_visible() and menu.get_attribute('aria-expanded') == 'false'
        page.set_viewport_size({'width':390, 'height':844})
        assert not nav.is_visible()
        rain = page.locator('[data-weather-button="ame"]')
        sun = page.locator('[data-weather-button="hare"]')
        rain.click()
        assert rain.get_attribute('aria-pressed') == 'true'
        assert sun.get_attribute('aria-pressed') == 'false'
        assert 'ひと休み' in page.locator('.weather-message').inner_text()
        page.keyboard.press('ArrowRight')
        assert sun.get_attribute('aria-pressed') == 'true'
        assert sun.evaluate('(el) => el === document.activeElement')
        assert 'きれいだった' in page.locator('.weather-message').inner_text()
        assert page.evaluate('getComputedStyle(document.documentElement).scrollBehavior') == 'auto'
        assert page.locator('.art-core').evaluate('(el) => getComputedStyle(el).transitionDuration') == '0s'
        assert page.locator('.copy-email').is_hidden()  # about:blank is not secure; mail link is the fallback.
        assert page.locator('.contact-email').get_attribute('href') == 'mailto:ymdtkru@gmail.com'
        # Clipboard permission success and denial are mocked, not OS clipboard integration.
        for deny in [False, True]:
            clipboard_page = browser.new_page(viewport={'width':390, 'height':844})
            clipboard_page.evaluate('''(deny) => {
              Object.defineProperty(window, 'isSecureContext', {value:true, configurable:true});
              Object.defineProperty(navigator, 'clipboard', {value:{writeText: async (text) => {
                if (deny) throw new Error('Permission denied'); window.copiedText = text;
              }}, configurable:true});
            }''', deny)
            clipboard_page.set_content(render_html())
            clipboard_page.locator('.copy-email').click()
            status = clipboard_page.locator('.copy-status')
            if deny:
                assert 'コピーできませんでした' in status.inner_text()
            else:
                assert 'コピーしました' in status.inner_text()
                assert clipboard_page.evaluate('window.copiedText') == 'ymdtkru@gmail.com'
            clipboard_page.close()
        page.close()
        nojs = browser.new_page(java_script_enabled=False, viewport={'width':390,'height':844})
        nojs.set_content(render_html(javascript=False))
        assert nojs.locator('#site-nav').is_visible()
        assert nojs.locator('.menu-toggle').is_hidden()
        assert nojs.locator('[data-weather-button="ame"]').is_disabled()
        for selector in ['h1','#intro','#products','.vision','#approach','#about','#contact']:
            assert nojs.locator(selector).is_visible(), f'No-JS content hidden: {selector}'
        nojs.close()
        if screenshots:
            for width, label in [(1440, 'desktop'), (390, 'mobile')]:
                shot = browser.new_page(viewport={'width':width,'height':1000 if width > 700 else 844}, reduced_motion='reduce')
                shot.set_content(render_html())
                shot.screenshot(path=str(screenshots / f'{label}-top.png'))
                shot.screenshot(path=str(screenshots / f'{label}-full.png'), full_page=True)
                shot.locator('[data-weather-button="ame"]').click()
                shot.locator('.amehare-visual').screenshot(path=str(screenshots / f'{label}-rain.png'))
                shot.set_content(render_html('operator/index.html'))
                shot.screenshot(path=str(screenshots / f'{label}-operator.png'),full_page=True)
                shot.set_content(render_html('404.html'))
                shot.screenshot(path=str(screenshots / f'{label}-404.png'),full_page=True)
                shot.close()
        assert not errors, errors
        browser.close()
    print('PASS: Chromium, 3 pages × 7 widths (320–1920px), mobile menu/Escape/resize, weather click/keyboard, reduced motion, clipboard success/denial mocks, no-JS fallback; no page errors')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', action='store_true')
    parser.add_argument('--screenshots', type=Path)
    parser.add_argument('--allow-existing-brand-assets', action='store_true', help='Only for isolated review environments missing the unchanged GitHub PNG blobs')
    args = parser.parse_args()
    check_static(args.allow_existing_brand_assets)
    if args.browser:
        check_browser(args.screenshots)

if __name__ == '__main__':
    main()
