// The sign-in relay, as far as it can be checked without a real GitHub: which requests it answers,
// and where it sends the browser. Mostly about PUBLIC_URL, which lets it live under a site's path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../auth/index.js';

const env = (extra = {}) => ({
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'secret',
  GITLAB_CLIENT_ID: 'id',
  GITLAB_CLIENT_SECRET: 'secret',
  ALLOWED_DOMAINS: 'example.com',
  ...extra,
});

const signIn = (url, extra) =>
  handleRequest(
    new Request(`${url}?provider=gitlab&site_id=example.com&redirect_uri=${encodeURIComponent('https://example.com/editor/')}`),
    env(extra),
  );

const cookies = (res) => res.headers.getSetCookie();

test('at a host of its own it answers at the root, as before', async () => {
  const res = await signIn('https://auth.example.com/auth');
  assert.equal(res.status, 302);
  const location = new URL(res.headers.get('Location'));
  assert.equal(location.searchParams.get('redirect_uri'), 'https://auth.example.com/callback');
  assert.ok(cookies(res).every((c) => c.includes('Path=/;')), 'cookies cover the whole host');
});

test('under PUBLIC_URL it answers at the prefixed path, with or without the proxy stripping it', async () => {
  const extra = { PUBLIC_URL: 'https://example.com/cms-auth/' };
  for (const url of ['https://example.com/cms-auth/auth', 'http://127.0.0.1:8788/auth']) {
    const res = await signIn(url, extra);
    assert.equal(res.status, 302, url);
    const location = new URL(res.headers.get('Location'));
    assert.equal(location.searchParams.get('redirect_uri'), 'https://example.com/cms-auth/callback', url);
    assert.ok(cookies(res).every((c) => c.includes('Path=/cms-auth;')), 'cookies stay under the prefix');
  }
});

test('under PUBLIC_URL the rest of the site is not the relay', async () => {
  const res = await signIn('https://example.com/cms-authx/auth', { PUBLIC_URL: 'https://example.com/cms-auth' });
  assert.equal(res.status, 404);
});

test('a GitHub sign-in leaves the callback to the App settings', async () => {
  const res = await handleRequest(
    new Request('https://example.com/cms-auth/auth?provider=github&site_id=example.com'),
    env({ PUBLIC_URL: 'https://example.com/cms-auth' }),
  );
  const location = new URL(res.headers.get('Location'));
  assert.equal(location.host, 'github.com');
  assert.equal(location.searchParams.get('redirect_uri'), null);
});

test('the callback clears its cookies under the same path it set them', async () => {
  const res = await handleRequest(
    new Request('https://example.com/cms-auth/callback'),
    env({ PUBLIC_URL: 'https://example.com/cms-auth' }),
  );
  assert.ok(cookies(res).some((c) => c.startsWith('csrf-token=deleted') && c.includes('Path=/cms-auth;')));
});
