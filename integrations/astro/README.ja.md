# Astro のサイトで画像のキャプションと横並びを表示する

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

エディターが書き出すのはただの Markdown で、画像については 2 つの約束ごとを使っています。

- キャプションは画像の title に入ります：`![](/uploads/a.webp "キャプション")`
- 1 つの段落に画像が複数あれば横並びです：`![](/uploads/a.webp)![](/uploads/b.webp)`

`rehype-figures.mjs` は、これらを `<figure><figcaption>` と `<div class="gallery cols-N">` に
変換します。依存のない普通の rehype プラグインなので、ファイルをサイトにコピーするだけです。
置き場所はたとえば `src/lib/rehype-figures.mjs`。

## つなぎ方

> **Astro 7 は既定で Sätteri を使って Markdown を描画し、rehype プラグインをそもそも実行しません。**
> 下の手順を踏まないとプラグインは黙って無視され、キャプションは `title` 属性のまま残ります。
> unified のパイプラインを使い続けるには、Astro の Markdown プロセッサーを入れて
> `markdown.processor` を設定してください。

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

Astro 6 以前なら、古いトップレベルの書き方も動き、追加のパッケージも要りません。

```js
export default defineConfig({
  markdown: { rehypePlugins: [rehypeFigures] },
});
```

この書き方は非推奨です。Astro 7 でも動きはしますが、やはり `@astrojs/markdown-remark` が必要に
なります。新しめのバージョンでは `markdown.processor` のほうを使ってください。

エディターのプレビューはブラウザーで同じプラグインを動かしているので、書いているときに見える
ものと、サイトがビルドするものは一致します。

## スタイル

記事本文のスタイルを書いているところに、これを足してください。

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
