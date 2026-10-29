// What config.json is allowed to say, and what to tell someone when it says something else.
//
// The point is the first install: a misspelled key used to be silently ignored, and a missing one
// produced the same sentence whichever it was. Everything here is a plain function over the parsed
// JSON — no DOM, no network — so test/config.test.mjs can check the awkward cases.
import { locales } from './i18n/index.js';
import { BUILT_IN, FIELD_NAME, FIELD_TYPES, ONLY_FOR, defaultFits, fieldType } from './fields.js';

/** Thrown when config.json can't be used. `problems` is every reason at once, not just the first. */
export class ConfigError extends Error {
  constructor(problems) {
    super(problems.map((p) => p.text).join('\n'));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const str = { type: 'string' };

// Each entry is a field; `fields` makes it a group. Anything not listed here is a mistake.
const SPEC = {
  $schema: str, // only there to give an editor autocomplete
  title: str,
  siteName: str,
  logo: str,
  lang: { ...str, oneOf: Object.keys(locales) },
  repo: { ...str, required: true, pattern: /^[^/\s]+\/[^/\s]+$/, hint: 'config.repoFormat' },
  branch: str,
  siteUrl: { ...str, absolute: true },
  timeZone: { ...str, timeZone: true },
  auth: { fields: { base: { ...str, required: true, url: true } } },
  // Each kind of article the site has, in its own directory; the sidebar switches between them
  collections: {
    required: true,
    nonEmpty: true,
    unique: 'name',
    each: {
      name: { ...str, pattern: /^[\w-]+$/, hint: 'config.collectionName' },
      label: str,
      dir: { ...str, required: true },
      url: { ...str, slash: true, wants: '{id}', hint: 'config.noId' },
      imageField: str,
      preview: { ...str, slash: true },
      // Frontmatter fields of this collection's own, each with an input in the article form. What
      // only makes sense across them — a name used twice, options on a field that isn't a list to
      // choose from — is checked in checkFields below
      fields: {
        each: {
          name: { ...str, required: true, pattern: FIELD_NAME, hint: 'config.fieldName' },
          label: str,
          type: { ...str, oneOf: FIELD_TYPES },
          required: { type: 'boolean' },
          default: { any: true },
          placeholder: str,
          list: { type: 'boolean' },
          multiline: { type: 'boolean' },
          min: { type: 'number' },
          max: { type: 'number' },
          step: { type: 'number' },
          unit: str,
          options: { any: true },
        },
      },
    },
  },
  // Before 1.0 there was one collection, and the preview page was set apart from it
  collection: { moved: 'config.movedCollection', to: 'collections' },
  preview: { moved: 'config.movedPreview' },
  media: {
    fields: {
      dir: { ...str, required: true },
      url: { ...str, slash: true },
      maxWidth: { type: 'number', min: 1, max: 10000 },
      quality: { type: 'number', min: 0, max: 1 },
      maxFileMB: { type: 'number', min: 1, max: 100 },
    },
  },
  blocks: {
    each: {
      tag: { ...str, required: true, pattern: /^[a-zA-Z][\w:-]*$/, hint: 'config.blockTag' },
      name: str,
      label: str,
      edit: { ...str, oneOf: ['fields', 'table', 'source'] },
      attrs: { free: true },
      starts: { free: true },
      preview: str,
      fields: { each: { name: { ...str, required: true }, label: str, placeholder: str, multiline: { type: 'boolean' }, from: { ...str, oneOf: ['content'] } } },
    },
  },
  deploy: { fields: { skipCiForDrafts: { type: 'boolean' } } },
  actions: {
    each: {
      label: { ...str, required: true },
      workflow: { ...str, required: true },
      ref: str,
      inputs: { free: true },
      confirm: str,
      url: { ...str, absolute: true },
    },
  },
};

/** The closest known key, when it is close enough to be worth suggesting. */
function nearest(key, known) {
  const distance = (a, b) => {
    const d = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0];
      d[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const t = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = t;
      }
    }
    return d[b.length];
  };
  const lower = key.toLowerCase();
  return known
    .map((k) => ({ k, d: distance(lower, k.toLowerCase()) }))
    .filter(({ k, d }) => d <= Math.max(2, Math.floor(k.length / 3)))
    .sort((a, b) => a.d - b.d)[0]?.k;
}

/** What a collection is called in the address bar: its `name`, or the last part of its directory. */
export const collectionName = (c) => c.name ?? String(c.dir ?? '').replace(/\/+$/, '').split('/').pop();

const isTimeZone = (value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/**
 * Check a parsed config.json against the spec above.
 * @param {unknown} raw Whatever JSON.parse gave back.
 * @param {(key: string, params?: object) => string} t The interface's translator.
 * @returns {{ problems: {key: string, text: string}[], warnings: {key: string, text: string}[] }}
 */
export function checkConfig(raw, t) {
  const problems = [];
  const warnings = [];
  const add = (list, key, msg, params) => list.push({ key, text: t(msg, { key, ...params }) });

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    add(problems, 'config.json', 'config.notAnObject');
    return { problems, warnings };
  }

  const checkField = (path, value, rule) => {
    if (typeof value !== rule.type) return add(problems, path, 'config.mustBe', { type: t(`config.type.${rule.type}`) });
    if (rule.type === 'string' && !value.trim()) return add(problems, path, 'config.empty');
    if (rule.oneOf && !rule.oneOf.includes(value)) return add(problems, path, 'config.oneOf', { list: rule.oneOf.join(', ') });
    if (rule.pattern && !rule.pattern.test(value)) return add(problems, path, rule.hint ?? 'config.invalid');
    if (rule.absolute && !/^https?:\/\//.test(value)) return add(problems, path, 'config.absolute');
    if (rule.url && !/^(https?:\/\/|\/)/.test(value)) return add(problems, path, 'config.url');
    if (rule.timeZone && !isTimeZone(value)) return add(problems, path, 'config.timeZone', { value });
    if (rule.slash && !value.startsWith('/')) return add(problems, path, 'config.slash');
    if (rule.min !== undefined && (value < rule.min || value > rule.max)) return add(problems, path, 'config.range', { min: rule.min, max: rule.max });
    if (rule.wants && !value.includes(rule.wants)) return add(warnings, path, rule.hint, { wants: rule.wants });
    return undefined;
  };

  const walk = (object, spec, prefix) => {
    for (const [key, value] of Object.entries(object)) {
      const rule = spec[key];
      if (!rule) {
        const guess = nearest(key, Object.keys(spec));
        add(problems, prefix + key, guess ? 'config.unknownDidYouMean' : 'config.unknown', { guess });
        continue;
      }
      if (rule.moved) {
        add(problems, prefix + key, rule.moved);
        continue;
      }
      if (rule.each) {
        if (!Array.isArray(value)) add(problems, prefix + key, 'config.mustBe', { type: t('config.type.list') });
        else if (rule.nonEmpty && !value.length) add(problems, prefix + key, 'config.emptyList');
        else
          value.forEach((item, i) => {
            const path = `${prefix}${key}[${i}]`;
            if (item === null || typeof item !== 'object' || Array.isArray(item)) add(problems, path, 'config.mustBe', { type: t('config.type.group') });
            else walk(item, rule.each, `${path}.`);
          });
        if (rule.unique === 'name' && Array.isArray(value)) {
          const seen = new Set();
          value.forEach((item, i) => {
            if (item === null || typeof item !== 'object' || typeof item.dir !== 'string') return;
            const name = collectionName(item);
            // One taken from the directory has to be fit for the address bar as much as one given
            if (item.name === undefined && !/^[\w-]+$/.test(name)) add(problems, `${prefix}${key}[${i}].name`, 'config.collectionNameNeeded', { name });
            if (seen.has(name)) add(problems, `${prefix}${key}[${i}]`, 'config.duplicateName', { name });
            seen.add(name);
          });
        }
        continue;
      }
      if (rule.any) continue; // whatever it is, checkFields has the say
      if (rule.free) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) add(problems, prefix + key, 'config.mustBe', { type: t('config.type.group') });
        continue;
      }
      if (rule.fields) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) add(problems, prefix + key, 'config.mustBe', { type: t('config.type.group') });
        else walk(value, rule.fields, `${prefix}${key}.`);
        continue;
      }
      checkField(prefix + key, value, rule);
    }
    for (const [key, rule] of Object.entries(spec)) {
      // An old setting that was renamed has already said what to write instead
      const renamed = Object.entries(spec).some(([old, r]) => r.to === key && object[old] !== undefined);
      if (rule.required && object[key] === undefined && !renamed) add(problems, prefix + key, 'config.required');
      if (rule.fields && object[key] === undefined && Object.values(rule.fields).some((f) => f.required)) {
        for (const [sub, f] of Object.entries(rule.fields)) if (f.required) add(problems, `${prefix}${key}.${sub}`, 'config.required');
      }
    }
  };

  walk(raw, SPEC, '');
  if (Array.isArray(raw.collections)) {
    raw.collections.forEach((c, i) => {
      if (c && typeof c === 'object' && Array.isArray(c.fields)) checkFields(c, `collections[${i}].fields`, (key, msg, params) => add(problems, key, msg, params));
    });
  }
  return { problems, warnings };
}

/** What only makes sense across a collection's fields, or between one field's settings: walk()
 * has already said whether each setting is the right kind of thing on its own. */
function checkFields(collection, prefix, add) {
  const seen = new Set();
  collection.fields.forEach((f, i) => {
    if (f === null || typeof f !== 'object' || Array.isArray(f) || typeof f.name !== 'string') return;
    const path = `${prefix}[${i}]`;
    const type = f.type === undefined || FIELD_TYPES.includes(f.type) ? fieldType(f) : null; // a wrong one is already said
    if (seen.has(f.name)) add(path, 'config.fieldDuplicate', { name: f.name });
    seen.add(f.name);
    // The editor writes these itself; a second input for the same key would fight it
    if (BUILT_IN.includes(f.name) || f.name === collection.imageField) add(`${path}.name`, 'config.fieldTaken', { name: f.name });
    if (!type) return;
    for (const [setting, only] of Object.entries(ONLY_FOR)) {
      if (f[setting] !== undefined && type !== only) add(`${path}.${setting}`, 'config.fieldOnlyFor', { type: only });
    }
    if (type === 'select') {
      const ok = (v) => typeof v === 'string' || typeof v === 'number';
      if (!Array.isArray(f.options) || !f.options.length) add(`${path}.options`, 'config.fieldOptions');
      else
        f.options.forEach((o, j) => {
          const good = ok(o) || (o !== null && typeof o === 'object' && ok(o.value) && (o.label === undefined || typeof o.label === 'string') && Object.keys(o).every((k) => k === 'value' || k === 'label'));
          if (!good) add(`${path}.options[${j}]`, 'config.fieldOption');
        });
    }
    if (f.default !== undefined && !defaultFits(f)) add(`${path}.default`, 'config.fieldDefault');
  });
}
