import { expect, test } from "@playwright/test";

test("the public notice accepts a child-safety report without an account", async ({ page }) => {
  await page.goto("/?page=notice");
  await expect(page.getByRole("heading", { name: "Report illegal content" })).toBeVisible();
  await page.getByLabel("URL where the content appears").fill("https://example.test/item");
  await page.getByLabel("Why is the content illegal?").fill("Disposable preview notice.");
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("required", "");
  await page.getByLabel("This notice concerns child sexual abuse or exploitation.").check();
  await expect(page.getByLabel("Email", { exact: true })).not.toHaveAttribute("required", "");
  await page.getByLabel("I believe in good faith", { exact: false }).check();
  await page.getByRole("button", { name: "Submit notice" }).click();
  await expect(page.getByRole("status")).toContainText("Notice received.");
});

test("the DSA contact page displays the operator's address", async ({ page }) => {
  await page.goto("/?page=contact");
  await expect(page.getByRole("heading", { name: "Digital Services Act contact" })).toBeVisible();
  await expect(page.getByRole("link", { name: "support@nappnote.com" })).toHaveAttribute(
    "href",
    "mailto:support@nappnote.com",
  );
});
