/**
 * List of supported OAuth providers.
 */
const supportedProviders = ['github', 'gitlab'];

/**
 * OAuth scopes for each provider: the scope to request when the client doesn’t ask for one, the
 * separator the provider expects between multiple scopes, and the scopes that may be requested.
 *
 * A client can ask for a narrower scope than the default — Sveltia CMS does this with its
 * `auth_scope` backend option, so a public repository doesn’t require access to a contributor’s
 * private ones — but only from this list. The endpoint is reachable by anyone, and a token minted
 * with a wider scope than the CMS needs keeps that scope for every later sign-in, so the request is
 * not taken on trust. Anything unrecognized falls back to the default, which is what an older
 * version of this worker granted regardless, so an unfamiliar client still signs in.
 *
 * GitHub’s `workflow` scope is wider than the default, so it’s only allowed when the
 * `GITHUB_ALLOW_WORKFLOW_SCOPE` environment variable is `true`: see {@link getScope}.
 * @type {Record<string, { default: string, separator: string, allowed: string[] }>}
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
 * @see https://docs.gitlab.com/api/oauth2/
 */
const providerScopes = {
  github: {
    default: 'repo,user',
    separator: ',',
    allowed: ['repo', 'public_repo', 'user', 'read:user', 'user:email'],
  },
  gitlab: {
    default: 'api',
    separator: ' ',
    allowed: ['api', 'read_api', 'read_user', 'read_repository', 'write_repository'],
  },
};

/**
 * Work out the OAuth scope to request from the given provider.
 * @param {string} provider - Backend name, e.g. `github`.
 * @param {string} [requested] - The `scope` parameter from the request, if any. Scopes may be
 * separated by commas or spaces, as the two providers differ.
 * @param {{ [key: string]: string }} env - Environment variables.
 * @returns {string} Scope to request.
 */
const getScope = (provider, requested, env) => {
  const { default: fallback, separator, allowed } = providerScopes[provider];
  let scopes = (requested ?? '').split(/[\s,]+/).filter(Boolean);
  const allowWorkflow = provider === 'github' && env.GITHUB_ALLOW_WORKFLOW_SCOPE === 'true';

  // The `workflow` scope lets a token change GitHub Actions workflows in every repository the user
  // can push to, so it takes the operator’s consent as well as the site’s. Without it, the scope is
  // left out rather than the request falling back to the default, which could be wider than what
  // was asked for, e.g. `repo` instead of `public_repo`
  if (!allowWorkflow && scopes.includes('workflow')) {
    // eslint-disable-next-line no-console
    console.warn(
      `Ignoring the "workflow" scope for ${provider}; set GITHUB_ALLOW_WORKFLOW_SCOPE to "true" ` +
        'to allow it.',
    );

    scopes = scopes.filter((scope) => scope !== 'workflow');
  }

  if (!scopes.length) {
    return fallback;
  }

  if (scopes.every((scope) => allowed.includes(scope) || (allowWorkflow && scope === 'workflow'))) {
    return scopes.join(separator);
  }

  // The default is wider than what was asked for, so a client that meant to narrow the scope
  // silently doesn’t. Leave a trace for whoever is running the worker
  // eslint-disable-next-line no-console
  console.warn(
    `Ignoring the unsupported "${requested}" scope for ${provider}; requesting "${fallback}".`,
  );

  return fallback;
};

/**
 * Escape the given string for safe use in a regular expression.
 * @param {string} str - Original string.
 * @returns {string} Escaped string.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
 */
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Convert the `ALLOWED_DOMAINS` environment variable into a list of anchored regular expression
 * sources. The sources are used both here and in the client-side script embedded in
 * {@link outputHTML}, so a hostname is matched by the exact same rules on either side.
 * @param {string} [allowedDomains] - Comma-separated list of hostnames, which may contain a
 * wildcard (`*`).
 * @returns {string[]} Regular expression sources. Empty if the variable is not configured.
 */
const getDomainPatterns = (allowedDomains) =>
  (allowedDomains ?? '')
    .split(/,/)
    .map((str) => str.trim())
    .filter(Boolean)
    // Escape the input, then replace a wildcard for regex
    .map((str) => `^${escapeRegExp(str).replaceAll('\\*', '.+')}$`);

/**
 * Serialize the given value for safe embedding in an inline `<script>` block.
 * @param {string | boolean | string[]} value - Value to be serialized.
 * @returns {string} JavaScript literal.
 */
const serialize = (value) => JSON.stringify(value ?? null).replaceAll('<', '\\u003c');

/**
 * Output HTML response that communicates with the window opener.
 * @param {object} args - Options.
 * @param {string} [args.provider] - Backend name, e,g. `github`.
 * @param {string} [args.token] - OAuth token.
 * @param {string} [args.error] - Error message when an OAuth token is not available.
 * @param {string} [args.errorCode] - Error code to be used to localize the error message in
 * Sveltia CMS.
 * @param {{ [key: string]: string }} [args.env] - Environment variables.
 * @returns {Response} Response with HTML.
 */
const outputHTML = ({ provider = 'unknown', token, error, errorCode, env = {} }) => {
  const state = error ? 'error' : 'success';
  const content = error ? { provider, error, errorCode } : { provider, token };

  return new Response(
    `
      <!doctype html><html><body><script>
        (() => {
          const trustedPatterns = ${serialize(getDomainPatterns(env.ALLOWED_DOMAINS))};
          const hasToken = ${serialize(!!token)};

          const isTrusted = (origin) => {
            try {
              const { hostname } = new URL(origin);

              return trustedPatterns.some((pattern) => new RegExp(pattern).test(hostname));
            } catch {
              return false;
            }
          };

          window.addEventListener('message', ({ data, origin }) => {
            if (data !== 'authorizing:${provider}') {
              return;
            }

            // Unlike the site_id parameter, which the caller supplies, the origin of a message
            // event is set by the browser and cannot be forged by the sender, so it’s the only
            // reliable indication of who opened this popup. An error carries no secret, so it’s
            // always passed through to keep the sign-in screen informative
            if (hasToken && trustedPatterns.length && !isTrusted(origin)) {
              return;
            }

            window.opener?.postMessage(
              'authorization:${provider}:${state}:${JSON.stringify(content)}',
              origin
            );
          });
          window.opener?.postMessage('authorizing:${provider}', '*');
        })();
      </script></body></html>
    `,
    {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        // Delete CSRF token
        'Set-Cookie': `csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure`,
      },
    },
  );
};

/**
 * Handle the `auth` method, which is the first request in the authorization flow.
 * @param {Request} request - HTTP request.
 * @param {{ [key: string]: string }} env - Environment variables.
 * @returns {Promise<Response>} HTTP response.
 */
const handleAuth = async (request, env) => {
  const { url } = request;
  const { origin, searchParams } = new URL(url);
  const {
    provider,
    site_id: domain,
    scope: requestedScope,
    redirect_uri: returnTo,
  } = Object.fromEntries(searchParams);

  if (!provider || !supportedProviders.includes(provider)) {
    return outputHTML({
      env,
      error: 'Your Git backend is not supported by the authenticator.',
      errorCode: 'UNSUPPORTED_BACKEND',
    });
  }

  const scope = getScope(provider, requestedScope, env);

  const {
    ALLOWED_DOMAINS,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_HOSTNAME = 'github.com',
    GITLAB_CLIENT_ID,
    GITLAB_CLIENT_SECRET,
    GITLAB_HOSTNAME = 'gitlab.com',
  } = env;

  const domainPatterns = getDomainPatterns(ALLOWED_DOMAINS);

  // Check if the domain is whitelisted
  if (
    domainPatterns.length &&
    !domainPatterns.some((pattern) => new RegExp(pattern).test(domain ?? ''))
  ) {
    return outputHTML({
      env,
      provider,
      error: 'Your domain is not allowed to use the authenticator.',
      errorCode: 'UNSUPPORTED_DOMAIN',
    });
  }

  // [simple-git-cms] 整页跳转模式：登录完成后带着令牌跳回 redirect_uri（必须是允许的域名），不依赖弹窗
  let returnCookie = '';

  if (returnTo) {
    let returnHost = '';

    try {
      const returnURL = new URL(returnTo);

      returnHost = returnURL.protocol === 'https:' ? returnURL.hostname : '';
    } catch {
      //
    }

    if (!returnHost || !domainPatterns.some((pattern) => new RegExp(pattern).test(returnHost))) {
      return new Response('redirect_uri is not allowed', { status: 400 });
    }

    returnCookie = `return-to=${encodeURIComponent(returnTo)}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`;
  }

  // Generate a random string for CSRF protection
  const csrfToken = globalThis.crypto.randomUUID().replaceAll('-', '');
  let authURL = '';

  // GitHub
  if (provider === 'github') {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return outputHTML({
        env,
        provider,
        error: 'OAuth app client ID or secret is not configured.',
        errorCode: 'MISCONFIGURED_CLIENT',
      });
    }

    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope,
      state: csrfToken,
    });

    authURL = `https://${GITHUB_HOSTNAME}/login/oauth/authorize?${params.toString()}`;
  }

  // GitLab
  if (provider === 'gitlab') {
    if (!GITLAB_CLIENT_ID || !GITLAB_CLIENT_SECRET) {
      return outputHTML({
        env,
        provider,
        error: 'OAuth app client ID or secret is not configured.',
        errorCode: 'MISCONFIGURED_CLIENT',
      });
    }

    const params = new URLSearchParams({
      client_id: GITLAB_CLIENT_ID,
      redirect_uri: `${origin}/callback`,
      response_type: 'code',
      scope,
      state: csrfToken,
    });

    authURL = `https://${GITLAB_HOSTNAME}/oauth/authorize?${params.toString()}`;
  }

  // Redirect to the authorization server
  const authHeaders = new Headers({ Location: authURL });

  // Cookie expires in 10 minutes; Use `SameSite=Lax` to make sure the cookie is sent by the
  // browser after redirect
  authHeaders.append(
    'Set-Cookie',
    `csrf-token=${provider}_${csrfToken}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`,
  );
  // 不是整页跳转模式时清掉上一次残留的 return-to
  authHeaders.append(
    'Set-Cookie',
    returnCookie || 'return-to=deleted; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure',
  );

  return new Response('', { status: 302, headers: authHeaders });
};

/**
 * Handle the `callback` method, which is the second request in the authorization flow.
 * @param {Request} request - HTTP request.
 * @param {{ [key: string]: string }} env - Environment variables.
 * @returns {Promise<Response>} HTTP response.
 */
const handleCallback = async (request, env) => {
  const { url, headers } = request;
  const { origin, searchParams } = new URL(url);
  const { code, state } = Object.fromEntries(searchParams);

  const [, provider, csrfToken] =
    headers.get('Cookie')?.match(/\bcsrf-token=([a-z-]+?)_([0-9a-f]{32})\b/) ?? [];

  if (!provider || !supportedProviders.includes(provider)) {
    return outputHTML({
      env,
      error: 'Your Git backend is not supported by the authenticator.',
      errorCode: 'UNSUPPORTED_BACKEND',
    });
  }

  if (!code || !state) {
    return outputHTML({
      env,
      provider,
      error: 'Failed to receive an authorization code. Please try again later.',
      errorCode: 'AUTH_CODE_REQUEST_FAILED',
    });
  }

  if (!csrfToken || state !== csrfToken) {
    return outputHTML({
      env,
      provider,
      error: 'Potential CSRF attack detected. Authentication flow aborted.',
      errorCode: 'CSRF_DETECTED',
    });
  }

  const {
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_HOSTNAME = 'github.com',
    GITLAB_CLIENT_ID,
    GITLAB_CLIENT_SECRET,
    GITLAB_HOSTNAME = 'gitlab.com',
  } = env;

  let tokenURL = '';
  let requestBody = {};

  // GitHub
  if (provider === 'github') {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return outputHTML({
        env,
        provider,
        error: 'OAuth app client ID or secret is not configured.',
        errorCode: 'MISCONFIGURED_CLIENT',
      });
    }

    tokenURL = `https://${GITHUB_HOSTNAME}/login/oauth/access_token`;
    requestBody = {
      code,
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
    };
  }

  if (provider === 'gitlab') {
    if (!GITLAB_CLIENT_ID || !GITLAB_CLIENT_SECRET) {
      return outputHTML({
        env,
        provider,
        error: 'OAuth app client ID or secret is not configured.',
        errorCode: 'MISCONFIGURED_CLIENT',
      });
    }

    tokenURL = `https://${GITLAB_HOSTNAME}/oauth/token`;
    requestBody = {
      code,
      client_id: GITLAB_CLIENT_ID,
      client_secret: GITLAB_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: `${origin}/callback`,
    };
  }

  let response;
  let token = '';
  let error = '';

  try {
    response = await fetch(tokenURL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    //
  }

  if (!response) {
    return outputHTML({
      env,
      provider,
      error: 'Failed to request an access token. Please try again later.',
      errorCode: 'TOKEN_REQUEST_FAILED',
    });
  }

  // [simple-git-cms] GitHub App 的令牌会过期，同时返回 refresh_token，一起交给编辑器
  let refreshToken = '';

  try {
    ({ access_token: token, refresh_token: refreshToken = '', error } = await response.json());
  } catch {
    return outputHTML({
      env,
      provider,
      error: 'Server responded with malformed data. Please try again later.',
      errorCode: 'MALFORMED_RESPONSE',
    });
  }

  const returnTo = decodeURIComponent(headers.get('Cookie')?.match(/\breturn-to=([^;]+)/)?.[1] ?? '');

  if (returnTo) {
    const hash = new URLSearchParams(
      token
        ? { access_token: token, ...(refreshToken ? { refresh_token: refreshToken } : {}) }
        : { error: error || 'unknown' },
    );

    const backHeaders = new Headers({
      Location: `${returnTo.split('#')[0]}#${hash.toString()}`,
      'Cache-Control': 'no-store',
    });

    backHeaders.append('Set-Cookie', 'return-to=deleted; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');
    backHeaders.append('Set-Cookie', 'csrf-token=deleted; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');

    return new Response('', { status: 302, headers: backHeaders });
  }

  return outputHTML({ env, provider, token, error });
};

/**
 * [simple-git-cms] 用 refresh_token 换新的访问令牌（GitHub App 的令牌 8 小时过期）。
 * 只接受来自 ALLOWED_DOMAINS 的网页的请求（CORS）。
 * @param {Request} request - HTTP request.
 * @param {{ [key: string]: string }} env - Environment variables.
 * @returns {Promise<Response>} HTTP response.
 */
const handleRefresh = async (request, env) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_HOSTNAME = 'github.com' } = env;
  const domainPatterns = getDomainPatterns(env.ALLOWED_DOMAINS);
  const origin = request.headers.get('Origin') ?? '';
  let originHost = '';

  try {
    const originURL = new URL(origin);

    originHost = originURL.protocol === 'https:' ? originURL.hostname : '';
  } catch {
    //
  }

  if (!originHost || !domainPatterns.some((pattern) => new RegExp(pattern).test(originHost))) {
    return new Response('origin is not allowed', { status: 403 });
  }

  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  const { refresh_token: refreshToken } = await request.json().catch(() => ({}));

  if (!refreshToken || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return json({ error: 'bad_request' }, 400);
  }

  let data;

  try {
    const response = await fetch(`https://${GITHUB_HOSTNAME}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    data = await response.json();
  } catch {
    return json({ error: 'token_request_failed' }, 502);
  }

  if (!data?.access_token) {
    return json({ error: data?.error || 'unknown' }, 401);
  }

  return json({ access_token: data.access_token, refresh_token: data.refresh_token ?? '' });
};

/**
 * [simple-git-cms] The main request handler. It takes a standard `Request` and a plain object of
 * environment variables and returns a standard `Response`, with no runtime-specific APIs in
 * between, so the same file runs unchanged on Cloudflare Workers, Deno Deploy, Vercel and Netlify
 * edge functions, Bun, and Node (see `server.js`).
 * @param {Request} request - HTTP request.
 * @param {{ [key: string]: string }} env - Environment variables.
 * @returns {Promise<Response>} HTTP response.
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 * @see https://docs.gitlab.com/ee/api/oauth2.html#authorization-code-flow
 */
export const handleRequest = async (request, env) => {
  const { method, url } = request;
  const { pathname } = new URL(url);

  if (method === 'GET' && ['/auth', '/oauth/authorize'].includes(pathname)) {
    return handleAuth(request, env);
  }

  if (method === 'GET' && ['/callback', '/oauth/redirect'].includes(pathname)) {
    return handleCallback(request, env);
  }

  if (['POST', 'OPTIONS'].includes(method) && pathname === '/refresh') {
    return handleRefresh(request, env);
  }

  return new Response('', { status: 404 });
};

/**
 * [simple-git-cms] Environment variables for runtimes that don't hand them to the fetch handler.
 * Cloudflare Workers pass them in as the second argument; Deno, Bun and Node keep them on the
 * process instead.
 * @returns {{ [key: string]: string }} Environment variables, possibly empty.
 */
const ambientEnv = () => {
  if (typeof process !== 'undefined' && process.env) return process.env;
  // eslint-disable-next-line no-undef
  if (typeof Deno !== 'undefined') return Deno.env.toObject();
  return {};
};

/**
 * [simple-git-cms] Default export in the shape every edge runtime understands. Cloudflare Workers call
 * `fetch(request, env)`; the others call `fetch(request)` and the variables are read off the
 * process instead.
 * @see https://developers.cloudflare.com/workers/runtime-apis/fetch/
 */
export default {
  fetch: (request, env) => handleRequest(request, env && Object.keys(env).length ? env : ambientEnv()),
};
