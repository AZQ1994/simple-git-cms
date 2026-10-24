// The same five things src/github.js does — who is editing, which articles there are, their text,
// saving, and what happened to the save — asked of the repository on this machine instead of one
// on GitHub. `npm run dev` answers these (scripts/local-api.mjs); nothing else does, so this is
// only ever reached while developing, and the editor falls back to GitHub when nobody answers.
//
// A save writes the files and commits them in that repository. Pushing stays yours to do, which
// is the point: the editor is a way to write the files, and git is still the thing that decides
// what goes out.
import { parseArticle, serializeArticle } from './article.js';
import { ConflictError } from './github.js';
import { t } from './i18n/index.js';

const BASE = './__local';

// A plain mark for the corner where a GitHub avatar would be
const MARK =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2216%22 fill=%22%236b7280%22/%3E%3Cpath d=%22M9 12h5l1.5 2H23v8H9z%22 fill=%22white%22/%3E%3C/svg%3E';

const b64 = (bytes) => {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
};

export class LocalStore {
  /** Is `npm run dev` behind this page? Returns a store if it is, and null if not — in which case
   * the editor signs in to GitHub as usual. */
  static async detect(contentDir, base = BASE) {
    const site = await fetch(`${base}/site`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    return site ? new LocalStore({ site, contentDir, base }) : null;
  }

  constructor({ site, contentDir, base = BASE }) {
    this.site = site;
    this.contentDir = contentDir;
    this.base = base;
    this.local = true; // the interface asks, to leave out what only makes sense on GitHub
    // What the cache keys its copies under; a path can never collide with an owner/name
    this.repo = `local:${site.root}`;
  }

  async req(path, body) {
    // Every request says which directory it is about: the server only answers for the ones
    // config.json names, and the sidebar can switch between them
    const res = await fetch(`${this.base}/${path}?dir=${encodeURIComponent(this.contentDir)}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (res.status === 409) return json; // a conflict is an answer, not a failure
    if (!res.ok) throw new Error(json?.error ?? t('github.requestFailed', { status: res.status }));
    return json;
  }

  async whoami() {
    return { login: this.site.name, name: this.site.name, avatar: MARK, canWrite: true };
  }

  async listFiles() {
    const files = await this.req('files');
    return files.sort((a, b) => b.id.localeCompare(a.id));
  }

  async readFiles(ids) {
    if (!ids.length) return new Map();
    return new Map(Object.entries(await this.req('read', { ids })));
  }

  /** The same as GitHubStore.history(): the commits that changed one article, newest first. */
  async history(id) {
    return this.req('history', { id });
  }

  /** The article as a commit left it, or null where it wasn't there. Only the history asks for an
   * older version; everything else reads the files as they are. */
  async getArticle(id, ref) {
    const { text } = await this.req('version', { id, ref });
    return text === null ? null : parseArticle(id, text);
  }

  async saveArticle(article, { baseSha = null, images = [], message, force = false, deleteArticle = false } = {}) {
    const text = deleteArticle ? null : serializeArticle(article);
    const r = await this.req('save', {
      id: article.id ?? '',
      text,
      images: images.map((img) => ({ path: img.path, data: b64(img.bytes) })),
      message,
      baseSha,
      force,
      remove: deleteArticle,
    });
    if (r?.conflict) throw new ConflictError(r.text === null ? null : parseArticle(r.id, r.text));
    return { id: r.id, sha: r.sha, commit: r.commit, text, why: r.why };
  }

  /** There is no deployment: the files are on this machine. What the interface shows instead is
   * whether the save became a commit. */
  async deployStatus() {
    return 'success';
  }
}
