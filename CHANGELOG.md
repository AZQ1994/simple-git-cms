# Changelog

Dates are the release date. Each entry is what changed for someone using the editor; the commits
behind it are in the repository history.

## 0.8.0 — 2026-10-24

Buttons that start GitHub Actions workflows, so a site can keep the editor on its test copy only.

- **`actions` in config.json.** Each entry is a sidebar button: a `label`, a `workflow` with a
  `workflow_dispatch` trigger, and optionally the `ref` to run on (the content branch by default),
  fixed `inputs`, the `confirm` text, and a `url` to link once it succeeds. A click confirms —
  warning about unsaved changes in the open article — starts the workflow, and the line under the
  button follows the run to the end. The typical use: the editor lives on a test site built from
  `main`, and a button publishes `main` to the live site, which is built without the editor. The
  GitHub App needs **Actions: Read and write** for them; without `actions`, nothing changes and
  Read-only is still enough. See [Action buttons](README.md#action-buttons).

## 0.7.0 — 2026-10-23

The sign-in relay can live under a site's own path.

- **`PUBLIC_URL` for the relay.** Set it to where the browser reaches the relay — e.g.
  `https://example.com/cms-auth` — and the relay answers under that path, sends sign-in back to
  `…/cms-auth/callback`, and keeps its cookies to that path. So the relay can run on the site's own
  server without a domain of its own, and a reverse proxy that hands it plain `http` no longer
  puts the wrong address in the callback. Without it, nothing changes. See
  [auth/README.md](auth/README.md).

## 0.6.0 — 2026-10-23

The editor is on npm.

- **On npm.** `npm install --save-dev simple-git-cms`, then `npx simple-git-cms install
  public/editor`: the editor comes already built, and upgrading is `npm update` and installing
  again. The preview client and the rehype plugin are imported from the package
  (`simple-git-cms/preview-client`, `simple-git-cms/rehype-figures`) instead of copied in. After
  this first one, releases are published from GitHub Actions, with a provenance statement linking
  each to the commit it was built from.

## 0.5.0 — 2026-10-23

Articles imported from another system now come back exactly as they went in, and the preview is
sent the cover image and the rest of the frontmatter.

- **Lists keep their spacing.** A list with a blank line between its items — the way turndown and
  so most imported articles write them — was saved as a tight one, which the site draws closer
  together. It stays loose now, and keeps the spaces after its markers (`-   `), so it goes back
  byte for byte. A rule keeps its spelling too (`* * *`).
- **Extra blank lines are no longer an empty paragraph.** Three blank lines in a row were read as a
  blank line of their own and saved as `&nbsp;`, adding space to the page that was never there.
  They are one blank line now, which is all the site ever made of them.
- **The preview is sent the cover image and the rest of the frontmatter**: `article.image`, as an
  address the page can load even before it is uploaded, and `article.fields`. A preview page
  written for 0.4.0 ignores them and works as before.

## 0.4.0 — 2026-10-23

The release that made the editor usable for a real article rather than a plain one: tables,
attachments, cover images, site-defined blocks, and a firm answer to what happens to HTML the
editor doesn't understand. Everything an article file contains now survives a round trip
byte for byte.

### Writing

- **Tables**, created in the editor and written to the file as clean GFM — padded to the column
  width, CJK counted as two cells wide, no `&nbsp;` in empty cells. A table typed by hand is
  reformatted once and then left alone.
- **HTML tables**, for the cases GFM cannot hold: merged cells, and a switch between the two
  spellings. Only where `config.json` asks for it, so an ordinary table keeps an ordinary toolbar.
- **Attachments**: a PDF or any other file goes up as it is, under its own name, and is linked
  from the body. Same path as images, so saving, conflicts and draft recovery were unchanged.
- **Cover image**, uploaded, cropped, replaced or removed from the article's own panel — and it
  can reuse a picture already in the body instead of uploading a second copy.
- **Code blocks and inline code**, with the escaping rules stopping at the backtick.
- **Pasted markup** is treated as markup rather than as text.

### HTML in an article

- **Nothing unrecognised is dropped any more.** A `<div>`, a comment or a component the site
  expands itself becomes an editable source box and is written back exactly as it was found.
- **Blocks the site defines itself**: name a tag in `config.json` and the editor edits it as a
  small form — a card of fields, a table, or its own source. An element is claimed by its tag,
  the attributes it must carry, and optionally what one of them starts with, so one kind of
  `<iframe>` can be a video block without every iframe becoming one. Attributes the definition
  never mentioned are kept and editable, folded away.
- **The file's own spelling is kept**: `<iframe></iframe>` is not rewritten as `<iframe />`, and
  bare attributes such as `allowfullscreen` are not dropped.
- **A tag that is never closed is marked where it stands** — in the box or in the sentence — and
  saving says which tag and on which line before it goes out. One unclosed `<div>` wraps the rest
  of the page it lands on, and Markdown cannot see that on its own.
- **Elements written across a blank line** — a notice with two paragraphs in it — are read back as
  the one element they are.

### Around the editor

- **The list loads in two steps**: which files there are, then their text in batches, newest
  first, so it appears without waiting for the last article. The text is cached in the browser
  under git's own hash of it, so opening the editor again downloads only what changed.
- **Nothing in progress is lost**: unsaved work, images included, is kept as you type and offered
  back after a crash, a closed tab or a reload.
- **A reload comes back to the article that was open**, and its address can be shared.
- **Boxes can be left with the keyboard**: Enter steps in, Escape steps out, Backspace takes an
  empty one away, and dragging one moves that one thing and nothing else.
- Dark mode, a favicon, and tags are no longer required.

### Configuration, security, project

- **`config.json` is checked at startup** and says everything that is wrong with it at once,
  against a schema that editors can use for completion.
- **A Content-Security-Policy for the editor**, with CI keeping the policy in the README and the
  policy the tests run under from drifting apart.
- **Browser tests**: the built editor driven in a real Chrome against an in-memory GitHub, so the
  interface that gets clicked is the one that makes the commit.
- `app.js` split into modules by responsibility, ESLint added, and the cropper loaded on demand
  (first load 207KB → 194KB gzipped).
- **A site of its own** at simple-git-cms.azq1994.com, with a demo that runs the real editor
  against a service worker standing in for GitHub, and three site templates the preview can switch
  between.
- **Node 22 or newer** to build and test the editor; CI runs the oldest supported line and the
  newest (22 and 26). Node 20 reached its end of life in April 2026.

## 0.3.0 — 2026-10-21

Interface in English, Chinese and Japanese; the sign-in relay no longer tied to Cloudflare.

## 0.2.1 — 2026-10-21

While developing locally, images in the editor are loaded from the local site, as the preview does.

## 0.2.0 — 2026-10-21

Preview: the article being edited, in the site's own layout, at desktop or phone width, including
changes and images that have not been saved yet.

## 0.1.4 — 2026-10-21

`app.js` and `app.css` carry a content fingerprint in their address, so an upgrade is not served
from the browser's cache.

## 0.1.3 — 2026-10-21

Signing in through a GitHub App, with the token limited to the repositories the App is installed
on and refreshed automatically when it expires.

## 0.1.2 — 2026-10-21

Blank lines in the editor are saved as `&nbsp;` so the site shows them as blank lines; leading and
trailing blank lines are dropped.

## 0.1.1 — 2026-10-21

## 0.1.0 — 2026-10-21

First release: a content editor for static sites that uses a GitHub repository as its backend.
