# The project's site

[simple-git-cms.azq1994.com](https://simple-git-cms.azq1994.com) — one page, in the three languages the editor
itself speaks, rendered by a script with no dependencies.

| File | What's in it |
|---|---|
| `content.mjs` | Everything the site says, one object per language |
| `template.mjs` | The page, plus the bit of highlighting the code blocks get |
| `assets/` | The stylesheet, the icon, and the `_headers` Cloudflare serves them with |
| `build.mjs` | Renders `www/dist/`: `/`, `/zh/`, `/ja/`, and a 404 page |

```bash
npm run site                       # build into www/dist/
npx serve www/dist                 # or any static server, to look at it
npm run site:deploy                # build, then push it to Cloudflare
```

The screenshot is the one the READMEs use (`docs/screenshot.png`), copied in at build time, so
there is only ever one of it to keep up to date.

Deploying needs `wrangler login` once. `wrangler.toml` claims the hostname as a custom domain, so
Cloudflare adds the DNS record itself the first time.
