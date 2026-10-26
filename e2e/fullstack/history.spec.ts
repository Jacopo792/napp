import { test, expect, login, seedNote, openNote } from "./fixture.ts";

test("restoring a named version keeps the current words before replacing them", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("historian");
  const id = await seedNote(account, "E2E versioned note");
  await login(page, account);
  await openNote(page, id);
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "History", exact: true }).click();
  const history = page.getByRole("complementary", { name: "History of this note" });
  await history.getByRole("button", { name: "Name this version", exact: true }).click();
  await history.getByRole("textbox", { name: "Version name", exact: true }).fill("E2E original");
  await history.getByRole("button", { name: "Save", exact: true }).click();
  const original = history.getByRole("button").filter({ hasText: "E2E original" });
  await expect(original).toBeVisible();
  const editor = page.locator(".tiptap[contenteditable=true]");
  await editor.fill("The current words must be preserved by restore.");
  await original.click();
  await history.getByRole("button", { name: "Restore this version", exact: true }).click();
  await history.getByRole("button", { name: "Yes, restore this version", exact: true }).click();
  await expect(editor).toContainText("An initial paragraph.");
  await expect
    .poll(async () => {
      const result = await account.client
        .from("note_versions")
        .select("content")
        .eq("note_id", id)
        .like("label", "Before restoring %");
      if (result.error) throw new Error(result.error.message);
      return JSON.stringify(result.data);
    })
    .toContain("The current words must be preserved by restore.");
  await expect
    .poll(
      async () =>
        (await account.client.from("notes").select("body").eq("id", id).single()).data?.body,
    )
    .toContain("An initial paragraph.");
});
