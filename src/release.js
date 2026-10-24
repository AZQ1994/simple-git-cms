// The release button: when config.json has `release`, one click starts that GitHub Actions
// workflow — typically the step from a test site, where the editor lives, to the site everyone
// sees. Then the sidebar follows the run, the same way the bar follows a save's deployment.
import { $, busy, toast } from './dom.js';
import { icons } from './icons.js';
import { CONFIG, on, state, store } from './store.js';
import { t } from './i18n/index.js';

const label = () => CONFIG.release?.label || t('release.button');

/** Show the button when there is something for it to start. Called once someone is signed in. */
export function showRelease() {
  // Locally there is no GitHub to start anything on
  $('#release').hidden = !CONFIG.release || Boolean(store.local);
  $('#release-label').textContent = label();
}

$('#release').addEventListener('click', async () => {
  const { workflow, ref } = CONFIG.release;
  let text = t('release.confirm', { label: label(), ref });
  // What is still in the form isn't in the repository, so it can't go out with the rest
  if (state.dirty) text += `\n\n${t('release.unsaved')}`;
  if (!confirm(text)) return;
  await busy(t('release.starting'), async () => {
    const since = Date.now();
    let runId;
    try {
      runId = await store.release({ workflow, ref });
    } catch (e) {
      // 403: the sign-in may not start workflows; 404: no such workflow; 422: it has no
      // workflow_dispatch trigger, or no such branch
      if (e.status === 403) throw new Error(t('release.forbidden'), { cause: e });
      if (e.status === 404 || e.status === 422) throw new Error(t('release.notFound', { workflow, ref }), { cause: e });
      throw e;
    }
    watchRelease({ workflow, ref, runId, since });
  });
});

let timer;
function watchRelease(run) {
  clearTimeout(timer);
  const el = $('#release-status');
  el.hidden = false;
  el.className = 'deploy pending';
  el.textContent = t('release.pending');
  const tick = async () => {
    let s = 'pending';
    try {
      s = await store.releaseStatus(run);
    } catch {
      //
    }
    if (s === 'success') {
      el.className = 'deploy ok';
      el.innerHTML = icons.check;
      el.append(t('release.success'));
      if (CONFIG.release.url) {
        const a = document.createElement('a');
        a.href = CONFIG.release.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = t('release.view');
        el.append(' · ', a);
      }
      toast(t('release.success'));
    } else if (s === 'failure' || s === 'superseded') {
      el.className = 'deploy fail';
      el.textContent = t('release.failure');
    } else if (Date.now() - run.since < 20 * 60_000) {
      timer = setTimeout(tick, 6000);
    } else {
      el.hidden = true; // still not done after 20 minutes: the run page is the place to look
    }
  };
  timer = setTimeout(tick, 5000);
}

on('relabel', () => {
  if (CONFIG?.release) $('#release-label').textContent = label();
});
