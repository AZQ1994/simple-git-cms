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

## 多言語の記事

config.json に `languages` を書くと、記事の各言語は並んだファイルになります：`202608101200.md`（最初の言語）と `202608101200.zh.md`。[メインの README](../../README.ja.md#多言語の記事) を参照してください。サイトに必要なものは `simple-git-cms/languages` にあります：

```js
// src/content.config.ts —— ファイル名をそのまま使う。Astro の既定の id では 202608101200.zh が 202608101200zh になります
import { fileId } from 'simple-git-cms/languages';
const news = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/news', generateId: fileId }),
  schema: /* … */,
});
```

```js
import { inLanguage, translationsOf } from 'simple-git-cms/languages';
const LANGUAGES = ['ja', 'zh']; // config.json と同じリスト

// 1 つの言語の記事。articleId は言語を除いた id で、URL に使います
const zh = inLanguage(await getCollection('news'), 'zh', LANGUAGES);

// 1 つの記事の全言語。言語の切り替えと hreflang に
const all = translationsOf(await getCollection('news'), entry.id, LANGUAGES); // { ja: entry, zh: entry }
```

翻訳の frontmatter にある `translatedFrom` はエディター用です。schema に任意の項目として足すか（`z.object({ lang: z.string(), sha: z.string() }).optional()`）、知らない項目を通すようにしてください。
