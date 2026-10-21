# The project's site

[simple-git-cms.azq1994.com](https://simple-git-cms.azq1994.com) — one page, in the three languages the editor
itself speaks, rendered by a script with no dependencies.

| File | What's in it |
|---|---|
| `content.mjs` | Everything the site says, one object per language |
| `template.mjs` | The page, plus the bit of highlighting the code blocks get |
| `assets/` | The stylesheet, the icon, and the `_headers` Cloudflare serves them with |
| `build.mjs` | Renders `www/dist/`: `/`, `/zh/`, `/ja/`, a 404 page, and the demo |
| `demo/` | [The demo](https://simple-git-cms.azq1994.com/demo/): the real editor, with a service worker standing in for GitHub |

```bash
npm run site                       # build into www/dist/
npx serve www/dist                 # or any static server, to look at it
npm run site:deploy                # build, then push it to Cloudflare
```

The screenshot is the one the READMEs use (`docs/screenshot.png`), copied in at build time, so
there is only ever one of it to keep up to date.

## The demo

`npm run site` also builds the editor and installs it at `/demo/app/` exactly as `install.mjs`
installs it anywhere else — the bundle there is the one `npm run build` produces, unchanged.
What makes it a demo is `demo/sw.js`, a service worker that answers every request to
`api.github.com` out of a repository it invents, kept in the Cache API so it survives a reload.
`demo/index.html` registers it before handing over to the editor; `demo/banner.js` adds the bar
that says so; `demo/preview/` is a site-side preview page, the same one the README tells you to
write. Nothing under `src/` knows the demo exists.

Deploying needs `wrangler login` once. `wrangler.toml` claims the hostname as a custom domain, so
Cloudflare adds the DNS record itself the first time.
