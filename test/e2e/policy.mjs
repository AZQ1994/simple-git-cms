// The Content-Security-Policy the README tells people to serve the editor with. The browser tests
// read it from the README rather than keeping a copy, so the advice and the thing under test
// cannot drift apart: change one and the other changes with it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BLOCK = /<!-- csp:begin -->\n```http\n([\s\S]*?)\n```\n<!-- csp:end -->/;

/** The policy as one header line. Throws if the README stopped carrying it. */
export function policyFromReadme(file = 'README.md') {
  const found = BLOCK.exec(readFileSync(join(root, file), 'utf8'));
  if (!found) throw new Error(`${file} has no <!-- csp:begin --> block; the browser tests serve the policy it prints`);
  return found[1].replace(/^Content-Security-Policy:/, '').replace(/\s+/g, ' ').trim();
}
