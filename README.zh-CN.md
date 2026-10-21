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

## 组成

| 目录 | 内容 |
|---|---|
| `src/` | 编辑器源码。`github.js`（GitHub 读写，可在 Node 里单独用）、`article.js`（文章格式）、`images.js`（压缩 / 裁剪）、`i18n/`（界面语言）；界面拆成 `store.js`、`dom.js`、`lang.js`、`auth.js`、`list.js`、`editor.js`、`doc.js`、`preview-ui.js`，`app.js` 只负责读配置和启动 |
| `public/` | 页面、样式、`config.example.json` |
| `auth/` | 「用 GitHub 登录」的中转。一个没有依赖的文件，可以跑在 Cloudflare Workers、Deno Deploy、Vercel、Netlify、Bun 或自己的 Node 服务器上（见[说明](auth/README.zh-CN.md)） |
| `integrations/astro/` | 网站端显示图片说明和并排的 rehype 插件（见[说明](integrations/astro/README.md)） |
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
| `media.dir` / `media.url` | 图片在仓库里的目录 / 在网站上的路径前缀，新图片放在 `<日期>/` 子目录 |
| `media.maxWidth` / `media.quality` | 上传时压缩的最大宽度和 webp 质量 |
| `preview.url` | 网站上的预览页（见下面第 4 步），不填则没有「预览」按钮 |
| `deploy.skipCiForDrafts` | 草稿保存时加 `[skip ci]`（默认 true） |

### 3. 部署登录中转

见 [auth/README.zh-CN.md](auth/README.zh-CN.md)。文档里用的是 Cloudflare Workers，但中转只用标准的 Web API，
Deno Deploy、Vercel、Netlify、Bun 和普通的 Node 服务器都能跑。

### 4. 网站端

图片说明和并排的显示见 [integrations/astro/README.md](integrations/astro/README.md)。

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

## 已知限制

- 编辑者必须有 GitHub 账号（不想用 GitHub 账号的话，需要再加一层自己的登录服务，以 GitHub App 身份提交）
- 每个网站一个文章集合，字段固定为上面几项
- 预览是在浏览器里转换 Markdown，网站另外加的 Markdown 插件不会体现在预览里
- 外部图片地址（从别的网页粘贴来的）会被拒绝保存，需要下载后重新上传
- GitHub 令牌存在 `localStorage` 里。这是「没有后端的编辑器」的通常取舍：
  任何能往编辑器所在域名注入脚本的人都能读到它。请把编辑器放在自己能控制的域名下，
  不要在同一个域名上放来路不明的脚本。

## 许可证

[MIT](LICENSE)。`auth/` 基于
[sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)，
其 MIT 声明保留在 [auth/LICENSE](auth/LICENSE)；打包进来的依赖列在
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
