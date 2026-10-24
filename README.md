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
- **Blocks of your own**: a video, a notice box, a table with merged cells — anything your site
  already renders. Name the tag in `config.json` and it joins the insert menu with an editor of
  its own: a small form, the table editor, or its own HTML
- **Code**: `inline code` and fenced blocks, which keep their language and are left alone by
  everything else the editor does to text
- **Tables**: add and remove rows and columns, align a column left, centre or right — written out
  as a plain GFM table that lines up in the file. Anything beyond that, such as a cell spanning two
  columns, is an HTML table, which is a block your site defines
- **Attachments**: a PDF or anything else goes into the repository as it is, linked from the body
  under the name it came with, up to a size you set
- **Nothing is quietly dropped**: anything in the file the editor has no buttons for — an embed, a
  leftover `<div>`, a component your site expands itself — is shown as an HTML box whose source you
  can edit, and written back exactly as it was. A tag that is never closed is marked where it is,
  and saying so before saving, rather than shipped to wrap the rest of the page
- **A cover image**: taken from the pictures the article already has, or uploaded; replaced,
  cropped or removed in the article's own form, and written to a frontmatter field of your
  choosing — what a site uses for list thumbnails and share images
- **Articles**: title, date, tags, summary; draft / publish / revert / delete a draft. The open
  one is in the address bar, so reloading comes back to it and the link opens it for anyone else
  who can sign in
- **Saving**: the article and its new images go in as a single commit; if someone else changed the
  article while it was open, you are offered their version or yours
- **History**: every version of an article, one per commit that changed it, to look through as the
  site would show it — or in the site's own preview. Restoring one puts it in the editor; saving it
  is a new commit that says which version it came from, and leaves the article published or not as
  it was
- **Nothing in progress is lost**: what hasn't been committed is kept in the browser as you type —
  images that haven't been uploaded included — and offered back after a crash, a closed tab or a
  reload
- **A long list stays quick**: the list is read in two steps — which files there are, then their
  text in batches, newest first, so it appears without waiting for the last article. The text is
  kept in the browser under git's own hash of it, so opening the editor again downloads only what
  actually changed
- **Preview**: see the article in your own site's layout, at desktop or phone width, including
  changes and images you have not saved yet
- **Deployment**: draft saves get `[skip ci]` so they don't trigger a build; after publishing, the
  top bar follows the GitHub Actions run
- **Action buttons** (optional): buttons that start GitHub Actions workflows of your choosing — for
  example publishing a test site, where the editor lives, to the live site, which then needs no
  editor at all
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
| `src/` | The editor. `github.js` (reading and writing GitHub, usable on its own from Node), `article.js` (the file format), `images.js` (compression and cropping), `i18n/` (interface languages), and the interface split across `store.js`, `dom.js`, `lang.js`, `auth.js`, `list.js`, `editor.js`, `doc.js`, `preview-ui.js` and `history.js`; `schema.js` says what a document may contain and how it is written back as Markdown, `html-scan.js` whether its HTML closes what it opens — `app.js` reads the config and starts them up |
| `public/` | The page, its styles, and `config.example.json` |
| `auth/` | The "Sign in with GitHub" relay — one dependency-free file that runs on Cloudflare Workers, Deno Deploy, Vercel, Netlify, Bun or your own Node server ([details](auth/README.md)) |
| `integrations/astro/` | A rehype plugin so your site renders captions and side-by-side images ([details](integrations/astro/README.md)) |
| `test/` | `npm test` — saving, conflicts and retries against a fake GitHub API, plus translation coverage. No network. `npm run test:e2e` drives the built editor in a real browser ([details](test/e2e/README.md)) |
| `www/` | The project's own site, [simple-git-cms.azq1994.com](https://simple-git-cms.azq1994.com) ([details](www/README.md)) |

## Putting it on a site

### 1. Build and install the editor

In your site's repository:

```bash
npm install --save-dev simple-git-cms
npx simple-git-cms install public/editor   # a static directory, so the URL is /editor/
```

Installing only overwrites the editor's own files; `config.json` and `logo.png` in the target
directory are left alone. To upgrade, `npm update simple-git-cms` and install again.

The package is the editor already built, plus the two pieces your site imports (below). From a
clone of this repository it is `npm install`, `npm run build`, then
`node scripts/install.mjs ../my-site/public/editor`.

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
| `collection.imageField` | The frontmatter field the cover image goes in, e.g. `image`. Left out, there is no cover image control |
| `media.dir` / `media.url` | Where images live in the repository / their path prefix on the site. New images go in a `<date>/` subdirectory. |
| `media.maxWidth` / `media.quality` | Maximum width and webp quality when compressing on upload |
| `media.maxFileMB` | The largest attachment that may be uploaded, in MB (20 by default; see below) |
| `blocks` | Blocks this site defines for itself; see [Blocks of your own](#blocks-of-your-own) |
| `preview.url` | The preview page on your site (step 4). Leave it out and there is no Preview button. |
| `deploy.skipCiForDrafts` | Add `[skip ci]` when saving drafts (default true) |
| `actions` | Buttons in the sidebar, each starting a workflow that has a `workflow_dispatch` trigger, then following the run; see [Action buttons](#action-buttons). The GitHub App needs **Actions: Read and write** for them ([auth/README.md](auth/README.md)) |

### Action buttons

Each entry in `actions` is a button in the sidebar. A click asks for confirmation (and says so if
the open article has unsaved changes, which the workflow won't see), starts the workflow through
the GitHub API, and the line under the button follows the run until it succeeds or fails.

```json
"actions": [
  { "label": "Publish to the live site", "workflow": "release.yml", "url": "https://example.com" },
  { "label": "Rebuild the test site", "workflow": "site.yml", "inputs": { "clean": "true" } }
]
```

| Field | Meaning |
|---|---|
| `label` | The button's text (required) |
| `workflow` | The workflow's file name or id; it needs a `workflow_dispatch` trigger (required) |
| `ref` | The branch it runs on (default `branch`) |
| `inputs` | Inputs passed to the workflow, always these values |
| `confirm` | What the confirmation asks (by default it names the button, the workflow and the branch) |
| `url` | Linked once the run succeeds, e.g. the site it published |

Anyone who can sign in can press them — the same people who can edit. To limit who may publish,
give the workflow's job an environment with required reviewers on GitHub.

**How large `media.maxFileMB` should be.** The file never passes through the sign-in relay — the
browser sends it straight to GitHub — so what limits it is where the site is published and what
GitHub will keep. Cloudflare Pages and Cloudflare Workers static assets allow a single file of at
most 25 MiB on every plan, which is what the default of 20 leaves a margin under. GitHub refuses a
file over 100MB outright and warns above 50MB, and the upload is base64, which makes the request
itself a third larger again. Worth knowing too: every version of an attachment stays in the
repository's history for good, so a brochure that is replaced each year is better kept in object
storage with a link to it in the article. A few MB, once, is what this is for.

`config.schema.json` is installed next to it, so an editor that understands JSON Schema completes
the fields and marks a typo as you write. The editor checks the file at startup as well, and names
every problem at once — including settings it doesn't recognise, which used to be ignored in
silence.

### 3. Deploy the sign-in relay

See [auth/README.md](auth/README.md). Cloudflare Workers is the documented route, but the relay is
a single standard-web-API file — Deno Deploy, Vercel, Netlify, Bun and plain Node all work. It comes
with the npm package: `npx simple-git-cms auth` runs it
([more](auth/README.md#from-the-npm-package)).

### 4. Set up the site side

See [integrations/astro/README.md](integrations/astro/README.md) for captions and side-by-side
images.

For the preview, add a page to your site that uses your normal article layout, import
`connectPreview` from `simple-git-cms/preview-client` ([source](integrations/preview-client.js)),
and fill in the title, date,
tags and `article.html` inside `connectPreview(article => …)`. The editor converts the body through
the same pipeline your site uses (remark-gfm, smartypants, rehype-figures) and posts the HTML over;
the preview page only has to display it.

If your article page shows more than that, the preview has it too: `article.image` is the cover
image (`null` when there is none, or no `imageField` is configured), ready to put in an `<img src>`
even before it is uploaded, and `article.fields` is every other frontmatter field — an author, a
category, an event date — exactly as the file has it.

```js
connectPreview((article) => {
  cover.hidden = !article.image;
  if (article.image) cover.src = article.image;
  author.textContent = article.fields.author ?? '';
  // …title, date, tags and article.html as above
});
```

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

Anything else in the body that the editor has no node for — an `<iframe>`, a `<div>`, an HTML
comment, a component your site expands — is held as a block of raw HTML and written back exactly as
it was. It shows as a box with its source in it, which is also how to put something into an article
that the toolbar has no button for. Pasting markup into the body does the same: an embed pasted
from a video service arrives as the card or the box the file would have given it, rather than as
the text of a tag — or as nothing, which is what an editor does with a tag it has no node for. Everything inside such a box belongs to the box, which is what
makes it editable — so each one carries its own way in and out: the arrow keys reach it, Enter
steps in, Esc steps back out, and the × in its corner or Backspace in an empty one takes it away.

Markdown keeps those boxes apart — it ends a block of HTML at the first blank line and never looks
further — but the page they land on does not: `<div style="color: red">aaaaaa` with no closing tag
wraps everything after it, the rest of the site's page included. So the editor reads the body's HTML
as one run — across the boxes, across blank lines, and through the sentences, since a tag typed
into a line of text is HTML too. Whatever opened what nothing closes is marked where it stands:
the box, or those very characters in the sentence. Saving names the tag and the line before the
file goes in, whether you press Save or Update. It is a warning, not a refusal: it
is your markup, and you may be halfway through writing it.

A table in the body is a plain GFM table: a header row, one line of text per cell, no merged
cells. A hand-written one is laid out once on the first save — padded to the column widths, with
the colons following them — and left alone after that. The site needs nothing installed to show it,
since Astro and friends run remark-gfm already; it will want some CSS of its own.

A table that needs more than a pipe table can say is written as HTML, which Markdown passes
through untouched. Whether the editor treats those as tables or as source is your site's call: a
`{ "tag": "table", "edit": "table" }` block (below) adds an **advanced table** to the insert menu,
turns the HTML tables already in your articles into tables you can edit, and adds a button for
merging and splitting cells. Without it an HTML table is a box of source, like any other markup
the editor was not told about. Either way nothing is lost — and an HTML table with anything the
editor could not write back exactly, such as a class of its own, stays a box of source even with
the block defined.

## Developing

Pull requests are welcome — [CONTRIBUTING.md](CONTRIBUTING.md) says what they need. A security
problem goes through [SECURITY.md](SECURITY.md) instead of an issue.

```bash
npm install
npm test
npm run dev     # build, then serve the editor at http://localhost:4173
```

`npm run dev` creates `dev.config.json` at the repository root on first run (gitignored). It is
copied into `dist/` after every build, so it survives rebuilds.

**It edits the files on this machine, not GitHub.** `npm run dev ../my-site` puts that checkout
behind the editor: there is nothing to sign in to, the list is read from `collection.dir` on disk,
and saving writes the article and its images and commits them there — one commit, the same message
the editor would have used, and only the paths it touched, so anything else you had staged stays
staged. Pushing is yours to do, which is the point: the editor writes the files, git still decides
what goes out. With no path given it edits the repository the editor itself is in, which is what
an install inside a site looks like.

A repository in the middle of a merge or a rebase is written to but not committed, and the editor
says so. If a file changed on disk while it was open here — you edited it in your own editor — the
save stops and offers you both versions, exactly as it does when someone else changes it on GitHub.

Setting `localStorage['simple-git-cms-api']` on localhost sends the GitHub API through a local
proxy instead; that is what the browser tests use, and it takes precedence over the files.

Adding or changing a dependency means re-running `npm run licenses`, which regenerates
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) from whatever is actually bundled. CI checks it.

### Translations

Each language is one flat file of strings in `src/i18n/` — `en.js`, `zh.js`, `ja.js`. To add one,
copy `en.js`, translate the values, and add it to `locales` in `src/i18n/index.js`. The tests fail
on any key that is missing, extra, empty, or whose `{placeholders}` don't match English, so a new
language can't ship half-done.

## Blocks of your own

Markdown here is Markdown plus HTML — `<table>`, `<iframe>` and anything your pipeline already
passes through. The editor shows a tag it has never heard of as a box of source. Name the tag in
`config.json` and it joins the insert menu with an editor of its own:

```json
"blocks": [
  {
    "tag": "YouTube",
    "label": "YouTube",
    "preview": "https://i.ytimg.com/vi/{id}/hqdefault.jpg",
    "fields": [{ "name": "id", "label": "Video ID", "placeholder": "dQw4w9WgXcQ" }]
  },
  {
    "tag": "aside",
    "name": "notice",
    "label": "Notice",
    "attrs": { "class": "notice" },
    "fields": [{ "name": "text", "from": "content", "multiline": true }]
  },
  {
    "tag": "table",
    "label": "Advanced table",
    "edit": "table"
  }
]
```

The element's attributes are the fields; nothing in the editor knows what YouTube is. Anything it
doesn't claim keeps the behaviour it had: plain HTML, edited as source.

| Key | What it does |
|---|---|
| `tag` | The element, e.g. `YouTube` or `aside` |
| `label` | What the insert menu says. Defaults to the tag |
| `name` | Only needed when two definitions share a tag |
| `edit` | Which editor this block gets: `fields` (the default) is a small form, `table` is the table editor — rows, columns, alignment and merged cells — and `source` is the element's own HTML in a box with this block's name on it |
| `attrs` | Attributes an element must have to be this block, and which are always written — how `<aside class="notice">` is told apart from any other `<aside>` |
| `starts` | What a value has to begin with for the element to be this block — how one kind of `<iframe>` is told from another. A condition only: unlike `attrs` it is never written for you |
| `fields` | The attributes someone fills in. `from: "content"` makes a field what sits between the tags instead, and `multiline` gives it room |
| `preview` | Optional picture shown in the editor, with `{field}` placeholders. A picture from another site has to be allowed by `img-src` in the policy below |

An attribute the file has that `fields` never mentions is kept and offered as a field anyway, so
nothing is editable only by hand — folded away under a line you can open, since an embed as a video
service hands it over carries eight attributes and seven of them are the same seven every time.
Out of the way, not out of reach. An element that says something the form could not hold — content
with no field for it — stays plain HTML rather than being read into a form that would lose it.

A declared tag is also read as one element even when the file writes it across blank lines.
Markdown ends a block of HTML at the first blank line, so a notice with two paragraphs in it would
otherwise arrive as an opening tag, a paragraph, and a stray `</aside>` sitting in the text.

Nothing in the editor knows what a video, a map or a tweet is. Whatever your articles already
embed is a tag, and naming that tag is what turns it into a block — your own component if your
site expands one, `iframe` if they hold the embed code itself.

A tag on its own is often too broad: an `<iframe>` is a video, a map or a form, and which it is
shows in its address. That is what `starts` is for — the definition speaks only for the elements
whose value begins with what it names, and the ones it doesn't claim fall through to the next
definition, or stay plain HTML:

```json
{
  "tag": "iframe",
  "name": "video",
  "label": "Video",
  "starts": { "src": "https://www.youtube.com/embed/" },
  "fields": [{ "name": "src", "label": "Embed address" }]
}
```

An element goes back to the file in the shape it was written in, self-closing or not, with the
attributes it had: `<iframe …>` is HTML and keeps its closing tag, `<YouTube … />` is a component
and keeps its slash.

A form is not the right shape for everything, which is what `edit` is for: `table` gives `<table>`
the table editor, and `source` is for markup worth naming but not worth a form — it is the HTML
box, with your label on it and the element already written out when you insert one.

Showing it on the site is your site's business, as it already was. The editor's preview renders
Markdown in the browser, so a tag your site expands itself will not appear there.

## Locking the editor down

The token lives in `localStorage`, so anything that can run a script on the editor's address can
read it — and that token can write to your repository. The articles themselves are kept in the
browser too, in IndexedDB: unsaved work, and the text the list has already downloaded. For a
private repository that is its content sitting on whatever machine edits it. A
Content-Security-Policy header is what stops a script getting at any of it: nothing but the
editor's own files is allowed to run.

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
