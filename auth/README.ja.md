# auth —— 「GitHub でログイン」の中継

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

エディターは静的なページで、GitHub の OAuth 交換には client secret を置いておく場所が要ります。
この中継はそれだけのものです。OAuth code をトークンに交換して、エディターに返す。何も保存しません。

`index.js` は [sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)（MIT、
commit `16f7c4bc00`）がもとになっています —— [LICENSE](LICENSE) を参照。追加した部分はソース中に
`[simple-git-cms]` と印をつけてあります。**全画面リダイレクト方式**と**トークンの更新**の 2 つです。
`/auth` が `redirect_uri` 付きで呼ばれると、ログインの最後にエディターへ戻り、トークンは URL の
フラグメント（`#` の後ろ。つまりどのサーバーにも送られません）に入ります。ポップアップに頼らない
ので、電話でもログインが通ります。もとのポップアップ方式（Sveltia CMS や Decap CMS が使うもの）も
そのまま動きます。

## どこで動くか

`index.js` が使うのは標準の Web API —— `Request`、`Response`、`fetch`、`crypto` —— だけで、設定は
ただのオブジェクトから読みます。依存ゼロの 1 ファイルなので、手を加えずにこれらで動きます。

| ホスト | エントリーポイント | 設定の出どころ |
|---|---|---|
| Cloudflare Workers | `index.js`（default export） | Worker のバインディングとシークレット |
| Deno Deploy | `index.js`（default export） | `Deno.env` |
| Vercel / Netlify のエッジ関数 | `index.js`（default export） | `process.env` |
| Bun | `index.js`（default export） | `process.env` |
| Node、自前のサーバー | `server.js` | `process.env` |

下の手順が Cloudflare Workers なのは、無料枠でこの用途には十分で、GitHub 自体が通らない場所から
でも届くからです。エディターはこの選択に依存しません —— `config.json` の `auth.base` が、最終的に
手に入った URL を指していればいいだけです。

## 1. GitHub App をつくる

GitHub → Settings → Developer settings → GitHub Apps → New。

- **Homepage URL**：あなたのサイト。**Callback URL**：`https://<中継のドメイン>/callback`
- **Expire user authorization tokens**：チェックしたまま —— エディターが自動で更新します
- **Webhook**：Active のチェックを外す
- **Repository permissions**：**Contents: Read and write**。エディターにデプロイの進み具合を表示
  させるには、サイトを GitHub Actions の workflow でビルドするなら **Actions: Read-only**、
  ホスティングの GitHub App がビルドするなら（Cloudflare Pages、Vercel、Netlify）**Checks:
  Read-only** を加えます。ほかは何も要りません。ただし config.json に `actions` があるときは、
  実行ボタンが workflow を実行するので Actions を **Read and write** にします。
- **Where can this GitHub App be installed**：リポジトリが組織のものなら Any account を選ぶ
- client secret を生成し、**Install App** でコンテンツの入ったリポジトリだけを選ぶ

こうして発行されるトークンは、**App がインストールされたリポジトリにしか届かず**、権限も上で選んだもの
だけです。OAuth App でも動きますが、要求できるのは広い `repo` スコープだけで、その人が push
できる*すべての*リポジトリに届いてしまいます。おすすめしません。

## 2. デプロイ

デプロイ先で 3 つの変数を設定します。`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`（どちらも秘密）、
そして `ALLOWED_DOMAINS` —— この中継を使ってよいドメインをカンマ区切りで、ワイルドカード（`*`）も
使えます。ここに挙げたドメインのページだけが、ログインの開始とトークンの更新をできます。

**Cloudflare Workers.** `metadata.example.json` を `metadata.json` にコピーし、`ALLOWED_DOMAINS`
にドメインを書いてアップロードします。

```bash
curl -X PUT -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/<name>" \
  -F "metadata=@metadata.json;type=application/json" \
  -F "index.js=@index.js;type=application/javascript+module"
```

wrangler なら `wrangler deploy index.js --name <name> --compatibility-date 2025-09-01`、そのあと
`wrangler secret put GITHUB_CLIENT_ID`（シークレットも同様）。`metadata.json` の `keep_bindings`
は、新しいコードを上げてもシークレットを残すためのものです。

**Deno Deploy / Vercel / Netlify / Bun.** プロジェクトを `index.js` に向けて、3 つの変数を管理
画面で設定します。ビルドも依存もありません。

**自前のサーバー.** `node auth/server.js`。3 つの変数を環境変数に入れ、ポートを変えたければ `PORT`
（既定は 8788）。TLS を終端するリバースプロキシの後ろに置いてください —— OAuth のコールバックは
`https` でなければなりません。

**専用のドメインではなく、サイトのパスの下に置く.** 中継はサイトとドメインを共有できます。たとえば
`https://example.com/cms-auth`。`PUBLIC_URL` にこのアドレスを設定すると、中継はそのパスの下で応答し
（プロキシがプレフィックスを外しても外さなくても構いません）、コールバックは
`https://example.com/cms-auth/callback`（GitHub App の Callback URL にはこれを指定）になり、cookie も
そのパスに限られます。nginx の場合：

```nginx
location /cms-auth/ {
    proxy_pass http://127.0.0.1:8788;
}
```

プロキシが中継に `http` で渡し、コールバックのアドレスがずれるときも `PUBLIC_URL` で解決します。
この方法には自前のサーバーが必要です。エッジランタイムは自分が配信するドメインにしか置けません。

最後に中継にドメイン名（または上のパス）を与え、エディターの `config.json` の `auth.base` に書きます。

中継 1 つで複数のサイトを賄えます。`ALLOWED_DOMAINS` にすべてのドメインを並べ、GitHub App を各
リポジトリにインストールしてください。その場合サイト同士で 1 つの App を共有するので、どのサイトから
ログインしても、App がインストールされていてその人が書き込めるすべてのリポジトリにトークンが届き、
並べたどのドメインにスクリプトを注入されても、それを使ってログインを始められます。テスト用のサイトや
持ち主の違うサイトには、それぞれ専用の中継と App を用意してください。

## ログインできないとき

うまくいかない原因はほぼこの 4 つで、しかもどれもまともなエラーを出してくれません。

- **Callback URL は完全に一致している必要があります。** `https://` も `/callback` というパスも
  含めて、です。そしてこれは*中継*のドメインで、サイトのドメインではありません。
- **App はリポジトリにインストールされている必要があります。** つくるのとインストールするのは別の
  手順です。App をつくっただけでは何にもアクセスできません。組織のリポジトリなら、オーナーの承認も
  要ります。
- **書く人自身にもリポジトリの書き込み権限が要ります。** App はトークンが*届きうる*範囲を決め、
  その人の権限はそれで何ができるかを決めます。エディターはログイン時に確認し、だめなら言います。
- **エディターを配信しているドメインが `ALLOWED_DOMAINS` に入っている必要があります。** 入っていな
  ければ中継はログインの開始を断ります。エディターを別のドメインに移したときに引っかかるのがこれ
  です。

**Expire user authorization tokens** のチェックを外してもログインは通りますが、GitHub はリフレッ
シュトークンを発行しません。その場合トークンは、誰かがログアウトするまでブラウザーに残り続けます。
チェックしたままのほうが割に合います。

## トークンの更新

GitHub App のユーザートークンは 8 時間で期限切れになります。ログイン時、中継はアクセストークンと
一緒に `refresh_token` をエディターへ渡します。アクセストークンが切れると、エディターは `/refresh`
に POST して新しいものを受け取り、途中だったリクエストをやり直すので、編集中のものは失われません。
`/refresh` は `ALLOWED_DOMAINS` から配信されたページにしか応じません。リフレッシュトークンは 6 か月
使わなければ失効し、そのあとはログインし直しが必要です。

## エンドポイント

| メソッド | パス | 役割 |
|---|---|---|
| `GET` | `/auth`（または `/oauth/authorize`） | ログインの開始。`redirect_uri` を付けると全画面リダイレクト方式になります。 |
| `GET` | `/callback`（または `/oauth/redirect`） | OAuth のコールバック。トークンをエディターに渡します。 |
| `POST` | `/refresh` | リフレッシュトークンを新しいアクセストークンに交換します。 |

`PUBLIC_URL` を設定したときは、各パスがそのパスの下になります（例：`/cms-auth/auth`）。
