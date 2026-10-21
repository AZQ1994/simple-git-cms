// Work that hasn't been committed yet, kept in this browser so a crash, a closed tab or a reload
// doesn't lose it. One record per article, thrown away the moment the article is saved or the
// changes are deliberately discarded.
//
// IndexedDB rather than localStorage, because a draft can carry images that haven't been uploaded
// yet and those are Blobs: localStorage would mean base64 inside a few megabytes of room, and an
// article with three photographs would not fit. Restoring the text but not the images would be
// worse than not restoring at all — the body would point at files that are in no commit.
const DB_NAME = 'simple-git-cms';
const STORE = 'drafts';

let opening;

function db() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
  return opening;
}

/** Every call is best-effort: a private window, a full disk or a browser with storage switched off
 * all end up here, and none of them should stop someone editing. */
async function call(mode, method, ...args) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction(STORE, mode).objectStore(STORE)[method](...args);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

/** @param {string} key @returns {Promise<{article: object, images: {path: string, blob: Blob}[], savedAt: number}|undefined>} */
export const getDraft = (key) => call('readonly', 'get', key);
export const putDraft = (key, value) => call('readwrite', 'put', value, key);
export const dropDraft = (key) => call('readwrite', 'delete', key);
