/* The note payload cache, kept between visits.
 *
 * `loadArchive` already refuses to re-fetch a note whose `version` has not
 * moved, which is what makes waking up cheap — but the map holding those
 * versions only lived as long as the tab. Every reload therefore declared the
 * whole catalogue stale and pulled `title`, `body`, `content` and
 * `legacy_body` for every note in one query, and `content` is the entire
 * Tiptap document. A hundred notes is a hundred documents over the wire to
 * draw a list that shows a title and one line of preview.
 *
 * So the versioned map is written to IndexedDB and read back on the next
 * visit, in parallel with the queries it is about to save. A note is fetched
 * again when, and only when, its version moved — which is the rule that was
 * always there, now surviving a refresh.
 *
 * These are plaintext notes on disk, exactly like the Yjs stores in
 * `collab.ts`. Unlike those, this one is emptied on sign-out: `clearSession()`
 * calls `clearNoteStore()`. `SECURITY.md` records what is and is not cleared.
 *
 * Everything here is best-effort. A browser in private mode, a denied quota or
 * a corrupt store must cost a slower load and never a failed one, so every
 * path resolves to "nothing cached" rather than rejecting. */
import type { Note } from "./types";

export interface CachedNote {
  version: number;
  note: Note;
}

const DB = "napp:notes";
const STORE = "payloads";

/** `${archiveId}:${noteId}` — one store for every archive this browser has
 *  opened, so switching scope does not throw away the other one's cache. */
const keyFor = (archiveId: string, noteId: string) => `${archiveId}:${noteId}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Every cached note belonging to one archive. */
export async function readCachedNotes(archiveId: string): Promise<Map<string, CachedNote>> {
  const found = new Map<string, CachedNote>();
  try {
    const db = await openDb();
    const prefix = `${archiveId}:`;
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction(STORE).objectStore(STORE);
      /* Keys are prefixed by archive, so one bounded range reads this
         archive's notes without walking the other's. */
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`, false, true);
      const request = store.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const value = cursor.value as CachedNote | undefined;
        if (value?.note?.id) found.set(value.note.id, value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch {
    return new Map();
  }
  return found;
}

/** Write the notes whose version moved, and forget the ones that are gone.
 *  Never awaited by a render path: the words are already on screen. */
export async function writeCachedNotes(
  archiveId: string,
  changed: Iterable<CachedNote>,
  removed: Iterable<string> = [],
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      for (const entry of changed) store.put(entry, keyFor(archiveId, entry.note.id));
      for (const noteId of removed) store.delete(keyFor(archiveId, noteId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  } catch {
    /* A full disk or a private window: the next load pays the network again,
       which is exactly what it did before this cache existed. */
  }
}

/** Sign-out. The archive's words do not stay on a machine nobody is signed in
 *  to, which is the one thing this store does that the Yjs caches do not. */
export async function clearNoteStore(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    /* Nothing to clear, or nothing that can be. */
  }
}
