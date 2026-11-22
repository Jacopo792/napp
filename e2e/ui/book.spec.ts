import { dismissWorkspaceHints } from "../workspaceHints.ts";
import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`rapid Book view switches keep the chapter editable (${reducedMotion})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion });
    await dismissWorkspaceHints(page);
    await page.goto("/notes");
    await page.getByRole("button", { name: "Preview group", exact: true }).click();
    await page.getByRole("menuitem", { name: "Tesi — Plotino", exact: true }).click();
    const editor = page.locator(".tiptap[contenteditable=true]");
    await expect(editor).toBeVisible();
    await expect(page.locator(".book-view-switch button")).toHaveCount(2);
    await expect(editor).toContainText("Enneadi");
    const original = await editor.innerText();
    // Native/browser input waits for animations. Dispatch directly to exercise
    // repeated requests before a previous view transition has finished.
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        (
          document.querySelectorAll(".book-view-switch button")[1] as HTMLButtonElement | undefined
        )?.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        (
          document.querySelectorAll(".book-view-switch button")[0] as HTMLButtonElement | undefined
        )?.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });
    await expect(page.getByRole("radio", { name: "Write", exact: true })).toBeChecked();
    await expect(editor).toBeVisible();
    await expect(editor).toHaveText(original);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" Book switch regression.");
    await expect(editor).toContainText("Book switch regression.");
    expect(errors).toEqual([]);
  });
}
