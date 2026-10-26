# Image captions and side-by-side images on an Astro site

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

The editor writes plain Markdown and uses two conventions for images:

- a caption goes in the image's title: `![](/uploads/a.webp "The caption")`
- several images in one paragraph means side by side: `![](/uploads/a.webp)![](/uploads/b.webp)`

`rehype-figures.mjs` turns those into `<figure><figcaption>` and `<div class="gallery cols-N">`.
It is a standard rehype plugin with no dependencies, imported from `simple-git-cms/rehype-figures`
once the package is installed — or copy the file into your site if you would rather not add it.

## Setup

> **Astro 7 renders Markdown with Sätteri by default, which does not run rehype plugins at all.**
> Without the step below the plugin is silently ignored and captions stay as `title` attributes. To
> keep the unified pipeline, install Astro's Markdown processor and set `markdown.processor`.

```bash
npm install @astrojs/markdown-remark
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import rehypeFigures from 'simple-git-cms/rehype-figures';

export default defineConfig({
  markdown: {
    processor: unified({
      rehypePlugins: [rehypeFigures],
    }),
  },
});
```

On Astro 6 and earlier the older top-level form also works, and needs no extra package:

```js
export default defineConfig({
  markdown: { rehypePlugins: [rehypeFigures] },
});
```

That form is deprecated — on Astro 7 it still works but also requires `@astrojs/markdown-remark` —
so prefer `markdown.processor` on anything recent.

The editor's preview runs this same plugin in the browser, so what you see while writing matches
what the site builds.

## Styles

Add these wherever your article body is styled:

```css
.prose figure { margin: 12px 0; }
.prose figcaption { margin-top: 8px; font-size: 14px; color: #646b78; text-align: center; }
.prose .gallery { display: grid; gap: 10px; margin: 12px 0; }
.prose .gallery.cols-2 { grid-template-columns: 1fr 1fr; }
.prose .gallery.cols-3 { grid-template-columns: repeat(3, 1fr); }
.prose .gallery figure { margin: 0; }
.prose .gallery img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
@media (max-width: 560px) { .prose .gallery.cols-3 { grid-template-columns: 1fr 1fr; } }
```

## Table of contents

`rehype-toc.mjs` makes long articles easier to find your way around:

- every `##` and `###` heading gets an `id`, so `#getting-started` links straight to it. Ids are the
  ones GitHub and Astro would give it; letters of any script stay, so `## 第一章` is `#第一章`, and a
  heading that repeats an earlier one gets `-1`, `-2` on the end
- an article with three or more such headings gets a `<nav class="toc">` at the top of its body,
  listing them as links, with `###` nested under the `##` before it

An article that should not have one says so in its frontmatter: `toc: false`. Add it next to
`rehypeFigures`, with any of its options:

```js
import rehypeToc from 'simple-git-cms/rehype-toc';

rehypePlugins: [rehypeFigures, [rehypeToc, { minHeadings: 3, title: 'Contents' }]],
```

| Option | Default | |
| --- | --- | --- |
| `minHeadings` | `3` | How many headings an article needs before it gets a table of contents |
| `title` | none | A heading above the list (`<p class="toc-title">`), also the nav's `aria-label` |
| `insert` | `true` | `false` only adds the ids, for a site that lays out its own contents — in a sidebar, say. Astro's `render()` returns the headings as `headings`, with these same ids |

The editor's preview runs this plugin too, with its defaults. Styles to start from:

```css
html { scroll-behavior: smooth; }
.prose :is(h2, h3) { scroll-margin-top: 80px; } /* clear of a fixed header */
.prose .toc { margin: 16px 0 24px; padding: 12px 16px; border-left: 3px solid #d6dae1; background: #f6f7f9; }
.prose .toc-title { margin: 0 0 6px; font-weight: 600; }
.prose .toc ol { margin: 0; padding-left: 1.2em; }
.prose .toc ol ol { margin-top: 2px; }
.prose .toc a { text-decoration: none; }
```
