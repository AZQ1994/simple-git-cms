# auth-worker：「用 GitHub 登录」中转

编辑器是纯静态页面，GitHub OAuth 需要一个持有 Client Secret 的地方换取令牌，这个 Cloudflare Worker 就做这件事，不存任何数据。

`index.js` 基于 [sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)（MIT，commit 16f7c4bc00），
加了**整页跳转模式**（代码里标了 `[simple-git-cms]`）：`/auth` 带 `redirect_uri` 时，登录后直接带着令牌跳回编辑器
（令牌在 `#` 后面，不会发给任何服务器），不依赖弹窗，手机浏览器也能用。原来的弹窗模式（Sveltia / Decap CMS 用）保留。

## 部署

1. **GitHub OAuth App**：GitHub → Settings → Developer settings → OAuth Apps → New
   - Homepage URL：网站地址
   - Authorization callback URL：`https://<worker 域名>/callback`
   - 生成 Client secret
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

一个 Worker 可以服务多个网站：把各自的域名都写进 `ALLOWED_DOMAINS` 即可（OAuth App 也可以共用）。
`metadata.json` 里的 `keep_bindings` 保证重新上传代码时不会清掉已设置的 Secret。

> 中国大陆的服务器访问不了 GitHub API 也没关系：这个 Worker 跑在 Cloudflare，编辑器在使用者的浏览器里直接连 GitHub。
