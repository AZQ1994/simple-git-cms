# Browser tests

`npm test` covers the parts that can be tested without a browser — reading and writing the file
format, the save-and-retry logic against a fake API, the translations. What it can't reach is the
thing people actually use: the interface, and whether clicking **Save** still ends up making the
right commit.

These tests close that gap. They run the editor that `npm run build` produces, in a real Chrome,
against a GitHub that exists only in memory, and then read back what was committed.

```bash
npm run build
npm run test:e2e
```

| File | What it is |
|---|---|
| `cdp.mjs` | A Chrome DevTools Protocol client: Node's own WebSocket, no dependencies. Starts headless Chrome, evaluates expressions in the page, answers the dialogs the editor puts up |
| `fake-github.mjs` | The REST and GraphQL calls `src/github.js` makes, answered out of a `Map`. A test can read `gh.files` and `gh.commits` afterwards |
| `serve.mjs` | Serves `dist/` with a `config.json` written for the test |
| `preview/` | The site's preview page at its smallest, served beside the editor with `integrations/preview-client.js` |
| `policy.mjs` | Reads the Content-Security-Policy out of README.md, so the policy under test is the one the README tells people to use |
| `editor.test.mjs` | Sign in, list, open, edit, save, publish, delete — each one checked against what the fake repository holds |

Chrome is found at the usual places, or wherever `CHROME_PATH` points. Nothing is downloaded and
nothing reaches the network: both servers listen on 127.0.0.1 on a port the operating system picks,
and the editor's API is pointed at the fake one through `localStorage['simple-git-cms-api']`, which
the editor only honours on localhost. Chrome is started with its own background traffic switched
off, and one of the tests reads back every address the page loaded and fails if any of them is not
one of the two local servers — so a font or an icon added from a CDN is caught here. The whole
suite runs offline.

The editor is served under the policy the README recommends, and the last test injects an inline
script to prove the policy is in force rather than merely printed. So a change that quietly needs
`unsafe-inline` or `unsafe-eval` fails here instead of in somebody's install.

CI runs these on one Node version — what they exercise is the browser, not Node.
