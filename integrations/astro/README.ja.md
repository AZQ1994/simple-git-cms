# Astro のサイトで画像のキャプションと横並びを表示する

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

エディターが書き出すのはただの Markdown で、画像については 2 つの約束ごとを使っています。

- キャプションは画像の title に入ります：`![](/uploads/a.webp "キャプション")`
- 1 つの段落に画像が複数あれば横並びです：`![](/uploads/a.webp)![](/uploads/b.webp)`

`rehype-figures.mjs` は、これらを `<figure><figcaption>` と `<div class="gallery cols-N">` に
変換します。依存のない普通の rehype プラグインで、`simple-git-cms` パッケージを入れていれば
`simple-git-cms/rehype-figures` から読み込めます。パッケージを足したくなければ、ファイルをサイトにコピーしても同じです。

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
import rehypeFigures from 'simple-git-cms/rehype-figures';

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

## 記事の目次

`rehype-toc.mjs` は長い記事を読みやすくします。

- `##` と `###` の見出しすべてに `id` が付き、`#getting-started` でそこへ直接飛べます。id は GitHub や
  Astro が付けるものと同じで、日本語や中国語もそのまま残るので `## 第一章` は `#第一章` になります。
  前の見出しと同じ名前なら末尾に `-1`、`-2` が付きます
- こうした見出しが 3 つ以上ある記事には、本文の先頭に `<nav class="toc">` が入り、見出しをリンクとして
  並べます。`###` はその前の `##` の下に入れ子になります

目次の要らない記事は frontmatter に `toc: false` と書きます。つなぎ方は `rehypeFigures` の隣に
加えるだけで、オプションは任意です。

```js
import rehypeToc from 'simple-git-cms/rehype-toc';

rehypePlugins: [rehypeFigures, [rehypeToc, { minHeadings: 3, title: '目次' }]],
```

| オプション | 既定 | |
| --- | --- | --- |
| `minHeadings` | `3` | 見出しがいくつ以上あれば目次を出すか |
| `title` | なし | 目次の上の見出し（`<p class="toc-title">`）。nav の `aria-label` にもなります |
| `insert` | `true` | `false` にすると id だけ付けます。サイドバーなど、サイト側で目次を組む場合に。Astro の `render()` が返す `headings` もこの id を使います |

エディターのプレビューも既定のオプションでこのプラグインを実行します。スタイルの出発点：

```css
html { scroll-behavior: smooth; }
.prose :is(h2, h3) { scroll-margin-top: 80px; } /* 固定ヘッダーに隠れないように */
.prose .toc { margin: 16px 0 24px; padding: 12px 16px; border-left: 3px solid #d6dae1; background: #f6f7f9; }
.prose .toc-title { margin: 0 0 6px; font-weight: 600; }
.prose .toc ol { margin: 0; padding-left: 1.2em; }
.prose .toc ol ol { margin-top: 2px; }
.prose .toc a { text-decoration: none; }
```
