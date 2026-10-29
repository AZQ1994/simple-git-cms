// The inputs for the open collection's own fields (collections[].fields), under the date and tags.
// What each type reads from the file and writes back is in fields.js; this is only the form.
//
// Only a field someone has changed is written back. One that wasn't touched leaves the file as it
// was, so a value the input can't show — text in a number field, a choice that has since left the
// list — survives being opened and saved.
//
// A plugin field's input is the site's own: a script on the site (its `module`) that draws into the
// box it is given and hands back a value — a list, a group, whatever the site wants in the file.
// It can read the other fields as they stand, and hear when they change, so a value it works out
// from them is worked out while someone is filling the form in and then saved like any other.
import { $ } from './dom.js';
import { COLLECTION } from './store.js';
import { getLocale, t } from './i18n/index.js';
import { fieldLabel, fieldOptions, fieldType, fits, fromInput, toInput } from './fields.js';

/** Up to this many fields are simply there; more than that can be folded away under a heading. */
const FEW = 6;

let rows = []; // { field, box, input, warn, raw, touched, value (plugins), message }
let extraShown = {}; // the frontmatter the form was built from, for fields it has no row for
let watchers = []; // plugins' onFieldChange callbacks, for the form on screen
let changed = () => {};

export const formFields = () => COLLECTION?.fields ?? [];

/** Called whenever someone changes one of the fields. */
export const onFieldChange = (fn) => (changed = fn);

const shown = (raw) => {
  const s = JSON.stringify(raw) ?? String(raw);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

// Each script is loaded once and shared by every article that uses it
const modules = new Map();
const loadModule = (path) => {
  if (!modules.has(path)) modules.set(path, import(new URL(path, document.baseURI).href));
  return modules.get(path);
};

/** A field's value as it would be saved now: what was typed, or what the file had. */
function current(name) {
  const row = rows.find((r) => r.field.name === name);
  if (!row) return structuredClone(extraShown[name]);
  if (!row.touched) return structuredClone(row.raw);
  if (fieldType(row.field) === 'plugin') return structuredClone(row.value);
  return fromInput(row.field, fieldType(row.field) === 'boolean' ? row.input.checked : row.input.value);
}

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

/** Someone changed a row: it is written back from now on, and plugins watching hear which one. */
function touch(row) {
  row.touched = true;
  row.warn.hidden = true;
  row.box.classList.remove('missing');
  for (const w of watchers) if (w.row !== row) w.fn(row.field.name);
  changed();
}

/** Hand a plugin row its box. Done after the rest of the form is built, so it can read every field. */
function mountPlugin(row, form) {
  const f = row.field;
  loadModule(f.module)
    .then((mod) => {
      if (rows !== form) return; // another article is open by now
      if (typeof mod.mount !== 'function') throw new Error('it has no mount() to export');
      mod.mount(row.body, {
        value: structuredClone(row.raw),
        field: f,
        lang: getLocale(),
        get: current,
        set: (value) => {
          row.value = structuredClone(value);
          touch(row);
        },
        onFieldChange: (fn) => watchers.push({ row, fn }),
      });
    })
    .catch((e) => {
      if (rows !== form) return;
      row.message = () => t('fields.pluginFailed', { module: f.module, message: e?.message ?? String(e) });
      row.warn.textContent = row.message();
      row.warn.hidden = false;
    });
}

/** Build the inputs for an article, from its frontmatter beyond the built-in fields. */
export function showFields(extra) {
  const fields = formFields();
  const box = $('#fields');
  box.hidden = !fields.length;
  box.classList.toggle('few', fields.length <= FEW);
  if (fields.length <= FEW) box.open = true; // there is no heading to open it with
  extraShown = extra ?? {};
  watchers = [];
  rows = fields.map((f) => {
    const raw = extra?.[f.name];
    const type = fieldType(f);
    const row = { field: f, raw, touched: false };
    const name = document.createElement('span');
    name.className = 'field-label';
    name.textContent = fieldLabel(f);
    row.warn = document.createElement('span');
    row.warn.className = 'field-warn';
    row.warn.hidden = true;
    if (type === 'plugin') {
      // A box of its own rather than a <label>: a plugin's buttons and inputs are not one control
      row.box = document.createElement('div');
      row.box.className = `field field-plugin wide${f.required ? ' required' : ''}`;
      row.body = document.createElement('div');
      row.body.className = 'field-plugin-body';
      row.body.dataset.field = f.name;
      row.box.append(name, row.body, row.warn);
      return row;
    }
    row.box = document.createElement('label');
    row.box.className = `field field-${type}${type === 'text' && f.multiline ? ' wide' : ''}${f.required ? ' required' : ''}`;
    row.input = makeInput(f, raw);
    if (type === 'boolean') {
      row.box.append(row.input, name);
    } else {
      const control = document.createElement('span');
      control.className = 'field-control';
      control.append(row.input);
      if (f.unit) control.append(Object.assign(document.createElement('span'), { className: 'field-unit', textContent: f.unit }));
      row.box.append(name, control);
    }
    // A select says it in its own option, so there is nothing to add under it
    if (raw !== undefined && !fits(f, raw) && !(type === 'select' && typeof raw !== 'object')) {
      row.message = () => t('fields.kept', { value: shown(row.raw) });
      row.warn.hidden = false;
    }
    row.box.append(row.warn);
    row.input.addEventListener('input', () => touch(row));
    row.input.addEventListener('change', () => touch(row));
    return row;
  });
  $('#fields-grid').replaceChildren(...rows.map((r) => r.box));
  for (const r of rows) if (r.body) mountPlugin(r, rows);
  relabelFields();
}

/** Write the fields someone changed into the frontmatter. Assigning to a key that is already there
 * keeps its place in the file; a new one goes after the rest, in the order config.json lists them. */
export function collectFields(extra) {
  for (const row of rows) {
    if (!row.touched) continue;
    const { field, input } = row;
    const type = fieldType(field);
    const v = fromInput(field, type === 'plugin' ? structuredClone(row.value) : type === 'boolean' ? input.checked : input.value);
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
    if (missing && !first) first = r.input ?? r.body.querySelector('input, select, textarea, button');
  }
  if (first) {
    $('#fields').open = true;
    first.focus();
  }
}

/** The words that come from the interface rather than from config.json. */
export function relabelFields() {
  for (const r of rows) {
    if (!r.warn.hidden && r.message) r.warn.textContent = r.message();
    for (const o of r.input?.querySelectorAll('option') ?? []) {
      if ('none' in o.dataset) o.textContent = t('fields.none');
      if ('odd' in o.dataset) o.textContent = t('fields.notInList', { value: o.dataset.odd });
    }
  }
}
