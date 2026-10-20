# Simple Git CMS

以 **GitHub 仓库为后端**的静态网站内容编辑器。文章是仓库里的 Markdown 文件，编辑器是一个纯静态页面，
在使用者的浏览器里直接通过 GitHub API 读写，**不需要自己的后端服务器和数据库**。

适合 Astro / Hugo 等静态网站：编辑者在网页上写文章、传图片、发布，背后是一次 git 提交，
再由 GitHub Actions 等 CI 自动构建上线。

## 功能

- 所见即所得的编辑（基于 TipTap），保存为干净的 Markdown；已有文章打开再保存内容不变
- 图片：粘贴 / 拖入 / 多选上传，浏览器里压缩成 webp；裁剪、旋转、说明、多张并排、替换
- 文章：标题、日期、标签、摘要、草稿 / 发布 / 撤回 / 删除草稿
- 保存：文章 + 新图片合成一个提交；文章在打开后被别人改过时提示冲突（载入对方版本 / 覆盖）
- 草稿保存自动加 `[skip ci]`，不触发部署；发布后在顶栏显示部署进度（读 GitHub Actions 状态）
- 登录：GitHub OAuth（整页跳转，手机可用），或 Fine-grained 访问令牌
- 权限：就是仓库权限，能推送的人才能编辑；谁改了什么都在 git 历史里

## 组成

| 目录 | 内容 |
|---|---|
| `src/` | 编辑器源码。`github.js`（GitHub 读写，可在 Node 里单独用）、`article.js`（文章格式）、`images.js`（压缩 / 裁剪）、`app.js`（界面） |
| `public/` | 页面、样式、`config.example.json` |
| `auth-worker/` | 「用 GitHub 登录」的 Cloudflare Worker（见其 README） |
| `integrations/astro/` | 网站端显示图片说明和并排的 rehype 插件 |
| `test/` | `npm test`，用假的 GitHub API 测试保存 / 冲突 / 重试，不访问网络 |

## 用到一个网站上

1. **构建并安装编辑器**

   ```bash
   npm install
   npm run build
   node scripts/install.mjs ../my-site/public/editor   # 复制到网站的静态目录，网址就是 /editor/
   ```

   安装只覆盖编辑器文件，不动目标目录里的 `config.json` 和 `logo.png`。升级时重复这两步。

2. **写 `config.json`**（放在编辑器同目录，参照 `config.example.json`）

   | 字段 | 说明 |
   |---|---|
   | `title` / `siteName` / `logo` | 界面上的名称和 logo |
   | `repo` / `branch` | 内容所在的仓库 |
   | `siteUrl` | 网站地址，用于「在网站查看」；编辑器不在网站同域名下时也用来加载图片 |
   | `timeZone` | 日期显示和图片目录用的时区 |
   | `auth.base` | 登录中转 Worker 的地址 |
   | `collection.dir` | 文章目录（仓库内路径），每篇文章一个 `<id>.md` |
   | `collection.url` | 文章网址，`{id}` 会被替换 |
   | `media.dir` / `media.url` | 图片在仓库里的目录 / 在网站上的路径前缀，新图片放在 `<日期>/` 子目录 |
   | `media.maxWidth` / `media.quality` | 上传时压缩的最大宽度和 webp 质量 |
   | `deploy.skipCiForDrafts` | 草稿保存时加 `[skip ci]`（默认 true） |

3. **部署登录中转**：见 `auth-worker/README.md`。
4. **网站端**：见 `integrations/astro/README.md`（图片说明和并排的显示）。
5. **编辑者**：需要 GitHub 账号，并加为仓库的协作者（Write 权限）。

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
npm run build
```

在 localhost 打开编辑器时，可以设置 `localStorage['simple-git-cms-api']` 把 GitHub API 指到本地代理，方便测试。

## 已知限制

- 编辑者必须有 GitHub 账号（不想用 GitHub 账号的话，需要再加一层自己的登录服务，以 GitHub App 身份提交）
- 每个网站一个文章集合，字段固定为上面几项
- 草稿只能在编辑器里看，网站上没有草稿预览
- 外部图片地址（从别的网页粘贴来的）会被拒绝保存，需要下载后重新上传
