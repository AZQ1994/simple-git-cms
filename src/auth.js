// Signing in and out, and keeping the access token fresh.
import { $ } from './dom.js';
import { CONFIG, emit, on, state } from './store.js';
import { confirmDiscard } from './doc.js';
import { t } from './i18n/index.js';

export const TOKEN_KEY = 'simple-git-cms-token';
export const REFRESH_KEY = 'simple-git-cms-refresh'; // only after a GitHub App sign-in; trades for a new token

export function showLogin(error) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const el = $('#login-error');
  el.textContent = error ?? '';
  el.hidden = !error;
}

export function logout(reason) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  state.dirty = false;
  showLogin(reason);
}

// A request that came back 401 and could not be refreshed ends the session
on('auth:expired', (message) => logout(message));

// Trade the refresh token for a new access token when it expires. A refresh token is single-use,
// so concurrent requests all wait on the same exchange.
let refreshing = null;
export function refreshToken() {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return Promise.resolve(null);
  refreshing ??= fetch(`${CONFIG.auth.base}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data?.access_token) return null;
      localStorage.setItem(TOKEN_KEY, data.access_token);
      if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
      return data.access_token;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

/** Pull a token out of the URL fragment after coming back from the sign-in relay. Returns an error
 * message if the relay reported one. */
export function takeTokenFromHash() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('access_token')) {
    localStorage.setItem(TOKEN_KEY, hash.get('access_token'));
    if (hash.get('refresh_token')) localStorage.setItem(REFRESH_KEY, hash.get('refresh_token'));
    else localStorage.removeItem(REFRESH_KEY);
  }
  if (hash.has('access_token') || hash.has('error')) history.replaceState(null, '', location.pathname);
  return hash.get('error') ? t('login.failed', { error: hash.get('error') }) : null;
}

$('#login-github').addEventListener('click', () => {
  const params = new URLSearchParams({
    provider: 'github',
    site_id: location.hostname,
    redirect_uri: location.origin + location.pathname,
  });
  location.href = `${CONFIG.auth.base}/auth?${params}`;
});

$('#token-form').addEventListener('submit', (e) => {
  e.preventDefault();
  localStorage.setItem(TOKEN_KEY, e.target.token.value.trim());
  localStorage.removeItem(REFRESH_KEY);
  e.target.reset();
  emit('auth:signed-in');
});

$('#logout').addEventListener('click', () => {
  if (confirmDiscard()) logout();
});
