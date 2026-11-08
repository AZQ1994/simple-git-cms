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

## Articles in more than one language

With `languages` in config.json, an article's languages are files side by side —
`202608101200.md` (the first language) and `202608101200.zh.md` — see
[the main README](../../README.md#articles-in-more-than-one-language). Three things from
`simple-git-cms/languages` cover what a site needs:

```js
// src/content.config.ts — keep the file name whole: Astro's default id would turn
// 202608101200.zh into 202608101200zh
import { fileId } from 'simple-git-cms/languages';
const news = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/news', generateId: fileId }),
  schema: /* … */,
});
```

```js
import { inLanguage, translationsOf } from 'simple-git-cms/languages';
const LANGUAGES = ['ja', 'zh']; // the same list as config.json

// One language's articles; articleId is the id without the language, for the URL
const zh = inLanguage(await getCollection('news'), 'zh', LANGUAGES);

// Every language of one article, for a language switcher and hreflang
const all = translationsOf(await getCollection('news'), entry.id, LANGUAGES); // { ja: entry, zh: entry }
```

`translatedFrom` in a translation's frontmatter is for the editor; add it to the schema as an
optional field (`z.object({ lang: z.string(), sha: z.string() }).optional()`) or let the schema
pass unknown keys.
