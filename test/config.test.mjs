// config.json is the one file someone writes by hand, so the editor has to be specific about what
// is wrong with it. These check the awkward cases, which is most of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkConfig, collectionName } from '../src/config.js';
import { setLocale, t } from '../src/i18n/index.js';

setLocale('en');

const good = () => ({
  title: 'Content',
  siteName: 'Example',
  repo: 'owner/repo',
  branch: 'main',
  siteUrl: 'https://example.com',
  timeZone: 'Asia/Tokyo',
  auth: { base: 'https://cms-auth.example.com' },
  collections: [
    { name: 'news', label: 'News', dir: 'src/content/news', url: '/news/{id}/', imageField: 'image', preview: '/news/preview/' },
    { label: 'Notices', dir: 'src/content/notices', url: '/notices/{id}/' },
  ],
  media: { dir: 'public/uploads', url: '/uploads', maxWidth: 1600, quality: 0.82 },
  deploy: { skipCiForDrafts: true },
});

const keys = (config) => checkConfig(config, t).problems.map((p) => p.key);
const warnings = (config) => checkConfig(config, t).warnings.map((p) => p.key);

test('a complete config has nothing wrong with it', () => {
  const { problems, warnings: warned } = checkConfig(good(), t);
  assert.deepEqual(problems, []);
  assert.deepEqual(warned, []);
});

test('the smallest config that works is accepted', () => {
  const bare = { repo: 'owner/repo', auth: { base: '/auth' }, collections: [{ dir: 'content' }], media: { dir: 'public/uploads' } };
  assert.deepEqual(keys(bare), []);
});

test('every missing setting is named, not just the first', () => {
  assert.deepEqual(keys({}).sort(), ['auth.base', 'collections', 'media.dir', 'repo']);
});

test('a missing setting inside a group is named too', () => {
  const config = { ...good(), collections: [{ label: 'news' }] };
  assert.deepEqual(keys(config), ['collections[0].dir']);
});

test('a misspelled setting is caught, with the one that was meant', () => {
  const config = { ...good(), colections: [{ dir: 'x' }] };
  delete config.collections;
  const { problems } = checkConfig(config, t);
  assert.ok(problems.some((p) => p.key === 'colections' && /did you mean collections\?/.test(p.text)));
  assert.ok(problems.some((p) => p.key === 'collections'), 'and the real one is still missing');
});

test('a config from before 1.0 is told what changed, not just that it is wrong', () => {
  const config = { ...good(), collection: { dir: 'src/content/news' }, preview: { url: '/news/preview/' } };
  delete config.collections;
  const { problems } = checkConfig(config, t);
  assert.deepEqual(problems.map((p) => p.key).sort(), ['collection', 'preview'], 'and collections is not also said to be missing');
  assert.match(problems.find((p) => p.key === 'collection').text, /"collections": \[/);
  assert.match(problems.find((p) => p.key === 'preview').text, /"preview": "\/news\/preview\/"/);
});

test('collections is a list of at least one, each with its own directory', () => {
  assert.deepEqual(keys({ ...good(), collections: [] }), ['collections']);
  assert.deepEqual(keys({ ...good(), collections: { dir: 'x' } }), ['collections']);
  assert.deepEqual(keys({ ...good(), collections: [{ dir: 'a', colour: 'red' }] }), ['collections[0].colour']);
  assert.deepEqual(keys({ ...good(), collections: [{ dir: 'a', preview: 'preview/' }] }), ['collections[0].preview']);
});

test('two collections cannot go by the same name, given or taken from the directory', () => {
  assert.deepEqual(keys({ ...good(), collections: [{ dir: 'a/news' }, { dir: 'b/news' }] }), ['collections[1]']);
  assert.deepEqual(keys({ ...good(), collections: [{ name: 'x', dir: 'a' }, { name: 'x', dir: 'b' }] }), ['collections[1]']);
  assert.deepEqual(keys({ ...good(), collections: [{ dir: 'a/news' }, { name: 'old-news', dir: 'b/news' }] }), []);
});

test('a collection name has to be something an address can carry', () => {
  assert.deepEqual(keys({ ...good(), collections: [{ name: 'news & events', dir: 'a' }] }), ['collections[0].name']);
  // Taken from the directory, it has to be just as fit, and then a name is asked for
  assert.deepEqual(keys({ ...good(), collections: [{ dir: 'content/news.en' }] }), ['collections[0].name']);
  assert.match(checkConfig({ ...good(), collections: [{ dir: 'content/お知らせ' }] }, t).problems[0].text, /お知らせ/);
  assert.deepEqual(keys({ ...good(), collections: [{ name: 'notices', dir: 'content/お知らせ' }] }), []);
});

test('a setting nobody has ever heard of is caught without a guess', () => {
  const { problems } = checkConfig({ ...good(), bananas: true }, t);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].key, 'bananas');
  assert.doesNotMatch(problems[0].text, /did you mean/);
});

test('misspellings inside a group are caught as well', () => {
  const config = { ...good(), media: { ...good().media, maxwidth: 800 } };
  const { problems } = checkConfig(config, t);
  assert.ok(problems.some((p) => p.key === 'media.maxwidth' && /maxWidth/.test(p.text)));
});

test('types are checked', () => {
  assert.deepEqual(keys({ ...good(), repo: 42 }), ['repo']);
  assert.deepEqual(keys({ ...good(), deploy: { skipCiForDrafts: 'yes' } }), ['deploy.skipCiForDrafts']);
  assert.deepEqual(keys({ ...good(), auth: 'https://example.com' }), ['auth']);
});

test('repo has to look like owner/name', () => {
  assert.deepEqual(keys({ ...good(), repo: 'ownerrepo' }), ['repo']);
  assert.deepEqual(keys({ ...good(), repo: 'owner/repo/extra' }), ['repo']);
  assert.match(checkConfig({ ...good(), repo: 'nope' }, t).problems[0].text, /owner\/name/);
});

test('addresses are checked for the kind of address they have to be', () => {
  assert.deepEqual(keys({ ...good(), siteUrl: 'example.com' }), ['siteUrl'], 'siteUrl has to be absolute');
  assert.deepEqual(keys({ ...good(), media: { ...good().media, url: 'uploads' } }), ['media.url'], 'media.url needs its slash');
  assert.deepEqual(keys({ ...good(), auth: { base: 'cms-auth.example.com' } }), ['auth.base']);
  assert.deepEqual(keys({ ...good(), auth: { base: '/demo/auth' } }), [], 'a path is a fine relay address');
});

test('numbers have to be in range', () => {
  assert.deepEqual(keys({ ...good(), media: { ...good().media, quality: 82 } }), ['media.quality']);
  assert.deepEqual(keys({ ...good(), media: { ...good().media, maxWidth: 0 } }), ['media.maxWidth']);
});

test('the time zone has to be one the browser knows', () => {
  assert.deepEqual(keys({ ...good(), timeZone: 'Asia/Shinjuku' }), ['timeZone']);
  assert.deepEqual(keys({ ...good(), timeZone: 'UTC' }), []);
});

test('lang has to be a language the editor has', () => {
  assert.deepEqual(keys({ ...good(), lang: 'fr' }), ['lang']);
  assert.deepEqual(keys({ ...good(), lang: 'ja' }), []);
});

test('an empty string is as missing as a missing one', () => {
  assert.deepEqual(keys({ ...good(), repo: '   ' }), ['repo']);
});

test('a collection url with no {id} is a warning, not a refusal', () => {
  const config = { ...good(), collections: [{ ...good().collections[0], url: '/news/' }] };
  assert.deepEqual(keys(config), []);
  assert.deepEqual(warnings(config), ['collections[0].url']);
});

test('something that is not an object at all is rejected plainly', () => {
  for (const value of [null, [], 'config', 7]) assert.deepEqual(keys(value), ['config.json']);
});

test('$schema is allowed, since it is what gives an editor autocomplete', () => {
  assert.deepEqual(keys({ ...good(), $schema: './config.schema.json' }), []);
});

test('a block is checked the way everything else is', () => {
  const blocks = (list) => keys({ ...good(), blocks: list });
  assert.deepEqual(blocks([{ tag: 'YouTube', fields: [{ name: 'id' }] }]), []);
  assert.deepEqual(blocks([{ tag: 'aside', attrs: { class: 'notice' }, fields: [{ name: 'text', from: 'content' }] }]), []);
  assert.equal(blocks('youtube').length, 1, 'blocks is a list');
  assert.deepEqual(blocks([{ label: 'YouTube' }]), ['blocks[0].tag']);
  assert.deepEqual(blocks([{ tag: '<YouTube />' }]), ['blocks[0].tag'], 'a tag, not the markup around it');
  assert.deepEqual(blocks([{ tag: 'X', colour: 'red' }]), ['blocks[0].colour']);
  assert.deepEqual(blocks([{ tag: 'X', fields: [{ label: 'A' }] }]), ['blocks[0].fields[0].name']);
  assert.deepEqual(blocks([{ tag: 'X', fields: [{ name: 'a', from: 'nowhere' }] }]), ['blocks[0].fields[0].from']);
  assert.deepEqual(blocks([{ tag: 'table', edit: 'table' }]), [], 'a table may be edited as a table');
  assert.deepEqual(blocks([{ tag: 'iframe', starts: { src: 'https://x/' } }]), [], 'and a definition may say which elements it speaks for');
  assert.deepEqual(blocks([{ tag: 'X', edit: 'form' }]), ['blocks[0].edit'], 'and only in one of the ways there are');
});

test('the example config shipped with the editor is one the editor accepts', () => {
  // It is the file people copy, so a setting renamed here and not there would be their first
  // experience of this
  const example = JSON.parse(readFileSync(new URL('../public/config.example.json', import.meta.url), 'utf8'));
  assert.deepEqual(keys(example), []);
});

test('actions are optional; each needs a label and a workflow, and a url is a full address', () => {
  const action = { label: 'Go live', workflow: 'release.yml', ref: 'main', inputs: { tag: '' }, confirm: 'Sure?', url: 'https://example.com' };
  assert.deepEqual(keys({ ...good(), actions: [action] }), []);
  assert.deepEqual(keys({ ...good(), actions: [{ ref: 'main' }] }).sort(), ['actions[0].label', 'actions[0].workflow']);
  assert.deepEqual(keys({ ...good(), actions: [action, { ...action, url: 'example.com' }] }), ['actions[1].url']);
  assert.deepEqual(keys({ ...good(), actions: { label: 'x' } }), ['actions']);
});

test('a collection is named by its name, or by the last part of its directory', () => {
  assert.equal(collectionName({ name: 'news', dir: 'src/content/articles' }), 'news');
  assert.equal(collectionName({ dir: 'src/content/notices/' }), 'notices');
  assert.equal(collectionName({ dir: 'content' }), 'content');
});

test('a collection can have fields of its own, of every type', () => {
  const fields = [
    { name: 'venue', label: 'Venue', required: true, placeholder: 'Where' },
    { name: 'seats', type: 'number', min: 0, max: 500, step: 10, unit: 'people', default: 30 },
    { name: 'status', type: 'select', list: true, default: 'open', options: ['open', { value: 'full', label: 'Full' }, 3] },
    { name: 'online', type: 'boolean', default: false },
    { name: 'starts', type: 'date', default: '2026-11-15' },
    { name: 'access', type: 'text', multiline: true },
  ];
  assert.deepEqual(keys({ ...good(), collections: [{ dir: 'events', fields }] }), []);
});

test('a field is told what is wrong with it, setting by setting', () => {
  const with_ = (...fields) => keys({ ...good(), collections: [{ dir: 'events', imageField: 'image', fields }] });
  assert.deepEqual(with_({ label: 'No name' }), ['collections[0].fields[0].name']);
  assert.deepEqual(with_({ name: '2nd' }), ['collections[0].fields[0].name'], 'a key YAML would read as something else');
  assert.deepEqual(with_({ name: 'a', type: 'money' }), ['collections[0].fields[0].type']);
  assert.deepEqual(with_({ name: 'a', colour: 'red' }), ['collections[0].fields[0].colour']);
  assert.deepEqual(with_({ name: 'a' }, { name: 'a' }), ['collections[0].fields[1]'], 'the same key twice');
  assert.deepEqual(with_({ name: 'tags' }, { name: 'image' }), ['collections[0].fields[0].name', 'collections[0].fields[1].name'], 'a key the editor already writes');
  assert.deepEqual(with_({ name: 'a', type: 'select' }), ['collections[0].fields[0].options']);
  assert.deepEqual(with_({ name: 'a', type: 'select', options: [] }), ['collections[0].fields[0].options']);
  assert.deepEqual(with_({ name: 'a', type: 'select', options: ['x', { label: 'no value' }, { value: 'y', colour: 1 }, null] }), [
    'collections[0].fields[0].options[1]',
    'collections[0].fields[0].options[2]',
    'collections[0].fields[0].options[3]',
  ]);
  assert.deepEqual(with_({ name: 'a', options: ['x'], unit: 'km', multiline: true }), ['collections[0].fields[0].options', 'collections[0].fields[0].unit'], 'settings that belong to another type');
  assert.deepEqual(with_({ name: 'a', type: 'number', step: '10' }), ['collections[0].fields[0].step']);
});

test('a default has to be something the field could hold', () => {
  const one = (field) => keys({ ...good(), collections: [{ dir: 'events', fields: [{ name: 'a', ...field }] }] });
  assert.deepEqual(one({ type: 'number', default: '30' }), ['collections[0].fields[0].default']);
  assert.deepEqual(one({ type: 'boolean', default: 'yes' }), ['collections[0].fields[0].default']);
  assert.deepEqual(one({ type: 'date', default: '15/11/2026' }), ['collections[0].fields[0].default']);
  assert.deepEqual(one({ type: 'select', options: ['open', 'full'], default: 'closed' }), ['collections[0].fields[0].default']);
  assert.deepEqual(one({ default: 3 }), ['collections[0].fields[0].default'], 'a text field holds text');
  assert.deepEqual(one({ type: 'select', options: [{ value: 1, label: 'One' }], default: 1 }), []);
});

test('every setting a field can have is in the JSON schema too', () => {
  const schema = JSON.parse(readFileSync(new URL('../public/config.schema.json', import.meta.url), 'utf8'));
  const inSchema = Object.keys(schema.properties.collections.items.properties.fields.items.properties).sort();
  const field = { name: 'a', label: 'A', type: 'text', required: true, default: 'x', placeholder: 'p', list: true, multiline: true };
  assert.deepEqual(keys({ ...good(), collections: [{ dir: 'e', fields: [field] }] }), []);
  assert.deepEqual(inSchema, ['default', 'label', 'list', 'max', 'min', 'multiline', 'name', 'options', 'placeholder', 'required', 'step', 'type', 'unit']);
  for (const key of inSchema) {
    const unknown = keys({ ...good(), collections: [{ dir: 'e', fields: [{ name: 'a', [key + 'x']: 1 }] }] });
    assert.ok(unknown.includes(`collections[0].fields[0].${key}x`), `${key}x is not a setting`);
  }
});
