# 在 Astro 网站里显示图片说明和并排

编辑器的约定（都是标准 Markdown）：

- 图片说明写在图片的 title 里：`![](/uploads/a.webp "说明")`
- 同一段里的多张图片 = 并排：`![](/uploads/a.webp)![](/uploads/b.webp)`

`rehype-figures.mjs` 把它们转换成 `<figure><figcaption>` 和 `<div class="gallery cols-N">`。

## 安装

Astro 7 默认的 Markdown 处理器不支持 rehype 插件，需要装 `@astrojs/markdown-remark`：

```bash
npm install @astrojs/markdown-remark
```

```js
// astro.config.mjs
import rehypeFigures from './src/lib/rehype-figures.mjs'; // 从这里复制过去
export default defineConfig({
  markdown: { rehypePlugins: [rehypeFigures] },
});
```

## 样式（放进文章正文的样式里）

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
