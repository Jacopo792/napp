import { test, expect, login, seedNote, openNote } from "./fixture.ts";

test("an inactivity lock hides the archive offline and preserves the local collaborative document", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("automatic-lock");
  const id = await seedNote(account, "Offline recovery after locking");
  const configured = await account.client
    .from("profile_preferences")
    .upsert({ user_id: account.id, preferences: { autoLock: 5 } });
  expect(configured.error).toBeNull();
  await login(page, account);
  await openNote(page, id);
  // Fake only inactivity, not the SDK locks/timers used during authentication.
  await page.clock.install();
  await page.locator(".tiptap[contenteditable=true]").click();
  const store = `napp:yjs:${account.archiveId}:${account.id}:${id}`;
  await page.context().setOffline(true);
  await page
    .locator(".tiptap[contenteditable=true]")
    .fill("Offline words retained by automatic locking.");
  await expect(page.locator(".tiptap")).toContainText(
    "Offline words retained by automatic locking.",
  );
  await page.clock.fastForward(5 * 60_000 + 100);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).map((database) => database.name)),
  ).toContain(store);
  expect(await page.evaluate(() => localStorage.getItem("napp:archive-session"))).toBeNull();
  await page.context().setOffline(false);
});
