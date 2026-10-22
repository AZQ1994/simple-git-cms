# Security

## Reporting a vulnerability

Please report it privately, through **[Report a vulnerability](https://github.com/AZQ1994/simple-git-cms/security/advisories/new)**
on this repository, rather than in an issue. English, Chinese or Japanese are all fine.

You will get an answer within a week. A fix goes out as a new release, with an advisory saying
what was affected and what to upgrade to; you are credited unless you would rather not be.

## Supported versions

The latest release. The editor is a set of static files copied into a site, so upgrading is
copying the new ones in — there is no older line kept alive alongside it.

## What is worth reporting

The editor holds a GitHub token that can write to a repository, so the things that matter most are
the ones that could reach it, or make a commit nobody asked for:

- a way to run script in the editor's page — through an article, a pasted snippet, `config.json`,
  a block definition, or the preview — under the policy in
  [Locking the editor down](README.md#locking-the-editor-down);
- the sign-in relay in [`auth/`](auth/) handing a token or a code to anyone but the editor that
  asked for it, or being usable as an open redirect;
- `integrations/preview-client.js` accepting messages from an origin it should not;
- the editor writing outside `collection.dir` and `media.dir`, or committing something other than
  what was on screen;
- `npm run dev`'s local API answering anything but the machine it runs on, or reaching outside the
  site's directories.

Some things are known and documented rather than vulnerabilities: the token lives in
`localStorage` (see [Known limits](README.md#known-limits)), and anyone with write access to the
repository can change what the editor runs, as they can with the rest of the site.
