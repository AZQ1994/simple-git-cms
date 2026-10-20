# auth-worker：「用 GitHub 登录」中转

编辑器是纯静态页面，GitHub OAuth 需要一个持有 Client Secret 的地方换取令牌，这个 Cloudflare Worker 就做这件事，不存任何数据。

`index.js` 基于 [sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)（MIT，commit 16f7c4bc00），
加了**整页跳转模式**和**令牌续期**（代码里标了 `[simple-git-cms]`）：`/auth` 带 `redirect_uri` 时，登录后直接带着令牌跳回编辑器
（令牌在 `#` 后面，不会发给任何服务器），不依赖弹窗，手机浏览器也能用。原来的弹窗模式（Sveltia / Decap CMS 用）保留。

## 部署

1. **GitHub App**（推荐）：GitHub → Settings → Developer settings → GitHub Apps → New
   - Homepage URL：网站地址；Callback URL：`https://<worker 域名>/callback`
   - Expire user authorization tokens：保持勾选（编辑器会用 refresh_token 自动续期，见下）
   - Webhook：取消 Active
   - Repository permissions：**Contents: Read and write**、**Actions: Read-only**（看部署进度），其余不开
   - Where can this GitHub App be installed：要装到组织的仓库就选 Any account
   - 生成 Client secret，然后 Install App → 只选网站的仓库

   这样登录令牌**只能访问安装了 App 的仓库**，且只有上面两项权限。
   也可以用 OAuth App，但它只能申请 `repo` 权限，令牌能访问登录者的**全部**仓库，不推荐。
2. **Worker**：复制 `metadata.example.json` 为 `metadata.json`，`ALLOWED_DOMAINS` 写编辑器所在的域名（逗号分隔，可用 `*`），然后上传：

   ```bash
   curl -X PUT -H "Authorization: Bearer $CF_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/<名字>" \
     -F "metadata=@metadata.json;type=application/json" \
     -F "index.js=@index.js;type=application/javascript+module"
   ```

   或者用 wrangler：`wrangler deploy index.js --name <名字> --compatibility-date 2025-09-01`
3. **Secret**：`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`（`wrangler secret put`，或 Cloudflare 后台 → Worker → Settings → Variables and Secrets）
4. 给 Worker 绑一个自定义域名，填到编辑器 `config.json` 的 `auth.base`

一个 Worker 可以服务多个网站：把各自的域名都写进 `ALLOWED_DOMAINS` 即可（GitHub App 装到各自的仓库即可共用）。

## 令牌续期

GitHub App 的登录令牌 8 小时过期。登录时 Worker 把 `refresh_token` 一起交给编辑器；令牌过期后，
编辑器向 `POST /refresh` 换新令牌并重试原来的请求，编辑中的内容不受影响。`/refresh` 只接受
`ALLOWED_DOMAINS` 里的网页发来的请求。refresh_token 半年不用才会失效，那时需要重新登录。
`metadata.json` 里的 `keep_bindings` 保证重新上传代码时不会清掉已设置的 Secret。

> 中国大陆的服务器访问不了 GitHub API 也没关系：这个 Worker 跑在 Cloudflare，编辑器在使用者的浏览器里直接连 GitHub。
