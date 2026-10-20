/* うみねこ — interactions. Content stays readable without this file. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollBehavior = () => (reduceMotion.matches ? 'auto' : 'smooth');

  /* Header: background after scrolling, reading progress */
  const header = document.querySelector('[data-header]');
  const progress = document.querySelector('[data-progress]');
  const tones = [...document.querySelectorAll('main [data-tone], footer[data-tone]')];
  const parallax = document.querySelector('[data-parallax]');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      if (header) {
        header.classList.toggle('is-scrolled', y > 8);
        // Header colours follow the block underneath it
        const probe = header.offsetHeight / 2;
        const under = tones.find((el) => {
          const r = el.getBoundingClientRect();
          return r.top <= probe && r.bottom > probe;
        });
        if (under) header.dataset.tone = under.dataset.tone;
      }
      if (progress) {
        const max = root.scrollHeight - window.innerHeight;
        progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      }
      if (parallax && !reduceMotion.matches && y < window.innerHeight * 1.2) {
        parallax.style.setProperty('--py', (y * 0.18).toFixed(1));
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Move focus to a section after in-page navigation from the menu */
  const focusSection = (target) => {
    const heading = target.querySelector('h1, h2') || target;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  };

  /* Mobile menu (native dialog) */
  const menu = document.getElementById('menu');
  const menuOpen = document.querySelector('[data-menu-open]');
  if (menu && menuOpen) {
    if (typeof menu.showModal !== 'function') {
      menuOpen.hidden = true;
    } else {
      let closing = false;
      const closeMenu = (after) => {
        if (!menu.open || closing) return;
        closing = true;
        menu.classList.add('is-closing');
        window.setTimeout(() => {
          menu.classList.remove('is-closing');
          menu.close();
          closing = false;
          if (after) after();
        }, reduceMotion.matches ? 0 : 200);
      };
      menuOpen.addEventListener('click', () => {
        menu.showModal();
        menuOpen.setAttribute('aria-expanded', 'true');
      });
      menu.addEventListener('close', () => menuOpen.setAttribute('aria-expanded', 'false'));
      menu.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeMenu();
      });
      menu.addEventListener('click', (event) => {
        if (event.target === menu) {
          closeMenu();
          return;
        }
        if (event.target.closest('[data-menu-close]')) {
          closeMenu();
          return;
        }
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const target = document.querySelector(link.getAttribute('href'));
        if (!target) return;
        event.preventDefault();
        closeMenu(() => {
          target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
          history.replaceState(null, '', link.getAttribute('href'));
          focusSection(target);
        });
      });
    }
  }

  /* Highlight the current section in the header navigation */
  const navLinks = [...document.querySelectorAll('.header-nav a[href^="#"]')];
  if (navLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = byId.get(entry.target.id);
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach((a) => a.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'true');
        } else if (link.getAttribute('aria-current')) {
          link.removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    byId.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  /* Reveal on scroll */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* Pause decorative loops while their section is off screen */
  if ('IntersectionObserver' in window) {
    const pauseObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-paused', !entry.isIntersecting));
    });
    document.querySelectorAll('[data-pause]').forEach((el) => pauseObserver.observe(el));
  }

  /* Steppers: story, concept and product walkthroughs */
  const setupStepper = (el) => {
    const items = [...el.querySelectorAll('[data-item]')];
    const total = items.length;
    if (!total) return;
    const gotos = [...el.querySelectorAll('[data-goto]')];
    const prev = el.querySelector('[data-prev]');
    const next = el.querySelector('[data-next]');
    const count = el.querySelector('[data-count]');
    const nextLabel = el.querySelector('[data-next-label]');
    const stage = el.querySelector('[data-stage]');
    const scroller = el.querySelector('[data-scroller]');
    let step = 1;
    let scrollLock = 0;
    let resync = 0;

    const isScrollable = () => scroller && scroller.scrollWidth > scroller.clientWidth + 4;

    // Keep the swipeable card row (mobile) aligned with the active step
    const scrollToStep = () => {
      if (!isScrollable()) return;
      const pad = parseFloat(getComputedStyle(scroller).scrollPaddingLeft) || 0;
      const max = scroller.scrollWidth - scroller.clientWidth;
      const left = Math.min(max, Math.max(0, items[step - 1].offsetLeft - pad));
      scrollLock = performance.now() + 800;
      if (Math.abs(scroller.scrollLeft - left) > 4) scroller.scrollTo({ left, behavior: scrollBehavior() });
      window.clearTimeout(resync);
      resync = window.setTimeout(() => {
        if (Math.abs(scroller.scrollLeft - left) <= 8) return;
        scrollLock = performance.now() + 800;
        scroller.scrollTo({ left, behavior: 'auto' });
      }, 850);
    };

    const go = (n, { fromScroll = false } = {}) => {
      step = ((n - 1 + total) % total) + 1;
      el.dataset.step = String(step);
      items.forEach((item, i) => {
        item.classList.toggle('is-active', i + 1 === step);
      });
      gotos.forEach((button) => {
        const target = Number(button.dataset.goto);
        const on = target === step;
        if (button.hasAttribute('aria-pressed')) {
          button.setAttribute('aria-pressed', String(on));
        } else if (on) {
          button.setAttribute('aria-current', 'step');
        } else {
          button.removeAttribute('aria-current');
        }
        button.classList.toggle('is-done', target < step);
      });
      if (count) count.textContent = `${step} / ${total}`;
      if (prev) prev.disabled = step === 1;
      if (nextLabel) nextLabel.textContent = step === total ? '最初から' : '次へ';
      if (!fromScroll) scrollToStep();
    };
    const advance = () => go(step === total ? 1 : step + 1);
    const touched = () => el.classList.add('is-touched');

    gotos.forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      touched();
      go(Number(button.dataset.goto));
    }));
    if (prev) prev.addEventListener('click', () => { touched(); go(step - 1); });
    if (next) next.addEventListener('click', () => { touched(); advance(); });

    // Product cards: tapping anywhere on a card selects it
    items.forEach((item, i) => {
      if (!item.querySelector('[data-goto]')) return;
      item.addEventListener('click', () => { touched(); go(i + 1); });
    });

    if (stage) {
      let startX = null;
      let startY = null;
      let swiped = false;
      stage.addEventListener('pointerdown', (event) => {
        startX = event.clientX;
        startY = event.clientY;
        swiped = false;
      });
      stage.addEventListener('pointerup', (event) => {
        if (startX === null) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        startX = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          swiped = true;
          touched();
          go(dx < 0 ? Math.min(step + 1, total) : Math.max(step - 1, 1));
        }
      });
      stage.addEventListener('pointercancel', () => { startX = null; });
      stage.addEventListener('click', () => {
        if (swiped) {
          swiped = false;
          return;
        }
        touched();
        advance();
      });
    }

    if (scroller) {
      let timer = 0;
      scroller.addEventListener('scroll', () => {
        if (!isScrollable() || performance.now() < scrollLock) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (performance.now() < scrollLock) return;
          const pad = parseFloat(getComputedStyle(scroller).scrollPaddingLeft) || 0;
          const x = scroller.scrollLeft + pad;
          let nearest = 0;
          items.forEach((item, i) => {
            if (Math.abs(item.offsetLeft - x) < Math.abs(items[nearest].offsetLeft - x)) nearest = i;
          });
          if (nearest + 1 !== step) go(nearest + 1, { fromScroll: true });
        }, 120);
      }, { passive: true });
    }

    el.addEventListener('keydown', (event) => {
      if (event.target.closest('[role="tab"]')) return;
      if (event.key === 'ArrowRight') {
        touched();
        go(Math.min(step + 1, total));
      } else if (event.key === 'ArrowLeft') {
        touched();
        go(Math.max(step - 1, 1));
      }
    });

    go(1, { fromScroll: true });
  };
  document.querySelectorAll('[data-stepper]').forEach(setupStepper);

  /* Product tabs */
  document.querySelectorAll('[data-tabs]').forEach((el) => {
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
    const select = (index, focus) => {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        if (panels[i]) panels[i].hidden = !on;
      });
      el.dataset.active = String(index);
      if (focus) tabs[index].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (event) => {
        const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(event.key in keys)) return;
        event.preventDefault();
        select((keys[event.key] + tabs.length) % tabs.length, true);
      });
    });
    select(Math.max(0, tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')));
  });

  /* Name card flip */
  document.querySelectorAll('[data-flip]').forEach((card) => {
    const front = card.querySelector('[data-flip-front]');
    const back = card.querySelector('[data-flip-back]');
    const open = card.querySelector('[data-flip-open]');
    const close = card.querySelector('[data-flip-close]');
    if (!front || !back || !open || !close) return;
    const set = (flipped) => {
      card.classList.toggle('is-flipped', flipped);
      open.setAttribute('aria-expanded', String(flipped));
      front.inert = flipped;
      back.inert = !flipped;
      (flipped ? close : open).focus({ preventScroll: true });
    };
    back.inert = true;
    open.addEventListener('click', () => set(true));
    close.addEventListener('click', () => set(false));
  });

  /* Copy e-mail address */
  document.querySelectorAll('[data-copy]').forEach((button) => {
    const status = button.parentElement.querySelector('[data-copy-status]');
    const label = button.querySelector('[data-copy-label]') || button;
    let timer = 0;
    button.addEventListener('click', async () => {
      const text = button.dataset.copy;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (error) {
        try {
          const field = document.createElement('textarea');
          field.value = text;
          field.setAttribute('readonly', '');
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.append(field);
          field.select();
          ok = document.execCommand('copy');
          field.remove();
        } catch (fallbackError) {
          ok = false;
        }
      }
      button.classList.toggle('is-done', ok);
      label.textContent = ok ? 'コピーしました' : 'コピー';
      if (status) {
        status.classList.toggle('vh', ok);
        status.textContent = ok ? 'メールアドレスをコピーしました' : 'コピーできませんでした。お手数ですが、アドレスを選んでコピーしてください。';
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.classList.remove('is-done');
        label.textContent = 'コピー';
        if (status) status.textContent = '';
      }, 2600);
    });
  });
})();
