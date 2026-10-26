import { clearNoteStore, resetArchiveCache } from "./noteStore";
import { SESSION_KEY } from "./sessionRestore";

/** Called only after a confirmed server receipt. Other saved accounts keep
 * their tokens; content caches can be reloaded and are deliberately purged. */
export async function purgeErasedAccount(userId: string): Promise<void> {
  try {
    localStorage.removeItem(`napp:policies-accepted:${userId}`);
    localStorage.removeItem(`napp:erasure-receipt:${userId}`);
    const accounts = JSON.parse(localStorage.getItem("napp:accounts") ?? "[]");
    if (Array.isArray(accounts))
      localStorage.setItem(
        "napp:accounts",
        JSON.stringify(accounts.filter((a) => a.userId !== userId)),
      );
    const faces = JSON.parse(localStorage.getItem("napp:account-faces") ?? "{}");
    delete faces[userId];
    localStorage.setItem("napp:account-faces", JSON.stringify(faces));
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    if (session?.userId === userId) localStorage.removeItem(SESSION_KEY);
  } catch {
    // A corrupt nonessential cache must not stop server-side erasure.
  }
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function" &&
    typeof CustomEvent !== "undefined"
  )
    window.dispatchEvent(new CustomEvent("napp:erase-account", { detail: userId }));
  resetArchiveCache();
  await clearNoteStore();
  if (typeof caches !== "undefined") await caches.delete("napp:image:v1").catch(() => false);
  if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
    const databases = await indexedDB.databases().catch(() => []);
    for (const database of databases) {
      if (!database.name?.startsWith("napp:yjs:") || !database.name.includes(`:${userId}:`))
        continue;
      // Connections are closed by the erasure event. Another tab may still
      // hold one; IDB queues the deletion until that connection closes.
      indexedDB.deleteDatabase(database.name);
    }
  }
}
