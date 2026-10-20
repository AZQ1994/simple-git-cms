// 通过 GitHub API 读写文章（浏览器和 Node 都能用）。
// 保存时把文章和新图片合成「一个提交」，并检查文章有没有在打开之后被别人改过。
import { parseArticle, serializeArticle } from './article.js';
import { t } from './i18n/index.js';

export class ConflictError extends Error {
  constructor(theirs) {
    super(t('conflict.title'));
    this.name = 'ConflictError';
    this.theirs = theirs; // 对方的版本（已解析），被删除时为 null
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
   * @param {string} o.token GitHub 令牌
   * @param {string} o.repo owner/name
   * @param {string} [o.branch]
   * @param {string} o.contentDir 文章目录（仓库内路径），如 src/content/news
   * @param {string} [o.apiBase]
   * @param {() => Promise<string|null>} [o.refresh] 令牌过期（401）时换新令牌，换不到返回 null
   * @param {string} [o.timeZone] 新文章编号用哪个时区的「年月日时分」
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

  /** 当前用户和对仓库的写权限 */
  async whoami() {
    const user = await this.req('/user');
    // 看不到仓库（404）：不是协作者，或用 GitHub App 登录时 App 没装到这个仓库
    const repo = await this.req(`/repos/${this.repo}`).catch((e) => {
      if (e.status === 404 || e.status === 403) return null;
      throw e;
    });
    return { login: user.login, name: user.name || user.login, avatar: user.avatar_url, canWrite: Boolean(repo?.permissions?.push) };
  }

  /** 一次请求取回全部文章（含正文） */
  async listArticles() {
    const [owner, name] = this.repo.split('/');
    const data = await this.graphql(
      `query($owner:String!,$name:String!,$expr:String!){repository(owner:$owner,name:$name){object(expression:$expr){... on Tree{entries{name oid object{... on Blob{text}}}}}}}`,
      { owner, name, expr: `${this.branch}:${this.contentDir}` },
    );
    const entries = data.repository?.object?.entries ?? [];
    return entries
      .filter((e) => e.name.endsWith('.md') && typeof e.object?.text === 'string')
      .map((e) => ({ ...parseArticle(e.name.replace(/\.md$/, ''), e.object.text), sha: e.oid }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  /** 读取一篇文章的最新版本；不存在时返回 null */
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
   * 保存文章。article.id 为空时新建。images: [{ path: 仓库内路径, bytes: Uint8Array }]
   * baseSha：打开文章时的版本；与当前版本不一致时抛 ConflictError（force=true 时直接覆盖）。
   * 返回 { id, sha, commit }
   */
  async saveArticle(article, { baseSha = null, images = [], message, force = false, deleteArticle = false } = {}) {
    // 图片 blob 和分支无关，先传，重试时不用再传
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
      if (deleteArticle) {
        tree.push({ path, mode: '100644', type: 'blob', sha: null });
      } else {
        const blob = await this.req(`/repos/${this.repo}/git/blobs`, {
          method: 'POST',
          body: { content: serializeArticle({ ...article, id }), encoding: 'utf-8' },
        });
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
        return { id, sha: articleSha, commit: commit.sha };
      } catch (e) {
        // 分支在这期间有了新提交（别人保存了别的文章）：基于最新版本重试
        if (e.status === 422 && attempt < 3) continue;
        throw e;
      }
    }
    throw new Error(t('save.busyRepo'));
  }

  /** 新文章编号：config.timeZone 时区的 年月日时分，重复时加 1 */
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

  /** 某个提交的部署状态：pending / success / failure / unknown */
  async deployStatus(commitSha) {
    const runs = await this.req(`/repos/${this.repo}/actions/runs?head_sha=${commitSha}&per_page=5`);
    const run = runs.workflow_runs?.[0];
    if (!run) return 'pending';
    if (run.status !== 'completed') return 'pending';
    if (run.conclusion === 'success') return 'success';
    if (run.conclusion === 'cancelled') return 'superseded'; // 被更新的保存取代
    return 'failure';
  }
}
