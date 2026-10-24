// Buttons that start GitHub Actions workflows: one per entry in config.json's `actions` — say, the
// step from a test site, where the editor lives, to the site everyone sees, or a rebuild. After a
// click the button's own line follows the run, the same way the bar follows a save's deployment.
import { $, busy, toast } from './dom.js';
import { icons } from './icons.js';
import { CONFIG, state, store } from './store.js';
import { t } from './i18n/index.js';

/** Draw the buttons. Called once someone is signed in. */
export function showActions() {
  const box = $('#actions');
  box.replaceChildren();
  // Locally there is no GitHub to start anything on
  box.hidden = !CONFIG.actions.length || Boolean(store.local);
  if (box.hidden) return;
  for (const action of CONFIG.actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost block';
    button.innerHTML = icons.play;
    button.append(action.label);
    const status = document.createElement('span');
    status.className = 'deploy';
    status.setAttribute('role', 'status');
    status.hidden = true;
    button.addEventListener('click', () => run(action, status));
    box.append(button, status);
  }
}

async function run(action, status) {
  const { label, workflow, ref, inputs } = action;
  let text = action.confirm || t('actions.confirm', { label, workflow, ref });
  // What is still in the form isn't in the repository, so the workflow won't see it
  if (state.dirty) text += `\n\n${t('actions.unsaved')}`;
  if (!confirm(text)) return;
  await busy(t('actions.starting'), async () => {
    const since = Date.now();
    let runId;
    try {
      runId = await store.runWorkflow({ workflow, ref, inputs });
    } catch (e) {
      // 403: the sign-in may not start workflows; 404: no such workflow; 422: it has no
      // workflow_dispatch trigger, no such branch, or inputs it doesn't take
      if (e.status === 403) throw new Error(t('actions.forbidden'), { cause: e });
      if (e.status === 404 || e.status === 422) throw new Error(t('actions.notFound', { workflow, ref, message: e.message }), { cause: e });
      throw e;
    }
    watch(action, status, { workflow, ref, runId, since });
  });
}

const timers = new WeakMap();
function watch(action, el, run) {
  clearTimeout(timers.get(el));
  const { label } = action;
  el.hidden = false;
  el.className = 'deploy pending';
  el.textContent = t('actions.pending', { label });
  const tick = async () => {
    let s = 'pending';
    try {
      s = await store.workflowStatus(run);
    } catch {
      //
    }
    if (s === 'success') {
      el.className = 'deploy ok';
      el.innerHTML = icons.check;
      el.append(t('actions.success', { label }));
      if (action.url) {
        const a = document.createElement('a');
        a.href = action.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = t('actions.view');
        el.append(' · ', a);
      }
      toast(t('actions.success', { label }));
    } else if (s === 'failure' || s === 'superseded') {
      el.className = 'deploy fail';
      el.textContent = t('actions.failure', { label });
    } else if (Date.now() - run.since < 20 * 60_000) {
      timers.set(el, setTimeout(tick, 6000));
    } else {
      el.hidden = true; // still not done after 20 minutes: the run page on GitHub is the place to look
    }
  };
  timers.set(el, setTimeout(tick, 5000));
}
