'use strict';

// The site is readable and navigable without JavaScript. Only enhance after setup.
(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  if (toggle && nav) {
    const mobile = window.matchMedia('(max-width: 700px)');
    const setMenu = (open, returnFocus = false) => {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      const label = toggle.querySelector('.menu-label');
      if (label) label.textContent = open ? '閉じる' : 'メニュー';
      if (returnFocus) toggle.focus();
    };
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a') && mobile.matches) setMenu(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false, true);
    });
    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target) && !toggle.contains(event.target)) setMenu(false);
    });
    mobile.addEventListener('change', () => setMenu(false));
    toggle.hidden = false;
    document.documentElement.classList.add('nav-ready');
  }

  const weather = document.querySelector('[data-weather]');
  if (weather) {
    const messages = {
      ame: {icon: '☂', lines: ['ちょっと疲れた。', '今日はゆっくり、ひと休み。'], note: 'うまく話せない日も、そのままで。'},
      hare: {icon: '☀', lines: ['帰り道の空が、', '今日はちょっときれいだった。'], note: '小さなうれしさを、ここに。'}
    };
    const buttons = [...weather.querySelectorAll('[data-weather-button]')];
    const message = weather.querySelector('.weather-message');
    const note = weather.querySelector('.weather-message-note');
    const icon = weather.querySelector('.weather-message-icon');
    const chooseWeather = (value) => {
      const item = messages[value];
      if (!item || !message || !note || !icon) return;
      weather.dataset.weather = value;
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.weatherButton === value)));
      message.replaceChildren(document.createTextNode(item.lines[0]), document.createElement('br'), document.createTextNode(item.lines[1]));
      note.textContent = item.note;
      icon.textContent = item.icon;
    };
    buttons.forEach((button) => {
      button.disabled = false;
      button.addEventListener('click', () => chooseWeather(button.dataset.weatherButton));
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next = buttons.find((other) => other !== button);
        if (next) { next.focus(); chooseWeather(next.dataset.weatherButton); }
      });
    });
    const caption = weather.querySelector('.visual-caption');
    if (caption) caption.textContent = 'あめ／はれを切り替えられる紹介イメージです';
  }

  const copyButton = document.querySelector('[data-copy-email]');
  const copyStatus = document.querySelector('.copy-status');
  if (copyButton && copyStatus && navigator.clipboard && window.isSecureContext) {
    copyButton.hidden = false;
    copyButton.addEventListener('click', async () => {
      copyStatus.textContent = '';
      try {
        await navigator.clipboard.writeText(copyButton.dataset.copyEmail);
        copyStatus.textContent = 'メールアドレスをコピーしました。';
      } catch {
        copyStatus.textContent = 'コピーできませんでした。メールアドレスを選択してコピーするか、リンクからご連絡ください。';
      }
    });
  }

  document.querySelectorAll('[data-year]').forEach((element) => { element.textContent = String(new Date().getFullYear()); });

  // One-shot, short reveals. Content stays visible if observers/animation are unavailable.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const animations = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (reducedMotion.matches || !entry.target.animate) return;
        const animation = entry.target.animate(
          [{opacity: 0, transform: 'translateY(18px)'}, {opacity: 1, transform: 'translateY(0)'}],
          {duration: 650, easing: 'cubic-bezier(.22,1,.36,1)'}
        );
        animations.add(animation);
        animation.addEventListener('finish', () => animations.delete(animation), {once: true});
      });
    }, {threshold: 0.08});
    document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    reducedMotion.addEventListener('change', (event) => {
      if (event.matches) { observer.disconnect(); animations.forEach((animation) => animation.cancel()); animations.clear(); }
    });
  }
})();
