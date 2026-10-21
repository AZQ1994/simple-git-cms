# Simple Git CMS

[English](README.md) · **简体中文** · [日本語](README.ja.md)

![Simple Git CMS 编辑器：正在编辑一篇带图片说明的文章](docs/screenshot.png)

**[在浏览器里试一下](https://simple-git-cms.azq1994.com/demo/)** — 就是这个编辑器本身，只是用 Service Worker 冒充了 GitHub。不用登录任何账号。

以 **GitHub 仓库为后端**的静态网站内容编辑器。文章是仓库里的 Markdown 文件，编辑器是一个纯静态页面，
在使用者的浏览器里直接通过 GitHub API 读写，**不需要自己的后端服务器和数据库**。

适合 Astro / Hugo 等静态网站：编辑者在网页上写文章、传图片、发布，背后是一次 git 提交，
再由 GitHub Actions 等 CI 自动构建上线。

## 功能

- 所见即所得的编辑（基于 TipTap），保存为干净的 Markdown；已有文章打开再保存内容不变
- 图片：粘贴 / 拖入 / 多选上传，浏览器里压缩成 webp；裁剪、旋转、说明、多张并排、替换
- 表格：加减行列，整列左 / 居中 / 右对齐；写进文件的是对齐整齐的 GFM 表格
- 附件：PDF 之类的文件原样进仓库（不压缩），在正文里按原来的文件名插入成链接，大小上限自己定
- 不认识的内容不会被悄悄丢掉：文件里编辑器没有按钮的东西——嵌入的视频、残留的 `<div>`、
  网站自己展开的组件——会显示成一个可以直接改源码的 HTML 块，保存时原样写回
- 封面图：在文章信息栏里上传、更换、裁剪、删除，写进你指定的 frontmatter 字段——就是网站用来
  做列表缩略图和分享图的那张
- 文章：标题、日期、标签、摘要、草稿 / 发布 / 撤回 / 删除草稿。打开的是哪一篇写在地址栏里，所以
  刷新会回到原处，这个地址也可以直接发给另一个能登录的人
- 保存：文章 + 新图片合成一个提交；文章在打开后被别人改过时提示冲突（载入对方版本 / 覆盖）
- 没提交的东西不会丢：边写边存一份在浏览器里（包括还没上传的图片），浏览器崩了、标签页误关、刷新
  之后会问你要不要恢复
- 预览：在编辑器里直接看文章在网站上的样子（电脑 / 手机宽度），未保存的内容和图片也能看
- 草稿保存自动加 `[skip ci]`，不触发部署；发布后在顶栏显示部署进度（读 GitHub Actions 状态）
- 登录：用 GitHub App 登录（整页跳转，手机可用；令牌只能访问装了 App 的仓库，过期自动续期），或 Fine-grained 访问令牌
- 权限：就是仓库权限，能推送的人才能编辑；谁改了什么都在 git 历史里
- 界面支持英文、简体中文、日文，可随时切换
- 浅色 / 深色：跟随系统，也可以自己定

## 组成

| 目录 | 内容 |
|---|---|
| `src/` | 编辑器源码。`github.js`（GitHub 读写，可在 Node 里单独用）、`article.js`（文章格式）、`images.js`（压缩 / 裁剪）、`i18n/`（界面语言）；界面拆成 `store.js`、`dom.js`、`lang.js`、`auth.js`、`list.js`、`editor.js`、`doc.js`、`preview-ui.js`；`schema.js` 规定正文能放什么、以及怎么写回 Markdown，`app.js` 只负责读配置和启动 |
| `public/` | 页面、样式、`config.example.json` |
| `auth/` | 「用 GitHub 登录」的中转。一个没有依赖的文件，可以跑在 Cloudflare Workers、Deno Deploy、Vercel、Netlify、Bun 或自己的 Node 服务器上（见[说明](auth/README.zh-CN.md)） |
| `integrations/astro/` | 网站端显示图片说明和并排的 rehype 插件（见[说明](integrations/astro/README.zh-CN.md)） |
| `test/` | `npm test`，用假的 GitHub API 测试保存 / 冲突 / 重试，并检查翻译是否齐全，不访问网络。`npm run test:e2e` 则在真实浏览器里驱动构建出来的编辑器（[详情](test/e2e/README.md)） |
| `www/` | 项目自己的站点 [simple-git-cms.azq1994.com](https://simple-git-cms.azq1994.com)（[详情](www/README.md)） |

## 用到一个网站上

### 1. 构建并安装编辑器

```bash
npm install
npm run build
node scripts/install.mjs ../my-site/public/editor   # 复制到网站的静态目录，网址就是 /editor/
```

安装只覆盖编辑器文件，不动目标目录里的 `config.json` 和 `logo.png`。升级时重复这两步。

### 2. 写 `config.json`

放在编辑器同目录，参照 `config.example.json`。

| 字段 | 说明 |
|---|---|
| `title` / `siteName` / `logo` | 界面上的名称和 logo |
| `lang` | 界面的初始语言：`en` / `zh` / `ja`。不填就跟随浏览器；使用者自己在菜单里选过的优先 |
| `repo` / `branch` | 内容所在的仓库 |
| `siteUrl` | 网站地址，用于「在网站查看」；编辑器不在网站同域名下时也用来加载图片 |
| `timeZone` | 日期显示、图片目录和新文章编号用的时区 |
| `auth.base` | 登录中转的地址 |
| `collection.dir` | 文章目录（仓库内路径），每篇文章一个 `<id>.md` |
| `collection.url` | 文章网址，`{id}` 会被替换 |
| `collection.imageField` | 封面图写在 frontmatter 的哪个字段，比如 `image`。不填就没有封面图这个控件 |
| `media.dir` / `media.url` | 图片在仓库里的目录 / 在网站上的路径前缀，新图片放在 `<日期>/` 子目录 |
| `media.maxWidth` / `media.quality` | 上传时压缩的最大宽度和 webp 质量 |
| `media.maxFileMB` | 附件大小上限，单位 MB（默认 20） |
| `preview.url` | 网站上的预览页（见下面第 4 步），不填则没有「预览」按钮 |
| `deploy.skipCiForDrafts` | 草稿保存时加 `[skip ci]`（默认 true） |

`config.schema.json` 会一起装在它旁边，所以认 JSON Schema 的编辑器会给出补全，拼错了当场标出来。
编辑器自己在启动时也会检查这个文件，并且一次把所有问题都列出来——包括它不认识的配置项，那种以前
是被静默忽略的。

### 3. 部署登录中转

见 [auth/README.zh-CN.md](auth/README.zh-CN.md)。文档里用的是 Cloudflare Workers，但中转只用标准的 Web API，
Deno Deploy、Vercel、Netlify、Bun 和普通的 Node 服务器都能跑。

### 4. 网站端

图片说明和并排的显示见 [integrations/astro/README.zh-CN.md](integrations/astro/README.zh-CN.md)。

要用预览，在网站上加一个预览页：用文章页同样的排版，引入
[`integrations/preview-client.js`](integrations/preview-client.js)，在
`connectPreview(article => …)` 里把标题、日期、标签和 `article.html` 填进去。
编辑器把正文按网站相同的流程（remark-gfm、smartypants、rehype-figures）转成 HTML 发过去，
预览页只负责显示。

### 5. 编辑者

需要 GitHub 账号，并加为仓库的协作者（Write 权限）；GitHub App 要安装到这个仓库。

## 文章格式

```markdown
---
title: "标题"
description: "摘要（可省略，省略时取正文开头）"
date: 2026-10-21T03:00:00.000Z
tags: ["标签1", "标签2"]
draft: true            # 草稿时才有
---

正文（Markdown）。![](/uploads/20261021/abc.webp "图片说明")
```

frontmatter 里编辑器不认识的字段会原样保留。新文章的文件名（即 id）是创建时的「年月日时分」。

正文里编辑器不认识的东西——`<iframe>`、`<div>`、HTML 注释、网站自己展开的组件——会被当成一块
原始 HTML，保存时原样写回。它在编辑器里显示成一个带源码的框，这也是往文章里放工具条没有的东西
的办法。

正文里的表格就是普通的 GFM 表格。能放进表格的，也只有 GFM 能表达的那些：一行表头、每格一行文字，
单元格不能合并。手写的表格第一次保存时会被重新排版一次（按列宽补空格，冒号跟着列宽走），之后再
保存就不会再动。网站那边不需要装任何东西，Astro 等默认就带 remark-gfm，只是要自己写表格的样式。

## 本地开发

```bash
npm install
npm test
npm run dev     # 构建并在 http://localhost:4173 打开编辑器
```

`npm run dev` 第一次会在仓库根目录用示例生成 `dev.config.json`（已 gitignore），把它指向一个
真实仓库才能编辑。每次构建后都会复制进 `dist/`，所以重新构建不会丢。
在 localhost 打开编辑器时，还可以设置 `localStorage['simple-git-cms-api']` 把 GitHub API 指到本地代理。

增删依赖之后要重新跑一次 `npm run licenses`，它会按实际打包进去的包重新生成
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)，CI 会检查这个文件有没有过期。

### 翻译

每种语言在 `src/i18n/` 下是一个平铺的字符串文件：`en.js`、`zh.js`、`ja.js`。
要加一种语言，复制 `en.js` 翻译内容，再加进 `src/i18n/index.js` 的 `locales`。
键少了、多了、为空，或者 `{占位符}` 和英文对不上，测试都会报错，所以不会漏翻译。

## 把编辑器锁紧一点

令牌放在 `localStorage` 里，所以任何能在编辑器这个地址上跑脚本的东西都能读到它——而那个令牌有你
仓库的写权限。Content-Security-Policy 响应头就是用来堵这条路的：除了编辑器自己的文件，什么都不
许执行。

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

放进文件时它是一行，这里拆开只是为了好读。把 `https://cms-auth.example.com` 换成你自己的中转；
如果编辑器和网站不在同一个域名下，还要把网站的地址加进 `img-src` 和 `frame-src`。

| 指令 | 为什么 |
|---|---|
| `default-src 'none'` | 先全部拒绝，再一行一行放开 |
| `script-src 'self'` | 最关键的一条。只有编辑器自己的文件会跑——注入进来的 `<script>`，不管是不是内联，都不起作用 |
| `style-src … 'unsafe-inline'` | 躲不掉：TipTap 和裁剪组件会往元素上写 `style` 属性。它比脚本的同名放宽弱得多，CSS 读不到 `localStorage` |
| `img-src … avatars.githubusercontent.com` | 登录者的头像是从 GitHub 拿的 |
| `connect-src` | 编辑器只许连 GitHub API 和你的中转，别的一概不行 |
| `frame-src 'self'` | 预览的 iframe 装的是你自己的站点 |
| `frame-ancestors 'none'` | 谁都不许把编辑器嵌进自己的页面 |

`'unsafe-eval'` 和脚本的 `'unsafe-inline'` 都不需要——页面里没有内联脚本，打包文件里也没有
`eval`。`npm run test:e2e` 就是在这份策略下跑编辑器的，所以哪天有改动把它弄坏了，CI 会先发现。

编辑器装在 `/editor/` 的话，放在哪里：

```
# Cloudflare Pages、Cloudflare Workers 静态资源、Netlify —— 站点根目录下的 _headers 文件
/editor/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; …
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

nginx：在 `location /editor/` 里写 `add_header Content-Security-Policy "…" always;`。Apache：在
`<Location "/editor/">` 里写 `Header always set Content-Security-Policy "…"`。Vercel：在
`vercel.json` 的 `headers` 里加一条。要是响应头根本改不了，在编辑器的 `index.html` 里放一个
`<meta http-equiv>` 也能顶上大半——但 `frame-ancestors` 在 meta 里是无效的。

**它解决不了什么。** 挡不住被改过的 `app.js`，挡不住能改你服务器上文件的人，也挡不住浏览器扩展。
令牌还是在 `localStorage` 里；这一条堵住的是最常见的那条路，不是唯一一条。

## 已知限制

- 编辑者必须有 GitHub 账号（不想用 GitHub 账号的话，需要再加一层自己的登录服务，以 GitHub App 身份提交）
- 每个网站一个文章集合，字段固定为上面几项
- 预览是在浏览器里转换 Markdown，网站另外加的 Markdown 插件不会体现在预览里
- 外部图片地址（从别的网页粘贴来的）会被拒绝保存，需要下载后重新上传
- GitHub 令牌存在 `localStorage` 里。这是「没有后端的编辑器」的通常取舍：
  任何能往编辑器所在域名注入脚本的人都能读到它。请把编辑器放在自己能控制的域名下，
  不要在同一个域名上放来路不明的脚本，并给它配上[把编辑器锁紧一点](#把编辑器锁紧一点)里的那份策略。

## 许可证

[MIT](LICENSE)。`auth/` 基于
[sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)，
其 MIT 声明保留在 [auth/LICENSE](auth/LICENSE)；打包进来的依赖列在
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
