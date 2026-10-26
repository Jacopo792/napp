import { test, expect, seedNote, join } from "./fixture.ts";

test("public account deletion erases owned notes and preserves another member's work", async ({
  page,
  accounts,
}) => {
  const erased = await accounts.create("erased");
  const survivor = await accounts.create("survivor");
  await join(erased, survivor);
  const removed = await seedNote(erased, "Owned note to erase");
  const kept = await seedNote(survivor, "Another member's work");
  await page.goto("/?action=delete-account");
  await page.getByLabel("Email", { exact: true }).fill(erased.email);
  await page.getByLabel("Account password", { exact: true }).fill(erased.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Delete account permanently", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account deleted", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const deletedUser = await accounts.admin.auth.admin.getUserById(erased.id);
  expect(deletedUser.data.user).toBeNull();
  const gone = await accounts.admin.from("notes").select("id").eq("id", removed);
  expect(gone.error).toBeNull();
  expect(gone.data).toEqual([]);
  const retained = await survivor.client.from("notes").select("id,title").eq("id", kept).single();
  expect(retained.error).toBeNull();
  expect(retained.data?.title).toBe("Another member's work");
  const stale = await erased.client.from("notes").select("id").eq("id", kept);
  expect(stale.data ?? []).toEqual([]);
});
