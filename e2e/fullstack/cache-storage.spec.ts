import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const noteStoreUrl = `/@fs${fileURLToPath(new URL("../../packages/core/src/lib/noteStore.ts", import.meta.url))}`;

test("a cache write that was opening IndexedDB when removal began cannot restore plaintext payloads", async ({
  page,
}) => {
  await page.goto("/");
  const count = await page.evaluate(async (moduleUrl) => {
    const store = await import(moduleUrl);
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args: Parameters<typeof original>) {
      const request = Reflect.apply(original, this, args) as IDBOpenDBRequest;
      if (args[0] === "napp:notes")
        request.addEventListener(
          "success",
          () => {
            localStorage.setItem("napp:removing-account:cache-fixture", "removing");
          },
          { once: true },
        );
      return request;
    };
    try {
      await store.writeCachedNotes("cache-fixture", "archive", [
        { version: 1, note: { id: "late", title: "Must not return after sign-out" } },
      ]);
    } finally {
      IDBFactory.prototype.open = original;
    }
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open("napp:notes", 1);
      request.onsuccess = () => {
        const db = request.result;
        const records = db.transaction("payloads").objectStore("payloads").count();
        records.onsuccess = () => {
          db.close();
          resolve(records.result);
        };
        records.onerror = () => {
          db.close();
          reject(records.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  }, noteStoreUrl);
  expect(count).toBe(0);
});

test("strict payload removal reports an aborted transaction and releases the database", async ({
  page,
}) => {
  await page.goto("/");
  const message = await page.evaluate(async (moduleUrl) => {
    const store = await import(moduleUrl);
    await store.clearNoteStore();
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const transaction = Reflect.apply(original, this, args) as IDBTransaction;
      if (this.name === "napp:notes" && args[1] === "readwrite")
        queueMicrotask(() => transaction.abort());
      return transaction;
    };
    try {
      await store.clearNoteStore({ strict: true });
      return "No error";
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason);
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  }, noteStoreUrl);
  expect(message).toBe("Could not remove downloaded notes. Reload and try signing out again.");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("napp:notes");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
});
