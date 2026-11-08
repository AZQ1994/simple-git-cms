// A site's articles, read and written straight from a checkout on this machine — what the MCP
// server (scripts/mcp.mjs) gives an AI tool to work with.
//
// It reads the same config.json the editor does and writes files the editor would have written:
// the same frontmatter (src/article.js), the same file per language (integrations/languages.js), images in
// the same dated folders. A save is a file on disk; `commit` makes it a commit of only the content
// and media directories. Pushing, and having someone look before anything goes live, stays with
// the people and the site's own workflow.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { parseArticle, serializeArticle } from '../src/article.js';
import { collectionName } from '../src/config.js';
import {
  LANG_CODE,
  diffLines,
  fileName,
  groupFiles,
  languagesOf,
  sharedFieldsOf,
  translatedFrom,
  translationState,
  withSharedFields,
  wordsChanged,
  wordsOf,
} from '../integrations/languages.js';

/** Whether two versions agree on every shared field. */
const sameShared = (a, b, shared) =>
  shared.every((f) => JSON.stringify(f === 'date' || f === 'tags' ? a[f] : a.extra?.[f]) === JSON.stringify(f === 'date' || f === 'tags' ? b[f] : b.extra?.[f]));

/** git's name for a file's contents: what GitHub reports as its oid, and what translatedFrom keeps. */
export const blobSha = (text) => {
  const bytes = Buffer.from(text);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};

export class ContentError extends Error {}
const fail = (message) => {
  throw new ContentError(message);
};

/**
 * @param {object} o
 * @param {string} o.configPath The editor's config.json.
 * @param {string} [o.root] The repository the config's paths are relative to; found from the
 * config's directory when left out.
 */
export function openSite({ configPath, root }) {
  if (!existsSync(configPath)) fail(`No config.json at ${configPath}. Pass the path to the editor's config.json.`);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const git = (cwd, args, input) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', input });
  const top = git(dirname(resolve(configPath)), ['rev-parse', '--show-toplevel']);
  const base = resolve(root ?? (top.status === 0 ? top.stdout.trim() : process.cwd()));
  const timeZone = config.timeZone ?? 'UTC';
  const media = { dir: config.media?.dir ?? 'public/uploads', url: '/' + String(config.media?.url ?? '/uploads').replace(/^\/+|\/+$/g, ''), ...config.media };
  media.url = '/' + String(media.url).replace(/^\/+|\/+$/g, '');

  const collections = (config.collections ?? []).map((c) => ({
    name: collectionName(c),
    label: c.label ?? collectionName(c),
    dir: String(c.dir).replace(/^\/+|\/+$/g, ''),
    languages: languagesOf(config, c),
    shared: sharedFieldsOf(c),
    imageField: c.imageField ?? null,
  }));
  if (!collections.length) fail('config.json lists no collections.');

  const collectionOf = (name) => {
    if (name === undefined || name === null || name === '') return collections[0];
    return collections.find((c) => c.name === name) ?? fail(`No collection called ${name}. There are: ${collections.map((c) => c.name).join(', ')}.`);
  };

  // An id is a file name in the collection, never a path out of it
  const checkId = (id) => (/^[\w-]+$/.test(String(id)) ? String(id) : fail(`Not an article id: ${id}`));
  const checkLang = (c, lang) => {
    if (!c.languages.length) return lang ? fail(`${c.name} is written in one language; leave lang out.`) : null;
    if (!lang) return c.languages[0];
    return c.languages.includes(lang) ? lang : fail(`${c.name} is written in ${c.languages.join(', ')}, not ${lang}.`);
  };
  const dirOf = (c) => join(base, c.dir);
  const pathOf = (c, id, lang) => join(dirOf(c), fileName(id, lang, c.languages));
  const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

  /** Every article in a collection, each with its files by language ('' on a one-language site). */
  const articlesIn = (c) => {
    const names = existsSync(dirOf(c)) ? readdirSync(dirOf(c)).filter((n) => n.endsWith('.md')) : [];
    return groupFiles(
      names.map((n) => ({ id: n.replace(/\.md$/, ''), oid: blobSha(readFileSync(join(dirOf(c), n), 'utf8')) })),
      c.languages,
    );
  };

  /** One article: each language parsed, with its hash. */
  const load = (c, id) => {
    const group = articlesIn(c).find((a) => a.id === id);
    if (!group) return null;
    const versions = {};
    for (const [lang, f] of Object.entries(group.files)) {
      const text = readFileSync(join(dirOf(c), `${f.name}.md`), 'utf8');
      versions[lang] = { ...parseArticle(f.name, text), sha: f.oid };
    }
    return { id, files: group.files, versions };
  };

  const stateOf = (article, lang) => translationState(article.versions[lang], article.files);
  const keyOf = (c, lang) => (c.languages.length ? lang : '');

  /** The same rule the editor uses: the minute it was made, in the site's time zone, plus one where
   * that is taken — by any language. */
  const newId = (c) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    const taken = new Set(articlesIn(c).map((a) => a.id));
    let id = Number(`${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}`);
    while (taken.has(String(id))) id++;
    return String(id);
  };

  /** Images in the body under media.url have to exist, or the built page shows a broken one. */
  const checkImages = (body) => {
    const prefix = media.url + '/';
    const missing = [...body.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)]
      .map((m) => m[1])
      .filter((src) => src.startsWith(prefix) && !existsSync(join(base, media.dir, decodeURI(src.slice(prefix.length)))));
    if (missing.length) fail(`These images are not in ${media.dir}: ${missing.join(', ')}. Add them with add_image first.`);
  };

  /** Keep a version of a file in git's object store, so translatedFrom can find it again even
   * before it is committed. */
  const keep = (file) => git(base, ['hash-object', '-w', '--', file]);

  return {
    root: base,
    config,
    collections,

    /**
     * Articles, newest first, with where each language stands.
     * @param {{ collection?: string, status?: 'missing' | 'outdated' | 'draft', query?: string, limit?: number }} o
     */
    list({ collection, status, query, limit = 50 } = {}) {
      const c = collectionOf(collection);
      const langs = c.languages.length ? c.languages : [''];
      const q = query?.toLowerCase();
      const rows = [];
      for (const group of articlesIn(c)) {
        const article = load(c, group.id);
        const versions = langs.map((lang) => {
          const v = article.versions[lang];
          if (!v) return { lang: lang || null, state: 'missing' };
          return { lang: lang || null, title: v.title, draft: v.draft, state: stateOf(article, lang) };
        });
        const any = Object.values(article.versions)[0];
        if (status === 'missing' && !versions.some((v) => v.state === 'missing')) continue;
        if (status === 'outdated' && !versions.some((v) => v.state === 'outdated' || v.state === 'orphan')) continue;
        if (status === 'draft' && !versions.some((v) => v.draft)) continue;
        if (q && !Object.values(article.versions).some((v) => v.title.toLowerCase().includes(q) || v.body.toLowerCase().includes(q))) continue;
        rows.push({ id: group.id, date: any.date, tags: any.tags, versions });
      }
      rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      return { collection: c.name, languages: c.languages, articles: rows.slice(0, limit), total: rows.length };
    },

    /** One language of one article, in full. */
    get({ collection, id, lang }) {
      const c = collectionOf(collection);
      lang = checkLang(c, lang);
      const article = load(c, checkId(id)) ?? fail(`No article ${id} in ${c.name}.`);
      const v = article.versions[keyOf(c, lang)] ?? fail(`Article ${id} has no ${lang} version yet. It has: ${Object.keys(article.versions).join(', ')}.`);
      const { extra, ...rest } = v;
      const { translatedFrom: from, ...fields } = extra;
      return {
        collection: c.name,
        ...rest,
        id: article.id,
        lang,
        fields,
        translatedFrom: from ?? null,
        state: stateOf(article, keyOf(c, lang)),
        languages: Object.keys(article.versions).filter(Boolean),
        path: pathOf(c, article.id, lang).slice(base.length + 1),
      };
    },

    /**
     * Write one language of an article, new or existing. Fields every language shares are copied
     * to the other languages in the same go, and a translation whose source only changed in those
     * shared fields stays current.
     * @param {object} o
     * @param {string} [o.collection]
     * @param {string} [o.id] Left out: a new article.
     * @param {string} [o.lang]
     * @param {string} [o.title]
     * @param {string} [o.body] Markdown.
     * @param {string} [o.description]
     * @param {string[]} [o.tags]
     * @param {string} [o.date]
     * @param {boolean} [o.draft] A new article is a draft unless this says false.
     * @param {Record<string, unknown>} [o.fields] Other frontmatter fields (the cover image, say). null removes one.
     * @param {string} [o.from] The language this text was translated from. Records it, as of the source now.
     */
    write({ collection, id, lang, title, body, description, tags, date, draft, fields = {}, from }) {
      const c = collectionOf(collection);
      lang = checkLang(c, lang);
      const key = keyOf(c, lang);
      if (from !== undefined && !c.languages.length) fail(`${c.name} is written in one language; there is nothing to translate from.`);
      if (from === lang) fail('A language can’t be translated from itself.');
      if (fields && (typeof fields !== 'object' || Array.isArray(fields))) fail('fields has to be an object.');
      for (const k of Object.keys(fields ?? {})) if (['title', 'description', 'date', 'tags', 'draft', 'translatedFrom'].includes(k)) fail(`${k} has a parameter of its own; it doesn’t go in fields.`);

      const isNew = !id;
      id = isNew ? newId(c) : checkId(id);
      const article = isNew ? { id, files: {}, versions: {} } : load(c, id) ?? { id, files: {}, versions: {} };
      const before = article.versions[key] ?? null;
      if (!before && (!title?.trim() || !body?.trim())) fail(`A new ${lang ? `${lang} version` : 'article'} needs a title and a body.`);
      if (!before && !isNew && !Object.keys(article.versions).length) fail(`No article ${id} in ${c.name}. Leave id out to make a new one.`);

      // The version being written, starting from what is there, or — for a new language of an
      // existing article — from the shared fields of the ones already there
      const sibling = Object.values(article.versions)[0];
      let next = before
        ? { ...before, extra: { ...before.extra } }
        : { id: fileName(id, lang, c.languages).replace(/\.md$/, ''), title: '', description: '', date: sibling?.date ?? new Date().toISOString(), tags: [], draft: true, extra: {}, body: '' };
      if (!before && sibling) next = withSharedFields(next, sibling, c.shared);
      if (title !== undefined) next.title = title.trim();
      if (body !== undefined) next.body = body.trim() + '\n';
      // A summary the editor would have generated follows the body; one somebody wrote stays
      if (description !== undefined) next.description = description.trim();
      if (tags !== undefined) next.tags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
      if (date !== undefined) {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) fail(`Not a date: ${date}`);
        next.date = d.toISOString();
      }
      if (draft !== undefined) next.draft = Boolean(draft);
      for (const [k, v] of Object.entries(fields ?? {})) {
        if (v === null) delete next.extra[k];
        else next.extra[k] = v;
      }
      if (from !== undefined) {
        const source = article.versions[checkLang(c, from)] ?? fail(`Article ${id} has no ${from} version to translate from.`);
        keep(pathOf(c, id, from));
        next.extra.translatedFrom = { lang: from, sha: source.sha };
      }
      checkImages(next.body);

      // Every language's new text: this one, and the others with the shared fields copied over
      const texts = {};
      const versions = { ...article.versions, [key]: next };
      texts[key] = serializeArticle(next);
      if (c.languages.length) {
        for (const other of Object.keys(article.versions)) {
          if (other === key) continue;
          const synced = withSharedFields(article.versions[other], next, c.shared);
          // A language whose shared fields already match is left exactly as it is on disk
          if (sameShared(synced, article.versions[other], c.shared)) continue;
          versions[other] = synced;
          texts[other] = serializeArticle(synced);
        }
        // A translation of a file that changed only in its shared fields still matches it: point
        // it at the new version. Repeated, since moving that pointer is itself a change to a file
        // something else may be translated from.
        for (let round = 0; round < c.languages.length; round++) {
          let moved = false;
          for (const [l, v] of Object.entries(versions)) {
            const tf = translatedFrom(v);
            if (!tf || !versions[tf.lang] || !article.versions[tf.lang]) continue;
            const oldSource = article.versions[tf.lang];
            const newSha = texts[tf.lang] === undefined ? oldSource.sha : blobSha(texts[tf.lang]);
            if (tf.sha === oldSource.sha && newSha !== oldSource.sha && !wordsChanged(oldSource, versions[tf.lang])) {
              versions[l] = { ...v, extra: { ...v.extra, translatedFrom: { lang: tf.lang, sha: newSha } } };
              texts[l] = serializeArticle(versions[l]);
              moved = true;
            }
          }
          if (!moved) break;
        }
      }

      const written = [];
      for (const [l, text] of Object.entries(texts)) {
        const file = pathOf(c, id, l || null);
        if (read(file) === text) continue;
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
        keep(file);
        written.push(file.slice(base.length + 1));
      }
      return { ...this.get({ collection: c.name, id, lang }), written };
    },

    /** What changed in the source since a translation was made, for updating just those lines. */
    sourceChanges({ collection, id, lang }) {
      const c = collectionOf(collection);
      lang = checkLang(c, lang);
      const article = load(c, checkId(id)) ?? fail(`No article ${id} in ${c.name}.`);
      const v = article.versions[keyOf(c, lang)] ?? fail(`Article ${id} has no ${lang} version.`);
      const tf = translatedFrom(v);
      if (!tf) return { state: 'original', message: `The ${lang} version is not a translation.` };
      const now = article.versions[tf.lang];
      if (!now) return { state: 'orphan', message: `It was translated from ${tf.lang}, which this article no longer has.` };
      if (now.sha === tf.sha) return { state: 'current', message: `Up to date with the ${tf.lang} version.` };
      const old = git(base, ['cat-file', 'blob', tf.sha]);
      if (old.status !== 0) {
        return { state: 'outdated', from: tf.lang, message: `The ${tf.lang} version changed, but the version it was translated from (${tf.sha.slice(0, 7)}) is not in this repository — fetch, or compare by hand.`, source: wordsOf(now) };
      }
      const then = parseArticle(id, old.stdout);
      const lines = diffLines(wordsOf(then), wordsOf(now));
      // Only the changes, with two lines either side to place them
      const keepLine = lines.map((l, i) => l.op !== ' ' || lines.slice(Math.max(0, i - 2), i + 3).some((x) => x.op !== ' '));
      const shown = [];
      lines.forEach((l, i) => {
        if (keepLine[i]) shown.push(`${l.op} ${l.line}`);
        else if (shown.at(-1) !== '  …') shown.push('  …');
      });
      return { state: 'outdated', from: tf.lang, diff: shown.join('\n') };
    },

    /** Say a translation needs nothing from the latest change to its source (a typo fixed, say). */
    markCurrent({ collection, id, lang }) {
      const c = collectionOf(collection);
      lang = checkLang(c, lang);
      const article = load(c, checkId(id)) ?? fail(`No article ${id} in ${c.name}.`);
      const v = article.versions[keyOf(c, lang)] ?? fail(`Article ${id} has no ${lang} version.`);
      const tf = translatedFrom(v) ?? fail(`The ${lang} version is not a translation.`);
      return this.write({ collection: c.name, id, lang, from: tf.lang });
    },

    /**
     * Put an image in the media directory and say what to write in the body. Made webp and no wider
     * than media.maxWidth when the site has sharp installed (every Astro site does); otherwise kept
     * as it came.
     * @param {{ source: string }} o A URL, a data: URI, or a file on this machine.
     */
    async addImage({ source }) {
      const maxBytes = (media.maxFileMB ?? 20) * 1024 * 1024;
      let bytes;
      let ext = 'webp';
      if (/^data:image\/[\w.+-]+;base64,/.test(source)) {
        bytes = Buffer.from(source.slice(source.indexOf(',') + 1), 'base64');
        ext = source.slice(11, source.indexOf(';')).replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      } else if (/^https?:\/\//.test(source)) {
        const res = await fetch(source, { redirect: 'follow' });
        if (!res.ok) fail(`Could not download ${source} (${res.status}).`);
        bytes = Buffer.from(await res.arrayBuffer());
        ext = (new URL(source).pathname.match(/\.(\w+)$/)?.[1] ?? 'jpg').toLowerCase();
      } else if (existsSync(source) && statSync(source).isFile()) {
        bytes = readFileSync(source);
        ext = (source.match(/\.(\w+)$/)?.[1] ?? 'jpg').toLowerCase();
      } else {
        fail('source has to be an http(s) URL, a data:image/…;base64 URI, or a file on this machine.');
      }
      if (bytes.length > maxBytes) fail(`The image is over ${media.maxFileMB ?? 20}MB.`);

      let sharp = null;
      try {
        sharp = createRequire(join(base, 'package.json'))('sharp');
      } catch {
        // Not installed in the site: keep the file as it is
      }
      let note = null;
      if (sharp && ext !== 'svg' && ext !== 'gif') {
        bytes = await sharp(bytes, { failOn: 'error' })
          .rotate()
          .resize({ width: media.maxWidth ?? 1600, withoutEnlargement: true })
          .webp({ quality: Math.round((media.quality ?? 0.82) * 100) })
          .toBuffer();
        ext = 'webp';
      } else if (!sharp) {
        note = 'sharp is not installed in this site, so the image was kept as it came (not resized or converted to webp).';
      }
      if (!/^(webp|jpg|jpeg|png|gif|svg|avif)$/.test(ext)) fail(`Not an image this tool keeps: .${ext}`);
      const day = new Date().toLocaleDateString('sv-SE', { timeZone }).replaceAll('-', '');
      const name = `${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.${ext}`;
      const dir = join(base, media.dir, day);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), bytes);
      return { src: `${media.url}/${day}/${name}`, bytes: bytes.length, ...(note ? { note } : {}) };
    },

    /** Commit the content and media directories — only those, so nothing else the person has
     * staged comes along. Does not push. */
    commit({ message }) {
      if (!message?.trim()) fail('A commit needs a message.');
      if (git(base, ['rev-parse', '--git-dir']).status !== 0) fail(`${base} is not a git repository.`);
      const paths = [...new Set([...collections.map((c) => c.dir), media.dir])].filter((p) => existsSync(join(base, p)));
      if (git(base, ['add', '-A', '--', ...paths]).status !== 0) fail('git add failed.');
      const staged = git(base, ['diff', '--cached', '--name-only', '--', ...paths]).stdout.trim();
      if (!staged) return { commit: null, message: 'Nothing to commit.' };
      const made = git(base, ['commit', '-m', message.trim(), '--', ...paths]);
      if (made.status !== 0) fail(`git commit failed: ${made.stderr || made.stdout}`);
      const branch = git(base, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
      return { commit: git(base, ['rev-parse', 'HEAD']).stdout.trim(), branch, files: staged.split('\n') };
    },
  };
}

export { LANG_CODE };
