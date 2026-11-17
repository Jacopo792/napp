import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "napp:appearance:v1",
      JSON.stringify({
        theme: "light",
        accent: "#b4606d",
        background: "#f6eeee",
        foreground: "#2c2325",
        wallpaper: false,
      }),
    );
    localStorage.setItem("napp:spotlight-learned", "1");
  });
});

test("chat keeps sent messages, receives replies, and edits without losing the conversation", async ({
  page,
}, testInfo) => {
  await page.goto("/notes");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click({ position: { x: 4, y: 4 } });
  await page.locator("button[aria-label=Chat]").click();
  const chat = page.getByRole("complementary", { name: "Chat about this note" });
  await chat
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Can we review these notes tonight?");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  const sent = chat.locator(".chat-row").filter({ hasText: "Can we review these notes tonight?" });
  await expect(sent).toHaveCount(1);
  await expect(sent).not.toHaveClass(/is-sending|is-failed/);
  await expect(chat.locator(".chat-row").filter({ hasText: "Ok!" })).toBeVisible();
  await sent.hover();
  await sent.getByRole("button", { name: "More", exact: true }).click();
  await sent.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await sent
    .getByRole("textbox", { name: "Edit message", exact: true })
    .fill("These notes are ready for tonight.");
  await chat.getByRole("textbox", { name: "Edit message", exact: true }).press("Enter");
  await expect(chat.getByText("These notes are ready for tonight.", { exact: true })).toBeVisible();
  await chat.getByRole("button", { name: "Enlarge", exact: true }).click();
  const expanded = page.getByRole("dialog", { name: "Chat", exact: true });
  await expect(
    expanded.getByText("These notes are ready for tonight.", { exact: true }),
  ).toBeVisible();
  await expanded.getByRole("button", { name: "Make smaller", exact: true }).click();
  await expect(expanded).toBeHidden();
  await expect(chat.getByText("These notes are ready for tonight.", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("chat.png"), animations: "disabled" });
});

test("chat settings keep animal bubbles and quick reactions usable", async ({ page }, testInfo) => {
  await page.goto("/notes");
  const settings = page.locator(".settings-panel");
  await settings.getByRole("button", { name: "Chat", exact: true }).click();
  for (const name of ["Bunny", "Bear"]) {
    await settings.getByRole("radio", { name: new RegExp(`${name}$`) }).click();
    await expect(settings.getByRole("radio", { name: new RegExp(`${name}$`) })).toBeChecked();
  }
  await settings.locator(".chat-quick-emoji").first().click();
  const picker = settings.getByRole("dialog", { name: "Emoji", exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole("textbox", { name: "Search emoji" }).fill("bear");
  await picker.getByRole("button", { name: "🐻", exact: true }).click();
  await expect(settings.getByRole("radio", { name: "Change 🐻", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await settings.screenshot({
    path: testInfo.outputPath("chat-settings.png"),
    animations: "disabled",
  });
});

test("note details open from the row and return to the workspace", async ({ page }, testInfo) => {
  await page.goto("/notes");
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click({ position: { x: 4, y: 4 } });
  await page.locator("[data-note-row]").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Note info", exact: true }).click();
  const sheet = page.locator(".sheet");
  await expect(sheet).toBeVisible();
  await sheet.screenshot({ path: testInfo.outputPath("sheets.png"), animations: "disabled" });
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet).toBeHidden();
});
