// Puts the demo's service worker in place, then hands over to the editor. The worker has to be
// controlling this page before the editor loads, or the editor's first call would go to the real
// api.github.com.
const COPY = {
  en: {
    k: 'Demo',
    h: 'Starting the demo…',
    p: 'A GitHub repository is being made up inside your browser. Nothing is sent anywhere, and nothing is signed in to.',
    failed: 'This browser won’t run the demo',
    failedBody:
      'The demo needs a service worker, which private windows and a few browsers turn off. The screenshots on the front page show the same thing.',
    back: 'Back to Simple Git CMS',
  },
  zh: {
    k: '演示',
    h: '正在启动演示…',
    p: '正在你的浏览器里虚构一个 GitHub 仓库。不会发送到任何地方，也不需要登录任何账号。',
    failed: '这个浏览器跑不了演示',
    failedBody: '演示需要 Service Worker，无痕窗口和少数浏览器会把它关掉。首页的截图是同样的东西。',
    back: '回到介绍页',
  },
  ja: {
    k: 'デモ',
    h: 'デモを準備しています…',
    p: 'GitHub リポジトリをこのブラウザーの中ででっち上げています。どこにも送信されませんし、何にもログインしません。',
    failed: 'このブラウザーではデモが動きません',
    failedBody:
      'デモには Service Worker が必要で、プライベートウィンドウや一部のブラウザーでは無効になっています。トップページのスクリーンショットが同じものです。',
    back: 'Simple Git CMS に戻る',
  },
};

const lang = (() => {
  const stored = localStorage.getItem('simple-git-cms-lang');
  for (const tag of [stored, ...(navigator.languages ?? [navigator.language])]) {
    const base = String(tag ?? '').toLowerCase().split('-')[0];
    if (base in COPY) return base;
  }
  return 'en';
})();
const t = COPY[lang];

document.documentElement.lang = lang;
document.getElementById('k').textContent = t.k;
document.getElementById('h').textContent = t.h;
document.getElementById('p').textContent = t.p;
document.getElementById('back').textContent = t.back;

function failed() {
  document.getElementById('h').textContent = t.failed;
  document.getElementById('p').textContent = t.failedBody;
}

async function start() {
  if (!navigator.serviceWorker) return failed();
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: '/demo/' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        setTimeout(resolve, 3000);
      });
    }
  } catch {
    return failed();
  }
  // Arrive signed in: the sign-in screen is part of the product, but it isn't what anyone came
  // to look at. Signing out and back in inside the demo still works.
  localStorage.setItem('simple-git-cms-token', 'demo');
  localStorage.removeItem('simple-git-cms-refresh');
  location.replace('./app/');
}

start();
