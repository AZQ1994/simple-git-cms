// What config.json is allowed to say, and what to tell someone when it says something else.
//
// The point is the first install: a misspelled key used to be silently ignored, and a missing one
// produced the same sentence whichever it was. Everything here is a plain function over the parsed
// JSON — no DOM, no network — so test/config.test.mjs can check the awkward cases.
import { locales } from './i18n/index.js';

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
  collection: {
    fields: {
      label: str,
      imageField: str,
      dir: { ...str, required: true },
      url: { ...str, slash: true, wants: '{id}', hint: 'config.noId' },
    },
  },
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
  preview: { fields: { url: { ...str, slash: true } } },
  deploy: { fields: { skipCiForDrafts: { type: 'boolean' } } },
  // Optional as a whole: left out, there is no release button. Written, it needs a workflow.
  release: {
    optional: true,
    fields: {
      workflow: { ...str, required: true },
      ref: str,
      label: str,
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
      if (rule.each) {
        if (!Array.isArray(value)) add(problems, prefix + key, 'config.mustBe', { type: t('config.type.list') });
        else
          value.forEach((item, i) => {
            const path = `${prefix}${key}[${i}]`;
            if (item === null || typeof item !== 'object' || Array.isArray(item)) add(problems, path, 'config.mustBe', { type: t('config.type.group') });
            else walk(item, rule.each, `${path}.`);
          });
        continue;
      }
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
      if (rule.required && object[key] === undefined) add(problems, prefix + key, 'config.required');
      if (rule.fields && !rule.optional && object[key] === undefined && Object.values(rule.fields).some((f) => f.required)) {
        for (const [sub, f] of Object.entries(rule.fields)) if (f.required) add(problems, `${prefix}${key}.${sub}`, 'config.required');
      }
    }
  };

  walk(raw, SPEC, '');
  return { problems, warnings };
}
