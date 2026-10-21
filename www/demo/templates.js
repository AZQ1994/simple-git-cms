// Demo furniture, not part of the preview protocol: three looks for the site this demo pretends to
// publish to, and a switch to flip between them. The point it makes is the one sentence the README
// spends a paragraph on — the preview is rendered by your site, in your site's layout, and the
// editor has no say in how it looks.
//
// Everything below the article (the byline, the cards, the footer) is the site's own furniture,
// exactly as it would be on a real one: the editor sends a title, a date, tags and the body, and
// nothing else.
const CARDS = [
  { img: '/demo/thumb-1.webp', title: 'Spring term enrolment is open', date: 'October 15, 2026', kicker: 'Notice' },
  { img: '/demo/thumb-2.webp', title: 'A morning in the pottery studio', date: 'October 3, 2026', kicker: 'Feature' },
  { img: '/demo/thumb-3.webp', title: 'Timetable changes for next term', date: 'October 1, 2026', kicker: 'Notice' },
];

const TEMPLATES = {
  school: {
    name: 'Sample School',
    mark: '◆',
    nav: ['News', 'About', 'Admissions', 'Contact'],
    footLinks: ['Privacy', 'Accessibility', 'Contact'],
    kicker: 'News',
    author: 'School office',
    read: '2 min read',
    initials: 'SO',
    more: 'More news',
    foot: '© Sample School',
  },
  magazine: {
    name: 'The Sample Review',
    mark: '',
    nav: ['Features', 'Reviews', 'Archive'],
    footLinks: ['Masthead', 'Subscribe', 'Submissions'],
    kicker: 'Dispatch',
    author: 'A. Sample',
    read: 'Issue 14',
    initials: 'AS',
    more: 'More from the Review',
    foot: 'The Sample Review — a sample publication',
  },
  minimal: {
    name: 'sample.dev',
    mark: '',
    nav: ['Writing', 'Projects'],
    footLinks: ['RSS', 'GitHub'],
    kicker: '',
    author: 'Sam',
    read: '2 min',
    initials: 'S',
    more: 'Recently',
    foot: 'sample.dev',
  },
};

const COPY = {
  en: { label: 'Site template', school: 'School', magazine: 'Magazine', minimal: 'Minimal' },
  zh: { label: '站点模板', school: '学校', magazine: '杂志', minimal: '极简' },
  ja: { label: 'サイトの見た目', school: '学校', magazine: '雑誌', minimal: 'ミニマル' },
};

const KEY = 'simple-git-cms-demo-template';
const $ = (id) => document.getElementById(id);

const lang = () => {
  for (const tag of [localStorage.getItem('simple-git-cms-lang'), ...(navigator.languages ?? [])]) {
    const base = String(tag ?? '').toLowerCase().split('-')[0];
    if (base in COPY) return base;
  }
  return 'en';
};

const links = (items) =>
  items.map((item) => {
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = item;
    a.addEventListener('click', (e) => e.preventDefault());
    return a;
  });

function card({ img, title, date, kicker }, tpl) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = '#';
  a.addEventListener('click', (e) => e.preventDefault());
  a.innerHTML = '<span class="card-img"><img alt="" loading="lazy"></span><span class="card-text"><span class="card-kicker"></span><span class="card-title"></span><span class="card-date"></span></span>';
  a.querySelector('img').src = img;
  a.querySelector('.card-kicker').textContent = tpl.kicker || kicker;
  a.querySelector('.card-title').textContent = title;
  a.querySelector('.card-date').textContent = date;
  return a;
}

function apply(key) {
  const name = key in TEMPLATES ? key : 'school';
  const tpl = TEMPLATES[name];
  document.documentElement.dataset.template = name;

  $('site-title').textContent = tpl.name;
  $('site-mark').textContent = tpl.mark;
  $('foot-mark').textContent = tpl.mark;
  $('site-foot').textContent = tpl.foot;
  $('kicker').textContent = tpl.kicker;
  $('kicker').hidden = !tpl.kicker;
  $('author').textContent = tpl.author;
  $('read').textContent = tpl.read;
  $('avatar').textContent = tpl.initials;
  $('more-head').textContent = tpl.more;
  $('site-nav').replaceChildren(...links(tpl.nav));
  $('foot-links').replaceChildren(...links(tpl.footLinks));
  $('cards').replaceChildren(...CARDS.map((c) => card(c, tpl)));

  for (const b of $('tpl-buttons').children) b.classList.toggle('on', b.dataset.template === name);
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* a private window can refuse; the switch still works for this page */
  }
}

function draw() {
  const t = COPY[lang()];
  $('tpl-label').textContent = t.label;
  $('tpl-buttons').replaceChildren(
    ...Object.keys(TEMPLATES).map((key) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.template = key;
      b.textContent = t[key];
      b.addEventListener('click', () => apply(key));
      return b;
    }),
  );
  apply(localStorage.getItem(KEY) ?? 'school');
}

draw();
// The switch is only worth showing once there is an article in the page
document.addEventListener('article', () => ($('tpl').hidden = false), { once: true });
