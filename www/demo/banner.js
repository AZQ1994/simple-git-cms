// Added to the editor's page in the demo build only — the editor itself knows nothing about it.
(() => {
  const COPY = {
    en: { label: 'Demo', note: 'Changes stay in this browser.', reset: 'Reset', back: 'About', close: 'Hide' },
    zh: { label: '演示', note: '改动只留在这个浏览器里。', reset: '重置', back: '介绍', close: '收起' },
    ja: { label: 'デモ', note: '変更はこのブラウザーの中だけ。', reset: 'リセット', back: '紹介', close: '隠す' },
  };
  const pick = () => {
    for (const tag of [localStorage.getItem('simple-git-cms-lang'), ...(navigator.languages ?? [])]) {
      const base = String(tag ?? '').toLowerCase().split('-')[0];
      if (base in COPY) return base;
    }
    return 'en';
  };

  const draw = () => {
    document.querySelector('.demo-bar')?.remove();
    const t = COPY[pick()];
    const bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.innerHTML = '<b></b><span></span><button type="button" class="demo-reset"></button><a class="demo-back" href="/"></a><a class="demo-repo" href="https://github.com/AZQ1994/simple-git-cms">GitHub</a><button type="button" class="demo-close"></button>';
    bar.querySelector('b').textContent = t.label;
    bar.querySelector('span').textContent = t.note;
    bar.querySelector('.demo-reset').textContent = t.reset;
    bar.querySelector('.demo-back').textContent = t.back;
    bar.querySelector('.demo-close').textContent = '✕';
    bar.querySelector('.demo-close').title = t.close;
    bar.querySelector('.demo-close').addEventListener('click', () => bar.remove());
    bar.querySelector('.demo-reset').addEventListener('click', () => {
      navigator.serviceWorker?.controller?.postMessage('reset');
      navigator.serviceWorker?.addEventListener('message', (e) => e.data === 'reset-done' && location.reload(), { once: true });
      setTimeout(() => location.reload(), 1200);
    });
    document.body.append(bar);
  };

  draw();
  // The editor sets <html lang> whenever someone switches language; follow it
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
