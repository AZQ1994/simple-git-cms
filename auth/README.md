# auth — the “Sign in with GitHub” relay

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

The editor is a static page, and GitHub's OAuth exchange needs somewhere that holds the client
secret. That is all this is: a small request handler that trades an OAuth code for a token and
hands it back to the editor. It stores nothing.

`index.js` is based on [sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)
(MIT, commit `16f7c4bc00`) — see [LICENSE](LICENSE). The additions are marked `[simple-git-cms]` in the
source: a **full-page redirect mode** and **token refresh**. When `/auth` is called with a
`redirect_uri`, sign-in ends by redirecting back to the editor with the token in the URL fragment
(after `#`, so it is never sent to any server) instead of relying on a popup — which is what makes
sign-in work on phones. The original popup mode (used by Sveltia CMS and Decap CMS) still works.

## Where it can run

`index.js` only uses standard web APIs — `Request`, `Response`, `fetch`, `crypto` — and reads its
settings from a plain object. It is one file with no dependencies, so it runs unchanged on:

| Host | Entry point | Settings come from |
|---|---|---|
| Cloudflare Workers | `index.js` (default export) | Worker bindings and secrets |
| Deno Deploy | `index.js` (default export) | `Deno.env` |
| Vercel / Netlify edge functions | `index.js` (default export) | `process.env` |
| Bun | `index.js` (default export) | `process.env` |
| Node, your own server | `server.js` | `process.env` |

Cloudflare Workers is what the steps below use because its free tier covers this comfortably and it
is reachable from places where GitHub itself is not. Nothing in the editor depends on that choice —
`config.json` just points `auth.base` at whatever URL you end up with.

## 1. Create the GitHub App

GitHub → Settings → Developer settings → GitHub Apps → New.

- **Homepage URL**: your site. **Callback URL**: `https://<your-relay-domain>/callback`
- **Expire user authorization tokens**: leave checked — the editor refreshes tokens automatically
- **Webhook**: uncheck Active
- **Repository permissions**: **Contents: Read and write**, and **Actions: Read-only** (so the
  editor can show deployment progress). Nothing else.
- **Where can this GitHub App be installed**: choose Any account if the repository belongs to an
  organization
- Generate a client secret, then **Install App** and pick only the repository holding your content

A token minted this way **can only reach the repositories the App is installed on**, and only with
those two permissions. An OAuth App works too, but it can only ask for the broad `repo` scope,
which reaches *every* repository the person can push to — not recommended.

## 2. Deploy

Set three variables wherever you deploy: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (both secret),
and `ALLOWED_DOMAINS` — a comma-separated list of the domains allowed to use the relay, wildcards
(`*`) permitted. Only pages on those domains can start a sign-in or refresh a token.

**Cloudflare Workers.** Copy `metadata.example.json` to `metadata.json`, put your domains in
`ALLOWED_DOMAINS`, and upload:

```bash
curl -X PUT -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/<name>" \
  -F "metadata=@metadata.json;type=application/json" \
  -F "index.js=@index.js;type=application/javascript+module"
```

Or with wrangler: `wrangler deploy index.js --name <name> --compatibility-date 2025-09-01`, then
`wrangler secret put GITHUB_CLIENT_ID` and the same for the secret. The `keep_bindings` entry in
`metadata.json` keeps your secrets in place when you upload new code.

**Deno Deploy / Vercel / Netlify / Bun.** Point the project at `index.js` and set the three
variables in the dashboard. No build step, no dependencies.

**Your own server.** `node auth/server.js`, with the three variables in the environment and
`PORT` if you want something other than 8788. Put it behind a reverse proxy that terminates TLS —
the OAuth callback has to be `https`.

**Under your site's path instead of a domain of its own.** The relay can share the site's domain,
e.g. at `https://example.com/cms-auth`. Set `PUBLIC_URL` to that address: the relay then answers
under that path (whether or not the proxy strips it), sends the browser back to
`https://example.com/cms-auth/callback` — which is what the GitHub App's Callback URL has to be —
and keeps its cookies to that path. With nginx:

```nginx
location /cms-auth/ {
    proxy_pass http://127.0.0.1:8788;
}
```

`PUBLIC_URL` is also the fix when a proxy hands the relay plain `http` and the callback comes out
wrong. This needs your own server: an edge runtime only gets a path on a domain it serves.

Finally, give the relay a domain name (or the path above) and put it in the editor's `config.json`
as `auth.base`.

One relay can serve several sites: list every domain in `ALLOWED_DOMAINS` and install the GitHub
App on each repository. They then share one App, so a token signed in from any of them reaches
every repository it is installed on that the person can write to, and a script injected into any
listed domain could start a sign-in. Give a test site, or sites with different owners, a relay and
App of their own.

## When sign-in doesn't work

Four things account for nearly every failure, and none of them report a useful error:

- **The callback URL has to match exactly**, including `https://` and the `/callback` path, and it
  is the *relay's* domain — not your site's.
- **The App has to be installed on the repository**, which is a separate step from creating it.
  Creating an App does not give it access to anything. On an organisation's repository an owner
  has to approve the installation.
- **An editor needs write access to the repository as well.** The App decides what a token *may*
  reach; the person's own permissions decide what they may do with it. The editor checks this at
  sign-in and says so when it fails.
- **The domain the editor is served from has to be in `ALLOWED_DOMAINS`**, or the relay refuses to
  start sign-in. This is the one that catches you when you move the editor to a new domain.

If you leave **Expire user authorization tokens** unchecked, sign-in still works, but GitHub issues
no refresh token: the token then lives in the browser until someone signs out. Leaving it checked
is the better trade.

## Token refresh

A GitHub App's user token expires after 8 hours. At sign-in the relay hands the editor a
`refresh_token` alongside the access token; when the access token expires, the editor posts to
`/refresh` for a new one and retries the request it was making, so nothing being edited is lost.
`/refresh` only answers pages served from `ALLOWED_DOMAINS`. A refresh token lasts six months of
disuse, after which signing in again is needed.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/auth` (or `/oauth/authorize`) | Start sign-in. `redirect_uri` opts into full-page redirect mode. |
| `GET` | `/callback` (or `/oauth/redirect`) | OAuth callback; hands the token to the editor. |
| `POST` | `/refresh` | Trade a refresh token for a fresh access token. |

With `PUBLIC_URL` set, each path is under its path, e.g. `/cms-auth/auth`.
