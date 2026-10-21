// Light or dark. The button cycles through three settings: follow the computer, light, dark.
//
// The resolving happens here rather than in a CSS media query, so the stylesheet has one set of
// dark colours to keep rather than two. Nothing is painted before this runs — the page is empty
// until app.js fills it in.
import { $, fillIcons } from './dom.js';
import { on } from './store.js';
import { t } from './i18n/index.js';

const KEY = 'simple-git-cms-theme';
const ORDER = ['auto', 'light', 'dark'];
const ICON = { auto: 'contrast', light: 'sun', dark: 'moon' };

const system = matchMedia('(prefers-color-scheme: dark)');

let choice = localStorage.getItem(KEY) ?? 'auto';
if (!ORDER.includes(choice)) choice = 'auto';

function apply() {
  document.documentElement.dataset.theme = choice === 'auto' ? (system.matches ? 'dark' : 'light') : choice;
  const button = $('#theme');
  if (!button) return;
  button.querySelector('[data-icon]').dataset.icon = ICON[choice];
  fillIcons(button);
  button.title = t(`theme.${choice}`);
  button.setAttribute('aria-label', button.title);
}

system.addEventListener('change', () => choice === 'auto' && apply());
on('relabel', apply); // the button's title is in the interface language

$('#theme')?.addEventListener('click', () => {
  choice = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  localStorage.setItem(KEY, choice);
  apply();
});

apply();
