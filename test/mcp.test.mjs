// The MCP server's side of the conversation: what an AI tool sends and what it gets back.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOOLS, handle } from '../scripts/mcp.mjs';
import { openSite } from '../scripts/site-content.mjs';

const root = mkdtempSync(join(tmpdir(), 'sgcms-mcp-'));
execFileSync('git', ['-C', root, 'init', '-q']);
mkdirSync(join(root, 'public/editor'), { recursive: true });
writeFileSync(
  join(root, 'public/editor/config.json'),
  JSON.stringify({ siteName: 'Example', repo: 'o/r', auth: { base: '/a' }, media: { dir: 'public/uploads' }, languages: ['ja', 'zh'], collections: [{ name: 'news', label: 'News', dir: 'content/news' }] }),
);
const site = openSite({ configPath: join(root, 'public/editor/config.json') });
after(() => rmSync(root, { recursive: true, force: true }));

const ask = (method, params, id = 1) => handle(site, { jsonrpc: '2.0', id, method, params });

test('initialize says what the server can do and what the site is', async () => {
  const { result } = await ask('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test' } });
  assert.equal(result.protocolVersion, '2025-03-26');
  assert.deepEqual(result.capabilities, { tools: {} });
  assert.match(result.instructions, /news \(News\): content\/news, in ja and zh/);
});

test('a notification gets no answer, an unknown method an error', async () => {
  assert.equal(await handle(site, { jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
  assert.equal((await ask('resources/list')).error.code, -32601);
});

test('every tool has a description and an object schema', async () => {
  const { result } = await ask('tools/list');
  assert.deepEqual(
    result.tools.map((t) => t.name),
    TOOLS.map((t) => t.name),
  );
  for (const tool of result.tools) {
    assert.ok(tool.description.length > 40, tool.name);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('a tool call answers in text, and a mistake comes back as a result the AI can read', async () => {
  const made = await ask('tools/call', { name: 'write_article', arguments: { title: 'T', body: 'B' } });
  const article = JSON.parse(made.result.content[0].text);
  assert.equal(article.lang, 'ja');

  const wrong = await ask('tools/call', { name: 'get_article', arguments: { id: article.id, lang: 'zh' } });
  assert.equal(wrong.result.isError, true);
  assert.match(wrong.result.content[0].text, /no zh version/);

  const unknown = await ask('tools/call', { name: 'delete_everything', arguments: {} });
  assert.equal(unknown.result.isError, true);
});
