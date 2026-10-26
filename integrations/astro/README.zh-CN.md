# 在 Astro 站点上显示图注和并排图片

[English](README.md) · **简体中文** · [日本語](README.ja.md)

编辑器写出来的是普通 Markdown，图片上用了两个约定：

- 图注写在图片的 title 里：`![](/uploads/a.webp "这是图注")`
- 同一个段落里有多张图，就是并排：`![](/uploads/a.webp)![](/uploads/b.webp)`

`rehype-figures.mjs` 把这两样变成 `<figure><figcaption>` 和 `<div class="gallery cols-N">`。
它是一个标准的 rehype 插件，没有依赖，装了 `simple-git-cms` 包就能从
`simple-git-cms/rehype-figures` 引入；不想加这个包的话，把文件复制进网站也一样。

## 接上

> **Astro 7 默认用 Sätteri 渲染 Markdown，而它根本不跑 rehype 插件。**
> 不做下面这一步的话，插件会被静默忽略，图注会一直停留在 `title` 属性里。想继续用 unified
> 那套管线，就得装上 Astro 的 Markdown 处理器，并设置 `markdown.processor`。

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

Astro 6 及更早的版本上，老的顶层写法也能用，而且不需要额外装包：

```js
export default defineConfig({
  markdown: { rehypePlugins: [rehypeFigures] },
});
```

这种写法已经废弃——在 Astro 7 上虽然还能用，但同样要求装 `@astrojs/markdown-remark`——所以
比较新的版本上请优先用 `markdown.processor`。

编辑器的预览在浏览器里跑的是同一个插件，所以写的时候看到的和网站构建出来的一致。

## 样式

把下面这些加到你排版文章正文的地方：

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

## 文章目录

`rehype-toc.mjs` 让长文章更好读：

- 每个 `##` 和 `###` 标题都会加上 `id`，用 `#getting-started` 就能直接跳过去。生成的 id 和 GitHub、
  Astro 的一致；中文、日文都会保留，所以 `## 第一章` 就是 `#第一章`，和前面重名的标题会在后面加 `-1`、`-2`
- 有 3 个及以上这种标题的文章，会在正文开头加一个 `<nav class="toc">`，把标题列成链接，`###`
  缩进在它前面的 `##` 下面

某篇文章不想要目录的话，在 frontmatter 里写 `toc: false`。接法是加在 `rehypeFigures` 旁边，选项可选：

```js
import rehypeToc from 'simple-git-cms/rehype-toc';

rehypePlugins: [rehypeFigures, [rehypeToc, { minHeadings: 3, title: '目录' }]],
```

| 选项 | 默认 | |
| --- | --- | --- |
| `minHeadings` | `3` | 标题数量达到多少才显示目录 |
| `title` | 无 | 目录上方的标题（`<p class="toc-title">`），同时作为 nav 的 `aria-label` |
| `insert` | `true` | 设为 `false` 时只加 id，适合网站自己排目录，比如放在侧栏。Astro 的 `render()` 返回的 `headings` 用的就是这些 id |

编辑器的预览也会按默认选项跑这个插件。可以从下面的样式开始改：

```css
html { scroll-behavior: smooth; }
.prose :is(h2, h3) { scroll-margin-top: 80px; } /* 避开固定的顶栏 */
.prose .toc { margin: 16px 0 24px; padding: 12px 16px; border-left: 3px solid #d6dae1; background: #f6f7f9; }
.prose .toc-title { margin: 0 0 6px; font-weight: 600; }
.prose .toc ol { margin: 0; padding-left: 1.2em; }
.prose .toc ol ol { margin-top: 2px; }
.prose .toc a { text-decoration: none; }
```
