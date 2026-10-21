# 在 Astro 站点上显示图注和并排图片

[English](README.md) · **简体中文** · [日本語](README.ja.md)

编辑器写出来的是普通 Markdown，图片上用了两个约定：

- 图注写在图片的 title 里：`![](/uploads/a.webp "这是图注")`
- 同一个段落里有多张图，就是并排：`![](/uploads/a.webp)![](/uploads/b.webp)`

`rehype-figures.mjs` 把这两样变成 `<figure><figcaption>` 和 `<div class="gallery cols-N">`。
它是一个标准的 rehype 插件，没有依赖——把这个文件复制进你的网站就行，比如放到
`src/lib/rehype-figures.mjs`。

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
import rehypeFigures from './src/lib/rehype-figures.mjs';

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
