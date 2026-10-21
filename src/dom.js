// Small helpers every part of the interface uses: element lookup, icons, the toast and the busy
// overlay.
import { icons } from './icons.js';
import { AuthError } from './github.js';
import { emit } from './store.js';

export const $ = (s) => document.querySelector(s);

/** Fill every [data-icon] element with that icon's SVG. */
export const fillIcons = (root = document) =>
  root.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icons[el.dataset.icon] ?? ''));

let toastTimer;
export function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), kind === 'error' ? 6000 : 2800);
}

/** Run `fn` behind the busy overlay. Anything it throws becomes a notice rather than an exception;
 * an expired session is announced so the sign-in screen can come back. */
export async function busy(text, fn) {
  $('#busy-text').textContent = text;
  $('#busy').hidden = false;
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return emit('auth:expired', e.message);
    toast(e.message || String(e), 'error');
    console.error(e);
  } finally {
    $('#busy').hidden = true;
  }
}
