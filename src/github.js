// Reading and writing articles through the GitHub API, from a browser or from Node.
// A save puts the article and any new images into a single commit, and first checks whether
// someone else changed the article since it was opened.
import { parseArticle, serializeArticle } from './article.js';
import { t } from './i18n/index.js';

export class ConflictError extends Error {
  constructor(theirs) {
    super(t('conflict.title'));
    this.name = 'ConflictError';
    this.theirs = theirs; // their version, already parsed — null if they deleted it
  }
}

export class AuthError extends Error {}

const b64 = (bytes) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
};

export class GitHubStore {
  /**
   * @param {object} o
   * @param {string} o.token GitHub token.
   * @param {string} o.repo owner/name
   * @param {string} [o.branch]
   * @param {string} o.contentDir Article directory inside the repository, e.g. src/content/news.
   * @param {string} [o.apiBase]
   * @param {() => Promise<string|null>} [o.refresh] Called on a 401 to get a fresh token; returns
   * null when it can't.
   * @param {string} [o.timeZone] Which time zone's year-month-day-hour-minute numbers an id uses.
   */
  constructor({ token, repo, branch = 'main', contentDir, apiBase = 'https://api.github.com', refresh, timeZone = 'UTC' }) {
    if (!contentDir) throw new Error('contentDir is required');
    Object.assign(this, { token, repo, branch, apiBase, refresh, timeZone, contentDir: contentDir.replace(/^\/+|\/+$/g, '') });
  }

  async req(path, { method = 'GET', body } = {}, retried = false) {
    const res = await fetch(this.apiBase + path, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (res.status === 401) {
      const token = !retried && this.refresh ? await this.refresh().catch(() => null) : null;
      if (!token) throw new AuthError(t('login.expired'));
      this.token = token;
      return this.req(path, { method, body }, true);
    }
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(json?.message ? t('github.error', { message: json.message }) : t('github.requestFailed', { status: res.status }));
      err.status = res.status;
      throw err;
    }
    return json;
  }

  async graphql(query, variables) {
    const json = await this.req('/graphql', { method: 'POST', body: { query, variables } });
    if (json.errors?.length) throw new Error(t('github.error', { message: json.errors[0].message }));
    return json.data;
  }

  /** Who is signed in, and whether they can write to the repository. */
  async whoami() {
    const user = await this.req('/user');
    // A 404 means the repository isn't visible: not a collaborator, or — after signing in through
    // the GitHub App — the App isn't installed on it
    const repo = await this.req(`/repos/${this.repo}`).catch((e) => {
      if (e.status === 404 || e.status === 403) return null;
      throw e;
    });
    return { login: user.login, name: user.name || user.login, avatar: user.avatar_url, canWrite: Boolean(repo?.permissions?.push) };
  }

  /** Which articles the collection has: one entry per file, newest first. Names and content
   * hashes only — no text, so this request stays the same size whether the articles are ten lines
   * or ten pages. The id is the file's name, which is a timestamp, so sorting by it is sorting by
   * date without having read a single body. */
  async listFiles() {
    const [owner, name] = this.repo.split('/');
    const data = await this.graphql(
      `query($owner:String!,$name:String!,$expr:String!){repository(owner:$owner,name:$name){object(expression:$expr){... on Tree{entries{name oid}}}}}`,
      { owner, name, expr: `${this.branch}:${this.contentDir}` },
    );
    const entries = data.repository?.object?.entries ?? [];
    return entries
      .filter((e) => e.name.endsWith('.md'))
      .map((e) => ({ id: e.name.replace(/\.md$/, ''), oid: e.oid }))
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  /** The text of several articles in one request, by id. A file that isn't there any more — it
   * was deleted between listing and reading — is simply missing from the answer.
   * @returns {Promise<Map<string, string>>} */
  async readFiles(ids) {
    if (!ids.length) return new Map();
    const [owner, name] = this.repo.split('/');
    // One aliased field per article; GitHub has no way to ask for part of a file, so the whole
    // body comes back and the only thing worth controlling is how many at a time
    const keys = ids.map((_, i) => `f${i}`);
    const data = await this.graphql(
      `query($owner:String!,$name:String!,${keys.map((k) => `$${k}:String!`).join(',')}){repository(owner:$owner,name:$name){${keys
        .map((k) => `${k}:object(expression:$${k}){... on Blob{text}}`)
        .join(' ')}}}`,
      { owner, name, ...Object.fromEntries(keys.map((k, i) => [k, `${this.branch}:${this.contentDir}/${ids[i]}.md`])) },
    );
    return new Map(ids.map((id, i) => [id, data.repository?.[keys[i]]?.text]).filter(([, text]) => typeof text === 'string'));
  }

  /** The latest version of one article, or null if it isn't there. */
  async getArticle(id, ref = this.branch) {
    try {
      const f = await this.req(`/repos/${this.repo}/contents/${this.contentDir}/${id}.md?ref=${encodeURIComponent(ref)}`);
      const text = new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
      return { ...parseArticle(id, text), sha: f.sha };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  /**
   * Save an article. An empty article.id creates a new one. `images` is
   * [{ path: path inside the repository, bytes: Uint8Array }].
   * `baseSha` is the version that was opened; if it no longer matches, this throws ConflictError —
   * unless force is true, which overwrites. Returns { id, sha, commit, text } — text being the
   * file exactly as it was written, which is what the article now is.
   */
  async saveArticle(article, { baseSha = null, images = [], message, force = false, deleteArticle = false } = {}) {
    // Image blobs don't depend on the branch, so upload them up front — a retry needn't repeat it
    const imageBlobs = [];
    for (const img of images) {
      const blob = await this.req(`/repos/${this.repo}/git/blobs`, { method: 'POST', body: { content: b64(img.bytes), encoding: 'base64' } });
      imageBlobs.push({ path: img.path, sha: blob.sha });
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const ref = await this.req(`/repos/${this.repo}/git/ref/heads/${this.branch}`);
      const head = ref.object.sha;
      const headCommit = await this.req(`/repos/${this.repo}/git/commits/${head}`);

      let id = article.id;
      if (id) {
        const current = await this.getArticle(id, head);
        if (!force && (current?.sha ?? null) !== baseSha) throw new ConflictError(current);
      } else {
        id = await this.newId(head);
      }
      const path = `${this.contentDir}/${id}.md`;

      const tree = [...imageBlobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha }))];
      let articleSha = null;
      let text = null;
      if (deleteArticle) {
        tree.push({ path, mode: '100644', type: 'blob', sha: null });
      } else {
        text = serializeArticle({ ...article, id });
        const blob = await this.req(`/repos/${this.repo}/git/blobs`, { method: 'POST', body: { content: text, encoding: 'utf-8' } });
        articleSha = blob.sha;
        tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      }

      const newTree = await this.req(`/repos/${this.repo}/git/trees`, { method: 'POST', body: { base_tree: headCommit.tree.sha, tree } });
      const commit = await this.req(`/repos/${this.repo}/git/commits`, {
        method: 'POST',
        body: {
          message: message ?? t('commit.article', { verb: t(article.id ? 'verb.update' : 'verb.create'), title: `${id} ${article.title}` }),
          tree: newTree.sha,
          parents: [head],
        },
      });
      try {
        await this.req(`/repos/${this.repo}/git/refs/heads/${this.branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
        return { id, sha: articleSha, commit: commit.sha, text };
      } catch (e) {
        // The branch moved meanwhile (someone saved a different article): start again from the tip
        if (e.status === 422 && attempt < 3) continue;
        throw e;
      }
    }
    throw new Error(t('save.busyRepo'));
  }

  /** An id for a new article: year, month, day, hour and minute in config.timeZone, plus 1 on a
   * collision. */
  async newId(ref) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', { timeZone: this.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    let id = Number(`${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}`);
    while (await this.getArticle(String(id), ref)) id++;
    return String(id);
  }

  /** Deployment status for a commit: pending / success / failure / superseded. */
  async deployStatus(commitSha) {
    const runs = await this.req(`/repos/${this.repo}/actions/runs?head_sha=${commitSha}&per_page=5`);
    const run = runs.workflow_runs?.[0];
    if (!run) return 'pending';
    if (run.status !== 'completed') return 'pending';
    if (run.conclusion === 'success') return 'success';
    if (run.conclusion === 'cancelled') return 'superseded'; // a later save took over
    return 'failure';
  }
}
