// The editor, backed by the git repository on this machine instead of one on GitHub.
//
// `npm run dev` mounts this under /__local/. It answers the same five questions src/github.js
// answers — who is editing, which articles there are, their text, save, deploy status — but
// against files in a directory, and a save is a commit in that repository rather than one made
// through the API. There is nothing to sign in to, and nothing leaves the machine; pushing when
// the work is ready stays yours to do.
//
// It is for development, so it binds to localhost and is never part of a build.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { cleanMessage } from '../src/github.js';

/** git's own name for a blob's contents, so the editor's cache can key on it exactly as it keys
 * on the oid GitHub reports. */
export const blobSha = (text) => {
  const bytes = Buffer.from(text);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};

const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });

/** Whether this is a repository, and whether it is in the middle of something — a merge, a rebase,
 * a cherry-pick. Committing into the middle of one of those would be rude, so the files are
 * written and the commit is left undone. */
function repoState(root) {
  const dir = git(root, ['rev-parse', '--absolute-git-dir']);
  if (dir.status !== 0) return { repo: false, busy: false, branch: null };
  const gitDir = dir.stdout.trim();
  const busy = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG'].some((f) => existsSync(join(gitDir, f)));
  return { repo: true, busy, branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim() || null };
}

/**
 * @param {object} o
 * @param {string} o.root The site repository on this machine.
 * @param {string} o.contentDir Article directory inside it.
 * @param {string} o.mediaDir Where uploads go.
 * @param {string} [o.timeZone] Which time zone's numbers a new article's id is made of.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<boolean>}
 * Handles the request and says so, or says it isn't one of ours.
 */
export function localApi({ root, contentDir, mediaDir, timeZone = 'UTC' }) {
  const base = resolve(root);
  const content = resolve(base, contentDir);
  const media = resolve(base, mediaDir);

  // Everything this writes has to stay inside the two directories the config named
  const inside = (path) => {
    const full = resolve(base, path);
    return [content, media].some((dir) => full === dir || full.startsWith(dir + '/')) ? full : null;
  };
  const articlePath = (id) => join(content, `${id}.md`);
  const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
  const ids = () =>
    (existsSync(content) ? readdirSync(content) : [])
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.replace(/\.md$/, ''));

  /** The same rule as a new article gets on GitHub: the minute it was made, in the site's time
   * zone, plus one where that is taken. */
  const newId = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    let id = Number(`${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}`);
    while (existsSync(articlePath(String(id)))) id++;
    return String(id);
  };

  const commit = (paths, message) => {
    const state = repoState(base);
    if (!state.repo) return { commit: null, why: 'no-repo' };
    if (state.busy) return { commit: null, why: 'busy' };
    const spec = paths.map((p) => relative(base, p));
    if (git(base, ['add', '-A', '--', ...spec]).status !== 0) return { commit: null, why: 'failed' };
    // Only these paths: whatever else is staged stays staged, and stays out of this commit
    const made = git(base, ['commit', '-m', message, '--', ...spec]);
    if (made.status !== 0) return { commit: null, why: /nothing (added )?to commit|no changes added/i.test(made.stdout) ? 'unchanged' : 'failed' };
    return { commit: git(base, ['rev-parse', 'HEAD']).stdout.trim(), why: null };
  };

  const body = (req) =>
    new Promise((done) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => done(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}));
    });

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/__local/')) return false;
    const what = url.pathname.slice('/__local/'.length);
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };

    if (what === 'site') {
      const state = repoState(base);
      return (
        send(200, {
          name: git(base, ['config', 'user.name']).stdout.trim() || 'local',
          root: base,
          branch: state.branch,
          repo: state.repo,
        }),
        true
      );
    }

    if (what === 'files') {
      return (send(200, ids().map((id) => ({ id, oid: blobSha(read(articlePath(id)) ?? '') }))), true);
    }

    if (what === 'read') {
      const { ids: wanted = [] } = await body(req);
      const out = {};
      for (const id of wanted) {
        const text = read(articlePath(id));
        if (text !== null) out[id] = text;
      }
      return (send(200, out), true);
    }

    // The history: what `git log` says about one article, and the article as one of those commits
    // left it. Read only, and only ever about a file in the collection.
    if (what === 'history' || what === 'version') {
      const { id, ref } = await body(req);
      if (!/^[\w-]+$/.test(String(id))) return (send(400, { error: 'not an article id' }), true);
      const rel = relative(base, articlePath(id));
      if (what === 'history') {
        if (!repoState(base).repo) return (send(200, []), true);
        const log = git(base, ['log', '-n', '50', '--format=%H%x1f%an%x1f%aI%x1f%s', '--', rel]);
        const commits = log.status !== 0 ? [] : log.stdout.split('\n').filter(Boolean).map((line) => {
          const [sha, author, date, subject] = line.split('\x1f');
          return { sha, author, date, message: cleanMessage(subject) };
        });
        return (send(200, commits), true);
      }
      if (!/^[0-9a-f]{7,40}$/.test(String(ref))) return (send(400, { error: 'not a commit' }), true);
      const shown = git(base, ['show', `${ref}:./${rel}`]);
      return (send(200, { text: shown.status === 0 ? shown.stdout : null }), true);
    }

    if (what === 'save') {
      const { id: given, text, images = [], message, baseSha = null, force = false, remove = false } = await body(req);
      const id = given || newId();
      const file = articlePath(id);
      const now = read(file);
      // The same check the API makes: has this file changed since it was opened? Here that means
      // someone edited it in their own editor while it was open in this one.
      if (!force && (now === null ? null : blobSha(now)) !== baseSha) return (send(409, { conflict: true, id, text: now }), true);

      const touched = [];
      for (const img of images) {
        const path = inside(img.path);
        if (!path) return (send(400, { error: `outside the configured directories: ${img.path}` }), true);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, Buffer.from(img.data, 'base64'));
        touched.push(path);
      }
      if (remove) {
        rmSync(file, { force: true });
      } else {
        mkdirSync(content, { recursive: true });
        writeFileSync(file, text);
      }
      touched.push(file);

      const made = commit(touched, message || `${remove ? 'Delete' : 'Update'} ${id}`);
      return (send(200, { id, sha: remove ? null : blobSha(text), ...made }), true);
    }

    return (send(404, { error: 'no such local endpoint' }), true);
  };
}

/** Serving the uploads directory, so pictures in an article show up while editing. */
export const localMedia = ({ root, mediaDir, mediaUrl }) => {
  const dir = resolve(root, mediaDir);
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(mediaUrl + '/')) return false;
    const file = resolve(dir, '.' + url.pathname.slice(mediaUrl.length));
    if (!file.startsWith(dir + '/') || !existsSync(file)) return false;
    res.writeHead(200, { 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
    return true;
  };
};
