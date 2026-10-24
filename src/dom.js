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
let offered = null; // the action on the toast showing, until it is taken or the toast goes

/**
 * A short notice at the bottom. `action` puts one button on it — { label, run, expired } — and
 * keeps it up longer: pressing it calls run(); the notice going without it (timing out, or another
 * notice taking its place) calls expired(), so whatever the action could undo can be let go.
 */
export function toast(msg, kind = 'ok', action = null) {
  const el = $('#toast');
  const gone = offered;
  offered = null;
  gone?.expired?.();
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  if (action) {
    offered = action;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      offered = null;
      clearTimeout(toastTimer);
      el.hidden = true;
      action.run();
    });
    el.append(b);
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      el.hidden = true;
      const left = offered;
      offered = null;
      left?.expired?.();
    },
    action ? 10000 : kind === 'error' ? 6000 : 2800,
  );
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
