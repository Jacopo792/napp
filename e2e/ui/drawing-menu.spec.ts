import { dismissWorkspaceHints } from "../workspaceHints.ts";
import { expect, test, type Locator } from "@playwright/test";

for (const width of [1280, 390]) {
  test.describe(`${width}px drawing`, () => {
    test.use({ hasTouch: width === 390 });
    test(`drawing menus dismiss outside and keep their actions working at ${width}px`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await dismissWorkspaceHints(page);
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/notes");
      await page.getByRole("button", { name: "New note", exact: true }).first().click();
      const editor = page.locator(".tiptap[contenteditable=true]");
      await editor.click();
      await page.keyboard.type("/drawing");
      await page
        .getByRole("menu")
        .getByRole("button", { name: /^Drawing board/ })
        .click();
      const stage = page.getByRole("dialog", { name: "Drawing", exact: true });
      await expect(stage).toBeVisible();
      const press = (target: Locator) => (width === 390 ? target.tap() : target.click());
      await page.setViewportSize({ width, height: 900 });
      await expect(stage).toBeVisible();
      const shapes = stage.getByRole("button", { name: "Shapes", exact: true });
      const colour = stage.getByRole("button", { name: "Colour and thickness", exact: true });
      await press(shapes);
      await expect(shapes).toHaveAttribute("aria-expanded", "true");
      const shape = stage.getByRole("menuitemradio").first();
      const shapeName = (await shape.innerText()).trim();
      await press(shape);
      await press(shapes);
      await expect(stage.getByRole("menuitemradio", { name: shapeName })).toBeChecked();
      await press(colour);
      await expect(shapes).toHaveAttribute("aria-expanded", "false");
      await expect(colour).toHaveAttribute("aria-expanded", "true");
      const thickness = stage.getByRole("menuitemradio", { name: /^Thickness/ }).last();
      const thicknessName = await thickness.getAttribute("aria-label");
      await press(thickness);
      await expect(colour).toHaveAttribute("aria-expanded", "false");
      await press(colour);
      await expect(stage.getByRole("menuitemradio", { name: thicknessName! })).toBeChecked();
      await stage.locator(".draw-stage-room").click({ position: { x: 10, y: 10 } });
      await expect(colour).toHaveAttribute("aria-expanded", "false");
      await expect(stage.getByRole("menu")).toHaveCount(0);
      await stage.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(stage).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
}
