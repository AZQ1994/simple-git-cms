// Regenerate THIRD-PARTY-NOTICES.md from the packages that actually end up in the bundles.
// Run it after changing dependencies: npm run licenses
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'THIRD-PARTY-NOTICES.md');

/** Bundle each entry point and collect the npm packages that contributed code. */
async function bundledPackages(entry, define = {}) {
  const result = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2022',
    define,
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const names = new Set();
  for (const output of Object.values(result.metafile.outputs)) {
    for (const input of Object.keys(output.inputs)) {
      const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
      if (m) names.add(m[1]);
    }
  }
  return names;
}

/** Read a package's license id and license text out of node_modules. */
function licenseOf(name) {
  const dir = path.join(root, 'node_modules', name);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const id = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? pkg.licenses?.[0]?.type ?? 'UNKNOWN');
  const file = fs
    .readdirSync(dir)
    .find((f) => /^(LICENSE|LICENCE|COPYING)(\.|$)/i.test(f));
  const text = file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : '';
  // The copyright line is the part the MIT and BSD licenses require us to carry
  const copyright = text.match(/^.*copyright \(c\).*$/im)?.[0]?.trim() ?? '';
  return { id, copyright, homepage: pkg.homepage ?? `https://www.npmjs.com/package/${name}`, version: pkg.version };
}

const names = new Set([
  ...(await bundledPackages('src/app.js', { __PREVIEW_JS__: '"./preview.js"' })),
  ...(await bundledPackages('src/preview.js')),
]);

const rows = [...names].sort().map((name) => ({ name, ...licenseOf(name) }));
const unknown = rows.filter((r) => r.id === 'UNKNOWN');
if (unknown.length) {
  console.error(`Could not determine a license for: ${unknown.map((r) => r.name).join(', ')}`);
  process.exit(1);
}

const body = `# Third-party notices

The built editor (\`dist/app.js\` and \`dist/preview.js\`) bundles the npm packages below. Their
license texts are also appended to the bundles themselves, so a deployed copy carries its own
notices. The relay in \`auth/\` is derived from a separate project — see [auth/LICENSE](auth/LICENSE).

Regenerate this file with \`npm run licenses\`.

| Package | Version | License | Copyright |
|---|---|---|---|
${rows.map((r) => `| [${r.name}](${r.homepage}) | ${r.version} | ${r.id} | ${r.copyright.replace(/\|/g, '\\|') || '—'} |`).join('\n')}
`;

fs.writeFileSync(out, body);
console.log(`THIRD-PARTY-NOTICES.md: ${rows.length} bundled packages`);
