import { test, expect, login, seedNote, openNote } from "./fixture.ts";

test("a blocked IndexedDB deletion cannot report sign-out as completed and can be retried", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("blocked-cleanup");
  const id = await seedNote(account, "Local removal can be retried");
  await login(page, account);
  await openNote(page, id);
  await page.evaluate(
    async ({ archiveId, userId }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(`napp:yjs:${archiveId}:${userId}:held-by-old-client`, 1);
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
  let failure = "";
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "alert") failure = dialog.message();
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect
    .poll(() => failure)
    .toBe("Close other Napp windows and reload before signing out again.");
  expect(await page.evaluate(() => localStorage.getItem("napp:archive-session"))).not.toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event("napp-test-release-database")));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});
