// Work that hasn't been committed yet, kept in this browser so a crash, a closed tab or a reload
// doesn't lose it. One record per article, thrown away the moment the article is saved or the
// changes are deliberately discarded.
//
// IndexedDB rather than localStorage, because a draft can carry images that haven't been uploaded
// yet and those are Blobs: localStorage would mean base64 inside a few megabytes of room, and an
// article with three photographs would not fit. Restoring the text but not the images would be
// worse than not restoring at all — the body would point at files that are in no commit.
import { call } from './idb.js';

const STORE = 'drafts';

/** @param {string} key @returns {Promise<{article: object, images: {path: string, blob: Blob}[], savedAt: number}|undefined>} */
export const getDraft = (key) => call(STORE, 'readonly', 'get', key);
export const putDraft = (key, value) => call(STORE, 'readwrite', 'put', value, key);
export const dropDraft = (key) => call(STORE, 'readwrite', 'delete', key);
