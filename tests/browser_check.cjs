#!/usr/bin/env node
/*
 * Browser checks for umineko.dev, served from ./public by a small local server
 * that mimics the Workers asset routing (directory index + custom 404).
 *
 *   node tests/browser_check.cjs                      # needs the `playwright` package
 *   node tests/browser_check.cjs --screenshots DIR    # also saves screenshots
 *
 * Not covered: the production HTTP headers, real iOS Safari, live external sites.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const EMAIL = 'ymdtkru@gmail.com';
const shotDir = (() => {
  const i = process.argv.indexOf('--screenshots');
  return i > -1 ? process.argv[i + 1] : null;
})();

let passed = 0;
const failures = [];
const check = (condition, message) => {
  if (condition) passed += 1;
  else failures.push(message);
};

const serve = () => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(PUBLIC, p);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      res.end(fs.readFileSync(path.join(PUBLIC, '404.html')));
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const watch = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()); });
  return errors;
};

const revealAll = (page) => page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible')));

async function layoutChecks(browser, base) {
  for (const width of WIDTHS) {
    const mobile = width < 800;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 760 : 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = watch(page);
    for (const route of ['/', '/operator/', '/missing-page']) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      check(response.status() === (route === '/missing-page' ? 404 : 200), `${width}px ${route}: HTTP status ${response.status()}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, `${width}px ${route}: horizontal overflow ${overflow}px`);
      const broken = await page.evaluate(() => [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src));
      check(broken.length === 0, `${width}px ${route}: broken images ${broken.join(', ')}`);
      if (shotDir && route === '/') {
        await revealAll(page);
        await page.screenshot({ path: path.join(shotDir, `top-${width}.png`), fullPage: true });
      }
    }
    // Text inside cards and buttons must not spill out of its box
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const spills = await page.evaluate(() => [...document.querySelectorAll('.btn, .tab, .feature, .principle, .try-card, .step-bars, .stepper-nav')]
      .filter((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className));
    check(spills.length === 0, `${width}px: content overflows ${spills.join(', ')}`);
    check(errors.length === 0, `${width}px: console errors ${errors.join(' | ')}`);
    await context.close();
  }
}

async function interactionChecks(browser, base, width) {
  const mobile = width < 800;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await context.newPage();
  const errors = watch(page);
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await revealAll(page);
  const label = `${width}px`;

  // Web font
  const fontReady = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 32px "Pretendard JP"', '人類から'); });
  check(fontReady, `${label} web font: Pretendard JP is loaded`);
  const ripple = await page.evaluate(async () => {
    await Promise.all([...document.querySelectorAll('.hero-title .ln')].flatMap((el) => el.getAnimations()).map((a) => a.finished));
    const zero = document.querySelector('[data-zero]').getBoundingClientRect();
    const rings = document.querySelector('[data-ripples]').getBoundingClientRect();
    return Math.hypot(zero.left + zero.width / 2 - rings.left, zero.top + zero.height / 2 - rings.top);
  });
  check(ripple < 4, `${label} hero: ripples start from ゼロ (off by ${Math.round(ripple)}px)`);

  // Story stepper
  const story = page.locator('.story');
  check(await story.getAttribute('data-step') === '1', `${label} story starts at step 1`);
  check(await page.locator('.story [data-prev]').isDisabled(), `${label} story: back is disabled on step 1`);
  for (let i = 0; i < 3; i += 1) await page.locator('.story [data-next]').click();
  check(await story.getAttribute('data-step') === '4', `${label} story: next reaches step 4`);
  check((await page.locator('.story [data-next-label]').textContent()) === '最初から', `${label} story: last step offers restart`);
  check(await page.locator('.story [data-goto="4"]').getAttribute('aria-current') === 'step', `${label} story: progress marks current step`);
  check(await page.locator('.story-steps > li:visible').count() === 1, `${label} story: one caption visible`);
  await page.locator('.story [data-next]').click();
  check(await story.getAttribute('data-step') === '1', `${label} story: restart returns to step 1`);
  await page.locator('.story-stage').click();
  check(await story.getAttribute('data-step') === '2', `${label} story: tapping the stage advances`);
  await page.locator('.story [data-prev]').focus();
  await page.keyboard.press('ArrowRight');
  check(await story.getAttribute('data-step') === '3', `${label} story: arrow key advances`);
  await page.locator('.story [data-goto="1"]').click();
  check(await story.getAttribute('data-step') === '1', `${label} story: progress bar jumps to a step`);

  // Product tabs and walkthroughs
  const zetter = page.locator('#panel-zetter');
  const amehare = page.locator('#panel-amehare');
  check(await zetter.isVisible() && !(await amehare.isVisible()), `${label} products: Zetter shown first`);
  await page.locator('#tab-amehare').click();
  check(await amehare.isVisible() && !(await zetter.isVisible()), `${label} products: tab switches panel`);
  check(await page.locator('#tab-amehare').getAttribute('aria-selected') === 'true', `${label} products: aria-selected follows`);
  await page.locator('#tab-amehare').press('ArrowLeft');
  check(await zetter.isVisible(), `${label} products: arrow keys move between tabs`);
  check(await page.evaluate(() => document.activeElement.id) === 'tab-zetter', `${label} products: focus follows the selected tab`);
  for (const step of ['3', '2', '1', '3']) {
    await page.locator(`#panel-zetter .feature-btn[data-goto="${step}"]`).click();
    check(await zetter.getAttribute('data-step') === step, `${label} products: feature ${step} selects screen ${step}`);
    check(await page.locator(`#panel-zetter .feature-btn[data-goto="${step}"]`).getAttribute('aria-pressed') === 'true', `${label} products: aria-pressed on ${step}`);
  }
  await page.waitForTimeout(1200);
  const activeCardVisible = await page.evaluate(() => {
    const list = document.querySelector('#panel-zetter .features');
    const card = list.querySelector('.feature.is-active');
    const a = list.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    return b.left >= a.left - 2 && b.right <= a.right + 2;
  });
  check(activeCardVisible, `${label} products: the active feature card is in view`);
  await page.locator('#panel-zetter .p-device').click();
  check(await zetter.getAttribute('data-step') === '1', `${label} products: tapping the phone cycles screens`);

  // Concept stepper
  const concept = page.locator('.concept');
  await page.locator('.concept [data-next]').click();
  await page.locator('.concept [data-next]').click();
  check(await concept.getAttribute('data-step') === '3', `${label} concept: reaches step 3`);
  await page.locator('.concept [data-prev]').click();
  check(await concept.getAttribute('data-step') === '2', `${label} concept: back works`);

  // Name card
  const open = page.locator('[data-flip-open]');
  await open.click();
  check(await open.getAttribute('aria-expanded') === 'true', `${label} name card: opens`);
  check(await page.evaluate(() => document.activeElement.matches('[data-flip-close]')), `${label} name card: focus moves to close`);
  check(await page.evaluate(() => document.querySelector('[data-flip-front]').inert), `${label} name card: front is inert while open`);
  await page.locator('[data-flip-close]').click();
  check(await open.getAttribute('aria-expanded') === 'false', `${label} name card: closes`);
  check(await page.evaluate(() => document.activeElement.matches('[data-flip-open]')), `${label} name card: focus returns`);

  // Copy address: success, then a refused clipboard
  await page.locator('[data-copy]').click();
  check(await page.evaluate(() => navigator.clipboard.readText()) === EMAIL, `${label} copy: clipboard holds the address`);
  check((await page.locator('[data-copy-status]').textContent()).includes('コピーしました'), `${label} copy: success is announced`);
  check((await page.locator('[data-copy-label]').textContent()) === 'コピーしました', `${label} copy: button shows the result`);
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
    document.execCommand = () => false;
  });
  await page.locator('[data-copy]').click();
  check(await page.locator('[data-copy-status]').isVisible(), `${label} copy: failure message is visible`);
  check(await page.locator('.mail-link').isVisible(), `${label} copy: mail link stays available`);

  // Mobile menu
  if (mobile) {
    const menu = page.locator('#menu');
    await page.locator('[data-menu-open]').click();
    check(await menu.evaluate((d) => d.open), `${label} menu: opens`);
    check(await page.locator('[data-menu-open]').getAttribute('aria-expanded') === 'true', `${label} menu: aria-expanded`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check(!(await menu.evaluate((d) => d.open)), `${label} menu: Escape closes`);
    await page.locator('[data-menu-open]').click();
    await page.locator('#menu a[href="#about"]').click();
    await page.waitForTimeout(1200);
    check(!(await menu.evaluate((d) => d.open)), `${label} menu: link closes the menu`);
    const top = await page.evaluate(() => document.getElementById('about').getBoundingClientRect().top);
    check(Math.abs(top) < 120, `${label} menu: link scrolls to the section (top ${Math.round(top)})`);
  } else {
    check(!(await page.locator('[data-menu-open]').isVisible()), `${label} header: desktop shows inline navigation`);
  }

  check(errors.length === 0, `${label}: console errors ${errors.join(' | ')}`);
  await context.close();
}

async function fallbackChecks(browser, base) {
  // Without JavaScript every step, both products and the address stay readable
  const noJs = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await noJs.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  check(await page.locator('.story-steps > li:visible').count() === 4, 'no-JS: all story steps visible');
  check(await page.locator('.concept-steps > li:visible').count() === 3, 'no-JS: all concept steps visible');
  check(await page.locator('#panel-zetter').isVisible() && await page.locator('#panel-amehare').isVisible(), 'no-JS: both products visible');
  check(!(await page.locator('[role="tablist"]').isVisible()), 'no-JS: tab bar hidden');
  check(!(await page.locator('.stepper-nav').first().isVisible()), 'no-JS: step controls hidden');
  check(!(await page.locator('[data-copy]').isVisible()) && await page.locator('.mail-link').isVisible(), 'no-JS: mail link without copy button');
  check(await page.locator('#hero-title').isVisible(), 'no-JS: hero visible');
  check(await page.locator('#name-back').isVisible(), 'no-JS: name story readable');
  await noJs.close();

  // Reduced motion: content is shown immediately
  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const calmPage = await calm.newPage();
  await calmPage.goto(base + '/', { waitUntil: 'networkidle' });
  const hidden = await calmPage.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((el) => getComputedStyle(el).opacity !== '1').length);
  check(hidden === 0, `reduced motion: ${hidden} sections still hidden`);
  const ripple = await calmPage.evaluate(() => getComputedStyle(document.querySelector('.hero-ripples i')).animationIterationCount);
  check(ripple === '1', 'reduced motion: decorative loops stop');
  await calm.close();
}

(async () => {
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    await layoutChecks(browser, base);
    await interactionChecks(browser, base, 390);
    await interactionChecks(browser, base, 1440);
    await fallbackChecks(browser, base);
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) {
    failures.forEach((f) => console.log(`FAIL: ${f}`));
    console.log(`${failures.length} of ${passed + failures.length} browser checks failed`);
    process.exit(1);
  }
  console.log(`PASS: ${passed} browser checks`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
