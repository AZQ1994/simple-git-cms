# Contributing

Thanks for wanting to help. Issues and pull requests are welcome in English, Chinese or Japanese.

## Before you start

For anything bigger than a fix, open an issue first and say what you have in mind. The editor is
deliberately small — the same fields for every collection, no server, the file written back exactly as it was read — and
it is easier to agree on the shape of a change before the code exists.

A security problem goes through [SECURITY.md](SECURITY.md), not an issue.

## Setting up

Node 22 or newer, and a Chrome for the browser tests.

```bash
npm install
npm run dev     # build, then serve the editor at http://localhost:4173
```

[Developing](README.md#developing) in the README says what `npm run dev` edits and how.

## Before you open a pull request

```bash
npm run lint
npm test
npm run build && npm run test:e2e
```

CI runs the same, on the oldest and the newest Node it supports.

- **A file has to come back as it went in.** If your change touches reading or writing Markdown,
  add a case to `test/markdown.test.mjs` that opens a file and saves it again. Anything the editor
  shows a person belongs in `test/e2e/editor.test.mjs` as well.
- **A dependency** — added, removed or upgraded — means running `npm run licenses` and committing
  the regenerated `THIRD-PARTY-NOTICES.md`. CI checks it.
- **Interface text** goes in all three files in `src/i18n/`. The tests fail on a key that is
  missing from any of them.
- **The README** comes in three languages; change all three, or say in the pull request which ones
  you could not, and they will be filled in. The Content-Security-Policy in them must stay
  identical — a test checks that too.
- **The changelog**: add a line under `## Unreleased` in `CHANGELOG.md`, written for someone using
  the editor rather than for someone reading the code.

Comments in the code explain why something is the way it is, in sentences. Match what is around
the part you change.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
