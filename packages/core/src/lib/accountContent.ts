import { clearNoteStore, resetArchiveCache } from "./noteStore";
import { accountContentRemovalKey, accountDocumentStores } from "./accountContentShape";
export { accountDocumentStores } from "./accountContentShape";

type Cleanup = (userId: string) => Promise<void>;
const cleanups = new Set<Cleanup>();

export function accountContentRemovalInProgress(userId: string): boolean {
  return (
    typeof localStorage !== "undefined" &&
    localStorage.getItem(accountContentRemovalKey(userId)) !== null
  );
}

/** Only a newly authenticated session may reopen device documents after a
 * completed removal. Old tabs keep seeing the shared removal marker. */
export function restoreAccountContent(userId: string): void {
  if (typeof localStorage !== "undefined")
    localStorage.removeItem(accountContentRemovalKey(userId));
}

/** An external editor host can own a separate storage realm. Its
 * acknowledgement is required before an explicit device-content removal. */
export function registerAccountContentCleanup(cleanup: Cleanup): () => void {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

async function closeDocuments(userId: string): Promise<void> {
  await Promise.all([...cleanups].map((cleanup) => cleanup(userId)));
}

// Another window may own an IndexedDB connection. Ask it to release that
// account too; deleteDatabase itself waits until all holders have closed.
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("napp:account-content")
    : null;
if (channel)
  channel.onmessage = ({ data }) => {
    if (data?.type === "close" && typeof data.userId === "string")
      void closeDocuments(data.userId).catch(() => {});
  };

function deleteStore(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    const timer = setTimeout(
      () => reject(new Error("Close other Napp windows and reload before signing out again.")),
      8000,
    );
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Could not remove local notes. Reload and try again."));
    };
    // Do not report completion on `blocked`: deletion has only been queued.
  });
}

/** Destructive by design: call only after the person explicitly agrees to
 * discard device copies, including any edits not yet saved on the server.
 * Account switching and automatic locking must not call this function. */
export async function removeAccountContent(userId: string): Promise<void> {
  if (!userId) throw new Error("No account selected for local content removal");
  if (typeof localStorage !== "undefined")
    localStorage.setItem(accountContentRemovalKey(userId), "removing");
  try {
    channel?.postMessage({ type: "close", userId });
    await closeDocuments(userId);
    if (typeof indexedDB !== "undefined") {
      if (typeof indexedDB.databases !== "function")
        throw new Error("This browser cannot verify local note removal.");
      const names = (await indexedDB.databases()).map((database) => database.name);
      await Promise.all(accountDocumentStores(names, userId).map(deleteStore));
    }
    resetArchiveCache();
    await clearNoteStore({ strict: true });
    if (typeof caches !== "undefined") await caches.delete("napp:image:v1");
  } catch (reason) {
    restoreAccountContent(userId);
    throw reason;
  }
}
