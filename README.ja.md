# Simple Git CMS

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

![Simple Git CMS エディター：説明付きの画像がある記事を編集しているところ](docs/screenshot.png)

**[ブラウザーで試す](https://simple-git-cms.azq1994.com/demo/)** — エディターそのものです。GitHub の代わりに Service Worker が応答します。ログインは不要。

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
- **自分で定義するブロック**：動画、お知らせの枠、サイトがすでに描けるもの——`config.json` に
  テンプレートとして書けば、ボタンと小さなフォームが付きます
- **コード**：インラインの `コード` とフェンスのコードブロック（言語の指定も保たれます）。
  エディターが文字に対してする他の処理は中身に触れません
- **表**：行と列の追加・削除、列ごとの左 / 中央 / 右揃え。ファイルには桁の揃った GFM の表として
  書き出されます
- **添付ファイル**：PDF などはそのまま（圧縮せずに）リポジトリに入り、元のファイル名のリンクとして
  本文に挿入されます。サイズの上限は設定できます
- **知らないものを黙って捨てません**：エディターにボタンのないもの——埋め込み、残っている `<div>`、
  サイト側で展開されるコンポーネント——はソースを直接編集できる HTML ブロックとして表示され、
  保存時はそのまま書き戻されます
- **アイキャッチ画像**：記事の情報欄でアップロード・差し替え・切り抜き・削除ができ、指定した
  frontmatter の項目に書き込まれます。一覧のサムネイルや SNS 用の画像に使うあれです
- **記事**：タイトル、日付、タグ、要約、下書き / 公開 / 下書きに戻す / 下書きの削除。開いている
  記事はアドレスバーに入るので、再読み込みしても元の記事に戻り、その URL はログインできる人への
  リンクにもなります
- **保存**：記事と新しい画像をまとめて 1 つのコミットに。開いている間に他の人が同じ記事を変更していた
  場合は、相手の版か自分の版かを選べます
- **書きかけは失われません**：コミットしていないものは入力しながらブラウザーに控えが残り（アップロード
  前の画像も含めて）、クラッシュ・タブを閉じた・再読み込みのあとに戻すか尋ねます
- **プレビュー**：サイト自身のレイアウトで（パソコン / スマートフォン幅）、未保存の内容や画像も含めて
  確認できます
- **デプロイ**：下書きの保存には `[skip ci]` が付くのでビルドは走りません。公開後はヘッダーに
  GitHub Actions の進行状況が出ます
- **ログイン**：GitHub App でのログイン（全画面リダイレクト方式なのでスマートフォンでも使えます。
  トークンは App を入れたリポジトリにしか届かず、期限切れは自動で更新）、または Fine-grained
  アクセストークン
- **権限はリポジトリの権限そのまま**。push できる人が編集でき、誰が何を変えたかは git の履歴に残ります
- **画面は英語・简体中文・日本語**に対応、その場で切り替えられます
- **ライト / ダーク**：システムに合わせるか、自分で選ぶか

## 構成

| ディレクトリ | 中身 |
|---|---|
| `src/` | エディター本体。`github.js`（GitHub の読み書き。Node から単独でも使えます）、`article.js`（記事の形式）、`images.js`（圧縮・切り抜き）、`i18n/`（画面の言語）。画面は `store.js`・`dom.js`・`lang.js`・`auth.js`・`list.js`・`editor.js`・`doc.js`・`preview-ui.js` に分かれ、`schema.js` が本文に置けるものと Markdown への書き戻し方を決めています。`app.js` は設定の読み込みと起動だけを担当します |
| `public/` | ページ、スタイル、`config.example.json` |
| `auth/` | 「GitHub でログイン」の中継。依存のない 1 ファイルで、Cloudflare Workers・Deno Deploy・Vercel・Netlify・Bun・自前の Node サーバーのどれでも動きます（[説明](auth/README.ja.md)） |
| `integrations/astro/` | サイト側で画像の説明と横並びを表示するための rehype プラグイン（[説明](integrations/astro/README.ja.md)） |
| `test/` | `npm test`。偽の GitHub API で保存・競合・再試行を確認し、翻訳の過不足も検査します。ネットワークにはつなぎません。`npm run test:e2e` はビルド済みのエディターを実際のブラウザーで動かします（[詳細](test/e2e/README.md)） |
| `www/` | このプロジェクト自身のサイト [simple-git-cms.azq1994.com](https://simple-git-cms.azq1994.com)（[詳細](www/README.md)） |

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
| `collection.imageField` | アイキャッチ画像を書き込む frontmatter の項目名（例：`image`）。省くとアイキャッチ画像の欄は出ません |
| `media.dir` / `media.url` | 画像のリポジトリ内ディレクトリ / サイト上のパス。新しい画像は `<日付>/` の下に入ります |
| `media.maxWidth` / `media.quality` | アップロード時に圧縮する最大幅と webp の品質 |
| `media.maxFileMB` | 添付ファイルの上限サイズ（MB、既定は 20） |
| `blocks` | このサイトが自分で定義するブロック。[自分でブロックを定義する](#自分でブロックを定義する)を参照 |
| `preview.url` | サイト側のプレビューページ（下の手順 4）。空なら「プレビュー」ボタンは出ません |
| `deploy.skipCiForDrafts` | 下書きの保存に `[skip ci]` を付ける（既定は true） |

`config.schema.json` も隣に入るので、JSON Schema を解釈するエディターなら項目を補完し、打ち間違い
をその場で指摘します。エディター自身も起動時にこのファイルを検査し、問題を一度にすべて並べます。
知らない設定も含めて——以前はそれが黙って無視されていました。

### 3. ログイン中継を置く

[auth/README.ja.md](auth/README.ja.md) を参照してください。手順は Cloudflare Workers で書いていますが、
中継は標準の Web API しか使っていないので、Deno Deploy・Vercel・Netlify・Bun・普通の Node サーバーでも
そのまま動きます。

### 4. サイト側

画像の説明と横並びの表示は [integrations/astro/README.ja.md](integrations/astro/README.ja.md) を参照。

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

本文のうちエディターに対応するノードがないもの——`<iframe>`、`<div>`、HTML コメント、サイト側で
展開されるコンポーネント——は生の HTML のかたまりとして保持され、保存時はそのまま書き戻されます。
エディターではソースの入った箱として表示されるので、ツールバーにないものを記事に入れる手段にも
なります。

本文の表は普通の GFM の表です。入れられるのは GFM で書けるものだけ——見出し行が 1 行、1 セルに
1 行の文、セルの結合はなし。手で書いた表は最初の保存で一度だけ桁を揃え直し（列幅に合わせて空白を
入れ、コロンも列幅に従います）、そのあとの保存では変わりません。サイト側に入れるものはありません。
Astro などは最初から remark-gfm を通しているので、必要なのは表のスタイルだけです。

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

## 自分でブロックを定義する

サイトの記事には、文章でも写真でもないものがいくつかあります。動画、お知らせの枠、レイアウトが
すでに描けるようになっている何か。エディターに推測させるかわりに、ファイルでの書かれ方を
`config.json` に書くと、それがボタンになります。

```json
"blocks": [
  {
    "name": "youtube",
    "label": "YouTube",
    "template": "<YouTube id=\"{id}\" />",
    "preview": "https://i.ytimg.com/vi/{id}/hqdefault.jpg",
    "fields": [{ "name": "id", "label": "動画 ID", "placeholder": "dQw4w9WgXcQ" }]
  }
]
```

テンプレートは二役です。エディターはこの形をファイルの中から見つけて小さなフォームとして表示し、
同じテンプレートを通して書き戻します。エディター自身は YouTube が何かを知りません。

| 項目 | 役割 |
|---|---|
| `name` | このブロック自身の名前。ここ以外では使いません |
| `label` | ツールバーのボタンの文字。省略すると `name` |
| `template` | ファイルでの書かれ方。`{プレースホルダー}` が人の入力する部分です |
| `preview` | 任意。エディターに出すプレビュー画像で、同じプレースホルダーが使えます。別サイトの画像なら下のポリシーの `img-src` に足してください |
| `fields` | プレースホルダーにラベル・ヒント（`placeholder`）・複数行（`multiline`）を与えたいときだけ |

テンプレートは HTML でなくても構いません。`{{< youtube {id} >}}` や `:::notice` のような書き方も
同じように扱えます。エディターは文字列を照合して文字列を書き戻すだけだからです。ただし独立した
ブロック（それだけで行になっていること）である必要があり、かつ十分に特徴的でなければなりません。
普通の文章にも当てはまるテンプレートは、普通の文章をブロックに変えてしまいます。

サイト側での表示は、これまでどおりサイトの仕事です。エディターのプレビューはブラウザーで Markdown
を変換しているので、サイトが展開するブロックはそこには出ません。

## エディターを締めておく

トークンは `localStorage` にあるので、エディターのアドレスでスクリプトを実行できるものはそれを
読めます。そしてそのトークンにはリポジトリへの書き込み権限があります。Content-Security-Policy
ヘッダーはそれを止めるためのものです。エディター自身のファイル以外は、何も実行されません。

<!-- csp:begin -->
```http
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://avatars.githubusercontent.com;
  connect-src 'self' https://api.github.com https://cms-auth.example.com;
  frame-src 'self';
  base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```
<!-- csp:end -->

実際に置くときは 1 行です。ここで折ってあるのは読みやすさのためです。
`https://cms-auth.example.com` は自分の中継に置き換えてください。エディターとサイトのドメインが
違う場合は、サイトのアドレスを `img-src` と `frame-src` にも足します。

| ディレクティブ | 理由 |
|---|---|
| `default-src 'none'` | まず全部断り、そこから 1 行ずつ開けます |
| `script-src 'self'` | 肝心なのはこの行。動くのはエディター自身のファイルだけで、差し込まれた `<script>` はインラインでもそうでなくても何もしません |
| `style-src … 'unsafe-inline'` | 避けられません。TipTap と切り抜きが `style` 属性を書きます。スクリプトの同じ緩和よりずっと弱く、CSS から `localStorage` は読めません |
| `img-src … avatars.githubusercontent.com` | ログインしている人のアバターは GitHub から来ます |
| `connect-src` | エディターが話してよいのは GitHub API と自分の中継だけ |
| `frame-src 'self'` | プレビューの iframe に入るのは自分のサイトです |
| `frame-ancestors 'none'` | 誰もエディターを自分のページに埋め込めません |

`'unsafe-eval'` も、スクリプトの `'unsafe-inline'` も要りません。ページにインラインスクリプトは
なく、バンドルのどこにも `eval` はないからです。`npm run test:e2e` はこのポリシーのもとで
エディターを配信するので、何かがこれを壊したら CI が先に気づきます。

エディターを `/editor/` に入れた場合、置き場所は：

```
# Cloudflare Pages、Cloudflare Workers の静的アセット、Netlify —— サイト直下の _headers
/editor/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; …
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

nginx は `location /editor/` の中に `add_header Content-Security-Policy "…" always;`。Apache は
`<Location "/editor/">` の中に `Header always set Content-Security-Policy "…"`。Vercel は
`vercel.json` の `headers`。ヘッダーがどうしても設定できないときは、エディターの `index.html` に
`<meta http-equiv>` を置けば大半は効きます。ただし `frame-ancestors` は meta では無視されます。

**できないこと。** 書き換えられた `app.js` は止められませんし、サーバーの中身を変えられる人も、
ブラウザー拡張も止められません。トークンは `localStorage` にあるままで、これはそこへ至る普通の
道を塞ぐだけです。

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
  ドメインに置き、素性の分からないスクリプトを同じドメインに置かず、[エディターを締めておく](#エディターを締めておく)
  のポリシーを付けてください

## ライセンス

[MIT](LICENSE)。`auth/` は
[sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) から派生したもので、
その MIT 表示は [auth/LICENSE](auth/LICENSE) に残しています。バンドルされている依存は
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) にまとめてあります。
