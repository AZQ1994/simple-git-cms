// An MCP server, so an AI tool (Claude Code, Claude Desktop, Gemini CLI…) can write a site's
// articles the way the editor does: `npx simple-git-cms mcp [path/to/config.json]`.
//
// MCP over stdio is JSON-RPC 2.0, one message per line. The handful of methods a tool server needs
// are answered here directly, so the package still has no dependencies; the work itself is
// scripts/site-content.mjs. It is bundled into dist/mcp.mjs with everything it imports.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { ContentError, openSite } from './site-content.mjs';

const PROTOCOL = '2025-06-18';

const collectionArg = { type: 'string', description: 'Which collection (its name in config.json). Leave out for the first one.' };
const langArg = { type: 'string', description: 'Language code, e.g. ja or zh. Leave out for the default language (the first in config.json languages).' };

/** The tools, as an AI reads them. The descriptions are the only instructions it gets. */
export const TOOLS = [
  {
    name: 'list_articles',
    description:
      'List articles, newest first. For a site in several languages each article shows every language and where it stands: original, current (a translation up to date with its source), outdated (the source changed since it was translated), orphan, or missing. Use status to find work: missing = needs a translation, outdated = a translation to update.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: collectionArg,
        status: { type: 'string', enum: ['missing', 'outdated', 'draft'] },
        query: { type: 'string', description: 'Only articles whose title or body contains this.' },
        limit: { type: 'number', description: 'At most this many (default 50).' },
      },
    },
  },
  {
    name: 'get_article',
    description: 'One language of one article in full: title, description, date, tags, draft, other frontmatter fields, the Markdown body, and whether it is an original or a translation.',
    inputSchema: { type: 'object', properties: { collection: collectionArg, id: { type: 'string' }, lang: langArg }, required: ['id'] },
  },
  {
    name: 'write_article',
    description: [
      'Create or update one language of an article. Leave id out to create a new article (it is a draft unless draft is false); give id to update one, or to add a language to it.',
      'Only the parameters given change. The body is Markdown; images in it have to be added with add_image first. Do not repeat the title as a heading at the top of the body.',
      'Fields shared by every language (the date, the cover image, and any the site lists as shared) are copied to the other languages automatically.',
      'When the text is a translation, pass from = the language it was translated from: that records it as up to date with the source as it is now. Pass from again after updating a translation for a changed source. Do not pass from for a correction that was not based on the source.',
      'This writes files only. Call commit when the work is done.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        collection: collectionArg,
        id: { type: 'string', description: 'The article to update. Leave out to create one.' },
        lang: langArg,
        title: { type: 'string' },
        body: { type: 'string', description: 'Markdown.' },
        description: { type: 'string', description: 'A one-line summary. Leave empty to have it taken from the start of the body.' },
        tags: { type: 'array', items: { type: 'string' } },
        date: { type: 'string', description: 'ISO 8601. Shared by every language.' },
        draft: { type: 'boolean', description: 'true keeps this language off the site.' },
        fields: { type: 'object', description: 'Other frontmatter fields, e.g. the cover image field. null removes one.' },
        from: { type: 'string', description: 'The language this text was translated from.' },
      },
    },
  },
  {
    name: 'source_changes',
    description: 'For an outdated translation: what changed in its source since it was translated, as a line diff (- before, + now). Update only those parts of the translation, then write_article with from set.',
    inputSchema: { type: 'object', properties: { collection: collectionArg, id: { type: 'string' }, lang: langArg }, required: ['id', 'lang'] },
  },
  {
    name: 'mark_translation_current',
    description: 'Record that a translation needs nothing from the latest change to its source (a typo fixed in the source, say), without changing its text.',
    inputSchema: { type: 'object', properties: { collection: collectionArg, id: { type: 'string' }, lang: langArg }, required: ['id', 'lang'] },
  },
  {
    name: 'add_image',
    description: 'Save an image into the site (resized and converted to webp when the site has sharp) and return the path to use in Markdown: ![description](path).',
    inputSchema: { type: 'object', properties: { source: { type: 'string', description: 'An http(s) URL, a data:image/…;base64 URI, or a path to a file on this machine.' } }, required: ['source'] },
  },
  {
    name: 'commit',
    description:
      'Commit the article and image changes (only the content and media directories) on the current branch. It does not push. Before anything goes live a person should look at it: push to a branch and open a pull request, or follow the site’s own publishing steps, and tell the person what was written.',
    inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'What changed, in the language the site’s commits use.' } }, required: ['message'] },
  },
];

/**
 * Answer one JSON-RPC message; undefined for a notification, which gets no answer.
 * @param {ReturnType<typeof openSite>} site
 * @param {{ id?: number | string, method: string, params?: any }} msg
 */
export async function handle(site, msg) {
  const reply = (result) => (msg.id === undefined ? undefined : { jsonrpc: '2.0', id: msg.id, result });
  const error = (code, message) => (msg.id === undefined ? undefined : { jsonrpc: '2.0', id: msg.id, error: { code, message } });
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'simple-git-cms', version: VERSION },
        instructions: instructions(site),
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args = {} } = msg.params ?? {};
      try {
        const result = await call(site, name, args);
        return reply({ content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] });
      } catch (e) {
        // A mistake the AI can correct is a tool result, so it reads it and tries again
        if (e instanceof ContentError) return reply({ content: [{ type: 'text', text: e.message }], isError: true });
        return reply({ content: [{ type: 'text', text: `Failed: ${e.message}` }], isError: true });
      }
    }
    default:
      if (msg.method?.startsWith('notifications/')) return undefined;
      return error(-32601, `Unknown method: ${msg.method}`);
  }
}

function call(site, name, a) {
  switch (name) {
    case 'list_articles':
      return site.list(a);
    case 'get_article':
      return site.get(a);
    case 'write_article':
      return site.write(a);
    case 'source_changes':
      return site.sourceChanges(a);
    case 'mark_translation_current':
      return site.markCurrent(a);
    case 'add_image':
      return site.addImage(a);
    case 'commit':
      return site.commit(a);
    default:
      throw new ContentError(`No tool called ${name}.`);
  }
}

/** What the AI is told about this site when it connects. */
function instructions(site) {
  const lines = [`Articles of ${site.config.siteName ?? site.config.title ?? 'this site'}, in ${site.root}.`];
  for (const c of site.collections) {
    lines.push(`- ${c.name} (${c.label}): ${c.dir}${c.languages.length ? `, in ${c.languages.join(' and ')} (${c.languages[0]} is the default)` : ''}`);
  }
  if (site.collections.some((c) => c.languages.length)) {
    lines.push('Every language of an article is written with write_article; a translation is written with from set to its source language, and list_articles with status outdated or missing shows what needs doing.');
  }
  lines.push('New articles are drafts. Nothing is published by these tools: commit, then let a person review it.');
  return lines.join('\n');
}

const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev'; // eslint-disable-line no-undef

/** Start serving on stdin/stdout. */
export function serve(args) {
  const configPath = resolve(args[0] ?? ['public/editor/config.json', 'site/public/editor/config.json'].find((p) => existsSync(p)) ?? 'public/editor/config.json');
  let site;
  try {
    site = openSite({ configPath });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  console.error(`simple-git-cms MCP server: ${configPath}`);
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
      return;
    }
    const out = await handle(site, msg);
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  });
}
