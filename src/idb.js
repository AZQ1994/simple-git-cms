// The one IndexedDB database this editor keeps in the browser, and the two things in it:
//
//   drafts  work that hasn't been committed yet (recover.js)
//   bodies  article text already downloaded, keyed by content hash (cache.js)
//
// Both live in one database because a browser allows only one version of it at a time: two
// modules opening their own would fight over the version number and one of them would be blocked.
const DB_NAME = 'simple-git-cms';
const VERSION = 2;
const STORES = ['drafts', 'bodies'];

let opening;

function db() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    // Called for a new database and for one left by an older version of the editor, which has
    // the drafts store but not the bodies one
    req.onupgradeneeded = () => {
      for (const store of STORES) if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
  return opening;
}

/** One request against one store. Every call is best-effort: a private window, a full disk or a
 * browser with storage switched off all end up here, and none of them should stop someone
 * editing. */
export async function call(store, mode, method, ...args) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction(store, mode).objectStore(store)[method](...args);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}
