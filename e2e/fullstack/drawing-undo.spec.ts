import { test, expect, login, seedNote, openNote } from "./fixture.ts";

test("undoing every stroke of a page drawing takes its thumbnail out of the list", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("drawing-undo");
  const id = await seedNote(account, "A drawing undone");
  const strokes = JSON.stringify([
    { d: "M20 20 L220 20", color: "#b4606d", size: 5 },
    { d: "M20 60 L220 120", color: "#b4606d", size: 5 },
  ]);
  const seeded = await account.client
    .from("notes")
    .update({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "An initial paragraph." }] },
          { type: "drawing", attrs: { strokes, surface: "page" } },
        ],
      },
    })
    .eq("id", id);
  expect(seeded.error).toBeNull();

  await login(page, account);
  const thumbnail = page.locator(`[data-note-row="${id}"] .is-sketch`);
  await expect(thumbnail).toBeVisible();
  await openNote(page, id);

  await page
    .locator(".tiptap")
    .evaluate((dom) => dom.dispatchEvent(new CustomEvent("napp:take-up-the-pen")));
  const undo = page.getByRole("button", { name: "Undo the last stroke" });
  await undo.click();
  await undo.click();
  await expect(undo).toBeDisabled();

  await expect(thumbnail).toHaveCount(0);
  await expect
    .poll(async () => {
      const row = await account.client.from("notes").select("content").eq("id", id).single();
      return JSON.stringify(row.data?.content);
    })
    .not.toContain("M20 20");
  await page.reload();
  await expect(page.locator(`[data-note-row="${id}"]`)).toBeVisible();
  await expect(thumbnail).toHaveCount(0);
});
