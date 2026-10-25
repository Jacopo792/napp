import { test, expect, login, seedNote, openNote } from "./fixture.ts";

test("another tab cannot create a new document cache while account removal is in progress", async ({
  page,
  context,
  accounts,
}) => {
  const account = await accounts.create("cleanup-race");
  const firstId = await seedNote(account, "First local document");
  const secondId = await seedNote(account, "A document not yet cached");
  await login(page, account);
  await openNote(page, firstId);
  const second = await context.newPage();
  try {
    await second.goto("/notes");
    await openNote(second, firstId);
    await page.evaluate(
      async ({ archiveId, userId }) => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(
            `napp:yjs:${archiveId}:${userId}:held-until-test-release`,
            1,
          );
          request.onupgradeneeded = () => request.result.createObjectStore("updates");
          request.onsuccess = () => {
            window.addEventListener("napp-test-release-database", () => request.result.close(), {
              once: true,
            });
            resolve();
          };
          request.onerror = () => reject(request.error);
        });
      },
      { archiveId: account.archiveId, userId: account.id },
    );
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect
      .poll(() =>
        second.evaluate(
          (userId) => localStorage.getItem(`napp:removing-account:${userId}`),
          account.id,
        ),
      )
      .toBe("removing");
    await second.locator(`[data-note-row="${secondId}"]`).click();
    await expect(second.locator(".tiptap")).toHaveCount(0);
    expect(
      await second.evaluate(
        async (id) => (await indexedDB.databases()).some((db) => db.name?.endsWith(`:${id}`)),
        secondId,
      ),
    ).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new Event("napp-test-release-database")));
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        async (userId) =>
          (await indexedDB.databases()).some((db) => db.name?.split(":")[3] === userId),
        account.id,
      ),
    ).toBe(false);
  } finally {
    await second.close();
  }
});
