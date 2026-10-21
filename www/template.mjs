// The one page this site has, rendered once per language by build.mjs.
import { REPO, SITE, pages } from './content.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Enough highlighting to make a code block readable, without a dependency. Tokens are swapped for
// markers first so escaping can't land inside the tags we add.
const OPEN = '\u0000';
const CLOSE = '\u0001';
const mark = (cls, text) => `${OPEN}${cls}|${text}${CLOSE}`;

const RULES = {
  bash: [[/^(\w[\w-]*)/gm, (m) => mark('t-cmd', m)], [/#.*$/gm, (m) => mark('t-com', m)]],
  json: [
    [/"[^"]*"(?=\s*:)/g, (m) => mark('t-key', m)],
    [/(?<=:\s)"[^"]*"/g, (m) => mark('t-str', m)],
  ],
  md: [
    [/^---$/gm, (m) => mark('t-com', m)],
    [/^\w+(?=:)/gm, (m) => mark('t-key', m)],
    [/"[^"]*"/g, (m) => mark('t-str', m)],
    [/!\[\]\([^)]*\)/g, (m) => mark('t-str', m)],
  ],
};

function highlight(code, lang) {
  let out = code;
  for (const [re, fn] of RULES[lang] ?? []) out = out.replace(re, fn);
  return esc(out)
    .replace(new RegExp(`${OPEN}([\\w-]+)\\|`, 'g'), '<span class="$1">')
    .replace(new RegExp(CLOSE, 'g'), '</span>');
}

const codeBlock = (code, lang) =>
  `<pre class="code"><code>${highlight(code, lang)}</code></pre>`;

// Stroke icons, one per feature card, in the order the cards are written
const ICONS = [
  '<path d="M4 6h10M4 11h16M4 16h7"/><path d="M15 17.5 17.5 20 22 14"/>',
  '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  '<rect x="3" y="4" width="13" height="16" rx="2"/><path d="M19 8v10a3 3 0 0 1-3 3"/><path d="M6.5 8.5h6M6.5 12h6M6.5 15.5h3"/>',
  '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9.5 13.5l1.75 1.75L15 11.5"/>',
  '<path d="M6 4v5a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v5"/><circle cx="6" cy="3.5" r="1.8"/><circle cx="18" cy="20.5" r="1.8"/><path d="M6 20.5V14"/><circle cx="6" cy="12" r="0"/>',
  '<path d="M12 3 4 6v6c0 4.5 3.3 7.8 8 9 4.7-1.2 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17"/><path d="M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
  '<path d="M4 15a4 4 0 0 1 1.3-7.8A5.5 5.5 0 0 1 16 6.5 4.5 4.5 0 0 1 19.5 15"/><path d="M12 11v9"/><path d="m8.5 16.5 3.5-3.5 3.5 3.5"/>',
];

const icon = (paths) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const GITHUB_MARK =
  '<svg class="icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>';

const ARROW = '<svg class="flow-arrow" viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M0 6h21"/><path d="m17 2 4 4-4 4"/></svg>';

// The menu has room for the full names on a laptop and for shorter ones on a phone
const SHORT = { en: 'EN', zh: '中文', ja: '日本語' };

const langSwitch = (lang) =>
  pages
    .map(
      (p) =>
        `<a href="/${p.path}" lang="${p.hreflang}" hreflang="${p.hreflang}"${p.lang === lang ? ' aria-current="page"' : ''}><span class="l-long">${p.label}</span><span class="l-short">${SHORT[p.lang]}</span></a>`,
    )
    .join('');

export function page(lang, c) {
  const self = pages.find((p) => p.lang === lang);
  const canonical = `${SITE}/${self.path}`;
  return `<!doctype html>
<html lang="${self.hreflang}" dir="${c.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.meta.title)}</title>
<meta name="description" content="${esc(c.meta.description)}">
<link rel="canonical" href="${canonical}">
${pages.map((p) => `<link rel="alternate" hreflang="${p.hreflang}" href="${SITE}/${p.path}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${SITE}/">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(c.meta.title)}">
<meta property="og:description" content="${esc(c.meta.description)}">
<meta property="og:image" content="${SITE}/screenshot.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f7f6f3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14151a" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<a class="skip" href="#main">${esc(c.skip)}</a>

<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="/${self.path}">
      <svg class="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 4.5h8.5L19 10v9.5H5z"/><path d="M13.5 4.5V10H19"/><path d="M8.5 13h7M8.5 16h4.5"/>
      </svg>
      <span>Simple Git CMS</span>
    </a>
    <nav class="top-nav" aria-label="${esc(c.footer.langHeading)}">
      <div class="langs">${langSwitch(lang)}</div>
      <a class="top-link" href="#start">${esc(c.nav.quickstart)}</a>
      <a class="btn btn-sm" href="${REPO}" aria-label="${esc(c.nav.github)}">${GITHUB_MARK}<span>${esc(c.nav.github)}</span></a>
    </nav>
  </div>
</header>

<main id="main">

<section class="hero">
  <div class="wrap">
    <p class="kicker">${esc(c.hero.kicker)}</p>
    <h1>${c.hero.tagline}</h1>
    <p class="lead">${c.hero.lead}</p>
    <p class="actions">
      <a class="btn btn-primary" href="${REPO}">${GITHUB_MARK}<span>${esc(c.hero.primary)}</span></a>
      <a class="btn" href="#start">${esc(c.hero.secondary)}</a>
    </p>
    <ul class="badges">${c.hero.badges.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  </div>
  <div class="wrap shot-wrap">
    <figure class="shot">
      <img src="/screenshot.png" width="2880" height="1800" alt="${esc(c.hero.shotAlt)}" fetchpriority="high">
    </figure>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>${esc(c.pillars.heading)}</h2>
    <div class="pillars">
      ${c.pillars.items
        .map(
          (p, i) => `<article class="pillar">
        <span class="pillar-n">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.body)}</p>
      </article>`,
        )
        .join('\n      ')}
    </div>
  </div>
</section>

<section class="flow-sec">
  <div class="wrap">
    <h2>${esc(c.flow.heading)}</h2>
    <div class="flow">
      <div class="flow-node">
        <strong>${esc(c.flow.nodes.editor)}</strong>
        <span>${esc(c.flow.nodes.editorNote)}</span>
      </div>
      <div class="flow-edge"><span>${esc(c.flow.edges.commit)}</span>${ARROW}</div>
      <div class="flow-node">
        <strong>${esc(c.flow.nodes.api)}</strong>
        <span>${esc(c.flow.nodes.apiNote)}</span>
      </div>
      <div class="flow-edge"><span>${esc(c.flow.edges.push)}</span>${ARROW}</div>
      <div class="flow-node">
        <strong>${esc(c.flow.nodes.actions)}</strong>
        <span>${esc(c.flow.nodes.actionsNote)}</span>
      </div>
      <div class="flow-edge"><span>${esc(c.flow.edges.deploy)}</span>${ARROW}</div>
      <div class="flow-node flow-node-end">
        <strong>${esc(c.flow.nodes.site)}</strong>
        <span>${esc(c.flow.nodes.siteNote)}</span>
      </div>
    </div>
    <p class="note">${c.flow.note}</p>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>${esc(c.features.heading)}</h2>
    <div class="features">
      ${c.features.items
        .map(
          (f, i) => `<article class="feature">
        ${icon(ICONS[i] ?? ICONS[0])}
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.body)}</p>
      </article>`,
        )
        .join('\n      ')}
    </div>
  </div>
</section>

<section id="start" class="start">
  <div class="wrap">
    <h2>${esc(c.start.heading)}</h2>
    <p class="section-lead">${esc(c.start.lead)}</p>
    <ol class="steps">
      ${c.start.steps
        .map(
          (s) => `<li class="step">
        <div class="step-head"><span class="step-n">${esc(s.n)}</span><h3>${esc(s.title)}</h3></div>
        <p>${s.body}</p>
        ${s.code ? codeBlock(s.code, s.codeLang) : ''}
      </li>`,
        )
        .join('\n      ')}
    </ol>
    <div class="format">
      <div class="format-text">
        <h3>${esc(c.start.formatHeading)}</h3>
        <p>${esc(c.start.formatBody)}</p>
      </div>
      ${codeBlock(c.start.format, 'md')}
    </div>
  </div>
</section>

<section class="limits">
  <div class="wrap">
    <h2>${esc(c.limits.heading)}</h2>
    <p class="section-lead">${esc(c.limits.lead)}</p>
    <ul class="limit-list">${c.limits.items.map((l) => `<li>${l}</li>`).join('')}</ul>
    <p><a class="more" href="${REPO}#known-limits">${esc(c.limits.more)} &rarr;</a></p>
  </div>
</section>

<section class="cta">
  <div class="wrap">
    <h2>${esc(c.cta.heading)}</h2>
    <p>${esc(c.cta.body)}</p>
    <p class="actions"><a class="btn btn-primary" href="${REPO}">${GITHUB_MARK}<span>${esc(c.cta.button)}</span></a></p>
  </div>
</section>

</main>

<footer class="foot">
  <div class="wrap foot-in">
    <div>
      <p class="foot-brand">Simple Git CMS</p>
      <p class="foot-note"><a href="${REPO}/blob/main/LICENSE">${esc(c.footer.license)}</a></p>
    </div>
    <div>
      <p class="foot-h">${esc(c.footer.docs)}</p>
      <ul>${c.footer.links.map((l) => `<li><a href="${l.href}">${esc(l.label)}</a></li>`).join('')}</ul>
    </div>
    <div>
      <p class="foot-h">${esc(c.footer.langHeading)}</p>
      <ul class="foot-langs">${pages.map((p) => `<li><a href="/${p.path}" lang="${p.hreflang}" hreflang="${p.hreflang}">${p.label}</a></li>`).join('')}</ul>
    </div>
  </div>
</footer>
</body>
</html>
`;
}
