// The inputs for the open collection's own fields (collections[].fields), under the date and tags.
// What each type reads from the file and writes back is in fields.js; this is only the form.
//
// Only a field someone has changed is written back. One that wasn't touched leaves the file as it
// was, so a value the input can't show — text in a number field, a choice that has since left the
// list — survives being opened and saved.
import { $ } from './dom.js';
import { COLLECTION } from './store.js';
import { t } from './i18n/index.js';
import { fieldLabel, fieldOptions, fieldType, fits, fromInput, toInput } from './fields.js';

/** Up to this many fields are simply there; more than that can be folded away under a heading. */
const FEW = 6;

let rows = []; // { field, box, input, warn, raw, touched }
let changed = () => {};

export const formFields = () => COLLECTION?.fields ?? [];

/** Called whenever someone changes one of the fields. */
export const onFieldChange = (fn) => (changed = fn);

const shown = (raw) => {
  const s = JSON.stringify(raw) ?? String(raw);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

function makeInput(f, raw) {
  const type = fieldType(f);
  let input;
  if (type === 'select') {
    input = document.createElement('select');
    const none = new Option(t('fields.none'), '');
    none.dataset.none = '';
    input.append(none, ...fieldOptions(f).map((o) => new Option(o.label, String(o.value))));
    // A value that isn't one of the options stays on offer, said to be what it is
    if (raw !== undefined && raw !== null && typeof raw !== 'object' && !fits(f, raw)) {
      const odd = new Option(t('fields.notInList', { value: raw }), String(raw));
      odd.dataset.odd = String(raw);
      input.append(odd);
    }
    input.value = toInput(f, raw);
  } else if (type === 'text' && f.multiline) {
    input = document.createElement('textarea');
    input.rows = 3;
    input.value = toInput(f, raw);
  } else {
    input = document.createElement('input');
    input.type = { number: 'number', boolean: 'checkbox', date: 'date' }[type] ?? 'text';
    if (type === 'boolean') input.checked = toInput(f, raw);
    else input.value = toInput(f, raw);
    if (type === 'number') {
      input.inputMode = 'decimal';
      for (const k of ['min', 'max', 'step']) if (f[k] !== undefined) input[k] = String(f[k]);
      // Without a step of its own, the browser would call any decimal a mistake
      if (f.step === undefined) input.step = 'any';
    }
  }
  input.id = `f-field-${f.name}`;
  input.dataset.field = f.name;
  if (f.placeholder && 'placeholder' in input) input.placeholder = f.placeholder;
  if (f.required) input.setAttribute('aria-required', 'true');
  return input;
}

/** Build the inputs for an article, from its frontmatter beyond the built-in fields. */
export function showFields(extra) {
  const fields = formFields();
  const box = $('#fields');
  box.hidden = !fields.length;
  box.classList.toggle('few', fields.length <= FEW);
  if (fields.length <= FEW) box.open = true; // there is no heading to open it with
  rows = fields.map((f) => {
    const raw = extra?.[f.name];
    const type = fieldType(f);
    const row = { field: f, raw, touched: false };
    row.box = document.createElement('label');
    row.box.className = `field field-${type}${type === 'text' && f.multiline ? ' wide' : ''}${f.required ? ' required' : ''}`;
    row.input = makeInput(f, raw);
    const name = document.createElement('span');
    name.className = 'field-label';
    name.textContent = fieldLabel(f);
    if (type === 'boolean') {
      row.box.append(row.input, name);
    } else {
      const control = document.createElement('span');
      control.className = 'field-control';
      control.append(row.input);
      if (f.unit) control.append(Object.assign(document.createElement('span'), { className: 'field-unit', textContent: f.unit }));
      row.box.append(name, control);
    }
    row.warn = document.createElement('span');
    row.warn.className = 'field-warn';
    // A select says it in its own option, so there is nothing to add under it
    row.warn.hidden = raw === undefined || fits(f, raw) || (type === 'select' && typeof raw !== 'object');
    row.box.append(row.warn);
    const touch = () => {
      row.touched = true;
      row.warn.hidden = true;
      row.box.classList.remove('missing');
      changed();
    };
    row.input.addEventListener('input', touch);
    row.input.addEventListener('change', touch);
    return row;
  });
  $('#fields-grid').replaceChildren(...rows.map((r) => r.box));
  relabelFields();
}

/** Write the fields someone changed into the frontmatter. Assigning to a key that is already there
 * keeps its place in the file; a new one goes after the rest, in the order config.json lists them. */
export function collectFields(extra) {
  for (const { field, input, touched } of rows) {
    if (!touched) continue;
    const v = fromInput(field, fieldType(field) === 'boolean' ? input.checked : input.value);
    if (v === undefined) delete extra[field.name];
    else extra[field.name] = v;
  }
  return extra;
}

/** Point at the fields that publishing needs filled in. */
export function markMissing(fields) {
  const names = new Set(fields.map((f) => f.name));
  let first = null;
  for (const r of rows) {
    const missing = names.has(r.field.name);
    r.box.classList.toggle('missing', missing);
    if (missing && !first) first = r.input;
  }
  if (first) {
    $('#fields').open = true;
    first.focus();
  }
}

/** The words that come from the interface rather than from config.json. */
export function relabelFields() {
  for (const r of rows) {
    if (!r.warn.hidden) r.warn.textContent = t('fields.kept', { value: shown(r.raw) });
    for (const o of r.input.querySelectorAll?.('option') ?? []) {
      if ('none' in o.dataset) o.textContent = t('fields.none');
      if ('odd' in o.dataset) o.textContent = t('fields.notInList', { value: o.dataset.odd });
    }
  }
}
