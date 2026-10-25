import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { accountPreferences, DEFAULT_FLAGS } from "../../packages/core/src/lib/preferenceShape.ts";
import { DEFAULT_APPEARANCE } from "../../packages/core/src/lib/appearance.ts";
import { DEFAULT_AXES } from "../../packages/core/src/lib/axes.ts";
import { DEFAULT_WRITING_PREFERENCES } from "../../packages/core/src/lib/writingPreferences.ts";

declare global {
  interface Window {
    nappClearAccount: (id: string, userId: string) => void;
    nappTestMessages: { kind: string; id?: string; error?: string }[];
  }
}

test("the production hosted-editor bundle acknowledges cleanup only after IndexedDB removal", async ({
  page,
}) => {
  const userId = randomUUID();
  const own = `napp:yjs:${randomUUID()}:${userId}:${randomUUID()}`;
  const other = `napp:yjs:${randomUUID()}:${randomUUID()}:${randomUUID()}`;
  const boot = {
    session: { userId, archiveId: randomUUID(), email: "hosted@example.test" },
    noteId: null,
    name: "",
    canEdit: false,
    accessToken: null,
    headerHeight: 0,
    preferences: accountPreferences(
      DEFAULT_APPEARANCE,
      DEFAULT_AXES,
      DEFAULT_WRITING_PREFERENCES,
      DEFAULT_FLAGS,
      {},
    ),
  };
  const original = await readFile(new URL("../.hosted-editor/index.html", import.meta.url), "utf8");
  const bootstrap = `window.napp=${JSON.stringify(boot)};window.nappTestMessages=[];window.ReactNativeWebView={postMessage:message=>window.nappTestMessages.push(JSON.parse(message))};`;
  await page.route("**/e2e-hosted-editor", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: original.replace("<head>", `<head><script>${bootstrap}</script>`),
    }),
  );
  await page.goto("/e2e-hosted-editor");
  await expect.poll(() => page.evaluate(() => typeof window.nappClearAccount)).toBe("function");
  await page.evaluate(
    async (names) => {
      for (const name of names)
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => request.result.createObjectStore("updates");
          request.onsuccess = () => {
            request.result.close();
            resolve();
          };
          request.onerror = () => reject(request.error);
        });
    },
    [own, other],
  );
  await page.evaluate((account) => window.nappClearAccount("cleanup-fixture", account), userId);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const messages = window.nappTestMessages;
        return messages.find(
          (message) =>
            message.kind === "account-content-cleared" && message.id === "cleanup-fixture",
        );
      }),
    )
    .toEqual({ kind: "account-content-cleared", id: "cleanup-fixture" });
  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name),
  );
  expect(databases).not.toContain(own);
  expect(databases).toContain(other);
});
