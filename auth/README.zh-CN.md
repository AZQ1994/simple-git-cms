# auth —— “用 GitHub 登录”的中转

[English](README.md) · **简体中文** · [日本語](README.ja.md)

编辑器是一个静态页面，而 GitHub 的 OAuth 交换需要一个地方存放 client secret。这个中转就只干这件
事：拿 OAuth code 换一个 token，再交回给编辑器。它什么都不存。

`index.js` 基于 [sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)（MIT，
commit `16f7c4bc00`）——见 [LICENSE](LICENSE)。增加的部分在源码里用 `[simple-git-cms]` 标出：
**整页跳转模式**和**令牌续期**。当 `/auth` 带着 `redirect_uri` 被调用时，登录结束后会跳回编辑器，
token 放在 URL 的片段里（`#` 后面，所以永远不会发给任何服务器），而不是依赖弹窗——手机上登录能用
就是因为这个。原来的弹窗模式（Sveltia CMS 和 Decap CMS 用的那种）仍然可用。

## 能跑在哪儿

`index.js` 只用标准 Web API —— `Request`、`Response`、`fetch`、`crypto` —— 配置从一个普通对象里
读。一个文件，没有依赖，所以原封不动就能跑在：

| 平台 | 入口 | 配置来自 |
|---|---|---|
| Cloudflare Workers | `index.js`（默认导出） | Worker 的绑定和密钥 |
| Deno Deploy | `index.js`（默认导出） | `Deno.env` |
| Vercel / Netlify 边缘函数 | `index.js`（默认导出） | `process.env` |
| Bun | `index.js`（默认导出） | `process.env` |
| Node、你自己的服务器 | `server.js` | `process.env` |

下面的步骤用 Cloudflare Workers，因为免费额度做这件事绰绰有余，而且在 GitHub 本身不通的地方也能
访问到。编辑器不依赖这个选择——`config.json` 里的 `auth.base` 指向你最后拿到的那个地址就行。

## 1. 创建 GitHub App

GitHub → Settings → Developer settings → GitHub Apps → New。

- **Homepage URL**：你的网站。**Callback URL**：`https://<中转的域名>/callback`
- **Expire user authorization tokens**：保持勾选——编辑器会自动续期
- **Webhook**：把 Active 取消勾选
- **Repository permissions**：**Contents: Read and write**，以及 **Actions: Read-only**（让编辑器
  能显示部署进度）。其他一个都不要。config.json 里有 `actions` 时例外：执行按钮要运行 workflow，
  Actions 要选 **Read and write**。
- **Where can this GitHub App be installed**：如果仓库属于某个组织，选 Any account
- 生成一个 client secret，然后 **Install App**，只挑放内容的那个仓库

这样签出来的 token **只能碰到 App 被安装到的那些仓库**，而且只有上面那两项权限。用 OAuth App 也
能跑，但它只能要 `repo` 这个很宽的 scope，那会覆盖这个人能 push 的*每一个*仓库——不推荐。

## 2. 部署

在你部署的地方设三个变量：`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`（两个都是密钥）、以及
`ALLOWED_DOMAINS` —— 允许使用这个中转的域名，逗号分隔，可以用通配符（`*`）。只有这些域名上的页面
能发起登录或者续期令牌。

**Cloudflare Workers.** 把 `metadata.example.json` 复制成 `metadata.json`，把你的域名填进
`ALLOWED_DOMAINS`，然后上传：

```bash
curl -X PUT -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/<name>" \
  -F "metadata=@metadata.json;type=application/json" \
  -F "index.js=@index.js;type=application/javascript+module"
```

或者用 wrangler：`wrangler deploy index.js --name <name> --compatibility-date 2025-09-01`，然后
`wrangler secret put GITHUB_CLIENT_ID`，密钥同理。`metadata.json` 里的 `keep_bindings` 保证你上传
新代码时密钥不会被清掉。

**Deno Deploy / Vercel / Netlify / Bun.** 让项目指向 `index.js`，在控制台里设那三个变量。不用构建，
没有依赖。

**你自己的服务器.** `node auth/server.js`，三个变量放环境变量里，想换端口就设 `PORT`（默认 8788）。
前面放一个做 TLS 终止的反向代理——OAuth 的回调必须是 `https`。

**放在网站的某个路径下，不单独占域名.** 中转可以和网站共用域名，比如 `https://example.com/cms-auth`。
把 `PUBLIC_URL` 设成这个地址：中转就在这个路径下应答（反向代理去不去掉前缀都行），回调地址是
`https://example.com/cms-auth/callback`（GitHub App 的 Callback URL 要填这个），cookie 也只在这个路径下。nginx：

```nginx
location /cms-auth/ {
    proxy_pass http://127.0.0.1:8788;
}
```

反向代理把请求以 `http` 转给中转、回调地址算错的时候，也是设 `PUBLIC_URL` 来解决。这种方式要用你自己的服务器：
边缘运行环境只能用在它自己托管的域名上。

最后给中转一个域名（或上面的路径），把它写进编辑器 `config.json` 的 `auth.base`。

一个中转可以服务好几个站点：把每个域名都列进 `ALLOWED_DOMAINS`，并且把 GitHub App 装到每个仓库上。
这些站点共用一个 App：从任何一个站点登录拿到的令牌，都能访问 App 装过的、这个人有写权限的所有仓库；
列出的任何一个域名被注入了脚本，都能借它发起登录。测试站、归属不同的站点，请各用一套中转和 App。

## 从 npm 包里用

用 `npm install --save-dev simple-git-cms` 装了编辑器的网站，中转已经在
`node_modules/simple-git-cms/auth/` 里了，不用复制，也不用构建。下面几种方式挑一种，命令都在网站
自己的目录里跑。每种方式的结尾都一样：中转有了一个地址，GitHub App 的 **Callback URL** 填这个地址
加上 `/callback`，编辑器 `config.json` 的 `auth.base` 填这个地址本身。升级这个包
（`npm update simple-git-cms`）时中转会跟着编辑器一起更新；更新日志里提到中转时，用同样的方式再部署一次。

### Cloudflare Workers

在网站的 `package.json` 旁边放一个 `wrangler.auth.toml`（单独一个文件，免得和网站可能已有的
`wrangler.toml` 撞上）：

```toml
name = "cms-auth"
main = "node_modules/simple-git-cms/auth/index.js"
compatibility_date = "2025-09-01"

[vars]
ALLOWED_DOMAINS = "example.com"

# 可选：用自己的域名，而不是 cms-auth.<账号>.workers.dev
# routes = [{ pattern = "cms-auth.example.com", custom_domain = true }]
```

然后登录一次 Cloudflare，部署，再设两个密钥：

```bash
npx wrangler login
npx wrangler deploy --config wrangler.auth.toml
npx wrangler secret put GITHUB_CLIENT_ID --config wrangler.auth.toml
npx wrangler secret put GITHUB_CLIENT_SECRET --config wrangler.auth.toml
```

`deploy` 会打印出地址。之后再部署，密钥都还在；`ALLOWED_DOMAINS` 以这个文件为准，要改就改文件。
可以在网站的 `package.json` 里加一个脚本：

```json
"scripts": {
  "deploy:auth": "wrangler deploy --config wrangler.auth.toml"
}
```

在 CI 里跑的话，环境变量里放 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`，就不用 `wrangler login`。

### Netlify（网站托管在那里）

中转跟着网站一起部署，放在网站的某个路径下。`netlify/edge-functions/cms-auth.js`：

```js
import relay from 'simple-git-cms/auth';

export default (request) => relay.fetch(request, Netlify.env.toObject());
export const config = { path: '/cms-auth/*' };
```

在 Site configuration → Environment variables 里设 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、
`ALLOWED_DOMAINS` 和 `PUBLIC_URL=https://example.com/cms-auth`，然后照常部署网站。地址是
`https://example.com/cms-auth`。

### Vercel（网站托管在那里）

同样是网站里的一个函数。`api/cms-auth/[...path].js`：

```js
import relay from 'simple-git-cms/auth';

export default { fetch: (request) => relay.fetch(request, process.env) };
```

在 Project Settings → Environment Variables 里设同样四个变量，其中
`PUBLIC_URL=https://example.com/api/cms-auth`，然后部署。地址是 `https://example.com/api/cms-auth`。

### 你自己的服务器

包自带的命令会启动 `server.js`，配置从环境变量读：

```bash
GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… ALLOWED_DOMAINS=example.com \
  PUBLIC_URL=https://example.com/cms-auth npx simple-git-cms auth
```

它监听 8788 端口（改端口设 `PORT`）。用服务器上已经在用的方式让它一直跑着——systemd、pm2
（`pm2 start "npx simple-git-cms auth" --name cms-auth`）、容器都行——变量放进它的环境里，不要写在
命令行上；前面放上[部署](#2-部署)里那个反向代理来提供 `https`。地址就是 `PUBLIC_URL`；如果中转单独
占一个域名，就是反向代理的那个域名。

### 其他地方

`simple-git-cms/auth` 就是处理函数 `relay.fetch(request, env)`，能用 `Request` 和 `Response` 的运行
环境都能用——Deno（`Deno.serve((request) => relay.fetch(request, Deno.env.toObject()))`）、Bun，或者
网站已有的服务器的某个路由。

## 登录不成功的时候

几乎所有失败都是这四件事之一，而且它们都不会给出有用的报错：

- **Callback URL 必须完全一致**，包括 `https://` 和 `/callback` 这段路径，而且它是*中转*的域名，
  不是你网站的域名。
- **App 必须被安装到仓库上**，这和创建 App 是两回事。创建 App 本身不会给它任何访问权限。如果仓库
  属于组织，还需要组织的 owner 批准这次安装。
- **编辑的人自己也要有仓库的写权限。** App 决定一个 token *可以*碰到什么；这个人自己的权限决定他
  能拿它做什么。编辑器在登录时会检查，不通过会直接说。
- **编辑器所在的域名必须在 `ALLOWED_DOMAINS` 里**，否则中转会拒绝发起登录。这一条最容易在你把编辑
  器换到新域名之后绊住你。

如果你不勾 **Expire user authorization tokens**，登录照样能用，但 GitHub 不会签发 refresh token：
那个 token 会一直留在浏览器里直到有人退出登录。勾上是更划算的取舍。

## 令牌续期

GitHub App 的用户令牌 8 小时过期。登录时中转会连同 access token 一起给编辑器一个 `refresh_token`；
access token 过期后，编辑器会 POST 到 `/refresh` 换一个新的，然后把刚才那个请求重试一遍，所以正在
编辑的东西不会丢。`/refresh` 只回应来自 `ALLOWED_DOMAINS` 的页面。refresh token 在闲置六个月后失
效，之后需要重新登录一次。

## 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` | `/auth`（或 `/oauth/authorize`） | 开始登录。带 `redirect_uri` 就走整页跳转模式。 |
| `GET` | `/callback`（或 `/oauth/redirect`） | OAuth 回调；把 token 交给编辑器。 |
| `POST` | `/refresh` | 用 refresh token 换一个新的 access token。 |

设了 `PUBLIC_URL` 时，这些路径都在它的路径下，比如 `/cms-auth/auth`。
