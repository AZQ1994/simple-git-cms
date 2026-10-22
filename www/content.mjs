// Everything the site says, in the three languages the editor itself speaks. One object per
// language, same shape; build.mjs renders one page from each.
export const REPO = 'https://github.com/AZQ1994/simple-git-cms';
export const SITE = 'https://simple-git-cms.azq1994.com';

/** Which language goes where. The first one is the site's root. */
export const pages = [
  { lang: 'en', path: '', hreflang: 'en', label: 'English' },
  { lang: 'zh', path: 'zh/', hreflang: 'zh-Hans', label: '简体中文' },
  { lang: 'ja', path: 'ja/', hreflang: 'ja', label: '日本語' },
];

const install = `npm install
npm run build
node scripts/install.mjs ../my-site/public/editor`;

const config = `{
  "repo": "owner/repo",
  "branch": "main",
  "siteUrl": "https://example.com",
  "timeZone": "Asia/Tokyo",
  "auth": { "base": "https://cms-auth.example.com" },
  "collection": {
    "dir": "src/content/news",
    "url": "/news/{id}/"
  },
  "media": { "dir": "public/uploads", "url": "/uploads" }
}`;

const frontmatter = `---
title: "A title"
date: 2026-10-21T03:00:00.000Z
tags: ["tag one", "tag two"]
draft: true
---

The body, in Markdown.
![](/uploads/20261021/abc.webp "An image caption")`;

export const copy = {
  en: {
    dir: 'ltr',
    meta: {
      title: 'Simple Git CMS — a content editor whose backend is your GitHub repository',
      description:
        'A WYSIWYG editor for static sites that reads and writes Markdown in your GitHub repository, straight from the browser. No server of your own, no database. MIT licensed.',
    },
    skip: 'Skip to content',
    nav: { demo: 'Demo', quickstart: 'Quick start', github: 'GitHub' },
    hero: {
      kicker: 'Open source · MIT',
      tagline: 'The editor your writers use.<br>The repository you already have.',
      lead:
        'Articles are Markdown files in your GitHub repository. Simple Git CMS is one static page that reads and writes them through the GitHub API, from the editor’s own browser. <strong>No server of your own, and no database.</strong>',
      primary: 'Try it in your browser',
      secondary: 'View on GitHub',
      third: 'How to put it on a site',
      demoNote: 'The demo makes up a repository inside your browser. Nothing to sign in to, nothing sent anywhere.',
      badges: ['Astro, Hugo & friends', 'One commit per save', 'English · 简体中文 · 日本語'],
      shotAlt: 'The Simple Git CMS editor, showing an article with a captioned image',
    },
    pillars: {
      heading: 'Three things it gets out of your way',
      items: [
        {
          title: 'Nothing of yours to run',
          body:
            'The editor is a static directory you drop next to your site. It talks to GitHub and to nobody else — so there is no backend to deploy, patch, pay for or watch.',
        },
        {
          title: 'Permissions are repository permissions',
          body:
            'Whoever can push can edit. No user table, no roles to keep in sync, no second place to revoke access. Who changed what is already in the git history.',
        },
        {
          title: 'Publishing is a commit',
          body:
            'An article and its images go in as a single commit, so your existing CI builds and deploys the site. After publishing, the top bar follows the GitHub Actions run.',
        },
      ],
    },
    flow: {
      heading: 'What happens when someone hits Save',
      nodes: {
        editor: 'The editor',
        editorNote: 'A static page on your site',
        api: 'GitHub API',
        apiNote: 'From the browser, with their token',
        actions: 'GitHub Actions',
        actionsNote: 'Your existing build',
        site: 'Your site',
        siteNote: 'Astro, Hugo, anything',
      },
      edges: { commit: 'one commit: article.md + images', push: 'on push', deploy: 'deploys' },
      note:
        'Drafts are saved with <code>[skip ci]</code> so they don’t trigger a build. If someone else changed the article while it was open, you are shown their version and yours instead of losing either.',
    },
    features: {
      heading: 'What it does',
      items: [
        { title: 'WYSIWYG that saves clean Markdown', body: 'Open an existing article, save it again, and the file is unchanged. No stray HTML, no reformatting.' },
        { title: 'Images without a trip to Photoshop', body: 'Paste, drop or pick several at once. Compressed to webp in the browser, then crop, rotate, caption, place side by side, replace.' },
        { title: 'Tables that stay tables', body: 'Rows, columns and per-column alignment, written out as a GFM table whose columns line up in the file — Japanese text included.' },
        { title: 'Preview in your own layout', body: 'The article rendered by your site, at desktop or phone width, including the changes and images you haven’t saved yet.' },
        { title: 'Drafts, publishing, reverting', body: 'Title, date, tags, summary. Save a draft, publish it, revert it to a draft, or delete one — all of it ordinary commits.' },
        { title: 'Conflicts handled, not ignored', body: 'Saving checks the file hasn’t moved underneath you. When it has, you choose between their version and yours.' },
        { title: 'Sign in with GitHub', body: 'A GitHub App redirect that works on phones, with the token refreshed automatically — or paste a fine-grained access token.' },
        { title: 'Three interface languages', body: 'English, 简体中文 and 日本語, switchable in place. Adding a fourth is one file of strings.' },
        { title: 'A relay that runs anywhere', body: 'The sign-in relay is a single dependency-free file: Cloudflare Workers, Deno Deploy, Vercel, Netlify, Bun, or your own Node server.' },
      ],
    },
    start: {
      heading: 'Putting it on a site',
      lead: 'Four steps, and the longest one is writing a config file.',
      steps: [
        { n: '1', title: 'Build and install the editor', body: 'Into any static directory of your site, so the URL is <code>/editor/</code>. Upgrading is the same two commands; your <code>config.json</code> and logo are left alone.', code: install, codeLang: 'bash' },
        { n: '2', title: 'Write config.json', body: 'Next to the editor’s <code>index.html</code>. Where the content lives, where images go, what the interface calls itself.', code: config, codeLang: 'json' },
        { n: '3', title: 'Deploy the sign-in relay', body: 'One file, one GitHub App. Cloudflare Workers is the documented route; anything with <code>fetch</code> works.', code: null },
        { n: '4', title: 'Add your editors', body: 'A GitHub account, write access to the repository, and the App installed on it. That’s the whole permission model.', code: null },
      ],
      formatHeading: 'And the files it writes',
      formatBody:
        'Frontmatter the editor doesn’t recognise is preserved untouched, so it can edit articles your site already has. A new article’s filename is the minute it was created.',
      format: frontmatter,
    },
    limits: {
      heading: 'Where it isn’t the answer',
      lead: 'Written down in the README too, because finding out later is worse.',
      items: [
        'Editors need a GitHub account. Letting people in without one would mean running a sign-in service of your own.',
        'One article collection per site, with the fields above.',
        'The preview converts Markdown in the browser, so Markdown plugins your site adds separately aren’t reflected in it.',
        'The GitHub token lives in <code>localStorage</code> — the usual trade-off for an editor with no backend. Serve it from a domain you control.',
      ],
      more: 'Read the full list',
    },
    cta: { heading: 'Have a look at the code', body: 'Three READMEs, a test suite with no network in it, and about 2,000 lines you can read in an afternoon.', button: 'AZQ1994/simple-git-cms' },
    footer: {
      license: 'MIT licensed',
      docs: 'Documentation',
      links: [
        { label: 'README', href: `${REPO}#readme` },
        { label: 'Sign-in relay', href: `${REPO}/tree/main/auth` },
        { label: 'Astro integration', href: `${REPO}/tree/main/integrations/astro` },
        { label: 'Releases', href: `${REPO}/releases` },
        { label: 'Contributing', href: `${REPO}/blob/main/CONTRIBUTING.md` },
        { label: 'Third-party notices', href: `${REPO}/blob/main/THIRD-PARTY-NOTICES.md` },
      ],
      langHeading: 'Languages',
    },
  },

  zh: {
    dir: 'ltr',
    meta: {
      title: 'Simple Git CMS — 以 GitHub 仓库为后端的内容编辑器',
      description:
        '给静态网站用的所见即所得编辑器：直接在浏览器里读写 GitHub 仓库中的 Markdown。不需要自己的服务器，也没有数据库。MIT 许可。',
    },
    skip: '跳到正文',
    nav: { demo: '演示', quickstart: '快速开始', github: 'GitHub' },
    hero: {
      kicker: '开源 · MIT',
      tagline: '编辑的人用它写稿，<br>后端就是你已有的仓库。',
      lead:
        '文章就是 GitHub 仓库里的 Markdown 文件。Simple Git CMS 是一个静态页面，在编辑者自己的浏览器里通过 GitHub API 读写它们。<strong>不需要你自己的服务器，也没有数据库。</strong>',
      primary: '在浏览器里试一下',
      secondary: '在 GitHub 上查看',
      third: '怎么装到网站上',
      demoNote: '演示会在你的浏览器里虚构一个仓库。不用登录，什么也不会发出去。',
      badges: ['Astro、Hugo 之类都行', '一次保存一个 commit', 'English · 简体中文 · 日本語'],
      shotAlt: 'Simple Git CMS 编辑器，正在编辑一篇带图注的文章',
    },
    pillars: {
      heading: '它替你省掉的三件事',
      items: [
        {
          title: '没有属于你的东西要运维',
          body:
            '编辑器是一个静态目录，放到网站旁边就行。它只和 GitHub 说话——没有后端要部署、要打补丁、要付钱、要盯着。',
        },
        {
          title: '权限就是仓库权限',
          body:
            '能 push 的人就能编辑。不用维护用户表，不用同步角色，也不用在第二个地方收回权限。谁改了什么，git 历史里本来就有。',
        },
        {
          title: '发布就是一次 commit',
          body:
            '文章和它的图片作为同一个 commit 提交，于是你现有的 CI 照常构建和部署。发布之后，顶栏会跟着这次 GitHub Actions 的运行走。',
        },
      ],
    },
    flow: {
      heading: '按下保存之后发生了什么',
      nodes: {
        editor: '编辑器',
        editorNote: '你网站上的一个静态页面',
        api: 'GitHub API',
        apiNote: '从浏览器，用编辑者自己的令牌',
        actions: 'GitHub Actions',
        actionsNote: '你现有的构建流程',
        site: '你的网站',
        siteNote: 'Astro、Hugo，什么都行',
      },
      edges: { commit: '一个 commit：article.md + 图片', push: 'push 触发', deploy: '部署' },
      note:
        '草稿保存时会带上 <code>[skip ci]</code>，所以不会触发构建。如果文章打开期间别人也改了它，编辑器会把对方的版本和你的版本都给你，而不是让谁的改动消失。',
    },
    features: {
      heading: '它能做什么',
      items: [
        { title: '所见即所得，存出干净的 Markdown', body: '打开一篇旧文章再存一次，文件一个字节都不会变。不会多出 HTML，也不会被重新排版。' },
        { title: '图片不用先过一遍修图软件', body: '粘贴、拖进来，或者一次选好几张。在浏览器里压成 webp，然后裁剪、旋转、加图注、并排摆放、替换。' },
        { title: '表格就是表格', body: '加减行列、整列对齐，写进文件的是一张列宽对齐的 GFM 表格——中日文也一样齐。' },
        { title: '用你自己的版式预览', body: '文章由你的网站来渲染，可切桌面或手机宽度，连还没保存的改动和图片都算进去。' },
        { title: '草稿、发布、退回草稿', body: '标题、日期、标签、摘要。存草稿、发布、退回草稿、删掉草稿——全都只是普通的 commit。' },
        { title: '冲突是处理掉的，不是装作没有', body: '保存前会确认文件没在你背后被改动。真被改了，就让你在对方的版本和你的版本之间选。' },
        { title: '用 GitHub 账号登录', body: 'GitHub App 整页跳转，手机上也能用，令牌会自动续期——也可以直接粘贴一个细粒度访问令牌。' },
        { title: '三种界面语言', body: 'English、简体中文、日本語，当场切换。再加一种语言，只是多一个字符串文件。' },
        { title: '登录中转哪儿都能跑', body: '登录中转是一个没有依赖的单文件：Cloudflare Workers、Deno Deploy、Vercel、Netlify、Bun，或者你自己的 Node 服务器。' },
      ],
    },
    start: {
      heading: '装到网站上',
      lead: '四步，其中最费时间的是写一个配置文件。',
      steps: [
        { n: '1', title: '构建并安装编辑器', body: '装到网站任意一个静态目录里，于是地址就是 <code>/editor/</code>。升级还是这两条命令，你的 <code>config.json</code> 和 logo 不会被动。', code: install, codeLang: 'bash' },
        { n: '2', title: '写 config.json', body: '放在编辑器的 <code>index.html</code> 旁边。内容在哪、图片放哪、界面怎么称呼自己。', code: config, codeLang: 'json' },
        { n: '3', title: '部署登录中转', body: '一个文件，一个 GitHub App。文档里写的是 Cloudflare Workers，任何有 <code>fetch</code> 的环境都行。', code: null },
        { n: '4', title: '把编辑的人加进来', body: '一个 GitHub 账号、仓库的写权限、App 装在这个仓库上。权限模型就这么多。', code: null },
      ],
      formatHeading: '它写出来的文件',
      formatBody:
        '编辑器不认识的 frontmatter 字段会被原样保留，所以它能编辑你网站上已有的文章。新文章的文件名就是创建它的那一分钟。',
      format: frontmatter,
    },
    limits: {
      heading: '它不适合的地方',
      lead: 'README 里也写着，因为用上之后才发现更糟。',
      items: [
        '编辑的人需要 GitHub 账号。想让没账号的人也能写，就得自己跑一个登录服务。',
        '一个网站一个文章集合，字段就是上面那些。',
        '预览是在浏览器里转换 Markdown 的，所以你的网站单独加的 Markdown 插件不会体现在预览里。',
        'GitHub 令牌存在 <code>localStorage</code>——这是没有后端的编辑器通常要付的代价。请把它放在你自己控制的域名下。',
      ],
      more: '看完整的一节',
    },
    cta: { heading: '去看看代码', body: '三份 README、一套不联网的测试，以及一个下午能读完的两千来行代码。', button: 'AZQ1994/simple-git-cms' },
    footer: {
      license: 'MIT 许可',
      docs: '文档',
      links: [
        { label: 'README', href: `${REPO}/blob/main/README.zh-CN.md` },
        { label: '登录中转', href: `${REPO}/tree/main/auth` },
        { label: 'Astro 集成', href: `${REPO}/tree/main/integrations/astro` },
        { label: '版本发布', href: `${REPO}/releases` },
        { label: '参与贡献', href: `${REPO}/blob/main/CONTRIBUTING.md` },
        { label: '第三方许可', href: `${REPO}/blob/main/THIRD-PARTY-NOTICES.md` },
      ],
      langHeading: '语言',
    },
  },

  ja: {
    dir: 'ltr',
    meta: {
      title: 'Simple Git CMS — GitHub リポジトリをバックエンドにするコンテンツエディター',
      description:
        '静的サイト向けの WYSIWYG エディター。GitHub リポジトリの Markdown をブラウザーから直接読み書きします。自分のサーバーもデータベースも不要。MIT ライセンス。',
    },
    skip: '本文へスキップ',
    nav: { demo: 'デモ', quickstart: 'はじめ方', github: 'GitHub' },
    hero: {
      kicker: 'オープンソース · MIT',
      tagline: '書く人が使うエディター。<br>バックエンドは今あるリポジトリ。',
      lead:
        '記事は GitHub リポジトリの中の Markdown ファイルです。Simple Git CMS は静的なページ 1 枚で、書く人のブラウザーから GitHub API 経由でそれを読み書きします。<strong>自分のサーバーも、データベースも要りません。</strong>',
      primary: 'ブラウザーで試す',
      secondary: 'GitHub で見る',
      third: 'サイトへの入れ方',
      demoNote: 'デモはブラウザーの中にリポジトリをでっち上げます。ログイン不要、どこにも送信しません。',
      badges: ['Astro や Hugo などに', '保存 1 回 = コミット 1 つ', 'English · 简体中文 · 日本語'],
      shotAlt: 'キャプション付き画像のある記事を編集している Simple Git CMS エディター',
    },
    pillars: {
      heading: '手間が 3 つ消えます',
      items: [
        {
          title: '運用するものが増えない',
          body:
            'エディターはサイトの横に置くだけの静的なディレクトリです。話し相手は GitHub だけ。デプロイするバックエンドも、当てるパッチも、払う料金も、見張る対象もありません。',
        },
        {
          title: '権限はリポジトリの権限そのまま',
          body:
            'push できる人が編集できます。ユーザー表も、同期するロールも、権限を剥がす 2 つ目の場所もなし。誰が何を変えたかは、もともと git の履歴にあります。',
        },
        {
          title: '公開はコミット 1 つ',
          body:
            '記事と画像は 1 つのコミットとして入るので、今ある CI がそのままビルドしてデプロイします。公開したあとは、上のバーがその GitHub Actions の実行を追いかけます。',
        },
      ],
    },
    flow: {
      heading: '保存を押すと何が起きるか',
      nodes: {
        editor: 'エディター',
        editorNote: 'サイト上の静的なページ',
        api: 'GitHub API',
        apiNote: 'ブラウザーから、本人のトークンで',
        actions: 'GitHub Actions',
        actionsNote: '今あるビルド',
        site: 'あなたのサイト',
        siteNote: 'Astro、Hugo、なんでも',
      },
      edges: { commit: '1 コミット: article.md + 画像', push: 'push で', deploy: 'デプロイ' },
      note:
        '下書きの保存には <code>[skip ci]</code> が付くので、ビルドは走りません。開いている間に他の人が同じ記事を変えていた場合は、どちらかを失わせる代わりに、相手の版と自分の版を並べて選ばせます。',
    },
    features: {
      heading: 'できること',
      items: [
        { title: 'WYSIWYG なのに、きれいな Markdown', body: '既存の記事を開いて保存し直しても、ファイルは 1 バイトも変わりません。余計な HTML も、勝手な整形もなし。' },
        { title: '画像のために別のアプリを開かない', body: '貼る、落とす、まとめて選ぶ。ブラウザーで webp に圧縮してから、切り抜き・回転・キャプション・横並び・差し替え。' },
        { title: '表は表のまま', body: '行と列、列ごとの揃え方。ファイルには桁の揃った GFM の表として書き出されます。日本語でも崩れません。' },
        { title: '自分のレイアウトでプレビュー', body: '記事はあなたのサイト自身が描画します。デスクトップ幅と電話幅、まだ保存していない変更や画像も含めて。' },
        { title: '下書き、公開、下書きに戻す', body: 'タイトル・日付・タグ・要約。下書き保存、公開、下書きに戻す、削除——どれも普通のコミットです。' },
        { title: '衝突は見て見ぬふりをしない', body: '保存の前に、ファイルが裏で動いていないか確かめます。動いていたら、相手の版か自分の版かを選べます。' },
        { title: 'GitHub アカウントでログイン', body: 'GitHub App の全画面リダイレクトなので電話でも通ります。トークンは自動で更新。細粒度アクセストークンを貼る手もあります。' },
        { title: 'インターフェースは 3 言語', body: 'English、简体中文、日本語をその場で切り替え。4 つ目を足すのは文字列ファイル 1 枚です。' },
        { title: 'ログイン中継はどこでも動く', body: 'ログイン中継は依存ゼロの 1 ファイル。Cloudflare Workers、Deno Deploy、Vercel、Netlify、Bun、自前の Node サーバー。' },
      ],
    },
    start: {
      heading: 'サイトへの入れ方',
      lead: '4 ステップ。一番時間がかかるのは設定ファイルを書くところです。',
      steps: [
        { n: '1', title: 'エディターをビルドして入れる', body: 'サイトの静的ディレクトリのどこかへ。URL は <code>/editor/</code> になります。更新も同じ 2 コマンドで、<code>config.json</code> とロゴはそのまま残ります。', code: install, codeLang: 'bash' },
        { n: '2', title: 'config.json を書く', body: 'エディターの <code>index.html</code> の隣に。コンテンツの場所、画像の置き場所、インターフェースの名乗り方。', code: config, codeLang: 'json' },
        { n: '3', title: 'ログイン中継をデプロイ', body: '1 ファイルと GitHub App 1 つ。ドキュメントは Cloudflare Workers ですが、<code>fetch</code> がある環境ならどこでも。', code: null },
        { n: '4', title: '書く人を追加する', body: 'GitHub アカウント、リポジトリの書き込み権限、そのリポジトリに入れた App。権限の仕組みはこれだけです。', code: null },
      ],
      formatHeading: '書き出されるファイル',
      formatBody:
        'エディターが知らない frontmatter はそのまま残すので、すでにあるサイトの記事も編集できます。新しい記事のファイル名は、作った「分」です。',
      format: frontmatter,
    },
    limits: {
      heading: '向かない場合',
      lead: '後で気づくほうが困るので、README にも書いてあります。',
      items: [
        '書く人に GitHub アカウントが必要です。なしで入れたいなら、自前のログインサービスを持つことになります。',
        '1 サイトに 1 コレクション、項目は上のとおり。',
        'プレビューはブラウザーで Markdown を変換するため、サイト側だけに足した Markdown プラグインは反映されません。',
        'GitHub トークンは <code>localStorage</code> に置きます。バックエンドのないエディターでは普通の割り切りです。自分が管理するドメインから配信してください。',
      ],
      more: '全部を読む',
    },
    cta: { heading: 'コードを見てみる', body: 'README 3 本、ネットワークを使わないテスト、そして午後いっぱいで読み切れる 2,000 行ほど。', button: 'AZQ1994/simple-git-cms' },
    footer: {
      license: 'MIT ライセンス',
      docs: 'ドキュメント',
      links: [
        { label: 'README', href: `${REPO}/blob/main/README.ja.md` },
        { label: 'ログイン中継', href: `${REPO}/tree/main/auth` },
        { label: 'Astro 連携', href: `${REPO}/tree/main/integrations/astro` },
        { label: 'リリース', href: `${REPO}/releases` },
        { label: '開発に参加する', href: `${REPO}/blob/main/CONTRIBUTING.md` },
        { label: 'サードパーティ表記', href: `${REPO}/blob/main/THIRD-PARTY-NOTICES.md` },
      ],
      langHeading: '言語',
    },
  },
};
