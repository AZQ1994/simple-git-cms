// A GitHub that only exists for the length of one test run: enough of the REST and GraphQL calls
// src/github.js makes to drive the real editor. It holds the repository in memory, so a test can
// read back exactly what was committed.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const sha = (s) => createHash('sha1').update(s).digest('hex');

const article = (title, date, tags, body, draft) =>
  `---\ntitle: ${JSON.stringify(title)}\ndescription: ""\ndate: ${date}\ntags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]\n${draft ? 'draft: true\n' : ''}---\n\n${body}\n`;

/** Exactly as the editor writes a table, so a round trip through it can be compared byte for byte. */
export const TABLE = `| Course | Starts |    Fee |
| :----- | :----: | -----: |
| A1     | April  | 42,000 |
| A2     |  July  | 48,000 |`;

/** A table a pipe table could not hold: the header spans two columns. */
export const HTML_TABLE = `<table>
  <tr>
    <th>Course</th>
    <th colspan="2">Spring</th>
  </tr>
  <tr>
    <td>A1</td>
    <td style="text-align: right">42,000</td>
    <td>April</td>
  </tr>
</table>`;

/** A block this site has defined for itself in config.blocks. */
export const BLOCK = '<YouTube id="dQw4w9WgXcQ" />';

/** An embed exactly as a video service hands it over: eight attributes, most of them noise. */
export const VIDEO =
  '<iframe width="560" height="315" src="https://player.vimeo.com/video/76979871?h=8272103f6e" title="Vimeo video player" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';

/** Something the editor has no node for, which has to come back out of it unchanged. */
export const EMBED = '<iframe src="https://www.youtube.com/embed/abc123" width="560" height="315" allowfullscreen></iframe>';

export const CONTENT_DIR = 'site/content/news';
/** A second collection, for switching between them. */
export const NOTICES_DIR = 'site/content/notices';
/** A third, whose articles have fields of their own (collections[].fields). */
export const EVENTS_DIR = 'site/content/events';
export const MEDIA_DIR = 'site/public/uploads';

/** An event as the editor would write it. Its seats are text where the config says a number, as a
 * file written by hand might have them: the editor has to leave that alone unless it is changed. */
export const EVENT = `---
title: "Open day"
description: "Come and see the school."
date: 2026-10-20T00:00:00.000Z
tags: []
venue: Main hall
seats: about 100
status: open
starts: 2026-11-15
---

Come and see the school.
`;

/** The repository every test starts from. */
export const seed = () =>
  new Map([
    // This one carries a table, so a test can check that opening and saving leaves it alone
    [`${CONTENT_DIR}/202610150930.md`, article('Spring term enrolment is open', '2026-10-15T09:30:00.000Z', ['notice'], `Applications are open from today.\n\n${TABLE}\n\n${HTML_TABLE}\n\n${EMBED}\n\n${BLOCK}\n\n${VIDEO}`, false)],
    [`${CONTENT_DIR}/202610120800.md`, article('Autumn festival photos', '2026-10-12T08:00:00.000Z', ['events'], 'Thank you to everyone who came.', false)],
    [`${CONTENT_DIR}/202610010000.md`, article('Draft: timetable changes', '2026-10-01T00:00:00.000Z', ['notice'], 'Still being finalised.', true)],
    // Its id is one the news has too: an id is only unique within its own collection
    [`${NOTICES_DIR}/202610120800.md`, article('Library closed on Monday', '2026-10-12T08:00:00.000Z', [], 'For the inventory.', false)],
    [`${EVENTS_DIR}/202610200000.md`, EVENT],
  ]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept',
};

export async function startFakeGitHub() {
  let files = seed();
  const blobs = new Map();
  const trees = new Map();
  const commits = [];
  const dispatches = [];
  const queries = [];
  let head = 'c0';
  // What the branch pointed at over time, oldest first, so the history has something to read
  const log = [{ sha: 'c0', message: 'Seed', date: '2026-10-01T00:00:00Z', files }];

  const send = (res, status, data) => {
    res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const raw = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    const body = raw ? JSON.parse(raw) : null;

    if (p === '/user') return send(res, 200, { login: 'tester', name: 'Tester', avatar_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
    if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return send(res, 200, { permissions: { push: true } });

    if (p === '/graphql') {
      queries.push(body.query);
      const path = (expr) => expr.slice(expr.indexOf(':') + 1);
      // The listing: every article file in the collection, names and hashes
      if (body.query.includes('on Tree')) {
        const dir = `${path(body.variables.expr)}/`;
        const entries = [...files]
          .filter(([f]) => f.startsWith(dir) && f.endsWith('.md'))
          .map(([f, text]) => ({ name: f.slice(dir.length), oid: sha(text) }));
        return send(res, 200, { data: { repository: { object: { entries } } } });
      }
      // The bodies: one aliased field per article asked for
      const repository = {};
      for (const [k, expr] of Object.entries(body.variables)) {
        if (!/^f\d+$/.test(k)) continue;
        const text = files.get(path(expr));
        repository[k] = text === undefined ? null : { text };
      }
      return send(res, 200, { data: { repository } });
    }

    // The commits that changed one file, newest first: those where it differs from the one before
    if (/^\/repos\/[^/]+\/[^/]+\/commits$/.test(p)) {
      const path = url.searchParams.get('path');
      const touched = log.filter((c, i) => i === 0 ? c.files.has(path) : c.files.get(path) !== log[i - 1].files.get(path));
      return send(res, 200, touched.reverse().map((c) => ({ sha: c.sha, commit: { message: c.message, author: { name: 'Tester', date: c.date } }, author: { login: 'tester' } })));
    }

    const contents = p.match(/\/contents\/(.+)$/);
    if (contents) {
      const ref = url.searchParams.get('ref');
      const at = ref && ref !== 'main' ? log.find((c) => c.sha === ref)?.files ?? new Map() : files;
      const f = at.get(decodeURIComponent(contents[1]));
      return f === undefined
        ? send(res, 404, { message: 'Not Found' })
        : send(res, 200, { sha: sha(f), content: Buffer.from(f).toString('base64') });
    }

    if (p.endsWith('/git/blobs')) {
      const content = body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : body.content;
      const s = sha(body.encoding === 'base64' ? `bin:${content.length}:${sha(content.toString('latin1'))}` : content);
      blobs.set(s, content);
      return send(res, 200, { sha: s });
    }
    if (/\/git\/ref\/heads\//.test(p)) return send(res, 200, { object: { sha: head } });
    if (/\/git\/commits\/[\w-]+$/.test(p)) return send(res, 200, { tree: { sha: `tree-${head}` } });
    if (p.endsWith('/git/trees')) {
      const next = new Map(files);
      for (const e of body.tree) (e.sha === null ? next.delete(e.path) : next.set(e.path, blobs.get(e.sha)));
      const t = `tree-${trees.size + 1}`;
      trees.set(t, next);
      return send(res, 200, { sha: t });
    }
    if (p.endsWith('/git/commits') && req.method === 'POST') {
      const s = `commit-${body.tree}`;
      commits.push({ sha: s, tree: body.tree, message: body.message });
      return send(res, 200, { sha: s, message: body.message });
    }
    if (/\/git\/refs\/heads\//.test(p) && req.method === 'PATCH') {
      const c = commits.find((x) => x.sha === body.sha);
      if (!c) return send(res, 422, { message: 'Update is not a fast forward' });
      files = trees.get(c.tree);
      head = c.sha;
      log.push({ sha: c.sha, message: c.message, date: new Date(Date.parse('2026-10-20T00:00:00Z') + log.length * 60_000).toISOString(), files });
      return send(res, 200, { object: { sha: head } });
    }
    const dispatch = p.match(/\/actions\/workflows\/([^/]+)\/dispatches$/);
    if (dispatch && req.method === 'POST') {
      dispatches.push({ workflow: decodeURIComponent(dispatch[1]), ...body });
      return send(res, 200, { workflow_run_id: 7, run_url: `${p}/7`, html_url: 'https://example.invalid/runs/7' });
    }
    if (p.endsWith('/actions/runs/7')) return send(res, 200, { status: 'completed', conclusion: 'success' });
    if (p.includes('/actions/runs')) return send(res, 200, { workflow_runs: [{ status: 'completed', conclusion: 'success' }] });

    return send(res, 500, { message: `the fake GitHub does not answer ${req.method} ${p}` });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    /** What is in the repository right now. */
    get files() {
      return files;
    },
    /** Every commit made, newest last. */
    /** Every workflow started through the API: { workflow, ref, … } */
    get dispatches() {
      return dispatches;
    },
    get commits() {
      return commits;
    },
    /** Every GraphQL query asked for, to show what the editor does and doesn't download. */
    get queries() {
      return queries;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
