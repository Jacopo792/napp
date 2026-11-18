import { randomUUID } from "node:crypto";
import { DRIVE_FIXTURE_PDF, mockGoogleDrive } from "../googleDriveFixture.ts";
import { expect, join, login, openNote, showMemberNotes, test } from "./fixture.ts";

test("Drive imports into the chosen folder and shares collaborative notes and private PDFs", async ({
  page,
  browser,
  accounts,
}) => {
  const owner = await accounts.create("drive-owner");
  const partner = await accounts.create("drive-partner");
  const outsider = await accounts.create("drive-outsider");
  await join(owner, partner);

  const folderId = randomUUID();
  const folder = await owner.client.from("folders").insert({
    id: folderId,
    name: "Drive imports",
    owner_id: owner.id,
    archive_id: owner.archiveId,
  });
  expect(folder.error).toBeNull();

  const secondBrowser = await browser.newContext();
  try {
    await mockGoogleDrive(page);
    await login(page, owner);
    await page
      .getByRole("navigation", { name: "Folders" })
      .getByRole("button", { name: /^Drive imports/ })
      .click();
    await page
      .getByRole("heading", { level: 2 })
      .getByRole("button", { name: /^Drive imports/ })
      .click();
    await page.getByText("Import from Google Drive", { exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Import from Google Drive" });
    await dialog.getByRole("button", { name: "Choose files" }).click();
    await expect(
      dialog.getByText("Members with access to these copies: you, drive-partner."),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Import 5 files" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Imported 4 of 5 files.");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();

    const saved = await owner.client
      .from("notes")
      .select("id, title, folder_id, content")
      .eq("archive_id", owner.archiveId)
      .order("title");
    expect(saved.error).toBeNull();
    expect(saved.data?.map(({ title, folder_id }) => [title, folder_id])).toEqual([
      ["Drive budget", folderId],
      ["Drive project notes", folderId],
      ["Drive slides", folderId],
      ["Drive source.pdf", folderId],
    ]);
    if (!saved.data) throw new Error("No imported notes were stored");

    const doc = saved.data.find(({ title }) => title === "Drive project notes")!;
    await openNote(page, doc.id);
    const ownerEditor = page.locator(".tiptap[contenteditable=true]");
    await expect(ownerEditor.locator("h1")).toHaveText("First section");

    const secondPage = await secondBrowser.newPage();
    await login(secondPage, partner);
    await showMemberNotes(secondPage, owner);
    await openNote(secondPage, doc.id);
    const partnerEditor = secondPage.locator(".tiptap[contenteditable=true]");
    await expect(partnerEditor.locator("strong")).toHaveText("bold");
    await partnerEditor.press("ControlOrMeta+End");
    await secondPage.keyboard.insertText(" Updated by another archive member.");
    await expect(ownerEditor).toContainText("Updated by another archive member.");

    for (const note of saved.data.filter(({ id }) => id !== doc.id)) {
      const attachment = note.content.content[0];
      expect(attachment).toMatchObject({ type: "privateFile" });
      const path = `${owner.archiveId}/${attachment.attrs.objectId}`;
      const shared = await partner.client.storage.from("note-images").download(path);
      expect(shared.error).toBeNull();
      expect(await shared.data?.text()).toBe(DRIVE_FIXTURE_PDF);
      const denied = await outsider.client.storage.from("note-images").download(path);
      expect(denied.data).toBeNull();
      expect(denied.error).not.toBeNull();
    }
  } finally {
    await secondBrowser.close();
    await page.close();
    const bucket = accounts.admin.storage.from("note-images");
    const { data, error } = await bucket.list(owner.archiveId);
    expect(error).toBeNull();
    if (data?.length) {
      const removed = await bucket.remove(data.map(({ name }) => `${owner.archiveId}/${name}`));
      expect(removed.error).toBeNull();
    }
  }
});
