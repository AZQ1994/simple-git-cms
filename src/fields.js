// A collection's own frontmatter fields (config.json's collections[].fields): what each type can
// read from the file, what it writes back, and how the sidebar shows it. No DOM here, so the tests
// reach all of it; the inputs themselves are in field-form.js.
//
// A field the person hasn't touched is never written: what the file says stays exactly as it was,
// even when it is something the input couldn't have shown. These functions only decide what a
// field the person did fill in becomes.

export const FIELD_TYPES = ['text', 'number', 'select', 'boolean', 'date', 'plugin'];
export const FIELD_NAME = /^[A-Za-z_][\w-]*$/;
/** Frontmatter the editor already has a control of its own for. */
export const BUILT_IN = ['title', 'description', 'date', 'tags', 'draft'];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const fieldType = (f) => f.type ?? 'text';
export const fieldLabel = (f) => f.label || f.name;

/** A select's choices as { value, label }, whichever way config.json wrote them. */
export const fieldOptions = (f) =>
  (Array.isArray(f.options) ? f.options : []).map((o) =>
    o !== null && typeof o === 'object' ? { value: o.value, label: o.label ?? String(o.value) } : { value: o, label: String(o) },
  );

/** Whether a value from the file is one this field's input shows and would write back the same. */
export function fits(f, v) {
  switch (fieldType(f)) {
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'date':
      return typeof v === 'string' && DAY.test(v);
    case 'select':
      return fieldOptions(f).some((o) => o.value === v);
    case 'plugin':
      return true; // what it holds is the plugin's business
    default:
      return typeof v === 'string';
  }
}

/** What the input shows for a value from the file: a string, or for a checkbox true or false. A
 * list or a group has nothing an input could show, so the input starts empty. */
export function toInput(f, v) {
  if (fieldType(f) === 'boolean') return v === true;
  if (v === undefined || v === null || typeof v === 'object') return '';
  return String(v);
}

/** What goes in the file for what the input says. undefined leaves the field out of the file, as
 * an empty field is: the site gives it whatever default it has. */
export function fromInput(f, input) {
  switch (fieldType(f)) {
    case 'boolean':
      return input === true ? true : undefined;
    case 'number': {
      if (String(input).trim() === '') return undefined;
      const n = Number(input);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'date':
      return DAY.test(input) ? input : undefined;
    case 'plugin':
      // Whatever the plugin handed over, as it is: text, a number, a list, a group
      return input === null || input === '' ? undefined : input;
    case 'select': {
      if (input === '') return undefined;
      // The option's own value, so a number in the options is a number in the file. One that isn't
      // in the list was in the file before, as text, and goes back as text
      const o = fieldOptions(f).find((x) => String(x.value) === input);
      return o ? o.value : input;
    }
    default: {
      const s = String(input).trim();
      return s === '' ? undefined : s;
    }
  }
}

/** Whether a field counts as filled in. A checkbox always does: unticked is an answer too. */
export const isFilled = (f, v) => fieldType(f) === 'boolean' || (v !== undefined && v !== null && v !== '');

/** The required fields this frontmatter leaves empty. */
export const missingFields = (fields, extra) => fields.filter((f) => f.required && !isFilled(f, extra?.[f.name]));

/** A new article's frontmatter: each field that has a default. */
export function defaults(fields) {
  const out = {};
  for (const f of fields) if (f.default !== undefined) out[f.name] = f.default;
  return out;
}

/** How the sidebar shows a value: a choice by its label, a ticked box by the field's own label, a
 * number with its unit. Empty when there is nothing worth showing. */
export function display(f, v) {
  if (v === undefined || v === null || v === '' || typeof v === 'object') return '';
  switch (fieldType(f)) {
    case 'boolean':
      return v === true ? fieldLabel(f) : '';
    case 'select':
      return fieldOptions(f).find((o) => o.value === v)?.label ?? String(v);
    case 'number':
      return f.unit ? `${v} ${f.unit}` : String(v);
    default:
      return String(v);
  }
}

/** Whether config.json's default is a value the field could hold. */
export const defaultFits = (f) => fits(f, f.default);

/** Settings that only mean something for one type of field. */
export const ONLY_FOR = { options: 'select', multiline: 'text', min: 'number', max: 'number', step: 'number', unit: 'number', module: 'plugin' };

/** Where a plugin's script has to be: on the editor's own site, which is all its policy lets it load.
 * A path, then, from the site's root or from the editor — never //host/…, which is another site. */
export const MODULE_PATH = /^(\/(?!\/)|\.{1,2}\/)/;
