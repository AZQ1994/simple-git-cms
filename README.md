# Simple Git CMS

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

![The Simple Git CMS editor, showing an article with a captioned image](docs/screenshot.png)

**[Try it in your browser](https://simple-git-cms.azq1994.com/demo/)** — the real editor, with a service worker standing in for GitHub. Nothing to sign in to.

A content editor for static sites that uses a **GitHub repository as its backend**. Articles are
Markdown files in the repository; the editor is a plain static page that reads and writes them
through the GitHub API, straight from the editor's browser. **No server of your own, and no
database.**

It suits Astro, Hugo and friends: someone writes an article, drops in images and publishes; behind
the scenes that is one git commit, and your existing CI builds and deploys the site.

## What it does

- **WYSIWYG editing** (TipTap) that saves clean Markdown — open an existing article and save it
  again and the file is unchanged
- **Images**: paste, drop or pick several at once, compressed to webp in the browser; crop, rotate,
  caption, place side by side, replace
- **Tables**: add and remove rows and columns, align a column left, centre or right — written out
  as a plain GFM table that lines up in the file
- **Articles**: title, date, tags, summary; draft / publish / revert / delete a draft. The open
  one is in the address bar, so reloading comes back to it and the link opens it for anyone else
  who can sign in
- **Saving**: the article and its new images go in as a single commit; if someone else changed the
  article while it was open, you are offered their version or yours
- **Nothing in progress is lost**: what hasn't been committed is kept in the browser as you type —
  images that haven't been uploaded included — and offered back after a crash, a closed tab or a
  reload
- **Preview**: see the article in your own site's layout, at desktop or phone width, including
  changes and images you have not saved yet
- **Deployment**: draft saves get `[skip ci]` so they don't trigger a build; after publishing, the
  top bar follows the GitHub Actions run
- **Sign-in**: GitHub App sign-in (a full-page redirect, so it works on phones; the token only
  reaches repositories the App is installed on, and is refreshed automatically), or a fine-grained
  access token
- **Permissions are just repository permissions** — whoever can push can edit, and who changed what
  is in the git history
- **Interface in English, 简体中文 and 日本語**, switchable in place
- **Light or dark**, following the computer or chosen by hand

## Layout

| Directory | What's in it |
|---|---|
| `src/` | The editor. `github.js` (reading and writing GitHub, usable on its own from Node), `article.js` (the file format), `images.js` (compression and cropping), `i18n/` (interface languages), and the interface split across `store.js`, `dom.js`, `lang.js`, `auth.js`, `list.js`, `editor.js`, `doc.js` and `preview-ui.js`; `schema.js` says what a document may contain and how it is written back as Markdown — `app.js` reads the config and starts them up |
| `public/` | The page, its styles, and `config.example.json` |
| `auth/` | The "Sign in with GitHub" relay — one dependency-free file that runs on Cloudflare Workers, Deno Deploy, Vercel, Netlify, Bun or your own Node server ([details](auth/README.md)) |
| `integrations/astro/` | A rehype plugin so your site renders captions and side-by-side images ([details](integrations/astro/README.md)) |
| `test/` | `npm test` — saving, conflicts and retries against a fake GitHub API, plus translation coverage. No network. `npm run test:e2e` drives the built editor in a real browser ([details](test/e2e/README.md)) |
| `www/` | The project's own site, [simple-git-cms.azq1994.com](https://simple-git-cms.azq1994.com) ([details](www/README.md)) |

## Putting it on a site

### 1. Build and install the editor

```bash
npm install
npm run build
node scripts/install.mjs ../my-site/public/editor   # a static directory, so the URL is /editor/
```

Installing only overwrites the editor's own files; `config.json` and `logo.png` in the target
directory are left alone. To upgrade, repeat those two steps.

### 2. Write `config.json`

Put it next to the editor's `index.html`, modelled on `config.example.json`.

| Field | Meaning |
|---|---|
| `title` / `siteName` / `logo` | What the interface calls itself |
| `lang` | Starting interface language: `en`, `zh` or `ja`. Omit it to follow the browser. Whatever the person picks from the menu wins. |
| `repo` / `branch` | Where the content lives |
| `siteUrl` | Your site's address, used for "View on site" — and to load images when the editor is not on the same domain |
| `timeZone` | Used for dates shown, for image folders, and for new article IDs |
| `auth.base` | The URL of the sign-in relay |
| `collection.dir` | The article directory inside the repository; one `<id>.md` per article |
| `collection.url` | The article's URL on the site; `{id}` is substituted |
| `media.dir` / `media.url` | Where images live in the repository / their path prefix on the site. New images go in a `<date>/` subdirectory. |
| `media.maxWidth` / `media.quality` | Maximum width and webp quality when compressing on upload |
| `preview.url` | The preview page on your site (step 4). Leave it out and there is no Preview button. |
| `deploy.skipCiForDrafts` | Add `[skip ci]` when saving drafts (default true) |

`config.schema.json` is installed next to it, so an editor that understands JSON Schema completes
the fields and marks a typo as you write. The editor checks the file at startup as well, and names
every problem at once — including settings it doesn't recognise, which used to be ignored in
silence.

### 3. Deploy the sign-in relay

See [auth/README.md](auth/README.md). Cloudflare Workers is the documented route, but the relay is
a single standard-web-API file — Deno Deploy, Vercel, Netlify, Bun and plain Node all work.

### 4. Set up the site side

See [integrations/astro/README.md](integrations/astro/README.md) for captions and side-by-side
images.

For the preview, add a page to your site that uses your normal article layout, import
[`integrations/preview-client.js`](integrations/preview-client.js), and fill in the title, date,
tags and `article.html` inside `connectPreview(article => …)`. The editor converts the body through
the same pipeline your site uses (remark-gfm, smartypants, rehype-figures) and posts the HTML over;
the preview page only has to display it.

### 5. Add your editors

They need a GitHub account, collaborator access to the repository (Write), and the GitHub App
installed on it.

## The article format

```markdown
---
title: "A title"
description: "Summary — optional; taken from the start of the body when absent"
date: 2026-10-21T03:00:00.000Z
tags: ["tag one", "tag two"]
draft: true            # only present on drafts
---

The body, in Markdown. ![](/uploads/20261021/abc.webp "An image caption")
```

Frontmatter fields the editor doesn't recognise are preserved untouched. A new article's filename —
its id — is the year, month, day, hour and minute it was created.

A table in the body is a plain GFM table, and only what GFM can express goes into one: a header row,
one line of text per cell, no merged cells. A hand-written table is laid out once on the first save
— padded to the column widths, with the colons following them — and left alone after that. The site
needs nothing installed to show it, since Astro and friends run remark-gfm already; it will want
some CSS of its own.

## Developing

```bash
npm install
npm test
npm run dev     # build, then serve the editor at http://localhost:4173
```

`npm run dev` creates `dev.config.json` at the repository root on first run (gitignored); point
it at a real repository to edit anything. It is copied into `dist/` after every build, so it
survives rebuilds. On localhost you can also set `localStorage['simple-git-cms-api']` to send
the GitHub API through a local proxy.

Adding or changing a dependency means re-running `npm run licenses`, which regenerates
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) from whatever is actually bundled. CI checks it.

### Translations

Each language is one flat file of strings in `src/i18n/` — `en.js`, `zh.js`, `ja.js`. To add one,
copy `en.js`, translate the values, and add it to `locales` in `src/i18n/index.js`. The tests fail
on any key that is missing, extra, empty, or whose `{placeholders}` don't match English, so a new
language can't ship half-done.

## Locking the editor down

The token lives in `localStorage`, so anything that can run a script on the editor's address can
read it — and that token can write to your repository. A Content-Security-Policy header is what
stops that: nothing but the editor's own files is allowed to run.

<!-- csp:begin -->
```http
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://avatars.githubusercontent.com;
  connect-src 'self' https://api.github.com https://cms-auth.example.com;
  frame-src 'self';
  base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```
<!-- csp:end -->

It goes on one line in the file you put it in; it is broken up here to be read. Replace
`https://cms-auth.example.com` with your relay, and if the editor is on a different domain than the
site, add the site's address to `img-src` and `frame-src`.

| Directive | Why |
|---|---|
| `default-src 'none'` | Everything is refused, then opened one line at a time |
| `script-src 'self'` | The line that matters. Only the editor's own files run — an injected `<script>`, inline or not, does nothing |
| `style-src … 'unsafe-inline'` | Unavoidable: TipTap and the cropper set `style` attributes. Far weaker than the same for scripts, since CSS can't read `localStorage` |
| `img-src … avatars.githubusercontent.com` | The avatar of whoever is signed in comes from GitHub |
| `connect-src` | The editor may talk to the GitHub API and to your relay, and to nothing else |
| `frame-src 'self'` | The preview iframe holds your own site |
| `frame-ancestors 'none'` | Nobody may put the editor inside their page |

Neither `'unsafe-eval'` nor `'unsafe-inline'` for scripts is needed — the page has no inline script
and nothing in the bundles reaches for `eval`. `npm run test:e2e` serves the editor under exactly
this policy, so CI notices if a change ever breaks it.

Where it goes, with the editor installed at `/editor/`:

```
# Cloudflare Pages, Cloudflare Workers assets, Netlify — a _headers file at the site's root
/editor/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; …
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

nginx: `add_header Content-Security-Policy "…" always;` inside `location /editor/`. Apache:
`Header always set Content-Security-Policy "…"` inside `<Location "/editor/">`. Vercel: a
`headers` entry in `vercel.json`. If you can't set headers at all, a `<meta http-equiv>` in the
editor's `index.html` does most of it — but `frame-ancestors` is ignored in a meta tag.

**What it doesn't do.** It won't save you from a changed `app.js`, from someone who can edit what
your server serves, or from a browser extension. The token is still in `localStorage`; this closes
the usual way of reaching it, not the only conceivable one.

## Known limits

- Editors need a GitHub account. Letting people in without one would mean adding your own sign-in
  service that commits as the GitHub App.
- One article collection per site, with the fields listed above
- The preview converts Markdown in the browser, so Markdown plugins your site adds separately are
  not reflected in it
- Image addresses pointing somewhere else (pasted from another page) are refused on save — download
  the image and upload it again
- The GitHub token is kept in `localStorage`, which is the usual trade-off for an editor with no
  backend: anyone who can inject a script into the editor's origin can read it. Serve the editor
  from a domain you control, don't put untrusted scripts on it, and give it the policy in
  [Locking the editor down](#locking-the-editor-down).

## License

[MIT](LICENSE). The relay in `auth/` derives from
[sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) and carries its MIT notice
in [auth/LICENSE](auth/LICENSE); the bundled dependencies are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
