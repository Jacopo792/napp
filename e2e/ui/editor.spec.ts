import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("napp:spotlight-learned", "1"));
  await page.goto("/notes");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click({ position: { x: 4, y: 4 } });
  await page.getByRole("button", { name: "New note", exact: true }).first().click();
  await expect(page.getByRole("textbox", { name: "Note title", exact: true })).toBeFocused();
});

test("slash formatting and note suggestions keep their separate commands", async ({ page }) => {
  const editor = page.locator(".tiptap[contenteditable=true]");
  await editor.click();
  await page.keyboard.type("/heading");
  await page
    .getByRole("menu")
    .getByRole("button", { name: /^Heading 2/ })
    .click();
  await page.keyboard.type("A section worth finding");
  await expect(editor.locator("h2")).toHaveText("A section worth finding");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[[Aphor");
  await page.getByRole("menu").getByRole("button", { name: "Aphorisms", exact: true }).click();
  await expect(editor.locator("a[data-note]")).toHaveText("Aphorisms");
  await editor.locator("a[data-note]").click();
  await expect(page.getByRole("textbox", { name: "Note title", exact: true })).toHaveValue(
    "Aphorisms",
  );
});

async function drawStroke(page: Page) {
  const surface = page
    .getByRole("dialog", { name: "Drawing", exact: true })
    .locator("svg.draw-stage-board-ink");
  const box = await surface.boundingBox();
  if (!box) throw new Error("Drawing surface is missing");
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 12 });
  await page.mouse.up();
}

test("a drawing stage keeps committed ink and discards cancelled strokes", async ({ page }) => {
  const editor = page.locator(".tiptap[contenteditable=true]");
  await editor.click();
  await page.keyboard.type("/drawing");
  await page
    .getByRole("menu")
    .getByRole("button", { name: /^Drawing board/ })
    .click();
  const stage = page.getByRole("dialog", { name: "Drawing", exact: true });
  await expect(stage).toBeVisible();
  await expect(stage.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await drawStroke(page);
  await expect(stage.locator("svg.draw-stage-board-ink path.ink-stroke")).toHaveCount(1);
  await stage.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(stage.locator("svg.draw-stage-board-ink path.ink-stroke")).toHaveCount(0);
  await stage.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(stage.locator("svg.draw-stage-board-ink path.ink-stroke")).toHaveCount(1);
  await stage.getByRole("button", { name: "Done", exact: true }).click();
  await expect(stage).toBeHidden();
  await editor.getByRole("button", { name: "Draw", exact: true }).first().click();
  await expect(stage.locator("svg.draw-stage-board-ink path.ink-stroke")).toHaveCount(1);
  await drawStroke(page);
  await expect(stage.locator("svg.draw-stage-board-ink path.ink-stroke")).toHaveCount(2);
  await stage.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(stage).toBeHidden();
  await editor.getByRole("button", { name: "Draw", exact: true }).first().click();
  await expect(stage.locator("svg.draw-stage-board-ink path.ink-stroke")).toHaveCount(1);
});

test("Spotlight finds a new note by its heading and opens it", async ({ page }) => {
  const title = page.getByRole("textbox", { name: "Note title", exact: true });
  await title.fill("A note with a searchable section");
  const editor = page.locator(".tiptap[contenteditable=true]");
  await editor.click();
  await page.keyboard.type("/heading");
  await page
    .getByRole("menu")
    .getByRole("button", { name: /^Heading 1/ })
    .click();
  await page.keyboard.type("Unmistakable landmark");
  await page.locator("[data-note-row]").nth(1).click();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Commands", exact: true });
  await palette
    .getByRole("textbox", { name: "Search everything", exact: true })
    .fill("Unmistakable");
  await palette.getByRole("button", { name: /^Unmistakable landmark/ }).click();
  await expect(title).toHaveValue("A note with a searchable section");
  await expect(editor.locator("h1")).toHaveText("Unmistakable landmark");
});
