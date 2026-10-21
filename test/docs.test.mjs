// The three READMEs print the same Content-Security-Policy. It is the one piece of the docs that
// is also a configuration someone pastes, so a translation drifting from it would be a bug rather
// than a wording difference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { policyFromReadme } from './e2e/policy.mjs';

test('every README recommends exactly the same policy', () => {
  const english = policyFromReadme('README.md');
  assert.equal(policyFromReadme('README.zh-CN.md'), english);
  assert.equal(policyFromReadme('README.ja.md'), english);
});

test('the policy is the strict one the editor was built to allow', () => {
  const policy = policyFromReadme();
  assert.match(policy, /script-src 'self';/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
  assert.match(policy, /frame-ancestors 'none'/);
});
