# Simple Git CMS

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

![Simple Git CMS エディター：説明付きの画像がある記事を編集しているところ](docs/screenshot.png)

**GitHub リポジトリをバックエンドにする**静的サイト用のコンテンツエディターです。記事はリポジトリ内の
Markdown ファイルで、エディター自体はただの静的ページ。書く人のブラウザから GitHub API を直接読み書き
するので、**自前のサーバーもデータベースも要りません**。

Astro や Hugo のような静的サイトに向いています。記事を書いて画像を入れて公開する——その裏側は
git のコミット 1 回で、あとは GitHub Actions などの CI がビルドして公開します。

## できること

- **そのまま見たまま編集**（TipTap）して、きれいな Markdown で保存。既存の記事を開いて保存し直しても
  ファイルは変わりません
- **画像**：貼り付け・ドロップ・複数選択に対応し、ブラウザ内で webp に圧縮。切り抜き、回転、説明、
  横並び、差し替えができます
- **記事**：タイトル、日付、タグ、要約、下書き / 公開 / 下書きに戻す / 下書きの削除
- **保存**：記事と新しい画像をまとめて 1 つのコミットに。開いている間に他の人が同じ記事を変更していた
  場合は、相手の版か自分の版かを選べます
- **プレビュー**：サイト自身のレイアウトで（パソコン / スマートフォン幅）、未保存の内容や画像も含めて
  確認できます
- **デプロイ**：下書きの保存には `[skip ci]` が付くのでビルドは走りません。公開後はヘッダーに
  GitHub Actions の進行状況が出ます
- **ログイン**：GitHub App でのログイン（全画面リダイレクト方式なのでスマートフォンでも使えます。
  トークンは App を入れたリポジトリにしか届かず、期限切れは自動で更新）、または Fine-grained
  アクセストークン
- **権限はリポジトリの権限そのまま**。push できる人が編集でき、誰が何を変えたかは git の履歴に残ります
- **画面は英語・简体中文・日本語**に対応、その場で切り替えられます

## 構成

| ディレクトリ | 中身 |
|---|---|
| `src/` | エディター本体。`github.js`（GitHub の読み書き。Node から単独でも使えます）、`article.js`（記事の形式）、`images.js`（圧縮・切り抜き）、`i18n/`（画面の言語）。画面は `store.js`・`dom.js`・`lang.js`・`auth.js`・`list.js`・`editor.js`・`doc.js`・`preview-ui.js` に分かれていて、`app.js` は設定の読み込みと起動だけを担当します |
| `public/` | ページ、スタイル、`config.example.json` |
| `auth/` | 「GitHub でログイン」の中継。依存のない 1 ファイルで、Cloudflare Workers・Deno Deploy・Vercel・Netlify・Bun・自前の Node サーバーのどれでも動きます（[説明](auth/README.md)） |
| `integrations/astro/` | サイト側で画像の説明と横並びを表示するための rehype プラグイン（[説明](integrations/astro/README.md)） |
| `test/` | `npm test`。偽の GitHub API で保存・競合・再試行を確認し、翻訳の過不足も検査します。ネットワークにはつなぎません |

## サイトに組み込む

### 1. ビルドしてインストール

```bash
npm install
npm run build
node scripts/install.mjs ../my-site/public/editor   # サイトの静的ディレクトリ。URL は /editor/ になります
```

インストールで上書きされるのはエディター自身のファイルだけで、インストール先の `config.json` と
`logo.png` はそのまま残ります。更新するときはこの 2 つを繰り返してください。

### 2. `config.json` を書く

エディターと同じディレクトリに、`config.example.json` を参考にして置きます。

| 項目 | 説明 |
|---|---|
| `title` / `siteName` / `logo` | 画面に出る名前とロゴ |
| `lang` | 画面の最初の言語：`en` / `zh` / `ja`。省略するとブラウザの言語に従います。本人がメニューで選んだ言語が優先されます |
| `repo` / `branch` | コンテンツのあるリポジトリ |
| `siteUrl` | サイトのアドレス。「サイトで見る」に使うほか、エディターがサイトと別ドメインにあるときは画像の読み込みにも使います |
| `timeZone` | 日付の表示、画像フォルダー、新しい記事の番号に使うタイムゾーン |
| `auth.base` | ログイン中継のアドレス |
| `collection.dir` | 記事のディレクトリ（リポジトリ内のパス）。記事 1 本につき `<id>.md` が 1 つ |
| `collection.url` | 記事の URL。`{id}` が置き換わります |
| `media.dir` / `media.url` | 画像のリポジトリ内ディレクトリ / サイト上のパス。新しい画像は `<日付>/` の下に入ります |
| `media.maxWidth` / `media.quality` | アップロード時に圧縮する最大幅と webp の品質 |
| `preview.url` | サイト側のプレビューページ（下の手順 4）。空なら「プレビュー」ボタンは出ません |
| `deploy.skipCiForDrafts` | 下書きの保存に `[skip ci]` を付ける（既定は true） |

### 3. ログイン中継を置く

[auth/README.md](auth/README.md) を参照してください。手順は Cloudflare Workers で書いていますが、
中継は標準の Web API しか使っていないので、Deno Deploy・Vercel・Netlify・Bun・普通の Node サーバーでも
そのまま動きます。

### 4. サイト側

画像の説明と横並びの表示は [integrations/astro/README.md](integrations/astro/README.md) を参照。

プレビューを使うには、記事ページと同じレイアウトのページをサイトに 1 枚足して、
[`integrations/preview-client.js`](integrations/preview-client.js) を読み込み、
`connectPreview(article => …)` の中でタイトル・日付・タグ・`article.html` をページに入れてください。
エディターは本文をサイトと同じ流れ（remark-gfm、smartypants、rehype-figures）で HTML に変換して送るので、
プレビューページは表示するだけで済みます。

### 5. 書く人を追加する

GitHub アカウントと、リポジトリの共同作業者（Write）権限が必要です。GitHub App もそのリポジトリに
インストールしておきます。

## 記事の形式

```markdown
---
title: "タイトル"
description: "要約（省略可。省略すると本文の冒頭から作られます）"
date: 2026-10-21T03:00:00.000Z
tags: ["タグ1", "タグ2"]
draft: true            # 下書きのときだけ付きます
---

本文（Markdown）。![](/uploads/20261021/abc.webp "画像の説明")
```

frontmatter のうちエディターが知らない項目はそのまま残ります。新しい記事のファイル名（= id）は、
作成したときの「年月日時分」です。

## 開発

```bash
npm install
npm test
npm run dev     # ビルドして http://localhost:4173 でエディターを開きます
```

`npm run dev` は初回にリポジトリ直下へ例から `dev.config.json` を作ります（gitignore 済み）。
実際に編集するには、本物のリポジトリを指すように書き換えてください。ビルドのたびに `dist/` へ
コピーされるので、作り直しても消えません。localhost で開くときは `localStorage['simple-git-cms-api']` を設定して
GitHub API をローカルのプロキシに向けることもできます。

依存を足したり変えたりしたら `npm run licenses` を実行し直してください。実際にバンドルされた
パッケージから [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) を作り直します。CI でも確認しています。

### 翻訳

言語ごとに `src/i18n/` の下の 1 ファイル（`en.js`、`zh.js`、`ja.js`）に文字列が並んでいます。
追加するときは `en.js` をコピーして訳し、`src/i18n/index.js` の `locales` に足してください。
キーの不足・余り・空文字、`{プレースホルダー}` が英語と合わない場合はテストが落ちるので、
訳し残したまま出ることはありません。

## わかっている制限

- 書く人に GitHub アカウントが必要です（なしで済ませるなら、GitHub App としてコミットする
  自前のログインを別に用意することになります）
- 1 サイトにつき記事のまとまりは 1 つで、項目は上記のものに固定です
- プレビューはブラウザ内で Markdown を変換するので、サイト側で別途足した Markdown プラグインは
  反映されません
- 外部の画像アドレス（他のページから貼り付けたもの）は保存時に弾かれます。ダウンロードして
  アップロードし直してください
- GitHub のトークンは `localStorage` に入ります。バックエンドのないエディターでは普通の割り切りですが、
  エディターと同じオリジンにスクリプトを差し込める人はトークンを読めます。自分で管理している
  ドメインに置き、素性の分からないスクリプトを同じドメインに置かないでください

## ライセンス

[MIT](LICENSE)。`auth/` は
[sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) から派生したもので、
その MIT 表示は [auth/LICENSE](auth/LICENSE) に残しています。バンドルされている依存は
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) にまとめてあります。
