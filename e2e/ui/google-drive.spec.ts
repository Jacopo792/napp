import { expect, test } from "@playwright/test";
import { mockGoogleDrive } from "../googleDriveFixture.ts";

test("Drive imports editable notes and PDF attachments, and reports skipped files", async ({
  page,
}) => {
  const downloads = await mockGoogleDrive(page);

  await page.addInitScript(() => localStorage.setItem("napp:spotlight-learned", "1"));
  await page.goto("/notes");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click({ position: { x: 4, y: 4 } });
  await page
    .getByRole("navigation", { name: "Folders" })
    .getByRole("button", { name: /^Studio / })
    .click();
  await page
    .getByRole("heading", { level: 2 })
    .getByRole("button", { name: /^Studio/ })
    .click();
  await page.getByText("Import from Google Drive", { exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Import from Google Drive" });
  await expect(dialog.getByText("Preview archive / Your notes / Studio")).toBeVisible();
  await dialog.getByRole("button", { name: "Choose files" }).click();
  await expect(
    dialog.getByText("Members with access to these copies: you, Partner."),
  ).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Selected files" }).locator("li")).toHaveCount(5);
  expect(downloads).toEqual([]);
  await dialog.getByRole("button", { name: "Import 5 files" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Imported 4 of 5 files.");
  await expect(dialog.getByRole("list", { name: "Files that failed" })).toContainText(
    "Restricted file · Google Drive blocks downloads for this file.",
  );
  expect(downloads).toEqual(["doc", "sheet", "slides", "pdf"]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  const rows = page.locator("[data-note-row]");
  await rows.filter({ hasText: "Drive project notes" }).click();
  const editor = page.locator(".tiptap[contenteditable=true]");
  await expect(editor.locator("h1")).toHaveText("First section");
  await expect(editor.locator("strong")).toHaveText("bold");
  await editor.fill("The imported note can be edited.");
  await expect(editor).toHaveText("The imported note can be edited.");

  for (const [title, filename] of [
    ["Drive budget", "Drive budget.pdf"],
    ["Drive slides", "Drive slides.pdf"],
    ["Drive source.pdf", "Drive source.pdf"],
  ]) {
    await rows.filter({ hasText: title }).click();
    await expect(editor.getByText(filename, { exact: true })).toBeVisible();
  }
  await expect(rows.filter({ hasText: "Restricted file" })).toHaveCount(0);
});
