// Article text this browser has already downloaded.
//
// The key is the blob's oid — git's own hash of the file's contents — so a cached body can never
// be the wrong version of an article: change a word and the file has a different oid, which is a
// different key and a miss. That is what makes it safe to show the list from the cache without
// asking GitHub whether it is still current. The repository and directory are part of the key as
// well, so that pointing the editor at another collection doesn't throw this one's text away.
import { call } from './idb.js';

const STORE = 'bodies';
const key = (scope, oid) => `${scope}\n${oid}`;
// Everything under one scope: '\n' sorts below every character a repository name may contain
const range = (scope) => IDBKeyRange.bound(key(scope, ''), key(scope, '￿'));

/** Every body kept for this collection: oid -> text. */
export async function read(scope) {
  const [keys, texts] = await Promise.all([call(STORE, 'readonly', 'getAllKeys', range(scope)), call(STORE, 'readonly', 'getAll', range(scope))]);
  // Both come back in key order, so they line up — and both are undefined where there is no store
  return new Map((keys ?? []).map((k, i) => [String(k).slice(scope.length + 1), texts?.[i]]).filter(([, text]) => typeof text === 'string'));
}

export const write = (scope, oid, text) => call(STORE, 'readwrite', 'put', text, key(scope, oid));

/** Forget the bodies no article points at any more: every edit leaves the version before it
 * behind, and nothing else would ever ask for those again. */
export async function prune(scope, oids) {
  const keep = new Set(oids.map((oid) => key(scope, oid)));
  const keys = (await call(STORE, 'readonly', 'getAllKeys', range(scope))) ?? [];
  for (const k of keys) if (!keep.has(String(k))) await call(STORE, 'readwrite', 'delete', k);
}
