import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Close What's New", exact: true }).click();
});

test("the workspace opens a note and keeps edits when navigating between notes", async ({
  page,
}) => {
  const rows = page.locator("[data-note-row]");
  await expect(rows.first()).toBeVisible();
  const firstId = await rows.first().getAttribute("data-note-row");
  await rows.first().click();
  const title = page.getByRole("textbox", { name: "Note title", exact: true });
  await expect(title).toBeEditable();
  await title.fill("E2E navigation preserves this title");
  await rows.nth(1).click();
  await expect(title).not.toHaveValue("E2E navigation preserves this title");
  await page.locator(`[data-note-row="${firstId}"]`).click();
  await expect(title).toHaveValue("E2E navigation preserves this title");
});

test("a new note can be written and found through search", async ({ page }) => {
  await page.getByRole("button", { name: "New note", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Note title", exact: true }).fill("E2E searchable note");
  const editor = page.locator(".tiptap[contenteditable=true]");
  await expect(editor).toBeVisible();
  await editor.fill("A paragraph written through the real editor.");
  const search = page.getByRole("textbox", { name: "Search notes", exact: true });
  await search.fill("E2E searchable");
  await expect(page.locator("[data-note-row]")).toHaveCount(1);
  await expect(page.locator("[data-note-row]")).toContainText("E2E searchable note");
});
