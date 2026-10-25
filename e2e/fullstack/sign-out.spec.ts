import { test, expect, login, seedNote, openNote } from "./fixture.ts";

test("explicit sign-out requires consent and removes only the selected account's local documents", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("sign-out");
  const id = await seedNote(account, "Local copy to clear");
  await login(page, account);
  await openNote(page, id);
  const store = `napp:yjs:${account.archiveId}:${account.id}:${id}`;
  const other = `napp:yjs:${account.archiveId}:another-account:retained`;
  await expect
    .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)))
    .toContain(store);
  await page.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("updates");
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const pictures = await caches.open("napp:image:v1");
    await pictures.put("/local-picture", new Response("local cache"));
  }, other);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("napp:archive-session"))).not.toBeNull();
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)),
  ).toContain(store);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Changes that have not reached the server will be deleted");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((db) => db.name),
  );
  expect(databases).not.toContain(store);
  expect(databases).toContain(other);
  expect(await page.evaluate(() => caches.has("napp:image:v1"))).toBe(false);
});

test("sign-out releases another open tab before removing that account's IndexedDB stores", async ({
  page,
  context,
  accounts,
}) => {
  const account = await accounts.create("two-tabs");
  const id = await seedNote(account, "A note in two tabs");
  await login(page, account);
  await openNote(page, id);
  const second = await context.newPage();
  try {
    await second.goto("/notes");
    await openNote(second, id);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        async (userId) =>
          (await indexedDB.databases()).some((db) => db.name?.split(":")[3] === userId),
        account.id,
      ),
    ).toBe(false);
    await expect(second.locator(".tiptap")).toHaveCount(0);
  } finally {
    await second.close();
  }
});
